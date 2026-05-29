# Agent-Bus Prompt Delivery via PTY Injection — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation
**Supersedes:** `2026-05-29-agent-bus-one-way-prompt-design.md` (the channel-notification approach). Phase 1 slash delivery is unchanged. The `kind:"prompt"` feature is re-implemented: instead of the agent-bus MCP server emitting `notifications/claude/channel`, the peer's `mirza-cc` wrapper types the prompt into the peer's PTY as a normal user turn.

---

## 1. Background & Why the Pivot

The previous design delivered `kind:"prompt"` by having the agent-bus MCP server watch its own inbox and emit `notifications/claude/channel`, mirroring the telegram plugin. A live two-bot test revealed this does not work: the file was consumed but the peer's AI never reacted.

**Root cause (verified):** CC only surfaces `notifications/claude/channel` from MCP servers that are registered as *channels*. Registration requires two things telegram has and agent-bus lacks:
1. The server must declare the `experimental: { 'claude/channel': {} }` capability in its `Server` constructor (telegram `server.ts:505-515`; agent-bus declared only `tools: {}`).
2. The plugin must be loaded as a channel via the wrapper's `--dangerously-load-development-channels` flag (only `plugin:telegram@mirza-marketplace` was listed).

Making agent-bus its own channel would require adding a second privileged "dangerous" channel to every bot's launch args plus the capability declaration. Rather than add channel machinery, we deliver the prompt through the mechanism that is already universal in this setup: the `mirza-cc` wrapper that hosts every bot in a node-pty PTY and already injects slash commands.

**The new model:** agent-bus becomes a pure *sender*. It writes a `type:"prompt"` payload into the peer's existing `pty-controller/pending/` inbox — the same inbox it already uses for `kind:"slash"`. The peer's wrapper consumes it and types the prompt text + Enter into the peer's PTY. The peer's AI processes it as an ordinary user turn.

**Why this is better here:**
- No channel registration: no `claude/channel` capability, no `--dangerously-load-development-channels` change, no second privileged channel.
- Unifies slash and prompt onto one inbox + one consumer (the wrapper).
- Reuses the proven, already-universal keystroke-injection path.
- Coupling is not new: agent-bus already writes slash commands to `pty-controller/pending/`; this extends the same path. The wrapper is the foundation every bot already runs on.
- Semantically exact: typing text + Enter *is* a user turn — a precise match for "treat it like the peer's user typed it."

**Accepted trade-offs:**
- **Loop backstop changes.** The structured `hop_count` cap is gone — the prompt arrives as typed text, not a structured message the receiver validates. Loop prevention now rests entirely on the `using-agent-bus` anti-bounce skill rule, reinforced by an explicit marker prepended to every prompt (see §4).
- **Multi-line bodies are flattened** to a single line (CC submits on Enter). Acceptable for single-paragraph inter-agent instructions.
- **Attribution is textual,** not a structured `source=` tag — carried by the prepended marker.

## 2. Architecture Overview

```
bot-01 (SENDER)                              bot-02 (RECEIVER)
agent_send(target:"bot-02",
  payload:{kind:"prompt", body:"review file X"})
   │ 1. resolve "bot-02" in registry → state_dir
   │ 2. flatten newlines in body → single line
   │ 3. prepend attribution marker → final `text`
   │ 4. write file (atomic tmp+rename) to:
   ▼
   bot-02/.claude/channels/pty-controller/pending/<uuid>.json
       { type:"prompt", from:"bot-01", text:"[marker] review file X" }
                                          │ wrapper already watches pending/
                                          ▼
                                   mirza-cc wrapper (bot-02)
                                          │ 5. inject `text` + Enter into PTY
                                          ▼
                                   bot-02 CC processes it as a normal user turn
                                   → does the work
```

Slash path (unchanged): `agent_send(kind:"slash")` → peer `pty-controller/pending/` → wrapper injects `/command` + Enter.

