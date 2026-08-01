# Handoff — Tahap 2.5-MASUK selesai di Windows, sisa yang menggantung

- **Tanggal:** 2026-08-01 01:31
- **Dari:** sesi `renew-mirza-marketplace` di PC Windows (bot-01)
- **Pegangan utama:** `docs/2026-07-26-rebuild-audit/BACKLOG.md` Bagian 0 — baca itu dulu
- **Berkas ini hanya menambahkan** apa yang tidak bisa diketahui BACKLOG: keadaan mesin ini dan apa yang menggantung

---

## 1. Selesai

**Task 0 s/d 8 semuanya mendarat.** `fleetd` **116/116**, `cc-plugin` **27/27**,
hijau berulang di Windows 11 / Bun 1.3.11. Semua commit sudah di-push ke kedua repo.

| Task | Commit | Isi |
|---|---|---|
| 0 | `0605ebe`, `b0cc2f5` | Verifikasi portabilitas Windows + perbaikannya |
| 3 | `8009178` | Quote-reply masuk (TG-111) |
| 4 | `a94da07` | Toleransi unduhan gagal per-item (TG-105) |
| 5 | `1123446` | Pengerasan album, 6 perilaku |
| 6 | `300bf0c` | Handler dokumen + `safeName()` + batas 20 MB |
| 7 | `48197b6` | `read_history` + `search_history` — **sekaligus menutup B-1** |
| 8 | `e26acb9` | Rilis `cc-plugin` 0.3.0 + `fleetd` 0.2.0 |

**Jawaban Task 0 yang paling penting: `fleetd` JALAN di Windows.** K-14 tidak
tersentuh. Akarnya: Bun memakai AF_UNIX asli, dan `fs.existsSync()` **selalu
menjawab `false`** untuk socket yang hidup karena `stat()` atasnya kena `EACCES`.

## 2. Yang menggantung — lima pemeriksaan live

Hasil uji live ada di **spec §11**, ditulis apa adanya. Empat kriteria terpenting
**lolos** (quote penuh, quote sebagian, quote pesan bot, navigasi riwayat §9.2,
pencarian kata kunci). **Lima belum diuji**, semuanya soal lampiran dan lintas-bot:

| # | Belum diuji | Catatan |
|---|---|---|
| 6 | Pencarian lintas bot | **Tidak bisa diuji di mesin ini** — `config.json` cuma punya satu bot. Jangan dianggap lolos karena #5 lolos: #5 membuktikan "tidak bocor", bukan "bisa menyeberang saat diminta" |
| 7 | Kirim PDF dan `.md` | — |
| 8 | Dokumen >20 MB | — |
| 9 | Album 3 foto | — |
| 10 | Album >10 foto | Harus jadi **dua** pesan. Itu benar, bukan cacat |

## 3. Temuan terbuka (BACKLOG Bagian 7)

| ID | Isi | Kenapa penting |
|---|---|---|
| **W-10** ⚠️ | **`cc-plugin` tidak punya Stop hook.** Sistem lama memblokir sekali bila percakapan Telegram berakhir tanpa `reply` | **Paling mendesak.** Protokol terse-turn memperburuknya: "sudah membalas lalu tutup dengan titik" dan "lupa membalas lalu tutup dengan titik" jadi tak terbedakan dari luar. Rumahnya kemungkinan 2.5-GUARD |
| W-3 | Path socket dibatasi ~107 karakter (`sun_path`) | Path produksi aman (44); `MIRZA_BOTS_HOME` yang dalam tidak |
| W-7 | `config.json` ber-BOM membunuh `fleetd` | **Ini SCAR-026**, bukan temuan baru |
| W-9 | `album_failed_count` menyala juga untuk foto tunggal | **Jangan digating ke `isAlbum`** — itu justru membuat kegagalan foto tunggal tidak terlihat. Yang benar: ganti nama |

## 4. Keadaan mesin ini (tidak bisa diketahui dari repo)

- **`cc-plugin` 0.3.0 terpasang** lewat marketplace `mirza-bots` yang baru
  didaftarkan di sini. Brief Task 8 mengira ia tinggal di-*update* — di mesin ini
  ia **belum pernah terpasang**, jadi urutannya `marketplace add` lalu `install`.
- **`fleetd` berjalan dari terminal user sendiri** (bukan dari sesi Claude Code —
  sudah mati dua kali gara-gara itu).
- **Bot uji = `8912773865`**, berbeda dari bot yang melayani percakapan Telegram
  sehari-hari (`8690938443`). Uji live memakai bot uji itu, jadi **tidak ada risiko
  409** antara keduanya.
- `~/.claude/mirza-bots/config.json` berisi token, permission dikunci ke pemilik
  lewat `icacls` (padanan `0600`, ini strategi ACL SCAR-024).
- Database sungguhan sudah berisi 12 pesan; indeks FTS tersinkron 12/12.

## 5. Dua jebakan yang sudah memakan waktu — jangan kena lagi

1. **Ada DUA set `task-N-brief.md` bernama identik.** Yang benar di
   `.superpowers/sdd/2026-07-31-tahap25-masuk/`. Yang di root `sdd/` sisa proyek
   lain dan **tidak terlihat salah** — struktur TDD-nya sama persis. Sudah nyaris
   menjebak sekali.
2. **Angka target test di brief memakai baseline lama 69.** Baseline sesungguhnya
   73 sejak perbaikan W-4, jadi **semua angka di brief harus dibaca +4**.

## 6. Berikutnya

Urutan yang dipilih user tetap: **MASUK → KELUAR → GUARD**. Handoff KELUAR sudah
ada di `.handoff/202607311830-prompt-lanjutkan-tahap25-keluar.md`, dan
prasyaratnya ("2.5-MASUK selesai lebih dulu") **kini sudah terpenuhi**. Sub-proyek
itu belum punya spec maupun rencana — masih berupa daftar cakupan.

**W-10 layak dipertimbangkan lebih dulu daripada KELUAR**, karena ia menyentuh
kelas kegagalan yang paling mahal di proyek ini dan risikonya baru saja naik.
