#!/usr/bin/env bash
# Telegram /context bridge: capture Claude Code's statusLine stdin so the
# Telegram bot can read it later, then chain to the user's original
# statusLine command so the terminal display is unchanged.
#
# Installed automatically by plugins/telegram on first /context call.
#
# Layout under <project>/.telegram-state/:
#   last-status.json   { "captured_at_ms": <epoch>, "payload": <stdin JSON> }
#   chained-statusline single line: command to delegate to (may be empty)

set -u

INPUT="$(cat)"

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE_DIR="$PROJECT_DIR/.telegram-state"
STATE_FILE="$STATE_DIR/last-status.json"
CHAIN_FILE="$STATE_DIR/chained-statusline"

mkdir -p "$STATE_DIR" 2>/dev/null

NOW_MS=$(( $(date +%s) * 1000 ))

TMP="$STATE_FILE.tmp.$$"
if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -c --argjson ts "$NOW_MS" '{captured_at_ms: $ts, payload: .}' > "$TMP" 2>/dev/null \
        || printf '{"captured_at_ms":%s,"payload":%s}' "$NOW_MS" "$INPUT" > "$TMP"
else
    printf '{"captured_at_ms":%s,"payload":%s}' "$NOW_MS" "$INPUT" > "$TMP"
fi
mv -f "$TMP" "$STATE_FILE" 2>/dev/null

# Preserve existing terminal status display by chaining to the previous
# statusLine command (saved at install time). Empty file => no chain.
if [ -s "$CHAIN_FILE" ]; then
    CHAIN_CMD="$(cat "$CHAIN_FILE")"
    if [ -n "$CHAIN_CMD" ]; then
        printf '%s' "$INPUT" | sh -c "$CHAIN_CMD"
        exit $?
    fi
fi
