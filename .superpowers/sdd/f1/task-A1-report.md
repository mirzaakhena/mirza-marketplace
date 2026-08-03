# Task A1 — state-core: koneksi DB + skema final + retention

Status: DONE (TDD, semua test hijau, typecheck 0).

## Bukti RED → GREEN

**RED** — test ditulis lebih dulu (`packages/hostd/test/state-db.test.ts`), lalu dijalankan
sebelum implementasi ada:

```
$ bun test packages/hostd/test/state-db.test.ts
error: Cannot find module '../src/state/db' from '...state-db.test.ts'
0 pass / 1 fail / 1 error
```

Setelah menulis skema revisi (menambah trigger FTS) sempat RED lagi karena bug tak terduga:
backtick di komentar SQL menutup template literal JS lebih awal (`schema.ts:45`,
`error: Expected ";" but found "messages"`). Diperbaiki dengan menghapus backtick dari teks
komentar.

**GREEN** — setelah implementasi `openDb`/`runRetention` + revisi skema:

```
$ bun test packages/hostd/test/state-db.test.ts
14 pass / 0 fail / 19 expect() calls

$ bun test packages/hostd packages/shared
25 pass / 0 fail / 49 expect() calls (5 file test)

$ bun run typecheck
$ tsc --noEmit   -> exit 0
```

## File yang disentuh

- `packages/hostd/src/state/db.ts` (baru) — `openDb(path)`, `runRetention(db)`.
- `packages/hostd/test/state-db.test.ts` (baru) — 14 test: pragma (WAL/`:memory:`→`memory`,
  foreign_keys, busy_timeout), FK enforcement (insert `sessions` bot_id tak dikenal → throw;
  bot_id dikenal → sukses), kolom skema `messages` baru, sinkron trigger FTS5
  (insert/delete/update), `runRetention` default (90/30 hari) + override lewat `kv`.
- `packages/shared/src/schema.ts` — revisi tabel `messages`: tambah `user_id`, `user_name`,
  `attachments`; rename `meta`→`metadata`. Tambah 3 trigger (`messages_ai/ad/au`) untuk
  sinkronisasi `messages_fts` (external content pattern) otomatis.
- `packages/shared/test/schema.test.ts` — adaptasi test FTS: hapus insert manual ke
  `messages_fts` (sekarang otomatis lewat trigger); insert manual ganda akan bentrok rowid.
- `packages/hostd/src/index.ts` — tambah `export * from "./state/db"` supaya
  `openDb`/`runRetention` bisa diimpor dari `@mirza-harness/hostd`.

## Keputusan kecil

1. **`openDb` menjalankan `runRetention` otomatis di akhir proses buka** (setelah
   `applySchema`), sesuai deskripsi brief ("... jalankan `runRetention(db, policy)`"). Namun
   signature final `runRetention(db: Database)` mengikuti resolusi controller (bukan
   `(db, policy)`) — policy dibaca sendiri oleh fungsi dari tabel `kv`. Fungsi tetap
   diekspor terpisah supaya test bisa memanggilnya ulang secara eksplisit setelah insert baris
   lama, tanpa perlu re-open DB.
2. **PRAGMA `journal_mode=WAL` dieksekusi tanpa branching utk `:memory:`** — sesuai catatan
   controller, SQLite sendiri menolak WAL utk in-memory dan mengembalikan `'memory'`; kode tidak
   perlu deteksi path khusus, cukup jalankan pragma yang sama untuk semua path dan terima
   hasilnya apa adanya (diverifikasi test terpisah utk file-db vs `:memory:`).
3. **Retensi `messages` pakai kolom `ts`, `bus_dead` pakai kolom `dead_at`** — keduanya unix
   seconds, cutoff dihitung `now - N*86400`. Kebijakan dibaca per-key dari `kv`
   (`retention.messages_days`, `retention.bus_dead_days`); nilai kosong/non-numerik/≤0 jatuh ke
   default (90/30) — dites lewat kasus default dan kasus override.
4. Trigger FTS diletakkan di `schema.ts` (bukan di `db.ts` hostd) karena ini bagian dari
   kontrak skema itu sendiri — siapa pun yang membuka DB dan menulis SQL mentah ke `messages`
   (bukan cuma lewat hostd) tetap menjaga index FTS konsisten.
5. Tidak menyentuh tabel/kolom draft fase 1 lain yang belum dipakai (goals, handoffs, dst.) —
   sesuai instruksi "biarkan".

## Verifikasi akhir

- `bun test packages/hostd packages/shared` → 25 pass, 0 fail.
- `bun run typecheck` → exit 0.
- Tidak ada `git add`/commit/push dilakukan (working tree dibiarkan untuk controller).
  `bun install` tidak dijalankan (tidak ada dependency baru).
