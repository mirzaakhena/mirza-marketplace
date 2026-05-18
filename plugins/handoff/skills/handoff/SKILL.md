---
name: handoff
description: Use when the user invokes /handoff to capture the current session so it can be resumed cleanly later. Runs a clarity check first; if next-step direction is unclear, the AI brainstorms with the user before writing the file. Final output is a markdown file in <repo>/.handoff/ following an 8-section template.
---

# Handoff: Capturing a Session for the Next One

## When this skill runs

You were invoked by the `/handoff` slash command. The user's argument string (free-form notes, possibly empty) was passed to you. Your job is to:

1. Run the **clarity check** below.
2. If unclear, brainstorm with the user until clear.
3. Generate the handoff file content following the 8-section template.
4. Write the file into the repo's `.handoff/` directory.
5. Confirm to the user with the file path.

## Step 1 — Clarity check (REQUIRED, before any writing)

Before writing any file, decide whether the **next-session direction** is clear enough that someone reading the handoff cold could act on it.

**Default: assume UNCLEAR.** Brainstorm with the user unless **all three** of these positive signals hold:

1. **You can name the next step in one sentence without hedging.** ("Implement Opsi B for SWE-bench" passes; "continue working on X" or "address open items" does not.)
2. **You can name the file, branch, or spec where it lives.** A concrete artefact — `docs/superpowers/specs/2026-04-27-handoff-design.md`, branch `add-swe-bench`, or "the failing test in `app/auth_test.py`" — exists and you can cite it.
3. **The user confirmed this is the next step in this session.** Either through an explicit choice ("lanjut ke Opsi B", "saya pilih A"), an approved spec/plan committed during the session, or a direct instruction. AI-inferred "probably they want X" does NOT count.

If any of the three is missing, the direction is unclear.

**Common situations where clarity FAILS even though something feels in progress:**

- The session was exploratory Q&A with no decision recorded.
- Multiple plausible next steps exist and the user has not chosen between them.
- The session ended mid-edit or mid-debug; the breakage exists but isn't characterised.
- The session was a long debug with a fix not yet validated by the user.
- The session is blocked on something external ("waiting for review", "credentials needed").
- You yourself feel uncertain about how to interpret what comes next.

**If unclear: brainstorm before writing.** Use the same discipline as the `superpowers:brainstorming` skill: one question at a time, multiple-choice when possible, lead with a recommendation. Do NOT write the file until the user's answers leave you with a clear next step. Examples of brainstorm questions:

- "Anda ingin lanjut ke Opsi B di sesi berikutnya, atau ada arah lain yang sedang dipertimbangkan?"
- "Sesi ini banyak eksplorasi tapi belum ada keputusan eksplisit. Sebelum saya tulis handoff, mana yang paling tepat sebagai 'next step'? (a) merge dan deploy fitur X, (b) lanjut bug Y, (c) pause dan sesi berikutnya tentukan arah baru"
- "Sesi ini ditinggalkan dengan test yang gagal. Yakin sudah cukup informasi untuk handoff, atau lebih baik kita rangkum dulu state of the bug sebelum tulis file?"

Once the user answers, proceed to Step 2.

## Step 2 — Generate the title

The title goes in the filename: `<yyyymmddhhmm>-prompt-<title>.md`.

Rules:

- Lowercase, kebab-case, ≤6 words, alphanumerics and hyphens only.
- Inferred from what the session was about, biased toward what is most useful for the next session ("swe-bench-add-deploy" beats "session-2026-04-27").
- If the user's `/handoff` argument contains a clear topic phrase, you may use it as the title hint (slugify it). Otherwise infer from the session.

Examples:

- A session that finished SWE-bench browse-only and is teeing up Opsi B → `swe-bench-add-deploy-prep`
- A session debugging a flaky test → `flaky-checkout-test-fix`
- A session reviewing PRs without changes → `pr-review-2026-04-28` (date in title is acceptable when the session has no clear topic)

Validate the title before writing. If it has more than 6 words or contains illegal characters, trim and clean it.

## Step 3 — Compute the filename

- Timestamp: local time, format `YYYYMMDDHHMM` (no seconds).
- Path: `<repo-root>/.handoff/<yyyymmddhhmm>-prompt-<title>.md`.
- **Repo root** is the nearest ancestor of the current working directory that contains a `.git/` directory. Use `git rev-parse --show-toplevel`. If that fails (not in a git repo), fall back to `pwd` and warn the user once in your final message.
- Create `.handoff/` if it does not exist.
- If the exact filename already exists (rare: same minute, same title), append `-2`, `-3`, ... before `.md` until you find a free name.

## Step 4 — Generate the content

> **CONTRACT:** the section numbers and headings below are part of the cross-skill contract with `/handoff-resume`. Do **not** add, remove, or renumber sections without updating `skills/handoff-resume/SKILL.md` in lockstep. Section *content* is free-form; section *structure* is shared.

