# Komparasi Fitur — `mirza-marketplace` (LAMA) vs `mirza-bots` (BARU)

Tanggal: 2026-08-08
Metode: dua subagent independen menginventarisir masing-masing repo tanpa melihat repo sebelah, lalu hasilnya di-diff.
Basis: `mirza-marketplace` @ `db5bda8` (11 plugin) · `mirza-bots` @ `9206831` (cc-plugin 0.33.0 + cc-wrapper 0.0.1).

**Fitur yang sama di kedua repo sengaja tidak ditulis.** Yang setara-tapi-beda-implementasi dicatat singkat di bagian akhir.

---

## Ringkasan angka

| | LAMA | BARU |
|---|---|---|
| Plugin | 11 | 1 (`cc-plugin`) + 1 wrapper |
| MCP tool | 5 (telegram) + 4 (pty-controller) + 3 (agent-bus) = **12** | **7** |
| Slash command Telegram | **11** | **3** |
| Hook | 3 (telegram) + 1 (bot-conduct) = **4** | **2** |
| Skill / behavioral plugin | **10** | **0** |
| Repo mendukung permission prompt | ya | tidak (`--dangerously-skip-permissions`) |

---

# BAGIAN 1 — Ada di LAMA, belum ada di BARU

Ini daftar inventaris yang kamu minta: kandidat "belum diadopsi".

## 1.1 Seluruh lapisan behavioral (10 skill) — nol di repo baru

Repo baru **tidak punya satu pun** skill, slash-command Claude Code, agent, atau subagent. Yang hilang:

| Plugin lama | Isi | Status di baru |
|---|---|---|
| `immediate-reply` | pre-flight 4 pertanyaan mekanis → ack <1 detik sebelum tool call pertama; narasi progres per stage transition; katalog frasa ack | ❌ tidak ada |
| `inline-buttons` | self-audit sebelum tiap balasan; layout numbered-narration; wajib `✏️ Explain manually` | ⚠️ **sebagian ditegakkan mesin** (lihat 2.6) tapi aturan kapan-pakai-tombol hilang |
| `teach-me` | 10 elemen gaya mengajar, 6 anti-pattern bernama, walkthrough 5-ronde | ❌ tidak ada |
| `bot-conduct` | checklist per momen lifecycle (STARTING/DURING/BEFORE-idle), doktrin worktree, trailer `Agent:`, guard three-copy, push-before-idle | ❌ tidak ada |
| `handoff` | estafet bot-ke-bot (detail di 1.2) | ❌ tidak ada |
| `goal` | interview → kondisi ≤240 char → gate konfirmasi wajib → inject `/goal` CC | ❌ tidak ada |
| `daily-report` | `/daily-report`, seleksi commit 3-tier, template terkunci, anti-fabrikasi, boss-readable strip | ❌ tidak ada |
| `knowledge-vault` | pointer ke vault Obsidian, 6 tipe note atomik, pipeline capture→distillation | ❌ tidak ada |
| `agent-bus` skill `using-agent-bus` | neighbor autonomy, anti-bounce, aturan wipe-state wajib konfirmasi ulang | ❌ tool-nya ada, **skill-nya tidak** |
| `telegram` skills `access` / `configure` / `name-session` | manajemen akses, setup token, penawaran nama sesi | ❌ tidak ada (`name-session` diganti reminder mesin, lihat 2.5) |

**Catatan penting:** `bot-conduct` juga membawa satu hook mekanis — `commit-trailer-guard` (PreToolUse/Bash) yang men-DENY `git commit` tanpa trailer `Agent: <bot>`. Itu satu-satunya enforcement git di sistem lama, dan tidak ada penggantinya di baru.

## 1.2 Handoff — mekanismenya hilang, pengingatnya tetap ada

Ini asimetri paling menonjol. Repo baru **mengingatkan AI untuk menawarkan handoff** saat context terpakai >400k token (`src/engine/reminders.ts`), tapi **tidak punya mekanisme handoff sama sekali**.

