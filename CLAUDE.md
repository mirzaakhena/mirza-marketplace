# mirza-marketplace — Notes for AI assistants

This repo is Mirza's personal [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins). Plugins live under `plugins/<name>/`; the catalog is `.claude-plugin/marketplace.json`.

## ⚠️ MANDATORY pre-commit checklist — run this for EVERY plugin change

Agents keep forgetting these. Before committing ANY change that touches `plugins/<name>/`, mechanically verify all four — no judgement call, no "this change is too small to count":

- [ ] **1. Version bumped** in `plugins/<name>/.claude-plugin/plugin.json` — strictly higher than every version in `~/.claude/plugins/cache/mirza-marketplace/<name>/`. (`package.json` does NOT count.) Without this, `/reload-plugins` silently serves stale code. → details in "Release rule" below.
- [ ] **2. Plugin README updated** — `plugins/<name>/README.md` reflects what the source NOW does. → "README sync rule" below.
- [ ] **3. Root README updated** — the plugin's row/summary in the root `README.md` still accurate.
- [ ] **4. Catalog description checked** — `.claude-plugin/marketplace.json` entry for the plugin not stale (counts, command names, feature claims).

A plugin change that skips any of these is an INCOMPLETE change. If you notice you already committed without one of them, add an immediate follow-up commit — do not leave it for "later".

## Release rule — bump the plugin version before pushing

Every plugin you change MUST get a version bump in its **`plugins/<plugin>/.claude-plugin/plugin.json`** BEFORE you push or merge. No exceptions.

> ⚠️ `package.json` does NOT count. Claude Code's marketplace cache resolves the version from `.claude-plugin/plugin.json` only. Bumping `package.json` and leaving `plugin.json` alone means the cache still serves old code and `/reload-plugins` is a no-op.

**Why:** Claude Code caches plugin builds under `~/.claude/plugins/cache/mirza-marketplace/<plugin>/<version>/`. `/reload-plugins` only fetches a new copy when the workspace version is **higher** than what's already in the cache. If the version is unchanged or lower, the reload silently keeps using the cached old code — the user's bot will run stale behavior even though `main` has new code. We hit this on the 2026-05-20 bot-commands-redesign work and lost ~10 minutes diagnosing.

**Procedure:**
1. Before the final commit on a feature branch (or as an immediate follow-up commit on `main` if you only realized post-merge), bump `plugins/<plugin>/.claude-plugin/plugin.json` `"version"` to a value strictly higher than any version present in `~/.claude/plugins/cache/mirza-marketplace/<plugin>/`. List the cache to be sure:
   ```bash
   ls ~/.claude/plugins/cache/mirza-marketplace/<plugin>/
   ```
   You can keep `package.json` `"version"` aligned too (good hygiene), but the binding one is `plugin.json`.
2. The repo convention is `<semver>-mirza.<N>` (e.g., `0.0.12-mirza.0`).
3. If the change is user-visible (new commands, behavior changes, removed features), also update the plugin's `"description"` in `.claude-plugin/marketplace.json` — stale descriptions like "Custom Telegram channel with a /hello command" are confusing after `/hello` is removed.
4. Commit message suggestion: `release(<plugin>): bump to X.Y.Z-mirza.N — <one-line what's new>`.

**Activation steps for the user after publish:**
- `/reload-plugins` in Claude Code (the marketplace fetches the new version)
- `/mcp` reconnect for the affected plugin
- For Telegram specifically: force-close + reopen Telegram on the user's phone, otherwise the slash-menu cache hides any `setMyCommands` change

## README sync rule — update READMEs whenever a plugin changes

Whenever you **add a new plugin** or **update/change an existing plugin** (new features, behavior changes, removed commands, renamed tools, new dependencies), you MUST also update, in the same branch/commit series:

1. **`plugins/<plugin>/README.md`** — must reflect what the source code actually does (features, commands, tools, configuration). Describe only what exists in the code — never leave stale features documented or new features undocumented.
2. **Root `README.md`** — the plugin list/summary there must stay in sync with the plugin's current purpose and feature set.

Treat this like the version-bump rule above: a plugin change without its README updates is an incomplete change. Stale READMEs have repeatedly drifted from the source code in this repo and are expensive to re-sync later.

## Plugin layout

- `plugins/telegram/` — Telegram bridge for Claude Code. Per-project state isolation, registry-driven slash menu (`commands-registry.ts`), `/context` shows context-window + session info; `/version` shows plugin/wrapper versions (all resolved dynamically).
- `plugins/pty-controller/` — Wraps Claude Code in `node-pty` so the AI can inject slash commands into its own session (powers `/new`, `/switch`, `/delete`, `/rename`).
- `plugins/immediate-reply/`, `plugins/interactive-prompts/`, `plugins/teach-me/`, `plugins/daily-report/`, `plugins/handoff/` — Behavioral skills, no MCP server.

Each plugin is independent — bumping one does not require bumping the others. But if a behavioral skill plugin depends on a feature added to (e.g.) the telegram plugin, mention the minimum version in its `description` (see `interactive-prompts`'s "Requires telegram >= 0.0.9-mirza.0").

## Specs and plans

Working design docs live under `plugins/<plugin>/docs/YYYY-MM-DD-<topic>-*.md`. Specs and implementation plans get committed alongside code so the rationale is recoverable from git history.

## Testing

Plugins use Bun + `bun:test`. Run `bun test` from inside the plugin directory. A `bun build server.ts --target=bun --outfile=...` is a quick smoke-check that imports resolve.

Some tests (notably `plugins/telegram/state-path.test.ts`) assert POSIX-style paths and fail on Windows due to native path-separator differences. As of 2026-05-20 there are 4 such pre-existing failures — they're not caused by ongoing work.
