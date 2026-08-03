# Indikator Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram menampilkan "typing…" sepanjang bot benar-benar sedang bekerja, bukan hanya lima detik pertama.

**Architecture:** Modul murni `typing.ts` menyimpan satu timer per chat dan mengirim `sendChatAction` berulang; semua ketergantungannya (pengirim, timer, jam) disuntik supaya bisa diuji tanpa jaringan maupun `setTimeout` sungguhan. Engine menyalakannya saat pesan masuk **diterima allowlist**, dan mematikannya di awal `reply`.

**Tech Stack:** TypeScript, Bun 1.3.11, grammy, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-03-indikator-typing-design.md`

## Global Constraints

- **Repo kode:** `C:\Users\Mirza\workspace\mirza-bots`, dikerjakan di worktree terpisah. Repo dokumen (`mirza-marketplace`) hanya disentuh di Task 3.
- **Platform:** Windows 11, Bun 1.3.11. `bun test` dari `cc-plugin/`.
- **Baseline:** `cc-plugin` **0.6.1**, **227 test hijau**. Jumlah test tidak boleh turun.
- **Konstanta bernama, bukan angka telanjang:** `TYPING_PING_INTERVAL_MS = 4_000`, `TYPING_MAX_MS = 300_000`.
- **Tidak ada knob konfigurasi apa pun** — bukan opsi, bukan env var, bukan field config.
- **Indikator ini hiasan.** Kegagalan `sendChatAction` tidak boleh menjatuhkan giliran, tidak boleh merambat keluar, tidak boleh menghentikan keepalive.
- Jangan menyentuh `hooks/**`, `src/engine/chunk.ts`, atau `src/server.ts`.
- Setiap commit membawa trailer **`Agent: bot-03`**. Jangan mengubah `git config user.name`.
- Jangan `git push` — controller yang mendorong setelah review.

---

### Task 1: Modul keepalive `typing.ts`

**Files:**
- Create: `cc-plugin/src/engine/typing.ts`
- Create: `cc-plugin/test/engine/typing.test.ts`

**Interfaces:**
- Consumes: tidak ada (modul paling bawah, tanpa dependensi internal)
- Produces:
  - `export const TYPING_PING_INTERVAL_MS = 4_000`
  - `export const TYPING_MAX_MS = 300_000`
  - `export interface TypingKeepalive { start(chatId: string): void; stop(chatId: string): void; stopAll(): void }`
  - `export function createTypingKeepalive(deps: TypingDeps): TypingKeepalive`
  - `export interface TypingDeps { send: (chatId: string) => void | Promise<void>; setInterval?: (fn: () => void, ms: number) => unknown; clearInterval?: (handle: unknown) => void; now?: () => number }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `cc-plugin/test/engine/typing.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  createTypingKeepalive,
  TYPING_PING_INTERVAL_MS,
  TYPING_MAX_MS,
} from "../../src/engine/typing";

/**
 * Timer palsu: menyimpan callback dan memajukan waktu atas perintah, jadi test
 * tidak pernah menunggu detik sungguhan dan hasilnya tidak bisa flaky.
 */
function fakeClock() {
  let nowMs = 0;
  const timers = new Map<number, { fn: () => void; every: number; next: number }>();
  let nextId = 1;
  return {
    now: () => nowMs,
    setInterval: (fn: () => void, every: number) => {
      const id = nextId++;
      timers.set(id, { fn, every, next: nowMs + every });
      return id;
    },
    clearInterval: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance(ms: number) {
      const target = nowMs + ms;
      // Jalankan tiap tick pada waktunya, bukan sekaligus di akhir: keepalive
      // memutuskan berhenti berdasarkan jam, dan melompati waktu akan
      // menyembunyikan keputusan itu.
      for (;;) {
        let due: { id: number; t: { fn: () => void; every: number; next: number } } | undefined;
        for (const [id, t] of timers) if (t.next <= target && (!due || t.next < due.t.next)) due = { id, t };
        if (!due) break;
        nowMs = due.t.next;
        due.t.next = nowMs + due.t.every;
        due.t.fn();
      }
      nowMs = target;
    },
    live: () => timers.size,
  };
}

test("ping pertama dikirim SEGERA, bukan setelah interval pertama lewat", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  expect(sent).toEqual(["111"]);
});

