# Chunking Balasan Panjang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Balasan Telegram yang melebihi batas keras 4096 karakter terkirim utuh sebagai beberapa pesan berurutan, dan AI diberi aturan tertulis untuk menulis ±1000 karakter.

**Architecture:** Dua lapis yang tidak saling tahu. **Lapis aturan** = teks di deskripsi tool `reply` dan `SERVER_INSTRUCTIONS`, plus nilai balik tool yang menyebut panjang terkirim. **Lapis jaring** = modul murni `chunk.ts` yang memotong CommonMark mentah di batas paragraf, dipakai `engine.reply()`. Jalur cepat dipertahankan: kalau konversi utuh muat, kirim satu pesan seperti hari ini.

**Tech Stack:** TypeScript, Bun 1.3.11, grammy, `telegramify-markdown`, `bun:sqlite`, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-02-chunking-balasan-panjang-design.md`

## Global Constraints

- **Repo kode:** `C:\Users\Mirza\workspace\mirza-bots`. Repo dokumen (`mirza-marketplace`) hanya disentuh di Task 4. **Keduanya punya remote dan wajib di-push.**
- **Platform:** Windows 11, Bun 1.3.11. Seluruh test harus hijau di Windows — `bun test` dari `cc-plugin/`.
- **Baseline:** `cc-plugin` **0.5.3**, **204 test hijau**. Jumlah test tidak boleh turun.
- **Batas keras Telegram:** `4096` karakter. **Margin potong:** `2048`. **Pedoman panjang:** `1000` karakter.
- Setiap commit membawa trailer **`Agent: bot-03`** sebelum trailer lain. Jangan mengubah `git config user.name`.
- Teks yang disimpan ke `conversations.db` selalu **CommonMark mentah**, tidak pernah hasil MarkdownV2.
- Jangan menambahkan knob konfigurasi apa pun. Ketiga angka di atas adalah konstanta bernama di kode.
- Jangan menyentuh `hooks/**` dalam rencana ini.

---

### Task 1: Modul pemotong murni `chunk.ts`

**Files:**
- Create: `cc-plugin/src/engine/chunk.ts`
- Create: `cc-plugin/test/engine/chunk.test.ts`

**Interfaces:**
- Consumes: `commonMarkToMarkdownV2` dari `src/engine/markdown.ts`
- Produces:
  - `export const TELEGRAM_MAX_CHARS = 4096`
  - `export const CHUNK_MARGIN = 2048`
  - `export function chunkRaw(text: string, limit: number): string[]`
  - `export interface OutboundPart { wire: string; raw: string; mv2: boolean }`
  - `export function planParts(text: string): OutboundPart[]`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/chunk.test.ts`:

```ts
import { expect, test } from "bun:test";
import { chunkRaw, planParts, TELEGRAM_MAX_CHARS, CHUNK_MARGIN } from "../../src/engine/chunk";

test("teks pendek tidak disentuh sama sekali", () => {
  expect(chunkRaw("halo", 100)).toEqual(["halo"]);
});

test("memotong di batas paragraf, bukan di tengah kalimat", () => {
  const a = "a".repeat(60);
  const b = "b".repeat(60);
  const parts = chunkRaw(`${a}\n\n${b}`, 80);
  expect(parts.length).toBe(2);
  expect(parts[0]).toBe(a);
  expect(parts[1]).toBe(b);
});

test("jatuh ke baris tunggal kalau tidak ada baris kosong", () => {
  const a = "a".repeat(60);
  const b = "b".repeat(60);
  const parts = chunkRaw(`${a}\n${b}`, 80);
  expect(parts[0]).toBe(a);
  expect(parts[1]).toBe(b);
});

// Tanpa batas yang layak, potong keras. Yang TIDAK boleh terjadi: hilang.
test("tanpa batas apa pun, potong keras dan tidak ada yang hilang", () => {
  const solid = "x".repeat(250);
  const parts = chunkRaw(solid, 100);
  expect(parts.length).toBe(3);
  expect(parts.join("")).toBe(solid);
});

// Properti yang paling menjaga: tidak ada isi yang boleh menguap. Satu test ini
// yang mencegah "perbaikan" yang diam-diam membuang teks -- cara yang sama
// dipakai menjaga W-21.
test("gabungan seluruh potongan memuat seluruh isi aslinya", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Paragraf ${i} ${"y".repeat(80)}`).join("\n\n");
  const parts = chunkRaw(text, 300);
  const strip = (s: string) => s.replace(/\s+/g, "");
  expect(parts.map(strip).join("")).toBe(strip(text));
});

test("potongan kerdil ditolak: kandidat batas harus melewati setengah jendela", () => {
  // Baris kosong di posisi 5 -- jauh di bawah setengah dari limit 100, jadi
  // memakainya akan menghasilkan potongan 5 karakter dan ledakan jumlah pesan.
  const text = `short\n\n${"z".repeat(300)}`;
  const parts = chunkRaw(text, 100);
  expect(parts[0]!.length).toBeGreaterThan(50);
});

test("jalur cepat: yang muat setelah dikonversi tetap satu potongan", () => {
  const parts = planParts("halo **bro**");
  expect(parts.length).toBe(1);
  expect(parts[0]!.mv2).toBe(true);
  expect(parts[0]!.raw).toBe("halo **bro**");
  expect(parts[0]!.wire).toContain("bro");
});

test("yang tidak muat dipecah, dan tiap potongan dikonversi sendiri", () => {
  const text = Array.from({ length: 200 }, (_, i) => `Baris ${i} ${"k".repeat(60)}`).join("\n\n");
  const parts = planParts(text);
  expect(parts.length).toBeGreaterThan(1);
  for (const p of parts) expect(p.wire.length).toBeLessThanOrEqual(TELEGRAM_MAX_CHARS);
});

test("konstanta batasnya eksplisit, bukan angka ajaib yang tersebar", () => {
  expect(TELEGRAM_MAX_CHARS).toBe(4096);
  expect(CHUNK_MARGIN).toBe(2048);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test test/engine/chunk.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/chunk'`

- [ ] **Step 3: Tulis implementasi minimalnya**

Buat `cc-plugin/src/engine/chunk.ts`:

```ts
import { commonMarkToMarkdownV2 } from "./markdown";

/** Batas keras Telegram untuk satu pesan teks. */
export const TELEGRAM_MAX_CHARS = 4096;

