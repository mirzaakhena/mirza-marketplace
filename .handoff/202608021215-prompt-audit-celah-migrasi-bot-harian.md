# Audit Celah — Apa yang Masih Menghalangi Satu Bot Harian Pindah ke Sistem Baru

**Date:** 2026-08-02 12:15 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, BACKLOG, handoff) — **repo kode ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `8d678aa` · HEAD kode: `406a239`)
**Dari → Ke:** bot-02 → bot-03
**Pair:** —
**Lanjutan dari:** `.handoff/202608011930-prompt-lanjutkan-mirza-bots-setelah-25-masuk.md`
**Plan terkait:** — (dua rencana sebelumnya sudah tuntas; audit ini belum punya rencana dan memang tidak butuh)

---

## 1. Tujuan Handoff

Context bot-02 sudah panjang setelah sesi yang menyelesaikan dua tahap sekaligus,
dan **berhenti di titik bersih** — tidak ada yang setengah jadi.

**Goal estafet:** hasilkan **satu daftar konkret** berisi apa yang dipakai user
setiap hari dari sebuah bot lama, yang **belum bisa** dilakukan sistem baru.
Daftar itu — bukan peta tahap — yang menentukan urutan pekerjaan berikutnya.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Per
2026-08-02 ia **satu paket**: `cc-plugin` 0.5.3, tanpa daemon, 204 test hijau di
Windows 11 / Bun 1.3.11. Seluruh state terpusat di `~/.claude/mirza-bots/`.

Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani **enam bot harian** user, termasuk percakapan Telegram-nya sehari-hari.
Sistem **baru** melayani **satu** bot percobaan, `bot-uji`.

**Itu duduk perkaranya:** sistem baru belum mengambil alih apa pun.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge ke `main`, ter-push, dan **terverifikasi hidup lewat Telegram
sungguhan** — bukan sekadar hijau di test.

- **Penyatuan engine** — `fleetd` **dibubarkan sebagai daemon**. Merge `f4f0f77`.
  ±2.566 baris dihapus (socket, client, antrean offline, daemon). Spec:
  `docs/superpowers/specs/2026-08-02-penyatuan-engine-fleetd-design.md`.
- **2.5-KELUAR Task 1–5** — merge `964a924` + perbaikan `3646755`, `7686df1`,
  `4ce2c67`. Empat item: id sesi dibaca per-push lewat hook `SessionStart`,
  balasan keluar disimpan berikut `message_id`, bot bisa mengutip (pesan user
  **dan** pesannya sendiri), markdown dikonversi otomatis tanpa flag.
- **Terverifikasi user langsung di Telegram:** teks, quote-reply masuk, foto,
  tombol bernomor (U-5), keyboard dicopot setelah ditap (U-2 — **kali pertama
  menyentuh Telegram sungguhan**), `/clear` tidak memutus jalur pesan, id sesi
  berganti setelah `/clear`, balasan tersimpan, kutipan dua arah, dan riwayat +
  pencarian FTS.
- **Lima temuan baru dicatat:** W-18 … W-22, seluruhnya di BACKLOG Bagian 7.
  W-19/W-20/W-21/W-22 sudah ditutup.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih; dua repo bersih, semua worktree sudah dihapus)

## 5. Blocker

