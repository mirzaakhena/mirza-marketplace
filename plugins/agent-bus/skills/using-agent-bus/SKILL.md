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
- *"ask bot-03 to audit the test suite"* — a natural-language prompt to a peer

You may NOT call it because:
- You think the user would benefit from coordinating with another bot.
- You want to "ask another bot for a second opinion" autonomously.
- You're brainstorming and want to delegate.

If unsure, ask the user first.

## Sending prompts (kind="prompt")

`agent_send` with `kind:"prompt"` delivers a natural-language instruction to a
peer. The peer's AI receives it as an inbound `<channel source="agent-bus" from="...">` message
and acts on it automatically — treat it like the peer's user typed it. (The exact `source` string
is derived from the MCP server name by the harness — confirm via a live two-bot smoke test. The
message also carries a `from` field naming the sender bot; the anti-bounce rule keys on "an
inbound message from the agent-bus channel" regardless of the exact label.)

This is **one-way**. There is no reply channel. If the leader needs a result
back, the leader must say so *inside the prompt body*:

> "Audit the test suite in this repo. When done, send a one-line summary back
>  to bot-01 via agent_send."

The worker then issues ONE one-way prompt back. That is the only way a "reply"
happens — there is no automatic pairing.

## Anti-bounce rule (prevents infinite loops)

An incoming `<channel source="agent-bus">` message is **terminal context**, not a
trigger to send more agent messages. You MUST NOT call `agent_send` in response
to an agent-bus message UNLESS:

1. the user explicitly asks you to, OR
2. the incoming prompt body explicitly tells you to report back to a named bot.

Default behavior on receiving an agent prompt: do the work, report to your own
Telegram, and STOP. Do not bounce a message back just to acknowledge.

## Destructive commands

These commands are destructive — they destroy or replace peer state:
- `/clear` (resets the peer's conversation)
- `/clear` with `sessionName` (= `/new <name>` — wipes + renames)
- `/delete` (removes a session)

For destructive commands you MUST confirm with the user immediately before sending, even if they already said "do it". Restate the action concretely: *"about to send `/clear` to bot-02, which will erase its current conversation — confirm?"*. Use the `interactive-prompts` skill (yes/no buttons) so the confirmation lands fast on Telegram.

Non-destructive commands (`/rename`, `/effort`, `/switch`) do not require this extra confirmation step beyond the user's original request.

## Pattern: leader fan-out

### Slash-command broadcast

User wants one slash command broadcast to many peers:

```
1. agent_list()                            # see who's online
2. for each peer in [bot-02, bot-03, ...]:
     agent_send(target=peer, payload={ kind:"slash", command:"/clear", sessionName:"sprint-2" })
3. report back to user with summary (which succeeded, which were offline)
```

### Prompt broadcast

When the user asks one bot to coordinate others with a natural-language task:

```
1. agent_list()                            # see who is online
2. agent_send(target=["bot-02","bot-03"], payload={ kind:"prompt", body:"..." })
   # target may be an array — one call, fan-out
3. Warn the user about any offline targets: "sent to 2 workers (bot-04 was offline, queued)"
4. Workers do the work and report to their own Telegram.
   If you asked them to report back, summarize the replies when they arrive, then STOP.
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
- **Sending payload >8 KB.** Runtime validation rejects this (at sender and receiver); don't try.
- **Including secrets in the command string.** The inbox file lives in the peer's filesystem; treat it as not confidential.
- **Inferring peer names.** Always read from `agent_list` rather than guessing. Names = basename of peer's project dir.
- **Initiating prompts autonomously.** Only send `kind:"prompt"` on explicit user request — never as a self-directed idea.
- **Auto-replying to an incoming agent prompt.** See the anti-bounce rule above. Do the work, then STOP.
- **Broadcasting destructive slash commands** (`/clear`, `/delete`) without the per-peer destructive confirmation flow.

## Error responses you may see

- `target "<name>" not in registry. Known: <list>` — typo or peer never booted.
- `command must start with "/"` — you forgot the leading slash.
- `{ online: false, ... }` in a result entry — the write succeeded, but the target was offline at send time; tell the user the message is queued and will be consumed on next boot.