test("ping berulang selama keepalive hidup", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  clock.advance(TYPING_PING_INTERVAL_MS * 3);
  expect(sent.length).toBe(4); // satu segera + tiga tick
});

test("stop menghentikan ping, dan tidak ada yang menyusul sesudahnya", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  clock.advance(TYPING_PING_INTERVAL_MS);
  const before = sent.length;
  k.stop("111");
  clock.advance(TYPING_PING_INTERVAL_MS * 5);
  expect(sent.length).toBe(before);
  expect(clock.live()).toBe(0);
});

// Dihitung dari LAJU ping, bukan dari jumlah timer: dua timer yang menumpuk
// akan tetap lolos kalau yang diperiksa cuma "ada timer atau tidak".
test("start dua kali pada chat yang sama tidak menumpuk timer", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  k.start("111");
  sent.length = 0;
  clock.advance(TYPING_PING_INTERVAL_MS * 4);
  expect(sent.length).toBe(4);
});

test("dua chat berjalan sendiri-sendiri", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  k.start("222");
  sent.length = 0;
  k.stop("111");
  clock.advance(TYPING_PING_INTERVAL_MS * 2);
  expect(sent.every(c => c === "222")).toBe(true);
  expect(sent.length).toBe(2);
});

test("berhenti sendiri setelah batas waktu, supaya indikator tidak nyangkut", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  clock.advance(TYPING_MAX_MS + TYPING_PING_INTERVAL_MS * 2);
  const after = sent.length;
  clock.advance(TYPING_PING_INTERVAL_MS * 3);
  expect(sent.length).toBe(after);
  expect(clock.live()).toBe(0);
});

test("start lagi memperpanjang batas waktunya, bukan meneruskan yang lama", () => {
  const clock = fakeClock();
  const sent: string[] = [];
  const k = createTypingKeepalive({ send: c => void sent.push(c), ...clock });

  k.start("111");
  clock.advance(TYPING_MAX_MS - TYPING_PING_INTERVAL_MS);
  k.start("111");
  sent.length = 0;
  clock.advance(TYPING_PING_INTERVAL_MS * 2);
  expect(sent.length).toBeGreaterThan(0);
});

// Hiasan tidak boleh menjatuhkan apa pun. Kalau satu ping gagal, yang berikutnya
// tetap jalan -- sebuah jaringan yang tersendat sesaat bukan alasan indikator
// mati sampai giliran berakhir.
test("send yang melempar tidak menghentikan keepalive dan tidak merambat keluar", () => {
  const clock = fakeClock();
  let calls = 0;
  const k = createTypingKeepalive({
    send: () => {
      calls++;
      throw new Error("429 boom");
    },
    ...clock,
  });

  expect(() => k.start("111")).not.toThrow();
  clock.advance(TYPING_PING_INTERVAL_MS * 2);
  expect(calls).toBe(3);
});

test("stopAll mematikan semuanya sekaligus", () => {
  const clock = fakeClock();
  const k = createTypingKeepalive({ send: () => {}, ...clock });

  k.start("111");
  k.start("222");
  k.stopAll();
  expect(clock.live()).toBe(0);
});

test("stop pada chat yang tidak berjalan tidak melempar", () => {
  const clock = fakeClock();
  const k = createTypingKeepalive({ send: () => {}, ...clock });
  expect(() => k.stop("tidak-ada")).not.toThrow();
});

