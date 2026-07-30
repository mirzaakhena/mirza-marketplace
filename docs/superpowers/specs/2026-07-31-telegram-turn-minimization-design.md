# Desain — Menekan giliran transkrip pada sesi yang digerakkan Telegram (B-9)

- **Tanggal:** 2026-07-31
- **Sesi:** `renew-mirza-marketplace-3`
- **Item ledger:** B-9 (`docs/2026-07-26-rebuild-audit/README.md`)
- **Repo kode terdampak:** `mirza-bots` (`cc-plugin/`) — repo ini hanya memegang spec
- **Prasyarat:** Tahap 2 selesai & terverifikasi hidup (Task 10, 2026-07-30)

## 1. Masalah

Saat user berinteraksi lewat Telegram, ia **secara definisi sedang jauh dari
terminal Claude Code** — itu justru alasan Telegram dipakai. Tapi sesi Claude
Code yang melayaninya tetap menghasilkan giliran teks penuh di transkripnya
sendiri: penjelasan, ringkasan, pengulangan isi yang barusan dikirim lewat
tool `reply`. Tidak ada yang membacanya. Token-nya tetap dibayar, dan tetap
menumpuk di context window sesi itu untuk giliran-giliran berikutnya.

Diamati langsung saat uji live Task 10 (2026-07-30): setiap pesan Telegram
menghasilkan balasan di Telegram **dan** giliran prosa penuh di transkrip CC.

## 2. Yang bukan masalah

Perlu ditegaskan supaya solusinya tidak salah sasaran:

- **Ini bukan soal reasoning.** Blok *thinking* Claude terpisah dari teks
  jawaban akhir; menekan prosa jawaban tidak memangkas ruang bernalarnya.
- **Ini bukan jalur kritis.** `reply` adalah satu-satunya jalur yang sampai ke
  user; prosa transkrip murni duplikasi.
- **Ini bukan bug Tahap 1–2.** Perilaku ini bawaan protokol percakapan Claude
  Code, bukan cacat implementasi `fleetd`/`cc-plugin`.

## 3. Keputusan yang mengikat desain ini

| # | Keputusan | Asal |
|---|---|---|
| D-1 | Berlaku **hanya** untuk giliran yang dipicu pesan Telegram masuk. Giliran yang user ketik langsung di terminal CC tidak tersentuh. | user, 2026-07-31 |
| D-2 | Target keringkasan: **sekosong mungkin** — penanda penutup minimal, bukan ringkasan. Nilai audit-trail sengaja dikorbankan; user membaca Telegram, bukan transkrip. | user, 2026-07-31 |
| D-3 | Mekanismenya **instruksi**, bukan penegakan mekanis. Dipilih sadar meski melawan semangat K-5, karena kegagalannya tidak merusak apa pun (§7). | user, 2026-07-31 |
| D-4 | Instruksi ditulis dalam **bahasa Inggris**. Ini pesan mesin→AI (kategori teknis di K-16), bukan pesan ke user — isi `reply` ke Telegram tetap mengikuti bahasa user. | user + K-16 |
| D-5 | Protokol lengkap tinggal di **`instructions` MCP milik `cc-plugin`**; yang disuntik per giliran hanya **pointer pendek**. | user, 2026-07-31 |

## 4. Arsitektur

Dua tempat, dengan pembagian biaya yang disengaja:

```
                  ┌─────────────────────────────────────────┐
  sekali/sesi ──► │ cc-plugin: McpServer instructions       │
                  │   protokol lengkap (≈4 kalimat)         │
                  └─────────────────────────────────────────┘
                  ┌─────────────────────────────────────────┐
  tiap pesan ───► │ cc-plugin: client.onPush()              │
                  │   prefix pointer pendek + teks asli     │
                  └─────────────────────────────────────────┘
```

**Kenapa `instructions` MCP, bukan skill.** Skill Claude Code dipanggil lewat
tool `Skill`: satu pemanggilan berarti satu tool call plus memuat seluruh
`SKILL.md` ke konteks — **lebih mahal** daripada teks inline pendek, bukan
lebih murah. Skill menang untuk isi panjang yang jarang dipakai; kasus ini
kebalikannya (pendek, tiap giliran). Sementara `instructions` sebuah MCP
server selalu ada di konteks sesi yang terhubung, dibayar sekali, nol biaya
per giliran. Sistem lama memakai pola ini persis:
`plugins/telegram/server.ts:517` mendeklarasikan `instructions: [...]` yang
antara lain berbunyi *"your transcript output never reaches their chat"*.
`cc-plugin` saat ini belum punya `instructions` sama sekali — gap tersendiri
yang ikut ditutup desain ini.

**Kenapa `onPush()` adalah titik injeksi yang benar.** Fungsi itu satu-satunya
jalan masuk pesan Telegram ke sesi. Giliran yang user ketik di terminal tidak
pernah melewatinya. Jadi D-1 (hanya giliran dari Telegram) terpenuhi
**tanpa logika deteksi apa pun** — tidak ada flag, tidak ada state.

Sifat itu penting: audit lama mencatat bug "sticky" pada sistem lama
(`area-10-disiplin-balas.md` §10.2) — flag `telegramDriven` berlaku untuk
seluruh sesi begitu sesi pernah menerima satu pesan Telegram, sehingga giliran
manual dari terminal ikut salah-kena. Desain ini kebal terhadap kelas bug itu
karena tidak menyimpan state sama sekali.

## 5. Perubahan konkret

Keduanya di `mirza-bots/cc-plugin/src/server.ts`.

