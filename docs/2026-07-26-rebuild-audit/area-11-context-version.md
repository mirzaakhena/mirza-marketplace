# Area 11 — `/context`, `/version`, statusline bridge

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-001–016, 059–064, 165–170; SCAR-017, 041, 076, 084

---

## 11.0 Riset: apakah ada jalur resmi selain membajak statusLine?

**Dilakukan 2026-07-26 atas permintaan user.** Sumber: dokumentasi resmi Claude Code (`code.claude.com/docs/en/hooks`, `.../statusline`).

### Temuan 1 — TIDAK ADA hook yang memberi data pemakaian context

Claude Code punya **30 event hook**. Field yang diterima **semua** hook:

```
session_id · prompt_id · transcript_path · cwd · permission_mode · effort.level · hook_event_name
```

Dokumentasi menyatakan eksplisit tidak ada field token/persen/cost/rate-limit di hook mana pun. Bahkan `model` hanya ada di `SessionStart` dan tidak dijamin hadir.

**Kesimpulan: statusLine adalah satu-satunya sumber.** Desain lama bukan malas — memang tidak ada jalan lain.

### Temuan 2 — statusLine TIDAK menghapus tampilan bawaan Claude Code

> *"The status line renders in its own row above the built-in footer badges and does not replace them."*

Badge bawaan CC di footer **tidak pernah hilang** apa pun yang dipasang. Yang bisa hilang hanya baris kustom user — dan itu persis yang dijaga mekanisme chaining.

### Temuan 3 — hanya ada SATU slot statusLine

Tidak ada cara resmi menambah statusline kedua. Merantai adalah satu-satunya cara punya dua-duanya.

### Data yang statusLine sediakan (kaya)

```
context_window.{used_percentage, remaining_percentage, context_window_size,
                current_usage, total_input_tokens, total_output_tokens}
cost.{total_cost_usd, total_duration_ms, total_api_duration_ms}
rate_limits.{five_hour, seven_day}.{used_percentage, resets_at}
exceeds_200k_tokens · model · session_id · cwd
```

⚠️ **Nuansa yang wajib ditangani** (dari dokumentasi):
- `used_percentage` dihitung dari **input token saja** (`input + cache_creation + cache_read`), **tidak** termasuk output. Perhitungan manual harus memakai rumus yang sama supaya tidak berselisih
- `context_window.current_usage` = `null` sebelum panggilan API pertama, **dan lagi setelah `/compact`** sampai panggilan berikutnya
- `used_percentage` / `remaining_percentage` bisa `null` di awal sesi
- `rate_limits` hanya muncul untuk pelanggan Claude.ai (Pro/Max) setelah respons API pertama; tiap window bisa absen sendiri-sendiri
- `cost.total_cost_usd` **reset ke $0** saat `/clear` memulai sesi baru
- Sejak v2.1.132 `total_input_tokens`/`total_output_tokens` = pemakaian context saat ini, **bukan** total kumulatif sesi

### Temuan bonus — permukaan hook jauh lebih kaya dari asumsi desain lama

Desain lama mengasumsikan 4 hook; nyatanya ada 30. Yang langsung relevan dengan keputusan audit ini:

| Hook | Relevansi |
|---|---|
| **`PreCompact` / `PostCompact`** | Menjawab masalah nyata: designation handoff hilang saat context di-compact (area 08 §8.3) |
| `PostToolUse` / `PostToolBatch` | Penjaga jawaban final (area 10 §10.2) bisa lebih presisi daripada membaca transkrip |
| `SessionEnd`, `SubagentStart/Stop` | Lifecycle yang selama ini ditebak dari filesystem |
| `WorktreeCreate` / `WorktreeRemove` | Relevan untuk aturan worktree (area 10 §10.A) dan partial handoff (area 08 §8.C) |
| `PermissionRequest` | Ada jalur resminya — kalau relay izin dihidupkan lagi, tak perlu membajak apa pun |
| `TaskCreated` / `TaskCompleted` | Sinyal "task selesai" yang jadi pemicu handoff — selama ini ditebak |
| `effort.level` di **semua** hook | Effort bisa dibaca tanpa statusLine |

**Tindak lanjut (keputusan user):** dipetakan saat menyusun arsitektur, bukan sekarang — supaya audit fitur selesai dulu. Ini dicatat sebagai **tugas wajib** di tahap arsitektur, bukan catatan opsional.

## 11.1 Statusline bridge — **KEEP merantai, TAMBAH alarm**

**Item:** TG-165, 166, 167, 168; SCAR-017, SCAR-084

**Tetap:** bridge dipasang di `settings.json`, menangkap data ke snapshot, lalu meneruskan stdin yang sama ke perintah statusLine user (`~/.claude/statusline-progress.sh` — script dari repo user sendiri, `claude-code-status-line`) dengan stdout diwariskan. Baris statusline user tetap tampil; badge bawaan CC tidak pernah hilang.

**Yang WAJIB ikut (SCAR-084):** guard `isOurOwnBridge` — mencegah bridge menyimpan **dirinya sendiri versi lama** sebagai chained command, yang akan membuat loop. Deteksinya lintas ekstensi/separator/case.

**Perbaikan yang diputuskan:**

