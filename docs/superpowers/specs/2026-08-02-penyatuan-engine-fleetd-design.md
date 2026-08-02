# Penyatuan Engine `fleetd` ke `cc-plugin` — Design

**Tanggal:** 2026-08-02
**Status:** disepakati user lewat brainstorming, belum ada rencana implementasi
**Repo kode:** `mirza-bots` · **Repo dokumen:** `mirza-marketplace`
**Menggantikan:** rencana "auto-start `fleetd` dari `cc-plugin`" (usul bot-01,
2026-08-01) — dibatalkan sebelum ditulis satu baris pun
**Menyentuh:** spec `2026-07-27-fleet-harness-rebuild-design.md` §3, §4.1, §5
(pembagian `fleetd`/`bot-cc`/`cc-plugin`)

---

## 1. Keputusan

**`fleetd` berhenti menjadi daemon.** Isinya turun pangkat menjadi library yang
di-import `cc-plugin`, dan poller Telegram jalan di dalam proses MCP server milik
tiap sesi Claude Code.

**Seluruh state tetap terpusat** di `~/.claude/mirza-bots/`. Yang dibubarkan
adalah prosesnya, bukan pemusatannya — perbedaan ini load-bearing, lihat §4.

## 2. Kenapa berubah

Sesi 2026-08-01 berakhir dengan usul: `cc-plugin` menyalakan `fleetd` sendiri
bila belum berjalan, supaya user tidak pernah menjalankannya manual. Saat usul
itu dibahas, user mengajukan pertanyaan yang lebih dalam: **kenapa `fleetd` harus
proses terpisah sama sekali?**

Menelusurinya sampai dasar, alasan yang benar-benar keras tinggal satu:

> **Telegram hanya mengizinkan satu konsumen `getUpdates` per token.** Dua proses
> menarik token yang sama → `409 Conflict`, dan pesan terbagi acak di antara
> keduanya.

Harus ada tepat satu pemegang token. Pertanyaannya cuma: **pemegang itu hidup
selama apa?**

**Argumen "pemusatan" ternyata tidak menuntut daemon.** K-5 menuntut *satu
salinan aturan*, dan itu dipenuhi oleh **satu package** — bukan satu proses. Satu
package yang di-load 6× bukan 6 salinan yang menyimpang; itulah bedanya dengan
sistem lama yang aturannya benar-benar disalin per plugin.

Yang benar-benar hilang kalau disatukan cuma dua, dan user menerima keduanya
secara sadar:

- Bot hanya hidup selama ada sesi Claude Code terbuka.
- Dua sesi di bot yang sama harus diatur, karena keduanya membawa poller.

Yang **tidak** hilang: pesan tidak lenyap. Telegram menahan update yang belum
diambil hingga 24 jam, jadi begitu sesi berikutnya terbuka semuanya turun.
Karena itu antrean offline `bot_inbox` menjadi tidak perlu.

## 3. Bukti — syaratnya sudah terpenuhi di produksi

Sebelum menyetujui, satu syarat harus dibuktikan: **apakah proses MCP di Claude
Code cukup awet untuk menampung poller yang jalan terus-menerus?**

Jawabannya tidak perlu uji sintetis. **Sistem lama sudah melakukannya persis**,
dan sedang berjalan di mesin ini:

- `mirza-marketplace/plugins/telegram/server.ts` menjalankan `new Bot(TOKEN)` +
  long polling grammy **di dalam proses MCP server-nya** (`:137`, `:2167`).
- Diukur 2026-08-02 pukul ~00:30 WIB:

| bot | PID | bot id | uptime |
|---|---|---|---|
| bot-01 | 35096 | 8674860971 | 18,0 jam |
| bot-02 | 18328 | 8745792917 | 18,4 jam |
| bot-03 | 16192 | 8926694543 | 18,4 jam |
| bot-04 | 40780 | 8805996311 | 18,4 jam |
| bot-05 | 31072 | 8777548282 | 18,4 jam |
| bot-06 | 10540 | 8669172404 | 18,4 jam |

**Enam poller, enam token berbeda, enam proses `bun` terpisah, semuanya hidup
18 jam tanpa daemon apa pun.** Arsitektur yang dirancang di dokumen ini bukan
lompatan ke sesuatu yang belum pernah dicoba — ia adalah pola yang sudah
berjalan setiap hari, dipindahkan ke sistem baru.

**Konsekuensi angka ini:** enam token yang berbeda tidak pernah bertabrakan.
`409` hanya mungkin terjadi antara dua penarik **token yang sama**. Kunci di §5
karena itu bercakupan sempit — satu bot, bukan seluruh armada.

## 4. Arsitektur

**Sebelum:** satu daemon memegang semua koneksi Telegram, database, dan antrean;
tiap sesi menyambung ke sana lewat unix socket dan meminta lewat protokol
baris-JSON.

**Sesudah:** tiap sesi Claude Code menjalankan satu proses `cc-plugin` yang
berisi poller + akses database langsung + tool MCP + hooks. Tidak ada socket,
tidak ada daemon, tidak ada proses yang harus dinyalakan lebih dulu.

