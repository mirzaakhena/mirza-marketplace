# Quoted-Message Support — 2026-05-20

Status: **planning / pre-implementation**. Captures the problem, the two
proposed tracks, and open questions to lock before coding.

## 1. Problem

When a Telegram user replies to a previous message (with or without quoting
a portion), the AI agent receives the new text but **not** the content of
the message being quoted. The inbound notification meta currently includes
only `reply_to: <message_id>` — a bare numeric ID with no payload.

Symptom (chat 2026-05-19): user replied with a partial-quote selection
("Ini..") and the agent had no way to know what "Ini.." referred to. It
guessed wrong.

Code sites where the drop happens:

| Location | What's forwarded today |
|----------|------------------------|
| `server.ts:1665–1700` (`handleInbound`) | `meta.message_id`, no quote field |
| `server.ts:1525–1570` (album handler) | same — `firstCtx.message?.reply_to_message?.message_id` only |
| `messages-store.ts:15–25` (`InboundLogInput`) | `reply_to` column stores bare ID |

What Telegram actually sends us (grammy `@grammyjs/types`):

- `ctx.message.reply_to_message?: Message` — full original message object
  (has `.text`, `.caption`, `.photo`, etc.) whenever the user replies
- `ctx.message.quote?: TextQuote` — only present when user manually
  highlighted a portion. Shape: `{ text, entities?, position?, is_manual? }`
- `ctx.message.external_reply?: ExternalReplyInfo` — replies pointing at a
  message in another chat (rare; skip for v1)

So the data is available — we just throw it away.

## 2. Two tracks proposed

### Track A — Inline `quote_text` in notification meta *(do this first)*

Pass the quoted content to the agent **with every inbound message**, no
extra tool call required.

**Selection rule** (most specific wins):

1. `ctx.message.quote.text` — user manually selected a portion
2. `ctx.message.reply_to_message.text` — full-message text reply
3. `ctx.message.reply_to_message.caption` — reply to a media message with caption
4. else → no `quote_text` field

**Meta fields added:**

```
quote_text         the resolved quoted content (any of 1–3 above)
quote_is_manual    "true" if from message.quote (partial selection), else "false"
                   (only emitted when quote_text is also present)
```

Existing `reply_to: <message_id>` stays as-is for threading purposes.

**Files to touch:**

- `server.ts` — `handleInbound` and album handler: build `quote_text`
  helper, splice into `mcp.notification` meta
- `server.ts` — MCP `instructions` text (line ~448): tell the agent that
  inbound channel tags may carry `quote_text` and to treat it as the
  reference context for the user's message
- `messages-store.ts` — extend `InboundLogInput` to accept
  `quote_text?: string` and persist via the existing `metadata` JSON column
  (no schema migration needed; column already exists)
- `server-helpers.ts` — pure helper `extractQuoteText(message)` so we can
  unit-test the precedence rules in isolation
- Tests:
  - `server-helpers.test.ts` — quote.text wins over reply_to_message.text;
    reply_to_message.caption fallback; no quote → undefined; album cases
  - `messages-store.test.ts` — quote_text round-trips through metadata

**Rationale for inline-first:** when a user quotes, they almost always need
the agent to *see* what they're referring to in order to respond. Forcing
an extra tool call adds latency and cost for the universal case.

### Track B — `get_message_by_id` tool *(follow-up, separate decision)*

A tool the agent can call to fetch arbitrary historical messages by ID.
Orthogonal to Track A: useful when the user references an *old* message
that isn't quoted (e.g. "what did you say earlier about X?").

**Implementation options:**

#### B.1 — Read from local `messages-store` (RECOMMENDED)

- Already have a SQLite DB indexed on `(chat_id, message_id)`
- Returns text, source, attachments, reply_to, metadata for any logged
  message
- Limitation: only messages the bot has *seen* since DB init — pre-existing
  Telegram history is not retrievable
- Pros: zero new dependency, instant, no Bot API quota burned, works
  offline-from-Telegram (DB is local)
- Cons: gap for the very first install or after `messages.db` deletion

#### B.2 — Read via Telegram Bot API

- **Not directly possible.** The Bot API has no `getMessage(id)` method.
  Bots can only see messages via `getUpdates`/webhook (each delivered once)
  or by being members of the chat at send time
- The only API trick is `forwardMessage` / `copyMessage` from chat to chat,
  which would actually forward the message — visible side effect, not
  acceptable for a "read" tool
- Verdict: **infeasible** as a clean read path

#### Decision

Go with B.1 if Track B is built at all. There is no realistic API-based
alternative; the SQLite store is the only source of truth the bot
controls.

**Open question (Track B):** is Track B actually needed once Track A
ships? Track A covers the dominant case (quoted reply). Track B's
remaining value is "agent autonomously recalls older context" — useful but
not blocking. Recommend deferring B until a concrete need surfaces.

## 3. What might be missing — open questions

Things worth deciding before implementing Track A:

1. **Album reply target.** When a user replies to a *photo album*,
   `reply_to_message` points to the first item only. Should we expose just
   that, or try to resolve the full album via `media_group_id`? (For v1:
   just first item — matches outbound behavior.)

2. **Replies to bot's own messages.** Currently `isOurOwnBridge`
   short-circuits some cases. Does that path still produce a `quote_text`?
   Probably should — user quoting the agent's reply is a common case
   ("about *this* part you said…"). Verify in tests.

3. **Replies to media without caption.** If user replies to a bare photo,
   `quote_text` would be undefined. Should we synthesize a placeholder like
   `[photo]` so the agent knows *something* was quoted? Or leave silent
   and rely on `reply_to` being present? Recommend: leave silent — meta
   stays minimal, agent can infer from `reply_to` presence.

4. **Truncation / size.** Telegram messages cap at 4096 chars; quotes at
   1024. No truncation needed, but worth noting that `quote_text` is
   bounded.

5. **Logging shape.** Store `quote_text` and `quote_is_manual` inside the
   existing `metadata` JSON, or promote `quote_text` to a real column? For
   now: JSON metadata. Promote later if we add a "search messages by quote
   content" feature.

6. **Instructions update wording.** The MCP `instructions` string already
   warns about prompt-injection risk for pairing approval. We should
   similarly note that `quote_text` is user-controlled content and should
   be treated as data, not as authoritative instructions.

7. **`external_reply` support.** Skip for v1. Document as "not handled".

## 4. Sequencing

1. Land Track A (this doc's main proposal). Small, additive, no schema
   churn, immediate user value.
2. Observe whether users hit cases that demand Track B. If yes, build B.1
   as a separate PR with its own design doc.

## 5. Non-goals

- Searching message history by content (would need full-text index)
- Cross-chat history (`external_reply`)
- Editing the quote-display behavior of outbound `reply` (Telegram clients
  render the quote thread natively from `reply_parameters.message_id`;
  nothing changes outbound)
