# Reconcile session-names registry on delete/archive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop deleted/archived sessions from permanently reserving their names in the telegram plugin's `session-names.json` registry.

**Architecture:** The registry is the authority for both picker labels and name-uniqueness, but is never pruned. We add reconciliation at the two delete paths in `meta-commands.ts`: hard delete removes the name entry; soft delete (archive) renames it to `<name>__<shortId>` so the original name is freed while the archived session keeps a unique, identifiable name. A new `removeName` helper is added to `session-names-registry.ts`.

**Tech Stack:** TypeScript, Bun (`bun:test`), runs from `plugins/telegram/`.

**Spec:** `docs/superpowers/specs/2026-05-24-registry-reconcile-on-delete-design.md`

**Working dir for all commands:** `C:\Users\Mirza\workspace\mirza-marketplace\plugins\telegram`
**Branch:** `telegram-registry-reconcile` (already created)

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `session-names-registry.ts` | Durable `sessionId → name` store | Add `removeName(stateDir, sessionId)` |
| `session-names-registry.test.ts` | Unit tests for the registry | Add 2 `removeName` tests |
| `meta-commands.ts` | Telegram meta-command + callback routing | Hard delete → `removeName`; soft delete → rename entry with shortId suffix; new imports |
| `meta-commands.test.ts` | Tests for routing/callbacks | Add hard-delete removal test + 3 soft-delete rename tests |

---

### Task 1: Add `removeName` to the registry

