# pty-controller — Claude Code plugin

An original plugin (not a fork) that lets **Claude Code send slash commands to its own session** by routing the request through a parent process called `mirza-cc`. That wrapper runs `claude` inside a `node-pty` pseudo-terminal, then writes keystrokes to CC's stdin — so commands like `/clear`, `/compact`, `/resume <id>` actually get executed at the PTY level, not faked by AI state.

Why is this needed? The AI inside CC can't "command itself" to clear context — that's CC's internal state, and the only legit way to trigger it is a keystroke from the TTY. With this plugin + wrapper, the AI just calls one MCP tool and the wrapper does the injection.

## Architecture at a glance

```
[ user terminal ]
        │  (raw stdin)
        ▼
[ mirza-cc wrapper (node-pty, src/wrapper.ts) ]
        │  bidirectional pipe (PTY stdin/stdout)
        ▼
[ claude CLI ]   ←─ MCP stdio ──→   [ pty-controller MCP server (server.ts) ]
        ▲                                       │
        │  inject keystrokes                    │  write JSON request
        │                                       ▼
        └─────────── reads pending/<uuid>.json ◄─ <project>/.claude/channels/pty-controller/pending/
                                  ▲
                                  │  heartbeat every 5s
                       <state>/wrapper.heartbeat
```

The plugin alone is useless — all it does is write JSON files to an inbox directory. It's the wrapper that reads those files and injects keystrokes into the PTY. If the wrapper isn't running, the MCP tool `pty_send_slash` returns an explicit error ("wrapper not detected") and the slash command becomes a no-op.

## Plugin installation

