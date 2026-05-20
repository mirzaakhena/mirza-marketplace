# Track B — `get_message_by_id` Tool — 2026-05-20

Status: **planning / pre-implementation**. Follow-up to the quoted-message
support doc (`2026-05-20-quoted-message-support.md`) Track B option B.1.

## 1. Problem

Track A forwards quoted *text* inline with every inbound message — sufficient
for ~80% of cases. The remaining gaps:

1. **Quoted media (single photo, album, document) without enough caption.**
   Track A gives at most a caption; the agent never sees the photo file
   itself. To "look at this image I quoted from yesterday," the agent needs
   to retrieve the stored attachment path and `Read` it.
2. **References to older un-quoted messages.** "What did you say earlier
   about X?" — the agent has no recall mechanism today.

Both are addressed by exposing the local `messages.db` as a tool the agent
can call on demand.

## 2. Shape

### Tool

`get_message_by_id(chat_id, message_id) → MessageRecord | error`

- **`chat_id`** *(required)*: scopes the lookup. Never optional — refusing
  cross-chat scans is a defense-in-depth boundary even though the DB and
  agent are colocated on the same machine.
- **`message_id`** *(required)*: the Telegram message ID to look up.
- Returns one record or throws (MCP error) when not found.

### Record shape (JSON in tool response)

```ts
{
  chat_id: string
  message_id: string
  source: 'user' | 'assistant' | 'system'
  ts: number                    // epoch ms when logged
  text: string | null
  reply_to: string | null
  user_id: string | null        // null for outbound
  user_name: string | null      // null for outbound
  attachments: unknown[] | null // parsed JSON, structure matches what was logged
  metadata: Record<string, unknown> | null // parsed JSON, includes quote_text/quote_is_manual when set, and media_group_id/message_ids for albums
}
```

The agent can `Read` any `attachments[].path` directly (photos are stored
under `<state>/inbox/`, never cleaned up automatically) or call
`download_attachment(file_id)` for documents that were stored by file_id only.

## 3. Album lookup nuance

Album messages are logged as a **single row** keyed on the first item's
`message_id`. The other items' IDs live in `metadata.message_ids` (JSON
array). When a Telegram user replies to an album, `reply_to_message.message_id`
points to *some* item — usually the first, but not guaranteed.

Lookup strategy in `getMessage`:

1. **Direct hit**: `SELECT * FROM messages WHERE chat_id=? AND message_id=?`
   handles the dominant case (single messages + album replies that target
   the first item).
2. **Album fallback** if step 1 returns nothing:
   `SELECT * FROM messages WHERE chat_id=? AND metadata LIKE '%"<id>"%'`,
   then parse `metadata.message_ids` of each candidate to confirm it
   actually contains the requested ID (avoid false positives from
   substring matches against other metadata fields).

The LIKE scan is bounded — it only fires on cache miss, and per-chat
volume in practice stays small. If perf ever becomes a concern, we can
add a synthetic index column or a separate `album_items` mapping table.

## 4. Error semantics

- **Not found** → throw an MCP `InvalidRequest` (or domain-specific) error
  with message `"no message ${id} in chat ${chat_id}"`. Forces the agent to
  handle absence explicitly rather than silently working with `null`.
- **Store disabled / DB unavailable** → throw with `"messages-store
  unavailable"`. Same code path the existing logging uses for safety.
- **Multiple matches** (theoretically impossible — `(chat_id, message_id)`
  is effectively unique by insertion pattern but the schema doesn't enforce
  it): return the most recent row by `ts DESC` and emit a stderr warning.

## 5. Security / abuse considerations

- The tool only reads from a SQLite file the bot already controls. No new
  attack surface vs. existing logging behavior.
- `chat_id` must be supplied — refuses bare `message_id` lookups so an
  agent confused by prompt injection can't trivially leak content from a
  different chat. Listing chats is out of scope.
- Returned `text` and `metadata.quote_text` are user-controlled content
  (same as inbound messages). The existing MCP instructions warning about
  prompt injection in inbound bodies extends to data fetched through this
  tool.

## 6. Files to touch

- `messages-store.ts`
  - Add `getMessage(chat_id, message_id): StoredMessage | null` to the
    `MessagesStore` interface
  - Implement direct + album-fallback query
  - Parse `attachments` and `metadata` JSON before returning
- `messages-store.test.ts`
  - Direct hit (user message)
  - Direct hit (assistant message)
  - Album reply to first item (direct hit)
  - Album reply to non-first item (fallback succeeds)
  - Not found → null
  - Multi-row safety (insert two rows with same id, return latest)
  - LIKE false-positive guard (substring match on unrelated metadata
    value does not return that row)
- `server.ts`
  - Add `get_message_by_id` tool descriptor to `ListToolsRequestSchema`
    handler
  - Add CallTool branch dispatching to `messagesStore.getMessage`
  - Update instructions text to mention the tool, when to call it, and the
    prompt-injection caveat for returned content
- `docs/2026-05-20-get-message-by-id.md` *(this file)*

## 7. Non-goals (v1)

- Listing or searching messages (no `list_messages`, no full-text search)
- Cross-chat retrieval
- Edit history (already stored as separate rows; future tool could expose
  them; not in scope now)
- Pre-install history (the bot can only return what it has logged)
