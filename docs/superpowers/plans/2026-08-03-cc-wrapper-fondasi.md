# cc-wrapper — Fondasi (Lapis 1 + 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun paket `cc-wrapper` yang bisa menjalankan Claude Code di dalam PTY dan menyuntikkan slash CC apa pun yang bentuknya sah, satu per satu tanpa saling menimpa.

**Architecture:** Seluruh logika hidup di modul **murni** yang bisa diuji tanpa PTY (rencana pengetikan, antrean, registry command, parsing inbox). Hanya satu berkas tipis (`pty.ts`) yang menyentuh `node-pty`. Ini pola yang sudah terbukti di wrapper lama — `injection-gate.ts`, `batch.ts`, dan `session-state.ts` semuanya dipisah dari `wrapper.ts` dengan alasan yang sama: `wrapper.ts` men-spawn CC saat di-import, sehingga tidak bisa dimuat di dalam test.

**Tech Stack:** TypeScript · `node-pty` ^1.1.0 · test dengan `bun:test` · runtime produksi **ditentukan oleh Task 0**.

## Global Constraints

- **Repo kode:** `C:\Users\Mirza\workspace\mirza-bots`. Paket baru di `cc-wrapper/`, sejajar dengan `cc-plugin/`. Repo ini punya remote dan **wajib di-push**.
- **Spec acuan:** `mirza-marketplace/docs/superpowers/specs/2026-08-03-cc-wrapper-design.md`. Setiap keputusan desain di sana mengikat; kalau plan ini dan spec berbeda, spec yang benar.
- **Lingkup plan ini hanya Lapis 1 dan Lapis 2** dari spec §4. Lapis 3 (sumber bukti / hook CC) dan Lapis 4 (pelaporan lewat `system-outbox`) adalah plan terpisah dan **tidak** boleh dikerjakan di sini.
- **Tidak ada daftar putih command di dalam wrapper** (spec §2). Wrapper menerima slash CC apa pun yang bentuknya sah.
- **Struktur berkas mengikuti `cc-plugin`:** sumber di `src/`, test di `test/` dengan struktur cermin (`src/queue.ts` → `test/queue.test.ts`).
- **Bahasa komentar:** ikuti berkas sekitarnya. `cc-plugin` memakai campuran Inggris dan Indonesia; komentar baru boleh keduanya, tapi konsisten dalam satu berkas.
- **Commit trailer wajib:** `Agent: bot-<nama>` sebelum `Co-Authored-By:`. Jangan pernah mengubah `git config user.name`.
- **`git add <path>` eksplisit — JANGAN `git add -A`.** Repo ini punya berkas untracked milik sesi lain; `git add -A` pernah menyapu 106 berkas asing ke dalam satu commit.
- **Jangan menyunting berkas repo dengan PowerShell `Set-Content -Encoding utf8`** — di Windows PowerShell 5.1 ia menulis BOM dan merusak em-dash. Pakai tool editor, dan periksa `git diff --stat` sebelum commit: jumlah baris yang tidak masuk akal adalah alarm paling murah.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `cc-wrapper/package.json` | Manifest paket + skrip |
| `cc-wrapper/tsconfig.json` | Konfigurasi TypeScript |
| `cc-wrapper/src/identity.ts` | Nama paket — satu konstanta, dipakai test asap Task 1 |
| `cc-wrapper/src/typer.ts` | **Murni.** Mengubah satu perintah jadi *rencana tulisan* (urutan potongan + jeda). Tidak menulis apa pun sendiri |
| `cc-wrapper/src/queue.ts` | **Murni.** Antrean FIFO + gerbang jarak-minimum. Waktu selalu diserahkan dari luar |
| `cc-wrapper/src/registry.ts` | **Murni.** Data per-command (`confirmAfterMs`), plus default untuk command tak terdaftar |
| `cc-wrapper/src/inbox.ts` | **Murni.** Parsing & validasi payload berkas `pending/` (tunggal maupun batch) |
| `cc-wrapper/src/pty.ts` | **Satu-satunya** yang menyentuh `node-pty`. Sesipis mungkin |
| `cc-wrapper/src/main.ts` | Perakitan: spawn PTY, awasi `pending/`, jalankan antrean |
| `cc-wrapper/test/*.test.ts` | Cermin dari tiap modul murni |
| `cc-wrapper/PROBE.md` | Hasil Task 0 — catatan runtime yang terbukti bekerja |

**Kenapa `typer.ts` menghasilkan rencana, bukan menulis langsung:** supaya seluruh aturan pengetikan (jeda ketik→Enter, pemotongan teks panjang, Enter kedua untuk picker konfirmasi) bisa diuji sebagai data, tanpa PTY dan tanpa timer. `pty.ts` hanya menjalankan rencana itu.

---

### Task 0: Buktikan runtime dan `node-pty` — TANPA menulis kode produk

> ✅ **SELESAI 2026-08-03** — commit `c96a633` di `mirza-bots`. Hasil lengkap di
> `cc-wrapper/PROBE.md`. Ringkasnya:
>
> | Runtime | Spawn | `pty.write()` | `/clear` mendarat |
> |---|---|---|---|
> | Bun 1.3.11 | ✅ | ❌ `ERR_SOCKET_CLOSED` | — |
> | Node v22.20.0 + `tsx` | ✅ | ✅ | ✅ |
>
> **Keputusan: runtime produksi = Node + `tsx`. Test tetap `bun test`.**
>
> **Temuan di luar rencana yang mengubah Task 6:** sesi CC anak mewarisi
> `CLAUDE_CODE_CHILD_SESSION` lewat environment dan **tidak menyimpan
> transcript**. Karena Lapis 3 bergantung pada file sesi `.jsonl` sebagai
> sumber bukti, `spawnClaude` wajib membersihkan environment — sudah
> dimasukkan ke Task 6 Step 3.

Task ini sengaja tidak menghasilkan kode produk. Seluruh plan berdiri di atas asumsi bahwa `node-pty` bisa menjalankan Claude Code di mesin ini, dan **wrapper lama memakai `tsx` (Node), bukan Bun**, untuk `wrapper.ts` — sementara `cc-plugin` seluruhnya Bun. Perbedaan itu belum pernah diuji ulang, dan menebaknya akan menular ke setiap task berikutnya.

