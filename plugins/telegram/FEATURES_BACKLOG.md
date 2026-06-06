# Features Backlog — Telegram Plugin

Backlog of features being considered for adoption from the `personal-ai-assistant` project (`C:\Users\Mirza\workspace\personal-ai-assistant`) into the telegram plugin in this marketplace.

> **Design principle**: Every feature must be **modular & standalone** — it can be turned on/off without breaking the others. The plugin stays a *channel adapter* (the bridge between Telegram and Claude Code), not an AI engine. AI/decision logic stays on the Claude Code session side.

## Status Legend

| Tag | Meaning |
|-----|------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Implemented |
| `[-]` | Decided to drop (see reason) |

## Quick Summary

- **Tier 1 — Direct adoption (fits the plugin)**: 11 features
- **Tier 2 — Adaptation required**: 5 features
- **Tier 3 — Out of scope (better elsewhere)**: 6 features (already marked `[-]`)
- **Future ideas**: 5 extra ideas

---

## Recommended Development Order (by Impact)

Unlike the tiers (which are basically about technical fit), this order is based on **impact to the user experience**. Working mode: one feature per session, finish it fully, pause for review, then move on.

### Worthwhile to develop (high impact)

| # | Feature | Why this order |
|---|-------|----------------|
| 1 | **T1.11 — Raw conversation logging** | The core foundation. Without it, cross-session recall is impossible. The user explicitly called this out as a core need. |
| 2 | **T1.10 — Album / media group batching** | The user explicitly called this a pain point. Without it, multi-image is processed sequentially — token-heavy and messy responses. |
| 3 | **T1.7 — Multi-message array delivery** | More natural replies (pauses between bubbles) — immediately felt in the chat UX. |
| 4 | **T1.3 — Quoted message extraction** | Without it, replying to an old message makes Claude lose context — real friction every time you quote-reply. |
| 5 | **T1.5 — Realistic typing indicator** | "Feels alive". Small but immediately noticeable in the chat experience. |
| 6 | **T1.2 — Document/PDF inbound** | Expands modality (beyond text+image). The implementation pattern already exists in the photo handler. |
| 7 | **T1.1 — Voice transcription** | High value if the user voices often. Worth doing after a few preprocessing steps exist (synced with T2.3). |

### Nice to have (medium impact, do after the core)

- **T1.6 — Per-user FIFO queue**: silent reliability — important once T1.7 is running (multi-message is race-prone).
- **T1.9 — Reaction event inbound**: non-verbal feedback loop, situational.

### Defensive / polish (low priority)

- **T1.4 — Dedup cache**, **T1.8 — Pause-before-typing**, **T2.4 — MarkdownV2 escape**: do them when there's time or when a concrete bug appears.

### Defer

- **All of Tier 2** except the preprocessing pipeline part (T2.3), which only becomes meaningful after 4-5 Tier 1 features are done.
- Tier 3 is already explicitly dropped.

### Suggested starting point

**Start with T1.11** — it also forces resolving two pending decisions (per-chat DB vs single DB, SQLite vs JSONL) that will become the foundation for future observability/recall features. Once T1.11 is done, T1.10 is the logical next step because it stands alone and its impact is immediately felt.

---

## Tier 1 — Direct Adoption Candidates

Features that are directly relevant to a channel-adapter plugin and don't duplicate Claude Code capabilities.

### Inbound Message Processing

- [ ] **T1.1 — Voice transcription** for voice/audio messages
- [ ] **T1.2 — Document/PDF inbound handling** (currently text + photo only)
- [ ] **T1.3 — Quoted message context extraction** (when the user replies to another message, include its context)
- [ ] **T1.4 — Inbound message dedup cache** (LRU 1000-entry, avoid double-processing when polling overlaps)
- [x] **T1.10 — Album / media group batching** (user sends multiple images at once → processed as 1 batch, not one by one) — implemented. Spec: `docs/superpowers/specs/2026-05-16-t110-album-batching-design.md`. Plan: `docs/superpowers/plans/2026-05-16-t110-album-batching.md`.

