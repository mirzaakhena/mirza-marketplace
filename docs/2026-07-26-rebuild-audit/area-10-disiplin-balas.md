# Area 10 — Disiplin balas & penegakan kewajiban

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-124, 159–164, 188; SKILL-045–065; SCAR-092, 093

---

## 10.0 Diagnosis

Ada **lima lapis** yang menyuruh bot berperilaku benar:

| Lapis | Mekanisme | Sifat |
|---|---|---|
| 1 | Blok `instructions` MCP (TG-124) — ~10 paragraf, selalu di context | **meminta** |
| 2 | Skill: `immediate-reply`, `inline-buttons`, `bot-conduct`, `name-session` | **meminta** |
| 3 | Hook `UserPromptSubmit` (TG-161, 162) — menyuntik ulang 3–4 baris kewajiban **setiap turn** Telegram (~150 token/turn) | **meminta** |
| 4 | Hook `Stop` (TG-163, 164) — memblokir bila tak ada reply sejak pesan terakhir user | **memaksa** |
| 5 | Hook `PreToolUse` (SKILL-059, 060) — menolak `git commit` tanpa trailer `Agent: <bot>` | **memaksa** |

Keluhan user memetakan persis ke pembagian itu: **yang dimekanisasi berhasil, yang tetap jadi teks tidak.** Menambah teks pengingat tidak mengubah pola ini — lapis 3 lahir persis untuk itu, dan keluhannya tetap ada.

## 10.1 ⭐ Ack `immediate-reply` — **DIPAKSA MESIN**

**Item:** SKILL-045, SKILL-046

**Perilaku baru:** saat giliran berasal dari Telegram, **pemanggilan tool non-reply yang pertama DITOLAK** bila belum ada reply sejak pesan user — dengan pesan yang mengajari (*"kirim ack singkat dulu lewat reply"*). Bot mengirim ack lalu melanjutkan.

**Yang DIHAPUS dari skill:** seluruh "pre-flight 4 pertanyaan" (SKILL-045: *apakah saya akan memanggil tool selain reply? Read? Bash? Agent/background?*). **Mesin tahu jawabannya; AI tidak perlu menebak niatnya sendiri.** Begitu juga kondisi skip (SKILL-046) — jadi otomatis benar: respons yang murni teks tanpa tool call tidak pernah memicu penolakan.

**Yang TETAP jadi aturan skill** (murni gaya, tak bisa dijamin mesin):
- Satu ack per pesan masuk; user kirim 3 pesan dalam 5 detik → ack yang terbaru saja (SKILL-049)
- Ack satu baris, maksimal satu emoji, < 50 karakter, wording bervariasi, **mengikuti bahasa & register user**

**Ditolak:** opsi "mesin yang mengirim ack". Alasan: nilai ack ada pada isinya — bot menunjukkan ia paham maksud user, bukan tanda terima generik.

## 10.2 ⭐ Penjaga jawaban final — **FIX bug FUNC-3**

**Item:** TG-163, TG-164; SCAR-093

**Bug sekarang:** hook `Stop` memeriksa *"ada pemanggilan tool `reply` setelah pesan masuk terakhir?"* — tapi **ack juga memakai tool `reply`**. Jadi urutan ini lolos:

1. User kirim pesan
2. Bot kirim ack "Oke, saya cek dulu" ← penjaga tenang
3. Bot kerja 10 menit, selesai
4. Bot tidak mengirim apa-apa lagi → **tidak diblokir**

User ditinggal dengan ack sebagai satu-satunya pesan. Ironinya: **semakin patuh bot menjalankan `immediate-reply`, semakin mudah ia lolos dari penjaga jawaban final** — dua kewajiban saling melumpuhkan.

**Aturan baru:** blokir bila **tidak ada reply SETELAH pemanggilan tool non-reply yang TERAKHIR**. Ack (dikirim sebelum bot bekerja) tidak lagi dihitung sebagai jawaban, karena setelahnya masih ada tool call. Jawaban final harus datang **setelah** pekerjaan selesai.

