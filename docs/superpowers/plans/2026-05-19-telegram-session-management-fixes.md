# Telegram Session Management Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four race/data-quality bugs in Telegram session management (duplicate names, naked UUID labels, /switch label mismatch, lost-name race on /new) plus add wrapper startup resume-by-mtime and unify post-injection delays.

**Architecture:** Six surgical edits across the existing plugin + wrapper. Telegram plugin gains a `findSessionIdByName` helper (used by uniqueness validation), a `formatRelative` helper (used by naked-UUID label fallback), and a disambiguator pass (used when legacy registry holds duplicate names). The wrapper learns to eager-write to the telegram registry, propagate the label through the switch outbox event, pick a startup mode (resume-latest or first-run "main session"), and use a single unified 1000 ms post-injection delay.

**Tech Stack:** TypeScript + Bun runtime for the telegram plugin (test runner: `bun test`). Node + node-pty for the wrapper. Tests use `bun:test` (`describe`/`test`/`expect`/`beforeEach`).

**Source spec:** `docs/superpowers/specs/2026-05-19-telegram-session-management-fixes-design.md`

---

## File Structure

| File | Responsibility | Touched by tasks |
| --- | --- | --- |
| `plugins/telegram/session-names-registry.ts` | Adds `findSessionIdByName(registry, name): sessionId \| null` | Task 1 |
| `plugins/telegram/session-names-registry.test.ts` | Tests for the new helper | Task 1 |
| `plugins/telegram/sessions-list.ts` | Adds `formatRelative(ms)`; appends timestamp to naked-UUID label; adds duplicate-name disambiguator pass | Tasks 2, 3 |
| `plugins/telegram/sessions-list.test.ts` | Tests for the new labels | Tasks 2, 3 |
| `plugins/telegram/meta-commands.ts` | Uniqueness check in `handleNew` and `handleRename`; `entry.label` passed as `sessionName` in `switch` callback payload | Tasks 4, 5, 6 |
| `plugins/telegram/meta-commands.test.ts` | Tests for uniqueness rejections + switch payload shape | Tasks 4, 5, 6 |
| `plugins/pty-controller/wrapper/src/wrapper.ts` | `POST_INJECTION_DELAY_MS = 1000`; eager registry write before `/rename`; propagate `sessionName` in switch outbox + delay it; startup `--resume <latest>` or first-run `/rename main session` | Tasks 7, 8, 9, 10, 11 |

**Test runner:** `bun test plugins/telegram/<file>.test.ts` for plugin tests. Wrapper has no existing tests; Tasks 7-11 verify via plan-internal manual checks documented inline.

**Commit policy:** Each task ends with one commit. Frequent, small commits — Mirza's strong preference. Use conventional commit prefixes (`fix:`, `feat:`, `refactor:`).

---

## Task 1: Add `findSessionIdByName` helper to the registry

**Files:**
- Modify: `plugins/telegram/session-names-registry.ts` (append new export at end of file)
- Test: `plugins/telegram/session-names-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `session-names-registry.test.ts` inside the existing `describe('session-names-registry', () => { ... })` block:

```typescript
test('findSessionIdByName returns sessionId when name matches', () => {
  setName(stateDir, 'sid-a', 'utama')
  setName(stateDir, 'sid-b', 'bahas')
  const registry = loadRegistry(stateDir)
  expect(findSessionIdByName(registry, 'utama')).toBe('sid-a')
  expect(findSessionIdByName(registry, 'bahas')).toBe('sid-b')
})

test('findSessionIdByName returns null when name is free', () => {
  setName(stateDir, 'sid-a', 'utama')
  const registry = loadRegistry(stateDir)
  expect(findSessionIdByName(registry, 'nonexistent')).toBeNull()
})

test('findSessionIdByName is case-sensitive', () => {
  setName(stateDir, 'sid-a', 'Omar')
  const registry = loadRegistry(stateDir)
  expect(findSessionIdByName(registry, 'omar')).toBeNull()
  expect(findSessionIdByName(registry, 'Omar')).toBe('sid-a')
})

