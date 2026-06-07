# Transactional Session-Name Switching (Design)

**Date:** 2026-06-07
**Status:** Approved (brainstorm session bot-02, 2026-06-07 — user Mirza via Telegram)
**Plugins:** `plugins/pty-controller/` (wrapper), `plugins/agent-bus/` (peer-status reader), `plugins/handoff/` (READY contract)
**Related:** memperbaiki bug yang lolos dari `agent-bus` 0.0.10 stale-snapshot detection (commit `5ed20ed`)

## 1. Latar Belakang & Tujuan

Saat handoff antar-bot, tiap bot mengganti **session name**-nya lewat injeksi
slash command:

- **Sender** (bot yang menyerahkan): `/rename done-<slug>-<ts>` → `/clear` → `/rename idle`
- **Receiver** (bot yang menerima): `/rename task-<slug>`

Fase switching ini krusial: peer lain membaca status kesiapan sebuah bot dari
nama session-nya (`idle` = READY) lewat tool `agent_status`. Bila pembacaan
tidak konsisten dengan keadaan sebenarnya, estafet bisa salah sasaran
(handoff ke bot yang sedang reset, atau anggap sibuk padahal idle).

### Bug yang memicu desain ini

Diamati 2026-06-07: bot-01 layarnya sudah `idle` (selesai self-reset), tetapi
`agent_status(bot-01)` tetap melaporkan `current_session_name =
"done-todolist-pingpong-202606071256"` dengan `context_used_percent: null`.

**Root cause (terverifikasi dari file state asli bot-01):**

| Sumber | session_id | session_name |
|---|---|---|
| `telegram/last-status.json` | `e23f460f` | `done-todolist-pingpong-…` (basi) |
| `pty-controller/wrapper.current_session_id` | `e23f460f` (sama) | — |
| `pty-controller/wrapper.current_session_name` | — | `idle` (benar) |
| `telegram/session-names.json[e23f460f]` | — | `done-…` (basi juga) |

Stale-detection di `agent-bus/peer-status.ts` (0.0.10) mendeteksi snapshot
basi lewat **mismatch session_id** (`last-status.id ≠ wrapper.id`),
berasumsi `/clear` membuat session_id baru. Kenyataannya di Claude Code
v2.1.168, urutan `/rename done → /clear → /rename idle` berjalan **pada
session_id yang SAMA** (`e23f460f`). Karena id match, peer-status menganggap
snapshot masih live dan mengembalikan nama basi dari `last-status.json`,
mengabaikan `wrapper.current_session_name` yang sudah benar.

Penyebab tambahan:
- `last-status.json` hanya di-refresh saat **statusLine fire**; session idle
  yang baru di-reset tidak pernah memicunya, jadi datanya beku.
- `/rename` yang di-inject lewat PTY (self-reset) tidak melewati handler
  telegram `handleRename`, sehingga `session-names.json` pun tidak ter-update.
- Akibat sama menimpa **context%**: angka bisa nyangkut di nilai pra-`/clear`.

### Tujuan

Menjadikan fase switching session-name sebagai transaksi **atomic per-bot**
yang **observable** dan **stabil**, sehingga setiap reader selalu melihat
keadaan yang konsisten — terlepas dari apakah `/clear` merotasi session_id
atau tidak, dan terlepas dari kapan statusLine terakhir nyala.

## 2. Keputusan Desain (hasil brainstorm)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Ambisi/scope | **Redesign transaksi penuh**: `wrapper.state.json` jadi sumber kebenaran identity+lifecycle; reader baca `lifecycle`, bukan parsing string nama |
| 2 | Batas transaksi | **Atomic per-bot (lokal)**. Urutan baton lintas-bot tetap dipegang mekanisme ACK handoff yang sudah ada — TIDAK menambah 2PC lintas-bot (YAGNI) |
| 3 | Penentuan `lifecycle` | **Wrapper derive dari command + konvensi nama** (satu tempat tahu pemetaan nama→lifecycle). Rename manual non-konvensi → `unknown` |
| 4 | Telemetry context% basi | **Validitas ctx ikut lifecycle**: ctx/model dipercaya HANYA saat lifecycle aktif (`busy`/`unknown`) + id match; saat fase reset (`idle`/`resetting`/`transitioning`) ⇒ `null` |

## 3. Prinsip Arsitektur — Pisahkan 3 Lapis

1. **Identity + Lifecycle** — ditulis **sinkron** oleh wrapper (satu-satunya
   penulis) ke satu file `wrapper.state.json`, atomic (temp + rename).
   Sumber kebenaran "session mana yang live, namanya apa, lifecycle-nya apa".
2. **Telemetry** (context%, context_window_size, model, effort) — dari
   `telegram/last-status.json`, sumbernya statusLine: lossy /
   eventually-consistent. Wajar telat; hanya relevan saat session aktif.
