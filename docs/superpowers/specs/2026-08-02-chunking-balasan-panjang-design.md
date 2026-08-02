# Chunking Balasan Panjang — Desain

**Tanggal:** 2026-08-02 · **Repo kode:** `mirza-bots` · **Repo dokumen:** `mirza-marketplace`
**Asal:** celah #1 dari `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md`
**Status:** disetujui user lewat inline button, 2026-08-02

---

## 1. Masalah, dengan angkanya

Sistem baru mengirim balasan lewat **satu** panggilan `sendMessage`
(`engine.ts:415`). Telegram menolak apa pun di atas **4096 karakter**, dan
konversi MarkdownV2 **membesarkan** teks karena setiap `.` `-` `(` `)` `!` `+`
di luar markup harus di-escape. Jadi balasan yang mentahnya masih di bawah 4096
pun bisa ditolak setelah dikonversi.

Di kode sistem baru, angka 4096 hanya muncul **satu kali**, di komentar
`engine.ts:414`, sebagai contoh alasan Telegram menolak. Tidak ada yang
menanganinya.

Terukur dari enam bot harian, 30 hari (± 2026-07-03 … 2026-08-02):

| | |
|---|---|
| Panggilan `reply` | 3.183 |
| Yang menghasilkan lebih dari satu pesan | **317 (10,0%)** — ±10,6/hari |
| Potongan terbanyak dalam satu balasan | **7** |

Sistem lama sudah memotong; sistem baru belum. Jadi ini **regresi**, bukan
fitur baru.

## 2. Reframe dari user — dan kenapa itu mengubah desainnya

Pertanyaan awal saya salah bentuk: *"bagaimana cara memotong yang benar?"*
Jawaban user memindahkan pertanyaannya:

> *"Batasi saja panjangnya dari awal. Ini pesan Telegram jadi idealnya tidak
> perlu terlalu panjang untuk menjelaskan."*

Artinya memotong dengan rapi **bukan tujuannya**. Balasan sepanjang tujuh
potongan tetap balasan yang salah bentuk, sepintar apa pun pemotongannya.
Tujuannya: balasan yang memang pendek. Pemotongan turun pangkat jadi jaring
pengaman.

User menambahkan satu syarat: **aturan panjang itu harus ada di dalam prompt**,
bukan cuma di kepala.

## 3. Keputusan user

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Tampilan potongan di HP | **Polos berurutan, tanpa penanda** | Tidak ada `(1/3)`. Menghapus satu aturan yang harus dijelaskan |
| Kalau batas kelewat | **Tetap kirim, dipotong** — bukan ditolak | Isi tidak pernah hilang. Aturan panjang jadi *pedoman menulis*, bukan gerbang |
| Target panjang | **1000 karakter** | 34% pesan 30 hari terakhir melebihinya — cukup sering untuk menggigit tiap hari |
| Kalau gagal di tengah | **Laporkan persisnya** | Error menyebut berapa potongan sudah mendarat, supaya lanjutannya bukan pengulangan |

Angka 1000 dipilih dari sebaran nyata, bukan dikira-kira:

| Target | Pesan yang melebihinya (dari 3.551) |
|---|---|
| 800 | 41% |
| **1000** | **34%** |
| 1500 | 18% |
| 2000 | 3% |

800 mulai memotong penjelasan yang memang butuh ruang; 1500 nyaris tidak
mengubah apa pun.

## 4. Bentuk: dua lapis yang tidak saling tahu

**Lapis aturan (prompt).** Target 1000 karakter, ditulis di deskripsi tool
`reply` dan di `SERVER_INSTRUCTIONS` (`src/server.ts:37`). Mengubah cara AI
menulis. **Tidak memblokir apa pun.**

**Lapis jaring (kode).** Kalau tetap lewat, teks dipotong dan dikirim
berurutan. Ambang potongnya **bukan** 1000 — melainkan batas keras Telegram.

**Kenapa dua ambang, bukan satu.** Kalau jaringnya ikut dipasang di 1000,
balasan 1100 karakter jadi dua pesan: user dapat keramaian tanpa dapat
keringkasan, dan yang berubah cuma bentuk permukaannya. Aturan mengurus gaya;
jaring mengurus batas fisik. Menggabungkan keduanya di satu angka membuat
keduanya gagal.

## 5. Lapis aturan — persisnya di mana

1. **Deskripsi tool `reply`** (`src/server.ts:67`) — satu kalimat: sasaran
   ±1000 karakter, dan kalau butuh lebih panjang, pisah jadi beberapa panggilan
   `reply` yang masing-masing berdiri sendiri, bukan satu blok raksasa.
2. **`SERVER_INSTRUCTIONS`** (`src/server.ts:37`) — aturan yang sama sebagai
   bagian dari kontrak channel, karena itu yang dibaca AI di awal sesi.

