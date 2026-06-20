# Mirza Marketplace

Personal plugin marketplace for **Claude Code**, owned by [@mirzaakhena](https://github.com/mirzaakhena).

It contains one fork of the official [`claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) plugin that has been heavily modified (telegram), plus seven original plugins written from scratch. These plugins are designed as a single ecosystem: a Telegram bot as the primary interface, a PTY wrapper as the hand that controls Claude Code, and a set of behavioral skills that govern how the AI communicates.

## Plugin List

The official catalog lives in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json). Each plugin has its own README with full details.

### Infrastructure (MCP server)

| Plugin | Version | What it is |
|---|---|---|
| [`telegram`](plugins/telegram/) | 0.0.32-mirza.0 | **Telegram ↔ Claude Code bridge** (upstream fork, heavily modified). Per-project state, 5 MCP tools (`reply` + buttons, `react`, `edit_message`, `download_attachment`, `get_message_by_id`), registry-driven bot commands (`/context`, `/version`, `/new`, `/switch`, `/delete` soft/hard/all, `/rename`, `/effort`, `/handoff` → forwarded to the handoff-v2 skill, `/help`, `/start`), album batching, quoted-message context, conversation logging to SQLite, permission relay, system-outbox for sibling plugins. |
| [`pty-controller`](plugins/pty-controller/) | 0.0.30 | **Claude Code controls itself.** The `mirza-cc` wrapper runs CC inside node-pty; the plugin writes requests to a filesystem inbox, the wrapper injects keystrokes (`/clear`, `/resume`, prompt text from agent-bus) — serialized through a FIFO queue + injection gate (min-gap between injections; hard barrier while CC rebuilds post-`/clear`, so queued keystrokes are never silently dropped). MCP tools: `pty_send_slash` (SELF-ONLY since 0.0.30 — neighbor autonomy; supports atomic `commands` batches: one pending file, contiguous enqueue, session-change notification deferred to end of batch; rejects telegram-layer commands like `/new` with a pointer to the right alternative), `pty_status`, `pty_list_agents`. The wrapper also registers the bot in the global agent registry, tracks the live session's id + name in state files, and names a first-run session `idle` (born READY for handoff). |
| [`agent-bus`](plugins/agent-bus/) | 0.0.13 | **Bot-to-bot communication** between Claude Code instances on the same machine. MCP tools: `agent_list`, `agent_status` (session id/name, context % + window size in tokens, model, effort — with stale-snapshot detection against the wrapper's session id; null context = fresh session), `agent_send` (natural-language prompt, can broadcast; `kind:"slash"` removed per the 2026-06-07 neighbor-autonomy decision — the peer's own AI decides and executes). One-way with an anti-bounce rule + hop limit. Depends on pty-controller. |

### Behavioral skills (no MCP server)

| Plugin | Version | What it is |
|---|---|---|
| [`immediate-reply`](plugins/immediate-reply/) | 0.0.6 | Instant ack (~1 second) before the first tool call on every Telegram inbound — a mechanical 4-question pre-flight check, plus progress narration for long tasks. |
| [`inline-buttons`](plugins/inline-buttons/) | 0.0.9 | Self-audit on every Telegram reply: QUESTION or ANSWER? A question MUST use inline-keyboard buttons — minimum Yes/No + an escape button `✏️ Explain manually`, short labels (options narrated as a numbered list in the body, buttons just hold the numbers, body never repeats the button row as text). Requires telegram ≥ 0.0.9-mirza.0. |
| [`teach-me`](plugins/teach-me/) | 0.0.2 | Teaching mode: build a mental model step by step when the user wants to understand a concept — 10 style elements + an anti-pattern list. |
| [`handoff`](plugins/handoff/) | 0.0.16 | `/handoff` (buttons: Now / After this task / Ping pong / File only) — direct bot-to-bot work relay via agent-bus: handoff file → two-way ACK → sender self-reset to an `idle` session as ONE atomic `pty_send_slash` batch (sequential fallback on wrapper < 0.0.7); receiver busy-guard runs first (explicit user pick of a busy bot → defer, not reject); ping-pong pair ends when the goal is done or the user cancels; proactive context-threshold trigger via `agent_status` `context_window_size` (≥1M tokens→35%, else→75%; model-string fallback), READY accepts null context (fresh session). `/handoff-resume` removed. |
| [`daily-report`](plugins/daily-report/) | 0.0.4 | `/daily-report` assembles a paste-ready plain-text daily work report for any chat app from git activity, with a locked Yesterday/Today template and anti-fabrication rules. |
| [`bot-conduct`](plugins/bot-conduct/) | 0.0.5 | Working rules for agent bots: git worktree (not branch-switching), commits with an `Agent: <bot-name>` trailer, subagent-first so the main loop stays responsive, channel discipline (answer in the channel the question came from), a cross-bot playbook at `~/.claude/agent-playbook/PLAYBOOK.md`, and shared-repo git discipline (three-copy doctrine for any marketplace-registered repo: edit/commit only in its canonical workspace clone, never under `~/.claude/plugins/`; push release commits immediately; no uncoordinated force-push — see [`docs/SOP-git-multi-agent.md`](docs/SOP-git-multi-agent.md)). |

### How it all fits together

```
Telegram (user's phone)
   │  DM / commands / button taps
   ▼
[telegram plugin] ──── meta-commands (/new, /switch, /effort, ...) ───┐
   │  <channel> notification                                          │ write inbox
   ▼                                                                  ▼
[ Claude Code session ] ◄── inject keystrokes ── [ mirza-cc wrapper (pty-controller) ]
   │                                                       ▲
   │  agent_send (prompt/slash)                            │ peer inbox
   └──────────────► [agent-bus] ───────────────────────────┘  → other bots on the same machine

immediate-reply / inline-buttons / teach-me  → govern the AI's response STYLE on Telegram
handoff / daily-report                            → end-of-session & end-of-day rituals
bot-conduct                                       → WORKING rules for agent bots (worktree, commit identity, subagent, playbook)
```

---

## Installation in Claude Code

### Step 1 — Add this marketplace

From any Claude Code session, run:

```
/plugin marketplace add mirzaakhena/mirza-marketplace
```

Verify with `/plugin marketplace list` — `mirza-marketplace` should appear.

### Step 2 — Install the plugins you need

```
/plugin install telegram@mirza-marketplace
/plugin install pty-controller@mirza-marketplace
/plugin install immediate-reply@mirza-marketplace
...
/reload-plugins
```

When asked for scope, pick **`user`** — one global install, with state staying per-folder automatically. The `@mirza-marketplace` syntax matters if you also have an official plugin with the same name.

The behavioral skill plugins (immediate-reply, inline-buttons, teach-me, handoff, daily-report, bot-conduct) work right after install — no configuration. **Note:** a newly enabled skill is not yet registered in the currently running session — restart the session first (see `docs/2026-06-06-issue-skill-not-loaded-on-new-session.md`).

### Step 3 (telegram channel plugin only) — Token & dev flag

The `telegram` plugin is a **channel plugin**, so it needs extra steps:

**A. Configure the bot token.** Create a bot via [@BotFather](https://t.me/BotFather) (`/newbot`), copy the token, open a CC session in the target project folder, then:

```
/telegram:configure 123456789:AAH...
```

The token is stored in `<project>/.claude/channels/telegram/.env` (chmod 600, automatically `.gitignore`d). One token per project — other projects need a different bot.

**B. Restart with the dev flag.** A personal marketplace plugin isn't on Anthropic's allowlist (channels are still a research preview):

```bash
claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
```

Or — if pty-controller is installed — run it through the wrapper, which already uses that flag by default:

```bash
cd plugins/pty-controller/wrapper && npm run wrapper
```

**C. Enable the MCP server.** A channel plugin's MCP is disabled by default per session. Run `/mcp`, toggle `telegram` on.

**D. Pair your account.** DM the bot on Telegram → you get a 6-character code. In CC:

```
/telegram:access pair <code>
/telegram:access policy allowlist
```

Once paired, try sending `/context` on Telegram — the bot should reply with context window + session info.

> Note: one bot token may only have one poller. Two projects with the same token → `409 Conflict`.

### Step 4 (optional) — Wrapper for session control & bot-to-bot

The Telegram commands `/new`, `/switch`, `/delete`, `/rename`, `/effort` and the entire agent-bus plugin require the `mirza-cc` wrapper to be running. See the [pty-controller README](plugins/pty-controller/README.md) for its setup.

---

## Developing / Modifying

Standard workflow:

```bash
git clone https://github.com/mirzaakhena/mirza-marketplace.git
cd mirza-marketplace
```

1. **Edit the plugin code** in `plugins/<name>/`.
2. **Bump the version** in `plugins/<name>/.claude-plugin/plugin.json` (convention: `<semver>-mirza.<N>` for forks, plain semver for original plugins).

   > ⚠️ **`package.json` does NOT count.** Claude Code's marketplace cache resolves the version from `.claude-plugin/plugin.json` only. Bumping `package.json` alone = the cache keeps serving old code and `/reload-plugins` becomes a no-op. See `CLAUDE.md` for the full procedure.
3. **Update the README** — a plugin that changes must come with an update to `plugins/<name>/README.md` + this root README (rules in `CLAUDE.md`).
4. **Validate** the manifest:
   ```bash
   claude plugin validate .
   claude plugin validate plugins/<name>
   ```
5. **Test** — plugins with an MCP server use Bun: `bun test` from inside the plugin folder.
6. **Test locally** before pushing:
   ```bash
   claude plugin marketplace add /absolute/path/to/mirza-marketplace
   claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
   ```
7. **Commit & push** to `main`.
8. **Update on the user's side:** `/plugin marketplace update mirza-marketplace` then `/plugin update <name>` (or `/reload-plugins`).

Design specs & plans are committed alongside the code: repo-level in `docs/superpowers/{specs,plans}/`, per-plugin in `plugins/<name>/docs/`.

### Syncing with upstream (telegram)

The `claude-plugins-official` repo is updated by Anthropic periodically. To merge upstream changes into the telegram fork:

1. Compare `plugins/telegram/` against the upstream `external_plugins/telegram/` (fresh clone or git diff).
2. Cherry-pick what's relevant — be careful: this fork has diverged significantly (per-project state, meta-commands, messages.db, system-outbox, buttons, etc.). See the list of changes in the [telegram plugin README](plugins/telegram/README.md).
3. Bump the version, commit, push.

---

## License

- `telegram` retains **Apache-2.0** from upstream (see `plugins/telegram/LICENSE`).
- `pty-controller` is released under **MIT** (see `plugins/pty-controller/LICENSE`).
- The other plugins do not yet include an explicit license file.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