| Perbaikan | Masalah yang ditutup |
|---|---|
| **Alarm bila capture tidak berbunyi dalam N menit** | Kasus nyata: user mengubah `statusLine` di `settings.json` belakangan → menimpa perintah bridge → capture mati **diam-diam** dan `/context` membeku di data lama tanpa memberi tahu siapa pun. Sejalan dengan prinsip "setiap kegagalan harus terlihat" |
| Backup `settings.json` tidak menumpuk tanpa batas | Sekarang tiap instalasi menulis `settings.json.backup-<ts>` baru |
| `/context` **menunggu data ada**, bukan tidur 5 detik flat | SCAR-017 (utang tercatat, review #25) |
| Bila tidak ada statusLine sebelumnya, bridge merender tampilan sendiri | Menutup kasus "area statusline jadi kosong" di project yang belum punya statusLine |

**Yang tetap dari perilaku sekarang:** input bukan JSON → simpan `payload: null` (jangan crash); tanpa `CLAUDE_PROJECT_DIR` → skip, exit 0; tulis atomik tmp+rename.

**Lokasi snapshot** pindah ke store terpusat (K-1).

**SCAR-041 tetap berlaku:** snapshot hanya sah untuk sesi yang `session_id`-nya cocok — statusline hanya ter-update saat bridge menyala, jadi sesi fresh yang belum aktif masih membawa data sesi LAMA.

## 11.2 `/context` — **KEEP seluruh isinya**

**Item:** TG-010–013, 169, 170

User memilih **semua** bagian dipertahankan:

| Bagian | Isi |
|---|---|
| Pemakaian context | Bar 10 sel + persen + `used/total tokens`; `(unavailable)` bila absen |
| Rate limit 5 jam & 7 hari | Bar + `reset <sisa>`; seksi di-omit bila absen (wajar — hanya untuk pelanggan Pro/Max) |
| Model, effort, thinking, fast | Konfigurasi sesi berjalan. Catatan: `/effort` sudah dibuang **sebagai perintah** (area 05 §5.5), tapi tetap **ditampilkan** di sini |
| Biaya, CWD (dua segmen terakhir), nama + id sesi | |
| `Last update: HH:MM WIB (<relatif> ago)` | Zona Asia/Jakarta dihitung UTC+7 tetap tanpa `Intl` |

**KEEP helper format (TG-170):** token `1.5k`/`2M`; sisa reset `2d 3h`/`4h 5m`/`30m`/`just now`; relatif `Xs/Xm/Xh Ym ago`. Baris yang datanya absen **di-skip**, bukan ditulis kosong.

**Yang berubah:** TG-010/011 (instalasi bridge dipicu oleh `/context` + ack `⏳ Installing bridge…` lalu edit setelah 5 detik) **hilang** — instalasi bridge jadi bagian setup terpusat (K-1), bukan efek samping perintah.

## 11.3 `/version` — **DROP**

**Item:** TG-014, 015, 016; SCAR-076

Setelah konsolidasi, komponen yang tersisa terlalu sedikit untuk perintah sendiri.

**Yang ikut hilang:** resolusi versi plugin sendiri (`plugin.json` → `package.json` → git sha pendek), resolusi versi plugin sibling dari `installed_plugins.json`, dan penanganan quirk **SCAR-076** (field `version` di registry CC kadang berisi git sha, bukan semver — makanya `plugin.json` dipakai lebih dulu).

⚠️ **Risiko yang diterima sadar:** saat bot berperilaku aneh setelah `/reload-plugins` atau restart, user tidak bisa memastikan **dari HP** apakah versi yang berjalan sudah yang terbaru. Ini pernah memakan waktu nyata (cache plugin memakai versi lama diam-diam — insiden 2026-05-20).

**Mitigasi — dikonfirmasi user 2026-07-27:** versi **tidak** ditampilkan di `/context` maupun di mana pun di Telegram. Satu-satunya tempat versi komponen yang sedang berjalan terbaca adalah **`/doctor`**. Menu slash tetap sebersih mungkin; harga yang diterima: saat bot berperilaku aneh setelah reload, user membuka `/doctor` atau terminal untuk memastikan versinya.

## 11.4 `/start` — **DROP**; `/help` — **KEEP**

**Item:** TG-001–009, 059–064

**`/start` DROP:** fungsinya memandu pairing, yang sudah dibuang (area 01 §1.1). Sisanya hanya menampilkan identitas.

**`/help` KEEP:** dirender dari **satu registry perintah** yang juga jadi sumber menu slash Telegram — supaya menu dan `/help` tidak bisa berselisih (TG-059). Bentuknya: intro + `/name — ringkasan` per perintah + `/help <nama>` untuk detail; argumen toleran leading slash dan case; perintah tak dikenal → pesan yang jelas.

**Daftar perintah yang tersisa setelah audit:** `/new` · `/rename` · `/switch` · `/context` · `/handoff` · `/help`.

**Yang ikut hilang bersama pairing:**

| Item | Yang hilang |
|---|---|
| TG-006, 059 | Mekanisme dua-audience (`default` untuk belum-paired vs `paired`) |
| TG-060–063 | Scope per-chat `setMyCommands`, revert `deleteMyCommands`, rekonsiliasi delta-only terhadap `lastPairedScopes` |
| TG-064 | Tiga pemicu rekonsiliasi (onStart, watcher `access.json`, sweep 5 detik) |
| TG-002, 003 | Gate perintah native + pemangkasan pending pairing di tiap eksekusi |

Menu slash jadi **satu set tetap** yang dipasang sekali saat boot.

⚠️ **Catatan operasional yang tetap berlaku (SCAR-059):** aplikasi Telegram **meng-cache menu slash** — perubahan sering baru terlihat setelah force-close + buka ulang aplikasi.
