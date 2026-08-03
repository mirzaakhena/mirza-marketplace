### Task M2: /context + /version + telemetri statusline (wave 4)

**Files:** `packages/cc-stub/scripts/context-bridge.ts` (statusline → RPC hostd `telemetry.report`), kolom telemetri di `sessions` (used_percentage, context_window_size, model, effort, cost, captured_at_ms — migrasi schema kecil), `packages/telegram-adapter/src/context-command.ts`, + test.
**Kode acuan:** scripts/context-bridge.ts lama + context-renderer.ts.
**Fix:** FUNC-1 — telemetri belum ada → "(no data yet)", bukan crash. `agent_status` (rpc-handlers) membaca kolom sama (INFRA-5 tuntas). `/version`: dari package.json hostd/holder (VER-1).

