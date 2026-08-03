# Task E1' Assembly — report

## STATUS: SELESAI

## Ringkasan test

- `bun test packages/hostd` → **358 pass, 0 fail** (853→857 expect() calls; 5 test baru ditambahkan ke `main.test.ts`).
- `bun test` (seluruh repo) → **847 pass, 0 fail**.
- `bun run typecheck` → **exit 0**, tanpa error.
- Tidak ada `git add`/`commit`/`push`/`bun install` dijalankan. `.superpowers/state/e1-*` tidak disentuh.

Test baru (semua di `packages/hostd/test/main.test.ts`, describe block baru
"Task E1' assembly"), pakai `fakeSpawnHolder` (sudah ada) + dua seam baru
(`createApi`, `sessionOps`) — **tidak ada spawn Node holder nyata maupun HTTP
call nyata ke Telegram**:

1. `/new foo` (sender allowlisted) → `SessionOps.clearSession` terpanggil via
   metaCommands adaptor dengan `{bot:{id:'bot-smoke',workspace:...}, opts:{name:'foo'}}`;
   tidak ada envelope masuk bus (tidak diteruskan ke AI); balasan
   `meta-executed` terkirim lewat raw `Api.sendMessage`.
2. `/context` (sender allowlisted) → `buildContextReply` jalan (baca tabel
   `sessions` yang kosong, render fallback `"(no data yet)"`), terkirim lewat
   `OutboundSender`, tidak diteruskan ke AI.
3. `/context` (sender BUKAN allowlisted, dmPolicy allowlist) → di-drop oleh
   `gate()` (SEC-1), tidak ada balasan sama sekali, tidak diteruskan ke AI.
4. `meta:cancel` callback tap (authorized) → `ctx.answerCallbackQuery({text:'Cancelled'})`
   — BUKAN `{text:'Not authorized.'}`.
5. `ai:yes` callback tap TIDAK authorized (regresi-guard) → tetap
   `{text:'Not authorized.'}` seperti semula.

## Concerns

- **Meta output routing sengaja bypass `OutboundSender`.** `MetaCommandButton.callbackData`
  membawa string `meta:...` utuh; `OutboundSender.reply`'s buttons SELALU
  di-prefix ulang `ai:` oleh `buildKeyboard` (telegram-adapter/buttons.ts) —
  kalau dipaksa lewat situ, callback routing `meta:` rusak. Jadi meta-command
  reply / meta-callback edit-reply dikirim lewat `Api` grammy mentah (pola
  yang sama seperti pairing-reply yang sudah ada). Ini didokumentasikan
  panjang di komentar main.ts; kalau nanti mau audit-trail otomatis
  (`messages-store.logOutbound`) untuk pesan meta, itu perlu ditambahkan
  eksplisit (saat ini TIDAK ter-log, beda dari `OutboundSender.reply` yang
  logging otomatis).
- **`stop.check` RPC tidak ada** — sudah dicek: H2 (`packages/cc-stub/hooks/reply-guard.ts`)
  SENGAJA menghitung keputusan Stop secara lokal dari transcript, bukan lewat
  RPC hostd (didokumentasikan eksplisit di file itu sebagai keputusan desain,
  dengan alasan testability + tidak nambah RPC round-trip saat proses mungkin
  sedang teardown). Tidak ada yang perlu di-wire untuk item ini.
- **`telemetry.report`/`session.started`/`supervisors`** sudah full-wired
  sebelum task ini (H1 sudah taruh `supervisors: supervisors.supervisors` di
  `registerRpcHandlerDeps`, dan kedua RPC method itu sudah terdaftar di
  `server.ts`'s handler table, dipenuhi lewat `db`/`config` yang sudah ada di
  `RpcHandlerDeps`). Tidak ada perubahan diperlukan — hanya diverifikasi.
- **`hostd.config` claude_bin/claude_args/workspace** sudah terbaca lengkap
  sebelum task ini (`config.ts`'s zod schema + `supervisor.ts`'s
  `spawnRealHolder` sudah pakai `bot.claude_bin`/`bot.claude_args`/`bot.workspace`).
  Tidak ada perubahan diperlukan — hanya diverifikasi.
- Dua test seam baru (`createApi`, `sessionOps` di `StartHostdOptions`)
  ditambahkan HANYA untuk testability produksi tetap pakai default real
  (`new Api(bot.telegram_token)`, `createSessionOps({db, supervisors...})`)
  — tidak mengubah perilaku produksi.
- `/context` dan `/version` di-intercept di `main.ts` dengan menjalankan
  `gate()` SENDIRI (import dari telegram-adapter) sebelum pipeline, karena
  `inbound.ts` tidak boleh diubah dan tidak punya hook "jawab langsung,
  jangan teruskan ke AI" untuk info-command. Bila hasil gate BUKAN `deliver`,
  kode jatuh ke `pipeline(msg)` normal yang menghitung ulang `gate()` yang
  identik (fungsi murni, deterministik) — tidak ada duplikasi efek samping.

