# fleetd Tahap 2 (Jalur Pesan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `fleetd` a real Telegram poller (allowlist-gated, media/album-aware, resilient) that stores every message in `conversations.db`, and build the first version of `cc-plugin` — a Claude Code plugin with an MCP server that lets an AI session reply to Telegram and receive pushed notifications when new messages arrive. Together these let the first real bot in the `mirza-bots` fleet hold an actual conversation.

**Architecture:** `fleetd` gains a `telegram/` module: one `grammy` `Bot` per configured bot (from `config.json`), each with its own resilient polling loop. Incoming updates pass through an allowlist gate, an album-debounce buffer (for multi-photo messages), and a media downloader, then land in `conversations.db` via `insertMessage` (already built in Tahap 1). The Unix socket protocol grows a `hello`/identity-binding request (per spec §5.2 — a connection declares its cwd, `fleetd` matches it to a configured bot's `home` and locks that identity to the connection) and two new message types: `reply` (plugin → fleetd, "send this text to Telegram") and `push_message` (fleetd → plugin, unsolicited — "a new message arrived"). A `ConnectionRegistry` tracks which live socket connection is bound to which bot, so the poller can push to a connected plugin immediately, or fall back to `bot_inbox` (already schema'd in Tahap 1) when no plugin is connected. `cc-plugin` is a new, separate package: an MCP server (stdio transport, talking to Claude Code the standard way) that proxies its one tool (`reply`) to `fleetd` over the same Unix socket, and forwards `push_message` as the `notifications/claude/channel` MCP notification the AI session sees as `<channel>` content.

**Tech Stack:** Same as Tahap 1 (Bun, TypeScript, no `tsconfig.json`, `bun:test`), plus `grammy` (Telegram Bot API framework, matches the old system's library choice — knowledge carried forward per K-17, not code) and `@modelcontextprotocol/sdk` (MCP server/client, stdio transport for the real plugin, `InMemoryTransport` for tests — verified this session to let a `reply` tool call and a `notifications/claude/channel` push both be tested end-to-end without a live Claude Code host).

## Global Constraints

- **No Claude Agent SDK / `claude -p`** anywhere (K-9). Not exercised in this stage, but no task may introduce it.
- **All persistent state under `~/.claude/mirza-bots/`** (K-1), always through `fleetd/src/paths.ts`'s functions, overridable via `MIRZA_BOTS_HOME` in every test.
- **Poller resilience is non-negotiable** (spec §4.1, confirmed against old-system code this session): retry **every** error (not just specific codes) with backoff `min(1000×attempt, 15000)`, reset attempt counter on success; `bot.catch` is mandatory (grammy's default is to crash polling on a handler throw — SCAR-061); `process.on('unhandledRejection'/'uncaughtException', ...)` logs and keeps the process alive (TG-157). **Explicitly do NOT port** the old system's "give up after 8 attempts on HTTP 409" branch — spec §4.1 states this is structurally gone now that the poller lives outside any Claude Code session (K-14), there is no more "zombie session" scenario that branch existed to protect against.
- **`fleetd` is the single point of validation** — strict `zod` parsing at every socket boundary (§5.2), same discipline as Tahap 1's `config.ts`.
- **Identity is bound to the connection, not claimed per-message** (§5.2): a long-lived socket connection (the future cc-plugin) declares its working directory once via a `hello` request; `fleetd` resolves that to a bot name by matching `config.json`'s `bots[name].home`, and locks that identity for the connection's lifetime. No request after `hello` may re-declare identity.
- **`meta` in any push notification must be `Record<string,string>`** — this is a hard constraint of Claude Code's own notification schema (SCAR-056, confirmed this session by reading the old system's exact serialization code). A single non-string value causes the **entire notification to be dropped silently**, with no error anywhere. Every multi-value field (e.g. multiple photo paths in an album) must be serialized manually (join with a delimiter, or `JSON.stringify`) before it goes into `meta`. This must have a dedicated test.
- **Two databases stay separate** (K-1 continuation from Tahap 1): this stage only writes to `conversations.db` (via the existing `insertMessage`) and `fleet.db`'s `bot_inbox` table (already schema'd). No new tables, no schema changes to either database in this stage.
- **`fleetd` remains the only thing that talks to Telegram's API.** `cc-plugin` never holds a bot token or calls Telegram directly — it only talks to `fleetd` over the Unix socket. This is what keeps tokens out of the Claude Code process's context and off disk anywhere but `config.json`.
- **`cc-plugin`'s MCP transport is stdio, not the Unix socket.** The Unix socket is `cc-plugin` ↔ `fleetd` only. Claude Code ↔ `cc-plugin` is standard MCP-over-stdio (verified against the old system's exact pattern this session) — Claude Code spawns the plugin process and talks to it via stdin/stdout, same as any other MCP server.
- **Code, comments, identifiers: English** (K-16). No `tsconfig.json`, no build step (Tahap 1 convention continues).
- **macOS-focused**, no `if (platform === 'windows')` branches (§3.3).
- **A known, intentional scope simplification for this stage:** `reply`'s target chat is "whichever chat most recently messaged this bot," tracked in memory (not persisted) and reset naturally on `fleetd` restart. There is no per-session chat routing yet — that concept doesn't exist until Tahap 4 wires up real Claude Code sessions. This is adequate for Tahap 2's acceptance test (one person, one bot, one conversation) and is explicitly **not** a final design — flag it for revisit once sessions exist.
- **Repo layout:** `fleetd/` (extended, not restructured) and a new sibling package `cc-plugin/` at the `mirza-bots` repo root, both plain `package.json` + Bun, matching Tahap 1's convention.
- **Live testing requires a real Telegram bot token**, which is not something any task in this plan can supply — the final task is explicitly a manual, human-in-the-loop step. Every other task must be fully provable by automated tests using dependency injection, `InMemoryTransport`, or a local test HTTP server standing in for Telegram's file-download API — never a real network call to Telegram in `bun test`.
- **Telegram inline keyboard buttons (added 2026-07-30, user request).** `reply` gains an optional `buttons: Array<Array<{ text: string; data: string }>>` parameter (rows of buttons), translated to grammy's `InlineKeyboard`. Pressing a button delivers a `callback_query` update, distinct from a normal message — **`ctx.answerCallbackQuery()` must be called for every callback_query, unconditionally, before any other handling.** This is not a style preference: skipping it is exactly the failure this project has already paid for once — spec §10 itself records it as a lesson from the old rewrite ("457 unit test hijau tapi `answerCallbackQuery` tak ter-port → spinner Telegram berputar selamanya" — 457 green unit tests, but the button spinner spun forever on real Telegram because nothing ever integration-tested the real callback path). Every task touching callback_query handling in this plan carries a test that asserts `answerCallbackQuery` was actually called against a fake Telegram server — not just that the handler ran.
- **What buttons do NOT include in this stage:** no button-press *enforcement* (spec §7's "reject a question with no buttons," "server adds a 'Jelaskan manual' button" are Tahap 3 concerns, layered on top of the raw button-sending capability this stage provides) and no persistent tracking of which buttons are still "live" versus stale after a bot restart (in-memory only, same spirit as the `lastChatByBot` simplification above).

---

### Task 1: Allowlist gate + album buffer

**Files:**
- Create: `fleetd/src/telegram/allowlist.ts`
- Create: `fleetd/src/telegram/album-buffer.ts`
- Test: `fleetd/test/telegram/allowlist.test.ts`
- Test: `fleetd/test/telegram/album-buffer.test.ts`

**Interfaces:**
- Produces: `isAllowed(config: Config, chatId: string): boolean` — Task 5 (poller) calls this to gate every incoming update.
- Produces: `class AlbumBuffer<T>` with `add(key: string, item: T): void` and a constructor `(debounceMs: number, hardCapMs: number, onFlush: (key: string, items: T[]) => void)` — Task 5 uses one instance per bot to group `media_group_id` photos into a single stored message.

- [ ] **Step 1: Write the failing tests**

```typescript
// fleetd/test/telegram/allowlist.test.ts
import { describe, test, expect } from "bun:test";
import { isAllowed } from "../../src/telegram/allowlist";
import type { Config } from "../../src/config";

const config: Config = {
  allowFrom: ["111", "222"],
  bots: { "bot-01": { home: "/tmp/bot-01", token: "t" } },
};

describe("allowlist", () => {
  test("allows a chat id present in allowFrom", () => {
    expect(isAllowed(config, "111")).toBe(true);
  });

  test("rejects a chat id absent from allowFrom", () => {
    expect(isAllowed(config, "999")).toBe(false);
  });

  test("rejects when allowFrom is empty", () => {
    expect(isAllowed({ ...config, allowFrom: [] }, "111")).toBe(false);
  });
});
```

```typescript
// fleetd/test/telegram/album-buffer.test.ts
import { describe, test, expect } from "bun:test";
import { AlbumBuffer } from "../../src/telegram/album-buffer";

describe("AlbumBuffer", () => {
  test("groups items added within the debounce window into one flush", async () => {
    const flushed: Array<{ key: string; items: string[] }> = [];
    const buf = new AlbumBuffer<string>(80, 5000, (key, items) => flushed.push({ key, items }));

    buf.add("album-1", "photo1");
    await new Promise((r) => setTimeout(r, 20));
    buf.add("album-1", "photo2");
    await new Promise((r) => setTimeout(r, 20));
    buf.add("album-1", "photo3");

    expect(flushed.length).toBe(0);
    await new Promise((r) => setTimeout(r, 120));
    expect(flushed).toEqual([{ key: "album-1", items: ["photo1", "photo2", "photo3"] }]);
  });

  test("flushes via hard cap even if items keep arriving faster than the debounce window", async () => {
    const flushed: Array<{ key: string; items: string[] }> = [];
    const buf = new AlbumBuffer<string>(200, 500, (key, items) => flushed.push({ key, items }));

    const interval = setInterval(() => buf.add("album-2", "p"), 100);
    await new Promise((r) => setTimeout(r, 700));
    clearInterval(interval);

    expect(flushed.length).toBe(1);
    expect(flushed[0]?.key).toBe("album-2");
    expect(flushed[0]?.items.length).toBeGreaterThanOrEqual(4);
  });

  test("different keys flush independently", async () => {
    const flushed: Array<{ key: string; items: string[] }> = [];
    const buf = new AlbumBuffer<string>(60, 5000, (key, items) => flushed.push({ key, items }));

    buf.add("a", "1");
    buf.add("b", "2");
    await new Promise((r) => setTimeout(r, 100));

    const keys = flushed.map((f) => f.key).sort();
    expect(keys).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fleetd && bun test test/telegram/allowlist.test.ts test/telegram/album-buffer.test.ts`
Expected: FAIL — `../../src/telegram/allowlist` and `../../src/telegram/album-buffer` do not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/telegram/allowlist.ts
import type { Config } from "../config";

export function isAllowed(config: Config, chatId: string): boolean {
  return config.allowFrom.includes(chatId);
}
```

```typescript
// fleetd/src/telegram/album-buffer.ts
type FlushHandler<T> = (key: string, items: T[]) => void;

type Bucket<T> = {
  items: T[];
  debounceTimer: ReturnType<typeof setTimeout>;
  hardCapTimer: ReturnType<typeof setTimeout>;
};

export class AlbumBuffer<T> {
  private buckets = new Map<string, Bucket<T>>();

  constructor(
    private debounceMs: number,
    private hardCapMs: number,
    private onFlush: FlushHandler<T>
  ) {}

  add(key: string, item: T): void {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        items: [],
        debounceTimer: setTimeout(() => this.flush(key), this.debounceMs),
        hardCapTimer: setTimeout(() => this.flush(key), this.hardCapMs),
      };
      this.buckets.set(key, bucket);
    } else {
      clearTimeout(bucket.debounceTimer);
      bucket.debounceTimer = setTimeout(() => this.flush(key), this.debounceMs);
    }
    bucket.items.push(item);
  }

  flush(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    clearTimeout(bucket.debounceTimer);
    clearTimeout(bucket.hardCapTimer);
    this.buckets.delete(key);
    this.onFlush(key, bucket.items);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fleetd && bun test test/telegram/allowlist.test.ts test/telegram/album-buffer.test.ts`
Expected: PASS — 6 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/telegram/allowlist.ts fleetd/src/telegram/album-buffer.ts fleetd/test/telegram/allowlist.test.ts fleetd/test/telegram/album-buffer.test.ts
git commit -m "feat(fleetd): allowlist gate and album debounce buffer"
```

---

### Task 2: Media downloader

**Files:**
- Create: `fleetd/src/telegram/media.ts`
- Test: `fleetd/test/telegram/media.test.ts`

**Interfaces:**
- Consumes: `inboxDir(bot: string): string` from Task 1 of Tahap 1 (`../paths`).
- Produces: `downloadToFile(url: string, destPath: string): Promise<void>` — Task 5 (poller) calls this once per photo, passing a Telegram file URL and a path under `inboxDir(bot)`.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/telegram/media.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadToFile } from "../../src/telegram/media";

