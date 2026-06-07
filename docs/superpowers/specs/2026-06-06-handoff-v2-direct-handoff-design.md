# Handoff v2 — Direct Bot-to-Bot Handoff (Design)

**Date:** 2026-06-06
**Status:** Approved (brainstorm session bot-05, 2026-06-06)
**Plugin:** `plugins/handoff/`
**Supersedes:** skill `handoff` (writer) + skill/command `handoff-resume` (reader) v0.0.8

> **Catatan restorasi 2026-06-07:** dokumen ini ditulis ulang dari context
> bot-05 setelah commit aslinya (`22856a4`) hilang akibat insiden reclone
> marketplace (lihat playbook entry 2026-06-07). Isi identik secara
> substansi dengan versi asli.

## 1. Latar Belakang & Tujuan

Handoff v1 terdiri dari dua command manual: `/handoff` (tulis file) dan
`/handoff-resume [yes]` (baca file + human gate). Keduanya butuh trigger dan
mediasi user di setiap langkah.

Handoff v2 menyederhanakan menjadi **satu skill `handoff`** yang melakukan
estafet pekerjaan dari satu bot ke bot lain **secara langsung (directly)**:
bot pengirim membuat file handoff, mengontak bot penerima via agent-bus,
menerima ACK, lalu me-reset session-nya sendiri — tanpa mediasi user per
langkah. User tetap mendapat laporan di setiap tahap via Telegram dan bisa
interupsi kapan pun.

Konteks lingkungan: beberapa bot (bot-01..bot-06) berjalan di satu mesin,
masing-masing dengan project dir sendiri (`workspace/bot-NN`), tetapi **bot
TIDAK PERNAH bekerja di workspace-nya sendiri** — selalu di repo proyek lain
(mis. `workspace/some-project`). Komunikasi antar bot lewat plugin
`agent-bus`; injeksi slash command ke session sendiri/peer lewat
`pty-controller`; interaksi user lewat plugin `telegram` + `inline-buttons`.

