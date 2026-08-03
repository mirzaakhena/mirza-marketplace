### Task C2: gate/pairing — port + fix SEC-1/SEC-2

**Files:** Create `packages/telegram-adapter/src/gate.ts`, test.

**Kode acuan (PORT):** `gate()` + pairing flow `plugins/telegram/server.ts:209-420` — sumber policy dari `access-store` (A3), bukan file.
**Fix saat porting:** SEC-1 — `/context`/`/version`-class commands ikut cek `allowFrom` pada dmPolicy pairing; SEC-2 — meta-command & permission-reply hanya dari `chat.type==='private' && allowFrom` (relevan penuh fase 2, gate-nya disiapkan sekarang). Test: stranger di dmPolicy pairing tidak bocor info; member grup non-allowlist tidak bisa memicu apa pun.
**Item:** TG-091..IDN gate subset, TG-171..174.

---

