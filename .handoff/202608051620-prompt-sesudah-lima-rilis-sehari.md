# Sesudah Lima Rilis dalam Sehari — Uji Sisa, dan Pertanyaan Besar yang Belum Disentuh

**Date:** 2026-08-05 16:20 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: lihat `git log -1` · HEAD kode: `0c6578d`)
**Dari → Ke:** bot-03 → bot-02
**Pair:** bot-03 ⇄ bot-02
**Menggantikan:** `.handoff/202608051340-prompt-lanjutan-sesudah-lepas-legacy.md` — **berkas itu SUDAH BASI**, ditulis 13:40 lalu sesi berlanjut sampai 16:20 dan lima rilis menyusul. Baca yang ini.

---

## 1. Tujuan Handoff

Goal estafet kemarin (`slash/` + `send_slash`) **tuntas dan terverifikasi hidup
7/7**. Sesudah itu sesi berlanjut dan **empat perbaikan lagi mendarat**, tiga di
antaranya lahir dari bug yang **tidak ada satu test pun menemukannya** — semuanya
muncul karena user menyuruh melihat keadaan nyata lewat jalan yang tidak
direncanakan mencari bug.

**Goal estafet:** habiskan sisa uji yang murah, lalu **angkat pertanyaan besar
yang belum pernah disentuh siapa pun** (§6 Langkah 4). Itu pertanyaan yang
menentukan apakah seluruh pekerjaan ini terbayar.

## 2. Konteks Proyek

`mirza-bots` = penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine + MCP server, Bun) dan `cc-wrapper` (PTY, Node + tsx).
Sistem **lama** (`mirza-marketplace/plugins/{telegram,pty-controller,agent-bus}`)
masih melayani **enam bot harian** lewat launcher `mirza-cc`. Sistem **baru**
melayani **dua** bot uji: `@mirza_01_bot`, `@mirza_02_bot`.

⚠️ **Jebakan penamaan:** folder `mirza_01_bot` melayani `@mirza_01_bot`, tapi
keenam bot harian bernama `@mirza_botone_bot` … `@mirza_botsix_bot`. Petakan
lewat `getMe`, jangan menyimpulkan dari pola nama.

⚠️ **Bot uji sekarang TELANJANG.** Seluruh plugin `mirza-marketplace` dimatikan
scope project di keduanya — termasuk yang skill-only (`immediate-reply`,
`inline-buttons`, `bot-conduct`, `teach-me`, `handoff`). Jadi bot uji **tidak
nge-ack duluan, tidak menempel tombol, tidak ikut checklist**. **Itu disengaja**,
keputusan user, dan alasannya lebih kuat dari usul saya: *kalau skill lama masih
menempel, uji hidupnya bohong — tidak bisa dibedakan mana perilaku yang datang
dari sistem baru dan mana warisan.* **Jangan "memperbaiki"-nya.**

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge dan ter-push di kedua repo.
**`cc-plugin` 499 test hijau / 0 fail / 1011 `expect()` · `cc-wrapper` 57 hijau /
0 fail · `bunx tsc --noEmit` bersih keduanya.** Naik dari 454 pagi ini.

| Rilis | Isi | Uji hidup |
|---|---|---|
| **0.13.0** `fbd0717` | Lepas legacy: antrean slash ke `<botHome>/slash/`, `wrapper.pid` ke akar, tool `send_slash` | ✅ **7/7** |
| **0.14.0** `e1664d8` | Kewajiban jadwal timeout `expects_reply` **dibuang** | — |
| **0.15.0** `3aeacd5` | **W-27** — `reply` ingat chat-nya sesudah restart | ✅ **hidup** |
| **0.16.0** `1a20484` | **AB-4 opsi B** — `reply` yang dipicu bot lain **ditandai engine** | ✅ **hidup** |
| **0.17.0** `0c6578d` | Path bridge statusline **sembuh saat engine start**, bukan cuma saat `/context` | ⬜ **belum** |

**`grep -rn "pty-controller"` atas SELURUH repo `mirza-bots` = NOL HASIL.** Itu
yang menutup syarat user: *"Saya ingin kita benar-benar terlepas dari arsitektur
legacy."*

**Detail lengkap tiap baris ada di BACKLOG Bagian 0** — enam baris teratas lahir
hari ini. Jangan salin ulang ke sini; baca di sana.

### Tiga bug yang ditemukan hari ini, dan tidak satu pun oleh test