**One inbox, one consumer.** Both `kind:"slash"` and `kind:"prompt"` land in the peer's `pty-controller/pending/`. The wrapper is the sole consumer and the sole keystroke injector. agent-bus has no inbox or watcher of its own.

## 3. Component Changes

### 3.1 agent-bus `server.ts` — `agent_send` send path
- `kind:"prompt"`: validate body, flatten newlines, compose marker+body into `text`, write a `type:"prompt"` payload to each target's `pty-controller/pending/` (the target's `state_dir` from the registry).
- `kind:"slash"`: unchanged.
- **Remove** the boot-time prompt-inbox watcher and the `notifications/claude/channel` emit wiring. The MCP server returns to a tools-only server (no long-lived watcher, no shutdown handlers for it).
- `agent_list` / `agent_status` unchanged.

### 3.2 agent-bus — files removed
- `prompt-watcher.ts` and `prompt-watcher.test.ts` — deleted (no agent-bus watcher anymore).
- `prompt-inbox.ts` and `prompt-inbox.test.ts` — deleted. Its surviving logic (8 KB cap, validation, compose) moves into a small focused module (see §3.3).

### 3.3 agent-bus — new module `prompt-compose.ts`
A pure module: validate a prompt body, flatten newlines, and compose the final injectable `text` with the attribution marker. Plus the writer that drops the `type:"prompt"` payload into a peer's `pty-controller/pending/`. Kept separate from `inbox-writer.ts` (which owns the slash payload) so each file has one clear responsibility, but both write to the same `pending/` dir.

### 3.4 agent-bus — reused unchanged
`send-guards.ts` (`normalizeTargets`, `isDestructiveSlash`), `registry.ts`, `peer-status.ts`, `inbox-writer.ts` (slash path).

### 3.5 wrapper `wrapper.ts` — new `prompt` payload type
- `consumePending` gains a `type:"prompt"` branch: inject `payload.text` followed by `\r`.
- New `injectText(text)`: writes `text` to the PTY, then writes `\r` after a short delay. Unlike `injectSlashCommand`, it does **not** need the autocomplete-picker workaround (no leading `/`), but reuses the same short submit pacing for reliability.
- Chained injections keep `POST_INJECTION_DELAY_MS` pacing.
- pty-controller plugin (MCP tools) is otherwise unchanged.

## 4. Prompt Composition

**Marker (verbatim), option (c) chosen during brainstorm:**

```
[Pesan dari agent <from> via agent-bus. Ini instruksi antar-agent, bukan dari user. Perlakukan sesuai skill using-agent-bus — anti-bounce: jangan auto-balas kecuali diminta eksplisit di dalam pesan.] <flattened-body>
```

