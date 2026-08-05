# Hitung Ulang Celah Migrasi — Apa yang MASIH Tersisa, 2026-08-05

**Tanggal:** 2026-08-05 · **Penyusun:** bot-02 (estafet dari bot-03)
**Menghitung ulang:** `2026-08-02-celah-migrasi-bot-harian.md` (20 baris celah)
**Dipicu oleh:** Langkah 4 handoff `202608051620` — *"dari daftar itu, apa yang
MASIH tersisa hari ini?"* — dan disetujui user lewat inline button.

**Ini dokumen hitung ulang, bukan rencana.** Tidak ada satu baris kode pun
diubah. Urutan pengerjaan tetap hak user.

---

## 0. Keputusan user yang mengubah bentuk pertanyaannya

> **"Saya prefer tidak ada migrasi data. Saya mau mulai bersih dari nol."**
> — user, 2026-08-05 09:31 WIB

Ini bukan detail teknis; ini **memotong seluruh sisi masalah**. Selama ini
"migrasi bot harian" terbaca sebagai memindahkan barang — riwayat `messages.db`,
`session-names.json`, state sesi. Semua itu **keluar dari daftar**. Yang tersisa
satu pertanyaan yang jauh lebih sempit:

> **Fitur apa yang bot harian dipakai tiap hari, yang sistem baru belum punya?**

