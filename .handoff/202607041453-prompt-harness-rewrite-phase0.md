# Harness Rewrite — Mulai Fase 0 (Skeleton mirza-harness)

**Date:** 2026-07-04 14:53 (UTC+7)
**Repo kerja:** C:\Users\Mirza\workspace\mirza-marketplace
**Branch:** main (HEAD: a2ae93b)
**Dari → Ke:** bot-02 → bot-03
**Pair:** —
**Lanjutan dari:** —
**Plan terkait:** `docs/2026-07-03-harness-rewrite-design.md` §9 — fase 0/3 (belum dimulai)

---

## 1. Tujuan Handoff

Perintah user (context bot-02 sudah dalam setelah sesi panjang riset→audit→inventaris→design). Goal estafet: **mengeksekusi rewrite harness bot sampai selesai, dimulai dari Fase 0** (skeleton repo `mirza-harness`), dengan design doc yang sudah DISETUJUI sebagai kitab.

## 2. Konteks Proyek

Mirza menjalankan fleet 6 bot Claude Code (bot-01…06, workspace `C:\Users\Mirza\workspace\bot-0X`) yang dikendalikan dari HP via Telegram. Harness-nya = plugin-plugin di repo ini (telegram, pty-controller + wrapper mirza-cc, agent-bus, + 8 skill behavioral). Pada 2026-07-02/04 user memutuskan **rakit ulang** harness ke monorepo baru `mirza-harness` (daemon `hostd` + pty-holder tipis + cc-stub plugin) karena substrat lama rapuh (scraping PTY + filesystem-as-bus). Sistem lama tetap produksi sampai migrasi selesai.

## 3. Yang Sudah Selesai (SUDAH)

Semua committed & pushed ke `main` repo ini (range `72182a7..a2ae93b` + README `HEAD`):

- Audit menyeluruh 4-subagent atas seluruh harness → arah arsitektur ditulis di `docs/2026-07-02-improvement-backlog.md` bagian "Arah arsitektur target" (`72182a7`). Backlog bug taktis (SEC/LOSS/FUNC/…) ada di file yang sama.
- **Inventaris kapabilitas 529 item** = kontrak penerimaan rewrite: `docs/2026-07-02-capability-inventory/` (`c4f5a47`) — README di folder itu memuat aturan centang (verified-live only; `DIHAPUS/DIGANTI` harus eksplisit + persetujuan user).
- **Design doc DISETUJUI**: `docs/2026-07-03-harness-rewrite-design.md` (`0a746e3`, final `a2ae93b`) — arsitektur target, pemetaan inventaris→rumah baru, shim fase 2, fase 0-3, §10 keputusan (kelimanya FINAL), §11 cara kerja pengembangan (arahan user 2026-07-04).
- README root repo ini diberi banner "Rewrite in progress" (commit terbaru di HEAD).

Belum ada satu baris pun kode mirza-harness yang ditulis — fase 0 belum dimulai.

## 4. Yang Sedang Dikerjakan (SEDANG)

—  (berhenti di titik bersih: design selesai, eksekusi belum mulai)

## 5. Blocker

—  (token Telegram bot uji ke-7 BARU dibutuhkan di fase 1 — minta ke user saat fase 1 dimulai, bukan blocker fase 0)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** Fase 0 selesai per definisi §9 design doc: repo `mirza-harness` boot-able — `hostd` kosong bisa jalan dan `/doctor` menjawab.

Langkah konkret:
1. Baca design doc PENUH (`docs/2026-07-03-harness-rewrite-design.md`) — itu kitabnya; jangan eksekusi dari ringkasan ini.
2. Susun plan singkat fase 0 (superpowers writing-plans; spec besar tidak perlu — design doc sudah jadi spec) lalu **konfirmasi ke user sebelum mulai** (§9: tiap fase wajib konfirmasi).
3. Eksekusi: buat `C:\Users\Mirza\workspace\mirza-harness` (git init + repo GitHub bila user setuju) — layout §7: `packages/{hostd,pty-holder,telegram-adapter,cc-stub,shared}`, `.gitattributes` (`* text=auto eol=lf`) sejak commit pertama, Bun workspaces, CI minimal (`bun test` + `tsc --noEmit`), draft skema SQLite (§4.4), protokol IPC JSON-RPC + skema zod (§4.1), skeleton hostd boot + `/doctor` stub.
4. Kerjakan sebagai **mandor-orkestrator** (§11): petakan dulu mana yang standalone vs depend-on, fan-out subagent paralel untuk bagian independen.

