# Mirza Marketplace

Marketplace plugin pribadi untuk **Claude Code**, milik [@mirzaakhena](https://github.com/mirzaakhena).

Isinya satu fork dari plugin resmi [`claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) yang dimodifikasi berat (telegram), plus tujuh plugin orisinal yang ditulis dari nol. Plugin-plugin ini dirancang sebagai satu ekosistem: bot Telegram sebagai antarmuka utama, wrapper PTY sebagai tangan yang mengendalikan Claude Code, dan sekumpulan behavioral skill yang mengatur cara AI berkomunikasi.

## Daftar Plugin

Katalog resmi ada di [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json). Tiap plugin punya README sendiri dengan detail lengkap.

### Infrastruktur (MCP server)

| Plugin | Versi | Apa itu |
|---|---|---|
| [`telegram`](plugins/telegram/) | 0.0.28-mirza.0 | **Bridge Telegram ↔ Claude Code** (fork upstream, dimodifikasi berat). State per-project, 5 MCP tools (`reply` + buttons, `react`, `edit_message`, `download_attachment`, `get_message_by_id`), bot commands registry-driven (`/context`, `/version`, `/new`, `/switch`, `/delete` soft/hard/all, `/rename`, `/effort`, `/help`, `/start`), album batching, quoted-message context, conversation logging ke SQLite, permission relay, system-outbox untuk sibling plugin. |
| [`pty-controller`](plugins/pty-controller/) | 0.0.23 | **Claude Code mengontrol dirinya sendiri.** Wrapper `mirza-cc` menjalankan CC di dalam node-pty; plugin menulis request ke inbox filesystem, wrapper menyuntikkan keystroke (`/clear`, `/resume`, prompt text dari agent-bus). MCP tools: `pty_send_slash`, `pty_status`, `pty_list_agents`. Wrapper juga mendaftarkan bot ke agent registry global. |
| [`agent-bus`](plugins/agent-bus/) | 0.0.5 | **Komunikasi bot-to-bot** antar instance Claude Code di mesin yang sama. MCP tools: `agent_list`, `agent_status`, `agent_send` (prompt natural-language atau slash command, bisa broadcast). One-way dengan anti-bounce rule + hop limit. Bergantung pada pty-controller. |

### Behavioral skills (tanpa MCP server)

| Plugin | Versi | Apa itu |
|---|---|---|
| [`immediate-reply`](plugins/immediate-reply/) | 0.0.4 | Ack instan (~1 detik) sebelum tool call pertama di setiap inbound Telegram — pre-flight check mekanis 4 pertanyaan, plus narasi progress untuk task panjang. |
| [`inline-buttons`](plugins/inline-buttons/) | 0.0.6 | Self-audit setiap reply Telegram: PERTANYAAN atau JAWABAN? Pertanyaan WAJIB pakai inline-keyboard buttons — minimum Ya/Tidak + tombol escape `✏️ Jelaskan manual`, label pendek (opsi dinarasikan bernomor di body, tombol cukup angkanya). Butuh telegram ≥ 0.0.9-mirza.0. |
| [`teach-me`](plugins/teach-me/) | 0.0.1 | Mode mengajar: bangun mental model selangkah demi selangkah saat user ingin memahami konsep — 10 elemen gaya + daftar anti-pattern. |
| [`handoff`](plugins/handoff/) | 0.0.7 | `/handoff` menangkap sesi ke file markdown 10-section di `<repo>/.handoff/` (dengan clarity check + brainstorm); `/handoff-resume [yes]` memuatnya kembali di sesi baru dengan human gate. |
| [`daily-report`](plugins/daily-report/) | 0.0.3 | `/daily-report` menyusun laporan kerja harian plain-text siap-paste ke chat app mana pun dari aktivitas git, dengan template terkunci Yesterday/Today dan aturan anti-fabrication. |
| [`bot-conduct`](plugins/bot-conduct/) | 0.0.2 | Aturan kerja agent bot: git worktree (bukan branch-switch), commit ber-trailer `Agent: <bot-name>`, subagent-first supaya main loop tetap responsif, disiplin channel (jawab di channel asal pertanyaan), dan playbook lintas-bot di `~/.claude/agent-playbook/PLAYBOOK.md`. |

### Bagaimana semuanya saling terkait

```
Telegram (HP user)
   │  DM / commands / button taps
   ▼
[telegram plugin] ──── meta-commands (/new, /switch, /effort, ...) ───┐
   │  <channel> notification                                          │ tulis inbox
   ▼                                                                  ▼
[ Claude Code session ] ◄── inject keystrokes ── [ mirza-cc wrapper (pty-controller) ]
   │                                                       ▲
   │  agent_send (prompt/slash)                            │ inbox peer
   └──────────────► [agent-bus] ───────────────────────────┘  → bot lain di mesin yang sama

immediate-reply / inline-buttons / teach-me  → mengatur GAYA respons AI di Telegram
handoff / daily-report                            → ritual akhir-sesi & akhir-hari
bot-conduct                                       → aturan KERJA agent bot (worktree, commit identity, subagent, playbook)
```

---

## Instalasi di Claude Code

### Langkah 1 — Tambahkan marketplace ini

Dari sesi Claude Code apa pun, jalankan:

```
/plugin marketplace add mirzaakhena/mirza-marketplace
```

Verifikasi dengan `/plugin marketplace list` — `mirza-marketplace` harus muncul.

### Langkah 2 — Install plugin yang Anda butuhkan

```
/plugin install telegram@mirza-marketplace
/plugin install pty-controller@mirza-marketplace
/plugin install immediate-reply@mirza-marketplace
...
/reload-plugins
```

Saat ditanya scope, pilih **`user`** — satu install global, state tetap per-folder otomatis. Sintaks `@mirza-marketplace` penting kalau Anda juga punya plugin official dengan nama sama.

Behavioral skill plugins (immediate-reply, inline-buttons, teach-me, handoff, daily-report, bot-conduct) langsung jalan setelah install — tidak ada konfigurasi. **Catatan:** skill yang baru di-enable belum terdaftar di sesi yang sedang berjalan — restart sesi dulu (lihat `docs/2026-06-06-issue-skill-not-loaded-on-new-session.md`).

### Langkah 3 (khusus channel plugin telegram) — Token & dev flag

Plugin `telegram` adalah **channel plugin**, butuh langkah ekstra:

**A. Konfigurasi token bot.** Buat bot via [@BotFather](https://t.me/BotFather) (`/newbot`), salin token, buka CC session di folder project target, lalu:

```
/telegram:configure 123456789:AAH...
```

Token disimpan di `<project>/.claude/channels/telegram/.env` (chmod 600, otomatis ter-`.gitignore`). Satu token per project — project lain butuh bot berbeda.

**B. Restart dengan dev flag.** Plugin marketplace pribadi tidak ada di allowlist Anthropic (channels masih research preview):

```bash
claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
```

Atau — kalau pty-controller terpasang — jalankan lewat wrapper, yang sudah memakai flag itu by default:

```bash
cd plugins/pty-controller/wrapper && npm run wrapper
```

**C. Enable MCP server.** Channel plugin MCP-nya disabled by default per session. Jalankan `/mcp`, toggle `telegram` on.

**D. Pair akun Anda.** DM bot di Telegram → dapat kode 6 karakter. Di CC:

```
/telegram:access pair <code>
/telegram:access policy allowlist
```

Setelah paired, coba kirim `/context` di Telegram — bot harus membalas info context window + session.

> Catatan: satu bot token hanya boleh punya satu poller. Dua project dengan token sama → `409 Conflict`.

### Langkah 4 (opsional) — Wrapper untuk session control & bot-to-bot

Command Telegram `/new`, `/switch`, `/delete`, `/rename`, `/effort` dan seluruh plugin agent-bus butuh wrapper `mirza-cc` berjalan. Lihat [README pty-controller](plugins/pty-controller/README.md) untuk setup-nya.

---

## Mengembangkan / Memodifikasi

Workflow standar:

```bash
git clone https://github.com/mirzaakhena/mirza-marketplace.git
cd mirza-marketplace
```

1. **Edit kode plugin** di `plugins/<name>/`.
2. **Bump version** di `plugins/<name>/.claude-plugin/plugin.json` (konvensi: `<semver>-mirza.<N>` untuk fork, semver biasa untuk plugin orisinal).

   > ⚠️ **`package.json` does NOT count.** Cache marketplace Claude Code me-resolve versi dari `.claude-plugin/plugin.json` saja. Bump `package.json` doang = cache tetap serve kode lama dan `/reload-plugins` jadi no-op. Lihat `CLAUDE.md` untuk prosedur lengkap.
3. **Update README** — plugin yang berubah wajib disertai update `plugins/<name>/README.md` + root README ini (aturan di `CLAUDE.md`).
4. **Validasi** manifest:
   ```bash
   claude plugin validate .
   claude plugin validate plugins/<name>
   ```
5. **Test** — plugin ber-MCP-server pakai Bun: `bun test` dari dalam folder plugin.
6. **Test lokal** sebelum push:
   ```bash
   claude plugin marketplace add /absolute/path/to/mirza-marketplace
   claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
   ```
7. **Commit & push** ke `main`.
8. **Update di sisi pengguna:** `/plugin marketplace update mirza-marketplace` lalu `/plugin update <name>` (atau `/reload-plugins`).

Spec & plan desain di-commit bersama kode: repo-level di `docs/superpowers/{specs,plans}/`, per-plugin di `plugins/<name>/docs/`.

### Sinkronisasi dengan upstream (telegram)

Repo `claude-plugins-official` di-update Anthropic berkala. Untuk merge perubahan upstream ke fork telegram:

1. Bandingkan `plugins/telegram/` dengan `external_plugins/telegram/` upstream (clone fresh atau git diff).
2. Cherry-pick yang relevan — hati-hati: fork ini sudah menyimpang jauh (state per-project, meta-commands, messages.db, system-outbox, buttons, dll). Lihat daftar perubahan di [README plugin telegram](plugins/telegram/README.md).
3. Bump version, commit, push.

---

## Lisensi

- `telegram` mempertahankan **Apache-2.0** dari upstream (lihat `plugins/telegram/LICENSE`).
- `pty-controller` dirilis di bawah **MIT** (lihat `plugins/pty-controller/LICENSE`).
- Plugin lain belum mencantumkan file lisensi eksplisit.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
