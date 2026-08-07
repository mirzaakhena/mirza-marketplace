# Rancang Ulang Handoff Protocol — dari Filosofinya

**Tanggal:** 2026-08-07 (WIB) · **Status:** DRAFT — **E1 sudah diketok (§0.2):
ini lahir sebagai SKILL.** Tujuh pertanyaan sisa masih terbuka (§7)
**Penulis:** bot-02 (§0–§9) · bot-03 (§0.2 + revisi pasca-E1)
**Metode:** brainstorming bersama user — sesi `task-lanjutan-rekonsiliasi`,
dilanjutkan `task-rancang-ulang-handoff-protocol`
**Menggantikan:** `plugins/handoff/skills/handoff/SKILL.md` (297 baris) +
`template.md` (63 baris)
**Berbeda dari:** `docs/2026-07-26-rebuild-audit/area-08-handoff.md` — lihat §0

---

## 0. Kenapa dokumen ini ada, padahal `area-08` sudah ada

`area-08-handoff.md` (Juli 2026) memang membahas handoff panjang lebar, tapi
bentuknya **audit**, bukan rancangan. Ia berjalan item per item (SKILL-001…032)
dan memberi vonis KEEP / DROP / MODIFY pada masing-masing.

Pertanyaan yang dijawabnya: *"item mana yang dipertahankan?"* — bukan *"apa
sebenarnya yang sedang kita pecahkan?"*

Konsekuensinya mekanis: **audit item-per-item mempertahankan bentuk lama secara
default.** Yang tidak punya vonis DROP otomatis ikut. Karena itu hasilnya masih
297 baris dengan tulang yang sama.

Dokumen ini mulai dari lapis yang belum pernah disentuh: **apa yang sebenarnya
dijaga oleh handoff.** Seluruh isi `area-08` tetap dipakai — sebagai **bahan**,
bukan sebagai kerangka.

## 0.1 Peta bahasan — apa saja yang harus dibahas, dan status masing-masing

Diminta user 2026-08-07 supaya tidak ada topik yang tercecer. **Membuatnya
langsung membayar diri sendiri: delapan topik ternyata belum pernah disinggung
sama sekali**, dan salah satunya (E1) menentukan bentuk seluruh sisanya.

Status: ✅ diketok user · 🟡 prinsip disepakati, angka/detail belum · ⬜ belum
pernah dibahas.

### A. Kapan

| # | Topik | Status | Di mana / sisa |
|---|---|---|---|
| ~~A1~~ | ~~Kapan **mulai mencatat**~~ | **GUGUR** | Dicabut R2 (§0.3) — tidak ada momen "mulai mencatat" terpisah lagi. T2 ikut gugur |
| A2 | Kapan **tawarkan penyerahan** | ✅ | **K1 (§0.4): 40% terpakai.** Inilah ambang ② yang selama ini tidak ada. T3 ikut tertutup |
| A3 | ~~Kapan **garis merah** (wajib serahkan)~~ | **GUGUR** | K1 **memindahkan** alarm lama (<100k) ke 40%, bukan menambahnya. Tidak ada lagi "garis merah wajib" — **semua keputusan handoff di user** |
| A4 | Siapa yang memutuskan handoff | ✅ | **DIREVISI R2:** 👤 user memulai → 🧠 AI mengeksekusi. Mesin tidak lagi menyalakan |
| ~~A5~~ | ~~Ambang diperiksa **di batas selesai-task**~~ | **GUGUR** | K1 (§0.4) menjadikan alarm **murni imbauan tanpa handoff otomatis** — ia tidak bisa menginterupsi apa pun, jadi tidak ada yang perlu dijadwalkan ke batas task |

### B. Dokumen

| # | Topik | Status | Di mana / sisa |
|---|---|---|---|
| B1 | Kerangka & isi | ✅ | §3.2. **Perlu konfirmasi user: sudah lengkap atau masih kurang?** |
| B2 | Lokasi & nama berkas | ✅ | §3.1, **DIREVISI R3 (§0.3): kembali ke `<repo-kerja>/.handoff/`** |
| B3 | Siapa mengisi apa (🤖/🕐/🏁) | ✅ | §3.2 |
| B4 | Aturan menulis (sunting bukan menumpuk, zona waktu, jangan duplikasi) | ✅ | §3.6 |
| B5 | Penyimpanan/arsip — folder bot tidak punya git | ✅ | **Tertutup R3 (§0.3):** file di repo project → otomatis masuk git + remote. T1 ikut tertutup |
| B6 | Berkas handoff **lama** di `<repo-kerja>/.handoff/` — dipindah, dibiarkan, atau dibaca sebagai warisan? | ✅ | **Tertutup R3:** dibiarkan di tempatnya. **Nol migrasi** |

### C. Prosesi

| # | Topik | Status | Di mana / sisa |
|---|---|---|---|
| C1 | Isi prompt ke penerima | ✅ | §4.4 — empat butir, itu saja |
| C2 | ACK dua arah | ✅ | §4.2 |
| C3 | Rename oleh penerima | ✅ | §4.2 — sekaligus melahirkan berkas berikutnya |
| C4 | Self-reset pengirim | ✅ | §4.3 — `/clear` saja |
| C5 | **Cara memilih bot penerima** | ⬜ | Skill lama punya alur sendiri (`agent_list` → narasi status → tombol). Belum dibahas sama sekali |
| C6 | **Penerima MENOLAK** (sedang bekerja) | ⬜ | Cron timeout dibuang, tapi penolakan tetap mungkin. Siapa yang menangani, dan apa yang terjadi pada pengirim? |
| C7 | **Penerima offline** | ⬜ | Pesan mengantre di inbox — lalu pengirim menunggu berapa lama? Boleh `/clear`? |
| C8 | **Tidak ada bot yang siap** | ⬜ | `area-08` §8.2b punya jawaban lama (tombol darurat). Belum dikonfirmasi |
| C9 | Dua laporan wajib ke user | ✅ | §5 |

⚠️ **C6 dan C7 adalah lubang yang lahir dari membuang cron timeout.** Timeout
itu dulu yang menjawab *"berapa lama pengirim menunggu sebelum menyerah"*.
Membuangnya benar — tapi pertanyaannya tidak ikut hilang, cuma kehilangan
penjawabnya.

### D. Syarat & penjagaan