1. **Akar bug statusline** — perbaikan 2026-08-04 ternyata cuma menambal **enam
   salinannya**; akarnya (`~/.claude/settings.json` scope user) tidak pernah
   disentuh, jadi tiap bot baru mewarisi bentuk `.sh` telanjang yang rusak.
   Ditemukan karena **membandingkan** rantai bot baru (45 byte) dengan bot harian
   (84 byte) — perbandingan yang tidak diminta siapa pun.
2. **W-27** — `lastChatByBot` hidup di memori proses, jadi restart membuat bot
   lupa siapa yang pernah menyapanya, padahal `conversations.db` miliknya sendiri
   masih menyimpannya. **Mematikan seluruh kelas notifikasi proaktif.**
   Ditemukan karena **user menyuruh membaca transcript Claude Code**.
3. **AB-4** — pagar "lalu lintas antar-bot tidak boleh menyentuh chat Telegram"
   ternyata cuma kalimat. Dilanggar **dua kali** dalam sejam. Ditemukan karena
   **user mencoba jalur antar-bot sendiri**.

## 4. Yang Sedang Dikerjakan (SEDANG)

— (berhenti di titik bersih. Kedua repo bersih dan ter-push, tidak ada branch
lokal selain `main`, semua worktree sudah dihapus.)

## 5. Blocker

— (tidak ada.)

## 6. Yang Akan Dikerjakan (AKAN)

### Langkah 1 — buktikan 0.17.0, dan ini **satu angka saja**

Sesudah user memasang 0.17.0 dan me-restart bot uji, baca
`<botHome>/.claude/settings.json`:

- `statusLine.command` menyebut **`0.17.0`** → sembuh sendiri **tanpa `/context`**.
  Perbaikannya terbukti.
- masih **`0.16.0`** → diagnosisnya salah, dan itu harus dikatakan apa adanya.

**Jangan menyatakan 0.17.0 berhasil sebelum angka itu dibaca.** Yang ada
sekarang baru test.

### Langkah 2 — ukur `CLAUDE_PLUGIN_ROOT`, pertanyaan yang sudah lama menggantung

Komentar `pluginRootFrom` (`cc-plugin/src/engine/context/install.ts:57`) menulis:
*"`CLAUDE_PLUGIN_ROOT` diisi Claude Code saat menjalankan hook, tapi **BELUM
diukur** apakah ia juga ada saat MCP server dijalankan — jadi cadangannya bukan
kemewahan."* Cadangan lewat `import.meta.url` ada **justru karena tidak ada yang
tahu**.

Sekarang murah sekali diukur: satu `console.error` di `startEngine` yang
menyebut apakah env itu ada, restart satu bot uji, baca log wrapper. **Sudah
dicoba sekali hari ini dan gagal** (tidak ada log historis, dan mengintip proses
bot lain di luar cakupan) — jadi ia butuh **penambahan log lebih dulu**, bukan
pencarian.

### Langkah 3 — sisa uji yang murah

- **Kriteria #1 di `mirza_01_bot`.** `pty-controller` di sana **masih hidup**
  (sengaja, karena kemarin 0.13.0 belum terpasang). Matikan
  (`claude plugin disable -s project pty-controller@mirza-marketplace`) lalu
  ulangi uji `/rename` lewat `send_slash`. Layak diulang meski sudah lulus di
  `mirza_02_bot`: `mirza_01_bot` punya `statusLine` sendiri dan riwayat lebih
  panjang — ia bukan salinan.
- **Rollback `/context`** — belum pernah diuji sekali pun.
- **`status.json` bisa BASI.** Terukur: ia memuat `uji-batch-1` sementara nama
  sesi sebenarnya sudah `uji-batch-2`, karena tangkapan statusline hanya
  diperbarui saat layar digambar ulang. Artinya `/context` dari Telegram bisa
  menampilkan nama sesi yang basi. **Belum diukur seberapa sering menggigit.**
- **Test `startEngine` jadi TIDAK hermetic.** Sesudah 0.17.0, ia **membaca**
  `~/.claude/settings.json` asli di tiap test (tidak pernah menulis — diperiksa).
  Hasil test jadi bergantung isi mesin; di mesin bersih atau CI sebagian
  assertion bisa berbeda. **Konsekuensi instruksi bot-03**, bukan kelalaian
  implementer: `deps`-nya sengaja disalin identik dari `replyLocalContext` supaya
  tidak ada dua sumber untuk satu fakta. Perbaikannya kecil (buat
  `userSettingsPath` bisa disuntik) tapi menyentuh tanda tangan `startEngine`.

### Langkah 4 — ⭐ **PERTANYAAN BESAR YANG BELUM PERNAH DISENTUH**