Preseden: rencana `2026-08-02-tahap25-keluar.md` Task 1 juga tidak menulis kode produk — ia membuktikan dulu apakah `SessionStart` menyala pada `/clear`, karena seluruh rencana berdiri di atas asumsi itu.

**Files:**
- Create: `cc-wrapper/probe/spawn-probe.ts`
- Create: `cc-wrapper/PROBE.md`

**Interfaces:**
- Consumes: —
- Produces: keputusan runtime (`bun` atau `node`+`tsx`) yang dipakai Task 1 untuk mengisi `package.json`.

- [ ] **Step 1: Buat folder paket dan pasang node-pty**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
mkdir cc-wrapper
cd cc-wrapper
bun init -y
bun add node-pty@^1.1.0
```

- [ ] **Step 2: Tulis probe**

Buat `cc-wrapper/probe/spawn-probe.ts`:

```typescript
/**
 * Probe, bukan kode produk: membuktikan node-pty bisa menghidupkan Claude Code
 * di mesin ini dan menerima satu slash command. Dibuang setelah Task 0 selesai
 * kalau tidak lagi berguna.
 */
import { spawn } from "node-pty";

const isWindows = process.platform === "win32";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
// Di Windows `claude` adalah shim .cmd yang butuh cmd.exe untuk diresolusi.
const shell = isWindows ? "cmd.exe" : CLAUDE_BIN;
const args = isWindows ? ["/c", CLAUDE_BIN] : [];

console.log(`[probe] runtime=${process.versions.bun ? "bun " + process.versions.bun : "node " + process.version}`);
console.log(`[probe] spawning ${shell} ${args.join(" ")}`);

let captured = "";
const pty = spawn(shell, args, {
  name: "xterm-256color",
  cols: 100,
  rows: 30,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
});

