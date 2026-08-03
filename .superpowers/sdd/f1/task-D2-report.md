# Task D2 report — cc-stub tools proxy (7 tools) + assembly produksi hostd main.ts (Fase 1)

## Status: SELESAI

## Files

### Deliverable A — cc-stub tools
- `packages/cc-stub/src/tools.ts` (baru) — `resolveBotId()`, `listToolDefinitions()` (7 tool MCP), `buildRpcCall()` (mapping tool→method/params, tanpa validasi), `makeCallToolHandler()`.
- `packages/cc-stub/src/server.ts` — registrasi `ListToolsRequestSchema`/`CallToolRequestSchema` (`registerToolHandlers`), capability `tools: {}`, `onInfo` hook baru di `ChannelDeliverDeps` (log envelope_id — mitigasi visibility utk LIMITATIONS at-least-once), `BOT_ID` sekarang lewat `resolveBotId()` (fallback basename cwd, bukan `process.exit(1)`).
- `packages/cc-stub/test/tools.test.ts` (baru), `packages/cc-stub/test/server.test.ts` (+describe `registerToolHandlers`).

### Deliverable B — hostd rpc-handlers
- `packages/hostd/src/rpc-handlers.ts` (baru) — `handleTelegramOutbound`/`handleAgentList`/`handleAgentStatus`/`handleAgentSend`, semua zod-validated via skema di `shared/src/rpc.ts`.
- `packages/hostd/src/server.ts` — `registerRpcHandlerDeps`/`requireRpcDeps`, 4 method baru (`telegram.outbound`/`agent.list`/`agent.status`/`agent.send`) di tabel handler, `doctor` sekarang membaca `rpcDeps` bila ter-wiring, `handleLine` jadi `async` (perlu utk `telegram.outbound` yg I/O).
- `packages/hostd/src/doctor.ts` — `DoctorDeps.adapterStatuses`/`deliveryStats` (opsional, backward-compat penuh — tanpa deps, `adapters` tetap `"stub"`).
- `packages/hostd/src/bus/delivery.ts` — `DeliveryHandle.stats()` (akumulasi delivered/failed lintas tick, utk wiring doctor).
- `packages/hostd/test/rpc-handlers.test.ts`, `+server.test.ts`, `+doctor.test.ts`, `+delivery.test.ts` (baru/tambahan).

### Deliverable C — assembly main.ts
- `packages/hostd/src/main.ts` (rewrite) — `startHostd(opts)` (testable: `config`/`dbPath`/`pipeName`/`createPoller` semua injectable) merangkai loadConfig→openDb→startServer→registerConfirmHandler→per-bot (`grammy.Api`→`toOutboundApi`→`createOutboundSender`)→`startDelivery`→per-bot `createInboundPipeline` (access/store/enqueueEnv/downloadFile via reuse `sender.handle({op:'download_attachment'})`/onPending/onPairingReply lewat `api.sendMessage` mentah)→`startTelegramAdapters`→`registerRpcHandlerDeps`. `main()` (entrypoint asli) kini cuma memanggil `startHostd()` + pasang signal handler. `shutdown()` idempotent, mengembalikan `Promise<void>`.
- `packages/hostd/src/adapters/ctx-map.ts` (baru) — `mapCtxToInboundMessage(ctx)`: grammy `Context`→`InboundMessage`, menangani text/caption/photo(best-res)/document/quote(manual>reply-text>reply-caption)/media_group_id/reply_to + `ai:*` callback taps (label via `findButtonLabel`). Fix C4: `date` detik→ms (×1000); `@botname` suffix di-strip dari command leading token (unconditional, didokumentasikan sbg simplifikasi aman).
- `packages/hostd/test/main.test.ts` (baru, smoke) — 3 test: wiring penuh + doctor/agent.list/agent.status lewat pipe nyata; onInbound→bus enqueue nyata (sender di-allowlist dulu supaya tak memicu `Api.sendMessage` sungguhan lewat jalur pairing-reply); shutdown idempotent + pipe benar-benar tertutup. **Tidak ada polling nyata** — `createPoller` selalu di-mock.
- `packages/hostd/test/ctx-map.test.ts` (baru) — 17 test (text/photo/document/quote/album-id/reply-to/@botname-strip/callback/edge-case).

