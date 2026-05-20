# Telegram `/effort` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram `/effort` command that lets the user change Claude Code's effort level (`low | medium | high | xhigh | max | auto`) from a phone — either by tapping a picker keyboard or by typing `/effort <level>` directly.

**Architecture:** Mirror the existing `/rename` pattern. Telegram intercepts `/effort` before AI relay, writes a `{command:"/effort <level>"}` payload to the pty-controller wrapper inbox, and the wrapper injects the slash into the live PTY. CC processes it natively. The no-arg form first renders an inline-keyboard picker; a tap fires a `meta:effort_<level>` callback that writes the same payload. No wrapper-side changes, no persistence.

**Tech Stack:** TypeScript + Bun + grammy. Tests use `bun:test` with real-fs tmpdirs (no mocks), matching the rest of `meta-commands.test.ts`.

**Spec:** `docs/superpowers/specs/2026-05-20-telegram-effort-command-design.md` (commit `5f04027`).

---

## File Structure

| File | Role |
|------|------|
| `plugins/telegram/meta-commands.ts` | Add `EFFORT_LEVELS` constant, `parseEffortInput` helper, `extractCurrentEffortLevel` helper, `handleEffortDirect`, `handleEffortPicker`, and a `meta:effort_*` branch in `tryHandleMetaCallback`. |
| `plugins/telegram/meta-commands.test.ts` | Add tests for parsing, picker rendering, with-arg direct path, invalid arg, and callback handling. |
| `plugins/telegram/commands-registry.ts` | Append a `CommandSpec` entry for `effort`. Drives `/help`, `/help effort`, and BotFather menu. |
| `plugins/telegram/context-renderer.ts` | Extend `StatusLinePayload` type with `effort?: { level?: string }`; append `Effort: <level>` to the meta lines rendered by `/status`. |
| `plugins/telegram/context-renderer.test.ts` | Add a test for the new `/status` line. |

No wrapper-side changes. No `server.ts` changes (callback dispatch already routes any `meta:*` to `tryHandleMetaCallback`).

---

## Task 1: `EFFORT_LEVELS` constant + `parseEffortInput` pure helper

Pure parsing logic separated from the I/O parts so it's trivially unit-testable.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts` (top of file, after imports/constants block)
- Test: `plugins/telegram/meta-commands.test.ts` (new `describe` block)

- [ ] **Step 1: Add the failing tests**

In `plugins/telegram/meta-commands.test.ts`, append a new `describe` block at the bottom of the file (before the very last lines if any). Also add `parseEffortInput, EFFORT_LEVELS` to the existing import from `./meta-commands`:

```ts
// Update the existing import line near the top of the file to include the new symbols:
import {
  tryRouteMetaCommand,
  tryHandleMetaCallback,
  __resetDeletePickerForTests,
  __resetSwitchPickerForTests,
  __resetArchivePickerForTests,
  parseEffortInput,
  EFFORT_LEVELS,
} from './meta-commands'
```

Then append:

```ts
describe('meta-commands: parseEffortInput', () => {
  test('exposes the six valid effort levels', () => {
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
  })

  test('"/effort" alone → picker request', () => {
    expect(parseEffortInput('/effort')).toEqual({ kind: 'picker' })
  })

  test('trailing whitespace after "/effort" → picker request', () => {
    expect(parseEffortInput('/effort   ')).toEqual({ kind: 'picker' })
  })

  test('"/effort <valid>" → direct apply with normalised level', () => {
    expect(parseEffortInput('/effort low')).toEqual({ kind: 'direct', level: 'low' })
    expect(parseEffortInput('/effort  HIGH  ')).toEqual({ kind: 'direct', level: 'high' })
    expect(parseEffortInput('/effort\tauto')).toEqual({ kind: 'direct', level: 'auto' })
  })

  test('"/effort <invalid>" → invalid', () => {
    expect(parseEffortInput('/effort sometimes')).toEqual({ kind: 'invalid', token: 'sometimes' })
    expect(parseEffortInput('/effort 5')).toEqual({ kind: 'invalid', token: '5' })
  })

  test('newline/CR in arg is stripped before validation', () => {
    expect(parseEffortInput('/effort low\n')).toEqual({ kind: 'direct', level: 'low' })
    expect(parseEffortInput('/effort\nhigh')).toEqual({ kind: 'direct', level: 'high' })
  })

  test('extra positional args beyond the level → invalid (treats whole rest as token)', () => {
    expect(parseEffortInput('/effort low and high')).toEqual({ kind: 'invalid', token: 'low and high' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep parseEffortInput`
