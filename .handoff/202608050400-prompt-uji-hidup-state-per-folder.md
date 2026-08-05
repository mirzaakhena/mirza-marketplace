# Uji Hidup State Per-Folder dan Jalur Antar-Bot

**Date:** 2026-08-05 04:00 (WIB) · **DIPERBARUI 08:10 (WIB)** — seluruh uji hidup
di section AKAN **SUDAH DIKERJAKAN bersama user dan LULUS 5/5**. Lihat
"Hasil uji hidup" di bawah sebelum membaca section AKAN, yang kini historis.
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `2af0ea7` · HEAD kode: `8a9692a`)
**Dari → Ke:** bot-02 → bot-03
**Pair:** bot-03 ⇄ bot-02
**Lanjutan dari:** `.handoff/202608042230-prompt-state-per-folder-dan-inbox-bot.md`
**Plan terkait:** `docs/superpowers/plans/2026-08-04-state-per-folder-dan-inbox-bot.md`

---

## 1. Tujuan Handoff

Kedua pekerjaan yang diserahkan bot-03 **selesai dan ter-merge**: state
per-folder dan jalur antar-bot lewat `inbox/`. Yang belum ada satu pun: **bukti
bahwa keduanya bekerja di luar test.** Estafet balik supaya yang mengujinya
bukan yang menulisnya.

**Goal estafet:** dampingi user melakukan **uji hidup** — rilis plugin, migrasi
state produksi, lalu buktikan dua bot benar-benar bisa saling kirim. Ketiganya
menyentuh produksi, jadi ketiganya **butuh tangan dan izin user**.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine + MCP server, Bun) dan `cc-wrapper` (PTY, Node + tsx).
Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian lewat launcher `mirza-cc`. Sistem **baru** melayani
satu bot, **`mirza_01_bot`**.

