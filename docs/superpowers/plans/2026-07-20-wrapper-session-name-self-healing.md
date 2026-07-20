# Wrapper Session-Name Self-Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State nama session di wrapper mirza-cc menyembuhkan diri dari divergensi (adopsi dari statusline CC ≤1 turn) dan seeding nama saat boot-resume memilih sumber paling fresh.

**Architecture:** Logika keputusan pure ditaruh di `session-state.ts` (unit-testable, tanpa side effect); `wrapper.ts` hanya wiring: satu langkah revalidasi mtime-gated di `sessionPollInterval` yang sudah ada, dan arbitrase freshness di blok resume. Tidak ada perubahan alur `/clear`//`/rename`/batch.

**Tech Stack:** TypeScript (ESM), Node via tsx (runtime wrapper), `bun:test` (unit test), tanpa dependency baru.

**Spec:** `docs/superpowers/specs/2026-07-20-wrapper-session-name-self-healing-design.md`

## Global Constraints

- Repo kerja: workspace clone `C:\Users\Mirza\workspace\mirza-marketplace` — JANGAN commit dari `~/.claude/plugins/**` (bot-conduct Rule 6).
- Eksekusi di worktree: `git worktree add ../mirza-marketplace-bot-03-name-selfheal -b feat/wrapper-name-self-healing` dari workspace clone.
- Semua commit pakai trailer `Agent: bot-03` lalu `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Semua baca file best-effort: missing/korup → `null`/skip, TIDAK PERNAH throw keluar dari interval callback.
- JANGAN emisi system-outbox `session-change` dari jalur revalidasi (spec §3.1).
- Unit test dijalankan dari `plugins/pty-controller/wrapper/`: `bun test src/session-state.test.ts`.
- Setelah merge ke main: push SEGERA, verifikasi `git status -sb` tidak "ahead".

---

### Task 1: Logika keputusan pure di session-state.ts

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/session-state.ts`
- Test: `plugins/pty-controller/wrapper/src/session-state.test.ts`

**Interfaces:**
- Consumes: `SessionState` (existing, punya `session_id`, `session_name`, `updated_at_ms`).
- Produces (dipakai Task 2 & 3):
  - `interface StatuslineSnapshot { captured_at_ms: number; session_id: string; session_name: string }`
  - `parseStatuslineSnapshot(raw: string): StatuslineSnapshot | null`
  - `shouldAdoptStatuslineName(state: SessionState | null, raw: string, opts: { inClearTransition: boolean }): string | null`
  - `interface RegistryEntry { name: string; updatedAt: number }`
  - `resolveResumeName(lastStatusRaw: string | null, registry: RegistryEntry | null, sessionId: string): { name: string | null; source: 'last-status' | 'registry' | 'none' }`

- [ ] **Step 1: Tulis failing tests**

Tambahkan di akhir `session-state.test.ts` (update baris import menjadi):

```ts
import {
  buildNextState,
  writeSessionState,
  nameFromLastStatus,
  parseStatuslineSnapshot,
  shouldAdoptStatuslineName,
  resolveResumeName,
  type SessionState,
} from './session-state'
```

lalu test-nya:

