# Playbook Rewrite Harness — Best Practices, Do's & Don'ts

**Ditulis:** 2026-07-06 oleh bot-03 (Claude Fable 5 / Opus 4.8), sesi `task-harness-rewrite-phase0`.
**Untuk:** bot penerus yang melanjutkan rewrite `mirza-harness` (E1'→E2'→E3' fase 2, lalu fase 3).
**Kenapa ada:** Fable 5 tidak akan tersedia mulai Rabu; dokumen ini merekam *cara kerja* yang terbukti menghasilkan 3 fase (0/1/2) dengan ~850 test hijau dan nol bug lolos ke live selain yang tertangkap uji manual. Ini bukan status proyek (itu di plan docs + ledger) — ini *metodologi*.

> **Baca dulu, berurutan:** (1) `docs/2026-07-03-harness-rewrite-design.md` (kitab arsitektur), (2) plan fase terkait di `docs/superpowers/plans/`, (3) `.superpowers/sdd/progress.md` di repo `mirza-harness` (ledger apa yang sudah selesai + carry-forward), (4) `.superpowers/sdd/f2/` (recon + report per task). Dokumen INI adalah lapisan "bagaimana", ketiga itu "apa/di mana".

---

## 0. Prinsip induk (kalau cuma baca satu bagian, baca ini)

1. **Mandor-orkestrator, bukan tukang.** Sesi utama (kamu) JANGAN menulis kode fitur sendiri. Tugasmu: pecah kerja, susun brief tajam, dispatch subagent, review, commit, koordinasi user. Kode ditulis subagent. Ini menjaga konteksmu tetap panjang umur untuk mengorkestrasi, bukan habis untuk detail implementasi.
2. **Setiap task lewat loop: implement → review adversarial → fix → re-review → commit.** Tidak ada task yang di-commit tanpa reviewer independen mencoba membobolnya. Loop ini yang menangkap SEMUA bug serius fase 2 (bypass trailer-guard 4 kelas, shutdown-hang pty-holder, antrean-beku supervisor, regresi reply-guard) SEBELUM masuk main.
3. **User yang pegang kemudi.** Tiap fase + tiap keputusan desain non-sepele → konfirmasi user dulu (design doc §9). Angkat keputusan dengan rekomendasi + inline buttons, jangan survei kosong.
4. **Inventaris 529 item = kontrak, bukan saran.** Centang HANYA yang verified-live. Hapus/ganti fitur = keputusan sadar + persetujuan user + anotasi `DIHAPUS/DIGANTI` beralasan. Jangan ada fitur hilang diam-diam.
5. **TANPA Claude Agent SDK / `claude -p`** — mutlak, keputusan billing user. Substrat = TUI interaktif via PTY. "PTY untuk input, hooks untuk output."

---

## 1. DO's — yang terbukti bekerja

### Orkestrasi
- **DO fan-out subagent paralel untuk task yang file-nya disjoint.** Gelombang fase 2 dijalankan 3-4 subagent sekaligus (mis. P1∥H4∥X2). Hemat wall-clock drastis.
- **DO serialize kalau ada overlap file.** H1 & H2 sama-sama menyentuh `hooks.json` → jalankan sebagai sub-gelombang berdua (bukan berempat), rekonsiliasi file bersama saat review. Cek overlap SEBELUM dispatch: kalau dua task menyentuh file sama non-additive, jangan paralel.
- **DO pakai peta dependensi di plan** untuk menentukan urutan gelombang. Plan fase punya blok ASCII "peta dependensi" — ikuti itu.
- **DO commit per-scope oleh controller, BUKAN subagent.** Instruksikan tiap subagent: "JANGAN git add/commit/push". Kamu yang `git add <file scope>` + commit setelah review lolos. Ini mencegah race di git index saat subagent paralel + memberimu titik kontrol kualitas.
- **DO potong plan jadi brief per-task** (`.superpowers/sdd/<fase>/task-<X>-brief.md`) dan berikan path-nya ke subagent, jangan paste seluruh plan. Konteks subagent tetap fokus.

### Brief subagent (ini seni yang menentukan kualitas)
- **DO sebut "kode acuan" dengan `file:line` persis** yang harus dibaca subagent, plus "port, jangan tulis ulang". Rewrite dari nol = bug baru + fitur hilang.
- **DO daftarkan bug backlog yang HARUS difix saat porting** (SEC-3, LOSS-*, FUNC-*, dst) di brief — "jangan port bug-nya".
- **DO daftarkan SCAR (scar-tissue) yang jadi test case wajib** — timing/ConPTY/quirk yang pernah menggigit.
- **DO batasi file yang boleh disentuh** ("HANYA sentuh X, Y") + "JANGAN sentuh Z (task paralel)". Cegah tabrakan.
- **DO minta subagent membuat modul INJECTABLE** (factory/deps) supaya bisa diuji tanpa spawn proses nyata/HTTP/PTY. Contoh: pty-holder `spawnHolder` fn, supervisor `SpawnHolderFn`, session-ops `SessionOpsClient`. Test murni logika di `bun test`; integrasi nyata di script terpisah non-suite.
- **DO minta laporan ditulis ke file** (`task-<X>-report.md`) + balasan akhir HANYA status ringkas. Jangan biarkan subagent nge-dump ke konteksmu.

### Review (jantung kualitas)
- **DO dispatch reviewer independen tiap task** dengan diff scope (`git diff -U8 -- <file scope> > task-X-diff.txt`), brief, dan report sebagai input file.
- **DO minta reviewer MENCOBA MEMBOBOL**, bukan cuma cek spec. Brief reviewer keamanan-kritis: "coba loloskan kasus yang harusnya block, tulis PoC, jalankan". Reviewer trailer-guard menemukan 4 kelas bypass justru karena diminta menyerang.
- **DO pakai Opus untuk review task terberat/integratif** (S1 supervisor, D2 assembly, final whole-branch). Sonnet cukup untuk task fokus. Haiku untuk fix mekanis kecil.
- **DO re-review setelah fix** — kirim diff pasca-fix ke reviewer YANG SAMA (SendMessage ke agentId-nya) supaya dia verifikasi temuannya sendiri tertutup + cari regresi baru.
- **DO minta reviewer verifikasi mandiri** (`bun test` + typecheck sendiri, bukan percaya laporan) dan baca file LANGSUNG, bukan hanya diff.
- **DO triase temuan:** Critical/Important = fix sebelum commit; Minor = catat di ledger untuk fase berikut. Jangan gold-plate Minor.

### Git & verifikasi
- **DO commit trailer** `Agent: bot-03` (ganti nama botmu) + `Co-Authored-By: ...` tiap commit; **push segera** (SOP git multi-agent — commit lokal = kandidat hilang).
- **DO jalankan `bun test` + `bun run typecheck` sebelum tiap commit** dan pastikan hijau. Angka test naik tiap task = sinyal sehat.
- **DO catat ke ledger** `.superpowers/sdd/progress.md` tiap task selesai: commit hash + carry-forward (Minor yang ditunda). Ini peta recovery kalau konteks di-compact.
- **DO `.gitignore` yang benar** — pakai `/state/` (root-anchored) bukan `state/` (menelan `packages/**/state/`). Salah satu bug nyata yang tertangkap.

### Komunikasi user
- **DO lapor tiap milestone** ringkas (gaya teach-me untuk penjelasan, ringkas untuk status).
- **DO angkat keputusan desain dengan rekomendasi + inline buttons**, bukan pertanyaan terbuka kosong.
- **DO jujur soal cakupan parsial** — mis. "reply verified untuk text+buttons, files/format belum". Jangan over-claim.
- **DO minta input yang hanya user bisa beri** tepat saat dibutuhkan (token bot, keputusan pilot), bukan di awal.

---

## 2. DON'Ts — jebakan yang sudah kena / nyaris kena

- **DON'T tulis kode fitur sendiri sebagai controller.** Sekali kamu masuk detail implementasi, konteksmu habis dan orkestrasi runtuh.
- **DON'T paralel-kan task yang menyentuh file sama non-additive.** `rpc-handlers.ts`/`server.ts`/`main.ts` sering jadi titik tabrakan — serialize atau bagi scope.
- **DON'T percaya laporan subagent tanpa verifikasi.** Selalu ada reviewer independen yang jalankan test sendiri. Laporan bisa salah hitung (angka test), over-claim ("AI sees real shape" padahal schema opaque), atau melewatkan gap (X1 legacy-writer tak ter-wire — implementer TAK menyebutnya, reviewer yang menemukan).
- **DON'T anggap "unit test hijau" = "jalan di live".** Uji live fase 1 menemukan `answerCallbackQuery` tak diport (spinner Telegram muter selamanya) — 457 unit test tak menangkapnya. SELALU ada tahap uji manual live per fase.
- **DON'T port bug lama.** Cek backlog untuk tiap modul yang diangkut. Contoh: LOSS-6 (poller zombie), FUNC-3 (reply-guard "ack=jawaban"), FUNC-4/5 (trailer-guard PowerShell lolos).
- **DON'T lewati konfirmasi user per fase** (design doc §9). User AKTIF ingin dilibatkan.
- **DON'T rewrite dari nol saat brief bilang "port".** Kesetiaan ke kode acuan (konstanta pacing PERSIS, key legacy PERSIS) = syarat kompatibilitas. Shim yang salah satu key-nya beda = bot lama tak bisa baca pilot.
- **DON'T tinggalkan commit belum di-push.** Insiden 2026-06-07: 25 commit lokal hilang saat updater re-clone. Push segera.
- **DON'T edit/commit di `~/.claude/plugins/**`** (three-copy doctrine). Kerja di `workspace/<repo>`. Cek `git rev-parse --show-toplevel` sebelum commit.
- **DON'T anggap force-kill = SIGTERM cukup.** Holder wedged abai SIGTERM → zombie. Eskalasi ke SIGKILL + konfirmasi exit (temuan S1-I2).
- **DON'T pakai timeout seragam untuk operasi beda-kelas.** `/clear` (barrier resolve, boleh 120s) vs `/rename` (keystroke, cepat) — timeout sama = `/new` gagal palsu (temuan S2-I1).
- **DON'T biarkan flag "sticky" se-sesi kalau maksudnya "yang terakhir".** reply-guard `telegramDriven` sticky → salah-block turn lokal (regresi FUNC-3 fix). Track posisi terakhir.
- **DON'T gunakan `state/` bare di gitignore** — anchor dengan `/state/`.

---

## 3. Pola teknis yang sudah mapan (ikuti, jangan reinvent)

- **In-process wiring, RPC hanya di boundary proses.** telegram-adapter, supervisor, session-ops, bus, state — semua hidup DI DALAM `hostd`, saling panggil langsung (fungsi/deps injectable). RPC JSON-RPC HANYA untuk cc-stub↔hostd (lintas proses via named pipe). Jangan bikin RPC internal.
- **Deps injectable + factory** untuk semua yang menyentuh IO/PTY/HTTP/clock → test murni pakai fake, integrasi nyata di script terpisah (`test-integration-*.ts` / `.mjs`, dijalankan manual, BUKAN di `bun test`).
- **zod `.strict()` di tiap boundary** (IPC, bus enqueue, hook POST, pending consumer, RPC params). Titik validasi tunggal di hostd.
- **Ack dua tingkat** untuk injeksi: `injected` event (keystroke tertulis) ≠ selesai semantik (SessionStart untuk /clear, sessions.name berubah untuk /rename). `{queued:true}` = accepted, BUKAN done.
- **Shim ber-tanggal-pensiun.** Modul legacy terpisah, `PENSIUN_DATE` + `isExpired`, doctor warning bila masih aktif lewat tanggal. Key file legacy PERSIS (snake_case vs camelCase sesuai pembaca lama — verifikasi ke KONSUMEN, bukan asumsi).
- **doctor jangan baca `ok`** (hardcoded true, limitasi tercatat) — baca `components.adapters`/`components.bus`/`components.supervisors`.
- **Karantina, bukan drop diam-diam.** Payload rusak → `.rejected-<ts>` + warning terlihat doctor. "Setiap kegagalan harus terlihat" (design §2.5).

---

## 4. Cara handoff antar bot (mekanisme yang dipakai estafet ini)

Estafet ini: bot-02 (riset+design) → bot-03/aku (eksekusi fase 0-2) → berikutnya (E1'→E3').
- **File handoff** di `<repo>/.handoff/<timestamp>-<slug>.md` — 10 section: tujuan, konteks, SUDAH/SEDANG/AKAN, blocker, referensi (bertanda "di awal" vs kondisional), keputusan user, anti-patterns/lessons.
- **Penerima:** baca file handoff PERSIS yang ditunjuk (jangan cari "latest"), rename session, ACK dua arah (agent-bus ke pengirim + Telegram ke user), baca referensi "di awal", gate adaptif (Blocker ≠ "—" → tanya user), lalu eksekusi.
- **Pengirim (kamu, nanti):** invoke skill `handoff`, pilih mode, isi template, kirim via agent-bus, tunggu ACK. Untuk soak 72 jam: pertimbangkan mode monitoring/goal ketimbang estafet penuh.
- **Cek konteks berkala** via `agent_status` diri sendiri. Ambang ~75-80% = siapkan handoff. Jangan sampai compaction jatuh di tengah langkah kritis.

---

## 5. Sisa pekerjaan (per 2026-07-06) + urutan

Semua kode fase 2 + assembly SELESAI (`fc72e41`, 847 test). Yang tersisa = eksekusi live:

1. **PRASYARAT E2' (WAJIB sebelum fleet campuran):** wire X1 `createLegacyWriter` (`onSessionChange`/`onHeartbeat`/`onBoot`/`onShutdown`) di `main.ts`. Reviewer assembly menemukan ini belum ter-wire — shim mati tanpa ini, bot lama tak bisa baca pilot. E1' bot-07 standalone TIDAK butuh (tak ada peer lama). Task #35 di tracker.
2. **E1' mini-pilot:** boot `hostd` assembled dengan config bot-07 → supervisor spawn pty-holder → CC ASLI hidup di workspace bot-07 (cc-stub terpasang sebagai plugin: `.mcp.json` + `hooks/hooks.json`). Uji live: DM→AI beneran; `/new` dari Telegram nge-clear + nama benar TANPA polling; `/rename`; reply-guard block kalau AI lupa balas; trailer-guard PowerShell. Runbook fase 1 (`packages/hostd/E1-RUNBOOK.md`) jadi acuan pola; sesuaikan untuk CC nyata.
3. **E2' pilot bot-06 + soak 72 jam:** migrasi bot-06, shim aktif (butuh #1), uji silang handoff & agent_send bot-lama↔pilot, monitor doctor 72 jam (kriteria: 0 dead-letter tak terjelaskan, holder tak restart-loop, shim segar). Ini monitoring pasif — cocok di-handoff/goal-mode.
4. **E3' centang inventaris** PTY-*/BUS-*/SKILL-* verified-live + DIHAPUS/DIGANTI beralasan (kandidat: pty_list_agents DIGANTI agent_list [CONS-3, sudah disetujui user], PTY file-IPC DIGANTI bus/shim, LOSS-1 items).

**Keputusan user yang sudah FINAL (jangan tanya ulang):** runtime pty-holder = Node; pilot = bot-06; reply-discipline hook fase 2 / merge teks fase 3; pty_list_agents DIGANTI agent_list. Token bot-07 sudah ada di `hostd.config.json` (di luar git). Sesi desain Obsidian vault (Task O) DITUNDA atas permintaan user — setelah E1', agenda: handoff-vault, second-brain lintas-bot, "anti lupa" via hook (bukan tambah teks skill).

---

## 6. Carry-forward Minor (dari ledger — fase 3 / non-blocking)

Tercatat di `.superpowers/sdd/progress.md`. Ringkas yang penting: meta-output tak ter-log messages-store (audit gap); item-hantu keystroke pasca-timeout session-ops; LOSS-1 encodeProjectDir warisan (listSessions bisa kosong utk path non-alnum); lock staleness timeout-only; command-substitution `$(...)` tak tertangkap trailer-guard (out-of-scope, tak realistis); bot_id/from RPC belum diikat ke identitas socket (defense-in-depth cross-bot); doctor.ok hardcoded.

---

*Satu kalimat penutup untuk penerus:* metodologi ini lambat per-task (implement→review→fix→re-review) tapi cepat secara keseluruhan — karena nyaris tak ada bug yang balik menghantui. Pertahankan disiplin review adversarial; itu yang membedakan "kode yang lolos test" dari "kode yang jalan di tangan user". — bot-03 (Fable 5)
