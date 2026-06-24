# Telegram `/goal` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram `/goal` command that lets the AI author and set a Claude Code goal — interviewing/discussing with the user, drafting a verifiable condition, confirming it with inline buttons, then injecting CC's built-in `/goal` to run the autonomous loop.

**Architecture:** `/goal` is a Telegram slash command **forwarded to the Claude Code session** (exactly like `/handoff`): it is listed in the telegram `commands-registry.ts` but is NOT a meta-command, so the server forwards the text to the AI. A new dedicated `plugins/goal/` plugin provides a `goal` skill (the brain) that drives the interview → draft → confirm → inject flow. The autonomous loop engine is CC's **built-in** `/goal`, injected by the skill via `pty_send_slash`. A best-effort `goal-state.json` tracks the active goal per session.

**Tech Stack:** TypeScript + Bun (`bun test`) for the telegram plugin; Markdown for the plugin manifest and skill. MCP tools used by the skill at runtime: the telegram `reply` tool (with `buttons`) and pty-controller `pty_send_slash`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-24-telegram-goal-command-design.md` — this plan implements it; read it first.
- **Forwarded, not meta:** do NOT add `/goal` to `tryRouteMetaCommand` in `meta-commands.ts`. Registry entry only.
- **No `commands/goal.md`:** a custom `/goal` command is shadowed by CC's built-in `/goal`. The skill triggers via its `description` frontmatter on the forwarded text.
- **Condition cap ~240 chars** when injected via `pty_send_slash` (tool caps the argument at 256).
- **No changes** to `server.ts` / `meta-commands.ts` (forwarding, `reply` buttons, `ai:*` callbacks, and `pty_send_slash` already exist).
- **Engine = CC built-in `/goal`**, reached only via `pty_send_slash` (PTY keystroke path).
- **Execution hygiene (bot rules):** work in a git worktree, not `main` (use the `superpowers:using-git-worktrees` skill). Sign commits with the bot identity (`Agent: <bot-name>` trailer per bot-conduct). **Do not run any `git commit` until the user (Mirza) approves** — the commit steps below are written out, but gate each on his OK.

---

### Task 1: Spike — verify forwarded `/goal` does not trigger CC's built-in

**Why first:** The whole approach rests on the assumption that Telegram-**forwarded** `/goal` text reaches the AI as readable content and does NOT auto-fire CC's built-in `/goal`. If that assumption is false, the design changes (fallback: a thin meta-command that forwards a non-colliding trigger phrase). De-risk before building anything.

**Files:** none (live verification).

- [ ] **Step 1: Ensure the bot + wrapper are running** for a paired test session.

- [ ] **Step 2: From Telegram, send the literal text** `/goal` to the paired bot.

- [ ] **Step 3: Observe what happens in the CC session.**
  - Expected (assumption holds): the AI receives `/goal` as a normal message turn and responds in conversation (no goal is silently set; no `◎ /goal active` indicator appears on its own).
  - Failure (assumption false): CC's built-in `/goal` fires — e.g. it prints goal status / starts an autonomous loop without the skill running.

- [ ] **Step 4: Confirm injection works the other way.** In the CC session, call `pty_send_slash` with `command: "/goal test condition, or stop after 1 turn"` and confirm the built-in `/goal` activates (status indicator appears), then clear it with `pty_send_slash` `command: "/goal clear"`.

- [ ] **Step 5: Record the finding** as a short note appended to the spec's "Risks" section (replace the "must be verified" wording with the confirmed result). If the assumption FAILED, STOP and revise the spec to the meta-command fallback before continuing.

**Deliverable:** a confirmed yes/no on the forwarding assumption, recorded in the spec. Proceed to Task 2 only if it holds (or after adopting the fallback).

---

### Task 2: Register `/goal` in the telegram command registry

**Files:**
- Modify: `plugins/telegram/commands-registry.ts` (add a `CommandSpec` after the `handoff` entry)
- Test: `plugins/telegram/commands-registry.test.ts` (update the exact-list assertions)

**Interfaces:**
- Consumes: the existing `CommandSpec` type and `COMMANDS` array.
- Produces: a new `goal` entry with `audience: 'paired'`, surfaced automatically by `commandsFor`, `toSetMyCommandsPayload`, `renderHelpList`, `renderHelpDetail`.

- [ ] **Step 1: Update the failing tests first.** In `commands-registry.test.ts`, insert `'goal'` immediately after `'handoff'` in BOTH hardcoded lists — the `COMMANDS` order test (currently 10 names) and the `commandsFor('paired')` test (currently 9 names) — and in the `toSetMyCommandsPayload('paired')` list. Also update the description "contains exactly the 10 commands" → "11 commands".

```ts
// COMMANDS order test — new expected array:
expect(COMMANDS.map(c => c.name)).toEqual([
  'context', 'switch', 'new', 'rename', 'delete',
  'effort', 'version', 'handoff', 'goal', 'help', 'start',
])

