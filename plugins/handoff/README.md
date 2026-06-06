# handoff

Toolkit untuk **session handoff** di Claude Code. Plugin ini menangkap sesi yang sedang berjalan ke dalam file markdown terstruktur, lalu memuatnya kembali di sesi baru sehingga konteks tidak hilang setiap kali Anda mulai dari nol. Skill-only — tidak ada MCP server, tidak ada hook, tidak ada channel.

## Slash commands

| Command | Fungsi |
|---|---|
| `/handoff [catatan opsional]` | Simpan sesi sekarang ke file handoff baru di `<repo>/.handoff/`. Argumen bebas masuk verbatim ke Section 9. |
| `/handoff-resume` | Di sesi baru: baca handoff terakhir, tampilkan ringkasan singkat, tunggu konfirmasi sebelum lanjut eksekusi. |
| `/handoff-resume yes` | Pre-confirmed: ringkasan tetap ditampilkan (supaya bisa diinterupsi kalau ada yang aneh), tapi langsung lanjut eksekusi tanpa menunggu jawaban. |

Konfirmasi `/handoff-resume` sadar-Telegram: kalau skill `inline-buttons` tersedia di sesi, pertanyaan "lanjutkan handoff ini?" dirender sebagai tombol inline (`✅ Lanjutkan / ❌ Mulai segar / ✏️ Jelaskan manual`); kalau tidak, fallback ke konfirmasi teks biasa.

## Skills

| Skill | Dipakai oleh | Tugas |
|---|---|---|
| `handoff` | `/handoff` | Jalankan clarity check, generate konten 10-section (chain + plan pointer + commit SHA), tulis file ke `.handoff/`. |
| `handoff-resume` | `/handoff-resume` | Cari file terbaru di `.handoff/`, ikuti pointer plan-nya, ringkas, minta konfirmasi user dulu sebelum eksekusi. |

## Lokasi file handoff

```
<repo-root>/.handoff/<yyyymmddhhmm>-prompt-<title>.md
```

- **Repo root** = hasil `git rev-parse --show-toplevel`. Kalau bukan git repo, fallback ke `pwd` dengan warning.
- **Timestamp** = local time, format `YYYYMMDDHHMM` (tanpa detik).
- **Title** = kebab-case, ≤6 kata, diturunkan dari isi sesi (atau dari argumen `/handoff`).
- Kalau filename bentrok dalam menit yang sama, append `-2`, `-3`, dst.
- Lex-sort filename = chronological sort, jadi `/handoff-resume` cukup ambil entry terakhir.

Isi file pakai **10-section template** dengan spine **Sudah → Sedang → Blocker → Akan**: Konteks Proyek, Yang Sudah Selesai, Yang Sedang Dikerjakan/Belum Selesai, Blocker, Next Session Plan, Brainstorming Choices, Artefak, Anti-Patterns, Catatan User, Hal Penting Lain. Header juga membawa dua pointer:

- **Lanjutan dari** — path handoff sebelumnya kalau sesi ini lanjutannya (chain append-only; tiap file immutable, tidak pernah di-edit ulang).
- **Plan terkait** — path file plan multi-fase (mis. dari `superpowers:writing-plans`) + posisi `fase N/total`. Plan itu **source of truth** roadmap-nya; handoff cuma menunjuk posisi, tidak menduplikasi checklist. Progress lintas-session dibaca dari plan, bukan direkonstruksi dari rantai handoff.

Artefak juga mencatat **HEAD SHA** (anchor), **commit range** sesi, dan SHA **per-fase** kalau plan multi-fase — supaya "apa yang dikerjakan" bisa diverifikasi via `git diff`, bukan cuma dari prosa. Detail lengkap ada di `skills/handoff/SKILL.md` — header fields + section structure adalah kontrak antar kedua skill, jangan diubah sebelah pihak.

## Workflow

1. **Akhir sesi:** jalankan `/handoff`. Opsional kasih catatan: `/handoff fokus ke bug login besok`.
   - Kalau arah next-step belum jelas (misal sesi cuma eksplorasi, atau ditinggal mid-debug), skill **brainstorming dulu** — tidak akan langsung nulis file sampai user pilih arah eksplisit. Ini sengaja — handoff samar lebih buruk daripada tidak ada handoff.
2. **Sesi baru di repo yang sama:** jalankan `/handoff-resume`.
   - Skill load handoff terakhir, baca file plan yang ditautkan (kalau ada), tampilkan ringkasan (termasuk state "sedang" & blocker), lalu **tunggu konfirmasi** ("ya"/"lanjut") sebelum eksekusi Section 5. User boleh redirect ("ganti haluan, hari ini saya mau X") — handoff tetap jadi background context. Rantai `Lanjutan dari` hanya ditelusuri kalau konteksnya memang kurang — default cukup handoff terakhir + plan.

## Catatan `.gitignore`

Plugin **tidak menyentuh** `.gitignore` Anda. Mau commit folder `.handoff/` atau ignore — itu keputusan Anda. Beberapa orang suka commit (journal yang bisa di-grep), sebagian lebih suka ignore (privacy / noise).

## Install

Lihat [root README](../../README.md#instalasi-di-claude-code) untuk langkah lengkap menambahkan marketplace ini. Setelah marketplace ter-add:

```
/plugin install handoff@mirza-marketplace
/reload-plugins
```

Skill-only plugin, jadi tidak perlu MCP enable atau dev flag — langsung jalan begitu di-install.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
