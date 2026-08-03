# cc-wrapper — Mengendalikan TUI Claude Code dari Luar

**Tanggal:** 2026-08-03 · **Penyusun:** bot-02 (estafet dari bot-01)
**Status:** disepakati bersama user lewat brainstorming, belum punya rencana
implementasi
**Menggantikan:** `plugins/pty-controller/wrapper/` (sistem lama, 1363 baris
`wrapper.ts` + 8 modul)

---

## 1. Kenapa dokumen ini ada

Sesi ini ditugasi mengukur apakah celah #4 (system-outbox) berdiri sendiri atau
menggantung pada celah #6 (wrapper PTY). Jawabannya: **menggantung** — dan
pengukurannya membuka bahwa pertanyaan sebenarnya bukan *"kapan wrapper
dibangun"* melainkan *"wrapper barunya bentuknya apa"*. Rinciannya di
`docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` §8.

User meminta wrapper **didefinisikan ulang**, bukan disalin: sistem lama tumbuh
organik dari bug ke bug, dan tidak pernah ada yang bertanya *"kalau ditulis dari
nol hari ini, bentuknya apa?"* Penyaring proyek ini kalimat user sendiri:
*"sistem yang lebih optimal dan sederhana."*

### 1.1 Dua kosakata yang tidak boleh tertukar

Dokumen ini memakai istilah berikut secara ketat, karena keduanya sempat
tertukar dua kali selama brainstorming:

| Istilah | Artinya |
|---|---|
| **slash CC** | Slash command milik Claude Code (`/clear`, `/rename`, `/compact`) |
| **slash Telegram** | Slash command milik lapisan Telegram (`/new`, `/switch`, `/delete`) — CC tidak mengenalnya |
| **hook CC** | Fitur bawaan Claude Code: skrip yang **CC jalankan** saat kejadian tertentu (`SessionStart`, `Stop`, `UserPromptSubmit`) |
| **pre-check / post-check** | Rancangan dokumen ini: pemeriksaan sebelum dan sesudah sebuah slash CC disuntik |

Dokumen ini **hanya** membahas slash CC. Pemetaan slash Telegram ke slash CC
adalah pekerjaan lapisan atas dan bukan lingkup di sini.

## 2. Tujuan

**cc-wrapper adalah lapisan low-level murni: ia mampu menyuntikkan slash CC apa
pun yang bentuknya sah, dan tidak menyimpan daftar putih.**

Kalimat itu adalah keputusan user, dan konsekuensinya:

- Batasan *"command mana yang boleh"* naik ke lapisan atas — terpisah dari
  mekaniknya. Sekarang keduanya bercampur: `slash-guards.ts` duduk di dalam
  tool-nya sendiri, jadi mengubah kebijakan berarti menyentuh mekanik.
- **Bisa** dan **boleh** jadi dua hal berbeda. Setir bisa membawa ke mana saja;
  rambu yang menentukan ke mana boleh. Menaruh rambu di dalam setir membuat
  keduanya sulit diubah.

### 2.1 Yang TIDAK dikerjakan sekarang

- **Session management sebagai fitur.** User memutuskan ini ditunda sampai
  wrapper benar-benar menguasai TUI. `/new` → `[/clear, /rename <nama>]` tetap
  jadi contoh yang membentuk desain, tapi pemetaannya milik lapisan atas.
- **Membuang kata "mirza" dari seluruh sistem.** Disepakati akan dikerjakan,
  tapi bukan sekarang. Tiga tempat kena: perintah `mirza-cc`, repo
  `mirza-bots`, folder state `~/.claude/mirza-bots/`. Yang ketiga paling mahal
  — semua bot menunjuk ke sana.

## 3. Kenyataan yang membentuk desain ini

### 3.1 TUI bukan API — dan ini batas, bukan kekurangan desain

