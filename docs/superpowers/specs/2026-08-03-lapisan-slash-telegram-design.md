# Lapisan Slash Telegram — dari HP ke TUI Claude Code

**Tanggal:** 2026-08-03 · **Penyusun:** bot-02
**Status:** hasil brainstorming bersama user, belum punya rencana implementasi
**Berdiri di atas:** `2026-08-03-cc-wrapper-design.md` (fondasi `cc-wrapper`
sudah berdiri dan terverifikasi hidup)

---

## 1. Lingkup, dan kenapa dipisah dari spec wrapper

Spec `cc-wrapper` menutup satu kalimat: *"wrapper menyuntikkan slash CC apa pun
yang bentuknya sah, dan tidak menyimpan daftar putih."* Kebijakan **command mana
yang boleh** sengaja diangkat keluar dari sana.

Dokumen ini adalah kebijakan itu.

**Kosakata dipakai ketat**, sama seperti spec wrapper §1.1:

| Istilah | Artinya |
|---|---|
| **slash CC** | Milik Claude Code: `/clear`, `/rename`, `/compact`, `/model` |
| **slash Telegram** | Milik lapisan ini: `/new`, `/switch`, `/delete` — CC tidak mengenalnya |

`/rename` ada di **kedua** dunia. Kebetulan itu tidak netral — lihat §4.

## 2. Kenyataan yang membentuk desain ini

### 2.1 Sistem baru belum punya satu pun slash Telegram

Diperiksa langsung ke kode: `cc-plugin/src/engine/engine.ts:388` menerima
`message:text` dan meneruskan **seluruh** isinya ke sesi AI lewat `deliver`.
Tidak ada pencegatan sama sekali.

Ini bukan utang; ini **kesempatan**. Sistem lama menambah command satu per satu
selama berbulan-bulan, jadi aturannya tidak pernah diputuskan — ia **mengendap**.
Sepuluh command tumbuh jadi sepuluh cabang `if`, masing-masing dengan
handler, sebagian dengan picker, sebagian lagi dengan entri di daftar hitam
`slash-guards`. Memulai dari nol berarti aturannya bisa diputuskan **sekali, di
depan**.

### 2.2 Wrapper sudah bisa menyuntikkan apa saja

Karena `cc-wrapper` menerima slash CC apa pun yang bentuknya sah, ada pilihan
yang sistem lama tidak punya: **slash Telegram yang tidak dikenal bisa
diteruskan**, bukan ditolak.

**Keputusan user:** diteruskan, **tapi dengan konfirmasi tombol lebih dulu**.
Alasannya di §5.

### 2.3 Blind spot yang menipu audit — dan tidak boleh diulang

Sistem lama memanggil `tryRouteMetaCommand()` (`server.ts:1882`) **sebelum**
`logInbound()` (`server.ts:1924`). Akibatnya `/new`, `/switch`, `/delete`,
`/effort`, `/context`, `/version`, `/help`, `/start` **dikonsumsi sebelum sempat
dicatat**.

Biayanya nyata: audit celah migrasi 2026-08-02 membaca `/switch` sebagai **0×
dipakai** dan nyaris mencoretnya dari daftar bangun. Angka sebenarnya — dari
meteran lain — **139× sepanjang hidup**.

> **Aturan yang mengikat lapisan ini: catat dulu, baru cegat.** Pesan slash
> tetap masuk `conversations.db` seperti pesan lain. Yang berbeda hanya
> tujuannya sesudah itu: ke wrapper, bukan ke AI.

Ini bukan kerapian. Tanpa itu, keputusan berikutnya soal command mana yang layak
dirawat akan diambil dari angka yang bohong — persis seperti yang sudah terjadi.

### 2.4 Yang mendengar Telegram hidup di dalam sesi

`cc-plugin` adalah proses anak yang di-spawn CC (§3.3 spec wrapper). Alurnya
melingkar:

```
cc-wrapper → spawn CC → CC spawn cc-plugin → cc-plugin dengar Telegram
          ↑                                              │
          └────────── tulis ke pending/ ─────────────────┘
```

**Konsekuensi yang dinyatakan sekarang, bukan saat menggigit:** kalau sesinya
mati, `cc-plugin` ikut mati, dan **tidak ada lagi yang mendengar `/new` dari
HP**. Wrapper masih hidup dan masih bisa mengetik, tapi ia **tuli**.

