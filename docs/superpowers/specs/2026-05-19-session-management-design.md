# Session Management — `/delete` + named `/new`

**Date:** 2026-05-19
**Affects:** `plugins/telegram/meta-commands.ts`, `plugins/telegram/meta-commands.test.ts`, `plugins/pty-controller/wrapper/src/wrapper.ts`
**Status:** Approved for implementation

## Motivation

The Telegram channel currently exposes `/new` (clear conversation + start fresh) and `/switch` (resume a different session in this project). The session picker rendered by `/switch` is opaque for sessions without a `name`: labels like `session a1b2c3d4` give no signal about content or recency, making it hard to pick the right one on a phone.

Two cooperating changes address this:

1. **Make `/new` require a session name.** From here on, every fresh session starts with a meaningful name supplied at creation time. Future pickers will read well.
2. **Add `/delete` to clean up stale sessions.** Legacy unnamed sessions and one-off "test" sessions accumulate and clutter the picker. Removing them is currently only possible by hand-deleting `.jsonl` files outside CC. Surface this as a first-class Telegram command with a confirm step.

Labels for legacy unnamed sessions are intentionally *not* improved in this design (no first-user-prompt parsing). The user accepted this scope: the named-`/new` change fixes the problem going forward, and `/delete` lets the user purge legacy junk rather than dressing it up.

## Out of scope

- Multi-select bulk delete. Single-session at a time.
- "Trash" / undo / recovery. Delete is permanent.
- Improved labels for sessions without `name`. They keep the `session <8hex>` fallback.
- Delete invoked from inside CC (a slash command). `/delete` is Telegram-only.
- Renaming an existing session via Telegram. CC already has `/rename` for the active session; out of scope here.

---

## Feature A — `/new <name>` (argument required)

### Telegram side (`meta-commands.ts`)

`tryRouteMetaCommand` already special-cases `/new` (exact-match, lowercased). Update:

- Parse the argument from the inbound text: everything after `/new` and the first whitespace, trimmed.
- If empty after trim → reject with a usage message and do **not** write to the wrapper inbox:

  > `⚠️ /new butuh nama session. Contoh: /new bahas MCP`

- If non-empty → write the existing payload shape extended with a `sessionName` field:

  ```json
  {
    "id": "<uuid>",
    "ts": "<iso>",
    "type": "slash",
    "command": "/clear",
    "sessionName": "<the argument, trimmed>"
  }
  ```

- Reply to the user with the existing ack: `🔄 Clearing session — fresh session sebentar lagi siap.` (Optionally include the chosen name; minor polish, not load-bearing.)

**Length cap:** if `sessionName` is longer than 64 chars, truncate to 64 with no error. CC's `/rename` may impose its own limit; if it does we adopt that. Until proven otherwise, 64 is a defensive ceiling.

**Validation:** allow any characters except newline and carriage return (they would break the PTY-injected `/rename <name>\r` syntax). Strip them silently.

### Wrapper side (`wrapper.ts`)

The wrapper already has a post-`/clear` state machine (`awaitingClearReady`, `sessionPollInterval`) that polls `~/.claude/projects/<encoded>/` for a new `.jsonl` and, on detection, injects `/notify-user <brief>` into the live PTY.

Extend that state to carry the optional `sessionName`:

```ts
let awaitingClearReady:
  | { sessionsBefore: Set<string>; sessionName?: string }
  | null = null
```

`consumePending` sets `awaitingClearReady.sessionName = payload.sessionName` when it sees a `/clear` payload that includes one. The poll loop, on detecting a new session jsonl, runs this sequence in order:

1. `currentPty.write(`/rename ${sessionName}\r`)` — only if `sessionName` is set.
2. `currentPty.write(`/notify-user ${POST_CLEAR_NOTIFY_BRIEF}\r`)`.

Between the two injections, no explicit wait is needed: CC processes its input buffer serially, so `/rename` lands before `/notify-user` regardless of how close together we write them. (Same guarantee the existing single-injection path already relies on.)

If `sessionName` is absent (older payloads, pty-controller MCP tool used directly), step 1 is skipped — pre-existing behavior, no `/rename` happens. This preserves backward compatibility.