| # | Topik | Status | Di mana / sisa |
|---|---|---|---|
| D1 | **Syarat kesiapan penerima** | ⬜ | `area-08` §8.2b menetapkan: context <100k **dan** tidak sedang bekerja. Belum dikonfirmasi ulang untuk rancangan baru |
| D2 | Clarity check pra-berkas (3 syarat) | ✅ | §5 — dipertahankan |
| D3 | Mandat README sebelum menulis | ✅ | §5 — dipertahankan |
| D4 | Larangan penerima | ✅ | §5 |
| D5 | Penegakan mekanis di titik kirim | ✅ | **GUGUR** — konsekuensi E1 (§0.2); skill tidak punya titik penegakan. T4 ikut tertutup |
| D6 | Pengingat `handoff-note-stale` | ✅ | **GUGUR sebagai mesin** — konsekuensi E1. Digantikan P4 sebagai aturan teks (§0.2) |

### E. Cakupan & peralihan

| # | Topik | Status | Di mana / sisa |
|---|---|---|---|
| E1 | ⭐ **Ini dibangun DI MANA — mengganti skill lama, atau lahir di `cc-plugin`?** | ✅ | **SKILL.** Diketok user 2026-08-07 20:50 WIB — §0.2 |
| E2 | Nasib enam bot harian | ✅ | Ikut kebagian, hari itu juga — konsekuensi langsung E1 |
| E3 | Peralihan — dua protokol hidup bersamaan? | ✅ | **Tidak ada peralihan.** Skill lama diganti di tempat; satu protokol untuk semua bot |
| E4 | Apakah `SKILL.md` + `template.md` lama dihapus | ✅ | `SKILL.md` **diganti isinya** · `template.md` **DIHAPUS** (§3.4) |

⭐ **E1 sudah diketok — lihat §0.2.** Ia menutup enam pertanyaan sekaligus (E1,
E2, E3, E4, D5, D6) dan mencabut §6.3/§6.5 sebagai mesin.

### F. Sudah dibuang — dicatat supaya tidak dihidupkan lagi

| Dibuang | Sifat |
|---|---|
| Mode Now / After this task / Ping pong | Keputusan user 2026-08-07 |
| **Delegasi** | Dibatalkan **sadar**, padahal sudah didesain 4/4 (`area-08` §8.C) |
| Cron timeout ACK | Keputusan user — konsekuensinya C6/C7 |
| Konvensi nama sesi sebagai status | Keputusan user |
| Mode File only | Sudah DROP sejak `area-08` §8.A |

## 0.2 E1 DIKETOK — ini lahir sebagai SKILL, bukan di `cc-plugin`

**Keputusan user 2026-08-07 ~20:50 WIB** (sesi `task-rancang-ulang-handoff-protocol`, bot-03):

> *"Saya tidak ingin mengikat handoff secara khusus ke system kita ini. Kita
> jadikan skill saja sekalian. Karena saya tidak yakin kita bisa membangun
> system handoff yang (kita pikir sudah) sangat hebat untuk kemudian kita
> integrasikan dalam system yang sudah ada."*

**Alasannya bukan yang diperkirakan bot-02.** Tawaran yang diajukan berbunyi
*"siapa yang kebagian vs seberapa banyak yang dijamin mesin"*. Alasan user satu
lapis di bawahnya: **handoff adalah PRAKTIK, bukan fitur.** Terikat ke
`cc-plugin` berarti nasibnya ikut nasib rebuild — rebuild belok, protokolnya
ikut goyah. Ditambah kecurigaan terhadap pola *bangun hebat dulu di ruang
terpisah, integrasikan belakangan*: yang akhirnya nyambung biasanya bukan
sistemnya, melainkan kompromi-kompromi yang membuatnya tidak hebat lagi.

### Yang ikut tertutup otomatis

| # | Jadi |
|---|---|
| E2 | Semua bot kebagian, hari itu juga |
| E3 | Tidak ada peralihan; tidak ada dua protokol hidup bersamaan |
| E4 | `SKILL.md` diganti isinya · `template.md` DIHAPUS |
| D5 / T4 | **Gugur** — skill tidak punya titik penegakan |
| D6 | **Gugur sebagai mesin**, hidup lagi sebagai aturan teks |

### Yang GUGUR — didaftarkan sadar (Tingkat 24)

Membuang mekanisme **tidak** membuang pertanyaan yang ia jawab. Ketiganya
diputuskan satu per satu, bukan dibiarkan yatim:

| Yang gugur | Pertanyaan yang dulu ia jawab | Penjawab barunya |
|---|---|---|
| 🤖 mesin mengisi jangkar (§2 P2) | "siapa menjamin repo/branch/SHA/jam benar?" | **Instruksi teks**: jalankan `git log -1`, tempel hasilnya, sebut zona waktunya. Tidak dijamin mesin — tapi murah, dan hasilnya bisa diperiksa. Catatan: jam yang meleset +7 jam di `202608070115` bukan akibat ketiadaan mesin, melainkan ketiadaan aturan *"sebut zonanya"* — dan itu aturan teks |
| Hook penegak di titik kirim (§6.5) | "siapa memblokir handoff yang belum lengkap?" | **Tidak ada.** Diterima — bot-02 sendiri sudah menandainya kemungkinan over-engineering (T4) |
| Pengingat `handoff-note-stale` (§6.3) | "siapa mengingatkan bot mencicil dokumennya?" | **P4** — kerangka lahir lengkap dalam keadaan kosong; kotak kosong **itu** pengingatnya. Nol hook, nol token tambahan |

⚠️ **Satu yatim tersisa, belum ada penjawabnya:** *kapan file itu pertama kali
dibuat.* P4 baru bekerja **setelah** filenya ada. Dalam bentuk skill, ini
satu-satunya bagian yang murni bergantung pada disiplin. **Ditunda sadar,
bukan terlupa.**

### Penyeimbang untuk kata "komprehensif"

User menyebut requirement inti handoff adalah *"file handoff yang
komprehensif"*. Mode gagalnya ada persis di kata itu: kerangka 10 kotak
mengundang **pengisian formalitas** supaya tidak ada yang kosong, dan dokumen
jadi panjang tapi hampa. Karena itu **P6 (`—` adalah jawaban yang sah) naik
dari catatan kaki menjadi penyeimbang wajib**:

> **Komprehensif = tidak ada yang HILANG, bukan semuanya TERISI.**

Handoff sesi kecil boleh 15 baris.

## 0.3 TIGA PEMBALIKAN — keputusan user 2026-08-07 ~20:56 WIB

Ketiganya **membalik** keputusan yang sudah tertulis di dokumen ini. Dicatat
sebagai pembalikan beserta buktinya (Tingkat 18), supaya tidak ada sesi
berikutnya yang "memperbaiki"-nya kembali ke bentuk lama.

