# Kirim Lampiran Keluar — Desain

**Tanggal:** 2026-08-03 · **Repo kode:** `mirza-bots` · **Repo dokumen:** `mirza-marketplace`
**Asal:** celah #7 (urutan ke-3 paket "termurah dulu") dari `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md`
**Status:** disetujui user lewat inline button, 2026-08-03

---

## 1. Masalah

Tool `reply` sistem baru hanya bisa mengirim teks. `grep sendDocument|sendPhoto|InputFile`
di seluruh `cc-plugin/src` mengembalikan **nol** — bot tidak bisa mengirim
screenshot, PDF, atau berkas laporan.

Ini celah terakhir dari tiga yang user pilih, dan yang paling jarang dipakai.
Tapi ia satu-satunya yang membuat sebuah kalimat di dokumen proyek
**berbohong**: `2026-08-02-keadaan-hari-ini.md` sempat menulis *"kirim PDF"*
sudah terbukti hidup. Itu bukan belum diuji — tidak ada kodenya.

## 2. Pengukuran yang mengubah bentuk desainnya

Diukur dari `messages.db` keenam bot harian (dibuka **readonly**), seluruh umur
data 2026-05-17 s/d 2026-08-03:

| | |
|---|---|
| Berkas keluar, sepanjang hidup | **110** lewat **76 panggilan** `reply` |
| 30 hari terakhir | 60 (**2,0/hari**) — pemakaian terakhir 20 Juli |
| Proporsi dari seluruh balasan keluar | 110 dari 8.010 baris = **1,4%** |

**Berapa berkas sekali kirim:**

| Berkas per panggilan | Panggilan |
|---|---|
| 1 | 60 (79%) |
| 2 | 8 (11%) |
| 3–6 | 8 (10%) |

Enam belas panggilan mengirim lebih dari satu berkas, dan **keenam belasnya
setipe** — tidak ada satu pun yang mencampur foto dengan dokumen.

**Jenis berkasnya:** 60 dokumen, 50 foto. Ekstensi: `.png` 50 · `.md` 40 ·
`.pdf` 12 · `.html` 5 · sisanya satuan.

**Ukurannya:** median **0,06 MB**, p90 1,15 MB, maksimum **4,02 MB**. **Nol**
berkas melewati 10 MB.

**Teks yang menyertainya:** median **636 karakter**, p90 1.124, maksimum 2.148 —
**14% melewati 1.024**, batas keras caption Telegram. Angka itu yang mematikan
opsi "berkas + teks jadi satu pesan bercaption": satu dari tujuh kiriman akan
kehilangan isi.

**Quote pada berkas:** **0 dari 110** baris berkas punya `reply_to`. Sistem lama
menyalinnya kalau ada; ternyata tidak pernah terpakai.

Catatan jujur soal angka ini: seluruhnya dari **sistem lama**, karena di situlah
riwayatnya ada. Dan pemakaian terakhirnya 20 Juli — dua minggu sebelum dokumen
ini ditulis. Jadi 2,0/hari adalah rata-rata atas jendela yang ujungnya sepi,
bukan laju yang sedang berjalan.

## 3. Keputusan user

Enam pertanyaan, semuanya lewat inline button 2026-08-03. Empat pertama datang
dari handoff bot-03; dua terakhir muncul saat membaca kode.

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Satu berkas per panggilan, array, atau album? | **Array, tiap berkas pesan terpisah** | Persis sistem lama. Album ditunda — lihat §5 |
| Teks jadi caption atau pesan terpisah? | **Selalu terpisah** | Satu perilaku, tidak ada aturan yang harus dihafal. 14% teks yang >1.024 char tetap utuh |
| Batas ukuran dan perilaku saat dilewati | **Dua batas** | Foto >10 MB turun jadi dokumen (bukan ditolak); apa pun >50 MB ditolak sebelum ada yang terkirim |
| Bentuk baris di `conversations.db` | **Satu baris per berkas** | Jumlah baris = jumlah pesan di layar, tiap baris ber-`message_id` sendiri |
| `buttons` + `files` boleh barengan? | **Dilarang** | Sama dengan sistem lama |
| Jaga agar state sendiri tidak bisa dikirim? | **Tidak dibangun** | Keputusan sadar — alasannya §3b |

### 3b. Kenapa penjagaan state TIDAK dibangun