```ts
describe('parseStatuslineSnapshot', () => {
  const raw = (capturedAt: number, payload: unknown) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload })

  test('parses a valid snapshot', () => {
    expect(parseStatuslineSnapshot(raw(1000, { session_id: 'sid-1', session_name: 'idle' })))
      .toEqual({ captured_at_ms: 1000, session_id: 'sid-1', session_name: 'idle' })
  })
  test('null on malformed JSON', () => {
    expect(parseStatuslineSnapshot('{ not json')).toBe(null)
  })
  test('null when captured_at_ms / payload / fields missing or empty', () => {
    expect(parseStatuslineSnapshot(JSON.stringify({ payload: { session_id: 's', session_name: 'x' } }))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, null))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, { session_id: 's' }))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, { session_id: 's', session_name: '' }))).toBe(null)
  })
})

describe('shouldAdoptStatuslineName', () => {
  const state = (over: Partial<SessionState> = {}): SessionState => ({
    session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 3, updated_at_ms: 5000, ...over,
  })
  const raw = (capturedAt: number, sid: string, name: string) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload: { session_id: sid, session_name: name } })
  const NO_TRANSITION = { inClearTransition: false }

  test('adopts: snapshot fresher + sid match + different name', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe('task-foo')
  })
  test('rejects poisoned/old snapshot (captured_at <= state.updated_at)', () => {
    expect(shouldAdoptStatuslineName(state(), raw(5000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(state(), raw(4000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe(null)
  })
  test('rejects sid mismatch (snapshot describes another session)', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'old-sid', 'task-foo'), NO_TRANSITION)).toBe(null)
  })
  test('rejects during /clear transition', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'task-foo'), { inClearTransition: true })).toBe(null)
  })
  test('no-op when names equal', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'idle'), NO_TRANSITION)).toBe(null)
  })
  test('rejects corrupt raw and null/id-less state, without throwing', () => {
    expect(shouldAdoptStatuslineName(state(), '{ not json', NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(null, raw(6000, 'sid-1', 'x'), NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(state({ session_id: null }), raw(6000, 'sid-1', 'x'), NO_TRANSITION)).toBe(null)
  })
})

describe('resolveResumeName', () => {
  const raw = (capturedAt: number, sid: string, name: string) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload: { session_id: sid, session_name: name } })

  test('picks last-status when fresher', () => {
    expect(resolveResumeName(raw(2000, 'sid-1', 'task-x'), { name: 'idle', updatedAt: 1000 }, 'sid-1'))
      .toEqual({ name: 'task-x', source: 'last-status' })
  })
  test('picks registry when fresher', () => {
    expect(resolveResumeName(raw(1000, 'sid-1', 'rlfv-dashboard-design'), { name: 'idle', updatedAt: 2000 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('tie → registry wins', () => {
    expect(resolveResumeName(raw(1500, 'sid-1', 'task-x'), { name: 'idle', updatedAt: 1500 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('sid-mismatch snapshot is ignored → registry', () => {
    expect(resolveResumeName(raw(9000, 'old-sid', 'task-x'), { name: 'idle', updatedAt: 1000 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('only one source present → that source; none → null/none', () => {
    expect(resolveResumeName(raw(1000, 'sid-1', 'task-x'), null, 'sid-1'))
      .toEqual({ name: 'task-x', source: 'last-status' })
    expect(resolveResumeName(null, { name: 'idle', updatedAt: 1 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
    expect(resolveResumeName(null, null, 'sid-1')).toEqual({ name: null, source: 'none' })
    expect(resolveResumeName('{ not json', null, 'sid-1')).toEqual({ name: null, source: 'none' })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan FAIL**

Run (dari `plugins/pty-controller/wrapper/`): `bun test src/session-state.test.ts`
Expected: FAIL — `parseStatuslineSnapshot is not exported` / not a function.

- [ ] **Step 3: Implementasi minimal di session-state.ts**

Tambahkan setelah `nameFromLastStatus` (dan refactor `nameFromLastStatus` agar delegasi, DRY):

```ts
/** Fields of a telegram last-status.json snapshot that name-resolution needs. */
export interface StatuslineSnapshot {
  captured_at_ms: number
  session_id: string
  session_name: string
}

/** Parse raw last-status.json contents. Null on corrupt/missing/empty fields. */
export function parseStatuslineSnapshot(raw: string): StatuslineSnapshot | null {
  try {
    const o = JSON.parse(raw) as {
      captured_at_ms?: unknown
      payload?: { session_id?: unknown; session_name?: unknown } | null
    }
    const p = o.payload
    if (
      typeof o.captured_at_ms !== 'number' ||
      !p ||
      typeof p.session_id !== 'string' || !p.session_id ||
      typeof p.session_name !== 'string' || !p.session_name
    )
      return null
    return {
      captured_at_ms: o.captured_at_ms,
      session_id: p.session_id,
      session_name: p.session_name,
    }
  } catch {
    return null
  }
}

