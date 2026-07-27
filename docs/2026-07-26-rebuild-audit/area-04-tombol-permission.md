# Area 04 — Tombol inline & permission prompt

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-068, 069, 078, 101, 102, 122, 123, 125–132; SKILL-051 (sebagian); SCAR-051, 052, 058, 062, 090

Ada tiga namespace callback yang tidak boleh saling menabrak: `ai:*` (tombol AI), `meta:*` (picker sesi — area 05), `perm:*` (izin tool — dibuang, §4.3).

---

## 4.1 Mekanisme tombol AI — **KEEP utuh**

**Item:** TG-068, TG-078, TG-126, TG-127, TG-128; SCAR-052, SCAR-058

| Perilaku | Kenapa penting |
|---|---|
| Validasi di boundary: 1–8 baris × 1–8 tombol, `label` 1–64 char, `callback_id` `/^[a-z0-9_]{1,32}$/` unik di seluruh spec | Error menyebut posisi `row r col c` supaya AI bisa memperbaiki sendiri tanpa menebak |
| `callback_data` diberi prefiks `ai:` | Telegram membatasi `callback_data` **64 byte** (SCAR-052); prefiks memisahkan namespace dari `meta:*` |
| Tap → notifikasi channel `[button tapped: <label>]` + `meta.callback_id` | Label di-resolve dari keyboard yang benar-benar terlihat user → AI tahu apa yang user *lihat*, bukan hanya id opaknya. Skill bercabang pada `callback_id` (stabil), bukan label (bisa berubah) |
| Ack tap segera (`answerCallbackQuery`) | **Wajib** — tanpa ini spinner di tombol berputar selamanya. Ini yang tidak ter-port di uji live fase 1 meski 457 unit test lolos; jadikan test wajib |
| Pesan sumber di-edit: `→ <label>` di-append di akhir, **entities asli dipertahankan** | Mengedit tanpa menyertakan `entities` menghapus formatting lama; append di akhir menjaga offset entity tetap valid (SCAR-058) |
| Keyboard dihapus setelah tap | Prompt yang sama tak bisa dijawab dua kali |
| Keyboard hanya di chunk **terakhir** (TG-078) | Kalau di chunk awal, keyboard melayang di atas teks lanjutan |

## 4.2 `buttons` + `files` tetap saling eksklusif — **KEEP larangan**

**Item:** TG-069

Aturan "keyboard selalu di chunk teks terakhir" jadi tanpa pengecualian. AI cukup mengirim file lebih dulu lalu pertanyaan berbutton menyusul — dua pesan yang urutannya justru lebih jelas dibaca di HP. Setiap pengecualian penempatan adalah cabang yang harus diuji.

## 4.3 Mesin permission prompt — **DROP seluruhnya**

**Item:** TG-101, TG-102, TG-122, TG-123, TG-129, TG-130, TG-131; SCAR-062 (sebagian), SCAR-090

**Yang dibuang:**
- notification handler `permission_request`
- map in-memory `pendingPermissions` (detail untuk tombol `See more`)
- tiga cabang callback `perm:more` / `perm:allow` / `perm:deny`
- jalur teks `yes abcde` beserta regex 5-huruf-tanpa-`l` (case-insensitive demi autocorrect ponsel) dan reaksi ✅/❌
- pengecualian khusus "permission-reply tidak dijalankan di jalur album"
- deklarasi capability experimental `claude/channel/permission`

**Alasan:** wrapper menjalankan Claude Code dengan flag default yang komentarnya sendiri berbunyi *"silence the per-tool permission prompts"* (`wrapper.ts:265`: `--dangerously-skip-permissions`). Untuk seluruh fleet, `permission_request` nyaris tidak pernah terkirim — seluruh mesin ini melayani jalur yang sudah dimatikan di sumbernya.

**Yang disadari saat memutuskan:** `--dangerously-skip-permissions` memang berbahaya (AI boleh `rm -rf` tanpa bertanya), dan mesin permission ini satu-satunya cara menjalankan bot **tanpa** flag itu. Kalau suatu saat itu diinginkan, mesinnya dibangun ulang dengan desain yang lebih baik — dan pada saat itu kebutuhannya sudah diketahui persis. Pola yang biasanya bekerja: allowlist tool per-project di `settings.json` Claude Code, dengan prompt Telegram hanya untuk sisa yang jarang.

**Efek lanjutan:** bersama DROP `react` (area 03 §3.5) dan ack reaction (area 01 §1.3), **seluruh pemakaian `setMessageReaction` hilang dari kode.**

