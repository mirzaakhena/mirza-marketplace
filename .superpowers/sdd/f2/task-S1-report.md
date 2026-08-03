# Task S1 report — bot-supervisor core (jantung fase 2)

**Status:** DONE

## Deliverables

- `packages/hostd/src/supervisor/injection.ts` — pure per-bot injection
  queue + clear-barrier gate. Ports `wrapper/src/injection-gate.ts`'s
  `InjectionGate` (holdFor/beginClearBarrier/releaseClearBarrier/
  clearBarrierActive/isBlocked) verbatim, with `CLEAR_BARRIER_TIMEOUT_MS`
  lowered to 120_000ms per the brief (was 10min in kode acuan). `InjectionQueue`:
  FIFO `InjectItem{id,kind:'slash'|'text'|'batch',payload,state,attempts,createdAt}`;
  `enqueueSlash`/`enqueueText`/`enqueueBatch` (guarded at enqueue, not just
  dispatch); `tick(now)` drives dispatch behind `MIN_INJECTION_GAP_MS`(1500)/
  `POST_INJECTION_DELAY_MS`(1000); `onInjected`/`onError`/`resetInFlight`/
  `onSessionStarted` are the IPC-event entry points a caller (supervisor.ts)
  wires in. Dead-letter via `deadLetterList()` after `MAX_INJECT_ATTEMPTS`(3).
  `guardSlashCommand` — SEC-3 regex `^\/[a-z][a-z0-9_:-]{0,63}([^\r\n\x00-\x1f]{0,256})?$`
  (control chars rejected), telegram-layer commands blocked (`/new`/`/switch`/
  `/delete`, duplicated from `plugins/pty-controller/slash-guards.ts` — no
  cross-repo import), `/effort` blocked unless `source:'supervisor'`.
