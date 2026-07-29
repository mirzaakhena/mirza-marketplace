# Audit Fitur untuk Rebuild — Ledger Induk

- **Mulai:** 2026-07-26
- **Sesi:** `renew-mirza-marketplace`
- **Sumber yang diaudit:** `docs/2026-07-02-capability-inventory/` (529 item: TG-189, PTY-114, BUS-47, SKILL-82, SCAR-97)
- **Bentuk kerja:** user + AI menyisir fitur per **area kapabilitas** (bukan per file). Untuk tiap area, AI membaca kode implementasinya lebih dulu, menjelaskan fungsi + asal-usul + biayanya, lalu user memberi verdict.

## Keputusan #0 — Target build

**FRESH BUILD, ARSITEKTUR DIPUTUSKAN BELAKANGAN.** (user, 2026-07-26)

Rewrite `mirza-harness` (`docs/2026-07-03-harness-rewrite-design.md`, arsitektur `hostd` + `pty-holder` + `cc-stub`) **tidak** dijadikan target. Alasan: keputusan arsitektur itu dibuat 2026-07-03, *sebelum* audit fitur ini dilakukan — jadi ia mengasumsikan mayoritas 529 item ikut pindah. Audit ini justru mempertanyakan asumsi itu. Arsitektur baru disusun **setelah** verdict per fitur terkumpul.

Catatan faktual: repo `mirza-harness` tidak ada di mesin ini (macOS); seluruh dokumen fase 0/1/2 berpath Windows. Dokumen-dokumen itu tetap dipakai sebagai **referensi ide**, bukan sebagai kontrak.

## Keputusan lintas-area (berlaku untuk seluruh rebuild)

Keputusan yang muncul saat mengaudit satu area tapi mengikat semua area. Detail + alasan ada di file area asalnya.

