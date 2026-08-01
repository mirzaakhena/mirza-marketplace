# BACKLOG — rebuild fleetd/cc-plugin

**Dibuat:** 2026-07-31 · **Terakhir diperbarui:** 2026-07-31

---

# Bagian 0 — MULAI DARI SINI

> **Ini berkas pegangan tunggal untuk seluruh rebuild.** Kalau kamu sesi baru
> dan cuma diberi satu instruksi ("baca `BACKLOG.md`"), itu memang cukup —
> segala hal lain yang kamu butuhkan ditunjuk dari sini.
>
> Berkas ini **hidup**: ia berubah setiap ada kemajuan. Blok "Kondisi sekarang"
> di bawah wajib diperbarui setiap sesi yang mengubah keadaan.

## Kondisi sekarang

*(Blok ini yang paling sering basi. Perbarui SEBELUM sesi berakhir.)*

| | |
|---|---|
| **Tahap berjalan** | Tahap 2.5 — **MASUK SELESAI** (kode + rilis + uji live sebagian). Berikutnya **KELUAR**, tapi pertimbangkan **W-10** dulu |
| **Spec aktif** | `docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` |
| **Rencana aktif** | `docs/superpowers/plans/2026-07-31-tahap25-masuk.md` |
| **Status** | Task 1 & 2 SELESAI (kode `c82de8f`, review bersih). **Task 0 (verifikasi Windows) SELESAI 2026-07-31** — `fleetd` **jalan di Windows**, `doctor` `"ok": true`. Temuan harness diperbaiki di `0605ebe` (test-only), cacat kode W-4 diperbaiki di `b0cc2f5`. **Task 3 (quote-reply masuk, TG-111) SELESAI** — `8009178`. **Task 4 (toleransi unduhan gagal, TG-105) SELESAI** — `a94da07`. **Task 5 (pengerasan album) SELESAI** — `1123446`. **Task 6 (handler dokumen) SELESAI** — `300bf0c`. **Task 7 (dua tool MCP: `read_history` + `search_history`) SELESAI** — `48197b6`; ini juga **menutup B-1 `peek_conversation`** lebih awal dari Tahap 6. fleetd **116/116**, cc-plugin **27/27** hijau di Windows. Sisa W-3, W-7, W-9 di Bagian 7, ketiganya tidak memblokir. **Sisa hanya Task 8** (rilis + uji live bersama user — butuh user, tidak bisa didelegasikan). |
| **Handoff terakhir** | `.handoff/202608010131-status-tahap25-masuk-selesai-di-windows.md` — 2.5-MASUK selesai, sisa 5 pemeriksaan live + W-10 |
| **Selesai terakhir** | Tahap 2 Task 10 (uji live) · B-9 giliran ringkas (`cc-plugin` 0.2.1, terverifikasi hidup) |
| **Berikutnya setelah MASUK** | 2.5-KELUAR, lalu 2.5-GUARD, lalu Tahap 3 |

## Utang yang harus dibayar sebelum tahap berikutnya

*(Hal yang sudah diketahui tapi belum dikerjakan, dan mudah terlupa karena
bukan bagian dari tahap manapun.)*

- **42 item `BUTUH KEPUTUSAN`** — Bagian 4 & 6. Yang paling mendesak: rumah skill
  `telegram-conduct` (rumah belasan aturan, tidak dimiliki tahap manapun).
  Disepakati dibereskan **bersama perencanaan Tahap 3**, bukan lebih awal.
- **2 kontradiksi antar-dokumen** — Bagian 4 Kelompok B. (Kontradiksi ketiga,
  FTS5, sudah ditutup 2026-07-31.)
- **Penegakan permission `0600`** pada `config.json` oleh kode — sudah ditambal
  manual, penegakannya ada di 2.5-GUARD.
- **⚠️ Celah desain baru (ditemukan 2026-07-31, belum tercatat di mana pun):**
  spec §5 baris 102 memutuskan `bot-cc` menyalakan `fleetd` **bila belum
  berjalan** — jadi pemulihannya terjadi **saat bot dibuka**. Itu tidak menutup
  kasus `fleetd` mati **di tengah jalan sementara bot tetap terbuka**: tidak ada
  yang menyalakannya lagi sampai user kebetulan membuka bot berikutnya, dan bot
  yang sedang terbuka jadi bisu **tanpa pemberitahuan apa pun**. Terjadi dua kali
  nyata pada 2026-07-31. Alarm `doctor` (area-12 §12.5) memang dirancang untuk
  ini, tapi belum dibangun dan belum jelas siapa yang menjalankannya secara
  berkala. **Perlu diputuskan bersama perencanaan Tahap 4** (rumah `bot-cc`).
  Sementara itu: `fleetd` dijalankan manual dari terminal user sendiri, bukan
  dari sesi Claude Code — proses background sesi ikut mati saat sesi dibersihkan.

## Peta berkas — apa dibaca kapan

| Berkas | Perannya | Kapan dibaca |
|---|---|---|
| **`BACKLOG.md`** (ini) | Checklist induk + kondisi sekarang | **Selalu, pertama** |
| `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` | Arsitektur (`fleetd`/`bot-cc`/`cc-plugin`) + peta 6 tahap (§10) | Saat butuh tahu *kenapa* sesuatu dirancang begitu, atau urutan tahap |
| `docs/2026-07-26-rebuild-audit/README.md` | Ledger keputusan K-1..K-18 + permintaan B-1..B-10 | Saat menyentuh keputusan lama, atau sebelum memutuskan hal baru yang mungkin sudah diputuskan |
| `docs/2026-07-26-rebuild-audit/area-01..14-*.md` | Inventaris fitur asli + verdict per fitur | Saat butuh alasan lengkap satu baris backlog |
| `docs/2026-07-26-rebuild-audit/2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md` | Gap area 01-04 vs kode nyata | Saat mengerjakan Tahap 2.5 |
| `docs/2026-07-26-rebuild-audit/2026-07-31-ekstraksi-area-05-14.md` | Item area 05-14 (belum disilangkan ke kode) | Saat merencanakan Tahap 3-6 |
| `docs/superpowers/specs/` + `docs/superpowers/plans/` | Spec & rencana per sub-proyek | Sesuai "Spec/Rencana aktif" di atas |
| ⚠️ `.superpowers/sdd/2026-07-31-tahap25-masuk/` | Ledger progres + brief tiap task | Sebelum mengerjakan task. **Ada DUA set `task-N-brief.md` bernama identik** — yang benar ada di folder ini; yang di `.superpowers/sdd/` (root) sisa proyek lain (`packages/shared`, `bot-03`, "fase 0") dan **tidak terlihat salah**: bentuknya sama persis, lengkap dengan langkah TDD berkotak-centang. Nyaris menjebak 2026-07-31. Selalu buka dengan path lengkap |
| `.handoff/` | Kondisi antar-sesi | Di awal sesi lanjutan |
| `CLAUDE.md` (root repo) | Aturan repo + checklist rilis plugin lama | Sebelum menyentuh `plugins/**` |
| `mirza-bots/README.md` | Apa yang benar-benar ada di kode + prosedur pasang/update `cc-plugin` | Sebelum menjalankan atau merilis |

**Repo:** dokumen di `/Users/mirza/Workspace/mirza-marketplace` (punya remote,
push). Kode di `/Users/mirza/Workspace/mirza-bots` (**tanpa remote** — commit
lokal saja, jangan pernah `git push` di sana).

**JANGAN dibaca:** `docs/notes/` — sistem lama, tidak relevan.

## Aturan keempat — temuan baru wajib masuk ke sini

Tiga aturan di bawah menjaga item yang **sudah** terdaftar. Aturan ini menjaga
yang **belum**:

4. **Setiap fitur, gap, atau keputusan yang baru ditemukan dicatat ke berkas ini
   pada commit yang sama saat ia ditemukan** — sekalipun tidak akan dikerjakan
   sekarang. Kalau belum jelas milik tahap mana, taruh di Bagian 6 dengan status
   `BUTUH KEPUTUSAN`; jangan dibuang, jangan ditebak diam-diam.

**Kenapa aturan ini ada:** dua fitur (quote-reply B-10, indikator typing TG-103)
lolos dari seluruh Tahap 1-2 dan baru ketahuan karena user kebetulan
mengingatnya — bukan karena ada mekanisme yang menangkapnya. Berkas ini menutup
risiko itu untuk 313 item yang sudah terdaftar; aturan keempat inilah
satu-satunya yang menutupnya untuk yang ke-314. **Ia bergantung pada disiplin,
bukan mekanisme** — jadi ditulis di depan, bukan dikubur di bawah.

---

## Kenapa file ini ada

Sistem lama sedang ditulis ulang mengikuti peta jalan 6 tahap (lihat `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` §10). Tapi checklist fitur sebenarnya tersebar di 14 file audit terpisah, dan tak satu pun dari file itu punya kolom status. Akibatnya fitur bisa lolos tak dibangun tanpa ada yang sadar — sudah terjadi dua kali, lalu satu rekonsiliasi menyeluruh menemukan 19 gap lagi yang lolos diam-diam. File ini adalah penawarnya: **satu tempat** yang menjawab "apa yang belum dikerjakan untuk tahap yang mau saya bangun?" Kalau file ini gagal dipakai — kepanjangan, atau tak bisa di-update — masalah yang sama akan kembali. Utamakan **bisa dipakai** di atas lengkap-berbunga.

## Tiga aturan pakai (menonjol, karena ini yang paling sering dilanggar)

1. **Tidak ada tahap boleh dinyatakan selesai** sebelum semua barisnya berstatus final (SELESAI / TIDAK RELEVAN / DITUNDA-dengan-alasan-tertulis).
2. **Status diperbarui di commit yang sama** dengan kode yang merilisnya — jangan ditunda ke "nanti".
3. **Setiap rencana tahap baru dimulai dari file ini**, bukan dari §10 spec. §10 tetap peta urutan tahap, bukan checklist kerja.

## Catatan jujur soal keandalan status