Use the 8-section template below. Every section is present even if its content is `—` (so `/handoff-resume` can parse predictably).

Use `git log`, `git status`, `git diff --stat`, the conversation, and any TodoWrite/superpowers state visible in the session to fill the sections. Be specific — cite commit SHAs, file paths, and document paths.

**Template (the AI generates this; do not load `template.md` from disk — it exists for human reference only):**

```markdown
# {Title in Title Case}

**Date:** YYYY-MM-DD HH:MM ({TZ})
**Repo:** {basename of `git rev-parse --show-toplevel`, or basename of `pwd` if not in git}
**Branch:** {git branch} (HEAD: {short SHA})
**Generated by:** /handoff [{verbatim user argument, or blank}]

---

## 1. Konteks Proyek
2-4 kalimat tentang proyek secara umum supaya sesi baru paham domain
tanpa perlu baca CLAUDE.md panjang lebar. Sebut: domain, stack utama,
ada apa di repo ini.

## 2. Yang Sudah Selesai di Sesi Ini
- Bullet pendek dengan action verb + objek konkret.
- Sertakan referensi commit SHA, file path, atau spec/plan inline.
- Lebih spesifik > lebih panjang. Hindari narasi.

## 3. Pilihan & Keputusan User Lewat Brainstorming
| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| {pertanyaan singkat} | {jawaban user} | {dampak ke kode atau next step} |

(If no brainstorming choices were made in this session, write `—` instead of an empty table.)

## 4. Artefak yang Dihasilkan
- **Spec:** `path/to/spec.md` (atau `—`)
- **Plan:** `path/to/plan.md` (atau `—`)
- **Commits:** {N} commits ({base-SHA}..{head-SHA})
- **Files baru:** ...
- **Files diubah:** ...
- **Files dihapus:** ...

To compute the commit range, use `git log --oneline <merge-base>..HEAD`
where `<merge-base>` is the closest ancestor of HEAD and the default
branch (usually `main` or `master`). If you cannot determine a sensible
base, list the commits made during this session by checking `git reflog`
or by counting commits with timestamps inside the session window.

## 5. Anti-Patterns / Lessons Learned (CARRY FORWARD)
> Aturan-aturan ini berlaku untuk pengembangan selanjutnya juga.

- ❌ JANGAN ... (alasan / konteks insiden di sesi ini kalau ada)
- ✅ LAKUKAN ... (alasan)

(If no carry-forward lessons emerged, write `—`.)

## 6. Apa yang Akan Dikerjakan di Sesi Berikutnya
**Goal:** {one-sentence}

- Step / area / decision needing follow-up
- ...

**Starting point untuk sesi baru:**
- Branch: {current branch, or instruction like "rebase add-foo onto main first"}
- Existing spec/plan to read first: {path}

## 7. Catatan Tambahan dari User
{verbatim from /handoff <extra info>, or `—` if argument was empty}

## 8. Hal-Hal Penting Lain untuk Sesi Berikutnya
- Environment, tooling, host IP, credentials notes
- Open questions you noticed but the user hasn't decided yet
- Anything else surprising or hard to rediscover from code alone
- Time-sensitive items (deadlines, freeze windows)
```

## Step 5 — Write the file

Use the Write tool with the absolute path computed in Step 3. Do not modify any other file (do not auto-edit `.gitignore`).

## Step 6 — Confirm to the user

Reply briefly:

> "Handoff tersimpan di `<absolute path>`. Untuk melanjutkan di sesi baru, jalankan `/handoff-resume` dari direktori repo yang sama."

If you fell back to `pwd` because not in a git repo, add a one-line warning before the confirmation.

## Edge cases

- **Argument provided but session has no substantive content.** The clarity check covers this: the AI brainstorms first, e.g. "Sesi ini belum ada konten substantif untuk di-handoff. Yakin tetap mau buat file? Atau ada konteks yang belum saya catat?"
- **Filename collision.** Append `-2`, `-3`, ... before `.md`.
- **`.handoff/` already exists with files.** Fine — just add a new file.
- **User runs `/handoff` again immediately.** Clarity check will likely pass (the previous handoff is the latest "next step"); produce a new file with a slightly newer timestamp.
- **Repo with no commits yet.** Use `pwd` as the root, warn once.

## Anti-patterns to avoid

- ❌ Do NOT silently overwrite an existing handoff file. Always create a new file with the timestamp/title naming. If a collision occurs, suffix with `-2`, `-3`.
- ❌ Do NOT auto-edit `.gitignore`. The README explains the trade-off; the user owns that choice.
- ❌ Do NOT pad the handoff with filler. Every bullet should be actionable or referential.
- ❌ Do NOT write a handoff file when the clarity check fails. Brainstorm first.
