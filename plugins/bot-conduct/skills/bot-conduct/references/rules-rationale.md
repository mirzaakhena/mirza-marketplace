# Why each rule exists

Rationale moved out of SKILL.md during the 0.0.8 slim-down so the checklist
stays cheap to re-read. Read this when you need to explain or challenge a
rule, not on every task.

## Worktree, not branch-switch (Moment 1)

Another bot (or the user) may have the same repo open. Switching branches in
a shared working tree yanks files out from under them; a worktree gives you a
private copy with shared history. Clean up (`git worktree remove`) after
merging — stale worktrees pile up and confuse the next audit.

## Subagent-first (Moment 2)

The main loop's first duty is staying responsive. Long searches, broad
refactors, test runs, research sweeps belong in subagents — the user may
message mid-task and should not wait for a grep to finish. Combine with the
`immediate-reply` ack pattern so the user always sees sign-of-life.

## Agent: commit trailer (Moment 2)

All bots commit as the same git user (the user's identity); the trailer is
the only per-bot attribution. It must come before `Co-Authored-By:` lines.
Don't change `git config user.name` — that belongs to the user. A PreToolUse
hook (commit-trailer-guard) denies inspectable `git commit` commands missing
the trailer, so this rule is ENFORCED, not just written down.

## Push before idle / merge-or-record (Moment 3)

Incident 2026-07-17: three bench branches (12 + 17 + 5 commits, including the
REPRODUCE/LOCALIZE pipeline work) sat committed but unpushed with no upstream;
discovered only because the user happened to ask for a manual audit. A PC
failure would have lost all of it. Push-before-idle closes the loss window;
merge-or-record keeps the merge obligation visible in the handoff instead of
in a bot's expired context.

## Channel discipline + end-of-turn self-check (Moment 2 & 3)

The transcript is NOT the user. When a message arrives via a channel (e.g. a
Telegram `<channel>` block), anything outside that channel's `reply` tool
never reaches them. A finished task with a beautiful transcript summary and
no reply call is a silent failure. The self-check exists because this fails
most often (a) at the end of long multi-step tasks, (b) right after a
subagent returns and you summarize its result, and (c) after context
compaction.

## The enforcement ladder (why checklist text is not enough)

From the SWE-bench Gemma harness work (vault:
`Living-checklist skill — prosedur re-inject saat kondisi memicu`): rules
merely written in a prompt get ignored under load; the measurable fix is
condition→action rules re-injected when their condition fires, with three
tiers — [PROMPT] (written once, this file), [INJECTED] (reminder injected at
the moment, e.g. the telegram plugin's UserPromptSubmit turn-reminder),
[ENFORCED] (a hook blocks the bad action, e.g. commit-trailer-guard). A busy
bot behaves like a weak model: "the procedure is written" ≠ "the procedure
runs". When logs show a checklist item being skipped, promote it up the
ladder.
