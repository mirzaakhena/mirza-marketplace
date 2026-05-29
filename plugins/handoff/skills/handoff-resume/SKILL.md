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
3. Follow its pointers: read the linked **Plan terkait** file (the roadmap source of truth); read the **Lanjutan dari** parent handoff only if you need more context.
4. Show the user a short summary. If pre-confirmed, skip Step 5's question; otherwise ask for confirmation.
5. After confirmation (or redirection), proceed with full handoff context loaded.

## Step 1 — Locate the handoff directory

Determine the repo root: `git rev-parse --show-toplevel`. If that fails, use the current working directory.

Then look at `<repo-root>/.handoff/`.

Two failure paths:

- **Directory does not exist:** Reply: `"Tidak ada direktori .handoff/ di repo ini. Sesi sebelumnya belum pernah membuat handoff. Anda bisa mulai segar atau jalankan /handoff di akhir sesi ini untuk mulai journaling."` Then stop.
- **Directory exists but is empty:** Reply: `"Direktori .handoff/ ada tapi kosong — belum ada handoff tersimpan. Sesi ini bisa mulai dari awal."` Then stop.

## Step 2 — Pick the latest file

List files in `.handoff/` matching the pattern `*.md`. Sort lexicographically and take the **last** entry. Because filenames start with `yyyymmddhhmm`, lex sort = chronological sort.

If multiple files share the same timestamp prefix (collision suffixes `-2`, `-3`, ...), the lex sort still picks correctly for up to nine collisions per minute. Beyond that the suffix would lex-sort `-10 < -2`, but ten handoffs in one minute is implausible — accept this as a known limit.

## Step 3 — Read the file and follow its pointers

> **CONTRACT:** the header fields and section numbers/headings used below match the 10-section structure produced by `/handoff` (see `skills/handoff/SKILL.md` Step 5). Do **not** edit references to header fields or to "Section N" without updating the writer in lockstep.

Use the Read tool. Load the entire file. The structure you rely on:

- **Header:** `Lanjutan dari` (parent handoff path) and `Plan terkait` (plan path + `fase N/total`).
- **Section 1** Konteks Proyek, **2** Sudah, **3** Sedang/Belum Selesai, **4** Blocker, **5** Akan (next-step + starting point), **6** Pilihan/Keputusan (the *why*), **7** Artefak (commits — reference detail), **8** Anti-Patterns (carry forward), **9** Catatan User, **10** Hal Penting Lain.

Then follow the pointers:

- **Plan terkait** — if set, **read that plan file**. It is the source of truth for the phase checklist and the overall roadmap; the handoff only records the current position (`fase N/total`). Reading it tells you what the whole arc is and what remains. The handoff does NOT duplicate the checklist on purpose.
- **Lanjutan dari** — this links the previous handoff in an append-only chain. Do **NOT** auto-read the whole chain (it is token-expensive and the cumulative state lives in the plan, not in the chain). Read the parent handoff **only if** the latest one references context you are missing. Default: latest handoff + linked plan is enough.

## Step 4 — Show summary and confirm

Reply with this shape (omit lines whose source section is `—`):

```
Saya menemukan handoff terakhir: **{title}** (dari {date}, repo {repo}).
{If Plan terkait set: "Plan: `{path}` — fase {N}/{total}."}

Sudah selesai:
{Section 2 condensed to 1-2 lines — the most actionable bullets}

{If Section 3 (Sedang) non-empty: "Sedang/menggantung: {1 line — the mid-flight state}"}
{If Section 4 (Blocker) non-empty: "⚠️ Blocker: {1 line}"}

Rencana berikutnya:
{Section 5 Goal + 1-2 of the sub-bullets}

{If Section 6 has rows, add: "Konteks pilihan terakhir: {one short summary of the most important row}"}
{If Section 8 has anti-patterns, add: "Catatan penting: {one line}"}
{If Lanjutan dari set, add: "Ini lanjutan dari handoff `{path}` (saya baca kalau perlu konteks lebih)."}

Apakah Anda yakin ingin melanjutkan task handover ini?
```

