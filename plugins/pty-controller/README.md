# pty-controller — Claude Code plugin

Lets Claude Code programmatically send slash commands to itself by going through a parent **wrapper** process (a separate companion tool called `mirza-cc`) that hosts CC inside a `node-pty` pseudo-terminal.

This plugin alone does nothing useful — it just writes command requests to a shared state directory. The wrapper is what reads those requests and actually injects keystrokes into CC. So:

```
[ user / AI ]
      │  invokes /new or pty_send_slash tool
      ▼
[ pty-controller plugin (inside CC) ]
      │  writes JSON to <state>/pending/<id>.json
      ▼
[ mirza-cc wrapper (outside CC, hosts CC under node-pty) ]
      │  reads JSON, deletes file, writes keystrokes to CC's PTY stdin
      ▼
[ Claude Code processes slash command on next input-loop tick ]
```

If the wrapper is not running, the MCP tool returns a clear error and slash commands are no-ops. You can still load this plugin without the wrapper — it just won't *do* anything.

## What this plugin provides

- **MCP tools** (`server.ts`):
  - `pty_send_slash(command)` — queue a slash command for the wrapper to inject.
  - `pty_status()` — check if the wrapper looks alive (fresh heartbeat).
- **Slash commands** (`commands/`):
  - `/new` — clear the current session and signal that a fresh one is ready.
  - `/notify-user` — fired by the wrapper in the new session to send a Telegram confirmation.

## Install

```
/plugin marketplace update mirza-marketplace
/plugin install pty-controller@mirza-marketplace
/reload-plugins
```

Pick **user** scope when prompted, same as the other plugins in this marketplace.

## How to actually use it

You must launch Claude Code via the `mirza-cc` wrapper instead of running `claude` directly. The wrapper source ships in this same plugin folder under [`wrapper/`](./wrapper) — install its deps once and you can run it from anywhere:

```bash
cd plugins/pty-controller/wrapper
npm install
npm run wrapper
```

See [`wrapper/README.md`](./wrapper/README.md) for full details, diagnostic scripts, and caveats.

A typical session looks like:

1. In a terminal, run `mirza-cc` (it spawns Claude Code under a PTY it controls).
2. In Claude Code, verify the connection by asking yourself to call `pty_status` — `wrapper_alive` should be `true`.
3. Try `/new`. The plugin will queue `/clear`, the wrapper will inject it, and CC will start a fresh session. A few seconds later the wrapper injects `/notify-user`, which fires a Telegram message to confirm.

If `wrapper_alive` is `false`, the wrapper is not running. Start `mirza-cc` and try again.

## State layout

State is **per-project**: a `<your-project>/.claude/channels/pty-controller/` directory holds:

```
pty-controller/
├── pending/                # plugin writes command JSONs here
│   └── <uuid>.json
├── wrapper.heartbeat       # wrapper updates this file every few seconds
└── wrapper.log             # optional debug log (wrapper-owned)
```

`PTY_CONTROLLER_STATE_DIR` env var overrides the location if you want one wrapper to serve commands from multiple projects (uncommon).

## Why this design

See the architecture notes in `<bot-01>/FEATURE_IDEAS.md` (#5 Daemon Bundle and the PTY-controller refinements). Short version: a thin plugin + a thin wrapper preserves the "normal plugin" feel of mirza-telegram while still unlocking programmatic slash-command injection (true `/clear`, future `/compact`, `/handoff`, etc.).
