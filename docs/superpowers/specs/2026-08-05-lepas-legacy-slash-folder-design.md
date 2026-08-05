# Lepas dari Arsitektur Legacy — Folder `slash/` dan Tool `send_slash`

**Tanggal:** 2026-08-05 · **Penulis:** bot-03 (estafet dari bot-02)
**Repo dokumen:** `mirza-marketplace` · **Repo kode:** `mirza-bots`
**Handoff:** `.handoff/202608050910-prompt-lepas-legacy-slash-folder.md`
**Brainstorming:** sudah dijalankan bot-02 bersama user; empat keputusan diambil
lewat tombol dan tercatat di §7. Spec ini **tidak membuka ulang** keempatnya.

---

## 1. Syarat yang mengatasi segalanya

Kalimat user pagi ini: ***"Saya ingin kita benar-benar terlepas dari arsitektur
legacy."***

Yang membuat kalimat itu punya gigi bukan estetika penamaan, melainkan satu
konsekuensi mekanis yang sudah dinyatakan user sendiri di brainstorming:

> ***"Bot harus saling mengenal sesamanya sehingga mereka bisa saling berkirim
> pesan."***

Bot menebak jalur tetangganya dari **bentuk folder**, bukan dari pengetahuan
yang diwariskan. Selama sebagian state bersembunyi di
`.claude/channels/pty-controller/` — nama sebuah plugin yang tidak lagi ada di
sistem ini — bot berikutnya harus **diberi tahu** jalan rahasianya, dan
kebutuhan memberi tahu itulah yang dulu melahirkan registry. Registry sudah
dibuang 2026-08-04; sisa foldernya belum.

**Syarat turunan yang dipakai spec ini sebagai penyaring:** sesudah pekerjaan
ini, `mirza-bots` tidak boleh menyebut string `pty-controller` di mana pun,
dan `<botHome>/.claude/channels/` tidak boleh dipakai lagi oleh kode mana pun.

## 2. Apa yang sebenarnya legacy di sini

Ironinya terukur: **`cc-wrapper` adalah komponen paling baru di sistem ini**
(lahir 2026-08-03) dan justru dialah yang membawa nama plugin lama.

`cc-wrapper/src/main.ts:29-31`:

```ts
const STATE_DIR = join(PROJECT_DIR, ".claude", "channels", "pty-controller");
const PENDING_DIR = join(STATE_DIR, "pending");
const LOCK_FILE = join(STATE_DIR, "wrapper.pid");
```

Komentar di kepala berkas mengakuinya terang-terangan: *"Folder state mengikuti
pola wrapper lama supaya penulis yang sudah ada tetap bekerja."* Itu **alasan
yang sah pada harinya** — wrapper baru lahir tanpa penulis sendiri, jadi ia
menumpang alamat wrapper lama supaya `plugins/telegram` dan `agent-bus` bisa
mengisinya tanpa diubah.

Alasan itu **sudah gugur**, dan bukan karena selera:

| Penulis lama | Status hari ini |
|---|---|
| `plugins/telegram` (sistem lama) | Tidak pernah melayani bot baru. Bot baru dilayani `cc-plugin`, yang menulis lewat `engine/slash/pending.ts` — kode kita sendiri |
| `agent-bus` (sistem lama) | **Payloadnya sudah ditolak `cc-wrapper` hari ini juga** — lihat §3.2 |

Jadi yang tersisa dari "supaya penulis lama tetap bekerja" adalah **nol penulis
lama yang benar-benar bekerja**. Yang tersisa hanya namanya.

### 2.1 Keadaan nyata, diukur bukan ditebak

Isi `.claude/channels/` pada kedua bot baru, dibaca 2026-08-05:

```
mirza_01_bot/.claude/channels/pty-controller/wrapper.pid
mirza_02_bot/.claude/channels/pty-controller/wrapper.pid
```

Hanya `wrapper.pid` (plus `pending/` yang kosong, dibuat wrapper saat boot).
Artinya seluruh subtree `.claude/channels/` di sistem baru berisi **tepat dua
hal**, dan dua-duanya yang dipindahkan pekerjaan ini. Sesudahnya foldernya
kosong dan bisa dihapus user.

## 3. Tiga hal mekanis yang mengunci bentuk desainnya

### 3.1 `send_slash` WAJIB lahir di perubahan yang sama

Begitu `cc-wrapper` berhenti membaca `pending/` lama, `pty_send_slash` milik
plugin lama **berhenti bekerja untuk bot baru** — ia masih menulis ke alamat
lama, dan tidak ada lagi yang membacanya.

