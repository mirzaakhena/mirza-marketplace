# Celah #3 — Kirim Lampiran Keluar dari Sistem Baru

**Date:** 2026-08-03 10:54 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, rencana, BACKLOG, handoff) — **repo kode ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `2036ec7` · HEAD kode: `8c16925`)
**Dari → Ke:** bot-03 → bot-01
**Pair:** —
**Lanjutan dari:** `.handoff/202608021215-prompt-audit-celah-migrasi-bot-harian.md`
**Plan terkait:** — (celah #3 belum punya spec maupun rencana; celah #1 dan #2 punya, dan keduanya sudah tuntas)

---

## 1. Tujuan Handoff

Perintah user langsung. Dua dari tiga celah yang ia pilih sudah selesai dan
terverifikasi hidup hari ini; sesi ini berhenti di titik bersih.

**Goal estafet:** bangun **celah #3 — kirim lampiran keluar** (`files` pada
tool `reply`), celah terakhir dari paket "termurah dulu" yang user pilih.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Per
2026-08-03 ia **satu paket**: `cc-plugin` **0.7.0**, tanpa daemon, **241 test**
hijau di Windows 11 / Bun 1.3.11. Seluruh state terpusat di
`~/.claude/mirza-bots/`.

Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani **enam bot harian** user. Sistem **baru** melayani satu bot percobaan,
`bot-uji`. Pekerjaan sekarang adalah menutup celah satu per satu sampai sebuah
bot harian benar-benar bisa pindah.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main`, ter-push, dan **terverifikasi hidup lewat Telegram
sungguhan** — bukan sekadar hijau di test.

- **Audit celah migrasi** — `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md`.
  20 celah terukur dari `messages.db` + `wrapper.log` + `session-names.json`
  keenam bot, jendela 30 hari. Urutan pengerjaan dipilih user: **chunking →
  typing → kirim lampiran keluar.**
- **Celah #1 — chunking balasan panjang.** Merge `b53b99d`, lalu `1e02af3`
  (pagar kode terbelah). Rilis 0.6.0 → 0.6.1. Terverifikasi: 8.918 karakter
  jadi 5 pesan, kutipan hanya di pesan pertama, tombol hanya di terakhir, tidak
  ada teks hilang di sambungan.
  Spec `docs/superpowers/specs/2026-08-02-chunking-balasan-panjang-design.md`.
- **Celah #2 — indikator typing.** Merge `6deb4f9`, rilis 0.7.0.
  Terverifikasi user: *"Typing indicator padam tepat saat response bot saya
  terima."* Spec `docs/superpowers/specs/2026-08-03-indikator-typing-design.md`.
- **Dokumen dikoreksi** — `docs/2026-08-02-keadaan-hari-ini.md` memuat tiga
  klaim palsu di daftar "sudah terbukti hidup"; salah satunya (*"kirim PDF"*)
  **tidak ada kodenya sama sekali**, dan itulah celah #3 ini.
- **Dua temuan baru dicatat:** **W-23** (biaya terukur pertama dari W-18) dan
  **W-24** (batas yang ditulis "jarang" ternyata menggigit di percobaan
  pertama). Keduanya di BACKLOG Bagian 7.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Dua repo bersih dan ter-push, tidak ada worktree
tersisa, dan **lima branch lokal basi sudah dihapus** di `mirza-bots`:
`fix-markdown-escape`, `fix-path-compare`, `fix-session-hook`,
`penyatuan-engine`, `tahap25-keluar` — semuanya sudah ter-merge, dihapus dengan
`git branch -d` sehingga yang belum merge tidak mungkin ikut terbuang.)

## 5. Blocker

— (tidak ada. Arah celah #3 dipilih user secara eksplisit lewat inline buttons
pada 2026-08-02, sebagai bagian dari paket "termurah dulu".)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** tool `reply` bisa mengirim berkas — foto dan dokumen — ke Telegram.

### Kenapa ini yang terakhir dari tiga, dan kenapa itu bukan berarti remeh

Frekuensinya **2,7/hari** (48 dokumen + 32 foto dalam 30 hari) — paling jarang
di antara tiga celah paket ini. Tapi ia satu-satunya yang membuat sebuah
kalimat di dokumen proyek **berbohong**: `2026-08-02-keadaan-hari-ini.md`
sempat menulis "kirim PDF" sudah terbukti hidup. Mencari `sendDocument`,
`sendPhoto`, dan `InputFile` di seluruh `mirza-bots/cc-plugin/src`
mengembalikan **nol**. Itu bukan belum diuji — tidak ada kodenya.

### Langkah konkretnya

1. **Brainstorm dulu bersama user** (skill `superpowers:brainstorming`), lalu
   spec, lalu rencana, baru kode. Itu urutan yang dipakai untuk celah #1 dan
   #2 dan keduanya mendarat bersih.
2. Pertanyaan desain yang sudah kelihatan dari sini — **jangan diputuskan
   sendiri, tanyakan:**
   - Satu berkas per panggilan `reply`, atau beberapa sekaligus (album)?
   - Berkas + teks dalam satu pesan (caption), atau berkas sebagai pesan
     terpisah? Sistem lama memisahkannya.
   - Batas ukuran dan apa yang terjadi saat dilewati. Sistem lama menolak di
     atas 50 MB **dengan pemberitahuan**, bukan diam.
   - Bagaimana barisnya disimpan ke `conversations.db`. Sistem lama menulis
     satu baris per berkas dengan `attachments`; sistem baru belum punya jalur
     itu untuk arah keluar.
3. Referensi implementasi sistem lama:
   `mirza-marketplace/plugins/telegram/server.ts` sekitar baris **823-873**
   (loop kirim berkas + `logOutbound` untuk lampiran) dan konstanta
   `PHOTO_EXTS`.
4. Titik sentuh di sistem baru: `cc-plugin/src/engine/engine.ts` (`reply()`,
   sekitar baris 429-500), `cc-plugin/src/server.ts` (skema input tool
   `reply`), `cc-plugin/src/engine/types.ts`.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** ⚠️ `~/.claude/agent-playbook/PLAYBOOK.md` **SUDAH TIDAK ADA** — skill ini penggantinya |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild**, memuat blok "Kondisi sekarang" terbaru |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | **Di awal** — daftar 20 celah berikut frekuensi terukurnya; §6 memuat urutan yang user pilih |
| `mirza-bots/README.md` | Sebelum menjalankan atau merilis; memuat prosedur update plugin tiga langkah |
| `docs/superpowers/specs/2026-08-02-chunking-balasan-panjang-design.md` + `2026-08-03-indikator-typing-design.md` | Saat menulis spec celah #3 — dua spec terakhir yang mendarat bersih, pakai sebagai contoh bentuk |
| `mirza-marketplace/plugins/telegram/server.ts` baris 823-873 | Saat mengimplementasi pengiriman berkas — inilah cara sistem lama melakukannya |
| BACKLOG **Bagian 7** | Saat menyentuh area yang punya W-1..W-24 |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Urutan menggarap celah | **"Termurah dulu"** — chunking → typing → lampiran keluar | Rantai wrapper PTY / agent-bus / handoff sengaja ditunda |
| Potongan pesan panjang dikasih penanda `(1/3)`? | **Tidak, polos** | Menghapus satu aturan yang harus dijelaskan |
| Lewat batas panjang: tolak atau tetap kirim? | **Tetap kirim, dipotong** | Isi hilang lebih buruk daripada isi panjang |
| Target panjang balasan | **1000 karakter** | Pedoman di prompt, bukan gerbang |
| Typing: satu tembakan / diulang / tidak dibangun | **Diulang** | 97,6% giliran lebih lama dari 5 detik |
| Typing berhenti kapan | **Di balasan pertama** | "Masih kerja padahal sudah diam" lebih mahal daripada sebaliknya |
| Batas 5 menit untuk giliran yang mati | **Diterima**, penanda Stop hook tidak dibangun | Prasyaratnya dicatat di spec typing §3 |
| Verifikasi hidup typing | **Sekilas saja** | *"Kita tidak perlu presisi di sini"* |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta agar **alasan** ikut diserahkan, bukan hanya instruksinya, supaya
bot berikutnya bisa menerapkan prinsipnya pada keputusan yang belum
terbayangkan. Diwariskan dari bot-02, dan sesi ini menambah satu tingkat:

**Ukur dulu sebelum membangun.** Peta tahap mengukur kemajuan dari sisi
arsitektur; yang benar-benar menentukan adalah *"apa yang masih menghalangi
satu bot beneran pindah?"*

**Dan ukur juga alasanmu untuk TIDAK membangun.** Itu tambahan hari ini
(W-24). Spec celah #1 menulis satu batas sebagai *"jarang, diangkat kalau
benar-benar menggigit"*. Ia menggigit di percobaan hidup **pertama**, dan
tertangkap **screenshot user** sementara 227 test hijau. Dua taksiran salah
dalam satu kalimat: frekuensinya (*"jarang"* — padahal balasan panjang bot ini
hampir selalu memuat blok kode) dan biayanya (*"butuh parser"* — ternyata mesin
status sepuluh baris). Yang membuatnya lolos: kalimat itu **terdengar
hati-hati**, jadi tidak ada yang menuntut angka darinya.

- ✅ **Ukur dari data yang sudah ada, bukan dari ingatan.** Tiga keputusan
  desain hari ini digerakkan angka: 97,6% giliran > 5 detik (menolak port
  typing apa adanya), 34% balasan > 1000 karakter (memilih angka pedoman), 10%
  panggilan `reply` menghasilkan >1 pesan (membuktikan chunking memang dipakai).
- ✅ **Verifikasi laporan sendiri sebelum menyampaikannya.** Saya sempat
  melaporkan "tombol tidak muncul" karena tidak ada di database — padahal
  tombol memang tidak pernah disimpan di sana. Ketidakhadiran di satu meteran
  bukan bukti.
- ✅ **Minta reviewer MENJALANKAN, bukan membaca.** Dua lubang di perbaikan
  pagar kode ditemukan karena reviewer diminta memanggil fungsinya dengan input
  aneh. Keduanya punya bukti keluaran nyata, bukan dugaan.
- ✅ **Aturan yang bergantung ingatan AI akan luntur; pasang umpan baliknya.**
  Pedoman 1000 karakter ditulis di prompt DAN nilai balik tool menyebut panjang
  terkirim. Aturan tanpa umpan balik tidak bisa dipelajari.
- ❌ **JANGAN me-restart sesi user sendiri** (W-18). Selalu minta user, dan
  tunggu konfirmasi. W-23 adalah biaya terukur dari melewatkan ini.
- ❌ **JANGAN membandingkan path dengan `===`** — pakai `samePath()` di
  `cc-plugin/src/engine/same-path.ts` (W-22).
- ❌ **JANGAN membuat hook meng-import kode engine** — duplikasi lima baris
  jauh lebih murah daripada hook yang tampak terpasang dan menjaga nol.
- ❌ **JANGAN menyapa bot produksi untuk diagnosa.** Baca `conversations.db`
  dengan `new Database(path, { readonly: true })`.
- ⚠️ **Sesi memakai versi plugin saat sesi dibuka** (W-18). Setelah
  `claude plugin update`, sesi lama tetap menjalankan kode lama tanpa sinyal
  apa pun.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `2036ec7` (12 commit sesi ini, `33c57fb..2036ec7`);
  kode HEAD `8c16925` (15 commit, `406a239..8c16925`). Dua repo bersih dan
  ter-push. **Tidak ada worktree tersisa, tidak ada branch lokal selain `main`.**
- **Sisa di remote, sengaja tidak disentuh:** `origin/penyatuan-engine` dan
  `origin/tahap25-keluar` masih ada di GitHub meski sudah ter-merge. Menghapus
  branch remote itu tindakan keluar dan belum diminta user — tanyakan dulu
  kalau mau dibereskan.
- **Versi terpasang:** `cc-plugin` **0.7.0** · `inline-buttons` 0.0.10 ·
  `telegram` (marketplace lama) 0.0.37-mirza.0.
- **Cara menjalankan:** tidak ada daemon. Buka sesi Claude Code di folder yang
  terdaftar sebagai `home` sebuah bot, dan bot itu mulai menarik pesan.
- **Bot uji:** `bot-uji`, rumahnya `C:\Users\Mirza\workspace\bot-uji`.
  Satu-satunya entri di `~/.claude/mirza-bots/config.json`. **Tidak terdaftar di
  agent-bus** — jadi uji hidup harus lewat tangan user; kamu tidak bisa
  menyuruhnya mengirim apa pun.
- **Celah berikutnya sesudah #3**, dari daftar audit: #4 system-outbox
  (7,2/hari) · #5 antar-bot lewat PTY (5,0/hari) · #6 wrapper PTY + resume
  (4,6/hari). Nomor 5, 6, dan 11 satu rantai — membangun satu tanpa dua lainnya
  tidak menghasilkan apa pun yang bisa dipakai.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* Dan tambahan hari ini: *"kita tidak perlu presisi di
  sini… no need to be so serious"* — kalibrasi usaha ke taruhannya.
