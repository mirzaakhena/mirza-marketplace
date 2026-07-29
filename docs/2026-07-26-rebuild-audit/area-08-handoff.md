# Area 08 — Handoff

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** SKILL-001–032

Catatan: `docs/notes/02-handoff.md` sebagian **sudah terlaksana** — `/handoff-resume` sudah tidak ada, dan handoff sudah bisa jalan tanpa mediasi user lewat mekanisme *designation*. Audit ini fokus ke sisanya.

---

## 8.1 Mode handoff

**Item:** SKILL-009, SKILL-010, SKILL-011

| Mode | Verdict |
|---|---|
| 🚀 **Now** — pilih bot → tulis file → kirim | **KEEP** |
| ⏭️ **After this task** — designation one-shot | **KEEP** — inti dari "handoff tanpa mengganggu user" |
| 🏓 **Ping pong** — designation menular via header `Pair:` | **KEEP** |
| 📄 **File only** — tulis file tanpa kirim | **DROP** (tidak dipilih user) → konfirmasi di 8.A |

**KEEP juga (SKILL-011):** ekuivalensi bahasa natural — "nanti handoff ke bot-02" ≡ After-this-task dengan target (lewati kedua step tombol); "handoff ke bot-02 sekarang" ≡ Now dengan target (lewati step pilih bot). Ini yang membuat alur cepat tidak terhalang tombol.

## 8.2 Ambang pemicu — **GANTI dasarnya: token tersisa, bukan persen**

**Item:** SKILL-006, SKILL-007

**Sekarang:** tabel per-ukuran window — ≥ 1.000.000 token → ambang 35%; selain itu → 75%. Plus fallback menebak dari string `model` (mengandung "1M" → 35%) bila ukuran window belum tersedia.

**Jadi:** satu ambang berbasis **sisa token**, mis. *"tawarkan handoff bila sisa < N token"* — berlaku untuk window apa pun tanpa tabel per-ukuran dan tanpa fallback menebak dari nama model.

**Alasan:** yang menentukan "masih bisa lanjut atau tidak" bukan persentase terpakai, tapi berapa ruang yang tersisa untuk task berikutnya. Angka 35% untuk 1M kemungkinan **terlalu konservatif** — 35% terpakai berarti masih ada 650k tersisa.

**Nilai N belum ditetapkan** → pertanyaan terbuka 8.B.

**KEEP (SKILL-007):** ambang hanya diperiksa **di batas selesai-task**, boleh terlampaui selama task berjalan — jangan menginterupsi pekerjaan.

**KEEP (SKILL-008):** ada designation → full-auto (user cukup dinotifikasi); tanpa designation → tawarkan tombol `[🤝 Handoff] [▶️ Lanjutkan]`; user pilih Lanjutkan → **jangan tawarkan lagi sampai batas selesai-task berikutnya** (anti-spam).

## 8.2b ⭐ Syarat kesiapan PENERIMA — **ATURAN BARU** (user, 2026-07-27)

Menggantikan SKILL-004 seluruhnya. Aturan lama: `lifecycle == "idle"` (diturunkan dari **nama sesi**) **dan** `context_used < 10%`.

**Aturan baru — dua syarat, keduanya wajib:**

| Syarat | Nilai | Sumber |
|---|---|---|
| Context terpakai | **< 100.000 token** — **mutlak**, tidak ikut ukuran window; **disetel di config** | snapshot statusLine |
| Tidak sedang bekerja | tidak ada giliran yang sedang berjalan | hook (fakta, bukan tebakan dari nama) |

**Catatan menarik:** ambangnya sebenarnya **tidak berubah** dari aturan lama — 10% dari window 1M **adalah** 100k. Yang berubah: dinyatakan dalam satuan yang jujur (token) alih-alih persen yang menyesatkan, dan tidak lagi bergantung pada nama sesi.

**Kenapa syarat "tidak sedang bekerja" wajib ada:** ia menutup lubang yang ditinggalkan nama `idle`. Bot yang baru 20k tapi sedang mengerjakan permintaan user tidak boleh menerima estafet — ia akan menelantarkan pekerjaannya. Tanpa syarat ini, membuang nama `idle` berarti kehilangan informasi tanpa pengganti.

**Kenapa mutlak, bukan proporsional:** sederhana dan mudah diperiksa; user memakai window 1M. Kalau kelak memakai model 200k, angkanya diturunkan lewat config — bukan lewat rumus.

### Siapa yang memeriksa: **keduanya**

