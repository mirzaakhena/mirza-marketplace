# Task 2 Report — `shared` — protokol IPC JSON-RPC (zod)

## Summary
Task 2 berhasil diselesaikan dengan TDD flow lengkap. Implementasi protokol IPC JSON-RPC dengan zod schemas sesuai design doc Brief.

---

## TDD Flow & Evidence

### Step 1: Tulis Failing Test ✓
File: `packages/shared/test/ipc.test.ts`
- 3 test cases sesuai brief:
  1. `request valid lolos parse` — RpcRequest dengan id valid
  2. `event (tanpa id) terbedakan dari request` — RpcEvent (no id) vs RpcRequest (has id)
  3. `payload tak dikenal ditolak, bukan ditelan` — Invalid JSON dan schema rejected with throw

### Step 2: Run Test → FAIL (Expected) ✓
**Command:** `bun test packages/shared`
**Output:**
```
error: Cannot find module '../src/ipc' from 'packages/shared/test/ipc.test.ts'

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file.
```
✓ Failed dengan alasan yang benar (module tidak ada).

### Step 3: Implementasi ✓

#### 3a. Buat `packages/shared/src/ipc.ts`
Implementasi lengkap meliputi:
- **Export constant:** `PIPE_NAME_DEFAULT = "\\\\.\\pipe\\mirza-hostd"`
- **Zod schemas:**
  - `RpcId` — union[string, number]
  - `RpcRequest` — {jsonrpc, id, method, params?}
  - `RpcSuccess` — {jsonrpc, id, result}
  - `RpcFailure` — {jsonrpc, id, error: {code, message, data?}}
  - `RpcResponse` — union[RpcSuccess, RpcFailure]
  - `RpcEvent` — {jsonrpc, method, params?} (tanpa id)
  - `RpcMessage` — union[RpcRequest, RpcSuccess, RpcFailure, RpcEvent]
- **Type inferences:** RpcRequestT, RpcResponseT, RpcEventT, RpcMessageT
- **Function:** `parseRpcMessage(line: string): RpcMessageT`
  - Parse baris NDJSON (JSON.parse + RpcMessage.parse)
  - Throw ZodError/SyntaxError jika invalid

#### 3b. Modify `packages/shared/src/index.ts`
```ts
export * from "./ipc";
```
Mengganti placeholder `export const PKG = "shared";`

### Step 4: Run Test → PASS (All 3) ✓
**Command:** `bun test packages/shared`
**Output:**
```
bun test v1.3.11

 3 pass
 0 fail
 5 expect() calls
Ran 3 tests across 1 file. [104.00ms]
```

### Step 5: Typecheck ✓
**Command:** `bun run typecheck` (dari root)
**Output:**
```
$ tsc --noEmit
```
✓ Exit 0 — no TypeScript errors.

### Step 6: Commit ✓
**Command:** `git add packages/shared && git commit -m "..."`

**Commit message (sesuai spec):**
```
feat(shared): protokol IPC JSON-RPC + skema zod

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

**Commit hash:** `a29c715`

**Files changed:**
- `packages/shared/src/ipc.ts` (NEW) — 48 lines
- `packages/shared/test/ipc.test.ts` (NEW) — 22 lines
- `packages/shared/src/index.ts` (MODIFIED) — re-export only

### Step 7: Push ✓
**Command:** `git push`
**Output:**
```
To https://github.com/mirzaakhena/mirza-harness.git
   7837e10..a29c715  main -> main
```
✓ Pushed ke origin/main.

---

## Self-Review

✓ **TDD discipline:** Test written first, failed as expected, implementation added, test passed.  
✓ **Brief compliance:** Kode 100% sesuai brief (verbatim schemas + exports).  
✓ **Zod schemas:** Semua schemas strict mode, type inference included.  
✓ **Parseability:** `parseRpcMessage` correctly throws on invalid JSON/schema.  
✓ **No scope creep:** Hanya touch packages/shared, zod sudah ada di deps, tidak buat package lain.  
✓ **Commit trailer:** Message diakhiri dengan `Agent: bot-03` dan `Co-Authored-By` trailer.  
✓ **Push discipline:** Langsung push setelah commit (origin/main).  

---

## Artifacts

- **Commit:** a29c715
- **Test status:** 3/3 pass (request valid, event vs request distinction, invalid rejection)
- **Typecheck:** ✓ exit 0
- **Remote:** ✓ pushed to origin/main
- **Concerns:** None

---

Task 2 COMPLETE.

---

## Fix pass 1 — Test coverage gaps (code-review findings)

### Summary
Fixed 2 test coverage gaps in `packages/shared/test/ipc.test.ts` per code-review findings. No source code changes (ipc.ts unchanged).

### Tests Added

**1. Literal constant assertion (Important)**
```ts
test("PIPE_NAME_DEFAULT konstanta bernilai literal backslash escape", () => {
  expect(PIPE_NAME_DEFAULT).toBe("\\\\.\\pipe\\mirza-hostd");
});
```
Regression protection: ensures escaped backslash runtime value is preserved (\\.\pipe\mirza-hostd).

**2. RpcResponse valid parsing + extraneous key rejection (Minor)**
```ts
test("RpcSuccess dan RpcFailure parse dengan benar, extra key ditolak", () => {
  // Valid success response
  const successMsg = parseRpcMessage('{"jsonrpc":"2.0","id":1,"result":{}}');
  expect(RpcResponse.safeParse(successMsg).success).toBe(true);

  // Valid error response
  const errorMsg = parseRpcMessage('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"x"}}');
  expect(RpcResponse.safeParse(errorMsg).success).toBe(true);

  // Response dengan extra key ditolak
  expect(() => parseRpcMessage('{"jsonrpc":"2.0","id":1,"result":{},"extra":1}')).toThrow();
});
```

### Test Execution

**Command:** `bun test packages/shared`  
**Result:** 5/5 PASS (3 original + 2 new)
```
 5 pass
 0 fail
 9 expect() calls
Ran 5 tests across 1 file. [39.00ms]
```

### Typecheck

**Command:** `bun run typecheck` (from root)  
**Result:** Exit 0 (no errors)
```
$ tsc --noEmit
```

### Commit

**Command:** `git add packages/shared/test/ipc.test.ts && git commit -m "..."`

**Commit message:**
```
test(shared): add coverage for PIPE_NAME_DEFAULT literal and RpcResponse parsing

- Assert PIPE_NAME_DEFAULT escape backslash regression: \\.\pipe\mirza-hostd
- Test RpcSuccess and RpcFailure valid parsing via RpcResponse
- Verify extraneous keys are rejected by .strict() validation

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

**Commit hash:** `71245ef`

### Push

**Command:** `git push`  
**Result:** ✓ Pushed to origin/main
```
To https://github.com/mirzaakhena/mirza-harness.git
   a29c715..71245ef  main -> main
```

### Files Changed
- `packages/shared/test/ipc.test.ts` (MODIFIED) — 18 lines added

### Validation
✓ All 5 tests pass  
✓ Typecheck exit 0  
✓ Commit with correct trailers  
✓ Pushed to origin/main  

Fix pass 1 COMPLETE.
