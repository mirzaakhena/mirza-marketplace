---
name: handoff-resume
description: Use when the user invokes /handoff-resume at the start of a new Claude Code session to pick up where the previous session left off. Reads the latest file from <repo>/.handoff/, follows its plan pointer (and the chain only when needed), presents a brief summary, and waits for explicit confirmation before continuing the prescribed next steps.
---

# Resuming from a Handoff File

## When this skill runs

You were invoked by the `/handoff-resume` slash command. The command may pass an optional argument:

- **No argument** (default): full human-gate flow.
- **`yes`** (case-insensitive): user pre-confirmed — skip the confirmation question and proceed directly after showing the summary.

Your job:

1. Locate the repo's `.handoff/` directory and find the latest file.
2. Read the full file into your context.
3. Follow its pointers: read the linked **Related plan** file (the roadmap source of truth); read the **Continued from** parent handoff only if you need more context.
4. Show the user a short summary. If pre-confirmed, skip Step 5's question; otherwise ask for confirmation.
5. After confirmation (or redirection), proceed with full handoff context loaded.

## Step 1 — Locate the handoff directory

Determine the repo root: `git rev-parse --show-toplevel`. If that fails, use the current working directory.

Then look at `<repo-root>/.handoff/`.

Two failure paths:

- **Directory does not exist:** Reply: `"There's no .handoff/ directory in this repo. The previous session never created a handoff. You can start fresh, or run /handoff at the end of this session to begin journaling."` Then stop.
- **Directory exists but is empty:** Reply: `"The .handoff/ directory exists but is empty — no handoff saved yet. This session can start from scratch."` Then stop.

## Step 2 — Pick the latest file

List files in `.handoff/` matching the pattern `*.md`. Sort lexicographically and take the **last** entry. Because filenames start with `yyyymmddhhmm`, lex sort = chronological sort.

If multiple files share the same timestamp prefix (collision suffixes `-2`, `-3`, ...), the lex sort still picks correctly for up to nine collisions per minute. Beyond that the suffix would lex-sort `-10 < -2`, but ten handoffs in one minute is implausible — accept this as a known limit.

## Step 3 — Read the file and follow its pointers

> **CONTRACT:** the header fields and section numbers/headings used below match the 10-section structure produced by `/handoff` (see `skills/handoff/SKILL.md` Step 5). Do **not** edit references to header fields or to "Section N" without updating the writer in lockstep.

Use the Read tool. Load the entire file. The structure you rely on:

- **Header:** `Continued from` (parent handoff path) and `Related plan` (plan path + `phase N/total`).
- **Section 1** Project Context, **2** Completed, **3** In Progress / Unfinished, **4** Blockers, **5** Next Session Plan (next-step + starting point), **6** Brainstorming Choices (the *why*), **7** Artifacts (commits — reference detail), **8** Anti-Patterns (carry forward), **9** User Notes, **10** Other Notes.

Then follow the pointers:

- **Related plan** — if set, **read that plan file**. It is the source of truth for the phase checklist and the overall roadmap; the handoff only records the current position (`phase N/total`). Reading it tells you what the whole arc is and what remains. The handoff does NOT duplicate the checklist on purpose.
- **Continued from** — this links the previous handoff in an append-only chain. Do **NOT** auto-read the whole chain (it is token-expensive and the cumulative state lives in the plan, not in the chain). Read the parent handoff **only if** the latest one references context you are missing. Default: latest handoff + linked plan is enough.

### Legacy handoff files

Handoff files written before this version use the legacy Indonesian section and header names. You **must** read both formats equivalently — when a handoff uses the legacy names, map them to the English structure above. New files are always written with the English names; only treat older files this way.

| Legacy (Indonesian) | Current (English) |
|---|---|
| Header `Lanjutan dari` | `Continued from` |
| Header `Plan terkait` | `Related plan` |
| Spine `Sudah → Sedang → Blocker → Akan` | `Done → In Progress → Blockers → Next` |
| `Konteks Proyek` | `Project Context` |
| `Yang Sudah Selesai` | `Completed` |
| `Yang Sedang Dikerjakan/Belum Selesai` | `In Progress / Unfinished` |
| `Blocker` | `Blockers` |
| `Next Session Plan` | `Next Session Plan` (unchanged) |
| `Brainstorming Choices` | `Brainstorming Choices` (unchanged) |
| `Artefak` | `Artifacts` |
| `Anti-Patterns` | `Anti-Patterns` (unchanged) |
| `Catatan User` | `User Notes` |
| `Hal Penting Lain` | `Other Notes` |