**Yang wajib dijaga saat implementasi:**
- Bot yang menutup dengan satu reply lalu tidak melakukan apa pun tetap lolos
- **Loop-guard tetap** (TG-164): `stop_hook_active` → tak pernah memblokir dua kali; transcript hilang/tak terbaca → lolos diam-diam
- **Bug "sticky" harus difix:** `telegramDriven` sekarang berlaku untuk seluruh sesi begitu sesi itu pernah menerima pesan Telegram — akibatnya giliran yang dijalankan user dari terminal bisa salah-diblokir. Yang benar: lacak **posisi terakhir**, bukan flag sesi

## 10.3 Narasi progres — **TETAP kewajiban AI**

**Item:** SKILL-048

User memilih progres tetap ditulis AI, bukan tanda hidup generik dari mesin. Alasannya: progres dari AI memberi tahu **sedang apa**, bukan sekadar **masih hidup**.

**Aturan yang dipertegas:** reply baru di setiap **perubahan tahap yang nyata** (situasi berubah) — **bukan** timer, bukan heartbeat, bukan pengisi "masih bekerja ya". Ambang kasar: task > 15 detik wall clock.

## 10.4 ⭐ Rumah aturan: **mesin dulu, sisanya SATU skill**

**Item:** TG-124, TG-159, TG-161, TG-162; SKILL-050, 052, 053, 055, 056

Urutan yang diputuskan:

**(1) Apa pun yang bisa dijamin mesin, dijamin mesin** (K-5):

| Kewajiban | Penegak |
|---|---|
| Ack sebelum tool pertama | Hook menolak tool (§10.1) |
| Pertanyaan wajib berbutton | Server menolak `reply` (area 04 §4.5) |
| Tombol "Jelaskan manual" selalu ada | Server menambahkan sendiri (area 04 §4.4) |
| Jawaban final wajib lewat `reply` | Hook `Stop` (§10.2) |
| Commit membawa nama bot | Hook `PreToolUse` (§10.5) |

**(2) Yang tersisa tinggal di SATU skill** — bukan empat plugin terpisah. Isinya murni gaya & penilaian:
- Panjang/nada ack, variasi wording, mengikuti bahasa user
- Cara menyusun pilihan tombol: label pendek (> ~15 karakter → ganti pola), menu bernomor dinarasikan di body, **body tidak pernah mengulang deretan tombol sebagai teks**, dua label panjang tidak sebaris (SKILL-052)
- Kapan sebuah respons memang perlu bertanya sama sekali — **jangan ajukan pertanyaan "obvious yes"**; aturannya *jangan tanya*, bukan *tanya tanpa tombol* (SKILL-055)
- Operasi destruktif dieja lengkap di body, bukan hanya di label tombol (SKILL-055)
- Progres bermakna (§10.3)

**(3) `instructions` MCP dipangkas ke fakta mekanis saja** — bentuk tag `<channel>` dan arti tiap atributnya, plus satu kalimat "transkrip Anda tidak dibaca user". Semua yang berbau perilaku dipindah ke skill. **Kontradiksi yang selama ini membingungkan model ikut hilang** (instructions menganjurkan `edit_message`, skill melarangnya — dan `edit_message` sendiri sudah DROP di area 03).

**(4) Hook pengingat per-turn (TG-161, 162) — DIHAPUS.** ~150 token setiap turn Telegram yang terbukti tidak menyelesaikan masalah (CONS-1). Kewajibannya sudah dipegang mesin.

**Aturan induk:** satu perilaku hidup di **satu** rumah. Tidak boleh ada dua sumber yang bisa berselisih.

## 10.5 `bot-conduct` — enam aturan, ditinjau satu per satu

