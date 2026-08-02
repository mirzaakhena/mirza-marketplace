# Tahap 2.5-KELUAR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melengkapi jalur keluar — balasan bot tersimpan, bisa mengutip, tampil
dengan format yang benar, dan distempel identitas sesi yang tidak basi.

**Architecture:** Semuanya di dalam `cc-plugin` 0.4.0 (satu paket, tanpa daemon).
Item 0 menambah hook `SessionStart` + berkas kecil yang dibaca engine saat push.
Item 1–2 menyentuh `engine.reply` dan tool `reply`. Item 3 menambah satu
dependency dan satu modul 20-baris.

**Tech Stack:** TypeScript · Bun 1.3.11 · grammy · `bun:sqlite` · `telegramify-markdown` · `bun test`

**Spec:** `docs/superpowers/specs/2026-08-02-tahap25-keluar-design.md`


> **Status 2026-08-02: Task 1-5 SELESAI, ter-merge ke `main`, dan seluruhnya
> terverifikasi hidup lewat Telegram sungguhan** (`cc-plugin` 0.5.3, 204 test).
> Dua bug ditemukan justru oleh verifikasi hidup itu dan sudah ditutup: **W-21**
> (konverter markdown menolak tabel) dan **W-22** (path dieja dua cara, hook
> menyala tapi tidak pernah cocok). Sisa Task 6 tinggal dokumen.

## Global Constraints

- **Baseline test saat ini: `cc-plugin` 168, hijau di Windows 11 / Bun 1.3.11.**
  Setiap task menyebutkan selisihnya, dan selisih itu **dihitung, bukan
  diperkirakan** — angka yang bergeser tanpa penjelasan berarti ada test yang
  hilang tanpa disengaja.
- **JANGAN pakai `expect(...).rejects`** untuk promise yang settle di luar
  giliran event loop — di Windows matcher itu menggantung tanpa batas (W-6).
  Pakai `try/catch`.
- **JANGAN menulis `config.json`** tanpa menjalankan ulang `icacls <file>
  /inheritance:r /grant:r "Mirza:(R,W)"` (W-13), dan **jangan pernah dengan BOM**
  (SCAR-026).
- **JANGAN menyapa bot produksi untuk diagnosa.** Baca `conversations.db` dengan
  `new Database(path, { readonly: true })` bila perlu mengintip.
- Tiap commit membawa trailer **`Agent: <bot-name>`** sebelum `Co-Authored-By:`.
- Komentar kode **Inggris**; dokumen dan pesan commit **Indonesia**.
- Naikkan versi di `cc-plugin/package.json` **dan**
  `cc-plugin/.claude-plugin/plugin.json` sebelum meminta user memasang, lalu
  ingat: **sesi yang sedang berjalan tetap memakai versi lama sampai dibuka
  ulang** (W-18).

---

### Task 1: Buktikan `SessionStart` menyala pada `/clear`

**Tidak menulis kode produk.** Seluruh item 0 berdiri di atas asumsi ini, dan
kalau asumsinya salah, lebih baik ketahuan sebelum ada yang dibangun.

**Files:**
- Create: `cc-plugin/hooks/session-probe.ts` (sementara, dihapus di Task 2)
- Modify: `cc-plugin/hooks/hooks.json`

**Interfaces:**
- Consumes: —
- Produces: jawaban ya/tidak, ditulis ke handoff atau langsung ke Task 2.

- [x] **Step 1: Tulis probe yang hanya mencatat**

```ts
// cc-plugin/hooks/session-probe.ts -- TEMPORARY, dibuang di Task 2.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const root = process.env.MIRZA_BOTS_HOME ?? join(homedir(), ".claude", "mirza-bots");
mkdirSync(join(root, "logs"), { recursive: true });

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {}

appendFileSync(
  join(root, "logs", "session-probe.log"),
  `${new Date().toISOString()} env=${process.env.CLAUDE_CODE_SESSION_ID ?? "-"} stdin=${raw.replace(/\s+/g, " ").slice(0, 300)}\n`
);
```