| # | Keputusan | Asal |
|---|---|---|
| **K-1** | **Semua state & config terpusat di `~/.claude/mirza-bots/`.** Repo kerja 100% bersih dari artefak bot; `<project>/.claude/channels/` hilang. Pengecualian: `.handoff/` + `.daily-reports/` tetap di repo (artefak pekerjaan, bukan artefak bot). Kaitan bot ↔ state lewat **nama**, bukan lokasi folder. | area 01 §1.7 |
| **K-2** | **Fleet declarative.** Bot didaftarkan di config (nama eksplisit + folder home + token), bukan lewat konvensi basename folder atau skill setup per-project. Jumlah bot & lokasi home bebas. | area 01 §1.8 |
| **K-3** | **Satu `messages.db` untuk semua bot**, berkolom `bot`. Default baca = percakapan sendiri; mengintip bot lain lewat tool eksplisit. | area 01 §1.9 |
| **K-4** | **Semua skill setup dibuang** (`/telegram:access`, `/telegram:configure`). Konfigurasi = edit satu file JSON. | area 01 §1.1 |
| **K-5** | **Aturan yang bisa dijamin mesin, dijamin mesin — bukan diminta ke AI lewat teks skill.** Diterapkan pertama pada tombol "Jelaskan manual" (ditambahkan server) dan penolakan pertanyaan tanpa tombol. Teks skill yang memohon AI mengingat aturan yang sudah dijamin mesin **dihapus**, bukan dibiarkan sebagai cadangan — dua sumber aturan = sumber selisih. | area 04 §4.4, §4.5 |
| **K-7** | **Status lifecycle bot adalah DATA, bukan string di dalam nama sesi.** Konvensi `idle` / `task-*` / `done-*` pensiun; nama sesi kembali jadi label bebas untuk manusia. Menjalar ke handoff, agent-bus, dan wrapper. | area 05 §5.4 |
| **K-8** | **Tidak ada transkrip yang dihapus.** Kebersihan daftar diselesaikan dengan *penyembunyian otomatis* sesi remeh, bukan penghapusan — karena transkrip lama adalah bahan bakar memori jangka panjang (K-3/B-2). | area 05 §5.2, §5.3 |
| **K-17** | **Marketplace BARU, yang lama tidak disentuh.** Rebuild dibangun sebagai repo/marketplace terpisah; `mirza-marketplace` beserta 11 plugin-nya **tetap berjalan apa adanya** dan tidak diubah, tidak dihapus, tidak dimigrasi. "DROP" di seluruh dokumen audit berarti **tidak diikutsertakan di sistem baru** — bukan dihapus dari yang lama. | user 2026-07-27 |
| **K-14** | **Pemegang koneksi token Telegram hidup DI LUAR sesi Claude Code** — satu program terpisah yang terus hidup memegang 6 penanya untuk 6 token. Menghapus enam tambalan zombie/409 secara struktural. Harganya: butuh pengawas yang menyalakannya ulang, dan kalau ia mati semua bot bisu sekaligus. | area 14 §14.1 |
| **K-15** | **Kontrak yang dipakai lebih dari satu komponen hanya boleh punya SATU salinan.** Tidak ada lagi duplikasi "supaya tidak saling bergantung" — itu sudah terbukti menyimpang tanpa disadari. | area 14 §14.4 |
| **K-16** | **Bahasa:** kode/komentar/README/error teknis = Inggris · pesan AI ke user = ikut bahasa user · pesan mesin ke user = Indonesia. | area 14 §14.8 |
| **K-13** | **Lingkup rebuild v1 = harness Telegram saja.** Apa pun yang tidak menyangkut bot Telegram tidak diikutsertakan: `teach-me`, `daily-report`, `knowledge-vault`, playbook. Bukan penilaian mutu, dan **bukan penghapusan** — keempatnya tetap hidup di marketplace lama (K-17). | area 13 §13.0 |
| **K-9** | **Konstrain induk TETAP: tanpa Claude Agent SDK / `claude -p`** — seluruh pemakaian lewat TUI interaktif (alasan billing). Seluruh mesin PTY/antrean/gate/barrier adalah *harga* konstrain ini, bukan pilihan desain. | area 06 §6.0 |
| **K-10** | **PTY untuk input, hook untuk output.** Kebenaran tentang sesi dilaporkan Claude Code lewat hook (`SessionStart`), tidak di-scrape dari filesystem privatnya. Keystroke hanya untuk slash lifecycle. Setiap jalur hook wajib punya alarm bila diam — "setiap kegagalan harus terlihat". | area 06 §6.3 |
| **K-11** | **Daftar putih, bukan daftar hitam**, untuk apa yang boleh disuntik AI ke sesinya sendiri. Gagal ke arah aman. Setiap penolakan wajib mengajari alternatif yang benar. | area 06 §6.6 |
| **K-12** | **Tidak ada shim kompatibilitas.** Migrasi "matikan semua, ganti semua" — tak ada periode fleet campuran. | area 06 §6.4 |
| **K-18** | **`/rename` dihapus total dari injeksi keystroke PTY**, dipindah ke hook `UserPromptSubmit` → `sessionTitle` (jalur apply sama dengan `SessionStart`, dibuktikan §11b V-1). Menghapus seluruh pacing SCAR-081 untuk kasus mid-sesi, bukan cuma pasca-`/clear`. | spec §5.4/§11b, user 2026-07-29 |
| **K-6** | **Permukaan tool ke AI ditekan seminimal mungkin.** Dari 5 tool telegram tinggal 2 (`reply`, `get_message_by_id`). Setiap tool yang hilang juga menghapus paragraf penjelasannya dari konteks setiap sesi. | area 02 §2.2, area 03 §3.1 |

## Fitur baru / permintaan yang muncul selama audit

| # | Permintaan | Status | Asal |
|---|---|---|---|
| **B-1** | Tool `peek_conversation` — bot mengintip percakapan bot lain | Disetujui, desain menyusul | area 01 §1.9 |
| **B-2** | Bot membaca transkrip sesi lama (`~/.claude/projects/*.jsonl`) sebagai memori lintas-sesi | **DEFER** — sesi desain terpisah, bersinggungan dengan vault/second-brain & "anti lupa" | area 01 §1.A |
| **B-3** | Dukungan group Telegram | **DEFER** — user ingin membangunnya, tapi tidak sekarang | area 01 §1.2 |
| **B-4** | Server menambahkan tombol "Jelaskan manual" secara mekanis di setiap prompt berbutton | Disetujui | area 04 §4.4 |
| **B-5** | Server menolak `reply` berupa pertanyaan yang tidak membawa tombol | Disetujui | area 04 §4.5 |
| **B-6** | Penyembunyian otomatis sesi remeh (giliran sedikit + tak pernah dinamai; ambang token menyusul) | Disetujui, ambang token terbuka | area 05 §5.2 |
| **B-7** | Riwayat sesi per bot yang bisa "dikunjungi sementara" untuk menggali info lama | Dicatat, belum didesain — kandidat kuat sudah terjawab oleh B-2 | area 07 §B-7 |
| **B-8** | **Partial handoff** — delegasikan sepotong pekerjaan ke bot lain yang jadi pemilik mandiri; user berdiskusi langsung dengannya; bot utama tetap jalan; wajib worktree terpisah; tanpa kewajiban lapor balik | Disetujui, detail desain menyusul | area 08 §8.C |

