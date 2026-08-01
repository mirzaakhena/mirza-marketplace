# Lanjutkan `mirza-bots` Setelah Tahap 2.5-MASUK

**Date:** 2026-08-01 19:30 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen, spec, BACKLOG, handoff) — **repo kode ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan sudah di-push
**Branch:** `main` (HEAD dokumen: `19f3de0` · HEAD kode: `a52180e`)
**Dari → Ke:** bot-01 → bot-02
**Pair:** —
**Lanjutan dari:** `.handoff/202608010131-status-tahap25-masuk-selesai-di-windows.md` (⚠️ **sebagian sudah basi** — berkas ini yang lebih baru)
**Plan terkait:** — (rencana 2.5-MASUK sudah tuntas; 2.5-KELUAR **belum punya spec maupun rencana**)

---

## 1. Tujuan Handoff

Context bot-01 mencapai 84% dan user meminta estafet. **Tidak ada task yang
menggantung di tengah** — berhenti di titik bersih.

**Goal estafet:** lanjutkan pembangunan `mirza-bots`, dengan prioritas yang
user sendiri nyatakan hari ini: **sistemnya harus terasa lebih sederhana untuk
dipakai**, bukan sekadar lebih lengkap.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user, dibangun
sebagai marketplace **baru** yang sengaja tidak kompatibel dengan yang lama
(K-17: `mirza-marketplace` lama tetap berjalan apa adanya, tidak disentuh).

Tiga komponen: **`fleetd`** (daemon per mesin — memegang seluruh koneksi
Telegram, database, antrean; TypeScript + Bun + grammy + SQLite),
**`cc-plugin`** (plugin Claude Code tipis yang menyambung ke `fleetd` lewat unix
socket), dan **`bot-cc`** (wrapper PTY — **belum dibangun**, Tahap 4).

Motivasi induknya (K-5): *aturan yang bisa dijamin mesin, dijamin mesin* —
bukan diminta ke AI lewat teks skill yang bocor.

## 3. Yang Sudah Selesai (SUDAH)

**Semua terverifikasi hijau dan ter-push.** `fleetd` **145 test**, `cc-plugin`
**41 test**, di Windows 11 / Bun 1.3.11.

- **Tahap 2.5-MASUK Task 0–8 lengkap** — `0605ebe` `b0cc2f5` `8009178`
  `a94da07` `1123446` `300bf0c` `48197b6` `e26acb9`. Task 7 sekaligus menutup
  **B-1 `peek_conversation`** lebih awal dari Tahap 6.
- **Task 0 menjawab pertanyaan terbesarnya: `fleetd` JALAN di Windows.** K-14
  tidak perlu ditinjau ulang.
- **Stop hook `cc-plugin`** (W-10) — `91d9df7`, plus `e0cc2da` (BOM) dan
  `57aff24` (W-14, hook sempat memblokir pesan plugin channel lain).
- **Empat catatan user** — U-1 tombol (`2d902af`, `inline-buttons` 0.0.10 di
  marketplace **lama**), U-2 keyboard dicopot (`90d9b0a`), U-3 larangan minta
  `message_id`, U-4 timezone (`c70a9cc`).
- **U-5 penegakan tombol bernomor** (`6b54bf7`) — `fleetd` menolak `reply`
  berlabel angka tanpa daftar bernomor di badan pesan.
- **Terkonfirmasi user langsung di Telegram:** quote-reply (penuh & sebagian),
  navigasi riwayat, pencarian kata kunci, keyboard dicopot, timezone, kirim PDF,
  album 3 foto, dan **antrean offline** (4 pesan tertahan berjam-jam lalu
  tersampaikan utuh).

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih; dua repo bersih, tidak ada yang belum ter-push)

## 5. Blocker

**Ada satu keputusan user yang menggantung, dan ia menentukan pekerjaan
berikutnya.** User menyatakan tujuan rebuild ini adalah **kesederhanaan** —
setup, instalasi, komunikasi, prompt — bukan kelengkapan fitur.

