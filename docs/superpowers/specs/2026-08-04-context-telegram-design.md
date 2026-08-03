# `/context` di Sistem Baru — Tanpa Mengorbankan Statusline

**Tanggal:** 2026-08-04 · **Status:** disepakati user lewat brainstorming, belum
punya rencana implementasi
**Repo kode:** `mirza-bots` (`cc-plugin`) · **Repo dokumen:** `mirza-marketplace`
**Lanjutan dari:** `2026-08-03-lapisan-slash-telegram-design.md` (tahap 2, bagian
`/context`)

---

## 1. Syarat yang mengatasi segalanya

> **Statusline Claude Code milik user harus tetap hidup. Kalau harus memilih,
> `/context` yang mengalah.**

Ini pernyataan user, diucapkan dua kali dan dipertegas sendiri: *"Saya tidak
ingin seperti aplikasi lama yang mengorbankan statusline demi /context. Saya
ingin keduanya tetap hidup… Intinya statusline jangan sampai hilang."*

Syarat ini bukan preferensi tampilan. Ia lahir dari **regresi yang masih hidup
saat spec ini ditulis**: statusline user tergusur di **enam dari enam** bot
harian, dan yang menemukannya user, bukan sistemnya. §3 merunutnya.

Konsekuensi desain yang mengikat seluruh dokumen ini: setiap kali ada
pertanyaan "`/context` atau statusline?", jawabannya sudah ditentukan di muka.

## 2. Kenapa `/context` tidak bisa "baca statusline langsung"

Pertanyaan user: *"Setahu saya `/context` bisa langsung ambil data dari
statusline?"* Jawabannya **tidak bisa**, dan alasannya menentukan seluruh bentuk
desain — jadi ditulis di sini, bukan diasumsikan.

**Statusline itu push, bukan pull.** `statusLine` di `settings.json` berisi
sebuah **command**. Claude Code menjalankan command itu setiap kali baris status
perlu digambar ulang, mengirim JSON ke **stdin**-nya, dan menampilkan apa pun
yang dicetak ke **stdout**. Tidak ada penyimpanan, tidak ada API "bacakan
statusline sekarang". Datanya hanya lewat, pada momen yang ditentukan CC.

**Bukti paling jujur datang dari sistem lama sendiri** — pesan errornya di
`plugins/telegram/server.ts:1100`:

> *"Bridge installed, but no data yet. Claude Code's statusLine has not
> triggered. Be active in Claude Code for a moment, then send /context again."*

Kalau data itu bisa ditarik kapan saja, keadaan "belum ada data" **tidak akan
pernah mungkin**. Adanya pesan itu adalah pengakuan bahwa datanya harus
ditunggu.

**Akibatnya:** satu-satunya cara memperoleh payload itu adalah **menjadi**
command statusline (atau dipanggil olehnya), menangkapnya, lalu menyimpannya.
Berkas tangkapan (`last-status.json` di sistem lama) bukan lapisan tambahan yang
bisa dihemat — ia satu-satunya bentuk yang mungkin.

Dan karena Claude Code hanya mengizinkan **satu** `statusLine` command, tidak ada
slot kedua yang bisa dipakai berdampingan. **Chaining bukan pilihan gaya; ia
satu-satunya jalan** yang memenuhi §1.

## 3. Kenapa statusline hilang di sistem lama — rantai lengkapnya

Yang paling perlu dipahami: **tidak ada satu pun langkah yang error.** Semuanya
"berhasil", dan hasilnya statusline user tetap hilang.

### 3.1 Keadaan awal

| Lapisan | Isi |
|---|---|
| `~/.claude/settings.json` (user) | `statusLine.command = C:/Users/Mirza/.claude/statusline-progress.sh` — **statusline user, hidup** |
| `<bot>/.claude/settings.json` (project) | **belum ada berkasnya sama sekali** |

Claude Code memberi **project** presedens atas user untuk key yang sama.

### 3.2 Saat `/context` pertama dipanggil

`ensureContextBridgeInstalled()`, `plugins/telegram/server.ts:1235-1271`:

1. Buka **project** `settings.json` → tidak ada → anggap `{}`
2. `const current = (settings.statusLine ?? {})` → `{}`
3. `current.command` → `undefined`
4. `previousCommand = ... ? current.command : null` → **`null`**
5. `writeFileSync(join(STATE_DIR, 'chained-statusline'), previousCommand ?? '')`
   → **string kosong**