/**
 * Self-healing decision (spec 2026-07-20 §3.1): should the wrapper adopt the
 * statusline snapshot's session name? Returns the name to adopt, or null.
 * Guards: no adoption during a /clear transition; snapshot must describe the
 * live session; must be strictly fresher than the wrapper's own state (this
 * rejects the poisoned post-/clear snapshot that pairs a new sid with the
 * old name); and must actually differ from the current name.
 */
export function shouldAdoptStatuslineName(
  state: SessionState | null,
  raw: string,
  opts: { inClearTransition: boolean },
): string | null {
  if (opts.inClearTransition) return null
  if (!state?.session_id) return null
  const snap = parseStatuslineSnapshot(raw)
  if (!snap) return null
  if (snap.session_id !== state.session_id) return null
  if (snap.captured_at_ms <= state.updated_at_ms) return null
  if (snap.session_name === state.session_name) return null
  return snap.session_name
}

/** A session-names.json registry entry, with its write timestamp. */
export interface RegistryEntry {
  name: string
  updatedAt: number
}

/**
 * Boot-resume arbitration (spec 2026-07-20 §3.2): pick the FRESHER of the
 * statusline snapshot (only when it describes `sessionId`) vs the telegram
 * registry entry. Tie → registry (event-driven writes beat renders).
 */
export function resolveResumeName(
  lastStatusRaw: string | null,
  registry: RegistryEntry | null,
  sessionId: string,
): { name: string | null; source: 'last-status' | 'registry' | 'none' } {
  const snap = lastStatusRaw ? parseStatuslineSnapshot(lastStatusRaw) : null
  const valid = snap && snap.session_id === sessionId ? snap : null
  if (valid && registry) {
    return valid.captured_at_ms > registry.updatedAt
      ? { name: valid.session_name, source: 'last-status' }
      : { name: registry.name, source: 'registry' }
  }
  if (valid) return { name: valid.session_name, source: 'last-status' }
  if (registry) return { name: registry.name, source: 'registry' }
  return { name: null, source: 'none' }
}
```

dan ganti body `nameFromLastStatus` menjadi delegasi (perilaku identik — tetap dipakai test lama & reader lain):

```ts
export function nameFromLastStatus(raw: string, sessionId: string): string | null {
  const snap = parseStatuslineSnapshot(raw)
  return snap && snap.session_id === sessionId ? snap.session_name : null
}
```

CATATAN: `nameFromLastStatus` lama menerima snapshot TANPA `captured_at_ms` (test lama pakai `captured_at_ms: 1`, aman). `parseStatuslineSnapshot` mensyaratkan `captured_at_ms` number — cek test lama `raw()` helper di file test sudah selalu menyertakan `captured_at_ms: 1`, jadi delegasi tidak memecahkan test existing. Kalau `bun test` menunjukkan regresi test lama `nameFromLastStatus`, JANGAN ubah test lama — longgarkan delegasi (parse manual tanpa syarat captured_at) dan laporkan di commit message.

- [ ] **Step 4: Jalankan test, pastikan PASS (termasuk test lama)**

Run: `bun test src/session-state.test.ts`
Expected: PASS semua (test lama `nameFromLastStatus`/`buildNextState`/`writeSessionState` + test baru).

- [ ] **Step 5: Commit**

```bash
git add plugins/pty-controller/wrapper/src/session-state.ts plugins/pty-controller/wrapper/src/session-state.test.ts
git commit -m "feat(pty-controller): pure decision logic for session-name self-healing

