# State Per-Folder Bot dan Inbox Antar-Bot

**Date:** 2026-08-04 22:30 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `d2e9038` · HEAD kode: `2277949`)
**Dari → Ke:** bot-03 → bot-02
**Pair:** bot-03 ⇄ bot-02
**Lanjutan dari:** `.handoff/202608041141-prompt-statusline-lama-dan-switch.md`
**Plan terkait:** — (belum ada rencana TDD; **menulisnya adalah langkah pertamamu**)

---

## 1. Tujuan Handoff

Context bot-03 mencapai **53%** sesudah sesi panjang berisi audit, pembersihan,
dan brainstorming arsitektur. User meminta estafet ping-pong ke bot-02 supaya
serah-terimanya ditulis **selagi alasan tiap keputusan masih segar**, bukan saat
context sudah mepet.

**Goal estafet:** kerjakan **dua** pekerjaan yang keputusannya sudah diambil user
malam ini — **(A) seluruh state pindah ke folder masing-masing bot**, dan
**(B) komunikasi antar-bot lewat `inbox/` + konvensi folder tetangga**. User
tidur dan akan memeriksa hasilnya besok pagi; ia menyetujui **merge ke `main`
tanpa uji hidup**, dengan syarat **state produksi tidak disentuh**.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine + MCP server, Bun) dan `cc-wrapper` (PTY, Node + tsx).
Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian lewat launcher `mirza-cc`. Sistem **baru** melayani satu
bot, **`mirza_01_bot`** — dulu bernama `bot-uji`, diganti hari ini.

