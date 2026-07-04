# Fase 0 — Skeleton `mirza-harness` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo `mirza-harness` boot-able — `hostd` kosong bisa jalan dan `/doctor` menjawab (definisi selesai Fase 0, design doc §9).

**Architecture:** Monorepo Bun workspaces dengan 5 package (`hostd`, `pty-holder`, `telegram-adapter`, `cc-stub`, `shared`). Fase 0 hanya mengisi `shared` (protokol IPC zod + draft skema SQLite) dan `hostd` (boot + named-pipe JSON-RPC server + `/doctor` stub); 3 package lain berupa skeleton kosong yang diisi fase 1–2. Spec = `mirza-marketplace/docs/2026-07-03-harness-rewrite-design.md` (§4, §7, §9).

**Tech Stack:** Bun 1.3.x + TypeScript (strict), zod, `bun:sqlite`, `node:net` (named pipe Windows), `bun test`.

## Global Constraints

- **TANPA Claude Agent SDK / `claude -p`** dalam bentuk apa pun (keputusan billing user, final).
- Repo baru: `C:\Users\Mirza\workspace\mirza-harness` — TERPISAH dari mirza-marketplace.
- `.gitattributes` berisi `* text=auto eol=lf` HARUS ada sejak commit pertama (INFRA-3).
- Nama pipe default: `\\.\pipe\mirza-hostd` (design doc §4.1); test memakai nama pipe unik per-run.
- Skema SQLite fase 0 = **draft** (skema final ditetapkan fase 1, design doc §4.4) — tabel: `bots`, `sessions`, `messages` (+FTS5), `bus_queue`, `bus_dead`, `goals`, `handoffs`, `channel_access`, `kv`.
- Zod di setiap boundary (prinsip §2.4); protokol IPC = JSON-RPC 2.0, framing NDJSON.
- Tiap commit pakai trailer `Agent: bot-03` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push segera setelah commit BILA remote sudah ada (SOP git multi-agent).
- CI minimal: `bun test` + `tsc --noEmit` (mencegah kelas bug LOSS-4).

## Peta dependensi (mandor-orkestrator, design doc §11.1)

```
Task 1 (scaffold)  ──┬──> Task 2 (shared: IPC zod)   ──> Task 4 (hostd boot + /doctor)
                     ├──> Task 3 (shared: skema SQLite)      │
                     └──> Task 5 (CI workflow)               └──> Task 6 (verifikasi E2E + remote)
```

Task 2, 3, 5 independen satu sama lain → boleh fan-out subagent paralel (file disjoint). Task 4 menunggu Task 2. Task 6 menunggu semua.

---

### Task 1: Scaffold monorepo

**Files:**
- Create: `C:\Users\Mirza\workspace\mirza-harness\.gitattributes`
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `README.md`
- Create: `packages/{hostd,pty-holder,telegram-adapter,cc-stub,shared}/package.json`
- Create: `packages/{hostd,pty-holder,telegram-adapter,cc-stub,shared}/src/index.ts`

**Interfaces:**
- Produces: workspace layout yang dipakai semua task lain; nama package `@mirza-harness/<pkg>`.

- [ ] **Step 1: git init + file root**

```bash
mkdir -p /c/Users/Mirza/workspace/mirza-harness && cd /c/Users/Mirza/workspace/mirza-harness && git init -b main
```

`.gitattributes` (WAJIB sebelum commit pertama):
```
* text=auto eol=lf
```

`.gitignore`:
```
node_modules/
*.db
*.db-wal
*.db-shm
dist/
```

`package.json` (root):
```json
{
  "name": "mirza-harness",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "typescript": "^5.6.0"
  }
}
```

`tsconfig.json` (root):
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"],
    "paths": { "@mirza-harness/*": ["./packages/*/src"] }
  },
  "include": ["packages/*/src", "packages/*/test"]
}
```

`README.md`:
```markdown
# mirza-harness

Substrat baru fleet bot Claude Code milik Mirza: daemon `hostd` (supervisor + bus + state SQLite + channel adapters), `pty-holder` tipis, dan plugin `cc-stub`.

- Design doc: `mirza-marketplace/docs/2026-07-03-harness-rewrite-design.md`
- Kontrak penerimaan: inventaris 529 item di `mirza-marketplace/docs/2026-07-02-capability-inventory/`
- Status: Fase 0 (skeleton). Sistem lama tetap produksi sampai migrasi selesai.
- Konstrain mutlak: TANPA Claude Agent SDK / `claude -p` — seluruh usage lewat TUI interaktif.

