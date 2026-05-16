# Features Backlog — Telegram Plugin

Backlog fitur yang dipertimbangkan untuk diadopsi dari project `personal-ai-assistant` (`C:\Users\Mirza\workspace\personal-ai-assistant`) ke plugin telegram di marketplace ini.

> **Prinsip desain**: Setiap fitur harus **modular & standalone** — bisa diaktifkan/dimatikan tanpa merusak fitur lain. Plugin tetap berperan sebagai *channel adapter* (jembatan Telegram ↔ Claude Code), bukan AI engine. Logika AI/keputusan tetap di sisi Claude Code session.

## Status Legend

| Tag | Arti |
|-----|------|
| `[ ]` | Belum dikerjakan |
| `[~]` | Sedang dikerjakan |
| `[x]` | Selesai diimplementasi |
| `[-]` | Diputuskan untuk di-drop (lihat alasan) |

## Quick Summary

- **Tier 1 — Direct adoption (cocok untuk plugin)**: 11 fitur
- **Tier 2 — Adaptasi diperlukan**: 5 fitur
- **Tier 3 — Out of scope (better elsewhere)**: 6 fitur (sudah ditandai `[-]`)
- **Future ideas**: 5 ide tambahan

---

## Recommended Development Order (by Impact)

Berbeda dari tier (yang dasarnya kecocokan teknis), urutan ini berdasarkan **dampak ke pengalaman user**. Mode kerja: satu fitur per session, selesaikan utuh, jeda untuk review, baru lanjut.

### Worthwhile to develop (high impact)

| # | Fitur | Why this order |
|---|-------|----------------|
| 1 | **T1.11 — Raw conversation logging** | Foundation utama. Tanpa ini, recall lintas sesi mustahil. User eksplisit sebut sebagai kebutuhan inti. |
| 2 | **T1.10 — Album / media group batching** | User eksplisit sebut sebagai pain point. Tanpa ini multi-image diproses sequential, boros token & response berantakan. |
| 3 | **T1.7 — Multi-message array delivery** | Reply lebih natural (jeda antar bubble) — langsung terasa di chat UX. |
| 4 | **T1.3 — Quoted message extraction** | Tanpa ini, user reply ke pesan lama bikin Claude kehilangan konteks — friksi nyata setiap kali quote-reply. |
| 5 | **T1.5 — Realistic typing indicator** | "Feels alive". Kecil tapi langsung noticeable di chat experience. |
| 6 | **T1.2 — Document/PDF inbound** | Perluas modality (selain text+image). Pola implementasi sudah ada di photo handler. |
| 7 | **T1.1 — Voice transcription** | High value kalau user sering voice. Worth setelah ada beberapa preprocessing step (sinkronisasi dengan T2.3). |

### Nice to have (medium impact, kerjakan setelah core)

- **T1.6 — Per-user FIFO queue**: reliability silent — penting saat T1.7 sudah jalan (multi-message rentan race).
- **T1.9 — Reaction event inbound**: feedback loop non-verbal, situational.

### Defensive / polish (low priority)

- **T1.4 — Dedup cache**, **T1.8 — Pause-before-typing**, **T2.4 — MarkdownV2 escape**: kerjakan saat sempat atau saat ada bug konkret.

### Defer

- **Semua Tier 2** kecuali bagian preprocessing pipeline (T2.3) yang baru bermakna setelah 4-5 fitur Tier 1 jadi.
- Tier 3 sudah eksplisit di-drop.

### Saran titik mulai

**Mulai dari T1.11** — sekaligus paksa menyelesaikan dua decision pending (per-chat DB vs single DB, SQLite vs JSONL) yang akan jadi foundation untuk fitur observability/recall ke depan. Setelah T1.11 jadi, T1.10 logical next karena berdiri sendiri dan dampaknya langsung terasa.

---

## Tier 1 — Direct Adoption Candidates

Fitur-fitur yang langsung relevan untuk plugin channel adapter dan tidak duplikat dengan kapabilitas Claude Code.

### Inbound Message Processing

- [ ] **T1.1 — Voice transcription** untuk pesan suara/audio
- [ ] **T1.2 — Document/PDF inbound handling** (saat ini hanya text + photo)
- [ ] **T1.3 — Quoted message context extraction** (kalau user reply ke pesan lain, sertakan konteksnya)
- [ ] **T1.4 — Inbound message dedup cache** (LRU 1000-entry, hindari double-process saat polling overlap)
- [x] **T1.10 — Album / media group batching** (user kirim multiple image sekaligus → diproses sebagai 1 batch, bukan satu-satu) — implemented. Spec: `docs/superpowers/specs/2026-05-16-t110-album-batching-design.md`. Plan: `docs/superpowers/plans/2026-05-16-t110-album-batching.md`.

