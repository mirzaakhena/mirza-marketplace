### Task 5: Album hardening

`AlbumBuffer` today is only a timing skeleton — debounce plus a hard cap. Six behaviours the audit requires are missing (spec §5.4).

**Files:**
- Modify: `fleetd/src/telegram/album-buffer.ts`, `fleetd/src/main.ts`, `fleetd/src/telegram/poller.ts`
- Test: `fleetd/test/telegram/album-buffer.test.ts`, `fleetd/test/main.test.ts`, `fleetd/test/telegram/poller.test.ts`

**Interfaces:**
- Consumes: `downloadAll`/`DownloadResult` (Task 4), `NormalizedMessage` (Tasks 2, 3), `encodeMetadata`/`MessageMetadata` (Task 3).
- Produces:
  - `AlbumBuffer` constructor gains a **fourth, optional** parameter: `constructor(debounceMs, hardCapMs, onFlush, maxItems = 10)`. Appended last on purpose — the three existing `album-buffer.test.ts` tests construct it with three arguments and must keep compiling untouched.
  - `AlbumItem` and `buildAlbumMessage(botName: string, items: AlbumItem[]): NormalizedMessage`, exported from `fleetd/src/main.ts`.
  - `applyAlbumFailureNotice(text: string | undefined, result: DownloadResult, isAlbum: boolean): string | undefined`, exported from `fleetd/src/telegram/poller.ts`.
  - `NormalizedMessage.isAlbum?: boolean` and `.messageIds?: string[]`.
  - Push `meta` gains `album_failed_count` and `album_total_count` when part of an album failed.

- [ ] **Step 1: Write the failing cap tests**

Append to `fleetd/test/telegram/album-buffer.test.ts`:

```ts
  test("flushes immediately once maxItems is reached, without waiting for the debounce", async () => {
    const flushed: Array<{ key: string; items: string[] }> = [];
    // Long debounce on purpose: if the cap did not fire, nothing would flush
    // within this test's lifetime and the assertion would fail on an empty array.
    const buf = new AlbumBuffer<string>(5000, 60000, (key, items) => flushed.push({ key, items }), 3);

    buf.add("album-cap", "p1");
    buf.add("album-cap", "p2");
    expect(flushed.length).toBe(0);
    buf.add("album-cap", "p3");

    expect(flushed).toEqual([{ key: "album-cap", items: ["p1", "p2", "p3"] }]);
  });

  test("items arriving after a cap flush start a fresh bucket rather than being dropped", async () => {
    const flushed: Array<{ key: string; items: string[] }> = [];
    const buf = new AlbumBuffer<string>(60, 60000, (key, items) => flushed.push({ key, items }), 2);

    buf.add("album-cap", "p1");
    buf.add("album-cap", "p2"); // flushes at the cap
    buf.add("album-cap", "p3");
    await new Promise((r) => setTimeout(r, 120));

    // Telegram itself caps a media group at 10 and splits client-side, so the cap
    // is a malformed-group defence, not the normal path. Overflow items become a
    // SECOND message -- deliberately, because dropping them would lose a photo
    // the user actually sent.
    expect(flushed.map((f) => f.items)).toEqual([["p1", "p2"], ["p3"]]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/telegram/album-buffer.test.ts`

Expected: FAIL — 2 failures, both timing out on `flushed` still being empty (the 4th constructor argument is ignored, so only the 5000ms debounce would ever flush).

- [ ] **Step 3: Implement the cap**

In `fleetd/src/telegram/album-buffer.ts`, change the constructor and `add`:

```ts
  constructor(
    private debounceMs: number,
    private hardCapMs: number,
    private onFlush: FlushHandler<T>,
    // Telegram's own limit for a media group. Appended as the last parameter so
    // the three existing call sites and tests keep working unchanged.
    private maxItems: number = 10
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

    // Size cap on top of the two time caps. Without it an album was bounded only
    // by time, so a malformed or duplicated media group could grow without limit
    // and turn into one enormous message. Overflow starts a fresh bucket under
    // the same key -- a second message, never a dropped photo.
    if (bucket.items.length >= this.maxItems) this.flush(key);
  }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/telegram/album-buffer.test.ts`

Expected: PASS — 5 tests (3 existing + 2 new).