**Enam bot harian masih 100% di sistem lama. Belum ada satu pun yang pindah.**

Seluruh pekerjaan berbulan-bulan ini membangun sistem baru dan mengujinya dengan
**dua bot uji yang tidak dipakai siapa pun**. Pertanyaan yang menentukan apakah
semuanya terbayar belum pernah ditanyakan:

> **Apa yang sebenarnya menghalangi SATU bot harian pindah ke sistem baru?**

Bahannya sudah ada dan **terukur**, bukan dugaan:
`docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` —
diukur dari `messages.db` + `wrapper.log` + `session-names.json` keenam bot, 30
hari. **Empat celah teratasnya tidak ada dalam dugaan siapa pun sebelum diukur.**

Sebagian besar celah itu **sudah ditutup** sejak dokumen itu ditulis (chunking,
typing, lampiran keluar, nama sesi, `/context`, slash, antar-bot). **Yang belum
pernah dilakukan adalah menghitung ulang: dari daftar itu, apa yang MASIH
tersisa hari ini?**

Itu pekerjaan **membaca dan menghitung**, bukan membangun — murah, dan hasilnya
mengubah prioritas semua yang lain. **Tawarkan ini ke user**; jangan langsung
kerjakan tanpa persetujuannya, karena ia bisa berujung pada memindahkan bot
produksi.

### Langkah 5 — lima pertanyaan terbuka milik user

**User meminta eksplisit agar disimpan supaya bisa ditanyakan lagi.** Daftarnya
di **BACKLOG Bagian 0**, baris "LIMA PERTANYAAN TERBUKA". Ringkas: **AB-1**
(pesan antar-bot tidak terukur) · **`/switch`** · **hapus
`~/.claude/mirza-bots/`** · **bersihkan sampah dua folder bot** · **rollback
`/context`**.

⚠️ **Tawarkan sebagai daftar milik user, BUKAN sebagai penemuan baru.**

Yang paling matang: **membersihkan sampah dua folder bot** — `.claude/channels/`
di keduanya kini **benar-benar mati** (nol kode membacanya).
⚠️ `conversations.db-shm`/`-wal` **BUKAN sampah** (mengabaikannya persis bug WAL).
⚠️ `mirza_02_bot/.claude/settings.local.json` juga bukan sampah.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** `~/.claude/agent-playbook/PLAYBOOK.md` sudah tidak ada; aturan Plane dicabut selamanya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal.** Enam baris teratas lahir 2026-08-05 dan memuat seluruh detail yang sengaja tidak disalin ke handoff ini |
| `docs/superpowers/specs/2026-08-05-lepas-legacy-slash-folder-design.md` | Sebelum menyentuh `slash/`, `send_slash`, `paths.ts`. §3.2/§3.3 = alasan bentuknya; §4.4 = D-1..D-4 yang boleh dibantah dengan alasan |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | **Sebelum menjawab Langkah 4.** Ini bahan terukurnya |
| `mirza-bots/README.md` §"Urutan rilis" | **WAJIB sebelum minta user memasang versi baru** — asimetri repo-vs-cache dan mode gagal sunyinya |
| `mirza-bots/cc-wrapper/README.md` | Kontrak payload `slash/` |

## 8. Keputusan User Sesi Ini

| Pertanyaan | Pilihan user | Catatan |
|---|---|---|
| Bentuk folder `slash/` + `wrapper.pid` | **Setuju** | `.claude/channels/` hilang dari sistem baru |
| Plugin lama mana yang dimatikan di bot uji | **SEMUANYA**, termasuk skill-only | Usul bot-03 cuma tiga; **user membalikkannya dengan alasan yang lebih kuat** |
| `/effort` dilepas atau tetap diblokir | **Tetap diblokir** | *"yang benar-benar terpakai saat ini hanya `/new`, `/rename` dan `/context`"* |
| Cron timeout `expects_reply` | **Buang total** | bot-03 mengusulkan mengecilkan jadi satu kalimat; user memilih buang |
| AB-4: gembok atau tandai | **Tandai (opsi B)** | Memblokir akan membuat bot **diam**, dan diam adalah kegagalan paling mahal (W-16) |
| Akar bug statusline | **Perbaiki sekarang** | Tiga tempat ditambal, efeknya **sudah dilihat user** |
| W-27 | **Perbaiki sekarang** | Fallback ke `conversations.db` saja, bukan `allowFrom[0]` |
| Bug versi-tersemat di path bridge | **Perbaiki sekarang** | 0.17.0, **belum diuji hidup** |
| Lima pertanyaan terbuka | **Catat, tanyakan lagi nanti** | Sudah di BACKLOG Bagian 0 |

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan supaya bot
berikutnya bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan.
Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01 → bot-02 → bot-03 →
bot-02 → bot-03 → bot-02 → bot-03, dan sesi ini menambah **dua** tingkat.