Yang hilang dari plugin `handoff` lama:
- 4 mode via inline buttons: `🚀 Now` / `⏭️ After this task` / `🏓 Ping pong` / `📄 File only`
- designation one-shot (After this task) dan designation menular via header `**Pair:** bot-A ⇄ bot-B` (Ping pong)
- konvensi nama sesi sebagai kontrak antar bot: `idle` → `task-<slug>` → `done-<slug>-<yyyymmddhhmm>` → `/clear` + `/rename idle`
- definisi READY (`lifecycle == "idle"`, `context_used_percent < 10` atau null)
- clarity check 3 syarat + mandat update README sebelum menulis file
- template 10-section terkunci di `.handoff/<ts>-prompt-<slug>.md`
- tiga laporan Telegram bertahap (file selesai → terkirim → ACK diterima)
- timeout ACK 10 menit via cron
- self-reset satu batch atomik `["/rename done-…", "/clear", "/rename idle"]`

Threshold context-nya juga berbeda filosofi: lama pakai **persentase** (35% untuk window 1M, 75% untuk 200k), baru pakai **angka absolut** 400k token terpakai.

## 1.3 Slash command Telegram — 11 → 3

Baru punya `/context`, `/rename`, `/new`. Yang belum diadopsi:

- **`/start`** — pairing flow, kode 6 hex, identitas bot
- **`/help`** dan **`/help <name>`** — daftar command audience-aware + detail per-command
- **`/version`** — versi semua komponen dalam satu balasan (baru: hanya dicetak launcher `.cmd` saat start)
- **`/switch`** — picker sesi terpaginasi → inject `/resume <id>` (baru: ditolak eksplisit, alasannya "belum dibawa")
- **`/delete`** — soft (arsip, jsonl utuh) / `hard` (rmSync) / `all` / `hard all`, dengan proteksi sesi aktif dan pembebasan nama
- **`/effort`** — picker 6 level dengan auto-confirm `confirmAfterMs: 500` (baru: sengaja tidak dibawa)
- **`/handoff`** dan **`/goal`** — diteruskan ke AI (butuh skill-nya, lihat 1.1/1.2)
- **Guard wrapper-liveness** — 5 meta-command cek heartbeat <30s lalu balas `⚠️ wrapper not detected`

Plus dua infrastruktur pendukungnya yang ikut hilang:
- **paginated picker generik** (6/halaman, nav Prev/Next edge-aware, pagination in-place, picker-expiry pasca-restart)
- **validasi nama sesi terpusat** (`session-name-rules.ts`: CR/LF collapse, whitespace ditolak dengan saran "pakai tanda hubung", cap 64 char) — baru punya validasi tapi lebih longgar (cap 120, hanya tolak newline)

## 1.4 Access control — dari berlapis jadi satu allowlist

| Fitur lama | Status di baru |
|---|---|
| 3 DM policy: `pairing` (kode 6 hex) / `allowlist` / `disabled` | ❌ hanya `allowFrom` |
| Rate limit pairing (expire 1 jam, max 3 pending, max 2 balasan/sender) | ❌ |
| **Dukungan group Telegram** dengan `requireMention`, `mentionPatterns` regex, allowlist anggota per-group | ❌ tidak ada sama sekali |
| Hot-reload access tiap pesan (tanpa restart) | ❌ config dibaca saat boot |
| Mode `TELEGRAM_ACCESS_MODE=static` | ❌ |
| Self-heal access korup → `.corrupt-<ts>`, lanjut default | ❌ config rusak = engine tidak start (tapi melapor jelas) |
| Skill `access` + `configure` untuk mengelola ini dari chat | ❌ |
| Token di `.env` chmod 600, state dir 0700 | ⚠️ token di `config.json` polos |

## 1.5 Permission relay — hilang total

Sistem lama merelay permission prompt Claude Code ke Telegram: `🔐 Permission: <tool>` + tombol `[See more] [✅ Allow] [❌ Deny]`, `perm:more` menampilkan input JSON, plus jalur teks `y <kode-5-huruf>` dan reaksi ✅/❌.

