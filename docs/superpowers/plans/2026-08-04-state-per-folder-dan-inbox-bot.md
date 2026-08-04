# State Per-Folder Bot + Jalur Antar-Bot lewat `inbox/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **(A)** Seluruh state satu bot hidup di **folder bot itu sendiri**;
`~/.claude/mirza-bots/` hilang. **(B)** Bot berbicara ke bot lain dengan menulis
berkas ke `../<nama-bot>/inbox/` — tanpa registry, tanpa daemon, tanpa
menyentuh Telegram.

**Architecture:** `paths.ts` berhenti menjadi penunjuk *state root* dan menjadi
**modul murni** yang menerima `botHome` dan mengembalikan path di dalamnya.
Identitas bot berhenti dicocokkan ke daftar `config.bots` dan menjadi **nama
folder**; sebuah folder adalah bot bila ia memuat `config.json`. Di atas
struktur itu, `inbox/` menjadi kotak surat antar-bot yang dipindai engine
dengan polling — pola yang sudah berjalan di `cc-wrapper` untuk `pending/`.

**Tech Stack:** TypeScript · Bun 1.3+ (`bun test`) · `cc-plugin` (paket tunggal) ·
`zod` (sudah ada) · tanpa dependency baru.

**Dokumen keputusan (sumber, bukan hiasan):**
- `docs/2026-08-04-state-per-folder-bot.md` — Bagian 4 = daftar berkas tersentuh;
  Bagian 5 = keberatan yang **sudah gugur, jangan diangkat ulang**.
- `docs/2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md` — Bagian 4 = apa
  yang user **TOLAK** berikut alasannya.

---

## Global Constraints

- **Kriteria yang membingkai segalanya (keputusan user):** *"instalasi serta
  struktur yang mudah dipelajari orang lain."* Sesuatu mudah dipelajari kalau
  orang bisa **menebak di mana barangnya** tanpa membaca dokumen. Bila dua
  rancangan sama benarnya, menangkan yang bisa ditebak.
- **JANGAN sentuh state produksi.** `~/.claude/mirza-bots/`,
  `workspace/mirza_01_bot/`, dan config bot mana pun **tidak boleh disentuh**.
  Skrip migrasi ditulis, **tidak dijalankan**. Bukan sekali pun, bukan
  "cuma dry-run di produksi".
- **JANGAN me-restart sesi user** (W-18).
- **Merge ke `main` boleh tanpa uji hidup** — kode yang mendarat tidak aktif
  sampai plugin di-update + wrapper di-restart, dan itu tangan user.
- **Kalau ada yang tidak bisa diputuskan tanpa menebak: BERHENTI dan CATAT** di
  bagian "Yang berhenti dan dicatat" di bawah. Jangan pilih asal.
- **Hook dan bridge hanya boleh mengimpor `node:`** dan modul yang juga hanya
  memakai `node:`. Versi pertama `session-start.ts` mengimpor modul engine dan
  **tidak pernah menyala** sambil tetap terlihat terpasang.
- **Mutation check wajib untuk tiap pagar**, dan — pelajaran Tingkat 10 —
  **sesudah memasang mutasi, assert dulu bahwa setiap potongannya benar-benar
  ada di berkas** sebelum membaca hasil test. Dua kali hari ini mutation check
  hijau ternyata mutasinya tidak terpasang (CRLF membuat replace gagal; lalu
  hanya 1 dari 3 potongan terpasang). Kembalikan dengan **salinan (`cp`)**,
  JANGAN `git checkout <file>`.
- **JANGAN sunting kode dengan skrip berbasis heuristik baris.** Pakai `Edit`
  yang presisi. Dua kali skrip semacam itu memakan lebih dari yang diminta.
- **Test dijalankan dari `cc-plugin/`:** `bun test`. **Angka awal: 396 hijau,
  0 fail, 780 `expect()`, 42 berkas.** `bun test` **tidak memeriksa tipe** —
  jalankan juga `bunx tsc --noEmit -p ../cc-wrapper/tsconfig.json`-gaya
  pemeriksaan ad-hoc atas `cc-plugin` sebelum merge.
- **Worktree baru butuh `bun install` sendiri**, kalau tidak suite merah dengan
  "Cannot find module" yang terlihat seperti kerusakan kode.
- Commit memakai trailer `Agent: bot-02`. **Jangan `git add -A`.**
- Repo kode: `mirza-bots`. Repo dokumen: `mirza-marketplace`. **Keduanya punya
  remote dan wajib di-push.**

---

## Keputusan yang dikunci rencana ini (dan kenapa)

Enam pertanyaan yang harus dijawab sebelum baris kode pertama. Semuanya
**diturunkan dari keputusan user yang sudah ada**, bukan ditebak. Ditulis di
sini supaya sesi berikutnya bisa membantahnya dengan alasan, bukan menemukannya
kembali.

### K-1. Pengganti `MIRZA_BOTS_HOME` untuk test: **tidak ada, dan itu jawabannya**

`MIRZA_BOTS_HOME` ada untuk memindahkan *state root*. Tidak ada lagi state root,
jadi tidak ada yang perlu dipindahkan. Gantinya: **setiap fungsi path menerima
`botHome` sebagai argumen** dan tidak membaca env apa pun. Test cukup
melewatkan `mkdtempSync(...)`.

Ini lebih baik daripada mengganti nama env var-nya: fungsi murni tidak punya
global state yang harus dibersihkan di `afterEach`, tidak bisa bocor antar-test,
dan `test/engine/doctor.test.ts` + `engine.test.ts` + `session-file.test.ts` +
`paths.test.ts` berhenti bergantung pada urutan `delete process.env`.

Satu-satunya tempat yang benar-benar butuh env: **menentukan folder bot di
produksi**. Itu satu fungsi murni, `resolveBotHome(env, cwd)`, yang env-nya
dilewatkan pemanggil — jadi ia pun bisa diuji tanpa menyentuh `process.env`.

### K-2. Nama bot = **basename folder**

Konsekuensi langsung dari "alamat bot lain = folder tetangga". Kalau nama bot
bukan nama folder, maka `../<nama-bot>/inbox/` butuh terjemahan — dan
terjemahan butuh daftar, dan daftar itu persis yang user tolak.

Efek samping yang diinginkan: **memindahkan bot = rename folder.** Itu alasan
yang tertulis untuk membalik keputusan state terpusat.

### K-3. Sebuah folder adalah bot bila ia memuat `config.json`

Sudah tertulis di dokumen keputusan Bagian 2 ("Validasi ikut gratis"). Dipakai
di dua tempat: identitas diri sendiri (engine, hook, bridge) dan validasi tujuan
(`agent_send` ke folder yang bukan bot → ditolak, bukan hilang tanpa jejak).

### K-4. `chained-statusline` ikut pindah ke folder bot

Tidak disebut eksplisit di dokumen keputusan, tapi ia **state**, dan keputusannya
berbunyi *"seluruh state pindah ke folder masing-masing bot, tidak ada yang
bersama"*. Ia juga sudah berpasangan satu-satu dengan `status.json`, yang jelas
pindah. Letaknya: `<botHome>/chained-statusline`.

### K-5. Kolom `bot` di tabel `messages`: **dibiarkan; yang dibuang filternya**

Dokumen mencatat ini "belum diputuskan" antara dibiarkan atau dibuang. Rencana
ini mengambil yang **reversibel**: kolomnya tetap ditulis (jejak, nol risiko,
tidak menyentuh FTS5 maupun index), tetapi **filter `WHERE bot = ?` dibuang dari
`getMessagesAround` dan `searchMessages`**.

Alasannya bukan kerapian — filter itu **berbahaya** sesudah (A): database ini
sekarang milik satu bot, jadi filternya tidak menyaring apa pun; tapi begitu
folder di-rename (yaitu cara resmi memindahkan bot, lihat K-2), baris lama
membawa nama lama dan filternya mulai **membuang riwayat secara diam-diam**.
Membuang kolomnya tetap keputusan user, dan tetap terbuka.

### K-6. `logs/` tetap folder, bukan berkas datar

Bentuk yang tergambar di dokumen keputusan Bagian 2 dan di prompt handoff
menuliskan `logs/` dengan garis miring, sementara `session.id`, `status.json`,
`bot.pid` ditulis sebagai berkas. Ikuti gambar itu apa adanya:
`<botHome>/logs/session-hook.log`.

---

## File Structure

### Fase A — state per-folder

| Berkas | Tanggung jawab | Sifat |
|---|---|---|
| `src/engine/paths.ts` | **Ditulis ulang.** `botHome` → path di dalamnya | **Murni** (+1 fungsi I/O) |
| `src/engine/config.ts` | `config.json` **satu** bot: `token` + `allowFrom` + `timezone?` | I/O tipis |
| `src/engine/identity.ts` | "Folder ini bot atau bukan", + kalimat yang mengajari | **Murni** |
| `src/engine/db/conversations-schema.ts` | Buang filter `bot` dari dua query | ada |
| `src/engine/messages.ts` | `resolveOwnBot` hilang; history/search tanpa config | ada |
| `src/engine/doctor.ts` | Melaporkan **satu** bot | ada |
| `src/engine/types.ts` | `DoctorReport` satu bot | ada |
| `src/engine/session-file.ts` | Baca `<botHome>/session.id` | ada |
| `src/engine/telegram/poller.ts` | `deps.inboxRoot` → `deps.dataDir` | ada |
| `src/engine/engine.ts` | Dirakit ulang di atas `botHome` | ada |
| `hooks/session-start.ts` | Tulis `session.id` + log di folder bot | I/O, hanya `node:` |
| `bin/statusline-bridge.ts` | Tulis `status.json` + baca rantai di folder bot | I/O, hanya `node:` |
| `bin/doctor.ts` | Ambil `botHome` dari env/cwd | ada |
| ~~`src/engine/context/bot-for-cwd.ts`~~ | **Dihapus** — tidak ada lagi daftar untuk dicari | — |
| `scripts/migrate-per-folder.ts` | Migrasi state lama → folder bot. **TIDAK dijalankan** | I/O, `--apply` |

### Fase B — jalur antar-bot

| Berkas | Tanggung jawab | Sifat |
|---|---|---|
| `src/engine/agent/payload.ts` | Bentuk pesan + validasi kirim + parse terima | **Murni** |
| `src/engine/agent/peers.ts` | Daftar bot = isi folder induk; alamat tetangga | I/O tipis |
| `src/engine/agent/send.ts` | Tulis `<uuid>.json` tmp+rename ke `inbox/` tujuan | I/O tipis |
| `src/engine/agent/receive.ts` | Pindai `inbox/` sendiri, ubah jadi `PushMessage` | I/O tipis |
| `src/engine/sink.ts` | `PushMessage` membawa `meta.origin` | ada |
| `src/server.ts` | Penanda turn dipilih dari `meta.origin`; tool `agent_send`/`agent_list` | ada |
| `hooks/reply-guard.ts` | Pesan antar-bot **bukan** inbound Telegram | ada, hanya `node:` |
| `src/engine/engine.ts` | Menyalakan pemindai `inbox/` | ada |

Test bercermin di `test/engine/**` dan `test/hooks/**`.

---

# FASE A — State per-folder bot

### Task A1: `paths.ts` murni, berpangkal pada folder bot

**Files:**
- Rewrite: `cc-plugin/src/engine/paths.ts`
- Rewrite: `cc-plugin/test/engine/paths.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  ```ts
  export function resolveBotHome(env: { CLAUDE_PROJECT_DIR?: string | undefined }, cwd: string): string
  export function botNameFrom(botHome: string): string
  export function configPathIn(botHome: string): string
  export function conversationsDbPathIn(botHome: string): string
  export function sessionIdPathIn(botHome: string): string
  export function statusPathIn(botHome: string): string
  export function chainedStatuslinePathIn(botHome: string): string
  export function botPidPathIn(botHome: string): string
  export function dataDirIn(botHome: string): string
  export function inboxDirIn(botHome: string): string
  export function logsDirIn(botHome: string): string
  export function ensureBotDirs(botHome: string): void
  ```

- [ ] **Step 1: Write the failing test**

Ganti seluruh isi `test/engine/paths.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveBotHome,
  botNameFrom,
  configPathIn,
  conversationsDbPathIn,
  sessionIdPathIn,
  statusPathIn,
  chainedStatuslinePathIn,
  botPidPathIn,
  dataDirIn,
  inboxDirIn,
  logsDirIn,
  ensureBotDirs,
} from "../../src/engine/paths";

const HOME = join("C:", "Users", "Mirza", "workspace", "mirza_01_bot");

