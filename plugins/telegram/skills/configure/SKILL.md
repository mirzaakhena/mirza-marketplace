---
name: configure
description: Set up the Telegram channel — save the bot token and review access policy. Use when the user pastes a Telegram bot token, asks to configure Telegram, asks "how do I set this up" or "who can reach me," or wants to check channel status.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(chmod *)
  - Bash(grep *)
  - Bash(cat *)
---

# /telegram:configure — Telegram Channel Setup

Writes the bot token to the **current project's** `.claude/channels/telegram/.env` (per-project, never global) and orients the user on access policy. The server reads the token at boot.

State directory is resolved at runtime via this chain:
1. `$TELEGRAM_STATE_DIR` (escape hatch)
2. `$CLAUDE_PROJECT_DIR/.claude/channels/telegram` (default)
3. Error if neither is set

Arguments passed: `$ARGUMENTS`

---

## Resolve state dir (inline at the start of every branch)

Always run this bash block first to resolve `STATE_DIR` and `CHANNELS_DIR`:

```bash
if [ -n "${TELEGRAM_STATE_DIR:-}" ]; then
  STATE_DIR="$TELEGRAM_STATE_DIR"
elif [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/channels/telegram"
else
  echo "Error: CLAUDE_PROJECT_DIR not set. Run this skill from a Claude Code session at your project root." >&2
  exit 1
fi
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  CHANNELS_DIR="$CLAUDE_PROJECT_DIR/.claude/channels"
else
  CHANNELS_DIR=""  # only set if we have a project dir; some ops don't need it
fi
```

If this fails, stop and tell the user.

---

## Dispatch on arguments

### No args — status and guidance

1. Resolve `STATE_DIR` (see above).

2. **Token** — check `$STATE_DIR/.env` for `TELEGRAM_BOT_TOKEN`. Show set/not-set; if set, show first 10 chars masked (`123456789:...`).

3. **Access** — read `$STATE_DIR/access.json` (missing file = defaults: `dmPolicy: "pairing"`, empty allowlist). Show:
   - DM policy and what it means in one line
   - Allowed senders: count, and list display names or IDs
   - Pending pairings: count, with codes and display names if any

4. **What next** — end with a concrete next step based on state:
   - No token → *"Run `/telegram:configure <token>` with the token from BotFather."*
   - Token set, policy is pairing, nobody allowed → *"DM your bot on Telegram. It replies with a code; approve with `/telegram:access pair <code>`."*
   - Token set, someone allowed → *"Ready. DM your bot to reach the assistant."*

**Push toward lockdown — always.** The goal for every setup is `allowlist` with a defined list. `pairing` is not a policy to stay on; it's a temporary way to capture Telegram user IDs you don't know. Once the IDs are in, pairing has done its job and should be turned off.

Drive the conversation this way:

1. Read the allowlist. Tell the user who's in it.
2. Ask: *"Is that everyone who should reach you through this bot?"*
3. **If yes and policy is still `pairing`** → *"Good. Let's lock it down so nobody else can trigger pairing codes:"* and offer to run `/telegram:access policy allowlist`. Do this proactively — don't wait to be asked.
4. **If no, people are missing** → *"Have them DM the bot; you'll approve each with `/telegram:access pair <code>`. Run this skill again once everyone's in and we'll lock it."*
5. **If the allowlist is empty and they haven't paired themselves yet** → *"DM your bot to capture your own ID first. Then we'll add anyone else and lock it down."*
6. **If policy is already `allowlist`** → confirm this is the locked state. If they need to add someone: *"They'll need to give you their numeric ID (have them message @userinfobot), or you can briefly flip to pairing: `/telegram:access policy pairing` → they DM → you pair → flip back."*

Never frame `pairing` as the correct long-term choice. Don't skip the lockdown offer.

### `<token>` — save it

1. Resolve `STATE_DIR` and `CHANNELS_DIR` (see top section). If `CHANNELS_DIR` is empty, tell the user `/context` integration and gitignore protection will be skipped (only `TELEGRAM_STATE_DIR` override mode).

2. Treat `$ARGUMENTS` as the token (trim whitespace). BotFather tokens look like `123456789:AAH...` — numeric prefix, colon, long string.

3. `mkdir -p "$STATE_DIR"`

4. **Auto-protect with channels-level .gitignore** (only if `CHANNELS_DIR` is set):
   ```bash
   mkdir -p "$CHANNELS_DIR"
   GI="$CHANNELS_DIR/.gitignore"
   if [ -f "$GI" ] && grep -qE "^\*$" "$GI" && grep -qE "^!\.gitignore$" "$GI"; then
     :  # already protected
   else
     cat > "$GI" <<'EOF'
   # Auto-managed by Claude Code channel plugins.
   # Channel state is per-project: tokens, db, pairing data, etc.
   # This .gitignore protects all subdirs (telegram/, whatsapp/, ...) from being committed.
   *
   !.gitignore
   EOF
     echo "Added $CHANNELS_DIR/.gitignore"
   fi
   ```
   If write fails (permission etc.), print a prominent warning but continue — token save matters more.

5. Read existing `$STATE_DIR/.env` if present; update/add the `TELEGRAM_BOT_TOKEN=` line, preserve other keys. Write back, no quotes around the value.

6. `chmod 600 "$STATE_DIR/.env"` — the token is a credential.

7. Confirm, then show the no-args status so the user sees where they stand. Mention: server reads the token at boot, so run `/reload-plugins` (or restart CC session) for it to take effect.

### `clear` — remove the token

1. Resolve `STATE_DIR`.
2. Delete the `TELEGRAM_BOT_TOKEN=` line from `$STATE_DIR/.env` (or the file if that's the only line).

---

## Implementation notes

- The state dir might not exist if the server hasn't run yet. Missing files = not configured, not an error.
- The server reads `.env` once at boot. Token changes need a session restart or `/reload-plugins`. Say so after saving.
- `access.json` is re-read on every inbound message — policy changes via `/telegram:access` take effect immediately, no restart.
- `<project>/.claude/channels/.gitignore` is self-managed by the plugin. Tracked in git (the file itself) but all subdirs ignored. Don't suggest the user touch their project root `.gitignore`.