Sistem lama punya `assertSendable()`: menolak mengirim berkas dari dalam folder
state-nya sendiri, kecuali `inbox/`. Sistem baru menaruh seluruh state di
`~/.claude/mirza-bots/`, dan di situ ada `config.json` yang memuat **token bot**
(diperiksa, memang ada) serta `conversations.db`.

Rekomendasi penulis spec adalah membawa penjagaan itu. **User memilih tidak**,
dengan alasan yang ditimbang dan diterima: AI sudah bisa `Read` berkas itu lalu
menempelkan isinya, jadi `files` bukan kanal baru — penjagaan itu menutup satu
pintu di rumah yang jendelanya terbuka.

Dicatat di sini supaya keputusannya bisa ditelusuri, dan supaya tidak ada yang
"melengkapi"-nya diam-diam kemudian. Kalau suatu saat dibangun, bentuknya sudah
diketahui: `realpathSync` berkas dan `STATE_DIR`, tolak yang di dalam kecuali
`inbox/`.

### 3c. Dua keputusan kecil yang diambil saat menulis spec

Keduanya bisa dikoreksi user saat meninjau dokumen ini:

- **`text` tetap wajib.** Tidak ada "kirim berkas telanjang". Sistem lama juga
  mewajibkannya (`required: ['chat_id', 'text']`), dan seluruh 76 panggilan
  historis membawa teks. Tidak ada data yang menuntut sebaliknya.
- **Path harus absolut.** Path relatif diselesaikan terhadap cwd proses MCP —
  yang bukan folder yang ada di kepala pemanggilnya. Deskripsi tool lama sudah
  menulis "absolute file paths" tanpa pernah menegakkannya; menegakkan itu murah
  dan menghapus satu kelas kegagalan yang diam.

## 4. Rancangan

### 4a. Modul baru: `src/engine/attach.ts`

Murni — tanpa grammy, tanpa I/O langsung. Pembacaan ukuran berkas disuntik,
supaya seluruh aturannya bisa diuji tanpa menyentuh filesystem.

```ts
export const PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

/** Batas Telegram untuk sendPhoto. Di atas ini foto tetap dikirim, sebagai dokumen. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Batas Telegram untuk sendDocument. Di atas ini tidak ada yang bisa dilakukan. */
export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export type PlannedAttachment = {
  path: string;
  kind: "photo" | "document";
  bytes: number;
};

/**
 * Memvalidasi dan mengklasifikasi seluruh berkas SEBELUM satu pun terkirim.
 * Melempar pada berkas pertama yang bermasalah.
 */
export function planAttachments(
  files: string[],
  sizeOf: (path: string) => number
): PlannedAttachment[];
```

**Aturannya:**

| Masukan | Hasil |
|---|---|
| Path relatif | Lempar: `attachment path must be absolute: <path>` |
| Berkas tidak ada / tidak terbaca | Lempar: `attachment not found: <path>` |
| Ukuran > 50 MB | Lempar: `attachment too large: <path> (61.2MB, max 50MB)` |
| Ekstensi foto, ≤ 10 MB | `kind: "photo"` |
| Ekstensi foto, > 10 MB | `kind: "document"` — turun kelas, **bukan** ditolak |
| Ekstensi lain | `kind: "document"` |

Ekstensi dibandingkan case-insensitive: `.PNG` adalah foto. Array kosong
mengembalikan `[]` — tidak dianggap kesalahan, dan alurnya kembali menjadi
balasan teks biasa.

**Kenapa foto besar diturunkan, bukan ditolak.** Telegram memang menolak
`sendPhoto` di atas 10 MB, dan nol dari 110 berkas historis pernah menyentuh
angka itu. Tapi `.png` adalah ekstensi terbanyak (50 dari 110), dan screenshot
resolusi tinggi persis jenis yang bisa menembusnya. Biayanya satu percabangan;
yang hilang hanya preview inline, bukan berkasnya.

Ini penerapan langsung pelajaran **W-24**: spec celah #1 menulis satu batas
sebagai *"jarang"* dan batas itu menggigit di percobaan hidup pertama. Di sini
klaimnya bukan "jarang" melainkan **"belum pernah terjadi dalam 110 kiriman"** —
dan tambalannya tetap dipasang karena harganya satu baris.

### 4b. Alur `engine.reply()`

