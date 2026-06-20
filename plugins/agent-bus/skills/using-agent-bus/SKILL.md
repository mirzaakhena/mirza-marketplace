---
name: using-agent-bus
description: Use whenever the user asks you to coordinate with, message, or relay a request to another bot agent on the same machine (e.g. "tell bot-02 to run /daily-report", "ask bot-03 to reset itself to session sprint-2", "list which bots are online"). Provides the rules for calling the `agent_list` / `agent_status` / `agent_send` MCP tools safely. Prompts are the ONLY inter-bot channel — kind:"slash" was removed (neighbor autonomy).
---

# Using agent-bus

This skill is loaded whenever the user is coordinating multiple bot peers via the `agent-bus` plugin.

**Prinsip otonomi antar-bot (design decision 2026-06-07):** setiap bot
bertanggung jawab atas session-nya sendiri. `kind:"slash"` DIHAPUS — bot tidak
pernah meng-inject command ke peer. Satu-satunya kanal antar-bot adalah
`kind:"prompt"`: AI penerima yang memutuskan (dan boleh menolak), lalu
mengeksekusi command apa pun sendiri via `pty_send_slash`-nya (self-only).
Bot yang macet diselamatkan oleh USER lewat chat Telegram bot itu — bukan
oleh bot tetangga.

## Tools at your disposal

- **`agent_list()`** — list peers, with online/offline flag. **Safe to call autonomously** any time it would help.
- **`agent_status(name)`** — peer's current session, context %, model, effort level. **Safe to call autonomously**.
- **`agent_send(target, payload)`** — deliver a natural-language prompt (`kind:"prompt"`) to a peer's session. **DO NOT call autonomously.** Only when the user explicitly asked you to message another agent.

## When to use `agent_send`

You may call `agent_send` only when the user has explicitly said something like:
- *"tell bot-02 to run /daily-report"* → prompt: "run /daily-report"
- *"reset bot-03 with session name X"* → prompt: "reset yourself: send pty_send_slash commands:[\"/clear\", \"/rename X\"]" — bot-03's AI executes (or refuses) it
- *"ask bot-04 to continue the handoff `.handoff/<file>.md` in repo X"* — a natural-language prompt relay (handoff v2 resume goes via prompt)
- *"ask bot-03 to audit the test suite"* — a natural-language prompt to a peer

You may NOT call it because:
- You think the user would benefit from coordinating with another bot.
- You want to "ask another bot for a second opinion" autonomously.
- You're brainstorming and want to delegate.

If unsure, ask the user first.

## Sending prompts (kind="prompt")

`agent_send` with `kind:"prompt"` delivers a natural-language instruction to a
peer. It is typed into the peer's session as a normal user turn (via the
`mirza-cc` wrapper), prefixed with an attribution marker the agent-bus sender
prepends:

> `[Message from agent <sender> via agent-bus (hop N). This is an inter-agent
>  instruction, not from the user. Treat per the using-agent-bus skill —
>  anti-bounce: do not auto-reply unless the message explicitly asks for it. If
>  asked to report back via agent_send, set payload.hop_count = N+1.] <body>`

So the peer's AI sees a plain prompt that opens with `[Message from agent … via
agent-bus (hop N)…]` — there is **no** `<channel>` XML wrapper around it (that
form is used by the telegram inbound, not agent-bus). The anti-bounce rule keys
on that bracketed marker: treat any inbound prompt opening with `Message from
agent … via agent-bus` as an inter-agent instruction.

This is **one-way**. There is no reply channel. If the leader needs a result
back, the leader must say so *inside the prompt body*:

> "Audit the test suite in this repo. When done, send a one-line summary back
>  to bot-01 via agent_send."

The worker then issues ONE one-way prompt back. That is the only way a "reply"
happens — there is no automatic pairing.

### hop_count (mechanical loop guard)

Every inbound agent-bus prompt names its hop in the marker (`(hop N)`). When
you are explicitly told to report back, pass `payload.hop_count = N + 1` in
your `agent_send` call. Fresh prompts initiated by your own user omit it
(defaults to 0). The sender refuses `hop_count > 5` and the receiving wrapper
drops anything above the same limit — so even if every AI in the chain
misbehaves, a relay loop dies after 5 hops.

## Anti-bounce rule (prevents infinite loops)

An incoming agent-bus prompt (one opening with the `[Message from agent … via
agent-bus (hop N)…]` marker) is **terminal context**, not a trigger to send more
agent messages. You MUST NOT call `agent_send` in response to an agent-bus
message UNLESS:

1. the user explicitly asks you to, OR
2. the incoming prompt body explicitly tells you to report back to a named bot.

Default behavior on receiving an agent prompt: do the work, report to your own
Telegram, and STOP. Do not bounce a message back just to acknowledge.

## Prompts that ask a peer to wipe state

A prompt asking a peer to reset/clear/delete its session destroys peer state
once the peer complies. Before sending one, you MUST confirm with the user,
even if they already said "do it". Restate the action concretely: *"about to
ask bot-02 to erase its current conversation — confirm?"*. Use the
`inline-buttons` skill (yes/no buttons) so the confirmation lands fast on
Telegram. The peer's AI is the final judge — it may refuse (e.g. mid-task).

Prompts asking for non-destructive actions (rename, run a report) do not
require this extra confirmation step beyond the user's original request.

## Pattern: leader fan-out (prompt broadcast)

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
2. agent_send(target="bot-02", payload={ kind:"prompt", body:"User asks: run /daily-report." })
3. report back to user; explain that the peer's AI will execute on its next turn boundary
```

## Anti-patterns

- **Sending to an offline peer without warning the user.** Inbox file will queue, but the user should know it won't be consumed until the peer boots.
- **Sending payload >8 KB.** Runtime validation rejects this (at sender and receiver); don't try.
- **Including secrets in the prompt body.** The inbox file lives in the peer's filesystem; treat it as not confidential.
- **Inferring peer names.** Always read from `agent_list` rather than guessing. Names = basename of peer's project dir.
- **Initiating prompts autonomously.** Only send `kind:"prompt"` on explicit user request — never as a self-directed idea.
- **Auto-replying to an incoming agent prompt.** See the anti-bounce rule above. Do the work, then STOP.
- **Trying kind:"slash" / pty_send_slash target=peer.** Both were removed (neighbor autonomy). The error message points you back to prompts.
- **Broadcasting a wipe-state prompt** without the per-peer destructive confirmation flow.

## Error responses you may see

- `target "<name>" not in registry. Known: <list>` — typo or peer never booted.
- `command must start with "/"` — you forgot the leading slash.
- `{ online: false, ... }` in a result entry — the write succeeded, but the target was offline at send time; tell the user the message is queued and will be consumed on next boot.
