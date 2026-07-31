### Task 2: The root — store `message_id`, `reply_to`, `metadata`, and add `session_id`

Everything else in this plan is downstream of this task. Four features are unbuildable while `message_id` is `NULL`.

**Files:**
- Modify: `fleetd/src/db/conversations-schema.ts`
- Modify: `fleetd/src/telegram/poller.ts`
- Modify: `fleetd/src/main.ts` (`normalizeMessage`, the three handlers)
- Modify: `fleetd/src/socket/protocol.ts`, `fleetd/src/socket/server.ts`, `fleetd/src/socket/registry.ts`
- Modify: `cc-plugin/src/fleetd-client.ts`, `cc-plugin/src/main.ts`
- Test: `fleetd/test/conversations-schema.test.ts`, `fleetd/test/socket/registry.test.ts`, `fleetd/test/socket/server.test.ts`, `fleetd/test/main.test.ts`, `fleetd/test/telegram/poller.test.ts`, `cc-plugin/test/fleetd-client.test.ts`, `cc-plugin/test/main.test.ts`

**Interfaces:**
- Consumes: the Task 1 verdict recorded in spec §10.
- Produces:
  - `NewMessage.sessionId?: string` and a `session_id TEXT` column, in `conversations-schema.ts`.
  - `NormalizedMessage.messageId?: string`, `.replyTo?: string`, `.metadata?: string` — in `poller.ts`. (Tasks 3, 5, 6 add more fields to this same type.)
  - `BoundConnection.sessionId?: string` and `ConnectionRegistry.sessionIdFor(bot: string): string | undefined`.
  - `HelloRequestSchema` gains `sessionId: z.string().optional()`.
  - `FleetdClient.connect(sockPath: string, cwd: string, sessionId?: string)`.
  - `resolveSessionId(): string | undefined` exported from `cc-plugin/src/main.ts`.
  - Push `meta` gains `message_id` and `session_id` (both omitted when unknown).

- [ ] **Step 1: Write the failing schema tests**

Append to `fleetd/test/conversations-schema.test.ts` (add `Database` and `mkdtempSync`/`join`/`tmpdir` imports at the top: `import { Database } from "bun:sqlite";`, `import { mkdtempSync } from "node:fs";`, `import { tmpdir } from "node:os";`, `import { join } from "node:path";`):

```ts
describe("session_id column", () => {
  test("session_id is stored and read back", () => {
    const db = openConversationsDb(":memory:");
    insertMessage(db, {
      ts: "2026-07-31T00:00:00Z",
      bot: "bot-01",
      chatId: "111",
      source: "user",
      text: "halo",
      sessionId: "a3760589-1111-2222-3333-444444444444",
    });

    const row = db.query("SELECT session_id FROM messages").get() as { session_id: string };
    expect(row.session_id).toBe("a3760589-1111-2222-3333-444444444444");
  });

  test("an existing conversations.db created before session_id gets the column without losing rows", () => {
    // The real database on disk was created by Tahap 1's CREATE TABLE, which has
    // no session_id. `CREATE TABLE IF NOT EXISTS` is a no-op against it, so
    // without an explicit ALTER the very first insert after this change would
    // fail with "table messages has no column named session_id" -- on the user's
    // live history, not in a test.
    // The FTS table and its triggers are part of the legacy shape on purpose:
    // the ALTER runs against a table that already has a POPULATED fts5
    // external-content index attached. Every other test in this file uses a
    // fresh in-memory database where session_id comes from CREATE TABLE, so
    // this is the only place the real migration path is exercised at all --
    // and Task 7's whole search tool rides on that index surviving.
    const dir = mkdtempSync(join(tmpdir(), "conv-migrate-"));
    const path = join(dir, "conversations.db");
    const legacy = new Database(path);
    legacy.exec(`CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, bot TEXT NOT NULL,
      chat_id TEXT NOT NULL, message_id TEXT, source TEXT NOT NULL, user_id TEXT,
      user_name TEXT, text TEXT, attachments TEXT, reply_to TEXT, metadata TEXT
    );
    CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='id');
    CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
    END;
    CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
      INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
    END;`);
    legacy.query("INSERT INTO messages (ts, bot, chat_id, source, text) VALUES (?,?,?,?,?)")
      .run("2026-07-01T00:00:00Z", "bot-01", "111", "user", "pesan lama");
    legacy.close();

    const db = openConversationsDb(path);

    const cols = (db.query("PRAGMA table_info(messages)").all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(cols).toContain("session_id");
    // The old row is still there, with a NULL session_id -- migration, not reset.
    const old = db.query("SELECT text, session_id FROM messages").get() as {
      text: string;
      session_id: string | null;
    };
    expect(old.text).toBe("pesan lama");
    expect(old.session_id).toBeNull();
    // And the migrated database accepts new inserts.
    insertMessage(db, { ts: "t", bot: "bot-01", chatId: "111", source: "user", text: "baru", sessionId: "s1" });
    expect(db.query("SELECT COUNT(*) AS c FROM messages").get()).toEqual({ c: 2 });
    // The pre-existing FTS index still resolves the row it indexed BEFORE the
    // ALTER, and indexes rows written after it. Without this, a migration that
    // quietly detached the index would take Task 7's search tool with it and
    // nothing would report an error.
    expect(searchMessages(db, "lama").length).toBe(1);
    expect(searchMessages(db, "baru").length).toBe(1);
    db.close();
  });

  test("message_id, reply_to and metadata round-trip through insertMessage", () => {
    const db = openConversationsDb(":memory:");
    insertMessage(db, {
      ts: "2026-07-31T00:00:00Z",
      bot: "bot-01",
      chatId: "111",
      source: "user",
      text: "halo",
      messageId: "4321",
      replyTo: "4300",
      metadata: JSON.stringify({ quote_text: "yang ini" }),
    });

    const row = db.query("SELECT message_id, reply_to, metadata FROM messages").get() as {
      message_id: string;
      reply_to: string;
      metadata: string;
    };
    expect(row.message_id).toBe("4321");
    expect(row.reply_to).toBe("4300");
    expect(JSON.parse(row.metadata)).toEqual({ quote_text: "yang ini" });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts`