## Perintah
- `bun install`
- `bun test`
- `bun run typecheck`
- `bun run packages/hostd/src/main.ts` — jalankan daemon
- `bun run packages/hostd/src/cli.ts doctor` — tanya kesehatan daemon
```

- [ ] **Step 2: package skeleton × 5**

Untuk tiap `<pkg>` di {hostd, pty-holder, telegram-adapter, cc-stub, shared}, buat `packages/<pkg>/package.json`:
```json
{
  "name": "@mirza-harness/<pkg>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```
Khusus `hostd`, tambahkan dependencies:
```json
  "dependencies": {
    "@mirza-harness/shared": "workspace:*",
    "zod": "^3.23.0"
  }
```
Khusus `shared`, tambahkan `"dependencies": { "zod": "^3.23.0" }`.

`packages/<pkg>/src/index.ts` untuk pty-holder, telegram-adapter, cc-stub (diisi fase 1–2):
```ts
// @mirza-harness/<pkg> — skeleton; diisi pada fase berikutnya (design doc §9).
export const PKG = "<pkg>";
```
(`shared` dan `hostd` diisi Task 2–4; sementara isi placeholder yang sama.)

- [ ] **Step 3: bun install + verifikasi workspace**

Run: `bun install && bun run typecheck`
Expected: install sukses, typecheck exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: scaffold monorepo mirza-harness (fase 0)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

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

### Task 3: `shared` — draft skema SQLite

**Files:**
- Create: `packages/shared/src/schema.ts`
- Create: `packages/shared/test/schema.test.ts`
- Modify: `packages/shared/src/index.ts` (tambah `export * from "./schema";`)

**Interfaces:**
- Produces: `SCHEMA_SQL: string` (DDL idempotent, `IF NOT EXISTS`), `applySchema(db: Database): void` (import type `Database` dari `bun:sqlite`).

- [ ] **Step 1: Tulis failing test**

`packages/shared/test/schema.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applySchema } from "../src/schema";

const EXPECTED_TABLES = [
  "bots", "sessions", "messages", "bus_queue", "bus_dead",
  "goals", "handoffs", "channel_access", "kv",
];

describe("skema sqlite (draft fase 0)", () => {
  test("semua tabel inti tercipta dan idempotent", () => {
    const db = new Database(":memory:");
    applySchema(db);
    applySchema(db); // idempotent — tak boleh throw
    const rows = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = rows.map(r => r.name);
    for (const t of EXPECTED_TABLES) expect(names).toContain(t);
  });

  test("FTS5 messages_fts tersedia", () => {
    const db = new Database(":memory:");
    applySchema(db);
    db.run("INSERT INTO messages (bot_id, channel, chat_id, direction, ts, body) VALUES ('bot-03','telegram','1','in',0,'halo dunia')");
    db.run("INSERT INTO messages_fts(rowid, body) SELECT id, body FROM messages");
    const hit = db.query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'halo'").all();
    expect(hit.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `bun test packages/shared/test/schema.test.ts`
Expected: FAIL — `Cannot find module "../src/schema"`.

- [ ] **Step 3: Implementasi**

`packages/shared/src/schema.ts`:
```ts
import type { Database } from "bun:sqlite";

/**
 * DRAFT skema fase 0 — skema FINAL ditetapkan di fase 1 (design doc §4.4).
 * Sengaja minim kolom; jangan tambah kolom "sekalian" tanpa kebutuhan fase berjalan (YAGNI).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,                -- 'bot-01'..'bot-06'
  workspace TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',  -- offline|starting|online|degraded
  last_heartbeat_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                -- session_id dari hook SessionStart
  bot_id TEXT NOT NULL REFERENCES bots(id),
  name TEXT NOT NULL DEFAULT 'idle',
  lifecycle TEXT NOT NULL DEFAULT 'idle',  -- idle|busy|resetting|dead
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT NOT NULL,
  channel TEXT NOT NULL,              -- 'telegram' (nanti: wa/discord/web)
  chat_id TEXT NOT NULL,
  message_id TEXT,
  direction TEXT NOT NULL,            -- in|out
  source TEXT,                        -- user|assistant|system
  ts INTEGER NOT NULL,
  body TEXT NOT NULL,
  meta TEXT                           -- JSON string (album, buttons, quote, ...)
);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
  USING fts5(body, content='messages', content_rowid='id');

CREATE TABLE IF NOT EXISTS bus_queue (
  id TEXT PRIMARY KEY,                -- envelope id (idempotency key)
  ts INTEGER NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,              -- JSON string
  hop INTEGER NOT NULL DEFAULT 0,
  reply_to TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  acked_at INTEGER
);

CREATE TABLE IF NOT EXISTS bus_dead (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  envelope TEXT NOT NULL,             -- JSON envelope utuh
  reason TEXT NOT NULL,
  dead_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  spec TEXT NOT NULL,                 -- JSON
  status TEXT NOT NULL DEFAULT 'active',   -- active|done|abandoned
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  from_bot TEXT NOT NULL,
  to_bot TEXT NOT NULL,
  file_path TEXT,
  designation TEXT,                   -- now|after-this-task|ping-pong|file-only
  pair TEXT,                          -- partner ping-pong, bila ada
  status TEXT NOT NULL DEFAULT 'sent',     -- sent|acked|done
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS channel_access (
  channel TEXT NOT NULL,              -- 'telegram'
  bot_id TEXT NOT NULL,
  policy TEXT NOT NULL,               -- JSON (port access.json: dmPolicy, allowFrom, groups, pending)
  PRIMARY KEY (channel, bot_id)
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}
```

Tambahkan di `packages/shared/src/index.ts`: `export * from "./schema";`

- [ ] **Step 4: Run test → PASS**

Run: `bun test packages/shared/test/schema.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared && git commit -m "feat(shared): draft skema SQLite fase 0 (9 tabel inti + FTS5)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

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

### Task 5: CI minimal

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: script `test` + `typecheck` dari root package.json (Task 1).

- [ ] **Step 1: Tulis workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: windows-latest   # named pipe & ConPTY = target produksi; jangan ganti ubuntu
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun test
```

- [ ] **Step 2: Validasi lokal setara CI**

Run: `bun install --frozen-lockfile && bun run typecheck && bun test`
Expected: semua exit 0. (Workflow-nya sendiri baru jalan setelah repo GitHub ada.)

- [ ] **Step 3: Commit**

```bash
git add .github && git commit -m "ci: bun test + tsc --noEmit (windows runner)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi end-to-end + remote

**Files:** — (tidak ada file baru; eksekusi + verifikasi)

**Interfaces:**
- Consumes: `main.ts`/`cli.ts` (Task 4), seluruh test suite.

- [ ] **Step 1: Suite penuh dari root**

Run: `bun install && bun run typecheck && bun test`
Expected: exit 0, ≥8 test pass, 0 fail.

- [ ] **Step 2: Boot hostd sungguhan (bukan test)**

Run (background): `bun run packages/hostd/src/main.ts`
Expected: log `[hostd] v0.0.1 siap — pipe: \\.\pipe\mirza-hostd`.

- [ ] **Step 3: `/doctor` menjawab**

Run: `bun run packages/hostd/src/cli.ts doctor`
Expected: JSON dengan `"ok": true` dan 4 komponen `stub`. Ini = definisi selesai Fase 0 (§9). Matikan hostd setelahnya.

- [ ] **Step 4: Remote GitHub (sesuai keputusan user di konfirmasi)**

Bila user setuju repo GitHub: user membuat repo kosong `mirza-harness` (private) → `git remote add origin <url> && git push -u origin main`. Bila belum: tandai TODO, push menyusul; disiplin push-segera (SOP) berlaku sejak remote ada.

- [ ] **Step 5: Lapor user via Telegram**

Ringkas: fase 0 selesai per definisi §9, link/artefak, next = fase 1 (butuh token bot uji ke-7 — minta di awal fase 1).

---

## Self-Review (sudah dijalankan)

- **Spec coverage §9 fase 0:** repo ✅(T1) skeleton ✅(T1) `.gitattributes` ✅(T1) CI ✅(T5) skema SQLite ✅(T3) protokol IPC zod ✅(T2) hostd boot + `/doctor` jawab ✅(T4, T6).
- **Placeholder scan:** tidak ada TBD/TODO tersisa selain TODO push-remote yang memang keputusan user.
- **Type consistency:** `parseRpcMessage`/`PIPE_NAME_DEFAULT`/`RpcRequest` (T2) dipakai T4 dengan nama sama; `applySchema` (T3) belum dipakai hostd — disengaja, state connect di fase 1.
