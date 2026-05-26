---
name: interactive-prompts
description: MANDATORY audit before sending any Telegram reply. Mechanical 1-question check — does my reply END with a question OR offer the user options/choices (any "?", "mau...", "lanjut?", "pilih", "atau", a menu of choices)? If YES → MUST attach the telegram reply tool's `buttons` parameter, NEVER a plain-text option list and NEVER a bare question. EVERY such prompt MUST include a final escape-hatch button "✏️ Jelaskan manual" (`callback_id: manual`) so the user can step outside the offered options. Applies even to yes/no confirmations and to open-ended questions (which get the manual button at minimum). Failure to convert an end-of-reply question into buttons is the most common UX miss — user types on a phone when one tap was available.
---

# Interactive Prompts (Telegram)

User reads Telegram from a phone. Typing "B" or "2" or "option three please"
is friction. When a question has a small, knowable set of answers, render
those answers as **inline buttons** so the user taps once.

## THE PRE-FLIGHT CHECK (do this BEFORE sending any Telegram reply)

Before calling the `reply` tool (or `edit_message`), audit your composed
text with this **single** question:

**Does my reply END with a question, OR does it offer the user options/choices?**

Markers (any ONE is enough):
- Text ends with `?`
- Phrases like "mau X atau Y", "lanjut?", "pilih", "konfirmasi",
  "OK / Cancel", "proceed / skip", "ya / tidak", "should I X or Y"
- A menu / list of choices you're inviting the user to pick from

**If YES → MUST attach the `buttons` parameter to the reply tool call.**
A bare end-of-reply question with no buttons, or a plain-text option list,
is a violation.

This is a mechanical check. You are not asking "would buttons be nicer?" —
you are scanning whether your reply ends by asking or offering. If it does,
buttons are mandatory.

### How to populate the buttons

| Answer shape | Buttons |
|---|---|
| Enumerable (yes/no, A/B/C, ≤ ~8 choices) | one button per choice + `✏️ Jelaskan manual` last |
| Open-ended ("bagaimana sebaiknya kita struktur X?") | seed options if any make sense, ALWAYS `✏️ Jelaskan manual` last (the manual button alone is fine) |
| More choices than fit comfortably (8+) | as many real buttons as the server allows (max 8×8), `✏️ Jelaskan manual` last; only fall back to a numbered text list if it genuinely overflows |

The escape-hatch `manual` button is non-negotiable — see the MANDATORY
section below. It is what lets open-ended questions still use buttons:
worst case, the user taps it and types freely.

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

Two action buttons plus the mandatory manual escape. The default for
"should I do X?" prompts.

```json
"buttons": [
  [
    {"label": "✅ Lanjutkan", "callback_id": "yes"},
    {"label": "❌ Batalkan", "callback_id": "no"}
  ],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

Tip: use action verbs ("Lanjutkan / Batalkan") not raw yes/no when the
action is non-trivial — confirms intent more clearly. The `manual` button
is required even here — the user may want neither option (e.g. "do it, but
differently").

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

**Every prompt that shows buttons MUST include, as its LAST button, an
escape hatch labelled "✏️ Jelaskan manual" (or equivalent wording) with
`callback_id: "manual"`. No exceptions — this includes yes/no
confirmations, single-select menus, and open-ended questions.**

It is the option to step OUT of every option you offered. You never trap
the user inside your menu.

Why:
- User may want a combination of options (Telegram has no native checkbox)
- The options you offer may be incomplete or all wrong
- User may want to ask a clarifying question instead of committing
- Even on a yes/no, the real answer may be "neither — do it differently"
- It's the escape hatch — never trap the user in your option set

When user taps `manual`, respond with a short follow-up reply (no buttons
this time) inviting free-form text:

> "Sip, silakan jelaskan langsung apa yang kamu mau."

Then handle whatever they type next as a normal text request.

## Hard Rules (carry forward)

1. **Pre-flight check is mechanical.** Does the reply end with a question
   or offer options? Yes → buttons. No judgement step.
2. **Open-ended questions still get buttons.** "Apa pendapatmu...?" → attach
   at least the `✏️ Jelaskan manual` button (plus seed options if sensible).
   Never end a reply with a bare question and no buttons.
3. **No buttons for "obvious yes" prompts — by NOT asking.** "Lanjut?" after
   a trivial step is noise. Just proceed without asking. (The rule is "don't
   ask", not "ask without buttons". If you DO ask, buttons are mandatory.)
4. **Many options → still buttons.** Up to the server max (8×8) render as
   buttons, one per row. Only fall back to a numbered text list if the set
   genuinely overflows that limit.
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
7. **Manual-fallback button mandatory** on EVERY prompt that shows buttons —
   yes/no, single-select, open-ended alike. Always the last button.

## Anti-patterns

❌ Type out yes/no question and send without auditing for buttons.
❌ "Pilih A / B / C / D" laid out as text list when buttons would render
   as taps.
❌ Omit manual-fallback button — traps user when none of the options fit.
❌ End a reply with a bare question and no buttons (even open-ended ones
   get the `✏️ Jelaskan manual` button at minimum).
❌ Button label terse + ambiguous body ("OK?" + [Yes][No]). Spell out the
   action in body.
✅ Pre-flight scan before EVERY reply: ends with a question or offers
   options? → buttons.
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
| "Lanjut?" (confirmation) | Pattern 2 | Yes / No + ✏️ manual |
| "Pilih A/B/C?" (single-select) | Pattern 3 | row each + ✏️ manual |
| "OK / Cancel" | Pattern 2 | Lanjutkan / Batalkan + ✏️ manual |
| "Pakai opsi mana?" (3-5 choices) | Pattern 3 | row each + ✏️ manual |
| Open-ended / free-form question | Pattern 3 | seed options (if any) + ✏️ manual |
| 8+ choices that overflow 8×8 | fallback | numbered text list |
| My reply does NOT end with a question/offer | — | no buttons (e.g. just answering "harga BTC = …") |

That's it. The pre-flight check runs every Telegram reply. Audit, count,
tap > type.
