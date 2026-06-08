# mirza-cc wrapper

This folder is the **wrapper companion** for the [`pty-controller`](..) Claude Code plugin one directory up. They live in the same plugin folder on purpose: the plugin without the wrapper is a no-op, the wrapper without the plugin has nothing to listen for. Shipping them together is the simplest contract.

The wrapper runs as a **separate process** — you do not install it into Claude Code. You start it from a terminal, and it then launches `claude` for you inside a node-pty pseudo-terminal it controls.

## What this folder contains

- **`src/wrapper.ts`** — the production wrapper. Spawns Claude Code inside a node-pty PTY, watches `<project>/.claude/channels/pty-controller/pending/` for slash-command requests dropped by the plugin, writes the corresponding keystrokes into CC, and chains `/notify-user` after a `/clear` once the fresh session appears.
- **`src/probe.ts` / `src/interactive.ts` / `src/auto-clear.ts`** — diagnostic scripts left over from the original PoC. Useful when you want to ask "is it node-pty or is it our code?" without the full plugin in the loop.

The PoC's original question — can we spawn `claude` inside node-pty and inject `/clear` programmatically? — was answered "yes" before the wrapper was written. The PoC scripts are kept as a regression checker.

## Why a PTY

The `claude` CLI is interactive. Normally a human types at it. There is no documented IPC API for "tell Claude to clear its context" from another process. A pseudo-terminal lets a parent process *be* the human — write keystrokes into Claude's stdin and read its rendered output — without Claude knowing the difference.

## Prerequisites

- Node.js 20+ (the `node-pty` prebuild needs a current Node).
- `claude` on `PATH`. Verify with `claude --version`.
- Windows: ConPTY is bundled with Windows 10 1809+ — nothing to install. Linux/Mac: nothing special.

Bun also works for the PoC scripts; the wrapper currently runs via `tsx` (Node) by default.

## Install (one-time, in this folder)

```bash
cd plugins/pty-controller/wrapper
npm install
```

The install pulls a prebuilt `node-pty` native binary for your platform. If your platform is unusual (Alpine, ARM Windows), it may try to compile from source — install build tools accordingly.

## Run the wrapper

```bash
npm run wrapper
```

This starts `mirza-cc` in the foreground. It:

1. Creates `<project>/.claude/channels/pty-controller/` if missing (per-project state dir, picked from `CLAUDE_PROJECT_DIR` or `cwd`).
2. Spawns `claude` inside a PTY and bidirectional-pipes with your terminal — you can use Claude exactly as if you ran `claude` directly.
3. Touches `<state>/wrapper.heartbeat` every 5 seconds so the plugin can prove the wrapper is alive.
4. Watches `<state>/pending/` for `<uuid>.json` request files. When one arrives it deletes the file and dispatches by payload type: `slash` (write the command + carriage return into the PTY), `prompt` (type free text from agent-bus as a user turn, chunked 100 code points / 30ms so Windows ConPTY doesn't truncate it), or `switch` (inject `/resume <sessionId>`). A file whose JSON root is an **array** is a **batch** (`src/batch.ts`): its slash items are enqueued in one contiguous block — no other payload can interleave between them, which is what keeps a multi-step self-reset atomic.
5. After a `/clear` specifically, it watches `~/.claude/projects/<encoded-cwd>/` for a new session `.jsonl`, records it as the current session, optionally chains `/rename <sessionName>`, and drops a `session-change` event into the telegram plugin's system-outbox — the Telegram "fresh session ready" ping goes out via direct bot API, no AI roundtrip. When the `/clear` is mid-batch (more items still queued), that notification is deferred to the batch's last item so it carries the final session name.
6. Registers itself in the global agent registry (`~/.claude/agent-registry.json`) on boot, heartbeats it, and unregisters on shutdown — this is what makes the bot discoverable to `pty_list_agents` and the `agent-bus` plugin.

Quit by typing `/exit` inside Claude or pressing Ctrl+C in the wrapper terminal.

## Diagnostic scripts (rarely needed)

```bash
npm run interactive       # spawn claude under PTY, full bidirectional pipe
npm run auto-clear        # spawn claude, programmatically inject /clear, capture output, exit
```

`auto-clear` writes its captured PTY output to `last-capture.ansi` (raw) and `last-capture.txt` (escape-stripped) when it exits. Open the `.txt` to see what Claude rendered without ANSI cruft; `cat` or `type` the `.ansi` in a real terminal to "replay" the colored output.

These are not meant to run while the production wrapper is also running — they will fight over Claude's PTY.

## Layout

```
plugins/pty-controller/wrapper/
├── package.json
├── tsconfig.json
├── README.md          (this file)
├── .gitignore
└── src/
    ├── wrapper.ts            production entry — what `npm run wrapper` runs
    ├── prompt-inject.ts      pure helpers for type:"prompt" payloads (chunking) — unit-testable
    ├── prompt-inject.test.ts tests for the above
    ├── batch.ts              pure validator for array (batch) payloads — unit-testable
    ├── batch.test.ts         tests for the above
    ├── probe.ts              diagnostic — minimal PTY echo test
    ├── interactive.ts        diagnostic — claude under PTY, bidirectional
    └── auto-clear.ts         diagnostic — claude under PTY + auto /clear
```

## Known caveats

- **First-run timing.** Claude's startup time varies. If `/clear` is injected before the input prompt is ready, the keystrokes go into the void. In the production wrapper this is unlikely because requests only arrive after CC is already idle; the `auto-clear` diagnostic exposes the `READY_DELAY_MS` env var to tune it.
- **`\r` vs `\n`.** Most TUIs expect carriage return for Enter. The scripts use `\r`. If a future Claude version moves to a different input loop, this could break.
- **Raw mode on stdin.** `interactive.ts` and `wrapper.ts` put the host terminal in raw mode so keypresses go straight to Claude. If they crash mid-run, your terminal may stay in raw mode — type `reset` (Unix) or close + reopen the window to recover.
- **Single CC per project.** This wrapper assumes one Claude Code process per project at a time. Running multiple wrappers against the same project will produce 409-style conflicts in any downstream channels and double-process inbox files.