Repo baru menjalankan CC dengan `--dangerously-skip-permissions`, jadi fitur ini **tidak punya tempat**. Ini konsekuensi arsitektur, bukan sekadar belum sempat — tapi tetap perlu kamu catat sebagai kemampuan yang hilang.

## 1.6 MCP tool Telegram yang hilang

- **`react`** — reaksi emoji ke pesan
- **`edit_message`** — sunting pesan bot yang sudah terkirim (dipakai untuk progress interim: ack `⏳ Installing…` lalu diedit jadi hasil)
- **`download_attachment(file_id)`** — ⚠️ sebagian tergantikan: baru mengunduh dokumen otomatis ≤20MB. Tapi karena voice/video/sticker tidak ditangani sama sekali di baru, tool ini juga tidak punya pengganti untuk tipe itu.
- **`get_message_by_id`** — tergantikan `read_history` yang lebih baik (lihat 2.1)

## 1.7 Tipe media yang tidak ditangani

Lama menangani lengkap: text, photo, document, **voice, audio, video, video_note, sticker** (non-foto meta-only + `attachment_file_id` supaya AI panggil `download_attachment`).

Baru: voice, video, video_note, sticker **diabaikan diam-diam** — didokumentasikan sebagai keputusan sadar di README, dan disebut "kandidat pertama yang diperiksa saat ada keluhan".

## 1.8 Wrapper / PTY — kapabilitas yang tidak dibawa

`cc-wrapper` baru jauh lebih tipis dari `pty-controller` lama. Yang hilang:

- **`pty_status` dan `pty_list_agents` sebagai MCP tool** — baru tidak punya cara AI menanyakan keadaan wrapper
- **`wrapper.state.json`** sebagai single source of truth (`session_id`, `session_name`, `lifecycle`, `seq` monotonic)
- **Derivasi lifecycle** dari nama sesi: `idle`→idle, `task-*`→busy, `done-*`→transitioning — ini yang membuat handoff bisa tahu bot mana READY
- **Registry agent global** `~/.claude/agent-registry.json` + heartbeat 5 detik + lock O_EXCL — baru menggantinya dengan konvensi folder-tetangga (lebih sederhana, tapi mengunci semua bot ke satu folder induk)
- **InjectionGate hard barrier pasca-`/clear`** — dilepas hanya saat jsonl sesi baru terdeteksi + settle 1500ms, dengan force-release 10 menit. Baru hanya punya gap tetap 1500ms.
- **Sniffer `/rename`** pada setiap slash yang di-dispatch
- **Klaim `idle` first-run** — sesi baru meng-klaim nama `idle` supaya bot yang baru boot lahir siap di-handoff
- **Statusline self-healing revalidation** + pending-name expectation timeout 10 menit
- **Auto-resume pilih jsonl mtime tertinggi** — baru menggantinya dengan `--continue` + satu retry (lebih sederhana dan lebih tahan banting, lihat 2.9)
- **`/switch` = inject `/resume` ke PTY hidup**
- **Semantik SIGINT diteruskan ke PTY** (Ctrl+C membatalkan turn AI, bukan membunuh wrapper)
- **`npm run interactive`, `auto-clear`, capture `.ansi`/`.txt`** — tooling debug PTY
- **`agent_send` broadcast/fan-out** (target boleh array) — baru hanya satu target per panggilan

## 1.9 Pipeline pesan yang lebih kaya

- **`assertSendable` anti-exfiltrasi** — lama menolak mengirim file di dalam STATE_DIR (`.env`, `messages.db`), realpath-resolved supaya symlink tidak lolos. Baru hanya memvalidasi ukuran + path absolut → **ini gap keamanan nyata**, bukan sekadar penyederhanaan.
- **`replyToMode`** configurable (`first`/`all`/`off`)
- **`chunkMode`** configurable (`length` vs `newline`) dan `textChunkLimit`
- **`ackReaction`** configurable ke pesan masuk
- **System-outbox** — plugin sibling menaruh JSON, dikirim tanpa roundtrip AI. Baru menyelesaikan kebutuhan ini secara langsung (pengumuman lahir di engine), jadi ini setara-beda-jalan.
- **Serialisasi meta string-only** — ada di keduanya, tapi lama juga mengangkut `image_paths` newline-joined & `attachments` JSON string.

