# Task H1 report — hook SessionStart + jalur data rename (upsert only)

**Status:** DONE (with one production-wiring gap flagged below — see Concerns)

## Deliverables

- `packages/cc-stub/hooks/session-start.ts` — SessionStart hook: parses CC's
  stdin JSON, POSTs `session.started {bot_id, session_id, source, cwd}` to
  hostd over a one-shot named-pipe connection, prints hostd's
  `additionalContext` verbatim as the hook's `hookSpecificOutput`.
- `packages/cc-stub/hooks/hooks.json` — added `SessionStart` entry; merged
  cleanly alongside the existing `PreToolUse` (trailer-guard) entry and a
  concurrently-added `Stop` entry from another in-flight task (untouched by
  me, no conflict — different top-level hook keys).
- `packages/hostd/src/rpc-handlers.ts` — new `handleSessionStarted` +
  `SessionStartedParams` zod schema + `resolveBotForSessionStarted` +
  `RpcHandlerDeps.supervisors` (optional carry-through).
- `packages/hostd/src/server.ts` — wired `"session.started"` into the RPC
  method table (`handleSessionStarted(params, requireRpcDeps())`), same
  pattern as the existing D2 handlers.
- `packages/cc-stub/test/session-start.test.ts` — 13 tests.
- `packages/hostd/test/rpc-handlers.test.ts` — 9 new tests under
  `describe("handleSessionStarted")`.

## Design

**cc-stub hook (`session-start.ts`)**

- `parseSessionStartInput` reads CC's official SessionStart stdin fields
  (`session_id`, `source`, `cwd`); returns `null` (fail-silent) if
  `session_id` is missing/empty or the JSON doesn't parse — nothing worth
  reporting to hostd without an id. `source`/`cwd` default to `"unknown"`/the
  process's own `cwd()` if absent.
- Deliberately does **not** reuse `../src/ipc-client.ts`'s `connectHostd`:
  that client sends `session.register {bot_id}` on every connect, which would
  overwrite hostd's `connections` map entry (`server.ts`) for this bot_id on
  every SessionStart — clobbering the real, long-lived registration cc-stub's
  own MCP stdio process holds (used for `pushEvent`/`isRegistered`). Instead
  wrote a minimal, self-contained `callHostdOnce(pipeName, method, params,
  timeoutMs)`: connect, send one request, resolve/reject on the first
  correlated reply, destroy the socket. No registration side effect.
