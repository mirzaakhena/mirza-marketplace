# Area 12 — Penyimpanan & observability

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-133–140, 171, 172; SCAR-060, 097

---

## 12.1 Skema `messages.db` — **KEEP + kolom `bot`**

**Item:** TG-133, 135, 136, 138, 139

Tabel `messages(id, ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)` + 3 indeks (chat+ts, chat+message_id, source+ts), `journal_mode=WAL`, `synchronous=NORMAL`.

**Perubahan dari K-3:** satu database untuk seluruh fleet, ditambah kolom `bot`. Default baca = percakapan sendiri; mengintip bot lain lewat tool eksplisit.

**Yang tetap:**

| Item | Perilaku |
|---|---|
| TG-135 | `quote_text` / `quote_is_manual` di-merge ke kolom `metadata` — tanpa migrasi skema |
| TG-138 | `getMessage` mengambil row **terbaru** untuk pasangan `(chat_id, message_id)`; `attachments`/`metadata` dikembalikan sudah ter-parse (gagal parse → field null, bukan error) |
| TG-139 | Fallback album: item ke-2..N hanya tersimpan di `metadata.message_ids` baris pertama → lookup `LIKE` + **verifikasi parse** untuk menghindari false positive substring |
| TG-136 | `source` terbatas `assistant` / `system` untuk pesan keluar |

**Yang hilang:** `logEdit` (TG-137) ikut mati bersama `edit_message` (area 03 §3.4). Kolom `metadata` tetap.

**Bug yang WAJIB difix:** `messagesStore.append(...)` dipanggil di jalur banner ganti-sesi padahal **method itu tidak ada** di interface store — banner terkirim tapi tidak pernah tercatat (LOSS-4, TG-150). Kelas bug yang dicegah `tsc --noEmit` di CI.

## 12.2 Retensi `messages.db` — **simpan selamanya, bisa dipadatkan**

**Item:** SCAR-097