test('findSessionIdByName returns one of the matches when duplicates exist', () => {
  // Legacy data: two sessions with the same name. The function returns
  // *one* sessionId; the caller treats either as "name is taken".
  setName(stateDir, 'sid-a', 'omar')
  setName(stateDir, 'sid-b', 'omar')
  const registry = loadRegistry(stateDir)
  const hit = findSessionIdByName(registry, 'omar')
  expect(hit === 'sid-a' || hit === 'sid-b').toBe(true)
})
```

Also extend the import line at the top:

```typescript
import {
  loadRegistry,
  saveRegistry,
  setName,
  refreshFromPidFiles,
  findSessionIdByName,
} from './session-names-registry'
```

- [ ] **Step 2: Run test to verify it fails**

```
bun test plugins/telegram/session-names-registry.test.ts
```

Expected: tests fail with `findSessionIdByName is not exported` or similar TS/runtime error.

- [ ] **Step 3: Add the helper to `session-names-registry.ts`**

Append to the end of `plugins/telegram/session-names-registry.ts`:

```typescript
/**
 * Returns the sessionId currently holding `name`, or null if `name` is free.
 * Exact (case-sensitive) match against the registry's `name` field. When the
 * registry contains legacy duplicates (multiple entries with the same name),
 * returns the first one iterated; callers treat the result as a boolean
 * "name is taken" — either match blocks the new write equally.
 */
