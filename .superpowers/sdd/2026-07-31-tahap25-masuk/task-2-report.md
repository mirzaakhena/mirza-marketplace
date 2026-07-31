# Task 2 report — store `message_id`, `reply_to`, `metadata`, and add `session_id`

Status: **DONE**

Repo: `/Users/mirza/Workspace/mirza-bots`, branch `main`, committed locally (no push — repo has no remote).

## `resolveSessionId()` body kept

Verdict `V-1-partial` — kept the env-var body in `cc-plugin/src/main.ts`:

```ts
export function resolveSessionId(): string | undefined {
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  return id && id.length > 0 ? id : undefined;
}
```

The `V-2`, `V-3-debt`, and `none` bodies from the brief were never written — only the `V-1-partial` body was implemented, so there was nothing to delete.

## Files changed

- `fleetd/src/db/conversations-schema.ts` — split `SCHEMA` into `TABLE` / `INDEXES_AND_FTS`, added `ADDED_COLUMNS` + `addMissingColumns()` (PRAGMA table_info guard), `session_id` column + `idx_messages_session` + `idx_messages_message_id` indexes, `NewMessage.sessionId`, `insertMessage` now writes `session_id`.
- `fleetd/src/telegram/poller.ts` — `NormalizedMessage` gained `messageId?: string` and `replyTo?: string`; `handleIncomingMessage` reads `deps.registry.sessionIdFor(msg.bot)` once, passes `messageId`/`replyTo`/`sessionId` into `insertMessage`, and spreads `message_id`/`session_id` into `pushMsg.meta` only when defined (SCAR-056-safe).
- `fleetd/src/main.ts` — `normalizeMessage`'s `ids` param gained `messageId?: string | number`, stringified into the returned `NormalizedMessage`; the three call sites that have a Telegram message id now pass it (`message:text` handler, `message:photo` single-photo branch, album flush). The `callback_query:data` handler deliberately does NOT pass one (per the brief — the bot's own message id would misdirect history navigation).
- `fleetd/src/socket/protocol.ts` — `HelloRequestSchema` gained `sessionId: z.string().optional()`.
- `fleetd/src/socket/server.ts` — sets `conn.sessionId = req.sessionId` right before `registry.register(bot, conn)` in the `hello` handler.
- `fleetd/src/socket/registry.ts` — `BoundConnection.sessionId?: string`; `ConnectionRegistry.sessionIdFor(bot)` returns the first connection's sessionId for that bot, or `undefined`.
- `cc-plugin/src/fleetd-client.ts` — `connect(sockPath, cwd, sessionId?)`; hello write spreads `sessionId` in only when defined.
- `cc-plugin/src/main.ts` — added `resolveSessionId()`; `main()` passes `resolveSessionId()` as `connect`'s third argument.
- Tests: `fleetd/test/conversations-schema.test.ts`, `fleetd/test/socket/registry.test.ts`, `fleetd/test/socket/server.test.ts`, `fleetd/test/main.test.ts`, `fleetd/test/telegram/poller.test.ts`, `cc-plugin/test/fleetd-client.test.ts`, `cc-plugin/test/main.test.ts` — all extended exactly per the brief's literal test bodies.

## Test commands and full output

Baseline (before any change):

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
 59 pass
 0 fail
 167 expect() calls
Ran 59 tests across 14 files. [2.99s]

$ cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
 19 pass
 0 fail
 35 expect() calls
Ran 19 tests across 3 files. [528.00ms]
```

Step 2 — schema tests written, run to confirm RED:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts
SQLiteError: no such column: session_id
(fail) session_id column > session_id is stored and read back [1.74ms]
error: expect(received).toContain(expected) — Expected to contain: "session_id"
(fail) session_id column > an existing conversations.db created before session_id gets the column without losing rows [8.75ms]
 4 pass
 2 fail
 12 expect() calls
Ran 6 tests across 1 file. [38.00ms]
```
Matches brief's expectation exactly (2 failures for the stated reasons, 3rd new test already green).

Step 4 — after implementing the schema/migration:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts
 6 pass
 0 fail
 18 expect() calls
Ran 6 tests across 1 file. [42.00ms]
```

Step 6 — registry + socket-server tests, RED:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/socket/
TypeError: registry.sessionIdFor is not a function
(fail) ConnectionRegistry > sessionIdFor returns the session id of the connection bound to that bot [0.31ms]
error: expect(received).toEqual(expected)
  { "bot": "bot-01", "ok": true } vs { "error": "bad_request", "ok": false }
(fail) socket server > hello carrying a sessionId records it on the connection so pushes can be attributed to a session [5.20ms]
 16 pass
 2 fail
 38 expect() calls
Ran 18 tests across 2 files. [354.00ms]
```
Matches brief exactly.

Step 8 — after implementing registry/protocol/server:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/socket/
 18 pass
 0 fail
 41 expect() calls
Ran 18 tests across 2 files. [349.00ms]
```

Step 10 — poller + normalizeMessage tests, RED:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/main.test.ts test/telegram/poller.test.ts
(fail) normalizeMessage > carries the Telegram message id through as a string [0.74ms]
  Expected: "4321"  Received: undefined
(fail) handleIncomingMessage > stores the Telegram message id and pushes it in meta [0.92ms]
  Expected: "4321"  Received: null
(fail) handleIncomingMessage > stamps the message with the session id of the connection bound to that bot
  Expected: "sess-abc"  Received: null
 16 pass
 3 fail
 58 expect() calls
Ran 19 tests across 2 files. [119.00ms]
```
3 failures (main.test.ts: 1, poller.test.ts: 2) — the "leaves message id undefined" and "omits message_id from meta" tests both passed already, as the brief predicted.