- Core logic (`reportSessionStarted`) takes an injectable `call` fn (mirrors
  `src/tools.ts`'s `ToolCallDeps` pattern) so tests exercise "POST benar /
  additionalContext from reply" and "hostd unreachable -> silent" without a
  real pipe; `callHostdOnce` itself is tested separately against a real
  mock-hostd `net.Server` (mirrors `ipc-client.test.ts`'s pattern), confirming
  it never sends `session.register` and rejects fast (not the full 5s
  timeout) when nothing is listening.
- Every failure mode — unreadable stdin, bad JSON, missing `session_id`,
  hostd unreachable/timeout, malformed/missing `additionalContext` in the
  reply — falls through to "print nothing, exit 0." Unlike `trailer-guard.ts`
  (a security gate with a real fail-closed branch), there is no decision here
  worth blocking SessionStart on.

**hostd (`handleSessionStarted`, `rpc-handlers.ts`)**

1. **Bot resolution** (`resolveBotForSessionStarted`): tries `cwd` against
   `config.bots[].workspace` first (path-normalized: backslash/forward-slash
   + trailing-slash + case insensitive, for Windows), falls back to the
   hook's self-reported `bot_id` only if no workspace matches. Rationale: a
   short-lived, unauthenticated hook process's *claimed* `bot_id` is less
   trustworthy than *which workspace it's actually running in* — hostd is
   meant to be the single writer/arbiter of state (recon-hooks.md §B's
   "peran" line). Throws a clear error (visible failure, per repo's §2.5
   convention) if neither resolves.
2. **`bots` row upsert (new, not in the brief, but required):** discovered
   `sessions.bot_id` carries `REFERENCES bots(id)` and nothing in current
   production wiring (`main.ts`) ever populates the `bots` table — the very
   first `session.started` call for any bot would otherwise fail an FK
   constraint (confirmed via the existing `handleAgentStatus` test, which had
   to manually `INSERT INTO bots` before inserting a `sessions` row). Added
   an idempotent `INSERT ... ON CONFLICT DO UPDATE` on `bots` before the
   `sessions` write so this handler is self-sufficient.
3. **`sessions` upsert:** `INSERT ... ON CONFLICT(id) DO UPDATE SET bot_id =
   excluded.bot_id, lifecycle = 'idle'`. A brand-new `session_id` gets a
   fresh row (`name`/`lifecycle` default `'idle'`). An existing `session_id`
   (the same session firing SessionStart again — e.g. after
   `BotSupervisor.clearSession()` marked it `'resetting'`) only has
   `lifecycle` flipped back to `'idle'` — fix M4 from the S1 review — while
   `name`/`started_at` are left untouched on conflict, so a renamed session
   (S2's future rename path) or its true original start time survive a
   clear/resume cycle. No jsonl/encoding guessing anywhere in this path
   (LOSS-1) — the row is written straight from validated RPC params.
4. **Barrier release:** `deps.supervisors?.get(bot.id)?.onSessionStarted()`
   — hook-inversion §5 step 2. `RpcHandlerDeps.supervisors` is typed as
   `ReadonlyMap<string, Pick<BotSupervisor, "onSessionStarted">>` (only the
   one method needed) so tests supply a plain fake object, no real
   `BotSupervisor` (which spawns a pty-holder child) required. Optional
   carry-through, same convention as `deliveryStats`/`supervisorStatuses`.
5. **Reply:** `{ additionalContext: 'Current session name: "<name>"' }` read
   from the just-upserted row's `name` column — INFRA-5: the exact same
   source `handleAgentStatus` reads, so the hook's injected context and
   `agent_status`/`agent.status` can never disagree.

`server.ts` wiring: added `"session.started": params =>
handleSessionStarted(params, requireRpcDeps())` to the handlers table,
imported alongside the existing D2 handlers — same shape as
`telegram.outbound`/`agent.list`/etc.

Item 4 of the brief ("jalur data rename... TAPI cukup: pastikan
onSessionStarted + upsert sessions bekerja; rename penuh biar S2") — no
rename-writing code added; `supervisor.ts`/`injection.ts` untouched entirely,
confirmed via `git status`.

## Test summary

`bun test packages/hostd packages/cc-stub` → **401 pass, 0 fail** (864
`expect()` calls) across 22 files (all pre-existing tests still green).

New coverage:

- **cc-stub (`session-start.test.ts`, 13 tests):** stdin parsing (valid,
  missing `cwd`/`source` with fallback/default, missing/empty `session_id` ->
  null, unparseable JSON -> null, empty stdin -> null); `formatHookOutput`
  shape; `reportSessionStarted` — exact params sent, `additionalContext`
  passthrough, hostd-unreachable -> null, missing/non-string/empty
  `additionalContext` -> null; `callHostdOnce` — real mock-pipe round trip
  confirming exactly one method sent (`session.started`, never
  `session.register`), RpcFailure -> rejects with server's message, no
  listener -> rejects fast (well under the timeout) with `"hostd
  unreachable"`.
- **hostd (`rpc-handlers.test.ts`, 9 tests):** brand-new session -> row +
  `additionalContext`; bot resolved via workspace mapping over a mismatched
  claimed `bot_id`; cwd-miss falls back to `bot_id` match; neither resolves ->
  clear error, nothing written; `bots` row auto-created (FK satisfied,
  production reality confirmed — no pre-existing `bots` row needed); existing
  `'resetting'`-lifecycle + custom-name row -> lifecycle flips to `'idle'`,
  name/`started_at` preserved (M4); barrier released via fake supervisor, and
  only the *resolved* bot's supervisor (not another bot's); `supervisors` dep
  absent -> no throw, row still written; bad params (missing `session_id`) ->
  zod throws, nothing written.

`bun run typecheck` (repo-root `tsc --noEmit`) → exit 0, no output.

`git status --porcelain` confirms only the files listed above were touched
(plus `packages/cc-stub/hooks/reply-guard.ts` /
`packages/cc-stub/test/reply-guard.test.ts` / the `Stop` entry in
`hooks.json`, all pre-existing/untouched artifacts of a concurrently-running
task — not created or modified by this pass).
`.superpowers/state/e1-*` untouched. No `git add`/`commit`/`push` performed.
`bun install` not run.

## Concerns

- **Production wiring gap (main.ts), by necessity of the file-scope
  restriction.** `RpcHandlerDeps.supervisors` must be populated by
  `main.ts`'s `registerRpcHandlerDeps({...})` call (add `supervisors:
  supervisors.supervisors` — `startSupervisors(...)` already returns exactly
  this map under `.supervisors`) for `onSessionStarted()` to actually fire in
  the real running process. `main.ts` is **not** in H1's allowed-file list, so
  this one-line integration edit was intentionally left undone — without it,
  the `/clear` barrier this handler exists to release will sit stuck until
  its own safety-timeout/alarm (existing `barrier_alarm` mechanism from S1),
  not permanently broken, but not actually fixed either until that wiring
  lands. Documented in a code comment at the `supervisors` field in
  `rpc-handlers.ts`.
- **Workspace-path matching is a pragmatic normalization** (backslash ->
  forward-slash, trailing-slash strip, lowercase) — good enough for
  Windows-style config paths in this repo's config examples, but doesn't
  resolve symlinks/junctions or differing drive-letter casing edge cases.
  Not something the brief asked for; flagging in case a real deployment hits
  a workspace path that doesn't match byte-for-byte after normalization (it
  falls back to `bot_id` match in that case, so it degrades rather than
  hard-fails, but silently picks a possibly-wrong bot if `bot_id` also
  happens to collide).
- Rename (S2's scope) genuinely untouched — `sessions.name` is never written
  by anything in this change except the upsert's `'idle'` default for a
  brand-new row; existing names always survive the conflict path unchanged.
