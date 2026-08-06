# Penamaan Sesi Otomatis di Sistem Baru — Design

**Tanggal:** 2026-08-06 · **Penyusun:** bot-02 (brainstorming bersama user)
**Repo sasaran:** `C:\Users\Mirza\workspace\mirza-bots` (`cc-plugin`)
**Menggantikan:** perilaku skill `name-session` sistem lama
(`mirza-marketplace/plugins/telegram/skills/name-session`)
**Melanjutkan:** `area-10-disiplin-balas.md` §10.C, `area-05-manajemen-sesi.md`
§5.4/§5.6, ekstraksi B-6

---

## 1. Masalah

Sesi yang tidak bernama sulit ditemukan lagi. Itu benar di sistem lama, dan di
sistem baru **taruhannya naik** karena tiga hal yang saling mengunci:

1. **§5.4 mencabut lifecycle dari nama sesi.** Dulu nama merangkap state mesin
   (`idle` = siap, `task-` = sibuk, `done-` = arsip), jadi sesi **selalu**
   bernama — bukan karena disiplin, melainkan sebagai efek samping. Begitu
   lifecycle pindah ke field data, **tidak ada lagi yang memaksa**: sebuah sesi
   bisa hidup selamanya tanpa nama.
2. **`/switch` hanya menampilkan N terbaru** (§5.6, paginasi dibuang). Sesi tanpa
   nama di picker adalah baris yang tidak bisa dikenali.
3. **B-6 menyembunyikan sesi remeh** dari picker, dan salah satu kandidat
   kriterianya adalah "tak pernah dinamai". Kalau penamaan otomatis belum jalan,
   sesi kerja nyata bisa hilang dari picker hanya karena belum sempat dinamai.
   **Urutan wajib: penamaan otomatis lebih dulu.**

Sistem baru saat ini **tidak punya apa pun** dari ini: skill `name-session` tidak
ada di sana, dan pemicunya — baris konteks `Current Telegram session name: "…"`
yang disuntik hook SessionStart sistem lama — juga tidak ada. Hook SessionStart
sistem baru hanya menulis `session.id` ke berkas dan tidak mengeluarkan
`additionalContext` sama sekali.

## 2. Keputusan user (2026-08-06)

| Pertanyaan | Keputusan | Catatan |
|---|---|---|
| Tombol usul-nama, atau auto-rename? | **Auto-rename (§10.C)** | Bentuk lama (`[Pakai] [Nama lain] [Nanti saja]`) **dibuang**. Alasan: satu tap per sesi baru adalah biaya yang justru menghidupkan kembali masalahnya — kalau user malas tap, sesi tetap tanpa nama |
| Sekali ingatkan, atau pemicu menetap? | **Pemicu MENETAP selama sesi belum bernama** | Permintaan eksplisit user: *"Selama session 'belum bernama', akan terus ada pemicu yang akan mengingatkan bot."* |
| Penamaan sesi penerima handoff | **Bukan lewat mekanisme ini** | Pengirim handoff sudah tahu slug-nya; nama dipasang di detik pertama, pemicu tidak pernah menyala |
| Pembagian peran mesin vs AI | **Mesin HANYA mengingatkan; AI yang memutuskan dan memanggil `/rename`** | Ditegaskan user 2026-08-06: *"Mesin disini hanya (secara cerewet akan terus) mengingatkan bahwasanya session belum dinamai. AI yang akan memutuskan membuat nama dan memanggil /rename."* Lihat §4.5 |
| Nilai N (giliran minimum) | **N = 2** | User 2026-08-06, menggeser usul §10.C (3). Lihat §4.4 |

## 3. Prinsip yang menentukan bentuknya

**Pemicu adalah KEADAAN, bukan PERISTIWA.**

Sistem lama event-driven: hook menyala **sekali** saat sesi mulai. Karena hanya
sekali, ia butuh aturan penjaga — *"ingatkan sekali lalu berhenti"*, *"jangan
nagih"* — dan aturan itu menuntut AI **mengingat** apakah sudah pernah
mengingatkan. Ingatan AI adalah barang yang paling mudah hilang: satu `/compact`
dan ia lenyap.

Sistem baru state-driven: selama kondisi *"belum bernama"* bertahan, pemicunya
ada. Yang **hilang** karena pergeseran ini — dan ini membuat desainnya lebih
kecil, bukan lebih besar:

- tidak perlu flag "sudah pernah diingatkan"
- tidak perlu aturan "jangan nagih"
- tidak perlu AI mengingat apa pun antar-giliran
- **tidak perlu logika berhenti** — begitu sesi bernama, kondisinya tidak lagi
  terpenuhi dan pemicunya lenyap sendiri
- **self-healing**: kalau giliran ke-N terlewat karena sebab apa pun, giliran
  ke-N+1 masih membawa pemicunya

⚠️ **Pemicu ini mengingatkan BOT, bukan menagih user.** User tetap hanya
mendengar sekali: saat nama sudah terpasang.

## 4. Arsitektur

### 4.1 Di mana pemicu hidup

