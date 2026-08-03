# Task X2 report — shim consumer pending/*.json

**Status:** DONE

## Deliverables

- `packages/shared/src/legacy-pending.ts` — zod schemas + `parseLegacyPending`,
  the single validation point for the mailbox (recon-hooks §D "ambiguitas #2").
  Exported via `packages/shared/src/index.ts`.
- `packages/shared/test/legacy-pending.test.ts` — 14 tests for the three root
  shapes + rejection cases.
- `packages/hostd/src/shim/pending-consumer.ts` — `startPendingConsumer()`.
- `packages/hostd/test/pending-consumer.test.ts` — 7 tests (prompt, single
  command, batch order, corrupt JSON, corrupt schema, idempotency, `.tmp.`
  skip, EPERM retry).

## Design

- **Validation (`legacy-pending.ts`):** three root shapes only, matching the
  kode acuan writers exactly — single command `{id,ts,command,...}`
  (`plugins/pty-controller/ipc.ts` `writeCommand`), batch (JSON array of
  `{command,sessionName?,confirmAfterMs?}`, no id/ts on the root or items —
  `writeBatch`), and agent-bus prompt `{id,ts,type:"prompt",from,text,
  hop_count}` (`plugins/agent-bus/prompt-compose.ts` `writePromptToPending`).
  All three schemas are `.strict()` but keep the legacy optional extras
  (`sessionName`, `confirmAfterMs`, `from`/`hop_count`/`correlation_id` on a
  bare command) so real cross-fleet files aren't falsely quarantined.
  `type:"switch"` (session-switch) is deliberately NOT accepted this phase —
  that's S2/session-ops scope; such a file quarantines visibly instead of
  being silently mis-handled.
- **Watch+sweep (SCAR-021):** `fs.watch` with 50ms defer (default,
  test-overridable) mirrors kode acuan's Windows rename-commit workaround
  (`wrapper.ts:1218-1228`); a 2s sweep interval (also overridable) is the
  fallback for missed fs.watch events, and is what the tests actually drive
  (shrunk to 20ms) for determinism instead of depending on real fs.watch
  timing.
- **Retry (SCAR-022):** `withRetry()` retries only `EPERM`/`EBUSY`, 5 attempts
  total, backoff 50/100/150/200ms between them — same numbers as kode acuan's
  `persistRegistry` (`wrapper.ts:466-492`), but implemented as non-blocking
  `setTimeout` sleeps instead of a busy-wait (this consumer is async
  end-to-end; a busy-wait would stall hostd's whole event loop). Applied to
  read, delete, and quarantine-rename. The fs surface is injectable
  (`PendingFsOps`, defaults to real `node:fs`) so tests can make `rename`
  throw EPERM once without module-level mocking.
- **Idempotency by id (LOSS-3):** an in-memory `Set<string>` of processed ids,
  scoped to consumer lifetime. Effective id = payload `id` when present
  (prompt/command), else the pending file's own name stem (batch has no
  root/item id in kode acuan — the writer-minted UUID filename is the closest
  stable identity). The check-then-`Set.add` happens with no `await` in
  between, so even two duplicate-id files discovered in the same sweep tick
  resolve correctly (JS microtask ordering keeps the first file's
  claim-then-enqueue fully synchronous before the second file's continuation
  runs) — verified with a sequential-resend test; the same-tick case follows
  from the code shape but wasn't separately exercised.
  `enqueueEnv` returning `false` (bus-level duplicate) is treated the same as
  an in-memory hit: not an error, just skip+delete.
- **Dispatch:** prompt → `Envelope.parse({kind:"prompt", to: botId, from:
  payload.from, hop: payload.hop_count, payload:{content: payload.text,
  meta:{...}}})` — mirrors the real `kind:"prompt"` producer in
  `packages/hostd/src/rpc-handlers.ts` (`handleAgentSend`), payload `content`
  shape. `text` is passed through **unmodified** as `content` — it's already
  composed (anti-bounce marker + flattened body) by the sending bot-lama's
  agent-bus. Hop-limit parity: `hop_count > MAX_HOP` (5, reused from
  `@mirza-harness/shared`'s `bus.ts`) silently drops + deletes (info status,
  no quarantine) — matches kode acuan's `consumePending` hop-guard, not a
  schema failure. Command/batch → `enqueueInject({id, commands:[...]})`; batch
  order is preserved verbatim. Neither queue exists yet (S1) — both are
  plain injectable callbacks per the brief ("cukup kontrak callback").
- Corrupt files (bad JSON or schema failure) are **never** silently deleted:
  renamed to `<name>.rejected-<ts>` (retried) + `onStatus({level:"warning"})`.

## Test summary

