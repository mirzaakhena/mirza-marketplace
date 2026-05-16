# T1.10 — Album / Media Group Batching — Design Spec

**Status**: Design approved (2026-05-16)
**Source**: `plugins/telegram/FEATURES_BACKLOG.md` → T1.10
**Implementation target**: `plugins/telegram/`
**Reference impl**: `personal-ai-assistant6/src/gateway/telegram.ts:497-682`
**Mode kerja**: 1 fitur per session, focus deep
**Depends on**: T1.11 (raw conversation logging) — sudah merged, schema `attachments TEXT` sudah ada

## Purpose & Scope

### Purpose

Telegram album (multi-photo/document) datang sebagai N update terpisah yang berbagi `media_group_id`. Tanpa batching, plugin trigger N notifikasi MCP berurutan → Claude proses tiap foto sebagai turn terpisah:

1. **Coherence rusak**: Claude lihat foto 1 sebelum lihat foto 2-N, jawaban bisa drift sebelum konteks lengkap (mis. comparison screenshot yang baru jelas setelah semua dilihat).
2. **UX tidak natural**: user mental model "1 album = 1 pesan", bot yang balas N kali terasa noisy.
3. **Token mahal**: N× system prompt + N× context load. Saving bonus, bukan justifikasi utama.

T1.10 mengintroduksi buffer in-memory per `media_group_id` di plugin, sehingga album terkirim ke Claude sebagai **1 notifikasi tunggal** dengan attachment array.

### In scope

- Buffer logic in-memory dengan debounce + hard cap + max items.
- Handler integration untuk `message:photo` dan `message:document`.
- Path baru `handleInboundAlbum()` yang share semantik dengan `handleInbound()` existing.
- Refactor `messagesStore.logInbound()` call site: 1 row per album dengan `attachments[]` array dan `metadata.media_group_id` + `metadata.message_ids`.
- Extension MCP notification meta: `media_group_id`, `message_ids[]`, `image_paths[]` (plural), `attachments[]` (plural).
- Module split: ekstrak buffer logic ke `album-buffer.ts` (generic, unit-testable).

### Out of scope

- **Video / audio / voice / video_note album**: jarang dipakai, skip MVP.
- **Outbound `sendMediaGroup`** (Claude balas dengan album visual yang terkelompok di sisi user): item backlog baru terpisah, bukan bagian T1.10.
- **Disk-backed buffer state** untuk survive plugin restart: complexity tinggi, value rendah (window <3 detik, user bisa resend).
- **Retry download** item album yang gagal: skip yang gagal, deliver sisanya. Sudah diputuskan eksplisit.
- **Refactor `handleInbound`** untuk DRY dengan `handleInboundAlbum`: duplikasi terkontrol diizinkan untuk MVP, konsolidasi ke iterasi terpisah kalau tooling jelas memerlukan.

## Architecture

Single-file impact: `plugins/telegram/server.ts` (integration) + new `plugins/telegram/album-buffer.ts` (generic buffer module).

```
┌──────────────────────────────────────────────┐
│  bot.on('message:photo')                     │
│  bot.on('message:document')                  │
│         │                                    │
│         ├─ has media_group_id? ──┐           │
│         │                        │           │
│         No                       Yes         │
│         │                        ▼           │
│         │           ┌──────────────────────┐ │
│         │           │ albumBuffer (Map)    │ │
│         │           │ key: chat_id:mg_id   │ │
│         │           │ debounce 400ms       │ │
│         │           │ hard cap 3000ms      │ │
│         │           │ max items 10         │ │
│         │           └──────────┬───────────┘ │
│         │                      │ flush       │
│         ▼                      ▼             │
│   handleInbound()      handleInboundAlbum()  │
│         │                      │             │
│         └────────┬─────────────┘             │
│                  ▼                           │
│         gate → log → MCP notification        │
└──────────────────────────────────────────────┘
```

