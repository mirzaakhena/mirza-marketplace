### Task B2: delivery — hostd→cc-stub channel notification

**Files:** Create `packages/hostd/src/bus/delivery.ts`, test.

**Perilaku:** baris bus tujuan sesi CC di-push sebagai event JSON-RPC `channel.deliver` ke koneksi IPC cc-stub yang terdaftar (`session.register` saat stub connect). Payload = `{content: string, meta: Record<string,string>}` — validasi zod menolak meta non-string SEBELUM kirim (SCAR-056 jadi error terlihat, bukan drop senyap). ACK bus setelah stub konfirmasi notifikasi terkirim ke CC. Stub offline → antre (retry backoff), TERLIHAT di doctor.

---

