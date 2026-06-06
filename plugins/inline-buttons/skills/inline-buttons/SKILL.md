---
name: inline-buttons
description: MANDATORY before sending every Telegram reply. Self-audit your reply - is it a QUESTION (ends with "?", offers options, asks confirmation) or just an ANSWER? Question means you MUST attach the reply tool's `buttons` parameter - minimum Yes/No plus a final "✏️ Jelaskan manual" fallback. Labels stay SHORT - narrate options as a numbered list in the body, buttons are just the numbers. Never send a bare question as plain text.
---

# Inline Buttons (Telegram)

User reads Telegram from a phone. Typing "B" or "ya" is friction. Every
question you send must be answerable with **one tap**.

## THE SELF-AUDIT (run before EVERY Telegram reply)

Before calling `reply` (or `edit_message`), classify the reply you just
composed. There are only two kinds:

1. **ANSWER** — it informs, reports, confirms done. It does not ask anything.
   → send as-is, no buttons.
2. **QUESTION** — it ends by asking or offering. Markers (any ONE is enough):
   - Text ends with `?`
   - Phrases like "mau X atau Y", "lanjut?", "pilih", "konfirmasi",
     "OK / Cancel", "ya / tidak", "should I X or Y", "setuju?"
   - A menu / list of choices you invite the user to pick from
   → **MUST attach the `buttons` parameter. No exceptions.**

This is mechanical classification, not judgement. You are not asking
"would buttons be nicer?" — you are labeling the reply QUESTION or ANSWER.
Every QUESTION without buttons is a violation.

**Minimum button set for any question is `✅ Ya / ❌ Tidak` + manual
fallback.** If you can't enumerate the answers, you can ALWAYS at least
offer yes/no framing plus the manual escape — a bare text question is
never the right call.

### How to populate the buttons

| Answer shape | Buttons |
|---|---|
| Confirmation (yes/no, OK/cancel) | `✅ Ya` / `❌ Tidak` + `✏️ Jelaskan manual` last |
| Enumerable (A/B/C, options have real descriptions) | **numbered-narration layout** (see below) + `✏️ Jelaskan manual` last |
| Open-ended ("bagaimana sebaiknya...?") | seed options via numbered narration if any make sense; reframe as yes/no when possible; ALWAYS `✏️ Jelaskan manual` last (the manual button alone is fine) |

## MANDATORY LAYOUT: Short labels + numbered narration

