# Penyatuan Engine `fleetd` ke `cc-plugin` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membubarkan daemon `fleetd` dan memindahkan engine-nya ke dalam
`cc-plugin`, sehingga tiap sesi Claude Code menjalankan satu proses yang berisi
poller Telegram + akses database langsung + tool MCP, tanpa socket dan tanpa
proses yang harus dinyalakan lebih dulu.

**Architecture:** Seluruh `fleetd/src/**` kecuali lapisan socket pindah menjadi
`cc-plugin/src/engine/**`. `cc-plugin/src/main.ts` memanggil `startEngine()` yang
mengembalikan objek ber-permukaan **sama persis** dengan `FleetdClient` yang
sekarang (`reply` / `history` / `search` / `onPush` / `close`), sehingga
`server.ts` nyaris tidak berubah dan test-nya tetap berlaku. State tetap terpusat
di `~/.claude/mirza-bots/`; satu-penarik-per-token dijaga file PID di
`~/.claude/mirza-bots/locks/<bot>.pid`.

**Tech Stack:** TypeScript · Bun 1.3.11 · grammy · `bun:sqlite` (WAL) ·
`@modelcontextprotocol/sdk` · zod · `bun test`

**Spec:** `docs/superpowers/specs/2026-08-02-penyatuan-engine-fleetd-design.md`

## Global Constraints

- **Platform: Windows 11 + Bun 1.3.11.** Baseline test saat ini: `fleetd` **145**,
  `cc-plugin` **41**. Angka target di brief lama memakai baseline 69 — usang.
- **JANGAN pakai `expect(...).rejects`** di test yang penyelesaiannya menunggu
  event socket/proses — di Windows matcher itu menggantung tanpa batas. Pakai
  `try/catch` (W-6).
- **JANGAN menulis `config.json`** dalam rangka apa pun tanpa menjalankan ulang
  `icacls <file> /inheritance:r /grant:r "Mirza:(R,W)"` sesudahnya (W-13), dan
  **jangan pernah dengan BOM** (SCAR-026 / W-7).
- **JANGAN blanket-kill proses `bun` yang cocok `src/main.ts`** — command
  line-nya byte-identik dengan proses produksi user. Tangkap PID yang kamu spawn,
  bunuh PID itu saja.
- **JANGAN menyapa `fleetd`/engine sebagai sebuah bot untuk diagnosa** (W-17).
- Tiap commit membawa trailer **`Agent: <bot-name>`** sebelum `Co-Authored-By:`.
- **Dua repo, dua-duanya punya remote dan wajib di-push:** kode `mirza-bots`,
  dokumen `mirza-marketplace`.
- Bahasa komentar kode: **Inggris** (konsisten dengan basis kode yang ada).
  Dokumen dan pesan commit: **Indonesia**.
- Flake pre-existing **W-12** (`no such table: messages_fts`, ~1 dari 25 run
  suite penuh) hilang sendiri begitu Task 7 selesai; sampai itu, ulangi run-nya
  dan jangan dikejar.

---

### Task 1: Pindahkan engine ke `cc-plugin/src/engine/` tanpa mengubah perilaku

Perpindahan mekanis murni. Tidak ada logika yang berubah; kalau ada satu test pun
yang merah, itu kesalahan perpindahan, bukan desain.

**Kenapa harus pindah, bukan di-import lintas folder:** yang dikirim ke
`~/.claude/plugins/cache/mirza-bots/cc-plugin/<versi>/` hanya isi folder
`cc-plugin/`. Kode di `fleetd/` tidak akan pernah ikut terpasang.

**Files:**
- Create: `cc-plugin/src/engine/` (tujuan pemindahan)
- Move: `fleetd/src/config.ts` → `cc-plugin/src/engine/config.ts`
- Move: `fleetd/src/paths.ts` → `cc-plugin/src/engine/paths.ts`
- Move: `fleetd/src/time.ts` → `cc-plugin/src/engine/time.ts`
- Move: `fleetd/src/doctor.ts` → `cc-plugin/src/engine/doctor.ts`
- Move: `fleetd/src/db/conversations-schema.ts` → `cc-plugin/src/engine/db/conversations-schema.ts`
- Move: `fleetd/src/db/fleet-schema.ts` → `cc-plugin/src/engine/db/fleet-schema.ts`
- Move: `fleetd/src/telegram/{poller,media,album-buffer,quote,allowlist}.ts` → `cc-plugin/src/engine/telegram/`
- Move: test padanannya dari `fleetd/test/**` → `cc-plugin/test/engine/**`
- Modify: `cc-plugin/package.json` — tambah dependency `grammy`
- **JANGAN dipindah:** `fleetd/src/socket/**`, `fleetd/src/db/bot-inbox.ts`,
  `fleetd/src/main.ts` — semuanya dibuang di Task 6.

**Interfaces:**
- Consumes: —
- Produces: seluruh export yang tadinya dari `fleetd/src/...` kini dari
  `cc-plugin/src/engine/...` dengan **nama dan tanda tangan identik**.
  `poller.ts` untuk sementara masih meng-import `ConnectionRegistry` dan
  `queueMessage` lewat path relatif ke `fleetd/` — sengaja dibiarkan pincang di
  task ini dan diputus di Task 2.

- [ ] **Step 1: Tambahkan grammy ke `cc-plugin`**

```bash
cd cc-plugin && bun add grammy@^1.45.1
```

- [ ] **Step 2: Pindahkan berkasnya dengan `git mv`**

Pakai `git mv`, bukan copy-lalu-hapus — riwayat tiap berkas harus tetap bisa
ditelusuri (`git log --follow`).

```bash
cd ~/workspace/mirza-bots
mkdir -p cc-plugin/src/engine/db cc-plugin/src/engine/telegram
git mv fleetd/src/config.ts cc-plugin/src/engine/config.ts
git mv fleetd/src/paths.ts cc-plugin/src/engine/paths.ts
git mv fleetd/src/time.ts cc-plugin/src/engine/time.ts
git mv fleetd/src/doctor.ts cc-plugin/src/engine/doctor.ts
git mv fleetd/src/db/conversations-schema.ts cc-plugin/src/engine/db/conversations-schema.ts
git mv fleetd/src/db/fleet-schema.ts cc-plugin/src/engine/db/fleet-schema.ts
git mv fleetd/src/telegram/poller.ts cc-plugin/src/engine/telegram/poller.ts
git mv fleetd/src/telegram/media.ts cc-plugin/src/engine/telegram/media.ts
git mv fleetd/src/telegram/album-buffer.ts cc-plugin/src/engine/telegram/album-buffer.ts
git mv fleetd/src/telegram/quote.ts cc-plugin/src/engine/telegram/quote.ts
git mv fleetd/src/telegram/allowlist.ts cc-plugin/src/engine/telegram/allowlist.ts
```

