# Status kapabilitas `mirza-bots` — apa yang sudah ada, dan siapa yang membuktikannya

- **Tanggal:** 2026-08-01
- **Konteks:** disusun setelah Tahap 2.5-MASUK selesai dan diuji live sebagian di
  PC Windows. Diminta user: *"tuliskan listing apa saja yang SUDAH kita develop,
  tandai juga itu sudah saya konfirmasi (dalam ujicoba langsung) dan belum."*
- **Versi saat disusun:** `fleetd` 0.2.0, `cc-plugin` 0.3.0

## Kenapa tiga tanda, bukan dua

Permintaannya biner (sudah dikonfirmasi / belum), tapi menjawabnya biner akan
menyesatkan: ia menyamakan *"user melihatnya bekerja di Telegram"* dengan *"tidak
ada bukti sama sekali"*, padahal di antara keduanya ada *"lulus unit test tapi
belum pernah menyentuh Telegram"* — tingkat keyakinan yang berbeda jauh.

| Tanda | Arti |
|---|---|
| ✅ | **User mengonfirmasi langsung** di Telegram |
| 🧪 | **Hanya diverifikasi eksekutor** — unit test atau pemeriksaan teknis. User belum melihatnya |
| ⬜ | **Belum diverifikasi siapa pun** |

Alasan pembedaan ini bukan kehati-hatian berlebihan, melainkan preseden nyata
proyek ini sendiri: **457 test hijau sementara `answerCallbackQuery` hilang di
produksi.** 🧪 bukan ✅.

## ⚠️ Pembaruan 2026-08-02 — daemon dibubarkan

`fleetd` **tidak ada lagi**, sebagai paket maupun sebagai proses. Engine-nya
hidup di dalam `cc-plugin` 0.4.0, satu proses per sesi Claude Code. Spec:
`docs/superpowers/specs/2026-08-02-penyatuan-engine-fleetd-design.md`.

Baris di bawah yang menyebut daemon, socket, atau antrean offline **tetap
ditulis apa adanya sebagai catatan sejarah** — dicoret akan menghapus jejak
bahwa hal-hal itu pernah terbukti bekerja, dan itu justru bagian dari alasan
membubarkannya terasa aman.

### Yang diverifikasi hidup pada arsitektur baru (2026-08-02, `bot-uji`)

