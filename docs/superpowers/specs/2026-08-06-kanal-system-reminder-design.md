# Kanal `[from: system]` — Pengingat Mekanis dari Mesin ke AI

**Tanggal:** 2026-08-06 · **Penyusun:** bot-02 (brainstorming bersama user)
**Repo sasaran:** `C:\Users\Mirza\workspace\mirza-bots` (`cc-plugin`)
**Melanjutkan:** `2026-08-06-penamaan-sesi-otomatis-design.md` · `cc-plugin` 0.22.0
(penanda menamai sumber)

---

## 1. Apa yang dibangun, dan apa yang BUKAN

**Ini kanal, bukan fitur.** Yang dibangun mekanismenya; pengingat penamaan sesi,
ack-duluan, dan pengingat handoff hanya penghuni pertamanya.

> *"Intinya ini adalah mekanis mesin (system)."* — user, 2026-08-06

Penulis ketiga sudah punya nama sejak 0.22.0 memindahkan penanda ke sumbu
sumber; yang belum ada adalah **jalannya**.

## 2. Garis pemisah: instruksi vs pengingat

Baru jelas saat user menyebut daftar penghuninya, dan ia menentukan apa yang
boleh masuk kanal ini:

| | `SERVER_INSTRUCTIONS` | `[from: system]` |
|---|---|---|
| Isinya | aturan yang **selalu** berlaku | keadaan yang **sedang** berlaku |
| Dibaca | sekali, di awal sesi | tiap kali kondisinya terpenuhi |
| Contoh | "balasan pendek", "user AFK" | "sesi belum bernama", "context 85%" |

Yang **selalu** benar tetap di instruksi — memindahkannya ke kanal hanya membuat
ia dibayar berkali-kali tanpa menambah apa pun. Yang **kadang** benar pindah ke
kanal, karena di instruksi ia cuma aturan yang menunggu momen yang mungkin tidak
pernah datang.

**Analogi yang dipakai saat membahasnya:** rambu lalu lintas vs lampu dashboard.
Rambu selalu ada di pinggir jalan — dibaca sekali, berlaku terus. Lampu dashboard
menyala hanya saat ada yang perlu ditangani, dan mati sendiri. Yang salah adalah
menaruh *"bensin tinggal seperempat"* di rambu pinggir jalan.

**Konsekuensi praktis, dan ini alasan kanal ini layak dibangun:** aturan
ack-duluan yang mendarat di 0.20.0 dibaca **sekali** di awal sesi. Pada sesi
panjang yang konteksnya dipadatkan, ia bergeser jauh dari perhatian. Pengingat
yang datang **saat dibutuhkan** tidak bergantung pada ingatan sama sekali.

## 3. Keputusan user: semua dikirim, AI yang menyusun prioritas

**Pertanyaannya:** kalau dua atau tiga kondisi terpenuhi bersamaan, mesin
mengirim apa?

**Jawaban user 2026-08-06:**

> *"Saya memilih semuanya DAN minta bot untuk menyusun prioritasnya. Bisa jadi
> keputusannya dikembalikan ke user. Artinya user ikut berperan dalam pengambilan
> keputusannya."*

**bot-02 merekomendasikan yang berbeda** (kirim satu, prioritas tetap di mesin)
dan **rekomendasi itu keliru** — bukan karena hasilnya buruk, melainkan karena ia
**melanggar prinsip yang dibangun sepanjang hari ini**: prioritas adalah
penilaian, penilaian tergantung isi pekerjaan, dan mesin tidak tahu isi
pekerjaan. Mesin yang mengurutkan pengingat adalah mesin mengambil keputusan yang
bukan haknya — kekeliruan yang sama persis dengan penanda yang menamai perilaku.

**Tiga lapis yang lahir dari keputusan ini:**

| Lapis | Tugasnya |
|---|---|
| **Mesin** | mengirim **semua** kondisi yang terpenuhi, apa adanya, tanpa mengurutkan |
| **AI** | menyusun prioritas, memutuskan apa yang dikerjakan lebih dulu |
| **User** | dilibatkan bila AI menilai keputusannya bukan miliknya |

Lapis ketiga itu bukan pelengkap: ia yang membuat "kirim semua" aman. Pengingat
yang saling bertabrakan bukan masalah yang harus diselesaikan diam-diam — ia
justru saat yang tepat untuk bertanya.

### 3.1 Bahaya yang tetap ada, dan dinyatakan apa adanya

Keberatan bot-02 terhadap "kirim semua" **tidak sepenuhnya gugur**: pengingat
yang selalu muncul berhenti menjadi sinyal dan menjadi latar belakang.

Yang menahannya di desain ini **bukan pembatasan jumlah**, melainkan tiga hal
lain:

1. **Tiap pengingat mati sendiri** begitu kondisinya tidak lagi terpenuhi. Tidak
   ada yang perlu mematikannya, dan tidak ada yang bisa lupa mematikannya.
2. **Kondisinya harus benar-benar bermakna.** Ambang yang terlalu longgar
   menghasilkan pengingat yang menyala terus — dan itu, bukan jumlahnya, yang
   membunuh kanal ini. Tiap penghuni baru wajib menjawab: *kapan ia TIDAK
   menyala?*
