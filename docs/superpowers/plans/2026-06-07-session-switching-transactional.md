# Transactional Session-Name Switching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jadikan switching session-name antar-bot transaksional & observable lewat satu sumber kebenaran `wrapper.state.json` (identity + `lifecycle`), reader yang baca lifecycle (bukan parsing nama), dan telemetry yang digerbang lifecycle — menutup bug `agent_status` melaporkan nama session basi.

**Architecture:** Wrapper (pty-controller) jadi satu-satunya penulis `wrapper.state.json` (atomic), menderivasi `lifecycle` dari nama/command. `agent-bus/peer-status.ts` membaca state.json sebagai otoritas identity+lifecycle dan menggerbang telemetry `last-status.json` dengan lifecycle; fallback ke logika lama bila state.json absen (fleet campuran). Skill handoff menghitung READY dari `lifecycle`.

**Tech Stack:** TypeScript, `bun:test` (agent-bus + wrapper subpackage), tsx (wrapper runtime), Markdown (skill).

**Spec:** `docs/superpowers/specs/2026-06-07-session-switching-transactional-design.md`

**Aturan commit:** sign identitas bot pengeksekusi, mis. `git -c user.name="bot-02" -c user.email="bot-02@bots.local" commit -m "..."` (ganti `bot-02`). Branch kerja: `session-switching-transactional` (worktree `C:\Users\Mirza\workspace\mirza-mp-session-switching`).

**Catatan TDD lintas-plugin:** tiap plugin punya runner sendiri. Jalankan test dari direktori plugin (`plugins/agent-bus`) atau subpackage (`plugins/pty-controller/wrapper`). Verifikasi bot sebelumnya sebelum mulai: `cd plugins/agent-bus && bun test` harus hijau.

---

## File Structure (decomposition)

- `plugins/pty-controller/wrapper/src/session-name.ts` — TAMBAH: type `Lifecycle` + `deriveLifecycle()` (pure).
- `plugins/pty-controller/wrapper/src/session-state.ts` — BARU: `SessionState`, `buildNextState()` (pure), `writeSessionState()` (atomic fs).
- `plugins/pty-controller/wrapper/src/session-state.test.ts` — BARU.
- `plugins/pty-controller/wrapper/src/session-name.test.ts` — TAMBAH test deriveLifecycle.
- `plugins/pty-controller/wrapper/src/wrapper.ts` — wire `updateSessionState()` ke semua call site + marker `resetting` saat `/clear`.
- `plugins/agent-bus/peer-status.ts` — field `lifecycle`, baca state.json, gating telemetry, fallback.
- `plugins/agent-bus/peer-status.test.ts` — TAMBAH kasus.
- `plugins/agent-bus/server.ts` — expose `lifecycle` di output `agent_status`.
- `plugins/handoff/skills/handoff/SKILL.md` — READY via lifecycle (§0/§3/§5.0) + fallback.
- `plugin.json` × 3 + `wrapper/package.json` — version bump.

---

## Task 1: `deriveLifecycle()` pure helper (pty-controller)

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/session-name.ts`
- Test: `plugins/pty-controller/wrapper/src/session-name.test.ts`

- [ ] **Step 1: Tulis failing test** — tambah di akhir `session-name.test.ts` (sebelum `})` penutup terluar, sebagai `describe` baru):

```ts
import { renameArgFromCommand, deriveLifecycle } from './session-name'

