# Briefing: 6 Perbaikan Multi-Bot (2026-06-07)

**Untuk:** bot pelaksana (ditunjuk user via agent-bus)
**Dari:** bot-05 (context 45%, menyerahkan pekerjaan via briefing ini)
**Repo kerja:** `C:\Users\Mirza\.claude\plugins\marketplaces\mirza-marketplace` (branch `main`)
**Mandat user:** selesaikan SEMUA item di bawah SEKARANG, lapor progres ke user via Telegram per item.

## Baca dulu (urutan)

1. `~/.claude/agent-playbook/PLAYBOOK.md` — WAJIB; ada 3 entry hari ini yang relevan langsung (insiden reclone, pty_send_slash vs telegram-layer, UI-in-docs).
2. `CLAUDE.md` repo ini — checklist rilis 5-poin per perubahan plugin (MEKANIS, jangan dilewati).
3. `docs/superpowers/specs/2026-06-06-handoff-v2-direct-handoff-design.md` — HANYA bagian "Addendum implementasi" (konteks bug yang diperbaiki di sini).

## Aturan kerja (tidak bisa ditawar)

- **PUSH ke origin SEGERA setelah SETIAP release commit.** Repo ini bisa di-reclone updater kapan saja; commit lokal yang belum di-push = kandidat lenyap (insiden nyata tadi pagi, lihat playbook).
- Commit trailer: `Agent: <nama-bot-mu>`.
- Perubahan menyentuh `plugins/pty-controller/wrapper/` → bump JUGA `wrapper/package.json` version (checklist item 2).
- `bun test` per plugin tersentuh. Known failure Windows (jangan dikejar): 4 state-path POSIX + server-boot flaky (telegram), lihat CLAUDE.md/playbook. Pakai `git stash -u` untuk membuktikan pre-existing bila ragu.
- JANGAN menyentuh pekerjaan alih-bahasa (anglicize) — itu proyek bot-06 yang sedang HOLD.
- JANGAN memanggil skill handoff / membuat file handoff. Selesai = lapor user, titik.
- Manifest/JSON ditulis via tool Write/Edit (BOM dari PowerShell merusak manifest — playbook).

---

## Item 1 — Wrapper menulis session name otomatis (akar bug staleness)

**Masalah:** `agent_status` (agent-bus) membaca nama session dari `last-status.json` (telegram) yang HANYA ter-update saat statusline bridge jalan. Akibat: (a) session fresh yang belum pernah aktif melaporkan nama session LAMA — gagal terdeteksi READY persis pada kondisi bot idle baru di-reset; (b) saat transisi session, nilainya bisa menyimpang (terbukti 2x hari ini).

**Fix yang disepakati:** wrapper (mirza-cc) menulis nama session saat dia MENGETAHUINYA:
- Saat memproses payload `{command:"/clear", sessionName}` (jalur `/new`).
- Saat meng-inject `/rename <name>` (parse argumen dari command string di pending payload).
- Saat `/switch` (payload `{type:"switch", sessionId, sessionName}`).
- Tulis ke file state baru mis. `<project>/.claude/channels/pty-controller/wrapper.current_session_name` (sebelahan dengan `wrapper.current_session_id` yang sudah ada).

**Lalu** `plugins/agent-bus/peer-status.ts`: pakai sumber dengan prioritas — jika `session_id` di `last-status.json` ≠ isi `wrapper.current_session_id` → data telegram STALE → pakai `wrapper.current_session_name`; selain itu boleh pakai last-status. Tambahkan test (`peer-status.test.ts`).

**Sentuh:** `plugins/pty-controller/wrapper/` (+ bump wrapper version + plugin version) dan `plugins/agent-bus/` (+ bump). Pelajari dulu struktur wrapper source sebelum mengedit — jangan menebak nama internal.

**Catatan aktivasi:** perubahan wrapper baru aktif setelah wrapper di-restart (user yang restart bot). Sebutkan ini di laporan akhir.

## Item 2 — `agent_status` expose `context_window_size` + semantik ctx null

**Masalah:** field `model` ("Opus 4.8 (1M context)" vs "Opus 4.8") tidak konsisten; deteksi window 1M via string = rapuh. Padahal `last-status.json` → `payload.context_window.context_window_size` (mis. `1000000`) dan `total_input_tokens` SUDAH ada.

**Fix:** `plugins/agent-bus/peer-status.ts` menambahkan `context_window_size` (number|null) ke hasil `agent_status`, dan dokumentasikan di description tool bahwa `context_used_percent: null` berarti session fresh/belum aktif (BUKAN error). Test.