- [ ] **Step 3: Pindahkan test-nya, cerminkan strukturnya**

```bash
mkdir -p cc-plugin/test/engine/db cc-plugin/test/engine/telegram
git mv fleetd/test/time.test.ts cc-plugin/test/engine/time.test.ts
git mv fleetd/test/telegram/quote.test.ts cc-plugin/test/engine/telegram/quote.test.ts
```

Ulangi untuk setiap berkas test di `fleetd/test/` yang menguji modul yang
dipindah. **Biarkan** test yang menguji `socket/**`, `bot-inbox`, atau
`fleetd/src/main.ts` di tempatnya — semuanya ikut terhapus di Task 6.

- [ ] **Step 4: Perbaiki path import di berkas yang dipindah**

Import antar-modul engine tetap relatif dan tidak berubah bentuknya (mis.
`../config` dari `telegram/poller.ts`). Yang **harus** diperbaiki hanyalah
import yang menunjuk keluar engine, yaitu di `poller.ts`:

```ts
// SEMENTARA -- diputus di Task 2.
import type { ConnectionRegistry } from "../../../../fleetd/src/socket/registry";
import type { PushMessage } from "../../../../fleetd/src/socket/protocol";
import { queueMessage } from "../../../../fleetd/src/db/bot-inbox";
```

- [ ] **Step 5: Jalankan kedua suite**

```bash
cd cc-plugin && bun test
cd ../fleetd && bun test
```

Expected: jumlah total test **sama dengan sebelum pindah** (145 + 41 = 186),
semuanya hijau. Kalau ada yang merah, penyebabnya path import — bukan logika.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: pindahkan engine fleetd ke cc-plugin/src/engine (tanpa ubah perilaku)

Yang dikirim ke cache plugin hanya isi folder cc-plugin/, jadi kode engine
harus tinggal di dalamnya supaya ikut terpasang. Perpindahan mekanis: tidak
ada logika yang berubah, jumlah test tetap 186.

Agent: <bot-name>"
```

---

### Task 2: Ganti `ConnectionRegistry` dengan sink sempit

Ini titik di mana engine berhenti tahu-menahu soal socket. `PollerDeps` sekarang
menuntut `ConnectionRegistry` — kelas yang mengelola N koneksi per bot. Dalam
proses tunggal hanya ada satu tujuan, jadi yang dibutuhkan cuma "kirim ke sana"
dan "sesi mana ini".

Sekaligus membuang fallback antrean offline: `queueMessage` ke `bot_inbox` tidak
punya arti lagi, karena Telegram sendiri yang menahan update sampai 24 jam.

**Files:**
- Create: `cc-plugin/src/engine/sink.ts`
- Create: `cc-plugin/test/engine/sink.test.ts`
- Modify: `cc-plugin/src/engine/telegram/poller.ts` — `PollerDeps`, dan blok
  pengiriman di akhir `handleIncomingMessage`
- Modify: setiap test yang membangun `PollerDeps`

**Interfaces:**
- Consumes: `NormalizedMessage`, `handleIncomingMessage` (Task 1)
- Produces:
  ```ts
  export type PushMessage = { type: "push_message"; text: string; meta: Record<string, string> };
  export interface MessageSink {
    push(msg: PushMessage): void;
    sessionId(): string | undefined;
  }
  export class CollectingSink implements MessageSink { /* test double */
    readonly sent: PushMessage[];
    constructor(sessionId?: string);
    push(msg: PushMessage): void;
    sessionId(): string | undefined;
  }
  ```
  `PollerDeps` menjadi `{ config, conversationsDb, sink, inboxRoot }` — `fleetDb`
  dan `registry` hilang dari tipe itu.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/sink.test.ts
import { expect, test } from "bun:test";
import { CollectingSink } from "../../src/engine/sink";

test("CollectingSink records pushes in order and reports its session id", () => {
  const sink = new CollectingSink("sess-1");
  sink.push({ type: "push_message", text: "satu", meta: {} });
  sink.push({ type: "push_message", text: "dua", meta: {} });

  expect(sink.sent.map((m) => m.text)).toEqual(["satu", "dua"]);
  expect(sink.sessionId()).toBe("sess-1");
});

test("CollectingSink without a session id reports undefined, not the string", () => {
  const sink = new CollectingSink();
  expect(sink.sessionId()).toBeUndefined();
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/sink.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/sink'`

- [ ] **Step 3: Tulis implementasinya**

```ts
// cc-plugin/src/engine/sink.ts

/**
 * One outgoing push, exactly as the MCP notification forwarder consumes it.
 *
 * Moved here from socket/protocol.ts: the shape survived the socket's removal
 * because it was never about the socket -- it is the contract between the poller
 * and whoever hands messages to the AI.
 */
export type PushMessage = { type: "push_message"; text: string; meta: Record<string, string> };

/**
 * Where a stored message goes next.
 *
 * Replaces ConnectionRegistry, which existed to fan one message out to N socket
 * connections per bot. A single process has exactly one destination, so the
 * fan-out -- and with it the "was anyone listening?" boolean that drove the
 * offline queue -- has nothing left to decide.
 */
export interface MessageSink {
  push(msg: PushMessage): void;
  /**
   * The Claude Code session this process belongs to, or undefined when the host
   * did not export one. Stored alongside each row so history can be attributed
   * to a session; read through a method rather than a field so a future
   * implementation can resolve it lazily.
   */
  sessionId(): string | undefined;
}

/** Test double. Keeps every push so assertions can read them back in order. */
export class CollectingSink implements MessageSink {
  readonly sent: PushMessage[] = [];
  constructor(private readonly session?: string) {}
  push(msg: PushMessage): void {
    this.sent.push(msg);
  }
  sessionId(): string | undefined {
    return this.session;
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/sink.test.ts`
Expected: PASS (2 test)

- [ ] **Step 5: Alihkan `poller.ts` ke sink**

Ganti tipe dependensinya:

```ts
// import lama yang menunjuk keluar engine -- hapus ketiganya
// import type { ConnectionRegistry } from "...socket/registry";
// import type { PushMessage } from "...socket/protocol";
// import { queueMessage } from "...db/bot-inbox";
import type { MessageSink, PushMessage } from "../sink";

export type PollerDeps = {
  config: Config;
  conversationsDb: Database;
  sink: MessageSink;
  inboxRoot: string;
};
```

Ganti pembacaan session id:

```ts
const sessionId = deps.sink.sessionId();
```

Ganti blok pengiriman di akhir `handleIncomingMessage` — dari:

```ts
  const delivered = deps.registry.push(msg.bot, pushMsg);
  if (!delivered) {
    queueMessage(deps.fleetDb, msg.bot, pushMsg);
  }

  return true;
```

menjadi:

```ts
  // No "was anyone listening?" branch any more. The poller only runs inside the
  // process that owns this bot's token, so there is always exactly one
  // destination -- and Telegram itself holds undelivered updates for 24 hours,
  // which is what bot_inbox was standing in for.
  deps.sink.push(pushMsg);

  return true;
```

- [ ] **Step 6: Perbarui setiap test yang membangun `PollerDeps`**

Ganti `registry: new ConnectionRegistry()` (dan `fleetDb`) dengan
`sink: new CollectingSink()`. Assertion yang tadinya membaca koneksi palsu kini
membaca `sink.sent`.

- [ ] **Step 7: Jalankan suite `cc-plugin`**

Run: `cd cc-plugin && bun test`
Expected: seluruhnya hijau. Test `bot-inbox`/`registry` di `fleetd/test/` boleh
tetap hijau untuk sementara — keduanya dihapus di Task 6.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(engine): PollerDeps pakai MessageSink, bukan ConnectionRegistry

ConnectionRegistry ada untuk menyebar satu pesan ke N koneksi socket per bot.
Dalam proses tunggal tujuannya cuma satu, jadi fan-out -- berikut boolean
'ada yang mendengarkan?' yang menggerakkan antrean offline -- tidak punya apa
pun lagi untuk diputuskan. bot_inbox ikut lepas: Telegram sendiri menahan
update yang belum diambil sampai 24 jam.

Agent: <bot-name>"
```

---

### Task 3: Kunci satu-penarik-per-token

Menjaga satu kasus, dan hanya satu: **satu bot, dua penarik**. Enam bot dengan
enam token berbeda tidak pernah bertabrakan (spec §3), jadi kunci ini bercakupan
per bot, bukan per mesin.

**Files:**
- Create: `cc-plugin/src/engine/lock.ts`
- Create: `cc-plugin/test/engine/lock.test.ts`
- Modify: `cc-plugin/src/engine/paths.ts` — tambah `locksDir()` dan `lockPath()`,
  dan sertakan `locks` di `ensureStateDirs()`

**Interfaces:**
- Consumes: `stateRoot()` (Task 1)
- Produces:
  ```ts
  // paths.ts
  export function locksDir(): string;
  export function lockPath(bot: string): string;

  // lock.ts
  export type LockDeps = {
    isAlive: (pid: number) => boolean;
    terminate: (pid: number) => void;
  };
  export type AcquireResult = { previousPid: number | null };
  export function acquireBotLock(
    path: string,
    pid: number,
    deps?: Partial<LockDeps>
  ): AcquireResult;
  export function releaseBotLock(path: string, pid: number): void;
  ```

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/lock.test.ts
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireBotLock, releaseBotLock } from "../../src/engine/lock";

function tmpLock(): string {
  return join(mkdtempSync(join(tmpdir(), "lock-")), "bot-01.pid");
}

test("writes our pid when no holder exists", () => {
  const path = tmpLock();
  const res = acquireBotLock(path, 4242, { isAlive: () => false, terminate: () => {} });

  expect(res.previousPid).toBeNull();
  expect(readFileSync(path, "utf8")).toBe("4242");
});

test("takes over from a live holder and terminates it", () => {
  const path = tmpLock();
  writeFileSync(path, "1111");
  const killed: number[] = [];

  const res = acquireBotLock(path, 4242, {
    isAlive: (pid) => pid === 1111,
    terminate: (pid) => killed.push(pid),
  });

  expect(res.previousPid).toBe(1111);
  expect(killed).toEqual([1111]);
  expect(readFileSync(path, "utf8")).toBe("4242");
});

test("a stale pid is replaced without terminating anything", () => {
  const path = tmpLock();
  writeFileSync(path, "1111");
  const killed: number[] = [];

  const res = acquireBotLock(path, 4242, {
    isAlive: () => false,
    terminate: (pid) => killed.push(pid),
  });

  expect(res.previousPid).toBeNull();
  expect(killed).toEqual([]);
  expect(readFileSync(path, "utf8")).toBe("4242");
});

// Load bearing: without this guard a restart in the same process would signal
// itself and take down the very poller it is trying to start.
test("never terminates our own pid", () => {
  const path = tmpLock();
  writeFileSync(path, "4242");
  const killed: number[] = [];

  const res = acquireBotLock(path, 4242, {
    isAlive: () => true,
    terminate: (pid) => killed.push(pid),
  });

  expect(res.previousPid).toBeNull();
  expect(killed).toEqual([]);
});

// A corrupt lock file must not stop the bot from starting -- an unreadable
// guard is worse than no guard, because it fails closed on the wrong thing.
test("a garbage lock file is overwritten, not fatal", () => {
  const path = tmpLock();
  writeFileSync(path, "not-a-number");

  const res = acquireBotLock(path, 4242, { isAlive: () => true, terminate: () => {} });

  expect(res.previousPid).toBeNull();
  expect(readFileSync(path, "utf8")).toBe("4242");
});

test("release removes the file only when we still own it", () => {
  const path = tmpLock();
  writeFileSync(path, "9999");
  releaseBotLock(path, 4242);
  expect(existsSync(path)).toBe(true);

  writeFileSync(path, "4242");
  releaseBotLock(path, 4242);
  expect(existsSync(path)).toBe(false);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/lock.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/lock'`

- [ ] **Step 3: Tulis implementasinya**

```ts
// cc-plugin/src/engine/lock.ts
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Guards the one rule Telegram will not bend: a single getUpdates consumer per
 * token. Two pollers on one token do not error loudly -- they split the user's
 * messages between them at random, which reads as "the bot sometimes listens".
 *
 * Scope is deliberately one bot, not the machine. Six bots with six different
 * tokens never contend; only two holders of the SAME token do.
 *
 * The whole mechanic is lifted from the old system
 * (mirza-marketplace/plugins/telegram/server.ts:99-120), where it has been
 * running in production for months. What changed is only where the file lives:
 * centralised under the fleet's state root instead of scattered per bot folder.
 */
export type LockDeps = {
  isAlive: (pid: number) => boolean;
  terminate: (pid: number) => void;
};

export type AcquireResult = {
  /** The live holder we displaced, or null when there was nothing to displace. */
  previousPid: number | null;
};

function defaultIsAlive(pid: number): boolean {
  try {
    // Signal 0 performs the permission/existence check without delivering
    // anything. Throws when the process is gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function defaultTerminate(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Gone between the liveness check and here -- exactly the outcome we wanted.
  }
}

export function acquireBotLock(
  path: string,
  pid: number,
  deps: Partial<LockDeps> = {}
): AcquireResult {
  const isAlive = deps.isAlive ?? defaultIsAlive;
  const terminate = deps.terminate ?? defaultTerminate;

  let previousPid: number | null = null;
  try {
    const held = parseInt(readFileSync(path, "utf8").trim(), 10);
    // `held !== pid` is load bearing: signalling ourselves would kill the poller
    // we are in the middle of starting.
    if (Number.isInteger(held) && held > 1 && held !== pid && isAlive(held)) {
      terminate(held);
      previousPid = held;
    }
  } catch {
    // Missing or unreadable file: nothing holds the token as far as we can tell.
    // Refusing to start over an unparseable guard would fail closed on the wrong
    // thing -- the guard exists to protect polling, not to gate it.
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(pid));
  return { previousPid };
}

/**
 * Drops the lock, but only if it is still ours: a newer process may already have
 * taken over, and deleting its claim would leave the token unguarded.
 */
export function releaseBotLock(path: string, pid: number): void {
  try {
    const held = parseInt(readFileSync(path, "utf8").trim(), 10);
    if (held === pid) unlinkSync(path);
  } catch {
    // Already gone, or never ours to remove.
  }
}
```

