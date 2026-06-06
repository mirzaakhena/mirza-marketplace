---
name: bot-conduct
description: Working rules for agent bots - apply whenever doing substantive work (code changes, multi-step tasks, anything that commits). Use git worktrees instead of branches in the main tree, sign commits with the bot's identity, prefer subagents for heavy work so the main loop stays responsive, answer in the channel the question came from (Telegram question = reply tool, never transcript-only), and read + update the shared playbook at ~/.claude/agent-playbook/PLAYBOOK.md.
---

# Bot Conduct — Working Rules for Agent Bots

Every bot on this machine (bot-01, bot-02, ...) is an agent working on the
user's behalf, often several at once, often unattended. These rules keep
their work isolated, attributable, responsive, and cumulative.

Your **bot name** is the basename of your project directory
(`CLAUDE_PROJECT_DIR`, e.g. `C:\Users\Mirza\workspace\bot-06` → `bot-06`).
Use it everywhere identity is called for below.

## Rule 1 — Git worktree, not branches in the main tree

When work needs isolation (feature work, experiments, anything riskier
than a trivial edit), create a **git worktree** instead of switching
branches in the main working tree:

- Native tooling first: `EnterWorktree` (or `isolation: "worktree"` on a
  subagent) when the harness provides it.
- Fallback: `git worktree add ../<repo>-<botname>-<topic> -b <topic>`.

Why worktrees and not branches: another bot (or the user) may have the
same repo open. Switching branches in a shared working tree yanks files
out from under them; a worktree gives you a private copy with shared
history. Clean up (`git worktree remove`) after merging.

## Rule 2 — Sign commits with your bot identity

Every commit an agent bot makes MUST carry the bot's name so the user can
trace which bot did what. Append a trailer to the commit message:

```
Agent: <bot-name>
```

Example final block of a commit message:

```
fix(parser): handle empty frontmatter

Agent: bot-06
Co-Authored-By: Claude <noreply@anthropic.com>
```

The `Agent:` trailer comes before any `Co-Authored-By:` lines. Don't
change `git config user.name` — that belongs to the user; the trailer is
the bot's signature.

## Rule 3 — Subagent-first for heavy work

The main loop's first duty is **staying responsive to the user**. Long
searches, broad refactors, test runs, research sweeps — delegate to
subagents (Agent tool / Task tool) whenever possible, with
`run_in_background` when you don't need the result immediately:

- Main loop: receive instructions, answer questions, send progress
  updates, make decisions.
- Subagents: explore codebases, execute multi-file changes, run
  long-running commands, draft documents.

Heuristic: if a step will keep you busy for more than ~a minute of tool
calls and the user might message you meanwhile, it belongs in a subagent.
Combine with the `immediate-reply` ack pattern so the user always sees
sign-of-life.

## Rule 4 — The shared playbook (read, apply, update)

A single cross-bot playbook lives at:

```
~/.claude/agent-playbook/PLAYBOOK.md
```

It holds **proven best practices** and **mistakes that must not be
repeated**, accumulated by every bot on this machine, for the next bot's
benefit. Continuity is the point: what one bot learns, all bots inherit.

**When to READ it:** at the start of any substantive task (before the
first commit, before touching unfamiliar infrastructure). If the file
does not exist yet, create it with the template below.

**When to UPDATE it:** the moment you learn something durable —
- a practice you verified works well (include *why* and *when to apply*),
- a mistake you made or nearly made (include the symptom, the root cause,
  and what to do instead),
- a gotcha about this machine/setup (paths, Windows quirks, tool limits).

Do NOT log session-specific trivia, secrets, or anything already covered
by a repo's CLAUDE.md — the playbook is for machine-wide, cross-project
lessons.

**Entry format** (append under the matching section, newest on top):

```markdown
### YYYY-MM-DD — <short title> (<bot-name>)
- **Context:** what was being done
- **Lesson:** the practice or the mistake + what to do instead
- **Apply when:** trigger condition for the next bot
```

**Template for first creation:**

```markdown
# Agent Playbook (shared across bots)

Machine-wide lessons. Every bot reads this before substantive work and
appends what it learns. Keep entries short; newest on top.

## Proven practices

## Mistakes — do not repeat

## Machine/setup gotchas
```

**Hygiene:** if an entry turns out to be wrong, edit or delete it (note
the correction). If the file exceeds ~200 lines, consolidate the oldest
entries into terser bullets — keep it readable in one sitting.

## Rule 5 — Channel discipline: answer where you were asked

The transcript is NOT the user. When a message arrives via a channel
(e.g. a Telegram `<channel>` block), the user is reading that channel —
anything you write outside the channel's `reply` tool NEVER reaches them.

- Question from **Telegram** → the final answer MUST be a `reply` tool
  call. Transcript text is only your internal workspace/log.
- Question typed in the **Claude Code terminal** → answer in the
  transcript; don't ping Telegram.
- Cross over only on explicit request ("kirim hasilnya ke telegram",
  "tulis di terminal saja").

**End-of-turn self-check (mechanical):** if this turn was triggered by a
channel message, ask "did my final answer go out through the reply tool?"
If the answer is no, you have NOT answered the user yet — send it before
ending the turn. A finished task with a beautiful transcript summary and
no reply call is a silent failure: the user sees nothing.

This failure mode is most common (a) at the end of long multi-step tasks,
(b) right after a subagent returns and you summarize its result, and
(c) after context compaction. The self-check exists precisely for those
moments.

## Rule 6 — Future rules land here

This skill is the designated home for new working rules. When the user
declares a new rule ("mulai sekarang selalu X"), add it to this SKILL.md
as a numbered rule (and bump this plugin's version) instead of scattering
it across repos' CLAUDE.md files — unless it is genuinely specific to one
repo.

## Quick checklist (per substantive task)

- [ ] Playbook read? (`~/.claude/agent-playbook/PLAYBOOK.md`)
- [ ] Isolation needed? → worktree, not branch-switch
- [ ] Heavy steps delegated to subagents; main loop kept responsive
- [ ] Commits carry `Agent: <bot-name>` trailer
- [ ] Triggered from a channel? → final answer went through `reply`
- [ ] New durable lesson learned? → append to the playbook
