# Fase 1 — Port Fondasi (state, bus, telegram-adapter, cc-stub) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Task porting merujuk source file lama sebagai "kode acuan" — baca file source yang dirujuk, JANGAN tulis ulang dari nol.

**Goal:** Bot uji ke-7 (workspace baru, token Telegram baru) melayani chat Telegram penuh — inbound/outbound/pairing/album/buttons — lewat harness baru; mayoritas item TG-* + BUS-* tercentang (definisi selesai Fase 1, design doc §9).

**Architecture:** `hostd` mendapat 3 kemampuan nyata: **state** (SQLite WAL tunggal, port skema messages-store + access), **bus** (envelope ber-ACK + dead-letter di SQLite, marker digenerate mesin), **telegram-adapter** (port modul grammy + test dari plugin lama, bug backlog difix saat porting). Sisi Claude Code mendapat **cc-stub** (plugin MCP tipis: proxy JSON-RPC ke hostd + channel-notification pass-through). Meta-commands (/new /switch dst) BUKAN scope fase 1 (butuh pty-holder/bot-supervisor = fase 2).

**Tech Stack:** Bun + TypeScript + `bun:sqlite` + zod + grammy ^1.21 + telegramify-markdown ^1.3.3 + `@modelcontextprotocol/sdk` ^1.0 (hanya di cc-stub).

**Spec:** `docs/2026-07-03-harness-rewrite-design.md` §4, §9-§11. Kontrak penerimaan: `docs/2026-07-02-capability-inventory/` (TG 189 + BUS 47; centang hanya setelah verified-live). Source lama: `plugins/telegram/` (0.0.36-mirza.0) + `plugins/agent-bus/` (0.0.13) di repo ini.

## Global Constraints

