# Telegram `/context` Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti output `renderContextReply()` di Telegram bot agar menampilkan Context (% + token absolut), Rate Limit 5h & 7d (% + reset), metadata sesi (model, session, cwd, cost, thinking, fast), dan timestamp last-update — sesuai spec di `docs/superpowers/specs/2026-05-17-telegram-context-renderer-design.md`.

**Architecture:** Extract `renderContextReply` + helpers dari `plugins/telegram/server.ts` ke modul terpisah `plugins/telegram/context-renderer.ts` (pola yang sudah dipakai untuk `state-path.ts`, `album-buffer.ts`, dll) supaya bisa di-unit-test tanpa boot bot. Tambah helper baru (`formatTokens`, `formatResetRemain`, `shortCwd`, `shortSession`), perluas type `StatusLinePayload`, lalu rewrite body renderer. Plain text output, skip baris/section kalau field absen (kecuali Context yang core).

**Tech Stack:** TypeScript, Bun runtime, `bun:test` framework.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `plugins/telegram/context-renderer.ts` | **Create** | All pure helpers + `renderContextReply` + `StatusLinePayload`/`LastStatus` types |
| `plugins/telegram/context-renderer.test.ts` | **Create** | Unit tests for renderer + helpers |
| `plugins/telegram/server.ts` | **Modify** | Remove inline helpers/types/renderer; import from `context-renderer.ts` |

`server.ts` modifications limited to lines ~824-977 (old helpers/types/renderer). The `bot.command('context', …)` handler keeps calling `renderContextReply(status)` — only the import source changes.

---

## Task 1: Extract renderer to standalone module (refactor baseline)

**Goal:** Move existing renderer & helpers to new module without changing observable behavior. Lock current behavior with tests so the next tasks can refactor confidently.

**Files:**
- Create: `plugins/telegram/context-renderer.ts`
- Create: `plugins/telegram/context-renderer.test.ts`
- Modify: `plugins/telegram/server.ts` (lines 824-977 area)

- [ ] **Step 1: Create `context-renderer.ts` with existing logic verbatim**

Create `plugins/telegram/context-renderer.ts`:

```typescript
// Renderer for Telegram /context reply.
// Pure functions only — no I/O, no bot, no env access. Lives in its own
// module so it can be unit-tested without booting server.ts.

export type StatusLinePayload = {
  context_window?: { used_percentage?: number }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
  }
}

export type LastStatus = { captured_at_ms: number; payload: StatusLinePayload }

export function progressBar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct * width) / 100)))
  return '●'.repeat(filled) + '○'.repeat(width - filled)
}

export function formatRelativeMs(ageMs: number): string {
  if (ageMs < 0) return 'baru'
  const sec = Math.floor(ageMs / 1000)
  if (sec < 60) return `${sec}s lalu`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m lalu`
  const hr = Math.floor(min / 60)
  const rm = min % 60
  return rm ? `${hr}h ${rm}m lalu` : `${hr}h lalu`
}