| Siapa | Peran |
|---|---|
| **Pengirim** | **Menyaring** lewat `agent_status` sebelum menulis file — supaya tidak membuang pekerjaan mengirim ke bot yang jelas penuh |
| **Penerima** | **Memutuskan** — keputusannya yang mengikat, karena kondisi bisa berubah di antara dua momen itu |

Menjaga **neighbor autonomy**: penerima selalu boleh menolak, dan ia yang paling tahu kondisinya sendiri.

### Cabang hasil (tiga, seperti aturan user)

| Balasan penerima | Yang terjadi |
|---|---|
| **OK** | Batas waktu dimatikan → user diberi tahu → `/clear` diantre ke pengirim |
| **NOT-OK** (context ≥ 100k / sedang bekerja) | Batas waktu dimatikan → **kembali ke user** dengan alasan penolakan + pilihan bot lain |
| **Tidak membalas sampai batas waktu** | **Kembali ke user** dengan `[Kirim ulang] [Pilih bot lain] [Batal]`; pengirim **TIDAK** direset |

⚠️ **Pelaksana ketiga aksi itu adalah `fleetd`, bukan AI pengirim.** Alur logisnya persis seperti yang user tuliskan; yang berbeda hanya siapa yang mengingat. Alasan: ingatan "saya sedang menunggu ACK, nanti batalkan timer dulu baru reset" akan hidup di dalam context — dan handoff dipicu **justru saat context hampir penuh**, kondisi paling rawan compaction (§8.3).

### Bila TIDAK ADA bot yang memenuhi syarat

Bot melaporkan kondisi tiap peer secara konkret (*"bot-02 penuh 340k · bot-03 sedang bekerja · bot-04 offline"*) lalu menawarkan tombol: **[Tulis file saja] [Pilih paksa salah satu] [Batal]**. User yang memutuskan.

Konsisten dengan SKILL-013 yang tetap berlaku: **user boleh sengaja memilih bot yang tidak siap** — marka hanya informasi. Saat itu terjadi, pesan handoff membawa penanda "ini pilihan sadar user" supaya penjaga di sisi penerima tidak menolaknya.

**Catatan:** opsi "[Tulis file saja]" menghidupkan kembali fungsi mode **File only** yang di-DROP di §8.1 — tapi sebagai *jalan keluar saat buntu*, bukan sebagai mode yang dipilih di awal. Itu perbedaan yang bermakna: ia muncul tepat saat berguna, bukan sebagai tombol yang harus diabaikan setiap kali.

## 8.3 ⭐ Pelacak state handoff pindah ke MESIN

**Item:** SKILL-020, SKILL-021, SKILL-022, SKILL-023, SKILL-024, SKILL-026, SKILL-027, SKILL-029, SKILL-032 (sebagian)

**Sekarang:** seluruh state machine dijalankan AI lewat teks skill, plus **cron one-shot 10 menit** yang dipasang AI untuk timeout ACK dan harus diingat untuk dibatalkan.

**Jadi:** state handoff jadi **data** dan timeout jadi **alarm mesin**.

Yang pindah jadi baris data: siapa mengirim ke siapa · slug · sudah di-ACK atau belum · designation aktif (mode + target) · pasangan ping-pong.

**Pembagian tugas:** **AI mengisi ISI handoff; mesin menjaga URUTAN dan batas waktunya.**

**Untung:**
- Handoff yang menggantung **terlihat** (di `doctor`), tidak hilang diam-diam
- Urutan wajib "batalkan timeout → lapor ke user → baru self-reset" (SKILL-024) **tak bisa terbalik** — sekarang hanya sekuat ingatan AI
- **Designation tidak hilang saat context di-compact** — sekarang designation hidup di dalam context, sekali compaction ia bisa lenyap tanpa jejak
- Guard READY sebelum kirim (SKILL-020) jadi pemeriksaan data, bukan interpretasi nama sesi

Ini penerapan **K-5** pada handoff.

**Aturan yang tetap harus dipertahankan sebagai perilaku:**