Expected: FAIL with `parseEffortInput is not a function` / `EFFORT_LEVELS is undefined`.

- [ ] **Step 3: Implement the constant + helper**

In `plugins/telegram/meta-commands.ts`, just below the existing `const SHORT_ID_RE = /^[0-9a-f]{8}$/` line (around line 42), add:

```ts
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const
export type EffortLevel = typeof EFFORT_LEVELS[number]

export type EffortInput =
  | { kind: 'picker' }
  | { kind: 'direct'; level: EffortLevel }
  | { kind: 'invalid'; token: string }

/**
 * Parse a raw "/effort ..." Telegram input. Whitespace is collapsed,
 * embedded CR/LF stripped, the level is lowercased. Returns:
 *   - { kind:'picker' }      → no argument, render the picker
 *   - { kind:'direct', level } → valid effort level, apply directly
 *   - { kind:'invalid', token } → anything else; caller replies with usage
 *
 * Assumes the input already matched the "/effort" prefix in the router.
 */
export function parseEffortInput(text: string): EffortInput {
  const stripped = text.replace(/[\r\n]+/g, ' ')
  const lower = stripped.toLowerCase().trim()
  if (lower === '/effort') return { kind: 'picker' }
  if (!lower.startsWith('/effort ') && !lower.startsWith('/effort\t')) {
    // Defensive — the caller should only hand us "/effort..." strings.
    return { kind: 'invalid', token: lower }
  }
  const rest = stripped.slice('/effort'.length).trim().toLowerCase()
  if (rest.length === 0) return { kind: 'picker' }
  if ((EFFORT_LEVELS as readonly string[]).includes(rest)) {
    return { kind: 'direct', level: rest as EffortLevel }
  }
  return { kind: 'invalid', token: rest }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep parseEffortInput`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): EFFORT_LEVELS constant + parseEffortInput helper"
```

---

## Task 2: `extractCurrentEffortLevel` helper (reads `last-status.json`)

A small I/O helper kept in `meta-commands.ts` for proximity to its only caller (the picker handler), with tests covering the file-shape variants.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Add the failing tests**

Append in `meta-commands.test.ts`:

```ts
import { extractCurrentEffortLevel } from './meta-commands'

