# Lepaskan cc-wrapper dari Arsitektur Legacy — Folder `slash/` + Tool `send_slash`

**Date:** 2026-08-05 09:10 (WIB)
**Repo kerja:** `C:\Users\Mirza\workspace\mirza-marketplace` (dokumen/spec/rencana/BACKLOG/handoff) — **repo KODE ada di `C:\Users\Mirza\workspace\mirza-bots`**, dua-duanya punya remote dan wajib di-push
**Branch:** `main` (HEAD dokumen: `f642be0` · HEAD kode: `35c531f`)
**Dari → Ke:** bot-02 → bot-03
**Pair:** bot-03 ⇄ bot-02
**Lanjutan dari:** `.handoff/202608050400-prompt-uji-hidup-state-per-folder.md`
**Plan terkait:** — (belum ada spec maupun rencana; **menulis spec-nya adalah langkah pertamamu**)

---

## 1. Tujuan Handoff

Uji hidup state per-folder + jalur antar-bot **tuntas 5/5** (handoff sebelumnya).
Sesudah itu user melihat satu sisa legacy yang mengganggu dan meminta
dibereskan: `cc-wrapper` — komponen paling baru di sistem ini — masih membaca
folder bernama **`.claude/channels/pty-controller/`**, nama plugin sistem LAMA.

Brainstorming sudah berjalan dan **empat keputusan sudah diambil user lewat
tombol** (Bagian 8). Yang belum: spec, rencana TDD, dan kodenya.

**Goal estafet:** pindahkan antrean slash dari `.claude/channels/pty-controller/pending/`
ke **`<botHome>/slash/`**, dan lahirkan tool MCP **`send_slash`** di `cc-plugin`
sebagai pengganti `pty_send_slash` — dalam **satu perubahan yang sama**.

## 2. Konteks Proyek

`mirza-bots` adalah penulisan ulang harness bot Telegram milik user. Dua paket:
`cc-plugin` (engine + MCP server, Bun) dan `cc-wrapper` (PTY, Node + tsx).
Sistem **lama** (`mirza-marketplace/plugins/telegram` + `pty-controller`) masih
melayani enam bot harian lewat launcher `mirza-cc`. Sistem **baru** kini
melayani **dua** bot: `@mirza_01_bot` dan `@mirza_02_bot`.

⚠️ **Jebakan penamaan:** folder `mirza_01_bot` melayani `@mirza_01_bot`, tapi
keenam bot harian bernama `@mirza_botone_bot` … `@mirza_botsix_bot`. Jangan
menyimpulkan sistem mana dari pola namanya — petakan lewat `getMe`.

## 3. Yang Sudah Selesai (SUDAH)

Semua ter-merge dan ter-push di kedua repo. **454 test hijau, 0 fail,
927 `expect()`, 45 berkas.** `bunx tsc --noEmit` **bersih**.

**Uji hidup 5/5 — jalur antar-bot TERVERIFIKASI HIDUP** (detail lengkap di
handoff sebelumnya dan BACKLOG). Ringkas: dua bot saling kenal tanpa registry ·
berkas mendarat lalu dimakan scanner · **chat Telegram user tetap sunyi**
(T-4/W-14 tertutup) · antrean offline bekerja · kedua pagar anti-loop menolak.

**Dua bug ditemukan oleh uji itu, dua-duanya lolos dari 450 test hijau:**
- `conversations.db-wal` diabaikan skrip migrasi (`1f3085d`). Terukur: `.db`
  saja **135 baris** vs `.db`+`-wal` **137**, pesan terakhir mundur 74 menit.
- `listPeers` menghitung folder ber-`config.json` sebagai bot, dan
  `wa-kajian-aggregator` di workspace nyata punya `config.json` sendiri
  (`35c531f`). Diperbaiki jadi validasi ISI config.

**Setup produksi yang sudah berjalan** (dikerjakan bersama user):
`cc-plugin` **0.12.0** terpasang & berjalan · `mirza_01_bot` dan `mirza_02_bot`
keduanya hidup dengan config bentuk baru · keputusan user **"start dari nol"**,
jadi riwayat lama TIDAK dimigrasikan dan skrip migrasi tetap **belum pernah
dijalankan** atas state nyata.