**Starting point:** branch `main` repo ini; baca dulu design doc §7 + §9.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| `~/.claude/agent-playbook/PLAYBOOK.md` | Di awal — CATATAN: file live TERHAPUS sejak 2026-06-21 (tinggal `.deleted-backup-20260621`); bila tidak ada, skip — aturan kerja pakai skill `bot-conduct` |
| `docs/2026-07-03-harness-rewrite-design.md` | Di awal — source of truth arsitektur + fase; posisi fase 0/3 |
| `docs/2026-07-02-capability-inventory/README.md` | Di awal — aturan kontrak penerimaan; file per-prefix dibaca per-item SAAT porting modul terkait (fase 1+) |
| `docs/2026-07-02-improvement-backlog.md` | Kondisional — bagian "Arah arsitektur target" bila butuh rationale; item bug SAAT porting modul terkait (jangan port bug-nya) |
| `docs/SOP-git-multi-agent.md` | Sebelum commit pertama di repo bersama mana pun |

## 8. Keputusan User Lewat Brainstorming

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| Perbaiki incremental atau rewrite? | **Rewrite / rakit ulang** (2026-07-02) | Inventaris 529 item = pagar anti-fitur-hilang; sistem lama tetap produksi |
| Pakai Claude Agent SDK? | **TIDAK, mutlak** (billing tak pasti, email Anthropic 14 Mei & 16 Juni 2026) | Substrat tetap TUI interaktif via PTY; "PTY untuk input, hooks untuk output" |
| Nama monorepo/daemon | `mirza-harness` / `hostd` | — |
| Runtime | Bun + TypeScript | Modul teruji diangkut utuh dengan test-nya |
| Poller Telegram | 6 poller grammy dalam 1 hostd (per token, di-supervisi) | SPOF diterima dengan mitigasi supervisi |
| Bot uji fase 1 | Bot ke-7, token baru dari user | Minta token saat fase 1 mulai |
| `edit_message` | DIHAPUS dari permukaan tool | Centang inventaris terkait sebagai `DIHAPUS` dengan rujukan design doc §10.5 |
| Database | Terpusat per mesin: 1 SQLite WAL di hostd, kolom `bot_id` | — |
| Cara kerja | Mandor-orkestrator + **bertanya aktif** ke user (gaya teach-me) untuk tiap keputusan desain; fix bug lama saat porting; audit skill bertele-tele/konflik | Lihat design doc §11 |
| Obsidian second-brain | Requirement baru: bot memanfaatkan vault (belajar sebelum kerja, setor pelajaran sesudahnya) | Desain detail BERSAMA user di fase 1 — jangan implementasi diam-diam |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

- ❌ JANGAN mengusulkan Agent SDK / `claude -p` dalam bentuk apa pun (keputusan billing user — sudah dua kali ditegaskan).
- ❌ JANGAN mulai eksekusi fase tanpa konfirmasi user (design doc §9) — user AKTIF ingin dilibatkan; jelaskan keputusan desain gaya teach-me + inline buttons.
- ❌ JANGAN port bug lama saat mengangkut modul — cek backlog untuk modul yang disentuh.
- ❌ JANGAN edit/commit di `~/.claude/plugins/**` (three-copy doctrine; insiden 25 commit hilang 2026-06-07).
- ✅ Commit dengan trailer `Agent: bot-03`, push segera setelah commit.
- ✅ User membaca via HP Telegram — laporan ringkas, tabel pendek, file dilampirkan bila diminta.

## 10. Catatan Lain

- Artefak sesi bot-02: commit `72182a7` (arah arsitektur), `c4f5a47` (inventaris), `0a746e3` (design doc), `2554f39` (keputusan+§11), `a2ae93b` (final approve), + README banner (HEAD saat handoff).
- `mirza-harness` BELUM ada — dibuat di fase 0. cc-stub kelak tetap dirilis via marketplace ini.
- Ekspektasi user eksplisit: "multiple bot yang berjalan di atas claude-code agent dan bisa bekerja untuk saya" — rewrite ini sarananya, bukan tujuan akhir.
