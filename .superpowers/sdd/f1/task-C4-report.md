# Task C4 report — inbound pipeline telegram (Fase 1)

## Status: SELESAI

## Files
- `packages/telegram-adapter/src/inbound.ts` (baru) — `createInboundPipeline()` + tipe `InboundMessage`/`InboundOutcome`/deps.
- `packages/telegram-adapter/test/inbound.test.ts` (baru).
- `packages/telegram-adapter/src/index.ts` — tambah `export * from "./inbound"` (baris lain tidak diubah; ada baris `export * from "./outbound"` dari task C5 paralel yang bukan hasil saya).

## Verifikasi
- `bun test packages/telegram-adapter` → **134 pass, 0 fail** (308 expect() calls), termasuk 8 file test lain yang sudah ada (tidak diubah).
- `bun x tsc --noEmit` (project-wide) → **exit 0**.

## Ringkasan implementasi
- `createInboundPipeline({botId, access, store, enqueueEnv, downloadFile?, now?, onPending?, onPairingReply?, onAlbumOutcome?})` mengembalikan handler `(msg: InboundMessage | null | undefined) => Promise<InboundOutcome>`.
- Alur: `gate()` (C2) → `drop` | `pairing-reply` | `deliver`. Pada `deliver`: `store.logInbound(source 'user')` lalu `enqueueEnv(Envelope lengkap: id randomUUID, ts detik, from:'telegram', to:botId, kind:'channel-inbound', hop:0, payload:{content, meta})`.
- Album (SCAR-055/SCAR-056): pakai `createAlbumBuffer` (C1) dgn konstanta identik kode acuan (debounce 400ms/hardCap 3000ms/maxItems 10); flush men-sort by `message_id` numerik, quote hanya diambil dari item pertama setelah sort, meta: `media_group_id`, `message_ids` (comma-joined), `image_paths` (newline-joined), `attachments` (JSON-string) — semua value `Record<string,string>`.
- Callback `ai:*`: pakai `parseAiCallbackData` (C1 buttons.ts); non-`ai:*` (`perm:*`/`meta:*`) di-drop diam-diam (di luar scope fase 1). Konten `[button tapped: <label>]`, meta `callback_id` + `button_label` opsional.
- Meta-command fase 1 stub: `isKnownMetaCommand()` cocokkan `/new|/switch|/delete|/rename|/effort` (mirror `meta-commands.ts`) → dipakai sebagai `isMetaCommand` utk `gate()` (SEC-2), dan bila `deliver` tetap terjadi, `meta.note = 'meta-command-unhandled-fase1'` dibubuhkan. `isPermissionReply` sengaja tidak pernah dihitung (selalu false) — full fase 2 scope.
- Pairing: hasil `{type:'pairing-reply', text, code, isResend}` dikembalikan ke caller (BUKAN dikirim sendiri). `onPending(userId, code)` HANYA dipanggil saat `isResend === false` — memanggilnya lagi saat resend akan menimpa entri pending yg sudah ada (createdAt/expiresAt/replies ke-reset), merusak cap balasan di `gate.ts`. Didokumentasikan di komentar modul.
- FUNC-1: payload `null`/`undefined` → warn ke stderr + `{type:'dropped', reason:'null payload'}`, tidak crash (dites eksplisit).

## Deviasi terdokumentasi dari kode acuan (disengaja, dijelaskan di komentar modul `inbound.ts`)
1. Callback `ai:*` sekarang JUGA di-`store.logInbound` (kode acuan hanya `mcp.notification`, tanpa persist) — supaya messages-store jadi audit-trail lengkap utk semua jalur `deliver` (text/photo/document/album/callback), bukan cuma chat teks biasa.
2. Pairing-reply adalah data yang dikembalikan (+ hook `onPairingReply` utk jalur album-flush yang async/tanpa promise caller), bukan side-effect `ctx.reply()` langsung — outbound send eksplisit di luar scope task ini.

