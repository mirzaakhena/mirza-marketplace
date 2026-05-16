#!/usr/bin/env bash
# Tests for resolve-state-dir.sh helper functions.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./resolve-state-dir.sh
source "$SCRIPT_DIR/resolve-state-dir.sh"

FAILED=0
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); }

# Test 1: TELEGRAM_STATE_DIR override wins
out=$(TELEGRAM_STATE_DIR=/tmp/a CLAUDE_PROJECT_DIR=/tmp/b resolve_state_dir)
[ "$out" = "/tmp/a" ] || fail "override wins, got: '$out'"

# Test 2: CLAUDE_PROJECT_DIR derive
out=$(unset TELEGRAM_STATE_DIR; CLAUDE_PROJECT_DIR=/tmp/b resolve_state_dir)
[ "$out" = "/tmp/b/.claude/channels/telegram" ] || fail "project derive, got: '$out'"

# Test 3: Neither set → exit 1
if (unset TELEGRAM_STATE_DIR; unset CLAUDE_PROJECT_DIR; resolve_state_dir) 2>/dev/null; then
  fail "should error when both unset"
fi

# Test 4: empty string treated as unset → error
if (TELEGRAM_STATE_DIR='' CLAUDE_PROJECT_DIR='' resolve_state_dir) 2>/dev/null; then
  fail "test4: empty strings should error like unset"
fi

# Test 5: resolve_channels_dir derive
out=$(CLAUDE_PROJECT_DIR=/repo resolve_channels_dir)
[ "$out" = "/repo/.claude/channels" ] || fail "channels derive, got: '$out'"

# Test 6: resolve_channels_dir error when unset
if (unset CLAUDE_PROJECT_DIR; resolve_channels_dir) 2>/dev/null; then
  fail "channels_dir should error when unset"
fi

if [ $FAILED -gt 0 ]; then
  echo "FAILED: $FAILED test(s)"
  exit 1
fi
echo "OK: 6 tests passed"
