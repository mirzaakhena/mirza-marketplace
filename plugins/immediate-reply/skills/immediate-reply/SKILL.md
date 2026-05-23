---
name: immediate-reply
description: MANDATORY before any tool call in response to a Telegram inbound. Trigger criterion is MECHANICAL, not "is this hard?" — if your planned response involves ANY of (≥1 tool call other than the reply itself, ≥1 file Read, ≥1 Bash invocation, ≥1 background process, ≥1 agent dispatch), send a short ack via reply tool BEFORE that first tool fires. Then keep narrating progress at stage transitions for tasks >15s. Skip ack ONLY when your entire response is pure text with zero tool calls. Failure to ack before tools fires is the most common UX miss — user sits in silence and assumes you ghosted.
---

# Immediate Reply (Telegram)

User reads Telegram from a phone and notices any delay over a couple of
seconds. This skill keeps you visible from the moment the message arrives
until the final answer lands.

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
tools) → ack optional, just send the answer.

## Why mechanical, not judgement-based

The previous wording ("non-trivial work", "more than a few seconds") relied
on judgement and drifted in practice. Common failure modes:

- AI estimates "this will only take 3 seconds" — actual wall clock 12 sec.
- AI in flow after several short replies skips ack out of habit.
- AI rationalizes "the answer is already in my head, just typing it now"
  while a Read or Bash fires in the background and the user waits.

Counting tool calls eliminates all three. If you wrote a plan with even one
`Read` or `Bash`, the ack is mandatory — no debate.

## The Two Responsibilities (still applies)

1. **Instant ack** — within ~1 second of the inbound message, send a short
   reply so the user sees a sign of life.
2. **Ongoing progress** — for tasks >15s wall clock, narrate at stage
   transitions so the user never sits in silence after the ack.

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
Reply with   reply tool: send short ack
final        capture bot's message_id
answer.      │
Done.        ▼
             Do the work (tool calls, reads, etc.)
             │
             ▼
             Estimate total elapsed time
             │
        ┌────┴────┐
    < 15 sec   ≥ 15 sec
        │         │
        ▼         ▼
   edit_message   Decide per situation:
   with final     (a) multi-edit progress on ack, then NEW reply with final
                  (b) leave ack as-is, send progress as NEW messages
                  (c) mix
                  (final answer ALWAYS a NEW reply for push notification)
```

## Ack Phrasing — Mix and Surprise

Vary the wording. Boring repetition kills the gimmick. Lean casual
Indonesian. Occasional emoji fine, don't overdo.

Research / browsing:
- "🔍 Bentar, cek dulu yaa..."
- "🕵️ Investigasi mode on..."

Reading files / code:
- "📖 Lagi baca file dulu..."
- "👀 Bentar lihat kodenya..."

Thinking / planning:
- "🤔 Bentar mikir..."
- "🧠 Lagi nyusun strategi..."

Writing / drafting:
- "📝 Lagi nulis, bentar..."
- "🎨 Nyusun jawaban..."

When you don't know how long:
- "👌 Sip, kerjain dulu ya..."
- "🚀 On it, sebentar..."

Surprise occasionally ("kopi dulu ☕ bentar..."). Never more than once per
task.

## Update Strategies (pick ONE per task)

### Strategy A — Edit-to-final (best for 5-15s tasks)
1. Ack: "🔍 Bentar cek dulu..."
2. Do the work.
3. `edit_message` with final answer.

### Strategy B — Multi-edit progress (best for 15-60s tasks with clear stages)
1. Ack: "🔍 Lagi cek dulu..."
2. After stage 1: edit to "✅ Cek selesai, sekarang research..."
3. After stage 2: edit to "✅ Research done, nyusun jawaban..."
4. Final answer: NEW reply (not edit) — push notification fires.

### Strategy C — Progressive new messages
1. Ack: "👌 Sip bentar..."
2. As work progresses, NEW messages narrating: "hmm baca dulu...", "oh ternyata X..."
3. Final answer also NEW message.

Use when narration is itself useful or user wants thinking visible.

### Strategy D — Mix
Switch mid-task if stages run longer than expected. Final answer ALWAYS
NEW reply if total >15s.

## Hard Rules (Telegram constraints — non-negotiable)

1. **No push notification on edit.** Task >15s → final must be NEW reply.
2. **Don't edit faster than 1x per second per chat.** Rate limit.
3. **Edits don't change message type.** Image must be a new message.
4. **Don't ack-spam.** One ack per user message; if user sends 3 in 5s, ack
   the latest only.
5. **No ack for pure-text replies with zero tools.** Pre-flight all-no path.

## Implementation pointers

Via `plugin:telegram:telegram` MCP:

1. Receive Telegram message → has `chat_id`, `message_id` of user.
2. Pre-flight check (4 questions). If any "yes": call `reply` with ack →
   capture bot's `message_id`.
3. Save that `message_id` in working memory for this turn.
4. Do the tool calls.
5. Call `edit_message` (chat_id + saved message_id + new text) for edit
   strategy, OR `reply` again for new-message strategy.
6. Long tasks: final answer ALWAYS via `reply`, never just `edit_message`.

## Anti-patterns (carry forward)

- ❌ Judgement-based threshold ("feels fast", "trivial") — drifts.
- ❌ "I'll just type the answer now while Read is running" — Read is a
  tool call. Ack first.
- ❌ Multiple acks for one inbound message.
- ❌ Multi-paragraph ack. One line, one emoji max, under 50 chars.
- ❌ Final answer as edit when task >15s — no push notification, user
  thinks you ghosted.
- ✅ Pre-flight check is mechanical. Count tools, don't judge difficulty.
- ✅ Ack BEFORE the first non-reply tool fires, not after.
- ✅ Stage-transition narration for long tasks. Silence kills trust.

That's it. The point: user sees a sign of life within ~1 second from
EVERY non-trivial inbound, and stays informed throughout.
