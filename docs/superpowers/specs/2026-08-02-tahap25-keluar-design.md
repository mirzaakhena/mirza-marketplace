# Tahap 2.5-KELUAR — Design

**Tanggal:** 2026-08-02
**Status:** disepakati user lewat brainstorming; belum ada rencana implementasi
**Repo kode:** `mirza-bots` (satu paket: `cc-plugin` 0.4.0)
**Mendahului:** 2.5-GUARD, lalu Tahap 3
**Bergantung pada:** `2026-08-02-penyatuan-engine-fleetd-design.md` (sudah mendarat)

---

## 1. Ruang lingkup

Empat item, ditulis **urut ketergantungan**, bukan urut kepentingan.

| # | Item | Kenapa di urutan ini |
|---|---|---|
| 0 | Identitas sesi dibaca, bukan dipotret | Item 1 menstempel `session_id` ke baris baru; kalau nilainya salah, item 1 melipatgandakan barisnya |
| 1 | Balasan keluar disimpan, berikut `message_id`-nya | Item 2 butuh `message_id` balasan agar bot bisa mengutip pesannya sendiri |
| 2 | Bot bisa mengutip pesan | Bergantung pada item 1 untuk separuh kasusnya |
| 3 | CommonMark → MarkdownV2, selalu | Berdiri sendiri; boleh dikerjakan kapan saja |

## 2. Prinsip yang mengatur seluruh tahap ini

**Sebelum menambah satu baris pun ke teks yang meminta AI mengingat sesuatu,
tanyakan: bisakah mesin langsung MELAKUKANNYA?**

Ini bukan slogan. Ini ringkasan bukti dari proyek ini sendiri:

| Aturan | Ditegakkan bagaimana | Hasilnya |
|---|---|---|
| U-5, tombol bernomor | engine **menolak** kirim | tidak pernah bocor lagi |
| wajib membalas ke Telegram | Stop hook **memblokir** | tidak pernah bocor lagi |
| ack sebelum tool call | **diingatkan** tiap giliran | tetap bocor, 2026-08-02 |
| markdown | **diingatkan** lewat flag `format` | bocor; user melihat `**bintang**` mentah |

Dua baris terakhir diingatkan **setiap giliran** oleh hook `UserPromptSubmit`
sistem lama — mekanisme paling agresif yang tersedia — dan tetap bocor. Jadi
"ingatkan lebih keras" bukan jawabannya.

**Konsekuensi langsung untuk spec ini:** item 3 tidak memakai flag.

## 3. Item 0 — identitas sesi dibaca, bukan dipotret

### Masalahnya

`cc-plugin/src/main.ts` membaca `CLAUDE_CODE_SESSION_ID` **sekali**, saat proses
dinyalakan. `/clear` **tidak** menyalakan ulang proses MCP. Jadi sesudah
`/clear`, pesan baru distempel id sesi yang secara konsep sudah tidak ada.

Terukur 2026-08-02 dari kedua sisi:

| sisi | nilai |
|---|---|
| Claude Code, layar `Status` sesudah `/clear` | `2ef5b4c5-db87-4655-9d19-cd41193013cb` |
| engine, baris 35 sesudah `/clear` | `f850dfd0-5e11-4ce3-adc5-d0ab1bb9d0c1` |

### Kenapa ini bukan utang yang boleh ditunda

**Kolom kosong berkata "tidak tahu". Kolom yang salah berkata "tahu, ini
jawabannya" — dan jawabannya keliru.** Yang kedua tidak akan pernah membuat
siapa pun curiga, karena dari luar ia terlihat normal.

Itu kelas yang sama dengan **W-4**: baris `fleetd listening on …` yang tetap
tercetak padahal bind-nya gagal. Bukan data yang hilang, melainkan **data yang
berbohong dengan percaya diri**. Proyek ini sudah membayar kelas itu sekali.

Dan **item 1 memperburuknya**: begitu balasan keluar ikut disimpan, kedua sisi
transkrip membawa id yang salah, bukan hanya sisi masuk.

### Bentuk perbaikannya

Ubah dari **potret** menjadi **bacaan**:

- Tambah hook `SessionStart` ke `cc-plugin/hooks/hooks.json` (berkas itu sudah
  ada, dipakai penjaga balasan — ini bukan mekanisme baru untuk paket ini).
- Hook menulis id sesi terbaru ke satu berkas kecil di bawah state root.
- Engine membaca berkas itu **saat hendak push**, bukan sekali saat start.

Sistem lama memakai bentuk yang sama: `plugins/telegram/hooks/hooks.json` punya
`SessionStart`, dan `current-session-info.ts` membaca id sesi dari berkas yang
ditulis wrapper — bukan dari env proses MCP-nya sendiri.

**Belum terverifikasi:** apakah `SessionStart` benar-benar menyala pada `/clear`
(bukan hanya pada pembukaan sesi). **Itu hal pertama yang diuji**, sebelum kode
apa pun ditulis — kalau ternyata tidak menyala, seluruh item 0 butuh bentuk lain
dan lebih baik ketahuan lebih dulu.

**Kalau ternyata tidak bisa:** alternatif yang jujur adalah **berhenti
menstempel** dan membiarkan kolomnya NULL, karena "tidak tahu" lebih benar
daripada "tahu, dan salah".

## 4. Item 1 — balasan keluar disimpan

### Masalahnya

Seluruh `conversations.db` hanya memuat `source='user'` — 32 dari 32 baris saat
diperiksa. Jalur `reply` tidak menyimpan apa pun.

Akibatnya `read_history` dan `search_history` menyajikan **transkrip sepihak**:
AI dapat membaca ulang apa yang user katakan, tapi tidak apa yang ia sendiri
jawab. Untuk sesi yang sudah di-`/clear` bedanya besar — ia bisa mengingat
pertanyaannya tanpa mengingat jawabannya.