**Umpan balik, bukan sekadar harapan.** Hari ini tool menjawab `"sent"`. Ia
akan menjawab panjang yang benar-benar terkirim dan berapa pesan yang keluar,
dan menandai kalau melewati pedoman:

```
sent (642 chars)
sent (1240 chars, over the 1000 guideline)
sent (5100 chars in 3 parts, over the 1000 guideline)
```

Hanya AI yang melihat baris ini. Ini menutup jarak antara "aturan yang ditulis"
dan "aturan yang terasa": aturan tanpa umpan balik akan luntur, dan proyek ini
sudah pernah membayarnya — parameter `format` di sistem lama yang seharusnya
diingat AI, sampai user melihat `**tebal**` mendarat mentah di HP-nya.

## 6. Lapis jaring — algoritmanya

Modul baru: **`src/engine/chunk.ts`**. Murni fungsi, tanpa I/O, tanpa
ketergantungan ke grammy — bisa diuji sendiri.

### 6.1 Jalur cepat lebih dulu: coba utuh

Konversi seluruh teks. **Kalau hasilnya ≤4096, kirim sebagai satu pesan dan
selesai** — tidak ada pemotongan, tidak ada margin, tidak ada perubahan
perilaku. Ini yang terjadi pada **90% balasan**, dan jalurnya harus persis
seperti hari ini supaya fitur ini tidak menyentuh apa yang sudah bekerja.

Baru kalau hasil konversinya melebihi 4096, §6.2–6.3 berlaku.

Ini juga yang membuat janji di §4 benar secara harfiah: balasan 1200 karakter
tetap **satu** pesan, karena konversinya masih jauh di bawah 4096.

### 6.2 Di jalur potong: potong dulu, baru konversi

Urutan ini **load-bearing**, bukan preferensi. Kalau teks yang sudah dikonversi
yang dipotong, satu entity bisa terbelah — `*tebal` terbuka di potongan 1 dan
tertutup di potongan 2 — dan Telegram menolak **seluruh potongan itu** dengan
`can't parse entities`. Sistem lama menemukan ini di produksi dan komentarnya
masih ada di `server.ts:754`.

Jadi yang dipotong selalu **CommonMark mentah**, dan tiap potongan dikonversi
sendiri-sendiri.

### 6.3 Potong di batas paragraf

Urutan preferensi titik potong, dari yang paling disukai:

1. baris kosong (`\n\n`) — batas paragraf
2. baris tunggal (`\n`)
3. spasi
4. potong keras — hanya kalau tiga di atas tidak ada

Kandidat hanya diterima kalau letaknya melewati **setengah** jendela; kalau
tidak, potongannya jadi kerdil dan jumlah pesan meledak. Aturan ini diwarisi
apa adanya dari `chunk()` sistem lama (`server.ts:477`) — sudah terbukti
harian, tidak ada alasan menulis ulang.

### 6.4 Margin, karena escaping membengkak

Di jalur potong, teks mentah dipotong terhadap margin **2048** — setengah batas
— lalu tiap potongan dikonversi dan **diverifikasi**: kalau hasilnya masih
≤4096, kirim sebagai MarkdownV2; kalau membengkak melewatinya, potongan itu
dikirim sebagai **teks polos**. Jelek, tapi tidak ada yang hilang.

Margin bukan angka sakti, dan bukan pula tempat kebenarannya berdiri: ia cuma
harus cukup longgar supaya kasus escape-berat tetap muat. **Verifikasi
per-potongan** yang menjaga kebenaran; margin hanya membuat verifikasi itu
jarang gagal. Nilai yang sama dipakai sistem lama.

### 6.5 Yang menempel di potongan mana

| Hal | Potongan | Alasan |
|---|---|---|
| Tombol (`buttons`) | **terakhir** | Keyboard di potongan tengah menggantung di atas teks lanjutan |
| Kutipan (`reply_to`) | **pertama** | Yang dijawab adalah balasannya secara keseluruhan |

## 7. Penyimpanan

**Satu baris `conversations.db` per potongan**, masing-masing dengan
`message_id` aslinya dari Telegram, lewat `storeOutgoing()`
(`engine.ts:90`). Bukan satu baris untuk seluruh balasan.

Alasannya konkret: bot sudah bisa mengutip pesannya sendiri, dan yang dikutip
adalah **satu pesan Telegram**, bukan "balasan ke-5". Satu baris gabungan tidak
punya id yang sah untuk dikutip. Ini juga persis perilaku sistem lama
(`server.ts:852`).

`text` yang disimpan tetap **CommonMark mentah** potongan itu, bukan hasil
MarkdownV2-nya — aturan yang sudah berlaku dan tidak berubah.