Step 12 — after wiring poller.ts and main.ts, full fleetd suite:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
poller[bot-test]: start failed (attempt 1, retry in 1000ms): Error: ETIMEDOUT
poller[bot-test]: start failed (attempt 2, retry in 2000ms): Error: ETIMEDOUT
 69 pass
 0 fail
 188 expect() calls
Ran 69 tests across 14 files. [3.05s]
```
(The two ETIMEDOUT lines are console.error output from the pre-existing `startPolling retry loop` test intentionally exercising backoff — not a failure.)

Step 14 — cc-plugin tests, RED:

```
$ cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
error: expect(received).toEqual(expected)
  Expected: {"cwd": "/fake/cwd", "sessionId": "sess-abc", "type": "hello"}
  Received: {"cwd": "/fake/cwd", "type": "hello"}
(fail) FleetdClient > connect includes sessionId in the hello when one is given, and omits the key when not [1.98ms]

# Unhandled error between tests
SyntaxError: Export named 'resolveSessionId' not found in module '.../cc-plugin/src/main.ts'.

 15 pass
 2 fail
 1 error
 32 expect() calls
Ran 17 tests across 3 files. [526.00ms]
```
Deviation from the brief's literal prediction ("3 failures"): the missing `resolveSessionId` export makes the whole `main.test.ts` module fail to load, so bun reports it as one module-load error rather than two separate test failures. Same root cause the brief describes (`resolveSessionId` not exported, `connect` ignoring its third argument) — just counted differently by bun's reporter. Post-implementation count (22, see below) confirms both `resolveSessionId` tests exist and pass.

Step 17 — final, both suites:

```
$ cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
 69 pass
 0 fail
 188 expect() calls
Ran 69 tests across 14 files. [3.04s]

$ cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
 22 pass
 0 fail
 40 expect() calls
Ran 22 tests across 3 files. [522.00ms]
```

**fleetd 69 / cc-plugin 22, zero failures — matches the required target exactly.**

## Extra verification beyond the brief's steps

1. **Typecheck**: neither `fleetd/` nor `cc-plugin/` has a `tsconfig.json`, `@types/node`, or `bun-types` installed — there is no typecheck step in this project's workflow (confirmed: `bunx tsc --noEmit` on the changed files only produces global-declaration noise like "Cannot find module 'node:fs'" / "Cannot find name 'process'", which is pre-existing and unrelated to this change — it happens on files I didn't touch too, e.g. `src/config.ts`, `src/paths.ts`). `bun test` (which type-strips, doesn't typecheck) is the project's only verification mechanism per `CLAUDE.md`'s Testing section, so I did not add typecheck infrastructure — out of scope for this task.
2. **Only production caller of `FleetdClient.connect`**: `grep -rn "\.connect(" cc-plugin/src` confirms `cc-plugin/src/main.ts` is the only call site (the other `.connect(` hit is `server.connect(new StdioServerTransport())`, an unrelated MCP SDK method). Adding the optional third `sessionId` param to `FleetdClient.connect` is safe — no other caller to update.
3. **Live database check** (read-only, no modification): `~/.claude/mirza-bots/conversations.db` exists, has 17 real rows, and carries the full `messages_fts` / `messages_fts_data` / `messages_fts_docsize` / `messages_fts_idx` / `messages_fts_config` FTS5 index — and its `messages` table has exactly the pre-`session_id` column list (`id, ts, bot, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata`, no `session_id`) that the migration test's synthetic legacy schema recreates. This confirms the test's legacy fixture is not a strawman — it is the real shape fleetd will hit on next startup. The `addMissingColumns()` guard will run against this exact table.

## Notes for the reviewer / later implementers

- **`replyTo` is wired but nothing populates it yet.** `NormalizedMessage.replyTo`, the `insertMessage({ replyTo: msg.replyTo })` call, and the `reply_to` column write are all live, but no handler in `main.ts` ever sets `NormalizedMessage.replyTo` — there's no `replyTo` in `normalizeMessage`'s `ids` param at all. This is intentional per the brief's own comment (`// Telegram message id this one replies to (Task 3 fills it).`) and is untested for that reason. Task 3's implementer only needs to touch `normalizeMessage`'s call sites (extract `ctx.message.reply_to_message?.message_id` and thread it through) — the column, the type field, and the INSERT plumbing are already done.
- **`session_id` is a snapshot, not a live tracker.** Set once at `hello` time from `CLAUDE_CODE_SESSION_ID`; if the plugin process doesn't restart across a Claude Code session switch, stale attribution is possible (documented in both `registry.ts`'s `BoundConnection.sessionId` comment and `main.ts`'s `resolveSessionId` comment, per spec §8 risk 2). Not a bug in this task's scope — Tahap 4 owns authoritative session routing.
- All four bodies for `resolveSessionId()` were shown in the brief; only the `V-1-partial` one was ever written to disk, so there was no dead code from the other three verdicts to delete.
