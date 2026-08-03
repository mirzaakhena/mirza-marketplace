# Lapisan Slash Telegram Tahap 2 — `/switch` dan `/context`

**Date:** 2026-08-04 02:12 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, rencana, BACKLOG, handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `8da01ec` · HEAD kode: `c885dc2`)
**Dari → Ke:** bot-01 → bot-02
**Pair:** —
**Lanjutan dari:** `.handoff/202608032137-prompt-lapisan-slash-telegram-tahap1.md`
**Plan terkait:** `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md` — **SELESAI seluruhnya, terverifikasi hidup**. Tahap 2 **belum punya spec maupun rencana**

---

## 1. Tujuan Handoff

Perintah user langsung, sesudah tahap 1 tuntas dan diverifikasi hidup.

**Goal estafet:** bawa **`/switch` dan `/context`** dari daftar "dikenal" ke
barang yang benar-benar bekerja. Keduanya sengaja ditunda di tahap 1 karena
masing-masing **butuh barang yang belum ada** — dan barang itu, bukan
command-nya, yang jadi pekerjaan sebenarnya.

**Ini bukan estafet "lanjutkan rencana yang sudah ada".** Tahap 2 belum punya
spec maupun rencana. Yang ada baru daftar apa yang hilang (§6), jadi langkah
pertamanya **brainstorming bersama user**, bukan ngoding.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine, Bun) dan `cc-wrapper` (PTY, Node + tsx). Seluruh state
terpusat di `~/.claude/mirza-bots/`.

Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian. Sistem **baru** melayani satu bot percobaan,
`bot-uji`. Pekerjaan sekarang: menutup celah sampai satu bot harian benar-benar
bisa pindah.