// Asia/Jakarta is UTC+7 year-round, no DST — compute directly to avoid Intl.
export function formatJakartaHM(epochMs: number): string {
  const d = new Date(epochMs + 7 * 3600 * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} WIB`
}

export function renderContextReply(status: LastStatus, nowMs: number = Date.now()): string {
  const ctx = status.payload.context_window?.used_percentage
  const five = status.payload.rate_limits?.five_hour
  const fivePct = five?.used_percentage
  const resetsAt = five?.resets_at

  const ctxLine = typeof ctx === 'number'
    ? `${progressBar(ctx)} ${Math.round(ctx)}%`
    : '(tidak tersedia)'
  const usageLine = typeof fivePct === 'number'
    ? `${progressBar(fivePct)} ${Math.round(fivePct)}%`
    : '(tidak tersedia — butuh Pro/Max & 1 request dulu)'

  let resetLine = '(tidak tersedia)'
  if (typeof resetsAt === 'number') {
    const remain = resetsAt - Math.floor(nowMs / 1000)
    if (remain > 0) {
      const h = Math.floor(remain / 3600)
      const m = Math.floor((remain % 3600) / 60)
      resetLine = `(${h}h ${m}m / 5h)`
    } else {
      resetLine = '(reset baru saja)'
    }
  }

  const age = nowMs - status.captured_at_ms
  const lastLine = `Last update: ${formatJakartaHM(status.captured_at_ms)} (${formatRelativeMs(age)})`

  return [
    `Context`,
    ctxLine,
    ``,
    `Usage`,
    usageLine,
    ``,
    `Reset`,
    resetLine,
    ``,
    lastLine,
  ].join('\n')
}
```

Note: signature of `renderContextReply` now takes optional `nowMs` (defaults to `Date.now()`) so tests can pin time. The old version read `Date.now()` inline twice — same default behavior.

- [ ] **Step 2: Write baseline tests locking current behavior**

Create `plugins/telegram/context-renderer.test.ts`:

```typescript
import { test, expect, describe } from 'bun:test'
import {
  progressBar,
  formatRelativeMs,
  formatJakartaHM,
  renderContextReply,
  type LastStatus,
} from './context-renderer'

describe('progressBar', () => {
  test('0% renders all empty', () => {
    expect(progressBar(0)).toBe('○○○○○○○○○○')
  })
  test('100% renders all filled', () => {
    expect(progressBar(100)).toBe('●●●●●●●●●●')
  })
  test('40% renders 4 filled', () => {
    expect(progressBar(40)).toBe('●●●●○○○○○○')
  })
  test('clamps negative to 0', () => {
    expect(progressBar(-10)).toBe('○○○○○○○○○○')
  })
  test('clamps over 100 to 100', () => {
    expect(progressBar(150)).toBe('●●●●●●●●●●')
  })
})

describe('formatRelativeMs', () => {
  test('negative → "baru"', () => {
    expect(formatRelativeMs(-1000)).toBe('baru')
  })
  test('seconds', () => {
    expect(formatRelativeMs(45_000)).toBe('45s lalu')
  })
  test('minutes', () => {
    expect(formatRelativeMs(3 * 60_000)).toBe('3m lalu')
  })
  test('hours with remainder', () => {
    expect(formatRelativeMs(2 * 3600_000 + 15 * 60_000)).toBe('2h 15m lalu')
  })
  test('exact hours', () => {
    expect(formatRelativeMs(3 * 3600_000)).toBe('3h lalu')
  })
})

describe('formatJakartaHM', () => {
  test('UTC midnight → 07:00 WIB', () => {
    expect(formatJakartaHM(Date.UTC(2026, 4, 17, 0, 0, 0))).toBe('07:00 WIB')
  })
  test('UTC 10:42 → 17:42 WIB', () => {
    expect(formatJakartaHM(Date.UTC(2026, 4, 17, 10, 42, 0))).toBe('17:42 WIB')
  })
})

describe('renderContextReply (baseline — current layout)', () => {
  const status: LastStatus = {
    captured_at_ms: Date.UTC(2026, 4, 17, 10, 42, 0),
    payload: {
      context_window: { used_percentage: 5 },
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: Math.floor(Date.UTC(2026, 4, 17, 12, 39, 0) / 1000) },
      },
    },
  }
  const nowMs = Date.UTC(2026, 4, 17, 10, 45, 0)  // 3 minutes after capture

  test('produces full reply', () => {
    const out = renderContextReply(status, nowMs)
    expect(out).toContain('Context')
    expect(out).toContain('●○○○○○○○○○ 5%')
    expect(out).toContain('Usage')
    expect(out).toContain('●●●●○○○○○○ 40%')
    expect(out).toContain('Reset')
    expect(out).toContain('Last update: 17:42 WIB (3m lalu)')
  })
})
```

- [ ] **Step 3: Run tests to verify baseline passes**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all tests PASS (this proves the extracted module behaves identically to inline code).

- [ ] **Step 4: Update `server.ts` to import from new module**

In `plugins/telegram/server.ts`:

Delete lines 824-977 (the inline `progressBar`, `formatRelativeMs`, `formatJakartaHM`, type definitions, `renderContextReply`). Keep `loadLastStatus`, `ensureContextBridgeInstalled`, the `bot.command('context', ...)` handler, and the `CONTEXT_BRIDGE_PATH`/`PROJECT_DIR` constants.

Add this import near the top of the file (next to the existing local imports around line 28):

```typescript
import { renderContextReply, type LastStatus, type StatusLinePayload } from './context-renderer.ts'
```

Search & verify no other references to the removed local symbols remain (they were only used by `renderContextReply` internally).

- [ ] **Step 5: Run full plugin test suite + boot smoke test**

Run: `cd plugins/telegram && bun test`

Expected: all tests PASS including `server-boot.test.ts` (which spawns `server.ts` and would fail if imports are broken).

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts plugins/telegram/server.ts
git commit -m "$(cat <<'EOF'
telegram: extract /context renderer to standalone module

Pure-function module enables unit testing without booting server.ts.
Behavior unchanged; baseline tests lock current output.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `formatTokens` helper

**Goal:** Format absolute token counts as `46.7k`, `1M`, `1.5M`.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `context-renderer.test.ts`:

```typescript
import { formatTokens } from './context-renderer'

describe('formatTokens', () => {
  test('0 → "0"', () => {
    expect(formatTokens(0)).toBe('0')
  })
  test('under 1000 → raw number', () => {
    expect(formatTokens(42)).toBe('42')
    expect(formatTokens(999)).toBe('999')
  })
  test('thousands with 1 decimal', () => {
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(46747)).toBe('46.7k')
    expect(formatTokens(999_999)).toBe('1000.0k')
  })
  test('exact 1M', () => {
    expect(formatTokens(1_000_000)).toBe('1M')
  })
  test('millions with 1 decimal', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(2_300_000)).toBe('2.3M')
  })
  test('exact integer millions render without decimal', () => {
    expect(formatTokens(3_000_000)).toBe('3M')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: FAIL with "formatTokens is not a function" or similar.

- [ ] **Step 3: Implement `formatTokens` in `context-renderer.ts`**

Add to `context-renderer.ts`:

```typescript
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  const millions = n / 1_000_000
  return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: add formatTokens helper for context renderer

Formats absolute token counts as 46.7k / 1M / 1.5M for the context line.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `formatResetRemain` helper (supports days)

**Goal:** Replace inline 5h-specific reset formatting with a general helper that emits `5m`, `1h 57m`, `6d 10h`, or `reset baru saja`. Will be used by both 5h and 7d sections.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `context-renderer.test.ts`:

```typescript
import { formatResetRemain } from './context-renderer'

describe('formatResetRemain', () => {
  // Use nowMs = epoch 1_000_000 (in ms = 1_000_000_000)
  const nowMs = 1_000_000_000
  const nowSec = nowMs / 1000

  test('past or zero → "reset baru saja"', () => {
    expect(formatResetRemain(nowSec, nowMs)).toBe('reset baru saja')
    expect(formatResetRemain(nowSec - 10, nowMs)).toBe('reset baru saja')
  })
  test('minutes only', () => {
    expect(formatResetRemain(nowSec + 5 * 60, nowMs)).toBe('5m')
  })
  test('hours + minutes', () => {
    expect(formatResetRemain(nowSec + 1 * 3600 + 57 * 60, nowMs)).toBe('1h 57m')
  })
  test('exact hours', () => {
    expect(formatResetRemain(nowSec + 3 * 3600, nowMs)).toBe('3h')
  })
  test('days + hours', () => {
    expect(formatResetRemain(nowSec + 6 * 86400 + 10 * 3600, nowMs)).toBe('6d 10h')
  })
  test('exact days', () => {
    expect(formatResetRemain(nowSec + 2 * 86400, nowMs)).toBe('2d')
  })
  test('seconds only (under 1 minute) → 0m', () => {
    expect(formatResetRemain(nowSec + 30, nowMs)).toBe('0m')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `formatResetRemain` in `context-renderer.ts`**

Add to `context-renderer.ts`:

```typescript
export function formatResetRemain(resetsAtSec: number, nowMs: number = Date.now()): string {
  const remainSec = resetsAtSec - Math.floor(nowMs / 1000)
  if (remainSec <= 0) return 'reset baru saja'
  const days = Math.floor(remainSec / 86400)
  const hours = Math.floor((remainSec % 86400) / 3600)
  const minutes = Math.floor((remainSec % 3600) / 60)
  if (days > 0) {
    return hours ? `${days}d ${hours}h` : `${days}d`
  }
  if (hours > 0) {
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: add formatResetRemain helper (supports days)

Generalizes the 5-hour reset formatter to also handle 7-day window.
Emits "5m" / "1h 57m" / "6d 10h" / "reset baru saja".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `shortCwd` and `shortSession` helpers

**Goal:** Format CWD as `…/parent/leaf` (2 trailing segments), session ID as first 8 characters.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `context-renderer.test.ts`:

```typescript
import { shortCwd, shortSession } from './context-renderer'

describe('shortCwd', () => {
  test('long path → last 2 segments with ellipsis prefix', () => {
    expect(shortCwd('/Users/mirza/Workspace/mirza-marketplace/sandbox/folder_two'))
      .toBe('…/sandbox/folder_two')
  })
  test('exactly 2 segments → returns with ellipsis prefix', () => {
    expect(shortCwd('/foo/bar')).toBe('…/foo/bar')
  })
  test('single segment → returns as-is', () => {
    expect(shortCwd('/foo')).toBe('/foo')
  })
  test('trailing slash stripped', () => {
    expect(shortCwd('/a/b/c/d/')).toBe('…/c/d')
  })
  test('empty string → empty string', () => {
    expect(shortCwd('')).toBe('')
  })
})

describe('shortSession', () => {
  test('takes first 8 chars', () => {
    expect(shortSession('8a16303d-4706-4ee2-a54b-782a3e4000eb')).toBe('8a16303d')
  })
  test('shorter than 8 → returns as-is', () => {
    expect(shortSession('abc123')).toBe('abc123')
  })
  test('empty → empty', () => {
    expect(shortSession('')).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement helpers in `context-renderer.ts`**

Add to `context-renderer.ts`:

```typescript
export function shortCwd(path: string): string {
  if (!path) return ''
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const segments = trimmed.split('/').filter(s => s.length > 0)
  if (segments.length < 2) return trimmed
  const tail = segments.slice(-2).join('/')
  return `…/${tail}`
}

export function shortSession(id: string): string {
  return id.slice(0, 8)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: add shortCwd and shortSession helpers

shortCwd truncates to last 2 path segments with ellipsis prefix.
shortSession takes first 8 chars of UUID-style session ID.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extend `StatusLinePayload` type with new fields

**Goal:** Widen the payload type so new fields used by the rewritten renderer compile cleanly.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`

- [ ] **Step 1: Replace `StatusLinePayload` definition**

In `context-renderer.ts`, replace the `StatusLinePayload` type with:

```typescript
export type StatusLinePayload = {
  session_id?: string
  cwd?: string
  model?: { display_name?: string }
  context_window?: {
    used_percentage?: number
    total_input_tokens?: number
    context_window_size?: number
  }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
    seven_day?: { used_percentage?: number; resets_at?: number }
  }
  cost?: { total_cost_usd?: number }
  thinking?: { enabled?: boolean }
  fast_mode?: boolean
}
```

- [ ] **Step 2: Run typecheck to confirm no breakage**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: tests still PASS (widening a type with optional fields is backward-compatible; old tests don't reference the new fields).

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/context-renderer.ts
git commit -m "$(cat <<'EOF'
telegram: extend StatusLinePayload with session/model/cost/cwd/thinking

Widens the type with optional fields for the upcoming /context renderer
rewrite. Backward-compatible.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rewrite `renderContextReply` with new layout

**Goal:** Produce the final layout per spec. Plain text, no markdown. Skip missing fields per the rules.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Replace baseline render tests with new-layout tests**

In `context-renderer.test.ts`, **delete the existing `describe('renderContextReply (baseline …`** block and replace with:

```typescript
describe('renderContextReply (new layout)', () => {
  const capturedAtMs = Date.UTC(2026, 4, 17, 10, 42, 0)
  const nowMs = Date.UTC(2026, 4, 17, 10, 45, 0)  // 3 min later
  const fiveHourReset = Math.floor(Date.UTC(2026, 4, 17, 12, 39, 0) / 1000)  // +1h57m
  const sevenDayReset = Math.floor(Date.UTC(2026, 4, 23, 21, 0, 0) / 1000)   // +6d10h roughly

  const fullStatus: LastStatus = {
    captured_at_ms: capturedAtMs,
    payload: {
      session_id: '8a16303d-4706-4ee2-a54b-782a3e4000eb',
      cwd: '/Users/mirza/Workspace/mirza-marketplace/sandbox/folder_two',
      model: { display_name: 'Opus 4.7 (1M context)' },
      context_window: {
        used_percentage: 5,
        total_input_tokens: 46747,
        context_window_size: 1_000_000,
      },
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: fiveHourReset },
        seven_day: { used_percentage: 9, resets_at: sevenDayReset },
      },
      cost: { total_cost_usd: 0.8023515 },
      thinking: { enabled: true },
      fast_mode: false,
    },
  }

  test('full payload produces all sections in order', () => {
    const out = renderContextReply(fullStatus, nowMs)
    const expected = [
      'Context',
      '●○○○○○○○○○ 5%',
      '46.7k / 1M tokens',
      '',
      'Rate Limit 5h',
      '●●●●○○○○○○ 40%',
      'reset 1h 57m',
      '',
      'Rate Limit 7d',
      '●○○○○○○○○○ 9%',
      'reset 6d 10h',
      '',
      'Opus 4.7 (1M context)',
      'Session: 8a16303d',
      'CWD: …/sandbox/folder_two',
      'Cost: $0.80',
      'Thinking: on',
      'Fast: off',
      '',
      'Last update: 17:42 WIB',
      '(3m lalu)',
    ].join('\n')
    expect(out).toBe(expected)
  })

  test('thinking disabled renders "off"', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, thinking: { enabled: false } },
    }
    expect(renderContextReply(s, nowMs)).toContain('Thinking: off')
  })

  test('fast_mode true renders "on"', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, fast_mode: true },
    }
    expect(renderContextReply(s, nowMs)).toContain('Fast: on')
  })

  test('missing seven_day omits the Rate Limit 7d block', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: {
        ...fullStatus.payload,
        rate_limits: { five_hour: fullStatus.payload.rate_limits!.five_hour },
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Rate Limit 7d')
    expect(out).toContain('Rate Limit 5h')
  })

  test('missing cost / thinking / fast_mode omits those lines', () => {
    const s: LastStatus = {
      captured_at_ms: capturedAtMs,
      payload: {
        session_id: fullStatus.payload.session_id,
        cwd: fullStatus.payload.cwd,
        model: fullStatus.payload.model,
        context_window: fullStatus.payload.context_window,
        rate_limits: fullStatus.payload.rate_limits,
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Cost:')
    expect(out).not.toContain('Thinking:')
    expect(out).not.toContain('Fast:')
  })

  test('missing model omits the model line but keeps Session/CWD', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, model: undefined },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Opus 4.7')
    expect(out).toContain('Session: 8a16303d')
    expect(out).toContain('CWD: …/sandbox/folder_two')
  })

  test('missing context_window still shows Context section with placeholder', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, context_window: undefined },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).toContain('Context')
    expect(out).toContain('(tidak tersedia)')
  })

  test('context_window without token counts omits the tokens line', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: {
        ...fullStatus.payload,
        context_window: { used_percentage: 5 },
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).toContain('●○○○○○○○○○ 5%')
    expect(out).not.toContain('tokens')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: tests in the new-layout block FAIL (old renderer still emits old layout).

- [ ] **Step 3: Rewrite `renderContextReply` body**

In `context-renderer.ts`, replace the entire `renderContextReply` function with:

```typescript
export function renderContextReply(status: LastStatus, nowMs: number = Date.now()): string {
  const p = status.payload
  const sections: string[] = []

  // --- Context section (always shown; placeholder if missing) ---
  const ctxPct = p.context_window?.used_percentage
  const ctxLines: string[] = ['Context']
  if (typeof ctxPct === 'number') {
    ctxLines.push(`${progressBar(ctxPct)} ${Math.round(ctxPct)}%`)
    const used = p.context_window?.total_input_tokens
    const total = p.context_window?.context_window_size
    if (typeof used === 'number' && typeof total === 'number') {
      ctxLines.push(`${formatTokens(used)} / ${formatTokens(total)} tokens`)
    }
  } else {
    ctxLines.push('(tidak tersedia)')
  }
  sections.push(ctxLines.join('\n'))

  // --- Rate Limit 5h (omit entirely if missing) ---
  const five = p.rate_limits?.five_hour
  if (five && (typeof five.used_percentage === 'number' || typeof five.resets_at === 'number')) {
    const lines = ['Rate Limit 5h']
    if (typeof five.used_percentage === 'number') {
      lines.push(`${progressBar(five.used_percentage)} ${Math.round(five.used_percentage)}%`)
    }
    if (typeof five.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(five.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Rate Limit 7d (omit entirely if missing) ---
  const seven = p.rate_limits?.seven_day
  if (seven && (typeof seven.used_percentage === 'number' || typeof seven.resets_at === 'number')) {
    const lines = ['Rate Limit 7d']
    if (typeof seven.used_percentage === 'number') {
      lines.push(`${progressBar(seven.used_percentage)} ${Math.round(seven.used_percentage)}%`)
    }
    if (typeof seven.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(seven.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Metadata block (skip individual lines if missing) ---
  const meta: string[] = []
  if (p.model?.display_name) meta.push(p.model.display_name)
  if (p.session_id) meta.push(`Session: ${shortSession(p.session_id)}`)
  if (p.cwd) meta.push(`CWD: ${shortCwd(p.cwd)}`)
  if (typeof p.cost?.total_cost_usd === 'number') {
    meta.push(`Cost: $${p.cost.total_cost_usd.toFixed(2)}`)
  }
  if (typeof p.thinking?.enabled === 'boolean') {
    meta.push(`Thinking: ${p.thinking.enabled ? 'on' : 'off'}`)
  }
  if (typeof p.fast_mode === 'boolean') {
    meta.push(`Fast: ${p.fast_mode ? 'on' : 'off'}`)
  }
  if (meta.length > 0) sections.push(meta.join('\n'))

  // --- Last update (always shown) ---
  const age = nowMs - status.captured_at_ms
  sections.push(
    `Last update: ${formatJakartaHM(status.captured_at_ms)}\n(${formatRelativeMs(age)})`
  )

  return sections.join('\n\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all tests PASS, including the strict full-output match in the first test.

- [ ] **Step 5: Run full plugin test suite**

Run: `cd plugins/telegram && bun test`

Expected: all tests PASS (no other suite touches the renderer; server-boot just checks startup).

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: rewrite /context reply with richer layout

New layout shows Context (% + tokens), Rate Limit 5h & 7d (% + reset),
session metadata (model, session, cwd, cost, thinking, fast mode), and
last update timestamp. Plain text; missing fields omitted (Context core
keeps placeholder). Spec: docs/superpowers/specs/2026-05-17-telegram-context-renderer-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verify against real fixture

**Goal:** Confirm the rendered output matches the spec mockup byte-for-byte using the actual `last-status.json` from `sandbox/folder_two`.

**Files:**
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Add fixture-based smoke test**

Append to `context-renderer.test.ts`:

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'

describe('renderContextReply (real fixture)', () => {
  test('matches spec mockup against sandbox/folder_two payload', () => {
    const fixturePath = join(
      import.meta.dir,
      '..', '..',
      'sandbox', 'folder_two', '.claude', 'channels', 'telegram', 'last-status.json',
    )
    const status: LastStatus = JSON.parse(readFileSync(fixturePath, 'utf8'))
    // Pin "now" to 3 minutes after capture, so the relative time is deterministic.
    const nowMs = status.captured_at_ms + 3 * 60_000
    const out = renderContextReply(status, nowMs)
    // Sanity-check key lines from the spec mockup.
    expect(out).toContain('Context')
    expect(out).toContain('46.7k / 1M tokens')
    expect(out).toContain('Rate Limit 5h')
    expect(out).toContain('Rate Limit 7d')
    expect(out).toContain('Opus 4.7 (1M context)')
    expect(out).toContain('Session: 8a16303d')
    expect(out).toContain('CWD: …/sandbox/folder_two')
    expect(out).toContain('Cost: $0.80')
    expect(out).toContain('Thinking: on')
    expect(out).toContain('Fast: off')
    expect(out).toContain('(3m lalu)')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: PASS.

If the fixture file is missing (test environment without `sandbox/folder_two/...`), the test will error reading the file. That's acceptable for now since the file is checked into the repo's sandbox tree. If it becomes an issue later, copy the JSON inline into the test or move it to `plugins/telegram/__fixtures__/`. (Do not make this preemptive change — only if a real failure occurs.)

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: smoke-test /context renderer against real fixture

Verifies the rendered output against sandbox/folder_two's actual
last-status.json — guards against drift between spec mockup and code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Auto-retry after bridge install (UX improvement)

**Goal:** Hilangkan pesan instalasi panjang yang mengharuskan user kirim `/context` dua kali. Setelah install berhasil, kirim ack singkat, tunggu 5 detik, lalu edit pesan tersebut menjadi hasil render (atau fallback error kalau statusLine masih belum trigger).

**Files:**
- Modify: `plugins/telegram/server.ts` (the `bot.command('context', …)` handler, lines ~979-1010)

- [ ] **Step 1: Replace the `installed` branch in the `/context` handler**

In `plugins/telegram/server.ts`, locate the `bot.command('context', async ctx => { … })` handler. Find this block (around lines 987-997):

```typescript
  if (install.kind === 'installed') {
    const lines = [
      `Bridge /context terpasang ✅`,
      ``,
      `Patched: ${join(PROJECT_DIR!, '.claude', 'settings.json')}`,
    ]
    if (install.backupPath) lines.push(`Backup: ${install.backupPath}`)
    if (install.previousCommand) lines.push(`Chain ke statusline lama: aktif`)
    lines.push(``, `Tunggu statusline Claude Code refresh 1-2 detik (atau restart Claude Code), lalu kirim /context lagi.`)
    await ctx.reply(lines.join('\n'))
    return
  }
```

Replace with:

```typescript
  if (install.kind === 'installed') {
    const ack = await ctx.reply('⏳ Menyiapkan bridge, mohon tunggu...')
    setTimeout(async () => {
      const status = loadLastStatus()
      const text = status
        ? renderContextReply(status)
        : '⚠️ Statusline Claude Code belum trigger. Aktif sebentar di Claude Code lalu kirim /context lagi.'
      try {
        await ctx.api.editMessageText(ack.chat.id, ack.message_id, text)
      } catch (err) {
        // Edit can fail if message was deleted or too old; fall back to a new reply.
        await ctx.reply(text)
      }
    }, 5000)
    return
  }
```

- [ ] **Step 2: Verify no other code path needs updating**

The other two install kinds (`error`, `already-installed`) keep their existing behavior. Confirm by re-reading the handler — only the `installed` branch should be touched.

- [ ] **Step 3: Run plugin test suite**

Run: `cd plugins/telegram && bun test`

Expected: all tests PASS. No new test added for this UX change because it requires a live Telegram API to assert (and grammy's `Bot` doesn't have a simple harness for `editMessageText`). The existing `server-boot.test.ts` covers compile/import correctness.

- [ ] **Step 4: Type-check build**

Run: `cd plugins/telegram && bun build server.ts --outdir /tmp/telegram-build --target bun`

Expected: build succeeds. Delete `/tmp/telegram-build` after.

- [ ] **Step 5: Manual sanity test (optional, requires live bot)**

In a fresh project where bridge is not yet installed:
1. Send `/context` to the bot.
2. Expect: ack message `⏳ Menyiapkan bridge, mohon tunggu...` appears.
3. Wait ~5 seconds. Expect: same message gets edited to either rendered context (if user was active in Claude Code) or the warning message.
4. Send `/context` again. Expect: direct render reply (already-installed path).

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "$(cat <<'EOF'
telegram: auto-retry /context render after first-time bridge install

Replace the "send /context again" prompt with a 5-second scheduled
re-render via editMessageText. User sees a "menyiapkan bridge" ack
that turns into the actual context (or a clear fallback) — no manual
second invocation required.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Goal:** Belt-and-suspenders — confirm no regressions across the plugin, and that server.ts still boots.

- [ ] **Step 1: Run all plugin tests**

Run: `cd plugins/telegram && bun test`

Expected: all suites PASS (state-path, album-buffer, messages-store, channels-gitignore, server-boot, context-renderer).

- [ ] **Step 2: Type-check server.ts can resolve imports**

Run: `cd plugins/telegram && bun build server.ts --outdir /tmp/telegram-build --target bun`

Expected: build succeeds (no missing imports / type errors). Delete `/tmp/telegram-build` after.

- [ ] **Step 3: Manual sanity check on shell-script fixture (optional)**

If you have a running Claude Code session, run `/context` in Telegram and visually confirm the layout matches the mockup. (Skip if no live bot available.)

- [ ] **Step 4: Done — no extra commit needed if everything passes**
