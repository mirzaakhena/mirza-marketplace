# agent-bus

Plugin komunikasi **antar-agent (bot-to-bot)** untuk beberapa instance Claude Code yang berjalan di mesin yang sama. Satu bot (leader) bisa melihat bot lain, membaca status sesinya, mengirim instruksi natural-language, atau menyuntikkan slash command ke sesi peer.

Terdiri dari satu MCP server (3 tools) + satu skill (`using-agent-bus`) yang memuat aturan pemakaian aman.

## MCP Tools

| Tool | Sifat | Fungsi |
|---|---|---|
| `agent_list()` | read-only, boleh dipanggil otonom | Daftar peer dari registry global: nama, status online, heartbeat terakhir, project_dir. Entry tanpa heartbeat > 24 jam difilter keluar. |
| `agent_status(name)` | read-only, boleh dipanggil otonom | Detail sesi peer: session id + nama sesi, context usage %, model, effort level, wrapper PID. |
| `agent_send(target, payload)` | mutating — **hanya atas permintaan eksplisit user** | Kirim pesan one-way ke satu peer atau array peer (broadcast/fan-out). |

Peer dianggap **online** kalau heartbeat terakhirnya < 30 detik.

## Dua jenis payload `agent_send`

### `kind: "prompt"` — instruksi natural-language

- Body (maks **8 KB**) divalidasi, newline di-flatten jadi satu baris (Claude Code submit on Enter), lalu diberi **marker anti-bounce** yang menandai pesan sebagai instruksi antar-agent.
- Ditulis ke inbox `pending/` milik pty-controller peer; wrapper `mirza-cc` peer mengetikkannya ke PTY sebagai user turn biasa.
- **One-way — tidak ada reply channel.** Kalau leader butuh hasil balik, harus diminta eksplisit di dalam body ("when done, send a one-line summary back to bot-01").

### `kind: "slash"` — injeksi slash command

- Field: `command` (wajib, harus diawali `/`), `args` (opsional, ditempel dengan spasi), `sessionName` (opsional — untuk `command:"/clear"`, chain `/rename` ke nama ini, efektif jadi `/new <nama>`), `confirmAfterMs` (opsional, pacing auto-confirm untuk picker command seperti `/effort`), plus `correlation_id` opsional (auto-generate kalau kosong).
- Ditulis atomik (tmp + rename) ke inbox `pending/` peer; wrapper peer mengonsumsi dan menyuntikkannya ke PTY.

## Guard bawaan

- **Blast-radius guard:** command destruktif (`/clear`, `/delete`) **ditolak** kalau target berupa array — tidak boleh broadcast penghapus state.
- **Validasi target:** nama di-trim, dedup; target yang tidak ada di registry dikembalikan sebagai `{ok: false, error: "not in registry"}` per-entry tanpa menggagalkan target lain.
- **Offline tetap terkirim:** pesan ke peer offline tetap masuk inbox (queued) — hasil call menandai `online: false` supaya AI bisa memperingatkan user bahwa pesan baru dikonsumsi saat peer boot.
- **Validasi prompt body:** non-empty string, maksimal 8 KB UTF-8.

## Skill `using-agent-bus`

Trigger saat user minta koordinasi antar bot ("tell bot-02 to run /handoff-resume", "list which bots are online"). Aturan kuncinya:

- `agent_send` **tidak boleh** dipanggil atas inisiatif AI sendiri — hanya atas permintaan eksplisit user, atau saat prompt masuk secara eksplisit minta lapor balik.
- **Anti-bounce:** pesan masuk dari agent-bus adalah konteks terminal, bukan trigger balas-membalas. Default: kerjakan, lapor ke Telegram sendiri, STOP. Mencegah infinite loop antar bot.
- **Command destruktif** (`/clear`, `/clear`+`sessionName`, `/delete`) wajib konfirmasi ulang ke user tepat sebelum kirim — pakai tombol interactive-prompts kalau tersedia.
- Pattern siap pakai: **leader fan-out** (broadcast slash / prompt ke banyak peer) dan **targeted relay** (cek status → kirim → lapor correlation id).

## Arsitektur & state

- **Registry global:** `~/.claude/agent-registry.json` (override via env `AGENT_REGISTRY_PATH`). Schema v1: map nama agent → `{project_dir, state_dir, registered_at, last_heartbeat, wrapper_pid}`.
- **Penulis registry:** wrapper pty-controller (`mirza-cc`) — register saat boot, heartbeat berkala, unregister saat shutdown. agent-bus murni pembaca registry + penulis inbox.
- **Concurrency:** write registry diserialisasi file-lock (`.lock`, O_EXCL, timeout 2 detik) dengan visibilitas atomik tmp + rename.
- **Sumber `agent_status`:** utamanya `last-status.json` milik plugin telegram peer (kaya: nama sesi, context %, model, effort); fallback ke `wrapper.current_session_id` milik pty-controller (cuma session id); sisanya `null`.
- **Nama agent** = basename dari `CLAUDE_PROJECT_DIR` peer (mis. `bot-02`).

## Dependensi

- Plugin **`pty-controller`** terpasang di bot pengirim & penerima, berjalan di bawah wrapper `mirza-cc` — wrapper-lah yang mendaftarkan bot ke registry dan mengonsumsi inbox.
- Field kaya di `agent_status` butuh plugin **`telegram`** di sisi peer (opsional — degrade ke session id saja kalau tidak ada).

## Testing

`bun test` dari dalam `plugins/agent-bus/` — unit test per modul (`registry`, `inbox-writer`, `prompt-compose`, `peer-status`, `send-guards`) plus `integration.test.ts`.

## Install

Tambahkan marketplace dulu (lihat [root README](../../README.md)), lalu:

```
/plugin install agent-bus@mirza-marketplace
/reload-plugins
```

Spec desain (di repo marketplace): `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md`, `2026-05-29-agent-bus-one-way-prompt-design.md`, dan `2026-05-29-agent-bus-prompt-via-pty-*.md`.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