let tmp: string | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  server?.stop(true);
  server = undefined;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe("downloadToFile", () => {
  test("downloads bytes to a nested path, creating directories as needed", async () => {
    server = Bun.serve({
      port: 0,
      fetch: () => new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { "content-type": "image/jpeg" } }),
    });
    tmp = mkdtempSync(join(tmpdir(), "media-test-"));
    const dest = join(tmp, "inbox", "bot-01", "photo1.jpg");

    await downloadToFile(`http://localhost:${server.port}/photo.jpg`, dest);

    expect([...readFileSync(dest)]).toEqual([1, 2, 3, 4, 5]);
  });

  test("rejects on a non-2xx response instead of writing a partial/empty file", async () => {
    server = Bun.serve({ port: 0, fetch: () => new Response("not found", { status: 404 }) });
    tmp = mkdtempSync(join(tmpdir(), "media-test-"));
    const dest = join(tmp, "missing.jpg");

    await expect(downloadToFile(`http://localhost:${server.port}/missing.jpg`, dest)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/telegram/media.test.ts`
Expected: FAIL — `../../src/telegram/media` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/telegram/media.ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Media download failed: ${res.status} ${res.statusText} (${url})`);
  }
  mkdirSync(dirname(destPath), { recursive: true });
  await Bun.write(destPath, res);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/telegram/media.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/telegram/media.ts fleetd/test/telegram/media.test.ts
git commit -m "feat(fleetd): media downloader"
```

---

### Task 3: Socket protocol v2 — identity binding, reply, push — and a connection registry

**Files:**
- Modify: `fleetd/src/socket/protocol.ts`
- Modify: `fleetd/src/socket/server.ts`
- Create: `fleetd/src/socket/registry.ts`
- Test: `fleetd/test/socket/registry.test.ts`
- Test: modify `fleetd/test/socket.test.ts` (move to `fleetd/test/socket/server.test.ts` — see Step 3 note)

**Interfaces:**
- Consumes: `Config` from Tahap 1's `../config` (to resolve `hello`'s cwd to a bot name).
- Produces:
  - New `protocol.ts` exports: `HelloRequest = { type: "hello"; cwd: string }`, `ButtonRow = Array<{ text: string; data: string }>`, `ReplyRequest = { type: "reply"; text: string; buttons?: ButtonRow[] }`, extended `Request = DoctorRequest | HelloRequest | ReplyRequest`, `PushMessage = { type: "push_message"; text: string; meta: Record<string, string> }`, extended `Response` to include `{ ok: true; bot: string }` (hello success) and `{ ok: true }` (reply accepted).
  - New `registry.ts` export: `class ConnectionRegistry` with `register(bot: string, conn: BoundConnection): void`, `unregister(bot: string, conn: BoundConnection): void`, `push(bot: string, msg: PushMessage): boolean` (returns `true` if delivered to at least one live connection, `false` if nobody is connected for that bot — Task 4's poller uses the `false` case to fall back to `bot_inbox`).
  - Modified `server.ts` exports: `Handler` now receives a second argument `conn: BoundConnection` with `conn.send(msg)` and mutable `conn.boundBot: string | null`; `startSocketServer(sockPath, config, handle, registry)` gains two parameters (`config` to resolve `hello`, `registry` to register/unregister bound connections) — Task 6 (main.ts) passes both.

- [ ] **Step 1: Write the failing registry test**

```typescript
// fleetd/test/socket/registry.test.ts
import { describe, test, expect } from "bun:test";
import { ConnectionRegistry } from "../../src/socket/registry";
import type { PushMessage } from "../../src/socket/protocol";

function fakeConn() {
  const sent: PushMessage[] = [];
  return { conn: { send: (msg: PushMessage) => sent.push(msg), boundBot: null as string | null }, sent };
}

describe("ConnectionRegistry", () => {
  test("push delivers to a registered connection and returns true", () => {
    const registry = new ConnectionRegistry();
    const { conn, sent } = fakeConn();
    registry.register("bot-01", conn);

    const msg: PushMessage = { type: "push_message", text: "hi", meta: { chat_id: "1" } };
    const delivered = registry.push("bot-01", msg);

    expect(delivered).toBe(true);
    expect(sent).toEqual([msg]);
  });

  test("push returns false when no connection is registered for that bot", () => {
    const registry = new ConnectionRegistry();
    const delivered = registry.push("bot-01", { type: "push_message", text: "hi", meta: {} });
    expect(delivered).toBe(false);
  });

  test("unregister stops further delivery to that connection", () => {
    const registry = new ConnectionRegistry();
    const { conn, sent } = fakeConn();
    registry.register("bot-01", conn);
    registry.unregister("bot-01", conn);

    const delivered = registry.push("bot-01", { type: "push_message", text: "hi", meta: {} });
    expect(delivered).toBe(false);
    expect(sent.length).toBe(0);
  });

  test("push delivers to every connection registered for the same bot", () => {
    const registry = new ConnectionRegistry();
    const a = fakeConn();
    const b = fakeConn();
    registry.register("bot-01", a.conn);
    registry.register("bot-01", b.conn);

    registry.push("bot-01", { type: "push_message", text: "hi", meta: {} });

    expect(a.sent.length).toBe(1);
    expect(b.sent.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/socket/registry.test.ts`
Expected: FAIL — `../../src/socket/registry` does not exist yet.

- [ ] **Step 3: Move the existing socket test file, then extend the protocol**

Move `fleetd/test/socket.test.ts` to `fleetd/test/socket/server.test.ts` (same content, new path — keeps all socket-related tests under `test/socket/` alongside the new `registry.test.ts`):

```bash
cd fleetd
mkdir -p test/socket
git mv test/socket.test.ts test/socket/server.test.ts
```

Update the two relative imports at the top of the moved file (they were `../src/...`, now need `../../src/...` from the deeper path):

```typescript
// fleetd/test/socket/server.test.ts — only the import lines change, rest of the file is untouched
import { describe, test, expect, afterEach } from "bun:test";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSocketServer } from "../../src/socket/server";
import { encode } from "../../src/socket/protocol";
import type { Response } from "../../src/socket/protocol";
```

Now extend the protocol file:

```typescript
// fleetd/src/socket/protocol.ts — full file after this task
export type DoctorRequest = { type: "doctor" };
export type HelloRequest = { type: "hello"; cwd: string };
export type ButtonRow = Array<{ text: string; data: string }>;
export type ReplyRequest = { type: "reply"; text: string; buttons?: ButtonRow[] };
export type Request = DoctorRequest | HelloRequest | ReplyRequest;

export type DoctorReport = {
  botCount: number;
  socketPath: string;
  fleetTables: string[];
  conversationsReady: boolean;
  version: string;
};

export type PushMessage = {
  type: "push_message";
  text: string;
  meta: Record<string, string>;
};

export type Response =
  | { ok: true; report: DoctorReport }
  | { ok: true; bot: string }
  | { ok: true }
  | { ok: false; error: string };

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

- [ ] **Step 4: Run the moved + protocol-consuming tests to confirm they still compile and pass before continuing**

Run: `cd fleetd && bun test test/socket/server.test.ts test/doctor.test.ts`
Expected: PASS — the `Response` union now has more members, but the existing `{ ok: true, report: ... }` shape used by `doctor.ts`/`server.test.ts` still type-checks and behaves identically. If this fails, stop and fix before writing the registry — do not proceed with a broken protocol change underneath you.

- [ ] **Step 5: Write the registry implementation**

```typescript
// fleetd/src/socket/registry.ts
import type { PushMessage } from "./protocol";

export type BoundConnection = {
  send: (msg: PushMessage) => void;
  boundBot: string | null;
};

export class ConnectionRegistry {
  private byBot = new Map<string, Set<BoundConnection>>();

  register(bot: string, conn: BoundConnection): void {
    let set = this.byBot.get(bot);
    if (!set) {
      set = new Set();
      this.byBot.set(bot, set);
    }
    set.add(conn);
  }

  unregister(bot: string, conn: BoundConnection): void {
    this.byBot.get(bot)?.delete(conn);
  }

  push(bot: string, msg: PushMessage): boolean {
    const set = this.byBot.get(bot);
    if (!set || set.size === 0) return false;
    for (const conn of set) conn.send(msg);
    return true;
  }
}
```

- [ ] **Step 6: Run the registry test to verify it passes**

Run: `cd fleetd && bun test test/socket/registry.test.ts`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 7: Extend the server to handle `hello` identity binding and pass connection context to the handler**

```typescript
// fleetd/src/socket/server.ts — full file after this task
import net from "node:net";
import { unlinkSync, existsSync } from "node:fs";
import { encode, tryDecode, type Request, type Response, type PushMessage } from "./protocol";
import type { Config } from "../config";
import { ConnectionRegistry, type BoundConnection } from "./registry";

export type Handler = (req: Request, conn: BoundConnection) => Response | Promise<Response>;

function resolveBotByCwd(config: Config, cwd: string): string | null {
  for (const [name, bot] of Object.entries(config.bots)) {
    if (bot.home === cwd) return name;
  }
  return null;
}

export function startSocketServer(
  sockPath: string,
  config: Config,
  handle: Handler,
  registry: ConnectionRegistry
): net.Server {
  if (existsSync(sockPath)) unlinkSync(sockPath);

  const server = net.createServer((rawConn) => {
    const conn: BoundConnection = {
      send: (msg: PushMessage) => rawConn.write(encode(msg)),
      boundBot: null,
    };

    let buf = "";
    rawConn.on("data", async (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;

        const req = tryDecode(line);
        if (!req) {
          rawConn.write(encode({ ok: false, error: "bad_request" }));
          continue;
        }

        if (req.type === "hello") {
          const bot = resolveBotByCwd(config, req.cwd);
          if (!bot) {
            rawConn.write(encode({ ok: false, error: "unknown_cwd" }));
            continue;
          }
          conn.boundBot = bot;
          registry.register(bot, conn);
          rawConn.write(encode({ ok: true, bot }));
          continue;
        }

        const res = await handle(req, conn);
        rawConn.write(encode(res));
      }
    });

    rawConn.on("close", () => {
      if (conn.boundBot) registry.unregister(conn.boundBot, conn);
    });

    rawConn.on("error", () => {
      // Client disconnected mid-write; close handler above still fires and unregisters.
    });
  });

  server.listen(sockPath);
  return server;
}
```

- [ ] **Step 8: Add `hello`/`reply` coverage to the server test file**

Append to `fleetd/test/socket/server.test.ts` (keep the existing two tests from Tahap 1 as-is; this adds new ones and updates every `startSocketServer(...)` call site in the file to the new 4-argument signature):

```typescript
// Add near the top of fleetd/test/socket/server.test.ts, alongside existing imports:
import { ConnectionRegistry } from "../../src/socket/registry";
import type { Config } from "../../src/config";

// Add this near the other test-scoped constants:
const testConfig: Config = {
  allowFrom: ["1"],
  bots: { "bot-01": { home: "/fake/bot-01/home", token: "t" } },
};

// Update every existing call in this file from:
//   startSocketServer(sockPath, () => ({ ok: true, report: {...} }))
// to:
//   startSocketServer(sockPath, testConfig, () => ({ ok: true, report: {...} }), new ConnectionRegistry())
// (the handler functions' bodies are unchanged — only the call signature grows two args)

// Then add these new tests inside the existing `describe("socket server", ...)` block:

test("hello binds a connection to the bot whose config home matches the declared cwd", async () => {
  tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
  const sockPath = join(tmp, "fleetd.sock");
  server = startSocketServer(sockPath, testConfig, () => ({ ok: true }), new ConnectionRegistry());

  const line = await sendRaw(sockPath, encode({ type: "hello", cwd: "/fake/bot-01/home" }));
  expect(JSON.parse(line)).toEqual({ ok: true, bot: "bot-01" });
});

test("hello with an unrecognized cwd is rejected", async () => {
  tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
  const sockPath = join(tmp, "fleetd.sock");
  server = startSocketServer(sockPath, testConfig, () => ({ ok: true }), new ConnectionRegistry());

  const line = await sendRaw(sockPath, encode({ type: "hello", cwd: "/nowhere" }));
  expect(JSON.parse(line)).toEqual({ ok: false, error: "unknown_cwd" });
});

test("a bound connection receives a push_message sent via the registry", async () => {
  tmp = mkdtempSync(join(tmpdir(), "mirza-bots-socket-"));
  const sockPath = join(tmp, "fleetd.sock");
  const registry = new ConnectionRegistry();
  server = startSocketServer(sockPath, testConfig, () => ({ ok: true }), registry);

  const client = net.createConnection(sockPath);
  const lines: string[] = [];
  let buf = "";
  client.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      lines.push(buf.slice(0, idx));
      buf = buf.slice(idx + 1);
    }
  });
  await new Promise<void>((resolve) => client.on("connect", resolve));

  client.write(encode({ type: "hello", cwd: "/fake/bot-01/home" }));
  await new Promise((r) => setTimeout(r, 50));
  expect(JSON.parse(lines[0]!)).toEqual({ ok: true, bot: "bot-01" });

  const delivered = registry.push("bot-01", { type: "push_message", text: "new message", meta: { chat_id: "1" } });
  expect(delivered).toBe(true);

  await new Promise((r) => setTimeout(r, 50));
  expect(JSON.parse(lines[1]!)).toEqual({ type: "push_message", text: "new message", meta: { chat_id: "1" } });

  client.end();
});
```

- [ ] **Step 9: Run the full socket test suite to verify everything passes**

Run: `cd fleetd && bun test test/socket/`
Expected: PASS — original doctor/malformed-JSON/split-chunk/multi-line tests from Tahap 1 still green, plus the 3 new hello/push tests.

- [ ] **Step 10: Run the full suite to confirm nothing else broke**

Run: `cd fleetd && bun test`
Expected: PASS. `main.ts` will currently fail to type-check/build because it still calls the old 2-argument `startSocketServer` — that's expected and fixed in Task 6. If `bun test` fails specifically because `main.ts` doesn't compile, that's fine to leave broken until Task 6; do not attempt to fix `main.ts` in this task.

- [ ] **Step 11: Commit**

```bash
cd mirza-bots
git add fleetd/src/socket/protocol.ts fleetd/src/socket/server.ts fleetd/src/socket/registry.ts fleetd/test/socket/
git commit -m "feat(fleetd): socket protocol v2 -- hello identity binding, reply, push_message, connection registry"
```

---

### Task 4: `bot_inbox` persistence helpers

**Files:**
- Create: `fleetd/src/db/bot-inbox.ts`
- Test: `fleetd/test/db/bot-inbox.test.ts`

**Interfaces:**
- Consumes: `Database` type from `bun:sqlite`, the `bot_inbox` table schema from Tahap 1's `fleet-schema.ts` (columns: `id, bot, kind, payload, delivered, created_at, delivered_at`).
- Produces: `queueMessage(db: Database, bot: string, payload: PushMessage): void`, `drainQueue(db: Database, bot: string): PushMessage[]` (returns all undelivered rows for that bot, marks them delivered, in one call) — Task 5's poller calls `queueMessage` when `registry.push` returns `false`; Task 6's `main.ts` calls `drainQueue` right after a connection sends `hello`, so anything that arrived while nobody was connected gets flushed immediately on reconnect.

- [ ] **Step 1: Write the failing test**

```typescript
// fleetd/test/db/bot-inbox.test.ts
import { describe, test, expect } from "bun:test";
import { openFleetDb } from "../../src/db/fleet-schema";
import { queueMessage, drainQueue } from "../../src/db/bot-inbox";
import type { PushMessage } from "../../src/socket/protocol";

describe("bot_inbox", () => {
  test("queued messages are returned and marked delivered by drainQueue", () => {
    const db = openFleetDb(":memory:");
    const msg: PushMessage = { type: "push_message", text: "halo", meta: { chat_id: "1" } };

    queueMessage(db, "bot-01", msg);
    const drained = drainQueue(db, "bot-01");

    expect(drained).toEqual([msg]);
  });

  test("draining twice returns nothing the second time", () => {
    const db = openFleetDb(":memory:");
    queueMessage(db, "bot-01", { type: "push_message", text: "x", meta: {} });

    drainQueue(db, "bot-01");
    const secondDrain = drainQueue(db, "bot-01");

    expect(secondDrain).toEqual([]);
  });

  test("draining preserves insertion order and only returns the requested bot's messages", () => {
    const db = openFleetDb(":memory:");
    queueMessage(db, "bot-01", { type: "push_message", text: "first", meta: {} });
    queueMessage(db, "bot-02", { type: "push_message", text: "other-bot", meta: {} });
    queueMessage(db, "bot-01", { type: "push_message", text: "second", meta: {} });

    const drained = drainQueue(db, "bot-01");

    expect(drained.map((m) => m.text)).toEqual(["first", "second"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fleetd && bun test test/db/bot-inbox.test.ts`
Expected: FAIL — `../../src/db/bot-inbox` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// fleetd/src/db/bot-inbox.ts
import type { Database } from "bun:sqlite";
import type { PushMessage } from "../socket/protocol";

export function queueMessage(db: Database, bot: string, payload: PushMessage): void {
  db.query(
    `INSERT INTO bot_inbox (bot, kind, payload, delivered, created_at) VALUES (?, ?, ?, 0, ?)`
  ).run(bot, "telegram_message", JSON.stringify(payload), new Date().toISOString());
}

export function drainQueue(db: Database, bot: string): PushMessage[] {
  const rows = db
    .query(
      `SELECT id, payload FROM bot_inbox WHERE bot = ? AND delivered = 0 ORDER BY id ASC`
    )
    .all(bot) as Array<{ id: number; payload: string }>;

  if (rows.length === 0) return [];

  const now = new Date().toISOString();
  const markDelivered = db.query(`UPDATE bot_inbox SET delivered = 1, delivered_at = ? WHERE id = ?`);
  for (const row of rows) markDelivered.run(now, row.id);

  return rows.map((row) => JSON.parse(row.payload) as PushMessage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd fleetd && bun test test/db/bot-inbox.test.ts`
Expected: PASS — 3 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add fleetd/src/db/bot-inbox.ts fleetd/test/db/bot-inbox.test.ts
git commit -m "feat(fleetd): bot_inbox queue/drain helpers"
```

---

### Task 5: Poller module

**Files:**
- Create: `fleetd/src/telegram/poller.ts`
- Test: `fleetd/test/telegram/poller.test.ts`

**Where album grouping actually lives — read before writing code:** Task 1's `AlbumBuffer` groups raw Telegram updates that share a `media_group_id` (Telegram sends each photo in an album as a *separate* update). That grouping has to happen **before** a single `NormalizedMessage` exists — one `NormalizedMessage` should represent one *already-grouped* album (or one single photo, or one text message). So `AlbumBuffer` is wired in Task 6's `main.ts`, at the grammy-adapter boundary, one `AlbumBuffer<string>` instance per bot, keyed by `media_group_id`; its `onFlush` callback is what assembles and calls `handleIncomingMessage`. This task's `handleIncomingMessage` therefore accepts a `photoUrls: string[]` (plural — zero, one, or many already-collected URLs), not a per-update single URL, and has no direct dependency on `AlbumBuffer` at all — it just downloads whatever URLs it's given and stores them as one message with N attachments.

**Interfaces:**
- Consumes: `isAllowed` (Task 1), `downloadToFile` (Task 2), `insertMessage` (Tahap 1 `../db/conversations-schema`), `ConnectionRegistry.push` (Task 3), `queueMessage` (Task 4).
- Produces:
  - `type NormalizedMessage = { bot: string; chatId: string; userId: string; userName?: string; text?: string; photoUrls?: string[]; ts: string }` — already fully grouped (an album's photos have all been collected into one `photoUrls` array by the time this shape exists). The poller's grammy adapter (Task 6) is responsible for that grouping; everything downstream works on this shape, not on grammy's types or on `media_group_id`, so it's testable without grammy, `AlbumBuffer`, or Telegram involved.
  - `async function handleIncomingMessage(msg: NormalizedMessage, deps: PollerDeps): Promise<void>` — the pure core logic (allowlist → download every URL in `photoUrls` → store one message with all attachments → push-or-queue). Fully unit-testable via dependency injection.
  - `function startPolling(bot: import("grammy").Bot, opts: { start: () => Promise<void>; sleep?: (ms: number) => Promise<void>; onGiveUp?: (err: unknown) => void }): void` — the resilient retry wrapper around `bot.start()`, with `start`/`sleep` overridable for tests. Task 6's `main.ts` calls this once per configured bot with the real `grammy` `Bot` and no overrides (defaults to real `bot.start` and real `setTimeout`-based sleep).

- [ ] **Step 1: Write the failing tests**

```typescript
// fleetd/test/telegram/poller.test.ts
import { describe, test, expect } from "bun:test";
import { openConversationsDb, searchMessages } from "../../src/db/conversations-schema";
import { openFleetDb } from "../../src/db/fleet-schema";
import { drainQueue } from "../../src/db/bot-inbox";
import { ConnectionRegistry, type BoundConnection } from "../../src/socket/registry";
import { handleIncomingMessage, startPolling, type NormalizedMessage } from "../../src/telegram/poller";
import type { Config } from "../../src/config";
import type { PushMessage } from "../../src/socket/protocol";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const config: Config = {
  allowFrom: ["111"],
  bots: { "bot-01": { home: "/tmp/bot-01", token: "t" } },
};

function baseMsg(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    bot: "bot-01",
    chatId: "111",
    userId: "111",
    userName: "mirza",
    text: "halo bot",
    ts: "2026-07-30T00:00:00Z",
    ...overrides,
  };
}

describe("handleIncomingMessage", () => {
  test("stores an allowed text message and pushes it when a connection is registered", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });

    await handleIncomingMessage(baseMsg(), {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    const hits = searchMessages(conversationsDb, "halo");
    expect(hits.length).toBe(1);
    expect(sent.length).toBe(1);
    expect(sent[0]?.text).toBe("halo bot");
  });

  test("ignores a message from a chat id not in allowFrom", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();

    await handleIncomingMessage(baseMsg({ chatId: "999", userId: "999", text: "bukan siapa-siapa" }), {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    expect(searchMessages(conversationsDb, "bukan").length).toBe(0);
  });

  test("queues to bot_inbox instead of pushing when no connection is registered", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry(); // nothing registered

    await handleIncomingMessage(baseMsg({ text: "siapa yang dengar" }), {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    const queued = drainQueue(fleetDb, "bot-01");
    expect(queued.length).toBe(1);
    expect(queued[0]?.text).toBe("siapa yang dengar");
  });

  test("downloads a single photo into the bot's inbox directory before storing", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(new Uint8Array([9, 9, 9]), { headers: { "content-type": "image/jpeg" } }),
    });
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({ text: undefined, photoUrls: [`http://localhost:${server.port}/photo.jpg`] }),
      { config, conversationsDb, fleetDb, registry, inboxRoot }
    );

    const rows = conversationsDb.query("SELECT attachments FROM messages").all() as Array<{ attachments: string }>;
    expect(rows.length).toBe(1);
    const attachments = JSON.parse(rows[0]!.attachments);
    expect(attachments.length).toBe(1);
    expect(existsSync(attachments[0])).toBe(true);
    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("an album (multiple photoUrls) downloads every photo and stores ONE message with all attachments", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(new Uint8Array([9, 9, 9]), { headers: { "content-type": "image/jpeg" } }),
    });
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({
        text: "lihat foto-foto ini",
        photoUrls: [
          `http://localhost:${server.port}/photo1.jpg`,
          `http://localhost:${server.port}/photo2.jpg`,
          `http://localhost:${server.port}/photo3.jpg`,
        ],
      }),
      { config, conversationsDb, fleetDb, registry, inboxRoot }
    );

    // Exactly ONE row, not three -- this is the whole point of grouping an album.
    const rows = conversationsDb.query("SELECT attachments FROM messages").all() as Array<{ attachments: string }>;
    expect(rows.length).toBe(1);
    const attachments = JSON.parse(rows[0]!.attachments);
    expect(attachments.length).toBe(3);
    for (const path of attachments) expect(existsSync(path)).toBe(true);

    // Exactly one push, with attachments serialized to a single string (SCAR-056:
    // meta must be Record<string,string> -- an array value would silently drop
    // the whole notification on the Claude Code side).
    expect(sent.length).toBe(1);
    expect(typeof sent[0]!.meta.attachments).toBe("string");
    expect(sent[0]!.meta.attachments!.split(",").length).toBe(3);

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("a button press (callbackData set) is stored and pushed as the pressed button's data, tagged kind=callback", async () => {
    const conversationsDb = openConversationsDb(":memory:");
    const fleetDb = openFleetDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });

    await handleIncomingMessage(baseMsg({ text: undefined, callbackData: "confirm_yes" }), {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: mkdtempSync(join(tmpdir(), "poller-test-")),
    });

    const hits = searchMessages(conversationsDb, "confirm_yes");
    expect(hits.length).toBe(1);
    expect(sent.length).toBe(1);
    expect(sent[0]?.text).toBe("confirm_yes");
    expect(sent[0]?.meta.kind).toBe("callback");
  });
});

describe("startPolling retry loop", () => {
  test("retries with backoff min(1000*attempt,15000) and resets after success, giving up only when told to", async () => {
    const delays: number[] = [];
    let calls = 0;
    const start = async () => {
      calls++;
      if (calls < 3) throw new Error("ETIMEDOUT");
      // success: resolve and don't throw again
    };
    const sleep = async (ms: number) => {
      delays.push(ms);
    };

    await new Promise<void>((resolve) => {
      startPolling({} as any, {
        start,
        sleep,
        onGiveUp: () => {
          throw new Error("should not give up in this test");
        },
      });
      // startPolling's retry loop is fire-and-forget internally; give it a tick to run.
      setTimeout(resolve, 20);
    });

    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd fleetd && bun test test/telegram/poller.test.ts`
Expected: FAIL — `../../src/telegram/poller` does not exist yet.

- [ ] **Step 3: Add the `grammy` dependency and write the implementation**

Run: `cd fleetd && bun add grammy`

```typescript
// fleetd/src/telegram/poller.ts
import type { Bot } from "grammy";
import type { Database } from "bun:sqlite";
import type { Config } from "../config";
import type { ConnectionRegistry } from "../socket/registry";
import type { PushMessage } from "../socket/protocol";
import { isAllowed } from "./allowlist";
import { downloadToFile } from "./media";
import { insertMessage } from "../db/conversations-schema";
import { queueMessage } from "../db/bot-inbox";
import { join } from "node:path";

export type NormalizedMessage = {
  bot: string;
  chatId: string;
  userId: string;
  userName?: string;
  text?: string;
  photoUrls?: string[];
  callbackData?: string;
  ts: string;
};

export type PollerDeps = {
  config: Config;
  conversationsDb: Database;
  fleetDb: Database;
  registry: ConnectionRegistry;
  inboxRoot: string;
};

export async function handleIncomingMessage(msg: NormalizedMessage, deps: PollerDeps): Promise<void> {
  if (!isAllowed(deps.config, msg.chatId)) return;

  const attachments: string[] = [];
  for (const [i, url] of (msg.photoUrls ?? []).entries()) {
    const destPath = join(deps.inboxRoot, "inbox", msg.bot, `${Date.now()}-${i}.jpg`);
    await downloadToFile(url, destPath);
    attachments.push(destPath);
  }

  // A button press has no `text` of its own -- its meaning IS the callback data
  // (e.g. "confirm_yes"). Store and push that as the message content so the AI
  // sees what was pressed; `kind: "callback"` in meta distinguishes it from a
  // message the human actually typed.
  const displayText = msg.callbackData ?? msg.text;

  insertMessage(deps.conversationsDb, {
    ts: msg.ts,
    bot: msg.bot,
    chatId: msg.chatId,
    source: "user",
    userId: msg.userId,
    userName: msg.userName,
    text: displayText,
    attachments: attachments.length > 0 ? JSON.stringify(attachments) : undefined,
  });

  const pushMsg: PushMessage = {
    type: "push_message",
    text: displayText ?? "(media)",
    meta: {
      chat_id: msg.chatId,
      user_id: msg.userId,
      ts: msg.ts,
      kind: msg.callbackData !== undefined ? "callback" : "message",
      ...(attachments.length > 0 ? { attachments: attachments.join(",") } : {}),
    },
  };

  const delivered = deps.registry.push(msg.bot, pushMsg);
  if (!delivered) {
    queueMessage(deps.fleetDb, msg.bot, pushMsg);
  }
}

export function startPolling(
  bot: Bot,
  opts: {
    start: () => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
    onGiveUp?: (err: unknown) => void;
  }
): void {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  bot.catch((err) => {
    console.error(`poller: handler error (polling continues): ${err}`);
  });

  (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await opts.start();
        return; // clean stop (e.g. bot.stop() called deliberately)
      } catch (err) {
        const delay = Math.min(1000 * attempt, 15000);
        await sleep(delay);
      }
    }
  })().catch((err) => {
    opts.onGiveUp?.(err);
  });
}
```

Note on `process.on('unhandledRejection'/'uncaughtException', ...)`: this is registered once, globally, for the whole `fleetd` process — it belongs in `main.ts` (Task 6), not per-poller here. Do not add process-wide signal handlers inside this per-bot module.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd fleetd && bun test test/telegram/poller.test.ts`
Expected: PASS — 7 tests, 0 fail.

- [ ] **Step 5: Run the full suite**

Run: `cd fleetd && bun test`
Expected: All prior tests still pass (except `main.ts`-dependent compile issues carried from Task 3, still expected until Task 6).

- [ ] **Step 6: Commit**

```bash
cd mirza-bots
git add fleetd/src/telegram/poller.ts fleetd/test/telegram/poller.test.ts fleetd/package.json fleetd/bun.lock
git commit -m "feat(fleetd): resilient poller with allowlist/media/storage/push-or-queue wiring"
```

---

### Task 6: Wire pollers + new socket handlers into `main.ts`

**Files:**
- Modify: `fleetd/src/main.ts`
- Test: `fleetd/test/e2e.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1-5 (including `AlbumBuffer` from Task 1, unused until now), plus Tahap 1's `openFleetDb`, `openConversationsDb`, `loadConfig`, `buildDoctorReport`.
- Produces: an extended `main()` that, for every bot in `config.bots`, constructs a `grammy` `Bot` with the bot's token, wires `message:text` (immediate) and `message:photo` (grouped via a per-bot `AlbumBuffer<string>` keyed by `media_group_id`, or immediate when `media_group_id` is absent) into `handleIncomingMessage`, and calls `startPolling`; plus a socket handler that now also serves `reply` requests.

**Design notes carried into Step 1:**
1. `reply`'s handler needs `conn.boundBot` (Task 3's `Handler` type is `(req, conn) => Response`, so this is available), and sending via Telegram needs a `Bot` instance per configured bot. Rather than constructing a fresh `Bot` per `reply` call, build one `Map<string, Bot>` once (shared by the polling loop and the `reply` handler).
2. `Bot` construction honors an optional `TELEGRAM_API_ROOT` env var (verified this session against a local fake Telegram server, including the `deleteWebhook` call grammy makes internally before `bot.start()`'s long-poll loop begins) so tests never touch the real Telegram API.
3. **Album grouping is real here, not deferred.** `ctx.getFile()` only returns a `file_path`; grammy has no built-in URL builder (checked its type declarations this session) — the download URL has to be built by hand as `${apiRoot}/file/bot${token}/${file_path}`, using the same `apiRoot` as `makeBot` so tests route file downloads to the fake server too. One `AlbumBuffer<string>` (holding file URLs, not full messages) is created per bot; a photo with a `media_group_id` goes into that bot's buffer keyed by the group id, and the buffer's `onFlush` is what finally calls `handleIncomingMessage` with all the group's URLs in `photoUrls`. A photo with no `media_group_id` (a single photo, not an album) skips the buffer and calls `handleIncomingMessage` immediately with a one-element `photoUrls`.
4. **Buttons, both directions.** Sending: `reply`'s optional `buttons: ButtonRow[]` is translated to a grammy `InlineKeyboard` via a small `buildInlineKeyboard` helper (verified this session: `InlineKeyboard().text(t,d)` appends to the current row, `.row()` starts a new one — the helper calls `.row()` before every row except the first). Receiving: a button press arrives as a `callback_query` update, not a `message` update, handled by a separate `bot.on("callback_query:data", ...)`. **`ctx.answerCallbackQuery()` must be called first, unconditionally, before anything else in that handler** — verified this session against a fake Telegram server (`/answerCallbackQuery` receiving the right `callback_query_id`). Skipping this is the exact scar tissue spec §10 already documents from the old rewrite.

- [ ] **Step 1: Extend `main.ts`**

```typescript
// fleetd/src/main.ts — full file after this task
import { Bot, InlineKeyboard, type Context } from "grammy";
import { ensureStateDirs, configPath, fleetDbPath, conversationsDbPath, socketPath, stateRoot } from "./paths";
import { loadConfig } from "./config";
import { openFleetDb } from "./db/fleet-schema";
import { openConversationsDb } from "./db/conversations-schema";
import { startSocketServer } from "./socket/server";
import { ConnectionRegistry } from "./socket/registry";
import { buildDoctorReport } from "./doctor";
import { handleIncomingMessage, startPolling, type NormalizedMessage } from "./telegram/poller";
import { AlbumBuffer } from "./telegram/album-buffer";
import type { Request, Response, ButtonRow } from "./socket/protocol";

const VERSION = (await import("../package.json")).version;

function apiRoot(): string {
  return process.env.TELEGRAM_API_ROOT ?? "https://api.telegram.org";
}

function makeBot(token: string): Bot {
  const root = process.env.TELEGRAM_API_ROOT;
  return root ? new Bot(token, { client: { apiRoot: root } }) : new Bot(token);
}

function fileUrl(token: string, filePath: string): string {
  return `${apiRoot()}/file/bot${token}/${filePath}`;
}

function buildInlineKeyboard(rows: ButtonRow[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const [i, row] of rows.entries()) {
    if (i > 0) kb.row();
    for (const btn of row) kb.text(btn.text, btn.data);
  }
  return kb;
}

export function main(): void {
  ensureStateDirs();
  const config = loadConfig(configPath());
  const fleetDb = openFleetDb(fleetDbPath());
  const conversationsDb = openConversationsDb(conversationsDbPath());
  const sockPath = socketPath();
  const registry = new ConnectionRegistry();

  // Track the most recent chat that messaged each bot, for `reply`'s target.
  // Intentional Tahap 2 simplification -- see plan's Global Constraints. In-memory,
  // reset on restart; superseded once real session routing lands in Tahap 4.
  const lastChatByBot = new Map<string, string>();

  process.on("unhandledRejection", (err) => {
    console.error(`fleetd: unhandled rejection (process stays alive): ${err}`);
  });
  process.on("uncaughtException", (err) => {
    console.error(`fleetd: uncaught exception (process stays alive): ${err}`);
  });

  const bots = new Map<string, Bot>();
  for (const [botName, botConfig] of Object.entries(config.bots)) {
    const bot = makeBot(botConfig.token);
    bots.set(botName, bot);

    const deps = {
      config,
      conversationsDb,
      fleetDb,
      registry,
      inboxRoot: stateRoot(),
    };

    // One album buffer per bot, keyed by Telegram's media_group_id. onFlush fires
    // once the debounce window closes (all photos of the album have arrived) or
    // the hard cap trips, and is the only place that finally builds one grouped
    // NormalizedMessage out of however many photo URLs were collected.
    const albumBuffer = new AlbumBuffer<{ ctx: Context; url: string }>(
      1500,
      8000,
      async (_mediaGroupId, items) => {
        const first = items[0]!.ctx;
        const msg: NormalizedMessage = {
          bot: botName,
          chatId: String(first.chat.id),
          userId: String(first.from?.id ?? first.chat.id),
          userName: first.from?.username,
          text: first.message.caption,
          photoUrls: items.map((i) => i.url),
          ts: new Date((first.message.date ?? Date.now() / 1000) * 1000).toISOString(),
        };
        lastChatByBot.set(botName, msg.chatId);
        await handleIncomingMessage(msg, deps);
      }
    );

    bot.on("message:text", async (ctx) => {
      const msg: NormalizedMessage = {
        bot: botName,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from?.id ?? ctx.chat.id),
        userName: ctx.from?.username,
        text: ctx.message.text,
        ts: new Date((ctx.message.date ?? Date.now() / 1000) * 1000).toISOString(),
      };
      lastChatByBot.set(botName, msg.chatId);
      await handleIncomingMessage(msg, deps);
    });

    bot.on("message:photo", async (ctx) => {
      // ctx.getFile() already resolves to the largest photo size in ctx.message.photo
      // (grammy picks photo[photo.length - 1] internally) -- no manual selection needed.
      const file = await ctx.getFile();
      if (!file.file_path) return;
      const url = fileUrl(botConfig.token, file.file_path);

      const mediaGroupId = ctx.message.media_group_id;
      if (mediaGroupId) {
        albumBuffer.add(mediaGroupId, { ctx, url });
        return;
      }

      const msg: NormalizedMessage = {
        bot: botName,
        chatId: String(ctx.chat.id),
        userId: String(ctx.from?.id ?? ctx.chat.id),
        userName: ctx.from?.username,
        text: ctx.message.caption,
        photoUrls: [url],
        ts: new Date((ctx.message.date ?? Date.now() / 1000) * 1000).toISOString(),
      };
      lastChatByBot.set(botName, msg.chatId);
      await handleIncomingMessage(msg, deps);
    });

    bot.on("callback_query:data", async (ctx) => {
      // MUST be first and unconditional -- otherwise the button spins forever on
      // the user's Telegram client. See spec §10's own recorded lesson from the
      // old rewrite (457 green unit tests, this exact call missing in production).
      await ctx.answerCallbackQuery();

      const chatId = ctx.callbackQuery.message?.chat.id ?? ctx.from.id;
      const msg: NormalizedMessage = {
        bot: botName,
        chatId: String(chatId),
        userId: String(ctx.from.id),
        userName: ctx.from.username,
        callbackData: ctx.callbackQuery.data,
        ts: new Date().toISOString(),
      };
      lastChatByBot.set(botName, msg.chatId);
      await handleIncomingMessage(msg, deps);
    });

    startPolling(bot, {
      start: () => bot.start(),
      onGiveUp: (err) => {
        console.error(`fleetd: poller for ${botName} gave up permanently: ${err}`);
      },
    });
  }

  startSocketServer(
    sockPath,
    config,
    async (req: Request, conn): Promise<Response> => {
      if (req.type === "doctor") {
        return {
          ok: true,
          report: buildDoctorReport(config, fleetDb, conversationsDb, sockPath, VERSION),
        };
      }
      if (req.type === "reply") {
        if (!conn.boundBot) return { ok: false, error: "not_identified" };
        const chatId = lastChatByBot.get(conn.boundBot);
        if (!chatId) return { ok: false, error: "no_known_chat" };
        const bot = bots.get(conn.boundBot);
        if (!bot) return { ok: false, error: "unknown_bot" };
        const replyMarkup = req.buttons ? buildInlineKeyboard(req.buttons) : undefined;
        await bot.api.sendMessage(chatId, req.text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
        return { ok: true };
      }
      return { ok: false, error: "unknown_type" };
    },
    registry
  );

  console.log(`fleetd listening on ${sockPath}, ${Object.keys(config.bots).length} bot(s) polling`);
}

if (import.meta.main) {
  main();
}
```

- [ ] **Step 2: Extend the E2E test to cover the poll → store → push and `reply` → sendMessage round trips against a fake Telegram**

`main.ts` now calls real Telegram endpoints via `grammy`. The E2E test must route those to a local fake server instead — verified this session that grammy's `apiRoot` client option (here driven by the `TELEGRAM_API_ROOT` env var `main.ts` now reads) correctly routes `getMe`, `deleteWebhook`, `getUpdates`, and `sendMessage`.

Add this fake Telegram server and the new test to `fleetd/test/e2e.test.ts`, alongside the existing `describe("fleetd end-to-end", ...)` block and its existing `beforeAll`/`afterAll`/test from Tahap 1 (which stay as-is):

```typescript
// fleetd/test/e2e.test.ts — additions on top of the Tahap 1 file

// Add near the top, with the other imports:
import { writeFileSync as overwriteConfig } from "node:fs";

// A minimal fake Telegram Bot API covering exactly the calls grammy's polling
// loop, sendMessage, and callback_query handling make: deleteWebhook (called
// once before long-polling starts), getMe (bot identity), getUpdates
// (long-poll -- serves each queued update once, in order, then empties out),
// sendMessage (records what was sent, including reply_markup for button
// tests), and answerCallbackQuery (records which callback_query_id was
// acknowledged -- this is the assertion that catches the "spinner forever"
// scar tissue if a future change ever drops the ctx.answerCallbackQuery() call).
function startFakeTelegramApi(queuedUpdates: unknown[]) {
  const sentMessages: Array<{ chat_id: string; text: string; reply_markup?: unknown }> = [];
  const answeredCallbackIds: string[] = [];
  let getUpdatesCalls = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith("/deleteWebhook")) {
        return Response.json({ ok: true, result: true });
      }
      if (url.pathname.endsWith("/getMe")) {
        return Response.json({ ok: true, result: { id: 1, is_bot: true, first_name: "test", username: "test_bot" } });
      }
      if (url.pathname.endsWith("/getUpdates")) {
        getUpdatesCalls++;
        return Response.json({ ok: true, result: getUpdatesCalls <= queuedUpdates.length ? [queuedUpdates[getUpdatesCalls - 1]] : [] });
      }
      if (url.pathname.endsWith("/sendMessage")) {
        const body = (await req.json()) as { chat_id: string; text: string; reply_markup?: unknown };
        sentMessages.push({ chat_id: String(body.chat_id), text: body.text, reply_markup: body.reply_markup });
        return Response.json({
          ok: true,
          result: { message_id: sentMessages.length, date: 0, chat: { id: body.chat_id, type: "private" }, text: body.text },
        });
      }
      if (url.pathname.endsWith("/answerCallbackQuery")) {
        const body = (await req.json()) as { callback_query_id: string };
        answeredCallbackIds.push(body.callback_query_id);
        return Response.json({ ok: true, result: true });
      }
      return Response.json({ ok: false }, { status: 404 });
    },
  });
  return { server, sentMessages, answeredCallbackIds };
}

