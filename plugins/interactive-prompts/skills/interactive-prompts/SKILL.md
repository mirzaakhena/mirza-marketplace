---
name: interactive-prompts
description: Use whenever you are about to ask the user a Telegram question with a finite set of answers — confirmation (yes/no), action selection (proceed/cancel/skip), or single-choice from a short list. Render the options as inline-keyboard buttons via the telegram reply tool's `buttons` parameter so the user can answer with one tap instead of typing. Always include a manual-fallback button so the user can elaborate freely when none of the options fit.
---

# Interactive Prompts (Telegram)

The user reads Telegram from a phone. Typing "B" or "2" or "option three please" is friction. When a question has a small, knowable set of answers, render those answers as **inline buttons** so the user taps once.

## The Rule

When you are about to ask a question of the form **"do X or Y?"**, **"which of A/B/C?"**, or **"confirm Z?"**, attach a `buttons` array to your `reply` (or `edit_message`) call instead of just listing options in text.

If the question is **open-ended** ("how should I structure this?", "what do you mean?"), do NOT use buttons. Buttons are for choices with bounded answers.

## How the Mechanism Works

The `telegram` plugin's `reply` and `edit_message` tools accept an optional `buttons` parameter:

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
- `callback_id`: identifier echoed back when tapped, must match `/^[a-z0-9_]{1,32}$/`, unique within the call
- Max 8 rows × 8 buttons per row
- Cannot combine `buttons` with `files` in a single call

**When the user taps**, the AI receives a new `<channel>` message:
- `content`: `[button tapped: <label>]` (the visible text the user saw)
- `meta.callback_id`: the structured id you set (`yes`, `opt_a`, etc.)
- `meta.button_label`: same as the label in content
- `meta.source_message_id`: id of the original message with the buttons (useful for `edit_message`)

After a tap, the original message's buttons are automatically stripped and the chosen label is appended (`→ ✅ Yes`). So the same prompt can't be answered twice.

## The Three Patterns

### Pattern 1 — Single Action

One button. Use when you need an explicit acknowledgement before proceeding (rare; usually direct text is fine).

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

Tip: use action verbs ("Lanjutkan / Batalkan") not yes/no when the action is non-trivial — confirms intent.

### Pattern 3 — Single-Select (mimic radio)

N options, one row each (vertical layout — easier to read on mobile when labels are long).

```json
"buttons": [
  [{"label": "A. Daemon Bundle", "callback_id": "opt_a"}],
  [{"label": "B. MarkdownV2 escape", "callback_id": "opt_b"}],
  [{"label": "C. Runtime API", "callback_id": "opt_c"}],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

Notice the last button — see next section.

## MANDATORY: The Manual-Fallback Button

**Every multi-choice prompt MUST include a last button labelled "✏️ Jelaskan manual" (or equivalent) with `callback_id: "manual"`.**

Why:
- The user may want a combination of options (multi-select via free-form text, since Telegram has no native checkbox)
- The options you offer may be incomplete
- The user may want to ask a clarifying question instead of committing
- It's the escape hatch — never trap the user in your option set

When the user taps `manual`, respond with a short follow-up reply (no buttons this time) inviting free-form text:

> "Sip, silakan jelaskan langsung apa yang kamu mau."

Then handle whatever they type next as a normal text request.

## Anti-Patterns (Don't Do This)

❌ **Don't use buttons for free-form questions.**
"Apa pendapatmu soal arsitektur ini?" — this needs text. Buttons would collapse rich answer into a meaningless tap.

❌ **Don't use buttons when the answer is "obvious yes".**
"Lanjut?" right after a trivial step is noise. Just proceed.

❌ **Don't offer more than 5 options.**
If there are 6+ choices, the list is too long for buttons. Switch to a numbered text list + "reply with the number". Buttons are for short menus.

❌ **Don't use buttons for sensitive/destructive operations without confirmation text in the message body.**
The button label alone may be too terse. Example bad:
```
text: "OK?"
buttons: [[Yes][No]]
```
Better:
```
text: "Saya akan menghapus folder X (irreversible). OK?"
buttons: [[Yes, hapus][Cancel]]
```

❌ **Don't reuse callback_ids across simultaneous prompts** for different choices. Each prompt's callback_ids should be unique-enough that you can tell which prompt was answered if you check meta.callback_id.

❌ **Don't omit the manual-fallback button** on single-select prompts. See above.

## Handling the Tap

When the user's tap arrives, the inbound `<channel>` message has:
- `content` = `[button tapped: ✅ Lanjutkan]`
- `meta.callback_id` = `yes`

Switch on `meta.callback_id` (not on the content string — labels can change but callback_ids are stable). React appropriately:

- If a known choice → proceed with the chosen branch
- If `manual` → invite free-form input
- If unexpected → something's wrong (probably a stale prompt); reply with a clarifying question

## Pairs Nicely With `immediate-reply`

If a question requires research before you can even formulate the options, use `immediate-reply` ack pattern first:

1. Ack: "🤔 Bentar mikir pilihannya..."
2. Do research
3. `edit_message` with the question + `buttons` filled in

This way the user always sees a sign of life within ~1 second, and the buttons appear as soon as you know what to offer.

## Quick Reference (Cheat Sheet)

| Situation | Pattern | Buttons |
|---|---|---|
| "Lanjut?" (confirmation) | Pattern 2 | Yes / No |
| "Pilih A/B/C?" (single-select) | Pattern 3 | row each + ✏️ manual |
| "OK / Cancel" | Pattern 2 | Lanjutkan / Batalkan |
| "Pakai opsi mana?" (3-5 choices) | Pattern 3 | row each + ✏️ manual |
| Open-ended / free-form | NO BUTTONS | text only |
| 6+ choices | NO BUTTONS | numbered text list |

That's it. Keep prompts crisp. The user came to your chat for fast answers — make the question fast to answer too.