**Ini regresi terhadap sistem lama**, bukan fitur yang belum sempat dibangun:
`plugins/telegram/messages-store.ts` menyimpan `source: 'assistant' | 'system'`
berikut jalur `OutboundLogInput` khusus untuk itu. Kolom `source` di skema baru
sudah menyediakan tempatnya sejak awal; yang hilang hanya pemanggilnya.

### Bentuknya

Setelah `bot.api.sendMessage` **berhasil**, simpan barisnya dengan
`source: "assistant"`.

**Load bearing: sesudah, bukan sebelum.** `message_id` balasan baru ada di
jawaban Telegram. Menyimpan lebih dulu berarti menyimpan baris tanpa `message_id`
— yang menghapus separuh gunanya (item 2 tidak bisa mengutipnya) — dan mencatat
pesan yang mungkin tidak pernah terkirim.

Kegagalan penyimpanan **tidak boleh** membatalkan pengiriman: pesannya sudah
sampai ke user, dan melempar galat sesudah itu membuat AI mengira gagal lalu
mengirim ulang.

## 5. Item 2 — bot bisa mengutip

### Fundamentalnya

Untuk mengutip, Telegram butuh `message_id` pesan yang dikutip. Jadi "bisa
mengutip atau tidak" sebenarnya pertanyaan **"`message_id`-nya tersimpan atau
tidak"** — dan jawabannya terbelah dua:

| Mengutip | Bisa? | Alasannya |
|---|---|---|
| pesan **user** | **sudah bisa hari ini** | `message_id` masuk sudah disimpan (mis. baris 33, `msg_id=89`) |
| pesan **bot sendiri** | belum | butuh item 1 |

### Bentuknya

Tool `reply` menerima parameter opsional yang menunjuk pesan yang dikutip, dan
meneruskannya ke Telegram saat mengirim.

**Peringatan U-3, dan ini wajib ada di deskripsi tool-nya:** AI **tidak boleh
pernah meminta `message_id` ke user.** User tidak pernah melihat id itu. Kalau
AI tidak punya id-nya, ia meminta user **mengutip** pesannya — kutipan membawa
id-nya sendiri.

**Batas yang sudah diketahui:** penekanan tombol tidak punya `message_id`
(terukur: baris 34 `message_id = null`), jadi sebuah tap **tidak bisa dikutip**.
Perilaku ini terbawa dari desain lama. Diputuskan saat mengerjakan item ini:
diberi id, atau diterima dan didokumentasikan.

## 6. Item 3 — CommonMark → MarkdownV2, selalu

### Kenapa ada

MarkdownV2 mewajibkan setiap `.` `-` `(` `)` `!` `+` di luar markup di-escape
backslash, atau Telegram menolak pesannya dengan HTTP 400. Konverter ini
membebaskan AI dari mengingat aturan itu: AI menulis markdown biasa, mesin yang
mengurus.

### Ongkosnya kecil

Konverter sistem lama (`plugins/telegram/markdown.ts`) **20 baris** — pembungkus
tipis atas package npm `telegramify-markdown` — dengan **13 test**. Jadi item ini
bukan "membangun konverter markdown", melainkan **menambah satu dependency dan
memindahkan 20 baris**.

### Selalu, tanpa flag

Sistem lama memakai parameter `format` yang harus disebut AI tiap kali. Kalau
lupa, `**bintang**` tampil mentah — dan itu persis yang user lihat di layarnya.

Keputusan user 2026-08-02: **selalu konversi.** Alasannya §2 — flag adalah
"diminta ke AI lewat teks", dan bukti bocornya sudah ada.

**Konsekuensi yang diterima:** AI yang hendak mengirim `**` harfiah harus
meng-escape-nya sendiri. Kasus langka, dan parser markdown sungguhan menanganinya
dengan benar (teks harfiah tetap harfiah, blok kode tetap utuh).

## 7. Yang TIDAK ada di tahap ini

- **Menumpangkan lebih banyak instruksi ke preamble `[protocol: terse-turn]`.**
  Diusulkan user 2026-08-02 dan **ditolak sebagai jawaban umum**, bukan karena
  buruk melainkan karena eksperimennya sudah berjalan: sistem lama menyuntik
  pengingat tiap giliran lewat hook `UserPromptSubmit`, dan dua aturan yang
  dititipkan di sana tetap bocor pada hari yang sama. Preamble adalah tempat
  untuk aturan yang **tidak bisa** dijamin mesin — bukan tempat menaruh semua
  aturan agar terlihat lengkap. Setiap barisnya juga dibayar **tiap giliran,
  selamanya**, dan satu baris tajam terbaca sementara delapan baris menjadi
  wallpaper.
- **Menegakkan ack-sebelum-tool lewat hook.** Bentuknya jelas (PreToolUse yang
  memblokir tool call pertama bila belum ada balasan sejak pesan masuk) dan ia
  memang kandidat kuat — tapi ia milik 2.5-GUARD, bukan jalur keluar.
- **W-18** (sesi bisa lebih tua dari perbaikannya) dan **W-15** (identitas dari
  cwd). Keduanya hidup di BACKLOG Bagian 7.

## 8. Keputusan user (brainstorming 2026-08-02)

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Balasan keluar perlu disimpan? | **Perlu** | Item 1; alasannya bukan kerapian melainkan item 2 |
| Bot perlu bisa mengutip? | **Perlu** | Item 2 |
| `session_id` basi termasuk concern? | **Ya** — diangkat user setelah saya meremehkannya | Item 0, didahulukan |
| Markdown: selalu atau pakai flag? | **Selalu** | Item 3 tanpa parameter `format` |