| Aturan | Item | Verdict |
|---|---|---|
| **Rule 1** — isolasi via git worktree, bukan pindah branch di tree utama | SKILL-057 | **Kandidat mekanisasi** → 10.A |
| **Rule 2** — trailer `Agent: <bot-name>` sebelum `Co-Authored-By:`; jangan ubah `git config user.name` | SKILL-058, 059, 060 | **KEEP + fix** (§10.6) |
| **Rule 3** — subagent-first untuk pekerjaan berat, supaya bot utama tetap bisa mengobrol | SKILL-061 | **KEEP sebagai teks** — tak bisa dijamin mesin |
| **Rule 4** — channel discipline | SKILL-062 | **Sudah dimekanisasi** (§10.2). Sisa teksnya: pertanyaan dari terminal dijawab di transkrip, jangan mem-ping Telegram; cross-over hanya atas permintaan eksplisit |
| **Rule 5** — rules-live-here | SKILL-063 | **KEEP, diperbarui**: aturan kerja baru masuk ke **satu skill** (§10.4), bukan disebar ke CLAUDE.md per-repo |
| **Rule 6** — three-copy doctrine | SKILL-064, 065 | **Tinjau lokasinya** → 10.B |

## 10.6 Trailer commit — **KEEP, tapi tutup jalan bypass**

**Item:** SKILL-058, 059, 060; SCAR-092

Ini salah satu dari dua penegak yang benar-benar bekerja. Kontrak yang dipertahankan: baca JSON dari stdin, bukan Bash / input invalid / tidak deny → keluar diam-diam (pass); deny → tulis keputusan + alasan yang menyuruh AI menambah trailer lalu mencoba lagi; self-contained (hanya `node:fs`).

**Yang WAJIB difix, bukan diport:**
- **FUNC-4/5** — matcher hanya menangkap Bash; **PowerShell lolos**. Build baru harus mencakup semua shell yang dipakai
- **Empat kelas bypass** yang ditemukan reviewer adversarial saat fase 2 rewrite lama. Jangan diport tanpa memeriksanya
- Batas yang diterima sadar (SCAR-092): commit lewat editor (tanpa `-m`/heredoc) **tak bisa diperiksa** pre-tool, jadi lolos by design. Command-substitution `$(...)` juga di luar jangkauan

## 10.7 `name-session` — perlu dirancang ulang

**Item:** TG-188, TG-160

**Sekarang:** saat sesi masih bernama `idle`, bot mengingatkan **sekali**, mengusulkan satu nama hyphenated lewat tombol `[Pakai "<nama>"] [Nama lain] [Nanti saja]`, menerapkannya lewat `/rename` hanya setelah tap, lalu berhenti. Tidak pernah auto-rename.

**Kenapa harus dirancang ulang:**
1. **Pemicunya hilang** — setelah K-7, tidak ada lagi nama `idle`. Pemicu baru: sesi belum pernah dinamai.
2. **Taruhannya naik** — B-6 menyembunyikan sesi yang tak pernah dinamai dari picker. Jadi sesi kerja nyata yang lupa dinamai akan **hilang dari daftar**. Penamaan berubah dari kosmetik jadi penting.
3. **User sudah mengeluh nudge-nya datar** — *"nudge name-session yang ada datar tanpa eskalasi; masalahnya bukan kurang reminder"* (masukan bot-01, tercatat di design doc lama §11.5b).

Bentuknya → 10.C.

---

## 10.A Rule 1 (git worktree) — **TETAP perilaku, tapi jadi TAWARAN di awal**

> "Saya ingin worktree ditawarkan saja diawal oleh AI" — user, 2026-07-26

**Bukan** penolakan mekanis. Bentuknya: saat bot **mulai bekerja di sebuah repo**, ia menawarkan membuat worktree lewat tombol — bukan diam-diam membuatnya, bukan juga menunggu sampai terlanjur berpindah branch di tree utama.

**Kenapa tawaran lebih pas di sini** (beda dengan ack/tombol yang dipaksa mesin): tidak semua pekerjaan butuh worktree — perubahan satu baris di repo yang tidak dipakai siapa pun tidak perlu isolasi. Penolakan mekanis akan salah menghalangi kasus itu, sementara ack dan tombol tidak punya kasus sah untuk dilewati.

**Yang tetap dari SKILL-057:** urutan alat — native tooling dulu (`EnterWorktree` / subagent `isolation:"worktree"`), fallback `git worktree add`; cleanup `git worktree remove` setelah merge.

