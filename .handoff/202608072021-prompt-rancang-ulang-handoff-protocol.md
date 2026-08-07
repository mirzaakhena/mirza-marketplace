# Rancang Ulang Handoff Protocol — Spec Berdiri, Tiga Belas Keputusan Menunggu User

**Date:** 2026-08-07 20:21 (WIB) — ⚠️ **dikonversi dari log/ts berstempel UTC (13:21Z)**
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/BACKLOG/handoff) — repo KODE `C:\Users\Mirza\workspace\mirza-bots` **tidak disentuh sesi ini**
**Branch:** `main` (HEAD dokumen `8462d26` · HEAD kode `8b0b11b`, tidak berubah)
**Dari → Ke:** bot-02 → bot-03
**Pair:** —
**Lanjutan dari:** `.handoff/202608071430-prompt-sesudah-rekonsiliasi-tahap-4-5.md`
**Plan terkait:** —

---

## 1. Tujuan Handoff

Diminta user secara eksplisit (*"handoff ke bot-03 sekarang"*), **bukan** karena
context menipis maupun karena buntu. Sesi ini berhenti di titik bersih.

**Goal estafet:** menuntaskan rancang ulang handoff protocol — **13 pertanyaan
terbuka** yang semuanya menunggu **keputusan user**, bukan menunggu pekerjaan.
Yang terbesar (**E1**) menentukan bentuk seluruh sisanya.

⚠️ **Sesi ini TIDAK menyentuh satu baris kode pun.** Seluruh hasilnya dokumen.

## 2. Konteks Proyek

`mirza-bots` = penulisan ulang harness bot Telegram milik user (`cc-plugin`
engine+MCP, Bun · `cc-wrapper` PTY, Node+tsx). Sistem **lama**
(`mirza-marketplace/plugins/*`) masih melayani **enam bot harian**; sistem
**baru** melayani dua bot uji.

Handoff protocol hari ini masih dilayani **skill `handoff` sistem lama** (297
baris + `template.md` 63 baris). Tahap 5 §8 di BACKLOG (~50 baris) adalah
rencana memindahkannya ke sistem baru — **belum tersentuh**, dan sebagian
barisnya kini dibatalkan (§3).

⚠️ Bot uji sengaja **TELANJANG** — seluruh plugin `mirza-marketplace` dimatikan
di keduanya, keputusan user. **Jangan "memperbaiki"-nya.**

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-commit & **ter-push** ke origin. Tidak ada worktree/branch menggantung.

| Commit | Isi |
|---|---|
| `316867a` | **Spec rancang ulang** `docs/superpowers/specs/2026-08-07-handoff-protocol-rancang-ulang-design.md` — 9 bagian |
| `5b2d100` | Self-review: lokasi berkas dieksplisitkan jadi `<folder-bot>/.handoff/` |
| `33dbec4` | **§0.1 Peta bahasan** — 6 kelompok (A–F), status per topik |
| `8462d26` | **BACKLOG**: 13 penanda `DIBATALKAN` di Tahap 5 + baris kondisi baru di Bagian 0 |

### 3.1 Isi spec — jangan diulang di sini, baca filenya

§0 kenapa `area-08` tidak cukup · §0.1 peta bahasan · §1 filosofi · §2 tujuh
prinsip · **§3 format berkas handoff (kerangka final siap tempel)** · §4
protokol · §5 yang dipertahankan · §6 mesin pengingat · §7 yang terbuka · §8
dampak · §9 catatan metode.

### 3.2 Tiga belas keputusan user yang sudah diketok

Tercatat lengkap di spec §4 dan §0.1 F. Ringkasnya: berkas pindah ke
`<folder-bot>/.handoff/` bernama `<ts>_<8-char-session-id>_<nama-sesi>.md` ·
dokumen **dicicil sepanjang sesi** · kerangka lahir lengkap · mode tinggal
**Now** saja · **delegasi DIBATALKAN sadar** · cron timeout dibuang · self-reset
jadi **`/clear` saja** · prompt ke penerima cuma beberapa kalimat · dokumen
menunjuk bukan mengulang · ACK/rename/self-reset tetap ada.

### 3.3 BACKLOG — 13 baris ditandai DIBATALKAN

Diverifikasi dengan `grep -c "DIBATALKAN user 2026-08-07"` = **13** SEBELUM
di-commit. Yang ditandai: mode After this task · Ping pong · header `Pair` ·
sembilan baris delegasi · Alarm#4. `SKILL-026` ditandai **DIBATALKAN
SEBAGIAN** — cron timeout-nya dibuang, tapi pertanyaannya tetap hidup sebagai
C6/C7.