/**
 * Jendela pemotongan untuk CommonMark MENTAH.
 *
 * Setengah dari batas keras, karena escaping MarkdownV2 membengkakkan teks dan
 * seberapa besar bengkaknya tidak bisa diketahui sebelum dikonversi. Margin ini
 * bukan tempat kebenarannya berdiri -- verifikasi per-potongan di planParts()
 * yang menjaga itu. Margin hanya membuat verifikasi tersebut jarang gagal.
 */
export const CHUNK_MARGIN = 2048;

/**
 * Potong CommonMark mentah, memilih batas paragraf ketimbang hitungan karakter.
 *
 * Kandidat batas hanya diterima kalau letaknya melewati setengah jendela. Tanpa
 * syarat itu, satu baris kosong di karakter ke-5 menghasilkan potongan 5
 * karakter, dan jumlah pesan meledak untuk teks yang sama.
 */
export function chunkRaw(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const out: string[] = [];
  let rest = text;
  const half = limit / 2;

  while (rest.length > limit) {
    const para = rest.lastIndexOf("\n\n", limit);
    const line = rest.lastIndexOf("\n", limit);
    const space = rest.lastIndexOf(" ", limit);
    const cut = para > half ? para : line > half ? line : space > half ? space : limit;
    out.push(rest.slice(0, cut));
    // Baris kosong di sambungan sudah jadi batas antar-pesan; membawanya ikut
    // membuat potongan berikutnya mulai dengan baris kosong di layar.
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) out.push(rest);
  return out;
}

/** Satu pesan Telegram yang siap dikirim. */
export interface OutboundPart {
  /** Yang dikirim ke Telegram. */
  wire: string;
  /** CommonMark aslinya -- ini yang disimpan ke riwayat, bukan `wire`. */
  raw: string;
  /** false berarti dikirim sebagai teks polos, tanpa parse_mode. */
  mv2: boolean;
}

