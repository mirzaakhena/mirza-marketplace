# Handoff — Lanjutkan brainstorming rebuild `mirza-bots`

- **Date:** 2026-07-29 22:19
- **Repo kerja:** `/Users/mirza/Workspace/mirza-marketplace` (macOS)
- **Branch (HEAD SHA):** `main` @ `a3a9235`
- **Dari → Ke:** sesi `renew-mirza-marketplace` (Claude Opus 5) → sesi lanjutan (aku sendiri, context baru)
- **Lanjutan dari:** —
- **Plan terkait:** belum ada rencana implementasi. Spec arsitektur sudah ada (lihat Referensi).

> Struktur handoff ini memakai template **hasil perampingan** yang disepakati di audit area 08 §8.5 (bukan template 10-seksi lama yang masih terpasang di plugin `handoff`). Itu disengaja.

---

## 1. Tujuan handoff

Melanjutkan **sesi brainstorming** (bukan implementasi) untuk rebuild harness bot Telegram bernama **`mirza-bots`**. Sesi sebelumnya berhenti di 57% context setelah menuntaskan audit 529 kapabilitas + spec arsitektur. User ingin melanjutkan diskusi dengan context segar.

**Yang BUKAN tujuan:** menulis kode. Belum ada satu baris pun kode ditulis, dan itu benar — user masih di tahap desain.

## 2. SUDAH selesai

**Audit fitur lengkap.** Seluruh 529 item inventaris kapabilitas (`docs/2026-07-02-capability-inventory/`) sudah melewati keputusan sadar user, disisir per **area kapabilitas** (14 area), bukan per plugin. Hasilnya 17 keputusan lintas-area (K-1…K-17) dan 8 fitur baru (B-1…B-8).

**Spec arsitektur ditulis dan disetujui per bagian** (topologi, penyimpanan, protokol, tahapan).

**Riset kemampuan Claude Code dilakukan** dan mengubah beberapa keputusan: 30 hook (bukan 4 seperti asumsi desain lama), tidak ada hook yang memberi data context (statusLine satu-satunya sumber), `SessionStart` bisa menyetel nama sesi lewat nilai balik.

**Enam commit sudah di-push** ke `origin/main`: `9d0b5cc` `b304b30` `313b8d3` `c5a02b9` `7e02111` `c97771b` `a3a9235`.

## 3. SEDANG dikerjakan

**Menunggu user me-review spec.** User berkata *"Review spec dulu, baru lanjut"* tapi belum sempat — sesi keburu panjang. Empat bagian yang aku minta ia tantang: §3.2 (kenapa semua logika di `fleetd`), §9 (delapan risiko), §11b (dua asumsi belum terverifikasi), §10 (urutan tahap).

## 4. Blocker

**Tidak ada blocker yang menghentikan diskusi.** Dua hal butuh pembuktian teknis sebelum **implementasi tahap 4**, bukan sebelum brainstorming lanjut:

- **V-1** — apakah `sessionTitle` dari hook `SessionStart` adalah benda yang sama dengan nama sesi yang diubah `/rename`? Kalau **bukan**, penamaan pasca-`/clear` kembali butuh injeksi `/rename` + seluruh pacing SCAR-081, dan tahap 4 jadi jauh lebih berat.
- **V-2** — apa sinyal bahwa `/rename` yang disuntik benar-benar mendarat? Kemungkinan besar **tidak ada**; kalau begitu, `sessions.name` harus disebut jujur sebagai *"nama yang kami minta"*, bukan *"nama yang terpasang"*.

Keduanya bisa dijawab dengan satu hook percobaan dalam hitungan menit. Detail cara verifikasinya ada di spec §11b.

## 5. AKAN dikerjakan

**Goal:** melanjutkan brainstorming sampai user siap masuk implementasi.

**Starting point — tanyakan ke user mana yang ia mau:**