## 4. Yang Sedang Dikerjakan (SEDANG)

**Tidak ada.** Kedua repo bersih dan tidak ahead dari origin; diperiksa tepat
sebelum handoff ini ditulis.

⚠️ Tiga berkas untracked di `mirza-marketplace`
(`plugins/pty-controller/wrapper/defuddle{,.cmd,.ps1}`) **bukan buatan sesi
ini** — user memutuskan: biarkan.

## 5. Blocker

⛔ **Ada, dan ini bukan hambatan teknis: 13 pertanyaan menunggu KEPUTUSAN USER.**
Tidak satu pun bisa dijawab bot sendiri.

**Karena section ini ≠ `—`, gate adaptif berlaku: TANYA USER DULU sebelum
mengeksekusi apa pun di §6.**

⭐ **E1 harus dijawab paling dulu** — beberapa pertanyaan lain jawabannya
berubah tergantung E1:

> **Rancangan ini dibangun di `cc-plugin`, atau menggantikan skill lama?**
>
> - **`cc-plugin`** → dapat mesin (pengingat, hook, pengisian jangkar otomatis).
>   Semua yang dirancang bisa jalan. **Tapi hanya dua bot uji yang kebagian.**
> - **Ganti skill lama** → langsung dipakai semua bot hari ini. **Tapi skill
>   cuma teks — ia tidak bisa menjalankan apa pun.** Seluruh bagian "🤖 mesin
>   mengisi jangkar" (§2 P2) **GUGUR**, dan `handoff-note-stale` tidak punya
>   tempat hidup.
>
> **Ini bukan pilihan cepat-vs-benar, melainkan siapa-yang-kebagian vs
> seberapa-banyak-yang-dijamin-mesin.** Kecondongan bot-02: `cc-plugin`, karena
> inti perbaikannya justru di bagian yang hanya mesin bisa lakukan. Tapi itu
> berarti enam bot harian menunggu — dan **berapa lama mereka boleh menunggu,
> hanya user yang tahu.**

Dua belas sisanya lengkap di spec **§0.1** (kolom status) dan **§7** (kandidat +
alasan). Jangan disalin ke sini.

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** menutup 13 pertanyaan terbuka, dimulai dari E1, lalu menuliskan
hasilnya ke spec.

**Langkah:**
1. Tawarkan E1 ke user lewat inline buttons — **jangan pilih sendiri**.
2. Sesudah E1 dijawab, sisir §0.1 baris ⬜ dan 🟡 berurutan. Beberapa gugur
   otomatis (D5, D6 gugur kalau jawabannya "ganti skill lama").
3. Setiap keputusan **langsung ditulis ke spec** — jangan ditumpuk sampai akhir
   sesi. Itu prinsip yang sedang dirancang, dan §9 spec mencatat bahwa spec ini
   sendiri sudah menerapkannya.
4. Baru sesudah §0.1 bersih dari ⬜: rencana implementasi (skill
   `writing-plans`).

**Starting point:** baca **§0.1 spec** lebih dulu — itu peta seluruh
pekerjaannya, dan setiap baris menunjuk ke tempat jawabannya.

⚠️ **JANGAN mulai mengimplementasikan apa pun sebelum E1 dijawab.** Setengah
rancangan mengandaikan ada mesin di belakangnya; membangunnya di tempat yang
salah berarti membangun ulang dari awal.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal**, sebelum kerja substantif |
| `docs/superpowers/specs/2026-08-07-handoff-protocol-rancang-ulang-design.md` | **Di awal — ini sumber kebenaran estafet ini.** Mulai dari §0.1 |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0**, baris teratas | **Di awal** — baris itu lahir sesi ini dan memuat rationale-nya |
| `docs/2026-07-26-rebuild-audit/area-08-handoff.md` | Saat butuh keputusan Juli yang belum dibatalkan (mis. syarat kesiapan penerima §8.2b untuk D1) |
| `plugins/handoff/skills/handoff/SKILL.md` | Saat perlu tahu bentuk lama persisnya — **jangan pakai sebagai kerangka**, §0 spec menjelaskan kenapa |
| `cc-plugin/src/engine/reminders.ts` | **WAJIB sebelum menambah pengingat apa pun** — syarat masuknya galak |
| `cc-plugin/hooks/reply-guard.ts` | Saat membahas D5 (penegakan mekanis) |
| `cc-plugin/src/engine/agent/status.ts` (komentar header) | Saat ada yang mengusulkan status diturunkan dari nama sesi |
| `mirza-bots/README.md` §"Urutan rilis" | **WAJIB sebelum minta user memasang versi baru** |