- [ ] **Step 5: Write the failing `buildAlbumMessage` tests**

Append to `fleetd/test/main.test.ts` (extend the import on line 5 to `import { deliverIncoming, normalizeMessage, buildAlbumMessage } from "../src/main";`):

```ts
describe("buildAlbumMessage", () => {
  const item = (messageId: number, url: string, caption?: string) => ({
    messageId,
    chatId: 111,
    userId: 111,
    userName: "mirza",
    dateSeconds: 1_800_000_000,
    url,
    caption,
  });

  test("orders album members by message_id ASC regardless of the order they arrived in", () => {
    const msg = buildAlbumMessage("bot-01", [
      item(103, "http://x/c.jpg"),
      item(101, "http://x/a.jpg"),
      item(102, "http://x/b.jpg"),
    ]);

    // SCAR-055a: photos arrive out of order under load, and the buffer keeps
    // arrival order. Labelling "Photo 1" against the wrong file is worse than
    // no labels at all.
    expect(msg.photoUrls).toEqual(["http://x/a.jpg", "http://x/b.jpg", "http://x/c.jpg"]);
    expect(msg.messageIds).toEqual(["101", "102", "103"]);
    // The album's own id is the first member's -- that is the id Telegram shows
    // the user when they quote the album.
    expect(msg.messageId).toBe("101");
    expect(msg.isAlbum).toBe(true);
  });

  test("no caption anywhere leaves the text empty rather than inventing one", () => {
    const msg = buildAlbumMessage("bot-01", [item(101, "http://x/a.jpg"), item(102, "http://x/b.jpg")]);

    expect(msg.text).toBeUndefined();
  });

  test("exactly one caption becomes the message text, verbatim and unlabelled", () => {
    const msg = buildAlbumMessage("bot-01", [
      item(101, "http://x/a.jpg"),
      item(102, "http://x/b.jpg", "ini foto kedua yang penting"),
    ]);

    // One caption is just the user talking about the album. Labelling it
    // "Photo 2:" would add noise to the overwhelmingly common case.
    expect(msg.text).toBe("ini foto kedua yang penting");
  });

  test("two or more captions are labelled Photo <n> in album order", () => {
    const msg = buildAlbumMessage("bot-01", [
      item(103, "http://x/c.jpg", "yang ketiga"),
      item(101, "http://x/a.jpg", "yang pertama"),
      item(102, "http://x/b.jpg"),
    ]);

    // Numbering follows the SORTED position, not the arrival position -- the
    // whole reason ordering had to be fixed first.
    expect(msg.text).toBe("Photo 1: yang pertama\nPhoto 3: yang ketiga");
  });

  test("the identity fields come from the first member, not from whichever arrived first", () => {
    const msg = buildAlbumMessage("bot-01", [item(103, "http://x/c.jpg"), item(101, "http://x/a.jpg")]);

    expect(msg.bot).toBe("bot-01");
    expect(msg.chatId).toBe("111");
    expect(msg.userId).toBe("111");
    expect(msg.userName).toBe("mirza");
    expect(msg.ts).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/main.test.ts`

Expected: FAIL — 5 failures, all on `buildAlbumMessage` not being exported from `../src/main` (import error).

- [ ] **Step 7: Implement `buildAlbumMessage` and rewire the flush**

In `fleetd/src/main.ts`, add above `main()`:

```ts
export type AlbumItem = {
  messageId: number;
  chatId: string | number;
  userId: string | number;
  userName?: string;
  dateSeconds?: number;
  url: string;
  caption?: string;
};

/**
 * Turns however many photos the buffer collected into ONE NormalizedMessage.
 *
 * Pure and exported so the ordering and caption rules are testable without
 * standing up grammy, a bot, or main() -- the flush callback itself only adapts
 * grammy contexts into AlbumItems and calls this.
 *
 * Caption rules (spec §5.4 item 4), driven by how many members carry a caption:
 *   0  -> no text at all
 *   1  -> that caption verbatim, unlabelled (the ordinary case: the user is just
 *         talking about the album)
 *   2+ -> each labelled `Photo <n>:` by its position in the SORTED album, so the
 *         AI can tell which caption belongs to which file
 * Before this, only the first member's caption survived and the rest were lost.
 */
export function buildAlbumMessage(botName: string, items: AlbumItem[]): NormalizedMessage {
  // SCAR-055a: the buffer preserves arrival order, and photos arrive out of order
  // under load. Every downstream label is only correct once this sort has run.
  const ordered = [...items].sort((a, b) => a.messageId - b.messageId);
  const first = ordered[0]!;

  const captioned = ordered
    .map((item, i) => ({ position: i + 1, caption: item.caption }))
    .filter((c): c is { position: number; caption: string } => c.caption !== undefined);

  let text: string | undefined;
  if (captioned.length === 1) text = captioned[0]!.caption;
  else if (captioned.length > 1)
    text = captioned.map((c) => `Photo ${c.position}: ${c.caption}`).join("\n");

  return {
    ...normalizeMessage(
      botName,
      {
        chatId: first.chatId,
        userId: first.userId,
        userName: first.userName,
        dateSeconds: first.dateSeconds,
        messageId: first.messageId,
      },
      { text, photoUrls: ordered.map((i) => i.url) }
    ),
    isAlbum: true,
    messageIds: ordered.map((i) => String(i.messageId)),
  };
}
```

Then replace the body of the `albumBuffer` `onFlush` callback (currently the `const first = items[0]!.ctx; await deliver(normalizeMessage(...))` block) with:

```ts
        try {
          await deliver(
            buildAlbumMessage(
              botName,
              items.map(({ ctx, url }) => ({
                messageId: ctx.message.message_id,
                chatId: ctx.chat.id,
                userId: ctx.from?.id ?? ctx.chat.id,
                userName: ctx.from?.username,
                dateSeconds: ctx.message.date,
                url,
                caption: ctx.message.caption,
              }))
            )
          );
        } catch (err) {
          console.error(`fleetd: album flush failed for ${botName}/${mediaGroupId}: ${err}`);
        }
```

and pass the cap explicitly at the construction site: `new AlbumBuffer<...>(1500, 8000, async (mediaGroupId, items) => {...}, 10)`.

- [ ] **Step 8: Run them to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/main.test.ts`

Expected: PASS — 13 tests (8 existing — 6 from baseline plus the 2 Task 2 added — and 5 new).

- [ ] **Step 9: Write the failing album-failure tests**

Append to `fleetd/test/telegram/poller.test.ts`:

```ts
  test("a partially failed album appends the failure suffix instead of silently losing photos", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname === "/gone.jpg"
          ? new Response("not found", { status: 404 })
          : new Response(new Uint8Array([9]), { headers: { "content-type": "image/jpeg" } }),
    });
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({
        text: "tiga foto",
        isAlbum: true,
        messageIds: ["101", "102", "103"],
        photoUrls: [
          `http://localhost:${server.port}/a.jpg`,
          `http://localhost:${server.port}/gone.jpg`,
          `http://localhost:${server.port}/c.jpg`,
        ],
      }),
      { config, conversationsDb: openConversationsDb(":memory:"), fleetDb: openFleetDb(":memory:"), registry, inboxRoot }
    );

    // Our own text, not the sender's -- so it may live in the content the AI
    // reads (SCAR-088 is about sender-controlled strings).
    expect(sent[0]?.text).toBe("tiga foto\n[⚠️ 1 of 3 items failed to load]");
    expect(sent[0]?.meta.album_failed_count).toBe("1");
    expect(sent[0]?.meta.album_total_count).toBe("3");

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("an album whose photos ALL fail says so, instead of arriving as a bare caption", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("gone", { status: 404 }) });
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({
        text: "lihat ini",
        isAlbum: true,
        photoUrls: [`http://localhost:${server.port}/a.jpg`, `http://localhost:${server.port}/b.jpg`],
      }),
      { config, conversationsDb: openConversationsDb(":memory:"), fleetDb: openFleetDb(":memory:"), registry, inboxRoot }
    );

    expect(sent[0]?.text).toBe("lihat ini\n⚠️ Failed to load the album photos.");

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("an album whose photos all load carries no failure notice and records its member ids", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(new Uint8Array([9]), { headers: { "content-type": "image/jpeg" } }),
    });
    const conversationsDb = openConversationsDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({
        text: "tiga foto",
        isAlbum: true,
        messageId: "101",
        messageIds: ["101", "102", "103"],
        photoUrls: [
          `http://localhost:${server.port}/a.jpg`,
          `http://localhost:${server.port}/b.jpg`,
          `http://localhost:${server.port}/c.jpg`,
        ],
      }),
      { config, conversationsDb, fleetDb: openFleetDb(":memory:"), registry, inboxRoot }
    );

    expect(sent[0]?.text).toBe("tiga foto");
    expect("album_failed_count" in sent[0]!.meta).toBe(false);
    const row = conversationsDb.query("SELECT metadata FROM messages").get() as { metadata: string };
    // Every member id is recorded, so a quote of any photo in the album can be
    // resolved back to this single row.
    expect(JSON.parse(row.metadata)).toEqual({ message_ids: ["101", "102", "103"], kind: "album" });

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });
```

- [ ] **Step 10: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/telegram/poller.test.ts`

