# Task P1 report — pty-holder (thin child holding the PTY)

**Status:** DONE

## Deliverables

- `packages/pty-holder/src/inject.ts` — pure pacing/splitting logic, no
  `node-pty` import. `chunkText` (code-point-safe, default size 100),
  `clampConfirmDelay` ([50,5000]), `planInject(text, submit)` (chunked typing
  + optional trailing `\r` SUBMIT_DELAY_MS=250 after the last chunk),
  `planInjectSlash(command, confirmAfterMs?)` (single write + `\r` at
  SUBMIT_DELAY_MS, optional SECOND `\r` at `SUBMIT_DELAY_MS + clamp(confirmAfterMs)`).
- `packages/pty-holder/src/ipc.ts` — zod schemas (`InjectParams`,
  `InjectSlashParams`, `ResizeParams`) built on `@mirza-harness/shared`'s
  `RpcRequest`/`RpcEvent` envelope, plus `writeLine`/`makeEvent`/`makeResult`/
  `makeError` helpers. Also no `node-pty` import.
- `packages/pty-holder/src/pty.ts` — the only file touching `node-pty`.
  `spawnClaudePty()` reproduces kode acuan's spawn chain verbatim
  (`wrapper.ts:553-587,255-267,368-369`): Windows → `cmd.exe /c "<cmd>"`;
  Unix → `$SHELL -l -i -c "<cmd>"`; env `CLAUDE_BIN`/`CLAUDE_ARGS`/`SHELL`,
  same `DEFAULT_CLAUDE_ARGS` default. `runPlan(pty, steps, onDone)` executes
  an `InjectStep[]` plan against a live `IPty` via `setTimeout`, firing
  `onDone` once the last write has gone out.
- `packages/pty-holder/src/main.ts` — entrypoint. Reads its OWN version from
  `package.json` (VER-1). stdin NDJSON → `RpcRequest` dispatch
  (`inject`/`inject-slash`/`resize`/`shutdown`, zod-validated, `-32602` on bad
  params, `-32601` on unknown method) → immediate `RpcResponse` +
  async `injected {id}` event once the write plan lands. `pty.onExit` →
  `pty-exit {code, signal}` event + shutdown. Spawn failures / write-time
  throws → `pty-error {message}`. SIGINT forwards to the PTY; SIGTERM/
  `shutdown` request kill it and exit. No session/name/barrier knowledge
  anywhere in this package, per the brief.
- `packages/pty-holder/src/index.ts` — barrel re-exporting only `inject.ts`+
  `ipc.ts` (deliberately NOT `pty.ts`/`main.ts`, so importing the package
  never drags in the native module).
- `packages/pty-holder/test/inject.test.ts` (21 tests), `.../test/ipc.test.ts`
  (14 tests) — pure logic, `bun:test`, zero `node-pty` import.
- `packages/pty-holder/test-integration.mjs` — manual Node-only smoke test:
  spawns a REAL PTY via `node-pty` running a plain shell (`cmd.exe` /
  `$SHELL -i`, **not** `claude`), drives it through this package's actual
  `planInject`/`planInjectSlash`/`runPlan`, and asserts three markers
  (short command, slash-style command, and a 250-char body spanning 3
  chunk boundaries) round-trip intact through real Windows ConPTY.
- `packages/pty-holder/package.json` — `node-pty@^1.1.0` (same major/minor as
  the reference wrapper), `"engines": {"node": ">=18"}`, `tsx` devDependency,
  `start`/`test:integration` scripts running under `node --import tsx`.
- `packages/pty-holder/README.md` — documents the Node-not-Bun decision, how
  to run the holder and both test surfaces, and the env-var contract.

## Design notes