Konsekuensi langsung: empat baris di tabel asli **dicoret** (§3), dan
`~/.claude/mirza-bots/` (pertanyaan terbuka #3 di BACKLOG) kehilangan alasan
terakhirnya untuk dipertahankan — skrip migrasi state yang belum pernah
dijalankan itu kini tidak akan pernah dijalankan.

---

## 1. Cara menghitungnya

Dua meteran, dan **sengaja dua** karena dokumen 2026-08-02 membuktikan satu
meteran bisa berbohong dengan meyakinkan (`/switch` terbaca 0× padahal 139×):

| Meteran | Untuk menjawab | Cakupan |
|---|---|---|
| Baca kode `mirza-bots` HEAD `0c6578d` | apakah kapabilitasnya ADA | `cc-plugin/src`, `cc-wrapper/src` |
| `messages.db` ×6 (readonly) + `wrapper.log` ×6 | seberapa sering fitur yang MASIH hilang benar-benar dipakai | seumur hidup + jendela 30 hari |

⚠️ **Batas yang dinyatakan, bukan disembunyikan:** ini hitung ulang dari
**membaca kode dan mengukur log**, **bukan uji hidup**. Lihat §5.

---

## 2. Hasil: dari 20 baris, 11 sudah ketutup

Diperiksa langsung ke kode, bukan disalin dari dokumen lain.

| # | Celah asli | Status hari ini | Bukti di kode |
|---|---|---|---|
| 1 | Indikator typing | ✅ **ADA** | `engine/typing.ts`; `engine.ts:496` `sendChatAction(chatId,"typing")` |
| 2 | Nama sesi + `/rename` | ✅ **ADA** | `engine/slash/map.ts:24`; terverifikasi hidup 7/7 (0.13.0) |
| 3 | Chunking balasan panjang | ✅ **ADA** | `engine/chunk.ts` — `TELEGRAM_MAX_CHARS=4096`, `chunkRaw()`, penjahit ulang fence ``` |
| 4b | Push proaktif tanpa pesan masuk | ✅ **ADA** | W-27, `cc-plugin` 0.15.0 — fallback `conversations.db`; terverifikasi hidup |
| 5 | Antar-bot | ✅ **ADA** | tool `agent_send` + `agent_list` (`server.ts:213`, `:250`); terverifikasi hidup |
| 6 | Wrapper spawn + resume | ✅ **ADA** | `cc-wrapper/src/startup.ts` — `--continue`, bukan `--resume <id>` (alasannya ditulis di sana) |
| 7 | Kirim lampiran keluar | ✅ **ADA** | `engine/attach.ts`; param `files` di tool `reply` (`server.ts:152`) |
| 8 | `/new` + `/clear` dari Telegram | ✅ **ADA** | `map.ts:34` — `/new` → batch `[/clear, /rename <nama>]` |
| 11 | Prasyarat `/handoff` | ✅ **ADA** | rantai #5 → #6 → #2 lengkap. Alur ujung-ke-ujung belum diuji di sistem baru |
| 14 | `/context` | ✅ **ADA** | `engine/context/`; `slash/index.ts:92` |
| — | Quote-reply masuk & keluar | ✅ **ADA** | sudah tercatat di §3 dokumen 2026-08-02 |

## 3. Empat baris DICORET oleh keputusan "mulai bersih dari nol"

| # | Celah asli | Kenapa dicoret | Angka |
|---|---|---|---|
| 13 | `/goal` | **0 hit** di `wrapper.log` keenam bot | 5× seumur hidup (dari db) |
| 15 | `/delete` + arsip sesi | **0 hit**; daftar sesi tumbuh tanpa batas hanya relevan kalau riwayat dibawa | 0 |
| 17 | `/version`, `/help`, `/start` + pairing | User satu-satunya pengguna; bot baru cukup diisi `allowFrom` manual di `config.json` | tak terukur |
| 20 | Kebijakan akses per-bot (grup, `dmPolicy`) | Nol pemakaian sepanjang hidup keenam bot | 0 |

Ditambah #19 (`react`) yang memang sudah tidak relevan sejak 2026-08-02.

**`/effort` (#16) TIDAK dicoret — ia sengaja tetap diblokir** atas keputusan
user 2026-08-05. ⚠️ Dan sesuai Tingkat 14: alasan blokirnya **bukan** "tidak ada
padanannya di Claude Code" — `/effort` ADA. Alasannya keputusan user, titik.

## 4. Yang MASIH hilang — lima baris, dan tak satu pun memblokir

| # | Yang hilang | Frekuensi terukur | Catatan |
|---|---|---|---|
| 12 | **`/switch`** | 139× seumur hidup — **102× di antaranya `bot-01` sendirian** | User sudah memutuskan **tunda**. Padanan CC: `/resume <sessionId>` |
| 10 | **`edit_message` sebagai tool** | **58×** seumur hidup (6 bot) | `editMessageText` ADA di `engine.ts:751` tapi **hanya** untuk mencopot keyboard sesudah tombol ditap — bukan tool yang bisa dipanggil AI |
| 4a | **Notifikasi "sesi berganti" → Telegram** | 5,7/hari di sistem lama | `grep session-change` di `cc-wrapper/src` = **nol**. Kabel wrapper→plugin belum ada di sistem baru |
| 18 | **`get_message_by_id`** | tak terukur | Tidak ada di daftar tool sistem baru |
| 9 | **Skema tombol** `{label,callback_id}` → `{text,data}` | ~15,2/hari (proksi) | **Bukan kapabilitas hilang** — skill lama masih mengajarkan bentuk lama. Tidak menggigit bot uji karena plugin lama dimatikan di sana |

**Daftar tool MCP sistem baru, lengkap:** `reply` · `read_history` ·
`search_history` · `agent_send` · `agent_list` · `send_slash`. Enam.

## 5. ⚠️ Batas klaim — apa yang BELUM dibuktikan hidup

Dinyatakan terpisah supaya tidak ikut terbaca sebagai "sudah beres" (Tingkat 15:
kode yang benar tapi belum pernah menyala terlihat persis seperti yang sudah).

**Sudah terbukti hidup di sistem baru:** `/rename` lewat `send_slash` (7/7) ·
`/context` · antar-bot dua arah · `reply` · W-27 · AB-4 · path bridge 0.17.0.

**Punya kode + test, TAPI belum pernah dilihat jalan di Telegram sungguhan:**

- **Typing** (#1) — 36,7/hari di sistem lama, yang paling sering muncul
- **Chunking** (#3) — 10,6/hari, dan **satu-satunya yang memblokir** di paket
  yang user pilih 2026-08-02
- **Kirim lampiran keluar** (#7) — 2,7/hari

Ketiganya perlu dibuktikan hidup **sebelum** bot harian pertama pindah.
Biayanya kecil: satu balasan panjang, satu balasan berlampiran, satu pesan masuk.

## 6. Bot mana yang paling aman lahir ulang duluan

Diukur, bukan ditebak (`messages.db` readonly + `wrapper.log`, 2026-08-05):

| bot | total pesan | 30 hari | `/switch` | `edit_message` | lampiran keluar |
|---|---|---|---|---|---|
| bot-01 | 2.594 | 902 | **102** | **27** | 34 |
| bot-02 | 2.376 | 1.278 | 7 | 3 | 26 |
| bot-03 | 2.026 | 824 | 4 | 2 | 4 |
| bot-04 | 1.911 | 616 | 11 | 14 | 24 |
| bot-05 | 1.948 | 258 | 12 | 5 | 15 |
| **bot-06** | **723** | 313 | **3** | 7 | **5** |

**Rekomendasi: `bot-06` pertama.** Volumenya sepertiga bot lain, dan — yang
lebih menentukan — ketergantungannya pada **kelima celah sisa** paling kecil:
`/switch` 3×, lampiran 5×. Kalau ada yang meleset, kerugiannya paling sedikit.

**`bot-01` TERAKHIR, bukan pertama.** Ia sendirian menyumbang 102 dari 139
pemakaian `/switch` seluruh armada plus 27 `edit_message` — ia justru bot yang
paling merasakan kelima celah yang belum ditutup. Memindahkannya duluan berarti
menguji sistem baru pada kasus terburuknya.

⚠️ **Frekuensi ≠ urutan**, dan itu berlaku dua arah: bot-02 punya 30-hari
tertinggi (1.278) tapi `/switch` cuma 7× — volume tinggi tidak otomatis berarti
sulit dipindah. Yang menentukan adalah **fitur mana yang dipakai**, bukan
seberapa ramai.

## 7. Untuk yang membaca sesudah ini

- **Semua angka bisa dihitung ulang.** Skripnya `ukur.mjs` di scratchpad sesi
  ini; `messages.db` dibuka `readOnly: true` — tidak ada bot produksi yang
  disapa, hanya dibaca.
- **`/goal` dan `/delete` terbaca 0× di `wrapper.log`.** Ingat blind spot §1
  dokumen 2026-08-02: meta-command dikonsumsi sebelum dicatat. Nol di sini
  **bukan bukti tidak dipakai** — ia bukti *tidak lewat meteran ini*. Yang
  membuat keduanya aman dicoret bukan angka nolnya, melainkan keputusan
  "mulai bersih dari nol": tanpa riwayat yang dibawa, arsip sesi tidak punya
  yang perlu diarsipkan.
- **Yang belum dihitung sama sekali:** apakah keenam bot harian bergantung pada
  skill `mirza-marketplace` (`kajian-info`, `daily-report`, `handoff`,
  `bot-conduct`, `teach-me`) dengan cara yang berubah di sistem baru. Skill itu
  milik Claude Code, bukan lapisan Telegram, jadi **dugaannya** tidak berubah —
  tapi itu dugaan, bukan ukuran, dan bot uji sengaja telanjang sehingga tidak
  bisa menjawabnya.
