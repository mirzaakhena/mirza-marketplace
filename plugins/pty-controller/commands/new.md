---
description: Clear the current Claude Code session and start fresh. Routes through the mirza-cc wrapper so the clear happens at the PTY level rather than relying on AI-internal state.
allowed-tools:
  - mcp__pty-controller__pty_send_slash
  - mcp__pty-controller__pty_status
  - mcp__plugin_telegram_telegram__reply
---

# /new — Start fresh Claude Code session

Goal: clear the current conversation context cleanly and let the user know a fresh session is ready.

Steps to follow exactly, in order:

1. Call `mcp__pty-controller__pty_status` first. If `wrapper_alive` is `false`, **abort**: reply to the user explaining that the wrapper is not running and they need to launch CC via `mirza-cc` instead of plain `claude`. Do not proceed.

2. If the wrapper is alive: call `mcp__pty-controller__pty_send_slash` with `command: "/clear"`. The tool returns immediately, but the actual `/clear` keystroke fires only after this turn completes (CC consumes its stdin between turns). That is intentional.

3. If the request originated from Telegram (you can tell from the inbound `<channel>` block), send a brief confirmation reply now via the Telegram reply tool — for example "Got it, clearing now. I'll let you know once the session is fresh." — so the user has acknowledgement before the clear takes effect.

4. End your response. Do NOT continue with other work after this. The next thing CC processes will be your `/clear`, after which a fresh session begins.

Notes:

- If `pty_send_slash` returns an error, surface it plainly to the user. Do not retry.
- The follow-up "fresh session is ready" notification is handled by the wrapper invoking `/telegram:notify-user` in the *new* session — not by you. The fully-qualified namespace prefix is required: bare `/notify-user` is "Unknown command" to CC because plugin commands must be invoked as `/<plugin>:<command>`.