- [x] **Step 2: Daftarkan sebagai `SessionStart`**

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/session-probe.ts\"" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/reply-guard.ts\"" }] }
    ]
  }
}
```

- [x] **Step 3: Naikkan versi, pasang, minta user restart sesi `bot-uji`**

```bash
claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
```

Restart **wajib** diminta ke user, bukan dilakukan sendiri.

- [x] **Step 4: Minta user menjalankan `/clear`, lalu baca log-nya**

```bash
cat ~/.claude/mirza-bots/logs/session-probe.log
```

Expected bila asumsinya benar: **dua baris** — satu saat sesi dibuka, satu lagi
saat `/clear`, dengan `env=` atau isi stdin memuat id sesi yang **berbeda**.

- [x] **Step 5: Catat hasilnya, apa pun jawabannya**

Tulis ke `2026-08-01-status-kapabilitas-terverifikasi.md`. **Kalau `SessionStart`
TIDAK menyala pada `/clear`, hentikan item 0 di sini** dan pakai jalan
cadangan spec §3: berhenti menstempel `session_id` dan biarkan NULL, karena
"tidak tahu" lebih benar daripada "tahu, dan salah". Lalu lanjut ke Task 3.

- [x] **Step 6: Commit temuannya**

```bash
git add -A && git commit -m "chore(probe): ukur apakah SessionStart menyala pada /clear

Agent: <bot-name>"
```

---

### Task 2: Identitas sesi dibaca, bukan dipotret

Hanya dikerjakan bila Task 1 menjawab **ya**.

**Files:**
- Create: `cc-plugin/hooks/session-start.ts`
- Create: `cc-plugin/test/hooks/session-start.test.ts`
- Create: `cc-plugin/test/engine/session-file.test.ts`
- Modify: `cc-plugin/src/engine/paths.ts` — tambah `currentSessionPath()`
- Modify: `cc-plugin/src/engine/engine.ts` — sink membaca berkas, bukan closure
- Modify: `cc-plugin/src/main.ts` — berhenti meneruskan `resolveSessionId()`
- Delete: `cc-plugin/hooks/session-probe.ts`

**Interfaces:**
- Consumes: `stateRoot()` (sudah ada)
- Produces:
  ```ts
  // paths.ts
  export function currentSessionPath(bot: string): string;

  // hooks/session-start.ts
  export function parseHookInput(raw: string): any | null;
  export function sessionIdFrom(input: any, env: NodeJS.ProcessEnv): string | undefined;

  // engine.ts -- sink.sessionId() berubah implementasi, TIDAK berubah tanda tangan
  ```

- [x] **Step 1: Tulis test yang gagal untuk pembacaan berkas**

```ts
// cc-plugin/test/engine/session-file.test.ts
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCurrentSessionId } from "../../src/engine/session-file";

afterEach(() => { delete process.env.MIRZA_BOTS_HOME; });

test("reads the id the SessionStart hook last wrote", () => {
  const root = mkdtempSync(join(tmpdir(), "sess-"));
  mkdirSync(join(root, "sessions"), { recursive: true });
  writeFileSync(join(root, "sessions", "bot-uji.id"), "2ef5b4c5-db87-4655-9d19-cd41193013cb");
  process.env.MIRZA_BOTS_HOME = root;

  expect(readCurrentSessionId("bot-uji")).toBe("2ef5b4c5-db87-4655-9d19-cd41193013cb");
});

// Absent is "unknown", and unknown must stay undefined. A stale or invented id
// is worse than none: an empty column says "don't know", a wrong one says
// "know, and here it is" -- and nobody ever gets suspicious of the second.
test("no file means undefined, never a guess", () => {
  process.env.MIRZA_BOTS_HOME = mkdtempSync(join(tmpdir(), "sess-"));
  expect(readCurrentSessionId("bot-uji")).toBeUndefined();
});

test("an empty or whitespace file is treated as absent", () => {
  const root = mkdtempSync(join(tmpdir(), "sess-"));
  mkdirSync(join(root, "sessions"), { recursive: true });
  writeFileSync(join(root, "sessions", "bot-uji.id"), "   \n");
  process.env.MIRZA_BOTS_HOME = root;

  expect(readCurrentSessionId("bot-uji")).toBeUndefined();
});
```

- [x] **Step 2: Jalankan, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/session-file.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/session-file'`

- [x] **Step 3: Implementasikan pembacaannya**

