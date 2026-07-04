# Design Doc — Rewrite Harness Bot (Rakit Ulang)

- **Tanggal:** 2026-07-03
- **Status:** DRAFT — menunggu keputusan user pada "Keputusan terbuka" (§10) sebelum eksekusi fase mana pun.
- **Konteks:** keputusan rewrite disepakati 2026-07-02 (sesi `harness-redesign`, bot-02). Dokumen pendamping yang WAJIB dibaca eksekutor:
  - `docs/2026-07-02-improvement-backlog.md` — bagian **"Arah arsitektur target"** (konstrain no-SDK + 7 poin + strangler 3 fase).
  - `docs/2026-07-02-capability-inventory/` — **kontrak penerimaan 529 item**; definisi "tidak ada fitur hilang".

---

## 1. Ringkasan satu paragraf

Kita merakit ulang harness fleet bot (bot-01…06) di atas substrat baru: satu **daemon supervisor** per mesin yang memegang N sesi Claude Code interaktif lewat **PTY holder tipis**, sebuah **message bus ber-ACK**, dan **satu SQLite** sebagai sumber kebenaran state — sementara kebenaran tentang sesi dilaporkan dari DALAM Claude Code lewat **hooks** (bukan di-scrape). Channel (Telegram) menjadi **adapter hexagonal** di sisi daemon. Sisi Claude Code hanya memuat **satu plugin stub stabil** (MCP bridge + hooks). Modul yang sudah teruji (grammy handling, chunking, access control, message store) **diangkut, bukan ditulis ulang**. Konstrain mutlak: **tanpa Claude Agent SDK / `claude -p`** — seluruh usage tetap lewat TUI interaktif (alasan billing, lihat backlog).

## 2. Prinsip desain

1. **PTY untuk input; hooks untuk output.** Keystroke hanya untuk slash lifecycle. Jangan pernah menebak apa yang bisa dilaporkan CC sendiri dari dalam.
2. **AI decides, machine executes** — state machine (handoff, goal, reply-guard) dijalankan mesin; AI mengisi konten.
3. **Neighbor autonomy** — antar-bot hanya prompt (ber-mediasi AI penerima); tidak ada kontrol mekanis lintas bot.
4. **Satu implementasi per konsep** — tidak ada konvensi yang hidup di 2+ tempat; skema Zod di tiap boundary.
5. **Setiap kegagalan harus terlihat** — tidak ada catch-and-swallow tanpa jejak; `/doctor` sejak hari pertama.
6. **Kompatibilitas selama transisi adalah fitur** — shim eksplisit, ber-versi, dengan tanggal pensiun.

## 3. Arsitektur target

```
┌─────────────────────── mesin (Windows) ───────────────────────┐
│                                                                │
│  ┌──────────────────────── hostd (daemon) ──────────────────┐  │
│  │                                                           │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────────────────┐  │  │
│  │  │  bus    │  │  state   │  │  channel adapters       │  │  │
│  │  │ (ACK,   │  │ (SQLite  │  │  ┌───────────────────┐  │  │  │
│  │  │  idem-  │  │  WAL,    │  │  │ telegram-adapter  │◄─┼──┼──── Telegram Bot API
│  │  │  potent)│  │  satu    │  │  │ (grammy, N token) │  │  │  │     (long-poll per token)
│  │  └────┬────┘  │  file)   │  │  └───────────────────┘  │  │  │
│  │       │       └──────────┘  │  (nanti: WA/Discord/web)│  │  │
│  │       │                     └─────────────────────────┘  │  │
│  │  ┌────┴──────────────────────────────────────────────┐   │  │
│  │  │              bot supervisor (per bot)              │   │  │
│  │  └──┬─────────────────┬─────────────────┬────────────┘   │  │
│  └─────┼─────────────────┼─────────────────┼────────────────┘  │
│        │ IPC (named pipe)│                 │                   │
│  ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐             │
│  │pty-holder │     │pty-holder │     │pty-holder │  × 6        │
│  │ (node-pty)│     │ (node-pty)│     │ (node-pty)│             │
│  └─────┬─────┘     └─────┬─────┘     └─────┬─────┘             │
│        │ keystroke/render│                 │                   │
│  ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐             │
│  │ claude TUI│     │ claude TUI│     │ claude TUI│             │
│  │ + cc-stub ├────►│ + cc-stub ├────►│ + cc-stub ├──── hooks + │
│  │  (plugin) │ MCP │  (plugin) │     │  (plugin) │    MCP──► hostd
│  └───────────┘     └───────────┘     └───────────┘             │
└────────────────────────────────────────────────────────────────┘
```

Arah panah penting: **cc-stub → hostd** (hooks melaporkan kebenaran; MCP tools meneruskan aksi AI ke daemon). **hostd → pty-holder → TUI** (satu-satunya jalur keystroke).

