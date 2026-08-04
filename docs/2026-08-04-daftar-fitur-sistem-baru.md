# Daftar Fitur Sistem Baru (`mirza-bots`) — per 2026-08-04

**Dibuat:** 2026-08-04 (bot-03), atas permintaan user
**Sumber:** 135 commit `mirza-bots`, `README.md`, dan pembacaan kode langsung —
bukan dari ingatan
**Versi saat didata:** `cc-plugin` 0.10.4 · `cc-wrapper` belum dirilis sebagai
plugin (dijalankan lewat `npx tsx`)

---

## 0. Cara membaca berkas ini

Tiga hal yang gampang tertukar, dan pertukarannya sudah beberapa kali memakan
waktu:

| Sebutan | Artinya |
|---|---|
| **Sistem baru** | `mirza-bots` — paket `cc-plugin` (engine + MCP server) dan `cc-wrapper` (PTY). Melayani **satu** bot: `mirza_01_bot` (dulu bernama `bot-uji`) |
| **Sistem lama** | `mirza-marketplace/plugins/telegram` + `pty-controller`. Melayani **enam** bot harian, dijalankan lewat `mirza-cc` |
| **Plugin lain** | `immediate-reply`, `inline-buttons`, `teach-me`, `bot-conduct`, `handoff`, `daily-report`, `agent-bus`, … — paket **terpisah** di marketplace lama. Bukan bagian `cc-plugin`, dan tidak ikut pindah dengan sendirinya |

⚠️ **`immediate-reply` dan `inline-buttons` bukan fitur sistem baru maupun
sistem lama** — keduanya plugin skill tersendiri yang mengatur *perilaku AI*,
bukan kemampuan engine. `inline-buttons` mengajari AI kapan memasang tombol;
yang **mengirim** tombolnya adalah parameter `buttons` di tool `reply`, dan itu
memang ada di kedua sistem.

---

## 1. Fondasi

| Fitur | Detail |
|---|---|
| **Dua database terpisah** | `fleet.db` (state operasional: `sessions`, `handoffs`, `injections`, `bot_inbox`, `incidents` — aman dihapus) · `conversations.db` (riwayat percakapan, **tidak boleh hilang**) |
| **Pencarian teks penuh** | FTS5 di `conversations.db`, disinkron otomatis lewat **trigger SQL** tiap baris ditambah/diubah/dihapus — bukan indeks yang harus diingat untuk diperbarui |
| **Konfigurasi terpusat** | Satu `~/.claude/mirza-bots/config.json`: `allowFrom`, `timezone`, dan daftar `bots` berisi `home` + `token`. Sistem lama menyebar token ke `.env` tiap folder bot |
| **State terpusat** | `~/.claude/mirza-bots/`: `inbox/<bot>/`, `locks/`, `sessions/`, `status/`, `logs/` |
| **Kunci satu-penarik-per-token** | `locks/<bot>.pid` — mencegah dua proses menarik update untuk token yang sama (`409 Conflict`) |
| **Identitas bot dari folder kerja** | Sesi menentukan dirinya bot mana dari `CLAUDE_PROJECT_DIR`, dicocokkan ke `home` di config. Kalau tidak cocok, menjawab **dengan kalimat**, bukan `null` |
| **Engine tanpa daemon** | 0.4.0 membubarkan daemon `fleetd`; engine berjalan **di dalam** proses `cc-plugin`. Satu proses lebih sedikit yang bisa mati diam-diam |
| **`doctor`** | Melaporkan jumlah bot terdaftar, tabel yang ada, kesiapan kedua database, dan siapa memegang tiap token |
| **Launcher `mirza-bot`** | Jalankan satu bot dari mana saja (~0,25 detik); `mirza-bot -u` update plugin dulu (~6,5 detik, 5,6 di antaranya menembak GitHub) |

### `cc-wrapper` (fondasi, belum dirilis sebagai plugin)