**Catatan:** untuk **delegasi** (area 08 §8.C) worktree tetap **wajib**, bukan tawaran — di situ dua bot pasti bekerja bersamaan di repo yang sama.

## 10.B Rule 6 (three-copy doctrine) — **PINDAH ke CLAUDE.md repo ini**

**Item:** SKILL-064, SKILL-065

Aturan ini khusus repo marketplace, bukan aturan umum semua bot di semua repo — jadi tempatnya di `CLAUDE.md` repo ini.

**Konsekuensi ke Rule 5:** aturan "rules-live-here" (SKILL-063) mendapat **klausa pengecualian eksplisit**: aturan yang *genuinely repo-specific* memang tinggal di `CLAUDE.md` repo bersangkutan; yang berlaku lintas repo tinggal di skill perilaku. Tanpa klausa ini, dua aturan itu saling bertabrakan.

**Yang tetap harus terbawa** (insidennya nyata — ~25 commit hilang saat updater me-reclone, 2026-06-07): workspace clone satu-satunya tempat edit+commit · `~/.claude/plugins/marketplaces/**` read-only (sync hanya `git pull --ff-only`) · `~/.claude/plugins/cache/**` jangan pernah diedit · cek `git rev-parse --show-toplevel` sebelum commit · push segera setelah tiap commit rilis · tidak ada force-push/history-rewrite di repo multi-agent tanpa konfirmasi user + koordinasi lintas bot · worktree dibuat dari workspace clone, bukan dari salinan marketplaces.

## 10.C `name-session` — **mesin menjamin ada nama, AI yang mengarang**

**Item:** TG-188, TG-160

**Perilaku baru:** setelah N giliran, bila sesi masih tanpa nama, **mesin meminta nama ke AI** dan menerapkannya, lalu memberi tahu user (*"sesi ini saya namai `<nama>` — mau ganti?"*).

**Untung:** user tak pernah kehilangan sesi karena lupa menamai (penting setelah B-6 menyembunyikan sesi tak bernama), dan tak perlu menjawab tombol apa pun bila namanya sudah pas.

Pola yang sama dengan tombol "Jelaskan manual": **mesin menjamin STRUKTUR, AI mengisi ISI**.

**Yang hilang dari versi lama:** aturan "ingatkan sekali lalu berhenti", tombol `[Pakai "<nama>"] [Nama lain] [Nanti saja]`, dan larangan auto-rename (justru auto-rename yang sekarang jadi mekanismenya — bedanya user selalu diberi tahu dan bisa mengganti).

**Yang tetap:** nama hyphenated, tanpa spasi (aturan validasi area 05 §5.7).

**Nilai N belum ditetapkan** — kandidat: setelah topik percakapan jelas (mis. 3 giliran), bukan berdasarkan waktu.

## 10.D Skill perilaku — **satu skill, dimuat otomatis, tidak dipanggil**

Menjawab keluhan user: *"skill ini kadang sulit/lupa dipakai oleh bot. Apakah karena bot salah paham dengan nama-nya?"*

**Keputusan:** setelah kewajiban utamanya dipegang mesin, skill ini **tidak perlu dipanggil sama sekali** — isinya tinggal gaya, dan dimuat otomatis saat sesi punya channel Telegram aktif, bukan menunggu AI memilih membacanya.

**Masalah "lupa memanggil skill" hilang karena tidak ada lagi yang harus dipanggil.**

Nama usulan: **`telegram-conduct`** (nama jadi tidak kritis karena tidak lagi jadi kunci penemuan).

**Empat plugin yang melebur jadi satu:** `immediate-reply` · `inline-buttons` · `bot-conduct` (bagian lintas-repo) · `name-session`.

**Pelajaran yang dicatat:** nama skill lama menggambarkan **mekanisme** (`inline-buttons`) bukan **situasi** — itu kemungkinan besar sebab AI sulit mengenali kapan ia relevan. Kalau kelak ada skill yang memang harus dipanggil, namanya harus menjawab *"kapan saya butuh ini"*, bukan *"apa isinya"*.
