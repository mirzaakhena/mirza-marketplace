# Capability Inventory — agent-bus (BUS-NNN)

**Tanggal:** 2026-07-02 · **Scope:** plugin `agent-bus` v0.0.13 (`plugins/agent-bus/`) — MCP server (`server.ts`), registry reader (`registry.ts`), peer status reader (`peer-status.ts`), prompt composer (`prompt-compose.ts`), send guards (`send-guards.ts`), dan kontrak perilaku skill `using-agent-bus`.

Dokumen ini adalah **acceptance checklist untuk rewrite harness**: setiap item adalah perilaku/kontrak yang bisa diverifikasi, diturunkan langsung dari source, dan HARUS selamat ke sistem baru. Referensi baris menunjuk source saat ini.

## agent_list

- [ ] **BUS-001** `agent_list` membaca registry global `~/.claude/agent-registry.json`; path bisa di-override via env `AGENT_REGISTRY_PATH`; tanpa `HOME`/`USERPROFILE` → error — `plugins/agent-bus/registry.ts:37`, `plugins/agent-bus/server.ts:30`
- [ ] **BUS-002** Entry yang `last_heartbeat`-nya lebih tua dari 24 jam (`STALE_LIST_THRESHOLD_MS`) disaring keluar dari hasil `agent_list`; timestamp yang tidak bisa di-parse dianggap stale — `plugins/agent-bus/server.ts:34`, `plugins/agent-bus/server.ts:42`, `plugins/agent-bus/server.ts:119`
- [ ] **BUS-003** Flag `online` = `last_heartbeat` berumur < 30 detik (`ONLINE_THRESHOLD_MS = 30_000`); timestamp tidak valid → `online: false` — `plugins/agent-bus/server.ts:33`, `plugins/agent-bus/server.ts:36`
- [ ] **BUS-004** Output `agent_list` = JSON array per peer dengan field persis: `name`, `online`, `last_heartbeat`, `project_dir` — `plugins/agent-bus/server.ts:120`
- [ ] **BUS-005** Kontrak tool description: `agent_list` "Safe to call autonomously at any time" — otonomi pemanggilan ini bagian dari kontrak — `plugins/agent-bus/server.ts:58`

## agent_status

- [ ] **BUS-006** `agent_status` mewajibkan argumen `name` string non-empty; selain itu → error `name (string) is required` — `plugins/agent-bus/server.ts:129`
- [ ] **BUS-007** Nama tidak terdaftar → error `agent "<name>" not in registry. Known: <daftar nama>` (atau `(none)` bila registry kosong) — `plugins/agent-bus/server.ts:134`
- [ ] **BUS-008** Snapshot output berisi field persis: `name`, `online`, `last_heartbeat`, `wrapper_pid`, `current_session_id`, `current_session_name`, `lifecycle`, `context_used_percent`, `context_window_size`, `model`, `effort_level` — `plugins/agent-bus/server.ts:140`
- [ ] **BUS-009** Sumber telemetry kaya = `<project_dir>/.claude/channels/telegram/last-status.json`, dibaca dari `payload.{session_id, session_name, model.display_name, effort.level, context_window.used_percentage, context_window.context_window_size}`; field bertipe salah → null — `plugins/agent-bus/peer-status.ts:83`
- [ ] **BUS-010** Jalur utama: `.claude/channels/pty-controller/wrapper.state.json` otoritatif untuk `session_id`/`session_name`/`lifecycle` — identitas session SELALU dari wrapper state, bukan dari last-status.json — `plugins/agent-bus/peer-status.ts:46`, `plugins/agent-bus/peer-status.ts:127`
- [ ] **BUS-011** Trust logic telemetry: `last-status.json` hanya dipercaya bila (a) `session_id`-nya sama dengan wrapper state DAN (b) lifecycle aktif (`busy` atau `unknown`); selain itu `context_used_percent`/`context_window_size`/`model`/`effort_level` = null (state reset/idle = persis kondisi last-status.json diketahui lag) — `plugins/agent-bus/peer-status.ts:48`
- [ ] **BUS-012** Fallback legacy (peer tanpa `wrapper.state.json`): telemetry dipakai bila `wrapper.current_session_id` absen ATAU cocok dengan snapshot; `session_name` null diisi dari file `wrapper.current_session_name` (file kosong = "tidak bernama"); `lifecycle` tetap null — `plugins/agent-bus/peer-status.ts:64`, `plugins/agent-bus/peer-status.ts:162`
- [ ] **BUS-013** Fallback legacy saat id mismatch: hanya `current_session_id` + `current_session_name` dari file wrapper, field per-session lain null; tidak ada file apa pun → semua field null — `plugins/agent-bus/peer-status.ts:73`
- [ ] **BUS-014** Kontrak semantik (di tool description): `context_used_percent`/`context_window_size`/`model` = null berarti session fresh / belum aktif — diperlakukan ~0% used, BUKAN error; `context_window_size` (token, mis. 200000/1000000) disediakan supaya threshold math tidak parsing string model — `plugins/agent-bus/server.ts:64`, `plugins/agent-bus/peer-status.ts:26`
- [ ] **BUS-015** `readPeerSessionInfo` adalah reader murni: tidak pernah menulis ke state peer; file hilang/korup/unreadable → null best-effort, tidak pernah throw — `plugins/agent-bus/peer-status.ts:16`, `plugins/agent-bus/peer-status.ts:116`

