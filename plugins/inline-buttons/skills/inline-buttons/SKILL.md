---
name: inline-buttons
description: MANDATORY before sending every Telegram reply. Self-audit your reply - can the answer you want be PICKED FROM A SHORT LIST (a confirmation, or a menu of 2-4 options)? If yes, you MUST attach the reply tool's `buttons` parameter, ending with an "✏️ Explain manually" fallback. If the answer is prose - an opinion, an explanation, anything open-ended - send it WITHOUT buttons. A question mark alone is not the trigger. Labels stay SHORT - narrate options as a numbered list in the body, buttons are just the numbers.
---

# Inline Buttons (Telegram)

User reads Telegram from a phone. Typing "B" or "ya" is friction. Every
question you send must be answerable with **one tap**.

## THE SELF-AUDIT (run before EVERY Telegram reply)

Before calling `reply` (or `edit_message`), ask **one** question about the
reply you just composed:

> **Can the answer I want be picked from a short list?**

- **YES** → attach `buttons`. Two shapes qualify:
  - a **confirmation** — "should I do X?", where yes/no genuinely settles it
  - a **menu** — 2–4 options you can name, where picking one decides what
    happens next
- **NO** → send it **without buttons**. The answer is prose: an opinion, an
  explanation, a preference you cannot enumerate, or a question you asked to
  understand rather than to branch.

**A question mark is NOT the trigger.** The old rule was "ends with `?` →
buttons, no exceptions", and it fired constantly on questions whose real
answer was a paragraph. The user's verdict, 2026-08-01: *"cukup mengganggu
juga kalau setiap saat keluar buttons."* Buttons on an open question do not
help — they offer a tap where no tap can express the answer, and they train
the user to ignore the keyboard.

**When in doubt, ask yourself what a correct answer looks like.** If you can
write it as 2–4 labels, use buttons. If you would have to write a sentence,
do not.

**Do not "reframe as yes/no" just to earn buttons.** Flattening a real
question into a false binary is worse than sending it as text.

### How to populate the buttons

| Answer shape | Buttons |
|---|---|
| Confirmation (yes/no, OK/cancel) | `✅ Yes` / `❌ No` + `✏️ Explain manually` last |
| Enumerable (A/B/C, options have real descriptions) | **numbered-narration layout** (see below) + `✏️ Explain manually` last |
| Open-ended ("what's the best way to...?", "what do you think?") | **No buttons at all.** Send it as text and let them answer in their own words |

## MANDATORY LAYOUT: Short labels + numbered narration

