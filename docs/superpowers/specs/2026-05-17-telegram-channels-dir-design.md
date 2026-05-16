# Telegram Channel — Per-Project Channels Directory — Design Spec

**Status**: Design approved (2026-05-17)
**Source**: User request — install plugin sekali di `user` scope, tapi token/db/state per-folder agar multi-folder bisa pakai bot Telegram berbeda secara paralel; layout & gitignore harus clean dan channel-agnostic (siap untuk plugin masa depan: WhatsApp dst.)
**Implementation target**: `plugins/telegram/`
**Version bump**: `0.0.6-mirza.1` → `0.0.7-mirza.1`
**Backward compatibility**: **none — clean break**. Fork personal tanpa user lain; lokasi lama tidak dipertahankan dan tidak ada migration code.

## Purpose & Scope

### Purpose

Hari ini plugin Telegram channel menyimpan semua state operasional (token `.env`, allowlist `access.json`, histori `messages.db`, attachment `inbox/`, lock `bot.pid`) di **satu lokasi global**: `~/.claude/channels/telegram/`. Sementara itu fitur `/context` (commit 5d20a73) sudah mempelopori state per-project tapi di lokasi terpisah `<project>/.telegram-state/`, dengan fallback `process.cwd()` yang divergent dari konvensi resolusi.

Konsekuensinya:

1. **Token "berpindah" antar folder**: kalau session CC dibuka di repo A lalu di repo B, MCP server kedua men-depak yang pertama (Telegram API: 1 poller per token). State global mengasumsikan satu setup Telegram per mesin.
2. **Tidak ada isolasi**: bug di `access.json` satu project merusak semua project; token leak punya blast radius global.
3. **Tidak bisa multi-bot**: satu user yang ingin pakai bot berbeda untuk konteks berbeda (kerja vs personal) tidak punya jalan rapi.
4. **State terbelah**: `/context` di satu folder, sisanya di lokasi lain — UX membingungkan, gitignore harus mengejar dua tempat.
5. **Tidak channel-agnostic**: kalau besok kita tambah WhatsApp atau Discord plugin, semua decision di atas harus diulang.

Spec ini menutup semua gap dalam satu layout:
- 1× install plugin (`user` scope), state otomatis per-folder
- Multi-token paralel, isolasi penuh
- Channel-agnostic layout siap untuk plugin tambahan
- Gitignore strategi self-contained, satu file cover semua channel
- Resolusi strict (no cwd fallback, no silent surprise)

### In scope

- Refactor `STATE_DIR` resolution di `server.ts` menjadi explicit resolution chain dengan error exit kalau tidak ter-resolve.
- Helper bash `scripts/resolve-state-dir.sh` untuk testability & standalone debug.
- Update `skills/configure/SKILL.md` & `skills/access/SKILL.md` agar pakai chain (inline 6 baris; helper tidak di-source dari skill).
- **Unifikasi dengan `/context`**: hapus `projectDir()` helper (`server.ts:805-807`), pakai `resolveStateDir()` strict; pindahkan `last-status.json` & `chained-statusline` ke channel state dir; update `ensureContextBridgeInstalled()` & `scripts/context-bridge.sh`.
- Auto-create `.claude/channels/.gitignore` self-contained (Opsi Y, single file covers all current & future channels).
- Version bump + README rewrite (paths, per-folder model, install scope guidance).
- Unit test untuk resolver + gitignore handler; integration test untuk server boot; smoke test untuk /context bridge dengan layout baru.

### Out of scope

- **Backward compat dengan upstream `claude-plugins-official`** atau dengan fork versi sebelumnya: clean break. Tidak ada migration code, tidak ada path lama yang di-support.
- **Migration tooling**: tidak ada `.telegram-state/` lama yang harus di-pindah — user pemilik fork (sole user) sudah wipe global state dan tidak menggunakan `/context` di repo manapun yang harus diselamatkan. Kalau ada user lain di masa depan: re-configure manual.
- **Cleanup otomatis project `.gitignore` legacy lines**: existing `.gitignore` di repo punya block runtime-state (access.json, approved/, dst.) yang blanket-match. Karena layout baru self-contain di `.claude/channels/`, baris-baris itu tidak harm (overlap) tapi juga tidak perlu. Cleanup manual sebagai catatan implementor.
- **Multi-token failover / pool**: 1 project = 1 token tetap konstrain Telegram API.
- **Cross-project shared allowlist**: setiap project punya `access.json` independen. Tidak ada inheritance.
- **GUI / settings panel**: configure tetap via skill.

