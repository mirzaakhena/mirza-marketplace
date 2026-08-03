### Task D1 — cc-stub skeleton + IPC client + channel-notification pass-through + protokol confirm — LAPORAN IMPLEMENTASI

**Status:** DONE

**File baru (packages/cc-stub/):**
- `.claude-plugin/plugin.json`, `.mcp.json` — pola deklarasi persis plugin telegram (`bun run --cwd ${CLAUDE_PLUGIN_ROOT} start`).
- `package.json` — tambah deps `@mirza-harness/shared: workspace:*`, `@modelcontextprotocol/sdk: ^1.0.0`, script `start`. `bun install` sudah dijalankan sekali dari root (bun.lock ter-update, 178 packages).
- `src/ipc-client.ts` — `connectHostd({pipeName, botId, onEvent, onStatus})`: net.connect named pipe, NDJSON via `parseRpcMessage`, `session.register {bot_id}` di setiap (re-)connect, `call(method, params)` request/response ber-id (Map korelasi, timeout 10s), reconnect backoff 1s×2 cap 30s + re-register otomatis, `close()` rapi (reject semua pending, hentikan reconnect loop). `call()` reject dgn pesan persis `"hostd unreachable"` bila tak ada koneksi aktif (sesuai brief, utk ditandai sbg tool error di fase tool D2).
- `src/server.ts` — MCP stdio `mirza-stub`, capability `experimental: {'claude/channel': {}}` + instructions. `makeChannelDeliverHandler`/`makeEventRouter` diekspor terpisah dari wiring stdio (`import.meta.main` guard) supaya bisa diuji tanpa proses stdio/hostd sungguhan. Alur: event `channel.deliver {envelope_id, content, meta}` → validasi (skema shared) → `mcp.notification({method:'notifications/claude/channel', params:{content, meta}})` → **baru setelah itu** `call('channel.confirm', {envelope_id})`. Tak ada business logic; meta diteruskan apa adanya (tak diubah). Tools MCP belum ada (D2).
- `test/ipc-client.test.ts` — pipe test nyata (`net.createServer`): register terkirim, event diteruskan apa adanya, call roundtrip (sukses & RpcFailure), reject "hostd unreachable" tanpa koneksi, reconnect penuh setelah server mati+hidup lagi di pipe sama → re-register (perlu teardown eksplisit socket yang sudah accepted, karena `Server.close()` saja tidak memutus koneksi existing).
- `test/server.test.ts` — unit test `makeChannelDeliverHandler`/`makeEventRouter` dgn mock `McpNotifier`: emisi notification + meta pass-through, payload invalid → `onError` (notification/confirm tak terpanggil), confirm gagal → `onError` tapi notification tetap sudah terkirim, hanya `channel.deliver` yang memicu handler.

**File baru (packages/shared/):**
- `src/channel.ts` — `ChannelDeliverEvent` (`envelope_id`, `content`, `meta: Record<string,string>`, `.strict()`) dan `ChannelConfirmParams` (`envelope_id`, `.strict()`) — skema boundary dipakai BERSAMA oleh hostd (push params, handler confirm) dan cc-stub (parse event masuk, bentuk call), konsisten prinsip "zod di boundary, sumber satu tempat di shared".
- `src/index.ts` — tambah `export * from "./channel"`.

**Protokol confirm — perubahan hostd (follow-up wajib dari review B2):**
- `packages/hostd/src/bus/delivery.ts`:
  - `channel.deliver` yang di-push kini menyertakan `envelope_id` (`ChannelDeliverEvent.parse({envelope_id: env.id, content, meta})`).
  - Push sukses **tidak lagi** langsung `ack()`. Envelope ditandai in-flight (`markInFlight`): (a) `next_attempt_at` didorong ke depan (guard, TIDAK meng-increment `attempts` — bukan kegagalan) supaya `claimNext` tak mengklaim ulang baris yang sama selagi menunggu confirm, (b) timer `confirmTimeoutMs` (opsi baru di `DeliveryOptions`, default 15000ms, injectable) — bila `channel.confirm` tak datang dlm waktu itu → `fail()` (retry/backoff normal, konsisten kegagalan-harus-terlihat).
  - `confirmDelivery(db, envelopeId)` (export baru) — dipanggil dari delegate hostd/server.ts saat `channel.confirm` diterima: batalkan timer, hapus entry in-flight, baru `ack()`. Idempotent (`false` bila envelope_id tak dikenal/telat).
  - Registry in-flight di-key **per instance `Database`** (`WeakMap<Database, Map<envelopeId, entry>>`), bukan satu peta global — supaya test dgn banyak db `":memory:"` terpisah tak saling mengganggu.
  - Bug yang ditemukan & diperbaiki selama TDD: `next_attempt_at` bus_queue bergranularitas DETIK; membulatkan-ke-bawah dari `confirmTimeoutMs` sub-detik bisa menghasilkan detik yang SAMA dgn sekarang (bukan strictly masa depan) → `claimNext` mengklaim ulang envelope yang sama berulang-ulang dalam tick yang sama (double-delivery / busy-loop). Fix: bulatkan ke ATAS, minimum 1 detik ke depan (`Math.max(1, Math.ceil(timeoutMs/1000))`) — timer in-memory ms-presisi tetap terpisah dan tak terpengaruh.
  - Docstring DEVIASI DARI BRIEF di `processOne` dihapus/diganti — sekarang sesuai brief penuh (protokol confirm, bukan ack-on-write).
