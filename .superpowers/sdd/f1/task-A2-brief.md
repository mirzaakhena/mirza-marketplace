### Task A2: messages-store — port + fix LOSS-4

**Files:** Create `packages/hostd/src/state/messages-store.ts`, `packages/hostd/test/messages-store.test.ts`.

**Kode acuan (PORT):** `plugins/telegram/messages-store.ts` (301 baris) + `messages-store.test.ts` — angkut logika `logInbound`/`logOutbound`/`getMessage`/`searchLike`, adaptasi: pakai `openDb` A1 (bukan buka sendiri), tabel `messages` ber-`bot_id` + `channel`.
**Fix saat porting:** LOSS-4 — TIDAK ada method `append`; siapa pun yang butuh log event session-change memakai `logOutbound({source:'system', ...})`. `logEdit` TIDAK diport (§10.5); `metadata` kolom tetap. Degradasi store-disabled = no-op tanpa mematikan delivery (SCAR-097). Tambah `searchFts(query)` di atas FTS5 (fondasi IDEA-3).
**Item inventaris:** TG-133..140 (TG-137 → `DIGANTI — logEdit dihapus, metadata tetap`).

---