⚠️ **Jebakan penamaan yang sudah memakan waktu:** folder `mirza_01_bot` melayani
bot Telegram **`@mirza_01_bot`**; keenam bot harian justru bernama
`@mirza_botone_bot` … `@mirza_botsix_bot`. Jangan menyimpulkan sistem mana dari
pola namanya — petakan lewat `getMe`.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main` dan ter-push di **kedua** repo. 7 commit kode, 9 commit
dokumen.

**Pekerjaan (1) handoff sebelumnya — statusline enam bot — TUTUP 6/6.** Keenam
`chained-statusline` terisi 84 byte, `settings.json` keenamnya disamakan ke
`0.0.37-mirza.0` sehingga installer early-return, dan user mengonfirmasi baris
statusnya tampil. ⚠️ Instruksi handoff-nya sendiri **keliru** dan hanya uji
kering yang menangkapnya: `bash` telanjang di `cmd.exe` mesin ini resolve ke
**WSL**, bukan Git Bash.

**Task 6 `2.5-KELUAR` ditutup — tahap itu tuntas.** Lima dari enam pemeriksaan
lulus dari `conversations.db` + `logs/session-hook.log`; #1 (markdown tampil
tebal) dikonfirmasi user lewat screenshot.

**Audit BACKLOG.** Tiga item dicoret (W-19, W-20, W-23), dua klaim dikoreksi —
termasuk **baris pertama tabel** yang menyatakan 2.5-KELUAR belum punya spec
padahal keduanya ada.

**Penyederhanaan (relevan langsung ke pekerjaanmu):**
- `fleet.db` **dibuang seluruhnya** (`3451037`) — empat tabel nol baris/nol
  rujukan, lalu `bot_inbox` ternyata ikut mati bersama daemonnya.
- Parameter `bot` **dibuang** dari `read_history`/`search_history` (`18b04fd`).
- Tiga berkas sampah dihapus (`fleetd.sock`, backup db nol tabel, probe log).
- README `mirza-bots` sudah **diperbarui** (`2277949`).

**`bot-uji` → `mirza_01_bot`.** Folder, config, `inbox/`, `sessions/`, `status/`,
`locks/`, dan 138 baris di dua database dimigrasi; diverifikasi **dua arah**
(nama baru ada **dan** nama lama tersisa nol).

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, tidak ada worktree tersisa.)

## 5. Blocker

— (tidak ada. Kedua keputusan sudah diambil user **secara eksplisit lewat
tombol**, dan izin merge tanpa uji hidup juga sudah diberikan. Kerjakan langsung
section AKAN.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** pindahkan seluruh state ke folder masing-masing bot, lalu bangun jalur
antar-bot lewat `inbox/` — keduanya sesuai keputusan yang sudah tertulis.

**Langkah pertamamu: tulis rencana TDD.** Belum ada, dan pekerjaan ini terlalu
besar untuk dikerjakan tanpa peta. Dua dokumen keputusan sudah memuat bahan
mentahnya (daftar berkas, migrasi, batas) — kamu tinggal menyusunnya jadi task
berurut.

### (A) State per-folder bot

Bentuk yang disepakati:

```
workspace/<nama-bot>/
├── config.json      token + allowFrom + timezone bot INI (bukan daftar bots)
├── conversations.db riwayat bot INI
├── session.id       dulu sessions/<bot>.id
├── status.json      dulu status/<bot>.json
├── bot.pid          dulu locks/<bot>.pid
├── data/            berkas & gambar dari user (dulu bernama inbox/)
├── inbox/           titipan pesan dari bot lain (BARU, bagian B)
└── logs/
```

`~/.claude/mirza-bots/` **hilang seluruhnya**. Berkas yang tersentuh dan alasan
tiap perubahan ada di **`docs/2026-08-04-state-per-folder-bot.md` Bagian 4** —
jangan kutip ulang, baca di sana.

⚠️ **`MIRZA_BOTS_HOME` kemungkinan ikut hilang**, dan banyak test memakainya
untuk mengarahkan state root. Pikirkan penggantinya untuk test **sebelum**
menyentuh `paths.ts`, bukan sesudah suite merah.

### (B) Jalur antar-bot lewat `inbox/`

- **Alamat** = folder tetangga: `../<nama-bot>/inbox/`. **Tidak ada**
  `agent-registry.json`, tidak ada berkas daftar peer.
- **Kirim** = tulis `<uuid>.json` lewat tmp+rename.
- **Terima** = engine memindai `inbox/` miliknya sendiri — tiru pola
  `cc-wrapper` untuk `pending/`.
- Payload membawa `expects_reply` (**boolean, bukan enum tipe**) dan
  `in_reply_to`. Aturan keras: **`expects_reply: true` hanya sah bila pesannya
  bukan balasan** — satu baris validasi yang membuat loop A↔B tidak mungkin,
  bukan sekadar dibatasi.
- **`hop_count` tidak ada di sistem baru** (terukur: nol hasil di `cc-plugin`
  dan `cc-wrapper`). Bawa serta dari `agent-bus` — `MAX_HOP = 5`, ditolak di
  sisi pengirim.
- ⚠️ **`reply-guard` akan memaksa balasan ke Telegram untuk pesan antar-bot**
  bila sumbernya tidak ditandai. Ini **pengulangan W-14**. Penanda sumber itu
  **syarat, bukan fitur** — tanpanya chat user disemprot tiap dua bot bicara.

Detail lengkap: **`docs/2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md`**.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu, lalu dua dokumen keputusan di atas.

### Syarat kerja malam ini (dari user, jangan dilanggar)

1. **Merge ke `main` boleh tanpa uji hidup** — kode yang mendarat tidak aktif
   sampai plugin di-update + wrapper di-restart, dan itu tangan user.
2. **JANGAN sentuh state produksi**: `~/.claude/mirza-bots/`,
   `workspace/mirza_01_bot/`, dan config bot manapun. Siapkan skrip migrasinya,
   **jangan jalankan**.
3. **JANGAN me-restart sesi user** (W-18).
4. Kalau ada yang tidak bisa diputuskan tanpa menebak — **berhenti dan catat**,
   jangan pilih asal. Menebak salah semalaman lebih mahal daripada menunggu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** `~/.claude/agent-playbook/PLAYBOOK.md` **sudah tidak ada** — skill ini penggantinya. Aturan Plane sudah dicabut (0.0.11) |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild** |
| `docs/2026-08-04-state-per-folder-bot.md` | **Di awal, untuk (A).** Bagian 4 = daftar berkas yang tersentuh; Bagian 5 = keberatan yang sudah gugur, **jangan angkat ulang** |
| `docs/2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md` | **Di awal, untuk (B).** Bagian 4 = apa yang user TOLAK berikut alasannya |
| `docs/2026-08-04-daftar-fitur-sistem-baru.md` | Saat perlu tahu apa yang sudah ada vs belum |
| `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" | **WAJIB sebelum minta user uji hidup** |
| `docs/superpowers/plans/2026-08-04-context-telegram.md` | Saat butuh contoh rencana TDD yang terbukti jalan di lapisan ini |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| State terpusat atau per-folder? | **Per-folder, tidak ada yang bersama** | `~/.claude/mirza-bots/` hilang, termasuk `conversations.db` |
| Folder `bot-shared`? | **Dibatalkan user sendiri** | Handoff/docs/knowledge sudah punya rumah |
| Bagaimana bot saling kenal? | **Konvensi folder tetangga**, bukan berkas daftar | Tidak ada registry; daftar bot = isi folder induk |
| Nama `inbox/` untuk unduhan user | **Ganti jadi `data/`** | `inbox/` dipakai sebagaimana namanya |
| Tipe pesan `ack-required`/`ack-response`? | **Diganti boolean `expects_reply`** | Tipe beranak dan memaksa guard diperbarui; boolean tidak |
| Timeout balasan antar-bot | **Cron di sesi pengirim**; timeout → **mengadu ke user**; bot mati → **ya sudah** | Tidak ada status "menunggu" yang dilacak sistem |
| `deadline_at` di db sebagai cadangan? | **Ditolak — over-engineering** | Cron saja |
| Parameter `bot` di tool riwayat | **Dihapus** | Sudah dikerjakan (`18b04fd`) |
| Kriteria yang membingkai semuanya | *"instalasi serta struktur yang mudah dipelajari orang lain"* | Ini **penentu**, bukan hiasan |
| Prosedur rilis plugin | **Perkara development, audiens berbeda** | Jangan dicampur ke spec ini |
| Malam ini kerjakan sampai mana? | **A + B, merge boleh** | Produksi tidak disentuh |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan supaya bot
berikutnya bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan.
Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01 → bot-02 → bot-03, dan
sesi ini menambah **tiga** tingkat.

