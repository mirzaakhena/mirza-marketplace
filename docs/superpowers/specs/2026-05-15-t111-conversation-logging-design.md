# T1.11 — Raw Conversation Logging — Design Spec

**Status**: Design approved (2026-05-15)
**Source**: `plugins/telegram/FEATURES_BACKLOG.md` → T1.11
**Implementation target**: `plugins/telegram/`
**Mode kerja**: 1 fitur per session, focus deep

## Purpose & Scope

### Purpose

Catat seluruh percakapan yang lewat plugin telegram (inbound user, outbound assistant, outbound system) ke storage lokal. Tujuan utama: memungkinkan recall lintas sesi — user dapat merujuk ke percakapan lama dari sesi Claude Code baru ("kemarin kita bahas X, lanjut yuk") tanpa kehilangan konteks.

### In scope (v1)

- Storage layer (SQLite) untuk semua message yang lewat plugin.
- Append-only logging dengan edit-history preservation.
- Source classification: `user` / `assistant` / `system`.
- Capture metadata: timestamp, chat_id, message_id, user info (untuk group), attachments, reply-to.
- Best-effort failure handling (logger gagal ≠ messaging gagal).

### Out of scope (defer ke session berikutnya)

- **Search/recall API** (MCP tool untuk query messages dari Claude). User eksplisit defer ini.
- **Reactions logging** (`react` tool). Bukan core conversation; T1.9 akan menangani.
- **Bot operational messages** (`/start`, `/help`, `/status`, error/system replies dari plugin sendiri). Operational, bukan AI conversation.
- **Retention/rotation**. Forever-storage untuk MVP.
- **Dashboard** (T2.2). Logger menyediakan data; UI nanti.

## Architecture

### Module structure

File baru: `plugins/telegram/messages-store.ts`. Mengekspos object dengan API:

```typescript
export interface MessagesStore {
  init(): void                              // dipanggil 1x di boot, idempotent
  logInbound(input: InboundLogInput): void
  logOutbound(input: OutboundLogInput): void
  logEdit(input: EditLogInput): void
  close(): void                             // dipanggil di graceful shutdown
}

export function createMessagesStore(opts?: { dbPath?: string }): MessagesStore
```

### Storage backend

- **`bun:sqlite`** — built-in di Bun runtime, zero new dependency.
- **DB file**: `~/.claude/channels/telegram/messages.db` (override via `TELEGRAM_STATE_DIR` env, konsisten dengan existing pattern).
- **File mode**: `0o600` (konsisten dengan `access.json`).
- **Pragma**: `journal_mode = WAL`, `synchronous = NORMAL` — fast write + concurrent read untuk dashboard masa depan.

### Initialization flow

1. Boot di `server.ts` setelah `mkdirSync(STATE_DIR)`.
2. `createMessagesStore()` → `store.init()`.
3. `init()` membuka DB, jalankan `CREATE TABLE IF NOT EXISTS` + 3 index (idempotent).
4. Init failure (permission denied, disk full, dll) → log warning ke stderr, store fallback ke **no-op mode** (semua method jadi noop). Plugin tetap berjalan.

## Schema

```sql
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,             -- unix ms (UTC)
  chat_id     TEXT    NOT NULL,             -- string untuk safety dengan large IDs
  message_id  TEXT,                         -- Telegram message_id (NULL untuk system event tanpa kirim)
  source      TEXT    NOT NULL,             -- 'user' | 'assistant' | 'system'
  user_id     TEXT,                         -- Telegram user_id (NULL untuk assistant/system)
  user_name   TEXT,                         -- display name (NULL untuk assistant/system)
  text        TEXT,                         -- pesan text (NULL kalau pure attachment)
  attachments TEXT,                         -- JSON array: [{type,path,file_id,...}]
  reply_to    TEXT,                         -- message_id yang di-quote-reply
  metadata    TEXT                          -- JSON catch-all
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_msg     ON messages(chat_id, message_id);
CREATE INDEX IF NOT EXISTS idx_messages_source  ON messages(source, ts DESC);
```

### Field semantics