- [ ] **Step 4: Tambahkan path-nya**

```ts
// cc-plugin/src/engine/paths.ts -- tambahkan
export function locksDir(): string {
  return join(stateRoot(), "locks");
}

export function lockPath(bot: string): string {
  return join(locksDir(), `${bot}.pid`);
}
```

dan sertakan `locksDir()` di daftar direktori `ensureStateDirs()`:

```ts
  for (const dir of [root, join(root, "inbox"), logsDir(), locksDir()]) {
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/lock.test.ts`
Expected: PASS (6 test)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): kunci satu-penarik-per-token di locks/<bot>.pid

Ongkos yang lahir dari membubarkan daemon: dulu satu proses berarti satu
penarik secara otomatis; sekarang tiap sesi membawa poller sendiri.
Mekaniknya diangkat dari sistem lama (plugins/telegram/server.ts:99-120),
yang sudah menjalankannya di produksi berbulan-bulan -- yang berubah cuma
lokasi filenya: terpusat, bukan tersebar per folder bot.

Agent: <bot-name>"
```

---

### Task 4: Identitas bot + kegagalan yang terdengar

`resolveBotByCwd` sekarang terkubur di `socket/server.ts` dan hanya bisa
menjawab `null`. Dalam desain baru, jawabannya harus bisa **dibaca manusia**:
inilah yang menutup sisa W-16.

**Files:**
- Create: `cc-plugin/src/engine/identity.ts`
- Create: `cc-plugin/test/engine/identity.test.ts`
- Modify: `fleetd/src/socket/server.ts` — hapus `resolveBotByCwd` lokalnya,
  import dari engine (sementara; seluruh berkas dibuang di Task 6)

**Interfaces:**
- Consumes: `Config` (Task 1)
- Produces:
  ```ts
  export type IdentityResult =
    | { ok: true; bot: string }
    | { ok: false; message: string };
  export function resolveBotByCwd(config: Config, cwd: string): IdentityResult;
  ```

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/identity.test.ts
import { expect, test } from "bun:test";
import { resolveBotByCwd } from "../../src/engine/identity";
import type { Config } from "../../src/engine/config";

const config: Config = {
  allowFrom: ["1"],
  bots: {
    "bot-01": { home: "C:\\Users\\Mirza\\workspace\\bot-01", token: "t1" },
    "bot-02": { home: "C:\\Users\\Mirza\\workspace\\bot-02", token: "t2" },
  },
};

test("resolves the bot whose home matches the cwd", () => {
  const res = resolveBotByCwd(config, "C:\\Users\\Mirza\\workspace\\bot-02");
  expect(res).toEqual({ ok: true, bot: "bot-02" });
});

// The whole point of W-16: an unknown cwd used to produce silence. It must now
// produce a sentence a human can act on, and that sentence must name the
// alternatives -- a refusal that does not teach the correct alternative gets
// answered with the same wrong attempt.
test("an unknown cwd explains itself and lists the registered bots", () => {
  const res = resolveBotByCwd(config, "C:\\Users\\Mirza\\workspace\\bot-99");

  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("expected failure");
  expect(res.message).toContain("bot-99");
  expect(res.message).toContain("bot-01");
  expect(res.message).toContain("bot-02");
});

test("an empty bots map still explains itself", () => {
  const res = resolveBotByCwd({ allowFrom: [], bots: {} }, "C:\\anywhere");

  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("expected failure");
  expect(res.message).toContain("no bots");
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/identity.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/identity'`

- [ ] **Step 3: Tulis implementasinya**

```ts
// cc-plugin/src/engine/identity.ts
import type { Config } from "./config";

export type IdentityResult = { ok: true; bot: string } | { ok: false; message: string };

/**
 * Answers "which bot am I?" from the session's project directory.
 *
 * Returns a sentence rather than null on failure. That difference IS the fix for
 * W-16: the old path rejected an unknown cwd over the socket, cc-plugin's
 * top-level `await connect()` threw, the process exited, and nothing reached the
 * user at all -- roughly two hours were spent on 2026-08-01 chasing a plugin
 * that was simply not there.
 *
 * The message names the registered bots because a refusal that does not teach
 * the correct alternative gets answered with the same wrong attempt.
 */
export function resolveBotByCwd(config: Config, cwd: string): IdentityResult {
  for (const [name, bot] of Object.entries(config.bots)) {
    if (bot.home === cwd) return { ok: true, bot: name };
  }

  const names = Object.keys(config.bots);
  const known =
    names.length === 0
      ? "no bots are registered in config.json at all"
      : `registered bots: ${names.join(", ")}`;

  return {
    ok: false,
    message:
      `This directory (${cwd}) is not the home of any bot in config.json, so this ` +
      `session has no Telegram identity and will not poll. ${known}. Fix it by ` +
      `adding an entry whose "home" is exactly this path, then restart the session.`,
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/identity.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Buat `socket/server.ts` memakai yang baru**

Hapus fungsi `resolveBotByCwd` lokal di `fleetd/src/socket/server.ts:14-19`,
import dari engine, dan sesuaikan pemanggilnya di `:66`:

```ts
import { resolveBotByCwd } from "../../../cc-plugin/src/engine/identity";
// ...
          const identity = resolveBotByCwd(config, req.cwd);
          const bot = identity.ok ? identity.bot : null;
