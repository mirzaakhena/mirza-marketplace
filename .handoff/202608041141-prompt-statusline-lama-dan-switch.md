# Statusline Enam Bot Lama, `/switch`, dan Penjaga Singleton

**Date:** 2026-08-04 11:41 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `8230b14` · HEAD kode: `3abcc58`)
**Dari → Ke:** bot-02 → bot-03
**Pair:** —
**Lanjutan dari:** `.handoff/202608040212-prompt-lapisan-slash-telegram-tahap2.md`
**Plan terkait:** `docs/superpowers/plans/2026-08-04-context-telegram.md` — **SELESAI seluruhnya**. Tiga pekerjaan di bawah **belum punya spec maupun rencana**

---

## 1. Tujuan Handoff

Perintah user langsung, sesudah `/context` ditutup dan diverifikasi hidup.

**Goal estafet:** tiga pekerjaan yang sudah jelas bentuknya tapi belum
dikerjakan — **(1)** memulihkan statusline enam bot harian yang masih mati,
**(2)** membangun **`/switch`** (bagian tahap 2 yang belum tersentuh), **(3)**
memberi `mirza-cc` penjaga singleton. User melihat daftarnya dan menyebutnya
*"tasks yang cukup jelas"*, lalu meminta estafet ke bot-03.

