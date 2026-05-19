# handoff

Toolkit untuk **session handoff** di Claude Code. Plugin ini menangkap sesi yang sedang berjalan ke dalam file markdown terstruktur, lalu memuatnya kembali di sesi baru sehingga konteks tidak hilang setiap kali Anda mulai dari nol. Skill-only — tidak ada MCP server, tidak ada hook, tidak ada channel.

## Slash commands

| Command | Fungsi |
|---|---|
| `/handoff [catatan opsional]` | Simpan sesi sekarang ke file handoff baru di `<repo>/.handoff/`. Argumen bebas masuk verbatim ke Section 7. |
| `/handoff-resume` | Di sesi baru: baca handoff terakhir, tampilkan ringkasan singkat, tunggu konfirmasi sebelum lanjut eksekusi. |

## Skills

| Skill | Dipakai oleh | Tugas |
|---|---|---|
| `writing-handoff` | `/handoff` | Jalankan clarity check, generate konten 8-section, tulis file ke `.handoff/`. |
| `resuming-from-handoff` | `/handoff-resume` | Cari file terbaru di `.handoff/`, ringkas, minta konfirmasi user dulu sebelum eksekusi. |

## Lokasi file handoff

```
<repo-root>/.handoff/<yyyymmddhhmm>-prompt-<title>.md
```

- **Repo root** = hasil `git rev-parse --show-toplevel`. Kalau bukan git repo, fallback ke `pwd` dengan warning.
- **Timestamp** = local time, format `YYYYMMDDHHMM` (tanpa detik).
- **Title** = kebab-case, ≤6 kata, diturunkan dari isi sesi (atau dari argumen `/handoff`).
- Kalau filename bentrok dalam menit yang sama, append `-2`, `-3`, dst.
- Lex-sort filename = chronological sort, jadi `/handoff-resume` cukup ambil entry terakhir.

Isi file pakai **8-section template** (Konteks Proyek, Yang Sudah Selesai, Brainstorming Choices, Artefak, Anti-Patterns, Next Session Plan, Catatan User, Hal Penting Lain). Detail lengkap ada di `skills/writing-handoff/SKILL.md` — section structure adalah kontrak antar kedua skill, jangan diubah sebelah pihak.

## Workflow

1. **Akhir sesi:** jalankan `/handoff`. Opsional kasih catatan: `/handoff fokus ke bug login besok`.
   - Kalau arah next-step belum jelas (misal sesi cuma eksplorasi, atau ditinggal mid-debug), skill **brainstorming dulu** — tidak akan langsung nulis file sampai user pilih arah eksplisit. Ini sengaja — handoff samar lebih buruk daripada tidak ada handoff.
2. **Sesi baru di repo yang sama:** jalankan `/handoff-resume`.
   - Skill load handoff terakhir, tampilkan ringkasan, lalu **tunggu konfirmasi** ("ya"/"lanjut") sebelum eksekusi Section 6. User boleh redirect ("ganti haluan, hari ini saya mau X") — handoff tetap jadi background context.

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
