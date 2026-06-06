# handoff

Toolkit for **session handoff** in Claude Code. This plugin captures a running session into a structured markdown file, then reloads it in a new session so context isn't lost every time you start from scratch. Skill-only — no MCP server, no hooks, no channel.

## Slash commands

| Command | Function |
|---|---|
| `/handoff [optional note]` | Save the current session to a new handoff file in `<repo>/.handoff/`. Free-form arguments go verbatim into Section 9. |
| `/handoff-resume` | In a new session: read the latest handoff, show a brief summary, wait for confirmation before continuing execution. |
| `/handoff-resume yes` | Pre-confirmed: the summary is still shown (so you can interrupt if something looks off), but execution continues immediately without waiting for an answer. |

`/handoff-resume` confirmation is Telegram-aware: if the `inline-buttons` skill is available in the session, the question "resume this handoff?" is rendered as inline buttons (`✅ Continue / ❌ Start fresh / ✏️ Explain manually`); otherwise it falls back to a plain text confirmation.

## Skills

| Skill | Used by | Task |
|---|---|---|
| `handoff` | `/handoff` | Run the clarity check, generate the 10-section content (chain + plan pointer + commit SHA), write the file to `.handoff/`. |
| `handoff-resume` | `/handoff-resume` | Find the latest file in `.handoff/`, follow its plan pointer, summarize, ask for user confirmation before executing. |

## Handoff file location

```
<repo-root>/.handoff/<yyyymmddhhmm>-prompt-<title>.md
```

- **Repo root** = result of `git rev-parse --show-toplevel`. If it's not a git repo, fall back to `pwd` with a warning.
- **Timestamp** = local time, format `YYYYMMDDHHMM` (no seconds).
- **Title** = kebab-case, ≤6 words, derived from the session content (or from the `/handoff` argument).
- If filenames collide within the same minute, append `-2`, `-3`, etc.
- Lexical sort of filenames = chronological sort, so `/handoff-resume` just grabs the last entry.

The file content uses a **10-section template** with the spine **Done → In Progress → Blockers → Next**: Project Context, Completed, In Progress / Unfinished, Blockers, Next Session Plan, Brainstorming Choices, Artifacts, Anti-Patterns, User Notes, Other Notes. The header also carries two pointers:

- **Continued from** — path of the previous handoff if this session is a continuation (append-only chain; each file is immutable, never re-edited).
- **Related plan** — path of a multi-phase plan file (e.g. from `superpowers:writing-plans`) + position `phase N/total`. That plan is the **source of truth** for the roadmap; the handoff just points to a position, it doesn't duplicate the checklist. Cross-session progress is read from the plan, not reconstructed from the handoff chain.

Artifacts also record the **HEAD SHA** (anchor), the session's **commit range**, and **per-phase** SHAs if the plan is multi-phase — so "what was done" can be verified via `git diff`, not just from prose. Full details are in `skills/handoff/SKILL.md` — the header fields + section structure are a contract between the two skills, don't change them unilaterally.

## Workflow

1. **End of session:** run `/handoff`. Optionally add a note: `/handoff focus on the login bug tomorrow`.
   - If the next-step direction isn't clear yet (e.g. the session was just exploration, or got left mid-debug), the skill **brainstorms first** — it won't write the file until the user picks an explicit direction. This is intentional — a vague handoff is worse than no handoff.
2. **New session in the same repo:** run `/handoff-resume`.
   - The skill loads the latest handoff, reads the linked plan file (if any), shows a summary (including the "in progress" state & blockers), then **waits for confirmation** ("yes"/"continue") before executing Section 5. The user can redirect ("change course, today I want X") — the handoff still serves as background context. The `Continued from` chain is only traversed if context is actually lacking — by default the latest handoff + plan is enough.

## Note on `.gitignore`

The plugin **doesn't touch** your `.gitignore`. Whether you commit the `.handoff/` folder or ignore it — that's your call. Some people like to commit it (a greppable journal), others prefer to ignore it (privacy / noise).

## Install

See the [root README](../../README.md#installation-in-claude-code) for full steps to add this marketplace. Once the marketplace is added:

```
/plugin install handoff@mirza-marketplace
/reload-plugins
```

Skill-only plugin, so there's no need to enable MCP or set a dev flag — it just works as soon as it's installed.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