### Shared (satu sumber zod)
- `packages/shared/src/json-schema.ts` (baru) — `zodToJsonSchema()`: converter zod→JSON Schema purpose-built (bukan lib eksternal — hindari dependency baru), cukup utk string/number/boolean/literal/enum/array/union/object/optional.
- `packages/shared/src/rpc.ts` (baru) — 7 skema tool MCP (`ReplyToolInput`, dst, termasuk `ButtonsSchema` eksplisit rows-of-{label,callback_id} selaras `buttons.ts` — review-note C5) + JSON Schema turunannya + deskripsi tool (diporting verbatim dari plugin lama) + skema RPC boundary hostd (`TelegramOutboundParams`, `AgentStatusParams`, `AgentSendParams`, `AgentSendPayloadSchema` dgn cap 8KB body + hop 0..5).
- `packages/shared/src/index.ts` — `+2` export.
- `packages/shared/test/json-schema.test.ts`, `packages/shared/test/rpc.test.ts` (baru).

### Perubahan dependency
- `packages/hostd/package.json` — tambah `"grammy": "^1.21.0"` (sudah ada di workspace via telegram-adapter; hostd butuh akses langsung ke `Api` class utk sender per-bot dan `Context` type utk ctx-map.ts — bukan paket baru bagi monorepo, hanya deklarasi eksplisit + `bun install` untuk link ke `node_modules` hostd sendiri; tidak ada fetch eksternal baru).

## Verifikasi
- `bun test` (project-wide) → **442 pass, 0 fail** (949 expect() calls, 30 file test).
- `bun run typecheck` (`tsc --noEmit`, project-wide) → **exit 0**.
- Tidak ada `git add`/commit/push dijalankan.

## Ringkasan implementasi

**cc-stub (Deliverable A).** Semua 7 handler adalah proxy tipis: `buildRpcCall(toolName, args, botId)` memetakan nama tool → `{method, params}` TANPA validasi apa pun (zod hanya dipakai utk *generate* `inputSchema` JSON di `tools/list`, bukan dijalankan di stub) — 4 tool telegram digabung jadi satu method `telegram.outbound {bot_id, cmd:{op,...args}}`; `agent_list`→`agent.list` (no params); `agent_status`→`agent.status {name}`; `agent_send`→`agent.send {..args, from: botId}` (`from` SELALU identitas stub sendiri, tidak pernah diterima dari argumen AI — dites eksplisit di `rpc.test.ts` bahwa `AgentSendToolInput` menolak field `from`). Kegagalan (hostd unreachable, error validasi zod dari hostd) diteruskan sbg `{isError:true}` dgn pesan jelas menyebut nama tool.

**hostd rpc-handlers (Deliverable B).** `telegram.outbound` mendelegasikan ke `Map<bot_id, OutboundSender>` yg di-assembly di main.ts; bot_id tak dikenal → error jelas, sender tak pernah dipanggil. `agent.list`/`agent.status` membaca `config.bots` + `adapterStatuses` (poller state) + `isRegistered` (koneksi stub) — `agent.status.session` SELALU query nyata ke tabel `sessions` (bukan hardcode `null`; begitu hook SessionStart fase 2 menulis baris, field ini otomatis terisi tanpa ubahan kode, dites eksplisit dgn insert manual). `agent.send` (SCAR-071): per-target jujur `{target, queued, reason?}` — target di luar `config.bots` → `queued:false` + reason, TIDAK di-enqueue; target valid → `composeAgentPrompt` (marker anti-spoof B1) → `enqueue()` (kind `'prompt'`, payload `{content, meta:{from,hop,kind}}` — reuse delivery.ts existing, tanpa kode baru di jalur delivery).

