### Task 2: `shared` — protokol IPC JSON-RPC (zod)

**Files:**
- Create: `packages/shared/src/ipc.ts`
- Create: `packages/shared/test/ipc.test.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Produces: `RpcRequest`, `RpcResponse` (union sukses/error), `RpcEvent`, `RpcMessage` (zod schemas + type infer), `parseRpcMessage(line: string): RpcMessage` (throw ZodError/SyntaxError bila invalid), `PIPE_NAME_DEFAULT = "\\\\.\\pipe\\mirza-hostd"`. Framing: NDJSON (satu JSON per baris).

- [ ] **Step 1: Tulis failing test**

`packages/shared/test/ipc.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { RpcRequest, RpcEvent, parseRpcMessage } from "../src/ipc";

describe("ipc schemas", () => {
  test("request valid lolos parse", () => {
    const msg = parseRpcMessage('{"jsonrpc":"2.0","id":1,"method":"doctor"}');
    expect(RpcRequest.safeParse(msg).success).toBe(true);
  });

  test("event (tanpa id) terbedakan dari request", () => {
    const msg = parseRpcMessage('{"jsonrpc":"2.0","method":"session.start","params":{"session_id":"abc"}}');
    expect(RpcEvent.safeParse(msg).success).toBe(true);
    expect(RpcRequest.safeParse(msg).success).toBe(false);
  });

  test("payload tak dikenal ditolak, bukan ditelan", () => {
    expect(() => parseRpcMessage('{"hello":"world"}')).toThrow();
    expect(() => parseRpcMessage("bukan json")).toThrow();
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `bun test packages/shared`
Expected: FAIL — `Cannot find module "../src/ipc"`.

- [ ] **Step 3: Implementasi**

`packages/shared/src/ipc.ts`:
```ts
import { z } from "zod";

export const PIPE_NAME_DEFAULT = "\\\\.\\pipe\\mirza-hostd";

export const RpcId = z.union([z.string(), z.number()]);

export const RpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: RpcId,
  method: z.string().min(1),
  params: z.unknown().optional(),
}).strict();

export const RpcSuccess = z.object({
  jsonrpc: z.literal("2.0"),
  id: RpcId,
  result: z.unknown(),
}).strict();

export const RpcFailure = z.object({
  jsonrpc: z.literal("2.0"),
  id: RpcId,
  error: z.object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  }).strict(),
}).strict();

export const RpcResponse = z.union([RpcSuccess, RpcFailure]);

// Notification/event: TANPA id (searah, tidak dijawab).
export const RpcEvent = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
}).strict();

export const RpcMessage = z.union([RpcRequest, RpcSuccess, RpcFailure, RpcEvent]);

export type RpcRequestT = z.infer<typeof RpcRequest>;
export type RpcResponseT = z.infer<typeof RpcResponse>;
export type RpcEventT = z.infer<typeof RpcEvent>;
export type RpcMessageT = z.infer<typeof RpcMessage>;

/** Parse satu baris NDJSON menjadi RpcMessage; throw bila bukan JSON atau tak cocok skema. */
export function parseRpcMessage(line: string): RpcMessageT {
  return RpcMessage.parse(JSON.parse(line));
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./ipc";
```

- [ ] **Step 4: Run test → PASS**

Run: `bun test packages/shared`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): protokol IPC JSON-RPC + skema zod

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

