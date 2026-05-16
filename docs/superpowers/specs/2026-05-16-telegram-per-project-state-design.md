# Telegram Channel — Per-Project State Directory — Design Spec

**Status**: Design approved (2026-05-16)
**Source**: User request — install plugin sekali di `user` scope, tapi token/db/state per-folder agar multi-folder bisa pakai bot Telegram berbeda secara paralel
**Implementation target**: `plugins/telegram/`
**Version bump**: `0.0.6-mirza.1` → `0.0.7-mirza.1`

## Purpose & Scope

### Purpose

Hari ini plugin Telegram channel menyimpan semua state (token `.env`, allowlist `access.json`, histori `messages.db`, attachment `inbox/`, lock `bot.pid`) di **satu lokasi global**: `~/.claude/channels/telegram/`. Konsekuensinya:

1. **Token "berpindah" antar folder**: kalau session CC dibuka di repo A lalu di repo B, MCP server kedua men-depak yang pertama (Telegram API: 1 poller per token). State global mengasumsikan satu setup Telegram per mesin.
2. **Tidak ada isolasi**: bug di `access.json` satu project merusak semua project.
3. **Tidak bisa multi-bot**: satu user yang ingin pakai bot berbeda untuk konteks berbeda (kerja vs personal) tidak punya jalan rapi.

Fork `mirza` sudah half-way menuju per-project — `server.ts:28` sudah accept env `TELEGRAM_STATE_DIR`, tapi tidak ada yang men-set-nya, dan kedua skill (`/telegram:configure`, `/telegram:access`) hardcode path global.

Spec ini menutup gap: install plugin sekali (`user` scope), state otomatis per-folder, multi-token paralel, isolasi penuh.

### In scope

- Refactor STATE_DIR resolution di `server.ts` menjadi explicit resolution chain dengan error exit kalau tidak ter-resolve.
- Helper bash `scripts/resolve-state-dir.sh` untuk dipakai bersama kedua skill (DRY).
- Update `skills/configure/SKILL.md` & `skills/access/SKILL.md` agar pakai resolution chain, bukan path hardcoded.
- Auto-update `.gitignore` saat configure (idempotent) untuk melindungi credential.
- Version bump + README rewrite (paths, per-folder model, install scope guidance).
- Unit test untuk resolver + gitignore handler; integration smoke test untuk server boot.

### Out of scope

- **Migration tooling** dari global state lama (`~/.claude/channels/telegram/`) ke project-local: fork ini personal (mirza-marketplace), tidak ada user lain yang perlu migrated. User pemilik fork sudah wipe global state.
- **Backward compat dengan upstream `claude-plugins-official`**: fork sengaja diverge. Upstream sync di masa depan harus reconcile manual (sudah noted di README).
- **Multi-token failover / pool**: 1 project = 1 token tetap konstrain. Telegram API tidak mengizinkan 1 token di 2 poller bersamaan; spec ini tidak mengubah itu.
- **Cross-project shared allowlist**: setiap project punya `access.json` independen. Tidak ada inheritance.
- **GUI / settings panel**: configure tetap via skill (CLI-style).

## Decisions

| Aspek | Keputusan |
|---|---|
| Lokasi state | `<repo>/.claude/telegram-state/` |
| Deteksi project root | Env `$CLAUDE_PROJECT_DIR` (di-set CC otomatis untuk MCP server & skill bash) |
| Fallback | **Strict error**: server exit 1 kalau project dir tidak teridentifikasi |
| Override eksplisit | Env `TELEGRAM_STATE_DIR` masih menang (escape hatch untuk dev/test) |
| Token protection | Auto-add `.claude/telegram-state/` ke `.gitignore`, idempotent |
| Install scope yang direkomendasikan | `user` (sekali install, otomatis per-folder) |

## Architecture

Resolution chain (priority order):

```
1. $TELEGRAM_STATE_DIR                              ← escape hatch
2. $CLAUDE_PROJECT_DIR/.claude/telegram-state/      ← default per-project
3. ⛔ exit 1 with diagnostic message                ← strict
```

Konsisten antara TypeScript (server.ts) dan bash (skills via helper). Code tetap di plugin cache (1 copy), state per-folder.

