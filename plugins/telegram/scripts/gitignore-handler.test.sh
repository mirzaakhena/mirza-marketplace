#!/usr/bin/env bash
# Tests for gitignore-handler.sh — ensure_channels_gitignore function.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./gitignore-handler.sh
source "$SCRIPT_DIR/gitignore-handler.sh"

TMP=$(mktemp -d)
trap 'chmod -R u+w "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT

FAILED=0
fail() { echo "FAIL: $1"; FAILED=$((FAILED + 1)); }

# Test 1: no .gitignore exists → create with correct content
ch="$TMP/test1/channels"
ensure_channels_gitignore "$ch"
[ -f "$ch/.gitignore" ] || fail "test1: file not created"
grep -qE "^\*$" "$ch/.gitignore" || fail "test1: missing '*' line"
grep -qE "^!\.gitignore$" "$ch/.gitignore" || fail "test1: missing '!.gitignore' line"

# Test 2: correct content already present → idempotent (file unchanged)
content_before=$(cat "$ch/.gitignore")
ensure_channels_gitignore "$ch"
content_after=$(cat "$ch/.gitignore")
[ "$content_before" = "$content_after" ] || fail "test2: not idempotent"

# Test 3: wrong content → overwrite
ch2="$TMP/test3/channels"
mkdir -p "$ch2"
echo "wrong content" > "$ch2/.gitignore"
ensure_channels_gitignore "$ch2"
grep -qE "^\*$" "$ch2/.gitignore" || fail "test3: didn't overwrite '*' line"
grep -qE "^!\.gitignore$" "$ch2/.gitignore" || fail "test3: didn't overwrite '!.gitignore' line"

# Test 4: parent dir not created yet → mkdir + write
ch3="$TMP/test4/deep/channels"
ensure_channels_gitignore "$ch3"
[ -f "$ch3/.gitignore" ] || fail "test4: didn't create nested dir"

# Test 5: write-protected dir → graceful failure (return 1)
ch4="$TMP/test5/channels"
mkdir -p "$ch4"
chmod 555 "$ch4"
if ensure_channels_gitignore "$ch4" 2>/dev/null; then
  fail "test5: should fail on write-protected dir"
fi
chmod 755 "$ch4"

if [ $FAILED -gt 0 ]; then
  echo "FAILED: $FAILED test(s)"
  exit 1
fi
echo "OK: 5 tests passed"