## 4.4 ⭐ Tombol "Jelaskan manual" ditambahkan **SERVER**, bukan AI — **PERUBAHAN PENTING**

**Item:** SKILL-051 (bagian mekanis)

> "Saya ingin di versi baru biar server yang menambahkannya secara mekanis, bukan inisiatif AI. Ini adalah tombol yang SANGAT PENTING sekali. terkadang hanya memang harus menjelaskan secara manual karena tidak ada pilihan yang cocok. Karena sudah ditambahkan sendiri oleh Server, maka kita bisa hapus bagian prompt/skill yang meminta AI secara inisiatif menambahkan button ini." — user, 2026-07-26

**Perilaku baru:** setiap panggilan `reply` yang membawa `buttons` otomatis mendapat baris terakhir **✏️ Jelaskan manual** (`callback_id: manual`) yang ditambahkan **server**. Kalau AI sudah mencantumkannya sendiri, server tidak menduplikasi.

**Konsekuensi ke skill (dijalankan di area 10):** seluruh teks di skill `inline-buttons` yang meminta AI menambahkan tombol ini — termasuk "self-check ritual: baris terakhir bukan manual → append" — **DIHAPUS**. Aturannya berpindah dari "AI harus ingat" ke "mesin yang menjamin".

**Ini penerapan prinsip induk:** *AI decides (isi pilihan), machine executes (jaminan strukturnya).*

**Catatan implementasi:** batas 8 baris (TG-068) harus memperhitungkan baris tambahan dari server — spec dengan 8 baris penuh dari AI tidak boleh ditolak karena server menambah baris ke-9. Aturan: batas untuk AI = 7 baris, atau server menggabungkan ke baris terakhir bila penuh. Diputuskan saat implementasi.

## 4.5 ⭐ Pertanyaan tanpa tombol **DITOLAK** server — **FITUR BARU**

Menjawab keluhan user: *"setiap kali bot mengakhiri response dengan pertanyaan, seharusnya setidaknya ada yes-no"*.

**Perilaku baru:** `reply` yang teksnya terdeteksi sebagai **pertanyaan** tapi tidak membawa `buttons` **ditolak** dengan error yang mengajari AI cara memperbaikinya (*"pertanyaan wajib membawa buttons; minimal Ya / Tidak"*). AI langsung mengirim ulang dengan tombol.

**Kenapa tolak-dan-ajari, bukan auto-tambah Ya/Tidak:** AI yang menyusun pilihannya sesuai konteks. Auto-tambah Ya/Tidak menghasilkan tombol generik yang justru menyesatkan untuk pertanyaan yang sebenarnya butuh 4 pilihan spesifik — dan user tetap harus mengetik.

**Biaya yang diterima:** satu putaran bolak-balik saat AI lupa (terlihat sebagai jeda kecil di HP).

**Risiko yang harus dijawab saat implementasi — deteksi salah tangkap:** teks panjang yang memuat pertanyaan retoris di tengah penjelasan bisa ikut tertolak, dan AI bisa terjebak menolak berulang. Kandidat mitigasi (diputuskan saat implementasi, bukan sekarang):
- Heuristik konservatif: hanya periksa **kalimat terakhir**, bukan seluruh teks
- Batas percobaan: penolakan kedua untuk teks yang sama diloloskan + dicatat supaya terlihat
- Daftar penanda yang lebih tajam dari sekadar `?` (frasa "mau X atau Y", "lanjut?", "pilih")

Yang **tidak** boleh jadi mitigasi: parameter opt-out yang bisa dipakai AI untuk melewati aturan — itu mengembalikan masalahnya ke "AI harus ingat".

---

## Ditunda ke area 05

**TG-055, SCAR-051** — state picker `meta:*` (switch/delete/archive + snapshot bulk) hidup **in-memory saja**, jadi setelah server restart tap tombol lama menghasilkan pesan "expired". Ini menyangkut picker sesi, jadi diputuskan bersama area 05.

## Ditunda ke area 10

Sisi **perilaku** tombol inline (SKILL-050, 052, 053, 055, 056): kapan sebuah respons wajib berbutton, aturan layout (label pendek, menu bernomor di body, larangan mengulang deretan tombol sebagai teks), dan urutan dengan `immediate-reply`. Mekanismenya sudah diputuskan di sini; kewajibannya dibahas sebagai satu sistem penegakan di area 10.