| Fitur | Detail |
|---|---|
| **PTY + antrean injeksi** | Menyuntik slash command ke sesi Claude Code lewat PTY, dengan gerbang jarak-minimum antar-injeksi |
| **Batch atomik** | Beberapa command ditulis sebagai **satu** berkas `pending/`, dijamin tidak disisipi payload lain — inilah yang membuat `/new` = `[/clear, /rename <nama>]` aman |
| **Singleton per folder** | Wrapper kedua untuk folder yang sama **ditolak**. Kebalikan `lock.ts` engine yang membunuh pemegang lama — aturannya sama (lindungi yang paling mahal), yang mahal berbeda |
| **`--continue` + fallback dua syarat** | Menggantikan `--resume` yang menyalin aturan internal CC dan pecah diam-diam bila CC mengubahnya |
| **Deteksi gerbang kepercayaan folder** | Terbukti bisa dilewati injeksi Enter, dan **sengaja tidak dilakukan** — itu memercayai folder atas nama user. Keputusan user: deteksi dan lapor |
| **Teruskan argumen CLI apa adanya** | Flag user (`--dangerously-skip-permissions`, dll.) sampai utuh ke `claude` |

---

## 2. Jalur pesan MASUK

| Fitur | Detail |
|---|---|
| **Teks** | Dasar; pesan masuk diteruskan ke sesi sebagai notifikasi |
| **Foto tunggal** | Diunduh ke `inbox/<bot>/`, dicatat sebagai attachment |
| **Album (banyak foto sekaligus)** | Disatukan jadi **satu** pesan lewat buffer debounce, bukan tiga pesan terpisah. Maksimum **10** item, diurutkan `message_id` menaik (bukan urutan tiba), satu foto gagal unduh **tidak** menjatuhkan seluruh pesan, caption dari beberapa foto diberi label `Photo <n>:` |
| **Dokumen** | PDF, zip, `.md`, `.log`, `.txt` — otomatis sampai **20 MB** (batas Telegram sendiri untuk bot). Di atas itu **ditolak dengan pemberitahuan**, bukan didiamkan: nama + ukuran lewat `meta` plus satu kalimat di isi pesan. Nama berkas pengirim selalu lewat `safeName()` |
| **Kutipan arah masuk** | Kutip seluruh pesan maupun **seleksi sebagian**: `quote_text`, `quote_is_manual`, dan `reply_to_message_id` ikut ke AI |
| **Tombol inline (tap)** | `callback_query` selalu di-*acknowledge* supaya tombol tidak berputar selamanya di HP, lalu isinya dikirim ke AI |
| **Allowlist di depan segalanya** | Pesan dari chat ID di luar `allowFrom` dijatuhkan **sebelum** disimpan, sebelum di-push, dan sebelum chat-nya boleh jadi tujuan balasan berikutnya |
| **Antrean offline** | Pesan yang datang saat tidak ada sesi terhubung ditulis ke `bot_inbox`, lalu dikuras begitu ada sesi menyambung — pesan saat bot "mati" tidak hilang |
| **Orientasi waktu lokal** | `timezone` (nama IANA) di config → `meta.ts_local` di samping `ts` yang **tetap UTC**. Penyimpanan sengaja tidak diubah: UTC tidak ambigu, bisa diurutkan, kebal DST |

---

## 3. Jalur pesan KELUAR

