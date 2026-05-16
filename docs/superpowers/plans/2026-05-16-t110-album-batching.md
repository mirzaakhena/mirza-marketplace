# T1.10 Album / Media Group Batching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin telegram batch album Telegram (multiple photo/document dengan `media_group_id` sama) sebagai 1 notifikasi MCP tunggal ke Claude, bukan N notifikasi terpisah.

**Architecture:** Buffer in-memory generic `createAlbumBuffer<T>` di module terpisah (`album-buffer.ts`), wired ke `bot.on('message:photo')` dan `bot.on('message:document')` di `server.ts`. Flush via debounce (400ms) atau hard cap (3000ms) atau max items (10). `handleInboundAlbum()` paralel-download semua item, log 1 row ke messages.db, dan kirim 1 MCP notification dengan `image_paths[]` + `attachments[]` + `media_group_id` di meta.

**Tech Stack:** Bun runtime, `bun:test` test framework, grammy Telegram bot SDK, `@modelcontextprotocol/sdk`, `bun:sqlite` (via existing messages-store).

**Spec reference:** `docs/superpowers/specs/2026-05-16-t110-album-batching-design.md`

---

## File Structure

**New files:**
- `plugins/telegram/album-buffer.ts` — Generic buffer module. Pure, no Telegram/MCP knowledge. Factory `createAlbumBuffer<T>` dengan `add`, `size`, `drainAll`.
- `plugins/telegram/album-buffer.test.ts` — Unit tests untuk buffer (debounce, hard cap, max items, multi-key, error isolation, drainAll).

**Modified files:**
- `plugins/telegram/server.ts` — Integration: tambah `AlbumItem` type, `handleInboundAlbum()`, `makePhotoDownloader()` helper, wire `message:photo` + `message:document` handler ke buffer, drainAll di shutdown.
- `plugins/telegram/messages-store.test.ts` — Extend dengan test untuk attachments array + metadata roundtrip.

**Untouched:**
- `plugins/telegram/messages-store.ts` — Schema sudah support `attachments TEXT` + `metadata TEXT` (JSON-serialized). Tidak perlu migration.
- Handler `voice`, `audio`, `video`, `video_note`, `sticker`, `text` — out of scope.

---

## Task 1: `album-buffer.ts` — Skeleton + first test (debounce flush)

**Files:**
- Create: `plugins/telegram/album-buffer.ts`
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `plugins/telegram/album-buffer.test.ts`:

```ts
import { test, expect, describe } from 'bun:test'
import { createAlbumBuffer } from './album-buffer'

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

describe('album-buffer: debounce flush', () => {
  test('single item flushes after debounce window', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 10,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    expect(flushed).toEqual([])
    await wait(80)
    expect(flushed).toEqual([{ key: 'A', items: [1] }])
    expect(buf.size()).toBe(0)
  })
})
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: FAIL with module not found / `createAlbumBuffer is not a function`.

- [ ] **Step 1.3: Implement minimal `createAlbumBuffer`**

Create `plugins/telegram/album-buffer.ts`:

```ts
export interface AlbumBufferOpts<T> {
  debounceMs: number
  hardCapMs: number
  maxItems: number
  onFlush: (key: string, items: T[]) => Promise<void> | void
}

export interface AlbumBuffer<T> {
  add: (key: string, item: T) => void
  size: () => number
  drainAll: () => Promise<void>
}

interface Bucket<T> {
  items: T[]
  debounceTimer: ReturnType<typeof setTimeout>
  hardTimer: ReturnType<typeof setTimeout>
}

export function createAlbumBuffer<T>(opts: AlbumBufferOpts<T>): AlbumBuffer<T> {
  const buckets = new Map<string, Bucket<T>>()

  function flush(key: string): void {
    const bucket = buckets.get(key)
    if (!bucket) return
    buckets.delete(key)
    clearTimeout(bucket.debounceTimer)
    clearTimeout(bucket.hardTimer)
    void Promise.resolve(opts.onFlush(key, bucket.items))
  }

  function add(key: string, item: T): void {
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
      return
    }
    const bucket: Bucket<T> = {
      items: [item],
      debounceTimer: setTimeout(() => flush(key), opts.debounceMs),
      hardTimer: setTimeout(() => flush(key), opts.hardCapMs),
    }
    buckets.set(key, bucket)
  }

  function size(): number {
    return buckets.size
  }

  async function drainAll(): Promise<void> {
    // Implemented in Task 7
  }

  return { add, size, drainAll }
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 1 test, 0 failures.

- [ ] **Step 1.5: Commit**

