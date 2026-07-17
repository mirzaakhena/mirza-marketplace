# bot-conduct

A skill-only plugin containing the **living checklist + working rules for agent bots** (bot-01, bot-02, ...) that work on the same machine on behalf of the user. No MCP server, no commands — one skill (`bot-conduct`) plus one enforcement hook.

Bot identity = the basename of the project directory (e.g. `C:\Users\Mirza\workspace\bot-06` → `bot-06`).

## Structure (since 0.0.8)

The skill is organized as a **checklist per lifecycle moment** — terse condition → action items, cheap to re-read on every task. Rationale and history live in `references/`, read only when the *why* is needed.

| Moment | Checklist covers |
|---|---|
| **1 — Starting a substantive task** | git worktree (never branch-switch in a shared tree) · Plane task set in-progress + added to the current cycle ("Week N") · session renamed from "idle" |
| **2 — During work** | subagent-first for heavy steps · `Agent: <bot-name>` commit trailer · three-copy doctrine check before any commit · push release commits immediately · answer via the originating channel's reply tool |
| **3 — Before idle / handoff / done** | every touched worktree pushed (no "ahead", no uncommitted) · merge to main OR record branch + commit hash + merge obligation in the handoff · remove merged worktrees · Plane task done · durable lessons to the vault + commit the vault (local-only git) · end-of-turn reply self-check |

References:

- `skills/bot-conduct/references/rules-rationale.md` — why each rule exists, failure modes, the [PROMPT] / [INJECTED] / [ENFORCED] enforcement ladder.
- `skills/bot-conduct/references/git-shared-repo.md` — full shared-repo git discipline (three-copy doctrine, force-push rules, the 2026-06-07 reclone incident).

## Enforcement

- `Agent:` commit trailer — **ENFORCED** by a PreToolUse hook (`commit-trailer-guard`): inspectable `git commit` commands without the trailer are denied with an explanation.
- Other checklist items are currently [PROMPT]-tier; items that logs show being skipped get promoted to [INJECTED] (hook-injected reminder) or [ENFORCED] per the enforcement ladder.

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