**Lapisan slash Telegram** adalah kebijakan "slash mana yang boleh, dan jadi
apa" — hidup di `cc-plugin/src/engine/slash/`, menulis payload JSON ke folder
`pending/` yang dibaca `cc-wrapper`.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main` dan ter-push di **kedua** repo.

**Kode (`mirza-bots`, rilis `cc-plugin` 0.9.0):**

- **Tahap 1 lapisan slash, enam task TDD** — `07b8185` classify · `a53b1e1`
  session-name · `e0db349` map · `3550ef9` pending · `ea20a01` index ·
  `b5e1b1e` penyisipan engine. Merge `8c89d70`.
- **Menu `/` lewat `setMyCommands`** — `e5b8ed5`, merge `a8bb1c4`. Daftarnya
  lahir dari `KNOWN_COMMANDS`, jadi menu dan perilaku tidak bisa berbeda
  pendapat.
- **Rilis 0.9.0** — `65c8de8`. **README** — `c885dc2`.
- **326 test hijau.** `tsc` tidak tersedia untuk `cc-plugin` (paket ini tidak
  punya `tsconfig.json`); pemeriksaan ad-hoc pinjam `tsc` milik `cc-wrapper`
  hanya memunculkan satu error di `engine.ts:351`, kode typing keepalive yang
  tidak disentuh.

**Terverifikasi hidup 2026-08-04 pada `bot-uji`, enam dari enam kriteria**,
diperiksa dari `conversations.db` + `logs/session-hook.log`, **bukan dari
layar**. `conversations.db` memberi kontrol negatif dalam satu tabel: pada
**0.8.0** `/new test` diikuti baris `assistant` 16 detik kemudian; pada
**0.9.0** tiga slash berturut-turut **tidak diikuti satu pun baris
`assistant`**, sementara teks biasa tetap dijawab.

**Dokumen (`mirza-marketplace`):** BACKLOG Bagian 0 — `dbddc33`, `1923881`,
`6022ccf`, `ae7746a`, `8da01ec`.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, tidak ada worktree.)

## 5. Blocker

— (tidak ada yang menghambat teknis. **Tapi baca §6 baik-baik:** tahap 2 belum
punya spec maupun rencana, jadi langkah pertamanya brainstorming dengan user,
bukan eksekusi. Itu bukan blocker; itu bentuk pekerjaannya.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** buat `/switch` dan `/context` bekerja dari Telegram di sistem baru —
dimulai dari mengukur apa yang sebenarnya kurang, lalu spec, lalu rencana TDD.

**Yang hilang, dan kenapa itu inti pekerjaannya:**

| Command | Yang belum ada | Catatan |
|---|---|---|
| **`/switch`** | Daftar sesi **bernama**. Sistem baru menyimpan id (`sessions/<bot>.id`) tapi **bukan namanya** — itu celah #2 di audit migrasi | Sistem lama punya `session-names-registry`. Perlu diputuskan: bangun registry sendiri, atau baca `customTitle` dari berkas sesi CC? |
| **`/context`** | Jembatan statusline. Sistem lama membacanya dari `last-status.json` yang ditulis jembatan statusline; sistem baru punya statusline sendiri, dan **isinya belum pernah dibandingkan** | `/context` **tidak dikirim ke CC sama sekali** — ia dijawab langsung dari data lokal (spec §4) |

**Langkah yang disarankan:**

1. **Ukur dulu.** Bandingkan isi statusline sistem baru dengan `last-status.json`
   sistem lama — spec §7 no. 4 menyatakan ini **belum pernah diukur**. Jangan
   menebak salah satunya.
2. Untuk `/switch`: ukur juga apakah `customTitle` di berkas sesi CC cukup jadi
   sumber nama. Sesi ini sudah membuktikan berkas itu bisa dibaca dan bahwa ia
   **hanya bisa ditulis CC sendiri** — itu meteran yang jujur.
3. Brainstorming dengan user → spec → rencana TDD → eksekusi → uji hidup.

**Yang sudah pasti dan tidak perlu diputuskan ulang:** `/switch` butuh picker
(tombol), dan `/context` **tidak** dikirim ke CC. Keduanya keputusan user yang
sudah tercatat di spec §4.

**Menambah command ke daftar dikenal butuh dua hal, bukan satu:** tambahkan ke
`KNOWN_COMMANDS` **dan** tulis deskripsinya di `COMMAND_DESCRIPTIONS`
(`slash/menu.ts`). Ada test yang gagal kalau yang kedua lupa — sengaja, supaya
gagalnya di test dan bukan di layar HP user.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu, lalu spec lapisan slash (§4 dan §7).

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** ⚠️ `~/.claude/agent-playbook/PLAYBOOK.md` **SUDAH TIDAK ADA** — skill ini penggantinya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild** |
| `docs/superpowers/specs/2026-08-03-lapisan-slash-telegram-design.md` **§4 dan §7** | **Di awal** — §4 memutuskan bentuk `/switch` dan `/context`; §7 mendaftar lima hal yang **belum diukur** |
| `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md` | Saat butuh contoh bentuk rencana TDD yang sudah terbukti jalan di lapisan ini |
| `mirza-bots/README.md` — butir "Slash Telegram dicegat SESUDAH dicatat" | **Di awal** — ringkasan apa yang sudah ada di kode |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | Saat butuh angka frekuensi, atau sebelum memilih apa berikutnya. **Celah #2 = nama sesi**, itu yang menghalangi `/switch` |
| `mirza-bots/cc-wrapper/README.md` + `PROBE.md` | Sebelum menjalankan wrapper, atau saat menyentuh startup-nya |
| `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" | **WAJIB sebelum minta user uji hidup** — lihat §9 |
| BACKLOG **Bagian 7** | Saat menyentuh area yang punya W-1..W-26 |

## 8. Keputusan User Lewat Brainstorming

Semuanya lewat inline button atau pernyataan eksplisit user, 2026-08-03/04.

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Rencana tahap 1 membuat slash bocor ke AI — perbaiki bagaimana? | **Flag di jalur `deliver`** (bukan pecah `handleIncomingMessage`, bukan dibiarkan) | Lahir opsi `pushToAi`; perubahan paling kecil, pencatatan tetap tanpa syarat |
| Menu `/` didaftarkan berapa entri? | **Dua yang benar-benar jalan**, bukan lima seperti sistem lama | Menu lahir dari `KNOWN_COMMANDS`; `/switch` dan `/delete` tidak dijanjikan sebelum ada |
| Notifikasi "compact selesai" | **Catat dulu, kerjakan nanti** | Tercatat di BACKLOG lengkap dengan mekanismenya |
| Sesudah tahap 1 | **Handoff tahap 2 ke bot-02** | File ini |

Keputusan tahap 1 yang masih mengikat (dari handoff sebelumnya): daftar
"dikenal" **empat** (`/rename`, `/new`, `/switch`, `/context`) · slash tak
dikenal **diteruskan dengan konfirmasi tombol**, bukan ditolak · slash Telegram
**diolah dulu**, bukan diteruskan mentah.

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan, bukan hanya
instruksinya, supaya bot berikutnya bisa menerapkan prinsipnya pada keputusan
yang belum terbayangkan. Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01,
dan sesi ini menambah satu tingkat lagi — dengan cara yang paling tidak
menyenangkan: **melanggarnya sendiri.**

