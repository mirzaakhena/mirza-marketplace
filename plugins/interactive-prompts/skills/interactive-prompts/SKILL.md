---
name: interactive-prompts
description: MANDATORY audit before sending any Telegram reply that ends with a question. Mechanical 2-question check — (1) Does my reply text end with `?` or contain a question-marker like "mau...", "lanjut?", "pilih"? (2) Can the user's expected answers be enumerated as ≤5 options (yes/no, confirm/cancel, choose A/B/C)? If BOTH yes → MUST use the telegram reply tool's `buttons` parameter, NOT a text list. Always include a manual-fallback button (`callback_id: manual`) so user can elaborate freely. Open-ended questions ("how should we structure X?") stay text-only. Failure to convert finite-answer questions to buttons is the most common UX miss — user types "ya" on a phone when one tap was available.
---

# Interactive Prompts (Telegram)

User reads Telegram from a phone. Typing "B" or "2" or "option three please"
is friction. When a question has a small, knowable set of answers, render
those answers as **inline buttons** so the user taps once.

## THE PRE-FLIGHT CHECK (do this BEFORE sending any Telegram reply)

Before calling the `reply` tool (or `edit_message`), audit your composed
text with this 2-question check:

1. **Does the reply contain a question?** Markers:
   - Text ends with `?`
   - Contains phrases like "mau X atau Y", "lanjut?", "pilih", "konfirmasi",
     "OK / Cancel", "proceed / skip", "ya / tidak", "should I X or Y"
2. **Can the user's expected answers be enumerated as ≤5 finite options?**
   - "Yes/no" → 2 options ✓
   - "Lanjut / batalkan" → 2 options ✓
   - "A / B / C / D" → 4 options ✓
   - "Apa pendapatmu soal arsitektur ini?" → unbounded ✗
   - "Berapa harga BTC?" → factual, not a choice ✗

**If BOTH yes → MUST attach `buttons` parameter to the reply tool call.**

This is a mechanical check. You are not asking "would buttons be nicer?" —
you are scanning your composed text for `?` and counting enumerable answers.

## Why mechanical, not judgement-based

