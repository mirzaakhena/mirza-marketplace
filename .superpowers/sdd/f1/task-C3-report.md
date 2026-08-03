# Task C3 — poller lifecycle grammy supervised + config hostd

Status: DONE (semua test target hijau, typecheck seluruh repo exit 0).

## Verifikasi akhir

```
$ bun test packages/telegram-adapter packages/hostd/test/config.test.ts
138 pass / 0 fail / 258 expect() calls (8 file test)

$ bun test          # whole repo, sanity check (termasuk file task paralel)
282 pass / 0 fail / 575 expect() calls (19 file test)

$ bunx tsc --noEmit
(tidak ada output) -> exit 0
```

Tidak menjalankan `bun install`. Dependency baru
`"@mirza-harness/telegram-adapter": "workspace:*"` di
`packages/hostd/package.json` resolve otomatis saat `bun test`/`tsc` —
tidak ada symlink baru dibutuhkan di `node_modules/@mirza-harness/`
(hanya `shared` yang sudah tersimlink sebelumnya; `telegram-adapter` tetap
resolve lewat resolver workspace bawaan bun). Tidak BLOCKED.

## 1. `packages/telegram-adapter/src/poller.ts` — poller lifecycle

Port dari `plugins/telegram/server.ts:99-206` (boot/pid-file) +
`:2141-2195` (retry/backoff bot.start). `createPoller({token, onInbound,
onStatus, botFactory?, conflictThreshold?, retryDelayMs?})` membungkus
grammy `Bot` lewat interface `PollerBot` (subset yang benar-benar dipakai:
`use`/`start`/`stop`/`catch`) — supaya test bisa menyuntik mock murni lewat
`botFactory`, tanpa network nyata. Retry/backoff attempt-reset-on-success
dan formula delay `min(1000*attempt, 15000)` persis kode acuan.

- **LOSS-6**: kode acuan berhenti retry setelah 8x 409 Conflict tapi
  proses tetap hidup (zombie — MCP stdin masih terbuka). Di sini, begitu
  `conflictStreak >= conflictThreshold` (default 8), poller memanggil
  `stop()` atas dirinya sendiri DAN melapor
  `{state:'dead', reason:'conflict-409'}` lewat `onStatus` — tidak ada
  retry ke-9, tidak zombie.
- **SCAR-061**: `bot.catch` dipasang eksplisit di dalam `createPoller` —
  error di tengah pemrosesan satu update di-log + dilaporkan
  `{state:'degraded', reason}` **tanpa** memanggil `stop()`; long-poll lain
  tetap jalan. Diverifikasi test: `bot.stopCalls` tetap 0 setelah error
  handler terpicu.
- **SCAR-050 (sengaja TIDAK diport)**: takeover pid-file didokumentasikan
  di komentar modul sebagai DIGANTI oleh model supervisi proses-tunggal
  hostd (satu hostd = satu-satunya konsumen `getUpdates` per token; tidak
  ada instance kedua yang perlu "diambil alih").
- `stop()` idempoten: flag `stopping` internal mencegah `bot.stop()`
  terpanggil lebih dari sekali; aman dipanggil berkali-kali atau sebelum
  `start()`.
- `start()` mengembalikan `Promise<void>` yang resolve saat siklus poll
  berakhir (dead/stopped/clean-exit) — fire-and-forget bagi caller biasa,
  tapi bisa di-`await` (dipakai test untuk menunggu state `dead` tercapai
  secara deterministik).
- `export type { Context }` ditambahkan di `poller.ts` supaya konsumen
  (`packages/hostd`) bisa mengetik callback `onInbound` tanpa menambah
  dependency langsung ke `grammy`.

## 2. `packages/hostd/src/config.ts` — `loadConfig(path?)`

Baca `MIRZA_HOSTD_CONFIG` (env) atau default `hostd.config.json` di
`process.cwd()` (path eksplisit menang atas env, env menang atas default).
Zod `.strict()`: `{bots: [{id, telegram_token, workspace}]}`.

- **LOSS-5**: `telegram_token` di-`transform` (strip BOM di awal + `.trim()`
  whitespace/CR/LF) sebelum divalidasi format
  `^\d+:[A-Za-z0-9_-]{30,}$` lewat `.refine()`. Gagal format menghasilkan
  pesan error yang menyebut nilai setelah di-trim, format yang benar, dan
  merujuk `hostd.config.example.json`.
