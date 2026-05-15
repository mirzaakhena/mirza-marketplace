# T1.11 — Raw Conversation Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah persistent logging ke plugin telegram untuk semua percakapan (inbound user, outbound assistant, outbound system, edit) ke file SQLite lokal — fondasi untuk recall lintas sesi.

**Architecture:** Module standalone `messages-store.ts` di samping `server.ts`. Storage SQLite via `bun:sqlite` (built-in, zero dependency). Hook integration di 3 titik di server.ts: `handleInbound()`, `reply` tool, `edit_message` tool. Best-effort failure handling (logger gagal ≠ messaging gagal). Disable-able via env var.

**Tech Stack:** Bun runtime, `bun:sqlite` (built-in), `bun:test` (built-in test runner), TypeScript.

**Spec reference:** `docs/superpowers/specs/2026-05-15-t111-conversation-logging-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `plugins/telegram/messages-store.ts` | Standalone DB module: open/close, schema migration, 3 log methods (inbound/outbound/edit), no-op fallback | CREATE |
| `plugins/telegram/messages-store.test.ts` | Unit tests via `bun:test`, in-memory SQLite (`:memory:`) | CREATE |
| `plugins/telegram/server.ts` | Integration: init/close, hook calls, tambah `source` param di `reply` tool schema | MODIFY |
| `plugins/telegram/README.md` | Dokumentasi konvensi `source` param untuk caller | MODIFY |
| `plugins/telegram/FEATURES_BACKLOG.md` | Update status T1.11 (in-progress → completed), tambah entry Update Log | MODIFY |

---

## Task 1: Module skeleton + first test (init creates schema)

**Files:**
- Create: `plugins/telegram/messages-store.ts`
- Create: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/telegram/messages-store.test.ts`:

```typescript
import { test, expect, describe } from 'bun:test'
import { createMessagesStore } from './messages-store'

describe('messages-store: init', () => {
  test('init creates messages table with expected columns', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    const db = store._dbForTest()
    const cols = db.query("PRAGMA table_info(messages)").all() as Array<{ name: string }>
    const names = cols.map(c => c.name).sort()

    expect(names).toEqual([
      'attachments', 'chat_id', 'id', 'message_id', 'metadata',
      'reply_to', 'source', 'text', 'ts', 'user_id', 'user_name',
    ])
    store.close()
  })

  test('init creates expected indexes', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    const db = store._dbForTest()
    const idx = db.query("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_messages%'").all() as Array<{ name: string }>
    const names = idx.map(i => i.name).sort()

    expect(names).toEqual([
      'idx_messages_chat_ts', 'idx_messages_msg', 'idx_messages_source',
    ])
    store.close()
  })

  test('init is idempotent', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    expect(() => store.init()).not.toThrow()
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL with module-not-found error (`Cannot find module './messages-store'`).

- [ ] **Step 3: Implement minimal skeleton**

Create `plugins/telegram/messages-store.ts`:

```typescript
import { Database } from 'bun:sqlite'

export interface InboundLogInput {
  ts: number
  chat_id: string
  message_id?: string
  user_id?: string
  user_name?: string
  text?: string
  attachments?: unknown[]
  reply_to?: string
  metadata?: Record<string, unknown>
}

export interface OutboundLogInput {
  ts: number
  chat_id: string
  message_id?: string
  source: 'assistant' | 'system'
  text?: string
  attachments?: unknown[]
  reply_to?: string
  metadata?: Record<string, unknown>
}

export interface EditLogInput {
  ts: number
  chat_id: string
  message_id: string
  edited_of: string
  text?: string
  metadata?: Record<string, unknown>
}