## Step 4 — Show summary and confirm

Reply with this shape (omit lines whose source section is `—`):

```
I found the latest handoff: **{title}** (from {date}, repo {repo}).
{If Related plan set: "Plan: `{path}` — phase {N}/{total}."}

Completed:
{Section 2 condensed to 1-2 lines — the most actionable bullets}

{If Section 3 (In Progress) non-empty: "In progress/hanging: {1 line — the mid-flight state}"}
{If Section 4 (Blockers) non-empty: "⚠️ Blocker: {1 line}"}

Next plan:
{Section 5 Goal + 1-2 of the sub-bullets}

{If Section 6 has rows, add: "Context of the last decision: {one short summary of the most important row}"}
{If Section 8 has anti-patterns, add: "Important note: {one line}"}
{If Continued from set, add: "This continues handoff `{path}` (I'll read it if I need more context)."}

Are you sure you want to continue this handover task?
```

Then stop and wait for the user's reply. Do NOT begin executing the plan from Section 5 until the user confirms.

**If the `inline-buttons` skill is available** (listed in the session's available skills), render the confirmation as inline-keyboard buttons instead of plain text — the user is likely on Telegram and tapping is faster than typing. Invoke the skill, then attach `buttons` to your `reply` call:

```json
"buttons": [
  [
    {"label": "✅ Continue", "callback_id": "resume_yes"},
    {"label": "❌ Start fresh", "callback_id": "resume_no"}
  ],
  [
    {"label": "✏️ Explain manually", "callback_id": "manual"}
  ]
]
```

Map the tap in Step 5: `resume_yes` → confirm branch; `resume_no` → decline-without-redirect branch; `manual` → invite free-form text and treat the next message as the redirect/clarification. If `inline-buttons` is not installed, fall back to plain-text confirmation.

**If pre-confirmed via the `yes` argument:** skip the question entirely. Reply with only the summary plus a short acknowledgement (e.g. `"Auto-confirmed — starting execution of Section 5 right away."`), then proceed straight to Step 5's confirm branch without waiting. Still show the summary so the user can intervene if something looks wrong (e.g. wrong branch).

## Step 5 — Proceed based on user reply

- **User confirms** ("yes", "continue", "go", "yep", or similar): Acknowledge briefly, then begin executing Section 5's plan, resuming any mid-flight work captured in Section 3 and clearing Section 4 blockers if you now can. The full file content (and the linked plan) is already in your context — you do NOT need to re-read it. Apply the anti-patterns from Section 8 throughout your work.
- **User redirects** ("change course", "I want to do X first", or proposes a different task): Treat the handoff as background context only. Follow the new direction. Do NOT silently dismiss the handoff — you can still draw on Sections 1, 8, and 10 (project context, anti-patterns, environment) for the new work.
- **User declines without redirect**: Reply: `"OK, the handoff stays at {file path}. Let me know what you're working on today."` Then wait.

## Edge cases

- **More than one file in `.handoff/`.** Pick the lex-last. Do NOT mention the others — the user can `ls .handoff/` themselves if curious. (The `Continued from` chain is how earlier ones stay reachable when relevant.)
- **Related plan path is set but the file is missing** (moved/deleted/renamed). Note it in the summary: `"(plan `{path}` not found — the handoff points to phase N but the plan file is gone)"` and continue from the handoff alone.
- **File present but malformed (missing sections).** Read whatever you can. In your summary, say `"(some sections missing — handoff may be partial)"` so the user can decide.
- **File is empty.** Treat as the directory being empty: tell the user, do not crash.
- **Repo has changed branches since the handoff.** The handoff records its own branch in the header. If the current branch differs, mention it in the summary: `"Note: this handoff was created on branch X; you're now on branch Y."`
- **A recorded commit SHA is not found** (history rebased/squashed). Don't fail; the branch + commit message in the handoff help you re-locate. Mention it only if it blocks understanding.

## Anti-patterns to avoid

- ❌ Do NOT execute the Section 5 plan before the user confirms. The whole point of this skill is the human gate.
- ❌ Do NOT walk the entire `Continued from` chain by default. Read the latest handoff + the linked plan; follow the chain one hop only when context is genuinely missing.
- ❌ Do NOT delete or modify any handoff file or the plan file. They are journal entries / source of truth; future runs may need them.
- ❌ Do NOT load handoffs from other repos or directories. The lookup is scoped to the current repo's `.handoff/` only.
- ❌ Do NOT prompt the user a second time after they confirm. Once they say "yes", proceed without further questions (unless ambiguity arises during execution).