```bash
git add plugins/telegram/album-buffer.ts plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: album-buffer skeleton + debounce flush test"
```

---

## Task 2: Debounce reset on subsequent items

**Files:**
- Modify: `plugins/telegram/album-buffer.ts`
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 2.1: Write the failing test**

Append to `plugins/telegram/album-buffer.test.ts` inside the existing describe block (or add new describe `'album-buffer: debounce reset'`):

```ts
describe('album-buffer: debounce reset', () => {
  test('3 items in window flush as single batch after last item + debounce', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 10,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    await wait(20)
    buf.add('A', 2)
    await wait(20)
    buf.add('A', 3)
    expect(flushed).toEqual([])  // total elapsed ~40ms, debounce reset means we should not have flushed yet
    await wait(80)
    expect(flushed).toEqual([{ key: 'A', items: [1, 2, 3] }])
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: FAIL — flush fires too early because debounce isn't being reset.

- [ ] **Step 2.3: Update `add` to reset debounce on existing bucket**

Edit `plugins/telegram/album-buffer.ts`, replace the `existing` branch in `add()`:

```ts
    if (existing) {
      existing.items.push(item)
      clearTimeout(existing.debounceTimer)
      existing.debounceTimer = setTimeout(() => flush(key), opts.debounceMs)
      return
    }
```

(hardTimer **tidak** di-reset — itu by design.)

- [ ] **Step 2.4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 2 tests, 0 failures.

- [ ] **Step 2.5: Commit**

```bash
git add plugins/telegram/album-buffer.ts plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: debounce reset on subsequent items"
```

---

## Task 3: Hard cap timer (jaring pengaman)

**Files:**
- Modify: `plugins/telegram/album-buffer.ts` (tidak perlu, sudah diset di Task 1)
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 3.1: Write the failing test**

Append to test file:

```ts
describe('album-buffer: hard cap', () => {
  test('continuous stream flushes at hardCapMs even though debounce keeps resetting', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 80,
      hardCapMs: 200,
      maxItems: 100,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    // Stream items every 50ms — debounce (80ms) keeps resetting,
    // but hard cap (200ms) should fire and flush.
    const t0 = Date.now()
    buf.add('A', 1)
    await wait(50); buf.add('A', 2)
    await wait(50); buf.add('A', 3)
    await wait(50); buf.add('A', 4)
    await wait(50); buf.add('A', 5)
    // Total elapsed ~200ms — hard cap should have fired around now.
    await wait(100)
    const elapsed = Date.now() - t0

    expect(flushed.length).toBe(1)
    expect(flushed[0].key).toBe('A')
    expect(flushed[0].items.length).toBeGreaterThanOrEqual(4)  // 4 or 5 depending on exact timing
    expect(elapsed).toBeLessThan(400)  // sanity: didn't wait debounce
  })
})
```

- [ ] **Step 3.2: Run test to verify it passes (hard cap already wired in Task 1)**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 3 tests. Hard cap was set in Task 1 already (`setTimeout(() => flush(key), opts.hardCapMs)`); this task just validates it works under stress.

**If FAILS:** double check that `add()` is not resetting `hardTimer`. Only `debounceTimer` should be cleared/reset.

- [ ] **Step 3.3: Commit**

```bash
git add plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: hard cap timer test"
```

---

## Task 4: Max items — immediate flush

**Files:**
- Modify: `plugins/telegram/album-buffer.ts`
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
describe('album-buffer: max items', () => {
  test('reaching maxItems flushes immediately without waiting debounce', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 1000,  // intentionally long
      hardCapMs: 5000,   // intentionally long
      maxItems: 3,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    const t0 = Date.now()
    buf.add('A', 1)
    buf.add('A', 2)
    buf.add('A', 3)
    // Should flush before any timer fires.
    await wait(20)
    const elapsed = Date.now() - t0

    expect(flushed).toEqual([{ key: 'A', items: [1, 2, 3] }])
    expect(elapsed).toBeLessThan(100)  // way under debounceMs
  })

  test('item N+1 after max-flush starts a fresh bucket', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 200,
      maxItems: 2,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    buf.add('A', 2)  // triggers max-flush
    await wait(10)
    buf.add('A', 3)  // fresh bucket
    await wait(80)

    expect(flushed).toEqual([
      { key: 'A', items: [1, 2] },
      { key: 'A', items: [3] },
    ])
  })
})
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: FAIL — items keep accumulating past maxItems, no immediate flush.

- [ ] **Step 4.3: Update `add` to flush when maxItems reached**

Edit `plugins/telegram/album-buffer.ts`, replace the entire `add` function:

```ts
  function add(key: string, item: T): void {
    const existing = buckets.get(key)
    if (existing) {
      existing.items.push(item)
      clearTimeout(existing.debounceTimer)
      existing.debounceTimer = setTimeout(() => flush(key), opts.debounceMs)
      if (existing.items.length >= opts.maxItems) {
        flush(key)
      }
      return
    }
    const bucket: Bucket<T> = {
      items: [item],
      debounceTimer: setTimeout(() => flush(key), opts.debounceMs),
      hardTimer: setTimeout(() => flush(key), opts.hardCapMs),
    }
    buckets.set(key, bucket)
    if (bucket.items.length >= opts.maxItems) {
      flush(key)
    }
  }
