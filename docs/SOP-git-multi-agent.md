# SOP — Koordinasi Git Multi-Agent (Repo Bersama)

**Status:** berlaku untuk semua bot di mesin ini, untuk SEMUA repo yang
disentuh lebih dari satu agent (bot atau user) — terutama
`~/.claude/plugins/marketplaces/<x>`.
**Ringkasan operasional:** bot-conduct SKILL.md "Rule 7 — Shared-repo git
discipline" (plugin `bot-conduct` ≥ 0.0.3). Dokumen ini adalah detail +
rationale-nya.

## Post-mortem singkat — insiden 2026-06-07

Kronologi:

1. **Rilisan lokal belum di-push.** ±25 commit rilis (handoff 0.0.9,
   telegram 0.0.30-mirza.0, inline-buttons 0.0.7, agent-bus 0.0.7, plus
   spec/plan docs) menumpuk di clone lokal
   `~/.claude/plugins/marketplaces/mirza-marketplace` tanpa pernah di-push
   ke origin.
2. **Bot lain force-push histori squash dari basis lama.** bot-06, bekerja
   dari basis yang tidak memuat commit-commit itu, melakukan force-push
   histori squash satu-commit ("anglicize") ke GitHub. Sinyal bahaya sempat
   terlihat — cache plugin memuat versi LEBIH TINGGI daripada plugin.json
   workspace — tapi dibaca sebagai "tinggal bump melewati angkanya", bukan
   sebagai bukti adanya rilisan unpushed.
3. **Updater me-reclone.** Sistem plugin mengganti seluruh direktori
   marketplaces dengan CLONE BARU dari GitHub (reflog hanya berisi
   `clone:`). 25 commit lokal lenyap; isi repo mundur sementara nomor versi
   maju melewati rilisan yang hilang.
4. **Pemulihan dari cache plugin.** Konten rilisan direstorasi dari
   `~/.claude/plugins/cache/mirza-marketplace/<plugin>/<versi>/` (rilis
   restorasi: handoff 0.0.11, telegram 0.0.32-mirza.0, inline-buttons
   0.0.9, agent-bus 0.0.9). Direktori cache yang sudah distempel
   `.orphaned_at` oleh updater diamankan dulu sebelum dipakai.

Akar masalah ganda: (a) commit rilis ditimbun di direktori yang bisa
di-reclone kapan saja, dan (b) history rewrite dilakukan tanpa memeriksa
clone lain / tanpa koordinasi.

## Doktrin tiga salinan (keputusan user, 2026-06-07 — WAJIB)

Repo marketplace hidup di tiga tempat dengan peran KAKU:

- **(a) `C:\Users\Mirza\workspace\mirza-marketplace` — repo kerja
  KANONIK.** Satu-satunya tempat edit dan commit. Kerja paralel antar bot
  di repo ini memakai worktree (bot-conduct Rule 1).
- **(b) `~/.claude/plugins/marketplaces/**` — salinan internal updater
  Claude Code. READ-ONLY.** Bisa dihapus + di-reclone kapan saja tanpa
  peringatan. **DILARANG KERAS edit/commit di sana.** Sinkronisasi satu
  arah saja: `git pull --ff-only`.
- **(c) `~/.claude/plugins/cache/**` — build per-versi.** Jangan diedit;
  hanya berperan sebagai artefak rilis + sumber pemulihan.

**Enforcement mekanis:** sebelum commit APA PUN, jalankan
`git rev-parse --show-toplevel` — jika path-nya di bawah
`~/.claude/plugins/`, **STOP**, pindah kerja ke
`workspace/mirza-marketplace`.

> Catatan historis: rilisan 2026-06-07 (pty-controller 0.0.25, agent-bus
> 0.0.10, handoff 0.0.13, bot-conduct 0.0.3) ter-commit di salinan (b)
> SEBELUM doktrin ini ditetapkan — disiplin push-segera melindunginya.
> Konsekuensi: salinan kanonik (a) tertinggal dan butuh
> `git pull --ff-only` satu kali.

## Aturan operasional

1. **Push ke origin SEGERA setelah setiap release commit di repo bersama.**
   Commit lokal yang belum di-push = kandidat lenyap. Verifikasi mekanis:
   `git status -sb` harus menunjukkan `## main...origin/main` tanpa
   "ahead" sebelum kamu meninggalkan pekerjaan.
2. **DILARANG force-push / history-rewrite** pada repo yang disentuh
   banyak agent, kecuali SEMUA terpenuhi:
   - `git log origin/main..main` diperiksa di SEMUA clone yang mungkin
     (workspace kanonik, worktree-nya, marketplaces dir tiap bot);
   - konfirmasi eksplisit dari user;
   - koordinasi antar bot (umumkan via user / agent-bus sebelum eksekusi).
3. **`~/.claude/plugins/marketplaces/<x>` adalah milik updater — READ-ONLY
   per doktrin tiga salinan.** Ia bisa di-reclone wholesale kapan saja
   tanpa peringatan. Jangan edit, jangan commit, jangan menimbun stash
   atau file untracked penting di sana; sinkron hanya `git pull --ff-only`.
4. **Cache `~/.claude/plugins/cache/` adalah sumber pemulihan rilisan.**
   - Cache memuat versi LEBIH TINGGI daripada plugin.json workspace =
     RED FLAG rilisan unpushed — selidiki asalnya SEBELUM "bump melewati"
     angkanya.
   - Folder cache ber-`.orphaned_at` = kandidat garbage-collection;
     salin ke tempat aman DULU sebelum dipakai untuk recovery.
5. **Worktree wajib untuk kerja paralel di repo yang sama** (bot-conduct
   Rule 1 tetap berlaku): worktree pribadi dari repo kanonik
   `workspace/mirza-marketplace` memberi isolasi tanpa mengganggu working
   tree agent lain. JANGAN membuat worktree dari salinan marketplaces —
   selain dilarang doktrin, worktree itu ikut mati bila induknya
   di-reclone.

## Checklist mekanis sebelum meninggalkan repo bersama

- [ ] SEBELUM commit: `git rev-parse --show-toplevel` BUKAN di bawah
      `~/.claude/plugins/` (kalau iya → STOP, pindah ke
      `workspace/mirza-marketplace`)
- [ ] `git status -sb` → `## main...origin/main` (tidak ahead, tidak ada
      perubahan tersisa yang seharusnya ikut rilis)
- [ ] Tidak ada file untracked penting yang tertinggal di marketplaces dir
- [ ] Kalau baru menemukan pelajaran durable → playbook
      (`~/.claude/agent-playbook/PLAYBOOK.md`) sudah di-update