Ini **tidak** memblokir lapisan ini — selama sesi hidup, semuanya jalan. Tapi ia
memastikan satu hal: *"wrapper bisa menyalakan ulang sesi yang mati"* nanti
**tidak cukup dibangun di wrapper saja**. Butuh pendengar di luar sesi.

## 3. Aturan pemetaan

```
pesan Telegram diawali "/"
        │
        ├─ catat ke conversations.db  ← SELALU, tanpa kecuali (§2.3)
        │
        ├─ ada di daftar dikenal?
        │     ya  → olah jadi payload wrapper → tulis ke pending/
        │     tidak → kirim tombol konfirmasi
        │              ├─ user tap "Kirim"  → teruskan apa adanya ke pending/
        │              └─ user tap "Batal"  → tidak terjadi apa-apa
        │
        └─ bukan slash → seperti sekarang: diteruskan ke sesi AI
```

**Slash Telegram tidak pernah diteruskan mentah tanpa diolah.** Keputusan user,
dan itu yang membedakan lapisan ini dari sekadar pipa.

## 4. Daftar "dikenal" — empat, dan kenapa pendek itu poin

Frekuensi diukur ulang 2026-08-03 dari `wrapper.log` keenam bot, jendela 30 hari
(sejak 2026-07-04). Angka `/hari` berarti seluruh armada.

| Slash Telegram | Jadi apa | 30 hari | Seumur hidup |
|---|---|---|---|
| **`/rename <nama>`** | `/rename <nama>` | **3,87/hari** (116) | 347 |
| **`/new <nama>`** | `[/clear, /rename <nama>]` | **1,70/hari** (51) | 260 |
| **`/switch`** | picker → `/resume <id>` | **0,17/hari** (5) | 131 |
| **`/context`** | tidak ke CC — baca statusline | tak terukur | tak terukur |

**Yang TIDAK masuk, dengan alasannya:**

| Dicoret | Alasan |
|---|---|
| `/effort` | **0 dalam 30 hari**, 11 seumur hidup. Command yang paling banyak memakan kerja di sistem lama — picker, `confirmAfterMs`, entri slash-guards — untuk sesuatu yang praktis tidak dipakai lagi |
| `/delete` | Butuh picker + daftar sesi, dan risikonya tidak simetris: salah tap menghilangkan sesi |
| `/version`, `/help`, `/start` | Diagnostik dan onboarding. User satu-satunya pengguna dan sudah paired |

**Kenapa daftar pendek itu poin, bukan kekurangan:** setiap entri butuh kode yang
dirawat. Yang di luar daftar **tetap bisa dipakai** lewat jalur konfirmasi §5 —
mencoret sesuatu dari daftar tidak menghilangkan kemampuannya, hanya menambah
satu tap. **Daftarnya boleh pendek justru karena ada jaring pengamannya.**

Menu di restoran tidak perlu memuat semua yang dapurnya bisa masak.

### 4.1 `/rename` ada di dua dunia — dan itu harus diputuskan, bukan diwarisi

Waktu user mengetik `/rename x` di Telegram, ada dua jalur yang mungkin: dicegat
lapisan ini lalu diolah, atau diteruskan mentah ke CC. **Hari ini keduanya
menghasilkan efek yang sama**, jadi bedanya tidak akan pernah terlihat — sampai
salah satunya perlu berbeda.

Sistem lama sudah memilih diam-diam: `tryRouteMetaCommand` mencegat `/rename`
lebih dulu, jadi **versi Telegram selalu menang** dan versi CC tidak pernah
tercapai dari HP. Itu sebabnya `/rename` sistem lama bisa menolak nama duplikat —
validasi itu milik lapisan Telegram, bukan CC.

**Keputusan: sama, tapi sadar.** `/rename` masuk daftar dikenal, dicegat lapisan
ini, dan lapisan ini yang memutuskan apa saja yang berlaku (mis. penolakan nama
duplikat). Ditulis di sini supaya penyunting berikutnya tahu ada dua pintu, dan
tahu pintu mana yang sengaja ditutup.

## 5. Jalur konfirmasi untuk yang tidak dikenal

Slash yang tidak ada di daftar §4 **tidak langsung disuntik**. Bot mengirim satu
pesan berisi command persisnya, dengan dua tombol:

```
Kirim `/compact` ke Claude Code?
  [ ✅ Kirim ]  [ ❌ Batal ]
```