```

Ini jembatan sementara supaya suite `fleetd` tetap hijau sampai Task 6
membuang berkasnya.

- [ ] **Step 6: Jalankan kedua suite**

```bash
cd cc-plugin && bun test
cd ../fleetd && bun test
```

Expected: dua-duanya hijau.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): identitas bot dari cwd menjawab dengan kalimat, bukan null

Sisa W-16 yang tidak ikut hilang bersama socket: cwd yang tidak terdaftar.
Dulu itu berakhir sebagai proses yang lenyap tanpa satu pesan pun -- dua jam
pada 2026-08-01 dihabiskan mengejar plugin yang memang tidak ada. Sekarang ia
menyebutkan cwd-nya, menyebut bot yang terdaftar, dan menyebut cara
memperbaikinya.

Agent: <bot-name>"
```

---

### Task 5: `startEngine()` — perakit

Satu tempat yang merakit config + database + satu bot + poller + kunci, dan
mengekspos permukaan yang **sama persis** dengan `FleetdClient` sekarang. Itu
yang membuat `server.ts` nyaris tidak berubah di Task 6.

**Penting: satu proses memoll SATU bot**, bukan semua bot di config. Ini
perbedaan terbesar terhadap `fleetd/src/main.ts`, yang mengiterasi
`config.bots` seluruhnya.

**Files:**
- Create: `cc-plugin/src/engine/engine.ts`
- Create: `cc-plugin/test/engine/engine.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `openConversationsDb`, `openFleetDb`, `ensureStateDirs`,
  `configPath`, `conversationsDbPath`, `fleetDbPath`, `stateRoot`, `lockPath`
  (Task 1/4), `acquireBotLock`, `releaseBotLock` (Task 3), `resolveBotByCwd`
  (Task 4), `MessageSink`, `PushMessage` (Task 2), `handleIncomingMessage`,
  `startPolling`, `NormalizedMessage` (Task 1), dan fungsi yang dipindah dari
  `fleetd/src/main.ts`: `normalizeMessage`, `buildAlbumMessage`,
  `buildTappedMessageEdit`, `findMissingButtonNarration`, `handleHistoryRequest`,
  `handleSearchRequest`
- Produces:
  ```ts
  export type Engine = {
    bot: string;
    reply(text: string, buttons?: ButtonRow[]): Promise<void>;
    history(opts: { messageId: string; before?: number; after?: number; bot?: string }): Promise<HistoryMessage[]>;
    search(opts: { query: string; limit?: number; bot?: string }): Promise<HistoryMessage[]>;
    onPush(handler: (msg: PushMessage) => void): void;
    close(): void;
  };
  export type EngineStart = { ok: true; engine: Engine } | { ok: false; message: string };
  export function startEngine(cwd: string, sessionId?: string): EngineStart;
  ```
  `ButtonRow` dan `HistoryMessage` dipindah apa adanya dari
  `cc-plugin/src/fleetd-client.ts` ke `engine.ts` — tanda tangannya tidak
  berubah, jadi `server.ts` tidak perlu tahu bedanya.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/engine.test.ts
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEngine } from "../../src/engine/engine";

function fixtureHome(bots: Record<string, { home: string; token: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "engine-"));
  mkdirSync(join(root, "inbox"), { recursive: true });
  writeFileSync(
    join(root, "config.json"),
    JSON.stringify({ allowFrom: ["1"], bots }),
    "utf8" // never with a BOM -- SCAR-026
  );
  return root;
}

test("refuses to start for a cwd that is not any bot's home, with a readable reason", () => {
  const root = fixtureHome({ "bot-01": { home: "C:\\elsewhere", token: "t" } });
  process.env.MIRZA_BOTS_HOME = root;

  const res = startEngine("C:\\not-a-bot");

  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("expected failure");
  expect(res.message).toContain("bot-01");
});

test("a broken config produces a readable reason instead of a throw", () => {
  const root = mkdtempSync(join(tmpdir(), "engine-"));
  writeFileSync(join(root, "config.json"), "{ this is not json", "utf8");
  process.env.MIRZA_BOTS_HOME = root;

  const res = startEngine("C:\\anything");

  expect(res.ok).toBe(false);
  if (res.ok) throw new Error("expected failure");
  expect(res.message.toLowerCase()).toContain("config");
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/engine.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/engine'`

- [ ] **Step 3: Pindahkan fungsi murni dari `fleetd/src/main.ts`**

`git mv` tidak bisa memindahkan sebagian berkas, jadi pindahkan isinya:
`normalizeMessage`, `buildAlbumMessage`, `buildTappedMessageEdit`,
`findMissingButtonNarration`, `buildInlineKeyboard`, `handleHistoryRequest`,
`handleSearchRequest`, `deliverIncoming`, `makeBot`, `apiRoot`, `fileUrl` — semua
beserta **komentar-komentarnya utuh** (di dalamnya ada alasan U-5, SCAR-055a, dan
pelajaran keyboard yang tidak boleh hilang).

Taruh di `cc-plugin/src/engine/messages.ts`, dan pindahkan test padanannya dari
`fleetd/test/main.test.ts` ke `cc-plugin/test/engine/messages.test.ts`.

`handleHistoryRequest`/`handleSearchRequest` sekarang menerima nama bot langsung,
bukan `conn`:

```ts
export function handleHistoryRequest(
  req: { messageId: string; before?: number; after?: number; bot?: string },
  ownBot: string,
  config: Config,
  db: Database
): { ok: true; messages: HistoryMessage[] } | { ok: false; error: string }
```

- [ ] **Step 4: Tulis `engine.ts`**