- **Area 01–04** (Tahap 1–3-ish dari sistem lama yang sudah sempat dibangun): statusnya **faktual** — hasil membaca langsung kode `fleetd/src/` dan `cc-plugin/src/` per 2026-07-31 (lihat `2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md`).
- **Area 05–14**: statusnya **belum pernah dicek ke kode** — tahap-tahap itu memang belum dibangun. Status `BELUM` di sana berarti *"belum diperiksa maupun dibangun"*, bukan hasil verifikasi negatif. Begitu tahapnya mulai dibangun, baris-barisnya wajib direkonsiliasi ulang ke kode nyata seperti yang dilakukan untuk area 01-04 — jangan asumsikan `BELUM` tetap akurat tanpa dicek ulang.

## Aturan hitung (dipakai konsisten di seluruh file ini)

Satu baris = satu entri keputusan di dokumen sumber (satu baris tabel, atau satu verdict setingkat-§ bila seksi itu tidak bertabel) — aturan yang sama dipakai dokumen ekstraksi area 05-14. **Bagian 3 dan Bagian 4 adalah tampilan (view), bukan inventaris** — semua baris yang dihitung ada di Bagian 5 dan Bagian 6 saja; Bagian 3/4 hanya menunjuk-silang ke baris yang sama supaya tidak dihitung dua kali.

---

## Bagian 2 — Ringkasan status per tahap

| Tahap | Item | SELESAI | SEBAGIAN | BELUM | Lainnya | Status tahap |
|---|---:|---:|---:|---:|---|---|
| 1 — Fondasi | 30 | 4 | 0 | 24 | 2 TIDAK RELEVAN | Sebagian besar fondasi state/config sudah SELESAI; `doctor`, liveness terpadu, dan retensi/permission file masih kosong total. |
| 2 — Jalur pesan | 32 | 5 | 4 | 22 | 1 TIDAK RELEVAN | Pipa dasar (allowlist, auto-download foto) jalan, tapi gap terbesar sistem baru ada di sini: `message_id` tak tersimpan, chunking tak ada, quoting tak ada. |
| 3 — Penegakan | 21 | 1 | 0 | 20 | — | Hampir seluruhnya belum dibangun — hanya ack-tap-tombol yang sudah SELESAI; validasi tombol, prefiks `ai:`, dan penegakan mesin (ack/Stop-guard) masih nol. |
| 4 — Sesi | 90 | 0 | 0 | 90 | — | Belum mulai dibangun sama sekali (tahap terbesar dari segi jumlah item — wrapper PTY, injeksi, statusline bridge, `/context`). |
| 5 — Antar-bot | 82 | 0 | 0 | 82 | — | Belum mulai — mencakup seluruh agent-bus dan mesin handoff data-driven. |
| 6 — Sisanya | 17 | 0 | 0 | 16 | 1 BUTUH KEPUTUSAN | Belum mulai; satu item (B-6, penyembunyian sesi remeh) terkunci kontradiksi kriteria antar-dokumen. |
| **Tanpa tahap** | 41 | 0 | 0 | 0 | 41 BUTUH KEPUTUSAN | Perlu keputusan manusia sebelum bisa masuk tahap manapun — lihat Bagian 4 & 6. |

**Total item di file ini: 313** (41 dari rekonsiliasi area 01-04 + 272 dari ekstraksi area 05-14).

### Tahap 2.5 — pecahan kerja (diputuskan user 2026-07-31)

Tahap 2 dinyatakan "selesai" sebelum file ini ada, lalu rekonsiliasi menemukan
sisanya masih besar. Sisa itu dipecah jadi tiga sub-proyek supaya tiap satu
menghasilkan sesuatu yang utuh dan bisa diuji sendiri. **Urutan yang dipilih
user: MASUK → KELUAR → GUARD.**

| Sub-proyek | Isi | Urutan |
|---|---|---|
| **2.5-MASUK** | `message_id`+`metadata` disimpan (akar) · handler `message:document` **berikut** `safeName()` · catch-all lampiran tak didukung · quote-reply masuk (TG-111) · pengerasan album (cap 10, sort by `message_id`, `Promise.allSettled`, aturan caption) · unduh gagal per-item tidak menjatuhkan seluruh pesan | **1** |
| **2.5-KELUAR** | Konversi CommonMark→MarkdownV2 · mesin chunking · logging balasan ke `conversations.db` (TG-081) · pengiriman lampiran keluar (TG-070/071/079 + TG-069) · quote-reply keluar (TG-077) · hasil `sent (id: N)` (TG-082) · keyboard hanya di chunk terakhir (TG-078) | 2 |
| **2.5-GUARD** | Typing indicator (TG-103) · config korup → `.corrupt-<ts>` (TG-156) · penegakan permission 0600 file token oleh `fleetd` (SCAR-024) · tool `get_message_by_id` · `peek_conversation` (B-1) | 3 |

**Catatan penamaan:** sub-proyek ini sengaja dinamai MASUK/KELUAR/GUARD, bukan
A/B/C — "B-N" di repo ini sudah berarti item ledger permintaan fitur, dan
"antar-bot" adalah Tahap 5. Penamaan A/B/C sempat dipakai dan langsung
menimbulkan kebingungan.

**Tidak termasuk 2.5** (tetap Tahap 3): semantik tombol — validasi boundary,
prefiks `ai:`, resolusi label saat tap, hapus keyboard setelah tap, tombol
"Jelaskan manual" (B-4), penolakan pertanyaan-tanpa-tombol (B-5).

**Sudah ditutup di luar sub-proyek:** permission `config.json` disetel manual ke
`0600` pada 2026-07-31 (sebelumnya `0644` — token SELURUH armada bisa dibaca
proses mana pun di mesin itu). Penegakannya oleh kode tetap ada di 2.5-GUARD.

