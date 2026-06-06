# Archive + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/archive` command (soft-delete that hides sessions from pickers without removing the jsonl on disk) and add Prev/Next pagination to `/switch`, `/delete`, and the new `/archive` picker so users can reach sessions beyond the first 7.

**Architecture:** Introduce a small `archive-store.ts` module that owns the per-project `archived-sessions.json` file (read + add). Extend `listProjectSessions` with an optional filter that excludes archived IDs at the single point where all pickers obtain their session list. Extract a shared `paginated-picker.ts` helper that renders `{ rows, page, totalPages }` for a slice of sessions given a callback prefix — `/switch`, `/delete`, `/archive` all call this helper. Page navigation flows through new `meta:<cmd>_page_<N>` callbacks that edit the existing picker message in place. `/archive` mirrors `/delete`'s 2-step picker-then-confirm flow; on confirm, the session ID is appended to the archive file instead of `rm -rf`'d from disk.

**Tech Stack:** TypeScript, Bun runtime, `bun:test`, Node `fs`/`path`/`crypto`. No new third-party dependencies.

**Spec source:** `C:\Users\Mirza\workspace\bot-01\FEATURE_IDEAS.md` entries #16 and #17 (2026-05-19, Mirza). Design beku 2026-05-19.

**Note on paths:** All paths in this plan are relative to `plugins/telegram/` unless otherwise specified.

---

## File structure

**New files:**
- `archive-store.ts` — `loadArchived(stateDir): Set<string>`, `addArchived(stateDir, sessionId): void`. Owns the `archived-sessions.json` file.
- `archive-store.test.ts`
- `paginated-picker.ts` — `renderPickerPage({sessions, page, perPage, callbackPrefix, cancelCallback, rowLabelOf}): { rows, currentPage, totalPages }`. Pure helper, no I/O.
- `paginated-picker.test.ts`

**Modified files:**
- `sessions-list.ts` — extend `listProjectSessions(projectDir, stateDir?)` to read the archive file (when `stateDir` is provided) and filter out archived session IDs. Filter happens at this one site so all three pickers stay consistent automatically.
- `sessions-list.test.ts` — add filter cases.
- `meta-commands.ts` — refactor `handleSwitch` and `handleDelete` to use `renderPickerPage`; add `handleArchive`; add `meta:switch_page_<N>`, `meta:delete_page_<N>`, `meta:archive_*` callback branches in `tryHandleMetaCallback`; route `/archive` in `tryRouteMetaCommand`; add `archivePicker` map + `__resetArchivePickerForTests`.
- `meta-commands.test.ts` — add archive tests + pagination tests for all three commands.
- `commands-registry.ts` — append `/archive` `CommandSpec` to `COMMANDS`.
- `commands-registry.test.ts` — update the exact-list assertion to include `archive`.
- `.claude-plugin/plugin.json` — bump `version` to `0.0.13-mirza.0`.
- `package.json` — keep aligned at `0.0.13-mirza.0` (hygiene only; cache is bound to plugin.json).
- `../../.claude-plugin/marketplace.json` (repo-root) — update telegram `description` to mention `/archive` and pagination.

**No deletions.**

---

## Constants used across tasks

These names are referenced by multiple tasks — keep them consistent:

- `MAX_SESSIONS_PER_PAGE = 6` (per-page slot count after reserving 1 nav row + 1 cancel row)
- `ARCHIVE_FILENAME = 'archived-sessions.json'`
- Archive JSON shape: `{"archived":["<sid1>","<sid2>",…]}`. Tolerate plain-array file too (legacy / hand-edit), but always write the wrapped shape.

---

## Task 1: Create `archive-store` module

**Files:**
- Create: `archive-store.ts`
- Create: `archive-store.test.ts`

- [ ] **Step 1.1: Write the failing test**

Write `archive-store.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadArchived, addArchived } from './archive-store'

describe('archive-store', () => {
  let stateDir: string
  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'archive-store-test-'))
  })
  afterEach(() => {
    try { rmSync(stateDir, { recursive: true, force: true }) } catch {}
  })

  test('loadArchived returns empty set when file missing', () => {
    expect(loadArchived(stateDir)).toEqual(new Set())
  })

  test('loadArchived returns IDs from {"archived": [...]} shape', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), JSON.stringify({ archived: ['a', 'b'] }))
    expect(loadArchived(stateDir)).toEqual(new Set(['a', 'b']))
  })

  test('loadArchived tolerates plain-array legacy shape', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), JSON.stringify(['x', 'y']))
    expect(loadArchived(stateDir)).toEqual(new Set(['x', 'y']))
  })

  test('loadArchived returns empty set on malformed JSON', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), '{not json')
    expect(loadArchived(stateDir)).toEqual(new Set())
  })

  test('addArchived creates file with wrapped shape', () => {
    addArchived(stateDir, 'sid-1')
    const raw = readFileSync(join(stateDir, 'archived-sessions.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ archived: ['sid-1'] })
  })

  test('addArchived appends without duplicating', () => {
    addArchived(stateDir, 'sid-1')
    addArchived(stateDir, 'sid-2')
    addArchived(stateDir, 'sid-1') // duplicate
    const raw = readFileSync(join(stateDir, 'archived-sessions.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ archived: ['sid-1', 'sid-2'] })
  })

  test('addArchived creates the state dir if missing', () => {
    const nested = join(stateDir, 'does', 'not', 'exist')
    addArchived(nested, 'sid-1')
    expect(loadArchived(nested)).toEqual(new Set(['sid-1']))
  })
})
```

- [ ] **Step 1.2: Run test, expect failure**

Run: `bun test archive-store.test.ts`
Expected: FAIL — module `./archive-store` not found.

- [ ] **Step 1.3: Implement the module**

Write `archive-store.ts`:

```ts
/**
 * Per-project "soft delete" list. Session IDs in this file are filtered out
 * from the /switch, /delete, and /archive pickers in sessions-list.ts.
 *
 * The session's jsonl on disk is NOT touched — `claude --resume <sid>` from
 * a terminal still works. Unarchiving is intentionally not exposed via
 * Telegram; user opens the laptop and edits this file by hand.
 *
 * File location: <telegram-state-dir>/archived-sessions.json
 * Canonical shape: {"archived":["<sid>","<sid>",…]}
 * Legacy tolerated on read: plain array ["<sid>",…]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const FILENAME = 'archived-sessions.json'

/** Load the archived-IDs set. Missing/malformed → empty set. */
export function loadArchived(stateDir: string): Set<string> {
  const path = join(stateDir, FILENAME)
  if (!existsSync(path)) return new Set()
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return new Set()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Set()
  }
  if (Array.isArray(parsed)) {
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { archived?: unknown }).archived)) {
    return new Set(
      (parsed as { archived: unknown[] }).archived.filter(
        (x): x is string => typeof x === 'string',
      ),
    )
  }
  return new Set()
}

/** Append a sessionId to the archive (idempotent). Atomic tmp+rename write. */
export function addArchived(stateDir: string, sessionId: string): void {
  const existing = loadArchived(stateDir)
  if (existing.has(sessionId)) return
  existing.add(sessionId)
  const path = join(stateDir, FILENAME)
  const tmp = `${path}.tmp.${process.pid}`
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(tmp, JSON.stringify({ archived: Array.from(existing) }, null, 2))
  renameSync(tmp, path)
}
```