Expected: FAIL — the first two fail with `no such column: session_id` / `table messages has no column named session_id`. The third should already pass (those three columns exist and `insertMessage` already writes them) — that is fine; it exists to pin the wiring once `session_id` joins the INSERT list.

- [ ] **Step 3: Add the column, the migration, and the index**

In `fleetd/src/db/conversations-schema.ts`, split the current single `SCHEMA` const into table-first / rest-after, so the index on the new column is created only once the column is guaranteed to exist. Replace lines 3-45 (`const SCHEMA = ...` through the end of `openConversationsDb`) with:

```ts
// Table only. Indexes, FTS and triggers come after addMissingColumns() below,
// because idx_messages_session cannot be created until session_id exists on a
// database that predates it.
const TABLE = `
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
  metadata TEXT,
  session_id TEXT
);
`;

const INDEXES_AND_FTS = `
CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages(bot);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(bot, chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(bot, message_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

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

// Columns added after Tahap 1 shipped. `CREATE TABLE IF NOT EXISTS` does nothing
// to a table that already exists, so a database carrying real history would keep
// the old shape forever and every insert would fail. Guarded by table_info so it
// is idempotent -- SQLite has no `ADD COLUMN IF NOT EXISTS`.
const ADDED_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "session_id", ddl: "ALTER TABLE messages ADD COLUMN session_id TEXT" },
];