export function findSessionIdByName(
  registry: Map<string, RegistryEntry>,
  name: string,
): string | null {
  for (const [sid, entry] of registry) {
    if (entry.name === name) return sid
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/session-names-registry.test.ts
```

Expected: all tests in `session-names-registry` describe block pass (including the four new ones).

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/session-names-registry.ts plugins/telegram/session-names-registry.test.ts
git commit -m "feat(telegram): add findSessionIdByName registry helper"
```

---

## Task 2: Add `formatRelative` and timestamp the naked-UUID label

**Files:**
- Modify: `plugins/telegram/sessions-list.ts`
- Test: `plugins/telegram/sessions-list.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sessions-list.test.ts` (assume an existing `describe('listProjectSessions', ...)` block exists; create one if not). Also export and test `formatRelative` directly:

```typescript
import { formatRelative } from './sessions-list'

describe('formatRelative', () => {
  const NOW = 1_700_000_000_000

  test('returns "baru saja" for under 1 minute', () => {
    expect(formatRelative(NOW - 30_000, NOW)).toBe('baru saja')
  })

  test('minutes for under 1 hour', () => {
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('5 mnt')
    expect(formatRelative(NOW - 59 * 60_000, NOW)).toBe('59 mnt')
  })

  test('hours for under 1 day', () => {
    expect(formatRelative(NOW - 2 * 3_600_000, NOW)).toBe('2 jam')
    expect(formatRelative(NOW - 23 * 3_600_000, NOW)).toBe('23 jam')
  })

  test('days for under 14 days', () => {
    expect(formatRelative(NOW - 3 * 86_400_000, NOW)).toBe('3 hari')
    expect(formatRelative(NOW - 13 * 86_400_000, NOW)).toBe('13 hari')
  })

  test('weeks for under 12 weeks', () => {
    expect(formatRelative(NOW - 14 * 86_400_000, NOW)).toBe('2 mgg')
    expect(formatRelative(NOW - 83 * 86_400_000, NOW)).toBe('11 mgg')
  })

  test('absolute dd/mm for older than 12 weeks', () => {
    const ts = new Date('2025-01-15T00:00:00Z').getTime()
    const now = new Date('2025-06-01T00:00:00Z').getTime()
    expect(formatRelative(ts, now)).toBe('15/01')
  })
})
```

Also add a label-fallback test in `describe('listProjectSessions', ...)`:

```typescript
test('naked UUID fallback label includes a relative timestamp', () => {
  // Setup: create one .jsonl file in the encoded projects dir with no
  // matching registry entry and no pid file. The label should be
  // "session <8hex> · <relative>".
  // (The test scaffold for this file already creates a temp ~/.claude
  // and a project dir; reuse the existing harness.)
  const sid = 'aabbccdd-1111-2222-3333-444455556666'
  const projDir = mkTempProjectDirWithJsonl(sid)  // existing helper or inline equivalent
  const sessions = listProjectSessions(projDir)
  expect(sessions).toHaveLength(1)
  expect(sessions[0].hasName).toBe(false)
  expect(sessions[0].label).toMatch(/^session aabbccdd · /)
})
```

If `mkTempProjectDirWithJsonl` does not exist in the test file, inline the setup using `mkTempDir` + `writeFileSync` to drop a zero-byte `.jsonl` file in the encoded projects dir. Match the existing test patterns in this file.

- [ ] **Step 2: Run tests to verify they fail**

```
bun test plugins/telegram/sessions-list.test.ts
```

Expected: `formatRelative is not exported` or runtime error; the label match also fails.

- [ ] **Step 3: Implement `formatRelative` and wire it into the label**

Add to `plugins/telegram/sessions-list.ts`, near the top of the file (after the existing imports):

```typescript
/**
 * Indonesian-short relative time formatter for picker labels. Intentionally
 * compact ("5 mnt", "2 jam") because Telegram button labels are narrow on
 * mobile. Falls back to absolute dd/mm for ages > 12 weeks (the year
 * disambiguator is omitted to save width; the dd/mm is enough hint for the
 * picker user to decide whether to tap).
 *
 * `now` is injectable for tests; production calls use Date.now().
 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ts)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  if (delta < minute) return 'baru saja'
  if (delta < hour) return `${Math.floor(delta / minute)} mnt`
  if (delta < day) return `${Math.floor(delta / hour)} jam`
  if (delta < 14 * day) return `${Math.floor(delta / day)} hari`
  if (delta < 12 * week) return `${Math.floor(delta / week)} mgg`
  const d = new Date(ts)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}
```

Then in `listProjectSessions`, update the fallback label line (currently around line 176):

```typescript
const label = resolvedName ?? `session ${sessionId.slice(0, 8)} · ${formatRelative(mtime)}`
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/sessions-list.test.ts
```

Expected: all tests in `formatRelative` describe block pass; new naked-UUID label test passes; existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/sessions-list.ts plugins/telegram/sessions-list.test.ts
git commit -m "feat(telegram): relative timestamp suffix for unnamed sessions"
```

---

## Task 3: Disambiguator suffix for duplicate-name sessions

**Files:**
- Modify: `plugins/telegram/sessions-list.ts`
- Test: `plugins/telegram/sessions-list.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `sessions-list.test.ts`:

```typescript
test('duplicate registry names get disambiguator suffix', () => {
  // Setup: two .jsonl files, both registry entries named "omar".
  const sidA = 'aaaaaaaa-1111-2222-3333-444444444444'
  const sidB = 'bbbbbbbb-1111-2222-3333-444444444444'
  const projDir = mkTempProjectDirWithJsonls([sidA, sidB])  // helper / inline
  // Write a stateDir with both entries named "omar".
  const stateDir = mkTempDir('sl-state')
  setName(stateDir, sidA, 'omar')
  setName(stateDir, sidB, 'omar')
  const sessions = listProjectSessions(projDir, stateDir)
  const labels = sessions.map(s => s.label).sort()
  expect(labels).toEqual(['omar (aaaaaaaa)', 'omar (bbbbbbbb)'])
})

test('unique names keep their bare label', () => {
  const sid = 'cccccccc-1111-2222-3333-444444444444'
  const projDir = mkTempProjectDirWithJsonl(sid)
  const stateDir = mkTempDir('sl-state')
  setName(stateDir, sid, 'utama')
  const sessions = listProjectSessions(projDir, stateDir)
  expect(sessions[0].label).toBe('utama')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
bun test plugins/telegram/sessions-list.test.ts
```

Expected: first test fails — labels still come back as `['omar', 'omar']`.

- [ ] **Step 3: Add the disambiguator pass to `listProjectSessions`**

In `plugins/telegram/sessions-list.ts`, after the `sessions: SessionInfo[]` array is built and **before** `sessions.sort(...)`:

```typescript
// Disambiguator pass: when two or more sessions have the same resolved
// name, suffix each with its shortId so the picker can be tapped without
// ambiguity. Triggered by legacy duplicate registry entries (the
// uniqueness rule in handleNew/handleRename prevents new duplicates).
const nameCounts = new Map<string, number>()
for (const s of sessions) {
  if (s.hasName) nameCounts.set(s.label, (nameCounts.get(s.label) ?? 0) + 1)
}
for (const s of sessions) {
  if (s.hasName && (nameCounts.get(s.label) ?? 0) > 1) {
    s.label = `${s.label} (${s.shortId})`
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/sessions-list.test.ts
```

Expected: both new tests pass; previously-passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/sessions-list.ts plugins/telegram/sessions-list.test.ts
git commit -m "feat(telegram): disambiguator suffix for duplicate-name sessions"
```

---

## Task 4: Uniqueness validation in `handleNew`

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `meta-commands.test.ts`, inside whatever `describe` block currently covers `/new` (look for tests referencing `handleNew` or `/new bahas MCP`):

```typescript
test('/new rejects when name already taken in registry', async () => {
  // Setup: registry has "bahas MCP" mapped to some existing sessionId.
  setName(telegramStateDir, 'existing-sid', 'bahas MCP')
  const writes: Array<Record<string, unknown>> = []
  const replies: string[] = []
  const handlers = makeHandlers({
    reply: (msg) => { replies.push(msg); return Promise.resolve() },
    writeWrapperCommand: (payload) => { writes.push(payload) },  // spy
  })
  await tryRouteMetaCommand('/new bahas MCP', testEnv, handlers)
  expect(writes).toHaveLength(0)
  expect(replies[0]).toMatch(/sudah dipakai/)
})

test('/new succeeds when name is free', async () => {
  // No pre-existing registry entry. Existing happy path test if already
  // present can be reused — this is a sanity check.
  const writes: Array<Record<string, unknown>> = []
  const handlers = makeHandlers({ writeWrapperCommand: (p) => writes.push(p) })
  await tryRouteMetaCommand('/new bahas MCP', testEnv, handlers)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ command: '/clear', sessionName: 'bahas MCP' })
})
```

If the test harness in this file currently mocks `writeWrapperCommand` differently (e.g. by stubbing the fs writes directly), adapt the test to the existing pattern. The behavior under test is what matters: rejected → no fs write to pending dir; accepted → one fs write with the right payload.

- [ ] **Step 2: Run tests to verify the rejection test fails**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: rejection test fails — `/new bahas MCP` writes the payload even when name is taken.

- [ ] **Step 3: Implement uniqueness check in `handleNew`**

In `plugins/telegram/meta-commands.ts`, modify `handleNew` (around line 198). After the `sanitised`/`sessionName` block and after the heartbeat check, **before** `writeWrapperCommand`:

```typescript
const telegramStateDir = resolveTelegramStateDir(env)
if (telegramStateDir) {
  const registry = loadRegistry(telegramStateDir)
  const taken = findSessionIdByName(registry, sessionName)
  if (taken) {
    await handlers.reply(
      `⚠️ Nama "${sessionName}" sudah dipakai session lain di project ini. Pilih nama lain atau /switch ke session itu.`,
    )
    return true
  }
}
```

Add the `findSessionIdByName` import to the existing import group at the top of the file:

```typescript
import {
  loadRegistry,
  setName as registrySetName,
  findSessionIdByName,
} from './session-names-registry'
```

(Match the existing import shape — only the new symbol is added.)

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: rejection test passes; happy path test still passes.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): reject duplicate names in /new"
```