- TANPA Claude Agent SDK / `claude -p` dalam bentuk apa pun.
- Repo kerja: `C:\Users\Mirza\workspace\mirza-harness` (main; push segera tiap commit; trailer `Agent: bot-03` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- "Diangkut, bukan ditulis ulang": modul teruji dipindah bersama test-nya; adaptasi hanya pada import/boundary. Bug backlog DIFIX saat porting (daftar per task di bawah) — jangan port bug.
- Notifikasi channel ke CC: `meta` WAJIB `Record<string,string>` — nilai non-string men-drop seluruh notifikasi diam-diam (SCAR-056). Serialisasi manual utk album/attachment (kode acuan `plugins/telegram/server.ts:1786-1810`).
- `edit_message` DIHAPUS (§10.5 final): permukaan tool telegram = 4 tools (reply, react, download_attachment, get_message_by_id). Item TG-086..088 dicentang `DIHAPUS — design doc §10.5`; TG-065/067 disesuaikan; `logEdit` tidak diport (metadata kolom tetap).
- Windows first-class: atomic write = tmp+rename dgn retry EPERM/EBUSY (SCAR-022); fs.watch tak diandalkan (SCAR-021); chmod 0600 no-op (SCAR-024 — dokumentasikan, jangan pura-pura aman); parser env/config CRLF-safe (LOSS-5/SCAR-026).
- Validasi terpusat: SEMUA input eksternal divalidasi zod di boundary hostd (IPC server + bus enqueue + adapter inbound); konsumen internal mempercayai baris DB (keputusan atas ambiguitas inventaris #2 — konfirmasi user di gate plan ini).
- `/effort` dual-policy dipertahankan konseptual (auto-confirm dari Telegram vs blok dari jalur AI) — relevan penuh baru di fase 2, jangan hilangkan catatannya.
- Obsidian second-brain (§11.5): TIDAK diimplementasi diam-diam — sesi desain khusus bersama user (Task O, non-blocking).

## Peta dependensi (mandor-orkestrator)

```
A1 state-core ──┬─> A2 messages-store ──> C4 inbound pipeline ──┐
                ├─> A3 access-store ────> C2 gate/pairing ──────┤
                └─> B1 bus-core ──┬─────> B2 delivery-notif ────┼─> D1 cc-stub skeleton ─> D2 tools proxy ─> E1 E2E bot-07 ─> E2 centang inventaris
C1 modul murni (paralel dgn A/B; tanpa dependensi) ─────────────┘
C3 poller lifecycle (butuh A3; paralel dgn C4/C5)
C5 outbound sender (butuh A2 + C1)
Task O (Obsidian design session) — kapan saja, bersama user, tidak menahan jalur lain
```

Fan-out aman: C1 || A1 sejak awal (file disjoint). Setelah A1: A2 || A3 || B1. Commit tetap satu-per-satu (koordinasi lead; subagent paralel hanya bila file disjoint dan lead yang commit).

---

### Task A1: state-core — koneksi DB + skema final + retention

**Files:** Create `packages/hostd/src/state/db.ts`, `packages/hostd/test/state-db.test.ts`; Modify `packages/shared/src/schema.ts` (revisi draft→final utk tabel yang dipakai fase 1).

**Interfaces produced:** `openDb(path: string | ":memory:"): Database` — set `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000`, `applySchema`, jalankan `runRetention(db, policy)` (DELETE messages ber-umur > N hari, default 90; sweep bus_dead > 30 hari) — kebijakan dari tabel `kv` (INFRA-6).

**Revisi skema:** `messages` disesuaikan skema produksi lama (kode acuan `plugins/telegram/messages-store.ts:89-106`): tambah kolom `user_id`, `user_name`, `attachments` (JSON), ganti `meta`→`metadata`; FTS5 + trigger sinkronisasi insert/delete (temuan minor fase 0 #2). `channel_access` dipakai apa adanya. Kolom draft lain belum dipakai fase 1 — biarkan.

**Steps:** failing test (FK enforced: insert sessions dgn bot_id tak dikenal → throw; WAL aktif; retention menghapus baris tua; FTS ikut sinkron via trigger) → implement → pass → typecheck → commit+push.

---

### Task A2: messages-store — port + fix LOSS-4

**Files:** Create `packages/hostd/src/state/messages-store.ts`, `packages/hostd/test/messages-store.test.ts`.

**Kode acuan (PORT):** `plugins/telegram/messages-store.ts` (301 baris) + `messages-store.test.ts` — angkut logika `logInbound`/`logOutbound`/`getMessage`/`searchLike`, adaptasi: pakai `openDb` A1 (bukan buka sendiri), tabel `messages` ber-`bot_id` + `channel`.
**Fix saat porting:** LOSS-4 — TIDAK ada method `append`; siapa pun yang butuh log event session-change memakai `logOutbound({source:'system', ...})`. `logEdit` TIDAK diport (§10.5); `metadata` kolom tetap. Degradasi store-disabled = no-op tanpa mematikan delivery (SCAR-097). Tambah `searchFts(query)` di atas FTS5 (fondasi IDEA-3).
**Item inventaris:** TG-133..140 (TG-137 → `DIGANTI — logEdit dihapus, metadata tetap`).

---

### Task A3: access-store — port access.json → tabel + API

**Files:** Create `packages/hostd/src/state/access-store.ts`, `packages/hostd/test/access-store.test.ts`.

**Kode acuan (PORT):** type `Access` + mutasi pairing di `plugins/telegram/server.ts:222-420`. Simpan policy JSON per (channel,bot_id) di `channel_access`; API: `getAccess(botId)`, `setAccess(botId, access)` (zod-validated), `approvePairing(botId, userId)`, `importLegacyAccessJson(path)` (untuk migrasi/test; toleran korup → simpan `.corrupt-<ts>` semantik SCAR-078). Tidak ada fs.watch — perubahan lewat API (akar SCAR-021 hilang untuk jalur ini).

---

### Task B1: bus-core — envelope + ACK + retry + dead-letter + marker

**Files:** Create `packages/hostd/src/bus/bus.ts`, `packages/hostd/src/bus/envelope.ts` (zod, di shared? → taruh `packages/shared/src/bus.ts` agar cc-stub ikut pakai), `packages/hostd/test/bus.test.ts`.

**Interfaces produced:** `Envelope = {id, ts, from, to, kind:'prompt'|'channel-inbound'|'outbound-send', payload, hop, reply_to?}` (zod, `.strict()`); `enqueue(db, env)` idempotent by id; `claimNext(db, to)`, `ack(db, id)`, `fail(db, id, reason)` → retry backoff kolom `next_attempt_at`, pindah `bus_dead` setelah N attempt (terlihat via doctor). `composeAgentPromptMarker(from, hop, body)` — marker digenerate MESIN dengan body di-fence token unik acak (fix SEC-4; kode acuan lama `plugins/agent-bus/prompt-compose.ts`, JANGAN port kelemahan escape-nya). Validasi hop max 5 (BUS-016..032 semantik dipertahankan).
**Doctor:** komponen `bus` di doctorReport berubah dari `"stub"` → `{queued, dead, oldest_unacked_s}`.

---

### Task B2: delivery — hostd→cc-stub channel notification

**Files:** Create `packages/hostd/src/bus/delivery.ts`, test.

**Perilaku:** baris bus tujuan sesi CC di-push sebagai event JSON-RPC `channel.deliver` ke koneksi IPC cc-stub yang terdaftar (`session.register` saat stub connect). Payload = `{content: string, meta: Record<string,string>}` — validasi zod menolak meta non-string SEBELUM kirim (SCAR-056 jadi error terlihat, bukan drop senyap). ACK bus setelah stub konfirmasi notifikasi terkirim ke CC. Stub offline → antre (retry backoff), TERLIHAT di doctor.

---

### Task C1: modul murni telegram — port utuh + test

**Files:** Create di `packages/telegram-adapter/src/`: `album-buffer.ts`, `buttons.ts`, `markdown.ts`, `paginated-picker.ts`, `chunk.ts`; test masing-masing di `packages/telegram-adapter/test/`.

**Kode acuan (PORT 1:1 + test):** `plugins/telegram/{album-buffer,buttons,markdown,paginated-picker}.ts` + test-nya. `chunk.ts` = EKSTRAK dari `plugins/telegram/server.ts:477-496` + blok chunk-planning ~702-800 jadi modul mandiri (baru — perlu test baru: SCAR-046 hard-cap 4096 + batas paragraf; SCAR-047 chunk RAW dulu margin limit/2 baru convert per-chunk; SCAR-048 fallback plain-text; SCAR-049 markdown vs markdownv2 passthrough).
**Fix saat porting:** FUNC-2 di `markdown.ts` — pre-process tabel Markdown (konversi ke code-block) sebelum `telegramify-markdown` agar tidak gagal senyap; test dgn tabel GFM nyata.
**Item:** TG-091..124 subset album; SCAR-052 (shortId callback 64-byte) ikut `buttons.ts`/picker.

---

### Task C2: gate/pairing — port + fix SEC-1/SEC-2

**Files:** Create `packages/telegram-adapter/src/gate.ts`, test.

**Kode acuan (PORT):** `gate()` + pairing flow `plugins/telegram/server.ts:209-420` — sumber policy dari `access-store` (A3), bukan file.
**Fix saat porting:** SEC-1 — `/context`/`/version`-class commands ikut cek `allowFrom` pada dmPolicy pairing; SEC-2 — meta-command & permission-reply hanya dari `chat.type==='private' && allowFrom` (relevan penuh fase 2, gate-nya disiapkan sekarang). Test: stranger di dmPolicy pairing tidak bocor info; member grup non-allowlist tidak bisa memicu apa pun.
**Item:** TG-091..IDN gate subset, TG-171..174.

---

### Task C3: poller lifecycle — grammy per token, supervised

**Files:** Create `packages/telegram-adapter/src/poller.ts`, `packages/hostd/src/adapters/telegram.ts` (pemasangan N poller dalam hostd), test (mock grammy).

**Kode acuan:** boot/retry/shutdown `plugins/telegram/server.ts:99-206, 2141-2195`.
**Fix saat porting:** LOSS-6 — 8× 409 Conflict → `poller.stop()` + lapor status `dead:conflict` ke supervisor (doctor merah), BUKAN zombie; SCAR-061 — pasang `bot.catch` agar throw handler tidak mematikan polling; SCAR-050 — satu poller per token (hostd = satu-satunya konsumen getUpdates; pid-file takeover TIDAK diport — supervisi proses tunggal menggantikannya, catat di inventaris `DIGANTI`); LOSS-5 — token dibaca dari config hostd dgn parser CRLF-safe + trim.
**Config:** `hostd.config.json` (path via env `MIRZA_HOSTD_CONFIG`) `{bots: [{id, telegram_token, workspace}]}` — zod, contoh file `hostd.config.example.json` di repo, file asli di-gitignore.

---

### Task C4: inbound pipeline — gate→media/album→store→bus

**Files:** Create `packages/telegram-adapter/src/inbound.ts`, test.

**Kode acuan (PORT):** `handleInbound` + handler media/album/quote `plugins/telegram/server.ts:1473-1950` — output BUKAN notifikasi MCP langsung, melainkan `enqueue` bus `kind:'channel-inbound'` dgn payload content+meta string-only (serialisasi album per kode acuan L1786-1810; SCAR-055 sort by message_id, quote item pertama). Simpan ke messages-store (source `user`). Callback `ai:*` buttons → inbound `[button tapped: …]` (kode acuan L1333-1397). FUNC-1 guard `payload:null` diterapkan pada pembaca status apa pun yang diport.
**Belum di fase 1:** intercept meta-commands & permission-reply (fase 2) — pesan `/new` dll diteruskan apa adanya ke AI dgn catatan (stub).
**Item:** TG-091..132 mayoritas.

---

### Task C5: outbound sender — reply/react/download/get_message

**Files:** Create `packages/telegram-adapter/src/outbound.ts`, test.

**Kode acuan (PORT):** handler tools `plugins/telegram/server.ts:695-901` — dipicu dari bus `kind:'outbound-send'` (bukan MCP handler langsung): `reply` (chunking C1 + MV2 fallback + buttons + files, mutual-exclusion SCAR-062, anti-exfil `assertSendable` L255-265), `react` (whitelist SCAR-053), `download_attachment` (inbox path, limit SCAR-054), `get_message_by_id` (baca messages-store). Log outbound ke store. `edit_message` TIDAK diport.
**Item:** TG-065..090 minus 086..088 (DIHAPUS).

---

### Task D1: cc-stub — plugin skeleton + IPC client + notification pass-through

**Files:** Create di `packages/cc-stub/`: `.claude-plugin/plugin.json`, `.mcp.json`, `src/server.ts` (MCP stdio), `src/ipc-client.ts` (named-pipe client + reconnect), test.

**Kode acuan:** pola deklarasi `plugins/telegram/{.claude-plugin/plugin.json,.mcp.json}`; capability `experimental:{'claude/channel':{}}` + emisi `notifications/claude/channel` (kode acuan `server.ts:502-531, 1924-1950`).
**Perilaku:** connect ke `\\.\pipe\mirza-hostd`, `session.register {bot_id}`; event `channel.deliver` dari hostd → emit notifikasi channel ke CC (meta sudah tervalidasi string-only di hostd); putus pipe → reconnect backoff + tanda di tool error ("hostd unreachable").

---

### Task D2: cc-stub — tools proxy (telegram 4 + bus 3)

**Files:** Modify `packages/cc-stub/src/server.ts` (+ `src/tools.ts`), test.

**Perilaku:** 7 tool MCP dgn skema input identik permukaan lama (kode acuan skema `plugins/telegram/server.ts:572-654` utk reply/react/download_attachment/get_message_by_id; `plugins/agent-bus/server.ts:56-108` utk agent_list/agent_status/agent_send) → semua handler = satu jalur `rpc(method, params)` ke hostd; hostd yang validasi + eksekusi (agent_status membaca tabel `sessions`/`bots` — INFRA-5 selesai struktural; agent_send → bus ber-ACK, hasil delivery jujur, perbaikan SCAR-071). Skema tool digenerate dari satu sumber zod di `shared` (prinsip §2.4).
**Item:** BUS-001..032 permukaan; TG-065..090 permukaan.

---

### Task E1: E2E bot uji ke-7

**Files:** Create `packages/hostd/test/e2e-bot7.md` (runbook manual) — bukan kode baru; konfigurasi + eksekusi.

**Steps:** minta token bot baru ke user (SAAT task ini mulai — sesuai keputusan §10.4) → `hostd.config.json` entry bot-07 → jalankan hostd + CC di workspace uji dgn cc-stub ter-install → uji live: pairing (kode + approve), DM text bolak-balik, album 3 foto, buttons tap, file besar >50MB ditolak rapi, `agent_send` bot-03→bot-07 (bus baru), doctor hijau. Bukti = transkrip chat + output doctor, lampirkan ke laporan.

---

### Task E2: centang inventaris + laporan fase

**Files:** Modify `docs/2026-07-02-capability-inventory/{telegram,agent-bus}.md` (repo mirza-marketplace).

**Steps:** centang HANYA item verified-live di E1 (aturan README inventaris); `DIHAPUS/DIGANTI` dengan rujukan (TG-086..088 §10.5; pid-takeover → supervisi; dst per task di atas); item yang menunggu fase 2 dibiarkan kosong; commit+push; laporan ringkas ke user.

---

### Task O (paralel, bersama user): sesi desain Obsidian second-brain

Bukan koding. Susun bersama user (§11.5): kapan bot baca vault sebelum kerja, kapan/format setor pelajaran, kaitan dgn playbook-split. Output: design note di docs/ untuk diimplementasi setelah disepakati. Gaya teach-me + inline buttons.

---

## Keputusan desain yang diangkat ke user di gate plan ini

1. **Titik validasi tunggal** (ambiguitas inventaris #2) — rekomendasi: zod di boundary hostd (IPC+bus+inbound); internal percaya DB.
2. **Penyimpanan token bot** — rekomendasi: `hostd.config.json` di luar git (env `MIRZA_HOSTD_CONFIG`), parser CRLF-safe; bukan `.env` per-bot tersebar.
3. **TG-137 logEdit** — rekomendasi: tidak diport (ikut §10.5), kolom metadata dipertahankan.
4. **pid-file takeover poller** — rekomendasi: `DIGANTI` oleh supervisi hostd (satu proses per mesin).
Sisanya (ACK bus, INFRA-5, marker SEC-4) sudah diputuskan design doc — tinggal eksekusi.