Urutan yang disarankan: **(1) dulu** — paling murah, hasilnya langsung terasa
user, dan tidak menyentuh kode sama sekali. **(3)** paling berisiko, taruh
terakhir.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine, Bun) dan `cc-wrapper` (PTY, Node + tsx). Seluruh state
terpusat di `~/.claude/mirza-bots/`.

Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian, dijalankan lewat launcher `mirza-cc`. Sistem **baru**
melayani satu bot percobaan, `bot-uji`, lewat launcher `mirza-bot`. Pekerjaan
sekarang: menutup celah sampai satu bot harian benar-benar bisa pindah.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main` dan ter-push di **kedua** repo. 21 commit kode, 9
commit dokumen.

**`/context` TUNTAS — rilis `cc-plugin` 0.10.4, 399 test hijau.**
Lima dari enam kriteria uji **terverifikasi hidup**; dikonfirmasi user:
*"mirza-bot sudah menampilkan statusline, /context-nya juga bisa bekerja dengan
baik, telegram pun tersambung"*.

- Spec `docs/superpowers/specs/2026-08-04-context-telegram-design.md`, rencana
  `docs/superpowers/plans/2026-08-04-context-telegram.md` (7 task TDD, selesai).
- Modul baru `cc-plugin/src/engine/context/`: `render` (murni, nol import) ·
  `chain` (murni) · `install` · `status-file` · `bot-for-cwd` (murni) ·
  `invoke` (murni) · `wait`, plus `bin/statusline-bridge.ts`.
- Merge: `4ab984b` → `6e6c8db` → `da28825` → `98fc490`; rilis `db0f916`.
- **Deskripsi menu `/` disamakan dengan sistem lama**, bahasa Inggris, diambil
  dari `menuHint` di `commands-registry.ts` — dikunci sebagai teks harfiah di
  test.

**Launcher `mirza-bot`** (`3abcc58`) — `mirza-bots/bin/mirza-bot.cmd`, dipasang
ke `~/.local/bin/`. Menggantikan `run.bat` yang dihapus. Permukaannya **dua
baris**: `mirza-bot` (~0,25 detik) dan `mirza-bot -u` (update dulu, ~6,5 detik).

**Aturan Plane dicabut dari skill `bot-conduct`** (`5899bbe`, 0.0.11) —
permintaan user: *"Untuk selamanya tanpa plane"*. ⚠️ Cache plugin mungkin masih
0.0.10; kalau checklist masih menyuruh bikin task Plane, abaikan dan minta user
menjalankan `/plugin update bot-conduct@mirza-marketplace`.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, tidak ada worktree.)

## 5. Blocker

— (tidak ada yang menghambat teknis. Pekerjaan **(1)** dan **(3)** menyentuh
**enam bot produksi**, jadi konfirmasi user sebelum mengeksekusi — tapi arahnya
sendiri sudah disetujui, jadi ini bukan blocker.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** pulihkan statusline enam bot harian, bangun `/switch`, dan cegah
insiden sesi ganda terulang.

### (1) Statusline enam bot lama — paling murah, kerjakan duluan

**Terukur:** `chained-statusline` **0 byte di keenam bot**
(`<bot>/.claude/channels/telegram/chained-statusline`). Akibatnya statusline
milik user (`~/.claude/statusline-progress.sh`) **tidak pernah dipanggil** —
baris statusnya kosong, dan sudah begitu sejak lama.

Sebabnya ada di `plugins/telegram/server.ts:1235-1243`: installer mencari
statusline pendahulu di **project** `settings.json`, padahal punya user ada di
**global**. Hasil `null` ditulis sebagai string kosong lewat
`previousCommand ?? ''`.

**Bisa diperbaiki tanpa menyentuh kode sama sekali** — cukup mengisi berkas yang
memang dirancang untuk diisi. ⚠️ **Tapi jangan tulis path `.sh` telanjang.**
`context-bridge.ts` sistem lama memanggil rantai dengan
`spawnSync(chain, { shell: true })`, dan di Windows ekstensi `.sh` terasosiasi ke
`git-bash.exe --no-cd "%L"` — itu **membuka jendela**, bukan menjalankan skrip,
dan `spawnSync` menunggu jendela ditutup (terukur: menggantung dua menit). Isi
dengan interpreter eksplisit:

```
bash "C:/Users/Mirza/.claude/statusline-progress.sh"
```

Verifikasi dari **dua** sisi: berkas rantai tidak kosong **dan** baris status
benar-benar tampil di terminal. Yang pertama saja tidak cukup — pelajaran §9.

### (2) `/switch` — pekerjaan tahap 2 yang belum tersentuh

Butuh **daftar sesi bernama**, celah #2 di audit migrasi. Yang sudah terukur dan
tidak perlu diukur ulang:

- Registry sistem lama (`session-names.json`) **bocor ~50%**: bot-02 punya 28
  nama untuk **16** berkas sesi yang benar-benar ada — 14 nama menunjuk sesi
  yang sudah hilang, plus 2 sesi tanpa nama. Picker yang menampilkannya apa
  adanya akan menawarkan sesi yang tidak bisa dibuka.
- `customTitle` di berkas sesi CC **bekerja** di sistem baru (terbukti pada
  `bot-uji`), tapi hanya ada pada sesi yang pernah di-`/rename` — 1 dari 13.
  Bacanya mahal: 70 MB total vs 4 KB registry.
- **`session_name` ADA di payload statusline** dan sudah dipakai `/context`.
  Itu sumber yang murah dan selalu benar untuk sesi **yang sedang berjalan** —
  tapi `/switch` butuh daftar sesi **lain**, jadi ini belum menyelesaikannya.

**Sudah diputuskan user (spec tahap 1 §4, jangan dibuka ulang):** `/switch`
butuh picker (tombol). Menambah command ke daftar dikenal butuh **dua** hal:
`KNOWN_COMMANDS` (`slash/classify.ts`) **dan** `COMMAND_DESCRIPTIONS`
(`slash/menu.ts`) — ada test yang gagal kalau yang kedua lupa, sengaja. Urutan
`KNOWN_COMMANDS` **bermakna**: menu "/" lahir darinya apa adanya.

Langkahnya: brainstorming user → spec → rencana TDD → eksekusi → uji hidup.

### (3) Penjaga singleton untuk `mirza-cc`

**Akar insiden hari ini** (§9): `mirza-cc` tidak menolak wrapper kedua untuk
folder yang sama — ia menambah satu lagi. Dua sesi memegang token Telegram yang
sama → `409 Conflict` → keenam bot harian tidak bisa dihubungi berjam-jam.

`cc-wrapper` **sudah kebal** (spec `2026-08-03-cc-wrapper-design.md` §4.5,
"singleton per folder"). Polanya tinggal ditiru ke
`plugins/pty-controller/wrapper/`. ⚠️ Berkas itu melayani enam bot produksi —
konfirmasi user, dan siapkan cara mundur.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** ⚠️ `~/.claude/agent-playbook/PLAYBOOK.md` **SUDAH TIDAK ADA** — skill ini penggantinya. Aturan Plane **sudah dicabut** (0.0.11); kalau masih muncul, cache-nya basi |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild.** Tiga baris terbaru memuat penutupan `/context`, launcher, dan insiden sesi ganda |
| `docs/superpowers/specs/2026-08-03-lapisan-slash-telegram-design.md` **§4** | **Di awal untuk pekerjaan (2)** — memutuskan bentuk `/switch`; §7 no. 4 sudah dikoreksi, jangan dipercaya apa adanya |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | Saat mengerjakan (2). **Celah #2 = nama sesi** |
| `docs/superpowers/specs/2026-08-04-context-telegram-design.md` | Saat butuh contoh spec yang memuat syarat keras user + pagar berlapis |
| `docs/superpowers/plans/2026-08-04-context-telegram.md` | Saat butuh contoh rencana TDD yang terbukti jalan di lapisan ini |
| `mirza-bots/README.md` — butir "`/context` dijawab tanpa mengorbankan statusline user" | Saat mengerjakan (1) — memuat rantai sebab bug statusline lengkap |
| `docs/superpowers/specs/2026-08-03-cc-wrapper-design.md` **§4.5** | **Saat mengerjakan (3)** — pola singleton yang mau ditiru |
| `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" | **WAJIB sebelum minta user uji hidup** — lihat §10 |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Tahap 2 mulai dari mana? | **`/context` dulu** | Selesai; `/switch` jadi giliran berikutnya |
| Statusline saat memasang bridge | **Harus tetap hidup — syarat, bukan preferensi** | Lahir empat pagar; `/context` yang mengalah bila bentrok |
| Bentuk skrip uji | **Satu berkas, `run.bat`** → lalu **dibuang seluruhnya**, diganti launcher global | `mirza-bot`, meniru `mirza-cc` |
| Argumen opsional di launcher | **Dibuang** — *"gak mungkin nambahin optional param kalau enggak perlu"* | Permukaan dua baris |
| Update plugin | **Di belakang `-u`**, bukan otomatis | Start normal ~0,25 detik |
| Deskripsi menu `/` | **Samakan dengan sistem lama, bahasa Inggris** | Diambil dari `menuHint`, dikunci harfiah di test |
| Plane | **"Untuk selamanya tanpa plane"** | Aturan dicabut dari `bot-conduct` |
| Sesudah `/context` | **Handoff ke bot-03** | File ini |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan, bukan hanya
instruksinya, supaya bot berikutnya bisa menerapkan prinsipnya pada keputusan
yang belum terbayangkan. Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01
→ bot-02, dan sesi ini menambah **tiga** tingkat sekaligus — ketiganya lahir
dari kesalahan sesi ini sendiri.