⚠️ **Jebakan penamaan yang sudah memakan waktu:** folder `mirza_01_bot` melayani
bot Telegram **`@mirza_01_bot`**; keenam bot harian justru bernama
`@mirza_botone_bot` … `@mirza_botsix_bot`. Jangan menyimpulkan sistem mana dari
pola namanya — petakan lewat `getMe`.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main` dan ter-push di **kedua** repo. **450 test hijau, 0
fail, 920 `expect()`, 45 berkas.** `bunx tsc --noEmit` **bersih**.

### (A) State per-folder — TUTUP

`~/.claude/mirza-bots/` tidak dipakai lagi oleh kode. Bentuknya sekarang persis
seperti yang disepakati (`config.json`, `conversations.db`, `session.id`,
`status.json`, `bot.pid`, `chained-statusline`, `data/`, `inbox/`, `logs/`).

- **`MIRZA_BOTS_HOME` dibuang tanpa pengganti.** Pertanyaan "apa penggantinya
  untuk test" ternyata salah pertanyaan: `paths.ts` jadi **modul murni** yang
  menerima `botHome`, jadi test berhenti menyentuh `process.env` sama sekali —
  tidak ada global yang harus dibersihkan, tidak ada yang bisa bocor antar
  berkas test.
- **Nama bot = basename folder**, dan **sebuah folder adalah bot bila memuat
  `config.json`**. Satu aturan dipakai tiga kali (identitas engine, hook
  SessionStart, validasi tujuan antar-bot), jadi ketiganya tidak bisa berbeda
  pendapat.
- **`config.json` menolak bentuk lama**, dikunci test. Bukan diabaikan:
  menerimanya diam-diam membuat sebuah folder melayani token yang bukan
  miliknya, dan gejalanya baru muncul saat dua sesi berebut token yang sama —
  insiden 2026-08-04, enam bot bisu berjam-jam.
- **`same-path.ts` dan `context/bot-for-cwd.ts` dibuang** — nol pemakai sesudah
  daftar `bots` hilang. Bersama `bot-for-cwd` ikut hilang sekelas bug: ia
  mencocokkan cwd ke `home` tiap entri, dan salah satu bugnya benar-benar
  terjadi 2026-08-02.
- **Filter `WHERE bot = ?` dibuang** dari `getMessagesAround`/`searchMessages`;
  kolomnya dibiarkan sebagai jejak. Alasannya di §9 tingkat 12.

### (B) Jalur antar-bot — TUTUP

`src/engine/agent/{payload,peers,send,receive}.ts` + tool MCP `agent_send` dan
`agent_list`. Alamat = folder tetangga, tanpa registry. `expects_reply` boolean,
`in_reply_to`, `MAX_HOP = 5` dari `agent-bus`.

- **Loop A↔B ditutup struktural**, bukan dibatasi: balasan tidak boleh menuntut
  balasan, satu baris validasi di **kedua** sisi.
- **Penanda `[protocol: agent-turn]` menutup T-4/W-14.** Batas yang disadari dan
  **ditulis di kodenya**: user bisa mengetik penanda itu lewat Telegram dan
  membuat guard diam untuk satu pesan.
- **Antrean offline gratis** dari bentuknya: `ls inbox/` memperlihatkan yang
  menunggu, tanpa tabel dan tanpa daemon.

### Yang tidak diminta tapi ikut dikerjakan

- **`cc-plugin/tsconfig.json` + `@types/bun`.** `bun test` tidak memeriksa tipe,
  dan tiap sesi harus mengarang ulang perintah `tsc` ad-hoc. Lima error yang
  ditemukannya **terbukti pre-existing** lewat worktree baseline di `2277949`
  (diukur, bukan diduga — dan baseline bahkan punya satu error ekstra yang
  pekerjaan ini justru hilangkan). Kelimanya sepele dan sudah dibereskan, jadi
  gerbangnya hijau sejak dipasang.
- **Tiga klaim README yang sudah salah sebelum pekerjaan ini** ikut dikoreksi:
  doctor tidak lagi melaporkan armada, `bot_inbox` sudah dibuang, dan contoh
  JSON `doctor` masih bentuk lama.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, tidak ada worktree tersisa.)

## 4b. Hasil uji hidup (DIPERBARUI 2026-08-05 08:10)

**Ketiga langkah di section AKAN sudah dikerjakan bersama user. Section 5 dan 6
di bawah kini HISTORIS — dibiarkan supaya alasan tiap langkah bisa ditelusuri,
bukan karena masih perlu dikerjakan.**

- **Rilis 0.12.0:** dipasang user, terverifikasi dari tiga meteran
  (`installed_plugins.json`, `Win32_Process`, dan hook yang menulis ke lokasi
  baru dengan kalimat yang baru lahir semalam).
- **Migrasi: TIDAK dijalankan.** Keputusan user: *"Tidak usah pikirkan backward
  compatibility. Kita start dari nol."* `mirza_01_bot` diberi `config.json` baru
  dan database kosong; state lama ditinggalkan utuh. Skripnya tetap belum pernah
  dijalankan atas state nyata.
- **Bot kedua dibuat** (`@mirza_02_bot`), dan **kelima kriteria LULUS**.
- **Statusline:** `statusLine` di `.claude/settings.json` milik `mirza_01_bot`
  masih menunjuk bridge `0.10.3`. Dibuang (backup `.bak-*`) supaya installer
  memasang dari awal, karena `stale-bridge` hanya memperbarui path dan TIDAK
  menyentuh rantai — sementara rantai di lokasi baru masih kosong. Dibiarkan,
  statusline user hilang dari sesi itu.

### Dua bug yang ditemukan uji ini, dua-duanya lolos dari 450 test hijau

1. **`conversations.db-wal` diabaikan skrip migrasi** (merge `1f3085d`).
   Terukur: `.db` saja **135 baris**, `.db` + `-wal` **137**, pesan terakhir
   mundur 74 menit. Bentuk kegagalannya yang paling mahal — database hasil
   salinan **terbuka baik-baik saja**, cuma isinya lebih sedikit.
2. **`listPeers` menghitung folder ber-`config.json` sebagai bot.** Di workspace
   nyata, `wa-kajian-aggregator` punya `config.json` sendiri (`webPort`,
   `ollamaUrl`) → `agent_send` ke situ akan **membuat `inbox/` di dalam project
   orang lain**. Diperbaiki jadi validasi ISI config. Sengaja **beda** dari
   `identifyBot`: untuk diri sendiri, config rusak adalah kerusakan yang harus
   dilaporkan apa adanya, bukan disamarkan jadi "bukan folder bot".

**454 test hijau, `tsc` bersih.**

### Yang MASIH terbuka, dan sengaja tidak ditebak

- **Pesan antar-bot tidak dicatat di mana pun.** `drainInbox` mendorong ke AI
  tanpa `insertMessage`. Dokumen keputusan menandai penyimpanan "belum
  diputuskan", jadi ini bukan kelalaian — tapi konsekuensinya persis pola yang
  BACKLOG hukum berulang: *"berapa sering bot saling kirim"* tidak terukur,
  seperti `/switch` yang terbaca 0× padahal 139×. **Butuh keputusan user.**
- **`agent-bus` lama terpasang scope user**, jadi ikut termuat di SETIAP sesi.
  Satu sesi kini memuat dua sistem armada dengan tool yang menjawab pertanyaan
  sama, dan terlihat langsung: bot-2 menjawab *"ada 6 peer di registry"* memakai
  tool lama. Bukan bug kode baru, tapi akan menggigit begitu sebuah bot disuruh
  berkirim lewat AI-nya sendiri alih-alih lewat berkas.
- **`chained-statusline` belum pernah lahir** di bentuk baru — ia baru dibuat
  saat `/context` pertama dipanggil. Belum diuji.

---

## 5. Blocker

**Tiga langkah berikutnya semuanya butuh tangan user, dan tidak satu pun boleh
dikerjakan tanpa izinnya.** Itu bukan hambatan teknis — itu batas yang user
tetapkan sendiri, dan pekerjaan semalam menghormatinya:

1. **Rilis plugin** (`marketplace update` + `plugin update` + **restart
   wrapper**). Tanpa ini kode 0.12.0 tidak aktif sama sekali; yang berjalan
   masih 0.10.4.
2. **Migrasi state produksi.** Skripnya siap, **belum pernah dijalankan**.
3. **Bot kedua** untuk menguji jalur antar-bot. Belum ada; sistem baru masih
   melayani satu bot.

## 6. Yang Akan Dikerjakan (AKAN)

**Urutannya penting, dan ini bukan preferensi:** langkah 2 tidak berarti
sebelum 1, dan 3 mustahil sebelum 2.

### Langkah 1 — rilis 0.12.0, lalu **ukur apa yang benar-benar berjalan**

Baca `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" **sebelum**
meminta user melakukan apa pun. Sesudah restart, **jangan percaya bahwa
rilisnya mendarat** — periksa `~/.claude/plugins/installed_plugins.json` dan
`Get-CimInstance Win32_Process`. Preseden: seluruh lapisan slash pernah
ter-merge dan tidak aktif berhari-hari karena cache masih memuat versi lama,
dan argumen "prosesnya lahir sesudah merge" **terbukti salah dalam sepuluh
menit**.

