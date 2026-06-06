# `immediate-reply` — Make Claude feel fast on Telegram

A **skill-only** plugin that tells Claude to send a short acknowledgement to the Telegram user within ~1 second before the first tool call runs. No MCP server, no commands — just a single behavior skill that gets audited every time a Telegram message comes in.

## Why this plugin exists

Telegram users read from their phones. A 5-second delay with no sign of life feels like the bot is ghosting. An instant acknowledgement ("bentar cek dulu...") before the work starts reassures the user that their message landed and Claude is working, even though the final answer only shows up 30 seconds later.

## Core rule — mechanical pre-flight check

Before composing a response to any Telegram message, the AI answers **4 tool-counting questions** (not judging "is this heavy or not"):

1. Will there be a tool call other than `reply` before the final answer?
2. Will it `Read` a file?
3. Will it run a Bash/shell command (including `git`, `ls`, `grep`)?
4. Will it dispatch an Agent / background process / Monitor?

**Even a single "yes" → an ack MUST be sent BEFORE the first tool runs.** All "no" (a pure-text response with no tools) → no ack needed, answer directly.

This check is deliberately mechanical, not judgement-based — the old version ("non-trivial work", "more than a few seconds") proved to drift in practice: the AI would estimate "only 3 seconds" when it was actually 12, or forget to ack while in flow.

## Two responsibilities

1. **Instant ack** — a sign of life within ~1 second of the message arriving.
2. **Continuous progress** — for tasks > 15 seconds, narrate the transitions between stages. Going silent after the ack is almost as bad as not acking at all.

The full skill lives in [`skills/immediate-reply/SKILL.md`](skills/immediate-reply/SKILL.md). That's the source of truth — it has the flow diagram, example ack phrasing per situation (research/file read/thinking/writing), and an anti-pattern list.

## Update strategies

Once the ack is sent, pick ONE strategy per task (don't switch mid-way):

- **A — Edit-to-final.** Good for 5–15 second tasks. Ack → work → `edit_message` into the final answer. One clean message in the chat.
- **B — Multi-edit progress + new final reply.** Good for 15–60 second tasks with clear stages. The ack gets edited a few times as progress ("✅ research done, lagi nyusun..."), and the final answer is sent as a **new reply** so the phone's push notification fires.
- **C — Progressive new messages.** Good for a "thinking out loud" feel. A short ack, then the process narration sent as successive new messages.
- **D — Mix.** Start with edits, switch to new messages if it turns out to take longer than expected. That's fine, as long as the final answer is always a new message when the total is > ~15 seconds.

## Telegram constraints you must obey

1. **Edits don't trigger a push notification.** If a task takes > ~15 seconds, the final output MUST be a new message, not just an edit — otherwise the user's phone won't ping and they'll think Claude vanished.
2. **Don't edit faster than 1x per second per chat.** That's Telegram rate limit territory.
3. **Edits can't change the message type.** A text ack can't be edited into an image — an image has to be a new message.
4. **One ack per user message.** If the user sends 3 messages within 5 seconds, ack the last one — don't send 3 acks.
5. **Skip the ack only for pure-text responses with no tools.** The "all no" path of the pre-flight check — greetings, a quick fact from memory — answer directly. The moment there's a single Read/Bash/other tool, an ack is mandatory.

## Plugin pairing

This plugin only makes sense if a Telegram channel is active. Install it alongside:

- **[`telegram`](../telegram/)** — required. Without a Telegram channel, this skill will never get triggered.
- **[`inline-buttons`](../inline-buttons/)** — a nice complement. When you eventually need to ask the user for confirmation, render the options as inline keyboard buttons so the user can answer with a single tap.

## Installation

Marketplace setup is covered in the [root README](../../README.md). Once the `mirza-marketplace` marketplace is added, install with:

```
/plugin install immediate-reply@mirza-marketplace
/reload-plugins
```

The skill loads automatically — no extra configuration.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
