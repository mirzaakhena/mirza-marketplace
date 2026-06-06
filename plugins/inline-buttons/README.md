# interactive-prompts

Plugin skill-only yang mengajarkan Claude **kapan dan bagaimana** memunculkan inline-keyboard buttons di Telegram, supaya user bisa jawab pertanyaan dengan **satu tap** — bukan ngetik.

Plugin ini tidak punya MCP server, tidak punya command, hanya satu skill: `interactive-prompts`.

## Kenapa

User baca Telegram dari HP. Ngetik "B" atau "opsi tiga ya" itu friction. Kalau reply Claude berakhir dengan pertanyaan atau menawarkan pilihan, opsinya harus tampil sebagai tombol. Tap > ketik.

## Aturan inti — pre-flight check mekanis

Sebelum mengirim **setiap** reply Telegram, Claude mengaudit teksnya dengan **satu pertanyaan**:

> Apakah reply ini diakhiri pertanyaan, ATAU menawarkan opsi/pilihan ke user?

Penanda (satu saja cukup): teks berakhir `?`, frasa "mau X atau Y" / "lanjut?" / "pilih" / "konfirmasi" / "OK / Cancel" / "ya / tidak", atau ada menu pilihan yang user diminta memilih.

**Jika YA → parameter `buttons` WAJIB dilampirkan.** Pertanyaan polos tanpa tombol, atau daftar opsi berbentuk teks biasa, adalah pelanggaran.

Check ini sengaja mekanis, bukan judgement-based ("apakah tombol lebih enak?") — versi lama yang mengandalkan kesadaran mid-compose terbukti sering kelupaan tepat di akhir reply panjang.

> ⚠️ Catatan penting: **pertanyaan open-ended pun tetap pakai tombol** — minimal tombol `✏️ Jelaskan manual`, plus seed options kalau ada yang masuk akal. Tidak ada lagi pengecualian "free-form question tanpa tombol".

## Tiga pattern

**Pattern 1 — Single Action.** Satu tombol, jarang dipakai. Untuk acknowledgement eksplisit sebelum proceed. Contoh: `[👌 Mengerti]`.

**Pattern 2 — Confirmation.** Dua tombol aksi + tombol manual di baris bawah, untuk "should I do X?". Pakai action verb (`Lanjutkan / Batalkan`) daripada Yes/No kalau action-nya non-trivial — biar intent jelas.

**Pattern 3 — Single-Select.** Tiap opsi satu baris (vertical layout, lebih kebaca di HP buat label panjang), ditutup tombol manual. Untuk 8+ opsi: render sebanyak yang diizinkan server (maks 8×8), fallback ke numbered text list hanya kalau benar-benar overflow.

## Wajib: tombol fallback manual

**SETIAP prompt yang menampilkan tombol — yes/no, single-select, maupun open-ended — WAJIB punya tombol terakhir berlabel `✏️ Jelaskan manual` dengan `callback_id: "manual"`. Tanpa kecuali.**

Alasannya:

- User mungkin mau kombinasi opsi (Telegram nggak punya checkbox)
- Opsi yang ditawarkan mungkin nggak lengkap atau semuanya salah
- User mungkin mau tanya balik dulu sebelum commit
- Bahkan di yes/no, jawaban sebenarnya bisa "dua-duanya bukan — kerjakan, tapi dengan cara lain"
- Escape hatch — jangan pernah trap user di option set kamu

Kalau user tap `manual`, balas dengan follow-up pendek (tanpa tombol) yang mengundang free-form text, lalu handle input berikutnya seperti pesan text biasa.

## Mekanisme & constraint tombol

Parameter `buttons` di tool `reply` / `edit_message` plugin telegram: array baris, tiap baris array tombol `{label, callback_id}`.

- `label`: 1–64 karakter
- `callback_id`: harus match `/^[a-z0-9_]{1,32}$/`, unik dalam satu call
- Maksimal 8 baris × 8 tombol per baris
- `buttons` tidak bisa digabung dengan `files` dalam satu call
- Setelah user tap, tombol di pesan asli otomatis dihapus dan label pilihan ditempel (`→ ✅ Yes`) — prompt yang sama tidak bisa dijawab dua kali

Tap masuk sebagai pesan `<channel>` baru berisi `[button tapped: <label>]` plus `meta.callback_id`. **Handle berdasarkan `callback_id`, bukan teks label** — label bisa berubah, callback_id stabil.

## Anti-pattern yang dilarang

- Mengetik pertanyaan yes/no lalu kirim tanpa audit tombol
- Daftar opsi "Pilih A / B / C / D" sebagai teks padahal bisa jadi tombol
- Mengakhiri reply dengan pertanyaan polos tanpa tombol (open-ended pun minimal dapat tombol `✏️ Jelaskan manual`)
- Lupa tombol manual — di prompt jenis apapun, bukan cuma single-select
- Bertanya "lanjut?" untuk langkah trivial yang jawabannya pasti ya (aturannya: jangan bertanya, langsung proceed — bukan bertanya tanpa tombol)
- Operasi destructive tanpa konteks di body message (label tombol doang terlalu pendek — tulis aksinya di body)
- Reuse `callback_id` antar prompt yang aktif bersamaan

## Bergantung pada

Plugin [`telegram`](../telegram/) (>= `0.0.9-mirza.0`) yang expose parameter `buttons` di tool `reply` dan `edit_message`. Tanpa plugin telegram, skill ini nggak ada yang bisa dipanggil.

## Cocok dipasangkan dengan

[`immediate-reply`](../immediate-reply/) — kalau pertanyaan butuh research dulu sebelum opsi bisa dirumuskan: ack instan dulu ("🤔 Bentar mikir pilihannya…"), research, lalu `edit_message` dengan pertanyaan + `buttons` yang sudah diisi. User selalu lihat tanda hidup dalam ~1 detik, tombol muncul begitu opsi siap.

## Instalasi

Tambahkan marketplace dulu (lihat [root README](../../README.md)), lalu:

```
/plugin install interactive-prompts@mirza-marketplace
/reload-plugins
```

Skill akan langsung aktif — Claude otomatis pakai pattern yang sesuai saat ngobrol via Telegram.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