pty.onData((d) => {
  captured += d;
  process.stdout.write(d);
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  await sleep(8000); // beri CC waktu boot dan mencapai prompt kosong
  console.log("\n[probe] >>> menulis '/clear' lalu (250ms) Enter");
  pty.write("/clear");
  await sleep(250);
  pty.write("\r");
  await sleep(5000);
  console.log(`\n[probe] captured ${captured.length} bytes`);
  console.log(`[probe] '/clear' terlihat di output: ${captured.includes("/clear") ? "YA" : "TIDAK"}`);
  pty.kill();
}

main().catch((err) => {
  console.error("[probe] error:", err);
  pty.kill();
  process.exit(1);
});
```

- [ ] **Step 3: Jalankan probe di Bun, catat hasilnya**

Run: `cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper && bun run probe/spawn-probe.ts`

Yang dicatat apa adanya, bukan kesimpulannya: apakah proses berhasil spawn, berapa byte tertangkap, apakah `/clear` terlihat, dan **teks galat lengkap** kalau gagal (`node-pty` adalah native module — kegagalan biasanya muncul saat memuat binding, bukan saat spawn).

- [ ] **Step 4: Jalankan probe di Node lewat tsx, catat hasilnya**

```bash
cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper
bun add -d tsx
npx tsx probe/spawn-probe.ts
```

- [ ] **Step 5: Tulis PROBE.md**

Isi `cc-wrapper/PROBE.md` dengan tabel hasil: kolom runtime, spawn berhasil?, byte tertangkap, `/clear` terlihat?, galat. Lalu satu baris keputusan: **runtime produksi yang dipakai adalah X, karena Y.**

Kalau **keduanya** bekerja, pilih **Bun** — konsisten dengan `cc-plugin`, satu runtime untuk seluruh repo. Kalau hanya Node yang bekerja, catat itu sebagai kendala nyata dan lanjutkan; jangan memaksakan Bun.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-wrapper/probe/spawn-probe.ts cc-wrapper/PROBE.md cc-wrapper/package.json cc-wrapper/bun.lock
git commit -m "$(cat <<'EOF'
probe(cc-wrapper): buktikan node-pty + runtime sebelum menulis kode produk

Task 0 sengaja tidak menulis kode produk. Wrapper lama memakai tsx (Node)
sementara cc-plugin seluruhnya Bun; perbedaan itu belum pernah diuji ulang.

Agent: bot-<nama>
EOF
)"
```

---

### Task 1: Kerangka paket

**Files:**
- Modify: `cc-wrapper/package.json`
- Create: `cc-wrapper/tsconfig.json`
- Create: `cc-wrapper/test/smoke.test.ts`

**Interfaces:**
- Consumes: keputusan runtime dari `PROBE.md` (Task 0).
- Produces: perintah `bun test` yang berjalan di dalam `cc-wrapper/`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/smoke.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { PACKAGE_NAME } from "../src/identity";

test("paket punya identitas", () => {
  expect(PACKAGE_NAME).toBe("cc-wrapper");
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper && bun test`
Expected: FAIL — `Cannot find module '../src/identity'`

- [ ] **Step 3: Implementasi minimal**

Buat `cc-wrapper/src/identity.ts`:

```typescript
export const PACKAGE_NAME = "cc-wrapper";
```

Isi `cc-wrapper/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun", "node"]
  },
  "include": ["src", "test", "probe"]
}
```

Pastikan `cc-wrapper/package.json` memuat `"type": "module"` dan skrip `"test": "bun test"`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add cc-wrapper/package.json cc-wrapper/tsconfig.json cc-wrapper/src/identity.ts cc-wrapper/test/smoke.test.ts
git commit -m "feat(cc-wrapper): kerangka paket + test berjalan

Agent: bot-<nama>"
```

---

### Task 2: `typer.ts` — rencana pengetikan sebagai data

Ini inti Lapis 1 spec §4.1. Tiga aturan mekanik yang **sama untuk semua command** dikumpulkan jadi satu fungsi murni yang menghasilkan rencana, bukan efek.

**Files:**
- Create: `cc-wrapper/src/typer.ts`
- Create: `cc-wrapper/test/typer.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type WriteStep = { text: string; delayAfterMs: number }`
  - `function planCommand(command: string, opts?: { confirmAfterMs?: number }): WriteStep[]`
  - `function chunkText(text: string, size?: number): string[]`
  - konstanta `SUBMIT_DELAY_MS`, `CHUNK_SIZE`, `CHUNK_DELAY_MS`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/typer.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { planCommand, chunkText, SUBMIT_DELAY_MS } from "../src/typer";

describe("chunkText", () => {
  test("teks pendek jadi satu potong", () => {
    expect(chunkText("halo", 100)).toEqual(["halo"]);
  });

  test("teks panjang dipotong sesuai ukuran", () => {
    const text = "a".repeat(250);
    const parts = chunkText(text, 100);
    expect(parts.length).toBe(3);
    expect(parts.join("")).toBe(text);
  });

  // Pemotongan pada code point, bukan UTF-16: satu emoji di batas potongan
  // tidak boleh terbelah jadi surrogate pair yang rusak.
  test("emoji tidak terbelah di batas potongan", () => {
    const text = "ab🎉cd";
    const parts = chunkText(text, 3);
    expect(parts.join("")).toBe(text);
    expect(parts[0]).toBe("ab🎉");
  });
});

describe("planCommand", () => {
  test("command biasa: ketik, jeda, Enter", () => {
    const steps = planCommand("/compact");
    expect(steps).toEqual([
      { text: "/compact", delayAfterMs: SUBMIT_DELAY_MS },
      { text: "\r", delayAfterMs: 0 },
    ]);
  });

  test("confirmAfterMs menambah Enter kedua", () => {
    const steps = planCommand("/effort high", { confirmAfterMs: 500 });
    expect(steps).toEqual([
      { text: "/effort high", delayAfterMs: SUBMIT_DELAY_MS },
      { text: "\r", delayAfterMs: 500 },
      { text: "\r", delayAfterMs: 0 },
    ]);
  });

  test("command panjang dipotong sebelum Enter", () => {
    const long = "/rename " + "x".repeat(150);
    const steps = planCommand(long);
    // 158 karakter -> 2 potong, lalu Enter
    expect(steps.length).toBe(3);
    expect(steps[steps.length - 1]!.text).toBe("\r");
    expect(steps.slice(0, -1).map((s) => s.text).join("")).toBe(long);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/typer.test.ts`
Expected: FAIL — `Cannot find module '../src/typer'`

- [ ] **Step 3: Implementasi**

Buat `cc-wrapper/src/typer.ts`:

```typescript
/**
 * Mengubah satu perintah jadi RENCANA tulisan — urutan potongan teks dan jeda
 * sesudahnya. Tidak menulis apa pun sendiri.
 *
 * Dipisah dari PTY supaya seluruh aturan pengetikan bisa diuji sebagai data,
 * tanpa terminal dan tanpa timer. `pty.ts` hanya menjalankan rencana ini.
 */

/**
 * Jeda antara menulis teks perintah dan Enter penutupnya.
 *
 * Menulis `teks + \r` sebagai SATU tulisan membuat picker autocomplete CC
 * menelan Enter-nya (untuk command bernamespace seperti /telegram:foo, picker
 * bertahan sampai input "mengendap"). Dua tulisan terpisah meniru jeda manusia
 * antara mengetik dan menekan Enter, sehingga CC memperlakukan \r sebagai
 * "submit", bukan "pilih dari picker". Angka empiris dari wrapper lama.
 */
export const SUBMIT_DELAY_MS = 250;

/**
 * Satu tulisan panjang ke ConPTY membuat buffer input meluap: aliran membuang
 * karakter TERTUA dan menyisakan yang terbaru, jadi pesan panjang tiba
 * terpotong hanya ekornya. Menulis potongan kecil dengan jeda memberi TUI
 * kesempatan mengosongkan buffer. Angka empiris dari wrapper lama.
 */
export const CHUNK_SIZE = 100;
export const CHUNK_DELAY_MS = 30;

export type WriteStep = {
  /** Teks yang ditulis ke PTY apa adanya. */
  text: string;
  /** Berapa lama menunggu SESUDAH menulis potongan ini. */
  delayAfterMs: number;
};

/**
 * Potong pada code point (Array.from), bukan unit UTF-16, supaya batas potongan
 * tidak pernah membelah surrogate pair — pesan di sini memuat emoji, dan
 * surrogate yang terbelah merusak aliran. join("") selalu menyusun ulang input.
 */
export function chunkText(text: string, size: number = CHUNK_SIZE): string[] {
  const cps = Array.from(text);
  const out: string[] = [];
  for (let i = 0; i < cps.length; i += size) out.push(cps.slice(i, i + size).join(""));
  return out.length > 0 ? out : [""];
}

/**
 * Rencana untuk satu slash command.
 *
 * `confirmAfterMs` mengirim Enter KEDUA setelah jeda itu — untuk command yang
 * memunculkan picker konfirmasi dengan pilihan "Yes" sudah tersorot (/effort).
 * Tanpa Enter kedua, picker menggantung.
 */
export function planCommand(
  command: string,
  opts?: { confirmAfterMs?: number }
): WriteStep[] {
  const parts = chunkText(command);
  const steps: WriteStep[] = parts.map((text, i) => ({
    text,
    delayAfterMs: i === parts.length - 1 ? SUBMIT_DELAY_MS : CHUNK_DELAY_MS,
  }));

  const confirm = opts?.confirmAfterMs;
  if (confirm !== undefined && confirm > 0) {
    steps.push({ text: "\r", delayAfterMs: confirm });
    steps.push({ text: "\r", delayAfterMs: 0 });
  } else {
    steps.push({ text: "\r", delayAfterMs: 0 });
  }
  return steps;
}

/** Total waktu rencana ini, dipakai antrean untuk menahan gerbang. */
export function planDurationMs(steps: WriteStep[]): number {
  return steps.reduce((sum, s) => sum + s.delayAfterMs, 0);
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/typer.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add cc-wrapper/src/typer.ts cc-wrapper/test/typer.test.ts
git commit -m "feat(cc-wrapper): typer — rencana pengetikan sebagai data

Tiga aturan mekanik yang sama untuk semua command (jeda ketik->Enter,
pemotongan teks panjang, Enter kedua untuk picker konfirmasi) dikumpulkan
jadi satu fungsi murni yang menghasilkan rencana, bukan efek.

Agent: bot-<nama>"
```

---

### Task 3: `queue.ts` — antrean yang menjaga urutan

Spec §4.1.1: jarak antar-injeksi bukan jarak antar-*command* melainkan antar-**pengirim**, dan tidak satu pun pengirim tahu yang lain ada. Karena itu serialisasi dipegang wrapper.

**Files:**
- Create: `cc-wrapper/src/queue.ts`
- Create: `cc-wrapper/test/queue.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `class InjectionQueue` dengan `enqueue(item: QueueItem): void`, `enqueueBatch(batchId: string, items: Array<Omit<QueueItem, "batchId" | "lastOfBatch">>): void`, `next(now: number): QueueItem | null`, `markDispatched(durationMs: number, now: number): void`, `size(): number`
  - `type QueueItem = { command: string; confirmAfterMs?: number; batchId?: string; lastOfBatch?: boolean }`
  - konstanta `MIN_INJECTION_GAP_MS`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/queue.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { InjectionQueue, MIN_INJECTION_GAP_MS } from "../src/queue";

describe("InjectionQueue", () => {
  test("antrean kosong tidak mengembalikan apa-apa", () => {
    const q = new InjectionQueue();
    expect(q.next(1000)).toBe(null);
  });

  test("item pertama boleh langsung jalan", () => {
    const q = new InjectionQueue();
    q.enqueue({ command: "/compact" });
    expect(q.next(1000)?.command).toBe("/compact");
  });

  test("item kedua ditahan sampai jarak minimum lewat", () => {
    const q = new InjectionQueue();
    q.enqueue({ command: "/a" });
    q.enqueue({ command: "/b" });
    const first = q.next(1000);
    expect(first?.command).toBe("/a");
    q.markDispatched(500, 1000); // rencana makan 500ms, dikirim pada t=1000

    // Belum boleh: 1000 + 500 + gap belum lewat.
    expect(q.next(1200)).toBe(null);
    expect(q.next(1000 + 500 + MIN_INJECTION_GAP_MS - 1)).toBe(null);
    // Tepat setelah jendela lewat, giliran /b.
    expect(q.next(1000 + 500 + MIN_INJECTION_GAP_MS)?.command).toBe("/b");
  });

  test("urutan FIFO dipertahankan", () => {
    const q = new InjectionQueue();
    q.enqueue({ command: "/1" });
    q.enqueue({ command: "/2" });
    q.enqueue({ command: "/3" });
    expect(q.size()).toBe(3);
    expect(q.next(0)?.command).toBe("/1");
    q.markDispatched(0, 0);
    expect(q.next(MIN_INJECTION_GAP_MS)?.command).toBe("/2");
  });

  // Batch dienqueue berdampingan: tidak ada payload asing boleh menyelip di
  // antara item-itemnya (spec 4.2.1).
  test("batch masuk berdampingan meski ada enqueue lain di antaranya", () => {
    const q = new InjectionQueue();
    q.enqueue({ command: "/x" });
    q.enqueueBatch("b1", [{ command: "/clear" }, { command: "/rename baru" }]);
    q.enqueue({ command: "/y" });

    const order: string[] = [];
    let now = 0;
    for (let i = 0; i < 4; i++) {
      const item = q.next(now);
      expect(item).not.toBe(null);
      order.push(item!.command);
      q.markDispatched(0, now);
      now += MIN_INJECTION_GAP_MS;
    }
    expect(order).toEqual(["/x", "/clear", "/rename baru", "/y"]);
  });

  test("item terakhir batch ditandai", () => {
    const q = new InjectionQueue();
    q.enqueueBatch("b1", [{ command: "/a" }, { command: "/b" }]);
    const first = q.next(0);
    expect(first?.lastOfBatch).toBe(false);
    q.markDispatched(0, 0);
    const second = q.next(MIN_INJECTION_GAP_MS);
    expect(second?.lastOfBatch).toBe(true);
    expect(second?.batchId).toBe("b1");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/queue.test.ts`
Expected: FAIL — `Cannot find module '../src/queue'`

- [ ] **Step 3: Implementasi**

Buat `cc-wrapper/src/queue.ts`:

```typescript
/**
 * Antrean FIFO + gerbang jarak-minimum. Murni: waktu SELALU diserahkan dari
 * luar (`now`), sehingga logikanya bisa diuji tanpa timer.
 *
 * Kenapa serialisasi dipegang di sini dan bukan diserahkan ke pemanggil:
 * jaraknya bukan jarak antar-COMMAND melainkan antar-PENGIRIM. Telegram,
 * agent-bus, dan AI-nya sendiri bisa memerintah bersamaan dan tidak satu pun
 * dari mereka tahu yang lain ada — dua pemanggil yang sama-sama sopan tetap
 * bertabrakan karena masing-masing hanya menghitung dirinya sendiri.
 *
 * Wrapper lama membayar pelajaran ini dengan tiga korban nyata (BUG #3,
 * 2026-06-07): `/rename idle` tertelan, satu `/clear` hilang seluruhnya, dan
 * satu prompt handoff dimakan.
 */

/** Waktu tenang minimum sesudah setiap injeksi sebelum yang berikutnya boleh mulai. */
export const MIN_INJECTION_GAP_MS = 1_500;

export type QueueItem = {
  command: string;
  confirmAfterMs?: number;
  /** Diisi hanya untuk item yang berasal dari sebuah batch. */
  batchId?: string;
  /** True pada item terakhir sebuah batch. */
  lastOfBatch?: boolean;
};

export class InjectionQueue {
  private items: QueueItem[] = [];
  private holdUntil = 0;

  /** Satu perintah lepas. */
  enqueue(item: QueueItem): void {
    this.items.push({ ...item, lastOfBatch: false });
  }

  /**
   * Sekumpulan perintah berurutan, dimasukkan BERDAMPINGAN sehingga tidak ada
   * payload asing bisa menyelip di antaranya.
   */
  enqueueBatch(batchId: string, items: Array<Omit<QueueItem, "batchId" | "lastOfBatch">>): void {
    items.forEach((it, i) => {
      this.items.push({ ...it, batchId, lastOfBatch: i === items.length - 1 });
    });
  }

  size(): number {
    return this.items.length;
  }

  /**
   * Item berikutnya yang boleh dikirim sekarang, atau null kalau antrean kosong
   * ATAU gerbang masih menahan. Memanggil ini MENGELUARKAN item dari antrean —
   * pemanggil wajib menyusulkan `markDispatched`.
   */
  next(now: number): QueueItem | null {
    if (this.items.length === 0) return null;
    if (now < this.holdUntil) return null;
    return this.items.shift() ?? null;
  }

  /**
   * Catat bahwa sebuah item sudah dikirim: tahan gerbang selama durasi
   * rencananya ditambah jarak minimum.
   */
  markDispatched(durationMs: number, now: number): void {
    this.holdUntil = Math.max(this.holdUntil, now + durationMs + MIN_INJECTION_GAP_MS);
  }
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/queue.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add cc-wrapper/src/queue.ts cc-wrapper/test/queue.test.ts
git commit -m "feat(cc-wrapper): antrean injeksi dengan gerbang jarak-minimum

Serialisasi dipegang wrapper karena jaraknya antar-PENGIRIM, bukan
antar-command; tidak satu pun pengirim tahu yang lain ada.

Agent: bot-<nama>"
```

---

### Task 4: `registry.ts` — data per-command, default polos

Spec §4.2: bentuk data, bukan class hierarchy. Command yang tidak terdaftar diketik lalu Enter, tanpa menunggu apa pun.

`preCheck`/`postCheck` **belum** diisi di plan ini — keduanya butuh sumber bukti (Lapis 3), yang ada di plan berikutnya. Bidangnya sudah disediakan supaya plan berikutnya menambah data, bukan membongkar bentuk.

**Files:**
- Create: `cc-wrapper/src/registry.ts`
- Create: `cc-wrapper/test/registry.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type CommandSpec = { confirmAfterMs?: number }`
  - `function specFor(command: string): CommandSpec`
  - `const COMMAND_SPECS: Record<string, CommandSpec>`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/registry.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { specFor, COMMAND_SPECS } from "../src/registry";

describe("specFor", () => {
  test("command tak terdaftar dapat spec kosong", () => {
    expect(specFor("/compact")).toEqual({});
    expect(specFor("/model opus")).toEqual({});
  });

  test("/effort dapat confirmAfterMs", () => {
    expect(specFor("/effort high").confirmAfterMs).toBe(500);
  });

  test("pencocokan hanya pada kata perintah, argumen diabaikan", () => {
    expect(specFor("/effort").confirmAfterMs).toBe(500);
    expect(specFor("/effort   low").confirmAfterMs).toBe(500);
  });

  test("pencocokan tidak peduli huruf besar-kecil", () => {
    expect(specFor("/EFFORT high").confirmAfterMs).toBe(500);
  });

  // Jebakan yang sama pernah ada di slash-guards lama: /effortless bukan /effort.
  test("command berawalan sama tidak ikut cocok", () => {
    expect(specFor("/effortless")).toEqual({});
  });

  test("registry hanya memuat command yang benar-benar butuh perlakuan", () => {
    expect(Object.keys(COMMAND_SPECS)).toEqual(["/effort"]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/registry.test.ts`
Expected: FAIL — `Cannot find module '../src/registry'`

- [ ] **Step 3: Implementasi**

Buat `cc-wrapper/src/registry.ts`:

```typescript
/**
 * Perlakuan khusus per-command, berbentuk DATA.
 *
 * Bentuk data dan bukan class hierarchy karena mayoritas slash CC tidak
 * mengubah keadaan sesi sama sekali, jadi tidak punya apa pun untuk ditunggu.
 * Hierarchy akan memaksa struktur ke 100% command padahal yang membutuhkannya
 * sedikit; dengan data, menambah command berarti menambah satu baris.
 *
 * DEFAULT: tidak terdaftar -> ketik + Enter, selesai.
 *
 * Bidang `preCheck`/`postCheck` sengaja BELUM ada di sini: keduanya butuh
 * sumber bukti (hook CC), yang datang di rencana berikutnya. Menambahkannya
 * nanti berarti menambah bidang, bukan membongkar bentuk.
 */
export type CommandSpec = {
  /**
   * Kirim Enter KEDUA setelah jeda ini. Untuk command yang memunculkan picker
   * konfirmasi dengan "Yes" sudah tersorot; tanpa Enter kedua picker
   * menggantung.
   */
  confirmAfterMs?: number;
};

export const COMMAND_SPECS: Record<string, CommandSpec> = {
  "/effort": { confirmAfterMs: 500 },
};

const EMPTY: CommandSpec = {};

/**
 * Cocokkan pada KATA perintahnya saja; argumen diabaikan, dan `/effortless`
 * tidak boleh ikut cocok dengan `/effort` — jebakan yang sama sudah pernah
 * dijaga eksplisit di slash-guards lama.
 */
export function specFor(command: string): CommandSpec {
  const word = command.trim().split(/\s/, 1)[0]?.toLowerCase() ?? "";
  return COMMAND_SPECS[word] ?? EMPTY;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/registry.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add cc-wrapper/src/registry.ts cc-wrapper/test/registry.test.ts
git commit -m "feat(cc-wrapper): registry command berbentuk data, default polos

Command tak terdaftar diketik lalu Enter tanpa menunggu apa pun. Hanya
/effort yang butuh perlakuan, dan perlakuannya satu bidang data.

Agent: bot-<nama>"
```

---

### Task 5: `inbox.ts` — membaca payload `pending/`

Wrapper menerima perintah lewat berkas JSON di folder `pending/`. Bentuknya mengikuti wrapper lama supaya penulis yang sudah ada (plugin, agent-bus) tidak perlu diubah: akar objek = satu perintah, akar array = batch.

**Files:**
- Create: `cc-wrapper/src/inbox.ts`
- Create: `cc-wrapper/test/inbox.test.ts`

**Interfaces:**
- Consumes: `QueueItem` dari `src/queue.ts`.
- Produces:
  - `type ParsedPayload = { kind: "single"; item: QueueItem } | { kind: "batch"; items: QueueItem[] } | { kind: "invalid"; error: string }`
  - `function parsePayload(raw: string): ParsedPayload`
  - `const MAX_BATCH_ITEMS = 8`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/inbox.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { parsePayload, MAX_BATCH_ITEMS } from "../src/inbox";

describe("parsePayload", () => {
  test("objek tunggal jadi satu item", () => {
    const r = parsePayload(JSON.stringify({ command: "/compact" }));
    expect(r.kind).toBe("single");
    if (r.kind === "single") expect(r.item.command).toBe("/compact");
  });

  test("array jadi batch", () => {
    const r = parsePayload(JSON.stringify([{ command: "/clear" }, { command: "/rename x" }]));
    expect(r.kind).toBe("batch");
    if (r.kind === "batch") {
      expect(r.items.length).toBe(2);
      expect(r.items[1]!.command).toBe("/rename x");
    }
  });

  test("JSON rusak ditolak dengan alasan", () => {
    const r = parsePayload("{bukan json");
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.error).toContain("JSON");
  });

  test("command tanpa garis miring ditolak", () => {
    const r = parsePayload(JSON.stringify({ command: "compact" }));
    expect(r.kind).toBe("invalid");
  });

  test("batch kosong ditolak", () => {
    expect(parsePayload("[]").kind).toBe("invalid");
  });

  test("batch kepanjangan ditolak", () => {
    const items = Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => ({ command: "/a" }));
    const r = parsePayload(JSON.stringify(items));
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.error).toContain("terlalu panjang");
  });

  test("confirmAfterMs ikut terbawa", () => {
    const r = parsePayload(JSON.stringify({ command: "/effort high", confirmAfterMs: 500 }));
    if (r.kind === "single") expect(r.item.confirmAfterMs).toBe(500);
  });

  test("confirmAfterMs negatif ditolak", () => {
    const r = parsePayload(JSON.stringify({ command: "/a", confirmAfterMs: -1 }));
    expect(r.kind).toBe("invalid");
  });

  // BOM di depan berkas: sudah pernah menggigit proyek ini (W-7, W-11).
  test("BOM di depan tidak merusak parsing", () => {
    const r = parsePayload("\uFEFF" + JSON.stringify({ command: "/compact" }));
    expect(r.kind).toBe("single");
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/inbox.test.ts`
Expected: FAIL — `Cannot find module '../src/inbox'`

- [ ] **Step 3: Implementasi**

Buat `cc-wrapper/src/inbox.ts`:

```typescript
/**
 * Membaca isi satu berkas `pending/`. Murni: menerima teks, mengembalikan
 * keputusan. Tidak menyentuh disk.
 *
 * Bentuk payload mengikuti wrapper lama supaya penulis yang sudah ada (plugin
 * telegram, agent-bus) tidak perlu diubah:
 *   akar OBJEK -> satu perintah
 *   akar ARRAY -> batch, dienqueue berdampingan
 */
import type { QueueItem } from "./queue";

export const MAX_BATCH_ITEMS = 8;

export type ParsedPayload =
  | { kind: "single"; item: QueueItem }
  | { kind: "batch"; items: QueueItem[] }
  | { kind: "invalid"; error: string };

function toItem(value: unknown, index: number | null): QueueItem | string {
  const where = index === null ? "payload" : `item ${index}`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return `${where} harus objek`;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.command !== "string" || !o.command.startsWith("/")) {
    return `${where} tidak memuat slash command`;
  }
  const item: QueueItem = { command: o.command };
  if (o.confirmAfterMs !== undefined) {
    if (typeof o.confirmAfterMs !== "number" || o.confirmAfterMs < 0) {
      return `${where}: confirmAfterMs harus angka >= 0`;
    }
    item.confirmAfterMs = o.confirmAfterMs;
  }
  return item;
}

export function parsePayload(raw: string): ParsedPayload {
  let parsed: unknown;
  try {
    // Buang BOM: berkas ber-BOM sudah pernah menggigit proyek ini dua kali.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { kind: "invalid", error: `JSON tidak bisa dibaca: ${err}` };
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return { kind: "invalid", error: "batch kosong" };
    if (parsed.length > MAX_BATCH_ITEMS) {
      return {
        kind: "invalid",
        error: `batch terlalu panjang (${parsed.length} item, maksimum ${MAX_BATCH_ITEMS})`,
      };
    }
    const items: QueueItem[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const r = toItem(parsed[i], i);
      if (typeof r === "string") return { kind: "invalid", error: r };
      items.push(r);
    }
    return { kind: "batch", items };
  }

  const r = toItem(parsed, null);
  if (typeof r === "string") return { kind: "invalid", error: r };
  return { kind: "single", item: r };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/inbox.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add cc-wrapper/src/inbox.ts cc-wrapper/test/inbox.test.ts
git commit -m "feat(cc-wrapper): parsing payload pending/ (tunggal + batch)

Bentuk payload mengikuti wrapper lama supaya penulis yang sudah ada tidak
perlu diubah. BOM dibuang di depan -- sudah dua kali menggigit proyek ini.

Agent: bot-<nama>"
```

---

### Task 6: `pty.ts` + `main.ts` — merakit dan membuktikan hidup

Lapisan tipis yang menyentuh `node-pty`, plus perakitan. Ini satu-satunya task yang tidak sepenuhnya bisa diuji unit — karena itu ia diakhiri dengan uji hidup, bukan dengan test hijau saja.

**Files:**
- Create: `cc-wrapper/src/pty.ts`
- Create: `cc-wrapper/src/main.ts`
- Create: `cc-wrapper/test/pty.test.ts`

**Interfaces:**
- Consumes: `planCommand`, `planDurationMs`, `WriteStep` (Task 2); `InjectionQueue`, `QueueItem` (Task 3); `specFor` (Task 4); `parsePayload` (Task 5).
- Produces: `function runPlan(write: (s: string) => void, steps: WriteStep[], sleep: (ms: number) => Promise<void>): Promise<void>`; `function childEnv(base?: NodeJS.ProcessEnv): Record<string, string>`; `function spawnClaude(opts?): IPty`; berkas executable `main.ts`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-wrapper/test/pty.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { runPlan } from "../src/pty";
import { planCommand, SUBMIT_DELAY_MS } from "../src/typer";

describe("runPlan", () => {
  test("menulis tiap potongan berurutan dan menunggu sesuai rencana", async () => {
    const written: string[] = [];
    const slept: number[] = [];
    await runPlan(
      (s) => { written.push(s); },
      planCommand("/compact"),
      async (ms) => { slept.push(ms); }
    );
    expect(written).toEqual(["/compact", "\r"]);
    expect(slept).toEqual([SUBMIT_DELAY_MS, 0]);
  });

  test("Enter kedua ikut tertulis untuk command berkonfirmasi", async () => {
    const written: string[] = [];
    await runPlan(
      (s) => { written.push(s); },
      planCommand("/effort high", { confirmAfterMs: 500 }),
      async () => {}
    );
    expect(written).toEqual(["/effort high", "\r", "\r"]);
  });
});

describe("childEnv", () => {
  // Task 0: sesi anak yang mewarisi penanda ini TIDAK menyimpan transcript,
  // dan transcript adalah sumber bukti untuk post-check di Lapis 3.
  test("membuang CLAUDE_CODE_CHILD_SESSION", () => {
    const env = childEnv({ PATH: "/bin", CLAUDE_CODE_CHILD_SESSION: "1" });
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });

  test("membuang nilai undefined", () => {
    const env = childEnv({ A: "1", B: undefined });
    expect(env).toEqual({ A: "1" });
  });
});
```

Tambahkan `childEnv` ke baris import di berkas test ini:
`import { runPlan, childEnv } from "../src/pty";`

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `bun test test/pty.test.ts`
Expected: FAIL — `Cannot find module '../src/pty'`

- [ ] **Step 3: Implementasi `pty.ts`**

Buat `cc-wrapper/src/pty.ts`:

```typescript
/**
 * Satu-satunya berkas yang menyentuh terminal. Sengaja setipis mungkin: apa
 pun yang bisa diputuskan tanpa terminal sudah diputuskan di modul murni.
 */
import { spawn, type IPty } from "node-pty";
import type { WriteStep } from "./typer";

/**
 * Jalankan sebuah rencana pengetikan. `write` dan `sleep` diserahkan dari luar
 * supaya fungsinya bisa diuji tanpa PTY dan tanpa timer sungguhan.
 */
export async function runPlan(
  write: (s: string) => void,
  steps: WriteStep[],
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  for (const step of steps) {
    write(step.text);
    await sleep(step.delayAfterMs);
  }
}

/**
 * Environment untuk sesi CC anak.
 *
 * `CLAUDE_CODE_CHILD_SESSION` HARUS dibuang. Task 0 menemukan bahwa sesi anak
 * mewarisinya dan akibatnya MEMATIKAN penyimpanan transcript -- padahal file
 * sesi .jsonl adalah salah satu sumber bukti yang dipakai post-check. Wrapper
 * yang dijalankan dari dalam sesi CC lain akan diam-diam kehilangan seluruh
 * mekanisme post-check-nya. Lihat cc-wrapper/PROBE.md.
 */
export function childEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (k === "CLAUDE_CODE_CHILD_SESSION") continue;
    if (v !== undefined) env[k] = v;
  }
  return env;
}

/**
 * Hidupkan Claude Code di dalam PTY.
 *
 * Di Windows `claude` adalah shim .cmd yang butuh cmd.exe untuk diresolusi.
 * ConPTY biasanya menyerahkannya ke shell sendiri, tapi menyebutkannya
 * eksplisit lebih bisa diandalkan.
 */
export function spawnClaude(opts?: { cwd?: string; cols?: number; rows?: number }): IPty {
  const isWindows = process.platform === "win32";
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const shell = isWindows ? "cmd.exe" : bin;
  const args = isWindows ? ["/c", bin] : [];
  return spawn(shell, args, {
    name: "xterm-256color",
    cols: opts?.cols ?? process.stdout.columns ?? 100,
    rows: opts?.rows ?? process.stdout.rows ?? 30,
    cwd: opts?.cwd ?? process.cwd(),
    env: childEnv(),
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `bun test test/pty.test.ts`
Expected: PASS, 4 test.

- [ ] **Step 5: Implementasi `main.ts`**

Buat `cc-wrapper/src/main.ts`:

```typescript
/**
 * Perakitan: hidupkan CC di PTY, pipe dua arah dengan terminal pengguna, awasi
 * folder `pending/`, dan jalankan antrean.
 *
 * Folder state mengikuti pola wrapper lama supaya penulis yang sudah ada tetap
 * bekerja: <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/pending/
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnClaude, runPlan, sleep } from "./pty";
import { InjectionQueue } from "./queue";
import { planCommand, planDurationMs } from "./typer";
import { specFor } from "./registry";
import { parsePayload } from "./inbox";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const STATE_DIR = join(PROJECT_DIR, ".claude", "channels", "pty-controller");
const PENDING_DIR = join(STATE_DIR, "pending");
const QUEUE_POLL_MS = 200;
const INBOX_POLL_MS = 500;

mkdirSync(PENDING_DIR, { recursive: true });

const queue = new InjectionQueue();
const pty = spawnClaude({ cwd: PROJECT_DIR });

// PTY -> terminal pengguna, dan stdin pengguna -> PTY. Tanpa ini wrapper tidak
// terasa seperti menjalankan `claude` biasa, dan itu syarat paling dasar.
pty.onData((d) => process.stdout.write(d));
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on("data", (chunk) => pty.write(chunk.toString("utf8")));
process.stdout.on("resize", () =>
  pty.resize(process.stdout.columns || 100, process.stdout.rows || 30)
);

// Baca folder pending. Polling, bukan fs.watch: liputan event "create" milik
// fs.watch di Windows secara historis tidak bisa diandalkan, dan jalur ini
// harus andal.
setInterval(() => {
  let files: string[];
  try {
    files = readdirSync(PENDING_DIR);
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.endsWith(".json") || f.includes(".tmp.")) continue;
    const path = join(PENDING_DIR, f);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue; // tick lain sudah mengambilnya
    }
    // Hapus lebih dulu supaya crash di tengah penanganan tidak memproses ganda.
    try { rmSync(path); } catch {}

    const parsed = parsePayload(raw);
    if (parsed.kind === "invalid") {
      console.error(`[cc-wrapper] payload ditolak (${f}): ${parsed.error}`);
      continue;
    }
    if (parsed.kind === "single") {
      queue.enqueue(parsed.item);
    } else {
      queue.enqueueBatch(randomUUID(), parsed.items);
    }
  }
}, INBOX_POLL_MS);

// Kuras antrean.
let dispatching = false;
setInterval(() => {
  if (dispatching) return;
  const now = Date.now();
  const item = queue.next(now);
  if (!item) return;

  dispatching = true;
  const spec = specFor(item.command);
  const steps = planCommand(item.command, {
    confirmAfterMs: item.confirmAfterMs ?? spec.confirmAfterMs,
  });
  queue.markDispatched(planDurationMs(steps), now);
  void runPlan((s) => pty.write(s), steps, sleep).finally(() => {
    dispatching = false;
  });
}, QUEUE_POLL_MS);

pty.onExit(({ exitCode }) => {
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
  process.exit(exitCode ?? 0);
});
```

- [ ] **Step 6: Jalankan seluruh test**

Run: `cd C:/Users/Mirza/workspace/mirza-bots/cc-wrapper && bun test`
Expected: PASS, 32 test (typer 6 + queue 6 + registry 6 + inbox 9 + pty 4 + asap 1).

- [ ] **Step 7: Uji hidup — dan ini yang menentukan, bukan test hijau**

Test unit membuktikan rencananya benar. Yang belum terbukti: apakah CC sungguhan menerima ketikannya. Jalankan wrapper di sebuah folder bot uji, lalu **dari terminal lain** jatuhkan berkas ke `pending/`:

```bash
# Terminal 1 — Node + tsx, BUKAN bun (keputusan Task 0)
cd C:/Users/Mirza/workspace/bot-uji
CLAUDE_PROJECT_DIR="C:/Users/Mirza/workspace/bot-uji" npx tsx C:/Users/Mirza/workspace/mirza-bots/cc-wrapper/src/main.ts

# Terminal 2 — perintah tunggal
echo '{"command":"/compact"}' > "C:/Users/Mirza/workspace/bot-uji/.claude/channels/pty-controller/pending/uji1.json"

# Terminal 2 — batch (urutannya harus utuh, tidak boleh ada yang menyelip)
echo '[{"command":"/clear"},{"command":"/rename uji-wrapper"}]' > "C:/Users/Mirza/workspace/bot-uji/.claude/channels/pty-controller/pending/uji2.json"
```

Empat kriteria, dan **catat hasil apa adanya, bukan kesimpulannya**:

1. Wrapper terasa seperti `claude` biasa — ketikan tangan tetap jalan, layar terender normal.
2. `/compact` tunggal mendarat di CC.
3. Batch mendarat **berurutan**, dan tidak ada payload lain menyelip di antaranya.
4. Berkas `pending/` terhapus sesudah diambil.
5. **Peringatan `⚠ Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker` TIDAK muncul.** Task 0 menemukan peringatan itu pada sesi anak yang mewarisi environment; `childEnv()` seharusnya menutupnya. Jangan diasumsikan — dilihat sendiri. Kalau masih muncul, cari variabel `CLAUDE_CODE_*` lain yang ikut terwaris; PROBE.md mencatat bahwa yang lain **belum diukur**.

**Kriteria 3 kemungkinan besar GAGAL untuk `/clear` diikuti `/rename`, dan itu hasil yang benar** — `/clear` melahirkan sesi baru, dan tanpa bukti bahwa sesi itu sudah ada, `/rename` bisa mendarat terlalu cepat (spec §4.2.2). Itu persis lubang yang ditutup Lapis 3. Catat gejalanya; jangan menambal dengan jeda tetap.

- [ ] **Step 8: Commit dan push**

```bash
cd C:/Users/Mirza/workspace/mirza-bots
git add cc-wrapper/src/pty.ts cc-wrapper/src/main.ts cc-wrapper/test/pty.test.ts
git commit -m "$(cat <<'EOF'
feat(cc-wrapper): rakit PTY + antrean, uji hidup fondasi

Lapisan yang menyentuh node-pty dibuat setipis mungkin: seluruh keputusan
sudah diambil di modul murni. Yang tersisa di sini cuma menjalankan rencana.

Agent: bot-<nama>
EOF
)"
git push origin main
git status -sb   # wajib bersih, tidak boleh "ahead"
```

---

## Sesudah plan ini

Lubang yang **sengaja** ditinggalkan, dan rumahnya:

| Lubang | Rumahnya |
|---|---|
| `/clear` → `/rename` bisa terlalu cepat (kriteria 3 Task 6) | Plan Lapis 3 — `postCheck` berbukti lewat hook CC |
| Wrapper tidak bisa melaporkan kegagalan | Plan Lapis 4 — `system-outbox` |
| Tidak ada bukti proses lama sudah mati saat restart | Plan Lapis 3 — spec §3.4, dan angkanya **belum diukur** |
| `POST_INJECTION_DELAY_MS` lama yang melayani dua maksud, harus dipisah jadi dua | Plan Lapis 3 — konstanta itu milik rantai post-`/clear`, yang belum ada di sini (spec §4.1.2) |
| Daftar command yang boleh | Lapisan atas — bukan wrapper (spec §2) |

Lima hal yang belum diukur ada di spec §6. **Jangan menebak salah satunya diam-diam** — ukur, atau nyatakan bahwa belum diukur.
