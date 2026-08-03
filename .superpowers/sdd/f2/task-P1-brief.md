### Task P1: pty-holder — child tipis pemegang PTY

**Files:** `packages/pty-holder/src/{main.ts,pty.ts,inject.ts,ipc.ts}` + test.
**Kode acuan:** `plugins/pty-controller/wrapper/src/wrapper.ts` — spawn chain 553-587 (PTY-039..051, SCAR-025: `cmd.exe /c` Win, login shell `-l -i -c` Unix; env CLAUDE_BIN/ARGS/SHELL 255-267), low-level inject 594-628 (SCAR-001 split text lalu `\r` setelah SUBMIT_DELAY_MS=250; SCAR-029), chunking (SCAR-007/020: CHUNK_SIZE=100 by code-point, CHUNK_DELAY_MS=30; SCAR-019 ConPTY), stdin pipe/resize/SIGINT 748-766, shutdown 1242-1275.
**Interfaces:** protokol IPC parent↔child via stdio NDJSON JSON-RPC (reuse `shared/ipc.ts`): request `inject {id, text, submit:bool}` / `inject-slash {id, command, confirmAfterMs?}` / `resize {cols,rows}` / `shutdown`; event `pty-exit {code, signal}` / `pty-error` / `injected {id}` (ack level-holder = keystroke tertulis, BUKAN semantik selesai). TANPA pengetahuan sesi/nama/barrier.
**Fix:** SCAR-096 — runtime dieksplisitkan (KEPUTUSAN #1); VER-1 — versi dari package.json.
**Test:** unit inject splitting/chunk boundaries (surrogate pair); integrasi spawn proses dummy echo-PTY (bukan claude) verifikasi keystroke sampai utuh; Windows ConPTY smoke.