**Tidak berubah:**
- Handler `text`, `voice`, `audio`, `video`, `video_note`, `sticker` — tetap per-item.
- Schema `messages.db` (kolom `attachments TEXT JSON`, `metadata TEXT JSON` sudah ada).
- MCP tool surface (`reply`, `react`, `download_attachment`, `edit_message`).
- Permission-reply intercept, ack reaction, typing indicator — tetap berfungsi (di-trigger sekali per album).

## Components

### 1. `album-buffer.ts` — Generic buffer module

Pure module, tidak terikat ke grammy/MCP/Telegram. Buffer items by string key dengan debounce + hard cap + max-items eviction.

```ts
export function createAlbumBuffer<T>(opts: {
  debounceMs: number
  hardCapMs: number
  maxItems: number
  onFlush: (key: string, items: T[]) => Promise<void> | void
}): {
  add: (key: string, item: T) => void
  size: () => number          // total bucket count (introspection / test)
  drainAll: () => Promise<void>  // shutdown hook
}
```

**Behavior:**
- `add(key, item)`:
  - Bucket baru → simpan item, set `debounceTimer = setTimeout(flush, debounceMs)` + `hardTimer = setTimeout(flush, hardCapMs)`.
  - Bucket existing → append, `clearTimeout(debounceTimer)` lalu set ulang. `hardTimer` tidak di-reset.
  - Setelah append, kalau `items.length >= maxItems` → flush immediate.
- Internal `flush(key)`:
  - `bucket = map.get(key)`; jika undefined → return (idempotency saat race).
  - `map.delete(key)`, clear kedua timer, panggil `onFlush(key, bucket.items)`.
  - `onFlush` di-wrap try/catch; throw di-log ke `process.stderr`, tidak crash buffer state.
- `drainAll()`: untuk shutdown — iterate semua bucket, flush masing-masing, await all.

**Tidak boleh tahu:** apa itu Telegram, grammy Context, MCP, download. Murni state container + scheduler.

### 2. `AlbumItem` (di `server.ts`)

```ts
interface AlbumItem {
  msgId: number
  caption: string | undefined        // .caption dari item ini (biasanya hanya 1 item ada)
  kind: 'photo' | 'document'
  download: () => Promise<string | undefined>  // lazy, post-gate
  meta?: AttachmentMeta              // hanya untuk document
}
```

### 3. Buffer instance + flush callback (di `server.ts`)

```ts
const albumBuffer = createAlbumBuffer<{ firstCtx: Context, item: AlbumItem }>({
  debounceMs: 400,
  hardCapMs: 3000,
  maxItems: 10,
  onFlush: async (key, entries) => {
    const firstCtx = entries[0].firstCtx
    const mediaGroupId = key.split(':').slice(1).join(':')
    const items = entries.map(e => e.item)
    await handleInboundAlbum(firstCtx, mediaGroupId, items)
  },
})
```

Key format: `${chat_id}:${media_group_id}`. Split-from-key dipakai untuk extract media_group_id di flush callback.

### 4. Handler integration (di `server.ts`)

**`bot.on('message:photo')`:**
```ts
bot.on('message:photo', async ctx => {
  const mgId = ctx.message.media_group_id
  if (mgId) {
    const key = `${ctx.chat!.id}:${mgId}`
    albumBuffer.add(key, {
      firstCtx: ctx,   // disimpan apa adanya untuk item pertama; item 2+ akan ditimpa tapi kita pakai entries[0] di onFlush
      item: {
        msgId: ctx.message.message_id,
        caption: ctx.message.caption,
        kind: 'photo',
        download: makePhotoDownloader(ctx),  // extract dari logic existing line 858-877
      },
    })
    return
  }
  // Existing path — unchanged
  const caption = ctx.message.caption ?? '(photo)'
  await handleInbound(ctx, caption, makePhotoDownloader(ctx))
})
```

**`bot.on('message:document')`:** pola sama, cek `media_group_id` dulu.