parseStatuslineSnapshot + shouldAdoptStatuslineName (adopsi dari
statusline, guard freshness/sid/transisi) + resolveResumeName (arbitrase
boot-resume, tie -> registry). Spec: docs/superpowers/specs/
2026-07-20-wrapper-session-name-self-healing-design.md

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Arbitrase freshness di blok boot-resume (wrapper.ts)

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts` (blok resume ±baris 890-906; helper file-reader ±baris 338-366; import block ±baris 80)

**Interfaces:**
- Consumes: `resolveResumeName`, `parseStatuslineSnapshot`, `RegistryEntry` dari Task 1; `updateSessionState`, `writeSystemOutbox`, `resolveTelegramStateDir`, `log` (existing).
- Produces (dipakai Task 3): `readLastStatusRaw(): string | null`; `readTelegramRegistryEntry(sessionId: string): RegistryEntry | null`.

- [ ] **Step 1: Tambah helper reader + hapus reader lama**

Di import block dari `'./session-state'` tambahkan `parseStatuslineSnapshot`, `resolveResumeName`, dan `type RegistryEntry`.

Ganti fungsi `readLastStatusSessionName` (baris ±351-366, satu-satunya pemakainya adalah blok resume yang ikut diganti di Step 2) dengan:

```ts
// Raw contents of telegram's last-status.json (CC statusline snapshot), or
// null when absent/unreadable. Parsing/validation happens in session-state.ts.
function readLastStatusRaw(): string | null {
  const dir = resolveTelegramStateDir()
  if (!dir) return null
  try {
    return readFileSync(join(dir, 'last-status.json'), 'utf8')
  } catch {
    return null
  }
}
```

Di bawah `readTelegramRegistryName` (baris ±338-349) tambahkan varian ber-timestamp, lalu refactor `readTelegramRegistryName` jadi delegasi (DRY):

```ts
// Registry entry incl. its write timestamp — needed by the boot-resume
// freshness arbitration (spec 2026-07-20 §3.2).
function readTelegramRegistryEntry(sessionId: string): RegistryEntry | null {
  const dir = resolveTelegramStateDir()
  if (!dir) return null
  try {
    const obj = JSON.parse(
      readFileSync(join(dir, 'session-names.json'), 'utf8'),
    ) as Record<string, { name?: unknown; updatedAt?: unknown }>
    const e = obj[sessionId]
    if (!e || typeof e.name !== 'string' || !e.name) return null
    return { name: e.name, updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0 }
  } catch {
    return null
  }
}

function readTelegramRegistryName(sessionId: string): string | null {
  return readTelegramRegistryEntry(sessionId)?.name ?? null
}
```

- [ ] **Step 2: Ganti resolusi nama di blok resume**

Blok resume (±baris 895-906) — ganti baris `const resolvedName = ...` dan tambahkan logging, menjadi:

```ts
if (!startupMode.isFirstRun && startupMode.latestSessionId) {
  const sid = startupMode.latestSessionId
  // Resolve label by FRESHNESS, not fixed priority (spec 2026-07-20 §3.2):
  // the statusline snapshot can be a poisoned post-/clear render (new sid +
  // old name) and the registry can lag a PTY-injected /rename — whichever
  // was written more recently wins; tie → registry (event-driven writes
  // beat renders). The old `lastStatus ?? registry` priority is what let a
  // poisoned snapshot beat a correct registry (incident bot-03 2026-07-18).
  const lastStatusRaw = readLastStatusRaw()
  const registryEntry = readTelegramRegistryEntry(sid)
  const { name: resolvedName, source } = resolveResumeName(lastStatusRaw, registryEntry, sid)
  const snap = lastStatusRaw ? parseStatuslineSnapshot(lastStatusRaw) : null
  log(
    `resume name resolution: last-status=${
      snap && snap.session_id === sid ? `"${snap.session_name}"@${snap.captured_at_ms}` : 'none'
    } registry=${
      registryEntry ? `"${registryEntry.name}"@${registryEntry.updatedAt}` : 'none'
    } → picked ${source} ${JSON.stringify(resolvedName)}`,
  )
  updateSessionState({ session_id: sid, session_name: resolvedName })
  writeSystemOutbox({
    type: 'session-change',
    sessionId: sid,
    sessionName: resolvedName,
  })
}
```

(Komentar lama "Resolve label: prefer CC's own statusline snapshot..." dihapus — digantikan komentar baru di atas.)

- [ ] **Step 3: Verifikasi typecheck + test suite**

Run (dari `plugins/pty-controller/wrapper/`):
`bunx tsc --noEmit` (atau `npx tsc --noEmit` bila bunx tidak tersedia)
Expected: no errors.
Run: `bun test src/session-state.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "fix(pty-controller): boot-resume resolves session name by freshness

