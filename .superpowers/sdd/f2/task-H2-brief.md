### Task H2: hook Stop — reply-guard v2 (wave 3)

**Files:** `packages/cc-stub/hooks/reply-guard.ts`, hostd handler `stop.check`, + test.
**Fix FUNC-3** (recon-hooks §A): keputusan di hostd — block bila inbound-terakhir Telegram TANPA reply SETELAH tool-use non-reply TERAKHIR (ack awal tak lolos). Data: hostd tahu reply outbound (messages-store) + hook kirim ringkas transcript-tail (atau hostd baca kolom bus) — pilih desain paling sederhana yang test-able; loop-guard `stop_hook_active` dipertahankan. Test: [inbound→ack→tool→stop] = BLOCK; [inbound→ack→tool→reply final→stop] = allow.