**Tingkat 1 (bot-02): ukur dulu sebelum membangun.** Yang menentukan bukan
"tahap berapa" melainkan *"apa yang masih menghalangi satu bot beneran pindah?"*

**Tingkat 2 (bot-03): ukur juga alasanmu untuk TIDAK membangun.**

**Tingkat 3 (bot-01): kalau tidak punya angkanya, katakan begitu.**

**Tingkat 4 (bot-02): dua meteran yang masing-masing benar bisa melahirkan
sebab-akibat yang tidak ada.**

**Tingkat 5 (bot-01): punya meteran tidak sama dengan memakainya.**

**Tingkat 6 (sesi ini): memverifikasi ARTEFAK bukan memverifikasi EFEK.**
Sesi ini menyatakan kriteria terpenting `/context` **lulus** karena berkas
rantai terisi benar. Terlalu cepat — statusline user ternyata **tidak pernah
dieksekusi**: Windows *membuka* `.sh` alih-alih menjalankannya. Kriteria itu
sendiri menuntut **dua** meteran (layar + berkas); hanya satu yang dijalankan,
lalu lulus diumumkan. **Yang membongkarnya user, bukan sistemnya.** Turunannya:
berkas yang isinya benar tidak membuktikan isinya dipakai.

**Tingkat 7 (sesi ini): memperbaiki satu bug membuka bug yang berdiri persis di
belakangnya.** Di sistem lama rantai statusline selalu kosong, jadi baris
pemanggilannya **tidak pernah dieksekusi sekali pun** — bug `.sh` itu secara
struktural tidak mungkin terlihat sebelum bug pertama diperbaiki. Konsekuensi
praktis: **sesudah tiap perbaikan, ukur ulang keadaan nyatanya**, jangan
menganggap masalahnya habis.

**Tingkat 8 (sesi ini): identitas berbasis string persis rapuh terhadap apa pun
yang berubah tiap rilis.** Perintah bridge menyematkan nomor versi di path.
`resolveChain` membandingkan string persis, jadi bridge versi lama terbaca
sebagai *"statusline pendahulu yang harus diselamatkan"* — dan menuliskannya ke
rantai **menghapus statusline user**. Nyaris terjadi; yang menyelamatkan cuma
waktu. Kalau sebuah nilai memuat versi, **jangan pakai sebagai tanda pengenal —
pakai polanya**.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Uji kering skrip sebelum menyerahkannya.** `run.bat` gagal di baris
  pertama karena `|` termakan escaping batch; `mirza-bot` gagal karena escaping
  kutip di dalam `for /f`. Keduanya *terlihat* benar.
- ✅ **`tsc` menangkap yang `bun test` tidak bisa lihat** — `bun test` tidak
  memeriksa tipe sama sekali. Jalankan keduanya; `tsc` dipinjam dari
  `cc-wrapper` (cc-plugin tidak punya `tsconfig.json`).
- ✅ **Mutation check membuktikan test bisa merah.** Enam kali dijalankan sesi
  ini, semuanya merah saat pagarnya dimatikan.
- ✅ **Kerjakan yang tidak bergantung jawaban sambil menunggu jawabannya.**
- ❌ **JANGAN loop "naik ke induk sampai root" untuk kill tree** — logika itu
  sempat memanjat melewati batas pohon. Petakan rantainya dulu, lihat tiap
  tingkat, baru pilih titik potong eksplisit.
