# bot-conduct

A skill-only plugin containing **working rules for agent bots** (bot-01, bot-02, ...) that work on the same machine on behalf of the user. No MCP server, no commands — just one skill: `bot-conduct`.

Bot identity = the basename of the project directory (e.g. `C:\Users\Mirza\workspace\bot-06` → `bot-06`).

## Rules encoded here

| # | Rule | Gist |
|---|---|---|
| 1 | **Git worktree, not branch-switch** | Work that needs isolation is done in a worktree (`EnterWorktree` / `git worktree add`), not by switching branches in the main working tree — another bot or the user might be using that same tree. |
| 2 | **Identity-stamped commits** | Every commit carries an `Agent: <bot-name>` trailer (before `Co-Authored-By:`), so the user can trace which bot did what. `git config user.name` is left untouched. |
| 3 | **Subagent-first** | Heavy work (broad search, multi-file refactor, test runs, research) is delegated to a subagent so the main loop stays responsive to the user. Heuristic: >~1 minute of tool calls + the user might chat mid-task → subagent. |
| 4 | **Cross-bot playbook** | The shared file `~/.claude/agent-playbook/PLAYBOOK.md`: proven best practices + mistakes that must not be repeated + machine gotchas. Read at the start of a substantial task, updated whenever there's a durable lesson. Entry format + template + hygiene rules live in SKILL.md. |
| 5 | **Channel discipline** | Answer in the channel the question came from: a Telegram question → the final answer MUST go through the `reply` tool (the transcript isn't the user!); a question in the CC terminal → answer in the transcript. Cross over only on explicit request. Mechanical self-check at the end of the turn: "did my final answer go through the reply tool?" |
| 6 | **A home for new rules** | A new working rule from the user gets added as a numbered rule in this skill (then bump the version), not scattered across per-repo CLAUDE.md files — unless it really is specific to one repo. |
| 7 | **Shared-repo git discipline** | Three-copy doctrine for ANY marketplace-registered repo: its `workspace/<repo-name>` clone is the canonical copy and the only place to edit/commit; `~/.claude/plugins/marketplaces/**` is the updater's READ-ONLY copy (sync via `git pull --ff-only` only); `~/.claude/plugins/cache/**` is builds. Mechanical check before any commit: `git rev-parse --show-toplevel` must not be under `~/.claude/plugins/`. Plus: push every release commit immediately; no force-push without cross-clone checks + user confirmation + bot coordination. Born from the 2026-06-07 mirza-marketplace reclone incident — details in that repo's `docs/SOP-git-multi-agent.md`. |

## Why a playbook?

Continuity. Bots come and go per session; the lessons must not vanish with them. What one bot learns (proven practices, costly mistakes, Windows setup quirks) is passed down to the next bot through one file that's always read before work begins.

What does NOT go in the playbook: session-specific trivia, secrets, and things already recorded in each repo's CLAUDE.md.

## Installation

Add the marketplace first (see [root README](../../README.md)), then:

```
/plugin install bot-conduct@mirza-marketplace
/reload-plugins
```

## Pairs well with

- [`immediate-reply`](../immediate-reply/) — the subagent-first rule works best alongside the instant-ack pattern.
- [`agent-bus`](../agent-bus/) — coordination between bots that all abide by this conduct.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