## Decisions

| Aspek | Keputusan |
|---|---|
| Lokasi state per-channel | `<project>/.claude/channels/<channel-name>/` (mirror upstream `~/.claude/channels/<channel-name>/`) |
| Lokasi state Telegram | `<project>/.claude/channels/telegram/` |
| Deteksi project root | Env `$CLAUDE_PROJECT_DIR` (CC set otomatis untuk MCP server, skill bash, dan statusLine) |
| Fallback | **Strict error**: exit 1 kalau env tidak teridentifikasi. **No cwd fallback anywhere.** |
| Override eksplisit | Env `TELEGRAM_STATE_DIR` masih menang (escape hatch untuk dev/test). Plugin masa depan punya `WHATSAPP_STATE_DIR` dst. (per-plugin) |
| Gitignore strategy | Self-contained `<project>/.claude/channels/.gitignore` dengan content `*\n!.gitignore\n` (Opsi Y). File `.gitignore` itu sendiri tracked di git. |
| Backward compat | Tidak ada |
| Install scope yang direkomendasikan | `user` (sekali install, otomatis per-folder) |
| Resolver unification | `projectDir()` di server.ts (baris 805-807) dihapus; semua kode pakai satu resolver |

## Architecture

Resolution chain (priority order, identik antara TS & bash):

```
1. $TELEGRAM_STATE_DIR                                      ← escape hatch (per-plugin)
2. $CLAUDE_PROJECT_DIR/.claude/channels/telegram/           ← default
3. ⛔ exit 1 with diagnostic message                        ← strict, no cwd fallback
```

Code tetap di plugin cache (1 copy, shared across all sessions); state per-folder; gitignore auto-managed di level `channels/`.

```
~/.claude/plugins/cache/mirza-marketplace/telegram/0.0.7-mirza.1/   SHARED CODE
├── server.ts                       ← reads CLAUDE_PROJECT_DIR per session
├── state-path.ts                   ← NEW: pure resolver
├── messages-store.ts
├── album-buffer.ts
├── scripts/
│   ├── resolve-state-dir.sh        ← NEW: bash helper (tests + debug)
│   ├── gitignore-handler.sh        ← NEW: ensures channels/.gitignore
│   └── context-bridge.sh           ← UPDATED: strict resolution, new path
├── skills/{configure,access}/SKILL.md
└── .mcp.json                       ← unchanged (server resolves env itself)

<repo-A>/.claude/                    PER-FOLDER (project A)
├── settings.json                   (CC-managed, /context patches statusLine here)
├── settings.local.json             (CC-managed, plugin install scope)
└── channels/
    ├── .gitignore                  (auto: "*\n!.gitignore\n", tracked)
    └── telegram/                   (all telegram state — sensitive & operational together)
        ├── .env                    (token)
        ├── access.json             (pairing, allowlist)
        ├── messages.db             (chat history)
        ├── messages.db-shm, .db-wal
        ├── inbox/                  (attachments)
        ├── approved/
        ├── bot.pid                 (lock file)
        ├── last-status.json        (from /context)
        └── chained-statusline      (from /context)

<repo-B>/.claude/channels/telegram/  PER-FOLDER (project B, isolated)
└── ... (token B, separate bot, separate everything)
```

**Future channels** (`whatsapp/`, `discord/`, dst.) tinggal di subfolder `.claude/channels/`. Gitignore self-contained cover otomatis.

## Components

### 1. `plugins/telegram/state-path.ts` (new)

Pure function, mudah di-unit-test:

```ts
import { join } from 'path'

export function resolveStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.TELEGRAM_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (projectDir) return join(projectDir, '.claude', 'channels', 'telegram')
  return null
}

export function resolveChannelsDir(env: Record<string, string | undefined>): string | null {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (projectDir) return join(projectDir, '.claude', 'channels')
  return null
}
```

Dua fungsi: `resolveStateDir()` untuk channel-specific path; `resolveChannelsDir()` untuk parent `channels/` directory (dipakai gitignore handler).

### 2. `plugins/telegram/server.ts`

Empat perubahan:

**(a)** Replace baris 27-28 (current STATE_DIR resolution) dengan:
```ts
import { resolveStateDir } from './state-path.ts'

const STATE_DIR = resolveStateDir(process.env)
if (!STATE_DIR) {
  process.stderr.write(
    `telegram channel: cannot determine state directory.\n` +
    `  CLAUDE_PROJECT_DIR is not set (Claude Code sets this automatically when you start a session in a project).\n` +
    `  Or set TELEGRAM_STATE_DIR explicitly.\n`
  )
  process.exit(1)
}
process.stderr.write(`telegram channel: state dir = ${STATE_DIR}\n`)
```

**(b)** Pesan error "TELEGRAM_BOT_TOKEN required" (baris 47-52) di-update menyebut STATE_DIR aktif (sudah pakai ENV_FILE turunan, tinggal pastikan formatting jelas).

**(c)** **Delete** `projectDir()` helper (baris 805-807). Semua call site (baris 843, 857, 891, 902, dll.) ganti pakai `STATE_DIR` (yang sudah tersedia top-level karena boot resolusi sudah jalan).

**(d)** Update `ensureContextBridgeInstalled()`:
- `<project>/.claude/settings.json` path tetap (CC-managed, di luar channel state)
- `<project>/.telegram-state/` references → `STATE_DIR` (= `<project>/.claude/channels/telegram/`)
- `chained-statusline` write → `join(STATE_DIR, 'chained-statusline')`
- Hapus self-write `.gitignore: *\n` di state dir (sudah di-cover Opsi Y di parent `channels/`)
- Sebelum write apa pun, panggil **`ensureChannelsGitignore()`** — implementasi TS native (bukan spawn bash) yang menulis konten `*\n!.gitignore\n` ke `<channels>/.gitignore` kalau belum ada / pattern beda. Logic identik dengan helper bash di Component 4; dua copy spec-mandated stay in sync.
- Backup `settings.json.backup-<timestamp>` tetap di `.claude/` (bukan state)

**(e)** Update `loadLastStatus()` (baris 842-849): path → `join(STATE_DIR, 'last-status.json')`.

### 3. `plugins/telegram/scripts/resolve-state-dir.sh` (new)

Bash helper untuk testability & standalone debug. Kontrak identik dengan TS:

```bash
#!/usr/bin/env bash
# Echo resolved state dir to stdout, or print error to stderr and return 1.
resolve_state_dir() {
  if [ -n "$TELEGRAM_STATE_DIR" ]; then
    echo "$TELEGRAM_STATE_DIR"; return 0
  fi
  if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    echo "$CLAUDE_PROJECT_DIR/.claude/channels/telegram"; return 0
  fi
  echo "telegram: CLAUDE_PROJECT_DIR not set; cannot derive state dir" >&2
  return 1
}

resolve_channels_dir() {
  if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    echo "$CLAUDE_PROJECT_DIR/.claude/channels"; return 0
  fi
  echo "telegram: CLAUDE_PROJECT_DIR not set; cannot derive channels dir" >&2
  return 1
}
```

**Consumption pattern**: skill **tidak source helper** (path tidak deterministik dari skill bash context). Skill **inline-kan resolution chain verbatim** — 8 baris. Helper tetap dibuat untuk: (a) bash test suite, (b) standalone debug user. Spec mewajibkan: jika resolusi diubah, **dua tempat** (helper + skill inline) update bersamaan; bash test menangkap regresi di helper.