## Kosakata verdict

| Verdict | Arti |
|---|---|
| **KEEP** | Dipertahankan apa adanya; perilakunya sudah benar dan sepadan biayanya. |
| **SIMPLIFY** | Fungsinya tetap, implementasinya dipangkas (knob dibuang, cabang dikurangi, angka di-hardcode). |
| **MERGE** | Fungsinya tetap tapi rumahnya pindah/menyatu dengan fitur lain. |
| **DROP** | Dibuang. Wajib disertai alasan. |
| **MODIFY** | Perilakunya diubah berdasarkan pengalaman pemakaian. |
| **DEFER** | Belum diputuskan; dicatat supaya tidak hilang. |

## Peta area

| # | Area | Item inventaris | Status |
|---|---|---|---|
| 01 | Akses & keamanan channel | TG-002, 067, 070, 091–100, 142–145, 156, 173–174, 186–187; SCAR-024, 026, 087, 091, 095 | ✅ selesai |
| 02 | Pesan masuk & media | TG-084, 101–121; SCAR-012, 054, 055, 056, 088 | ✅ selesai |
| 03 | Pesan keluar & formatting | TG-065–090, 124, 139; SCAR-046–049, 053, 060, 062 | ✅ selesai |
| 04 | Tombol inline & permission prompt | TG-068, 069, 078, 101, 102, 122–132; SCAR-051, 052, 058, 062, 090 | ✅ selesai |
| 05 | Manajemen sesi (new/switch/rename/delete) | TG-017–055, 150, 175–185; PTY-068, 076; SCAR-039, 040, 051, 052, 079, 081, 082 | ✅ selesai |
| 06 | Injeksi PTY & lifecycle wrapper | PTY-001–114; SCAR-001–009, 016, 019–023, 025, 027, 029–039, 044, 045, 066–068, 071, 072, 074, 075, 086, 096 | ✅ selesai |
| 07 | Komunikasi antar-bot | BUS-001–047; PTY-038; SCAR-038, 043, 044, 069, 070 | ✅ selesai |
| 08 | Handoff | SKILL-001–032 | ✅ selesai |
| 09 | Goal | SKILL-033–044; TG-058 | ✅ selesai — **seluruh plugin DROP** |
| 10 | Disiplin balas (hook + skill) | TG-124, 159–164, 188; SKILL-045–065; SCAR-092, 093 | ✅ selesai |
| 11 | `/context`, `/version`, statusline | TG-001–016, 059–064, 165–170; SCAR-017, 041, 059, 076, 084 | ✅ selesai |
| 12 | Penyimpanan & observability | TG-133–140, 171–172; SCAR-024, 060, 097 | ✅ selesai |
| 13 | Skill konten (teach-me, daily-report, vault) | SKILL-066–082; SCAR-094 | ✅ selesai — **semua DROP dari v1 (di luar lingkup Telegram)** |
| 14 | Ketahanan proses & sisa scar tissue | SCAR-013, 014, 015, 018, 028, 042, 050, 061, 063–065, 077, 078, 089 | ✅ selesai |

Keputusan per area ditulis di `area-NN-<slug>.md`.

---

# Hasil audit — gambaran sistem yang bertahan

**Audit 14 area selesai 2026-07-26.** Semua 529 item inventaris sudah melewati keputusan sadar.

## Perintah Telegram: 13 bentuk → **6**

`/new <nama>` · `/rename <nama>` · `/switch` · `/context` · `/handoff` · `/help`

**Dibuang:** `/delete` · `/delete hard` · `/delete all` · `/delete hard all` · `/effort` · `/version` · `/start` · `/goal`

## Tool yang dilihat AI: 8 → **9** (tapi isinya berubah)

**Bertahan:** `reply` (tanpa param `format`, tanpa `edit_message`) · `get_message_by_id` · `pty_send_slash` (daftar putih) · `pty_status` · `agent_list` · `agent_status` · `agent_send`

**Dibuang:** `download_attachment` · `edit_message` · `react` · `pty_list_agents`

**Baru:** `peek_conversation` (B-1) · pencarian teks penuh (area 12 §12.4)

## Plugin: 11 → **1 plugin + 1 skill + 1 program terpisah**