⚠️ **Yang paling mungkin patah di sini, dan sudah bisa diramalkan sekarang:**
`mirza_01_bot` masih memakai `config.json` bentuk lama, dan 0.12.0
**menolaknya**. Bot itu akan gagal start dengan kalimat yang menyebut
`config.json` — itu **perilaku yang dirancang**, bukan kerusakan. Migrasi
(langkah 2) yang membereskannya, jadi siapkan user untuk urutan itu **sebelum**
ia melihat pesannya.

### Langkah 2 — migrasi `mirza_01_bot`

```bash
cd C:\Users\Mirza\workspace\mirza-bots\cc-plugin
bun run scripts/migrate-per-folder.ts ~/.claude/mirza-bots \
  C:\Users\Mirza\workspace\mirza_01_bot mirza_01_bot          # dry-run
```

Baca **seluruh** keluaran warning-nya sebelum menambahkan `--apply`. Skrip
menyalin dan tidak pernah menghapus, jadi jalan mundurnya adalah menghapus
folder tujuan.

**Verifikasi DUA ARAH sesudahnya**, bukan satu: bukan cuma "riwayat ada di
folder baru", tapi juga **"jumlah barisnya sama"** dan **"`bot.pid` berpindah
pemilik"**. Yang baru muncul tidak pernah membuktikan yang lama tidak
ketinggalan.

Sesudah bot barunya terbukti jalan, **user** yang memutuskan kapan
`~/.claude/mirza-bots/` dihapus. Jangan tawarkan itu di hari yang sama.

### Langkah 3 — uji hidup jalur antar-bot

Butuh **bot kedua** di sebelah `mirza_01_bot` — folder baru + `config.json` +
token BotFather baru. Kriteria yang layak diperiksa, urut dari yang paling
mungkin gagal:

1. `agent_list` dari bot A menyebut bot B (dan sebaliknya).
2. `agent_send` A→B mendarat: berkas muncul di `B/inbox/`, lalu **hilang**
   sesudah dibaca.
3. **Yang paling penting, dan yang harus dibuktikan sebagai KETIADAAN:** saat B
   menerima pesan antar-bot lalu gilirannya berakhir tanpa `reply`,
   **reply-guard TIDAK memblokir** dan **chat Telegram user tetap sunyi**.
   Itu T-4/W-14, dan satu-satunya kegagalan di sini yang langsung terasa oleh
   user.
4. Kirim ke bot yang **sedang mati** → berkasnya menunggu di `inbox/`, lalu
   masuk begitu bot itu dibuka.