### 5. `handleInboundAlbum()` (di `server.ts`)

```ts
async function handleInboundAlbum(
  firstCtx: Context,
  mediaGroupId: string,
  items: AlbumItem[],
): Promise<void>
```

Flow:

1. `result = gate(firstCtx)`.
2. `result.action === 'drop'` → return silent.
3. `result.action === 'pair'` → `firstCtx.reply('Pairing required — ...')` (sama dengan single path), return tanpa download.
4. Skip permission-reply intercept (album caption tidak pernah match `PERMISSION_REPLY_RE`; eksplisit skip untuk konsistensi dan supaya tidak ada surface untuk forge).
5. Trigger typing indicator + ack reaction pada `items[0].msgId` (fire-and-forget, sesuai pattern existing).
6. `settled = await Promise.allSettled(items.map(i => i.download()))`.
7. Iterate `settled`:
   - `kind === 'photo'` + fulfilled → push ke `imagePaths`, push `{type:'photo', path}` ke `logAttachments`.
   - `kind === 'document'` + fulfilled (atau meta-only kalau download tidak applicable) → push `{type:'document', file_id, ...}` ke `logAttachments` dan `notifAttachments`.
   - rejected → log ke stderr dengan index + reason, increment `failedCount`.
8. `successCount = imagePaths.length + notifAttachments.length`.
9. Kalau `successCount === 0`:
   - `firstCtx.reply('⚠️ Gagal memuat foto-foto album. Coba kirim ulang.')`.
   - Return — tidak log, tidak notify Claude.
10. Build `combinedCaption`:
    - Kumpulkan semua `items[i].caption` yang non-empty.
    - Join dengan satu spasi, trim.
    - Kalau kosong → `combinedCaption = '(album of ${items.length} items)'`.
11. Kalau `failedCount > 0` → append warning ke caption: `${combinedCaption}\n\n[⚠️ ${failedCount} of ${items.length} items failed to load]`.
12. `messagesStore.logInbound({ ... })` (lihat Data Flow untuk shape).
13. `mcp.notification(...)` (lihat Data Flow untuk shape).

Item 12-13 di-wrap try/catch terpisah supaya log-failure tidak block notify, dan notify-failure tidak crash handler (pattern existing).

## Data Flow

### Inbound: happy path (album 3 photo)

```
t=0      Update 1 (photo, media_group_id=ABC, caption="check this")
            → bufferAlbumItem → bucket baru, debounceTimer(400), hardTimer(3000)

t=80     Update 2 (photo, ABC, no caption)
            → append, debounceTimer reset → fires t=480

t=160    Update 3 (photo, ABC, no caption)
            → append, debounceTimer reset → fires t=560

t=560    debounceTimer fires → flushAlbum
            → handleInboundAlbum(firstCtx, "ABC", [item1, item2, item3])
            → gate=deliver
            → Promise.allSettled(downloads) ~600-1500ms
            → image_paths = [a.jpg, b.jpg, c.jpg], successCount=3
            → combinedCaption = "check this"
            → logInbound + mcp.notification
```

### Log row shape

```ts
messagesStore.logInbound({
  ts: Date.now(),
  chat_id,
  message_id: String(items[0].msgId),    // representative
  user_id: String(firstCtx.from!.id),
  user_name: firstCtx.from!.username ?? firstCtx.from!.first_name ?? String(firstCtx.from!.id),
  text: combinedCaption,                  // include warning suffix kalau partial
  attachments: [
    { type: 'photo', path: '/inbox/...-a.jpg' },
    { type: 'photo', path: '/inbox/...-b.jpg' },
    { type: 'document', file_id: '...', name: 'foo.pdf', mime: 'application/pdf', size: 12345 },
  ],
  reply_to: firstCtx.message?.reply_to_message?.message_id != null
    ? String(firstCtx.message.reply_to_message.message_id)
    : undefined,
  metadata: {
    media_group_id: mediaGroupId,
    message_ids: items.map(i => String(i.msgId)),  // semua msgId, untuk audit
    ...(failedCount > 0 ? { failed_count: failedCount, total_count: items.length } : {}),
  },
})
```