Expected: FAIL — 3 failures: the text has no suffix / no failure notice, and `metadata` is `NULL` instead of carrying `message_ids` and `kind`.

- [ ] **Step 11: Implement the failure notices and album metadata**

In `fleetd/src/telegram/poller.ts`, add the two new fields to `NormalizedMessage`:

```ts
  // Set only by buildAlbumMessage: the album-specific text rules below must not
  // fire for an ordinary single photo, whose failure is simply a missing
  // attachment (spec §5.5).
  isAlbum?: boolean;
  messageIds?: string[];
```

Add the notice helper above `handleIncomingMessage`:

```ts
/**
 * Tells the AI when album photos went missing, instead of handing it a caption
 * with silently fewer files than the user sent.
 *
 * These strings are composed by us, not by the sender, so they are allowed in
 * the message content the AI reads -- SCAR-088 governs sender-controlled text.
 * Album-only by design: a lone photo that fails just loses its attachment.
 */
export function applyAlbumFailureNotice(
  text: string | undefined,
  result: DownloadResult,
  isAlbum: boolean
): string | undefined {
  const total = result.attachments.length + result.failedCount;
  if (!isAlbum || result.failedCount === 0 || total === 0) return text;

  const notice =
    result.attachments.length === 0
      ? "⚠️ Failed to load the album photos."
      : `[⚠️ ${result.failedCount} of ${total} items failed to load]`;

  return text !== undefined && text.length > 0 ? `${text}\n${notice}` : notice;
}
```

Then in `handleIncomingMessage`, replace `const displayText = msg.callbackData ?? msg.text;` with:

```ts
  const displayText = applyAlbumFailureNotice(
    msg.callbackData ?? msg.text,
    { attachments, failedCount },
    msg.isAlbum === true
  );
```

(and delete the `void failedCount;` line left by Task 4). Extend the `metadata` object built in Task 3:

```ts
  const metadata: MessageMetadata = {
    ...(msg.quoteText !== undefined ? { quote_text: msg.quoteText } : {}),
    ...(msg.quoteText !== undefined ? { quote_is_manual: msg.quoteIsManual === true } : {}),
    ...(msg.messageIds !== undefined ? { message_ids: msg.messageIds } : {}),
    ...(msg.isAlbum === true ? { kind: "album" as const } : {}),
  };
```

and add to `pushMsg.meta`:

```ts
      ...(failedCount > 0
        ? {
            album_failed_count: String(failedCount),
            album_total_count: String(attachments.length + failedCount),
          }
        : {}),
```

- [ ] **Step 12: Run the fleetd suite to verify it passes**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test`

Expected: PASS — **91 tests** (81 + 2 album-buffer + 5 buildAlbumMessage + 3 poller).

- [ ] **Step 13: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add fleetd/src/telegram/album-buffer.ts fleetd/src/main.ts fleetd/src/telegram/poller.ts fleetd/test
git commit -m "feat(fleetd): harden albums -- cap, ordering, captions, failure notices

Six behaviours the audit requires and the timing skeleton never had: a 10-item
size cap on top of the two time caps, message_id ASC ordering at flush
(SCAR-055a -- photos arrive out of order, and every label is wrong until this
sorts them), per-item download tolerance, the three caption rules, the partial
failure suffix, and the all-failed notice.

buildAlbumMessage is pure and exported so the ordering and caption rules are
testable without standing up grammy or main(). Overflow past the cap becomes a
second message rather than a dropped photo."
```

---

