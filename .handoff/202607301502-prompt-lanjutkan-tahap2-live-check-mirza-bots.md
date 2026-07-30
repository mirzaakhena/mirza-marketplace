# Handoff — Lanjutkan `mirza-bots` ke Task 10 (uji live Telegram)

- **Date:** 2026-07-30 15:02
- **Repo dokumen/plan:** `/Users/mirza/Workspace/mirza-marketplace` (macOS) — spec, plan, dan handoff hidup di sini
- **Repo kode:** `/Users/mirza/Workspace/mirza-bots` (macOS) — semua kode `fleetd`/`cc-plugin` hidup di sini, HEAD `2d919a6`
- **Branch (HEAD SHA):** `main` @ mirza-marketplace `356bc1f`+ (lihat commit terbaru), mirza-bots `main` @ `2d919a6`
- **Dari → Ke:** sesi `renew-mirza-marketplace-2` (Claude Sonnet 5) → sesi lanjutan (context baru)
- **Lanjutan dari:** `.handoff/202607292219-prompt-lanjutkan-brainstorming-mirza-bots.md`
- **Plan terkait:** `docs/superpowers/plans/2026-07-30-fleetd-fondasi.md` (Tahap 1, SELESAI) dan `docs/superpowers/plans/2026-07-30-fleetd-jalur-pesan.md` (Tahap 2, SELESAI — kode; Task 10-nya belum)

> ⚠️ **Catatan konteks:** template handoff ini aslinya dirancang untuk estafet **antar-bot** (lihat `plugins/handoff/`). Dipakai di sini untuk estafet **antar-sesi** karena belum ada bot `mirza-bots` yang benar-benar terpasang — user sendiri yang menegaskan ini di akhir sesi lalu. Jangan bingung dengan handoff bot-ke-bot yang sesungguhnya nanti (itu fitur B-8/delegasi di sistem baru, belum dibangun).

---

## 1. Tujuan handoff

Melanjutkan **Task 10** dari plan Tahap 2 (`docs/superpowers/plans/2026-07-30-fleetd-jalur-pesan.md`) — **uji live dengan bot Telegram sungguhan**. Ini satu-satunya task yang tersisa dari seluruh pekerjaan yang direncanakan sesi ini, dan **butuh partisipasi user secara langsung** (kirim pesan Telegram sungguhan, buka sesi Claude Code baru dengan `cc-plugin` termuat) — bukan sesuatu yang bisa dikerjakan AI sendirian.

**Yang BUKAN tujuan:** menulis kode baru untuk fitur baru. Semua 9 task otomatis Tahap 2 sudah selesai, direview, dan diperbaiki. Task 10 murni verifikasi.

## 2. SUDAH selesai

**Tahap 1 (Fondasi) — SELESAI TOTAL.** `fleetd` kosong + dua database (`fleet.db`, `conversations.db` + FTS5) + config loader + socket Unix + `doctor`. 7 task lewat subagent, review akhir bersih setelah 1 gelombang perbaikan (7 item kecil). Terbukti hidup lewat pemeriksaan manual terhadap `~/.claude/mirza-bots/` sungguhan.

**Tahap 2 (Jalur Pesan) — SELESAI TOTAL (kode).** Poller Telegram tangguh (retry `min(1000×attempt,15000)`, `bot.catch`, tanpa batas-8-percobaan lama karena poller di luar sesi CC), gerbang allowlist, unduh foto + **album sungguhan** (dikelompokkan via `media_group_id` pakai `AlbumBuffer`), **tombol inline** (dengan `ctx.answerCallbackQuery()` wajib-pertama-tanpa-syarat — scar tissue tercatat di spec §10: 457 unit test hijau tapi call ini hilang di produksi lama, tombol Telegram spinner selamanya), antrean offline `bot_inbox` (sekarang benar-benar tersambung, bukan cuma tertulis), dan paket baru `cc-plugin` (MCP server stdio, tool `reply` + button, forward pesan masuk sebagai `notifications/claude/channel` dengan `meta` string-only ketat/SCAR-056).