**Tingkat 1 (bot-02): ukur dulu sebelum membangun.** Yang menentukan bukan
"tahap berapa" melainkan *"apa yang masih menghalangi satu bot beneran pindah?"*

**Tingkat 2 (bot-03): ukur juga alasanmu untuk TIDAK membangun.** Spec celah #1
menulis satu batas sebagai *"jarang"*; ia menggigit di percobaan hidup pertama.

**Tingkat 3 (bot-01): kalau tidak punya angkanya, katakan begitu** — jangan
pilih kata yang menyembunyikan bahwa kamu tidak punya.

**Tingkat 4 (bot-02): dua meteran yang masing-masing benar bisa melahirkan
sebab-akibat yang tidak ada.** Yang membongkarnya bukan membaca lebih teliti,
melainkan **query yang mencari barang yang seharusnya ada kalau dugaan itu
benar**.

**Tingkat 5 (sesi ini): punya meteran tidak sama dengan memakainya.** Tingkat 4
mengajarkan cara membongkar kesalahan itu. Sesi ini **mengulanginya persis**,
dengan meteran yang benar tersedia sepanjang waktu:

> User mengirim `/new test` ke bot-uji dan bertanya kenapa gagal. Sesi ini
> membaca **layar**, melihat pesannya tidak muncul di sesinya sendiri, lalu
> menyandingkannya dengan luka lama ("sistem lama mencegat sebelum mencatat")
> dan menyimpulkan blind spot itu terjadi lagi. **Ditulis ke BACKLOG sebagai
> temuan.** User membantah. Satu query — `SELECT ts,bot,source,text FROM
> messages WHERE text LIKE '/%'` — mengembalikan **kedua baris itu**,
> `bot: bot-uji`, `source: user`. Pesannya sampai ke bot yang benar **dan**
> tercatat. Klaimnya dicabut dan disimpan di BACKLOG sebagai koreksi.

Yang membedakan tingkat 5 dari tingkat 4: di sana meterannya harus ditemukan;
di sini ia **sudah ada, sudah dipakai sejam sebelumnya, dan tetap tidak dibuka
sampai user memaksa.** Pelajarannya bukan "punya database itu penting" — itu
sudah diketahui. Pelajarannya: **rasa yakin datang lebih cepat daripada
dorongan untuk memeriksa**, dan satu-satunya penawarnya adalah menjadikan query
sebagai langkah pertama, bukan langkah pembuktian sesudah kesimpulan terbentuk.

**Turunan yang lahir di sesi ini juga:**

- **Umur proses bukan bukti kode mana yang termuat.** Sesi ini menyimpulkan
  wrapper pasti memuat kode baru karena prosesnya lahir 20 menit sesudah merge.
  Waktu start-nya benar; kesimpulannya salah — `cc-plugin` dimuat dari
  **plugin cache**, dan cache masih 0.8.0. Yang membongkarnya `Win32_Process`,
  bukan penalaran.
- **Layar bisa berbohong ke dua arah.** Satu balasan tampak dua kali di
  screenshot user tapi hanya satu baris di db — ternyata stitching screenshot
  long-scroll Android, bukan bug sistem. Sesi ini **tidak** langsung membuat
  teori soal itu, dan itu keputusan yang benar.
- **Membuktikan ketiadaan butuh lebih dari satu meteran.** Tap "Batal" lulus
  karena tiga hal sekaligus: `pending/` kosong, tidak ada baris `assistant`,
  **dan** `session-hook.log` tidak menerima `source=compact` baru. Yang ketiga
  yang menutup celahnya.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti hari ini

- ✅ **Baca kode sebelum mengeksekusi rencana, meski rencananya sudah di-review
  user.** Rencana tahap 1 menyisipkan cegatan sesudah `deliver()` dan berhenti.
  Membaca `poller.ts` mengungkap `insertMessage` dan `sink.push` ada di **satu**
  fungsi, jadi rencana itu apa adanya akan membuat slash tercatat **dan** sampai
  ke AI. Ditemukan sebelum satu baris pun ditulis.
- ✅ **Kerjakan yang tidak bergantung pada jawaban sambil menunggu jawabannya.**
  Pertanyaan soal `pushToAi` dikirim ke user, lalu Task 1–5 (lima modul murni)
  dikerjakan tanpa menunggu — nol dari lima terpengaruh pilihan apa pun.
