# Sesudah Lepas Legacy — Uji Efek Statusline, `mirza_01_bot`, dan Sisa yang Menggantung

**Date:** 2026-08-05 13:40 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `406eede` · HEAD kode: `fbd0717`)
**Dari → Ke:** bot-03 → bot-02
**Pair:** bot-03 ⇄ bot-02
**Lanjutan dari:** `.handoff/202608050910-prompt-lepas-legacy-slash-folder.md`
**Spec/rencana yang baru saja tuntas:** `docs/superpowers/specs/2026-08-05-lepas-legacy-slash-folder-design.md` · `docs/superpowers/plans/2026-08-05-lepas-legacy-slash-folder.md`

---

## 1. Tujuan Handoff

**Goal estafet sebelumnya SUDAH TUNTAS.** Antrean slash pindah ke `<botHome>/slash/`,
`wrapper.pid` pindah ke akar folder bot, tool `send_slash` lahir — semuanya
ter-merge, ter-push, dan **terverifikasi hidup 7 dari 7 kriteria** bersama user.

Estafet ini bukan lanjutan pekerjaan yang setengah jalan. Ia menyerahkan
**satu klaim yang sengaja ditahan** dan **satu daftar yang user sendiri minta
disimpan**.

**Goal estafet:** buktikan **efek** perbaikan statusline (bukan artefaknya),
lalu jalankan sisa uji yang belum pernah disentuh — dan tawarkan lima
pertanyaan terbuka itu ke user pada saat yang tepat.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine + MCP server, Bun) dan `cc-wrapper` (PTY, Node + tsx).
Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller` +
`agent-bus`) masih melayani enam bot harian lewat launcher `mirza-cc`. Sistem
**baru** melayani dua bot: `@mirza_01_bot` dan `@mirza_02_bot`.

⚠️ **Jebakan penamaan:** folder `mirza_01_bot` melayani `@mirza_01_bot`, tapi
keenam bot harian bernama `@mirza_botone_bot` … `@mirza_botsix_bot`. Jangan
menyimpulkan sistem mana dari pola namanya — petakan lewat `getMe`.

⚠️ **Yang berubah kemarin dan mengubah cara menguji:** **seluruh plugin
`mirza-marketplace` sudah DIMATIKAN scope project di kedua bot uji** — termasuk
yang skill-only. Jadi bot uji sekarang berperilaku **telanjang**: tidak nge-ack
duluan, tidak menempelkan tombol, tidak ikut checklist `bot-conduct`. **Itu
disengaja**, dan alasannya milik user (§8). Jangan "memperbaiki"-nya.

## 3. Yang Sudah Selesai (SUDAH)

Ter-merge dan ter-push di kedua repo. **`cc-plugin` 482 test hijau / 0 fail /
977 `expect()` · `cc-wrapper` 57 hijau / 0 fail · `bunx tsc --noEmit` bersih di
kedua paket · `grep -rn "pty-controller"` atas SELURUH repo = NOL HASIL.**

**`cc-plugin` 0.13.0 terpasang DAN berjalan** (diverifikasi dari tiga meteran:
`installed_plugins.json`, isi folder cache memuat `send-tool.ts`, dan
`Win32_Process`).

### Uji hidup 7/7 — semuanya diperiksa dari EFEK, bukan artefak

Detail lengkap di BACKLOG Bagian 0. Yang paling layak diingat cara mengujinya:

- **#1 (penentu)** — bot me-`/rename` dirinya lewat `send_slash` **dengan
  `pty-controller` MATI**. Selama plugin lama masih aktif, `/rename` yang
  berhasil tidak membuktikan apa pun; dua tool mengerjakan pekerjaan yang sama.
- **#2 batch** — yang membuktikan `/clear` benar-benar melahirkan sesi baru
  adalah **`session.id` berubah**, bukan nama sesinya. Item ke-3 mendarat **di
  sesi yang baru lahir**. Tanpa memeriksa `session.id`, "batch jalan" bisa
  berbohong.
- **#6** — diuji **tanpa TUI**: berbicara protokol MCP langsung ke server 0.13.0
  yang terpasang, `CLAUDE_PROJECT_DIR` diarahkan ke folder ber-`config.json`
  yang sengaja dirusak. `send_slash` **hidup dan berefek**, `reply` **mati
  dengan alasannya** — **kontrol positif di dalam satu proses yang sama**.
  Skripnya sederhana (~110 baris, JSON-RPC newline-delimited); **pola ini layak
  dipakai lagi** untuk apa pun yang harus diuji terhadap artefak terpasang
  tanpa menyalakan TUI.

### Dua temuan bonus, dua-duanya dari jalan yang tidak direncanakan

1. **AB-3 tertutup** — `chained-statusline` akhirnya lahir di bentuk per-folder.
2. **Akar bug statusline ketemu** — perbaikan 2026-08-04 ternyata hanya menambal
   **enam salinannya**; akarnya (`~/.claude/settings.json` scope user) tidak
   pernah disentuh, jadi tiap bot baru mewarisi bentuk `.sh` telanjang yang
   rusak. Ditambal di tiga tempat. **Efeknya BELUM diverifikasi — lihat §6.**

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, worktree sudah dihapus, ledger SDD sudah dibuang.)

## 5. Blocker

— (tidak ada. Seluruh langkah berikutnya bisa dimulai tanpa menunggu siapa pun,
kecuali yang memang menuntut mata user — dan itu ditandai di §6.)

## 6. Yang Akan Dikerjakan (AKAN)

### Langkah 1 — **buktikan EFEK perbaikan statusline** ⭐ paling mendesak

Ini yang paling mudah dilewati, dan proyek ini **sudah pernah salah persis di
sini**: 2026-08-04 sebuah klaim "kriteria statusline lulus" harus **dicabut**
karena yang diperiksa cuma artefaknya (isi berkas benar) sementara efeknya
tidak — statuslinenya tidak pernah benar-benar dieksekusi, dan **user** yang
membongkarnya.

Kemarin saya menambal tiga tempat dan **hanya menjalankan uji kering**:

| Berkas | Isi sekarang |
|---|---|
| `~/.claude/settings.json` `statusLine.command` | `"C:\Program Files\Git\bin\bash.exe" "C:/Users/Mirza/.claude/statusline-progress.sh"` |
| `mirza_01_bot/chained-statusline` | sama, 84 byte |
| `mirza_02_bot/chained-statusline` | sama, 84 byte |

**Yang harus dibuktikan, dan hanya mata user yang bisa:** buka `mirza_02_bot`,
lalu **lihat apakah baris statusline benar-benar tergambar di layar** — dan
**apakah jendela git-bash TIDAK muncul** (gejala lama: `.sh` telanjang membuat
Windows *membuka* berkasnya lewat `git-bash.exe --no-cd`). Dua-duanya harus
benar; satu saja tidak cukup.

⚠️ **Kalau rusak, jalan mundurnya sudah siap:**
`~/.claude/settings.json.bak-sebelum-perbaikan-statusline`.

### Langkah 2 — ulangi kriteria #1 di `mirza_01_bot`

`pty-controller` di `mirza_01_bot` **masih hidup** (sengaja, karena kemarin
0.13.0 belum terpasang). Sekarang sudah terpasang, jadi:

```bash
cd C:\Users\Mirza\workspace\mirza_01_bot
claude plugin disable -s project pty-controller@mirza-marketplace
```

Lalu ulangi uji `/rename` lewat `send_slash`. **Kenapa layak diulang meski
sudah lulus di `mirza_02_bot`:** `mirza_01_bot` punya `statusLine` di
`settings.json`-nya sendiri dan riwayat yang lebih panjang — ia bukan salinan
`mirza_02_bot`, ia bot dengan keadaan berbeda.

### Langkah 3 — yang belum pernah diuji hidup sama sekali

- **Rollback `/context`** — belum pernah.
- **Regresi lapisan slash tahap 1** — belum pernah diuji ulang sejak mendarat.
- **`/context` dari Telegram menampilkan nama sesi yang BASI.** Terukur kemarin:
  `status.json` masih memuat `uji-batch-1` sementara nama sebenarnya
  `uji-batch-2`. Tangkapan statusline hanya diperbarui saat layar digambar
  ulang. Bukan bug batch; **belum diukur seberapa sering menggigit**.

### Langkah 3b — **AB-4: pagar T-4/W-14 ternyata imbauan, bukan penegakan** ⚠️ BARU

Ditemukan **sesudah handoff ini pertama ditulis**, oleh user yang mencoba jalur
antar-bot sendiri (06:50–06:53Z). Baris #30 `mirza_02_bot/conversations.db`:

> *"Sapaan ini **dipicu oleh mirza_01_bot** lewat jalur komunikasi antar-bot —
> dia minta aku menyapa kamu langsung."*

**Satu bot menyuruh bot lain menulis ke chat Telegram user, dan berhasil** —
padahal `SERVER_INSTRUCTIONS` menyatakan tegas bahwa pesan ber-`[protocol:
agent-turn]` **tidak boleh** dijawab dengan `reply`.

**Kenapa uji 5/5 tidak menangkapnya, dan ini pelajarannya:** kriteria T-4 waktu
itu menguji **kelalaian** (giliran berakhir tanpa `reply` → chat sunyi). Yang
terjadi sekarang **kepatuhan** — bot yang *disuruh* bicara, lalu menurut. Satu
pagar, dua bentuk pelanggaran; hanya satu yang terbayangkan.

**Tidak ada yang rusak kali ini** (user sendiri yang memulai tes sapaan).
**User memilih "catat dulu"** — jangan tawarkan ulang sebagai penemuan baru.
Kalau nanti dikerjakan: pertanyaannya bukan "bagaimana melarang", melainkan
**apakah larangan ini pantas ditegakkan mesin** — karena ada kasus sah di mana
bot memang perlu memberi tahu user (mis. timeout `expects_reply` yang tidak
pernah dijawab, yang justru **diperintahkan** `SERVER_INSTRUCTIONS`).

**AB-1 juga tertangkap basah di uji yang sama:** `mirza_01_bot` menerima,
membalas, dan mengirim — **nol baris** di database-nya. Satu-satunya jejaknya
adalah `mirza_02_bot` yang bercerita ke user. Lihat BACKLOG.

### Langkah 4 — tawarkan lima pertanyaan terbuka, pada saat yang tepat

**User meminta eksplisit agar kelimanya disimpan supaya bisa ditanyakan lagi.**
Daftar lengkapnya ada di **BACKLOG Bagian 0**, baris "LIMA PERTANYAAN TERBUKA".
Ringkas: **AB-1** (pesan antar-bot tidak dicatat) · **`/switch`** · **hapus
`~/.claude/mirza-bots/`** · **bersihkan sampah dua folder bot** · **AB-3 /
rollback `/context`**.

⚠️ **Tawarkan sebagai daftar milik user, BUKAN sebagai penemuan baru.**
Kelimanya sudah pernah diangkat dan sudah dijawab "nanti".

Yang paling murah dan paling matang: **membersihkan sampah dua folder bot** —
`.claude/channels/` di kedua bot kini **benar-benar mati** (tidak ada kode yang
membacanya), plus `mirza_01_bot/.claude/settings.json.bak-20260805-054139` dan
`mirza_01_bot/uji-lampiran/`.
⚠️ **`conversations.db-shm`/`-wal` BUKAN sampah** — mengabaikannya persis bug
WAL 2026-08-05. ⚠️ `mirza_02_bot/.claude/settings.local.json` juga bukan sampah.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** `~/.claude/agent-playbook/PLAYBOOK.md` sudah tidak ada; aturan Plane dicabut selamanya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild.** Empat baris teratas lahir kemarin: uji hidup 7/7 · akar bug statusline · jebakan lock · lima pertanyaan terbuka |
| `docs/superpowers/specs/2026-08-05-lepas-legacy-slash-folder-design.md` | Sebelum menyentuh `slash/`, `send_slash`, atau `paths.ts`. §3.2 dan §3.3 menjelaskan **kenapa** bentuknya begitu; §4.4 memuat D-1..D-4 yang boleh dibantah dengan alasan |
| `.handoff/202608050910-prompt-lepas-legacy-slash-folder.md` | Kalau butuh alasan keputusan user yang membingkai pekerjaan kemarin |
| `mirza-bots/README.md` §"Urutan rilis" | **WAJIB sebelum minta user memasang versi baru.** Ia menjelaskan asimetri repo-vs-cache dan mode gagal sunyinya |
| `mirza-bots/cc-wrapper/README.md` | Kontrak payload `slash/`. Diperbaiki kemarin — dulu ia mengarahkan penulis ke folder mati |

## 8. Keputusan User Sesi Ini

| Pertanyaan | Pilihan user | Konsekuensi |
|---|---|---|
| Bentuk folder (`slash/` + `wrapper.pid` di akar) | **Setuju** | `.claude/channels/` hilang dari sistem baru |
| Plugin lama mana yang dimatikan di bot uji? | **SEMUANYA**, termasuk yang skill-only | Usul saya cuma tiga yang punya MCP server. User membalikkannya: *kalau skill lama masih menempel, uji hidupnya bohong — tidak bisa dibedakan mana perilaku yang datang dari sistem baru dan mana warisan.* **Argumennya lebih kuat dari usul saya** |
| `/effort` dilepas atau tetap diblokir? | **Tetap diblokir** | *"Di system baru kita tidak perlu `/effort`. Kita mungkin perlu `/switch` tapi saya tidak ingin developmentnya dilakukan saat ini. Jadi yang benar-benar terpakai saat ini hanya `/new`, `/rename` dan `/context`."* Yang diperbaiki **alasannya**, bukan pagarnya |
| `pty-controller` di `mirza_02_bot` yang terlanjur dimatikan sebelum rilis | **Biarkan, langsung rilis** | User tidak memakai kedua bot uji sampai development selesai |
| Perbaiki akar bug statusline? | **Ya, sekarang** | Tiga tempat ditambal; **efeknya belum diverifikasi** (§6 Langkah 1) |
| Lima pertanyaan terbuka | **Catat, tanyakan lagi nanti** | Sudah masuk BACKLOG Bagian 0 |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan supaya bot
berikutnya bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan.
Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01 → bot-02 → bot-03 →
bot-02 → bot-03 → bot-02, dan sesi ini menambah **satu** tingkat.

**Tingkat 1–5** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran tidak sama dengan memakainya.

**Tingkat 6–8:** verifikasi **efek**, bukan artefak · memperbaiki satu bug
membuka bug di belakangnya · identitas berbasis string persis rapuh terhadap
apa pun yang berubah tiap rilis.

**Tingkat 9: perintah warisan adalah hipotesis, bukan fakta.**

**Tingkat 10: mutation check yang HIJAU harus dibuktikan dulu mutasinya
terpasang UTUH.**

**Tingkat 11: keberatan yang benar bisa tetap salah kalau kasusnya belum ada.**

**Tingkat 12: pagar yang berhenti menjaga tidak menjadi netral — ia menjadi
jebakan yang menunggu.**

**Tingkat 13: test menjaga yang sudah terbayangkan; yang belum terbayangkan
hanya jatuh saat kode menyentuh yang asli.** Terbayar lagi kemarin: dua temuan
bonus (AB-3 dan akar bug statusline) **tidak dicari siapa pun** — keduanya
muncul karena membandingkan bot baru dengan bot lama tanpa diminta.

**Tingkat 14 (sesi ini): larangan yang diwariskan tanpa alasannya akan berubah
menjadi klaim yang salah begitu alasannya gugur — dan bentuk salahnya adalah
kalimat yang terdengar benar.**

Spec saya menolak `/new` `/switch` `/delete` `/effort` dengan satu kalimat
seragam: *"there is no Claude Code equivalent."* Saya menyalinnya dari pagar
lama `plugins/pty-controller/slash-guards.ts`. Pagar lama ternyata punya **empat
alasan berbeda**, dan dua di antaranya bukan "tidak ada":

- `/effort` **ADA** di Claude Code. Pagar lama menolaknya karena
  *"pty_send_slash cannot auto-confirm, so the injection wedges"* — dan alasan
  itu **sudah gugur**, karena `cc-wrapper/src/registry.ts` justru punya
  `COMMAND_SPECS["/effort"] = { confirmAfterMs: 500 }` persis untuk menjawab
  picker-nya.
- `/switch` punya padanan `/resume <sessionId>`, ditulis terang-terangan di
  pagar lama.

Yang berbahaya bukan pagarnya — user tetap memilih memblokir keempatnya. Yang
berbahaya adalah **kalimatnya**, karena kalimat itu dibaca AI: *"tidak ada
padanannya"* membuatnya **berhenti mencari**, sementara *"sengaja tidak dibawa"*
membuatnya tahu ini keputusan dan bisa menyampaikannya apa adanya.

**Dan ia lolos lewat lubang yang SUDAH tercatat**: keempat test hanya meng-assert
pesan memuat `"Claude Code"` — prefiks bersama. Lubang itu ditulis di ledger
sejak Task 3 sebagai "minor", dan baru terbukti mahal empat task kemudian.
**Konsekuensi praktisnya: saat menyalin pagar, salin alasan TIAP entri, dan
periksa apakah alasannya masih hidup di sistem yang baru. Kalau sebuah test
hanya menyentuh bagian kalimat yang dibagi bersama, ia tidak menjaga isinya.**

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Kontrol POSITIF di dalam satu proses mengalahkan dua pengamatan
  terpisah.** Kriteria #6 tidak dibuktikan dengan "`send_slash` jalan" saja,
  melainkan dengan `send_slash` **hidup** dan `reply` **mati dengan alasannya**
  di proses yang sama, terhadap config yang sama. Dua fakta yang saling
  menjelaskan tidak bisa ditafsirkan lain.
- ✅ **Bicara langsung ke MCP mengalahkan mengetik di TUI** untuk menguji
  artefak terpasang. ~110 baris, tidak butuh terminal, dan hasilnya menyentuh
  **berkas yang benar-benar dipasang user**, bukan salinan repo.
- ✅ **Baca ulang berkas dari disk sesudah menulis.** Percobaan pertama
  menambal `~/.claude/settings.json` menghasilkan
  `"C:\Program Files\Gitinash.exe"` — heredoc memakan `\b` jadi backspace.
  **Perintahnya melapor SUKSES.** Yang menangkapnya cuma pembacaan ulang.
- ❌ **JANGAN percaya string literal multiline di skrip Python/Node** untuk
  berkas apa pun di mesin ini. Terjadi **lagi** sesi ini, dan kali ini pada
  `settings.json` user. Pakai `Edit` yang presisi.
- ❌ **`shell: true` + `child.kill()` tidak membunuh cucunya.** Prosesnya jadi
  yatim dan tetap memegang token Telegram.
- ⚠️ **Menjalankan cc-plugin kedua terhadap folder bot yang HIDUP akan merebut
  tokennya** — lock-nya dirancang membunuh pemegang lama. Uji yang **merusak**
  aman (engine tidak pernah jalan); uji **pemulihan**-nya yang berbahaya.
- ✅ **Review menyeluruh menangkap apa yang tujuh review per-task tidak bisa
  lihat.** Dua dari tiga temuan Important adalah **cacat rencana**, dan satu di
  antaranya ada di berkas yang **tidak pernah masuk diff manapun**
  (`cc-wrapper/README.md`) — karena inventaris rencananya sendiri melewatkannya.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `406eede` · kode HEAD `fbd0717` (merge tunggal,
  8 commit: `1e3efbe` setup · `f7a9722` `277a7be` `2efbacb` `5bc0f7d` `a9564ab`
  `d2b8981` `aa56858` task 1–7 · `6449219` gelombang perbaikan review).
- **Versi:** `cc-plugin` **0.13.0**, terpasang **dan berjalan**. `bot-conduct`
  0.0.11 · `inline-buttons` 0.0.10 · `telegram` (lama) 0.0.37-mirza.0.
- **Angka test:** `cc-plugin` **482 hijau / 0 fail / 977 `expect()` / 46 berkas**
  · `cc-wrapper` **57 hijau / 0 fail**. `bunx tsc --noEmit` bersih keduanya.
  ⚠️ Handoff sebelumnya menyebut `cc-wrapper` "36 test" — **itu basi**, yang
  benar 57. Angka warisan pun perlu diukur ulang.
- **Meteran yang terbukti berguna, pakai lagi:** `conversations.db` (readonly,
  `node:sqlite`) · **transcript CC `~/.claude/projects/<folder>/<sessionId>.jsonl`**
  (baru dipakai sesi ini, dan **paling telak** — memuat `custom-title`,
  `agent-name`, dan `local-command-stdout` "Session renamed to: X" langsung dari
  CC sendiri) · `status.json` (`payload.session_name`) · `logs/session-hook.log`
  (`source=clear` membedakan sesi baru dari rename) · `installed_plugins.json` ·
  `Get-CimInstance Win32_Process` · `getMe` Telegram.
- **Dua minor yang di-park sadar** (nyata, tidak load-bearing): test `/delete`
  meng-assert `toContain("Telegram")` — kata itu juga muncul di pesan `/new`,
  jadi tertukarnya isi kedua pesan tidak tertangkap · `cc-wrapper/README.md:34`
  berakhir titik dua lalu diikuti prosa sebelum tabelnya.
- **Belum diuji hidup:** efek perbaikan statusline · kriteria #1 di
  `mirza_01_bot` · rollback `/context` · regresi slash tahap 1 · seberapa sering
  `status.json` basi menggigit.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* · *"kita tidak perlu presisi di sini… no need to be so
  serious"* · *"Aku enggak mau over engineer."* · *"Saya ingin kita benar-benar
  terlepas dari arsitektur legacy."* · dan hari ini: *"Tolong hal yang bisa kamu
  lakukan, maka kamu yang lakukan."*