**Sentuh:** `plugins/agent-bus/` (gabung rilis dengan Item 1: satu bump cukup, mis. `0.0.10`).

## Item 3 — Skill handoff `0.0.13`: threshold via window size + aturan null

**Fix di `plugins/handoff/skills/handoff/SKILL.md`:**
- §1 (kewajiban proaktif): threshold ditentukan dari `context_window_size` hasil `agent_status` — `>= 1_000_000` → 35%, selain itu → 75%. Fallback HANYA bila field belum tersedia: tebak dari string model ("1M"), dan sebutkan fallback ini sementara.
- §0 (READY): pertegas — `context_used_percent < 10` ATAU `null` (null = fresh, lolos).
- Sinkronkan kalimat terkait di `template.md` + README plugin + description `plugin.json` bila menyebut aturan threshold/READY.
- Bump `0.0.13` + checklist 5-poin.

## Item 4 — `pty_send_slash` menolak command lapisan-telegram

**Masalah:** `/new`, `/switch`, `/delete`, `/effort` hanya ada di lapisan telegram/wrapper — injeksi PTY-nya nyangkut sebagai command invalid di Claude Code (insiden `/new idle` tadi pagi). Validasi `pty_send_slash` sekarang meloloskannya.

**Fix:** di server pty-controller (tool `pty_send_slash`), tolak command blocklist `/new`, `/switch`, `/delete`, `/effort` dengan error yang MENYEBUT alternatif benar, contoh: `"/new is a telegram-layer command, not a Claude Code command. To reset+rename a session: inject \"/clear\" then \"/rename <name>\" (two calls), or use agent_send kind:\"slash\" {command:\"/clear\", sessionName:\"<name>\"}"`. `/rename`, `/clear`, `/compact`, command plugin (mis. `/handoff`) tetap lolos. Tambahkan test. Bump pty-controller (gabung rilis dengan Item 1 bila praktis).

## Item 6 — SOP koordinasi git multi-agent (PR #3 user)

**Deliverable:**
1. Dokumen `docs/SOP-git-multi-agent.md` di repo ini, berisi post-mortem singkat insiden 2026-06-07 (kronologi: rilisan lokal belum di-push → bot lain force-push histori squash dari basis lama → updater reclone → 25 commit lenyap → pemulihan dari cache plugin) + aturan operasional:
   - Push ke origin SEGERA setelah setiap release commit di repo bersama.
   - DILARANG force-push / history-rewrite tanpa: `git log origin/main..main` di SEMUA clone yang mungkin + konfirmasi user + koordinasi antar bot.
   - `~/.claude/plugins/marketplaces/<x>` = milik updater (bisa di-reclone); perlakukan sebagai push-through, bukan tempat menimbun commit.
   - Cache `~/.claude/plugins/cache/` = sumber pemulihan rilisan; folder ber-`.orphaned_at` = kandidat GC, amankan dulu sebelum recovery.
   - Worktree wajib untuk kerja paralel di repo sama (bot-conduct Rule 1 tetap berlaku).
2. Rule baru di `plugins/bot-conduct/skills/bot-conduct/SKILL.md` (jadi `0.0.3`): ringkasan aturan-aturan di atas sebagai "Rule 7 — Shared-repo git discipline" (atau nomor berikutnya yang tersedia), menunjuk ke SOP untuk detail. Checklist 5-poin untuk bot-conduct.

## Item 7 — Dokumentasi gotcha aktivasi di CLAUDE.md repo ini

Tambahkan ke bagian "Activation steps" CLAUDE.md repo marketplace:
- `/reload-plugins` MEMUTUS koneksi MCP server plugin di session yang sedang berjalan → perlu `/mcp` reconnect per bot setelah reload.
- Skill yang di-update ter-load ulang di session berjalan, tapi skill BARU butuh session baru (sudah ada catatannya — pertahankan, gabungkan rapi).

---

## Definition of done keseluruhan

- Semua item 1,2,3,4,6,7 selesai, ter-commit dengan trailer, dan **ter-push** (cek `git status -sb` = `## main...origin/main` tanpa ahead).
- `bun test` hijau di plugin tersentuh (di luar known Windows failures).
- Laporan akhir ke user via Telegram: ringkasan per item + versi-versi baru + langkah aktivasi (reload semua bot + `/mcp` reconnect + restart wrapper untuk Item 1 + session baru untuk skill).
- Pertanyaan/blocker → tanya USER via Telegram (inline buttons), BUKAN ke bot lain.
