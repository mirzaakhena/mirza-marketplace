#!/usr/bin/env bash
# gather-context.sh — collects deterministic context for /daily-report.
# Reads: cwd must be inside a git repo. Optional args are extra file paths to include.
# Writes: delimited plain-text blob to stdout.

set -euo pipefail

# --- repo + date metadata ---
REPO_NAME="$(basename "$(git rev-parse --show-toplevel)")"
DATE_TODAY="$(date +%Y-%m-%d)"

echo "===REPO==="
echo "$REPO_NAME"
echo "===DATE==="
echo "$DATE_TODAY"

# --- branch ---
echo "===BRANCH==="
git rev-parse --abbrev-ref HEAD

# --- commit selection ---
# Strategy:
#   Primary: commits newer than mtime of latest file in .daily-reports/
#   Fallback 1: commits in last 24h
#   Fallback 2: last 10 commits
# Fallbacks activate when the earlier tier yields < 2 commits.

select_commits() {
  local archive_dir=".daily-reports"
  local since=""

  if [[ -d "$archive_dir" ]]; then
    local latest
    latest="$(ls -t "$archive_dir" 2>/dev/null | head -n1 || true)"
    if [[ -n "$latest" ]]; then
      since="$(date -r "$archive_dir/$latest" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || true)"
    fi
  fi

  # Tier 1: since archive mtime
  if [[ -n "$since" ]]; then
    local t1
    t1="$(git log --since="$since" --oneline 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "${t1:-0}" -ge 2 ]]; then
      git log --since="$since" --pretty=format:'COMMIT %h%n%s%n%b%nFILES:' --name-only
      return
    fi
  fi

  # Tier 2: last 24h
  local t2
  t2="$(git log --since='24 hours ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${t2:-0}" -ge 2 ]]; then
    git log --since='24 hours ago' --pretty=format:'COMMIT %h%n%s%n%b%nFILES:' --name-only
    return
  fi

  # Tier 3: last 10 commits
  git log -n 10 --pretty=format:'COMMIT %h%n%s%n%b%nFILES:' --name-only 2>/dev/null || true
}

echo "===COMMITS==="
select_commits

# --- git status ---
echo
echo "===STATUS==="
git status --short

# --- TODO file ---
echo
echo "===TODO==="
if [[ -f .daily-report.todo.md ]]; then
  cat .daily-report.todo.md
fi

# --- previous archive ---
echo
echo "===PREV_ARCHIVE==="
if [[ -d .daily-reports ]]; then
  latest_archive="$(ls -t .daily-reports 2>/dev/null | head -n1 || true)"
  if [[ -n "$latest_archive" ]]; then
    cat ".daily-reports/$latest_archive"
  fi
fi

# --- extra files (from args) ---
echo
echo "===EXTRA_FILES==="
for extra in "$@"; do
  if [[ -f "$extra" ]]; then
    echo "--- $extra ---"
    cat "$extra"
    echo
  fi
done