Ganti prioritas statis lastStatus ?? registry dengan arbitrase timestamp
(resolveResumeName) + log kedua kandidat dan keputusannya. Menutup jalur
insiden bot-03 2026-07-18 (snapshot beracun menang atas registry benar).

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Revalidasi kontinu di sessionPollInterval (wrapper.ts)

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts` (poll loop ±baris 825-888; import `node:fs` ±baris atas file; import `'./session-state'`)

**Interfaces:**
- Consumes: `shouldAdoptStatuslineName` (Task 1), `readLastStatusRaw` (Task 2), `updateSessionState`, `writeTelegramRegistryName`, `awaitingClearReady`, `injectionGate.clearBarrierActive`, `sessionState`, `log` (existing).
- Produces: — (leaf change).

- [ ] **Step 1: Tambah fungsi revalidasi + wiring di poll loop**

Tambahkan `statSync` ke import `node:fs` di wrapper.ts, dan `shouldAdoptStatuslineName` ke import `'./session-state'`.

Tambahkan tepat di atas `const sessionPollInterval` (±baris 825):

```ts
// Self-healing (spec 2026-07-20 §3.1): adopt the live session's name from
// CC's own statusline snapshot whenever it is strictly fresher than our
// state. Heals divergence from ANY path (poisoned boot seed, terminal-typed
// /rename, registry races) within one statusline fire. mtime-gated so the
// steady-state cost is one statSync per 500ms tick.
let lastStatusSeenMtimeMs = 0
function revalidateSessionNameFromStatusline(): void {
  const dir = resolveTelegramStateDir()
  if (!dir) return
  const file = join(dir, 'last-status.json')
  let mtimeMs: number
  try {
    mtimeMs = statSync(file).mtimeMs
  } catch {
    return // file absent — statusline never fired yet
  }
  if (mtimeMs === lastStatusSeenMtimeMs) return
  lastStatusSeenMtimeMs = mtimeMs // set BEFORE parsing so corrupt files aren't re-parsed every tick
  const raw = readLastStatusRaw()
  if (raw === null) return
  const adopt = shouldAdoptStatuslineName(sessionState, raw, {
    inClearTransition:
      awaitingClearReady !== null || injectionGate.clearBarrierActive(Date.now()),
  })
  if (!adopt) return
  const oldName = sessionState?.session_name ?? null
  updateSessionState({ session_name: adopt })
  // Keep the registry converged too (same pattern as the /rename handler).
  // Best-effort: a failed registry write is logged inside the writer and
  // does not undo the (already correct) state adoption.
  const sidNow = sessionState?.session_id
  if (sidNow) writeTelegramRegistryName(sidNow, adopt)
  log(
    `session name revalidated from statusline: ${JSON.stringify(oldName)} → ${JSON.stringify(adopt)}`,
  )
  // Deliberately NO system-outbox event: the rename already happened in CC;
  // we are syncing our copy, not orchestrating a transition (spec §3.1).
}
```

Lalu ubah awal callback `sessionPollInterval` dari:

```ts
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) return
  const current = listSessions()
```

menjadi:

```ts
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) {
    revalidateSessionNameFromStatusline()
    return
  }
  const current = listSessions()