- File tidak ada → `Error` jelas: menyebut path yang dicoba, cara set
  `MIRZA_HOSTD_CONFIG`, dan rujukan ke `hostd.config.example.json`.
- JSON rusak → error terpisah ("bukan JSON valid") sebelum masuk ke
  validasi zod (tidak membiarkan `JSON.parse` melempar mentah).
- Skema salah (field tak dikenal, `bots` bukan array, dll) → error berisi
  daftar issue path+message dari zod.

## 3. `hostd.config.example.json` + `.gitignore`

Contoh 1 bot dengan token placeholder format valid (`123456789:AAHx...`,
36 char setelah `:`) di root repo. `.gitignore` root ditambah 1 baris
`hostd.config.json` (file config asli, berisi token nyata, tidak boleh
ter-commit).

## 4. `packages/hostd/src/adapters/telegram.ts` — `startTelegramAdapters`

`startTelegramAdapters(config: HostdConfig, deps?)` — satu `createPoller`
per entri `config.bots`, `deps.onInbound?: (botId, ctx) => void` default
no-op (C4/pipeline belum ada — brief eksplisit melarang menyambungkannya
sekarang), `deps.createPoller?` opsional untuk injeksi test di fase
berikutnya. Mengembalikan `{pollers, statuses, stopAll()}` —
`statuses: ReadonlyMap<string, PollerStatus>` diperbarui in-place setiap
`onStatus` terpanggil, jadi siap dibaca doctor komponen `adapters`
(map botId→state) begitu diwire (di luar scope task ini — tidak menyentuh
`doctor.ts`/`hostd/src/index.ts`).

Tidak ada file test khusus untuk modul ini — di luar daftar deliverable
test brief (`poller.test.ts` + `config.test.ts` saja); modul ini
typecheck bersih dan hanya menyusun ulang primitif yang sudah teruji
(`createPoller`, `loadConfig`).

## Test

- `packages/telegram-adapter/test/poller.test.ts` (6 test, grammy DIMOCK
  via `botFactory` — `MockBot` implements `PollerBot`, tidak ada network):
  8x409 beruntun → dead+stop (startCalls=8, stopCalls=1); <8x409 lalu
  sukses → reset, tidak pernah dead; error handler (`bot.catch`) →
  degraded tanpa stop (stopCalls=0 sampai `stop()` eksplisit); stop()
  idempoten (dipanggil 3x → `bot.stop()` cuma 1x) dan aman dipanggil
  sebelum `start()`; `onInbound` terpasang lewat `bot.use()` saat
  disediakan.
- `packages/hostd/test/config.test.ts` (14 test): config valid (single &
  multi-bot), prioritas path eksplisit > env > default, token
  CRLF/spasi/BOM ter-trim ke nilai identik, token format salah (tanpa
  `:`, secret <30 char, id non-numerik) → throw dengan pesan jelas, file
  hilang → pesan menyebut path + `MIRZA_HOSTD_CONFIG` +
  `hostd.config.example.json`, JSON rusak → pesan "bukan JSON valid",
  field tak dikenal/`bots` bukan array → ditolak (strict).

## File yang disentuh (sesuai daftar boleh-sentuh)

- `packages/telegram-adapter/src/poller.ts` — baru.
- `packages/telegram-adapter/src/index.ts` — +2 baris re-export
  (ditambahkan sebelum baris `export * from "./gate"` milik task paralel
  C2 yang datang belakangan — tidak ada konflik, keduanya koeksis).
- `packages/telegram-adapter/test/poller.test.ts` — baru, 6 test.
- `packages/hostd/src/config.ts` — baru.
- `packages/hostd/src/adapters/telegram.ts` — baru.
- `packages/hostd/test/config.test.ts` — baru, 14 test.
- `packages/hostd/package.json` — +1 dependency
  `@mirza-harness/telegram-adapter` (tanpa `bun install`).
- `.gitignore` — +1 baris `hostd.config.json`.
- `hostd.config.example.json` — baru.

Tidak menyentuh `server.ts`/`delivery.ts`/`doctor.ts`/`gate.ts` atau file
lain milik task paralel (dikonfirmasi lewat `git status --porcelain` +
`git diff` sebelum & sesudah — semua perubahan di file tsb berasal dari
agent lain, bukan dari task ini). Tidak melakukan `git add`/commit/push.