**Tingkat 1–5** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran tidak sama dengan memakainya.

**Tingkat 6–8:** verifikasi **efek**, bukan artefak · memperbaiki satu bug
membuka bug di belakangnya · identitas berbasis string persis rapuh terhadap
apa pun yang berubah tiap rilis.

**Tingkat 9:** perintah warisan adalah hipotesis, bukan fakta.

**Tingkat 10:** mutation check yang HIJAU harus dibuktikan dulu mutasinya
terpasang UTUH. **Dipakai lima kali sesi ini sebagai prosedur, dan tiap kali
terbayar.**

**Tingkat 11:** keberatan yang benar bisa tetap salah kalau kasusnya belum ada.

**Tingkat 12:** pagar yang berhenti menjaga tidak menjadi netral — ia menjadi
jebakan yang menunggu.

**Tingkat 13:** test menjaga yang sudah terbayangkan; yang belum terbayangkan
hanya jatuh saat kode menyentuh yang asli. **Terbayar tiga kali hari ini** —
ketiga bug hari ini ditemukan lewat jalan yang tidak direncanakan mencari bug,
dan dua di antaranya oleh user, bukan oleh bot.

**Tingkat 14: larangan yang diwariskan tanpa alasannya akan berubah menjadi
klaim yang salah begitu alasannya gugur — dan bentuk salahnya adalah kalimat
yang terdengar benar.** Spec menolak `/new` `/switch` `/delete` `/effort` dengan
satu kalimat seragam *"there is no Claude Code equivalent"*, disalin dari pagar
lama yang ternyata punya **empat alasan berbeda**. `/effort` **ADA** di Claude
Code — pagar lama menolaknya karena *"pty_send_slash cannot auto-confirm"*, dan
alasan itu **sudah gugur** di sistem baru. Yang berbahaya bukan pagarnya
(user tetap memilih memblokir) melainkan **kalimatnya**, karena kalimat itu
dibaca AI: *"tidak ada padanannya"* membuatnya **berhenti mencari**.

**Tingkat 15 (sesi ini): sebuah aturan atau perbaikan hanya senyata pemicunya.**
Tiga bentuk kegagalan yang sama muncul dalam satu hari, di tiga tempat berbeda:

- **Aturan tanpa pemicu.** Larangan "lalu lintas antar-bot tidak boleh menyentuh
  chat Telegram" hidup sebagai kalimat di `SERVER_INSTRUCTIONS`. Tidak ada kode
  yang gagal kalau dilanggar — dan ia **dilanggar dua kali dalam sejam**. Yang
  menahannya ternyata `no_known_chat`, halangan **yang sama sekali tidak
  berhubungan** dan justru bug yang kami perbaiki di hari yang sama.
- **Pemicu yang salah.** Penyembuh path bridge basi **sudah ada, sudah benar,
  sudah berkomentar rapi, sudah punya test** — dan **tidak pernah menyala**,
  karena kabelnya cuma tersambung ke `/context`. Bug yang ia seharusnya cegah
  kambuh persis seperti diramalkan BACKLOG.
- **Pemicu tanpa kasus.** Kewajiban memasang jadwal timeout `expects_reply`
  menyala **setiap kali kirim**, menjaga keadaan yang sistem ini justru
  **rancang** (pesan menunggu di `inbox/`). Biayanya dua tool call tiap kali;
  yang dijaganya belum pernah terjadi. **User yang merasakannya lebih dulu**,
  bukan test.

**Konsekuensi praktisnya, dan ini yang harus dibawa:** saat menulis aturan atau
perbaikan, jangan berhenti di *"apakah ini benar"*. Tanyakan **tiga** hal: apa
yang **memicunya**, apakah pemicu itu **menyala di saat yang tepat**, dan apakah
kasus yang dijaganya **pernah terjadi**. Kode yang benar dengan pemicu yang salah
tidak lebih berguna daripada kode yang tidak ada — bedanya ia **terlihat seperti
sudah beres**, dan itu lebih berbahaya.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Kontrol POSITIF di dalam satu proses** mengalahkan dua pengamatan
  terpisah. Kriteria §6 dibuktikan dengan `send_slash` **hidup** DAN `reply`
  **mati dengan alasannya** di proses yang sama, terhadap config yang sama.