```ts
// cc-plugin/src/engine/session-file.ts
import { readFileSync } from "node:fs";
import { currentSessionPath } from "./paths";

/**
 * The session this bot's Claude Code window is on RIGHT NOW.
 *
 * Read per push rather than snapshotted at startup, and that difference is the
 * whole point. `/clear` starts a new session without restarting the MCP process,
 * so the env var this used to be taken from goes stale the moment the user
 * clears -- measured 2026-08-02: Claude Code showed 2ef5b4c5-… while the engine
 * was still stamping f850dfd0-….
 *
 * Absent means undefined, never a guess. An empty column says "don't know"; a
 * wrong one says "know, and here it is" -- and the second never makes anyone
 * suspicious. Same failure class as the `listening` line that lied (W-4).
 */
export function readCurrentSessionId(bot: string): string | undefined {
  try {
    const id = readFileSync(currentSessionPath(bot), "utf8").trim();
    return id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}
```

Dan di `paths.ts`:

```ts
export function sessionsDir(): string {
  return join(stateRoot(), "sessions");
}

export function currentSessionPath(bot: string): string {
  return join(sessionsDir(), `${bot}.id`);
}
```

Sertakan `sessionsDir()` di daftar `ensureStateDirs()`.

- [x] **Step 4: Jalankan, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/session-file.test.ts`
Expected: PASS (3 test)

- [x] **Step 5: Tulis test yang gagal untuk hook-nya**

```ts
// cc-plugin/test/hooks/session-start.test.ts
import { expect, test } from "bun:test";
import { parseHookInput, sessionIdFrom } from "../../hooks/session-start";

test("prefers the session id in the hook payload", () => {
  expect(sessionIdFrom({ session_id: "from-payload" }, { CLAUDE_CODE_SESSION_ID: "from-env" } as any))
    .toBe("from-payload");
});

test("falls back to the env var when the payload has none", () => {
  expect(sessionIdFrom({}, { CLAUDE_CODE_SESSION_ID: "from-env" } as any)).toBe("from-env");
});

test("returns undefined when neither exists, so nothing is written", () => {
  expect(sessionIdFrom({}, {} as any)).toBeUndefined();
});

// Third BOM incident in this project (SCAR-026): a single invisible byte made
// JSON.parse throw, main() return early, and a hook stay perfectly installed
// while guarding nothing.
test("tolerates a leading BOM instead of throwing", () => {
  expect(parseHookInput('﻿{"session_id":"x"}')).toEqual({ session_id: "x" });
});

