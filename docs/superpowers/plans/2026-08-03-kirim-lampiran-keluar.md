# Kirim Lampiran Keluar — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool `reply` bisa mengirim berkas — foto dan dokumen — ke Telegram, dengan tiap berkas jadi pesan terpisah dan tercatat satu baris di `conversations.db`.

**Architecture:** Satu modul murni baru (`attach.ts`) memegang seluruh aturan klasifikasi dan validasi ukuran, tanpa menyentuh grammy maupun filesystem — pembaca ukuran disuntik. Satu fungsi pengirim terekspor (`sendAttachments`) memegang urutan kirim dan pelaporan kegagalan parsial, dengan API Telegram disuntik sebagai objek berisi dua metode. `engine.reply()` cuma merangkai keduanya. Semua yang punya aturan bisa diuji tanpa jaringan.

**Tech Stack:** TypeScript · Bun 1.3.11 · `bun:test` · grammy 1.45 (`InputFile`) · SQLite lewat `bun:sqlite`

**Spec:** `docs/superpowers/specs/2026-08-03-kirim-lampiran-keluar-design.md`

## Global Constraints

- Repo kode: `C:\Users\Mirza\workspace\mirza-bots`. Repo dokumen (spec + rencana ini): `C:\Users\Mirza\workspace\mirza-marketplace`. **Keduanya punya remote dan wajib di-push.**
- Tiap commit membawa trailer `Agent: bot-01` (sebelum `Co-Authored-By:` kalau ada). Jangan pernah mengubah `git config user.name`.
- Jalankan test dengan `bun test` dari `C:\Users\Mirza\workspace\mirza-bots\cc-plugin`. Baseline sebelum mulai: **241 test hijau**.
- Komentar kode: bahasa Indonesia untuk penjelasan *kenapa*, mengikuti gaya `typing.ts` dan `chunk.ts` yang sudah ada. Identifier tetap English.
- **JANGAN membandingkan path dengan `===`** — pakai `samePath()` dari `src/engine/same-path.ts` (W-22). Rencana ini tidak membandingkan path, tapi aturannya tetap berlaku kalau muncul kebutuhan.
- **JANGAN me-restart sesi user** (W-18). Uji hidup diminta ke user, lalu tunggu.
- Batas Telegram yang dipakai apa adanya, tidak dikonfigurasi: foto 10 MB, dokumen 50 MB.

---

### Task 1: Modul `attach.ts` — klasifikasi dan validasi

**Files:**
- Create: `cc-plugin/src/engine/attach.ts`
- Test: `cc-plugin/test/engine/attach.test.ts`

**Interfaces:**
- Consumes: — (modul pertama, tidak bergantung apa pun di rencana ini)
- Produces:
  - `PHOTO_EXTS: Set<string>`
  - `PHOTO_MAX_BYTES = 10 * 1024 * 1024`
  - `ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024`
  - `type PlannedAttachment = { path: string; kind: "photo" | "document"; bytes: number }`
  - `planAttachments(files: string[], sizeOf: (path: string) => number): PlannedAttachment[]`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/attach.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  planAttachments,
  PHOTO_MAX_BYTES,
  ATTACHMENT_MAX_BYTES,
  type PlannedAttachment,
} from "../../src/engine/attach";

// sizeOf palsu: peta path -> ukuran. Path yang tidak terdaftar melempar, persis
// seperti statSync pada berkas yang tidak ada.
function sizerOf(sizes: Record<string, number>): (p: string) => number {
  return (p) => {
    const s = sizes[p];
    if (s === undefined) throw new Error("ENOENT");
    return s;
  };
}

test("gambar di bawah batas foto dikirim sebagai foto", () => {
  const out = planAttachments(["C:/x/a.png"], sizerOf({ "C:/x/a.png": 1024 }));
  expect(out).toEqual([{ path: "C:/x/a.png", kind: "photo", bytes: 1024 }] as PlannedAttachment[]);
});

test("ekstensi non-gambar selalu dokumen", () => {
  const sizes = { "C:/x/a.pdf": 10, "C:/x/b.md": 10, "C:/x/c": 10 };
  const out = planAttachments(["C:/x/a.pdf", "C:/x/b.md", "C:/x/c"], sizerOf(sizes));
  expect(out.map((a) => a.kind)).toEqual(["document", "document", "document"]);
});

test("ekstensi gambar huruf besar tetap dikenali sebagai foto", () => {
  const out = planAttachments(["C:/x/A.PNG"], sizerOf({ "C:/x/A.PNG": 10 }));
  expect(out[0]!.kind).toBe("photo");
});

// Inti keputusan Q3: foto raksasa TURUN KELAS, bukan ditolak. Yang hilang cuma
// preview inline; berkasnya tetap sampai.
test("gambar di atas 10 MB turun kelas jadi dokumen, tidak ditolak", () => {
  const p = "C:/x/besar.png";
  const out = planAttachments([p], sizerOf({ [p]: PHOTO_MAX_BYTES + 1 }));
  expect(out[0]!.kind).toBe("document");
});

test("tepat 10 MB masih foto -- batasnya inklusif", () => {
  const p = "C:/x/pas.png";
  const out = planAttachments([p], sizerOf({ [p]: PHOTO_MAX_BYTES }));
  expect(out[0]!.kind).toBe("photo");
});