## 4. Komponen

### 4.1 `hostd` — daemon supervisor (proses baru)

- Satu proses per mesin. Menampung: bus, state (SQLite), channel adapters, dan satu **bot supervisor** per bot.
- **Supervisi:** spawn/restart pty-holder per bot (backoff eksponensial), health per komponen, shutdown rapi. Registry fleet = tabel di SQLite + status in-memory; `agent-registry.json` + lockfile **pensiun** (akar LOSS-2/LOSS-8 hilang).
- **IPC:** named pipe Windows (`\\.\pipe\mirza-hostd`, modul `net` Node/Bun) / unix socket di POSIX. Protokol: JSON-RPC sederhana ber-`id` (request/response + event stream). Zod di kedua ujung.
- **`/doctor` endpoint** sejak fase 2: kesehatan poller, PTY, hook terakhir terdengar, antrean bus, ukuran DB, versi tiap komponen.
- CLI operator: `hostd status`, `hostd restart <bot>`, `hostd doctor` — menggantikan tebak-tebakan "kenapa bot diam".

### 4.2 `pty-holder` — pemegang PTY tipis (menggantikan `wrapper.ts` 1275 baris)

- Child process per bot. HANYA: spawn `claude` di node-pty (rantai spawn & env sama seperti sekarang — PTY-041..053), pipe stdin/stdout/resize/SIGINT, terima perintah injeksi dari hostd via IPC, laporkan raw exit/error.
- **Tanpa business logic**: tidak tahu apa itu sesi, nama, barrier, registry. Semua orkestrasi injeksi (queue, gate, pacing) pindah ke bot-supervisor di hostd — satu-satunya tempat, dites unit.
- Scar yang tetap dihormati di lapisan ini: split text+`\r` (SCAR: autocomplete picker), chunking code-point-safe (SCAR: ConPTY head-drop), pacing antar-injeksi.

### 4.3 `bus` — message bus internal

- Envelope: `{id, ts, from, to, kind, payload, hop, reply_to?}`; **ACK eksplisit**, idempotency by `id`, retry ber-backoff, dead-letter table di SQLite (terlihat via `/doctor`).
- **Prompt antar-bot & pesan channel masuk ke sesi CC via MCP channel notification** (jalur yang sudah terbukti di plugin telegram) — BUKAN keystroke. Keystroke tersisa: slash lifecycle saja.
- Hop-count & anti-bounce dipindah dari teks skill ke validasi bus (MAX_HOP tetap 5; marker atribusi digenerate mesin — menutup SEC-4).

### 4.4 `state` — satu SQLite (WAL)

Tabel inti (skema final di fase 1): `bots` (registry+heartbeat), `sessions` (id, bot, name, lifecycle, started_at — ditulis DARI hook), `messages` (port skema `messages.db` + FTS5 → IDEA-3), `bus_queue`/`bus_dead`, `goals`, `handoffs` (designation/pair state — menggantikan konvensi nama-sesi tiga-salinan), `channel_access` (port `access.json`), `kv` (config).
- Transaksi menggantikan lockfile; retensi/pruning jadi kebijakan tabel (INFRA-6). `/context` dan `agent_status` membaca baris yang sama → tak bisa beda pendapat (INFRA-5).

### 4.5 `telegram-adapter` — port dari plugin telegram

- **Diangkut nyaris utuh** (dengan test-nya): access control & pairing, album-buffer, markdown→MV2 + fallback, chunking, buttons validation, commands-registry, message store. Referensi: TG-001..189.
- Berubah: hidup di hostd (bukan MCP server di dalam CC); satu proses grammy per token (getUpdates 409 tetap dihormati — SCAR); meta-commands memanggil bot-supervisor langsung (bukan menulis file pending); outbound dipanggil via bus dari cc-stub.
- Bug yang TIDAK ikut diangkut: daftar FUNC/LOSS telegram di backlog diperbaiki saat porting (LOSS-4 `append`, LOSS-5 CRLF, LOSS-6 zombie, FUNC-1 null payload, FUNC-2 tabel MV2, SEC-1/2 gate).

### 4.6 `cc-stub` — SATU plugin Claude Code yang stabil

- **MCP server tipis**: semua tool (reply, react, edit_message, download_attachment, get_message_by_id, agent_list/status/send, send_slash self-only, dll) = proxy JSON-RPC ke hostd. Tidak ada business logic; skema tool digenerate dari satu sumber.
- **Hooks** (inti hook-inversion):
  - `SessionStart` → lapor `{session_id, source}` ke hostd → hostd tahu sesi baru/resume TANPA polling jsonl (LOSS-1 mati; clear-barrier jadi event).
  - `Stop` → reply-guard versi benar: hostd cek "ada reply substantif SETELAH tool-use non-reply terakhir?" (memperbaiki FUNC-3 struktural).
  - `UserPromptSubmit` → pointer 1-baris kewajiban channel (menggantikan re-injeksi ~150 token/turn — CONS-1).
  - `PreToolUse` → commit-trailer guard versi tokenized, matcher Bash+PowerShell (FUNC-4/5).
