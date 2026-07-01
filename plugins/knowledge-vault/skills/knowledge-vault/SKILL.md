---
name: knowledge-vault
description: Use when you produce or need durable TEAM knowledge — a lesson learned from a mistake, a decision (+ why), a reusable concept or pattern, a hard-won environment reference, or an open question worth tracking — that should live in the shared Obsidian vault (mirza-vault) instead of dying in a per-session log. Fires when you've just learned something reusable, finished substantive work worth recording, are about to write up findings, or want to check whether the team already solved a problem. Applies in any language (e.g. Indonesian "catat ke vault", "simpan pelajaran ini", "keputusan", "pelajaran"). Routes to the vault and its conventions; does NOT replace daily-report (external, ephemeral) or Plane (transactional work tracking).
---

# Knowledge Vault — the team's shared second brain

Every bot on this machine shares ONE knowledge base: an Obsidian vault at
`C:\Users\Mirza\mirza-vault`. It captures every **lesson, decision, concept,
pattern, reference, and open question** as reusable, densely-linked atomic notes,
so what one project/session learns helps the next — across bots and across time.

## Before you write to it (or look anything up)

Read the two onboarding files, in order:

1. **`_meta/Conventions.md`** — the **single source of truth**: folder structure,
   the note types, frontmatter, naming, and the capture→distillation pipeline.
   Follow it exactly.
2. **`Home.md`** — the front door / top Map of Content.

This skill is a **pointer + trigger**, not a copy of the spec. If anything here
and `Conventions.md` disagree, Conventions.md wins (it may have been updated).

## The essentials (enough to act)

- **Durable vs disposable.** Operational, time-bound project material (charter,
  running progress, scoreboard) lives in `Projects/<name>/`. Durable, reusable
  knowledge lives in `Knowledge/` — a **flat pool, no subfolders** — distinguished
  by the `type` frontmatter property + tags + MOCs, not by directory.
- **6 atomic note types** (all in `Knowledge/`): `lesson` · `decision` (ADR: chose
  A over B because C) · `concept` (mental model / lens) · `pattern` (reusable
  procedure) · `reference` (hard-won environment fact) · `open-question` (a tracked
  unknown; `status: open → resolved`, then link the answer). Plus `progress` as a
  project doc and one living `Glossary` note. **`result` is NOT a type** — numbers
  live as a scoreboard row inside Progress; promote to a standalone note only if a
  number becomes load-bearing (cited repeatedly).
- **Capture → distillation.** Capture cheaply as you work (append to the project's
  progress/log). When a finding proves **durable and cross-project**, *promote* it
  into an atomic `Knowledge/` note and link it from the relevant Theme MOC. If you
  haven't linked it yet, mark `filing: PENDING` in its frontmatter.
- **Naming:** type-prefix + a **declarative title that states the claim** — e.g.
  `lesson - Always control budget when claiming a lift.md`. The `type` frontmatter
  is the machine-readable source of truth; the filename prefix is for human sorting.
- **Templates:** start from `_meta/Templates/<type>.md` (core Templates plugin).
- **Deprecate, don't delete.** A lesson that turns out wrong gets
  `status: deprecated` — it stays linkable so the mistake isn't re-learned.
- **Low lock-in.** Plain markdown + wikilinks / backlinks / tags / MOCs. Plugins
  (Bases, Canvas) are optional sugar, never load-bearing.

## Contributing — the quick loop

1. Identify the `type`.
2. Copy `_meta/Templates/<type>.md`.
3. Write it **atomic** (one idea), file it **flat** in `Knowledge/` with a
   type-prefixed, declarative filename.
4. **Link it**: the relevant Theme MOC + the originating project + related notes.
   No orphans.
5. If it came from a project, add it under "Pelajaran dipanen" in that Project MOC.

## Looking things up

Before solving a problem, check if the team already did: search `Knowledge/` by
`type`, by tag (`#metodologi`, `#tooling`, …), or via a **Theme MOC**, then follow
**backlinks** to see every project that relied on a note.

## Boundaries (don't duplicate other tools)

- **Not daily-report** — that skill produces an *external, ephemeral* status
  broadcast (in the repo's `.daily-reports/`) that deliberately strips internal
  detail. The vault keeps the durable, detailed knowledge.
- **Not Plane** — that's transactional work tracking (tasks/status/cycles).
  Durable knowledge stays in the vault (markdown, low lock-in).

Do not re-document the spec here or in other repos' CLAUDE.md — improve
`mirza-vault/_meta/Conventions.md` itself; this skill just points there.