test("returns null for genuinely malformed input rather than throwing", () => {
  expect(parseHookInput("{ not json")).toBeNull();
});
```

- [x] **Step 6: Jalankan, pastikan gagal**

Run: `cd cc-plugin && bun test test/hooks/session-start.test.ts`
Expected: FAIL — module tidak ada

- [x] **Step 7: Tulis hook-nya**

```ts
#!/usr/bin/env bun
/**
 * SessionStart hook: records which Claude Code session this bot's window is on.
 *
 * Exists because the MCP process cannot learn this on its own. It reads
 * CLAUDE_CODE_SESSION_ID once at startup, and `/clear` starts a new session
 * WITHOUT restarting it -- so from the process's point of view nothing happened,
 * while Claude Code has moved on. This hook is the only thing that sees the
 * moment of the change.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { currentSessionPath } from "../src/engine/paths";
import { loadConfig } from "../src/engine/config";
import { configPath } from "../src/engine/paths";
import { resolveBotByCwd } from "../src/engine/identity";

export function parseHookInput(raw: string): any | null {
  try {
    return JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

export function sessionIdFrom(input: any, env: NodeJS.ProcessEnv): string | undefined {
  const fromPayload = typeof input?.session_id === "string" ? input.session_id : "";
  if (fromPayload.length > 0) return fromPayload;
  const fromEnv = env.CLAUDE_CODE_SESSION_ID ?? "";
  return fromEnv.length > 0 ? fromEnv : undefined;
}

function main(): void {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return;
  }
  const id = sessionIdFrom(parseHookInput(raw) ?? {}, process.env);
  if (id === undefined) return;

  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  let bot: string;
  try {
    const identity = resolveBotByCwd(loadConfig(configPath()), cwd);
    if (!identity.ok) return; // not a bot folder -- nothing to record
    bot = identity.bot;
  } catch {
    return; // unreadable config is not this hook's problem to report
  }

  const path = currentSessionPath(bot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, id);
}

if (import.meta.main) main();
```

- [x] **Step 8: Jalankan, pastikan lulus**

Run: `cd cc-plugin && bun test test/hooks/session-start.test.ts`
Expected: PASS (5 test)

- [x] **Step 9: Sambungkan engine ke berkas itu**

Di `engine.ts`, ganti isi `sessionId` pada sink — **tanda tangannya tidak
berubah**, hanya sumbernya:

```ts
  const sink: MessageSink = {
    push: (msg) => (handler ? handler(msg) : buffered.push(msg)),
    // Read per push, not captured once: see session-file.ts for why.
    sessionId: () => readCurrentSessionId(botName),
  };
```

Hapus parameter `sessionId` dari `startEngine`, dan hapus `resolveSessionId()`
dari `main.ts` berikut test-nya — nilainya sekarang datang dari hook.

- [x] **Step 10: Ganti probe dengan hook sungguhan di `hooks.json`, hapus probe**

- [x] **Step 11: Jalankan seluruh suite**

Run: `cd cc-plugin && bun test`
Expected: hijau. Test yang mengikat `resolveSessionId` ke `startEngine` akan
gugur — hapus, dan **hitung selisihnya** di pesan commit.

- [x] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(engine): id sesi dibaca per-push lewat hook, bukan dipotret saat start

Proses MCP tidak bisa mengetahui ini sendiri: ia membaca env var sekali saat
dinyalakan, dan /clear memulai sesi baru TANPA me-restart-nya. Terukur
2026-08-02: Claude Code menunjukkan 2ef5b4c5-…, engine masih menstempel
f850dfd0-…. Hook SessionStart adalah satu-satunya yang melihat momen itu.

Tidak ada berkas berarti undefined, bukan tebakan. Kolom kosong berkata 'tidak
tahu'; kolom yang salah berkata 'tahu, ini jawabannya' -- dan yang kedua tidak
pernah membuat siapa pun curiga.

Agent: <bot-name>"
```

---

### Task 3: Simpan balasan keluar

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts` — `reply()`
- Create: `cc-plugin/test/engine/reply-storage.test.ts`

**Interfaces:**
- Consumes: `insertMessage` (`{ ts, bot, chatId, messageId?, source, userId?, userName?, text?, attachments?, replyTo?, metadata?, sessionId? }`), `readCurrentSessionId` (Task 2)
- Produces: `engine.reply()` menyimpan satu baris `source: "assistant"` setelah
  kirim berhasil. Tanda tangannya tidak berubah.

- [x] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/reply-storage.test.ts
import { expect, test } from "bun:test";
import { openConversationsDb } from "../../src/engine/db/conversations-schema";
import { storeOutgoing } from "../../src/engine/engine";

test("stores the reply with source=assistant and the id Telegram gave back", () => {
  const db = openConversationsDb(":memory:");

  storeOutgoing(db, {
    bot: "bot-uji",
    chatId: "111",
    messageId: "512",
    text: "halo balik",
    sessionId: "sess-1",
  });

  const row = db.query("SELECT source, message_id, text, session_id FROM messages").get() as any;
  expect(row.source).toBe("assistant");
  expect(row.message_id).toBe("512");
  expect(row.text).toBe("halo balik");
  expect(row.session_id).toBe("sess-1");
});

// The id only exists in Telegram's answer to sendMessage. Storing before the
// send would mean storing a row with no id -- which removes half the point,
// because Task 4 cannot quote a message whose id was never captured.
test("a reply is searchable afterwards, so history is no longer one-sided", () => {
  const db = openConversationsDb(":memory:");
  storeOutgoing(db, { bot: "bot-uji", chatId: "111", messageId: "512", text: "jawaban unik xyzzy" });

  const hits = db.query("SELECT text FROM messages WHERE messages MATCH 'xyzzy'").all();
  expect(hits.length).toBeGreaterThan(0);
});
```

Catatan: bila query FTS di atas tidak cocok dengan bentuk tabel FTS yang ada,
pakai `searchMessages(db, "xyzzy", { bot: "bot-uji" })` — yang penting
assertion-nya: **balasan ikut terjaring pencarian.**

- [x] **Step 2: Jalankan, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/reply-storage.test.ts`
Expected: FAIL — `storeOutgoing` tidak ada

- [x] **Step 3: Implementasikan**

```ts
// engine.ts
/**
 * Records a reply that Telegram has already accepted.
 *
 * Exported for tests, and called only AFTER sendMessage resolves. Two reasons,
 * both load bearing:
 *  - `message_id` exists only in Telegram's answer. Storing first means storing
 *    a row with no id, and an id-less row cannot be quoted later.
 *  - storing first also records messages that were never delivered.
 */