```
~/.claude/plugins/cache/mirza-marketplace/telegram/0.0.7-mirza.1/   SHARED CODE
├── server.ts                  ← reads CLAUDE_PROJECT_DIR per session
├── messages-store.ts
├── album-buffer.ts
├── scripts/resolve-state-dir.sh   ← bash helper, sourced by skills
├── skills/{configure,access}/SKILL.md
└── .mcp.json                  ← NO env block (server resolves itself)

<repo-A>/.claude/telegram-state/        PER-FOLDER STATE A
├── .env, access.json, messages.db, inbox/, approved/, bot.pid

<repo-B>/.claude/telegram-state/        PER-FOLDER STATE B (isolated)
└── ... (token B, separate bot)
```

## Components

### 1. `plugins/telegram/server.ts`

Replace baris 27–28 dengan pure resolver yang di-test-able. Server.ts wrapper menangani exit:

```ts
import { resolveStateDir } from './state-path.ts'

const STATE_DIR = resolveStateDir(process.env)
if (!STATE_DIR) {
  process.stderr.write(
    `telegram channel: cannot determine state directory.\n` +
    `  Set CLAUDE_PROJECT_DIR (Claude Code does this automatically),\n` +
    `  or TELEGRAM_STATE_DIR to an explicit path.\n`
  )
  process.exit(1)
}
process.stderr.write(`telegram channel: state dir = ${STATE_DIR}\n`)
```

Konstanta turunan (`ACCESS_FILE`, `INBOX_DIR`, `MESSAGES_DB`, `PID_FILE`, `ENV_FILE`, `APPROVED_DIR`) tidak diubah — sudah join dari STATE_DIR. Pesan error "TELEGRAM_BOT_TOKEN required" di-update untuk menyebut STATE_DIR aktif.

### 2. `plugins/telegram/state-path.ts` (new)

Pure function module, mudah di-unit-test:

```ts
export function resolveStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.TELEGRAM_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (projectDir) return join(projectDir, '.claude', 'telegram-state')
  return null
}
```

### 3. `plugins/telegram/scripts/resolve-state-dir.sh` (new)

Bash helper dengan kontrak identik dengan TS:

```bash
#!/usr/bin/env bash
# Echo resolved state dir to stdout, or print error to stderr and return 1.
resolve_state_dir() {
  if [ -n "$TELEGRAM_STATE_DIR" ]; then
    echo "$TELEGRAM_STATE_DIR"; return 0
  fi
  if [ -n "$CLAUDE_PROJECT_DIR" ]; then
    echo "$CLAUDE_PROJECT_DIR/.claude/telegram-state"; return 0
  fi
  echo "telegram: CLAUDE_PROJECT_DIR not set; cannot derive state dir" >&2
  return 1
}
```

**Consumption pattern**: helper script lives in plugin cache (path tidak deterministik dari skill context), jadi skill **tidak source helper** — skill **inline-kan resolution chain verbatim** (6 baris). Helper script tetap dibuat untuk: (a) target bash test suite, (b) standalone debug oleh user (`bun ... && bash scripts/resolve-state-dir.sh`). Spec mengharuskan kedua copy (script & inline di skill) tetap sinkron — jika resolusi diubah, kedua tempat di-update bersamaan, dan bash test menangkap regresi di script.

### 4. Gitignore handler — inline bash di `configure` skill (no separate file)

Logic ditulis langsung di SKILL.md sebagai bash function. Tidak ada file `gitignore-handler.ts` terpisah — testability via bash test suite cukup; dependency bun untuk operasi sederhana ini overkill.

```bash
ensure_gitignored() {
  local project_dir="$1"
  local pattern=".claude/telegram-state/"
  local gitignore="$project_dir/.gitignore"

  touch "$gitignore"
  if grep -qE "^\.claude/?$|^\.claude/telegram-state/?$" "$gitignore"; then
    echo "Already in .gitignore (matched existing pattern)"
    return 0
  fi
  {
    echo ""
    echo "# Telegram channel state (token, pairing, db). Do not commit."
    echo "$pattern"
  } >> "$gitignore"
  echo "Added '$pattern' to .gitignore"
}
```

Idempotent. Match both exact pattern dan broader `.claude/`. Test via `scripts/gitignore-handler.test.sh` yang me-source function definition dari SKILL.md atau dari standalone test helper (lihat Testing section).

### 5. `plugins/telegram/skills/configure/SKILL.md`

Empat tempat berubah:

- **Header doc string**: hapus mention `~/.claude/channels/telegram/`, ganti dengan deskripsi generik "the current project's state directory".
- **No-args (status) branch**: source helper → read `$STATE_DIR/.env` & `$STATE_DIR/access.json`.
- **Save-token branch (`<token>`)**: urutan operasi:
  1. Resolve STATE_DIR via helper
  2. `mkdir -p "$STATE_DIR"`
  3. Update `$STATE_DIR/.env` (preserve other keys)
  4. `chmod 600 "$STATE_DIR/.env"`
  5. **NEW** — `ensure_gitignored "$CLAUDE_PROJECT_DIR"`
  6. Print status + next steps