- Stub jarang berubah → checklist rilis 5-poin & masalah 3-copy praktis hanya menyentuh stub, bukan tiap perubahan logika.
- **Skill text yang tetap skill** (konten/gaya, bukan enforcement): teach-me, knowledge-vault, daily-report template, bot-conduct sebagai dokumen aturan, panduan handoff/goal (state machine-nya di hostd, SKILL-001..082 menandai mana kode mana teks).

## 5. Kontrak hook-inversion & ACK injeksi

1. hostd inject `/clear` (via pty-holder) → tandai `sessions.lifecycle = resetting`.
2. CC memulai sesi baru → `SessionStart` hook POST ke hostd → hostd tulis baris sesi baru, lifecycle `idle`, lepaskan antrean injeksi yang menunggu (pengganti clear-barrier; timeout fallback tetap ada tapi sebagai ALARM `/doctor`, bukan mekanisme utama).
3. Injeksi apa pun ber-`id`; dianggap terkirim hanya setelah sinyal balik (SessionStart untuk `/clear`, echo state untuk `/rename`, dst). Gagal → retry/dead-letter, TERLIHAT.
4. Semua field yang kini di-sniff dari keystroke (`renameArgFromCommand` dsb.) pensiun — nama sesi ditulis lewat jalur data, bukan ditebak dari input.

## 6. Pemetaan inventaris → rumah baru (ringkas)

| Prefix inventaris | Rumah baru |
|---|---|
| TG-* (189) | `telegram-adapter` (mayoritas port langsung); tool MCP → `cc-stub` proxy; hooks → `cc-stub` |
| PTY-* (114) | orkestrasi → bot-supervisor di `hostd`; raw PTY → `pty-holder`; state published → tabel `sessions` + shim; slash-guards & self-only → validasi hostd |
| BUS-* (47) | `bus` + validasi hostd; trust-logic peer-status jadi query SQLite sederhana |
| SKILL-* (82) | state machine (handoff/goal/reply-guard) → kode di hostd + hooks; konten/gaya → tetap skill di cc-stub |
| SCAR-* (97) | daftar uji wajib: tiap item = keputusan desain + test case (banyak yang jadi test integrasi pty-holder/adapter) |

Design detail per-item TIDAK diduplikasi di sini — ceklis inventaris adalah sumbernya; eksekutor mencentang di sana.

## 7. Repo & layout

Monorepo BARU terpisah dari mirza-marketplace (nama diusulkan: `mirza-harness`, lihat §10):

```
mirza-harness/
  packages/
    hostd/            # daemon: supervisor, bus, state, adapters
    pty-holder/       # child tipis
    telegram-adapter/ # port modul telegram + test
    cc-stub/          # plugin Claude Code (satu-satunya artefak yang dirilis ke marketplace)
    shared/           # zod schemas, protokol IPC, util (atomicWrite dsb. bila masih perlu)
  docs/
  .gitattributes      # * text=auto eol=lf — dari hari NOL (INFRA-3)
```

- Bun + TypeScript + `bun:sqlite` + zod + grammy (semua sudah familiar; `bun test`).
- `cc-stub` tetap dipublikasikan lewat mirza-marketplace (mekanisme distribusi plugin yang ada); sisanya deploy = `git pull` + `hostd restart`.
- CI minimal: `bun test` + typecheck (`tsc --noEmit`) — mencegah kelas bug LOSS-4 (method tak ada) sejak commit pertama.

## 8. Kompatibilitas fase 2 (shim — fleet campuran)