9 task lewat subagent (5 di antaranya butuh 1 ronde fix), lalu **review akhir whole-branch menemukan 2 bug Critical nyata**:
1. **Pembajakan balasan** — target `reply` (`lastChatByBot`) tercatat SEBELUM gerbang allowlist diperiksa, jadi orang asing yang tidak di-allowlist bisa jadi target balasan AI berikutnya. **Sudah diperbaiki**, diuji dengan sabotase (fix sengaja dirusak dulu, konfirmasi test menangkap, lalu dipulihkan).
2. **`bot_inbox` write-only** — fungsi `drainQueue` tidak pernah dipanggil di mana pun, jadi pesan yang masuk saat tidak ada sesi tersambung hilang selamanya walau tersimpan di database. **Sudah diperbaiki** (hook `onBind` di socket server + wiring di `main.ts`), diuji.

Plus 9 temuan Important (validasi zod di batas socket, handler socket tak lagi bisa menggantung selamanya, token bot tidak lagi bocor ke log, `cc-plugin` gagal cepat bukan menggantung kalau `fleetd` restart, `answerCallbackQuery` yang gagal tidak lagi menggagalkan penyimpanan pesan, dll) — semua diperbaiki dalam satu gelombang, direview ulang, bersih.

**Fix tambahan di luar temuan formal (inisiatif AI, bukan delegasi):** implementer gelombang-fix menemukan (tapi sengaja TIDAK memutuskan sendiri) bahwa `process.cwd()` mungkin bukan representasi tepat direktori sesi Claude Code untuk `cc-plugin`'s identity binding — dokumentasi Claude Code menyarankan `CLAUDE_PROJECT_DIR`. AI (bukan subagent) langsung menerapkan `resolveIdentityCwd()`: utamakan `CLAUDE_PROJECT_DIR`, fallback ke `process.cwd()`. **Ini BELUM diverifikasi di lapangan** — lihat §4.

**Total: 17 commit di `mirza-bots`. `fleetd` 59/59 test lolos, `cc-plugin` 16/16 lolos, tidak ada proses sisa.**

**Dua token bot Telegram sungguhan sudah diberikan user dan disimpan** di `~/.claude/mirza-bots/config.json` (file lokal, TIDAK pernah masuk git — ini memang desainnya):
- `bot-01`: home `/Users/mirza/Workspace/mirza-bots` — **ini yang dipakai Task 10**.
- `bot-02`: home `/Users/mirza/Workspace/mirza-bots-02` — disiapkan user untuk uji coba 2-agent nanti (Tahap 5/delegasi), **BELUM dipakai di Task 10**.
- `allowFrom`: user ID Telegram user sudah terisi.

## 3. SEDANG dikerjakan

**Baru mulai menawarkan pemanduan Task 10** — belum ada langkah teknis yang benar-benar dieksekusi. Sesi sebelumnya berhenti tepat setelah menyelesaikan seluruh Tahap 2 dan menanyakan ke user apakah mau dipandu sekarang; user memilih ya, tapi minta handoff dulu karena context sudah ~90%.

## 4. Blocker

**Tidak ada blocker yang menghentikan pekerjaan**, tapi ada **dua risiko belum terverifikasi** yang bisa menggagalkan Task 10 di percobaan pertama — sudah dicatat jujur di `mirza-bots/README.md` bagian "Memasang cc-plugin di Claude Code":

1. **`${CLAUDE_PLUGIN_ROOT}` di `plugin.json`** — apakah benar-benar ter-*expand* di versi Claude Code yang dipakai user. Kalau tidak, MCP server `cc-plugin` gagal start karena path `src/main.ts` tidak ketemu.
2. **Identitas `process.env.CLAUDE_PROJECT_DIR ?? process.cwd()`** (`cc-plugin/src/main.ts`, fungsi `resolveIdentityCwd()`) — apakah nilainya benar-benar sama dengan `bots["bot-01"].home` (`/Users/mirza/Workspace/mirza-bots`) di `config.json`. Kalau tidak cocok persis (termasuk soal symlink macOS `/var` vs `/private/var`, sudah dicatat reviewer sebagai risiko lama), `hello` dijawab `unknown_cwd` dan plugin gagal konek ke `fleetd`.
3. **(Ditemukan reviewer, out-of-scope, dicatat jujur bukan disembunyikan):** `node_modules` `cc-plugin` harus ada di direktori tempat Claude Code **benar-benar** men-spawn proses dari `${CLAUDE_PLUGIN_ROOT}` — kemungkinan itu BUKAN checkout repo `mirza-bots` ini kalau plugin dipasang lewat mekanisme marketplace resmi, melainkan salinan ter-install di tempat lain. Ini kemungkinan besar hambatan pertama yang ditemui, setelah identitas beres.