Phone screens truncate long button labels — the user sees "Execute all
(def..." and loses the context. Therefore:

**Button labels MUST be short.** For choice menus, narrate the options in
the message BODY as a numbered list, and make the buttons just the
numbers:

```
<explanatory narrative>

Options:
1. <option one — can be long, it lives in the body>
2. <option two>
3. <option three>
4. <option four>
```

```json
"buttons": [
  [
    {"label": "1", "callback_id": "opt_1"},
    {"label": "2", "callback_id": "opt_2"},
    {"label": "3", "callback_id": "opt_3"},
    {"label": "4", "callback_id": "opt_4"}
  ],
  [{"label": "✏️ Explain manually", "callback_id": "manual"}]
]
```

Layout rules:
- All numeric buttons go in **one row** (they're 1–2 chars wide; up to 8
  fit). 9+ options: continue on a second row of numbers.
- The manual button is its own last row, as always.
- Detail/context lives ONLY in the body's numbered list — never in labels.
- **The body NEVER repeats the button row as text.** Do NOT end the message
  with `[1] [2]`, `[✅ Yes] [❌ No]`, or any textual rendition of the
  buttons — Telegram renders the keyboard itself, right under the message.
  The body ends at the numbered list (or the question). A trailing `[1] [2]`
  is pure duplication and confuses the user.
- Yes/no confirmations may keep short word labels (`✅ Yes` / `❌ No`);
  anything longer than ~15 chars per label → switch to numbered narration.
- Never put two long-labelled buttons side by side in one row.

## MANDATORY: The Manual-Fallback Button

**Every prompt that shows buttons MUST include, as its LAST button, an
escape hatch labelled `✏️ Explain manually` with `callback_id: "manual"`.
No exceptions — confirmations and menus alike.**

(This applies to prompts that *have* buttons. An open-ended question gets no
buttons at all, so it needs no fallback either — the whole message is already
free-form.)

It is the option to step OUT of every option you offered:
- The options may be incomplete or all wrong
- User may want a combination (Telegram has no checkbox)
- Even on yes/no, the real answer may be "neither — do it differently"

When the user taps `manual`, reply (no buttons) inviting free-form text:
> "Got it, go ahead and tell me directly what you want."

**Self-check ritual:** after composing a `buttons` array, look at its last
row. If it is not the manual button, append it. This is the single most
forgotten rule in this skill.

## How the Mechanism Works

The `telegram` plugin's `reply` and `edit_message` tools accept `buttons`:

```json
"buttons": [
  [
    {"label": "✅ Yes", "callback_id": "yes"},
    {"label": "❌ No", "callback_id": "no"}
  ],
  [{"label": "✏️ Explain manually", "callback_id": "manual"}]
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
    {"label": "✅ Continue", "callback_id": "yes"},
    {"label": "❌ Cancel", "callback_id": "no"}
  ],
  [{"label": "✏️ Explain manually", "callback_id": "manual"}]
]
```
Short action verbs ("Continue / Cancel") are fine for confirmations —
keep each label under ~15 chars or switch to numbered narration.

**Single-select — numbered narration (the default for menus):**

Body:
```
There are 2 ways to implement this:

Options:
1. Daemon Bundle — runs as a separate service, more stable
2. Runtime API — embedded, simpler but tied to the host lifecycle
```
Buttons:
```json
"buttons": [
  [
    {"label": "1", "callback_id": "opt_1"},
    {"label": "2", "callback_id": "opt_2"}
  ],
  [{"label": "✏️ Explain manually", "callback_id": "manual"}]
]
```

## Hard Rules

1. **Self-audit every reply: can the answer be picked from a short list?**
   Yes → buttons. No → plain text.
2. **Open-ended questions get NO buttons.** Do not bolt on a lone manual
   button "just in case", and do not flatten the question into a false
   yes/no to make buttons fit.
3. **Don't ask "obvious yes" questions at all.** "Continue?" after a trivial
   step is noise — just proceed.
4. **Destructive operations**: spell out the action in the message body,
   not just the button label ("I'm about to delete folder X (irreversible).
   OK?" + [Yes, delete][Cancel][manual]).
5. **Don't reuse callback_ids** across simultaneous prompts.
6. **Manual fallback always last.** Check the last row before sending.
7. **Short labels only.** Long labels truncate on phones. Menus → numbered
   narration in the body + numeric buttons in one row.

## Anti-patterns

❌ **Buttons on a question whose answer is a paragraph** — the failure the
   user actually complained about. A tap cannot carry an opinion.
❌ Reframing a real question as yes/no purely so buttons become applicable.
❌ "Pick A / B / C / D" as a text list with NO buttons at all.
❌ Buttons without the `✏️ Explain manually` last row.
❌ Long descriptive button labels ("✅ Execute all (default)") — they
   truncate on phones; narrate in body, label with a number.
❌ Repeating the buttons as text at the end of the body ("... 2. Not
   yet\n\n[1] [2]") — the keyboard renders below the message; the trailing
   `[1] [2]` is duplication. Body stops after the numbered list/question.
❌ Two long-labelled buttons squeezed into one row.
❌ "OK?" + [Yes][No] with an ambiguous body — spell out the action.
✅ Ask "can the answer be picked from a short list?" before every send.
✅ Confirmations and 2–4 option menus → buttons, manual fallback last.
✅ Opinions, explanations, anything open-ended → plain text, no keyboard.
✅ Numbered narration in body + one row of numeric buttons + manual last.

## Pairs With `immediate-reply`

Order of the two pre-flight checks when both apply:
1. Inbound arrives → `immediate-reply` check first (ack before tools).
2. Work happens.
3. Final reply composed → `inline-buttons` self-audit (pickable answer → buttons).

If formulating the options needs research: ack first ("🤔 Hang on, thinking
through the options..."), research, then `edit_message`/new reply with buttons.

## Quick Reference

| Situation | Buttons |
|---|---|
| "Continue?" / "OK?" / "Agree?" | ✅ Yes / ❌ No + ✏️ manual |
| Menu of 2–4 options | numbered list in body; buttons = one row of `1` `2` `3`… + ✏️ manual (body does NOT repeat the row as text) |
| Open-ended question ("what do you think?") | **no buttons** — plain text |
| Reply informs and asks nothing | no buttons |