— (tidak ada. Arah audit ini dipilih user secara eksplisit lewat inline buttons
pada 2026-08-02.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** hasilkan daftar celah antara satu bot harian dan sistem baru.

### Kenapa audit, bukan langsung membangun — BACA INI, jangan dilewati

User meminta secara eksplisit agar **alasan ini ikut diserahkan**, bukan hanya
perintahnya, supaya bot berikutnya bisa menerapkan prinsipnya pada keputusan
yang belum terbayangkan sekarang.

**Peta 6 tahap mengukur kemajuan dari sisi arsitektur.** Pertanyaan yang
sebenarnya menentukan bukan "tahap berapa", melainkan **"apa yang masih
menghalangi satu bot beneran pindah?"** Selama enam bot harian masih di sistem
lama, seluruh pekerjaan ini adalah investasi yang belum terpakai.

Dan lebih dalam lagi: **ukur dulu sebelum membangun.** Pada 2026-08-02 tebakan
bot-02 kalah oleh pengukuran **tiga kali** dalam satu hari:

1. Menyimpulkan "sesi sudah menjalankan 0.5.1" dari bukti yang hanya menyentuh
   *proses*-nya. User yang mengoreksi.
2. Menduga dependency `zod` yang membuat hook tidak menyala. Salah total —
   penyebabnya path yang dieja dua cara (W-22), dan yang menemukannya **satu
   baris log**, bukan pemikiran yang lebih keras.
3. Menilai `session_id` basi sebagai "tidak berpengaruh". User yang menunjukkan
   bahwa menyimpan balasan keluar justru **melipatgandakan** baris yang salah.

Ketiganya punya bentuk yang sama: **sesuatu yang tampak jalan padahal tidak.**
Yang menutupnya bukan kode yang lebih pintar, melainkan membuat benda-benda itu
**berbicara saat gagal**. Audit ini adalah bentuk yang sama, satu tingkat di
atas: mengukur celah sebelum memilih apa yang dibangun.

### Langkah konkretnya

1. Ambil **satu** bot harian — `bot-01` paling representatif.
2. Daftarkan apa yang user pakai dari bot itu **setiap hari**. Sumbernya:
   `mirza-marketplace/plugins/telegram/commands/`, `skills/`, dan `hooks/`, plus
   plugin lain yang dipakai bot itu (`pty-controller`, `handoff`, `goal`,
   `daily-report`, `inline-buttons`, `agent-bus`).
3. Untuk tiap item, tandai: **sudah ada** di sistem baru / **belum ada** /
   **tidak relevan lagi**.
4. Keluarkan **satu tabel** berisi yang "belum ada", diurutkan dari yang paling
   sering user pakai — bukan dari yang paling mudah dibangun.
5. Setor ke user, minta ia memilih urutannya. **Jangan langsung membangun.**

**Dugaan bot-02 (tebakan, bukan hasil — perlakukan sebagai hipotesis yang harus
diuji, bukan jawaban):** manajemen sesi (`/new`, `/switch`, `/rename`), wrapper
PTY + resume, handoff antar-bot, goal, daily-report.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild**, memuat blok "Kondisi sekarang" terbaru |
| `mirza-marketplace/docs/2026-08-02-keadaan-hari-ini.md` | **Di awal** — satu halaman bahasa manusia tanpa kode W-/K-/SCAR; paling cepat untuk paham posisi |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/2026-08-01-status-kapabilitas-terverifikasi.md` | Saat perlu tahu apa yang sudah/belum terbukti hidup (✅ / 🧪 / ⬜) — **inilah setengah jawaban audit yang sudah ada** |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/area-05..14-*.md` | Saat mendaftar fitur sistem lama — inventaris aslinya ada di sini |
| `mirza-bots/README.md` | Sebelum menjalankan atau merilis; memuat prosedur update plugin tiga langkah |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 7** | Saat menyentuh area yang punya W-1..W-22 |
| `mirza-marketplace/docs/superpowers/specs/2026-08-02-penyatuan-engine-fleetd-design.md` | Saat butuh *kenapa* arsitekturnya sekarang begini |
| `~/.claude/agent-playbook/PLAYBOOK.md` | ⚠️ **SUDAH TIDAK ADA** (tersisa `PLAYBOOK.md.deleted-backup-20260621`). Penggantinya skill `bot-conduct` — invoke itu di awal kerja substantif |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Auto-start `fleetd`, atau bubarkan daemonnya? | **Bubarkan** | Seluruh penyatuan engine |
| State ikut dipecah ke folder bot? | **Tidak — tetap terpusat** | Pembeda utama dari sistem lama |
| Dua sesi di bot yang sama | **Sesi terbaru menang** | Kunci `locks/<bot>.pid` |
| Balasan keluar perlu disimpan? | **Perlu** | 2.5-KELUAR item 1, dan itu prasyarat kutipan |
| Markdown: selalu atau pakai flag? | **Selalu** | Tidak ada parameter `format` |
| Menumpangkan lebih banyak aturan ke preamble terse-turn? | **Tidak sebagai jawaban umum** | Ditolak dengan alasan tertulis di spec 2.5-KELUAR §7 |
| Berikutnya: audit, `bot-cc`, atau 2.5-GUARD? | **Audit celah** | Handoff ini |
| Kirim ke bot-03 meski sedang sibuk? | **Ya, sadar** | Estafet ini menyela `task-retest-batch-1-gelombang-1` |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

- ✅ **Pasang jejak sebelum menebak.** Hook `SessionStart` menyala setiap kali
  selama dua versi dan tidak menghasilkan apa pun; dugaan penyebabnya salah.
  Satu baris log menyelesaikannya dalam satu percobaan. **"Tidak dipanggil" dan
  "dipanggil lalu gagal" terlihat identik dari luar** kalau tidak ada yang
  mencatat.
- ✅ **Kolom kosong > kolom salah.** Selama hampir sejam hook rusak,
  `session_id` tersimpan NULL. Hasilnya: empat baris jujur yang mudah dikenali
  sebagai periode rusak, bukan empat baris yang tampak valid dan berbohong.
- ✅ **Verifikasi laporan sendiri sebelum menyampaikannya.** "Sesi sudah 0.5.1"
  diukur dari *proses*, bukan dari sesi. User yang mengoreksi.
- ❌ **JANGAN meminta tindakan tanpa menyebut sistem mana yang dilayani.** Dua
  sistem berjalan bersamaan di mesin ini, dan satu kalimat "restart sesi ini" di
  dokumen sistem baru membuat user mengira konteks saya tercampur — sampai
  mempertimbangkan membuang seluruh proyek.
- ❌ **JANGAN membuat hook meng-import kode engine.** Hook yang import `node:`
  saja menyala setiap kali; yang menarik `src/` pernah gagal senyap. Duplikasi
  lima baris jauh lebih murah daripada hook yang tampak terpasang dan menjaga
  nol.
- ❌ **JANGAN membandingkan path dengan `===`.** Claude Code menyerahkan cwd ke
  hook dengan `/` dan ke MCP server dengan `\`. Pakai `samePath()` di
  `cc-plugin/src/engine/same-path.ts` (W-22).
- ❌ **JANGAN menyapa bot produksi untuk diagnosa.** Baca `conversations.db`
  dengan `new Database(path, { readonly: true })`.
- ❌ **JANGAN menulis `config.json` tanpa mengunci ulang ACL-nya** (W-13):
  `icacls <file> /inheritance:r /grant:r "Mirza:(R,W)"`. Dan **jangan pernah
  dengan BOM** (SCAR-026).
- ⚠️ **Sesi yang berjalan memakai versi plugin saat sesi dibuka** (W-18).
  Setelah `claude plugin update`, sesi lama tetap menjalankan kode lama, dan
  **tidak ada sinyal apa pun** yang memberitahumu. Selalu minta user restart,
  jangan lakukan sendiri.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `8d678aa`; kode HEAD `406a239`; rentang sesi ini di
  `mirza-bots` = `3cd32a0~1..406a239` (**17 commit**). Dua repo bersih dan
  ter-push. Tidak ada worktree tersisa.
- **Versi terpasang:** `cc-plugin` **0.5.3** · `inline-buttons` 0.0.10 ·
  `telegram` (marketplace lama) 0.0.37-mirza.0. **Tidak ada `fleetd`** — paket
  maupun proses.
- **Cara menjalankan:** tidak ada. Buka sesi Claude Code di folder yang
  terdaftar sebagai `home` sebuah bot, dan bot itu mulai menarik pesan.
- **Bot uji:** `bot-uji`, rumahnya `C:\Users\Mirza\workspace\bot-uji`. Satu-satunya
  entri di `~/.claude/mirza-bots/config.json`.
- **Masih terbuka & belum diuji:** sesi kedua mengambil alih token (kodenya ada,
  belum disentuh live) · **W-18** (kelas masalah, belum punya rumah) · **W-7**
  (BOM di config) · **W-9** (nama `album_failed_count` menyesatkan).
- **Penilaian ulang Tahap 4 ada di BACKLOG Bagian 0**, dan penting untuk audit
  ini: ruang lingkup `bot-cc` menyusut, tapi **bobotnya naik** — sejak
  penyatuan, umur sesi = umur bot.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."*
