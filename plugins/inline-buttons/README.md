# inline-buttons

A skill-only plugin that forces Claude to run a **self-audit** before sending every Telegram reply: is this reply a **QUESTION** or just an **ANSWER**? If it's a question → it must use inline-keyboard buttons, so the user can answer with **one tap** — not typing.

This plugin has no MCP server, no commands, just a single skill: `inline-buttons`.

## Why

Users read Telegram on their phones. Typing "B" or "yes" is friction. If Claude's reply ends with a question or offers choices, the options should show up as buttons. Tap > type.

## Core rule — mechanical self-audit

Before sending **every** Telegram reply, Claude classifies the text as one of two kinds:

1. **ANSWER** — informs, reports, confirms done. Doesn't ask anything → send as-is, no buttons.
2. **QUESTION** — ends by asking or offering. Signals (any single one is enough): text ends with `?`, phrases like "want X or Y" / "continue?" / "pick" / "confirm" / "OK / Cancel" / "yes / no" / "agree?", or there's a menu of choices → the **`buttons` parameter MUST be attached. No exceptions.**

**Minimum button set for any question: `✅ Yes / ❌ No` + a manual fallback.** If the answer can't be enumerated, you can at least always offer a yes/no framing plus a manual button — a plain-text question is never the right choice.

This check is deliberately mechanical (classify QUESTION vs ANSWER), not judgement-based ("would buttons be nicer?") — the old version that relied on mid-compose awareness proved to forget exactly at the end of long replies.

## Mandatory: manual fallback button

**EVERY prompt that shows buttons — yes/no, single-select, or open-ended — MUST have a final button labeled `✏️ Explain manually` with `callback_id: "manual"`. No exceptions.**

The reasons:

- The user might want a combination of options (Telegram has no checkboxes)
- The offered options might be incomplete or all wrong
- The user might want to ask a question back before committing
- Even in yes/no, the real answer might be "neither — do it, but a different way"

The self-check ritual encoded in the skill: after assembling the `buttons` array, look at its last row — if it isn't the manual button, add it. This is the most commonly forgotten rule, which is why it's made into an explicit ritual.

If the user taps `manual`, reply with a short follow-up (no buttons) inviting free-form text, then handle the next input like a normal text message.

## Mandatory layout: short labels + numbered narration

Phone screens truncate long button labels — the user sees "Execute all (def..." and loses context. So:

- **Button labels must be short.** For a menu of choices: options are narrated as a numbered list in the message BODY, and the buttons are just numbers (`[1][2][3][4]`) on a **single row** (9+ options spill onto the next number row).
- Detail/context lives only in the numbered list in the body — never in the label.
- Yes/no confirmations may keep short word labels (`✅ Yes` / `❌ No`); a label > ~15 characters → move it to the numbered narration.
- No two long-labeled buttons side by side on one row.
- The manual button stays on its own last row.

Example:

```
explanatory narrative ...

Options:
1. option one
2. option two
3. option three
4. option four

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

[`immediate-reply`](../immediate-reply/) — the ordering of the two checks when both apply: (1) inbound arrives → check immediate-reply first (ack before tools), (2) work, (3) final reply is composed → inline-buttons self-audit (QUESTION → buttons). If formulating the options needs research first: instant ack ("🤔 Hang on, thinking through the options…"), research, then send the question + `buttons`.

## Installation

Add the marketplace first (see [root README](../../README.md)), then:

```
/plugin install inline-buttons@mirza-marketplace
/reload-plugins
```

The skill activates right away — Claude automatically uses the appropriate pattern when chatting via Telegram.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
