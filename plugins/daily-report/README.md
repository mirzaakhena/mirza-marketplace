# daily-report

Plugin skill-only untuk Claude Code yang membantu kamu menyusun **daily work report siap-paste ke KakaoTalk** dari aktivitas git terbaru plus prompt bebas. Ada satu slash command (`/daily-report`) dan satu skill (`writing-daily-report`) yang memegang template terkunci, aturan style, dan anti-fabrication guard.

Cocok dipakai akhir hari (H) untuk laporan yang akan diposting besok pagi (H+1).

## Slash commands

| Command | Argumen | Fungsi |
|---|---|---|
| `/daily-report` | `[prompt bebas opsional]` | Jalankan `gather-context.sh` untuk mengumpulkan konteks git (commits, status, TODO, archive sebelumnya, file extra), invoke skill `writing-daily-report`, lalu generate report final. Simpan ke `.daily-reports/<DATE>.md`, copy ke clipboard (cross-platform: `pbcopy`/`clip.exe`/`xclip`/`wl-copy`, best-effort), dan print preview ke percakapan. |

Prompt bebas bisa berisi: commit hashes, file paths (akan ikut di-include ke konteks), hint `Today`, override nama project (`project=<name>`), atau override jumlah bullet (mis. `"buat 7 yesterday, 4 today"`).

## Skills

| Skill | Kapan trigger | Fungsi |
|---|---|---|
| `writing-daily-report` | Dipanggil oleh `/daily-report` saat user butuh laporan harian KakaoTalk-ready | Memegang template terkunci `# Yesterday` / `# Today`, prosedur generasi, style rules (≤15 kata per bullet, satu kalimat, no markdown fancy), serta anti-fabrication guard. Default output: 5 bullet Yesterday + 3 bullet Today, bahasa English (auto-translate kalau prompt user bahasa lain). |

## Output format

Plain text, no markdown rendering, paste-ready ke KakaoTalk:

```
Hello, this is my daily report:

# Yesterday
- <action verb> <object> <short qualifier>
- ... (default 5 bullets)

# Today
- <action verb> <object> <short qualifier>
- ... (default 3 bullets)
```

Hasil disimpan ke `.daily-reports/<YYYY-MM-DD>.md` relatif ke root repo (overwrite kalau sudah ada), lalu di-copy ke clipboard memakai tool yang tersedia di platform (`pbcopy` macOS, `clip.exe` Windows, `xclip`/`wl-copy` Linux). Best-effort — kalau tidak ada, user diminta copy manual dari file.

## Dari mana konteksnya diambil

`gather-context.sh` mengumpulkan blob konteks deterministik dengan section `===REPO===`, `===DATE===`, `===BRANCH===`, `===COMMITS===`, `===STATUS===`, `===TODO===`, `===PREV_ARCHIVE===`, `===EXTRA_FILES===`. Detail penting:

- **Pemilihan commit bertingkat:** (1) commit yang lebih baru dari mtime arsip terakhir di `.daily-reports/`; kalau < 2 commit, (2) fallback ke commit 24 jam terakhir; kalau masih < 2, (3) fallback ke 10 commit terakhir.
- **File TODO opsional:** `.daily-report.todo.md` di root repo — kalau ada, isinya jadi hint section `Today`.
- **Arsip sebelumnya:** report terakhir di `.daily-reports/` ikut dibaca untuk kontinuitas (item `Today` kemarin yang belum kelar dibawa lagi).
- **File ekstra:** path file yang disebut di prompt bebas diteruskan sebagai argumen script dan ikut masuk konteks.

Section `Today` diisi berdasar urutan prioritas: hint prompt bebas → Section "Akan" dari handoff yang dibuat sesi ini → sisa `Today` arsip sebelumnya → entri TODO → kelanjutan wajar dari `Yesterday`. Kalau semuanya kosong, skill **bertanya ke user** alih-alih mengarang.

Contoh report beranotasi ada di `skills/writing-daily-report/examples.md`.

### Aturan inti (anti-fabrication)

Skill ini memegang aturan ketat supaya laporan tetap jujur dan tidak halu:

- **Anchoring `Yesterday` vs `Today`** — `Yesterday` = yang **sudah selesai** pada saat menulis (H). `Today` = yang **belum selesai** dan akan dikerjakan H+1. Tidak boleh pre-credit pekerjaan yang "rencananya kelar nanti malam".
- **No fabrication** — setiap bullet wajib bisa ditelusuri ke evidence: commit subject/body, diff, file path, branch name, TODO entry, archive sebelumnya, atau teks prompt user. Tidak boleh ngarang aktivitas.
- **Terminologi spesifik hanya kalau token-nya muncul di konteks** — boleh sebut `Postgres`, `JWT middleware`, `argon2` cuma kalau kata itu literal ada di commit/diff/file path. Tidak boleh invent.
- **Boss-readable strip** — buang commit hash, branch name, PR/MR/issue number, file path internal, nama function dengan underscore, endpoint URL dari bullet. Tulis aktivitas yang nama itu mewakili, bukan nama identifier-nya.
- **No padding** — kalau konteks tipis, hasilkan lebih sedikit bullet daripada memenuhi target dengan bullshit. Skill akan secara eksplisit flag ke user kalau konteks terlalu thin.
- **No AI/Claude mention** — meski commit di-generate AI, bullet tetap ditulis seperti pekerjaan manusia ("Implement X").
- **Word cap** — target 10–15 kata per bullet, **hard cap 15**. Tidak boleh multi-sentence bullet.

## Install

Tambah marketplace dulu (lihat [root README](../../README.md) untuk langkah lengkap), lalu:

```
/plugin install daily-report@mirza-marketplace
/reload-plugins
```

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
