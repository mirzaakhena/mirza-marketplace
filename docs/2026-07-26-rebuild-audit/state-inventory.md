# Inventaris State & Konfigurasi — Kondisi SEKARANG

**Tanggal:** 2026-07-26 · Disusun dari kode (`grep` literal nama file + pembacaan `server.ts`, `wrapper.ts`, `ipc.ts`, `registry.ts`), bukan dari ingatan.

**Temuan pokok:** dari 27 artefak state, **hanya 1 yang terpusat** (`~/.claude/agent-registry.json`). Sisanya per-project — 20 file/folder tersebar di dua direktori channel di dalam setiap repo kerja. Itulah sebabnya setup bot baru terasa berulang.

Kolom **Tumbuh?** menandai mana yang membesar tanpa batas (kandidat kebijakan retensi).

---

## A. Per-project — `<project>/.claude/channels/telegram/`

| # | Artefak | Isi & fungsi | Penulis → Pembaca | Tumbuh? | Rahasia? |
|---|---|---|---|---|---|
| A1 | `.env` | `TELEGRAM_BOT_TOKEN` | skill `configure` → server saat boot | tidak | **ya** |
| A2 | `access.json` | `dmPolicy`, `allowFrom`, `groups`, `pending`, 4 knob delivery | server + skill `access` → server (dibaca ulang **setiap pesan**) | tidak | semi (id user) |
| A3 | `messages.db` (+`-wal`,`-shm`) | SQLite log SEMUA pesan masuk & keluar: `messages(id, ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)` | server → server (`/get_message_by_id`) | **ya, tanpa batas** (SCAR-097) | ya (isi percakapan) |
| A4 | `inbox/` | Media terunduh: `<ts>-<file_unique_id>.<ext>` | server → AI (via path di meta) | **ya, tanpa batas** | ya |
| A5 | `system-outbox/` | Event JSON dari plugin sibling → telegram (kini hanya `session-change`) | wrapper → server (hapus-sebelum-proses) | tidak (ephemeral) | tidak |
| A6 | `approved/<senderId>` | Penanda "pairing disetujui" | skill `access` → poller server 5 s | tidak (ephemeral) | tidak |
| A7 | `bot.pid` | PID pemegang slot `getUpdates` (takeover single-consumer) | server → server | tidak | tidak |
| A8 | `last-status.json` | `{captured_at_ms, payload}` — snapshot statusline CC: context %, model, cost, rate limit, effort, session_id | statusline bridge → `/context`, `agent-bus` peer-status, wrapper (resolve nama sesi) | tidak (overwrite) | semi |
| A9 | `chained-statusline` | Perintah statusLine milik user sebelum bridge dipasang | server saat install → bridge tiap fire | tidak | tidak |
| A10 | `session-names.json` | Registry `{<sessionId>: {name, updatedAt}}` | server + wrapper (duplikat, SCAR-077) → picker, hook, wrapper | pelan (per sesi) | tidak |
| A11 | `archived-sessions.json` | `{archived: [<sessionId>]}` — soft-delete | server → enumerasi sesi | pelan | tidak |
| A12 | `goal-state.json` | `{status, condition, startedAt}` per session id | skill `goal` → skill `goal` | pelan | tidak |

## B. Per-project — `<project>/.claude/channels/pty-controller/`

| # | Artefak | Isi & fungsi | Penulis → Pembaca | Tumbuh? |
|---|---|---|---|---|
| B1 | `pending/*.json` | **Inbox IPC** — perintah yang akan disuntik ke PTY. Tiga penulis: meta-command telegram, tool `pty_send_slash`, `agent_send` dari bot lain | 3 penulis → wrapper (hapus-sebelum-proses) | tidak (ephemeral) |
| B2 | `wrapper.state.json` | `{session_id, session_name, lifecycle, seq, updated_at_ms}` — sumber kebenaran identitas sesi | wrapper → agent-bus, telegram | tidak |
| B3 | `wrapper.current_session_id` | Mirror legacy dari B2 | wrapper → pembaca lama | tidak |
| B4 | `wrapper.current_session_name` | Mirror legacy dari B2 (file kosong = tak bernama) | wrapper → hook `session-name-context`, agent-bus legacy | tidak |
| B5 | `wrapper.heartbeat` | Timestamp ISO, disegarkan tiap 5 s; segar = < 30 s | wrapper → 3 pembaca (pty ipc, telegram meta-commands, agent-bus) | tidak |
| B6 | `wrapper.pid` | PID wrapper untuk probe liveness sinyal-0 | wrapper → pembaca liveness | tidak |
| B7 | `wrapper.version` | `{plugin_version, wrapper_version}` — dipakai gating fitur (batch butuh ≥ 0.0.7) | wrapper saat boot → tool `pty_send_slash`, `/version` | tidak |
| B8 | `wrapper.log` | Log aktivitas wrapper (append) | wrapper → manusia saat debug | **ya, tanpa batas** |