**Catatan:** `logInbound` signature existing sudah support `attachments: unknown[]` dan `metadata` (lihat `messages-store.ts:10,21`). Tidak perlu schema migration.

### MCP notification shape

```ts
mcp.notification({
  method: 'notifications/claude/channel',
  params: {
    content: combinedCaption,             // termasuk warning suffix
    meta: {
      chat_id,
      message_id: String(items[0].msgId),  // representative untuk reply_to default
      message_ids: items.map(i => String(i.msgId)),
      media_group_id: mediaGroupId,
      user: firstCtx.from!.username ?? String(firstCtx.from!.id),
      user_id: String(firstCtx.from!.id),
      ts: new Date((firstCtx.message?.date ?? 0) * 1000).toISOString(),
      ...(imagePaths.length > 0 ? { image_paths: imagePaths } : {}),
      ...(notifAttachments.length > 0 ? { attachments: notifAttachments } : {}),
    },
  },
})
```

Dua field meta plural (`image_paths`, `attachments`) terpisah dari format singular existing (`image_path`, `attachment_*`). Claude bisa cek kehadiran `media_group_id` untuk discriminate.

## Edge Cases

| # | Case | Resolusi |
|---|------|----------|
| 1 | Item ke-10 tiba → buffer penuh | Flush early, skip debounce |
| 2 | Item ke-11+ (Telegram bug atau attacker) | Treat sebagai bucket baru, flush sendiri normal |
| 3 | Hard cap fires (album tidak pernah "berhenti") | Flush dengan apapun yang sudah di-buffer; debounceTimer di-clear |
| 4 | Late item setelah flush (Telegram delay >3s) | Bucket baru, jadi album terpisah ke Claude. Acceptable. |
| 5 | Bot restart saat buffer in-flight | Item hilang. User resend. **Known limitation.** |
| 6 | Race antara debounceTimer dan hardTimer | First-wins: bucket di-delete saat flush pertama, timer kedua early-return |
| 7 | Partial download failure (1-2 dari N) | Skip yang gagal, deliver sisanya, append warning ke content |
| 8 | All-zero download success | Reply error ke Telegram, skip log + notify |
| 9 | Gate `drop` | Buffer drained silent, tidak download |
| 10 | Gate `pair` | Pairing message dikirim sekali via firstCtx, item tidak di-deliver |
| 11 | Mixed photo + document dalam 1 album | image_paths + attachments masing-masing terisi |
| 12 | `logInbound` throw | Best-effort isolation, MCP notify tetap dikirim |
| 13 | `mcp.notification` throw | Log stderr, tidak retry (sama pattern existing) |

## Failure Modes (recap)

- **No retry on download fail**: deliberate, sudah keputusan user.
- **No persistence buffer**: deliberate, scope MVP.
- **Buffer-state isolation**: throw di `onFlush` tidak crash module, buffer state tetap clean.
- **Shutdown integration**: existing `shutdown()` di `server.ts:706-718` adalah sync-ish dengan timer force-exit 2s. Tambah `void Promise.resolve(albumBuffer.drainAll()).catch(() => {})` **sebelum** `bot.stop()` agar buffer ter-flush best-effort dalam window 2s sebelum force exit. Tidak boleh `await` (akan block shutdown jika ada flush lambat); fire-and-forget cukup karena 2s timeout sudah ample untuk album max 10 item paralel download.

## Testing

### Unit tests — `album-buffer.test.ts` (new)

Pure module test, tidak butuh bot/MCP stub.