Konsekuensinya bukan ketidaknyamanan: `/rename` adalah **satu-satunya** cara
sebuah bot mengganti nama sesinya sendiri, dan itu dipakai **tiap kali handoff**
(termasuk oleh bot yang sedang membaca spec ini). Memisahkan pemindahan folder
dari kelahiran `send_slash` menciptakan jendela di mana bot baru tidak bisa
me-`/rename` dirinya sendiri.

**Aturan:** satu rencana, dan tidak ada task yang boleh mendarat sendirian di
`main` kalau ia membuka jendela itu. Urutan di dalam rencana: `send_slash`
lengkap dan hijau **lebih dulu**, pemindahan `cc-wrapper` terakhir.

### 3.2 `slash/` TIDAK BOLEH digabung dengan `inbox/`

Ini terukur di kode, bukan kekhawatiran. `cc-wrapper/src/main.ts` **menghapus
berkas sebelum mem-parse-nya**:

```ts
raw = readFileSync(path, "utf8");
try { rmSync(path); } catch {}          // baris 155 — hapus DULU
const parsed = parsePayload(raw);        // baris 160 — baru parse
if (parsed.kind === "invalid") { console.error(...); continue; }
```

Urutan itu **disengaja dan benar** untuk tujuannya: crash di tengah penanganan
tidak boleh memproses perintah dua kali. Tapi ia berarti berkas yang ditolak
sudah lenyap dari disk sebelum ada yang tahu ia ditolak.

Kalau `slash/` dan `inbox/` berbagi satu folder, dua pembaca berlomba: wrapper
(polling 500 ms) dan engine. Wrapper menang lebih sering, **menghapus** pesan
antar-bot, lalu menolaknya karena `parsePayload` menuntut field `command` yang
tidak ada di payload antar-bot. Pesannya lenyap; satu-satunya jejaknya adalah
`console.error` di terminal wrapper yang tidak ada yang baca.

> **Temuan baru sesi ini — kegagalan itu SUDAH terjadi hari ini.**
> `plugins/agent-bus/prompt-compose.ts:97` menulis
> `{ id, ts, type: "prompt", from, text, hop_count }` ke
> `<peer>/.claude/channels/pty-controller/pending/`. Tidak ada field `command`.
> `cc-wrapper/src/inbox.ts:25` menolak payload tanpa `command` yang diawali
> `/`. Jadi **prompt agent-bus lama yang dikirim ke bot BARU sudah dihapus lalu
> ditolak diam-diam sejak `cc-wrapper` lahir.** Belum menggigit karena belum
> ada yang mencoba; AB-2 di BACKLOG (agent-bus lama termuat di setiap sesi)
> adalah pemicu yang menunggu.
>
> Pekerjaan ini **memperbaikinya sebagai efek samping**: sesudah wrapper pindah
> ke `slash/`, payload agent-bus lama mendarat di folder yang tidak dibaca
> siapa pun. Ia tetap tidak sampai — tapi ia **menumpuk dan terlihat** alih-alih
> lenyap. Dua-duanya kegagalan; hanya satu yang bisa didiagnosis.

### 3.3 `send_slash` tidak boleh bergantung pada engine yang hidup

`main.ts` memanggil `buildServer(started.engine)` hanya kalau engine berhasil
start; kalau gagal ia memanggil `buildServer({kind:"unavailable", ...})` dan
**setiap tool menjawab dengan alasannya** — pola yang sudah ada dan benar
(W-16: plugin yang menyembunyikan toolnya saat gagal tidak bisa dibedakan dari
plugin yang tidak terpasang).

Tapi untuk `send_slash` pola itu **salah sasaran**. Engine gagal start berarti
Telegram mati; `send_slash` tidak butuh Telegram sama sekali — ia cuma perlu
tahu folder bot, dan `resolveIdentityCwd()` di `main.ts` sudah punya itu tanpa
engine. Justru **di situlah** user paling butuh `/clear` atau `/rename` untuk
memulihkan sesinya.

**Bentuknya:** `buildServer(backend, botHome)`. `botHome` diteruskan di kedua
cabang (engine hidup maupun `unavailable`), dan `send_slash` sama sekali tidak
menyentuh `backend`.

## 4. Bentuk desain

### 4.1 Folder

```
workspace/<nama-bot>/
├── config.json          token + allowFrom + timezone
├── conversations.db     riwayat
├── session.id           sesi CC terbaru
├── status.json          tangkapan statusline
├── chained-statusline   statusline pendahulu
├── bot.pid              engine — pemegang token Telegram
├── wrapper.pid          ← PINDAH dari .claude/channels/pty-controller/
├── data/                berkas dari user
├── inbox/               pesan dari bot lain      → dibaca ENGINE
├── slash/               ← BARU: perintah ke CC   → dibaca WRAPPER
└── logs/
```