**Files:**
- Modify: `session-names-registry.ts` (add function after `setName`, ~line 94)
- Test: `session-names-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `removeName` to the import block at the top of `session-names-registry.test.ts` (currently lines 12-18):

```ts
import {
  loadRegistry,
  saveRegistry,
  setName,
  removeName,
  refreshFromPidFiles,
  findSessionIdByName,
} from './session-names-registry'
```

Add these two tests inside the `describe('session-names-registry', ...)` block (e.g. after the `setName overwrites existing entry` test, ~line 81):

```ts
  test('removeName deletes an existing entry and persists', () => {
    setName(stateDir, 'sid-a', 'utama')
    setName(stateDir, 'sid-b', 'bahas')
    removeName(stateDir, 'sid-a')
    const loaded = loadRegistry(stateDir)
    expect(loaded.has('sid-a')).toBe(false)
    expect(loaded.get('sid-b')!.name).toBe('bahas')
  })

  test('removeName is a no-op when the sessionId is absent', () => {
    setName(stateDir, 'sid-a', 'utama')
    expect(() => removeName(stateDir, 'sid-nonexistent')).not.toThrow()
    const loaded = loadRegistry(stateDir)
    expect(loaded.size).toBe(1)
    expect(loaded.get('sid-a')!.name).toBe('utama')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test ./session-names-registry.test.ts`
Expected: FAIL — `removeName` is not exported / not a function.

- [ ] **Step 3: Implement `removeName`**

In `session-names-registry.ts`, add immediately after the `setName` function (after line 94):

```ts
/**
 * Remove a single session's name entry, then persist. No-op if the entry is
 * absent. Best-effort: errors are swallowed via saveRegistry, consistent with
 * setName — a failed registry write must never abort the caller's delete.
 */
export function removeName(stateDir: string, sessionId: string): void {
  const registry = loadRegistry(stateDir)
  if (!registry.has(sessionId)) return
  registry.delete(sessionId)
  saveRegistry(stateDir, registry)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./session-names-registry.test.ts`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add session-names-registry.ts session-names-registry.test.ts
git commit -m "feat(telegram): add removeName to session-names registry"
```

---

### Task 2: Hard delete frees the name

**Files:**
- Modify: `meta-commands.ts` — import `removeName`; `delete_confirm_` branch (~lines 837-851)
- Test: `meta-commands.test.ts` — `describe('meta-commands: tryHandleMetaCallback for delete', ...)`

- [ ] **Step 1: Write the failing test**

In `meta-commands.test.ts`, extend the registry import (currently line 8) to also bring in `loadRegistry`:

```ts
import { setName as registrySetName, loadRegistry } from './session-names-registry'
```

Add this test inside `describe('meta-commands: tryHandleMetaCallback for delete', ...)` (after the `delete confirm rmSync...` test, ~line 609):

```ts
  test('delete confirm also removes the session name from the registry', async () => {
    const sid = '1a2b3c4d-aaaa-bbbb-cccc-dddddddddddd'
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    registrySetName(telegramStateDir, sid, 'session-01')

    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      `meta:delete_confirm_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )

    expect(loadRegistry(telegramStateDir).has(sid)).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test ./meta-commands.test.ts`
Expected: FAIL — the registry still contains `sid` after hard delete (`has(sid)` is `true`).

- [ ] **Step 3: Implement the registry cleanup**

In `meta-commands.ts`, add `removeName` to the import from `./session-names-registry.ts` (currently lines 32-36):

```ts
import {
  loadRegistry,
  setName as registrySetName,
  findSessionIdByName,
  removeName,
} from './session-names-registry.ts'
```

In the `delete_confirm_` branch, locate the existing `rmSync` block and the success ack that follows (lines 839-851):

```ts
      try {
        rmSync(jsonlPath, { force: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal hapus: ${msg}`)
        return true
      }

      await handlers.ackCallback(`session dihapus`)
```

Insert the cleanup between the `try/catch` and the success `ackCallback`, so it reads:

```ts
      try {
        rmSync(jsonlPath, { force: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal hapus: ${msg}`)
        return true
      }

      // The session is gone — free its name from the registry so /new and
      // /rename can reuse it. Best-effort; the jsonl delete already happened.
      const telegramStateDir = resolveTelegramStateDir(env)
      if (telegramStateDir) {
        removeName(telegramStateDir, entry.sessionId)
      }

      await handlers.ackCallback(`session dihapus`)
```

(`resolveTelegramStateDir` is already imported at the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (new test plus all existing delete tests).

- [ ] **Step 5: Commit**

```bash
git add meta-commands.ts meta-commands.test.ts
git commit -m "fix(telegram): hard delete frees the session name from the registry"
```

---

### Task 3: Soft delete renames the entry with a shortId suffix

**Files:**
- Modify: `meta-commands.ts` — import `deriveShortId`; `archive_confirm_` branch (~line 942)
- Test: `meta-commands.test.ts` — `describe('meta-commands: /delete (soft / default)', ...)`

- [ ] **Step 1: Write the failing tests**

In `meta-commands.test.ts`, extend the registry import added in Task 2 to also bring in `findSessionIdByName`:

```ts
import { setName as registrySetName, loadRegistry, findSessionIdByName } from './session-names-registry'
```

Add these three tests inside `describe('meta-commands: /delete (soft / default)', ...)` (after the `confirm writes session ID to archived-sessions.json` test, ~line 1022). The `telegramStateDir` and `seedNSessions` helpers already exist in this describe block.

```ts
  test('soft delete confirm renames the registry entry to <name>__<shortId>, freeing the original name', async () => {
    const sids = seedNSessions(2, 'a')
    const target = sids[1]!
    const targetShort = target.replace(/-/g, '').slice(0, 8).toLowerCase()
    registrySetName(telegramStateDir, target, 'session-01')

    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cb.handler)

    const registry = loadRegistry(telegramStateDir)
    expect(registry.get(target)!.name).toBe(`session-01__${targetShort}`)
    expect(findSessionIdByName(registry, 'session-01')).toBeNull()
  })

  test('soft delete confirm on a session with no registry name creates no entry', async () => {
    const sids = seedNSessions(2, 'b')
    const target = sids[1]!
    const targetShort = target.replace(/-/g, '').slice(0, 8).toLowerCase()
    // No registrySetName for target — it only has a fallback label.

    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cb.handler)

    expect(loadRegistry(telegramStateDir).has(target)).toBe(false)
  })

  test('soft delete confirm does not double-append the shortId suffix', async () => {
    const sids = seedNSessions(2, 'c')
    const target = sids[1]!
    const targetShort = target.replace(/-/g, '').slice(0, 8).toLowerCase()
    registrySetName(telegramStateDir, target, `session-01__${targetShort}`)

    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cb.handler)

    expect(loadRegistry(telegramStateDir).get(target)!.name).toBe(`session-01__${targetShort}`)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test ./meta-commands.test.ts`
Expected: FAIL — first test fails because the entry name stays `session-01` (no rename) and `findSessionIdByName` still returns `target`.

- [ ] **Step 3: Implement the rename**

In `meta-commands.ts`, add `deriveShortId` to the import from `./sessions-list.ts` (currently line 31):

```ts
import { listProjectSessions, encodeProjectDir, deriveShortId } from './sessions-list.ts'
```

In the `archive_confirm_` branch, locate the existing `addArchived` block (lines 941-947):

```ts
      try {
        addArchived(telegramStateDir, entry.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal archive: ${msg}`)
        return true
      }
```

Insert the rename immediately after that `try/catch` (before the `ackCallback('session diarchive')`):

```ts
      // Free the original name so /new and /rename can reuse it, while the
      // archived session keeps a unique, identifiable name in case it is
      // unarchived manually later: "session-01" -> "session-01__<shortId>".
      // No-op when the session has no registry name, and guarded against
      // double-suffixing if it was somehow archived before.
      try {
        const registry = loadRegistry(telegramStateDir)
        const currentName = registry.get(entry.sessionId)?.name
        if (currentName) {
          const suffix = `__${deriveShortId(entry.sessionId)}`
          if (!currentName.endsWith(suffix)) {
            registrySetName(telegramStateDir, entry.sessionId, `${currentName}${suffix}`)
          }
        }
      } catch {
        /* best-effort — archive already succeeded on disk */
      }
```

(`loadRegistry` and `registrySetName` are already imported.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (3 new tests plus all existing soft-delete tests).

- [ ] **Step 5: Commit**

```bash
git add meta-commands.ts meta-commands.test.ts
git commit -m "fix(telegram): soft delete renames session to <name>__<shortId> to free the original name"
```

---

### Task 4: Full suite + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire plugin test suite**

Run: `bun test`
Expected: PASS — all suites green, no regressions in switch/delete/archive/pagination/effort tests.

- [ ] **Step 2: Sanity-check the scenario by reasoning through the code**

Confirm in `meta-commands.ts` that after the change:
- `findSessionIdByName(registry, "session-01")` returns `null` once `session-01` is soft-deleted (the entry is now `session-01__<shortId>`), so `/new session-01` and `/rename session-01` pass the uniqueness check.
- Hard delete removes the entry entirely, so `/new <samename>` is no longer blocked by a ghost.

- [ ] **Step 3: No commit needed** (verification only).

---

## Notes for the implementer

- Run all commands from `plugins/telegram/`.
- `bun test ./file.test.ts` runs one file; `bun test` runs the whole suite.
- The production telegram state dir resolves to `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram` — the tests mirror this exactly.
- `deriveShortId(sessionId)` = the UUID with dashes stripped, first 8 hex chars, lowercased — the same shortId the pickers already use.
- Do not commit the unrelated `plugins/pty-controller/...` working-tree changes; stage only the files named in each task.