Di `cc-plugin/src/engine/telegram/poller.ts`, tempat `PushMessage.meta` disusun
untuk setiap pesan Telegram masuk (± baris 233). **Tidak ada hook baru, tidak ada
proses baru, tidak ada state baru.**

Alasan memilih tempat ini di atas hook SessionStart:

| | Hook SessionStart | Meta tiap pesan |
|---|---|---|
| Frekuensi | sekali per sesi | tiap pesan |
| Kesegaran data | `status.json` belum sempat diperbarui untuk sesi baru | statusline sudah digambar berkali-kali |
| Berhenti sendiri saat sesi dinamai | tidak | ya |
| Butuh AI mengingat | ya | tidak |

### 4.2 Tiga masukan, semuanya sudah ada

| Masukan | Sumber | Catatan |
|---|---|---|
| Nama sesi sekarang | `<botHome>/status.json` → `payload.session_name` | Kode sudah memperlakukannya sebagai **opsional** (`render.ts:21` `session_name?`, `render.ts:157` fallback `Session: <shortId>` tanpa nama) |
| Jumlah giliran sesi ini | `conversations.db`, `COUNT(*) WHERE session_id = <sesi sekarang> AND source = 'user'` | Kolom `session_id` sudah ada (`conversations-schema.ts:54`). **Giliran = pesan MASUK dari user**, bukan total baris — balasan bot tidak dihitung, karena satu pertanyaan panjang yang dijawab tiga pesan bukan tiga giliran percakapan |
| Kesegaran `status.json` | `payload.session_id` vs isi `<botHome>/session.id` | `session.id` ditulis hook SessionStart, selalu segar |

### 4.3 Guard kebasian — dan kenapa ia wajib

`status.json` hanya diperbarui **saat statusline digambar ulang**. Saat sesi baru
lahir dari `/clear`, hook SessionStart berjalan lebih dulu dan statusline
menyusul — jadi ada jendela waktu ketika `status.json` masih memuat nama sesi
**sebelumnya**. Tanpa guard, mesin akan menyimpulkan "sesi ini sudah bernama"
dari nama sesi yang sudah mati.

Kebasian `status.json` **sudah terukur** di proyek ini: ia sempat memuat
`uji-batch-1` sementara nama sesi sebenarnya sudah `uji-batch-2`.

Guardnya murah dan pasti:

```
status.json.payload.session_id !== isi session.id  →  BASI  →  diam
```

⚠️ **Diam, bukan menebak.** Ini penerapan langsung Tingkat 15: pemicu yang bisa
menyala di sesi yang salah lebih berbahaya daripada tidak ada pemicu, karena ia
terlihat seperti sudah bekerja.

### 4.4 Keputusan penamaan (fungsi murni)

```
shouldNudgeNaming({ sessionName, turnCount, statusFresh, minTurns }) -> boolean
```

Mengembalikan `true` **hanya bila ketiganya benar**:

1. `statusFresh === true`
2. `sessionName` falsy (absent / string kosong)
3. `turnCount >= minTurns` — **`minTurns = 2`** (keputusan user 2026-08-06)

Murni: tanpa I/O, tanpa jam, tanpa filesystem — seluruh matriks keputusannya bisa
diuji tanpa satu pun berkas.

### 4.5 Bagaimana pemicu sampai ke AI

Saat `shouldNudgeNaming` bernilai `true`, satu baris **pengingat** ikut menempel
pada konten push — mekanisme yang sama dengan marker `[protocol: terse-turn]`
yang sudah ada (`server.ts:59` `markerFor`).

**Pembagian perannya ditegaskan user 2026-08-06, dan batasnya tajam:**

> *"Mesin disini hanya (secara cerewet akan terus) mengingatkan bahwasanya
> session belum dinamai. AI yang akan memutuskan membuat nama dan memanggil
> `/rename`."*

| Mesin | AI |
|---|---|
| Menyatakan **fakta**: sesi ini belum bernama | Memutuskan **apakah** arah percakapan sudah cukup jelas |
| Mengulanginya di **tiap** pesan selama fakta itu bertahan | Mengarang **namanya** |
| — | Memanggil `send_slash "/rename <nama>"` |
| — | Memberi tahu user satu baris sesudahnya |

Mesin **tidak** menyarankan nama, **tidak** menentukan waktunya, dan **tidak**
menerapkan apa pun. Bunyi pengingatnya karena itu tetap satu pernyataan keadaan,
bukan perintah berparameter:

> `[sesi ini belum bernama]`

⚠️ **Ini menggeser satu kalimat §10.C, dan digeser dengan sadar.** §10.C menulis
*"mesin meminta nama ke AI dan menerapkannya"*. Dua alasan: (a) arsitektur push
satu arah — mesin tidak punya kanal untuk meminta nama lalu menunggu jawabannya
tanpa membangun kanal baru; (b) **keputusan user hari ini**, yang menaruh seluruh
penilaian di AI. **Semangat §10.C tetap utuh — mesin menjamin STRUKTUR (pemicunya
mekanis, berulang, tak bisa dilupakan), AI mengisi ISI.** Yang bergeser hanya
siapa yang mengetik perintahnya.

