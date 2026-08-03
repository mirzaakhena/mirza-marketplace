### Task 6: Verifikasi end-to-end + remote

**Files:** — (tidak ada file baru; eksekusi + verifikasi)

**Interfaces:**
- Consumes: `main.ts`/`cli.ts` (Task 4), seluruh test suite.

- [ ] **Step 1: Suite penuh dari root**

Run: `bun install && bun run typecheck && bun test`
Expected: exit 0, ≥8 test pass, 0 fail.

- [ ] **Step 2: Boot hostd sungguhan (bukan test)**

Run (background): `bun run packages/hostd/src/main.ts`
Expected: log `[hostd] v0.0.1 siap — pipe: \\.\pipe\mirza-hostd`.

- [ ] **Step 3: `/doctor` menjawab**

Run: `bun run packages/hostd/src/cli.ts doctor`
Expected: JSON dengan `"ok": true` dan 4 komponen `stub`. Ini = definisi selesai Fase 0 (§9). Matikan hostd setelahnya.

- [ ] **Step 4: Remote GitHub (sesuai keputusan user di konfirmasi)**

Bila user setuju repo GitHub: user membuat repo kosong `mirza-harness` (private) → `git remote add origin <url> && git push -u origin main`. Bila belum: tandai TODO, push menyusul; disiplin push-segera (SOP) berlaku sejak remote ada.

- [ ] **Step 5: Lapor user via Telegram**

Ringkas: fase 0 selesai per definisi §9, link/artefak, next = fase 1 (butuh token bot uji ke-7 — minta di awal fase 1).

---

## Self-Review (sudah dijalankan)

- **Spec coverage §9 fase 0:** repo ✅(T1) skeleton ✅(T1) `.gitattributes` ✅(T1) CI ✅(T5) skema SQLite ✅(T3) protokol IPC zod ✅(T2) hostd boot + `/doctor` jawab ✅(T4, T6).
- **Placeholder scan:** tidak ada TBD/TODO tersisa selain TODO push-remote yang memang keputusan user.
- **Type consistency:** `parseRpcMessage`/`PIPE_NAME_DEFAULT`/`RpcRequest` (T2) dipakai T4 dengan nama sama; `applySchema` (T3) belum dipakai hostd — disengaja, state connect di fase 1.
