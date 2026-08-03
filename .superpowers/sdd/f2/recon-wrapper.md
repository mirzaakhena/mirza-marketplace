# Recon Fase 2 — wrapper.ts + PTY inventory (hasil subagent, 2026-07-04)

## A. Peta wrapper.ts (1275 baris) → rumah baru

| Blok | Baris | Rumah baru |
|---|---|---|
| Header/imports/state-dir | 1-124 | konsep hidup, path scraping pensiun |
| encodeProjectDir/CLAUDE_PROJECTS_DIR | 110-123 | PENSIUN — SessionStart hook lapor session_id (LOSS-1 mati) |
| wrapper.state.json + legacy mirror writer | 125-207 | tabel sessions; file = shim |
| Registry global (load/persist/lock/heartbeat) | 151-159, 412-551 | tabel bots hostd; shim tulis file+lock lama |
| Konstanta pacing SUBMIT_DELAY..CHUNK_DELAY | 209-253 | gate/hold/barrier → supervisor; split+chunk raw → pty-holder |
| CLAUDE_BIN/ARGS/shell | 255-267, 368-369 | pty-holder |
| resolveTelegramStateDir/registry-name/last-status readers | 301-366 | PENSIUN; shim menulis session-names.json legacy |
| chooseStartupArgs (mtime jsonl --resume) | 371-410 | PENSIUN — hostd tahu session_id dari SQLite |
| spawnClaudePty | 553-587 | pty-holder utuh (PTY-039..043) |
| injectSlashCommand/injectText | 594-628 | pty-holder (perintah dari hostd via IPC) |
| writeSystemOutbox | 630-652 | bus/notification, bukan file |
| clear-barrier state machine (awaitingClearReady, InjectionGate, queue, drain) | 654-745 | supervisor; barrier → ACK SessionStart, timeout = alarm doctor |
| PTY handlers/stdin/resize | 748-766 | pty-holder |
| Heartbeat/pid/version writers | 768-823 | health in-process; file = shim |
| Post-/clear poll + resume-sync + idle-claim | 825-985 | PENSIUN (jsonl polling); logika idle-claim → supervisor via hook event |
| consumePending + dispatchPayload (rename-sniff, batch) | 987-1213 | file IPC pensiun → bus; shim KONSUMSI pending fase 2; rename-sniff PENSIUN |
| fs.watch+sweep pending | 1215-1240 | pensiun; shim consumer punya loop sendiri |
| Shutdown/signals | 1242-1275 | pty-holder (sinyal PTY); sequencing fleet → hostd |

## B. Kelompok PTY-001..114

| Rentang | n | Tema | Rumah |
|---|---|---|---|
| 001-015 | 15 | MCP tools contract (send_slash/status/list_agents, self-only, batch gate) | cc-stub proxy; validasi → hostd |
| 016-021 | 6 | slash-guards telegram-layer | hostd (validasi bus) |
| 022-027 | 6 | Playbook /new | cc-stub command → supervisor |
| 028-038 | 11 | IPC filesystem pending | PENSIUN → bus; shim baca fase 2 |
| 039-051 | 13 | Proses wrapper (spawn/pipe/signal/exit) | pty-holder (raw) / hostd (supervisi) |
| 052-063 | 12 | Pacing injeksi | supervisor + pty-holder; barrier → ACK |
| 064-078 | 15 | Lifecycle sesi (first-run/resume/clear/switch/rename-sniff) | PENSIUN jsonl → supervisor via hook |
| 079-086 | 8 | State published | tabel sessions; file = shim |
| 087-094 | 8 | Registry global | tabel bots; shim |
| 095-099 | 5 | Tulisan dir telegram | bus/tabel; shim |
| 100-108 | 9 | Env & knob | spawn env → pty-holder; state-dir → config; pacing → retest |
| 109-114 | 6 | Validasi batch | zod shared |

## C. MCP tools pty-controller

- pty_send_slash: `command` XOR `commands`(≤8); regex `^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$` (SEC-3: `[\s\S]` lolos kontrol chars); guard: target ditolak (self-only) → XOR → validasi+telegramLayerCommandError → wrapperLikelyRunning → write; batch gate versi wrapper >= 0.0.7. Error selalu isError:true.
- pty_status: → {wrapper_alive, state_dir}.
- pty_list_agents: {only_alive?} → registry list, alive = heartbeat <30s.

## D. Bug backlog → fix

SEC-3 regex kontrol chars → `[^\r\n\x00-\x1f]{0,256}` di boundary; LOSS-1 hapus tebak-encoding (hook); LOSS-2 lock → SQLite; LOSS-3 double-inject → idempotency bus; LOSS-8 heartbeat upsert (tak relevan lagi); VER-1 versi dari package.json (batch-gate versi hilang, in-process); CONS-3 pty_list_agents dedup dgn agent_list; CONS-4 registry writer tunggal; INFRA-1/2/5/6 subsumed SQLite; IDEA-2 ack injeksi = hook-inversion.

## E. SCAR wajib (test/keputusan)

SCAR-001 split text+`\r` 250ms; SCAR-002..006 delay/gap/settle/barrier-timeout(alarm)/poll; SCAR-007/020 chunk 100 code-point (surrogate); SCAR-019 ConPTY head-drop; SCAR-021/022 fs.watch/rename retry (shim); SCAR-025 spawn shell chain; SCAR-029 `\r`; SCAR-030/031 keystroke saat CC rebuild → ACK; SCAR-032/033 deteksi jsonl (hilang, validasi migrasi); SCAR-035 confirmAfterMs; SCAR-036/037 slash-guard/regex; SCAR-038/045 prompt satu-baris, batch atomik; SCAR-096 runtime eksplisit (wrapper lama = tsx/Node, BUKAN Bun!).

## F. Kontrak shim (key persis)

- wrapper.state.json {session_id, session_name, lifecycle, seq, updated_at_ms} (atomik)
- wrapper.current_session_id (overwrite hanya saat id konkret); wrapper.current_session_name (kosong = null, selalu overwrite)
- wrapper.heartbeat ISO tiap 5s (threshold 30s, 3 pembaca)
- wrapper.pid (hapus saat clean shutdown; probe kill(pid,0))
- wrapper.version {plugin_version, wrapper_version}
- ~/.claude/agent-registry.json {schema_version:1, agents:{<name>:{project_dir,state_dir,registered_at,last_heartbeat,wrapper_pid}}} + lock O_EXCL
- system-outbox {id,ts,type:"session-change",sessionId,sessionName}
- session-names.json {<sid>:{name,updatedAt}}
- last-status.json DIBACA wrapper (match id)
- pending/*.json: {id,ts,command} | array batch | {id,ts,type:"prompt",from,text,hop_count} — hostd KONSUMSI selama fase 2