bot-01 mengusulkan: **`cc-plugin` menyalakan `fleetd` sendiri bila belum
berjalan**, supaya user tidak pernah lagi menjalankannya manual atau lupa
me-restart-nya. Itu potongan kecil dari Tahap 4 (`bot-cc`), jauh lebih murah
daripada Tahap 4 utuh, dan menyerang persis keluhan user hari ini.

**User belum menjawab usul itu.** Tanya dulu sebelum eksekusi.

Konteks yang perlu dibawa saat bertanya: user bilang **tidak keberatan pesan
hilang** saat sesi tertutup ("tinggal copy-paste"), jadi argumen durabilitas
lemah baginya. Nilai pemisahan `fleetd` yang benar-benar ia lihat adalah
**pemusatan** — satu pihak yang mendengarkan, bukan N salinan aturan yang
saling menyimpang.

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** bikin sistem baru terasa lebih sederhana dipakai, bukan sekadar lebih
lengkap.

Tanyakan dulu ke user mana yang ia mau (Blocker di atas), lalu kerjakan:

1. **Auto-start `fleetd` dari `cc-plugin`** — usul bot-01, menunggu jawaban user
2. **W-16** — `cc-plugin` mati diam-diam saat `hello` ditolak. Ini memakan **dua
   jam** hari ini. Akarnya **belum diketahui** dan dugaan "salah folder" sudah
   **dibantah user**
3. **U-6** — pasang `poppler-utils` (`scoop install poppler`) supaya PDF terbaca
   lewat jalur bawaan Claude Code, termasuk PDF hasil scan
4. **Desain 2.5-KELUAR** — pekerjaan besar berikutnya, **belum punya spec**.
   Item pertamanya konversi CommonMark→MarkdownV2; user sudah melihat sendiri
   balasan bot tampil dengan `**bintang**` mentah