**Kenapa bukan langsung teruskan:** keputusan user. Dan ada dasarnya di luar
selera — sebagian slash CC **interaktif** (memunculkan picker atau konfirmasi),
dan injeksi yang membukanya lalu berhenti meninggalkan TUI menggantung. Wrapper
lama mencatat satu insiden nyata dari kelas ini (`/new idle` disuntik ke CC,
7 Juni). Satu tap adalah harga yang murah untuk tidak mengulangnya secara
otomatis, setiap hari.

**Kenapa bukan tolak saja:** karena kemampuan "jalankan slash CC apa pun dari HP"
adalah yang user minta, dan menolak berarti tiap command baru butuh kode.

**Yang belum diputuskan:** apakah konfirmasi diingat per-command (sekali
disetujui, seterusnya langsung). Belum ada datanya soal seberapa mengganggu satu
tap itu — dan menebaknya sekarang berarti membangun fitur untuk keluhan yang
belum ada.

## 6. Kontrak dengan wrapper

Lapisan ini menulis berkas JSON ke
`<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/pending/`, bentuknya sudah
ada dan sudah diimplementasikan di `cc-wrapper/src/inbox.ts`:

| Bentuk | Artinya |
|---|---|
| `{"command": "/rename x"}` | satu perintah |
| `[{"command":"/clear"},{"command":"/rename x"}]` | batch, dienqueue berdampingan |
| `{"command":"/effort high","confirmAfterMs":500}` | perintah + Enter kedua |

Penulisan harus **atomik** (tulis `.tmp` lalu rename), karena wrapper membaca
folder itu dengan polling dan berkas setengah tertulis akan ditolak sebagai JSON
rusak.

**Lapisan ini tidak boleh tahu apa pun tentang PTY, jeda, atau urutan
keystroke.** Itu milik wrapper.

## 7. Yang belum diukur — dinyatakan, bukan disembunyikan

1. **Berapa sering slash yang tidak dikenal akan dipakai.** Tidak ada datanya:
   di sistem lama jalur ini tidak pernah ada, jadi tidak ada yang bisa dihitung.
2. **Apakah satu tap konfirmasi terasa mengganggu.** Belum ada keluhannya karena
   fiturnya belum ada (§5).
3. **Berapa banyak slash CC yang interaktif** — yang membuka picker dan
   menggantung kalau disuntik tanpa jawaban. Yang diketahui pasti baru `/effort`.
4. ~~**`/context` butuh apa persisnya di sistem baru.** Sistem lama membacanya
   dari `last-status.json` yang ditulis jembatan statusline; sistem baru punya
   statusline sendiri, dan isinya belum dibandingkan.~~
   **⚠️ DIKOREKSI 2026-08-04 — teks asli disimpan supaya koreksinya bisa
   ditelusuri.** Anak kalimat *"sistem baru punya statusline sendiri"* **keliru**:
   `grep -rn -i "statusline|status_line|last-status"` atas seluruh `mirza-bots`
   mengembalikan **nol kode** (hanya satu komentar dan satu baris README), dan
   `bot-uji` **tidak punya `.claude/settings.json` sama sekali**. Sistem baru
   tidak punya statusline apa pun, jadi "membandingkan isinya" bukan pekerjaan
   yang tertunda — ia pekerjaan yang tidak punya objek. Yang sesungguhnya perlu
   diputuskan: bagaimana sistem baru **menampung** payload yang sama tanpa
   menggusur statusline milik user. Jawabannya di
   `2026-08-04-context-telegram-design.md`.
5. **Apakah `/switch` butuh daftar sesi bernama.** Sistem baru menyimpan id sesi
   (`sessions/<bot>.id`) tapi belum menyimpan namanya — celah #2 di audit.

## 8. Keputusan user lewat brainstorming (2026-08-03)

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| Slash Telegram diteruskan mentah ke CC? | **Tidak — diolah dulu** | Lapisan ini bukan pipa |
| Yang tidak dikenal diapakan? | **Teruskan, tapi konfirmasi tombol dulu** | Daftar dikenal boleh pendek |
| Lapisan olahnya di mana? | **`cc-plugin`** | Ia yang menerima pesan dan menulis ke `pending/` |
| "Natively bisa jalankan command apa pun" | **Maksudnya di level `cc-wrapper`** | Bukan di level Telegram — dikoreksi user |
| Daftar dikenal | **usulan: 4** (`/rename`, `/new`, `/switch`, `/context`) | Menunggu review user |