- **Clear branch (`clear`)**: delete entry dari `$STATE_DIR/.env`.

### 6. `plugins/telegram/skills/access/SKILL.md`

6 referensi path hardcoded → ganti dengan resolusi via helper. Logika access policy tidak berubah. Atomic write (rename) untuk `access.json` dipertahankan.

### 7. `plugins/telegram/.claude-plugin/plugin.json`

Version: `0.0.6-mirza.1` → `0.0.7-mirza.1`.

### 8. `plugins/telegram/.mcp.json`

**Tidak berubah.** Server resolve env sendiri (Approach A).

### 9. `plugins/telegram/README.md`

Major rewrite di section "Perubahan dari upstream" dan "Setup token":

- Tambah entry baru di tabel perubahan: "Per-project state dir + auto-gitignore + strict project mode".
- Ganti semua referensi `~/.claude/channels/telegram/` → `<your-project>/.claude/telegram-state/`.
- Tambah section baru: **Install Scope Guidance** (lihat berikutnya).
- Catat konstrain: "Multi-folder paralel butuh token bot berbeda per folder. 1 token = 1 poller (Telegram API)."

## Install Scope Guidance (new README section)

Plugin Telegram dirancang untuk dipasang sekali, state otomatis per-folder. Rekomendasi:

| Scope | Behavior dengan per-project state | Direkomendasikan? |
|---|---|---|
| `user` | 1× install. Plugin aktif di **semua** CC session. Setiap folder yang Anda buka CC otomatis dapat state dir sendiri. Multi-token paralel langsung jalan. | ✅ **Default** untuk multi-folder use case |
| `project` | Per-repo, ter-commit. Kolaborator yang clone repo akan diminta install plugin. State terpisah per-kolaborator-mesin. | Hanya kalau seluruh tim memang pakai Telegram channel di repo ini |
| `local` | Per-repo, gitignored. Hanya Anda, hanya di repo ini. | Eksperimen / sandbox 1 folder |

**Multi-folder workflow yang dimaksudkan:**

```
$ claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
# (di session, sekali saja di mesin Anda)
> /plugin install telegram@mirza-marketplace   # pilih: user scope

# Kemudian di setiap folder, konfigurasi token bot berbeda:
$ cd ~/Work/projectA && claude --dangerously-load-development-channels ...
> /telegram:configure 111:AAH...   # bot A
> /telegram:access pair <code>
# State: ~/Work/projectA/.claude/telegram-state/

$ cd ~/Work/projectB && claude --dangerously-load-development-channels ...
> /telegram:configure 222:BBI...   # bot B (beda token!)
> /telegram:access pair <code>
# State: ~/Work/projectB/.claude/telegram-state/

# Dua session sekarang bisa jalan paralel, masing-masing dengan bot sendiri.
```

## Data Flow

### Boot MCP server

```
CC session at <repo-A> → spawn MCP server
  env passed includes: CLAUDE_PROJECT_DIR=<repo-A>
  
server.ts:
  1. STATE_DIR = resolveStateDir(env)
     → /<repo-A>/.claude/telegram-state
  2. stderr: "telegram channel: state dir = <repo-A>/.claude/telegram-state"
  3. mkdirSync(STATE_DIR, { mode: 0o700 })
  4. load .env → TELEGRAM_BOT_TOKEN (or exit 1 if missing)
  5. messagesStore.init() — creates messages.db inside STATE_DIR
  6. Check stale bot.pid; SIGTERM if alive; write own PID
  7. Start grammy polling
```

### Configure token

```
User: /telegram:configure 123:AAH...
  → skill bash (CWD = <repo-A>):
    1. source resolve-state-dir.sh → STATE_DIR
    2. mkdir -p "$STATE_DIR"
    3. write/update "$STATE_DIR/.env"
    4. chmod 600
    5. ensure_gitignored "$CLAUDE_PROJECT_DIR"
       → touch .gitignore if missing
       → append .claude/telegram-state/ if not already covered
    6. echo status
  → user runs /reload-plugins to apply new token
```

### Two-project parallel (validates isolation goal)