## Daftar persis yang di-wire (untuk runbook E1')

**File diubah:**
- `packages/hostd/src/main.ts` (satu-satunya file wiring yang diubah)
- `packages/hostd/test/main.test.ts` (5 test baru + 2 test helper: `fakeApi`, `fakeSessionOps`)

**File baru:**
- `packages/hostd/src/supervisor/session-ops-client.ts` — adaptor tipis
  `createSessionOpsClient(ops: SessionOps): SessionOpsClient` (Promise-wrap
  setiap method S2's `SessionOps` supaya cocok dgn M1's `SessionOpsClient`
  interface; `bot: {id, workspace}` sudah structurally sama, tidak perlu
  dikonversi).

**Wiring di `main.ts`:**

1. **Urutan konstruksi diubah**: `startSupervisors(...)` sekarang dibangun
   SEBELUM `pipelines` (sebelumnya sesudah `adapters`) — karena session-ops
   butuh `supervisors.supervisors` (Map<string,BotSupervisor>, structurally
   cocok dgn `SessionOpsSupervisor`), dan pipelines butuh session-ops-client.
2. **`createSessionOps({db, supervisors: supervisors.supervisors})`** (satu
   instance untuk seluruh proses) → **`createSessionOpsClient(sessionOps)`**
   → di-suntik ke tiap bot's `createInboundPipeline({..., metaCommands: {bot:
   {id, workspace}, client: sessionOpsClient}})`. Test-injectable via
   `StartHostdOptions.sessionOps`.
3. **`SessionQuery`**: `createDbSessionQuery(db)` (baru, di main.ts) — query
   SQL identik dgn `handleAgentStatus` (rpc-handlers.ts) atas tabel `sessions`
   (INFRA-5: satu baris, satu sumber, /context dan `agent.status` selalu
   sinkron).
4. **`VersionQuery`**: `createPackageJsonVersionQuery({hostdPkgJson:
   <pkg>/hostd/package.json, holderPkgJson: <pkg>/pty-holder/package.json})`
   (path resolusi via `fileURLToPath(import.meta.url)` + `dirname`, pola sama
   dgn `supervisor.ts`'s `DEFAULT_PTY_HOLDER_MAIN`).
5. **`/context` & `/version` dispatch** (`tryAnswerInfoCommand`, dipanggil di
   `onInbound` SEBELUM `pipeline(msg)`): jalankan `gate()` sendiri dgn
   `isInfoCommand:true`; hanya jawab langsung (via
   `wiring.sender.handle({op:'reply',...})`) bila `action==='deliver'`;
   selain itu jatuh ke pipeline normal (drop/pairing-reply dihitung ulang
   identik oleh pipeline sendiri).
6. **Dispatch outcome baru dari `pipeline(msg)`**:
   - `outcome.type==='meta-command'` → `dispatchMetaCommandResult` (kirim
     pesan baru via `Api.sendMessage` mentah, keyboard dibangun sendiri dari
     `MetaCommandButton.callbackData` verbatim — TANPA prefix `ai:`).
   - `outcome.type==='meta-callback'` → `dispatchMetaCallbackEffects`
     (proses `ack`/`edit`/`reply` effect berurutan, awaited; `ack` pakai
     `ctx.answerCallbackQuery` dgn teks effect sendiri; `edit` pakai
     `Api.editMessageText`; `reply` pakai `dispatchMetaCommandResult` lagi).
   - Selain itu (callback ai:* biasa) → `ackCallback(ctx, outcome)` seperti
     semula.
7. **Fix `ackCallback`** (bug reviewer, ~line 112-116 lama): ternary lama
   `outcome.type==='delivered' ? undefined : 'Not authorized.'` diganti
   `outcome.type==='dropped' ? 'Not authorized.' : undefined` — karena
   `meta-callback` sudah di-intercept & full-handled SEBELUM `ackCallback`
   dipanggil sama sekali (lihat poin 6), `ackCallback` sekarang hanya perlu
   membedakan `dropped` (unauthorized) dari sisa union (`delivered`,
   `pairing-reply`, `buffered` — semua sukses/legitimate, ack tanpa teks).
8. **`createApi`** (`StartHostdOptions`, test-injectable, default `bot => new
   Api(bot.telegram_token)`) — dipakai untuk membangun tiap bot's `api` di
   `wirings`, sehingga SEMUA path pengiriman Telegram (pairing-reply,
   meta-command/meta-callback, /context+/version) bisa diuji tanpa network
   nyata.
9. **Diverifikasi (tidak diubah)**: `telemetry.report`/`session.started` +
   `supervisors` di `registerRpcHandlerDeps` (sudah lengkap dari H1);
   `hostd.config`'s `claude_bin`/`claude_args`/`workspace` (sudah lengkap dari
   S1/config.ts); `stop.check` (memang tidak ada RPC-nya, by design H2).