See the [marketplace README](../../README.md#installation-in-claude-code) for the `/plugin install` steps. Pick the **user** scope when asked, same as the other plugins.

The plugin itself needs no configuration — the manifest in `.claude-plugin/plugin.json` declares the MCP server `pty-controller` with the command `bun server.ts` (via the `start` script in `package.json`).

## Wrapper installation (`mirza-cc`)

The wrapper source lives in [`wrapper/`](./wrapper) inside the same plugin folder. The wrapper isn't something you install into Claude Code — it's a separate binary you run from your terminal, and it's the one that spawns `claude` for you.

```bash
cd plugins/pty-controller/wrapper
npm install
```

`npm install` pulls down the prebuilt native `node-pty` binary for your platform. For uncommon platforms (Alpine, ARM Windows) it may compile from source — install the build tools first.

Prereqs:

- Node.js 20+ (required by the `node-pty` prebuild).
- `claude` on `PATH`. Verify with: `claude --version`.
- Windows: ConPTY is already bundled in Windows 10 1809+, nothing to install.

There's no "install into `PATH`" step. You run it directly from the wrapper folder via `npm run wrapper`.

## Running CC through the wrapper

```bash
cd plugins/pty-controller/wrapper
npm run wrapper
```

What's different vs. plain `claude`:

1. **The wrapper decides how it runs `claude`**, not you. The default args it passes:
   ```
   --dangerously-skip-permissions
   --dangerously-load-development-channels plugin:telegram@mirza-marketplace
   ```
   Override with the `CLAUDE_ARGS` env (empty it for vanilla, or pass a custom string). The CC binary can be overridden with `CLAUDE_BIN`.

2. **Auto-resume**. At startup the wrapper checks `~/.claude/projects/<encoded-cwd>/`, and if there's a session `.jsonl` in there, it spawns `claude --resume <latest-session-id>` (newest mtime wins). If the folder is empty → spawn fresh.

3. **Per-project state**. The wrapper creates `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/` (or `cwd` if the env isn't set) containing:
   - `pending/` — the inbox the plugin writes to.
   - `wrapper.heartbeat` — touched every 5 seconds, used by the plugin to check "alive".
   - `wrapper.log` — best-effort log file.
   - `wrapper.current_session_id` — the id of the session currently live in the PTY (used by the telegram plugin to exclude the active session from the `/delete` picker).
   - `wrapper.current_session_name` — the display name of that session, as far as the wrapper knows it (written on the `/clear`+`sessionName` chain, on `/rename` injections, on `/switch`, and at startup resume; empty file = unnamed). Read by the agent-bus plugin's `agent_status` as the authoritative name when the telegram `last-status.json` is stale.

4. **Raw mode stdin**. The wrapper puts the host terminal into raw mode so keypresses get forwarded straight through. If the wrapper crashes mid-run, your terminal can get stuck in raw mode — recover with `reset` (Unix) or close-and-reopen the window.

5. **Signal handling**. `SIGINT` (Ctrl+C) in the wrapper terminal is forwarded to the PTY so it cancels the running AI operation, rather than killing the wrapper. `SIGTERM` kills the PTY.

6. **Side effects for the `telegram` plugin**. The wrapper writes a `session-change` event to `<project>/.claude/channels/telegram/system-outbox/` every time the session changes (initial spawn, post-`/clear`, post-`/resume`). It also writes an "idle" label to `<telegram-state>/session-names.json` on first run, if that label isn't already taken — "idle" so a freshly booted bot is born READY per the handoff-v2 session-name convention. This coupling is intentional — the wrapper and the telegram plugin are maintained by the same maintainer.

7. **Registration into the global agent registry.** At boot, the wrapper registers itself (name = basename of the project dir) into `~/.claude/agent-registry.json` — heartbeat every 5 seconds, unregister on shutdown. This registry is what `pty_list_agents` and the `agent-bus` plugin read for bot-to-bot communication. Writes are serialized with a file-lock + atomic rename (with retries for the EPERM/EBUSY races typical of Windows antivirus).

Quit with `/exit` inside Claude or Ctrl+C in the wrapper terminal.

### Session-name self-healing (wrapper >= 0.0.8)

`wrapper.state.json` / `wrapper.current_session_name` menyembuhkan diri dari
divergensi nama: tiap tick poll 500ms (di luar transisi `/clear`), wrapper
membandingkan snapshot statusline CC (`last-status.json`) dengan state-nya —
bila snapshot menggambarkan session yang sama dan LEBIH BARU
(`captured_at_ms` > `updated_at_ms` state) dengan nama berbeda, nama snapshot
diadopsi (state + registry), ter-log sebagai `session name revalidated…`.
Saat boot-resume, nama di-seed dengan arbitrase freshness last-status vs
registry (tie → registry), ter-log sebagai `resume name resolution…`.
Desain: `docs/superpowers/specs/2026-07-20-wrapper-session-name-self-healing-design.md`.

## MCP tools

The server in [`server.ts`](./server.ts) exposes three tools. Called over the stdio MCP transport.

### `pty_send_slash({ command? , commands? })`

Queue a slash command — or an atomic **batch** of them — for the wrapper to inject into the **current (self) CC session's** PTY. **Self-only by design** (neighbor-autonomy decision 2026-06-07): there is no `target` parameter. Bots never inject keystrokes into a peer; to have another bot do something, send it an `agent-bus` `kind:"prompt"` and let its own AI act (and refuse, if it wants). Passing `target` now returns a teaching error.

- **Input** (exactly one of):
  - `command: string` — a single slash command, starts with `/`. Must match the regex `/^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$/`. Supports bare commands (`/clear`) and namespaced plugin commands (`/telegram:notify-user brief`). The tool **rejects raw text injection** by design — if it's not a structurally valid slash command, it errors. It also **rejects telegram-layer commands** (`/new`, `/switch`, `/delete`, `/effort`) — those only exist in the telegram plugin / wrapper layer, so injecting them wedges CC's TUI on an unknown command; the error message names the correct alternative (e.g. `/new` → `commands:["/clear", "/rename <name>"]`, `/switch` → inject `/resume <sessionId>`). See [`slash-guards.ts`](./slash-guards.ts).
  - `commands: string[]` — an ordered batch (max 8), each validated like `command`. Written as **ONE** pending file (a JSON array root); the wrapper enqueues all items contiguously, so no foreign payload can interleave between them. Use it for sequences that must stay together — the canonical case is a handoff self-reset `["/rename done-<slug>-<ts>", "/clear", "/rename idle"]`. When the batch contains `/clear`, the wrapper defers the `session-change` notification to the **end of the batch** so it carries the final session name instead of "(unnamed)". Batch needs a **running wrapper ≥ 0.0.7** — the tool reads `wrapper.version` and errors on older wrappers, telling the caller to fall back to sequential single-command calls and restart `mirza-cc`.
- **Behavior**: check the local wrapper heartbeat → write to `<state>/pending/<uuid>.json` atomically (tmp + rename). A single command writes the original object shape; a batch writes an array root.
- **Return**: text with `id` and `path` (batch: also the item count and the ordered command list).
- **Use cases**: `/clear`, `/compact`, `/telegram:notify-user` in your own session; an atomic multi-step reset via `commands`.

### `pty_status()`

Probe whether the wrapper is running.

- **Input**: none.
- **Behavior**: check `<state>/wrapper.heartbeat`. If it exists AND its timestamp is < 30 seconds from now → `wrapper_alive: true`. Otherwise → false.
- **Return**: JSON `{ wrapper_alive: boolean, state_dir: string }`.

### `pty_list_agents({ only_alive?: boolean })`

List all peer agents (other Claude Code sessions) registered in the shared agent registry `~/.claude/agent-registry.json`. That registry is written by every `mirza-cc` wrapper at startup + on each heartbeat tick. **Read-only discovery** — since `pty_send_slash` is self-only, this tool no longer feeds a `target`; to actually interact with a peer, use the `agent-bus` tools (`kind:"prompt"`).

- **Input**: optional `only_alive: boolean` — if `true`, filters out entries whose heartbeat is stale (>30 seconds).
- **Behavior**: read the registry file (or use the `AGENT_REGISTRY_PATH` env var), project each entry into `{name, project_dir, state_dir, last_heartbeat, last_heartbeat_age_s, alive, wrapper_pid}`.
- **Return**: JSON `{ registry_path, agents: [...] }`.

## Slash command

Just one, in `commands/`:

### `/new`

Clear the current CC session and start fresh. The flow the AI executes:

1. Call `pty_status`. If `wrapper_alive: false` → abort and tell the user to launch via `mirza-cc`.
2. Call `pty_send_slash` with `command: "/clear"`.
3. If the request originated from Telegram (visible from the `<channel source="telegram">` block in the input), send a Telegram acknowledgement first so the user knows the clear is being processed.
4. Stop the response. Don't go on to do any work — the next thing CC processes is the `/clear` that was just queued.

The "fresh session ready" notification is **not the AI's responsibility** — the wrapper triggers it after the new session materializes (see the post-`/clear` chain below).

## Payloads the wrapper accepts

`server.ts` writes either `{ type: "slash", command }` (single) or a JSON **array** root (batch), but the wrapper ([`src/wrapper.ts`](./wrapper/src/wrapper.ts)) accepts these shapes (tagged union; the `type` and `kind` fields are synonyms, default `slash`):

| `type`    | Extra fields                       | Wrapper action                                                                                |
|-----------|--------------------------------------|---------------------------------------------------------------------------------------------|
| `slash` (default if `type`/`kind` is absent) | `command: string`, optional `sessionName` (for `/clear`), optional `confirmAfterMs` | Write `command` then `\r` (separated by 250ms) to PTY stdin. `confirmAfterMs` (clamped 50–5000ms) sends one extra `\r` after the delay — to commit the confirmation picker of commands like `/effort`. |
| `prompt`  | `text: string` (already composed by the sender, including the anti-bounce marker) | Type `text` into the PTY as a normal user turn, then submit. Written **in chunks of 100 code points with a 30ms gap** — a single big write on Windows ConPTY overflows the input buffer and the head of the message silently goes missing (only the tail survives). Chunking on code points (not UTF-16 units) so emoji surrogate pairs don't get split. |
| `switch`  | `sessionId: string`, optional `sessionName` | Inject `/resume <sessionId>` into the PTY, write `current_session_id` + `current_session_name`, and emit a `session-change` event to the telegram system-outbox after 1 second. |
| **array** (batch) | `[{command, sessionName?, confirmAfterMs?}, …]` (max 8) | Validated by [`src/batch.ts`](./wrapper/src/batch.ts), then **all items pushed onto the injection queue in one synchronous block** — Node's single thread guarantees no other consumed payload can splice between them (the atomicity three separate pending files could never provide). Each item then flows through the gate/barrier exactly like a standalone slash. A `/clear` mid-batch **defers** its `session-change` notification to the final item so the event carries the final session name. |

Payloads carrying a `from` field (inter-agent messages sent via the `agent-bus` plugin) are subject to a **hop limit**: `hop_count > 5` is dropped — a loop guard between bots. Local messages (no `from`) pass without this check.

The compound `{command:"/clear", sessionName}` form (a `/clear` that chains a `/rename`) is still accepted for the transition — the telegram `/new` handler emits it. New self-reset sequences should prefer the batch form (`commands:["/clear", "/rename <name>"]`).

### Injection serialization (BUG #3 fix, wrapper ≥ 0.0.4)

Consumed payloads are **not** dispatched the moment their file is read — they enter a FIFO queue drained by a single processor behind an `InjectionGate` ([`src/injection-gate.ts`](./wrapper/src/injection-gate.ts)):

- **Min-gap:** every injection holds the gate for its own duration (the chunked typing window for prompts) plus `MIN_INJECTION_GAP_MS = 1500`, so two payloads can never interleave their keystrokes (each injection writes its text and the submitting `\r` 250ms apart — back-to-back dispatches used to splice into each other).
- **Post-/clear barrier:** injecting `/clear` arms a hard barrier; nothing else is injected until the fresh session jsonl is detected (CC may not process the keystroke until the current AI turn ends, so this can take minutes — that's correct, anything injected earlier would be silently dropped by the rebuilding TUI), plus a settle window covering the `/rename` chain (`CLEAR_SETTLE_MS = 1500`). A 10-minute safety timeout force-releases the barrier (with a WARNING log) if the fresh session never materialises, so a lost `/clear` can't deadlock the queue.
- Because `/rename` now only dispatches when the gate is open, the `wrapper.current_session_name` record written at dispatch time reflects an injection that actually landed.
- **Batch atomicity (wrapper ≥ 0.0.7):** the items of a batch payload are enqueued as one contiguous block, so the barrier serializes the *whole* sequence. This is what makes a handoff self-reset (`/rename done-…` → `/clear` → `/rename idle`) immune to a foreign payload splicing in mid-reset — the failure mode that previously corrupted a bot's session state when a handoff arrived between the `/clear` and the trailing `/rename idle`.

Live symptoms this fixes (2026-06-07): an agent-bus handoff prompt swallowed while the target was mid-`/clear`; a `/rename idle` following a `/clear` eaten → CC session left unnamed while the fleet state said `idle` (diverging sources of truth); a `/clear` itself eaten → session id never changed across tasks (idle-creep); and (post-batch) a foreign payload interleaving between the steps of a multi-command self-reset.

The `pty-controller` plugin emits `slash` payloads (single or batch) via `pty_send_slash`; it has no path to emit a `switch` or `prompt` payload — `switch` is emitted by the telegram plugin (when the user picks a session in the picker), `prompt` is emitted by the agent-bus plugin (a natural-language instruction from a peer bot). Any slash command valid per the regex can be injected. Examples verified to work: `/clear`, `/compact`, `/resume <id>`, `/rename <name>`, `/notify-user <msg>` (namespaced: `/telegram:notify-user`), `/exit`. The rest depend on whether CC recognizes that slash command in the session currently running.

### Post-`/clear` chain

If the command just injected is exactly `/clear`, the wrapper enters a special state machine:

1. Snapshot the current list of `.jsonl` sessions in `~/.claude/projects/<encoded-cwd>/`.
2. Poll every 500ms until a new file appears (= the fresh session is live).
3. As soon as it's found: write `wrapper.current_session_id` + `wrapper.current_session_name` (the payload's `sessionName`, or empty when the `/clear` came without a name — never the previous session's name), optionally inject `/rename <sessionName>` if the payload carries a name, then emit a `session-change` event to the telegram system-outbox (the Telegram message is sent by the telegram plugin, with no AI roundtrip). **Exception — batch:** when this `/clear` is part of a batch with later items (e.g. a trailing `/rename idle`), the notification here is suppressed; the batch's final item emits it instead, so the event reports the real final name rather than "(unnamed)". The user is always notified — only the timing shifts.

Pacing between injections: the constants `POST_INJECTION_DELAY_MS = 1000` and `SUBMIT_DELAY_MS = 250`. The second one separates the text write from the trailing `\r` — needed because for namespaced commands (`/telegram:foo`), if the `\r` lands in the same chunk, CC's autocomplete picker swallows it instead of submitting. While this state machine is waiting for the fresh session, the pending queue is held by the injection barrier (see above) — queued payloads resume only after step 3 completes plus the settle window.

## IPC mechanism

The state directory is resolved by [`ipc.ts`](./ipc.ts) in this order:

1. The `PTY_CONTROLLER_STATE_DIR` env (escape hatch, set by the wrapper when it spawns CC).
2. `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/`.

If neither exists, the MCP server exits with an explicit error on stderr.

Per-project state layout:

```
<project>/.claude/channels/pty-controller/
├── pending/                       # plugin writes here
│   └── <uuid>.json
├── wrapper.heartbeat              # wrapper updates every 5 seconds
├── wrapper.pid                    # wrapper PID, second liveness signal (unlinked on clean shutdown)
├── wrapper.current_session_id     # the live CC session id
├── wrapper.current_session_name   # the live CC session's display name ('' = unnamed; read by agent-bus agent_status)
├── wrapper.version                # {plugin_version, wrapper_version} written at boot (read by telegram /status)
└── wrapper.log                    # wrapper log (best-effort)
```

Format of the `pending/<uuid>.json` file — a single command:

```json
{
  "id": "<uuid>",
  "ts": "2026-05-19T00:00:00.000Z",
  "command": "/clear"
}
```

…or a **batch** (JSON array root), injected as one contiguous block:

```json
[
  { "command": "/rename done-task-202606071500" },
  { "command": "/clear" },
  { "command": "/rename idle" }
]
```

Atomic writes are used on all sides: write to `<final>.tmp.<pid>`, then `rename` to the final name. The wrapper skips files still named `.tmp.*` in its fallback sweep. The wrapper reads the file (via `fs.watch` + a 2-second interval sweep as belt-and-suspenders), deletes the file immediately (before dispatch) so it won't double-process if it crashes mid-handle.

`wrapperLikelyRunning()` uses a **two-signal check**: (1) the heartbeat file — its timestamp must be less than 30 seconds old; (2) PID liveness — if `wrapper.pid` exists, probe with `process.kill(pid, 0)`; `ESRCH` (process gone) → false, catching the "wrapper just crashed but the heartbeat still looks fresh" case. The PID check is best-effort: if the PID file is absent (older wrapper build) or can't be probed → trust the heartbeat alone. The plugin uses this metric to gate `pty_send_slash` and for the `pty_status` answer.

## Limitations / caveats

- **Without the wrapper, the plugin is a no-op.** The plugin loads fine into CC but `pty_send_slash` will always error until the wrapper is running. `pty_status` is the safest way to check.
- **`pty_send_slash` is self-only.** Cross-agent control was removed (neighbor autonomy, 2026-06-07); a peer is reached only via an `agent-bus` `kind:"prompt"`, which its own AI chooses to act on. Rescuing a wedged bot is the user's job, via that bot's own Telegram chat.
- **Batch needs a fresh wrapper.** `commands:[…]` requires the *running* wrapper ≥ 0.0.7. The wrapper keeps executing old code until `mirza-cc` is restarted, so right after an upgrade the tool errors on batch sends until the restart — callers fall back to sequential single-command calls.
- **Single CC per project.** The wrapper assumes one Claude session per project at a time. Run two wrappers against the same project → the inbox files can get double-processed and downstream channels (the Telegram bot) conflict.
- **Windows quirks.** `fs.watch` on Windows has historically been flaky for fast create+delete, which is why the wrapper has a 2-second interval sweep as a backup. `node-pty` is spawned via `cmd.exe /c` on Windows vs. `$SHELL -l -i -c` on Unix.
- **First-run timing isn't relevant for the production wrapper.** The `auto-clear` diagnostic has a `READY_DELAY_MS` env; the production wrapper doesn't need it because requests only arrive once CC is idle.
- **The liveness check is still a heuristic.** The two signals (heartbeat + PID probe) cover the crash case, but older wrapper builds without `wrapper.pid` still rely on the 30-second heartbeat alone.
- **Coupling to the telegram plugin.** The wrapper writes to `<project>/.claude/channels/telegram/system-outbox/` and `<telegram-state>/session-names.json`. If the telegram plugin isn't installed, those files land in a directory that may or may not get created — the wrapper still runs, but those events become orphans.
- **Agent names can collide.** Name = basename of the project dir. Two different projects with the same basename will fight over the registry slot (logged as a WARNING, not blocked in v1).

## Diagnostic scripts (rarely needed)

In the `wrapper/` folder:

```bash
npm run interactive     # spawn claude in a PTY, bidirectional pipe, no plugin loop
npm run auto-clear      # spawn claude, programmatically inject /clear, capture, exit
```

`auto-clear` dumps the PTY capture to `last-capture.ansi` (raw) and `last-capture.txt` (ANSI-stripped) on exit. Don't run this diagnostic alongside the production wrapper — both will fight over CC's PTY.

## Author / license

- **Author**: Mirza ([@mirzaakhena](https://github.com/mirzaakhena))
- **License**: MIT (see [`LICENSE`](./LICENSE)).
