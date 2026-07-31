# Handoff — Mulai Tahap 2.5-GUARD (pengaman kecil & kebersihan)

- **Tanggal:** 2026-07-31 18:35
- **Dari:** sesi `renew-mirza-marketplace-3` (MacBook)
- **Prasyarat:** 2.5-MASUK dan 2.5-KELUAR selesai lebih dulu (urutan dipilih user)
- **Pegangan utama:** `docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0

---

## Status: BELUM ADA SPEC MAUPUN RENCANA

Sama seperti KELUAR — ini baru daftar cakupan. Alurnya:
`superpowers:brainstorming` → spec → `superpowers:writing-plans` → rencana →
`superpowers:subagent-driven-development` → eksekusi.

**Sub-proyek ini paling kecil dari ketiganya**, dan isinya campuran: sebagian
murni kode, sebagian **keputusan yang user sendiri belum ambil**. Pisahkan
keduanya sejak awal brainstorming — jangan perlakukan semuanya sebagai kerja
teknis.

## Cakupan

| Item | Isi | Catatan |
|---|---|---|
| **TG-103** | Indikator "typing" — `sendChatAction(chat_id, 'typing')`, fire-and-forget | Verdict audit: **KEEP tanpa perubahan** (area-02 §2.5). Salah satu dari dua fitur yang lolos dari seluruh Tahap 1-2 tanpa disadari. **Parameter kedua bukan teks bebas** — ia union tertutup 11 nilai (`typing`, `upload_photo`, …), diverifikasi di `@grammyjs/types/methods.d.ts:864`. Telegram sendiri yang merender kalimatnya, dilokalkan ke bahasa aplikasi penerima. Wording kustom (mis. "lagi mikir…") **mustahil** lewat jalur ini — itu butuh pesan sungguhan, dan itu urusan ack `immediate-reply` di Tahap 3. |
| **TG-156** | `config.json` korup dipindah ke `.corrupt-<ts>`, lalu mulai bersih | Verdict KEEP, prinsipnya *"start fresh, bukan crash"* (area-01 §1.6). Sekarang `loadConfig` hanya melempar `ConfigError`. |
| **SCAR-024** | Penegakan permission `0600` pada berkas token oleh kode | ⚠️ **Sudah ditambal manual 2026-07-31** (`chmod 600` dijalankan sekali; sebelumnya `0644` — token SELURUH armada bisa dibaca proses mana pun di mesin itu). Yang belum: `fleetd` menegakkannya sendiri saat start. **Audit juga meminta keputusan sadar soal strategi Windows (ACL)** — itu keputusan user, bukan pilihan implementer. |
| **`get_message_by_id`** | Tool riwayat | ⚠️ **Kemungkinan besar SUDAH selesai di 2.5-MASUK Task 7** — cek dulu sebelum mengerjakan. Task 7 membangun tool navigasi (by id + pesan sekitar/setelahnya) dan pencarian keyword. |
| **B-1 `peek_conversation`** | Bot mengintip percakapan bot lain | ⚠️ **Kemungkinan besar SUDAH selesai di 2.5-MASUK Task 7** — kedua tool di sana default ke bot pemanggil dan melintasi bot lain lewat parameter eksplisit (K-3). Verifikasi, jangan bangun ulang. |

**Langkah pertama yang disarankan:** buka `cc-plugin/src/server.ts` dan lihat
tool apa saja yang sudah terdaftar. Kalau navigasi + pencarian sudah ada, dua
baris terakhir tabel di atas tinggal dicoret dari cakupan — dan `BACKLOG.md`
diperbarui sesuai aturan 2 (status diperbarui di commit yang sama).

## Keputusan yang menunggu user — jangan diputuskan sendiri

1. **Strategi proteksi berkas token di Windows (ACL)** — SCAR-024, area-12 §12.7.
   Audit menulis eksplisit bahwa ini "perlu keputusan sadar" dan keputusan itu
   **belum pernah diambil**. Relevan sekarang karena pekerjaan pindah ke Windows.
2. Item lain di `BACKLOG.md` Bagian 4 & 6 yang bersinggungan dengan storage:
   `VACUUM` manual, retensi `inbox/` 90 hari, perilaku saat lampiran sudah
   kedaluwarsa, rotasi `wrapper.log`.

## Setelah GUARD selesai

Tahap 2.5 tuntas → lanjut **Tahap 3 (Penegakan)**. Dan sesuai kesepakatan user
2026-07-31: **42 item `BUTUH KEPUTUSAN` di BACKLOG Bagian 4 & 6 dibereskan
bersama perencanaan Tahap 3**, bukan lebih awal — karena grup terbesarnya
(rumah aturan perilaku, termasuk skill `telegram-conduct` yang tidak dimiliki
tahap manapun) berpasangan langsung dengan mesin penegak yang dibangun di
Tahap 3. Memutuskannya terpisah berisiko diputuskan salah lalu dibongkar lagi.