export interface MessagesStore {
  init(): void
  logInbound(input: InboundLogInput): void
  logOutbound(input: OutboundLogInput): void
  logEdit(input: EditLogInput): void
  close(): void
  // Test-only escape hatch for inspecting internal DB.
  _dbForTest(): Database
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  chat_id     TEXT    NOT NULL,
  message_id  TEXT,
  source      TEXT    NOT NULL,
  user_id     TEXT,
  user_name   TEXT,
  text        TEXT,
  attachments TEXT,
  reply_to    TEXT,
  metadata    TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_msg     ON messages(chat_id, message_id);
CREATE INDEX IF NOT EXISTS idx_messages_source  ON messages(source, ts DESC);
`

export function createMessagesStore(opts: { dbPath: string }): MessagesStore {
  let db: Database | null = null

  return {
    init(): void {
      if (db != null) return
      db = new Database(opts.dbPath, { create: true })
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA synchronous = NORMAL')
      db.exec(SCHEMA_SQL)
    },
    logInbound(_input: InboundLogInput): void {
      // Implemented in Task 2.
    },
    logOutbound(_input: OutboundLogInput): void {
      // Implemented in Task 4.
    },
    logEdit(_input: EditLogInput): void {
      // Implemented in Task 6.
    },
    close(): void {
      db?.close()
      db = null
    },
    _dbForTest(): Database {
      if (!db) throw new Error('store not initialized')
      return db
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: messages-store module skeleton + schema init

Tambah module messages-store.ts dengan API stub (logInbound/logOutbound/logEdit) dan implementasi init() yang membuat tabel + 3 index secara idempotent. Storage via bun:sqlite (built-in), WAL mode untuk fast write.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: logInbound — text only

**Files:**
- Modify: `plugins/telegram/messages-store.ts`
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: logInbound text-only', () => {
  test('persists text inbound with required fields', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '99',
      user_id: '777',
      user_name: 'mirza',
      text: 'halo',
    })

    const rows = store._dbForTest().query('SELECT * FROM messages').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '99',
      source: 'user',
      user_id: '777',
      user_name: 'mirza',
      text: 'halo',
      attachments: null,
      reply_to: null,
      metadata: null,
    })
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL — `expected length 1, got 0` (logInbound is currently a no-op stub).

- [ ] **Step 3: Implement logInbound**

In `plugins/telegram/messages-store.ts`, replace the `logInbound` stub:

```typescript
    logInbound(input: InboundLogInput): void {
      if (!db) return
      const stmt = db.prepare(
        `INSERT INTO messages
          (ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)
         VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)`,
      )
      stmt.run(
        input.ts,
        input.chat_id,
        input.message_id ?? null,
        input.user_id ?? null,
        input.user_name ?? null,
        input.text ?? null,
        input.attachments ? JSON.stringify(input.attachments) : null,
        input.reply_to ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      )
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: implement logInbound for text-only inbound

INSERT statement dengan source='user' hard-coded. Optional fields jadi NULL kalau tidak diset caller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: logInbound — attachments + reply_to

**Files:**
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: logInbound full payload', () => {
  test('persists attachments JSON and reply_to', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: '12345',
      message_id: '100',
      user_id: '777',
      user_name: 'mirza',
      text: 'lihat ini',
      attachments: [
        { type: 'photo', path: '/inbox/abc.jpg', file_id: 'AgAC' },
      ],
      reply_to: '88',
      metadata: { format: 'plain' },
    })