```ts
// cc-plugin/src/engine/engine.ts
import { ensureStateDirs, configPath, conversationsDbPath, fleetDbPath, stateRoot, lockPath } from "./paths";
import { loadConfig } from "./config";
import { resolveBotByCwd } from "./identity";
import { acquireBotLock, releaseBotLock } from "./lock";
import { openConversationsDb } from "./db/conversations-schema";
import { openFleetDb } from "./db/fleet-schema";
import type { MessageSink, PushMessage } from "./sink";

/**
 * Assembles one bot's engine inside the calling process.
 *
 * Two things differ from the daemon this replaces:
 *  - it polls exactly ONE bot -- the one whose home is this session's cwd --
 *    rather than iterating every entry in config.bots;
 *  - every failure is returned as a sentence, never thrown. A thrown startup
 *    error is what made cc-plugin vanish silently (W-16), and the whole point of
 *    this rewrite is that the plugin stays alive and says why.
 */
export function startEngine(cwd: string, sessionId?: string): EngineStart {
  let config;
  try {
    ensureStateDirs();
    config = loadConfig(configPath());
  } catch (err) {
    return { ok: false, message: `Cannot read the fleet config: ${(err as Error).message}` };
  }

  const identity = resolveBotByCwd(config, cwd);
  if (!identity.ok) return { ok: false, message: identity.message };
  const botName = identity.bot;

  const takeover = acquireBotLock(lockPath(botName), process.pid, {});
  if (takeover.previousPid !== null) {
    console.error(
      `cc-plugin: took the ${botName} token over from pid ${takeover.previousPid}; ` +
        `that session stops receiving Telegram messages.`
    );
  }

  const conversationsDb = openConversationsDb(conversationsDbPath());
  const fleetDb = openFleetDb(fleetDbPath());

  // The sink is filled in by onPush(). Until the MCP forwarder registers one,
  // messages are held here rather than dropped -- polling starts before the
  // server finishes connecting, and losing that window would look exactly like
  // the bot ignoring the first message after startup.
  const buffered: PushMessage[] = [];
  let handler: ((msg: PushMessage) => void) | undefined;
  const sink: MessageSink = {
    push: (msg) => (handler ? handler(msg) : buffered.push(msg)),
    sessionId: () => sessionId,
  };

  const botConfig = config.bots[botName]!;
  const bot = makeBot(botConfig.token);
  const deps: PollerDeps = { config, conversationsDb, sink, inboxRoot: stateRoot() };

  // Tracks the chat `reply` answers. Written ONLY by deliverIncoming, strictly
  // after the allowlist gate accepted the message -- writing it before the gate
  // let a non-allowlisted stranger become the target of the AI's next reply.
  const lastChatByBot = new Map<string, string>();
  const deliver = (msg: NormalizedMessage) => deliverIncoming(msg, deps, lastChatByBot);

  // Pindahkan enam blok ini dari fleetd/src/main.ts APA ADANYA, hanya dengan
  // `botName`/`botConfig` yang sudah ditentukan di atas alih-alih variabel loop:
  //   - AlbumBuffer + onFlush                 (:364-391)
  //   - bot.on("message:text")                (:393-413)
  //   - bot.on("message:photo")               (:415-448)
  //   - bot.on("message:document")            (:450-495)
  //   - bot.on("callback_query:data")         (:497-540)
  //   - bot.on("callback_query")  safety net  (:542-548)
  //   - startPolling(...)                     (:550-556)
  // Komentar di dalamnya ikut dipindahkan utuh: di situ tersimpan alasan
  // answerCallbackQuery harus pertama, kenapa edit keyboard harus terakhir, dan
  // kenapa onFlush punya try/catch sendiri.

  return {
    ok: true,
    engine: {
      bot: botName,
      // Dipindah dari main.ts:569-595. Gerbang narasi HARUS mendahului
      // sendMessage: penolakan yang datang belakangan meninggalkan jejak di
      // layar user yang tidak bisa ditarik lagi.
      reply: async (text, buttons) => {
        const chatId = lastChatByBot.get(botName);
        if (!chatId) throw new Error("no_known_chat: this bot has not received a message yet");
        const unnarrated = findMissingButtonNarration(text, buttons);
        if (unnarrated) throw new Error(unnarrated);
        const replyMarkup = buttons ? buildInlineKeyboard(buttons) : undefined;
        // Telegram rejects sends for reasons outside our control (429, blocked
        // by the user, text over 4096 chars). Surface it as a thrown Error so
        // the tool call fails loudly instead of reporting a send that never
        // happened.
        await bot.api.sendMessage(
          chatId,
          text,
          replyMarkup ? { reply_markup: replyMarkup } : undefined
        );
      },
      history: async (opts) => {
        const res = handleHistoryRequest(opts, botName, config, conversationsDb);
        if (!res.ok) throw new Error(res.error);
        return res.messages;
      },
      search: async (opts) => {
        const res = handleSearchRequest(opts, botName, config, conversationsDb);
        if (!res.ok) throw new Error(res.error);
        return res.messages;
      },
      onPush: (fn) => {
        handler = fn;
        while (buffered.length > 0) fn(buffered.shift()!);
      },
      close: () => {
        releaseBotLock(lockPath(botName), process.pid);
        conversationsDb.close();
        fleetDb.close();
      },
    },
  };
}
```

Perhatikan perubahan bentuk galat: `reply`/`history`/`search` **melempar
`Error`** alih-alih mengembalikan `{ ok: false, error }`. Pemanggilnya kini
`await` biasa, bukan protokol baris-JSON yang harus selalu membalas satu baris.
Itu juga yang membuat `server.ts` tidak perlu berubah — tool MCP sudah
menerjemahkan promise yang reject menjadi pesan galat untuk AI.

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/engine.test.ts`
Expected: PASS (2 test)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(engine): startEngine merakit satu bot di dalam proses pemanggil

Dua beda pokok dari daemon yang digantikannya: ia memoll SATU bot -- yang
home-nya adalah cwd sesi ini -- bukan seluruh config.bots; dan tiap kegagalan
dikembalikan sebagai kalimat, tidak pernah dilempar. Startup error yang
dilempar itulah yang membuat cc-plugin lenyap tanpa suara (W-16).

Permukaannya sengaja dibuat sama persis dengan FleetdClient supaya server.ts
tidak perlu tahu bedanya.

Agent: <bot-name>"
```

---

### Task 6: Sambungkan `cc-plugin`, buang socket dan daemon

Task pembongkaran. Setelah ini `fleetd/` tidak ada lagi.

**Files:**
- Modify: `cc-plugin/src/main.ts`
- Modify: `cc-plugin/src/server.ts` — hanya tipe parameternya
- Delete: `cc-plugin/src/fleetd-client.ts` (178)
- Delete: `fleetd/src/socket/protocol.ts` (115), `server.ts` (133), `registry.ts` (44)
- Delete: `fleetd/src/db/bot-inbox.ts` (24)
- Delete: `fleetd/src/main.ts` (sisa setelah Task 5)
- Delete: `fleetd/test/**` yang menguji berkas di atas
- Delete: `fleetd/` seluruhnya bila sudah kosong

**Interfaces:**
- Consumes: `startEngine` (Task 5)
- Produces: `buildServer(engine: Engine)` — nama fungsi dan perilakunya tidak
  berubah; hanya nama tipe parameternya (`FleetdClient` → `Engine`).

- [ ] **Step 1: Tulis ulang `cc-plugin/src/main.ts`**

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startEngine } from "./engine/engine";
import { buildServer } from "./server";

