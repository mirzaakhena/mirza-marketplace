# Agent Playbook (shared across bots)

Machine-wide lessons. Every bot reads this before substantive work and
appends what it learns. Keep entries short; newest on top.

## Proven practices

### 2026-06-07 — Three-copy doctrine for the marketplace repo (bot-01, user decision)
- **Context:** follow-up to the reclone incident below; user made it a hard rule.
- **Lesson:** edit/commit ONLY in `C:\Users\Mirza\workspace\mirza-marketplace` (canonical; parallel work via worktrees). `~/.claude/plugins/marketplaces/**` is the updater's READ-ONLY copy (sync via `git pull --ff-only` only); `~/.claude/plugins/cache/**` is builds. Mechanical check before any commit: `git rev-parse --show-toplevel` must NOT be under `~/.claude/plugins/` — else STOP and move. Full SOP: `docs/SOP-git-multi-agent.md` in the repo; bot-conduct ≥ 0.0.4 Rule 7.
- **Apply when:** touching anything in the mirza-marketplace repo (or any plugin-managed clone).

### 2026-06-06 — Verify "pre-existing failure" claims with git stash (bot-06)
- **Context:** telegram plugin test suite had 5 failures after edits; CLAUDE.md documented only 4.
- **Lesson:** before blaming (or excusing) a test failure, `git stash -u` → run the same test on the clean tree → `git stash pop`. Takes 30 seconds, turns "probably pre-existing" into proof.
- **Apply when:** any test fails in a repo you just edited and you suspect it isn't yours.

### 2026-06-06 — PS 5.1 chokes on multiline git commit -m with embedded quotes (bot-06)
- **Context:** `git commit -m @'...'@` here-string with `"` inside failed with pathspec errors on Windows PowerShell 5.1.
- **Lesson:** for multiline commit messages, use the Bash tool with single-quoted `-m '...'` instead of PowerShell here-strings.
- **Apply when:** committing with multi-paragraph messages on this machine.

## Mistakes — do not repeat

### 2026-06-07 — Unpushed commits in marketplaces/ dir wiped by auto-update reclone (bot-05)
- **Context:** ~25 unpushed local commits in `~/.claude/plugins/marketplaces/mirza-marketplace` (incl. handoff v2 0.0.9, telegram 0.0.30, inline-buttons 0.0.7, agent-bus 0.0.7 + spec/plan docs) vanished: bot-06 force-pushed a squashed single-commit history ("anglicize") to GitHub from an older base, and the plugin system replaced the local dir with a FRESH CLONE (reflog showed only `clone:`). Content regressed while version numbers moved past ours.
- **Lesson:** (1) `marketplaces/<name>/` is NOT a safe working repo — the updater can reclone it wholesale; push every release commit to origin immediately, or work in a separate clone and push there. (2) Before rewriting/force-pushing shared-repo history, check `git log origin/main..main` AND coordinate with other bots via the user — someone else's unpushed work may exist. (3) Released plugin content is always recoverable from `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. (4) Cache holding a version HIGHER than the workspace plugin.json is a RED FLAG of unpushed releases — investigate where they came from before "bumping past" the number (bot-06 misread this signal hours before the wipe). (5) After a reclone, the updater stamps obsolete cache dirs with `.orphaned_at` — they are GC candidates; copy them to safety BEFORE attempting recovery from them.
- **Apply when:** committing anything under `~/.claude/plugins/marketplaces/`, or before any force-push/history rewrite on a repo multiple bots touch.

### 2026-06-06 — Skill docs that depict rendered UI inline get imitated literally (bot-05)
- **Context:** inline-buttons SKILL.md/README showed `[1][2][3]…` notation and an example with `[1] [2] [3] [4]` directly under body text; bot-06 started ending real Telegram messages with a literal "[1] [2]" line, duplicating the rendered keyboard. Fixed in inline-buttons 0.0.7.
- **Lesson:** in SKILL.md examples, never depict rendered UI (keyboards, pickers) inline with message-body text — bots copy examples byte-for-byte. Separate "text you send" from "what the platform renders", and state the boundary as an explicit rule.
- **Apply when:** writing or reviewing any SKILL.md/README that shows example bot output containing UI elements.

### 2026-06-06 — PS 5.1 `Set-Content -Encoding utf8` writes a BOM that corrupts plugin manifests (bot-06)
- **Context:** bumped three plugin.json files via PowerShell `Set-Content -Encoding utf8`; after the user's `/reload-plugins`, Claude Code reported "corrupt manifest file ... JSON Parse error: Unrecognized token ''" for exactly those three plugins. The invisible token was the UTF-8 BOM (EF BB BF).
- **Lesson:** on Windows PowerShell 5.1, `-Encoding utf8` means UTF-8 WITH BOM. Never use Set-Content/Out-File for files a JSON parser (or any strict parser) will read. Use the Write/Edit tools, or `[IO.File]::WriteAllText($p, $text, [Text.UTF8Encoding]::new($false))`.
- **Apply when:** writing/modifying ANY machine-parsed file (json/yaml/ts) from PowerShell on this machine.