**Cara memverifikasi:** ikuti langkah di §5 di bawah — tiga risiko ini akan ketahuan persis di percobaan pertama memuat `cc-plugin`.

## 5. AKAN dikerjakan

**Goal:** menuntaskan Task 10 — bukti hidup bahwa bot pertama armada `mirza-bots` benar-benar bisa diajak bicara dari Telegram.

**Langkah konkret** (detail lengkap ada di plan Task 10 dan README `mirza-bots`):

1. **Baca `mirza-bots/README.md` bagian "Memasang `cc-plugin` di Claude Code"** — instruksi pemasangan sudah ditulis lengkap sesi lalu, termasuk peringatan soal `${CLAUDE_PLUGIN_ROOT}`.
2. **Nyalakan `fleetd` sungguhan:** `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun run start`. Cek `bun run doctor` melaporkan `botCount: 2`.
3. **Pandu user memuat `cc-plugin` ke SESI CLAUDE CODE BARU** (bukan sesi ini) — working directory sesi baru itu harus `/Users/mirza/Workspace/mirza-bots` persis (supaya `hello` cocok dengan `bots["bot-01"].home`). Ini langkah manual di luar kendali AI — AI cuma memberi instruksi persis, user yang eksekusi.
4. **Minta user kirim pesan teks sungguhan** ke bot-01 di Telegram. Konfirmasi berurutan: log `fleetd` menerima → baris masuk `conversations.db` → sesi Claude Code baru melihat notifikasi → AI di sesi itu bisa `reply` dan user menerimanya di Telegram.
5. **Uji foto tunggal DAN album** (multi-foto sekali kirim) — pastikan album jadi SATU baris pesan, bukan banyak.
6. **Uji tombol** — minta AI di sesi baru memanggil `reply` dengan `buttons`. User tap salah satu. **Yang paling penting diperiksa:** spinner tombol berhenti SEKETIKA (bukti `answerCallbackQuery` benar mendarat), dan AI menerima data tombol yang ditekan.
7. **Laporkan hasil jujur** — kalau ada yang gagal, itu temuan nyata tentang gap di Tugas 1-9, bukan sesuatu yang ditutup-tutupi. Update `README.md`/plan kalau ada yang perlu dikoreksi berdasarkan hasil nyata.

**Starting point paling langsung:** tawarkan ke user apakah mau dipandu step-by-step sekarang (seperti yang sudah disepakati sebelum handoff ini ditulis), lalu jalankan §5 poin 1-2 duluan (baca README, nyalakan fleetd) sebelum masuk ke bagian yang butuh sesi Claude Code kedua.

## 6. Referensi

⚠️ **JANGAN baca ulang seluruh riwayat sesi lalu dari awal** — sudah sangat panjang (dua tahap penuh + dua gelombang review). Cukup baca yang di bawah ini.

| File | Kapan dibaca |
|---|---|
| `mirza-bots/README.md` | **DI AWAL, wajib.** Sudah berisi instruksi instalasi `cc-plugin` + status Tahap 1 & 2 + peringatan risiko §4 di atas |
| `docs/superpowers/plans/2026-07-30-fleetd-jalur-pesan.md` §"Task 10" | **DI AWAL, wajib.** Langkah resmi Task 10 lengkap dengan alasan tiap sub-langkah |
| `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` | **Kondisional.** Arsitektur besar (fleetd/bot-cc/cc-plugin) — hanya kalau butuh konteks kenapa sesuatu dirancang begitu |
| `docs/2026-07-26-rebuild-audit/README.md` | **Kondisional.** Ledger keputusan K-1..K-18, B-1..B-8 — hanya kalau user mengajukan pertanyaan yang menyentuh keputusan lama |
| `~/.claude/mirza-bots/config.json` | **Saat butuh detail token/bot** — JANGAN print isi lengkapnya ke chat/log, ini file kredensial |
| `mirza-bots` git log (`git log --oneline`) | **Kondisional.** 17 commit, semua pesan commit deskriptif — cukup dibaca kalau butuh jejak spesifik |
| `docs/notes/` | **JANGAN.** Sistem lama, tidak relevan (aturan lama, masih berlaku) |

