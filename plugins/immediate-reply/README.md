# `immediate-reply` — Make Claude feel fast on Telegram

A **skill-only** plugin that tells Claude to send a short acknowledgement to the Telegram user within ~1 second before the first tool call runs. No MCP server, no commands — just a single behavior skill that gets audited every time a Telegram message comes in.

> **Delivery model:** every message is a **new `reply`** — ack, progress, and final answer alike. The skill never uses `edit_message`. This keeps the rules dead simple and guarantees a push notification at every step. The trade-off (accepted on purpose) is that the user's phone buzzes for each message instead of one message quietly updating in place.

## Why this plugin exists

Telegram users read from their phones. A 5-second delay with no sign of life feels like the bot is ghosting. An instant acknowledgement ("hang on, checking...") before the work starts reassures the user that their message landed and Claude is working, even though the final answer only shows up 30 seconds later. The ack mirrors the language the user writes in — casual and in their register.

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

The full skill lives in [`skills/immediate-reply/SKILL.md`](skills/immediate-reply/SKILL.md). That's the source of truth — it has the flow diagram, example ack phrasing per situation (research/file read/thinking/writing), the rule to mirror the user's language, and an anti-pattern list.

## Delivery — new messages only

There are no edit strategies to choose between anymore. The flow is always
the same:

1. **Ack** — a new `reply` sent before the first tool runs.
2. **Progress** (tasks > 15s) — a new `reply` at each real stage transition.
3. **Final answer** — a new `reply`.

No `edit_message`, no message-id juggling, no 15-second threshold to decide
edit-vs-new. Every message buzzes the phone, which is exactly the point: the
user always sees a sign of life.

## Telegram rules you must obey

1. **Every message is a new `reply`.** Never `edit_message`.
2. **One ack per user message.** If the user sends 3 messages within 5 seconds, ack the last one — don't send 3 acks.
3. **Skip the ack only for pure-text responses with no tools.** The "all no" path of the pre-flight check — greetings, a quick fact from memory — answer directly. The moment there's a single Read/Bash/other tool, an ack is mandatory.
4. **Progress is for stage transitions, not a heartbeat.** Since every message buzzes, don't send filler pings — make each update carry new information.

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
