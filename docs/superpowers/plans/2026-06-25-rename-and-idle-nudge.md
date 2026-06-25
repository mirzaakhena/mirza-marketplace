# Rename UX + Idle-Session Naming Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Telegram `/rename` command (show old→new, reject spaces) and add a behavioral nudge that gets `idle` sessions named.

**Architecture:** Two independent features in the `telegram` plugin. Feature A is pure handler logic in `meta-commands.ts` (+ tests). Feature B is a SessionStart hook (reliable name detection) plus a behavioral skill that nudges and self-applies a rename via `pty_send_slash`.

**Tech Stack:** TypeScript run on **bun**, `bun:test` for tests, Claude Code plugin hooks/skills.

## Global Constraints

- Runtime is **bun** — hook and source files are `.ts`, run via `bun`. Tests use `bun:test`.
- Session names must contain **no spaces**; AI-generated names are **hyphenated** (e.g. `discuss-mcp`).
- `/rename` is **not** a pty-controller telegram-layer reject (only `/new`, `/switch`, `/delete`, `/effort` are), so self-injection via `pty_send_slash /rename <name>` is allowed.
- Telegram state dir: `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram`. Pty state dir: `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller`.
- Reuse existing helpers — do not reimplement: `resolveCurrentSessionName(sid, telegramStateDir)` and `readCurrentSessionId(env)` from `current-session-info.ts`; `resolveStateDir(env)` from `state-path.ts`; `setName` from `session-names-registry.ts`.
- Namespace consolidation (`mirza:*`) is **out of scope**.
- Git: work in the `feat/rename-and-idle-nudge` worktree. Sign commits with `Agent: bot-06` trailer + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Follow three-copy discipline: commit in the canonical workspace clone; push the release commit.
- Run all telegram tests with: `cd plugins/telegram && bun test meta-commands.test.ts` (and the new hook test file).

---

### Task 1: `/rename` shows `from "old" to "new"` (with safe fallback)

**Files:**
- Modify: `plugins/telegram/meta-commands.ts` (handler `handleRenameDirect`, ~line 420–476; imports ~line 31–37)
- Test: `plugins/telegram/meta-commands.test.ts`

**Interfaces:**
- Consumes: `resolveCurrentSessionName(sessionId: string | null, telegramStateDir: string): string | null` from `./current-session-info.ts`; existing locals in the handler: `currentSid` (line 448), `telegramStateDir` (line 449).
- Produces: success reply string `✏️ Renaming session from "<old>" to "<new>".`, or fallback `✏️ Renaming session to "<new>".` when no old name is registered.

- [ ] **Step 1: Write the failing tests**

Add to `plugins/telegram/meta-commands.test.ts` (inside the `describe('meta-commands: tryRouteMetaCommand', …)` block; `registrySetName` and `mkdirSync` are already imported):

```ts
test('/rename reply shows from "old" to "new" when an old name is registered', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const sid = 'sess-abc123'
  writeFileSync(join(stateDir, 'wrapper.current_session_id'), sid)
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'old-name')
  const consumed = await tryRouteMetaCommandT('/rename new-name', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toBe('✏️ Renaming session from "old-name" to "new-name".')
})

test('/rename falls back to "to <new>" form when no old name is registered', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/rename solo-name', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toBe('✏️ Renaming session to "solo-name".')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts -t "from \"old\" to \"new\""`
Expected: FAIL — current reply is `✏️ Renaming session to "new-name".` (no `from`).

- [ ] **Step 3: Add the import**

In `plugins/telegram/meta-commands.ts`, add to the existing import from `./current-session-info.ts` if present, else add a new import near line 37:

```ts
import { resolveCurrentSessionName } from './current-session-info.ts'
```

- [ ] **Step 4: Resolve old name and build the message**

In `handleRenameDirect`, replace the final reply block (currently lines ~471–474):

```ts
  if (currentSid && telegramStateDir) {
    registrySetName(telegramStateDir, currentSid, newName)
  }
  await handlers.reply(`✏️ Renaming session to "${newName}".`)
  return true
```

with:

```ts
  // Resolve the OLD name BEFORE overwriting it in the registry, so the
  // confirmation can read "from <old> to <new>".
  const oldName =
    currentSid && telegramStateDir
      ? resolveCurrentSessionName(currentSid, telegramStateDir)
      : null
  if (currentSid && telegramStateDir) {
    registrySetName(telegramStateDir, currentSid, newName)
  }
  await handlers.reply(
    oldName
      ? `✏️ Renaming session from "${oldName}" to "${newName}".`
      : `✏️ Renaming session to "${newName}".`,
  )
  return true
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts`
Expected: the two new tests PASS. (Some pre-existing space-using tests still pass here — they are updated in Task 2.)

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): /rename shows from <old> to <new>"
```

---

### Task 2: Reject `/rename` names containing spaces

**Files:**
- Modify: `plugins/telegram/meta-commands.ts` (`handleRenameDirect`, the sanitise/empty-check block ~line 423–430)
- Test: `plugins/telegram/meta-commands.test.ts` (add one test; update two existing space-using tests)

**Interfaces:**
- Consumes: `sanitised` local (CR/LF already collapsed to single spaces, trimmed) computed at ~line 423.
- Produces: rejection reply `⚠️ Nama session tidak boleh mengandung spasi. Pakai tanda hubung, mis. /rename discuss-mcp.`; when rejected, **no** wrapper command is written and the registry is untouched.

- [ ] **Step 1: Write the failing test + update the two conflicting tests**

Add this new test:

```ts
test('rejects /rename name containing a space', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/rename discuss mcp', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toMatch(/spasi/i)
  expect(listPending(stateDir).length).toBe(0)
})
```

Update the existing test `'writes /rename <name> command to wrapper when fresh'` — replace its space name with a hyphenated one:

```ts
  const consumed = await tryRouteMetaCommandT('/rename discuss-mcp', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toMatch(/Renaming/i)
  const pending = listPending(stateDir)
  expect(pending.length).toBe(1)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  expect(payload.command).toBe('/rename discuss-mcp')
```

Replace the existing test `'strips newlines from /rename name (PTY injection safety)'` entirely — a newline collapses to a space, which is now rejected:

```ts
test('rejects /rename name with a newline (collapses to a space, then rejected)', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/rename discuss\nMCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toMatch(/spasi/i)
  expect(listPending(stateDir).length).toBe(0)
})
```

- [ ] **Step 2: Run the tests to verify the new/updated ones fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts -t "spasi"`
Expected: FAIL — spaces are currently accepted, so no `spasi` rejection and a pending command IS written.

- [ ] **Step 3: Add the space-reject guard + fix the usage hint**

In `handleRenameDirect`, the empty-name guard currently reads (~line 424–429):

```ts
  if (sanitised.length === 0) {
    await handlers.reply(
      '⚠️ /rename needs a new name. Example: /rename discuss MCP',
    )
    return true
  }
  const newName = sanitised.slice(0, 64)
```

Change the example to a hyphenated one and add the space guard immediately after the empty check:

```ts
  if (sanitised.length === 0) {
    await handlers.reply(
      '⚠️ /rename needs a new name. Example: /rename discuss-mcp',
    )
    return true
  }
  if (/\s/.test(sanitised)) {
    await handlers.reply(
      '⚠️ Nama session tidak boleh mengandung spasi. Pakai tanda hubung, mis. /rename discuss-mcp.',
    )
    return true
  }
  const newName = sanitised.slice(0, 64)
```

- [ ] **Step 4: Run the full test file to verify all pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts`
Expected: PASS — including Task 1's tests, the new space-reject test, the updated hyphenated test, and the updated newline test.

- [ ] **Step 5: Check `/rename` help text for stale space example**

Run: `grep -n "discuss MCP\|discuss mcp\|rename.*example" plugins/telegram/commands-registry.ts`
If a space-containing example appears in the `/rename` `helpDetail`, change it to `/rename discuss-mcp`. If none, no change.

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts plugins/telegram/commands-registry.ts
git commit -m "feat(telegram): reject /rename names containing spaces"
```

---

### Task 3: SessionStart hook injecting the current session name

**Files:**
- Create: `plugins/telegram/hooks/session-name-context.ts`
- Create: `plugins/telegram/hooks/hooks.json`
- Create: `plugins/telegram/hooks/session-name-context.test.ts`
- Modify: `plugins/telegram/.claude-plugin/plugin.json` (reference the hooks file)

**Interfaces:**
- Consumes: `readCurrentSessionId(env): string | null` and `resolveCurrentSessionName(sid, dir): string | null` from `../current-session-info.ts`; `resolveStateDir(env): string | null` from `../state-path.ts`.
- Produces: exported `resolveSessionNameForContext(env: Record<string, string | undefined>): string | null`; and, when run directly, writes SessionStart `additionalContext` JSON to stdout.

- [ ] **Step 0: Confirm plugin hook wiring**

