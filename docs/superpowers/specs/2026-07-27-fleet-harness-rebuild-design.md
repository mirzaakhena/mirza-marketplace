# Spec — Rebuild Harness Bot Telegram (`fleet`)

- **Tanggal:** 2026-07-27
- **Status:** Menunggu review user
- **Asal:** sesi audit `renew-mirza-marketplace` (2026-07-26). Seluruh 529 item inventaris kapabilitas sudah melewati keputusan sadar.
- **Dokumen pendamping yang WAJIB dibaca eksekutor:**
  - `docs/2026-07-26-rebuild-audit/README.md` — ledger induk: 16 keputusan lintas-area (K-1…K-16), 8 fitur baru (B-1…B-8), ringkasan apa yang bertahan
  - `docs/2026-07-26-rebuild-audit/area-01..14` — keputusan per fitur **beserta alasannya**. Spec ini tidak menduplikasi isinya
  - `docs/2026-07-26-rebuild-audit/hook-mapping.md` — 30 hook Claude Code → kewajiban mekanis
  - `docs/2026-07-26-rebuild-audit/state-inventory.md` — 27 artefak state kondisi lama
  - `docs/2026-07-02-capability-inventory/` — kontrak asal 529 item; **rujuk saat butuh detail perilaku persis**

---

## 1. Ringkasan satu paragraf

Kita merakit ulang harness bot Telegram di atas tiga komponen: **`fleetd`** (satu program latar belakang per mesin yang memegang seluruh logika, koneksi Telegram, dan penyimpanan terpusat), **`mirza-cc`** (program tipis yang **user** jalankan di terminalnya — hanya memegang PTY dan meneruskan keystroke), dan **`cc-plugin`** (satu plugin Claude Code tipis berisi proxy tool + hook + satu skill). Prinsip induknya: **apa pun yang bisa dijamin mesin, dijamin mesin** — kewajiban perilaku yang selama ini hanya diminta lewat teks skill naik jadi penegakan lewat hook dan validasi tool. Konstrain mutlak yang tidak berubah: **tanpa Claude Agent SDK / `claude -p`**; seluruh pemakaian lewat TUI interaktif (alasan billing).

## 1b. Lingkup & hubungan dengan yang lama (K-17)

### Nama

| Hal | Nama | Catatan |
|---|---|---|
| Repo / marketplace baru | **`mirza-bots`** | **Sementara** (user 2026-07-27) — bisa berubah |
| Program latar belakang | `fleetd` | |
| Program pemegang PTY | `mirza-cc` | Nama yang sudah dikenal user, dipertahankan |
| Plugin Claude Code | `cc-plugin` (nama kerja) | |
| Folder state | `~/.claude/fleet/` | **Sengaja TIDAK mengikuti nama repo.** Nama repo masih sementara; mengikatkan path penyimpanan padanya berarti data harus dipindah bila namanya berubah |

⚠️ Kalau nama folder state ingin disamakan dengan nama repo, putuskan **sebelum** ada data di dalamnya.

### Hubungan dengan sistem lama

**Ini marketplace BARU. `mirza-marketplace` yang lama TIDAK disentuh** — tidak diubah, tidak dihapus, tidak dimigrasi. Ke-11 plugin lamanya tetap berjalan apa adanya selama sistem baru dibangun.

**"DROP" di seluruh dokumen audit berarti "tidak diikutsertakan di sistem baru"**, bukan dihapus dari yang lama.

Konsekuensi yang harus dijaga:

| Hal | Konsekuensi |
|---|---|
| **Token Telegram tidak boleh bentrok** | Telegram hanya izinkan satu penanya per token. Bot uji sistem baru **wajib memakai token sendiri**; bot lama tetap memegang tokennya. Tanpa ini, dua sistem berebut dan dua-duanya kena 409 |
| **Migrasi per-bot, bukan per-fleet** | Saat sebuah bot benar-benar pindah, instance lamanya dimatikan lalu tokennya dipindah ke config baru. K-12 ("tanpa shim, ganti serentak") berlaku **per bot**, bukan sekaligus enam |
| **Tidak ada interoperabilitas antar sistem** | Bot lama dan bot baru **tidak** saling mengirim handoff atau agent-bus. Keduanya hidup terpisah sampai migrasi selesai. Ini yang membuat K-12 (tanpa shim) bisa berlaku tanpa risiko |
| **State terpisah** | Sistem baru memakai `~/.claude/fleet/`; sistem lama tetap memakai `.claude/channels/` per-project dan `~/.claude/agent-registry.json`. Tidak ada yang dibaca silang |
| **Dokumen audit tinggal di repo lama** | `docs/2026-07-26-rebuild-audit/` dan spec ini lahir di `mirza-marketplace`. Repo baru merujuknya; jangan disalin (dua salinan = dua yang bisa menyimpang, K-15) |

