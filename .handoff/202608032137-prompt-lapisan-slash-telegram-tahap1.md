# Lapisan Slash Telegram Tahap 1 — Kode

**Date:** 2026-08-03 21:37 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, rencana, BACKLOG, handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `bb8084e` · HEAD kode: `94511fd`)
**Dari → Ke:** bot-02 → bot-01
**Pair:** —
**Lanjutan dari:** `.handoff/202608031320-prompt-celah-4-system-outbox.md`
**Plan terkait:** `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md` — belum ada satu task pun dikerjakan

---

## 1. Tujuan Handoff

Perintah user langsung. Sesi ini berangkat untuk **mengukur** celah #4, dan
pengukurannya membelokkan seluruh arah: dari "bangun system-outbox" menjadi
"definisikan ulang wrapper" — atas keputusan user.

**Goal estafet:** kerjakan **rencana tahap 1 lapisan slash Telegram** — enam
task TDD yang membuat `/rename` dan `/new` bekerja dari Telegram, plus jalur
konfirmasi tombol untuk slash yang tidak dikenal.

Spec dan rencananya sudah ditulis, di-review, dan disetujui user. **Yang tersisa
murni implementasi.**

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Per hari
ini ia **dua paket**: `cc-plugin` (engine, Bun) dan **`cc-wrapper` (BARU,
Node + tsx)**. Seluruh state terpusat di `~/.claude/mirza-bots/`.

Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian. Sistem **baru** melayani satu bot percobaan,
`bot-uji`. Pekerjaan sekarang: menutup celah sampai satu bot harian benar-benar
bisa pindah.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main` dan ter-push di **kedua** repo.

**Pengukuran (mengubah arah proyek):**

- **Celah #4 diukur ulang dan PECAH DUA** — `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` **§8** (commit `5c8d418`). Audit menyandingkan "215 event system-outbox" dengan "107 baris `source='system'`" seolah sebab-akibat. Terukur: **tidak berhubungan sama sekali.** 692/692 event system-outbox bertipe `session-change`; **0 dari 317** baris `source='system'` berasal dari sana; **0 dari 10.822** baris armada punya `metadata.kind` padahal handler-nya selalu menulisnya. **4a** (5,7/hari) menggantung penuh pada #6; **4b** (2,3/hari) berdiri sendiri.

**Kode (`mirza-bots`, sembilan commit):**

- **Fondasi `cc-wrapper`** — `c96a633` probe · `d51da3a` kerangka · `efbb69b` typer · `8784e8f` antrean · `17ac7fb` registry · `584496d` inbox · `bb4cd88` rakit · `8f5ec0f` argumen CLI · `36a0515` singleton + `--continue` + gerbang trust · `94511fd` README.
- **57 test hijau, `tsc --noEmit` bersih.**
- **Terverifikasi hidup lewat TUI sungguhan** (user menjalankan wrapper, bot-02 menjatuhkan payload): perintah tunggal ✅ · batch berurutan ✅ **termasuk saat CC sedang sibuk** ✅ · berkas `pending/` terhapus ✅ · flag CC diteruskan utuh ✅ · peringatan transcript tidak muncul ✅ · penolakan lock ✅ · deteksi gerbang trust ✅.

**Dokumen (`mirza-marketplace`, enam commit):**

- Spec `cc-wrapper` — `71a47f3`, plus §4.5 di `988f437`.
- Rencana fondasi `cc-wrapper` — `c003aa2`, hasil uji hidup `9a06f32`, Task 0 `bd1d460`.
- Spec lapisan slash Telegram — `dab3398`.
- Rencana tahap 1 — `8d7b05d`.
- BACKLOG Bagian 0 — `f0b5f0d`, `bb8084e`.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, tidak ada worktree.)

## 5. Blocker

— (tidak ada. Spec dan rencana sudah di-review dan disetujui user; daftar
"dikenal" empat command sudah dikonfirmasi. Langsung eksekusi §6.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** kerjakan `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md`
— enam task TDD, dari Task 1 sampai uji hidup Task 6.

Ringkasnya: empat modul murni (`classify`, `session-name`, `map`, `pending`) →
perakitan (`index`) → penyisipan ke `engine.ts`. Semua di
`mirza-bots/cc-plugin/src/engine/slash/`.

**Dua hal di rencana itu yang lahir dari luka lama — jangan dilewati:**

1. **CATAT DULU, BARU CEGAT** (Task 6). Sistem lama memanggil
   `tryRouteMetaCommand()` **sebelum** `logInbound()`, jadi sepuluh command
   tidak pernah tercatat. Biayanya nyata: audit membaca `/switch` sebagai **0×
   dipakai** dan nyaris mencoretnya; angka sebenarnya **139×**.
2. **Pagar 55 byte pada `callback_data`** (Task 6 Step 4). Telegram menolak di
   atas 64 dengan `BUTTON_DATA_INVALID` — itu **W-25**, sudah tercatat di
   BACKLOG Bagian 7.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu, lalu spec lapisan slash, lalu rencananya.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** ⚠️ `~/.claude/agent-playbook/PLAYBOOK.md` **SUDAH TIDAK ADA** — skill ini penggantinya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild** |
| `docs/superpowers/specs/2026-08-03-lapisan-slash-telegram-design.md` | **Di awal** — spec yang sedang dieksekusi; kalau plan dan spec berbeda, **spec yang benar** |
| `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md` | **Di awal** — enam task, kode lengkap di tiap step |
| `docs/superpowers/specs/2026-08-03-cc-wrapper-design.md` | Saat butuh tahu kontrak `pending/` atau kenapa wrapper tidak punya daftar putih |
| `mirza-bots/cc-wrapper/PROBE.md` | Saat menyentuh startup wrapper atau bingung kenapa runtime-nya Node |
| `mirza-bots/cc-wrapper/README.md` + `mirza-bots/README.md` | Sebelum menjalankan wrapper |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` **§8** | Saat butuh angka frekuensi, atau sebelum memilih celah berikutnya |
| BACKLOG **Bagian 7** | Saat menyentuh area yang punya W-1..W-26 (Task 6 menyentuh **W-25**) |

