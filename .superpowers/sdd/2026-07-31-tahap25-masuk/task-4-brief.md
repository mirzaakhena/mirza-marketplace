### Task 4: One failed download no longer drops the whole message (TG-105)

Small and isolated, and it comes before Task 5 because the album hardening builds directly on it. Today the download loop has no try/catch: one 404 photo means the message never reaches the AI at all.

**Files:**
- Modify: `fleetd/src/telegram/poller.ts`
- Test: `fleetd/test/telegram/poller.test.ts`

**Interfaces:**
- Consumes: `downloadToFile` and `redactToken` from `fleetd/src/telegram/media.ts`; `NormalizedMessage` (Tasks 2, 3).
- Produces:
  - `Downloadable = { url: string; fileName: string }` and `DownloadResult = { attachments: string[]; failedCount: number }`, exported from `fleetd/src/telegram/poller.ts`.
  - `downloadAll(items: Downloadable[], destDir: string): Promise<DownloadResult>`, exported from the same file. **Task 6 reuses this for documents — do not inline it.**

- [ ] **Step 1: Write the failing tests**

Append to `fleetd/test/telegram/poller.test.ts` (extend the import on line 6 to `import { handleIncomingMessage, startPolling, downloadAll, type NormalizedMessage } from "../../src/telegram/poller";`):

```ts
  test("one failed photo download no longer drops the whole message -- the good paths still arrive", async () => {
    // Serves bytes for /ok.jpg and 404s for /gone.jpg, which is exactly what a
    // photo whose Telegram file link has expired looks like.
    const server = Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname === "/gone.jpg"
          ? new Response("not found", { status: 404 })
          : new Response(new Uint8Array([9, 9, 9]), { headers: { "content-type": "image/jpeg" } }),
    });
    const conversationsDb = openConversationsDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({
        text: "tiga foto",
        photoUrls: [
          `http://localhost:${server.port}/ok.jpg`,
          `http://localhost:${server.port}/gone.jpg`,
          `http://localhost:${server.port}/ok2.jpg`,
        ],
      }),
      { config, conversationsDb, fleetDb: openFleetDb(":memory:"), registry, inboxRoot }
    );

    // The message got through. Before this change, the rejected fetch escaped
    // handleIncomingMessage and the AI never learned anything had been sent.
    expect(sent.length).toBe(1);
    expect(sent[0]?.text).toBe("tiga foto");
    // Only the failed path is missing; the two that worked are there.
    expect(sent[0]!.meta.attachments!.split(",").length).toBe(2);

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("every download failing still delivers the message, just with no attachments", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response("gone", { status: 404 }) });
    const conversationsDb = openConversationsDb(":memory:");
    const registry = new ConnectionRegistry();
    const sent: PushMessage[] = [];
    registry.register("bot-01", { send: (m) => sent.push(m), boundBot: "bot-01" });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));

    await handleIncomingMessage(
      baseMsg({ text: "foto yang hilang semua", photoUrls: [`http://localhost:${server.port}/a.jpg`] }),
      { config, conversationsDb, fleetDb: openFleetDb(":memory:"), registry, inboxRoot }
    );

    expect(sent.length).toBe(1);
    expect(sent[0]?.text).toBe("foto yang hilang semua");
    // Absent, not an empty string: an empty `attachments` would read as "there
    // is one attachment, at path ''".
    expect("attachments" in sent[0]!.meta).toBe(false);

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });

  test("downloadAll reports how many items failed, and never leaks the bot token when they do", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname.includes("bad")
          ? new Response("gone", { status: 404 })
          : new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }),
    });
    const inboxRoot = mkdtempSync(join(tmpdir(), "poller-test-"));
    const TOKEN = "8123456789:AAExampleSecretTokenValue";

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (msg: unknown) => errors.push(String(msg));
    let result;
    try {
      result = await downloadAll(
        [
          { url: `http://localhost:${server.port}/file/bot${TOKEN}/good.jpg`, fileName: "1.jpg" },
          { url: `http://localhost:${server.port}/file/bot${TOKEN}/bad.jpg`, fileName: "2.jpg" },
        ],
        inboxRoot
      );
    } finally {
      console.error = originalError;
    }

    expect(result.attachments.length).toBe(1);
    expect(result.failedCount).toBe(1);
    // A failure is logged (silence here would make a vanished photo unexplainable)
    // but the live bot token must not ride along in that log line.
    expect(errors.join("\n")).not.toContain(TOKEN);
    expect(errors.join("\n")).toContain("<redacted>");

    server.stop(true);
    rmSync(inboxRoot, { recursive: true, force: true });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test test/telegram/poller.test.ts`

Expected: FAIL — 3 failures. The first two reject out of `handleIncomingMessage` with `Media download failed: 404` (that rejection is the bug). The third fails to import `downloadAll`.

- [ ] **Step 3: Implement `downloadAll` and use it**

In `fleetd/src/telegram/poller.ts`, extend the media import to `import { downloadToFile, redactToken } from "./media";` and add above `handleIncomingMessage`:

```ts
export type Downloadable = { url: string; fileName: string };
export type DownloadResult = { attachments: string[]; failedCount: number };