Urutannya adalah desainnya. Validasi mendahului pengiriman apa pun, supaya path
yang salah ketik tidak meninggalkan teks yang sudah mendarat tanpa berkas yang
dijanjikannya.

1. `chatId` diketahui? (tidak berubah)
2. `typing.stop(chatId)` (tidak berubah)
3. Pagar narasi tombol (tidak berubah)
4. **`buttons` dan `files` sama-sama ada → lempar**, sebelum satu panggilan API
   pun terjadi
5. **`planAttachments(files)`** — melempar di sini berarti belum ada yang
   terkirim
6. Kirim teks: loop potongan yang sudah ada, tombol di potongan terakhir, quote
   di potongan pertama
7. Kirim tiap berkas berurutan: `sendPhoto` atau `sendDocument` dengan
   `InputFile`
8. Simpan tiap berkas ke `conversations.db`, satu baris masing-masing

**Berkas tidak membawa quote.** Sistem lama menyalin `reply_to` ke tiap berkas;
datanya menunjukkan itu tidak pernah terpakai (0 dari 110). Aturan yang berlaku
sekarang lebih sederhana dan sudah disepakati untuk chunking: **kutipan hanya di
pesan pertama.** Berkas bukan pesan pertama.

**Kegagalan di tengah** memakai pola yang sudah ada di chunking — angka harus
ikut, karena yang sudah mendarat tidak bisa ditarik:

```
reply failed after 1 of 3 attachment(s) sent (text already delivered): <sebab>
```

Frasa `text already delivered` ada supaya pemanggilnya tahu mengirim ulang
seluruh balasan akan menggandakan teksnya.

### 4c. Baris di `conversations.db`

Satu baris per berkas, memakai kolom yang sudah ada dan bentuk yang sudah
dipakai arah **masuk** — sehingga riwayatnya simetris:

| Kolom | Isi |
|---|---|
| `message_id` | id pesan Telegram berkas itu sendiri |
| `text` | `NULL` — teksnya sudah jadi barisnya sendiri |
| `attachments` | `JSON.stringify([path])`, array path polos |
| `metadata` | `{"kind":"photo"}` atau `{"kind":"document"}` |
| `source` | `assistant` |
| `session_id` | `sink.sessionId()`, sama seperti baris teks |

`MessageMetadata.kind` sudah ada dan sudah bertipe `"photo" | "album" |
"document"`. Tidak ada perubahan skema, tidak ada kolom baru, tidak ada migrasi.

`storeOutgoing()` diperluas menerima `attachments?` dan `metadata?`. Seperti
baris teks, kegagalan menyimpan **tidak fatal**: pesannya sudah ada di HP user,
dan melempar di sini akan membuat AI mengira pengiriman gagal.

### 4d. Yang dilihat AI

`ReplyResult` bertambah satu angka:

```ts
export interface ReplyResult {
  chars: number;
  parts: number;
  /** Berapa berkas ikut terkirim. 0 untuk balasan biasa. */
  files: number;
}
```

`formatSendResult` menyusulkannya hanya kalau ada isinya:

```
sent (636 chars)              -- tidak berubah untuk balasan teks
sent (636 chars, 2 files)     -- dengan lampiran
```

Ini penerapan pelajaran yang sudah tertulis: **aturan tanpa umpan balik tidak
bisa dipelajari.** Deskripsi tool boleh menulis apa saja; angka yang balik
sesudah pengiriman adalah satu-satunya bagian yang benar-benar terbaca.

### 4e. Skema tool `reply`

```ts
files: z.array(z.string().min(1)).optional(),
```

Tambahan pada deskripsi tool, ringkas dan menyebut yang tidak bisa ditebak
sendiri: path absolut · gambar terkirim sebagai foto dengan preview, sisanya
sebagai dokumen · tidak bisa digabung dengan `buttons`.

## 5. Yang sengaja TIDAK dibangun

