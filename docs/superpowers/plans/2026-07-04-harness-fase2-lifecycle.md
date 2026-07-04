# Fase 2 — Hook-Inversion + Lifecycle (pty-holder, bot-supervisor, hooks, shim) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Task porting merujuk source lama sebagai "kode acuan" — baca file yang dirujuk, jangan tulis ulang dari nol. Recon detail: `.superpowers/sdd/f2/` (recon-wrapper, recon-meta, recon-hooks — hasil 3 subagent 2026-07-04).

**Goal (definisi selesai §9):** bot pilot pindah penuh ke harness baru — `/new /switch /rename /delete /effort /context` jalan; handoff & agent-bus lintas bot-lama↔pilot jalan; PTY-*/BUS-* tercentang; `/doctor` hijau 72 jam.

**Architecture:** `pty-holder` = child tipis pemegang PTY (spawn claude, keystroke, resize, exit — TANPA business logic). `bot-supervisor` di hostd = orkestrasi (spawn/restart holder, injection queue ber-id + ACK, session ops API menggantikan file-pending meta-commands). Hooks cc-stub = sumber kebenaran dari dalam CC (SessionStart→hostd melepas barrier; Stop reply-guard v2; UserPromptSubmit pointer; PreToolUse trailer-guard). Shim legacy ber-tanggal-pensiun menjaga fleet campuran.