- `packages/hostd/src/supervisor/supervisor.ts` — `BotSupervisor` (one per
  bot): `spawnRealHolder` spawns `node --import <tsx-loader> pty-holder/src/main.ts`
  (NDJSON IPC over stdio, cwd = bot workspace, env CLAUDE_BIN/CLAUDE_ARGS from
  the bot's config); exponential backoff on unexpected death (`pty-exit` or
  native `exit`) via an injectable `Clock`; `stop()` races the holder's RPC
  `shutdown` against a `forceKillTimeoutMs`(default 5000ms) OS-level
  `forceKill()` fallback — the README's documented supervisor-side safety
  net (pty-holder's own grace window is best-effort, not a substitute).
  `clearSession()` sets `sessions.lifecycle='resetting'` then enqueues
  `/clear` (`source:'supervisor'`); `onSessionStarted()` releases the barrier
  (H1 will wire the SessionStart hook to this — exposed now as the API the
  brief asked for). `enqueueFromLegacy({id,commands})` is X2's
  `enqueueInject` sink. `startSupervisors(config, db, deps)` mirrors
  `adapters/telegram.ts`'s `startTelegramAdapters` shape
  (`supervisors`/`statuses()`/`stopAll()`).
- `packages/hostd/src/state/sessions-store.ts` (new, small) —
  `setLatestSessionLifecycle(db, botId, lifecycle)`, used by `clearSession`.
- `packages/hostd/src/config.ts` — added optional `claude_bin`/`claude_args`
  per-bot fields (env override for the spawned holder).
- `packages/hostd/src/doctor.ts` — `supervisorStatuses` dep; `components.supervisors`
  now reports real `{botId: SupervisorStatus}` JSON when supplied, `"stub"`
  otherwise (backward-compat preserved).
- `packages/hostd/src/rpc-handlers.ts` / `src/server.ts` — `RpcHandlerDeps.supervisorStatuses`
  carry-through (same pattern as `deliveryStats`), wired into the `doctor` RPC handler.
- `packages/hostd/src/main.ts` — `startHostd` now: (1) spawns one
  `BotSupervisor` per configured bot via `startSupervisors` (test-injectable
  `spawnHolder`); (2) starts an X2 pending-consumer per bot at
  `state/<bot>/pending` wired to `supervisor.enqueueFromLegacy` (documented
  assumption below); (3) wires `supervisorStatuses` into `registerRpcHandlerDeps`;
  (4) `shutdown()` stops pending consumers + all supervisors before
  adapters/delivery. New `enableLegacyPendingShim` option to opt out (tests).
- Tests: `packages/hostd/test/injection.test.ts` (35 tests — gate, batch
  atomicity, clear barrier incl. timeout+ALARM, retry/dead-letter, slash-guard),
  `packages/hostd/test/supervisor.test.ts` (21 tests — spawn/status, backoff/
  restart incl. mid-flight retry, `stop()`'s RPC-vs-force-kill race,
  `clearSession`/`onSessionStarted`, `enqueueFromLegacy`, `startSupervisors`
  multi-bot), plus additions to `doctor.test.ts` and (7 call sites)
  `main.test.ts` for the new `spawnHolder`/`enableLegacyPendingShim` wiring.
  Per the brief, ALL of these use a fake in-memory `HolderHandle` + a
  manual `FakeClock` (setTimeout/setInterval fully driven by `.advance(ms)`)
  — zero real `node --import tsx` spawns anywhere in `bun test`.
- `packages/hostd/test-integration-supervisor.ts` (new, NOT part of `bun test`
  — mirrors pty-holder's own `test-integration.mjs` pattern) — spawns a REAL
  `BotSupervisor` + `spawnRealHolder` against a nested `cmd.exe`/`$SHELL -i`
  (never `claude`), enqueues a real text injection, waits for the real
  `injected` ack over the real NDJSON pipe, then exercises the real graceful
  `stop()`. Run manually: `bun run packages/hostd/test-integration-supervisor.ts`.

## A real bug this caught (and fixed)

The first run of the integration script failed: `ERR_MODULE_NOT_FOUND` for
`tsx`, then (after switching to an absolute path) `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
Root cause: pty-holder's `pty.ts` has **no separate cwd parameter** for the
inner `claude`/shell process — it always inherits the pty-holder Node
process's own cwd. So `spawnRealHolder` must set `cwd: bot.workspace` (for
the bot's session to run in the right directory), but that breaks Node's
bare-specifier resolution of `--import tsx` (`tsx` only exists in
`pty-holder/node_modules`, never hoisted into an arbitrary bot workspace).
Fixed by resolving tsx's loader (`pty-holder/node_modules/tsx/dist/loader.mjs`)
to an absolute path AND converting it to a proper `file://` URL via
`pathToFileURL` (a raw Windows `C:\...` path fed to `--import` is
misparsed as URL scheme `c:`) — `DEFAULT_TSX_LOADER`/`tsxLoaderSpecifier` in
`supervisor.ts`, both overridable via `SpawnHolderOptions` for tests. This is
exactly the kind of integration issue the fakes in `bun test` cannot catch —
confirms the "boleh sebagai script terpisah" instruction was worth doing.

## Design notes / ambiguity resolutions

- **Ambiguitas #1 (batch atomicity):** a `batch` item is stored as ONE queue
  slot (`payload: BatchSubItem[]`, internal cursor), not N separate FIFO
  entries. This makes "nothing interleaves between batch sub-items" true by
  construction (single-consumer + single-slot), and also gives `doctor`'s
  `queue: N` a sensible count (a batch is one unit of work, not N). A
  `/clear` mid-batch pauses only the REST of that same batch behind the
  barrier — verified in `injection.test.ts`.
- **Ack semantics:** `onInjected` = keystroke-typed ack (pty-holder's
  contract). For everything except `/clear` that's the item's full ack. For
  `/clear`, the item stays `'sent'` (not `'acked'`) until `onSessionStarted()`
  or the barrier's safety timeout — at timeout the item IS released
  (`state -> 'acked'`, so the queue doesn't deadlock) but `barrierAlarm()`
  latches `true` for doctor to surface (brief: "BUKAN diam"). The alarm
  clears on the next `/clear` that successfully arms a fresh barrier.
- **Legacy pending dir location (X2 wiring):** no config field exists for
  "the old wrapper's state dir" (different process/repo entirely) — reused
  `state/<bot>/pending` under hostd's existing `botStateDir` convention
  rather than inventing a new knob for a mixed-fleet window. Flagged in
  `main.ts` as a documented assumption; revisit if a real migration needs
  this independently configurable.
- Backoff/restart/force-kill timing is driven by an injectable `Clock`
  (`now`/`setTimeout`/`clearTimeout`/`setInterval`/`clearInterval`) — tests
  use a manual `FakeClock.advance(ms)`, zero real waiting.
- `pty-error` carries no correlation id (pty-holder's `PtyErrorEvent` is
  `{message}` only) — `BotSupervisor` blames whichever step is currently
  in-flight, if any (`queue.resetInFlight`); a `pty-error` with nothing in
  flight is a harmless no-op (covered by a test).

## Test summary

- `bun test packages/hostd packages/shared` → **349 pass, 0 fail** (744 `expect()` calls, 23 files).
- `bun test` (whole repo) → **627 pass, 0 fail** (1320 `expect()` calls, 38 files) — no regressions.
- `bun run typecheck` → **exit 0**.
- `bun run packages/hostd/test-integration-supervisor.ts` (manual, real
  `node --import tsx` child + real node-pty + real nested shell, NOT part of
  the suite) → **PASS** after the tsx-loader fix above: holder spawns
  (`status().holder === 'running'`), a real text injection is typed and
  acked (`injected` event received over the real pipe, queue drains), and
  `stop()` resolves gracefully (RPC `shutdown` ack, no force-kill needed,
  final `status().holder === 'dead'`) — full transcript in this report's
  git history / session log.

No `git add`/`commit`/`push` performed. `.superpowers/state/e1-*` untouched.

## Concerns

- **`.gitignore` pre-existing bug swallows a new file:** `mirza-harness/.gitignore`
  has a bare `state/` rule, which (without a leading `/`) matches ANY
  directory named `state` anywhere in the tree — not just the intended
  runtime `./state/` at repo root, but also `packages/hostd/src/state/`.
  This silently ignores my new `packages/hostd/src/state/sessions-store.ts`
  (`git status --ignored` confirms `!!`). It does NOT affect the pre-existing
  files in that directory (`access-store.ts`/`db.ts`/`messages-store.ts` —
  already tracked in the index, so the ignore rule only blocks NEW additions
  there). Whoever commits this work will need
  `git add -f packages/hostd/src/state/sessions-store.ts` explicitly, or fix
  the `.gitignore` to `/state/` (root-anchored) first. Left untouched per
  scope (not asked to touch repo config), but flagging so it isn't silently lost.
- **`spawnRealHolder`'s tsx-loader path is version/layout-coupled:** it
  hardcodes `pty-holder/node_modules/tsx/dist/loader.mjs`. If `tsx`'s
  package layout changes (or the install topology changes — e.g. hoisting
  tsx to the repo root instead of nesting it under pty-holder), this breaks
  silently until someone runs the real integration script. `tsxLoaderPath`
  is exposed as an override in `SpawnHolderOptions` for exactly this reason,
  but there's no automated check that the default still resolves in CI —
  only the manual integration script exercises it.
- **`onSessionStarted()` is currently un-targeted (global, not per-session):**
  it releases WHATEVER `/clear` barrier is currently armed for that bot, with
  no session-id correlation. H1 (SessionStart hook wiring) will call it on
  every fresh session start, which is correct for the single-in-flight-barrier
  model here, but if a future change allows overlapping/queued clears (it
  currently can't — barrier blocks the whole queue), this method would need
  a session-id parameter to avoid resolving the wrong one.
- **`enqueueFromLegacy`'s pending dir choice (`state/<bot>/pending`) is an
  assumption**, not a value confirmed against any real bot-lama deployment
  path — see "Design notes" above. Low risk (it's an empty directory unless
  something actually writes there), but worth a second look before this
  shim is relied on for a real mixed-fleet cutover.
- Per-bot supervisor restart backoff/`forceKillTimeoutMs`/`queuePollMs` are
  constructor options with sane defaults (1s/30s cap, 5s, 200ms) but are NOT
  yet exposed through `hostd.config.json` — every bot currently gets the
  same defaults. Fine for a pilot bot, revisit if per-bot tuning is needed.

## Fix pass 1 (robustness I1/I2/M1)

Reviewer approved with 2 Important + 2 minor flagged as needed before a 72h
soak. Fixed all four, only inside `packages/hostd/src/supervisor/{injection.ts,supervisor.ts}`
+ `test/{injection,supervisor}.test.ts`.

- **I1 (stuck-queue watchdog):** before this, only `/clear` had any timeout
  (the barrier); a holder that stayed alive but simply stopped emitting
  `injected {id}` for a non-`/clear` step — no `pty-error` either — left
  `pendingStep` populated forever, `tick()` early-returned permanently, and
  the whole per-bot queue froze. Added `STEP_ACK_TIMEOUT_MS` (30_000ms,
  injectable via `stepAckTimeoutMs`). Every non-`/clear` dispatch now arms a
  `deadline` on its `PendingStep`; `tick()` checks it before the existing
  `if (this.pendingStep) return;` early-return (same ordering pattern as the
  existing barrier-timeout check) and, on expiry, routes through the
  existing `onError` path — retry, then dead-letter after
  `MAX_INJECT_ATTEMPTS`, identical to a `pty-error`. `/clear` is deliberately
  exempt (`deadline: null`) — it keeps its own separate barrier timeout, not
  doubled up. Tests: holder that never emits `injected` → timeout → retry →
  dead-letter; ack arriving 1ms before the deadline → success, watchdog
  never fires; `/clear` explicitly proven exempt.
- **I2 (zombie holder on force-kill):** `stop()` used to call
  `holder.forceKill()` (plain `child.kill()` = SIGTERM) after the grace
  window and immediately set `holderState = 'dead'` with zero confirmation —
  a wedged holder ignoring SIGTERM left an orphaned OS process + node-pty
  grandchild while doctor reported 'dead'. `forceKill(signal?)` now takes an
  explicit `NodeJS.Signals` (real impl: `child.kill(signal)`). `stop()` now
  races the shutdown RPC ack against a native `exit` event against the
  existing grace timer; if the grace window elapses with **neither** an RPC
  ack **nor** an observed `exit`, it escalates straight to `forceKill("SIGKILL")`
  (unignorable at the OS level — no value in retrying SIGTERM first, since a
  holder that ignored the whole in-band grace window was never going to
  react to an out-of-band SIGTERM either) and sets a new sticky
  `SupervisorStatus.force_killed` flag as the doctor-visible trail. If the
  holder acks gracefully or reports `exit` on its own within the window, no
  force-kill is sent at all. Tests: wedged holder (hang) → SIGKILL sent
  after grace, `force_killed: true`; holder that emits a real `exit` mid-race
  → no SIGKILL at all, `force_killed: false`; existing "resolves via RPC ack"
  / "rejects" tests updated to also assert the escalation signal.
- **M1 (retry stepId race):** `stepId` used to be reused verbatim across
  retries of the same item/sub-step (`item.id` or `item.id#idx`), so a stale
  `injected` echo from an already-failed earlier attempt could spuriously
  match the `pendingStep` of an active retry and incorrectly ack it. Added a
  monotonic `attemptSeq` counter on `InjectionQueue`; every dispatch now
  sends `${baseStepId}@${attemptSeq++}` as the actual correlation token
  (stored verbatim in `pendingStep.stepId`, matched exactly as before in
  `onInjected`/`onError` — no match-logic changes needed, only the token
  itself changed). Test: first attempt fails → retry dispatches with a
  provably distinct token → a late echo using the FIRST attempt's stale
  token is ignored (item stays in-flight) → the real second-attempt echo
  still completes it correctly. Also covered for batch sub-item retries.
  Note: this changes the wire-visible stepId format for even a FIRST
  attempt (now always `...@0`), so `supervisor.test.ts`'s one exact-match
  assertion on the dispatched `stepId` was updated accordingly (was
  asserting the bare enqueue id; the test's `emitInjected(...)` call was
  also fixed to echo the actual dispatched token instead of the bare id it
  had been passing before — the old code path was inadvertently
  self-consistent with the pre-fix bug).
- **M5 (SEC-3 `\r` coverage):** added an explicit test asserting
  `guardSlashCommand` rejects `\r` specifically in the argument tail (mid-string,
  trailing, and argument-only), not just `\n`/`\x00`/`\x1b` as before — no
  production code change needed here, `SLASH_COMMAND_RE`'s
  `[^\r\n\x00-\x1f]` already covered it; this closes the test-coverage gap.

**Kept unchanged as instructed:** `MIN_INJECTION_GAP_MS`/`POST_INJECTION_DELAY_MS`
constants; the `/clear` barrier mechanism and its existing tests' semantics/timing.

**Verification:**
- `bun test packages/hostd packages/shared` → **357 pass, 0 fail** (785
  `expect()` calls, 23 files) — 8 new tests added (349 baseline + 8), zero
  regressions.
- `bun run typecheck` → **exit 0**.
- `bun run packages/hostd/test-integration-supervisor.ts` (real
  `spawnRealHolder` child, not part of the suite) → **PASS** — real
  inject/ack round-trip, real graceful `stop()` with
  `force_killed: false` confirming the I2 change doesn't regress the
  happy-path shutdown.

No `git add`/`commit`/`push` performed.