// New describe block -- separate from Tahap 1's, so it gets its own beforeAll/afterAll
// with the fake Telegram API wired in via TELEGRAM_API_ROOT.
describe("fleetd Tahap 2 end-to-end: poll, store, push, reply", () => {
  const home = mkdtempSync(join(tmpdir(), "mirza-bots-e2e-t2-"));
  const queuedUpdate = {
    update_id: 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 111, type: "private" },
      from: { id: 111, is_bot: false, first_name: "mirza" },
      text: "halo bot",
    },
  };
  const { server: fakeTelegram, sentMessages } = startFakeTelegramApi([queuedUpdate]);

  writeFileSync(
    join(home, "config.json"),
    JSON.stringify({
      allowFrom: ["111"],
      bots: { "bot-01": { home: "/tmp/bot-01", token: "fake:token" } },
    })
  );

  const root = join(import.meta.dir, "..");
  let fleetdProc: ReturnType<typeof Bun.spawn>;

  beforeAll(() => {
    fleetdProc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: root,
      env: { ...process.env, MIRZA_BOTS_HOME: home, TELEGRAM_API_ROOT: `http://localhost:${fakeTelegram.port}` },
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  afterAll(async () => {
    fleetdProc.kill();
    fakeTelegram.stop(true);
    rmSync(home, { recursive: true, force: true });
  });

  test("an update from the fake Telegram API is stored, then reply sends via the fake API", async () => {
    // Wait for the message to be polled and stored (poll conversations.db via the
    // socket isn't wired for arbitrary queries yet, so poll the file directly for a
    // bounded time instead of sleeping a fixed guess).
    const convDbPath = join(home, "conversations.db");
    let stored = false;
    for (let waited = 0; waited < 4000 && !stored; waited += 100) {
      await Bun.sleep(100);
      if (!existsSync(convDbPath)) continue;
      const { openConversationsDb, searchMessages } = await import("../src/db/conversations-schema");
      const db = openConversationsDb(convDbPath);
      stored = searchMessages(db, "halo").length > 0;
      db.close();
    }
    expect(stored).toBe(true);

    // Trigger a reply over the socket, identified as bot-01 via hello (matching
    // config.json's bots["bot-01"].home).
    const sockPath = join(home, "fleetd.sock");
    const net = await import("node:net");
    const { encode } = await import("../src/socket/protocol");
    const client = net.createConnection(sockPath);
    const lines: string[] = [];
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    });
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(encode({ type: "hello", cwd: "/tmp/bot-01" }));
    await Bun.sleep(50);
    expect(JSON.parse(lines[0]!)).toEqual({ ok: true, bot: "bot-01" });

    client.write(encode({ type: "reply", text: "balasan AI" }));
    await Bun.sleep(50);
    expect(JSON.parse(lines[1]!)).toEqual({ ok: true });

    expect(sentMessages[0]).toEqual({ chat_id: "111", text: "balasan AI", reply_markup: undefined });
    client.end();
  });
});

