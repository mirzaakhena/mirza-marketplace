## Fix E1-1: answerCallbackQuery

**Repo:** `mirza-harness` (fix applied on top of HEAD `1b4c1ea`; `.superpowers/*` left untouched)

**Root cause:** `packages/hostd/src/main.ts`'s `startTelegramAdapters({ onInbound })` awaited
`pipeline(msg)` (the pure `createInboundPipeline` from `telegram-adapter`) and discarded the
returned `InboundOutcome` — never called grammy's `ctx.answerCallbackQuery(...)`. The callback
tap reached the pipeline/gate correctly (deliver vs drop), but Telegram never got an ack, so the
tapped button's spinner in the app never stopped. `telegram-adapter`'s pipeline is deliberately
grammy-free (inbound.ts: "Deliberately NOT grammy" — never touches a `Context`/`Api`), so acking
had to live in the wiring layer, not the pipeline.

**Fix (smallest form — no new callback/interface added):** `main.ts`'s `onInbound` already
receives the `InboundOutcome` back from `await pipeline(msg)`. Added a small `ackCallback(ctx,
outcome)` helper called only `if (msg.callback)`:
- `outcome.type === "delivered"` → `ctx.answerCallbackQuery(undefined)` (empty ack, clears spinner,
  no toast).
- any other outcome (`"dropped"`, `"pairing-reply"`) → `ctx.answerCallbackQuery({ text: "Not
  authorized." })`, mirroring kode acuan's ported behavior (`plugins/telegram/server.ts:1277,
  1338,1381,1403,1409` — always ack, empty/text depending on authorization).
- Wrapped in `try/catch` (not `.catch(()=>{})` since it's `await`ed for sequencing with the
  pipeline call) — logs to stderr, never rethrows, so an expired callback query (~15s TTL) can't
  crash the inbound pipeline.

**Files changed:**
- `C:/Users/Mirza/workspace/mirza-harness/packages/hostd/src/main.ts` — added `ackCallback` helper
  + import of `Context`/`InboundOutcome`; `onInbound` now calls it when `msg.callback` is present.
- `C:/Users/Mirza/workspace/mirza-harness/packages/hostd/test/main.test.ts` — 3 new tests using the
  existing `fakeCreatePoller`/fake-`ctx` smoke-test pattern:
  1. authorized `ai:*` tap → `answerCallbackQuery` called once with `undefined` (no text).
  2. unauthorized tap (`allowFrom: []`, `dmPolicy: "allowlist"`) → called with
     `{ text: "Not authorized." }`.
  3. `answerCallbackQuery` throwing (simulated expired query) → `onInbound` promise still resolves
     (doesn't reject/throw), pipeline's bus enqueue still completed.

**Tests:** `bun test` → 460 pass, 0 fail (986 expect() calls), across 31 files. `bun run
typecheck` (`tsc --noEmit`) → exit 0.

**Note on restart:** hostd has no hot-reload — the fix only takes effect once the hostd process
is restarted (kill + relaunch, or supervisor restart). Confirmed: no file-watch/reload mechanism
exists in `main.ts`/`server.ts`; a running hostd process keeps the old `onInbound` closure in
memory until it exits.

## Bukti E1 — hasil uji live (2026-07-04, bot-07 @mirza_botseven_bot)

Semua lewat harness baru (hostd pid 32008 + receiver jalur produksi cc-stub ipc-client+handler):
1. PAIRING: DM pertama unpaired → gate tahan → pairing-reply kode 95124d terkirim → `cli.ts access approve bot-07 1121398977` → allowFrom terisi, pending bersih, TANPA restart hostd. (fix blocker final-review terbukti)
2. DM INBOUND E2E: "Tes deliver" → poller→ctx-map→gate→messages-store→bus→delivery→channel.deliver→receiver, MCP notification meta string-only, confirm attempt-token → ack. doctor delivered naik, failed 0.
3. OUTBOUND reply: RPC telegram.outbound → OutboundSender → grammy → pesan+buttons sampai (sent id 5, 6).
4. BUTTONS/CALLBACK: 6 tap total masuk dgn callback_id/button_label/source_message_id. TEMUAN #1: answerCallbackQuery tidak diport (spinner tak berhenti) → FIXED live (commit 4a04574), tap pasca-fix spinner berhenti.
5. ALBUM (SCAR-055/056): 3 foto + caption "ini 3 gambar" → SATU envelope; meta: media_group_id, message_ids "7,8,9", image_paths newline-joined; 3 file terunduh ke state/bot-07/inbox (33KB/117KB/242KB). getMessage menyimpan attachments+metadata benar.
6. AGENT_SEND/BUS: agent.send bot-07→bot-07 → queued:true jujur → delivered sbg notifikasi ber-fence marker mesin `[agent-bus from=bot-07 hop=0 id=<uuid>]...[/agent-bus id=<uuid>]` (SEC-4), meta {from, hop, kind:agent-prompt} string-only.
7. REACT: op react 👍 ke message 7 → "reacted", terlihat di Telegram.
8. GET_MESSAGE_BY_ID: row lengkap (body, user, attachments 3 foto, metadata album).
9. RESILIENSI (insidental): hostd di-kill/restart 2x → Telegram mengantre update (tidak ada pesan hilang); receiver reconnect+re-register otomatis; CLI approve efektif tanpa restart (access dibaca fresh per pesan).

BELUM verified-live: op download_attachment sbg TOOL (jalur unduh yang sama sudah ter-exercise via album inbound); group chat flow; agent_send lintas-bot beda mesin fisik proses (diuji self-send bot-07→bot-07). Doctor akhir: delivered 7+, failed 0, dead 0.