### Outbound Message Quality

- [ ] **T1.5 — Realistic typing indicator** (typing duration computed from message length, 30ms/char, range 1-8s)
- [ ] **T1.6 — Per-user FIFO message queue** (prevent race conditions when two messages arrive close together)
- [ ] **T1.7 — Multi-message array delivery** (Claude can send 2-3 separate messages with natural pauses, instead of one wall of text)
- [ ] **T1.8 — Pause-before-typing** (a silent delay before the typing indicator appears, for reflective/thoughtful messages)
- [ ] **T1.12 — Outbound media group / album** (Claude replies with multiple files → send as 1 visual album via `sendMediaGroup`, not N separate messages)

### Reactions

- [ ] **T1.9 — Reaction event inbound** (notify Claude when the user reacts to a bot message, for a feedback loop)

### Persistence & State

- [x] **T1.11 — Raw conversation logging** (record all user/assistant/system conversation to local storage — the foundation for cross-session recall)

---

## Tier 2 — Adaptation Required

Features whose concept is good, but whose scope needs to be rethought so it doesn't violate the plugin architecture.

- [ ] **T2.1 — Per-channel lightweight state** (persona, language, timezone, nickname) as an option in `access.json` or a separate file. Not a full memory store, only a contextual hint sent to Claude on each inbound message.
- [ ] **T2.2 — Read-only monitoring dashboard** (a small HTTP server to view status: pending pairings, recent inbounds, errors). Scope: plugin state only, not user data.
- [ ] **T2.3 — Inbound preprocessing pipeline** (hook system: text → transcribe → translate → enrich, before sending to MCP). Foundation for other features.
- [ ] **T2.4 — MarkdownV2 safety helper** (auto-escape Telegram special characters, avoid formatting errors)
- [ ] **T2.5 — Group chat enhancements** (handle quoted-self, reply chain awareness, thread-aware mentions)

---

## Tier 3 — Out of Scope (Drop or Move Elsewhere)

Features that exist in `personal-ai-assistant` but are **not appropriate** to fold into the telegram plugin. This list is explicitly dropped with reasons, so we don't revisit later.

- [-] **T3.1 — Persistent memory system** (profile, knowledge, journal, preferences, tasks, ledger). **Reason**: Not a channel adapter's job. Ideally a **separate plugin/MCP server** (e.g. a `personal-memory` plugin) usable from any channel. Mixing it in would bloat the telegram plugin and make it non-reusable.
- [-] **T3.2 — Cronjob scheduling tools**. **Reason**: Already available via the `/schedule` skill in superpowers + native Claude Code scheduling. A duplicate would confuse users.
- [-] **T3.3 — AI engine / wake-up briefing / system prompt assembly**. **Reason**: That's the Claude Code session's job, not the plugin's. The plugin only forwards the message + context tag.
- [-] **T3.4 — Token & cost tracking, status bar**. **Reason**: Already exists at the Claude Code level (`/status`).
- [-] **T3.5 — Multi-gateway abstraction (Console/Telegram/Slack switcher)**. **Reason**: Over-engineering for a single-channel plugin. If you want Slack, build a separate `slack` plugin with the same pattern.
- [-] **T3.6 — Skill writing/archiving tools (`write_skill`, `archive_skill`)**. **Reason**: Already built into Claude Code via Read/Write tools and `superpowers:writing-skills`.