/**
 * Rencanakan pesan-pesan keluar untuk satu balasan.
 *
 * Jalur cepat lebih dulu: kalau konversi utuh muat, kembalikan satu bagian dan
 * jangan potong apa pun. Ini yang terjadi pada ~90% balasan, dan jalurnya
 * sengaja dibuat identik dengan perilaku sebelum chunking ada.
 *
 * Baru kalau tidak muat, teks MENTAH yang dipotong lalu tiap potongan
 * dikonversi sendiri. Urutan ini load-bearing: memotong teks yang SUDAH
 * dikonversi bisa membelah satu entity (`*tebal` terbuka di potongan 1, tertutup
 * di potongan 2) dan Telegram menolak seluruh potongan itu dengan
 * "can't parse entities". Sistem lama menemukan ini di produksi.
 */
export function planParts(text: string): OutboundPart[] {
  const whole = commonMarkToMarkdownV2(text);
  if (whole.length <= TELEGRAM_MAX_CHARS) return [{ wire: whole, raw: text, mv2: true }];

  return chunkRaw(text, CHUNK_MARGIN).map((raw) => {
    const converted = commonMarkToMarkdownV2(raw);
    // Escaping yang membengkak melewati batas: kirim potongan itu apa adanya
    // sebagai teks polos. Jelek, tapi tidak ada yang hilang -- dan "isi lenyap
    // tanpa sepatah kata" adalah kelas kegagalan yang proyek ini paling hindari.
    return converted.length <= TELEGRAM_MAX_CHARS
      ? { wire: converted, raw, mv2: true }
      : { wire: raw, raw, mv2: false };
  });
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test test/engine/chunk.test.ts`
Expected: PASS, 9 test

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test`
Expected: PASS, 213 test (204 + 9)

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/chunk.ts cc-plugin/test/engine/chunk.test.ts
git commit -F- <<'EOF'
feat(chunk): pemotong murni untuk balasan yang melewati batas Telegram

Modul tanpa I/O: batas paragraf lebih disukai daripada hitungan karakter,
kandidat batas harus melewati setengah jendela supaya potongan kerdil tidak
meledakkan jumlah pesan.

planParts() menaruh jalur cepat di depan -- konversi utuh dulu, potong hanya
kalau hasilnya melewati 4096. ~90% balasan tidak berubah jalurnya.

Potong dulu baru konversi, bukan sebaliknya: memotong teks yang sudah
dikonversi bisa membelah entity dan Telegram menolak seluruh potongan itu.

Agent: bot-03
EOF
```

---

### Task 2: `engine.reply()` mengirim per potongan

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts:47` (tanda tangan `reply` di interface `Engine`)
- Modify: `cc-plugin/src/engine/engine.ts:396-436` (implementasi `reply`)
- Modify: `cc-plugin/test/engine/reply-outgoing.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `planParts`, `OutboundPart` dari `src/engine/chunk.ts` (Task 1)
- Produces:
  - `export interface ReplyResult { chars: number; parts: number }`
  - `reply(text: string, buttons?: ButtonRow[], replyTo?: string): Promise<ReplyResult>`
  - `export function planSendOptionsFor(index: number, total: number, replyMarkup: InlineKeyboard | undefined, replyTo: string | undefined)` — helper murni supaya penempatan tombol/kutipan bisa diuji tanpa jaringan

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `cc-plugin/test/engine/reply-outgoing.test.ts`:

```ts
import { planSendOptionsFor } from "../../src/engine/engine";

// Keyboard di potongan tengah menggantung di atas teks lanjutan.
test("tombol hanya menempel di potongan terakhir", () => {
  const kb = { inline_keyboard: [] } as any;
  expect(planSendOptionsFor(0, 3, kb, undefined)?.reply_markup).toBeUndefined();
  expect(planSendOptionsFor(1, 3, kb, undefined)?.reply_markup).toBeUndefined();
  expect(planSendOptionsFor(2, 3, kb, undefined)?.reply_markup).toBeDefined();
});

// Yang dijawab adalah balasannya secara keseluruhan, bukan potongan ke-3.
test("kutipan hanya menempel di potongan pertama", () => {
  expect(planSendOptionsFor(0, 3, undefined, "89")?.reply_parameters).toEqual({ message_id: 89 });
  expect(planSendOptionsFor(1, 3, undefined, "89")).toBeUndefined();
  expect(planSendOptionsFor(2, 3, undefined, "89")).toBeUndefined();
});

test("satu potongan membawa keduanya sekaligus", () => {
  const opts = planSendOptionsFor(0, 1, { inline_keyboard: [] } as any, "89");
  expect(opts?.reply_markup).toBeDefined();
  expect(opts?.reply_parameters).toEqual({ message_id: 89 });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test test/engine/reply-outgoing.test.ts`
Expected: FAIL — `planSendOptionsFor is not a function`

- [ ] **Step 3: Tambahkan helper murni**

Di `cc-plugin/src/engine/engine.ts`, tepat setelah `buildSendOptions` (yang berakhir sekitar baris 140), tambahkan:

```ts
/**
 * Opsi kirim untuk potongan ke-`index` dari `total`.
 *
 * Aturannya dua, dan keduanya punya alasan yang terlihat di layar user:
 * tombol hanya di potongan TERAKHIR (di tengah, keyboard menggantung di atas
 * teks lanjutan), kutipan hanya di potongan PERTAMA (yang dijawab adalah
 * balasannya secara keseluruhan).
 *
 * Dipisah jadi fungsi sendiri supaya kedua aturan itu bisa diuji tanpa
 * menyentuh jaringan.
 */
export function planSendOptionsFor(
  index: number,
  total: number,
  replyMarkup: InlineKeyboard | undefined,
  replyTo: string | undefined
): { reply_markup?: InlineKeyboard; reply_parameters?: { message_id: number } } | undefined {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  return buildSendOptions(isLast ? replyMarkup : undefined, isFirst ? replyTo : undefined);
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test test/engine/reply-outgoing.test.ts`
Expected: PASS

- [ ] **Step 5: Ubah tanda tangan `reply` di interface `Engine`**

Di `cc-plugin/src/engine/engine.ts`, tambahkan tipe di dekat deklarasi interface `Engine` dan ganti baris 47:

```ts
/** Apa yang benar-benar terkirim -- dipakai server untuk memberi umpan balik ke AI. */
export interface ReplyResult {
  /** Panjang CommonMark yang ditulis AI, bukan panjang setelah escaping. */
  chars: number;
  /** Berapa pesan Telegram yang keluar. 1 untuk sebagian besar balasan. */
  parts: number;
}
```

Ganti:

```ts
  reply(text: string, buttons?: ButtonRow[], replyTo?: string): Promise<void>;
```

dengan:

```ts
  reply(text: string, buttons?: ButtonRow[], replyTo?: string): Promise<ReplyResult>;
```

- [ ] **Step 6: Tulis ulang badan `reply`**

Ganti seluruh badan `async reply(...)` di `cc-plugin/src/engine/engine.ts:396-436` dengan:

```ts
      async reply(text: string, buttons?: ButtonRow[], replyTo?: string): Promise<ReplyResult> {
        const chatId = lastChatByBot.get(botName);
        if (!chatId) {
          throw new Error(
            "no_known_chat: this bot has not received a message yet, so there is nobody to reply to"
          );
        }
        // Reads the AI's own text, deliberately BEFORE the MarkdownV2 escaping:
        // the numbered-list legend it looks for is written by the AI, and after
        // escaping every "1." has become "1\." -- the rule would stop matching
        // the very thing it exists to check.
        //
        // Also deliberately before CHUNKING: the legend and the buttons can land
        // in different parts, and checking per-part would reject a perfectly
        // narrated reply just because its list fell on the other side of a cut.
        const unnarrated = findMissingButtonNarration(text, buttons);
        if (unnarrated) throw new Error(unnarrated);

        const replyMarkup = buttons ? buildInlineKeyboard(buttons) : undefined;
        const parts = planParts(text);

        let sentCount = 0;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!;
          const options = planSendOptionsFor(i, parts.length, replyMarkup, replyTo);

          let sent;
          try {
            sent = await bot.api.sendMessage(chatId, part.wire, {
              ...(options ?? {}),
              // Absent, not false: a part that blew up under escaping is sent as
              // plain text, and passing parse_mode would resurrect the 400 this
              // fallback exists to avoid.
              ...(part.mv2 ? { parse_mode: "MarkdownV2" as const } : {}),
            });
          } catch (err) {
            // The parts already delivered CANNOT be recalled, so the error has to
            // carry that number. Without it the next move is to resend the whole
            // reply, and the user receives the first parts twice.
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
              `reply failed after ${sentCount} of ${parts.length} parts sent: ${reason}`
            );
          }
          sentCount++;

          // Never fatal. The message is already on the user's phone; throwing here
          // would make the AI believe the send failed and send the whole thing
          // again.
          try {
            storeOutgoing(conversationsDb, {
              bot: botName,
              chatId,
              messageId: String(sent.message_id),
              // The raw CommonMark of THIS part -- history must read back as what
              // the AI wrote, never as the escaped wire form.
              text: part.raw,
              sessionId: sink.sessionId(),
              // Only the first part carries the quote, so only its row records one.
              replyTo: i === 0 ? replyTo : undefined,
            });
          } catch (err) {
            console.error(`cc-plugin: reply part ${i + 1} sent but not stored: ${err}`);
          }
        }

        return { chars: text.length, parts: parts.length };
      },
```

- [ ] **Step 7: Tambahkan import di `engine.ts`**

Di blok import atas `cc-plugin/src/engine/engine.ts`, tambahkan:

```ts
import { planParts } from "./chunk";
```

- [ ] **Step 8: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test`
Expected: PASS. Kalau ada test yang gagal karena `reply` sekarang mengembalikan objek, perbaiki test itu — bukan kodenya.

- [ ] **Step 9: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/engine.ts cc-plugin/test/engine/reply-outgoing.test.ts
git commit -F- <<'EOF'
feat(reply): kirim balasan panjang sebagai beberapa pesan berurutan

Tombol hanya di potongan terakhir, kutipan hanya di potongan pertama --
keduanya dipisah jadi planSendOptionsFor() supaya bisa diuji tanpa jaringan.

Tiap potongan disimpan satu baris berikut message_id-nya sendiri, jadi
potongan mana pun bisa dikutip belakangan. Yang disimpan tetap CommonMark
mentah potongan itu, bukan hasil MarkdownV2-nya.

Gagal di tengah melempar "reply failed after N of M parts sent". Angka itu
load-bearing: potongan yang sudah mendarat tidak bisa ditarik balik, dan tanpa
angkanya langkah berikutnya adalah mengirim ulang semuanya.

Penjaga narasi tombol tetap berjalan atas teks utuh sebelum dipotong -- per
potongan, ia akan menolak balasan sah yang daftarnya kebetulan jatuh di
potongan lain.

Agent: bot-03
EOF
```

---

### Task 3: Aturan 1000 karakter di prompt + umpan balik di nilai balik tool

**Files:**
- Modify: `cc-plugin/src/server.ts:37-43` (`SERVER_INSTRUCTIONS`)
- Modify: `cc-plugin/src/server.ts:64-85` (deskripsi tool `reply` + handler)
- Modify: `cc-plugin/test/server.test.ts` (tambah kasus)

**Interfaces:**
- Consumes: `ReplyResult` dari `src/engine/engine.ts` (Task 2)
- Produces:
  - `export const REPLY_LENGTH_GUIDELINE = 1000`
  - `export function formatSendResult(result: { chars: number; parts: number }): string`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `cc-plugin/test/server.test.ts`:

```ts
import { formatSendResult, REPLY_LENGTH_GUIDELINE, SERVER_INSTRUCTIONS } from "../src/server";

test("balasan pendek dilaporkan apa adanya, tanpa teguran", () => {
  expect(formatSendResult({ chars: 642, parts: 1 })).toBe("sent (642 chars)");
});

// Aturan tanpa umpan balik akan luntur. Proyek ini sudah membayarnya sekali:
// parameter `format` di sistem lama yang seharusnya diingat AI, sampai user
// melihat **tebal** mendarat mentah di HP-nya.
test("balasan yang lewat pedoman menyebutkan itu -- ke AI, bukan ke user", () => {
  expect(formatSendResult({ chars: 1240, parts: 1 })).toBe(
    "sent (1240 chars, over the 1000 guideline)"
  );
});

test("balasan berpotongan menyebut jumlah pesannya", () => {
  expect(formatSendResult({ chars: 5100, parts: 3 })).toBe(
    "sent (5100 chars in 3 parts, over the 1000 guideline)"
  );
});

test("pedomannya satu angka bernama, bukan tersebar di beberapa tempat", () => {
  expect(REPLY_LENGTH_GUIDELINE).toBe(1000);
  expect(SERVER_INSTRUCTIONS).toContain("1000");
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test test/server.test.ts`
Expected: FAIL — `formatSendResult is not a function`

- [ ] **Step 3: Tambahkan konstanta dan formatter**

Di `cc-plugin/src/server.ts`, tepat sebelum `SERVER_INSTRUCTIONS` (baris 37), tambahkan:

```ts
/**
 * Panjang balasan yang disasar, dalam karakter.
 *
 * Bukan gerbang -- tidak ada yang ditolak karena kepanjangan, karena isi yang
 * hilang lebih buruk daripada isi yang panjang (keputusan user, 2026-08-02).
 * Angkanya dipilih dari sebaran nyata: 34% balasan 30 hari terakhir
 * melewatinya, cukup sering untuk menggigit tiap hari tanpa jadi mustahil.
 */
export const REPLY_LENGTH_GUIDELINE = 1000;

/**
 * Apa yang dilihat AI setelah `reply` berhasil.
 *
 * Dulu selalu "sent". Sebuah aturan yang tidak pernah membalas apa pun tidak
 * bisa dipelajari -- ini yang menutup jarak antara aturan yang ditulis dan
 * aturan yang terasa. Hanya AI yang melihat baris ini; user tidak.
 */
export function formatSendResult(result: { chars: number; parts: number }): string {
  const parts = result.parts > 1 ? ` in ${result.parts} parts` : "";
  const over =
    result.chars > REPLY_LENGTH_GUIDELINE ? `, over the ${REPLY_LENGTH_GUIDELINE} guideline` : "";
  return `sent (${result.chars} chars${parts}${over})`;
}
```

- [ ] **Step 4: Tambahkan aturannya ke `SERVER_INSTRUCTIONS`**

Di `cc-plugin/src/server.ts`, sisipkan dua elemen array ini sebelum baris penutup `].join("\n");`:

```ts
  "",
  `Keep replies short: aim for about ${REPLY_LENGTH_GUIDELINE} characters. This is a chat on someone's phone, not a document. If a topic needs more room, send several focused \`reply\` calls that each stand on their own rather than one long block. Nothing is ever rejected for being long -- a reply past Telegram's hard limit is split into several messages automatically -- so this is about what is worth reading, not about what fits.`,
```

- [ ] **Step 5: Tambahkan aturannya ke deskripsi tool `reply`**

Di `cc-plugin/src/server.ts`, di dalam `description:` tool `reply`, tambahkan kalimat ini sebagai potongan string terakhir (setelah kalimat `NEVER ask the user for a message id...`):

```ts
        `Keep it short -- aim for about ${REPLY_LENGTH_GUIDELINE} characters. Long replies are split into several Telegram messages automatically, so nothing is lost by writing more, but a wall of text on a phone is worse than three short messages that each land.`,
```

Catatan: ubah `description:` dari rangkaian `+` menjadi rangkaian yang tetap valid — kalau bentuk aslinya memakai `"..." + "..."`, sambungkan kalimat baru dengan `+` juga.

- [ ] **Step 6: Pakai formatter di handler**

Di `cc-plugin/src/server.ts`, ganti baris 82-83:

```ts
      await backend.reply(text, buttons, reply_to);
      return { content: [{ type: "text", text: "sent" }] };
```

dengan:

```ts
      const result = await backend.reply(text, buttons, reply_to);
      return { content: [{ type: "text", text: formatSendResult(result) }] };
```

- [ ] **Step 7: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test`
Expected: PASS. Kalau ada test lama yang menuntut `"sent"` persis, perbaiki jadi `"sent (N chars)"`.

- [ ] **Step 8: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -F- <<'EOF'
feat(server): aturan panjang 1000 karakter di prompt, plus umpan baliknya

Aturan ditulis di dua tempat yang benar-benar dibaca AI: deskripsi tool reply
dan SERVER_INSTRUCTIONS. Bukan gerbang -- tidak ada yang ditolak karena
kepanjangan, sesuai keputusan user: isi yang hilang lebih buruk daripada isi
yang panjang.

Nilai balik tool berubah dari "sent" jadi "sent (642 chars)" dan
"sent (5100 chars in 3 parts, over the 1000 guideline)". Aturan yang tidak
pernah membalas apa pun tidak bisa dipelajari; ini penawarnya.

Angka 1000 dipilih dari sebaran nyata 3.551 pesan, bukan dikira-kira: 34%
melewatinya.

Agent: bot-03
EOF
```

---

### Task 4: Rilis 0.6.0 dan verifikasi hidup

**Files:**
- Modify: `cc-plugin/.claude-plugin/plugin.json` (versi)
- Modify: `cc-plugin/package.json:3` (versi)
- Modify: `mirza-bots/README.md` (bagian kapabilitas)
- Modify: `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` (Bagian 0)

**Interfaces:**
- Consumes: seluruh Task 1-3
- Produces: `cc-plugin` 0.6.0 terpasang dan terverifikasi hidup

- [ ] **Step 1: Naikkan versi di dua berkas**

`cc-plugin/.claude-plugin/plugin.json` dan `cc-plugin/package.json`: ubah `"version": "0.5.3"` menjadi `"version": "0.6.0"`. Minor, bukan patch — kontrak nilai balik tool `reply` berubah.

**Kedua berkas wajib**, bukan salah satu: tanpa kenaikan di `plugin.json`, `claude plugin update` tidak melihat ada yang perlu diambil.

- [ ] **Step 2: Jalankan seluruh test sekali lagi**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin && bun test`
Expected: PASS, ≥213 test. Jumlahnya tidak boleh di bawah 204.

- [ ] **Step 3: Catat kapabilitas barunya di README**

Di `mirza-bots/README.md`, di bagian yang mendaftar kapabilitas, tambahkan satu baris:

```markdown
- **Balasan panjang dipotong otomatis.** Di atas batas keras Telegram (4096
  karakter setelah escaping), balasan dikirim sebagai beberapa pesan berurutan
  tanpa penanda. Tombol menempel di pesan terakhir, kutipan di pesan pertama,
  dan tiap pesan disimpan satu baris sehingga bisa dikutip belakangan. Pedoman
  menulis: ±1000 karakter — pedoman, bukan gerbang; tidak ada yang ditolak
  karena kepanjangan.
```

- [ ] **Step 4: Commit dan push repo kode**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/.claude-plugin/plugin.json cc-plugin/package.json README.md
git commit -F- <<'EOF'
release: cc-plugin 0.6.0 -- chunking balasan panjang

Minor, bukan patch: nilai balik tool reply berubah dari "sent" menjadi baris
yang menyebut panjang dan jumlah pesan.

Agent: bot-03
EOF
git push
git status -sb
```

Expected: `git status -sb` tidak menunjukkan "ahead".

- [ ] **Step 5: Pasang versi barunya**

```bash
claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
claude plugin list | grep -A 2 cc-plugin
```

Expected: baris versinya menunjukkan **0.6.0**.

- [ ] **Step 6: Minta user me-restart sesinya**

**Jangan me-restart sendiri.** Sesi yang berjalan mengunci versi plugin saat dibuka, dan tidak ada apa pun yang memberi tahu kalau langkah ini terlewat — W-18, dan W-23 adalah biayanya yang terukur. Kirim permintaan lewat Telegram dan tunggu konfirmasi.

- [ ] **Step 7: Verifikasi hidup, bukan cuma hijau di test**

Sesudah user mengonfirmasi restart, kirim ke `bot-uji` lewat Telegram:

1. Balasan pendek biasa → **satu** pesan; tool menjawab `sent (N chars)`.
2. Balasan ±1200 karakter → tetap **satu** pesan (membuktikan jalur cepat);
   tool menjawab `..., over the 1000 guideline`.
3. Balasan >4096 setelah konversi, bertombol, mengutip sebuah pesan → beberapa
   pesan; **tombol hanya di pesan terakhir**, **kutipan hanya di pesan
   pertama**, tidak ada teks yang hilang di sambungan.
4. Periksa `conversations.db`: jumlah baris `source='assistant'` yang baru =
   jumlah pesan yang benar-benar muncul di layar, masing-masing ber-`message_id`
   berbeda.

Bukti yang dicatat adalah **apa yang terlihat di Telegram**, bukan jumlah test.
Preseden proyek ini: 457 test hijau sementara `answerCallbackQuery` hilang di
produksi.

- [ ] **Step 8: Perbarui BACKLOG dan push repo dokumen**

Di `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0:
perbarui **Versi terpasang** ke `cc-plugin` 0.6.0, **Angka test** ke jumlah
sebenarnya, dan tandai celah #1 pada baris **Urutan berikutnya** sebagai
SELESAI dengan hash commit-nya. Catat hasil verifikasi hidup Step 7 apa adanya
— termasuk yang belum sempat diuji, ditandai ⬜, bukan dibiarkan tampak lulus.

```bash
cd C:\Users\Mirza\workspace\mirza-marketplace
git add docs/2026-07-26-rebuild-audit/BACKLOG.md
git commit -m "docs: celah #1 chunking SELESAI, cc-plugin 0.6.0

Agent: bot-03"
git push
```

---

## Self-Review

**Spec coverage:**

| Bagian spec | Task |
|---|---|
| §4 dua lapis | Task 1 (jaring) + Task 3 (aturan) |
| §5 aturan di deskripsi tool + SERVER_INSTRUCTIONS | Task 3 Step 4-5 |
| §5 umpan balik `sent (N chars…)` | Task 3 Step 3, 6 |
| §6.1 jalur cepat | Task 1 `planParts` + test "jalur cepat" |
| §6.2 potong dulu baru konversi | Task 1 `planParts` |
| §6.3 batas paragraf, syarat setengah jendela | Task 1 `chunkRaw` + 3 test |
| §6.4 margin 2048 + verifikasi + fallback polos | Task 1 `planParts` |
| §6.5 tombol terakhir, kutipan pertama | Task 2 `planSendOptionsFor` + 3 test |
| §7 satu baris db per potongan, teks mentah | Task 2 Step 6 |
| §8.1 error partial + potongan terkirim tetap disimpan | Task 2 Step 6 |
| §8.2 konversi membengkak | Task 1 `planParts` |
| §8.3 penjaga narasi tombol atas teks utuh | Task 2 Step 6 (komentar + posisi panggilan) |
| §9 tanpa knob, tanpa penanda | Global Constraints |
| §10 testing | Task 1 Step 1, Task 2 Step 1, Task 3 Step 1 |
| §11 berkas yang disentuh | Task 1-3 |
| §12 risiko: aturan bisa luntur | Task 4 Step 8 mencatat baseline; pengukuran ulangnya di luar rencana ini |

**Catatan jujur soal cakupan:** §10 menyebut test "gagal di potongan ke-N →
error menyebut N-1 sudah terkirim **dan** N-1 baris tersimpan di db". Rencana
ini **tidak** memuat test itu, karena menguji jalur tersebut butuh
men-stub `bot.api.sendMessage` yang saat ini dibuat di dalam `createEngine` dan
belum punya titik suntik. Menambah titik suntik itu adalah perubahan desain
tersendiri. Perilakunya tetap diimplementasikan (Task 2 Step 6) dan diverifikasi
manual. **Ini pengurangan cakupan yang disengaja, dicatat supaya tidak terbaca
sebagai lengkap.**

**Placeholder scan:** tidak ada TBD/TODO. Setiap langkah kode punya blok kode
utuh.

**Type consistency:** `OutboundPart {wire, raw, mv2}` dipakai konsisten di Task
1 dan 2. `ReplyResult {chars, parts}` didefinisikan Task 2 dan dikonsumsi Task 3
dengan nama field yang sama. `planSendOptionsFor` dipakai dengan tanda tangan
yang sama di test dan implementasi. `REPLY_LENGTH_GUIDELINE` satu-satunya sumber
angka 1000 di kode.