**Starting point:** branch `main` di kedua repo; baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| `~/.claude/agent-playbook/PLAYBOOK.md` | Di awal, sebelum kerja substantif |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild**, memuat blok "Kondisi sekarang" yang paling baru |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 7** | Di awal — W-1..W-17 dan U-1..U-6, berikut **peringatan cara memperbaikinya** |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/2026-08-01-status-kapabilitas-terverifikasi.md` | Saat perlu tahu apa yang sudah/belum terbukti hidup (✅ / 🧪 / ⬜) |
| `mirza-marketplace/docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` | Saat butuh *kenapa* sesuatu dirancang begitu; **§3.3 daftar scar tissue Windows** |
| `mirza-marketplace/docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` **§11** | Saat ingin tahu hasil uji live dan apa yang belum diuji |
| `mirza-marketplace/docs/2026-07-26-rebuild-audit/README.md` | Sebelum memutuskan hal baru — ledger K-1..K-18, B-1..B-10 |
| `mirza-bots/README.md` | Sebelum menjalankan atau merilis |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Setelah Task 0, kerjakan apa? | Beresin temuan test-only dulu, baru Task 3 | Suite Windows hijau penuh sebelum fitur dilanjutkan |
| W-4 (baris `listening` berbohong) sebelum Task 3? | Ya | Satu-satunya cacat kode produk dari Task 0 ditutup lebih awal |
| Pemeriksaan live #7–#10 | **Dilewati sadar**, bukan terlupa | Ditandai khusus di spec §11 agar tidak terbaca sebagai kelalaian |
| Setelah W-10, borong perbaikan kecil atau mulai KELUAR? | Borong U-1..U-4 | Keempatnya selesai dalam satu sesi |
| Nama entri config bot uji | Ganti `bot-01` → `bot-uji` **berikut** pindahkan riwayatnya | 19 baris di-`UPDATE`, database di-backup, FTS diverifikasi utuh |
| Protokol terse-turn di sistem lama | Pasang | `telegram` 0.0.37-mirza.0; transkrip CC tidak lagi diisi prosa |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

- ❌ **JANGAN membaca `.superpowers/sdd/task-N-brief.md`** — ada **dua set
  bernama identik**, dan yang di root itu sisa proyek lain yang **tidak
  terlihat salah**. Yang benar ada di `2026-07-31-tahap25-masuk/`.
- ❌ **JANGAN menyapa `fleetd` sebagai sebuah bot untuk diagnosa** — itu memicu
  `drainQueue` dan **memakan antrean offline user** (W-17). bot-01 sudah
  melakukannya dan menghilangkan 4 pesan (dipulihkan lewat
  `UPDATE bot_inbox SET delivered = 0`).
- ❌ **JANGAN blanket-kill proses `bun` yang cocok `src/main.ts`** — command
  line-nya **byte-identik** dengan `fleetd` produksi user. Satu subagent sudah
  membunuhnya. Tangkap PID yang kamu spawn, bunuh PID itu saja.
- ❌ **JANGAN menulis `config.json` tanpa mengunci ulang permission-nya** —
  menulis berkas itu **selalu** mengembalikan ACL warisan (W-13, sudah tiga
  kali). Jalankan `icacls <file> /inheritance:r /grant:r "Mirza:(R,W)"` sesudahnya.
- ❌ **JANGAN menulis `config.json` dengan BOM** — `Set-Content -Encoding utf8`
  di PowerShell menambahkannya dan `fleetd` mati dengan galat parse yang tidak
  menyebut BOM (SCAR-026).
- ❌ **JANGAN pakai `expect(...).rejects` di test yang penyelesaiannya menunggu
  event socket** — di Windows matcher itu menggantung tanpa batas. Pakai
  `try/catch`.
- ✅ **Angka target test di brief lama memakai baseline 69** — sudah usang jauh.
  Baseline sekarang `fleetd` 145 / `cc-plugin` 41.
- ✅ **Verifikasi laporan subagent sendiri.** Dua kali laporan agent akurat, tapi
  satu kali agent-nya membunuh `fleetd` produksi sambil melaporkan bahwa tidak
  ada yang berjalan — ia mengecek path yang salah.
- ✅ **"Sudah saya restart berkali-kali" ≠ "prosesnya hidup".** Yang kedua bisa
  diperiksa; itu yang akhirnya memecahkan W-16.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `19f3de0`; kode HEAD `a52180e`; rentang sesi ini di
  `mirza-bots` = `0605ebe~1..a52180e` (**15 commit**). Dua repo bersih dan
  ter-push.
- **Versi terpasang:** `fleetd` 0.2.0 · `cc-plugin` 0.3.3 · `inline-buttons`
  0.0.10 · `telegram` 0.0.37-mirza.0.
- **Cara menjalankan:** `fleetd` **harus dijalankan user dari terminalnya
  sendiri** (`cd mirza-bots/fleetd && bun run start`) — ia mati kalau
  dijalankan dari proses background sesi Claude Code, sudah terjadi dua kali.
  Restart wajib setiap `config.json` berubah.
- **Bot uji:** `bot-uji`, rumahnya `C:\Users\Mirza\workspace\bot-uji`, token
  bot id `8912773865` — **berbeda** dari bot yang melayani percakapan Telegram
  harian (`8690938443`), jadi tidak ada risiko 409 di antara keduanya.
- **W-15 baru diredam, belum selesai:** `fleetd` mengenali bot lewat **cwd**,
  dan desainnya mengandaikan **satu sesi per home bot** — andaian yang tidak
  pernah ditulis. Dua sesi di folder yang sama akan bentrok lagi.
- **Flake pre-existing (W-12):** `e2e.test.ts` kadang gagal `no such table:
  messages_fts`, ~1 dari 25 run suite penuh. Sudah dibuktikan bukan akibat
  perubahan mana pun. Ulangi run-nya; jangan dikejar.
- **Catatan user:** *"Saya ingin membuat system yang lebih optimal dan
  sederhana… dari sisi setup, instalasi, komunikasi, prompt."* Jadikan itu
  penyaring saat memilih pekerjaan berikutnya.