| Field | Notes |
|---|---|
| `ts` | UTC unix milliseconds. Timezone display = caller's concern (mis. dashboard format pakai user TZ). |
| `chat_id` | Disimpan TEXT untuk hindari issue dengan Telegram large IDs (some > 2^53). |
| `message_id` | TEXT untuk konsistensi. NULL valid untuk future system event yang tidak kirim message. |
| `source` | Wajib salah satu dari 3 nilai. Constraint enforcement di application layer (bukan CHECK SQL — biar mudah extend). |
| `user_id` / `user_name` | NULL untuk outbound (assistant/system). Untuk DM, `user_id` sama dengan `chat_id`. Untuk group, beda. |
| `attachments` | JSON array. Schema entry: `{ type: 'photo'\|'document'\|'voice'\|..., path?: string, file_id?: string, mime?: string, size?: number }`. Empty array `[]` atau NULL untuk no-attachment. |
| `reply_to` | Telegram `reply_to_message_id` kalau user/bot quote-reply. |
| `metadata` | JSON catch-all. Reserved keys: `edited_of` (message_id original saat row ini = edit), `edited_at` (ts edit), `format` ('plain'\|'markdown'), `triggered_by` (free-text untuk system: 'cron:daily-summary', 'api:webhook-X', dll). |

## Hook points

| Hook | Lokasi di server.ts | Source | Behavior |
|---|---|---|---|
| **Inbound user** | `handleInbound()`, **setelah** gate decision = `deliver` | `'user'` | Capture text/photo/album payload. Gated-out (drop) **tidak** di-log. |
| **Outbound (assistant/system)** | `reply` MCP tool handler, **setelah** Telegram API sukses | param `source` (default `'assistant'`) | Capture `message_id` dari response. Multi-chunk reply → multi row (1 per chunk). |
| **Edit** | `edit_message` MCP tool handler, **setelah** API sukses | inherit dari row asli (default 'assistant') | **Append row baru** dengan `metadata.edited_of = <original_message_id>`. Original tetap. |

### Excluded hooks

- `react` tool — defer ke T1.9.
- Operational bot replies (`/start`, `/help`, `/status`, pairing flow text, error responses dari `assertAllowedChat()`) — operational, bukan conversation.

### Edge case decisions

- **Inbound dengan attachment tapi tanpa text**: `text = NULL`, `attachments` populated.
- **Album batch (T1.10 belum ada)**: untuk MVP T1.11, setiap photo = 1 row terpisah. T1.10 nanti akan refactor jadi 1 row per album dengan multi-attachment.
- **Edit ke pesan yang tidak ada di log** (mis. plugin restart antara send dan edit): tetap append row, `metadata.edited_of = <original_message_id>` di-set, tapi tanpa link FK. `source` default ke `'assistant'` (Telegram API hanya membolehkan bot edit pesan miliknya sendiri, jadi assistant/system — `'assistant'` jadi default aman). Edit tool tidak menerima override `source` di v1 untuk simplicity; bisa di-add belakangan kalau muncul use case cron-edit.
- **Reply tool gagal kirim ke Telegram**: jangan log. Logger hanya dipanggil setelah API sukses.
- **Bot `/commands` (`/start`, `/help`, `/status`, `/hello`)**: handler ini ada di `bot.command()` register, **tidak** lewat `handleInbound()`. Konsekuensi: inbound user untuk command tersebut **tidak** di-log di v1. Bot reply ke command juga tidak di-log (operational). Konsisten — keduanya skip. Bisa di-add di iterasi berikut kalau ternyata user butuh.

## API change

### `reply` MCP tool

Tambah optional param di JSON Schema:

```json
{
  "source": {
    "type": "string",
    "enum": ["assistant", "system"],
    "default": "assistant",
    "description": "Origin of this reply. Set 'system' when triggered by cron/scheduler/non-user-initiated event. Logged to messages-store."
  }
}
```

Backward compatibility: existing caller tanpa `source` = `'assistant'`. No breaking change.

### Caller convention (dokumentasi)

Dokumentasikan di `plugins/telegram/README.md` (atau CLAUDE.md baru):

> Saat memanggil `reply()` dari konteks non-user-initiated (cronjob skill, scheduled task, external webhook handler), set `source: "system"` agar terbedakan dari respons langsung ke pesan user.

## Failure handling

Strategi: **best-effort, reliability messaging > completeness log** (sesuai pilihan user).

- Try/catch berada **di dalam method store** (bukan di caller). Caller di server.ts cukup panggil `store.logXxx(...)` tanpa wrap. Ini menjaga API tetap simple dan menjamin satu lokasi konsisten untuk error handling.
- Write fail → `process.stderr.write(\`telegram channel: messages-store write failed: ${err.message}\n\`)`.
- Method return `void`. Tidak ada signal sukses/gagal ke caller. Filosofi: log = side effect, bukan part of request flow.
- Normal flow lanjut: reply tetap dianggap sukses, inbound tetap di-forward ke MCP notification.
- **Init fail** → store fallback ke no-op object. Semua future call jadi noop. 1x warning ke stderr di startup. Plugin tetap berjalan.

## Defaults

