### Task D2: cc-stub — tools proxy (telegram 4 + bus 3)

**Files:** Modify `packages/cc-stub/src/server.ts` (+ `src/tools.ts`), test.

**Perilaku:** 7 tool MCP dgn skema input identik permukaan lama (kode acuan skema `plugins/telegram/server.ts:572-654` utk reply/react/download_attachment/get_message_by_id; `plugins/agent-bus/server.ts:56-108` utk agent_list/agent_status/agent_send) → semua handler = satu jalur `rpc(method, params)` ke hostd; hostd yang validasi + eksekusi (agent_status membaca tabel `sessions`/`bots` — INFRA-5 selesai struktural; agent_send → bus ber-ACK, hasil delivery jujur, perbaikan SCAR-071). Skema tool digenerate dari satu sumber zod di `shared` (prinsip §2.4).
**Item:** BUS-001..032 permukaan; TG-065..090 permukaan.

---