## 2. Prinsip desain

1. **Mesin dulu, teks belakangan.** Aturan yang bisa dijamin mesin **dijamin mesin**, dan teks yang memohon AI mengingatnya **dihapus** — bukan disimpan sebagai cadangan. Dua sumber aturan = sumber selisih. (K-5)
2. **AI mengisi ISI, mesin menjaga URUTAN.** Handoff, penamaan sesi, tombol: AI mengarang kontennya; mesin menjamin strukturnya.
3. **PTY untuk input, hook untuk output.** Kebenaran tentang sesi dilaporkan Claude Code lewat hook, tidak di-scrape dari filesystem privatnya. Keystroke hanya untuk slash lifecycle. (K-10)
4. **Neighbor autonomy.** Antar-bot hanya prompt (dimediasi AI penerima); tak ada kontrol mekanis lintas bot. Setiap kanal baru wajib lewat uji prinsip ini.
5. **Satu implementasi per konsep.** Kontrak yang dipakai lebih dari satu komponen hanya boleh punya satu salinan. (K-15)
6. **Setiap kegagalan harus terlihat** — dan *terlihat* berarti **sampai ke user di Telegram**, bukan tercatat di log yang tak pernah dibaca. User AFK.
7. **Daftar putih, bukan daftar hitam.** Gagal ke arah aman. Setiap penolakan wajib mengajari alternatif yang benar supaya AI bisa memperbaiki diri. (K-11)

## 3. Arsitektur

```
    ┌──────────────── latar belakang, satu per mesin ────────────────┐
    │  fleetd                                                        │
    │  ├── N poller Telegram (satu per token, dari config)           │
    │  ├── penyimpanan: fleet.db + conversations.db                  │
    │  ├── antrean + gerbang injeksi (satu per bot)                  │
    │  ├── state machine handoff + alarm batas waktu                 │
    │  ├── doctor → alarm ke Telegram                                │
    │  └── unix socket: ~/.claude/fleet/fleetd.sock                  │
    └────────▲──────────────────────────────▲────────────────────────┘
             │ hook melapor (pendek)        │ tool + injeksi (panjang)
   ┌─────────┴───────────────┐   ┌──────────┴──────────────────┐
   │ cc-plugin (dalam CC)    │   │ mirza-cc (DI TERMINAL USER) │
   │ • MCP: proxy tool       │   │ • spawn claude di node-pty  │
   │ • 6 hook               │   │ • pipe keyboard user ⇄ TUI  │
   │ • 1 skill (auto-load)   │   │ • terima perintah injeksi   │
   └─────────────────────────┘   └─────────────────────────────┘
```

### 3.1 Koreksi penting atas design doc 2026-07-03

Design doc lama menggambarkan daemon yang **men-spawn dan me-restart** pemegang PTY dengan backoff eksponensial. **Itu tidak bisa bekerja:** user menjalankan `mirza-cc` di terminalnya dan mengetik langsung ke TUI. Kalau daemon latar belakang yang men-spawn `claude`, tidak ada terminal untuk menampilkannya.

Pembagiannya terbalik: **pemegang PTY adalah program yang user jalankan**, dan ia menyambung ke `fleetd` — bukan dilahirkan olehnya. Ini menghapus seluruh mesin supervisi + backoff + eskalasi SIGTERM→SIGKILL dari desain lama.

`mirza-cc` **menyalakan `fleetd` bila belum berjalan** (dikonfirmasi user 2026-07-27) → tidak ada komponen yang harus diingat user, dan "siapa mengawasi pengawas" terjawab: bot pertama yang dibuka. Kalau `fleetd` mati di tengah jalan, `mirza-cc` berikutnya menyalakannya lagi.

### 3.2 Kenapa seluruh logika di `fleetd`

- **State handoff hidup di tempat yang tidak bisa lupa.** Kalau ia di plugin, ia lenyap saat compaction — dan handoff dipicu justru saat context hampir penuh, yaitu kondisi paling rawan compaction.
- **Antrean injeksi harus tunggal per bot.** Kalau ia lahir ulang tiap sesi, kelas bug keystroke-tertelan kembali.
- **`/reload-plugins` memutus semua koneksi MCP** (SCAR-042). Makin sedikit yang hidup di plugin, makin sedikit yang rusak saat reload. Poller token tidak terpengaruh sama sekali.
- **Satu tempat untuk diuji.** Logika yang sama sekarang tersebar di 3 plugin dengan salinan yang sudah terbukti menyimpang.

