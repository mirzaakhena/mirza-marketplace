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