**Tingkat 1–5** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran tidak sama dengan memakainya.

**Tingkat 6–8** (dari sesi bot-02 sebelumnya): verifikasi **efek**, bukan
artefak · memperbaiki satu bug membuka bug di belakangnya · identitas berbasis
string persis rapuh terhadap apa pun yang berubah tiap rilis.

**Tingkat 9 (sesi ini): perintah warisan adalah hipotesis, bukan fakta.**
Handoff sebelumnya menyuruh mengisi rantai statusline dengan `bash "C:/…"`. Di
mesin ini `bash` telanjang di `cmd.exe` resolve ke **WSL** — distro
`docker-desktop` yang bahkan tidak punya `/bin/bash` — dan gagal **diam-diam**.
Uji kering dengan pemanggil yang sama persis (`spawnSync(..., {shell:true})`)
menangkapnya, **dan sekaligus membalik dugaan saya sendiri** soal quote-stripping
`cmd.exe`: bentuk yang saya sangka rusak justru jalan, dan versi "diamankan"
yang rusak. Dua dugaan, dua-duanya salah, dua-duanya murah dibongkar satu probe
20 baris.

**Tingkat 10 (sesi ini): mutation check yang HIJAU harus dibuktikan dulu
mutasinya terpasang UTUH.** Terjadi **dua kali** hari ini. Pertama: string
replace tidak cocok karena CRLF, jadi mutasinya tidak pernah ada — saya nyaris
menyimpulkan "test saya tidak menjaga apa-apa". Kedua, lebih halus: mutasinya
terpasang **sebagian**, saya hanya memverifikasi 1 dari 3 potongan. Aturannya:
sesudah memasang mutasi, **assert bahwa setiap potongannya ada di berkas**
sebelum membaca hasil testnya.