| Hal | Alasan |
|---|---|
| **Album** (`sendMediaGroup`) | Dipilih user. 21% panggilan historis multi-berkas dan semuanya setipe, jadi album *akan* berlaku — tapi ia menambah aturannya sendiri (max 10, harus setipe, caption cuma di item pertama). Bisa ditambahkan belakangan tanpa membongkar kontrak `files` |
| **Penjagaan state** (`assertSendable`) | Dipilih user. Alasan lengkap §3b |
| **Caption** | Dipilih user. 14% teks penyerta melewati batas 1.024 karakter |
| **Quote pada berkas** | 0 dari 110 pemakaian nyata; aturan "kutipan hanya di pesan pertama" sudah ada |
| **Indikator `upload_photo`** | Median berkas 0,06 MB — unggahannya selesai sebelum indikatornya sempat terbaca. Spec typing §5 menunda ini justru sampai celah ini dibangun; sekarang jawabannya terukur, bukan ditunda |
| **Knob konfigurasi batas ukuran** | Dua konstanta bernama, keduanya batas keras Telegram, bukan selera. Penyaring proyek: *"lebih optimal dan sederhana"* |
| **Menghapus berkas setelah terkirim** | Tidak pernah ada di sistem lama; berkasnya milik pemanggil |

## 6. Testing

### `attach.ts` — murni, `sizeOf` disuntik

- foto ≤ 10 MB → `photo`
- foto > 10 MB → `document` (turun kelas, tidak melempar)
- `.pdf`, `.md`, tanpa ekstensi → `document`
- `.PNG` huruf besar → `photo`
- > 50 MB → melempar, pesannya memuat **nama berkas dan ukurannya**
- berkas tidak ada → melempar `attachment not found`
- path relatif → melempar
- berkas bermasalah di posisi ke-2 dari 3 → tetap melempar, tidak ada hasil
  separuh
- array kosong → `[]`, bukan error

### `engine.reply()` — API Telegram palsu, mencatat panggilan

- `buttons` + `files` → melempar, dan **nol panggilan API terjadi**
- berkas tidak valid → **teks tidak terkirim sama sekali** (kriteria kunci §4b)
- 1 foto → satu `sendPhoto`, satu baris db ber-`kind: photo`
- 1 `.pdf` → satu `sendDocument`, `kind: document`
- 2 berkas → 2 baris db, `message_id` berbeda, urutan sesuai urutan masukan
- baris berkas: `text` NULL, `attachments` memuat path, `reply_to` kosong
  meskipun `replyTo` diberikan
- gagal di berkas ke-2 dari 3 → pesan error memuat `1 of 3` dan
  `text already delivered`
- kegagalan penyimpanan db tidak membuat `reply` melempar
- `ReplyResult.files` = jumlah berkas; 0 kalau `files` tidak diberikan

### `server.ts`

- `formatSendResult` menyertakan `, 2 files` hanya kalau `files > 0`
- skema tool menerima `files`, dan menolak path berupa string kosong
- `files: []` diperlakukan persis seperti `files` yang tidak diberikan: balasan
  teks biasa, `ReplyResult.files` = 0

## 7. Berkas yang disentuh

| Berkas | Perubahan |
|---|---|
| `src/engine/attach.ts` | **Baru** |
| `src/engine/engine.ts` | `reply()` menerima `files`; `ReplyResult.files`; `storeOutgoing` menerima `attachments`/`metadata`; tipe `Engine` |
| `src/server.ts` | Skema + deskripsi tool `reply`; `formatSendResult` |
| `test/engine/attach.test.ts` | **Baru** |
| `test/engine/reply-outgoing.test.ts` | Kasus lampiran |
| `test/server.test.ts` | `formatSendResult` + skema |

## 8. Risiko terbuka

- **Angkanya dari sistem lama, dan ujung jendelanya sepi.** Pemakaian terakhir
  20 Juli. Kalau pola kerjanya sudah bergeser, 2,0/hari terlalu tinggi — tapi
  arah kesalahannya aman: fitur ini murah, dan yang mahal (album) justru
  ditunda.
- **Album ditunda sementara 21% panggilan historis mengirim >1 berkas.** Kalau
  rentetan enam screenshot terasa berisik saat dipakai sungguhan, itu sinyal
  untuk membangunnya — dan sinyal itu hanya bisa datang dari pemakaian, bukan
  dari dokumen ini.
- **Batas 10 MB untuk foto belum pernah tersentuh data.** Penurunan kelas ke
  dokumen karena itu belum pernah terbukti hidup; ia dibangun dari spesifikasi
  Telegram, bukan dari kejadian.
- **Uji hidup butuh tangan user.** `bot-uji` tidak terdaftar di agent-bus, jadi
  tidak ada bot yang bisa disuruh mengirim berkas ke sana. Verifikasi harus
  lewat sesi yang user buka sendiri.