- `packages/hostd/src/server.ts`:
  - Handler `channel.confirm` baru: validasi params via `ChannelConfirmParams` (shared), delegasikan ke `ConfirmDelegate` yang di-inject lewat `registerConfirmHandler(delegate | null)`. Tanpa delegate ter-wiring → `throw` (jadi error RPC terlihat, bukan diam-diam "sukses") — server.ts sengaja tetap tipis, tak tahu apa-apa soal db/bus_queue.
- Test diadaptasi (ack-on-write → ack-on-confirm; semantik SCAR-056/FIFO/offline lama dipertahankan):
  - `delivery.test.ts`: test sukses & test offline-retry ditambah langkah eksplisit `confirmDelivery()` sebelum assert `acked_at`; test FIFO diperbarui menyertakan `envelope_id` di `pushed[].params`; describe baru "protokol confirm — in-flight, timeout, retry" (3 test: timeout→fail tanpa ack, confirm-sebelum-timeout→ack & timer terbatalkan, confirmDelivery envelope_id tak dikenal → false).
  - `server.test.ts`: describe baru "channel.confirm — delegasi ke delivery" (tanpa delegate → error, dgn delegate → dipanggil+result diteruskan, params invalid → error validasi).

**Verifikasi:**
- `bun install` (root) → 178 packages, lockfile ter-update — sukses, dijalankan sekali.
- `bun test` (seluruh repo) → **351 pass, 0 fail**, 785 expect() calls, 24 file test, ~5s.
- `bun run typecheck` (`tsc --noEmit`, strict) → **exit 0**, tanpa error.
- Satu baris stderr noise pra-eksisting tak terkait (`telegram-adapter: inbound dispatch failed: received null/undefined InboundMessage`) muncul di output test — diverifikasi berasal dari `packages/telegram-adapter/src/inbound.ts:567` (test defensif pra-eksisting, bukan regresi dari task ini).

**Concerns:**
1. Wiring produksi penuh (`main.ts` membuka db + `startDelivery` + `registerConfirmHandler(envelopeId => confirmDelivery(db, envelopeId))`) **belum dilakukan** — brief D1 hanya minta delivery.ts/server.ts + test-able wiring (bentuk bebas), bukan wiring `main.ts` produksi. Perlu task lanjutan sebelum daemon hostd sungguhan bisa menjalankan protokol confirm end-to-end.
2. `confirmTimeoutMs` default 15000ms belum divalidasi terhadap beban real (berapa lama cc-stub realistis butuh utk `mcp.notification()` sampai CC benar-benar menerima) — nilai ini asumsi awal, bisa perlu tuning setelah D2/observasi produksi.
3. `ipc-client.ts` tidak memvalidasi shape event `channel.deliver` sendiri (itu tanggung jawab `server.ts` via `ChannelDeliverEvent.safeParse`) — desain sengaja: ipc-client generik (tak tahu method spesifik), tapi berarti event dgn payload rusak utk method LAIN (di luar `channel.deliver`) akan diteruskan mentah ke `onEvent` tanpa validasi — aman utk fase ini krn `onEvent` di server.ts sudah filter method & validasi sebelum diproses.
4. Reconnect di `ipc-client.test.ts` butuh teardown eksplisit socket yang sudah di-accept (net.Server.close() saja tak memutus koneksi existing) — didokumentasikan di kode test, tapi ini adalah gotcha Node/Bun net API yang mudah terlewat bila skenario reconnect diuji ulang di tempat lain.
5. Repo tidak di-commit sesuai instruksi (controller yang commit) — `bun.lock` dan seluruh file di atas masih berstatus uncommitted di working tree.

