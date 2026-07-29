# Area 01 — Akses & keamanan channel

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-002, 067, 070, 091–100, 142–145, 156, 173–174, 186–187; SCAR-024, 026, 087, 090, 091, 095

---

## 1.1 Mesin pairing — **DROP**

**Item:** TG-004, TG-093, TG-094, TG-095, TG-096, TG-097, TG-148, SCAR-091 · dan ekornya: TG-060–064 (slash-menu dua-audience), TG-151 (watcher `access.json`), TG-145 (mode static), TG-186 (skill `/telegram:access`), TG-187 (skill `/telegram:configure`)

**Yang dibuang:** seluruh alur kode-pairing (kode 6 hex, expiry 1 jam, cap 3 pending, cap 2 balasan, file penanda `approved/<senderId>`, poller 5 detik), **dan** kedua skill `/telegram:access` + `/telegram:configure`.

**Diganti dengan:** allowlist yang diedit manual di satu file JSON. Setelah plugin di-install, user memasukkan Telegram user id-nya ke allowlist — sejak itu **semua** bot bisa berkomunikasi dengan user tanpa langkah onboarding per bot.

**Alasan user:** sistem satu-pengguna; user berada di kedua sisi proses pairing (yang DM dan yang meng-approve), jadi seremoni kode/expiry/anti-abuse tidak melindungi dari siapa pun. Edit JSON sekali lebih sederhana daripada mesin runtime + dua skill.

**Yang tetap ada:** enforcement allowlist itu sendiri (pesan dari id yang tidak terdaftar tetap di-drop diam-diam) dan gate outbound (§1.6).

### ⭐ Requirement baru — konfigurasi TERPUSAT untuk seluruh fleet

> "Untuk SEMUA bot dan kalau bisa terpusat di satu tempat saja karena setelah plugin ini diinstall, semua bot otomatis bisa komunikasi dengan user (saya) dengan saya masukkan user id telegram dalam allowlist di json." — user, 2026-07-26

Ini perubahan arsitektural, bukan sekadar penyederhanaan fitur. Kondisi sekarang: **semua** konfigurasi per-project (`<project>/.claude/channels/telegram/access.json` + `.env`), jadi 6 bot = 6 kali setup. Target: satu sumber konfigurasi per mesin.

Detail yang masih harus diputuskan → lihat **Pertanyaan terbuka 1.A**.

## 1.2 Dukungan group/supergroup — **DROP (penundaan sadar)**

**Item:** TG-098, TG-099, TG-100, `mentionPatterns`, `requireMention`, `access.groups`, `isMentioned()`, SCAR-085, SCAR-090

**Alasan user:** "Saya sebenarnya memang mau membangun system group, tapi tidak saat ini."

**Catatan desain:** ini penundaan, bukan penolakan permanen. Konsekuensinya untuk rebuild:
- `gate()` jadi satu cabang (private only); tipe chat lain di-drop.
- Jangan mendesain jalan yang secara struktural memustahilkan group nanti — khususnya **jangan mengasumsikan "satu chat tujuan"** secara hardcode di seluruh kode. Bug lama yang lahir dari asumsi itu: banner ganti-sesi hanya dikirim ke `allowFrom[0]` (SCAR-085), permission prompt di-broadcast ke semua DM allowlist tapi group dikecualikan (TG-122).
- Pelajaran dari versi lama: dukungan group setengah-jadi lebih buruk daripada tidak ada, karena separuh sistem mengecualikannya diam-diam. Kalau nanti dibangun, bangun utuh.

## 1.3 Knob delivery di `access.json` — **SIMPLIFY (hardcode)**

**Item:** TG-173, TG-072, TG-077, TG-104

Keempat knob jadi konstanta dengan nilai default sekarang:

| Knob | Nilai tetap |
|---|---|
| `ackReaction` | tidak ada reaksi otomatis |
| `replyToMode` | `first` (hanya chunk pertama mengutip pesan user) |
| `textChunkLimit` | 4096 (batas keras Telegram) |
| `chunkMode` | `length` |

`mentionPatterns` ikut hilang bersama dukungan group (§1.2). Subcommand `access set` hilang bersama skill-nya (§1.1).

**Alasan:** tidak satu pun pernah diubah dari default. Knob yang tidak pernah diubah = cabang kode yang tidak pernah diuji.

## 1.4 Mode static — **DROP**

**Item:** TG-145

