# Inventaris Kapabilitas — Acceptance Contract untuk Rewrite Harness

- **Tanggal:** 2026-07-02
- **Konteks:** keputusan rewrite/rakit-ulang harness (lihat `docs/2026-07-02-improvement-backlog.md` bagian "Arah arsitektur target"). Kekhawatiran utama user: fitur yang sudah ada hilang/terlupa di versi baru. Dokumen-dokumen di folder ini adalah jawabannya — **kontrak penerimaan** yang digenerate dari kode (bukan dari ingatan) oleh 4 subagent yang membaca seluruh source.
- **Versi source saat inventaris:** telegram 0.0.36-mirza.0, pty-controller 0.0.30 (wrapper 0.0.7), agent-bus 0.0.13.

## Aturan pakai

1. **Sebuah kapabilitas dianggap "sudah dipindahkan" HANYA bila item-nya dicentang** (`[ ]` → `[x]`) — dan mencentang hanya boleh setelah perilakunya **terverifikasi live** di harness baru (bukan "kodenya sudah ditulis").
2. Item boleh dicentang dengan status alternatif bila diputuskan sadar: tulis `[x] DIHAPUS — <alasan>` atau `[x] DIGANTI — <mekanisme baru>` di samping item. Yang dilarang adalah hilang *tanpa keputusan*.
3. **`scar-tissue.md` beda sifat:** itemnya bukan fitur, melainkan *masalah yang pernah menggigit*. Versi baru boleh mengganti solusinya, tapi wajib menjawab tiap item: masih relevan? bagaimana ditangani/diuji?
4. Referensi `path:line` mengacu ke source saat inventaris — baris bisa bergeser; cari simbolnya.

## Isi

| File | Prefix | Item | Cakupan |
|---|---|---|---|
| `telegram.md` | TG | 189 | Commands native & meta, 5 MCP tools, pipeline inbound (gate/pairing/media/album), callback routing, message store, lifecycle server, hooks, statusline, state files |
| `pty-controller.md` | PTY | 114 | MCP tools & guards, IPC filesystem, process model wrapper, injection (queue/gate/barrier), lifecycle sesi, state published, registry global |
| `agent-bus.md` | BUS | 47 | agent_list/status/send, validasi & hop-count, trust logic peer-status, kontrak registry, skill using-agent-bus |
| `behavioral-skills.md` | SKILL | 82 | Kontrak perilaku handoff, goal, immediate-reply, inline-buttons, bot-conduct (+hook), teach-me, daily-report, knowledge-vault |
| `scar-tissue.md` | SCAR | 97 | Workaround empiris: timing, Windows/ConPTY, quirk TUI CC, Telegram API, lifecycle proses, seam versi antar-plugin |

**Total: 529 item.**

## Catatan ambiguitas dari proses inventaris (keputusan desain yang menunggu)

Ditemukan para auditor saat menyisir; masing-masing perlu keputusan sadar di desain baru:

1. **Atomicity batch injection saat ini bergantung pada single-thread Node** (enqueue sinkron di `wrapper.ts`) — daemon baru dengan consumer konkuren wajib menurunkan ulang jaminan ini secara eksplisit.
2. **Asimetri validasi by-design:** MCP server memvalidasi ketat, wrapper mempercayai file pending apa pun (plugin telegram menulis `switch`/`prompt` langsung). Di arsitektur baru, tentukan satu titik validasi.
3. **Kompatibilitas nama key:** pembaca lama mengharapkan `wrapper_version`/`plugin_version` serta file mirror legacy `wrapper.current_session_id/_name` — shim fase 2 harus mempertahankan key ini.
4. `readRegistry` agent-bus membaca **tanpa lock** (mengandalkan atomicity tmp+rename) — putuskan eksplisit di model state baru.
5. **Teks skill yang sudah basi terhadap kode:** using-agent-bus menyebut error yang tak ada lagi; template handoff membawa READY-heuristic lama yang sudah digantikan SKILL.md. Inventaris mengikuti kode/SKILL terbaru.
6. **`/effort` punya dua kebijakan berbeda yang dua-duanya benar:** auto-confirm dari jalur Telegram (`confirmAfterMs:500`), diblok total dari jalur AI (`pty_send_slash`) — pertahankan pemisahan ini.
7. **Bug laten terdokumentasi apa adanya** (bukan disensor): `messagesStore.append` yang tak ada (TG-150 / backlog LOSS-4), copy `/archive` yang menyesatkan, CRLF `.env` belum difix (LOSS-5). Item inventaris mendeskripsikan perilaku aktual; fix-nya di backlog.
8. **Kendala serialisasi meta notifikasi:** Zod schema `meta: Record<string,string>` di Claude Code men-drop seluruh notifikasi bila ada nilai non-string — semua field multi-nilai (album) wajib diserialisasi manual. Kontrak diam-diam yang mudah dilanggar di implementasi baru.

## Langkah berikutnya

Design doc arsitektur baru harus **memetakan setiap item inventaris ke rumah barunya** (komponen daemon/adapter/hook/skill) — itulah definisi "tidak ada yang hilang".