| # | Case | Verifikasi |
|---|------|------------|
| 1 | 1 item, debounce expire | `onFlush` 1× setelah ~400ms, items.length=1 |
| 2 | 3 item dalam 200ms window | `onFlush` 1× setelah item terakhir +400ms, items lengkap |
| 3 | Stream item tiap 200ms terus | hardTimer flush di ~3000ms |
| 4 | 10 item tiba cepat | Flush immediate saat item ke-10 |
| 5 | Item ke-11 setelah max cap flush | Bucket baru, flush kedua independent |
| 6 | Concurrent keys (A:3, B:2 interleaved) | 2× `onFlush`, items tidak bercampur |
| 7 | `onFlush` throw | Buffer state clean, error ter-log, no crash |
| 8 | `drainAll` saat ada pending | Semua bucket flush, timer cleared |

### DB tests — extend `messages-store.test.ts`

| # | Case | Verifikasi |
|---|------|------------|
| 9 | `logInbound` dengan `attachments` array N entries | Row tersimpan, JSON-serialize utuh, query balik = identical |
| 10 | `logInbound` dengan `metadata.media_group_id` + `message_ids` | Metadata kolom utuh, parseable |

### Manual smoke (MVP scope — server.ts integration)

Tidak ada test infra untuk `server.ts` (heavy grammy bot dependency). Smoke checklist:

- [ ] Album 3 foto → 1 notification, `image_paths.length === 3`, `media_group_id` set
- [ ] Album 1 foto + 2 dokumen mixed → `image_paths.length === 1`, `attachments.length === 2`
- [ ] Foto tunggal (bukan album) → behavior lama, `image_path` (singular), tanpa `media_group_id`
- [ ] Album 10 foto persis → flush early
- [ ] 2 album cepat ke chat berbeda → 2 notification terpisah, tidak bercampur
- [ ] Plugin SIGTERM saat buffer in-flight → `drainAll` log warning, item hilang
- [ ] Album dari user di luar allowlist → silent drop
- [ ] Album dari sender pending pair → pairing message terkirim sekali

### Non-goals

- Performance test (1000 album)
- Memory leak stress (covered oleh unit test #7)
- Cross-restart resume

## Open Questions

Tidak ada (semua decision sudah diambil di brainstorming session 2026-05-16).

## Decision Recap

| Aspek | Keputusan |
|---|---|
| Batching strategy | Plugin buffer + 1 notifikasi MCP (Opsi A) |
| Debounce | 400ms (reset tiap item baru) |
| Hard cap | 3000ms (jaring pengaman) |
| Max items per bucket | 10 (flush early), sesuai Telegram native cap |
| Media coverage | Photo + document only |
| Logging | 1 row per album, `attachments[]` array, `metadata = {media_group_id, message_ids, ...}` |
| Partial failure | Skip yang gagal, deliver sisanya; 0 sukses → reply error, skip log+notify; warning suffix ke content kalau partial |
| MCP meta tambahan | `media_group_id`, `message_ids[]`, `image_paths[]`, `attachments[]` |
| Permission-reply intercept di album path | Skip eksplisit |
| Module split | `album-buffer.ts` (generic, testable) + integration di `server.ts` |
| Code reuse handleInbound ↔ handleInboundAlbum | Duplikasi terkontrol untuk MVP, konsolidasi nanti |
| Shutdown integration | `albumBuffer.drainAll()` di SIGTERM/SIGINT hook existing |

## References

- Backlog: `plugins/telegram/FEATURES_BACKLOG.md` → T1.10 (line 184-190)
- Reference implementation: `personal-ai-assistant6/src/gateway/telegram.ts:497-682`
- Existing handler: `plugins/telegram/server.ts:854-891` (photo + document)
- Existing `handleInbound`: `plugins/telegram/server.ts:981-1080`
- T1.11 logging spec: `docs/superpowers/specs/2026-05-15-t111-conversation-logging-design.md` (line 113 — eksplisit reference ke T1.10)
- Telegram Bot API — Media Group docs: media_group_id documented sebagai cap 10 items per group