> *"Batalkan soal file handoff yang lahir sejak rename pertama. · handoff ini
> dilakukan berdasarkan kesadaran user saja. Mulai dari preparation, penulisan
> hingga prosesi serah terima antar bot · File handoff tetap di masing-masing
> repo project, bukan di folder bot."*

### R1 — File TIDAK lahir saat rename

**Membalik:** §3.1 (nama pakai `firstNameOfSession`) + §4.2 (*"rename oleh
penerima sekaligus yang melahirkan file berikutnya"*) + §4.3
(`renamedInThisSession`).

File handoff lahir **saat handoff akan terjadi**, bukan saat sesi diberi nama.

**Menutup T5** — kekhawatiran soal berkas setengah jadi dari sesi bertopik yang
tidak pernah handoff. Berkas seperti itu sekarang tidak pernah ada.

### R2 — Handoff berjalan atas KESADARAN USER, bukan pemicu mesin

**Membalik:** §6.4 (*"🤖 mesin menyalakan → 🧠 AI menawarkan → 👤 user ketok"*)
menjadi **👤 user memulai, 🧠 AI mengeksekusi**. Berlaku untuk **seluruh tiga
tahap** yang user sebut: **preparation → penulisan → prosesi serah terima.**

⚠️ **Ini mencabut mekanisme yang menjawab §1.3 — dan §1.3 adalah temuan paling
tajam di seluruh dokumen ini.** Didaftarkan sadar (Tingkat 24):

| Pertanyaan yang jadi yatim | Penjawab barunya |
|---|---|
| "siapa memastikan dokumen tidak dikarang di kondisi terburuk?" | **User, dengan memanggil handoff lebih awal.** Bukan mekanisme baru — pemindahan pemegang. User sendiri menetapkan model prima **di bawah 50%**; selama panggilannya di situ, §1.3 tetap terjaga |
| T2 — ambang ① "mulai mencatat" | **GUGUR.** Tidak ada momen "mulai mencatat" yang terpisah lagi |
| T3 — ambang ② "tawarkan penyerahan" | **Menunggu keputusan** — lihat pertanyaan terbuka di bawah |
| A1 (kapan mulai mencatat) | **GUGUR**, ikut T2 |

⚠️ **Risiko yang diterima sadar:** kalau user lupa memanggil, **tidak ada apa
pun yang mengetuk.** Ini bukan kelemahan tersembunyi — ini konsekuensi yang
dipilih, dan ditulis di sini supaya tetap terlihat.

### R3 — File tetap di `<repo-kerja>/.handoff/`, BUKAN di folder bot

**Membalik:** §3.1 (*"lokasi: `<folder-bot>/.handoff/`"*). Kembali ke bentuk
SKILL-016; keputusan 2026-08-04 (*"seluruh state pindah ke folder bot"*) **tidak
berlaku untuk berkas handoff.**

**Buktinya justru menguatkan, bukan sekadar selera:**

| Yang tertutup | Kenapa |
|---|---|
| **B5 / T1** — penyimpanan & arsip | Folder bot **tidak punya `.git`** (diverifikasi bot-02 di `bot-02`, `bot-03`). Repo project punya git **dan** remote → berkas handoff otomatis bersejarah, ter-backup, terlihat dari MacBook. **Tidak perlu repo arsip khusus** |
| **B6** — nasib berkas handoff lama | **Nol migrasi.** Berkas lama sudah ada di `<repo-kerja>/.handoff/`; tidak ada yang perlu dipindah — sejalan dengan *"saya prefer tidak ada migrasi data"* |

### Yang ikut jadi bisa dipangkas (belum diketok)

| ✂️ | Kenapa alasannya hilang |
|---|---|
| Aturan nama pakai `firstNameOfSession` (§3.1) | Ada karena file lahir saat rename. R1 mencabut sebabnya — cukup pakai nama sesi yang berlaku saat handoff |
| Aturan **"menyunting, bukan menumpuk"** (§3.6) | Ada karena file tumbuh sepanjang sesi dan berisiko jadi log kronologis. R1 membuat file ditulis sekali duduk — aturannya kehilangan musuhnya |

### Pertanyaan terbuka yang dilahirkan tiga keputusan ini

| # | Pertanyaan |
|---|---|
| **N1** | **Garis merah 0.25.0 (sisa <100k) — tetap nyala atau ikut bungkam?** Kalau handoff murni kesadaran user, apakah pengingat otomatis itu ikut diam, atau tetap boleh mengetuk sebagai satu-satunya rem terakhir? Menentukan nasib A2, A3, A5 |
| **N2** | **Sesi tanpa repo, atau dengan DUA repo.** R3 menaruh file di repo project — tapi sesi bisa menyentuh dua repo (sesi ini: `mirza-marketplace` + `mirza-bots`) atau tidak menyentuh repo sama sekali (diskusi murni). Ke mana filenya? |

## 0.4 EMPAT KEPUTUSAN — N1, N2, dan penutup soal MOMEN menulis

**Keputusan user 2026-08-07 ~21:07 WIB.**

### Yang paling penting: keempatnya menjawab §1.3 lewat jalan yang lain

Rancangan bot-02 menjawab *"dokumen handoff selalu ditulis oleh model yang
paling pelupa"* dengan **memecah tulisannya** — dicicil sepanjang sesi. User
menjawabnya dengan **memindahkan momennya**: alarm berbunyi di 40%, user
memutuskan, dokumen ditulis **di akhir** — tapi akhir dari sesi yang sengaja
diakhiri **selagi modelnya masih prima.**

Dua-duanya menghindari model 90%. Yang kedua **tidak butuh** mekanisme mencicil,
tidak butuh aturan "menyunting bukan menumpuk", dan tidak butuh kerangka lahir
kosong sebagai pengingat. **Satu keputusan menggantikan tiga mekanisme.**

### K1 — Alarm pindah ke 40% TERPAKAI, dan ia murni imbauan

> *"Tolong ubah ke '>400k' token. Jadi kalau total token adalah 1M token, maka
> kalau sudah diatas 40% 'alarm' pengingat akan berbunyi. Dan ini murni hanya
> mengingatkan saja, tidak ada otomatis handoff. keputusan handoff tetap di
> user."*

**Menjawab N1** — dan sekaligus **A2/T3** (ambang ② "tawarkan penyerahan", yang
selama ini tidak pernah ada). Alarm lama `context-low` **tidak ditambah, tapi
DIPINDAH**.

| | Lama (0.25.0) | Baru |
|---|---|---|
| Menyala saat | sisa <100k (= 90% terpakai pada 1M) | **40% terpakai** |
| Pertanyaan yang dijawab | "masih sanggup menyerahkan?" | **"kualitas berpikir sudah mulai turun?"** |
| Sifat | imbauan | **imbauan, dan HANYA imbauan** — tidak ada handoff otomatis |

⚠️ **Teks alarmnya WAJIB ikut diubah.** Bunyinya sekarang *"ruang context
tinggal sedikit — rapikan pekerjaan lalu serahkan sebelum ruangnya habis di
tengah jalan"*. Pada 40% terpakai sisanya masih **600k**; kalimat itu menjadi
**tidak benar**, dan yang membacanya adalah AI, setiap giliran. Alarm yang salah
bicara mengajarkan hal yang salah (bandingkan `server.ts:340`, §4.3).

✅ **DIKETOK USER: ABSOLUT — 400k terpakai.** Rekomendasi bot-03 adalah persen
(alasan: Tingkat 23 — pertanyaan barunya *"kualitas berpikir turun"* skalanya
ikut ukuran window, sementara pertanyaan lama *"biaya menyerahkan"* memang
tidak). **User memilih absolut, dan itu keputusannya.** Hari ini hasilnya
identik (semua bot 1M); bedanya baru terasa kalau ada bot ber-window lain.
Bentuk kodenya jadi lebih sederhana: satu konstanta, tanpa perlu tahu ukuran
window.

✅ **SUDAH DIIMPLEMENTASIKAN — `cc-plugin` 0.33.0, commit `9206831` di repo
`mirza-bots`.** `MIN_CONTEXT_REMAINING` (100k) → `MAX_CONTEXT_USED` (400k);
`ReminderContext.contextRemaining` → `contextUsed`, dibaca langsung dari
`total_input_tokens` sehingga `context_window_size` tidak lagi dibutuhkan; teks
pengingat diganti. **Test 609 → 614 hijau, `tsc` bersih.** Komentar lama yang
membela ambang absolut **tidak dihapus** — ditulis ulang supaya jelas ia
menjawab pertanyaan yang sudah diganti (Tingkat 18).

⚠️ **Belum dipasang.** `cc-plugin` dimuat dari plugin cache, jadi 0.33.0 baru
aktif sesudah `claude plugin update` + bot dibuka ulang. Urutannya **plugin
dulu, baru restart bot** (README `mirza-bots` §"Urutan rilis").

⚠️ **Konsekuensi yang harus diterima sadar:** alarm ini menyala **6x lebih
lama** dari sebelumnya (dari 40% sampai 100%, bukan 90% sampai 100%). Syarat
masuk `reminders.ts` — *"kapan ia TIDAK menyala?"* — masih terjawab (di bawah
40%), tapi marginnya jauh menipis. Penangkalnya sudah ada dan bukan mekanisme
baru: **AI mengingat penolakan user di dalam sesi itu** (§6.4).

### K2 — Handoff WAJIB punya repo; dua repo → tanya user

**Menjawab N2.** Sesi tanpa repo tidak melahirkan handoff. Sesi dengan dua repo:
**tanya user**, jangan pilih sendiri.

Untuk sesi ini user mula-mula memilih `mirza-bots`, lalu **mengubahnya ke
`mirza-marketplace`** setelah bot-03 menyampaikan bahwa seluruh pekerjaan sesi
ini ada di sana (spec + BACKLOG) sementara `mirza-bots` nol baris sejak bot-02.
✅ **Berkas handoff sesi ini: `mirza-marketplace/.handoff/`.**

**Aturan turunannya, dan inilah yang layak dibawa ke skill:** *repo yang dipilih
adalah repo tempat pekerjaannya berada — bukan repo yang topiknya dibicarakan.*
Sesi ini membicarakan bot, tapi mengerjakan dokumen.

### K3 — Nama & format berkas TETAP

**Mencabut kandidat pangkas §0.3.** `<timestamp>_<8-char-session-id>_<nama-sesi>.md`
tetap, dan **nama PERTAMA sesi** tetap dipakai. `firstNameOfSession` sudah
tersedia di `reminders.ts`, jadi mempertahankannya nol biaya.

Kandidat pangkas yang **tetap dipangkas**: aturan §3.6 *"menyunting, bukan
menumpuk"* — K4 menghapus musuhnya.

### K4 — Berkas ditulis DI AKHIR, dan ia bukan log

> *"file handoff bukan log atau journaling. Saya terpikir begini. file handoff
> memang sebaiknya tetap dibuat diakhir."*

**Mengunci R1 dan menutup sisa mekanisme "mencicil":**

| Yang gugur | Kenapa |
|---|---|
| §1.3 "dicicil sepanjang sesi" | Diganti: momen handoffnya yang dipindahkan lebih awal (K1), bukan tulisannya yang dipecah |
| **P5** ("yang butuh INGATAN dicicil") | Tidak ada lagi yang dicicil. Seluruh berkas ditulis dalam satu duduk |
| **P4** sebagai *pengingat* | Kerangka lengkap tetap berguna sebagai **daftar periksa saat menulis**, tapi ia bukan lagi mekanisme pengingat sepanjang sesi |
| §3.6 "menyunting, bukan menumpuk" | Berkas sekali duduk tidak bisa jadi log kronologis |

**Aturan baru yang lahir dari kalimat user, dan layak ditulis eksplisit di
skill:** *berkas handoff **bukan** log, bukan jurnal, bukan riwayat.* Ia
merekam **posisi**, bukan **perjalanan**. Ini bahaya terbesar dari ide mencicil,
dan dipotong sebelum sempat tumbuh.

## 1. Filosofi — apa yang sebenarnya dijaga

Ditanyakan ke user secara eksplisit. Jawabannya **dua**, dan urutannya penting:

### 1.1 Kontinuitas — tapi bukan karena context habis

> *"Konteks yang membengkak hingga di atas 50% itu akan menurunkan kualitas
> jawaban model. Model jadi sering lupa dan enggak nyambung. Sehingga saya
> selalu menjaga di angka sekitar 35%. Tapi angka ini bukan keharusan. Model
> boleh saja terus dilibatkan dalam pengerjaan task hingga 80% tapi jangan
> sampai 90% (untuk 1 juta token konteks)."* — user, 2026-08-07

Ditambah: **menghemat token.**

⚠️ **Ini membalik dasar ambang yang dipakai 0.25.0.** Yang diukur di sana:
*"berapa token yang dibutuhkan untuk menyerahkan?"* → median 17k, ambang
ditetapkan sisa <100k. Yang dijaga: **masih sanggup menyerahkan.**

Yang user jaga berbeda: **kualitas berpikirnya.**

Dan angkanya bertemu di tempat yang mengejutkan: **sisa <100k pada window 1M
adalah 90% terpakai** — persis angka yang user sebut sebagai batas yang jangan
dilewati. Jadi 0.25.0 tidak salah; ia menjawab pertanyaan lain, dan hasilnya
mendarat tepat di **garis merah terakhir**. Yang selama ini tidak ada: **ambang
tawaran.**

### 1.2 Pengetahuan yang tidak terekam di mana pun

> *"Dalam proses handoff ini tentunya ada knowledge yang diserahterimakan. Ini
> salah satu bagian krusial."* — user

### 1.3 Konsekuensi paling tajam dari §1.1

Kalau handoff baru dipicu di 90%, maka **dokumen handoff selalu ditulis oleh
model dalam kondisi terburuknya.** Dokumen paling penting dalam seluruh
protokol — satu-satunya yang membawa pengetahuan menyeberang — justru dikarang
persis saat ingatannya paling kacau.

Bukan teori. `.handoff/202608070115-prompt-status-json-beku.md` ditulis di ujung
sesi dan membawa **tiga hipotesis yang ditulis seolah fakta**, plus seluruh jam
meleset +7 jam (UTC dibaca sebagai WIB). Penerimanya harus membongkar itu
sebelum bisa bekerja.

~~**Karena itu: dokumen handoff dicicil sepanjang sesi.**~~

⚠️ **MEKANISMENYA DIGANTI (R2 §0.3 + K1/K4 §0.4) — masalahnya TIDAK.**

Jawaban finalnya bukan *memecah tulisannya*, melainkan **memindahkan momennya**:
alarm berbunyi di **400k terpakai**, user memutuskan, berkas ditulis **di akhir
sesi** — tapi sesi yang sengaja diakhiri **selagi modelnya masih prima.**
Dokumen tetap satu duduk, dan tetap tidak dikarang oleh model 90%.

Risiko yang tersisa dan diterima sadar: **alarm hanya mengimbau.** Kalau user
memilih terus bekerja, tidak ada apa pun yang memaksa.

## 2. Prinsip rancangan

| # | Prinsip | Konsekuensi |
|---|---|---|
| P1 | **Urutkan isi berdasarkan seberapa TIDAK TERGANTIKAN informasinya** | Yang bisa direkonstruksi dari git/README → tunjuk saja. Yang cuma hidup di kepala bot yang akan di-clear → wajib, detail |
| P2 | ~~**Mesin mengisi jangkar**~~ → **Jangkar DISALIN dari perintah, bukan diingat** | ⚠️ **Direvisi oleh E1 (§0.2).** Skill tidak bisa menjalankan apa pun, jadi bukan mesin yang mengisi — tapi bebannya tetap bukan ingatan: repo/branch/SHA/jam **disalin dari keluaran `git log -1` / `git status -sb`**, tidak pernah diketik dari kepala |
| P3 | **Dokumen menunjuk, tidak mengulang** | Ada commit SHA / file spec → sebut ID-nya, jangan salin isinya (permintaan user) |
| P4 | **Kerangka lengkap sejak file lahir** | ⚠️ **DIREVISI K4 (§0.4):** tetap berguna sebagai **daftar periksa saat menulis**, tapi bukan lagi mekanisme pengingat sepanjang sesi |
| ~~P5~~ | ~~**Yang butuh INGATAN dicicil; yang butuh KEADAAN SEKARANG ditulis di akhir**~~ | **GUGUR — K4 (§0.4).** Tidak ada yang dicicil; seluruh berkas ditulis sekali duduk. Yang menjaga kualitasnya bukan pembagian momen, melainkan **momen handoffnya sendiri yang dipindah lebih awal** (K1) |
| P6 | **`—` adalah jawaban yang sah** | Penangkal pengisian formalitas yang diundang oleh P4 |
| P7 | **Status tidak pernah diturunkan dari string** | Konsekuensi keputusan user membuang seluruh konvensi nama sesi (§4.3) |

**P5 lahir dari satu pengamatan:** yang rusak duluan pada model yang penuh
adalah **ingatannya**, bukan kesadarannya akan situasi saat ini. Model di 85%
masih tahu persis di mana ia berhenti dan apa langkah berikutnya; yang ia
lupakan adalah kenapa tiga jam lalu ia membuang pendekatan A.

## 3. Format file handoff

### 3.1 Lokasi & nama — DIKETOK USER

- **Lokasi:** ⚠️ **DIREVISI R3 (§0.3) — `<repo-kerja>/.handoff/`**, kembali ke
  bentuk SKILL-016. Keputusan 2026-08-04 (*"seluruh state pindah ke folder
  bot"*) **tidak berlaku** untuk berkas handoff: folder bot tidak punya `.git`,
  repo project punya git **dan** remote. Alasan lengkap + apa yang ikut tertutup
  ada di §0.3 R3.
  ~~`<folder-bot>/.handoff/` — dicoret, jangan dihidupkan lagi.~~
- **Nama:** `<timestamp>_<8-char-session-id>_<nama-sesi>.md`
- ✅ **Nama PERTAMA sesi (`firstNameOfSession`) TETAP DIPAKAI** — K3 (§0.4)
  mencabut usulan pangkas bot-03. Format berkas tidak berubah sama sekali.
- Nama sesi disanitasi sebelum jadi nama berkas (spasi/titik/slash).
- Kata `prompt` di skema lama (`<ts>-prompt-<slug>.md`) **dibuang** — sudah
  tidak punya makna.

**Apa yang dicabut oleh skema ini:**

| Dicabut | Kenapa |
|---|---|
| Seluruh aturan slug (kebab-case ≤6 kata, sinkron di 4 tempat) | Nama sesi **adalah** nama file. Tidak ada dua hal yang perlu disinkronkan |
| Aturan tabrakan nama (`-2`, `-3`) | Session-id membuat tabrakan mustahil |
| Kebutuhan menyimpan kaitan sesi ↔ file sebagai data (`area-08` §8.4) | Kaitannya ada di nama berkas |

**Bonus yang mungkin tidak disengaja:** session-id adalah nama berkas transcript
Claude Code. Dari nama file handoff, siapa pun bisa langsung menemukan
transcript sesi yang menulisnya. Dua bukti terkuat proyek ini (0.29.0, 0.32.0)
ditegakkan persis dengan cara itu.

### 3.2 Kerangka dokumen

Lahir **lengkap** (P4). Bagian bertanda 🤖 diisi mesin, 🕐 dicicil sepanjang
sesi, 🏁 ditulis saat menutup.

```markdown
# <judul singkat, kalimat manusia>

<!-- 🤖 JANGKAR — diisi mesin, jangan diketik tangan -->
- **Sesi:** <8-char-session-id> · `<nama-sesi-pertama>` · bot-NN
- **Mulai → tutup:** 2026-08-07 15:30 → 18:05 WIB   <!-- zona WAJIB eksplisit -->
- **Repo kerja:** <path absolut> · branch `<x>` · HEAD `<sha>`
- **Commit sesi ini:** `<base>..<head>` (<n> commit)
- **Lanjutan dari:** <path absolut file sebelumnya> | —

---

## 1. Kenapa pekerjaan ini ada        🕐

### 1.1 Tujuan
<Satu-dua kalimat. Bukan apa yang dikerjakan — kenapa itu layak dikerjakan.>

### 1.2 Keputusan user
| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
<Supaya penerima tidak diam-diam membalik yang sudah diketok.>

## 2. Sampai mana                      🕐 / 🏁

### 2.1 Sudah                          🕐
<Action verb + objek konkret. SHA/path inline, JANGAN salin isinya (P3).>

### 2.2 Sedang                         🏁
<State mid-flight di luar git: file setengah diedit, hipotesis debug
terakhir. `—` kalau berhenti di titik bersih.>

## 3. Apa yang harus dikerjakan        🏁

**Goal:** <satu kalimat>
**Langkah berikutnya:** <konkret>
**Starting point:** <branch / berkas yang dibaca duluan>
**Definisi selesai:** <perintah yang harus hijau — `bun test`,
`bunx tsc --noEmit`, grep penanda. Sesuatu yang bisa diperiksa mesin,
bukan perasaan.>

## 4. Apa yang bisa mencelakakan penerima   🕐

### 4.1 Blocker
<Hambatan + KENAPA ia menghambat + apa yang membukanya. Bedakan: butuh
keputusan user vs menunggu pihak luar. `—` kalau tidak ada.>

### 4.2 Jalan buntu yang sudah dicoba
<"Sudah coba X, gagal karena Y, jangan diulang." Ini yang membuat bot
berikutnya membakar jam yang sama persis.>

### 4.3 Premis yang belum terbukti
<Yang saya YAKINI tapi BELUM saya buktikan. Pemisah antara "saya tahu"
dan "saya kira". Penerima wajib mencurigai yang ada di sini.>

### 4.4 Lessons — CARRY FORWARD
<Kesalahan yang tidak boleh terulang, ikut pindah bersama estafet.>

## 5. Di mana barangnya                🕐

| Referensi | Kapan dibaca |
|---|---|
| <path> | Di awal / HANYA saat <kondisi> |

<Setiap baris WAJIB punya kolom "kapan dibaca" — ini yang mencegah penerima
membaca semuanya atau tidak membaca apa pun. JANGAN tulis ulang isinya.>
```

### 3.3 Urutan section = urutan pertanyaan di kepala penerima

1. *"Ini soal apa, dan kenapa?"* → §1
2. *"Sudah sampai mana?"* → §2
3. *"Saya harus ngapain?"* → §3
4. *"Apa yang bisa mencelakakan saya?"* → §4
5. *"Di mana barangnya?"* → §5

### 3.4 Yang DIBUANG dari template lama

| Bagian lama | Alasan |
|---|---|
| `Konteks Proyek` | Selalu jadi duplikat README, cepat basi. Mandat README (§5) sudah menjamin README segar. Sudah jadi vonis `area-08` §8.5 juga |
| `Catatan Lain` | Tempat sampah |
| Header `Pair` | Ping-pong dibuang (§4.1) |
| `Plan terkait` sebagai header | Turun jadi satu baris di §5 Referensi |
| Berkas `template.md` | Duplikat mati yang **sudah** membusuk: ia masih menulis READY = `session idle + context <10%` sementara SKILL.md sudah pindah ke `lifecycle`. Dua sumber kebenaran, satunya salah, tidak ada yang tahu |

### 3.5 Yang DITAMBAH, dan kenapa

Empat, semuanya punya satu kesamaan: **tidak bisa direkonstruksi dari mana pun.**

| Tambahan | Kalau hilang |
|---|---|
| §2.2 Sedang | Kerja diulang, atau file setengah jadi ditemukan tanpa penjelasan |
| §4.2 Jalan buntu yang sudah dicoba | Bot berikutnya membakar jam yang sama persis |
| §4.3 Premis yang belum terbukti | Bot berikutnya membangun di atas tebakan yang disangka fakta — **sudah terjadi**, `202608070115` |
| §3 Definisi selesai | "Selesai" jadi selera, bukan fakta |

### 3.6 Aturan menulis

- ✂️ ~~**Menyunting, bukan menumpuk.**~~ **DIPANGKAS** (K3/K4, §0.4) — berkas
  ditulis sekali duduk, jadi ia tidak bisa berubah jadi log kronologis.
- ➕ **Berkas handoff BUKAN log, bukan jurnal, bukan riwayat** (K4, §0.4). Ia
  merekam **posisi**, bukan **perjalanan**. Aturan ini menggantikan yang di atas.
- **Append-only chain antar-berkas.** Jangan pernah mengedit file handoff sesi
  LAIN. `Lanjutan dari` hanya diisi kalau benar-benar kontinuasi.
- **Jangan menduplikasi checklist plan.** Plan = source of truth; handoff hanya
  mencatat posisi.
- **Jam selalu menyebut zona.** Log berstempel UTC; salah baca sekali membuat
  seluruh dokumen meleset 7 jam (terjadi 2026-08-07).

## 4. Protokol — yang dibuang dan yang tersisa

### 4.1 DIBUANG (keputusan user 2026-08-07)

| Dibuang | Catatan |
|---|---|
| Mode **Now / After this task / Ping pong** | Seluruh mekanisme *designation* ikut mati |
| Mode **File only** | Sudah di-DROP di `area-08` §8.A |
| **Delegasi** | ⚠️ **Dibatalkan sadar**, padahal sudah didesain 4/4 di `area-08` §8.C. Bukan terlupa |
| **Cron timeout ACK** (one-shot 10 menit) | Menghapus tiga cabang sekaligus: timeout-tanpa-ACK, ACK-terlambat, batalkan-cron-sebelum-reset |
| **Konvensi nama sesi sebagai status** (`idle → task- → done- → idle`) | §4.3 |
| **Batch atomik `pty_send_slash`** untuk handoff | Kehilangan pemakainya; `area-08` §8.4 sudah meramalkan |
| Aturan slug, aturan tabrakan nama | §3.1 |

### 4.2 TETAP ADA (keputusan user)

- **ACK dua arah** — ke pengirim via agent-bus, dan ke user via Telegram.
- **Rename sesi oleh penerima** — tetap ada, **tapi murni label untuk manusia.**
  ⚠️ **DIREVISI R1 (§0.3):** rename **tidak lagi** melahirkan file handoff
  berikutnya. File lahir saat handoff akan terjadi.
- **Self-reset pengirim** — tapi disederhanakan jadi **`/clear` saja** (§4.3).

### 4.3 Self-reset = `/clear`, titik

> *"Saya sebenarnya ingin setelah /clear tidak perlu lakukan apapun lagi. Kalau
> kita /rename maka kita jadi mengikuti system lama."* — user

Sistem lama menjalankan state machine **dengan mengetik nama**: statusnya tidak
disimpan, ia **dieja**. Membuang `/rename` berarti membuang dasarnya, bukan
sekadar satu langkah.

**Ini menyusul kode yang sudah lebih dulu berjalan.**
`cc-plugin/src/engine/agent/status.ts` sudah menolak menyediakan `lifecycle`:

> *"area-05 §5.4 mencabut itu: nama sesi kembali menjadi label bebas untuk
> manusia… Modul ini karena itu SENGAJA tidak mengembalikan `lifecycle`."*

Sementara skill handoff lama **masih memintanya**, dan kalau tidak ada, jatuh ke
menebak dari nama sesi. Artinya skill lama di atas sistem baru **selalu** jalan
di jalur cadangan — jalur yang jarang dilalui, jadi jarang teruji.

**Konsekuensi yang diterima sadar:** sesudah `/clear`, sesi baru lahir membawa
nama lama (bug 0.26.0), jadi bot yang baru direset tetap menyandang nama
pekerjaan yang baru saja ia serahkan sampai topik berikutnya datang. Yang
menjawab "bot ini siap atau tidak" adalah context-nya, bukan namanya.

~~**Tidak melahirkan file handoff palsu:** mesin memakai `renamedInThisSession`.~~
⚠️ **MOOT setelah R1 (§0.3)** — rename tidak melahirkan file apa pun, jadi tidak
ada file palsu yang perlu dicegah. Seluruh mekanisme ini gugur.

**Utang yang ikut lahir:** `cc-plugin/src/server.ts:340` masih **mengajarkan**
pola lama ke AI — deskripsi tool `send_slash` memakai contoh literal
`["/rename done-...", "/clear", "/rename idle"]`. Harus ikut diperbarui, kalau
tidak ia jadi guru yang mengajarkan hal yang sudah dibuang.

### 4.4 Prompt ke penerima — beberapa kalimat, bukan sebelas langkah

> *"Pesan yang dikirim ke bot penerima juga seharusnya hanya beberapa kalimat
> saja seperti 'silakan lanjutkan handoff, baca dokumen ini'."* — user

**Bukti bahwa ini cukup:** 2026-08-07 pagi, bot-02 menerima estafet dan
menyelesaikan **seluruh** kewajiban penerima — guard, membaca file yang
ditunjuk, rename, ACK dua arah — **tanpa pernah memuat skill `handoff` sama
sekali** (yang di-invoke hanya `bot-conduct` dan `using-agent-bus`). Sisi
penerima berjalan murni dari isi prompt.

Konsekuensi: **§6 skill lama (sisi receiver) tidak pernah dieksekusi siapa pun.**
Ia mengulang isi template prompt §5 untuk pembaca yang tidak ada.

Yang wajib ada di prompt, dan hanya ini:
1. Guard sibuk (tolak kalau sedang bekerja).
2. Path **absolut** file handoff — *"file INI persis, jangan cari yang terbaru"*
   (bisa ada handoff paralel dari bot lain).
3. Repo kerja.
4. Perintah ACK dua arah.

## 5. Yang TETAP dipertahankan dari skill lama

| Aturan | Kenapa layak dibawa |
|---|---|
| **Clarity check pra-file** (3 syarat) | Guard paling penting terhadap "handoff yang isinya tebakan": next-step satu kalimat tanpa hedging · artefak konkret yang bisa dikutip · arah terkonfirmasi user atau terdokumentasi — **inferensi AI murni tidak dihitung** |
| **Mandat README** | Update README sebelum menulis handoff. *"Handoff dengan README basi = handoff cacat."* |
| **Bot tidak pernah bekerja di workspace-nya sendiri**; semua path absolut | |
| **Baca file yang DITUNJUK, jangan "latest"** | Handoff paralel dari bot lain |
| **Larangan penerima** | Jangan edit/hapus file handoff atau plan; jangan telusuri seluruh rantai `Lanjutan dari` (maksimal satu hop) |
| **`agent_send` ke target offline tetap terkirim** (antre), wajib disebut di laporan | |
| **Dua laporan wajib ke user** | "file selesai: `<path>`" lalu "terkirim ke `<R>`" |

## 6. Mesin pengingat — bagaimana bot diingatkan mencatat

⛔ **SELURUH BAGIAN INI GUGUR sebagai rancangan.** E1 (§0.2) menetapkan protokol
ini lahir sebagai **skill**, dan skill tidak bisa menjalankan apa pun. §6.3
(`handoff-note-stale`, `handoff-note-missing`) dan §6.5 (portal di titik kirim)
**tidak jadi dibangun**. Penggantinya: **P4** — kerangka lahir kosong, kotak
kosong itu pengingatnya.

Bagian ini **dipertahankan sebagai catatan**, bukan sebagai rencana, karena §6.2
(syarat masuk `reminders.ts`) dan §6.4 (pembagian peran 🤖/🧠/👤) tetap berlaku
kalau suatu hari ada yang mengusulkan mesin lagi. **Jangan dibangun tanpa
membalik E1 lebih dulu, dan pembalikan wajib dibuktikan (Tingkat 18).**

### 6.1 Ada DUA mesin, bukan satu

| Mesin | Kapan jalan | Kekuatan |
|---|---|---|
| `cc-plugin/src/engine/reminders.ts` (kanal `[from: system]`) | **Sebelum** giliran, menempel ke pesan masuk | **Imbauan** — boleh diabaikan |
| `cc-plugin/hooks/reply-guard.ts` (hook `Stop`) | **Sesudah** giliran, saat bot menutup | **Penegakan** — memblokir |

Guard hanya bisa menjaga yang **bisa diperiksa mesin secara pasti**. "Ada
panggilan `reply` sejak pesan masuk terakhir?" → ya/tidak. "Sesi ini sudah
pantas dinamai belum?" → penilaian. Karena itu yang satu portal, yang satu
rambu.

`reply-guard` menegakkan **dua** aturan sekaligus: (a) ada pesan Telegram belum
dibalas → blokir; (b) sudah dibalas tapi masih menulis prosa ke transcript →
blokir.

### 6.2 Syarat masuk yang wajib dihormati

Tertulis di header `reminders.ts`:

> *"Sebelum menambah entri di sini, jawab satu pertanyaan: **kapan ia TIDAK
> menyala?** Pengingat yang menyala terus berhenti menjadi sinyal dan menjadi
> latar belakang."*

Ditambah keputusan user 2026-08-06: **pemicunya KEADAAN, bukan peristiwa.**
Selama kondisi bertahan, pengingat ada; begitu kondisi lewat, ia lenyap sendiri.
Tidak ada flag "sudah pernah diingatkan", tidak ada aturan anti-nagih.

### 6.3 Pengingat yang diusulkan

**`handoff-note-stale`** — nyala kalau **ada commit di repo kerja yang lebih
baru daripada catatan handoff**.

*Kapan ia TIDAK menyala:* saat catatannya lebih baru dari commit terakhir.
Artinya bot yang rajin mencatat **tidak pernah melihatnya**; yang lalai
melihatnya terus, lalu padam sendiri begitu ia mencatat. Datanya murah
(`git log -1` vs mtime berkas), tidak butuh state baru.

**`handoff-note-missing`** — nyala kalau context sudah melewati ambang ①
(§7) dan sesi ini belum punya catatan sama sekali. Lihat §7 — angkanya belum
diketok.

### 6.4 Pembagian peran

⚠️ **DIREVISI R2 (§0.3): 👤 user memulai → 🧠 AI mengeksekusi.** Mesin tidak
lagi menyalakan apa pun. Urutan lama di bawah dipertahankan sebagai catatan.

~~🤖 **Mesin** menyalakan keadaan → 🧠 **AI** menilai & menawarkan ke user → 👤
**user** yang ketok.~~ Kalau user menolak, AI mengingatnya **di dalam sesi itu** —
tempat yang benar, karena keputusannya memang hanya berlaku untuk sesi itu.
Konsisten dengan `reminders.ts`: *"AI yang menyusun prioritasnya, dan AI boleh
mengembalikan keputusannya ke user."*

### 6.5 Kandidat penegakan (belum diputuskan)

Satu titik di mana **portal** justru tepat: saat handoff benar-benar dikirim.
Mesin bisa memeriksa yang pasti — dokumennya ada? §3 terisi? HEAD SHA ada?
Kalau tidak → blokir. Rambu sepanjang sesi (murah, boleh diabaikan), portal
sekali di ujung (tidak bisa ditawar). Skill lama tidak punya dua-duanya.

## 7. MASIH TERBUKA — belum diketok user

| # | Pertanyaan | Kandidat | Kenapa penting |
|---|---|---|---|
| ~~T1~~ | ~~**Penyimpanan.** Folder bot tidak punya `.git`~~ | **TERTUTUP** | R3 (§0.3) mengembalikan file ke `<repo-kerja>/.handoff/` — repo punya git **dan** remote. Masalahnya bubar sendiri, tanpa repo arsip |
| ~~T2~~ | ~~**Ambang ① "mulai mencatat"**~~ | **GUGUR** | R2 (§0.3) — tidak ada momen "mulai mencatat" terpisah lagi |
| ~~T3~~ | ~~**Ambang ② "tawarkan penyerahan"**~~ | **TERTUTUP** | K1 (§0.4): **400k terpakai (absolut)**, murni imbauan. Ambang ② akhirnya ada |
| ~~T4~~ | ~~**Penegakan di titik kirim** (§6.5)~~ | **GUGUR** | Tertutup oleh E1 (§0.2): skill tidak punya titik penegakan |
| ~~T5~~ | ~~**Sesi bertopik yang tidak pernah handoff** meninggalkan berkas setengah jadi~~ | **TERTUTUP** | R1 (§0.3) — file cuma lahir saat handoff akan terjadi, jadi berkas setengah jadi tidak pernah ada |

### Tiga ambang, tiga pertanyaan berbeda

| | Pertanyaan | Angka | Status |
|---|---|---|---|
| ① | "Sudah cukup banyak yang terjadi — mulai mencatat?" | T2 | **belum ada** |
| ② | "Sudah waktunya estafet?" | T3 | **belum ada** |
| ③ | "Serahkan sekarang, jangan ditawar" | sisa <100k (= 90% pada 1M) | sudah terpasang (0.25.0) |

Yang selama ini ada hanya ③. Itu sebabnya bot selalu menyerahkan dalam kondisi
terburuknya — tidak ada yang mengetuk lebih awal.

### Kenapa pemicunya BUKAN "task ini dirasa besar"

User sempat mengusulkan itu. Cacatnya terbukti oleh sesi ini sendiri: dimulai
sebagai *"jelaskan handoff protocol"* — jelas ringan — dan berkembang jadi
rancang ulang penuh dengan belasan keputusan, **tanpa menyentuh satu baris kode
pun.** Ukuran sebuah task hanya terlihat **setelah** terjadi.

Dan pemicu yang tampak objektif pun bocor: kalau syaratnya *"ada commit"*, sesi
ini **tidak akan pernah** melahirkan file handoff — padahal justru inilah yang
paling mahal kalau hilang. **Context terpakai** adalah penanda paling jujur: ia
naik entah pekerjaannya menulis kode, mendebat desain, atau membaca dokumen.

## 8. Perkiraan dampak

| | Sebelum | Sesudah (perkiraan) |
|---|---|---|
| `SKILL.md` | 297 baris | — |
| `template.md` | 63 baris | **0** (dihapus) |
| Mode handoff | 4 | **1** |
| Cabang timeout ACK | 3 | **0** |
| Langkah self-reset | 3 (batch atomik) | **1** |
| Jalur fallback | 4 | **≤2** |
| Section dokumen | 10 + header | 5 kelompok / 10 kotak, sebagian diisi mesin |

⚠️ Angka "sesudah" untuk baris skill belum bisa dihitung — bentuk akhirnya
tergantung §7, dan sebagian isinya pindah ke kode (mesin), bukan hilang.

## 9. Catatan metode

Dokumen ini ditulis **di tengah** sesi brainstorming, atas permintaan user
(*"Saya khawatir kamu lupa"*) — bukan di akhir.

Itu **penerapan pertama §1.3 pada dirinya sendiri**: keputusan dicatat selagi
masih segar, bukan direkonstruksi dari ingatan saat context sudah penuh. Kalau
prinsip ini benar untuk handoff, ia benar juga untuk spec yang merancangnya.
