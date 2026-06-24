# goal

AI-authored Claude Code goals, driven from Telegram.

## What it does

`/goal` lets the **AI** author and set a goal on your behalf — you don't type a raw
condition. Send `/goal` (or just ask "jadikan ini goal" during a chat) and the AI:

1. Discusses what you want to achieve, **interviewing** you if the context is unclear
   (you can cancel anytime).
2. Drafts a **precise, transcript-verifiable** condition (one measurable end-state,
   concise, bounded — e.g. "all tests in test/auth pass and lint is clean, or stop
   after 20 turns").
3. Shows the draft for approval with **[Ya] / [Tidak] / [Jelaskan manual]** inline
   buttons.
4. On approval, sets the goal and works toward it autonomously until an independent
   evaluator confirms it is met.

Send `/goal` again while a goal is running to see it and stop it.

## Architecture

`/goal` is **not** a meta-command. Like `/handoff`, the text `/goal` is **forwarded**
to the paired Claude Code session, where the AI runs this plugin's `goal` skill. The
autonomous loop engine is **Claude Code's built-in `/goal`**, which the skill injects
via `pty_send_slash` after you approve the condition. A best-effort, per-session
`goal-state.json` tracks the active goal so the skill can show/stop a running one.

There is deliberately **no `commands/goal.md`** — a custom `/goal` command would be
shadowed by the built-in. The skill is triggered by its `description` frontmatter when
the AI reads the forwarded text.

## Requirements

- The **telegram** plugin (the bridge + the `reply` inline-button tool).
- The **pty-controller** plugin and the **mirza-cc wrapper** running (for
  `pty_send_slash` injection of the built-in `/goal`).
- Claude Code **>= 2.1.139** (when the built-in `/goal` was introduced).
