# State Per-Folder Bot — Keputusan Arsitektur

**Tanggal:** 2026-08-04 · **Ditulis:** bot-03
**Status:** **keputusan user sudah diambil**; belum punya spec teknis maupun
rencana implementasi
**Lahir dari:** percakapan yang sama yang menghasilkan
`2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md`

---

## 1. Keputusan

**Seluruh state pindah ke folder masing-masing bot. Tidak ada yang bersama.**
`~/.claude/mirza-bots/` hilang seluruhnya — termasuk `conversations.db`, yang
sebelumnya dipertahankan terpusat.

Ide "folder `bot-shared`" yang sempat diusulkan user **dibatalkan oleh user
sendiri** di percakapan yang sama.

### Kriteria yang membingkai keputusan ini

> *"Saya ingin proses instalasi serta struktur yang mudah dipelajari orang
> lain."* — user, 2026-08-04

Ini bukan hiasan; ia **penentu**, dan menjelaskan kenapa argumen teknis soal
riwayat terpusat kalah. Sesuatu mudah dipelajari kalau orang bisa **menebak di
mana barangnya** tanpa membaca dokumen. Satu folder per bot yang memuat
segalanya bisa ditebak; state yang tersebar antara folder kerja dan folder
tersembunyi di `~/.claude/` tidak.

---

## 2. Bentuk yang diusulkan

```
workspace/<nama-bot>/
├── .claude/            sesi Claude Code (sudah ada)
├── config.json         token + allowFrom + timezone bot INI
├── conversations.db    riwayat percakapan bot INI
├── session.id          id sesi CC terbaru      (dulu sessions/<bot>.id)
├── status.json         tangkapan statusline    (dulu status/<bot>.json)
├── bot.pid             pemegang token          (dulu locks/<bot>.pid)
├── inbox/              berkas & gambar masuk
└── logs/               session-hook.log
```

**Penyederhanaan yang muncul gratis dari keputusan ini:** hari ini `locks/`,
`sessions/`, dan `status/` harus berupa **folder** semata-mata karena isinya
perlu dibedakan milik bot mana. Begitu tiap bot punya foldernya sendiri, nama
bot sudah dijawab oleh nama folder — jadi ketiganya menyusut menjadi **tiga
berkas datar** yang terlihat begitu folder dibuka. Empat subfolder menjadi dua.

---

## 3. Apa yang sudah dikerjakan hari ini sebagai persiapan

Keduanya sudah ter-merge dan ter-push, dan keduanya **mengurangi permukaan yang
harus dipindahkan**:

- **`fleet.db` dibuang seluruhnya** (`3451037`). Empat tabel spekulatif nol
  baris/nol rujukan, lalu tabel terakhirnya (`bot_inbox`) ternyata ikut mati
  bersama daemonnya — kode sendiri yang mengatakannya dalam kalimat lampau.
- **Parameter `bot` dibuang** dari `read_history` dan `search_history`
  (`18b04fd`). Ia menjanjikan sesuatu yang tidak bisa diberikan begitu tiap bot
  memegang berkasnya sendiri.

Sesudah keduanya, isi `~/.claude/mirza-bots/` tinggal: `config.json`,
`conversations.db`, `inbox/`, `locks/`, `sessions/`, `status/`, `logs/`.

---

## 4. Yang perlu diubah

| Berkas | Perubahan |
|---|---|
| `engine/paths.ts` | seluruh path berpangkal pada **folder bot**, bukan `stateRoot()`. `stateRoot()` sendiri kemungkinan hilang |
| `engine/config.ts` | `config.json` tidak lagi memuat daftar `bots`; ia konfigurasi **satu** bot. `botCount`, `resolveBotFromCwd`, dan validasi lintas-bot ikut berubah bentuk |
| `engine/engine.ts` | identitas bot tidak lagi dicari dengan mencocokkan cwd ke daftar `home` — cwd **adalah** botnya |
| `engine/doctor.ts` | melaporkan satu bot, bukan armada |
| `hooks/session-start.ts` | menulis `session.id` di folder bot; hook menerima `cwd`, jadi tidak perlu daftar |
| `bin/statusline-bridge.ts` | menulis `status.json` di folder bot |
| `engine/telegram/poller.ts` | `inbox/` relatif folder bot |
| `MIRZA_BOTS_HOME` | env var ini kemungkinan **hilang** — ia ada untuk memindahkan state root, dan tidak ada lagi state root |

### Migrasi data yang sudah ada

`conversations.db` sekarang memuat 137 baris untuk `mirza_01_bot` plus 1 baris
nyasar milik `bot-01`. Pemecahannya sepele karena hanya ada satu bot nyata:
salin berkasnya ke folder bot, hapus baris milik bot lain. **Kolom `bot` di
tabel `messages` menjadi redundan** — biarkan dulu atau buang bersama migrasi;
keputusan itu belum diambil.

---

## 5. Keberatan yang saya ajukan, dan kenapa gugur

**Dicatat supaya sesi berikutnya tidak mengangkatnya ulang sebagai penemuan
baru.**

Saya berkeberatan pada satu hal: **riwayat percakapan** sebaiknya tetap terpusat,
karena ia menjawab pertanyaan *"apa yang terjadi?"* — dan pertanyaan itu hampir
selalu lintas-bot. Contohnya yang disepakati dua jam sebelumnya di percakapan
yang sama: *"kenapa bot ini tiba-tiba mengerjakan X?"* dijawab oleh rantai
`reply_to` yang menyeberang antar-bot; riwayat yang terpecah memutus rantai itu
di perbatasan.

**Keberatan itu gugur oleh pengukuran, dan yang mengukurnya saya sendiri:**

```
bot-01           1 baris   (1 Agustus saja, percobaan awal)
mirza_01_bot   136 baris   (1-4 Agustus)
```

Lintas-bot **belum pernah benar-benar terjadi** di sistem baru. Jadi saya
menahan sesuatu yang user inginkan **sekarang** demi kasus yang **belum ada** —
persis pola yang BACKLOG ini hukum berulang kali. Keberatannya dicabut.

**Konsekuensi yang tetap berlaku dan bukan keberatan, hanya informasi:** kalau
suatu saat bot perlu membaca riwayat bot lain, ia harus membuka berkas di folder
tetangga. Itu keputusan baru pada saatnya, bukan alasan menahan yang sekarang.

---

## 6. Yang belum diputuskan

- Apakah kolom `bot` di tabel `messages` dibuang atau disimpan sebagai jejak.
- Apakah `logs/` cukup satu berkas di folder bot, atau ikut naik ke permukaan.
- Bagaimana `agent-registry.json` (siapa-bot-apa, milik `agent-bus`) hidup di
  dunia tanpa state bersama — ini bersinggungan langsung dengan
  `2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md`, dan **dua keputusan
  ini harus dibuat sadar-satu-sama-lain**.

## 7. Catatan yang tidak masuk keputusan ini

Prosedur rilis plugin (naikkan versi di dua berkas → `marketplace update` +
`plugin update` → **restart**, dan kegagalannya diam) adalah bagian yang paling
sulit dipelajari dari sistem ini sekarang. **User menyatakan itu perkara
development, bukan bagian dari kesederhanaan yang sedang dikejar** — audiensnya
berbeda. Dicatat di sini supaya tidak dicampur ke spec ini, bukan supaya
dilupakan.
