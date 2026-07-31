### Task 7: Two new MCP tools — history navigation and keyword search

The point of storing `message_id` is being able to use it. Search is nearly free: FTS5 and its three sync triggers have been live since Tahap 1 and `searchMessages()` was already written — this opens a tap that is already plumbed.

**K-3 governs the bot boundary:** both tools **default to the calling bot**, and reach another bot's history only through a parameter named on purpose. This is also what closes B-1 `peek_conversation`, earlier than Tahap 6.

**Files:**
- Modify: `fleetd/src/db/conversations-schema.ts`, `fleetd/src/socket/protocol.ts`, `fleetd/src/main.ts`
- Modify: `cc-plugin/src/fleetd-client.ts`, `cc-plugin/src/server.ts`
- Test: `fleetd/test/conversations-schema.test.ts`, `fleetd/test/main.test.ts`, `fleetd/test/socket/server.test.ts`, `cc-plugin/test/fleetd-client.test.ts`, `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: `openConversationsDb`/`insertMessage` (Task 2), `BoundConnection.boundBot`, `Config`.
- Produces:
  - `HistoryMessage` (wire type) from `fleetd/src/socket/protocol.ts`.
  - `getMessagesAround(db, opts: { bot: string; messageId: string; before: number; after: number }): HistoryMessage[]` and `searchMessages(db, query: string, opts?: { bot?: string; limit?: number }): HistoryMessage[]` from `fleetd/src/db/conversations-schema.ts`.
  - `HistoryRequestSchema`, `SearchRequestSchema`, both in `RequestSchema`; `Response` gains `{ ok: true; messages: HistoryMessage[] }`.
  - `handleHistoryRequest(req, conn, config, db)` and `handleSearchRequest(req, conn, config, db)` exported from `fleetd/src/main.ts`.
  - `FleetdClient.history(opts)` and `.search(opts)`; MCP tools `read_history` and `search_history` in `cc-plugin/src/server.ts`.

**A note on SCAR-088 and these tools:** history rows contain sender text, and the tools hand it to the AI as tool output. That is not the scar's case — the scar is about sender text arriving *as* the incoming message the AI is acting on. Here the AI asked for the data and receives it as a clearly framed JSON payload. Do not "fix" this by routing history through `meta`.

- [ ] **Step 1: Write the failing query tests**

Append to `fleetd/test/conversations-schema.test.ts` (extend the import on line 2 to include `getMessagesAround`):

```ts
describe("history queries", () => {
  function seed() {
    const db = openConversationsDb(":memory:");
    const rows: Array<[string, string, string]> = [
      ["bot-01", "100", "pesan pertama"],
      ["bot-01", "101", "pesan kedua tentang backup"],
      ["bot-01", "102", "pesan ketiga"],
      ["bot-01", "103", "pesan keempat"],
      ["bot-02", "200", "rahasia bot lain tentang backup"],
    ];
    for (const [bot, messageId, text] of rows) {
      insertMessage(db, { ts: "2026-07-31T00:00:00Z", bot, chatId: "111", source: "user", messageId, text });
    }
    return db;
  }

  test("returns the anchor message and the ones after it", () => {
    const found = getMessagesAround(seed(), { bot: "bot-01", messageId: "101", before: 0, after: 2 });

    // "trace a few messages after the one I quoted" -- the exact request spec §9.2
    // uses as the proof that message_id is useful rather than merely stored.
    expect(found.map((m) => m.messageId)).toEqual(["101", "102", "103"]);
  });

  test("includes preceding messages when before is greater than zero, in chronological order", () => {
    const found = getMessagesAround(seed(), { bot: "bot-01", messageId: "102", before: 2, after: 1 });

    expect(found.map((m) => m.messageId)).toEqual(["100", "101", "102", "103"]);
  });

  test("an unknown message id returns nothing rather than the newest messages", () => {
    // Silently falling back to "here is some history" would let the AI answer a
    // question about a message that was never found, with confident wrong data.
    expect(getMessagesAround(seed(), { bot: "bot-01", messageId: "999", before: 5, after: 5 })).toEqual([]);
  });

  test("never returns another bot's messages, even when their ids are adjacent", () => {
    const found = getMessagesAround(seed(), { bot: "bot-01", messageId: "103", before: 0, after: 5 });

    expect(found.every((m) => m.bot === "bot-01")).toBe(true);
  });

  test("searchMessages filters by bot and honours limit", () => {
    const db = seed();

    expect(searchMessages(db, "backup").length).toBe(2); // both bots, unfiltered
    const mine = searchMessages(db, "backup", { bot: "bot-01" });
    expect(mine.length).toBe(1);
    expect(mine[0]?.bot).toBe("bot-01");
    expect(searchMessages(db, "pesan", { bot: "bot-01", limit: 2 }).length).toBe(2);
  });

  test("a malformed FTS query throws rather than corrupting results, so callers can catch it", () => {
    // Verified empirically 2026-07-31: an unbalanced double quote produces
    // SQLiteError "unterminated string". The AI supplies these keywords, so this
    // WILL happen -- main.ts turns it into an error response (see below).
    expect(() => searchMessages(seed(), 'backup"')).toThrow();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts`

Expected: FAIL — 5 failures (`getMessagesAround` is not exported; `searchMessages` ignores its options and returns rows without a `bot` field). The malformed-query test should already pass.

- [ ] **Step 3: Implement the queries**

In `fleetd/src/db/conversations-schema.ts`, import the wire type (`import type { HistoryMessage } from "../socket/protocol";`) and replace `searchMessages` with:

```ts
const HISTORY_COLUMNS = `m.id AS id, m.ts AS ts, m.bot AS bot, m.chat_id AS chatId,
  m.message_id AS messageId, m.source AS source, m.user_name AS userName, m.text AS text,
  m.reply_to AS replyTo, m.metadata AS metadata`;

/**
 * Messages around a given Telegram message id, in chronological order.
 *
 * `bot` is required, never defaulted here: K-3 puts the "default to the caller,
 * cross bots only on request" decision at the socket handler, which is the one
 * place that knows who is asking. A default in this function would silently
 * change what every existing caller of the module sees.
 *
 * Returns [] when the anchor is unknown -- deliberately NOT "the newest
 * messages", which would let the AI answer confidently about a message that was
 * never found.
 */
export function getMessagesAround(
  db: Database,
  opts: { bot: string; messageId: string; before: number; after: number }
): HistoryMessage[] {
  const anchor = db
    .query("SELECT id FROM messages WHERE bot = ? AND message_id = ? ORDER BY id DESC LIMIT 1")
    .get(opts.bot, opts.messageId) as { id: number } | null;
  if (!anchor) return [];

  const preceding = (
    opts.before > 0
      ? (db
          .query(
            `SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.bot = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`
          )
          .all(opts.bot, anchor.id, opts.before) as HistoryMessage[])
      : []
  ).reverse();

  const anchorRow = db
    .query(`SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.id = ?`)
    .get(anchor.id) as HistoryMessage;

  const following =
    opts.after > 0
      ? (db
          .query(
            `SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.bot = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?`
          )
          .all(opts.bot, anchor.id, opts.after) as HistoryMessage[])
      : [];

  return [...preceding, anchorRow, ...following];
}

/**
 * FTS5 keyword search. `opts.bot` is optional here for the same reason as above:
 * the bot-scoping decision lives at the socket handler. Existing callers that
 * pass no options keep their unfiltered behaviour.
 *
 * Throws on a malformed query (verified: an unbalanced quote gives
 * "unterminated string"). Deliberately not swallowed -- a silent [] would be
 * indistinguishable from "no matches", and the AI writes these queries.
 */
export function searchMessages(
  db: Database,
  query: string,
  opts: { bot?: string; limit?: number } = {}
): HistoryMessage[] {
  const limit = opts.limit ?? 20;
  if (opts.bot !== undefined) {
    return db
      .query(
        `SELECT ${HISTORY_COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid
         WHERE messages_fts MATCH ? AND m.bot = ? ORDER BY m.id DESC LIMIT ?`
      )
      .all(query, opts.bot, limit) as HistoryMessage[];
  }
  return db
    .query(
      `SELECT ${HISTORY_COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid
       WHERE messages_fts MATCH ? ORDER BY m.id DESC LIMIT ?`
    )
    .all(query, limit) as HistoryMessage[];
}
```

In `fleetd/src/socket/protocol.ts`, add the wire type and the two request schemas:

```ts
export const HistoryRequestSchema = z.strictObject({
  type: z.literal("history"),
  messageId: z.string().min(1),
  before: z.number().int().min(0).max(50).optional(),
  after: z.number().int().min(0).max(50).optional(),
  // Absent means "the calling bot". Naming another bot is the explicit,
  // deliberate act K-3 requires for crossing that boundary.
  bot: z.string().min(1).optional(),
});

export const SearchRequestSchema = z.strictObject({
  type: z.literal("search"),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
  bot: z.string().min(1).optional(),
});
```

Add both to `RequestSchema`'s union, export their inferred types alongside the others, and add:

```ts
export type HistoryMessage = {
  id: number;
  ts: string;
  bot: string;
  chatId: string;
  messageId: string | null;
  source: string;
  userName: string | null;
  text: string | null;
  replyTo: string | null;
  metadata: string | null;
};
```

and extend `Response`:

```ts
export type Response =
  | { ok: true; report: DoctorReport }
  | { ok: true; bot: string }
  | { ok: true; messages: HistoryMessage[] }
  | { ok: true }
  | { ok: false; error: string };
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/conversations-schema.test.ts`

Expected: PASS — 12 tests (6 from Task 2 + 6 new). **The three pre-existing FTS tests still pass**: they call `searchMessages(db, "...")` with no options, which keeps the unfiltered behaviour, and they only read `.length` and `.text`.

- [ ] **Step 5: Write the failing handler tests**

Append to `fleetd/test/main.test.ts` (extend the import on line 5 to include `handleHistoryRequest, handleSearchRequest`, and add `import { insertMessage } from "../src/db/conversations-schema";` plus `import type { BoundConnection } from "../src/socket/registry";`):

```ts
describe("history and search socket handlers (K-3: default to the caller's own bot)", () => {
  function seeded() {
    const db = openConversationsDb(":memory:");
    insertMessage(db, { ts: "t", bot: "bot-01", chatId: "111", source: "user", messageId: "100", text: "punya bot-01 tentang backup" });
    insertMessage(db, { ts: "t", bot: "bot-01", chatId: "111", source: "user", messageId: "101", text: "lanjutan bot-01" });
    insertMessage(db, { ts: "t", bot: "bot-02", chatId: "222", source: "user", messageId: "100", text: "punya bot-02 tentang backup" });
    return db;
  }
  const twoBots: Config = {
    allowFrom: ["111"],
    bots: { "bot-01": { home: "/tmp/bot-01", token: "t" }, "bot-02": { home: "/tmp/bot-02", token: "t" } },
  };
  const conn = (boundBot: string | null): BoundConnection => ({ send: () => {}, boundBot });

  test("history defaults to the calling bot and never leaks another bot's messages", () => {
    const res = handleHistoryRequest({ type: "history", messageId: "100" }, conn("bot-01"), twoBots, seeded());

    // bot-02 also has a message_id 100. Defaulting wrong here would hand one
    // bot's private conversation to another bot's AI with no one asking for it.
    expect(res).toMatchObject({ ok: true });
    const messages = (res as { ok: true; messages: any[] }).messages;
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.bot === "bot-01")).toBe(true);
    expect(messages.some((m) => m.text.includes("bot-02"))).toBe(false);
  });

  test("history crosses to another bot only when the bot parameter is given explicitly", () => {
    const res = handleHistoryRequest(
      { type: "history", messageId: "100", bot: "bot-02" },
      conn("bot-01"),
      twoBots,
      seeded()
    );

    const messages = (res as { ok: true; messages: any[] }).messages;
    expect(messages.every((m) => m.bot === "bot-02")).toBe(true);
  });

  test("search defaults to the calling bot and never leaks another bot's messages", () => {
    const res = handleSearchRequest({ type: "search", query: "backup" }, conn("bot-01"), twoBots, seeded());

    const messages = (res as { ok: true; messages: any[] }).messages;
    // Both bots have a message containing "backup"; only one is the caller's.
    expect(messages.length).toBe(1);
    expect(messages[0].bot).toBe("bot-01");
  });

  test("a connection that never said hello cannot read any history at all", () => {
    expect(handleHistoryRequest({ type: "history", messageId: "100" }, conn(null), twoBots, seeded()))
      .toEqual({ ok: false, error: "not_identified" });
    expect(handleSearchRequest({ type: "search", query: "backup" }, conn(null), twoBots, seeded()))
      .toEqual({ ok: false, error: "not_identified" });
  });

  test("naming a bot that is not in the config is rejected rather than silently returning nothing", () => {
    expect(
      handleSearchRequest({ type: "search", query: "backup", bot: "bot-99" }, conn("bot-01"), twoBots, seeded())
    ).toEqual({ ok: false, error: "unknown_bot" });
  });

  test("a malformed FTS query is answered with an error instead of throwing out of the handler", () => {
    // Verified: an unbalanced quote makes SQLite throw. The AI writes these
    // queries, so this is a normal input, not an exotic one. Throwing here would
    // reach the socket server's catch-all as handler_failed -- answerable, but
    // useless to the AI, which cannot tell it should just rephrase.
    const res = handleSearchRequest({ type: "search", query: 'backup"' }, conn("bot-01"), twoBots, seeded());

    expect(res).toMatchObject({ ok: false });
    expect((res as { ok: false; error: string }).error).toContain("bad_search_query");
  });
});
```

Append to `fleetd/test/socket/server.test.ts`:

```ts
  test("a history request with a bad shape is rejected by zod at the boundary", async () => {
    tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
    const sockPath = join(tmp, "fleetd.sock");
    server = startSocketServer(sockPath, testConfig, () => ({ ok: true, messages: [] }), new ConnectionRegistry());

    // after as a string, and a search with no query at all: fleetd is the single
    // point of validation, so neither may reach a handler.
    const badAfter = await sendRaw(sockPath, encode({ type: "history", messageId: "1", after: "lots" }));
    expect(JSON.parse(badAfter)).toEqual({ ok: false, error: "bad_request" });

    const noQuery = await sendRaw(sockPath, encode({ type: "search" }));
    expect(JSON.parse(noQuery)).toEqual({ ok: false, error: "bad_request" });

    const good = await sendRaw(sockPath, encode({ type: "history", messageId: "1", after: 3 }));
    expect(JSON.parse(good)).toEqual({ ok: true, messages: [] });
  });
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/main.test.ts test/socket/server.test.ts`

Expected: FAIL — 7 failures: `handleHistoryRequest`/`handleSearchRequest` are not exported (import error), and the socket test's well-formed history request is answered `bad_request` because the schemas are not in the union yet.

- [ ] **Step 7: Implement the handlers**

In `fleetd/src/main.ts`, add above `main()`:

```ts
/**
 * Resolves which bot's history a request may read.
 *
 * K-3: "default read = your own conversation; peeking at another bot goes
 * through an explicit tool." So an absent `bot` means the caller's own, and
 * naming another one is the deliberate act. An unconfigured name is an error
 * rather than an empty result -- the AI must be able to tell "no such bot" apart
 * from "nothing matched".
 */
function resolveRequestedBot(
  requested: string | undefined,
  conn: BoundConnection,
  config: Config
): { ok: true; bot: string } | { ok: false; error: string } {
  if (!conn.boundBot) return { ok: false, error: "not_identified" };
  const bot = requested ?? conn.boundBot;
  if (!(bot in config.bots)) return { ok: false, error: "unknown_bot" };
  return { ok: true, bot };
}

export function handleHistoryRequest(
  req: HistoryRequest,
  conn: BoundConnection,
  config: Config,
  db: Database
): Response {
  const target = resolveRequestedBot(req.bot, conn, config);
  if (!target.ok) return target;

  return {
    ok: true,
    messages: getMessagesAround(db, {
      bot: target.bot,
      messageId: req.messageId,
      before: req.before ?? 0,
      // Defaults to looking forward: the motivating request is "trace a few
      // messages AFTER the one I quoted" (spec §9.2).
      after: req.after ?? 10,
    }),
  };
}

export function handleSearchRequest(
  req: SearchRequest,
  conn: BoundConnection,
  config: Config,
  db: Database
): Response {
  const target = resolveRequestedBot(req.bot, conn, config);
  if (!target.ok) return target;

  try {
    return { ok: true, messages: searchMessages(db, req.query, { bot: target.bot, limit: req.limit ?? 20 }) };
  } catch (err) {
    // FTS5 rejects plenty of ordinary-looking input (an unbalanced quote, a
    // trailing AND). The AI writes these queries, so name the problem in a way
    // that tells it to rephrase rather than leaving it a generic handler crash.
    return { ok: false, error: `bad_search_query: ${err}` };
  }
}
```

Add the required imports at the top of `main.ts`:

```ts
import type { Database } from "bun:sqlite";
import type { Config } from "./config";
import type { BoundConnection } from "./socket/registry";
```

extend the existing conversations-schema import to `import { openConversationsDb, getMessagesAround, searchMessages } from "./db/conversations-schema";`, and extend the existing protocol type import to `import type { Request, Response, ButtonRow, HistoryRequest, SearchRequest } from "./socket/protocol";`. (`ConnectionRegistry` is already imported as a value from `./socket/registry`; add `BoundConnection` as a type import on that same line rather than a second import statement.)

Then wire them into the socket handler inside `main()`, right before the final `return { ok: false, error: "unknown_type" };`:

```ts
      if (req.type === "history") {
        return handleHistoryRequest(req, conn, config, conversationsDb);
      }
      if (req.type === "search") {
        return handleSearchRequest(req, conn, config, conversationsDb);
      }
```

- [ ] **Step 8: Run the fleetd suite to verify it passes**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test`

Expected: PASS — **112 tests** (99 + 6 schema + 6 handlers + 1 socket).

- [ ] **Step 9: Write the failing cc-plugin client tests**

Append to `cc-plugin/test/fleetd-client.test.ts`, inside `describe("FleetdClient", ...)`:

```ts
  test("history sends a history request and resolves with the returned messages", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    const received: any[] = [];
    const row = {
      id: 7, ts: "t", bot: "bot-01", chatId: "111", messageId: "101", source: "user",
      userName: "mirza", text: "pesan kedua", replyTo: null, metadata: null,
    };
    server = startFakeFleetd(sockPath, (line, conn) => {
      const req = JSON.parse(line);
      received.push(req);
      if (req.type === "hello") conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
      if (req.type === "history") conn.write(JSON.stringify({ ok: true, messages: [row] }) + "\n");
    });

    const client = new FleetdClient();
    await client.connect(sockPath, "/fake/cwd");
    const messages = await client.history({ messageId: "101", after: 3 });

    expect(received[1]).toEqual({ type: "history", messageId: "101", after: 3 });
    expect(messages).toEqual([row]);
    client.close();
  });

  test("search sends a search request and surfaces a rejection as an error, not an empty result", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    server = startFakeFleetd(sockPath, (line, conn) => {
      const req = JSON.parse(line);
      if (req.type === "hello") conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
      if (req.type === "search") conn.write(JSON.stringify({ ok: false, error: "bad_search_query: boom" }) + "\n");
    });

    const client = new FleetdClient();
    await client.connect(sockPath, "/fake/cwd");

    // An empty array here would tell the AI "nothing matched" for a query that
    // was never actually run.
    await expect(client.search({ query: 'backup"' })).rejects.toThrow(/bad_search_query/);
    client.close();
  });
```

- [ ] **Step 10: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test test/fleetd-client.test.ts`

Expected: FAIL — 2 failures: `client.history is not a function`, `client.search is not a function`.

- [ ] **Step 11: Implement the client methods**

In `cc-plugin/src/fleetd-client.ts`, add the type and the two methods next to `reply()`:

```ts
export type HistoryMessage = {
  id: number;
  ts: string;
  bot: string;
  chatId: string;
  messageId: string | null;
  source: string;
  userName: string | null;
  text: string | null;
  replyTo: string | null;
  metadata: string | null;
};

type MessagesResponse = { ok: true; messages: HistoryMessage[] } | { ok: false; error: string };
```

```ts
  private requestMessages(request: Record<string, unknown>): Promise<HistoryMessage[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("not connected"));
      this.pending.push({
        onLine: (line) => {
          const res = JSON.parse(line) as MessagesResponse;
          if (res.ok) resolve(res.messages);
          // Rejecting rather than resolving []: "the query was refused" and
          // "nothing matched" must never look the same to the AI.
          else reject(new Error(`request rejected: ${res.error}`));
        },
        onFail: reject,
      });
      this.socket.write(this.encode(request));
    });
  }

  history(opts: { messageId: string; before?: number; after?: number; bot?: string }): Promise<HistoryMessage[]> {
    return this.requestMessages({
      type: "history",
      messageId: opts.messageId,
      ...(opts.before !== undefined ? { before: opts.before } : {}),
      ...(opts.after !== undefined ? { after: opts.after } : {}),
      ...(opts.bot !== undefined ? { bot: opts.bot } : {}),
    });
  }

  search(opts: { query: string; limit?: number; bot?: string }): Promise<HistoryMessage[]> {
    return this.requestMessages({
      type: "search",
      query: opts.query,
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts.bot !== undefined ? { bot: opts.bot } : {}),
    });
  }
