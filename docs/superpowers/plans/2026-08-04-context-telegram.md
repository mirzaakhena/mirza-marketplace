# `/context` Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/context` dari Telegram menjawab dengan statistik sesi Claude Code —
**tanpa menggusur statusline milik user.**

**Architecture:** Sebuah *bridge* menjadi `statusLine.command`, menangkap payload
yang dikirim Claude Code ke stdin, menulisnya ke
`~/.claude/mirza-bots/status/<bot>.json`, lalu **menjalankan statusline pendahulu
dan meneruskan tampilannya apa adanya**. `/context` dicegat lapisan slash, tidak
dikirim ke Claude Code, dan dijawab dari berkas tangkapan itu lewat perender
murni.

**Tech Stack:** TypeScript · Bun 1.3+ (`bun test`) · `cc-plugin` (paket tunggal) ·
tanpa dependency baru.

**Spec:** `docs/superpowers/specs/2026-08-04-context-telegram-design.md`

## Global Constraints

- **Syarat yang mengatasi segalanya (spec §1):** statusline user harus tetap
  hidup. Bila harus memilih, **`/context` yang mengalah**.
- **Bridge hanya boleh mengimpor `node:`** (spec §5.5). Ia proses tersendiri yang
  dijalankan Claude Code. Versi pertama `session-start.ts` mengimpor modul engine
  dan **tidak pernah menyala** sambil tetap terlihat terpasang.
- **`/context` TIDAK dikirim ke Claude Code** — dijawab dari data lokal (spec
  tahap 1 §4).
- **Modul murni dites tuntas; yang ber-I/O dibuat sekecil mungkin** — pola empat
  modul `slash/` tahap 1.
- **Menambah command ke daftar dikenal butuh DUA hal:** `KNOWN_COMMANDS`
  (`slash/classify.ts`) **dan** `COMMAND_DESCRIPTIONS` (`slash/menu.ts`). Ada test
  yang gagal kalau yang kedua lupa — itu disengaja.
- **Mutation check wajib** untuk tiap pagar: rusak kodenya, pastikan test
  **merah**, kembalikan. **Kembalikan dengan salinan (`cp`), JANGAN
  `git checkout <file>`** — itu mengembalikan ke HEAD dan menghapus pekerjaan
  yang belum di-commit.
- **Test dijalankan dari `cc-plugin/`:** `bun test`. Angka awal: **326 hijau**.
- Commit memakai trailer `Agent: <nama-bot>`. **Jangan `git add -A`.**

---

## File Structure

| Berkas | Tanggung jawab | Sifat |
|---|---|---|
| `src/engine/context/render.ts` | Payload tangkapan → teks balasan Telegram | **Murni** |
| `src/engine/context/chain.ts` | Menentukan statusline pendahulu dari dua lapisan settings | **Murni** |
| `src/engine/context/status-file.ts` | Baca/tulis berkas tangkapan | I/O tipis |
| `src/engine/context/install.ts` | Pasang bridge + verifikasi + rollback + tolak-kalau-ragu | I/O |
| `bin/statusline-bridge.ts` | Yang dijalankan Claude Code sebagai `statusLine.command` | I/O, hanya `node:` |
| `src/engine/paths.ts` | +`statusDir()`, `statusPath(bot)` | ada |
| `src/engine/slash/classify.ts` | +`/context` di `KNOWN_COMMANDS` | ada |
| `src/engine/slash/menu.ts` | +deskripsi `/context` | ada |
| `src/engine/slash/index.ts` | +`SlashOutcome` varian `local` | ada |
| `src/engine/engine.ts` | Menjawab `local` dengan hasil render | ada |

Test bercermin di `test/engine/context/*.test.ts`.

---

### Task 1: Perender murni

**Files:**
- Create: `src/engine/context/render.ts`
- Test: `test/engine/context/render.test.ts`
- Reference: `mirza-marketplace/plugins/telegram/context-renderer.ts` (170 baris,
  **nol `import`** — sumber salinan)

**Interfaces:**
- Consumes: —
- Produces: `renderContext(status: CapturedStatus, nowMs: number, opts?: { sessionName?: string | null }): string`
  dan `export type CapturedStatus = { captured_at_ms: number; payload: any }`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { renderContext } from "../../../src/engine/context/render";

const NOW = 1785784649346;

