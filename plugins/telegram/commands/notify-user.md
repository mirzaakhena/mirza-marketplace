---
description: Send a Telegram message to the project's primary user, driven by a free-form brief (not literal text). Used by external triggers — schedulers, the mirza-cc wrapper, or other plugins — that need to nudge the user via Telegram when there is no inbound message to reply to.
argument-hint: "<free-form brief describing what to tell the user>"
allowed-tools:
  - mcp__plugin_telegram_telegram__reply
  - Read
  - Bash
---

# /notify-user — Whisper from a third party to the Telegram user

This command is **not** a response to an inbound user message. It is invoked by an external trigger (scheduler firing, mirza-cc wrapper after a session event, another plugin requesting a nudge) when there is no `<channel>` block in context to anchor a reply on. The trigger hands you a brief; you turn that brief into a natural Telegram message and send it.

Arguments passed: `$ARGUMENTS`

## What $ARGUMENTS is

$ARGUMENTS is a **brief**, not the literal text of the message. Treat it as a one-line instruction from a third party telling you what the user needs to be told. You construct the actual wording.

Examples:

- `/notify-user reminder meeting at 3pm` → you might send: *"⏰ Heads-up, meeting at 3pm — all set?"*
- `/notify-user deployment done, check the log at /tmp/deploy.log` → *"✅ Deployment finished. Log is at `/tmp/deploy.log` if you want to review."*
- `/notify-user fresh session ready, ask the user what to work on next` → *"🆕 Fresh session is ready. What should we tackle next?"*

If `$ARGUMENTS` is empty or whitespace-only, this was a hand-fired test with no payload — end without sending anything.

## Steps

1. **Resolve target chat_id from access.json.**
   - The plugin's state dir is `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram/`. `CLAUDE_PROJECT_DIR` is set by Claude Code in this session's env.
   - Use Bash: `cat "$CLAUDE_PROJECT_DIR/.claude/channels/telegram/access.json"` (or Read with the same absolute path) to load the file.
   - Parse JSON. The target `chat_id` is the **first entry** in `allowFrom` (a numeric user id stringified). For Telegram DMs, `chat_id == user_id`, so `allowFrom[0]` is the project's primary recipient.
   - If the file does not exist, `allowFrom` is missing, or `allowFrom[]` is empty: **there is no one to notify**. End without sending. Do not error noisily — this is an expected state on a fresh, unpaired install.

2. **Construct the message text from the brief.**
   - Language: match the user's preferred language; keep the tone casual. Stay short — one or two short paragraphs at most; Telegram is glanced at on a phone.
   - Interpret the brief, don't translate it. Add a light tone-marker emoji if it fits; skip if it doesn't.
   - **Do not invent facts** that aren't in the brief. If the brief is vague ("notify user"), keep the message vague too — don't fabricate context to make it look richer.
   - Do not append your own commentary, sign-off, or follow-up question unless the brief asks for one.

3. **Call `mcp__plugin_telegram_telegram__reply`** with:
   - `chat_id`: the value from step 1.
   - `text`: the message from step 2.
   - `source`: `"system"` — this is wrapper/external-driven, **not** a reply to a user message. The plugin's messages-store uses this flag to distinguish system pings from assistant replies.
   - Do **not** pass `reply_to`. There is no inbound message to thread under.

4. **End your response.** Do not start any other work. The trigger that fired this command does not expect a continuation — the user's next message (if any) starts a normal turn.

## Failure modes

- `access.json` unreadable or invalid JSON → end without sending; surface a one-line error in your response for the operator's log. Do not retry.
- `allowFrom` empty or absent → end silently. This is expected before pairing.
- `reply` tool errors (chat not allowlisted, network blip, rate limit) → surface the error briefly and end. The trigger does not retry; do not try to compensate by sending alternative messages or reading earlier context.
- `$ARGUMENTS` empty → end without sending (hand-fired smoke test).

## Why source: "system"

The telegram plugin tags outbound messages so its conversation log can distinguish *assistant* replies (in-context responses) from *system* pings (external pushes). Mislabeling a system ping as an assistant reply pollutes that distinction and confuses future cross-session recall.