**Kode sistem lama** (`plugins/` di `mirza-marketplace`) — tidak relevan sama sekali untuk Task 10.

## 7. Keputusan user yang FINAL — jangan tanya ulang

| Keputusan | Catatan |
|---|---|
| **Nama repo `mirza-bots`** | FINAL, bukan sementara lagi (dikunci 2026-07-30) |
| **PTY holder `bot-cc`** (bukan `mirza-cc`)| `mirza-cc` adalah nama PRODUKSI sistem lama yang masih hidup — jangan disentuh, jangan dipakai ulang |
| **Repo `mirza-bots` di `/Users/mirza/Workspace/mirza-bots/`** | Git lokal, **belum ada remote** — jangan coba push, itu keputusan terpisah yang belum diambil |
| **Tahap 2 mengikuti definisi selesai spec penuh** | Poller + balas dasar + MCP `cc-plugin` minimal, bukan cuma "terima+simpan" |
| **Dukungan tombol inline ditambahkan** (user, sesi ini) | Bukan bagian rencana awal, diminta user setelah plan pertama ditulis — sudah lengkap dibangun + diuji |
| **`reply` routing pakai "chat terakhir yang mengirim ke bot ini"** | Simplifikasi Tahap 2 yang disengaja & didokumentasikan — bukan bug, akan diganti saat sesi/routing sungguhan ada di Tahap 4 |
| **Dua token bot sudah diberikan & disimpan** | Lihat §2. `bot-02` disiapkan untuk nanti, **JANGAN dipakai di Task 10** |
| **B-2/B-7/B-3/backup masih tertunda** | Tidak berubah dari handoff sebelumnya — belum relevan sampai Tahap 2 selesai total (Task 10) |

## 8. Anti-Patterns / Lessons — CARRY FORWARD

**Cara kerja yang terbukti di sesi ini** (pertahankan):

1. **Verifikasi setiap primitif berisiko secara hidup di scratchpad SEBELUM ditulis ke plan** — bukan cuma dipikirkan. Sesi ini memverifikasi: retry loop poller, `grammy` `apiRoot` override + `deleteWebhook`, timing `AlbumBuffer`, download file, round-trip MCP penuh + notifikasi kustom lewat `InMemoryTransport`, skema zod nested untuk button, `InlineKeyboard` + `callback_query` + `answerCallbackQuery` — semua sebelum ditulis ke dokumen plan. Ini yang membuat plan besar (2233 baris, 10 task) tetap solid.
2. **Self-review plan SEBELUM dispatch subagent menemukan bug nyata** — contoh: `AlbumBuffer` dibangun tapi tidak pernah benar-benar dipakai di poller (kriteria selesai spec sebut "album" eksplisit); kode "salah dulu baru benar" yang sengaja ditinggal di plan (melanggar aturan no-placeholder plan-writing). Keduanya diperbaiki SEBELUM subagent pertama didispatch.
3. **Temuan "plan-mandated" (bug ada di kode referensi plan sendiri) BUKAN otomatis konflik yang perlu ditanyakan ke user** — kalau perbaikannya murni memperbaiki bug tanpa mengubah niat/desain plan, itu fix biasa. Baru eskalasi ke user kalau perbaikannya benar-benar mengubah keputusan desain.
4. **Review akhir whole-branch menangkap hal yang review per-task TIDAK BISA** — 2 bug Critical di Tahap 2 (pembajakan reply, `drainQueue` mati) HANYA ketahuan saat melihat seluruh diff sekaligus, bukan per-task. Investasi waktu untuk review akhir yang teliti (model paling mampu) terbukti sepadan.
5. **Sabotage-testing** (sengaja merusak fix, konfirmasi test gagal, pulihkan fix, konfirmasi test lolos) adalah standar bukti yang jauh lebih kuat daripada sekadar "test hijau" — beberapa implementer sesi ini melakukan ini secara mandiri untuk fix yang berisiko tinggi (reply-hijack, drainQueue, answerCallbackQuery).
6. **Kredensial (token bot) yang diketik user di chat langsung dipindah ke file yang memang didesain untuk itu** (`config.json`, di luar git) — jangan biarkan menggantung cuma di transkrip percakapan.
7. **Model dipilih sesuai kompleksitas:** murah untuk task transkripsi-kode-lengkap, standar untuk integrasi menengah, Opus untuk task terbesar/paling berisiko (Task 6 di kedua tahap, semua review akhir whole-branch, semua gelombang fix besar).

