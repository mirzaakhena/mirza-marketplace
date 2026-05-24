# `/delete all` and `/delete hard all` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk session removal — `/delete all` (archive every non-active session) and `/delete hard all` (permanently delete every non-active session) — with a single count-bearing confirm button.

**Architecture:** Extract the existing per-session reconciliation (archive+rename, delete+removeName) into two shared helpers, then add two bulk handlers that snapshot the non-active sessions, confirm with one button, and loop the helper per session (best-effort, skipping any session that became active).

**Tech Stack:** TypeScript, Bun (`bun:test`), runs from `plugins/telegram/`.

**Spec:** `docs/superpowers/specs/2026-05-24-delete-all-design.md`

**Working dir for all commands:** `C:\Users\Mirza\workspace\mirza-marketplace\plugins\telegram`
**Branch:** `telegram-delete-all` (already created)

---

## File Structure

| File | Change |
|------|--------|
| `meta-commands.ts` | Extract `archiveSessionAndFreeName` / `deleteSessionJsonlAndFreeName`; refactor single-session confirm branches to use them; add `archiveAllSessions`/`deleteAllSessions` holders + reset helpers; add routing + `handleArchiveAll`/`handleDeleteAll`; add `archive_all_*`/`delete_all_*` callback branches. |
| `meta-commands.test.ts` | New describe block with routing + execution tests. |

---

### Task 1: Extract per-session helpers and refactor the single-session confirm branches

This is a pure refactor — the existing `meta-commands.test.ts` suite is the regression guard. No new test is added in this task.

**Files:**
- Modify: `meta-commands.ts`

- [ ] **Step 1: Confirm the baseline is green**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (85 tests).

- [ ] **Step 2: Add the two helpers**

In `meta-commands.ts`, add these two functions immediately after the `writeWrapperCommand` function (just before `tryRouteMetaCommand`, ~line 239):

```ts
/**
 * Soft-delete one session: add it to the archive store, then free its original
 * name by renaming the registry entry to "<name>__<shortId>". No-op when the
 * session has no registry name; guarded against double-suffixing. May throw
 * from addArchived; the rename step is internally best-effort.
 */
function archiveSessionAndFreeName(telegramStateDir: string, sessionId: string): void {
  addArchived(telegramStateDir, sessionId)
  try {
    const registry = loadRegistry(telegramStateDir)
    const currentName = registry.get(sessionId)?.name
    if (currentName) {
      const suffix = `__${deriveShortId(sessionId)}`
      if (!currentName.endsWith(suffix)) {
        registrySetName(telegramStateDir, sessionId, `${currentName}${suffix}`)
      }
    }
  } catch {
    /* best-effort — archive already succeeded on disk */
  }
}

/**
 * Hard-delete one session: remove its jsonl on disk, then free its name from
 * the registry. May throw from rmSync; removeName is best-effort and only runs
 * when telegramStateDir is known.
 */
function deleteSessionJsonlAndFreeName(
  projectDir: string,
  telegramStateDir: string | null,
  sessionId: string,
): void {
  const encoded = encodeProjectDir(projectDir)
  const jsonlPath = join(homedir(), '.claude', 'projects', encoded, `${sessionId}.jsonl`)
  rmSync(jsonlPath, { force: true })
  if (telegramStateDir) removeName(telegramStateDir, sessionId)
}
```

- [ ] **Step 3: Refactor the `archive_confirm_` branch to use the helper**

Find this block (inside the `archive_` branch, the `confirm_` sub-branch):

```ts
      try {
        addArchived(telegramStateDir, entry.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal archive: ${msg}`)
        return true
      }
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
      await handlers.ackCallback('session diarchive')