### Outbound Message Quality

- [ ] **T1.5 — Realistic typing indicator** (durasi typing dihitung dari panjang pesan, 30ms/char range 1-8s)
- [ ] **T1.6 — Per-user FIFO message queue** (cegah race condition saat dua pesan datang berdekatan)
- [ ] **T1.7 — Multi-message array delivery** (Claude bisa kirim 2-3 pesan terpisah dengan jeda alami, bukan satu wall of text)
- [ ] **T1.8 — Pause-before-typing** (delay diam sebelum typing indicator muncul, untuk pesan reflektif/thoughtful)
- [ ] **T1.12 — Outbound media group / album** (Claude balas dengan multiple file → kirim sebagai 1 album visual via `sendMediaGroup`, bukan N pesan terpisah)

### Reactions

- [ ] **T1.9 — Reaction event inbound** (notify Claude saat user kasih reaksi ke pesan bot, untuk feedback loop)

### Persistence & State

- [x] **T1.11 — Raw conversation logging** (catat semua percakapan user/assistant/system ke storage lokal — fondasi untuk recall lintas sesi)

---

## Tier 2 — Adaptasi Diperlukan

Fitur yang konsepnya bagus, tapi perlu dipikir ulang scope-nya agar tidak menyalahi arsitektur plugin.

- [ ] **T2.1 — Per-channel lightweight state** (persona, bahasa, timezone, nickname) sebagai opsi di `access.json` atau file terpisah. Bukan full memory store, hanya hint kontekstual yang dikirim ke Claude tiap inbound message.
- [ ] **T2.2 — Read-only monitoring dashboard** (HTTP server kecil untuk lihat status: pending pairing, recent inbounds, errors). Scope: state plugin saja, bukan user data.
- [ ] **T2.3 — Inbound preprocessing pipeline** (hook system: text → transcribe → translate → enrich, sebelum dikirim ke MCP). Foundation untuk fitur-fitur lain.
- [ ] **T2.4 — MarkdownV2 safety helper** (escape otomatis karakter spesial Telegram, hindari error format)
- [ ] **T2.5 — Group chat enhancements** (handle quoted-self, reply chain awareness, thread-aware mentions)

---

## Tier 3 — Out of Scope (Drop atau ke Tempat Lain)

Fitur yang ada di `personal-ai-assistant` tapi **tidak tepat** dimasukkan ke plugin telegram. Daftar ini eksplisit di-drop dengan alasannya, agar tidak revisit nanti.

- [-] **T3.1 — Persistent memory system** (profile, knowledge, journal, preferences, tasks, ledger). **Alasan**: Bukan tugas channel adapter. Idealnya jadi **plugin/MCP server terpisah** (mis. `personal-memory` plugin) yang bisa dipakai dari channel manapun. Mencampurnya akan bikin plugin telegram membengkak dan tidak reusable.
- [-] **T3.2 — Cronjob scheduling tools**. **Alasan**: Sudah tersedia via `/schedule` skill di superpowers + native Claude Code scheduling. Duplikat akan membingungkan user.
- [-] **T3.3 — AI engine / wake-up briefing / system prompt assembly**. **Alasan**: Itu tugas Claude Code session, bukan plugin. Plugin hanya forward message + context tag.
- [-] **T3.4 — Token & cost tracking, status bar**. **Alasan**: Sudah ada di Claude Code level (`/status`).
- [-] **T3.5 — Multi-gateway abstraction (Console/Telegram/Slack switcher)**. **Alasan**: Over-engineering untuk plugin single-channel. Kalau mau Slack, buat plugin `slack` terpisah dengan pola yang sama.
- [-] **T3.6 — Skill writing/archiving tools (`write_skill`, `archive_skill`)**. **Alasan**: Sudah built-in di Claude Code via Read/Write tools dan `superpowers:writing-skills`.