1. **Review spec** (yang tertunda) — user membaca, mengoreksi, lalu disetujui final.
2. **Verifikasi V-1 & V-2** — cepat, dan hasilnya menyederhanakan atau memberatkan tahap 4.
3. **Topik desain yang sengaja ditunda** (belum pernah dibahas tuntas):
   - **B-2** — bot membaca transkrip sesi lama sebagai memori lintas-sesi. User menundanya untuk sesi desain khusus. **Wajib didesain bersama `knowledge-vault`** — keduanya menjawab masalah yang sama, dan membangunnya terpisah menghasilkan dua sistem memori yang tidak saling bicara.
   - **B-8 partial handoff** — disetujui tapi detailnya belum: isi filenya, apa yang terjadi kalau bot tujuan sibuk, dan namanya (*"partial handoff"* menjelaskan mekanisme, bukan maksud — kandidat lain: delegasi, split, spin-off).
   - **B-3** dukungan group Telegram — user ingin membangunnya, tapi bukan sekarang.
   - **B-7** kunjungan sementara ke sesi lama — kandidat kuat sudah terjawab B-2.
   - **Backup** — utang eksplisit, harus dijawab sebelum fleet bergantung pada penyimpanan terpusat.
4. **Rencana implementasi tahap 1** — kalau user sudah puas dengan desainnya.

## 6. Referensi

⚠️ **JANGAN membaca semuanya di awal.** Dokumen audit sangat panjang; membaca semua akan menghabiskan context untuk hal yang belum tentu relevan.