## 1.10 Infrastruktur dokumentasi & audit

Ini bukan fitur runtime, tapi ini aset yang tidak ikut pindah:

- `docs/2026-07-02-capability-inventory/` — **acceptance contract 529 item** (TG-189, PTY-114, BUS-47, SKILL-82, SCAR-97) yang digenerate dari kode
- `scar-tissue.md` — 97 workaround/magic-number/platform-quirk empiris
- `docs/2026-07-26-rebuild-audit/` — ledger 14 area dengan verdict KEEP/SIMPLIFY/MERGE/DROP, 18 keputusan K-1..K-18
- `BACKLOG.md` (~55 KB) dengan "Bagian 0 — MULAI DARI SINI"
- `docs/superpowers/specs/` (34 design doc) + `plans/` (36 plan)
- `SOP-git-multi-agent.md` — post-mortem three-copy, ~25 commit hilang 2026-06-07
- `hook-mapping.md`, `state-inventory.md` (27 artefak state)
- `2026-08-06-ukur-biaya-penyerahan.mjs` — script yang mengukur berapa token yang dihabiskan sebuah handoff

⚠️ **Sudah ada dokumen yang mirip tugas ini:** `docs/2026-08-04-daftar-fitur-sistem-baru.md` di repo lama sudah membandingkan 11 slash command lama vs 3 baru. Layak kamu baca sebagai pembanding — mungkin ada yang sudah kamu putuskan di sana dan tidak perlu diinventarisir ulang.

Juga: **K-17** di rebuild-audit menyatakan "DROP" berarti *tidak diikutsertakan di sistem baru*, bukan dihapus. Jadi sebagian item di Bagian 1 ini kemungkinan besar **sudah pernah kamu putuskan sadar untuk tidak dibawa**, bukan terlewat.

---

# BAGIAN 2 — Ada di BARU, tidak ada di LAMA

Ini yang lahir dari semangat kesederhanaan — dan beberapa di antaranya justru lebih kuat dari sistem lama.

## 2.1 Riwayat percakapan yang bisa dibaca AI

- **`read_history`** — ambil pesan di sekitar sebuah `message_id` (before 0–50, after 0–50). Lama hanya punya `get_message_by_id` (satu pesan).
- **`search_history`** — full-text search via **SQLite FTS5** dengan trigger sinkron otomatis. Lama punya SQLite tapi **tanpa FTS dan tanpa tool pencarian sama sekali**.
- `getMessagesAround()` mengembalikan `[]` untuk anchor tak dikenal — sengaja bukan "pesan terbaru", supaya AI tidak menjawab yakin tentang pesan yang tidak pernah ada.

## 2.2 Marker sumber tiga jenis

Setiap push distempel `[from: user]` / `[from: agent]` / `[from: system]`. Marker menamai **sumber**, bukan perilaku. Lama hanya punya attribution marker untuk pesan agent-bus, dan tidak punya konsep `[from: system]`.

## 2.3 Kanal pengingat mesin (`[from: system]`)

Ini betul-betul baru dan filosofinya berbeda tajam dari sistem lama:

- Pengingat **menempel pada pesan yang memang datang**, tidak pernah jadi push sendiri (push sendiri = membangunkan AI tanpa ada yang bicara)
- **Pemicunya KEADAAN, bukan peristiwa** — tidak ada flag "sudah diingatkan", begitu kondisinya tidak terpenuhi pengingatnya lenyap sendiri; giliran yang terlewat dibawa giliran berikutnya (self-healing)
- Pengingat `name-session` (menggantikan skill `name-session` lama)
- Pengingat `context-low` >400k (menggantikan trigger threshold di skill handoff)
- Gerbang kesegaran: seluruh pengingat diam kalau `status.json` milik sesi lain