## 8. Keputusan User Lewat Brainstorming

Semuanya lewat inline button atau pernyataan eksplisit user, 2026-08-03.

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Arah sesudah ukur celah #4 | **Definisikan ulang wrapper** | Lahir spec + fondasi `cc-wrapper` |
| Wrapper membatasi command? | **Tidak — suntik apa pun yang sah** | Daftar putih naik ke lapisan atas |
| Bentuk lifecycle per-command | **Data, bukan class** | Menambah command = menambah satu baris |
| Default command tak terdaftar | **Ketik + Enter, tanpa menunggu** | Yang butuh perlakuan didaftarkan |
| Kalau `postCheck` gagal, siapa diberi tahu? | **User, lewat Telegram** | Wrapper butuh kanal keluar |
| Wrapper kirim sendiri atau menitip? | **Menitip file** | Loose coupling; wrapper tetap bodoh soal Telegram |
| Pemilik hook CC | **Paket netral, dipakai bersama** | Menghapus duplikasi wrapper-vs-plugin |
| Dua wrapper di satu folder? | **Tolak yang kedua** | Kebalikan `cc-plugin`; yang mahal di sini sesi hidup |
| Cara resume saat start | **`--continue`, bukan `--resume` dari mtime** | Wrapper berhenti menyalin layout internal CC |
| Gerbang kepercayaan folder | **Deteksi dan lapor, JANGAN lewati otomatis** | Menyuntik Enter = memercayai folder atas nama user |
| Slash Telegram diteruskan mentah? | **Tidak — diolah dulu di `cc-plugin`** | Lapisan ini bukan pipa |
| Slash yang tidak dikenal | **Teruskan, tapi konfirmasi tombol dulu** | Daftar "dikenal" boleh pendek |
| Daftar "dikenal" | **Empat**: `/rename`, `/new`, `/switch`, `/context` | Tahap 1 hanya dua yang pertama + konfirmasi |
| Nama paket | **`cc-wrapper`** | Konsisten dengan `cc-plugin` |
| Buang kata "mirza" dari sistem | **Ya, tapi nanti** | Tiga tempat; folder state paling mahal |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan, bukan hanya
instruksinya, supaya bot berikutnya bisa menerapkan prinsipnya pada keputusan
yang belum terbayangkan. Diwariskan bot-02 → bot-03 → bot-01 → bot-02, dan sesi
ini menambah satu tingkat lagi.

**Tingkat 1 (bot-02): ukur dulu sebelum membangun.** Yang menentukan bukan
"tahap berapa" melainkan *"apa yang masih menghalangi satu bot beneran pindah?"*

**Tingkat 2 (bot-03): ukur juga alasanmu untuk TIDAK membangun.** Spec celah #1
menulis satu batas sebagai *"jarang"*; ia menggigit di percobaan hidup pertama.
Yang membuatnya lolos: kalimat itu **terdengar hati-hati**, jadi tidak ada yang
menuntut angka darinya.

**Tingkat 3 (bot-01): kalau tidak punya angkanya, katakan begitu** — jangan
pilih kata yang menyembunyikan bahwa kamu tidak punya. *"Jarang"* adalah
taksiran yang menyamar jadi fakta; *"belum pernah dalam 110 kiriman"* adalah
fakta yang jujur soal batas jangkauannya.

**Tingkat 4 (sesi ini): dua meteran yang masing-masing benar bisa melahirkan
sebab-akibat yang tidak ada.** Baris #4 audit menyandingkan angka wrapper dengan
angka database, dan penyandingannya sendiri yang berbohong — bukan angkanya.
Yang membongkarnya bukan membaca lebih teliti, melainkan **query yang mencari
barang yang seharusnya ada kalau dugaan itu benar** (`metadata.kind` — nol dari
10.822 baris).

Turunan praktisnya, dan ini terjadi **dua kali** hari ini:

- **Layar bukan meteran yang cukup.** `/rename` yang mendarat saat CC sibuk
  tidak meninggalkan jejak di layar. Membaca dari layar saja akan menyimpulkan
  gagal, lalu membangun barrier untuk masalah yang tidak ada. Yang membuktikan
  sebaliknya: `customTitle` di berkas sesi CC — yang **hanya bisa ditulis CC**
  sesudah memproses perintahnya.
- **Log yang menyebut nama sebuah fitur bukan bukti fitur itu berjalan.**
  `wrapper.log` memuat 277 baris `injecting /rename + /notify-user`, dan
  injeksi `/notify-user` **sudah tidak ada di kodenya**. Teks log itu basi.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti hari ini

- ✅ **Ukur dulu, bahkan untuk hal yang "jelas".** Task 0 `cc-wrapper` sengaja
  tidak menulis kode produk — ia membuktikan runtime. Hasilnya: **Bun gagal**
  di `pty.write()`. Kalau ditebak, tebakannya menular ke enam task berikutnya.
- ✅ **Probe kecil menemukan hal yang tidak dicarinya.** Probe runtime menemukan
  `CLAUDE_CODE_CHILD_SESSION` mematikan transcript sesi anak; probe `--continue`
  menemukan gerbang kepercayaan folder. Keduanya di luar pertanyaan aslinya, dan
  keduanya mengubah rencana.
- ✅ **Tulis yang sengaja TIDAK dibangun, berikut alasannya.** Gerbang trust
  **terbukti bisa** dilewati injeksi Enter dan sengaja tidak dilakukan. Kalau
  tidak ditulis, penyunting berikutnya akan "memperbaikinya" dan mengambil
  keputusan keamanan atas nama user tanpa sadar.
- ✅ **Kebijakan yang tampak tidak konsisten perlu alasannya ditulis.**
  `cc-plugin` membunuh pemegang lock lama; `cc-wrapper` menolak pendatang baru.
  Terlihat kontradiktif sampai aturannya dinyatakan: **lindungi yang paling
  mahal kalau hilang.**
- ❌ **JANGAN percaya `$$` di Git Bash sebagai PID Windows.** Uji lock pertama
  gagal karena `$$` memberi PID MSYS; `process.kill()` dari Node tidak
  menemukannya, jadi lock dikira stale. Pakai PID proses Windows sungguhan.
- ❌ **JANGAN `git add -A`** di repo yang punya untracked milik sesi lain
  (pernah menyapu 106 berkas asing). Pakai `git add <path>` eksplisit.
- ❌ **JANGAN pakai PowerShell `Set-Content -Encoding utf8`** untuk menyunting
  berkas repo — BOM + em-dash jadi mojibake (W-11). Selalu periksa
  `git diff --stat` sebelum commit.
- ❌ **JANGAN me-restart sesi user sendiri** (W-18). Minta user, tunggu
  konfirmasi.
- ❌ **JANGAN menyapa bot produksi untuk diagnosa.** Baca `messages.db` dengan
  `new Database(path, { readonly: true })`.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `bb8084e`, kode HEAD `94511fd`. Commit kode sesi
  ini: `c96a633`…`94511fd` (sepuluh). Commit dokumen: `5c8d418`, `71a47f3`,
  `c003aa2`, `bd1d460`, `9a06f32`, `f0b5f0d`, `dab3398`, `8d7b05d`, `988f437`,
  `bb8084e`.
- **Berkas probe sengaja ditinggalkan:** `cc-wrapper/probe/` berisi tiga probe
  (`spawn-probe`, `continue-probe`, `trust-probe`). Cara mengulang pengukurannya
  ada di `PROBE.md`. Hapus kalau mengganggu.
- **Uji hidup butuh tangan user.** `bot-uji` **tidak terdaftar di agent-bus**,
  jadi kamu tidak bisa menyuruhnya mengirim apa pun. Yang bisa kamu lakukan:
  **tulis perintah siap tempel** untuk user, seperti yang sesi ini lakukan.
  Sesi ini juga terbukti bisa **menjatuhkan payload sendiri** ke `pending/`
  selagi user memegang terminalnya — pembagian kerja itu bekerja baik.
- **Versi terpasang:** `cc-plugin` **0.8.0** · `inline-buttons` 0.0.10 ·
  `telegram` (marketplace lama) 0.0.37-mirza.0. `cc-wrapper` **belum dirilis
  sebagai plugin** — ia dijalankan langsung lewat `npx tsx`.
- **Sisa di remote, sengaja tidak disentuh:** `origin/penyatuan-engine` dan
  `origin/tahap25-keluar` masih ada di GitHub meski sudah ter-merge. Menghapus
  branch remote itu tindakan keluar dan belum diminta user — tanyakan dulu.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* Dan: *"kita tidak perlu presisi di sini… no need to be
  so serious"* — kalibrasi usaha ke taruhannya.
- **Satu kalimat user yang mengoreksi saya hari ini, dan layak dibawa:** *"saya
  ingin natively kita bisa menjalankan command apapun yang valid di
  claude-code"* — maksudnya **di level `cc-wrapper`**, bukan di level Telegram.
  Di Telegram justru diolah dulu. Saya sempat menafsirkannya terbalik.