Dua berkas yang pindah, satu folder yang lahir. Sesudah ini
`<botHome>/.claude/channels/` tidak dipakai kode mana pun.

**`wrapper.pid` sejajar `bot.pid` bukan kebetulan.** Keduanya menjawab
pertanyaan yang sama bentuknya — *"proses mana yang memegang X untuk folder
ini"* — dan menyimpannya di dua tempat berbeda memaksa siapa pun yang
mendiagnosis bot bisu mengingat dua alamat. `paths.ts` sudah menyimpan `bot.pid`
di akar folder bot dengan alasan yang persis sama.

### 4.2 Kontrak payload — TIDAK berubah

Isi berkas di `slash/` sama persis dengan isi berkas di `pending/` hari ini:

```
akar OBJEK  -> { command: "/rename x", confirmAfterMs?: number }
akar ARRAY  -> [{command}, {command}, ...]   (maks 8, dienqueue berdampingan)
```

`cc-wrapper/src/inbox.ts` (`parsePayload`) dan `cc-wrapper/src/queue.ts` **tidak
disentuh**. Yang berubah hanya *di mana* wrapper mencari, bukan *apa* yang ia
temukan. Itu menjaga permukaan perubahan sekecil mungkin dan membuat seluruh
test antrean yang sudah ada tetap berlaku sebagai jaring.

Penulisan tetap atomik (`.tmp.<pid>` lalu `rename`), karena pembacanya masih
polling — alasannya tidak berubah.

### 4.3 Tool MCP `send_slash`

| | |
|---|---|
| **Nama** | `send_slash` — tanpa awalan `pty_` (keputusan user; "pty" itu detail implementasi) |
| **Cakupan** | Satu tool saja. **Tidak ada** `status`, **tidak ada** `list_agents` — yang kedua sudah digantikan `agent_list` |
| **Target** | **Diri sendiri saja.** Tidak ada parameter `target`. Menguatkan neighbor-autonomy 2026-06-07 |
| **Input** | `command: string` **atau** `commands: string[]` (maks 8). Tepat satu dari keduanya |
| **Ketergantungan** | `botHome` saja. Tidak menyentuh `Engine` |

Deskripsi tool ditulis **dalam bahasa Inggris** (K-16: ini instruksi mesin ke
AI, bukan pesan ke user), konsisten dengan `reply` / `agent_send` / `agent_list`.

**Kenapa tetap ada bentuk batch.** Bukan kelengkapan spekulatif: urutan
`["/rename done-…", "/clear", "/rename idle"]` adalah **cara sebuah bot menutup
sesinya sendiri sesudah handoff**, dan itu terjadi tiap estafet. Ditulis sebagai
satu berkas supaya tidak ada payload lain menyelip di antaranya — jaminan yang
hilang kalau AI memanggil tool tiga kali.

### 4.4 Keputusan turunan (D-1..D-4)

Keempatnya **diturunkan**, bukan diambil user. Ditulis di sini supaya bisa
dibantah dengan alasan alih-alih ditemukan ulang.

| | Pertanyaan | Yang diambil | Diturunkan dari |
|---|---|---|---|
| **D-1** | `slashDirIn()` tinggal di mana | `src/engine/paths.ts`, bersama `inboxDirIn`/`dataDirIn`/`logsDirIn` | `paths.ts` sudah jadi **satu-satunya** tempat bentuk folder bot ditulis. Menaruhnya di `slash/pending.ts` membuat dua berkas berpendapat soal bentuk folder |
| **D-2** | `ensureBotDirs()` ikut membuat `slash/`? | **Ya** | Ketiga folder lain sudah lahir di situ. `slash/` yang lahir belakangan lewat `mkdirSync` di `writePending` membuat `ls <botHome>` bot baru terlihat berbeda tergantung apakah slash pernah dipakai |
| **D-3** | `send_slash` menolak `/new`, `/switch`, `/delete`, `/effort`? | **Ya, ditolak dengan menyebut alternatifnya** | Keempatnya perintah lapisan Telegram, **tidak ada** di Claude Code. Menyuntikkannya = CC menampilkan "unknown command" dan AI tidak pernah tahu. `pty_send_slash` lama sudah menolaknya dan alasannya tidak berubah. `/new` punya pemetaan di `map.ts` (`/clear` + `/rename`) — pesan penolakannya menunjuk ke situ |
| **D-4** | `pendingDir()` dihapus atau di-alias | **Dihapus** | Tingkat 12: pagar yang berhenti menjaga jadi jebakan yang menunggu. Alias yang menunjuk folder yang tidak dibaca siapa pun adalah **kode mati yang tetap dieksekusi** — persis kelas bahaya yang paling mahal |