| | Kapabilitas | Bukti |
|---|---|---|
| ✅ | Engine menyala **tanpa daemon apa pun** | PID 58112 menjalankan `cc-plugin/0.4.0/src/main.ts`; tidak ada proses `fleetd` di mesin |
| ✅ | Kunci satu-penarik-per-token diklaim saat start | `locks/bot-uji.pid` = `58112`, cocok persis dengan PID prosesnya |
| ✅ | Pesan Telegram masuk, lolos allowlist, tersimpan | Baris `"Hello bro"` @ `2026-08-02T02:15:33Z` di `conversations.db` |
| ✅ | Database tetap **yang lama dan terpusat**, bukan salinan baru | Baris baru berdampingan dengan riwayat 2026-08-01 di berkas yang sama |
| ✅ | Atribusi sesi jalan lewat jalur baru | `session_id` = `f850dfd0-…`, berbeda dari sesi kemarin |
| ✅ | Notifikasi sampai ke sesi Claude Code | Dikonfirmasi user langsung: pesannya muncul sebagai giliran baru |
| ✅ | Balasan keluar (`reply`), termasuk yang bertombol | Screenshot user 2026-08-02 09:37: pesan bertombol 1-4 mendarat di Telegram |
| ✅ | Konvensi tombol bernomor (U-5) dipatuhi | Tombol `1 2 3 4` datang berikut daftar bernomornya di badan pesan, plus jalan keluar `✏️ Jelasin manual`. **Catatan jujur:** tidak bisa dibedakan apakah AI patuh sejak awal atau sempat ditolak lalu memperbaiki — penolakan tidak tersimpan di mana pun (W-19 dari sisi lain) |
| ✅ | **Keyboard dicopot setelah ditap (U-2)** | Screenshot user 2026-08-02 09:43 — **kali pertama U-2 menyentuh Telegram sungguhan.** Tombol hilang seluruhnya, `→ 🌋 Gunung Merapi` menempel di AKHIR, dan daftar bernomor + emoji + paragraf aslinya utuh (entities dikirim ulang; tanpa itu format terhapus diam-diam) |
| ✅ | Penekanan tombol tersimpan, tepat satu baris | id 34 @ 02:42:55Z, teks persis `🌋 Gunung Merapi` — cocok dengan opsi 3, tanpa duplikat. Urutannya terbukti benar: baris tersimpan **sebelum** keyboard diedit, jadi penolakan edit dari Telegram tidak bisa menghilangkan tap-nya |
| 🧪 | Penekanan tombol tidak punya `message_id` | `message_id = null` di baris 34. Bukan kerusakan hari ini — terbawa dari desain lama — tapi berarti sebuah tap **tidak bisa di-quote atau ditelusuri** lewat riwayat belakangan. Dicatat untuk 2.5-KELUAR |
| ⬜ | Riwayat & pencarian dari tool MCP | Belum diuji |
| ✅ | **Perilaku saat `/clear`** | **Risiko terbuka terakhir di spec §10, sekarang tertutup.** Diukur 2026-08-02: `/clear` **tidak** me-restart proses MCP — PID tetap 58112, berkas kunci tidak bergerak, dan pesan berikutnya (`"tes setelah clear"`, id 35 @ 02:55:06Z) masuk dan muncul di sesi. Tidak ada jendela bisu. **Efek samping terukur:** `session_id` ikut tidak berubah, jadi baris sesudah `/clear` distempel id sesi lama — W-20 |
| ⬜ | Sesi kedua mengambil alih token | Belum diuji |

## Tahap 1 — Fondasi

| | Kapabilitas |
|---|---|
| 🧪 | Config deklaratif (`allowFrom` + daftar bot + token) |
| ✅ | `fleetd` menyala sebagai daemon |
| ✅ | `doctor` melaporkan status (`ok: true`, versi, tabel, kesiapan db) |
| 🧪 | `fleet.db` — `sessions`, `handoffs`, `injections`, `bot_inbox`, `incidents` |
| ✅ | `conversations.db` + indeks FTS5 + 3 trigger sinkronisasi (terbukti tersinkron 12/12 di data sungguhan) |
| ✅ | Unix socket + protokol `hello` / `doctor` / `reply` |

## Tahap 2 — Jalur pesan dasar

| | Kapabilitas |
|---|---|
| ✅ | Poller Telegram per bot |
| ✅ | Pesan teks masuk → tersimpan → sampai ke AI |
| ✅ | Tap tombol (`callback_query`) + spinner berhenti |
| 🧪 | Gate allowlist — **belum pernah diuji dengan pengirim non-allowlist** |
| 🧪 | Foto tunggal diunduh otomatis |
| 🧪 | Antrean offline (`bot_inbox`) — `bot_inbox` selalu 0 baris, jadi jalurnya tidak pernah benar-benar terpakai |
| ✅ | Tool `reply` (teks + tombol) |
| ✅ | Protokol terse-turn (B-9) |

## Tahap 2.5-MASUK

### Akar penyimpanan (Task 2)

| | Kapabilitas |
|---|---|
| ✅ | `message_id` tersimpan |
| ✅ | `reply_to` tersimpan |
| ✅ | `metadata` tersimpan |
| ✅ | `session_id` tersimpan — terisi di **seluruh** 12 baris data sungguhan |

### Quote-reply masuk (Task 3, TG-111)

| | Kapabilitas |
|---|---|
| ✅ | Kutip seluruh pesan → `quote_text` + `reply_to_message_id` |
| ✅ | Kutip seleksi sebagian → `quote_is_manual: true` |
| ✅ | Kutip pesan bot sendiri — teksnya sampai; id-nya belum resolve ke riwayat karena balasan bot baru disimpan di 2.5-KELUAR (**sesuai rancangan**) |