5. `expects_reply: true` + `in_reply_to` → ditolak, dengan kalimatnya.

### Kalau user memilih pekerjaan lain

Prioritas yang masih terbuka dari audit 2026-08-04, tidak berubah: **akar bug
installer statusline** (kambuhnya terjadwal, bukan mungkin) · **penjaga
singleton `mirza-cc`** (dampak terbesar, risiko terbesar) · **W-26** (ukur dulu
frekuensinya) · **`/switch`**.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** `~/.claude/agent-playbook/PLAYBOOK.md` **sudah tidak ada**; aturan Plane sudah dicabut selamanya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild.** Baris "Versi terpasang" sengaja menonjolkan jarak repo vs yang berjalan |
| `docs/superpowers/plans/2026-08-04-state-per-folder-dan-inbox-bot.md` | **Sebelum menyentuh kode ini.** Bagian "Keputusan yang dikunci rencana ini (K-1..K-6)" menjelaskan **kenapa** tiap bentuk begitu; bantah dengan alasan, jangan temukan ulang |
| `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" | **WAJIB sebelum meminta user uji hidup** |
| `mirza-bots/README.md` §"Bicara ke bot lain" | Sebelum menguji langkah 3 |
| `docs/2026-08-04-state-per-folder-bot.md` | Bagian 5 = keberatan yang **sudah gugur, jangan angkat ulang** |
| `docs/2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md` | Bagian 4 = apa yang user **TOLAK** berikut alasannya |

## 8. Keputusan yang Diambil Sesi Ini (bukan oleh user)

Semuanya **diturunkan** dari keputusan user yang sudah ada, dan semuanya ditulis
di rencana (K-1..K-6) supaya bisa dibantah dengan alasan:

| Pertanyaan | Yang diambil | Diturunkan dari |
|---|---|---|
| Pengganti `MIRZA_BOTS_HOME` untuk test | **Tidak ada** — fungsi path jadi murni, menerima `botHome` | Tidak ada state root berarti tidak ada yang perlu dipindahkan |
| Nama bot | **Basename folder** | "Alamat bot lain = folder tetangga" mustahil tanpa ini |
| Apa yang menandai sebuah folder sebagai bot | **`config.json` ada di dalamnya** | Sudah tertulis di dokumen keputusan Bagian 2 |
| `chained-statusline` di mana | **Ikut ke folder bot** | Ia state, dan "tidak ada yang bersama" |
| Kolom `bot` di `messages` | **Dibiarkan; filternya yang dibuang** | Yang reversibel menang; lihat §9 tingkat 12 |
| `logs/` folder atau berkas | **Tetap folder** | Bentuk yang tergambar di dokumen keputusan |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan supaya bot
berikutnya bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan.
Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01 → bot-02 → bot-03 →
bot-02, dan sesi ini menambah **satu** tingkat.

**Tingkat 1–5** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran tidak sama dengan memakainya.

**Tingkat 6–8:** verifikasi **efek**, bukan artefak · memperbaiki satu bug
membuka bug di belakangnya · identitas berbasis string persis rapuh terhadap apa
pun yang berubah tiap rilis.

**Tingkat 9: perintah warisan adalah hipotesis, bukan fakta.** Handoff
sebelumnya menyuruh memakai `bash` telanjang; di mesin ini itu resolve ke WSL
dan gagal **diam-diam**. Uji kering dengan pemanggil yang sama persis
menangkapnya, **dan sekaligus membalik dugaan penulisnya sendiri** soal
quote-stripping `cmd.exe`. Dua dugaan, dua-duanya salah, dua-duanya murah
dibongkar satu probe 20 baris.

**Tingkat 10: mutation check yang HIJAU harus dibuktikan dulu mutasinya
terpasang UTUH.** Terjadi dua kali dalam satu hari — sekali karena CRLF membuat
`replace` gagal, sekali karena hanya 1 dari 3 potongan terpasang. **Sesi ini
memakainya sebagai prosedur, dan itu terbayar:** salah satu `replace` berbasis
`\n` memang gagal karena CRLF, dan yang menangkapnya adalah `assert` anchor —
bukan hasil testnya, yang saat itu masih hijau karena mutasinya tidak pernah
ada.

**Tingkat 11: keberatan yang benar bisa tetap salah kalau kasusnya belum ada.**
bot-03 menahan keputusan user dengan argumen lintas-bot yang benar secara
teknis, lalu pengukurannya sendiri membatalkannya: 136 baris satu bot, 1 baris
nyasar — lintas-bot belum pernah terjadi.

**Tingkat 12 (sesi ini): sebuah pagar yang berhenti menjaga tidak menjadi
netral — ia menjadi jebakan yang menunggu.** Sesudah database jadi per-folder,
filter `WHERE bot = ?` tidak menyaring apa pun; godaannya adalah membiarkannya
karena "tidak menyakiti". Tapi cara resmi memindahkan bot sekarang adalah
**rename folder**, dan baris lama membawa nama lama — jadi filter yang hari ini
tidak melakukan apa-apa akan mulai **membuang riwayat diam-diam** pada hari
seseorang memakai fitur yang sengaja dibuat murah. Kode mati yang tetap
dieksekusi lebih berbahaya daripada kode mati yang tidak pernah dipanggil,
karena ia menunggu perubahan yang justru dirancang untuk sering terjadi.
Sepupunya: `same-path.ts` dan `bot-for-cwd.ts` dibuang di sesi yang sama justru
karena pemakainya nol — yang berbahaya bukan yang mati, melainkan yang **hampir
mati**.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Buktikan "pre-existing" dengan baseline, jangan dengan ingatan.** Lima
  error tsc muncul sesudah pekerjaan besar; menyimpulkan "bukan aku" dari "aku
  tidak menyentuh berkas itu" adalah dugaan. Worktree detached di commit
  baseline + `bun install` = 90 detik, dan ia **menemukan satu error ekstra**
  yang pekerjaan ini ternyata justru hilangkan — fakta yang tidak akan pernah
  muncul dari menebak.
- ✅ **Kunci penolakan, bukan cuma perilaku baru.** `config.json` bentuk lama
  **ditolak** dan itu punya testnya sendiri. Test yang hanya memeriksa bentuk
  baru bekerja akan tetap hijau untuk parser yang mengabaikan bentuk lama
  diam-diam.
- ✅ **Ubah test lama, jangan hapus.** Test "jangan bocorkan riwayat bot lain"
  diubah jadi "jangan buang riwayat bot ini sesudah rename" — asumsinya hilang,
  bahayanya berpindah, dan yang dijaga tetap ada.
- ✅ **Cari lubang di test itu sendiri.** Test reply-guard membuat transcript
  dengan tangan, jadi mereka tetap hijau meski forwarder memasang penanda yang
  salah. `markerFor` diuji langsung **karena** lubang itu terlihat saat membaca
  ulang, bukan karena ada test yang merah.
- ❌ **JANGAN percaya string literal multiline di skrip Python/Node untuk berkas
  repo ini** — CRLF membuat pencocokan gagal. Pakai `Edit` yang presisi, atau
  `assert` anchor-nya lebih dulu.
- ⚠️ **Worktree baru butuh `bun install` sendiri**, termasuk worktree baseline
  yang cuma dipakai 90 detik.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `2af0ea7` · kode HEAD `8a9692a` (dua merge:
  `d66af33` state per-folder, `8a9692a` jalur antar-bot).
- **Versi:** repo `cc-plugin` **0.12.0**; yang **TERPASANG masih 0.10.4**.
  `bot-conduct` 0.0.11 · `inline-buttons` 0.0.10 · `telegram` (marketplace lama)
  0.0.37-mirza.0.
- **Angka test:** `cc-plugin` **450 hijau, 0 fail, 920 `expect()`, 45 berkas**,
  2,95 detik. `bunx tsc --noEmit` bersih (gerbang baru).
- **Meteran yang terbukti berguna, pakai lagi:** `conversations.db` (readonly,
  `node:sqlite`) · `~/.claude/plugins/installed_plugins.json` (**versi yang
  benar-benar terpasang**) · `Get-CimInstance Win32_Process` (**siapa
  benar-benar berjalan**) · `logs/session-hook.log` · `getMe` Telegram ·
  **worktree baseline + `bunx tsc`** (baru: memisahkan "aku yang merusak" dari
  "sudah rusak sejak dulu").
- **Belum diuji hidup:** seluruh (A) dan (B) · rollback `/context` · regresi
  slash tahap 1.
- **Belum diputuskan, dan sengaja tidak ditebak:** siapa membersihkan `inbox/`
  bot yang tidak pernah dinyalakan lagi (user sudah menyatakan sikap umumnya —
  *"kalau bot mati ya sudah"* — tapi penumpukan berkas belum pernah dibahas
  sebagai kasusnya sendiri) · apakah kolom `bot` akhirnya dibuang · apakah
  `agent-bus` sistem lama diarahkan ke `inbox/` ini, dan kapan.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* · *"kita tidak perlu presisi di sini… no need to be so
  serious"* · *"Aku enggak mau over engineer."*