## 5. Permukaan yang tersentuh

| Berkas | Sekarang | Jadi |
|---|---|---|
| `cc-plugin/src/engine/paths.ts` | — | **+ `slashDirIn(botHome)`**; `ensureBotDirs` ikut membuatnya (D-2) |
| `cc-plugin/src/engine/slash/pending.ts` | `pendingDir(projectDir)` + `writePending` | **`pendingDir` dihapus** (D-4); `writePending` tetap |
| `cc-plugin/src/engine/slash/index.ts` | `pendingDir(deps.projectDir)` | `slashDirIn(deps.botHome)`; field `projectDir` → `botHome` |
| `cc-plugin/src/engine/slash/send-tool.ts` | belum ada | **BARU** — validasi murni input `send_slash` → payload atau pesan tolak |
| `cc-plugin/src/server.ts` | `buildServer(backend)` | `buildServer(backend, botHome)` **+ tool `send_slash`** |
| `cc-plugin/src/main.ts` | `buildServer(started.engine)` | `buildServer(…, resolveIdentityCwd())` di **kedua** cabang |
| `cc-plugin/src/engine/engine.ts` | `projectDir: botHome` (3 tempat) | ikut nama field baru |
| `cc-wrapper/src/main.ts` | `STATE_DIR`/`PENDING_DIR`/`LOCK_FILE` di `.claude/channels/pty-controller` | `SLASH_DIR = <botHome>/slash`, `LOCK_FILE = <botHome>/wrapper.pid` |
| `cc-plugin/test/engine/slash/pending.test.ts` | menguji `pendingDir` | menguji `slashDirIn` (pindah ke test `paths`) |
| `cc-plugin/test/engine/slash/index.test.ts` | `projectDir` | `botHome` |
| `cc-plugin/test/engine/context/slash-context.test.ts` | `projectDir` (baris 31, 47) | `botHome` |

**Yang TIDAK disentuh, dan ini pagar keras:** `plugins/pty-controller/**` dan
`plugins/agent-bus/**`. Enam bot harian memakainya, dan tidak satu pun bagian
pekerjaan ini butuh mengubahnya.

`cc-wrapper/src/inbox.ts`, `queue.ts`, `typer.ts`, `registry.ts`, `lock.ts`
juga tidak disentuh — `lock.ts` menerima path lock sebagai argumen, jadi
memindahkan `wrapper.pid` hanya mengubah pemanggilnya.

## 6. Kriteria uji hidup

Test menjaga yang sudah terbayangkan; yang belum terbayangkan hanya jatuh saat
kode menyentuh yang asli (tingkat 13). Jadi daftar ini bukan formalitas.

Urut dari yang paling mungkin gagal:

1. **Bot baru me-`/rename` dirinya sendiri lewat `send_slash`, dengan
   `pty-controller` DIMATIKAN di folder itu.** Ini kriteria penentu. Selama
   plugin lama masih aktif, `/rename` yang berhasil **tidak membuktikan** tool
   barumu yang bekerja — dua tool mengerjakan pekerjaan yang sama dan yang
   menjawab bisa yang mana saja.
   Mematikannya (terukur, bukan ditebak):
   `claude plugin disable -s project pty-controller@mirza-marketplace`
   menulis `{"enabledPlugins": {...: false}}` ke `.claude/settings.json` folder
   itu. Scope project → **enam bot harian tidak tersentuh**. Reversibel lewat
   `claude plugin enable -s project`.
   ⚠️ **Jangan dimatikan sebelum `send_slash` mendarat dan terpasang.**
2. **Batch mendarat berurutan dan tidak diselipi.** `["/rename uji-batch-1",
   "/clear", "/rename uji-batch-2"]` → nama sesi akhir `uji-batch-2`, dan
   `/clear` benar-benar melahirkan sesi baru (`session.id` berubah).
3. **Berkas benar-benar mampir di `slash/` lalu hilang.** Bukan cuma efeknya:
   `ls <botHome>/slash/` sebelum wrapper mengambilnya, dan kosong sesudahnya.
   Membuktikan alamat barunya yang dipakai, bukan alamat lama yang kebetulan
   masih bekerja.
