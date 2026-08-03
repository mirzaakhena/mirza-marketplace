# Task C1 — modul murni telegram: port utuh + test

Status: DONE (semua test hijau, typecheck 0).

## Verifikasi akhir

```
$ bun test packages/telegram-adapter
89 pass / 0 fail / 185 expect() calls (5 file test)

$ bun test          # whole repo, sanity check tidak merusak paket lain
129 pass / 0 fail / 252 expect() calls (11 file test)

$ bun run typecheck
$ tsc --noEmit   -> exit 0
```

## Per-modul

### album-buffer.ts
- Diporting dari: `plugins/telegram/album-buffer.ts` + `album-buffer.test.ts` (1:1).
- Perubahan: hanya gaya (semicolon, double-quote) mengikuti konvensi repo baru
  (lihat `packages/shared/src/ipc.ts`). Tidak ada perubahan logika.
- Test: 10 test, semua pass (debounce flush/reset, hard cap, maxItems,
  multi-key isolation, drainAll, error isolation onFlush throw/rejection).

### buttons.ts
- Diporting dari: `plugins/telegram/buttons.ts` + `buttons.test.ts` (1:1).
- Perubahan: hanya gaya. Menambahkan dependency `grammy` (untuk `InlineKeyboard`).
- Mencatat SCAR-052 di komentar module: `callback_id` dibatasi
  `/^[a-z0-9_]{1,32}$/` dan diberi prefix `ai:` — payload `callback_data`
  akhir jauh di bawah batas 64 byte Telegram.
- Test: 27 test, semua pass (validateButtons rules, parseAiCallbackData,
  buildKeyboard, findButtonLabel, AI_CALLBACK_PREFIX).

### paginated-picker.ts
- Diporting dari: `plugins/telegram/paginated-picker.ts` + `paginated-picker.test.ts` (1:1).
- Perubahan: hanya gaya. Tidak ada perubahan logika (layout picker, MAX_SESSIONS_PER_PAGE=6,
  trim label 60 char, clamp halaman, dst. persis sama).
- Test: 12 test, semua pass.

### markdown.ts — FUNC-2 fix
- Diporting dari: `plugins/telegram/markdown.ts` + `markdown.test.ts`.
- **Bug FUNC-2**: `telegramify-markdown` punya handler internal untuk tabel
  GFM (`mdast-util-gfm-table`) yang dikontrol lewat parameter kedua
  `unsupportedTagsStrategy`. Source plugin lama memanggil
  `telegramifyMarkdown(input)` — **tanpa** argumen kedua — sehingga strategi
  jatuh ke default `'keep'`: isi tabel (termasuk karakter `|`, `-`, `.` yang
  wajib di-escape di MarkdownV2) dikembalikan **verbatim, tidak di-escape**.
  Dibuktikan empiris (probe langsung ke library, lihat lampiran di bawah):
  ```
  input:  "# Report\n\n| Name | Age | City |\n| --- | --- | --- |\n..."
  output: "*Report*\n\n| Name  | Age | City |\n| ----- | --- | ---- |\n..."
  ```
  `|` tidak lolos escape padahal `|` termasuk karakter spesial MarkdownV2 —
  Telegram akan menolak pesan ini dengan "can't parse entities" tanpa
  indikasi apa pun bahwa tabel penyebabnya ("gagal senyap").