// Claude Code sets CLAUDE_PROJECT_DIR for MCP servers precisely so they can
// resolve the session's project directory without depending on the process's
// working directory (which an MCP stdio server does not control).
export function resolveIdentityCwd(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

export function resolveSessionId(): string | undefined {
  const id = process.env.CLAUDE_CODE_SESSION_ID;
  return id && id.length > 0 ? id : undefined;
}

export async function main(): Promise<void> {
  const started = startEngine(resolveIdentityCwd(), resolveSessionId());
  if (!started.ok) {
    // Deliberately NOT an exit. A plugin that dies here is indistinguishable
    // from a plugin that was never installed, which is exactly what cost two
    // hours on 2026-08-01 (W-16). Serve the tools anyway so the reason reaches
    // whoever calls one.
    console.error(`cc-plugin: ${started.message}`);
    const server = buildServer({ kind: "unavailable", reason: started.message });
    await server.connect(new StdioServerTransport());
    return;
  }

  console.error(`cc-plugin: engine running for bot "${started.engine.bot}"`);
  const server = buildServer(started.engine);
  await server.connect(new StdioServerTransport());
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`cc-plugin: fatal startup error: ${err}`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Tulis test untuk mode `unavailable`**

```ts
// cc-plugin/test/server-unavailable.test.ts
import { expect, test } from "bun:test";
import { buildServer } from "../src/server";

test("an unavailable engine still builds a server, and every tool explains why", async () => {
  const server = buildServer({ kind: "unavailable", reason: "config.json has no bot for this folder" });
  expect(server).toBeDefined();
});
```

- [ ] **Step 3: Ubah `server.ts` menerima keduanya**

```ts
import type { Engine } from "./engine/engine";

export type Unavailable = { kind: "unavailable"; reason: string };
export type ServerBackend = Engine | Unavailable;

function isUnavailable(b: ServerBackend): b is Unavailable {
  return (b as Unavailable).kind === "unavailable";
}

export function buildServer(backend: ServerBackend): McpServer {
```

Di tiap handler tool, dahului dengan:

```ts
      if (isUnavailable(backend)) {
        return { content: [{ type: "text", text: `Telegram is not available: ${backend.reason}` }], isError: true };
      }
```

dan bungkus `backend.onPush(...)` di akhir dengan `if (!isUnavailable(backend))`.

- [ ] **Step 4: Jalankan suite `cc-plugin`, pastikan hijau**

Run: `cd cc-plugin && bun test`
Expected: seluruhnya hijau.

- [ ] **Step 5: Hapus lapisan socket dan sisa `fleetd/`**

```bash
cd ~/workspace/mirza-bots
git rm cc-plugin/src/fleetd-client.ts
git rm -r fleetd/src/socket
git rm fleetd/src/db/bot-inbox.ts
git rm fleetd/src/main.ts
git rm -r fleetd/test
git rm fleetd/package.json fleetd/bun.lock
```

Berkas test `cc-plugin/test/fleetd-client.test.ts` (bila ada) ikut dihapus.

- [ ] **Step 6: Jalankan suite lengkap**

Run: `cd cc-plugin && bun test`
Expected: hijau. Catat angka barunya — ini baseline pengganti 145 + 41.
**Kalau angkanya turun lebih banyak daripada jumlah test yang sengaja dihapus,
ada test yang hilang tanpa disengaja.** Hitung selisihnya sebelum lanjut.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat!: bubarkan daemon fleetd -- engine jalan di dalam cc-plugin

Menghapus seluruh lapisan socket (protocol/server/registry, 292 baris),
client-nya di cc-plugin (178), dan antrean offline bot_inbox (24). Yang
menggantikan bukan mekanisme baru: satu proses per sesi, memoll bot yang
home-nya cwd sesi itu, persis pola yang sudah dijalankan plugin telegram lama
di enam bot selama berbulan-bulan.

Kegagalan startup tidak lagi mematikan plugin: mode unavailable tetap
menyajikan tool, dan tiap panggilan menjawab dengan alasannya. Itu W-16.

Ikut gugur: W-3 (batas panjang path socket) dan W-12 (flake e2e dua proses).

Agent: <bot-name>"
```

---

### Task 7: `busy_timeout` untuk database yang dibuka banyak proses

Dulu hanya `fleetd` yang membuka kedua database. Sekarang sampai enam proses
sekaligus.

**Files:**
- Modify: `cc-plugin/src/engine/db/conversations-schema.ts:68`
- Modify: `cc-plugin/src/engine/db/fleet-schema.ts:69`
- Create: `cc-plugin/test/engine/db/busy-timeout.test.ts`

**Interfaces:**
- Consumes: `openConversationsDb`, `openFleetDb` (Task 1)
- Produces: keduanya menyetel `busy_timeout` = 5000 ms; tanda tangan tidak
  berubah.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// cc-plugin/test/engine/db/busy-timeout.test.ts
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openConversationsDb } from "../../../src/engine/db/conversations-schema";
import { openFleetDb } from "../../../src/engine/db/fleet-schema";

// WAL lets readers and writers work in parallel, but two WRITERS still take
// turns. Without a busy timeout the loser gives up immediately with
// SQLITE_BUSY instead of waiting -- which surfaces as a random failure that is
// very hard to trace back to concurrency.
test("conversations db waits instead of giving up when another writer holds the lock", () => {
  const db = openConversationsDb(join(mkdtempSync(join(tmpdir(), "db-")), "c.db"));
  expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
  db.close();
});

test("fleet db waits too", () => {
  const db = openFleetDb(join(mkdtempSync(join(tmpdir(), "db-")), "f.db"));
  expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
  db.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/db/busy-timeout.test.ts`
Expected: FAIL — nilainya `0`, bukan `5000`.

- [ ] **Step 3: Tambahkan pragma-nya**

Di kedua berkas, tepat setelah baris `journal_mode`:

```ts
  db.exec("PRAGMA journal_mode = WAL;");
  // WAL already lets readers and writers run in parallel, but two writers still
  // serialise. Six sessions now open these files instead of one daemon, so the
  // loser of a write race must WAIT rather than fail -- SQLITE_BUSY surfaces as
  // a random, hard-to-trace error at the call site.
  db.exec("PRAGMA busy_timeout = 5000;");
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test test/engine/db/busy-timeout.test.ts`
Expected: PASS (2 test)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(engine): busy_timeout 5s -- database kini dibuka banyak proses

WAL sudah menangani baca-tulis paralel, tapi dua PENULIS tetap bergantian.
Dulu cuma fleetd yang membuka kedua berkas; sekarang sampai enam sesi. Tanpa
timeout, penulis yang kalah langsung menyerah dengan SQLITE_BUSY -- galat acak
yang sangat sulit dilacak balik ke konkurensi.

Agent: <bot-name>"
```

---

### Task 8: `doctor` jadi perkakas `cc-plugin`

`bun run doctor` sekarang milik `fleetd/package.json`, yang dihapus di Task 6.

**Files:**
- Move: `fleetd/bin/fleetd-doctor.ts` → `cc-plugin/bin/doctor.ts`
- Modify: `cc-plugin/src/engine/doctor.ts` — buang parameter `sockPath`
- Modify: `cc-plugin/package.json` — script `doctor`
- Modify: test doctor yang ada

**Interfaces:**
- Consumes: `buildDoctorReport` (Task 1)
- Produces: `buildDoctorReport(config, fleetDb, conversationsDb, version)` —
  parameter `sockPath` hilang; laporan memuat daftar `locks/<bot>.pid` berikut
  hidup/tidaknya PID di dalamnya, menggantikan status socket.

- [ ] **Step 1: Baca bentuk laporannya sekarang**

Run: `cat cc-plugin/src/engine/doctor.ts`

- [ ] **Step 2: Ubah test doctor lebih dulu**

Ganti assertion soal socket dengan assertion soal kunci: laporan menyebut tiap
bot di config berikut apakah kuncinya dipegang proses yang hidup.

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd cc-plugin && bun test test/engine/doctor.test.ts`
Expected: FAIL

- [ ] **Step 4: Sesuaikan `doctor.ts` dan `bin/doctor.ts`**

- [ ] **Step 5: Tambahkan script-nya**

```json
  "scripts": {
    "start": "bun run src/main.ts",
    "doctor": "bun run bin/doctor.ts"
  }
```

- [ ] **Step 6: Jalankan test, pastikan lulus**

Run: `cd cc-plugin && bun test`
Expected: hijau.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(doctor): pindah ke cc-plugin, status socket diganti status kunci

Agent: <bot-name>"
```

---

### Task 9: Dokumen, versi, dan verifikasi hidup

**Files:**
- Modify: `mirza-bots/README.md`
- Modify: `cc-plugin/.claude-plugin/plugin.json` + `cc-plugin/package.json` — 0.4.0
- Modify: `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md`

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: `cc-plugin` 0.4.0 terpasang dan terverifikasi hidup.

- [ ] **Step 1: Perbarui README**

Buang seluruh bagian "Cara menjalankan `fleetd`" dan syarat "`fleetd` sudah jalan
lebih dulu". Tambahkan bagian kunci `locks/` dan perilaku ambil-alih. Pertahankan
prosedur update tiga langkah di `:211-233` **apa adanya** — W-18 membuktikan
prosedur itu masih menggigit, dan tambahkan satu kalimat bahwa sesi yang sedang
berjalan tetap memakai versi lama sampai dibuka ulang.

- [ ] **Step 2: Naikkan versi ke 0.4.0 di dua berkas**

`plugin.json` **dan** `package.json` — README `:218-220` memperingatkan bahwa
tanpa kenaikan versi, `update` tidak melihat ada yang perlu diambil.

- [ ] **Step 3: Perbarui BACKLOG**

Blok "Kondisi sekarang": versi, angka test baru, spec aktif. Tandai **W-3** dan
**W-12** gugur, dan **W-16** selesai lewat Task 4 + Task 6.

- [ ] **Step 4: Pasang dan restart**

```bash
claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
claude plugin list | grep -A 2 cc-plugin
```

Lalu minta user me-restart sesi. **Jangan lakukan sendiri.**

- [ ] **Step 5: Verifikasi hidup — enam langkah, semuanya lewat Telegram sungguhan**

1. Kirim pesan teks → sampai ke sesi sebagai notifikasi.
2. Balas lewat tool `reply` → sampai ke Telegram.
3. Kirim tombol bernomor **tanpa** daftar bernomor → **ditolak** (U-5 masih hidup).
4. Tap sebuah tombol → keyboard dicopot, penanda `→ label` menempel (U-2).
5. Quote sebuah pesan lalu tanya soal isinya → `read_history` menemukannya.
6. Buka sesi **kedua** di folder bot yang sama → sesi kedua menerima pesan
   berikutnya, sesi pertama berhenti, dan log sesi kedua menyebut PID yang
   diambil alih.
7. **`/clear` di sesi yang sedang berjalan, lalu kirim pesan.** Ini satu-satunya
   risiko di spec §10 yang belum pernah diukur langsung. Dua kemungkinan,
   dua-duanya harus berakhir dengan pesan tetap sampai:
   - proses MCP **tidak** dimulai ulang → poller-nya sama, kuncinya tidak
     bergerak, pesan lanjut masuk;
   - proses MCP **dimulai ulang** → proses baru mengambil alih kunci dari yang
     lama, dan pesan masuk lewat yang baru.
   Catat mana yang terjadi ke `2026-08-01-status-kapabilitas-terverifikasi.md`.
   **Kalau pesan tidak sampai sama sekali sesudah `/clear`, berhenti dan lapor**
   — itu regresi yang menyentuh pemakaian harian.

- [ ] **Step 6: Commit dan push kedua repo**

```bash
cd ~/workspace/mirza-bots && git add -A && git commit -m "chore: cc-plugin 0.4.0 -- engine menyatu, daemon dibubarkan

Agent: <bot-name>" && git push
cd ~/workspace/mirza-marketplace && git add -A && git commit -m "docs(backlog): penyatuan engine selesai; W-3, W-12, W-16 gugur/selesai

Agent: <bot-name>" && git push
```

---

## Yang sengaja TIDAK ada di rencana ini

- **Membereskan penjaga basi `cc-plugin` di enam folder bot LAMA (W-18).** Sempat
  ditulis sebagai Task 1 dan **dicabut 2026-08-02**: pekerjaan itu melayani
  sistem **lama**, bukan penyatuan, dan menaruhnya di sini membuat user mengira
  konteksnya tercampur — sampai mempertimbangkan membuang seluruh proyek.
  Detailnya tetap hidup sebagai W-18 di BACKLOG Bagian 7. Ringkasnya: `cc-plugin`
  aktif di **semua** folder bot karena `enabledPlugins` bersifat user-level; di
  enam folder lama ia tidak punya bot, mati diam-diam, dan meninggalkan Stop
  hook-nya. Pilihannya (matikan di folder lama / biarkan) belum diputuskan user.

- **Mengganti nama `fleetd`.** Akhiran `d` memang sudah berbohong, tapi
  mengganti nama sambil membongkar arsitekturnya membuat tiap diff jadi dua
  perubahan sekaligus. Diputuskan setelah rencana ini selesai (spec §9).
- **W-15** (identitas dari cwd). Penyatuan mengubah bentuknya, tidak
  menyelesaikannya. Baris BACKLOG-nya perlu ditulis ulang, bukan ditutup.
- **Menilai ulang `bot-cc` (Tahap 4).** Alasan terbesarnya hilang bersama
  daemon; ruang lingkupnya menyusut dan itu keputusan tersendiri.
- **2.5-KELUAR** (CommonMark→MarkdownV2). Pekerjaan berikutnya, spec-nya belum
  ada.