```

(Edge case `maxItems === 1` covered by the trailing check.)

- [ ] **Step 4.4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 4.5: Commit**

```bash
git add plugins/telegram/album-buffer.ts plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: max items immediate flush"
```

---

## Task 5: Multi-key isolation

**Files:**
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 5.1: Write the test**

```ts
describe('album-buffer: multi-key isolation', () => {
  test('interleaved keys flush separately with correct items', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 100,
      onFlush: (key, items) => { flushed.push({ key, items }) },
    })

    buf.add('A', 1)
    buf.add('B', 10)
    buf.add('A', 2)
    buf.add('B', 20)
    buf.add('A', 3)
    await wait(80)

    expect(flushed).toHaveLength(2)
    const a = flushed.find(f => f.key === 'A')!
    const b = flushed.find(f => f.key === 'B')!
    expect(a.items).toEqual([1, 2, 3])
    expect(b.items).toEqual([10, 20])
  })
})
```

- [ ] **Step 5.2: Run test (should pass — Map keying already isolates)**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5.3: Commit**

```bash
git add plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: multi-key isolation test"
```

---

## Task 6: `onFlush` error isolation

**Files:**
- Modify: `plugins/telegram/album-buffer.ts`
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 6.1: Write the failing test**

```ts
describe('album-buffer: error isolation', () => {
  test('onFlush throw does not corrupt buffer state', async () => {
    const errors: unknown[] = []
    const onError = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }

    try {
      const buf = createAlbumBuffer<number>({
        debounceMs: 40,
        hardCapMs: 1000,
        maxItems: 10,
        onFlush: () => { throw new Error('boom') },
      })

      buf.add('A', 1)
      await wait(80)

      expect(buf.size()).toBe(0)
      expect(errors.length).toBeGreaterThan(0)

      // Buffer still functional after error.
      let secondCalled = false
      const buf2 = createAlbumBuffer<number>({
        debounceMs: 40,
        hardCapMs: 1000,
        maxItems: 10,
        onFlush: () => { secondCalled = true },
      })
      buf2.add('B', 2)
      await wait(80)
      expect(secondCalled).toBe(true)
    } finally {
      console.error = onError
    }
  })

  test('onFlush rejection (async throw) does not crash', async () => {
    const errors: unknown[] = []
    const onError = console.error
    console.error = (...args: unknown[]) => { errors.push(args) }

    try {
      const buf = createAlbumBuffer<number>({
        debounceMs: 40,
        hardCapMs: 1000,
        maxItems: 10,
        onFlush: async () => { throw new Error('async boom') },
      })

      buf.add('A', 1)
      await wait(80)
      // Give the rejected promise a tick to surface.
      await wait(20)

      expect(buf.size()).toBe(0)
      expect(errors.length).toBeGreaterThan(0)
    } finally {
      console.error = onError
    }
  })
})
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: FAIL — sync throw becomes unhandled, async rejection becomes unhandled rejection.

- [ ] **Step 6.3: Wrap `onFlush` call with try/catch + reject handler**

Edit `plugins/telegram/album-buffer.ts`, replace the `flush` function:

```ts
  function flush(key: string): void {
    const bucket = buckets.get(key)
    if (!bucket) return
    buckets.delete(key)
    clearTimeout(bucket.debounceTimer)
    clearTimeout(bucket.hardTimer)
    try {
      const ret = opts.onFlush(key, bucket.items)
      if (ret && typeof (ret as Promise<void>).then === 'function') {
        (ret as Promise<void>).catch(err => {
          console.error(`[album-buffer] onFlush rejected for key=${key}:`, err)
        })
      }
    } catch (err) {
      console.error(`[album-buffer] onFlush threw for key=${key}:`, err)
    }
  }
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6.5: Commit**

```bash
git add plugins/telegram/album-buffer.ts plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: onFlush error isolation"
```

---

## Task 7: `drainAll` for shutdown

**Files:**
- Modify: `plugins/telegram/album-buffer.ts`
- Test: `plugins/telegram/album-buffer.test.ts`

- [ ] **Step 7.1: Write the failing test**

```ts
describe('album-buffer: drainAll', () => {
  test('drainAll flushes all pending buckets and resolves', async () => {
    const flushed: Array<{ key: string; items: number[] }> = []
    const buf = createAlbumBuffer<number>({
      debounceMs: 1000,  // long enough that nothing flushes naturally
      hardCapMs: 5000,
      maxItems: 100,
      onFlush: async (key, items) => {
        await wait(10)
        flushed.push({ key, items })
      },
    })

    buf.add('A', 1)
    buf.add('B', 2)
    buf.add('A', 3)
    expect(buf.size()).toBe(2)

    await buf.drainAll()

    expect(buf.size()).toBe(0)
    expect(flushed).toHaveLength(2)
    expect(flushed.find(f => f.key === 'A')!.items).toEqual([1, 3])
    expect(flushed.find(f => f.key === 'B')!.items).toEqual([2])
  })

  test('drainAll on empty buffer is no-op', async () => {
    const buf = createAlbumBuffer<number>({
      debounceMs: 40,
      hardCapMs: 1000,
      maxItems: 10,
      onFlush: () => {},
    })
    await expect(buf.drainAll()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: FAIL — `drainAll` is empty stub, doesn't await pending flushes.

- [ ] **Step 7.3: Implement `drainAll`**

Edit `plugins/telegram/album-buffer.ts`, replace `drainAll`:

```ts
  async function drainAll(): Promise<void> {
    const pendingKeys = [...buckets.keys()]
    const pendingPromises: Array<Promise<unknown>> = []
    for (const key of pendingKeys) {
      const bucket = buckets.get(key)
      if (!bucket) continue
      buckets.delete(key)
      clearTimeout(bucket.debounceTimer)
      clearTimeout(bucket.hardTimer)
      try {
        const ret = opts.onFlush(key, bucket.items)
        if (ret && typeof (ret as Promise<void>).then === 'function') {
          pendingPromises.push((ret as Promise<unknown>).catch(err => {
            console.error(`[album-buffer] drainAll onFlush rejected key=${key}:`, err)
          }))
        }
      } catch (err) {
        console.error(`[album-buffer] drainAll onFlush threw key=${key}:`, err)
      }
    }
    await Promise.all(pendingPromises)
  }
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `cd plugins/telegram && bun test album-buffer.test.ts`
Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 7.5: Commit**

```bash
git add plugins/telegram/album-buffer.ts plugins/telegram/album-buffer.test.ts
git commit -m "T1.10: drainAll for shutdown"
```

---

## Task 8: Extend `messages-store.test.ts` — attachments array + metadata roundtrip

**Files:**
- Test: `plugins/telegram/messages-store.test.ts`

- [ ] **Step 8.1: Write the test**

Append to `plugins/telegram/messages-store.test.ts`:

```ts
describe('messages-store: album logging shape', () => {
  test('logInbound with multi-attachment + media_group_id metadata roundtrips', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000000,
      chat_id: 'CHAT1',
      message_id: '101',
      user_id: 'U1',
      user_name: 'alice',
      text: 'check this',
      attachments: [
        { type: 'photo', path: '/inbox/a.jpg' },
        { type: 'photo', path: '/inbox/b.jpg' },
        { type: 'document', file_id: 'DOC1', name: 'foo.pdf', mime: 'application/pdf', size: 12345 },
      ],
      metadata: {
        media_group_id: 'MG_ABC',
        message_ids: ['101', '102', '103'],
      },
    })

    const db = store._dbForTest()
    const rows = db.query('SELECT attachments, metadata FROM messages WHERE chat_id = ?').all('CHAT1') as Array<{ attachments: string; metadata: string }>
    expect(rows).toHaveLength(1)

    const att = JSON.parse(rows[0].attachments)
    expect(att).toHaveLength(3)
    expect(att[0]).toEqual({ type: 'photo', path: '/inbox/a.jpg' })
    expect(att[2]).toEqual({ type: 'document', file_id: 'DOC1', name: 'foo.pdf', mime: 'application/pdf', size: 12345 })

    const meta = JSON.parse(rows[0].metadata)
    expect(meta.media_group_id).toBe('MG_ABC')
    expect(meta.message_ids).toEqual(['101', '102', '103'])

    store.close()
  })

  test('logInbound with empty attachments array stores null (no rows lost)', () => {
    const store = createMessagesStore({ dbPath: ':memory:' })
    store.init()

    store.logInbound({
      ts: 1700000000001,
      chat_id: 'CHAT2',
      message_id: '201',
      user_id: 'U2',
      user_name: 'bob',
      text: 'no attachments',
    })

    const db = store._dbForTest()
    const rows = db.query('SELECT attachments FROM messages WHERE chat_id = ?').all('CHAT2') as Array<{ attachments: string | null }>
    expect(rows).toHaveLength(1)
    expect(rows[0].attachments).toBeNull()

    store.close()
  })
})
```

- [ ] **Step 8.2: Run test (should pass — schema already supports)**

Run: `cd plugins/telegram && bun test messages-store.test.ts`
Expected: PASS — all existing tests + 2 new. If fails, check `logInbound` signature in `messages-store.ts:10,21` accepts `attachments?: unknown[]` and `metadata?: unknown`.

- [ ] **Step 8.3: Commit**

```bash
git add plugins/telegram/messages-store.test.ts
git commit -m "T1.10: messages-store tests for multi-attachment + metadata"
```

---

## Task 9: Refactor — extract `makePhotoDownloader()` in `server.ts`

**Files:**
- Modify: `plugins/telegram/server.ts:854-878`

Pure refactor — no behavior change. Hoist the inline download closure into a named helper so both single-photo and album paths reuse it.

- [ ] **Step 9.1: Read current photo handler**

Run: `sed -n '854,878p' plugins/telegram/server.ts`

Expected: see `bot.on('message:photo', async ctx => { ... })` with inline download closure passing `path` to `handleInbound`.

- [ ] **Step 9.2: Add `makePhotoDownloader` near other helpers (after `safeName`, around line 962)**

Use Edit tool to insert before `function buildAttachmentsForLog`:

```ts
function makePhotoDownloader(ctx: Context): () => Promise<string | undefined> {
  return async () => {
    const photos = ctx.message?.photo
    if (!photos || photos.length === 0) return undefined
    const best = photos[photos.length - 1]!
    try {
      const file = await ctx.api.getFile(best.file_id)
      if (!file.file_path) return undefined
      const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`
      const res = await fetch(url)
      const buf = Buffer.from(await res.arrayBuffer())
      const ext = file.file_path.split('.').pop() ?? 'jpg'
      const path = join(INBOX_DIR, `${Date.now()}-${best.file_unique_id}.${ext}`)
      mkdirSync(INBOX_DIR, { recursive: true })
      writeFileSync(path, buf)
      return path
    } catch (err) {
      process.stderr.write(`telegram channel: photo download failed: ${err}\n`)
      return undefined
    }
  }
}
```

- [ ] **Step 9.3: Replace inline closure in `bot.on('message:photo')`**

Use Edit tool to replace lines 854-878 with:

```ts
bot.on('message:photo', async ctx => {
  const caption = ctx.message.caption ?? '(photo)'
  // Defer download until after the gate approves — any user can send photos,
  // and we don't want to burn API quota or fill the inbox for dropped messages.
  await handleInbound(ctx, caption, makePhotoDownloader(ctx))
})
```

- [ ] **Step 9.4: Type-check by starting the server briefly**

Run: `cd plugins/telegram && timeout 3 bun server.ts; echo "exit=$?"`

Expected: server starts without TypeScript errors. Will likely exit on missing env (token) — that's fine, we just need to see no compile-time issues. **Look for the absence of `error TS` or similar in stderr.** Acceptable exits: 1 (env missing), 124 (timeout).

- [ ] **Step 9.5: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.10: extract makePhotoDownloader (refactor, no behavior change)"
```

---

## Task 10: Add `AlbumItem` type + `handleInboundAlbum` to `server.ts` (unwired)

**Files:**
- Modify: `plugins/telegram/server.ts`

Add the album handler without wiring it yet. Compile must pass; nothing should call it.

- [ ] **Step 10.1: Locate `AttachmentMeta` type (line 948) and add `AlbumItem` interface after it**

Use Edit tool to insert after `name?: string\n}` (the closing of `AttachmentMeta`):

```ts
interface AlbumItem {
  msgId: number
  caption: string | undefined
  kind: 'photo' | 'document'
  download?: () => Promise<string | undefined>  // photo only
  meta?: AttachmentMeta                          // document only
}
```

- [ ] **Step 10.2: Add `handleInboundAlbum` function**

Use Edit tool to insert immediately before existing `async function handleInbound` (line 981):

```ts
async function handleInboundAlbum(
  firstCtx: Context,
  mediaGroupId: string,
  items: AlbumItem[],
): Promise<void> {
  const result = gate(firstCtx)

  if (result.action === 'drop') return

  if (result.action === 'pair') {
    const lead = result.isResend ? 'Still pending' : 'Pairing required'
    await firstCtx.reply(`${lead} — run in Claude Code:\n\n/telegram:access pair ${result.code}`)
    return
  }

  const access = result.access
  const from = firstCtx.from!
  const chat_id = String(firstCtx.chat!.id)
  const firstMsgId = items[0]!.msgId

  // Typing indicator (fire-and-forget) + ack reaction on first item only.
  void bot.api.sendChatAction(chat_id, 'typing').catch(() => {})
  if (access.ackReaction) {
    void bot.api.setMessageReaction(chat_id, firstMsgId, [
      { type: 'emoji', emoji: access.ackReaction as ReactionTypeEmoji['emoji'] },
    ]).catch(() => {})
  }

  // Parallel download. Documents are meta-only (no actual download here —
  // file_id is the deliverable, Claude calls download_attachment when needed).
  const settled = await Promise.allSettled(
    items.map(async i => {
      if (i.kind === 'photo' && i.download) {
        return { kind: 'photo' as const, path: await i.download() }
      }
      return { kind: 'document' as const, meta: i.meta }
    }),
  )

  const imagePaths: string[] = []
  const logAttachments: Array<Record<string, unknown>> = []
  const notifAttachments: Array<Record<string, unknown>> = []
  let failedCount = 0

  settled.forEach((s, idx) => {
    if (s.status === 'rejected') {
      failedCount++
      process.stderr.write(`telegram channel: album item ${idx + 1}/${items.length} failed: ${s.reason}\n`)
      return
    }
    const v = s.value
    if (v.kind === 'photo') {
      if (!v.path) {
        failedCount++
        return
      }
      imagePaths.push(v.path)
      logAttachments.push({ type: 'photo', path: v.path })
    } else if (v.kind === 'document' && v.meta) {
      const docEntry: Record<string, unknown> = {
        type: v.meta.kind,
        file_id: v.meta.file_id,
        ...(v.meta.size != null ? { size: v.meta.size } : {}),
        ...(v.meta.mime ? { mime: v.meta.mime } : {}),
        ...(v.meta.name ? { name: v.meta.name } : {}),
      }
      logAttachments.push(docEntry)
      notifAttachments.push(docEntry)
    }
  })

  const successCount = imagePaths.length + notifAttachments.length
  if (successCount === 0) {
    await firstCtx.reply('⚠️ Gagal memuat foto-foto album. Coba kirim ulang.')
    return
  }

  // Combine captions; fallback if all empty.
  const captions = items.map(i => i.caption).filter((c): c is string => Boolean(c && c.trim()))
  let combinedCaption = captions.length > 0 ? captions.join(' ').trim() : `(album of ${items.length} items)`
  if (failedCount > 0) {
    combinedCaption = `${combinedCaption}\n\n[⚠️ ${failedCount} of ${items.length} items failed to load]`
  }

  // Best-effort log — must not block notification.
  try {
    messagesStore.logInbound({
      ts: Date.now(),
      chat_id,
      message_id: String(firstMsgId),
      user_id: String(from.id),
      user_name: from.username ?? from.first_name ?? String(from.id),
      text: combinedCaption,
      attachments: logAttachments.length > 0 ? logAttachments : undefined,
      reply_to: firstCtx.message?.reply_to_message?.message_id != null
        ? String(firstCtx.message.reply_to_message.message_id)
        : undefined,
      metadata: {
        media_group_id: mediaGroupId,
        message_ids: items.map(i => String(i.msgId)),
        ...(failedCount > 0 ? { failed_count: failedCount, total_count: items.length } : {}),
      },
    })
  } catch (err) {
    process.stderr.write(`telegram channel: album logInbound failed: ${err}\n`)
  }

  mcp.notification({
    method: 'notifications/claude/channel',
    params: {
      content: combinedCaption,
      meta: {
        chat_id,
        message_id: String(firstMsgId),
        message_ids: items.map(i => String(i.msgId)),
        media_group_id: mediaGroupId,
        user: from.username ?? String(from.id),
        user_id: String(from.id),
        ts: new Date((firstCtx.message?.date ?? 0) * 1000).toISOString(),
        ...(imagePaths.length > 0 ? { image_paths: imagePaths } : {}),
        ...(notifAttachments.length > 0 ? { attachments: notifAttachments } : {}),
      },
    },
  }).catch(err => {
    process.stderr.write(`telegram channel: album mcp.notification failed: ${err}\n`)
  })
}
```

- [ ] **Step 10.3: Type-check via bun**

Run: `cd plugins/telegram && timeout 3 bun server.ts; echo "exit=$?"`

Expected: no `error TS` in stderr. Acceptable exits: 1 (env missing), 124 (timeout).

- [ ] **Step 10.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.10: add handleInboundAlbum + AlbumItem (unwired)"
```

---

## Task 11: Wire `bot.on('message:photo')` to album buffer

**Files:**
- Modify: `plugins/telegram/server.ts`

Now connect: photo handler routes by `media_group_id`. Album buffer instance created at module init.

- [ ] **Step 11.1: Add buffer import + instance near other module-level inits**

Use Edit tool: at top of file (with other imports, e.g. near `import { messagesStore }` or wherever appropriate around line 25-30), add:

```ts
import { createAlbumBuffer } from './album-buffer'
```

Then add the buffer instance after `messagesStore` initialization (search for where messagesStore is created — should be near where store is opened, around line 100-110). If unsure, place it just before `bot.on('message:text', ...)` line:

```ts
const albumBuffer = createAlbumBuffer<{ firstCtx: Context; item: AlbumItem }>({
  debounceMs: 400,
  hardCapMs: 3000,
  maxItems: 10,
  onFlush: async (key, entries) => {
    const firstCtx = entries[0]!.firstCtx
    // key format: `${chat_id}:${media_group_id}` — split on first ':'
    const colonIdx = key.indexOf(':')
    const mediaGroupId = colonIdx >= 0 ? key.slice(colonIdx + 1) : key
    const items = entries.map(e => e.item)
    await handleInboundAlbum(firstCtx, mediaGroupId, items)
  },
})
```

- [ ] **Step 11.2: Modify `bot.on('message:photo')` to route by `media_group_id`**

Use Edit tool to replace the current `bot.on('message:photo', ...)` block (from Task 9, lines around 854-859):

```ts
bot.on('message:photo', async ctx => {
  const mgId = ctx.message.media_group_id
  if (mgId) {
    const key = `${ctx.chat!.id}:${mgId}`
    albumBuffer.add(key, {
      firstCtx: ctx,
      item: {
        msgId: ctx.message.message_id,
        caption: ctx.message.caption,
        kind: 'photo',
        download: makePhotoDownloader(ctx),
      },
    })
    return
  }
  // Single-photo path (existing behavior preserved)
  const caption = ctx.message.caption ?? '(photo)'
  await handleInbound(ctx, caption, makePhotoDownloader(ctx))
})
```

- [ ] **Step 11.3: Type-check**

Run: `cd plugins/telegram && timeout 3 bun server.ts; echo "exit=$?"`

Expected: no `error TS`. Acceptable exits: 1 or 124.

- [ ] **Step 11.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.10: wire bot.on('message:photo') to album buffer"
```

---

## Task 12: Wire `bot.on('message:document')` to album buffer

**Files:**
- Modify: `plugins/telegram/server.ts:880-891`

- [ ] **Step 12.1: Read current document handler**

Run: `sed -n '880,895p' plugins/telegram/server.ts`

Expected: see `bot.on('message:document', ...)` calling `handleInbound(ctx, text, undefined, attachmentMeta)`.

- [ ] **Step 12.2: Modify document handler**

Use Edit tool to replace the document handler block:

```ts
bot.on('message:document', async ctx => {
  const doc = ctx.message.document
  const name = safeName(doc.file_name)
  const text = ctx.message.caption ?? `(document: ${name ?? 'file'})`
  const meta: AttachmentMeta = {
    kind: 'document',
    file_id: doc.file_id,
    size: doc.file_size,
    mime: doc.mime_type,
    name,
  }

  const mgId = ctx.message.media_group_id
  if (mgId) {
    const key = `${ctx.chat!.id}:${mgId}`
    albumBuffer.add(key, {
      firstCtx: ctx,
      item: {
        msgId: ctx.message.message_id,
        caption: ctx.message.caption,
        kind: 'document',
        meta,
      },
    })
    return
  }
  // Single-document path (existing behavior preserved)
  await handleInbound(ctx, text, undefined, meta)
})
```

- [ ] **Step 12.3: Type-check**

Run: `cd plugins/telegram && timeout 3 bun server.ts; echo "exit=$?"`

Expected: no `error TS`. Acceptable exits: 1 or 124.

- [ ] **Step 12.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.10: wire bot.on('message:document') to album buffer"
```

---

## Task 13: Shutdown integration — drain buffer on SIGTERM/SIGINT

**Files:**
- Modify: `plugins/telegram/server.ts:706-718`

- [ ] **Step 13.1: Read current shutdown function**

Run: `sed -n '705,720p' plugins/telegram/server.ts`

Expected: see `function shutdown(): void { ... bot.stop() ... }`.

- [ ] **Step 13.2: Add `albumBuffer.drainAll()` call before `bot.stop()`**

Use Edit tool to insert one line in `shutdown()`, immediately before the `setTimeout(() => process.exit(0), 2000)` line:

```ts
  void albumBuffer.drainAll().catch(err => {
    process.stderr.write(`telegram channel: album drainAll failed: ${err}\n`)
  })
```

The shutdown function should now look like:

```ts
function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write('telegram channel: shutting down\n')
  try { messagesStore.close() } catch {}
  try {
    if (parseInt(readFileSync(PID_FILE, 'utf8'), 10) === process.pid) rmSync(PID_FILE)
  } catch {}
  void albumBuffer.drainAll().catch(err => {
    process.stderr.write(`telegram channel: album drainAll failed: ${err}\n`)
  })
  // bot.stop() signals the poll loop to end; the current getUpdates request
  // may take up to its long-poll timeout to return. Force-exit after 2s.
  setTimeout(() => process.exit(0), 2000)
  void Promise.resolve(bot.stop()).finally(() => process.exit(0))
}
```

- [ ] **Step 13.3: Type-check**

Run: `cd plugins/telegram && timeout 3 bun server.ts; echo "exit=$?"`

Expected: no `error TS`. Acceptable exits: 1 or 124.

- [ ] **Step 13.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "T1.10: drainAll album buffer on shutdown"
```

---

## Task 14: Run full test suite + manual smoke verification

**Files:** none modified — verification only.

- [ ] **Step 14.1: Run full bun test suite**

Run: `cd plugins/telegram && bun test`
Expected: All `album-buffer.test.ts` (10 tests) + all `messages-store.test.ts` (existing + 2 new) PASS.

If any FAIL, fix before proceeding.

- [ ] **Step 14.2: Manual smoke checklist**

Start plugin against real Telegram (user must have bot token configured already via `/telegram:configure`). Document results inline.

Send each scenario from a paired Telegram client:

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 1 | Single photo (no album) | Claude receives 1 notification with `image_path` (singular), no `media_group_id` | |
| 2 | Album of 3 photos with caption "test" on first | Claude receives **1** notification, `image_paths.length === 3`, `content` = "test", `meta.media_group_id` set, `meta.message_ids.length === 3` | |
| 3 | Album of 1 photo + 2 documents (mixed) | 1 notification with `image_paths.length === 1`, `attachments.length === 2` | |
| 4 | Album of 10 photos | 1 notification (flushed at maxItems), all paths present | |
| 5 | Album then immediately another album (different `media_group_id`) | 2 separate notifications, items not crossed | |
| 6 | Album from unallowlisted user | Silent drop (no notification to Claude, no reply) | |
| 7 | Album from sender pending pair | Pairing message sent once via firstCtx, no Claude notification | |
| 8 | Stop plugin (Ctrl-C) right after sending album, before flush | stderr shows "shutting down" + drainAll attempts; album may or may not reach Claude depending on timing | |

- [ ] **Step 14.3: Update FEATURES_BACKLOG.md**

Mark T1.10 as completed. Use Edit tool on `plugins/telegram/FEATURES_BACKLOG.md`:

Change `[~] **T1.10 — Album / media group batching**` line to `[x]` and update the trailing note from "design spec ready" to "implemented".

Also add update-log entry at bottom:

```markdown
- **2026-05-16** — T1.10 selesai. Module `plugins/telegram/album-buffer.ts` (generic) + integration di `server.ts` (photo & document handler routing, handleInboundAlbum, shutdown drain). Album = 1 row di messages.db dengan `metadata.media_group_id` + `metadata.message_ids[]`. MCP meta tambahan: `image_paths[]`, `attachments[]`, `media_group_id`.
```

- [ ] **Step 14.4: Commit final state**

```bash
git add plugins/telegram/FEATURES_BACKLOG.md
git commit -m "T1.10: mark completed in backlog + update log"
```

---

## Done Criteria

- All 10 album-buffer unit tests pass
- All messages-store tests pass (existing + 2 new)
- Photo + document handlers route to buffer when `media_group_id` present, single-item path unchanged
- Manual smoke scenarios 1-8 verified
- T1.10 marked `[x]` in backlog with update-log entry
- All commits land on `main` (no orphaned branch)