// commandsFor('paired') test — new expected array:
expect(commandsFor('paired').map(c => c.name)).toEqual([
  'context', 'switch', 'new', 'rename', 'delete',
  'effort', 'version', 'handoff', 'goal', 'help',
])
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `cd plugins/telegram && bun test commands-registry.test.ts`
Expected: FAIL — the actual `COMMANDS` list lacks `'goal'`, so the `.toEqual` array assertions mismatch.

- [ ] **Step 3: Add the `goal` CommandSpec.** In `commands-registry.ts`, insert this entry in the `COMMANDS` array immediately AFTER the `handoff` entry (lines ~108) and BEFORE `help`:

```ts
{
  name: 'goal',
  audience: 'paired',
  menuHint: 'Set an AI-authored goal to chase',
  helpSummary: 'Let the AI author & track a goal until done',
  helpDetail:
    'Sets a goal the AI works toward autonomously. Unlike /new or /switch, this is NOT a ' +
    'meta-command: the text "/goal" is forwarded to the Claude session, where the AI runs the ' +
    'goal skill. The AI discusses what you want to achieve (interviewing you if context is ' +
    'unclear; you can cancel anytime), drafts a precise, verifiable condition, and shows it for ' +
    'approval with [Ya]/[Tidak]/[Jelaskan manual] buttons. On approval it sets the goal (CC\'s ' +
    'built-in /goal engine) and keeps working until an independent evaluator confirms the ' +
    'condition is met. Send /goal again while one is running to see it and stop it. Requires the ' +
    'mirza-cc wrapper.',
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `cd plugins/telegram && bun test commands-registry.test.ts`
Expected: PASS — `goal` is now present, `menuHint` is under 50 chars, audience valid, hints non-empty.

- [ ] **Step 5: Run the full telegram test suite** to confirm nothing else asserted on the command count.

Run: `cd plugins/telegram && bun test`
Expected: PASS (or surface any other test that hardcodes the command list — update it the same way).

- [ ] **Step 6: Commit** (gate on Mirza's approval).

```bash
git add plugins/telegram/commands-registry.ts plugins/telegram/commands-registry.test.ts
git commit -m "feat(telegram): register /goal as a forwarded command

