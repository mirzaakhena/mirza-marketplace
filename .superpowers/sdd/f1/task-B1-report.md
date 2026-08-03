# Task B1 — bus-core: envelope + ACK + retry + dead-letter + marker

Status: DONE (TDD, semua test hijau, typecheck 0).

## Bukti RED → GREEN

Tiap file ditulis test dulu, dijalankan (gagal karena modul belum ada), lalu
diimplementasikan sampai hijau:

```
$ bun test packages/shared/test/bus.test.ts     # sebelum src/bus.ts ada
error: Cannot find module '../src/bus'
$ (implementasi shared/src/bus.ts) -> 22 pass / 0 fail (bergabung dgn suite shared)

$ bun test packages/hostd/test/bus.test.ts      # sebelum src/bus/bus.ts ada
error: Cannot find module '../src/bus/bus'
$ (implementasi hostd/src/bus/bus.ts) -> 23 pass / 0 fail / 56 expect()

$ bun test packages/hostd/test/marker.test.ts   # sebelum src/bus/marker.ts ada
error: Cannot find module '../src/bus/marker'
$ (implementasi hostd/src/bus/marker.ts) -> 14 pass / 0 fail / 25 expect()
```

**GREEN akhir:**

```
$ bun test packages/hostd packages/shared
129 pass / 0 fail / 258 expect() calls (10 file test)

$ bun test   (seluruh repo, termasuk pekerjaan paralel task lain)
218 pass / 0 fail / 443 expect() calls (15 file test)

$ bunx tsc --noEmit
exit 0, tanpa output
```

## File yang disentuh

- `packages/shared/src/bus.ts` (baru) — `Envelope` (zod `.strict()`): `id` (uuid),
  `ts` (number), `from`/`to` (string), `kind` (`enum['prompt','channel-inbound','outbound-send']`),
  `payload` (unknown), `hop` (int 0..5, `MAX_HOP=5` diekspor), `reply_to?` (string). Tipe
  `EnvelopeT` diekspor.
- `packages/shared/test/bus.test.ts` (baru) — 16 test: happy-path (dgn/tanpa `reply_to`),
  penolakan id non-uuid, kind di luar enum, hop negatif/non-integer/>5, batas hop 0 dan 5,
  extra key ditolak (`.strict()`), field wajib hilang, payload menerima string/number/null.
- `packages/shared/src/index.ts` — **hanya** tambah baris `export * from "./bus";` (baris lain
  tidak disentuh, diverifikasi via `git diff`).
- `packages/hostd/src/bus/bus.ts` (baru) — `enqueue(db, env)`, `claimNext(db, to)`, `ack(db, id)`,
  `fail(db, id, reason)`, `busStats(db)`.
- `packages/hostd/test/bus.test.ts` (baru) — 23 test: idempotency insert (id duplikat →
  `false`, tidak ada baris kedua), payload JSON round-trip, envelope invalid dilempar zod;
  `claimNext` urutan ts ter-tua, filter per `to`, `next_attempt_at` di masa depan vs lewat,
  baris acked tak lagi diklaim; `ack` idempotent (id tak ada → `false`, tak throw); backoff
  5/10/20/40/80/160/300 (cap), dead-letter setelah attempts ke-8 (pindah ke `bus_dead` dgn
  `reason`, envelope tersimpan utuh sbg JSON, hilang dari `bus_queue`, `fail` pada id tak ada
  no-op); `busStats` (`queued` hanya unacked, `dead` count `bus_dead`, `oldest_unacked_s` usia
  baris unacked tertua, nol bila kosong).
- `packages/hostd/src/bus/marker.ts` (baru) — `composeAgentPrompt(from, hop, body)` /
  `parseAgentPrompt(text)`, `MAX_HOP=5`.