| Fitur | Detail |
|---|---|
| **Tool `reply`** | Teks + `buttons` opsional + `reply_to` + `files` |
| **Kirim lampiran** | Foto → dikirim sebagai **photo** (preview inline), tipe lain → **document**. Kegagalan parsial dilaporkan; path salah ketik → **tidak ada teks yang bocor lebih dulu** |
| **Balasan panjang dipotong otomatis** | Di atas 4096 karakter **setelah escaping**, dikirim sebagai beberapa pesan berurutan tanpa penanda. Tombol menempel di pesan **terakhir**, kutipan di pesan **pertama**, tiap potongan disimpan satu baris sehingga bisa dikutip belakangan. Pedoman menulis ±1000 karakter — **pedoman, bukan gerbang** |
| **Pagar kode yang terbelah** | Blok ``` yang terpotong di sambungan chunk di-*rebalance* mengikuti aturan CommonMark |
| **Markdown otomatis, tanpa flag** | AI menulis CommonMark biasa; engine mengubah ke MarkdownV2, termasuk meng-escape `. - ( ) ! +` yang kalau tidak membuat Telegram menolak **seluruh** pesan dengan 400. **Yang disimpan ke database tetap teks aslinya** |
| **Bot bisa mengutip** | `reply_to` menerima id pesan user **maupun pesan bot sendiri**. AI tidak boleh meminta id itu ke user (U-3) — kalau tidak punya, minta user meng-*quote* |
| **Indikator "typing…"** | Menyala begitu pesan lolos allowlist, diperbarui tiap 4 detik, berhenti di balasan pertama. Batas aman 300 detik supaya giliran yang mati tidak meninggalkan indikator nyangkut. Alasan angkanya: indikator Telegram padam ~5 detik setelah pembaruan terakhir, sementara **97,6% giliran lebih lama dari itu** |
| **Keyboard dicopot setelah ditap** | Pesan diedit tanpa `reply_markup` dan ditambahi `→ <pilihan>`, jadi prompt yang sama tidak bisa dijawab dua kali. Entities asli dikirim ulang supaya format tidak terhapus |
| **Tombol bernomor wajib berketerangan** | Engine **menolak** `reply` yang labelnya angka telanjang bila badan pesan tidak memuat daftar bernomor yang cocok — ditolak sebelum apa pun terkirim. Dulu aturan ini hanya teks yang meminta AI mengingatnya, dan bocor tiga kali dalam dua hari |
| **Balasan keluar ikut disimpan** | `source='assistant'` berikut `message_id` dari Telegram, disimpan **sesudah** kirim berhasil — id itu hanya ada di jawaban Telegram, dan baris tanpa id tidak bisa dikutip belakangan |

---

## 4. Sesi, slash, dan `/context`

| Fitur | Detail |
|---|---|
| **Slash dicegat SESUDAH dicatat** | Aturan paling mengikat di lapisan ini. Sistem lama mencegat **sebelum** mencatat, dan biayanya nyata: audit membaca `/switch` sebagai 0× dipakai padahal **139×** |
| **`/rename <nama>`** | Diolah jadi payload wrapper, tidak diteruskan ke AI |
| **`/new <nama>`** | = `[/clear, /rename <nama>]` — **urutannya bagian dari kontrak** |
| **`/context`** | Dijawab lokal dari berkas tangkapan `status/<bot>.json`; AI tidak ikut menjawab |
| **Slash tak dikenal** | Tidak ditolak — diberi tombol **Kirim/Batal** lebih dulu, karena sebagian slash CC interaktif dan injeksi yang membukanya lalu berhenti meninggalkan TUI menggantung |
| **Menu "/" di Telegram** | Didaftarkan lewat `setMyCommands`, lahir dari `KNOWN_COMMANDS` yang sama yang memutuskan apa yang dicegat — **papan nama dan dapur tidak bisa berbeda pendapat**. Deskripsi bahasa Inggris, disamakan harfiah dengan sistem lama |
| **Pagar `callback_data` 55 byte** | Prefiks `slash:go:` memakan 9 dari 64 byte yang Telegram izinkan. Dihitung **per byte**, bukan per karakter — testnya memakai emoji supaya hitungan karakter tidak lolos |
| **Identitas sesi dibaca, bukan dipotret** | Hook `SessionStart` menulis id sesi terbaru ke `sessions/<bot>.id`; engine membacanya **tiap push**. Tanpa ini, `/clear` membuat pesan berikutnya distempel id sesi lama |
| **Statusline user tidak digusur** | `/context` menjadi `statusLine`-nya sendiri lalu **meneruskan** ke statusline pendahulu. Empat pagar: resolusi project→global · tulis lalu baca ulang, tidak cocok = rollback · **menolak memasang kalau ragu** · mutation check tiap pagar |
| **Bridge versi lama dikenali lewat pola** | Bukan lewat string persis — perintah bridge memuat nomor versi, dan membandingkannya persis membuat bridge lama terbaca sebagai "statusline pendahulu yang harus diselamatkan" |
| **Menunggu tangkapan pertama** | Menunggu **kejadiannya** (berkasnya muncul, maks 12×1,5 detik), bukan `setTimeout` durasi tetap; pesan tunggu dikirim **sebelum** mulai menunggu, karena diam belasan detik tidak bisa dibedakan user dari bot yang mati |

---

## 5. Penjagaan (guard)

| Fitur | Detail |
|---|---|
| **Penjaga balasan (`Stop` hook)** | Kalau giliran berakhir sementara belum ada `reply` sejak pesan masuk terakhir, hook **memblokir sekali** dan menyuruh AI menjawab dulu. Ada karena pengirim membaca Telegram, bukan transkrip |
| **Protokol terse-turn** | Giliran yang dipicu Telegram distempel penanda supaya AI bicara lewat `reply`, bukan lewat transkrip |
| **Hook hanya bicara untuk channelnya sendiri** | Satu sesi bisa memuat `cc-plugin` **dan** plugin telegram lama sekaligus; tanpa penyempitan ini yang satu memblokir pesan milik yang lain |
| **Satu BOM tidak melucuti hook** | `JSON.parse` yang melempar membuat hook keluar lebih awal **sambil tetap terlihat terpasang** |

---

## 6. Riwayat untuk AI

| Fitur | Detail |
|---|---|
| **`read_history`** | Ambil pesan di sekitar sebuah `message_id` — inilah yang membuat *"telusuri beberapa pesan setelah yang saya kutip"* bisa dijawab |
| **`search_history`** | Cari kata kunci lewat FTS5 |
| **Default ke bot pemanggil** | Melihat percakapan bot lain hanya terjadi kalau parameter `bot` disebut sengaja |

---

## 7. BELUM ada di sistem baru

Diukur dengan membandingkan `commands-registry.ts` (lama) vs `KNOWN_COMMANDS`
(baru), dan daftar MCP tool kedua sistem.

| Yang belum ada | Keterangan |
|---|---|
| **8 slash command** | Sistem lama mengenal **11** (`context` `switch` `new` `rename` `delete` `effort` `version` `handoff` `goal` `help` `start`); sistem baru **3** (`context` `rename` `new`) |
| **`/switch`** | Butuh daftar sesi bernama — pekerjaan tersendiri. Registry lama bocor ~50% (28 nama untuk 16 sesi yang benar-benar ada) |
| **Tool `react`** | Memberi reaksi emoji ke pesan |
| **Tool `edit_message`** | Menyunting pesan yang sudah terkirim |
| **Tool `get_message_by_id`** | Mengambil satu pesan berdasarkan id |
| **Tool `download_attachment`** | Sebagai *tool*. Unduhan **otomatis** saat pesan masuk sudah ada; yang belum ada adalah AI meminta unduhan atas inisiatif sendiri |
| **Bot mengirim album** | `sendAttachments` mengirim berkas **satu per satu** (loop), jadi beberapa berkas = beberapa pesan terpisah, **bukan satu album** |
| **Grup** | Hanya chat pribadi. `allowFrom` untuk DM sama dengan user ID pengirim |
| **Kiriman proaktif dari dalam sesi** | Celah #4b: `engine.ts` melempar `no_known_chat` bila bot belum menerima pesan di sesi itu |
| **Notifikasi `session-change` ke Telegram** | Celah #4a — menggantung pada wrapper |

### Belum diuji hidup (bukan berarti tidak ada)

Lintas-bot (mesin ini hanya punya satu bot sistem baru) · PDF/`.md` arah
**masuk** (arah keluar sudah ✅) · dokumen >20 MB · album 3 foto · album >10
foto · rollback statusline.

---

## 8. Catatan pemeliharaan

- README `mirza-bots` merujuk ke bagian §"belum ada" yang **tidak ada di
  berkasnya** (baris 83). Rujukan basi, layak dibereskan atau diarahkan ke
  berkas ini.
- Daftar ini menggambarkan keadaan **2026-08-04**. Kalau dibaca jauh sesudahnya,
  perlakukan sebagai klaim yang harus diukur ulang — persis alasan yang membuat
  audit BACKLOG hari itu perlu dilakukan.