---

## Task 5: Uniqueness validation in `handleRename`

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `meta-commands.test.ts`:

```typescript
test('/rename rejects when target name taken by another session', async () => {
  // Active session is "current-sid". Another session "other-sid" already has name "omar".
  writeCurrentSessionId(stateDir, 'current-sid')
  setName(telegramStateDir, 'other-sid', 'omar')
  const writes: Array<Record<string, unknown>> = []
  const replies: string[] = []
  const handlers = makeHandlers({
    reply: (m) => { replies.push(m); return Promise.resolve() },
    writeWrapperCommand: (p) => writes.push(p),
  })
  await tryRouteMetaCommand('/rename omar', testEnv, handlers)
  expect(writes).toHaveLength(0)
  expect(replies[0]).toMatch(/sudah dipakai/)
})

test('/rename to the active session\'s own existing name is idempotent (no error)', async () => {
  writeCurrentSessionId(stateDir, 'current-sid')
  setName(telegramStateDir, 'current-sid', 'utama')
  const writes: Array<Record<string, unknown>> = []
  const handlers = makeHandlers({ writeWrapperCommand: (p) => writes.push(p) })
  await tryRouteMetaCommand('/rename utama', testEnv, handlers)
  // Allowed — same session renaming to its own name is a no-op the user
  // should not be punished for.
  expect(writes).toHaveLength(1)
})

test('/rename succeeds when target name is free', async () => {
  writeCurrentSessionId(stateDir, 'current-sid')
  const writes: Array<Record<string, unknown>> = []
  const handlers = makeHandlers({ writeWrapperCommand: (p) => writes.push(p) })
  await tryRouteMetaCommand('/rename baru', testEnv, handlers)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ command: '/rename baru' })
})
```

Adjust `writeCurrentSessionId` to whatever helper the existing tests use to seed the wrapper state file (likely a manual `writeFileSync` to `<stateDir>/wrapper.current_session_id`).

- [ ] **Step 2: Run tests to verify they fail**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: rejection test fails; idempotent test may pass already (depends on existing logic); free-name test passes.

- [ ] **Step 3: Implement uniqueness check in `handleRename`**

In `plugins/telegram/meta-commands.ts`, modify `handleRename` (around line 242). After the heartbeat check and **before** `writeWrapperCommand`:

```typescript
const currentSid = readCurrentSessionId(stateDir)
const telegramStateDir = resolveTelegramStateDir(env)
if (telegramStateDir) {
  const registry = loadRegistry(telegramStateDir)
  const taken = findSessionIdByName(registry, newName)
  if (taken && taken !== currentSid) {
    await handlers.reply(
      `⚠️ Nama "${newName}" sudah dipakai session lain. /switch ke session itu atau pilih nama lain.`,
    )
    return true
  }
}
```

Notice this also moves the existing `currentSid` resolution earlier (it was further down the function for the post-write registry mirror). Re-use the same variable; the later `readCurrentSessionId(stateDir)` call near the registry-mirror block should be removed or kept as a defensive re-read — whichever matches the existing code style. Verify the function compiles and the registry-mirror still writes.

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: rejection passes; idempotent passes; free-name passes.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): reject duplicate names in /rename (idempotent self-rename allowed)"
```

---

## Task 6: Pass `entry.label` as `sessionName` in switch callback

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `meta-commands.test.ts`:

```typescript
test('switch callback writes payload with sessionName = picker label', async () => {
  // Seed switchPicker by running /switch first (or via test helper).
  // The picker enters two sessions; we tap the first one.
  switchPicker.set('abcd1234', { sessionId: 'sid-X', label: 'utama' })
  const writes: Array<Record<string, unknown>> = []
  const handlers = makeCallbackHandlers({ writeWrapperCommand: (p) => writes.push(p) })
  await tryHandleMetaCallback('meta:switch_abcd1234', testEnv, handlers)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    type: 'switch',
    sessionId: 'sid-X',
    sessionName: 'utama',
  })
})
```

`switchPicker` is the module-level Map in `meta-commands.ts` — if it isn't exported, the test will need a small `__test_only` export hook to seed it, or the test should call `tryRouteMetaCommand('/switch', ...)` first to populate it organically. Match whatever pattern the existing `/switch` tests use.

- [ ] **Step 2: Run tests to verify they fail**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: test fails — payload currently has no `sessionName` field.

- [ ] **Step 3: Update the switch callback payload**

In `plugins/telegram/meta-commands.ts`, inside `tryHandleMetaCallback`'s `switch_` branch (around line 458–464):

```typescript
try {
  writeWrapperCommand(stateDir, {
    type: 'switch',
    sessionId: entry.sessionId,
    sessionName: entry.label,
  })
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  await handlers.ackCallback(`Write failed: ${msg}`)
  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
bun test plugins/telegram/meta-commands.test.ts
```

Expected: new switch-payload test passes; existing switch tests still pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "fix(telegram): carry picker label through switch payload"
```

---

## Task 7: Wrapper — unify `POST_INJECTION_DELAY_MS` to 1000

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Change the constant**

In `plugins/pty-controller/wrapper/src/wrapper.ts`, line 113:

```typescript
// Pacing between chained PTY injections. 1000ms is the empirical floor at
// which CC's slash-command parser reliably digests the previous command
// before the next write lands. Used by the post-/clear chain (/rename +
// /notify-user) and by the post-/switch outbox event.
const POST_INJECTION_DELAY_MS = 1000
```

- [ ] **Step 2: Build the wrapper to verify it still compiles**

```
cd plugins/pty-controller/wrapper && npm run build
```

Expected: builds without errors. (If the build script differs, use `bun build src/wrapper.ts` or whatever the package.json `scripts` block defines.)

- [ ] **Step 3: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "refactor(wrapper): unify post-injection delay to 1000ms"
```

---

## Task 8: Wrapper — propagate `sessionName` and delay the switch outbox

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Edit the switch branch of `consumePending`**

In `plugins/pty-controller/wrapper/src/wrapper.ts`, around lines 403–425, replace the `switch` branch body:

```typescript
if (type === 'switch') {
  const sid = payload.sessionId
  if (typeof sid !== 'string' || !sid) {
    log(`ignored ${filename}: switch payload missing sessionId`)
    return
  }
  const sessionName =
    typeof (payload as { sessionName?: unknown }).sessionName === 'string'
      ? ((payload as { sessionName: string }).sessionName as string)
      : null
  log(
    `switch requested → injecting "/resume ${sid}"` +
      (sessionName ? ` (label: "${sessionName}")` : '') +
      ` (id: ${payload.id ?? '?'})`,
  )
  writeCurrentSessionId(sid)
  injectSlashCommand(`/resume ${sid}`)
  // Delay matches the post-/clear path so the plugin's session-change
  // handler sees a consistent rhythm and CC has time to fully swap before
  // the user-facing transition message lands.
  setTimeout(() => {
    writeSystemOutbox({
      type: 'session-change',
      sessionId: sid,
      sessionName,
    })
  }, POST_INJECTION_DELAY_MS)
  return
}
```

- [ ] **Step 2: Verify build**

```
cd plugins/pty-controller/wrapper && npm run build
```

Expected: builds clean.

- [ ] **Step 3: Manual verification plan (no unit tests exist for wrapper)**

After the integration tasks below are also done, run this end-to-end check:

1. Start `mirza-cc` in a project with ≥2 named sessions.
2. From Telegram: `/switch`, then tap a row labelled exactly `X` (where `X` is the registry label).
3. Watch the Telegram channel for the transition message.

Expected: message reads `switch to session: 📍 *X*` — never some other name. If a stale registry entry would otherwise resolve the session id to `Y`, the picker label (`X`) wins.

Defer the actual end-to-end run to Task 11's manual section to avoid running the wrapper between every task.

- [ ] **Step 4: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "fix(wrapper): propagate sessionName + delay outbox in switch flow"
```

---

## Task 9: Wrapper — eager registry write before `/rename`

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Add the telegram-registry helper (duplicated `setName` — Option β)**

Near the top of `plugins/pty-controller/wrapper/src/wrapper.ts`, after the existing imports and constants (somewhere around line 110-130, before the PTY setup):

```typescript
import { join as joinPath } from 'node:path'

// Resolve the telegram plugin's state dir. Mirrors the plugin's own
// resolveTelegramStateDir logic: prefer the explicit CLAUDE_CHANNELS_DIR
// env if set, else fall back to <CLAUDE_PROJECT_DIR>/.claude/channels/telegram.
function resolveTelegramStateDir(): string | null {
  const explicit = process.env.CLAUDE_CHANNELS_DIR?.trim()
  if (explicit) return joinPath(explicit, 'telegram')
  const proj = process.env.CLAUDE_PROJECT_DIR?.trim()
  if (!proj) return null
  return joinPath(proj, '.claude', 'channels', 'telegram')
}

// Mirror of `setName` from plugins/telegram/session-names-registry.ts.
// Duplicated rather than imported to avoid a cross-package dependency
// (Option β per the design spec). Best-effort: errors are swallowed.
function writeTelegramRegistryName(sessionId: string, name: string): void {
  const dir = resolveTelegramStateDir()
  if (!dir) return
  const path = joinPath(dir, 'session-names.json')
  let obj: Record<string, { name: string; updatedAt: number }> = {}
  try {
    obj = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    /* missing/malformed → start fresh */
  }
  obj[sessionId] = { name, updatedAt: Date.now() }
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = `${path}.tmp.${process.pid}`
    writeFileSync(tmp, JSON.stringify(obj, null, 2))
    renameSync(tmp, path)
  } catch (err) {
    log(`failed to write telegram registry: ${err}`)
  }
}
```

(Confirm `readFileSync`, `writeFileSync`, `mkdirSync`, `renameSync` are already imported at the top of the file — they should be from `node:fs`. If not, add them.)

- [ ] **Step 2: Wire the eager write into the post-/clear poll**

In the `sessionPollInterval`'s "fresh session detected" branch (around line 281–318), insert the eager write **before** the `setTimeout` that injects `/rename`:

```typescript
if (sessionName) {
  writeTelegramRegistryName(sid, sessionName)
  const localName = sessionName
  setTimeout(() => injectSlashCommand(`/rename ${localName}`), delay)
  delay += POST_INJECTION_DELAY_MS
}
```

- [ ] **Step 3: Verify build**

```
cd plugins/pty-controller/wrapper && npm run build
```

Expected: clean build.

- [ ] **Step 4: Manual verification plan**

Documented in Task 11's manual run. Expected behavior:

1. Run `/new test1` from Telegram → wrapper logs `wrote telegram registry: test1 → <sid>`.
2. Immediately run `/switch` and check the picker. `test1` appears in the picker labels even without an intermediate picker render. Pre-fix, it would be missing.

- [ ] **Step 5: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "fix(wrapper): eager-write to telegram registry after /new before /rename"
```

---

## Task 10: Wrapper — startup chooses `--resume <latest>` or first-run

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Add `chooseStartupArgs` helper**

In `plugins/pty-controller/wrapper/src/wrapper.ts`, after `listSessions` (line 159) and before `spawnClaudePty` (line 180):

```typescript
/**
 * Decide whether to start a fresh `claude` or resume the most-recently-modified
 * session in this project. Returns the args to splice in front of BASE_CLAUDE_ARGS
 * and a flag for the post-spawn first-run logic.
 *
 * "Latest" = jsonl with the highest mtimeMs. Ties (same mtime to the millisecond)
 * are unlikely in practice; if they happen, an arbitrary winner is fine — both
 * are equally recent.
 */
function chooseStartupArgs(): {
  resumeArgs: string[]
  isFirstRun: boolean
  latestSessionId: string | null
} {
  const files = listSessions()
  if (files.size === 0) {
    return { resumeArgs: [], isFirstRun: true, latestSessionId: null }
  }
  let latestId: string | null = null
  let latestMtime = -1
  for (const f of files) {
    const id = f.slice(0, -'.jsonl'.length)
    let mtime = 0
    try {
      mtime = statSync(join(CLAUDE_PROJECTS_DIR, f)).mtimeMs
    } catch {
      continue
    }
    if (mtime > latestMtime) {
      latestMtime = mtime
      latestId = id
    }
  }
  if (!latestId) return { resumeArgs: [], isFirstRun: true, latestSessionId: null }
  return {
    resumeArgs: ['--resume', latestId],
    isFirstRun: false,
    latestSessionId: latestId,
  }
}
```

(`statSync` should already be imported; if not, add it to the `node:fs` import group.)

- [ ] **Step 2: Use it in `spawnClaudePty`**

Modify `spawnClaudePty` (line 180–199):

```typescript
function spawnClaudePty(): { pty: IPty; startup: ReturnType<typeof chooseStartupArgs> } {
  const cols = process.stdout.columns || 100
  const rows = process.stdout.rows || 30
  const startup = chooseStartupArgs()
  const claudeArgs = [...startup.resumeArgs, ...BASE_CLAUDE_ARGS]
  const claudeCmd = [CLAUDE_BIN, ...claudeArgs].join(' ')
  const args = isWindows ? ['/c', claudeCmd] : ['-l', '-i', '-c', claudeCmd]
  log(
    `startup: ${
      startup.isFirstRun
        ? 'first-run (no existing sessions)'
        : `resuming session ${startup.latestSessionId}`
    }`,
  )
  const p = spawn(shell, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: PROJECT_DIR,
    env: {
      ...(process.env as Record<string, string>),
      CLAUDE_PROJECT_DIR: PROJECT_DIR,
      PTY_CONTROLLER_STATE_DIR: STATE_DIR,
    },
  })
  log(`spawned claude (pid ${p.pid})`)
  return { pty: p, startup }
}
```

And update the caller (line 201):

```typescript
const { pty: currentPty, startup: startupMode } = spawnClaudePty()
```

If `currentPty` is referenced as `const`-binding throughout the file, those references keep working. If TypeScript complains about destructuring a const, declare them as separate `const` bindings:

```typescript
const _spawn = spawnClaudePty()
const currentPty: IPty = _spawn.pty
const startupMode = _spawn.startup
```

- [ ] **Step 3: Verify build**

```
cd plugins/pty-controller/wrapper && npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(wrapper): resume latest session on startup; first-run otherwise"
```

---

## Task 11: Wrapper — first-run `main session` injection + resume-mode outbox

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Extend the initial session poll**

In `plugins/pty-controller/wrapper/src/wrapper.ts`, replace the `initialSessionPoll` block (around line 327–339) with:

```typescript
const initialSessionsBefore = listSessions()
const initialSessionPoll = setInterval(() => {
  const current = listSessions()
  for (const f of current) {
    if (initialSessionsBefore.has(f)) continue
    const sid = f.slice(0, -'.jsonl'.length)
    log(`initial session detected: ${sid}`)
    writeCurrentSessionId(sid)
    clearInterval(initialSessionPoll)

    if (startupMode.isFirstRun) {
      // First-run path: try to claim "main session" if free.
      const stateDir = resolveTelegramStateDir()
      let canRename = true
      if (stateDir) {
        try {
          const path = joinPath(stateDir, 'session-names.json')
          const obj = JSON.parse(readFileSync(path, 'utf8')) as Record<
            string,
            { name: string }
          >
          for (const entry of Object.values(obj)) {
            if (entry.name === 'main session') { canRename = false; break }
          }
        } catch {
          /* registry missing → name is free */
        }
      }
      if (canRename) {
        writeTelegramRegistryName(sid, 'main session')
        setTimeout(
          () => injectSlashCommand(`/rename main session`),
          0,
        )
        setTimeout(
          () =>
            writeSystemOutbox({
              type: 'session-change',
              sessionId: sid,
              sessionName: 'main session',
            }),
          POST_INJECTION_DELAY_MS,
        )
      } else {
        log(`"main session" already taken in registry — leaving new session unnamed`)
        // Still emit a session-change so the user knows CC is ready.
        writeSystemOutbox({
          type: 'session-change',
          sessionId: sid,
          sessionName: null,
        })
      }
    } else {
      // Resume path: announce which session we're resuming into.
      const stateDir = resolveTelegramStateDir()
      let resolvedName: string | null = null
      if (stateDir) {
        try {
          const path = joinPath(stateDir, 'session-names.json')
          const obj = JSON.parse(readFileSync(path, 'utf8')) as Record<
            string,
            { name: string }
          >
          resolvedName = obj[sid]?.name ?? null
        } catch {
          /* fall through */
        }
      }
      writeSystemOutbox({
        type: 'session-change',
        sessionId: sid,
        sessionName: resolvedName,
      })
    }
    return
  }
}, 500)
```

- [ ] **Step 2: Verify build**

```
cd plugins/pty-controller/wrapper && npm run build
```

Expected: clean build.

- [ ] **Step 3: Manual end-to-end verification (run all five flows)**

Now run the full manual checklist. For each flow, start fresh — `pkill -f mirza-cc` and inspect `~/.claude/projects/<encoded>/` between runs as needed.

**Flow A — first-run "main session":**
1. Pick a fresh project dir with no existing sessions (`rm -rf ~/.claude/projects/<encoded>`).
2. `mirza-cc` start.
3. Wait for the first jsonl to appear.
4. Telegram should receive `switch to session: main session` within ~1s.
5. Inspect `<project>/.claude/channels/telegram/session-names.json` — entry exists with `name: "main session"`.

**Flow B — first-run, "main session" already taken:**
1. Pre-seed `<project>/.claude/channels/telegram/session-names.json` with `{"some-other-sid": {"name": "main session", "updatedAt": 1}}`.
2. Empty the projects dir as above.
3. `mirza-cc` start.
4. Telegram should receive `switch to session: session <hex> · <relative>` (no rename happened).

**Flow C — resume on restart:**
1. Project dir has 2-3 existing jsonls of varying mtimes.
2. `mirza-cc` start.
3. Wrapper log shows `startup: resuming session <id>` where `<id>` matches the highest-mtime jsonl.
4. Telegram receives `switch to session: <name>` (or `session <hex> · <relative>` if unnamed).

**Flow D — `/switch` label race fix:**
1. Existing sessions include one with stale registry name (e.g. registry says `omar` but you've been calling it `utama`).
2. From Telegram run `/switch`, tap the row labelled `utama`.
3. Transition message reads `switch to session: utama` — never `omar`.

**Flow E — `/new` followed immediately by `/switch`:**
1. From Telegram: `/new test1`.
2. Wait for `switch to session: test1` confirmation.
3. Without rendering a picker in between, run `/new test2`.
4. After `test2` confirmation, run `/switch`.
5. Picker shows both `test1` and `test2` rows (plus current `test2`).

Any flow that fails — stop and debug before considering the plan complete.

- [ ] **Step 4: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(wrapper): announce session-change on first-run and resume"
```

