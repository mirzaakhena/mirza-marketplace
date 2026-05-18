---
description: Send a Telegram notification that the current Claude Code session is ready. Triggered by the mirza-cc wrapper after a /clear so the user knows the new session is live.
allowed-tools:
  - mcp__plugin_telegram_telegram__reply
---

# /notify-user — Tell the Telegram user the session is fresh

This command is fired by the mirza-cc wrapper immediately after a `/clear` lands, so it always runs in a **freshly cleared** Claude Code session with no prior context.

Steps:

1. Look at the most recent inbound Telegram `<channel>` block in your context to find a `chat_id`. If there is no Telegram channel context available (e.g., you are running CC standalone outside the wrapper-orchestrated flow), do nothing and end.

2. Send a single short Telegram reply via `mcp__plugin_telegram_telegram__reply`:
   - text: a brief friendly message like `"✨ Fresh session siap. Ada yang bisa saya bantu?"`
   - chat_id: the value you found in step 1
   - source: `"system"` (this notification is triggered by the wrapper, not by a user message)

3. End your response. Do not start any other work. Wait for the user's next message.

Guidance for tone:

- Indonesian, casual, short.
- Mix it up — vary the phrasing between runs so it doesn't get robotic. Examples:
  - "✨ Fresh session siap. Ada yang bisa saya bantu?"
  - "👋 Halo lagi, session baru sudah ready. Gimana?"
  - "🆕 Bersih. Siap topik berikutnya."
  - "🔄 Cleared. Mau lanjutin yang mana?"

If you are not sure whether the wrapper just cleared the session (e.g., this command was triggered by hand for testing), just send the brief notification anyway — it's harmless.
