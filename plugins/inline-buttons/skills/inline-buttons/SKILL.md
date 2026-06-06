---
name: inline-buttons
description: MANDATORY before sending every Telegram reply. Self-audit your reply - is it a QUESTION (ends with "?", offers options, asks confirmation) or just an ANSWER? Question means you MUST attach the reply tool's `buttons` parameter - minimum Yes/No plus a final "✏️ Jelaskan manual" fallback. Never send a bare question as plain text.
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
| Confirmation (yes/no, OK/cancel) | `✅ Ya` / `❌ Tidak` (or action verbs) + `✏️ Jelaskan manual` last |
| Enumerable (A/B/C, ≤ ~8 choices) | one button per choice + `✏️ Jelaskan manual` last |
| Open-ended ("bagaimana sebaiknya...?") | seed options if any make sense; reframe as yes/no when possible; ALWAYS `✏️ Jelaskan manual` last (the manual button alone is fine) |
| Overflows 8×8 | as many real buttons as fit, `✏️ Jelaskan manual` last; numbered text list only if it genuinely overflows |

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
Use action verbs ("Lanjutkan / Batalkan") over raw yes/no when the action
is non-trivial.

**Single-select (mimic radio) — one row per option, easier on mobile:**
```json
"buttons": [
  [{"label": "A. Daemon Bundle", "callback_id": "opt_a"}],
  [{"label": "B. Runtime API", "callback_id": "opt_b"}],
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

## Anti-patterns

❌ End a reply with a bare question and no buttons (the #1 violation).
❌ "Pilih A / B / C" as a text list when buttons would render as taps.
❌ Buttons without the `✏️ Jelaskan manual` last row (#2 violation).
❌ "OK?" + [Yes][No] with an ambiguous body — spell out the action.
✅ Classify QUESTION vs ANSWER before every send.
✅ Minimum yes/no + manual on every question, even rhetorical-feeling ones.
✅ Vertical layout (one button per row) when labels are long.

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
| "Lanjut?" / "OK?" / "Setuju?" | ✅/❌ + ✏️ manual |
| "Pilih A/B/C?" | row per option + ✏️ manual |
| Open-ended question | seed options or yes/no + ✏️ manual |
| Reply is pure ANSWER (no ask) | no buttons |