> **Catatan**: Item lama "T3.7 — Search messages history" dipindah keluar dari Tier 3. Premise drop-nya keliru (saya asumsikan source = Telegram API, padahal yang dibutuhkan user adalah storage **lokal**). Storage layer-nya kini ada di [T1.11 — Raw conversation logging](#t111--raw-conversation-logging). Mekanisme search akan dibahas terpisah saat T1.11 sudah jalan.

---

## Future Ideas (di luar personal-ai-assistant)

Ide-ide tambahan yang muncul saat eksplorasi, bukan dari project lama tapi worth dipertimbangkan.

- [ ] **F1 — Edit-tracking inbound** (notify Claude kalau user mengedit pesan yang sudah dikirim)
- [ ] **F2 — Forwarded message handling** (preserve original sender info)
- [ ] **F3 — Sticker support** (sticker → emoji name + image untuk Claude)
- [ ] **F4 — Location/contact handling** (user share location → forward sebagai metadata)
- [ ] **F5 — Long-running task progress updates** (Claude trigger interim "still working..." via `edit_message`, dengan rate-limit otomatis)

---

## Detail per Fitur (Tier 1 & Tier 2)

Section ini berisi referensi ke implementasi lama + opsi implementasi untuk plugin ini. Tidak harus dibaca semua sekaligus — buka section yang relevan saat akan implement.

### T1.1 — Voice transcription

- **Referensi old project**: Tidak ada di personal-ai-assistant (juga belum punya). Tapi pola hook di `bot.on('message:voice')` mudah ditambahkan.
- **Konteks plugin**: Saat ini `bot.on()` hanya handle `message:text` dan `message:photo` (server.ts). Voice message di-skip silently.
- **Opsi implementasi**:
  - **A**: Pakai OpenAI Whisper API (perlu API key tambahan, kualitas tinggi).
  - **B**: Pakai Claude's audio capability langsung (kirim audio sebagai attachment, biar Claude transcribe sendiri).
  - **C**: Local whisper.cpp (offline, tanpa API key, tapi setup berat).
- **Rekomendasi**: Opsi B paling sejalan dengan filosofi plugin (Claude yang handle).

### T1.2 — Document/PDF inbound handling

- **Referensi old project**: `src/utils/media.ts` — validasi MIME type, base64 encoding, max 30MB untuk PDF.
- **Konteks plugin**: `download_attachment` MCP tool sudah ada. Tinggal extend `bot.on()` untuk `message:document` dan auto-include dalam channel notification.
- **Catatan**: Photo flow (`image_path` attribute) sudah jadi template — tinggal duplikat untuk document.

### T1.3 — Quoted message context extraction

- **Referensi old project**: `src/utils/prompt.ts` — extract `reply_to_message` dan format jadi konteks XML.
- **Konteks plugin**: Saat ini quoted reply tidak diteruskan. Bisa tambahkan `reply_to_text="..."` attribute di `<channel>` tag.

### T1.4 — Inbound message dedup cache

- **Referensi old project**: `src/gateway/telegram.ts` — LRU cache 1000-entry, key = `${chatId}:${messageId}`.
- **Konteks plugin**: Bot polling bisa kadang overlap (terutama setelah restart 409 conflict). Dedup cache mencegah double-trigger MCP notification.

### T1.5 — Realistic typing indicator

- **Referensi old project**: `src/gateway/telegram.ts` — `simulateTyping(text)`: 30ms/char, clamp 1-8s.
- **Konteks plugin**: `reply` tool saat ini langsung kirim. Bisa tambah parameter optional `typing_duration_ms` atau auto-calculate dari panjang text.

### T1.6 — Per-user FIFO message queue

- **Referensi old project**: `src/utils/queue.ts` — Promise-chained per-user lock.
- **Konteks plugin**: Plugin saat ini handle async paralel. Kalau Claude kirim 3 reply cepat, bisa swap urutan. Queue per chat_id menjamin order.

### T1.7 — Multi-message array delivery

- **Referensi old project**: `src/tools/message.ts` — `send_message({messages: [text1, text2, ...]})` dengan jeda antar pesan.
- **Konteks plugin**: Update `reply` tool untuk accept `text: string | string[]`. Lebih natural untuk percakapan.

### T1.8 — Pause-before-typing

- **Referensi old project**: `src/tools/message.ts` — parameter `pauseBeforeTyping` (silence sebelum typing indicator).
- **Konteks plugin**: Useful untuk pesan reflektif. Bisa jadi opsional di `reply` tool.

### T1.9 — Reaction event inbound

- **Referensi old project**: `src/db/reactions.ts` + `bot.on('message_reaction')` di telegram gateway.
- **Konteks plugin**: Plugin saat ini cuma bisa **kirim** reaction (`react` tool). Belum forward reaction event yang user kasih ke bot. Berguna untuk konfirmasi non-verbal.

### T1.10 — Album / media group batching

- **Referensi old project**: Sudah didukung di `personal-ai-assistant` — multiple image dalam satu album diproses sekaligus, bukan sequential.
- **Konteks plugin**: Telegram mengirim album sebagai **multiple update terpisah** dengan `media_group_id` yang sama, datang dalam window beberapa ratus ms. Plugin saat ini akan trigger MCP notification per image → Claude akan membaca & merespon satu-satu (boros + tidak natural).
- **Opsi implementasi**:
  - **A**: Buffer per `media_group_id` dengan debounce 500-800ms. Setelah window habis, kirim satu notification dengan array `image_paths`.
  - **B**: Kirim incremental tapi tag `media_group_id` di channel attribute, biar Claude sendiri yang group. Lebih kompleks di sisi Claude, lebih simple di plugin.
- **Rekomendasi**: Opsi A — semantic batching idealnya transparan untuk Claude.
- **Catatan**: Format `<channel>` tag perlu support `image_paths` (plural). Backward compat: tetap kirim `image_path` (singular) untuk single image.

### T1.12 — Outbound media group / album

- **Konteks plugin**: `reply` tool saat ini menerima `files: string[]` dan mengirim **per file** lewat `sendPhoto`/`sendDocument` di `server.ts:582-595`. Akibatnya, kalau Claude balas dengan 3 gambar, user lihat 3 pesan terpisah di Telegram (bukan 1 album visual).
- **Tujuan**: gabungkan multiple file outbound jadi 1 album via `bot.api.sendMediaGroup()` dengan `InputMediaPhoto[]` / `InputMediaDocument[]`.
- **Konstrain Telegram**:
  - Album cap = 10 item.
  - Mixed photo + document **tidak diizinkan** dalam 1 `sendMediaGroup` — harus dipecah per tipe.
  - Caption hanya bisa attached di **item pertama** dari group; sisanya caption diabaikan oleh client.
  - Reply threading (`reply_parameters`) berlaku untuk seluruh album, bukan per item.
- **Trade-off**:
  - 1 file → tetap pakai `sendPhoto`/`sendDocument` (sendMediaGroup overkill).
  - 2+ photo → sendMediaGroup.
  - 2+ document → sendMediaGroup.
  - Photo + document mixed → 2 panggilan terpisah (1 album photo + 1 album document), atau fall-back ke per-file delivery existing.
- **Logging impact** (interaksi T1.11): `sendMediaGroup` return array message_id. Logging 1 row per album (mirror inbound T1.10) atau N row per file? Sebaiknya 1 row per album, attachments[] sesuai isi, message_id = pertama, metadata.message_ids[].
- **Out of plan T1.10**: dipisah ke T1.12 supaya inbound bisa di-ship tanpa menunggu desain outbound.

### T1.11 — Raw conversation logging

- **Referensi old project**: `src/db/message.ts` (better-sqlite3 + FTS5). Skema: timestamp, sender (user/assistant/system), gateway, chat_id, message_id, text, media flag, raw payload.
- **Konteks plugin**: Plugin punya akses natural ke semua flow:
  - **Inbound**: di `handleInbound()` sebelum gate decision.
  - **Outbound (assistant)**: di `reply` MCP tool.
  - **Outbound (system)**: reply yang dipicu cronjob/API trigger juga lewat `reply` tool yang sama → otomatis tercatat. Source dibedakan dengan flag (mis. param `triggered_by: 'cron' | 'user'` atau heuristik via context).
- **Tujuan utama**: User bisa recall percakapan lama dari sesi baru ("kemarin kita bahas X, lanjut yuk"). Saat ini setelah session baru, context hilang total.
- **Skema minimal yang diusulkan**:
  ```sql
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,           -- unix ms
    chat_id TEXT NOT NULL,
    message_id TEXT,                -- Telegram message_id (null untuk system event)
    source TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
    text TEXT,
    attachments TEXT,               -- JSON array of file paths/types
    metadata TEXT                   -- JSON: triggered_by, reply_to, edited_at, dll
  );
  ```
- **Opsi storage**:
  - **A**: SQLite (better-sqlite3 atau Bun's built-in `bun:sqlite`). Future-proof untuk FTS5.
  - **B**: JSONL append-only di `<project>/.claude/channels/telegram/messages.jsonl`. Simpel, tapi search nanti perlu load all.
- **Rekomendasi**: SQLite via `bun:sqlite` (nol dependency, native di Bun). Schema-less mode dulu (text + JSON metadata), tambah index/FTS belakangan.
- **Lokasi file**: `<project>/.claude/channels/telegram/messages.db` (atau per-chat: `messages/<chatId>.db` kalau ingin per-chat isolation).
- **Scope eksplisit yang DI-DEFER**: search/recall mechanism (MCP tool `search_messages`, dashboard query, dll). Item ini **storage saja dulu** sesuai instruksi user.
- **Decision pending**: per-chat DB vs single DB. Per-chat lebih clean (mudah delete per user, no cross-leak), single DB lebih mudah cross-chat search nanti.

### T2.1 — Per-channel lightweight state

- **Referensi old project**: `src/db/profile.ts` (7 attributes), `src/core/wake-up.ts` (auto-inject).
- **Konteks plugin**: Bisa simpan di `<project>/.claude/channels/telegram/state/<userId>.json` (timezone, nickname, language hint). Auto-attach sebagai attribute di `<channel>` tag, biar Claude punya konteks tanpa harus tanya tiap kali.
- **Trade-off**: Mulai overlap dengan "memory system" (T3.1). Batasi ketat: hanya hint kontekstual, bukan history/knowledge.

### T2.2 — Read-only monitoring dashboard

- **Referensi old project**: `src/dashboard/` — Express HTTP server, bearer token auth, optional TLS.
- **Konteks plugin**: Scope dipersempit: hanya status plugin (pending pairings, recent inbound count, error log, polling state). Tidak expose user content.
- **Pertimbangan**: Bisa di-skip total — `tail -f` log mungkin sudah cukup. Tunda sampai ada kebutuhan jelas.

### T2.3 — Inbound preprocessing pipeline

- **Referensi old project**: Tidak eksplisit, tapi pola async di gateway memungkinkan.
- **Konteks plugin**: Hook chain seperti `inbound → [transcribe?, translate?, enrich?] → notify`. Foundation untuk fitur lain (T1.1 voice, F3 sticker dll). Worth dikerjakan **sebelum** banyak fitur preprocessing.

### T2.4 — MarkdownV2 safety helper

- **Referensi old project**: Tidak ada (project lama pakai plain text).
- **Konteks plugin**: Saat ini `format: 'markdown'` di `reply` tool gampang error kalau text mengandung `_`, `*`, `[`, dll yang tidak di-escape. Helper `escapeMarkdownV2(text)` mencegah crash.

### T2.5 — Group chat enhancements

- **Referensi old project**: Tidak ada (gateway personal-ai-assistant DM-focused).
- **Konteks plugin**: Group support sudah ada (mention detection di `access.json.groups`). Yang bisa ditambahkan: detect kalau bot di-quote vs di-mention, distinguish reply-to-bot vs new-topic.

---

## Catatan Implementasi

- **Setiap fitur sebaiknya satu PR/commit terpisah** untuk memudahkan revert.
- **Test plan harus include**: behavior dengan fitur ON dan OFF (modularitas).
- **Backward compat**: existing user dengan `access.json` lama tidak boleh broken.
- **Settings**: opsi baru ditambahkan ke `access.json` schema (atau file config baru `behaviors.json` kalau makin banyak).

## Update Log

- **2026-05-15** — Initial backlog dari hasil eksplorasi `personal-ai-assistant`. Belum ada item yang dimulai.
- **2026-05-15** — Tambah T1.10 (album/media group batching) dan T1.11 (raw conversation logging) berdasarkan input user. T3.7 (search messages) di-revise: storage layer dipindah ke T1.11, mekanisme search di-defer ke pembahasan terpisah.
- **2026-05-15** — Tambah section "Recommended Development Order (by Impact)". Mode kerja disepakati: 1 fitur per session, focus deep. Saran titik mulai: T1.11.
- **2026-05-15** — T1.11 selesai. Module `plugins/telegram/messages-store.ts` + integrasi di `server.ts` (handleInbound, reply tool, edit_message tool). `reply` tool gain optional `source` param. Disable via `TELEGRAM_DISABLE_MESSAGES_STORE=1`. Spec: `docs/superpowers/specs/2026-05-15-t111-conversation-logging-design.md`.
- **2026-05-16** — T1.10 design spec ready: `docs/superpowers/specs/2026-05-16-t110-album-batching-design.md`. Keputusan: Opsi A (plugin buffer), 400ms debounce / 3000ms hard cap / 10 max items, photo + document only, 1 row per album. Tambah T1.12 (outbound media group via `sendMediaGroup`) sebagai item baru — out of plan T1.10.
- **2026-05-16** — T1.10 selesai. Module `plugins/telegram/album-buffer.ts` (generic, 8 unit tests) + integration di `server.ts` (photo & document handler routing, handleInboundAlbum, shutdown drain). Album = 1 row di messages.db dengan `metadata.media_group_id` + `metadata.message_ids[]`. MCP meta tambahan: `image_paths[]`, `attachments[]`, `media_group_id`. Manual smoke pending user verification.
