# Area 05 — Manajemen sesi

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-017–055, 150, 175–185; PTY-068, 076; SCAR-039, 040, 051, 052, 079, 081, 082

**Hasil ringkas: 8 bentuk perintah → 3.** Yang bertahan: `/new <nama>`, `/rename <nama>`, `/switch`.

---

## 5.1 Perintah yang DIBUANG

| Perintah | Verdict | Alasan |
|---|---|---|
| `/delete` (soft/archive) | **DROP** | §5.2 — diganti penyembunyian otomatis |
| `/delete all` | **DROP** | idem |
| `/delete hard` | **DROP** | §5.3 |
| `/delete hard all` | **DROP** | idem |
| `/effort [level]` | **DROP** | §5.5 |

## 5.2 Soft-delete/archive — **DROP**, diganti penyembunyian otomatis

**Item:** TG-034–038, 044, 045, 048; TG-179, 184; SCAR-082 (sebagian)

### Analisis premis (pembahasan khusus atas permintaan user)

Fitur ini lahir dari masalah nyata: percakapan pendek untuk testing terasa **sia-sia** dan mengotori daftar. Tapi masalah aslinya bukan "sesi ini harus musnah" — melainkan **"sesi ini mengganggu saat saya mencari sesi yang penting"**. Yang dibutuhkan *kebersihan daftar*, bukan penghapusan.

**Harga penghapusan sudah naik** sejak fitur ini dibuat. Dua keputusan hari ini mengubah nilai transkrip lama: **K-3** (semua percakapan satu database, bot bisa mengintip) dan **B-2** (bot membaca transkrip sesi lama sebagai memori). Kalau keduanya jadi, transkrip lama adalah bahan bakar memori jangka panjang — dan `/delete hard all` membakarnya rutin.

**Tiga sebab user menghapus sesi, ditinjau ulang:**

| Sebab | Masih berlaku? |
|---|---|
| Sesi testing mengotori daftar picker | **Ya** — dijawab §5.2 |
| Konflik nama sesi | **Tidak** — hilang setelah lifecycle jadi field data (§5.4) |
| Kebingungan bot soal sesi mana yang aktif | **Tidak** — status jadi data, bukan tebakan dari nama |

Prinsip pemisahan yang diadopsi: **apa yang tersimpan** (semuanya, selamanya) ≠ **apa yang ditampilkan** (hanya yang layak dikembalikan). Picker bukan lagi cerminan mentah isi folder, tapi *pandangan* yang disaring.

### ⭐ FITUR BARU: penyembunyian otomatis sesi remeh

Sesi yang secara mekanis terlihat remeh **otomatis tidak muncul di picker**, tanpa kerja manual. Transkripnya tetap ada dan tetap terjangkau (lewat pencarian / sebagai bahan memori B-2).

**Kriteria (revisi 2026-07-27):**
1. **Jumlah giliran percakapan sedikit** — mis. < 3 pesan dari user. Sinyal paling langsung: sesi testing hampir selalu 1–2 pesan. Datanya tersedia di store percakapan.
2. **Jumlah token di bawah ambang tertentu** — user mengusulkan ini tapi **ambangnya belum diputuskan** → lihat pertanyaan terbuka 5.A.

~~**Tidak pernah diberi nama**~~ — **DIBUANG 2026-07-27.** Kriteria ini saling meniadakan dengan area 10 §10.C: kalau **mesin menjamin setiap sesi punya nama** setelah beberapa giliran, maka "tidak pernah dinamai" hanya bisa terjadi pada sesi yang **lebih pendek** dari ambang penamaan — yang sudah tertangkap kriteria nomor 1. Kriteria yang tidak pernah menambah apa pun dibuang.

Penamaan otomatis (§10.C) **tetap berlaku** — jadi setiap sesi di picker selalu punya nama yang bisa dikenali.

**Kriteria yang DITOLAK:** "tidak menghasilkan perubahan kode" (tidak adil untuk sesi diskusi/brainstorming murni) dan "lebih tua dari N hari" (tidak memisahkan remeh dari penting, hanya menunda masalah).

**Yang ikut hilang:** `archived-sessions.json` + toleransi format legacy array-polos, picker archive + alur konfirmasinya, varian bulk `/delete all` + snapshot-nya, logika pembebasan nama `<nama>__<shortId>` dengan guard anti-double-suffix, dan penyaringan archived di setiap enumerasi sesi.

## 5.3 Penghapusan permanen — **DROP seluruhnya**

