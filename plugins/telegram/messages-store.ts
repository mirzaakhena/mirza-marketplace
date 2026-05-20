import { Database } from 'bun:sqlite'

/**
 * Every value that may appear in the `source` column of `messages`.
 *
 * Outbound callers are constrained to `'assistant' | 'system'` (see
 * `OutboundLogInput.source`). The other two land via internal writes:
 * `logInbound` hardcodes `'user'`, and `logEdit` hardcodes `'assistant'`
 * (with an `edited_of` field merged into `metadata`). There is intentionally
 * no `'edit'` source — edits are still authored by the assistant, just
 * marked via metadata so that downstream readers can choose to fold them.
 */
export type MessageSource = 'user' | 'assistant' | 'system'

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
  /**
   * Resolved quoted content for replies (see server-helpers.extractQuoteText).
   * Stored inside the `metadata` JSON column (no schema migration). The store
   * merges these into `metadata` so callers can pass both freely.
   */
  quote_text?: string
  quote_is_manual?: boolean
}

export interface OutboundLogInput {
  ts: number
  chat_id: string
  message_id?: string
  source: Extract<MessageSource, 'assistant' | 'system'>
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
  let disabled = false

  function warn(stage: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`telegram channel: messages-store ${stage} failed: ${msg}\n`)
  }

  return {
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
    logInbound(input: InboundLogInput): void {
      if (!db) return
      try {
        const mergedMeta: Record<string, unknown> = { ...(input.metadata ?? {}) }
        if (input.quote_text != null) mergedMeta.quote_text = input.quote_text
        if (input.quote_is_manual != null) mergedMeta.quote_is_manual = input.quote_is_manual
        const metaJson = Object.keys(mergedMeta).length > 0 ? JSON.stringify(mergedMeta) : null

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
          metaJson,
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
