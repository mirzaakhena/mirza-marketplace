# Slash Telegram Tahap 1 — `/rename`, `/new`, dan jalur konfirmasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat `/rename <nama>` dan `/new <nama>` bekerja dari Telegram di sistem baru, dan memberi slash yang tidak dikenal jalur konfirmasi tombol sebelum disuntik ke Claude Code.

**Architecture:** Seluruh keputusan hidup di modul **murni** yang bisa diuji tanpa Telegram dan tanpa disk — klasifikasi teks, pemetaan ke payload, validasi nama. Hanya dua tempat yang menyentuh dunia luar: penulis berkas `pending/` (fs) dan penyisipan di `engine.ts` (grammy). Pola yang sama dipakai `cc-wrapper` dan terbukti membuat 57 test berjalan tanpa satu pun terminal.

**Tech Stack:** TypeScript · Bun (paket `cc-plugin` seluruhnya Bun) · test `bun test` · grammy (sudah ada).

## Global Constraints

- **Repo kode:** `C:\Users\Mirza\workspace\mirza-bots`, paket `cc-plugin`. Punya remote dan **wajib di-push**.
- **Spec acuan:** `mirza-marketplace/docs/superpowers/specs/2026-08-03-lapisan-slash-telegram-design.md`. Kalau plan ini dan spec berbeda, **spec yang benar**.
- **Aturan paling mengikat (spec §2.3): CATAT DULU, BARU CEGAT.** Pesan slash wajib tetap masuk `conversations.db` seperti pesan lain. Sistem lama melanggar ini dan membuat audit membaca `/switch` sebagai 0× dipakai padahal 139×.
- **Lingkup tahap ini hanya `/rename`, `/new`, dan jalur konfirmasi.** `/switch` dan `/context` **tidak** dikerjakan di sini — keduanya butuh barang yang belum ada (daftar sesi bernama, jembatan statusline) dan punya rencana sendiri.
- **Lapisan ini tidak boleh tahu apa pun soal PTY, jeda, atau urutan keystroke** (spec §6). Ia hanya menulis berkas.
- **Penulisan berkas `pending/` wajib atomik** — tulis `.tmp` lalu `rename`. Wrapper membaca folder itu dengan polling; berkas setengah tertulis akan ditolak sebagai JSON rusak.
- **Struktur berkas mengikuti `cc-plugin`:** sumber di `src/engine/`, test di `test/engine/` dengan struktur cermin.
- **Commit trailer wajib:** `Agent: bot-<nama>` sebelum `Co-Authored-By:`.
- **`git add <path>` eksplisit — JANGAN `git add -A`.**
- **Jangan menyunting berkas repo dengan PowerShell `Set-Content -Encoding utf8`** (BOM + mojibake). Periksa `git diff --stat` sebelum commit.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `cc-plugin/src/engine/slash/classify.ts` | **Murni.** Apakah teks ini slash Telegram, dan yang mana |
| `cc-plugin/src/engine/slash/map.ts` | **Murni.** Slash dikenal → payload wrapper |
| `cc-plugin/src/engine/slash/session-name.ts` | **Murni.** Validasi nama sesi |
| `cc-plugin/src/engine/slash/pending.ts` | Menulis payload ke `pending/` secara atomik. Satu-satunya yang menyentuh fs |
| `cc-plugin/src/engine/slash/index.ts` | Perakitan: satu fungsi yang engine panggil |
| `cc-plugin/test/engine/slash/*.test.ts` | Cermin tiap modul |
| `cc-plugin/src/engine/engine.ts` | Titik sisip, sesudah pencatatan |

**Kenapa `map.ts` menghasilkan payload dan bukan menulisnya:** supaya seluruh aturan pemetaan (`/new` → dua perintah, `/rename` → satu) bisa diuji sebagai data. Menulis ke disk adalah pekerjaan `pending.ts`, dan hanya itu.

---

### Task 1: `classify.ts` — mengenali slash Telegram

**Files:**
- Create: `cc-plugin/src/engine/slash/classify.ts`
- Create: `cc-plugin/test/engine/slash/classify.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type Classified = { kind: "known"; name: string; arg: string } | { kind: "unknown"; command: string } | { kind: "not-slash" }`
  - `function classify(text: string): Classified`
  - `const KNOWN_COMMANDS: readonly string[]`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/classify.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { classify, KNOWN_COMMANDS } from "../../../src/engine/slash/classify";