Cabang `if (STATIC)` di `loadAccess`/`saveAccess`/poller/watcher dibuang, termasuk perilaku diam-diam "pairing di-downgrade jadi allowlist" yang hanya memberi warning di stderr. Setelah §1.1, konfigurasi memang tidak lagi bermutasi saat runtime — mode ini kehilangan maknanya.

## 1.5 Bug yang WAJIB difix saat rebuild (bukan diport)

- **SCAR-026** parser `.env` (regex `^(\w+)=(.*)$`) tidak membuang `\r`. Token hasil Notepad/`Out-File` bertrailing-CR → grammy 404 permanen tanpa petunjuk apa pun. Backlog LOSS-5.
- **SCAR-024** `chmodSync` no-op senyap di Windows → proteksi 0600 pada file token tidak berlaku. Perlu keputusan sadar (lihat 1.A: file terpusat di luar repo mengurangi paparan).

## 1.6 KEEP tanpa perubahan

| Item | Fitur | Kenapa sepadan |
|---|---|---|
| TG-067 | Gate outbound `assertAllowedChat` | AI tidak bisa mengirim ke chat di luar allowlist |
| TG-070, SCAR-087 | `assertSendable` | Menolak mengirim file dari dalam state dir (mencegah file token ikut terkirim); pakai realpath supaya symlink tidak lolos |
| TG-156 | `access.json` korup dipindah ke `.corrupt-<ts>` | Start fresh, bukan crash |
| TG-174, SCAR-095 | `.gitignore` otomatis di `channels/` | Melindungi token dari ter-commit. **Catatan:** kalau konfigurasi pindah ke luar repo (1.A), guard ini bisa jadi tidak perlu lagi |

---

## 1.7 Pemusatan penuh state & konfigurasi — **KEPUTUSAN BESAR**

**Diputuskan user, 2026-07-26.** Referensi kondisi sekarang: `state-inventory.md` (27 artefak, hanya 1 terpusat).

### Rumah baru: `~/.claude/mirza-bots/`

Semua artefak milik bot pindah ke satu direktori terpusat. **Di dalam repo kerja tidak ada artefak bot sama sekali** — `<project>/.claude/channels/` hilang total, begitu juga `.gitignore` penjaganya (TG-174, SCAR-095 jadi tidak perlu).

**Riwayat nama:** user awalnya memilih `~/.claude/fleet/` (2026-07-26), lalu **menyamakannya dengan nama repo baru** `mirza-bots` (2026-07-27) supaya config, repo, dan folder state satu nama — lebih mudah dihubungkan saat debug.

### Yang pindah ke pusat

| Kategori | Artefak (kode di `state-inventory.md`) |
|---|---|
| Konfigurasi | A1 token, A2 allowlist, **+ daftar bot (baru)** |
| Data percakapan | A3 `messages.db`, A4 `inbox/` |
| State identitas & liveness | A8 `last-status.json`, A10 `session-names.json`, A11 `archived-sessions.json`, A12 `goal-state.json`, B2–B7 `wrapper.*`, D1 registry fleet |
| Kanal ephemeral | A5 `system-outbox/`, B1 `pending/` — bentuk akhirnya menyatu dengan keputusan arsitektur (file vs tabel vs in-process) |
| Log | B8 `wrapper.log` |

### Yang TETAP di repo kerja (pengecualian sadar)

- **F1** `.handoff/*.md` dan **F2** `.daily-reports/*.md` + `.daily-report.todo.md` — ini artefak **pekerjaan**, bukan artefak bot. Mereka memang seharusnya ikut repo dan ter-commit.
- **C1** `<project>/.claude/settings.json` — milik Claude Code, bukan milik kita. (Tapi lihat area 11: apakah bridge statusline masih perlu memodifikasinya.)

### Yang tidak bisa dipindah

**E1–E4** milik Claude Code (`~/.claude/projects/`, `~/.claude/sessions/`, `~/.claude/plugins/`, `installed_plugins.json`) — hanya bisa dibaca.

### Konsekuensi desain yang harus dijaga

