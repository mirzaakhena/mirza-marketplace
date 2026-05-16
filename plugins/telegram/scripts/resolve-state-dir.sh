#!/usr/bin/env bash
# Resolve Telegram channel state directory from environment.
# Echo path to stdout on success, error to stderr + return 1 on failure.
#
# Resolution chain (priority):
#   1. $TELEGRAM_STATE_DIR (escape hatch for dev/test)
#   2. $CLAUDE_PROJECT_DIR/.claude/channels/telegram
#   3. error
#
# Note on whitespace: the TS counterpart (state-path.ts) trims env values for
# unit-test purity. This bash version does NOT trim — shell environments do not
# produce whitespace-padded path values in practice (export strips them). The
# chain semantics (priority, fallback) match exactly; the trim is internal
# sanitization, not part of the contract.

resolve_state_dir() {
  if [ -n "${TELEGRAM_STATE_DIR:-}" ]; then
    echo "$TELEGRAM_STATE_DIR"
    return 0
  fi
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    echo "$CLAUDE_PROJECT_DIR/.claude/channels/telegram"
    return 0
  fi
  echo "telegram: CLAUDE_PROJECT_DIR not set; cannot derive state dir" >&2
  return 1
}

resolve_channels_dir() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    echo "$CLAUDE_PROJECT_DIR/.claude/channels"
    return 0
  fi
  echo "telegram: CLAUDE_PROJECT_DIR not set; cannot derive channels dir" >&2
  return 1
}