- **Runtime = Node** per the user's final decision: `node-pty` is a native
  addon built for Node's ABI; the package's executable code
  (`pty.ts`/`main.ts`) runs via `node --import tsx src/main.ts` (same
  approach as kode acuan's `"wrapper": "tsx src/wrapper.ts"` script). Pure
  logic (`inject.ts`/`ipc.ts`) has no such constraint and runs fine under
  `bun:test`.
- **Protocol id vs RPC id:** `inject`/`inject-slash`'s own `id` field
  (echoed on the later `injected` event) is a caller-chosen correlation id,
  separate from the JSON-RPC envelope `id` used for the immediate
  request/response pair — a request gets BOTH an immediate `{queued:true}`
  response (envelope id) AND, once the keystrokes actually land, an
  `injected {id}` event (payload id). This two-step ack matches the brief's
  "ack level = keystroke tertulis, bukan semantik selesai."
- **`confirmAfterMs` clamp point:** the second `\r` fires
  `SUBMIT_DELAY_MS + clamp(confirmAfterMs)` after the plan starts — i.e.
  `clamp(confirmAfterMs)` after the FIRST `\r`, not from t=0. Interpreted
  this way since a confirmation keypress logically follows the initial
  submit's Enter, not the start of typing.
- **No raw PTY-output forwarding on stdout:** stdout is reserved entirely for
  the NDJSON protocol; `pty.onData` is intentionally not wired to anything
  (the interface list in the brief has no "pty-data" event, and
  session/output parsing is explicitly out of scope for this thin holder).
- `spawnClaudePty`'s `DEFAULT_CLAUDE_ARGS` was kept byte-for-byte identical
  to kode acuan (including the `mirza-marketplace`-specific telegram-channel
  flag) per "spawn chain persis kode acuan" — overridable via `CLAUDE_ARGS`.

## Test summary

- `bun test packages/pty-holder` → **35 pass, 0 fail**, 46 `expect()` calls
  (21 in `inject.test.ts` + 14 in `ipc.test.ts`). Covers: empty/short/multi-chunk/exact-multiple splitting,
  surrogate-pair safety (both in `chunkText` directly and inside a real
  `planInject` plan), `clampConfirmDelay` boundary + inside/outside range,
  `planInject` submit true/false/empty-text pacing math, `planInjectSlash`
  with/without `confirmAfterMs` + clamp-below/above, and all four `ipc.ts`
  zod schemas (accept/reject/strict-extra-key) plus the envelope builders.
- `bun test` (whole repo) → **541 pass, 0 fail** across 36 files — no
  regressions in other packages.
- `bun run typecheck` → **exit 0** (repo-wide `tsc --noEmit`; required one
  explicit `IPty` type annotation in `main.ts` to satisfy `noImplicitAny`).
- `bun install` at root → succeeded (2.5s, 10 packages). Node version on this
  machine: **v22.20.0** (>=18 required). `node-pty@1.1.0` resolved
  **prebuilt** binaries for `win32-x64` (`pty.node`, `conpty.node`) — no
  native compiler/toolchain needed, no build step ran.
- `node --import tsx test-integration.mjs` (run manually, Node, real
  Windows ConPTY, plain `cmd.exe` — not claude): **all 3 tests PASS** —
  short echo command, slash-style command, and a 250-char body spanning
  3×(100/100/50) chunk boundaries all arrived at the shell intact via the
  real `planInject`/`planInjectSlash`/`runPlan` code path.
- Additionally did an ad-hoc full-protocol smoke test of `main.ts` itself
  (spawn as a real child process, feed it `inject`/`resize`/`shutdown`
  NDJSON requests over stdin, read NDJSON responses/events off stdout):
  observed the correct sequence `inject→{queued:true}` → `injected{id}` →
  `resize→{ok:true}` → `shutdown→{ok:true}` → `pty-exit{...}`, confirming
  the wiring (not just the underlying pure functions) works end-to-end.

No `git add`/commit/push was performed.

## Concerns

- **Forced `.kill()` on a still-alive Windows PTY child can crash the
  holder** when there is no real attached Win32 console in the process
  tree (observed during the ad-hoc `main.ts` smoke test, run from a
  Git-Bash/piped-stdio shell): node-pty's Windows `kill()` path
  `fork()`s an internal helper (`conpty_console_list_agent`) to enumerate
  the console process list, and that helper's `AttachConsole` call throws
  uncaught when no console is attached, killing the forked helper (and
  possibly the parent, depending on stdio inheritance). This did NOT occur
  in `test-integration.mjs`, where the shell was told to `exit` gracefully
  *before* `pty.kill()` was called — only the forceful/immediate-kill path
  on a still-running process triggers it. Likely fine under a real
  supervisor with normal (non-emulated) stdio, but worth a follow-up check
  before wiring `shutdown`/SIGTERM into production — possibly prefer a
  graceful nudge (e.g. write an EOF/exit keystroke, wait briefly, then
  `.kill()` as a fallback) over an immediate hard kill.
- **`inject`'s "queued" response is optimistic** — `respond(req.id,
  {queued:true})` fires before `runPlan` schedules anything and is not
  itself gated on the PTY still being alive; if the PTY has already exited
  between request-receipt and the first `setTimeout` firing, `pty.write()`
  inside `runPlan` will throw, which is caught and reported as a
  `pty-error` event, but the caller already got a `{queued:true}` success
  response for a write that never lands. A caller relying solely on the
  RPC response (rather than also watching for `pty-error`/absence of
  `injected`) could be misled briefly around shutdown races.
- Per the brief, `bun.lock` now reflects the new `node-pty`/`tsx`/`zod`
  (pty-holder's own) dependencies from the `bun install` run — not
  reverted, since the brief explicitly permitted `bun install` at root for
  workspace resolution.

## Fix pass 1 (shutdown safety)

**Root cause confirmed via direct reproduction** (driver scripts spawning
`main.ts` as a real child process, stdio fully piped, no attached console —
matching how a supervisor launches the holder): `pty.kill()` on Windows
console-less stdio ALWAYS triggers an uncaught `AttachConsole failed` inside
node-pty's forked ConPTY helper (`conpty_console_list_agent`), on the
**normal** exit path (not just a forceful-kill edge case), because the old
code called `pty.kill()` a second time from inside `pty.onExit` even when
the held process had already died on its own. A `try/catch` around the
holder's own call cannot catch it — the throw fires in a separate forked
process. Confirmed the un-fixed code hangs 6.3s on natural exit and never
exits within 15s on an explicit `shutdown` RPC (both repro'd before
applying the fix, then re-confirmed fixed after).

**Fix** (`packages/pty-holder/src/main.ts`, `src/ipc.ts`, `README.md`,
`test/inject.test.ts` — nothing touched outside `packages/pty-holder/**`):

1. **Natural-exit path** (`pty.onExit`, held process died by itself): no
   longer calls `pty.kill()` again — goes straight to `process.exit()` once
   the `pty-exit` event has been flushed to stdout (via a `writeLine`
   completion callback).
2. **Explicit `shutdown()`**: still attempts `pty.kill()` (try/catch,
   best-effort), then force-calls `process.exit(code)` after a bounded
   `SHUTDOWN_GRACE_MS` (1500ms) grace window instead of relying on the event
   loop draining naturally — short-circuited early if the held process
   reports its own exit first. The `shutdown` RPC's `{ok:true}` response is
   written with a flush callback and only then triggers `shutdown()`, so the
   ack is guaranteed to reach the supervisor before the process can exit.
   `ipc.ts`'s `writeLine` now takes an optional Node-style write-completion
   callback to support this (backward compatible, existing call sites
   unaffected).
3. **Documented the S1 exit-time contract** in the package README (new
   "Exit-time contract (S1)" section) and in `main.ts`'s docstrings: the
   supervisor must NOT assume fast/deterministic exit after `shutdown` and
   must keep its own independent OS-level force-kill timeout (~5s) on the
   holder process as a fallback of last resort — this package's internal
   grace window is best-effort, not a substitute.
4. Added two `chunkText` unit tests per reviewer request: flag emoji
   (`🇺🇸`, a regional-indicator pair) and ZWJ family emoji (`👨‍👩‍👧‍👦`) at chunk
   boundaries — assert `chunks.join('')` reconstructs the original text and
   no individual chunk ever contains a bisected surrogate pair.

**Verification:**

- `bun test packages/pty-holder`: 37 pass, 0 fail (was 30-ish before the 2
  new chunkText tests were added).
- `bun run typecheck` (`tsc --noEmit`): exit 0, no errors.
- Reproduction re-run against the FIXED code (5 trials total, both
  scenarios, driver: real child process, stdio piped, `windowsHide: true`,
  no attached console):
  - Scenario A — explicit `shutdown` RPC while a nested shell (`cmd`) is
    still alive: exits in **~89-90ms** (3 runs: 89, 90, 89), `{ok:true}`
    response AND `pty-exit` event both observed on stdout before exit, no
    `AttachConsole` trace on stderr.
  - Scenario B — natural exit (held process, `cmd /c exit`, dies on its
    own): exits in **~1310-1316ms** (3 runs: 1313, 1310, 1315), `pty-exit`
    event observed, no `AttachConsole` trace on stderr.
  - Both comfortably under the 3s bar from the brief.
- Sanity check — same two scenarios re-run against the ORIGINAL (pre-fix)
  code for comparison: Scenario A never exited within the 15s driver
  timeout (crash trace `AttachConsole failed` in
  `conpty_console_list_agent.ts:13` visible on stderr); Scenario B exited
  in 6328ms with the same crash trace. Confirms both the bug and the fix.

No git operations performed (working tree only, per instructions).