**Yang TIDAK berubah — pemusatan state.** Semua tetap di satu tempat:

```
~/.claude/mirza-bots/
  config.json          satu config untuk seluruh armada (token, allowlist, timezone)
  conversations.db     satu riwayat lintas bot, FTS utuh
  fleet.db
  inbox/<bot>/         media
  locks/<bot>.pid      BARU — lihat §5
  logs/
```

Ini yang membedakan desain ini dari sistem **lama**, yang state-nya tercecer per
folder bot (`<bot>/.claude/channels/telegram/` masing-masing punya `access.json`,
`messages.db`, `bot.pid`, `inbox/` sendiri). Pola tercecer itu **ditolak
eksplisit** oleh user. Yang dipinjam dari sistem lama hanya *mekanik*-nya, bukan
tata letaknya.

**Perbedaan yang harus dipegang saat implementasi:** dulu satu proses memegang
database; sekarang N proses membukanya bersamaan. Lihat §7.

## 5. Kunci satu-penarik-per-token

**Masalah yang dijaga:** satu bot, dua penarik. Dua sumbernya:

1. User membuka dua sesi Claude Code di folder bot yang sama.
2. Sesi mati tidak wajar (terminal ditutup paksa, proses di-kill) dan poller-nya
   menjadi yatim tapi **masih memegang token**. Sesi berikutnya kena `409`
   selamanya, dan dari luar tampak seperti "botnya rusak" tanpa penjelasan.

Sumber kedua bukan hipotesis — komentar `server.ts:99-102` di sistem lama
menuliskannya sebagai kejadian nyata, berikut tambalannya.

**Mekanik:** file PID per bot di `~/.claude/mirza-bots/locks/<bot>.pid`. Saat
start, proses membaca file itu; kalau ada PID yang masih hidup dan bukan dirinya,
ia **mengambil alih** — mengirim sinyal berhenti ke pemegang lama, lalu menulis
PID-nya sendiri.

**Keputusan user: sesi terbaru menang.** Alasannya: yang biasanya dimaksud user
adalah sesi yang baru saja ia buka; opsi sebaliknya membuat ia mengetik ke sesi
yang ternyata bisu tanpa tahu kenapa.

**Diangkat dari sistem lama, bukan ditulis baru.** `server.ts:99-120` sudah
memuat mekanik ini utuh dan terbukti lapangan. Yang berubah cuma lokasi
file-nya: terpusat di `locks/`, bukan tersebar di folder tiap bot.

**Jujur soal ongkosnya:** kunci ini adalah biaya yang **lahir dari** keputusan
menyatukan. Selama `fleetd` ada, masalah ini tidak pernah ada — satu daemon
berarti satu penarik, otomatis, tanpa mekanisme apa pun. Kita menukar "ada daemon
yang harus diurus" dengan "ada kunci yang harus diurus". Tukar yang bagus (kunci
hanya berjalan saat start; daemon harus dinyalakan, diawasi, direstart, dan bisa
mati diam-diam) — tapi bukan tukar yang gratis.

## 6. Apa yang dibuang, diangkat, dipakai

Angka baris dari pengukuran 2026-08-02 (`wc -l`, kode produk, tanpa test).

**Dibuang (±750 baris):**

| Berkas | Baris | Alasan |
|---|---|---|
| `fleetd/src/socket/protocol.ts` | 115 | tidak ada socket lagi |
| `fleetd/src/socket/server.ts` | 133 | idem |
| `fleetd/src/socket/registry.ts` | 44 | idem |
| `fleetd/src/db/bot-inbox.ts` | 24 | Telegram sendiri yang menahan 24 jam |
| `cc-plugin/src/fleetd-client.ts` | 178 | seluruh client socket |
| bagian `fleetd/src/main.ts` yang melayani request socket | ±250 (taksiran) | `handleHistoryRequest`, `handleSearchRequest`, dan pemasangan handler-nya jadi panggilan fungsi biasa |

**Diangkat dari sistem lama:** kunci PID + pembunuh pemegang basi. Di
`plugins/telegram/server.ts` mekaniknya hanya **±22 baris** (`:99-120`); dengan
path terpusat, penanganan `locks/` yang belum ada, dan test-nya, taksirannya
±60 baris di sistem baru.

**Dipakai apa adanya (±1.100 baris, tidak disentuh):** `telegram/poller.ts` (304),
`db/conversations-schema.ts` (219), `db/fleet-schema.ts` (72),
`telegram/album-buffer.ts` (51), `telegram/media.ts` (49), `telegram/quote.ts`
(42), `telegram/allowlist.ts` (5), `config.ts` (47), `time.ts` (45), `paths.ts`
(38), `doctor.ts` (32), berikut `normalizeMessage`, `buildAlbumMessage`,
`buildTappedMessageEdit`, `findMissingButtonNarration` (U-5), dan
`deliverIncoming` di `main.ts`.

**Ditulis baru:** menyambungkan tool MCP langsung ke library alih-alih lewat
socket — ±100 baris ubahan di `cc-plugin/src/server.ts`.

**Ini pencopotan lapisan, bukan penulisan ulang.** Mayoritas 1.882 baris `fleetd`
adalah logika Telegram dan database yang tidak peduli siapa yang memanggilnya.