### Failure modes

- `/new` with no/empty arg → rejected at the Telegram boundary; the wrapper never sees the payload, so the user-facing CC session is unaffected.
- `/rename` fails inside CC (illegal characters, CC bug) → user sees CC's own error in the new session's first turn; wrapper does not try to compensate. `/notify-user` still runs.

### Tests (`meta-commands.test.ts`)

Add cases:
- `tryRouteMetaCommand('/new bahas MCP', …)` writes payload with `sessionName: "bahas MCP"`.
- `tryRouteMetaCommand('/new', …)` does **not** write payload; replies with the usage message.
- `tryRouteMetaCommand('/new   ', …)` (whitespace-only arg) is treated as empty → usage message.
- Newline-in-arg case: `/new bahas\nMCP` → name in payload is `bahas MCP` (newlines and CRs are replaced with single spaces before write).

---

## Feature B — `/delete` (new command)

### Telegram side (`meta-commands.ts`)

Add `/delete` recognition in `tryRouteMetaCommand` alongside `/new` and `/switch`. The handler is structurally similar to `handleSwitch`:

1. Resolve `CLAUDE_PROJECT_DIR` (refuse with a clear message if absent — same pattern as the other meta-commands).
2. Confirm the wrapper is alive via `wrapperHeartbeatFresh` (cheap sanity check; if the wrapper is dead, the user has bigger problems).
3. Read the current session id from the wrapper-written state file (see below). If the file is missing (very early in wrapper lifetime), proceed without exclusion — better to let the user delete a non-current session than refuse the command entirely.
4. Call `listProjectSessions(projectDir)` and filter out the current session id.
5. If the filtered list is empty: reply `Tidak ada session lain yang bisa dihapus.` and return.
6. Otherwise: render a picker keyboard identical in shape to `/switch`'s picker (one button per row, max `MAX_DELETE_BUTTONS = 7` rows + a cancel button). Populate an in-memory map `deletePicker: Map<shortId, {sessionId, label}>` (parallel to `switchPicker`, lifetime same).
7. Callback handling: `meta:delete_<shortId>` taps trigger the **confirmation step** (see below), not an immediate delete.

### Confirmation step

When the user taps a session row:

- Acknowledge the callback (`ackCallback("Konfirmasi diperlukan")` — short, non-intrusive).
- Edit the original picker message to remove its keyboard and show only the chosen label.
- Send a **new** reply: `Hapus session "<label>"? Ini PERMANEN, tidak bisa di-undo.` with a two-button keyboard:
  - `✅ Confirm` → callback `meta:delete_confirm_<shortId>`
  - `❌ Cancel` → callback `meta:delete_cancel`

Use a distinct cancel callback (`meta:delete_cancel`) rather than the existing generic `meta:cancel`. The existing handler hard-codes its edit-message to `(switch cancelled)`; reusing it for delete would mislabel the outcome. The delete cancel handler edits the message to `(delete cancelled)`.

On confirm tap:

1. Acknowledge the callback.
2. **Re-check** the wrapper's current session id one more time (race: the user might have switched between picker render and the confirm tap). If it now matches the to-be-deleted session, abort with `⚠️ Tidak bisa hapus — itu session yang sedang aktif.`
3. Compute the `.jsonl` path: `~/.claude/projects/<encoded>/<sessionId>.jsonl`. Encode the project dir with the same `encodeProjectDir` rule the wrapper uses (`p.replace(/[\\/:]/g, '-')`); duplicate the helper or extract it into a tiny shared module — implementation chooses.
4. `rmSync` the file. If it's already gone (manual delete, etc.), treat as success — the outcome is what the user wanted.
5. Edit the confirmation message to `🗑️ session "<label>" dihapus.`
6. Drop the `deletePicker` entry so the same shortId cannot be re-tapped.

### Wrapper side: current-session tracker

The wrapper writes its current PTY's session id to a small state file so the plugin can read it:

```
<STATE_DIR>/wrapper.current_session_id
```

(Adjacent to `wrapper.heartbeat`, same directory.)