### 3.3 Platform

**Fokus macOS.** Windows tetap tujuan jangka panjang tapi tidak diimplementasikan sekarang.

**Aturan pelaksanaan:** kode yang menyentuh proses/file/PTY dipisah di balik satu lapisan tipis supaya Windows bisa ditambahkan tanpa membongkar. **JANGAN** menyebar cabang `if (windows)` untuk jalur yang tidak bisa diuji siapa pun sekarang.

**Daftar scar tissue Windows yang wajib dipasang + diuji saat platform itu disasar** (jangan dianggap hilang): ConPTY head-drop + chunking code-point-safe (SCAR-019, 020) · spawn lewat `cmd.exe` (SCAR-025) · retry `renameSync` EPERM/EBUSY untuk antivirus (SCAR-022) · `chmod` no-op → strategi ACL (SCAR-024) · CRLF/BOM (SCAR-026) · `fs.watch` tak andal (SCAR-021) · `ppid` tidak berubah saat reparenting (SCAR-063).

## 4. Komponen

### 4.1 `fleetd`

**Isi:** N poller Telegram (satu per token dari config) · dua database · antrean + gerbang injeksi per bot · state machine handoff · doctor + alarm · unix socket.

**Ketahanan polling yang WAJIB ikut** (semuanya lahir dari kegagalan nyata):
- **SEMUA** error di-retry dengan backoff `min(1000×attempt, 15000)`; attempt di-reset saat sukses. Sejarahnya: dulu hanya 409 yang di-retry → satu `ETIMEDOUT` membuat bot **tuli permanen** (SCAR-015)
- **`bot.catch` wajib** — default grammy: throw di handler = `bot.stop()` + rethrow → polling mati permanen (SCAR-061)
- `unhandledRejection`/`uncaughtException` dicatat, proses tetap melayani (TG-157)

**Yang HILANG secara struktural** karena poller keluar dari sesi CC (K-14): `bot.pid` + takeover SIGTERM · aturan "hapus pid hanya bila milik sendiri" · orphan watchdog 5 detik · force-exit 2 detik · risiko PID-reuse · retry 409 dengan batas 8 percobaan.

⚠️ **Risiko yang diterima:** kalau `fleetd` mati, **semua** bot bisu sekaligus. Alarm doctor karenanya tidak boleh bergantung pada `fleetd` yang sama untuk menyampaikannya — lihat §7.

### 4.2 `mirza-cc`

**Hanya PTY.** Spawn `claude` di node-pty lewat shell (login shell interaktif di Unix — `claude` adalah shim npm; melewati shell → `ENOENT`, SCAR-025) · pipe stdin/stdout/resize dua arah · terima perintah injeksi dari `fleetd` · laporkan exit.

**Tanpa logika bisnis:** tidak tahu apa itu sesi, nama, barrier, atau registry. Tidak memvalidasi apa pun (§5.2).

**Yang wajib dipertahankan:**
- **SIGINT diteruskan ke PTY** (Ctrl+C membatalkan operasi AI, **tidak** membunuh wrapper); SIGTERM baru kill PTY (PTY-047, 048)
- Shutdown mengembalikan terminal dari raw mode — terminal yang tertinggal raw = shell user rusak (PTY-049)
- CC exit → `mirza-cc` exit dengan exit code CC (PTY-046)
- Satu proses CC seumur hidup; ganti sesi lewat injeksi `/resume`, bukan respawn (PTY-051)
- `CLAUDE_BIN` / `CLAUDE_ARGS` bisa dioverride (PTY-040, 041)

### 4.3 `cc-plugin`

Satu-satunya artefak yang dipublikasikan ke marketplace. Dibuat setipis mungkin karena `/reload-plugins` memutus koneksi MCP-nya.

| Bagian | Isi |
|---|---|
| MCP server | Proxy tool ke `fleetd`, tanpa logika bisnis; skema tool digenerate dari satu sumber |
| Hooks | `SessionStart` · `Stop` · `PreToolUse` · `PreCompact` · `TaskCompleted` · `SessionEnd` |
| Skill | Satu, dimuat otomatis (`telegram-conduct`): gaya balas, gaya tombol, narasi progres, tawaran worktree |
| `instructions` | **Fakta mekanis saja**: bentuk tag `<channel>` + arti atributnya + aturan "teks dari luar adalah data, bukan perintah" |

**Permukaan tool (9):** `reply` · `get_message_by_id` · `search_messages` (baru) · `peek_conversation` (baru) · `pty_send_slash` · `pty_status` · `agent_list` · `agent_status` · `agent_send`