**Bonus yang ikut hilang:** test e2e sekarang harus menyalakan dua proses dan
menunggu socket siap. Itu sumber langsung **W-1, W-2, W-6, W-8** dan flake
**W-12**. Satu proses membuat kelima temuan itu tidak relevan lagi — bukan
ditambal, tapi tidak punya tempat untuk terjadi.

## 7. Database dibuka banyak proses

Dulu hanya `fleetd` yang membukanya. Sekarang sampai 6 proses sekaligus.

- **WAL sudah aktif** di keduanya (`conversations-schema.ts:68`,
  `fleet-schema.ts:69`), jadi baca-tulis paralel antar-proses memang sudah
  didukung. Ini terverifikasi, bukan asumsi.
- **`busy_timeout` harus ditambahkan.** Tanpa itu, dua tulis yang berbarengan
  membuat yang kalah langsung menyerah alih-alih menunggu, dan muncul sebagai
  galat acak yang sulit dilacak. Kecil, tapi wajib.

## 8. Kegagalan harus terdengar

**Aturan desain:** tidak ada jalur kegagalan yang boleh berakhir dengan plugin
menghilang tanpa pesan.

Ini bukan tambahan opsional — ia menutup **W-16**, kelas kegagalan yang paling
mahal di proyek ini (~2 jam pada 2026-08-01, akar tidak pernah ditemukan).
Bentuk W-16: `await client.connect()` di tingkat atas `main()` menolak, `main()`
melempar, prosesnya keluar, dan **tidak ada satu pesan pun** yang sampai ke user.

**Penyatuan menghapus sebagian besar W-16 secara struktural** — tidak ada
handshake `hello`, tidak ada socket yang bisa ditolak, jadi seluruh jalur
kegagalan itu lenyap. Yang tersisa adalah kegagalan config:

- cwd tidak terdaftar di `config.json` → plugin **tetap hidup**, dan setiap tool
  yang dipanggil menjawab dengan pesan yang bisa dibaca manusia, menyebut daftar
  bot yang terdaftar.
- `config.json` rusak/ber-BOM (SCAR-026) → sama: hidup, dan menyebutkan
  penyebabnya.

**Kenapa bukan sekadar log:** satu-satunya keluhan yang berulang di proyek ini
selalu berbentuk sama — **diam yang tidak bisa dibedakan dari rusak**. Log tidak
menutup itu, karena tidak ada yang membacanya sebelum curiga.

## 9. Yang belum diputuskan

- **Nama.** Kalau `fleetd` bukan daemon lagi, akhiran `d` berbohong. Diputuskan
  saat menulis rencana implementasi, bukan sekarang.
- **W-15** — identitas bot dari cwd. Penyatuan tidak menyelesaikannya, tapi
  mengubah bentuknya: bentrok dua sesi kini dijaga kunci §5, bukan lagi fan-out
  registry. Baris BACKLOG-nya perlu ditulis ulang, bukan ditutup.
- **`bot-cc` (Tahap 4).** Alasan terbesarnya adalah "menyalakan `fleetd` bila
  belum berjalan" (spec lama §5 baris 102). Alasan itu hilang. Sisa perannya
  (injeksi PTY) tetap sah, tapi ruang lingkupnya menyusut dan harus dinilai ulang.
- **Celah "`fleetd` mati di tengah jalan"** yang tercatat di BACKLOG Bagian 0
  ikut gugur bersama daemonnya — perlu dicoret, bukan dibawa.

## 10. Risiko

| Risiko | Kenapa dinilai kecil | Kalau salah |
|---|---|---|
| Proses MCP tidak cukup awet | Terukur: 6 proses, 18 jam, produksi | Kembali ke daemon; tidak ada yang hilang selain waktu |
| Bot bisu saat tidak ada sesi terbuka | Diterima sadar oleh user; Telegram menahan 24 jam | — |
| Tabrakan tulis SQLite antar-proses | WAL sudah aktif; `busy_timeout` ditambahkan | Galat acak saat tulis berbarengan |
| Ambil-alih token menghentikan sesi lama | Perilaku sistem lama saat ini; dipilih user | — |

**Yang belum terbukti dan harus diuji sebelum dinyatakan selesai:** perilaku saat
`/clear` — apakah proses MCP dimulai ulang, dan kalau ya, apakah pengambilalihan
kuncinya mulus. Sistem lama hidup dengan ini, tapi belum pernah diukur langsung.

## 11. Keputusan user (brainstorming 2026-08-01/02)

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Umur `fleetd` bila dinyalakan plugin | Tetap hidup (detached) | *Gugur* — pertanyaan berikutnya membatalkan seluruh jalur daemon |
| `fleetd` mati di tengah jalan | Plugin mengawasi + restart | *Gugur* bersama daemonnya |
| Satukan atau tetap terpisah | **Satukan** | Dokumen ini |
| State ikut disatukan ke folder bot? | **Tidak — tetap terpusat** | §4; membedakan desain ini dari sistem lama |
| Dua sesi di bot yang sama | **Sesi terbaru menang** | §5 |