4. **`wrapper.pid` lahir di akar folder bot**, dan PID di dalamnya cocok dengan
   proses `tsx`/`node` yang benar-benar berjalan (`Get-CimInstance
   Win32_Process` — angka di berkas bukan bukti).
5. **`<botHome>/.claude/channels/` tidak lahir lagi** sesudah wrapper restart.
   Sisa yang lama dibiarkan sampai user memutuskan menghapusnya.
6. **`send_slash` tetap menjawab saat engine MATI.** Rusak `config.json`
   sementara (backup dulu) → engine gagal start → `send_slash` **tetap
   bekerja**, sementara `reply` menjawab "Telegram is not available: …".
   Ini kriteria yang paling mudah dilewati dan paling langsung membuktikan §3.3.
7. **`grep -ri "pty-controller" mirza-bots/` → nol hasil** di luar dokumen
   historis. Ini yang menutup §1.

## 7. Keputusan user lewat brainstorming (2026-08-05, bot-02)

Keempatnya diambil lewat tombol. **Jangan ditanyakan ulang.**

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| `slash/` dan `inbox/` digabung atau dipisah? | **Dua folder, dua nama baru** | Pembacanya beda (wrapper vs engine); menggabungkan membuat wrapper menelan pesan antar-bot (§3.2) |
| Letaknya di mana? | **Sejajar `config.json` / `conversations.db` / `inbox/` — TIDAK numpang di `.claude/`** | `.claude/channels/` hilang seluruhnya dari sistem baru |
| Boleh bot lain menulis ke `slash/` tetangga? | **TIDAK — self-only** | Neighbor-autonomy 2026-06-07. Mau menyuruh tetangga? Titip ke `inbox/`-nya, AI-nya yang eksekusi |
| Nama & cakupan tool pengganti | **`send_slash` saja** | Tanpa `pty_`, tanpa `status`, tanpa `list_agents` |

**Bentuk folder §4.1** dipresentasikan bot-02 tapi user memilih handoff sebelum
menjawab. Persetujuannya diminta ulang oleh bot-03 dan **DISETUJUI user lewat
tombol pada 2026-08-05 09:16 WIB** ("1️⃣ Setuju") — termasuk `wrapper.pid` ikut
pindah ke akar folder bot. Kelima keputusan user kini lengkap; tidak ada lagi
yang menunggu jawaban.

## 8. Yang belum diukur — dinyatakan, bukan disembunyikan

- **Berapa sering `send_slash` akan dipanggil.** Sistem lama punya angkanya
  (`/rename` 3,87/hari, `/new` 1,70/hari) tapi itu jalur **Telegram → engine**,
  bukan jalur **AI → tool**. Yang kedua belum pernah diukur di sistem manapun.
  Tidak menghalangi pekerjaan ini; menghalangi klaim soal seberapa penting ia.
- **Apakah AI akan memilih tool yang benar** saat `pty_send_slash` (lama) dan
  `send_slash` (baru) sama-sama termuat di satu sesi. Itu AB-2 di BACKLOG, dan
  spec ini tidak menyelesaikannya — ia hanya membuat pilihan yang benar
  **tersedia**. Kriteria uji hidup #1 sengaja mematikan yang lama supaya hasil
  ujinya tidak ikut tergantung pada tebakan AI.
- **Apakah ada penulis pihak ketiga** ke `pending/` lama selain `plugins/telegram`
  dan `agent-bus`. Diperiksa dengan grep; nol hasil. Tidak diperiksa: skrip
  ad-hoc user sendiri di luar repo.

## 9. Yang sengaja TIDAK dikerjakan di sini

- **Menyentuh `plugins/pty-controller/**` atau `plugins/agent-bus/**`.** Enam bot
  harian bergantung padanya, dan tidak ada bagian pekerjaan ini yang butuh.
- **Menghapus `.claude/channels/` yang sudah ada** di `mirza_01_bot` /
  `mirza_02_bot`. Kode berhenti memakainya; **user** yang memutuskan kapan
  foldernya dihapus, dan tidak di hari yang sama (preseden
  `~/.claude/mirza-bots/`).
- **Mengarahkan `agent-bus` lama ke `inbox/` baru.** Itu keputusan tersendiri
  yang belum diambil (tercatat di handoff 202608050400 §10).
- **Mencatat pesan antar-bot ke database** (AB-1). User memilih *"bahas nanti"*
  2026-08-05; jangan ditawarkan ulang sebagai penemuan baru.
- **Kompatibilitas mundur** dengan pembaca folder lama. Keputusan user
  2026-08-05: *"Tidak usah pikirkan backward compatibility. Kita start dari
  nol."*