**Item:** TG-039–043, 046, 047; TG-042 (rmSync jsonl)

Tidak ada lagi perintah hapus dari Telegram.

**Yang ikut hilang:** picker delete + alur konfirmasi dua langkah + re-check "sesi ini sudah jadi sesi aktif?" saat confirm, snapshot bulk, dan **`rmSync` terhadap file milik Claude Code** (mengurangi kopling ke internal CC).

**Alasan:** setelah daftar bersih otomatis, tidak ada lagi masalah yang dipecahkan penghapusan — dan menghapus transkrip bertentangan dengan K-3/B-2. Kalau disk penuh, itu urusan kebijakan retensi (area 12), bukan tombol di HP.

**Satu alasan sah yang sadar dikorbankan:** sesi yang berisi kredensial tertempel tak sengaja tidak bisa dimusnahkan dari Telegram. Mitigasinya manual (hapus file dari terminal).

## 5.4 ⭐ Lifecycle pindah dari nama sesi ke field data — **KEPUTUSAN STRUKTURAL**

**Item:** PTY-068, PTY-069, PTY-070, PTY-076; SCAR-079, SCAR-039, SCAR-081; SKILL-003, SKILL-004, SKILL-025 (konsekuensi di area 08)

**Sekarang:** status bot dikodekan **di dalam string nama sesi** — `idle` = siap, `task-<slug>` = busy, `done-<slug>-<ts>` = transisi, lainnya = unknown. Ini menjalar jauh:

- wrapper menebak lifecycle dari prefiks nama (`session-name.ts:17`)
- handoff menentukan READY dari nama (SKILL-004)
- self-reset handoff = tiga injeksi keystroke `/rename done-… → /clear → /rename idle` (SKILL-025)
- wrapper saat first-boot **meng-klaim nama `idle`** dengan menyuntik `/rename idle` ke TUI (PTY-068)
- ada **sniffer** yang mengintip setiap keystroke `/rename` untuk menyinkronkan registry (SCAR-039)
- urutan event pasca-`/clear` harus persis supaya banner tidak berbunyi "(unnamed)" (SCAR-081)

**Jadi:** status = kolom di store terpusat (K-1/K-3). Nama sesi kembali jadi label bebas untuk manusia.

**Yang mati bersamanya:** derivasi lifecycle dari prefiks nama · klaim nama `idle` lewat suntikan keystroke saat boot · sniffer keystroke `/rename` · self-reset tiga-injeksi · aturan "nama manual = status unknown" · kerapuhan urutan event pasca-`/clear`.

**Untung:** status akurat dan tak bisa dipalsukan oleh salah ketik nama; user bebas menamai sesi apa pun tanpa merusak handoff.

**Yang dikorbankan sadar:** status tidak lagi terbaca sekilas dari daftar nama sesi. Perlu diganti dengan cara lain untuk melihat status fleet (bahan untuk area 07/11).

## 5.5 `/effort` — **DROP**

**Item:** TG-049–053; PTY-019, PTY-059; SCAR-008, SCAR-035

> "DROP — saya setel dari terminal saja" — user

**Yang ikut hilang:** `parseEffortInput` (collapse whitespace, strip CR/LF, lowercase) · picker 6 level 3×2 + penanda `→ ` pada level aktif · pembacaan level aktif dari snapshot statusline · **mekanisme `confirmAfterMs` di wrapper beserta clamp 50..5000 ms** · satu entry di slash-guard (PTY-019) · asimetri kebijakan yang disengaja (jalur Telegram auto-confirm, jalur AI diblok).

**Catatan:** `confirmAfterMs` adalah satu-satunya pemakai trik "kirim `\r` ekstra untuk meng-commit confirm-picker TUI". Membuang `/effort` menghapus seluruh mekanisme itu dari wrapper — konfirmasi ke area 06.

## 5.6 `/switch` — **KEEP, disederhanakan**

**Item:** TG-026–033, 175–185

**Yang DIBUANG (semua dipilih user):**

