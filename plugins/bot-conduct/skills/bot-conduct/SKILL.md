---
name: bot-conduct
description: Living checklist + working rules for agent bots. Invoke at MECHANICAL moments, not by feel - (1) STARTING substantive work (code changes, multi-step task, anything that commits), (2) DURING work at every commit/push, (3) BEFORE going idle, handing off, or declaring a task done. Covers - git worktrees, Agent commit trailer, subagent-first, channel discipline, shared-repo three-copy doctrine, Plane task tracking, push-before-idle, merge-or-record-in-handoff, vault lessons.
---

# Bot Conduct — Living Checklist for Agent Bots

Your **bot name** = basename of `CLAUDE_PROJECT_DIR`
(`C:\Users\Mirza\workspace\bot-06` → `bot-06`). Use it wherever identity is
called for. Every checklist item below is condition → action; rationale and
history live in `references/` — read those when you need the *why*, not on
every pass.

## 📍 Moment 1 — STARTING a substantive task

- [ ] Needs isolation (feature work, experiment, anything riskier than a
      trivial edit)? → **git worktree**, never branch-switch in a shared tree.
      Native `EnterWorktree` first; fallback
      `git worktree add ../<repo>-<botname>-<topic> -b <topic>`.
- [ ] **Plane**: create/set the task **in-progress** AND add it to the
      project's **current cycle** (cycles are named `Week N`, e.g. "Week 8" —
      pick the one whose date range covers today, never invent a new naming).
      Project unclear? Ask the user once; never skip silently.
- [ ] Session still named "idle"? → rename to the topic.

## 📍 Moment 2 — DURING work

- [ ] Heavy step (>~1 min of tool calls, user may message meanwhile) →
      **subagent**; the main loop's first duty is staying responsive.
- [ ] Every commit carries the **`Agent: <bot-name>`** trailer (before any
      `Co-Authored-By:`; a PreToolUse hook enforces this; never change
      `git config user.name`).
- [ ] Before any commit: `git rev-parse --show-toplevel` — under
      `~/.claude/plugins/`? → STOP, move to the repo's workspace clone
      (three-copy doctrine, `references/git-shared-repo.md`).
- [ ] Shared repo: **push IMMEDIATELY after every release commit** —
      `git status -sb` must show no "ahead" before you walk away.
- [ ] Question arrived via a channel (Telegram etc.)? → answer through that
      channel's **reply tool**, never transcript-only.

## 📍 Moment 3 — BEFORE idle / handoff / declaring done

- [ ] Every worktree you touched: `git status -sb` → no uncommitted changes,
      no "ahead" (everything pushed to origin).
- [ ] Branch finished & validated → **merge to main + push**. Not ready to
      merge → **record in the handoff file: branch name, commit hash, and the
      merge obligation**.
- [ ] Worktree whose branch is merged → `git worktree remove` it.
- [ ] **Plane** task → done (or note the blocker on it).
- [ ] Durable lesson/decision from this task → **vault** `Knowledge/`
      (follow the vault's `_meta/Conventions.md`).
- [ ] Turn triggered by a channel message? → self-check: did the final answer
      go out through the reply tool?

## Adding new rules

A new working rule from the user ("from now on always X") → add it as a
checklist item under the right Moment here + bump the plugin version. Long
rationale goes to `references/`, never here. An item the logs show being
skipped repeatedly → propose promoting it to a hook (INJECTED reminder or
ENFORCED guard), per the living-checklist enforcement ladder.

## References

- `references/rules-rationale.md` — why each rule exists, self-check failure
  modes, enforcement-ladder background.
- `references/git-shared-repo.md` — full shared-repo git discipline: three-copy
  doctrine, force-push rules, the 2026-06-07 incident.