| Item | Aturan |
|---|---|
| SKILL-020 | Designation full-auto + target tidak READY → **designation BATAL**, beri tahu user, jatuh ke pemilihan manual |
| SKILL-026 | Timeout menyala tanpa ACK → lapor + tombol `[Kirim ulang] [Pilih bot lain] [Cancel]`; **JANGAN self-reset** (estafet belum berpindah) |
| SKILL-027 | R menolak (sibuk) → lapor penjelasannya + kembali ke pemilihan bot. ACK datang terlambat: bila belum ada keputusan user → lanjutkan langkah ACK normal; bila estafet sudah dipindah user ke bot lain → laporkan konflik, **jangan kirim apa pun** ke R |
| SKILL-019, 023 | Dua laporan wajib ke user: "file handoff selesai: `<path absolut>`" lalu "handoff `<slug>` terkirim ke `<R>`, menunggu ACK" |
| SKILL-028 (langkah 5) | **ACK dua arah**: ke pengirim (lewat agent-bus) **dan** ke user lewat Telegram dengan ringkasan next-step |
| SKILL-013 | Bot non-ready/offline **tetap bisa dipilih** — user pegang kendali, marka hanya informasi. Pilihan non-ready yang sadar harus menyertakan penanda eksplisit supaya guard penerima tidak menolaknya |

## 8.4 Self-reset — **SIMPLIFY jadi satu langkah**

**Item:** SKILL-025; PTY-078; SCAR-045

**Sekarang:** satu batch atomik tiga injeksi keystroke `["/rename done-<slug>-<ts>", "/clear", "/rename idle"]` + fallback tiga panggilan berurutan untuk wrapper lama.

**Jadi:** setelah **K-7** (lifecycle jadi data), dua dari tiga rename kehilangan alasannya. Yang tersisa: `/clear` + satu penulisan status ke store.

**Konsekuensi:** kebutuhan **batch atomik** untuk handoff hilang. Batch masih dipertahankan sebagai kapabilitas (area 06 §6.7) tapi handoff bukan lagi pemakainya — jadi kalau tak ada pemakai lain, batch itu sendiri jadi kandidat DROP di tahap arsitektur.

**Yang hilang juga:** nama sesi `done-<slug>-<yyyymmddhhmm>` sebagai penanda arsip yang bisa dilacak ke file handoff (SKILL-005). **Penggantinya wajib ada:** kaitan sesi ↔ file handoff harus tersimpan sebagai data, bukan tercermin di nama sesi.

## 8.5 Template handoff — **PANGKAS**

**Item:** SKILL-017, SKILL-018; template.md

**Yang WAJIB ada** (dari catatan user + item yang bernilai):

| Bagian | Kenapa wajib |
|---|---|
| Tujuan handoff | |
| SUDAH / SEDANG | Posisi pekerjaan |
| **Blocker + kenapa jadi blocker** | Alasannya wajib, bukan hanya daftarnya |
| AKAN (goal + langkah + starting point) | |
| **Referensi dengan kolom "Kapan dibaca"** | Ada referensi yang dibaca di awal, ada yang hanya saat kondisi tertentu (mis. error). Ini yang mencegah bot penerima membaca semuanya atau tak membaca apa pun |
| **Referensi playbook** | Wajib — supaya bot baru tahu cara bekerja, bukan hanya apa yang dikerjakan (lihat area 13) |
| **Referensi tasks/plans bila lintas sesi** | Wajib bila pekerjaan panjang sudah terencana sebelumnya |
| Anti-Patterns / Lessons (CARRY FORWARD) | Kesalahan yang tidak boleh terulang ikut pindah bersama estafet |
| Header: Date, Repo kerja, Branch (HEAD SHA), Dari → Ke, Lanjutan dari | Identitas & jejak |

**Yang DIGABUNG/DIBUANG:**

| Bagian | Verdict |
|---|---|
| Konteks Proyek | **DROP** — sering duplikasi README, dan mandat README (§8.6) sudah menjamin README-nya segar |
| Keputusan User Lewat Brainstorming | **GABUNG** ke Tujuan atau ke Referensi |
| Catatan Lain | **DROP** — tempat sampah |
| Header `Pair` | **KEEP** — ping-pong dipertahankan (§8.1). Kalau ping-pong akhirnya dibuang, ini ikut |

**KEEP (SKILL-018):** sifat file — **append-only chain**, jangan pernah mengedit handoff lama; `Lanjutan dari` hanya diisi bila benar-benar kontinuasi; **jangan menduplikasi checklist plan** (plan = source of truth, handoff hanya mencatat posisi). Aturan terakhir ini persis permintaan user: *"tidak menulis ulang informasi yang sudah dijelaskan oleh referensi yang sudah ada"*.