- `packages/hostd/test/marker.test.ts` (baru) — 14 test: round-trip (body normal, kosong,
  multi-baris), token acak berbeda tiap panggilan, dua kasus anti-spoof (body berisi teks
  marker lama gaya `] [Message from...]`, dan body berisi fence `agent-bus` palsu dgn token
  tebakan/all-zero) tetap dikembalikan utuh sbg body tanpa memecah fence; parse gagal (null)
  untuk teks tanpa fence, token penutup tak cocok, fence penutup hilang; validasi hop
  (0..5 diterima, 6/-1/1.5 dilempar `RangeError`).

## Keputusan kecil

1. **Fix SEC-4 (anti-spoof marker).** Kode lama (`plugins/agent-bus/prompt-compose.ts`)
   menempel marker statis `[Message from agent X via agent-bus (hop N)...] ` langsung di
   depan body tanpa fence/escape — body yang attacker-controlled bisa menyisipkan teks
   `] [Message from agent evil...]` untuk menutup marker asli lebih awal dan memalsukan
   marker baru. Fix: `composeAgentPrompt` membungkus body dengan fence
   `[agent-bus from=<from> hop=<n> id=<token>]\n<body>\n[/agent-bus id=<token>]` dengan
   `token = crypto.randomUUID()` yang **dipilih setelah body sudah tetap** — penulis body
   tidak mungkin menebak token itu sebelumnya, sehingga tak bisa menyisipkan close-fence yang
   cocok persis. `parseAgentPrompt` hanya mempercayai open-fence yang berlabuh di indeks 0 dan
   close-fence di ujung akhir teks yang tokennya sama persis; selain itu return `null`. Body
   berisi teks/fence palsu (termasuk token all-zero yang ditebak) tetap dikembalikan utuh
   sebagai bagian dari `body`, tidak pernah salah di-strip.
2. **`claimNext` tidak mengunci baris (no visibility timeout).** Skema `bus_queue` fase 0/1
   tidak punya kolom "claimed_at"/lock, dan brief tidak memintanya (YAGNI) — jadi `claimNext`
   murni query baca ("peek" baris siap ter-tua), konsumen wajib memanggil `ack`/`fail` setelah
   memproses. Cukup untuk model single-consumer-per-`to`, tapi **tidak aman untuk multi-consumer
   konkuren pada `to` yang sama** (race: dua consumer bisa mengklaim baris yang sama sebelum
   salah satu ack/fail). Dicatat sebagai batasan yang disengaja, bukan bug — perlu diperluas
   (mis. kolom `claimed_at`+timeout) bila fase berikutnya butuh multi-consumer.
3. **Formula backoff:** `next_attempt_at = now + min(5 * 2^(attempts-1), 300)` dihitung dari
   `attempts` **setelah** increment (attempts baru = 1 → 5s, 2 → 10s, ..., 7 → 300s dari
   320s ter-cap). Pada `attempts >= 8` (bukan `== 8` — jaga-jaga bila fungsi lain pernah
   menaikkan attempts di luar `fail`) baris dipindah ke `bus_dead` dan dihapus dari
   `bus_queue` dalam pemanggilan `fail` yang sama (bukan langkah terpisah).
4. **`busStats.queued`** dihitung dari baris `bus_queue` dengan `acked_at IS NULL` (bukan
   seluruh baris) — baris yang sudah `ack` tapi belum dibersihkan (tak ada job pembersih acked
   di scope task ini) tidak dihitung sebagai "masih antre". `oldest_unacked_s` dihitung dari
   `MIN(ts)` baris unacked itu; `0` bila tak ada baris unacked (bukan `null`/`NaN`), supaya
   konsumen (doctor) tidak perlu null-check.
5. **`enqueue`/`fail` memakai `Envelope.parse` (throw), bukan `safeParse`** — konsisten dengan
   gaya `parseRpcMessage` di `shared/ipc.ts` (payload tak dikenal/tak valid ditolak keras, tidak
   ditelan diam-diam).