Di sistem lama, ini semua adalah **teks skill** — instruksi yang bisa diabaikan AI. Di baru, ini **mesin** yang menyuntikkan diri per giliran.

## 2.4 Mode `unavailable`

Kalau engine gagal start, ketujuh MCP tool **tetap terdaftar** dan tiap panggilan menjawab alasannya (`Telegram is not available: …`). Alasannya: plugin yang menyembunyikan tool-nya saat gagal tidak bisa dibedakan dari plugin yang tidak terpasang. Lama tidak punya perilaku ini.

## 2.5 Pengumuman sesi otomatis dari engine

- **"bot hidup"** saat engine start: `🤖 <bot> hidup — lanjut di sesi \`<nama>\``
- **"nama sesi berubah"**: `✏️ Sesi sekarang: \`<nama>\`` — satu jalur untuk tiga sumber rename (bot otomatis, `/rename` user, `/new`), sehingga kewajiban AI memberi tahu user **dicabut**
- **Nama sesi dibaca dari transcript CC**, bukan dari `status.json` — karena `/rename` tidak menggambar ulang statusline. Terukur telat **59 menit** di sistem lama.

Lama punya banner `session-change` via system-outbox, tapi sumber namanya `wrapper.state.json`/registry, bukan transcript.

## 2.6 Pagar tombol bernomor ditegakkan MESIN

`findMissingButtonNarration` — `reply` **DITOLAK sebelum apa pun terkirim** kalau ada ≥2 label angka telanjang tanpa baris bernomor yang cocok di badan pesan. Label non-numerik diabaikan supaya `✏️ Explain manually` tidak pernah kena.

Di sistem lama, aturan numbered-narration ini hanya ada sebagai **teks di skill `inline-buttons`**. Sekarang jadi kode.

## 2.7 Reply-guard yang lebih pintar

Selain memblokir giliran yang berakhir tanpa `reply` (ada di keduanya), yang baru:
- **menegur prosa yang tidak perlu** — sudah `reply` tapi juga menulis prosa ke transcript → blok sekali, suruh tutup dengan "."
- **melacak giliran antar-bot terpisah** (`latestAgentInboundIdx`) — prosa milik giliran `[from: agent]` tidak ditimpakan ke giliran Telegram sebelumnya

## 2.8 Anti-loop antar-bot berbasis struktur

Lama: `hop_count` max 5.
Baru: `hop_count` max 5 **plus** aturan `expects_reply: true` hanya sah bila `in_reply_to` kosong — ini membuat loop A↔B **mustahil secara struktur**, bukan sekadar dibatasi. Divalidasi di kedua sisi.

Trade-off: baru **membuang timeout/jadwal balasan** (2026-08-05, biayanya 2 tool call tiap kirim) tanpa pengganti.

## 2.9 Startup wrapper yang lebih tahan banting

- **`--continue` + satu percobaan ulang** — syaratnya DUA: keluar cepat (<15 detik) **dan** kalimat `No conversation found to continue`, supaya kegagalan lain (binary tidak ketemu) tidak tersembunyi. Menggantikan pemindaian mtime milik wrapper lama yang "pecah diam-diam".
- **Deteksi gerbang kepercayaan folder** (`Quick safety check`) — wrapper **hanya melapor, tidak pernah menyuntik Enter**; memercayai folder atas nama user adalah keputusan keamanan, bukan teknis.
- **Pembersihan env anak** — `CLAUDE_CODE_CHILD_SESSION` dibuang, karena kalau diwariskan CC anak mematikan penyimpanan transcript.
- **`describeDispatchFailure`** — `.catch` DAN `.finally` berpasangan; sebelum 2026-08-07 `pty.write()` yang melempar membuat slash command user lenyap tanpa satu baris log.

## 2.10 Diagnostik & konfigurasi

