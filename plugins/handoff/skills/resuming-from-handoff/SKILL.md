---
name: resuming-from-handoff
description: Use when the user invokes /handoff-resume at the start of a new Claude Code session to pick up where the previous session left off. Reads the latest file from <repo>/.handoff/, presents a brief summary, and waits for explicit confirmation before continuing the prescribed next steps.
---

# Resuming from a Handoff File

## When this skill runs

You were invoked by the `/handoff-resume` slash command. The user has no argument to give you. Your job:

1. Locate the repo's `.handoff/` directory and find the latest file.
2. Read the full file into your context.
3. Show the user a short summary and ask for confirmation.
4. After confirmation (or redirection), proceed with full handoff context loaded.

## Step 1 — Locate the handoff directory

Determine the repo root: `git rev-parse --show-toplevel`. If that fails, use the current working directory.

Then look at `<repo-root>/.handoff/`.

Two failure paths:

- **Directory does not exist:** Reply: `"Tidak ada direktori .handoff/ di repo ini. Sesi sebelumnya belum pernah membuat handoff. Anda bisa mulai segar atau jalankan /handoff di akhir sesi ini untuk mulai journaling."` Then stop.
- **Directory exists but is empty:** Reply: `"Direktori .handoff/ ada tapi kosong — belum ada handoff tersimpan. Sesi ini bisa mulai dari awal."` Then stop.

## Step 2 — Pick the latest file

List files in `.handoff/` matching the pattern `*.md`. Sort lexicographically and take the **last** entry. Because filenames start with `yyyymmddhhmm`, lex sort = chronological sort.

If multiple files share the same timestamp prefix (collision suffixes `-2`, `-3`, ...), the lex sort still picks correctly for up to nine collisions per minute. Beyond that the suffix would lex-sort `-10 < -2`, but ten handoffs in one minute is implausible — accept this as a known limit.

## Step 3 — Read the file

> **CONTRACT:** the section numbers and headings used below match the 8-section structure produced by `/handoff` (see `skills/writing-handoff/SKILL.md` Step 4). Do **not** edit references to "Section 2", "Section 5", "Section 6" without updating the writer in lockstep.

Use the Read tool. Load the entire file. You will need the title, dates, Sections 1, 2, 5, 6, 7, 8 to summarise. Section 3 (brainstorming choices) often contains the *why* behind the next step — surface it when non-empty. Section 4 (artefacts) is reference detail; cite items only if directly relevant.

## Step 4 — Show summary and confirm

Reply with this exact shape:

```
Saya menemukan handoff terakhir: **{title}** (dari {date}, repo {repo}).

Sesi sebelumnya selesai:
{Section 2 condensed to 1-2 lines — the most actionable bullets}

Rencana berikutnya:
{Section 6 Goal + 1-2 of the sub-bullets}

{If Section 3 has rows, add a one-liner: "Konteks pilihan terakhir: {one short summary of the most important Section 3 row}"}
{If Section 5 has anti-patterns, add: "Catatan penting: {one line}"}

Apakah Anda yakin ingin melanjutkan task handover ini?
```

Then stop and wait for the user's reply. Do NOT begin executing the plan from Section 6 until the user confirms.

## Step 5 — Proceed based on user reply

- **User confirms** ("ya", "lanjut", "iya", "yes", or similar): Acknowledge briefly, then begin executing Section 6's plan. The full file content is already in your context — you do NOT need to re-read it. Apply the anti-patterns from Section 5 throughout your work.
- **User redirects** ("ganti haluan", "saya mau X dulu", or proposes a different task): Treat the handoff as background context only. Follow the new direction. Do NOT silently dismiss the handoff — you can still draw on Sections 1, 5, and 8 (project context, anti-patterns, environment) for the new work.
- **User declines without redirect**: Reply: `"OK, handoff tetap ada di {file path}. Silakan beri tahu saya apa yang Anda kerjakan hari ini."` Then wait.

## Edge cases

- **More than one file in `.handoff/`.** Pick the lex-last. Do NOT mention the others — the user can `ls .handoff/` themselves if curious.
- **File present but malformed (missing sections).** Read whatever you can. In your summary, say `"(some sections missing — handoff may be partial)"` so the user can decide.
- **File is empty.** Treat as the directory being empty: tell the user, do not crash.
- **Repo has changed branches since the handoff.** The handoff records its own branch in the header. If the current branch differs, mention it in the summary: `"Catatan: handoff ini dibuat di branch X; Anda sekarang di branch Y."`

## Anti-patterns to avoid

- ❌ Do NOT execute the Section 6 plan before the user confirms. The whole point of this skill is the human gate.
- ❌ Do NOT delete or modify the handoff file. It is a journal entry; future runs of `/handoff-resume` may need it.
- ❌ Do NOT load handoffs from other repos or directories. The lookup is scoped to the current repo's `.handoff/` only.
- ❌ Do NOT prompt the user a second time after they confirm. Once they say "ya", proceed without further questions (unless ambiguity arises during execution).