## 8. Kegagalan

### 8.1 Gagal di tengah

Potongan 1–2 mendarat, potongan 3 ditolak. Yang sudah mendarat **tidak bisa
ditarik balik**, jadi pesan errornya harus membawa kenyataan itu:

```
reply failed after 2 of 7 parts sent: <alasan asli dari Telegram>
```

Tanpa angka itu, refleks AI berikutnya adalah mengirim ulang seluruhnya, dan
user menerima potongan 1–2 dua kali.

**Potongan yang sudah terkirim tetap disimpan** sebelum error dilempar. Riwayat
harus mencerminkan apa yang benar-benar ada di HP user, bukan apa yang
seharusnya terjadi.

### 8.2 Konversi membengkak

Sudah ditangani §6.4: potongan itu dikirim polos. Tidak dianggap galat, tidak
menghentikan potongan berikutnya.

### 8.3 Yang tidak berubah

Penjaga narasi tombol (`findMissingButtonNarration`) tetap berjalan atas teks
**utuh sebelum dipotong**. Ia mencocokkan daftar bernomor dengan label tombol;
menjalankannya per potongan akan membuatnya menolak balasan yang sah hanya
karena daftarnya kebetulan jatuh di potongan lain.

## 9. Yang sengaja TIDAK dibangun

| Hal | Alasan |
|---|---|
| Penanda `(1/3)` | Ditolak user. Tanpa penanda = tanpa aturan yang harus dijelaskan |
| Menolak kiriman yang lewat 1000 | Ditolak user. Isi hilang > isi panjang |
| Knob konfigurasi (`textChunkLimit`, `chunkMode`, `replyToMode`) | Sistem lama punya tiga; nol pemakaian. Penyaring proyek ini: *"lebih optimal dan sederhana"* |
| Kirim sisa sebagai berkas | Butuh celah #7 (kirim lampiran keluar) yang belum ada |
| Penanganan khusus pagar kode (```) yang terbelah | **Batas yang diketahui, dicatat sengaja.** Butuh parser, bukan pencari batas. Potongan yang membelah pagar kode tetap terkirim — formatnya rusak, isinya utuh. Diangkat kalau benar-benar menggigit |

## 10. Testing

TDD. Unit test murni untuk `chunk.ts`, karena ia tidak menyentuh jaringan:

- **jalur cepat:** teks yang hasil konversinya ≤4096 → **tepat satu**
  `sendMessage`, isinya identik dengan hari ini. Ini yang menjaga 90% kasus
  tidak ikut berubah
- teks di bawah batas → **tepat satu** potongan, tidak disentuh sama sekali
- teks di atas batas → potong di baris kosong, bukan di tengah kalimat
- tidak ada batas yang layak → potong keras, tidak ada teks yang hilang
- **properti yang paling menjaga:** gabungan seluruh potongan = teks asli
  (setelah normalisasi baris kosong di sambungan). Satu test ini yang mencegah
  "perbaikan" yang diam-diam membuang isi — persis cara W-21 dijaga
- teks yang escaping-nya membengkak → potongan itu turun ke teks polos, sisanya
  tetap MarkdownV2
- tombol hanya di potongan terakhir; kutipan hanya di potongan pertama
- gagal di potongan ke-N → error menyebut N-1 sudah terkirim, **dan** N-1 baris
  tersimpan di db

## 11. Berkas yang disentuh

| Berkas | Perubahan |
|---|---|
| `src/engine/chunk.ts` | **Baru.** Pemotong murni |
| `src/engine/engine.ts` | `reply()` — loop kirim, tombol/kutipan per posisi, simpan per potongan, error partial |
| `src/server.ts` | Deskripsi tool `reply` + `SERVER_INSTRUCTIONS` (aturan 1000), dan nilai balik yang informatif |
| `test/engine/chunk.test.ts` | **Baru** |
| `test/engine/reply-outgoing.test.ts` | Tambahan kasus multi-potongan |

## 12. Risiko terbuka

- **Aturan 1000 bisa luntur.** Ia prompt, bukan gerbang — itu pilihan sadar
  user. Umpan balik `over the 1000 guideline` adalah penawarnya, dan
  keampuhannya **belum terukur**. Layak diperiksa ulang dari `conversations.db`
  setelah beberapa minggu: kalau sebaran panjangnya tidak bergeser, aturannya
  tidak bekerja dan itu akan kelihatan dari angka, bukan dari perasaan.
- **Batas 4096 dihitung dalam karakter JavaScript, bukan cara Telegram
  menghitung.** Emoji dan karakter di luar BMP dihitung berbeda. Tidak menggigit
  hari ini karena margin 2048 memberi ruang besar; akan menggigit kalau margin
  pernah dinaikkan mendekati batas.