### 4. `plugins/telegram/scripts/gitignore-handler.sh` (new)

Helper untuk ensure self-contained `.gitignore` di `.claude/channels/`:

```bash
#!/usr/bin/env bash
# Ensure <project>/.claude/channels/.gitignore exists with self-contained pattern.
# Idempotent — safe to call on every plugin operation.
ensure_channels_gitignore() {
  local channels_dir="$1"
  local ignore_file="$channels_dir/.gitignore"

  mkdir -p "$channels_dir" 2>/dev/null || return 1

  if [ -f "$ignore_file" ]; then
    if grep -qE "^\*$" "$ignore_file" && grep -qE "^!\.gitignore$" "$ignore_file"; then
      return 0   # already covers; idempotent
    fi
  fi

  cat > "$ignore_file" <<'EOF'
# Auto-managed by Claude Code channel plugins.
# Channel state is per-project: tokens, db, pairing data, etc.
# This .gitignore protects all subdirs (telegram/, whatsapp/, ...) from being committed.
*
!.gitignore
EOF
}
```

Dipanggil dari:
- Skill `/telegram:configure` (saat pertama kali write `.env`)
- Server `ensureContextBridgeInstalled()` (saat `/context` first install)

Idempotent — repeated invocations no-op.

### 5. `plugins/telegram/scripts/context-bridge.sh` — UPDATED

Existing path hardcoded ke `$PROJECT_DIR/.telegram-state`. Update ke strict resolution + new path:

```bash
#!/usr/bin/env bash
set -u

if [ -z "${CLAUDE_PROJECT_DIR:-}" ]; then
  echo "context-bridge: CLAUDE_PROJECT_DIR not set; cannot capture status" >&2
  exit 0   # don't block statusLine chain — silent fail
fi

STATE_DIR="$CLAUDE_PROJECT_DIR/.claude/channels/telegram"
STATE_FILE="$STATE_DIR/last-status.json"
CHAIN_FILE="$STATE_DIR/chained-statusline"
mkdir -p "$STATE_DIR" 2>/dev/null

INPUT="$(cat)"
NOW_MS=$(( $(date +%s) * 1000 ))

TMP="$STATE_FILE.tmp.$$"
if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -c --argjson ts "$NOW_MS" '{captured_at_ms: $ts, payload: .}' > "$TMP" 2>/dev/null \
        || printf '{"captured_at_ms":%s,"payload":%s}' "$NOW_MS" "$INPUT" > "$TMP"
else
    printf '{"captured_at_ms":%s,"payload":%s}' "$NOW_MS" "$INPUT" > "$TMP"
fi
mv -f "$TMP" "$STATE_FILE" 2>/dev/null

if [ -s "$CHAIN_FILE" ]; then
    CHAIN_CMD="$(cat "$CHAIN_FILE")"
    if [ -n "$CHAIN_CMD" ]; then
        printf '%s' "$INPUT" | sh -c "$CHAIN_CMD"
        exit $?
    fi
fi
```

**Catatan**: `context-bridge.sh` exit 0 (silent) saat env missing — statusLine chain tidak boleh broken oleh missing capture. Berbeda dari server boot yang strict exit 1 (boot adalah moment dimana user pasti expect plugin jalan).

### 6. `plugins/telegram/skills/configure/SKILL.md` — UPDATED

Empat tempat berubah:

- **Header doc string**: hapus mention `~/.claude/channels/telegram/`, ganti deskripsi generik "the current project's state directory".
- **No-args (status) branch**: resolve STATE_DIR via inline chain, baca `$STATE_DIR/.env` & `$STATE_DIR/access.json`.
- **Save-token branch (`<token>`)** — urutan operasi:
  1. Resolve STATE_DIR via inline chain (atau error kalau `CLAUDE_PROJECT_DIR` unset)
  2. Resolve CHANNELS_DIR = `$CLAUDE_PROJECT_DIR/.claude/channels`
  3. `mkdir -p "$STATE_DIR"`
  4. **NEW** — source/inline `ensure_channels_gitignore "$CHANNELS_DIR"` (creates `.claude/channels/.gitignore`)
  5. Update `$STATE_DIR/.env` (preserve other keys)
  6. `chmod 600 "$STATE_DIR/.env"`
  7. Print status + next steps