### Toleransi unduhan per-item (Task 4, TG-105)

| | Kapabilitas |
|---|---|
| 🧪 | Satu unduhan gagal tidak menjatuhkan seluruh pesan |
| 🧪 | Semua unduhan gagal → pesan tetap sampai, tanpa lampiran |
| 🧪 | Token bot tidak bocor ke baris log kegagalan |

### Pengerasan album (Task 5)

| | Kapabilitas |
|---|---|
| 🧪 | Cap 10 item di atas dua cap waktu |
| 🧪 | Urutan `message_id` menaik, bukan urutan tiba (SCAR-055a) |
| 🧪 | Tiga aturan caption (0 / 1 apa adanya / 2+ berlabel `Photo <n>`) |
| 🧪 | Pemberitahuan kegagalan sebagian dan total |
| ⬜ | Album 3 foto sungguhan lewat Telegram |
| ⬜ | Album >10 foto sungguhan (harus jadi **dua** pesan) |

### Dokumen (Task 6)

| | Kapabilitas |
|---|---|
| 🧪 | Unduh dokumen sampai 20 MB |
| 🧪 | `safeName()` — menutup tag-breakout (TG-108/SCAR-088) **dan** path-escape |
| 🧪 | Penolakan >20 MB **dengan** pemberitahuan, bukan diam |
| ⬜ | Kirim PDF / `.md` sungguhan lewat Telegram |
| ⬜ | Kirim dokumen >20 MB sungguhan |

### Riwayat (Task 7)

| | Kapabilitas |
|---|---|
| ✅ | `read_history` — navigasi di sekitar sebuah `message_id` |
| ✅ | `search_history` — pencarian kata kunci lewat FTS5 |
| ✅ | Default ke bot pemanggil — tidak membocorkan bot lain |
| ⬜ | Menyeberang ke bot lain lewat parameter `bot` — **tidak bisa diuji di mesin ini, hanya ada satu bot** |

### Rilis (Task 8)

| | Kapabilitas |
|---|---|
| ✅ | `cc-plugin` 0.3.0 terpasang dan aktif |
| ✅ | `fleetd` 0.2.0 berjalan (dibuktikan lewat versi di `doctor`) |
| ✅ | Migrasi database berjalan di data sungguhan |

### Portabilitas Windows (Task 0)

| | Kapabilitas |
|---|---|
| ✅ | `fleetd` jalan di Windows — **K-14 tidak perlu ditinjau ulang** |
| 🧪 | 116 test `fleetd` + 27 test `cc-plugin` hijau |
| ✅ | Perbaikan W-4 — baris `listening` tidak lagi berbohong |

## Rekapitulasi

**26 ✅ · 15 🧪 · 6 ⬜**

**Polanya jelas dan layak diperhatikan:** semua yang menyangkut **teks dan
riwayat** sudah dibuktikan user sendiri. Semua yang menyangkut **lampiran** —
foto, album, dokumen — masih 🧪: lulus unit test, belum pernah dilihat sampai ke
Telegram. Di situlah risiko terbesar yang tersisa terkonsentrasi.

## Sudah diketahui belum ada (bukan gagal — memang belum dibangun)

| Hal | Rumahnya |
|---|---|
| Format markdown pada balasan (CommonMark→MarkdownV2) | 2.5-KELUAR, item pertama |
| Quote arah keluar (TG-077) | 2.5-KELUAR |
| Chunking pesan panjang | 2.5-KELUAR |
| Logging balasan bot ke `conversations.db` (TG-081) | 2.5-KELUAR |
| Stop hook di `cc-plugin` (**W-10**) | Kemungkinan 2.5-GUARD — **paling mendesak** |
| Keyboard dicopot setelah ditap (**U-2**) | Belum ditentukan |
| Buttons terlalu sering muncul (**U-1**) | Plugin `inline-buttons`, marketplace lama |
| Orientasi timezone (**U-4**) | Belum ditentukan |