Then stop and wait for the user's reply. Do NOT begin executing the plan from Section 5 until the user confirms.

**If the `interactive-prompts` skill is available** (listed in the session's available skills), render the confirmation as inline-keyboard buttons instead of plain text — the user is likely on Telegram and tapping is faster than typing. Invoke the skill, then attach `buttons` to your `reply` call:

```json
"buttons": [
  [
    {"label": "✅ Lanjutkan handoff", "callback_id": "resume_yes"},
    {"label": "❌ Mulai segar", "callback_id": "resume_no"}
  ],
  [
    {"label": "✏️ Jelaskan manual", "callback_id": "manual"}
  ]
]
```

Map the tap in Step 5: `resume_yes` → confirm branch; `resume_no` → decline-without-redirect branch; `manual` → invite free-form text and treat the next message as the redirect/clarification. If `interactive-prompts` is not installed, fall back to plain-text confirmation.

**If pre-confirmed via the `yes` argument:** skip the question entirely. Reply with only the summary plus a short acknowledgement (e.g. `"Auto-confirmed — langsung mulai eksekusi Section 5."`), then proceed straight to Step 5's confirm branch without waiting. Still show the summary so the user can intervene if something looks wrong (e.g. wrong branch).

## Step 5 — Proceed based on user reply

- **User confirms** ("ya", "lanjut", "iya", "yes", or similar): Acknowledge briefly, then begin executing Section 5's plan, resuming any mid-flight work captured in Section 3 and clearing Section 4 blockers if you now can. The full file content (and the linked plan) is already in your context — you do NOT need to re-read it. Apply the anti-patterns from Section 8 throughout your work.
- **User redirects** ("ganti haluan", "saya mau X dulu", or proposes a different task): Treat the handoff as background context only. Follow the new direction. Do NOT silently dismiss the handoff — you can still draw on Sections 1, 8, and 10 (project context, anti-patterns, environment) for the new work.
- **User declines without redirect**: Reply: `"OK, handoff tetap ada di {file path}. Silakan beri tahu saya apa yang Anda kerjakan hari ini."` Then wait.

## Edge cases

- **More than one file in `.handoff/`.** Pick the lex-last. Do NOT mention the others — the user can `ls .handoff/` themselves if curious. (The `Lanjutan dari` chain is how earlier ones stay reachable when relevant.)
- **Plan terkait path is set but the file is missing** (moved/deleted/renamed). Note it in the summary: `"(plan `{path}` tidak ketemu — handoff menunjuk ke fase N tapi file plan-nya hilang)"` and continue from the handoff alone.
- **File present but malformed (missing sections).** Read whatever you can. In your summary, say `"(some sections missing — handoff may be partial)"` so the user can decide.
- **File is empty.** Treat as the directory being empty: tell the user, do not crash.
- **Repo has changed branches since the handoff.** The handoff records its own branch in the header. If the current branch differs, mention it in the summary: `"Catatan: handoff ini dibuat di branch X; Anda sekarang di branch Y."`
- **A recorded commit SHA is not found** (history rebased/squashed). Don't fail; the branch + commit message in the handoff help you re-locate. Mention it only if it blocks understanding.

## Anti-patterns to avoid

- ❌ Do NOT execute the Section 5 plan before the user confirms. The whole point of this skill is the human gate.
- ❌ Do NOT walk the entire `Lanjutan dari` chain by default. Read the latest handoff + the linked plan; follow the chain one hop only when context is genuinely missing.
- ❌ Do NOT delete or modify any handoff file or the plan file. They are journal entries / source of truth; future runs may need them.
- ❌ Do NOT load handoffs from other repos or directories. The lookup is scoped to the current repo's `.handoff/` only.
- ❌ Do NOT prompt the user a second time after they confirm. Once they say "ya", proceed without further questions (unless ambiguity arises during execution).
