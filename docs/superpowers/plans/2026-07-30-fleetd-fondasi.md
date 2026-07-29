# fleetd Tahap 1 (Fondasi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an empty `fleetd` — the background daemon at the center of the `mirza-bots` fleet harness — with its two SQLite databases, config loading, a Unix socket, and a `doctor` status check, so later stages (Telegram polling, PTY injection, handoff) have solid ground to build on.

**Architecture:** A single Bun process (`fleetd`) that on startup ensures its state directory exists, loads and validates `config.json`, opens `fleet.db` (operational state) and `conversations.db` (message history + FTS5), then listens on a Unix domain socket for newline-delimited JSON requests. The only request type in this stage is `doctor`, which reports bot count, table presence, and DB readiness. A small CLI script (`bin/fleetd-doctor.ts`) acts as a client for manual/scripted checks — this is the "live test" harness for this stage since no hook/MCP consumer exists yet.

**Tech Stack:** Bun 1.3.11+ (native `bun:sqlite` with FTS5, native TypeScript, `bun:test`), `zod` v4 for validation, Node's `net` module (available under Bun) for the Unix socket. No `tsconfig.json` and no build step — this matches the existing `plugins/telegram` convention in `mirza-marketplace` (plain `package.json`, Bun runs `.ts` directly).

## Global Constraints

- No Claude Agent SDK / `claude -p` anywhere in the fleet harness — billing constraint from spec K-9. Not directly exercised in this stage, but no task here may introduce it.
- All persistent state lives under `~/.claude/mirza-bots/` (spec K-1). Every path in this stage goes through a single `stateRoot()` function so it can be overridden for tests via `MIRZA_BOTS_HOME` — never hardcode the real path in test code.
- `fleetd` is the single point of validation — strict `zod` parsing at every boundary (spec §5.2). `config.json` must be rejected (not silently coerced) on any schema mismatch.
- Two separate databases, not one: `fleet.db` (small, disposable, safe to delete and rebuild) and `conversations.db` (large, never deleted per K-8). Do not merge their schemas or share a connection.
- Socket protocol follows the connect→send→answer pattern from spec §5.1 (this stage only implements the short-lived "hook-style" pattern; the long-lived MCP/`mirza-cc` pattern comes in later stages). Requests and responses are single-line JSON terminated by `\n`.
- Code, comments, identifiers: English (spec K-16). This stage has no user-facing or machine-to-user messages yet, so the Indonesian-copy rule doesn't apply here — keep it in mind for later stages that do.
- macOS-focused; no `if (platform === 'windows')` branches anywhere in this stage (spec §3.3).
- Repo root: `/Users/mirza/Workspace/mirza-bots/` (local git repo, `main` branch, no remote yet — created 2026-07-30). All file paths below are relative to `fleetd/` inside that repo unless stated otherwise.

---

### Task 1: Project scaffolding + state paths

**Files:**
- Create: `fleetd/package.json`
- Create: `mirza-bots/.gitignore` (repo root, one level above `fleetd/`)
- Create: `fleetd/src/paths.ts`
- Test: `fleetd/test/paths.test.ts`

**Interfaces:**
- Produces: `stateRoot(): string`, `configPath(): string`, `fleetDbPath(): string`, `conversationsDbPath(): string`, `inboxDir(bot: string): string`, `logsDir(): string`, `socketPath(): string`, `ensureStateDirs(): void` — all later tasks resolve paths exclusively through these functions.

- [ ] **Step 1: Create the repo-root `.gitignore`**

```gitignore
# Dependencies
node_modules/

# Local SQLite artifacts if ever created inside the repo during manual testing
*.db
*.db-shm
*.db-wal
*.sock

# Logs
*.log

# OS
.DS_Store
```

- [ ] **Step 2: Create `fleetd/package.json`**

```json
{
  "name": "fleetd",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/main.ts",
    "doctor": "bun run bin/fleetd-doctor.ts"
  },
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

Run `bun install` inside `fleetd/` after creating this file.

- [ ] **Step 3: Write the failing test**

```typescript
// fleetd/test/paths.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stateRoot, ensureStateDirs, logsDir } from "../src/paths";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mirza-bots-paths-"));
  process.env.MIRZA_BOTS_HOME = tmp;
});