| Yang dibuang | Item | Kenapa bisa dibuang |
|---|---|---|
| Paginasi picker | TG-029, TG-031 | Baris nav Prev/Next/indikator + clamp halaman + tiga cabang callback paginasi. Setelah penyembunyian otomatis, sesi yang layak tampil jarang melebihi satu halaman. Picker menampilkan N terbaru (mis. 8), sisanya tidak ditampilkan |
| Disambiguasi nama duplikat `(shortId)` | TG-181; SCAR-082 | Keunikan nama sudah dijaga saat `/new` dan `/rename`; duplikat hanya muncul dari data legacy yang tidak ada di rebuild |
| Rekonsiliasi registry dari pid-file | TG-176, TG-185; SCAR-040 | Mesin merge dari `~/.claude/sessions/<pid>.json` dengan aturan "mtime lebih baru menang" yang jalan setiap render picker. Bisa hilang karena nama sesi ditulis lewat jalur data, bukan ditebak dari keystroke. **Efek: `~/.claude/sessions/` tidak lagi dibaca sama sekali** |
| Label relatif waktu | TG-180 | Format `session 341171c9 · 3h` beserta helper waktu relatif (just now/Xm/Xh/Xd/Xw) |

**Yang TETAP:**

| Item | Fitur |
|---|---|
| TG-027 | Sesi aktif dikecualikan dari daftar; daftar kosong dibalas pesan yang jelas |
| TG-029 (sisa) | Satu tombol per baris, label dipotong 60 char, baris `❌ Cancel` terakhir |
| TG-032; SCAR-052 | `shortId` 8 hex — **wajib**, karena `callback_data` Telegram dibatasi 64 byte dan UUID 36 karakter tidak muat setelah prefiks |
| TG-033 | Tap valid tidak pre-announce hasil; banner datang saat sesi benar-benar berganti |
| TG-178, TG-183 | Enumerasi `*.jsonl` dengan regex UUID ketat (menyaring file nyasar seperti `memory.md`), `encodeProjectDir` mengganti `[\\/:]` → `-` |
| TG-182 | Sort mtime descending |

## 5.7 `/new` dan `/rename` — **KEEP**

**Item:** TG-018–025

| Item | Perilaku yang dipertahankan |
|---|---|
| TG-018 | Validasi nama: CR/LF di-collapse ke spasi + trim; kosong → pesan usage berisi contoh; mengandung spasi → pesan yang menyuruh pakai tanda hubung; hasil dipotong maks 64 karakter. **Wajib** — `\r\n` merusak sintaks injeksi `/rename <name>\r` (SCAR-038) |
| TG-019, TG-026 | Guard: state dir harus ter-resolve, dengan pesan yang menjelaskan cara memperbaikinya |
| TG-020 | Guard heartbeat wrapper segar (< 30 s) → pesan "mirza-cc wrapper not detected" |
| TG-021, TG-024 | Nama sudah dipakai sesi lain → ditolak; self-rename ke nama sendiri = no-op idempoten ("common mobile-finger mistake") |
| TG-022 | `/new` tanpa ack — banner datang kemudian saat sesi benar-benar siap. Satu pesan total, tiba saat sesinya nyata |
| TG-025 | `/rename` membalas `✏️ Renaming session from "<lama>" to "<baru>"` |

## 5.8 Banner ganti-sesi — **KEEP + fix bug**

**Item:** TG-150; SCAR-085

Banner `switch to session 📍 <label>` yang dikirim langsung oleh mesin (tanpa roundtrip AI) saat sesi berganti.

**Bug yang WAJIB difix, bukan diport:** kode memanggil `messagesStore.append(...)` yang **tidak ada** di interface store, sehingga banner terkirim tapi **tidak pernah tercatat** di `messages.db` (LOSS-4, TG-150). Kelas bug ini yang dicegah `tsc --noEmit` di CI.

**SCAR-085** (banner hanya ke `allowFrom[0]`, asumsi single-user) tidak lagi jadi masalah setelah allowlist terpusat, tapi jangan hardcode "satu chat tujuan" (catatan area 01 §1.2).

## 5.9 State picker in-memory — **KEEP (trade-off diterima)**

**Item:** TG-055; SCAR-051

Peta `shortId → sesi` hidup in-memory, jadi setelah restart tap tombol lama menghasilkan "picker expired — please run /switch again". Trade-off sadar: Telegram sendiri juga tidak mem-persist tap lintas restart, dan pesan expired-nya jelas — bukan aksi salah.

---

## Pertanyaan terbuka

### 5.A — Ambang "sesi remeh" berbasis jumlah token

User mengusulkan token count sebagai salah satu kriteria tapi belum memutuskan angkanya. Perlu data nyata dulu: distribusi jumlah token/pesan per sesi di fleet. **Rencana:** implementasi awal pakai dua kriteria yang sudah pasti (giliran < 3 **dan** tak pernah dinamai), ambang token ditambahkan setelah ada data — dengan kriteria berupa konfigurasi, bukan konstanta, supaya bisa disetel tanpa rilis ulang.