// Separate describe block, its own fleetd + fake Telegram instance, dedicated to
// buttons: a callback_query update (button press) and a reply carrying buttons.
describe("fleetd Tahap 2 end-to-end: buttons", () => {
  const home = mkdtempSync(join(tmpdir(), "mirza-bots-e2e-t2-buttons-"));
  const queuedCallbackUpdate = {
    update_id: 1,
    callback_query: {
      id: "cbq-1",
      from: { id: 111, is_bot: false, first_name: "mirza" },
      message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: 111, type: "private" } },
      chat_instance: "abc",
      data: "confirm_yes",
    },
  };
  const { server: fakeTelegram, sentMessages, answeredCallbackIds } = startFakeTelegramApi([queuedCallbackUpdate]);

  writeFileSync(
    join(home, "config.json"),
    JSON.stringify({
      allowFrom: ["111"],
      bots: { "bot-01": { home: "/tmp/bot-01", token: "fake:token" } },
    })
  );

  const root = join(import.meta.dir, "..");
  let fleetdProc: ReturnType<typeof Bun.spawn>;

  beforeAll(() => {
    fleetdProc = Bun.spawn(["bun", "run", "src/main.ts"], {
      cwd: root,
      env: { ...process.env, MIRZA_BOTS_HOME: home, TELEGRAM_API_ROOT: `http://localhost:${fakeTelegram.port}` },
      stdout: "pipe",
      stderr: "pipe",
    });
  });

  afterAll(async () => {
    fleetdProc.kill();
    fakeTelegram.stop(true);
    rmSync(home, { recursive: true, force: true });
  });

  test("a button press is acknowledged via answerCallbackQuery and stored/pushed, then reply-with-buttons sends the right reply_markup", async () => {
    // The critical scar-tissue assertion: answerCallbackQuery was actually called,
    // with the exact callback_query_id from the update -- not just "the handler ran."
    let answered = false;
    for (let waited = 0; waited < 4000 && !answered; waited += 100) {
      await Bun.sleep(100);
      answered = answeredCallbackIds.includes("cbq-1");
    }
    expect(answered).toBe(true);

    // The press was stored as a message (searchable by its callback data).
    const convDbPath = join(home, "conversations.db");
    const { openConversationsDb, searchMessages } = await import("../src/db/conversations-schema");
    const db = openConversationsDb(convDbPath);
    expect(searchMessages(db, "confirm_yes").length).toBe(1);
    db.close();

    // Now send a reply WITH buttons and confirm the fake API received the right
    // inline_keyboard shape.
    const sockPath = join(home, "fleetd.sock");
    const net = await import("node:net");
    const { encode } = await import("../src/socket/protocol");
    const client = net.createConnection(sockPath);
    const lines: string[] = [];
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    });
    await new Promise<void>((resolve) => client.on("connect", resolve));
    client.write(encode({ type: "hello", cwd: "/tmp/bot-01" }));
    await Bun.sleep(50);
    expect(JSON.parse(lines[0]!)).toEqual({ ok: true, bot: "bot-01" });

    client.write(
      encode({
        type: "reply",
        text: "Pilih salah satu:",
        buttons: [[{ text: "Ya", data: "confirm_yes" }, { text: "Tidak", data: "confirm_no" }]],
      })
    );
    await Bun.sleep(50);
    expect(JSON.parse(lines[1]!)).toEqual({ ok: true });

    const sent = sentMessages.find((m) => m.text === "Pilih salah satu:");
    expect(sent?.reply_markup).toEqual({
      inline_keyboard: [[{ text: "Ya", callback_data: "confirm_yes" }, { text: "Tidak", callback_data: "confirm_no" }]],
    });

    client.end();
  });
});
```

- [ ] **Step 3: Run the full suite**

Run: `cd fleetd && bun test`
Expected: PASS, no test hits the real Telegram API (verify by checking no test's `env` lacks a fake API root — grep the test file for `api.telegram.org` and confirm zero matches).

- [ ] **Step 4: Commit**

```bash
cd mirza-bots
git add fleetd/src/main.ts fleetd/test/e2e.test.ts
git commit -m "feat(fleetd): wire pollers and reply handler into main.ts"
```

---

### Task 7: `cc-plugin` — socket client to `fleetd`

**Files:**
- Create: `cc-plugin/package.json`
- Create: `cc-plugin/src/fleetd-client.ts`
- Test: `cc-plugin/test/fleetd-client.test.ts`

**Interfaces:**
- Consumes: `fleetd`'s socket protocol (`hello`, `reply`, `push_message`) — this package does NOT import from `fleetd/` (separate deployable artifact, per spec's "cc-plugin is the only thing published to the marketplace"); it re-declares the wire types it needs locally.
- Produces: `type ButtonRow = Array<{ text: string; data: string }>`, `class FleetdClient` with `connect(sockPath: string, cwd: string): Promise<{ bot: string }>`, `reply(text: string, buttons?: ButtonRow[]): Promise<void>`, `onPush(handler: (msg: PushMessage) => void): void`, `close(): void` — Task 8's MCP server uses this as its only channel to `fleetd`.

- [ ] **Step 1: Write the failing test**

```typescript
// cc-plugin/test/fleetd-client.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import net from "node:net";
import { mkdtempSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FleetdClient } from "../src/fleetd-client";