| File | Kapan dibaca |
|---|---|
| `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` | **DI AWAL, wajib.** ~400 baris. Ini kitab arsitekturnya. Kalau cuma sempat satu file, baca ini |
| `docs/2026-07-26-rebuild-audit/README.md` | **DI AWAL, wajib.** Ledger induk: 17 keputusan lintas-area + 8 fitur baru + tabel "apa yang bertahan" + angka yang belum ditetapkan |
| `docs/2026-07-26-rebuild-audit/area-NN-*.md` | **Kondisional.** Hanya saat user membahas area itu, atau saat butuh tahu *kenapa* sebuah fitur diputuskan begitu. Tiap file berdiri sendiri |
| `docs/2026-07-26-rebuild-audit/hook-mapping.md` | Saat membahas penegakan mekanis, hook, atau V-1/V-2 |
| `docs/2026-07-26-rebuild-audit/state-inventory.md` | Saat membahas penyimpanan/state. Berisi 27 artefak state sistem LAMA |
| `docs/2026-07-02-capability-inventory/*.md` | **Hanya saat butuh detail perilaku persis** sebuah fitur lama (529 item, sangat panjang). Ini sumber asal audit |
| `docs/2026-07-03-harness-rewrite-design.md` | **Referensi ide saja, BUKAN kontrak.** Desain rewrite lama yang sudah tidak jadi target (Keputusan #0). Beberapa bagiannya salah — lihat spec §3.1 |
| `docs/2026-07-06-harness-rewrite-playbook.md` | Saat masuk implementasi. Metodologi orkestrasi subagent yang terbukti di rewrite sebelumnya |
| `docs/notes/` | **JANGAN.** User menegaskan: catatan sistem lama, abaikan |

**Kode sistem lama** (`plugins/`) — baca hanya saat perlu memahami perilaku yang sedang diaudit. Sistem lama **tidak relevan** untuk desain baru selain sebagai sumber pelajaran.

## 7. Keputusan user yang FINAL — jangan tanya ulang

| Keputusan | Catatan |
|---|---|
| **`mirza-bots`** = sistem BARU, tidak perlu kompatibel dengan yang lama, tapi **belajar** darinya | Nama repo masih **sementara** |
| **Abaikan bot lama sepenuhnya** | *"tidak perlu peduli dengan bot lama. bukan hal yang sulit bagi saya untuk membuat bot yang baru."* Tidak ada migrasi, impor, atau interoperabilitas |
| **Tanpa Claude Agent SDK / `claude -p`** | Alasan billing. Konstrain mutlak — seluruh mesin PTY adalah *harga*-nya, bukan pilihan |
| **Tiga komponen:** `fleetd` (semua logika, latar belakang) · `mirza-cc` (hanya PTY, di terminal user) · `cc-plugin` (proxy + hook + 1 skill) | `mirza-cc` **menyalakan** `fleetd`, bukan sebaliknya |
| **State di `~/.claude/mirza-bots/`**, dua database (operasional vs percakapan) | Mulai bersih, tanpa impor |
| **Fokus macOS**, Windows tujuan jangka panjang | Jangan sebar cabang `if(windows)` sekarang |
| **Ambang handoff:** pengirim 50% terpakai (relatif) · penerima < 100k terpakai (mutlak) **DAN** tidak sedang bekerja | Sengaja beda satuan — alasannya di area 08 §8.0b |
| **Lingkup v1 = Telegram saja** | `goal`, `teach-me`, `daily-report`, `knowledge-vault`, playbook tidak diikutsertakan |
| `/version` DROP penuh, `react` DROP, `edit_message` DROP, `download_attachment` DROP | Versi hanya terbaca di `/doctor` |

## 8. Anti-Patterns / Lessons — CARRY FORWARD

**Cara kerja yang terbukti di sesi ini** (pertahankan):

1. **Baca kode implementasinya SEBELUM menjelaskan fitur ke user.** Ini yang membuat penjelasan bisa menyebut asal-usul dan harga sebuah fitur, bukan sekadar mengulang inventaris.
2. **Sisir per area kapabilitas, bukan per plugin/file.** Inventaris disusun per mekanisme — itu bagus sebagai kontrak, buruk sebagai bahan diskusi. User sempat *overwhelmed* justru karena itu.
3. **Kelompokkan 3–4 pertanyaan terkait, selalu dengan rekomendasi + alasan.** Jangan survei kosong. Sertakan nomor kode fitur (TG-xxx, SKILL-xxx) supaya user tahu ini tentang apa.
4. **Tulis keputusan ke dokumen SEGERA** setelah dijawab, jangan menumpuk. Itu yang membuat penyisiran ulang mungkin dan membuat sesi bisa diputus kapan saja.
5. **Sebut risiko sebagai risiko**, bukan disamarkan jadi kemenangan. User menghargai ini dan beberapa kali mengubah keputusan karenanya.

**Kesalahan yang sudah terjadi — jangan ulangi:**

6. **Aku pernah menulis keputusan yang tak pernah dijawab user** ke dalam spec (auto-start `fleetd`) karena pertanyaannya tertahan lalu percakapan berbelok. Kalau sebuah pertanyaan tidak terjawab, **jangan diasumsikan** — catat sebagai terbuka.
7. **Aku pernah menyatakan asumsi sebagai fakta** (bahwa `sessionTitle` = nama sesi `/rename`). Ketahuan saat self-review. Selalu bedakan "terdokumentasi" dari "disimpulkan".
8. **Aku pernah melebih-lebihkan sebuah masalah** ("state handoff mati bersama reset") — user membantah dengan benar dan aku harus mengoreksi. Periksa klaim sebelum memakainya sebagai alasan desain.
9. **Dua keputusan user bisa saling meniadakan tanpa disadari** — kriteria "sesi tak pernah dinamai" vs penamaan otomatis mesin. Cari kontradiksi antar-keputusan secara aktif.
10. **Satu jawaban singkat bisa menjawab beberapa pertanyaan sekaligus dan menyembunyikan keputusan besar.** Kata *"drop"* ternyata berarti "tidak diikutsertakan", dan di baliknya ada keputusan lingkup yang jauh lebih besar (marketplace BARU). Curigai jawaban singkat yang menjawab banyak hal.

**Tentang user (penting):**

11. **User sering multitasking dan lupa keputusan sebelumnya** — ia menyatakannya sendiri. **Jangan menunggu diminta**: setelah rangkaian keputusan panjang, sisir ulang dan tawarkan daftar hal yang layak dikonfirmasi. Tersimpan juga di memory `feedback-reconfirm-decisions`.
12. **User menjawab dengan tombol dan sering memilih "Rekomendasi"** — itu berarti kualitas rekomendasi menentukan kualitas keputusan. Rekomendasi harus benar-benar dipikirkan, bukan pilihan pertama yang aman.
13. **User berbahasa Indonesia** dan menghargai penjelasan gaya *teach-me* (mulai dari fundamental, contoh konkret, tanpa tabel berat di Telegram).

**Aturan repo yang berlaku** (`CLAUDE.md`):

14. Cek `git rev-parse --show-toplevel` sebelum commit. Kalau di bawah `~/.claude/plugins/` → **STOP**, itu salinan read-only yang bisa di-reclone kapan saja (pernah menghapus ~25 commit).
15. Commit bawa trailer `Agent: <nama>`, dan **push segera** — commit lokal yang belum di-push adalah kandidat hilang.
16. Perubahan pada `plugins/**` wajib melewati checklist 5 poin di `CLAUDE.md`. **Sesi ini tidak menyentuh `plugins/` sama sekali** — hanya `docs/` dan `.handoff/`.