```

(Sisa body loop tidak berubah. Guard `inClearTransition` di dalam fungsi tetap mengecek `awaitingClearReady` + clear barrier — terlihat redundan dengan branch di atasnya, tapi barrier bisa masih aktif SETELAH `awaitingClearReady` di-null-kan, tepat di settle window `/rename` post-/clear; itu window produksi snapshot beracun.)

- [ ] **Step 2: Verifikasi typecheck + test suite**

Run: `bunx tsc --noEmit`
Expected: no errors.
Run: `bun test src/session-state.test.ts`
Expected: PASS.

- [ ] **Step 3: Smoke test manual logika file-gate (opsional tapi murah)**

Tidak ada harness E2E untuk wrapper (spawn CC beneran). Verifikasi unit sudah meng-cover keputusan; wiring diverifikasi di Task 5 (deploy nyata). Pastikan saja tidak ada import sisa: `readLastStatusSessionName` dan `nameFromLastStatus` tidak lagi di-import wrapper.ts.

Run: `grep -n "readLastStatusSessionName\|nameFromLastStatus" plugins/pty-controller/wrapper/src/wrapper.ts`
Expected: tidak ada hasil (exit non-zero).

- [ ] **Step 4: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(pty-controller): continuous session-name revalidation in poll loop

Adopsi nama dari statusline CC saat lebih fresh dari state (mtime-gated,
guard transisi /clear + freshness), sync registry, log adopsi. Tanpa
outbox event - wrapper menyinkronkan salinan, bukan orkestrasi transisi.

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Versi, README, merge & push

**Files:**
- Modify: `plugins/pty-controller/wrapper/package.json` (version `0.0.7` → `0.0.8`)
- Modify: `plugins/pty-controller/.claude-plugin/plugin.json` (version `0.0.30` → `0.0.31`)
- Modify: `plugins/pty-controller/README.md` (dokumentasikan kontrak self-healing)

**Interfaces:**
- Consumes: hasil Task 1-3 sudah commit di branch worktree.
- Produces: release ter-push di `main`; `wrapper.version` bot akan menunjukkan `0.0.8` setelah restart (dipakai verifikasi Task 5).

- [ ] **Step 1: Bump dua file versi**

`wrapper/package.json`: `"version": "0.0.7"` → `"version": "0.0.8"`.
`.claude-plugin/plugin.json`: `"version": "0.0.30"` → `"version": "0.0.31"`.

- [ ] **Step 2: Update README pty-controller**

Tambahkan di README.md (section tentang state files / wrapper behavior — ikuti struktur heading existing) blok berikut:

```markdown
### Session-name self-healing (wrapper >= 0.0.8)

`wrapper.state.json` / `wrapper.current_session_name` menyembuhkan diri dari
divergensi nama: tiap tick poll 500ms (di luar transisi `/clear`), wrapper
membandingkan snapshot statusline CC (`last-status.json`) dengan state-nya —
bila snapshot menggambarkan session yang sama dan LEBIH BARU
(`captured_at_ms` > `updated_at_ms` state) dengan nama berbeda, nama snapshot
diadopsi (state + registry), ter-log sebagai `session name revalidated…`.
Saat boot-resume, nama di-seed dengan arbitrase freshness last-status vs
registry (tie → registry), ter-log sebagai `resume name resolution…`.
Desain: `docs/superpowers/specs/2026-07-20-wrapper-session-name-self-healing-design.md`.
```

- [ ] **Step 3: Commit release**

```bash
git add plugins/pty-controller/wrapper/package.json plugins/pty-controller/.claude-plugin/plugin.json plugins/pty-controller/README.md
git commit -m "release(pty-controller): 0.0.31 / wrapper 0.0.8 — session-name self-healing

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Merge ke main + push SEGERA (shared-repo discipline)**