Agent: bot-04"
```

---

### Task 3: Scaffold the `goal` plugin and register it in the marketplace

**Files:**
- Create: `plugins/goal/.claude-plugin/plugin.json`
- Create: `plugins/goal/README.md`
- Modify: `.claude-plugin/marketplace.json` (append the `goal` plugin to the `plugins` array)

**Interfaces:**
- Produces: a discoverable plugin named `goal` whose `skills/goal/SKILL.md` (added in Task 4) is loadable by Claude Code.

- [ ] **Step 1: Create `plugins/goal/.claude-plugin/plugin.json`:**

```json
{
  "name": "goal",
  "description": "AI-authored Claude Code goals, driven from Telegram. /goal is forwarded to the AI, which discusses the objective with the user (interviewing if needed; cancellable), drafts a precise, transcript-verifiable condition (<=~240 chars, bounded), confirms it with [Ya]/[Tidak]/[Jelaskan manual] inline buttons, then injects CC's built-in /goal via pty_send_slash to run the autonomous evaluator loop. Sending /goal while a goal runs shows it and offers to stop it. Best-effort goal-state.json per session. No custom /goal command (shadowed by the built-in); the skill triggers via its description.",
  "version": "0.0.1",
  "author": {
    "name": "Mirza"
  },
  "keywords": [
    "goal",
    "telegram",
    "autonomous",
    "evaluator",
    "skill"
  ]
}
```

- [ ] **Step 2: Create `plugins/goal/README.md`** with a short overview (what `/goal` does, the forwarded-command + built-in-engine architecture, the dependency on the telegram + pty-controller plugins and the mirza-cc wrapper). 10–25 lines; prose, no code required.

- [ ] **Step 3: Register the plugin** in `.claude-plugin/marketplace.json` — append to the `plugins` array (after the `handoff` entry, keeping JSON valid):

```json
{
  "name": "goal",
  "description": "AI-authored Claude Code goals from Telegram. /goal is forwarded to the AI, which discusses the objective, drafts a verifiable condition, confirms via inline buttons, then injects CC's built-in /goal to run the autonomous loop. Shows + stops a running goal. Depends on telegram + pty-controller + the mirza-cc wrapper.",
  "category": "productivity",
  "source": "./plugins/goal"
}
```

- [ ] **Step 4: Validate the manifest JSON parses.**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); JSON.parse(require('fs').readFileSync('plugins/goal/.claude-plugin/plugin.json','utf8')); console.log('ok')"`
Expected: prints `ok` (no JSON syntax error).

