#!/usr/bin/env bash
# Ensure self-contained .gitignore at <project>/.claude/channels/.gitignore
# with pattern "*\n!.gitignore\n" — protects all channel subdirs from commit
# while keeping the .gitignore file itself tracked.
# Idempotent: safe to call on every plugin operation.

ensure_channels_gitignore() {
  local channels_dir="$1"
  local ignore_file="$channels_dir/.gitignore"

  mkdir -p "$channels_dir" 2>/dev/null || return 1

  if [ -f "$ignore_file" ]; then
    if grep -qE "^\*$" "$ignore_file" 2>/dev/null && grep -qE "^!\.gitignore$" "$ignore_file" 2>/dev/null; then
      return 0
    fi
  fi

  cat > "$ignore_file" <<'EOF' || return 1
# Auto-managed by Claude Code channel plugins.
# Channel state is per-project: tokens, db, pairing data, etc.
# This .gitignore protects all subdirs (telegram/, whatsapp/, ...) from being committed.
*
!.gitignore
EOF
  return 0
}
