### Task A1: state-core — koneksi DB + skema final + retention

**Files:** Create `packages/hostd/src/state/db.ts`, `packages/hostd/test/state-db.test.ts`; Modify `packages/shared/src/schema.ts` (revisi draft→final utk tabel yang dipakai fase 1).

**Interfaces produced:** `openDb(path: string | ":memory:"): Database` — set `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000`, `applySchema`, jalankan `runRetention(db, policy)` (DELETE messages ber-umur > N hari, default 90; sweep bus_dead > 30 hari) — kebijakan dari tabel `kv` (INFRA-6).

**Revisi skema:** `messages` disesuaikan skema produksi lama (kode acuan `plugins/telegram/messages-store.ts:89-106`): tambah kolom `user_id`, `user_name`, `attachments` (JSON), ganti `meta`→`metadata`; FTS5 + trigger sinkronisasi insert/delete (temuan minor fase 0 #2). `channel_access` dipakai apa adanya. Kolom draft lain belum dipakai fase 1 — biarkan.

**Steps:** failing test (FK enforced: insert sessions dgn bot_id tak dikenal → throw; WAL aktif; retention menghapus baris tua; FTS ikut sinkron via trigger) → implement → pass → typecheck → commit+push.

---

