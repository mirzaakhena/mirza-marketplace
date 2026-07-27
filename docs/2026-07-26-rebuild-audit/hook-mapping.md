# Pemetaan Hook Claude Code → Kewajiban Mekanis

**Tanggal:** 2026-07-26 · Sumber: dokumentasi resmi `code.claude.com/docs/en/hooks` · Tugas wajib #1 dari ledger audit.

---

## 1. Temuan yang MENGUBAH keputusan audit

### 1.1 ⭐ `SessionStart` bisa MENYETEL nama sesi — tanpa injeksi keystroke

Output `SessionStart` menerima `sessionTitle` (di samping `additionalContext`, `initialUserMessage`, `watchPaths`, `reloadSkills`).

**Akibatnya:** rantai pasca-`/clear` yang paling rapuh di seluruh sistem **hilang**. Sekarang: inject `/clear` → tunggu sesi baru → inject `/rename <nama>` dengan pacing hati-hati → tunda event notifikasi supaya namanya sudah ter-update (SCAR-081, PTY-073). Jadi: inject `/clear` → hook `SessionStart` menyetel nama lewat nilai balik. **Satu langkah, tanpa keystroke kedua, tanpa pacing.**

Yang ikut mati: `POST_INJECTION_DELAY_MS` untuk rantai rename · kerapuhan urutan event SCAR-081 · bug "(unnamed)".

**Batasnya:** hanya berlaku saat sesi **dimulai**. Penamaan di tengah sesi (area 10 §10.C) tetap butuh injeksi `/rename` — itu satu-satunya pemakaian yang tersisa.

### 1.2 ⭐ `SessionStart` membawa `source: startup|resume|clear|compact|fork`

Barrier `/clear` (SCAR-030, PTY-056) selama ini menunggu **munculnya file `.jsonl` baru** dengan polling 500 ms. Sekarang ada sinyal eksak: `SessionStart` dengan `source: "clear"`.

Nilai `compact` dan `fork` juga informasi baru yang sebelumnya tidak terjangkau sama sekali.

### 1.3 ⭐ `PreCompact` bisa MEMBLOKIR compaction

Menjawab masalah nyata di area 08 §8.3: designation handoff hidup di dalam context, sekali compaction ia lenyap tanpa jejak.

Sekarang bisa dijamin: `PreCompact` menulis state ke store **sebelum** compaction terjadi, dan boleh memblokirnya bila penulisan gagal.

### 1.4 ⭐ `TaskCompleted` — pemicu mekanis untuk "selesai task substansial"

Aturan handoff (SKILL-006/007) berbunyi *"cek ambang context setiap selesai task substansial"* — dan "substansial" selama ini murni penilaian AI. `TaskCompleted` (membawa `task_id`, `task_title`, dan **bisa memblokir**) memberi titik pemeriksaan yang nyata.

### 1.5 `Stop` membawa `last_assistant_message` + `stop_reason`

Tidak lagi perlu mem-parse transkrip untuk tahu pesan terakhir. Ditambah: `Stop` bisa **menyuntik `additionalContext`** alih-alih memblokir keras — pilihan yang lebih halus untuk penjaga jawaban final.

### 1.6 `effort.level` ada di SEMUA hook

Effort terbaca tanpa statusLine sama sekali. (Data context tetap hanya dari statusLine — area 11 §11.0.)

---

## 2. Peta kewajiban → hook

| Kewajiban | Hook | Cara | Asal keputusan |
|---|---|---|---|
| Ack sebelum tool pertama | **`PreToolUse`** | `permissionDecision: "deny"` + `permissionDecisionReason` (**reason terlihat model**, jadi ia bisa memperbaiki diri) | area 10 §10.1 |
| Jawaban final wajib lewat `reply` | **`Stop`** | `decision: "block"` + `reason`, atau `additionalContext` yang lebih halus | area 10 §10.2 |
| Commit membawa nama bot | **`PreToolUse`** matcher `Bash` **+ shell lain** | deny + reason; **fix FUNC-4/5** (PowerShell lolos) | area 10 §10.6 |
| Deteksi sesi baru / barrier `/clear` | **`SessionStart`** `source: "clear"` | menggantikan polling 500 ms | area 06 §6.3 |
| Nama sesi setelah `/new` | **`SessionStart`** → `sessionTitle` | menggantikan injeksi `/rename` + pacing | §1.1 di atas |
| Nama sesi di tengah sesi | injeksi `/rename` (satu-satunya sisa) | mesin meminta nama ke AI lalu inject | area 10 §10.C |
| Designation handoff selamat dari compaction | **`PreCompact`** | tulis state sebelum compaction; boleh blokir bila gagal | area 08 §8.3 |
| Pemicu cek ambang handoff | **`TaskCompleted`** | titik pemeriksaan mekanis | area 08 §8.2 |
| Lifecycle sesi berakhir | **`SessionEnd`** `end_reason` | pembersihan + akurasi status | area 05 §5.4 |
| Skill perilaku dimuat otomatis | **`SessionStart`** → `additionalContext` / `reloadSkills` | tidak perlu "dipanggil" AI | area 10 §10.D |
| Tag `<channel>` + aturan data≠perintah | `instructions` MCP (bukan hook) | fakta mekanis saja | area 10 §10.4, area 14 §14.5 |

## 3. Hook yang DIHAPUS dari desain

| Hook | Alasan |
|---|---|
| `UserPromptSubmit` (pengingat per-turn) | **DIHAPUS** — ~150 token/turn yang terbukti tidak bekerja; kewajibannya sudah dipegang mesin (area 10 §10.4). Catatan: hook ini juga punya timeout lebih pendek (30 s) |
| `PermissionRequest` | Tidak dipakai — mesin permission DROP (area 04 §4.3). Dicatat: **ada jalur resminya** bila kelak dihidupkan |

## 4. Biaya yang harus diukur, bukan diasumsikan

⚠️ **Hook = spawn proses per kejadian.** Penegakan ack memakai `PreToolUse` dengan matcher yang mencakup hampir semua tool, jadi **setiap pemanggilan tool menambah satu spawn proses**. Dengan Bun ~30–50 ms per spawn, sesi dengan ratusan tool call membayar beberapa detik total.

Mitigasi yang perlu diuji:
- Hook harus **sangat tipis**: satu roundtrip ke program terpisah, tanpa membaca file/transkrip
- Matcher dipersempit dengan regex supaya tool `reply` sendiri tidak memicu
- Opsi `async: true` ada, **tapi hook async tidak bisa deny** — jadi tidak bisa dipakai untuk penegakan

**Wajib diukur di uji live**, bukan diasumsikan aman.

## 5. Catatan konfigurasi

- Hook bisa didefinisikan di **`hooks/hooks.json` plugin** (yang kita pakai) dan juga di **frontmatter skill/agent** — opsi terakhir berguna untuk hook yang hanya relevan saat skill tertentu aktif
- Matcher: string persis, daftar dengan `|`, atau regex tak ter-anchor. Tool MCP plugin bernama `mcp__plugin_<plugin>_<server>__<tool>`
- Pola output: `PreToolUse` memakai `hookSpecificOutput.permissionDecision`; sisanya memakai `decision: "block"` + `reason` di level atas
- **Pilih satu gaya per hook**: exit code saja, ATAU exit 0 + JSON. Jangan dicampur