function addMissingColumns(db: Database): void {
  const existing = new Set(
    (db.query("PRAGMA table_info(messages)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  for (const col of ADDED_COLUMNS) {
    if (!existing.has(col.name)) db.exec(col.ddl);
  }
}

export function openConversationsDb(path: string): Database {
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(TABLE);
  addMissingColumns(db);
  db.exec(INDEXES_AND_FTS);
  return db;
}
```

Then extend `NewMessage` and `insertMessage`:

```ts
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
  sessionId?: string;
};

export function insertMessage(db: Database, msg: NewMessage): number {
  const result = db
    .query(
      `INSERT INTO messages (ts, bot, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      msg.metadata ?? null,
      msg.sessionId ?? null
    );
  return Number(result.lastInsertRowid);
}
```

- [ ] **Step 4: Run the schema tests to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts`

Expected: PASS — 6 tests (3 existing + 3 new).

- [ ] **Step 5: Write the failing registry + socket-server tests**

Append to `fleetd/test/socket/registry.test.ts`:

```ts
  test("sessionIdFor returns the session id of the connection bound to that bot", () => {
    const registry = new ConnectionRegistry();
    const { conn } = fakeConn();
    conn.sessionId = "a3760589-1111-2222-3333-444444444444";
    registry.register("bot-01", conn);

    expect(registry.sessionIdFor("bot-01")).toBe("a3760589-1111-2222-3333-444444444444");
    // No connection at all, and a connection that never declared one, both read
    // as "unknown" rather than throwing -- the poller calls this on every
    // incoming message, including when nothing is connected.
    expect(registry.sessionIdFor("bot-02")).toBeUndefined();
  });
```

Change `fakeConn()` in that file so the connection object can carry the field (line 7):

```ts
  return {
    conn: { send: (msg: PushMessage) => sent.push(msg), boundBot: null as string | null } as BoundConnection,
    sent,
  };
```

and extend the import on line 2 to `import { ConnectionRegistry, type BoundConnection } from "../../src/socket/registry";`.

Append to `fleetd/test/socket/server.test.ts`:

```ts
  test("hello carrying a sessionId records it on the connection so pushes can be attributed to a session", async () => {
    tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
    const sockPath = join(tmp, "fleetd.sock");
    const registry = new ConnectionRegistry();
    server = startSocketServer(sockPath, testConfig, () => ({ ok: true }), registry);

    const line = await sendRaw(
      sockPath,
      encode({ type: "hello", cwd: "/fake/bot-01/home", sessionId: "sess-abc" })
    );

    // The response shape is unchanged -- sessionId is extra information the
    // client volunteers, not a new part of the handshake contract.
    expect(JSON.parse(line)).toEqual({ ok: true, bot: "bot-01" });
    expect(registry.sessionIdFor("bot-01")).toBe("sess-abc");
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/socket/`

Expected: FAIL — 2 failures: `registry.sessionIdFor is not a function`, and the socket test failing because zod's `strictObject` rejects the unknown `sessionId` key, producing `{ok:false,error:"bad_request"}`.

- [ ] **Step 7: Implement the registry, protocol and socket-server changes**

In `fleetd/src/socket/registry.ts`:

```ts
export type BoundConnection = {
  send: (msg: PushMessage) => void;
  boundBot: string | null;
  // The Claude Code session that opened this connection, as reported by the
  // plugin in its `hello`. A snapshot taken at connect time, not a live tracker
  // (spec §8 risk 2) -- good enough to attribute stored messages to a session,
  // not authoritative session routing. That is Tahap 4's job.
  sessionId?: string;
};
```

and add to `ConnectionRegistry`:

```ts
  sessionIdFor(bot: string): string | undefined {
    const set = this.byBot.get(bot);
    if (!set) return undefined;
    for (const conn of set) {
      if (conn.sessionId) return conn.sessionId;
    }
    return undefined;
  }
```

In `fleetd/src/socket/protocol.ts`, replace the `HelloRequestSchema` line:

```ts
export const HelloRequestSchema = z.strictObject({
  type: z.literal("hello"),
  cwd: z.string(),
  // Optional on purpose: a plugin that cannot determine its session id must
  // still be able to connect. The column then stays NULL rather than the
  // handshake failing.
  sessionId: z.string().optional(),
});
```

In `fleetd/src/socket/server.ts`, inside the `if (req.type === "hello")` block, set the field right before `registry.register(bot, conn)`:

```ts
          conn.boundBot = bot;
          conn.sessionId = req.sessionId;
          registry.register(bot, conn);
```

- [ ] **Step 8: Run the socket tests to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/socket/`

Expected: PASS — all socket tests, including the 2 new ones.

- [ ] **Step 9: Write the failing poller + normalizeMessage tests**

Append to `fleetd/test/main.test.ts`, inside the existing `describe("normalizeMessage", ...)` block:

```ts
  test("carries the Telegram message id through as a string", () => {
    const msg = normalizeMessage(
      "bot-01",
      { chatId: 111, userId: 111, messageId: 4321 },
      { text: "halo" }
    );

    // Telegram sends it as a number; the column and every consumer downstream
    // (meta values, history lookups) are strings.
    expect(msg.messageId).toBe("4321");
  });

  test("leaves the message id undefined when the handler has none, without inventing one", () => {
    const msg = normalizeMessage("bot-01", { chatId: 111, userId: 111 }, { callbackData: "confirm_yes" });

    // A button press has no message of its own. Storing the bot's message id
    // here would make history navigation point at the wrong row.
    expect(msg.messageId).toBeUndefined();
  });
```

Append to `fleetd/test/telegram/poller.test.ts`, inside `describe("handleIncomingMessage", ...)`:

```ts
  test("stores the Telegram message id and pushes it in meta", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });

    await handleIncomingMessage(baseMsg({ messageId: "4321" }), {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    // The whole root cause of this sub-project: the column and the parameter
    // both existed, the caller just never filled them.
    const row = conversationsDb.query("SELECT message_id FROM messages").get() as { message_id: string };
    expect(row.message_id).toBe("4321");
    expect(sent[0]?.meta.message_id).toBe("4321");
  });

  test("omits message_id from meta entirely when there is none, rather than sending 'undefined'", async () => {
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });

    await handleIncomingMessage(baseMsg(), {
      config,
      conversationsDb: openConversationsDb(":memory:"),
      fleetDb: openFleetDb(":memory:"),
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    // cc-plugin's SCAR-056 guard coerces with String(value), so a present-but-
    // undefined key would reach the AI as the literal word "undefined".
    expect("message_id" in sent[0]!.meta).toBe(false);
  });

  test("stamps the message with the session id of the connection bound to that bot", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", {
      send: (m) => sent.push(m),
      boundBot: "bot-01",
      sessionId: "sess-abc",
    });

    await handleIncomingMessage(baseMsg(), {
      config,
      conversationsDb,
      fleetDb: openFleetDb(":memory:"),
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    const row = conversationsDb.query("SELECT session_id FROM messages").get() as { session_id: string };
    expect(row.session_id).toBe("sess-abc");
    expect(sent[0]?.meta.session_id).toBe("sess-abc");
  });
```

- [ ] **Step 10: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/main.test.ts test/telegram/poller.test.ts`

Expected: FAIL — 4 failures (`messageId` is not a property of `NormalizedMessage` / is `undefined`, `message_id` and `session_id` missing from the stored row and from `meta`). The "omits message_id" test passes already; it is there to stay passing.

- [ ] **Step 11: Wire the poller and the handlers**

In `fleetd/src/telegram/poller.ts`, extend the type and the body:

```ts
export type NormalizedMessage = {
  bot: string;
  chatId: string;
  userId: string;
  userName?: string;
  // Telegram's message id, as a string. The single field four separate features
  // were blocked on: history navigation, album ordering, album fallback, and
  // outgoing quotes (2.5-KELUAR).
  messageId?: string;
  text?: string;
  photoUrls?: string[];
  callbackData?: string;
  // Telegram message id this one replies to (Task 3 fills it).
  replyTo?: string;
  ts: string;
};
```

and replace the `insertMessage` + `pushMsg` block (currently lines 59-80) with:

```ts
  // Read once: the same value goes into the row and into meta, and re-reading it
  // between the two would let them disagree if a connection dropped in between.
  const sessionId = deps.registry.sessionIdFor(msg.bot);

  insertMessage(deps.conversationsDb, {
    ts: msg.ts,
    bot: msg.bot,
    chatId: msg.chatId,
    messageId: msg.messageId,
    source: "user",
    userId: msg.userId,
    userName: msg.userName,
    text: displayText,
    attachments: attachments.length > 0 ? JSON.stringify(attachments) : undefined,
    replyTo: msg.replyTo,
    sessionId,
  });

  const pushMsg: PushMessage = {
    type: "push_message",
    text: displayText ?? "(media)",
    meta: {
      chat_id: msg.chatId,
      user_id: msg.userId,
      ts: msg.ts,
      kind: msg.callbackData !== undefined ? "callback" : "message",
      // Spread-if-defined, never `key: value ?? undefined`: cc-plugin's SCAR-056
      // guard coerces with String(), which would turn a missing value into the
      // literal string "undefined" in front of the AI.
      ...(msg.messageId !== undefined ? { message_id: msg.messageId } : {}),
      ...(sessionId !== undefined ? { session_id: sessionId } : {}),
      ...(attachments.length > 0 ? { attachments: attachments.join(",") } : {}),
    },
  };
```

In `fleetd/src/main.ts`, extend `normalizeMessage`'s `ids` parameter and body:

```ts
export function normalizeMessage(
  botName: string,
  ids: {
    chatId: string | number;
    userId: string | number;
    userName?: string;
    dateSeconds?: number;
    messageId?: string | number;
  },
  payload: Pick<NormalizedMessage, "text" | "photoUrls" | "callbackData">
): NormalizedMessage {
  return {
    bot: botName,
    chatId: String(ids.chatId),
    userId: String(ids.userId),
    userName: ids.userName,
    messageId: ids.messageId !== undefined ? String(ids.messageId) : undefined,
    ts: new Date((ids.dateSeconds ?? Date.now() / 1000) * 1000).toISOString(),
    ...payload,
  };
}
```

Then add the id at each of the three call sites that has one. In the `message:text` handler, the `message:photo` handler (single-photo branch), and the album flush, the `ids` object gains one line:

```ts
            // message:text handler
            chatId: ctx.chat.id,
            userId: ctx.from?.id ?? ctx.chat.id,
            userName: ctx.from?.username,
            dateSeconds: ctx.message.date,
            messageId: ctx.message.message_id,
```

```ts
            // message:photo handler, single-photo branch
            chatId: ctx.chat.id,
            userId: ctx.from?.id ?? ctx.chat.id,
            userName: ctx.from?.username,
            dateSeconds: ctx.message.date,
            messageId: ctx.message.message_id,
```

```ts
                // album flush (`first` is items[0]!.ctx)
                chatId: first.chat.id,
                userId: first.from?.id ?? first.chat.id,
                userName: first.from?.username,
                dateSeconds: first.message.date,
                messageId: first.message.message_id,
```

**Do not** add one to the `callback_query:data` handler: a button press has no message of its own, and `ctx.callbackQuery.message.message_id` is the *bot's* message, which would make history navigation point at the wrong row.

- [ ] **Step 12: Run the fleetd suite to verify it passes**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test`

Expected: PASS — **69 tests** (59 baseline + 3 schema + 1 registry + 1 socket + 2 normalizeMessage + 3 poller).

- [ ] **Step 13: Write the failing cc-plugin tests**

Append to `cc-plugin/test/fleetd-client.test.ts`, inside `describe("FleetdClient", ...)`:

```ts
  test("connect includes sessionId in the hello when one is given, and omits the key when not", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    const received: any[] = [];
    server = startFakeFleetd(sockPath, (line, conn) => {
      received.push(JSON.parse(line));
      conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
    });

    const withSession = new FleetdClient();
    await withSession.connect(sockPath, "/fake/cwd", "sess-abc");
    withSession.close();

    const withoutSession = new FleetdClient();
    await withoutSession.connect(sockPath, "/fake/cwd");
    withoutSession.close();

    expect(received[0]).toEqual({ type: "hello", cwd: "/fake/cwd", sessionId: "sess-abc" });
    // The key must be absent, not present-and-undefined: fleetd validates hello
    // with a zod strictObject, and JSON.stringify drops undefined values anyway --
    // relying on that silently would break the moment the field became non-optional.
    expect(received[1]).toEqual({ type: "hello", cwd: "/fake/cwd" });
  });
```

Append to `cc-plugin/test/main.test.ts` (extend the import on line 2 to include `resolveSessionId`):

```ts
describe("resolveSessionId", () => {
  test("returns CLAUDE_CODE_SESSION_ID when Claude Code sets it", () => {
    const prev = process.env.CLAUDE_CODE_SESSION_ID;
    process.env.CLAUDE_CODE_SESSION_ID = "a3760589-1111-2222-3333-444444444444";
    try {
      expect(resolveSessionId()).toBe("a3760589-1111-2222-3333-444444444444");
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = prev;
    }
  });

  test("returns undefined when it is unset or empty, so hello omits the field", () => {
    const prev = process.env.CLAUDE_CODE_SESSION_ID;
    delete process.env.CLAUDE_CODE_SESSION_ID;
    try {
      expect(resolveSessionId()).toBeUndefined();
      process.env.CLAUDE_CODE_SESSION_ID = "";
      // An empty env var is "not set" in every way that matters -- storing "" in
      // session_id would look like a real session id to every later query.
      expect(resolveSessionId()).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = prev;
    }
  });
});
```

- [ ] **Step 14: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test`

Expected: FAIL — 3 failures: `resolveSessionId` is not exported (import error), and `connect` ignores its third argument.

- [ ] **Step 15: Implement `resolveSessionId()` — pick the body from Task 1's verdict**

In `cc-plugin/src/main.ts`, add the function next to `resolveIdentityCwd()`. **Use the body matching the verdict recorded in spec §10.** All four bodies are given in full below; keep exactly one.

**If the verdict is `V-1-full` or `V-1-partial`** (the expected case) — the default:

```ts
// Claude Code exports this into every MCP server it launches. It is a snapshot
// taken when the MCP connection was made, not a live session tracker: if the
// user runs /clear or switches sessions, the plugin process is not guaranteed to
// restart with a new id (spec §8 risk 2). Good enough to attribute stored
// messages to a session; authoritative session routing belongs to Tahap 4.
export function resolveSessionId(): string | undefined {
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  return id && id.length > 0 ? id : undefined;
}
```

**If the verdict is `V-2`** (a `SessionStart` hook writes the id to a file) — keep this body instead, and additionally add the permanent hook to `/Users/mirza/Workspace/mirza-bots/.claude/settings.json` exactly as probed in Task 1 Step 5, writing to `session/<basename of the project dir>.json` rather than `probe.json`:

```ts
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// K-10: session truth is reported by Claude Code through a hook, not scraped
// from its private filesystem. The SessionStart hook in .claude/settings.json
// writes its payload here; we only read it.
export function resolveSessionId(): string | undefined {
  const root = process.env.MIRZA_BOTS_HOME ?? join(homedir(), ".claude", "mirza-bots");
  const file = join(root, "session", `${basename(resolveIdentityCwd())}.json`);
  try {
    const payload = JSON.parse(readFileSync(file, "utf8")) as { session_id?: string };
    return payload.session_id && payload.session_id.length > 0 ? payload.session_id : undefined;
  } catch {
    // No hook has fired yet, or the file is unreadable/corrupt. Not an error:
    // the column simply stays NULL for this message.
    return undefined;
  }
}
```

**If the verdict is `V-3-debt`** — keep this body, and only after the debt (SCAR-040 + SCAR-041) is written into spec §10:

```ts
import { readdirSync, statSync } from "node:fs";

// DEBT, knowingly incurred (see spec §10): this scrapes Claude Code's private
// transcript directory, which K-10 forbids as a default. SCAR-040: only the
// active session is ever visible this way. SCAR-041: a freshly created session
// still carries the previous session's data until it becomes active, so the
// newest file by mtime can be the WRONG session for a short window.
export function resolveSessionId(): string | undefined {
  const slug = resolveIdentityCwd().replace(/[/.]/g, "-");
  const dir = join(homedir(), ".claude", "projects", slug);
  try {
    const newest = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    return newest ? newest.f.replace(/\.jsonl$/, "") : undefined;
  } catch {
    return undefined;
  }
}
```

**If the verdict is `none`** — keep this body. The column ships empty and Tahap 4 fills it; spec §6 explicitly sanctions this:

```ts
// No verified source exists yet (spec §10 verdict: none). The column is in place
// so Tahap 4 can start filling it without an ALTER TABLE over accumulated
// history -- which is the whole reason it was added now (spec §4).
export function resolveSessionId(): string | undefined {
  return undefined;
}
```

Then pass it through in `main()`:

```ts
export async function main(): Promise<void> {
  const client = new FleetdClient();
  const { bot } = await client.connect(resolveSocketPath(), resolveIdentityCwd(), resolveSessionId());
  console.error(`cc-plugin: connected to fleetd as bot "${bot}"`);

  const server = buildServer(client);
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 16: Implement the client change**

In `cc-plugin/src/fleetd-client.ts`, change the `connect` signature and the hello write:

```ts
  connect(sockPath: string, cwd: string, sessionId?: string): Promise<{ bot: string }> {
```

and inside, replace the `socket.write(...)` line:

```ts
        // Spread-if-defined so the key is absent rather than present-and-undefined:
        // fleetd parses hello with a zod strictObject.
        socket.write(
          this.encode({ type: "hello", cwd, ...(sessionId !== undefined ? { sessionId } : {}) })
        );
```

- [ ] **Step 17: Run both suites to verify they pass**

```bash
cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
```

Expected: PASS — **fleetd 69, cc-plugin 22.**

- [ ] **Step 18: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add fleetd/src/db/conversations-schema.ts fleetd/src/telegram/poller.ts fleetd/src/main.ts \
        fleetd/src/socket/protocol.ts fleetd/src/socket/server.ts fleetd/src/socket/registry.ts \
        fleetd/test cc-plugin/src/fleetd-client.ts cc-plugin/src/main.ts cc-plugin/test
git commit -m "feat(fleetd): actually store message_id, reply_to, metadata and session_id

The columns and insertMessage's parameters have existed since Tahap 1; the
caller in poller.ts simply always passed undefined. That one omission is what
made history navigation, album ordering, album fallback and outgoing quotes
unbuildable.

session_id is the only new column. It is added behind a table_info guard so a
conversations.db carrying real history is migrated rather than left with the
old shape -- CREATE TABLE IF NOT EXISTS would have been a silent no-op there.
Its source is whatever Task 1 verified; the column exists regardless, so a
better source later needs no migration over accumulated history."
```

---