- ✅ **Bicara langsung ke MCP** (~110 baris JSON-RPC) mengalahkan mengetik di TUI
  untuk menguji **artefak yang benar-benar terpasang**. Tidak butuh terminal.
- ✅ **Transcript Claude Code adalah meteran paling telak yang baru ditemukan
  sesi ini** — `~/.claude/projects/<folder>/<sessionId>.jsonl` memuat
  `custom-title`, `agent-name`, dan `local-command-stdout` "Session renamed to:
  X" langsung dari CC. **User yang menunjukkannya**, dan ia langsung membongkar
  klaim bot-03 yang terlalu kuat.
- ✅ **`message_id` adalah bukti pengiriman, bukan bukti percobaan** — ia hanya
  lahir dari kiriman Telegram yang sukses. Dipakai untuk membuktikan W-27 tanpa
  bergantung pada "pesannya kelihatan".
- ✅ **Baca ulang berkas dari disk sesudah menulis.** Percobaan menambal
  `~/.claude/settings.json` menghasilkan `"C:\Program Files\Gitinash.exe"` —
  heredoc memakan `\b` jadi backspace. **Perintahnya melapor SUKSES.**
- ❌ **JANGAN percaya string literal multiline di skrip Python/Node** untuk
  berkas apa pun di mesin ini. Terjadi lagi, kali ini pada setelan user. Pakai
  `Edit`. **Dan pasang `assert` anchor** — satu edit BACKLOG gagal hari ini dan
  yang menangkapnya adalah assert, bukan hasilnya.
- ❌ **`shell: true` + `child.kill()` tidak membunuh cucunya.** Prosesnya jadi
  yatim dan tetap memegang token Telegram.
- ⚠️ **Menjalankan cc-plugin kedua terhadap folder bot yang HIDUP akan MEREBUT
  tokennya** — `engine/lock.ts` dirancang membunuh pemegang lama. Uji yang
  **merusak** aman (engine tidak pernah jalan); uji **pemulihan**-nya yang
  berbahaya. Kalau harus: matikan botnya dulu, atau salin foldernya.
- ✅ **Review menyeluruh menangkap apa yang tujuh review per-task tidak bisa
  lihat** — dua dari tiga temuan Important adalah cacat rencana, dan satu ada di
  berkas yang **tidak pernah masuk diff manapun** karena inventaris rencananya
  sendiri melewatkannya.
- ✅ **Komentar yang salah arah lebih berbahaya daripada tidak ada komentar.**
  Satu komentar `nextPushOrigin` membenarkan arah default yang **berlawanan**
  dengan kodenya. Kodenya benar; pembaca berikutnya akan memperluas logikanya
  mengikuti yang **tertulis**.

## 10. Catatan Lain

- **Artefak:** kode HEAD `0c6578d`. Lima merge hari ini: `fbd0717` `e1664d8`
  `3aeacd5` `1a20484` `0c6578d`.
- **Versi:** `cc-plugin` **0.17.0** di repo; **TERPASANG 0.16.0** saat handoff
  ini ditulis.
- **Angka test:** `cc-plugin` **499 hijau / 0 fail / 1011 `expect()` / 47
  berkas** · `cc-wrapper` **57 hijau / 0 fail**. ⚠️ Handoff dua generasi lalu
  menyebut `cc-wrapper` "36 test" — **basi**; angka warisan pun perlu diukur
  ulang.
- **Meteran yang terbukti berguna:** `conversations.db` (readonly, `node:sqlite`;
  `message_id` = bukti kirim sukses) · **transcript CC** (baru, paling telak) ·
  `status.json` `payload.session_name` · `logs/session-hook.log` (`source=clear`
  membedakan sesi baru dari rename) · `installed_plugins.json` ·
  `Get-CimInstance Win32_Process` · `getMe`.
- **Dua minor di-park sadar:** test `/delete` meng-assert `toContain("Telegram")`
  — kata itu juga muncul di pesan `/new` · `cc-wrapper/README.md:34` berakhir
  titik dua lalu diikuti prosa sebelum tabelnya.
- **Backup yang sengaja disimpan** (keputusan user):
  `~/.claude/settings.json.bak-sebelum-perbaikan-statusline`.
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* · *"kita tidak perlu presisi di sini… no need to be so
  serious"* · *"Aku enggak mau over engineer."* · *"Saya ingin kita benar-benar
  terlepas dari arsitektur legacy."* · *"Tolong hal yang bisa kamu lakukan, maka
  kamu yang lakukan."*
