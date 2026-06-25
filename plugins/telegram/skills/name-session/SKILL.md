---
name: name-session
description: Use when responding to a Telegram inbound while the current session is still named "idle" (read it from the "Current Telegram session name" context injected at SessionStart). Remind the user ONCE to rename, and as soon as the conversation's direction is clear, offer a concrete hyphenated name via inline buttons and apply it yourself via pty_send_slash on confirmation. Do not nag.
---

# Name the Session (Telegram)

A session left named `idle` is hard to find later. This skill gets it a
meaningful name with minimal friction.

## When this applies

- You are replying to a Telegram `<channel>` inbound, AND
- The injected context says `Current Telegram session name: "idle"`, AND
- The session has NOT already been renamed during this conversation.

If the name is anything other than `idle`, do nothing — this skill is silent.

## The flow

### 1. Remind once (only on your first reply of an idle session)

Append a single one-line note to your normal reply, e.g.:

> _FYI session ini masih bernama `idle`. Nanti setelah arah obrolan jelas aku
> usulkan nama, atau kamu bisa `/rename <nama>` kapan saja._

Do this **once**. After that, stay quiet about naming until you have a concrete
recommendation. Never repeat the reminder every message.

### 2. Offer a name (when the direction is clear — your judgment)

As soon as you can tell what the conversation is about (could be after one
message or several), and the session is still `idle`, propose ONE concrete name
with inline buttons:

- The name MUST be lowercase, hyphenated, **no spaces** (the `/rename`
  command rejects spaces). Keep it short and descriptive, e.g. `catur-analogi`,
  `rename-idle-feature`.
- Buttons (narrate the options as a short numbered list in the body; labels stay short):
  - `[Pakai "<nama>"]`
  - `[Nama lain]`
  - `[Nanti saja]`

### 3. Apply on confirmation

- `[Pakai "<nama>"]` tapped → rename the session yourself by calling
  `pty_send_slash` with `command: "/rename <nama>"`. Confirm briefly to the user.
- `[Nama lain]` tapped → propose a different name (or ask the user what they'd
  prefer), then offer again.
- `[Nanti saja]` tapped → drop it; do not re-offer unless the user asks.

## Stop conditions

- Once the session has been renamed (by you or by the user typing `/rename`),
  stop nudging and offering for the rest of the conversation.
- Never auto-rename without the user's tap — the user chooses the name (one tap
  to accept your suggestion).