```

- [ ] **Step 12: Write the failing MCP tool tests**

Append to `cc-plugin/test/server.test.ts`, inside `describe("cc-plugin MCP server", ...)`:

```ts
  test("the read_history tool proxies to FleetdClient.history and returns the rows as JSON", async () => {
    const calls: any[] = [];
    const row = {
      id: 7, ts: "t", bot: "bot-01", chatId: "111", messageId: "101", source: "user",
      userName: "mirza", text: "pesan kedua", replyTo: null, metadata: null,
    };
    const client = fakeFleetdClient({
      history: async (opts: any) => {
        calls.push(opts);
        return [row];
      },
    });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const result: any = await mcpClient.callTool({
      name: "read_history",
      arguments: { message_id: "101", after: 3 },
    });

    // snake_case at the tool boundary (what the AI sees, matching the meta keys
    // it was given), camelCase on the wire.
    expect(calls).toEqual([{ messageId: "101", after: 3 }]);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("pesan kedua");

    await mcpClient.close();
    await server.close();
  });

  test("the search_history tool proxies to FleetdClient.search and passes an explicit bot through", async () => {
    const calls: any[] = [];
    const client = fakeFleetdClient({
      search: async (opts: any) => {
        calls.push(opts);
        return [];
      },
    });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const result: any = await mcpClient.callTool({
      name: "search_history",
      arguments: { query: "backup", bot: "bot-02" },
    });

    // Crossing to another bot happens ONLY because `bot` was named (K-3).
    expect(calls).toEqual([{ query: "backup", bot: "bot-02" }]);
    // An empty result reads as words, not as "[]" -- the AI should not have to
    // parse an empty array to learn nothing matched.
    expect(result.content[0].text).toContain("No messages");

    await mcpClient.close();
    await server.close();
  });

  test("a search that fleetd refuses comes back as a tool error, not as an empty result", async () => {
    const client = fakeFleetdClient({
      search: async () => {
        throw new Error("request rejected: bad_search_query: unterminated string");
      },
    });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const result: any = await mcpClient.callTool({ name: "search_history", arguments: { query: 'backup"' } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("bad_search_query");

    await mcpClient.close();
    await server.close();
  });
```

- [ ] **Step 13: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test`

Expected: FAIL — 3 failures, all reporting an unknown tool (`read_history` / `search_history` are not registered).

- [ ] **Step 14: Register the two tools**

In `cc-plugin/src/server.ts`, add after the `reply` tool registration:

```ts
  // Renders history rows for the AI. JSON rather than prose: this is data the AI
  // asked for, and it must be visibly data. Note that the rows contain the
  // sender's own words -- that is fine here and is NOT the SCAR-088 case, which
  // is about sender text arriving as the incoming message being acted on.
  const renderMessages = (messages: unknown[]) =>
    messages.length === 0
      ? "No messages found."
      : JSON.stringify(messages, null, 2);

  server.registerTool(
    "read_history",
    {
      description:
        "Read stored conversation history around a Telegram message id. Use this when a message quotes or replies to an earlier one and you need what came before or after it -- the quoted message's id arrives as `reply_to_message_id` in a notification's meta. Defaults to this session's own bot; pass `bot` only when deliberately looking at another bot's conversation.",
      inputSchema: {
        message_id: z.string().min(1),
        before: z.number().int().min(0).max(50).optional(),
        after: z.number().int().min(0).max(50).optional(),
        bot: z.string().min(1).optional(),
      },
    },
    async ({ message_id, before, after, bot }) => {
      const messages = await client.history({
        messageId: message_id,
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
        ...(bot !== undefined ? { bot } : {}),
      });
      return { content: [{ type: "text", text: renderMessages(messages) }] };
    }
  );

  server.registerTool(
    "search_history",
    {
      description:
        "Search stored conversation history by keyword (SQLite FTS5). Defaults to this session's own bot; pass `bot` only when deliberately searching another bot's conversation. Keep queries to plain words -- quotes and operators like AND/OR are rejected by the search engine.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
        bot: z.string().min(1).optional(),
      },
    },
    async ({ query, limit, bot }) => {
      const messages = await client.search({
        query,
        ...(limit !== undefined ? { limit } : {}),
        ...(bot !== undefined ? { bot } : {}),
      });
      return { content: [{ type: "text", text: renderMessages(messages) }] };
    }
  );
```

- [ ] **Step 15: Run both suites to verify they pass**

```bash
cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
```

Expected: PASS — **fleetd 112, cc-plugin 27** (cc-plugin: 19 baseline + 3 from Task 2 + 2 client + 3 server).

- [ ] **Step 16: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add fleetd/src cc-plugin/src fleetd/test cc-plugin/test
git commit -m "feat: expose history navigation and keyword search as MCP tools

Storing message_id without a way to use it produces a capability nobody can
reach -- the 'half-finished' pattern this whole sub-project exists to stop.

Search was nearly free: FTS5 and its three sync triggers have been live since
Tahap 1 and searchMessages() was already written, just never exposed.

Both tools default to the calling bot and cross to another only through an
explicit `bot` parameter (K-3), which also closes B-1 peek_conversation ahead of
Tahap 6. A refused FTS query comes back as an error rather than an empty result:
'the query was rejected' and 'nothing matched' must never look the same."
```

---

