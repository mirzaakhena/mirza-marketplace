### Task B1: bus-core — envelope + ACK + retry + dead-letter + marker

**Files:** Create `packages/hostd/src/bus/bus.ts`, `packages/hostd/src/bus/envelope.ts` (zod, di shared? → taruh `packages/shared/src/bus.ts` agar cc-stub ikut pakai), `packages/hostd/test/bus.test.ts`.

**Interfaces produced:** `Envelope = {id, ts, from, to, kind:'prompt'|'channel-inbound'|'outbound-send', payload, hop, reply_to?}` (zod, `.strict()`); `enqueue(db, env)` idempotent by id; `claimNext(db, to)`, `ack(db, id)`, `fail(db, id, reason)` → retry backoff kolom `next_attempt_at`, pindah `bus_dead` setelah N attempt (terlihat via doctor). `composeAgentPromptMarker(from, hop, body)` — marker digenerate MESIN dengan body di-fence token unik acak (fix SEC-4; kode acuan lama `plugins/agent-bus/prompt-compose.ts`, JANGAN port kelemahan escape-nya). Validasi hop max 5 (BUS-016..032 semantik dipertahankan).
**Doctor:** komponen `bus` di doctorReport berubah dari `"stub"` → `{queued, dead, oldest_unacked_s}`.

---