describe("resolveBotHome", () => {
  test("memakai CLAUDE_PROJECT_DIR bila ada", () => {
    expect(resolveBotHome({ CLAUDE_PROJECT_DIR: HOME }, "C:\\lain")).toBe(HOME);
  });

  test("jatuh ke cwd bila env kosong", () => {
    expect(resolveBotHome({}, HOME)).toBe(HOME);
    expect(resolveBotHome({ CLAUDE_PROJECT_DIR: "   " }, HOME)).toBe(HOME);
  });
});

describe("botNameFrom", () => {
  test("nama bot adalah nama folder", () => {
    expect(botNameFrom(HOME)).toBe("mirza_01_bot");
  });

  test("separator dan trailing slash tidak mengubah nama", () => {
    expect(botNameFrom("C:/Users/Mirza/workspace/bot-02/")).toBe("bot-02");
    expect(botNameFrom("C:\\Users\\Mirza\\workspace\\bot-02\\")).toBe("bot-02");
  });
});

describe("path di dalam folder bot", () => {
  test("semuanya berpangkal pada folder bot, tanpa state root", () => {
    expect(configPathIn(HOME)).toBe(join(HOME, "config.json"));
    expect(conversationsDbPathIn(HOME)).toBe(join(HOME, "conversations.db"));
    expect(sessionIdPathIn(HOME)).toBe(join(HOME, "session.id"));
    expect(statusPathIn(HOME)).toBe(join(HOME, "status.json"));
    expect(chainedStatuslinePathIn(HOME)).toBe(join(HOME, "chained-statusline"));
    expect(botPidPathIn(HOME)).toBe(join(HOME, "bot.pid"));
    expect(dataDirIn(HOME)).toBe(join(HOME, "data"));
    expect(inboxDirIn(HOME)).toBe(join(HOME, "inbox"));
    expect(logsDirIn(HOME)).toBe(join(HOME, "logs"));
  });

  // Pagar terhadap kembalinya state terpusat lewat pintu belakang.
  test("tidak satu pun path menyeberang keluar dari folder bot", () => {
    for (const p of [
      configPathIn(HOME),
      conversationsDbPathIn(HOME),
      sessionIdPathIn(HOME),
      statusPathIn(HOME),
      chainedStatuslinePathIn(HOME),
      botPidPathIn(HOME),
      dataDirIn(HOME),
      inboxDirIn(HOME),
      logsDirIn(HOME),
    ]) {
      expect(p.startsWith(HOME)).toBe(true);
    }
  });
});