## Fix pass 1 (attempt token)

**Reviewer finding (Important) — stale confirm lintas attempt:** in-flight delivery sebelumnya di-key hanya `envelope_id`; `confirm` telat dari attempt#1 (tiba post-timeout, setelah `fail()`+requeue) bisa salah meng-ack attempt#2 yang in-flight tapi belum benar-benar dikonfirmasi cc-stub. Diperbaiki dgn token per-attempt:

- `packages/shared/src/channel.ts`: `ChannelDeliverEvent` tambah field `attempt_token: z.string()` (uuid, dibuat per push); `ChannelConfirmParams` tambah `attempt_token: z.string()`. Docstring diperbarui menjelaskan alasan (bedakan attempt).
- `packages/hostd/src/bus/delivery.ts`: `attempt_token` (`crypto.randomUUID()`) dibuat di `processOne` SEBELUM push, disertakan di params `channel.deliver`, lalu diteruskan ke `markInFlight(db, botId, envelopeId, timeoutMs, attemptToken)` yang menyimpannya di `InFlightEntry.attemptToken`. `confirmDelivery(db, envelopeId, attemptToken)` sekarang butuh param ketiga: ack HANYA bila entry in-flight ada DAN token cocok; entry tak ada atau token tak cocok → `return false` (stale/telat, retry attempt lain jalan terus tanpa terganggu). Docstring `confirmDelivery`/`markInFlight` diupdate — klaim idempotensi sekarang akurat lintas-attempt, bukan hanya lintas-envelope.
- `packages/hostd/src/server.ts`: `ConfirmDelegate` sekarang `(envelopeId, attemptToken) => unknown`; handler `channel.confirm` parse `attempt_token` dari params dan meneruskannya ke delegate.
- `packages/cc-stub/src/server.ts`: `ChannelDeliverDeps.confirm` sekarang `(envelopeId, attemptToken) => Promise<unknown>`; `makeChannelDeliverHandler` mengambil `attempt_token` dari payload tervalidasi dan pass-through apa adanya ke `deps.confirm(envelope_id, attempt_token)` — tanpa logika tambahan di stub. Wiring `import.meta.main` (`client.call("channel.confirm", {envelope_id, attempt_token})`) diperbarui sesuai.
- Test baru wajib di `packages/hostd/test/delivery.test.ts` (describe "protokol confirm — in-flight, timeout, retry"): skenario repro reviewer persis — attempt#1 push → timeout (tanpa confirm) → fail+requeue → attempt#2 push (token baru, beda dari token#1) → `confirmDelivery(db, e.id, token1)` → `false`, `acked_at` TETAP `null` → `confirmDelivery(db, e.id, token2)` → `true`, `acked_at` terisi.
- Test lain yang beradaptasi (butuh token dari push terakhir via helper `attemptTokenOf(pushed[i])`): `delivery.test.ts` (test sukses, offline→retry, timeout-tanpa-confirm, confirm-sebelum-timeout, FIFO params assertion, `confirmDelivery` unknown-id kini butuh token dummy), `hostd/test/server.test.ts` (`channel.confirm` params & delegate signature butuh `attempt_token`, ditambah 1 test baru validasi `attempt_token` hilang), `cc-stub/test/server.test.ts` (semua payload `channel.deliver` di test butuh `attempt_token`, delegate `confirm` capture 2 argumen, ditambah 1 test baru "payload tanpa attempt_token").
- Docstring LIMITATIONS ditambahkan di kepala `packages/hostd/src/bus/delivery.ts`: (a) restart hostd saat in-flight menghilangkan peta/timer in-memory — pemulihan bergantung `next_attempt_at` di DB (self-healing via `claimNext` setelah waktu lewat), attempt yang hilang akibat restart tak menambah `attempts` (belum diuji test terpisah); (b) pengiriman ke CC at-least-once — notifikasi diteruskan ke CC SEBELUM confirm dikirim balik, jadi confirm gagal bisa membuat CC menerima pesan logis yang sama lebih dari sekali; idempotency di sisi consumer/tool jadi penting begitu D2 menambah tools MCP ber-efek-samping.

**Verifikasi:** `bun test` (seluruh repo) → **354 pass, 0 fail**, 800 expect() calls, 24 file, ~5s. `bun run typecheck` (`tsc --noEmit`) → **exit 0**.

Working tree TIDAK di-commit (sesuai instruksi) — semua perubahan di atas masih uncommitted, menumpuk di atas D1 yang juga belum commit.
