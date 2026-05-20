# Bot Commands Redesign — 2026-05-20

Status: **brainstorming / pre-spec**. This is a working doc capturing the
conversation. Final spec to follow once decisions are locked.

## 1. Current state

Two definition sites:

| Site | Commands |
|------|----------|
| `server.ts` (grammy `bot.command`) | `/start`, `/help`, `/status`, `/hello`, `/context` |
| `meta-commands.ts` (text interceptor) | `/new`, `/switch`, `/delete`, `/rename` |

BotFather menu currently registered (per screenshot 2026-05-19):

```
/start    Welcome and setup guide
/help     What this bot can do
/status   Check your pairing status
/hello    Say hello to Mirza
/context  Show context & 5h usage
/new      Start a fresh named session
/switch   Switch Claude session
/delete   Delete a session
/rename   Rename current session
```

Side-effect to remember: `/context` lazily installs a `statusLine` bridge into
`<project>/.claude/settings.json` on first invocation (`server.ts:1019`,
`ensureContextBridgeInstalled`). Subsequent calls just read
`<state>/last-status.json`.

## 2. User goals & constraints (from chat 2026-05-19)

- Keep the surface small — **as few bot commands as possible**.
- **No aliases.** One command, one task, pure.
- New app, no users yet → free to ignore Telegram convention (e.g. `/status`
  doesn't *have* to be the pairing-check command).
- Bot is intentionally a Claude-Code alternative driven from Telegram, not a
  generic chatbot.
- **Short BotFather descriptions.** The one-liner shown in the slash-menu
  stays terse — just enough to recognize the command. Detail belongs in
  `/help <name>`, not in the menu hint. This also makes the menu readable
  on mobile where the description gets truncated quickly.

## 3. Per-command direction

### 3.1 `/hello` — **remove**
Was test scaffolding (`server.ts:915`). Drop handler + remove from BotFather menu.

### 3.2 `/help` — **enhance**
- No args → list all available commands with one-line summaries.
- `/help <command>` → long help for that one command.
- Cover **all** commands (both `server.ts` and `meta-commands.ts` sources).

**Implementation pattern:** introduce a single `commands-registry` (one
TS module) where each command self-describes:

```ts
interface CommandSpec {
  name: string           // "switch"
  short: string          // shown in /help list
  long: string           // shown in /help <name>
  hidden?: boolean       // omit from menu/list but still respond
}
```

`/help` reads from this registry. Boot also calls `setMyCommands` derived
from the same registry → **single source of truth**, no more manual
BotFather sync.

### 3.3 `/status` — **repurpose to context display**
Take over what `/context` currently shows (confirmed against the screenshot
2026-05-20):

```
Context
●○○○○○○○○○ 6%
63.6k / 1M tokens

Rate Limit 5h
○○○○○○○○○○ 3%
reset 3h 51m

Rate Limit 7d
●●●○○○○○○○ 25%
reset 1d 21h

Opus 4.7
Session: utama (76b5c187)
CWD: …/workspace/bot-01
Cost: $1.18
Thinking: on
Fast: off

Plugin: telegram v0.x.y (abc1234)

Last update: 05:25 WIB (13m ago)
```

Additions vs. current `/context` output:
- **Session name** in front of the short-id, when one is set. Format:
  `Session: <name> (<short-id>)`. When the session has no registered name,
  fall back to the existing `Session: <short-id>` form. Source: the
  `session-names-registry` (`./session-names-registry.ts`), keyed by full
  sessionId; the short-id remains visible so users keep their existing
  mental anchor.
- **Plugin version line** (folded in from the parked `/version` idea — see
  §5). Format: `Plugin: telegram v<semver> (<short-sha>)`. Source: plugin
  `package.json` + git short-sha at build/runtime. If git info isn't
  resolvable, drop the parenthetical.

The remaining concern is the **bridge install side-effect**. See §4.

### 3.4 `/context` — **remove**
No alias retained — per the "no alias" rule. Existing behavior moves wholesale
to `/status`.

### 3.5 `/start` — **redesign**
- If **unpaired** → current behavior (pairing instructions + code prompt).
- If **paired** → welcome line + identity (paired as @user, project
  `bot-01`, current session name). This subsumes the pairing-check role that
  was nominally `/status`'s job in conventional Telegram bots.

`/start` is the canonical Telegram entry point and fits identity/onboarding
naturally — pairing state belongs here, not as a separate command.

### 3.6 Meta-commands — **unchanged**
`/new`, `/switch`, `/delete`, `/rename` stay as-is. They just need entries
in the new commands-registry so `/help` covers them.

## 4. Open question — statusLine bridge install side-effect

`/context` currently does **two** things on first call:

1. Patches `<project>/.claude/settings.json` to set `statusLine.command` to
   `context-bridge.ts`.
2. Returns the rich context output (after waiting ~5s for the bridge to
   trigger).

If `/status` simply inherits both behaviors, a user typing `/status` for the
first time silently mutates their `.claude/settings.json`. That is the
"surprise" worth deciding on.

Three options:

| Option | /status | Install lives where |
|--------|---------|---------------------|
| A | pure read-only (no install) | separate command (`/setup`) OR auto on first successful pairing |
| B | same as today's /context (install on first call) | inside /status |
| C | split: `/status` reads, `/setup` installs | both commands documented in /help |

**My recommendation (refined after user's "minimal commands" constraint):**
Option **B**. Reasons:

- Adding `/setup` violates "as few commands as possible".
- The install is **aligned with /status's purpose** — you can't show context
  data without the bridge installed, so installing it the first time you
  ask for status info is not a surprise, it's *the precondition*.
- One-time only. Subsequent /status calls are pure reads.
- First-call UX: send "⏳ Installing bridge..." → wait → edit to result.
  Already implemented this way in `bot.command('context')`.

A → too many commands. C → same.

**Decision: pending user confirmation.**

## 5. Other ideas raised (not committed)

| Idea | Notes |
|------|-------|
| `/version` | **Merged into /status output** as a `Plugin: telegram vX.Y.Z (sha)` line. No standalone command — preserves minimal-surface rule. |
| `/cancel` | Abort a flow waiting for input (e.g. /rename's follow-up prompt). Useful only if such flows exist with no native escape. |
| `/whoami` | Subset of paired-state info. **Skip** — overlaps with new /start. |
| `hidden:true` flag in registry | Lets us add rarely-used commands (e.g. /version) without bloating the BotFather menu. |

Per the "minimal commands" rule, only add `/version` if it earns its keep.
`/cancel` only if any flow actually needs it.

## 6. Final command surface (proposed)

Two descriptions per command:
- **Menu hint** — terse, shown in BotFather slash-menu. Goal: instant
  recognition, no truncation on mobile.
- **/help summary** — slightly longer, shown in the `/help` list.
- **/help &lt;name&gt; detail** — full prose, written in registry's `long` field.

| Cmd       | Menu hint                          | /help summary                                       |
|-----------|------------------------------------|-----------------------------------------------------|
| /start    | Welcome and pairing guide          | Onboarding & paired identity                        |
| /help     | Bot intro and command list         | List commands; `/help <name>` for detail            |
| /status   | Context window and session info    | Context, rate limits, session info, plugin version  |
| /new      | Start a fresh named session        | Start a fresh named Claude session                  |
| /switch   | Pick different session to talk to  | Switch the active Claude session                    |
| /delete   | Delete a session                   | Delete a Claude session                             |
| /rename   | Rename the current session         | Rename the active session                           |

Seven commands. Down from nine. Each one task, no aliases.

Menu-hint length is calibrated to read fully on a typical phone width
without truncation while still using the space meaningfully (vs. one-word
hints which waste room).

## 6.1 `/help` structure

**No args** (`/help`):
1. **Intro paragraph** — one short paragraph describing what this bot is
   (Telegram bridge to Claude Code; DM goes to your paired session; replies
   come back here).
2. **Command list** — each command with its `/help summary` (the middle
   column above), one per line. Last line: `Type /help <command> for detail`.
3. **Troubleshooting tail** — 1-2 most-common global issues only:
   "Bot not responding? Send any DM to check your pairing status." Keep
   the global tail short; command-specific failure modes live in
   `/help <name>` instead.

**With command name** (`/help status`, `/help rename`, etc.):
- Full prose for that one command.
- Concrete example if helpful (`/rename utama` → renames current session
  to "utama").
- Troubleshooting **scoped to that command** (e.g. /status: "if the
  ⏳ Installing bridge... message persists past 15 seconds, make sure
  Claude Code is running in the project dir").

**No `/help troubleshooting` subcommand.** Rationale: `/help <name>` is a
pattern that says "tell me about this command". Adding a topic name breaks
the rule. Troubleshooting belongs scoped to where it's relevant — global
issues in the `/help` tail, command-specific issues in `/help <name>`.

Source: registry `long` field per command. `/help` itself is a small
formatter on top of the registry.

## 7. Implementation order (when we get there)

1. Add `commands-registry.ts` with metadata for all 7 commands.
2. Wire `setMyCommands` at boot from the registry.
3. Refactor `/help` to read the registry.
4. Move `/context` body into `/status`; delete `/context` handler.
5. Delete `/hello` handler.
6. Enhance `/start` paired-branch with identity info.
7. Run BotFather sync (now automatic from registry — verify it actually
   replaces the old menu including removed entries).
8. Add tests where reasonable (registry coverage, /help argument parsing).

## 8. Decisions locked 2026-05-20

- [x] §4 — **Option B** for statusLine bridge install. `/status` triggers
      the install on first call; subsequent calls are pure reads. Aligned
      with command purpose (bridge IS the precondition for context info),
      and avoids adding a `/setup` command.
- [x] §3.5 — `/start` paired-branch **shows identity** (paired-as,
      project dir, current session name). Pairing-info-display lives here
      since `/start` IS the onboarding/identity command.
- [x] §5 — `/version` **folded into /status** output as a `Plugin: ...`
      line. No standalone command. Keeps the surface at 7.
- [x] §2 — **No transitional `/context` redirect.** Clean break per the
      no-alias rule. Users typing `/context` get Telegram's default
      unknown-command behavior.
- [x] **UI language: English** for all new and migrated bot strings
      (acks, errors, troubleshooting, /help text, /status labels). Existing
      Indonesian strings touched by this change (e.g. "Gagal pasang
      bridge", "Statusline Claude Code belum trigger") get translated as
      part of the migration. Existing strings *not* touched stay as-is for
      this round.