## 4. Yang Sedang Dikerjakan (SEDANG)

**Brainstorming berhenti tepat sesudah Bagian 1 desain dipresentasikan.**
Kedua repo bersih dan ter-push; tidak ada branch lokal selain `main`, tidak ada
worktree tersisa. Tidak ada kode yang setengah tertulis.

Bagian 1 desain yang **sudah dipresentasikan tapi BELUM di-approve user**
(user memilih handoff sebelum menjawab) — bentuk folder akhirnya:

```
workspace/<nama-bot>/
├── config.json          token + allowFrom + timezone
├── conversations.db     riwayat
├── session.id           sesi CC terbaru
├── status.json          tangkapan statusline
├── chained-statusline   statusline pendahulu
├── bot.pid              engine pegang token Telegram
├── wrapper.pid          ← PINDAH dari .claude/channels/…
├── data/                berkas dari user
├── inbox/               pesan dari bot lain      → dibaca ENGINE
├── slash/               ← BARU: perintah ke CC   → dibaca WRAPPER
└── logs/
```

**Mulai dari sini, bukan dari nol** — tapi **minta persetujuan user atas
bentuk ini dulu**, karena ia belum sempat menjawabnya.

## 5. Blocker

— (tidak ada. Empat keputusan arah sudah diambil user secara eksplisit lewat
tombol; lihat Bagian 8. Yang tersisa hanyalah persetujuan atas bentuk folder
di Bagian 4, yang bisa kamu tanyakan sambil jalan.)

## 6. Yang Akan Dikerjakan (AKAN)

**Goal:** `cc-wrapper` dan `cc-plugin` berhenti menyebut `pty-controller`
sama sekali, dan bot baru bisa me-`/rename` dirinya tanpa plugin sistem lama.

**Langkah pertamamu: tulis spec**, lalu rencana TDD. Keempat keputusan sudah
ada; yang belum adalah bentuk teknisnya ditulis dan diurutkan.

### Permukaan yang tersentuh — sudah dipetakan, tidak perlu dicari ulang

| Berkas | Baris | Sekarang | Jadi |
|---|---|---|---|
| `cc-wrapper/src/main.ts` | 29 | `STATE_DIR = <proj>/.claude/channels/pty-controller` | `slash/` + `wrapper.pid` di folder bot |
| `cc-wrapper/src/main.ts` | 30-31 | `PENDING_DIR`, `LOCK_FILE` | ikut |
| `cc-plugin/src/engine/slash/pending.ts` | 13 | `pendingDir(projectDir)` | `slashDirIn(botHome)` — pindahkan ke `paths.ts` |
| `cc-plugin/src/server.ts` | — | belum ada tool slash | **+ tool `send_slash`** |
| `cc-plugin/src/main.ts` | — | `buildServer(backend)` | perlu `botHome` juga — lihat catatan di bawah |
| `cc-plugin/test/engine/slash/pending.test.ts` | 14 | path lama | ikut |
| `cc-plugin/test/engine/context/slash-context.test.ts` | 31, 47 | path lama | ikut |

### Empat hal yang WAJIB kamu jaga, dan alasannya

1. **Tool `send_slash` harus lahir di perubahan yang SAMA.** Begitu
   `cc-wrapper` pindah membaca, `pty_send_slash` milik plugin lama berhenti
   bekerja untuk bot baru — ia menulis ke folder lama. Menundanya berarti ada
   jendela di mana bot baru **tidak bisa me-`/rename` dirinya sendiri**, dan
   itu dipakai tiap kali handoff.

2. **`send_slash` sebaiknya TIDAK bergantung pada engine yang hidup.** Ia cuma
   perlu tahu folder bot, dan `main.ts` sudah punya `resolveIdentityCwd()`.
   Kalau ia menumpang `Engine`, ia ikut mati saat engine gagal start — padahal
   justru di situlah kamu paling butuh `/clear`. Usul: `buildServer(backend, botHome)`.

