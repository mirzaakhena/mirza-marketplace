---
description: Send a Telegram notification that the current Claude Code session is ready. Triggered by the mirza-cc wrapper after a /clear so the user knows the new session is live.
allowed-tools:
  - mcp__plugin_telegram_telegram__reply
---

# /notify-user — Tell the Telegram user the session is fresh

This command is fired by the mirza-cc wrapper immediately after a `/clear` lands, so it always runs in a **freshly cleared** Claude Code session with no prior context. The wrapper passes the target Telegram chat id as an argument because nothing else in the fresh session knows where to send the reply.

Arguments passed: `$ARGUMENTS`

## Steps

1. Treat `$ARGUMENTS` as the target Telegram `chat_id`. Trim whitespace. If it is empty, this command was triggered by hand (e.g. for testing) and there is no one to notify — end without sending anything.

2. Send a single short Telegram reply via `mcp__plugin_telegram_telegram__reply`:
   - `text`: a brief friendly Indonesian-casual confirmation message (vary the phrasing — see Tone below).
   - `chat_id`: the value from `$ARGUMENTS`.
   - `source`: `"system"` (this notification is wrapper-triggered, not a response to a user message).

3. End your response. Do not start any other work. Wait for the user's next message.

## Tone (vary between runs so it doesn't get robotic)

Indonesian, casual, short. Pick one of these or invent something similar:

- "✨ Fresh session siap. Ada yang bisa saya bantu?"
- "👋 Halo lagi, session baru sudah ready. Gimana?"
- "🆕 Bersih. Siap topik berikutnya."
- "🔄 Cleared. Mau lanjutin yang mana?"
- "💫 Reset done. Apa nih?"

## Failure modes

- If the reply tool errors (chat not allowlisted, network blip, etc.), surface the error briefly in your response and end. The wrapper does not retry.
- Do not attempt to "recover" by reading earlier messages — there are none in a fresh session.