---

## Self-Review Checklist

Before declaring the plan complete:

- **Spec coverage:** Features A (Tasks 4–5), B (Task 9), C (Tasks 6, 8), D1 (Task 2), D2 (Task 3), E (Tasks 10–11), F (Task 7), G (no-op, captured in spec text). ✓
- **Placeholders:** None — every step has actual code or actual command.
- **Type consistency:** `findSessionIdByName` signature matches between Task 1 (definition) and Tasks 4–5 (callers). `formatRelative(ts, now)` matches between Task 2 (definition) and its tests. `writeTelegramRegistryName(sid, name)` is consistent between Tasks 9 and 11.
- **Test code present:** Tasks 1–6 include full test bodies. Tasks 7–11 are wrapper-only and rely on the documented manual verification in Task 11; no unit-test infra for the wrapper exists today, so adding it is out of scope here.

---

## Notes for the implementer

- **Use the existing `makeHandlers` / `makeCallbackHandlers` helpers** in `meta-commands.test.ts` rather than inventing new ones — match the pattern of the existing tests.
- **`switchPicker` / `deletePicker` are module-level state**; tests usually populate them by running `/switch` first or by an `__test_only` setter. Match the existing pattern.
- **Manual verification in Tasks 9 and 11** is grouped at the end so you only run the wrapper end-to-end once, not after every code change. Build (`npm run build`) is enough between tasks.
- **Bun vs Node:** the telegram plugin runs under Bun (`bun test`). The wrapper builds with `npm run build` (TypeScript → JS) and runs under Node. Don't accidentally `bun test` the wrapper directory.
- **Frequent commits:** one per task. If a task is partway through and a discovery requires backing out, `git reset --hard HEAD` rolls back cleanly.
