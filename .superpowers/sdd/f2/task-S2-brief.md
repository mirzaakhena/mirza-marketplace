### Task S2: session-ops API supervisor (wave 3)

**Files:** `packages/hostd/src/supervisor/session-ops.ts` + test; perluasan rpc-handlers.
**Kode acuan:** meta-commands.ts (recon-meta §B tabel pemetaan) + sessions-list.ts (enumerasi jsonl + shortId), archive-store, session-names-registry.
**API:** `clearSession(bot,{name})`, `resume(bot,sessionId)`, `rename(bot,name)` (validasi session-name-rules; unik), `archiveSession/hardDelete/bulk*`, `setEffort(bot,level)` (inject `/effort <level>` + confirmAfterMs:500 — SCAR-035), `listSessions(bot)` (enumerasi jsonl CC lama TETAP sbg sumber list + join nama dari sessions table/registry — histori pra-migrasi), `currentSession(bot)`, `isAlive(bot)`. Semua lewat antrean S1 (ack semantik).

