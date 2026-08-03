# Task 4 Report — `hostd`: boot + named-pipe JSON-RPC + `/doctor` stub

## Status: DONE

Repo: `C:\Users\Mirza\workspace\mirza-harness` (Bun workspaces monorepo, Windows)
Commit: `9781f57`
Push: `8f95ac5..9781f57  main -> main` (success)

## Files changed

- Create: `packages/hostd/src/doctor.ts`
- Create: `packages/hostd/src/server.ts`
- Create: `packages/hostd/src/main.ts`
- Create: `packages/hostd/src/cli.ts`
- Create: `packages/hostd/test/doctor.test.ts`
- Create: `packages/hostd/test/server.test.ts`
- Modify: `packages/hostd/src/index.ts` (placeholder `export const PKG = "hostd"` → re-export `./doctor` + `./server`)

All code taken verbatim from the brief (`C:/Users/Mirza/workspace/mirza-marketplace/.superpowers/sdd/task-4-brief.md`). No source deviations.

## TDD trail (fail → pass), per brief step order

**Step 1–3: doctor**
1. Wrote `packages/hostd/test/doctor.test.ts` verbatim.
2. `bun test packages/hostd/test/doctor.test.ts` → **FAIL**:
   ```
   error: Cannot find module '../src/doctor' from '...\test\doctor.test.ts'
   0 pass / 1 fail / 1 error
   ```
3. Implemented `packages/hostd/src/doctor.ts` verbatim (`HOSTD_VERSION`, `DoctorReport`, `doctorReport()`).
4. Re-ran → **PASS**: `1 pass / 0 fail / 6 expect() calls`.

**Step 4–5: server**
1. Wrote `packages/hostd/test/server.test.ts` verbatim (round-trip via named pipe, unknown-method -32601, invalid-payload ≤-32600).
2. `bun test packages/hostd/test/server.test.ts` → **FAIL**:
   ```
   error: Cannot find module '../src/server' from '...\test\server.test.ts'
   0 pass / 1 fail / 1 error
   ```
3. Implemented `packages/hostd/src/server.ts`, `packages/hostd/src/main.ts`, `packages/hostd/src/cli.ts` verbatim; updated `packages/hostd/src/index.ts` to re-export.
4. Re-ran → **PASS**: `3 pass / 0 fail / 5 expect() calls` — round-trip via Windows named pipe worked on the first try with `net.connect(pipeName: string)`; no test-code deviation was needed (see "Deviations" below for why this matters).

**Step 6: full hostd suite**
- `bun test packages/hostd` → `4 pass / 0 fail / 11 expect() calls` across 2 files.

**Full monorepo verification (from root)**
- `bun test` → `11 pass / 0 fail / 30 expect() calls` across 4 files (all packages: shared's `ipc.test.ts` (5) + `schema.test.ts` (2), hostd's `doctor.test.ts` (1) + `server.test.ts` (3)).
- `bun run typecheck` (`tsc --noEmit`) → exit 0, no output (clean).

**Manual E2E smoke test (beyond the brief's scope, done for extra confidence)**
- Started `bun run packages/hostd/src/main.ts` as a background process with the default pipe (`\\.\pipe\mirza-hostd`).
- Ran `bun run packages/hostd/src/cli.ts doctor` against it (via PowerShell, `MIRZA_HOSTD_PIPE` unset so it used `PIPE_NAME_DEFAULT`).
- Got back the expected doctor JSON:
  ```json
  {
    "ok": true,
    "version": "0.0.1",
    "pid": 23256,
    "uptime_s": 2,
    "db": "not-connected (menyusul fase 1)",
    "components": { "bus": "stub", "state": "stub", "adapters": "stub", "supervisors": "stub" }
  }
  ```
- Confirms `main.ts` boots, listens on the real default pipe name, and `cli.ts doctor` round-trips correctly end-to-end (not just under the test's per-run pipe name).

## Deviations

**None to the shipped code.** Contrary to the brief's contingency note (§3): named pipes work correctly under Bun on Windows via `node:net`'s `net.connect(pipeName)` / `server.listen(pipeName)` using the plain string form — no `{ path: pipeName }` object form was required, and the brief's test file (`server.test.ts`) was used **exactly as written, unmodified**. This was a live risk given Bun's not-always-complete Node API parity on Windows, but it did not materialize here — worth flagging for controller awareness in case later phases hit gaps in this surface (e.g. `server.listenerCount`, half-close semantics, etc.), but Task 4's scope is unaffected.

## Note on test count

The task instructions mentioned "10 test total" as the expected root-level count; the actual total is **11** (7 pre-existing in `@mirza-harness/shared` — 5 in `ipc.test.ts` + 2 in `schema.test.ts` — plus 4 new in `@mirza-harness/hostd` — 1 in `doctor.test.ts` + 3 in `server.test.ts`). All 11 pass. Flagging as an informational discrepancy against the stated number, not a blocker — no test was skipped, weakened, or removed to hit a number.

## Constraints check

- No Claude Agent SDK / `claude -p` used.
- Failures surface as RPC errors, not swallowed (`-32700` parse/schema error, `-32600` invalid request, `-32601` unknown method — all verified by test, matching `server.ts`'s `catch` block comment: "kegagalan harus terlihat — balas error, jangan telan").
- Only `packages/hostd` touched; no other package modified.
- Pipe constant (`PIPE_NAME_DEFAULT` in `@mirza-harness/shared`) untouched.
