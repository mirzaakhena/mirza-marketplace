# Celah #4 — System-Outbox ke Telegram

**Date:** 2026-08-03 13:20 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, rencana, BACKLOG, handoff) — **repo kode ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `c577dd6` · HEAD kode: `298f5af`)
**Dari → Ke:** bot-01 → bot-02
**Pair:** —
**Lanjutan dari:** `.handoff/202608031054-prompt-celah-3-kirim-lampiran-keluar.md`
**Plan terkait:** — (celah #4 belum punya spec maupun rencana; celah #1, #2, #3 punya, dan ketiganya sudah tuntas)

---

## 1. Tujuan Handoff

Perintah user langsung. Paket "termurah dulu" — tiga celah yang user pilih
2026-08-02 — **habis hari ini**, ketiganya mendarat dan ketiganya terverifikasi
hidup lewat Telegram sungguhan. Sesi ini berhenti di titik bersih.

**Goal estafet:** **ukur dulu** apakah celah #4 (system-outbox → Telegram,
7,2/hari) benar-benar berdiri sendiri atau diam-diam menunggu celah #6
(wrapper PTY), lalu brainstorm bersama user, baru bangun.

Perhatikan urutannya: **mengukur adalah langkah pertama, bukan ngoding.** Itu
bukan formalitas — alasannya di §5 dan §9.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Per
2026-08-03 ia **satu paket**: `cc-plugin` **0.8.0**, tanpa daemon, **274 test**
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
  20 celah terukur, jendela 30 hari, keenam bot. Urutan dipilih user: **chunking
  → typing → kirim lampiran keluar.**
- **Celah #1 — chunking balasan panjang.** Merge `b53b99d` + `1e02af3`, rilis
  0.6.0 → 0.6.1. Terverifikasi hidup.
- **Celah #2 — indikator typing.** Merge `6deb4f9`, rilis 0.7.0. Terverifikasi
  user: *"Typing indicator padam tepat saat response bot saya terima."*
- **Celah #3 — kirim lampiran keluar.** Merge `298f5af`, rilis **0.8.0**.
  Enam keputusan user lewat inline button; spec
  `docs/superpowers/specs/2026-08-03-kirim-lampiran-keluar-design.md`, rencana
  `docs/superpowers/plans/2026-08-03-kirim-lampiran-keluar.md`.
  **Uji hidup 4/4 lulus**, diperiksa dari **dua meteran** — layar user dan
  `conversations.db` readonly: foto dengan preview · dokumen dengan nama
  terbaca · dua berkas satu panggilan (dua `message_id`, urut) · **path salah
  ketik tidak meninggalkan satu baris pun**.
- **Dua temuan baru dicatat:** **W-25** (`BUTTON_DATA_INVALID` mentah dari
  Telegram) dan **W-26** (backslash hilang di konverter markdown; data di db
  utuh). Keduanya di BACKLOG Bagian 7, keduanya **dengan frekuensi yang
  dinyatakan belum diukur** — itu disengaja, lihat §9.
- **`2026-08-02-keadaan-hari-ini.md` ditutup ceritanya.** Baris "kirim PDF" yang
  bot-03 coret karena tidak ada kodenya sekarang punya nomor merge, nomor versi,
  dan nomor baris database.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Dua repo bersih dan ter-push, worktree
`mirza-bots-bot-01-lampiran-keluar` sudah dihapus, branch `lampiran-keluar`
dihapus dengan `git branch -d` sehingga yang belum merge tidak mungkin ikut
terbuang. Tidak ada branch lokal selain `main` di kedua repo.)

## 5. Blocker