## Concerns
- `InboundMessage` tidak membawa `reply_to` terpisah dari `quote` (kode acuan punya keduanya) — sesuai daftar field minimal di brief; bila assembly nanti butuh `reply_to` message_id murni (bukan quote text), perlu field tambahan di fase berikutnya.
- Grup (`mentionsBot`/`replyToBot`/`isInfoCommand`) tidak diwiring dari `InboundMessage` karena tidak ada di daftar field minimal brief — gate() akan selalu treat pesan sebagai tanpa-mention utk grup lewat pipeline ini. Test wajib brief hanya mencakup DM/album/callback, jadi tidak jadi blocker, tapi perlu diperhatikan saat assembly menyambungkan grup.
- Konflik file jinak: `src/index.ts` diedit bersamaan oleh task C5 (paralel) yang menambah `export * from "./outbound"` — sudah dicek, tidak menimpa baris re-export saya.

## Fix pass 1

Reviewer flagged 3 issues in `packages/telegram-adapter/src/inbound.ts` (working tree, belum commit). Semua fixed, scope dijaga ketat ke inbound.ts + test-nya — `gate.ts`/`shared`/`outbound.ts` tidak disentuh.

1. **(Important) `isInfoCommand` tidak pernah di-set — invariant DM-only gate.ts ter-bypass.** `gate.ts` mendefinisikan `isInfoCommand` (SEC-1: /context /version dst. selalu drop di grup), tapi pipeline tidak pernah menghitungnya → selalu falsy, grup bisa lolos. Fix: tambah `isKnownInfoCommand()` (mirror 4 `bot.command(...)` yang di-gate `dmCommandGate` di kode acuan `server.ts:1011-1114` — `/start /help /context /version`, exact-match atau diikuti spasi, case-insensitive) dan panggil di ketiga call-site `gate()` (`handleSingle`, `handleCallback`, `flushAlbum`). Test baru: `/context` di grup (`requireMention:false`, sender di group allowFrom) → dropped, bukan deliver.
2. **(Minor) `isKnownMetaCommand` pakai `\b` — `/new-onboarding` ke-flag salah.** Diganti ke semantik source (`meta-commands.ts`): exact match ATAU diikuti spasi (helper `isCommandMatch`, dipakai juga oleh `isKnownInfoCommand` di atas). Test baru: `/new-onboarding` tidak lagi men-stamp `meta.note`.
3. **(Minor) `InboundMessage` kurang `replyToMessageId`.** Kode acuan menyimpan `reply_to_message.message_id` ke `reply_to` terlepas dari quote text (mis. reply ke foto tanpa caption → quote kosong tapi reply_to tetap ada). Tambah field opsional `replyToMessageId?: string`, diteruskan ke `store.logInbound({ reply_to: ... })` di jalur single-message dan album-flush. Test baru: reply ke foto tanpa teks (quote undefined, replyToMessageId ada) → `logInbound` menerima `reply_to`.

Juga update komentar modul (`inbound.ts` header) untuk mendokumentasikan bahwa `isInfoCommand` kini dihitung — closes concern #29 dari laporan pass pertama. Concern #28 (kurang field `reply_to` terpisah dari quote) juga closed oleh fix #3.

### Verifikasi
- `bun test packages/telegram-adapter/test/inbound.test.ts` → **12 pass, 0 fail** (naik dari sebelumnya karena 3 test baru).
- `bun test packages/telegram-adapter` → **159 pass, 2 fail** — 2 fail ada di `outbound.test.ts` (assertion pesan Zod error lama vs format baru), tidak terkait perubahan ini dan sedang ditangani fixer paralel (task C5/outbound). Semua test `inbound.test.ts` + `gate.test.ts` pass.
- `bunx tsc --noEmit` (project-wide) → exit 0, tanpa error.

Tidak ada commit dibuat (working tree, sesuai instruksi).