- [ ] **Step 1.4: Run test, expect pass**

Run: `bun test archive-store.test.ts`
Expected: PASS, 7 tests green.

- [ ] **Step 1.5: Commit**

```bash
cd plugins/telegram
git add archive-store.ts archive-store.test.ts docs/2026-05-20-archive-and-pagination-plan.md
git commit -m "feat(telegram): add archive-store module for soft-delete IDs"
```

---

## Task 2: Filter archived sessions in `listProjectSessions`

**Files:**
- Modify: `sessions-list.ts`
- Modify: `sessions-list.test.ts`

- [ ] **Step 2.1: Write the failing test**

Append to `sessions-list.test.ts` (within the existing `describe` for listProjectSessions, or create a new describe block):

```ts
import { addArchived } from './archive-store'

describe('listProjectSessions: archive filter', () => {
  let projectDir: string
  let stateDir: string
  // Use the test harness already in this file for creating tmp dirs +
  // seeding jsonl files. Reuse its helpers if they exist; otherwise inline
  // the minimal harness from meta-commands.test.ts.
  // [If sessions-list.test.ts has no harness, copy `mkProject` from
  // meta-commands.test.ts but pointing at ~/.claude/projects/<encoded> via
  // an env override — sessions-list.ts reads HOME via homedir(); the
  // existing test file already does this, follow that pattern.]

  test('filters out archived session IDs when stateDir provided', () => {
    // setup: 3 sessions in projectDir, archive one of them
    // (use the existing test's seedSession helper)
    const allSids = seedThreeSessions(projectDir)
    addArchived(stateDir, allSids[1]!)

    const result = listProjectSessions(projectDir, stateDir)
    expect(result.map(s => s.sessionId)).toEqual([allSids[0], allSids[2]])
  })

  test('does not filter when stateDir is omitted', () => {
    const allSids = seedThreeSessions(projectDir)
    addArchived(stateDir, allSids[1]!)
    const result = listProjectSessions(projectDir) // no stateDir
    expect(result.map(s => s.sessionId).sort()).toEqual([...allSids].sort())
  })
})
```

> Implementation note: read the existing `sessions-list.test.ts` first to see what seed helpers already exist (`seedSession`, `seedTwoSessions`, etc.). Reuse them. If only a 2-session helper exists, add a 3-session one alongside it.

- [ ] **Step 2.2: Run test, expect failure**

Run: `bun test sessions-list.test.ts`
Expected: FAIL — archived session still in result.

- [ ] **Step 2.3: Modify `listProjectSessions`**

In `sessions-list.ts`, after the `import` block, add:

```ts
import { loadArchived } from './archive-store'
```

Modify the body of `listProjectSessions` so that after the existing files list is materialised but before the SessionInfo mapping, archived IDs are filtered out:

Replace this block in `sessions-list.ts:183-211`:

```ts
export function listProjectSessions(
  projectDir: string,
  stateDir?: string,
): SessionInfo[] {
  const files = listSessionFiles(projectDir)
  if (files.length === 0) return []

  let registry: Map<string, { name: string; updatedAt: number }> | null = null
  if (stateDir) {
    registry = loadRegistry(stateDir)
    refreshFromPidFiles(registry, projectDir)
    saveRegistry(stateDir, registry)
  }

  const nameMap = loadNameMap(projectDir)
  const sessions: SessionInfo[] = files.map(({ sessionId, mtime }) => {
```

with:

```ts
export function listProjectSessions(
  projectDir: string,
  stateDir?: string,
): SessionInfo[] {
  let files = listSessionFiles(projectDir)
  if (files.length === 0) return []

  let registry: Map<string, { name: string; updatedAt: number }> | null = null
  if (stateDir) {
    registry = loadRegistry(stateDir)
    refreshFromPidFiles(registry, projectDir)
    saveRegistry(stateDir, registry)
    // Soft-delete filter: drop sessions the user has archived via Telegram.
    // Only applied when stateDir is known — caller without stateDir gets the
    // raw on-disk view (used in tests and any debug paths).
    const archived = loadArchived(stateDir)
    if (archived.size > 0) {
      files = files.filter(f => !archived.has(f.sessionId))
      if (files.length === 0) return []
    }
  }

  const nameMap = loadNameMap(projectDir)
  const sessions: SessionInfo[] = files.map(({ sessionId, mtime }) => {
```

- [ ] **Step 2.4: Run all tests, expect pass**

Run: `bun test sessions-list.test.ts`
Expected: PASS, including the two new archive-filter tests and all pre-existing tests.

Run the full plugin suite: `bun test`
Expected: All previously-passing tests still pass. (4 known pre-existing failures in `state-path.test.ts` on Windows are acceptable per CLAUDE.md.)

- [ ] **Step 2.5: Commit**

```bash
cd plugins/telegram
git add sessions-list.ts sessions-list.test.ts
git commit -m "feat(telegram): filter archived sessions in listProjectSessions"
```

---

## Task 3: Create `paginated-picker` shared helper

**Files:**
- Create: `paginated-picker.ts`
- Create: `paginated-picker.test.ts`

The helper renders the inline-keyboard rows for one page of a session picker. It does not call Telegram — pure function. Layout per page:

```
[session 1 label                ]    } up to MAX_SESSIONS_PER_PAGE rows
[session 2 label                ]    }
[...                            ]    }
[⬅️ Prev] [📄 N/M] [Next ➡️]      <- nav row; Prev omitted on page 1, Next omitted on last page
[❌ Cancel                       ]    <- cancel row
```

Page indexing is 1-based for user-facing display, 1-based in callbacks too (`meta:switch_page_1` means render page 1).

- [ ] **Step 3.1: Write the failing test**

