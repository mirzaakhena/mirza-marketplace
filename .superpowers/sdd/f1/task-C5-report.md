# Task C5 report — outbound sender telegram (Fase 1)

## Status: SELESAI

## Files
- `packages/telegram-adapter/src/outbound.ts` (baru) — `createOutboundSender()` + `OutboundCommand` union/parser + `OutboundApi`/`OutboundStore` deps + `assertSendable`/`REACTION_EMOJI_WHITELIST`/`PHOTO_EXTS`/`MAX_ATTACHMENT_BYTES`.
- `packages/telegram-adapter/test/outbound.test.ts` (baru).
- `packages/telegram-adapter/src/index.ts` — tambah `export * from "./outbound"` (baris lain tidak diubah; task C4 paralel sudah menambah `export * from "./inbound"` sebelumnya — tidak ada tabrakan, dicek isi file sebelum edit).

## Verifikasi
- `bun test packages/telegram-adapter` → **158 pass, 0 fail** (374 expect() calls, 9 file test).
- `bun test` (project-wide) → **317 pass, 0 fail**.
- `bun run typecheck` (`tsc --noEmit`, project-wide) → **exit 0**.

## Ringkasan implementasi
- `createOutboundSender({botId, api, store, access: ()=>Access, stateDir, token, fetchImpl?, now?})` → `{ handle(cmd: unknown): Promise<string> }`.
- `reply`: gate `assertAllowedChat` (allowFrom/groups, port server.ts:315-320) → validasi buttons (`validateButtons` dari C1, callback_id regex + max 8x8) → SCAR-062 tolak bila buttons+files sekaligus → `assertSendable` per file (anti-exfil) + cap 50MB (SCAR-054) → `planOutbound` (C1: chunking + convert markdown→MV2 per chunk) → kirim tiap chunk via `api.sendMessage`, fallback plain-text saat error "can't parse entities" (SCAR-048) → buttons hanya di `reply_markup` chunk TERAKHIR → file dikirim setelah semua chunk teks (photo ext `.jpg/.jpeg/.png/.gif/.webp` → `sendPhoto`, selainnya → `sendDocument`) → log tiap chunk & file ke `store.logOutbound` (source dari `cmd.source` default `'assistant'`). Return `'sent (id: N)'` bila 1 pesan, `'sent K parts'` bila lebih (sesuai teks di brief — beda dari kode acuan yg menyertakan daftar ids).
- `react`: gate sama + tolak emoji di luar `REACTION_EMOJI_WHITELIST` (SCAR-053, daftar disalin verbatim dari `plugins/telegram/ACCESS.md:82`) sebelum memanggil `api.setMessageReaction`.
- `download_attachment`: `api.getFile` → bangun URL `https://api.telegram.org/file/bot<token>/<file_path>` → `fetchImpl` (default `fetch`, injectable) → tulis ke `<stateDir>/inbox/<ts>-<file_unique_id sanitized>.<ext>` (mkdir recursive). Return path.
- `get_message_by_id`: `store.getMessage(chat_id, message_id)` → `JSON.stringify(row, null, 2)`; not-found → throw pesan jelas (`no message <id> in chat <chat_id>`).
- `edit_message` TIDAK dibuat (sesuai §10.5 & brief).

## Deviasi terdokumentasi dari brief (didokumentasikan di komentar modul `outbound.ts`)
1. **`OutboundCommand` bukan zod literal** — `zod` bukan dependency `@mirza-harness/telegram-adapter` (hanya `shared` dan `hostd` yang punya symlink `node_modules/zod`; dicek empiris: `import("zod")` dari package ini gagal resolve). Menambah `zod` ke `package.json` + `bun install` di luar scope yang diizinkan ("boleh sentuh HANYA outbound.ts/index.ts/test", "JANGAN bun install"). Solusi: `parseOutboundCommand()` hand-rolled — union type + validator parse-or-throw dengan pesan error per field, semantik sama (reject shape salah, field wajib, dst.) tanpa dependency zod baru.
2. **`token` ditambah ke constructor options** — daftar di brief (`{botId, api, store, access, stateDir}`) tidak menyebutnya, tapi `download_attachment` butuh token bot untuk membangun URL download (grammy `getFile()` hanya mengembalikan `file_path`, bukan URL). Tanpa token tidak mungkin implementasi nyata jalan — ditambahkan sebagai field terpisah dari `api` (bukan bagian dari `OutboundApi`) supaya `api` tetap murni send/receive surface.
3. **`OutboundStore` adalah interface lokal (struktural)**, bukan import dari `@mirza-harness/hostd` — hostd sudah depend ke telegram-adapter, jadi arah sebaliknya akan jadi cycle. Polanya identik dengan `InboundStoreLike` yang sudah dipakai C4 (`inbound.ts`) untuk masalah yang sama. Real `createMessagesStore()` dari hostd tetap plug-compatible (structural typing) tanpa perlu import.