**Kesalahan yang sudah terjadi — jangan ulangi:**

8. **Rename `mirza-cc` → `bot-cc` HAMPIR menyentuh sistem lama** — untung ketahuan lebih dulu bahwa `mirza-cc` adalah nama program PRODUKSI yang masih berjalan (`plugins/pty-controller/`), bukan cuma istilah rencana. Selalu cek dulu apakah sebuah nama sudah dipakai sistem lama sebelum rename massal.
9. **Agent subagent pernah mati di tengah jalan karena API error** (bukan kegagalan tugas) — sebelum redispatch dari nol, SELALU cek `git status`/`git diff` dulu untuk pastikan tidak ada perubahan setengah-jadi yang perlu diselamatkan/dibuang. Kalau bersih, resume via `SendMessage` ke agent yang sama lebih efisien daripada dispatch baru.
10. **Jangan biarkan concern yang ditemukan implementer (tapi sengaja tidak dieksekusi sendiri karena tidak yakin) menggantung** — kalau concern itu masuk akal dan risikonya rendah untuk diterapkan (seperti `CLAUDE_PROJECT_DIR`), terapkan langsung sebagai fix kecil terpisah, jangan cuma dicatat lalu dilupakan.

**Tentang user (penting, carry-forward dari sesi sebelumnya juga):**

11. **User sering multitasking dan lupa keputusan sebelumnya** — sisir ulang secara proaktif setelah rangkaian keputusan panjang. (Memory: `feedback-reconfirm-decisions`)
12. **User berbahasa Indonesia**, menghargai gaya *teach-me* untuk penjelasan konsep baru, tapi untuk eksekusi teknis (seperti sesi ini) lebih suka langsung jalan dengan konfirmasi ringkas di titik-titik keputusan besar saja.
13. **User memberi otorisasi "lanjut sampai selesai" secara eksplisit saat mau tidur** — itu otorisasi untuk MENYELESAIKAN pekerjaan yang sedang berjalan (Tahap 1 saat itu), BUKAN blanket-authorization untuk scope baru di masa depan. Setiap tahap besar baru (Tahap 2, dst.) tetap butuh persetujuan awal sebelum mulai dieksekusi besar-besaran.
14. **User rela memberi kredensial nyata (token bot) di tengah sesi kerja** — tandanya ia mempercayai proses ini cukup untuk pengujian sungguhan, bukan cuma simulasi. Hormati kepercayaan itu dengan tetap hati-hati (jangan print token ke log/chat, jangan commit ke git).

**Aturan repo yang berlaku** (`CLAUDE.md`):

15. Cek `git rev-parse --show-toplevel` sebelum commit. Kalau di bawah `~/.claude/plugins/` → **STOP**.
16. Commit bawa trailer `Agent: <nama>` (nama sesi ini: `renew-mirza-marketplace-2`), **push segera** ke `mirza-marketplace` (punya remote). `mirza-bots` **belum punya remote** — commit lokal saja, itu memang keadaannya sekarang, bukan lupa push.
17. Perubahan pada `mirza-marketplace/plugins/**` wajib lewat checklist 5 poin di `CLAUDE.md` — **sesi ini tidak menyentuh `plugins/** sama sekali**, semua kerja ada di `docs/`, `.handoff/`, dan repo terpisah `mirza-bots`.
