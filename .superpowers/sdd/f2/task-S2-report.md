### Task S2 report — session-ops API supervisor (Fase 2, wave 3)

STATUS: DONE

**Ringkasan test:** `bun test packages/hostd packages/shared` → 426 pass / 0 fail (953 expect), termasuk 28 test baru di `packages/hostd/test/session-ops.test.ts` + 1 test baru di `supervisor.test.ts` (confirmAfterMs pass-through). `tsc --noEmit` exit 0.

**File dibuat/diubah:**
- `packages/hostd/src/supervisor/session-ops.ts` (baru) — `createSessionOps(deps)` menghasilkan `listSessions`, `currentSession`, `isAlive`, `resume`, `rename` (async), `clearSession` (async, opsional `{name}`), `setEffort`, `archiveSession`, `hardDelete`, `bulkArchive`, `bulkDelete` — semua injeksi PTY lewat `SessionOpsSupervisor` (subset method `BotSupervisor` sudah punya: `enqueueSlash`, `clearSession`, `status`, `queue.list/deadLetterList`), tak ada pending file/PTY spawn sendiri.
- `packages/hostd/test/session-ops.test.ts` (baru) — fake supervisor (rekam call + kontrol ack/dead-letter lewat seam `sleep`) + fake fs in-memory (jsonl listing) untuk `listSessions`.
- `packages/hostd/src/supervisor/supervisor.ts` — tambahan kecil non-breaking: `dispatchToHolder` sekarang mendeteksi command word `/effort` dan melewatkan `confirmAfterMs=500` (const `EFFORT_CONFIRM_AFTER_MS`, diekspor) ke `holder.injectSlash` — `injection.ts` (S1) TIDAK disentuh karena delay ini konstanta tetap per-command, bukan parameter per-panggilan.
- `packages/hostd/test/supervisor.test.ts` — 1 test baru + `FakeHolder.injectCalls` direkam sekarang menyertakan `confirmAfterMs`.
- `packages/shared/src/schema.ts` — tabel baru `session_archive(bot_id, session_id, archived_at)`, additive `CREATE TABLE IF NOT EXISTS` (port `archive-store.ts`'s archived-sessions.json → tabel, sesuai brief "port ke tabel atau file setara"). Test `schema.test.ts` pakai `toContain`, tidak breaking.

**Keputusan desain kunci:**
- `rename`/`clearSession({name})` menulis `sessions.name` **setelah ack**, bukan optimistik — dideteksi lewat polling `supervisor.queue.list()`/`deadLetterList()` (keduanya method publik S1 yang sudah ada, tak perlu ubah `injection.ts`). Untuk `clearSession`, ack `/clear` yang genuine (via `SessionStart` asli) dibedakan dari pelepasan barrier lewat safety-timeout dengan snapshot before/after `currentSession()` (id/`started_at` harus berubah) — kalau tidak, nama TIDAK diterapkan dan hasil `{ok:false}`.
- `listSessions` enumerasi jsonl (`~/.claude/projects/<encoded>/*.jsonl`, filter UUID) di-join dengan `sessions.name` (nilai `'idle'` diperlakukan sebagai "belum dinamai") dan `session_archive`; TIDAK memfilter sesi arsip secara default (expose flag `.archived`) supaya `bulkDelete` bisa membersihkan sesi yang sudah diarsipkan juga.
- `hardDelete` re-check `currentSession()` tepat sebelum hapus (mitigasi race tap↔confirm) dan idempoten (jsonl sudah hilang / row sudah hilang → tetap `{ok:true}`).
- `setEffort` selalu memanggil `enqueueSlash(..., "supervisor")` — penanda yang dibutuhkan `guardSlashCommand` (S1) supaya `/effort` lolos; jalur AI (`source` default `"ai"`) tetap diblokir di titik enqueue seperti sebelumnya.

**Concerns:**
1. Wiring produksi belum lengkap: `session-ops.ts` belum dipanggil dari `rpc-handlers.ts`/`main.ts` (di luar file-scope task ini) — mengikuti pola "PRODUCTION WIRING NOTE" yang sudah ada di `rpc-handlers.ts` untuk `supervisors`. Perlu task lanjutan untuk expose method-method ini sebagai RPC (mis. `session.list`, `session.rename`, dst.) dan memanggil `sessionOps.rename/clearSession` setelah `handleSessionStarted` insert row (untuk `clearSession`'s name-apply, timing sudah aman selama urutan insert-lalu-`onSessionStarted()` di `rpc-handlers.ts` tetap seperti sekarang).
2. `awaitAck` adalah polling (bukan event-driven) — cocok untuk pemakaian in-process (RPC handler yang `await`, atau job scheduler), tapi kalau nanti dipanggil dari jalur yang butuh timeout ketat/non-blocking, `ackPollMs`/`ackTimeoutMs` perlu disetel eksplisit per situasi.
3. Uniqueness-name check (`isNameTaken`) membaca ulang `listSessions()` tiap panggilan (readdir + query db) — cukup untuk skala single-bot single-project sekarang, tapi bukan O(1); tidak masalah untuk fase ini.
4. Working tree juga berisi perubahan task X1 paralel (`legacy-writer.ts`, `atomic-write.ts`, `shared/index.ts`) — tidak disentuh, dilaporkan sekadar biar diketahui saat verifikasi diff.

## Fix pass 1 (I-1/I-2)

STATUS: DONE

**Ringkasan test:** `bun test packages/hostd packages/shared` → 432 pass / 0 fail (968 expect). `tsc --noEmit` exit 0. Scope disiplin dijaga: hanya `packages/hostd/src/supervisor/session-ops.ts` + `packages/hostd/test/session-ops.test.ts` disentuh (git status mengonfirmasi `supervisor.ts`/`supervisor.test.ts`/`shared/schema.ts` yang tampil "M" adalah dari task lain sebelumnya, bukan dari pass ini).

**I-1 (WAJIB) — pisah ack timeout `clearSession` vs `rename`:**
- `SessionOpsDeps` dapat field baru `clearAckTimeoutMs?: number`, default `CLEAR_BARRIER_TIMEOUT_MS + 15_000` = `135_000ms` (import read-only `CLEAR_BARRIER_TIMEOUT_MS` dari `injection.ts`, tak mengubah file itu). `ackTimeoutMs` (default tetap `30_000ms`) sekarang eksplisit didokumentasikan sebagai milik `rename` (ack keystroke-speed).
- `awaitAck(supervisor, id, timeoutMs)` diubah dari closure-implicit jadi parameter eksplisit — `rename` memanggil dengan `ackTimeoutMs`, `clearSession` dengan `clearAckTimeoutMs`.
- Ghost-write check: diverifikasi `awaitAck` adalah loop `for(;;)` sekuensial tunggal, bukan poller latar belakang — begitu ia resolve `{ok:false}` (timeout/dead-letter), pemanggil (`rename`/`clearSession`) langsung `return` tanpa mencapai baris `db.run(UPDATE ... SET name)`. Tidak ada jalur nyata di mana `sessions.name` tertulis setelah caller sudah menerima kegagalan — didokumentasikan di docstring `awaitAck`, tidak perlu perubahan struktural tambahan.
- Test baru (`describe("I-1: separate ack timeouts...")`): `clearSession` dengan ack di simulasi t=100s (fake clock via `now`+`onTick`) → sukses (`{ok:true, nameApplied:false}`), TIDAK timeout; `rename` dengan ack yang baru akan datang di t=40s → timeout duluan di t=30s (reason mengandung "timeout"), dan `sessions.name` tetap `"idle"` (tidak ada ghost write).

**I-2 (WAJIB) — bulkArchive/bulkDelete per-item error isolation:**
- `bulkArchive`/`bulkDelete` sekarang membungkus tiap iterasi (`archiveSession(...)`/`hardDelete(...)`) dalam `try/catch` — item yang `db.run` melempar exception di tengah masuk `result.errors += 1` lalu loop lanjut ke item berikutnya, sesuai kontrak `BulkResult` ("hitung per-item lalu lanjut"). `archiveSession`/`hardDelete` versi single-call TIDAK diubah (tetap boleh throw ke caller langsung sesuai brief) — hanya pemanggilan dari bulk yang jadi per-item-safe.
- Test baru: `bulkArchive`/`bulkDelete`, masing-masing dengan `db.run` di-monkeypatch supaya melempar utk satu `session_id` spesifik (SID_A) di tengah batch → hasil `{processed:1, skipped:1, errors:1}`, item lain (SID_B) tetap ter-proses (masuk `session_archive` / jsonl+row terhapus), current (SID_C) tetap ter-skip seperti biasa.

**M-2 (minor, di luar scope) — dicatat saja:**
- `schema.test.ts`'s `EXPECTED_TABLES` belum memuat `session_archive` (tabel baru dari task S2 sebelumnya). Tidak disentuh karena di luar file-scope pass ini (`session-ops.ts`/`session-ops.test.ts` saja) — perlu ditambahkan oleh siapa pun yang memegang `schema.test.ts` (M1-task atau controller) supaya list expected tables lengkap.