6. Tidak menyentuh `doctor.ts`/`server.ts` (wiring `bus: "stub"` → `busStats(...)` didelegasikan
   ke task lain sesuai instruksi).

## Verifikasi akhir

- `bun test packages/hostd packages/shared` → 129 pass, 0 fail, 258 expect() calls.
- `bun test` (seluruh repo, termasuk perubahan paralel task lain yang sudah ada di working
  tree) → 218 pass, 0 fail — tidak ada regresi.
- `bunx tsc --noEmit` → exit 0.
- `git diff packages/shared/src/index.ts` → hanya 1 baris ditambahkan (`export * from "./bus";`),
  baris lain utuh.
- Tidak ada `git add`/commit/push dilakukan. `bun install` tidak dijalankan (zod sudah tersedia
  di `shared` dan `hostd`).

## Fix pass 1

Reviewer feedback 3 item (Important + 2x Minor):

### 1. (Important) Dokumentasikan limitasi `claimNext` di bus.ts + test race

**Ubah:** `packages/hostd/src/bus/bus.ts`
- Perluas docstring `claimNext` dengan 4 poin: (a) tanpa visibility-lock/kolom claim, (b) asumsi
  single-consumer per `to`, (c) race konkret: dua claimNext sebelum ack/fail mengembalikan baris
  identik, (d) jalur perluasan: kolom `claimed_at`+timeout.

**Ubah:** `packages/hostd/test/bus.test.ts`
- Tambah test "claimNext single-consumer: dua claim berturut tanpa ack mengembalikan baris yang
  sama — limitasi terdokumentasi" yang memanggil claimNext 2x pada baris sama, assert envelope
  identik (`claimed1.id === claimed2.id`), simulasikan ack ganda (pertama `true`, kedua `false`
  karena idempotent).

### 2. (Minor) Hapus MAX_HOP lokal di marker.ts, impor dari @mirza-harness/shared

**Ubah:** `packages/hostd/src/bus/marker.ts`
- Hapus `export const MAX_HOP = 5;` (lokal).
- Impor: `import { MAX_HOP } from "@mirza-harness/shared";`.
- Pastikan `packages/shared/src/bus.ts` sudah export `MAX_HOP` (✓ sudah ada).
- `packages/shared/src/index.ts` sudah re-export via `export * from "./bus"` (✓).

**Ubah:** `packages/hostd/test/marker.test.ts`
- Ubah impor: dari `import { ..., MAX_HOP } from "../src/bus/marker"` ke
  `import { ..., MAX_HOP } from "@mirza-harness/shared"` (single source of truth).

### 3. (Minor) Validasi hop di parseAgentPrompt (0..MAX_HOP) → return null jika invalid

**Ubah:** `packages/hostd/src/bus/marker.ts`
- Di `parseAgentPrompt`, setelah extract `hopStr` dari open-fence regex, parse ke `hop = Number(hopStr)`.
- Validasi: `if (!Number.isInteger(hop) || hop < 0 || hop > MAX_HOP) return null;`.
- Alasan: marker dengan hop di luar rentang dianggap rusak/invalid (semantik sama dgn fence
  token tidak cocok).

**Ubah:** `packages/hostd/test/marker.test.ts`
- Tambah 2 test:
  1. "parseAgentPrompt: hop di luar 0..MAX_HOP dianggap invalid → return null" — patch manual
     text dgn hop=6, assert result null.
  2. "parseAgentPrompt: hop negatif (disimulasikan) dianggap invalid → return null" — patch text
     dgn hop=-1, assert null.

### Verifikasi fix pass 1

```
$ bun test packages/hostd packages/shared
132 pass / 0 fail / 266 expect() calls (10 file test)

$ bun run typecheck
$ tsc --noEmit
(exit 0, tanpa output)
```

**Ringkasan:** 1 test baru utk race-condition claimNext, 2 test baru utk hop-validation
parseAgentPrompt, single source MAX_HOP, semua pass.