## 8. Keputusan User Sesi Ini

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| Rapikan skill lama / bangun §8 / ukur dulu | **Rancang ulang dari scratch, mulai dari filosofinya** | Melahirkan spec ini; `area-08` turun jadi bahan, bukan kerangka |
| Apa yang dijaga handoff | **Kontinuitas + pengetahuan** — kontinuitas karena **kualitas model turun**, bukan kehabisan ruang | Membalik dasar ambang; melahirkan temuan "90% = garis merah" |
| Mode Now/After/Ping-pong | **Buang, sisakan Now** | Seluruh mekanisme designation mati |
| Delegasi | **Batalkan** meski sudah didesain 4/4 | 9 baris BACKLOG ditandai DIBATALKAN |
| Cron timeout ACK | **Buang** | Tiga cabang hilang — **tapi melahirkan C6/C7** |
| ACK / rename / self-reset | **Pertahankan** | — |
| Self-reset | **`/clear` saja, tanpa rename** | Konvensi nama sesi sebagai status pensiun; batch atomik kehilangan pemakainya |
| Prompt ke penerima | **Beberapa kalimat + path** | §6 skill lama (sisi receiver) terbukti tidak pernah dieksekusi siapa pun |
| Dokumen handoff | **Menunjuk, jangan mengulang** | Sebut commit SHA / path spec, jangan salin isinya |
| Pencatatan | **Dicicil dari awal**, dan tanya apakah mesin bisa mengingatkan | Melahirkan §6 spec |
| Lokasi berkas | **Folder bot masing-masing** | Membalik SKILL-016, menyelaraskan dengan keputusan 2026-08-04 |
| Nama berkas | `<ts>_<8-char-session-id>_<nama-sesi>` | Mencabut seluruh aturan slug + aturan tabrakan |
| Tulis spec sekarang, jangan nanti | *"Saya khawatir kamu lupa"* | Spec ditulis di tengah sesi — penerapan pertama prinsipnya pada dirinya sendiri |
| Catat peta bahasan | **Ya** | **Langsung menemukan 8 topik yang belum pernah disinggung** |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta **eksplisit** agar alasan ikut diserahkan supaya bot berikutnya
bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan. Diwariskan
bot-02 → bot-03 → bot-02 → dst. **Sesi ini menambah empat tingkat (22–25).**

**Tingkat 1–15** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran ≠ memakainya · verifikasi **efek**, bukan artefak · memperbaiki satu bug
membuka bug di belakangnya · identitas berbasis string persis rapuh · perintah
warisan adalah hipotesis, bukan fakta · mutation check HIJAU harus dibuktikan
mutasinya terpasang UTUH · keberatan yang benar bisa tetap salah kalau kasusnya
belum ada · pagar yang berhenti menjaga menjadi jebakan yang menunggu · test
menjaga yang sudah terbayangkan · larangan tanpa alasannya berubah jadi klaim
yang salah · sebuah aturan hanya senyata PEMICUNYA.

**Tingkat 16: guard bisa menjaga PINTU yang benar dan tetap kebobolan lewat
JENDELA.** Terbayar TIGA KALI dalam satu hari di tiga tempat tak berhubungan.
Pertanyaan yang menutupnya: bukan *"sudah ada guard-nya?"* tapi ***"fakta MANA
yang dijaga, dan lewat jalur mana lagi fakta itu bisa berubah?"***

**Tingkat 17: memindahkan sesuatu dari "AI harus ingat" ke "mesin yang menjamin"
SELALU membuat desainnya lebih kecil.** ⚠️ **Terbayar lagi sesi ini, dan dari
arah baru:** §2 P2 spec ("mesin mengisi jangkar, AI mengisi penilaian") tidak
menambah section apa pun — ia **menghapus** beban ingatan untuk separuh isi
dokumen.

**Tingkat 18: keputusan boleh dibalik, tapi hanya oleh BUKTI BARU — dan
pembalikannya sendiri wajib DIBUKTIKAN.**

**Tingkat 19: sebuah baris checklist bisa LULUS SEPENUHNYA sambil memperlihatkan
kelemahan di sebelahnya yang tidak punya baris sama sekali.** ⚠️ **TERBAYAR LAGI
SESI INI, dan bentuknya lebih telanjang:** user meminta peta bahasan dibuat —
dan **tindakan membuat daftarnya** langsung memperlihatkan **delapan topik yang
belum pernah disinggung**, termasuk yang paling menentukan (E1). Daftarnya tidak
menemukan apa pun; yang menemukan adalah **membuat** daftarnya.