Selama ada bot lama yang belum migrasi, hostd MENULIS artefak legacy untuk bot pilot:
- `wrapper.state.json` + mirror `wrapper.current_session_id/_name` + `wrapper.heartbeat`/`wrapper.pid`/`wrapper.version` (key persis — pembaca lama bergantung nama field, lihat ambiguitas #3 inventaris).
- Entri di `~/.claude/agent-registry.json` (ikut protokol lock lama saat menulis).
- KONSUMSI `pending/*.json` (agent-bus bot lama tetap bisa mengirim prompt ke pilot).
Shim = modul terpisah ber-tanggal-pensiun; dihapus di fase 3.

## 9. Fase & definisi selesai

**Fase 0 — persiapan (kecil):** repo + skeleton + `.gitattributes` + CI + skema SQLite + protokol IPC (zod). Selesai = `hostd` kosong boot, `/doctor` jawab.

**Fase 1 — port fondasi:** state (SQLite), bus, telegram-adapter (port modul + test), cc-stub MCP proxy untuk tools telegram. Selesai = **bot uji ke-7** (workspace baru, token bot Telegram baru) melayani chat Telegram penuh (inbound/outbound/pairing/album/buttons) lewat harness baru; item TG-* mayoritas tercentang.

**Fase 2 — hook-inversion + lifecycle:** pty-holder, bot-supervisor, hooks SessionStart/Stop, injection ACK, shim legacy. Selesai = bot pilot (mis. bot-02) pindah penuh: `/new /switch /rename /delete /effort /context` jalan, handoff & agent-bus lintas bot lama↔pilot jalan, PTY-*/BUS-* tercentang, `/doctor` hijau 72 jam.

**Fase 3 — migrasi fleet + pensiun:** 5 bot sisa, hapus shim, arsipkan plugin lama di marketplace (README menyatakan superseded). Selesai = 529 item tercentang / DIHAPUS-dengan-alasan / DIGANTI-dengan-rujukan; fleet stabil 1 minggu.

Tiap fase: worktree + spec/plan superpowers + konfirmasi user sebelum mulai; push setiap milestone (doktrin git multi-agent tetap berlaku).

## 10. Keputusan (status per 2026-07-04)

1. **Nama monorepo/daemon: `mirza-harness` / `hostd`** — ✅ FINAL (disetujui user).
2. **Runtime: Bun + TypeScript** — ✅ FINAL (disetujui user).
3. **Adapter Telegram: 6 poller grammy dalam 1 hostd** (satu per token, di-supervisi) — ⏳ menunggu konfirmasi user setelah penjelasan (user minta teach-me).
4. **Fase 1 pakai bot uji ke-7 (token Telegram baru)** — ✅ FINAL; user menyediakan token saat fase 1 dimulai (minta saat dibutuhkan).
5. **`edit_message` (CONS-2): rekomendasi HAPUS dari permukaan tool** — ⏳ menunggu konfirmasi user. Alasan: (a) immediate-reply 0.0.7 sudah pindah ke new-messages-only karena edit tidak memicu push notification (update progress via edit tak terlihat di HP); (b) panduan saat ini kontradiktif (skill melarang, instruksi MCP menganjurkan) = kebingungan model; (c) FUNC-8: jalurnya lebih rapuh dari `reply`; (d) user mengonfirmasi tidak pernah melihat kebutuhannya. Bisa dihidupkan lagi dengan use-case sempit bila kebutuhan nyata muncul.

## 11. Cara kerja pengembangan (arahan user, 2026-07-04)

1. **Model mandor-orkestrator:** sesi utama (lead) mengorkestrasi subagent; pekerjaan yang independen dikerjakan PARALEL. Sebelum tiap fase, lead menyusun **peta dependensi** (mana standalone, mana depend-on) dan baru fan-out.
2. **Bertanya aktif:** setiap keputusan desain yang muncul selama development DIANGKAT ke user (gaya teach-me), terutama: eliminasi/perubahan fitur dari inventaris (aturan `DIHAPUS/DIGANTI` di README inventaris memerlukan persetujuan user), ide alternatif yang lebih baik, dan trade-off arsitektural.
3. **Perbaiki bug existing saat porting:** temuan backlog (`2026-07-02-improvement-backlog.md`) diperbaiki di kode BARU saat modulnya diangkut; jangan port bug-nya ikut.
4. **Audit skill:** selama rewrite, tandai skill yang bertele-tele, tidak konsisten, atau konflik dengan skill/tool lain (contoh yang sudah ketahuan: immediate-reply vs instruksi MCP soal edit_message; template handoff vs SKILL.md soal READY-heuristic) → usulkan perampingan ke user.
5. **Integrasi Obsidian second-brain (requirement baru):** semua bot harus bisa MEMANFAATKAN vault Obsidian milik user (`knowledge-vault` sudah menunjuk `C:\Users\Mirza\mirza-vault`, Conventions.md = source of truth) sebagai memori lintas-bot: belajar dari kesalahan & best-practice sebelumnya sebelum mengerjakan tugas, dan menyetor pelajaran sesudahnya. Desain detailnya (kapan baca, kapan tulis, format nota, kaitannya dengan playbook-split yang dulu di-defer) disusun bersama user di fase 1 — jangan implementasi diam-diam.

---
*Disusun oleh Claude Fable 5 (bot-02, sesi `harness-redesign`), dari audit 4-subagent 2026-07-02, inventaris 529 item, dan diskusi arsitektur dengan Mirza.*