- **Clear branch (`clear`)**: delete entry dari `$STATE_DIR/.env`.

### 7. `plugins/telegram/skills/access/SKILL.md` — UPDATED

6 referensi path hardcoded → ganti dengan inline resolution. Logika access policy tidak berubah. Atomic write (rename) untuk `access.json` dipertahankan.

### 8. `plugins/telegram/.claude-plugin/plugin.json` — UPDATED

Version: `0.0.6-mirza.1` → `0.0.7-mirza.1`.

### 9. `plugins/telegram/.mcp.json` — UNCHANGED

Server resolve env sendiri (Approach A dari brainstorming).

### 10. `plugins/telegram/README.md` — UPDATED

Major rewrite:

- Tambah entry baru di tabel perubahan: "Per-project channels directory + strict project mode + unified `/context` storage"
- Ganti semua referensi `~/.claude/channels/telegram/` dan `<project>/.telegram-state/` → `<project>/.claude/channels/telegram/`
- Tambah section baru: **Install Scope Guidance** (lihat berikutnya)
- Catat konstrain: "Multi-folder paralel butuh token bot berbeda per folder. 1 token = 1 poller (Telegram API)."
- Tambah catatan: gitignore self-managed di `.claude/channels/.gitignore`, no parent mutation

### 11. Root marketplace `README.md` — MINOR UPDATE

Mention install scope guidance briefly di section "Instalasi di Claude Code" — tunjuk ke README plugin Telegram untuk detail.

## Install Scope Guidance (new README section)

Plugin Telegram dirancang untuk dipasang sekali, state otomatis per-folder. Rekomendasi:

| Scope | Behavior dengan per-project state | Direkomendasikan? |
|---|---|---|
| `user` | 1× install. Plugin aktif di **semua** CC session. Setiap folder yang Anda buka CC otomatis dapat state dir sendiri. Multi-token paralel langsung jalan. | ✅ **Default** untuk multi-folder use case |
| `project` | Per-repo, ter-commit ke git. Kolaborator yang clone repo akan diminta install. State terpisah per-mesin per-kolaborator. | Tim yang sengaja pakai Telegram channel di repo ini |
| `local` | Per-repo, gitignored, hanya Anda. | Eksperimen 1 folder saja |

**Multi-folder workflow:**

```
# 1× install di mesin Anda (user scope)
> /plugin marketplace add mirzaakhena/mirza-marketplace
> /plugin install telegram@mirza-marketplace   # pilih: user scope
> /reload-plugins

# Setiap project pakai bot Telegram berbeda:
$ cd ~/Work/projectA && claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
> /telegram:configure 111:AAH...   # bot A → state: ~/Work/projectA/.claude/channels/telegram/
> /telegram:access pair <code>

$ cd ~/Work/projectB && claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
> /telegram:configure 222:BBI...   # bot B (beda token!) → state: ~/Work/projectB/.claude/channels/telegram/
> /telegram:access pair <code>

# Dua session paralel, masing-masing bot sendiri, no contention.
```

## Data Flow

### Boot MCP server

```
CC session at <repo-A> → spawn MCP server
  env passed: CLAUDE_PROJECT_DIR=<repo-A>

server.ts:
  1. STATE_DIR = resolveStateDir(env)
     → "<repo-A>/.claude/channels/telegram"
  2. stderr: "telegram channel: state dir = <repo-A>/.claude/channels/telegram"
  3. mkdirSync(STATE_DIR, { mode: 0o700 })
  4. load .env → TELEGRAM_BOT_TOKEN (or exit 1 if missing, with STATE_DIR in message)
  5. messagesStore.init() — creates messages.db inside STATE_DIR
  6. Check stale bot.pid; SIGTERM if alive; write own PID
  7. Start grammy polling
```

### Configure token

