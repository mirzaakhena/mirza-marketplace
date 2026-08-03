### Task 4: `hostd` — boot + named pipe + `/doctor` stub

**Files:**
- Create: `packages/hostd/src/doctor.ts`
- Create: `packages/hostd/src/server.ts`
- Create: `packages/hostd/src/main.ts`
- Create: `packages/hostd/src/cli.ts`
- Create: `packages/hostd/test/doctor.test.ts`
- Create: `packages/hostd/test/server.test.ts`
- Modify: `packages/hostd/src/index.ts` (re-export doctor + server)

**Interfaces:**
- Consumes: `RpcRequest`, `RpcFailure`, `parseRpcMessage`, `PIPE_NAME_DEFAULT` dari `@mirza-harness/shared` (Task 2).
- Produces: `doctorReport(): DoctorReport` — `{ ok: boolean; version: string; pid: number; uptime_s: number; db: string; components: Record<string, string> }`; `startServer(pipeName: string): Promise<net.Server>`; CLI `bun run packages/hostd/src/cli.ts doctor`.

- [ ] **Step 1: Failing test doctor**

`packages/hostd/test/doctor.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { doctorReport } from "../src/doctor";

describe("doctorReport (stub fase 0)", () => {
  test("bentuk payload lengkap", () => {
    const r = doctorReport();
    expect(r.ok).toBe(true);
    expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.pid).toBe(process.pid);
    expect(r.uptime_s).toBeGreaterThanOrEqual(0);
    expect(r.db).toContain("fase 1");
    expect(Object.keys(r.components)).toEqual(["bus", "state", "adapters", "supervisors"]);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`bun test packages/hostd/test/doctor.test.ts` → Cannot find module)

- [ ] **Step 3: Implementasi doctor**

`packages/hostd/src/doctor.ts`:
```ts
export const HOSTD_VERSION = "0.0.1";

export interface DoctorReport {
  ok: boolean;
  version: string;
  pid: number;
  uptime_s: number;
  db: string;
  components: Record<string, string>;
}

export function doctorReport(): DoctorReport {
  return {
    ok: true,
    version: HOSTD_VERSION,
    pid: process.pid,
    uptime_s: Math.floor(process.uptime()),
    db: "not-connected (menyusul fase 1)",
    components: { bus: "stub", state: "stub", adapters: "stub", supervisors: "stub" },
  };
}
```

Run test → PASS.

- [ ] **Step 4: Failing test server (roundtrip via named pipe)**

`packages/hostd/test/server.test.ts`:
```ts
import { afterAll, describe, expect, test } from "bun:test";
import net from "node:net";
import { startServer } from "../src/server";

const TEST_PIPE = `\\\\.\\pipe\\mirza-hostd-test-${process.pid}`;

function rpcCall(pipe: string, payload: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(pipe, () => sock.write(JSON.stringify(payload) + "\n"));
    let buf = "";
    sock.on("data", d => {
      buf += d.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) { sock.end(); resolve(JSON.parse(buf.slice(0, nl))); }
    });
    sock.on("error", reject);
    setTimeout(() => reject(new Error("timeout")), 5000);
  });
}

describe("hostd server", () => {
  let server: net.Server;
  afterAll(() => server?.close());

  test("doctor dijawab lewat pipe", async () => {
    server = await startServer(TEST_PIPE);
    const res = await rpcCall(TEST_PIPE, { jsonrpc: "2.0", id: 1, method: "doctor" });
    expect(res.id).toBe(1);
    expect(res.result.ok).toBe(true);
    expect(res.result.components.bus).toBe("stub");
  });

  test("method tak dikenal → error -32601 (bukan ditelan)", async () => {
    const res = await rpcCall(TEST_PIPE, { jsonrpc: "2.0", id: 2, method: "belum_ada" });
    expect(res.error.code).toBe(-32601);
  });

  test("payload invalid → error -32700/-32600 (bukan crash)", async () => {
    const res = await rpcCall(TEST_PIPE, { hello: "dunia" });
    expect(res.error.code).toBeLessThanOrEqual(-32600);
  });
});
```

Run: `bun test packages/hostd/test/server.test.ts` → FAIL (Cannot find module "../src/server").

- [ ] **Step 5: Implementasi server + main + cli**

`packages/hostd/src/server.ts`:
```ts
import net from "node:net";
import { RpcRequest, parseRpcMessage } from "@mirza-harness/shared";
import { doctorReport } from "./doctor";