    const row = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ?')
      .get('100') as any
    expect(row.reply_to).toBe('88')
    expect(JSON.parse(row.attachments)).toEqual([
      { type: 'photo', path: '/inbox/abc.jpg', file_id: 'AgAC' },
    ])
    expect(JSON.parse(row.metadata)).toEqual({ format: 'plain' })
    store.close()
  })

  test('attachments empty array stored as JSON not NULL', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    store.logInbound({
      ts: 1700000000001,
      chat_id: '12345',
      attachments: [],
    })
    const row = store._dbForTest()
      .query('SELECT attachments FROM messages WHERE ts = 1700000000001')
      .get() as any
    expect(row.attachments).toBe('[]')
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it passes (should already pass)**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 6 tests pass — Task 2 implementation already covered these via the JSON.stringify branches and `?? null` fallbacks. If a test fails, fix the bug in `logInbound` before continuing.

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/messages-store.test.ts
git commit -m "T1.11: tests for logInbound attachments + reply_to + metadata

Verifikasi serialization JSON untuk attachments dan metadata, plus empty array tetap stored sebagai '[]' bukan NULL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: logOutbound — assistant default

**Files:**
- Modify: `plugins/telegram/messages-store.ts`
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: logOutbound', () => {
  test('persists outbound with source=assistant', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logOutbound({
      ts: 1700000001000,
      chat_id: '12345',
      message_id: '101',
      source: 'assistant',
      text: 'oke siap',
    })

    const row = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ?')
      .get('101') as any
    expect(row).toMatchObject({
      source: 'assistant',
      chat_id: '12345',
      text: 'oke siap',
      user_id: null,
      user_name: null,
    })
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL — outbound row not found.

- [ ] **Step 3: Implement logOutbound**

In `plugins/telegram/messages-store.ts`, replace the `logOutbound` stub:

```typescript
    logOutbound(input: OutboundLogInput): void {
      if (!db) return
      const stmt = db.prepare(
        `INSERT INTO messages
          (ts, chat_id, message_id, source, text, attachments, reply_to, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      stmt.run(
        input.ts,
        input.chat_id,
        input.message_id ?? null,
        input.source,
        input.text ?? null,
        input.attachments ? JSON.stringify(input.attachments) : null,
        input.reply_to ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      )
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: implement logOutbound

Source diambil dari param caller (default 'assistant', boleh 'system'). Tidak set user_id/user_name (outbound dari bot).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: logOutbound — system + metadata

**Files:**
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: logOutbound system source', () => {
  test('persists system source with triggered_by metadata', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logOutbound({
      ts: 1700000002000,
      chat_id: '12345',
      message_id: '102',
      source: 'system',
      text: 'reminder: minum air',
      metadata: { triggered_by: 'cron:hydration' },
    })

    const row = store._dbForTest()
      .query('SELECT source, metadata FROM messages WHERE message_id = ?')
      .get('102') as any
    expect(row.source).toBe('system')
    expect(JSON.parse(row.metadata)).toEqual({ triggered_by: 'cron:hydration' })
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it passes (should already pass)**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 8 tests pass — Task 4 implementation covered this. If fail, fix bug in logOutbound.

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/messages-store.test.ts
git commit -m "T1.11: test logOutbound system source + metadata

Verifikasi source='system' dan metadata dengan triggered_by tersimpan benar untuk reply yang dipicu cronjob.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: logEdit — append + metadata.edited_of

**Files:**
- Modify: `plugins/telegram/messages-store.ts`
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: logEdit', () => {
  test('appends new row with metadata.edited_of, original untouched', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    // Original outbound
    store.logOutbound({
      ts: 1700000003000,
      chat_id: '12345',
      message_id: '200',
      source: 'assistant',
      text: 'masih proses...',
    })

    // Edit (Telegram returns same message_id for edits)
    store.logEdit({
      ts: 1700000003500,
      chat_id: '12345',
      message_id: '200',
      edited_of: '200',
      text: 'selesai!',
    })

    const rows = store._dbForTest()
      .query('SELECT * FROM messages WHERE message_id = ? ORDER BY ts')
      .all('200') as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].text).toBe('masih proses...')
    expect(rows[0].metadata).toBeNull()
    expect(rows[1].text).toBe('selesai!')
    expect(JSON.parse(rows[1].metadata)).toMatchObject({ edited_of: '200' })
    expect(rows[1].source).toBe('assistant') // default for edit
    store.close()
  })

  test('logEdit preserves caller-supplied metadata + adds edited_of', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    store.logEdit({
      ts: 1700000004000,
      chat_id: '12345',
      message_id: '201',
      edited_of: '201',
      text: 'updated',
      metadata: { format: 'markdown' },
    })
    const row = store._dbForTest()
      .query('SELECT metadata FROM messages WHERE ts = 1700000004000')
      .get() as any
    expect(JSON.parse(row.metadata)).toEqual({
      format: 'markdown',
      edited_of: '201',
    })
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL — only 1 row exists for message_id 200 (logEdit is still no-op).

- [ ] **Step 3: Implement logEdit**

In `plugins/telegram/messages-store.ts`, replace the `logEdit` stub:

```typescript
    logEdit(input: EditLogInput): void {
      if (!db) return
      const merged = { ...(input.metadata ?? {}), edited_of: input.edited_of }
      const stmt = db.prepare(
        `INSERT INTO messages
          (ts, chat_id, message_id, source, text, metadata)
         VALUES (?, ?, ?, 'assistant', ?, ?)`,
      )
      stmt.run(
        input.ts,
        input.chat_id,
        input.message_id,
        input.text ?? null,
        JSON.stringify(merged),
      )
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: implement logEdit (append-only with edited_of)

Edit selalu append row baru (tidak update in-place), source hard-coded 'assistant' karena Telegram hanya membolehkan bot edit pesan miliknya. metadata.edited_of selalu di-merge ke metadata caller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Failure isolation (best-effort)

**Files:**
- Modify: `plugins/telegram/messages-store.ts`
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
import { spyOn } from 'bun:test'

describe('messages-store: failure isolation', () => {
  test('init failure → store falls back to no-op, methods do not throw', () => {
    // Force init failure with a path that's invalid on both OSes:
    // - Windows: 'CON' is a reserved device name, can't create file
    // - POSIX: /dev/null is a character device, can't have subdirectory
    const badPath = process.platform === 'win32' ? 'CON' : '/dev/null/x.db'
    const store = createMessagesStore({ dbPath: badPath })
    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => store.init()).not.toThrow()

    // All methods should be silent no-op after failed init
    expect(() => store.logInbound({ ts: 1, chat_id: 'x' })).not.toThrow()
    expect(() => store.logOutbound({ ts: 1, chat_id: 'x', source: 'assistant' })).not.toThrow()
    expect(() => store.logEdit({ ts: 1, chat_id: 'x', message_id: 'y', edited_of: 'y' })).not.toThrow()
    expect(() => store.close()).not.toThrow()

    // Init failure should be logged once to stderr
    expect(stderrSpy).toHaveBeenCalled()
    const writes = stderrSpy.mock.calls.map(c => String(c[0]))
    expect(writes.some(w => w.includes('messages-store') && w.includes('init failed'))).toBe(true)
    stderrSpy.mockRestore()
  })

  test('write failure → stderr warning, no throw, normal flow continues', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()
    // Drop the table to force write failure
    store._dbForTest().exec('DROP TABLE messages')

    const stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(() => store.logInbound({ ts: 1, chat_id: 'x', text: 'hi' })).not.toThrow()
    const writes = stderrSpy.mock.calls.map(c => String(c[0]))
    expect(writes.some(w => w.includes('messages-store') && w.includes('write failed'))).toBe(true)
    stderrSpy.mockRestore()
    store.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL — init throws on `/` path, write throws when table dropped.

- [ ] **Step 3: Add try/catch to init + log methods**

In `plugins/telegram/messages-store.ts`, wrap each method body in try/catch:

```typescript
export function createMessagesStore(opts: { dbPath: string }): MessagesStore {
  let db: Database | null = null
  let disabled = false

  function warn(stage: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`telegram channel: messages-store ${stage} failed: ${msg}\n`)
  }

  return {
    init(): void {
      if (db != null || disabled) return
      try {
        db = new Database(opts.dbPath, { create: true })
        db.exec('PRAGMA journal_mode = WAL')
        db.exec('PRAGMA synchronous = NORMAL')
        db.exec(SCHEMA_SQL)
      } catch (err) {
        warn('init', err)
        disabled = true
        try { db?.close() } catch {}
        db = null
      }
    },
    logInbound(input: InboundLogInput): void {
      if (!db) return
      try {
        const stmt = db.prepare(
          `INSERT INTO messages
            (ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)
           VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?)`,
        )
        stmt.run(
          input.ts,
          input.chat_id,
          input.message_id ?? null,
          input.user_id ?? null,
          input.user_name ?? null,
          input.text ?? null,
          input.attachments ? JSON.stringify(input.attachments) : null,
          input.reply_to ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        )
      } catch (err) {
        warn('write', err)
      }
    },
    logOutbound(input: OutboundLogInput): void {
      if (!db) return
      try {
        const stmt = db.prepare(
          `INSERT INTO messages
            (ts, chat_id, message_id, source, text, attachments, reply_to, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        stmt.run(
          input.ts,
          input.chat_id,
          input.message_id ?? null,
          input.source,
          input.text ?? null,
          input.attachments ? JSON.stringify(input.attachments) : null,
          input.reply_to ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        )
      } catch (err) {
        warn('write', err)
      }
    },
    logEdit(input: EditLogInput): void {
      if (!db) return
      try {
        const merged = { ...(input.metadata ?? {}), edited_of: input.edited_of }
        const stmt = db.prepare(
          `INSERT INTO messages
            (ts, chat_id, message_id, source, text, metadata)
           VALUES (?, ?, ?, 'assistant', ?, ?)`,
        )
        stmt.run(
          input.ts,
          input.chat_id,
          input.message_id,
          input.text ?? null,
          JSON.stringify(merged),
        )
      } catch (err) {
        warn('write', err)
      }
    },
    close(): void {
      try { db?.close() } catch {}
      db = null
    },
    _dbForTest(): Database {
      if (!db) throw new Error('store not initialized')
      return db
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: best-effort failure isolation

Init failure → fallback no-op mode (semua method jadi silent noop, 1x stderr warning). Write failure → stderr warning per call, tidak throw. Reliability messaging > completeness log sesuai design.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Disable env var (TELEGRAM_DISABLE_MESSAGES_STORE)

**Files:**
- Modify: `plugins/telegram/messages-store.ts`
- Modify: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `plugins/telegram/messages-store.test.ts`:

```typescript
describe('messages-store: disable via env var', () => {
  test('TELEGRAM_DISABLE_MESSAGES_STORE=1 → init is no-op, methods silent', () => {
    const original = process.env.TELEGRAM_DISABLE_MESSAGES_STORE
    process.env.TELEGRAM_DISABLE_MESSAGES_STORE = '1'
    try {
      const store = createMessagesStore({ dbPath: ':memory:' })
      store.init()
      expect(() => store.logInbound({ ts: 1, chat_id: 'x', text: 'hi' })).not.toThrow()
      // _dbForTest should throw because db was never opened
      expect(() => store._dbForTest()).toThrow()
    } finally {
      if (original === undefined) delete process.env.TELEGRAM_DISABLE_MESSAGES_STORE
      else process.env.TELEGRAM_DISABLE_MESSAGES_STORE = original
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: FAIL — env var currently has no effect, init opens DB anyway.

- [ ] **Step 3: Add env var check in init**

In `plugins/telegram/messages-store.ts`, modify the `init` method to check the env var first:

```typescript
    init(): void {
      if (db != null || disabled) return
      if (process.env.TELEGRAM_DISABLE_MESSAGES_STORE === '1') {
        disabled = true
        process.stderr.write('telegram channel: messages-store disabled via TELEGRAM_DISABLE_MESSAGES_STORE\n')
        return
      }
      try {
        db = new Database(opts.dbPath, { create: true })
        db.exec('PRAGMA journal_mode = WAL')
        db.exec('PRAGMA synchronous = NORMAL')
        db.exec(SCHEMA_SQL)
      } catch (err) {
        warn('init', err)
        disabled = true
        try { db?.close() } catch {}
        db = null
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: All 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/messages-store.ts plugins/telegram/messages-store.test.ts
git commit -m "T1.11: support TELEGRAM_DISABLE_MESSAGES_STORE env var

Set env var ke '1' untuk skip init dan jalankan plugin tanpa logger. Berguna untuk debugging atau testing fitur lain. Modular per design principle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Integrate into server.ts — boot + shutdown

**Files:**
- Modify: `plugins/telegram/server.ts`

- [ ] **Step 1: Add import + create store + init at boot**

In `plugins/telegram/server.ts`, find the line that says `const STATE_DIR = process.env.TELEGRAM_STATE_DIR ?? join(homedir(), '.claude', 'channels', 'telegram')` (line 26 currently). After the existing constants block (around line 54, after `const PID_FILE = join(STATE_DIR, 'bot.pid')`), add:

```typescript
const MESSAGES_DB = join(STATE_DIR, 'messages.db')
```

At the top of the file with other imports, add:

```typescript
import { createMessagesStore } from './messages-store.ts'
```

After the existing `mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })` line (around line 60), add:

```typescript
const messagesStore = createMessagesStore({ dbPath: MESSAGES_DB })
messagesStore.init()
```

- [ ] **Step 2: Add close in shutdown handler**

Find the `shutdown` function (around line 649). Inside the function body, after `process.stderr.write('telegram channel: shutting down\n')`, add:

```typescript
  try { messagesStore.close() } catch {}
```

The function should now look like:

```typescript
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write('telegram channel: shutting down\n')
  try { messagesStore.close() } catch {}
  try {
    if (parseInt(readFileSync(PID_FILE, 'utf8'), 10) === process.pid) rmSync(PID_FILE)
  } catch {}
  setTimeout(() => process.exit(0), 2000)
  void Promise.resolve(bot.stop()).finally(() => process.exit(0))
}
```

- [ ] **Step 3: Smoke test — plugin starts cleanly**

Run: `cd plugins/telegram && bun --silent server.ts < /dev/null`

Expected: stderr shows `telegram channel: polling as @<botname>` (or similar) within 2-3 seconds. No errors about messages-store. Then exits within ~2s due to stdin EOF.

On Windows PowerShell, use: `Get-Content -Raw NUL | bun --silent server.ts` or test via `claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace`.

Verify the DB file got created:
```powershell
Test-Path "$env:USERPROFILE\.claude\channels\telegram\messages.db"
```
Expected: True

- [ ] **Step 4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.11: integrate messages-store into server boot + shutdown

Init store di startup setelah STATE_DIR dibuat, close() di shutdown handler. DB path: {STATE_DIR}/messages.db, konsisten dengan existing access.json/.env.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Hook into handleInbound

**Files:**
- Modify: `plugins/telegram/server.ts`

- [ ] **Step 1: Add log call before mcp.notification**

Find the `handleInbound` function (around line 905). Locate the `mcp.notification` block at the end (around line 968-990). **Immediately before** the `mcp.notification(...)` call, add the log call:

```typescript
  messagesStore.logInbound({
    ts: Date.now(),
    chat_id,
    message_id: msgId != null ? String(msgId) : undefined,
    user_id: String(from.id),
    user_name: from.username ?? from.first_name ?? String(from.id),
    text: text || undefined,
    attachments: buildAttachmentsForLog(imagePath, attachment),
    reply_to: ctx.message?.reply_to_message?.message_id != null
      ? String(ctx.message.reply_to_message.message_id)
      : undefined,
  })
```

Then add this helper function just below `handleInbound` (or above `safeName` near line 901):

```typescript
function buildAttachmentsForLog(
  imagePath: string | undefined,
  attachment: AttachmentMeta | undefined,
): unknown[] | undefined {
  const out: unknown[] = []
  if (imagePath) out.push({ type: 'photo', path: imagePath })
  if (attachment) {
    out.push({
      type: attachment.kind,
      file_id: attachment.file_id,
      ...(attachment.size != null ? { size: attachment.size } : {}),
      ...(attachment.mime ? { mime: attachment.mime } : {}),
      ...(attachment.name ? { name: attachment.name } : {}),
    })
  }
  return out.length > 0 ? out : undefined
}
```

- [ ] **Step 2: Manual integration test — text inbound**

Start the plugin via Claude Code: `claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace`. Send a DM text message to your bot from a paired account.

Then inspect the DB:
```powershell
sqlite3 "$env:USERPROFILE\.claude\channels\telegram\messages.db" "SELECT id,ts,source,user_name,substr(text,1,50) FROM messages ORDER BY ts DESC LIMIT 5"
```

Expected: row with `source=user`, `user_name=<your name>`, text matches what you sent.

- [ ] **Step 3: Manual integration test — photo inbound**

Send a photo with caption from Telegram. Re-query:
```powershell
sqlite3 "$env:USERPROFILE\.claude\channels\telegram\messages.db" "SELECT id,source,text,attachments FROM messages ORDER BY ts DESC LIMIT 1"
```

Expected: row with `attachments` JSON containing `[{"type":"photo","path":"...inbox/...jpg"}]`.

- [ ] **Step 4: Manual integration test — quote-reply inbound**

In Telegram, quote-reply to one of the bot's earlier messages. Re-query:
```powershell
sqlite3 "$env:USERPROFILE\.claude\channels\telegram\messages.db" "SELECT id,reply_to,text FROM messages ORDER BY ts DESC LIMIT 1"
```

Expected: `reply_to` is the message_id of the bot message you replied to.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.11: hook logInbound into handleInbound

Log call ditempatkan setelah gate=deliver dan setelah image download, sebelum mcp.notification. Build attachments JSON dari imagePath (photo) dan AttachmentMeta (document/voice/audio/dll). reply_to diambil dari ctx.message.reply_to_message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add source param to reply tool + log outbound

**Files:**
- Modify: `plugins/telegram/server.ts`

- [ ] **Step 1: Update `reply` tool JSON Schema**

Find the `reply` tool definition in `ListToolsRequestSchema` handler (around line 447-473). In the `properties` object, add a new property after `format`:

```typescript
          source: {
            type: 'string',
            enum: ['assistant', 'system'],
            description: "Origin of this reply. Default 'assistant' for direct user replies. Use 'system' when triggered by cronjob/scheduler/API event (not in response to a user message). Logged to messages-store.",
          },
```

The full updated tool definition:

```typescript
    {
      name: 'reply',
      description:
        'Reply on Telegram. Pass chat_id from the inbound message. Optionally pass reply_to (message_id) for threading, and files (absolute paths) to attach images or documents.',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string' },
          text: { type: 'string' },
          reply_to: {
            type: 'string',
            description: 'Message ID to thread under. Use message_id from the inbound <channel> block.',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute file paths to attach. Images send as photos (inline preview); other types as documents. Max 50MB each.',
          },
          format: {
            type: 'string',
            enum: ['text', 'markdownv2'],
            description: "Rendering mode. 'markdownv2' enables Telegram formatting (bold, italic, code, links). Caller must escape special chars per MarkdownV2 rules. Default: 'text' (plain, no escaping needed).",
          },
          source: {
            type: 'string',
            enum: ['assistant', 'system'],
            description: "Origin of this reply. Default 'assistant' for direct user replies. Use 'system' when triggered by cronjob/scheduler/API event (not in response to a user message). Logged to messages-store.",
          },
        },
        required: ['chat_id', 'text'],
      },
    },
```

- [ ] **Step 2: Read source param + log outbound after sends succeed**

Find the `case 'reply':` handler (around line 523). Near the top of the case, after reading existing args, add:

```typescript
        const source = (args.source as 'assistant' | 'system' | undefined) ?? 'assistant'
```

Then at the **end** of the case (after the existing `for (const f of files)` loop and before the `const result =` line, around line 583), add the log calls. The order: log each text chunk + each file as a separate row, all sharing the same `source`. Use the parallel arrays we already have (`chunks` and `sentIds`):

```typescript
        // Log all sent messages to the store. One row per chunk + one row per file
        // attachment (each is a distinct Telegram message with its own message_id).
        const ts = Date.now()
        for (let i = 0; i < chunks.length; i++) {
          // Mirror shouldReplyTo logic from the send loop above:
          // record reply_to only on chunks that actually got threaded.
          const chunkReplyTo =
            reply_to != null &&
            replyMode !== 'off' &&
            (replyMode === 'all' || i === 0)
              ? String(reply_to)
              : undefined
          messagesStore.logOutbound({
            ts: ts + i,
            chat_id,
            message_id: String(sentIds[i]),
            source,
            text: chunks[i],
            reply_to: chunkReplyTo,
            metadata: format !== 'text' ? { format } : undefined,
          })
        }
        // Files start at index `chunks.length` in sentIds (set by the second loop above).
        for (let j = 0; j < files.length; j++) {
          const f = files[j]
          const ext = extname(f).toLowerCase()
          const type = PHOTO_EXTS.has(ext) ? 'photo' : 'document'
          messagesStore.logOutbound({
            ts: ts + chunks.length + j,
            chat_id,
            message_id: String(sentIds[chunks.length + j]),
            source,
            attachments: [{ type, path: f }],
          })
        }
```

- [ ] **Step 3: Manual integration test — assistant default**

In a Claude Code session with the plugin loaded, ask Claude to send a reply (e.g., "Reply 'test outbound' to chat <chat_id>"). Then query:

```powershell
sqlite3 "$env:USERPROFILE\.claude\channels\telegram\messages.db" "SELECT id,source,substr(text,1,50),metadata FROM messages WHERE source IN ('assistant','system') ORDER BY ts DESC LIMIT 3"
```

Expected: row with `source=assistant`, text `test outbound`.

- [ ] **Step 4: Manual integration test — system source**

Ask Claude to call reply with `source='system'`. Re-query — expect `source=system`.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.11: add source param to reply tool + log outbound

Tambah optional source param ('assistant'|'system', default 'assistant') ke reply tool JSON Schema. Setelah semua chunk+file ter-kirim sukses, log ke messages-store satu row per Telegram message (1 per chunk, 1 per file).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Hook into edit_message

**Files:**
- Modify: `plugins/telegram/server.ts`

- [ ] **Step 1: Add log call after edit succeeds**

Find the `case 'edit_message':` handler (around line 615). After the `editMessageText` call and before the `return` statement, add the log call. The full updated case:

```typescript
      case 'edit_message': {
        assertAllowedChat(args.chat_id as string)
        const editFormat = (args.format as string | undefined) ?? 'text'
        const editParseMode = editFormat === 'markdownv2' ? 'MarkdownV2' as const : undefined
        const edited = await bot.api.editMessageText(
          args.chat_id as string,
          Number(args.message_id),
          args.text as string,
          ...(editParseMode ? [{ parse_mode: editParseMode }] : []),
        )
        const id = typeof edited === 'object' ? edited.message_id : args.message_id
        messagesStore.logEdit({
          ts: Date.now(),
          chat_id: args.chat_id as string,
          message_id: String(id),
          edited_of: String(args.message_id),
          text: args.text as string,
          metadata: editFormat !== 'text' ? { format: editFormat } : undefined,
        })
        return { content: [{ type: 'text', text: `edited (id: ${id})` }] }
      }
```

- [ ] **Step 2: Manual integration test — edit appends new row**

In Claude Code, ask Claude to send a reply, then edit it via `edit_message` tool. Query:

```powershell
sqlite3 "$env:USERPROFILE\.claude\channels\telegram\messages.db" "SELECT id,ts,source,substr(text,1,50),metadata FROM messages ORDER BY ts DESC LIMIT 3"
```

Expected: 2 rows for the same `message_id`. The newer row (higher `ts`) has `metadata` containing `edited_of`. The original row (older `ts`) has `metadata=NULL`.

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.11: hook logEdit into edit_message tool

Edit dipanggil setelah Telegram editMessageText sukses. Append row baru dengan metadata.edited_of = original message_id. Original row tidak diubah (append-only audit trail).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Documentation + backlog update

**Files:**
- Modify: `plugins/telegram/README.md`
- Modify: `plugins/telegram/FEATURES_BACKLOG.md`

- [ ] **Step 1: Add `source` param convention section to README**

Open `plugins/telegram/README.md` and add a new section near the bottom (before any "License" or trailing sections; if none, append at end):

```markdown
## Conversation Logging

Plugin mencatat semua percakapan ke `~/.claude/channels/telegram/messages.db` (SQLite). Tabel `messages` menyimpan inbound user, outbound assistant/system, dan edit history. Tujuan: recall lintas sesi.

### `source` parameter convention

`reply` tool menerima optional param `source: 'assistant' | 'system'`, default `'assistant'`.

- **`assistant`** — reply langsung ke pesan user (default, tidak perlu eksplisit).
- **`system`** — reply yang dipicu non-user event: cronjob, scheduler, external webhook, scheduled task. Caller (skill, MCP server, cronjob handler) **harus** set ini eksplisit agar log akurat.

### Disable

Set env var `TELEGRAM_DISABLE_MESSAGES_STORE=1` untuk menjalankan plugin tanpa logger (mis. saat debugging atau testing).

### Inspect

```bash
sqlite3 ~/.claude/channels/telegram/messages.db \
  "SELECT id,ts,source,user_name,substr(text,1,80) FROM messages ORDER BY ts DESC LIMIT 20"
```
```

- [ ] **Step 2: Update FEATURES_BACKLOG.md status**

Open `plugins/telegram/FEATURES_BACKLOG.md`. Find the Tier 1 "Persistence & State" section. Change:

```markdown
- [ ] **T1.11 — Raw conversation logging** (catat semua percakapan user/assistant/system ke storage lokal — fondasi untuk recall lintas sesi)
```

to:

```markdown
- [x] **T1.11 — Raw conversation logging** (catat semua percakapan user/assistant/system ke storage lokal — fondasi untuk recall lintas sesi)
```

Then in the "Update Log" section at the bottom, append a new entry:

```markdown
- **2026-05-15** — T1.11 selesai. Module `plugins/telegram/messages-store.ts` + integrasi di `server.ts` (handleInbound, reply tool, edit_message tool). `reply` tool gain optional `source` param. Disable via `TELEGRAM_DISABLE_MESSAGES_STORE=1`. Spec: `docs/superpowers/specs/2026-05-15-t111-conversation-logging-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/README.md plugins/telegram/FEATURES_BACKLOG.md
git commit -m "T1.11: docs + backlog status update

README: tambah section Conversation Logging dengan konvensi source param dan instruksi inspect/disable. FEATURES_BACKLOG.md: T1.11 ditandai selesai, entry Update Log baru.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Acceptance Verification

After all tasks complete, verify against spec acceptance criteria:

- [ ] `bun test` di `plugins/telegram/` lulus semua (13 test)
- [ ] Plugin start tanpa crash baik saat init success maupun fail (test fail dengan `chmod 0o400` ke DB file lalu restart)
- [ ] DM text → row source=user dengan user_name benar
- [ ] DM photo → row dengan attachments JSON `[{type:photo,path:...}]`
- [ ] Quote-reply → row dengan `reply_to` terisi
- [ ] Outbound default → source=assistant
- [ ] Outbound dengan `source='system'` param → tersimpan benar
- [ ] Edit message → row baru dengan metadata.edited_of, original utuh
- [ ] DB write failure (chmod read-only) → stderr warning, plugin tetap responsif
- [ ] `TELEGRAM_DISABLE_MESSAGES_STORE=1` → plugin jalan tanpa logger, tidak ada DB file dibuat
- [ ] FEATURES_BACKLOG.md status T1.11 ✓ + Update Log entry baru
