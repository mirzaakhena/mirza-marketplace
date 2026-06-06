# mirza-marketplace — Notes for AI assistants

This repo is Mirza's personal [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins). Plugins live under `plugins/<name>/`; the catalog is `.claude-plugin/marketplace.json`.

## ⚠️ MANDATORY pre-commit checklist — run this for EVERY plugin change

This is the single source of truth for releasing a plugin change — there is no separate "release rule" elsewhere. Agents keep forgetting these. Before committing ANY change that touches `plugins/<name>/`, mechanically verify all five — no judgement call, no "this change is too small to count":

- [ ] **1. Plugin version bumped** in `plugins/<name>/.claude-plugin/plugin.json` — strictly higher than every version in `~/.claude/plugins/cache/mirza-marketplace/<name>/` (list it: `ls ~/.claude/plugins/cache/mirza-marketplace/<name>/`). `package.json` does NOT count — the marketplace cache resolves versions from `plugin.json` only; keep `package.json` aligned as hygiene. Convention: `<semver>-mirza.<N>` (e.g., `0.0.12-mirza.0`).
- [ ] **2. Wrapper version bumped** — only when the change touches `plugins/pty-controller/wrapper/`: also bump `wrapper/package.json` `"version"`. The wrapper self-reports it (via `wrapper.version` at boot) and telegram's `/version` displays it — leave it stale and the user sees a wrong wrapper version.
- [ ] **3. Plugin README updated** — `plugins/<name>/README.md` reflects what the source NOW does (features, commands, tools, configuration). Never leave stale features documented or new ones undocumented.
- [ ] **4. Root README updated** — the plugin's row in the root `README.md` still accurate (purpose, feature set, version column).
- [ ] **5. Catalog description checked** — the plugin's `"description"` in `.claude-plugin/marketplace.json` not stale (counts, command names, feature claims) — mandatory when the change is user-visible.

A plugin change that skips any of these is an INCOMPLETE change. If you notice you already committed without one of them, add an immediate follow-up commit — do not leave it for "later".

**Why item 1 is non-negotiable:** Claude Code caches plugin builds under `~/.claude/plugins/cache/mirza-marketplace/<plugin>/<version>/`. `/reload-plugins` only fetches a new copy when the workspace version is **higher** than what's already in the cache. If the version is unchanged or lower, the reload silently keeps using the cached old code — the user's bot will run stale behavior even though `main` has new code. We hit this on the 2026-05-20 bot-commands-redesign work and lost ~10 minutes diagnosing.

**Commit message suggestion:** `release(<plugin>): bump to X.Y.Z-mirza.N — <one-line what's new>`.

**Activation steps for the user after publish:**
- `/reload-plugins` in Claude Code (the marketplace fetches the new version)
- `/mcp` reconnect for the affected plugin
- For Telegram specifically: force-close + reopen Telegram on the user's phone, otherwise the slash-menu cache hides any `setMyCommands` change

## Plugin layout

- `plugins/telegram/` — Telegram bridge for Claude Code. Per-project state isolation, registry-driven slash menu (`commands-registry.ts`), `/context` shows context-window + session info; `/version` shows plugin/wrapper versions (all resolved dynamically).
- `plugins/pty-controller/` — Wraps Claude Code in `node-pty` so the AI can inject slash commands into its own session (powers `/new`, `/switch`, `/delete`, `/rename`).
- `plugins/immediate-reply/`, `plugins/inline-buttons/`, `plugins/teach-me/`, `plugins/daily-report/`, `plugins/handoff/`, `plugins/bot-conduct/` — Behavioral skills, no MCP server.

Each plugin is independent — bumping one does not require bumping the others. But if a behavioral skill plugin depends on a feature added to (e.g.) the telegram plugin, mention the minimum version in its `description` (see `inline-buttons`'s "Requires telegram >= 0.0.9-mirza.0").

## Specs and plans

Working design docs live under `plugins/<plugin>/docs/YYYY-MM-DD-<topic>-*.md`. Specs and implementation plans get committed alongside code so the rationale is recoverable from git history.

## Testing

Plugins use Bun + `bun:test`. Run `bun test` from inside the plugin directory. A `bun build server.ts --target=bun --outfile=...` is a quick smoke-check that imports resolve.

Some tests (notably `plugins/telegram/state-path.test.ts`) assert POSIX-style paths and fail on Windows due to native path-separator differences. As of 2026-05-20 there are 4 such pre-existing failures — they're not caused by ongoing work.