## 2. Keputusan Desain (hasil brainstorm)

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Deteksi context sendiri | **Hybrid**: skill-instruction sekarang (cek `agent_status(self)` tiap selesai task substansial); hook harness = fase 2 hardening |
| 2 | Reset session pengirim | **Self-reset aman**: `/rename done-…` → `/clear` → `/rename idle` oleh bot pengirim sendiri via `pty_send_slash` (self-target). `/delete hard all` TETAP manual oleh user. *(Koreksi 2026-06-07: semula tertulis `/new idle` — `/new` ternyata meta-command lapisan telegram, bukan command Claude Code; ketahuan saat uji kasus #3)* |
| 3 | Konvensi nama session | 4 kondisi: `idle` / `task-<slug>` / `done-<slug>-<yyyymmddhhmm>` / nama manual (lihat §4) |
| 4 | Perilaku penerima | **Gate adaptif**: langsung eksekusi, KECUALI section Blocker ≠ `—` → tanya user dulu |
| 5 | Permukaan command | `/handoff` bare-only, selalu lewat inline buttons 2 step. Semua bentuk argumen (`/handoff <bot>`, `/handoff next <bot>`, `/handoff pair <bot>`, free-form notes) **di-drop** |
| 6 | Designation (next/pair) | **Full-auto** saat trigger tercapai: langsung handoff ke bot yang ditunjuk, user hanya dinotifikasi |
| 7 | Idle detection peer | Tidak butuh infra baru: baca `current_session_name` dari `agent_status` (== `idle` → ready). Bot sibuk boleh MENOLAK handoff dengan penjelasan |
| 8 | ACK timeout | One-shot schedule 10 menit; **di-cancel saat ACK diterima** (wajib, karena setelah ACK session pengirim di-clear — schedule yang nyasar ke session baru membingungkan) |
| 9 | Sinkronisasi ke bot-conduct | TIDAK — protokol handoff hidup di skill handoff saja (decoupling). Konvensi nama session berlaku global hanya jika kelak ditambahkan ke bot-conduct secara terpisah |
| 10 | Label buttons | **English semua**: `[🚀 Now] [⏭️ After this task] [🏓 Ping pong] [📄 File only] [❌ Cancel]` |

## 3. Scope Perubahan Plugin `handoff`

Dihapus:
- `commands/handoff-resume.md` + `skills/handoff-resume/`
- Argumen `$ARGUMENTS` pada `commands/handoff.md` (tidak ada lagi free-form
  notes via argumen; catatan user diambil dari percakapan)

Diubah/ditulis ulang:
- `commands/handoff.md` — bare-only, delegasi penuh ke skill
- `skills/handoff/SKILL.md` — satu skill memuat SEMUA: trigger proaktif,
  flow buttons, template file (revisi), protokol agent-bus + ACK, self-reset,
  dan protokol sisi penerima
- `skills/handoff/template.md` — sinkron dengan template revisi
- `README.md` plugin + root README + catalog description + version bump
  (checklist CLAUDE.md repo ini)

Tidak berubah: plugin `agent-bus`, `bot-conduct`, `inline-buttons`,
`immediate-reply`, `pty-controller`, `telegram`.

## 4. Konvensi Nama Session (4 kondisi)

| Nama session | Arti | Transisi |
|---|---|---|
| `idle` | Standby, siap menerima handoff | Kondisi awal; dibuat via `/clear` + `/rename idle` (bot) atau `/new idle` (user dari telegram) |
| `task-<task-slug>` | Sedang mengerjakan task | Saat mulai kerja / menerima estafet: `/rename task-<slug>` |
| `done-<task-slug>-<yyyymmddhhmm>` | Arsip session yang sudah di-handoff | Sebelum self-reset: `/rename done-<slug>-<ts>` |
| `<nama-manual>` | Di-rename user sendiri → status **unknown** | Tetap tampil di daftar pilihan bot, TIDAK dianggap ready, tidak pernah dipilih otomatis |

- **Definisi READY** (boleh menerima handoff otomatis):
  `current_session_name == "idle"` **DAN** `context_used_percent < 10`.
- `task-slug`: kebab-case, ≤6 kata — slug yang SAMA dengan judul file handoff,
  sehingga arsip session bisa di-trace ke file handoff-nya.
- Timestamp arsip = format yang sama dengan timestamp filename handoff.
- Prefix `done-` (bukan suffix) agar arsip mengelompok rapi di daftar session
  dan mudah dibersihkan user (`/delete hard all` manual, sesekali).
- Bonus: konvensi ini menjadikan `agent_status` peer sebagai **detektor idle
  gratis** — tanpa perubahan infra agent-bus.

## 5. Trigger Handoff (3 jalur)

### 5a. Proaktif (threshold context)

Setiap **selesai task substansial**, bot WAJIB cek `agent_status(<nama-sendiri>)`:

- Model mengandung "1M" → threshold **35%**
- Selain itu (window 200k) → threshold **75%**
- Toleransi: threshold boleh terlampaui **selama sebuah task masih berjalan**;
  pengecekan hanya di batas selesai-task.

Jika `context_used_percent` ≥ threshold dan TIDAK ada designation aktif →
tawarkan via inline buttons: `[🤝 Handoff] [▶️ Lanjutkan]` (callback bebas,
label sesuai bahasa user). Pilih Handoff → lanjut ke pemilihan bot (§6 step 2).

### 5b. Manual: `/handoff` (bare, selalu buttons)

Lihat §6.

### 5c. Designation aktif (After this task / Ping pong) — full-auto

Jika user sudah menunjuk bot penerima di muka (via `/handoff` → mode
`⏭️ After this task` atau `🏓 Ping pong`, atau via bahasa natural "nanti
handoff ke bot-02" yang ekuivalen dengan After-this-task):

- Saat trigger tercapai (task selesai ATAU threshold context) → **langsung
  handoff** ke bot yang ditunjuk. User hanya mendapat notifikasi
  ("threshold tercapai, handoff ke bot-02 dimulai"), tidak ditanya lagi.
- **Guard**: sebelum kirim, tetap cek READY target. Jika target tidak ready
  (user sudah memakai bot itu untuk hal lain) → designation **batal**,
  fallback ke flow normal (§6 step 2, tawarkan pilihan ke user).

**Mode Ping pong (pair):** designation-nya MENULAR lewat estafet. Kontrak
pair dicatat di header file handoff (`**Pair:** bot-01 ⇄ bot-02`). Bot
penerima membaca header itu → tahu bahwa saat trigger berikutnya dia harus
handoff balik ke partner-nya, demikian seterusnya. Tidak ada file state
eksternal: pengetahuan pair hidup di (bot yang sedang aktif + file handoff).
Bot yang baru di-reset tidak perlu tahu apa-apa — dia akan diberi tahu saat
estafet kembali padanya.

**Mode After this task (next):** designation one-shot — habis dipakai sekali,
tidak menular (header `**Pair:** —`).

## 6. Flow `/handoff` (2 step inline buttons)

**Step 1 — pilih mode** (label English, fixed):

```
[🚀 Now] [⏭️ After this task] [🏓 Ping pong] [📄 File only] [❌ Cancel]
```

- `🚀 Now` — handoff sekarang juga → step 2
- `⏭️ After this task` — designation one-shot → step 2 (pilih target),
  lalu bot lanjut kerja sampai trigger
- `🏓 Ping pong` — designation pair → step 2, kontrak menular via header Pair
- `📄 File only` — buat file handoff TANPA mengirim ke bot mana pun
  (use-case lama: berhenti kerja, lanjut kapan-kapan; resume dilakukan dengan
  menyuruh bot mana pun "lanjutkan handoff <path/slug>" via bahasa natural).
  Jalur ini tetap menjalankan clarity check (§7a)
- `❌ Cancel` — batal, tidak terjadi apa-apa

**Step 2 — pilih bot.** Bot pengirim memanggil `agent_list()` +
`agent_status(<peer>)` untuk semua peer online, lalu menarasikan status di
body pesan (bullet, TANPA penomoran) dan menampilkan buttons nama bot saja:

```
- bot-02 — idle ✅ (ctx 3%)
- bot-03 — task-m2m-benchmark ⛔ sibuk
- bot-04 — eksperimen-x ⚠️ nama manual

[bot-02] [bot-03] [bot-04] [❌ Cancel]
```

- Bot non-ready TETAP bisa dipilih (user pegang kendali penuh), tanda
  ⛔/⚠️ hanya informasi.
- Bot offline ditampilkan dengan tanda 📴 dan keterangan bahwa pesan akan
  antre di inbox sampai bot itu boot; tetap bisa dipilih (konsisten dengan
  edge case §10).

## 7. File Handoff (template revisi)

### 7a. Pra-syarat sebelum menulis file

1. **Clarity check** (diwarisi dari v1, tetap berlaku): next-step harus bisa
   dinyatakan satu kalimat tanpa hedging + ada artefak konkret + terkonfirmasi
   user di session ini. Kalau gagal → brainstorm dulu dengan user.
2. **Mandat README**: update README yang relevan (root README repo kerja +
   README sub-folder yang tersentuh pekerjaan session ini) SEBELUM menulis
   file handoff. Handoff yang dikirim dengan README basi = handoff cacat.

### 7b. Lokasi & penamaan

- Path: `<repo-kerja>/.handoff/<yyyymmddhhmm>-prompt-<task-slug>.md`
  (repo kerja = repo proyek tempat bot bekerja, BUKAN workspace bot).
- Aturan slug, collision (`-2`, `-3`), fallback non-git: sama dengan v1.

### 7c. Struktur (revisi dari template 10-section v1)

Header:

```markdown
# {Title}

**Date:** YYYY-MM-DD HH:MM ({TZ})
**Repo kerja:** {ABSOLUTE path repo proyek}   ← BARU (wajib; CWD tiap bot beda)
**Branch:** {branch} (HEAD: {sha})
**Dari → Ke:** {bot-pengirim} → {bot-penerima | —}   ← BARU
**Pair:** {bot-A ⇄ bot-B | —}                 ← BARU (kontrak ping-pong)
**Lanjutan dari:** `.handoff/{file-sebelumnya}` | —
**Plan terkait:** `path` — fase N/total | —
```

Sections:

1. **Tujuan Handoff** *(BARU)* — kenapa handoff ini dibuat (threshold context
   / task selesai tapi ada lanjutan / perintah user) + goal estafet satu kalimat.
2. **Konteks Proyek** — 2-4 kalimat (sama dengan v1).
3. **Yang Sudah Selesai (SUDAH)** — sama dengan v1 (commit SHA, status verified).
4. **Yang Sedang Dikerjakan (SEDANG)** — sama dengan v1 (state mid-flight).
5. **Blocker** — apa yang menghambat **dan kenapa menjadi blocker**, plus apa
   yang dibutuhkan untuk membukanya.
6. **Yang Akan Dikerjakan (AKAN)** — goal + starting point (sama dengan v1).
7. **Referensi** *(DIROMBAK)* — tabel `path → kapan/kondisi dibaca`:

   ```markdown
   | Referensi | Kapan dibaca |
   |---|---|
   | `~/.claude/agent-playbook/PLAYBOOK.md` | Di awal, sebelum kerja substantif |
   | `docs/superpowers/plans/<plan>.md` | Di awal — roadmap source of truth, posisi: fase N/total |
   | `docs/.../spec.md` | Saat butuh rationale keputusan desain |
   | `scripts/troubleshoot-x.md` | HANYA saat menemui error X |
   ```

   Aturan: (a) referensi playbook WAJIB ada; (b) plan/tasks lintas-session
   WAJIB dicantumkan jika pekerjaan adalah bagian proses panjang terencana;
   (c) JANGAN menulis ulang isi yang sudah dijelaskan referensi — cukup
   tunjuk + kondisi baca; (d) setiap referensi harus punya kolom "kapan
   dibaca" (di awal vs kondisional).
8. **Keputusan User Lewat Brainstorming** — tabel (sama dengan v1).
9. **Anti-Patterns / Lessons (CARRY FORWARD)** — sama dengan v1.
10. **Catatan Lain** — gabungan v1 §7 (artefak: commit range, files) + §10
    (environment, open questions, deadline). Catatan user diambil dari
    percakapan (tidak ada lagi argumen command).

Sifat file: append-only chain, tidak mengedit handoff lama, tidak
menduplikasi checklist plan — semua aturan v1 dipertahankan.

## 8. Protokol Estafet (sequence)

Aktor: **S** = bot pengirim, **R** = bot penerima, **U** = user (Telegram).

1. **Trigger** (§5) → target R fix (via buttons / designation).
2. S cek READY R (`agent_status(R)`). Non-ready + jalur manual → tanda di
   daftar; non-ready + designation → fallback §5c guard.
3. S jalankan pra-syarat §7a (clarity check + update README), tulis file
   handoff, lalu **lapor U**: "file handoff selesai: `<absolute path>`".
4. S kirim `agent_send(target=R, payload={kind:"prompt", body:...})`. Body
   prompt WAJIB memuat:
   - **Absolute path file handoff** (eksplisit — JANGAN menyuruh R membaca
     "latest file di .handoff/", karena bot lain bisa sedang membuat handoff
     paralel di repo yang sama);
   - absolute path **repo kerja**;
   - instruksi `/rename task-<slug>` (via `pty_send_slash` self-target);
   - instruksi **ACK dua arah**: (a) balas ke S via `agent_send` dengan
     `hop_count = N+1`, (b) lapor ke U via Telegram bahwa handoff diterima;
   - instruksi **gate adaptif**: jika section Blocker ≠ `—` → tanya U dulu
     sebelum eksekusi; selain itu langsung eksekusi;
   - instruksi **tolak-jika-sibuk**: jika R ternyata sedang mengerjakan
     sesuatu, balas ke S dengan penjelasan singkat alih-alih menerima.
5. S pasang **one-shot schedule 10 menit** (cron) untuk cek ACK, lalu
   **lapor U**: "handoff terkirim ke R, menunggu ACK".
6. **R menerima prompt**: baca file handoff (+ referensi yang ditandai "di
   awal", termasuk plan terkait), `/rename task-<slug>`, kirim ACK ke S
   (hop_count+1), **lapor U** ("saya terima handoff X dari S, mulai
   kerjakan: <ringkasan next-step>"), lalu eksekusi sesuai gate adaptif.
   - R sibuk → kirim penolakan ke S; S **lapor U** + tawarkan pilihan bot
     lain (kembali ke §6 step 2).
7. **S menerima ACK** → urutan WAJIB:
   1. **Cancel cron timeout** (harus sebelum reset — kalau tidak, cron akan
      fire ke session baru yang kosong dan membingungkan);
   2. **Lapor U**: "ACK diterima dari R, estafet resmi berpindah; saya reset";
   3. Self-reset via `pty_send_slash` (self-target): `/rename
      done-<slug>-<yyyymmddhhmm>` → `/clear` → `/rename idle`.
8. **Timeout** (10 menit tanpa ACK) → S **lapor U** + buttons:
   `[Kirim ulang] [Pilih bot lain] [Batal]`. TIDAK self-reset — estafet
   belum berpindah.

### Kepatuhan terhadap aturan agent-bus

- ACK dari R ke S legal terhadap **anti-bounce rule**: prompt S eksplisit
  meminta report-back (pengecualian #2 aturan itu), dan memakai `hop_count`.
- `agent_send` oleh S legal terhadap aturan "hanya atas permintaan user
  eksplisit": pilihan user pada buttons (atau designation yang dia setujui di
  muka) ADALAH permintaan eksplisit itu. Skill mencantumkan pemetaan ini.
- Self-reset S memakai `pty_send_slash` TANPA target (self) — kategori "safe,
  autonomous" sesuai deskripsi tool; tidak menyentuh aturan destruktif
  cross-agent.

## 9. Sisi Penerima di Skill yang Sama

Skill `handoff` (satu file) memuat bagian "Saat kamu MENERIMA handoff":
trigger description skill mencakup pola "menerima prompt estafet handoff via
agent-bus". Tidak ada lagi command `/handoff-resume`; perilaku penerima
sepenuhnya didorong oleh prompt dari S + bagian penerima di skill.

Ringkasan kewajiban R: baca file yang DITUNJUK (bukan latest) → rename
session → ACK 2 arah → gate adaptif → eksekusi → (kelak, saat trigger-nya
sendiri tercapai) lanjutkan estafet sesuai header Pair atau tawarkan ke U.

## 10. Edge Cases

- **R offline saat kirim**: `agent_send` antre di inbox. S melaporkan ke U
  bahwa target offline + pesan antre; timeout 10 menit tetap berlaku
  (kemungkinan besar berakhir di flow timeout §8.8).
- **Dua bot membuat handoff paralel di repo yang sama**: aman — file path
  eksplisit di prompt, bukan "latest". Collision filename ditangani suffix.
- **User memakai bot idle yang sudah di-designate** (pair/next): guard READY
  §5c membatalkan designation, fallback ke pilihan manual.
- **ACK datang SETELAH timeout** (cron sudah fire, S sudah lapor U): S belum
  reset (reset hanya terjadi setelah ACK); saat ACK akhirnya tiba, lanjutkan
  flow normal §8.7. Jika user sudah memilih "Pilih bot lain" duluan dan
  estafet sudah berpindah ke bot ketiga, S melaporkan konflik ke U dan TIDAK
  mengirim apa pun ke R (anti-bounce: tidak ada instruksi report-back baru).
- **File handoff menunjuk plan yang hilang / branch berbeda / SHA yatim**:
  perilaku v1 dipertahankan (catat di laporan, jangan gagal).
- **`/handoff` saat tidak ada peer online**: tampilkan hanya `[📄 File only]
  [❌ Cancel]` + keterangan.
- **Threshold tercapai berkali-kali & user selalu pilih Lanjutkan**: tawarkan
  lagi hanya pada batas selesai-task BERIKUTNYA (tidak spam tiap turn).

## 11. Out of Scope / Fase 2

- **Hook context-monitor** (bagian "hybrid"): hook harness yang meng-inject
  context % tiap turn sebagai hardening — fase terpisah, setelah perilaku
  skill-instruction terbukti kurang patuh.
- **Konvensi nama session berlaku global** (di luar konteks handoff) — kalau
  diinginkan, masuk bot-conduct sebagai rule terpisah; bukan bagian rilis ini.
- **Flag busy/idle native di agent-bus** — tidak dibutuhkan (konvensi nama
  session sudah cukup).
- Perubahan apa pun pada plugin selain `handoff`.

## 12. Acceptance Criteria

1. `/handoff-resume` hilang dari command list; `/handoff` tidak menerima
   argumen.
2. `/handoff` memunculkan buttons step 1 dengan 5 label English fixed; step 2
   menarasikan status semua peer (idle/task/manual/offline) tanpa penomoran.
3. Skenario happy-path Now: file tertulis di `<repo-kerja>/.handoff/`, README
   ter-update, U menerima ≥3 laporan (file selesai → terkirim+menunggu ACK →
   ACK+reset), R melapor ke U dan mulai kerja, session S berakhir bernama
   `done-<slug>-<ts>` lalu session aktif baru bernama `idle`, cron timeout
   ter-cancel.
4. Skenario After this task: tidak ada pertanyaan saat trigger; notifikasi
   saja; guard READY bekerja saat target dipakai user.
5. Skenario Ping pong: header Pair terisi; R meneruskan estafet balik ke S
   tanpa ditanya saat trigger-nya sendiri tercapai.
6. Skenario blocker: R bertanya ke U dulu (gate adaptif) sebelum eksekusi.
7. Skenario timeout: U menerima tawaran `[Kirim ulang] [Pilih bot lain]
   [Batal]`; S TIDAK ter-reset.
8. Checklist rilis CLAUDE.md repo terpenuhi (version bump plugin.json, README
   plugin, root README, catalog description).

## Addendum implementasi (riwayat rilis & temuan uji)

- **Rilis asli (hilang dari git, utuh di cache & ter-restore):** handoff
  `0.0.9`, telegram `0.0.30-mirza.0` (entry `/handoff` di slash menu —
  perluasan scope §3 atas permintaan user), inline-buttons `0.0.7`,
  agent-bus `0.0.7`. Restorasi 2026-06-07: handoff `0.0.11`, telegram
  `0.0.32-mirza.0`, inline-buttons `0.0.9`, agent-bus `0.0.9`.
- **Perbaikan pasca-review kualitas:** derivasi `<slug>` ditambahkan ke §4
  SKILL.md (gap nyata); kewajiban substitusi placeholder sebelum kirim
  dipertegas pada template `agent_send`.
- **Temuan uji 2026-06-07 (BUG, belum di-fix):** `agent_status` melaporkan
  `current_session_name` BASI untuk session fresh yang belum pernah aktif
  (sumber `last-status.json` telegram baru ter-update saat statusline bridge
  jalan) → deteksi READY gagal persis pada bot idle yang baru di-reset.
  Workaround: sentuh bot sekali (mis. `/context`). Fix yang diusulkan:
  wrapper menulis session name saat `/new`/`/rename`. Juga:
  `context_used_percent` bisa `null` pada session fresh — perlakukan null
  sebagai fresh/lolos threshold READY.
- **Temuan uji 2026-06-07 #2 (BUG skill, FIXED di 0.0.12):** langkah
  self-reset semula memakai `/new idle` — tidak valid: `/new` adalah
  meta-command lapisan telegram (handler-nya menulis payload wrapper
  `/clear`+sessionName), bukan command Claude Code; injeksi PTY-nya gagal.
  Urutan benar: `/rename done-…` → `/clear` → `/rename idle`. Uji kasus #3
  juga berjalan dalam kondisi abnormal (MCP agent-bus sender mati →
  fallback baca `last-status.json` manual + tulis pending-inbox manual) —
  user meminta re-test dalam kondisi normal.