export function storeOutgoing(
  db: Database,
  msg: { bot: string; chatId: string; messageId?: string; text: string; sessionId?: string; replyTo?: string }
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
  });
}
```

Dan di dalam `reply()`, sesudah `sendMessage`:

```ts
        const sent = await bot.api.sendMessage(
          chatId,
          text,
          replyMarkup ? { reply_markup: replyMarkup } : undefined
        );

        // Never fatal. The message is already on the user's phone; throwing here
        // would make the AI believe the send failed and send it again.
        try {
          storeOutgoing(conversationsDb, {
            bot: botName,
            chatId,
            messageId: String(sent.message_id),
            text,
            sessionId: readCurrentSessionId(botName),
          });
        } catch (err) {
          console.error(`cc-plugin: reply sent but not stored: ${err}`);
        }
```

- [x] **Step 4: Jalankan, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/reply-storage.test.ts`
Expected: PASS (2 test)

- [x] **Step 5: Jalankan seluruh suite dan commit**

```bash
git add -A
git commit -m "feat(engine): simpan balasan keluar berikut message_id-nya

Seluruh conversations.db hanya memuat source='user' -- 32 dari 32 baris.
read_history karena itu menyajikan transkrip sepihak: AI bisa membaca ulang apa
yang user katakan, tapi tidak apa yang ia sendiri jawab. Untuk sesi yang sudah
di-/clear bedanya besar.

Regresi terhadap sistem lama, bukan fitur yang belum sempat dibangun:
plugins/telegram/messages-store.ts menyimpan 'assistant' dan 'system' sejak
awal, dan kolom source di skema baru sudah menyediakan tempatnya.

Disimpan SESUDAH kirim berhasil: message_id hanya ada di jawaban Telegram, dan
baris tanpa id tidak bisa dikutip belakangan. Kegagalan simpan tidak fatal --
pesannya sudah sampai, dan melempar di sini membuat AI mengirim ulang.

Agent: <bot-name>"
```

---

### Task 4: Bot bisa mengutip

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts` — `reply()` menerima `replyTo`
- Modify: `cc-plugin/src/server.ts` — tool `reply` menerima `reply_to`
- Create: `cc-plugin/test/engine/reply-quote.test.ts`

**Interfaces:**
- Consumes: `Engine.reply` (Task 3)
- Produces:
  ```ts
  reply(text: string, buttons?: ButtonRow[], replyTo?: string): Promise<void>;
  ```
  Tool MCP `reply` mendapat parameter opsional `reply_to: z.string().min(1)`.

- [x] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/reply-quote.test.ts
import { expect, test } from "bun:test";
import { buildSendOptions } from "../../src/engine/engine";

test("passes the quoted message id through to Telegram", () => {
  expect(buildSendOptions(undefined, "89")).toEqual({ reply_parameters: { message_id: 89 } });
});

test("no quote means no reply_parameters key at all, not an empty one", () => {
  expect(buildSendOptions(undefined, undefined)).toBeUndefined();
});

test("a quote and buttons can travel together", () => {
  const opts = buildSendOptions({ inline_keyboard: [[{ text: "1", callback_data: "a" }]] } as any, "89");
  expect(opts?.reply_parameters).toEqual({ message_id: 89 });
  expect(opts?.reply_markup).toBeDefined();
});

// A non-numeric id would be rejected by Telegram with an opaque 400. Refuse it
// here, where the message can name the cause.
test("a non-numeric id is refused before anything is sent", () => {
  let message = "";
  try {
    buildSendOptions(undefined, "bukan-angka");
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("reply_to");
});
```

- [x] **Step 2: Jalankan, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/reply-quote.test.ts`
Expected: FAIL — `buildSendOptions` tidak ada

- [x] **Step 3: Implementasikan**

```ts
/**
 * Assembles sendMessage's options object.
 *
 * Split out so the quoting rules are testable without a bot, and so "no quote"
 * produces NO key rather than an empty one -- grammy forwards the object as-is,
 * and a present-but-empty reply_parameters is a 400 from Telegram.
 */