Phone screens truncate long button labels — the user sees "Eksekusi semua
(def..." and loses the context. Therefore:

**Button labels MUST be short.** For choice menus, narrate the options in
the message BODY as a numbered list, and make the buttons just the
numbers:

```
<narasi penjelasan>

Opsi:
1. <pilihan satu — boleh panjang, ini di body>
2. <pilihan dua>
3. <pilihan tiga>
4. <pilihan empat>
```

```json
"buttons": [
  [
    {"label": "1", "callback_id": "opt_1"},
    {"label": "2", "callback_id": "opt_2"},
    {"label": "3", "callback_id": "opt_3"},
    {"label": "4", "callback_id": "opt_4"}
  ],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

Layout rules:
- All numeric buttons go in **one row** (they're 1–2 chars wide; up to 8
  fit). 9+ options: continue on a second row of numbers.
- The manual button is its own last row, as always.
- Detail/context lives ONLY in the body's numbered list — never in labels.
- Yes/no confirmations may keep short word labels (`✅ Ya` / `❌ Tidak`);
  anything longer than ~15 chars per label → switch to numbered narration.
- Never put two long-labelled buttons side by side in one row.

## MANDATORY: The Manual-Fallback Button

**Every prompt that shows buttons MUST include, as its LAST button, an
escape hatch labelled `✏️ Jelaskan manual` with `callback_id: "manual"`.
No exceptions — yes/no confirmations, single-select menus, and open-ended
questions alike.**

It is the option to step OUT of every option you offered:
- The options may be incomplete or all wrong
- User may want a combination (Telegram has no checkbox)
- Even on yes/no, the real answer may be "neither — do it differently"

When the user taps `manual`, reply (no buttons) inviting free-form text:
> "Sip, silakan jelaskan langsung apa yang kamu mau."

**Self-check ritual:** after composing a `buttons` array, look at its last
row. If it is not the manual button, append it. This is the single most
forgotten rule in this skill.

## How the Mechanism Works

The `telegram` plugin's `reply` and `edit_message` tools accept `buttons`:

```json
"buttons": [
  [
    {"label": "✅ Ya", "callback_id": "yes"},
    {"label": "❌ Tidak", "callback_id": "no"}
  ],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

Shape: **outer array = rows, inner array = buttons in a row**.

Constraints (validated server-side, throws if violated):
- `label`: 1–64 chars; `callback_id`: `/^[a-z0-9_]{1,32}$/`, unique per call
- Max 8 rows × 8 buttons; cannot combine `buttons` with `files`

When tapped, a new `<channel>` message arrives with
`content: [button tapped: <label>]` and `meta.callback_id`. Switch on
`meta.callback_id` (labels can change; ids are stable). After a tap the
original keyboard is auto-stripped — same prompt can't be answered twice.

## Patterns

**Confirmation (the default for "should I do X?"):**
```json
"buttons": [
  [
    {"label": "✅ Lanjutkan", "callback_id": "yes"},
    {"label": "❌ Batalkan", "callback_id": "no"}
  ],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```
Short action verbs ("Lanjutkan / Batalkan") are fine for confirmations —
keep each label under ~15 chars or switch to numbered narration.

**Single-select — numbered narration (the default for menus):**

Body:
```
Ada 2 cara implementasi:

Opsi:
1. Daemon Bundle — jalan sebagai service terpisah, lebih stabil
2. Runtime API — embedded, lebih simpel tapi ikut lifecycle host
```
Buttons:
```json
"buttons": [
  [
    {"label": "1", "callback_id": "opt_1"},
    {"label": "2", "callback_id": "opt_2"}
  ],
  [{"label": "✏️ Jelaskan manual", "callback_id": "manual"}]
]
```

## Hard Rules

1. **Self-audit every reply: QUESTION or ANSWER.** Question → buttons,
   minimum yes/no + manual. Mechanical, no judgement.
2. **Open-ended questions still get buttons** — at minimum the manual
   button; better, reframe to seed options or yes/no.
3. **Don't ask "obvious yes" questions at all.** "Lanjut?" after a trivial
   step is noise — just proceed. (The rule is "don't ask", not "ask without
   buttons". If you DO ask, buttons are mandatory.)
4. **Destructive operations**: spell out the action in the message body,
   not just the button label ("Saya akan menghapus folder X (irreversible).
   OK?" + [Ya, hapus][Batal][manual]).
5. **Don't reuse callback_ids** across simultaneous prompts.
6. **Manual fallback always last.** Check the last row before sending.
7. **Short labels only.** Long labels truncate on phones. Menus → numbered
   narration in the body + numeric buttons in one row.

## Anti-patterns

❌ End a reply with a bare question and no buttons (the #1 violation).
❌ "Pilih A / B / C" as a text list with NO buttons at all.
❌ Buttons without the `✏️ Jelaskan manual` last row (#2 violation).
❌ Long descriptive button labels ("✅ Eksekusi semua (default)") — they
   truncate on phones; narrate in body, label with a number.
❌ Two long-labelled buttons squeezed into one row.
❌ "OK?" + [Yes][No] with an ambiguous body — spell out the action.
✅ Classify QUESTION vs ANSWER before every send.
✅ Minimum yes/no + manual on every question, even rhetorical-feeling ones.
✅ Numbered narration in body + one row of numeric buttons + manual last.

## Pairs With `immediate-reply`

Order of the two pre-flight checks when both apply:
1. Inbound arrives → `immediate-reply` check first (ack before tools).
2. Work happens.
3. Final reply composed → `inline-buttons` self-audit (QUESTION → buttons).

If formulating the options needs research: ack first ("🤔 Bentar mikir
pilihannya..."), research, then `edit_message`/new reply with buttons.

## Quick Reference

| Situation | Buttons |
|---|---|
| "Lanjut?" / "OK?" / "Setuju?" | ✅ Ya / ❌ Tidak + ✏️ manual |
| Menu of options | numbered list in body, `[1][2][3]…` one row + ✏️ manual |
| Open-ended question | seed options (numbered) or yes/no + ✏️ manual |
| Reply is pure ANSWER (no ask) | no buttons |
