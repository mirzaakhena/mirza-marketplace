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

/**
 * A row returned by `getMessage`. `attachments` and `metadata` are parsed
 * back into structured values (vs. the raw JSON text stored in the DB).
 */
export interface StoredMessage {
  chat_id: string
  message_id: string
  source: MessageSource
  ts: number
  text: string | null
  reply_to: string | null
  user_id: string | null
  user_name: string | null
  attachments: unknown[] | null
  metadata: Record<string, unknown> | null
}

export interface MessagesStore {
  init(): void
  logInbound(input: InboundLogInput): void
  logOutbound(input: OutboundLogInput): void
  logEdit(input: EditLogInput): void
  /**
   * Look up a single message by `(chat_id, message_id)`. Returns the row with
   * `attachments` and `metadata` already JSON-parsed, or `null` when not
   * found. Album items 2..N — whose IDs are stored only inside
   * `metadata.message_ids` of the album's first-item row — are resolved via a
   * fallback scan; see docs/2026-05-20-get-message-by-id.md for the rationale.
   */
  getMessage(chat_id: string, message_id: string): StoredMessage | null
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

interface RawRow {
  chat_id: string
  message_id: string
  source: string
  ts: number
  text: string | null
  reply_to: string | null
  user_id: string | null
  user_name: string | null
  attachments: string | null
  metadata: string | null
}

function safeParseArray(json: string): unknown[] | null {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : null
  } catch { return null }
}

function safeParseMetadata(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
  } catch { return null }
}

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
    getMessage(chat_id: string, message_id: string): StoredMessage | null {
      if (!db) return null
      try {
        // Step 1 — direct hit on (chat_id, message_id). Latest row wins if
        // duplicates were ever inserted (edits, replays). Order by ts DESC.
        let row = db.prepare(
          `SELECT chat_id, message_id, source, ts, text, reply_to,
                  user_id, user_name, attachments, metadata
             FROM messages
            WHERE chat_id = ? AND message_id = ?
            ORDER BY ts DESC
            LIMIT 1`,
        ).get(chat_id, message_id) as RawRow | null

        // Step 2 — album fallback. Album rows are keyed on the first item's
        // message_id; other items' IDs live only in metadata.message_ids.
        // Substring-LIKE narrows candidates; then we parse and verify to
        // avoid false positives (e.g. the digit sequence happens to appear
        // inside some unrelated metadata value).
        if (!row) {
          const needle = `"${message_id}"`
          const candidates = db.prepare(
            `SELECT chat_id, message_id, source, ts, text, reply_to,
                    user_id, user_name, attachments, metadata
               FROM messages
              WHERE chat_id = ? AND metadata IS NOT NULL AND metadata LIKE ?
              ORDER BY ts DESC`,
          ).all(chat_id, `%${needle}%`) as RawRow[]

          for (const cand of candidates) {
            const parsed = safeParseMetadata(cand.metadata)
            const ids = parsed?.message_ids
            if (Array.isArray(ids) && ids.some(v => String(v) === message_id)) {
              row = cand
              break
            }
          }
        }

        if (!row) return null
        return {
          chat_id: row.chat_id,
          message_id: row.message_id,
          source: row.source as MessageSource,
          ts: row.ts,
          text: row.text,
          reply_to: row.reply_to,
          user_id: row.user_id,
          user_name: row.user_name,
          attachments: row.attachments ? safeParseArray(row.attachments) : null,
          metadata: safeParseMetadata(row.metadata),
        }
      } catch (err) {
        warn('read', err)
        return null
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