```
Terminal 1 at <A>:                  Terminal 2 at <B>:
  MCP spawn, ENV=<A>                  MCP spawn, ENV=<B>
  STATE_DIR=<A>/.claude/...           STATE_DIR=<B>/.claude/...
  Token A → poll Bot A                Token B → poll Bot B
       ↕                                   ↕
  inbox <A>                           inbox <B>
  messages.db <A>                     messages.db <B>
  
  Bot A msgs route to session 1       Bot B msgs route to session 2
  No cross-contamination.             Different PID files, different DBs.
```

## Error Handling

Prinsip: **fail loud pada error konfigurasi (boot), fail soft pada error operasi pendukung (.gitignore)**.

### Server boot

| Kondisi | Penanganan | Exit |
|---|---|---|
| Kedua env (TELEGRAM_STATE_DIR, CLAUDE_PROJECT_DIR) kosong | stderr: 2-baris instruction | 1 |
| `TELEGRAM_STATE_DIR` ke path invalid (mkdir gagal) | stderr: `cannot create <path>: <errno>` | 1 |
| `.env` tidak ada / tidak ada TELEGRAM_BOT_TOKEN | stderr menyebut STATE_DIR aktif & file expected | 1 |
| `messages.db` init fail | propagate exception | 1 |
| Stale PID kill — proses sudah hilang (ESRCH) | silent (existing try/catch baris 70-76) | — |
| 409 Conflict dari Telegram (token in use elsewhere) | log explicit: "token in use by another poller. Check STATE_DIR/bot.pid in this & other projects." Server tetap hidup (grammy retry). | — |

Semua error message **menyebut STATE_DIR aktif** supaya user tahu repo mana yang dikomplain.

### `/telegram:configure` skill

| Kondisi | Penanganan |
|---|---|
| CLAUDE_PROJECT_DIR unset | exit 1 dengan instruction "Run from a CC session at your project root" |
| Token format invalid | soft warning, biarkan user putuskan |
| mkdir / write `.env` fails | error + abort |
| `chmod 600` fails (cross-FS) | warning, lanjut save |
| `.gitignore` step fails (perm, dst.) | **soft-fail**: token saved; print prominent warning "add .claude/telegram-state/ manually before committing" |
| Pattern sudah di-gitignore | info log "Already in .gitignore" |

### `/telegram:access` skill

| Kondisi | Penanganan |
|---|---|
| `access.json` tidak ada | default `{ dmPolicy: "pairing", allowFrom: {}, pending: {} }` (existing) |
| `access.json` corrupt | server side sudah handle (rename → `.corrupt`, restart fresh). Skill side: read fail → error + suggest reload |
| Pairing code tidak ditemukan | user error message |
| Write race vs server | atomic write via tmp + rename (existing practice) |

### Runtime per-message

Tidak berubah dari implementasi sekarang: `unhandledRejection` / `uncaughtException` log + stay alive (baris 79-84); attachment download fail bubbles to MCP response; rate limit di-handle grammy.

### Konsekuensi per-project isolation

- Corrupt state di repo A tidak mempengaruhi repo B.
- Recovery: `rm -rf <repo>/.claude/telegram-state/` reset 1 project.
- Token leak terisolasi: 1 token = 1 repo (bukan global blast radius).

## Testing Strategy

### Unit tests (new)

**`state-path.test.ts`** — pure function matrix:

| Test | TELEGRAM_STATE_DIR | CLAUDE_PROJECT_DIR | Expected |
|---|---|---|---|
| Both empty | unset | unset | `null` |
| Empty string treated as unset | `""` | `""` | `null` |
| Override only | `/tmp/foo` | unset | `/tmp/foo` |
| Project only | unset | `/repo` | `/repo/.claude/telegram-state` |
| Override wins | `/tmp/foo` | `/repo` | `/tmp/foo` |
| Trailing slash normalized | unset | `/repo/` | `/repo/.claude/telegram-state` |

**`gitignore-handler.test.ts`** — pakai `tmpdir`:

| Test | Setup | Expected |
|---|---|---|
| No .gitignore | empty dir | create + append pattern; `changed: true` |
| .gitignore tanpa pattern | unrelated content | append; `changed: true` |
| Exact pattern present | line `.claude/telegram-state/` | no-op; `changed: false` |
| Broader `.claude/` present | line `.claude/` | no-op; `changed: false` |
| Idempotent | run 2× | only 1 entry |
| Write-protected | chmod 000 | `changed: false` with reason (no throw) |

### Bash helper tests

**`scripts/resolve-state-dir.test.sh`** — exec-based assertion atas helper script:
- Override wins
- Project derive
- Neither set → exit 1