**KEEP (SKILL-017):** template **di-generate langsung**, jangan load `template.md` dari disk — menghindari dua salinan yang bisa menyimpang (dan itu sudah pernah terjadi: template membawa READY-heuristic lama yang sudah digantikan SKILL.md — ambiguitas #5 inventaris).

## 8.6 KEEP tanpa perubahan

| Item | Aturan |
|---|---|
| SKILL-002 | **Bot tidak pernah bekerja di workspace-nya sendiri** — repo kerja selalu repo project lain; semua path di protokol **absolut** |
| SKILL-005 | Slug kebab-case ≤ 6 kata; slug yang **sama** dipakai untuk nama file dan pelacakan handoff |
| SKILL-014 | **Clarity check pra-file** (ketiganya wajib): (a) next-step satu kalimat tanpa hedging, (b) artefak konkret yang bisa dikutip, (c) arah **terkonfirmasi user** di sesi ini atau terdokumentasi di handoff/plan yang dilanjutkan — **inferensi AI murni tidak dihitung**. Gagal → brainstorm dulu. Ini guard paling penting terhadap "handoff yang isinya tebakan" |
| SKILL-015 | **Mandat README**: update README root repo kerja + README sub-folder yang tersentuh **SEBELUM** menulis file handoff. *"Handoff dengan README basi = handoff cacat."* Persis permintaan user |
| SKILL-016 | Lokasi `<repo-kerja>/.handoff/<yyyymmddhhmm>-prompt-<slug>.md`; repo kerja dari `git rev-parse --show-toplevel` (bukan repo git → fallback `pwd` + beri tahu user sekali); collision → suffix `-2`, `-3` |
| SKILL-012 | Step pilih bot: status dinarasikan sebagai bullet **tanpa penomoran** di body; tombol hanya nama bot + Cancel. Marka dari status: ✅ idle · ⛔ sibuk · 🔄 transisi · 📴 offline (marka "⚠️ nama manual" **hilang** — konsekuensi K-7, tidak ada lagi status yang diturunkan dari nama) |
| SKILL-031 | Larangan receiver: jangan edit/hapus file handoff atau plan; jangan menelusuri seluruh rantai `Lanjutan dari` (maksimal satu hop, hanya bila konteks kurang); jangan membalas apa pun ke pengirim selain ACK/penolakan yang diminta |
| SKILL-032 | Edge case yang harus tetap benar: dua handoff paralel di repo sama aman (path eksplisit + suffix collision); bot designated keburu dipakai → designation batal; plan hilang / branch beda / SHA yatim → **jangan gagal, catat + lanjut**; `/handoff <argumen>` → argumen diabaikan total, alur tombol normal |
| SKILL-028 | Template body `agent_send` — semua placeholder `<...>` **disubstitusi literal SEBELUM kirim** (termasuk `<slug>` — penerima tidak bisa merekonstruksinya). Guard sibuk paling dulu; baca file handoff **persis yang ditunjuk, JANGAN cari "latest"** (persis peringatan user: bisa ada handoff lain yang dibuat paralel oleh bot lain); gate adaptif — Blocker ≠ `—` → **tanya user dulu** sebelum eksekusi AKAN |

## 8.7 Yang berubah karena keputusan area lain

| Item | Perubahan |
|---|---|
| SKILL-003 | State machine nama sesi `idle → task-<slug> → done-<slug>-<ts> → idle` **pensiun** (K-7) |
| SKILL-004 | Definisi READY dari nama sesi + fallback heuristik `current_session_name == "idle"` **pensiun** — digantikan aturan §8.2b (context < 100k **dan** tidak sedang bekerja) |
| SKILL-006 | Fallback menebak ukuran window dari string model **pensiun** (§8.2) |
| SKILL-021 | `agent_send` ke target offline tetap terkirim (antre) dan **wajib** disebut di laporan — tetap berlaku (area 07 §7.7) |
| SKILL-030 | Legalitas terhadap aturan agent-bus perlu **ditulis ulang** sesuai §7.4 (izin boleh berlaku beberapa langkah ke depan, tidak per-panggilan) |

---

## Pertanyaan terbuka

### 8.A — Mode "File only" — **DROP dikonfirmasi**

User: *"Ya, buang"*. Kalau sewaktu-waktu perlu menyimpan posisi tanpa menyerahkan, itu diminta dengan bahasa biasa ("tulis file handoff-nya saja, jangan kirim") — bukan lewat tombol.

### 8.B — Nilai ambang "sisa token" untuk memicu tawaran handoff — **masih terbuka**

Belum ditetapkan (§8.2). Ini ambang **PENGIRIM** — *kapan bot menawarkan handoff karena dirinya mulai penuh*.

⚠️ **Jangan tertukar dengan §8.2b:** angka 100k yang ditetapkan user 2026-07-27 adalah ambang **PENERIMA** (*apakah bot ini cukup segar untuk menerima*). Dua peran, dua ambang, dua arah:

| Peran | Pertanyaan | Ambang |
|---|---|---|
| Pengirim | "Apakah saya sudah terlalu penuh untuk melanjutkan?" | **belum ditetapkan** — berbasis **sisa** token |
| Penerima | "Apakah saya cukup kosong untuk menerima?" | **< 100k terpakai** (mutlak, config) |

Perlu dasar empiris: berapa token yang biasanya dipakai satu task substansial di fleet ini. Rencana: mulai dari satu angka konservatif sebagai **konfigurasi**, lalu disetel setelah ada data.

### 8.C — ⭐ FITUR BARU: "partial handoff" (delegasi, bukan estafet)

> "Ada ide fitur baru yaitu 'partial handoff'. Ini artinya ada bagian yang akan di handoff ke bot lain tetapi bot utama masih menjalankan task seperti biasa." — user, 2026-07-26

**Ini primitif yang BERBEDA dari handoff.** Handoff = *"saya berhenti, kamu lanjutkan"* (estafet, satu pemilik, pengirim mereset diri). Partial handoff = *"kamu ambil sepotong, saya tetap jalan"* (dua pemilik paralel, tak ada yang mereset).

### Kenapa bot peer, bukan subagent

User memilih **semua** alasan berikut, plus satu tambahan yang paling menentukan:

| Alasan | |
|---|---|
| Context segar terpisah | Ongkos context pekerjaan berat ada di tempat lain; bot utama tidak ikut penuh |
| Jejak terpisah di Telegram | Progres terlihat sebagai percakapan sendiri di thread bot itu |
| Pekerjaan berjam-jam | Subagent hidup di dalam satu turn; pekerjaan panjang lebih cocok dimiliki proses berdiri sendiri |
| Bot peer punya keahlian/konfigurasi berbeda | Model/effort berbeda, atau sudah punya konteks project tertentu |
| ⭐ **User ingin berkomunikasi, berinteraksi, dan berdiskusi LANGSUNG dengan bot yang menerima partial handoff** | Ini yang subagent **tidak mungkin** berikan — subagent tidak punya identitas yang bisa diajak bicara |

Alasan terakhir itu yang membuat partial handoff bukan duplikasi subagent: yang dibutuhkan bukan *pekerja*, tapi **rekan kerja tambahan yang bisa diajak bicara**.

### Keputusan yang sudah diambil

| Aspek | Keputusan |
|---|---|
| **Laporan balik ke bot utama** | **TIDAK ADA KEWAJIBAN.** Bot penerima tidak wajib melaporkan hasil ke bot utama — ia jadi pemilik mandiri atas potongan itu dan berinteraksi langsung dengan user |
| **Isolasi repo** | **WAJIB git worktree terpisah.** Aturan bot-conduct Rule 1 (SKILL-057) naik dari anjuran jadi **syarat**: bot pelaksana bekerja di worktree sendiri, hasilnya digabung lewat git seperti kontribusi biasa. Ini juga yang membuat user tetap bisa memakai repo itu sendiri saat kedua bot bekerja |
| **Self-reset pengirim** | **TIDAK** — bot utama tetap jalan (inti perbedaannya dengan handoff) |

### Penyederhanaan besar yang mengikuti

Karena tidak ada kewajiban lapor balik, **tidak diperlukan kanal balasan sama sekali** — jadi seluruh pertanyaan soal "bagaimana hasilnya kembali" (polling, artefak, prompt balik) **gugur**. Partial handoff memakai ulang mesin handoff yang sudah ada, dikurangi dua hal: tanpa self-reset pengirim, dan tanpa pelacakan ACK-hasil.

### Sisa detail untuk desain implementasi

1. **ACK penerimaan** (bukan ACK hasil) — rekomendasi: penerima meng-ACK ke **user**, supaya user tahu potongan itu benar-benar mendarat. ACK ke bot utama tidak wajib.
2. **Isi file partial handoff** — kandidat: template §8.5 dikurangi bagian yang mengasumsikan estafet (`Lanjutan dari`, `Pair`), ditambah **batas potongan yang jelas** (apa yang termasuk, apa yang tetap milik bot utama) supaya dua bot tidak saling menyerobot.
3. **Kalau bot tujuan sedang sibuk** — belum diputuskan: antre, tolak, atau tawarkan bot lain.
4. **Penamaan** — "partial handoff" menjelaskan mekanismenya tapi bukan maksudnya. Kandidat lain: *delegasi*, *split*, *spin-off*. Diputuskan saat desain.
