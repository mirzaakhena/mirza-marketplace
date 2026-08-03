### Task C3: poller lifecycle — grammy per token, supervised

**Files:** Create `packages/telegram-adapter/src/poller.ts`, `packages/hostd/src/adapters/telegram.ts` (pemasangan N poller dalam hostd), test (mock grammy).

**Kode acuan:** boot/retry/shutdown `plugins/telegram/server.ts:99-206, 2141-2195`.
**Fix saat porting:** LOSS-6 — 8× 409 Conflict → `poller.stop()` + lapor status `dead:conflict` ke supervisor (doctor merah), BUKAN zombie; SCAR-061 — pasang `bot.catch` agar throw handler tidak mematikan polling; SCAR-050 — satu poller per token (hostd = satu-satunya konsumen getUpdates; pid-file takeover TIDAK diport — supervisi proses tunggal menggantikannya, catat di inventaris `DIGANTI`); LOSS-5 — token dibaca dari config hostd dgn parser CRLF-safe + trim.
**Config:** `hostd.config.json` (path via env `MIRZA_HOSTD_CONFIG`) `{bots: [{id, telegram_token, workspace}]}` — zod, contoh file `hostd.config.example.json` di repo, file asli di-gitignore.

---