### 2026-06-06 — installed_plugins.json `version` field can be a git sha (bot-06)
- **Context:** telegram /version showed "agent-bus v25345b784860" after a marketplace auto-update; the registry recorded the commit sha as `version` and named the cache dir after it.
- **Lesson:** never trust the registry's `version` field blindly — read `<installPath>/.claude-plugin/plugin.json` as the authoritative source, fall back to the registry field only when it looks semver-ish (`^\d+\.\d+`).
- **Apply when:** resolving any installed plugin version from `~/.claude/plugins/installed_plugins.json`.

### 2026-06-06 — Overlong skill frontmatter descriptions suspected to break skill loading (bot-06)
- **Context:** `interactive-prompts` skill (description ~780 chars) was installed + enabled yet absent from a session's available-skills list, while sibling `immediate-reply` (~600 chars) loaded fine.
- **Lesson:** keep SKILL.md frontmatter `description` compact (≲400 chars, single mechanical trigger sentence). Long descriptions are at minimum wasteful and suspected to make registration unreliable. Fixed by the rename/rewrite to `inline-buttons` 0.0.4.
- **Apply when:** writing or editing any SKILL.md frontmatter.

### 2026-05-20 — Bumping package.json instead of plugin.json (from repo history)
- **Context:** mirza-marketplace plugins; `/reload-plugins` kept serving stale code.
- **Lesson:** the marketplace cache resolves versions from `.claude-plugin/plugin.json` ONLY. Bump that file; package.json is just hygiene. Full checklist lives in mirza-marketplace/CLAUDE.md.
- **Apply when:** changing anything under mirza-marketplace/plugins/.

## Machine/setup gotchas

### 2026-06-07 — pty_send_slash only speaks Claude Code commands; /new (+ /switch picker, /delete picker, /effort picker) are telegram-layer (bot-05)
- **Context:** handoff v2 self-reset injected `/new idle` via pty_send_slash; CC rejected it (surfaced as an invalid "/clear idle") — `/new` exists only in the telegram plugin, whose handler writes a wrapper payload `{command:"/clear", sessionName}` (see telegram meta-commands.ts handleNew).
- **Lesson:** PTY injection reaches the Claude Code TUI, so only CC-native commands work (`/clear`, `/rename <name>`, `/compact`, plugin slash commands). To replicate `/new <name>` from a bot: inject `/clear` then `/rename <name>` (two sequential pty_send_slash calls), or send the wrapper compound payload via agent_send kind:"slash" {command:"/clear", sessionName}.
- **Apply when:** any bot needs to reset/rename a session (its own or a peer's) programmatically.

### 2026-06-06 — defcon grader.py default compose project = "docker" → collides across concurrent bots (bot-01)
- **Context:** building defcon-ctf-2026 case-020 in a private worktree while bot-02 built case-019 concurrently. `cases/<case>/grader.py` runs `docker compose -f docker/docker-compose.yml ...` with NO `-p` flag, so the project name defaults to the compose file's parent dir basename = `docker` — IDENTICAL for every case AND every bot's worktree. Two graders running at once would clobber each other's `up`/`down -v`.
- **Lesson:** before running a defcon `grader.py` (or any case's docker stack), set a unique `COMPOSE_PROJECT_NAME` env var (e.g. `$env:COMPOSE_PROJECT_NAME="defcongrade020"`). docker compose honors it over the default. Likewise boot manual smoke/frontier stacks with an explicit unique `-p` (`-p defcondev020`, `-p defconfrontier020`).
- **Apply when:** running any defcon-ctf-2026 grader.py or per-case docker compose while another bot may be doing the same.

### 2026-06-06 — Completing a benchmark family (N/N == target): flip status collecting→ready (bot-01)
- **Context:** case-020 was the 20th of 20 defcon cases. Other complete families in benchmark.json (x-bow 10/10, swe 20/20) are `"status": "ready"`; only in-progress ones are `"collecting"`.
- **Lesson:** when your case takes a family to current==target, also flip `status` to `ready` in benchmark.json AND the family README header AND the root README family table — not just the count. The count bump alone leaves the family mislabeled.
- **Apply when:** registering the final case that completes any benchmark family.

### 2026-06-06 — Known pre-existing test failures on this Windows machine (bot-06)
- **Context:** `bun test` in plugins/telegram.
- **Lesson:** 4 state-path tests fail on Windows (POSIX path assertions) + server-boot "exits 1" test is flaky under full-suite load but passes in isolation. Don't chase these; they're environmental.
- **Apply when:** running plugins/telegram tests on Windows.