3. **Reader** (`agent_status`, kontrak READY handoff) — baca identity +
   lifecycle dari `wrapper.state.json`; baca telemetry dari `last-status.json`
   **digerbang oleh lifecycle**.

Inti perbaikan: **nama session berhenti merangkap status**. Hanya wrapper
(satu tempat) yang memetakan nama→lifecycle; semua reader cukup membaca field
`lifecycle`.

## 4. Model Data — `wrapper.state.json`

Lokasi: `<project>/.claude/channels/pty-controller/wrapper.state.json`

```json
{
  "session_id": "e23f460f-c53c-40b1-bf5d-7d73a8f1526f",
  "session_name": "idle",
  "lifecycle": "idle",
  "seq": 7,
  "updated_at_ms": 1780812345678
}
```

- `session_id`, `session_name` — identik isinya dengan file lama
  `wrapper.current_session_id` / `wrapper.current_session_name` (lihat §8
  backward-compat: file lama TETAP ditulis).
- `lifecycle` — enum (lihat §5).
- `seq` — counter monotonic, di-bump tiap perubahan identity/lifecycle.
  Membantu deteksi urutan & debugging; reader boleh mengabaikannya.
- `updated_at_ms` — stempel waktu penulisan.
- Penulisan **atomic** (`writeFileSync(tmp)` → `renameSync(tmp, file)`),
  konsisten dengan pola wrapper yang sudah ada. Snapshot selalu lengkap →
  tidak ada torn-read.

## 5. Enum `lifecycle` & Pemetaan (di-derive Wrapper)

| lifecycle | Arti | READY? |
|---|---|---|
| `idle` | nama `idle`, siap menerima handoff | ✅ ya (satu-satunya) |
| `busy` | nama `task-*`, sedang mengerjakan task | ❌ |
| `resetting` | antara `/clear` dikonsumsi sampai rename berikutnya landing (penanda in-progress) | ❌ |
| `transitioning` | nama `done-*` (arsip, sedang reset) | ❌ |
| `unknown` | nama manual non-konvensi / belum diketahui | ❌ (tidak auto-ready) |

**Pemetaan oleh wrapper (SATU tempat yang tahu konvensi nama):**

- Mengamati `/clear` di-inject → set `lifecycle = "resetting"` (penanda
  in-progress), tahan sampai commit.
- Mengamati `/rename <x>` **confirmed ter-apply** → derive dari `<x>`:
  - `x == "idle"` → `idle`
  - `x` diawali `task-` → `busy`
  - `x` diawali `done-` → `transitioning`
  - selain itu → `unknown`
- Fresh spawn first-run yang meng-klaim `idle` → `idle`; selain itu `unknown`
  sampai ada rename.

Pemetaan ini adalah satu-satunya tempat yang meng-couple ke konvensi nama
(yang sudah didokumentasikan di skill handoff §0). Bila konvensi berubah,
hanya tempat ini yang berubah.

## 6. Model Transaksi (Atomic per-bot)

Tiap switch nama lokal = transaksi dengan tiga properti:

1. **Begin (in-progress marker).** Saat switch mulai, wrapper set
   `lifecycle = "resetting"` (atau `transitioning`). Reader langsung melihat
   "not ready" → menutup race "handoff masuk saat session sedang reset"
   (playbook 2026-06-07 bot-03).
2. **Commit (titik tunggal).** Wrapper menulis state final
   `{session_id, session_name, lifecycle}` HANYA setelah injeksi
   (`/rename` / `/clear`) **confirmed ter-apply** — wrapper sudah mendeteksi
   ini lewat `renameArgFromCommand()` pada command yang di-inject, dan
   deteksi fresh-session pasca `/clear`. Satu atomic write = commit point.
   Nama-antara (`done-*`) tidak pernah dibaca sebagai final.
3. **Convergence (bukan lock).** Tiap tick poll wrapper merekonsiliasi state
   dari ground-truth: session jsonl yang live + rename terakhir yang
   ter-apply. Bila satu langkah hilang (crash / injeksi ke-skip), tick
   berikutnya menurunkan ulang state ke kondisi benar. Idempotent, tanpa lock.

Tidak ada ACID lintas-proses; cukup: state monoton+observable (in-progress
marker), commit point tunggal yang atomic, dan konvergensi yang idempotent.

## 7. Perubahan `agent_status` (`agent-bus/peer-status.ts`)

Precedence baru `readPeerSessionInfo`:

1. Baca `wrapper.state.json` → **otoritas** untuk `session_id`,
   `session_name`, `lifecycle`.
2. Baca `last-status.json` → telemetry (`context_used_percent`,
   `context_window_size`, `model`, `effort_level`).
