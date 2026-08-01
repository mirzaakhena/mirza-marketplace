# inline-buttons

A skill-only plugin that forces Claude to run a **self-audit** before sending every Telegram reply: **can the answer I want be picked from a short list?** If yes → inline-keyboard buttons, so the user answers with **one tap**. If no → plain text.

This plugin has no MCP server, no commands, just a single skill: `inline-buttons`.

## Why

Users read Telegram on their phones. Typing "B" or "yes" is friction. When the answer is a choice, it should be a tap.

## Core rule — one question, asked before every reply

> **Can the answer be picked from a short list?**

- **YES** → attach buttons. Two shapes qualify: a **confirmation** (yes/no genuinely settles it) or a **menu** of 2–4 named options.
- **NO** → send it as plain text. Opinions, explanations, preferences you cannot enumerate: a tap cannot carry them.

**A question mark is not the trigger.**

### What changed in 0.0.10, and why

The rule used to be purely mechanical: *"reply ends with `?` → buttons, no exceptions."* That was chosen deliberately, because a judgement-based version had proved to forget exactly at the end of long replies.

It over-corrected. The trigger could not tell *"lanjut Task 8?"* (one tap settles it) from *"menurutmu gimana?"* (the answer is a paragraph), so buttons appeared on nearly every message. The user's verdict, 2026-08-01: *"cukup mengganggu juga kalau setiap saat keluar buttons."*

Buttons on an open question are worse than merely useless — they offer a tap where no tap can express the answer, and the noise trains the user to stop looking at the keyboard at all, including when it *does* matter.

The replacement is still one question with a yes/no answer, so it stays checkable rather than vibes-based. It just asks about the **shape of the answer** instead of the punctuation of the question.

**Do not reframe a real question as yes/no just to make buttons apply** — flattening it into a false binary is worse than sending text.

## Mandatory: manual fallback button

**EVERY prompt that shows buttons — confirmation or menu — MUST have a final button labeled `✏️ Explain manually` with `callback_id: "manual"`. No exceptions.**

(An open-ended question shows no buttons, so it needs no fallback: the whole message is already free-form.)

The reasons:

- The user might want a combination of options (Telegram has no checkboxes)
- The offered options might be incomplete or all wrong
- The user might want to ask a question back before committing
- Even in yes/no, the real answer might be "neither — do it, but a different way"

The self-check ritual encoded in the skill: after assembling the `buttons` array, look at its last row — if it isn't the manual button, add it. This is the most commonly forgotten rule, which is why it's made into an explicit ritual.

If the user taps `manual`, reply with a short follow-up (no buttons) inviting free-form text, then handle the next input like a normal text message.

## Mandatory layout: short labels + numbered narration

Phone screens truncate long button labels — the user sees "Execute all (def..." and loses context. So:

- **Button labels must be short.** For a menu of choices: options are narrated as a numbered list in the message BODY, and the buttons are just numbers (labels `1`, `2`, `3`, `4`) on a **single row** (9+ options spill onto the next number row).
- Detail/context lives only in the numbered list in the body — never in the label.
- **The body NEVER repeats the button row as text.** Do not end the message with `[1] [2]` or `[✅ Yes] [❌ No]` — Telegram renders the keyboard right below the message; the body text stops at the numbered list/question.
- Yes/no confirmations may keep short word labels (`✅ Yes` / `❌ No`); a label > ~15 characters → move it to the numbered narration.
- No two long-labeled buttons side by side on one row.
- The manual button stays on its own last row.

Example — the body text you send:

```
explanatory narrative ...

Options:
1. option one
2. option two
3. option three
4. option four
```

…and the keyboard Telegram RENDERS below it (not part of the body text):

```
[1] [2] [3] [4]
[✏️ Explain manually]
```

## Patterns

**Confirmation** (default for "should I do X?") — two short action buttons + manual on the bottom row. Short action verbs (`Continue / Cancel`) are fine as long as they're ≤ ~15 characters.

**Single-Select** — numbered narration in the body + a single row of number buttons + manual on the last row (see mandatory layout above).

## Button mechanics & constraints

The `buttons` parameter in the telegram plugin's `reply` / `edit_message` tools: an array of rows, each row an array of `{label, callback_id}` buttons.

- `label`: 1–64 characters
- `callback_id`: must match `/^[a-z0-9_]{1,32}$/`, unique within a single call
- Maximum 8 rows × 8 buttons per row
- `buttons` can't be combined with `files` in a single call
- After the user taps, the buttons in the original message are automatically removed and the chosen label is appended (`→ ✅ Yes`) — the same prompt can't be answered twice

A tap arrives as a new `<channel>` message containing `[button tapped: <label>]` plus `meta.callback_id`. **Handle based on `callback_id`, not the label text** — labels can change, callback_id is stable.

## Forbidden anti-patterns

- Ending a reply with a plain question and no buttons (violation #1)
- Forgetting the `✏️ Explain manually` button on the last row (violation #2)
- Listing options as text "Pick A / B / C / D" when they could be buttons
- Asking "continue?" for a trivial step whose answer is obviously yes (the rule: don't ask, just proceed — not ask without buttons)
- Destructive operations with no context in the message body (a button label alone is too short — write the action in the body)
- Reusing a `callback_id` across prompts that are active at the same time

## Depends on

The [`telegram`](../telegram/) plugin (>= `0.0.9-mirza.0`), which exposes the `buttons` parameter in the `reply` and `edit_message` tools. Without the telegram plugin, there's nothing for this skill to call.

## Pairs well with

[`immediate-reply`](../immediate-reply/) — the ordering of the two checks when both apply: (1) inbound arrives → check immediate-reply first (ack before tools), (2) work, (3) final reply is composed → inline-buttons self-audit (pickable answer → buttons). If formulating the options needs research first: instant ack ("🤔 Hang on, thinking through the options…"), research, then send the question + `buttons`.

## Installation

Add the marketplace first (see [root README](../../README.md)), then:

```
/plugin install inline-buttons@mirza-marketplace
/reload-plugins
```

The skill activates right away — Claude automatically uses the appropriate pattern when chatting via Telegram.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
