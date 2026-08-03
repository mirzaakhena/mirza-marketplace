### Task A3: access-store — port access.json → tabel + API

**Files:** Create `packages/hostd/src/state/access-store.ts`, `packages/hostd/test/access-store.test.ts`.

**Kode acuan (PORT):** type `Access` + mutasi pairing di `plugins/telegram/server.ts:222-420`. Simpan policy JSON per (channel,bot_id) di `channel_access`; API: `getAccess(botId)`, `setAccess(botId, access)` (zod-validated), `approvePairing(botId, userId)`, `importLegacyAccessJson(path)` (untuk migrasi/test; toleran korup → simpan `.corrupt-<ts>` semantik SCAR-078). Tidak ada fs.watch — perubahan lewat API (akar SCAR-021 hilang untuk jalur ini).

---

