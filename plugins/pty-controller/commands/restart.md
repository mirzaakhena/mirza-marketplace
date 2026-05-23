---
description: Restart Claude Code via the mirza-cc wrapper (kill PTY + respawn with --resume). MCP servers and plugin code reload fresh; the conversation continues seamlessly. Asks for confirmation first because the current AI turn is interrupted.
allowed-tools:
  - mcp__pty-controller__pty_restart
  - mcp__pty-controller__pty_status
  - mcp__plugin_telegram_telegram__reply
---

# /restart — Restart Claude Code (reload MCPs/plugins)

Goal: cleanly restart the entire CC process so MCP servers and plugin code reload from disk, while keeping the current conversation via `--resume`. This interrupts the current AI turn, so we MUST get explicit user confirmation before firing.

Follow these steps in order:

## Step 1 — Probe the wrapper

Call `mcp__pty-controller__pty_status`. If `wrapper_alive` is `false`, abort: reply to the user explaining that the wrapper isn't running, so restart can't be triggered. They'd need to launch CC via `mirza-cc` instead of plain `claude`. Stop.

## Step 2 — Ask the user to confirm

Restart is disruptive — it kills the running PTY, current AI turn ends, and there's a few seconds of downtime. Always confirm first.

**If the `interactive-prompts` skill is available** (listed in the session's available skills), invoke it and render the confirmation as inline-keyboard buttons via the Telegram `reply` tool:

```json
"buttons": [
  [
    {"label": "✅ Restart sekarang", "callback_id": "restart_yes"},
    {"label": "❌ Batalkan", "callback_id": "restart_no"}
  ],
  [
    {"label": "✏️ Jelaskan manual", "callback_id": "manual"}
  ]
]
```

The message body should make the consequences explicit, e.g.:

> "Mau restart Claude Code? Wrapper akan kill PTY dan respawn dengan `--resume` (conversation lanjut, MCP/plugins reload fresh). Turn ini akan terinterupsi, downtime ~beberapa detik."

If `interactive-prompts` is NOT available, ask plainly with text and wait for `ya`/`tidak`.

Then **stop and wait** for the user's reply. Do NOT call `pty_restart` until confirmation arrives.

## Step 3 — Handle the reply

- **`restart_yes`** (or plain `ya`/`lanjut`/`yes`): proceed to Step 4.
- **`restart_no`** (or plain `tidak`/`batal`): acknowledge briefly ("OK, batal restart.") and stop.
- **`manual`** (or free-form): treat the next message as redirect/clarification.

## Step 4 — Fire the restart

1. (If from Telegram) send a short reply via the Telegram tool so the user has acknowledgement before the wrapper kills the PTY — e.g. *"Sip, restarting now. Akan kasih tahu kalau sudah balik."*
2. Call `mcp__pty-controller__pty_restart`. The tool returns immediately; the actual kill+respawn happens after this turn ends.
3. **End your response immediately.** Do NOT do other work after this. The wrapper will kill the PTY shortly and the current turn ceases to exist.

After respawn, the wrapper emits a `session-change` system-outbox event so the Telegram plugin can ping the user that CC is back up (same mechanism as `/clear` and `/switch`).

## Notes

- The conversation continues because the wrapper passes `--resume <latestSessionId>` on respawn. CC reads the existing jsonl, so context is preserved (just like manual `claude --continue`).
- Any background tasks / running commands in the old PTY are killed. If the user has long-running work, warn them in Step 2.
- If `pty_restart` returns an error (e.g. wrapper crashed between Step 1 and Step 4), surface the error plainly. Do not retry.