describe("renderContext", () => {
  test("menampilkan persen dan jumlah token context", () => {
    const out = renderContext(
      { captured_at_ms: NOW, payload: { context_window: { used_percentage: 9, total_input_tokens: 92323, context_window_size: 1000000 } } },
      NOW
    );
    expect(out).toContain("Context");
    expect(out).toContain("9%");
  });

  test("payload tanpa context_window tetap menghasilkan teks, bukan melempar", () => {
    const out = renderContext({ captured_at_ms: NOW, payload: {} }, NOW);
    expect(out).toContain("Context");
    expect(typeof out).toBe("string");
  });

  test("rate limit yang tidak ada DIHILANGKAN, bukan ditulis 0%", () => {
    const out = renderContext({ captured_at_ms: NOW, payload: {} }, NOW);
    expect(out).not.toContain("Rate Limit 5h");
  });

  test("nama sesi ikut tampil kalau diberikan", () => {
    const out = renderContext(
      { captured_at_ms: NOW, payload: { session_id: "65eb550e-31f4-41b9-80f9-e9402388c875" } },
      NOW,
      { sessionName: "task-uji" }
    );
    expect(out).toContain("task-uji");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/context/render.test.ts`
Expected: FAIL — `Cannot find module '../../../src/engine/context/render'`

- [ ] **Step 3: Write minimal implementation**

Salin isi `mirza-marketplace/plugins/telegram/context-renderer.ts` ke
`src/engine/context/render.ts`, lalu ubah tiga hal:
1. Ganti nama fungsi `renderContextReply` → `renderContext`.
2. Ganti nama tipe `LastStatus` → `CapturedStatus`, ekspor.
3. Hapus nilai default `nowMs: number = Date.now()` — jadikan **parameter wajib**.
   Alasannya: `Date.now()` di dalam modul murni membuat testnya bergantung jam
   dinding. Pemanggil yang menyediakannya.

Jangan tambahkan `import` apa pun. Berkas ini wajib tetap nol-import.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/context/render.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Pastikan berkas benar-benar murni**

Run: `cd cc-plugin && grep -c "^import" src/engine/context/render.ts`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add src/engine/context/render.ts test/engine/context/render.test.ts
git commit -m "feat(context): perender murni untuk balasan /context

Disalin dari plugins/telegram/context-renderer.ts yang sudah nol-import.
nowMs jadi parameter wajib supaya testnya tidak bergantung jam dinding.

Agent: <nama-bot>"
```

---

### Task 2: Lokasi berkas tangkapan

**Files:**
- Modify: `src/engine/paths.ts`
- Create: `src/engine/context/status-file.ts`
- Test: `test/engine/context/status-file.test.ts`

**Interfaces:**
- Consumes: `stateRoot()` dari `paths.ts`, `CapturedStatus` dari Task 1
- Produces: `statusDir(): string` · `statusPath(bot: string): string` ·
  `writeCapturedStatus(path: string, payload: unknown, nowMs: number): void` ·
  `readCapturedStatus(path: string): CapturedStatus | null`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCapturedStatus, readCapturedStatus } from "../../../src/engine/context/status-file";

const NOW = 1785784649346;

describe("status-file", () => {
  test("tulis lalu baca mengembalikan payload yang sama", () => {
    const dir = mkdtempSync(join(tmpdir(), "status-"));
    const p = join(dir, "bot-uji.json");
    writeCapturedStatus(p, { session_id: "abc" }, NOW);
    const got = readCapturedStatus(p);
    expect(got?.payload).toEqual({ session_id: "abc" });
    expect(got?.captured_at_ms).toBe(NOW);
  });

  test("berkas tidak ada -> null, bukan melempar", () => {
    const dir = mkdtempSync(join(tmpdir(), "status-"));
    expect(readCapturedStatus(join(dir, "hilang.json"))).toBeNull();
  });

  test("JSON rusak -> null, bukan melempar", () => {
    const dir = mkdtempSync(join(tmpdir(), "status-"));
    const p = join(dir, "rusak.json");
    writeFileSync(p, "{ bukan json");
    expect(readCapturedStatus(p)).toBeNull();
  });

  // Wrapper membaca folder dengan polling; berkas setengah tertulis akan
  // terbaca sebagai JSON rusak. Penulisan wajib atomik.
  test("tidak meninggalkan berkas .tmp sesudah selesai", () => {
    const dir = mkdtempSync(join(tmpdir(), "status-"));
    const p = join(dir, "bot-uji.json");
    writeCapturedStatus(p, { a: 1 }, NOW);
    const { readdirSync } = require("node:fs");
    expect(readdirSync(dir).filter((f: string) => f.includes(".tmp"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/context/status-file.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Write minimal implementation**

Tambahkan ke `src/engine/paths.ts` (sesudah `currentSessionPath`):

```ts
// Ditulis bridge statusline, dibaca engine saat menjawab /context. Terpusat
// seperti sessions/ -- bukan di dalam folder project, supaya "apa status bot X"
// satu kali listing, bukan menyusuri enam folder.
export function statusDir(): string {
  return join(stateRoot(), "status");
}

export function statusPath(bot: string): string {
  return join(statusDir(), `${bot}.json`);
}
```

Tambahkan `statusDir()` ke daftar di `ensureStateDirs()`.

Buat `src/engine/context/status-file.ts`:

```ts
/**
 * Berkas tangkapan statusline. Sengaja setipis mungkin: seluruh keputusan
 * bentuk balasan ada di render.ts yang murni.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CapturedStatus } from "./render";

export function writeCapturedStatus(path: string, payload: unknown, nowMs: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify({ captured_at_ms: nowMs, payload });
  // Atomik: pembaca tidak boleh pernah melihat berkas setengah tertulis.
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

export function readCapturedStatus(path: string): CapturedStatus | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CapturedStatus;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/context/status-file.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add src/engine/paths.ts src/engine/context/status-file.ts test/engine/context/status-file.test.ts
git commit -m "feat(context): berkas tangkapan terpusat di status/<bot>.json

Sejajar sessions/<bot>.id. Penulisan atomik karena pembacanya polling.
Baca yang gagal mengembalikan null, bukan melempar.

Agent: <nama-bot>"
```

---

### Task 3: Resolusi statusline pendahulu — PAGAR 1

**Files:**
- Create: `src/engine/context/chain.ts`
- Test: `test/engine/context/chain.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  `resolveChain(projectStatusLine: unknown, userStatusLine: unknown, bridgePath: string): ChainResult`
  dengan
  `type ChainResult = { kind: "none" } | { kind: "found"; command: string } | { kind: "already-bridge" }`

**Kenapa task ini ada:** ini akar bug sistem lama (spec §3.4a). Installer lama
hanya melihat lapisan project; statusline user ada di lapisan global.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { resolveChain } from "../../../src/engine/context/chain";

const BRIDGE = "bun run /plugins/cc-plugin/bin/statusline-bridge.ts";

describe("resolveChain", () => {
  // INI bug sistem lama, ditulis sebagai test lebih dulu.
  test("project kosong tapi user punya -> ambil punya USER", () => {
    expect(resolveChain(undefined, { type: "command", command: "sl.sh" }, BRIDGE))
      .toEqual({ kind: "found", command: "sl.sh" });
  });

  test("project menang atas user kalau dua-duanya ada", () => {
    expect(
      resolveChain({ command: "project.sh" }, { command: "user.sh" }, BRIDGE)
    ).toEqual({ kind: "found", command: "project.sh" });
  });

  test("dua-duanya kosong -> none", () => {
    expect(resolveChain(undefined, undefined, BRIDGE)).toEqual({ kind: "none" });
  });

  // Tanpa ini, memasang dua kali membuat bridge memanggil dirinya sendiri.
  test("yang terpasang sudah bridge -> already-bridge, bukan found", () => {
    expect(resolveChain({ command: BRIDGE }, { command: "user.sh" }, BRIDGE))
      .toEqual({ kind: "already-bridge" });
  });

  test("bentuk yang tidak masuk akal diperlakukan sebagai tidak ada", () => {
    expect(resolveChain({ command: 42 }, null, BRIDGE)).toEqual({ kind: "none" });
    expect(resolveChain("bukan objek", undefined, BRIDGE)).toEqual({ kind: "none" });
  });

  test("command kosong/spasi bukan pendahulu yang sah", () => {
    expect(resolveChain({ command: "   " }, undefined, BRIDGE)).toEqual({ kind: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/context/chain.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Menentukan statusline mana yang harus dipanggil bridge sesudah ia selesai
 * menangkap. Murni.
 *
 * Sistem lama gagal PERSIS di sini: ia hanya melihat lapisan project, padahal
 * statusline user tinggal di lapisan global. Hasilnya `null`, yang lalu ditulis
 * sebagai string kosong dan menggusur statusline user tanpa suara.
 *
 * Claude Code memberi project presedens atas user untuk key yang sama, jadi
 * urutan di sini bukan selera -- ia meniru resolusi CC.
 */
export type ChainResult =
  | { kind: "none" }
  | { kind: "found"; command: string }
  | { kind: "already-bridge" };

function commandOf(statusLine: unknown): string | null {
  if (typeof statusLine !== "object" || statusLine === null) return null;
  const c = (statusLine as { command?: unknown }).command;
  if (typeof c !== "string" || c.trim() === "") return null;
  return c;
}

export function resolveChain(
  projectStatusLine: unknown,
  userStatusLine: unknown,
  bridgePath: string
): ChainResult {
  const effective = commandOf(projectStatusLine) ?? commandOf(userStatusLine);
  if (effective === null) return { kind: "none" };
  if (effective === bridgePath) return { kind: "already-bridge" };
  return { kind: "found", command: effective };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/context/chain.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Mutation check — buktikan testnya bisa merah**

```bash
cp src/engine/context/chain.ts /tmp/chain.bak
```

Ubah `commandOf(projectStatusLine) ?? commandOf(userStatusLine)` menjadi
`commandOf(projectStatusLine)` saja — ini persis bug sistem lama.

Run: `cd cc-plugin && bun test test/engine/context/chain.test.ts`
Expected: **FAIL** pada test "project kosong tapi user punya".

Kembalikan: `cp /tmp/chain.bak src/engine/context/chain.ts`
**JANGAN `git checkout`** — Task 3 belum di-commit saat langkah ini berjalan.

Run lagi: Expected PASS (6 test).

- [ ] **Step 6: Commit**

```bash
git add src/engine/context/chain.ts test/engine/context/chain.test.ts
git commit -m "feat(context): resolusi statusline dua lapisan (pagar 1)

Project dulu lalu user, meniru presedens Claude Code. Sistem lama hanya
melihat project dan itu akar tergusurnya statusline user di 6 dari 6 bot.

Mutation check: mematikan lapisan user membuat test merah.

Agent: <nama-bot>"
```

---

### Task 4: Installer — PAGAR 2 dan PAGAR 3

**Files:**
- Create: `src/engine/context/install.ts`
- Test: `test/engine/context/install.test.ts`

**Interfaces:**
- Consumes: `resolveChain`, `ChainResult` (Task 3)
- Produces:
  `installBridge(deps: InstallDeps): InstallResult`
  dengan
  `type InstallDeps = { projectDir: string; userSettingsPath: string; bridgeCommand: string; chainPath: string }`
  dan
  `type InstallResult = { kind: "installed"; chained: string | null } | { kind: "already-installed" } | { kind: "refused"; reason: string } | { kind: "rolled-back"; reason: string }`

**Kenapa task ini ada:** spec §5.3 pagar 2 dan 3. Sistem lama membangun
chaining-nya tetapi tidak pernah **memeriksa** apakah niat itu tercapai.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBridge } from "../../../src/engine/context/install";

const BRIDGE = "bun run /plugins/cc-plugin/bin/statusline-bridge.ts";

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "install-"));
  const projectDir = join(root, "bot-uji");
  mkdirSync(join(projectDir, ".claude"), { recursive: true });
  return {
    projectDir,
    userSettingsPath: join(root, "user-settings.json"),
    bridgeCommand: BRIDGE,
    chainPath: join(root, "chain.txt"),
    projectSettings: join(projectDir, ".claude", "settings.json"),
  };
}

describe("installBridge", () => {
  // Skenario PERSIS yang menggusur statusline user di sistem lama.
  test("project belum punya settings, user punya statusline -> rantai terisi punya user", () => {
    const s = scratch();
    writeFileSync(s.userSettingsPath, JSON.stringify({ statusLine: { command: "sl.sh" } }));

    const r = installBridge(s);

    expect(r.kind).toBe("installed");
    expect(readFileSync(s.chainPath, "utf8")).toBe("sl.sh");
    expect(JSON.parse(readFileSync(s.projectSettings, "utf8")).statusLine.command).toBe(BRIDGE);
  });

  // PAGAR 3: tidak yakin -> tidak memasang. Lebih baik /context mati.
  test("user settings TIDAK BISA DIBACA -> refused, settings project tidak disentuh", () => {
    const s = scratch();
    writeFileSync(s.userSettingsPath, "{ rusak json");

    const r = installBridge(s);

    expect(r.kind).toBe("refused");
    expect(existsSync(s.projectSettings)).toBe(false);
  });

  test("setting lain di project settings tidak ikut hilang", () => {
    const s = scratch();
    writeFileSync(s.projectSettings, JSON.stringify({ env: { FOO: "bar" } }));
    writeFileSync(s.userSettingsPath, JSON.stringify({ statusLine: { command: "sl.sh" } }));

    installBridge(s);

    expect(JSON.parse(readFileSync(s.projectSettings, "utf8")).env).toEqual({ FOO: "bar" });
  });

  test("memasang dua kali -> already-installed, rantai tidak menunjuk bridge sendiri", () => {
    const s = scratch();
    writeFileSync(s.userSettingsPath, JSON.stringify({ statusLine: { command: "sl.sh" } }));
    installBridge(s);
    const r = installBridge(s);

    expect(r.kind).toBe("already-installed");
    expect(readFileSync(s.chainPath, "utf8")).toBe("sl.sh");
  });

  test("tidak ada statusline di mana pun -> tetap dipasang, rantai kosong", () => {
    const s = scratch();
    writeFileSync(s.userSettingsPath, JSON.stringify({}));

    const r = installBridge(s);

    expect(r).toEqual({ kind: "installed", chained: null });
  });

  // PAGAR 2: verifikasi SESUDAH menulis, lalu rollback.
  test("rantai gagal tersimpan -> rollback, settings project kembali seperti semula", () => {
    const s = scratch();
    writeFileSync(s.projectSettings, JSON.stringify({ env: { FOO: "bar" } }));
    writeFileSync(s.userSettingsPath, JSON.stringify({ statusLine: { command: "sl.sh" } }));
    const before = readFileSync(s.projectSettings, "utf8");

    // chainPath menunjuk folder yang tidak bisa ditulis: penulisan rantai gagal.
    const r = installBridge({ ...s, chainPath: join(s.projectDir, "tidak", "ada", "chain.txt") });

    expect(r.kind).toBe("rolled-back");
    expect(readFileSync(s.projectSettings, "utf8")).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/context/install.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Memasang bridge sebagai statusLine project -- atau MENOLAK memasangnya.
 *
 * Urutan pagarnya sengaja begini (spec §5.3):
 *   1. resolveChain melihat DUA lapisan (project lalu user)
 *   2. rantai ditulis dan DIBACA ULANG; gagal -> rollback
 *   3. ragu -> tidak memasang sama sekali
 *
 * Pagar 3 adalah pembalikan langsung terhadap sistem lama, yang memperlakukan
 * "aku tidak menemukannya" sebagai "memang tidak ada" lalu menulis string
 * kosong. Di sini: kalau tidak yakin, statusline user yang menang.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveChain } from "./chain";

export type InstallDeps = {
  projectDir: string;
  userSettingsPath: string;
  bridgeCommand: string;
  chainPath: string;
};

export type InstallResult =
  | { kind: "installed"; chained: string | null }
  | { kind: "already-installed" }
  | { kind: "refused"; reason: string }
  | { kind: "rolled-back"; reason: string };

type ReadResult = { ok: true; value: Record<string, unknown>; existed: boolean } | { ok: false };

function readSettings(path: string): ReadResult {
  if (!existsSync(path)) return { ok: true, value: {}, existed: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return { ok: false };
    return { ok: true, value: parsed as Record<string, unknown>, existed: true };
  } catch {
    return { ok: false };
  }
}

export function installBridge(deps: InstallDeps): InstallResult {
  const projectSettingsPath = join(deps.projectDir, ".claude", "settings.json");

  const project = readSettings(projectSettingsPath);
  const user = readSettings(deps.userSettingsPath);

  // PAGAR 3. Settings yang tidak terbaca berarti kita TIDAK TAHU apa yang
  // sedang terpasang -- dan memasang di atas ketidaktahuan persis yang
  // menggusur statusline user di sistem lama.
  if (!project.ok) return { kind: "refused", reason: `${projectSettingsPath} tidak bisa dibaca` };
  if (!user.ok) return { kind: "refused", reason: `${deps.userSettingsPath} tidak bisa dibaca` };

  const chain = resolveChain(project.value.statusLine, user.value.statusLine, deps.bridgeCommand);
  if (chain.kind === "already-bridge") return { kind: "already-installed" };

  const chained = chain.kind === "found" ? chain.command : null;
  const before = project.existed ? readFileSync(projectSettingsPath, "utf8") : null;

  try {
    mkdirSync(dirname(deps.chainPath), { recursive: true });
    writeFileSync(deps.chainPath, chained ?? "");

    // PAGAR 2: baca ULANG. Menulis tanpa memeriksa adalah niat, bukan jaminan.
    const written = readFileSync(deps.chainPath, "utf8");
    if (chained !== null && written !== chained) {
      throw new Error(`rantai tersimpan "${written}", seharusnya "${chained}"`);
    }
  } catch (err) {
    return { kind: "rolled-back", reason: `gagal menyimpan rantai: ${(err as Error).message}` };
  }

  try {
    mkdirSync(dirname(projectSettingsPath), { recursive: true });
    writeFileSync(
      projectSettingsPath,
      JSON.stringify({ ...project.value, statusLine: { type: "command", command: deps.bridgeCommand } }, null, 2) + "\n"
    );
  } catch (err) {
    // Rollback: kembalikan settings apa adanya.
    if (before !== null) writeFileSync(projectSettingsPath, before);
    else if (existsSync(projectSettingsPath)) rmSync(projectSettingsPath);
    return { kind: "rolled-back", reason: `gagal menulis settings: ${(err as Error).message}` };
  }

  return { kind: "installed", chained };
}
```

Catatan untuk implementer: test terakhir menuntut rollback saat **rantai** gagal
disimpan — dan pada saat itu `settings.json` project **belum** disentuh. Itu
disengaja: urutan "rantai dulu, settings belakangan" membuat kegagalan yang
paling mungkin terjadi tidak pernah meninggalkan sistem dalam keadaan setengah
jadi. Kalau urutannya dibalik, pagar 2 harus mengembalikan berkas yang sudah
tertulis — lebih banyak jalan untuk salah.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/context/install.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Mutation check — pagar 3**

```bash
cp src/engine/context/install.ts /tmp/install.bak
```

Ubah `if (!user.ok) return { kind: "refused", ... }` menjadi
`if (!user.ok) { user.value = {}; }` — yaitu "anggap saja tidak ada", persis
kesalahan sistem lama.

Run: `cd cc-plugin && bun test test/engine/context/install.test.ts`
Expected: **FAIL** pada test "user settings TIDAK BISA DIBACA".

Kembalikan: `cp /tmp/install.bak src/engine/context/install.ts` · Expected PASS.

- [ ] **Step 6: Mutation check — pagar 2**

```bash
cp src/engine/context/install.ts /tmp/install.bak
```

Hapus blok `const written = readFileSync(...)` beserta `throw`-nya.

Run: `cd cc-plugin && bun test test/engine/context/install.test.ts`
Expected: **FAIL** pada test rollback.

Kembalikan: `cp /tmp/install.bak src/engine/context/install.ts` · Expected PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/context/install.ts test/engine/context/install.test.ts
git commit -m "feat(context): installer dengan verifikasi dan penolakan (pagar 2+3)

Rantai ditulis lalu DIBACA ULANG; gagal berarti rollback. Settings yang tidak
terbaca berarti tidak tahu apa yang terpasang -- dan itu alasan untuk TIDAK
memasang, bukan untuk menganggapnya kosong.

Dua mutation check: mematikan pagar 3 dan pagar 2 masing-masing membuat merah.

Agent: <nama-bot>"
```

---

### Task 5: Bridge runtime

**Files:**
- Create: `bin/statusline-bridge.ts`
- Test: `test/engine/context/bridge.test.ts`

**Interfaces:**
- Consumes: `statusPath` (Task 2), `writeCapturedStatus` (Task 2)
- Produces: berkas eksekusi; tidak diimpor modul lain

**⚠️ Constraint:** hanya `import` dari `node:` **dan** dari modul `context/`
milik kita yang juga hanya memakai `node:`. Tidak boleh menyentuh
`engine.ts`, poller, database, atau lock — berkas ini dijalankan Claude Code
puluhan kali per menit.

- [ ] **Step 1: Write the failing test**

Yang diuji adalah bagian **murni**-nya: memilih bot dari config. Bagian yang
menjalankan proses anak diuji lewat uji hidup (Task 7), bukan unit test.

```ts
import { test, expect, describe } from "bun:test";
import { botForCwd } from "../../../src/engine/context/bot-for-cwd";

const CONFIG = {
  bots: {
    "bot-uji": { home: "C:\\Users\\Mirza\\workspace\\bot-uji" },
    "bot-02": { home: "C:/Users/Mirza/workspace/bot-02" },
  },
};

describe("botForCwd", () => {
  test("cocok walau pemisah path berbeda", () => {
    expect(botForCwd(CONFIG, "C:/Users/Mirza/workspace/bot-uji")).toBe("bot-uji");
  });

  test("cocok walau ada garis miring di ujung", () => {
    expect(botForCwd(CONFIG, "C:\\Users\\Mirza\\workspace\\bot-02\\")).toBe("bot-02");
  });

  // Folder yang bukan bot TIDAK boleh ditulis apa-apa -- dan statusline-nya
  // tetap diteruskan. Itu syarat spec §1 dipenuhi tanpa penanganan khusus.
  test("folder yang bukan bot -> null", () => {
    expect(botForCwd(CONFIG, "C:/Users/Mirza/workspace/lain")).toBeNull();
  });

  test("config tanpa bots -> null, bukan melempar", () => {
    expect(botForCwd({}, "C:/apa/saja")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/context/bridge.test.ts`
Expected: FAIL — modul belum ada

- [ ] **Step 3: Write minimal implementation**

Buat `src/engine/context/bot-for-cwd.ts` (murni):

```ts
/**
 * Bot mana yang rumahnya folder ini. Murni.
 *
 * Pola ini SUDAH ADA dan sudah terbukti di hooks/session-start.ts:96-99 --
 * disalin, bukan direka ulang, supaya keduanya tidak bisa berbeda pendapat
 * soal folder mana milik siapa.
 */
function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function botForCwd(config: unknown, cwd: string): string | null {
  const bots = (config as { bots?: unknown } | null)?.bots;
  if (typeof bots !== "object" || bots === null) return null;
  for (const [name, bot] of Object.entries(bots as Record<string, { home?: unknown }>)) {
    if (typeof bot?.home === "string" && normalize(bot.home) === normalize(cwd)) return name;
  }
  return null;
}
```

Buat `bin/statusline-bridge.ts`:

```ts
#!/usr/bin/env bun
/**
 * Dijalankan Claude Code sebagai `statusLine.command`.
 *
 * Dua tugas, dan urutannya penting: tangkap dulu, lalu TERUSKAN. Berkas ini
 * tidak pernah mencetak apa pun ke stdout sendiri -- yang user lihat di baris
 * status tetap statusline miliknya, byte per byte.
 *
 * Hanya boleh mengimpor node: dan modul context/ yang juga hanya node:. Versi
 * pertama session-start.ts mengimpor modul engine dan TIDAK PERNAH MENYALA
 * sambil tetap terlihat terpasang.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { botForCwd } from "../src/engine/context/bot-for-cwd";
import { writeCapturedStatus } from "../src/engine/context/status-file";

function stateRoot(): string {
  return process.env.MIRZA_BOTS_HOME ?? join(homedir(), ".claude", "mirza-bots");
}

const input = readFileSync(0, "utf8");

// Tangkap -- tapi hanya kalau folder ini memang punya bot.
try {
  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const configPath = join(stateRoot(), "config.json");
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const bot = botForCwd(config, cwd);
  if (bot !== null) {
    writeCapturedStatus(join(stateRoot(), "status", `${bot}.json`), JSON.parse(input), Date.now());
  }
} catch {
  // Menangkap adalah tugas KEDUA. Gagal menangkap tidak boleh membuat
  // statusline user ikut mati -- itu syarat spec §1.
}

// Teruskan. Ini tugas pertama, dan ia berjalan apa pun yang terjadi di atas.
const chainPath = join(stateRoot(), "status", "chained-statusline");
if (existsSync(chainPath)) {
  const chain = readFileSync(chainPath, "utf8").trim();
  if (chain) spawnSync(chain, { input, stdio: ["pipe", "inherit", "inherit"], shell: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/context/bridge.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Pastikan bridge tidak menyentuh engine**

Run: `cd cc-plugin && grep -E "^import" bin/statusline-bridge.ts`
Expected: hanya `node:*` dan dua modul `context/`. Tidak ada `engine`, `db`,
`poller`, `lock`, `grammy`.

- [ ] **Step 6: Commit**

```bash
git add bin/statusline-bridge.ts src/engine/context/bot-for-cwd.ts test/engine/context/bridge.test.ts
git commit -m "feat(context): bridge statusline yang meneruskan, bukan menggusur

Menangkap adalah tugas kedua: gagal menangkap tidak boleh mematikan statusline
user. Folder yang bukan bot tidak ditulis apa-apa dan tetap diteruskan.

botForCwd menyalin pola session-start.ts:96-99, bukan mereka ulang.

Agent: <nama-bot>"
```

---

### Task 6: Sambungkan `/context` ke lapisan slash

**Files:**
- Modify: `src/engine/slash/classify.ts:13`
- Modify: `src/engine/slash/menu.ts:20-23`
- Modify: `src/engine/slash/index.ts` (tambah varian `local`)
- Test: `test/engine/slash/classify.test.ts`, `test/engine/slash/index.test.ts`

**Interfaces:**
- Consumes: `classify` (ada), `SlashOutcome` (ada)
- Produces: `SlashOutcome` bertambah `| { kind: "local"; command: string }`

- [ ] **Step 1: Write the failing test**

Tambahkan ke `test/engine/slash/index.test.ts`:

```ts
test("/context TIDAK menulis pending -- ia dijawab dari data lokal", () => {
  const dir = mkdtempSync(join(tmpdir(), "slash-"));
  const out = handleSlash("/context", { projectDir: dir, newId: () => "id-1" });

  expect(out).toEqual({ kind: "local", command: "/context" });

  // Dua meteran: outcome-nya benar DAN tidak ada payload yang lahir.
  const pending = join(dir, ".claude", "channels", "pty-controller", "pending");
  expect(existsSync(pending) ? readdirSync(pending) : []).toHaveLength(0);
});
```

Tambahkan ke `test/engine/slash/classify.test.ts`:

```ts
test("/context dikenal", () => {
  expect(classify("/context")).toEqual({ kind: "known", name: "/context", arg: "" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/slash/`
Expected: FAIL — `/context` masih diklasifikasi `unknown`; dan test menu gagal
karena deskripsinya belum ada (pagar yang memang disengaja).

- [ ] **Step 3: Write minimal implementation**

`classify.ts:13`:

```ts
export const KNOWN_COMMANDS = ["/rename", "/new", "/context"] as const;
```

`menu.ts` — **wajib**, kalau lupa ada test yang gagal:

```ts
export const COMMAND_DESCRIPTIONS: Record<string, string> = {
  "/rename": "Ganti nama sesi yang sedang berjalan",
  "/new": "Mulai sesi baru dengan nama",
  "/context": "Lihat pemakaian context, rate limit, dan biaya sesi",
};
```

`index.ts` — tambahkan varian pada `SlashOutcome`:

```ts
  /** Dijawab dari data lokal; TIDAK dikirim ke Claude Code (spec tahap 1 §4). */
  | { kind: "local"; command: string }
```

dan di `handleSlash`, **sebelum** `const m = mapKnown(...)`:

```ts
  // /context tidak punya payload wrapper: ia tidak pernah sampai ke CC.
  // Menaruhnya sebelum mapKnown disengaja -- mapKnown menolak command tanpa
  // pemetaan, dan itu pagar yang harus tetap berlaku untuk yang lain.
  if (c.name === "/context") return { kind: "local", command: "/context" };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test`
Expected: PASS, seluruh suite. Angka naik dari 326.

- [ ] **Step 5: Sambungkan ke engine**

Di `src/engine/engine.ts`, pada tempat `SlashOutcome` ditangani, tambahkan
cabang `local`: baca `statusPath(bot)` lewat `readCapturedStatus`, lalu balas.

```ts
case "local": {
  const captured = readCapturedStatus(statusPath(bot));
  if (captured === null) {
    await reply(
      "Belum ada data statusline. Bridge sudah terpasang tapi Claude Code " +
      "belum sempat menggambar baris status -- pakai CC sebentar, lalu kirim /context lagi."
    );
    break;
  }
  await reply(renderContext(captured, Date.now(), { sessionName: currentSessionName }));
  break;
}
```

- [ ] **Step 6: Run full suite**

Run: `cd cc-plugin && bun test`
Expected: seluruhnya hijau.

- [ ] **Step 7: Commit**

```bash
git add src/engine/slash/classify.ts src/engine/slash/menu.ts src/engine/slash/index.ts src/engine/engine.ts test/engine/slash/
git commit -m "feat(context): /context masuk daftar dikenal dan dijawab lokal

Outcome baru 'local': dikenal, dicegat, tapi tidak pernah menghasilkan payload
wrapper. Ditaruh sebelum mapKnown supaya pagar 'dikenal tanpa pemetaan = bug'
tetap berlaku untuk command lain.

Agent: <nama-bot>"
```

---

### Task 7: Rilis, dokumentasi, dan uji hidup

**Files:**
- Modify: `cc-plugin/.claude-plugin/plugin.json` (versi)
- Modify: `cc-plugin/package.json` (versi)
- Modify: `mirza-bots/README.md`
- Create: `bot-uji/uji-context.bat` (tidak di-commit ke repo mana pun)

- [ ] **Step 1: Naikkan versi di DUA berkas**

`0.9.0` → `0.10.0`, di `.claude-plugin/plugin.json` **dan** `package.json`.
Kalau hanya satu yang naik, plugin tidak akan pernah dimuat ulang.

- [ ] **Step 2: Tulis README**

Tambahkan butir di `mirza-bots/README.md`, sejajar butir "Slash Telegram dicegat
SESUDAH dicatat": apa yang bridge lakukan, kenapa chaining wajib, dan bahwa
statusline user diteruskan apa adanya. Sebut juga bahwa `/context` **tidak**
dikirim ke CC.

- [ ] **Step 3: Commit + push kedua repo**

```bash
git add .claude-plugin/plugin.json package.json README.md
git commit -m "release(cc-plugin): 0.10.0 -- /context tanpa menggusur statusline

Agent: <nama-bot>"
git push origin main
```

`git status -sb` wajib tidak menunjukkan "ahead" sebelum meminta uji hidup.

- [ ] **Step 4: Siapkan `.bat` uji hidup**

Tiru `C:\Users\Mirza\workspace\bot-uji\uji-slash.bat`. Wajib memuat, berurutan:
1. `claude plugin marketplace update mirza-bots`
2. `claude plugin update cc-plugin@mirza-bots`
3. **Verifikasi** `cache/cc-plugin/0.10.0/bin/statusline-bridge.ts` benar-benar
   ada, dan **berhenti** kalau tidak. Teks yang menyebut nama sesuatu bukan bukti
   sesuatu itu ada.
4. Cetak enam kriteria uji ke layar.
5. Ingatkan: **restart wrapper** — versi plugin dikunci saat sesi dibuka.

- [ ] **Step 5: Uji hidup — enam kriteria (spec §8)**

Diperiksa dari meteran, bukan dari layar saja.

| # | Kriteria | Cara memeriksa |
|---|---|---|
| 1 | Statusline user tetap tampil utuh | Layar user **dan** `status/chained-statusline` **tidak kosong** |
| 2 | Berkas tangkapan terisi & diperbarui | `status/bot-uji.json` ada, `captured_at_ms` maju antar-pemeriksaan |
| 3 | `/context` membalas dengan angka benar | Bandingkan balasan dengan statusline di layar pada saat yang sama |
| 4 | `/context` tidak sampai ke AI | `conversations.db`: tidak ada baris `assistant` sesudahnya, sementara teks biasa tetap dijawab |
| 5 | Rollback bekerja | Sengaja gagalkan penulisan rantai; `settings.json` harus kembali seperti semula |
| 6 | Memasang dua kali tidak menumpuk | `chained-statusline` tidak pernah memuat path bridge itu sendiri |

**Kriteria 1 yang paling penting**, dan ia menuntut dua meteran karena yang
dibuktikan adalah sesuatu yang **tidak** rusak.

- [ ] **Step 6: Perbarui BACKLOG Bagian 0**

Blok "Kondisi sekarang" wajib diperbarui sebelum sesi berakhir: hasil uji hidup,
angka test, versi terpasang.

---

## Self-Review

**Spec coverage:**

| Spec | Task |
|---|---|
| §1 syarat statusline hidup | Task 3, 4, 5 (+kriteria 1 Task 7) |
| §2 push bukan pull → berkas tangkapan | Task 2, 5 |
| §3 akar bug dua lapisan | Task 3 (+mutation check) |
| §4 koreksi spec lama | sudah di dokumen, tidak butuh kode |
| §5.1 tiga bagian | Task 1 (perender), 4 (installer), 5 (penangkap) |
| §5.2 aliran | Task 5, 6 |
| §5.3 pagar 1-4 | Task 3 (p1), Task 4 (p2, p3), mutation check di Task 3+4 (p4) |
| §5.4 lokasi pemasangan | Task 4 |
| §5.5 lokasi berkas + identitas bot + hanya `node:` | Task 2, 5 |
| §8 enam kriteria uji hidup | Task 7 |

**Placeholder scan:** tidak ada TBD/TODO. Setiap langkah kode punya blok kode
utuh. Task 1 Step 3 menunjuk berkas sumber dengan path lengkap dan menyebut tiga
perubahan yang persis — bukan "sesuaikan seperlunya".

**Type consistency:** `CapturedStatus` didefinisikan Task 1 dan dipakai Task 2
dan 6. `ChainResult` didefinisikan Task 3 dan dipakai Task 4. `resolveChain`
dipanggil dengan tiga argumen di kedua tempat. `statusPath(bot)` dari Task 2
dipakai Task 6. `botForCwd` dari Task 5 tidak dipakai task lain.

**Satu ketidakpastian yang dinyatakan, bukan disembunyikan:** Task 6 Step 5
menyebut "pada tempat `SlashOutcome` ditangani" di `engine.ts` tanpa nomor baris,
karena penyisipan tahap 1 belum dibaca ulang di sesi ini. Implementer wajib
membaca `engine.ts` lebih dulu dan menyesuaikan — persis pelajaran tahap 1: baca
kode sebelum mengeksekusi rencana, meski rencananya sudah di-review user.