// Pesan errornya harus menyebut NAMA dan UKURAN: tanpa itu user cuma tahu
// "gagal", dan tidak tahu berkas mana dari lima yang jadi soal.
test("di atas 50 MB ditolak, dengan nama berkas dan ukurannya di pesan", () => {
  const p = "C:/x/raksasa.zip";
  let message = "";
  try {
    planAttachments([p], sizerOf({ [p]: ATTACHMENT_MAX_BYTES + 1 }));
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("raksasa.zip");
  expect(message).toContain("50MB");
  expect(message).toMatch(/50\.0MB/);
});

test("berkas yang tidak ada ditolak dengan path-nya", () => {
  let message = "";
  try {
    planAttachments(["C:/x/hilang.png"], sizerOf({}));
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("not found");
  expect(message).toContain("C:/x/hilang.png");
});

// Path relatif diselesaikan terhadap cwd proses MCP -- bukan folder yang ada di
// kepala pemanggilnya. Ditolak di sini, di mana pesannya bisa menyebut sebabnya.
test("path relatif ditolak", () => {
  let message = "";
  try {
    planAttachments(["docs/a.png"], sizerOf({ "docs/a.png": 10 }));
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("absolute");
});

test("path POSIX absolut diterima", () => {
  const out = planAttachments(["/home/m/a.png"], sizerOf({ "/home/m/a.png": 10 }));
  expect(out[0]!.kind).toBe("photo");
});

// Validasi mendahului pengiriman apa pun, jadi kegagalan di tengah daftar tidak
// boleh meninggalkan hasil separuh yang terlihat sah.
test("berkas bermasalah di posisi kedua tetap membatalkan seluruhnya", () => {
  const sizes = { "C:/x/a.png": 10, "C:/x/c.png": 10 };
  expect(() => planAttachments(["C:/x/a.png", "C:/x/b.png", "C:/x/c.png"], sizerOf(sizes))).toThrow();
});

test("daftar kosong bukan kesalahan", () => {
  expect(planAttachments([], sizerOf({}))).toEqual([]);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/attach'`

- [ ] **Step 3: Tulis implementasi minimal**

Buat `cc-plugin/src/engine/attach.ts`:

```ts
import { extname, isAbsolute, basename } from "node:path";

// Yang Telegram tampilkan inline dengan preview. Sisanya dikirim apa adanya
// sebagai dokumen -- tanpa kompresi, nama berkas tetap terbaca.
export const PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

/** Batas Telegram untuk sendPhoto. Di atas ini gambar tetap dikirim, sebagai dokumen. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Batas Telegram untuk sendDocument. Di atas ini tidak ada yang bisa dilakukan. */
export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export type PlannedAttachment = {
  path: string;
  kind: "photo" | "document";
  bytes: number;
};

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * Memvalidasi dan mengklasifikasi SELURUH berkas sebelum satu pun terkirim.
 *
 * Melempar pada masalah pertama, dan itu disengaja: kalau path ketiga salah
 * ketik, user tidak boleh berakhir dengan dua berkas terkirim dan sebuah error.
 * `sizeOf` disuntik supaya seluruh aturan di bawah bisa diuji tanpa filesystem.
 */
export function planAttachments(
  files: string[],
  sizeOf: (path: string) => number
): PlannedAttachment[] {
  return files.map((path) => {
    if (!isAbsolute(path)) {
      throw new Error(
        `attachment path must be absolute (relative paths resolve against the MCP process cwd, not yours): ${path}`
      );
    }

    let bytes: number;
    try {
      bytes = sizeOf(path);
    } catch {
      throw new Error(`attachment not found: ${path}`);
    }

    if (bytes > ATTACHMENT_MAX_BYTES) {
      throw new Error(
        `attachment too large: ${basename(path)} (${mb(bytes)}, max ${mb(ATTACHMENT_MAX_BYTES)})`
      );
    }

    // Gambar raksasa turun kelas, bukan ditolak: Telegram menolak sendPhoto di
    // atas 10 MB, dan yang hilang dengan mengirimnya sebagai dokumen cuma
    // preview inline. Nol dari 110 kiriman historis pernah menyentuh angka ini
    // -- tambalannya dipasang karena harganya satu percabangan, bukan karena
    // pernah terjadi.
    const isPhoto = PHOTO_EXTS.has(extname(path).toLowerCase()) && bytes <= PHOTO_MAX_BYTES;
    return { path, kind: isPhoto ? "photo" : "document", bytes };
  });
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach.test.ts`
Expected: PASS, 11 test

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 252 pass (241 baseline + 11)

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/attach.ts cc-plugin/test/engine/attach.test.ts
git commit -m "feat(attach): klasifikasi dan validasi berkas keluar

Modul murni, sizeOf disuntik. Foto >10MB turun kelas jadi dokumen; apa pun
>50MB ditolak sebelum ada yang terkirim, dengan nama dan ukuran di pesannya.

Agent: bot-01"
```

---

### Task 2: `storeOutgoing` bisa menyimpan baris lampiran

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts:101-122` (`storeOutgoing`)
- Test: `cc-plugin/test/engine/reply-outgoing.test.ts` (tambah kasus, jangan ubah yang ada)

**Interfaces:**
- Consumes: `PlannedAttachment` dari Task 1 (untuk `kind`)
- Produces: `storeOutgoing(db, msg)` dengan dua field opsional baru — `text` menjadi opsional:
  ```ts
  {
    bot: string; chatId: string; messageId?: string;
    text?: string; sessionId?: string; replyTo?: string;
    attachments?: string[];              // path, disimpan sebagai JSON array
    kind?: "photo" | "document";         // masuk ke kolom metadata
  }
  ```

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `cc-plugin/test/engine/reply-outgoing.test.ts`:

```ts
import { encodeMetadata } from "../../src/engine/db/conversations-schema";

test("baris lampiran menyimpan path di kolom attachments dan kind di metadata", () => {
  const db = openConversationsDb(":memory:");

  storeOutgoing(db, {
    bot: "bot-uji",
    chatId: "111",
    messageId: "700",
    attachments: ["C:/x/a.png"],
    kind: "photo",
    sessionId: "sess-9",
  });

  const row = db
    .query("SELECT source, message_id, text, attachments, metadata, session_id FROM messages")
    .get() as any;
  expect(row.source).toBe("assistant");
  expect(row.message_id).toBe("700");
  // Teksnya sudah jadi barisnya sendiri; baris berkas tidak menduplikasinya.
  expect(row.text).toBeNull();
  expect(JSON.parse(row.attachments)).toEqual(["C:/x/a.png"]);
  expect(JSON.parse(row.metadata)).toEqual({ kind: "photo" });
  expect(row.session_id).toBe("sess-9");
});

// Kutipan hanya di pesan pertama -- aturan yang sudah berlaku untuk chunking,
// dan berkas bukan pesan pertama. 0 dari 110 kiriman historis pernah memakainya.
test("baris lampiran tidak membawa kutipan", () => {
  const db = openConversationsDb(":memory:");
  storeOutgoing(db, {
    bot: "bot-uji",
    chatId: "111",
    messageId: "703",
    attachments: ["C:/x/a.png"],
    kind: "photo",
  });

  const row = db.query("SELECT reply_to FROM messages").get() as any;
  expect(row.reply_to).toBeNull();
});

test("dokumen tercatat dengan kind document", () => {
  const db = openConversationsDb(":memory:");
  storeOutgoing(db, {
    bot: "bot-uji",
    chatId: "111",
    messageId: "701",
    attachments: ["C:/x/a.pdf"],
    kind: "document",
  });

  const row = db.query("SELECT metadata FROM messages").get() as any;
  expect(JSON.parse(row.metadata)).toEqual({ kind: "document" });
});

// Kolom yang berisi string "{}" akan memaksa setiap pembaca nanti
// memperlakukannya sebagai kasus khusus "ada tapi kosong".
test("balasan teks biasa tidak menulis apa pun ke attachments maupun metadata", () => {
  const db = openConversationsDb(":memory:");
  storeOutgoing(db, { bot: "bot-uji", chatId: "111", messageId: "702", text: "halo" });

  const row = db.query("SELECT attachments, metadata FROM messages").get() as any;
  expect(row.attachments).toBeNull();
  expect(row.metadata).toBeNull();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/reply-outgoing.test.ts`
Expected: FAIL — `attachments` tidak dikenali di tipe argumen, dan kolomnya NULL

- [ ] **Step 3: Tulis implementasi minimal**

Ganti `storeOutgoing` di `cc-plugin/src/engine/engine.ts` (baris 101-122) dengan:

```ts
export function storeOutgoing(
  db: Database,
  msg: {
    bot: string;
    chatId: string;
    messageId?: string;
    text?: string;
    sessionId?: string;
    replyTo?: string;
    /** Path berkas yang pesan ini bawa. Satu baris per berkas, jadi selalu berisi satu. */
    attachments?: string[];
    kind?: "photo" | "document";
  }
): void {
  insertMessage(db, {
    ts: new Date().toISOString(),
    bot: msg.bot,
    chatId: msg.chatId,
    messageId: msg.messageId,
    source: "assistant",
    text: msg.text,
    replyTo: msg.replyTo,
    sessionId: msg.sessionId,
    attachments: msg.attachments ? JSON.stringify(msg.attachments) : undefined,
    // encodeMetadata mengembalikan undefined kalau tidak ada isinya, sehingga
    // kolomnya NULL alih-alih string "{}".
    metadata: encodeMetadata({ ...(msg.kind !== undefined ? { kind: msg.kind } : {}) }),
  });
}
```

Tambahkan `encodeMetadata` ke import yang sudah ada di baris 14:

```ts
import { openConversationsDb, insertMessage, encodeMetadata } from "./db/conversations-schema";
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/reply-outgoing.test.ts`
Expected: PASS — 11 test lama + 3 baru

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 255 pass

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/engine.ts cc-plugin/test/engine/reply-outgoing.test.ts
git commit -m "feat(engine): storeOutgoing bisa menyimpan baris lampiran

Kolom attachments dan metadata.kind sudah ada di skema dan sudah dipakai arah
masuk; arah keluar sekarang memakai bentuk yang sama, jadi riwayatnya simetris.
Tidak ada perubahan skema.

Agent: bot-01"
```

---

### Task 3: `sendAttachments` — urutan kirim dan kegagalan parsial

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts` (tambah fungsi terekspor, taruh tepat sesudah `planSendOptionsFor` di baris 174)
- Test: `cc-plugin/test/engine/attach-send.test.ts` (Create)

**Interfaces:**
- Consumes: `PlannedAttachment` dari Task 1
- Produces:
  ```ts
  export type AttachmentApi = {
    sendPhoto(chatId: string, file: unknown): Promise<{ message_id: number }>;
    sendDocument(chatId: string, file: unknown): Promise<{ message_id: number }>;
  };

  export async function sendAttachments(
    api: AttachmentApi,
    chatId: string,
    planned: PlannedAttachment[],
    toInput: (path: string) => unknown,
    onSent: (a: PlannedAttachment, messageId: string) => void
  ): Promise<number>;
  ```
  Mengembalikan jumlah berkas yang benar-benar terkirim. `onSent` dipanggil sesudah tiap kiriman sukses — itu yang membuat berkas yang sudah mendarat tetap tercatat meski berkas berikutnya gagal.

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/attach-send.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sendAttachments, type AttachmentApi } from "../../src/engine/engine";
import type { PlannedAttachment } from "../../src/engine/attach";

type Call = { method: "photo" | "document"; chatId: string; file: unknown };

function fakeApi(opts: { failOn?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const send = (method: "photo" | "document") => async (chatId: string, file: unknown) => {
    n++;
    if (opts.failOn === n) throw new Error("Bad Request: file is too big");
    calls.push({ method, chatId, file });
    return { message_id: 900 + n };
  };
  const api: AttachmentApi = { sendPhoto: send("photo"), sendDocument: send("document") };
  return { api, calls };
}

const photo: PlannedAttachment = { path: "C:/x/a.png", kind: "photo", bytes: 10 };
const doc: PlannedAttachment = { path: "C:/x/b.pdf", kind: "document", bytes: 10 };

test("foto lewat sendPhoto, dokumen lewat sendDocument", async () => {
  const { api, calls } = fakeApi();
  await sendAttachments(api, "111", [photo, doc], (p) => ({ path: p }), () => {});
  expect(calls.map((c) => c.method)).toEqual(["photo", "document"]);
  expect(calls[0]!.chatId).toBe("111");
});

test("urutan kirim mengikuti urutan masukan", async () => {
  const { api, calls } = fakeApi();
  const three = [photo, doc, { ...photo, path: "C:/x/c.png" }];
  await sendAttachments(api, "111", three, (p) => p, () => {});
  expect(calls.map((c) => c.file)).toEqual(["C:/x/a.png", "C:/x/b.pdf", "C:/x/c.png"]);
});

test("onSent menerima id yang Telegram berikan, per berkas", async () => {
  const { api } = fakeApi();
  const seen: Array<[string, string]> = [];
  await sendAttachments(api, "111", [photo, doc], (p) => p, (a, id) => seen.push([a.path, id]));
  expect(seen).toEqual([
    ["C:/x/a.png", "901"],
    ["C:/x/b.pdf", "902"],
  ]);
});

test("mengembalikan jumlah berkas yang terkirim", async () => {
  const { api } = fakeApi();
  expect(await sendAttachments(api, "111", [photo, doc], (p) => p, () => {})).toBe(2);
});

// Yang sudah mendarat tidak bisa ditarik. Tanpa angka di pesan errornya,
// langkah berikutnya adalah mengirim ulang semuanya -- dan user terima dobel.
test("gagal di berkas kedua: pesannya menyebut berapa yang sudah terkirim", async () => {
  const { api } = fakeApi({ failOn: 2 });
  let message = "";
  try {
    await sendAttachments(api, "111", [photo, doc, photo], (p) => p, () => {});
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("1 of 3");
  expect(message).toContain("text already delivered");
  expect(message).toContain("file is too big");
});

// Berkas pertama sudah ada di HP user; barisnya harus tetap tercatat meski
// yang kedua meledak, kalau tidak riwayatnya berbohong.
test("berkas yang terlanjur terkirim tetap dilaporkan lewat onSent walau berikutnya gagal", async () => {
  const { api } = fakeApi({ failOn: 2 });
  const seen: string[] = [];
  try {
    await sendAttachments(api, "111", [photo, doc], (p) => p, (a) => seen.push(a.path));
  } catch {}
  expect(seen).toEqual(["C:/x/a.png"]);
});

test("daftar kosong tidak memanggil API sama sekali", async () => {
  const { api, calls } = fakeApi();
  expect(await sendAttachments(api, "111", [], (p) => p, () => {})).toBe(0);
  expect(calls.length).toBe(0);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach-send.test.ts`
Expected: FAIL — `sendAttachments` tidak diekspor dari `engine`

- [ ] **Step 3: Tulis implementasi minimal**

Tambahkan di `cc-plugin/src/engine/engine.ts`, tepat sesudah `planSendOptionsFor` (baris 174), dan tambahkan import `PlannedAttachment` di dekat import lain:

```ts
import type { PlannedAttachment } from "./attach";
```

```ts
/**
 * Bagian API Telegram yang dibutuhkan pengiriman berkas -- dua metode, bukan
 * seluruh objek grammy, supaya test tidak perlu bot sungguhan.
 */
export type AttachmentApi = {
  sendPhoto(chatId: string, file: unknown): Promise<{ message_id: number }>;
  sendDocument(chatId: string, file: unknown): Promise<{ message_id: number }>;
};

/**
 * Mengirim berkas satu per satu, berurutan.
 *
 * `onSent` dipanggil sesudah TIAP kiriman sukses, bukan sekali di akhir: kalau
 * berkas ketiga meledak, dua yang pertama sudah ada di HP user dan barisnya
 * harus tetap tercatat.
 *
 * `toInput` menyuntikkan pembungkus berkas grammy (`InputFile`) supaya modul ini
 * bisa diuji tanpa menyentuh filesystem maupun jaringan.
 */
export async function sendAttachments(
  api: AttachmentApi,
  chatId: string,
  planned: PlannedAttachment[],
  toInput: (path: string) => unknown,
  onSent: (a: PlannedAttachment, messageId: string) => void
): Promise<number> {
  let sent = 0;
  for (const a of planned) {
    let msg;
    try {
      const input = toInput(a.path);
      msg = a.kind === "photo" ? await api.sendPhoto(chatId, input) : await api.sendDocument(chatId, input);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // "text already delivered" ada supaya pemanggilnya tahu mengirim ulang
      // seluruh balasan akan menggandakan teksnya.
      throw new Error(
        `reply failed after ${sent} of ${planned.length} attachment(s) sent (text already delivered): ${reason}`
      );
    }
    sent++;
    onSent(a, String(msg.message_id));
  }
  return sent;
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach-send.test.ts`
Expected: PASS, 7 test

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 262 pass

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/engine.ts cc-plugin/test/engine/attach-send.test.ts
git commit -m "feat(engine): sendAttachments dengan pelaporan kegagalan parsial

API Telegram dan pembungkus InputFile disuntik, jadi seluruh urutan kirim dan
pesan errornya bisa diuji tanpa jaringan. onSent dipanggil per berkas sukses
supaya yang terlanjur mendarat tetap tercatat saat berikutnya gagal.

Agent: bot-01"
```

---

### Task 4: `engine.reply()` menerima `files`

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts:39-44` (`ReplyResult`), `:58` (tipe `Engine`), `:443-516` (badan `reply`)
- Test: `cc-plugin/test/engine/attach-send.test.ts` (tambah kasus pagar)

**Interfaces:**
- Consumes: `planAttachments` (Task 1), `storeOutgoing` dengan `attachments`/`kind` (Task 2), `sendAttachments` (Task 3)
- Produces:
  - `ReplyResult` bertambah `files: number`
  - `Engine.reply(text, buttons?, replyTo?, files?)`
  - `assertNoButtonsWithFiles(buttons, files): void` — terekspor supaya pagarnya bisa diuji tanpa engine hidup
  - `prepareReply(text, buttons, files, sizeOf): { parts: OutboundPart[]; planned: PlannedAttachment[] }` — **semua** yang harus terjadi sebelum apa pun terkirim, dalam satu fungsi (`OutboundPart` sudah ada, diekspor dari `./chunk`)

**Kenapa `prepareReply` ada, dan bukan tiga panggilan berurutan di dalam `reply`.**
Kontrak paling penting desain ini adalah *path yang salah ketik tidak boleh
meninggalkan teks yang sudah mendarat*. Kalau pagarnya tersebar sebagai tiga
baris di dalam `reply`, urutan itu dijaga oleh kedisiplinan orang berikutnya
yang menyunting fungsi itu. Dikumpulkan jadi satu fungsi yang dipanggil satu
kali di atas loop pengiriman, urutannya dijaga oleh strukturnya — dan seluruh
aturannya bisa diuji tanpa bot, tanpa jaringan, tanpa filesystem.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `cc-plugin/test/engine/attach-send.test.ts`:

```ts
import { assertNoButtonsWithFiles } from "../../src/engine/engine";

// Berkas dikirim SESUDAH teks, jadi tombolnya nyangkut di pesan yang sekarang
// ada di atas berkas -- user harus scroll balik ke atas untuk menekannya.
test("buttons dan files bersama ditolak, dan pesannya menyebut jalan keluarnya", () => {
  let message = "";
  try {
    assertNoButtonsWithFiles([[{ text: "ya", data: "y" }]], ["C:/x/a.png"]);
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("buttons");
  expect(message).toContain("files");
  expect(message).toContain("separate");
});

test("salah satu saja tidak ditolak", () => {
  expect(() => assertNoButtonsWithFiles([[{ text: "ya", data: "y" }]], undefined)).not.toThrow();
  expect(() => assertNoButtonsWithFiles(undefined, ["C:/x/a.png"])).not.toThrow();
  expect(() => assertNoButtonsWithFiles(undefined, undefined)).not.toThrow();
});

// files: [] setara dengan tidak memberikan files sama sekali.
test("files kosong bersama buttons tidak ditolak", () => {
  expect(() => assertNoButtonsWithFiles([[{ text: "ya", data: "y" }]], [])).not.toThrow();
});
```

Dan test untuk `prepareReply`, di berkas yang sama:

```ts
import { prepareReply } from "../../src/engine/engine";

const sizer = (sizes: Record<string, number>) => (p: string) => {
  const s = sizes[p];
  if (s === undefined) throw new Error("ENOENT");
  return s;
};

test("prepareReply mengembalikan potongan teks dan berkas terklasifikasi", () => {
  const out = prepareReply("halo", undefined, ["C:/x/a.png"], sizer({ "C:/x/a.png": 10 }));
  expect(out.parts.length).toBe(1);
  expect(out.planned).toEqual([{ path: "C:/x/a.png", kind: "photo", bytes: 10 }]);
});

test("tanpa files, planned kosong", () => {
  expect(prepareReply("halo", undefined, undefined, sizer({})).planned).toEqual([]);
});

// Inti kontraknya: berkas yang tidak ada membatalkan SEBELUM ada yang terkirim.
// Karena seluruh pagar duduk di fungsi ini dan fungsi ini dipanggil satu kali di
// atas loop pengiriman, urutan itu dijaga oleh struktur, bukan oleh ingatan.
test("berkas yang tidak ada membatalkan seluruh balasan", () => {
  expect(() => prepareReply("halo", undefined, ["C:/x/hilang.png"], sizer({}))).toThrow(/not found/);
});

test("pagar tombol tak ternarasi tetap berlaku lewat prepareReply", () => {
  expect(() =>
    prepareReply("halo tanpa daftar bernomor", [[{ text: "ya", data: "y" }]], undefined, sizer({}))
  ).toThrow();
});

test("buttons bersama files dibatalkan di sini juga", () => {
  expect(() =>
    prepareReply("1. ya\n2. tidak", [[{ text: "ya", data: "y" }]], ["C:/x/a.png"], sizer({ "C:/x/a.png": 10 }))
  ).toThrow(/cannot be combined/);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach-send.test.ts`
Expected: FAIL — `assertNoButtonsWithFiles` tidak diekspor

- [ ] **Step 3: Tulis implementasi**

**3a.** Ubah `ReplyResult` (baris 39-44) menjadi:

```ts
export interface ReplyResult {
  /** Panjang CommonMark yang ditulis AI, bukan panjang setelah escaping. */
  chars: number;
  /** Berapa pesan Telegram yang keluar. 1 untuk sebagian besar balasan. */
  parts: number;
  /** Berapa berkas ikut terkirim. 0 untuk balasan teks biasa. */
  files: number;
}
```

**3b.** Ubah baris `58` (anggota `reply` pada tipe `Engine`):

```ts
  reply(text: string, buttons?: ButtonRow[], replyTo?: string, files?: string[]): Promise<ReplyResult>;
```

**3c.** Tambahkan kedua fungsi terekspor, tepat sesudah `sendAttachments`:

```ts
/**
 * Menolak `buttons` dan `files` dalam satu panggilan.
 *
 * Bukan batasan teknis: berkas dikirim sesudah teks, jadi keyboardnya menempel
 * pada pesan yang sekarang berada di ATAS berkas-berkasnya. User harus menggulir
 * balik ke atas untuk menekan tombol yang seharusnya menjadi langkah berikutnya.
 */
export function assertNoButtonsWithFiles(
  buttons: ButtonRow[] | undefined,
  files: string[] | undefined
): void {
  if (buttons !== undefined && buttons.length > 0 && files !== undefined && files.length > 0) {
    throw new Error(
      "buttons and files cannot be combined in one reply: send the files first, then the buttons in a separate reply call"
    );
  }
}

/**
 * SEMUA yang harus terjadi sebelum satu byte pun berangkat ke Telegram.
 *
 * Dikumpulkan jadi satu fungsi dengan sengaja. Kontrak terpenting fitur ini --
 * *path yang salah ketik tidak boleh meninggalkan teks yang sudah mendarat* --
 * adalah soal URUTAN, dan urutan yang dijaga oleh tiga baris berjejer di dalam
 * `reply` hanya bertahan selama orang berikutnya yang menyunting fungsi itu
 * mengingat kenapa. Satu panggilan di atas loop pengiriman menjadikannya
 * struktur, bukan ingatan.
 *
 * `sizeOf` disuntik supaya seluruh pagarnya bisa diuji tanpa filesystem.
 */
export function prepareReply(
  text: string,
  buttons: ButtonRow[] | undefined,
  files: string[] | undefined,
  sizeOf: (path: string) => number
): { parts: OutboundPart[]; planned: PlannedAttachment[] } {
  // Membaca teks AI sebelum escaping MarkdownV2 dan sebelum pemotongan --
  // alasan lengkapnya di komentar findMissingButtonNarration.
  const unnarrated = findMissingButtonNarration(text, buttons);
  if (unnarrated) throw new Error(unnarrated);

  assertNoButtonsWithFiles(buttons, files);

  const planned =
    files !== undefined && files.length > 0 ? planAttachments(files, sizeOf) : [];

  return { parts: planParts(text), planned };
}
```

Tambahkan `OutboundPart` ke import `./chunk` yang sudah ada di baris 35:

```ts
import { planParts, type OutboundPart } from "./chunk";
```

**3d.** Ubah badan `reply` (baris 443-516). Signature dan tiga sisipan:

```ts
      async reply(
        text: string,
        buttons?: ButtonRow[],
        replyTo?: string,
        files?: string[]
      ): Promise<ReplyResult> {
        const chatId = lastChatByBot.get(botName);
        if (!chatId) {
          throw new Error(
            "no_known_chat: this bot has not received a message yet, so there is nobody to reply to"
          );
        }
        typing.stop(chatId);

        // Satu panggilan, di atas segalanya: narasi tombol, pagar buttons+files,
        // validasi berkas, dan pemotongan teks. Kalau ada yang salah, tidak ada
        // satu pun pesan yang terlanjur berangkat.
        const { parts, planned } = prepareReply(text, buttons, files, (p) => statSync(p).size);

        const replyMarkup = buttons ? buildInlineKeyboard(buttons) : undefined;

        // ... loop pengiriman teks TIDAK BERUBAH, sampai akhir loop ...

        // Sesudah loop teks, sebelum return:
        const filesSent = await sendAttachments(
          bot.api as unknown as AttachmentApi,
          chatId,
          planned,
          (p) => new InputFile(p),
          (a, messageId) => {
            // Sama seperti baris teks: gagal menyimpan TIDAK fatal. Pesannya
            // sudah ada di HP user, dan melempar di sini membuat AI mengira
            // pengirimannya gagal.
            try {
              storeOutgoing(conversationsDb, {
                bot: botName,
                chatId,
                messageId,
                attachments: [a.path],
                kind: a.kind,
                sessionId: sink.sessionId(),
              });
            } catch (err) {
              console.error(`cc-plugin: attachment sent but not stored: ${err}`);
            }
          }
        );

        return { chars: text.length, parts: parts.length, files: filesSent };
      },
```

**3e.** Tambahkan import yang dibutuhkan di bagian atas `engine.ts`:

```ts
import { statSync } from "node:fs";
import { InputFile } from "grammy";
import { planAttachments, type PlannedAttachment } from "./attach";
```

`InputFile` mungkin perlu digabung ke baris import grammy yang sudah ada — periksa dulu, jangan buat dua baris import dari modul yang sama.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/engine/attach-send.test.ts`
Expected: PASS, 15 test

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 270 pass. Kalau ada test lama yang gagal karena `ReplyResult` sekarang punya `files`, perbaiki test itu — jangan longgarkan tipenya.

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/engine/engine.ts cc-plugin/test/engine/attach-send.test.ts
git commit -m "feat(engine): reply() menerima files

Validasi berkas dan pagar buttons+files berjalan sebelum satu panggilan API pun
terjadi, jadi path yang salah ketik tidak meninggalkan teks yang sudah mendarat
tanpa berkasnya. Tiap berkas jadi satu baris db dengan message_id sendiri.

Agent: bot-01"
```

---

### Task 5: Tool `reply` mengekspos `files` ke AI

**Files:**
- Modify: `cc-plugin/src/server.ts:50-55` (`formatSendResult`), `:90-112` (registrasi tool `reply`)
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: `ReplyResult.files` (Task 4), `backend.reply(text, buttons, reply_to, files)`
- Produces: skema tool dengan `files?: string[]`; `formatSendResult` menyebut jumlah berkas

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `cc-plugin/test/server.test.ts` (di dekat test `formatSendResult` yang sudah ada):

```ts
test("hasil kirim menyebut jumlah berkas, supaya aturannya punya umpan balik", () => {
  expect(formatSendResult({ chars: 636, parts: 1, files: 2 })).toContain("2 files");
});

test("satu berkas ditulis tunggal", () => {
  expect(formatSendResult({ chars: 10, parts: 1, files: 1 })).toContain("1 file");
});

// Balasan teks biasa adalah mayoritas mutlak; barisnya tidak boleh jadi lebih
// berisik hanya karena fitur ini ada.
test("balasan tanpa berkas tidak menyebut berkas sama sekali", () => {
  expect(formatSendResult({ chars: 10, parts: 1, files: 0 })).not.toContain("file");
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/server.test.ts`
Expected: FAIL — argumen `files` tidak ada pada tipe, dan keluarannya tidak memuat "2 files"

- [ ] **Step 3: Tulis implementasi**

**3a.** `formatSendResult` di `cc-plugin/src/server.ts` (baris 50-55):

```ts
export function formatSendResult(result: { chars: number; parts: number; files: number }): string {
  const parts = result.parts > 1 ? `, ${result.parts} parts` : "";
  const over =
    result.chars > REPLY_LENGTH_GUIDELINE ? `, over the ${REPLY_LENGTH_GUIDELINE} guideline` : "";
  const files = result.files > 0 ? `, ${result.files} file${result.files > 1 ? "s" : ""}` : "";
  return `sent (${result.chars} chars${parts}${over}${files})`;
}
```

**3b.** Skema dan penerusan pada registrasi tool `reply` (baris 99-111):

```ts
      inputSchema: {
        text: z.string().min(1),
        buttons: z
          .array(z.array(z.object({ text: z.string().min(1), data: z.string().min(1) })))
          .optional(),
        reply_to: z.string().min(1).optional(),
        files: z.array(z.string().min(1)).optional(),
      },
    },
    async ({ text, buttons, reply_to, files }) => {
      if (isUnavailable(backend)) return unavailableAnswer(backend);
      const result = await backend.reply(text, buttons, reply_to, files);
      return { content: [{ type: "text", text: formatSendResult(result) }] };
    }
```

**3c.** Tambahkan pada deskripsi tool `reply` (baris 94-98), sesudah kalimat tentang `reply_to`:

```ts
        "Attach files with `files`: an array of ABSOLUTE paths. Images (.jpg .jpeg .png .gif .webp) arrive as photos with an inline preview; anything else arrives as a document. Each file is its own Telegram message, sent after the text. `files` cannot be combined with `buttons` -- send the files first, then the buttons in a separate call. " +
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test test/server.test.ts`
Expected: PASS

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 273 pass, nol gagal

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -m "feat(server): tool reply menerima files

Nilai balik tool menyebut jumlah berkas terkirim -- aturan tanpa umpan balik
tidak bisa dipelajari, dan deskripsi tool saja bukan umpan balik.

Agent: bot-01"
```

---

### Task 6: Rilis 0.8.0 dan uji hidup

**Files:**
- Modify: `cc-plugin/package.json:3` · `cc-plugin/.claude-plugin/plugin.json:4` · `README.md:227` — ketiganya memuat `"version": "0.7.0"` (diverifikasi dengan `git grep` 2026-08-03)
- Modify: `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0 (blok "Kondisi sekarang")

- [ ] **Step 1: Naikkan versi di tiga tempat**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git grep -n "0\.7\.0"
```

Ubah setiap kecocokan `0.7.0` → `0.8.0`. Minor, bukan patch: ini kapabilitas baru pada permukaan tool. Kalau `git grep` mengembalikan lebih dari tiga baris, versinya sudah menyebar sejak rencana ini ditulis — ubah semuanya.

- [ ] **Step 2: Jalankan seluruh test sekali lagi**

Run: `cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin; bun test`
Expected: 273 pass, nol gagal. **Angka ini harus dikutip apa adanya dari keluaran, bukan dari ingatan.**

- [ ] **Step 3: Commit dan push kode**

```bash
cd C:\Users\Mirza\workspace\mirza-bots
git add -A
git commit -m "release: cc-plugin 0.8.0 -- kirim lampiran keluar

Agent: bot-01"
git push
git status -sb
```

`git status -sb` tidak boleh menunjukkan "ahead" sesudah push.

- [ ] **Step 4: Minta user memasang dan menguji hidup**

Kirim lewat tool `reply` Telegram. Sebutkan **prosedur update plugin tiga langkah** dari `mirza-bots/README.md` (baca dulu, kutip apa adanya), dan ingat **W-18**: sesi memakai versi plugin saat sesi dibuka, jadi sesi lama tetap menjalankan kode lama tanpa sinyal apa pun. **JANGAN me-restart sesi user sendiri (W-18/W-23)** — minta, lalu tunggu konfirmasi.

Empat kriteria uji hidup, ditulis sebagai daftar bernomor supaya user bisa melaporkannya satu per satu:

1. Satu `.png` → mendarat sebagai foto dengan preview inline
2. Satu `.pdf` atau `.md` → mendarat sebagai dokumen dengan nama berkas terbaca
3. Dua berkas dalam satu panggilan → dua pesan, urutannya sama dengan urutan yang diminta
4. Path yang salah ketik → **tidak ada apa pun yang terkirim**, termasuk teksnya, dan pesan errornya menyebut path itu

Kriteria 4 adalah yang paling mudah lolos dari test dan paling mahal kalau salah — di situlah "validasi sebelum kirim" benar-benar terbukti atau tidak.

- [ ] **Step 5: Verifikasi baris database sesudah uji hidup**

Sesudah user melaporkan hasilnya, periksa `conversations.db` — **readonly**, dan jangan pernah menyapa bot produksi untuk diagnosa:

```ts
// bun run dari scratchpad
import { Database } from "bun:sqlite";
const db = new Database("C:/Users/Mirza/.claude/mirza-bots/conversations.db", { readonly: true });
console.log(
  db.query(
    "SELECT ts, message_id, text, attachments, metadata FROM messages WHERE source='assistant' AND attachments IS NOT NULL ORDER BY id DESC LIMIT 10"
  ).all()
);
```

Yang harus terlihat: satu baris per berkas · `message_id` berbeda-beda · `text` NULL · `attachments` memuat path · `metadata` memuat `kind` yang benar.

**Ketiadaan di satu meteran bukan bukti** — kalau ada yang tampak hilang, periksa dulu apakah jalur itu memang pernah menulis ke sana sebelum melaporkannya sebagai kegagalan.

- [ ] **Step 6: Perbarui BACKLOG dan push dokumen**

Di `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0, blok "Kondisi sekarang":

- baris **Versi terpasang** → `cc-plugin` **0.8.0**
- baris **Angka test** → angka nyata dari Step 2
- baris **Urutan berikutnya** → tandai celah #3 SELESAI dengan hash merge-nya, dan sebutkan celah berikutnya (#4 system-outbox 7,2/hari)
- tambahkan baris **Celah #3 — hasil uji hidup** dengan keempat kriteria dan hasilnya apa adanya

```bash
cd C:\Users\Mirza\workspace\mirza-marketplace
git add -A
git commit -m "docs(backlog): celah #3 kirim lampiran keluar selesai

Agent: bot-01"
git push
git status -sb
```

---

## Catatan untuk pelaksana

**Yang paling mudah salah di rencana ini**, dan kenapa:

- **Urutan di Task 4 adalah desainnya**, bukan gaya penulisan. `planAttachments` harus berjalan sebelum potongan teks pertama dikirim. Kalau dipindah ke bawah loop teks — yang terlihat lebih rapi karena mengelompokkan semua urusan berkas — path yang salah ketik akan meninggalkan teks yang sudah mendarat tanpa berkas yang dijanjikannya, dan itu persis kegagalan yang paling membingungkan bagi user.
- **`onSent` per berkas, bukan sekali di akhir.** Kalau penyimpanan dikumpulkan sesudah semua kiriman selesai, berkas yang terlanjur mendarat sebelum kegagalan tidak akan pernah tercatat.
- **Jangan pakai `sendMediaGroup`.** Album sengaja tidak dibangun (spec §5). Ia bukan optimasi yang boleh disisipkan diam-diam; ia keputusan yang user ambil.
- **Jangan menambahkan penjagaan `assertSendable`.** User memilih tidak membangunnya, dengan alasan yang tertulis di spec §3b. Kalau tampak seperti kelalaian, baca dulu section itu.
- **Teks umpan di test `prepareReply` mungkin perlu disesuaikan.** Dua test memancing pagar narasi tombol (`findMissingButtonNarration`); kalau bentuk daftar bernomor yang diterimanya berbeda dari `"1. ya\n2. tidak"`, sesuaikan teksnya agar test itu menguji pagar yang dimaksud, bukan pagar narasi.

**Dua hal yang sengaja TIDAK punya test unit**, dicatat supaya tidak terbaca sebagai kelalaian:

- **"Teks tidak terkirim saat berkas tidak valid."** Yang teruji adalah `prepareReply` melempar; bahwa ia dipanggil di atas loop pengiriman dijaga oleh strukturnya, dan dibuktikan oleh kriteria uji hidup nomor 4 di Task 6. Menguji ini sebagai unit menuntut seluruh badan `reply` dipecah keluar dari closure engine — biaya yang lebih besar daripada yang ia beli.
- **"Kegagalan simpan db tidak membuat `reply` melempar."** Dijaga `try/catch` di dalam `onSent`, mengikuti pola yang sudah dipakai baris teks tepat di atasnya. Sama-sama di dalam closure.
