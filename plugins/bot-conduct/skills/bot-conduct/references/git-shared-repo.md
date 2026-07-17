# Shared-repo git discipline (full text)

Moved verbatim from SKILL.md Rule 6 during the 0.0.8 slim-down; normative
content unchanged.

**Three-copy doctrine (user decision, MANDATORY).** ANY repo registered
as a Claude Code plugin marketplace lives in three places with rigid
roles:

- **(a) the workspace clone** (`workspace/<repo-name>`) — the CANONICAL
  copy *for that repo*, the ONLY place to edit and commit (parallel work
  via worktrees, see Moment 1).
- **(b) `~/.claude/plugins/marketplaces/**`** — Claude Code's internal
  updater copy. **READ-ONLY** — it can be deleted + recloned at any time
  without warning. NEVER edit or commit there; sync only with
  `git pull --ff-only`.
- **(c) `~/.claude/plugins/cache/**`** — per-version builds. Never edit.

**Mechanical enforcement:** before ANY commit, run
`git rev-parse --show-toplevel` — if the path is under
`~/.claude/plugins/`, STOP and move to that repo's workspace clone.

Incident that bred the doctrine (2026-06-07, mirza-marketplace as the
example): ~25 unpushed release commits in
`~/.claude/plugins/marketplaces/mirza-marketplace` were wiped when
another bot force-pushed a squashed history from an older base and the
plugin updater recloned the directory. Full post-mortem + rationale:
`docs/SOP-git-multi-agent.md` in the mirza-marketplace repo.

The remaining rules, in priority order:

1. **Push to origin IMMEDIATELY after every release commit** in a shared
   repo. Verify mechanically: `git status -sb` shows
   `## main...origin/main` with no "ahead" before you walk away.
2. **No force-push / history rewrite** on a repo multiple agents touch
   without ALL of: `git log origin/main..main` checked in EVERY clone
   that might exist, explicit user confirmation, and cross-bot
   coordination.
3. **`~/.claude/plugins/cache/` is the release-recovery source.** Cache
   holding a version HIGHER than the workspace plugin.json is a red flag
   of unpushed releases — investigate before bumping past it. Dirs
   stamped `.orphaned_at` are GC candidates; copy them to safety before
   recovering from them.
4. **Worktrees for parallel work in the same repo** (Moment 1 still
   applies) — created from the repo's canonical workspace clone, never
   from the marketplaces copy (it dies with its parent on reclone).
