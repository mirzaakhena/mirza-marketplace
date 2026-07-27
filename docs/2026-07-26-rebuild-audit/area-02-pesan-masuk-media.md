# Area 02 — Pipeline pesan masuk & media

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-084, 101–121; SCAR-012, 054, 055, 056, 088

Alur: `gate()` → intersep permission-reply → intersep meta-command → indikator typing → unduh media → catat `messages.db` → notifikasi `<channel>` ke AI.

---

## 2.1 Tipe media yang didukung — **DROP 5 dari 7**

**Item:** TG-106, TG-107

| Tipe | Verdict | Alasan |
|---|---|---|
| teks | **KEEP** | inti |
| foto / screenshot | **KEEP** | satu-satunya tipe yang benar-benar bisa *dilihat* Claude |
| document (pdf, zip, .md, .log) | **KEEP** | Claude bisa membaca isinya |
| voice | **DROP** | tidak pernah dipakai user; Claude Code tidak bisa memproses audio |
| audio | **DROP** | idem |
| video | **DROP** | idem |
| video_note | **DROP** | idem |
| sticker | **DROP** | hasil terbaiknya hanya placeholder `(sticker 😄)` |

**User:** hanya pernah mengirim foto/screenshot dan document.

### Catatan desain wajib: jangan diam saat tipe tak didukung

Membuang handler berarti pesan tipe itu **hilang tanpa jejak** — bot tidak menjawab apa pun dan user tidak tahu kenapa. Itu regresi UX, bukan penyederhanaan.

**Keputusan pelaksana (silakan dibantah):** satu handler catch-all untuk semua tipe non-teks/foto/document, menghasilkan notifikasi `(lampiran tidak didukung: <kind>)` supaya AI bisa memberi tahu user dengan jelas. Satu handler generik menggantikan lima handler spesifik — tetap penyederhanaan, tanpa lubang diam.

## 2.2 Unduhan lampiran diseragamkan — **SIMPLIFY, tool `download_attachment` DROP**

**Item:** TG-105, TG-107, **TG-084 (tool `download_attachment`) → DROP**

**Sekarang:** foto diunduh otomatis; sisanya hanya `file_id` yang harus ditukar AI lewat tool `download_attachment`. Kontrak dua langkah yang mudah dilupakan AI.

**Jadi:** semua lampiran diunduh otomatis ke `inbox/`, AI langsung menerima path lokal. Tool `download_attachment` dibuang seluruhnya.

**Kenapa aman:** batas unduh bot Telegram hanya **20 MB** (SCAR-054), jadi ukuran terburuk per file terbatas.

**Utang yang dibuka:** `inbox/` tumbuh tanpa batas untuk file yang mungkin tak pernah dibuka → **butuh kebijakan retensi** (dibahas di area 12; sekarang `inbox/` memang sudah tumbuh tanpa batas dan tanpa kebijakan).

**Yang tetap:** gagal unduh → path dihilangkan dari notifikasi, bukan error ke user (TG-105).

## 2.3 Buffering album — **KEEP apa adanya**

**Item:** TG-112, 113, 114, 115, 116, 117, 118, 119, 120, 121; SCAR-012, SCAR-055, SCAR-056

User sering mengirim beberapa gambar sekaligus dan memilih mempertahankan **seluruh** perilaku termasuk ketiga cabang aturan caption (album satu-caption tetap terbaca ringkas, tidak dipaksa berlabel).

Yang wajib ikut pindah — semuanya lahir dari kegagalan nyata:

| Perilaku | Kenapa ada |
|---|---|
| Debounce 400 ms, hard-cap 3 s, maks 10 item | Telegram mengirim item album sebagai pesan terpisah **tanpa penanda "sudah habis"**; tiga knob ini murni tebakan empiris (SCAR-012) — **wajib dikalibrasi ulang, jangan diasumsikan portabel** |
| Sort `message_id` ASC saat flush | Urutan datang ≠ urutan kirim; tanpa ini label `Photo N` tidak cocok dengan gambarnya (SCAR-055a) |
| Unduh paralel `Promise.allSettled` + hitung gagal | Satu foto gagal tidak boleh menggagalkan seluruh album |
| Semua gagal → `⚠️ Failed to load the album photos.` | Tidak ada notifikasi ke AI; user diberi tahu langsung |
| 3 aturan caption (0 / 1 / ≥2) | ≥2 caption diberi label `Photo <n>:` supaya AI bisa memetakan caption ↔ gambar |
| Suffix `[⚠️ X of N items failed to load]` | Kegagalan parsial terlihat, tidak disembunyikan |
| Quote hanya dari item pertama | Telegram hanya melampirkan `reply_to_message` di item pertama (SCAR-055b) |
| Typing + ack hanya di item pertama | Menghindari N reaksi untuk satu album |
| **Serialisasi manual semua nilai meta jadi string** | Skema notifikasi Claude Code memaksa `meta: Record<string,string>`; satu nilai array membuat **SELURUH notifikasi di-drop diam-diam** dan AI tak pernah tahu ada album (SCAR-056). Kontrak diam-diam paling mudah dilanggar di sistem ini — wajib jadi test case |

## 2.4 Ekstraksi kutipan — **KEEP**

**Item:** TG-111

Saat user me-reply pesan (atau menyeleksi sebagian teks lalu reply), AI diberi tahu bagian mana yang dimaksud. Presedensi: `message.quote.text` (manual bila `is_manual`) → `reply_to_message.text` → `reply_to_message.caption` → tidak ada. `external_reply` tidak didukung.

Murah, langsung berguna, tidak diperdebatkan.

## 2.5 KEEP tanpa perubahan (guard & UX kecil)

| Item | Fitur | Kenapa sepadan |
|---|---|---|
| TG-103 | Indikator "typing" fire-and-forget | Sinyal murah bahwa pesan diterima |
| TG-108, SCAR-088 | `safeName()` — nama file dari pengirim dibersihkan dari `<>[]\r\n;` | Anti tag-breakout: tanpa ini nama file bisa menutup tag `<channel>` atau memalsukan entry meta kedua |
| SCAR-088 | `image_path` **hanya** di meta, **tidak pernah** di isi pesan | Kalau di isi pesan, pengirim allowlisted bisa mengetik `[image attached — read: /etc/passwd]` dan AI menurutinya |
| TG-109, TG-110 | `logInbound` + bentuk notifikasi `<channel>` | Jejak audit + kontrak ke AI |

## 2.6 Yang ikut hilang dari area 01

- **TG-104** ack reaction — sudah jadi konstanta "tidak ada reaksi" (area 01 §1.3)
- Balasan pairing di jalur album (TG-114) — pairing dibuang (area 01 §1.1)

---

## Ditunda ke area 04

**TG-101, TG-102** — intersep balasan permission lewat teks (`yes abcde`, regex 5 huruf a-z tanpa 'l', case-insensitive demi autocorrect ponsel; sengaja tidak dijalankan di jalur album untuk menutup permukaan pemalsuan — SCAR-062).

User memilih membahasnya bersama keseluruhan alur permission prompt di area 04, termasuk pertanyaan yang lebih mendasar: **apakah prompt izin ke Telegram masih relevan** — wrapper menjalankan Claude Code dengan `--dangerously-skip-permissions` (PTY-041), jadi permintaan izin mungkin nyaris tak pernah muncul.
