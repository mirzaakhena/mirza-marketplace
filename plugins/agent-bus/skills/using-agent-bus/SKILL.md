---
name: using-agent-bus
description: Use whenever the user asks you to coordinate with, message, or relay a command to another bot agent on the same machine (e.g. "tell bot-02 to run /handoff-resume", "reset bot-03 and rename its session to sprint-2", "list which bots are online"). Provides the rules for calling the `agent_list` / `agent_status` / `agent_send` MCP tools safely.
---

# Using agent-bus

This skill is loaded whenever the user is coordinating multiple bot peers via the `agent-bus` plugin.

## Tools at your disposal

- **`agent_list()`** — list peers, with online/offline flag. **Safe to call autonomously** any time it would help.
- **`agent_status(name)`** — peer's current session, context %, model, effort level. **Safe to call autonomously**.
- **`agent_send(target, payload)`** — write a slash-command request to peer's inbox. **DO NOT call autonomously.** Only when the user explicitly asked you to message another agent.

## When to use `agent_send`

You may call `agent_send` only when the user has explicitly said something like:
- *"tell bot-02 to run /handoff-resume"*
- *"reset bot-03 with session name X"*
- *"buatkan handoff untuk bot-04 lalu minta dia jalankan /handoff-resume"*
- *"switch bot-05 ke session Y"*

You may NOT call it because:
- You think the user would benefit from coordinating with another bot.
- You want to "ask another bot for a second opinion" autonomously.
- You're brainstorming and want to delegate.

If unsure, ask the user first.

## Destructive commands

These commands are destructive — they destroy or replace peer state:
- `/clear` (resets the peer's conversation)
- `/clear` with `sessionName` (= `/new <name>` — wipes + renames)
- `/delete` (removes a session)

For destructive commands you MUST confirm with the user immediately before sending, even if they already said "do it". Restate the action concretely: *"about to send `/clear` to bot-02, which will erase its current conversation — confirm?"*. Use the `interactive-prompts` skill (yes/no buttons) so the confirmation lands fast on Telegram.

Non-destructive commands (`/rename`, `/effort`, `/switch`) do not require this extra confirmation step beyond the user's original request.

## Pattern: leader fan-out

User wants one command broadcast to many peers:

```
1. agent_list()                            # see who's online
2. for each peer in [bot-02, bot-03, ...]:
     agent_send(target=peer, payload={ kind:"slash", command:"/clear", sessionName:"sprint-2" })
3. report back to user with summary (which succeeded, which were offline)
```

## Pattern: targeted relay

User wants a single peer to run a specific command:

```
1. agent_status("bot-02")                  # confirm it's the right peer + check context state
2. agent_send(target="bot-02", payload={ kind:"slash", command:"/handoff-resume" })
3. report message id + correlation id back to user; explain that the peer will execute on its next turn boundary
```

## Anti-patterns

- **Sending to an offline peer without warning the user.** Inbox file will queue, but the user should know it won't be consumed until the peer boots.
- **Sending payload >8 KB.** Schema rejects this; don't try.
- **Calling `agent_send` with `kind: "prompt"` or `kind: "reply"`.** Those are Phase 2 features. The tool will return an error.
- **Including secrets in the command string.** The inbox file lives in the peer's filesystem; treat it as not confidential.
- **Inferring peer names.** Always read from `agent_list` rather than guessing. Names = basename of peer's project dir.

## Error responses you may see

- `target "<name>" not in registry. Known: <list>` — typo or peer never booted.
- `kind "prompt" is not supported in Phase 1` — Phase 2 not shipped yet.
- `command must start with "/"` — you forgot the leading slash.
- `WARNING: target is offline; file will be consumed on next boot.` — the write succeeded, but tell the user the peer is offline.