**Idempotency LIMITATIONS (dihormati, didokumentasikan, tidak "diperbaiki").** delivery.ts's at-least-once (LIMITATIONS b, sudah ada sejak D1) kini relevan nyata: sebuah `agent.send`/channel-inbound envelope yang di-retry bisa membuat CC memproses instruksi yg sama 2x, dan bila responsnya memanggil `reply` (telegram.outbound), pesan Telegram bisa terkirim dobel. Tidak ada dedup fungsional (butuh idempotency key lintas tool-call, di luar scope D2) — mitigasi fase ini murni *visibility*: `ChannelDeliverDeps.onInfo` baru di cc-stub/server.ts log `envelope_id` setiap notifikasi berhasil diteruskan, supaya laporan "pesan dobel" bisa dikorelasikan ke envelope yang benar-benar di-retry. Didokumentasikan panjang lebar di docstring `rpc-handlers.ts` dan `server.ts`.

**Assembly main.ts (Deliverable C).** `startHostd(opts)` diekstrak dari `main()` supaya seluruh wiring (bukan cuma potongan) bisa di-smoke-test dgn `dbPath:':memory:'`, `config` inline, dan `createPoller` mock (tak pernah ada long-poll nyata di test). Per-bot: `new Api(token)` (client API murni grammy, BUKAN `Bot` — polling tetap job poller) → `toOutboundApi()` adapter (satu cast sempit utk `setMessageReaction`'s emoji literal-union grammy vs `string` di `OutboundApi`, aman krn whitelist sudah dicek runtime sebelum dipanggil) → `createOutboundSender`. Inbound: `mapCtxToInboundMessage` (ctx-map.ts, fix tanggal detik→ms + strip `@botname`) → `createInboundPipeline` per bot, `downloadFile` REUSE `sender.handle({op:'download_attachment'})` (tanpa gate allowlist — aman krn hanya dipanggil setelah `gate()` sudah approve). Pairing-reply SATU-SATUNYA jalur yg sengaja BYPASS `OutboundSender` (yg mewajibkan `assertAllowedChat` — pengirim pairing-reply, per definisi, belum allowlisted): langsung `api.sendMessage` mentah, mirror `ctx.reply()` kode acuan. `doctorReport` di-wiring penuh (`db`+`adapterStatuses`+`deliveryStats` via `DeliveryHandle.stats()` baru).

## Concerns
1. **`handleLine` di hostd/server.ts jadi `async`** (perlu krn `telegram.outbound` melakukan I/O nyata) — ini melonggarkan jaminan urutan balasan bila >1 request datang dlm satu chunk TCP dan salah satu handler async lebih lambat. Didokumentasikan di komentar; dampak dianggap dpt diterima krn satu koneksi cc-stub pada praktiknya memanggil satu tool, menunggu balasan, baru memanggil lagi (ipc-client.ts's per-id correlation sudah benar menangani out-of-order response bila toh terjadi).
2. **`ctx-map.ts`'s strip-`@botname`** unconditional (tak memverifikasi suffix cocok dgn username bot sendiri) — worst-case (grup dgn >1 bot, command diarahkan ke bot lain kebetulan berbagi nama meta-command spt `/start`) command itu ikut dijawab di sini. Trade-off sengaja diambil drpd threading `botUsername` (baru tersedia setelah `onStart` grammy) ke tiap pemanggilan; didokumentasikan sbg simplifikasi di ctx-map.ts.
3. **`grammy` ditambah ke `package.json` hostd** (bukan paket baru bagi monorepo — sudah ada via telegram-adapter — tapi deklarasi baru + `bun install` dijalankan sesuai izin brief "boleh bun install bila butuh dep baru"). `bun.lock` berubah sbg akibatnya.
4. **`botStateDir()`** (main.ts) fase-1 default `<hostd cwd>/state/<bot_id>` — bukan bagian eksplisit brief, dibutuhkan `createOutboundSender`'s `stateDir` (anti-exfil boundary + inbox download). Belum configurable per bot via `hostd.config.json`; revisit bila fase 2 butuh lokasi lain.
5. Tidak ada test yg memverifikasi `telegram.outbound` benar-benar mem-forward ke `OutboundSender` NYATA (grammy `Api` sungguhan) — hanya diuji dgn fake `OutboundSender` di `rpc-handlers.test.ts` dan dgn poller di-mock di `main.test.ts` (yg tak pernah memanggil `telegram.outbound`). Risiko: mismatch tipe antara `OutboundApi` dan grammy `Api` yg TIDAK tertangkap `tsc` (mis. runtime shape Telegram API berubah) tak akan kelihatan sampai smoke manual/produksi.

## Fix pass 1

Reviewer found two Important bugs in this Task D2 work and asked for fixes without changing any other behavior. Both fixed.

### Bug 1 — `zodToJsonSchema` had no branch for `ZodEffects`

**File:** `packages/shared/src/json-schema.ts`

`.refine()`/`.superRefine()` wrap a schema in `ZodEffects`, which fell through the dispatch chain straight to the fallback opaque-`{}` branch (nothing in the `if (schema instanceof z.Zod...)` chain matched `ZodEffects`). Added one branch, placed immediately before the fallback:

```ts
if (schema instanceof z.ZodEffects) {
  return withDescription(zodToJsonSchema(schema.innerType()), schema.description);
}
```

Same description-precedence rule as the existing `ZodOptional`/`ZodDefault` branches: the wrapper's own `.describe()` (called on the `ZodEffects` itself, i.e. after `.refine()`/`.superRefine()`) wins when present; otherwise the inner schema's own description (if any) passes through. No other branch or conversion behavior touched.

**Test file:** `packages/shared/test/json-schema.test.ts` — added: a generic `ZodEffects` case (`z.object({x:z.number()}).strict().refine(...)` → proper object schema, not `{}`), a description-precedence case (outer-only / inner-only / both-set), and two tests against the REAL production schemas imported from `packages/shared/src/rpc.ts` (`ReplyToolJsonSchema`, `AgentSendToolJsonSchema`) rather than hand-rolled substitutes.

**Correction of a prior claim in this report.** Line 27 above (and the docstring on `ButtonsSchema` in `packages/shared/src/rpc.ts`, lines 27–36) asserts the MCP surface was built "so the AI sees the real shape/constraints in `inputSchema`" for `reply`'s `buttons` field, aligned with `telegram-adapter/src/buttons.ts`. **This was not true as shipped.** `ButtonsSchema` is `z.array(ButtonRowSchema).min(1).max(8).superRefine(...).describe(...)` — the `.superRefine()` call wraps the whole thing in `ZodEffects`, which (per Bug 1) degraded to opaque `{}` in the generated `inputSchema`. Concretely, before this fix pass:
- `ReplyToolJsonSchema.properties.buttons` was `{}` (no `type`, no `items`, no nested `label`/`callback_id` — the AI calling the `reply` tool saw no shape at all for `buttons`).
- `AgentSendToolJsonSchema.properties.payload.properties.body` was `{}` (no `type: "string"` — `body` is `z.string().refine(...).describe(...)`, and the `.refine()` wraps it in `ZodEffects` the same way).

After this fix pass, both are correct:
- `ReplyToolJsonSchema.properties.buttons` → `{ type: "array", items: { type: "array", items: { type: "object", properties: { label: {...}, callback_id: {...} }, required: [...] } }, description: "..." }` — i.e. `properties.buttons.items.items.properties.label` and `properties.buttons.items.items.properties.callback_id` now exist, verified by test.
- `AgentSendToolJsonSchema.properties.payload.properties.body` → `{ type: "string", description: "The natural-language instruction (max 8 KB)." }` — verified by test.

### Bug 2 — `shutdown()` in hostd could hang forever on a still-connected cc-stub client

**Files:** `packages/hostd/src/main.ts`, `packages/hostd/src/server.ts`

`server.close()` alone only fires its callback once every open connection ends on its own; a cc-stub client that stays connected (never calls `.end()`) hung `shutdown()` forever, so `process.exit()` in `main()`'s `SIGINT`/`SIGTERM` handlers was never reached.

Checked availability first: Bun's `net.Server` (the actual runtime here, confirmed via `bun -e`) does **not** implement Node's newer `closeAllConnections()` — `'closeAllConnections' in server` is `false`. `shutdown()` still calls it defensively via optional chaining (`(server as {closeAllConnections?: () => void}).closeAllConnections?.()`) for portability, but the real fix is:
1. `server.ts` — added `destroyAllConnections()`, a small exported helper that iterates the existing `connections` Map (bot_id → registered cc-stub socket, already tracked there since Task D2's `session.register` handler) and calls `.destroy()` on each. `server.ts` stays thin — this is the only addition.
2. `main.ts`'s `shutdown()` — calls `destroyAllConnections()` before `server.close()`, and races `server.close()`'s completion against a new `SHUTDOWN_CLOSE_TIMEOUT_MS = 3000` fallback timeout via `Promise.race`, so `shutdown()` (and therefore `process.exit`) always resolves within 3s even if some other, untracked socket unexpectedly stays open.

No other shutdown behavior changed (order of `delivery.stop()` → `adapters.stopAll()` → unregistering delegates → closing db is untouched; only the server-close step gained the destroy-first + timeout-race).

**Test file:** `packages/hostd/test/main.test.ts` — added a test that boots `startHostd` (same in-process harness the existing smoke tests use), connects a raw `net.connect(pipe)` client and performs the real `session.register` handshake (same wire shape as `packages/hostd/test/server.test.ts`'s registration test), deliberately never calls `.end()` on it, then calls `handle.shutdown()` and asserts (a) it resolves in under 3000ms (measured with `Date.now()`, plus an outer `Promise.race` against a 3s rejection as a test-level guard against a true hang) and (b) the client-side socket's `close` event fires (confirming hostd actually destroyed it, not just abandoned it).

### Test results
- `bun test` (repo-wide, from `C:\Users\Mirza\workspace\mirza-harness`): **447 pass, 0 fail** (963 expect() calls, 30 files).
- `bun run typecheck` (`tsc --noEmit`, repo-wide): **exit 0**.
- No `git add`/`commit`/`push` run — working tree left uncommitted as instructed.

### Files changed
- `packages/shared/src/json-schema.ts`
- `packages/shared/test/json-schema.test.ts`
- `packages/hostd/src/main.ts`
- `packages/hostd/src/server.ts`
- `packages/hostd/test/main.test.ts`

## Fix final-review (approve wiring)

**Blocker fixed:** [IMPORTANT-1] `approvePairing`/`setAccess` (`packages/hostd/src/state/access-store.ts`, already unit-tested) had no production caller — `packages/hostd/src/cli.ts` only implemented `doctor`. Users could never actually get into `allowFrom` via a product surface; the pairing flow generated codes (`addPending` in `main.ts`'s inbound pipeline) but nothing ever consumed them.

**Fix — `packages/hostd/src/cli.ts`:**
- Added `access <sub>` dispatch alongside the existing `doctor` command, guarded the whole argv-dispatch (`main()`) behind `if (import.meta.main)` (mirroring `main.ts`'s pattern) so the module is import-safe for tests.
- Extracted the actual logic into an exported `runAccessCommand(db: Database, args: string[]): { exitCode: number; output: string }` — testable without `Bun.spawnSync`. The CLI's `main()` is a thin wrapper: resolves the DB path (`MIRZA_HOSTD_DB` env or `<cwd>/hostd.db` — same `resolveDbPath()` logic as `main.ts`), opens it via the same `openDb()` (WAL + `busy_timeout=5000`, `applySchema`+`runRetention` on open — both idempotent, safe to re-run from a separate CLI process), calls `runAccessCommand`, prints `output`, closes the db, exits `exitCode`.
- Three subcommands:
  - `access approve <bot_id> <user_id>` — calls `approvePairing`, prints resulting `allowFrom`/remaining `pending` keys.
  - `access show <bot_id>` — prints `getAccess(db, botId)` as pretty JSON (verification aid for E1).
  - `access allow <bot_id> <user_id>` — emergency path: reads current access, pushes `userId` into `allowFrom` if absent, `setAccess`s it back (bypasses the pairing-code flow entirely).
  - Missing `bot_id`/`user_id`, or an unrecognized `access` subcommand, returns `exitCode: 2` with a usage message (`USAGE` constant, also shown for the bare unrecognized top-level command, matching the pre-existing `doctor`-only usage-error behavior).

**Test — `packages/hostd/test/cli-access.test.ts` (new):** calls `runAccessCommand` directly against `openDb(":memory:")` (no spawn). Covers: `approve` moves pending→allowFrom and clears the matching pending entry; missing `bot_id`/`user_id` on `approve` → exit 2; `allow` adds directly and is idempotent on repeat; missing args on `allow` → exit 2; `show` prints JSON matching `getAccess` both for a fresh (default) access row and after an approve; missing `bot_id` on `show` → exit 2; unrecognized subcommand → exit 2 with usage text.

**Fresh-per-message read — verified, not assumed:** `main.ts` wires both the inbound pipeline and the outbound sender with `access: () => getAccess(db, botId, "telegram")` — a closure that re-queries the `channel_access` table on every invocation, not a value captured once at startup. So a write committed by the CLI (separate process, same DB file, same `openDb` pragmas) is visible to the running hostd process on the very next message it handles — no restart required. This is the explicit answer to the review's "PENTING" wiring question below.

**Runbook — `packages/hostd/E1-RUNBOOK.md` (new):** operational steps for the live E1 test: boot hostd against bot-07 config with an explicit `MIRZA_HOSTD_DB`, boot cc-stub in the test workspace, DM the bot to get a pairing code (or read it via `cli.ts access show`), approve via `cli.ts access approve bot-07 <user_id>` (plus the `access allow` emergency shortcut), verify DM/album/buttons/agent_send delivery without restarting hostd, and how to read `doctor` correctly — explicitly calls out that `ok` is hardcoded `true` (documented limitation, not a new bug) and that the real signal is `components.adapters` (must be `{bot_id: "running"}`, not the string `"stub"`) and `components.bus` (must be JSON stats, not `"stub"`).

### Test results
- `bun test` (repo-wide, from `C:\Users\Mirza\workspace\mirza-harness`): **457 pass, 0 fail** (981 expect() calls, 31 files).
- `bun run typecheck` (`tsc --noEmit`, repo-wide): **exit 0**.
- No `git add`/`commit`/`push` run — working tree left uncommitted as instructed.

### Files changed
- `packages/hostd/src/cli.ts` (modified — added `access` subcommands + exported `runAccessCommand`, guarded entrypoint with `import.meta.main`)
- `packages/hostd/test/cli-access.test.ts` (new)
- `packages/hostd/E1-RUNBOOK.md` (new)

### Explicit answer: does hostd read access fresh per-message from the DB?

**Yes.** `main.ts` passes `access: () => getAccess(db, botId, "telegram")` as a closure to both `createInboundPipeline` and `createOutboundSender`, and `getAccess` (`access-store.ts`) does a live `SELECT policy FROM channel_access WHERE channel = ? AND bot_id = ?` on every call — there is no in-memory cache/snapshot anywhere in this path. A CLI-side `approvePairing`/`setAccess` write (same DB file, same `openDb` WAL pragmas) is therefore picked up by the already-running hostd process on the next message it handles, with no restart needed.
