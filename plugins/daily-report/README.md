# daily-report

A skill-only Claude Code plugin that helps you put together a **paste-ready daily work report for any chat app** (plain text, provider-agnostic) from your recent git activity plus a free-form prompt. It ships one slash command (`/daily-report`) and one skill (`writing-daily-report`) that holds the locked template, style rules, and anti-fabrication guard.

Best used at the end of the day (D) for a report you'll post the next morning (D+1).

## Slash commands

| Command | Arguments | Function |
|---|---|---|
| `/daily-report` | `[optional free-form prompt]` | Runs `gather-context.sh` to collect git context (commits, status, TODO, previous archive, extra files), invokes the `writing-daily-report` skill, then generates the final report. Saves it to `.daily-reports/<DATE>.md`, copies it to the clipboard (cross-platform: `pbcopy`/`clip.exe`/`xclip`/`wl-copy`, best-effort), and prints a preview to the conversation. |

The free-form prompt can contain: commit hashes, file paths (which get included in the context), a `Today` hint, a project name override (`project=<name>`), or a bullet count override (e.g. `"make it 7 yesterday, 4 today"`).

## Skills

| Skill | When it triggers | Function |
|---|---|---|
| `writing-daily-report` | Invoked by `/daily-report` when the user needs a paste-ready daily report | Holds the locked `# Yesterday` / `# Today` template, the generation procedure, the style rules (≤15 words per bullet, single sentence, no fancy markdown), and the anti-fabrication guard. Default output: 5 Yesterday bullets + 3 Today bullets, in English (auto-translates if the user's prompt is in another language). |

## Output format

Plain text, no markdown rendering, paste-ready to any chat app:

```
Hello, this is my daily report:

# Yesterday
- <action verb> <object> <short qualifier>
- ... (default 5 bullets)

# Today
- <action verb> <object> <short qualifier>
- ... (default 3 bullets)
```

The result is saved to `.daily-reports/<YYYY-MM-DD>.md` relative to the repo root (overwriting if it already exists), then copied to the clipboard using whichever tool is available on the platform (`pbcopy` on macOS, `clip.exe` on Windows, `xclip`/`wl-copy` on Linux). Best-effort — if none is available, the user is asked to copy manually from the file.

## Where the context comes from

`gather-context.sh` collects a deterministic context blob with the sections `===REPO===`, `===DATE===`, `===BRANCH===`, `===COMMITS===`, `===STATUS===`, `===TODO===`, `===PREV_ARCHIVE===`, `===EXTRA_FILES===`. Key details:

- **Tiered commit selection:** (1) commits newer than the mtime of the last archive in `.daily-reports/`; if there are < 2 commits, (2) fall back to commits from the last 24 hours; if still < 2, (3) fall back to the last 10 commits.
- **Optional TODO file:** `.daily-report.todo.md` at the repo root — if present, its contents become hints for the `Today` section.
- **Previous archive:** the last report in `.daily-reports/` is read too for continuity (yesterday's unfinished `Today` items get carried over again).
- **Extra files:** file paths mentioned in the free-form prompt are passed as script arguments and included in the context.

The `Today` section is filled by priority order: free-form prompt hint → the "Next" section from a handoff created this session (legacy handoffs name it "Akan") → leftover `Today` items from the previous archive → TODO entries → a reasonable continuation of `Yesterday`. If everything is empty, the skill **asks the user** instead of making things up.

An annotated example report lives in `skills/writing-daily-report/examples.md`.

### Core rules (anti-fabrication)

This skill holds strict rules to keep the report honest and free of hallucination:

- **Anchoring `Yesterday` vs `Today`** — `Yesterday` = what's **already done** at the time of writing (D). `Today` = what's **not yet done** and will be worked on D+1. No pre-crediting work that's "supposedly finishing tonight".
- **No fabrication** — every bullet must be traceable to evidence: a commit subject/body, a diff, a file path, a branch name, a TODO entry, the previous archive, or the user's prompt text. No making up activity.
- **Specific terminology only if the token appears in the context** — you can mention `Postgres`, `JWT middleware`, `argon2` only if that word literally appears in a commit/diff/file path. No inventing.
- **Boss-readable strip** — drop commit hashes, branch names, PR/MR/issue numbers, internal file paths, function names with underscores, and endpoint URLs from the bullets. Write the activity that name represents, not the identifier itself.
- **No padding** — when context is thin, produce fewer bullets rather than hitting the target with bullshit. The skill will explicitly flag it to the user when the context is too thin.
- **No AI/Claude mention** — even if the commits were AI-generated, the bullets are still written as human work ("Implement X").
- **Word cap** — aim for 10–15 words per bullet, **hard cap 15**. No multi-sentence bullets.

## Install

Add the marketplace first (see the [root README](../../README.md) for the full steps), then:

```
/plugin install daily-report@mirza-marketplace
/reload-plugins
```

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