afterEach(() => {
  delete process.env.MIRZA_BOTS_HOME;
  rmSync(tmp, { recursive: true, force: true });
});

describe("paths", () => {
  test("stateRoot honors MIRZA_BOTS_HOME override", () => {
    expect(stateRoot()).toBe(tmp);
  });

  test("ensureStateDirs creates root, inbox, and logs dirs", () => {
    ensureStateDirs();
    expect(existsSync(tmp)).toBe(true);
    expect(existsSync(join(tmp, "inbox"))).toBe(true);
    expect(existsSync(logsDir())).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd fleetd && bun test test/paths.test.ts`
Expected: FAIL — `../src/paths` does not exist yet.

- [ ] **Step 5: Write the implementation**

```typescript
// fleetd/src/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

export function stateRoot(): string {
  return process.env.MIRZA_BOTS_HOME ?? join(homedir(), ".claude", "mirza-bots");
}

export function configPath(): string {
  return join(stateRoot(), "config.json");
}

export function fleetDbPath(): string {
  return join(stateRoot(), "fleet.db");
}

export function conversationsDbPath(): string {
  return join(stateRoot(), "conversations.db");
}

export function inboxDir(bot: string): string {
  return join(stateRoot(), "inbox", bot);
}

export function logsDir(): string {
  return join(stateRoot(), "logs");
}

export function socketPath(): string {
  return join(stateRoot(), "fleetd.sock");
}

export function ensureStateDirs(): void {
  const root = stateRoot();
  for (const dir of [root, join(root, "inbox"), logsDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd fleetd && bun test test/paths.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 7: Commit**

```bash
cd mirza-bots
git add .gitignore fleetd/package.json fleetd/src/paths.ts fleetd/test/paths.test.ts fleetd/bun.lock
git commit -m "feat(fleetd): scaffold project and centralize state paths"
```

---

### Task 2: Config loader (`config.json` → validated `Config`)

**Files:**
- Create: `fleetd/src/config.ts`
- Test: `fleetd/test/config.test.ts`

**Interfaces:**
- Consumes: `configPath(): string` from Task 1 (`../src/paths`) as the default load path.
- Produces: `ConfigSchema` (zod schema), `type Config`, `class ConfigError extends Error`, `loadConfig(path?: string): Config`, `botCount(config: Config): number` — Task 6 (doctor) and Task 7 (main) both call `loadConfig` and read `config.bots`.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, botCount, ConfigError } from "../src/config";

let tmp: string;
let cfgPath: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mirza-bots-config-"));
  cfgPath = join(tmp, "config.json");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("config", () => {
  test("loads a valid config and counts bots", () => {
    writeFileSync(
      cfgPath,
      JSON.stringify({
        allowFrom: ["123456"],
        bots: {
          "bot-01": { home: "/Users/mirza/Workspace/bot-01", token: "abc:def" },
          "bot-02": { home: "/Users/mirza/Workspace/bot-02", token: "ghi:jkl" },
        },
      })
    );
    const config = loadConfig(cfgPath);
    expect(botCount(config)).toBe(2);
    expect(config.allowFrom).toEqual(["123456"]);
  });

  test("rejects a bot entry missing the token field", () => {
    writeFileSync(
      cfgPath,
      JSON.stringify({ allowFrom: ["1"], bots: { "bot-01": { home: "/x" } } })
    );
    expect(() => loadConfig(cfgPath)).toThrow(ConfigError);
  });

  test("rejects malformed JSON", () => {
    writeFileSync(cfgPath, "{ not json");
    expect(() => loadConfig(cfgPath)).toThrow(ConfigError);
  });

  test("rejects a missing file", () => {
    expect(() => loadConfig(join(tmp, "does-not-exist.json"))).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/config.test.ts`
Expected: FAIL — `../src/config` does not exist yet.

- [ ] **Step 3: Add the `zod` dependency and write the implementation**

Run: `cd fleetd && bun add zod`

```typescript
// fleetd/src/config.ts
import { z } from "zod";
import { readFileSync } from "node:fs";
import { configPath } from "./paths";

export const BotConfigSchema = z.object({
  home: z.string().min(1),
  token: z.string().min(1),
});

export const ConfigSchema = z.object({
  allowFrom: z.array(z.string()),
  bots: z.record(z.string(), BotConfigSchema),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

export function loadConfig(path: string = configPath()): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(`Cannot read config at ${path}: ${(err as Error).message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Config at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  const result = ConfigSchema.safeParse(json);
  if (!result.success) {
    throw new ConfigError(`Config at ${path} failed validation: ${result.error.message}`);
  }
  return result.data;
}

export function botCount(config: Config): number {
  return Object.keys(config.bots).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/config.test.ts`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/config.ts fleetd/test/config.test.ts fleetd/package.json fleetd/bun.lock
git commit -m "feat(fleetd): load and strictly validate config.json"
```

---

### Task 3: `fleet.db` schema (operational state)

**Files:**
- Create: `fleetd/src/db/fleet-schema.ts`
- Test: `fleetd/test/fleet-schema.test.ts`

**Interfaces:**
- Produces: `FLEET_TABLES: readonly string[]` (the 5 table names), `openFleetDb(path: string): Database` (re-exports `bun:sqlite`'s `Database` type) — Task 6 (doctor) queries the tables this creates.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/fleet-schema.test.ts
import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFleetDb, FLEET_TABLES } from "../src/db/fleet-schema";

describe("fleet.db schema", () => {
  test("creates all expected tables", () => {
    const db = openFleetDb(":memory:");
    const rows = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    for (const table of FLEET_TABLES) {
      expect(names.has(table)).toBe(true);
    }
  });

  test("reopening the same on-disk database file does not throw and keeps its tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "mirza-bots-fleet-schema-"));
    const dbPath = join(dir, "fleet.db");

    const first = openFleetDb(dbPath);
    first.close();

    let second: ReturnType<typeof openFleetDb> | undefined;
    expect(() => {
      second = openFleetDb(dbPath);
    }).not.toThrow();

    const rows = second!
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = new Set(rows.map((r) => r.name));
    for (const table of FLEET_TABLES) {
      expect(names.has(table)).toBe(true);
    }
    second!.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/fleet-schema.test.ts`
Expected: FAIL — `../src/db/fleet-schema` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/db/fleet-schema.ts
import { Database } from "bun:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  source TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_bot TEXT NOT NULL,
  to_bot TEXT NOT NULL,
  slug TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'terkirim',
  mode TEXT NOT NULL DEFAULT 'handoff',
  deadline_at TEXT,
  paired_with INTEGER REFERENCES handoffs(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS injections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot TEXT NOT NULL,
  command_class TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'antre',
  attempt INTEGER NOT NULL DEFAULT 0,
  queued_at TEXT NOT NULL,
  written_at TEXT,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS bot_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  detail TEXT,
  bot TEXT,
  occurred_at TEXT NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT
);
`;

export const FLEET_TABLES = ["sessions", "handoffs", "injections", "bot_inbox", "incidents"] as const;

export function openFleetDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}
```

**Table notes (why these columns, so a later task doesn't have to re-derive it):**
- `sessions.status` is `'idle' | 'working'` — spec K-7: lifecycle is data, not a string baked into the session name.
- `handoffs.mode` is `'handoff' | 'delegasi'` (spec §8.C / K-18) and `paired_with` self-references for ping-pong pairing (spec §8.1).
- `injections.status` progresses `'antre' → 'tertulis' → 'selesai'` (spec §5.4), `command_class` is `'clear' | 'resume' | 'compact' | 'plugin_command'`.
- `incidents` backs the `doctor` alarm surface (spec §7, "every failure must be visible").

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/fleet-schema.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/db/fleet-schema.ts fleetd/test/fleet-schema.test.ts
git commit -m "feat(fleetd): create fleet.db operational schema"
```

---

### Task 4: `conversations.db` schema (message history + FTS5)

**Files:**
- Create: `fleetd/src/db/conversations-schema.ts`
- Test: `fleetd/test/conversations-schema.test.ts`

**Interfaces:**
- Produces: `openConversationsDb(path: string): Database`, `type NewMessage`, `insertMessage(db: Database, msg: NewMessage): number`, `searchMessages(db: Database, query: string): Array<{ id: number; text: string }>` — Task 6 (doctor) checks the `messages` table exists; later stages (tahap 2/6) call `insertMessage`/`searchMessages` directly.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/conversations-schema.test.ts
import { describe, test, expect } from "bun:test";
import { openConversationsDb, insertMessage, searchMessages } from "../src/db/conversations-schema";

describe("conversations.db schema", () => {
  test("inserted message is searchable via FTS5", () => {
    const db = openConversationsDb(":memory:");
    insertMessage(db, {
      ts: "2026-07-30T00:00:00Z",
      bot: "bot-01",
      chatId: "999",
      source: "user",
      text: "tolong cek status backup fleetd",
    });

    const hits = searchMessages(db, "backup");
    expect(hits.length).toBe(1);
    expect(hits[0]?.text).toContain("backup");
  });

  test("unrelated keyword returns no hits", () => {
    const db = openConversationsDb(":memory:");
    insertMessage(db, {
      ts: "2026-07-30T00:00:00Z",
      bot: "bot-01",
      chatId: "999",
      source: "user",
      text: "tolong cek status backup fleetd",
    });

    expect(searchMessages(db, "unicorn").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/conversations-schema.test.ts`
Expected: FAIL — `../src/db/conversations-schema` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/db/conversations-schema.ts
import { Database } from "bun:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  bot TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  source TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  text TEXT,
  attachments TEXT,
  reply_to TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages(bot);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(bot, chat_id);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  text, content='messages', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
END;
`;

export function openConversationsDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

export type NewMessage = {
  ts: string;
  bot: string;
  chatId: string;
  messageId?: string;
  source: string;
  userId?: string;
  userName?: string;
  text?: string;
  attachments?: string;
  replyTo?: string;
  metadata?: string;
};

export function insertMessage(db: Database, msg: NewMessage): number {
  const result = db
    .query(
      `INSERT INTO messages (ts, bot, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.ts,
      msg.bot,
      msg.chatId,
      msg.messageId ?? null,
      msg.source,
      msg.userId ?? null,
      msg.userName ?? null,
      msg.text ?? null,
      msg.attachments ?? null,
      msg.replyTo ?? null,
      msg.metadata ?? null
    );
  return Number(result.lastInsertRowid);
}

export function searchMessages(db: Database, query: string): Array<{ id: number; text: string }> {
  return db
    .query(
      `SELECT m.id, m.text FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH ?`
    )
    .all(query) as Array<{ id: number; text: string }>;
}
```

**Why triggers instead of application-level dual writes:** spec §6.3 requires FTS5 from day one because retrofitting an index later means reindexing the entire history. Triggers keep `messages_fts` in sync automatically regardless of which future code path inserts a row (poller in tahap 2, `peek_conversation` writes in tahap 6) — no call site can forget to update the index.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/conversations-schema.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/db/conversations-schema.ts fleetd/test/conversations-schema.test.ts
git commit -m "feat(fleetd): create conversations.db schema with FTS5 sync triggers"
```

---

### Task 5: Unix socket protocol + server

**Files:**
- Create: `fleetd/src/socket/protocol.ts`
- Create: `fleetd/src/socket/server.ts`
- Test: `fleetd/test/socket.test.ts`

**Interfaces:**
- Produces: `type Request` (discriminated union, currently just `DoctorRequest = { type: "doctor" }`), `type Response = { ok: true; report: DoctorReport } | { ok: false; error: string }`, `type DoctorReport`, `encode(msg: unknown): string`, `tryDecode(line: string): Request | null`, `type Handler = (req: Request) => Response`, `startSocketServer(sockPath: string, handle: Handler): net.Server`. Task 6 fills in `DoctorReport`'s shape; Task 7 wires a real `Handler` and calls `startSocketServer`.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/socket.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocketServer } from "../src/socket/server";
import { encode } from "../src/socket/protocol";
import type { Response } from "../src/socket/protocol";

let tmp: string;
let server: ReturnType<typeof startSocketServer> | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function sendRaw(sockPath: string, raw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => client.write(raw));
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const idx = buf.indexOf("\n");
      if (idx !== -1) {
        client.end();
        resolve(buf.slice(0, idx));
      }
    });
    client.on("error", reject);
  });
}

describe("socket server", () => {
  test("responds to a known request type", async () => {
    tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
    const sockPath = join(tmp, "fleetd.sock");
    server = startSocketServer(sockPath, () => ({
      ok: true,
      report: {
        botCount: 1,
        socketPath: sockPath,
        fleetTables: [],
        conversationsReady: true,
        version: "0.1.0",
      },
    }));

    const line = await sendRaw(sockPath, encode({ type: "doctor" }));
    const res = JSON.parse(line) as Response;
    expect(res.ok).toBe(true);
  });

  test("malformed JSON gets a bad_request response without crashing the server", async () => {
    tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
    const sockPath = join(tmp, "fleetd.sock");
    server = startSocketServer(sockPath, () => ({
      ok: true,
      report: {
        botCount: 1,
        socketPath: sockPath,
        fleetTables: [],
        conversationsReady: true,
        version: "0.1.0",
      },
    }));

    const badLine = await sendRaw(sockPath, "{ not json\n");
    expect(JSON.parse(badLine)).toEqual({ ok: false, error: "bad_request" });

    // Server must still be alive for the next connection.
    const goodLine = await sendRaw(sockPath, encode({ type: "doctor" }));
    expect(JSON.parse(goodLine).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/socket.test.ts`
Expected: FAIL — `../src/socket/server` and `../src/socket/protocol` do not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/socket/protocol.ts
export type DoctorRequest = { type: "doctor" };
export type Request = DoctorRequest;

export type DoctorReport = {
  botCount: number;
  socketPath: string;
  fleetTables: string[];
  conversationsReady: boolean;
  version: string;
};

export type Response = { ok: true; report: DoctorReport } | { ok: false; error: string };

export function encode(msg: unknown): string {
  return JSON.stringify(msg) + "\n";
}

export function tryDecode(line: string): Request | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
      return parsed as Request;
    }
    return null;
  } catch {
    return null;
  }
}
```

```typescript
// fleetd/src/socket/server.ts
import net from "node:net";
import { unlinkSync, existsSync } from "node:fs";
import { encode, tryDecode, type Request, type Response } from "./protocol";

export type Handler = (req: Request) => Response;

export function startSocketServer(sockPath: string, handle: Handler): net.Server {
  if (existsSync(sockPath)) unlinkSync(sockPath);

  const server = net.createServer((conn) => {
    let buf = "";
    conn.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        const req = tryDecode(line);
        const res: Response = req ? handle(req) : { ok: false, error: "bad_request" };
        conn.write(encode(res));
      }
    });
    conn.on("error", () => {
      // Client disconnected mid-write; nothing to clean up per-connection.
    });
  });

  server.listen(sockPath);
  return server;
}
```

**Why this shape matters beyond this stage:** spec §5.1 needs the *same* socket to later serve a short-lived "hook" pattern (this one) and long-lived bidirectional MCP/`mirza-cc` connections. Keeping the connection handler per-`conn` (not global state) and framing on `\n` now means tahap 4/5 can add new `Request` variants to the union and long-lived push messages without renegotiating the wire format.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/socket.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/socket/protocol.ts fleetd/src/socket/server.ts fleetd/test/socket.test.ts
git commit -m "feat(fleetd): Unix socket server with newline-delimited JSON protocol"
```

---

### Task 6: `doctor` report builder

**Files:**
- Create: `fleetd/src/doctor.ts`
- Test: `fleetd/test/doctor.test.ts`

**Interfaces:**
- Consumes: `FLEET_TABLES` from Task 3 (`../src/db/fleet-schema`), `type Config` from Task 2 (`../src/config`), `type DoctorReport` from Task 5 (`../src/socket/protocol`), and the `Database` type from `bun:sqlite`.
- Produces: `buildDoctorReport(config: Config, fleetDb: Database, conversationsDb: Database, socketPath: string, version: string): DoctorReport` — Task 7 calls this from inside the socket request handler.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/doctor.test.ts
import { describe, test, expect } from "bun:test";
import { openFleetDb, FLEET_TABLES } from "../src/db/fleet-schema";
import { openConversationsDb } from "../src/db/conversations-schema";
import { buildDoctorReport } from "../src/doctor";
import type { Config } from "../src/config";

describe("doctor report", () => {
  test("reports bot count, fleet tables, and conversations readiness", () => {
    const config: Config = {
      allowFrom: ["1"],
      bots: {
        "bot-01": { home: "/tmp/bot-01", token: "a" },
        "bot-02": { home: "/tmp/bot-02", token: "b" },
      },
    };
    const fleetDb = openFleetDb(":memory:");
    const conversationsDb = openConversationsDb(":memory:");

    const report = buildDoctorReport(config, fleetDb, conversationsDb, "/tmp/fleetd.sock", "0.1.0");

    expect(report.botCount).toBe(2);
    expect(report.fleetTables.length).toBe(FLEET_TABLES.length);
    expect(report.conversationsReady).toBe(true);
    expect(report.socketPath).toBe("/tmp/fleetd.sock");
    expect(report.version).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/doctor.test.ts`
Expected: FAIL — `../src/doctor` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/doctor.ts
import type { Database } from "bun:sqlite";
import { FLEET_TABLES } from "./db/fleet-schema";
import type { Config } from "./config";
import type { DoctorReport } from "./socket/protocol";

export function buildDoctorReport(
  config: Config,
  fleetDb: Database,
  conversationsDb: Database,
  socketPath: string,
  version: string
): DoctorReport {
  const tableRows = fleetDb
    .query("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  const tableNames = new Set(tableRows.map((r) => r.name));
  const fleetTables = FLEET_TABLES.filter((t) => tableNames.has(t));

  const convTableRows = conversationsDb
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    .all();
  const conversationsReady = convTableRows.length === 1;

  return {
    botCount: Object.keys(config.bots).length,
    socketPath,
    fleetTables: [...fleetTables],
    conversationsReady,
    version,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/doctor.test.ts`
Expected: PASS — 1 test, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/doctor.ts fleetd/test/doctor.test.ts
git commit -m "feat(fleetd): doctor report builder"
```

---

### Task 7: Entrypoint, doctor CLI client, and live end-to-end test

**Files:**
- Create: `fleetd/src/main.ts`
- Create: `fleetd/bin/fleetd-doctor.ts`
- Test: `fleetd/test/e2e.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6 (`ensureStateDirs`, `configPath`, `fleetDbPath`, `conversationsDbPath`, `socketPath` from `./paths`; `loadConfig` from `./config`; `openFleetDb` from `./db/fleet-schema`; `openConversationsDb` from `./db/conversations-schema`; `startSocketServer` from `./socket/server`; `buildDoctorReport` from `./doctor`; `encode` from `./socket/protocol`).
- Produces: `main(): void` (the `fleetd` process entrypoint) and the `fleetd-doctor` CLI script — this is the stage's live-test harness; no later task depends on new exports here.

This task is where the spec's Tahap 1 "Selesai bila" criterion gets proven: *"fleetd menyala, doctor menjawab, satu bot terdaftar dari config."* The end-to-end test spawns the real process (not an in-process call) and talks to it only through the Unix socket, exactly like a future real client would.

- [ ] **Step 1: Write the failing end-to-end test**

```typescript
// fleetd/test/e2e.test.ts
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("fleetd end-to-end", () => {
  const home = mkdtempSync(join(tmpdir(), "mirza-bots-e2e-"));
  writeFileSync(
    join(home, "config.json"),
    JSON.stringify({
      allowFrom: ["123456"],
      bots: { "bot-01": { home: "/tmp/bot-01", token: "test-token" } },
    })
  );

  const env = { ...process.env, MIRZA_BOTS_HOME: home };
  const root = join(import.meta.dir, "..");
  const fleetdProc = Bun.spawn(["bun", "run", "src/main.ts"], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  afterAll(() => {
    fleetdProc.kill();
    rmSync(home, { recursive: true, force: true });
  });

  test("doctor reports 1 registered bot and all fleet tables", async () => {
    const sockPath = join(home, "fleetd.sock");
    let waited = 0;
    while (!existsSync(sockPath) && waited < 5000) {
      await Bun.sleep(100);
      waited += 100;
    }
    expect(existsSync(sockPath)).toBe(true);

    const doctorProc = Bun.spawn(["bun", "run", "bin/fleetd-doctor.ts"], {
      cwd: root,
      env,
      stdout: "pipe",
    });
    const output = await new Response(doctorProc.stdout).text();
    await doctorProc.exited;

    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.report.botCount).toBe(1);
    expect(parsed.report.fleetTables.length).toBe(5);
    expect(parsed.report.conversationsReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/e2e.test.ts`
Expected: FAIL — `src/main.ts` and `bin/fleetd-doctor.ts` do not exist yet, so the spawned process exits immediately without creating the socket (test times out waiting for `sockPath`).

- [ ] **Step 3: Write the entrypoint**

```typescript
// fleetd/src/main.ts
import { ensureStateDirs, configPath, fleetDbPath, conversationsDbPath, socketPath } from "./paths";
import { loadConfig } from "./config";
import { openFleetDb } from "./db/fleet-schema";
import { openConversationsDb } from "./db/conversations-schema";
import { startSocketServer } from "./socket/server";
import { buildDoctorReport } from "./doctor";
import type { Request, Response } from "./socket/protocol";

const VERSION = "0.1.0";

export function main(): void {
  ensureStateDirs();
  const config = loadConfig(configPath());
  const fleetDb = openFleetDb(fleetDbPath());
  const conversationsDb = openConversationsDb(conversationsDbPath());
  const sockPath = socketPath();

  startSocketServer(sockPath, (req: Request): Response => {
    if (req.type === "doctor") {
      return {
        ok: true,
        report: buildDoctorReport(config, fleetDb, conversationsDb, sockPath, VERSION),
      };
    }
    return { ok: false, error: "unknown_type" };
  });

  console.log(`fleetd listening on ${sockPath}`);
}

if (import.meta.main) {
  main();
}
```

- [ ] **Step 4: Write the doctor CLI client**

```typescript
// fleetd/bin/fleetd-doctor.ts
import net from "node:net";
import { socketPath } from "../src/paths";
import { encode } from "../src/socket/protocol";

function askDoctor(sockPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => {
      client.write(encode({ type: "doctor" }));
    });
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const idx = buf.indexOf("\n");
      if (idx !== -1) {
        client.end();
        resolve(JSON.parse(buf.slice(0, idx)));
      }
    });
    client.on("error", reject);
  });
}

const res: any = await askDoctor(socketPath());
console.log(JSON.stringify(res, null, 2));
if (!res.ok) process.exit(1);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd fleetd && bun test test/e2e.test.ts`
Expected: PASS — 1 test, 0 fail. (This spawns real OS processes; if it's flaky in CI, raise the `waited < 5000` budget — do not remove the polling loop and assume the socket is instant.)

- [ ] **Step 6: Run the full suite**

Run: `cd fleetd && bun test`
Expected: PASS — 14 tests, 0 fail, across `paths.test.ts`, `config.test.ts`, `fleet-schema.test.ts`, `conversations-schema.test.ts`, `socket.test.ts`, `doctor.test.ts`, `e2e.test.ts`.

- [ ] **Step 7: Smoke-check that all imports resolve (matches `mirza-marketplace` convention)**

Run: `cd fleetd && bun build src/main.ts --target=bun --outfile=/tmp/fleetd-smoke-main.js && bun build bin/fleetd-doctor.ts --target=bun --outfile=/tmp/fleetd-smoke-doctor.js && rm /tmp/fleetd-smoke-main.js /tmp/fleetd-smoke-doctor.js`
Expected: both bundle successfully with no unresolved-import errors.

- [ ] **Step 8: Manual live check against your real `~/.claude/mirza-bots/`**

This is the actual acceptance test from spec §10 — run it without `MIRZA_BOTS_HOME` so it touches the real state directory for the first time:

```bash
mkdir -p ~/.claude/mirza-bots
cat > ~/.claude/mirza-bots/config.json <<'EOF'
{
  "allowFrom": ["REPLACE_WITH_YOUR_TELEGRAM_USER_ID"],
  "bots": {
    "bot-01": { "home": "/Users/mirza/Workspace/mirza-bots", "token": "REPLACE_WITH_A_REAL_OR_PLACEHOLDER_TOKEN" }
  }
}
EOF
cd fleetd
bun run start &
sleep 1
bun run doctor
kill %1
```

Expected output includes `"ok": true`, `"botCount": 1`, `"fleetTables"` with 5 entries, `"conversationsReady": true`. This is the human-verified proof that satisfies spec §10's "fleetd menyala, doctor menjawab, satu bot terdaftar dari config" — do not mark this task done from the automated tests alone.

- [ ] **Step 9: Commit**

```bash
cd mirza-bots
git add fleetd/src/main.ts fleetd/bin/fleetd-doctor.ts fleetd/test/e2e.test.ts
git commit -m "feat(fleetd): wire entrypoint + doctor CLI, satisfying tahap 1 acceptance criteria"
```
