# Telegram (Mirza fork)

> 🔀 **Fork notice.** Ini fork pribadi Mirza dari [plugin Telegram resmi Anthropic](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram). Lihat [root README marketplace](../../README.md) untuk konteks lengkap + daftar perubahan vs upstream.
>
> **Perubahan utama dari upstream:**
> - Command `/hello` di Telegram membalas `"Hello, Mirza!"`.
> - **State per-project** — token, database, pairing, dst. disimpan di `<project>/.claude/channels/telegram/`, bukan `~/.claude/channels/telegram/` global. Multi-folder paralel dengan token berbeda.
> - **Unified `/context`** — last-status.json & chained-statusline juga masuk channel state dir.
> - **Strict resolution** — server exit kalau `CLAUDE_PROJECT_DIR` tidak set; no cwd fallback.
>
> Lisensi tetap Apache-2.0 dari upstream — lihat [LICENSE](./LICENSE).

Connect a Telegram bot to your Claude Code with an MCP server.

The MCP server logs into Telegram as a bot and provides tools to Claude to reply, react, or edit messages. When you message the bot, the server forwards the message to your Claude Code session.

## Prerequisites

- [Bun](https://bun.sh) — the MCP server runs on Bun. Install with `curl -fsSL https://bun.sh/install | bash`.

## Install Scope Guidance

Plugin ini dirancang **untuk dipasang sekali**, state otomatis per-folder. Rekomendasi:

| Scope | Behavior | Direkomendasikan? |
|---|---|---|
| `user` | 1× install. Plugin aktif di **semua** CC session. Setiap folder yang Anda buka CC otomatis dapat state dir sendiri. Multi-token paralel langsung jalan. | ✅ **Default** |
| `project` | Per-repo, ter-commit ke git. Kolaborator yang clone repo akan diminta install. State terpisah per-mesin per-kolaborator. | Tim yang sengaja pakai Telegram channel di repo ini |
| `local` | Per-repo, gitignored, hanya Anda. | Eksperimen 1 folder saja |

## Quick Setup
> Default pairing flow for a single-user DM bot. See [ACCESS.md](./ACCESS.md) for groups and multi-user setups.

**1. Create a bot with BotFather.**

Open a chat with [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot`. BotFather asks for two things:

- **Name** — the display name shown in chat headers (anything, can contain spaces)
- **Username** — a unique handle ending in `bot` (e.g. `my_assistant_bot`).

BotFather replies with a token that looks like `123456789:AAHfiqksKZ8...` — that's the whole token, copy it including the leading number and colon.

**2. Install the plugin (user scope, sekali per mesin).**

These are Claude Code commands — run `claude` to start a session first.

```
/plugin marketplace add mirzaakhena/mirza-marketplace
/plugin install telegram@mirza-marketplace
/reload-plugins
```

Saat ditanya scope, pilih **`user`** (kecuali kalau Anda hanya ingin test di 1 folder, pilih `local`).

**3. Give the server the token — di project Anda.**

Buka CC session di folder project yang Anda inginkan, lalu:

```
/telegram:configure 123456789:AAHfiqksKZ8...
```

Skill akan tulis `TELEGRAM_BOT_TOKEN=...` ke `<project>/.claude/channels/telegram/.env`, set chmod 600, dan auto-add `.claude/channels/.gitignore` untuk melindungi semua channel state dari accidental commit.

Token ini **terikat pada project ini saja**. Untuk project lain, configure dengan token yang berbeda.

> **Multi-folder workflow:**
> ```
> $ cd ~/Work/projectA && claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
> > /telegram:configure 111:AAH...   # bot A → ~/Work/projectA/.claude/channels/telegram/
>
> $ cd ~/Work/projectB && claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
> > /telegram:configure 222:BBI...   # bot B (beda token!) → ~/Work/projectB/.claude/channels/telegram/
> ```
> Dua session paralel, masing-masing bot sendiri. Telegram API constraint: 1 token = 1 poller, jadi **beda project butuh beda bot token**.

Override path eksplisit (dev/test): set env `TELEGRAM_STATE_DIR=/path/to/custom`.

**4. Relaunch with the channel flag.**

The server won't connect without this — exit your session and start a new one.

> ⚠️ Karena fork ini **bukan** plugin yang ada di Anthropic-maintained channel allowlist, `--channels` biasa akan menolak. Pakai flag development sebagai gantinya:

```sh
claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
```

Claude Code akan minta konfirmasi pertama kali — terima.

**5. Enable MCP server `telegram` di session ini.**

> ⚠️ Channel plugins di Claude Code di-mark **Experimental** dan **MCP-nya disabled by default** per session — meski plugin sudah ter-install dan di-load. Kalau Anda skip langkah ini, bot **tidak akan polling Telegram** dan DM tidak akan sampai ke session.

Di CC session, jalankan:

```
/mcp
```

Cari `telegram` di daftar, lalu **enable** toggle-nya. Setelah enable, server MCP `telegram` akan spawn dan bot mulai polling Telegram.

> Kenapa default off? Channel plugin terima inbound dari external (Telegram) — itu sumber prompt injection. CC mensyaratkan opt-in eksplisit per session sebagai safety nudge. Anda harus lakukan ini setiap session baru (state-nya tidak persistent).

**6. Pair.**

With the MCP enabled, DM your bot on Telegram — it replies with a 6-character pairing code. If the bot doesn't respond, double-check:
1. CC session running dengan `--dangerously-load-development-channels`
2. `/mcp` toggle telegram **on**
3. Token tersimpan di `<project>/.claude/channels/telegram/.env` (lihat status via `/telegram:configure` tanpa argumen)

In your Claude Code session:

```
/telegram:access pair <code>
```

Your next DM reaches the assistant.

> Unlike Discord, there's no server invite step — Telegram bots accept DMs immediately. Pairing handles the user-ID lookup so you never touch numeric IDs.

**7. Lock it down.**

Pairing is for capturing IDs. Once you're in, switch to `allowlist` so strangers don't get pairing-code replies. Ask Claude to do it, or `/telegram:access policy allowlist` directly.

## State Layout (per project)

```
<project>/.claude/channels/
├── .gitignore              ← auto: "*\n!.gitignore\n" (file tracked, content ignored)
└── telegram/
    ├── .env                ← token (chmod 600)
    ├── access.json         ← pairing & allowlist
    ├── messages.db         ← chat history (SQLite)
    ├── inbox/              ← incoming attachments
    ├── approved/
    ├── bot.pid             ← process lock
    ├── last-status.json    ← from /context
    └── chained-statusline  ← from /context
```

Hapus `<project>/.claude/channels/telegram/` untuk reset state di project itu (tanpa mempengaruhi project lain).

## Access control

See **[ACCESS.md](./ACCESS.md)** for DM policies, groups, mention detection, delivery config, skill commands, and the `access.json` schema.

Quick reference: IDs are **numeric user IDs** (get yours from [@userinfobot](https://t.me/userinfobot)). Default policy is `pairing`. `ackReaction` only accepts Telegram's fixed emoji whitelist.

## Tools exposed to the assistant

| Tool | Purpose |
| --- | --- |
| `reply` | Send to a chat. Takes `chat_id` + `text`, optionally `reply_to` (message ID) for native threading and `files` (absolute paths) for attachments. Images (`.jpg`/`.png`/`.gif`/`.webp`) send as photos with inline preview; other types send as documents. Max 50MB each. Auto-chunks text; files send as separate messages after the text. Returns the sent message ID(s). |
| `react` | Add an emoji reaction to a message by ID. **Only Telegram's fixed whitelist** is accepted (👍 👎 ❤ 🔥 👀 etc). |
| `edit_message` | Edit a message the bot previously sent. Useful for "working…" → result progress updates. Only works on the bot's own messages. |

Inbound messages trigger a typing indicator automatically — Telegram shows "botname is typing…" while the assistant works on a response.

## Photos

Inbound photos are downloaded to `<project>/.claude/channels/telegram/inbox/` and the local path is included in the `<channel>` notification so the assistant can `Read` it. Telegram compresses photos — if you need the original file, send it as a document instead (long-press → Send as File).

## No history or search

Telegram's Bot API exposes **neither** message history nor search. The bot only sees messages as they arrive — no `fetch_messages` tool exists. If the assistant needs earlier context, it will ask you to paste or summarize.

This also means there's no `download_attachment` tool for historical messages — photos are downloaded eagerly on arrival since there's no way to fetch them later.

## Conversation Logging

Plugin mencatat semua percakapan ke `<project>/.claude/channels/telegram/messages.db` (SQLite). Tabel `messages` menyimpan inbound user, outbound assistant/system, dan edit history. Tujuan: recall lintas sesi.

### `source` parameter convention

`reply` tool menerima optional param `source: 'assistant' | 'system'`, default `'assistant'`.

- **`assistant`** — reply langsung ke pesan user (default, tidak perlu eksplisit).
- **`system`** — reply yang dipicu non-user event: cronjob, scheduler, external webhook, scheduled task. Caller (skill, MCP server, cronjob handler) **harus** set ini eksplisit agar log akurat.

### Disable

Set env var `TELEGRAM_DISABLE_MESSAGES_STORE=1` untuk menjalankan plugin tanpa logger (mis. saat debugging atau testing).

### Inspect

```bash
sqlite3 <project>/.claude/channels/telegram/messages.db \
  "SELECT id,ts,source,user_name,substr(text,1,80) FROM messages ORDER BY ts DESC LIMIT 20"
```