```bash
cd C:\Users\Mirza\workspace\mirza-marketplace
git merge --no-ff feat/wrapper-name-self-healing -m "merge: wrapper session-name self-healing (spec 2026-07-20)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
git status -sb
```

Expected: `## main...origin/main` TANPA "ahead". Lalu bersihkan worktree:

```bash
git worktree remove ../mirza-marketplace-bot-03-name-selfheal
git branch -d feat/wrapper-name-self-healing
```

---

### Task 5: Verifikasi deploy di bot-03 (koordinasi dengan Mirza)

**Files:** — (verifikasi runtime, tidak ada perubahan kode)

**Interfaces:**
- Consumes: release 0.0.31 ter-push (Task 4).
- Produces: bukti E2E untuk laporan akhir.

- [ ] **Step 1: Minta Mirza update + restart mirza-cc bot-03**

Wrapper berjalan per-bot dan hanya memuat kode baru saat restart; restart mematikan CC yang di-host (session akan di-resume otomatis oleh wrapper baru). Kirim instruksi via Telegram: update plugin (marketplaces copy ke-pull otomatis oleh CC updater / `git pull --ff-only`) lalu restart mirza-cc bot-03. JANGAN restart sendiri dari dalam session (mematikan diri sendiri tanpa konfirmasi user).

- [ ] **Step 2: Verifikasi pasca-restart (setelah wrapper hidup lagi)**

```powershell
Get-Content C:\Users\Mirza\workspace\bot-03\.claude\channels\pty-controller\wrapper.version
Select-String -Path C:\Users\Mirza\workspace\bot-03\.claude\channels\pty-controller\wrapper.log -Pattern 'resume name resolution' | Select-Object -Last 3
Get-Content C:\Users\Mirza\workspace\bot-03\.claude\channels\pty-controller\wrapper.state.json
```

Expected: `wrapper_version: 0.0.8`; log memuat baris `resume name resolution: … → picked …` dengan nama benar; `wrapper.state.json.session_name` == nama di `session-names.json` untuk session aktif == nama di `last-status.json` (setelah ≥1 turn).

- [ ] **Step 3: Uji self-healing hidup (divergensi buatan yang aman)**

Setelah wrapper 0.0.8 jalan: TIDAK memodifikasi RAM wrapper — divergensi disimulasikan justru dengan membuat statusline fire terbaru (turn AI apa pun, mis. pesan telegram "ping") lalu cek log: tidak ada adopsi (nama sudah sinkron). Uji adopsi positif: `/rename` ke nama lain via `pty_send_slash` (jalur wrapper, state ikut) BUKAN uji jalur ini — jalur adopsi teruji oleh unit test + kejadian nyata berikutnya; jangan memaksakan simulasi yang merusak state live. Catat keterbatasan ini jujur di laporan akhir.

- [ ] **Step 4: Laporan akhir ke Mirza via Telegram**

Ringkas: apa yang berubah, bukti verifikasi (versi, log line, konvergensi), keterbatasan uji (jalur adopsi kontinu terverifikasi via unit test, belum via insiden nyata), dan bahwa bot lain mendapat fix saat restart mirza-cc masing-masing.

---

## Self-review checklist (sudah dijalankan penulis plan)

1. **Spec coverage:** §3.1 → Task 1 (shouldAdoptStatuslineName) + Task 3 (wiring); §3.2 → Task 1 (resolveResumeName) + Task 2 (wiring); §3.3 → Task 1; §4 error handling → guard try/catch di semua reader (Task 1-3); §5 rollout → Task 4-5. Tidak ada gap.
2. **Placeholder scan:** tidak ada TBD/TODO; semua step berisi kode/command nyata.
3. **Type consistency:** `StatuslineSnapshot`/`RegistryEntry`/signature `shouldAdoptStatuslineName(state, raw, {inClearTransition})`/`resolveResumeName(lastStatusRaw, registry, sessionId)` konsisten antara Task 1 (definisi), Task 2, dan Task 3 (pemakaian).