## Test coverage (test/outbound.test.ts)
- reply teks panjang → 3 chunk berurutan, buttons hanya di chunk terakhir, log per-chunk dgn ts naik.
- reply file setelah teks (photo vs document by ext), log attachments per file.
- format `'markdown'` → convert MV2 + parse_mode; fallback plain saat `sendMessage` throw `description` mengandung "parse entities" (hanya 1 log row per chunk logis, bukan per percobaan API); error lain (non parse-entities) tetap dilempar.
- SCAR-062: buttons+files ditolak; shape buttons invalid ditolak; chat di luar allowFrom/groups ditolak.
- SCAR-053: emoji whitelist — diterima bila whitelisted, ditolak (tanpa memanggil API) bila tidak.
- Anti-exfil: file di root stateDir ditolak (unit `assertSendable` + end-to-end lewat `handle()`), file di `stateDir/inbox` diterima, file di luar stateDir sama sekali diterima.
- download_attachment: `fetchImpl` injectable menulis file nyata ke `stateDir/inbox/<ts>-<unique>.<ext>`; HTTP gagal → throw; `file_path` kosong → throw jelas.
- get_message_by_id: roundtrip dengan **store nyata** (SQLite in-memory, schema dari `@mirza-harness/shared` `applySchema`) — reply() menulis row lalu get_message_by_id membacanya balik; not-found → throw jelas.
- Validasi shape command: op tak dikenal & field wajib hilang → throw jelas.

## Concerns
- Deviasi #1 (zod) berarti validasi shape TIDAK 100% "zod union" seperti diminta literal di brief — kalau nanti `telegram-adapter` memang diberi dependency `zod` (mis. task lain menambahkannya untuk alasan lain), modul ini sebaiknya dimigrasi ke `z.discriminatedUnion` yang sesungguhnya untuk konsistensi lintas paket; untuk sekarang perilaku (reject shape salah, pesan error informatif) sudah setara.
- `token` sebagai constructor option baru: perlu dipastikan assembly layer (hostd, task berikutnya yang menyambungkan poller+outbound+bus) benar-benar meneruskan bot token ke sini — kalau lupa, `download_attachment` akan membangun URL dengan token kosong dan gagal di production (tidak akan terdeteksi oleh test unit ini karena network di-mock).
- Konflik file jinak: `src/index.ts` diedit bersamaan dengan task C4 (paralel) — sudah dicek isinya sebelum edit, kedua baris re-export (`./inbound` dan `./outbound`) hidup berdampingan tanpa saling menimpa.

## Fix pass 1 (zod-ifikasi)

**Status: SELESAI**

Menggantikan hand-rolled `parseOutboundCommand` (Deviasi #1 di atas) dengan zod discriminated union sesungguhnya, sesuai prinsip proyek "zod di tiap boundary + skema tool satu sumber di shared". Deviasi #1 di atas kini **tidak berlaku lagi**.

### Files diubah
- `packages/shared/src/outbound-command.ts` (baru) — `OutboundCommandSchema` = `z.discriminatedUnion("op", [...])` atas 4 skema `.strict()`: `ReplyCommandSchema`, `ReactCommandSchema`, `DownloadAttachmentCommandSchema`, `GetMessageByIdCommandSchema`. Plus `ReplyFormatSchema`/`ReplySourceSchema` enum dan semua type `z.infer` (`OutboundCommand`, `ReplyCommand`, dst.).
- `packages/shared/src/index.ts` — `+1` baris: `export * from "./outbound-command";`.
- `packages/telegram-adapter/src/outbound.ts` — hapus hand-rolled interfaces + `isRecord`/`isString`/`isStringArray`/`REPLY_FORMATS`/`REPLY_SOURCES` + body parser (~100 baris); `parseOutboundCommand()` sekarang tinggal `OutboundCommandSchema.parse(raw)`, tipe di-re-export dari shared. Validasi runtime-context (buttons deep-shape via `validateButtons`, emoji whitelist, file exists/size 50MB, chat allowlist) **tidak disentuh**. `zod` tetap tidak diimpor langsung di package ini — hanya schema/types dari `@mirza-harness/shared`.
- `packages/telegram-adapter/test/outbound.test.ts` — describe block "command shape validation" diperbarui: 2 test lama (unknown op / missing field) sekarang assert lewat duck-typing `error.name === "ZodError"` + `Array.isArray(error.issues)` (bukan `instanceof ZodError`, karena `zod` bukan dependency langsung telegram-adapter — import langsung akan gagal resolve, dicek empiris). Tambah 1 test baru: unrecognized key pada `reply` yang sudah valid ditolak (strict schema). Semua test lain (chunking, buttons SCAR-062, react whitelist SCAR-053, anti-exfil, download_attachment, get_message_by_id) **tidak diubah** — masih pass tanpa modifikasi.
- `packages/shared/test/outbound-command.test.ts` (baru) — parse valid untuk keempat op (reply minimal+full, react, download_attachment, get_message_by_id) + reject: unknown op, field wajib hilang, tipe field salah, enum `format` invalid, dan **strict reject unrecognized key** (reply & react).

### Catatan desain
- `buttons` tetap `z.array(z.unknown()).optional()` — shape-level saja (array-of-rows), deep-validasi (callback_id regex `/^[a-z0-9_]{1,32}$/`, cap 8 rows x 8 cols, label len, uniqueness) tetap di `validateButtons()` runtime, tidak dipindah ke zod (sesuai batasan brief: batasan runtime-context boleh tetap di outbound.ts).
- `.strict()` pada tiap varian union: perilaku BARU dibanding parser hand-rolled lama (yang dulu diam-diam mengabaikan key asing). Tidak melemahkan/mengubah test existing manapun (tak ada test lama yang mengirim command dengan key asing) — ditambahkan sebagai kemampuan baru khusus diuji di test file shared + 1 test tambahan di outbound.test.ts, sesuai arah "skema tool satu sumber, reusable oleh cc-stub D2".

### Verifikasi
- `bun test packages/telegram-adapter packages/shared` → **196 pass, 0 fail** (439 expect() calls, 13 file test).
- `bun run typecheck` (`tsc --noEmit`, project-wide) → **exit 0**.
- Tidak ada `git add`/commit/push. Tidak ada `bun install` dijalankan. `inbound.ts` tidak disentuh.
