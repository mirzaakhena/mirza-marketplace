# Mirza Marketplace

Marketplace pribadi untuk Claude Code yang berisi plugin Mirza, termasuk fork modifikasi dari plugin official.

## Plugins

### telegram

Fork dari [plugin Telegram official](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram), dengan modifikasi:

- Command baru `/hello` — bot membalas dengan `"Hello, Mirza!"`

## Install marketplace ini

```
/plugin marketplace add <path-or-git-url>
/plugin install telegram@mirza-marketplace
```

## Testing lokal (sebelum push ke Git)

Marketplace ini bisa ditambahkan dari path lokal:

```
/plugin marketplace add C:/Users/Mirza/workspace/clone-telegram-channels/my-marketplace
```

Untuk menjalankan plugin sebagai channel, channels masih dalam research preview. Karena plugin ini tidak ada di Anthropic-maintained allowlist, gunakan flag development:

```
claude --dangerously-load-development-channels plugin:telegram@mirza-marketplace
```

## Lisensi

Mengikuti lisensi plugin upstream (Apache-2.0 untuk plugin telegram).