export function buildSendOptions(
  replyMarkup: InlineKeyboard | undefined,
  replyTo: string | undefined
): { reply_markup?: InlineKeyboard; reply_parameters?: { message_id: number } } | undefined {
  const opts: { reply_markup?: InlineKeyboard; reply_parameters?: { message_id: number } } = {};
  if (replyMarkup) opts.reply_markup = replyMarkup;
  if (replyTo !== undefined) {
    const id = Number(replyTo);
    if (!Number.isInteger(id)) {
      throw new Error(
        `reply_to must be a Telegram message id (a number); got "${replyTo}". ` +
          `Ids arrive in a notification's meta as message_id or reply_to_message_id -- ` +
          `never ask the user for one.`
      );
    }
    opts.reply_parameters = { message_id: id };
  }
  return Object.keys(opts).length > 0 ? opts : undefined;
}
```

- [x] **Step 4: Jalankan, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/reply-quote.test.ts`
Expected: PASS (4 test)

- [x] **Step 5: Sambungkan ke `reply()` dan ke tool MCP**

Di `server.ts`, tambahkan ke `inputSchema` tool `reply`:

```ts
        reply_to: z.string().min(1).optional(),
```

dan **wajib** tambahkan ke deskripsinya (U-3):

```
Pass `reply_to` with a Telegram message id to quote that message. NEVER ask the
user for an id -- they never see one. If you do not have it, ask them to quote
the message instead; quoting delivers the id to you automatically.
```

- [x] **Step 6: Jalankan seluruh suite dan commit**

```bash
git add -A
git commit -m "feat: bot bisa mengutip pesan saat membalas

Mengutip pesan USER sudah mungkin sejak dulu -- message_id masuk memang
disimpan; yang kurang cuma parameternya. Mengutip pesan BOT SENDIRI baru
mungkin setelah Task 3, karena id balasan sebelumnya tidak pernah ditangkap.

Deskripsi tool mengulang larangan U-3 secara eksplisit: jangan pernah meminta
message_id ke user. Ia tidak pernah melihatnya; yang bisa ia lakukan adalah
mengutip, dan kutipan membawa id-nya sendiri.

Agent: <bot-name>"
```

---

### Task 5: CommonMark → MarkdownV2, selalu

**Files:**
- Create: `cc-plugin/src/engine/markdown.ts`
- Create: `cc-plugin/test/engine/markdown.test.ts`
- Modify: `cc-plugin/src/engine/engine.ts` — `reply()` mengonversi sebelum kirim
- Modify: `cc-plugin/package.json` — dependency `telegramify-markdown`

**Interfaces:**
- Consumes: —
- Produces: `export function commonMarkToMarkdownV2(input: string): string`

- [x] **Step 1: Tambahkan dependency**

```bash
cd cc-plugin && bun add telegramify-markdown
```

- [x] **Step 2: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/markdown.test.ts
import { expect, test } from "bun:test";
import { commonMarkToMarkdownV2 } from "../../src/engine/markdown";

test("bold survives as bold instead of reaching the user as raw asterisks", () => {
  expect(commonMarkToMarkdownV2("**tebal**")).toContain("tebal");
  expect(commonMarkToMarkdownV2("**tebal**")).not.toBe("**tebal**");
});

// The reason this module exists: MarkdownV2 requires every . - ( ) ! + outside
// markup to be backslash-escaped, or Telegram rejects the whole message with a
// 400. Asking the AI to remember that is exactly what leaked.
test("punctuation that MarkdownV2 reserves comes back escaped", () => {
  const out = commonMarkToMarkdownV2("halo. ini (contoh) - ya!");
  expect(out).toContain("\\.");
  expect(out).toContain("\\(");
  expect(out).toContain("\\-");
  expect(out).toContain("\\!");
});

test("an empty string is not an error", () => {
  expect(commonMarkToMarkdownV2("")).toBe("");
});

test("a fenced code block survives intact", () => {
  expect(commonMarkToMarkdownV2("```\nconst a = 1;\n```")).toContain("const a = 1;");
});
```

- [x] **Step 3: Jalankan, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/markdown.test.ts`
Expected: FAIL — module tidak ada

- [x] **Step 4: Implementasikan**