Write `paginated-picker.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { renderPickerPage, MAX_SESSIONS_PER_PAGE } from './paginated-picker'

interface FakeSession { shortId: string; label: string }

const fakes = (n: number): FakeSession[] =>
  Array.from({ length: n }, (_, i) => ({
    shortId: `id${String(i).padStart(2, '0')}`,
    label: `session ${i}`,
  }))

const labelOf = (s: FakeSession) => s.label
const cbOf = (s: FakeSession) => `meta:switch_${s.shortId}`

describe('renderPickerPage', () => {
  test('MAX_SESSIONS_PER_PAGE is 6', () => {
    expect(MAX_SESSIONS_PER_PAGE).toBe(6)
  })

  test('single page (<=6 sessions): no nav row, just sessions + cancel', () => {
    const sessions = fakes(3)
    const { rows, currentPage, totalPages } = renderPickerPage({
      sessions, page: 1,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(currentPage).toBe(1)
    expect(totalPages).toBe(1)
    // 3 session rows + 1 cancel row = 4 rows total, no nav row.
    expect(rows.length).toBe(4)
    expect(rows[0]).toEqual([{ label: 'session 0', callbackData: 'meta:switch_id00' }])
    expect(rows[3]).toEqual([{ label: '❌ Cancel', callbackData: 'meta:switch_cancel' }])
  })

  test('exactly MAX (6) sessions: no nav row', () => {
    const sessions = fakes(6)
    const { rows, totalPages } = renderPickerPage({
      sessions, page: 1,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(totalPages).toBe(1)
    expect(rows.length).toBe(7) // 6 sessions + cancel
  })

  test('two pages: nav row with Next only on page 1', () => {
    const sessions = fakes(9) // 6 + 3
    const { rows, currentPage, totalPages } = renderPickerPage({
      sessions, page: 1,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(currentPage).toBe(1)
    expect(totalPages).toBe(2)
    expect(rows.length).toBe(8) // 6 sessions + nav + cancel
    expect(rows[6]).toEqual([
      { label: '📄 1/2', callbackData: 'meta:switch_page_noop' },
      { label: 'Next ➡️', callbackData: 'meta:switch_page_2' },
    ])
    expect(rows[7]).toEqual([{ label: '❌ Cancel', callbackData: 'meta:switch_cancel' }])
  })

  test('two pages: nav row with Prev only on last page', () => {
    const sessions = fakes(9)
    const { rows, currentPage } = renderPickerPage({
      sessions, page: 2,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(currentPage).toBe(2)
    // 3 sessions on page 2 (indices 6..8) + nav + cancel = 5 rows
    expect(rows.length).toBe(5)
    expect(rows[0]).toEqual([{ label: 'session 6', callbackData: 'meta:switch_id06' }])
    expect(rows[3]).toEqual([
      { label: '⬅️ Prev', callbackData: 'meta:switch_page_1' },
      { label: '📄 2/2', callbackData: 'meta:switch_page_noop' },
    ])
  })

  test('three pages: middle page has Prev, indicator, Next', () => {
    const sessions = fakes(15) // 3 pages of 6/6/3
    const { rows, currentPage, totalPages } = renderPickerPage({
      sessions, page: 2,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(currentPage).toBe(2)
    expect(totalPages).toBe(3)
    expect(rows.length).toBe(8) // 6 sessions + nav + cancel
    expect(rows[6]).toEqual([
      { label: '⬅️ Prev', callbackData: 'meta:switch_page_1' },
      { label: '📄 2/3', callbackData: 'meta:switch_page_noop' },
      { label: 'Next ➡️', callbackData: 'meta:switch_page_3' },
    ])
  })

  test('out-of-range page clamps to last page', () => {
    const sessions = fakes(9)
    const { currentPage, totalPages } = renderPickerPage({
      sessions, page: 99,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(totalPages).toBe(2)
    expect(currentPage).toBe(2)
  })

  test('page < 1 clamps to 1', () => {
    const sessions = fakes(9)
    const { currentPage } = renderPickerPage({
      sessions, page: 0,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(currentPage).toBe(1)
  })

  test('label longer than 60 chars is truncated with ellipsis', () => {
    const sessions: FakeSession[] = [{ shortId: 'x', label: 'a'.repeat(80) }]
    const { rows } = renderPickerPage({
      sessions, page: 1,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(rows[0]![0]!.label.length).toBeLessThanOrEqual(60)
    expect(rows[0]![0]!.label.endsWith('…')).toBe(true)
  })

  test('zero sessions yields just the cancel row', () => {
    const { rows, totalPages } = renderPickerPage({
      sessions: [], page: 1,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:switch_cancel',
      labelOf, sessionCallbackOf: cbOf,
    })
    expect(totalPages).toBe(1)
    expect(rows).toEqual([[{ label: '❌ Cancel', callbackData: 'meta:switch_cancel' }]])
  })
})
```

- [ ] **Step 3.2: Run test, expect failure**

Run: `bun test paginated-picker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement the helper**

Write `paginated-picker.ts`:

```ts
/**
 * Pure helper that renders one page of a Telegram inline-keyboard picker.
 *
 * Used by /switch, /delete, and /archive in meta-commands.ts. All three
 * pickers share the layout below. Keeping the renderer in one place avoids
 * drift between commands.
 *
 *   [session label …]      } up to MAX_SESSIONS_PER_PAGE single-cell rows
 *   …
 *   [⬅️ Prev] [📄 N/M] [Next ➡️]    nav row — Prev omitted on page 1,
 *                                    Next omitted on last page,
 *                                    whole row omitted when totalPages === 1.
 *   [❌ Cancel]                      always last row.
 *
 * The page indicator button uses a no-op callback (`<prefix>_page_noop`) —
 * tapping it acks silently in the callback handler.
 */

export const MAX_SESSIONS_PER_PAGE = 6
const MAX_LABEL_CHARS = 60

export interface PickerButton {
  label: string
  callbackData: string
}

export interface RenderPickerPageInput<S> {
  /** All sessions to paginate (full set, not pre-sliced). */
  sessions: ReadonlyArray<S>
  /** 1-based requested page. Clamped to [1, totalPages]. */
  page: number
  /** Callback prefix WITHOUT trailing underscore, e.g. `meta:switch`. */
  callbackPrefix: string
  /** Callback for the cancel button row. */
  cancelCallback: string
  /** How to display a session in its row. */
  labelOf: (s: S) => string
  /** How to encode the session-tap callback. */
  sessionCallbackOf: (s: S) => string
}

export interface RenderPickerPageOutput {
  rows: PickerButton[][]
  /** Clamped page actually rendered. */
  currentPage: number
  /** Total pages given the session count. Minimum 1 (empty list = 1 page). */
  totalPages: number
}