3. **JANGAN gabungkan `slash/` dengan `inbox/`.** Ini terukur, bukan
   kekhawatiran: `cc-wrapper/src/main.ts` **menghapus berkas SEBELUM
   mem-parse-nya** (hapus di baris 22 blok scan, parse di baris 27) — disengaja,
   supaya crash di tengah tidak memproses dua kali. Kalau kedua payload berbagi
   folder, wrapper menang cepat, **menghapus** pesan antar-bot, lalu menolaknya
   karena tidak ada field `command`. **Pesan lenyap tanpa gejala.**

4. **Enam bot harian tidak boleh tersentuh.** Mereka memakai wrapper lama yang
   membaca folder lama; yang berubah hanya `cc-wrapper` + `cc-plugin`. Jangan
   menyentuh `plugins/pty-controller/**`.

### Sesudah kodenya mendarat

Uji hidup lagi, dan yang paling menentukan: **bot baru me-`/rename` dirinya
sendiri lewat `send_slash`, dengan `pty-controller` DIMATIKAN di folder itu.**
Selama plugin lama masih aktif, keberhasilan rename tidak membuktikan tool
barumu yang bekerja.

Instruksi mematikan plugin per-folder sudah terukur — `claude plugin disable
-s project <plugin>` menulis `{"enabledPlugins": {"<plugin>": false}}` ke
`.claude/settings.json` folder itu, dan **tidak menyentuh** bot harian. Lihat
Bagian 10.

**Starting point:** `main` di kedua repo, bersih. Baca `BACKLOG.md` Bagian 0
lebih dulu.

## 7. Referensi

| Referensi | Kapan dibaca |
|---|---|
| skill `bot-conduct` | **Di awal, sebelum kerja substantif.** `~/.claude/agent-playbook/PLAYBOOK.md` **sudah tidak ada**; aturan Plane dicabut selamanya |
| `docs/2026-07-26-rebuild-audit/BACKLOG.md` **Bagian 0** | **Di awal — pegangan tunggal seluruh rebuild.** Bagian 6 memuat AB-1..AB-3 yang lahir kemarin |
| `.handoff/202608050400-prompt-uji-hidup-state-per-folder.md` | **Di awal** — hasil uji hidup 5/5 dan dua bug yang ditemukannya |
| `docs/superpowers/plans/2026-08-04-state-per-folder-dan-inbox-bot.md` | Sebelum menyentuh `paths.ts`/`agent/**`. K-1..K-6 menjelaskan **kenapa** tiap bentuk begitu |
| `mirza-bots/cc-wrapper/src/main.ts` | **Sebelum menulis spec** — baris 22 vs 27 adalah alasan `slash/` dan `inbox/` harus terpisah |
| `mirza-bots/README.md` §"Setiap kali `cc-plugin` diubah" | **WAJIB sebelum minta user uji hidup** |
| `docs/2026-08-04-jalur-antar-bot-dan-celah-lapisan-armada.md` | Saat butuh alasan T-3 (tool `pty_*` tidak ada di sistem baru) |

## 8. Keputusan User Lewat Brainstorming

Keempatnya diambil **hari ini lewat tombol**. Jangan tanyakan ulang.

| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
| `slash/` dan `inbox/` digabung atau dipisah? | **Dua folder, dua nama baru** | Pembacanya beda (wrapper vs engine); menggabungkan membuat wrapper menelan pesan antar-bot |
| Letaknya di mana? | **Sejajar `config.json`, `conversations.db`, `inbox/` — TIDAK numpang di `.claude/`** | `.claude/channels/` hilang seluruhnya dari sistem baru |
| Boleh bot lain menulis ke `slash/` tetangga? | **TIDAK — self-only** | Menguatkan neighbor-autonomy 2026-06-07. Mau menyuruh tetangga? Titip ke `inbox/`-nya, AI-nya yang eksekusi |
| Nama & cakupan tool pengganti | **`send_slash` saja** — tanpa awalan `pty_`, tanpa `status`, tanpa `list_agents` | "pty" itu detail implementasi. `list_agents` sudah digantikan `agent_list` kemarin |