**Kenapa pembagian ini justru yang membuat N boleh kecil:** karena AI memegang
penilaian "sudah jelas belum", N tidak perlu menjadi tebakan yang tepat. N cuma
gerbang bawah — kalau di giliran ke-2 arahnya belum jelas, AI boleh menunggu, dan
pengingatnya masih ada di giliran ke-3, ke-4, seterusnya. **Mesin yang cerewet
membuat AI boleh sabar.**

**Alternatif yang ditolak:** mesin memanggil model terpisah untuk mengarang nama.
Butuh kanal baru, biaya token sendiri, dan menambah satu tempat yang bisa gagal —
untuk keuntungan nol, karena AI sesi itu sudah membaca percakapannya.

### 4.6 Jalur handoff — sengaja tidak lewat sini

Sesi penerima handoff **lahir sudah bernama**: pengirim tahu pekerjaannya dan
sudah memiliki slug (file handoff memakai slug yang sama). Karena
`sessionName` terisi sejak awal, `shouldNudgeNaming` mengembalikan `false` dan
pemicunya tidak pernah menyala.

**Dua jalur, satu tujuan — jangan ada sesi tanpa nama:**

| Asal sesi | Siapa yang tahu namanya | Kapan dipasang |
|---|---|---|
| Handoff | pengirim | detik pertama |
| Sesi baru | percakapan itu sendiri | setelah N giliran |
| *(selalu ada)* | user | kapan saja, `/rename` manual |

Jalur ketiga itulah yang membuat dua jalur pertama boleh meleset: keduanya tidak
perlu sempurna, hanya perlu tidak meninggalkan sesi tanpa nama.

## 5. Penanganan gagal

Seluruhnya **gagal ke diam**, tidak pernah ke tebakan:

| Keadaan | Perilaku |
|---|---|
| `status.json` tidak ada / rusak / tidak bisa di-parse | diam |
| `session.id` tidak ada | diam (kesegaran tidak bisa dipastikan) |
| `conversations.db` gagal dibaca | diam |
| Nama karangan AI tidak valid (spasi / newline / > 120 char) | `validateSessionName` (`slash/session-name.ts`) menolak dengan pesannya sendiri; pemicu tetap ada di pesan berikutnya |
| AI mengabaikan pemicunya | tidak apa-apa — pemicunya menetap, giliran berikutnya membawanya lagi |

Tidak ada satu pun cabang gagal yang menghalangi pesan Telegram sampai ke AI.
Penamaan tidak boleh pernah menjadi alasan sebuah pesan tidak terkirim.

## 6. Testing

| Lapis | Yang diuji |
|---|---|
| Murni | `shouldNudgeNaming` — matriks lengkap: bernama/tidak × giliran < N/≥ N × segar/basi |
| Murni | pembaca `status.json`: absent, JSON rusak, `session_name` absent, `session_name` string kosong |
| Integrasi | `meta` push memuat penanda hanya saat ketiga syarat terpenuhi |
| Integrasi | guard kebasian: `session_id` tidak cocok → tidak ada penanda meskipun `session_name` kosong |
| Regresi | pesan tetap sampai ke AI saat `status.json` hilang |

**Mutation check wajib** sebelum menyatakan hijau: buktikan mutasinya terpasang
utuh (grep = 1), lihat testnya MERAH, baru cabut. Prosedur ini terbayar lima kali
dalam satu sesi pada 2026-08-05.

**Uji hidup** (bukan test): buat sesi baru di bot uji, kirim N+1 pesan, pastikan
nama benar-benar terpasang — dibuktikan dari `status.json` **dan** transcript
Claude Code (`custom-title`), bukan dari klaim bot.

## 7. Yang TIDAK termasuk scope

- **Penyembunyian sesi remeh (B-6)** — tetangga, dan urutannya sesudah ini.
  Kontradiksi tiga-dokumen soal kriteria "tak pernah dinamai" **belum
  diputuskan** dan tidak diputuskan di sini.
- **`/switch` + angka N picker** — user menyebut 5, dokumen menulis "mis. 8";
  belum ditetapkan.
- **Penamaan sesi penerima handoff** — jalur terpisah (§4.6). Handoff sendiri
  masih menunggu `agent_status`, yang hilang di sistem baru.
- **Peleburan skill jadi `telegram-conduct`** (§10.D) — keputusan lain.

## 8. Ketergantungan

Tidak ada. Seluruh bahannya sudah ada di sistem baru: `status.json`, `session.id`,
kolom `session_id` di `conversations.db`, `send_slash`, `validateSessionName`,
dan tempat penyusunan `meta`.

## 9. Pertanyaan terbuka

**Tidak ada.** Nilai N ditetapkan user 2026-08-06: **N = 2**, menggeser usul
§10.C (3).

Angka itu aman justru karena §4.5 menaruh penilaian di AI: N adalah **gerbang
bawah**, bukan tebakan yang harus tepat. Di giliran ke-2 AI boleh memutuskan
arahnya belum jelas dan menunggu — pengingatnya masih ada di giliran berikutnya,
dan berikutnya lagi. Yang dipertaruhkan oleh N cuma kecepatan, tidak pernah
hasilnya.
