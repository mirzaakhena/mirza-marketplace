# Telegram `/goal` Command (AI-authored goals)

**Date:** 2026-06-24
**Affects:** `plugins/telegram/commands-registry.ts` (+1 entry), a new **goal skill** (recommended: `plugins/goal/skills/goal/SKILL.md`, parallel to the handoff plugin), and a per-session state file `goal-state.json`. No changes to `server.ts` / `meta-commands.ts` forwarding.
**Status:** Draft — pending user review

## Motivation

Claude Code ships a built-in `/goal <condition>` command: it sets a persistent completion condition that an independent evaluator (a small fast model) checks after every turn, auto-looping the agent until the condition is verified, then auto-clears as "achieved". (See `https://code.claude.com/docs/en/goal`.)

The value we want on Telegram is **not** to let the user type a raw CC `/goal` from their phone. It is to let the **AI author the goal**: the user describes intent (or the AI notices a goal-worthy task), the AI and user converge on a *precise, verifiable* condition through dialogue, the AI shows the drafted condition for approval, and only then does the AI set the goal on the user's behalf.

This matters because writing a *good* `/goal` condition is itself a skill — it must be one measurable end-state, verifiable from the transcript, and bounded. Letting the AI craft it bridges "fuzzy user intent" → "an evaluable goal condition". The user stays in control via an explicit approval step.

The chosen architecture mirrors the existing `/handoff` command: `/goal` is a Telegram slash command that is **forwarded to the Claude Code session**, where the AI runs a skill. The autonomous loop engine remains CC's **built-in** `/goal`, which the AI injects via `pty_send_slash` after approval.

## Out of scope