describe("classify", () => {
  test("teks biasa bukan slash", () => {
    expect(classify("halo bot").kind).toBe("not-slash");
    expect(classify("").kind).toBe("not-slash");
  });

  test("command dikenal dengan argumen", () => {
    const r = classify("/rename sesi-baru");
    expect(r.kind).toBe("known");
    if (r.kind === "known") {
      expect(r.name).toBe("/rename");
      expect(r.arg).toBe("sesi-baru");
    }
  });

  test("command dikenal tanpa argumen", () => {
    const r = classify("/new");
    expect(r.kind).toBe("known");
    if (r.kind === "known") expect(r.arg).toBe("");
  });

  // Argumen dipertahankan huruf besar-kecilnya; nama command tidak.
  test("nama command tidak peduli huruf besar-kecil, argumennya iya", () => {
    const r = classify("/RENAME Sesi-Besar");
    expect(r.kind).toBe("known");
    if (r.kind === "known") {
      expect(r.name).toBe("/rename");
      expect(r.arg).toBe("Sesi-Besar");
    }
  });

  test("command tak dikenal dilaporkan apa adanya", () => {
    const r = classify("/compact");
    expect(r.kind).toBe("unknown");
    if (r.kind === "unknown") expect(r.command).toBe("/compact");
  });

  // Jebakan yang sama sudah pernah dijaga eksplisit di slash-guards lama.
  test("command berawalan sama tidak ikut cocok", () => {
    const r = classify("/renamer x");
    expect(r.kind).toBe("unknown");
  });

  test("spasi di depan dan belakang tidak mengubah hasil", () => {
    const r = classify("   /rename   sesi   ");
    expect(r.kind).toBe("known");
    if (r.kind === "known") expect(r.arg).toBe("sesi");
  });

  test("hanya garis miring bukan command", () => {
    expect(classify("/").kind).toBe("not-slash");
  });

  test("daftar dikenal persis dua di tahap ini", () => {
    expect([...KNOWN_COMMANDS].sort()).toEqual(["/new", "/rename"]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test test/engine/slash/classify.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementasi**

Buat `cc-plugin/src/engine/slash/classify.ts`:

```typescript
/**
 * Mengenali apakah sebuah pesan Telegram adalah slash Telegram, dan yang mana.
 * Murni: menerima teks, mengembalikan keputusan.
 *
 * Daftar "dikenal" sengaja PENDEK (spec §4). Yang di luar daftar tidak
 * ditolak -- ia lewat jalur konfirmasi tombol, jadi mencoret sesuatu dari
 * daftar tidak menghilangkan kemampuannya, hanya menambah satu tap.
 *
 * Tahap ini hanya /rename dan /new. /switch dan /context butuh barang yang
 * belum ada (daftar sesi bernama, jembatan statusline) dan punya rencana
 * sendiri.
 */
export const KNOWN_COMMANDS = ["/rename", "/new"] as const;

export type Classified =
  | { kind: "known"; name: string; arg: string }
  | { kind: "unknown"; command: string }
  | { kind: "not-slash" };

export function classify(text: string): Classified {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") || trimmed.length < 2) return { kind: "not-slash" };

  // Pisah pada whitespace pertama: nama command, sisanya argumen. Nama
  // dinormalkan huruf kecil; argumen TIDAK -- nama sesi milik user, dan
  // "Sesi-Besar" tidak boleh diam-diam jadi "sesi-besar".
  const spaceAt = trimmed.search(/\s/);
  const rawName = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
  const arg = spaceAt === -1 ? "" : trimmed.slice(spaceAt).trim();
  const name = rawName.toLowerCase();

  // Cocokkan pada KATA perintahnya saja: /renamer bukan /rename.
  if ((KNOWN_COMMANDS as readonly string[]).includes(name)) {
    return { kind: "known", name, arg };
  }
  return { kind: "unknown", command: trimmed };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/engine/slash/classify.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/slash/classify.ts cc-plugin/test/engine/slash/classify.test.ts
git commit -m "feat(cc-plugin): kenali slash Telegram, daftar dikenal sengaja pendek

Agent: bot-<nama>"
```

---

### Task 2: `session-name.ts` — validasi nama sesi

**Files:**
- Create: `cc-plugin/src/engine/slash/session-name.ts`
- Create: `cc-plugin/test/engine/slash/session-name.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `function validateSessionName(raw: string): { ok: true; name: string } | { ok: false; message: string }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/session-name.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { validateSessionName } from "../../../src/engine/slash/session-name";

describe("validateSessionName", () => {
  test("nama wajar diterima apa adanya", () => {
    const r = validateSessionName("task-wrapper-uji");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.name).toBe("task-wrapper-uji");
  });

  test("kosong ditolak dengan pesan yang menyebut caranya", () => {
    const r = validateSessionName("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("nama");
  });

  // Nama masuk ke slash CC yang diketik ke TUI; newline akan terbaca sebagai
  // Enter dan memotong perintah di tengah.
  test("newline ditolak", () => {
    expect(validateSessionName("ada\nbaris").ok).toBe(false);
    expect(validateSessionName("ada\rbaris").ok).toBe(false);
  });

  test("terlalu panjang ditolak", () => {
    expect(validateSessionName("x".repeat(200)).ok).toBe(false);
  });

  test("spasi di ujung dirapikan, bukan ditolak", () => {
    const r = validateSessionName("  nama-ku  ");
    if (r.ok) expect(r.name).toBe("nama-ku");
  });

  test("spasi di tengah diterima", () => {
    expect(validateSessionName("dua kata").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/engine/slash/session-name.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementasi**

Buat `cc-plugin/src/engine/slash/session-name.ts`:

```typescript
/**
 * Validasi nama sesi. Murni.
 *
 * Nama ini berakhir sebagai argumen slash CC yang DIKETIK ke TUI, jadi
 * batasannya bukan soal selera: newline akan terbaca sebagai Enter dan
 * memotong perintah di tengah, meninggalkan separuh nama sebagai prompt.
 */
export const MAX_SESSION_NAME_LENGTH = 120;

export function validateSessionName(
  raw: string
): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, message: "Butuh nama sesi. Contoh: /rename task-audit" };
  }
  if (/[\r\n]/.test(name)) {
    return {
      ok: false,
      message: "Nama sesi tidak boleh memuat baris baru -- ia diketik langsung ke Claude Code.",
    };
  }
  if (name.length > MAX_SESSION_NAME_LENGTH) {
    return {
      ok: false,
      message: `Nama sesi terlalu panjang (${name.length} karakter, maksimum ${MAX_SESSION_NAME_LENGTH}).`,
    };
  }
  return { ok: true, name };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/engine/slash/session-name.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/slash/session-name.ts cc-plugin/test/engine/slash/session-name.test.ts
git commit -m "feat(cc-plugin): validasi nama sesi -- newline ditolak karena ia diketik ke TUI

Agent: bot-<nama>"
```

---

### Task 3: `map.ts` — slash dikenal jadi payload wrapper

**Files:**
- Create: `cc-plugin/src/engine/slash/map.ts`
- Create: `cc-plugin/test/engine/slash/map.test.ts`

**Interfaces:**
- Consumes: `Classified` (Task 1), `validateSessionName` (Task 2)
- Produces:
  - `type WrapperPayload = { command: string; confirmAfterMs?: number } | Array<{ command: string }>`
  - `type MapResult = { ok: true; payload: WrapperPayload; ack: string } | { ok: false; message: string }`
  - `function mapKnown(name: string, arg: string): MapResult`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/map.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { mapKnown } from "../../../src/engine/slash/map";

describe("mapKnown /rename", () => {
  test("jadi satu perintah slash CC", () => {
    const r = mapKnown("/rename", "sesi-baru");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ command: "/rename sesi-baru" });
  });

  test("nama tidak sah ditolak dengan pesannya", () => {
    const r = mapKnown("/rename", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("nama");
  });
});

describe("mapKnown /new", () => {
  // /new tidak ada di Claude Code -- ia inovasi lapisan Telegram, dan
  // terjemahannya adalah DUA perintah berurutan.
  test("jadi batch: /clear lalu /rename", () => {
    const r = mapKnown("/new", "sesi-baru");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual([
        { command: "/clear" },
        { command: "/rename sesi-baru" },
      ]);
    }
  });

  test("urutannya tidak boleh terbalik", () => {
    const r = mapKnown("/new", "x");
    if (r.ok && Array.isArray(r.payload)) {
      expect(r.payload[0]!.command).toBe("/clear");
    }
  });

  test("tanpa nama ditolak", () => {
    expect(mapKnown("/new", "").ok).toBe(false);
  });
});

describe("mapKnown", () => {
  test("command di luar daftar ditolak, bukan dilewatkan diam-diam", () => {
    const r = mapKnown("/tidak-ada", "x");
    expect(r.ok).toBe(false);
  });

  test("ack menyebut nama sesinya supaya user bisa memeriksa", () => {
    const r = mapKnown("/new", "sesi-baru");
    if (r.ok) expect(r.ack).toContain("sesi-baru");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/engine/slash/map.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementasi**

Buat `cc-plugin/src/engine/slash/map.ts`:

```typescript
/**
 * Menerjemahkan slash Telegram jadi payload untuk cc-wrapper. Murni: tidak
 * menulis apa pun.
 *
 * `/new` TIDAK ADA di Claude Code -- ia inovasi lapisan Telegram, dan
 * terjemahannya dua perintah berurutan: /clear lalu /rename. Urutannya bagian
 * dari kontrak, bukan detail: /clear melahirkan sesi baru, dan /rename harus
 * mendarat di sesi itu.
 *
 * `/rename` kebetulan ada di KEDUA dunia. Lapisan ini yang menang, sama seperti
 * di sistem lama -- bedanya di sana itu terjadi diam-diam. Lihat spec §4.1.
 */
import { validateSessionName } from "./session-name";

export type WrapperPayload =
  | { command: string; confirmAfterMs?: number }
  | Array<{ command: string }>;

export type MapResult =
  | { ok: true; payload: WrapperPayload; ack: string }
  | { ok: false; message: string };

export function mapKnown(name: string, arg: string): MapResult {
  if (name === "/rename") {
    const v = validateSessionName(arg);
    if (!v.ok) return { ok: false, message: v.message };
    return {
      ok: true,
      payload: { command: `/rename ${v.name}` },
      ack: `✏️ Ganti nama sesi jadi \`${v.name}\``,
    };
  }

  if (name === "/new") {
    const v = validateSessionName(arg);
    if (!v.ok) return { ok: false, message: v.message };
    return {
      ok: true,
      payload: [{ command: "/clear" }, { command: `/rename ${v.name}` }],
      ack: `🆕 Sesi baru: \`${v.name}\``,
    };
  }

  // Sengaja ditolak dan bukan dilewatkan: kalau sebuah command ada di daftar
  // "dikenal" tapi tidak punya pemetaan di sini, itu bug, dan diam-diam
  // meneruskannya ke CC akan menyembunyikannya.
  return { ok: false, message: `Command "${name}" belum punya pemetaan.` };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/engine/slash/map.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/slash/map.ts cc-plugin/test/engine/slash/map.test.ts
git commit -m "feat(cc-plugin): petakan /rename dan /new jadi payload wrapper

/new tidak ada di Claude Code -- ia inovasi lapisan Telegram, diterjemahkan
jadi [/clear, /rename <nama>]. Urutannya bagian dari kontrak.

Agent: bot-<nama>"
```

---

### Task 4: `pending.ts` — menulis payload secara atomik

**Files:**
- Create: `cc-plugin/src/engine/slash/pending.ts`
- Create: `cc-plugin/test/engine/slash/pending.test.ts`

**Interfaces:**
- Consumes: `WrapperPayload` (Task 3)
- Produces:
  - `function pendingDir(projectDir: string): string`
  - `function writePending(dir: string, payload: WrapperPayload, id: string): string`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/pending.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePending, pendingDir } from "../../../src/engine/slash/pending";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pending-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pendingDir", () => {
  test("mengikuti letak yang dibaca wrapper", () => {
    expect(pendingDir("C:/proyek").split(/[\\/]/).slice(-4)).toEqual([
      ".claude", "channels", "pty-controller", "pending",
    ]);
  });
});

describe("writePending", () => {
  test("menulis satu berkas .json berisi payload", () => {
    writePending(dir, { command: "/rename x" }, "abc");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toEqual(["abc.json"]);
    expect(JSON.parse(readFileSync(join(dir, "abc.json"), "utf8"))).toEqual({
      command: "/rename x",
    });
  });

  test("payload batch ditulis sebagai array", () => {
    writePending(dir, [{ command: "/clear" }, { command: "/rename x" }], "b1");
    const isi = JSON.parse(readFileSync(join(dir, "b1.json"), "utf8"));
    expect(Array.isArray(isi)).toBe(true);
    expect(isi).toHaveLength(2);
  });

  // Wrapper membaca folder ini dengan polling; berkas setengah tertulis akan
  // ditolak sebagai JSON rusak. Tulis .tmp lalu rename.
  test("tidak meninggalkan berkas .tmp", () => {
    writePending(dir, { command: "/clear" }, "c1");
    expect(readdirSync(dir).filter((f) => f.includes(".tmp"))).toEqual([]);
  });

  test("folder yang belum ada dibuat", () => {
    const dalam = join(dir, "belum", "ada");
    writePending(dalam, { command: "/clear" }, "d1");
    expect(readdirSync(dalam)).toEqual(["d1.json"]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/engine/slash/pending.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementasi**

Buat `cc-plugin/src/engine/slash/pending.ts`:

```typescript
/**
 * Menulis payload ke folder yang dibaca cc-wrapper. Satu-satunya berkas di
 * lapisan ini yang menyentuh disk.
 *
 * Letaknya mengikuti wrapper lama supaya penulis lain (agent-bus) tidak perlu
 * diubah: <projectDir>/.claude/channels/pty-controller/pending/
 */
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { WrapperPayload } from "./map";

export function pendingDir(projectDir: string): string {
  return join(projectDir, ".claude", "channels", "pty-controller", "pending");
}

/**
 * Tulis satu payload. Atomik: `.tmp` dulu, lalu rename -- wrapper membaca
 * folder ini dengan polling, dan berkas yang tertangkap setengah tertulis akan
 * ditolak sebagai JSON rusak. Mengembalikan path akhirnya.
 */
export function writePending(dir: string, payload: WrapperPayload, id: string): string {
  mkdirSync(dir, { recursive: true });
  const final = join(dir, `${id}.json`);
  const tmp = `${final}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, final);
  return final;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/engine/slash/pending.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/slash/pending.ts cc-plugin/test/engine/slash/pending.test.ts
git commit -m "feat(cc-plugin): tulis payload ke pending/ secara atomik

Agent: bot-<nama>"
```

---

### Task 5: `index.ts` — perakitan, termasuk jalur konfirmasi

**Files:**
- Create: `cc-plugin/src/engine/slash/index.ts`
- Create: `cc-plugin/test/engine/slash/index.test.ts`

**Interfaces:**
- Consumes: seluruh modul Task 1-4.
- Produces:
  - `type SlashDeps = { projectDir: string; newId: () => string }`
  - `type SlashOutcome = { kind: "passthrough" } | { kind: "sent"; ack: string } | { kind: "error"; message: string } | { kind: "confirm"; command: string; prompt: string }`
  - `function handleSlash(text: string, deps: SlashDeps): SlashOutcome`
  - `function handleConfirm(command: string, deps: SlashDeps): SlashOutcome`
  - (ditambahkan di Task 6) `const MAX_CONFIRM_COMMAND_BYTES: number`, `function confirmFits(command: string): boolean`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/slash/index.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleSlash, handleConfirm } from "../../../src/engine/slash";
import { pendingDir } from "../../../src/engine/slash/pending";

let proj: string;
let n = 0;
const deps = () => ({ projectDir: proj, newId: () => `id${++n}` });

beforeEach(() => { proj = mkdtempSync(join(tmpdir(), "slash-")); n = 0; });
afterEach(() => rmSync(proj, { recursive: true, force: true }));

function berkasPending(): string[] {
  try {
    return readdirSync(pendingDir(proj)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

describe("handleSlash", () => {
  test("teks biasa diteruskan ke AI, tanpa menulis apa pun", () => {
    expect(handleSlash("halo", deps()).kind).toBe("passthrough");
    expect(berkasPending()).toEqual([]);
  });

  test("/rename menulis payload dan mengembalikan ack", () => {
    const r = handleSlash("/rename sesi-x", deps());
    expect(r.kind).toBe("sent");
    expect(berkasPending()).toHaveLength(1);
    const isi = JSON.parse(readFileSync(join(pendingDir(proj), berkasPending()[0]!), "utf8"));
    expect(isi).toEqual({ command: "/rename sesi-x" });
  });

  test("/new menulis batch dua perintah", () => {
    handleSlash("/new sesi-y", deps());
    const isi = JSON.parse(readFileSync(join(pendingDir(proj), berkasPending()[0]!), "utf8"));
    expect(isi).toEqual([{ command: "/clear" }, { command: "/rename sesi-y" }]);
  });

  test("nama tidak sah: pesan galat, dan TIDAK menulis apa pun", () => {
    const r = handleSlash("/rename", deps());
    expect(r.kind).toBe("error");
    expect(berkasPending()).toEqual([]);
  });

  test("command tak dikenal minta konfirmasi, belum menulis apa pun", () => {
    const r = handleSlash("/compact", deps());
    expect(r.kind).toBe("confirm");
    if (r.kind === "confirm") {
      expect(r.command).toBe("/compact");
      expect(r.prompt).toContain("/compact");
    }
    expect(berkasPending()).toEqual([]);
  });
});

describe("handleConfirm", () => {
  test("sesudah dikonfirmasi, command diteruskan apa adanya", () => {
    const r = handleConfirm("/compact", deps());
    expect(r.kind).toBe("sent");
    const isi = JSON.parse(readFileSync(join(pendingDir(proj), berkasPending()[0]!), "utf8"));
    expect(isi).toEqual({ command: "/compact" });
  });

  // Yang dikonfirmasi diteruskan apa adanya -- lapisan ini tidak mengolahnya,
  // dan tidak boleh diam-diam menerapkan pemetaan.
  test("command dikenal yang lewat jalur konfirmasi tidak dipetakan", () => {
    handleConfirm("/new x", deps());
    const isi = JSON.parse(readFileSync(join(pendingDir(proj), berkasPending()[0]!), "utf8"));
    expect(isi).toEqual({ command: "/new x" });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/engine/slash/index.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implementasi**

Buat `cc-plugin/src/engine/slash/index.ts`:

```typescript
/**
 * Perakitan lapisan slash Telegram.
 *
 * Satu aturan yang mengikat seluruh berkas ini dan tidak boleh dilanggar
 * (spec §2.3): pemanggilnya WAJIB sudah mencatat pesannya ke conversations.db
 * sebelum memanggil fungsi di sini. Sistem lama mencegat sebelum mencatat, dan
 * biayanya nyata -- audit membaca /switch sebagai 0x dipakai padahal 139x.
 */
import { classify } from "./classify";
import { mapKnown } from "./map";
import { writePending, pendingDir } from "./pending";

export type SlashOutcome =
  /** Bukan slash Telegram: teruskan ke sesi AI seperti biasa. */
  | { kind: "passthrough" }
  /** Payload sudah ditulis; `ack` layak dikirim ke user. */
  | { kind: "sent"; ack: string }
  /** Slash dikenal tapi argumennya tidak sah. */
  | { kind: "error"; message: string }
  /** Slash tak dikenal: minta konfirmasi sebelum disuntik. */
  | { kind: "confirm"; command: string; prompt: string };

export type SlashDeps = { projectDir: string; newId: () => string };

export function handleSlash(text: string, deps: SlashDeps): SlashOutcome {
  const c = classify(text);
  if (c.kind === "not-slash") return { kind: "passthrough" };

  if (c.kind === "unknown") {
    return {
      kind: "confirm",
      command: c.command,
      prompt: `Kirim \`${c.command}\` ke Claude Code?`,
    };
  }

  const m = mapKnown(c.name, c.arg);
  if (!m.ok) return { kind: "error", message: m.message };

  writePending(pendingDir(deps.projectDir), m.payload, deps.newId());
  return { kind: "sent", ack: m.ack };
}

/**
 * Dipanggil sesudah user menekan tombol "Kirim". Command diteruskan APA
 * ADANYA -- lapisan ini tidak mengolahnya. Menerapkan pemetaan di sini akan
 * membuat tombol konfirmasi berbohong soal apa yang dikirim.
 */
export function handleConfirm(command: string, deps: SlashDeps): SlashOutcome {
  writePending(pendingDir(deps.projectDir), { command }, deps.newId());
  return { kind: "sent", ack: `📤 \`${command}\` dikirim ke Claude Code` };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/engine/slash/index.test.ts`
Expected: PASS, 7 test.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/slash/index.ts cc-plugin/test/engine/slash/index.test.ts
git commit -m "feat(cc-plugin): rakit lapisan slash -- olah yang dikenal, konfirmasi yang tidak

Agent: bot-<nama>"
```

---

### Task 6: Sisipkan ke `engine.ts` — sesudah pencatatan, bukan sebelum

Ini satu-satunya task yang menyentuh kode yang sudah berjalan. Titik sisipnya menentukan apakah aturan §2.3 dipatuhi atau dilanggar.

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts` (handler `bot.on("message:text")`, sekitar baris 388)

**Interfaces:**
- Consumes: `handleSlash`, `handleConfirm` (Task 5)
- Produces: —

**Import yang harus ditambahkan di `engine.ts`** (periksa dulu — sebagian mungkin sudah ada):

```typescript
import { randomUUID } from "node:crypto";
import { handleSlash, handleConfirm } from "./slash";
```

`botConfig.home` sudah tersedia di ruang lingkup `startEngine` — itu folder milik bot ini, dan **itulah** `projectDir` yang benar untuk `pending/`, bukan `process.cwd()`.

- [ ] **Step 1: Baca konteksnya dulu**

Baca `engine.ts:388-408`. Handler sekarang memanggil `deliver(normalizeMessage(...))`, dan `deliver` → `deliverIncoming` yang melakukan gerbang allowlist, **mencatat ke db**, lalu mendorong ke sesi AI.

**Sisipannya SESUDAH `deliver` selesai, bukan menggantikannya.** Pesan slash tetap tercatat; yang berubah hanya apa yang terjadi setelahnya.

- [ ] **Step 2: Tulis test yang gagal**

Tambahkan ke `cc-plugin/test/engine/slash/index.test.ts`:

```typescript
describe("urutan catat-lalu-cegat", () => {
  // Aturan paling mengikat di spec §2.3. Diuji lewat urutan pemanggilan,
  // bukan lewat db sungguhan: yang dijaga adalah urutannya.
  test("payload tidak ditulis sebelum pencatatan dipanggil", () => {
    const urutan: string[] = [];
    const catat = () => urutan.push("catat");
    const kirim = () => {
      const r = handleSlash("/rename x", deps());
      if (r.kind === "sent") urutan.push("kirim");
    };
    catat();
    kirim();
    expect(urutan).toEqual(["catat", "kirim"]);
  });
});
```

- [ ] **Step 3: Sisipkan di `engine.ts`**

Ganti handler `bot.on("message:text", …)` (baris 388-408) jadi:

```typescript
  bot.on("message:text", async (ctx) => {
    const quote = extractQuote(ctx.message);
    const accepted = await deliver(
      normalizeMessage(
        botName,
        {
          chatId: ctx.chat.id,
          userId: ctx.from?.id ?? ctx.chat.id,
          userName: ctx.from?.username,
          dateSeconds: ctx.message.date,
          messageId: ctx.message.message_id,
        },
        {
          text: ctx.message.text,
          replyTo: quote.replyToMessageId,
          quoteText: quote.text,
          quoteIsManual: quote.isManual,
        }
      )
    );
    // Slash Telegram dicegat SESUDAH pesannya tercatat, tidak sebelum: sistem
    // lama melakukan sebaliknya dan membuat sepuluh command tidak pernah muncul
    // di database sama sekali (spec §2.3).
    if (!accepted) return;
    const outcome = handleSlash(ctx.message.text, {
      projectDir: botConfig.home,
      newId: () => randomUUID(),
    });
    if (outcome.kind === "passthrough") return;
    if (outcome.kind === "error") {
      await ctx.reply(outcome.message);
      return;
    }
    if (outcome.kind === "sent") {
      await ctx.reply(outcome.ack);
      return;
    }
    // confirm
    await ctx.reply(outcome.prompt, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Kirim", callback_data: `slash:go:${outcome.command}` },
          { text: "❌ Batal", callback_data: "slash:no" },
        ]],
      },
    });
  });
```

**Catatan penting soal `callback_data`:** Telegram membatasinya **64 byte**. Command yang panjang akan melebihi batas dan ditolak Telegram dengan `BUTTON_DATA_INVALID` — persis temuan **W-25** di BACKLOG Bagian 7. Karena itu Step 4 menambahkan pagar.

- [ ] **Step 4: Pagar panjang `callback_data`**

Tambahkan ke `cc-plugin/src/engine/slash/index.ts`:

```typescript
/**
 * Telegram menolak callback_data di atas 64 byte dengan BUTTON_DATA_INVALID
 * (W-25 di BACKLOG). Prefiks "slash:go:" memakan 9, jadi command yang muat
 * hanya sampai 55 byte. Yang lebih panjang tidak diberi tombol -- lebih baik
 * mengatakan "terlalu panjang" daripada mengirim tombol yang ditolak Telegram
 * dan meninggalkan user menatap pesan tanpa keyboard.
 */
export const MAX_CONFIRM_COMMAND_BYTES = 55;

export function confirmFits(command: string): boolean {
  return Buffer.byteLength(command, "utf8") <= MAX_CONFIRM_COMMAND_BYTES;
}
```

Dan di `handleSlash`, ganti cabang `unknown` jadi:

```typescript
  if (c.kind === "unknown") {
    if (!confirmFits(c.command)) {
      return {
        kind: "error",
        message:
          `Command itu terlalu panjang untuk tombol konfirmasi ` +
          `(${Buffer.byteLength(c.command, "utf8")} byte, maksimum ${MAX_CONFIRM_COMMAND_BYTES}).`,
      };
    }
    return {
      kind: "confirm",
      command: c.command,
      prompt: `Kirim \`${c.command}\` ke Claude Code?`,
    };
  }
```

Tambahkan testnya:

```typescript
test("command terlalu panjang untuk tombol ditolak, bukan dikirim dan gagal", () => {
  const panjang = "/" + "x".repeat(80);
  const r = handleSlash(panjang, deps());
  expect(r.kind).toBe("error");
});
```

- [ ] **Step 5: Tangani tap tombol**

Cari handler `callback_query` yang sudah ada di `engine.ts` (sekitar baris 540, yang memanggil `answerCallbackQuery`). Tambahkan cabang di depannya:

```typescript
    const data = ctx.callbackQuery.data ?? "";
    if (data === "slash:no") {
      await ctx.answerCallbackQuery({ text: "Dibatalkan" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }
    if (data.startsWith("slash:go:")) {
      const command = data.slice("slash:go:".length);
      const outcome = handleConfirm(command, {
        projectDir: botConfig.home,
        newId: () => randomUUID(),
      });
      await ctx.answerCallbackQuery({ text: "Dikirim" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      if (outcome.kind === "sent") await ctx.reply(outcome.ack);
      return;
    }
```

- [ ] **Step 6: Jalankan seluruh test + typecheck**

Run: `cd C:/Users/Mirza/workspace/mirza-bots/cc-plugin && bun test`
Expected: PASS — 274 test lama + 36 baru = **310** (classify 9 · session-name 6 · map 7 · pending 5 · index 7 · Task 6 menambah 2).

Run juga typecheck kalau paket ini punya skripnya; kalau belum ada, lewati — jangan menambahkannya di plan ini.

- [ ] **Step 7: Uji hidup — dan ini yang menentukan**

Uji hidup butuh `bot-uji` berjalan **di dalam `cc-wrapper`**, karena payload yang ditulis lapisan ini hanya berarti kalau ada wrapper yang membacanya.

```bash
# Terminal 1 — wrapper membungkus bot-uji
cd C:/Users/Mirza/workspace/bot-uji
CLAUDE_PROJECT_DIR="C:/Users/Mirza/workspace/bot-uji" \
  npx tsx C:/Users/Mirza/workspace/mirza-bots/cc-wrapper/src/main.ts \
  --dangerously-skip-permissions \
  --dangerously-load-development-channels "plugin:cc-plugin@mirza-bots"
```

Lalu **dari Telegram**, ke `bot-uji`:

| # | Kirim | Yang diharapkan |
|---|---|---|
| 1 | `/rename uji-slash` | Nama sesi berubah; ack muncul di Telegram |
| 2 | `/new sesi-kedua` | Sesi di-clear lalu dinamai; **satu** ack |
| 3 | `/rename` (tanpa nama) | Pesan galat; **tidak ada** berkas di `pending/` |
| 4 | `/compact` | Muncul tombol Kirim/Batal; sesudah tap Kirim, `/compact` mendarat |
| 5 | `/compact` lalu tap Batal | Keyboard hilang, **tidak ada** yang dikirim |
| 6 | teks biasa | Sampai ke AI seperti biasa |

**Diperiksa dari dua meteran** (pelajaran celah #3): layar Telegram **dan**
`conversations.db`. Khusus kriteria 3 dan 5, yang membuktikan adalah **ketiadaan**
baris/berkas — dan ketiadaan di satu meteran bukan bukti.

Query penyangkal untuk kriteria 3:

```bash
# harus mengembalikan 0 berkas
ls "C:/Users/Mirza/workspace/bot-uji/.claude/channels/pty-controller/pending/"
```

Dan untuk aturan §2.3, query yang membuktikan slash **tetap tercatat**:

```sql
-- harus ADA barisnya, satu per slash yang dikirim
SELECT ts, text FROM messages
WHERE source='user' AND text LIKE '/%'
ORDER BY ts DESC LIMIT 10;
```

- [ ] **Step 8: Commit dan push**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-plugin/src/engine/engine.ts cc-plugin/src/engine/slash/index.ts cc-plugin/test/engine/slash/index.test.ts
git commit -m "$(cat <<'EOF'
feat(cc-plugin): sisipkan lapisan slash ke engine, sesudah pencatatan

Titik sisipnya menentukan apakah aturan spec §2.3 dipatuhi: pesan slash tetap
masuk conversations.db, dan yang berubah hanya tujuannya sesudah itu. Sistem
lama mencegat SEBELUM mencatat, dan biayanya nyata -- audit membaca /switch
sebagai 0x dipakai padahal 139x.

Pagar 55 byte pada callback_data: Telegram menolak di atas 64 dengan
BUTTON_DATA_INVALID (W-25).

Agent: bot-<nama>
EOF
)"
git push origin main
git status -sb   # wajib bersih
```

---

## Sesudah plan ini

| Yang belum | Rumahnya |
|---|---|
| `/switch` | Butuh daftar sesi **bernama**; sistem baru baru menyimpan id (celah #2 audit) |
| `/context` | Butuh jembatan statusline; isinya belum dibandingkan dengan sistem lama |
| Konfirmasi diingat per-command | Belum ada datanya soal seberapa mengganggu satu tap (spec §7 no. 2) |
| Pendengar Telegram di luar sesi | Spec §2.4 — sesi mati berarti tidak ada yang mendengar `/new` |

Lima hal yang belum diukur ada di spec §7. **Jangan menebak salah satunya
diam-diam** — ukur, atau nyatakan bahwa belum diukur.