**Tingkat 11 (sesi ini): keberatan yang benar bisa tetap salah kalau kasusnya
belum ada.** Saya menahan keputusan user (riwayat per-folder) dengan argumen
lintas-bot yang secara teknis benar. Lalu saya ukur: **136 baris satu bot, 1
baris nyasar** — lintas-bot belum pernah terjadi. Saya menahan yang diinginkan
**sekarang** demi kasus yang **belum ada**. Kalau kamu menemukan dirimu
berkeberatan, ukur dulu apakah kasusnya nyata.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Verifikasi dua arah saat migrasi:** bukan cuma "nama baru ada", tapi
  **"nama lama tersisa nol"**. Yang baru muncul tidak membuktikan yang lama
  tidak ketinggalan.
- ✅ **Ubah test lama, jangan hapus.** Test yang mengunci "menyeberang hanya
  bila parameter disebut" diubah jadi mengunci **ketiadaan** jalur itu — argumen
  diselundupkan lewat `as never`, hasilnya tetap milik bot pemanggil.
- ✅ **`getMe` menyelesaikan pertanyaan identitas bot dalam satu panggilan.**
- ❌ **JANGAN sunting kode dengan skrip berbasis heuristik baris.** Dua kali
  memakan lebih dari yang diminta (menghapus `const convTableRows = …`, lalu
  deklarasi `conversationsDbPath`). Keduanya ketahuan karena **test
  dijalankan**, bukan karena diff dibaca. Keluarga yang sama dengan larangan
  "loop naik ke induk sampai root": batas yang ditebak akan dilewati. Pakai
  `Edit` yang presisi.
- ❌ **JANGAN percaya string literal multiline di skrip Node untuk berkas repo
  ini** — CRLF membuat `includes()` gagal diam-diam.
- ❌ **JANGAN `git checkout <file>`** untuk mengembalikan mutation check bila
  perubahannya belum di-commit — pakai salinan.
- ⚠️ **Worktree baru butuh `bun install` sendiri.** Suite akan merah dengan
  "Cannot find module" yang terlihat seperti kerusakan kode, padahal environment.
- ⚠️ **Background task yang menggantung memegang folder worktree** sehingga
  `git worktree remove` gagal "Permission denied". Hentikan task-nya dulu.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `d2e9038` (9 commit, `538c12e..HEAD`); kode HEAD
  `2277949` (7 commit, `3abcc58..HEAD`).
- **Versi terpasang:** `cc-plugin` **0.10.4** · `bot-conduct` 0.0.11 ·
  `inline-buttons` 0.0.10 · `telegram` (marketplace lama) 0.0.37-mirza.0.
  ⚠️ **Kode `fleet.db` sudah dicabut di `main`, tapi 0.10.4 di cache masih
  membukanya** — karena itu berkas `fleet.db` fisiknya belum bisa dihapus
  ("Device or resource busy"). Itu **bukan kegagalan**; ia hilang sendiri
  sesudah rilis + restart.
- **Angka test:** `cc-plugin` **396** hijau (dari 399; lima test ikut terhapus
  bersama `fleet.db` dan parameter `bot`).
- **Meteran yang terbukti berguna, pakai lagi:** `conversations.db` (readonly,
  `node:sqlite`) · `~/.claude/plugins/installed_plugins.json` (**versi yang
  benar-benar terpasang**) · `Get-CimInstance Win32_Process` (**siapa
  benar-benar berjalan**) · `logs/session-hook.log` (membongkar kenapa
  `mirza-bot` gagal start jam 16:25) · `getMe` Telegram.
- **Belum diuji hidup:** rollback `/context` · regresi slash tahap 1 · seluruh
  pekerjaan (A) dan (B) yang akan kamu kerjakan.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* · *"kita tidak perlu presisi di sini… no need to be so
  serious"* · dan malam ini: *"Aku enggak mau over engineer."*