- **Re-implementing the evaluator loop** at the Telegram/server layer (the rejected "native" approach). We reuse CC's built-in `/goal` as the engine. No model access or loop code lives in the plugin.
- **A guaranteed-fires proactive trigger via hooks.** Per decision, the proactive offer is best-effort (driven by the skill's description), and the explicit `/goal` command is the deterministic safety net. A hook can be added later if proactive offers are missed too often.
- **Rich progress UI on Telegram** (per-evaluation notifications, status command, `/status` integration). MVP relies on the existing bridge: each autonomous turn already streams the AI's output to Telegram, so progress is visible naturally, and completion arrives as the CC "achieved" message.
- **Modifying CC's `/goal` semantics.** This spec only adds a Telegram → skill → CC routing path; CC's goal behavior is untouched.

---

## Behavior

### Entry points (three start paths, all valid)

The skill is the brain. It is engaged when:

1. **User asks during dialogue** — "jadikan ini goal", after some discussion. The AI already has context → goes straight to drafting (step B below).
2. **AI offers proactively** — when the AI detects a long-running, verifiable task, it offers: "mau aku jadikan goal?" (best-effort; not guaranteed).
3. **User types `/goal`** — forwarded to the session, the AI runs the goal skill.
   - If there is **already clear context** for what to achieve → draft directly (step B).
   - If context is **unclear** → the AI **interviews** the user (step A) to establish the desired end-state. The user may **cancel** the interview at any time (e.g. "batal" or the cancel button), which aborts without setting anything.

### Step A — Interview (only when context is unclear)

The AI asks focused questions to pin down: what concrete end-state defines "done", and how it can be verified (a test passing, a build exit code, a file/queue count, etc.). The AI must steer toward something **mechanically checkable from the transcript** — not subjective ("kodenya bagus"). The user can cancel at any point.

### Step B — Draft & confirm the condition (mandatory gate)

Before injecting anything, the AI:

1. Composes a candidate `<condition>` that is:
   - **One measurable end-state**, verifiable from the transcript.
   - **Concise** — soft cap ~240 characters (see the injection-limit risk below).
   - **Bounded** — SHOULD include a stop clause where natural, e.g. "…atau berhenti setelah 20 turn", to avoid an unverifiable goal looping forever.
2. Presents the drafted condition to the user with inline buttons (via the `reply` tool's `buttons`):

   > 🎯 Usulan goal:
   > "<condition>"
   >
   > Jadikan goal?
   > [ ✅ Ya ] [ ❌ Tidak ] [ ✏️ Jelaskan manual ]

   Callback IDs: `goal_yes`, `goal_no`, `goal_manual`.
3. Branches on the tap:
   - **Ya (`goal_yes`)** → proceed to Step C.
   - **Tidak (`goal_no`)** → abort; reply "Oke, nggak jadi diset." Nothing is injected.
   - **Jelaskan manual (`goal_manual`)** → invite the user to revise in free text, then loop back to step B with the revised condition.

### Step C — Set the goal (inject CC built-in `/goal`)

On approval the AI:

1. Calls `pty_send_slash` with `command: "/goal <condition>"` to inject the **built-in CC** `/goal` into its own session. CC's evaluator loop then runs autonomously.
2. Writes/updates `goal-state.json` (see State) marking this session's goal `active` with the condition and start time.
3. Replies a short confirmation: "✅ Goal di-set. Aku kerjakan sampai kondisinya terpenuhi."

From here, CC drives the loop. Each turn's output flows to Telegram through the existing bridge; on completion CC auto-clears and reports "achieved".

### `/goal` while a goal is already running

When `/goal` is forwarded and a goal is active **for the current session**, the skill does NOT start a new drafting flow. Instead it:

1. Shows the running goal: its condition and (if known) how long it has been running.
2. Offers to stop it with inline buttons:

   > ⏳ Goal sedang berjalan:
   > "<condition>"
   > [ ⛔ Hentikan ] [ ↩️ Biarkan jalan ]

   Callback IDs: `goal_stop`, `goal_keep`.
3. **Hentikan (`goal_stop`)** → inject `pty_send_slash` `command: "/goal clear"`, update `goal-state.json` to `cleared`, confirm.
   **Biarkan jalan (`goal_keep`)** → reply "Oke, dibiarkan lanjut."

**Determining "is a goal active?"** — the skill uses two signals, preferring live awareness:
- **Primary:** the session's own context — the AI knows whether it recently set a goal that has not yet reported "achieved".
- **Backup:** `goal-state.json`.
If the file says `active` but the goal has actually already auto-achieved (CC cleared it without re-invoking the skill), the "Hentikan" action is a safe no-op (`/goal clear` on no active goal does nothing). The skill should phrase the prompt as "menurut catatan…" to stay honest about possible staleness.

---

## State

A single best-effort file, written and read by the skill (the AI) directly via its file tools — no plugin code required.

- **Path:** `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram/goal-state.json`
- **Shape:** keyed by session id so switching sessions never shows the wrong goal:

  ```json
  {
    "<sessionId>": {
      "condition": "semua test di test/auth lulus & lint bersih, atau berhenti setelah 20 turn",
      "status": "active",
      "startedAt": "2026-06-24T15:50:00.000Z"
    }
  }
  ```
- **Lifecycle:** set to `active` on inject (Step C); set to `cleared` on Hentikan; set to `achieved` opportunistically when the skill next observes the goal completed. Staleness is tolerated (see above).
- **Why best-effort:** CC auto-clears on achievement without calling back into the skill, so the file cannot be authoritative. It is a hint, not a source of truth.

---

## Files to touch

| File | Change |
|------|--------|
| `commands-registry.ts` | Append a `CommandSpec` for `goal` (audience: `paired`). Like `/handoff`, it is **documented in the registry but intentionally NOT added to `tryRouteMetaCommand`**, so it falls through and is forwarded to the AI. `/help` and `setMyCommands` pick it up automatically. The `helpDetail` states it is not a meta-command and explains the AI-authored flow. |
| `commands-registry.test.ts` | Add an expectation that the `goal` entry exists with the right audience/shape (mirrors how other entries are asserted, if at all). |
| **New: `plugins/goal/` plugin** | A dedicated plugin parallel to `plugins/handoff/`: `.claude-plugin/plugin.json` (name `goal`, author Mirza, keywords), `skills/goal/SKILL.md` (the brain), `README.md`. **Deliberately NO `commands/goal.md`** — a custom `/goal` command would be shadowed by CC's built-in `/goal` (built-in takes precedence). The skill is triggered instead by its `description` frontmatter when the AI reads the forwarded `/goal` text. |
| `.claude-plugin/marketplace.json` | Register the new `goal` plugin in the `plugins` array (source `./plugins/goal`). |
| **`skills/goal/SKILL.md`** | The brain. Encodes: the three entry points, interview + cancel, condition-quality rules (measurable, transcript-verifiable, concise ≤~240 chars, bounded), the `[Ya]/[Tidak]/[Jelaskan manual]` confirm gate, the inject-via-`pty_send_slash` step, `goal-state.json` read/write, and the already-running → `[Hentikan]/[Biarkan jalan]` flow. |
| `goal-state.json` | No code change — created/maintained by the skill at runtime. Listed here for visibility. |
| `server.ts` / `meta-commands.ts` | **No change.** Forwarding of unknown slash commands to the AI, the `reply` tool with `buttons`, the `ai:*` callback round-trip, and `pty_send_slash` self-injection all already exist. |

---

## Testing plan

Most logic lives in the skill (prompt-driven, AI-run), which is not unit-testable in the traditional sense. Coverage:

- **`commands-registry.test.ts`** — assert the `goal` entry is present (name, `audience: 'paired'`, non-empty hints/detail).
- **Skill verification** (per the `writing-skills` skill) — scenario walk-throughs, not unit tests:
  1. `/goal` with no prior context → AI interviews, then drafts, then confirm buttons appear.
  2. `/goal` after a discussion that already implies a goal → AI drafts directly (no interview).
  3. Confirm gate: `goal_yes` injects `/goal <condition>` and writes state; `goal_no` injects nothing; `goal_manual` loops back with a revised condition.
  4. `/goal` while a goal is active → shows running goal + `[Hentikan]/[Biarkan jalan]`; `goal_stop` injects `/goal clear`.
  5. Interview cancellation aborts cleanly with nothing set.
- **If a `goal-state.json` helper module is later extracted** into plugin code, unit-test its atomic read/write/keying then.

---

## Risks & mitigations

- **Collision with CC's built-in `/goal` (load-bearing assumption — CONFIRMED 2026-06-24).** CC ships a built-in `/goal`; a custom command of the same name is shadowed. This design assumes that Telegram-**forwarded** `/goal` text arrives as **AI-readable message content** (via the `notifications/claude/channel` MCP path) and is therefore NOT executed by CC's TUI slash-command parser — so it does not auto-trigger the built-in. Only the deliberate `pty_send_slash` injection of `/goal <condition>` (PTY keystroke path) reaches the built-in, which is exactly what we want for the engine. **Verified (spike, plan Task 1):** (a) the environment runs CC v2.1.187 ≥ 2.1.139, so the built-in `/goal` exists; (b) the wiring map shows forwarded commands go through `mcp.notification` (conversation content) while only meta-commands use `writeWrapperCommand` (PTY input) — and in practice every inbound Telegram message reaches the agent as `<channel>…</channel>` content, not as a TUI keystroke, so the slash parser never sees it. A live end-to-end smoke (actually sending `/goal` once the plugin is installed) is still part of Task 5. Fallback if the live smoke ever contradicts this: make `/goal` a thin telegram meta-command that forwards a non-colliding trigger phrase instead of the literal `/goal`.
- **`pty_send_slash` argument cap (256 chars).** The `pty_send_slash` MCP tool validates the argument at ≤256 chars, while CC's `/goal` accepts up to 4000. Mitigation: the skill caps drafted conditions at ~240 chars (good practice anyway — crisp conditions are better). If a longer condition is genuinely needed, fall back to writing the wrapper pending file directly (`.claude/channels/pty-controller/pending/<UUID>.json` with `{type:'slash', command}`), which has no such cap. Flagged as the main implementation gotcha.
- **Stale `goal-state.json`.** CC auto-clears on achievement without re-invoking the skill, so the file can say `active` after the goal is done. Mitigation: prefer the session's live awareness; phrase prompts as "menurut catatan…"; `/goal clear` on an already-cleared goal is a safe no-op.
- **Proactive offer is best-effort.** By design (no hook). The explicit `/goal` command is the deterministic fallback. Revisit with a light hook if misses are frequent.
- **Unverifiable condition → goal never completes.** A condition the evaluator can't confirm from the transcript would loop forever. Mitigation: skill condition-quality rules + recommended stop clause ("…atau berhenti setelah N turn").
- **Wrapper not running.** `pty_send_slash` requires the mirza-cc wrapper. Mitigation: the skill detects the failure and tells the user the goal could not be set (same posture as `/effort`/`/rename`).
- **Concurrency.** If a goal loop is mid-flight and the user sends `/goal`, the message queues until the current turn yields; the skill then runs the already-running branch. Acceptable.

---

## Open questions

1. **Skill location** — RESOLVED: dedicated `plugins/goal/` plugin parallel to `plugins/handoff/` (matches the handoff precedent; registered in `marketplace.json`).
2. **Long-condition fallback** — adopt the direct pending-file write now, or defer until a real >240-char need appears? Recommendation: defer; cap at ~240 for MVP.
3. **Server-side goal awareness** — should the plugin later read `goal-state.json` to show goal status in `/status`? Out of scope for MVP; noted as a future enhancement.