**Alasan user yang paling menentukan, dan lebih tajam dari usulan saya:**
*"Bot harus saling mengenal sesamanya sehingga mereka bisa saling berkirim
pesan."* Saya membela permukaan-folder dengan alasan "mudah dipelajari orang";
user membalikkannya — yang harus bisa menebak adalah **botnya sendiri**. Kalau
state tersembunyi di `.claude/channels/…`, bot tetangga harus mewarisi
pengetahuan jalan rahasianya, dan kebutuhan mewariskan itulah yang melahirkan
registry.

## 9. Anti-Patterns / Lessons (CARRY FORWARD)

### ⚠️ BACA INI — alasan estafet ini, bukan cuma perintahnya

User meminta secara eksplisit agar **alasan** ikut diserahkan supaya bot
berikutnya bisa menerapkan prinsipnya pada keputusan yang belum terbayangkan.
Diwariskan bot-02 → bot-03 → bot-01 → bot-02 → bot-01 → bot-02 → bot-03 →
bot-02 → bot-03, dan sesi ini menambah **satu** tingkat.

**Tingkat 1–5** (ringkas): ukur dulu sebelum membangun · ukur juga alasanmu
untuk TIDAK membangun · kalau tidak punya angkanya, katakan begitu · dua meteran
yang masing-masing benar bisa melahirkan sebab-akibat yang tidak ada · punya
meteran tidak sama dengan memakainya.

**Tingkat 6–8:** verifikasi **efek**, bukan artefak · memperbaiki satu bug
membuka bug di belakangnya · identitas berbasis string persis rapuh terhadap
apa pun yang berubah tiap rilis.

**Tingkat 9: perintah warisan adalah hipotesis, bukan fakta.**

**Tingkat 10: mutation check yang HIJAU harus dibuktikan dulu mutasinya
terpasang UTUH.** Dipakai empat kali sesi ini sebagai prosedur, dan sekali
terbayar: satu `replace` berbasis `\n` gagal karena CRLF, dan yang menangkapnya
adalah `assert` anchor — bukan hasil test, yang saat itu masih hijau karena
mutasinya tidak pernah ada.

**Tingkat 11: keberatan yang benar bisa tetap salah kalau kasusnya belum ada.**

**Tingkat 12 (handoff sebelumnya): pagar yang berhenti menjaga tidak menjadi
netral — ia menjadi jebakan yang menunggu.**

**Tingkat 13 (sesi ini): test menjaga yang sudah terbayangkan; yang belum
terbayangkan hanya jatuh saat kode menyentuh yang asli.** Dua bug ditemukan
hari ini, keduanya lolos dari 450 test hijau, dan keduanya jatuh dalam sepuluh
menit begitu sesuatu dijalankan terhadap keadaan nyata — satu dari
**dry-run atas state produksi**, satu dari **membaca isi `workspace/` sebelum
membuat folder baru**. Yang penting: keduanya ditemukan lewat jalan yang tidak
direncanakan mencari bug. Yang pertama muncul di **warning yang saya sendiri
tulis dan nyaris saya lewati**; yang kedua muncul karena saya memeriksa
tetangga yang tidak diminta siapa pun. Konsekuensi praktisnya: **jalankan
sesuatu terhadap yang asli sebelum menyatakan selesai, dan baca keluaranmu
sendiri seolah orang lain yang menulisnya** — warning yang dibaca sekilas sama
tidak bergunanya dengan warning yang tidak ada.

**Kalau nanti kamu handoff lagi, bawa alasan ini juga.**

### Yang terbukti di sesi ini

- ✅ **Buktikan "pre-existing" dengan baseline, jangan dengan ingatan.**
  Worktree detached di commit baseline + `bun install` = 90 detik, dan ia
  menemukan satu error ekstra yang pekerjaan ini justru hilangkan — fakta yang
  tidak akan pernah muncul dari menebak.
- ✅ **Klaim ditahan sampai ada kontrol POSITIF.** "Inbox terkuras" dan "db
  tidak bertambah" dua-duanya berbunyi *tidak ada apa-apa* — dan itu juga bunyi
  kalau push tidak pernah sampai. Yang memutuskan adalah mata user melihat
  penanda `agent-turn` di layar bot penerima.