Tidak ada penghapusan otomatis — konsisten dengan **K-8** (tidak ada transkrip dihapus) dan dengan nilai **B-1**/**B-2**.

**Yang ditambahkan:** perintah pemadatan manual (`VACUUM`) dan pelaporan ukuran di `doctor` supaya user tahu kapan perlu bertindak.

**Dasar keputusan:** teks percakapan sangat kecil dibanding media — puluhan ribu pesan masih di bawah ratusan MB.

## 12.3 Retensi `inbox/` — **hapus yang lama & tidak dirujuk**

**Kebijakan baru** (belum pernah ada). Diperlukan karena keputusan area 02 §2.2 membuat **semua** lampiran diunduh otomatis, bukan hanya foto.

**Aturan:** file di `inbox/` lebih tua dari N hari dihapus, **kecuali** yang masih dirujuk baris pesan yang ada. **Baris pesannya tetap ada** — user tetap tahu "ada foto di sini", hanya filenya yang hilang.

**Alasan:** berbeda dengan teks, media besar dan nilainya turun cepat — screenshot error 3 bulan lalu hampir tak pernah dibuka lagi.

**Nilai N belum ditetapkan** — jadikan konfigurasi, bukan konstanta.

⚠️ **Interaksi dengan B-2:** kalau kelak bot membaca sesi lama dan menemukan rujukan ke file yang sudah dihapus, ia harus mengatakannya apa adanya (*"ada lampiran di sini tapi filenya sudah kedaluwarsa"*), bukan diam atau error.

## 12.4 ⭐ Pencarian teks penuh — **FITUR BARU (prasyarat B-1/B-2)**

**Item:** SCAR-060

Sekarang `messages.db` hanya bisa diambil per `message_id`. Ditambahkan **indeks pencarian teks penuh** (FTS5, sudah tersedia di SQLite) + tool pencarian.

**Kenapa prasyarat:** tanpa ini, **B-1** ("bot mengintip percakapan bot lain") dan **B-2** ("bot menggali sesi lama") tidak punya cara menemukan apa pun — hanya bisa membaca berurutan dari awal, yang mustahil untuk riwayat besar.

**Catatan:** menambahkan indeks belakangan berarti mengindeks ulang seluruh riwayat — makanya dimasukkan sejak awal.

**Konteks yang membuat ini penting (SCAR-060):** Bot API Telegram **tidak punya riwayat atau pencarian sama sekali**. `messages.db` adalah satu-satunya ingatan.

## 12.5 ⭐ `doctor` — **FITUR BARU, memberi tahu lewat Telegram**

Belum ada sama sekali. Sepanjang audit ini muncul **enam** hal yang harus "terlihat kalau rusak":

| # | Kerusakan | Asal keputusan |
|---|---|---|
| 1 | Capture statusline mati (user menimpa `statusLine` di `settings.json`) | area 11 §11.1 |
| 2 | Hook `SessionStart` tidak berbunyi → deteksi sesi baru mati total | area 06 §6.3 |
| 3 | Injeksi tak pernah mendarat (`{queued:true}` ≠ selesai) | area 06 §6.7, SCAR-071 |
| 4 | Handoff menggantung tanpa ACK melewati batas waktu | area 08 §8.3 |
| 5 | Payload rusak dikarantina | area 06 §6.7 |
| 6 | Bot diam / tidak bisa dihubungi | area 06 §6.9 |

**Keputusan: sistem memberi tahu user SENDIRI di Telegram saat sesuatu berhenti bekerja**, plus perintah `/doctor` untuk memeriksa kapan pun.

**Alasan:** user AFK dan tidak melihat transkrip — **alarm yang hanya tercatat di log adalah alarm yang tidak pernah terdengar**. Ini persis yang terjadi pada dua bug nyata: banner tidak pernah tercatat (LOSS-4) dan capture mati diam-diam.

**Pelajaran dari desain lama yang wajib dihindari:** `doctor.ok` di implementasi lama **hardcoded `true`** — laporan kesehatan yang selalu berkata sehat. Kalau ada field ringkasan, ia harus benar-benar dihitung dari komponennya.

**Yang juga wajib dilaporkan `doctor`:** ukuran database (§12.2) dan versi komponen yang **sedang berjalan** — sebagian mengganti fungsi `/version` yang dibuang (area 11 §11.3).

## 12.6 Mode degradasi — **KEEP prinsipnya**

**Item:** TG-140

`TELEGRAM_DISABLE_MESSAGES_STORE=1` atau kegagalan init menonaktifkan store; semua pencatatan/pembacaan jadi no-op dengan warning, **pipeline pesan tetap berjalan penuh**.

**Prinsipnya dipertahankan:** *log best-effort tidak boleh membunuh pengiriman.* Bot yang tidak bisa mencatat harus tetap bisa membalas.

**Yang berubah:** setelah §12.5, kondisi "store mati" wajib **terlihat di `doctor` dan diberitahukan**, bukan hanya warning di stderr yang tak pernah dibaca. Env var-nya sendiri bisa jadi konfigurasi biasa (K-1).

## 12.7 Keamanan file state

**Item:** TG-134, TG-142, TG-144; SCAR-024

`messages.db` dan file token di-chmod 0600 di POSIX. Di Windows `chmodSync` adalah **no-op senyap** — proteksinya tidak berlaku, dan versi sekarang memancarkan satu warning saat boot alih-alih pura-pura berhasil.

**Keputusan yang tetap terbuka:** strategi perlindungan di Windows (ACL). Diperingan oleh K-1 — file pindah dari dalam repo kerja ke `~/.claude/fleet/`, yang mengurangi paparan (tidak bisa ter-commit), tapi tidak menggantikan izin file.

## 12.8 `wrapper.log`

**Item:** PTY-050

Append tanpa batas, tidak disebut di pertanyaan mana pun. **Keputusan pelaksana:** rotasi berbasis ukuran (mis. simpan 2 file terakhir). Ini log diagnostik, bukan aset — beda perlakuan dengan percakapan. Silakan dibantah.
