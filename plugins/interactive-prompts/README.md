# interactive-prompts

Plugin skill-only yang mengajarkan Claude **kapan dan bagaimana** memunculkan inline-keyboard buttons di Telegram, supaya user bisa jawab pertanyaan pilihan dengan **satu tap** — bukan ngetik.

Plugin ini tidak punya MCP server, tidak punya command, hanya satu skill: `interactive-prompts`.

## Kenapa

User baca Telegram dari HP. Ngetik "B" atau "opsi tiga ya" itu friction. Kalau pertanyaannya punya jawaban terbatas (yes/no, pilih A/B/C, konfirmasi), tampilkan opsinya sebagai tombol. Tap > ketik.

## Kapan skill ini trigger

Whenever Claude mau ajukan pertanyaan dengan jawaban **bounded**:

- **Konfirmasi** — "lanjut?", "OK / cancel"
- **Single-select** — "pilih A / B / C?"
- **Single action** — butuh acknowledgement eksplisit sebelum proceed

Untuk pertanyaan open-ended ("gimana menurutmu?", "apa maksudmu?") — **jangan** pakai tombol. Tombol cuma untuk pilihan yang terbatas.

## Tiga pattern

**Pattern 1 — Single Action.** Satu tombol, jarang dipakai. Contoh: `[👌 Mengerti]`.

**Pattern 2 — Confirmation.** Dua tombol sebaris untuk "should I do X?". Pakai action verb (`Lanjutkan / Batalkan`) daripada Yes/No kalau action-nya non-trivial — biar intent jelas.

**Pattern 3 — Single-Select.** Tiap opsi satu baris (vertical layout, lebih kebaca di HP buat label panjang). Maks 5 opsi. Lebih dari itu — pakai numbered text list, bukan tombol.

## Wajib: tombol fallback manual

**Setiap prompt multi-choice WAJIB punya tombol terakhir berlabel `✏️ Jelaskan manual` dengan `callback_id: "manual"`.**

Alasannya:

- User mungkin mau kombinasi opsi (Telegram nggak punya checkbox)
- Opsi yang ditawarkan mungkin nggak lengkap
- User mungkin mau tanya balik dulu sebelum commit
- Escape hatch — jangan pernah trap user di option set kamu

Kalau user tap `manual`, balas dengan follow-up pendek (tanpa tombol) yang mengundang free-form text, lalu handle input berikutnya seperti pesan text biasa.

## Anti-pattern yang dilarang

- Pakai tombol untuk pertanyaan free-form
- Pakai tombol kalau jawabannya "obvious yes" (just proceed)
- Lebih dari 5 opsi (switch ke numbered list)
- Operasi destructive tanpa konteks di body message (label tombol doang terlalu pendek)
- Reuse `callback_id` antar prompt yang aktif bersamaan
- Lupa tombol `✏️ Jelaskan manual` di single-select

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
