# Mirza Marketplace

Marketplace plugin pribadi untuk **Claude Code**, milik [@mirzaakhena](https://github.com/mirzaakhena).

Marketplace ini berisi fork dari plugin resmi [`claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) yang sudah dimodifikasi untuk kebutuhan pribadi, plus plugin orisinal yang ditulis dari nol (kalau ada).

## Daftar Plugin

### `telegram` — Telegram channel (fork)

Bridge Telegram ke sesi Claude Code via MCP server, dengan kontrol akses bawaan (pairing, allowlist, group support). Fork dari [`external_plugins/telegram`](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram).

**Perubahan dari upstream:**

| Perubahan | Detail |
|---|---|
| Command `/hello` | Saat user kirim `/hello` di Telegram DM, bot membalas `"Hello, Mirza!"`. Command ini juga muncul di autocomplete Telegram (`setMyCommands`). |
| State per-project | Token, db, pairing, dst. disimpan di `<project>/.claude/channels/telegram/` (bukan `~/.claude/channels/telegram/` global). Multi-folder paralel dengan token berbeda. Lihat [plugin README](plugins/telegram/README.md#install-scope-guidance) untuk install scope. |
| Strict resolution | Server exit kalau `CLAUDE_PROJECT_DIR` tidak set. No cwd fallback. `/context` ikut layout yang sama. |
| Gitignore self-managed | Auto-tulis `<project>/.claude/channels/.gitignore` (cover semua channel — telegram, future whatsapp, dst.) saat configure pertama. Tidak menyentuh `.gitignore` user di project root. |
| Version | `0.0.6` → `0.0.7-mirza.1` (penanda fork agar tidak bentrok dengan upstream) |
| Author | Mirza |

File yang diubah utama: `plugins/telegram/server.ts`, `plugins/telegram/scripts/context-bridge.sh`, kedua SKILL.md, plus modul baru `state-path.ts` + `channels-gitignore.ts` + bash helpers di `scripts/`.

---

## Instalasi di Claude Code

### Langkah 1 — Tambahkan marketplace ini

Dari sesi Claude Code apa pun, jalankan:

```
/plugin marketplace add mirzaakhena/mirza-marketplace
```

Verifikasi:

```
/plugin marketplace list
```

Marketplace `mirza-marketplace` harus muncul di daftar.

### Langkah 2 — Install plugin yang Anda butuhkan

```
/plugin install telegram@mirza-marketplace
/reload-plugins
```

Saat ditanya scope, pilih **`user`** untuk plugin Telegram — itu memberikan satu install global, tapi state (token, db, pairing) tetap per-folder otomatis. Detail di [README plugin Telegram](plugins/telegram/README.md#install-scope-guidance).

Sintaks `@mirza-marketplace` penting kalau Anda juga punya plugin official dengan nama yang sama — ini memastikan Claude Code mengambil versi dari marketplace ini, bukan dari `claude-plugins-official`.

### Langkah 3 (khusus channel plugin) — Setup token & restart dengan dev flag

Plugin `telegram` adalah **channel plugin**, jadi butuh dua langkah ekstra.

**A. Konfigurasi token bot.** Buat bot dulu via [@BotFather](https://t.me/BotFather) di Telegram (kirim `/newbot`), salin token-nya, **buka CC session di folder project Anda**, lalu:

```
/telegram:configure 123456789:AAH...
```

Token disimpan di `<your-project>/.claude/channels/telegram/.env` (chmod 600, otomatis ter-`.gitignore`). Token terikat ke project tersebut saja — untuk project lain, configure ulang dengan token bot berbeda.

**B. Restart Claude Code dengan dev flag.** Karena plugin di marketplace pribadi **tidak ada di Anthropic-maintained allowlist** (channels masih research preview), `--channels` biasa akan menolak. Pakai flag development:

```bash
claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
```

Claude Code akan minta konfirmasi pertama kali — terima.

**C. Enable MCP server di session ini.** Channel plugin MCP-nya **disabled by default per session** (safety nudge dari CC untuk experimental channel plugins). Jalankan `/mcp` di Claude Code, lalu enable toggle `telegram`. Tanpa langkah ini, bot tidak akan polling dan DM Anda tidak sampai. Detail di [README plugin Telegram](plugins/telegram/README.md#quick-setup).

**D. Pair akun Anda.** DM bot Anda di Telegram — bot akan balas dengan pairing code 6 karakter. Di Claude Code:

```
/telegram:access pair <code>
/telegram:access policy allowlist
```

Sekarang DM ke bot akan masuk ke sesi Claude Code Anda. Coba kirim `/hello` — bot harus balas `"Hello, Mirza!"`.

> Catatan: kalau Anda sebelumnya pakai plugin `telegram@claude-plugins-official` dengan bot token yang sama, hanya satu yang boleh aktif pada waktu yang sama (Telegram bot API cuma izinkan satu poller per token, atau Anda akan dapat `409 Conflict`).

---

## Mengembangkan / Memodifikasi

Workflow standar kalau Anda mau menambah/mengubah plugin di marketplace ini:

```bash
git clone https://github.com/mirzaakhena/mirza-marketplace.git
cd mirza-marketplace
```

1. **Edit kode plugin** di `plugins/<name>/`.
2. **Bump version** di `plugins/<name>/.claude-plugin/plugin.json` (skema: `<upstream-version>-mirza.<N>` agar jelas ini fork).

   > ⚠️ **`package.json` does NOT count.** Claude Code's marketplace cache me-resolve versi dari `.claude-plugin/plugin.json` saja. Kalau Anda hanya bump `package.json` dan `.claude-plugin/plugin.json` dibiarkan, cache tetap serve kode lama dan `/reload-plugins` jadi no-op. Untuk hygiene boleh align `package.json` dengan nilai yang sama, tapi yang **binding** adalah `.claude-plugin/plugin.json`. Lihat `CLAUDE.md` untuk full procedure + commit message format.
3. **Validasi** manifest:
   ```bash
   claude plugin validate .
   claude plugin validate plugins/<name>
   ```
4. **Test lokal** sebelum push (tanpa harus push ke GitHub dulu):
   ```bash
   claude plugin marketplace add /absolute/path/to/mirza-marketplace
   claude --dangerously-load-development-channels plugin:<name>@mirza-marketplace
   ```
5. **Commit & push** ke `main`.
6. **Update di sisi pengguna** (di sesi Claude Code mereka):
   ```
   /plugin marketplace update mirza-marketplace
   /plugin update <name>
   ```

### Sinkronisasi dengan upstream

Repo `claude-plugins-official` di-update Anthropic secara berkala. Untuk merge perubahan upstream ke fork:

1. Bandingkan `plugins/telegram/` di marketplace ini dengan `external_plugins/telegram/` di upstream (clone fresh atau git diff).
2. Cherry-pick perubahan yang relevan, perhatikan agar modifikasi `/hello` tetap utuh (`bot.command('hello', ...)` di `server.ts`).
3. Bump version, commit, push.

---

## Lisensi

Plugin `telegram` mempertahankan lisensi **Apache-2.0** dari upstream (lihat `plugins/telegram/LICENSE`). Modifikasi fork ini juga dirilis di bawah lisensi yang sama.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