## C. Per-project — lain-lain

| # | Artefak | Fungsi |
|---|---|---|
| C1 | `<project>/.claude/settings.json` → key `statusLine` | Tempat bridge `/context` dipasang; settings lama dibackup ke `settings.json.backup-<ts>` (menumpuk) |
| C2 | `<project>/.claude/channels/.gitignore` | `*` + `!.gitignore` — melindungi seluruh state channel dari ter-commit |

## D. Terpusat (satu-satunya, hari ini)

| # | Artefak | Fungsi |
|---|---|---|
| D1 | `~/.claude/agent-registry.json` (+ `.lock`) | Registry fleet: `{schema_version, agents: {<nama>: {project_dir, state_dir, registered_at, last_heartbeat, wrapper_pid}}}`. Ditulis wrapper, dibaca `agent-bus`. Nama bot = **basename project_dir**. Serialisasi lintas-proses via lockfile (busy-wait sinkron yang membekukan PTY — SCAR-016) |

## E. Milik Claude Code — kita hanya MEMBACA

| # | Artefak | Dipakai untuk |
|---|---|---|
| E1 | `~/.claude/projects/<encoded-cwd>/*.jsonl` | Transkrip lengkap tiap sesi. Dipakai: enumerasi sesi untuk picker `/switch`, deteksi sesi baru pasca-`/clear` (poll 500 ms), hard-delete sesi. Encoding: `[\\/:]` → `-` |
| E2 | `~/.claude/sessions/<pid>.json` | Peta pid → `{cwd, name}` sesi aktif; dipakai menyegarkan registry nama |
| E3 | `~/.claude/plugins/{marketplaces,cache}/**` | Salinan updater + cache build per versi (three-copy doctrine) |
| E4 | `installed_plugins.json` | Resolve versi plugin sibling untuk `/version` |

## F. Per-repo-kerja (bukan per-bot, bukan terpusat)

| # | Artefak | Fungsi |
|---|---|---|
| F1 | `<repo-kerja>/.handoff/<ts>-prompt-<slug>.md` | File handoff antar bot |
| F2 | `<repo>/.daily-reports/<date>.md`, `.daily-report.todo.md` | Arsip laporan harian + TODO |
| F3 | Vault Obsidian eksternal (`mirza-vault`) | Second brain lintas-bot |

## G. Env var yang dihormati

| Env var | Fungsi |
|---|---|
| `CLAUDE_PROJECT_DIR` | Basis default semua state dir + enumerasi sesi |
| `TELEGRAM_STATE_DIR` | Override state dir telegram |
| `CLAUDE_CHANNELS_DIR` | Override basis dir channels (dipakai wrapper) |
| `PTY_CONTROLLER_STATE_DIR` | Override state dir pty; wrapper menyetelnya untuk proses CC anak |
| `TELEGRAM_BOT_TOKEN` | Token (env nyata menang atas `.env`) |
| `TELEGRAM_ACCESS_MODE=static` | Mode static — **DROP** (area 01 §1.4) |
| `TELEGRAM_DISABLE_MESSAGES_STORE=1` | Matikan messages.db |
| `AGENT_REGISTRY_PATH` | Override lokasi registry fleet |
| `CLAUDE_BIN`, `CLAUDE_ARGS`, `SHELL` | Cara wrapper men-spawn Claude Code |

---

## Ringkasan untuk keputusan pemusatan

| Kategori | Artefak | Sifat |
|---|---|---|
| **Konfigurasi** (jarang berubah, ditulis manusia) | A1 token, A2 allowlist, + daftar bot (baru) | Kandidat pemusatan **jelas** |
| **Data percakapan** (tumbuh, bernilai lintas-bot) | A3 messages.db, A4 inbox | Kandidat pemusatan **kuat** — inti ide "bot mengintip percakapan bot lain" |
| **State identitas & liveness** (per-bot, cepat berubah) | B2–B7, A8, A10, A11, A12, D1 | Bisa jadi satu store terpusat berkolom `bot`, atau tetap per-bot |
| **Kanal ephemeral** (antrean, hapus-setelah-proses) | A5 system-outbox, A6 approved, B1 pending | Bentuknya harus diputuskan bersama arsitektur (file vs tabel vs in-process) |
| **Artefak kerja** (milik repo, bukan milik bot) | F1 handoff, F2 daily-report | Tetap di repo kerja — memang seharusnya ikut repo |
| **Milik Claude Code** | E1–E4 | Hanya dibaca; tak bisa dipindah |