`bun test packages/hostd packages/shared` → **288 pass, 0 fail** (21 new:
14 in `legacy-pending.test.ts`, 7 in `pending-consumer.test.ts`; rest
pre-existing, unaffected).

Covers, per the brief's test list:
- Valid prompt file → correct envelope (`kind`, `to`, `from`, `hop`,
  `payload.content`/`meta`), file deleted after enqueue.
- Single command → `enqueueInject({id, commands:["/clear"]})`.
- Batch → one `enqueueInject` call, commands in original order, id = filename
  stem.
- Corrupt JSON and schema-invalid payload (missing leading `/`) → both
  quarantine (`.rejected-<ts>` file appears, original gone), `onStatus`
  warning fires, no throw.
- Duplicate id (same id, two different files, sequential) → `enqueueInject`
  called exactly once; both files still get deleted.
- `*.json.tmp.<pid>` file → never read, never touched, no callback fires.
- Quarantine rename that throws `EPERM` once then succeeds → retried
  automatically, ends up quarantined correctly (`renameCalls >= 2`).

`bun run typecheck` (repo-wide `tsc --noEmit`) → **exit 0**.

`git status` confirms the only changes are the five files listed above plus
the `shared/src/index.ts` one-line export addition; `packages/pty-holder/**`
and `packages/cc-stub/hooks/**` are untouched by this task (their diffs in
the working tree come from the parallel P1/H4 tasks, pre-existing before
this task started). No `git add`/commit, no `bun install` was run.

## Concerns

- **Batch id has no natural identity from the payload itself** — kode acuan's
  `writeBatch` never puts an id on the array root or its items, so this shim
  uses the file's own name (a UUID minted by the writer) as the dedup/inject
  id. This is safe under normal operation (the writer always names the file
  with a fresh UUID) but means a batch resent under a *different* filename
  with identical content is NOT deduped — only true LOSS-3 (same file
  reappearing / re-swept before deletion completes) is covered for batches.
  Single command/prompt payloads dedupe on the real payload `id` and don't
  have this gap.
- **`type:"switch"` payloads currently quarantine** (not implemented this
  phase — that's S2/session-ops scope per the Fase-2 plan). If any live
  bot-lama sends a `/resume` switch payload into a pilot's pending dir before
  S2 lands, it will show up as a visible `.rejected-*` file + warning rather
  than silently failing — flagging so whoever wires S1/S2 knows to either
  extend `parseLegacyPending` or confirm no switch traffic is expected in
  the interim.
- Same-tick duplicate-id race (two files with an identical id discovered by
  the same sweep pass) is argued safe by code inspection (microtask
  ordering) but not covered by a dedicated test — the test suite exercises
  the more realistic sequential-resend case.
- `enqueueEnv`/`enqueueInject` are assumed synchronous per the injected
  contract (not `Promise`-returning); if a real S1/bus wiring makes either
  async, the current code doesn't `await` them, which would need revisiting
  when that wiring lands.

## Fix pass 1

**Reviewer feedback:** 4 fixes applied (1 major, 2 important, 1 minor) — only
touched the 4 target files, no behavior change elsewhere.

1. **(Major) ZodError on invalid UUID id (line 235-249):** `Envelope.parse()`
   can throw when id is a valid string but not a UUID (Envelope.id requires
   UUID). Wrapped with `try/catch` → quarantine + warning on failure (same
   path as corrupt payload). Test: `"bukan-uuid-123"` → `.rejected-*`.
2. **(Important) Command hop-count check (line 259-269):** command branch was
   missing hop-count validation. Added: if payload has `from` + `hop_count >
   MAX_HOP`, drop with info status (not inject). Mirrors prompt path & kode
   acuan's hop-guard. Test: command with `hop_count: 6` → dropped, not
   injected.
3. **(Important) Stop timer cancellation (SCAR-022):** `stop()` did not cancel
   pending deferred `setTimeout` calls, allowing enqueue ~500ms after stop.
   Added: track timer ids, set `stopped` flag, guard `processFile()` to return
   early if stopped, clear all timers in `stop()`. Test: stop then write new
   file → file remains unprocessed.
4. **(Minor) Docstring clarification:** expanded LOSS-3 section to clarify that
   id fallback to `fileStem` applies **only** to batch (no id field); prompt/
   command id is mandatory per schema.

Test count update: pending-consumer.test.ts was 8 tests (report incorrectly
said 7), now 11 (added 3 new tests). Total: 14 legacy-pending + 11
pending-consumer = **25 new tests from Task X2** (21 original + 4 from other
source files in the repo, 288 original total).

**Result:** `bun test packages/hostd packages/shared` → **291 pass, 0 fail** (+3 from fixes).
`bun run typecheck` → exit 0. No `git add`/commit. Ready for next pass.