Menyuntik ke TUI berarti **mengetik keystroke**, bukan memanggil fungsi. Tidak
ada nilai balik. Wrapper tidak pernah tahu command-nya berhasil, gagal, atau
tersangkut — ia hanya tahu *"sudah saya ketik"*.

Analogi yang dipakai sepanjang brainstorming dan terbukti berguna: **wrapper
adalah tukang ketik buta yang bisa meraba meja.** Ia tidak melihat layar, tapi
bisa meraba beberapa benda untuk tahu apa yang sudah terjadi. **Jeda waktu
adalah tebakan; rabaan adalah bukti.**

### 3.2 TUI membuang input diam-diam — tiga korban terukur

Ini bukan risiko teoretis. Komentar `wrapper.ts:220-234` dan
`injection-gate.ts` mencatat tiga kejadian nyata (BUG #3, 2026-06-07):

| Korban | Akibat |
|---|---|
| `/rename idle` (bot-02) | tertelan → sesi tidak bernama |
| `/clear` (bot-03) | hilang seluruhnya → idle-creep |
| prompt handoff agent-bus | dimakan di tengah `/clear` |

Polanya satu: **keystroke yang mendarat selagi CC membangun ulang sesi dibuang
tanpa pemberitahuan.** Plus satu kelas kedua: satu tulisan panjang ke ConPTY
membuang **kepala** pesan dan menyisakan ekornya (`prompt-inject.ts`).

**Konsekuensi desain:** wrapper baru tidak boleh menganggap "sudah diketik" =
"sudah mendarat".

### 3.3 Umur sesi = umur bot

Sejak daemon `fleetd` dibubarkan (2026-08-02, merge `f4f0f77`), tidak ada lagi
proses yang hidup mandiri. `cc-plugin` adalah **engine dua arah yang menumpang
hidup di sesi CC**: satu proses menjalankan poller Telegram (arah masuk) dan
melayani MCP lewat stdio (arah keluar) — `main.ts`. CC mati → poller mati → bot
bisu.

Karena itu wrapper bukan lagi kenyamanan. Ia satu-satunya hal yang membuat bot
selamat dari sesi yang crash atau terminal yang tertutup.

### 3.4 Satu token, satu pembaca — aturan Telegram yang tidak bisa ditawar

`cc-plugin/src/engine/lock.ts` mencatatnya: dua poller pada satu token **tidak
menghasilkan error**; Telegram membagi pesan di antara keduanya secara acak.
Gejalanya terbaca sebagai *"bot kadang-kadang mendengar"*, bukan sebagai
kesalahan restart.

**Konsekuensi desain:** bagi wrapper, "menyalakan ulang sesi" tidak cukup
dengan spawn proses baru — ia butuh **bukti proses lama sudah mati** lebih dulu.
Ini kandidat post-check, dan **belum diukur** berapa lama jeda matinya.

## 4. Arsitektur — empat lapis

```
┌─ Lapisan atas (BUKAN lingkup dokumen ini) ─────────────────┐
│  kebijakan "boleh": daftar command, picker sesi,           │
│  pemetaan slash Telegram → array slash CC                  │
└────────────────────────┬───────────────────────────────────┘
                         │  file: pending/
┌────────────────────────▼───────────────────────────────────┐
│  Lapis 2 — eksekusi per-command (data, bukan class)        │
│  { nama, preCheck?, postCheck?, confirmAfterMs? }          │
├────────────────────────────────────────────────────────────┤
│  Lapis 1 — mekanik PTY (sama untuk semua command)          │
│  spawn · antre · ketik→jeda→Enter · potong teks panjang    │
└──┬──────────────────────────────────────────────────┬──────┘
   │ baca: fakta sesi (hook CC), statusline           │ tulis: system-outbox/
   ▼ Lapis 3 — sumber bukti                           ▼ Lapis 4 — pelaporan
```

### 4.1 Lapis 1 — mekanik PTY

Yang **sama untuk semua command**, jadi tinggal di wrapper:

| Mekanisme | Angka | Kenapa tidak bisa naik ke atas |
|---|---|---|
| Jeda ketik → Enter | 250 ms | Sifat autocomplete TUI: `text + \r` satu tulisan membuat picker menelan Enter-nya. Berlaku untuk setiap command |
| Potong teks panjang | 100 code point / 30 ms | Sifat buffer ConPTY. Dipotong pada code point (bukan UTF-16) supaya surrogate pair emoji tidak terbelah |
| Antrean injeksi | jarak minimum | **Ini yang paling tidak bisa naik**, dan alasannya struktural — lihat §4.1.1 |

#### 4.1.1 Kenapa serialisasi harus dipegang wrapper

Jarak antar-injeksi bukan jarak antar-*command*, melainkan antar-**pengirim**.
Telegram, agent-bus, dan AI-nya sendiri bisa memerintah bersamaan, dan **tidak
satu pun dari mereka tahu yang lain ada**. Kalau jaraknya diserahkan ke
pemanggil, dua pemanggil yang sama-sama sopan tetap bertabrakan karena
masing-masing hanya menghitung dirinya sendiri.

Batas kecepatan bisa ditulis di rambu tiap jalan; **siapa jalan duluan di
persimpangan** tidak bisa diserahkan ke tiap sopir.

#### 4.1.2 Aturan pemisah, satu pertanyaan

> **"Kalau saya menambah command baru, apakah saya perlu memikirkan angka ini?"**

Perlu → lapisan atas. Tidak → wrapper.

**Utang yang ditemukan saat membongkar:** `POST_INJECTION_DELAY_MS` (1000 ms)
sekarang melayani **dua maksud yang tidak berhubungan** — jeda rantai
post-`/clear` dan jeda sebelum menulis event outbox. Satu angka untuk dua
tujuan berarti mengubah salah satunya merusak yang lain. **Di wrapper baru
dipisah jadi dua.**

### 4.2 Lapis 2 — eksekusi per-command, berbentuk data

Tiap command yang butuh perlakuan khusus jadi satu entri:

```
{ nama, preCheck?, postCheck?, confirmAfterMs? }
```

**Default: tidak terdaftar → ketik + Enter, selesai.** Ini keputusan user, dan
alasannya terukur: mayoritas slash CC tidak mengubah keadaan sesi, jadi tidak
punya apa pun untuk ditunggu.

**Data, bukan class hierarchy.** Dengan hierarchy, menambah command berarti
menambah file; dengan data, menambah satu baris. Dan hierarchy memaksa struktur
ke 100% command padahal yang membutuhkannya sedikit.

**`postCheck` hanya punya satu bentuk:**

> *"tunggu sampai bukti X muncul, atau menyerah setelah N detik"*

Satu bentuk itu sudah menutup seluruh kasus wrapper lama. Kalau nanti muncul
kebutuhan yang tidak muat, baru diperluas — saat itu ada contoh nyata, bukan
bayangan.

**Yang sengaja TIDAK dibangun:** pre/post-check yang bisa menjalankan apa saja
(mis. memotret console lewat Playwright). Idenya diangkat user sendiri lalu
ditarik sendiri dengan alasan yang benar. Aturan proyek ini berlaku dua arah:
ukur juga alasanmu untuk **membangun**. **Jangan "perbaiki" ini diam-diam.**

#### 4.2.1 Bentuk ini sudah terbukti, bukan usulan baru

Dua hal di sistem lama sudah memakainya:

- **`confirmAfterMs`** — `/effort` memunculkan picker konfirmasi; nilai 500 ms
  mengirim `\r` kedua untuk menerimanya (`meta-commands.ts:504`). Itu **data
  per-command**, dan sudah ditulis oleh lapisan atas, bukan oleh wrapper.
- **Batch `commands: [...]`** — maksimum 8 item, ditulis sebagai **satu** file
  pending, dienqueue berdampingan sehingga tidak ada payload lain menyelip
  (`batch.ts`). Alur handoff antar-bot memakainya setiap hari:
  `["/rename done-…", "/clear", "/rename idle"]`.

**Koreksi terhadap catatan sebelumnya:** `/effort` **bukan** command yang tidak
bisa disuntik. Ia diblokir hanya di jalur AI (`slash-guards.ts`), sementara
jalur Telegram berhasil menyuntiknya. Kelas "command interaktif" karenanya bukan
tembok — ia sudah punya jawaban berbentuk data.

#### 4.2.2 Array bukan sekadar loop

`/clear` lalu `/rename <nama>` **tidak boleh** diketik berurutan dengan jeda
tetap: `/clear` melahirkan sesi baru, dan `/rename` harus mendarat **sesudah**
sesi itu ada. Terlalu cepat → mendarat di sesi lama atau hilang.

Jadi sebuah item batch bisa **wajib menunggu bukti** sebelum item berikutnya
boleh jalan. Itulah `postCheck`, dan itulah kenapa ia bagian dari kontrak batch,
bukan hiasan.

### 4.3 Lapis 3 — sumber bukti

**Sinyal yang terbukti ada di mesin ini** (dibaca dari hooks yang terpasang,
bukan dari dokumentasi): `SessionStart`, `UserPromptSubmit`, `Stop`,
`PreToolUse` — plus statusline dan file sesi `.jsonl`.

Hasil pencocokan ke enam tebakan wrapper lama: **tiga bisa naik jadi bukti,
tiga tidak bisa.**

| Sekarang menebak | Jadi bukti lewat |
|---|---|
| Poll folder tiap 500 ms menunggu sesi baru | **`SessionStart`** — menyala pada `/clear` dan **membawa `session_id`** sekalian |
| `CLEAR_SETTLE_MS` 1500 ms | ikut hilang: sesi baru mengabarkan dirinya sendiri |
| `MIN_INJECTION_GAP_MS` 1500 ms | **`UserPromptSubmit` + `Stop`** — aturannya berubah dari *"tunggu 1,5 detik"* jadi *"jangan mengetik selagi giliran berjalan"* |

| Tetap tebakan | Kenapa tidak bisa |
|---|---|
| Jeda ketik → Enter 250 ms | apakah picker autocomplete masih terbuka |
| Potong 100 char / 30 ms | apakah buffer ConPTY sudah lega |
| `confirmAfterMs` 500 ms | apakah picker konfirmasi sudah terender |

**Polanya:** ketiga yang tersisa adalah soal **apa yang sedang terjadi di dalam
TUI, antara keystroke masuk dan layar berubah**. Hook CC berbicara tentang
siklus hidup percakapan (sesi mulai, giliran mulai, giliran selesai), bukan
tentang render. Ini **batas, bukan celah yang bisa ditutup**.

> Kalimat yang harus dibawa: **wrapper baru bisa berhenti menebak soal SESI,
> tapi tetap harus menebak soal LAYAR.**

#### 4.3.1 Hook CC netral, dipakai bersama

**Keputusan user:** satu paket hook CC netral menulis fakta sesi ke satu file;
wrapper, plugin, dan agent-bus sama-sama membacanya.

Alasannya bukan kerapian melainkan pengurangan: **duplikasi itu sudah ada
sekarang** — wrapper mengintip folder sesi tiap 500 ms **dan** `cc-plugin` punya
hook `SessionStart` sendiri, keduanya untuk mengetahui hal yang sama. Fakta
"sesi berganti" bukan milik salah satu dari mereka.

Satu sifat hook CC yang membuat ini bekerja: **hook adalah proses terpisah yang
CC jalankan sendiri**, bukan bagian dari proses MCP. Header
`cc-plugin/hooks/session-start.ts` mencatat kenapa ia sengaja tidak mengimpor
apa pun selain `node:` — versi sebelumnya yang mengimpor modul engine **tidak
pernah menyala**, dan *"a hook that looked installed and guarded nothing"*
disebut sebagai bentuk bug paling mahal di proyek ini.

Praktisnya: hook tetap menyala walau proses MCP sedang mati. Itu yang membuatnya
sah jadi sumber bukti bagi wrapper tanpa menyeret wrapper bergantung pada
plugin.

**Aturan yang diwarisi dari kegagalan itu: hook baru mengimpor `node:` saja.**

#### 4.3.2 Statusline: bukti, tapi bukti yang lemah

Statusline (`last-status.json`) adalah sumber nama sesi paling segar, tapi
`captured_at_ms` adalah **waktu tangkap, bukan waktu isi** — komentar
`session-state.ts:106-116` menyebut jebakan ini eksplisit, termasuk "snapshot
post-`/clear` yang meracuni" (sid baru dipasangkan dengan nama lama). Wrapper
baru boleh memakainya, tapi tidak boleh memperlakukannya setara hook.

### 4.4 Lapis 4 — pelaporan

**Keputusan user:** kalau `postCheck` gagal, **user diberi tahu lewat Telegram**.

Alasannya: post-check yang gagal tanpa penerima hanya menghasilkan baris log
yang tidak dibaca — hasilnya sama persis dengan sekarang. **Menyadari tapi diam
tidak lebih baik daripada tidak menyadari.**

**Keputusan user (mekanisme):** wrapper **menitip file**, tidak mengirim
sendiri. Wrapper tetap bodoh soal Telegram; ia menaruh event di
`system-outbox/`, dan `cc-plugin` yang benar-benar mengirim. Alasan yang
diberikan user: mempertahankan loose coupling yang sudah ada.

Kanal ini **sudah hidup**: 692 event sepanjang hidup keenam bot lewat jalur ini
(diukur 2026-08-03), semuanya bertipe `session-change`. Yang bertambah hanya
satu tipe event baru.

#### 4.4.1 Kelemahan yang ternyata sudah ada obatnya

Kekhawatiran yang wajar: plugin hidup di dalam sesi, jadi kalau sesi mati —
persis keadaan yang paling perlu dilaporkan — pembacanya ikut mati.

**Terperiksa, kekhawatiran itu jauh lebih ringan dari dugaan.** `server.ts:2147`
menjalankan **sweep tiap 2 detik** yang membaca **seluruh isi folder**, bukan
hanya `fs.watch`. Event yang menumpuk selagi sesi mati **tidak hilang** — sweep
pertama sesi berikutnya menemukan semuanya. Laporannya bukan hilang, melainkan
**telat sampai bot pulih**.

Dan yang menyalakan sesi lagi adalah wrapper itu sendiri. Jadi selama wrapper
bekerja, laporannya sampai. Yang benar-benar tidak tertutup hanya kasus sesi
yang **tidak pernah** hidup lagi — dan itu berarti wrapper-nya yang mati, bukan
kanalnya yang gagal.

**Dua syarat yang dibawa ke implementasi:**

1. **Plugin wajib menyapu folder saat start**, bukan hanya `fs.watch`. Kalau
   hanya watch, berkas yang sudah ada sebelum plugin menyala tidak akan terlihat
   — dan justru berkas itulah yang paling penting.
2. **Perlu batas ketika menumpuk.** Sesi mati semalaman berarti tumpukan event,
   lalu banjir pesan sekaligus begitu bot menyala. Bentuk peringkasannya belum
   diputuskan.

## 5. Yang dibuang dari sistem lama

| Yang dibuang | Alasan |
|---|---|
| `probe.ts`, `interactive.ts`, `auto-clear.ts` | Tiga skrip PoC/demo dari fase eksperimen, bukan kode produksi (±200 baris) |
| Mirror `current_session_id` / `current_session_name` | Duplikat `wrapper.state.json`, ditulis hanya untuk pembaca agent-bus versi lama |
| Poll folder sesi tiap 500 ms | Digantikan hook `SessionStart` (§4.3) |
| `slash-guards.ts` di dalam wrapper | Naik ke lapisan atas — ini kebijakan, bukan mekanik |

**Yang TIDAK boleh dibuang tanpa penggantinya lebih dulu ada:** serialisasi
injeksi. Ia lahir dari tiga korban nyata (§3.2), dan menghapusnya berarti
mengundang ketiganya kembali.

## 6. Yang belum diukur — dinyatakan, bukan disembunyikan

Daftar ini ada supaya yang menulis rencana implementasi tidak menebak, dan
supaya tidak ada taksiran yang menyamar jadi fakta:

1. **Berapa banyak slash CC yang butuh entri khusus.** Yang diketahui pasti
   hanya tiga (`/clear`, `/rename`, `/effort`) karena ketiganya ada di kode.
   Berapa dari seluruh slash CC — belum dihitung.
2. **Berapa lama proses lama benar-benar mati saat restart sesi**, yang
   menentukan post-check untuk aturan satu-poller-per-token (§3.4).
3. **Apakah `Stop` + `UserPromptSubmit` cukup untuk menyimpulkan "CC sedang
   sibuk"** dalam semua keadaan — mis. saat CC menunggu izin tool, bukan
   menunggu AI.
4. **Bentuk peringkasan ketika event menumpuk** (§4.4.1 syarat 2).
5. **Biaya penuh mengganti nama** `~/.claude/mirza-bots/` (§2.1).

## 7. Referensi

| Berkas | Perannya di sini |
|---|---|
| `plugins/pty-controller/wrapper/src/wrapper.ts` | Sumber seluruh inventarisasi §3–§5 |
| `plugins/pty-controller/wrapper/src/injection-gate.ts` | Tiga korban BUG #3 (§3.2) |
| `plugins/pty-controller/wrapper/src/batch.ts` | Kontrak batch + `confirmAfterMs` (§4.2.1) |
| `plugins/telegram/server.ts` | Pembaca `system-outbox`, sweep 2 detik (§4.4.1) |
| `plugins/telegram/meta-commands.ts` | Sepuluh command yang dicegat lapisan Telegram |
| `mirza-bots/cc-plugin/hooks/session-start.ts` | Pelajaran hook yang "terpasang tapi tidak menjaga apa-apa" (§4.3.1) |
| `mirza-bots/cc-plugin/src/engine/lock.ts` | Satu token satu poller (§3.4) |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` §8 | Koreksi terukur celah #4 yang melahirkan dokumen ini |

## 8. Keputusan user lewat brainstorming (2026-08-03)

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| Wrapper membatasi command? | **Tidak — suntik apa pun yang sah** | Daftar putih naik ke lapisan atas |
| Bentuk lifecycle per-command | **Data, bukan class** | Menambah command = menambah satu baris |
| Default command tak terdaftar | **Ketik + Enter, tanpa menunggu** | Yang butuh perlakuan didaftarkan; sisanya polos |
| Kalau `postCheck` gagal, siapa diberi tahu? | **User, lewat Telegram** | Wrapper butuh kanal keluar |
| Wrapper kirim sendiri atau menitip? | **Menitip file** | Loose coupling dipertahankan; wrapper tetap bodoh soal Telegram |
| Siapa pemilik hook CC? | **Paket netral, dipakai bersama** | Menghapus duplikasi wrapper-vs-plugin yang sudah ada |
| Session management sekarang? | **Ditunda** | Sampai wrapper menguasai TUI |
| Nama paket | **`cc-wrapper`** | Konsisten dengan `cc-plugin` |
| Buang kata "mirza"? | **Ya, tapi nanti** | Tiga tempat; folder state paling mahal |
