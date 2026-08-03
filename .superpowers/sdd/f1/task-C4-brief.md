### Task C4: inbound pipeline — gate→media/album→store→bus

**Files:** Create `packages/telegram-adapter/src/inbound.ts`, test.

**Kode acuan (PORT):** `handleInbound` + handler media/album/quote `plugins/telegram/server.ts:1473-1950` — output BUKAN notifikasi MCP langsung, melainkan `enqueue` bus `kind:'channel-inbound'` dgn payload content+meta string-only (serialisasi album per kode acuan L1786-1810; SCAR-055 sort by message_id, quote item pertama). Simpan ke messages-store (source `user`). Callback `ai:*` buttons → inbound `[button tapped: …]` (kode acuan L1333-1397). FUNC-1 guard `payload:null` diterapkan pada pembaca status apa pun yang diport.
**Belum di fase 1:** intercept meta-commands & permission-reply (fase 2) — pesan `/new` dll diteruskan apa adanya ke AI dgn catatan (stub).
**Item:** TG-091..132 mayoritas.

---

