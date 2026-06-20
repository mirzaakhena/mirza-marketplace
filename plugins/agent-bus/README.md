# agent-bus

**Agent-to-agent (bot-to-bot)** communication plugin for multiple Claude Code instances running on the same machine. One bot (the leader) can see other bots, read their session status, and send natural-language instructions.

Consists of one MCP server (3 tools) + one skill (`using-agent-bus`) that carries the safe-usage rules.

> **Neighbor autonomy (design decision 2026-06-07):** `kind:"slash"` was
> REMOVED. A slash injection bypassed the receiving bot's AI entirely — no
> guard on its side could refuse it. Prompts are now the ONLY inter-bot
> channel: the peer's own AI decides whether and how to act, and runs any
> command itself via its own self-only `pty_send_slash`. Rescuing a stuck
> bot is the user's prerogative (each bot has its own Telegram chat → TSC
> `/new`). Rationale: `docs/2026-06-07-design-decision-batch-injection-and-neighbor-autonomy.md`
> in the marketplace repo.

## MCP Tools

| Tool | Nature | Function |
|---|---|---|
| `agent_list()` | read-only, may be called autonomously | List peers from the global registry: name, online status, last heartbeat, project_dir. Entries with no heartbeat in > 24 hours are filtered out. |
| `agent_status(name)` | read-only, may be called autonomously | Peer session details: session id + session name, `lifecycle` (e.g. `idle` / `busy` / `resetting` / `unknown` — from the peer's `wrapper.state.json`), context usage % (`context_used_percent`), total context window in tokens (`context_window_size`, e.g. `200000` / `1000000`), model, effort level, wrapper PID. Null context/window/model means the session is fresh / not yet active (or its telemetry is being withheld as stale — see _Architecture & state_) — not an error. |
| `agent_send(target, payload)` | mutating — **only on explicit user request** | Send a one-way message to a single peer or an array of peers (broadcast/fan-out). |

A peer is considered **online** if its last heartbeat is < 30 seconds.

## The `agent_send` payload

### `kind: "prompt"` — natural-language instruction (the only kind)

- The body (max **8 KB**) is validated, newlines are flattened into a single line (Claude Code submits on Enter), then given an **anti-bounce marker** that tags the message as an inter-agent instruction — including its hop level (`(hop N)`).
- **`hop_count`** (optional, default 0): a mechanical anti-loop counter. When replying because an incoming prompt asked you to report back, send `hop_count = N + 1`. The sender rejects `hop_count > 5`, and the receiving wrapper drops payloads above the same limit — the relay loop dies at a maximum of 5 hops even if every AI in the chain misbehaves.
- Written to the peer's pty-controller `pending/` inbox; the peer's `mirza-cc` wrapper types it into the PTY as a normal user turn.
- **One-way — there is no reply channel.** If the leader needs results back, it must ask for them explicitly inside the body ("when done, send a one-line summary back to bot-01").

Sending `kind:"slash"` returns a teaching error pointing at the prompt
alternative (the schema and the writer were removed in 0.0.12).

## Built-in guards

- **Target validation:** names are trimmed and deduped; a target not in the registry is returned as `{ok: false, error: "not in registry"}` per-entry without failing the other targets.
- **Offline still delivered:** a message to an offline peer still lands in the inbox (queued) — the call result marks `online: false` so the AI can warn the user that the message will only be consumed when the peer boots.
- **Prompt body validation:** non-empty string, max 8 KB UTF-8.

## Skill `using-agent-bus`

Triggers when the user asks for inter-bot coordination ("tell bot-02 to run /daily-report", "list which bots are online"). The key rules:

- `agent_send` **must not** be called on the AI's own initiative — only on explicit user request, or when an incoming prompt explicitly asks for a report back.
- **Anti-bounce:** an incoming message from agent-bus is terminal context, not a trigger for back-and-forth. Default: do the work, report to your own Telegram, STOP. This prevents infinite loops between bots.
- **Prompts that ask a peer to wipe state** (reset/clear/delete a session) require re-confirmation with the user right before sending — use inline-buttons if available. The peer's AI is the final judge and may refuse.
- Ready-made patterns: **leader fan-out** (broadcast a prompt to many peers) and **targeted relay** (check status → send → report).

## Architecture & state

- **Global registry:** `~/.claude/agent-registry.json` (override via env `AGENT_REGISTRY_PATH`). Schema v1: map of agent name → `{project_dir, state_dir, registered_at, last_heartbeat, wrapper_pid}`.
- **Registry writer:** the pty-controller wrapper (`mirza-cc`) — registers on boot, heartbeats periodically, unregisters on shutdown. agent-bus is purely a registry reader + inbox writer.
- **Concurrency:** registry writes are serialized with a file-lock (`.lock`, O_EXCL, 2-second timeout) with atomic visibility via tmp + rename.
- **`agent_status` source (two-tier, identity vs. telemetry):**
  - **Identity + lifecycle** come from the peer's pty-controller `wrapper.state.json` (`session_id`, `session_name`, `lifecycle`) — the authoritative "which session is live" record, written by wrapper ≥ 0.0.4 (pty-controller ≥ 0.0.27).
  - **Rich telemetry** (context % + window size, model, effort) comes from the peer's telegram plugin `last-status.json`. That file only refreshes while the statusline bridge fires, so it lags reset/idle sessions. The reader therefore **trusts it only when** (a) its `session_id` matches `wrapper.state.json`'s **and** (b) the lifecycle is genuinely active (`busy` or `unknown`). Otherwise the per-session fields are returned `null` (= fresh / not yet active / telemetry withheld as stale) — null is never an error.
  - **Legacy fallback:** for a peer on an older wrapper without `wrapper.state.json`, the reader uses the previous 0.0.10 scheme — telegram snapshot if its `session_id` matches the `wrapper.current_session_id` file, else the wrapper files `wrapper.current_session_id` + `wrapper.current_session_name` (written by wrapper ≥ 0.0.2), with `lifecycle` left `null`.
- **Agent name** = the basename of the peer's `CLAUDE_PROJECT_DIR` (e.g. `bot-02`).

## Dependencies

- The **`pty-controller`** plugin must be installed on both the sending & receiving bot, running under the `mirza-cc` wrapper — it's the wrapper that registers the bot into the registry and consumes the inbox.
- The rich fields in `agent_status` require the **`telegram`** plugin on the peer side (optional — degrades to session id + name only if absent). The authoritative identity + `lifecycle` (via `wrapper.state.json`) needs the peer's wrapper ≥ 0.0.4 (pty-controller ≥ 0.0.27); on an older wrapper the reader uses the legacy session-name fallback, which needs wrapper ≥ 0.0.2 (pty-controller ≥ 0.0.25) and leaves `lifecycle` null.

## Testing

`bun test` from inside `plugins/agent-bus/` — unit tests per module (`registry`, `prompt-compose`, `peer-status`, `send-guards`) plus `integration.test.ts`.

## Install

Add the marketplace first (see [root README](../../README.md)), then:

```
/plugin install agent-bus@mirza-marketplace
/reload-plugins
```

Design specs (in the marketplace repo): `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md`, `2026-05-29-agent-bus-one-way-prompt-design.md`, and `2026-05-29-agent-bus-prompt-via-pty-*.md`.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