- [ ] **Step 5: Commit** (gate on Mirza's approval).

```bash
git add plugins/goal/.claude-plugin/plugin.json plugins/goal/README.md .claude-plugin/marketplace.json
git commit -m "feat(goal): scaffold goal plugin and register in marketplace

Agent: bot-04"
```

---

### Task 4: Author the `goal` skill (the brain)

**Files:**
- Create: `plugins/goal/skills/goal/SKILL.md`

**REQUIRED SUB-SKILL:** Use `superpowers:writing-skills` to author and self-verify this skill.

**Interfaces:**
- Consumes (runtime MCP tools): telegram `reply` (with `buttons`), pty-controller `pty_send_slash`, and the AI's file Read/Write for `goal-state.json`.
- Produces: behavior matching the spec's "Behavior" and "State" sections exactly.

- [ ] **Step 1: Write the frontmatter** so the skill auto-activates on the forwarded `/goal` and on goal-worthy moments:

```markdown
---
name: goal
description: Use when the user sends /goal via Telegram, asks you to set/track a goal or "jadikan ini goal", or when you detect a long-running, verifiable task worth pursuing autonomously. Authors a precise Claude Code goal with the user, confirms it, and sets CC's built-in /goal. Also handles showing/stopping a goal that is already running.
---
```

- [ ] **Step 2: Write the body**, encoding the spec's behavior verbatim into mandatory sections. Cover, in order:
  1. **When this runs** — the three entry points (user asks / AI offers proactively / user types `/goal`), and that on `/goal` with unclear context you interview first; the user can cancel anytime.
  2. **Already-running check FIRST** — before drafting, determine whether a goal is active for this session (primary: your own session awareness that you recently set a goal not yet reported "achieved"; backup: read `goal-state.json` keyed by current session id). If active, show the running goal + `reply` buttons `[⛔ Hentikan](goal_stop)` / `[↩️ Biarkan jalan](goal_keep)`. `goal_stop` → `pty_send_slash` `/goal clear` + mark state `cleared`. Phrase as "menurut catatan…" to stay honest about staleness. Do NOT start a new draft when one is running.
  3. **Interview (only if context unclear)** — ask focused questions toward a concrete, transcript-verifiable end-state. Cancellable.
  4. **Draft the condition** — rules: ONE measurable end-state; verifiable from the transcript (good: "semua test di test/auth lulus & lint bersih"; bad: "kodenya bagus"); concise (≤~240 chars — hard requirement for injection); bounded (add a stop clause like "…atau berhenti setelah 20 turn" when looping risk exists).
  5. **Confirm gate (mandatory)** — `reply` with the drafted condition + buttons `[✅ Ya](goal_yes)` / `[❌ Tidak](goal_no)` / `[✏️ Jelaskan manual](goal_manual)`. Branch: `goal_yes` → set; `goal_no` → abort, nothing injected; `goal_manual` → take the user's revision and loop back to draft.
  6. **Set the goal** — `pty_send_slash` `command: "/goal <condition>"`; then write `goal-state.json` (`{ "<sessionId>": { condition, status:"active", startedAt } }`); reply a short confirmation. Note the 256-char cap; if the condition would exceed it, tighten it (do not silently truncate).
  7. **After setting** — CC drives the loop; each turn streams to Telegram via the bridge; on completion CC reports "achieved" (update state to `achieved` opportunistically next time you run).
  8. **Failure handling** — if `pty_send_slash` fails (wrapper down), tell the user the goal could not be set (mirror `/effort`/`/rename` posture).

- [ ] **Step 3: Self-verify with writing-skills** — run the writing-skills checks (no placeholders, the description's trigger conditions are concrete, button callback_ids are unique within each `reply`, the flow has no dead ends). Fix inline.

- [ ] **Step 4: Commit** (gate on Mirza's approval).

```bash
git add plugins/goal/skills/goal/SKILL.md
git commit -m "feat(goal): author the goal skill (interview, draft, confirm, inject)

Agent: bot-04"
```

---

### Task 5: End-to-end scenario verification

**Files:** none (live verification against the running bot in the worktree's session).

Walk each scenario; each must behave as written before calling the feature done.

- [ ] **Scenario 1 — fresh `/goal`, no context:** send `/goal`. Expected: AI interviews you; you provide an end-state; AI drafts a condition; `[Ya]/[Tidak]/[Jelaskan manual]` buttons appear. Tap `Tidak` → nothing is set.
- [ ] **Scenario 2 — discuss then ask:** chat about a task ("benerin semua test auth"), then say "jadikan ini goal". Expected: AI drafts directly (no interview) and shows the confirm buttons.
- [ ] **Scenario 3 — approve:** on a draft, tap `Ya`. Expected: AI injects `/goal <condition>` (built-in activates), writes `goal-state.json`, confirms; the loop runs and streams turns to Telegram.
- [ ] **Scenario 4 — manual revise:** on a draft, tap `Jelaskan manual`, type a revised condition. Expected: AI re-drafts from your text and re-shows the confirm buttons.
- [ ] **Scenario 5 — already running:** while a goal is active, send `/goal`. Expected: AI shows the running goal + `[Hentikan]/[Biarkan jalan]`; `Hentikan` injects `/goal clear` and updates state.
- [ ] **Step 6: Record results** — note any scenario that misbehaved and loop back to Task 4 to adjust the skill wording. When all five pass, the feature is complete.

---

## Notes for the executor

- The bulk of the behavior lives in the **skill prose** (Task 4), which is not unit-testable — Task 5's scenarios are its test suite. Budget iteration time there.
- Keep `goal-state.json` writes atomic-ish (write a temp then rename) if you extract any helper, but for MVP the skill writing the file directly is acceptable.
- If Task 1's assumption fails, the fallback (telegram meta-command forwarding a non-colliding trigger phrase) re-introduces a `meta-commands.ts` change and a handler — re-plan Tasks 2–3 accordingly before proceeding.