1. **Kaitan bot ↔ state lewat NAMA, bukan lokasi folder.** Ini yang membuat repo kerja bisa dipindah/di-rename tanpa memutus riwayat percakapan. Sekaligus memperbaiki SCAR-069/PTY-088: nama bot sekarang = basename `project_dir`, sehingga dua project dengan basename sama saling berebut slot registry dan versi lama hanya mencatat WARNING lalu menimpanya.
2. **6 proses menulis ke satu tempat.** State liveness ditulis tiap 5 detik per bot. Ini yang harus dijawab desain arsitektur: SQLite WAL berkolom `bot` (transaksi menggantikan lockfile) atau file per-bot di bawah `~/.claude/mirza-bots/bots/<nama>/`. Keputusan ditunda ke tahap arsitektur, tapi **lockfile busy-wait sinkron yang membekukan PTY (SCAR-016) tidak boleh ikut**.
3. **Satu titik kegagalan tunggal.** Kalau `~/.claude/mirza-bots/` rusak, seluruh fleet terpengaruh — bukan satu bot. Perlu jawaban: backup, deteksi korup (pola TG-156 diperluas), dan `doctor`.

## 1.8 Fleet declarative — bot didaftarkan lewat config — **REQUIREMENT BARU**

> "Saya ingin buat lebih fleksibel. Kedepannya saya bisa inisiasi folder manapun untuk jadi home bagi bot. Jumlah bot bisa saya tambah. masing-masing bot punya secret_key masing-masing dan itu bisa dikonfigurasi via config." — user, 2026-07-26

**Keputusan yang menyertainya:** jumlah identitas bot Telegram **tidak dipatok**. Tetap satu bot Telegram per bot-project (bukan satu bot dengan routing), tapi jumlahnya dan folder home-nya ditentukan config, bukan konvensi.

Bentuk kira-kira (final saat tahap arsitektur):

```json
{
  "allowFrom": ["<telegram-user-id>"],
  "bots": {
    "bot-01": { "home": "/Users/mirza/Workspace/bot-01", "token": "..." },
    "riset":  { "home": "/Users/mirza/Workspace/eksperimen-x", "token": "..." }
  }
}
```

Yang berubah dari versi lama:
- **Nama bot eksplisit**, lepas dari basename folder (PTY-087 pensiun). Contoh `riset` di atas menunjukkan nama tak harus sama dengan nama folder.
- **Menambah bot = menambah satu blok config**, bukan menjalankan skill setup di project baru.
- Identitas bot untuk commit trailer (`Agent: <bot>`, SKILL-058) dan untuk agent-bus (BUS-026) membaca nama dari config — satu sumber, bukan tiga derivasi basename yang bisa menyimpang.

## 1.9 Satu database percakapan + intip antar-bot — **FITUR BARU**

Semua percakapan masuk satu `messages.db` berkolom `bot`.

**Cakupan baca yang diputuskan:** **default hanya percakapan sendiri**, ditambah **tool eksplisit** untuk mengintip bot lain (mis. `peek_conversation(bot, sejak)`).

**Alasan user memilih ini:** konteks yang bocor tanpa disadari sulit dilacak. Dengan tool eksplisit, AI menyadari sedang membaca konteks orang lain dan jejaknya terlihat di transkrip.

**Catatan desain:** kelas bug yang harus dihindari adalah bot tidak bisa membedakan "user menyuruh SAYA" vs "user menyuruh bot lain" — persis masalah yang dilawan marker anti-bounce agent-bus (SCAR-043, BUS-038). Hasil `peek_conversation` harus terbaca jelas sebagai **data**, bukan instruksi.

---

## Pertanyaan terbuka / ditunda

### 1.A — Kapabilitas "bot membaca transkrip sesi sebelumnya" — **DEFER**

Membaca `~/.claude/projects/<encoded>/*.jsonl` untuk mencari isi sesi lama. User memilih **dibahas di sesi terpisah** karena bersinggungan dengan agenda vault/second-brain dan "bot anti lupa".

Konteks yang sudah dikumpulkan untuk sesi itu nanti:
- Ini **kapabilitas baru** (memori lintas-sesi), bukan relokasi state. Sekarang `projects/` hanya dipakai mekanis: enumerasi sesi untuk picker `/switch`, deteksi sesi baru pasca-`/clear`, hard-delete.
- Bedanya dengan `messages.db`: `messages.db` = percakapan user ↔ bot di Telegram (ringkas, terstruktur). `projects/*.jsonl` = seluruh isi kepala bot termasuk tiap tool call dan isi file (megabyte per sesi, format privat Claude Code yang bisa berubah tanpa pemberitahuan).
- Risiko yang harus dijawab: transkrip bot lain memuat isi source code repo lain — membaca lintas-bot berarti bot-01 bisa melihat isi kode project bot-05 tanpa punya akses ke foldernya.