/**
 * Downloads every item, tolerating per-item failure (TG-105).
 *
 * Two deliberate properties:
 *  - `Promise.allSettled`, not a sequential await loop: one rejected fetch used
 *    to escape handleIncomingMessage entirely, so a single expired photo link
 *    meant the AI never learned the message existed at all.
 *  - Results are read back in input order, so callers can rely on the surviving
 *    attachments matching the order they asked for -- which is what makes album
 *    ordering (SCAR-055a) meaningful downstream.
 */
export async function downloadAll(items: Downloadable[], destDir: string): Promise<DownloadResult> {
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const destPath = join(destDir, item.fileName);
      await downloadToFile(item.url, destPath);
      return destPath;
    })
  );

  const attachments: string[] = [];
  let failedCount = 0;
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      attachments.push(outcome.value);
    } else {
      failedCount++;
      // redactToken on the URL as well as the reason: the reason from
      // downloadToFile is already redacted, but the URL here is raw.
      console.error(
        `poller: attachment download failed (${redactToken(items[i]!.url)}): ${outcome.reason}`
      );
    }
  }
  return { attachments, failedCount };
}
```

Then replace the download block at the top of `handleIncomingMessage` (currently lines 46-51):

```ts
  const inboxDir = join(deps.inboxRoot, "inbox", msg.bot);
  const stamp = Date.now();
  const downloads: Downloadable[] = (msg.photoUrls ?? []).map((url, i) => ({
    url,
    fileName: `${stamp}-${i}.jpg`,
  }));
  const { attachments, failedCount } = await downloadAll(downloads, inboxDir);
  void failedCount; // Task 5 turns this into a user-visible notice for albums.
```

(`attachments` was previously a `const attachments: string[] = []` accumulated in the loop; the rest of the function already reads `attachments.length` and `attachments.join(",")` and needs no change.)

- [ ] **Step 4: Run the fleetd suite to verify it passes**

Run: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test`

Expected: PASS — **81 tests** (78 + 3). The two pre-existing photo tests ("downloads a single photo…", "an album (multiple photoUrls)…") must still pass unchanged — they download successfully, so `allSettled` changes nothing for them.

- [ ] **Step 5: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add fleetd/src/telegram/poller.ts fleetd/test/telegram/poller.test.ts
git commit -m "fix(fleetd): a failed attachment download no longer drops the message (TG-105)

The download loop had no per-item try/catch, so one expired photo link rejected
out of handleIncomingMessage and the AI never learned the message existed.
Promise.allSettled keeps the paths that worked, drops only the ones that did
not, and logs each failure with the bot token redacted."
```

---