```
User in CC at <repo-A>: /telegram:configure 123:AAH...
  → skill bash (CWD = <repo-A>):
    1. inline chain → STATE_DIR, CHANNELS_DIR
    2. mkdir -p "$STATE_DIR"
    3. ensure_channels_gitignore "$CHANNELS_DIR"
       → creates .claude/channels/.gitignore with "*\n!.gitignore\n"
    4. write/update "$STATE_DIR/.env"
    5. chmod 600
    6. echo status
  → /reload-plugins → server picks up new token
```

### /context first install

```
User in CC at <repo-A>: /context
  → MCP tool dipanggil di server.ts:
    1. ensureContextBridgeInstalled():
       a. Patch <repo-A>/.claude/settings.json (statusLine → context-bridge.sh path)
       b. Save chained command → STATE_DIR/chained-statusline
       c. ensure_channels_gitignore (idempotent)
       d. Backup old settings.json → .claude/settings.json.backup-<ts>
    2. Reply: "Bridge terpasang, tunggu statusline refresh"
  → CC statusLine triggers context-bridge.sh:
    - Capture stdin JSON → STATE_DIR/last-status.json (atomic via tmp + rename)
    - Chain to previous command
  → User: /context again → server reads STATE_DIR/last-status.json, replies with formatted snapshot
```

### Two-project parallel

```
Terminal 1 at <A>:                          Terminal 2 at <B>:
  MCP spawn, ENV=<A>                          MCP spawn, ENV=<B>
  STATE_DIR=<A>/.claude/channels/telegram     STATE_DIR=<B>/.claude/channels/telegram
  Token A → poll Bot A                        Token B → poll Bot B
       ↕                                           ↕
  inbox <A>                                   inbox <B>
  messages.db <A>                             messages.db <B>
  last-status.json <A>                        last-status.json <B>

  Bot A msgs route to session 1               Bot B msgs route to session 2
```

## Error Handling

Prinsip: **fail loud pada error konfigurasi (server boot, skill ops); fail silent pada statusLine bridge** (bridge tidak boleh break terminal display).

### Server boot

| Kondisi | Penanganan | Exit |
|---|---|---|
| Kedua env (TELEGRAM_STATE_DIR, CLAUDE_PROJECT_DIR) kosong | stderr: 2-baris instruction; menyebut kedua env names | 1 |
| `TELEGRAM_STATE_DIR` ke path invalid (mkdir gagal) | stderr: `cannot create <path>: <errno>` | 1 |
| `.env` tidak ada / tidak ada TELEGRAM_BOT_TOKEN | stderr menyebut STATE_DIR aktif & file expected | 1 |
| `messages.db` init fail | propagate exception | 1 |
| Stale PID kill — proses sudah hilang (ESRCH) | silent (existing try/catch baris 70-76) | — |
| 409 Conflict dari Telegram (token in use elsewhere) | log explicit: "token in use by another poller. Check other projects with same TELEGRAM_BOT_TOKEN." Server tetap hidup (grammy retry). | — |

Semua error message **menyebut STATE_DIR aktif**.

### `/telegram:configure` skill

| Kondisi | Penanganan |
|---|---|
| CLAUDE_PROJECT_DIR unset | exit 1 dengan instruction "Run from a CC session at your project root" |
| Token format invalid | soft warning, biarkan user putuskan |
| `mkdir $STATE_DIR` fails | error + abort |
| `.env` write fails | error + abort |
| `chmod 600` fails (cross-FS) | warning, lanjut save |
| `ensure_channels_gitignore` fails (perm) | **soft-fail**: token saved; print prominent warning |
| `.gitignore` sudah ada dengan pattern benar | silent skip (idempotent) |

### `/telegram:access` skill

| Kondisi | Penanganan |
|---|---|
| `access.json` tidak ada | default `{ dmPolicy: "pairing", allowFrom: {}, pending: {} }` (existing) |
| `access.json` corrupt | server side handle (rename → `.corrupt`, restart fresh). Skill side: read fail → error + suggest reload |
| Pairing code tidak ditemukan | user error message |
| Write race vs server | atomic write via tmp + rename (existing) |