- ✅ **Test yang ditulis sesudah implementasi wajib dibuktikan bisa merah.**
  Flag `pushToAi` dan pagar deskripsi menu keduanya di-*mutation check*: kode
  dirusak sementara, test dipastikan gagal, lalu dikembalikan.
- ❌ **JANGAN `git checkout <file>` untuk mengembalikan mutation check** kalau
  perubahan aslinya belum di-commit — ia mengembalikan ke HEAD dan **menghapus
  pekerjaanmu**. Terjadi di sesi ini; perbaikannya harus diterapkan ulang dari
  awal. Pakai salinan (`cp`) sebelum merusak.
- ❌ **JANGAN percaya `claude plugin update` tanpa memeriksa hasilnya.**
  `.bat` uji hidup sekarang memeriksa `cache/cc-plugin/<versi>/src/engine/slash/`
  benar-benar ada dan **berhenti** kalau tidak. Teks yang menyebut nama sesuatu
  bukan bukti sesuatu itu ada.
- ❌ **JANGAN `git add -A`** di repo yang punya untracked milik sesi lain.
- ❌ **JANGAN pakai PowerShell `Set-Content -Encoding utf8`** untuk menyunting
  berkas repo (W-11). Periksa `git diff --stat` sebelum commit.
- ❌ **JANGAN me-restart sesi user sendiri** (W-18). Minta user, tunggu
  konfirmasi.
- ❌ **JANGAN menyapa bot produksi untuk diagnosa.** Baca database dengan
  `readOnly: true`.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `8da01ec`, kode HEAD `c885dc2`. Commit kode sesi
  ini: `07b8185`…`c885dc2` (sepuluh, termasuk dua merge). Commit dokumen:
  `dbddc33`, `1923881`, `6022ccf`, `ae7746a`, `8da01ec`.
- **Versi terpasang:** `cc-plugin` **0.9.0** · `inline-buttons` 0.0.10 ·
  `telegram` (marketplace lama) 0.0.37-mirza.0. `cc-wrapper` **belum dirilis
  sebagai plugin** — dijalankan langsung lewat `npx tsx`.
- **⚠️ Prosedur uji hidup — ini yang paling mahal kalau terlewat.** `cc-plugin`
  dimuat dari **plugin cache**, bukan dari repo, bahkan dengan flag
  `--dangerously-load-development-channels`. Jadi kode yang ter-merge **tidak
  akan pernah berjalan** sampai: (1) versi dinaikkan di **dua** berkas
  (`.claude-plugin/plugin.json` **dan** `package.json`), (2)
  `claude plugin marketplace update mirza-bots` + `claude plugin update
  cc-plugin@mirza-bots`, (3) **wrapper di-restart** — versi plugin dikunci saat
  sesi dibuka. Sesi ini kehilangan ~30 menit karena langkah ini terlewat.
- **Skrip siap pakai:** `C:\Users\Mirza\workspace\bot-uji\uji-slash.bat`
  melakukan ketiga langkah itu, memverifikasi hasilnya sebelum lanjut, dan
  mencetak enam kriteria uji ke layar. **Tidak ter-commit ke repo mana pun** —
  ia tinggal di folder `bot-uji`. Pindahkan ke repo kalau dirasa berguna.
- **Uji hidup butuh tangan user.** `bot-uji` **tidak terdaftar di agent-bus**,
  jadi kamu tidak bisa menyuruhnya mengirim apa pun. Tulis perintah siap tempel;
  user lebih suka **`.bat`** daripada rangkaian perintah — dinyatakan sendiri
  oleh user hari ini.
- **Meteran yang terbukti berguna sesi ini, pakai lagi:**
  `~/.claude/mirza-bots/conversations.db` (readonly, `node:sqlite`) ·
  `~/.claude/mirza-bots/logs/session-hook.log` (menyala tiap sesi berubah,
  dengan `source=` yang membedakan `resume`/`clear`/`compact`) ·
  `Get-CimInstance Win32_Process` untuk tahu **kode mana** yang sedang berjalan.
- **Belum dikerjakan, sudah tercatat di BACKLOG:** notifikasi "compact selesai"
  ke Telegram. Mekanismenya sudah ada (`SessionStart` dengan `source=compact`),
  angka pertamanya 55 detik.
- **bot-01 tidak membuat task Plane** untuk pekerjaan ini — checklist
  `bot-conduct` memintanya di awal dan terlewat; sudah disampaikan ke user.
  Kalau kamu mengerjakan tahap 2, jangan ulangi.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* Dan: *"kita tidak perlu presisi di sini… no need to be
  so serious"* — kalibrasi usaha ke taruhannya.