- `<from>` = sender agent name (basename of sender's `CLAUDE_PROJECT_DIR`).
- `<flattened-body>` = the body with every run of `\r`/`\n` replaced by a single space, trimmed.
- The marker is composed by **agent-bus** (the sender knows `from`); the wrapper types `text` verbatim and stays oblivious to attribution.

## 5. Payload Schema (`pty-controller/pending/`)

```typescript
type PromptPayload = {
  id: string         // UUID
  ts: string         // ISO timestamp
  type: "prompt"     // distinguishes from "slash" / "switch"
  from: string       // sender agent name (for wrapper logging)
  text: string       // final injectable text = marker + flattened body
}
```

Written atomically (tmp + rename), consistent with the existing slash payload writer.

**Validation (sender side, before composing/writing):**
- `body` is a non-empty string.
- `Buffer.byteLength(body, 'utf8') <= 8192` (8 KB), checked on the raw body before the marker is added. Over → reject with a clear error.
- `from` resolves from `CLAUDE_PROJECT_DIR` basename (falls back to `"unknown"` only if unset).
- **No** `hop_count`, **no** `broadcast_group_id` (both dropped — irrelevant in the text-injection model).

## 6. Tool Surface — `agent_send`

`target: string | string[]`, `payload` is either `{kind:"prompt", body}` or `{kind:"slash", command, args?, sessionName?, confirmAfterMs?}`.

- `kind:"prompt"` → for each normalized target, compose + write a `type:"prompt"` payload to that peer's `pty-controller/pending/`. Returns `{kind:"prompt", results:[{target, ok, online, path?|error?}]}`.
- `kind:"slash"` → unchanged; blast-radius guard still rejects destructive slash (`/clear`, `/delete`) sent to an array of targets.

The tool description is updated to drop any mention of channel notifications and to state plainly that a prompt is typed into the peer's session as a user turn.

## 7. Loop Prevention

No structured `hop_count`. Loops are prevented by:
1. The **anti-bounce skill rule** in `using-agent-bus`: an inter-agent prompt is terminal context; do not `agent_send` in response unless the user asked or the prompt body explicitly says to report back.
2. The **prepended marker** (§4), which tells the receiving AI the message is an inter-agent instruction and to follow the anti-bounce rule.

This is weaker than a hard cap but is the accepted trade-off for the simpler delivery model. Documented as a known limitation.

## 8. Error Handling

| Case | Behavior |
|---|---|
| Target not in registry | per-target result `{ok:false, error:"not in registry", online:false}` |
| Target offline (stale heartbeat) | file still written to `pending/`; consumed by the wrapper on next boot; result carries `online:false` so the caller can warn the user |
| `body` > 8 KB | rejected at the sender with a clear error |
| Empty `body` | rejected at the sender |
| Wrapper sees malformed/unknown payload | logged and ignored (existing wrapper behavior) |

## 9. Testing Strategy

- **Unit (agent-bus `prompt-compose.ts`):** newline flattening (multi-line → single line), marker composition (correct `from`, body appended), validation (empty body rejected, >8 KB rejected), writer drops a `type:"prompt"` payload into the peer's `pty-controller/pending/` (not an agent-bus inbox).
- **Unit (agent-bus `server.ts` routing):** prompt routes to `pending/`, slash unchanged, broadcast writes one file per target, destructive-slash-to-array still rejected.
- **Unit (wrapper):** a `type:"prompt"` payload causes `injectText` to write `text` then `\r` (mock PTY write); unknown types ignored.
- **Integration:** `agent_send(kind:"prompt")` to a registered peer lands a correct `type:"prompt"` file in that peer's `pending/`.
- **Manual smoke (two real bots):** bot-03 → bot-02 prompt; confirm the marker+body appears in bot-02's session and bot-02 acts on it.

## 10. Teardown Checklist (part of implementation)

Done as a forward change on a feature branch (delete obsolete + add new), not a git revert:
- Delete `prompt-watcher.ts`, `prompt-watcher.test.ts`, `prompt-inbox.ts`, `prompt-inbox.test.ts`.
- Remove the boot watcher + notification emit + any `claude/channel` capability wiring from `server.ts`.
- Remove the prompt loopback test from `integration.test.ts` that asserted delivery to an agent-bus inbox; replace with the `pending/`-targeted assertion.

## 11. Versioning
- `agent-bus` `0.0.2` → `0.0.3` (delivery path changed).
- `pty-controller` `0.0.21` → `0.0.22` (wrapper gains the `prompt` payload type).

## 12. Non-Goals
- No channel registration for agent-bus (the whole point of the pivot).
- No multi-line prompt fidelity (flattened by design).
- No structured reply/correlation, no `hop_count` (loop safety is skill-based).
- No change to pty-controller's MCP tools or the slash/switch paths.

---

**Sign-off:** approved by Mirza on 2026-05-29 after a live test exposed the channel-registration gap. Brainstorm resolved: flatten newlines (a), verbose anti-bounce marker (c), teardown scope confirmed, hop_count dropped.

Next step: writing-plans skill to decompose into implementation tasks.