let tmp: string;
let server: net.Server | undefined;

afterEach(() => {
  server?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function startFakeFleetd(sockPath: string, onLine: (line: string, conn: net.Socket) => void) {
  if (existsSync(sockPath)) unlinkSync(sockPath);
  const server = net.createServer((conn) => {
    let buf = "";
    conn.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        onLine(buf.slice(0, idx), conn);
        buf = buf.slice(idx + 1);
      }
    });
  });
  server.listen(sockPath);
  return server;
}

describe("FleetdClient", () => {
  test("connect sends hello and resolves with the bound bot name", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    server = startFakeFleetd(sockPath, (line, conn) => {
      const req = JSON.parse(line);
      expect(req).toEqual({ type: "hello", cwd: "/fake/cwd" });
      conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
    });

    const client = new FleetdClient();
    const result = await client.connect(sockPath, "/fake/cwd");
    expect(result).toEqual({ bot: "bot-01" });
    client.close();
  });

  test("reply sends a reply request and resolves once fleetd acknowledges", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    const received: any[] = [];
    server = startFakeFleetd(sockPath, (line, conn) => {
      const req = JSON.parse(line);
      received.push(req);
      if (req.type === "hello") conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
      if (req.type === "reply") conn.write(JSON.stringify({ ok: true }) + "\n");
    });

    const client = new FleetdClient();
    await client.connect(sockPath, "/fake/cwd");
    await client.reply("halo dari AI");

    expect(received[1]).toEqual({ type: "reply", text: "halo dari AI" });
    client.close();
  });

  test("reply with buttons includes them in the request", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    const received: any[] = [];
    server = startFakeFleetd(sockPath, (line, conn) => {
      const req = JSON.parse(line);
      received.push(req);
      if (req.type === "hello") conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
      if (req.type === "reply") conn.write(JSON.stringify({ ok: true }) + "\n");
    });

    const client = new FleetdClient();
    await client.connect(sockPath, "/fake/cwd");
    await client.reply("Pilih salah satu:", [[{ text: "Ya", data: "confirm_yes" }, { text: "Tidak", data: "confirm_no" }]]);

    expect(received[1]).toEqual({
      type: "reply",
      text: "Pilih salah satu:",
      buttons: [[{ text: "Ya", data: "confirm_yes" }, { text: "Tidak", data: "confirm_no" }]],
    });
    client.close();
  });

  test("onPush delivers a push_message the server sends unsolicited", async () => {
    tmp = mkdtempSync(join(tmpdir(), "fleetd-client-test-"));
    const sockPath = join(tmp, "fleetd.sock");
    let capturedConn: net.Socket | undefined;
    server = startFakeFleetd(sockPath, (line, conn) => {
      capturedConn = conn;
      const req = JSON.parse(line);
      if (req.type === "hello") conn.write(JSON.stringify({ ok: true, bot: "bot-01" }) + "\n");
    });

    const client = new FleetdClient();
    const pushes: any[] = [];
    client.onPush((msg) => pushes.push(msg));
    await client.connect(sockPath, "/fake/cwd");

    capturedConn!.write(JSON.stringify({ type: "push_message", text: "pesan baru", meta: { chat_id: "1" } }) + "\n");
    await new Promise((r) => setTimeout(r, 50));

    expect(pushes).toEqual([{ type: "push_message", text: "pesan baru", meta: { chat_id: "1" } }]);
    client.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/fleetd-client.test.ts`
Expected: FAIL — the `cc-plugin` package and `../src/fleetd-client` do not exist yet.

- [ ] **Step 3: Scaffold `cc-plugin/package.json` and write the implementation**

```json
{
  "name": "cc-plugin",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "bun run src/main.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0",
    "zod": "^4.4.3"
  }
}
```

Run `bun install` inside `cc-plugin/` after creating this file.

```typescript
// cc-plugin/src/fleetd-client.ts
import net from "node:net";

export type PushMessage = { type: "push_message"; text: string; meta: Record<string, string> };
export type ButtonRow = Array<{ text: string; data: string }>;
type HelloResponse = { ok: true; bot: string } | { ok: false; error: string };
type ReplyResponse = { ok: true } | { ok: false; error: string };

export class FleetdClient {
  private socket: net.Socket | undefined;
  private buf = "";
  private pending: Array<(line: string) => void> = [];
  private pushHandler: ((msg: PushMessage) => void) | undefined;

  private encode(msg: unknown): string {
    return JSON.stringify(msg) + "\n";
  }

  private handleLine(line: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (parsed.type === "push_message") {
      this.pushHandler?.(parsed as PushMessage);
      return;
    }
    const resolve = this.pending.shift();
    resolve?.(line);
  }

  connect(sockPath: string, cwd: string): Promise<{ bot: string }> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(sockPath, () => {
        this.pending.push((line) => {
          const res = JSON.parse(line) as HelloResponse;
          if (res.ok) resolve({ bot: res.bot });
          else reject(new Error(`hello rejected: ${res.error}`));
        });
        socket.write(this.encode({ type: "hello", cwd }));
      });

      socket.on("data", (chunk) => {
        this.buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = this.buf.indexOf("\n")) !== -1) {
          const line = this.buf.slice(0, idx);
          this.buf = this.buf.slice(idx + 1);
          if (line.trim()) this.handleLine(line);
        }
      });

      socket.on("close", () => {
        reject(new Error("connection closed before hello completed"));
      });
      socket.on("error", reject);

      this.socket = socket;
    });
  }

  reply(text: string, buttons?: ButtonRow[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("not connected"));
      this.pending.push((line) => {
        const res = JSON.parse(line) as ReplyResponse;
        if (res.ok) resolve();
        else reject(new Error(`reply rejected: ${res.error}`));
      });
      this.socket.write(this.encode({ type: "reply", text, ...(buttons ? { buttons } : {}) }));
    });
  }

  onPush(handler: (msg: PushMessage) => void): void {
    this.pushHandler = handler;
  }

  close(): void {
    this.socket?.end();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/fleetd-client.test.ts`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add cc-plugin/package.json cc-plugin/src/fleetd-client.ts cc-plugin/test/fleetd-client.test.ts cc-plugin/bun.lock
git commit -m "feat(cc-plugin): socket client to fleetd (hello, reply, push)"
```

---

### Task 8: `cc-plugin` — MCP server (`reply` tool + push-to-notification forwarding)

**Files:**
- Create: `cc-plugin/src/server.ts`
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: `FleetdClient` (Task 7).
- Produces: `function buildServer(client: FleetdClient): McpServer` — Task 9's entrypoint calls this and connects the result to a `StdioServerTransport`. Verified offline this session: `McpServer` + `InMemoryTransport.createLinkedPair()` + a test `Client` can exercise both the `reply` tool call and the `notifications/claude/channel` push without any live Claude Code host.

- [ ] **Step 1: Write the failing test**

```typescript
// cc-plugin/test/server.test.ts
import { describe, test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server";
import type { FleetdClient, PushMessage } from "../src/fleetd-client";

function fakeFleetdClient(overrides: Partial<FleetdClient> = {}): FleetdClient {
  return {
    connect: async () => ({ bot: "bot-01" }),
    reply: async () => {},
    onPush: () => {},
    close: () => {},
    ...overrides,
  } as unknown as FleetdClient;
}

describe("cc-plugin MCP server", () => {
  test("the reply tool proxies its text argument to FleetdClient.reply", async () => {
    const replied: string[] = [];
    const client = fakeFleetdClient({ reply: async (text: string) => { replied.push(text); } });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const result = await mcpClient.callTool({ name: "reply", arguments: { text: "halo dari AI" } });

    expect(replied).toEqual(["halo dari AI"]);
    expect(result.isError).toBeFalsy();

    await mcpClient.close();
    await server.close();
  });

  test("the reply tool passes an optional buttons argument through to FleetdClient.reply", async () => {
    const calls: Array<{ text: string; buttons?: unknown }> = [];
    const client = fakeFleetdClient({
      reply: async (text: string, buttons?: any) => {
        calls.push({ text, buttons });
      },
    });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    await mcpClient.callTool({
      name: "reply",
      arguments: {
        text: "Pilih salah satu:",
        buttons: [[{ text: "Ya", data: "confirm_yes" }, { text: "Tidak", data: "confirm_no" }]],
      },
    });

    expect(calls).toEqual([
      {
        text: "Pilih salah satu:",
        buttons: [[{ text: "Ya", data: "confirm_yes" }, { text: "Tidak", data: "confirm_no" }]],
      },
    ]);

    await mcpClient.close();
    await server.close();
  });

  test("a push_message from fleetd is forwarded as notifications/claude/channel with string-only meta", async () => {
    let capturedPushHandler: ((msg: PushMessage) => void) | undefined;
    const client = fakeFleetdClient({ onPush: (handler) => { capturedPushHandler = handler; } });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });

    let received: any = null;
    mcpClient.fallbackNotificationHandler = async (n) => {
      received = n;
    };

    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    expect(capturedPushHandler).toBeDefined();
    capturedPushHandler!({
      type: "push_message",
      text: "pesan baru dari Telegram",
      meta: { chat_id: "1", user_id: "2", ts: "2026-07-30T00:00:00Z" },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received.method).toBe("notifications/claude/channel");
    expect(received.params.content).toBe("pesan baru dari Telegram");
    for (const value of Object.values(received.params.meta)) {
      expect(typeof value).toBe("string"); // SCAR-056: every meta value must be a string
    }

    await mcpClient.close();
    await server.close();
  });

  test("a push_message meta containing a non-primitive value is serialized to a string before sending, never sent as an object/array", async () => {
    let capturedPushHandler: ((msg: PushMessage) => void) | undefined;
    const client = fakeFleetdClient({ onPush: (handler) => { capturedPushHandler = handler; } });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    let received: any = null;
    mcpClient.fallbackNotificationHandler = async (n) => {
      received = n;
    };
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    // Simulate what an album push would look like at the protocol boundary --
    // PushMessage.meta is already typed Record<string,string> upstream (fleetd side),
    // so this test exists to pin that buildServer never widens/breaks that guarantee
    // even if a future field is added; it passes an already-serialized multi-value
    // string (the realistic shape) and asserts it survives unchanged.
    capturedPushHandler!({
      type: "push_message",
      text: "album",
      meta: { chat_id: "1", attachments: "/a/1.jpg,/a/2.jpg" },
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(received.params.meta.attachments).toBe("/a/1.jpg,/a/2.jpg");

    await mcpClient.close();
    await server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/server.test.ts`
Expected: FAIL — `../src/server` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// cc-plugin/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FleetdClient } from "./fleetd-client";

export function buildServer(client: FleetdClient): McpServer {
  const server = new McpServer({ name: "cc-plugin", version: "0.1.0" });

  server.registerTool(
    "reply",
    {
      description:
        "Send a reply message to the user on Telegram. Optionally attach inline keyboard buttons as rows of {text, data} -- pressing a button delivers `data` back as the user's next message.",
      inputSchema: {
        text: z.string().min(1),
        buttons: z
          .array(z.array(z.object({ text: z.string().min(1), data: z.string().min(1) })))
          .optional(),
      },
    },
    async ({ text, buttons }) => {
      await client.reply(text, buttons);
      return { content: [{ type: "text", text: "sent" }] };
    }
  );

  client.onPush((msg) => {
    // SCAR-056: Claude Code's notification meta schema is Record<string,string>
    // strictly -- fleetd's PushMessage.meta is already typed that way, but this
    // forwarder is the last point of defense: never pass a value through unless
    // it's already a string. Anything else silently drops the WHOLE notification
    // on the Claude Code side with no error surfaced anywhere.
    const safeMeta: Record<string, string> = {};
    for (const [key, value] of Object.entries(msg.meta)) {
      safeMeta[key] = typeof value === "string" ? value : JSON.stringify(value);
    }

    server.server
      .notification({
        method: "notifications/claude/channel",
        params: { content: msg.text, meta: safeMeta },
      })
      .catch((err) => {
        console.error(`cc-plugin: failed to forward push notification: ${err}`);
      });
  });

  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/server.test.ts`
Expected: PASS — 4 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -m "feat(cc-plugin): MCP server -- reply tool, SCAR-056-safe push forwarding"
```

---

### Task 9: `cc-plugin` entrypoint + plugin manifest

**Files:**
- Create: `cc-plugin/src/main.ts`
- Create: `cc-plugin/.claude-plugin/plugin.json`
- Test: `cc-plugin/test/main.test.ts`

**Interfaces:**
- Consumes: `FleetdClient` (Task 7), `buildServer` (Task 8), `socketPath`-equivalent resolution (this package does not import `fleetd/`'s `paths.ts` — it re-derives the same `~/.claude/mirza-bots/fleetd.sock` path locally, overridable via `MIRZA_BOTS_HOME`, matching Tahap 1's env-override convention).
- Produces: `async function main(): Promise<void>` — connects `FleetdClient` using `process.cwd()` as the identity-binding cwd, builds the MCP server, connects it to a `StdioServerTransport`. This is the file Claude Code spawns.

- [ ] **Step 1: Write the failing test**

Since `main()`'s job is almost entirely "wire two already-tested pieces together and pick a transport," this task's test is a thin integration check that the pieces connect with the right arguments — not a re-test of `FleetdClient` or `buildServer`'s internals (already covered in Tasks 7-8).

```typescript
// cc-plugin/test/main.test.ts
import { describe, test, expect } from "bun:test";
import { resolveSocketPath } from "../src/main";

describe("resolveSocketPath", () => {
  test("honors MIRZA_BOTS_HOME override, same convention as fleetd", () => {
    const prev = process.env.MIRZA_BOTS_HOME;
    process.env.MIRZA_BOTS_HOME = "/tmp/fake-mirza-bots";
    try {
      expect(resolveSocketPath()).toBe("/tmp/fake-mirza-bots/fleetd.sock");
    } finally {
      if (prev === undefined) delete process.env.MIRZA_BOTS_HOME;
      else process.env.MIRZA_BOTS_HOME = prev;
    }
  });

  test("falls back to ~/.claude/mirza-bots/fleetd.sock when unset", () => {
    const prev = process.env.MIRZA_BOTS_HOME;
    delete process.env.MIRZA_BOTS_HOME;
    try {
      const home = require("node:os").homedir();
      expect(resolveSocketPath()).toBe(`${home}/.claude/mirza-bots/fleetd.sock`);
    } finally {
      if (prev !== undefined) process.env.MIRZA_BOTS_HOME = prev;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/main.test.ts`
Expected: FAIL — `../src/main` does not exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// cc-plugin/src/main.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { FleetdClient } from "./fleetd-client";
import { buildServer } from "./server";

export function resolveSocketPath(): string {
  const root = process.env.MIRZA_BOTS_HOME ?? join(homedir(), ".claude", "mirza-bots");
  return join(root, "fleetd.sock");
}

export async function main(): Promise<void> {
  const client = new FleetdClient();
  const { bot } = await client.connect(resolveSocketPath(), process.cwd());
  console.error(`cc-plugin: connected to fleetd as bot "${bot}"`);

  const server = buildServer(client);
  await server.connect(new StdioServerTransport());
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`cc-plugin: fatal startup error: ${err}`);
    process.exit(1);
  });
}
```

```json
{
  "name": "cc-plugin",
  "description": "Minimal Claude Code plugin for the mirza-bots fleet: proxies the reply tool to fleetd over a Unix socket and forwards incoming Telegram messages as notifications/claude/channel.",
  "version": "0.1.0",
  "mcpServers": {
    "cc-plugin": {
      "command": "bun",
      "args": ["run", "src/main.ts"]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/main.test.ts`
Expected: PASS — 2 tests, 0 fail.

- [ ] **Step 5: Run the full `cc-plugin` suite**

Run: `cd cc-plugin && bun test`
Expected: PASS — all `fleetd-client`, `server`, and `main` tests green.

- [ ] **Step 6: Smoke-check that all imports resolve**

Run: `cd cc-plugin && bun build src/main.ts --target=bun --outfile=/tmp/cc-plugin-smoke.js && rm /tmp/cc-plugin-smoke.js`
Expected: bundles successfully, no unresolved-import errors.

- [ ] **Step 7: Commit**

```bash
cd mirza-bots
git add cc-plugin/src/main.ts cc-plugin/.claude-plugin/plugin.json cc-plugin/test/main.test.ts
git commit -m "feat(cc-plugin): entrypoint and plugin manifest"
```

---

### Task 10: Manual live verification (requires the user's real Telegram bot token)

**This task cannot be executed by an implementer subagent alone — it needs the human partner's real bot token and, for full confidence, their participation sending a real message.** Unlike every other task in this plan, its success criterion is not "tests pass" but "a human confirms a real conversation happened." Do not mark this task complete from automated evidence alone.

- [ ] **Step 1: Confirm `config.json` is ready**

The human partner already provided two real bot tokens and their Telegram user id during this planning session (2026-07-30), registered at `~/.claude/mirza-bots/config.json` as `bot-01` (token ending `...zmnHx_w`, `home: /Users/mirza/Workspace/mirza-bots`) and `bot-02` (token ending `...G8xiUbY`, `home: /Users/mirza/Workspace/mirza-bots-02`). Before proceeding:
- Confirm `bot-02`'s `home` folder actually exists on disk (`/Users/mirza/Workspace/mirza-bots-02`) — it did not exist when this entry was written and was a placeholder guess. If the human partner intends a different folder for `bot-02`'s Claude Code session, update `config.json` to match before continuing; identity binding (Task 3/6's `hello`) requires an exact string match against whatever `cwd` that session reports.
- This task's live checks below only require `bot-01` — `bot-02` exists so a second bot is ready for whenever bot-to-bot scenarios (Tahap 5) are tested, not something this task needs to exercise.
- Re-verify `allowFrom` still contains the human partner's real Telegram user id.

- [ ] **Step 2: Start `fleetd` for real**

```bash
cd fleetd
bun run start
```

Confirm via `bun run doctor` (from Tahap 1) that it reports `botCount: 2` and the socket is listening.

- [ ] **Step 3: Load `cc-plugin` into a Claude Code session**

This requires a **separate** Claude Code session from the one executing this plan (a plugin's MCP server is only live in a session that has it configured) — this is a manual step outside the scope of any tooling in this repo. Report back to the human partner with exact instructions for how to point a Claude Code session's `.mcp.json` (or equivalent plugin-loading mechanism for their Claude Code version) at `cc-plugin/src/main.ts`, and ask them to open that session with the plugin's working directory set to the `home` path registered for `bot-01` in `config.json` (identity binding depends on this matching exactly, per Task 3/6).

- [ ] **Step 4: Send a real message and observe the round trip**

Ask the human partner to send a text message to `bot-01` on Telegram. Confirm, in order:
1. `fleetd`'s logs show the message was received and allowed through the allowlist gate.
2. A row appears in `conversations.db` (`bun run` a one-off query, or use `sqlite3 ~/.claude/mirza-bots/conversations.db "SELECT * FROM messages ORDER BY id DESC LIMIT 1"` if `sqlite3` is available).
3. The Claude Code session with `cc-plugin` loaded shows the message content (via the `notifications/claude/channel` mechanism — ask the human partner to confirm they saw it appear).
4. Ask that session's AI to reply; confirm the human partner receives the reply on Telegram.

Also send a **photo**, and separately an **album** (multiple photos in one Telegram share action), and confirm: single photo downloads into `~/.claude/mirza-bots/inbox/bot-01/` with the `messages` row's `attachments` referencing it; the album produces exactly ONE new row (not one per photo) with all photos in `attachments`.

- [ ] **Step 5: Verify buttons, including the answerCallbackQuery scar-tissue check**

Ask that session's AI to call `reply` with `buttons` (e.g. two options). Confirm:
1. The human partner sees the buttons rendered under the message on Telegram.
2. They tap one. **Immediately** (not after any delay) the button should stop showing its "loading" state on their Telegram client — this is the human-visible symptom of `ctx.answerCallbackQuery()` actually having been called; if the button spins and never resolves, that is the exact scar-tissue failure this plan's tests were written to catch, and it means something is wrong in Task 6's `callback_query:data` handler that the automated tests missed.
3. The Claude Code session sees the pressed button's `data` value arrive as a new message (via the same `notifications/claude/channel` path, tagged `kind: "callback"` in its meta).

- [ ] **Step 6: Report results honestly**

Write a short report (to the plan's SDD workspace, or directly to the human partner if executing inline) stating exactly what was confirmed and what wasn't. If any of the checks in Steps 4-5 fails, that is real information about a real gap in Tasks 1-9 — do not mark this task complete until every human-observable check is confirmed, or the specific failure is understood and reported as a concern rather than silently glossed over.