describe('meta-commands: extractCurrentEffortLevel', () => {
  let projectDir: string
  let telegramStateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    cleanup = ctx.cleanup
  })
  afterEach(() => cleanup())

  test('returns null when last-status.json is missing', () => {
    expect(extractCurrentEffortLevel({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })

  test('returns null when last-status.json is malformed', () => {
    writeFileSync(join(telegramStateDir, 'last-status.json'), '{ this is not json')
    expect(extractCurrentEffortLevel({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })

  test('returns level when payload.effort.level is a known value', () => {
    writeFileSync(
      join(telegramStateDir, 'last-status.json'),
      JSON.stringify({ captured_at_ms: 1, payload: { effort: { level: 'high' } } }),
    )
    expect(extractCurrentEffortLevel({ CLAUDE_PROJECT_DIR: projectDir })).toBe('high')
  })

  test('returns null when payload.effort.level is an unknown value', () => {
    writeFileSync(
      join(telegramStateDir, 'last-status.json'),
      JSON.stringify({ captured_at_ms: 1, payload: { effort: { level: 'turbo' } } }),
    )
    expect(extractCurrentEffortLevel({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })

  test('returns null when payload has no effort field at all', () => {
    writeFileSync(
      join(telegramStateDir, 'last-status.json'),
      JSON.stringify({ captured_at_ms: 1, payload: { session_id: 'abc' } }),
    )
    expect(extractCurrentEffortLevel({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep extractCurrentEffortLevel`
Expected: FAIL with `extractCurrentEffortLevel is not a function`.

- [ ] **Step 3: Implement the helper**

In `plugins/telegram/meta-commands.ts`, near the other small file-reading helpers (after `readCurrentSessionId`, around line 138), add:

```ts
/**
 * Read `<telegramStateDir>/last-status.json` and return the current effort
 * level if the payload carries a known value, otherwise null. Tolerant of
 * missing file, malformed JSON, and unknown level strings.
 */
export function extractCurrentEffortLevel(
  env: Record<string, string | undefined>,
): EffortLevel | null {
  const telegramStateDir = resolveTelegramStateDir(env)
  if (!telegramStateDir) return null
  const file = join(telegramStateDir, 'last-status.json')
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: { payload?: { effort?: { level?: unknown } } }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const level = parsed?.payload?.effort?.level
  if (typeof level !== 'string') return null
  if ((EFFORT_LEVELS as readonly string[]).includes(level)) {
    return level as EffortLevel
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep extractCurrentEffortLevel`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): extractCurrentEffortLevel helper for /effort picker"
```

---

## Task 3: `handleEffortDirect` (with-arg path) + route hook-up

Handles `/effort <level>` by writing to the wrapper inbox. Mirrors `handleRename` shape.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Add the failing tests**

Append in `meta-commands.test.ts`:

```ts
describe('meta-commands: /effort <level> (direct)', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    setHeartbeat(stateDir, new Date().toISOString())
  })
  afterEach(() => cleanup())

  test('valid level writes {command:"/effort <level>"} to wrapper inbox', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/effort low', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/effort low')
    expect(replies.length).toBe(1)
    expect(replies[0].text).toContain('low')
  })

  test('invalid level replies usage and does NOT write to wrapper inbox', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/effort turbo', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(0)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toContain('low, medium, high, xhigh, max, auto')
  })

  test('case-insensitive and whitespace-tolerant', async () => {
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommandT('/effort   HIGH  ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(replies[0].text).toContain('high')
    const pending = listPending(stateDir)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/effort high')
  })

  test('warns when CLAUDE_PROJECT_DIR is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/effort low', {}, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
  })

  test('warns when wrapper heartbeat is stale', async () => {
    rmSync(join(stateDir, 'wrapper.heartbeat'), { force: true })
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/effort low', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper/i)
    expect(listPending(stateDir).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "/effort <level>"`
Expected: FAIL because `/effort` is not yet routed (`returns false` / no replies).

- [ ] **Step 3: Add `handleEffortDirect` and wire it into the router**

In `meta-commands.ts`, just before the closing `return false` of `tryRouteMetaCommand`, add a new branch (around line 226, right after the `/rename` branch):

```ts
  // Match `/effort` (exact) or `/effort` followed by whitespace + arg.
  if (lower === '/effort' || lower.startsWith('/effort ') || lower.startsWith('/effort\t')) {
    const parsed = parseEffortInput(trimmed)
    if (parsed.kind === 'picker') {
      return handleEffortPicker(env, handlers)
    }
    if (parsed.kind === 'invalid') {
      await handlers.reply(
        `⚠️ /effort butuh salah satu: ${EFFORT_LEVELS.join(', ')}`,
      )
      return true
    }
    return handleEffortDirect(env, handlers, parsed.level)
  }
```

Then add `handleEffortDirect` after `handleRename` (around line 345):

```ts
async function handleEffortDirect(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
  level: EffortLevel,
): Promise<boolean> {
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir) {
    await handlers.reply(
      '⚠️ /effort tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  if (!wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /effort tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }
  try {
    writeWrapperCommand(stateDir, { command: `/effort ${level}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /effort gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  await handlers.reply(`🎯 Effort: ${level}`)
  return true
}
```

Also add a stub for `handleEffortPicker` so this task compiles. Place it just below `handleEffortDirect`:

```ts
async function handleEffortPicker(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  // Real implementation lands in Task 4. Stub keeps the wiring compileable
  // and lets Task 3's tests exercise the with-arg path independently.
  await handlers.reply('(picker — implemented in Task 4)')
  return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "/effort <level>"`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): /effort <level> direct-apply path"
```

---

## Task 4: `handleEffortPicker` (no-arg path) — render the keyboard

Replace the stub with the real picker. Six effort buttons + cancel; the current effort (read via `extractCurrentEffortLevel`) gets a `→ ` prefix on its label.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Add the failing tests**

Append in `meta-commands.test.ts`:

```ts
describe('meta-commands: /effort (no-arg picker)', () => {
  let projectDir: string
  let stateDir: string
  let telegramStateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    cleanup = ctx.cleanup
    setHeartbeat(stateDir, new Date().toISOString())
  })
  afterEach(() => cleanup())

  test('renders six effort buttons + cancel in 3x2 + 1 layout', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/effort', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    const rows = replies[0].buttons!
    expect(rows.length).toBe(4) // 3 effort rows + 1 cancel row
    expect(rows[0].length).toBe(2)
    expect(rows[1].length).toBe(2)
    expect(rows[2].length).toBe(2)
    expect(rows[3].length).toBe(1)
    const labels = rows.slice(0, 3).flatMap(r => r.map(b => b.label.replace(/^→ /, '')))
    expect(labels).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'auto'])
    const callbacks = rows.slice(0, 3).flatMap(r => r.map(b => b.callbackData))
    expect(callbacks).toEqual([
      'meta:effort_low', 'meta:effort_medium', 'meta:effort_high',
      'meta:effort_xhigh', 'meta:effort_max', 'meta:effort_auto',
    ])
    expect(rows[3][0].callbackData).toBe('meta:effort_cancel')
  })

  test('marks current effort with → prefix when status payload is available', async () => {
    writeFileSync(
      join(telegramStateDir, 'last-status.json'),
      JSON.stringify({ captured_at_ms: 1, payload: { effort: { level: 'high' } } }),
    )
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommandT('/effort', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const labels = replies[0].buttons!.slice(0, 3).flatMap(r => r.map(b => b.label))
    expect(labels).toContain('→ high')
    expect(labels.filter(l => l.startsWith('→ '))).toHaveLength(1)
  })

  test('no → marker when status payload is missing', async () => {
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommandT('/effort', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const labels = replies[0].buttons!.slice(0, 3).flatMap(r => r.map(b => b.label))
    expect(labels.every(l => !l.startsWith('→ '))).toBe(true)
  })

  test('does NOT write to wrapper inbox (picker is render-only)', async () => {
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/effort', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(listPending(stateDir).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "/effort \\(no-arg picker\\)"`
Expected: FAIL because the stub from Task 3 calls `handlers.reply`, not `handlers.replyWithButtons`.

- [ ] **Step 3: Replace the stub with the real implementation**

Replace the `handleEffortPicker` stub from Task 3 with:

```ts
async function handleEffortPicker(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const current = extractCurrentEffortLevel(env)
  const labelFor = (lvl: EffortLevel): string =>
    lvl === current ? `→ ${lvl}` : lvl
  const rows: MetaCommandButton[][] = [
    [
      { label: labelFor('low'),    callbackData: 'meta:effort_low' },
      { label: labelFor('medium'), callbackData: 'meta:effort_medium' },
    ],
    [
      { label: labelFor('high'),  callbackData: 'meta:effort_high' },
      { label: labelFor('xhigh'), callbackData: 'meta:effort_xhigh' },
    ],
    [
      { label: labelFor('max'),  callbackData: 'meta:effort_max' },
      { label: labelFor('auto'), callbackData: 'meta:effort_auto' },
    ],
    [
      { label: '❌ Batal', callbackData: 'meta:effort_cancel' },
    ],
  ]
  await handlers.replyWithButtons('🎯 Pilih effort level untuk session ini', rows)
  return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "/effort \\(no-arg picker\\)"`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): /effort no-arg picker with current-level marker"
```

---

## Task 5: `meta:effort_*` callback handler

When the user taps a picker button, the inbound carries `meta:effort_<level>` (or `meta:effort_cancel`). Route those through `tryHandleMetaCallback` exactly like `meta:switch_*` is routed.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Test: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Add the failing tests**

Append in `meta-commands.test.ts`. We need a callback handler factory parallel to the existing `makeHandler` — copy this from earlier in the file if a similar helper already exists, otherwise add it here:

```ts
interface RecordedCallbackOp {
  kind: 'ack' | 'edit' | 'editWithButtons' | 'reply' | 'replyWithButtons'
  text?: string
  buttons?: ReadonlyArray<ReadonlyArray<{ label: string; callbackData: string }>>
}
function makeCallbackHandler(): {
  handler: {
    ackCallback: (text?: string) => Promise<void>
    editMessage: (text: string) => Promise<void>
    editMessageWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
    reply: (text: string) => Promise<void>
    replyWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
  }
  ops: RecordedCallbackOp[]
} {
  const ops: RecordedCallbackOp[] = []
  return {
    ops,
    handler: {
      ackCallback: async text => { ops.push({ kind: 'ack', text }) },
      editMessage: async text => { ops.push({ kind: 'edit', text }) },
      editMessageWithButtons: async (text, rows) => { ops.push({ kind: 'editWithButtons', text, buttons: rows }) },
      reply: async text => { ops.push({ kind: 'reply', text }) },
      replyWithButtons: async (text, rows) => { ops.push({ kind: 'replyWithButtons', text, buttons: rows }) },
    },
  }
}

describe('meta-commands: tryHandleMetaCallback effort_*', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    setHeartbeat(stateDir, new Date().toISOString())
  })
  afterEach(() => cleanup())

  test('meta:effort_low writes /effort low to wrapper and edits picker to confirmation', async () => {
    const { handler, ops } = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:effort_low', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/effort low')
    expect(ops.find(o => o.kind === 'ack')).toBeDefined()
    expect(ops.find(o => o.kind === 'edit')?.text).toContain('low')
  })

  test('meta:effort_cancel does NOT write to wrapper; picker edited to "tidak diubah"', async () => {
    const { handler, ops } = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:effort_cancel', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(0)
    expect(ops.find(o => o.kind === 'edit')?.text).toMatch(/tidak diubah/i)
  })

  test('meta:effort_<each-of-6-levels> all write the correct command', async () => {
    for (const lvl of EFFORT_LEVELS) {
      const ctx = mkProject()
      setHeartbeat(ctx.stateDir, new Date().toISOString())
      const { handler } = makeCallbackHandler()
      await tryHandleMetaCallback(`meta:effort_${lvl}`, { CLAUDE_PROJECT_DIR: ctx.projectDir }, handler)
      const pending = readdirSync(join(ctx.stateDir, 'pending'))
      const payload = JSON.parse(readFileSync(join(ctx.stateDir, 'pending', pending[0]), 'utf8'))
      expect(payload.command).toBe(`/effort ${lvl}`)
      ctx.cleanup()
    }
  })

  test('meta:effort_unknown → unknown action ack, no wrapper write', async () => {
    const { handler, ops } = makeCallbackHandler()
    await tryHandleMetaCallback('meta:effort_turbo', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(listPending(stateDir).length).toBe(0)
    const ack = ops.find(o => o.kind === 'ack')
    expect(ack?.text).toMatch(/unknown/i)
  })

  test('wrapper write failure surfaces via ackCallback and edit, no throw', async () => {
    // Force write failure by removing the pending dir and making the parent read-only is fragile
    // across OSes — instead, simulate by missing CLAUDE_PROJECT_DIR
    const { handler, ops } = makeCallbackHandler()
    await tryHandleMetaCallback('meta:effort_low', {}, handler)
    const ack = ops.find(o => o.kind === 'ack')
    expect(ack?.text).toMatch(/CLAUDE_PROJECT_DIR/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "tryHandleMetaCallback effort_"`
Expected: FAIL — `meta:effort_*` falls through to the "Unknown meta action" branch today.

- [ ] **Step 3: Add the `effort_` branch to `tryHandleMetaCallback`**

In `meta-commands.ts`, inside `tryHandleMetaCallback`, **before** the final "Unknown meta:..." fall-through (around line 845), add:

```ts
  if (rest.startsWith('effort_')) {
    const remainder = rest.slice('effort_'.length)
    if (remainder === 'cancel') {
      await handlers.ackCallback('Effort tidak diubah')
      await handlers.editMessage('❌ Effort tidak diubah.').catch(() => {})
      return true
    }
    if (!(EFFORT_LEVELS as readonly string[]).includes(remainder)) {
      await handlers.ackCallback('Unknown effort level')
      return true
    }
    const level = remainder as EffortLevel
    const stateDir = resolvePtyStateDir(env)
    if (!stateDir) {
      await handlers.ackCallback('CLAUDE_PROJECT_DIR not set')
      return true
    }
    if (!wrapperHeartbeatFresh(stateDir)) {
      await handlers.ackCallback('Wrapper not detected')
      await handlers.editMessage('⚠️ /effort gagal: mirza-cc wrapper tidak terdeteksi.').catch(() => {})
      return true
    }
    try {
      writeWrapperCommand(stateDir, { command: `/effort ${level}` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await handlers.ackCallback(`Gagal kirim: ${msg}`)
      await handlers.editMessage(`⚠️ /effort gagal menulis ke wrapper: ${msg}`).catch(() => {})
      return true
    }
    await handlers.ackCallback(`Effort: ${level}`)
    await handlers.editMessage(`🎯 Effort: ${level} ✅`).catch(() => {})
    return true
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd plugins/telegram && bun test meta-commands.test.ts --grep "tryHandleMetaCallback effort_"`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "feat(telegram): meta:effort_* callback handler"
```

---

## Task 6: Register `/effort` in `commands-registry.ts`

One entry — `/help`, `/help effort`, and BotFather's slash menu all read from this single source.

**Files:**
- Modify: `plugins/telegram/commands-registry.ts`
- Test: existing `commands-registry.test.ts` will assert the count if it does, otherwise no change.

- [ ] **Step 1: Append the entry to COMMANDS**

In `plugins/telegram/commands-registry.ts`, append a new entry to the `COMMANDS` array. Place it in alphabetical / logical position relative to neighbours — recommended placement is after the existing entry for `/rename` (or wherever session-management commands cluster):

```ts
  {
    name: 'effort',
    menuHint: 'Set effort level (low..max, auto)',
    helpSummary: 'Change Claude\'s effort level for this session',
    helpDetail:
      'Without an argument, shows a picker with the six effort levels: low, medium, high, xhigh, max, auto. The currently-active level (read from the statusLine bridge) is marked with a "→ " prefix. Tap to apply. With an argument (e.g. /effort low), applies directly without the picker. Effort is session-scoped in Claude Code — /new resets to the CC default; this command does not persist the choice across sessions. Requires the mirza-cc wrapper to be running.',
  },
```

- [ ] **Step 2: Run any existing registry tests**

Run: `cd plugins/telegram && bun test commands-registry.test.ts`
Expected: PASS (the new entry just lengthens the list; tests that don't assert on a specific count will continue to pass; tests that DO assert a count need a +1 — adjust if they fail).

- [ ] **Step 3: Manual eyeball — /help renderers pick it up**

Open `plugins/telegram/commands-registry.ts` and confirm the new entry has all four fields populated (`name`, `menuHint`, `helpSummary`, `helpDetail`).

- [ ] **Step 4: Commit**

```bash
git add plugins/telegram/commands-registry.ts
git commit -m "feat(telegram): register /effort in commands-registry"
```

---

## Task 7: Extend `StatusLinePayload` + surface effort in `/status`

The statusLine payload already carries `effort.level` (verified live). Add the type field and append `Effort: <level>` to the `/status` rendering.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Test: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Add the failing test**

In `plugins/telegram/context-renderer.test.ts`, find the existing block that exercises `renderContextReply` against a payload containing `thinking.enabled` and add a test parallel to it:

```ts
test('renders Effort line when payload.effort.level is present', () => {
  const reply = renderContextReply({
    captured_at_ms: Date.now(),
    payload: {
      // include the minimum required by the renderer; lift from an existing
      // test fixture in this file to stay consistent with its conventions
      session_id: 'sid-1',
      effort: { level: 'high' },
      thinking: { enabled: true },
    } as any,
  }, { lastStatus: undefined as unknown as LastStatus })
  expect(reply).toContain('Effort: high')
})
```

(Adjust the fixture shape to match what the other tests in the file use — the goal is just to verify the new line appears.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd plugins/telegram && bun test context-renderer.test.ts --grep "Effort line"`
Expected: FAIL — the renderer doesn't emit `Effort:` yet.

- [ ] **Step 3: Extend the type**

In `plugins/telegram/context-renderer.ts`, find the `StatusLinePayload` interface (around line 17-21) and add the `effort` field. The current shape is:

```ts
  cost?: { total_cost_usd?: number }
  thinking?: { enabled?: boolean }
  fast_mode?: boolean
```

Change to:

```ts
  cost?: { total_cost_usd?: number }
  thinking?: { enabled?: boolean }
  effort?: { level?: string }
  fast_mode?: boolean
```

- [ ] **Step 4: Emit the new line**

Locate the existing block (around line 149-153) that emits `Thinking: on/off`:

```ts
  if (typeof p.thinking?.enabled === 'boolean') {
    meta.push(`Thinking: ${p.thinking.enabled ? 'on' : 'off'}`)
  }
```

Immediately below it, add:

```ts
  if (typeof p.effort?.level === 'string' && p.effort.level.length > 0) {
    meta.push(`Effort: ${p.effort.level}`)
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd plugins/telegram && bun test context-renderer.test.ts --grep "Effort line"`
Expected: PASS.

- [ ] **Step 6: Run the full context-renderer suite to verify nothing regressed**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "feat(telegram): surface effort.level in /status output"
```

---

## Task 8: Full suite verification + push

Confirm nothing in the rest of the plugin broke, then push.

- [ ] **Step 1: Run the full plugin test suite**

Run: `cd plugins/telegram && bun test`
Expected: All tests PASS except the 4 pre-existing `state-path` Windows path-separator failures known from earlier work today. No NEW failures.

- [ ] **Step 2: Sanity-check that the meta-command import surface is intact**

Run: `cd plugins/telegram && bun -e "import('./meta-commands.ts').then(m => console.log(Object.keys(m).sort()))"`
Expected output includes (at minimum):
  - `EFFORT_LEVELS`
  - `extractCurrentEffortLevel`
  - `parseEffortInput`
  - `tryHandleMetaCallback`
  - `tryRouteMetaCommand`
  - existing `__reset*ForTests` helpers

- [ ] **Step 3: Push to origin/main**

```bash
git push origin main
```

Expected: clean push, no conflicts.

- [ ] **Step 4: Manual smoke test (user-side, optional but recommended)**

After `/reload-plugins` or restarting the CC session so the new server.ts is live:
- In Telegram, send `/effort` (no args) → picker appears with the six levels + Batal; current level (if `/status` was ever run) has the `→ ` prefix.
- Tap one level → message edits to `🎯 Effort: <level> ✅`. In the CC terminal, the effort change shows up in real time.
- Send `/effort low` directly → bot replies `🎯 Effort: low`. CC's effort updates.
- Send `/effort sometimes` → bot replies with the usage line listing valid values; CC unchanged.
- Run `/status` → output now contains an `Effort: <level>` line.

---

## Self-Review Notes

- **Spec coverage:** Each section of the spec maps to at least one task:
  - "Behavior → /effort (no argument) — show picker" → Tasks 1 (parsing), 2 (current level), 4 (picker render)
  - "Behavior → /effort <level> — direct apply" → Tasks 1 (parsing), 3 (handler)
  - "Behavior → Callback handling" → Task 5
  - "Behavior → Wrapper integration" → covered by Tasks 3 and 5 reusing `writeWrapperCommand`
  - "Picker UX details" → Task 4
  - "Files to touch" → Tasks 1-7 in order
  - "Testing plan" → Tests embedded in each task
- **Placeholder scan:** No "TODO" / "TBD". Stub in Task 3 (`handleEffortPicker`) is explicitly replaced in Task 4 step 3 with the real implementation; called out so an out-of-order reader doesn't ship the stub.
- **Type consistency:** `EffortLevel`, `EffortInput`, `EFFORT_LEVELS` defined in Task 1 and referenced consistently through Tasks 3, 4, 5. Callback prefix `meta:effort_` consistent across Tasks 4 (emit) and 5 (consume).