test("konstantanya eksplisit, bukan angka telanjang yang tersebar", () => {
  expect(TYPING_PING_INTERVAL_MS).toBe(4_000);
  expect(TYPING_MAX_MS).toBe(300_000);
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test test/engine/typing.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/typing'`

- [ ] **Step 3: Tulis implementasinya**

Buat `cc-plugin/src/engine/typing.ts`:

```ts
/**
 * Menjaga indikator "typing…" Telegram tetap menyala selama bot benar-benar
 * bekerja.
 *
 * KENAPA BERULANG, BUKAN SEKALI
 *
 * Indikator Telegram padam sendiri ~5 detik setelah chat action terakhir.
 * Sistem lama mengirimnya sekali per pesan masuk, dan diukur 2026-08-03 atas
 * 1.044 giliran nyata: 97,6% berlangsung lebih dari 5 detik, mediannya 33.
 * Jadi satu tembakan berarti lima detik "typing…" lalu senyap sepanjang sisa
 * giliran -- persis keluhan yang indikator ini seharusnya obati.
 *
 * KENAPA SEMUA DISUNTIK
 *
 * `send`, timer, dan jam masuk lewat parameter supaya perilakunya bisa diuji
 * tanpa jaringan dan tanpa menunggu detik sungguhan. Test yang menunggu waktu
 * asli akan lambat, dan yang lebih buruk, flaky.
 */

/** Jeda antar chat action. Di bawah masa hidup indikator (~5 detik) supaya tidak pernah ada jeda gelap. */
export const TYPING_PING_INTERVAL_MS = 4_000;

/**
 * Batas aman satu keepalive.
 *
 * Yang dijaga bukan kenyamanan giliran panjang, melainkan indikator yang
 * NYANGKUT: giliran yang mati tanpa pernah memanggil `reply` tidak boleh
 * meninggalkan "typing…" berkedip tanpa akhir. 300 detik duduk tepat di atas
 * p99 giliran nyata (288 detik).
 */
export const TYPING_MAX_MS = 300_000;

export interface TypingDeps {
  send: (chatId: string) => void | Promise<void>;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  now?: () => number;
}

export interface TypingKeepalive {
  start(chatId: string): void;
  stop(chatId: string): void;
  stopAll(): void;
}

export function createTypingKeepalive(deps: TypingDeps): TypingKeepalive {
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? (h => clearInterval(h as ReturnType<typeof setInterval>));
  const now = deps.now ?? (() => Date.now());

  const live = new Map<string, { handle: unknown; until: number }>();

  /**
   * Satu ping, dan tidak pernah lebih dari itu.
   *
   * Kegagalan ditelan di SINI, bukan diserahkan ke pemanggil: chat action bisa
   * gagal karena 429, jaringan, atau user memblokir bot, dan tidak satu pun
   * dari itu boleh menjadi alasan sebuah giliran gagal. Konsekuensi yang
   * diterima sadar: ping yang gagal tidak meninggalkan jejak.
   */
  const ping = (chatId: string): void => {
    try {
      const r = deps.send(chatId);
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => {});
      }
    } catch {
      // Sengaja kosong; lihat komentar di atas.
    }
  };

  const stop = (chatId: string): void => {
    const entry = live.get(chatId);
    if (!entry) return;
    clearTimer(entry.handle);
    live.delete(chatId);
  };

  return {
    start(chatId: string): void {
      // Ping segera: indikator harus muncul di detik pertama, bukan setelah
      // interval pertama lewat -- empat detik hening di awal adalah persis
      // jendela yang fitur ini ada untuk menutupnya.
      ping(chatId);

      const existing = live.get(chatId);
      if (existing) {
        // Perpanjang, jangan menumpuk. Dua timer pada satu chat menggandakan
        // laju ping tanpa memberi manfaat apa pun.
        existing.until = now() + TYPING_MAX_MS;
        return;
      }

      const until = now() + TYPING_MAX_MS;
      const handle = setTimer(() => {
        const entry = live.get(chatId);
        if (!entry || now() >= entry.until) {
          stop(chatId);
          return;
        }
        ping(chatId);
      }, TYPING_PING_INTERVAL_MS);

      live.set(chatId, { handle, until });
    },

    stop,

    stopAll(): void {
      for (const chatId of [...live.keys()]) stop(chatId);
    },
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test test/engine/typing.test.ts`
Expected: PASS, 11 test

- [ ] **Step 5: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test`
Expected: PASS, 238 test (227 + 11)

- [ ] **Step 6: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing
git add cc-plugin/src/engine/typing.ts cc-plugin/test/engine/typing.test.ts
git commit -F- <<'EOF'
feat(typing): keepalive indikator "typing..." yang menyala sepanjang giliran

Indikator Telegram padam ~5 detik setelah chat action terakhir, sementara
97,6% giliran nyata berlangsung lebih lama dari itu (median 33 detik, diukur
atas 1.044 giliran). Satu tembakan seperti sistem lama berarti lima detik
"typing..." lalu senyap sepanjang sisanya.

Semua ketergantungan disuntik -- pengirim, timer, jam -- jadi perilakunya
diuji tanpa jaringan dan tanpa menunggu detik sungguhan.

Kegagalan ping ditelan di dalam modul. Ini hiasan; ia tidak boleh jadi alasan
sebuah giliran gagal.

Agent: bot-03
EOF
```

---

### Task 2: Sambungkan ke engine

**Files:**
- Modify: `cc-plugin/src/engine/messages.ts:230-237` (`deliverIncoming` mengembalikan `boolean`)
- Modify: `cc-plugin/src/engine/engine.ts:223` (pembungkus `deliver`)
- Modify: `cc-plugin/src/engine/engine.ts` (buat keepalive dekat `const bot = makeBot(...)` di baris 215)
- Modify: `cc-plugin/src/engine/engine.ts` (awal `reply`, dan `close()` di baris 517)
- Modify: `cc-plugin/test/engine/messages.test.ts` (nilai balik `deliverIncoming`)

**Interfaces:**
- Consumes: `createTypingKeepalive`, `TypingKeepalive` dari `./typing` (Task 1)
- Produces: `deliverIncoming(msg, deps, lastChatByBot): Promise<boolean>` — `true` bila pesan lolos allowlist dan menjadi target balasan berikutnya

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `cc-plugin/test/engine/messages.test.ts`, di dalam `describe("deliverIncoming (the reply-target gate)")`:

```ts
// Nilai balik ini yang dipakai engine untuk memutuskan menyalakan indikator
// "typing...". Menebaknya lewat lastChatByBot tidak bisa: peta itu MENYIMPAN
// chat sebelumnya ketika sebuah pesan ditolak, jadi pengirim non-allowlist
// akan membuat bot tampak sedang mengetik ke user yang sah.
test("mengembalikan true saat pesan diterima", async () => {
  const deps = makeDeps({ allowFrom: ["7"] });
  const accepted = await deliverIncoming(
    makeMessage({ bot: "bot-uji", chatId: "111", userId: "7" }),
    deps,
    new Map()
  );
  expect(accepted).toBe(true);
});

test("mengembalikan false saat pesan ditolak allowlist", async () => {
  const deps = makeDeps({ allowFrom: ["7"] });
  const accepted = await deliverIncoming(
    makeMessage({ bot: "bot-uji", chatId: "111", userId: "999" }),
    deps,
    new Map()
  );
  expect(accepted).toBe(false);
});
```

Sesuaikan `makeDeps` / `makeMessage` dengan helper yang sudah ada di berkas itu — **jangan membuat helper baru** kalau yang lama sudah menyediakan bentuk yang sama; baca dulu isinya dan pakai ulang nama serta bentuk argumennya.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test test/engine/messages.test.ts`
Expected: FAIL — nilainya `undefined`, bukan `true`/`false`

- [ ] **Step 3: Kembalikan flag dari `deliverIncoming`**

Di `cc-plugin/src/engine/messages.ts`, ganti:

```ts
export async function deliverIncoming(
  msg: NormalizedMessage,
  deps: PollerDeps,
  lastChatByBot: Map<string, string>
): Promise<void> {
  const accepted = await handleIncomingMessage(msg, deps);
  if (accepted) lastChatByBot.set(msg.bot, msg.chatId);
}
```

dengan:

```ts
/**
 * Mengembalikan apakah pesan ini diterima -- bukan sekadar efek samping.
 *
 * Pemanggilnya butuh membedakan "diterima" dari "ditolak allowlist" untuk
 * memutuskan menyalakan indikator "typing...". `lastChatByBot` tidak bisa
 * menjawab itu: peta ini MENYIMPAN chat sebelumnya saat sebuah pesan ditolak,
 * jadi menebak lewat isinya akan membuat pesan dari orang asing memicu
 * indikator ke user yang sah.
 */
export async function deliverIncoming(
  msg: NormalizedMessage,
  deps: PollerDeps,
  lastChatByBot: Map<string, string>
): Promise<boolean> {
  const accepted = await handleIncomingMessage(msg, deps);
  if (accepted) lastChatByBot.set(msg.bot, msg.chatId);
  return accepted;
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test test/engine/messages.test.ts`
Expected: PASS

- [ ] **Step 5: Buat keepalive di engine**

Di `cc-plugin/src/engine/engine.ts`, tambahkan import:

```ts
import { createTypingKeepalive } from "./typing";
```

lalu, tepat setelah `const bot = makeBot(botConfig.token);` (baris 215):

```ts
  // Indikator "typing...". Pakai `bot.api` langsung, bukan lewat helper kirim
  // apa pun: ini bukan pesan, tidak disimpan ke riwayat, dan tidak boleh ikut
  // jalur mana pun yang punya efek samping.
  const typing = createTypingKeepalive({
    send: chatId => bot.api.sendChatAction(chatId, "typing"),
  });
```

- [ ] **Step 6: Nyalakan saat pesan masuk diterima**

Di `cc-plugin/src/engine/engine.ts`, ganti baris 223:

```ts
  const deliver = (msg: NormalizedMessage) => deliverIncoming(msg, deps, lastChatByBot);
```

dengan:

```ts
  // Indikator dinyalakan hanya untuk pesan yang LOLOS gerbang -- pesan yang
  // ditolak tidak boleh membuat bot tampak sedang menyiapkan jawaban.
  const deliver = async (msg: NormalizedMessage) => {
    const accepted = await deliverIncoming(msg, deps, lastChatByBot);
    if (accepted) typing.start(msg.chatId);
    return accepted;
  };
```

- [ ] **Step 7: Matikan di awal `reply` dan saat engine ditutup**

Di `cc-plugin/src/engine/engine.ts`, di dalam `async reply(...)`, tepat setelah `chatId` diperoleh dan penjaga `no_known_chat` lewat, sisipkan:

```ts
        // Dimatikan di AWAL, bukan di akhir: pengiriman berpotongan bisa makan
        // beberapa detik, dan selama itu pesan-pesannya sudah mendarat satu per
        // satu. "typing..." yang menggantung di antara potongan tidak menambah
        // apa pun.
        typing.stop(chatId);
```

Lalu di `close()` (baris 517), sebagai baris pertama:

```ts
        typing.stopAll();
```

- [ ] **Step 8: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test`
Expected: PASS, 240 test (238 + 2). Kalau ada test lama yang gagal karena `deliver` sekarang `async`, perbaiki test itu — bukan kodenya.

- [ ] **Step 9: Commit**

```bash
cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing
git add cc-plugin/src/engine/engine.ts cc-plugin/src/engine/messages.ts cc-plugin/test/engine/messages.test.ts
git commit -F- <<'EOF'
feat(typing): nyalakan saat pesan diterima, matikan di balasan pertama

deliverIncoming sekarang mengembalikan flag accepted yang sudah dihitungnya
sendiri. Tanpa itu engine harus menebak lewat lastChatByBot, dan peta itu
menyimpan chat sebelumnya saat sebuah pesan ditolak -- pengirim non-allowlist
akan membuat bot tampak sedang mengetik ke user yang sah.

Dimatikan di AWAL reply, bukan di akhir: selama pengiriman berpotongan
pesan-pesannya sudah mendarat satu per satu, dan indikator yang menggantung di
antara potongan tidak menambah apa pun.

Agent: bot-03
EOF
```

---

### Task 3: Rilis 0.7.0 dan verifikasi hidup

**Files:**
- Modify: `cc-plugin/.claude-plugin/plugin.json`, `cc-plugin/package.json` (versi)
- Modify: `mirza-bots/README.md`
- Modify: `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md`

- [ ] **Step 1: Naikkan versi jadi `0.7.0` di kedua berkas**

Minor, bukan patch: kapabilitas baru yang terlihat user. **Kedua berkas wajib** — tanpa kenaikan di `plugin.json`, `claude plugin update` tidak melihat ada yang perlu diambil.

- [ ] **Step 2: Jalankan seluruh test**

Run: `cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing\cc-plugin && bun test`
Expected: PASS, 240 test.

- [ ] **Step 3: Catat kapabilitasnya di README**

Di bagian yang mendaftar kapabilitas `mirza-bots/README.md`, tambahkan:

```markdown
- **Indikator "typing…" hidup sepanjang giliran.** Menyala begitu pesan masuk
  lolos allowlist, diperbarui tiap 4 detik, dan berhenti di balasan pertama.
  Indikator Telegram sendiri padam ~5 detik setelah pembaruan terakhir,
  sementara 97,6% giliran berlangsung lebih lama dari itu — satu tembakan
  seperti sistem lama akan senyap sepanjang sisa giliran. Ada batas aman 300
  detik supaya giliran yang mati tanpa membalas tidak meninggalkan indikator
  nyangkut.
```

- [ ] **Step 4: Commit (JANGAN push — controller yang mendorong setelah review)**

```bash
cd C:\Users\Mirza\workspace\mirza-bots-bot-03-typing
git add cc-plugin/.claude-plugin/plugin.json cc-plugin/package.json README.md
git commit -F- <<'EOF'
release: cc-plugin 0.7.0 -- indikator typing sepanjang giliran

Agent: bot-03
EOF
```

- [ ] **Step 5: Controller — merge, push, pasang**

Setelah final review bersih: merge ke `main`, push, `claude plugin marketplace update mirza-bots` lalu `claude plugin update cc-plugin@mirza-bots`, dan pastikan `claude plugin list` menunjukkan 0.7.0.

- [ ] **Step 6: Minta user me-restart sesinya**

**Jangan me-restart sendiri** (W-18, dan W-23 adalah biayanya yang terukur). Kirim permintaan lewat Telegram, tunggu konfirmasi.

- [ ] **Step 7: Verifikasi hidup**

Ini fitur yang **tidak meninggalkan jejak di database** — tidak ada baris yang bisa dibaca sesudahnya. Satu-satunya bukti adalah mata user:

1. Kirim pesan yang jawabannya butuh >30 detik. "typing…" harus **bertahan** sampai balasan datang, bukan padam setelah lima detik.
2. Kirim pesan pendek yang dijawab cepat. Indikator muncul lalu hilang; tidak menggantung.
3. Kalau bisa: pesan dari akun yang **tidak** di allowlist tidak boleh memunculkan indikator apa pun di chat user yang sah.

Catat hasilnya apa adanya. Yang tidak sempat diuji ditandai ⬜, bukan dibiarkan tampak lulus.

- [ ] **Step 8: Perbarui BACKLOG dan push repo dokumen**

Perbarui **Versi terpasang** ke 0.7.0, **Angka test**, dan tandai celah #2 SELESAI berikut hash commit dan hasil uji hidup Step 7.

---

## Self-Review

**Spec coverage:**

| Bagian spec | Task |
|---|---|
| §4 modul `typing.ts`, konstanta, antarmuka | Task 1 |
| §4 ping segera saat `start` | Task 1 Step 1 test 1, Step 3 |
| §4 `start` memperpanjang, tidak menumpuk | Task 1 test "tidak menumpuk" + "memperpanjang batas" |
| §4 batas `TYPING_MAX_MS` | Task 1 test "berhenti sendiri" |
| §4 kegagalan `send` ditelan | Task 1 test "send yang melempar" |
| §4 titik sambung: start di `deliver`, stop di awal `reply`, `stopAll` di `close` | Task 2 Step 5-7 |
| §4 `deliverIncoming` mengembalikan boolean | Task 2 Step 1-3 |
| §5 tanpa knob, tanpa reaksi ack | Global Constraints |
| §6 testing | Task 1 Step 1, Task 2 Step 1 |
| §7 berkas yang disentuh | Task 1-2 |
| §8 risiko | Task 3 Step 8 mencatat; pengukuran ulang di luar rencana ini |

**Catatan jujur soal cakupan:** spec §6 meminta test "pesan yang ditolak tidak
menyalakan typing". Rencana ini mengujinya **secara tidak langsung** — lewat
nilai balik `deliverIncoming` (Task 2 Step 1) plus pembacaan kode pada
pembungkus `deliver`. Menguji rangkaian utuhnya butuh menyuntik `bot.api` ke
`createEngine`, seam yang belum ada dan yang sudah dicatat sebagai descope di
rencana chunking. **Pengurangan cakupan yang disengaja, ditulis supaya tidak
terbaca sebagai lengkap.**

**Placeholder scan:** tidak ada TBD/TODO. Setiap langkah kode punya blok kode utuh.

**Type consistency:** `TypingKeepalive` dan `createTypingKeepalive` dipakai
dengan bentuk yang sama di Task 1 dan 2. `deliverIncoming` dideklarasikan
mengembalikan `Promise<boolean>` di Task 2 Step 3 dan dikonsumsi begitu di Step
6. `TYPING_PING_INTERVAL_MS` / `TYPING_MAX_MS` satu-satunya sumber kedua angka
itu.
