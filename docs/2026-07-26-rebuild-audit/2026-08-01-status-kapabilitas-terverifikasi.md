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
