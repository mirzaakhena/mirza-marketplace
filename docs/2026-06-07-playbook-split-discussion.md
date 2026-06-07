# Diskusi (beku): Split Playbook/Lessons menjadi Plugin Skill

**Status:** DITUNDA oleh user — menunggu keputusan desain. Dokumen ini
mengabadikan state diskusi 2026-06-06/07 antara user (Mirza) dan bot-05,
karena bot memory akan di-reset total. Bot mana pun yang diminta
"lanjutkan diskusi playbook" mulai dari sini.

## Latar

Playbook lintas-bot saat ini = `~/.claude/agent-playbook/PLAYBOOK.md`,
didefinisikan di bot-conduct Rule 4 (baca sebelum kerja substantif; append
pelajaran durable; 3 section: Proven practices / Mistakes / Gotchas;
konsolidasi >200 baris). Masalah yang memicu diskusi: file mencampur dua
jenis konten dengan lifecycle berbeda, dan pertumbuhannya cepat (≥6
entry/hari saat sibuk) padahal handoff v2 menjadikannya bacaan wajib tiap
estafet.

## Keputusan yang SUDAH disepakati user

1. **Split dua file**: `PLAYBOOK.md` = rules terkurasi, pendek (cap ~100
   baris), murni normatif; `LESSONS.md` = jurnal append-only
   (`Context / Lesson / Apply when`, terbaru di atas) + **ritual promosi**
   (lesson berulang ≥2x → diangkat jadi rule, entry ditandai
   `[PROMOTED]`) + arsip (`LESSONS-archive.md`) saat membengkak.
2. **Plugin baru terpisah** (bukan skill kedua di bot-conduct) — konsisten
   pola plugin single-purpose; bot-conduct Rule 4 menyusut jadi pointer.
3. **Hybrid loading**: PLAYBOOK terkurasi di-import via `@path` di
   `~/.claude/CLAUDE.md` global → auto-inject tiap session SEMUA bot,
   dijamin harness (read path tidak lagi bergantung kepatuhan skill);
   LESSONS tetap lazy (grep on-demand saat debugging / area terkait);
   skill fokus mengatur WRITE path (append, promosi, arsip).

## Pertanyaan TERBUKA (penyebab ditunda)

1. **Tier placement.** User menegaskan perangkat playbook seharusnya hidup
   di workspace PROYEK, bukan workspace bot. Proposal bot-05: **dua tier**
   — (a) global `~/.claude/agent-playbook/` untuk pengetahuan machine-wide
   lintas-proyek (PS 5.1 BOM, cache plugin, dst; auto-import via CLAUDE.md
   global), (b) per-proyek `<repo>/PLAYBOOK.md` + `<repo>/LESSONS.md`
   (di-commit, travel bersama repo; TIDAK auto-loaded karena CWD bot =
   workspace bot → dibaca via skill + via tabel Referensi handoff v2).
   User: "belum bisa memutuskan".
2. **Audit menyeluruh dulu.** Sebelum mendesain plugin, petakan SEMUA
   mekanisme pencatatan dalam satu matriks (scope × loading × penulis ×
   lifecycle): CLAUDE.md global & repo, **bot MEMORY** (auto-memory:
   per-bot, keyed ke project dir, auto-loaded, survive /clear — belum
   pernah diberi peran resmi di arsitektur multi-bot), playbook,
   spec+plan superpowers, `.handoff/` chain, git log. Baru tentukan slot
   kosong mana yang benar-benar butuh plugin baru.

## Insight terkait (dari "handoff darurat" 2026-06-07)

Ada DUA GENRE penyerahan kerja: (a) **estafet** — pekerjaan setengah
jalan, butuh state mid-flight/chain/ACK/lifecycle session = wilayah
handoff v2; (b) **delegasi** — misi terdefinisi rapi ke bot segar, cukup
mission-brief (mandat + aturan kerja + definition of done) + `agent_send`.
Jangan reduksi v2 ke jalur darurat, jangan paksa delegasi lewat upacara
v2. Genre (b) kandidat pola/skill tersendiri.

## Langkah berikutnya bila dilanjutkan

1. User memutuskan pertanyaan terbuka #1 (disarankan: mulai dari audit #2).
2. Brainstorm singkat → spec → plan → implementasi (plugin `playbook`
   0.0.1 + bot-conduct bump + edit `~/.claude/CLAUDE.md` global).