- **Fix** (diterapkan sesuai instruksi brief): pre-process `input` sebelum
  diserahkan ke `telegramify-markdown` — `wrapGfmTablesAsCodeBlocks()`
  memindai baris demi baris (skip yang sudah di dalam fenced code block
  ` ``` `), mendeteksi blok tabel (baris header berisi `|` diikuti baris
  separator `---`/`:---:`/`---:`), dan membungkusnya dalam ` ``` ` fence.
  Di dalam fence, MarkdownV2 hanya butuh escape backslash/backtick, jadi
  pipe/dash tabel selamat tanpa perlu escaping manual. Dibuktikan ulang
  dengan input yang sama setelah fix:
  ```
  output: "*Report*\n\n```\n| Name | Age | City |\n| --- | --- | --- |\n" +
          "| Alice | 30 | NYC |\n| Bob | 25 | LA |\n```\n\nSome text after\\.\n"
  ```
  Tabel sekarang utuh di dalam code block yang valid MarkdownV2.
- Deviasi tambahan (bukan logika, murni tipe): pemanggilan
  `telegramifyMarkdown(text)` dengan 1 argumen gagal `tsc --noEmit` di repo
  ini (`.d.ts` library mendeklarasikan argumen kedua wajib). Ditambahkan
  argumen kedua eksplisit `"keep"` — nilai ini **identik** dengan default
  implisit yang dipakai source plugin lama (lihat `processUnsupportedTags`
  di `lib/utils.js`: `default: return content` = strategi `'keep'`), jadi
  tidak mengubah perilaku, hanya memuaskan strict typecheck repo baru.
- Test: 4 test lama (di-port) + 15 test lama lain (escape, bold/italic,
  inline code, fenced code block, link, mixed) + **4 test baru untuk
  FUNC-2**: tabel GFM asli utuh dalam code fence, tabel dengan alignment
  marker (`:---:`), tabel di dalam fenced block yang sudah ada tidak
  dibungkus dobel, dan teks prosa dengan pipe bebas (bukan tabel) tidak
  ikut terbungkus. Total 19 test, semua pass.

### chunk.ts — modul baru (ekstraksi)
- Diekstrak dari: `plugins/telegram/server.ts`
  - `chunk()` di baris 477-496 → `chunkText()` (rename saja, logika sama persis).
  - Blok chunk-planning di baris ~702-800 (cabang `format === 'markdown'` pada
    handler tool `reply`) → `planOutbound()`.
- **API final** (deviasi dari usulan brief, dicatat sesuai instruksi):
  ```ts
  export const MAX_CHUNK_LIMIT = 4096;
  export type ChunkMode = "length" | "newline";
  export type ReplyFormat = "text" | "markdown" | "markdownv2";

  export function chunkText(text: string, limit: number, mode: ChunkMode): string[];

  export interface OutboundPart { text: string; parse_mode?: "MarkdownV2" }
  export interface PlanOutboundResult {
    parts: OutboundPart[];
    fallback: (part: OutboundPart) => string;
  }
  export function planOutbound(
    text: string, format: ReplyFormat, limit: number, mode: ChunkMode = "length",
  ): PlanOutboundResult;
  ```
  Deviasi dari usulan brief (`{parts: {text, parse_mode?}[], fallback: (part)=>string}`):
  - Ditambahkan parameter `mode` ke `planOutbound` (default `"length"`) —
    dibutuhkan untuk mereplikasi perilaku asli server.ts persis: untuk
    format `text`/`markdownv2` chunk mode berasal dari config
    (`access.chunkMode`), sedangkan untuk format `markdown` mode selalu
    dipaksa `"newline"` (demi menjaga batas paragraf). Tanpa parameter ini
    perilaku config `chunkMode` untuk format non-markdown hilang.
  - `fallback` diimplementasi lewat `WeakMap<OutboundPart, string>` yang
    memetakan tiap part balik ke teks raw/mentahnya — bentuk publik
    `OutboundPart` tetap persis `{text, parse_mode?}` seperti usulan brief
    (tidak membocorkan field `raw` ke konsumen), tapi `fallback(part)` tetap
    bisa mengembalikan versi plain-text yang benar untuk part tsb.
    Tidak ada I/O di modul ini (murni) — caller (lapisan send adapter,
    fase berikutnya) yang bertanggung jawab memanggil `bot.api.sendMessage`
    per part dan, jika Telegram menolak dengan error parse-entities,
    memanggil `fallback(part)` untuk resend sebagai plain text — meniru
    persis try/catch di server.ts baris ~780-796.
- Test baru (`test/chunk.test.ts`), 20 test:
  - **SCAR-046** (hard-cap + preferensi batas): text ≤limit tetap 1 potong;
    mode `length` memotong tepat di limit; mode `newline` memilih batas
    paragraf (`\n\n`) > baris tunggal (`\n`) > spasi > hard cut, masing-masing
    dites dengan skenario di mana lebih dari satu jenis batas tersedia dalam
    jendela yang sama untuk membuktikan urutan preferensi; plus test
    `MAX_CHUNK_LIMIT === 4096` dan test teks ~10k char yang membuktikan tak
    ada potongan yang melebihi 4096 di kedua mode.
  - **SCAR-047** (raw-first chunking di margin=limit/2, entity utuh): teks
    dua paragraf berisi bold span lengkap (`**aaaa**`, `**bbbb**`) yang
    muat dalam satu potongan bila di-chunk di limit penuh (`chunkText(text,
    60, "newline")` → 1 potongan) tapi **terbelah jadi 2** oleh
    `planOutbound(..., "markdown", 60)` — membuktikan margin memang
    `floor(limit/2)`, bukan `limit`. Test kedua menghitung jumlah `*` yang
    tidak di-escape di tiap potongan hasil konversi dan memastikan genap
    (tidak ada entity yang terbelah/menggantung antar chunk).
  - **SCAR-048** (fallback plain text): (a) fallback otomatis saat
    konversi "meledak" melewati limit — 20 titik (`.`) yang setelah
    di-escape jadi ~41 char pada `limit=40` → part direncanakan sebagai
    plain text (`parse_mode` undefined, `text === raw`), dibuktikan lewat
    probe empiris rasio ukuran (`telegramifyMarkdown` mengubah 20 char jadi
    41 char, rasio 2.05x — melebihi batas 2x yang diasumsikan margin); (b)
    `fallback(part)` untuk part yang **berhasil** dikonversi mengembalikan
    markdown mentah asli (bukan versi ter-convert) — untuk dipakai caller
    saat `sendMessage` gagal parse di runtime; (c) `fallback()` adalah
    identity untuk format `text` dan `markdownv2`.
  - **SCAR-049** (markdown auto-convert vs markdownv2 passthrough): format
    `text` tidak melakukan konversi/parse_mode; format `markdown`
    meng-auto-convert CommonMark → MarkdownV2; format `markdownv2` adalah
    passthrough mentah (dibuktikan: input yang sudah di-escape sendiri
    tidak di-escape ulang/double-escape).

## File yang disentuh
- `packages/telegram-adapter/src/album-buffer.ts` (baru — port)
- `packages/telegram-adapter/src/buttons.ts` (baru — port)
- `packages/telegram-adapter/src/paginated-picker.ts` (baru — port)
- `packages/telegram-adapter/src/markdown.ts` (baru — port + fix FUNC-2)
- `packages/telegram-adapter/src/chunk.ts` (baru — ekstraksi dari server.ts)
- `packages/telegram-adapter/src/index.ts` — ganti placeholder, re-export ke-5 modul.
- `packages/telegram-adapter/package.json` — tambah dependencies `grammy`,
  `telegramify-markdown`.
- `packages/telegram-adapter/test/*.test.ts` (5 file baru, total 89 test).
- `bun.lock` — hasil `bun install` sekali dari root (wajar sesuai instruksi wave).

Tidak menyentuh file di luar `packages/telegram-adapter/**` selain `bun.lock`.
Tidak melakukan `git add`/commit/push — working tree dibiarkan untuk controller.
(Catatan: `git status` menunjukkan perubahan tak tersentuh di
`packages/shared/src/index.ts` + file baru `bus.ts`/`bus.test.ts` — itu
bukan dari task ini, kemungkinan hasil wave paralel lain yang berjalan
bersamaan di working tree yang sama.)