| Sekarang | Menjadi |
|---|---|
| `telegram`, `pty-controller`, `agent-bus` | melebur ke **program terpisah** (K-14) + **plugin tipis** di Claude Code (MCP + hook) |
| `immediate-reply`, `inline-buttons`, `bot-conduct`, `name-session` | melebur jadi **satu skill** yang dimuat otomatis (`telegram-conduct`) |
| `handoff` | tetap — isi ditulis AI, **urutan & batas waktu dijaga mesin** |
| `goal`, `teach-me`, `daily-report`, `knowledge-vault` | **DROP dari v1** |

## Aturan perilaku yang naik jadi jaminan mesin

| Dulu diminta lewat teks | Sekarang dijamin mesin |
|---|---|
| "sertakan tombol Jelaskan manual" | Server menambahkannya sendiri |
| "pertanyaan harus berbutton" | Server menolak `reply` yang bertanya tanpa tombol |
| "kirim ack sebelum tool pertama" | Hook menolak tool pertama sebelum ada ack |
| "kirim jawaban final lewat reply" | Hook `Stop` — **bug FUNC-3 difix**: ack tidak lagi dihitung sebagai jawaban |
| "namai sesimu" | Mesin menjamin ada nama, AI yang mengarang |
| "jangan lupa batalkan timeout handoff" | State handoff jadi data, timeout jadi alarm mesin |
| "commit bawa nama bot" | Sudah mekanis — **plus tutup bypass PowerShell (FUNC-4/5)** |

## Kelas kerumitan yang hilang secara struktural

| Yang hilang | Karena |
|---|---|
| Mesin pairing + 2 skill setup + watcher + slash-menu dua-audience | Allowlist terpusat (K-1) |
| Dukungan group setengah-jadi | DROP sadar (B-3 ditunda) |
| 6 tambalan zombie/409 | Penanya token keluar dari sesi CC (K-14) |
| Lockfile busy-wait yang **membekukan keystroke user** | Registry pensiun (K-1/K-2) |
| Polling `~/.claude/projects/` tiap 500 ms | Hook `SessionStart` (K-10) |
| Sniffer keystroke `/rename` + klaim nama `idle` + self-reset 3-injeksi | Lifecycle jadi data (K-7) |
| Perataan newline + batas 8 KB + chunking untuk prompt antar-bot | Transport pindah ke notifikasi channel (area 07 §7.1) |
| Marker atribusi yang bisa dipalsukan (SEC-4) | Metadata terstruktur (area 07 §7.2) |
| Seluruh shim kompatibilitas + mirror legacy | Migrasi serentak (K-12) |
| 3 knob config + mode static + 5 handler media + parameter `format` | Tidak pernah dipakai |
| Mesin permission prompt | Sudah mati karena `--dangerously-skip-permissions` |
| Kode kembar yang bisa menyimpang | Satu salinan (K-15) |

## Angka yang belum ditetapkan (butuh data, bukan pendapat)

| # | Angka | Konteks |
|---|---|---|
| 5.A | Ambang token "sesi remeh" | area 05 §5.2 — mulai dengan 2 kriteria pasti dulu |
| 8.B | Ambang **sisa token** pemicu tawaran handoff | area 08 §8.2 — dasar berubah dari persen ke sisa token |
| 10.C | N giliran sebelum mesin menamai sesi | area 10 §10.C |
| 12.3 | N hari retensi `inbox/` | area 12 §12.3 |

Semuanya dijadikan **konfigurasi**, bukan konstanta — supaya bisa disetel tanpa rilis ulang.

## Tugas wajib di tahap arsitektur

1. **Petakan 30 hook Claude Code** ke tiap kewajiban mekanis (area 11 §11.0). Beberapa keputusan bisa jadi lebih sederhana — khususnya `PreCompact` untuk menyelamatkan designation handoff, dan `PostToolUse` untuk penjaga jawaban final.
2. **Turunkan ulang jaminan atomisitas batch** secara eksplisit — sekarang bergantung pada single-thread Node (ambiguitas #1 inventaris).
3. **Putuskan bentuk kanal ephemeral** (`pending/`, `system-outbox/`): file, tabel, atau in-process.
4. **Putuskan "hapus-sebelum-proses" vs "rename ke `processing/`"** (SCAR-068).
5. **Kalibrasi ulang SEMUA konstanta pacing** — tidak boleh diasumsikan portabel (area 06 §6.2).
6. **Satukan ambang liveness 30 detik** yang sekarang dipakai tiga pembaca (SCAR-010).
