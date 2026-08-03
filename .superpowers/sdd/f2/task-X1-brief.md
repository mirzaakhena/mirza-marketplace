### Task X1: shim writer legacy files (wave 3)

**Files:** `packages/hostd/src/shim/legacy-writer.ts` + test.
**Trigger:** subscribe perubahan `sessions` (id/name/lifecycle) + heartbeat tick + boot/shutdown supervisor → tulis SEMUA file legacy (daftar Global Constraints; key persis; atomic tmp+rename retry SCAR-022; registry pakai protokol lock O_EXCL lama saat menulis). `PENSIUN_DATE` konstanta + warning doctor bila masih aktif melewati tanggal. Test: tiap event → file berisi key persis (golden compare dgn format recon).