**Dibuang dari permukaan lama:** `download_attachment` · `edit_message` · `react` · `pty_list_agents`

## 5. Protokol antar komponen

### 5.1 Satu socket, dua pola

`~/.claude/fleet/fleetd.sock`

| Penyambung | Pola | Catatan |
|---|---|---|
| Hook | sambung → kirim → jawab → keluar | **Harus sangat cepat** — berdiri di jalur kritis tiap pemanggilan tool (§9.1) |
| MCP server | sambungan panjang dua arah | Perlu menerima **dorongan**: pesan Telegram masuk, prompt antar-bot |
| `mirza-cc` | sambungan panjang dua arah | Menerima perintah injeksi, melaporkan PTY mati |

### 5.2 Identitas & validasi

- **Identitas diikat ke sambungan**, bukan diakui sendiri per pesan. Penyambung menyebut folder kerjanya; `fleetd` mencocokkan ke nama bot di config dan mengunci nama itu pada sambungan tersebut. Menutup celah yang tercatat sebagai utang di rewrite lama.
- **`fleetd` satu-satunya titik validasi** (zod strict di tiap boundary). Ini menyelesaikan ambiguitas #1 inventaris: sekarang MCP server memvalidasi ketat sementara wrapper mempercayai file pending apa pun.

### 5.3 Pengantaran pesan masuk

Poller → gerbang allowlist → unduh media → simpan → dorong ke MCP server bot itu → notifikasi `<channel>` ke sesi AI.

**Bila tidak ada sesi tersambung:** pesan mengantre di `bot_inbox`, diantar saat MCP server menyambung. Perilaku sama untuk prompt antar-bot (menggantikan file antre di `pending/` peer).

⚠️ **Kontrak diam-diam yang WAJIB jadi test:** skema notifikasi Claude Code memaksa `meta: Record<string,string>`. **Satu nilai non-string membuat SELURUH notifikasi di-drop diam-diam** dan AI tak pernah tahu ada pesan (SCAR-056). Semua nilai multi (album) wajib diserialisasi manual.

### 5.4 Daur hidup injeksi — dua tingkat

```
antre → tertulis (keystroke dikirim) → selesai (dikonfirmasi peristiwa)
```

| Perintah | Sinyal "selesai" | Kepastian |
|---|---|---|
| `/clear` | `SessionStart` `source: "clear"` | ✅ terdokumentasi |
| `/resume <id>` | `SessionStart` `source: "resume"` | ✅ terdokumentasi |
| `/compact` | `PostCompact` | ✅ terdokumentasi |
| `/rename <nama>` | **⚠️ BELUM PASTI** — lihat V-2 | ⚠️ |
| Command plugin | **Tidak ada sinyal** — dianggap selesai setelah tenggat, dicatat apa adanya | ✅ |

Yang tak pernah mencapai "selesai" dalam batas waktunya jadi **insiden yang terlihat**. Menjawab SCAR-071: `{queued:true}` berarti *accepted*, **bukan** *done*.

### 5.5 Gerbang injeksi

Antrean FIFO tunggal per bot, satu penguras. Jendela tunda **monotonik** (`holdFor` hanya memperpanjang). Kegagalan satu item tidak menghentikan antrean.

**Barrier `/clear` jadi peristiwa, bukan polling:** menunggu `SessionStart` `source: "clear"`, bukan menunggu file `.jsonl` muncul. Batas waktu 10 menit **turun pangkat** dari mekanisme jadi **alarm** — kalau menyala, itu tanda ada yang salah.

