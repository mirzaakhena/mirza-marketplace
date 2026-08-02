# Keadaan Hari Ini — Bahasa Manusia

**2026-08-02.** Satu halaman, tanpa satu pun kode `W-`, `K-`, atau `SCAR-`.
Semua angka di sini diukur langsung dari mesin pagi ini, bukan disalin dari
dokumen lain.

---

## Ada dua sistem yang jalan barengan sekarang

**Yang lama** melayani enam bot harianmu — `bot-01` sampai `bot-06`, termasuk
percakapan Telegram yang sedang kamu baca ini. Enam proses terpisah, satu per
bot, semuanya hidup sejak kemarin siang (18 jam). **Sehat.**

**Yang baru** melayani satu bot percobaan, `bot-uji`. Juga hidup sekarang:
daemonnya jalan 18 jam, dua sesi tersambung ke sana.

Keduanya tidak saling ganggu — tiap bot punya token Telegram sendiri.

## Bedanya di mana

**Yang lama menyimpan segalanya terpisah per bot.** Tiap folder bot punya
salinan setelannya sendiri, riwayatnya sendiri, aturannya sendiri. Enam salinan
yang bisa menyimpang diam-diam, dan tiap perbaikan harus disalin enam kali.
**Itu masalah pokok yang bikin sistem baru dibangun.**

**Yang baru menyimpan segalanya di satu tempat** (`~/.claude/mirza-bots/`): satu
berkas setelan untuk seluruh armada, satu riwayat yang bisa dicari lintas bot.
Itu bagian yang berhasil.

Tapi yang baru punya **tiga bagian** yang harus hidup barengan: pusat data, satu
daemon yang harus kamu nyalakan sendiri dari terminal, dan plugin tipis di tiap
sesi Claude Code. Kerumitan itu yang jadi keluhanmu.

## Yang sudah terbukti hidup di sistem baru

Terkonfirmasi langsung olehmu di Telegram: kirim/terima teks, quote-reply,
navigasi riwayat, pencarian kata kunci, kirim PDF, album tiga foto, tombol
inline, orientasi waktu lokal, dan antrean pesan saat tidak ada sesi terbuka.

## Apa yang sebenarnya sudah dibangun

Ini bagian yang paling perlu kamu lihat sebelum memutuskan membangun ulang dari
nol, karena ini yang akan hilang.

Kode sistem baru **±1.900 baris** dengan **186 test** yang semuanya hijau di
Windows. Isinya, dikelompokkan:

| Bagian | Kira-kira | Ini yang bikin apa jalan |
|---|---|---|
| Penarik pesan Telegram | 300 baris | Terima pesan, tahan banting: tiap galat di-retry dengan jeda naik, satu timeout tidak lagi membuat bot tuli permanen |
| Database + pencarian | 290 baris | Riwayat lintas bot, pencarian kata kunci, navigasi sekitar sebuah pesan |
| Media | 150 baris | Foto, dokumen, album (termasuk album yang sebagian gagal diunduh, dan dokumen di atas 20 MB) |
| Quote-reply | 42 baris | Kamu quote sebuah pesan, botnya tahu yang mana |
| Setelan + zona waktu | 90 baris | Satu berkas untuk seluruh armada; bot tahu kamu sedang begadang atau tidak |
| Tombol | ±150 baris | Tombol inline, keyboard dicopot setelah ditap, dan penolakan otomatis untuk tombol bernomor yang tidak ada keterangannya |
| Daemon + socket | ±750 baris | **Justru bagian ini yang keputusanmu hari ini buang** |
| Plugin + penjaga balasan | ±350 baris | Tool yang dipakai AI, dan penjaga supaya AI tidak diam saja |

**Yang penting dilihat dari tabel ini:** bagian yang bikin repot (daemon +
socket) itu **kurang dari setengah**nya. Sisanya — penarik pesan, media, album,
quote, riwayat, tombol — tidak peduli sama sekali siapa yang memanggilnya, dan
akan tetap dibutuhkan oleh bentuk sistem apa pun yang kamu pilih.

Itu juga jawaban atas "bangun ulang dari nol": yang benar-benar tidak terpakai
lagi cuma bagian daemonnya. Sisanya harus ditulis ulang dari awal — termasuk
belasan perbaikan yang lahir dari kegagalan nyata dan tidak akan kamu ingat untuk
ditulis ulang.

## Tiga hal yang bikin repot

1. **Daemonnya harus kamu nyalakan sendiri**, dan kalau dia mati di tengah
   jalan, botmu langsung bisu **tanpa memberi tahu apa pun**. Sudah terjadi dua
   kali.
2. **Plugin barunya menyala di semua folder bot**, termasuk enam folder lama yang
   tidak dilayaninya. Di sana ia gagal, **mati tanpa suara**, dan meninggalkan
   satu penjaga yang salah alarm — penjaga itulah yang tadi malam menghalangi
   sesi ini tujuh kali berturut-turut.
3. **Balasan bot masih tampil dengan `**bintang**` mentah** di Telegram.

Ketiganya berbagi satu bentuk yang sama: **diam yang tidak bisa dibedakan dari
rusak.** Itu keluhan yang paling sering berulang di proyek ini.

## Keputusan yang kamu ambil hari ini

**Daemonnya dibubarkan.** Isinya dipindahkan ke dalam plugin, jadi tiap sesi
Claude Code menjalankan satu proses yang sudah lengkap. **Pusat datanya tetap
utuh dan tidak dipecah** — yang dibubarkan prosesnya, bukan pemusatannya.

## Kenapa itu masuk akal

Karena sistem **lama** sudah melakukannya persis begitu, dan sedang berjalan di
mesinmu: enam bot, enam proses, masing-masing menampung penarik pesannya sendiri
di dalam prosesnya, hidup 18 jam tanpa daemon apa pun. Jadi ini bukan lompatan
ke sesuatu yang belum pernah dicoba — ini pola yang sudah terbukti tiap hari,
dipindahkan ke sistem baru yang datanya terpusat.

Konsekuensi yang kamu terima sadar: bot hanya hidup selama ada sesi Claude Code
terbuka. Pesanmu tidak hilang — Telegram menahannya sampai 24 jam — tapi
balasannya menunggu sampai sesi berikutnya dibuka.

## Yang sudah tertulis dan bisa dibuang kalau kamu mau

Spec dan rencana implementasi 10 langkah sudah ditulis hari ini. Keduanya
dokumen, bukan kode — **belum satu baris kode pun diubah.** Membuangnya tidak
merusak apa pun yang berjalan.