> **Note**: The old item "T3.7 — Search messages history" was moved out of Tier 3. Its drop premise was wrong (I assumed source = Telegram API, when what the user actually needs is **local** storage). Its storage layer now lives in [T1.11 — Raw conversation logging](#t111--raw-conversation-logging). The search mechanism will be discussed separately once T1.11 is running.

---

## Future Ideas (beyond personal-ai-assistant)

Extra ideas that came up during exploration — not from the old project, but worth considering.

- [ ] **F1 — Edit-tracking inbound** (notify Claude when the user edits an already-sent message)
- [ ] **F2 — Forwarded message handling** (preserve original sender info)
- [ ] **F3 — Sticker support** (sticker → emoji name + image for Claude)
- [ ] **F4 — Location/contact handling** (user shares a location → forward as metadata)
- [ ] **F5 — Long-running task progress updates** (Claude triggers interim "still working..." via `edit_message`, with automatic rate-limiting)

---

## Per-Feature Detail (Tier 1 & Tier 2)

This section holds references to the old implementation + implementation options for this plugin. You don't have to read it all at once — open the section relevant when you're about to implement.

### T1.1 — Voice transcription

- **Old project reference**: Not in personal-ai-assistant (it doesn't have it yet either). But the hook pattern in `bot.on('message:voice')` is easy to add.
- **Plugin context**: Currently `bot.on()` only handles `message:text` and `message:photo` (server.ts). Voice messages are silently skipped.
- **Implementation options**:
  - **A**: Use the OpenAI Whisper API (needs an extra API key, high quality).
  - **B**: Use Claude's audio capability directly (send audio as an attachment, let Claude transcribe it itself).
  - **C**: Local whisper.cpp (offline, no API key, but heavy setup).
- **Recommendation**: Option B fits the plugin philosophy best (Claude handles it).

### T1.2 — Document/PDF inbound handling

- **Old project reference**: `src/utils/media.ts` — MIME type validation, base64 encoding, 30MB max for PDF.
- **Plugin context**: The `download_attachment` MCP tool already exists. Just extend `bot.on()` for `message:document` and auto-include it in the channel notification.
- **Note**: The photo flow (`image_path` attribute) is already a template — just duplicate it for documents.

### T1.3 — Quoted message context extraction

- **Old project reference**: `src/utils/prompt.ts` — extracts `reply_to_message` and formats it into XML context.
- **Plugin context**: Currently the quoted reply is not forwarded. We can add a `reply_to_text="..."` attribute to the `<channel>` tag.

### T1.4 — Inbound message dedup cache

- **Old project reference**: `src/gateway/telegram.ts` — LRU cache, 1000-entry, key = `${chatId}:${messageId}`.
- **Plugin context**: Bot polling can sometimes overlap (especially after a 409-conflict restart). A dedup cache prevents double-triggering the MCP notification.

### T1.5 — Realistic typing indicator

- **Old project reference**: `src/gateway/telegram.ts` — `simulateTyping(text)`: 30ms/char, clamp 1-8s.
- **Plugin context**: The `reply` tool currently sends immediately. We can add an optional `typing_duration_ms` parameter or auto-calculate from text length.

### T1.6 — Per-user FIFO message queue

- **Old project reference**: `src/utils/queue.ts` — a Promise-chained per-user lock.
- **Plugin context**: The plugin currently handles async in parallel. If Claude sends 3 replies quickly, the order can swap. A per-chat_id queue guarantees order.

### T1.7 — Multi-message array delivery

- **Old project reference**: `src/tools/message.ts` — `send_message({messages: [text1, text2, ...]})` with pauses between messages.
- **Plugin context**: Update the `reply` tool to accept `text: string | string[]`. More natural for conversation.

### T1.8 — Pause-before-typing

- **Old project reference**: `src/tools/message.ts` — a `pauseBeforeTyping` parameter (silence before the typing indicator).
- **Plugin context**: Useful for reflective messages. Could be optional in the `reply` tool.

### T1.9 — Reaction event inbound

- **Old project reference**: `src/db/reactions.ts` + `bot.on('message_reaction')` in the telegram gateway.
- **Plugin context**: The plugin can currently only **send** reactions (the `react` tool). It doesn't yet forward the reaction events the user gives to the bot. Useful for non-verbal confirmation.

### T1.10 — Album / media group batching

- **Old project reference**: Already supported in `personal-ai-assistant` — multiple images in one album are processed all at once, not sequentially.
- **Plugin context**: Telegram sends an album as **multiple separate updates** with the same `media_group_id`, arriving within a window of a few hundred ms. The plugin currently triggers an MCP notification per image → Claude reads and responds one by one (wasteful + unnatural).
- **Implementation options**:
  - **A**: Buffer per `media_group_id` with a 500-800ms debounce. Once the window closes, send a single notification with an `image_paths` array.
  - **B**: Send incrementally but tag `media_group_id` in the channel attribute, letting Claude group them itself. More complex on the Claude side, simpler in the plugin.
- **Recommendation**: Option A — semantic batching should ideally be transparent to Claude.
- **Note**: The `<channel>` tag format needs to support `image_paths` (plural). Backward compat: still send `image_path` (singular) for a single image.

### T1.12 — Outbound media group / album

- **Plugin context**: The `reply` tool currently accepts `files: string[]` and sends **per file** via `sendPhoto`/`sendDocument` in `server.ts:582-595`. As a result, if Claude replies with 3 images, the user sees 3 separate messages in Telegram (not 1 visual album).
- **Goal**: combine multiple outbound files into 1 album via `bot.api.sendMediaGroup()` with `InputMediaPhoto[]` / `InputMediaDocument[]`.
- **Telegram constraints**:
  - Album cap = 10 items.
  - Mixed photo + document is **not allowed** in 1 `sendMediaGroup` — must be split per type.
  - A caption can only be attached to the **first item** of the group; the rest are ignored by the client.
  - Reply threading (`reply_parameters`) applies to the whole album, not per item.
- **Trade-offs**:
  - 1 file → keep using `sendPhoto`/`sendDocument` (sendMediaGroup is overkill).
  - 2+ photos → sendMediaGroup.
  - 2+ documents → sendMediaGroup.
  - Mixed photo + document → 2 separate calls (1 photo album + 1 document album), or fall back to the existing per-file delivery.
- **Logging impact** (interacts with T1.11): `sendMediaGroup` returns an array of message_id. Log 1 row per album (mirror inbound T1.10) or N rows per file? Prefer 1 row per album, attachments[] matching the contents, message_id = first, metadata.message_ids[].
- **Out of plan T1.10**: split into T1.12 so inbound can ship without waiting on the outbound design.

### T1.11 — Raw conversation logging

- **Old project reference**: `src/db/message.ts` (better-sqlite3 + FTS5). Schema: timestamp, sender (user/assistant/system), gateway, chat_id, message_id, text, media flag, raw payload.
- **Plugin context**: The plugin has natural access to every flow:
  - **Inbound**: in `handleInbound()` before the gate decision.
  - **Outbound (assistant)**: in the `reply` MCP tool.
  - **Outbound (system)**: a reply triggered by cronjob/API trigger also goes through the same `reply` tool → automatically recorded. Source is distinguished by a flag (e.g. a `triggered_by: 'cron' | 'user'` param or a heuristic via context).
- **Main goal**: The user can recall old conversations from a new session ("yesterday we discussed X, let's continue"). Currently, after a new session, context is lost entirely.
- **Proposed minimal schema**:
  ```sql
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,           -- unix ms
    chat_id TEXT NOT NULL,
    message_id TEXT,                -- Telegram message_id (null for system events)
    source TEXT NOT NULL,           -- 'user' | 'assistant' | 'system'
    text TEXT,
    attachments TEXT,               -- JSON array of file paths/types
    metadata TEXT                   -- JSON: triggered_by, reply_to, edited_at, etc
  );
  ```
- **Storage options**:
  - **A**: SQLite (better-sqlite3 or Bun's built-in `bun:sqlite`). Future-proof for FTS5.
  - **B**: JSONL append-only at `<project>/.claude/channels/telegram/messages.jsonl`. Simple, but search later requires loading everything.
- **Recommendation**: SQLite via `bun:sqlite` (zero dependency, native in Bun). Schema-less mode at first (text + JSON metadata), add index/FTS later.
- **File location**: `<project>/.claude/channels/telegram/messages.db` (or per-chat: `messages/<chatId>.db` if you want per-chat isolation).
- **Explicitly DEFERRED scope**: the search/recall mechanism (an MCP `search_messages` tool, dashboard query, etc). This item is **storage only for now**, per the user's instruction.
- **Pending decision**: per-chat DB vs single DB. Per-chat is cleaner (easy per-user delete, no cross-leak), single DB makes cross-chat search easier later.

### T2.1 — Per-channel lightweight state

- **Old project reference**: `src/db/profile.ts` (7 attributes), `src/core/wake-up.ts` (auto-inject).
- **Plugin context**: Can be stored at `<project>/.claude/channels/telegram/state/<userId>.json` (timezone, nickname, language hint). Auto-attach as an attribute on the `<channel>` tag so Claude has context without having to ask each time.
- **Trade-off**: Starts to overlap with the "memory system" (T3.1). Keep it strictly bounded: contextual hints only, not history/knowledge.

### T2.2 — Read-only monitoring dashboard

- **Old project reference**: `src/dashboard/` — Express HTTP server, bearer token auth, optional TLS.
- **Plugin context**: Scope narrowed: plugin status only (pending pairings, recent inbound count, error log, polling state). Does not expose user content.
- **Consideration**: Could be skipped entirely — `tail -f` on the log may already be enough. Postpone until there's a clear need.

### T2.3 — Inbound preprocessing pipeline

- **Old project reference**: Not explicit, but the async pattern in the gateway makes it possible.
- **Plugin context**: A hook chain like `inbound → [transcribe?, translate?, enrich?] → notify`. Foundation for other features (T1.1 voice, F3 sticker, etc). Worth doing **before** many preprocessing features.

### T2.4 — MarkdownV2 safety helper

- **Old project reference**: None (the old project used plain text).
- **Plugin context**: Currently `format: 'markdown'` in the `reply` tool easily errors if the text contains `_`, `*`, `[`, etc that aren't escaped. An `escapeMarkdownV2(text)` helper prevents the crash.

### T2.5 — Group chat enhancements

- **Old project reference**: None (the personal-ai-assistant gateway was DM-focused).
- **Plugin context**: Group support already exists (mention detection in `access.json.groups`). What could be added: detect whether the bot was quoted vs mentioned, distinguish reply-to-bot vs new-topic.

---

## Implementation Notes

- **Each feature should ideally be a separate PR/commit** to make reverting easier.
- **The test plan must include**: behavior with the feature ON and OFF (modularity).
- **Backward compat**: existing users with an old `access.json` must not break.
- **Settings**: new options are added to the `access.json` schema (or a new `behaviors.json` config file if they grow numerous).

## Update Log

- **2026-05-15** — Initial backlog from exploring `personal-ai-assistant`. No items started yet.
- **2026-05-15** — Added T1.10 (album/media group batching) and T1.11 (raw conversation logging) based on user input. T3.7 (search messages) revised: storage layer moved to T1.11, the search mechanism deferred to a separate discussion.
- **2026-05-15** — Added the "Recommended Development Order (by Impact)" section. Working mode agreed: 1 feature per session, deep focus. Suggested starting point: T1.11.
- **2026-05-15** — T1.11 done. Module `plugins/telegram/messages-store.ts` + integration in `server.ts` (handleInbound, reply tool, edit_message tool). The `reply` tool gained an optional `source` param. Disable via `TELEGRAM_DISABLE_MESSAGES_STORE=1`. Spec: `docs/superpowers/specs/2026-05-15-t111-conversation-logging-design.md`.
- **2026-05-16** — T1.10 design spec ready: `docs/superpowers/specs/2026-05-16-t110-album-batching-design.md`. Decision: Option A (plugin buffer), 400ms debounce / 3000ms hard cap / 10 max items, photo + document only, 1 row per album. Added T1.12 (outbound media group via `sendMediaGroup`) as a new item — out of plan T1.10.
- **2026-05-16** — T1.10 done. Module `plugins/telegram/album-buffer.ts` (generic, 8 unit tests) + integration in `server.ts` (photo & document handler routing, handleInboundAlbum, shutdown drain). An album = 1 row in messages.db with `metadata.media_group_id` + `metadata.message_ids[]`. Extra MCP meta: `image_paths[]`, `attachments[]`, `media_group_id`. Manual smoke pending user verification.