6. `settings.statusLine = { type: 'command', command: CONTEXT_BRIDGE_PATH }`,
   lalu tulis ke project `settings.json`

### 3.3 Saat CC menggambar baris status

1. Resolusi settings → project menang → yang dipanggil **context-bridge**
2. `statusline-progress.sh` **tidak dihapus**, hanya tidak pernah dipanggil lagi
3. Bridge menulis `last-status.json`, lalu:
   `if (existsSync(chainFile))` **true** (berkasnya ada) →
   `chain = readFileSync(...).trim()` → `''` →
   `if (chain)` **false** → tidak memanggil siapa pun
4. Bridge **tidak mencetak apa pun ke stdout** (48 baris, `stderr` hanya untuk
   error)
5. CC menampilkan stdout kosong → **baris status kosong**

### 3.4 Dua kesalahan yang bertumpuk

**(a) Melihat lapisan yang salah.** Installer mencari pendahulunya di lapisan
project, padahal pendahulunya ada di lapisan user.

**(b) Memperlakukan `null` sebagai "memang tidak ada"** — padahal artinya "**aku
tidak menemukannya**". Dua kondisi yang sangat berbeda menjadi `null` yang sama,
lalu `?? ''` menelannya tanpa protes.

**Kesalahan (a) sendirian belum mematikan.** Yang mematikan adalah (b): tidak ada
momen di mana kode berhenti dan bertanya *"aku tidak menemukan statusline
sebelumnya — yakin mau lanjut?"*. Chaining-nya **dibangun**; yang tidak ada
adalah pemeriksaan apakah niat itu tercapai.

### 3.5 Kenapa bertahan lama tanpa ketahuan

Baris status kosong tidak melempar error, tidak masuk log, tidak membuat apa pun
gagal. Satu-satunya sensor yang bisa menangkapnya adalah **mata manusia yang
kebetulan melihat ke bawah layar**. Terbukti: enam dari enam bot, dan yang
menemukannya user.

**Bukti yang mendasari §3** (dua sumber yang saling bebas, bukan satu):

| Meteran | Hasil |
|---|---|
| `chained-statusline` keenam bot | **0 byte, semuanya** |
| `bot-02/.claude/settings.json` | isinya **hanya** `statusLine` — berkas itu memang dibuat dari nol oleh installer |
| `~/.claude/settings.json` | `statusLine` → `statusline-progress.sh`, masih utuh |
| Kode `context-bridge.ts` | `if (chain)` gagal pada string kosong; tidak ada penulisan ke stdout |
| Laporan user | statusline hilang di bot harian |

**Batas klaim yang dinyatakan, bukan disembunyikan:** rantai di atas dibaca dari
kode dan artefak di disk. Baris "baris status kosong" adalah **prediksi dari
kode**, bukan hasil melihat terminal user. Ia cocok dengan gejala yang user
laporkan — dua sumber bebas yang bertemu di kesimpulan yang sama.

## 4. Koreksi terhadap spec sebelumnya

`2026-08-03-lapisan-slash-telegram-design.md` §7 no. 4 menulis:

> *"`/context` butuh apa persisnya di sistem baru. Sistem lama membacanya dari
> `last-status.json` yang ditulis jembatan statusline; **sistem baru punya
> statusline sendiri**, dan isinya belum dibandingkan."*

**Bagian yang ditebalkan itu keliru.** Terukur 2026-08-04:

- `grep -rn -i "statusline|status_line|last-status"` atas seluruh `mirza-bots` →
  **nol kode**; yang muncul hanya satu komentar di `slash/classify.ts` dan satu
  baris README
- `bot-uji` **tidak punya `.claude/settings.json` sama sekali** — hanya
  `.claude/channels/`
- `~/.claude/settings.json` memang punya `statusLine`, tapi itu milik **user**
  (`statusline-progress.sh`), bukan milik sistem baru

**Sistem baru tidak punya statusline apa pun.** Jadi "membandingkan isinya"
bukan pekerjaan yang tertunda — ia pekerjaan yang tidak punya objek. Yang
sesungguhnya perlu diputuskan adalah bagaimana sistem baru **menampung** payload
yang sama tanpa melanggar §1.

Konsekuensi lain yang ikut gugur: dugaan bahwa `/context` mahal. Bahan bakunya
sudah ada dan **murni**:

| Berkas sistem lama | Baris | Sifat |
|---|---|---|
| `plugins/telegram/scripts/context-bridge.ts` | 48 | I/O; menangkap stdin, menulis berkas, meneruskan rantai |
| `plugins/telegram/context-renderer.ts` | 170 | **nol `import`** — murni sepenuhnya, langsung portabel |

## 5. Bentuk desain

### 5.1 Tiga bagian, batas yang jelas

| Bagian | Tugas | Sifat |
|---|---|---|
| **Penangkap** (bridge) | Baca stdin statusLine → tulis berkas tangkapan → **jalankan statusline pendahulu dan teruskan tampilannya apa adanya** | I/O, dijalankan CC |
| **Pemasang** (installer) | Menentukan statusline pendahulu, menyimpannya, memasang bridge — **atau menolak memasang** | I/O, dijalankan sekali |
| **Perender** | Payload tangkapan → teks Telegram | **Murni**, bisa dites tanpa berkas |

Perender wajib murni, mengikuti pola empat modul `slash/` tahap 1 yang sudah
terbukti: yang murni dites tuntas, yang tidak murni dibuat sekecil mungkin.

### 5.2 Aliran

```
CC menggambar baris status
        │
        ▼
   bridge (jadi `statusLine.command`)
        ├─ tulis payload ke berkas tangkapan (atomik: .tmp lalu rename)
        └─ jalankan statusline pendahulu, teruskan stdout-nya apa adanya
                 │
                 ▼
        yang user lihat = statusline miliknya sendiri, byte per byte

/context dari Telegram
        │
        ▼
   baca berkas tangkapan → perender → balasan
   (TIDAK dikirim ke CC — keputusan user, spec tahap 1 §4)
```

Bridge **tidak mencetak apa pun sendiri**. Tampilan baris status sepenuhnya
milik statusline pendahulu.

### 5.3 Empat pagar — mengubah niat jadi jaminan

Sistem lama juga berniat melakukan chaining. Yang tidak ada adalah pemeriksaan.
Keempat pagar ini ada supaya kegagalan yang sama **gagal dengan berisik**.

**Pagar 1 — resolusi dua lapisan.** Statusline pendahulu dicari mengikuti
presedens Claude Code: **project dulu, lalu user/global**. Ini menutup akar bug
§3.4(a).

**Pagar 2 — verifikasi sesudah memasang, bukan sebelum.** Sesudah menulis,
installer membaca ulang hasilnya. Bila ada statusline pendahulu tetapi berkas
rantai kosong → **rollback**: `settings.json` dikembalikan seperti semula.

**Pagar 3 — menolak memasang kalau ragu.** Bila installer tidak dapat memastikan
apa statusline pendahulu, ia **tidak jadi memasang** dan `/context` melapor apa
adanya. Ini pembalikan langsung terhadap §3.4(b): `null` diperlakukan sebagai
"aku tidak tahu", bukan "memang tidak ada". **Lebih baik `/context` mati daripada
statusline user mati** — §1.

**Pagar 4 — test yang dibuktikan bisa merah.** Setiap pagar di atas disertai
*mutation check*: kodenya dirusak sementara, testnya dipastikan **gagal**, lalu
dikembalikan. Pagar yang tetap hijau saat dirusak bukan pagar. Merusak dengan
salinan (`cp`), **bukan** `git checkout <file>` — pelajaran pahit sesi
2026-08-03.

### 5.4 Lokasi pemasangan

**Project `settings.json` tiap bot.** Alasannya blast radius: bila ada yang
salah, yang terkena satu folder bot itu saja. Lapisan user menyentuh seluruh
project, termasuk yang bukan bot.

Catatan: justru karena bridge dipasang di lapisan project, Pagar 1 menjadi wajib
— pendahulunya hampir pasti berada di lapisan yang berbeda dari tempat bridge
dipasang. Itu bukan kebetulan; itu bentuk bug §3 diucapkan sebagai aturan.

## 6. Yang belum diukur — dinyatakan, bukan disembunyikan

1. **Apakah ada jalur non-`statusLine` yang membawa payload yang sama.**
   `statusLine` **bukan** hook, jadi ia tidak bisa didaftarkan lewat
   `hooks.json` plugin seperti `SessionStart`/`Stop` yang sudah dipakai
   `cc-plugin`. Belum dipastikan ada-tidaknya sumber lain. Bila suatu hari ada,
   seluruh §2 perlu ditinjau ulang.