**`scripts/gitignore-handler.test.sh`** — tests `ensure_gitignored` function pakai `mktemp -d`:
- No `.gitignore` → create + append
- `.gitignore` tanpa pattern → append
- Exact pattern present → no-op
- Broader `.claude/` present → no-op
- Idempotent: run 2× → 1 entry
- Write-protected file → graceful failure

Function definition di-extract dari SKILL.md (atau di-mirror ke `scripts/gitignore-handler.sh` untuk testability — pilih saat implementasi, prefer mirror agar test stabil).

### Integration test

**`server-boot.test.ts`** — spawn server.ts dengan env varied, capture stderr, kill setelah 2s timeout (atau pakai env `TELEGRAM_BOOT_ONLY=1` kalau diperlukan untuk graceful exit setelah init):
- Neither env → exit 1, stderr berisi instruction
- CLAUDE_PROJECT_DIR=<tmpdir> + .env exists → start, stderr menyebut state dir
- CLAUDE_PROJECT_DIR=<tmpdir> + .env missing → exit 1 dengan path expected

### Existing tests harus tetap pass

- `messages-store.test.ts`
- `album-buffer.test.ts`

Kalau salah satu break setelah refactor, signal regresi.

### Manual smoke test (skill-driven, harus diverifikasi end-to-end)

1. **Fresh repo**: `mkdir /tmp/smoke && cd /tmp/smoke && git init` → `claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace` → `/telegram:configure <token>`. Verifikasi: `.claude/telegram-state/.env` (600), `.gitignore` updated, stderr server log mention path.

2. **Two-repo concurrent**: two terminals, two folders, two tokens. Send `/hello` to bot A → only terminal A sees it. `lsof -p <PID>` confirms isolated file handles.

3. **Idempotency**: run `/telegram:configure <token>` 2× → `.gitignore` no duplicate, log "Already in .gitignore".

4. **Error UX**: `bun server.ts` standalone tanpa env → stderr instructional message readable.

### Coverage gap yang diterima

| Area | Alasan |
|---|---|
| `/telegram:access pair <code>` end-to-end | Butuh real Telegram interaction; manual smoke only |
| Race 2 skill writes paralel | Atomic rename sudah cukup |
| Windows path | Plugin existing sudah dokumentasi "no-op on Windows" untuk chmod; `path.join` cross-platform |

## Migration & Rollout

- **Migration tooling**: NONE. Fork personal; user pemilik sudah wipe global state (`~/.claude/channels/telegram/` sudah dihapus dalam sesi sebelumnya).
- **Rollout**: bump version 0.0.7-mirza.1 → push → user run `/plugin marketplace update mirza-marketplace && /plugin update telegram` → restart CC dengan dev flag → `/telegram:configure <token>` di setiap project yang ingin dipakai.
- **Communication**: README baru cukup. No deprecation banner needed (1 user fork).

## File Changes Summary

| File | Action | Notes |
|---|---|---|
| `plugins/telegram/server.ts` | Modify | Replace STATE_DIR block dengan resolver call |
| `plugins/telegram/state-path.ts` | Create | Pure resolver function |
| `plugins/telegram/state-path.test.ts` | Create | Unit tests for resolver |
| `plugins/telegram/scripts/resolve-state-dir.sh` | Create | Bash helper (sumber test + standalone debug; NOT sourced by skills) |
| `plugins/telegram/scripts/resolve-state-dir.test.sh` | Create | Bash helper tests |
| `plugins/telegram/scripts/gitignore-handler.sh` | Create | Mirror dari bash function di SKILL.md untuk testability |
| `plugins/telegram/scripts/gitignore-handler.test.sh` | Create | Tests for gitignore handler (tmpdir-based) |
| `plugins/telegram/server-boot.test.ts` | Create | Integration test for boot |
| `plugins/telegram/skills/configure/SKILL.md` | Rewrite paths + add gitignore step | 4 sections updated |
| `plugins/telegram/skills/access/SKILL.md` | Rewrite paths | 6 references |
| `plugins/telegram/.claude-plugin/plugin.json` | Version bump | 0.0.7-mirza.1 |
| `plugins/telegram/.mcp.json` | UNCHANGED | per Approach A |
| `plugins/telegram/README.md` | Rewrite | Per-folder model, install scope guidance |
| `README.md` (root marketplace) | Minor update | Mention scope guidance briefly |

## Open Questions

None. All resolved during brainstorming session 2026-05-16.

## Next Steps

Invoke `superpowers:writing-plans` skill to produce step-by-step implementation plan dari spec ini.