Contents: the bare session id (no JSON wrapping). UTF-8, no trailing newline (or one — readers tolerate both via `.trim()`).

**When the wrapper updates it:**

- **Initial detection.** After the first `claude` spawn, poll `CLAUDE_PROJECTS_DIR` until a new `.jsonl` appears (same mechanism as the post-`/clear` poll, generalised). Write that session id to the file. Until the first write lands, the file is absent — readers must tolerate that.
- **Post-`/clear`.** When the `awaitingClearReady` poll detects a new session jsonl, overwrite the file with the new id *before* injecting `/rename` and `/notify-user`. Order matters: if the plugin reads the file between `/rename` and `/notify-user`, it should already see the new id.
- **Post-`/resume`.** When `consumePending` handles `type:"switch"`, the new session id is known immediately (it's the payload's `sessionId`). Overwrite the file at the moment of injection. The actual CC-side swap may complete a beat later, but the file truthfully reports the *intended* current session, which is what the plugin cares about (we don't want to allow deleting the session CC is about to resume into).

**Atomic write:** write to `<file>.tmp.<pid>` then rename to final path, same pattern the wrapper already uses for command files.

### Failure modes

- `/delete` invoked with **no other session** to delete (only current session exists) → reply `Tidak ada session lain yang bisa dihapus.`
- Picker tap stale (`deletePicker` map cleared by a later `/delete` invocation) → reply `Picker expired, /delete lagi`.
- Confirm tap for a session that has since become current → block, reply with the "session aktif" warning above.
- `rmSync` errors with anything other than ENOENT → reply `⚠️ Gagal hapus: <err.message>`. Do not retry; do not silently swallow.
- Wrapper state file missing on /delete invocation → proceed without exclusion. Log a debug line; do not block the user.

### Tests (`meta-commands.test.ts`)

Add cases:
- `/delete` with the current session being the only one → reply with "no other session" message; no picker.
- `/delete` with two sessions, one current → picker shows only the non-current one.
- Picker tap for known shortId → emits confirmation message with the two buttons; no file deletion yet.
- Confirm tap → calls into the deletion path (mock `rmSync`); verify the right path is computed.
- Confirm tap when the target has since become current → blocked, no `rmSync` call.
- Cancel tap at either step → cleans up state, no `rmSync` call.

---

## Data flow summary

```
/new bahas MCP (Telegram)
    ↓
meta-commands.ts handleNew
    ↓ writes {type:"slash", command:"/clear", sessionName:"bahas MCP"}
wrapper consumePending
    ↓ injects /clear into PTY
    ↓ sets awaitingClearReady = { sessionsBefore, sessionName: "bahas MCP" }
CC processes /clear → new session jsonl appears
    ↓
wrapper sessionPollInterval detects new jsonl
    ↓ writes new sessionId to wrapper.current_session_id
    ↓ injects /rename bahas MCP\r
    ↓ injects /notify-user <brief>\r
CC fresh session pings the user with the brief
```

```
/delete (Telegram)
    ↓
meta-commands.ts handleDelete
    ↓ reads wrapper.current_session_id
    ↓ lists sessions, excludes current
picker render
    ↓ user tap on a row
confirmation prompt
    ↓ user tap Confirm
re-check current session id
    ↓ rmSync project jsonl
edit message to "deleted"
```

## Files touched

| File | Change |
| --- | --- |
| `plugins/telegram/meta-commands.ts` | Extend `handleNew` to parse + require arg; add `handleDelete` + confirmation callback; add `deletePicker` map |
| `plugins/telegram/meta-commands.test.ts` | New cases per "Tests" sections above |
| `plugins/pty-controller/wrapper/src/wrapper.ts` | Add `wrapper.current_session_id` tracker; extend `awaitingClearReady` with `sessionName`; chain `/rename` before `/notify-user` in poll loop |

No new dependencies. No schema changes to `access.json` or `messages.db`.

## Version bumps

- `plugins/telegram`: minor bump (new meta-command + extended /new contract).
- `plugins/pty-controller`: minor bump (new wrapper state file, new injection chain).