3. **AI boleh menunda**, dan pengingatnya tetap ada di giliran berikutnya. Tidak
   ada tekanan untuk mengerjakan semuanya sekaligus.

**Yang harus diukur setelah kanal ini hidup, dan belum bisa dijawab sekarang:**
berapa rata-rata pengingat yang menyala per pesan. Kalau angkanya mendekati
jumlah penghuni, ambangnya yang salah — bukan keputusannya.

## 4. Bentuk teknis

### 4.1 Menempel pada push, bukan push sendiri

**Keputusan bot-02, dan ia layak dibantah kalau salah.**

Pengingat ikut menempel pada push yang **sudah ada** — sebuah blok bertanda
`[from: system]` di dalam pesan yang sama, sesudah penanda sumbernya.

Alasannya: pengingat sebagai push tersendiri berarti **membangunkan AI tanpa ada
pesan dari siapa pun**. Itu memicu giliran baru yang tidak diminta, dibayar
penuh, dan pada kasus terburuk bisa memicu giliran berikutnya lagi. Menempel
tidak membangunkan apa pun — ia numpang pada giliran yang memang akan terjadi.

**Batas yang diterima sadar:** pengingat karena itu hanya muncul **saat ada
pesan masuk**. Untuk seluruh penghuni yang sudah diketahui (penamaan sesi,
ack-duluan, context mepet) itu cukup, karena ketiganya relevan tepat saat
giliran baru dimulai.

**Yang TIDAK tercakup, dan sengaja tidak dipaksakan ke sini:** pengingat yang
harus datang **di tengah giliran yang sedang berjalan** (mis. laporan berkala
untuk kerja panjang). Itu masalah lain dengan jalur lain — hook `Stop` sudah
berjalan di ujung giliran dan sudah membaca transcript. Jangan bengkokkan kanal
ini untuk melayaninya.

### 4.2 Daftar kondisi, bukan rantai `if`

Tiap pengingat adalah satu entri dengan bentuk yang sama:

```
{ id, applies(context) -> boolean, text }
```

`applies` **murni** — seluruh matriks keputusannya bisa diuji tanpa satu berkas
pun. `context` memuat fakta yang sudah tersedia: nama sesi, jumlah giliran,
kesegaran `status.json`, persentase context window.

Mesin mengevaluasi semuanya, mengumpulkan yang `true`, dan menempelkannya. Tidak
ada pengurutan, tidak ada pemilihan — itu bukan haknya (§3).

### 4.3 Bunyi teksnya

Kalimat **perintah**, bukan pernyataan keadaan — keputusan user 2026-08-06, dan
alasannya terukur: pesan `no_known_chat` yang berbunyi *"has not received a
message yet"* dikarang maksudnya oleh AI lalu disampaikan ke user sebagai fakta
yang keliru. Tiap penghuni menulis kalimatnya sendiri; tidak ada cetakan yang
memaksa bentuk seragam selain itu.

Contoh penghuni pertama, kata per kata dari user:

> `segera beri nama session ini jika context yang dibicarakan sudah jelas`

## 5. Penghuni pertama

| Penghuni | Kondisi menyala | Kondisi TIDAK menyala |
|---|---|---|
| **Penamaan sesi** | sesi belum bernama · ≥ 2 giliran · `status.json` segar | sesi sudah bernama, atau data basi |
| **Ack duluan** | *(belum bisa diukur — lihat §6)* | — |
| **Handoff karena context** | context melewati ambang | di bawah ambang |

⚠️ **Ambang context belum ditetapkan.** Sistem lama memakai 35% untuk model
1M dan 75% untuk sisanya, dan angka itu **diwarisi tanpa pengukuran**. Jangan
salin tanpa menanyakannya ulang.

## 6. Yang TIDAK termasuk scope

- **Ack duluan sebagai pengingat.** Aturannya sudah mendarat di 0.20.0 sebagai
  instruksi. Memindahkannya ke kanal ini butuh menjawab *"giliran ini akan lama
  atau tidak"* — pertanyaan yang **tidak ada jawabannya di transcript** sebelum
  gilirannya berjalan. Ia masuk kanal setelah ada cara mengukurnya, bukan
  sebelumnya.
- **Laporan berkala** untuk kerja yang sangat panjang (§4.1).
- **Ambang context untuk pengingat handoff** — angka warisan, harus diukur ulang.

## 7. Ketergantungan

- `cc-plugin` **0.22.0** (penanda sumber) — sudah mendarat.
- Fondasi fakta sesi (nama sesi + jumlah giliran + guard kebasian) dari
  `2026-08-06-penamaan-sesi-otomatis-design.md` §4.2–§4.4. **Belum dibangun**, dan
  ia prasyarat penghuni pertama.

## 8. Pertanyaan terbuka

1. **Ambang context** untuk pengingat handoff (§5).
2. **Berapa rata-rata pengingat menyala per pesan** — hanya bisa dijawab setelah
   kanal hidup, dan jawabannya menentukan apakah ambangnya perlu diperketat
   (§3.1).