— (tidak ada yang memblokir eksekusi. Tapi baca §6 langkah 1 sebelum apa pun:
ada **ketergantungan yang belum terukur** antara celah #4 dan #6, dan user sudah
setuju bahwa langkah pertamamu adalah mengukurnya, bukan mengasumsikannya.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** celah #4 — kiriman proaktif (tanpa pesan masuk) sampai ke Telegram.
7,2/hari di sistem lama: notifikasi "sesi berganti", pengumuman handoff,
reminder terjadwal.

### Langkah 1 — UKUR DULU, dan ini bukan formalitas

Audit menulis celah #4 sebagai: *"Wrapper masih menulis berkasnya; **tidak ada
lagi yang membacanya**"* — 215 event `wrote system-outbox`, 107 baris
`source='system'` di db.

**Tapi wrapper yang menulis itu wrapper LAMA.** Sistem baru belum punya wrapper
sama sekali — itu celah #6, dan `grep -E "node-pty|conpty|resume"` atas seluruh
`mirza-bots` mengembalikan kosong (diperiksa 2026-08-02, BACKLOG Bagian 0).

Jadi pertanyaan yang harus dijawab **sebelum** menulis spec:

1. Siapa yang akan **menulis** system-outbox di sistem baru? Kalau jawabannya
   "wrapper", maka #4 menunggu #6 dan urutannya salah.
2. Apakah ada penulis lain yang tidak bergantung wrapper — cron, skill, sesi
   Claude Code itu sendiri? Ukur dari `messages.db` keenam bot: **siapa yang
   sebenarnya menulis 215 event itu**, bukan siapa yang secara teori bisa.
3. Berapa dari 107 baris `source='system'` yang datang dari jalur yang **masih
   akan ada** di sistem baru?

**Kalau ternyata #4 menggantung pada #6 — lapor user, jangan nekat jalan.**
User memilih arah ini dengan sadar bahwa langkah pertamanya adalah pengukuran;
melaporkan "ternyata nyantol" adalah hasil yang sah, bukan kegagalan.

### Langkah 2 — brainstorm, spec, rencana, baru kode

Urutan itu dipakai untuk celah #1, #2, dan #3, dan ketiganya mendarat bersih.
**JANGAN langsung ngoding.** Skill `superpowers:brainstorming` → spec di
`docs/superpowers/specs/` → rencana di `docs/superpowers/plans/` → TDD.

Datangi brainstorming dengan **angka**, bukan opini: itu yang membuat tiga sesi
sebelumnya menghasilkan keputusan yang tidak perlu diulang.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** ⚠️ `~/.claude/agent-playbook/PLAYBOOK.md` **SUDAH TIDAK ADA** — skill ini penggantinya |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild**, memuat blok "Kondisi sekarang" terbaru |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | **Di awal** — daftar 20 celah berikut frekuensi terukurnya; #4 ada di sana, begitu juga rantai #5/#6/#11 |
| `docs/superpowers/specs/2026-08-03-kirim-lampiran-keluar-design.md` + rencananya | Saat menulis spec celah #4 — pasangan spec+rencana terakhir yang mendarat bersih, pakai sebagai contoh bentuk |
| `mirza-bots/README.md` | Sebelum menjalankan atau merilis; memuat prosedur update plugin tiga langkah |
| BACKLOG **Bagian 7** | Saat menyentuh area yang punya W-1..W-26 |
| `mirza-marketplace/plugins/telegram/server.ts` (watcher system-outbox) + `plugins/pty-controller/wrapper/` | Saat mengukur langkah 1 — inilah penulis dan pembaca system-outbox di sistem lama |

## 8. Keputusan User Lewat Brainstorming

Enam keputusan celah #3, semuanya lewat inline button 2026-08-03. Dicantumkan
karena beberapa di antaranya adalah **preseden** yang berlaku untuk celah
berikutnya, bukan sekadar riwayat:

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Satu berkas per panggilan, array, atau album? | **Array, tiap berkas pesan terpisah** | Album ditunda; bisa ditambah tanpa membongkar kontrak |
| Teks jadi caption atau pesan terpisah? | **Selalu terpisah** | 14% teks penyerta >1024 char — caption akan memotong isi |
| Batas ukuran | **Dua batas** | Foto >10 MB turun jadi dokumen; >50 MB ditolak sebelum apa pun terkirim |
| Bentuk baris di db | **Satu baris per berkas** | Jumlah baris = jumlah pesan di layar — preseden dari chunking |
| `buttons` + `files` barengan? | **Dilarang** | Sama dengan sistem lama |
| Jaga agar state sendiri tak bisa dikirim? | **Tidak dibangun** | Keputusan sadar; alasannya di spec §3b, **jangan "perbaiki" diam-diam** |
| Arah sesudah celah #3 | **Celah #4, ukur dulu ketergantungannya ke #6** | Handoff ini |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan, bukan hanya
instruksinya, supaya bot berikutnya bisa menerapkan prinsipnya pada keputusan
yang belum terbayangkan. Diwariskan dari bot-02 → bot-03 → bot-01, dan sesi ini
menambah satu tingkat lagi.

**Tingkat 1 (dari bot-02): ukur dulu sebelum membangun.** Peta tahap mengukur
kemajuan dari sisi arsitektur; yang benar-benar menentukan adalah *"apa yang
masih menghalangi satu bot beneran pindah?"*

**Tingkat 2 (dari bot-03): ukur juga alasanmu untuk TIDAK membangun.** Spec
celah #1 menulis satu batas sebagai *"jarang, diangkat kalau benar-benar
menggigit"*. Ia menggigit di percobaan hidup **pertama**, tertangkap screenshot
user sementara 227 test hijau. Yang membuatnya lolos: kalimat itu **terdengar
hati-hati**, jadi tidak ada yang menuntut angka darinya.

**Tingkat 3 (sesi ini): kalau kamu tidak punya angkanya, katakan begitu —
jangan pilih kata yang menyembunyikan bahwa kamu tidak punya.** Sesi ini
menghadapi persis godaan yang menjebak spec celah #1: batas 10 MB untuk foto
belum pernah tersentuh dalam 110 kiriman. Menulis *"jarang"* akan terdengar
matang dan **tidak bisa diperiksa**. Yang ditulis: *"belum pernah terjadi dalam
110 kiriman"* — pernyataan yang sama-sama jujur tapi **punya penyangkalnya**.
W-25 dan W-26 ditulis dengan aturan yang sama: keduanya menyebut sendiri bahwa
frekuensinya belum diukur.

Bedanya halus dan itulah intinya: *"jarang"* adalah taksiran yang menyamar jadi
fakta; *"belum pernah dalam 110"* adalah fakta yang jujur soal batas
jangkauannya. **Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti hari ini

- ✅ **Kumpulkan pagar yang menjaga URUTAN ke dalam satu fungsi.** Kontrak
  terpenting celah #3 — *path salah ketik tidak meninggalkan teks yang sudah
  mendarat* — adalah soal urutan. Tiga baris berjejer di dalam `reply` hanya
  bertahan selama penyunting berikutnya ingat kenapa. Dikumpulkan jadi
  `prepareReply()` yang dipanggil sekali di atas loop kirim, urutannya dijaga
  strukturnya. Lihat `cc-plugin/src/engine/engine.ts`.
- ✅ **Verifikasi dari DUA meteran, dan query yang menyangkal.** Kriteria "path
  salah tidak mengirim apa pun" tidak dibuktikan dengan "tidak kelihatan di
  layar" — ada query khusus ke `conversations.db` mencari baris yang seharusnya
  tidak ada. Ketidakhadiran di satu meteran bukan bukti.
- ✅ **Test boleh menyalahkan dirinya sendiri.** Dua test yang saya tulis
  ternyata salah, bukan kodenya: satu menuntut format yang belum ada, satu
  memancing pagar narasi tombol dengan label non-numerik (pagar itu memang hanya
  menyala untuk label numerik ≥2). Diperbaiki di sisi test — bukan dengan
  melonggarkan kode agar test lewat.
- ✅ **Minta pelapor mengutip nilai balik APA ADANYA, bukan kesimpulannya.**
  Prompt uji hidup ke `bot-uji` meminta *"apa yang dikembalikan tool itu, apa
  adanya"*. Itu yang membuat `attachment not found: …` bisa dibandingkan dengan
  isi database, alih-alih menerima "sepertinya berhasil".
- ❌ **JANGAN `git add -A` di repo yang punya untracked milik sesi lain.**
  Commit BACKLOG sesi ini ikut menyapu **106 file** `.superpowers/sdd/**` —
  42.000 baris yang bukan pekerjaan sesi ini. Isinya memang milik repo
  (`.gitignore` menyatakan folder itu sengaja tidak di-ignore), jadi yang rusak
  pengelompokan commit-nya, bukan isinya. Sudah ter-push; **tidak** di-force-push
  untuk merapikan sejarah tanpa diminta user. Sumbernya: rencana yang sesi ini
  tulis sendiri mencantumkan `git add -A`. Pakai `git add <path>` eksplisit.
- ❌ **JANGAN pakai PowerShell `Set-Content -Encoding utf8` untuk menyunting
  berkas repo.** Di Windows PowerShell 5.1 ia menulis BOM **dan** meng-encode
  ulang: em-dash jadi mojibake. Ketahuan karena `git diff --stat` menunjukkan
  124 baris berubah untuk suntingan yang seharusnya 2 baris (= W-11, yang sudah
  pernah menggigit proyek ini). Pakai tool editor, dan **selalu periksa
  `git diff --stat` sebelum commit** — angka baris yang tidak masuk akal adalah
  alarm paling murah yang kamu punya.
- ❌ **JANGAN me-restart sesi user sendiri** (W-18). Selalu minta user, tunggu
  konfirmasi. W-23 adalah biaya terukurnya. Sesi ini menjalankan `claude plugin
  update` atas izin eksplisit user, lalu **berhenti** — restart tetap tangan
  user.
- ❌ **JANGAN membandingkan path dengan `===`** — pakai `samePath()` di
  `cc-plugin/src/engine/same-path.ts` (W-22).
- ❌ **JANGAN menyapa bot produksi untuk diagnosa.** Baca `conversations.db`
  dengan `new Database(path, { readonly: true })`.
- ⚠️ **Sesi memakai versi plugin saat sesi dibuka** (W-18). Setelah
  `claude plugin update`, sesi lama tetap menjalankan kode lama tanpa sinyal apa
  pun. Verifikasi dengan `claude plugin list`, bukan dengan keluaran `update`.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `c577dd6`, kode HEAD `298f5af`. Commit kode sesi ini:
  `74e84cd` (attach.ts) · `523fd1b` (storeOutgoing) · `1dd10a2`
  (sendAttachments) · `3b1152e` (reply files) · `f7bf8bd` (server) · `6f60e87`
  (rilis 0.8.0) · `298f5af` (merge). Dokumen: `e9138fb` (spec) · `0a5b284`
  (rencana) · `c577dd6` (BACKLOG + keadaan-hari-ini).
- **Berkas uji yang ditinggalkan sengaja:**
  `C:\Users\Mirza\workspace\bot-uji\uji-lampiran\` berisi `contoh-foto.png` dan
  `contoh-dokumen.md`. Berguna untuk uji regresi lampiran; hapus kalau
  mengganggu.
- **Sisa di remote, sengaja tidak disentuh:** `origin/penyatuan-engine` dan
  `origin/tahap25-keluar` masih ada di GitHub meski sudah ter-merge. Menghapus
  branch remote itu tindakan keluar dan belum diminta user — tanyakan dulu.
- **Versi terpasang:** `cc-plugin` **0.8.0** (diverifikasi lewat
  `claude plugin list`) · `inline-buttons` 0.0.10 · `telegram` (marketplace lama)
  0.0.37-mirza.0.
- **Cara menjalankan:** tidak ada daemon. Buka sesi Claude Code di folder yang
  terdaftar sebagai `home` sebuah bot, dan bot itu mulai menarik pesan.
- **Bot uji:** `bot-uji`, rumahnya `C:\Users\Mirza\workspace\bot-uji`.
  Satu-satunya entri di `~/.claude/mirza-bots/config.json`. **Tidak terdaftar di
  agent-bus** — jadi uji hidup harus lewat tangan user; kamu tidak bisa
  menyuruhnya mengirim apa pun. Yang bisa kamu lakukan: **tulis prompt siap
  tempel** untuk user, seperti yang sesi ini lakukan.
- **Celah sesudah #4**, dari daftar audit: **#5 antar-bot lewat PTY (5,0/hari)**
  · **#6 wrapper PTY + resume (4,6/hari)** · **#11 handoff utuh (0,36/hari)** —
  ketiganya **satu rantai**; membangun satu tanpa dua lainnya tidak menghasilkan
  apa pun yang bisa dipakai.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* Dan: *"kita tidak perlu presisi di sini… no need to be
  so serious"* — kalibrasi usaha ke taruhannya.
