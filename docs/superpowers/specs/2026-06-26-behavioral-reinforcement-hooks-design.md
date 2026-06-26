# Behavioral Reinforcement Hooks — Design

**Date:** 2026-06-26
**Status:** Approved
**Author:** bot-06 (Mirza)

## Problem

Behavioral skills rely on the AI self-firing them every relevant turn. When the AI is
absorbed in substantive work, secondary obligations get deprioritized ("forgotten"). A
real case: the `name-session` skill did step-1 (remind once) but skipped step-2 (offer a
name) because the AI was deep in teach-me. An audit found the same fragility in
`immediate-reply`, `inline-buttons`, and `bot-conduct` (channel discipline + commit
trailer). Root cause: obligations are injected once (or never) and fade under task
pressure; nothing mechanical keeps them in front of the AI.

Fix: add reinforcement **hooks** that move enforcement from "AI remembers" toward
"mechanism enforces", at a strength matched to each obligation's risk (mixed enforcement).

## Scope

Four components across two plugins. Out of scope (honest): `handoff` §1 (post-task
context check) — "a substantive task just finished" has no clean hook trigger; it is
judgment-only and cannot be mechanically enforced.

---

### Component 1 — Per-turn ambient reminder (telegram, UserPromptSubmit, NUDGE)

A `UserPromptSubmit` hook in the `telegram` plugin. On every prompt it inspects the
submitted text (stdin JSON, `prompt` field). It acts **only when the prompt is a Telegram
inbound** — detected by the presence of a `<channel source="...telegram...">` marker.
Non-telegram prompts → emit nothing (silent), so non-telegram sessions get no noise.

When it is a Telegram inbound, it injects a compact reminder block as `additionalContext`:

- immediate-reply: "If your response will make ANY tool call before the final answer,
  send a short ack via the reply tool BEFORE that first tool call."
- inline-buttons: "If your reply asks a question / offers options, attach `buttons`
  (min Yes/No + a manual-fallback)."
- channel discipline (AFK): "This conversation came from Telegram — the user is AFK and
  does NOT see your transcript. Answering via the reply tool is MANDATORY: send the final
  answer through reply when the task concludes, not only at the start." This is the
  per-turn backstop for the hardest forgetting case (acked early, forgot the final reply
  after long/background work), which Component 3 cannot catch mechanically without false
  positives.
- name-session (conditional): resolve the **current** session name (Component 2's
  authoritative read). If it is still `idle`, append: "Session still 'idle' — if the
  topic is now clear, offer a hyphenated name via buttons THIS turn (name-session step-2)."

This keeps the three highest-risk obligations in-window **every turn**, not just once.
It is a nudge (context only); it never blocks.

Restraint: one short block, telegram-inbounds only, and the idle line appears only while
the session is actually `idle`. The reminder text is intentionally terse and references
the owning skill so the skills remain the source of truth.

**Coupling note (accepted):** the hook lives in `telegram` but references obligations
owned by the `immediate-reply` / `inline-buttons` plugins. These plugins are always
installed together in this fleet; the coupling is acceptable and documented.

---

### Component 2 — Session-name accuracy fix (telegram)

The existing `SessionStart` hook (`hooks/session-name-context.ts`) resolves the name via
`readCurrentSessionId` → telegram name registry, which can lag a just-applied rename
(observed: it injected `"test-goal"` while the session was actually `idle`).

Fix: resolve the name by reading the wrapper's authoritative
`wrapper.current_session_name` file directly (the wrapper marks this file authoritative;
verified present, e.g. content `catur`). Add a small shared helper, e.g.
`readAuthoritativeSessionName(env): string | null`, used by both the SessionStart hook and
Component 1. Keep silent-degrade (no file → null → emit nothing). Resolution order:
read `wrapper.current_session_name` first (authoritative); fall back to the existing
sid→registry path ONLY when the authoritative file is absent (e.g. a non-wrapper setup).
This is strictly an accuracy improvement and preserves the old behavior where the new file
does not exist.

---

### Component 3 — Mandatory-reply Stop hook (telegram, block-once)

**Why this matters most:** when a question arrives via Telegram, the user is AFK and does
NOT see the transcript. Replying via the reply tool is mandatory. The most common failure
is forgetting the FINAL reply at the **end** of a task (often the turn that fires from a
subagent `task-notification`, not from the original inbound).

A `Stop` hook in the `telegram` plugin. The Stop event fires at a **concluding** stop —
the agent has no live background children (still-running subagents keep the turn alive, so
mid-task waits do not trip it). On that concluding stop the hook reads the transcript
(`transcript_path` from the hook stdin JSON) and decides:

- Is this a **Telegram-driven** conversation? (the transcript contains at least one
  `<channel source="...telegram...">` inbound)
- Find the latest Telegram inbound and the latest `reply` tool call. If **no `reply` call
  has occurred since the latest Telegram inbound**, the user is owed an answer.

If Telegram-driven AND a reply is owed → the hook **blocks the stop once** with a reason:
"This conversation is from Telegram and the user is AFK. You have not sent a reply since
their last message — send your answer via the reply tool now." Guard against loops with
the `stop_hook_active` flag: if it is already set, do NOT block again (allow the stop). So
at most one re-nudge per stop chain.

**Honest limitation:** if the AI sent an early **ack** reply after the inbound and then
forgot the final answer, the "reply since last inbound" test sees the ack and will NOT
block — that ack-but-no-final case is covered (softly) by Component 1's per-turn
channel-discipline reminder, not by this hook. This hook reliably catches the "inbound got
NO reply at all" case, which is the clean, false-positive-free signal.

---

### Component 4 — Commit-trailer PreToolUse hook (bot-conduct, BLOCKING)

`bot-conduct` is currently skill-only. Add a `hooks/` dir with a `PreToolUse` hook scoped
to the `Bash` tool. It inspects the command (stdin JSON, `tool_input.command`):

- If the command invokes `git commit` with an inline message (`-m` / heredoc) AND the
  message lacks an `Agent:` trailer (regex `/^Agent:\s*\S+/m` over the message) → **deny**
  the tool call (PreToolUse "deny" decision) with a reason: "bot-conduct requires an
  `Agent: <bot-name>` trailer on every commit. Add it and retry." The AI then retries with
  the trailer.
- Commits that already carry the trailer, and non-commit Bash commands → allow (emit
  nothing / approve).

Keep detection conservative: only act on commands clearly containing `git commit` with a
message. Amend/merge/other git operations are not blocked. False-positive risk is low and
the failure mode (a spurious block) is recoverable (the AI sees the reason).

This is the bot-conduct Rule-2 enforcement; it lives with the rule it enforces.

---

## Hook runtime & wiring

All hooks are bun `.ts` scripts (the repo standard; the existing telegram SessionStart
hook already runs under bun). Plugin hooks are auto-discovered from `<plugin>/hooks/hooks.json`
(verified against the real superpowers plugin — no `plugin.json` `"hooks"` key needed).
`telegram` gains `UserPromptSubmit` + `Stop` entries alongside its existing `SessionStart`.
`bot-conduct` gains a new `hooks/hooks.json` with a `PreToolUse` entry (matcher: `Bash`).

The exact stdin/stdout contracts for `UserPromptSubmit` (additionalContext), `Stop`
(block decision + `stop_hook_active`), and `PreToolUse` (deny decision) will be confirmed
in the plan's first step (dispatch `claude-code-guide` / official docs) before coding,
since this repo has only ever used a `SessionStart` hook.

## Testing

Each hook's pure decision logic is extracted into a testable function and unit-tested with
`bun:test` (mirroring `session-name-context.test.ts`):

- Telegram-inbound detection (true for `<channel source=...telegram...>`, false otherwise).
- `readAuthoritativeSessionName` (reads the file; null when absent) + idle check.
- Stop-hook decision: given a transcript-shaped input → block vs allow, across cases:
  Telegram-driven with no reply since the latest inbound (block); a reply exists after the
  latest inbound (allow); not Telegram-driven (allow); and `stop_hook_active` already set
  (allow, no second block).
- Commit-trailer detection: `git commit` with/without an `Agent:` trailer, and non-commit
  commands → allow.

The thin I/O wrappers (`main()` under `import.meta.main`) are verified by a manual run, as
with the SessionStart hook.

## Versioning

- `telegram`: bump (Components 1–3). 0.0.35-mirza.0 → 0.0.36-mirza.0.
- `bot-conduct`: bump (Component 4). 0.0.6 → 0.0.7.
- Update each plugin's marketplace.json description and README rows.

## Risks

- **Context noise:** Component 1 adds a per-turn block on telegram inbounds. Mitigated by
  terseness + telegram-only firing + conditional idle line.
- **Stop-hook loop:** mitigated by `stop_hook_active` (block at most once).
- **Commit-hook false positive:** conservative matching; spurious block is recoverable.
- **Hook contract uncertainty:** retired by the plan's Step-0 verification before coding.