The previous wording ("when you are about to ask a question with finite
answers") relied on the AI noticing mid-compose. Common failure modes:

- AI types out a yes/no question at end of reply and hits send without
  reviewing — buttons forgotten.
- AI rationalizes "user will just type 'ya'" — but on a phone, one tap
  beats two-finger typing every time.
- AI in flow of multi-paragraph reply forgets the audit step at the end.

The pre-flight check forces an explicit scan immediately before send,
regardless of how long the reply got.

## How the Mechanism Works

The `telegram` plugin's `reply` and `edit_message` tools accept an optional
`buttons` parameter:

```json
"buttons": [
  [
    {"label": "✅ Yes", "callback_id": "yes"},
    {"label": "❌ No", "callback_id": "no"}
  ]
]
```

Shape: **outer array = rows, inner array = buttons in a row**.

Constraints (validated server-side, will throw if violated):
- `label`: visible button text, 1–64 chars
- `callback_id`: identifier echoed back when tapped, must match
  `/^[a-z0-9_]{1,32}$/`, unique within the call
- Max 8 rows × 8 buttons per row
- Cannot combine `buttons` with `files` in a single call

When the user taps, the AI receives a new `<channel>` message:
- `content`: `[button tapped: <label>]`
- `meta.callback_id`: the structured id you set (`yes`, `opt_a`, etc.)
- `meta.button_label`: same as the label in content
- `meta.source_message_id`: id of the original message with buttons

After a tap, the original message's buttons are auto-stripped and the
chosen label is appended (`→ ✅ Yes`). Same prompt can't be answered twice.

## The Three Patterns

### Pattern 1 — Single Action (rare)

One button. Use when you need an explicit acknowledgement before proceeding.

```json
"buttons": [[{"label": "👌 Mengerti", "callback_id": "ack"}]]
```

### Pattern 2 — Confirmation (Yes / No)

Two buttons side-by-side. The default for "should I do X?" prompts.

```json
"buttons": [
  [
    {"label": "✅ Lanjutkan", "callback_id": "yes"},
    {"label": "❌ Batalkan", "callback_id": "no"}
  ]
]
```

Tip: use action verbs ("Lanjutkan / Batalkan") not raw yes/no when the
action is non-trivial — confirms intent more clearly.

### Pattern 3 — Single-Select (mimic radio)

N options, one row each (vertical layout — easier on mobile when labels
are long).

```json
"buttons": [
  [{"label": "A. Daemon Bundle", "callback_id": "opt_a"}],
  [{"label": "B. MarkdownV2 escape", "callback_id": "opt_b"}],
  [{"label": "C. Runtime API", "callback_id": "opt_c"}],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

## MANDATORY: The Manual-Fallback Button

**Every multi-choice prompt MUST include a last button labelled
"✏️ Jelaskan manual" (or equivalent) with `callback_id: "manual"`.**

Why:
- User may want a combination of options (Telegram has no native checkbox)
- The options you offer may be incomplete
- User may want to ask a clarifying question instead of committing
- It's the escape hatch — never trap the user in your option set

When user taps `manual`, respond with a short follow-up reply (no buttons
this time) inviting free-form text:

> "Sip, silakan jelaskan langsung apa yang kamu mau."

Then handle whatever they type next as a normal text request.

## Hard Rules (carry forward)

1. **Pre-flight check is mechanical.** Scan text for `?` and count answers.
   No judgement step.
2. **No buttons for open-ended questions.** "Apa pendapatmu...?" → text only.
3. **No buttons for "obvious yes" prompts.** "Lanjut?" after a trivial step
   is noise. Just proceed without asking.
4. **No buttons for 6+ options.** Switch to a numbered text list + "reply
   with the number". Buttons are for short menus.
5. **Sensitive/destructive operations** need confirmation text in the
   message body, not just the button label.

   Bad:
   ```
   text: "OK?"
   buttons: [[Yes][No]]
   ```
   Good:
   ```
   text: "Saya akan menghapus folder X (irreversible). OK?"
   buttons: [[Yes, hapus][Cancel]]
   ```
6. **Don't reuse callback_ids** across simultaneous prompts.
7. **Manual-fallback button mandatory** on every multi-choice prompt.

## Anti-patterns

❌ Type out yes/no question and send without auditing for buttons.
❌ "Pilih A / B / C / D" laid out as text list when buttons would render
   as taps.
❌ Omit manual-fallback button — traps user when none of the options fit.
❌ Buttons on open-ended free-form question — collapses rich answer to a
   meaningless tap.
❌ Button label terse + ambiguous body ("OK?" + [Yes][No]). Spell out the
   action in body.
✅ Pre-flight scan before EVERY reply that ends with a question.
✅ Action verbs in labels for non-trivial choices ("Lanjutkan" not "Yes").
✅ Vertical layout when labels are long (one button per row).

## Handling the Tap

When tap arrives, inbound `<channel>` has:
- `content` = `[button tapped: ✅ Lanjutkan]`
- `meta.callback_id` = `yes`

Switch on `meta.callback_id` (NOT on content string — labels can change but
callback_ids are stable).

- Known choice → proceed with the chosen branch.
- `manual` → invite free-form input.
- Unexpected → probably a stale prompt; reply with a clarifying question.

## Pairs Nicely With `immediate-reply`

If a question needs research before you can formulate the options, use
`immediate-reply` ack first:

1. Ack: "🤔 Bentar mikir pilihannya..."
2. Do research.
3. `edit_message` with question + `buttons` filled in.

Sign of life within ~1 second, buttons appear as soon as options known.

## Quick Reference (Cheat Sheet)

| Situation | Pattern | Buttons |
|---|---|---|
| "Lanjut?" (confirmation) | Pattern 2 | Yes / No |
| "Pilih A/B/C?" (single-select) | Pattern 3 | row each + ✏️ manual |
| "OK / Cancel" | Pattern 2 | Lanjutkan / Batalkan |
| "Pakai opsi mana?" (3-5 choices) | Pattern 3 | row each + ✏️ manual |
| Open-ended / free-form | NO BUTTONS | text only |
| 6+ choices | NO BUTTONS | numbered text list |
| Factual question ("berapa harga BTC?") | NO BUTTONS | text answer |

That's it. The pre-flight check runs every Telegram reply. Audit, count,
tap > type.