Plugins in this repo have no prior hook example. Before finalizing, confirm the exact plugin SessionStart wiring (auto-discovered `hooks/hooks.json` vs a `"hooks"` key in plugin.json, and the `additionalContext` output shape). Dispatch the `claude-code-guide` agent with: "How does a Claude Code plugin register a SessionStart hook, and how does a SessionStart hook return additionalContext?" Apply its confirmed shape if it differs from the draft below.

- [ ] **Step 1: Write the failing test**

Create `plugins/telegram/hooks/session-name-context.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setName as registrySetName } from '../session-names-registry.ts'
import { resolveSessionNameForContext } from './session-name-context.ts'

test('resolves the registered name for the current session id', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'hook-test-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-xyz'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'idle')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('idle')
  rmSync(projectDir, { recursive: true, force: true })
})

test('returns null when no pty/telegram state exists', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'hook-test-'))
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBeNull()
  rmSync(projectDir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd plugins/telegram && bun test hooks/session-name-context.test.ts`
Expected: FAIL — module `./session-name-context.ts` does not exist.

- [ ] **Step 3: Write the hook script**

Create `plugins/telegram/hooks/session-name-context.ts`:

```ts
#!/usr/bin/env bun
/**
 * SessionStart hook: injects the current Telegram session name into the
 * agent's context so behavioral skills (name-session) can detect when the
 * session is still called "idle". Degrades silently when no pty/telegram
 * state exists — emits nothing rather than erroring.
 */
import { readCurrentSessionId, resolveCurrentSessionName } from '../current-session-info.ts'
import { resolveStateDir } from '../state-path.ts'

export function resolveSessionNameForContext(
  env: Record<string, string | undefined>,
): string | null {
  const sid = readCurrentSessionId(env)
  const telegramStateDir = resolveStateDir(env)
  if (!sid || !telegramStateDir) return null
  return resolveCurrentSessionName(sid, telegramStateDir)
}

function main(): void {
  const name = resolveSessionNameForContext(process.env)
  if (!name) return // silent: nothing to inject
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Current Telegram session name: "${name}".`,
      },
    }),
  )
}

if (import.meta.main) main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd plugins/telegram && bun test hooks/session-name-context.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Wire the hook**

Create `plugins/telegram/hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/session-name-context.ts\""
          }
        ]
      }
    ]
  }
}
```

In `plugins/telegram/.claude-plugin/plugin.json`, add a `"hooks"` key (after `"version"`), using the shape confirmed in Step 0:

```json
  "hooks": "./hooks/hooks.json",
```

- [ ] **Step 6: Manually verify the hook emits context**

Run (simulating a project with an `idle` session):
```bash
cd plugins/telegram && CLAUDE_PROJECT_DIR=/tmp/none bun run hooks/session-name-context.ts; echo "(exit $?)"
```
Expected: no output (silent) and exit 0 when state is absent. With real state present, it prints the `additionalContext` JSON. This confirms the script runs under bun without import errors.

- [ ] **Step 7: Commit**

```bash
git add plugins/telegram/hooks plugins/telegram/.claude-plugin/plugin.json
git commit -m "feat(telegram): SessionStart hook injects current session name"
```

---

### Task 4: `name-session` behavioral skill

**Files:**
- Create: `plugins/telegram/skills/name-session/SKILL.md`

**Interfaces:**
- Consumes: the SessionStart `additionalContext` from Task 3 (`Current Telegram session name: "…"`); the Telegram `reply` tool's `buttons`; the `pty_send_slash` MCP tool.
- Produces: behavioral guidance only (no code). Skills are auto-discovered from `skills/`, so no plugin.json change is needed.

- [ ] **Step 1: Write the skill**

Create `plugins/telegram/skills/name-session/SKILL.md`:

```markdown
---
name: name-session
description: Use when responding to a Telegram inbound while the current session is still named "idle" (read it from the "Current Telegram session name" context injected at SessionStart). Remind the user ONCE to rename, and as soon as the conversation's direction is clear, offer a concrete hyphenated name via inline buttons and apply it yourself via pty_send_slash on confirmation. Do not nag.
---

# Name the Session (Telegram)

A session left named `idle` is hard to find later. This skill gets it a
meaningful name with minimal friction.

## When this applies

- You are replying to a Telegram `<channel>` inbound, AND
- The injected context says `Current Telegram session name: "idle"`, AND
- The session has NOT already been renamed during this conversation.

If the name is anything other than `idle`, do nothing — this skill is silent.

## The flow

### 1. Remind once (only on your first reply of an idle session)

Append a single one-line note to your normal reply, e.g.:

> _FYI session ini masih bernama `idle`. Nanti setelah arah obrolan jelas aku
> usulkan nama, atau kamu bisa `/rename <nama>` kapan saja._

Do this **once**. After that, stay quiet about naming until you have a concrete
recommendation. Never repeat the reminder every message.

### 2. Offer a name (when the direction is clear — your judgment)

As soon as you can tell what the conversation is about (could be after one
message or several), and the session is still `idle`, propose ONE concrete name
with inline buttons:

- The name MUST be lowercase, hyphenated, **no spaces** (the `/rename`
  command rejects spaces). Keep it short and descriptive, e.g. `catur-analogi`,
  `rename-idle-feature`.
- Buttons (narrate the options as a short numbered list in the body; labels stay short):
  - `[Pakai "<nama>"]`
  - `[Nama lain]`
  - `[Nanti saja]`

### 3. Apply on confirmation

- `[Pakai "<nama>"]` tapped → rename the session yourself by calling
  `pty_send_slash` with `command: "/rename <nama>"`. Confirm briefly to the user.
- `[Nama lain]` tapped → propose a different name (or ask the user what they'd
  prefer), then offer again.
- `[Nanti saja]` tapped → drop it; do not re-offer unless the user asks.

## Stop conditions

- Once the session has been renamed (by you or by the user typing `/rename`),
  stop nudging and offering for the rest of the conversation.
- Never auto-rename without the user's tap — the user chooses the name (one tap
  to accept your suggestion).
```

- [ ] **Step 2: Sanity-check the frontmatter**

Run: `cd plugins/telegram && head -5 skills/name-session/SKILL.md`
Expected: valid YAML frontmatter with `name: name-session` and a `description:` line.

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/skills/name-session
git commit -m "feat(telegram): add name-session idle-nudge skill"
```

---

### Task 5: Version bump, marketplace description, release

**Files:**
- Modify: `plugins/telegram/.claude-plugin/plugin.json` (version)
- Modify: `plugins/telegram/package.json` (version)
- Modify: `.claude-plugin/marketplace.json` (telegram description)

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: a release commit on `feat/rename-and-idle-nudge`, merged to `main` and pushed.

- [ ] **Step 1: Bump the version**

In both `plugins/telegram/.claude-plugin/plugin.json` and `plugins/telegram/package.json`, bump `version` from `0.0.33-mirza.0` to `0.0.34-mirza.0`.

- [ ] **Step 2: Update the marketplace description**

In `.claude-plugin/marketplace.json`, in the `telegram` plugin entry's `description`, append a short clause noting: `/rename` now shows `from <old> to <new>` and rejects names with spaces; a SessionStart hook + `name-session` skill nudge naming of `idle` sessions.

- [ ] **Step 3: Run the full telegram test suite**

Run: `cd plugins/telegram && bun test`
Expected: all tests PASS (no regressions).

- [ ] **Step 4: Commit the release**

```bash
git add plugins/telegram/.claude-plugin/plugin.json plugins/telegram/package.json .claude-plugin/marketplace.json
git commit -m "release(telegram): bump to 0.0.34-mirza.0 — /rename from→to, space reject, name-session nudge"
```

- [ ] **Step 5: Merge to main and push (three-copy discipline)**

```bash
cd /c/Users/Mirza/workspace/mirza-marketplace
git merge --ff-only feat/rename-and-idle-nudge
git push origin main
git worktree remove ../mirza-marketplace-rename-idle
```

If `--ff-only` fails because `main` advanced, rebase the feature branch on `main` first, re-run the tests, then merge.

---

## Self-Review

**Spec coverage:**
- A.1 output `from…to…` + fallback → Task 1. ✓
- A.2 reject spaces + update usage hint → Task 2. ✓
- A.3 tests (from→to, fallback, space reject) → Tasks 1 & 2 (incl. updating two conflicting existing tests). ✓
- B detection via SessionStart hook (decision i-a) → Task 3. ✓
- B once-remind / judgment-offer / button-apply (B1/B3/B2) → Task 4 skill. ✓
- B lives inside telegram plugin (decision ii-a) → Tasks 3 & 4 paths. ✓
- B hook silent-degrade + unit test → Task 3 Steps 1, 4. ✓
- Versioning/release → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. Task 3 Step 0 is a verification action (confirm plugin hook schema), not a placeholder — the draft wiring is fully specified and used if confirmation matches.

**Type consistency:** `resolveSessionNameForContext(env)` defined in Task 3 Step 3, consumed in Task 3 Step 1 test — names/signatures match. `resolveCurrentSessionName(sid, dir)` and `readCurrentSessionId(env)` used per their confirmed signatures. `/rename` self-injection uses `pty_send_slash` `command` field (matches its schema).
