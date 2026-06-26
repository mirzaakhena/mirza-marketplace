---
name: immediate-reply
description: MANDATORY before any tool call in response to a Telegram inbound. Trigger criterion is MECHANICAL, not "is this hard?" — if your planned response involves ANY of (≥1 tool call other than the reply itself, ≥1 file Read, ≥1 Bash invocation, ≥1 background process, ≥1 agent dispatch), send a short ack via reply tool BEFORE that first tool fires. Then keep narrating progress at stage transitions for tasks >15s. Skip ack ONLY when your entire response is pure text with zero tool calls. Failure to ack before tools fires is the most common UX miss — user sits in silence and assumes you ghosted.
---

# Immediate Reply (Telegram)

User reads Telegram from a phone and notices any delay over a couple of
seconds. This skill keeps you visible from the moment the message arrives
until the final answer lands.

**One rule for delivery: every message is a NEW `reply`. Never
`edit_message`.** Ack is a new message, progress updates are new messages,
the final answer is a new message. This is deliberate — new messages always
fire a push notification, so the user always sees a sign of life. No edit
strategies, no message-id juggling, no 15-second threshold to remember.

## THE PRE-FLIGHT CHECK (do this BEFORE every Telegram reply)

When a Telegram `<channel>` message arrives, **before composing your
response**, run this 4-question check:

1. Will I call any tool other than `reply` before delivering the final answer?
2. Will I `Read` any file?
3. Will I run any `Bash` command (including `git`, `ls`, `grep` via tools)?
4. Will I dispatch an Agent / background process / Monitor?

**If ANY answer is "yes" → ack BEFORE the first such tool call.**

This is a mechanical check. You are not deciding "is this important?" or
"does this feel slow?" — you are counting future tool calls. Yes/no, no
judgement.

If all four are "no" (you are about to produce a pure-text reply with no
tools) → no ack, just send the answer.

## Why mechanical, not judgement-based

The previous wording ("non-trivial work", "more than a few seconds") relied
on judgement and drifted in practice. Common failure modes:

- AI estimates "this will only take 3 seconds" — actual wall clock 12 sec.
- AI in flow after several short replies skips ack out of habit.
- AI rationalizes "the answer is already in my head, just typing it now"
  while a Read or Bash fires in the background and the user waits.

Counting tool calls eliminates all three. If you wrote a plan with even one
`Read` or `Bash`, the ack is mandatory — no debate.

## The Two Responsibilities

1. **Instant ack** — within ~1 second of the inbound message, send a short
   `reply` so the user sees a sign of life.
2. **Ongoing progress** — for tasks >15s wall clock, send a NEW `reply` at
   stage transitions so the user never sits in silence after the ack.

Silence after an ack is almost as bad as no ack.

## Sequence (mechanical)

```
Telegram inbound arrives
        │
        ▼
Run pre-flight check (4 questions above)
        │
   ┌────┴────┐
  All "no"   Any "yes"
   │         │
   ▼         ▼
reply with   reply: send short ack (new message)
final        │
answer.      ▼
Done.        Do the work (tool calls, reads, etc.)
             │
             ▼
             Task >15s? → reply with progress at each
             stage transition (each one a new message)
             │
             ▼
             reply with final answer (new message)
```

Every arrow that sends something to the user is a `reply`. There is no
other delivery path.

## Ack Phrasing — Mix and Surprise

Vary the wording. Boring repetition kills the gimmick. Ack in the language
the user writes in — mirror the user's language and register, and keep it
casual. Occasional emoji fine, don't overdo.

Research / browsing:
- "🔍 Hang on, checking..."
- "🕵️ Investigation mode on..."

Reading files / code:
- "📖 Reading the file first..."
- "👀 Let me look at the code..."

Thinking / planning:
- "🤔 Thinking..."
- "🧠 Working out a plan..."

Writing / drafting:
- "📝 Writing it up..."
- "🎨 Drafting the answer..."

When you don't know how long:
- "👌 On it..."
- "🚀 On it, one sec..."

Surprise occasionally ("coffee first ☕ one sec..."). Never more than once
per task.

**Adapt these to the user's language.** The examples above are English; if
the user writes in another language, mirror it — e.g. an Indonesian user
gets a casual Indonesian ack like "🔍 Bentar, cek dulu yaa...".

## Progress Narration (for tasks >15s)

When work runs long, send progress as **new messages** at real stage
transitions — not on a timer. Each one is a normal `reply`.

Example flow for a long task:
1. Ack: "🔍 Checking..."
2. After stage 1: "✅ Check done, now researching..."
3. After stage 2: "✅ Got the data, drafting the answer..."
4. Final answer: full reply.

Keep each progress line short. Narrate when the *situation* changes ("oh,
turns out X"), not just to fill silence. One useful update beats three
empty "still working" pings.

## Hard Rules (Telegram constraints — non-negotiable)

1. **Every message is a new `reply`.** Never `edit_message` in this skill.
   This guarantees the user gets a push notification for ack, progress, and
   final alike.
2. **One ack per inbound.** If the user sends 3 messages in 5s, ack the
   latest only — don't ack-spam.
3. **No ack for pure-text replies with zero tools.** Pre-flight all-no path.
4. **Progress narration is for stage transitions, not a heartbeat.** Don't
   send filler pings; send updates when something actually changed.

## Implementation pointers

Via `plugin:telegram:telegram` MCP:

1. Receive Telegram message → has `chat_id`, `message_id` of user.
2. Pre-flight check (4 questions). If any "yes": call `reply` with a short
   ack.
3. Do the tool calls.
4. For long tasks, call `reply` again at each stage transition.
5. Call `reply` with the final answer.

Always `reply`. You never need to capture or reuse a bot `message_id`,
because nothing is ever edited.

## Anti-patterns

- ❌ Using `edit_message` — this skill is new-messages-only now.
- ❌ Judgement-based threshold ("feels fast", "trivial") — drifts.
- ❌ "I'll just type the answer now while Read is running" — Read is a
  tool call. Ack first.
- ❌ Multiple acks for one inbound message.
- ❌ Multi-paragraph ack. One line, one emoji max, under 50 chars.
- ❌ Filler progress pings ("still working...") with no new information —
  every message buzzes the phone, so make each one earn its notification.
- ✅ Pre-flight check is mechanical. Count tools, don't judge difficulty.
- ✅ Ack BEFORE the first non-reply tool fires, not after.
- ✅ Stage-transition narration for long tasks. Silence kills trust.

That's it. The point: user sees a sign of life within ~1 second from
EVERY non-trivial inbound, and stays informed throughout — all through
plain new messages.