**Kontradiksi FTS5 (Bagian 4 Kelompok B #2) SUDAH TERJAWAB** oleh fakta lapangan,
2026-07-31: `conversations.db` sungguhan sudah punya tabel `messages_fts` beserta
ketiga trigger sinkronisasinya — jadi §12.4 ("wajib sejak awal") sudah menang,
skemanya terbangun di Tahap 1. Yang tersisa untuk Tahap 6 hanya *tool*
pencariannya. Bukan lagi keputusan terbuka.

---

## Bagian 3 — Blokir struktural

Akar-akar ini masing-masing memblokir banyak item sekaligus. Baris di tabel ini adalah **rujukan silang** ke item yang sudah dihitung di Bagian 5/6 — bukan item tambahan.

| Akar | Memblokir | Tahap terdampak |
|---|---|---|
| **`message_id` pesan masuk tak tersimpan** (gap ditemukan pass rekonsiliasi 01-04) | `get_message_by_id` · fallback album TG-139 · sort album SCAR-055a · outbound quoting TG-077 · quote-reply masuk TG-111/B-10 | 2 |
| **Statusline bridge** (area-11 §11.1) | `/context` (6 item) · field context/window/biaya di `agent_status` (§7.5) · ambang PENGIRIM 50% handoff (§8.B) · ambang PENERIMA <100k (§8.2b) | 4, dikonsumsi terberat di 5 |
| **K-7 — lifecycle jadi field data** (area-05 §5.4) | §5.4 sendiri · status kerja `agent_status` (§7.5) · syarat "tidak sedang bekerja" (§8.2b) · self-reset satu langkah (§8.4) · pemicu name-session (§10.7/§10.C) | 4, menjalar ke 5 dan 6 |
| **Hook `SessionStart` / K-10** (area-06 §6.3) | deteksi sesi baru · barrier `/clear` jadi event (§6.2) · lifecycle sesi §6.8 · fakta "sedang bekerja" (§8.2b) | 4 |
| **`doctor`** (area-12 §12.5) | syarat terima §6.3 · ack dua tingkat SCAR-071 (§6.7) · karantina payload (§6.7/§14.6) · handoff menggantung (§8.3) · store mati (§12.6) · satu-satunya tempat versi komponen terbaca (§11.3) | Kerangka di Tahap 1, isi alarmnya di Tahap 4-5 |
| **FTS5 + tool pencarian** (area-12 §12.4) | `peek_conversation` (B-1) · pencarian (B-2, di luar v1) | Skema idealnya Tahap 1, tool-nya Tahap 6 — lihat konflik tahap di Bagian 4 |

---

## Bagian 4 — Item yang butuh keputusan

### Kelompok A — Item tanpa tahap jelas (39 dari ekstraksi + 2 dari rekonsiliasi = 41 baris, lihat Bagian 6 untuk daftar lengkap)

Dikelompokkan per rumpun supaya tidak 41 baris terpisah tanpa konteks:

- **Prinsip/aturan lintas-komponen tanpa satu rumah tahap**: K-9 (konstrain no-SDK), K-12 (migrasi serentak), K-15/SCAR-077 (satu kontrak = satu salinan), SCAR-089/TG-124 (teks luar = data), K-16 (kebijakan bahasa), aturan "setiap penolakan wajib mengajari alternatif" (PTY-002 dst), aturan "satu perilaku satu rumah" (area-10 §10.4). Semuanya prinsip yang berlaku di banyak tahap sekaligus — §10 tidak punya slot untuk "aturan lintas tahap".
- **Enam Rules operasional kerja (SOP git-multi-agent)**: Rule1 isolasi worktree (SKILL-057, dua baris — §10.5 dan §10.A), Rule2 trailer commit (SKILL-058/059/060), Rule3 subagent-first (SKILL-061), Rule4 channel discipline sisa (SKILL-062), Rule5 rules-live-here + klausa pengecualian (SKILL-063), Rule6 three-copy doctrine (SKILL-064/065, dua baris). Rumahnya kemungkinan `CLAUDE.md` repo atau skill perilaku, belum ditetapkan.
- **Kontrak hook trailer commit (`PreToolUse`)**: SCAR-092 (kontrak + batas diterima sadar), FUNC-4/5 (matcher lintas-shell), empat kelas bypass adversarial yang belum digali. §10 hanya menyebut `PreToolUse` untuk ack — trailer commit tak disebut di tahap manapun.
- **Skill `telegram-conduct` dimuat otomatis** — ⚠️ **sorotan khusus**: skill ini adalah rumah untuk belasan aturan gaya (ack, narasi progres, cara susun tombol, larangan "obvious yes", pola leader fan-out, dst — semuanya sudah diberi tahap konkret 3/5 di Bagian 5 karena *penegak mekanisnya* dibangun di sana), tapi **skill itu sendiri tidak dimiliki tahap manapun**. Ini kandidat paling mudah terlupa karena ia tidak muncul sebagai baris kerja tunggal di §10.
- **Command registry & statusline administrasi**: tugas wajib memetakan 30 hook CC ke kewajiban mekanis (area-11 §11.0), `/help` dari satu registry (TG-059), daftar command tersisa, menu slash dipasang sekali saat boot, catatan cache menu Telegram (SCAR-059).
- **Retensi & housekeeping storage**: VACUUM manual, retensi `inbox/` 90 hari + perilaku saat file sudah dihapus (3 baris terkait), keputusan Windows ACL untuk proteksi file (SCAR-024), rotasi `wrapper.log` (PTY-050, dokumen sendiri menulis "silakan dibantah").
- **B-7** (riwayat sesi "dikunjungi sementara") — DEFER, di luar lingkup v1 (spec §13).
- **SKILL-039** (klausa stop wajib bila ada risiko loop tak berujung) — prinsip umum, kandidat rumah: skill perilaku atau delegasi tahap 6, belum ditugaskan.
- **SCAR-028** (PID reuse) — celah keamanan, keputusan sadar belum diambil sama sekali.
- **K-17/K-13** (klarifikasi arti "DROP") — lihat kontradiksi #3 di bawah.
- **TG-111** (quote-reply masuk) dan **TG-067** (`assertAllowedChat`) — dari rekonsiliasi area 01-04; TG-111 adalah separuh-masuk dari B-10 yang belum didesain sama sekali; TG-067 dinilai "cukup untuk tujuan yang sama" oleh desain baru tapi bentuk kodenya berbeda total dari yang diaudit — bukan ADA penuh.

### Kelompok B — Kontradiksi antar-dokumen (tidak diputuskan di sini — keputusan manusia)

1. **Kriteria B-6** (penyembunyian sesi remeh dari picker) — tiga dokumen berselisih: area-05 §5.2 (2026-07-27) **membuang** kriteria "tak pernah dinamai" karena saling meniadakan dengan §10.C; area-05 §5.A masih menyebutnya sebagai salah satu "dua kriteria yang sudah pasti"; spec §11 (2026-07-29) **memasukkannya lagi**. Baris B-6 di Bagian 5 (Tahap 6) ditandai `BUTUH KEPUTUSAN` karena ini.
2. **Konflik tahap FTS5** — area-12 §12.4 menulis indeks FTS5 wajib ada "sejak awal" (karena menambah belakangan = mengindeks ulang seluruh riwayat), tapi §10 spec menaruh "pencarian" di Tahap 6. Baris SCAR-060 di Bagian 6 mencatat tahap `?` karena inkonsistensi ini belum diputuskan pelaksana mana yang menang.
3. **Ketegangan three-copy doctrine vs K-17** — area-10 §10.B menyuruh memindahkan doktrin three-copy (workspace/marketplaces/cache) ke `CLAUDE.md` repo `mirza-marketplace`, tapi K-17/K-13 (area-13 §13.0) menyatakan repo lama + 11 plugin-nya **tidak disentuh** sama sekali oleh rebuild ini. Kedua dokumen sumber tidak menjelaskan bagaimana keduanya konsisten — perlu diperjelas repo/berkas mana persisnya yang dimaksud sebelum dikerjakan.

---

## Bagian 5 — Checklist per tahap

### Tahap 1 — Fondasi (`fleetd` + dua database + `config.json` + socket + `doctor`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Config/token korup → dipindah `.corrupt-<ts>` | KEEP | BELUM | rekon area-01§1.6 |
| SCAR-024 | Permission 0600 pada file token | KEEP | BELUM | rekon area-01§1.5 |
| TG-174,SCAR-095 | `.gitignore` otomatis `channels/` | KEEP | TIDAK RELEVAN | rekon area-01§1.6 |
| SCAR-026 | Parser `.env` buang `\r` | KEEP | TIDAK RELEVAN | rekon area-01§1.5 |
| — | Pemusatan state+config ke `~/.claude/mirza-bots/` | KEEP | SELESAI | rekon area-01§1.7 |
| — | Fleet declarative via `config.json` | KEEP | SELESAI | rekon area-01§1.8 |
| — | Satu `conversations.db` berkolom `bot` | KEEP | SELESAI | rekon area-01§1.9 |
| — | Antrean offline (`bot_inbox`) + drain saat reconnect | KEEP | SELESAI | rekon (ringkasan ADA) |
| SCAR-022 | Retry rename EPERM/EBUSY → util umum | MERGE | BELUM | area-06§6.5 |
| PTY-093 | Reset registry korup → pola deteksi-korup umum | MERGE | BELUM | area-06§6.5 |
| PTY-083/084/085 | Heartbeat tiap 5s, dianggap segar <30s | KEEP | BELUM | area-06§6.9 |
| SCAR-067 | Dua sinyal liveness: heartbeat + cek pid | KEEP | BELUM | area-06§6.9 |
| SCAR-010 | Ambang liveness 30s satu konstanta (pty ipc) | SATUKAN | BELUM | area-06§6.9 |
| SCAR-010/011 | Ambang online 30s satu konstanta (`agent_list`) | SATUKAN | BELUM | area-07§7.6 |
| — | Versi komponen berjalan hanya terbaca di `/doctor` | KEEP | BELUM | area-11§11.3 |
| TG-133 | Skema `messages` + 3 indeks + WAL, synchronous NORMAL | KEEP | BELUM | area-12§12.1 |
| K-3 | Satu database fleet + kolom `bot` | MODIFY | BELUM | area-12§12.1 |
| SCAR-097 | Retensi `messages.db`: simpan selamanya | KEEP | BELUM | area-12§12.2 |
| — | Pelaporan ukuran database di `doctor` | FITUR BARU | BELUM | area-12§12.2 |
| — | `doctor` — perintah pemeriksaan kapan pun | FITUR BARU | BELUM | area-12§12.5 |
| — | Sistem beri tahu user sendiri saat gagal (bukan cuma `/doctor` on-demand) | FITUR BARU | BELUM | area-12§12.5 |
| — | Alarm#6: bot diam/tidak bisa dihubungi | FITUR BARU | BELUM | area-12§12.5,§6.9 |
| — | `doctor.ok` wajib benar-benar dihitung dari komponen | ATURAN | BELUM | area-12§12.5 |
| — | `doctor` melaporkan versi komponen yang berjalan | FITUR BARU | BELUM | area-12§12.5,§11.3 |
| TG-134,142,144;SCAR-024 | chmod 0600 db+token, warning saat Windows no-op | KEEP | BELUM | area-12§12.7 |
| K-14 | Satu program terpisah terus hidup, pegang 6 token | KEPUTUSAN STRUKTURAL | BELUM | area-14§14.1 |
| — | Pengawas yang menyalakan ulang program itu bila mati | FITUR BARU | BELUM | area-14§14.1 |
| — | Alarm `doctor` tidak boleh bergantung pada `fleetd` sendiri | ATURAN | BELUM | area-14§14.1,§12.5 |
| SCAR-010 | Ambang liveness 30s — kandidat pertama disatukan | SATUKAN | BELUM | area-14§14.4 |
| SCAR-078,TG-156,PTY-093 | File korup dipindah `.corrupt-<ts>`, jadi aturan umum | KEEP | BELUM | area-14§14.6 |

**Tahap 1: 30 item — 24 BELUM, 4 SELESAI, 2 TIDAK RELEVAN.**

### Tahap 2 — Jalur pesan (poller, gerbang allowlist, media, penyimpanan, MCP proxy `reply`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | `message_id` pesan masuk tidak pernah disimpan (akar struktural) | KEEP | BELUM | rekon area-02§2.3,area-03§3.1 |
| — | Handler `message:document` (pdf/zip/.md/.log) | KEEP | BELUM | rekon area-02§2.1 |
| — | Catch-all lampiran tak didukung → notifikasi | KEEP | BELUM | rekon area-02§2.1 |
| TG-103 | Indikator "typing" | KEEP | BELUM | rekon area-02§2.5 |
| TG-077 | `replyToMode=first` — kutip pesan user di chunk pertama | KEEP | BELUM | rekon area-01§1.3,area-03§3.7 |
| — | Konversi CommonMark → MarkdownV2 sebelum kirim | KEEP | BELUM | rekon area-03§3.2 |
| TG-072/073/074/076/080,SCAR-046-048 | Mesin chunking tiga-lapis | KEEP | BELUM | rekon area-03§3.3 |
| — | Tool `get_message_by_id` | KEEP | BELUM | rekon area-03§3.1 |
| TG-070/071/079,SCAR-087 | Pengiriman lampiran keluar (`assertSendable`, 50MB, routing) | KEEP | BELUM | rekon area-03§3.6 |
| TG-081 | Logging outbound (satu row per chunk/file) | KEEP | BELUM | rekon area-03§3.6 |
| TG-112–121,SCAR-012/055/056 | Buffering album (cap 10, sort, paralel, caption, fail-report) | KEEP | SEBAGIAN | rekon area-02§2.3 |
| TG-105 | Unduhan gagal → path dihilangkan, bukan error total | KEEP | SEBAGIAN | rekon area-02§2.2 |
| TG-082 | Hasil `sent (id: N)` / `sent N parts` | KEEP | SEBAGIAN | rekon area-03§3.6 |
| TG-089/090 | Format error tool `<tool> failed: <msg>` | KEEP | SEBAGIAN | rekon area-03§3.6 |
| TG-108,SCAR-088 | `safeName()` sanitasi nama file (prasyarat: handler document) | KEEP | BELUM | rekon area-02§2.5 |
| TG-110 | Bentuk notifikasi `<channel>...</channel>` | GANTI | TIDAK RELEVAN | rekon area-02§2.5 |
| — | Enforcement allowlist inbound | KEEP | SELESAI | rekon area-01§1.1 |
| — | Auto-download foto ke `inbox/` | KEEP | SELESAI | rekon area-02§2.2 |
| — | `image_path` hanya di meta, tak pernah di isi pesan | KEEP | SELESAI | rekon SCAR-088 |
| — | Redaksi token di URL unduhan media | KEEP | SELESAI | rekon (`media.ts`) |
| — | Kepatuhan DROP (`download_attachment`/`edit_message`/`react`/`format`) | KEEP | SELESAI | rekon area-03§3.1/3.2/3.4/3.5 |
| TG-135 | `quote_text`/`quote_is_manual` di kolom `metadata` | KEEP | BELUM | area-12§12.1 |
| TG-138 | `getMessage` ambil row terbaru `(chat_id,message_id)` | KEEP | BELUM | area-12§12.1 |
| TG-139 | Fallback album via `metadata.message_ids` + verifikasi parse | KEEP | BELUM | area-12§12.1 |
| TG-136 | `source` terbatas `assistant`/`system` utk pesan keluar | KEEP | BELUM | area-12§12.1 |
| TG-140 | Mode degradasi: store mati → no-op, pipeline tetap jalan | KEEP | BELUM | area-12§12.6 |
| — | Kondisi store mati wajib terlihat di `doctor` + diberitahukan | MODIFY | BELUM | area-12§12.6 |
| SCAR-015,TG-154 | Semua error polling di-retry dengan backoff | KEEP | BELUM | area-14§14.2 |
| SCAR-061,TG-155 | `bot.catch` wajib dipasang | KEEP | BELUM | area-14§14.2 |
| TG-157 | `unhandledRejection`/`uncaughtException` dicatat | KEEP | BELUM | area-14§14.2 |
| SCAR-089 | `quote_text` & isi log = data user-controlled | KEEP | BELUM | area-14§14.5 |
| SCAR-088 | Guard anti tag-breakout wajib jadi test | KEEP | BELUM | area-14§14.5 |

**Tahap 2: 32 item — 22 BELUM, 4 SEBAGIAN, 5 SELESAI, 1 TIDAK RELEVAN.**

### Tahap 3 — Penegakan (`PreToolUse` ack + `Stop` jawaban final + tombol wajib + tombol manual otomatis)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Validasi tombol boundary (baris/tombol/label/`callback_id`) | KEEP | BELUM | rekon area-04§4.1 |
| — | Prefiks `ai:` pada `callback_data` | KEEP | BELUM | rekon area-04§4.1 |
| — | Notifikasi tap tombol `[button tapped: <label>]` | KEEP | BELUM | rekon area-04§4.1 |
| — | Edit pesan sumber setelah tap + hapus keyboard | KEEP | BELUM | rekon area-04§4.1,SCAR-058 |
| — | Tombol "✏️ Jelaskan manual" ditambahkan server | KEEP | BELUM | rekon area-04§4.4 |
| — | Penolakan server: pertanyaan wajib minimal tombol Ya/Tidak | KEEP | BELUM | rekon area-04§4.5 |
| TG-069 | `buttons`+file eksklusif (prasyarat: param file di `reply`) | KEEP | BELUM | rekon area-04§4.2 |
| TG-078 | Keyboard hanya di chunk terakhir (prasyarat: chunking) | KEEP | BELUM | rekon area-04§4.1 |
| — | Ack tap tombol segera (`answerCallbackQuery`) | KEEP | SELESAI | rekon area-04§4.1 |
| SKILL-045,046 | Ack dipaksa mesin — tool non-`reply` pertama DITOLAK | DIPAKSA MESIN(MERGE) | BELUM | area-10§10.1 |
| SKILL-049 | Satu ack per pesan masuk (pesan terbaru saja) | KEEP | BELUM | area-10§10.1 |
| — | Ack: 1 baris, ≤1 emoji, <50 karakter, ikut bahasa user | KEEP | BELUM | area-10§10.1 |
| TG-163,164;SCAR-093 | Fix penjaga jawaban final (bug FUNC-3) | FIX(MODIFY) | BELUM | area-10§10.2 |
| — | Bot tutup dgn 1 reply lalu diam tetap lolos | KEEP | BELUM | area-10§10.2 |
| TG-164 | Loop-guard: `stop_hook_active` tak blokir 2x | KEEP | BELUM | area-10§10.2 |
| — | Fix bug "sticky" `telegramDriven` | FIX | BELUM | area-10§10.2 |
| SKILL-048 | Narasi progres wajib di tiap perubahan tahap nyata | KEEP | BELUM | area-10§10.3 |
| SKILL-052 | Cara susun tombol (label pendek, tak diulang di body) | KEEP | BELUM | area-10§10.4 |
| SKILL-055 | Jangan tanya "obvious yes" tanpa alasan | KEEP | BELUM | area-10§10.4 |
| SKILL-055 | Operasi destruktif dieja lengkap di body | KEEP | BELUM | area-10§10.4 |
| TG-124 | `instructions` MCP dipangkas ke fakta mekanis saja | PANGKAS(SIMPLIFY) | BELUM | area-10§10.4 |

**Tahap 3: 21 item — 20 BELUM, 1 SELESAI.**

### Tahap 4 — Sesi (`bot-cc` + antrean injeksi + `SessionStart` + `/new` `/switch` + `/context` + `UserPromptSubmit`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| PTY-068/069/070/076;SCAR-039/079/081 | Lifecycle bot jadi kolom data (K-7) | MERGE | BELUM | area-05§5.4 |
| TG-027 | Sesi aktif dikecualikan dari daftar `/switch` | KEEP | BELUM | area-05§5.6 |
| TG-029(sisa) | Satu tombol/baris, label ≤60 char, ❌Cancel terakhir | KEEP | BELUM | area-05§5.6 |
| TG-032;SCAR-052 | `shortId` 8 hex di `callback_data` | KEEP | BELUM | area-05§5.6 |
| TG-033 | Tap valid tak pre-announce; banner saat sesi ganti | KEEP | BELUM | area-05§5.6 |
| TG-178,TG-183 | Enumerasi `*.jsonl` regex UUID + `encodeProjectDir` | KEEP | BELUM | area-05§5.6 |
| TG-182 | Sort mtime descending daftar sesi | KEEP | BELUM | area-05§5.6 |
| TG-018 | Validasi nama sesi (CR/LF, kosong, spasi, ≤64 char) | KEEP | BELUM | area-05§5.7 |
| TG-019,TG-026 | Guard state dir ter-resolve + pesan solusi | KEEP | BELUM | area-05§5.7 |
| TG-020 | Guard heartbeat wrapper segar (<30s) | KEEP | BELUM | area-05§5.7 |
| TG-021,TG-024 | Nama dipakai→ditolak; self-rename=no-op | KEEP | BELUM | area-05§5.7 |
| TG-022 | `/new` tanpa ack, banner saat siap | KEEP | BELUM | area-05§5.7 |
| TG-025 | `/rename` balas "✏️ Renaming session..." | KEEP | BELUM | area-05§5.7 |
| TG-150;LOSS-4 | Banner ganti-sesi dikirim mesin + fix bug pencatatan | KEEP+FIX | BELUM | area-05§5.8,area-12§12.1 |
| SCAR-085 | Banner tak boleh hardcode satu chat tujuan | KEEP | BELUM | area-05§5.8 |
| TG-055;SCAR-051 | Peta `shortId→sesi` in-memory; expired msg jelas | KEEP | BELUM | area-05§5.9 |
| PTY-039;SCAR-025 | Spawn CC lewat shell (cmd/login shell) | KEEP | BELUM | area-06§6.1 |
| PTY-040,041 | `CLAUDE_BIN`/`CLAUDE_ARGS` bisa dioverride | KEEP | BELUM | area-06§6.1 |
| PTY-042 | Env anak selalu bawa lokasi state | KEEP | BELUM | area-06§6.1 |
| PTY-043,044,045 | Ukuran PTY dari terminal user, xterm-256color, resize | KEEP | BELUM | area-06§6.1 |
| PTY-046 | CC exit → wrapper exit dgn exit code CC | KEEP | BELUM | area-06§6.1 |
| PTY-047,048;SCAR-066 | SIGINT diteruskan ke PTY; SIGTERM kill PTY | KEEP | BELUM | area-06§6.1 |
| PTY-049 | Shutdown bersih: hentikan timer, hapus heartbeat/pid | KEEP | BELUM | area-06§6.1 |
| PTY-050 | Log ISO ke stderr + `wrapper.log` | KEEP | BELUM | area-06§6.1 |
| PTY-051 | Satu proses CC seumur wrapper; ganti sesi via `/resume` | KEEP | BELUM | area-06§6.1 |
| SCAR-096 | Jangan pakai `import.meta.dir` (Bun-only) di wrapper Node | KEEP | BELUM | area-06§6.1 |
| — | `SUBMIT_DELAY_MS`=250 (pisah teks dari `\r`) | KEEP kontrak | BELUM | area-06§6.2 |
| — | `MIN_INJECTION_GAP_MS`=1500 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `POST_INJECTION_DELAY_MS`=1000 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CLEAR_SETTLE_MS`=1500 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CLEAR_BARRIER_TIMEOUT_MS`=600000 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `QUEUE_POLL_MS`=200 (kandidat event-driven) | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CHUNK_SIZE`/`CHUNK_DELAY_MS`=100/30 (anti head-drop) | KEEP kontrak | BELUM | area-06§6.2 |
| — | Antrean FIFO tunggal + satu drainer + gate | KEEP mekanisme | BELUM | area-06§6.2 |
| — | Gate dua mekanisme: `holdFor` monotonik + barrier `/clear` | KEEP | BELUM | area-06§6.2 |
| SCAR-031 | Snapshot eager daftar sesi saat keystroke `/clear` | KEEP | BELUM | area-06§6.2 |
| SCAR-020 | Chunking aman code-point (`Array.from`, no split surrogate) | KEEP | BELUM | area-06§6.2 |
| SCAR-029 | Enter TUI = `\r`, bukan `\n` | KEEP | BELUM | area-06§6.2 |
| PTY-063 | Kegagalan dispatch 1 item tak hentikan antrean | KEEP | BELUM | area-06§6.2 |
| — | Aturan: konstanta pacing wajib test + verifikasi live | KEEP aturan proses | BELUM | area-06§6.2 |
| PTY-067/071/072;SCAR-032/033 | Deteksi sesi baru GANTI ke hook `SessionStart` | GANTI(MERGE) | BELUM | area-06§6.3 |
| — | Timeout fallback deteksi sesi → alarm di `doctor` | FITUR BARU | BELUM | area-06§6.3 |
| — | Enumerasi sesi `/switch` masih baca `~/.claude/projects/` | KEEP (sisa) | BELUM | area-06§6.3 |
| PTY-001–012,015–021,037 | Kendali-diri AI jadi daftar putih command | GANTI(MODIFY) | BELUM | area-06§6.6 |
| SCAR-086 | Teks bebas ditolak by design pada `pty_send_slash` | KEEP wajib | BELUM | area-06§6.6 |
| PTY-002;SCAR-037 | Regex izinkan namespace `:`, nama≤64,arg≤256 | KEEP | BELUM | area-06§6.6 |
| PTY-005;SCAR-044 | Self-only: parameter `target` ditolak | KEEP wajib | BELUM | area-06§6.6 |
| PTY-007 | Wrapper tak terdeteksi → error mengajari solusi | KEEP | BELUM | area-06§6.6 |
| PTY-011 | Semua kegagalan tool jadi `isError` | KEEP | BELUM | area-06§6.6 |
| PTY-002,007,016–019 | Setiap error mengajari alternatif yang benar | KEEP | BELUM | area-06§6.6 |
| SCAR-001 | Aturan pemisahan teks+`\r` 250ms wajib dipertahankan | KEEP wajib | BELUM | area-06§6.6 |
| PTY-031;SCAR-027 | Tulisan atomik `tmp.<pid>`+rename, sweep skip `.tmp.` | KEEP dua sisi | BELUM | area-06§6.7 |
| PTY-034;SCAR-068 | Hapus-sebelum-proses vs rename `processing/` | KEEP kontrak | BELUM | area-06§6.7 |
| PTY-036;SCAR-021 | Deteksi dua jalur: fs notif + sweep berkala | KEEP | BELUM | area-06§6.7 |
| PTY-037 | JSON malformed → karantina `.rejected-<ts>` | KEEP+perbaikan | BELUM | area-06§6.7 |
| PTY-109–114;SCAR-045 | Batch = satu unit atomik (maks 8 item) | KEEP kapabilitas | BELUM | area-06§6.7 |
| — | Turunkan ulang jaminan atomisitas batch secara eksplisit | Tugas wajib | BELUM | area-06§6.7 |
| SCAR-071 | Ack dua tingkat injeksi (`injected` ≠ selesai semantik) | KEEP+utang dibayar | BELUM | area-06§6.7 |
| PTY-064,065 | First-run mulai segar; resume via mtime jsonl | KEEP | BELUM | area-06§6.8 |
| PTY-066;SCAR-041/080 | Resume identitas seed sinkron, guard `session_id` | KEEP wajib | BELUM | area-06§6.8 |
| PTY-073;SCAR-081 | Pasca-`/clear` nama diterapkan, wajib verifikasi ulang | KEEP | BELUM | area-06§6.8 |
| PTY-074 | `/switch` → injeksi `/resume <sessionId>` | KEEP | BELUM | area-06§6.8 |
| PTY-077,078 | Event `session-change`; `/clear` di tengah batch tunda notif | KEEP | BELUM | area-06§6.8 |
| PTY-022–027(sisa) | Nama plugin command wajib fully-qualified | KEEP | BELUM | area-06§6.10 |
| TG-165–168 | Statusline bridge merantai (settings.json, snapshot, teruskan stdin) | KEEP | BELUM | area-11§11.1 |
| SCAR-084 | Guard `isOurOwnBridge` (cegah loop simpan diri) | KEEP wajib | BELUM | area-11§11.1 |
| — | Alarm bila capture tidak berbunyi dalam N menit | FITUR BARU | BELUM | area-11§11.1 |
| — | Backup `settings.json` tidak menumpuk tanpa batas | Perbaikan | BELUM | area-11§11.1 |
| SCAR-017 | `/context` menunggu data, bukan tidur 5 detik flat | Perbaikan | BELUM | area-11§11.1,§11.2 |
| — | Bila tak ada statusLine sebelumnya, bridge render sendiri | FITUR BARU | BELUM | area-11§11.1 |
| — | Perilaku tetap: non-JSON→null, tanpa `CLAUDE_PROJECT_DIR`→skip, tulis atomik | KEEP | BELUM | area-11§11.1 |
| K-1 | Lokasi snapshot pindah ke store terpusat | MERGE | BELUM | area-11§11.1 |
| SCAR-041 | Snapshot sah hanya utk `session_id` yang cocok | KEEP wajib | BELUM | area-11§11.1 |
| TG-010–013 | `/context`: pemakaian context (bar+persen+token) | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: rate limit 5 jam & 7 hari | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: model, effort, thinking, fast | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: biaya, CWD, nama+id sesi | KEEP | BELUM | area-11§11.2 |
| TG-169 | `/context`: "Last update HH:MM WIB (relatif)" | KEEP | BELUM | area-11§11.2 |
| TG-170 | Helper format token (1.5k/2M) & waktu relatif | KEEP | BELUM | area-11§11.2 |
| TG-150;LOSS-4 | Fix `messagesStore.append` tak ada di interface | FIX wajib | BELUM | area-12§12.1,area-05§5.8 |
| — | Alarm#1: capture statusline mati | FITUR BARU | BELUM | area-12§12.5,§11.1 |
| — | Alarm#2: hook `SessionStart` tak berbunyi | FITUR BARU | BELUM | area-12§12.5,§6.3 |
| — | Alarm#3: injeksi tak pernah mendarat | FITUR BARU | BELUM | area-12§12.5,§6.7 |
| — | Alarm#5: payload rusak dikarantina | FITUR BARU | BELUM | area-12§12.5,§6.7,§14.6 |
| SCAR-013;TG-149/151 | Deteksi perubahan file: watch DIREKTORI bukan file | KEEP | BELUM | area-14§14.3 |
| SCAR-013 | Defer 50ms sebelum baca (rename sempat commit) | KEEP | BELUM | area-14§14.3 |
| SCAR-013 | Sweep berkala sbg jaring pengaman | KEEP | BELUM | area-14§14.3 |
| SCAR-027 | Sisi kedua kontrak atomic-write: sweep skip `.tmp.` | KEEP | BELUM | area-14§14.3 |
| PTY-037 | Payload rusak dikarantina `.rejected-<ts>` + alarm doctor | KEEP aturan umum | BELUM | area-14§14.6 |
| SCAR-018 | Boot-settle 5 detik — verifikasi, jangan asumsikan | KEEP bersyarat | BELUM | area-14§14.7 |

**Tahap 4: 90 item — 90 BELUM.**

### Tahap 5 — Antar-bot (`agent_list` `agent_status` `agent_send` + handoff dijaga mesin)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| PTY-038 | `hop_count > 5` pada payload ber-`from` → DROP | KEEP | BELUM | area-06§6.7 |
| BUS-017,037;SCAR-044;PTY-005 | Prinsip neighbor autonomy: prompt berhakim, slash tidak | KEEP prinsip | BELUM | area-07§7.0 |
| BUS-037 | Bot macet diselamatkan user, bukan bot tetangga | KEEP | BELUM | area-07§7.0 |
| BUS-027,022;SCAR-038 | Transport prompt antar-bot GANTI ke channel notif | GANTI(MERGE) | BELUM | area-07§7.1 |
| BUS-025,038;SCAR-043 | Marker atribusi GANTI jadi metadata terstruktur | GANTI | BELUM | area-07§7.2 |
| BUS-038 | Aturan anti-bounce ditulis ulang ke metadata | MODIFY | BELUM | area-07§7.2 |
| BUS-023,024,031,042;PTY-038 | Guard anti-loop dua sisi (`hop_count`) | KEEP | BELUM | area-07§7.3 |
| BUS-030,040,043;SKILL-030 | `agent_send` boleh otonom dlm alur yg diizinkan | MODIFY | BELUM | area-07§7.4 |
| BUS-039 | Tetap terlarang: second opinion/delegasi otonom | KEEP | BELUM | area-07§7.4 |
| BUS-043 | Prompt wipe-state wajib konfirmasi ulang | KEEP | BELUM | area-07§7.4 |
| BUS-006–015;SCAR-073 | `agent_status` SIMPLIFY jadi satu query store | SIMPLIFY | BELUM | area-07§7.5 |
| — | Field `agent_status`: status kerja idle/sibuk | KEEP | BELUM | area-07§7.5 |
| BUS-014 | Field: pemakaian context (%+window token) | KEEP | BELUM | area-07§7.5 |
| — | Field: nama & id sesi aktif | KEEP | BELUM | area-07§7.5 |
| — | Field: model, effort level, biaya | KEEP+penambahan | BELUM | area-07§7.5 |
| BUS-014 | Kontrak: `context_used_percent` null = ~0%, bukan error | KEEP wajib | BELUM | area-07§7.5 |
| BUS-001–005 | `agent_list`: sumber pindah ke config+store terpusat | KEEP disederhanakan | BELUM | area-07§7.6 |
| BUS-005 | Kontrak "safe to call autonomously at any time" | KEEP | BELUM | area-07§7.6 |
| BUS-028,045 | Antre-untuk-offline (`online:false`, error per-target) | KEEP | BELUM | area-07§7.7 |
| BUS-045 | Kewajiban AI beri tahu user pesan dikonsumsi saat boot | KEEP | BELUM | area-07§7.7 |
| SCAR-070 | Asimetri `agent_send`(antre) vs `pty_send_slash`(tolak) | Keputusan(KEEP) | BELUM | area-07§7.7 |
| BUS-019,029,044 | Broadcast/fan-out: target string atau array | KEEP | BELUM | area-07§7.8 |
| — | Pola leader fan-out (`agent_list`→send array→ringkas→STOP) | KEEP aturan skill | BELUM | area-07§7.8 |
| BUS-041 | Kanal satu arah, tak ada reply channel | KEEP | BELUM | area-07§7.9 |
| BUS-046 | Nama peer tak boleh ditebak, selalu dari `agent_list` | KEEP | BELUM | area-07§7.9 |
| BUS-047 | Jangan taruh secret di badan prompt | KEEP | BELUM | area-07§7.9 |
| BUS-016,018 | Validasi `kind` enum `['prompt']` | KEEP | BELUM | area-07§7.10 |
| BUS-032 | Error handler jadi `isError:true` | KEEP | BELUM | area-07§7.10 |
| — | Skill `using-agent-bus` ditulis ulang dari kode | MODIFY | BELUM | area-07§7.10 |
| SKILL-009 | Mode 🚀 Now — pilih bot→tulis file→kirim | KEEP | BELUM | area-08§8.1 |
| SKILL-010 | Mode ⏭️ After this task — designation one-shot | KEEP | BELUM | area-08§8.1 |
| SKILL-011(mode) | Mode 🏓 Ping pong — designation menular via `Pair` | KEEP | BELUM | area-08§8.1 |
| SKILL-011 | Ekuivalensi bahasa natural (skip tombol) | KEEP | BELUM | area-08§8.1 |
| SKILL-006,007 | Ambang trigger GANTI dari persen→angka tunggal | GANTI | BELUM | area-08§8.2 |
| SKILL-007 | Ambang diperiksa hanya di batas selesai-task | KEEP | BELUM | area-08§8.2 |
| SKILL-008 | Designation→full-auto; tanpa itu→tombol; anti-spam | KEEP | BELUM | area-08§8.2 |
| — | Syarat penerima#1: context <100.000 token, mutlak | ATURAN BARU | BELUM | area-08§8.2b |
| — | Syarat penerima#2: tidak sedang bekerja (fakta hook) | ATURAN BARU | BELUM | area-08§8.2b |
| — | Pengirim menyaring lewat `agent_status` sebelum tulis file | ATURAN BARU | BELUM | area-08§8.2b |
| — | Penerima memutuskan — keputusannya mengikat | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang OK: batas waktu, user diberitahu, `/clear` diantre | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang NOT-OK: kembali ke user + alasan + pilihan lain | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang timeout: tombol kirim ulang/pilih lain/batal | ATURAN BARU | BELUM | area-08§8.2b |
| — | Pelaksana ketiga cabang adalah `fleetd`, bukan AI pengirim | ATURAN BARU(mengikat) | BELUM | area-08§8.2b |
| — | Tak ada bot memenuhi syarat → tombol darurat | ATURAN BARU | BELUM | area-08§8.2b |
| SKILL-020–029,032(sebagian) | State handoff jadi DATA+timeout alarm mesin | KEPUTUSAN STRUKTURAL(MERGE) | BELUM | area-08§8.3 |
| SKILL-020 | Designation full-auto+target tak ready→batal | KEEP | BELUM | area-08§8.3 |
| SKILL-026 | Timeout tanpa ACK→lapor+tombol, jangan self-reset | KEEP | BELUM | area-08§8.3 |
| SKILL-027 | R menolak/ACK terlambat — tiga cabang | KEEP | BELUM | area-08§8.3 |
| SKILL-019,023 | Dua laporan wajib (file selesai, terkirim) | KEEP | BELUM | area-08§8.3 |
| SKILL-028(langkah5) | ACK dua arah: pengirim + user Telegram | KEEP | BELUM | area-08§8.3 |
| SKILL-013 | Bot non-ready tetap bisa dipilih + penanda eksplisit | KEEP | BELUM | area-08§8.3,§8.2b |
| SKILL-025;PTY-078;SCAR-045 | Self-reset SIMPLIFY: `/clear` + satu tulis status | SIMPLIFY | BELUM | area-08§8.4 |
| SKILL-005(sebagian) | Kaitan sesi↔file handoff tersimpan sbg data | ATURAN BARU wajib | BELUM | area-08§8.4 |
| SKILL-017/018 | Template: bagian Tujuan handoff | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: SUDAH/SEDANG | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Blocker + alasan (wajib) | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: AKAN (goal+langkah+starting point) | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Referensi + kolom "Kapan dibaca" | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Referensi playbook → jadi kondisional | KEEP→KONDISIONAL | BELUM | area-08§8.5,area-13§13.4 |
| SKILL-017/018 | Template: Referensi tasks/plans lintas sesi | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Anti-Patterns/Lessons (wajib) | KEEP wajib | BELUM | area-08§8.5,area-13§13.4 |
| SKILL-017/018 | Template: Header (Date,Repo,Branch,Dari→Ke,dst) | KEEP | BELUM | area-08§8.5 |
| — | Bagian "Keputusan User Brainstorming" digabung | MERGE | BELUM | area-08§8.5 |
| — | Header `Pair` (terikat nasib ping-pong) | KEEP | BELUM | area-08§8.5 |
| SKILL-018 | Sifat file append-only chain, tak edit lama | KEEP | BELUM | area-08§8.5 |
| SKILL-017 | Template digenerate langsung, jangan load dari disk | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-002 | Bot tak pernah kerja di workspace sendiri, path absolut | KEEP | BELUM | area-08§8.6 |
| SKILL-005 | Slug kebab-case ≤6 kata, sama utk file&tracking | KEEP | BELUM | area-08§8.6 |
| SKILL-014 | Clarity check pra-file (3 syarat wajib) | KEEP | BELUM | area-08§8.6 |
| SKILL-015 | Mandat README diupdate sebelum tulis handoff | KEEP | BELUM | area-08§8.6 |
| SKILL-016 | Lokasi file `.handoff/<ts>-prompt-<slug>.md` | KEEP | BELUM | area-08§8.6 |
| SKILL-012 | Step pilih bot: narasi bullet + marka status | KEEP | BELUM | area-08§8.6 |
| SKILL-031 | Larangan receiver (jangan edit/hapus, dst) | KEEP | BELUM | area-08§8.6 |
| SKILL-032 | Edge case: paralel, designation batal, dst (4 kasus) | KEEP | BELUM | area-08§8.6 |
| SKILL-028 | Template body `agent_send`: substitusi literal, guard sibuk | KEEP | BELUM | area-08§8.6 |
| SKILL-021 | `agent_send` offline tetap terkirim, wajib disebut | KEEP | BELUM | area-08§8.7 |
| SKILL-030 | Legalitas `agent_send` ditulis ulang sesuai §7.4 | MODIFY | BELUM | area-08§8.7 |
| 8.B | Ambang PENGIRIM = 50% dari total context | DITETAPKAN | BELUM | area-08§8.B |
| — | Alarm#4: handoff menggantung tanpa ACK lewat batas waktu | FITUR BARU | BELUM | area-12§12.5,area-08§8.3 |
| — | Referensi playbook di template handoff: wajib→kondisional | MODIFY | BELUM | area-13§13.4 |
| SKILL-017 | Anti-Patterns/Lessons CARRY FORWARD tetap wajib | KEEP dipertegas | BELUM | area-13§13.4 |

**Tahap 5: 82 item — 82 BELUM.**

### Tahap 6 — Sisanya (`peek_conversation`, pencarian, penyembunyian sesi remeh, penamaan otomatis, delegasi B-8)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Tool `peek_conversation(bot, sejak)` intip antar-bot | FITUR BARU | BELUM | rekon area-01§1.9 |
| B-6 | Penyembunyian sesi remeh dari picker (giliran<3 & <8.000 token) | FITUR BARU | BUTUH KEPUTUSAN | area-05§5.2,§5.A — kontradiksi kriteria, lihat Bagian 4 |
| B-8 | Delegasi — primitif baru (dua pemilik paralel) | FITUR BARU | BELUM | area-08§8.C |
| B-8 | Delegasi: tak ada kewajiban lapor balik ke bot utama | Keputusan | BELUM | area-08§8.C |
| B-8 | Delegasi: isolasi repo ikut Rule1 umum (tawaran) | KOREKSI | BELUM | area-08§8.C,area-10§10.A |
| B-8 | Delegasi: tak ada self-reset pengirim | Keputusan | BELUM | area-08§8.C |
| B-8 | Delegasi: ACK numpang `reply` + hook `Stop` | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: "bot sibuk" bukan konsep mesin, selalu terkirim | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: file `.handoff/` prefix `delegasi-<slug>` | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: field "Batas potongan" (wajib, dua sisi) | FITUR BARU | BELUM | area-08§8.C |
| B-8 | Delegasi: bagian diganti makna (Repo&worktree dst) | MODIFY | BELUM | area-08§8.C |
| SKILL-037(gagasan) | Kondisi "selesai" terverifikasi mekanis | MERGE | BELUM | area-09, dipakai area-08§8.C |
| TG-188,160 | `name-session` perlu dirancang ulang | MODIFY | BELUM | area-10§10.7 |
| TG-188,160 | `name-session` bentuk baru: mesin jamin ada nama | ATURAN BARU | BELUM | area-10§10.C |
| — | Nama sesi tetap hyphenated, tanpa spasi | KEEP | BELUM | area-10§10.C |
| SCAR-060 | Indeks FTS5 di `messages.db` (skema idealnya dari Tahap 1) | FITUR BARU(prasyarat) | BELUM | area-12§12.4 |
| — | Tool pencarian yang diekspos ke AI | FITUR BARU | BELUM | area-12§12.4 |

**Tahap 6: 17 item — 16 BELUM, 1 BUTUH KEPUTUSAN.**

---

## Bagian 6 — Item tanpa tahap

Tidak dipaksakan masuk tahap manapun — dokumen sumber sendiri menandainya `?` atau ambigu. Lihat Bagian 4 untuk pengelompokan naratif dan penjelasan kontradiksi. Semua berstatus `BUTUH KEPUTUSAN` karena itulah alasan mereka ada di sini: entah rumah tahapnya, entah keputusan desainnya sendiri, belum diambil.

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| K-9 | Konstrain: tanpa SDK/`claude -p`, semua via TUI interaktif | KEEP(konstrain) | BUTUH KEPUTUSAN | area-06§6.0 |
| K-12 | Migrasi serentak "matikan semua ganti semua" | Syarat diterima | BUTUH KEPUTUSAN | area-06§6.4 |
| SCAR-028 | PID reuse — celah terbuka, perlu keputusan sadar | Belum diputuskan | BUTUH KEPUTUSAN | area-06§6.9 |
| PTY-002–004,007,008,010,016–027 | Aturan wajib: penolakan sebut alternatif benar | KEEP→aturan wajib | BUTUH KEPUTUSAN | area-06§6.10 |
| B-7 | Riwayat sesi per bot "dikunjungi sementara" | DEFER | BUTUH KEPUTUSAN | area-07§B-7 (di luar v1, spec§13) |
| SKILL-039(gagasan) | Klausa stop wajib bila ada risiko loop tak berujung | MERGE | BUTUH KEPUTUSAN | area-09 |
| — | Aturan induk: satu perilaku hidup di SATU rumah | KEEP aturan | BUTUH KEPUTUSAN | area-10§10.4 |
| SKILL-057 | Rule1 isolasi worktree tetap perilaku (→tawaran) | KEEP | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-058,059,060 | Rule2 trailer `Agent: <bot-name>` + fix | KEEP+fix | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-061 | Rule3 subagent-first (tak bisa dijamin mesin) | KEEP teks | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-062 | Rule4 sisa channel discipline | KEEP teks | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-063 | Rule5 rules-live-here, diperbarui | KEEP diperbarui | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-064,065 | Rule6 three-copy doctrine — tinjau lokasi | Pindah(MERGE) | BUTUH KEPUTUSAN | area-10§10.5 |
| SCAR-092 | Kontrak hook trailer commit (`PreToolUse`) | KEEP | BUTUH KEPUTUSAN | area-10§10.6 |
| FUNC-4/5 | Matcher wajib cakup semua shell (PowerShell lolos) | FIX wajib | BUTUH KEPUTUSAN | area-10§10.6 |
| — | Empat kelas bypass adversarial — belum digali | FIX wajib | BUTUH KEPUTUSAN | area-10§10.6 |
| SCAR-092 | Batas diterima sadar: commit via editor/`$(...)` | KEEP batas sadar | BUTUH KEPUTUSAN | area-10§10.6 |
| SKILL-057 | Rule1 jadi tawaran di awal (bukan diam-diam) | MODIFY(KEEP) | BUTUH KEPUTUSAN | area-10§10.A |
| SKILL-057 | Urutan alat worktree: native dulu, fallback git | KEEP | BUTUH KEPUTUSAN | area-10§10.A |
| SKILL-064,065 | Three-copy doctrine pindah ke `CLAUDE.md` repo | MERGE | BUTUH KEPUTUSAN | area-10§10.B |
| SKILL-063 | Klausa pengecualian Rule5 (repo-specific vs lintas repo) | ATURAN BARU | BUTUH KEPUTUSAN | area-10§10.B |
| SKILL-064,065 | Isi doktrin yang wajib tetap terbawa | KEEP | BUTUH KEPUTUSAN | area-10§10.B |
| — | Skill `telegram-conduct` dimuat otomatis (MERGE 4 plugin) | ATURAN BARU(MERGE) | BUTUH KEPUTUSAN | area-10§10.D — rumah belasan aturan gaya, belum ada tahap |
| — | Tugas wajib: petakan 30 hook CC ke kewajiban mekanis | Tugas arsitektur | BUTUH KEPUTUSAN | area-11§11.0 |
| TG-059 | `/help` dirender dari SATU registry perintah | KEEP | BUTUH KEPUTUSAN | area-11§11.4 |
| — | Daftar perintah tersisa: `/new /rename /switch /context /handoff /help` | KEEP kontrak | BUTUH KEPUTUSAN | area-11§11.4 |
| — | Menu slash: satu set tetap dipasang sekali saat boot | SIMPLIFY | BUTUH KEPUTUSAN | area-11§11.4 |
| SCAR-059 | Catatan: Telegram cache menu slash (perlu force-close) | KEEP catatan | BUTUH KEPUTUSAN | area-11§11.4,§14.7 |
| — | Perintah pemadatan manual (`VACUUM`) | FITUR BARU | BUTUH KEPUTUSAN | area-12§12.2 |
| — | Retensi `inbox/`: file >90 hari dihapus kecuali dirujuk | FITUR BARU | BUTUH KEPUTUSAN | area-12§12.3 |
| — | Baris pesan tetap ada meski file lampiran dihapus | KEEP aturan | BUTUH KEPUTUSAN | area-12§12.3 |
| — | Bot bilang apa adanya jika lampiran sudah kedaluwarsa | ATURAN BARU | BUTUH KEPUTUSAN | area-12§12.3 |
| SCAR-024 | Keputusan terbuka: strategi proteksi file Windows (ACL) | Belum diputuskan | BUTUH KEPUTUSAN | area-12§12.7 |
| PTY-050 | Rotasi `wrapper.log` berbasis ukuran ("silakan dibantah") | Keputusan pelaksana | BUTUH KEPUTUSAN | area-12§12.8 |
| K-17/K-13 | Klarifikasi arti "DROP": tak diikutkan, bukan dihapus/diubah | Keputusan mengikat | BUTUH KEPUTUSAN | area-13§13.0 — tegang dengan §10.B, lihat Bagian 4 |
| K-15/SCAR-077 | Kontrak dipakai >1 komponen hanya boleh 1 salinan | SATUKAN | BUTUH KEPUTUSAN | area-14§14.4 |
| SCAR-089;TG-124 | Teks dari luar = DATA, bukan perintah (kontrak `instructions`) | KEEP | BUTUH KEPUTUSAN | area-14§14.5 |
| SCAR-042 | `/reload-plugins` putus semua koneksi MCP (catat di rilis) | KEEP catat | BUTUH KEPUTUSAN | area-14§14.7 |
| K-16 | Kebijakan bahasa: source Inggris, AI ikut user, mesin Indonesia | KEPUTUSAN BARU | BUTUH KEPUTUSAN | area-14§14.8 |
| TG-111 | Ekstraksi kutipan masuk (quote-reply user) | KEEP | BUTUH KEPUTUSAN | rekon area-02§2.4 — separuh dari B-10, belum didesain |
| TG-067 | `assertAllowedChat` — gate outbound eksplisit | KEEP(ambigu) | BUTUH KEPUTUSAN | rekon (catatan tambahan) — desain baru beda total, cukup tapi tak identik |

**Bagian 6: 41 item — 41 BUTUH KEPUTUSAN.**

---

## Bagian 7 — Temuan portabilitas Windows (Task 0, 2026-07-31)

Seluruh pekerjaan Tahap 1–2.5 lahir dan diuji hanya di macOS. Task 0 menjalankannya
pertama kali di Windows 11 (Bun 1.3.11). **Kesimpulan utama: `fleetd` JALAN di
Windows.** `bun run src/main.ts` menyala, `bun run doctor` menjawab `"ok": true`,
socket dan `conversations.db` berfungsi. K-14 tidak tersentuh.

**Hasil test saat pertama dijalankan:** fleetd **68/69** hijau (+3 galat teardown),
cc-plugin **19/22** hijau. Keempat kegagalan fleetd dan ketiga kegagalan cc-plugin
**semuanya artefak harness uji, bukan cacat kode produk** — masing-masing dibuktikan
terpisah di bawah.

**Setelah perbaikan `0605ebe` (test-only, tidak ada berkas `src/` yang disentuh):
fleetd 69/69 dan cc-plugin 22/22 hijau di Windows**, diverifikasi tiga kali
berturut-turut.

**Setelah `b0cc2f5` (W-4, satu-satunya perubahan kode produk): fleetd 73/73
(baseline naik 69 → 73, empat test baru) dan cc-plugin 22/22.** Kedua jalur W-4
juga diuji pada daemon sungguhan, bukan hanya lewat test. **Yang tersisa: W-3 dan
W-7**, dua-duanya `BUTUH KEPUTUSAN` dan tidak memblokir Task 3.

**Satu jebakan yang ikut ditutup saat memperbaiki W-4:** berlangganan event `error`
sama sekali membuat node tidak lagi mengangkatnya sebagai *unhandled error event*.
Menambahkan handler kegagalan-bind karena itu nyaris menukar satu kegagalan senyap
dengan yang lain — error yang datang **setelah** bind sukses jadi tertelan. Error
pasca-listening kini tetap dilaporkan, lewat jalur terpisah.

**Fakta akar yang menjelaskan sebagian besar temuan:** di Windows, Bun memakai
**AF_UNIX asli** (Windows 10 1803+), bukan named pipe. Berkas socket benar-benar
dibuat di disk — `readdir` dan `Test-Path` melihatnya — tetapi `stat()` atasnya
mengembalikan **`EACCES`**, sehingga **`fs.existsSync()` selalu menjawab `false`
untuk socket yang hidup.** Ini bukan dugaan: dibuktikan dengan probe langsung.

### ⚠️ Koreksi 2026-07-31 — sebagian "temuan" ini sudah terdaftar sejak awal

Task 0 pertama kali mencatat W-1..W-8 seolah semuanya baru. **Itu keliru.** Spec
§3.3 sudah memuat daftar scar tissue Windows yang wajib dipasang saat platform itu
disasar, dan tiga hal di bawah adalah anggotanya — bukan penemuan:

| Yang saya catat | Sebenarnya | Akibat |
|---|---|---|
| **W-7** (config ber-BOM membunuh `fleetd`) | **SCAR-026 (CRLF/BOM)** | Bukan temuan baru; sudah diantisipasi sejak audit. Statusnya turun jadi rujukan silang |
| Penguncian permission `config.json` lewat `icacls` | **SCAR-024** (`chmod` no-op → strategi ACL) | Kebetulan sudah mengikuti strategi yang benar |
| **W-2** (`rmSync` EBUSY) | Bertetangga **SCAR-022** (retry `renameSync` EPERM/EBUSY untuk antivirus) | Kelas yang sama: handle Windows belum lepas saat operasi berikutnya jalan |

**Yang benar-benar baru tinggal W-1, W-3, W-8** — ketiganya menyangkut AF_UNIX di
Bun/Windows, yang memang belum ada di daftar §3.3 karena daftar itu lahir dari
sistem lama yang tidak memakai unix socket.

**Pelajaran prosesnya:** aturan keempat menyuruh mencatat temuan baru, tapi tidak
menyuruh **memeriksa dulu apakah ia benar-benar baru**. Tiga dari delapan ternyata
sudah terdaftar. Sebelum menambah baris ke sini, sisir dulu spec §3.3 dan daftar
SCAR di area-01..14.

**Juga sudah dipatuhi tanpa disadari:** §3.3 melarang menyebar cabang `if (windows)`
untuk jalur yang belum bisa diuji siapa pun. Perbaikan `0605ebe` dan `b0cc2f5`
tidak menambahkan satu pun — semuanya netral-platform.

| ID | Temuan | Sifat | Bukti | Status |
|---|---|---|---|---|
| **W-1** | `existsSync()` bohong untuk socket hidup di Windows (`stat` → EACCES). Menjatuhkan gerbang kesiapan `e2e.test.ts:192-206` → **1 test merah nyata**. Juga membuat pembersihan socket basi di `fleetd/src/socket/server.ts:28` jadi no-op permanen di Windows | Test-only | Probe: `readdir` melihat berkas, `existsSync` `false`, `lstat` EACCES. Restart di atas socket basi **diuji dan tetap berhasil** — jadi no-op itu tidak berbahaya | **SELESAI** `0605ebe` — gerbang diganti `readdir()` |
| **W-2** | `rmSync(home, {recursive, force})` di `afterAll` e2e melempar **EBUSY**: `fleetdProc.kill()` kembali sebelum proses anak melepas handle SQLite/socket. **Sekelas SCAR-022** (retry EPERM/EBUSY), bukan temuan mandiri | Test-only | 3 galat teardown, ketiganya muncul sebagai test `(unnamed)` | **SELESAI** `0605ebe` — tunggu `proc.exited` sebelum `rmSync` |
| **W-3** | Path socket dibatasi **~107 karakter** (`sockaddr_un.sun_path` = 108 byte). Lebih dari itu → `Failed to listen`. Path produksi (`~/.claude/mirza-bots/fleetd.sock`, 44 karakter) aman; `MIRZA_BOTS_HOME` yang dalam **tidak** aman | Batas nyata, belum menggigit | Bisect: 101 char OK, 111 char gagal. macOS lebih ketat lagi (104) | BUTUH KEPUTUSAN (validasi panjang path saat start?) |
| **W-4** | **`fleetd/src/main.ts:308` mencetak `fleetd listening on …` tanpa syarat** — padahal `server.listen()` asinkron, jadi baris itu ikut tercetak saat listen GAGAL. Pesan liveness yang berbohong, dan daemon tetap hidup dalam keadaan tuli | **Cacat kode nyata, lintas-platform** | Teramati langsung: `listening on …` lalu `Failed to listen at …` di proses yang sama. Test regresi tingkat daemon sempat merah persis begitu, berikut proses yang menggantung sampai batas 10 detik | **SELESAI** `b0cc2f5` — `startSocketServer` dapat callback `onListening`/`onListenError` yang di-subscribe **sebelum** `listen()`; `main.ts` mengumumkan dari event, dan pada gagal bind melapor lalu `exit(1)` |
| **W-5** | 2 test cc-plugin meng-assert pemisah path POSIX (`/tmp/…`, `${home}/.claude/…`); `join()` di Windows menghasilkan `\` | Test-only, kosmetik | `main.test.ts:9,21` | **SELESAI** `0605ebe` — ekspektasi dibangun dengan `join()` |
| **W-6** | `await expect(promise).rejects.toThrow()` di `bun test` Windows **tidak pernah settle** bila penyelesaian promise bergantung pada event `close` socket — menggantung tanpa batas (diuji >120 detik). Membuat 1 test cc-plugin merah | Test-only (cacat Bun di Windows) | Kode produksi terbukti BENAR lewat 3 jalur: `bun run` standalone, `bun test` dengan `try/catch`, dan 4 varian buildup — semuanya menolak dengan `connection lost`. Hanya bentuk `expect().rejects` yang gagal | **SELESAI** `0605ebe` — diganti `try/catch` |
| **U-1** | **Aturan `inline-buttons` terlalu sering menyala.** Pemicunya mekanis — "balasan diakhiri tanda tanya → wajib buttons" — sehingga tidak bisa membedakan pertanyaan yang jawabannya satu tap dari pertanyaan terbuka yang jawabannya paragraf | Keluhan UX langsung dari user, 2026-08-01 | User: *"cukup mengganggu juga kalau setiap saat keluar buttons"* | BUTUH KEPUTUSAN — usul: ganti pemicu jadi **"jawaban yang diharapkan bisa dipilih dari daftar pendek"**. Konfirmasi & menu tetap; pertanyaan terbuka tidak. Menyentuh plugin `inline-buttons` di marketplace **lama** |
| **U-2** | **Keyboard tidak dicopot setelah tombol ditap — hanya di sistem BARU.** `fleetd` memanggil `answerCallbackQuery()` (spinner berhenti) tapi tidak pernah mengedit pesannya, jadi tombol yang sama bisa ditap berulang | Gap nyata di `fleetd` | Sistem **lama** sudah benar: `server.ts` melakukan `editMessageText` tanpa `reply_markup`, keyboard hilang dan teksnya ditambahi `→ <label>`. Sistem baru belum | BELUM — port perilaku sistem lama ke `fleetd`. Rumahnya kemungkinan 2.5-KELUAR (menyentuh jalur keluar) atau GUARD |
| **U-3** | **AI tidak boleh pernah meminta `message_id` ke user.** User tidak pernah melihat id itu dan tidak bisa mengaksesnya | Perilaku AI, bukan desain | Desainnya sudah benar: user cukup **quote**, id datang sendiri lewat `meta.reply_to_message_id`. Kalau AI sampai bertanya, itu salah perilaku | BELUM — pertegas deskripsi tool `read_history` agar eksplisit melarang menanyakan id ke user |
| **U-4** | **Waktu disimpan UTC tanpa orientasi lokal.** `ts` benar (`00:37:29Z` = `07:37:29` WIB) tapi AI tidak bisa tahu user sedang begadang atau tidak | Fitur yang hilang, bukan bug | User: *"orientasi waktu itu penting bagi bot agar memahami kondisi user"* | BUTUH KEPUTUSAN — usul: **tetap simpan UTC** (tidak ambigu, bisa diurutkan, kebal DST) dan tambahkan `timezone` di config utama supaya AI **menampilkan** waktu lokal. Menyimpan waktu lokal di database adalah kesalahan yang tidak bisa diputar balik |
| **W-10** ⚠️ | **`cc-plugin` tidak punya Stop hook.** Sistem lama punya: kalau percakapan Telegram berakhir tanpa `reply` sejak pesan terakhir masuk, hook memblokir sekali dan memaksa AI menjawab. Di sistem baru tidak ada penjaga apa pun — AI yang lupa `reply` menghasilkan **diam total** | **Celah nyata, diperparah protokol terse-turn** | Ditemukan 2026-08-01 saat user melaporkan pesannya sempat tidak dibalas di bot uji. Dibuktikan **bukan** 409 (satu `fleetd`, token berbeda) dan **bukan** `fleetd` menjatuhkan pesan (`bot_inbox` 0 baris, `incidents` 0, ke-12 pesan tersimpan). Sisa tersangka: sesi AI-nya | BUTUH KEPUTUSAN — rumahnya kemungkinan **2.5-GUARD**. **Kenapa mendesak:** terse-turn melatih AI menutup giliran dengan "." saja, sehingga "sudah `reply` lalu tutup" dan "lupa `reply` lalu tutup" jadi **tak terbedakan dari luar**. Protokol itu menaikkan risiko kelas kegagalan yang justru paling mahal di proyek ini (bot bisu tanpa pemberitahuan) |
| **W-9** | `album_failed_count` / `album_total_count` di `meta` dipancarkan **setiap kali** ada unduhan gagal — termasuk untuk foto tunggal yang bukan bagian album. Namanya jadi berbohong soal konteks | Penamaan, bukan perilaku | Ditemukan saat Task 5 (`1123446`); brief memang menentukannya begitu | BUTUH KEPUTUSAN — **jangan digating ke `isAlbum` begitu saja**: teks pemberitahuannya sudah album-only, jadi menggating counter-nya membuat kegagalan unduh foto tunggal **tidak terlihat sama sekali**. Yang benar kemungkinan mengganti nama jadi `attachment_failed_count` |
| **W-8** | Konek ke socket yang **belum** ada memancarkan error yang test runner `bun` kaitkan ke test yang sedang berjalan, **sekalipun sudah ada listener `error` yang menanganinya** dan `try/catch` melingkupinya. Di `bun run` (bukan `bun test`) handler yang sama bekerja normal | Test-only (cacat Bun di Windows) | Ditemukan saat memperbaiki W-1: gerbang probe-konek justru menjatuhkan test yang seharusnya ia jaga | DIHINDARI `0605ebe` — gerbang menunggu entri `readdir` dulu, jadi tidak pernah konek ke ruang kosong. Akar di Bun belum dilaporkan ke hulu |
| **W-7** | `config.json` ber-BOM UTF-8 membuat `fleetd` mati saat start dengan `JSON Parse error: Unrecognized token '﻿'`. Alat Windows (PowerShell `Set-Content -Encoding utf8`) menghasilkan BOM secara default | **BUKAN temuan baru — ini SCAR-026 (CRLF/BOM)**, sudah terdaftar di spec §3.3 | Teralami langsung saat menyiapkan config uji; jadi konfirmasi lapangan bahwa SCAR-026 memang masih menggigit | BUTUH KEPUTUSAN — sama seperti sebelumnya (strip BOM, atau pesan galat yang menyebut BOM), tapi dikerjakan sebagai bagian SCAR-026, bukan sebagai item terpisah |

**Yang TIDAK terjadi** (hipotesis yang diuji lalu gugur — dicatat supaya tidak
diselidiki ulang):

- `fleetd` **tidak** gagal restart setelah mati tak bersih. Meski pembersihan socket
  basi tak pernah jalan (W-1), `bind()` AF_UNIX Windows menimpa berkas lama. Diuji:
  bunuh `fleetd`, berkas `.sock` bertahan, `fleetd` baru menyala dan `doctor` `"ok": true`.
- Penutupan socket **tetap** merambat ke peer di Windows. `FleetdClient.failAll` bekerja
  sebagaimana dirancang; W-6 murni soal helper assertion.
- Windows **tidak** memakai named pipe untuk ini — tidak ada entri di `\\.\pipe\`.

