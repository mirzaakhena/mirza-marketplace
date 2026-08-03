### Task D1: cc-stub — plugin skeleton + IPC client + notification pass-through

**Files:** Create di `packages/cc-stub/`: `.claude-plugin/plugin.json`, `.mcp.json`, `src/server.ts` (MCP stdio), `src/ipc-client.ts` (named-pipe client + reconnect), test.

**Kode acuan:** pola deklarasi `plugins/telegram/{.claude-plugin/plugin.json,.mcp.json}`; capability `experimental:{'claude/channel':{}}` + emisi `notifications/claude/channel` (kode acuan `server.ts:502-531, 1924-1950`).
**Perilaku:** connect ke `\\.\pipe\mirza-hostd`, `session.register {bot_id}`; event `channel.deliver` dari hostd → emit notifikasi channel ke CC (meta sudah tervalidasi string-only di hostd); putus pipe → reconnect backoff + tanda di tool error ("hostd unreachable").

---

