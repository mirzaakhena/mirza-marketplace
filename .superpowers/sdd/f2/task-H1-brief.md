### Task H1: hook SessionStart + jalur data rename (wave 3)

**Files:** `packages/cc-stub/hooks/session-start.ts`, hostd handler `session.started`, + test.
**Perilaku:** hook POST via pipe RPC `{session_id, source, cwd}` → hostd upsert baris `sessions` (bot dari mapping workspace→bot config), lifecycle 'idle', LEPASKAN barrier antrean (S1); balasan hook membawa `additionalContext: 'Session name: "<name>"'` dari tabel (ganti session-name-context lama; INFRA-5). Rename via jalur data: supervisor.rename menulis sessions.name SETELAH inject `/rename` di-ack + hook/echo konfirmasi — sniffing keystroke PENSIUN. LOSS-1 mati (tidak ada tebak encoding jsonl).