function trimLabel(s: string): string {
  return s.length > MAX_LABEL_CHARS ? s.slice(0, MAX_LABEL_CHARS - 1) + '…' : s
}

export function renderPickerPage<S>(input: RenderPickerPageInput<S>): RenderPickerPageOutput {
  const { sessions, callbackPrefix, cancelCallback, labelOf, sessionCallbackOf } = input
  const totalPages = Math.max(1, Math.ceil(sessions.length / MAX_SESSIONS_PER_PAGE))
  const currentPage = Math.min(Math.max(1, input.page), totalPages)

  const start = (currentPage - 1) * MAX_SESSIONS_PER_PAGE
  const slice = sessions.slice(start, start + MAX_SESSIONS_PER_PAGE)

  const rows: PickerButton[][] = []
  for (const s of slice) {
    rows.push([{ label: trimLabel(labelOf(s)), callbackData: sessionCallbackOf(s) }])
  }

  if (totalPages > 1) {
    const nav: PickerButton[] = []
    if (currentPage > 1) {
      nav.push({ label: '⬅️ Prev', callbackData: `${callbackPrefix}_page_${currentPage - 1}` })
    }
    nav.push({ label: `📄 ${currentPage}/${totalPages}`, callbackData: `${callbackPrefix}_page_noop` })
    if (currentPage < totalPages) {
      nav.push({ label: 'Next ➡️', callbackData: `${callbackPrefix}_page_${currentPage + 1}` })
    }
    rows.push(nav)
  }

  rows.push([{ label: '❌ Cancel', callbackData: cancelCallback }])

  return { rows, currentPage, totalPages }
}
```

- [ ] **Step 3.4: Run test, expect pass**

Run: `bun test paginated-picker.test.ts`
Expected: PASS, 10 tests green.

- [ ] **Step 3.5: Commit**

```bash
cd plugins/telegram
git add paginated-picker.ts paginated-picker.test.ts
git commit -m "feat(telegram): add paginated-picker shared helper"
```

---

## Task 4: Refactor `/switch` to use pagination

**Files:**
- Modify: `meta-commands.ts`
- Modify: `meta-commands.test.ts`

Switch from a 7-session truncated picker to a paginated one. The in-memory `switchPicker` map now holds ALL sessions (not just first 7) so taps on any page still resolve. Page navigation is a new `meta:switch_page_<N>` callback that calls `editMessage` with the keyboard for page N.

- [ ] **Step 4.1: Write the failing tests**

Append to `meta-commands.test.ts` (inside an existing `describe('meta-commands: tryRouteMetaCommand', …)` block or a new sibling describe):

```ts
import { __resetSwitchPickerForTests } from './meta-commands'

describe('/switch pagination', () => {
  // Reuse mkProject, setHeartbeat, makeHandler helpers already defined in this file.
  let projectDir: string
  let stateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    setHeartbeat(stateDir, new Date().toISOString())
    __resetSwitchPickerForTests()
  })
  afterEach(() => cleanup())

  test('picker for 9 sessions shows page 1 with Next, total 2 pages', async () => {
    // Seed 9 sessions in the project. Use the same approach the existing
    // /switch tests use (seedNSessions or equivalent helper).
    seedNSessions(projectDir, 9)
    const { handler, replies } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: stateDir }

    const consumed = await tryRouteMetaCommand('/switch', env, handler)
    expect(consumed).toBe(true)
    expect(replies).toHaveLength(1)
    const buttons = replies[0]!.buttons!
    // 6 session rows + 1 nav row + 1 cancel row = 8 rows.
    expect(buttons.length).toBe(8)
    expect(buttons[6]!.map(b => b.callbackData)).toEqual([
      'meta:switch_page_noop',
      'meta:switch_page_2',
    ])
  })

  test('page 2 callback re-renders with Prev only', async () => {
    seedNSessions(projectDir, 9)
    const { handler, replies } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: stateDir }

    await tryRouteMetaCommand('/switch', env, handler) // populates switchPicker with all 9
    const editCalls: string[] = []
    const editButtons: any[][] = []
    const cbHandler = {
      ackCallback: async () => {},
      editMessage: async (text: string) => { editCalls.push(text) },
      reply: async () => {},
      replyWithButtons: async (text: string, rows: any[][]) => {
        editCalls.push(text)
        editButtons.push(rows)
      },
    }
    // The page callback should NOT use replyWithButtons — it edits the message.
    // But the helper signature only exposes editMessage with text-only. For
    // page changes we must extend the callback-handler contract to accept
    // editMessageWithButtons. See Step 4.3.
    // (Test asserts the new field is called.)
    const consumed = await tryHandleMetaCallback('meta:switch_page_2', env, {
      ...cbHandler,
      editMessageWithButtons: async (text: string, rows: any[][]) => {
        editCalls.push(text)
        editButtons.push(rows)
      },
    } as any)
    expect(consumed).toBe(true)
    expect(editButtons).toHaveLength(1)
    const nav = editButtons[0]!.at(-2) // second-to-last row = nav
    expect(nav.map((b: any) => b.callbackData)).toEqual([
      'meta:switch_page_1',
      'meta:switch_page_noop',
    ])
  })

  test('tap session on page 2 still resolves (picker holds all sessions)', async () => {
    const sids = seedNSessions(projectDir, 9)
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: stateDir }
    await tryRouteMetaCommand('/switch', env, handler)
    // 9th session's shortId — taking the last one which would only appear on page 2.
    const lastShort = sids.at(-1)!.slice(0, 8).toLowerCase().replace(/-/g, '').slice(0, 8)
    // We don't import deriveShortId here, so re-derive identically.
    // (If a deriveShortId helper is exported, prefer it.)

    const cbHandler = {
      ackCallback: async () => {},
      editMessage: async () => {},
      reply: async () => {},
      replyWithButtons: async () => {},
      editMessageWithButtons: async () => {},
    }
    const consumed = await tryHandleMetaCallback(`meta:switch_${lastShort}`, env, cbHandler as any)
    expect(consumed).toBe(true)
    // Verify a wrapper payload was written
    expect(listPending(stateDir).length).toBe(1)
  })

  test('noop callback acks without action', async () => {
    seedNSessions(projectDir, 9)
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: stateDir }
    await tryRouteMetaCommand('/switch', env, handler)
    let acked = false
    const cbHandler = {
      ackCallback: async () => { acked = true },
      editMessage: async () => {},
      reply: async () => {},
      replyWithButtons: async () => {},
      editMessageWithButtons: async () => {},
    }
    const consumed = await tryHandleMetaCallback('meta:switch_page_noop', env, cbHandler as any)
    expect(consumed).toBe(true)
    expect(acked).toBe(true)
    // No pending payload, no edit.
    expect(listPending(stateDir).length).toBe(0)
  })
})
```

> Implementation note: the existing test file may not have a `seedNSessions(projectDir, n)` helper — check first and add one alongside existing seed helpers if absent. Each seeded session = an empty `.jsonl` file under `~/.claude/projects/<encoded>/`. Set distinct mtimes so sort order is deterministic.

- [ ] **Step 4.2: Run tests, expect failure**

Run: `bun test meta-commands.test.ts`
Expected: FAIL — switch pagination tests fail (no `meta:switch_page_*` handling yet; no `editMessageWithButtons` on the callback contract).

- [ ] **Step 4.3: Extend the callback-handler contract**

In `meta-commands.ts`, extend `MetaCallbackHandlers`:

```ts
export interface MetaCallbackHandlers {
  ackCallback: (text?: string) => Promise<void>
  editMessage: (text: string) => Promise<void>
  /** Edit the message that contained the buttons with a new keyboard. */
  editMessageWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
  reply: (text: string) => Promise<void>
  replyWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
}
```

> `server.ts` will need to wire `editMessageWithButtons` to its grammy `editMessageText({ reply_markup })` call. Search `server.ts` for the existing `editMessage` wiring (grep for the call site that constructs `editMessage:` in the `MetaCallbackHandlers` object) and add the new field there. Use the existing inline-keyboard serialiser already used for `replyWithButtons`.

- [ ] **Step 4.4: Refactor `handleSwitch`**

In `meta-commands.ts`, modify the picker map type to hold all sessions plus the page state, and replace the body of `handleSwitch` to delegate to `renderPickerPage`. Replace `meta-commands.ts:82-86`:

```ts
interface SwitchPickerEntry {
  sessionId: string
  label: string
}
const switchPicker = new Map<string, SwitchPickerEntry>()
```

with:

```ts
interface SwitchPickerEntry {
  sessionId: string
  label: string
  shortId: string
}
/**
 * The picker map now keeps EVERY session that was visible on /switch, not
 * just the current page. Page changes re-render from this set via
 * renderPickerPage; taps resolve from this map directly so a tap on page 2
 * doesn't need the page-1 keyboard around any more.
 */