```ts
// cc-plugin/src/engine/markdown.ts
import telegramifyMarkdown from "telegramify-markdown";

/**
 * Convert a CommonMark-style string into Telegram MarkdownV2.
 *
 * Applied to EVERY reply, with no opt-in flag. The old system had a `format`
 * parameter the AI had to remember, and the user watched `**bold**` arrive raw
 * on their phone -- which is what a rule that merely asks looks like when it
 * leaks. Anything a machine can guarantee, a machine guarantees (K-5).
 *
 * MarkdownV2 requires every `. - ( ) ! +` outside markup to be backslash-escaped
 * or the API rejects the whole message with a 400.
 */
export function commonMarkToMarkdownV2(input: string): string {
  // Some versions throw on empty input -- short-circuit so an empty reply does
  // not surface as a confusing library error.
  if (!input) return "";
  return telegramifyMarkdown(input);
}
```

- [x] **Step 5: Jalankan, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/markdown.test.ts`
Expected: PASS (4 test)

- [x] **Step 6: Pakai di `reply()`**

Konversi **sesudah** gerbang `findMissingButtonNarration` (gerbang itu membaca
teks yang ditulis AI, bukan hasil escape-nya) dan **sebelum** `sendMessage`,
dengan `parse_mode: "MarkdownV2"`. **Yang disimpan ke database adalah teks
ASLI**, bukan hasil konversi — yang dibaca ulang AI harus berupa apa yang ia
tulis, bukan bentuk kawatnya.

- [x] **Step 7: Jalankan seluruh suite dan commit**

```bash
git add -A
git commit -m "feat(engine): selalu konversi CommonMark ke MarkdownV2, tanpa flag

Sistem lama punya parameter format yang harus disebut AI tiap kali, dan user
melihat sendiri **bintang** mentah mendarat di layarnya. Itu bentuk aturan yang
sekadar meminta, ketika ia bocor.

Isinya 20 baris membungkus telegramify-markdown -- bukan membangun konverter,
melainkan memindahkan satu yang sudah teruji di sistem lama berikut testnya.

Yang disimpan ke database tetap teks ASLI, bukan hasil escape: yang dibaca ulang
AI harus berupa apa yang ia tulis, bukan bentuk kawatnya.

Agent: <bot-name>"
```

---

### Task 6: Rilis dan verifikasi hidup

**Files:**
- Modify: `cc-plugin/package.json` + `cc-plugin/.claude-plugin/plugin.json` — 0.5.0
- Modify: `mirza-bots/README.md`
- Modify: `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md`
- Modify: `.../2026-08-01-status-kapabilitas-terverifikasi.md`

- [ ] **Step 1: Naikkan versi di KEDUA berkas**

- [ ] **Step 2: Perbarui README** — bagian markdown (tidak ada flag), quote, dan
  bahwa balasan ikut tersimpan.

- [ ] **Step 3: Pasang dan minta user restart**

```bash
claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
claude plugin list | grep -A 2 cc-plugin
```

Restart **diminta ke user**, tidak dilakukan sendiri.

- [ ] **Step 4: Verifikasi hidup — enam pemeriksaan**

1. Kirim pesan, bot membalas dengan `**tebal**` → tampil **tebal**, bukan bintang.
2. Balasan mengandung `. - ( ) !` → terkirim, tidak kena 400.
3. Cek database: ada baris `source='assistant'` dengan `message_id` terisi.
4. Minta bot mengutip pesan **user** → kutipan muncul di Telegram.
5. Minta bot mengutip **pesannya sendiri** yang tadi → kutipan muncul.
6. `/clear`, kirim pesan, cek `session_id` baris baru → **berbeda** dari sebelum
   `/clear`, dan sama dengan yang ditunjukkan layar `Status`.

Pemeriksaan 6 adalah satu-satunya bukti bahwa Task 2 benar-benar bekerja; unit
test tidak bisa membuktikannya karena `/clear` bukan sesuatu yang bisa dipalsukan
di dalam proses.

- [ ] **Step 5: Catat hasilnya dan push kedua repo**

---

## Yang sengaja TIDAK ada di rencana ini

- **Memberi `message_id` pada penekanan tombol.** Terukur bahwa ia `null`, jadi
  sebuah tap tidak bisa dikutip. Diputuskan saat Task 4 dikerjakan: diberi id,
  atau diterima dan didokumentasikan — bukan diputuskan di sini tanpa melihat
  kodenya.
- **Menegakkan ack-sebelum-tool lewat PreToolUse hook.** Kandidat kuat, tapi
  miliknya 2.5-GUARD.
- **Mengganti nama `fleetd`.** Masih menunggu; namanya sudah tidak ada di kode,
  tapi masih ada di dokumen.
- **W-18** dan **W-15**. Hidup di BACKLOG Bagian 7.