type Handler = (params: unknown) => unknown;

const handlers: Record<string, Handler> = {
  doctor: () => doctorReport(),
};

function respond(sock: net.Socket, obj: object): void {
  sock.write(JSON.stringify(obj) + "\n");
}

function handleLine(sock: net.Socket, line: string): void {
  let id: string | number | null = null;
  try {
    const msg = parseRpcMessage(line);
    const req = RpcRequest.safeParse(msg);
    if (!req.success) {
      respond(sock, { jsonrpc: "2.0", id, error: { code: -32600, message: "bukan request" } });
      return;
    }
    id = req.data.id;
    const handler = handlers[req.data.method];
    if (!handler) {
      respond(sock, { jsonrpc: "2.0", id, error: { code: -32601, message: `method tak dikenal: ${req.data.method}` } });
      return;
    }
    respond(sock, { jsonrpc: "2.0", id, result: handler(req.data.params) });
  } catch (e) {
    // Prinsip §2.5: kegagalan harus terlihat — balas error, jangan telan.
    respond(sock, { jsonrpc: "2.0", id, error: { code: -32700, message: String(e) } });
  }
}

export function startServer(pipeName: string): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(sock => {
      let buf = "";
      sock.on("data", d => {
        buf += d.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleLine(sock, line);
        }
      });
      sock.on("error", err => console.error(`[hostd] socket error: ${err.message}`));
    });
    server.on("error", reject);
    server.listen(pipeName, () => resolve(server));
  });
}
```

`packages/hostd/src/main.ts`:
```ts
import { PIPE_NAME_DEFAULT } from "@mirza-harness/shared";
import { HOSTD_VERSION } from "./doctor";
import { startServer } from "./server";

const pipe = process.env.MIRZA_HOSTD_PIPE ?? PIPE_NAME_DEFAULT;
const server = await startServer(pipe);
console.log(`[hostd] v${HOSTD_VERSION} siap — pipe: ${pipe} (pid ${process.pid})`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[hostd] ${sig} — shutdown rapi`);
    server.close(() => process.exit(0));
  });
}
```

`packages/hostd/src/cli.ts`:
```ts
import net from "node:net";
import { PIPE_NAME_DEFAULT } from "@mirza-harness/shared";

const [cmd] = process.argv.slice(2);
if (cmd !== "doctor") {
  console.error("pakai: cli.ts doctor");
  process.exit(2);
}

const pipe = process.env.MIRZA_HOSTD_PIPE ?? PIPE_NAME_DEFAULT;
const sock = net.connect(pipe, () => {
  sock.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "doctor" }) + "\n");
});
let buf = "";
sock.on("data", d => {
  buf += d.toString("utf8");
  const nl = buf.indexOf("\n");
  if (nl >= 0) {
    console.log(JSON.stringify(JSON.parse(buf.slice(0, nl)).result, null, 2));
    sock.end();
  }
});
sock.on("error", err => {
  console.error(`hostd tidak terjangkau di ${pipe}: ${err.message}`);
  process.exit(1);
});
```

`packages/hostd/src/index.ts`:
```ts
export * from "./doctor";
export * from "./server";
```

- [ ] **Step 6: Run semua test hostd → PASS** (`bun test packages/hostd`)

- [ ] **Step 7: Commit**

```bash
git add packages/hostd && git commit -m "feat(hostd): boot + named-pipe JSON-RPC + doctor stub

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