describe('deriveLifecycle', () => {
  test('null/empty name → unknown', () => {
    expect(deriveLifecycle(null)).toBe('unknown')
    expect(deriveLifecycle('')).toBe('unknown')
  })
  test('"idle" → idle', () => {
    expect(deriveLifecycle('idle')).toBe('idle')
  })
  test('task-* → busy', () => {
    expect(deriveLifecycle('task-todolist-pingpong')).toBe('busy')
  })
  test('done-* → transitioning', () => {
    expect(deriveLifecycle('done-foo-202606071200')).toBe('transitioning')
  })
  test('manual non-convention name → unknown', () => {
    expect(deriveLifecycle('refactoring besar')).toBe('unknown')
  })
})
```
(Catatan: baris `import` di atas menggantikan import lama di baris 2 file itu — gabung jadi satu import.)

- [ ] **Step 2: Run, FAIL**

Run: `cd plugins/pty-controller/wrapper && bun test src/session-name.test.ts`
Expected: FAIL — `deriveLifecycle is not a function` / tidak ter-ekspor.

- [ ] **Step 3: Implementasi** — tambah di `session-name.ts`:

```ts
export type Lifecycle = 'idle' | 'busy' | 'resetting' | 'transitioning' | 'unknown'

/**
 * Map a session display name to its lifecycle. `resetting` is never derived
 * from a name — it is an explicit in-progress marker set by the wrapper at
 * `/clear` begin. Manual / non-convention names map to `unknown`.
 */
export function deriveLifecycle(name: string | null): Lifecycle {
  if (!name) return 'unknown'
  if (name === 'idle') return 'idle'
  if (name.startsWith('task-')) return 'busy'
  if (name.startsWith('done-')) return 'transitioning'
  return 'unknown'
}
```

- [ ] **Step 4: Run, PASS**

Run: `cd plugins/pty-controller/wrapper && bun test src/session-name.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add plugins/pty-controller/wrapper/src/session-name.ts plugins/pty-controller/wrapper/src/session-name.test.ts
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(wrapper): deriveLifecycle name→lifecycle helper"
```

---

## Task 2: `session-state.ts` — buildNextState + writeSessionState (pty-controller)

**Files:**
- Create: `plugins/pty-controller/wrapper/src/session-state.ts`
- Test: `plugins/pty-controller/wrapper/src/session-state.test.ts`

- [ ] **Step 1: Tulis failing test** — `session-state.test.ts`:

```ts
import { test, expect, describe } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildNextState, writeSessionState, type SessionState } from './session-state'

describe('buildNextState', () => {
  test('first state: derives lifecycle from name, seq starts at 1', () => {
    const s = buildNextState(null, { session_id: 'sid-1', session_name: 'idle' }, 1000)
    expect(s).toEqual({
      session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 1000,
    })
  })
  test('patch merges over prev and bumps seq', () => {
    const prev: SessionState = { session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 1000 }
    const s = buildNextState(prev, { session_name: 'task-foo' }, 2000)
    expect(s.session_id).toBe('sid-1')         // carried over
    expect(s.session_name).toBe('task-foo')
    expect(s.lifecycle).toBe('busy')           // re-derived
    expect(s.seq).toBe(2)
  })
  test('explicit lifecycle override wins over derivation', () => {
    const s = buildNextState(null, { session_name: 'done-x-1', lifecycle: 'resetting' }, 3000)
    expect(s.lifecycle).toBe('resetting')      // not "transitioning"
  })
  test('null session_name → unknown', () => {
    const s = buildNextState(null, { session_id: 'sid', session_name: null }, 1)
    expect(s.lifecycle).toBe('unknown')
  })
})