describe("ensureBotDirs", () => {
  test("membuat data/, inbox/, dan logs/ -- dan tidak membuat state root apa pun", () => {
    const home = mkdtempSync(join(tmpdir(), "bothome-"));
    ensureBotDirs(home);
    expect(existsSync(dataDirIn(home))).toBe(true);
    expect(existsSync(inboxDirIn(home))).toBe(true);
    expect(existsSync(logsDirIn(home))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/paths.test.ts`
Expected: FAIL — `resolveBotHome is not a function` dsb.

- [ ] **Step 3: Write minimal implementation**

Ganti seluruh isi `src/engine/paths.ts`:

```ts
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

/**
 * Folder bot yang sedang dilayani proses ini.
 *
 * Murni: env dilewatkan pemanggil, bukan dibaca di sini. Itu yang membuat
 * seluruh modul ini bisa diuji tanpa menyentuh process.env sama sekali --
 * pengganti MIRZA_BOTS_HOME yang lama, yang harus di-`delete` di afterEach dan
 * bocor antar-berkas test kalau lupa.
 */
export function resolveBotHome(
  env: { CLAUDE_PROJECT_DIR?: string | undefined },
  cwd: string
): string {
  const fromEnv = env.CLAUDE_PROJECT_DIR?.trim();
  return fromEnv ? fromEnv : cwd;
}

/**
 * Nama bot = nama folder. Bukan singkatan, bukan pemetaan.
 *
 * Konsekuensi langsung dari "alamat bot lain = folder tetangga": kalau nama bot
 * bukan nama foldernya, `../<nama-bot>/inbox/` butuh terjemahan, terjemahan
 * butuh daftar, dan daftar itu persis yang keputusan ini buang.
 *
 * Efek samping yang diinginkan: memindahkan bot = rename folder.
 */
export function botNameFrom(botHome: string): string {
  const normalized = botHome.split("\\").join("/").replace(/\/+$/, "");
  const last = normalized.slice(normalized.lastIndexOf("/") + 1);
  return last;
}

export function configPathIn(botHome: string): string {
  return join(botHome, "config.json");
}

export function conversationsDbPathIn(botHome: string): string {
  return join(botHome, "conversations.db");
}

/** Ditulis hook SessionStart, dibaca engine tiap push. Dulu sessions/<bot>.id. */
export function sessionIdPathIn(botHome: string): string {
  return join(botHome, "session.id");
}

/** Ditulis bridge statusline, dibaca engine saat menjawab /context. Dulu status/<bot>.json. */
export function statusPathIn(botHome: string): string {
  return join(botHome, "status.json");
}

/** Statusline pendahulu yang WAJIB dipanggil bridge sesudah menangkap. */
export function chainedStatuslinePathIn(botHome: string): string {
  return join(botHome, "chained-statusline");
}

/** Pemegang token Telegram bot ini. Dulu locks/<bot>.pid. */
export function botPidPathIn(botHome: string): string {
  return join(botHome, "bot.pid");
}

/**
 * Berkas & gambar yang dikirim user. Dulu bernama `inbox/`, dan itu salah nama
 * sejak awal -- tidak ada yang "masuk kotak surat" di sana. Namanya diserahkan
 * ke jalur antar-bot, yang memang kotak surat.
 */
export function dataDirIn(botHome: string): string {
  return join(botHome, "data");
}

/** Titipan pesan dari bot lain. Dipakai sebagaimana namanya. */
export function inboxDirIn(botHome: string): string {
  return join(botHome, "inbox");
}

export function logsDirIn(botHome: string): string {
  return join(botHome, "logs");
}

export function ensureBotDirs(botHome: string): void {
  for (const dir of [dataDirIn(botHome), inboxDirIn(botHome), logsDirIn(botHome)]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/paths.test.ts`
Expected: PASS. Suite penuh masih merah — pemanggil lama belum diperbaiki. Itu diharapkan.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/paths.ts cc-plugin/test/engine/paths.test.ts
git commit -m "refactor(paths): path berpangkal pada folder bot, bukan state root"
```

---

### Task A2: `config.json` adalah konfigurasi SATU bot

**Files:**
- Modify: `cc-plugin/src/engine/config.ts`
- Modify: `cc-plugin/test/engine/config.test.ts`

**Interfaces:**
- Consumes: `configPathIn` (A1)
- Produces:
  ```ts
  export const ConfigSchema: z.ZodType<{ token: string; allowFrom: string[]; timezone?: string }>
  export type Config = { token: string; allowFrom: string[]; timezone?: string }
  export class ConfigError extends Error {}
  export function loadConfig(path: string): Config   // path WAJIB
  ```
  `botCount` dan `BotConfigSchema` **dibuang**.

- [ ] **Step 1: Write the failing test**

Ganti isi `test/engine/config.test.ts` dengan:

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, ConfigError } from "../../src/engine/config";

function writeConfig(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify(body));
  return path;
}

describe("loadConfig", () => {
  test("memuat token, allowFrom, dan timezone opsional", () => {
    const cfg = loadConfig(writeConfig({ token: "123:abc", allowFrom: ["1121398977"] }));
    expect(cfg.token).toBe("123:abc");
    expect(cfg.allowFrom).toEqual(["1121398977"]);
    expect(cfg.timezone).toBeUndefined();
  });

  test("timezone diterima apa adanya, tidak divalidasi ke daftar zona", () => {
    const cfg = loadConfig(writeConfig({ token: "t", allowFrom: [], timezone: "Asia/Jakarta" }));
    expect(cfg.timezone).toBe("Asia/Jakarta");
  });

  // Inti keputusan (A): config bukan lagi daftar armada. Kunci penolakannya,
  // jangan cuma "sekarang tidak dipakai" -- config lama yang tidak ditolak akan
  // memuat token bot lain di folder yang salah, diam-diam.
  test("MENOLAK bentuk lama yang memuat daftar bots", () => {
    const path = writeConfig({
      allowFrom: [],
      bots: { "bot-01": { home: "C:/x", token: "t" } },
    });
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  test("menolak config tanpa token", () => {
    expect(() => loadConfig(writeConfig({ allowFrom: [] }))).toThrow(ConfigError);
  });

  test("berkas hilang menghasilkan ConfigError, bukan crash", () => {
    expect(() => loadConfig(join(tmpdir(), "tidak-ada-1234", "config.json"))).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/config.test.ts`
Expected: FAIL — schema masih menuntut `bots`.

- [ ] **Step 3: Write minimal implementation**

Ganti isi `src/engine/config.ts`:

```ts
import { z } from "zod";
import { readFileSync } from "node:fs";

/**
 * Konfigurasi SATU bot -- bot yang foldernya memuat berkas ini.
 *
 * `bots` sudah tidak ada, dan `strictObject` MENOLAKNYA alih-alih
 * mengabaikannya. Itu disengaja: config lama yang diterima diam-diam akan
 * membuat sebuah folder melayani token yang bukan miliknya, dan kegagalan itu
 * tidak punya gejala sampai dua sesi berebut token yang sama (insiden
 * 2026-08-04, enam bot bisu berjam-jam).
 */
export const ConfigSchema = z.strictObject({
  token: z.string().min(1),
  allowFrom: z.array(z.string()),
  // IANA zone name (mis. "Asia/Jakarta"), hanya untuk merender ts_local.
  // Sengaja TIDAK divalidasi ke daftar zona ICU: salah ketik di sini harus
  // menghilangkan waktu lokal, bukan menghentikan bot.
  timezone: z.string().min(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

/**
 * `path` wajib -- tidak ada nilai default lagi.
 *
 * Default lama menunjuk state root yang sekarang tidak ada. Memaksa pemanggil
 * menyebut folder mana yang ia maksud adalah setengah dari keputusan ini.
 */
export function loadConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new ConfigError(`Cannot read config at ${path}: ${(err as Error).message}`);
  }

  let json: unknown;
  try {
    // Buang BOM: berkas ber-BOM sudah menggigit proyek ini tiga kali (SCAR-026).
    json = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    throw new ConfigError(`Config at ${path} is not valid JSON: ${(err as Error).message}`);
  }

  const result = ConfigSchema.safeParse(json);
  if (!result.success) {
    throw new ConfigError(`Config at ${path} failed validation: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/config.ts cc-plugin/test/engine/config.test.ts
git commit -m "refactor(config): config.json memuat satu bot, bukan daftar armada"
```

---

### Task A3: identitas = folder yang memuat `config.json`

**Files:**
- Rewrite: `cc-plugin/src/engine/identity.ts`
- Rewrite: `cc-plugin/test/engine/identity.test.ts`

**Interfaces:**
- Consumes: `botNameFrom`, `configPathIn` (A1)
- Produces:
  ```ts
  export type IdentityResult = { ok: true; bot: string } | { ok: false; message: string }
  export function identifyBot(botHome: string, hasConfig: boolean): IdentityResult
  ```

- [ ] **Step 1: Write the failing test**

Ganti isi `test/engine/identity.test.ts`:

```ts
import { test, expect, describe } from "bun:test";
import { identifyBot } from "../../src/engine/identity";

const HOME = "C:\\Users\\Mirza\\workspace\\mirza_01_bot";

describe("identifyBot", () => {
  test("folder dengan config.json adalah bot, dan namanya nama folder", () => {
    const res = identifyBot(HOME, true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bot).toBe("mirza_01_bot");
  });

  test("folder tanpa config.json bukan bot", () => {
    const res = identifyBot(HOME, false);
    expect(res.ok).toBe(false);
  });

  // W-16: kegagalan harus berupa kalimat yang mengajari, bukan null.
  // Penolakan yang tidak menyebutkan alternatif yang benar dijawab dengan
  // percobaan salah yang sama.
  test("pesan gagal menyebut foldernya DAN cara memperbaikinya", () => {
    const res = identifyBot(HOME, false);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toContain(HOME);
      expect(res.message).toContain("config.json");
      expect(res.message).toContain("token");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/identity.test.ts`
Expected: FAIL — `identifyBot is not a function`.

- [ ] **Step 3: Write minimal implementation**

Ganti isi `src/engine/identity.ts`:

```ts
import { botNameFrom, configPathIn } from "./paths";

export type IdentityResult = { ok: true; bot: string } | { ok: false; message: string };

/**
 * Menjawab "aku bot yang mana?" dari folder tempat sesi ini berjalan.
 *
 * Dulu pertanyaan ini dijawab dengan mencocokkan cwd ke setiap `home` di
 * `config.bots`. Sekarang cwd ADALAH botnya, dan satu-satunya syarat adalah
 * folder itu memuat `config.json` -- syarat yang sama yang membuat sebuah
 * folder tetangga bisa dikenali sebagai tujuan pesan antar-bot. Satu aturan,
 * dua pemakaian, tidak bisa berbeda pendapat.
 *
 * `hasConfig` dilewatkan pemanggil supaya fungsi ini tetap murni.
 *
 * Mengembalikan KALIMAT, bukan null, dan itu perbaikan W-16: jalur lama menolak
 * cwd tak dikenal, `await connect()` melempar, prosesnya keluar, dan tidak ada
 * apa pun yang sampai ke user -- plugin-nya sekadar tidak ada.
 */
export function identifyBot(botHome: string, hasConfig: boolean): IdentityResult {
  if (hasConfig) return { ok: true, bot: botNameFrom(botHome) };

  return {
    ok: false,
    message:
      `Folder ini (${botHome}) tidak memuat config.json, jadi sesi ini tidak punya ` +
      `identitas Telegram dan tidak akan polling. Sebuah folder menjadi bot dengan ` +
      `memuat ${configPathIn(botHome)} berisi {"token": "...", "allowFrom": ["..."]}. ` +
      `Buat berkas itu, lalu restart sesi.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check**

Ubah `if (hasConfig)` menjadi `if (true)`. **Assert dulu mutasinya terpasang:**
`grep -n "if (true)" src/engine/identity.ts` harus mengembalikan satu baris.
Baru jalankan `bun test test/engine/identity.test.ts` — harus MERAH (2 test).
Kembalikan dari salinan.

- [ ] **Step 6: Commit**

```bash
git add cc-plugin/src/engine/identity.ts cc-plugin/test/engine/identity.test.ts
git commit -m "refactor(identity): folder yang memuat config.json adalah bot"
```

---

### Task A4: riwayat berhenti menyaring per-bot

**Files:**
- Modify: `cc-plugin/src/engine/db/conversations-schema.ts`
- Modify: `cc-plugin/src/engine/messages.ts`
- Modify: `cc-plugin/src/engine/engine.ts` (dua pemanggilan)
- Modify: `cc-plugin/test/engine/conversations-schema.test.ts`
- Modify: `cc-plugin/test/engine/messages.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function getMessagesAround(db: Database, opts: { messageId: string; before: number; after: number }): HistoryMessage[]
  export function searchMessages(db: Database, query: string, opts?: { limit?: number }): HistoryMessage[]
  export function handleHistoryRequest(req: { messageId: string; before?: number; after?: number }, db: Database): MessagesResult
  export function handleSearchRequest(req: { query: string; limit?: number }, db: Database): MessagesResult
  ```

- [ ] **Step 1: Write the failing test**

Tambahkan ke `test/engine/conversations-schema.test.ts` (jangan hapus test lama;
**ubah** yang menuntut parameter `bot` — pelajaran "ubah test lama, jangan hapus"):

```ts
test("riwayat mengembalikan semua baris di database ini, apa pun kolom bot-nya", () => {
  const db = openConversationsDb(":memory:");
  // Baris warisan dari sebelum folder di-rename. Sesudah keputusan per-folder,
  // database INI milik satu bot -- kolom bot cuma jejak, bukan penyaring. Kalau
  // ia menyaring, rename folder akan membuang riwayat secara diam-diam.
  insertMessage(db, { ts: "2026-08-01T00:00:00Z", bot: "nama-lama", chatId: "1", messageId: "10", source: "user", text: "sebelum rename" });
  insertMessage(db, { ts: "2026-08-02T00:00:00Z", bot: "nama-baru", chatId: "1", messageId: "11", source: "user", text: "sesudah rename" });

  const around = getMessagesAround(db, { messageId: "11", before: 5, after: 5 });
  expect(around.map((m) => m.text)).toEqual(["sebelum rename", "sesudah rename"]);

  const found = searchMessages(db, "rename");
  expect(found.length).toBe(2);
});
```

Dan di `test/engine/messages.test.ts`, ubah test yang memanggil
`handleHistoryRequest(req, ownBot, config, db)` menjadi `handleHistoryRequest(req, db)`,
serta **ubah** test `unknown_bot` menjadi kunci atas **ketiadaan** jalur itu:

```ts
test("tidak ada lagi jalur 'bot tak dikenal' -- database ini selalu milik pemanggilnya", () => {
  const db = openConversationsDb(":memory:");
  insertMessage(db, { ts: "2026-08-02T00:00:00Z", bot: "apa pun", chatId: "1", messageId: "7", source: "user", text: "halo" });
  const res = handleHistoryRequest({ messageId: "7" }, db);
  expect(res.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/conversations-schema.test.ts test/engine/messages.test.ts`
Expected: FAIL — signature masih menuntut `bot`.

- [ ] **Step 3: Write minimal implementation**

Di `conversations-schema.ts`, ganti kedua fungsi query. Ganti komentar doc
`getMessagesAround` yang menyebut K-3 dengan:

```ts
/**
 * Messages around a given Telegram message id, in chronological order.
 *
 * TIDAK ADA penyaring `bot`, dan itu keputusan, bukan kelalaian: sesudah state
 * per-folder, berkas database ini milik satu bot, jadi filter itu tidak
 * menyaring apa pun -- tapi begitu foldernya di-rename (cara resmi memindahkan
 * bot), baris lama membawa nama lama dan filternya mulai membuang riwayat
 * DIAM-DIAM. Kolom `bot` tetap ditulis sebagai jejak.
 *
 * Returns [] when the anchor is unknown -- deliberately NOT "the newest
 * messages", which would let the AI answer confidently about a message that was
 * never found.
 */
export function getMessagesAround(
  db: Database,
  opts: { messageId: string; before: number; after: number }
): HistoryMessage[] {
  const anchor = db
    .query("SELECT id FROM messages WHERE message_id = ? ORDER BY id DESC LIMIT 1")
    .get(opts.messageId) as { id: number } | null;
  if (!anchor) return [];

  const preceding = (
    opts.before > 0
      ? (db
          .query(`SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.id < ? ORDER BY m.id DESC LIMIT ?`)
          .all(anchor.id, opts.before) as HistoryMessage[])
      : []
  ).reverse();

  const anchorRow = db
    .query(`SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.id = ?`)
    .get(anchor.id) as HistoryMessage;

  const following =
    opts.after > 0
      ? (db
          .query(`SELECT ${HISTORY_COLUMNS} FROM messages m WHERE m.id > ? ORDER BY m.id ASC LIMIT ?`)
          .all(anchor.id, opts.after) as HistoryMessage[])
      : [];

  return [...preceding, anchorRow, ...following];
}

/**
 * FTS5 keyword search atas database milik bot ini. Tanpa penyaring `bot`, alasan
 * sama dengan getMessagesAround.
 *
 * Throws on a malformed query (verified: an unbalanced quote gives
 * "unterminated string"). Deliberately not swallowed -- a silent [] would be
 * indistinguishable from "no matches", and the AI writes these queries.
 */
export function searchMessages(
  db: Database,
  query: string,
  opts: { limit?: number } = {}
): HistoryMessage[] {
  return db
    .query(
      `SELECT ${HISTORY_COLUMNS} FROM messages_fts f JOIN messages m ON m.id = f.rowid
       WHERE messages_fts MATCH ? ORDER BY m.id DESC LIMIT ?`
    )
    .all(query, opts.limit ?? 20) as HistoryMessage[];
}
```

Di `messages.ts`, **hapus** `resolveOwnBot` dan sederhanakan kedua handler:

```ts
export function handleHistoryRequest(
  req: { messageId: string; before?: number; after?: number },
  db: Database
): MessagesResult {
  return {
    ok: true,
    messages: getMessagesAround(db, {
      messageId: req.messageId,
      before: req.before ?? 0,
      // Defaults to looking forward: the motivating request is "trace a few
      // messages AFTER the one I quoted" (spec §9.2).
      after: req.after ?? 10,
    }),
  };
}

export function handleSearchRequest(
  req: { query: string; limit?: number },
  db: Database
): MessagesResult {
  try {
    return { ok: true, messages: searchMessages(db, req.query, { limit: req.limit ?? 20 }) };
  } catch (err) {
    // FTS5 rejects plenty of ordinary-looking input (an unbalanced quote, a
    // trailing AND). The AI writes these queries, so name the problem in a way
    // that tells it to rephrase rather than leaving it a generic handler crash.
    return { ok: false, error: `bad_search_query: ${err}` };
  }
}
```

Di `engine.ts`, ubah kedua pemanggilan menjadi
`handleHistoryRequest(opts, conversationsDb)` dan `handleSearchRequest(opts, conversationsDb)`,
dan buang `bot?: string` dari tipe `Engine.history`/`Engine.search`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/conversations-schema.test.ts test/engine/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/db/conversations-schema.ts cc-plugin/src/engine/messages.ts cc-plugin/src/engine/engine.ts cc-plugin/test/engine/conversations-schema.test.ts cc-plugin/test/engine/messages.test.ts
git commit -m "refactor(history): satu database per bot, tanpa penyaring bot"
```

---

### Task A5: `doctor` melaporkan satu bot

**Files:**
- Modify: `cc-plugin/src/engine/doctor.ts`
- Modify: `cc-plugin/src/engine/types.ts`
- Modify: `cc-plugin/bin/doctor.ts`
- Modify: `cc-plugin/test/engine/doctor.test.ts`

**Interfaces:**
- Consumes: `botNameFrom`, `botPidPathIn` (A1)
- Produces:
  ```ts
  export type DoctorReport = { bot: string; lock: LockStatus; conversationsReady: boolean; version: string }
  export function buildDoctorReport(botHome: string, conversationsDb: Database, version: string): DoctorReport
  ```

- [ ] **Step 1: Write the failing test**

Ganti isi `test/engine/doctor.test.ts` — **tanpa `process.env` sama sekali**:

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDoctorReport } from "../../src/engine/doctor";
import { openConversationsDb } from "../../src/engine/db/conversations-schema";
import { botPidPathIn } from "../../src/engine/paths";

describe("buildDoctorReport", () => {
  test("melaporkan satu bot -- namanya nama folder", () => {
    const home = join(mkdtempSync(join(tmpdir(), "doc-")), "bot-77");
    require("node:fs").mkdirSync(home, { recursive: true });
    const report = buildDoctorReport(home, openConversationsDb(":memory:"), "9.9.9");
    expect(report.bot).toBe("bot-77");
    expect(report.conversationsReady).toBe(true);
    expect(report.version).toBe("9.9.9");
  });

  test("lock kosong dilaporkan sebagai pid null, bukan dihilangkan", () => {
    const home = mkdtempSync(join(tmpdir(), "doc-"));
    const report = buildDoctorReport(home, openConversationsDb(":memory:"), "1");
    expect(report.lock.pid).toBeNull();
    expect(report.lock.alive).toBe(false);
  });

  test("pid proses ini sendiri dilaporkan hidup", () => {
    const home = mkdtempSync(join(tmpdir(), "doc-"));
    writeFileSync(botPidPathIn(home), String(process.pid));
    const report = buildDoctorReport(home, openConversationsDb(":memory:"), "1");
    expect(report.lock.pid).toBe(process.pid);
    expect(report.lock.alive).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/doctor.test.ts`
Expected: FAIL — signature lama menuntut `config`.

- [ ] **Step 3: Write minimal implementation**

`src/engine/types.ts` — ganti `DoctorReport`:

```ts
export type DoctorReport = {
  /** Nama bot yang dilayani folder ini. Armada tidak lagi punya wakil tunggal. */
  bot: string;
  /** Siapa memegang token bot INI, kalau ada. */
  lock: LockStatus;
  conversationsReady: boolean;
  version: string;
};
```

`src/engine/doctor.ts` — ganti seluruh isi:

```ts
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { botNameFrom, botPidPathIn } from "./paths";
import type { DoctorReport, LockStatus } from "./types";

/**
 * Siapa memegang token bot ini.
 *
 * Dulu ini memetakan seluruh `config.bots` -- "siapa melayani apa" adalah satu
 * kali listing folder locks/. Sesudah state per-folder, pertanyaan itu berpindah
 * ke tempat lain: `ls workspace/*/bot.pid`. Doctor menjawab untuk dirinya
 * sendiri, dan berhenti berpura-pura tahu soal tetangganya.
 */
function readLock(botHome: string): LockStatus {
  const bot = botNameFrom(botHome);
  let pid: number | null = null;
  try {
    const parsed = parseInt(readFileSync(botPidPathIn(botHome), "utf8").trim(), 10);
    if (Number.isInteger(parsed)) pid = parsed;
  } catch {
    // Tidak ada berkas lock: belum ada yang mengklaim token bot ini.
  }

  let alive = false;
  if (pid !== null) {
    try {
      // Signal 0 memeriksa keberadaan tanpa mengirim apa pun.
      process.kill(pid, 0);
      alive = true;
    } catch {
      // Angka basi dari sesi yang mati tanpa melepas. Dilaporkan tidak hidup,
      // bukan dibuang -- lock basi adalah temuan yang nyata.
    }
  }

  return { bot, pid, alive };
}

export function buildDoctorReport(
  botHome: string,
  conversationsDb: Database,
  version: string
): DoctorReport {
  const convTableRows = conversationsDb
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
    .all();

  return {
    bot: botNameFrom(botHome),
    lock: readLock(botHome),
    conversationsReady: convTableRows.length === 1,
    version,
  };
}
```

`bin/doctor.ts` — ganti bagian yang memuat config/state root:

```ts
import { resolveBotHome, conversationsDbPathIn, ensureBotDirs } from "../src/engine/paths";
// ...
const botHome = resolveBotHome(process.env, process.cwd());
ensureBotDirs(botHome);
const report = buildDoctorReport(botHome, openConversationsDb(conversationsDbPathIn(botHome)), version);
```

(Baca berkasnya dan sesuaikan baris di sekitarnya dengan `Edit` presisi — jangan
tempel blok ini mentah-mentah.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/doctor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/doctor.ts cc-plugin/src/engine/types.ts cc-plugin/bin/doctor.ts cc-plugin/test/engine/doctor.test.ts
git commit -m "refactor(doctor): melaporkan satu bot, bukan armada"
```

---

### Task A6: `session-file.ts` + `poller.ts` berpangkal pada folder bot

**Files:**
- Modify: `cc-plugin/src/engine/session-file.ts`
- Modify: `cc-plugin/src/engine/telegram/poller.ts`
- Modify: `cc-plugin/test/engine/session-file.test.ts`
- Modify: `cc-plugin/test/engine/telegram/poller.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function readCurrentSessionId(botHome: string): string | undefined
  export type PollerDeps = { config: Config; conversationsDb: Database; sink: MessageSink; dataDir: string }
  ```

- [ ] **Step 1: Write the failing test**

Ganti isi `test/engine/session-file.test.ts` — **tanpa `process.env`**:

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCurrentSessionId } from "../../src/engine/session-file";
import { sessionIdPathIn } from "../../src/engine/paths";

describe("readCurrentSessionId", () => {
  test("membaca session.id di folder bot", () => {
    const home = mkdtempSync(join(tmpdir(), "sess-"));
    writeFileSync(sessionIdPathIn(home), "  58dcc0ed-1111  \n");
    expect(readCurrentSessionId(home)).toBe("58dcc0ed-1111");
  });

  test("berkas tidak ada berarti TIDAK TAHU, bukan tebakan", () => {
    expect(readCurrentSessionId(mkdtempSync(join(tmpdir(), "sess-")))).toBeUndefined();
  });

  test("berkas kosong juga berarti tidak tahu", () => {
    const home = mkdtempSync(join(tmpdir(), "sess-"));
    writeFileSync(sessionIdPathIn(home), "   ");
    expect(readCurrentSessionId(home)).toBeUndefined();
  });
});
```

Di `test/engine/telegram/poller.test.ts`, ubah setiap `inboxRoot: root` menjadi
`dataDir: join(root, "data")` dan tambahkan satu test yang mengunci letaknya:

```ts
test("lampiran user mendarat di data/ folder bot, bukan di inbox/", async () => {
  // inbox/ sekarang milik pesan antar-bot. Menaruh unduhan user di sana
  // akan membuat pemindai inbox membaca file .jpg sebagai payload rusak.
  const home = mkdtempSync(join(tmpdir(), "poll-"));
  const dataDir = join(home, "data");
  mkdirSync(dataDir, { recursive: true });
  const deps = { config, conversationsDb: db, sink, dataDir };
  await handleIncomingMessage({ ...baseMsg, photoUrls: [photoUrl] }, deps);
  const stored = db.query("SELECT attachments FROM messages ORDER BY id DESC LIMIT 1").get() as { attachments: string };
  expect(stored.attachments).toContain(join(home, "data"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/session-file.test.ts test/engine/telegram/poller.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`session-file.ts`: ganti import `currentSessionPath` → `sessionIdPathIn`, ganti
parameter `bot: string` → `botHome: string`, dan pertahankan seluruh komentar
doc yang menjelaskan **kenapa dibaca tiap push**.

`poller.ts`:
```ts
export type PollerDeps = {
  config: Config;
  conversationsDb: Database;
  sink: MessageSink;
  /** Tempat lampiran dari user mendarat: <botHome>/data. BUKAN inbox/, yang
   *  sekarang milik pesan antar-bot. */
  dataDir: string;
};
```
dan di `handleIncomingMessage` ganti
`const inboxDir = join(deps.inboxRoot, "inbox", msg.bot);` menjadi
`const dataDir = deps.dataDir;` (lalu `downloadAll(downloads, dataDir)`).
Import `join` dari `node:path` menjadi tak terpakai bila tidak ada pemakai lain —
hapus importnya kalau begitu, jangan tinggalkan.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/session-file.test.ts test/engine/telegram/poller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/session-file.ts cc-plugin/src/engine/telegram/poller.ts cc-plugin/test/engine/session-file.test.ts cc-plugin/test/engine/telegram/poller.test.ts
git commit -m "refactor(state): session.id dan data/ berada di folder bot"
```

---

### Task A7: `engine.ts` dirakit ulang di atas `botHome`

**Files:**
- Modify: `cc-plugin/src/engine/engine.ts`
- Modify: `cc-plugin/test/engine/engine.test.ts`

**Interfaces:**
- Consumes: A1–A6
- Produces: `export function startEngine(botHome: string): EngineStart` (nama sama, arti berubah)

- [ ] **Step 1: Write the failing test**

Ganti isi `test/engine/engine.test.ts` — **tanpa `process.env`**:

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEngine } from "../../src/engine/engine";
import { configPathIn, dataDirIn, inboxDirIn, logsDirIn } from "../../src/engine/paths";

function botFolder(name: string, config?: unknown): string {
  const home = join(mkdtempSync(join(tmpdir(), "engine-")), name);
  mkdirSync(home, { recursive: true });
  if (config !== undefined) writeFileSync(configPathIn(home), JSON.stringify(config));
  return home;
}

describe("startEngine", () => {
  test("folder tanpa config.json ditolak dengan kalimat, bukan lemparan", () => {
    const res = startEngine(botFolder("bukan-bot"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toContain("config.json");
  });

  test("config bentuk lama (daftar bots) ditolak dengan kalimat", () => {
    const home = botFolder("bot-lama", { allowFrom: [], bots: { x: { home: "C:/x", token: "t" } } });
    const res = startEngine(home);
    expect(res.ok).toBe(false);
  });

  test("folder bot menyiapkan data/, inbox/, dan logs/ miliknya sendiri", () => {
    const home = botFolder("bot-siap", { token: "123:fake", allowFrom: ["1"] });
    const res = startEngine(home);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.engine.bot).toBe("bot-siap");
      expect(existsSync(dataDirIn(home))).toBe(true);
      expect(existsSync(inboxDirIn(home))).toBe(true);
      expect(existsSync(logsDirIn(home))).toBe(true);
      res.engine.close();
    }
  });

  // Pagar terhadap kembalinya state terpusat: tidak boleh ada satu berkas pun
  // yang dibuat di luar folder bot.
  test("tidak membuat apa pun di ~/.claude/mirza-bots", () => {
    const home = botFolder("bot-bersih", { token: "123:fake", allowFrom: [] });
    const res = startEngine(home);
    if (res.ok) res.engine.close();
    expect(existsSync(join(require("node:os").homedir(), ".claude", "mirza-bots", "locks"))).toBe(false);
  });
});
```

> ⚠️ Test terakhir **membaca** `~/.claude/`, tidak menulis. Kalau folder itu
> kebetulan sudah ada di mesin ini karena sistem lama, test ini akan merah
> **padahal kodenya benar** — dalam kasus itu, ubah assertion menjadi
> membandingkan `mtime` sebelum/sesudah, jangan melonggarkannya jadi selalu
> hijau. Dan jangan menghapus foldernya: itu state produksi.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/engine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Di `startEngine`, ganti blok pembuka:

```ts
export function startEngine(botHome: string): EngineStart {
  const identity = identifyBot(botHome, existsSync(configPathIn(botHome)));
  if (!identity.ok) return { ok: false, message: identity.message };
  const botName = identity.bot;

  let config;
  try {
    ensureBotDirs(botHome);
    config = loadConfig(configPathIn(botHome));
  } catch (err) {
    return { ok: false, message: `Cannot read this bot's config: ${(err as Error).message}` };
  }

  const takeover = acquireBotLock(botPidPathIn(botHome), process.pid);
  // ... (pesan takeover tidak berubah)

  const conversationsDb = openConversationsDb(conversationsDbPathIn(botHome));
```

dan seterusnya:
- `sessionId: () => readCurrentSessionId(botHome)`
- `const bot = makeBot(config.token);` (tidak ada lagi `botConfig`)
- `const deps: PollerDeps = { config, conversationsDb, sink, dataDir: dataDirIn(botHome) };`
- `releaseBotLock(botPidPathIn(botHome), process.pid)` di `close()`
- `replyLocalContext(ctx, botHome)` — parameternya berubah dari `botName, projectDir`
  menjadi `botHome` saja, dan di dalamnya `statusPathIn(botHome)` +
  `chainPath: chainedStatuslinePathIn(botHome)` + `projectDir: botHome`.

Perbarui pula import di kepala berkas: buang `stateRoot`, `configPath`,
`conversationsDbPath`, `lockPath`, `statusPath`, `chainedStatuslinePath`,
`ensureStateDirs`, `resolveBotByCwd`; masukkan padanan barunya + `identifyBot` +
`existsSync`.

- [ ] **Step 4: Run FULL suite**

Run: `cd cc-plugin && bun test`
Expected: seluruh 396+ test hijau kecuali yang memang ditulis ulang di task
berikutnya (hook & bridge, A8). Kalau ada merah di luar itu, **jangan lanjut**.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/engine.ts cc-plugin/test/engine/engine.test.ts
git commit -m "refactor(engine): dirakit di atas folder bot, bukan state root"
```

---

### Task A8: hook `session-start` dan `statusline-bridge` pindah ke folder bot

**Files:**
- Modify: `cc-plugin/hooks/session-start.ts`
- Modify: `cc-plugin/bin/statusline-bridge.ts`
- Delete: `cc-plugin/src/engine/context/bot-for-cwd.ts`
- Delete: `cc-plugin/test/engine/context/bot-for-cwd.test.ts`
- Modify: `cc-plugin/test/engine/context/status-file.test.ts`
- Modify: `cc-plugin/test/hooks/session-start.test.ts` (**sudah ada** — ubah,
  jangan buat berkas kedua; test lama yang menguji `botForCwd` diubah menjadi
  menguji `isBotFolder`, bukan dihapus)

**Interfaces:**
- Produces: `export function isBotFolder(cwd: string): boolean` (di `session-start.ts`,
  hanya `node:`), `export function botNameOf(cwd: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBotFolder, botNameOf, parseHookInput, sessionIdFrom } from "../../hooks/session-start";

describe("session-start: folder bot", () => {
  test("folder dengan config.json adalah bot; namanya nama folder", () => {
    const home = join(mkdtempSync(join(tmpdir(), "hook-")), "mirza_01_bot");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "config.json"), "{}");
    expect(isBotFolder(home)).toBe(true);
    expect(botNameOf(home)).toBe("mirza_01_bot");
  });

  test("folder tanpa config.json bukan bot -- hook diam, tidak mengeluh", () => {
    expect(isBotFolder(mkdtempSync(join(tmpdir(), "hook-")))).toBe(false);
  });

  test("payload tanpa session id tidak menimpa nilai sebelumnya", () => {
    expect(sessionIdFrom(parseHookInput("{}"), {})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/hooks/session-start.test.ts`
Expected: FAIL — `isBotFolder is not a function`.

- [ ] **Step 3: Write minimal implementation**

Di `hooks/session-start.ts`:
- Hapus `stateRoot()` dan `botForCwd()` beserta `normalize()`.
- Tambahkan:

```ts
/**
 * Sebuah folder adalah bot bila ia memuat config.json. Aturan yang sama dipakai
 * engine dan pemindai tetangga -- dieja ulang di sini, bukan diimpor, karena
 * hook ini hanya boleh mengimpor `node:` (lihat header berkas).
 */
export function isBotFolder(cwd: string): boolean {
  return existsSync(join(cwd, "config.json"));
}

/** Nama bot = nama folder. Salinan sengaja dari paths.botNameFrom, alasan sama. */
export function botNameOf(cwd: string): string {
  const n = cwd.split("\\").join("/").replace(/\/+$/, "");
  return n.slice(n.lastIndexOf("/") + 1);
}
```
- `note()` menulis ke `join(cwd, "logs", "session-hook.log")`. Karena `note()`
  dipanggil sebelum `cwd` dihitung di versi lama, **hitung `cwd` lebih dulu** di
  `main()` dan lewatkan ke `note()`.
- `main()`: baca id → kalau `!isBotFolder(cwd)` catat `no config.json in ${cwd} -- nothing to record`
  dan berhenti → kalau ya, tulis `join(cwd, "session.id")`.
- Import `existsSync` dari `node:fs`; buang `homedir` bila tak terpakai lagi.

Di `bin/statusline-bridge.ts`:
- Buang import `botForCwd`, `configPath`, `statusPath`, `chainedStatuslinePath`.
- Pakai `resolveBotHome`, `configPathIn`, `statusPathIn`, `chainedStatuslinePathIn`.
- Blok tangkap menjadi:

```ts
try {
  const botHome = resolveBotHome(process.env, process.cwd());
  // Folder yang bukan rumah bot mana pun: tidak ditulis apa-apa. Ia tetap
  // mendapat statusline-nya lewat blok di bawah.
  if (existsSync(configPathIn(botHome)) && input !== "") {
    writeCapturedStatus(statusPathIn(botHome), JSON.parse(input), Date.now());
  }
} catch {
  // Sengaja kosong. Menangkap adalah tugas kedua; kegagalannya tidak boleh
  // merambat ke tugas pertama.
}

const chainPath = chainedStatuslinePathIn(resolveBotHome(process.env, process.cwd()));
```

- Hapus `src/engine/context/bot-for-cwd.ts` dan test-nya (`git rm`). Modulnya
  ada semata-mata untuk mencari cwd di dalam daftar `bots`; daftarnya tidak ada
  lagi, jadi ini penghapusan, bukan pelemahan test — perilakunya sekarang
  dikunci oleh test `isBotFolder` di atas.
- Perbarui `test/engine/context/status-file.test.ts` yang mengimpor
  `statusDir`/`statusPath` menjadi `statusPathIn`.

- [ ] **Step 4: Run FULL suite**

Run: `cd cc-plugin && bun test`
Expected: seluruhnya hijau. Catat angkanya.

- [ ] **Step 5: Type check**

Run: `cd cc-plugin && bunx tsc --noEmit --skipLibCheck --target esnext --module esnext --moduleResolution bundler --types bun-types src/**/*.ts bin/*.ts hooks/*.ts`
(atau perintah `tsc` ad-hoc yang sudah dipakai proyek ini — cari di README).
Expected: bersih. **`bun test` tidak memeriksa tipe** — dua kali suite hijau
menyembunyikan error tipe.

- [ ] **Step 6: Commit**

```bash
git add -u cc-plugin/hooks cc-plugin/bin cc-plugin/src/engine/context cc-plugin/test
git commit -m "refactor(hooks,bridge): session.id dan status.json ditulis di folder bot"
```

---

### Task A9: skrip migrasi — **ditulis, TIDAK dijalankan**

**Files:**
- Create: `cc-plugin/scripts/migrate-per-folder.ts`
- Create: `cc-plugin/test/scripts/migrate-per-folder.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MigrationPlan = { copies: Array<{ from: string; to: string }>; sqlDeletes: string[]; warnings: string[] }
  export function planMigration(stateRoot: string, botHome: string, botName: string): MigrationPlan
  export function applyMigration(plan: MigrationPlan): void
  ```

**Aturan keras:** default skrip adalah **dry-run**. `applyMigration` hanya
berjalan bila argumen `--apply` diberikan. **Tidak boleh dijalankan sama sekali
di sesi ini**, termasuk dry-run atas state nyata — test memakai folder tiruan.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMigration, applyMigration } from "../../scripts/migrate-per-folder";

function fakeStateRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "oldstate-"));
  mkdirSync(join(root, "sessions"), { recursive: true });
  mkdirSync(join(root, "status"), { recursive: true });
  mkdirSync(join(root, "locks"), { recursive: true });
  mkdirSync(join(root, "inbox", "mirza_01_bot"), { recursive: true });
  writeFileSync(join(root, "conversations.db"), "db-bytes");
  writeFileSync(join(root, "config.json"), JSON.stringify({
    allowFrom: ["1121398977"],
    timezone: "Asia/Jakarta",
    bots: { mirza_01_bot: { home: "C:/w/mirza_01_bot", token: "123:abc" } },
  }));
  writeFileSync(join(root, "sessions", "mirza_01_bot.id"), "sess-1");
  writeFileSync(join(root, "status", "mirza_01_bot.json"), "{}");
  writeFileSync(join(root, "status", "chained-statusline"), "statusline-lama");
  writeFileSync(join(root, "locks", "mirza_01_bot.pid"), "4242");
  writeFileSync(join(root, "inbox", "mirza_01_bot", "foto.jpg"), "jpg");
  return root;
}

describe("planMigration", () => {
  test("memetakan tiap berkas lama ke tempat barunya di folder bot", () => {
    const root = fakeStateRoot();
    const home = mkdtempSync(join(tmpdir(), "newhome-"));
    const plan = planMigration(root, home, "mirza_01_bot");
    const targets = plan.copies.map((c) => c.to.slice(home.length + 1).split("\\").join("/"));
    expect(targets).toContain("conversations.db");
    expect(targets).toContain("session.id");
    expect(targets).toContain("status.json");
    expect(targets).toContain("bot.pid");
    expect(targets).toContain("chained-statusline");
    expect(targets).toContain("data/foto.jpg");
  });

  test("config baru memuat token bot ini saja -- tidak ada daftar bots", () => {
    const root = fakeStateRoot();
    const home = mkdtempSync(join(tmpdir(), "newhome-"));
    applyMigration(planMigration(root, home, "mirza_01_bot"));
    const cfg = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
    expect(cfg).toEqual({ token: "123:abc", allowFrom: ["1121398977"], timezone: "Asia/Jakarta" });
    expect("bots" in cfg).toBe(false);
  });

  // Verifikasi DUA ARAH (pelajaran migrasi bot-uji -> mirza_01_bot):
  // "yang baru ada" tidak membuktikan "yang lama tidak ketinggalan".
  test("melaporkan berkas lama yang tidak punya tujuan, bukan mendiamkannya", () => {
    const root = fakeStateRoot();
    writeFileSync(join(root, "berkas-asing.txt"), "x");
    const plan = planMigration(root, mkdtempSync(join(tmpdir(), "newhome-")), "mirza_01_bot");
    expect(plan.warnings.join("\n")).toContain("berkas-asing.txt");
  });

  test("applyMigration tidak menghapus apa pun dari state lama", () => {
    const root = fakeStateRoot();
    const home = mkdtempSync(join(tmpdir(), "newhome-"));
    applyMigration(planMigration(root, home, "mirza_01_bot"));
    expect(existsSync(join(root, "conversations.db"))).toBe(true);
    expect(existsSync(join(root, "config.json"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/scripts/migrate-per-folder.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Write minimal implementation**

Tulis `scripts/migrate-per-folder.ts`. Poin yang tidak boleh hilang:
- **Menyalin, tidak memindahkan.** State lama ditinggalkan utuh; user yang
  menghapusnya kalau sudah yakin. Migrasi yang menghapus tidak punya jalan
  mundur, dan yang dimigrasikan di sini adalah satu-satunya riwayat percakapan
  yang ada.
- `warnings` memuat setiap entri di `stateRoot` yang tidak punya tujuan, **dan**
  setiap bot lain yang ada di `config.bots` selain `botName` (mereka butuh
  panggilan migrasi sendiri — diam soal ini persis kegagalan "yang lama
  ketinggalan").
- Baris `messages` milik bot lain **tidak** dihapus oleh skrip; `sqlDeletes`
  hanya memuat SQL yang **dicetak** untuk dijalankan user secara sadar.
- Kepala berkas memuat blok komentar: **"JANGAN dijalankan otomatis. Default
  dry-run. `--apply` menyalin; tidak ada mode yang menghapus."**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/scripts/migrate-per-folder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/scripts/migrate-per-folder.ts cc-plugin/test/scripts/migrate-per-folder.test.ts
git commit -m "feat(migrasi): skrip state lama -> folder bot (dry-run default, tidak dijalankan)"
```

---

### Task A10: README + rilis versi, lalu merge Fase A

**Files:**
- Modify: `mirza-bots/README.md`
- Modify: `cc-plugin/package.json`, `cc-plugin/.claude-plugin/plugin.json`

- [ ] **Step 1: Perbarui README**

Ganti setiap penyebutan `~/.claude/mirza-bots/` dengan bentuk folder bot, dan
tambahkan satu bagian **"Memasang bot baru"** yang dalam lima baris menjelaskan:
buat folder, isi `config.json` dengan `token` + `allowFrom`, jalankan
`mirza-bot`. Itu ujian langsung terhadap kriteria *"mudah dipelajari orang
lain"* — kalau bagian itu tidak muat dalam lima baris, strukturnya belum selesai.

Cantumkan juga: **prosedur migrasi manual** (jalankan
`bun run scripts/migrate-per-folder.ts <stateRoot> <botHome> <botName>` untuk
melihat rencananya, `--apply` untuk menyalin), dengan peringatan bahwa langkah
ini **belum pernah dijalankan sekali pun**.

- [ ] **Step 2: Naikkan versi**

`cc-plugin` **0.10.4 → 0.11.0** di **dua** berkas (`package.json` dan
`.claude-plugin/plugin.json`). Angka mayor-minor karena bentuk state berubah dan
config lama ditolak.

- [ ] **Step 3: Jalankan seluruh suite + type check**

Run: `cd cc-plugin && bun test`
Expected: hijau. Catat angka pastinya untuk BACKLOG dan handoff.

- [ ] **Step 4: Merge ke `main` dan push**

```bash
git checkout main && git merge --no-ff <branch> && git push origin main
git status -sb   # WAJIB: tidak boleh ada "ahead"
```

---

# FASE B — Jalur antar-bot lewat `inbox/`

### Task B1: bentuk pesan + validasi (murni)

**Files:**
- Create: `cc-plugin/src/engine/agent/payload.ts`
- Test: `cc-plugin/test/engine/agent/payload.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_HOP = 5
  export const MAX_BODY_BYTES = 8 * 1024
  export type AgentMessage = {
    id: string; ts: string; from: string; text: string;
    expects_reply: boolean; in_reply_to?: string; hop_count: number;
  }
  export type SendCheck = { ok: true } | { ok: false; error: string }
  export function validateOutgoing(msg: { text: string; expects_reply: boolean; in_reply_to?: string; hop_count: number }): SendCheck
  export function parseAgentMessage(raw: string): { ok: true; msg: AgentMessage } | { ok: false; error: string }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { validateOutgoing, parseAgentMessage, MAX_HOP } from "../../../src/engine/agent/payload";

const base = { text: "halo", expects_reply: false, hop_count: 0 };

describe("validateOutgoing", () => {
  test("pesan biasa lolos", () => {
    expect(validateOutgoing(base).ok).toBe(true);
  });

  test("pertanyaan (expects_reply) lolos bila BUKAN balasan", () => {
    expect(validateOutgoing({ ...base, expects_reply: true }).ok).toBe(true);
  });

  // Ini pagar strukturalnya, dan satu-satunya alasan hop guard boleh jadi
  // jaring pengaman alih-alih rem harian: balasan yang menuntut balasan membuat
  // A<->B sopan selamanya. Satu baris membuatnya MUSTAHIL, bukan dibatasi.
  test("balasan TIDAK BOLEH menuntut balasan", () => {
    const r = validateOutgoing({ ...base, expects_reply: true, in_reply_to: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("balasan");
  });

  test("balasan tanpa expects_reply lolos", () => {
    expect(validateOutgoing({ ...base, in_reply_to: "abc" }).ok).toBe(true);
  });

  test("hop_count di atas MAX_HOP ditolak DI SISI PENGIRIM", () => {
    const r = validateOutgoing({ ...base, hop_count: MAX_HOP + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("anti-loop");
  });

  test("hop_count tepat MAX_HOP masih lolos", () => {
    expect(validateOutgoing({ ...base, hop_count: MAX_HOP }).ok).toBe(true);
  });

  test("teks kosong ditolak", () => {
    expect(validateOutgoing({ ...base, text: "" }).ok).toBe(false);
  });
});

describe("parseAgentMessage", () => {
  test("membaca payload yang sah", () => {
    const raw = JSON.stringify({
      id: "u-1", ts: "2026-08-04T22:00:00Z", from: "bot-03",
      text: "kerjakan X", expects_reply: true, hop_count: 1,
    });
    const r = parseAgentMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.msg.from).toBe("bot-03");
      expect(r.msg.expects_reply).toBe(true);
      expect(r.msg.hop_count).toBe(1);
    }
  });

  test("BOM di depan tidak mematikan pembacaan", () => {
    const raw = "\uFEFF" + JSON.stringify({ id: "u", ts: "t", from: "b", text: "x", expects_reply: false, hop_count: 0 });
    expect(parseAgentMessage(raw).ok).toBe(true);
  });

  test("payload rusak ditolak dengan alasan, bukan dilempar", () => {
    const r = parseAgentMessage("{bukan json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  test("payload yang melanggar aturan balasan ditolak juga di sisi penerima", () => {
    const raw = JSON.stringify({ id: "u", ts: "t", from: "b", text: "x", expects_reply: true, in_reply_to: "z", hop_count: 0 });
    expect(parseAgentMessage(raw).ok).toBe(false);
  });

  test("hop_count di atas MAX_HOP ditolak juga di sisi penerima", () => {
    const raw = JSON.stringify({ id: "u", ts: "t", from: "b", text: "x", expects_reply: false, hop_count: MAX_HOP + 1 });
    expect(parseAgentMessage(raw).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/agent/payload.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Bentuk satu pesan antar-bot, dan dua aturan yang membuat jalur ini tidak bisa
 * berputar.
 *
 * Aturan 1 -- BALASAN TIDAK BOLEH MENUNTUT BALASAN. `expects_reply: true` hanya
 * sah bila `in_reply_to` tidak ada. Ini bukan pembatasan sopan santun; ia yang
 * membuat loop A<->B MUSTAHIL alih-alih sekadar dibatasi. Dengan aturan ini,
 * hop guard kembali ke perannya yang benar: jaring pengaman untuk kasus tak
 * terbayang, bukan rem yang diinjak tiap hari.
 *
 * Aturan 2 -- hop guard, dibawa dari agent-bus (T-5: `grep -i hop` atas seluruh
 * cc-plugin dan cc-wrapper mengembalikan NOL hasil, jadi ia tidak ikut pindah
 * dengan sendirinya). Ditolak DI SISI PENGIRIM supaya AI mendapat kalimat yang
 * menyuruhnya berhenti me-relay, bukan pesan yang hilang diam-diam di seberang.
 *
 * Divalidasi di KEDUA sisi. Pengirim bisa saja versi lama, atau berkasnya
 * ditulis tangan.
 */
export const MAX_HOP = 5;
export const MAX_BODY_BYTES = 8 * 1024;

export type AgentMessage = {
  id: string;
  ts: string;
  from: string;
  text: string;
  expects_reply: boolean;
  in_reply_to?: string;
  hop_count: number;
};

export type SendCheck = { ok: true } | { ok: false; error: string };

export function validateOutgoing(msg: {
  text: string;
  expects_reply: boolean;
  in_reply_to?: string;
  hop_count: number;
}): SendCheck {
  if (typeof msg.text !== "string" || msg.text.length === 0) {
    return { ok: false, error: "text harus string tidak kosong" };
  }
  if (Buffer.byteLength(msg.text, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, error: `text melebihi ${MAX_BODY_BYTES} byte` };
  }
  if (!Number.isInteger(msg.hop_count) || msg.hop_count < 0) {
    return { ok: false, error: "hop_count harus bilangan bulat >= 0" };
  }
  if (msg.hop_count > MAX_HOP) {
    return {
      ok: false,
      error:
        `hop_count ${msg.hop_count} melewati batas ${MAX_HOP} -- menolak mengirim ` +
        `(anti-loop guard). Berhenti me-relay; lapor ke user-mu sendiri.`,
    };
  }
  if (msg.expects_reply && msg.in_reply_to !== undefined) {
    return {
      ok: false,
      error:
        "sebuah balasan tidak boleh menuntut balasan: expects_reply hanya sah " +
        "bila in_reply_to kosong. Kalau perlu percakapan lanjutan, mulai pesan baru.",
    };
  }
  return { ok: true };
}

export function parseAgentMessage(
  raw: string
): { ok: true; msg: AgentMessage } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    // Buang BOM: berkas ber-BOM sudah menggigit proyek ini tiga kali.
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { ok: false, error: `JSON tidak bisa dibaca: ${err}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "payload harus objek" };
  }
  const o = parsed as Record<string, unknown>;
  for (const key of ["id", "ts", "from", "text"]) {
    if (typeof o[key] !== "string" || (o[key] as string).length === 0) {
      return { ok: false, error: `field ${key} harus string tidak kosong` };
    }
  }
  if (typeof o.expects_reply !== "boolean") {
    return { ok: false, error: "expects_reply harus boolean" };
  }
  if (o.in_reply_to !== undefined && typeof o.in_reply_to !== "string") {
    return { ok: false, error: "in_reply_to harus string bila ada" };
  }
  const hop = o.hop_count === undefined ? 0 : o.hop_count;
  if (typeof hop !== "number") return { ok: false, error: "hop_count harus angka" };

  const msg: AgentMessage = {
    id: o.id as string,
    ts: o.ts as string,
    from: o.from as string,
    text: o.text as string,
    expects_reply: o.expects_reply,
    hop_count: hop,
    ...(o.in_reply_to !== undefined ? { in_reply_to: o.in_reply_to as string } : {}),
  };

  const check = validateOutgoing(msg);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, msg };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/agent/payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation check**

Matikan aturan balasan: ubah `if (msg.expects_reply && msg.in_reply_to !== undefined)`
menjadi `if (false)`. **Assert dulu:** `grep -n "if (false)" src/engine/agent/payload.ts`
harus mengembalikan tepat satu baris. Baru jalankan test — harus MERAH (2 test).
Kembalikan dari salinan.

- [ ] **Step 6: Commit**

```bash
git add cc-plugin/src/engine/agent/payload.ts cc-plugin/test/engine/agent/payload.test.ts
git commit -m "feat(agent): bentuk pesan antar-bot, aturan balasan, dan hop guard"
```

---

### Task B2: daftar bot = isi folder induk

**Files:**
- Create: `cc-plugin/src/engine/agent/peers.ts`
- Test: `cc-plugin/test/engine/agent/peers.test.ts`

**Interfaces:**
- Consumes: `configPathIn`, `inboxDirIn` (A1)
- Produces:
  ```ts
  export function listPeers(botHome: string): string[]
  export function resolvePeer(botHome: string, name: string): { ok: true; inbox: string } | { ok: false; error: string }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPeers, resolvePeer } from "../../../src/engine/agent/peers";

function fleet(): { parent: string; self: string } {
  const parent = mkdtempSync(join(tmpdir(), "fleet-"));
  for (const name of ["bot-01", "bot-02", "bot-03"]) {
    mkdirSync(join(parent, name), { recursive: true });
    writeFileSync(join(parent, name, "config.json"), "{}");
  }
  // Folder tetangga yang BUKAN bot: tidak punya config.json.
  mkdirSync(join(parent, "catatan"), { recursive: true });
  return { parent, self: join(parent, "bot-02") };
}

describe("listPeers", () => {
  test("daftar bot adalah isi folder induk, dibaca langsung", () => {
    const { self } = fleet();
    expect(listPeers(self).sort()).toEqual(["bot-01", "bot-03"]);
  });

  test("dirinya sendiri tidak masuk daftar tetangga", () => {
    const { self } = fleet();
    expect(listPeers(self)).not.toContain("bot-02");
  });

  test("folder tanpa config.json bukan bot", () => {
    const { self } = fleet();
    expect(listPeers(self)).not.toContain("catatan");
  });
});

describe("resolvePeer", () => {
  test("alamat tujuan adalah inbox/ folder tetangga", () => {
    const { parent, self } = fleet();
    const r = resolvePeer(self, "bot-03");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inbox).toBe(join(parent, "bot-03", "inbox"));
  });

  // Validasi ikut gratis dari konvensi: salah ketik nama ketahuan seketika,
  // bukan hilang tanpa jejak di folder yang tidak ada.
  test("nama yang salah ketik ditolak, dan tetangga yang ada disebutkan", () => {
    const { self } = fleet();
    const r = resolvePeer(self, "bot-30");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("bot-30");
      expect(r.error).toContain("bot-01");
    }
  });

  test("mengirim ke diri sendiri ditolak", () => {
    const { self } = fleet();
    expect(resolvePeer(self, "bot-02").ok).toBe(false);
  });

  // Nama tujuan datang dari AI. Tanpa ini, "../../.." adalah alamat yang sah.
  test("nama dengan separator path ditolak", () => {
    const { self } = fleet();
    expect(resolvePeer(self, "../bot-03").ok).toBe(false);
    expect(resolvePeer(self, "bot-03/inbox").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/agent/peers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Daftar bot adalah ISI FOLDER INDUK, dibaca langsung -- bukan berkas daftar.
 *
 * Usul awalnya sebuah berkas peer di tiap folder; user mencabutnya sendiri
 * setelah dibahas. N bot berarti N salinan daftar yang sama, menambah bot ke-7
 * berarti menyunting enam berkas, dan yang terlewat membuat satu bot tuli
 * sebelah SECARA DIAM-DIAM. Itu persis penyakit yang dulu membuat config.json
 * disentralkan.
 *
 * Batas yang disadari saat memutuskan: konvensi ini mengunci semua bot pada satu
 * folder induk. Bot di drive atau mesin lain tidak terjangkau. Diterima karena
 * MENAMBAHKAN berkas daftar nanti itu murah, sedangkan MEMBUANG berkas daftar
 * yang terlanjur dipakai itu mahal.
 */
import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { botNameFrom, configPathIn, inboxDirIn } from "../paths";

export function listPeers(botHome: string): string[] {
  const parent = dirname(botHome);
  const self = botNameFrom(botHome);
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return [];
  }
  return entries.filter(
    (name) => name !== self && existsSync(configPathIn(join(parent, name)))
  );
}

export function resolvePeer(
  botHome: string,
  name: string
): { ok: true; inbox: string } | { ok: false; error: string } {
  // Nama tujuan ditulis AI. Tanpa pagar ini, "../.." adalah alamat yang sah dan
  // pesan bisa mendarat di mana saja di disk.
  if (name.length === 0 || /[\\/]/.test(name) || name === "." || name === "..") {
    return { ok: false, error: `nama bot "${name}" tidak sah: harus nama folder polos` };
  }
  const peers = listPeers(botHome);
  if (!peers.includes(name)) {
    const known = peers.length > 0 ? `Yang ada: ${peers.join(", ")}.` : "Tidak ada bot lain di folder induk.";
    return {
      ok: false,
      error: `Tidak ada bot bernama "${name}" di sebelah folder ini. ${known}`,
    };
  }
  return { ok: true, inbox: inboxDirIn(join(dirname(botHome), name)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/agent/peers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/agent/peers.ts cc-plugin/test/engine/agent/peers.test.ts
git commit -m "feat(agent): daftar bot dibaca dari folder induk, bukan registry"
```

---

### Task B3: kirim — `<uuid>.json` lewat tmp+rename

**Files:**
- Create: `cc-plugin/src/engine/agent/send.ts`
- Test: `cc-plugin/test/engine/agent/send.test.ts`

**Interfaces:**
- Consumes: B1, B2
- Produces:
  ```ts
  export type SendResult = { ok: true; id: string; path: string } | { ok: false; error: string }
  export function sendToPeer(botHome: string, to: string, msg: { text: string; expects_reply?: boolean; in_reply_to?: string; hop_count?: number }, now: () => Date, uuid: () => string): SendResult
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendToPeer } from "../../../src/engine/agent/send";
import { MAX_HOP } from "../../../src/engine/agent/payload";

const NOW = () => new Date("2026-08-04T22:30:00.000Z");
let n = 0;
const UUID = () => `uuid-${++n}`;

function fleet(): { parent: string; self: string } {
  const parent = mkdtempSync(join(tmpdir(), "send-"));
  for (const name of ["bot-02", "bot-03"]) {
    mkdirSync(join(parent, name), { recursive: true });
    writeFileSync(join(parent, name, "config.json"), "{}");
  }
  return { parent, self: join(parent, "bot-02") };
}

describe("sendToPeer", () => {
  test("menulis <uuid>.json ke inbox tetangga", () => {
    const { parent, self } = fleet();
    const r = sendToPeer(self, "bot-03", { text: "halo" }, NOW, UUID);
    expect(r.ok).toBe(true);
    const inbox = join(parent, "bot-03", "inbox");
    const files = readdirSync(inbox);
    expect(files.length).toBe(1);
    expect(files[0]!.endsWith(".json")).toBe(true);
    const body = JSON.parse(readFileSync(join(inbox, files[0]!), "utf8"));
    expect(body.from).toBe("bot-02");
    expect(body.text).toBe("halo");
    expect(body.expects_reply).toBe(false);
    expect(body.hop_count).toBe(0);
  });

  test("tidak meninggalkan berkas .tmp", () => {
    const { parent, self } = fleet();
    sendToPeer(self, "bot-03", { text: "x" }, NOW, UUID);
    expect(readdirSync(join(parent, "bot-03", "inbox")).some((f) => f.includes(".tmp."))).toBe(false);
  });

  test("membuat inbox/ tujuan bila belum ada -- bot yang belum pernah dinyalakan tetap bisa dititipi", () => {
    const { parent, self } = fleet();
    const r = sendToPeer(self, "bot-03", { text: "x" }, NOW, UUID);
    expect(r.ok).toBe(true);
    expect(readdirSync(join(parent, "bot-03", "inbox")).length).toBe(1);
  });

  test("balasan yang menuntut balasan ditolak SEBELUM apa pun ditulis", () => {
    const { parent, self } = fleet();
    const r = sendToPeer(self, "bot-03", { text: "x", expects_reply: true, in_reply_to: "a" }, NOW, UUID);
    expect(r.ok).toBe(false);
    let files: string[] = [];
    try { files = readdirSync(join(parent, "bot-03", "inbox")); } catch { files = []; }
    expect(files.length).toBe(0);
  });

  test("hop di atas batas ditolak sebelum menulis", () => {
    const { self } = fleet();
    const r = sendToPeer(self, "bot-03", { text: "x", hop_count: MAX_HOP + 1 }, NOW, UUID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("anti-loop");
  });

  test("tujuan yang tidak ada ditolak dengan daftar yang ada", () => {
    const { self } = fleet();
    const r = sendToPeer(self, "bot-99", { text: "x" }, NOW, UUID);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/agent/send.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Menitipkan satu pesan ke inbox bot tetangga.
 *
 * tmp+rename, bukan tulis langsung: penerima memindai folder ini dengan
 * polling, dan berkas yang tertangkap setengah tertulis akan terbaca sebagai
 * JSON rusak. Pola yang sama dipakai slash/pending.ts dan agent-bus.
 *
 * ANTREAN OFFLINE IKUT GRATIS, dan itu bukan kebetulan: bot yang mati tidak
 * memindai, pesannya menunggu di folder, dan `ls inbox/` memperlihatkan berapa
 * yang menunggu tanpa query apa pun. Tabel `bot_inbox` yang dibuang hari yang
 * sama melakukan tugas yang sama dengan sebuah database dan sebuah daemon.
 *
 * `now` dan `uuid` disuntik supaya isi berkasnya bisa diuji apa adanya.
 */
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { botNameFrom } from "../paths";
import { resolvePeer } from "./peers";
import { validateOutgoing, type AgentMessage } from "./payload";

export type SendResult = { ok: true; id: string; path: string } | { ok: false; error: string };

export function sendToPeer(
  botHome: string,
  to: string,
  msg: { text: string; expects_reply?: boolean; in_reply_to?: string; hop_count?: number },
  now: () => Date,
  uuid: () => string
): SendResult {
  const expects = msg.expects_reply === true;
  const hop = msg.hop_count ?? 0;

  // Validasi SEBELUM menyentuh disk: pesan yang ditolak tidak boleh meninggalkan
  // jejak apa pun di folder tetangga.
  const check = validateOutgoing({
    text: msg.text,
    expects_reply: expects,
    hop_count: hop,
    ...(msg.in_reply_to !== undefined ? { in_reply_to: msg.in_reply_to } : {}),
  });
  if (!check.ok) return { ok: false, error: check.error };

  const peer = resolvePeer(botHome, to);
  if (!peer.ok) return { ok: false, error: peer.error };

  const id = uuid();
  const payload: AgentMessage = {
    id,
    ts: now().toISOString(),
    from: botNameFrom(botHome),
    text: msg.text,
    expects_reply: expects,
    hop_count: hop,
    ...(msg.in_reply_to !== undefined ? { in_reply_to: msg.in_reply_to } : {}),
  };

  mkdirSync(peer.inbox, { recursive: true });
  const final = join(peer.inbox, `${id}.json`);
  const tmp = `${final}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, final);
  return { ok: true, id, path: final };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/agent/send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/agent/send.ts cc-plugin/test/engine/agent/send.test.ts
git commit -m "feat(agent): kirim pesan ke inbox tetangga lewat tmp+rename"
```

---

### Task B4: terima — pindai `inbox/` sendiri

**Files:**
- Create: `cc-plugin/src/engine/agent/receive.ts`
- Test: `cc-plugin/test/engine/agent/receive.test.ts`

**Interfaces:**
- Consumes: B1, `inboxDirIn` (A1), `PushMessage` (`sink.ts`)
- Produces:
  ```ts
  export const AGENT_ORIGIN = "agent"
  export function drainInbox(botHome: string, sink: MessageSink, onReject?: (file: string, error: string) => void): number
  export function startInboxScanner(botHome: string, sink: MessageSink, intervalMs?: number): () => void
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drainInbox, AGENT_ORIGIN } from "../../../src/engine/agent/receive";
import { CollectingSink } from "../../../src/engine/sink";
import { inboxDirIn } from "../../../src/engine/paths";

function botWithInbox(): string {
  const home = join(mkdtempSync(join(tmpdir(), "recv-")), "bot-02");
  mkdirSync(inboxDirIn(home), { recursive: true });
  return home;
}

function drop(home: string, name: string, body: unknown): void {
  writeFileSync(join(inboxDirIn(home), name), JSON.stringify(body));
}

const good = {
  id: "u-1", ts: "2026-08-04T22:00:00Z", from: "bot-03",
  text: "kerjakan X", expects_reply: true, hop_count: 1,
};

describe("drainInbox", () => {
  test("mendorong pesan sah ke AI dengan penanda sumber", () => {
    const home = botWithInbox();
    drop(home, "u-1.json", good);
    const sink = new CollectingSink("sess-1");
    expect(drainInbox(home, sink)).toBe(1);
    expect(sink.sent.length).toBe(1);
    expect(sink.sent[0]!.text).toContain("kerjakan X");
    // Penanda sumber adalah SYARAT, bukan fitur: tanpanya reply-guard menuntut
    // balasan ke Telegram dan chat user disemprot tiap dua bot bicara (T-4/W-14).
    expect(sink.sent[0]!.meta.origin).toBe(AGENT_ORIGIN);
    expect(sink.sent[0]!.meta.from_bot).toBe("bot-03");
    expect(sink.sent[0]!.meta.expects_reply).toBe("true");
    expect(sink.sent[0]!.meta.hop_count).toBe("1");
  });

  test("berkas dihapus sesudah dibaca -- tidak diproses dua kali", () => {
    const home = botWithInbox();
    drop(home, "u-1.json", good);
    const sink = new CollectingSink();
    drainInbox(home, sink);
    expect(readdirSync(inboxDirIn(home)).length).toBe(0);
    expect(drainInbox(home, sink)).toBe(0);
  });

  test("berkas .tmp diabaikan -- penulisnya belum selesai", () => {
    const home = botWithInbox();
    writeFileSync(join(inboxDirIn(home), "u-9.json.tmp.123"), "{sedang ditulis");
    const sink = new CollectingSink();
    expect(drainInbox(home, sink)).toBe(0);
    expect(readdirSync(inboxDirIn(home)).length).toBe(1);
  });

  test("payload rusak dilaporkan, tidak mendorong apa pun ke AI", () => {
    const home = botWithInbox();
    writeFileSync(join(inboxDirIn(home), "rusak.json"), "{bukan json");
    const sink = new CollectingSink();
    const rejected: string[] = [];
    expect(drainInbox(home, sink, (f) => rejected.push(f))).toBe(0);
    expect(sink.sent.length).toBe(0);
    expect(rejected).toEqual(["rusak.json"]);
  });

  test("payload yang melanggar aturan balasan ditolak di sisi penerima juga", () => {
    const home = botWithInbox();
    drop(home, "u-2.json", { ...good, in_reply_to: "z" });
    const sink = new CollectingSink();
    expect(drainInbox(home, sink)).toBe(0);
    expect(sink.sent.length).toBe(0);
  });

  test("inbox yang belum ada bukan kesalahan", () => {
    const home = join(mkdtempSync(join(tmpdir(), "recv-")), "bot-02");
    mkdirSync(home, { recursive: true });
    expect(drainInbox(home, new CollectingSink())).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/engine/agent/receive.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Memindai inbox milik bot ini sendiri dan mendorong isinya ke sesi AI.
 *
 * Polling, bukan fs.watch: liputan event "create" milik fs.watch di Windows
 * secara historis tidak bisa diandalkan, dan jalur ini harus andal. Pola yang
 * sama sudah berjalan di cc-wrapper untuk pending/.
 *
 * BERKAS DIHAPUS SEBELUM DIPROSES supaya crash di tengah penanganan tidak
 * memprosesnya dua kali -- juga dari cc-wrapper.
 *
 * `meta.origin` adalah SYARAT, bukan fitur. Tanpanya reply-guard membaca pesan
 * antar-bot sebagai pesan Telegram yang belum dijawab dan menuntut `reply` ke
 * chat user -- pengulangan W-14, dan chat user disemprot tiap dua bot bicara.
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inboxDirIn } from "../paths";
import type { MessageSink } from "../sink";
import { parseAgentMessage } from "./payload";

export const AGENT_ORIGIN = "agent";
export const DEFAULT_SCAN_MS = 500;

export function drainInbox(
  botHome: string,
  sink: MessageSink,
  onReject?: (file: string, error: string) => void
): number {
  const dir = inboxDirIn(botHome);
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    // Belum ada inbox: bukan kesalahan, cuma belum ada yang menitip.
    return 0;
  }

  let delivered = 0;
  for (const f of files) {
    if (!f.endsWith(".json") || f.includes(".tmp.")) continue;
    const path = join(dir, f);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue; // tick lain sudah mengambilnya
    }
    try {
      rmSync(path);
    } catch {
      /* sudah hilang -- tidak apa-apa */
    }

    const parsed = parseAgentMessage(raw);
    if (!parsed.ok) {
      onReject?.(f, parsed.error);
      continue;
    }

    const msg = parsed.msg;
    sink.push({
      type: "push_message",
      text: msg.text,
      meta: {
        origin: AGENT_ORIGIN,
        from_bot: msg.from,
        agent_message_id: msg.id,
        ts: msg.ts,
        expects_reply: String(msg.expects_reply),
        hop_count: String(msg.hop_count),
        ...(msg.in_reply_to !== undefined ? { in_reply_to: msg.in_reply_to } : {}),
        ...(sink.sessionId() !== undefined ? { session_id: sink.sessionId()! } : {}),
      },
    });
    delivered++;
  }
  return delivered;
}

/** Menyalakan pemindai berkala. Mengembalikan fungsi penghenti. */
export function startInboxScanner(
  botHome: string,
  sink: MessageSink,
  intervalMs: number = DEFAULT_SCAN_MS
): () => void {
  const timer = setInterval(() => {
    drainInbox(botHome, sink, (file, error) =>
      console.error(`cc-plugin: payload inbox ditolak (${file}): ${error}`)
    );
  }, intervalMs);
  // unref supaya pemindai tidak menahan proses tetap hidup sendirian.
  timer.unref?.();
  return () => clearInterval(timer);
}
```

Lalu di `engine.ts`, sesudah `sink` dibuat:
```ts
const stopInbox = startInboxScanner(botHome, sink);
```
dan di `close()`, panggil `stopInbox()` **sebelum** `conversationsDb.close()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test test/engine/agent/receive.test.ts && bun test`
Expected: PASS, dan seluruh suite tetap hijau.

- [ ] **Step 5: Commit**

```bash
git add cc-plugin/src/engine/agent/receive.ts cc-plugin/test/engine/agent/receive.test.ts cc-plugin/src/engine/engine.ts
git commit -m "feat(agent): engine memindai inbox miliknya sendiri"
```

---

### Task B5: pesan antar-bot **tidak** memaksa balasan ke Telegram

**Files:**
- Modify: `cc-plugin/src/server.ts`
- Modify: `cc-plugin/hooks/reply-guard.ts`
- Modify: `cc-plugin/test/server.test.ts` (atau berkas test server yang ada)
- Modify: `cc-plugin/test/reply-guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const AGENT_TURN_MARKER = "[protocol: agent-turn]"   // server.ts
  ```
  `hooks/reply-guard.ts` menyimpan **salinan literalnya sendiri** (hanya boleh
  `node:`), dan sebuah test mengunci keduanya identik.

- [ ] **Step 1: Write the failing test**

Di test reply-guard:

```ts
import { AGENT_TURN_MARKER } from "../src/server";
import { analyzeTranscript, decideStop, AGENT_TURN_MARKER as GUARD_MARKER } from "../hooks/reply-guard";

// K-15: dua literal yang harus sama akan menyimpang diam-diam. Hook tidak boleh
// mengimpor dari src/, jadi yang menutup jaraknya adalah test ini.
test("penanda antar-bot di hook identik dengan yang ditulis server", () => {
  expect(GUARD_MARKER).toBe(AGENT_TURN_MARKER);
});

test("pesan antar-bot TIDAK membuat guard menuntut balasan Telegram", () => {
  const lines = [
    JSON.stringify({
      type: "user",
      origin: { server: "plugin:cc-plugin:cc-plugin" },
      message: { content: `${AGENT_TURN_MARKER}\nkerjakan X` },
    }),
  ];
  expect(decideStop(analyzeTranscript(lines), false).block).toBe(false);
});

// Yang paling mudah salah: pesan Telegram yang BELUM dijawab tidak boleh ikut
// terhapus hanya karena sesudahnya datang pesan antar-bot.
test("pesan Telegram yang belum dijawab tetap diblokir meski disusul pesan antar-bot", () => {
  const lines = [
    JSON.stringify({
      type: "user",
      origin: { server: "plugin:cc-plugin:cc-plugin" },
      message: { content: "[protocol: terse-turn]\nhalo" },
    }),
    JSON.stringify({
      type: "user",
      origin: { server: "plugin:cc-plugin:cc-plugin" },
      message: { content: `${AGENT_TURN_MARKER}\ndari bot lain` },
    }),
  ];
  expect(decideStop(analyzeTranscript(lines), false).block).toBe(true);
});
```

Di test server:

```ts
test("push antar-bot memakai penanda agent-turn, bukan terse-turn", () => {
  expect(markerFor({ origin: "agent" })).toBe(AGENT_TURN_MARKER);
  expect(markerFor({})).toBe(TERSE_TURN_MARKER);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/reply-guard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Di `src/server.ts`:

```ts
/**
 * Penanda untuk turn yang dipicu BOT LAIN, bukan Telegram.
 *
 * Ia ada untuk satu alasan mekanis: reply-guard hanya melihat teks transcript,
 * dan `origin.server` untuk pesan antar-bot memuat "cc-plugin" persis seperti
 * pesan Telegram -- penyempitan yang memperbaiki W-14 tidak menolong untuk
 * sumber baru DI DALAM plugin yang sama. Penandanya di teks, karena di situlah
 * guard bisa melihatnya.
 *
 * Batas yang disadari: user bisa mengetik string ini lewat Telegram dan membuat
 * guard diam untuk satu pesan. Sama kelasnya dengan `<channel source=...>` yang
 * sudah bisa dipalsukan sejak semula; konsekuensinya ringan dan dinyatakan di
 * sini alih-alih disembunyikan.
 */
export const AGENT_TURN_MARKER = "[protocol: agent-turn]";

/** Murni, diekspor supaya bisa diuji tanpa menyalakan server MCP. */
export function markerFor(meta: Record<string, string>): string {
  return meta.origin === "agent" ? AGENT_TURN_MARKER : TERSE_TURN_MARKER;
}
```
dan di forwarder: `params: { content: `${markerFor(safeMeta)}\n${msg.text}`, meta: safeMeta }`.

Tambahkan pula ke `SERVER_INSTRUCTIONS` satu paragraf: pesan ber-`agent-turn`
datang dari bot lain, **tidak** boleh dibalas lewat `reply` (itu chat user), dan
kalau `expects_reply` bernilai true jawab lewat `agent_send` dengan
`in_reply_to` diisi `agent_message_id`.

Di `hooks/reply-guard.ts`:

```ts
/**
 * Salinan sengaja dari server.ts. Hook ini hanya boleh mengimpor `node:` (versi
 * pertama session-start.ts mengimpor modul engine dan TIDAK PERNAH MENYALA),
 * jadi yang menutup jarak antara dua literal ini adalah sebuah test, bukan
 * sebuah import.
 */
export const AGENT_TURN_MARKER = "[protocol: agent-turn]";
```
dan di `analyzeTranscript`, di dalam cabang `obj?.type === "user"`, **sebelum**
pemeriksaan `viaOrigin`/`viaTag`:

```ts
const content = textOf(obj?.message?.content);
// Pesan dari bot lain tidak pernah menjadi "inbound yang menunggu jawaban":
// tujuannya bot lain, bukan Telegram. Menghitungnya akan membuat guard menuntut
// `reply` ke chat user setiap kali dua bot berbicara -- pengulangan W-14.
if (content.includes(AGENT_TURN_MARKER)) return;
```
(dan `viaTag` memakai `content` yang sudah dihitung ini, bukan memanggil
`textOf` dua kali).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test`
Expected: PASS, seluruh suite.

- [ ] **Step 5: Mutation check**

Hapus baris `if (content.includes(AGENT_TURN_MARKER)) return;`. **Assert dulu
mutasinya terpasang:** `grep -c "AGENT_TURN_MARKER" hooks/reply-guard.ts` harus
turun tepat satu. Jalankan test — harus MERAH. Kembalikan dari salinan.

- [ ] **Step 6: Commit**

```bash
git add cc-plugin/src/server.ts cc-plugin/hooks/reply-guard.ts cc-plugin/test
git commit -m "feat(agent): penanda sumber -- pesan antar-bot tidak menyemprot chat user"
```

---

### Task B6: tool MCP `agent_send` dan `agent_list`

**Files:**
- Modify: `cc-plugin/src/server.ts`
- Modify: `cc-plugin/src/engine/engine.ts` (permukaan `Engine`)
- Modify: test server

**Interfaces:**
- Produces: pada `Engine`:
  ```ts
  agentSend(to: string, text: string, opts: { expectsReply?: boolean; inReplyTo?: string; hopCount?: number }): SendResult
  agentPeers(): string[]
  ```

- [ ] **Step 1: Write the failing test**

```ts
test("agent_send meneruskan ke engine dan mengembalikan id titipan", async () => {
  const calls: unknown[] = [];
  const backend = fakeEngine({
    agentSend: (to, text, opts) => { calls.push({ to, text, opts }); return { ok: true, id: "u-1", path: "p" }; },
    agentPeers: () => ["bot-01", "bot-03"],
  });
  const res = await callTool(buildServer(backend), "agent_send", { to: "bot-03", text: "halo" });
  expect(calls.length).toBe(1);
  expect(String(res.content[0].text)).toContain("u-1");
});

test("agent_send melaporkan penolakan sebagai error yang bisa dibaca AI", async () => {
  const backend = fakeEngine({
    agentSend: () => ({ ok: false, error: "hop_count 6 melewati batas 5 -- anti-loop guard" }),
    agentPeers: () => [],
  });
  const res = await callTool(buildServer(backend), "agent_send", { to: "bot-03", text: "x", hop_count: 6 });
  expect(res.isError).toBe(true);
  expect(String(res.content[0].text)).toContain("anti-loop");
});

test("agent_list menyebut tetangga yang benar-benar ada", async () => {
  const backend = fakeEngine({ agentSend: () => ({ ok: true, id: "u", path: "p" }), agentPeers: () => ["bot-01"] });
  const res = await callTool(buildServer(backend), "agent_list", {});
  expect(String(res.content[0].text)).toContain("bot-01");
});
```

(Sesuaikan `fakeEngine`/`callTool` dengan helper yang sudah dipakai berkas test
server yang ada — jangan bikin helper baru kalau sudah ada.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cc-plugin && bun test test/server.test.ts`
Expected: FAIL — tool belum terdaftar.

- [ ] **Step 3: Write minimal implementation**

Di `engine.ts`, tambahkan ke objek `Engine` yang dikembalikan:
```ts
agentSend(to, text, opts) {
  return sendToPeer(
    botHome, to,
    { text, expects_reply: opts.expectsReply, in_reply_to: opts.inReplyTo, hop_count: opts.hopCount },
    () => new Date(), () => randomUUID()
  );
},
agentPeers() { return listPeers(botHome); },
```

Di `server.ts`, daftarkan dua tool. Deskripsi `agent_send` harus memuat, dengan
kata-kata untuk AI:
- pesan ini **tidak menyentuh Telegram** dan tidak muncul di HP user;
- `expects_reply: true` hanya sah untuk pesan **baru** — balasan tidak boleh
  menuntut balasan;
- kalau `expects_reply` dipakai, **pasang cron one-shot di sesimu sendiri** dan
  batalkan saat balasan datang; kalau timeout tercapai, **lapor ke user** —
  bot pengirim tidak bisa memutuskan sendiri antara kirim ulang, ganti bot,
  atau batal;
- bila membalas, isi `in_reply_to` dengan `agent_message_id` dari meta pesan
  masuk, dan naikkan `hop_count` satu.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cc-plugin && bun test`
Expected: PASS.

- [ ] **Step 5: Commit + rilis + merge**

```bash
git add cc-plugin/src/server.ts cc-plugin/src/engine/engine.ts cc-plugin/test
git commit -m "feat(agent): tool agent_send dan agent_list"
```

Naikkan versi ke **0.12.0** di dua berkas, perbarui README (satu bagian
"Bicara ke bot lain": alamat = folder tetangga, `ls inbox/` memperlihatkan
antrean), jalankan seluruh suite + type check, lalu merge ke `main` dan push
**kedua repo**.

---

## Yang SENGAJA tidak dibangun

Disalin dari Bagian 4 dokumen keputusan supaya sesi berikutnya tidak
mengusulkannya ulang sebagai penemuan baru:

| Ditolak | Alasan |
|---|---|
| `deadline_at` disimpan di db sebagai cadangan | Over-engineering. Cron di sesi pengirim sudah cukup |
| Cek malas / sapu bersih saat engine boot | Kalau botnya mati, ya sudah |
| Timer di dalam proses engine | Sama |
| Status "menunggu" yang dilacak sistem | Timeout langsung mengadu ke user |
| Tipe pesan `ack-required`/`ack-response` | Tipe beranak dan tiap tipe baru memaksa guard diperbarui; boolean tidak |
| `request-id` sebagai aturan yang harus diingat AI | Beban ingatan; preseden aturan tombol bernomor bocor 3× dalam 2 hari |
| `agent-registry.json` / berkas daftar peer | Folder induk adalah daftarnya |
| Pembersih otomatis `inbox/` bot yang mati | Belum dibahas sebagai kasusnya sendiri — lihat di bawah |

## Yang berhenti dan dicatat

*(Isi bagian ini saat pelaksanaan bila menemukan hal yang tidak bisa diputuskan
tanpa menebak. Kosong bukan berarti tidak ada — berarti belum ditemukan.)*

1. **Siapa membersihkan `inbox/` bila sebuah bot tidak pernah dinyalakan lagi.**
   User sudah menyatakan sikap umumnya (*"kalau bot mati ya sudah"*), tapi
   penumpukan berkas belum pernah dibahas sebagai kasusnya sendiri. Rencana ini
   **tidak membangun pembersih apa pun**. Perlu keputusan user.
2. **Apakah kolom `bot` di tabel `messages` akhirnya dibuang.** K-5 mengambil
   yang reversibel (dibiarkan, filternya yang pergi). Keputusan membuang
   kolomnya tetap milik user.
3. **`cc-wrapper` masih memakai `.claude/channels/pty-controller/pending/`**,
   bukan `inbox/`. Itu benar dan sengaja: `pending/` untuk **perintah ke
   aplikasi** (PTY), `inbox/` untuk **pesan ke AI** (MCP push). Dua pintu, dua
   tujuan. Yang belum diputuskan: apakah `agent-bus` sistem lama akhirnya
   diarahkan ke `inbox/` ini, dan kapan.
