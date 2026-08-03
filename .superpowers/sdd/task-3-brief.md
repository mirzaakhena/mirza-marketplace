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

