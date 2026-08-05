# Lepas Legacy — Folder `slash/` + Tool `send_slash` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan antrean slash dari `<botHome>/.claude/channels/pty-controller/pending/` ke `<botHome>/slash/`, pindahkan `wrapper.pid` ke akar folder bot, dan lahirkan tool MCP `send_slash` di `cc-plugin` sebagai pengganti `pty_send_slash` — dalam satu perubahan yang sama.

**Architecture:** `cc-plugin` menulis payload slash, `cc-wrapper` membacanya lewat polling. Yang berubah hanya **alamatnya**, bukan **kontrak payloadnya** — `cc-wrapper/src/inbox.ts` dan `queue.ts` tidak disentuh sama sekali. Tool `send_slash` sengaja **tidak** menyentuh `Engine`: ia cuma butuh `botHome`, supaya tetap bekerja saat engine gagal start — justru keadaan di mana user paling butuh `/clear`.

**Tech Stack:** TypeScript · `cc-plugin` = Bun (`bun test`) · `cc-wrapper` = Node + tsx (test tetap `bun test`) · MCP SDK (`@modelcontextprotocol/sdk`) · zod

**Spec:** `docs/superpowers/specs/2026-08-05-lepas-legacy-slash-folder-design.md`

## Global Constraints

- **Satu branch, satu merge.** Task 1–7 mendarat sebagai satu kesatuan. Task 2 memindahkan tempat **menulis** dan Task 6 memindahkan tempat **membaca**; merge parsial di antara keduanya membuat slash Telegram mati. Tidak ada task yang boleh di-merge ke `main` sendirian.
- **JANGAN sentuh** `mirza-marketplace/plugins/pty-controller/**` dan `mirza-marketplace/plugins/agent-bus/**`. Enam bot harian memakainya.
- **JANGAN sentuh** `cc-wrapper/src/inbox.ts`, `queue.ts`, `typer.ts`, `registry.ts`, `lock.ts`, `pty.ts`, `startup.ts`.
- **`engine.ts:848`** (`projectDir: botHome` di dalam `installBridge`) **BUKAN** bagian pekerjaan ini. Itu `.claude/settings.json` milik Claude Code sendiri, bukan folder legacy. Biarkan namanya `projectDir`.
- Setiap commit membawa trailer **`Agent: bot-03`** sebelum `Co-Authored-By:`.
- Gerbang hijau sebelum tiap commit: `bun test` **dan** `bunx tsc --noEmit` di `cc-plugin`; `bun test` di `cc-wrapper`.
- Baseline yang harus tetap terlampaui: `cc-plugin` **454 test hijau, 0 fail**.
- Deskripsi tool MCP ditulis **dalam bahasa Inggris** (K-16 — instruksi mesin ke AI). Pesan yang sampai ke user lewat Telegram tetap Indonesia.
- ⚠️ **JANGAN matikan plugin `pty-controller` di folder bot manapun sampai Task 8.** Sampai `send_slash` benar-benar terpasang, plugin lama adalah satu-satunya jalan bot me-`/rename` dirinya.
- **Jangan pakai string literal multiline di skrip Python/Node** untuk mengedit berkas repo ini — CRLF membuat pencocokan gagal (sudah menggigit 4×). Pakai `Edit` yang presisi.

---

## File Structure

| Berkas | Tanggung jawab | Aksi |
|---|---|---|
| `cc-plugin/src/engine/paths.ts` | **Satu-satunya** tempat bentuk folder bot ditulis | Modify — `+ slashDirIn`, `ensureBotDirs` ikut membuatnya |
| `cc-plugin/src/engine/slash/pending.ts` | Menulis payload ke disk, atomik | Modify — buang `pendingDir` |
| `cc-plugin/src/engine/slash/index.ts` | Perakitan lapisan slash Telegram | Modify — `SlashDeps.projectDir` → `botHome` |
| `cc-plugin/src/engine/slash/send-tool.ts` | **BARU** — validasi murni input `send_slash` → payload atau alasan tolak | Create |
| `cc-plugin/src/server.ts` | Registrasi tool MCP | Modify — `buildServer(backend, botHome)` + tool `send_slash` |
| `cc-plugin/src/main.ts` | Perakitan proses | Modify — teruskan `botHome` di kedua cabang |
| `cc-plugin/src/engine/engine.ts` | Perakitan engine | Modify — 2 call site ikut nama field baru |
| `cc-wrapper/src/main.ts` | Perakitan wrapper PTY | Modify — `SLASH_DIR` + `LOCK_FILE` pindah |
| `cc-plugin/test/engine/paths.test.ts` | Test bentuk folder | Modify |
| `cc-plugin/test/engine/slash/pending.test.ts` | Test penulisan payload | Modify — buang test `pendingDir` |
| `cc-plugin/test/engine/slash/send-tool.test.ts` | **BARU** | Create |
| `cc-plugin/test/engine/slash/index.test.ts` | Test perakitan slash | Modify |
| `cc-plugin/test/engine/context/slash-context.test.ts` | Test `/context` lokal | Modify (baris 25, 37, 45) |
| `cc-plugin/test/server.test.ts` | Test tool MCP | Modify — semua `buildServer(x)` → `buildServer(x, home)` |
| `mirza-bots/README.md` | Dokumen apa yang benar-benar ada | Modify |

---

## Task 1: `slashDirIn()` lahir di `paths.ts`

**Files:**
- Modify: `cc-plugin/src/engine/paths.ts`
- Test: `cc-plugin/test/engine/paths.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `slashDirIn(botHome: string): string` → `<botHome>/slash`. `ensureBotDirs(botHome: string): void` sekarang juga membuat `slash/`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan `slashDirIn` ke daftar import di `cc-plugin/test/engine/paths.test.ts`, lalu tambahkan baris berikut **di dalam** `describe("path di dalam folder bot", ...)`, di test `"semuanya berpangkal pada folder bot, tanpa state root"`, tepat sesudah baris `inboxDirIn`:

```ts
    expect(slashDirIn(HOME)).toBe(join(HOME, "slash"));
