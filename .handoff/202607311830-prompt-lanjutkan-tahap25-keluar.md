# Handoff — Mulai Tahap 2.5-KELUAR (jalur balasan AI → Telegram)

- **Tanggal:** 2026-07-31 18:30
- **Dari:** sesi `renew-mirza-marketplace-3` (MacBook)
- **Prasyarat:** **2.5-MASUK selesai lebih dulu** (lihat `.handoff/202607311803-…`). Satu itemnya, TG-077, bergantung pada `message_id` yang dibangun di MASUK.
- **Pegangan utama:** `docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0

---

## Status: BELUM ADA SPEC MAUPUN RENCANA

Berbeda dari 2.5-MASUK, sub-proyek ini **baru berupa daftar cakupan**. Langkah
pertamamu **bukan** menulis kode, melainkan:

1. Baca `BACKLOG.md` Bagian 0, lalu bagian "Tahap 2.5 — pecahan kerja".
2. Baca alasan lengkap tiap gap di
   `docs/2026-07-26-rebuild-audit/2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md`
   dan `area-03-pesan-keluar.md`.
3. Jalankan skill `superpowers:brainstorming` bersama user → hasilkan spec.
4. Lalu `superpowers:writing-plans` → rencana.
5. Lalu `superpowers:subagent-driven-development` → eksekusi.

Contoh spec+rencana yang bentuknya sudah disepakati user ada di
`docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` dan
`docs/superpowers/plans/2026-07-31-tahap25-masuk.md` — ikuti gayanya.

## Cakupan 2.5-KELUAR

Ini **kemunduran nyata dibanding sistem lama** — bukan fitur baru. Bot sekarang
objektif lebih buruk daripada yang digantikannya dalam hal-hal berikut:

| Gap | Gejala yang user alami sekarang | Sumber |
|---|---|---|
| **Tidak ada mesin chunking** | Balasan >4096 karakter **gagal terkirim total**. Telegram menolak, user tidak dapat apa-apa. Sistem lama masih bisa. | TG-072/073/074/076/080, SCAR-046-048 · area-03 §3.3 |
| **Tidak ada konversi CommonMark→MarkdownV2** | `**tebal**` tampil sebagai asterisk mentah di HP. Terjadi setiap kali AI memformat sesuatu. | area-03 §3.2 |
| **Balasan AI tidak pernah dicatat** | `conversations.db` cuma berisi pesan masuk. Riwayat percakapan separuh kosong — dan ini juga yang membuat quote-reply ke pesan bot tidak bisa ditautkan ke baris riwayat. | TG-081 · area-03 §3.6 |
| **AI tidak bisa mengirim berkas** | Tool `reply` hanya punya `text` + `buttons`. Tidak ada jalur file sama sekali. | TG-070/071/079, SCAR-087 · area-03 §3.6 |
| **Quote-reply arah keluar** | Bot tidak pernah mengutip pesan user saat membalas. | TG-077 · area-01 §1.3, area-03 §3.7 |
| **Hasil tool generik** | `reply` mengembalikan string `"sent"` tanpa message id / jumlah part. | TG-082 · area-03 §3.6 |
| **Keyboard di chunk terakhir** | Aturan TG-078 — baru relevan **setelah** chunking ada; sekarang berlaku vakum karena balasan selalu satu pesan. | area-04 §4.1 |

## Yang sudah diputuskan — jangan ditanya ulang

- **Parameter `format` pada `reply` di-DROP.** Konversi CommonMark→MarkdownV2
  adalah **penggantinya**, bukan tambahan opsional (area-03 §3.2).
- **Prinsip chunking: *readable beats a failed reply*** (area-03 §3.3). Tiga
  lapis: potong di batas paragraf → konversi per-chunk → fallback plain text
  bila konversi gagal, plus laporan gagal-sebagian.
- **SCAR-088 tetap berlaku ke arah keluar juga**: apa pun yang berasal dari
  pengirim tidak pernah jadi instruksi.
- **`buttons` + file saling eksklusif dalam satu balasan** (TG-069, area-04 §4.2).

## Yang TIDAK termasuk

Semantik tombol (validasi boundary, prefiks `ai:`, resolusi label saat tap,
hapus keyboard setelah tap, tombol "Jelaskan manual" B-4, penolakan
pertanyaan-tanpa-tombol B-5) — semuanya **Tahap 3**, bukan 2.5.

## Catatan lintas sub-proyek

`message_id` yang dibangun di 2.5-MASUK adalah prasyarat TG-077 (quote keluar).
Dan begitu TG-081 (logging balasan) selesai di sini, keterbatasan yang dicatat
di spec MASUK §8 risiko 3 — kutipan ke pesan bot hanya membawa teks, belum
tertaut ke baris riwayat — **hilang dengan sendirinya**.