- ❌ **JANGAN `git checkout <file>` untuk mengembalikan mutation check** kalau
  perubahannya belum di-commit — pakai salinan (`cp`).
- ❌ **JANGAN menanggapi keluhan terakhir tanpa mengukur.** `mirza-bot.cmd`
  berayun **tiga kali** dalam satu sesi (flag → tanpa flag → flag lagi). Angka
  yang menyelesaikannya (5,6 detik untuk `marketplace update`) baru diukur
  sesudah ayunan kedua. Diukur di awal, ayunan itu tidak perlu terjadi.
- ❌ **JANGAN membawa fitur hanya karena sistem lama punya.** Argumen nama/path
  di launcher dibawa karena `mirza-cc` punya, lalu dibenarkan dengan "biayanya
  nol" — keliru: yang tidak dipakai tetap menagih percabangan dan dokumentasi,
  dan tagihannya jatuh ke penyunting berikutnya.
- ❌ **JANGAN pakai PowerShell `Set-Content -Encoding utf8`** untuk menyunting
  berkas repo (W-11). Periksa `git diff --stat` sebelum commit.
- ❌ **JANGAN me-restart sesi user sendiri** (W-18). Minta user, tunggu.

### ⚠️ Insiden yang wajib dipahami sebelum menyentuh `mirza-cc`

Selama beberapa jam **keenam bot harian tidak bisa dihubungi**. Bukan bug kode:
`mirza-cc` tidak punya penjaga singleton, jadi menjalankannya untuk folder yang
wrapper-nya masih hidup **menambah** wrapper kedua. Dua sesi memegang token yang
sama → `getUpdates` ditolak `409 Conflict` → plugin telegram mati lalu lahir
lagi terus-menerus.

**Bukti telak:** sesi `89fcbbb2` berjalan dua kali (PID 2764 dan 49964), dan
proses telegram berumur 30 detik padahal sesinya sudah jalan sejam.

**Pelajaran diagnosisnya sama pentingnya:** dua teori pertama — `cc-plugin`
0.10.2 bersalah, lalu Claude Code 2.1.221 memutus plugin lama — **keduanya
cocok dengan gejala dan keduanya salah**. Yang membongkarnya bukan berpikir
lebih keras, melainkan membaca daftar proses apa adanya dan menemukan satu
session id tertulis dua kali.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `8230b14` (9 commit sesi ini, `4909926..HEAD`);
  kode HEAD `3abcc58` (21 commit, `c885dc2..HEAD`).
- **Versi terpasang:** `cc-plugin` **0.10.4** · `bot-conduct` 0.0.11 ·
  `inline-buttons` 0.0.10 · `telegram` (marketplace lama) 0.0.37-mirza.0.
  `cc-wrapper` belum dirilis sebagai plugin — dijalankan lewat `npx tsx`.
- **⚠️ Prosedur uji hidup.** `cc-plugin` dimuat dari **plugin cache**, bukan
  dari repo. Kode yang ter-merge **tidak akan pernah berjalan** sampai: (1)
  versi dinaikkan di **dua** berkas (`.claude-plugin/plugin.json` **dan**
  `package.json`), (2) plugin di-update, (3) **wrapper di-restart**. Sekarang
  langkah (2) ada di `mirza-bot -u`.
- **Menjalankan bot:** `mirza-bot` dari folder bot (sistem baru) · `mirza-cc`
  dari folder bot (sistem lama). Keduanya **tanpa argumen**.
- **Uji hidup butuh tangan user.** `bot-uji` tidak terdaftar di agent-bus. Tulis
  perintah siap tempel; jangan menyuruh user merangkai perintah panjang.
- **Meteran yang terbukti berguna sesi ini, pakai lagi:**
  `~/.claude/mirza-bots/conversations.db` (readonly, `node:sqlite`) ·
  `~/.claude/plugins/installed_plugins.json` (**versi yang benar-benar
  terpasang**, plus `installPath` dan `gitCommitSha` — satu-satunya meteran
  jujur soal versi; "folder ada di cache" **bukan** bukti, karena cache
  menyimpan semua versi lama) · `Get-CimInstance Win32_Process` (**siapa
  benar-benar berjalan** — ini yang membongkar insiden) ·
  `~/.claude/agent-registry.json` (siapa mengaku bot apa).
- **Belum diuji hidup:** rollback (`/context` kriteria #5) dan regresi slash
  tahap 1 (`/rename`, `/new`, tombol konfirmasi — terakhir hijau di 0.9.0).
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* Dan: *"kita tidak perlu presisi di sini… no need to be
  so serious"* — kalibrasi usaha ke taruhannya.
