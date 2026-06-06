# bot-conduct

Plugin skill-only berisi **aturan kerja untuk agent bot** (bot-01, bot-02, ...) yang bekerja di mesin yang sama atas nama user. Tidak punya MCP server, tidak punya command — hanya satu skill: `bot-conduct`.

Identitas bot = basename project directory (mis. `C:\Users\Mirza\workspace\bot-06` → `bot-06`).

## Aturan yang dikodekan

| # | Aturan | Inti |
|---|---|---|
| 1 | **Git worktree, bukan branch-switch** | Kerja yang butuh isolasi dilakukan di worktree (`EnterWorktree` / `git worktree add`), bukan ganti branch di working tree utama — bot lain atau user mungkin sedang memakai tree yang sama. |
| 2 | **Commit ber-identitas** | Setiap commit memuat trailer `Agent: <bot-name>` (sebelum `Co-Authored-By:`), supaya user bisa melacak bot mana yang mengerjakan apa. `git config user.name` tidak diubah. |
| 3 | **Subagent-first** | Kerja berat (search luas, refactor multi-file, test run, riset) didelegasikan ke subagent supaya main loop tetap responsif menjawab user. Heuristik: >~1 menit tool calls + user mungkin chat di tengah → subagent. |
| 4 | **Playbook lintas-bot** | File bersama `~/.claude/agent-playbook/PLAYBOOK.md`: best practice teruji + kesalahan yang tidak boleh diulang + gotcha mesin. Dibaca di awal task substansial, di-update saat ada pelajaran durable. Format entry + template + aturan hygiene ada di SKILL.md. |
| 5 | **Disiplin channel** | Jawab di channel tempat pertanyaan datang: pertanyaan Telegram → jawaban final WAJIB lewat tool `reply` (transcript bukan user!); pertanyaan di terminal CC → jawab di transcript. Menyilang hanya atas permintaan eksplisit. Self-check mekanis di akhir turn: "jawaban final saya sudah lewat reply tool?" |
| 6 | **Rumah untuk rule baru** | Aturan kerja baru dari user ditambahkan sebagai rule bernomor di skill ini (lalu bump version), bukan tersebar di CLAUDE.md per-repo — kecuali memang spesifik satu repo. |

## Kenapa playbook?

Kesinambungan. Bot datang dan pergi per-session; pelajaran tidak boleh ikut hilang. Apa yang dipelajari satu bot (praktik yang terbukti, kesalahan yang mahal, keanehan setup Windows) diwariskan ke bot berikutnya lewat satu file yang selalu dibaca sebelum kerja.

Yang TIDAK masuk playbook: trivia spesifik session, secrets, dan hal yang sudah tercatat di CLAUDE.md repo masing-masing.

## Instalasi

Tambahkan marketplace dulu (lihat [root README](../../README.md)), lalu:

```
/plugin install bot-conduct@mirza-marketplace
/reload-plugins
```

## Cocok dipasangkan dengan

- [`immediate-reply`](../immediate-reply/) — rule subagent-first bekerja paling baik dengan pola ack instan.
- [`agent-bus`](../agent-bus/) — koordinasi antar bot yang sama-sama mematuhi conduct ini.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