```

Tambahkan juga `slashDirIn(HOME),` ke dalam array di test `"tidak satu pun path menyeberang keluar dari folder bot"`, sesudah `inboxDirIn(HOME),`.

Lalu tambahkan blok baru di akhir berkas:

```ts
// slash/ dan inbox/ WAJIB dua folder berbeda. cc-wrapper menghapus berkas
// SEBELUM mem-parse-nya (main.ts: rmSync lalu parsePayload), jadi kalau
// keduanya berbagi folder, wrapper menghapus pesan antar-bot lalu menolaknya
// karena tidak ada field `command` -- pesan lenyap tanpa gejala.
describe("slash/ terpisah dari inbox/", () => {
  test("keduanya bukan folder yang sama", () => {
    expect(slashDirIn(HOME)).not.toBe(inboxDirIn(HOME));
  });
});

describe("ensureBotDirs membuat slash/", () => {
  test("bot baru punya slash/ sejak lahir, bukan sejak slash pertama dipakai", () => {
    const home = mkdtempSync(join(tmpdir(), "bothome-slash-"));
    ensureBotDirs(home);
    expect(existsSync(slashDirIn(home))).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/paths.test.ts
```

Expected: FAIL — `slashDirIn is not a function` / import error.

- [ ] **Step 3: Implementasi minimal**

Di `cc-plugin/src/engine/paths.ts`, sisipkan **sesudah** `inboxDirIn` dan **sebelum** `logsDirIn`:

```ts
/**
 * Perintah slash untuk sesi Claude Code milik bot ini. Dibaca cc-wrapper.
 *
 * SENGAJA terpisah dari `inbox/`, dan pemisahannya bukan selera: cc-wrapper
 * menghapus berkas SEBELUM mem-parse-nya (crash di tengah tidak boleh
 * memproses perintah dua kali). Kalau kedua payload berbagi satu folder,
 * wrapper menang lomba, MENGHAPUS pesan antar-bot, lalu menolaknya karena
 * tidak ada field `command`. Pesannya lenyap tanpa gejala apa pun.
 *
 * Dulu <botHome>/.claude/channels/pty-controller/pending/ -- nama sebuah
 * plugin yang tidak ada lagi di sistem ini.
 */
export function slashDirIn(botHome: string): string {
  return join(botHome, "slash");
}
```

Lalu ubah `ensureBotDirs` — tambahkan `slashDirIn(botHome)` ke array:

```ts
export function ensureBotDirs(botHome: string): void {
  for (const dir of [
    dataDirIn(botHome),
    inboxDirIn(botHome),
    slashDirIn(botHome),
    logsDirIn(botHome),
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/paths.test.ts && bunx tsc --noEmit
```

Expected: PASS, tsc bersih.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src/engine/paths.ts cc-plugin/test/engine/paths.test.ts
git commit -m "feat(paths): slashDirIn() -- antrean slash pindah ke <botHome>/slash

Bentuk folder bot ditulis di satu tempat saja, jadi slash/ lahir di sini
bersama inbox/, data/, dan logs/ -- bukan di slash/pending.ts, yang akan
membuat dua berkas berpendapat soal bentuk folder.

ensureBotDirs ikut membuatnya supaya bot baru punya slash/ sejak lahir; kalau
ia lahir belakangan lewat mkdirSync di writePending, isi folder bot terlihat
berbeda tergantung apakah slash pernah dipakai.

Agent: bot-03"
```

---

## Task 2: Lapisan slash menulis ke `slash/`, `pendingDir` dibuang

**Files:**
- Modify: `cc-plugin/src/engine/slash/pending.ts`
- Modify: `cc-plugin/src/engine/slash/index.ts`
- Modify: `cc-plugin/src/engine/engine.ts` (baris ~466 dan ~613)
- Test: `cc-plugin/test/engine/slash/pending.test.ts`, `cc-plugin/test/engine/slash/index.test.ts`, `cc-plugin/test/engine/context/slash-context.test.ts`

**Interfaces:**
- Consumes: `slashDirIn(botHome)` dari Task 1.
- Produces: `SlashDeps = { botHome: string; newId: () => string }`. `pendingDir` **tidak ada lagi** — pemanggil memakai `slashDirIn`.

- [ ] **Step 1: Tulis test yang gagal**

**(a)** Di `cc-plugin/test/engine/slash/pending.test.ts` — **hapus** seluruh blok `describe("pendingDir", ...)` (baris 11–17) dan hapus `pendingDir` dari baris import sehingga menjadi:

```ts
import { writePending } from "../../../src/engine/slash/pending";
```

**(b)** Di `cc-plugin/test/engine/slash/index.test.ts` — ganti baris import `pendingDir` dan `deps`:

```ts
import { slashDirIn } from "../../../src/engine/paths";
```

```ts
const deps = () => ({ botHome: proj, newId: () => `id${++n}` });
```

dan ganti **setiap** `pendingDir(proj)` menjadi `slashDirIn(proj)` (baris 24, 40, 46, 71, 79).

Lalu tambahkan test baru di akhir berkas:

```ts
// Pagar terhadap kembalinya alamat legacy lewat pintu belakang. Yang dikunci
// bukan "berkasnya ada" melainkan "berkasnya ada DI SINI" -- test yang cuma
// menghitung berkas akan tetap hijau untuk folder mana pun.
describe("alamat penulisan", () => {
  test("payload mendarat di <botHome>/slash, bukan di .claude/channels", () => {
    handleSlash("/rename sesi-alamat", deps());
    expect(readdirSync(slashDirIn(proj)).filter((f) => f.endsWith(".json"))).toHaveLength(1);
    expect(existsSync(join(proj, ".claude", "channels"))).toBe(false);
  });
});
```

Tambahkan `existsSync` ke import `node:fs` di berkas itu.

**(c)** Di `cc-plugin/test/engine/context/slash-context.test.ts` — ganti `projectDir: dir` menjadi `botHome: dir` di baris 25, 37, dan 45.

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/slash test/engine/context/slash-context.test.ts
```

Expected: FAIL — `slashDirIn` belum dipakai oleh `index.ts`, jadi berkas mendarat di folder lama; dan tsc akan mengeluh soal field `botHome` yang tidak ada di `SlashDeps`.

- [ ] **Step 3: Implementasi minimal**

**(a)** `cc-plugin/src/engine/slash/pending.ts` — hapus fungsi `pendingDir`, hapus import `join`, dan ganti komentar kepala berkas:

```ts
/**
 * Menulis payload ke folder yang dibaca cc-wrapper. Satu-satunya berkas di
 * lapisan ini yang menyentuh disk.
 *
 * Letak foldernya TIDAK diputuskan di sini: `slashDirIn` di `paths.ts` adalah
 * satu-satunya tempat bentuk folder bot ditulis.
 */
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { WrapperPayload } from "./map";
```

(`join` tetap dipakai di dalam `writePending`, jadi importnya tetap ada — hanya fungsi `pendingDir` yang hilang.)

**(b)** `cc-plugin/src/engine/slash/index.ts`:

```ts
import { writePending } from "./pending";
import { slashDirIn } from "../paths";
```

```ts
export type SlashDeps = { botHome: string; newId: () => string };
```

```ts
  writePending(slashDirIn(deps.botHome), m.payload, deps.newId());
```

```ts
  writePending(slashDirIn(deps.botHome), { command }, deps.newId());
```

**(c)** `cc-plugin/src/engine/engine.ts` — di **dua** tempat (`handleSlash` ~baris 466 dan `handleConfirm` ~baris 613), ganti `projectDir: botHome,` menjadi `botHome,`.

⚠️ **JANGAN** ubah `projectDir: botHome` di `replyLocalContext` (~baris 848) — itu `installBridge`, bukan lapisan slash.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test && bunx tsc --noEmit
```

Expected: seluruh suite PASS (≥ 454 hijau, 0 fail), tsc bersih.

- [ ] **Step 5: Verifikasi `pendingDir` benar-benar mati**

```bash
cd C:/Users/Mirza/workspace/mirza-bots && grep -rn "pendingDir\|pty-controller" cc-plugin/src cc-wrapper/src
```

Expected: hanya baris di `cc-wrapper/src/main.ts` (belum dikerjakan sampai Task 6). **Nol** hasil dari `cc-plugin/src`.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src cc-plugin/test
git commit -m "refactor(slash): tulis ke <botHome>/slash, buang pendingDir

pendingDir DIHAPUS, bukan dijadikan alias yang menunjuk folder lama. Alias
seperti itu adalah kode mati yang tetap dieksekusi -- kelas bahaya yang sudah
dihukum sekali di proyek ini (filter WHERE bot = ? yang berhenti menyaring
tapi tetap jalan).

SlashDeps.projectDir -> botHome: folder bot ADALAH alamatnya, dan menyebutnya
projectDir menyisakan gagasan bahwa keduanya bisa berbeda.

Agent: bot-03"
```

---

## Task 3: Modul murni `send-tool.ts` — validasi input `send_slash`

**Files:**
- Create: `cc-plugin/src/engine/slash/send-tool.ts`
- Test: `cc-plugin/test/engine/slash/send-tool.test.ts`

**Interfaces:**
- Consumes: `WrapperPayload` dari `./map`.
- Produces:
  ```ts
  export const MAX_SLASH_BATCH: 8
  export type SlashSendInput = { command?: string; commands?: string[] }
  export type SlashSendResult =
    | { ok: true; payload: WrapperPayload; ack: string }
    | { ok: false; message: string }
  export function buildSlashPayload(input: SlashSendInput): SlashSendResult
  ```

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/send-tool.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { buildSlashPayload, MAX_SLASH_BATCH } from "../../../src/engine/slash/send-tool";

describe("buildSlashPayload -- satu perintah", () => {
  test("perintah tunggal jadi payload objek", () => {
    const r = buildSlashPayload({ command: "/rename sesi-x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ command: "/rename sesi-x" });
    expect(r.ack).toContain("/rename sesi-x");
  });

  test("perintah tanpa garis miring ditolak", () => {
    const r = buildSlashPayload({ command: "rename x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("/");
  });

  test("perintah kosong ditolak", () => {
    expect(buildSlashPayload({ command: "   " }).ok).toBe(false);
  });
});

describe("buildSlashPayload -- batch", () => {
  test("batch jadi payload array, urutannya dipertahankan", () => {
    const r = buildSlashPayload({
      commands: ["/rename done-x", "/clear", "/rename idle"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual([
      { command: "/rename done-x" },
      { command: "/clear" },
      { command: "/rename idle" },
    ]);
  });

  // Batch ditulis sebagai SATU berkas justru supaya tidak ada payload lain
  // menyelip di tengah urutan reset-sesi. Ack-nya harus mengatakan itu, karena
  // itulah satu-satunya alasan bentuk batch ada.
  test("ack batch menyebut sifat atomiknya", () => {
    const r = buildSlashPayload({ commands: ["/clear", "/rename idle"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ack.toLowerCase()).toContain("atomic");
  });

  test("batch kosong ditolak", () => {
    expect(buildSlashPayload({ commands: [] }).ok).toBe(false);
  });

  test("batch lebih dari MAX_SLASH_BATCH ditolak, dan menyebut angkanya", () => {
    const r = buildSlashPayload({
      commands: Array.from({ length: MAX_SLASH_BATCH + 1 }, () => "/clear"),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain(String(MAX_SLASH_BATCH));
  });

  test("satu item batch yang cacat menolak SELURUH batch", () => {
    const r = buildSlashPayload({ commands: ["/clear", "bukan-slash"] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("bukan-slash");
  });
});

describe("buildSlashPayload -- tepat satu bentuk input", () => {
  test("keduanya kosong ditolak", () => {
    expect(buildSlashPayload({}).ok).toBe(false);
  });

  test("keduanya diisi ditolak -- bukan salah satu dipilih diam-diam", () => {
    const r = buildSlashPayload({ command: "/clear", commands: ["/clear"] });
    expect(r.ok).toBe(false);
  });
});

// D-3. Keempatnya perintah lapisan Telegram dan TIDAK ADA di Claude Code.
// Menyuntikkannya membuat CC menampilkan "unknown command" di layar dan AI
// tidak pernah tahu perintahnya menguap.
describe("perintah lapisan Telegram ditolak, bukan diteruskan", () => {
  for (const cmd of ["/new sesi-x", "/switch sesi-y", "/delete", "/effort high"]) {
    test(`${cmd} ditolak`, () => {
      const r = buildSlashPayload({ command: cmd });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message).toContain("Claude Code");
    });
  }

  test("penolakan /new menunjukkan penggantinya, bukan cuma menolak", () => {
    const r = buildSlashPayload({ command: "/new sesi-x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("/clear");
    expect(r.message).toContain("/rename");
  });

  test("penolakan berlaku juga di dalam batch", () => {
    expect(buildSlashPayload({ commands: ["/clear", "/switch x"] }).ok).toBe(false);
  });

  // Yang ditolak adalah NAMA perintahnya, bukan teks yang kebetulan memuatnya.
  test("/renew bukan /new -- pencocokan pada nama, bukan awalan", () => {
    expect(buildSlashPayload({ command: "/renew" }).ok).toBe(true);
  });
});

// Angkanya milik cc-wrapper (MAX_BATCH_ITEMS di cc-wrapper/src/inbox.ts).
// Paket terpisah, jadi tidak bisa di-import; dikunci di sini supaya
// perbedaannya jatuh sebagai test merah, bukan sebagai batch yang ditolak
// wrapper sesudah AI diberi tahu batch-nya terkirim.
test("batas batch sama dengan MAX_BATCH_ITEMS milik cc-wrapper", () => {
  expect(MAX_SLASH_BATCH).toBe(8);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/slash/send-tool.test.ts
```

Expected: FAIL — modul tidak ditemukan.

- [ ] **Step 3: Implementasi minimal**

Buat `cc-plugin/src/engine/slash/send-tool.ts`:

```ts
/**
 * Validasi input tool MCP `send_slash`. Murni: tidak menyentuh disk.
 *
 * Terpisah dari `map.ts` dengan sengaja. `map.ts` menerjemahkan slash TELEGRAM
 * (yang punya inovasi lapisan sendiri seperti /new) menjadi payload wrapper.
 * Berkas ini melayani AI yang menyuntik perintah CLAUDE CODE apa adanya --
 * tidak ada terjemahan, hanya pagar.
 */
import type { WrapperPayload } from "./map";

/**
 * Sama dengan MAX_BATCH_ITEMS di `cc-wrapper/src/inbox.ts`.
 *
 * Paket terpisah, jadi angkanya tidak bisa di-import dan memang disalin. Yang
 * menjaga keduanya tidak berbeda pendapat adalah sebuah test yang memakukan
 * angkanya -- kalau wrapper menaikkan batasnya, test di sini yang merah, bukan
 * user yang menemukan batch-nya ditolak sesudah AI diberi tahu ia terkirim.
 */
export const MAX_SLASH_BATCH = 8;

/**
 * Perintah lapisan Telegram: TIDAK ADA di Claude Code.
 *
 * `pty_send_slash` lama menolaknya dengan alasan yang tidak berubah -- CC
 * menjawab "unknown command" di layar dan AI tidak pernah tahu perintahnya
 * menguap. `/new` punya pengganti yang sah, jadi penolakannya menunjuknya.
 */
const TELEGRAM_ONLY: Record<string, string> = {
  "/new": 'Use a batch instead: ["/clear", "/rename <name>"].',
  "/switch": "There is no Claude Code equivalent.",
  "/delete": "There is no Claude Code equivalent.",
  "/effort": "There is no Claude Code equivalent.",
};

export type SlashSendInput = { command?: string; commands?: string[] };

export type SlashSendResult =
  | { ok: true; payload: WrapperPayload; ack: string }
  | { ok: false; message: string };

/** Nama perintah = potongan sebelum spasi pertama. */
function nameOf(command: string): string {
  const space = command.indexOf(" ");
  return space === -1 ? command : command.slice(0, space);
}

/** `null` bila sah; pesan penolakan bila tidak. */
function rejectionFor(raw: string): string | null {
  const command = raw.trim();
  if (!command.startsWith("/")) {
    return `"${raw}" is not a slash command -- it must start with "/".`;
  }
  if (command === "/") return `"${raw}" is not a slash command -- it has no name.`;
  const telegramOnly = TELEGRAM_ONLY[nameOf(command)];
  if (telegramOnly !== undefined) {
    return `"${nameOf(command)}" is a Telegram-layer command, not a Claude Code one. ${telegramOnly}`;
  }
  return null;
}

export function buildSlashPayload(input: SlashSendInput): SlashSendResult {
  const hasSingle = input.command !== undefined;
  const hasBatch = input.commands !== undefined;

  // Menolak "keduanya" alih-alih memilih salah satu diam-diam: sebuah tool yang
  // mengabaikan separuh argumennya terlihat persis seperti tool yang menuruti
  // keduanya, dan bedanya baru terasa saat perintah yang hilang dibutuhkan.
  if (hasSingle === hasBatch) {
    return {
      ok: false,
      message: "Pass exactly one of `command` or `commands`, not both and not neither.",
    };
  }

  if (hasSingle) {
    const rejection = rejectionFor(input.command!);
    if (rejection !== null) return { ok: false, message: rejection };
    const command = input.command!.trim();
    return {
      ok: true,
      payload: { command },
      ack: `queued "${command}" -- the wrapper injects it on its next tick`,
    };
  }

  const commands = input.commands!;
  if (commands.length === 0) {
    return { ok: false, message: "`commands` is empty -- there is nothing to send." };
  }
  if (commands.length > MAX_SLASH_BATCH) {
    return {
      ok: false,
      message: `A batch may hold at most ${MAX_SLASH_BATCH} commands (got ${commands.length}).`,
    };
  }
  for (const raw of commands) {
    const rejection = rejectionFor(raw);
    // Seluruh batch ditolak, bukan item cacatnya dibuang: batch ADA supaya
    // urutannya utuh, dan urutan yang kehilangan satu langkah lebih berbahaya
    // daripada batch yang tidak pernah berangkat.
    if (rejection !== null) return { ok: false, message: rejection };
  }

  return {
    ok: true,
    payload: commands.map((c) => ({ command: c.trim() })),
    ack:
      `queued ${commands.length} commands as one atomic batch -- ` +
      `no other payload can interleave between them`,
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/slash/send-tool.test.ts && bunx tsc --noEmit
```

Expected: PASS, tsc bersih.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src/engine/slash/send-tool.ts cc-plugin/test/engine/slash/send-tool.test.ts
git commit -m "feat(slash): buildSlashPayload -- validasi murni input send_slash

Terpisah dari map.ts: map.ts menerjemahkan slash TELEGRAM (yang punya inovasi
lapisan sendiri seperti /new), berkas ini melayani AI yang menyuntik perintah
Claude Code apa adanya.

Menolak /new /switch /delete /effort: keempatnya perintah lapisan Telegram dan
tidak ada di Claude Code. Menyuntikkannya membuat CC menampilkan 'unknown
command' di layar sementara AI mengira perintahnya berangkat.

Agent: bot-03"
```

---

## Task 4: `buildServer(backend, botHome)` — `botHome` masuk tanpa tool baru

**Files:**
- Modify: `cc-plugin/src/server.ts`
- Modify: `cc-plugin/src/main.ts`
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `buildServer(backend: ServerBackend, botHome: string): McpServer`. Parameter **wajib**, bukan opsional.

**Kenapa dipisah dari Task 5:** perubahan tanda tangan menyentuh ~18 call site di test, dan mencampurnya dengan kelahiran tool baru membuat diff yang tidak bisa ditinjau. Task ini **tidak menambah perilaku apa pun** — seluruh suite harus tetap hijau tanpa satu pun assertion berubah.

- [ ] **Step 1: Tulis test yang gagal**

Di `cc-plugin/test/server.test.ts`, tambahkan di dekat `fakeEngine`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

// Folder bot untuk test. Sengaja nyata (tmpdir), bukan string karangan: tool
// send_slash MENULIS ke sini, dan folder karangan akan lolos di test lalu gagal
// di produksi.
const testHome = () => mkdtempSync(joinPath(tmpdir(), "srv-home-"));
```

Lalu ganti **setiap** `buildServer(x)` menjadi `buildServer(x, testHome())` di seluruh berkas (termasuk di dalam helper `connected()` dan `connect()`).

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bunx tsc --noEmit
```

Expected: FAIL — `Expected 1 arguments, but got 2`.

- [ ] **Step 3: Implementasi minimal**

`cc-plugin/src/server.ts`:

```ts
/**
 * `botHome` diterima terpisah dari `backend`, dan itu bukan kelebihan
 * parameter: tool `send_slash` harus tetap bekerja saat engine GAGAL start --
 * justru di situlah user paling butuh /clear atau /rename untuk memulihkan
 * sesinya. Kalau ia menumpang Engine, ia ikut mati bersamanya.
 */
export function buildServer(backend: ServerBackend, botHome: string): McpServer {
```

`cc-plugin/src/main.ts` — kedua cabang:

```ts
export async function main(): Promise<void> {
  const botHome = resolveIdentityCwd();
  const started = startEngine(botHome);

  if (!started.ok) {
    console.error(`cc-plugin: ${started.message}`);
    const server = buildServer({ kind: "unavailable", reason: started.message }, botHome);
    await server.connect(new StdioServerTransport());
    return;
  }

  console.error(`cc-plugin: engine running for bot "${started.engine.bot}"`);
  const server = buildServer(started.engine, botHome);
  await server.connect(new StdioServerTransport());
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test && bunx tsc --noEmit
```

Expected: PASS, jumlah test **tidak berubah** dari Task 3 (task ini tidak menambah perilaku).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src/server.ts cc-plugin/src/main.ts cc-plugin/test/server.test.ts
git commit -m "refactor(server): buildServer menerima botHome, wajib bukan opsional

Parameter dibuat WAJIB supaya pemanggil yang lupa jatuh sebagai error tipe,
bukan diam-diam memakai process.cwd() -- yang untuk server MCP stdio tidak
dijamin sama dengan folder sesinya.

botHome diteruskan di KEDUA cabang, termasuk saat engine gagal start: tool
send_slash yang lahir berikutnya tidak boleh ikut mati bersama engine.

Agent: bot-03"
```

---

## Task 5: Tool MCP `send_slash`

**Files:**
- Modify: `cc-plugin/src/server.ts`
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: `buildSlashPayload`, `MAX_SLASH_BATCH` (Task 3) · `slashDirIn` (Task 1) · `writePending` (sudah ada) · `buildServer(backend, botHome)` (Task 4).
- Produces: tool MCP `send_slash` dengan input `{ command?: string; commands?: string[] }`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `cc-plugin/test/server.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { slashDirIn } from "../src/engine/paths";

// Tanpa tool ini, memindahkan cc-wrapper ke slash/ membuka jendela di mana bot
// baru TIDAK BISA me-/rename dirinya sendiri -- dan itu dipakai tiap handoff.
describe("tool send_slash", () => {
  async function connectWith(home: string, backend: any = fakeEngine()) {
    const server = buildServer(backend, home);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
    return { server, mcpClient };
  }

  function payloadsIn(home: string): unknown[] {
    return readdirSync(slashDirIn(home))
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(joinPath(slashDirIn(home), f), "utf8")));
  }

  test("perintah tunggal ditulis ke <botHome>/slash", async () => {
    const home = testHome();
    const { server, mcpClient } = await connectWith(home);

    const result: any = await mcpClient.callTool({
      name: "send_slash",
      arguments: { command: "/rename sesi-baru" },
    });

    expect(result.isError).toBeFalsy();
    expect(payloadsIn(home)).toEqual([{ command: "/rename sesi-baru" }]);

    await mcpClient.close();
    await server.close();
  });

  test("batch ditulis sebagai SATU berkas array, bukan beberapa berkas", async () => {
    const home = testHome();
    const { server, mcpClient } = await connectWith(home);

    await mcpClient.callTool({
      name: "send_slash",
      arguments: { commands: ["/rename done-x", "/clear", "/rename idle"] },
    });

    const payloads = payloadsIn(home);
    // Satu berkas: itulah yang membuat batch atomik. Tiga berkas terpisah bisa
    // diselipi payload lain di antaranya, dan urutan reset-sesi akan pecah.
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual([
      { command: "/rename done-x" },
      { command: "/clear" },
      { command: "/rename idle" },
    ]);

    await mcpClient.close();
    await server.close();
  });

  test("input yang ditolak dijawab sebagai error, dan TIDAK meninggalkan berkas", async () => {
    const home = testHome();
    const { server, mcpClient } = await connectWith(home);

    const result: any = await mcpClient.callTool({
      name: "send_slash",
      arguments: { command: "/new sesi-x" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("/clear");
    // Kalau berkasnya tetap ditulis, penolakannya bohong -- perintahnya tetap
    // berangkat dan AI diberi tahu sebaliknya.
    expect(payloadsIn(home)).toEqual([]);

    await mcpClient.close();
    await server.close();
  });

  // §3.3 spec. Ini kriteria yang paling mudah dilewati dan paling langsung
  // membuktikan kenapa send_slash tidak menumpang Engine.
  test("TETAP BEKERJA saat engine gagal start", async () => {
    const home = testHome();
    const { server, mcpClient } = await connectWith(home, {
      kind: "unavailable" as const,
      reason: "config.json tidak terbaca",
    });

    const result: any = await mcpClient.callTool({
      name: "send_slash",
      arguments: { command: "/clear" },
    });

    expect(result.isError).toBeFalsy();
    expect(payloadsIn(home)).toEqual([{ command: "/clear" }]);

    await mcpClient.close();
    await server.close();
  });

  test("terdaftar juga saat engine mati", async () => {
    const { server, mcpClient } = await connectWith(testHome(), {
      kind: "unavailable" as const,
      reason: "apa pun",
    });

    const { tools } = await mcpClient.listTools();
    expect(tools.map((t) => t.name)).toContain("send_slash");

    await mcpClient.close();
    await server.close();
  });

  // Keputusan user 2026-06-07 (neighbor autonomy), ditegakkan oleh BENTUK:
  // tidak ada parameter tujuan, jadi tidak ada yang bisa dialamatkan ke luar.
  test("self-only -- tidak ada parameter target di schema", async () => {
    const { server, mcpClient } = await connectWith(testHome());

    const { tools } = await mcpClient.listTools();
    const tool = tools.find((t) => t.name === "send_slash")!;
    const props = Object.keys((tool.inputSchema as any).properties ?? {});
    expect(props.sort()).toEqual(["command", "commands"]);

    await mcpClient.close();
    await server.close();
  });
});
```

Perbarui juga assertion daftar tool di `describe("cc-plugin MCP server when the engine could not start")`:

```ts
    expect(tools.map((t) => t.name).sort()).toEqual([
      "agent_list",
      "agent_send",
      "read_history",
      "reply",
      "search_history",
      "send_slash",
    ]);
```

⚠️ Test `"every tool answers with the reason"` di blok itu **jangan** ditambahi `send_slash` — tool itu justru **tidak boleh** menjawab dengan alasan; ia harus bekerja.

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/server.test.ts
```

Expected: FAIL — `Tool send_slash not found`.

- [ ] **Step 3: Implementasi minimal**

Di `cc-plugin/src/server.ts` tambahkan import:

```ts
import { randomUUID } from "node:crypto";
import { slashDirIn } from "./engine/paths";
import { writePending } from "./engine/slash/pending";
import { buildSlashPayload, MAX_SLASH_BATCH } from "./engine/slash/send-tool";
```

Lalu daftarkan tool — taruh **sesudah** `agent_list` dan **sebelum** blok `if (!isUnavailable(backend))`:

```ts
  // SENGAJA tidak menyentuh `backend`. Engine yang gagal start berarti Telegram
  // mati; tool ini cuma butuh tahu folder botnya, dan justru saat itulah user
  // paling butuh /clear atau /rename untuk memulihkan sesinya.
  server.registerTool(
    "send_slash",
    {
      description:
        "Send a slash command -- or an atomic BATCH of them -- to THIS session's own Claude Code. " +
        "Self-only by design: there is no target parameter, and there never will be. To have another bot run something, send it an `agent_send` message and let its own AI decide. " +
        "Only Claude Code's own commands work. Telegram-layer commands (`/new`, `/switch`, `/delete`, `/effort`) are rejected with the correct alternative named. " +
        "Pass `command` for one, or `commands` for an ordered batch (max " +
        MAX_SLASH_BATCH +
        "). A batch is written as ONE file and enqueued contiguously, so no other payload can interleave between its items -- use it for sequences like a handoff self-reset: [\"/rename done-...\", \"/clear\", \"/rename idle\"]. " +
        "Returns as soon as the command is queued; the wrapper injects the keystrokes on its next tick. Safe to call on your own initiative.",
      inputSchema: {
        command: z.string().min(1).optional(),
        commands: z.array(z.string().min(1)).optional(),
      },
    },
    async ({ command, commands }) => {
      const built = buildSlashPayload({
        ...(command !== undefined ? { command } : {}),
        ...(commands !== undefined ? { commands } : {}),
      });
      // Penolakan dijawab sebagai error, bukan sukses tanpa efek -- kalau
      // keduanya terlihat sama, AI mengira perintahnya sedang dikerjakan
      // padahal tidak pernah berangkat.
      if (!built.ok) {
        return { content: [{ type: "text" as const, text: built.message }], isError: true };
      }
      writePending(slashDirIn(botHome), built.payload, randomUUID());
      return { content: [{ type: "text" as const, text: built.ack }] };
    }
  );
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test && bunx tsc --noEmit
```

Expected: PASS, ≥ 470 hijau, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -m "feat(server): tool MCP send_slash -- pengganti pty_send_slash

Tanpa awalan pty_: 'pty' adalah detail implementasi, bukan sesuatu yang perlu
diketahui pemanggilnya (keputusan user lewat tombol 2026-08-05).

TIDAK menyentuh Engine. Engine gagal start berarti Telegram mati; tool ini cuma
butuh folder botnya, dan justru saat itulah user paling butuh /clear. Kalau ia
menumpang Engine, ia ikut mati bersamanya -- dan tertutup dua-duanya.

Self-only ditegakkan oleh BENTUK, bukan oleh pemeriksaan: tidak ada parameter
tujuan, jadi tidak ada yang bisa dialamatkan ke tetangga.

Agent: bot-03"
```

---

## Task 6: `cc-wrapper` membaca `slash/`, `wrapper.pid` pindah

**Files:**
- Modify: `cc-wrapper/src/main.ts` (baris 8–9 komentar, 29–31 konstanta, 41 `mkdirSync`, 140 & 146 pemakaian)
- Test: — (lihat catatan di bawah)

**Interfaces:**
- Consumes: kontrak payload yang tidak berubah dari `./inbox`.
- Produces: wrapper membaca `<botHome>/slash/`, lock di `<botHome>/wrapper.pid`.

**Catatan tentang test:** `cc-wrapper/src/main.ts` adalah berkas **perakitan** — ia menjalankan efek samping saat di-import (spawn PTY, `setInterval`, `setRawMode`), jadi ia tidak punya test unit dan tidak boleh dipaksa punya. Modul murni di sekitarnya (`inbox`, `queue`, `typer`, `lock`, `startup`) sudah punya test dan **tidak disentuh** task ini. Yang menjaga task ini adalah **kriteria uji hidup #1, #3, #4 di Task 8** — dan itu memang satu-satunya yang bisa membuktikannya (tingkat 13: yang belum terbayangkan hanya jatuh saat kode menyentuh yang asli).

- [ ] **Step 1: Buktikan keadaan SEBELUM, supaya perubahannya punya kontrol**

```bash
cd C:/Users/Mirza/workspace/mirza-bots && grep -n "pty-controller\|PENDING_DIR\|STATE_DIR" cc-wrapper/src/main.ts
```

Expected: baris 9, 29, 30, 31, 41, 140, 146. Catat angkanya — sesudah Step 2 seluruhnya harus hilang.

- [ ] **Step 2: Ubah `cc-wrapper/src/main.ts`**

Komentar kepala berkas (baris 8–9) — ganti:

```ts
 * Folder state mengikuti pola wrapper lama supaya penulis yang sudah ada tetap
 * bekerja: <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/
```

menjadi:

```ts
 * State tinggal di folder bot itu sendiri, sejajar config.json dan inbox/:
 *   <botHome>/slash/        perintah untuk sesi ini, ditulis cc-plugin
 *   <botHome>/wrapper.pid   satu wrapper per folder
 *
 * SENGAJA bukan folder yang sama dengan inbox/. Loop scan di bawah MENGHAPUS
 * berkas sebelum mem-parse-nya; kalau kedua payload berbagi folder, wrapper
 * menghapus pesan antar-bot lalu menolaknya, dan pesannya lenyap tanpa gejala.
```

Konstanta (baris 29–31) — ganti ketiganya menjadi:

```ts
const BOT_HOME = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const SLASH_DIR = join(BOT_HOME, "slash");
const LOCK_FILE = join(BOT_HOME, "wrapper.pid");
```

Ganti **setiap** pemakaian `PROJECT_DIR` yang tersisa menjadi `BOT_HOME` (ada di pesan error lock ~baris 48, pesan gerbang trust ~baris 76, dan `spawnClaude({ cwd: ... })` ~baris 109).

Ganti baris 41:

```ts
mkdirSync(SLASH_DIR, { recursive: true });
```

Ganti baris 140 dan 146 (`PENDING_DIR` → `SLASH_DIR`):

```ts
    files = readdirSync(SLASH_DIR);
```

```ts
    const path = join(SLASH_DIR, f);
```

Perbarui juga komentar di atas `setInterval` scan (baris ~134):

```ts
// --- membaca folder slash ---------------------------------------------------
```

- [ ] **Step 3: Verifikasi legacy benar-benar hilang**

```bash
cd C:/Users/Mirza/workspace/mirza-bots && grep -rn "pty-controller\|PENDING_DIR\|STATE_DIR\|PROJECT_DIR" cc-wrapper/src cc-plugin/src
```

Expected: **nol hasil.** (Ini kriteria uji hidup #7, dibayar lebih awal karena murah.)

- [ ] **Step 4: Jalankan seluruh test kedua paket**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper && bun test && bunx tsc --noEmit
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test && bunx tsc --noEmit
```

Expected: kedua paket hijau. `cc-wrapper` 36 test, `cc-plugin` ≥ 470.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-wrapper/src/main.ts
git commit -m "refactor(wrapper): baca <botHome>/slash, lock di <botHome>/wrapper.pid

Komponen paling baru di sistem ini adalah yang membawa nama plugin paling lama.
Alasannya sah pada harinya -- wrapper baru lahir tanpa penulis sendiri, jadi ia
menumpang alamat wrapper lama. Alasan itu sudah gugur: plugins/telegram tidak
pernah melayani bot baru, dan payload agent-bus lama sudah ditolak parsePayload
sejak hari pertama.

wrapper.pid sejajar bot.pid bukan kebetulan: keduanya menjawab 'proses mana yang
memegang X untuk folder ini', dan dua alamat untuk satu pertanyaan memaksa siapa
pun yang mendiagnosis bot bisu mengingat keduanya.

Agent: bot-03"
```

---

## Task 7: Rilis — versi, README, merge, push

**Files:**
- Modify: `cc-plugin/package.json:3`, `cc-plugin/.claude-plugin/plugin.json:4`
- Modify: `mirza-bots/README.md`

- [ ] **Step 1: Naikkan versi `cc-plugin` 0.12.0 → 0.13.0**

Ubah `"version": "0.12.0"` menjadi `"version": "0.13.0"` di **kedua** berkas. Tanpa ini `claude plugin update` tidak melihat ada yang perlu diambil (terbukti 2026-07-31: perbaikan yang sudah di-commit tidak pernah sampai ke sesi).

- [ ] **Step 2: Perbarui README**

Di bagian yang menjelaskan bentuk folder bot, tambahkan `slash/` dan `wrapper.pid`. Tambahkan juga bagian singkat tentang `send_slash` di daftar tool MCP, sejajar `agent_send` / `agent_list`. Cari anchor-nya dengan:

```bash
cd C:/Users/Mirza/workspace/mirza-bots && grep -n "inbox/\|agent_list\|bot.pid" README.md
```

Isi yang wajib ada: `slash/` dibaca wrapper · `inbox/` dibaca engine · **kenapa keduanya tidak boleh digabung** (hapus-sebelum-parse) · `send_slash` self-only.

- [ ] **Step 3: Gerbang penuh sebelum merge**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test && bunx tsc --noEmit
cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper && bun test && bunx tsc --noEmit
cd C:/Users/Mirza/workspace/mirza-bots && grep -rn "pty-controller" cc-plugin/src cc-wrapper/src
```

Expected: dua paket hijau, grep nol hasil. **Jangan lanjut kalau salah satu tidak.**

- [ ] **Step 4: Commit, merge ke `main`, push KEDUA repo**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/package.json cc-plugin/.claude-plugin/plugin.json README.md
git commit -m "chore: rilis cc-plugin 0.13.0 -- slash/ + send_slash

Agent: bot-03"
git checkout main && git merge --no-ff <branch> && git push
git status -sb   # WAJIB: tidak boleh ada 'ahead'
```

Lalu repo dokumen:

```bash
cd C:/Users/Mirza/workspace/mirza-marketplace
git add docs/superpowers/specs/2026-08-05-lepas-legacy-slash-folder-design.md docs/superpowers/plans/2026-08-05-lepas-legacy-slash-folder.md
git commit -m "docs: spec + rencana lepas legacy slash folder

Agent: bot-03"
git push && git status -sb
```

---

## Task 8: Uji hidup — bersama user, TIDAK boleh dikerjakan sendiri

**Prasyarat:** Task 1–7 selesai, ter-merge, ter-push.

⚠️ **Urutannya bukan preferensi.** `cc-wrapper` berjalan **langsung dari repo** (`bin/mirza-bot.cmd:39` → `npx tsx src/main.ts`), jadi ia memakai kode baru begitu bot dibuka ulang. `cc-plugin` dimuat dari **plugin cache**, jadi ia tetap 0.12.0 sampai di-update. Membalik urutannya = wrapper membaca `slash/` sementara plugin masih menulis ke `pending/` → slash Telegram mati tanpa pesan error.

- [ ] **Step 1: Minta user memasang 0.13.0 LEBIH DULU**

```bash
claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
```

Lalu **jangan percaya bahwa rilisnya mendarat** — periksa dari dua meteran:

```bash
cat ~/.claude/plugins/installed_plugins.json    # versi yang BENAR-BENAR terpasang
```
```powershell
Get-CimInstance Win32_Process -Filter "Name='bun.exe'" | Select-Object ProcessId, CommandLine
```

Preseden: seluruh lapisan slash pernah ter-merge dan **tidak aktif berhari-hari** karena cache masih memuat versi lama.

- [ ] **Step 2: Restart bot, lalu periksa bentuk foldernya**

```bash
ls C:/Users/Mirza/workspace/mirza_01_bot/
```

Kriteria: **`slash/` ada** · **`wrapper.pid` ada di akar** · `.claude/channels/` **tidak lahir lagi** (sisa yang lama dibiarkan).

- [ ] **Step 3: Kriteria #4 — `wrapper.pid` menunjuk proses yang benar-benar hidup**

```powershell
Get-Content C:\Users\Mirza\workspace\mirza_01_bot\wrapper.pid
Get-CimInstance Win32_Process -Filter "ProcessId=<pid>" | Select-Object Name, CommandLine
```

Angka di berkas **bukan bukti** — yang dibuktikan adalah prosesnya ada dan itu memang `tsx`/`node` milik cc-wrapper.

- [ ] **Step 4: Kriteria #3 — berkas benar-benar mampir di `slash/`**

Dari Telegram, kirim `/rename uji-slash-baru`. **Sebelum** wrapper mengambilnya (jendela ~500 ms; ulangi kalau terlewat) periksa:

```bash
ls C:/Users/Mirza/workspace/mirza_01_bot/slash/
```

Kriteria: satu berkas `.json` muncul, lalu folder kosong lagi. Ini membuktikan **alamat barunya** yang dipakai, bukan alamat lama yang kebetulan masih bekerja.

- [ ] **Step 5: Kriteria #1 — matikan `pty-controller`, lalu `/rename` lewat `send_slash`**

⚠️ Baru boleh sekarang, tidak sebelumnya.

```bash
cd C:/Users/Mirza/workspace/mirza_01_bot
claude plugin disable -s project pty-controller@mirza-marketplace
cat .claude/settings.json    # harus memuat {"enabledPlugins": {"pty-controller@mirza-marketplace": false}}
```

Scope `project` → **enam bot harian tidak tersentuh**. Reversibel lewat `claude plugin enable -s project`.

Restart bot, lalu minta AI-nya me-`/rename` dirinya lewat `send_slash`. Kriteria: nama sesi berubah, dan `pty_send_slash` **tidak ada** di daftar tool sesi itu.

- [ ] **Step 6: Kriteria #2 — batch atomik**

Minta AI memanggil `send_slash` dengan `commands: ["/rename uji-batch-1", "/clear", "/rename uji-batch-2"]`.

Kriteria: nama sesi akhir **`uji-batch-2`**, dan `session.id` berubah (membuktikan `/clear` benar-benar melahirkan sesi baru, bukan cuma rename dua kali).

- [ ] **Step 7: Kriteria #6 — `send_slash` hidup saat engine mati**

```bash
cd C:/Users/Mirza/workspace/mirza_01_bot
cp config.json config.json.bak
# rusak sengaja: ubah satu karakter sehingga JSON-nya tidak sah
```

Restart bot. Kriteria: `reply` menjawab *"Telegram is not available: …"*, sementara `send_slash` **tetap bekerja** — `/rename` mendarat.

```bash
mv config.json.bak config.json   # WAJIB dikembalikan
```

- [ ] **Step 8: Catat hasilnya**

Perbarui `BACKLOG.md` Bagian 0 blok "Kondisi sekarang" — versi terpasang, angka test, dan satu baris hasil uji hidup ini. Aturan keempat BACKLOG: temuan baru wajib masuk ke sana.

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §4.1 folder (`slash/`, `wrapper.pid`) | Task 1 (`slash/`), Task 6 (`wrapper.pid`) |
| §4.2 kontrak payload tidak berubah | Dijaga sebagai batasan: `inbox.ts`/`queue.ts` tidak disentuh; test Task 5 memakukan bentuk objek & array |
| §4.3 tool `send_slash` | Task 3 (validasi) + Task 5 (registrasi) |
| §4.4 D-1 `slashDirIn` di `paths.ts` | Task 1 |
| §4.4 D-2 `ensureBotDirs` membuat `slash/` | Task 1 Step 1/3 |
| §4.4 D-3 tolak `/new` `/switch` `/delete` `/effort` | Task 3 |
| §4.4 D-4 `pendingDir` dihapus | Task 2 Step 3a + Step 5 (grep) |
| §3.1 `send_slash` lahir di perubahan yang sama | Global Constraints: satu branch satu merge; Task 5 sebelum Task 6 |
| §3.2 `slash/` ≠ `inbox/` | Task 1 test `"keduanya bukan folder yang sama"` |
| §3.3 tidak bergantung engine | Task 4 + Task 5 test `"TETAP BEKERJA saat engine gagal start"` |
| §5 permukaan tersentuh | Semua terpetakan di File Structure |
| §6 kriteria uji hidup #1–#7 | Task 8 Step 5, 6, 4, 3, 2, 7 · #7 dibayar lebih awal di Task 6 Step 3 |

**Yang sengaja TIDAK punya task** (§9 spec): menyentuh `plugins/**` · menghapus `.claude/channels/` yang sudah ada · mengarahkan `agent-bus` lama ke `inbox/` · AB-1 · kompatibilitas mundur.

**Type consistency:** `slashDirIn(botHome)` dipakai dengan nama yang sama di Task 1, 2, 5. `SlashDeps.botHome` konsisten Task 2 ↔ `engine.ts`. `buildSlashPayload` / `SlashSendResult` / `MAX_SLASH_BATCH` konsisten Task 3 ↔ 5. `buildServer(backend, botHome)` konsisten Task 4 ↔ 5. `writePending(dir, payload, id)` tidak berubah tanda tangannya sama sekali.
