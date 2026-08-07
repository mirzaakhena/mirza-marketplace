# Rancang Ulang Handoff Protocol — dari Filosofinya

**Tanggal:** 2026-08-07 (WIB) · **Status:** DRAFT — sebagian keputusan sudah
diketok user, sebagian masih terbuka (§7)
**Penulis:** bot-02 · **Metode:** brainstorming bersama user, sesi
`task-lanjutan-rekonsiliasi`
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

**Karena itu: dokumen handoff dicicil sepanjang sesi, bukan dikarang di akhir.**
Disetujui user eksplisit.

## 2. Prinsip rancangan

| # | Prinsip | Konsekuensi |
|---|---|---|
| P1 | **Urutkan isi berdasarkan seberapa TIDAK TERGANTIKAN informasinya** | Yang bisa direkonstruksi dari git/README → tunjuk saja. Yang cuma hidup di kepala bot yang akan di-clear → wajib, detail |
| P2 | **Mesin mengisi jangkar, AI mengisi penilaian** | Repo/branch/SHA/jam/file tersentuh diisi otomatis — nol beban ingatan |
| P3 | **Dokumen menunjuk, tidak mengulang** | Ada commit SHA / file spec → sebut ID-nya, jangan salin isinya (permintaan user) |
| P4 | **Kerangka lengkap sejak file lahir** | Kotak kosong **adalah** pengingatnya. Tanpa hook, tanpa token tambahan |
| P5 | **Yang butuh INGATAN dicicil; yang butuh KEADAAN SEKARANG ditulis di akhir** | Menaruh tiap bagian di momen di mana model paling bisa dipercaya |
| P6 | **`—` adalah jawaban yang sah** | Penangkal pengisian formalitas yang diundang oleh P4 |
| P7 | **Status tidak pernah diturunkan dari string** | Konsekuensi keputusan user membuang seluruh konvensi nama sesi (§4.3) |

**P5 lahir dari satu pengamatan:** yang rusak duluan pada model yang penuh
adalah **ingatannya**, bukan kesadarannya akan situasi saat ini. Model di 85%
masih tahu persis di mana ia berhenti dan apa langkah berikutnya; yang ia
lupakan adalah kenapa tiga jam lalu ia membuang pendekatan A.

## 3. Format file handoff

### 3.1 Lokasi & nama — DIKETOK USER

- **Lokasi:** folder bot masing-masing (`C:\Users\Mirza\workspace\bot-NN\...`),
  **bukan** `<repo-kerja>/.handoff/`.
  Membalik SKILL-016, menyelaraskan dengan keputusan user 2026-08-04 (*"seluruh
  state pindah ke folder masing-masing bot"*) — file handoff selama ini
  satu-satunya sisa state bersama yang belum ikut pindah.
- **Nama:** `<timestamp>_<8-char-session-id>_<nama-sesi>.md`
- Nama sesi yang dipakai = **nama PERTAMA** sesi itu; tidak ikut berubah kalau
  sesi di-rename lagi. File adalah catatan sebuah *rentang kerja*, bukan cermin
  nama sesi hari ini. Datanya sudah ada: `firstNameOfSession` di `reminders.ts`.
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

- **Menyunting, bukan menumpuk.** Temuan yang membatalkan temuan sebelumnya
  **menggantikannya**, bukan berbaris di sampingnya. Tanpa aturan ini, file yang
  tumbuh sepanjang sesi berubah jadi log kronologis — persis yang user larang.
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
- **Rename sesi oleh penerima** — sekaligus yang melahirkan file handoff
  berikutnya (§3.1).
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

**Tidak melahirkan file handoff palsu:** mesin memakai *"nama BERUBAH sejak sesi
lahir"* (`renamedInThisSession`), bukan *"punya nama"*.

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

🤖 **Mesin** menyalakan keadaan → 🧠 **AI** menilai & menawarkan ke user → 👤
**user** yang ketok. Kalau user menolak, AI mengingatnya **di dalam sesi itu** —
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
| T1 | **Penyimpanan.** Folder bot **tidak punya `.git`** (diverifikasi: `bot-02`, `bot-03`). File handoff jadi keluar dari git: tanpa backup, tanpa sejarah, tidak terlihat dari MacBook | (1) terima apa adanya — rekomendasi bot-02 · (2) git lokal tanpa remote (pola vault) · (3) repo arsip khusus | Isinya pengetahuan paling mahal di seluruh protokol |
| T2 | **Ambang ① "mulai mencatat"** | ~15–20% terpakai (150–200k pada 1M) | Menentukan berapa banyak sesi yang melahirkan file |
| T3 | **Ambang ② "tawarkan penyerahan"** | ~35% (kebiasaan user), boleh diabaikan sampai 80% | Yang selama ini tidak ada sama sekali |
| T4 | **Penegakan di titik kirim** (§6.5) | ya / tidak | Bisa jadi over-engineering |
| T5 | **Sesi bertopik yang tidak pernah handoff** meninggalkan berkas setengah jadi | Biarkan — penerima **selalu** diberi path eksplisit, jadi berkas lain tidak mengganggu siapa pun. Folder pelan-pelan jadi jurnal kerja | Nyaris bubar sendiri, tinggal dikonfirmasi |

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