3. Telemetry dipercaya **HANYA** saat `lifecycle ∈ {busy, unknown}` (state
   yang genuinely-active) **DAN** `last-status.session_id == state.session_id`.
   Saat fase reset/fresh (`idle`/`resetting`/`transitioning`) telemetry =
   `null` — di sinilah statusLine diketahui nge-lag. Catatan: untuk `idle`
   ctx di-null-kan terlepas id match/tidak, karena session yang baru di-clear
   pasti ~0 (kasus bug: id tetap sama `e23f460f` sehingga id-match tak bisa
   membedakan; `lifecycle` yang membedakan).
4. **Backward-compat:** bila `wrapper.state.json` absen (peer memakai wrapper
   versi lama), jatuh ke logika 0.0.10 yang sekarang (mismatch session_id +
   backfill `wrapper.current_session_name`). Fleet versi-campuran tetap jalan.

Output `agent_status` mendapat field baru: **`lifecycle`** (string|null).
Field lama (`current_session_name`, `context_used_percent`,
`context_window_size`, `model`, `effort_level`) dipertahankan.

## 8. Perubahan Skill `handoff` — Kontrak READY

- **READY** = `lifecycle == "idle"` (menggantikan parsing prefix
  `idle`/`task-*`/`done-*`). Karena ctx kini andal (null saat fresh), syarat
  ctx menjadi konsekuensi alami, bukan penjaga utama.
- §0 (tabel konvensi & definisi READY), §3 (marker picker:
  ✅ idle / ⛔ busy / ⚠️ transitioning|unknown / 📴 offline), §5.0 (guard
  full-auto) — semua membaca `lifecycle`.
- **Fallback:** bila `agent_status` tidak mengembalikan `lifecycle` (peer
  wrapper lama) → pakai heuristik nama lama (string `idle`).

## 9. Backward-Compat / Rollout

- `agent-bus` reader menangani DUA jalur: `state.json` ada → jalur baru;
  absen → jalur lama. Aman untuk fleet campuran.
- `pty-controller` wrapper di-bump untuk menulis `state.json`. Bot
  mengadopsinya begitu wrapper-nya restart/update. Rollout bertahap aman.
- Wrapper **TETAP** menulis `wrapper.current_session_id` /
  `wrapper.current_session_name` lama (jangan dihapus) → reader lama tetap
  jalan (kompat dua arah).
- Skill handoff fallback ke heuristik nama saat `lifecycle` tak tersedia.

## 10. Strategi Testing (TDD)

**`agent-bus/peer-status.test.ts`:**
- `state.json` ada dengan tiap nilai `lifecycle` → field & gating benar.
- Telemetry gating: `lifecycle ∈ {idle, resetting, transitioning}` ⇒
  ctx/model null walau `last-status` berisi angka; `lifecycle ∈ {busy,
  unknown}` + id match ⇒ angka diteruskan; `unknown` + id mismatch ⇒ null.
- `state.json` absen → perilaku 0.0.10 lama (regресi guard).
- **Skenario bug persis:** id sama (`e23f460f`), `last-status.name` basi
  (`done-…`), `state.json` = `{name: idle, lifecycle: idle}` → kembalikan
  `idle` + ctx `null`.

**`pty-controller` wrapper (unit):**
- Derivasi lifecycle: `/clear` → `resetting`; mapping target rename
  (`idle`/`task-*`/`done-*`/manual).
- Urutan commit: state final hanya ditulis setelah confirmed-apply.
- Convergence: setelah satu langkah di-drop, tick berikut memperbaiki state.
- Atomic write & seq monoton.

**Skill `handoff`:** READY dihitung dari `lifecycle`; fallback nama saat
lifecycle absen.

## 11. Yang TIDAK Dikerjakan (YAGNI / Out of Scope)

- 2-phase-commit / koordinasi baton lintas-bot (Q2 = atomic per-bot).
- Mengubah cara statusLine bekerja atau memaksa statusLine fire.
- Menghapus file lama `wrapper.current_session_*` (dipertahankan untuk
  backward-compat).
- Mengubah konvensi penamaan session itu sendiri (hanya menambah lapisan
  lifecycle di atasnya).

## 12. Artefak yang Tersentuh

- `plugins/pty-controller/wrapper/src/wrapper.ts` — tulis `wrapper.state.json`
  + derivasi lifecycle + in-progress marker + convergence; bump
  `plugin.json`.
- `plugins/agent-bus/peer-status.ts` — precedence baru + field `lifecycle` +
  telemetry gating + fallback; `peer-status.test.ts`; expose di handler
  `agent_status`; bump `plugin.json`.
- `plugins/handoff/skills/handoff/SKILL.md` — kontrak READY via `lifecycle`
  (§0/§3/§5.0) + fallback; bump `plugin.json`.
