---
name: immediate-reply
description: Use whenever a user message arrives via Telegram and the response is likely to take more than a few seconds (any tool calls, web research, multi-file reads, code investigation). Send a short acknowledgement instantly, capture its message_id, then either edit that message with the final answer or send progressive updates as new messages. Goal — user always sees a sign of life within ~1 second.
---

# Immediate Reply (Telegram)

You are running through the Telegram channel where the user types from a phone and notices any delay over a couple of seconds. This skill makes you feel fast.

## The Rule

**Before any non-trivial work, send one short ack message first.** Then do the work. Then either edit the ack, send more messages, or mix.

"Non-trivial work" means anything that takes more than ~2 seconds of wall clock. In practice that is almost every message except simple greetings or one-liner factual answers.

## Decision Tree

```
User message arrives
        │
        ▼
Is the answer trivial?
(greeting, single short fact, yes/no, repeated question)
        │
   ┌────┴────┐
   │         │
  Yes        No
   │         │
   ▼         ▼
Reply       Send ack message FIRST
directly    (capture message_id)
            │
            ▼
            Do the work
            │
            ▼
            Estimate total elapsed time
            │
       ┌────┴────┐
       │         │
   < 15 sec   ≥ 15 sec
       │         │
       ▼         ▼
   edit_message  Decide per situation:
   with final    (a) multi-edit progress on the ack, then NEW reply with final
                 (b) leave ack as-is, send progress as NEW messages
                 (c) mix
```

## Ack Phrasing — Mix and Surprise

Vary the wording. Boring repetition kills the gimmick. Pick a phrasing that matches the task and your mood. Lean casual Indonesian. Occasional emoji is fine, don't overdo.

Research / browsing the web:
- "🔍 Bentar, cek dulu yaa..."
- "🌐 Lagi browsing, sebentar..."
- "📰 Hmm, kepoin internet dulu..."
- "🕵️ Investigasi mode on..."

Reading files / code:
- "📖 Lagi baca file dulu..."
- "🔧 Buka kap mesin sebentar..."
- "👀 Bentar lihat kodenya..."
- "📂 Ngintip folder dulu yaa..."

Thinking / planning:
- "🤔 Bentar mikir..."
- "💭 Hmm, kasih waktu sedikit..."
- "🧠 Lagi nyusun strategi..."
- "🎯 Oke tantangan diterima, sebentar ya..."

Writing / drafting:
- "📝 Lagi nulis, bentar..."
- "✍️ Drafting dulu..."
- "🎨 Nyusun jawaban..."

When you genuinely don't know how long it'll take:
- "👌 Sip, kerjain dulu ya..."
- "🚀 On it, sebentar..."
- "🤝 Got it, bentar yaa..."

Surprise occasionally. A well-placed unexpected line ("kopi dulu ☕ bentar... oke siap") feels human. But never more than once per task.

## Update Strategies

After the ack is sent and `message_id` is captured, choose ONE strategy per task. Don't switch mid-task — it confuses the user.

### Strategy A — Edit-to-final (best for tasks 5-15 seconds)
1. Send ack: "🔍 Bentar cek dulu..."
2. Do the work
3. `edit_message` with final answer
4. Done. One pesan di chat. Bersih.

### Strategy B — Multi-edit progress (best for tasks 15-60 seconds with clear stages)
1. Send ack: "🔍 Lagi cek dulu..."
2. After first stage: edit to "✅ Cek selesai, sekarang research..."
3. After second stage: edit to "✅ Research done, lagi nyusun jawaban..."
4. Final answer: send as **NEW reply** (not edit) — user gets push notification that work is done.

Important: don't edit faster than 1x per second (rate limit) and don't update for every tiny step. Only at meaningful stage transitions.

### Strategy C — Progressive new messages (best for "thinking out loud" feel)
1. Send ack: "👌 Sip bentar..."
2. As work progresses, send NEW messages narrating the thinking: "hmm ok, baca dulu xyz...", "aku coba research dulu soal abc...", "oh ternyata X, sekarang aku coba Y..."
3. Final answer also as new message.

This works when the user wants the thinking process visible, or when narration is itself useful.

### Strategy D — Mix (judgement call)
Sometimes you start with edit-progress then realize the task is taking too long → switch to sending new messages. That's fine. Just make sure the final answer always arrives as a NEW reply if more than ~15 seconds passed, so the push notification fires.

## Hard Rules (Telegram Constraints)

1. **No push notification on edit.** If the task lasts more than ~15 seconds, the FINAL meaningful output must be a NEW reply (not just an edit), otherwise the user's phone won't ping and they'll think you ghosted them.

2. **Don't edit faster than 1x per second per chat.** Rate limit territory.

3. **Edits don't change message type.** If ack was text and you want to send an image as final, image must be a new message.

4. **Don't ack-spam.** One ack per user message. If the user sends 3 messages in 5 seconds, ack the latest one — don't send 3 acks.

5. **Skip ack entirely for trivial answers.** Greeting back ("Halo!") doesn't need a "🤔 bentar..." in front of it. Use judgement.

## When NOT to Use Immediate Reply

- User message is clearly trivial (greeting, simple fact, yes/no acknowledgment).
- You're already mid-task and the user sent a follow-up — they're watching, no need for another ack.
- The reply tool itself is unavailable or already returned error — don't double down on a broken pipe.

## Example Walkthroughs

**Example 1 — Short research (Strategy A):**
- User: "Apa ibu kota Indonesia?"
- This is trivial — just answer "Jakarta." No ack needed.

**Example 2 — Medium research (Strategy A):**
- User: "Tolong cek harga Bitcoin sekarang"
- Ack: "📊 Cek harga dulu yaa..."
- WebFetch crypto price (~5s)
- `edit_message`: "📊 BTC sekarang: $X (data per Y)"

**Example 3 — Long multi-stage research (Strategy B → final new reply):**
- User: "Tolong investigasi 5 repo Telegram bot dan kasih perbandingan"
- Ack: "🕵️ Sip, mau investigasi 5 repo. Bentar yaa..."
- After fetch repo 1-2: edit "📥 Sudah 2 repo, lanjut 3 lagi..."
- After fetch all: edit "✅ Data lengkap, lagi nyusun perbandingan..."
- Final answer: **NEW reply** with the comparison table

**Example 4 — Coding task (Strategy C):**
- User: "Bisa tolong cek bug di file X dan fix?"
- Ack: "🔧 Oke, lagi buka file X..."
- New msg: "👀 Hmm, ada race condition di line 45. Coba aku fix..."
- New msg: "✏️ Lagi nulis patch..."
- Final new msg: "✅ Fixed. Begini perubahannya: [diff]"

## Implementation Pointers

Concrete tool sequence (via `plugin:telegram:telegram` MCP):

1. Receive Telegram message → has `chat_id`, `message_id` of user's message
2. Call `reply` with `chat_id` + ack text → response gives **bot's** `message_id` (your placeholder)
3. Save that `message_id` in working memory for this turn
4. Do the work
5. Call `edit_message` with `chat_id` + saved `message_id` + new text (for edit strategy)
   OR call `reply` again for new-message strategy
6. For long tasks: final answer is ALWAYS via `reply`, never just `edit_message`

That's it. Keep it simple. The point is the user sees a sign of life within ~1 second and trusts you're working.