**Tingkat 20: status yang basi menyembunyikan BENTUK pekerjaan, bukan cuma
angkanya.**

**Tingkat 21: `BELUM` bukan status melainkan PERINTAH.** ⚠️ **Terbayar sesi ini
dalam bentuk PENCEGAHAN, bukan kerugian:** sebelas baris Tahap 5 (mode, `Pair`,
delegasi, Alarm#4) baru saja dibatalkan user. Kalau dibiarkan bertanda BELUM,
bot berikutnya akan **membangun yang sudah dibatalkan** — rapi, lengkap dengan
test hijau, dan tidak ada yang terlihat salah. Karena itu 13 penanda dipasang
**sebelum** handoff ini ditulis, dan jumlahnya diverifikasi dengan `grep -c`.

---

**Tingkat 22 (BARU): bentuk sebuah dokumen menentukan pertanyaan apa yang BISA
muncul di dalamnya.** `area-08-handoff.md` panjangnya 24 KB dan membahas handoff
sampai ke sudut-sudutnya — tapi bentuknya **audit item-per-item** (KEEP/DROP/
MODIFY atas SKILL-001…032). Dalam bentuk itu, pertanyaan *"apa sebenarnya yang
sedang kita pecahkan?"* **tidak punya baris**, jadi ia tidak pernah bisa
diajukan. Dan konsekuensinya mekanis: **audit item-per-item mempertahankan
bentuk lama secara default** — yang tidak punya vonis DROP otomatis ikut. Itu
sebabnya sesudah audit yang sangat teliti, hasilnya tetap 297 baris dengan
tulang yang sama. **Kalau sebuah dokumen sudah lengkap tapi rasanya tidak
menggerakkan apa-apa, curigai bentuknya, bukan isinya.**

**Tingkat 23 (BARU): satu angka bisa menjawab dua pertanyaan berbeda sambil
terlihat menjawab satu.** 0.25.0 menetapkan ambang handoff sisa <100k, diukur
dari pertanyaan *"berapa token dibutuhkan untuk MENYERAHKAN"* (median 17k). User
menjaga ~35% dari pertanyaan yang sama sekali lain: *"kapan KUALITAS BERPIKIR
mulai turun"*. Disandingkan: **sisa <100k pada window 1M ADALAH 90% terpakai** —
persis garis merah user. Angka itu benar untuk pertanyaannya sendiri, dan justru
karena ia mendarat di tempat yang masuk akal, **tidak ada yang menyadari bahwa
ambang KEDUA tidak pernah ada.** Akibatnya berdaging: dokumen handoff selalu
dikarang oleh model dalam kondisi terburuknya. **Saat menemukan sebuah ambang,
tanyakan pertanyaan apa yang ia jawab — lalu tanyakan pertanyaan apa lagi yang
ORANG KIRA ia jawab.**

**Tingkat 24 (BARU): membuang sebuah mekanisme tidak membuang pertanyaan yang ia
jawab.** Cron timeout ACK dibuang user, dan itu benar — ia mahal, rapuh, dan
menuntut AI mengingat urutan pembatalannya. Tapi timeout itu adalah **satu-
satunya penjawab** pertanyaan *"berapa lama pengirim menunggu sebelum
menyerah?"*. Pertanyaannya tidak ikut hilang; ia cuma jadi **yatim**, dan baru
ketahuan saat peta bahasan dibuat (C6/C7). **Setiap kali membuang sesuatu,
daftarkan pertanyaan-pertanyaan yang selama ini ia jawab — lalu putuskan
masing-masing secara sadar: ikut mati, atau cari penjawab baru.** Yang
berbahaya bukan yang dibuang, melainkan yatim yang ditinggalkannya.

**Tingkat 25 (BARU): MOMEN menulis menentukan kualitas tulisan — dan protokol
yang menulis di ujung selalu menulis dalam kondisi terburuk.** Handoff dipicu
saat context hampir penuh; dokumen handoff adalah dokumen terpenting dalam
seluruh protokol; jadi dokumen terpenting itu **selalu** dikarang oleh model
yang sedang paling pelupa. Buktinya di repo ini:
`.handoff/202608070115-prompt-status-json-beku.md` membawa **tiga hipotesis
sebagai fakta** dan seluruh jamnya meleset **+7 jam**. Penangkalnya bukan
menulis lebih hati-hati, melainkan **memindahkan momennya**: dicicil sepanjang
sesi, sehingga di ujung yang tersisa cuma **menutup**, bukan mengarang.
Turunannya berlaku umum: **yang butuh INGATAN dicicil; yang butuh KEADAAN
SEKARANG ditulis di akhir** — karena yang rusak duluan pada model yang penuh
adalah ingatannya, bukan kesadarannya akan situasi saat ini.

**Kalau kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti / tercatat di sesi ini

- ✅ **Sisi receiver skill handoff tidak pernah dieksekusi siapa pun.** Pagi ini
  bot-02 menerima estafet dan menyelesaikan SELURUH kewajiban penerima tanpa
  pernah memuat skill `handoff` — yang di-invoke cuma `bot-conduct` dan
  `using-agent-bus`. Prompt agent-bus-nya self-contained. **§6 skill lama (15
  baris) mengulang isi template prompt §5 untuk pembaca yang tidak ada.**
- ✅ **`template.md` adalah duplikat mati yang SUDAH membusuk**, dan file itu
  sendiri menyatakan skill tidak me-load-nya saat runtime: ia masih menulis
  READY = `session idle + context <10%` sementara `SKILL.md` sudah pindah ke
  `lifecycle`. Dua sumber kebenaran, satunya salah, tidak ada yang tahu.
- ✅ **Skill lama meminta field yang sistem baru SENGAJA tidak sediakan.**
  `agent/status.ts` menolak mengembalikan `lifecycle` (komentar headernya
  menjelaskan kenapa); skill lama membacanya dan jatuh ke menebak dari nama
  sesi. Artinya di atas sistem baru ia **selalu** jalan di jalur cadangan —
  jalur yang jarang dilalui adalah jalur yang jarang teruji.
- ⚠️ **`cc-plugin/src/server.ts:340` masih MENGAJARKAN pola yang sudah
  dibuang** — deskripsi tool `send_slash` memakai contoh literal
  `["/rename done-...", "/clear", "/rename idle"]` sebagai alasan batch ada.
  Harus ikut diperbarui.
- ❌ **`agent_status` memulangkan `context_used_percent: null`** untuk sesi
  bot-02 yang jelas hidup dan panjang. Belum ditelusuri, dan **jangan dijadikan
  asumsi** kalau ada yang menghitung ambang dari sana.
- ❌ **`sed`/`perl`/string-literal-multiline untuk mengubah kode di mesin ini
  GAGAL DIAM-DIAM** (tiga kali 2026-08-06). Pakai `Edit` presisi dan **buktikan
  mutasi terpasang (`grep -c`) SEBELUM percaya hasilnya.** Dipakai lagi sesi ini
  untuk 13 penanda BACKLOG.
- ⚠️ **Jam di log/ts berstempel UTC.** Handoff dua sesi lalu membacanya sebagai
  WIB dan seluruh dokumennya meleset +7 jam. **Sebutkan zonanya atau konversi
  dulu.**
- ⚠️ **JANGAN jalankan `cc-plugin` kedua terhadap folder bot yang HIDUP.**
- ⚠️ **Worktree baru butuh `bun install` sendiri** di `cc-plugin` DAN
  `cc-wrapper`.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `8462d26`; commit sesi ini `0cec71f..8462d26` (4
  commit). Kode HEAD `8b0b11b` — **tidak berubah**, sesi ini nol baris kode.
- **Berkas baru:** `docs/superpowers/specs/2026-08-07-handoff-protocol-rancang-ulang-design.md`.
  **Berkas diubah:** `docs/2026-07-26-rebuild-audit/BACKLOG.md`.
- **Angka test:** tidak dijalankan sesi ini (tidak ada kode yang disentuh).
  Terakhir diketahui: `cc-plugin` 609 hijau · `cc-wrapper` 61 hijau.
- **Versi:** `cc-plugin` 0.32.0 di repo dan terpasang di `mirza_02_bot`.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana."* · *"Aku enggak mau over engineer."*
  · *"Saya prefer tidak ada migrasi data."* · *"Tolong hal yang bisa kamu
  lakukan, maka kamu yang lakukan."* · *"Saya tidak suka ada sisa-sisa yang
  tidak jelas."* · **baru hari ini:** *"Semangatnya adalah penyederhanaan."*
- **Catatan proses:** user tiga kali menekan tombol *"Explain manually"* pada
  pertanyaan desain, lalu menegaskan *"Tidak ada masalah dengan kamu memberikan
  buttons"* — jadi tombol tetap dipakai; ia hanya sering memilih menjawab bebas
  untuk pertanyaan rancangan. **Jangan berhenti menawarkan tombol.**
