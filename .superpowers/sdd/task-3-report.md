# Task 3 Report: Skema SQLite Fase 0

## Status

COMPLETE

## What Was Changed

### Files Created

- `packages/shared/src/schema.ts` — SQLite schema definition (SCHEMA_SQL constant and applySchema function)
- `packages/shared/test/schema.test.ts` — 2 TDD tests verifying table creation and FTS5 functionality

### Files Modified

- `packages/shared/src/index.ts` — Added `export * from "./schema";` (kept existing `export * from "./ipc";`)

## TDD Process

### Step 1: Write Failing Test ✓
Created test file with 2 tests:
- `semua tabel inti tercipta dan idempotent` — verifies all 9 tables exist and schema is idempotent
- `FTS5 messages_fts tersedia` — verifies FTS5 virtual table works for full-text search

### Step 2: Confirm Failure ✓
```
error: Cannot find module '../src/schema' from 'schema.test.ts'
0 pass, 1 fail, 1 error
```

### Step 3: Implementation ✓
Schema created with:
- 9 tables: bots, sessions, messages, bus_queue, bus_dead, goals, handoffs, channel_access, kv
- FTS5 virtual table (messages_fts) with external content pattern
- All DDL uses `IF NOT EXISTS` for idempotency
- Minimal columns per YAGNI (phase 0 is draft, final in phase 1)

### Step 4: Confirm Pass ✓
```
bun test v1.3.11 (af24e281)

 2 pass
 0 fail
 10 expect() calls
Ran 2 tests across 1 file. [36.00ms]
```

### Step 5: Full Suite Test ✓
All shared tests pass (including old IPC tests from Task 2):
```
 7 pass
 0 fail
 19 expect() calls
Ran 7 tests across 2 files. [40.00ms]
```

### Step 6: Typecheck ✓
```bash
bun run typecheck
$ tsc --noEmit
(exit 0)
```

### Step 7: Commit ✓
```
[main 8f95ac5] feat(shared): draft skema SQLite fase 0 (9 tabel inti + FTS5)
 3 files changed, 126 insertions(+)
 create mode 100644 packages/shared/src/schema.ts
 create mode 100644 packages/shared/test/schema.test.ts
```

Commit includes required trailers:
```
Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

### Step 8: Push ✓
```
To https://github.com/mirzaakhena/mirza-harness.git
   71245ef..8f95ac5  main -> main
```

## Test Evidence

### Test 1: Table Creation and Idempotency
```typescript
test("semua tabel inti tercipta dan idempotent", () => {
  const db = new Database(":memory:");
  applySchema(db);      // First apply
  applySchema(db);      // Second apply (must not throw)
  const rows = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
  const names = rows.map(r => r.name);
  for (const t of EXPECTED_TABLES) expect(names).toContain(t);
});
```
✓ PASS — All 9 tables created, schema idempotent (no errors on reapply)

### Test 2: FTS5 Full-Text Search
```typescript
test("FTS5 messages_fts tersedia", () => {
  const db = new Database(":memory:");
  applySchema(db);
  db.run("INSERT INTO messages (bot_id, channel, chat_id, direction, ts, body) VALUES ('bot-03','telegram','1','in',0,'halo dunia')");
  db.run("INSERT INTO messages_fts(rowid, body) SELECT id, body FROM messages");
  const hit = db.query("SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'halo'").all();
  expect(hit.length).toBe(1);
});
```
✓ PASS — FTS5 virtual table works, full-text search returns correct results

## Schema Tables

1. **bots** — Bot instance tracking (id, workspace, status, last_heartbeat_at, created_at)
2. **sessions** — Session lifecycle (id, bot_id, name, lifecycle state, timestamps)
3. **messages** — Message log with metadata (id, bot_id, channel, chat_id, direction, ts, body, meta)
4. **messages_fts** — FTS5 virtual table for full-text search on messages.body
5. **bus_queue** — Agent bus message queue (id, ts, from_agent, to_agent, kind, payload, hop, reply_to, attempts, next_attempt_at, acked_at)
6. **bus_dead** — Dead-letter queue (id, ts, envelope, reason, dead_at)
7. **goals** — Goal tracking (id, bot_id, spec, status, timestamps)
8. **handoffs** — Bot handoff coordination (id, from_bot, to_bot, file_path, designation, pair, status, created_at)
9. **channel_access** — Channel access policies (channel, bot_id, policy JSON; composite PK)
10. **kv** — Key-value store (key, value)

## Requirements Verification

- ✓ All 9 tables created with `IF NOT EXISTS` (idempotent)
- ✓ FTS5 virtual table works
- ✓ `SCHEMA_SQL` string exported
- ✓ `applySchema(db: Database)` function exported
- ✓ Exported from index.ts
- ✓ All tests pass (schema + ipc)
- ✓ TypeScript strict mode clean
- ✓ TDD process followed
- ✓ Commit with required trailers
- ✓ Pushed to remote

## No Concerns

- Schema follows brief exactly (9 tables, FTS5, idempotency)
- Minimal columns per YAGNI principle
- No columns added beyond brief
- No other packages touched
- All existing tests still pass
- No type errors
- Clean git history
