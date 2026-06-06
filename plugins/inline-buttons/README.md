# inline-buttons

Plugin skill-only yang memaksa Claude menjalankan **self-audit** sebelum mengirim setiap reply Telegram: apakah reply ini **PERTANYAAN** atau sekadar **JAWABAN**? Kalau pertanyaan → wajib pakai inline-keyboard buttons, supaya user bisa menjawab dengan **satu tap** — bukan ngetik.

Plugin ini tidak punya MCP server, tidak punya command, hanya satu skill: `inline-buttons`.

## Kenapa

User baca Telegram dari HP. Ngetik "B" atau "ya" itu friction. Kalau reply Claude berakhir dengan pertanyaan atau menawarkan pilihan, opsinya harus tampil sebagai tombol. Tap > ketik.

## Aturan inti — self-audit mekanis

Sebelum mengirim **setiap** reply Telegram, Claude mengklasifikasikan teksnya jadi salah satu dari dua jenis:

1. **JAWABAN** — menginformasikan, melaporkan, mengonfirmasi selesai. Tidak menanyakan apa pun → kirim apa adanya, tanpa tombol.
2. **PERTANYAAN** — diakhiri dengan bertanya atau menawarkan. Penanda (satu saja cukup): teks berakhir `?`, frasa "mau X atau Y" / "lanjut?" / "pilih" / "konfirmasi" / "OK / Cancel" / "ya / tidak" / "setuju?", atau ada menu pilihan → **parameter `buttons` WAJIB dilampirkan. Tanpa kecuali.**

**Set tombol minimum untuk pertanyaan apa pun: `✅ Ya / ❌ Tidak` + fallback manual.** Kalau jawabannya tidak bisa di-enumerasi, minimal selalu bisa ditawarkan framing yes/no plus tombol manual — pertanyaan teks polos tidak pernah jadi pilihan yang benar.

Check ini sengaja mekanis (klasifikasi PERTANYAAN vs JAWABAN), bukan judgement-based ("apakah tombol lebih enak?") — versi lama yang mengandalkan kesadaran mid-compose terbukti sering kelupaan tepat di akhir reply panjang.

## Wajib: tombol fallback manual

**SETIAP prompt yang menampilkan tombol — yes/no, single-select, maupun open-ended — WAJIB punya tombol terakhir berlabel `✏️ Jelaskan manual` dengan `callback_id: "manual"`. Tanpa kecuali.**

Alasannya:

- User mungkin mau kombinasi opsi (Telegram nggak punya checkbox)
- Opsi yang ditawarkan mungkin nggak lengkap atau semuanya salah
- User mungkin mau tanya balik dulu sebelum commit
- Bahkan di yes/no, jawaban sebenarnya bisa "dua-duanya bukan — kerjakan, tapi dengan cara lain"

Ritual self-check yang dikodekan di skill: setelah menyusun array `buttons`, lihat baris terakhirnya — kalau bukan tombol manual, tambahkan. Ini aturan yang paling sering dilupakan, makanya dijadikan ritual eksplisit.

Kalau user tap `manual`, balas dengan follow-up pendek (tanpa tombol) yang mengundang free-form text, lalu handle input berikutnya seperti pesan text biasa.

## Layout wajib: label pendek + narasi bernomor

Layar HP memotong label tombol yang panjang — user lihat "Eksekusi semua (def..." dan kehilangan konteks. Maka:

- **Label tombol wajib pendek.** Untuk menu pilihan: opsi dinarasikan sebagai daftar bernomor di BODY pesan, tombolnya cukup angka (`[1][2][3][4]`) dalam **satu baris** (9+ opsi lanjut ke baris angka berikutnya).
- Detail/konteks hanya hidup di daftar bernomor body — tidak pernah di label.
- Konfirmasi yes/no boleh tetap label kata pendek (`✅ Ya` / `❌ Tidak`); label > ~15 karakter → pindah ke narasi bernomor.
- Dilarang dua tombol berlabel panjang berdampingan dalam satu baris.
- Tombol manual tetap baris terakhir sendiri.

Contoh:

```
narasi penjelasan ...

Opsi:
1. pilihan satu
2. pilihan dua
3. pilihan tiga
4. pilihan empat

[1] [2] [3] [4]
[✏️ Jelaskan manual]
```

## Pattern

**Confirmation** (default untuk "should I do X?") — dua tombol aksi pendek + manual di baris bawah. Action verb pendek (`Lanjutkan / Batalkan`) boleh selama ≤ ~15 karakter.

**Single-Select** — narasi bernomor di body + satu baris tombol angka + manual di baris terakhir (lihat layout wajib di atas).

## Mekanisme & constraint tombol

Parameter `buttons` di tool `reply` / `edit_message` plugin telegram: array baris, tiap baris array tombol `{label, callback_id}`.

- `label`: 1–64 karakter
- `callback_id`: harus match `/^[a-z0-9_]{1,32}$/`, unik dalam satu call
- Maksimal 8 baris × 8 tombol per baris
- `buttons` tidak bisa digabung dengan `files` dalam satu call
- Setelah user tap, tombol di pesan asli otomatis dihapus dan label pilihan ditempel (`→ ✅ Yes`) — prompt yang sama tidak bisa dijawab dua kali

Tap masuk sebagai pesan `<channel>` baru berisi `[button tapped: <label>]` plus `meta.callback_id`. **Handle berdasarkan `callback_id`, bukan teks label** — label bisa berubah, callback_id stabil.

## Anti-pattern yang dilarang

- Mengakhiri reply dengan pertanyaan polos tanpa tombol (pelanggaran #1)
- Lupa tombol `✏️ Jelaskan manual` di baris terakhir (pelanggaran #2)
- Daftar opsi "Pilih A / B / C / D" sebagai teks padahal bisa jadi tombol
- Bertanya "lanjut?" untuk langkah trivial yang jawabannya pasti ya (aturannya: jangan bertanya, langsung proceed — bukan bertanya tanpa tombol)
- Operasi destructive tanpa konteks di body message (label tombol doang terlalu pendek — tulis aksinya di body)
- Reuse `callback_id` antar prompt yang aktif bersamaan

## Bergantung pada

Plugin [`telegram`](../telegram/) (>= `0.0.9-mirza.0`) yang expose parameter `buttons` di tool `reply` dan `edit_message`. Tanpa plugin telegram, skill ini nggak ada yang bisa dipanggil.

## Cocok dipasangkan dengan

[`immediate-reply`](../immediate-reply/) — urutan kedua check saat keduanya berlaku: (1) inbound masuk → check immediate-reply dulu (ack sebelum tools), (2) kerja, (3) reply final disusun → self-audit inline-buttons (PERTANYAAN → tombol). Kalau merumuskan opsi butuh research dulu: ack instan ("🤔 Bentar mikir pilihannya…"), research, lalu kirim pertanyaan + `buttons`.

## Instalasi

Tambahkan marketplace dulu (lihat [root README](../../README.md)), lalu:

```
/plugin install inline-buttons@mirza-marketplace
/reload-plugins
```

Skill akan langsung aktif — Claude otomatis pakai pattern yang sesuai saat ngobrol via Telegram.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
