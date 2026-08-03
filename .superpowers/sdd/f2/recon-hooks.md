# Recon Fase 2 — hooks + shim + skill split (hasil subagent, 2026-07-04)

## A. Hook existing → pengganti cc-stub

- session-name-context (SessionStart): baca wrapper.current_session_name → fallback registry; output additionalContext nama sesi; lemah: dua sumber bisa lag. Pengganti: hook POST {session_id, source} ke hostd; nama dari tabel sessions (INFRA-5).
- telegram-turn-reminder (UserPromptSubmit): regex inbound telegram → suntik blok ~4 baris + nudge idle; lemah (CONS-1): 541B/turn redundan dgn 2 SKILL.md (3 sumber tumpang tindih). Pengganti: pointer 1-baris (~90B); isi ke skill reply-discipline (merge); nudge idle → eskalasi ber-key context% (masukan bot-01: >~30% hook MEMERINTAHKAN auto-apply nama).
- telegram-reply-guard (Stop): scan transcript; block bila inbound telegram tanpa reply SESUDAHNYA; lemah (FUNC-3): reply APA PUN (ack awal) memuaskan guard. Pengganti: hostd cek "reply substantif SETELAH tool-use non-reply TERAKHIR"; verif: [inbound→ack→tool→stop] harus BLOCK.
- PreToolUse trailer-guard (bot-conduct): FUNC-4 matcher hanya Bash (PowerShell lolos); FUNC-5 regex bypass (-am, -C, --message=, -F) + false-positive (grep -m 1, trailer di string lain). Pengganti: matcher Bash|PowerShell, tokenized, cek trailer pada ISI pesan commit saja.

## B. Kontrak hook-inversion §5

1. hostd inject /clear via pty-holder → sessions.lifecycle='resetting' (SQLite).
2. CC sesi baru → SessionStart POST → hostd tulis baris sesi (idle) + LEPASKAN antrean (ganti clear-barrier polling-jsonl 10-menit; timeout → alarm doctor). Bangun: cc-stub hook + hostd queue-release.
3. Injeksi ber-id; "terkirim" hanya setelah sinyal balik semantik (SessionStart utk /clear; echo state utk /rename); gagal → retry/dead-letter terlihat. Bangun: bus + supervisor.
4. Rename-sniffing pensiun — nama via jalur data. Bangun: cc-stub tool/payload terstruktur + hostd penulis sessions; pty-holder tetap buta konten.

Peran: hostd = penulis state tunggal + antrean/gate; cc-stub = pelapor jujur + tool ber-data; pty-holder = keystroke/resize/exit saja.

## C. SKILL-001..082 split

→ KODE (hostd+hooks): handoff state machine (SKILL-003,004,008,020,022,024,025 → tabel handoffs), goal (SKILL-035,036,040-043 → tabel goals), immediate-reply+inline-buttons enforcement (SKILL-045-056 → reply-discipline + jalur mekanis), bot-conduct Rule 2 trailer (SKILL-058-060 → PreToolUse), reply-guard (FUNC-3 → hostd).
→ TETAP TEKS: teach-me (066-068), knowledge-vault (078-082), daily-report (069-077), template/interview handoff-goal (017,014,037-039), bot-conduct Rule 1/3/4/5/6 (057,061-065).
→ AUDIT (konflik/basi): immediate-reply vs MCP soal edit_message (CONS-2 — bersihkan referensi, tool sudah DIHAPUS §10.5); template handoff READY-heuristic basi vs SKILL.md (ambiguitas #5); CONS-1 merge reply-discipline.

## D. Shim fase 2 (file → key → konsumen → trigger)

| File | Key | Konsumen | Trigger hostd |
|---|---|---|---|
| wrapper.state.json | session_id, session_name, lifecycle, seq, updated_at_ms | agent-bus peer-status (jalur utama) | tiap perubahan sessions |
| wrapper.current_session_id | teks sid | current-session-info, peer-status fallback, meta-commands exclude-current | session_id berubah |
| wrapper.current_session_name | teks (kosong=null) | readAuthoritativeSessionName (hook lama), peer-status | name berubah (termasuk clear) |
| wrapper.heartbeat | ISO per 5s | wrapperLikelyRunning (2-sinyal) | tick supervisor per bot shim |
| wrapper.pid | pid | kill(pid,0) probe | start/stop holder |
| wrapper.version | {plugin_version, wrapper_version} — KEY PERSIS | readWrapperVersion (batch gate, /version) | boot shim per bot |
| agent-registry.json | schema_version:1, agents{name:{project_dir,state_dir,registered_at,last_heartbeat,wrapper_pid}} + lock O_EXCL | agent-bus tools, pty_list_agents | register/heartbeat/unregister pilot |
| pending/*.json | {id,ts,command} \| batch array \| {id,ts,type:"prompt",from,text,hop_count} | hostd MENGONSUMSI (arah terbalik) — dari agent-bus bot lama ke pilot | watcher/sweep shim consumer |

Asimetri validasi (ambiguitas #2): putuskan titik validasi tunggal saat hostd jadi consumer.

## E. Statusline/context-bridge

Sekarang: statusLine CC → context-bridge.ts → last-status.json {captured_at_ms, payload} (payload null bila stdin non-JSON = akar FUNC-1) → dibaca /context + peer-status (trust bila session_id match wrapper.state + lifecycle busy/unknown).
Baru: context-bridge → RPC hostd telemetry.report → kolom telemetri baris sessions (payload.context_window.{used_percentage, remaining_percentage, current_usage, context_window_size} + cost + rate_limits + captured_at_ms; CC ≥2.1.199 per bot-01). /context & agent_status baca baris sama; staleness-reconciliation peer-status pensiun (satu penulis); FUNC-1 → "(no data yet)".