- **`bun run doctor`** — laporan JSON per bot (`ok`, `bot`, `lock {pid, alive}`, `conversationsReady`, `version`), membaca berkas langsung sehingga berguna justru saat tidak ada yang berjalan. Lama tidak punya.
- **Config zod `strictObject`** yang **menolak** bentuk lama (`bots`) alih-alih mengabaikannya
- **`ts_local`** — `config.timezone` IANA opsional, push meta dapat `ts_local` di samping `ts` UTC
- **`balanceFences()`** — menjahit ulang fence ``` yang terpotong saat chunking, mengikuti aturan CommonMark yang benar
- **`replyStored()`** — semua pesan yang lahir di engine (ack slash, error, `/context`) ikut tercatat; terukur 12,9% pesan hilang dari riwayat sebelum ini
- **Fallback tujuan balasan dari DB** (`getLastChatId`) saat restart — sengaja bukan `allowFrom[0]`
- **Penanda otomatis "🤖 Dipicu oleh bot lain"** yang ditegakkan kode, AI tidak bisa menghapusnya
- **Typing indicator dengan batas** — ping tiap 4 detik, batas aman 300 detik (lama: fire-and-forget)
- **Skrip `migrate-per-folder.ts`** — dry-run default, menyalin (tidak memindahkan, tidak menghapus), verifikasi dua arah

## 2.11 Arsitektur

- **Tanpa daemon** — `fleetd` dibubarkan 2026-08-02, engine hidup di dalam proses MCP tiap sesi
- **Tanpa state bersama** — seluruh state satu bot ada di foldernya sendiri; **memindahkan bot = rename folder**
- **Nama bot = nama folder**, alamat bot lain = folder tetangga, tanpa registry
- **Antrean offline gratis dari bentuknya** — bot mati tidak memindai, `ls inbox/` memperlihatkan berapa yang menunggu
- **Instalasi bot baru = 3 langkah** (buat folder, isi `config.json`, jalankan `mirza-bot`)
- Dua runtime disengaja dan terukur: cc-plugin di Bun, cc-wrapper di Node (`pty.write()` gagal di Bun 1.3.11)

---

# BAGIAN 3 — Setara tapi beda jalan (bukan gap)

Dicatat supaya tidak salah dihitung sebagai fitur hilang:

| Kebutuhan | LAMA | BARU |
|---|---|---|
| Chunking pesan panjang | configurable `chunkMode`/`textChunkLimit` | fixed, window 2048, + `balanceFences()` |
| Markdown → MarkdownV2 | per-chunk konversi | `telegramify-markdown` mode escape, tanpa flag |
| Statusline bridge | chain + backup `settings.json` | chain + 4 pagar + rollback + deteksi bridge basi |
| Kirim tanpa roundtrip AI | system-outbox lintas plugin | lahir langsung di engine |
| Injeksi slash | pty-controller (plugin terpisah) | `send_slash` di dalam plugin yang sama |
| Album foto | debounce 400ms / cap 3000ms | debounce 1500ms / cap 8000ms |
| Single-poller lock | `bot.pid` + SIGTERM poller basi | `bot.pid`, sesi terbaru menang |
| Auto-resume sesi | pilih jsonl mtime tertinggi | `--continue` + retry |

---

# Catatan kejujuran

- Seluruh isi dokumen ini berasal dari dua subagent yang membaca kode masing-masing repo. Saya tidak memverifikasi ulang tiap klaim baris-per-baris.
- Subagent repo baru melaporkan **README `mirza-bots` sebagian sudah basi terhadap kode** — masih menulis "belum ada: PTY bot-cc, handoff/delegasi antar-bot, konversi CommonMark→MarkdownV2", padahal ketiganya sudah ada. Juga masih menyebut "tiga tool" padahal sudah tujuh.
- Beberapa item di Bagian 1 kemungkinan besar **sudah pernah kamu putuskan untuk tidak dibawa** (rebuild-audit K-17). Dokumen ini menginventarisir *apa yang berbeda*, bukan *apa yang salah*.