| ID | Default | Alternatif (jika butuh nanti) |
|---|---|---|
| D1 | DB file: `~/.claude/channels/telegram/messages.db` | Per-chat `messages/<chatId>.db` |
| D2 | Retention: forever, no rotation | Auto-delete > N hari (bisa pakai cron eksternal) |
| D3 | Migration: `CREATE IF NOT EXISTS` only, no version table | Tambah `schema_version` table saat butuh skema migration kompleks |
| D4 | Reactions, operational msgs NOT logged | Ikut log dengan source flag baru |
| D5 | Init eager di boot (1x open DB) | Lazy on first write |
| D6 | Timezone storage: UTC unix ms | ISO 8601 string (lebih readable, tapi 2x storage) |

## Testing strategy

### Unit test (`plugins/telegram/messages-store.test.ts`)

Run via `bun test` (Bun built-in test runner — konsisten dengan runtime).

Test cases:
- `init()` di `:memory:` SQLite → verify schema + index ter-create
- `logInbound({...text only})` → row tersimpan, `attachments=NULL`, `text` correct
- `logInbound({...with photo})` → `attachments` JSON ter-parse dengan benar
- `logInbound({...with reply_to})` → `reply_to` correct
- `logOutbound({source:'assistant'})` → row dengan source benar
- `logOutbound({source:'system', metadata:{triggered_by:'cron:test'}})` → metadata JSON ter-serialize
- `logEdit({...})` → row baru ter-append, `metadata.edited_of` set, original row tidak berubah (verifikasi via SELECT count)
- Multi-chunk outbound → multi row tersimpan, semua dengan source sama
- Failure isolation: open DB read-only mode → call tidak throw, plugin tetap responsive

### Manual integration test

Test plan setelah implementasi:
1. Start plugin, kirim DM text dari Telegram client → verify row source=user.
2. Trigger Claude reply (lewat session) → verify row source=assistant dengan message_id terisi.
3. Kirim photo → verify attachments JSON.
4. Quote-reply ke pesan bot → verify reply_to terisi.
5. Trigger edit dari Claude → verify row baru dengan edited_of, original utuh.
6. Inspect: `sqlite3 ~/.claude/channels/telegram/messages.db "SELECT id,ts,source,user_name,substr(text,1,50) FROM messages ORDER BY ts DESC LIMIT 20"`

## Modularitas check

Sesuai prinsip user (modular & standalone):

- **Disable mechanism**: Set env var `TELEGRAM_DISABLE_MESSAGES_STORE=1` → store skip init, fallback no-op. Plugin berjalan tanpa logger. Berguna untuk debugging atau testing.
- **Decoupling**: messages-store tidak tahu tentang gate logic, MCP, atau Telegram API. Hanya menerima data terstruktur.
- **No coupling ke fitur lain**: tidak depend ke T1.10 (album batching), T1.11 berdiri sendiri. Saat T1.10 jadi, tinggal adjust caller untuk pass multi-attachment array.

## File summary

Files yang akan dibuat / diubah:

- **NEW** `plugins/telegram/messages-store.ts` — module utama (~150-200 baris estimasi)
- **NEW** `plugins/telegram/messages-store.test.ts` — unit tests
- **MODIFIED** `plugins/telegram/server.ts`:
  - Import `createMessagesStore`
  - Init di boot (~5 baris)
  - Hook calls di `handleInbound()` (~5 baris)
  - Hook calls di `reply` tool handler (~10 baris, termasuk extract message_id dari sendMessage response)
  - Hook calls di `edit_message` tool handler (~5 baris)
  - Tambah `source` param ke `reply` tool JSON Schema (~5 baris)
  - `close()` di graceful shutdown (~2 baris)
- **MODIFIED** `plugins/telegram/README.md` — dokumentasi `source` param convention (~10 baris)
- **MODIFIED** `plugins/telegram/FEATURES_BACKLOG.md` — update status T1.11 → in-progress, kemudian completed

## Acceptance criteria

Implementasi dianggap selesai kalau:

- [ ] `messages-store.ts` ada dengan API yang spek-kan, lulus semua unit test (`bun test`)
- [ ] Plugin start/stop tidak crash saat init success maupun fail
- [ ] Inbound text + photo + quote-reply → row tersimpan dengan field benar (manual test)
- [ ] Outbound default → source='assistant'
- [ ] Outbound dengan param source='system' → tersimpan dengan benar
- [ ] Edit message → append row baru dengan metadata.edited_of, original utuh
- [ ] DB write failure → stderr warning, normal flow lanjut (test dengan chmod 0o400 file)
- [ ] `TELEGRAM_DISABLE_MESSAGES_STORE=1` → plugin jalan tanpa logger
- [ ] FEATURES_BACKLOG.md di-update: status T1.11 ✓, Update Log entry baru
- [ ] Acceptance manual SQLite query menunjukkan data benar