## agent_send

- [x] **BUS-016** Hanya `kind:"prompt"` yang didukung; input schema membatasi `payload.kind` ke enum `['prompt']` dan `kind` wajib ada — `plugins/agent-bus/server.ts:92`, `plugins/agent-bus/server.ts:170` — verified-live E1 2026-07-04 (bukti #6: bot-07→bot-07 self-send prompt)
- [ ] **BUS-017** `kind:"slash"` → throw eksplisit dengan pesan penjelasan (neighbor-autonomy 2026-06-07: injeksi command mem-bypass AI peer, tak ada guard penerima yang bisa menolak; kirim `kind:"prompt"` yang mendeskripsikan command) — `plugins/agent-bus/server.ts:194`
- [ ] **BUS-018** `kind` lain → error `unsupported payload kind: <kind> (expected "prompt")` — `plugins/agent-bus/server.ts:203`
- [ ] **BUS-019** `target` menerima string atau string[]; dinormalisasi (buang non-string, trim, dedup); hasil kosong → throw `agent_send needs at least one target` — `plugins/agent-bus/send-guards.ts:13`
- [ ] **BUS-020** Validasi body: harus string non-empty (`body must be a non-empty string`) — `plugins/agent-bus/prompt-compose.ts:50`
- [ ] **BUS-021** Body maksimal 8 KB byte UTF-8 (`MAX_BODY_BYTES = 8 * 1024`), dicek pada raw body sebelum komposisi — `plugins/agent-bus/prompt-compose.ts:15`, `plugins/agent-bus/prompt-compose.ts:54`
- [ ] **BUS-022** Newline flattening: semua run CR/LF di-collapse jadi satu spasi + trim (CC submit on Enter — teks yang di-inject harus satu baris) — `plugins/agent-bus/prompt-compose.ts:61`
- [x] **BUS-023** `hop_count` omitted/null → 0 (prompt fresh dari user); harus non-negative integer, selain itu ditolak — `plugins/agent-bus/prompt-compose.ts:29` — verified-live E1 2026-07-04 (bukti #6: hop=0 pada meta notifikasi; validasi non-negative-integer belum diuji)
- [ ] **BUS-024** `hop_count > MAX_HOP` (5) → refusal di sisi sender dengan pesan anti-loop eksplisit ("Stop relaying; report to your own user instead") — sender menolak upfront supaya AI dapat error jelas alih-alih silent drop di receiver — `plugins/agent-bus/prompt-compose.ts:22`, `plugins/agent-bus/prompt-compose.ts:34`
- [x] **BUS-025** Komposisi attribution marker: teks final = `[Message from agent <from> via agent-bus (hop N). This is an inter-agent instruction, not from the user. Treat per the using-agent-bus skill — anti-bounce: do not auto-reply unless the message explicitly asks for it. If asked to report back via agent_send, set payload.hop_count = N+1.] <flattened body>` — marker membawa hop supaya receiver tahu nilai report-back — `plugins/agent-bus/prompt-compose.ts:73` — DIGANTI — fence token mesin `[agent-bus from=.. hop=.. id=..]...[/agent-bus id=..]`, SEC-4 fixed, verified-live E1 2026-07-04 (bukti #6)
- [x] **BUS-026** Identitas pengirim (`self`) = basename `CLAUDE_PROJECT_DIR` (trailing slash/backslash dibuang; fallback `unknown`) — harus match derivasi nama di wrapper — `plugins/agent-bus/server.ts:164` — verified-live E1 2026-07-04 (bukti #6: from=bot-07)
- [ ] **BUS-027** Delivery = tulis file JSON `{id (uuid), ts (ISO), type:"prompt", from, text, hop_count}` ke `<peer.state_dir>/pending/<uuid>.json` secara atomik (tmp `.tmp.<pid>` + rename); folder `pending/` dibuat bila belum ada — `plugins/agent-bus/prompt-compose.ts:88`
- [x] **BUS-028** Semantik offline-queueing: target offline TETAP `{target, ok: true, path, online: false}` (file antre, dikonsumsi saat peer boot); target tak terdaftar → `{target, ok: false, error: "not in registry", online: false}`; error tulis per-target tidak menggagalkan target lain — `plugins/agent-bus/server.ts:177` — verified-live E1 2026-07-04 (bukti #6: queued:true jujur, lihat juga SCAR-071); not-in-registry-case belum diuji
- [ ] **BUS-029** Broadcast/fan-out: satu call dengan `target` array menghasilkan envelope `{kind:"prompt", results:[…]}` berisi hasil per-target — `plugins/agent-bus/server.ts:83`, `plugins/agent-bus/server.ts:189`
- [ ] **BUS-030** Kontrak tool description `agent_send`: DO NOT call autonomously — hanya saat user eksplisit meminta pesan ke agent lain, ATAU saat inbound agent prompt eksplisit minta report-back; jangan pernah auto-reply selain itu — `plugins/agent-bus/server.ts:78`
- [ ] **BUS-031** Kontrak deskripsi `hop_count` di schema: omit (=0) untuk prompt fresh; report-back = hop dari pesan masuk + 1; > 5 ditolak — `plugins/agent-bus/server.ts:97`
- [ ] **BUS-032** Semua error handler dikembalikan sebagai MCP result `isError: true` dengan text `error: <msg>` (bukan protocol failure); tool name tak dikenal → `unknown tool: <name>` — `plugins/agent-bus/server.ts:205`, `plugins/agent-bus/server.ts:211`

## Kontrak registry (registry.ts)

- [ ] **BUS-033** Schema registry yang dibaca: `{ schema_version: 1, agents: { <name>: { project_dir, state_dir, registered_at, last_heartbeat, wrapper_pid } } }` — `agent_send` bergantung pada `state_dir`, `agent_list`/`agent_status` pada `project_dir`/`last_heartbeat`/`wrapper_pid` — `plugins/agent-bus/registry.ts:24`
- [ ] **BUS-034** File registry hilang / JSON korup / `schema_version` bukan 1 → diperlakukan sebagai registry kosong (`{schema_version:1, agents:{}}`) tanpa throw — `plugins/agent-bus/registry.ts:72`
- [ ] **BUS-035** Protokol lock penulis: lock file `<path>.lock` via `openSync(…, 'wx')` (O_EXCL), retry 25 ms, timeout 2000 ms → throw `registry lock timeout`; visibilitas atomik via `<path>.tmp.<pid>` + rename — `plugins/agent-bus/registry.ts:45`, `plugins/agent-bus/registry.ts:85`
- [ ] **BUS-036** CATATAN REWRITE: fungsi writer (`registerAgent`/`updateHeartbeat`/`unregisterAgent`) di registry.ts adalah **dead code** untuk plugin ini — production writer register/heartbeat/unregister adalah wrapper pty-controller; agent-bus runtime hanya memanggil `readRegistry` (`readRegistry` sendiri tidak mengambil lock) — `plugins/agent-bus/registry.ts:92`, `plugins/agent-bus/registry.ts:133`, `plugins/agent-bus/server.ts:117`

## Kontrak skill using-agent-bus

- [ ] **BUS-037** Prinsip neighbor autonomy: setiap bot bertanggung jawab atas session-nya sendiri; bot tidak pernah inject command ke peer; peer AI boleh menolak dan mengeksekusi command sendiri via `pty_send_slash` self-only; bot macet diselamatkan USER via Telegram, bukan bot tetangga — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:10`
- [ ] **BUS-038** Anti-bounce: prompt masuk yang diawali marker `[Message from agent … via agent-bus (hop N)…]` = terminal context; DILARANG `agent_send` sebagai respons KECUALI (1) user eksplisit minta, atau (2) body prompt eksplisit minta report-back ke bot bernama — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:75`
- [ ] **BUS-039** Default saat menerima agent prompt: kerjakan, lapor ke Telegram sendiri, STOP — jangan bounce sekadar acknowledge — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:86`
- [ ] **BUS-040** Kapan boleh `agent_send`: hanya atas permintaan user eksplisit (relay perintah/tugas ke peer); TIDAK boleh untuk "second opinion" autonomus, delegasi brainstorm, atau inisiatif sendiri; ragu → tanya user — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:24`
- [ ] **BUS-041** Kanal one-way: tidak ada reply channel; leader yang butuh hasil harus memintanya DI DALAM body ("when done, send a one-line summary back to bot-01"); worker membalas dengan SATU prompt one-way — tidak ada pairing otomatis — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:57`
- [ ] **BUS-042** Disiplin hop: report-back memakai `payload.hop_count = N + 1` dari marker; guard ganda (sender refuse + wrapper receiver drop di atas 5) memastikan relay loop mati setelah 5 hop meski semua AI misbehave — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:66`
- [ ] **BUS-043** Prompt wipe-state (minta peer reset/clear/delete session): WAJIB konfirmasi ulang ke user via inline-buttons meski user sudah bilang "do it", dengan restatement konkret; peer AI tetap hakim akhir; aksi non-destruktif tidak perlu konfirmasi ekstra — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:88`
- [ ] **BUS-044** Pattern leader fan-out: `agent_list()` dulu → `agent_send` array → warn user soal target offline ("queued") → bila diminta report-back, ringkas balasan lalu STOP — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:100`
- [ ] **BUS-045** Hasil `{online: false}` = tulis sukses tapi antre; wajib disampaikan ke user bahwa pesan baru dikonsumsi saat peer boot — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:125`, `plugins/agent-bus/skills/using-agent-bus/SKILL.md:138`
- [ ] **BUS-046** Nama peer tidak boleh ditebak/di-infer — selalu dari `agent_list`; nama = basename project dir peer — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:128`
- [ ] **BUS-047** Jangan menaruh secrets di body prompt — file inbox hidup di filesystem peer, diperlakukan non-confidential — `plugins/agent-bus/skills/using-agent-bus/SKILL.md:127`

## Statistik

- agent_list: 5 item (BUS-001…005)
- agent_status: 10 item (BUS-006…015)
- agent_send: 17 item (BUS-016…032)
- Kontrak registry: 4 item (BUS-033…036)
- Kontrak skill using-agent-bus: 11 item (BUS-037…047)
- **Total: 47 item**
