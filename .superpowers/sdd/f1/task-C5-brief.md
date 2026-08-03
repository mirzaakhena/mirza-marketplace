### Task C5: outbound sender — reply/react/download/get_message

**Files:** Create `packages/telegram-adapter/src/outbound.ts`, test.

**Kode acuan (PORT):** handler tools `plugins/telegram/server.ts:695-901` — dipicu dari bus `kind:'outbound-send'` (bukan MCP handler langsung): `reply` (chunking C1 + MV2 fallback + buttons + files, mutual-exclusion SCAR-062, anti-exfil `assertSendable` L255-265), `react` (whitelist SCAR-053), `download_attachment` (inbox path, limit SCAR-054), `get_message_by_id` (baca messages-store). Log outbound ke store. `edit_message` TIDAK diport.
**Item:** TG-065..090 minus 086..088 (DIHAPUS).

---