2. **Seberapa sering `/context` dipakai.** Spec tahap 1 §4 mencatatnya "tak
   terukur" — meta-command sistem lama tidak masuk `messages.db`. Yang diketahui
   hanya bahwa bridge-nya terpasang di 6/6 bot.
3. **Berapa lama jeda sampai payload pertama tersedia** sesudah bridge dipasang.
   Sistem lama memakai `setTimeout` dengan pesan "⏳ Installing bridge…";
   angkanya tidak pernah diukur.
4. **Apakah bentuk keluaran perender masih cocok** dengan payload CC versi
   sekarang (`2.1.220`). Bentuk payload sudah dilihat dan memuat semua field yang
   dipakai, tetapi belum dijalankan lewat perendernya.

## 7. Keputusan user lewat brainstorming (2026-08-04)

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| Tahap 2 mulai dari mana? | **`/context` dulu** | `/switch` menyusul; registry bocornya dibereskan terpisah |
| Statusline saat memasang bridge | **Harus tetap hidup — syarat, bukan preferensi** | Lahir §1 dan keempat pagar §5.3 |
| Cara mencapainya | **Diserahkan** — *"Ntah itu `/context` baca ke statusline. Ntah itu baca `last-status.json`. Intinya statusline jangan sampai hilang"* | §2 menutup opsi "baca langsung"; tersisa menangkap + meneruskan |
| Arah desain empat pagar | **Lanjut ke spec** | Dokumen ini |

Keputusan tahap 1 yang masih mengikat: **`/context` tidak dikirim ke CC sama
sekali** — dijawab dari data lokal (spec tahap 1 §4).

## 8. Kriteria uji hidup

Diperiksa dari meteran, **bukan dari layar saja** — dan syarat §1 mendapat
kriteria yang paling keras, karena yang harus dibuktikan adalah bahwa sesuatu
**tidak** rusak.

| # | Kriteria | Meteran |
|---|---|---|
| 1 | Statusline user **tetap tampil utuh** sesudah bridge dipasang | Layar user + isi berkas rantai **tidak kosong** |
| 2 | Berkas tangkapan terisi dan diperbarui | Berkas ada, `captured_at_ms` maju |
| 3 | `/context` dari Telegram membalas dengan angka yang benar | Balasan dibandingkan dengan statusline di layar pada saat yang sama |
| 4 | `/context` **tidak** sampai ke AI | Tidak ada baris `assistant` sesudahnya di `conversations.db`, sementara teks biasa tetap dijawab (kontrol negatif, pola tahap 1) |
| 5 | **Rollback bekerja** — bila rantai gagal terisi, `settings.json` kembali seperti semula | Bandingkan `settings.json` sebelum/sesudah percobaan yang sengaja digagalkan |
| 6 | Memasang **dua kali** tidak menumpuk bridge di atas bridge | Isi berkas rantai tidak pernah menunjuk bridge itu sendiri |

**⚠️ Sebelum meminta uji hidup:** naikkan versi di **dua** berkas
(`.claude-plugin/plugin.json` **dan** `package.json`), `claude plugin marketplace
update mirza-bots` + `claude plugin update cc-plugin@mirza-bots`, lalu **restart
wrapper**. `cc-plugin` dimuat dari **plugin cache**, bukan dari repo. Skrip siap
pakai: `C:\Users\Mirza\workspace\bot-uji\uji-slash.bat`.

## 9. Yang sengaja TIDAK dikerjakan di sini

- **`/switch` dan daftar sesi bernama.** Bagian tahap 2 yang lain; terukur lebih
  mahal (registry sistem lama bocor ~50%: bot-02 punya 28 nama untuk 16 berkas
  sesi yang benar-benar ada, plus 2 sesi tanpa nama). Butuh spec sendiri.
- **Memperbaiki keenam bot harian yang statusline-nya sudah tergusur sekarang.**
  Itu perbaikan sistem **lama**, dan tidak ada di jalur pekerjaan ini. Dicatat
  supaya tidak terlupa, bukan supaya dikerjakan diam-diam.
- **Mengingat konfirmasi per-command** (spec tahap 1 §5, "yang belum
  diputuskan"). Tidak tersentuh pekerjaan ini.