const switchPicker = new Map<string, SwitchPickerEntry>()
let switchPickerSessions: SwitchPickerEntry[] = []
```

Remove the `MAX_SWITCH_BUTTONS = 7` constant and its comment (no longer needed — `MAX_SESSIONS_PER_PAGE` from `paginated-picker` is the source of truth). Add this import near the top:

```ts
import { renderPickerPage, type PickerButton } from './paginated-picker'
```

Replace `handleSwitch` (`meta-commands.ts:319-381`) with:

```ts
async function handleSwitch(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply(
      '⚠️ /switch cannot run: CLAUDE_PROJECT_DIR is not set.',
    )
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /switch cannot run: mirza-cc wrapper not detected.',
    )
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const currentEntry = currentSid ? all.find(s => s.sessionId === currentSid) : undefined
  const currentLabel = currentEntry?.label ?? (currentSid ? `session ${currentSid.slice(0, 8)}` : null)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply(
      currentLabel
        ? `Only one session in this project ("${currentLabel}"). No other session to switch to.`
        : 'No sessions in this project.',
    )
    return true
  }

  switchPicker.clear()
  switchPickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of switchPickerSessions) {
    switchPicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: switchPickerSessions,
    page: 1,
    callbackPrefix: 'meta:switch',
    cancelCallback: 'meta:cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:switch_${s.shortId}`,
  })
  const headline = headlineFor(currentLabel, currentPage, totalPages)
  await handlers.replyWithButtons(headline, rows)
  return true
}

function headlineFor(currentLabel: string | null, page: number, totalPages: number): string {
  const pageNote = totalPages > 1 ? ` (page ${page}/${totalPages})` : ''
  return currentLabel
    ? `🔀 Pick a session to switch to (currently on "${currentLabel}")${pageNote}:`
    : `🔀 Pick a session to switch to${pageNote}:`
}
```

- [ ] **Step 4.5: Add page-change callback branch**

In `meta-commands.ts`, inside `tryHandleMetaCallback`, before the existing `if (rest === 'cancel')` branch, add:

```ts
// /switch page navigation
if (rest.startsWith('switch_page_')) {
  const arg = rest.slice('switch_page_'.length)
  if (arg === 'noop') {
    await handlers.ackCallback()
    return true
  }
  const page = Number.parseInt(arg, 10)
  if (!Number.isFinite(page) || page < 1) {
    await handlers.ackCallback('Bad page')
    return true
  }
  if (switchPickerSessions.length === 0) {
    await handlers.ackCallback('Picker expired, run /switch again')
    await handlers.editMessage('(picker expired — please run /switch again)').catch(() => {})
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  const currentSid = stateDir ? readCurrentSessionId(stateDir) : null
  const currentLabel = (() => {
    if (!currentSid) return null
    const e = switchPickerSessions.find(s => s.sessionId === currentSid)
    return e?.label ?? `session ${currentSid.slice(0, 8)}`
  })()
  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: switchPickerSessions,
    page,
    callbackPrefix: 'meta:switch',
    cancelCallback: 'meta:cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:switch_${s.shortId}`,
  })
  await handlers.ackCallback()
  await handlers
    .editMessageWithButtons(headlineFor(currentLabel, currentPage, totalPages), rows)
    .catch(() => {})
  return true
}
```

Also extend `__resetSwitchPickerForTests` (`meta-commands.ts:605-607`) so it clears `switchPickerSessions` too:

```ts
export function __resetSwitchPickerForTests(): void {
  switchPicker.clear()
  switchPickerSessions = []
}
```

- [ ] **Step 4.6: Run tests, expect pass**

Run: `bun test meta-commands.test.ts`
Expected: PASS — including the 4 new pagination tests + all pre-existing /switch tests.

- [ ] **Step 4.7: Wire `editMessageWithButtons` in `server.ts`**

Search `server.ts` for the existing `editMessage` wiring inside the `MetaCallbackHandlers` object construction (it's the grammy call that uses `editMessageText` for callback responses). Add an `editMessageWithButtons` field next to it that builds the inline-keyboard markup the same way `replyWithButtons` does. The exact code depends on the local grammy version — follow the pattern already in the file. If a test boots the server, run it to verify; otherwise just confirm the field is exported and the types compile.

Run: `bun build server.ts --target=bun --outfile=/tmp/telegram-server-smoke.js`
Expected: Build succeeds with no type errors.

- [ ] **Step 4.8: Commit**

```bash
cd plugins/telegram
git add meta-commands.ts meta-commands.test.ts server.ts
git commit -m "feat(telegram): paginate /switch picker via shared helper"
```

---

## Task 5: Refactor `/delete` to use pagination

**Files:**
- Modify: `meta-commands.ts`
- Modify: `meta-commands.test.ts`

Mirror Task 4 for `/delete`. Same pattern: store all sessions in the picker map, render via `renderPickerPage`, add `meta:delete_page_<N>` callback.

- [ ] **Step 5.1: Write the failing tests**

Append a `/delete pagination` describe block to `meta-commands.test.ts` that mirrors the `/switch pagination` block from Task 4. Substitute `delete` for `switch` throughout: callback prefix, picker reset helper (`__resetDeletePickerForTests`), expected cancel callback `meta:delete_cancel`.

- [ ] **Step 5.2: Run, expect fail**

Run: `bun test meta-commands.test.ts`
Expected: FAIL — `/delete` pagination tests fail.

- [ ] **Step 5.3: Refactor `handleDelete` and the delete callback**

In `meta-commands.ts`, replace the `DeletePickerEntry` block (`meta-commands.ts:88-94`):

```ts
const MAX_DELETE_BUTTONS = 7 // same as /switch — reserve 1 row for cancel