**5.1 Deklarasi `instructions`** pada constructor `McpServer` (di sebelah
`capabilities` yang sudah ada sejak fix Task 10). Isi protokol, dalam bahasa
Inggris, kira-kira mencakup empat hal:

1. Transkrip sesi ini tidak dibaca siapa pun; user membaca Telegram.
2. Hanya tool `reply` yang sampai ke user.
3. Untuk giliran yang bertanda pointer terse-turn: tutup dengan penanda
   minimal setelah tool call selesai.
4. Jangan mengulang isi `reply` sebagai prosa.

**5.2 Prefix pointer** di `client.onPush()`, ditempel di depan `msg.text`
sebelum masuk ke `params.content`. Bentuk final ditentukan saat implementasi;
kandidat: `[protocol: terse-turn]`. Berlaku sama untuk `kind: "message"`
maupun `kind: "callback"` — tidak ada variasi teks.

**Yang tidak berubah:** `meta` notifikasi (chat_id, user_id, ts, kind,
attachments) tetap apa adanya, termasuk penjagaan string-only SCAR-056. Data
terstruktur lewat `meta`; `content` cukup membawa pointer + teks asli. Format
tag `<channel source="telegram" ...>` milik sistem lama **tidak** ditiru —
atribut-atributnya sudah terwakili `meta`, menirunya berarti duplikasi.

## 6. Yang wajib diverifikasi hidup sebelum implementasi difinalkan

Kebiasaan proyek ini: primitif berisiko diuji langsung, tidak diasumsikan.
Dua-duanya menentukan bentuk akhir kode, jadi harus dijawab lebih dulu.

| # | Pertanyaan | Kalau jawabannya tidak |
|---|---|---|
| V-1 | Apakah CC/API menerima giliran seringkas `"."` sebagai valid? | Naikkan penanda ke bentuk terpendek yang diterima; D-2 tetap terpenuhi semaksimal yang diizinkan protokol |
| V-2 | Apakah `instructions` yang dideklarasikan lewat wrapper `McpServer` benar-benar sampai ke sesi? (sistem lama memakai `Server` low-level — jalurnya belum tentu identik) | Pindahkan protokol ke `Server` low-level, atau — kalau tetap gagal — kembali ke teks penuh inline per push, menerima biaya ~45 token/giliran |

## 7. Sifat kegagalan

**Gagal dengan aman.** Kalau AI mengabaikan protokolnya, yang terjadi hanyalah
kembali ke perilaku hari ini: prosa panjang di transkrip. `reply` tetap
terkirim, pesan tetap tersimpan, user tetap menerima jawaban. Tidak ada jalur
yang putus.

Sifat inilah yang membenarkan D-3 (instruksi, bukan mekanis). K-5 menuntut
aturan yang bisa dijamin mesin dijamin mesin — tapi K-5 lahir untuk kewajiban
yang **kalau dilanggar merugikan user** (pertanyaan tanpa tombol, user
ditinggal tanpa jawaban). Di sini pelanggaran hanya merugikan efisiensi.

Penegakan lewat hook `Stop` **ditolak sadar**: hook tidak bisa memangkas teks
yang sudah ditulis, hanya bisa meminta generate ulang — dan generate ulang
menambah token, kebalikan dari tujuannya.

## 8. Pengujian

**Unit test** (`cc-plugin`, pola `InMemoryTransport` yang sudah dipakai 16 test
yang ada): notifikasi push membawa prefix pointer di `content`; `instructions`
terdeklarasi pada server. Ini menangkap regresi — dan hanya itu.

**Uji live** (butuh partisipasi user, seperti Task 10) adalah bukti yang
sesungguhnya:

1. Kirim beberapa pesan Telegram berturut-turut ke `bot-01`.
2. Periksa transkrip sesi kedua: apakah gilirannya benar-benar ringkas.
3. **Periksa lagi di giliran ke-15/20+** — titik di mana instruction-fade
   biasanya muncul. Ini pengujian yang sesungguhnya; giliran pertama patuh
   tidak membuktikan apa-apa.

Pelajaran mahal proyek ini berlaku penuh di sini: 457 unit test hijau tapi
`answerCallbackQuery` tak ter-port ke produksi. Unit test **tidak bisa**
membuktikan AI patuh.

**Kalau uji live menunjukkan prosa kembali muncul di giliran ke-20+:**
penawarnya adalah memanjangkan pointer (mendekati teks penuh), bukan membuang
desainnya — biaya per giliran naik, protokol tetap punya satu rumah.

## 9. Di luar cakupan

| Hal | Kenapa di luar |
|---|---|
| Skill gabungan `telegram-conduct` (`area-10` §10.4 & §10.D — melebur `immediate-reply`, `inline-buttons`, `bot-conduct`, `name-session`) | Barang Tahap 3. Aturan B-9 kandidat kuat jadi anggotanya kelak, tapi menunggu skill itu ada bukan alasan menunda B-9 |
| Ack `immediate-reply` yang dipaksa mesin (`PreToolUse`) | Tahap 3 (`area-10` §10.1) |
| `Stop` hook jawaban final | Tahap 3 (`area-10` §10.2) |
| Quote-reply (B-10) | Belum didesain; dicatat 2026-07-31 |
| Mengukur penghematan token secara kuantitatif | Bisa dilakukan belakangan dengan membandingkan ukuran transkrip; bukan syarat selesai |

## 10. Kriteria selesai

Sesi Claude Code yang digerakkan Telegram menutup gilirannya dengan penanda
minimal alih-alih prosa — **dibuktikan dengan melihat transkrip sesi
sungguhan setelah percakapan Telegram nyata**, bukan dari unit test hijau.