**Tech Stack:** Bun + TS (hostd/cc-stub/shared), **node-pty** utk pty-holder (runtime = KEPUTUSAN #1 di gate), grammy (sudah ada), zod.

## Global Constraints

- TANPA Claude Agent SDK / `claude -p`. PTY untuk input; hooks untuk output (§2.1).
- Repo `mirza-harness` main; commit trailer `Agent: bot-03` + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; push segera.
- Diangkut bukan ditulis ulang; bug backlog difix saat porting: **SEC-3** (regex arg `pty_send_slash` lolos char kontrol), **LOSS-1** (encodeProjectDir/jsonl-poll → mati, ganti hook), **LOSS-2** (lock registry → SQLite), **LOSS-3** (double-inject → idempotency bus), **LOSS-8**, **VER-1**, **FUNC-1** (payload null /context), **FUNC-3** (reply-guard), **FUNC-4/5** (trailer guard Bash+PowerShell tokenized), **CONS-3/4** (registry & peer-list tunggal), **IDEA-2** (ack injeksi).
- SCAR pacing/TUI diangkut sebagai konstanta + test: SCAR-001 (split text+`\r`, 250ms), SCAR-002..006 (delay/gap/settle; barrier→ACK dgn timeout sbg alarm doctor), SCAR-007/020 (chunk 100 code-point-safe), SCAR-019 (ConPTY head-drop), SCAR-025 (spawn via cmd.exe /c | login shell), SCAR-029 (`\r` bukan `\n`), SCAR-030/031 (injeksi saat CC belum siap → ACK SessionStart), SCAR-035 (confirmAfterMs picker), SCAR-036/037 (slash-guard + regex), SCAR-038/045 (prompt satu-baris; batch atomik kontigu), SCAR-096 (runtime eksplisit).
- Shim menulis key PERSIS (recon-hooks §D / recon-wrapper §F): `wrapper.state.json {session_id, session_name, lifecycle, seq, updated_at_ms}`, `wrapper.current_session_id/_name`, `wrapper.heartbeat` (5s/30s), `wrapper.pid`, `wrapper.version {plugin_version, wrapper_version}`, `agent-registry.json` + lock O_EXCL, `session-names.json`, `system-outbox session-change`; KONSUMSI `pending/*.json` (single+batch+prompt) dgn sweep+defer (SCAR-021/022). Shim = modul terpisah ber-tanggal-pensiun (target: fase 3).
- Validasi titik tunggal (ambiguitas #2): semua input eksternal (pending file, rpc, hook POST) divalidasi zod di boundary hostd.
- `/effort`: dual-policy dipertahankan — jalur Telegram/supervisor bawa `confirmAfterMs:500` (clamp [50,5000]); jalur AI (`pty_send_slash`) tetap DIBLOKIR total (struktural).
- Atomicity batch (ambiguitas #1): batch = satu unit antrean kontigu di supervisor (single-consumer per bot, terdokumentasi & teruji).

## Peta dependensi

```
P1 pty-holder ──────┬─> S1 supervisor core ──┬─> S2 session-ops API ──> M1 meta-commands port ──┐
H4 trailer-guard ───┤   (butuh P1 + F1 bus)  ├─> H1 SessionStart/ACK   M2 context/telemetry ────┼─> E1' mini-pilot CC (bot-07)
X2 shim consumer ───┘                        ├─> H2 Stop reply-guard v2                         │        │
(paralel wave 1)                             └─> X1 shim writer ────────────────────────────────┘        v
                                                                                       E2' pilot penuh + 72 jam ──> E3' inventaris+laporan
```

Wave 1 (paralel, disjoint): P1 ∥ H4 ∥ X2. Wave 2: S1. Wave 3 (paralel): S2 ∥ H1 ∥ H2 ∥ X1. Wave 4 (paralel): M1 ∥ M2. Lalu E1'→E2'→E3'. Komit per scope oleh controller (pola fase 1).

---

### Task P1: pty-holder — child tipis pemegang PTY

**Files:** `packages/pty-holder/src/{main.ts,pty.ts,inject.ts,ipc.ts}` + test.
**Kode acuan:** `plugins/pty-controller/wrapper/src/wrapper.ts` — spawn chain 553-587 (PTY-039..051, SCAR-025: `cmd.exe /c` Win, login shell `-l -i -c` Unix; env CLAUDE_BIN/ARGS/SHELL 255-267), low-level inject 594-628 (SCAR-001 split text lalu `\r` setelah SUBMIT_DELAY_MS=250; SCAR-029), chunking (SCAR-007/020: CHUNK_SIZE=100 by code-point, CHUNK_DELAY_MS=30; SCAR-019 ConPTY), stdin pipe/resize/SIGINT 748-766, shutdown 1242-1275.
**Interfaces:** protokol IPC parent↔child via stdio NDJSON JSON-RPC (reuse `shared/ipc.ts`): request `inject {id, text, submit:bool}` / `inject-slash {id, command, confirmAfterMs?}` / `resize {cols,rows}` / `shutdown`; event `pty-exit {code, signal}` / `pty-error` / `injected {id}` (ack level-holder = keystroke tertulis, BUKAN semantik selesai). TANPA pengetahuan sesi/nama/barrier.
**Fix:** SCAR-096 — runtime dieksplisitkan (KEPUTUSAN #1); VER-1 — versi dari package.json.
**Test:** unit inject splitting/chunk boundaries (surrogate pair); integrasi spawn proses dummy echo-PTY (bukan claude) verifikasi keystroke sampai utuh; Windows ConPTY smoke.

### Task H4: PreToolUse commit-trailer guard tokenized (paralel wave 1)

**Files:** `packages/cc-stub/hooks/trailer-guard.ts` + `hooks/hooks.json` + test.
**Fix FUNC-4/5** (recon-hooks §A): matcher `Bash|PowerShell`; tokenisasi command → temukan `git ... commit` (izinkan global opts `-C/-c` sebelum subcommand), ekstrak ISI pesan (`-m/-am/-sm/--message[=]/-F/--trailer`), cek trailer `Agent: <bot>` pada ISI itu saja. Test: bypass lama (`-am`, `--message=`), false-positive lama (`grep -m 1 "git commit"`, trailer di heredoc lain) — semua harus benar.

### Task X2: shim consumer pending/*.json (paralel wave 1)

**Files:** `packages/hostd/src/shim/pending-consumer.ts` + test.
**Kode acuan:** wrapper.ts 987-1240 (consumePending, fs.watch+sweep) + `plugins/pty-controller/ipc.ts` & `plugins/agent-bus/prompt-compose.ts` (format payload: `{id,ts,command}` | array batch | `{id,ts,type:"prompt",from,text,hop_count}`).
**Perilaku:** watch+sweep dir pending per bot pilot (SCAR-021 defer 50ms + sweep interval; SCAR-022 retry rename) → validasi zod (titik tunggal; payload rusak → log + karantina `.rejected-<ts>`, terlihat doctor) → prompt → bus `kind:'prompt'`; command/batch → antrean injeksi supervisor (S1; sebelum S1 ada: enqueue bus kind baru `inject-request` yang S1 konsumsi). Idempotency by id (LOSS-3).

### Task S1: bot-supervisor core — spawn holder + injection queue ACK + barrier

**Files:** `packages/hostd/src/supervisor/{supervisor.ts,injection.ts}` + test; modif `main.ts` (wiring per bot), `doctor.ts` (komponen supervisors real).
**Kode acuan:** wrapper.ts 654-745 (InjectionGate/queue/drain; konstanta 209-253) + 825-985 (lifecycle) — logika diangkut, jsonl-polling DIBUANG.
**Perilaku:** spawn/restart pty-holder per bot (backoff eksponensial; status utk doctor); antrean injeksi ber-id: item {id, kind:'slash'|'text'|'batch[]', payload, state} — batch kontigu atomik (ambiguitas #1); gate: MIN_INJECTION_GAP, POST_INJECTION_DELAY, hold saat lifecycle 'resetting' (clear-barrier) — DILEPAS oleh event `session.started` dari hook (H1), timeout 10-menit turun jadi ALARM doctor (SCAR-002..006, SCAR-030/031); `/clear` → set sessions.lifecycle='resetting' + kirim inject-slash; ack per item: sukses = sinyal balik semantik (SessionStart utk /clear; sessions.name berubah utk /rename) — gagal → retry/dead-letter terlihat (IDEA-2). Slash-guards: validasi regex + blokir telegram-layer + `/effort` dari jalur AI (SEC-3 fix: argumen `[^\x00-\x1f]{0,256}`; SCAR-036/037).
**Doctor:** `supervisors: {<bot>: {holder:'running'|'dead', queue:N, awaiting_barrier:bool, last_ack_s}}`.

### Task H1: hook SessionStart + jalur data rename (wave 3)

**Files:** `packages/cc-stub/hooks/session-start.ts`, hostd handler `session.started`, + test.
**Perilaku:** hook POST via pipe RPC `{session_id, source, cwd}` → hostd upsert baris `sessions` (bot dari mapping workspace→bot config), lifecycle 'idle', LEPASKAN barrier antrean (S1); balasan hook membawa `additionalContext: 'Session name: "<name>"'` dari tabel (ganti session-name-context lama; INFRA-5). Rename via jalur data: supervisor.rename menulis sessions.name SETELAH inject `/rename` di-ack + hook/echo konfirmasi — sniffing keystroke PENSIUN. LOSS-1 mati (tidak ada tebak encoding jsonl).

### Task H2: hook Stop — reply-guard v2 (wave 3)

**Files:** `packages/cc-stub/hooks/reply-guard.ts`, hostd handler `stop.check`, + test.
**Fix FUNC-3** (recon-hooks §A): keputusan di hostd — block bila inbound-terakhir Telegram TANPA reply SETELAH tool-use non-reply TERAKHIR (ack awal tak lolos). Data: hostd tahu reply outbound (messages-store) + hook kirim ringkas transcript-tail (atau hostd baca kolom bus) — pilih desain paling sederhana yang test-able; loop-guard `stop_hook_active` dipertahankan. Test: [inbound→ack→tool→stop] = BLOCK; [inbound→ack→tool→reply final→stop] = allow.

### Task X1: shim writer legacy files (wave 3)

**Files:** `packages/hostd/src/shim/legacy-writer.ts` + test.
**Trigger:** subscribe perubahan `sessions` (id/name/lifecycle) + heartbeat tick + boot/shutdown supervisor → tulis SEMUA file legacy (daftar Global Constraints; key persis; atomic tmp+rename retry SCAR-022; registry pakai protokol lock O_EXCL lama saat menulis). `PENSIUN_DATE` konstanta + warning doctor bila masih aktif melewati tanggal. Test: tiap event → file berisi key persis (golden compare dgn format recon).

### Task S2: session-ops API supervisor (wave 3)

**Files:** `packages/hostd/src/supervisor/session-ops.ts` + test; perluasan rpc-handlers.
**Kode acuan:** meta-commands.ts (recon-meta §B tabel pemetaan) + sessions-list.ts (enumerasi jsonl + shortId), archive-store, session-names-registry.
**API:** `clearSession(bot,{name})`, `resume(bot,sessionId)`, `rename(bot,name)` (validasi session-name-rules; unik), `archiveSession/hardDelete/bulk*`, `setEffort(bot,level)` (inject `/effort <level>` + confirmAfterMs:500 — SCAR-035), `listSessions(bot)` (enumerasi jsonl CC lama TETAP sbg sumber list + join nama dari sessions table/registry — histori pra-migrasi), `currentSession(bot)`, `isAlive(bot)`. Semua lewat antrean S1 (ack semantik).

### Task M1: meta-commands port → supervisor (wave 4)

**Files:** `packages/telegram-adapter/src/meta-commands.ts` + test (port dari 1249 baris + test portable dari 1667 baris).
**Kode acuan:** recon-meta §A/§D/§E — routing `tryRouteMetaCommand` + picker paginasi (MAX 6/hal, shortId 8-hex, state in-memory SCAR-051 dipertahankan + pesan expired) + konfirmasi archive/delete/bulk; filesystem ops DIGANTI panggilan session-ops (S2) via deps injectable. Wiring inbound pipeline: intercept meta-command SEBELUM deliver (ganti stub 'meta-command-unhandled-fase1' C4; gate SEC-2 sudah ada). Test portable diangkut (assert panggilan API, bukan file).

### Task M2: /context + /version + telemetri statusline (wave 4)

**Files:** `packages/cc-stub/scripts/context-bridge.ts` (statusline → RPC hostd `telemetry.report`), kolom telemetri di `sessions` (used_percentage, context_window_size, model, effort, cost, captured_at_ms — migrasi schema kecil), `packages/telegram-adapter/src/context-command.ts`, + test.
**Kode acuan:** scripts/context-bridge.ts lama + context-renderer.ts.
**Fix:** FUNC-1 — telemetri belum ada → "(no data yet)", bukan crash. `agent_status` (rpc-handlers) membaca kolom sama (INFRA-5 tuntas). `/version`: dari package.json hostd/holder (VER-1).

### Task E1': mini-pilot — CC asli di bot-07

**Runbook** (bukan kode): cc-stub terpasang di workspace bot-07 (.mcp.json + hooks), hostd+supervisor spawn pty-holder bot-07 → CC hidup → uji: DM dijawab AI beneran; SessionStart tercatat di sessions; `/new nama` dari Telegram → clear + nama benar TANPA polling; `/rename`; reply-guard block bila AI lupa balas; trailer-guard PowerShell. Bukti transkrip + doctor.

### Task E2': pilot penuh + soak 72 jam

Bot pilot (KEPUTUSAN #2) pindah: config hostd + shim aktif; uji silang handoff & agent_send bot-lama↔pilot (pending consumer X2 + registry shim X1); meta-commands lengkap dari HP; monitor doctor 72 jam (cron/loop ringan; kriteria: 0 dead-letter tak terjelaskan, holder tidak restart-loop, shim segar).

### Task E3': centang inventaris PTY-*/BUS-*/SKILL-* + laporan fase

Pola E2 fase 1: verified-live only; DIHAPUS/DIGANTI beralasan (kandidat: PTY-028..038 file-IPC → DIGANTI bus/shim; pty_list_agents → DIGANTI agent_list per CONS-3 — butuh restu #4; LOSS-1 items; rename-sniff items). Update plan + laporan penutup.

---

## Keputusan yang diangkat ke user di gate plan ini

1. **Runtime pty-holder** — node-pty adalah native module; wrapper lama teruji jalan di **Node** (tsx), BUKAN Bun (SCAR-096). Rekomendasi: pty-holder jalan di **Node** (paling aman, kode spawn teruji), sisanya tetap Bun. Alternatif: coba Bun dulu (node-pty support eksperimental), fallback Node bila gagal di P1.
2. **Bot pilot fase 2** — design doc menyarankan bot-02. Pertimbangan: bot-02 = penyusun design doc (sesi penting), bot-03 (aku) sedang mengeksekusi. Rekomendasi: **bot-05 atau bot-06** (paling jarang dipakai — risiko rendah); bot-02 bila mau uji beban nyata.
3. **Konsolidasi skill reply-discipline (CONS-1)** — rekomendasi: mekanisme hook (H2 + pointer 1-baris) di fase 2, merge teks skill immediate-reply+inline-buttons di fase 3 (bareng audit skill §11.4).
4. **`pty_list_agents` DIHAPUS/DIGANTI `agent_list`** (CONS-3) — butuh persetujuan eksplisit (aturan inventaris).

## Keputusan gate (2026-07-05, disetujui user via Telegram)
1. Runtime pty-holder: **Node** (node-pty teruji; sisanya Bun) — FINAL.
2. Bot pilot: **bot-06** — FINAL.
3. reply-discipline: hook fase 2, merge teks skill fase 3 — FINAL.
4. pty_list_agents: **DIGANTI agent_list** (CONS-3) — FINAL.