describe('writeSessionState', () => {
  test('writes atomic JSON readable back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'state-'))
    try {
      const file = join(dir, 'wrapper.state.json')
      const state: SessionState = { session_id: 'sid', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 5 }
      writeSessionState(file, state)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(state)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run, FAIL**

Run: `cd plugins/pty-controller/wrapper && bun test src/session-state.test.ts`
Expected: FAIL — cannot resolve `./session-state`.

- [ ] **Step 3: Implementasi** — `session-state.ts`:

```ts
/**
 * Single source of truth for a session's identity + lifecycle, written
 * atomically by the wrapper. Split from wrapper.ts so the merge/derive logic
 * is unit-testable (wrapper.ts spawns CC on import).
 */
import { writeFileSync, renameSync } from 'node:fs'
import process from 'node:process'
import { deriveLifecycle, type Lifecycle } from './session-name'

export interface SessionState {
  session_id: string | null
  session_name: string | null
  lifecycle: Lifecycle
  seq: number
  updated_at_ms: number
}

export interface SessionStatePatch {
  session_id?: string | null
  session_name?: string | null
  /** Explicit override (e.g. 'resetting'); else derived from resulting name. */
  lifecycle?: Lifecycle
}

export function buildNextState(
  prev: SessionState | null,
  patch: SessionStatePatch,
  nowMs: number,
): SessionState {
  const session_id =
    patch.session_id !== undefined ? patch.session_id : prev?.session_id ?? null
  const session_name =
    patch.session_name !== undefined ? patch.session_name : prev?.session_name ?? null
  const lifecycle = patch.lifecycle ?? deriveLifecycle(session_name)
  return {
    session_id,
    session_name,
    lifecycle,
    seq: (prev?.seq ?? 0) + 1,
    updated_at_ms: nowMs,
  }
}

export function writeSessionState(stateFile: string, state: SessionState): void {
  const tmp = `${stateFile}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, stateFile)
}
```

- [ ] **Step 4: Run, PASS**

Run: `cd plugins/pty-controller/wrapper && bun test src/session-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/pty-controller/wrapper/src/session-state.ts plugins/pty-controller/wrapper/src/session-state.test.ts
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(wrapper): session-state buildNextState + atomic writeSessionState"
```

---

## Task 3: Wire `updateSessionState()` ke wrapper.ts call sites

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

Tujuan: setiap titik di mana wrapper menulis identity (`writeCurrentSessionId`/`writeCurrentSessionName`) JUGA memperbarui `wrapper.state.json`, plus marker `resetting` saat `/clear`. File lama TETAP ditulis (backward-compat).

- [ ] **Step 1: Tambah path konstanta + import + state in-memory + helper**

Di blok import (sekitar baris 65-67), tambah:
```ts
import { renameArgFromCommand, deriveLifecycle } from './session-name'
import { buildNextState, writeSessionState, type SessionState } from './session-state'
```
(Baris 66 lama `import { renameArgFromCommand } from './session-name'` digabung jadi baris di atas.)

Setelah `CURRENT_SESSION_NAME_FILE` (sekitar baris 127), tambah:
```ts
// Single source of truth for identity + lifecycle (see session-state.ts).
// Written alongside the legacy current_session_* files for backward-compat
// with peers running an older agent-bus reader.
const SESSION_STATE_FILE = join(STATE_DIR, 'wrapper.state.json')
let sessionState: SessionState | null = null
```

Setelah `writeCurrentSessionName` (sekitar baris 161), tambah:
```ts
// Canonical updater: patches identity/lifecycle, writes wrapper.state.json
// atomically, AND mirrors to the legacy current_session_* files. Call this
// instead of writeCurrentSessionId/Name directly.
function updateSessionState(patch: {
  session_id?: string | null
  session_name?: string | null
  lifecycle?: ReturnType<typeof deriveLifecycle>
}): void {
  sessionState = buildNextState(sessionState, patch, Date.now())
  try {
    writeSessionState(SESSION_STATE_FILE, sessionState)
  } catch (err) {
    log(`failed to write session state: ${err}`)
  }
  // Mirror to legacy files (readers on older agent-bus).
  if (patch.session_id !== undefined && sessionState.session_id)
    writeCurrentSessionId(sessionState.session_id)
  if (patch.session_name !== undefined)
    writeCurrentSessionName(sessionState.session_name)
}
```

- [ ] **Step 2: Ganti call site post-`/clear`** (sekitar baris 759-763):

Lama:
```ts
      writeCurrentSessionId(sid)
      writeCurrentSessionName(sessionName ?? null)
```
Baru:
```ts
      updateSessionState({ session_id: sid, session_name: sessionName ?? null })
```

- [ ] **Step 3: Ganti call site startup-resume** (sekitar baris 809-812):

Lama:
```ts
    writeCurrentSessionId(sid)
    const resolvedName = readTelegramRegistryName(sid)
    writeCurrentSessionName(resolvedName)
```
Baru:
```ts
    const resolvedName = readTelegramRegistryName(sid)
    updateSessionState({ session_id: sid, session_name: resolvedName })
```

- [ ] **Step 4: Ganti call site initial-detect** (sekitar baris 840-884):

- Baris 840 `writeCurrentSessionId(sid)` → `updateSessionState({ session_id: sid })`
- Baris 866 `writeCurrentSessionName('idle')` → `updateSessionState({ session_name: 'idle' })`
- Baris 884 `writeCurrentSessionName(null)` → `updateSessionState({ session_name: null })`

- [ ] **Step 5: Marker `resetting` saat `/clear` di-inject** — di handler `/clear` (sekitar baris 990-1004, di dalam `if (command === '/clear') {` setelah `injectionGate.beginClearBarrier(...)`):

Tambah:
```ts
  updateSessionState({ lifecycle: 'resetting' })
```

- [ ] **Step 6: Ganti call site rename-detect** (sekitar baris 968-969):

Lama:
```ts
    const renamedTo = renameArgFromCommand(command)
    if (renamedTo) writeCurrentSessionName(renamedTo)
```
Baru:
```ts
    const renamedTo = renameArgFromCommand(command)
    if (renamedTo) updateSessionState({ session_name: renamedTo })
```

- [ ] **Step 7: Ganti call site `/switch`** (sekitar baris 1037-1040):

Lama:
```ts
    writeCurrentSessionId(sid)
    writeCurrentSessionName(sessionName ?? readTelegramRegistryName(sid))
```
Baru:
```ts
    updateSessionState({
      session_id: sid,
      session_name: sessionName ?? readTelegramRegistryName(sid),
    })
```

- [ ] **Step 8: Typecheck**

Run: `cd plugins/pty-controller/wrapper && npx tsc --noEmit -p . 2>&1 | head -20` (jika tak ada tsconfig khusus: `npx tsc --noEmit src/wrapper.ts` boleh memunculkan error lib node — fokus pada error di wrapper.ts/session-state.ts saja).
Expected: tak ada error tipe baru dari perubahan ini. Test pure tetap hijau: `bun test src/`.

- [ ] **Step 9: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(wrapper): write wrapper.state.json at all identity updates + resetting marker"
```

---

## Task 4: Bump pty-controller version

**Files:**
- Modify: `plugins/pty-controller/.claude-plugin/plugin.json` (0.0.27 → 0.0.28)
- Modify: `plugins/pty-controller/wrapper/package.json` (0.0.4 → 0.0.5)

- [ ] **Step 1: Edit `plugin.json`** — ubah `"version": "0.0.27"` → `"version": "0.0.28"` (pakai Edit tool, JANGAN PowerShell Set-Content — BOM).
- [ ] **Step 2: Edit `wrapper/package.json`** — ubah `"version": "0.0.4"` → `"version": "0.0.5"`.
- [ ] **Step 3: Commit**

```bash
git add plugins/pty-controller/.claude-plugin/plugin.json plugins/pty-controller/wrapper/package.json
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "release(pty-controller): bump to 0.0.28 — wrapper.state.json + lifecycle"
```

---

## Task 5: peer-status.ts — field lifecycle + state.json reader + gating + fallback (agent-bus)

**Files:**
- Modify: `plugins/agent-bus/peer-status.ts`
- Test: `plugins/agent-bus/peer-status.test.ts`

- [ ] **Step 1: Tulis failing test** — tambah `describe` baru di `peer-status.test.ts`:

```ts
function writeState(projectDir: string, state: object) {
  writeFileSync(
    join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.state.json'),
    JSON.stringify(state),
  )
}

describe('peer-status: wrapper.state.json precedence', () => {
  let projectDir: string
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'peer-state-'))
    mkdirSync(join(projectDir, '.claude', 'channels', 'telegram'), { recursive: true })
    mkdirSync(join(projectDir, '.claude', 'channels', 'pty-controller'), { recursive: true })
  })
  afterEach(() => rmSync(projectDir, { recursive: true, force: true }))

  test('THE BUG: same session_id, stale last-status name, state says idle → returns idle + null ctx', () => {
    writeState(projectDir, { session_id: 'e23f460f', session_name: 'idle', lifecycle: 'idle', seq: 5, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'e23f460f', session_name: 'done-todolist-pingpong-202606071256', context_window: { used_percentage: 88 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_name).toBe('idle')
    expect(info.lifecycle).toBe('idle')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle busy + id match → telemetry trusted', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'task-x', lifecycle: 'busy', seq: 2, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 42, context_window_size: 1000000 }, model: { display_name: 'Opus 4.8' } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('busy')
    expect(info.context_used_percent).toBe(42)
    expect(info.context_window_size).toBe(1000000)
    expect(info.model).toBe('Opus 4.8')
  })

  test('lifecycle resetting → telemetry nulled even if id matches', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'done-x-1', lifecycle: 'resetting', seq: 3, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 70 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('resetting')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle unknown + id MISMATCH → telemetry nulled', () => {
    writeState(projectDir, { session_id: 'fresh', session_name: 'foo', lifecycle: 'unknown', seq: 1, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'old', context_window: { used_percentage: 99 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('fresh')
    expect(info.context_used_percent).toBe(null)
  })

  test('no state.json → legacy behavior (lifecycle null)', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'abc-123',
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('abc-123')
    expect(info.lifecycle).toBe(null)
  })
})
```

- [ ] **Step 2: Run, FAIL**

Run: `cd plugins/agent-bus && bun test peer-status.test.ts`
Expected: FAIL — `info.lifecycle` undefined / state.json tidak dibaca.

- [ ] **Step 3: Implementasi** — di `peer-status.ts`:

(a) Tambah `lifecycle` ke interface + EMPTY:
```ts
export interface PeerSessionInfo {
  current_session_id: string | null
  current_session_name: string | null
  lifecycle: string | null
  context_used_percent: number | null
  context_window_size: number | null
  model: string | null
  effort_level: string | null
}

const EMPTY: PeerSessionInfo = {
  current_session_id: null,
  current_session_name: null,
  lifecycle: null,
  context_used_percent: null,
  context_window_size: null,
  model: null,
  effort_level: null,
}
```

(b) Tambah reader state.json:
```ts
interface WrapperState {
  session_id: string | null
  session_name: string | null
  lifecycle: string | null
}

function readWrapperState(projectDir: string): WrapperState | null {
  const path = join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.state.json')
  if (!existsSync(path)) return null
  try {
    const o = JSON.parse(readFileSync(path, 'utf8')) as Partial<WrapperState>
    return {
      session_id: typeof o.session_id === 'string' ? o.session_id : null,
      session_name: typeof o.session_name === 'string' ? o.session_name : null,
      lifecycle: typeof o.lifecycle === 'string' ? o.lifecycle : null,
    }
  } catch {
    return null
  }
}
```

(c) Ganti seluruh `readPeerSessionInfo` jadi:
```ts
export function readPeerSessionInfo(projectDir: string): PeerSessionInfo {
  const telegramStatus = readTelegramStatus(projectDir)
  const state = readWrapperState(projectDir)

  // New path: wrapper.state.json is authoritative for identity + lifecycle.
  if (state) {
    const idMatch = !!telegramStatus && telegramStatus.current_session_id === state.session_id
    // Telemetry only trustworthy for genuinely-active sessions; reset/idle
    // states are exactly where last-status.json is known to lag.
    const active = state.lifecycle === 'busy' || state.lifecycle === 'unknown'
    const trust = !!telegramStatus && idMatch && active
    return {
      current_session_id: state.session_id,
      current_session_name: state.session_name,
      lifecycle: state.lifecycle,
      context_used_percent: trust ? telegramStatus!.context_used_percent : null,
      context_window_size: trust ? telegramStatus!.context_window_size : null,
      model: trust ? telegramStatus!.model : null,
      effort_level: trust ? telegramStatus!.effort_level : null,
    }
  }

  // Legacy fallback (peer on an older wrapper without state.json): the 0.0.10
  // id-mismatch staleness check. lifecycle stays null.
  const wrapperSid = readWrapperSessionId(projectDir)
  if (telegramStatus && (!wrapperSid || telegramStatus.current_session_id === wrapperSid)) {
    if (telegramStatus.current_session_name === null) {
      telegramStatus.current_session_name = readWrapperSessionName(projectDir)
    }
    return telegramStatus
  }
  if (wrapperSid) {
    return {
      ...EMPTY,
      current_session_id: wrapperSid,
      current_session_name: readWrapperSessionName(projectDir),
    }
  }
  return { ...EMPTY }
}
```
(Catatan: `readTelegramStatus` mengembalikan objek `PeerSessionInfo` — tambahkan `lifecycle: null` pada object literal yang ia return, baris ~85.)

- [ ] **Step 4: Run, PASS**

Run: `cd plugins/agent-bus && bun test peer-status.test.ts`
Expected: PASS — termasuk semua kasus lama (regресi) + kasus baru.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/peer-status.ts plugins/agent-bus/peer-status.test.ts
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(agent-bus): peer-status reads wrapper.state.json lifecycle + gates telemetry"
```

---

## Task 6: Expose `lifecycle` di output `agent_status` (agent-bus)

**Files:**
- Modify: `plugins/agent-bus/server.ts` (sekitar baris 156-167)

- [ ] **Step 1: Tambah field** — di object `status` (case `agent_status`), setelah `current_session_name: sess.current_session_name,` tambah:
```ts
          lifecycle: sess.lifecycle,
```

- [ ] **Step 2: Verifikasi build** — Run: `cd plugins/agent-bus && bun test` (semua suite hijau; server.ts tidak punya unit test khusus tapi harus tetap meng-compile saat test lain mengimpor modul terkait). Optional smoke: `npx tsc --noEmit` di `plugins/agent-bus` bila ada tsconfig.

- [ ] **Step 3: Commit**

```bash
git add plugins/agent-bus/server.ts
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(agent-bus): expose lifecycle in agent_status output"
```

---

## Task 7: Bump agent-bus version

**Files:**
- Modify: `plugins/agent-bus/.claude-plugin/plugin.json` (0.0.10 → 0.0.11)

- [ ] **Step 1: Edit** `"version": "0.0.10"` → `"version": "0.0.11"` (Edit tool).
- [ ] **Step 2: Commit**

```bash
git add plugins/agent-bus/.claude-plugin/plugin.json
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "release(agent-bus): bump to 0.0.11 — lifecycle field + telemetry gating"
```

---

## Task 8: Skill handoff — kontrak READY via lifecycle

**Files:**
- Modify: `plugins/handoff/skills/handoff/SKILL.md`
- Modify: `plugins/handoff/.claude-plugin/plugin.json` (0.0.13 → 0.0.14)

- [ ] **Step 1: §0 — definisi READY.** Cari blok yang mendefinisikan READY (saat ini berbasis `current_session_name == "idle"`). Ganti menjadi berbasis lifecycle, dengan fallback:

Teks pengganti (sisipkan menggantikan definisi READY lama):
```markdown
- **READY** (boleh menerima handoff otomatis) = `lifecycle == "idle"` dari
  `agent_status`. (Fallback bila peer memakai wrapper lama dan `lifecycle`
  tak tersedia/`null`: pakai heuristik lama `current_session_name == "idle"`
  DAN `context_used_percent < 10 || == null`.) Nilai `lifecycle` lain —
  `busy`/`resetting`/`transitioning`/`unknown` — semuanya NOT ready.
```

- [ ] **Step 2: §3 — marker picker.** Ganti aturan marka agar dibaca dari lifecycle:
```markdown
Marka (dari `lifecycle`): ✅ READY (`idle`) · ⛔ sibuk (`busy`) ·
🔄 transisi (`resetting`/`transitioning`) · ⚠️ nama manual (`unknown`) ·
📴 offline. (Peer wrapper lama tanpa lifecycle → marka dari nama session
seperti sebelumnya.)
```

- [ ] **Step 3: §5.0 — guard full-auto.** Pastikan teks guard membaca READY via lifecycle (kalimat "cek READY target via `agent_status`" sudah cukup bila §0 sudah diperbarui; tambahkan klarifikasi):
```markdown
0. **Designation full-auto?** Guard dulu: cek READY target via `agent_status`
   (`lifecycle == "idle"`; fallback nama bila lifecycle null). Tidak ready →
   designation BATAL, beri tahu user, fallback ke §3.
```

- [ ] **Step 4: Bump `plugin.json`** `0.0.13` → `0.0.14` (Edit tool).

- [ ] **Step 5: Commit**

```bash
git add plugins/handoff/skills/handoff/SKILL.md plugins/handoff/.claude-plugin/plugin.json
git -c user.name="<bot>" -c user.email="<bot>@bots.local" commit -m "feat(handoff): READY contract via agent_status lifecycle (fallback to name); bump 0.0.14"
```

---

## Task 9: Verifikasi menyeluruh + push

- [ ] **Step 1: Semua test hijau**

Run:
```bash
cd plugins/agent-bus && bun test
cd ../pty-controller/wrapper && bun test src/
```
Expected: PASS semua (agent-bus full suite + wrapper pure modules).

- [ ] **Step 2: Sanity manual reader** (opsional) — dengan node/bun, panggil `readPeerSessionInfo` pada dir buatan yang meniru state bot-01 bug; pastikan balik `idle` + ctx null.

- [ ] **Step 3: Push branch**

```bash
git push origin session-switching-transactional
```

- [ ] **Step 4: Lapor user** — ringkas: 3 plugin di-bump (pty 0.0.28, agent-bus 0.0.11, handoff 0.0.14), bug teratasi, fleet campuran aman. Tawarkan langkah rilis (merge ke main + cara deploy: wrapper baru aktif saat tiap bot restart; `/reload-plugins` untuk agent-bus/handoff — catat caveat aktivasi).

---

## Catatan scope: convergence (spec §6.3)

Plan ini mengimplementasikan **begin** (marker `resetting`) dan **commit**
(state ditulis di tiap titik deteksi yang sudah dipoll wrapper:
initial-detect, post-`/clear`, rename-detect, `/switch`). Karena semua titik
itu event-driven dari poll-loop wrapper yang sudah ada, state ter-update di
setiap transisi nyata — ini sudah memberi konvergensi praktis.

Yang **TIDAK** ditambah di v1 (hardening fase-2, agar tidak over-engineer):
sebuah tick periodik terpisah yang me-*re-derive* state dari ground-truth dan
menulis ulang `state.json` bila terdeteksi drift (mis. write gagal senyap).
Bila kelak diinginkan, tambahkan langkah re-derive di `sessionPollInterval`
yang sudah ada + satu test "drop satu langkah → tick berikut memperbaiki".

## Catatan rollout (untuk pelaksana)

- **Aktivasi:** `peer-status.ts` & skill handoff aktif setelah `/reload-plugins` (atau session baru untuk skill). Wrapper baru (`state.json`) aktif saat tiap bot **restart wrapper**-nya — sampai itu, peer tsb tetap dilayani jalur fallback oleh reader baru. Fleet campuran aman dua arah.
- **JANGAN** hapus file `wrapper.current_session_*` — masih dibaca peer yang belum update.
- **JANGAN** edit di `~/.claude/plugins/marketplaces/` atau `cache/` — hanya di worktree ini (three-copy doctrine).