### `/context` bridge (statusLine)

| Kondisi | Penanganan |
|---|---|
| `CLAUDE_PROJECT_DIR` unset | exit 0 silent — DO NOT break statusLine; user sees previous statusLine output unchanged |
| `mkdir $STATE_DIR` fails | silent skip capture; still chain to previous command |
| `jq` not installed | fallback to raw JSON write (existing logic) |
| Write race (server reading while bridge writing) | atomic via tmp + rename (existing) |

### `/context` server side (`ensureContextBridgeInstalled`)

| Kondisi | Penanganan |
|---|---|
| `.claude/settings.json` corrupt | return `{ kind: 'error', message: <details> }` (existing) |
| `.gitignore` setup fails | log warning, continue (token / context bridge are more important) |
| `settings.json` backup fails | log, continue without backup |
| `STATE_DIR` write fails (chained-statusline) | error result, abort install — user can retry |

### Konsekuensi per-project isolation

- Corrupt state di repo A tidak mempengaruhi repo B.
- Recovery: `rm -rf <repo>/.claude/channels/telegram/` reset 1 channel di 1 project.
- Token leak terisolasi: 1 token = 1 repo.
- `.claude/channels/.gitignore` self-contained: hilang kalau dihapus, tapi semua subdir tetap protected karena `.gitignore` di-create ulang pada operasi berikutnya.

## Testing Strategy

### Unit tests (new)

**`state-path.test.ts`** — pure function matrix untuk `resolveStateDir()`:

| Test | TELEGRAM_STATE_DIR | CLAUDE_PROJECT_DIR | Expected |
|---|---|---|---|
| Both empty | unset | unset | `null` |
| Empty string treated as unset | `""` | `""` | `null` |
| Override only | `/tmp/foo` | unset | `/tmp/foo` |
| Project only | unset | `/repo` | `/repo/.claude/channels/telegram` |
| Override wins | `/tmp/foo` | `/repo` | `/tmp/foo` |
| Trailing slash normalized | unset | `/repo/` | `/repo/.claude/channels/telegram` |

Plus `resolveChannelsDir()`:

| Test | CLAUDE_PROJECT_DIR | Expected |
|---|---|---|
| Unset | unset | `null` |
| Set | `/repo` | `/repo/.claude/channels` |

### Bash helper tests

**`scripts/resolve-state-dir.test.sh`** — exec-based:
- Override wins
- Project derive
- Neither set → exit 1
- `resolve_channels_dir` derive
- `resolve_channels_dir` neither set → exit 1

**`scripts/gitignore-handler.test.sh`** — pakai `mktemp -d`:
- No `.gitignore` → create dengan content benar (`*\n!.gitignore\n`)
- `.gitignore` sudah ada dengan pattern benar → no-op
- `.gitignore` ada tapi pattern beda → overwrite (atau: keep, log warning — pilih saat impl, prefer overwrite untuk keep contract simple)
- Channels dir belum ada → mkdir + write
- Idempotent: run 2× → file content sama
- Write-protected channels dir → graceful failure (return 1)

### Integration test

**`server-boot.test.ts`** — spawn server.ts dengan env varied:
- Neither env → exit 1, stderr berisi instruction
- `CLAUDE_PROJECT_DIR=<tmpdir>` + `.env` exists → start, stderr menyebut state dir
- `CLAUDE_PROJECT_DIR=<tmpdir>` + `.env` missing → exit 1 dengan path expected
- `TELEGRAM_STATE_DIR=<tmpdir>` overrides project dir

### Existing tests harus tetap pass

- `messages-store.test.ts`
- `album-buffer.test.ts`

### Manual smoke test (end-to-end)

1. **Fresh repo test**: `mkdir /tmp/smoke && cd /tmp/smoke && git init` → CC launch → `/telegram:configure <token>`. Verify:
   - `.claude/channels/.gitignore` created dengan content `*\n!.gitignore\n`
   - `.claude/channels/telegram/.env` exists, chmod 600
   - `git status` shows `.claude/channels/.gitignore` (tracked, by design) but **not** `telegram/` content