⚠️ **Konstanta pacing WAJIB dikalibrasi ulang, tidak boleh diasumsikan portabel:** `SUBMIT_DELAY_MS`=250 (autocomplete picker menelan `\r`) · `MIN_INJECTION_GAP_MS`=1500 (BUG #3: payload saling menyisipkan keystroke) · `POST_INJECTION_DELAY_MS`=1000 · `CLEAR_SETTLE_MS`=1500 · `QUEUE_POLL_MS`=200.

⚠️ **Enter TUI = `\r`**, bukan `\n` (SCAR-029).

⚠️ **Atomisitas batch:** jaminannya sekarang bergantung pada single-thread Node. Bila ada consumer konkuren, jaminan itu **wajib diturunkan ulang secara eksplisit** (ambiguitas #1 inventaris), bukan diwarisi diam-diam.

## 6. Penyimpanan

```
~/.claude/fleet/
  config.json          ← DIEDIT MANUSIA: allowlist + daftar bot
  fleet.db             ← state operasional (kecil, boleh dibuang & dibangun ulang)
  conversations.db     ← percakapan + rujukan media (besar, tak tergantikan)
  inbox/<bot>/         ← media terunduh
  logs/                ← log fleetd, rotasi berbasis ukuran
```

**Dua database, bukan satu:** kalau state operasional korup, ia dihapus dan sistem menyala bersih — tanpa mengancam riwayat percakapan yang tak bisa dipulihkan. Dua sifat data yang sangat berbeda tidak sekapal.

**`config.json` terpisah dari database** supaya bisa diedit dengan editor teks (K-1); database tidak pernah disentuh tangan.

### 6.1 `config.json`

```json
{
  "allowFrom": ["<telegram-user-id>"],
  "bots": {
    "bot-01": { "home": "/Users/mirza/Workspace/bot-01", "token": "..." },
    "riset":  { "home": "/Users/mirza/Workspace/eksperimen-x", "token": "..." }
  }
}
```

Nama bot **eksplisit**, lepas dari basename folder — memperbaiki tabrakan nama yang dulu hanya di-WARNING lalu ditimpa (SCAR-069). Menambah bot = menambah satu blok.

**Token pindah keluar dari repo kerja** → seluruh kelas risiko "token ter-commit" hilang; guard `.gitignore` otomatis tidak diperlukan lagi.

### 6.2 Tabel `fleet.db`

| Tabel | Isi | Menggantikan |
|---|---|---|
| `sessions` | id sesi CC, bot, nama, **status kerja**, mulai/berakhir, `source`, jumlah giliran, token terpakai, tersembunyi | `wrapper.state.json` + 2 mirror legacy + `session-names.json` + `archived-sessions.json` + konvensi nama `idle`/`task-*`/`done-*` |
| `handoffs` | dari, ke, slug, path file, status, batas waktu, mode, pasangan | Ingatan AI + cron yang dipasang AI |
| `injections` | tiap perintah: antre → tertulis → selesai, percobaan | `pending/*.json` + fire-and-forget |
| `bot_inbox` | prompt antar-bot & pesan yang menunggu sesi tersambung | File antre di `pending/` peer |
| `incidents` | apa yang rusak, kapan, sudah diberitahukan | Tidak ada — inilah doctor |

### 6.3 Tabel `conversations.db`

`messages(id, ts, bot, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)` + indeks + **FTS5**.

**Kolom `bot` + FTS5** adalah prasyarat B-1 (`peek_conversation`) dan pencarian riwayat. Menambahkan indeks belakangan berarti mengindeks ulang seluruh riwayat — makanya sejak awal.

**Retensi:** percakapan **tidak pernah dihapus** (K-8); `VACUUM` manual + ukuran dilaporkan doctor. **`inbox/`**: file lebih tua dari N hari dihapus **kecuali** masih dirujuk baris pesan; baris pesannya tetap ada.

**Mulai bersih** — riwayat 6 bot lama tidak diimpor. Konsekuensi jujur: `peek_conversation` dan pencarian **kosong di awal**, baru berguna setelah beberapa minggu.

⚠️ **Utang tercatat:** backup belum dijawab. Wajib diselesaikan sebelum fleet benar-benar bergantung pada penyimpanan terpusat.

## 7. Penegakan mekanis (inti perubahan)

Diagnosis dari audit: **yang dimekanisasi berhasil, yang tetap jadi teks tidak.** Dua penegak mekanis lama tak pernah dikeluhkan user; tiga lapis yang hanya *meminta* semuanya dikeluhkan.

| Kewajiban | Penegak | Catatan |
|---|---|---|
| Ack sebelum tool pertama | `PreToolUse` deny + reason | Menghapus "pre-flight 4 pertanyaan" dari skill — mesin tahu jawabannya |
| Jawaban final lewat `reply` | `Stop` block/`additionalContext` | **Fix FUNC-3**: blokir bila tak ada reply **setelah tool non-reply TERAKHIR** — ack tak lagi dihitung sebagai jawaban. **Fix flag sticky**: lacak posisi terakhir, bukan flag sesi |
| Pertanyaan wajib berbutton | `fleetd` menolak `reply` | Deteksi konservatif: periksa **kalimat terakhir**; penolakan kedua untuk teks sama diloloskan + dicatat. **Tanpa parameter opt-out** |
| Tombol "Jelaskan manual" | `fleetd` menambahkannya | Batas 8 baris harus memperhitungkan baris tambahan server |
| Nama sesi selalu ada | `SessionStart` → `sessionTitle` (**⚠️ lihat V-1**); mid-sesi lewat `/rename` | Mesin meminta nama ke AI, menerapkannya, memberi tahu user |
| Urutan & batas waktu handoff | Tabel `handoffs` + timer `fleetd` | §8 |
| Commit membawa nama bot | `PreToolUse` matcher `Bash` **+ shell lain** | **Fix FUNC-4/5** (PowerShell lolos) + 4 kelas bypass yang ditemukan reviewer |
| Designation selamat dari compaction | `PreCompact` | Tulis state sebelum compaction; boleh blokir bila gagal |

**Yang DIHAPUS:** hook pengingat per-turn `UserPromptSubmit` (~150 token/turn yang terbukti tidak bekerja) · seluruh teks skill yang memohon AI mengingat aturan yang kini dijamin mesin.

**Empat skill melebur jadi satu** (`telegram-conduct`), **dimuat otomatis, tidak perlu dipanggil** — masalah "lupa memanggil skill" hilang karena tak ada lagi yang harus dipanggil.

## 8. Handoff — contoh penerapan "AI mengisi isi, mesin menjaga urutan"

### 8.0 Syarat kesiapan penerima (aturan user, 2026-07-27)

Menggantikan seluruh konvensi nama sesi (`idle` / `task-*` / `done-*`). **Dua syarat, keduanya wajib:**

| Syarat | Nilai |
|---|---|
| Context terpakai | **< 100.000 token** — mutlak, tidak ikut ukuran window, **disetel di config** |
| Tidak sedang bekerja | tidak ada giliran berjalan (fakta dari hook, bukan tebakan dari nama) |

Ambangnya sebenarnya tidak berubah dari aturan lama — 10% dari window 1M **adalah** 100k. Yang berubah: dinyatakan dalam token (jujur) alih-alih persen (menyesatkan), dan lepas dari nama sesi.

Syarat kedua **wajib ada** karena ia menutup lubang yang ditinggalkan nama `idle`: bot yang baru 20k tapi sedang mengerjakan permintaan user tidak boleh menerima estafet — ia akan menelantarkan pekerjaannya.

**Diperiksa dua kali:** pengirim **menyaring** lewat `agent_status` sebelum menulis file (hemat pekerjaan); penerima **memutuskan** (mengikat — kondisi bisa berubah di antaranya, dan neighbor autonomy mensyaratkan penerima selalu boleh menolak).

⚠️ **Jangan tertukar dengan ambang pengirim** (§11 nomor 2, masih terbuka): itu menjawab *"apakah saya sudah terlalu penuh untuk melanjutkan?"* dan berbasis **sisa** token. Yang ini menjawab *"apakah saya cukup kosong untuk menerima?"* dan berbasis **terpakai**.

**Bila tidak ada bot yang memenuhi syarat:** laporkan kondisi tiap peer secara konkret lalu tawarkan `[Tulis file saja] [Pilih paksa salah satu] [Batal]`. User tetap boleh **sengaja** memilih bot yang tidak siap (SKILL-013) — saat itu pesan handoff membawa penanda "pilihan sadar user" supaya penjaga penerima tidak menolaknya.

| # | Siapa | Melakukan |
|---|---|---|
| 1 | AI pengirim | Menulis file handoff (isi = pekerjaan AI) |
| 2 | AI pengirim | Memanggil tool "mulai handoff": target + slug + path file |
| 3 | `fleetd` | Tulis baris `status=terkirim`, pasang batas waktu, antar prompt ke penerima sebagai notifikasi bermetadata terstruktur |
| 4 | AI pengirim | Lapor ke user "terkirim, menunggu ACK" — lalu **selesai, tidak menyimpan apa pun** |
| 5 | AI penerima | Membaca, memeriksa syarat §8.0, memanggil tool ACK dengan hasil **OK** atau **NOT-OK + alasan** |
| 6 | `fleetd` | Matikan batas waktu. **OK** → beri tahu user, antre `/clear` ke pengirim. **NOT-OK** → kembalikan ke user beserta alasan + pilihan bot lain |
| 7 | Pengirim | (jalur OK) Sesi bersih, status idle |

**Tiga kegagalan lama yang tertutup:** compaction selama masa tunggu (state bukan di context) · ACK datang setelah pengirim ter-reset (baris data tetap utuh) · cron yang harus diingat untuk dibatalkan (batas waktu = kolom, diawasi mesin).

**Menjawab pertanyaan terbuka user** (`docs/notes/02-handoff.md`: "bot-01 atau bot-02 yang menghapus session?"): **tidak keduanya** — `fleetd` yang melakukannya, dipicu ACK. Tidak melanggar neighbor autonomy, dan aman secara alami karena `/clear` baru diproses CC setelah turn berjalan selesai.

**Laporan pasca-ACK ditulis mesin**, bukan AI — meminta AI melapor lalu langsung membersihkannya menciptakan lomba waktu baru.

**Timeout tanpa ACK:** `fleetd` mengirim `[Kirim ulang] [Pilih bot lain] [Batal]` dan **tidak** me-reset pengirim (SKILL-026 jadi mustahil dilanggar).

## 9. Risiko yang diterima sadar

| # | Risiko | Mitigasi |
|---|---|---|
| 1 | **Biaya spawn hook per pemanggilan tool.** Penegakan ack memakai `PreToolUse` bermatcher luas; Bun ~30–50 ms per spawn | Hook sangat tipis (satu roundtrip socket, tanpa baca file/transkrip); matcher dipersempit agar tool `reply` tidak memicu. `async: true` **tidak bisa dipakai** — hook async tak bisa deny. **WAJIB diukur di uji live** |
| 2 | **`fleetd` mati → semua bot bisu sekaligus** | Alarm doctor tidak boleh bergantung pada `fleetd` yang sama; `mirza-cc` menyalakan ulang |
| 3 | **Hook `SessionStart` salah pasang → deteksi sesi mati TOTAL** (polling lama selalu bekerja) | Batas waktu fallback yang **berbunyi sebagai alarm**, bukan diam |
| 4 | **`/version` dibuang** padahal pernah menyelamatkan user dari cache plugin versi lama | Versi komponen berjalan dilaporkan `doctor` dan/atau satu baris di `/context` |
| 5 | **Deteksi "pertanyaan" bisa salah tangkap** teks panjang berisi pertanyaan retoris | Periksa kalimat terakhir saja; penolakan kedua diloloskan + dicatat |
| 6 | **Migrasi serentak, tanpa fleet campuran** (K-12) | Realistis: 6 bot di satu mesin. Tak ada shim yang harus dipelihara |
| 7 | **Backup belum dijawab** | Utang eksplisit, harus selesai sebelum fleet bergantung penuh |
| 8 | **Sesi yang berisi kredensial tak bisa dimusnahkan dari Telegram** (tak ada perintah hapus) | Manual dari terminal |

## 10. Tahapan

Tiap tahap punya **satu** kriteria selesai yang bisa dibuktikan dan menghasilkan sesuatu yang bisa dipakai.

| Tahap | Isi | Selesai bila |
|---|---|---|
| **1. Fondasi** | `fleetd` kosong + dua database + `config.json` + socket + `doctor` | `fleetd` menyala, `doctor` menjawab, satu bot terdaftar dari config |
| **2. Jalur pesan** | Poller + gerbang allowlist + media + penyimpanan + MCP proxy `reply` | **Satu bot uji di macOS** berbalas pesan: teks, foto, album, tombol |
| **3. Penegakan** | `PreToolUse` (ack) + `Stop` (jawaban final) + tombol wajib + tombol manual otomatis | Bot **tidak bisa** meninggalkan user tanpa jawaban dan **tidak bisa** bertanya tanpa tombol — dibuktikan dengan **mencoba melanggarnya** |
| **4. Sesi** | **Verifikasi V-1 & V-2 lebih dulu (§11b)**, lalu `mirza-cc` + antrean injeksi + `SessionStart` + `/new` `/rename` `/switch` + `/context` | Ganti sesi dari Telegram jalan tanpa polling file; nama sesi benar (cara mencapainya bergantung hasil V-1) |
| **5. Antar-bot** | `agent_list` `agent_status` `agent_send` + handoff dijaga mesin | Handoff dua bot tuntas: file, ACK, laporan, reset — tanpa AI mengingat apa pun |
| **6. Sisanya** | `peek_conversation`, pencarian, penyembunyian sesi remeh, penamaan otomatis, partial handoff | Per fitur |

Tahap 2–3 sudah membuat sistemnya berguna: bot yang bisa diajak bicara dan tidak bisa mengabaikan user. Tahap 4 baru menyentuh PTY — bagian paling rawan — saat fondasinya sudah terbukti.

**Tiap tahap wajib punya uji live**, bukan hanya unit test. Pelajaran mahal dari rewrite lama: 457 unit test hijau tapi `answerCallbackQuery` tak ter-port → spinner Telegram berputar selamanya.

**Rencana implementasi ditulis PER TAHAP, bukan sekaligus.** Spec ini adalah arsitekturnya; tiap tahap mendapat rencana rincinya sendiri saat akan dikerjakan — supaya rencana tahap belakangan bisa memanfaatkan apa yang dipelajari dari tahap sebelumnya (terutama hasil V-1/V-2 dan pengukuran biaya hook).

## 11. Angka yang belum ditetapkan

Semuanya jadi **konfigurasi**, bukan konstanta.

| # | Angka | Konteks |
|---|---|---|
| 1 | Ambang token "sesi remeh" | Mulai dengan 2 kriteria pasti (giliran < 3 **dan** tak pernah dinamai) |
| 2 | Ambang **sisa token** pemicu tawaran handoff (**PENGIRIM**) | Dasar berubah dari persen ke sisa token; 35% untuk 1M kemungkinan terlalu konservatif. **Bukan** angka 100k di §8.0 — itu ambang penerima |
| 3 | N giliran sebelum mesin menamai sesi | Kandidat: setelah topik jelas (~3 giliran), bukan berbasis waktu |
| 4 | N hari retensi `inbox/` | |
| 5 | Batas waktu tiap kelas injeksi | **Jangan seragam**: `/clear` (barrier, boleh 120 s) vs `/rename` (keystroke, cepat) |

## 11b. Asumsi yang WAJIB diverifikasi sebelum dibangun

Dua hal di spec ini bersandar pada kemampuan Claude Code yang **belum saya buktikan langsung** — hanya dibaca dari dokumentasi atau disimpulkan. Kalau ternyata salah, bagian yang bergantung padanya harus dirancang ulang. Verifikasi ini **langkah pertama tahap 4**, bukan sesudahnya.

### V-1 — Apakah `sessionTitle` sama dengan nama sesi yang dipakai `/rename`?

**Klaim di spec:** hook `SessionStart` bisa menyetel nama sesi lewat nilai balik `sessionTitle`, sehingga rantai rapuh pasca-`/clear` (`/rename` + pacing + penundaan notifikasi, SCAR-081) bisa dihapus.

**Yang belum dipastikan:** apakah "session title" yang diset hook itu **objek yang sama** dengan nama yang diubah `/rename` dan yang tampil di picker `/switch`. Dokumentasi menyebut `session_title` sebagai input `SessionStart` dan `sessionTitle` sebagai output, tapi tidak menyatakan hubungannya dengan `/rename`.

**Bila ternyata BEDA:** penamaan pasca-`/clear` kembali memakai injeksi `/rename`, dan seluruh pacing + kerapuhan urutan SCAR-081 **wajib dipertahankan**. Dampak: §7 baris "Nama sesi selalu ada" dan §5.4 berubah; tahap 4 jadi lebih berat.

**Cara memverifikasi:** pasang hook `SessionStart` yang menyetel `sessionTitle`, lalu periksa apakah nama itu muncul di tempat yang sama dengan hasil `/rename` (daftar sesi Claude Code / `~/.claude/projects`).

### V-2 — Apa sinyal bahwa `/rename` yang disuntik benar-benar mendarat?

**Masalahnya:** tidak ada hook untuk perubahan nama sesi, dan snapshot statusLine (satu-satunya sumber data sesi yang kaya) **tidak terdokumentasi memuat nama/judul sesi** — ia memuat `session_id`, model, biaya, context, rate limit.

**Akibatnya:** `/rename` mungkin masuk kategori "tidak ada sinyal", sama seperti command plugin — mesin tahu nama yang **diminta**, tapi tidak bisa memastikan TUI menerimanya.

**Bila memang tak ada sinyal:** itu **dapat diterima**, tapi harus disebut jujur — `sessions.name` menjadi *"nama yang kami minta"*, bukan *"nama yang terpasang"*, dan `doctor` tidak bisa mendeteksi rename yang tertelan. Jangan menyembunyikan ini di balik status "selesai" yang tidak diverifikasi.

**Cara memverifikasi:** cek apakah payload statusLine memuat judul/nama sesi di versi Claude Code yang dipakai.

## 12. Kebijakan bahasa

| Yang mana | Bahasa |
|---|---|
| Source code, komentar, README, error teknis | **Inggris** |
| Pesan AI ke user | **Mengikuti bahasa user** |
| Pesan mesin ke user (validasi, alarm, banner) | **Indonesia** |

## 13. Di luar lingkup v1

`goal` · `teach-me` · `daily-report` · `knowledge-vault` · playbook · dukungan group Telegram (B-3) · bot membaca transkrip sesi lama (B-2) · kunjungan sementara ke sesi lama (B-7).

Semuanya **ditunda dengan alasan tercatat**, bukan dibatalkan. B-2 dan `knowledge-vault` sebaiknya didesain **bersama** — keduanya menjawab masalah yang sama (bagaimana bot mengingat lintas sesi), dan membangunnya terpisah berisiko menghasilkan dua sistem memori yang tidak saling bicara.
