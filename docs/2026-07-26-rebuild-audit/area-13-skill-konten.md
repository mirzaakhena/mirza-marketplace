# Area 13 — Skill konten (teach-me, daily-report, knowledge-vault, playbook)

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** SKILL-066–082; SCAR-094

---

## 13.0 ⭐ KEPUTUSAN LINGKUP: rebuild v1 = **harness Telegram saja**

> "ini case diluar telegram. skip dulu. drop diversi baru" — user, 2026-07-26 (dijawab untuk playbook, knowledge-vault, teach-me, dan daily-report sekaligus)

Semua yang **tidak menyangkut bot Telegram** keluar dari lingkup rebuild versi baru. Ini bukan penilaian bahwa fitur-fitur itu buruk — ini penetapan batas supaya rebuild pertama punya ujung yang jelas.

Konsekuensinya ke bawah dicatat di §13.4.

## 13.1 `teach-me` — **DROP dari v1**

**Item:** SKILL-066, 067, 068

Kontrak gaya penyampaian saat user ingin **memahami**, bukan menyuruh mengerjakan: mulai dari fundamental satu paragraf · cermin struktur analogi user · confirm-and-sharpen (bukan membuka dengan "actually"/"no") · contoh konkret untuk tiap konsep abstrak · jawaban multi-dimensi bila satu jawaban menyesatkan · struktur visual scannable tanpa tabel `|` di Telegram · jawab yang ditanya saja (increment over dump) · tutup dengan pertanyaan terbuka · cermin bahasa · **tahan aksi sampai ada sinyal eksplisit "ok, mulai"**.

Anti-pattern yang dilarangnya: encyclopedia mode · premature technicality · mengoreksi tanpa mengonfirmasi · hedging "it depends" saat ada jawaban terbaik · ringkasan penutup yang mengulang · momentum ceramah melewati titik selesai.

**Catatan:** sesi audit ini sendiri sebagian besar berjalan dengan gaya itu — jadi kontraknya terbukti berguna, hanya saja tidak spesifik Telegram. Layak dibangkitkan sebagai skill mandiri di luar rebuild ini.

## 13.2 `daily-report` — **DROP dari v1**

**Item:** SKILL-069–077; SCAR-094

**Sudah terlaksana dari permintaan lama user:** referensi KakaoTalk **sudah tidak ada** di plugin — `daily-report` sekarang agnostik provider. Sisa penyebutannya hanya di `docs/notes/01-common.md` (catatan lama, bukan kode).

Yang dibuang dari v1: `gather-context.sh` (blob ber-delimiter: repo, tanggal, branch, commits, status, TODO, arsip sebelumnya, file ekstra) · seleksi commit 3-tier · template terkunci `# Yesterday` / `# Today` · aturan anchoring (Yesterday = yang **sudah** selesai saat menulis; Today = forecast sisa) · anti-fabrikasi (tiap bullet harus bisa dilacak ke bukti; konteks tipis → laporan pendek jujur + flag, jangan dipadatkan) · style rules (10–15 kata, action verb, jangan sebut AI-assistance, strip boss-readable) · persist ke `.daily-reports/` + copy clipboard lintas platform.

**Kerapuhan yang tercatat kalau kelak dibangkitkan (SCAR-094):** seleksi commit tier-1 memakai **mtime file arsip terakhir** — sentuhan mtime tak sengaja (tool sync/checkout) menggeser batasnya diam-diam. Perbaikannya: simpan timestamp **di dalam** file arsip, bukan mengandalkan mtime.

## 13.3 `knowledge-vault` — **DROP dari v1**

**Item:** SKILL-078–082

**Temuan tambahan saat audit:** skill menunjuk `C:\Users\Mirza\mirza-vault` — **path Windows yang di-hardcode**, dan vault-nya tidak ada di mesin ini (macOS). Jadi di mesin ini skill itu sudah tidak berfungsi apa pun keputusannya.

**Kalau kelak dibangkitkan, dua hal wajib diperbaiki:**
1. Lokasi vault jadi **konfigurasi** (K-1), bukan path hardcode — dan bot di mesin tanpa vault harus berkata *"vault tidak terjangkau"*, bukan gagal diam-diam.
2. Digabungkan dengan **B-2** (bot membaca transkrip sesi lama). Keduanya menjawab masalah yang sama — bagaimana bot mengingat lintas sesi — dan membangunnya terpisah berisiko menghasilkan dua sistem memori yang tidak saling bicara.

Gagasan yang layak diselamatkan: enam tipe note atomik (`lesson`/`decision`/`concept`/`pattern`/`reference`/`open-question`) · pipeline capture-murah lalu promote-saat-terbukti-durable · **lookup-first** (cek dulu apakah tim pernah menyelesaikannya) · deprecate-don't-delete · low lock-in (markdown + wikilink, plugin Obsidian tidak load-bearing) · dan satu sumber kebenaran konvensi (`_meta/Conventions.md` menang atas teks skill).

## 13.4 Playbook — **DROP dari v1**, tapi arahnya sudah ditetapkan

**Permintaan asal user** (`docs/notes/01-common.md`): file berisi best practice yang sudah teruji + hasil pembelajaran + kesalahan yang tidak boleh diulang, wajib diperbarui demi kesinambungan antar bot.

**Status:** di luar lingkup v1.

**Tapi arah yang user pilih sudah tercatat dan berlaku bila kelak dibangun:**

> **Playbook jadi rumah utama untuk "pelajaran yang dipetik"; dua rumah lainnya menunjuk ke sana.**

Artinya: playbook per-repo jadi **satu** tempat pelajaran kerja terkumpul dan diperbarui; seksi handoff **tidak lagi menyalin** pelajaran — ia hanya menunjuk playbook + menyebut apa yang **baru** ditambahkan estafet itu; vault Obsidian dipakai hanya untuk yang benar-benar lintas-proyek.

**Masalah yang dipecahkannya** (temuan audit): ada **tiga rumah** untuk pelajaran yang batasnya kabur — seksi 9 file handoff (per-estafet), playbook (per-proyek, kumulatif), knowledge-vault (lintas-proyek, permanen). Bot yang baru belajar sesuatu harus memilih salah satu, dan tiga pilihan berbatas kabur adalah resep untuk *"ditaruh di salah satunya, hilang dari dua lainnya"*. Buktinya ada: `docs/2026-07-06-harness-rewrite-playbook.md` adalah playbook yang baik dan lengkap — lahir bukan karena ada aturannya, tapi karena satu bot berinisiatif sebelum modelnya tidak tersedia lagi.

(`daily-report` bukan rumah keempat — ia sengaja **membuang** detail karena ditujukan ke luar tim.)

### ⚠️ Konsekuensi ke area 08 yang WAJIB disesuaikan

Area 08 §8.5 menetapkan **"Referensi playbook — Wajib"** di template handoff. Karena playbook keluar dari lingkup v1, baris itu berubah jadi **kondisional**: file handoff merujuk playbook **bila ada**; ketiadaan playbook bukan cacat handoff.

Yang **tetap wajib** di template handoff: seksi Anti-Patterns / Lessons CARRY FORWARD (SKILL-017) — jadi pelajaran tetap ikut berpindah bersama estafet meski belum ada playbook sebagai rumah tetapnya.