- ✅ **Cari lubang di test itu sendiri.** Test reply-guard membuat transcript
  dengan tangan, jadi tetap hijau meski forwarder memasang penanda yang salah.
  `markerFor` diuji langsung **karena lubang itu terlihat saat membaca ulang**,
  bukan karena ada test yang merah.
- ✅ **Fixture yang tidak mungkin ada di produksi memang seharusnya tidak
  lolos.** Tiga test `send` merah sesudah perbaikan `peers`; yang benar
  memperbaiki fixture-nya (`"{}"` → config sah), bukan melonggarkan pagarnya.
- ❌ **JANGAN percaya string literal multiline di skrip Python/Node untuk berkas
  repo ini** — CRLF membuat pencocokan gagal. Terjadi **dua kali lagi** sesi
  ini. Pakai `Edit` yang presisi, atau `assert` anchor-nya lebih dulu.
- ⚠️ **Worktree baru butuh `bun install` sendiri**, termasuk yang cuma dipakai
  90 detik.

## 10. Catatan Lain

- **Artefak:** dokumen HEAD `f642be0` · kode HEAD `35c531f`. Empat merge sesi
  ini: `d66af33` (state per-folder) · `8a9692a` (jalur antar-bot) · `1f3085d`
  (WAL) · `35c531f` (validasi peer).
- **Versi:** `cc-plugin` **0.12.0**, terpasang **dan berjalan**. `bot-conduct`
  0.0.11 · `inline-buttons` 0.0.10 · `telegram` (lama) 0.0.37-mirza.0.
- **Angka test:** `cc-plugin` **454 hijau, 0 fail, 927 `expect()`, 45 berkas**.
  `bunx tsc --noEmit` bersih — gerbang tipe ini **baru ada sejak kemarin**
  (`cc-plugin/tsconfig.json` + `@types/bun`); `bun test` tidak memeriksa tipe.
- **Mematikan plugin lama per-folder** (terukur di folder scratch, bukan
  ditebak): `claude plugin disable -s project <plugin>@mirza-marketplace`
  menulis `{"enabledPlugins": {...: false}}` ke `.claude/settings.json` folder
  itu. Reversibel lewat `claude plugin enable -s project`. **Enam bot harian
  tidak tersentuh** karena scope-nya project.
  ⚠️ **JANGAN matikan `pty-controller` sebelum `send_slash` mendarat** — itu
  satu-satunya jalan bot baru me-`/rename` dirinya sekarang.
- **AB-1..AB-3 di BACKLOG Bagian 6** — tiga item `BUTUH KEPUTUSAN` yang lahir
  dari uji hidup. **AB-1** (pesan antar-bot tidak dicatat ke mana pun) sudah
  ditawarkan dan user memilih **"bahas nanti"** — jangan tawarkan ulang sebagai
  penemuan baru. **AB-2** (agent-bus lama termuat di setiap sesi) bersinggungan
  langsung dengan pekerjaanmu.
- **Meteran yang terbukti berguna, pakai lagi:** `conversations.db` (readonly,
  `node:sqlite`) · `installed_plugins.json` (**versi yang benar-benar
  terpasang**) · `Get-CimInstance Win32_Process` (**siapa benar-benar
  berjalan**, dan apakah pid di berkas lock masih hidup) · `getMe` Telegram ·
  **worktree baseline + `bunx tsc`** (memisahkan "aku yang merusak" dari "sudah
  rusak sejak dulu").
- **Belum diuji hidup:** rollback `/context` · regresi slash tahap 1 ·
  `chained-statusline` di bentuk per-folder (belum pernah lahir — menunggu
  `/context` pertama).
- **Catatan user yang jadi penyaring seluruh proyek:** *"Saya ingin membuat
  system yang lebih optimal dan sederhana… dari sisi setup, instalasi,
  komunikasi, prompt."* · *"kita tidak perlu presisi di sini… no need to be so
  serious"* · *"Aku enggak mau over engineer."* · dan pagi ini: *"Saya ingin
  kita benar-benar terlepas dari arsitektur legacy."*