interface DeletePickerEntry {
  sessionId: string
  label: string
}
const deletePicker = new Map<string, DeletePickerEntry>()
```

with:

```ts
interface DeletePickerEntry {
  sessionId: string
  label: string
  shortId: string
}
const deletePicker = new Map<string, DeletePickerEntry>()
let deletePickerSessions: DeletePickerEntry[] = []
```

Replace `handleDelete` (`meta-commands.ts:383-435`) with:

```ts
async function handleDelete(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /delete cannot run: CLAUDE_PROJECT_DIR is not set.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /delete cannot run: mirza-cc wrapper not detected.')
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply('No other sessions available to delete.')
    return true
  }

  deletePicker.clear()
  deletePickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of deletePickerSessions) {
    deletePicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: deletePickerSessions,
    page: 1,
    callbackPrefix: 'meta:delete',
    cancelCallback: 'meta:delete_cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:delete_${s.shortId}`,
  })
  const pageNote = totalPages > 1 ? ` (page ${currentPage}/${totalPages})` : ''
  await handlers.replyWithButtons(`🗑️ Pick a session to delete${pageNote}:`, rows)
  return true
}
```

Inside `tryHandleMetaCallback`, in the existing `if (rest.startsWith('delete_'))` block, BEFORE the `if (remainder === 'cancel')` line, insert page handling:

```ts
if (remainder.startsWith('page_')) {
  const arg = remainder.slice('page_'.length)
  if (arg === 'noop') {
    await handlers.ackCallback()
    return true
  }
  const page = Number.parseInt(arg, 10)
  if (!Number.isFinite(page) || page < 1) {
    await handlers.ackCallback('Bad page')
    return true
  }
  if (deletePickerSessions.length === 0) {
    await handlers.ackCallback('Picker expired, run /delete again')
    await handlers.editMessage('(picker expired — please run /delete again)').catch(() => {})
    return true
  }
  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: deletePickerSessions,
    page,
    callbackPrefix: 'meta:delete',
    cancelCallback: 'meta:delete_cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:delete_${s.shortId}`,
  })
  const pageNote = totalPages > 1 ? ` (page ${currentPage}/${totalPages})` : ''
  await handlers.ackCallback()
  await handlers
    .editMessageWithButtons(`🗑️ Pick a session to delete${pageNote}:`, rows)
    .catch(() => {})
  return true
}
```

Extend `__resetDeletePickerForTests` to clear `deletePickerSessions`:

```ts
export function __resetDeletePickerForTests(): void {
  deletePicker.clear()
  deletePickerSessions = []
}
```

- [ ] **Step 5.4: Run tests, expect pass**

Run: `bun test meta-commands.test.ts`
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
cd plugins/telegram
git add meta-commands.ts meta-commands.test.ts
git commit -m "feat(telegram): paginate /delete picker via shared helper"
```

---

## Task 6: Add `/archive` command (picker + confirm + commit-to-file)

**Files:**
- Modify: `meta-commands.ts`
- Modify: `meta-commands.test.ts`

`/archive` is a near-twin of `/delete`. Differences:
- On confirm, append session ID to `archived-sessions.json` instead of `rmSync` the jsonl.
- Confirmation message: `Archive '<name>'? (to unarchive, edit the file manually)` — no "PERMANENT" warning because it's reversible by file edit.
- Callback prefix: `meta:archive`. Cancel: `meta:archive_cancel`. Confirm: `meta:archive_confirm_<shortId>`.

- [ ] **Step 6.1: Write the failing tests**

Append `/archive` describe block to `meta-commands.test.ts`. Cases:

```ts
import { __resetArchivePickerForTests } from './meta-commands'
import { loadArchived } from './archive-store'

describe('/archive', () => {
  let projectDir: string
  let stateDir: string
  let telegramStateDir: string
  let cleanup: () => void
  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    telegramStateDir = stateDir // tests can reuse; filter resolves via env
    cleanup = ctx.cleanup
    setHeartbeat(stateDir, new Date().toISOString())
    __resetArchivePickerForTests()
  })
  afterEach(() => cleanup())

  test('/archive replies with picker excluding current session', async () => {
    const sids = seedNSessions(projectDir, 3)
    writeFileSync(join(stateDir, 'wrapper.current_session_id'), sids[0]!)
    const { handler, replies } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: telegramStateDir }
    const consumed = await tryRouteMetaCommand('/archive', env, handler)
    expect(consumed).toBe(true)
    expect(replies).toHaveLength(1)
    const labels = replies[0]!.buttons!.flat().map(b => b.label)
    expect(labels.some(l => l === '❌ Cancel')).toBe(true)
    // current session not present
    expect(replies[0]!.buttons!.flatMap(r => r.map(b => b.callbackData)))
      .not.toContain(`meta:archive_${sids[0]!.replace(/-/g, '').slice(0, 8)}`)
  })

  test('tap session → confirmation prompt with archive-specific copy', async () => {
    const sids = seedNSessions(projectDir, 2)
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: telegramStateDir }
    await tryRouteMetaCommand('/archive', env, handler)
    const targetShort = sids[1]!.replace(/-/g, '').slice(0, 8)
    const replies: any[] = []
    const cbHandler = {
      ackCallback: async () => {},
      editMessage: async () => {},
      editMessageWithButtons: async () => {},
      reply: async () => {},
      replyWithButtons: async (text: string, rows: any[][]) => {
        replies.push({ text, rows })
      },
    }
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cbHandler as any)
    expect(replies).toHaveLength(1)
    expect(replies[0].text).toContain('Archive')
    expect(replies[0].text).toContain('to unarchive, edit the file manually')
    expect(replies[0].rows[0].map((b: any) => b.callbackData)).toEqual([
      `meta:archive_confirm_${targetShort}`,
      'meta:archive_cancel',
    ])
  })

  test('confirm → session ID written to archived-sessions.json', async () => {
    const sids = seedNSessions(projectDir, 2)
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: telegramStateDir }
    await tryRouteMetaCommand('/archive', env, handler)
    const target = sids[1]!
    const targetShort = target.replace(/-/g, '').slice(0, 8)
    const cbHandler = {
      ackCallback: async () => {},
      editMessage: async () => {},
      editMessageWithButtons: async () => {},
      reply: async () => {},
      replyWithButtons: async () => {},
    }
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cbHandler as any)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cbHandler as any)

    expect(loadArchived(telegramStateDir)).toEqual(new Set([target]))
  })

  test('after archive, next /switch picker filters it out', async () => {
    const sids = seedNSessions(projectDir, 3)
    writeFileSync(join(stateDir, 'wrapper.current_session_id'), sids[0]!)
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: telegramStateDir }

    addArchived(telegramStateDir, sids[2]!)

    const { handler, replies } = makeHandler()
    await tryRouteMetaCommand('/switch', env, handler)
    const callbacks = replies[0]!.buttons!.flatMap(r => r.map(b => b.callbackData))
    const sid2Short = sids[2]!.replace(/-/g, '').slice(0, 8)
    expect(callbacks).not.toContain(`meta:switch_${sid2Short}`)
  })

  test('cancel branch closes picker', async () => {
    seedNSessions(projectDir, 2)
    const cbHandler = {
      ackCallback: async () => {},
      editMessage: async () => {},
      editMessageWithButtons: async () => {},
      reply: async () => {},
      replyWithButtons: async () => {},
    }
    const env = { CLAUDE_PROJECT_DIR: projectDir, TELEGRAM_STATE_DIR: telegramStateDir }
    const consumed = await tryHandleMetaCallback('meta:archive_cancel', env, cbHandler as any)
    expect(consumed).toBe(true)
  })
})
```

- [ ] **Step 6.2: Run, expect fail**

Run: `bun test meta-commands.test.ts`
Expected: FAIL — no `/archive` route, no `__resetArchivePickerForTests` export, no archive callback handling.

- [ ] **Step 6.3: Add state map**

In `meta-commands.ts`, after the `deletePickerSessions` declaration, add:

```ts
interface ArchivePickerEntry {
  sessionId: string
  label: string
  shortId: string
}
const archivePicker = new Map<string, ArchivePickerEntry>()
let archivePickerSessions: ArchivePickerEntry[] = []
```

Add the `addArchived` import at the top:

```ts
import { addArchived } from './archive-store'
```

- [ ] **Step 6.4: Route `/archive`**

In `tryRouteMetaCommand`, alongside the `/delete` route (`meta-commands.ts:191`), add:

```ts
if (lower === '/archive') {
  return handleArchive(env, handlers)
}
```

- [ ] **Step 6.5: Implement `handleArchive`**

Below `handleDelete`, add:

```ts
async function handleArchive(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /archive cannot run: CLAUDE_PROJECT_DIR is not set.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /archive cannot run: mirza-cc wrapper not detected.')
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply('No other sessions available to archive.')
    return true
  }

  archivePicker.clear()
  archivePickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of archivePickerSessions) {
    archivePicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: archivePickerSessions,
    page: 1,
    callbackPrefix: 'meta:archive',
    cancelCallback: 'meta:archive_cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:archive_${s.shortId}`,
  })
  const pageNote = totalPages > 1 ? ` (page ${currentPage}/${totalPages})` : ''
  await handlers.replyWithButtons(`📦 Pick a session to archive${pageNote}:`, rows)
  return true
}
```

- [ ] **Step 6.6: Handle archive callbacks**

In `tryHandleMetaCallback`, after the existing `delete_` block, add an `archive_` block (mirror of delete, minus the active-session check, with archive-specific copy):

```ts
if (rest.startsWith('archive_')) {
  const remainder = rest.slice('archive_'.length)

  if (remainder.startsWith('page_')) {
    const arg = remainder.slice('page_'.length)
    if (arg === 'noop') { await handlers.ackCallback(); return true }
    const page = Number.parseInt(arg, 10)
    if (!Number.isFinite(page) || page < 1) {
      await handlers.ackCallback('Bad page')
      return true
    }
    if (archivePickerSessions.length === 0) {
      await handlers.ackCallback('Picker expired, run /archive again')
      await handlers.editMessage('(picker expired — please run /archive again)').catch(() => {})
      return true
    }
    const { rows, currentPage, totalPages } = renderPickerPage({
      sessions: archivePickerSessions,
      page,
      callbackPrefix: 'meta:archive',
      cancelCallback: 'meta:archive_cancel',
      labelOf: s => s.label,
      sessionCallbackOf: s => `meta:archive_${s.shortId}`,
    })
    const pageNote = totalPages > 1 ? ` (page ${currentPage}/${totalPages})` : ''
    await handlers.ackCallback()
    await handlers.editMessageWithButtons(`📦 Pick a session to archive${pageNote}:`, rows).catch(() => {})
    return true
  }

  if (remainder === 'cancel') {
    await handlers.ackCallback('Cancelled')
    await handlers.editMessage('(archive cancelled)').catch(() => {})
    return true
  }

  if (remainder.startsWith('confirm_')) {
    const shortId = remainder.slice('confirm_'.length)
    if (!SHORT_ID_RE.test(shortId)) {
      await handlers.ackCallback('Bad short id')
      return true
    }
    const entry = archivePicker.get(shortId)
    if (!entry) {
      await handlers.ackCallback('Prompt expired')
      await handlers.editMessage('(prompt expired — run /archive again)').catch(() => {})
      return true
    }
    const telegramStateDir = resolveTelegramStateDir(env)
    if (!telegramStateDir) {
      await handlers.ackCallback('TELEGRAM_STATE_DIR not set')
      return true
    }
    try {
      addArchived(telegramStateDir, entry.sessionId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await handlers.ackCallback(`Archive failed: ${msg}`)
      return true
    }
    await handlers.ackCallback('session archived')
    await handlers.editMessage(`📦 session "${entry.label}" archived.`).catch(() => {})
    archivePicker.delete(shortId)
    return true
  }

  // Plain picker tap: `archive_<shortId>` — prompt for confirm
  const shortId = remainder
  if (!SHORT_ID_RE.test(shortId)) {
    await handlers.ackCallback('Bad short id')
    return true
  }
  const entry = archivePicker.get(shortId)
  if (!entry) {
    await handlers.ackCallback('Picker expired')
    await handlers.editMessage('(picker expired — run /archive again)').catch(() => {})
    return true
  }
  await handlers.ackCallback('Konfirmasi diperlukan')
  await handlers
    .editMessage(`📦 Pick a session to archive → ${entry.label}`)
    .catch(() => {})
  await handlers.replyWithButtons(
    `Archive session "${entry.label}"? (to unarchive, edit the file manually)`,
    [[
      { label: '✅ Confirm', callbackData: `meta:archive_confirm_${shortId}` },
      { label: '❌ Cancel', callbackData: 'meta:archive_cancel' },
    ]],
  )
  return true
}
```

- [ ] **Step 6.7: Add the reset helper**

At the bottom of `meta-commands.ts` near the other `__reset*ForTests` exports:

```ts
export function __resetArchivePickerForTests(): void {
  archivePicker.clear()
  archivePickerSessions = []
}
```

- [ ] **Step 6.8: Run tests, expect pass**

Run: `bun test meta-commands.test.ts`
Expected: PASS (all `/archive` tests green, all pre-existing tests still green).

- [ ] **Step 6.9: Commit**

```bash
cd plugins/telegram
git add meta-commands.ts meta-commands.test.ts
git commit -m "feat(telegram): add /archive command with picker + confirm flow"
```

---

## Task 7: Register `/archive` in the slash menu

**Files:**
- Modify: `commands-registry.ts`
- Modify: `commands-registry.test.ts`

- [ ] **Step 7.1: Update the test first**

In `commands-registry.test.ts`, update the exact-list assertion:

```ts
test('contains exactly the 8 commands in the spec, in display order', () => {
  expect(COMMANDS.map(c => c.name)).toEqual([
    'start',
    'help',
    'status',
    'new',
    'switch',
    'delete',
    'archive',
    'rename',
  ])
})
```

Update any test name that previously said "7 commands" to "8 commands".

- [ ] **Step 7.2: Run, expect fail**

Run: `bun test commands-registry.test.ts`
Expected: FAIL — array doesn't include `'archive'`.

- [ ] **Step 7.3: Add the `archive` entry**

In `commands-registry.ts`, insert this CommandSpec between the `'delete'` and `'rename'` entries:

```ts
{
  name: 'archive',
  menuHint: 'Hide a session from the picker',
  helpSummary: 'Archive (soft-delete) a Claude session',
  helpDetail:
    'Shows an inline picker of non-current sessions; tapping one asks for confirmation, then adds that session to the archive file (archived-sessions.json) instead of deleting the jsonl. Archived sessions disappear from /switch, /delete, and /archive. The jsonl on disk is left untouched — `claude --resume` from a terminal can still reach it. To un-archive, edit archived-sessions.json on your laptop.',
},
```

- [ ] **Step 7.4: Run, expect pass**

Run: `bun test commands-registry.test.ts`
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
cd plugins/telegram
git add commands-registry.ts commands-registry.test.ts
git commit -m "feat(telegram): register /archive in commands-registry"
```

---

## Task 8: Version bump + marketplace description + final sanity check

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `package.json` (hygiene)
- Modify: `../../.claude-plugin/marketplace.json` (repo root)

- [ ] **Step 8.1: Bump `.claude-plugin/plugin.json`**

Open `plugins/telegram/.claude-plugin/plugin.json` and change the `"version"` value from `"0.0.12-mirza.0"` to `"0.0.13-mirza.0"`. (Verify via `ls ~/.claude/plugins/cache/mirza-marketplace/telegram/` that 0.0.13-mirza.0 is not already cached.)

- [ ] **Step 8.2: Align `package.json`**

If `plugins/telegram/package.json` has a `"version"` field, update it to `"0.0.13-mirza.0"` for hygiene. (The cache binds to `plugin.json` only — this is documentation.)

- [ ] **Step 8.3: Update marketplace description**

Open `.claude-plugin/marketplace.json` (repo root). Find the telegram entry's `description` and replace:

```
"description": "Custom Telegram channel for Claude Code. Forked from the official Telegram plugin, with per-project state, a registry-driven slash menu, and /status that shows context window plus session info.",
```

with:

```
"description": "Custom Telegram channel for Claude Code. Forked from the official Telegram plugin, with per-project state, a registry-driven slash menu, /status that shows context window plus session info, /archive for soft-deleting sessions, and Prev/Next pagination across the session pickers.",
```

- [ ] **Step 8.4: Full-suite sanity check**

Run from `plugins/telegram/`:

```bash
bun test
```

Expected: All tests pass except the 4 known Windows-only failures in `state-path.test.ts`.

Run the boot smoke check:

```bash
bun build server.ts --target=bun --outfile=/tmp/telegram-server-smoke.js
```

Expected: Build succeeds, no type errors.

- [ ] **Step 8.5: Final commit**

```bash
cd ../..   # repo root
git add plugins/telegram/.claude-plugin/plugin.json plugins/telegram/package.json .claude-plugin/marketplace.json
git commit -m "release(telegram): bump to 0.0.13-mirza.0 — /archive + picker pagination"
```

- [ ] **Step 8.6: Activation note for the user**

After merge to main, the user must:
1. Run `/reload-plugins` in Claude Code
2. Run `/mcp` and reconnect telegram
3. Force-close + reopen Telegram on their phone (otherwise the slash-menu cache hides the new `/archive`)

Mention this in the final reply.

---

## Acceptance checklist

When all tasks are complete, manually verify on the phone:

- [ ] `/switch` shows pagination when there are >6 non-current sessions; Prev hidden on page 1, Next hidden on last page.
- [ ] `/delete` same pagination behavior.
- [ ] `/archive` works: picker → tap session → confirm prompt with "to unarchive, edit the file manually" → confirm → success message.
- [ ] After archiving a session, that session no longer appears in `/switch`, `/delete`, or `/archive`.
- [ ] Archived session's jsonl still exists in `~/.claude/projects/<encoded>/`.
- [ ] Editing `<project>/.claude/channels/telegram/archived-sessions.json` to remove a session ID brings it back into the pickers.
- [ ] `/help archive` shows the new help text.
- [ ] BotFather slash-menu in Telegram includes `/archive`.