2. **/context bridge test**: di /tmp/smoke, jalankan `/context`. Verify:
   - `.claude/settings.json` patched (statusLine command → context-bridge.sh path)
   - `.claude/channels/telegram/chained-statusline` exists
   - Setelah beberapa detik, `.claude/channels/telegram/last-status.json` muncul
   - `/context` kedua kali → bot kirim formatted snapshot
3. **Two-repo concurrent**: two terminals, two folders, two tokens. `/hello` ke bot A → muncul di terminal A only. `lsof` confirm isolated handles per state dir.
4. **Idempotency**: `/telegram:configure <token>` 2× → `.gitignore` tetap 1 file, content sama, no duplicate.
5. **Error UX**: `bun server.ts` standalone tanpa env → stderr instructional message clear, exit 1.
6. **statusLine missing env**: simulate context-bridge.sh tanpa `CLAUDE_PROJECT_DIR` → exit 0 silent (verify via `echo $?`), no error to user.

### Coverage gap yang diterima

| Area | Alasan |
|---|---|
| `/telegram:access pair <code>` end-to-end | Butuh real Telegram interaction; manual smoke only |
| `/context` end-to-end di non-Mac OS | Existing code masih cross-platform path; manual smoke di Mac sebagai default |
| Race 2 skill writes paralel | Atomic rename sudah cukup |
| Windows path | Plugin existing sudah dokumentasi "no-op on Windows" untuk chmod; `path.join` cross-platform |

## File Changes Summary

| File | Action | Notes |
|---|---|---|
| `plugins/telegram/server.ts` | Modify | New resolver + state-path import + delete `projectDir()` helper + update `loadLastStatus()` & `ensureContextBridgeInstalled()` to new path + call `ensure_channels_gitignore` |
| `plugins/telegram/state-path.ts` | Create | Pure resolver functions |
| `plugins/telegram/state-path.test.ts` | Create | Unit tests |
| `plugins/telegram/scripts/resolve-state-dir.sh` | Create | Bash helper |
| `plugins/telegram/scripts/resolve-state-dir.test.sh` | Create | Bash helper tests |
| `plugins/telegram/scripts/gitignore-handler.sh` | Create | Channels gitignore manager |
| `plugins/telegram/scripts/gitignore-handler.test.sh` | Create | Tests (tmpdir-based) |
| `plugins/telegram/scripts/context-bridge.sh` | Modify | Strict resolution; new path; `set -u` retained |
| `plugins/telegram/server-boot.test.ts` | Create | Integration test |
| `plugins/telegram/skills/configure/SKILL.md` | Rewrite path refs + add gitignore step | 4 sections updated |
| `plugins/telegram/skills/access/SKILL.md` | Rewrite path refs | 6 references |
| `plugins/telegram/.claude-plugin/plugin.json` | Version bump | 0.0.7-mirza.1 |
| `plugins/telegram/.mcp.json` | UNCHANGED | per Approach A |
| `plugins/telegram/README.md` | Rewrite | Per-folder model, install scope, new paths, gitignore strategy |
| `README.md` (root marketplace) | Minor update | Pointer ke install scope guidance |

**Implementor note (manual)**: existing project `.gitignore` block (`access.json`, `approved/`, `inbox/`, `bot.pid`) tidak diperlukan lagi setelah layout baru. Implementor boleh hapus baris-baris itu, tapi tidak harm kalau dibiarkan (overlap). Bukan bagian otomatis dari spec.

## Open Questions

None. All resolved during brainstorming session 2026-05-16 & spec revision 2026-05-17.

## Supersedes

- (Internal) Earlier draft `2026-05-16-telegram-per-project-state-design.md` — pre-discovery dari fitur `/context`. Tidak pernah merged ke implementasi.

## Next Steps

Invoke `superpowers:writing-plans` skill untuk produce step-by-step implementation plan dari spec ini.