```

Replace it with:

```ts
      try {
        archiveSessionAndFreeName(telegramStateDir, entry.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal archive: ${msg}`)
        return true
      }
      await handlers.ackCallback('session diarchive')
```

- [ ] **Step 4: Refactor the `delete_confirm_` branch to use the helper**

Find this block (inside the `delete_` branch, the `confirm_` sub-branch):

```ts
      const encoded = encodeProjectDir(projectDir)
      const jsonlPath = join(homedir(), '.claude', 'projects', encoded, `${entry.sessionId}.jsonl`)
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

Replace it with:

```ts
      const telegramStateDir = resolveTelegramStateDir(env)
      try {
        deleteSessionJsonlAndFreeName(projectDir, telegramStateDir, entry.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal hapus: ${msg}`)
        return true
      }

      await handlers.ackCallback(`session dihapus`)
```

- [ ] **Step 5: Run the suite to confirm the refactor is behavior-preserving**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (still 85 tests — no behavior change).

- [ ] **Step 6: Commit**

```bash
git add meta-commands.ts
git commit -m "refactor(telegram): extract per-session archive/delete helpers"
```

---

### Task 2: Routing + `handleArchiveAll` / `handleDeleteAll` (snapshot + confirm button)

**Files:**
- Modify: `meta-commands.ts`
- Test: `meta-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

In `meta-commands.test.ts`, add the two new reset helpers to the `./meta-commands` import (line 5):

```ts
import { tryRouteMetaCommand, tryHandleMetaCallback, __resetDeletePickerForTests, __resetSwitchPickerForTests, __resetArchivePickerForTests, __resetArchiveAllForTests, __resetDeleteAllForTests, parseEffortInput, EFFORT_LEVELS, extractCurrentEffortLevel } from './meta-commands'
```

Append this entire describe block at the end of the file (after the last `describe(...)`), before the final closing of the file:

```ts
describe('meta-commands: /delete all & /delete hard all', () => {
  let projectDir: string
  let stateDir: string
  let telegramStateDir: string
  let cleanup: () => void
  let homeOverride: string

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    homeOverride = mkdtempSync(join(tmpdir(), 'meta-cmd-home-'))
    process.env.USERPROFILE = homeOverride
    process.env.HOME = homeOverride
    telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    setHeartbeat(stateDir, new Date().toISOString())
    __resetArchiveAllForTests()
    __resetDeleteAllForTests()
  })

  afterEach(() => {
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
    cleanup()
  })

  function seedN(n: number, marker: string): string[] {
    const sids: string[] = []
    for (let i = 0; i < n; i++) {
      const sid = `${marker.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      sids.push(sid)
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    return sids
  }

  test('/delete all replies with a single archive-all confirm button showing the count', async () => {
    const sids = seedN(3, 'a')
    writeCurrentSessionId(stateDir, sids[0]!)
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommand('/delete all', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies).toHaveLength(1)
    const buttons = replies[0]!.buttons!.flat()
    expect(buttons.some(b => b.callbackData === 'meta:archive_all_confirm')).toBe(true)
    expect(buttons.some(b => b.callbackData === 'meta:archive_all_cancel')).toBe(true)
    expect(buttons.some(b => b.label.includes('2'))).toBe(true)
  })

  test('/delete hard all routes to hard-all confirm with PERMANEN copy, not the picker', async () => {
    const sids = seedN(2, 'b')
    writeCurrentSessionId(stateDir, sids[0]!)
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommand('/delete hard all', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const buttons = replies[0]!.buttons!.flat()
    expect(buttons.some(b => b.callbackData === 'meta:delete_all_confirm')).toBe(true)
    expect(buttons.some(b => b.callbackData === 'meta:delete_all_cancel')).toBe(true)
    expect(replies[0]!.text).toMatch(/PERMANEN/i)
  })

  test('/delete all with only the current session replies no-other-sessions, no buttons', async () => {
    const sids = seedN(1, 'c')
    writeCurrentSessionId(stateDir, sids[0]!)
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommand('/delete all', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(replies[0]!.text).toMatch(/Tidak ada session lain/)
    expect(replies[0]!.buttons).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test ./meta-commands.test.ts`
Expected: FAIL — `__resetArchiveAllForTests` / `__resetDeleteAllForTests` not exported; the routing produces no confirm buttons.

- [ ] **Step 3: Add the in-memory holders and reset helpers**

In `meta-commands.ts`, just after the `archivePickerSessions` declaration block (after `let archivePickerSessions: ArchivePickerEntry[] = []`, ~line 146), add:

```ts
// Snapshots for the bulk /delete all and /delete hard all commands. Populated
// when the command renders its confirm button; consumed on confirm. Process-
// lifetime only, same as the picker maps.
let archiveAllSessions: { sessionId: string; label: string; shortId: string }[] = []
let deleteAllSessions: { sessionId: string; label: string; shortId: string }[] = []
```

At the very end of the file, next to the other `__reset*ForTests` exports, add:

```ts
export function __resetArchiveAllForTests(): void {
  archiveAllSessions = []
}

export function __resetDeleteAllForTests(): void {
  deleteAllSessions = []
}
```

- [ ] **Step 4: Add routing for the two bulk commands**

In `tryRouteMetaCommand`, insert these two checks immediately before the existing `if (lower === '/delete' || ...)` soft check:

```ts
  // Bulk variants must be matched before the picker variants — "/delete hard all"
  // would otherwise be swallowed by the "/delete hard " picker check.
  if (lower === '/delete hard all' || lower.startsWith('/delete hard all ')) {
    return handleDeleteAll(env, handlers)
  }
  if (lower === '/delete all' || lower.startsWith('/delete all ')) {
    return handleArchiveAll(env, handlers)
  }
```

- [ ] **Step 5: Add the `handleArchiveAll` and `handleDeleteAll` handlers**

In `meta-commands.ts`, add these two functions right after `handleDelete` (after its closing brace, ~line 654):

```ts
async function handleArchiveAll(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /delete all tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /delete all tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.')
    return true
  }
  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain untuk diarchive.')
    return true
  }
  archiveAllSessions = sessions.map(s => ({ sessionId: s.sessionId, label: s.label, shortId: s.shortId }))
  await handlers.replyWithButtons(
    `📦 Archive semua ${sessions.length} session (kecuali yang aktif)?`,
    [[
      { label: `✅ Archive ${sessions.length} session`, callbackData: 'meta:archive_all_confirm' },
      { label: '❌ Batal', callbackData: 'meta:archive_all_cancel' },
    ]],
  )
  return true
}

async function handleDeleteAll(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /delete hard all tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /delete hard all tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.')
    return true
  }
  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain untuk dihapus.')
    return true
  }
  deleteAllSessions = sessions.map(s => ({ sessionId: s.sessionId, label: s.label, shortId: s.shortId }))
  await handlers.replyWithButtons(
    `🗑️ Hapus PERMANEN semua ${sessions.length} session (kecuali yang aktif)? Ini tidak bisa di-undo.`,
    [[
      { label: `🗑️ Hapus PERMANEN ${sessions.length} session`, callbackData: 'meta:delete_all_confirm' },
      { label: '❌ Batal', callbackData: 'meta:delete_all_cancel' },
    ]],
  )
  return true
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (3 new routing tests plus all existing).

- [ ] **Step 7: Commit**

```bash
git add meta-commands.ts meta-commands.test.ts
git commit -m "feat(telegram): /delete all and /delete hard all routing + confirm prompt"
```

---

### Task 3: Confirm-callback execution for the bulk commands

**Files:**
- Modify: `meta-commands.ts` — `archive_` and `delete_` callback branches
- Test: `meta-commands.test.ts` — same describe block as Task 2

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe('meta-commands: /delete all & /delete hard all', ...)` block (after the routing tests from Task 2):

```ts
  test('archive_all_confirm archives every non-current session and frees each name', async () => {
    const sids = seedN(3, 'd')
    writeCurrentSessionId(stateDir, sids[0]!)
    registrySetName(telegramStateDir, sids[1]!, 'session-01')
    registrySetName(telegramStateDir, sids[2]!, 'session-02')
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete all', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback('meta:archive_all_confirm', env, cb.handler)

    expect(loadArchived(telegramStateDir)).toEqual(new Set([sids[1]!, sids[2]!]))
    const registry = loadRegistry(telegramStateDir)
    const short1 = sids[1]!.replace(/-/g, '').slice(0, 8).toLowerCase()
    const short2 = sids[2]!.replace(/-/g, '').slice(0, 8).toLowerCase()
    expect(registry.get(sids[1]!)!.name).toBe(`session-01__${short1}`)
    expect(registry.get(sids[2]!)!.name).toBe(`session-02__${short2}`)
    expect(findSessionIdByName(registry, 'session-01')).toBeNull()
    expect(cb.edits[0]).toMatch(/2 session diarchive/)
  })

  test('delete_all_confirm rmSyncs every non-current jsonl and frees each name', async () => {
    const sids = seedN(3, 'e')
    writeCurrentSessionId(stateDir, sids[0]!)
    registrySetName(telegramStateDir, sids[1]!, 'session-01')
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete hard all', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback('meta:delete_all_confirm', env, cb.handler)

    const encoded = projectDir.replace(/[\\/:]/g, '-')
    const jsonl = (sid: string) => join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
    expect(existsSync(jsonl(sids[1]!))).toBe(false)
    expect(existsSync(jsonl(sids[2]!))).toBe(false)
    expect(existsSync(jsonl(sids[0]!))).toBe(true) // current untouched
    expect(loadRegistry(telegramStateDir).has(sids[1]!)).toBe(false)
    expect(cb.edits[0]).toMatch(/2 session dihapus permanen/)
  })

  test('confirm skips a session that became active between command and tap', async () => {
    const sids = seedN(3, 'f')
    writeCurrentSessionId(stateDir, sids[0]!)
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const { handler } = makeHandler()
    await tryRouteMetaCommand('/delete all', env, handler) // snapshot = sids[1], sids[2]
    writeCurrentSessionId(stateDir, sids[1]!) // user switched into sids[1]
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback('meta:archive_all_confirm', env, cb.handler)

    expect(loadArchived(telegramStateDir)).toEqual(new Set([sids[2]!]))
    expect(cb.edits[0]).toMatch(/1 session diarchive/)
    expect(cb.edits[0]).toMatch(/1 dilewati/)
  })

  test('archive_all_confirm with empty snapshot reports expired and changes nothing', async () => {
    __resetArchiveAllForTests()
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:archive_all_confirm', env, cb.handler)
    expect(consumed).toBe(true)
    expect(cb.acks[0]).toMatch(/expired/i)
    expect(loadArchived(telegramStateDir).size).toBe(0)
  })

  test('archive_all_cancel closes cleanly', async () => {
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:archive_all_cancel', env, cb.handler)
    expect(consumed).toBe(true)
    expect(cb.edits[0]).toMatch(/cancelled/i)
  })

  test('delete_all_cancel closes cleanly', async () => {
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:delete_all_cancel', env, cb.handler)
    expect(consumed).toBe(true)
    expect(cb.edits[0]).toMatch(/cancelled/i)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test ./meta-commands.test.ts`
Expected: FAIL — `meta:archive_all_confirm` currently hits the plain-tap fallback ("Bad short id"); nothing is archived.

- [ ] **Step 3: Add the `archive_all_*` branches**

In `tryHandleMetaCallback`, inside the `if (rest.startsWith('archive_'))` block, immediately after `const remainder = rest.slice('archive_'.length)`, add:

```ts
    if (remainder === 'all_cancel') {
      await handlers.ackCallback('Cancelled')
      await handlers.editMessage('(archive all cancelled)').catch(() => {})
      return true
    }
    if (remainder === 'all_confirm') {
      if (archiveAllSessions.length === 0) {
        await handlers.ackCallback('Expired, /delete all lagi')
        await handlers.editMessage('(expired — /delete all lagi)').catch(() => {})
        return true
      }
      const telegramStateDir = resolveTelegramStateDir(env)
      if (!telegramStateDir) {
        await handlers.ackCallback('TELEGRAM_STATE_DIR not set')
        return true
      }
      const stateDir = resolvePtyStateDir(env)
      const currentSid = stateDir ? readCurrentSessionId(stateDir) : null
      let archived = 0
      let skipped = 0
      for (const s of archiveAllSessions) {
        if (currentSid && s.sessionId === currentSid) { skipped++; continue }
        try {
          archiveSessionAndFreeName(telegramStateDir, s.sessionId)
          archived++
        } catch {
          skipped++
        }
      }
      archiveAllSessions = []
      const note = skipped > 0 ? ` · ${skipped} dilewati` : ''
      await handlers.ackCallback('Diarchive')
      await handlers.editMessage(`📦 ${archived} session diarchive.${note}`).catch(() => {})
      return true
    }
```

- [ ] **Step 4: Add the `delete_all_*` branches**

In `tryHandleMetaCallback`, inside the `if (rest.startsWith('delete_'))` block, immediately after `const remainder = rest.slice('delete_'.length)`, add:

```ts
    if (remainder === 'all_cancel') {
      await handlers.ackCallback('Cancelled')
      await handlers.editMessage('(delete all cancelled)').catch(() => {})
      return true
    }
    if (remainder === 'all_confirm') {
      if (deleteAllSessions.length === 0) {
        await handlers.ackCallback('Expired, /delete hard all lagi')
        await handlers.editMessage('(expired — /delete hard all lagi)').catch(() => {})
        return true
      }
      const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
      if (!projectDir) {
        await handlers.ackCallback('CLAUDE_PROJECT_DIR not set')
        return true
      }
      const telegramStateDir = resolveTelegramStateDir(env)
      const stateDir = resolvePtyStateDir(env)
      const currentSid = stateDir ? readCurrentSessionId(stateDir) : null
      let deleted = 0
      let skipped = 0
      for (const s of deleteAllSessions) {
        if (currentSid && s.sessionId === currentSid) { skipped++; continue }
        try {
          deleteSessionJsonlAndFreeName(projectDir, telegramStateDir, s.sessionId)
          deleted++
        } catch {
          skipped++
        }
      }
      deleteAllSessions = []
      const note = skipped > 0 ? ` · ${skipped} dilewati` : ''
      await handlers.ackCallback('Dihapus')
      await handlers.editMessage(`🗑️ ${deleted} session dihapus permanen.${note}`).catch(() => {})
      return true
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test ./meta-commands.test.ts`
Expected: PASS (6 new execution tests plus all existing).

- [ ] **Step 6: Commit**

```bash
git add meta-commands.ts meta-commands.test.ts
git commit -m "feat(telegram): execute bulk archive/delete on confirm with count summary"
```

---

### Task 4: Full suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire plugin test suite**

Run: `bun test`
Expected: PASS for `meta-commands.test.ts` and `session-names-registry.test.ts`. The only failures should be the **pre-existing** `state-path.test.ts` / `server-boot.test.ts` Windows-path failures (5 total) that also fail on `main` — unrelated to this change.

- [ ] **Step 2: No commit needed** (verification only).

---

## Notes for the implementer

- Run all commands from `plugins/telegram/`.
- `deriveShortId(sessionId)` is already imported in `meta-commands.ts` (from `./sessions-list.ts`); `loadRegistry`, `registrySetName`, `removeName` are imported from `./session-names-registry.ts`; `addArchived` from `./archive-store.ts`; `resolveTelegramStateDir`, `resolvePtyStateDir`, `readCurrentSessionId`, `encodeProjectDir` are all already in scope. No new imports are needed in `meta-commands.ts`.
- In `meta-commands.test.ts` the only new import is the two `__reset*AllForTests` helpers; `loadRegistry`, `findSessionIdByName`, `loadArchived`, `registrySetName`, `existsSync`, `join`, `mkdirSync`, `writeProjectJsonl`, `writeCurrentSessionId`, `setHeartbeat`, `mkProject`, `makeHandler`, `makeCallbackHandler` are already imported/defined.
- Do not commit the unrelated `plugins/pty-controller/...` working-tree changes; stage only the files named in each task.
