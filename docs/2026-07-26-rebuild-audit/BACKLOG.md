# BACKLOG — rebuild fleetd/cc-plugin

**Dibuat:** 2026-07-31 · **Terakhir diperbarui:** 2026-07-31

---

# Bagian 0 — MULAI DARI SINI

> **Ini berkas pegangan tunggal untuk seluruh rebuild.** Kalau kamu sesi baru
> dan cuma diberi satu instruksi ("baca `BACKLOG.md`"), itu memang cukup —
> segala hal lain yang kamu butuhkan ditunjuk dari sini.
>
> Berkas ini **hidup**: ia berubah setiap ada kemajuan. Blok "Kondisi sekarang"
> di bawah wajib diperbarui setiap sesi yang mengubah keadaan.

## Kondisi sekarang

*(Blok ini yang paling sering basi. Perbarui SEBELUM sesi berakhir.)*

| | |
|---|---|
| **Tahap berjalan** | **Tahap 2.5-MASUK SELESAI seluruhnya** (Task 0–8). Berikutnya **2.5-KELUAR**, yang **belum punya spec maupun rencana** — baru daftar cakupan, jadi butuh sesi desain bersama user sebelum ngoding |
| **Versi terpasang** | `cc-plugin` **0.10.3** (tidak ada lagi `fleetd`) · `inline-buttons` **0.0.10** · `bot-conduct` **0.0.11** (aturan Plane dibuang seluruhnya, permintaan user 2026-08-04: *"Untuk selamanya tanpa plane"*) · `telegram` (marketplace lama) **0.0.37-mirza.0**. ⚠️ **Versi di repo ≠ versi yang berjalan** — plugin dimuat dari cache, dan cache **menyimpan semua versi lama** (0.3.0…0.9.0 masih ada). Konsekuensinya, memeriksa "folder versi X ada di cache" **bukan** bukti X yang dipakai: gerbang versi `uji-slash.bat` lulus untuk 0.9.0 selamanya |
| **Angka test** | `cc-plugin` **398** (satu paket sekarang) · hijau di Windows 11 / Bun 1.3.11. **`bun test` TIDAK memeriksa tipe** — pemeriksaan `tsc` ad-hoc (pinjam dari `cc-wrapper`) menangkap error yang seluruh suite hijau tetap lewatkan; jalankan keduanya |
| **Spec aktif** | **`docs/superpowers/specs/2026-08-02-tahap25-keluar-design.md` — 2.5-KELUAR, 4 item urut ketergantungan** (identitas sesi · simpan balasan · kutip · markdown). Belum punya rencana implementasi. · Sebelumnya: **`2026-08-02-penyatuan-engine-fleetd-design.md` — `fleetd` BERHENTI jadi daemon**, engine-nya disatukan ke `cc-plugin`; state tetap terpusat. Disepakati user 2026-08-02, belum punya rencana implementasi. Baca ini dulu sebelum menyentuh `fleetd/src/socket/**` atau `cc-plugin/src/fleetd-client.ts` — keduanya akan dibuang. · `2026-07-31-tahap25-masuk-design.md` §11 tetap berlaku untuk hasil uji live |
| **Rencana aktif** | `docs/superpowers/plans/2026-08-02-tahap25-keluar.md` — **Task 1-5 SELESAI dan SELURUHNYA terverifikasi hidup**, termasuk kutipan (pesan user maupun pesan bot sendiri). Task 6 tinggal dokumen. Task 1 sengaja tidak menulis kode produk: ia membuktikan dulu apakah `SessionStart` menyala pada `/clear`, karena seluruh item 0 berdiri di atas asumsi itu · Sebelumnya `2026-08-02-penyatuan-engine-fleetd.md` **SELESAI**, ter-merge `f4f0f77`, terverifikasi hidup |
| **Status** | Task 0–8 semuanya mendarat (`0605ebe` `b0cc2f5` `8009178` `a94da07` `1123446` `300bf0c` `48197b6` `e26acb9`). Task 7 sekaligus **menutup B-1 `peek_conversation`** lebih awal dari Tahap 6. Sesudahnya, di sesi yang sama: **W-10** Stop hook `cc-plugin` (`91d9df7`), **W-11** BOM (`e0cc2da`), dan keempat catatan user **U-1** buttons (`2d902af`), **U-2** keyboard dicopot (`90d9b0a`), **U-3** larangan minta `message_id`, **U-4** timezone (`c70a9cc`). |
| **Masih terbuka** | **W-23** keenam bot harian menjalankan `cc-plugin` **0.3.1** karena sesinya dibuka 2026-08-01, jadi reply-guard yang sudah diperbaiki di 0.3.3 **masih salah alarm hidup-hidup** — biaya nyata pertama dari W-18; butuh restart wrapper oleh user · **W-19** balasan keluar tidak pernah disimpan (regresi terhadap sistem lama; rumahnya 2.5-KELUAR) · **W-20** `session_id` basi setelah `/clear` (terukur, tidak memblokir) · **W-18** sesi bisa lebih tua dari perbaikannya · **W-7** BOM di `config.json` (= SCAR-026) · **W-9** nama `album_failed_count` menyesatkan. **W-3** (path socket) dan **W-12** (flake e2e) **gugur bersama penyatuan engine** — keduanya milik lapisan socket/dua-proses. Detail + peringatan cara memperbaikinya ada di Bagian 7 |
| **Belum diuji hidup** | 5 dari 10 kriteria uji live: lintas-bot (tidak bisa — mesin ini hanya punya satu bot), PDF/`.md` **masuk** (arah **keluar** sudah ✅ 2026-08-03), dokumen >20 MB, album 3 foto, album >10 foto. **Plus U-2**, yang belum pernah menyentuh Telegram sungguhan. Lihat `2026-08-01-status-kapabilitas-terverifikasi.md` untuk daftar lengkap ✅/🧪/⬜ |
| **cc-wrapper (BARU, 2026-08-03)** | **Fondasi berdiri dan terverifikasi hidup 5/5.** Paket baru `mirza-bots/cc-wrapper`, sejajar `cc-plugin`. Spec `docs/superpowers/specs/2026-08-03-cc-wrapper-design.md` · rencana `docs/superpowers/plans/2026-08-03-cc-wrapper-fondasi.md` (Lapis 1+2; Lapis 3 & 4 belum). **36 test hijau, `tsc --noEmit` bersih.** Runtime **Node + tsx, BUKAN Bun** — Task 0 mengukur `pty.write()` gagal di Bun 1.3.11 (`ERR_SOCKET_CLOSED`) sementara Node v22 bekerja; test tetap `bun test`. Commit: `c96a633` probe · `d51da3a` kerangka · `efbb69b` typer · `8784e8f` antrean · `17ac7fb` registry · `584496d` inbox · `bb4cd88` rakit · `8f5ec0f` teruskan argumen CLI. **Uji hidup:** perintah tunggal ✅ · batch berurutan ✅ (**termasuk saat CC sibuk**) · berkas `pending/` terhapus ✅ · flag CC diteruskan utuh ✅ · peringatan transcript tidak muncul ✅ |
| **cc-wrapper — tiga keputusan sesudah fondasi** | **Merge `36a0515`, spec §4.5.** **(1) Singleton per folder** — wrapper kedua **ditolak**, kebalikan `cc-plugin/src/engine/lock.ts` yang membunuh pemegang lama; aturannya sama (lindungi yang paling mahal) tapi yang mahal berbeda. Efek samping: satu folder → satu wrapper → satu sesi → satu poller. **(2) `--continue` menggantikan `--resume` dari mtime** — wrapper lama menyalin dua aturan internal CC dan pecah **diam-diam** kalau CC mengubahnya. Terukur: `--continue` di folder tanpa sesi menjawab `No conversation found to continue` lalu **keluar**, jadi ada fallback dua-syarat (keluar cepat **DAN** pesan itu). **(3) Gerbang kepercayaan folder** — `--dangerously-skip-permissions` **TIDAK** melewatinya; sesi tertahan tidak pernah siap dan injeksi ke situ hilang. Gerbangnya **terbukti bisa** dilewati injeksi Enter dan **sengaja tidak dilakukan**: itu memercayai folder atas nama user. **Keputusan user: deteksi dan lapor.** **57 test hijau.** Uji hidup: penolakan lock ✅ · deteksi gerbang ✅ · **fallback `--continue` belum diuji hidup** (membuat keadaannya butuh memercayai folder atas nama user) |
| **Lapisan slash Telegram — TAHAP 1 MENDARAT (2026-08-03)** | **Enam task TDD selesai, ter-merge `8c89d70`, ter-push. 319 test hijau** (274 lama + 45 baru). Empat modul murni di `cc-plugin/src/engine/slash/` (`classify` · `session-name` · `map` · `pending`), perakitan `index`, penyisipan `engine.ts`. Commit: `07b8185` `a53b1e1` `e0db349` `3550ef9` `ea20a01` `b5e1b1e`. **✅ TERVERIFIKASI HIDUP 2026-08-04 pada `bot-uji` (rilis 0.9.0)** — diperiksa dari **dua meteran**, dan `conversations.db` memberi **kontrol negatif dalam satu tabel**: bot yang sama, sepuluh menit terpisah. Pada **0.8.0** `/new test` (18:45:41) diikuti baris `assistant` 16 detik kemudian — AI ikut menjawab perintah yang bukan untuknya. Pada **0.9.0** `/new test-coba` · `/rename` · `/rename something` (18:55:19–18:55:37) **tidak diikuti satu pun baris `assistant`**, sementara teks biasa 18:56:15 tetap dijawab 10 detik kemudian. Itu bukan sekadar bukti fiturnya jalan — itu bukti **perubahannya yang menyebabkannya**. Keempat slash tetap tercatat `source='user'` (aturan §2.3 ✅). Tap tombol `slash:go:/compact` juga tercatat, dan AI tetap diam. `pending/` kosong sesudahnya — payload dikonsumsi wrapper. Menu "/" dua entri muncul di HP user. **Bukti ketiga, dari `logs/session-hook.log`:** `/new` menghasilkan `source=clear` dengan session id **berubah** `6ffc60fc…` → `58dcc0ed…` — sesi barunya benar-benar lahir, dan yang membuktikannya id yang hanya bisa ditulis Claude Code sendiri, bukan layar. **Jalur `slash:no` (tap Batal) ikut lulus 19:04** — dan pembuktiannya menuntut meteran ketiga, karena yang harus dibuktikan adalah **ketiadaan**: (a) `pending/` kosong, **nol** berkas; (b) `/compact` dan `slash:no` tetap **tercatat** `source='user'`; (c) **tidak ada baris `assistant`** sesudahnya; (d) yang menutup celahnya — **`session-hook.log` tidak menerima `source=compact` baru**, entri terakhirnya tetap 18:57:33 milik tap Kirim. Jadi tap Kirim dan tap Batal berdiri berdampingan di log yang sama sebagai kontrol positif dan negatif. **Ketiadaan di satu meteran bukan bukti; ketiadaan di tiga meteran yang saling bebas, iya.** **Tahap 1 tuntas seluruhnya — enam dari enam kriteria.** **Anomali yang sempat dicurigai** (satu balasan tampak dua kali di layar tapi satu baris di db) **terjelaskan dan bukan bug sistem**: stitching screenshot long-scroll Android. Kali ini layar menampilkan sesuatu yang tidak pernah terjadi — arah kebalikan dari pelajaran biasa, dengan pesan moral yang sama. **Satu penyimpangan dari rencana, disetujui user lewat tombol:** rencana menyisipkan cegatan sesudah `deliver()` dan berhenti; terukur saat membaca kodenya bahwa `handleIncomingMessage` melakukan **dua** hal dalam satu fungsi — `insertMessage` (`poller.ts:195`) lalu `sink.push` (`poller.ts:252`) — jadi cegatan itu saja membuat `/rename x` tercatat **DAN** sampai ke AI, yang ikut menjawab perintah yang bukan untuknya. Perbaikannya opsi **`pushToAi`** di jalur `deliver`: yang ditekan hanya pendorongan, pencatatan tetap tanpa syarat, dan indikator typing ikut padam (tidak ada giliran AI yang disiapkan). `classify()` — murni — dipanggil sebelum pencatatan untuk menentukan flag; memanggilnya di sana tidak mengonsumsi pesannya. **Pagar 55 byte `callback_data` terpasang** (W-25), diukur per **byte** dan bukan karakter — testnya memakai emoji supaya hitungan karakter tidak lolos. Test `pushToAi` sengaja memakai **dua meteran**: sink kosong **dan** barisnya ADA di db, karena sink kosong saja tidak membedakan "dicegat" dari "hilang". **`tsc` tidak tersedia untuk `cc-plugin`** (tidak punya `tsconfig.json`; rencana memang menyuruh melewatinya) — pemeriksaan ad-hoc pinjam `tsc` milik `cc-wrapper` hanya memunculkan satu error di `engine.ts:351`, kode typing keepalive yang tidak disentuh dan kemungkinan artefak opsi ad-hoc |
| **BELUM DIKERJAKAN — notifikasi "compact selesai" ke Telegram (dicatat 2026-08-04)** | **Keputusan user lewat tombol: catat dulu, kerjakan nanti.** Lahir dari pertanyaan user *"`/compact` perlu lumayan lama ya, kamu bisa tangkap dari hooks khusus?"* — dan jawabannya **sudah terukur, mekanismenya sudah terpasang.** `logs/session-hook.log` membuktikan hook `SessionStart` **menyala sesudah compact selesai, dengan `source=compact`** (18:57:33). Jadi sinyal ujung-akhirnya sudah ada dan tinggal dipakai. **Ujung-awalnya tidak butuh hook baru:** momen `/compact` berangkat adalah saat lapisan slash menulis payload ke `pending/`, dan itu kode kita sendiri. **Angka pertama sudah ada: 55 detik** (tap Kirim 18:56:38 → hook 18:57:33). Yang **belum diukur**: apakah Claude Code punya hook yang menyala di **awal** compact — tidak dicari karena tidak dibutuhkan. Catatan desain yang sudah terbayar mahal di proyek ini dan berlaku di sini: hook **hanya boleh mengimpor `node:`** — versi pertama `session-start.ts` mengimpor modul engine "supaya tidak duplikat" dan **tidak pernah menyala sama sekali** sambil tetap terlihat terpasang |
| **Menu slash Telegram (`setMyCommands`) — MENDARAT 2026-08-04** | **Diminta user setelah melihat menu "/" bot lama.** Terukur lebih dulu: `grep setMyCommands` atas seluruh `cc-plugin` **nol hasil** — sistem baru tidak pernah punya menu; sistem lama punya lewat `plugins/telegram/commands-registry.ts`. Merge `a8bb1c4`, **326 test hijau** (+7). Modul murni `cc-plugin/src/engine/slash/menu.ts`, daftarnya lahir dari **`KNOWN_COMMANDS`** — sumber yang sama yang memutuskan apa yang dicegat, jadi **papan nama dan dapur tidak bisa berbeda pendapat**. **Keputusan user lewat tombol: dua entri yang benar-benar jalan, bukan lima seperti sistem lama** — `/switch` dan `/delete` bahkan bukan command CC, jadi mendaftarkannya menjanjikan barang yang tidak ada. Satu test menjaga tahap berikutnya: menambah `/switch` ke `KNOWN_COMMANDS` tanpa menulis deskripsinya **gagal di test, bukan di layar HP user** (dibuktikan lewat mutation check: 2 fail saat deskripsi dihapus). Panggilannya **tidak di-await dan tidak fatal** — menu itu kosmetik, dan bot yang menolak melayani pesan karena gagal memperbaruinya menukar yang penting dengan yang tidak. **Baru muncul sesudah wrapper di-restart** (didaftarkan saat engine boot), beda dengan lapisan cegatnya |
| **Lapisan slash tahap 2 — `/context`: SPEC + RENCANA + KODE MENDARAT (2026-08-04)** | Spec `docs/superpowers/specs/2026-08-04-context-telegram-design.md` · rencana `docs/superpowers/plans/2026-08-04-context-telegram.md` (tujuh task TDD, **semuanya selesai**). **Kode ter-merge `4ab984b` lalu `6e6c8db`, ter-push, rilis `cc-plugin` 0.10.1. 383 test hijau** (326 → 383, +57). **UJI HIDUP SEBAGIAN 2026-08-04 pada `bot-uji`.** ✅ **Kriteria terpenting LULUS — statusline user selamat:** `status/chained-statusline` berisi `C:/Users/Mirza/.claude/statusline-progress.sh` (45 byte, **tidak kosong**). Dan itu justru skenario **paling berbahaya**: `bot-uji` **tidak punya `settings.json` sama sekali**, jadi statusline-nya ada di lapisan **global** — kondisi persis yang menggusurnya di enam bot lain. Di sistem lama baris itu akan berisi string kosong. ✅ `/context` dicegat dan dijawab lokal, **AI tidak ikut menjawab**. ✅ Berkas tangkapan terisi benar: `session_name: bbb`, context 5% (45.042/1.000.000), rate 5h 1%, cost $0.28. ✅ Versi terpasang terkonfirmasi `0.10.0` commit `4ab984b` lewat `installed_plugins.json`. ⚠️ **Lubang yang hanya uji hidup bisa menemukan:** `/context` yang dikirim tepat sesudah bridge terpasang menjawab *"belum ada data"* — benar secara harfiah, menyesatkan pada praktiknya, karena CC belum sempat menggambar baris status sekali pun. Diperbaiki di **0.10.1** (`6e6c8db`) dengan meniru alur sistem lama, **tapi menunggu KEJADIANNYA** (berkasnya muncul, maks 12×1,5 detik) alih-alih `setTimeout` durasi tetap milik sistem lama; pesan tunggu dikirim **sebelum** mulai menunggu, karena diam belasan detik tidak bisa dibedakan user dari bot yang mati. 🔬 **TEMUAN TERUKUR yang menghapus dugaan:** berkas tangkapan terisi beberapa detik sesudah bridge dipasang **tanpa restart apa pun** — jadi **Claude Code membaca ulang `settings.json` saat runtime**. Sebelumnya ini asumsi yang belum pernah diuji. Urutan `KNOWN_COMMANDS` sekarang **bermakna** (menu "/" lahir darinya apa adanya): `/context` di posisi pertama atas permintaan user, dikunci test + mutation check. **Belum diuji:** rollback, pemasangan dua kali, regresi slash tahap 1 — skripnya `bot-uji\run.bat`. Estafet bot-01 → bot-02. **Modul baru** di `cc-plugin/src/engine/context/`: `render` (murni, **nol import**, disalin dari `context-renderer.ts` sistem lama) · `chain` (murni, pagar 1) · `install` (pagar 2+3) · `status-file` · `bot-for-cwd` (murni), plus `bin/statusline-bridge.ts`. **Empat mutation check dijalankan dan semuanya membuat merah**, dikembalikan lewat salinan (bukan `git checkout` — perubahannya belum di-commit saat itu): mematikan lapisan user di `resolveChain` → 3 merah · mematikan pagar 3 → 1 merah · menghapus baca-ulang pagar 2 → 1 merah. **`tsc` ad-hoc menangkap dua hal yang `bun test` TIDAK BISA lihat** karena `bun test` tidak memeriksa tipe: array literal-union di `render.ts` yang menolak `push` (377 test hijau, kodenya tetap salah tipe), dan `import.meta.dir` yang API khusus Bun tanpa tipe standar — diganti `pluginRootFrom()` yang murni dan memakai `import.meta.url`. Sisa error `tsc` tinggal dua dan keduanya lama: `engine.ts:359` (typing keepalive, dulu 351) dan `Bun` global di `media.ts`. **TEMUAN yang menghapus satu kebutuhan:** payload statusline **sudah memuat `session_name`**, ditulis Claude Code sendiri — jadi `/context` **tidak butuh registri nama sesi sama sekali**; itu murni kebutuhan `/switch`. **Dua test tahap 1 sengaja jadi merah** karena mengunci daftar command **persis** (bukan "memuat"); dinaikkan ke tiga, tetap dikunci persis. **Penyimpangan dari rencana, disengaja:** rencana menguji rollback dengan `chainPath` ke folder tak ada, tapi `mkdirSync` recursive JUSTRU membuatnya — testnya akan hijau tanpa membuktikan apa pun; diganti penyuntikan `writeFile`. Ditemukan saat menulis test, bukan saat menjalankannya. **Smoke test bridge dijalankan betulan** (4 skenario), yang terpenting: stdin JSON rusak → statusline lama **tetap** jalan. **Dua pengukuran membalik asumsi.** **(1) Spec tahap 1 §7 no. 4 KELIRU dan sudah dikoreksi di tempatnya:** ia menulis "sistem baru punya statusline sendiri, isinya belum dibandingkan" — faktanya `grep -rn -i "statusline\|status_line\|last-status"` atas seluruh `mirza-bots` mengembalikan **nol kode** (hanya satu komentar di `slash/classify.ts` + satu baris README), dan `bot-uji` **tidak punya `.claude/settings.json` sama sekali**. Sistem baru tidak punya statusline apa pun, jadi tidak ada yang bisa dibandingkan. Ikutannya: `/context` **jauh lebih murah** dari dugaan — bahan bakunya sudah ada dan salah satunya **murni**: `context-bridge.ts` 48 baris (I/O) dan `context-renderer.ts` **170 baris dengan nol `import`**, langsung portabel. **(2) Regresi yang MASIH HIDUP, ditemukan user bukan oleh sistem:** statusline milik user **tergusur di enam dari enam bot harian** sekarang juga. Rantainya, dan tidak ada satu langkah pun yang error: installer `server.ts:1235-1243` mencari statusline pendahulu di **project** `settings.json`, padahal punya user ada di **global** `~/.claude/settings.json` → `previousCommand = null` → `chained-statusline` ditulis `previousCommand ?? ''` = **string kosong** → project `statusLine` dipasang dan **menimpa global** (project menang) → saat bridge jalan, `if (chain)` **false** pada string kosong sehingga statusline lama tidak pernah dipanggil, dan bridge sendiri tidak mencetak apa pun ke stdout → **baris status kosong**. Terukur: `chained-statusline` **0 byte di keenam bot**; `bot-02/.claude/settings.json` isinya **hanya** `statusLine`, bukti berkas itu memang dibuat dari nol oleh installer. **Dua kesalahan bertumpuk, dan yang kedua yang mematikan:** (a) melihat lapisan yang salah; (b) memperlakukan `null` sebagai "memang tidak ada" padahal artinya "**aku tidak menemukannya**". Chaining-nya **dibangun** — yang tidak ada adalah pemeriksaan apakah niatnya tercapai. Bertahan lama karena baris status kosong **tidak melempar error, tidak masuk log**; satu-satunya sensornya mata manusia. **Syarat user yang mengatasi segalanya:** *"statusline jangan sampai hilang"* — kalau harus memilih, **`/context` yang mengalah**. Dijamin oleh empat pagar (spec §5.3): resolusi dua lapisan · verifikasi **sesudah** memasang + rollback · **menolak memasang kalau ragu** · mutation check. Lokasi pemasangan: **project settings tiap bot** (blast radius). **Belum diukur, dinyatakan:** apakah ada jalur non-`statusLine` yang membawa payload sama — `statusLine` **bukan** hook, jadi tidak bisa lewat `hooks.json` plugin seperti `SessionStart`/`Stop` |
| **⚠️ KLAIM YANG DIKOREKSI — "kriteria A1 lulus" (2026-08-04)** | **Disimpan sebagai koreksi, bukan dihapus.** Sesi ini menyatakan kriteria terpenting `/context` **lulus** karena `chained-statusline` terisi benar (bukan string kosong). **Itu terlalu cepat.** Yang diperiksa hanya **artefaknya**, bukan **efeknya**: statusline user ternyata **tidak pernah benar-benar dieksekusi**. Dibongkar oleh **user**, yang melaporkan `statusline-progress.sh` *dibuka* Windows tiap kali bot dijalankan. Sebabnya asosiasi ekstensi — `.sh` → `sh_auto_file = "…\git-bash.exe" --no-cd "%L" %*` — jadi menyerahkan path `.sh` ke shell **membuka jendela**, dan `spawnSync` **menunggu jendela itu ditutup**: terukur **menggantung dua menit penuh**. Diperbaiki **0.10.2** (`da28825`, `invoke.ts`): token pertama berakhiran `.sh` dijalankan lewat `bash`, plus `windowsHide` dan `timeout: 5000` — baris status yang menggantung **membekukan tampilan CC**. Sesudah perbaikan: **1 detik**, dan statusline user **benar-benar tercetak** (dibuktikan dengan menjalankan bridge sungguhan, output ANSI-nya muncul). **Dua pelajaran, dan yang kedua baru:** (1) **memverifikasi artefak bukan memverifikasi efek** — berkas yang isinya benar tidak membuktikan isinya dipakai; kriteria A1 sendiri sudah menuntut **dua** meteran (layar + berkas) dan hanya satu yang dijalankan. (2) **Memperbaiki bug bisa membuka bug yang berdiri di belakangnya:** di sistem lama rantainya selalu kosong, jadi baris pemanggilan itu **tidak pernah dieksekusi sekali pun** — bug kedua tidak mungkin terlihat sebelum bug pertama diperbaiki. Konsekuensi praktis: **jangan pernah menyatakan "lulus" pada kriteria yang menyebut dua meteran sebelum kedua-duanya dijalankan** |
| **⚠️ BUG KETIGA — versi tersemat di perintah statusLine (2026-08-04, `0.10.3` `98fc490`)** | **Rantai ini yang paling layak dipelajari: tiga bug berbaris, dan masing-masing baru bisa terlihat sesudah yang sebelumnya diperbaiki.** Perintah bridge menyematkan **nomor versi** di path-nya (`…/cc-plugin/0.10.0/bin/statusline-bridge.ts`). Sesudah `claude plugin update`, `settings.json` **tetap menunjuk berkas versi lama** — yang masih ada, karena cache menyimpan semua versi. **Akibat langsung:** perbaikan `.sh` di `0.10.2` tidak pernah dijalankan sama sekali; user tetap melihat editor terbuka dan wajar mengira perbaikannya gagal. **Akibat yang jauh lebih berbahaya, dan nyaris terjadi:** `resolveChain` membandingkan **string persis**, jadi bridge versi lama terbaca sebagai *"statusline pendahulu yang harus diselamatkan"* — panggilan `/context` berikutnya akan menulisnya ke `chained-statusline`, **menimpa statusline user yang asli dengan path bridge lama**. Hasilnya bridge memanggil bridge, dan statusline user hilang selamanya. Yang menyelamatkan hanya waktu: `/context` kebetulan belum dipanggil lagi sesudah update. **Perbaikan:** `isOurBridge()` mengenali bridge **versi apa pun** lewat pola path (folder `cc-plugin` + nama berkas persis — sengaja spesifik, karena menyangka statusline orang lain sebagai milik kita justru membuangnya). Pada `stale-bridge`, **hanya path di settings yang diperbarui; rantainya tidak disentuh sama sekali.** **Dua pelajaran yang naik jadi pegangan:** (1) **identitas berbasis string persis rapuh terhadap apa pun yang berubah tiap rilis** — kalau sebuah nilai memuat nomor versi, jangan memakainya sebagai tanda pengenal; pakai polanya. (2) **Sesudah tiap perbaikan, ukur ulang keadaan nyatanya** alih-alih menganggap masalahnya habis — dua dari tiga bug di rantai ini ditemukan **user**, bukan oleh test maupun oleh saya |
| **⚠️ KLAIM YANG DICABUT — "blind spot terlihat hidup-hidup" (2026-08-04)** | **Baris ini sengaja disimpan sebagai koreksi, bukan dihapus.** Sesi ini sempat menulis bahwa `/new test` dan `/rename halo123` yang dikirim user "tidak pernah tercatat, dicegat sebelum sempat dicatat seperti sistem lama". **Itu salah**, dan dibongkar oleh query yang seharusnya dijalankan sejak awal: `SELECT ts,bot,source,text FROM messages WHERE text LIKE '/%'` di `conversations.db` mengembalikan **kedua baris itu, dengan `bot: bot-uji`**. Pesannya sampai ke bot yang benar **dan** tercatat. Yang terjadi sesungguhnya ada di baris berikutnya. **Cara kesalahannya lahir persis pola yang diwariskan handoff:** dua fakta yang masing-masing benar ("pesan tidak muncul di sesi bot-01" + "sistem lama memang mencegat sebelum mencatat") disandingkan jadi sebab-akibat yang tidak ada. Meteran yang bisa menjawabnya — database — **tersedia sepanjang waktu dan tidak dipakai sampai user memaksa.** Layar bukan meteran yang cukup, dan itu berlaku juga untuk layar HP user |
| **Kenapa lapisan slash tidak aktif meski sudah ter-merge — 2026-08-04** | Terukur dari `Win32_Process`: proses yang melayani `bot-uji` adalah `bun run ~/.claude/plugins/cache/mirza-bots/cc-plugin/**0.8.0**/src/main.ts`. **`cc-plugin` dimuat dari plugin cache, bukan dari repo** — `--dangerously-load-development-channels "plugin:cc-plugin@mirza-bots"` tetap mengambil versi yang terpasang di cache. Kode tahap 1 ada di repo sejak `8c89d70`; cache masih 0.8.0, yang tidak punya lapisan slash sama sekali. **Argumen yang gugur:** sesi ini sempat menyimpulkan wrapper pasti memuat kode baru karena prosesnya lahir **20 menit sesudah** merge. Waktu start memang benar, kesimpulannya tidak — **umur proses tidak menentukan apa pun kalau yang dimuat datang dari folder lain.** Itu sudah dinyatakan sebagai "argumen, bukan bukti" saat diucapkan, dan terbukti salah dalam sepuluh menit. **Perbaikannya:** rilis **0.9.0** (`65c8de8`), lalu `claude plugin marketplace update mirza-bots` + `claude plugin update cc-plugin@mirza-bots`, lalu **restart wrapper**. README `mirza-bots` §"Setiap kali cc-plugin diubah" sudah memperingatkan persis ini, dan tidak ada apa pun yang mengingatkan kalau langkahnya terlewat |
| **Lapisan slash Telegram — desainnya (2026-08-03)** | Spec `docs/superpowers/specs/2026-08-03-lapisan-slash-telegram-design.md` · rencana tahap 1 `docs/superpowers/plans/2026-08-03-slash-telegram-tahap1.md` (enam task TDD). **Aturan paling mengikat: CATAT DULU, BARU CEGAT** — sistem lama memanggil `tryRouteMetaCommand()` sebelum `logInbound()`, dan biayanya nyata: audit membaca `/switch` sebagai 0× dipakai padahal **139×**. Daftar "dikenal" **empat**, disetujui user: `/rename` (3,87/hari) · `/new` (1,70/hari) · `/switch` (0,17/hari) · `/context` (tak terukur, terpasang 6/6 bot). Yang tak dikenal → **tombol konfirmasi**, bukan ditolak. Tahap 1 hanya `/rename` + `/new` + konfirmasi (5,57 dari 5,74/hari); `/switch` dan `/context` tahap 2 karena butuh daftar sesi bernama + jembatan statusline |
| **cc-wrapper — dua temuan yang mengubah rencana** | **(1)** Sesi CC anak **mewarisi `CLAUDE_CODE_CHILD_SESSION`** dan akibatnya **tidak menyimpan transcript**. Karena Lapis 3 memakai berkas sesi `.jsonl` sebagai sumber bukti, `spawnClaude` wajib lewat `childEnv()` yang membuangnya. Variabel `CLAUDE_CODE_*` lain yang ikut terwaris **belum diukur**. **(2)** Lubang `/clear` → `/rename` **tidak terbukti menganga** — 2 dari 2 percobaan mendarat, jadi **Lapis 3 turun prioritas**; jangan bangun barrier tanpa bukti baru. Pada percobaan kedua `/rename` **tidak meninggalkan jejak di layar** padahal berhasil; yang membuktikan adalah `customTitle` di berkas sesi CC — layar bukan meteran yang cukup |
| **Handoff terakhir** | `.handoff/202608032137-prompt-lapisan-slash-telegram-tahap1.md` — estafet bot-02 → bot-01: **kerjakan rencana tahap 1 lapisan slash**. Hasilnya: enam task mendarat di `main` (`8c89d70`), plus satu penyimpangan yang lahir dari membaca kode dan bukan dari membaca rencana (baris di atas). Sebelumnya `.handoff/202608031320-prompt-celah-4-system-outbox.md` — estafet bot-01 → bot-02: **ukur dulu apakah celah #4 menggantung pada #6**. Hasilnya: menggantung (audit §8), lalu brainstorming melahirkan spec + rencana + fondasi cc-wrapper. Sebelumnya `.handoff/202608031054-prompt-celah-3-kirim-lampiran-keluar.md` — estafet bot-03 → bot-01: **bangun celah #3**. Hasilnya: spec + rencana + rilis 0.8.0, terverifikasi hidup. Sebelumnya `.handoff/202608021215-…` ke bot-03 (audit celah, bukan membangun — melahirkan `2026-08-02-celah-migrasi-bot-harian.md`), dan `.handoff/202608011930-…` ke bot-02 |
| **Celah migrasi terukur** | **`2026-08-02-celah-migrasi-bot-harian.md`** — jawaban atas *"apa yang menghalangi satu bot harian pindah?"*, diukur dari `messages.db` + `wrapper.log` + `session-names.json` keenam bot, 30 hari. Empat celah teratas **tidak ada** dalam dugaan sebelumnya: chunking (10,6/hari), system-outbox (7,2/hari), nama sesi Telegram (4,9/hari), kirim lampiran keluar (2,7/hari) |
| **Urutan berikutnya (dipilih user 2026-08-02)** | **"Termurah dulu"** — tiga celah yang seluruhnya di dalam `cc-plugin/src/engine/`, tanpa menyentuh wrapper PTY. **(1) chunking balasan panjang — SELESAI 2026-08-03** (merge `b53b99d` + `1e02af3`, rilis 0.6.0 lalu 0.6.1, **terverifikasi hidup lewat Telegram sungguhan**). **(2) indikator typing — SELESAI 2026-08-03** (merge `6deb4f9`, rilis 0.7.0, terverifikasi hidup: indikator bertahan sepanjang penantian dan padam tepat saat balasan mendarat). **(3) kirim lampiran keluar `files` — SELESAI 2026-08-03** (merge `298f5af`, rilis 0.8.0, terverifikasi hidup: keempat kriteria lulus). **Paket "termurah dulu" habis.** **Celah #4 diukur ulang 2026-08-03 dan PECAH DUA** (audit §8): **4a** (`session-change` → Telegram, 5,7/hari) **menggantung penuh pada #6**; **4b** (kiriman proaktif dari dalam sesi, 2,3/hari) berdiri sendiri — `engine.ts:564` melempar `no_known_chat` bila bot belum menerima pesan di sesi itu, dan `engine.ts:130` mematikan `source: "assistant"`. Angka "7,2/hari" di audit adalah **event wrapper murni**, 100% `session-change`. Arah sesudahnya dipilih user: **definisikan ulang wrapper** → lahir spec + rencana + fondasi `cc-wrapper` (baris di atas). Detail + alasan: §6 dan §8 dokumen celah migrasi |
| **Celah #3 (kirim lampiran keluar) — hasil uji hidup** | ✅ Keempat kriteria lulus pada `bot-uji` 2026-08-03, diperiksa dari **dua meteran**: layar user (screenshot) dan `conversations.db` (readonly). (1) `.png` → foto dengan preview, baris #78 `kind: photo`. (2) `.md` → dokumen, nama berkas terbaca, baris #80 `kind: document`. (3) dua berkas satu panggilan → dua pesan, `message_id` 142 dan 143, urutan sesuai. (4) **path salah ketik → tidak ada satu pun baris ber-`source: assistant` yang memuat teksnya** — kriteria terpenting, dan satu-satunya yang tidak bisa dibuktikan test unit: yang teruji hanyalah `prepareReply` melempar, sedangkan bahwa ia melempar *sebelum* teks berangkat dijaga oleh struktur. Bentuk barisnya persis rancangan: `text` NULL, `reply_to` NULL, path di `attachments`, `kind` benar per berkas. Spec: `docs/superpowers/specs/2026-08-03-kirim-lampiran-keluar-design.md` · Rencana: `docs/superpowers/plans/2026-08-03-kirim-lampiran-keluar.md` |
| **Celah #2 (typing) — hasil uji hidup** | ✅ Dikonfirmasi user 2026-08-03: *"Typing indicator padam tepat saat response bot saya terima."* Itu persis kontraknya — bertahan sepanjang penantian, berhenti di balasan pertama. Dua aturan yang lahir dari pertanyaan user dan naik jadi tulisan di spec: indikator **hanya untuk giliran yang dipicu user** (kiriman proaktif tidak boleh memicunya — tidak berguna kalau tidak ada mata yang melihat), dan batas 300 detik **bukan timeout** (tidak ada pekerjaan dibatalkan; yang berhenti hanya indikatornya). Spec: `docs/superpowers/specs/2026-08-03-indikator-typing-design.md` · Rencana: `docs/superpowers/plans/2026-08-03-indikator-typing.md` |
| **Celah #1 (chunking) — hasil uji hidup** | Empat kriteria, semuanya ✅ pada `bot-uji` 2026-08-03: balasan pendek → satu pesan · **1231 karakter → tetap satu pesan** (membuktikan jalur cepat, bukan cuma test) · **9.766 karakter → 5 pesan** dengan kutipan hanya di pesan pertama, tombol hanya di pesan terakhir, dan tidak ada teks hilang di sambungan · jumlah baris `conversations.db` = jumlah pesan di layar, tiap baris ber-`message_id` sendiri. Spec: `docs/superpowers/specs/2026-08-02-chunking-balasan-panjang-design.md` · Rencana: `docs/superpowers/plans/2026-08-02-chunking-balasan-panjang.md` |
| **Berikutnya setelah MASUK** | ~~Penyatuan engine~~ **SELESAI** → **2.5-KELUAR** (spec siap), lalu 2.5-GUARD, lalu Tahap 3 |

## Utang yang harus dibayar sebelum tahap berikutnya

*(Hal yang sudah diketahui tapi belum dikerjakan, dan mudah terlupa karena
bukan bagian dari tahap manapun.)*

- **42 item `BUTUH KEPUTUSAN`** — Bagian 4 & 6. Yang paling mendesak: rumah skill
  `telegram-conduct` (rumah belasan aturan, tidak dimiliki tahap manapun).
  Disepakati dibereskan **bersama perencanaan Tahap 3**, bukan lebih awal.
- **2 kontradiksi antar-dokumen** — Bagian 4 Kelompok B. (Kontradiksi ketiga,
  FTS5, sudah ditutup 2026-07-31.)
- **Penegakan permission `0600`** pada `config.json` oleh kode — sudah ditambal
  manual, penegakannya ada di 2.5-GUARD.
- **~~⚠️ Celah desain baru (ditemukan 2026-07-31)~~ — GUGUR 2026-08-02.** Seluruh
  celah di bawah lahir dari adanya daemon; spec penyatuan engine membubarkan
  daemonnya, jadi "siapa menyalakan `fleetd`" dan "`fleetd` mati di tengah jalan"
  tidak punya tempat untuk terjadi lagi. Teks aslinya disimpan supaya alasan
  gugurnya bisa ditelusuri:
  spec §5 baris 102 memutuskan `bot-cc` menyalakan `fleetd` **bila belum
  berjalan** — jadi pemulihannya terjadi **saat bot dibuka**. Itu tidak menutup
  kasus `fleetd` mati **di tengah jalan sementara bot tetap terbuka**: tidak ada
  yang menyalakannya lagi sampai user kebetulan membuka bot berikutnya, dan bot
  yang sedang terbuka jadi bisu **tanpa pemberitahuan apa pun**. Terjadi dua kali
  nyata pada 2026-07-31. Alarm `doctor` (area-12 §12.5) memang dirancang untuk
  ini, tapi belum dibangun dan belum jelas siapa yang menjalankannya secara
  berkala. **Perlu diputuskan bersama perencanaan Tahap 4** (rumah `bot-cc`).
  Sementara itu: `fleetd` dijalankan manual dari terminal user sendiri, bukan
  dari sesi Claude Code — proses background sesi ikut mati saat sesi dibersihkan.

## ⚠️ Penilaian ulang Tahap 4 (`bot-cc`) — 2026-08-02

Spec penyatuan engine menulis bahwa alasan terbesar `bot-cc` — *"menyalakan
`fleetd` bila belum berjalan"* — **hilang** bersama daemonnya, dan ruang
lingkupnya **menyusut**. Itu masih benar, tapi setengah cerita, dan setengah
yang hilang justru menaikkan prioritasnya.

**Sebelum penyatuan:** bot hidup di daemon. Wrapper PTY adalah kenyamanan —
sesi bisa mati dan bot tetap mendengar.

**Sesudah penyatuan: umur sesi = umur bot.** Sesi mati → poller mati → bot bisu.
Jadi wrapper yang bisa menyalakan ulang sesi dan memulihkan konteksnya bukan lagi
kenyamanan; ia satu-satunya hal yang membuat bot bertahan melewati sesi yang
crash atau terminal yang tertutup tidak sengaja.

**Dua kapabilitas yang ada di sistem lama dan BELUM ada di sistem baru** —
diperiksa 2026-08-02, `grep node-pty|conpty|resume` atas seluruh `mirza-bots`
mengembalikan kosong:

| Kapabilitas | Di sistem lama | Kenapa penting sekarang |
|---|---|---|
| Wrapper node-pty + injeksi perintah native | `plugins/pty-controller/wrapper/` | Satu-satunya jalan menjalankan `/clear`, `/rename`, dan sejenisnya dari luar sesi |
| Resume ke sesi sebelumnya | `wrapper.ts:414` (`resumeArgs: ['--resume', latestId]`) + berkas `wrapper.current_session_id` | Memulihkan bot, bukan cuma memulihkan percakapan |

**Diangkat user**, bukan ditemukan mekanisme apa pun — ia menanyakan keduanya
setelah membaca spec penyatuan. Tanpa pertanyaan itu, catatan "ruang lingkupnya
menyusut" akan terbaca sebagai "jadi bisa ditunda", dan kesimpulan itu keliru.

## Peta berkas — apa dibaca kapan

| Berkas | Perannya | Kapan dibaca |
|---|---|---|
| **`BACKLOG.md`** (ini) | Checklist induk + kondisi sekarang | **Selalu, pertama** |
| `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` | Arsitektur (`fleetd`/`bot-cc`/`cc-plugin`) + peta 6 tahap (§10) | Saat butuh tahu *kenapa* sesuatu dirancang begitu, atau urutan tahap |
| `docs/2026-07-26-rebuild-audit/README.md` | Ledger keputusan K-1..K-18 + permintaan B-1..B-10 | Saat menyentuh keputusan lama, atau sebelum memutuskan hal baru yang mungkin sudah diputuskan |
| `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md` | Celah antara satu bot harian dan sistem baru, **urut frekuensi pakai terukur** | Sebelum memilih apa yang dibangun berikutnya. Memuat blind spot meteran: meta-command **tidak** tercatat di `messages.db` |
| `docs/2026-07-26-rebuild-audit/area-01..14-*.md` | Inventaris fitur asli + verdict per fitur | Saat butuh alasan lengkap satu baris backlog |
| `docs/2026-07-26-rebuild-audit/2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md` | Gap area 01-04 vs kode nyata | Saat mengerjakan Tahap 2.5 |
| `docs/2026-07-26-rebuild-audit/2026-07-31-ekstraksi-area-05-14.md` | Item area 05-14 (belum disilangkan ke kode) | Saat merencanakan Tahap 3-6 |
| `docs/superpowers/specs/` + `docs/superpowers/plans/` | Spec & rencana per sub-proyek | Sesuai "Spec/Rencana aktif" di atas |
| ⚠️ `.superpowers/sdd/2026-07-31-tahap25-masuk/` | Ledger progres + brief tiap task | Sebelum mengerjakan task. **Ada DUA set `task-N-brief.md` bernama identik** — yang benar ada di folder ini; yang di `.superpowers/sdd/` (root) sisa proyek lain (`packages/shared`, `bot-03`, "fase 0") dan **tidak terlihat salah**: bentuknya sama persis, lengkap dengan langkah TDD berkotak-centang. Nyaris menjebak 2026-07-31. Selalu buka dengan path lengkap |
| `.handoff/` | Kondisi antar-sesi | Di awal sesi lanjutan |
| `CLAUDE.md` (root repo) | Aturan repo + checklist rilis plugin lama | Sebelum menyentuh `plugins/**` |
| `mirza-bots/README.md` | Apa yang benar-benar ada di kode + prosedur pasang/update `cc-plugin` | Sebelum menjalankan atau merilis |

**Repo:** dokumen di `mirza-marketplace`, kode di `mirza-bots`. **Keduanya punya
remote dan wajib di-push** (dikoreksi 2026-08-02; baris lama menyebut `mirza-bots`
tanpa remote dan melarang `git push` di sana — itu sudah tidak benar sejak
2026-08-01, dan handoff hari itu sudah menyebut keduanya ter-push).

**JANGAN dibaca:** `docs/notes/` — sistem lama, tidak relevan.

## Aturan keempat — temuan baru wajib masuk ke sini

Tiga aturan di bawah menjaga item yang **sudah** terdaftar. Aturan ini menjaga
yang **belum**:

4. **Setiap fitur, gap, atau keputusan yang baru ditemukan dicatat ke berkas ini
   pada commit yang sama saat ia ditemukan** — sekalipun tidak akan dikerjakan
   sekarang. Kalau belum jelas milik tahap mana, taruh di Bagian 6 dengan status
   `BUTUH KEPUTUSAN`; jangan dibuang, jangan ditebak diam-diam.

**Kenapa aturan ini ada:** dua fitur (quote-reply B-10, indikator typing TG-103)
lolos dari seluruh Tahap 1-2 dan baru ketahuan karena user kebetulan
mengingatnya — bukan karena ada mekanisme yang menangkapnya. Berkas ini menutup
risiko itu untuk 313 item yang sudah terdaftar; aturan keempat inilah
satu-satunya yang menutupnya untuk yang ke-314. **Ia bergantung pada disiplin,
bukan mekanisme** — jadi ditulis di depan, bukan dikubur di bawah.

---

## Kenapa file ini ada

Sistem lama sedang ditulis ulang mengikuti peta jalan 6 tahap (lihat `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` §10). Tapi checklist fitur sebenarnya tersebar di 14 file audit terpisah, dan tak satu pun dari file itu punya kolom status. Akibatnya fitur bisa lolos tak dibangun tanpa ada yang sadar — sudah terjadi dua kali, lalu satu rekonsiliasi menyeluruh menemukan 19 gap lagi yang lolos diam-diam. File ini adalah penawarnya: **satu tempat** yang menjawab "apa yang belum dikerjakan untuk tahap yang mau saya bangun?" Kalau file ini gagal dipakai — kepanjangan, atau tak bisa di-update — masalah yang sama akan kembali. Utamakan **bisa dipakai** di atas lengkap-berbunga.

## Tiga aturan pakai (menonjol, karena ini yang paling sering dilanggar)

1. **Tidak ada tahap boleh dinyatakan selesai** sebelum semua barisnya berstatus final (SELESAI / TIDAK RELEVAN / DITUNDA-dengan-alasan-tertulis).
2. **Status diperbarui di commit yang sama** dengan kode yang merilisnya — jangan ditunda ke "nanti".
3. **Setiap rencana tahap baru dimulai dari file ini**, bukan dari §10 spec. §10 tetap peta urutan tahap, bukan checklist kerja.

## Catatan jujur soal keandalan status

- **Area 01–04** (Tahap 1–3-ish dari sistem lama yang sudah sempat dibangun): statusnya **faktual** — hasil membaca langsung kode `fleetd/src/` dan `cc-plugin/src/` per 2026-07-31 (lihat `2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md`).
- **Area 05–14**: statusnya **belum pernah dicek ke kode** — tahap-tahap itu memang belum dibangun. Status `BELUM` di sana berarti *"belum diperiksa maupun dibangun"*, bukan hasil verifikasi negatif. Begitu tahapnya mulai dibangun, baris-barisnya wajib direkonsiliasi ulang ke kode nyata seperti yang dilakukan untuk area 01-04 — jangan asumsikan `BELUM` tetap akurat tanpa dicek ulang.

## Aturan hitung (dipakai konsisten di seluruh file ini)

Satu baris = satu entri keputusan di dokumen sumber (satu baris tabel, atau satu verdict setingkat-§ bila seksi itu tidak bertabel) — aturan yang sama dipakai dokumen ekstraksi area 05-14. **Bagian 3 dan Bagian 4 adalah tampilan (view), bukan inventaris** — semua baris yang dihitung ada di Bagian 5 dan Bagian 6 saja; Bagian 3/4 hanya menunjuk-silang ke baris yang sama supaya tidak dihitung dua kali.

---

## Bagian 2 — Ringkasan status per tahap

| Tahap | Item | SELESAI | SEBAGIAN | BELUM | Lainnya | Status tahap |
|---|---:|---:|---:|---:|---|---|
| 1 — Fondasi | 30 | 4 | 0 | 24 | 2 TIDAK RELEVAN | Sebagian besar fondasi state/config sudah SELESAI; `doctor`, liveness terpadu, dan retensi/permission file masih kosong total. |
| 2 — Jalur pesan | 32 | 5 | 4 | 22 | 1 TIDAK RELEVAN | Pipa dasar (allowlist, auto-download foto) jalan, tapi gap terbesar sistem baru ada di sini: `message_id` tak tersimpan, chunking tak ada, quoting tak ada. |
| 3 — Penegakan | 21 | 1 | 0 | 20 | — | Hampir seluruhnya belum dibangun — hanya ack-tap-tombol yang sudah SELESAI; validasi tombol, prefiks `ai:`, dan penegakan mesin (ack/Stop-guard) masih nol. |
| 4 — Sesi | 90 | 0 | 0 | 90 | — | Belum mulai dibangun sama sekali (tahap terbesar dari segi jumlah item — wrapper PTY, injeksi, statusline bridge, `/context`). |
| 5 — Antar-bot | 82 | 0 | 0 | 82 | — | Belum mulai — mencakup seluruh agent-bus dan mesin handoff data-driven. |
| 6 — Sisanya | 17 | 0 | 0 | 16 | 1 BUTUH KEPUTUSAN | Belum mulai; satu item (B-6, penyembunyian sesi remeh) terkunci kontradiksi kriteria antar-dokumen. |
| **Tanpa tahap** | 41 | 0 | 0 | 0 | 41 BUTUH KEPUTUSAN | Perlu keputusan manusia sebelum bisa masuk tahap manapun — lihat Bagian 4 & 6. |

**Total item di file ini: 313** (41 dari rekonsiliasi area 01-04 + 272 dari ekstraksi area 05-14).

### Tahap 2.5 — pecahan kerja (diputuskan user 2026-07-31)

Tahap 2 dinyatakan "selesai" sebelum file ini ada, lalu rekonsiliasi menemukan
sisanya masih besar. Sisa itu dipecah jadi tiga sub-proyek supaya tiap satu
menghasilkan sesuatu yang utuh dan bisa diuji sendiri. **Urutan yang dipilih
user: MASUK → KELUAR → GUARD.**

| Sub-proyek | Isi | Urutan |
|---|---|---|
| **2.5-MASUK** | `message_id`+`metadata` disimpan (akar) · handler `message:document` **berikut** `safeName()` · catch-all lampiran tak didukung · quote-reply masuk (TG-111) · pengerasan album (cap 10, sort by `message_id`, `Promise.allSettled`, aturan caption) · unduh gagal per-item tidak menjatuhkan seluruh pesan | **1** |
| **2.5-KELUAR** | Konversi CommonMark→MarkdownV2 · mesin chunking · logging balasan ke `conversations.db` (TG-081) · pengiriman lampiran keluar (TG-070/071/079 + TG-069) · quote-reply keluar (TG-077) · hasil `sent (id: N)` (TG-082) · keyboard hanya di chunk terakhir (TG-078) | 2 |
| **2.5-GUARD** | Typing indicator (TG-103) · config korup → `.corrupt-<ts>` (TG-156) · penegakan permission 0600 file token oleh `fleetd` (SCAR-024) · tool `get_message_by_id` · `peek_conversation` (B-1) | 3 |

**Catatan penamaan:** sub-proyek ini sengaja dinamai MASUK/KELUAR/GUARD, bukan
A/B/C — "B-N" di repo ini sudah berarti item ledger permintaan fitur, dan
"antar-bot" adalah Tahap 5. Penamaan A/B/C sempat dipakai dan langsung
menimbulkan kebingungan.

**Tidak termasuk 2.5** (tetap Tahap 3): semantik tombol — validasi boundary,
prefiks `ai:`, resolusi label saat tap, hapus keyboard setelah tap, tombol
"Jelaskan manual" (B-4), penolakan pertanyaan-tanpa-tombol (B-5).

**Sudah ditutup di luar sub-proyek:** permission `config.json` disetel manual ke
`0600` pada 2026-07-31 (sebelumnya `0644` — token SELURUH armada bisa dibaca
proses mana pun di mesin itu). Penegakannya oleh kode tetap ada di 2.5-GUARD.

**Kontradiksi FTS5 (Bagian 4 Kelompok B #2) SUDAH TERJAWAB** oleh fakta lapangan,
2026-07-31: `conversations.db` sungguhan sudah punya tabel `messages_fts` beserta
ketiga trigger sinkronisasinya — jadi §12.4 ("wajib sejak awal") sudah menang,
skemanya terbangun di Tahap 1. Yang tersisa untuk Tahap 6 hanya *tool*
pencariannya. Bukan lagi keputusan terbuka.

---

## Bagian 3 — Blokir struktural

Akar-akar ini masing-masing memblokir banyak item sekaligus. Baris di tabel ini adalah **rujukan silang** ke item yang sudah dihitung di Bagian 5/6 — bukan item tambahan.

| Akar | Memblokir | Tahap terdampak |
|---|---|---|
| **`message_id` pesan masuk tak tersimpan** (gap ditemukan pass rekonsiliasi 01-04) | `get_message_by_id` · fallback album TG-139 · sort album SCAR-055a · outbound quoting TG-077 · quote-reply masuk TG-111/B-10 | 2 |
| **Statusline bridge** (area-11 §11.1) | `/context` (6 item) · field context/window/biaya di `agent_status` (§7.5) · ambang PENGIRIM 50% handoff (§8.B) · ambang PENERIMA <100k (§8.2b) | 4, dikonsumsi terberat di 5 |
| **K-7 — lifecycle jadi field data** (area-05 §5.4) | §5.4 sendiri · status kerja `agent_status` (§7.5) · syarat "tidak sedang bekerja" (§8.2b) · self-reset satu langkah (§8.4) · pemicu name-session (§10.7/§10.C) | 4, menjalar ke 5 dan 6 |
| **Hook `SessionStart` / K-10** (area-06 §6.3) | deteksi sesi baru · barrier `/clear` jadi event (§6.2) · lifecycle sesi §6.8 · fakta "sedang bekerja" (§8.2b) | 4 |
| **`doctor`** (area-12 §12.5) | syarat terima §6.3 · ack dua tingkat SCAR-071 (§6.7) · karantina payload (§6.7/§14.6) · handoff menggantung (§8.3) · store mati (§12.6) · satu-satunya tempat versi komponen terbaca (§11.3) | Kerangka di Tahap 1, isi alarmnya di Tahap 4-5 |
| **FTS5 + tool pencarian** (area-12 §12.4) | `peek_conversation` (B-1) · pencarian (B-2, di luar v1) | Skema idealnya Tahap 1, tool-nya Tahap 6 — lihat konflik tahap di Bagian 4 |

---

## Bagian 4 — Item yang butuh keputusan

### Kelompok A — Item tanpa tahap jelas (39 dari ekstraksi + 2 dari rekonsiliasi = 41 baris, lihat Bagian 6 untuk daftar lengkap)

Dikelompokkan per rumpun supaya tidak 41 baris terpisah tanpa konteks:

- **Prinsip/aturan lintas-komponen tanpa satu rumah tahap**: K-9 (konstrain no-SDK), K-12 (migrasi serentak), K-15/SCAR-077 (satu kontrak = satu salinan), SCAR-089/TG-124 (teks luar = data), K-16 (kebijakan bahasa), aturan "setiap penolakan wajib mengajari alternatif" (PTY-002 dst), aturan "satu perilaku satu rumah" (area-10 §10.4). Semuanya prinsip yang berlaku di banyak tahap sekaligus — §10 tidak punya slot untuk "aturan lintas tahap".
- **Enam Rules operasional kerja (SOP git-multi-agent)**: Rule1 isolasi worktree (SKILL-057, dua baris — §10.5 dan §10.A), Rule2 trailer commit (SKILL-058/059/060), Rule3 subagent-first (SKILL-061), Rule4 channel discipline sisa (SKILL-062), Rule5 rules-live-here + klausa pengecualian (SKILL-063), Rule6 three-copy doctrine (SKILL-064/065, dua baris). Rumahnya kemungkinan `CLAUDE.md` repo atau skill perilaku, belum ditetapkan.
- **Kontrak hook trailer commit (`PreToolUse`)**: SCAR-092 (kontrak + batas diterima sadar), FUNC-4/5 (matcher lintas-shell), empat kelas bypass adversarial yang belum digali. §10 hanya menyebut `PreToolUse` untuk ack — trailer commit tak disebut di tahap manapun.
- **Skill `telegram-conduct` dimuat otomatis** — ⚠️ **sorotan khusus**: skill ini adalah rumah untuk belasan aturan gaya (ack, narasi progres, cara susun tombol, larangan "obvious yes", pola leader fan-out, dst — semuanya sudah diberi tahap konkret 3/5 di Bagian 5 karena *penegak mekanisnya* dibangun di sana), tapi **skill itu sendiri tidak dimiliki tahap manapun**. Ini kandidat paling mudah terlupa karena ia tidak muncul sebagai baris kerja tunggal di §10.
- **Command registry & statusline administrasi**: tugas wajib memetakan 30 hook CC ke kewajiban mekanis (area-11 §11.0), `/help` dari satu registry (TG-059), daftar command tersisa, menu slash dipasang sekali saat boot, catatan cache menu Telegram (SCAR-059).
- **Retensi & housekeeping storage**: VACUUM manual, retensi `inbox/` 90 hari + perilaku saat file sudah dihapus (3 baris terkait), keputusan Windows ACL untuk proteksi file (SCAR-024), rotasi `wrapper.log` (PTY-050, dokumen sendiri menulis "silakan dibantah").
- **B-7** (riwayat sesi "dikunjungi sementara") — DEFER, di luar lingkup v1 (spec §13).
- **SKILL-039** (klausa stop wajib bila ada risiko loop tak berujung) — prinsip umum, kandidat rumah: skill perilaku atau delegasi tahap 6, belum ditugaskan.
- **SCAR-028** (PID reuse) — celah keamanan, keputusan sadar belum diambil sama sekali.
- **K-17/K-13** (klarifikasi arti "DROP") — lihat kontradiksi #3 di bawah.
- **TG-111** (quote-reply masuk) dan **TG-067** (`assertAllowedChat`) — dari rekonsiliasi area 01-04; TG-111 adalah separuh-masuk dari B-10 yang belum didesain sama sekali; TG-067 dinilai "cukup untuk tujuan yang sama" oleh desain baru tapi bentuk kodenya berbeda total dari yang diaudit — bukan ADA penuh.

### Kelompok B — Kontradiksi antar-dokumen (tidak diputuskan di sini — keputusan manusia)

1. **Kriteria B-6** (penyembunyian sesi remeh dari picker) — tiga dokumen berselisih: area-05 §5.2 (2026-07-27) **membuang** kriteria "tak pernah dinamai" karena saling meniadakan dengan §10.C; area-05 §5.A masih menyebutnya sebagai salah satu "dua kriteria yang sudah pasti"; spec §11 (2026-07-29) **memasukkannya lagi**. Baris B-6 di Bagian 5 (Tahap 6) ditandai `BUTUH KEPUTUSAN` karena ini.
2. **Konflik tahap FTS5** — area-12 §12.4 menulis indeks FTS5 wajib ada "sejak awal" (karena menambah belakangan = mengindeks ulang seluruh riwayat), tapi §10 spec menaruh "pencarian" di Tahap 6. Baris SCAR-060 di Bagian 6 mencatat tahap `?` karena inkonsistensi ini belum diputuskan pelaksana mana yang menang.
3. **Ketegangan three-copy doctrine vs K-17** — area-10 §10.B menyuruh memindahkan doktrin three-copy (workspace/marketplaces/cache) ke `CLAUDE.md` repo `mirza-marketplace`, tapi K-17/K-13 (area-13 §13.0) menyatakan repo lama + 11 plugin-nya **tidak disentuh** sama sekali oleh rebuild ini. Kedua dokumen sumber tidak menjelaskan bagaimana keduanya konsisten — perlu diperjelas repo/berkas mana persisnya yang dimaksud sebelum dikerjakan.

---

## Bagian 5 — Checklist per tahap

### Tahap 1 — Fondasi (`fleetd` + dua database + `config.json` + socket + `doctor`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Config/token korup → dipindah `.corrupt-<ts>` | KEEP | BELUM | rekon area-01§1.6 |
| SCAR-024 | Permission 0600 pada file token | KEEP | BELUM | rekon area-01§1.5 |
| TG-174,SCAR-095 | `.gitignore` otomatis `channels/` | KEEP | TIDAK RELEVAN | rekon area-01§1.6 |
| SCAR-026 | Parser `.env` buang `\r` | KEEP | TIDAK RELEVAN | rekon area-01§1.5 |
| — | Pemusatan state+config ke `~/.claude/mirza-bots/` | KEEP | SELESAI | rekon area-01§1.7 |
| — | Fleet declarative via `config.json` | KEEP | SELESAI | rekon area-01§1.8 |
| — | Satu `conversations.db` berkolom `bot` | KEEP | SELESAI | rekon area-01§1.9 |
| — | Antrean offline (`bot_inbox`) + drain saat reconnect | KEEP | SELESAI | rekon (ringkasan ADA) |
| SCAR-022 | Retry rename EPERM/EBUSY → util umum | MERGE | BELUM | area-06§6.5 |
| PTY-093 | Reset registry korup → pola deteksi-korup umum | MERGE | BELUM | area-06§6.5 |
| PTY-083/084/085 | Heartbeat tiap 5s, dianggap segar <30s | KEEP | BELUM | area-06§6.9 |
| SCAR-067 | Dua sinyal liveness: heartbeat + cek pid | KEEP | BELUM | area-06§6.9 |
| SCAR-010 | Ambang liveness 30s satu konstanta (pty ipc) | SATUKAN | BELUM | area-06§6.9 |
| SCAR-010/011 | Ambang online 30s satu konstanta (`agent_list`) | SATUKAN | BELUM | area-07§7.6 |
| — | Versi komponen berjalan hanya terbaca di `/doctor` | KEEP | BELUM | area-11§11.3 |
| TG-133 | Skema `messages` + 3 indeks + WAL, synchronous NORMAL | KEEP | BELUM | area-12§12.1 |
| K-3 | Satu database fleet + kolom `bot` | MODIFY | BELUM | area-12§12.1 |
| SCAR-097 | Retensi `messages.db`: simpan selamanya | KEEP | BELUM | area-12§12.2 |
| — | Pelaporan ukuran database di `doctor` | FITUR BARU | BELUM | area-12§12.2 |
| — | `doctor` — perintah pemeriksaan kapan pun | FITUR BARU | BELUM | area-12§12.5 |
| — | Sistem beri tahu user sendiri saat gagal (bukan cuma `/doctor` on-demand) | FITUR BARU | BELUM | area-12§12.5 |
| — | Alarm#6: bot diam/tidak bisa dihubungi | FITUR BARU | BELUM | area-12§12.5,§6.9 |
| — | `doctor.ok` wajib benar-benar dihitung dari komponen | ATURAN | BELUM | area-12§12.5 |
| — | `doctor` melaporkan versi komponen yang berjalan | FITUR BARU | BELUM | area-12§12.5,§11.3 |
| TG-134,142,144;SCAR-024 | chmod 0600 db+token, warning saat Windows no-op | KEEP | BELUM | area-12§12.7 |
| K-14 | Satu program terpisah terus hidup, pegang 6 token | KEPUTUSAN STRUKTURAL | BELUM | area-14§14.1 |
| — | Pengawas yang menyalakan ulang program itu bila mati | FITUR BARU | BELUM | area-14§14.1 |
| — | Alarm `doctor` tidak boleh bergantung pada `fleetd` sendiri | ATURAN | BELUM | area-14§14.1,§12.5 |
| SCAR-010 | Ambang liveness 30s — kandidat pertama disatukan | SATUKAN | BELUM | area-14§14.4 |
| SCAR-078,TG-156,PTY-093 | File korup dipindah `.corrupt-<ts>`, jadi aturan umum | KEEP | BELUM | area-14§14.6 |

**Tahap 1: 30 item — 24 BELUM, 4 SELESAI, 2 TIDAK RELEVAN.**

### Tahap 2 — Jalur pesan (poller, gerbang allowlist, media, penyimpanan, MCP proxy `reply`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | `message_id` pesan masuk tidak pernah disimpan (akar struktural) | KEEP | BELUM | rekon area-02§2.3,area-03§3.1 |
| — | Handler `message:document` (pdf/zip/.md/.log) | KEEP | BELUM | rekon area-02§2.1 |
| — | Catch-all lampiran tak didukung → notifikasi | KEEP | BELUM | rekon area-02§2.1 |
| TG-103 | Indikator "typing" | KEEP | BELUM | rekon area-02§2.5 |
| TG-077 | `replyToMode=first` — kutip pesan user di chunk pertama | KEEP | BELUM | rekon area-01§1.3,area-03§3.7 |
| — | Konversi CommonMark → MarkdownV2 sebelum kirim | KEEP | BELUM | rekon area-03§3.2 |
| TG-072/073/074/076/080,SCAR-046-048 | Mesin chunking tiga-lapis | KEEP | BELUM | rekon area-03§3.3 |
| — | Tool `get_message_by_id` | KEEP | BELUM | rekon area-03§3.1 |
| TG-070/071/079,SCAR-087 | Pengiriman lampiran keluar (`assertSendable`, 50MB, routing) | KEEP | BELUM | rekon area-03§3.6 |
| TG-081 | Logging outbound (satu row per chunk/file) | KEEP | BELUM | rekon area-03§3.6 |
| TG-112–121,SCAR-012/055/056 | Buffering album (cap 10, sort, paralel, caption, fail-report) | KEEP | SEBAGIAN | rekon area-02§2.3 |
| TG-105 | Unduhan gagal → path dihilangkan, bukan error total | KEEP | SEBAGIAN | rekon area-02§2.2 |
| TG-082 | Hasil `sent (id: N)` / `sent N parts` | KEEP | SEBAGIAN | rekon area-03§3.6 |
| TG-089/090 | Format error tool `<tool> failed: <msg>` | KEEP | SEBAGIAN | rekon area-03§3.6 |
| TG-108,SCAR-088 | `safeName()` sanitasi nama file (prasyarat: handler document) | KEEP | BELUM | rekon area-02§2.5 |
| TG-110 | Bentuk notifikasi `<channel>...</channel>` | GANTI | TIDAK RELEVAN | rekon area-02§2.5 |
| — | Enforcement allowlist inbound | KEEP | SELESAI | rekon area-01§1.1 |
| — | Auto-download foto ke `inbox/` | KEEP | SELESAI | rekon area-02§2.2 |
| — | `image_path` hanya di meta, tak pernah di isi pesan | KEEP | SELESAI | rekon SCAR-088 |
| — | Redaksi token di URL unduhan media | KEEP | SELESAI | rekon (`media.ts`) |
| — | Kepatuhan DROP (`download_attachment`/`edit_message`/`react`/`format`) | KEEP | SELESAI | rekon area-03§3.1/3.2/3.4/3.5 |
| TG-135 | `quote_text`/`quote_is_manual` di kolom `metadata` | KEEP | BELUM | area-12§12.1 |
| TG-138 | `getMessage` ambil row terbaru `(chat_id,message_id)` | KEEP | BELUM | area-12§12.1 |
| TG-139 | Fallback album via `metadata.message_ids` + verifikasi parse | KEEP | BELUM | area-12§12.1 |
| TG-136 | `source` terbatas `assistant`/`system` utk pesan keluar | KEEP | BELUM | area-12§12.1 |
| TG-140 | Mode degradasi: store mati → no-op, pipeline tetap jalan | KEEP | BELUM | area-12§12.6 |
| — | Kondisi store mati wajib terlihat di `doctor` + diberitahukan | MODIFY | BELUM | area-12§12.6 |
| SCAR-015,TG-154 | Semua error polling di-retry dengan backoff | KEEP | BELUM | area-14§14.2 |
| SCAR-061,TG-155 | `bot.catch` wajib dipasang | KEEP | BELUM | area-14§14.2 |
| TG-157 | `unhandledRejection`/`uncaughtException` dicatat | KEEP | BELUM | area-14§14.2 |
| SCAR-089 | `quote_text` & isi log = data user-controlled | KEEP | BELUM | area-14§14.5 |
| SCAR-088 | Guard anti tag-breakout wajib jadi test | KEEP | BELUM | area-14§14.5 |

**Tahap 2: 32 item — 22 BELUM, 4 SEBAGIAN, 5 SELESAI, 1 TIDAK RELEVAN.**

### Tahap 3 — Penegakan (`PreToolUse` ack + `Stop` jawaban final + tombol wajib + tombol manual otomatis)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Validasi tombol boundary (baris/tombol/label/`callback_id`) | KEEP | BELUM | rekon area-04§4.1 |
| — | Prefiks `ai:` pada `callback_data` | KEEP | BELUM | rekon area-04§4.1 |
| — | Notifikasi tap tombol `[button tapped: <label>]` | KEEP | BELUM | rekon area-04§4.1 |
| — | Edit pesan sumber setelah tap + hapus keyboard | KEEP | BELUM | rekon area-04§4.1,SCAR-058 |
| — | Tombol "✏️ Jelaskan manual" ditambahkan server | KEEP | BELUM | rekon area-04§4.4 |
| — | Penolakan server: pertanyaan wajib minimal tombol Ya/Tidak | KEEP | BELUM | rekon area-04§4.5 |
| TG-069 | `buttons`+file eksklusif (prasyarat: param file di `reply`) | KEEP | BELUM | rekon area-04§4.2 |
| TG-078 | Keyboard hanya di chunk terakhir (prasyarat: chunking) | KEEP | BELUM | rekon area-04§4.1 |
| — | Ack tap tombol segera (`answerCallbackQuery`) | KEEP | SELESAI | rekon area-04§4.1 |
| SKILL-045,046 | Ack dipaksa mesin — tool non-`reply` pertama DITOLAK | DIPAKSA MESIN(MERGE) | BELUM | area-10§10.1 |
| SKILL-049 | Satu ack per pesan masuk (pesan terbaru saja) | KEEP | BELUM | area-10§10.1 |
| — | Ack: 1 baris, ≤1 emoji, <50 karakter, ikut bahasa user | KEEP | BELUM | area-10§10.1 |
| TG-163,164;SCAR-093 | Fix penjaga jawaban final (bug FUNC-3) | FIX(MODIFY) | BELUM | area-10§10.2 |
| — | Bot tutup dgn 1 reply lalu diam tetap lolos | KEEP | BELUM | area-10§10.2 |
| TG-164 | Loop-guard: `stop_hook_active` tak blokir 2x | KEEP | BELUM | area-10§10.2 |
| — | Fix bug "sticky" `telegramDriven` | FIX | BELUM | area-10§10.2 |
| SKILL-048 | Narasi progres wajib di tiap perubahan tahap nyata | KEEP | BELUM | area-10§10.3 |
| SKILL-052 | Cara susun tombol (label pendek, tak diulang di body) | KEEP | BELUM | area-10§10.4 |
| SKILL-055 | Jangan tanya "obvious yes" tanpa alasan | KEEP | BELUM | area-10§10.4 |
| SKILL-055 | Operasi destruktif dieja lengkap di body | KEEP | BELUM | area-10§10.4 |
| TG-124 | `instructions` MCP dipangkas ke fakta mekanis saja | PANGKAS(SIMPLIFY) | BELUM | area-10§10.4 |

**Tahap 3: 21 item — 20 BELUM, 1 SELESAI.**

### Tahap 4 — Sesi (`bot-cc` + antrean injeksi + `SessionStart` + `/new` `/switch` + `/context` + `UserPromptSubmit`)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| PTY-068/069/070/076;SCAR-039/079/081 | Lifecycle bot jadi kolom data (K-7) | MERGE | BELUM | area-05§5.4 |
| TG-027 | Sesi aktif dikecualikan dari daftar `/switch` | KEEP | BELUM | area-05§5.6 |
| TG-029(sisa) | Satu tombol/baris, label ≤60 char, ❌Cancel terakhir | KEEP | BELUM | area-05§5.6 |
| TG-032;SCAR-052 | `shortId` 8 hex di `callback_data` | KEEP | BELUM | area-05§5.6 |
| TG-033 | Tap valid tak pre-announce; banner saat sesi ganti | KEEP | BELUM | area-05§5.6 |
| TG-178,TG-183 | Enumerasi `*.jsonl` regex UUID + `encodeProjectDir` | KEEP | BELUM | area-05§5.6 |
| TG-182 | Sort mtime descending daftar sesi | KEEP | BELUM | area-05§5.6 |
| TG-018 | Validasi nama sesi (CR/LF, kosong, spasi, ≤64 char) | KEEP | BELUM | area-05§5.7 |
| TG-019,TG-026 | Guard state dir ter-resolve + pesan solusi | KEEP | BELUM | area-05§5.7 |
| TG-020 | Guard heartbeat wrapper segar (<30s) | KEEP | BELUM | area-05§5.7 |
| TG-021,TG-024 | Nama dipakai→ditolak; self-rename=no-op | KEEP | BELUM | area-05§5.7 |
| TG-022 | `/new` tanpa ack, banner saat siap | KEEP | BELUM | area-05§5.7 |
| TG-025 | `/rename` balas "✏️ Renaming session..." | KEEP | BELUM | area-05§5.7 |
| TG-150;LOSS-4 | Banner ganti-sesi dikirim mesin + fix bug pencatatan | KEEP+FIX | BELUM | area-05§5.8,area-12§12.1 |
| SCAR-085 | Banner tak boleh hardcode satu chat tujuan | KEEP | BELUM | area-05§5.8 |
| TG-055;SCAR-051 | Peta `shortId→sesi` in-memory; expired msg jelas | KEEP | BELUM | area-05§5.9 |
| PTY-039;SCAR-025 | Spawn CC lewat shell (cmd/login shell) | KEEP | BELUM | area-06§6.1 |
| PTY-040,041 | `CLAUDE_BIN`/`CLAUDE_ARGS` bisa dioverride | KEEP | BELUM | area-06§6.1 |
| PTY-042 | Env anak selalu bawa lokasi state | KEEP | BELUM | area-06§6.1 |
| PTY-043,044,045 | Ukuran PTY dari terminal user, xterm-256color, resize | KEEP | BELUM | area-06§6.1 |
| PTY-046 | CC exit → wrapper exit dgn exit code CC | KEEP | BELUM | area-06§6.1 |
| PTY-047,048;SCAR-066 | SIGINT diteruskan ke PTY; SIGTERM kill PTY | KEEP | BELUM | area-06§6.1 |
| PTY-049 | Shutdown bersih: hentikan timer, hapus heartbeat/pid | KEEP | BELUM | area-06§6.1 |
| PTY-050 | Log ISO ke stderr + `wrapper.log` | KEEP | BELUM | area-06§6.1 |
| PTY-051 | Satu proses CC seumur wrapper; ganti sesi via `/resume` | KEEP | BELUM | area-06§6.1 |
| SCAR-096 | Jangan pakai `import.meta.dir` (Bun-only) di wrapper Node | KEEP | BELUM | area-06§6.1 |
| — | `SUBMIT_DELAY_MS`=250 (pisah teks dari `\r`) | KEEP kontrak | BELUM | area-06§6.2 |
| — | `MIN_INJECTION_GAP_MS`=1500 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `POST_INJECTION_DELAY_MS`=1000 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CLEAR_SETTLE_MS`=1500 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CLEAR_BARRIER_TIMEOUT_MS`=600000 | KEEP kontrak | BELUM | area-06§6.2 |
| — | `QUEUE_POLL_MS`=200 (kandidat event-driven) | KEEP kontrak | BELUM | area-06§6.2 |
| — | `CHUNK_SIZE`/`CHUNK_DELAY_MS`=100/30 (anti head-drop) | KEEP kontrak | BELUM | area-06§6.2 |
| — | Antrean FIFO tunggal + satu drainer + gate | KEEP mekanisme | BELUM | area-06§6.2 |
| — | Gate dua mekanisme: `holdFor` monotonik + barrier `/clear` | KEEP | BELUM | area-06§6.2 |
| SCAR-031 | Snapshot eager daftar sesi saat keystroke `/clear` | KEEP | BELUM | area-06§6.2 |
| SCAR-020 | Chunking aman code-point (`Array.from`, no split surrogate) | KEEP | BELUM | area-06§6.2 |
| SCAR-029 | Enter TUI = `\r`, bukan `\n` | KEEP | BELUM | area-06§6.2 |
| PTY-063 | Kegagalan dispatch 1 item tak hentikan antrean | KEEP | BELUM | area-06§6.2 |
| — | Aturan: konstanta pacing wajib test + verifikasi live | KEEP aturan proses | BELUM | area-06§6.2 |
| PTY-067/071/072;SCAR-032/033 | Deteksi sesi baru GANTI ke hook `SessionStart` | GANTI(MERGE) | BELUM | area-06§6.3 |
| — | Timeout fallback deteksi sesi → alarm di `doctor` | FITUR BARU | BELUM | area-06§6.3 |
| — | Enumerasi sesi `/switch` masih baca `~/.claude/projects/` | KEEP (sisa) | BELUM | area-06§6.3 |
| PTY-001–012,015–021,037 | Kendali-diri AI jadi daftar putih command | GANTI(MODIFY) | BELUM | area-06§6.6 |
| SCAR-086 | Teks bebas ditolak by design pada `pty_send_slash` | KEEP wajib | BELUM | area-06§6.6 |
| PTY-002;SCAR-037 | Regex izinkan namespace `:`, nama≤64,arg≤256 | KEEP | BELUM | area-06§6.6 |
| PTY-005;SCAR-044 | Self-only: parameter `target` ditolak | KEEP wajib | BELUM | area-06§6.6 |
| PTY-007 | Wrapper tak terdeteksi → error mengajari solusi | KEEP | BELUM | area-06§6.6 |
| PTY-011 | Semua kegagalan tool jadi `isError` | KEEP | BELUM | area-06§6.6 |
| PTY-002,007,016–019 | Setiap error mengajari alternatif yang benar | KEEP | BELUM | area-06§6.6 |
| SCAR-001 | Aturan pemisahan teks+`\r` 250ms wajib dipertahankan | KEEP wajib | BELUM | area-06§6.6 |
| PTY-031;SCAR-027 | Tulisan atomik `tmp.<pid>`+rename, sweep skip `.tmp.` | KEEP dua sisi | BELUM | area-06§6.7 |
| PTY-034;SCAR-068 | Hapus-sebelum-proses vs rename `processing/` | KEEP kontrak | BELUM | area-06§6.7 |
| PTY-036;SCAR-021 | Deteksi dua jalur: fs notif + sweep berkala | KEEP | BELUM | area-06§6.7 |
| PTY-037 | JSON malformed → karantina `.rejected-<ts>` | KEEP+perbaikan | BELUM | area-06§6.7 |
| PTY-109–114;SCAR-045 | Batch = satu unit atomik (maks 8 item) | KEEP kapabilitas | BELUM | area-06§6.7 |
| — | Turunkan ulang jaminan atomisitas batch secara eksplisit | Tugas wajib | BELUM | area-06§6.7 |
| SCAR-071 | Ack dua tingkat injeksi (`injected` ≠ selesai semantik) | KEEP+utang dibayar | BELUM | area-06§6.7 |
| PTY-064,065 | First-run mulai segar; resume via mtime jsonl | KEEP | BELUM | area-06§6.8 |
| PTY-066;SCAR-041/080 | Resume identitas seed sinkron, guard `session_id` | KEEP wajib | BELUM | area-06§6.8 |
| PTY-073;SCAR-081 | Pasca-`/clear` nama diterapkan, wajib verifikasi ulang | KEEP | BELUM | area-06§6.8 |
| PTY-074 | `/switch` → injeksi `/resume <sessionId>` | KEEP | BELUM | area-06§6.8 |
| PTY-077,078 | Event `session-change`; `/clear` di tengah batch tunda notif | KEEP | BELUM | area-06§6.8 |
| PTY-022–027(sisa) | Nama plugin command wajib fully-qualified | KEEP | BELUM | area-06§6.10 |
| TG-165–168 | Statusline bridge merantai (settings.json, snapshot, teruskan stdin) | KEEP | BELUM | area-11§11.1 |
| SCAR-084 | Guard `isOurOwnBridge` (cegah loop simpan diri) | KEEP wajib | BELUM | area-11§11.1 |
| — | Alarm bila capture tidak berbunyi dalam N menit | FITUR BARU | BELUM | area-11§11.1 |
| — | Backup `settings.json` tidak menumpuk tanpa batas | Perbaikan | BELUM | area-11§11.1 |
| SCAR-017 | `/context` menunggu data, bukan tidur 5 detik flat | Perbaikan | BELUM | area-11§11.1,§11.2 |
| — | Bila tak ada statusLine sebelumnya, bridge render sendiri | FITUR BARU | BELUM | area-11§11.1 |
| — | Perilaku tetap: non-JSON→null, tanpa `CLAUDE_PROJECT_DIR`→skip, tulis atomik | KEEP | BELUM | area-11§11.1 |
| K-1 | Lokasi snapshot pindah ke store terpusat | MERGE | BELUM | area-11§11.1 |
| SCAR-041 | Snapshot sah hanya utk `session_id` yang cocok | KEEP wajib | BELUM | area-11§11.1 |
| TG-010–013 | `/context`: pemakaian context (bar+persen+token) | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: rate limit 5 jam & 7 hari | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: model, effort, thinking, fast | KEEP | BELUM | area-11§11.2 |
| TG-010–013 | `/context`: biaya, CWD, nama+id sesi | KEEP | BELUM | area-11§11.2 |
| TG-169 | `/context`: "Last update HH:MM WIB (relatif)" | KEEP | BELUM | area-11§11.2 |
| TG-170 | Helper format token (1.5k/2M) & waktu relatif | KEEP | BELUM | area-11§11.2 |
| TG-150;LOSS-4 | Fix `messagesStore.append` tak ada di interface | FIX wajib | BELUM | area-12§12.1,area-05§5.8 |
| — | Alarm#1: capture statusline mati | FITUR BARU | BELUM | area-12§12.5,§11.1 |
| — | Alarm#2: hook `SessionStart` tak berbunyi | FITUR BARU | BELUM | area-12§12.5,§6.3 |
| — | Alarm#3: injeksi tak pernah mendarat | FITUR BARU | BELUM | area-12§12.5,§6.7 |
| — | Alarm#5: payload rusak dikarantina | FITUR BARU | BELUM | area-12§12.5,§6.7,§14.6 |
| SCAR-013;TG-149/151 | Deteksi perubahan file: watch DIREKTORI bukan file | KEEP | BELUM | area-14§14.3 |
| SCAR-013 | Defer 50ms sebelum baca (rename sempat commit) | KEEP | BELUM | area-14§14.3 |
| SCAR-013 | Sweep berkala sbg jaring pengaman | KEEP | BELUM | area-14§14.3 |
| SCAR-027 | Sisi kedua kontrak atomic-write: sweep skip `.tmp.` | KEEP | BELUM | area-14§14.3 |
| PTY-037 | Payload rusak dikarantina `.rejected-<ts>` + alarm doctor | KEEP aturan umum | BELUM | area-14§14.6 |
| SCAR-018 | Boot-settle 5 detik — verifikasi, jangan asumsikan | KEEP bersyarat | BELUM | area-14§14.7 |

**Tahap 4: 90 item — 90 BELUM.**

### Tahap 5 — Antar-bot (`agent_list` `agent_status` `agent_send` + handoff dijaga mesin)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| PTY-038 | `hop_count > 5` pada payload ber-`from` → DROP | KEEP | BELUM | area-06§6.7 |
| BUS-017,037;SCAR-044;PTY-005 | Prinsip neighbor autonomy: prompt berhakim, slash tidak | KEEP prinsip | BELUM | area-07§7.0 |
| BUS-037 | Bot macet diselamatkan user, bukan bot tetangga | KEEP | BELUM | area-07§7.0 |
| BUS-027,022;SCAR-038 | Transport prompt antar-bot GANTI ke channel notif | GANTI(MERGE) | BELUM | area-07§7.1 |
| BUS-025,038;SCAR-043 | Marker atribusi GANTI jadi metadata terstruktur | GANTI | BELUM | area-07§7.2 |
| BUS-038 | Aturan anti-bounce ditulis ulang ke metadata | MODIFY | BELUM | area-07§7.2 |
| BUS-023,024,031,042;PTY-038 | Guard anti-loop dua sisi (`hop_count`) | KEEP | BELUM | area-07§7.3 |
| BUS-030,040,043;SKILL-030 | `agent_send` boleh otonom dlm alur yg diizinkan | MODIFY | BELUM | area-07§7.4 |
| BUS-039 | Tetap terlarang: second opinion/delegasi otonom | KEEP | BELUM | area-07§7.4 |
| BUS-043 | Prompt wipe-state wajib konfirmasi ulang | KEEP | BELUM | area-07§7.4 |
| BUS-006–015;SCAR-073 | `agent_status` SIMPLIFY jadi satu query store | SIMPLIFY | BELUM | area-07§7.5 |
| — | Field `agent_status`: status kerja idle/sibuk | KEEP | BELUM | area-07§7.5 |
| BUS-014 | Field: pemakaian context (%+window token) | KEEP | BELUM | area-07§7.5 |
| — | Field: nama & id sesi aktif | KEEP | BELUM | area-07§7.5 |
| — | Field: model, effort level, biaya | KEEP+penambahan | BELUM | area-07§7.5 |
| BUS-014 | Kontrak: `context_used_percent` null = ~0%, bukan error | KEEP wajib | BELUM | area-07§7.5 |
| BUS-001–005 | `agent_list`: sumber pindah ke config+store terpusat | KEEP disederhanakan | BELUM | area-07§7.6 |
| BUS-005 | Kontrak "safe to call autonomously at any time" | KEEP | BELUM | area-07§7.6 |
| BUS-028,045 | Antre-untuk-offline (`online:false`, error per-target) | KEEP | BELUM | area-07§7.7 |
| BUS-045 | Kewajiban AI beri tahu user pesan dikonsumsi saat boot | KEEP | BELUM | area-07§7.7 |
| SCAR-070 | Asimetri `agent_send`(antre) vs `pty_send_slash`(tolak) | Keputusan(KEEP) | BELUM | area-07§7.7 |
| BUS-019,029,044 | Broadcast/fan-out: target string atau array | KEEP | BELUM | area-07§7.8 |
| — | Pola leader fan-out (`agent_list`→send array→ringkas→STOP) | KEEP aturan skill | BELUM | area-07§7.8 |
| BUS-041 | Kanal satu arah, tak ada reply channel | KEEP | BELUM | area-07§7.9 |
| BUS-046 | Nama peer tak boleh ditebak, selalu dari `agent_list` | KEEP | BELUM | area-07§7.9 |
| BUS-047 | Jangan taruh secret di badan prompt | KEEP | BELUM | area-07§7.9 |
| BUS-016,018 | Validasi `kind` enum `['prompt']` | KEEP | BELUM | area-07§7.10 |
| BUS-032 | Error handler jadi `isError:true` | KEEP | BELUM | area-07§7.10 |
| — | Skill `using-agent-bus` ditulis ulang dari kode | MODIFY | BELUM | area-07§7.10 |
| SKILL-009 | Mode 🚀 Now — pilih bot→tulis file→kirim | KEEP | BELUM | area-08§8.1 |
| SKILL-010 | Mode ⏭️ After this task — designation one-shot | KEEP | BELUM | area-08§8.1 |
| SKILL-011(mode) | Mode 🏓 Ping pong — designation menular via `Pair` | KEEP | BELUM | area-08§8.1 |
| SKILL-011 | Ekuivalensi bahasa natural (skip tombol) | KEEP | BELUM | area-08§8.1 |
| SKILL-006,007 | Ambang trigger GANTI dari persen→angka tunggal | GANTI | BELUM | area-08§8.2 |
| SKILL-007 | Ambang diperiksa hanya di batas selesai-task | KEEP | BELUM | area-08§8.2 |
| SKILL-008 | Designation→full-auto; tanpa itu→tombol; anti-spam | KEEP | BELUM | area-08§8.2 |
| — | Syarat penerima#1: context <100.000 token, mutlak | ATURAN BARU | BELUM | area-08§8.2b |
| — | Syarat penerima#2: tidak sedang bekerja (fakta hook) | ATURAN BARU | BELUM | area-08§8.2b |
| — | Pengirim menyaring lewat `agent_status` sebelum tulis file | ATURAN BARU | BELUM | area-08§8.2b |
| — | Penerima memutuskan — keputusannya mengikat | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang OK: batas waktu, user diberitahu, `/clear` diantre | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang NOT-OK: kembali ke user + alasan + pilihan lain | ATURAN BARU | BELUM | area-08§8.2b |
| — | Cabang timeout: tombol kirim ulang/pilih lain/batal | ATURAN BARU | BELUM | area-08§8.2b |
| — | Pelaksana ketiga cabang adalah `fleetd`, bukan AI pengirim | ATURAN BARU(mengikat) | BELUM | area-08§8.2b |
| — | Tak ada bot memenuhi syarat → tombol darurat | ATURAN BARU | BELUM | area-08§8.2b |
| SKILL-020–029,032(sebagian) | State handoff jadi DATA+timeout alarm mesin | KEPUTUSAN STRUKTURAL(MERGE) | BELUM | area-08§8.3 |
| SKILL-020 | Designation full-auto+target tak ready→batal | KEEP | BELUM | area-08§8.3 |
| SKILL-026 | Timeout tanpa ACK→lapor+tombol, jangan self-reset | KEEP | BELUM | area-08§8.3 |
| SKILL-027 | R menolak/ACK terlambat — tiga cabang | KEEP | BELUM | area-08§8.3 |
| SKILL-019,023 | Dua laporan wajib (file selesai, terkirim) | KEEP | BELUM | area-08§8.3 |
| SKILL-028(langkah5) | ACK dua arah: pengirim + user Telegram | KEEP | BELUM | area-08§8.3 |
| SKILL-013 | Bot non-ready tetap bisa dipilih + penanda eksplisit | KEEP | BELUM | area-08§8.3,§8.2b |
| SKILL-025;PTY-078;SCAR-045 | Self-reset SIMPLIFY: `/clear` + satu tulis status | SIMPLIFY | BELUM | area-08§8.4 |
| SKILL-005(sebagian) | Kaitan sesi↔file handoff tersimpan sbg data | ATURAN BARU wajib | BELUM | area-08§8.4 |
| SKILL-017/018 | Template: bagian Tujuan handoff | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: SUDAH/SEDANG | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Blocker + alasan (wajib) | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: AKAN (goal+langkah+starting point) | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Referensi + kolom "Kapan dibaca" | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Referensi playbook → jadi kondisional | KEEP→KONDISIONAL | BELUM | area-08§8.5,area-13§13.4 |
| SKILL-017/018 | Template: Referensi tasks/plans lintas sesi | KEEP | BELUM | area-08§8.5 |
| SKILL-017/018 | Template: Anti-Patterns/Lessons (wajib) | KEEP wajib | BELUM | area-08§8.5,area-13§13.4 |
| SKILL-017/018 | Template: Header (Date,Repo,Branch,Dari→Ke,dst) | KEEP | BELUM | area-08§8.5 |
| — | Bagian "Keputusan User Brainstorming" digabung | MERGE | BELUM | area-08§8.5 |
| — | Header `Pair` (terikat nasib ping-pong) | KEEP | BELUM | area-08§8.5 |
| SKILL-018 | Sifat file append-only chain, tak edit lama | KEEP | BELUM | area-08§8.5 |
| SKILL-017 | Template digenerate langsung, jangan load dari disk | KEEP wajib | BELUM | area-08§8.5 |
| SKILL-002 | Bot tak pernah kerja di workspace sendiri, path absolut | KEEP | BELUM | area-08§8.6 |
| SKILL-005 | Slug kebab-case ≤6 kata, sama utk file&tracking | KEEP | BELUM | area-08§8.6 |
| SKILL-014 | Clarity check pra-file (3 syarat wajib) | KEEP | BELUM | area-08§8.6 |
| SKILL-015 | Mandat README diupdate sebelum tulis handoff | KEEP | BELUM | area-08§8.6 |
| SKILL-016 | Lokasi file `.handoff/<ts>-prompt-<slug>.md` | KEEP | BELUM | area-08§8.6 |
| SKILL-012 | Step pilih bot: narasi bullet + marka status | KEEP | BELUM | area-08§8.6 |
| SKILL-031 | Larangan receiver (jangan edit/hapus, dst) | KEEP | BELUM | area-08§8.6 |
| SKILL-032 | Edge case: paralel, designation batal, dst (4 kasus) | KEEP | BELUM | area-08§8.6 |
| SKILL-028 | Template body `agent_send`: substitusi literal, guard sibuk | KEEP | BELUM | area-08§8.6 |
| SKILL-021 | `agent_send` offline tetap terkirim, wajib disebut | KEEP | BELUM | area-08§8.7 |
| SKILL-030 | Legalitas `agent_send` ditulis ulang sesuai §7.4 | MODIFY | BELUM | area-08§8.7 |
| 8.B | Ambang PENGIRIM = 50% dari total context | DITETAPKAN | BELUM | area-08§8.B |
| — | Alarm#4: handoff menggantung tanpa ACK lewat batas waktu | FITUR BARU | BELUM | area-12§12.5,area-08§8.3 |
| — | Referensi playbook di template handoff: wajib→kondisional | MODIFY | BELUM | area-13§13.4 |
| SKILL-017 | Anti-Patterns/Lessons CARRY FORWARD tetap wajib | KEEP dipertegas | BELUM | area-13§13.4 |

**Tahap 5: 82 item — 82 BELUM.**

### Tahap 6 — Sisanya (`peek_conversation`, pencarian, penyembunyian sesi remeh, penamaan otomatis, delegasi B-8)

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| — | Tool `peek_conversation(bot, sejak)` intip antar-bot | FITUR BARU | BELUM | rekon area-01§1.9 |
| B-6 | Penyembunyian sesi remeh dari picker (giliran<3 & <8.000 token) | FITUR BARU | BUTUH KEPUTUSAN | area-05§5.2,§5.A — kontradiksi kriteria, lihat Bagian 4 |
| B-8 | Delegasi — primitif baru (dua pemilik paralel) | FITUR BARU | BELUM | area-08§8.C |
| B-8 | Delegasi: tak ada kewajiban lapor balik ke bot utama | Keputusan | BELUM | area-08§8.C |
| B-8 | Delegasi: isolasi repo ikut Rule1 umum (tawaran) | KOREKSI | BELUM | area-08§8.C,area-10§10.A |
| B-8 | Delegasi: tak ada self-reset pengirim | Keputusan | BELUM | area-08§8.C |
| B-8 | Delegasi: ACK numpang `reply` + hook `Stop` | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: "bot sibuk" bukan konsep mesin, selalu terkirim | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: file `.handoff/` prefix `delegasi-<slug>` | DITETAPKAN | BELUM | area-08§8.C |
| B-8 | Delegasi: field "Batas potongan" (wajib, dua sisi) | FITUR BARU | BELUM | area-08§8.C |
| B-8 | Delegasi: bagian diganti makna (Repo&worktree dst) | MODIFY | BELUM | area-08§8.C |
| SKILL-037(gagasan) | Kondisi "selesai" terverifikasi mekanis | MERGE | BELUM | area-09, dipakai area-08§8.C |
| TG-188,160 | `name-session` perlu dirancang ulang | MODIFY | BELUM | area-10§10.7 |
| TG-188,160 | `name-session` bentuk baru: mesin jamin ada nama | ATURAN BARU | BELUM | area-10§10.C |
| — | Nama sesi tetap hyphenated, tanpa spasi | KEEP | BELUM | area-10§10.C |
| SCAR-060 | Indeks FTS5 di `messages.db` (skema idealnya dari Tahap 1) | FITUR BARU(prasyarat) | BELUM | area-12§12.4 |
| — | Tool pencarian yang diekspos ke AI | FITUR BARU | BELUM | area-12§12.4 |

**Tahap 6: 17 item — 16 BELUM, 1 BUTUH KEPUTUSAN.**

---

## Bagian 6 — Item tanpa tahap

Tidak dipaksakan masuk tahap manapun — dokumen sumber sendiri menandainya `?` atau ambigu. Lihat Bagian 4 untuk pengelompokan naratif dan penjelasan kontradiksi. Semua berstatus `BUTUH KEPUTUSAN` karena itulah alasan mereka ada di sini: entah rumah tahapnya, entah keputusan desainnya sendiri, belum diambil.

| ID | Fitur | Verdict | Status | Sumber |
|---|---|---|---|---|
| K-9 | Konstrain: tanpa SDK/`claude -p`, semua via TUI interaktif | KEEP(konstrain) | BUTUH KEPUTUSAN | area-06§6.0 |
| K-12 | Migrasi serentak "matikan semua ganti semua" | Syarat diterima | BUTUH KEPUTUSAN | area-06§6.4 |
| SCAR-028 | PID reuse — celah terbuka, perlu keputusan sadar | Belum diputuskan | BUTUH KEPUTUSAN | area-06§6.9 |
| PTY-002–004,007,008,010,016–027 | Aturan wajib: penolakan sebut alternatif benar | KEEP→aturan wajib | BUTUH KEPUTUSAN | area-06§6.10 |
| B-7 | Riwayat sesi per bot "dikunjungi sementara" | DEFER | BUTUH KEPUTUSAN | area-07§B-7 (di luar v1, spec§13) |
| SKILL-039(gagasan) | Klausa stop wajib bila ada risiko loop tak berujung | MERGE | BUTUH KEPUTUSAN | area-09 |
| — | Aturan induk: satu perilaku hidup di SATU rumah | KEEP aturan | BUTUH KEPUTUSAN | area-10§10.4 |
| SKILL-057 | Rule1 isolasi worktree tetap perilaku (→tawaran) | KEEP | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-058,059,060 | Rule2 trailer `Agent: <bot-name>` + fix | KEEP+fix | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-061 | Rule3 subagent-first (tak bisa dijamin mesin) | KEEP teks | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-062 | Rule4 sisa channel discipline | KEEP teks | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-063 | Rule5 rules-live-here, diperbarui | KEEP diperbarui | BUTUH KEPUTUSAN | area-10§10.5 |
| SKILL-064,065 | Rule6 three-copy doctrine — tinjau lokasi | Pindah(MERGE) | BUTUH KEPUTUSAN | area-10§10.5 |
| SCAR-092 | Kontrak hook trailer commit (`PreToolUse`) | KEEP | BUTUH KEPUTUSAN | area-10§10.6 |
| FUNC-4/5 | Matcher wajib cakup semua shell (PowerShell lolos) | FIX wajib | BUTUH KEPUTUSAN | area-10§10.6 |
| — | Empat kelas bypass adversarial — belum digali | FIX wajib | BUTUH KEPUTUSAN | area-10§10.6 |
| SCAR-092 | Batas diterima sadar: commit via editor/`$(...)` | KEEP batas sadar | BUTUH KEPUTUSAN | area-10§10.6 |
| SKILL-057 | Rule1 jadi tawaran di awal (bukan diam-diam) | MODIFY(KEEP) | BUTUH KEPUTUSAN | area-10§10.A |
| SKILL-057 | Urutan alat worktree: native dulu, fallback git | KEEP | BUTUH KEPUTUSAN | area-10§10.A |
| SKILL-064,065 | Three-copy doctrine pindah ke `CLAUDE.md` repo | MERGE | BUTUH KEPUTUSAN | area-10§10.B |
| SKILL-063 | Klausa pengecualian Rule5 (repo-specific vs lintas repo) | ATURAN BARU | BUTUH KEPUTUSAN | area-10§10.B |
| SKILL-064,065 | Isi doktrin yang wajib tetap terbawa | KEEP | BUTUH KEPUTUSAN | area-10§10.B |
| — | Skill `telegram-conduct` dimuat otomatis (MERGE 4 plugin) | ATURAN BARU(MERGE) | BUTUH KEPUTUSAN | area-10§10.D — rumah belasan aturan gaya, belum ada tahap |
| — | Tugas wajib: petakan 30 hook CC ke kewajiban mekanis | Tugas arsitektur | BUTUH KEPUTUSAN | area-11§11.0 |
| TG-059 | `/help` dirender dari SATU registry perintah | KEEP | BUTUH KEPUTUSAN | area-11§11.4 |
| — | Daftar perintah tersisa: `/new /rename /switch /context /handoff /help` | KEEP kontrak | BUTUH KEPUTUSAN | area-11§11.4 |
| — | Menu slash: satu set tetap dipasang sekali saat boot | SIMPLIFY | BUTUH KEPUTUSAN | area-11§11.4 |
| SCAR-059 | Catatan: Telegram cache menu slash (perlu force-close) | KEEP catatan | BUTUH KEPUTUSAN | area-11§11.4,§14.7 |
| — | Perintah pemadatan manual (`VACUUM`) | FITUR BARU | BUTUH KEPUTUSAN | area-12§12.2 |
| — | Retensi `inbox/`: file >90 hari dihapus kecuali dirujuk | FITUR BARU | BUTUH KEPUTUSAN | area-12§12.3 |
| — | Baris pesan tetap ada meski file lampiran dihapus | KEEP aturan | BUTUH KEPUTUSAN | area-12§12.3 |
| — | Bot bilang apa adanya jika lampiran sudah kedaluwarsa | ATURAN BARU | BUTUH KEPUTUSAN | area-12§12.3 |
| SCAR-024 | Keputusan terbuka: strategi proteksi file Windows (ACL) | Belum diputuskan | BUTUH KEPUTUSAN | area-12§12.7 |
| PTY-050 | Rotasi `wrapper.log` berbasis ukuran ("silakan dibantah") | Keputusan pelaksana | BUTUH KEPUTUSAN | area-12§12.8 |
| K-17/K-13 | Klarifikasi arti "DROP": tak diikutkan, bukan dihapus/diubah | Keputusan mengikat | BUTUH KEPUTUSAN | area-13§13.0 — tegang dengan §10.B, lihat Bagian 4 |
| K-15/SCAR-077 | Kontrak dipakai >1 komponen hanya boleh 1 salinan | SATUKAN | BUTUH KEPUTUSAN | area-14§14.4 |
| SCAR-089;TG-124 | Teks dari luar = DATA, bukan perintah (kontrak `instructions`) | KEEP | BUTUH KEPUTUSAN | area-14§14.5 |
| SCAR-042 | `/reload-plugins` putus semua koneksi MCP (catat di rilis) | KEEP catat | BUTUH KEPUTUSAN | area-14§14.7 |
| K-16 | Kebijakan bahasa: source Inggris, AI ikut user, mesin Indonesia | KEPUTUSAN BARU | BUTUH KEPUTUSAN | area-14§14.8 |
| TG-111 | Ekstraksi kutipan masuk (quote-reply user) | KEEP | BUTUH KEPUTUSAN | rekon area-02§2.4 — separuh dari B-10, belum didesain |
| TG-067 | `assertAllowedChat` — gate outbound eksplisit | KEEP(ambigu) | BUTUH KEPUTUSAN | rekon (catatan tambahan) — desain baru beda total, cukup tapi tak identik |

**Bagian 6: 41 item — 41 BUTUH KEPUTUSAN.**

---

## Bagian 7 — Temuan portabilitas Windows (Task 0, 2026-07-31)

Seluruh pekerjaan Tahap 1–2.5 lahir dan diuji hanya di macOS. Task 0 menjalankannya
pertama kali di Windows 11 (Bun 1.3.11). **Kesimpulan utama: `fleetd` JALAN di
Windows.** `bun run src/main.ts` menyala, `bun run doctor` menjawab `"ok": true`,
socket dan `conversations.db` berfungsi. K-14 tidak tersentuh.

**Hasil test saat pertama dijalankan:** fleetd **68/69** hijau (+3 galat teardown),
cc-plugin **19/22** hijau. Keempat kegagalan fleetd dan ketiga kegagalan cc-plugin
**semuanya artefak harness uji, bukan cacat kode produk** — masing-masing dibuktikan
terpisah di bawah.

**Setelah perbaikan `0605ebe` (test-only, tidak ada berkas `src/` yang disentuh):
fleetd 69/69 dan cc-plugin 22/22 hijau di Windows**, diverifikasi tiga kali
berturut-turut.

**Setelah `b0cc2f5` (W-4, satu-satunya perubahan kode produk): fleetd 73/73
(baseline naik 69 → 73, empat test baru) dan cc-plugin 22/22.** Kedua jalur W-4
juga diuji pada daemon sungguhan, bukan hanya lewat test. **Yang tersisa: W-3 dan
W-7**, dua-duanya `BUTUH KEPUTUSAN` dan tidak memblokir Task 3.

**Satu jebakan yang ikut ditutup saat memperbaiki W-4:** berlangganan event `error`
sama sekali membuat node tidak lagi mengangkatnya sebagai *unhandled error event*.
Menambahkan handler kegagalan-bind karena itu nyaris menukar satu kegagalan senyap
dengan yang lain — error yang datang **setelah** bind sukses jadi tertelan. Error
pasca-listening kini tetap dilaporkan, lewat jalur terpisah.

**Fakta akar yang menjelaskan sebagian besar temuan:** di Windows, Bun memakai
**AF_UNIX asli** (Windows 10 1803+), bukan named pipe. Berkas socket benar-benar
dibuat di disk — `readdir` dan `Test-Path` melihatnya — tetapi `stat()` atasnya
mengembalikan **`EACCES`**, sehingga **`fs.existsSync()` selalu menjawab `false`
untuk socket yang hidup.** Ini bukan dugaan: dibuktikan dengan probe langsung.

### ⚠️ Koreksi 2026-07-31 — sebagian "temuan" ini sudah terdaftar sejak awal

Task 0 pertama kali mencatat W-1..W-8 seolah semuanya baru. **Itu keliru.** Spec
§3.3 sudah memuat daftar scar tissue Windows yang wajib dipasang saat platform itu
disasar, dan tiga hal di bawah adalah anggotanya — bukan penemuan:

| Yang saya catat | Sebenarnya | Akibat |
|---|---|---|
| **W-7** (config ber-BOM membunuh `fleetd`) | **SCAR-026 (CRLF/BOM)** | Bukan temuan baru; sudah diantisipasi sejak audit. Statusnya turun jadi rujukan silang |
| Penguncian permission `config.json` lewat `icacls` | **SCAR-024** (`chmod` no-op → strategi ACL) | Kebetulan sudah mengikuti strategi yang benar |
| **W-2** (`rmSync` EBUSY) | Bertetangga **SCAR-022** (retry `renameSync` EPERM/EBUSY untuk antivirus) | Kelas yang sama: handle Windows belum lepas saat operasi berikutnya jalan |

**Yang benar-benar baru tinggal W-1, W-3, W-8** — ketiganya menyangkut AF_UNIX di
Bun/Windows, yang memang belum ada di daftar §3.3 karena daftar itu lahir dari
sistem lama yang tidak memakai unix socket.

**Pelajaran prosesnya:** aturan keempat menyuruh mencatat temuan baru, tapi tidak
menyuruh **memeriksa dulu apakah ia benar-benar baru**. Tiga dari delapan ternyata
sudah terdaftar. Sebelum menambah baris ke sini, sisir dulu spec §3.3 dan daftar
SCAR di area-01..14.

**Juga sudah dipatuhi tanpa disadari:** §3.3 melarang menyebar cabang `if (windows)`
untuk jalur yang belum bisa diuji siapa pun. Perbaikan `0605ebe` dan `b0cc2f5`
tidak menambahkan satu pun — semuanya netral-platform.

| ID | Temuan | Sifat | Bukti | Status |
|---|---|---|---|---|
| **W-26** | **Konverter markdown menelan backslash di dalam inline code.** Pesan error yang memuat path Windows (`` `C:\Users\Mirza\workspace\…` ``) mendarat di layar user sebagai `C:UsersMirzaworkspace…` — tiap backslash hilang. Isi di `conversations.db` **utuh**, jadi yang rusak tampilannya, bukan datanya | Cacat konversi, sempit tapi menyesatkan | Terlihat 2026-08-03 pada uji hidup celah #3: baris #84 di db berbunyi `attachment not found: C:\Users\Mirza\workspace\bot-uji\uji-lampiran\tidak-ada.png`, sementara screenshot user menunjukkan versi tanpa backslash. Dua sumber yang sama-sama nyata, jadi pembandingnya bukan ingatan | BELUM, **tidak memblokir**. Menggigit justru saat yang dikirim adalah path atau perintah yang user diharapkan menyalinnya — persis kasus yang membuatnya terlihat. Sebelum memperbaiki: **ukur dulu** berapa sering balasan memuat backslash di dalam inline code, jangan mengulang pola yang W-24 hukum |
| **W-25** | **`BUTTON_DATA_INVALID` dilaporkan mentah dari Telegram.** `callback data` tombol inline dibatasi **64 byte** oleh Telegram; melewatinya membuat seluruh `sendMessage` ditolak dengan `400 Bad Request: BUTTON_DATA_INVALID`, yang tidak menyebut tombol mana maupun batas mana yang dilanggar | Pesan error, bukan cacat perilaku | Ditemukan **oleh `bot-uji` sendiri** 2026-08-03 saat mengerjakan uji hidup celah #3 — bukan bagian dari ujinya. Perilaku pengirimannya **benar**: `reply failed after 0 of 1 parts sent`, tidak ada pesan separuh yang bocor. Yang kurang hanya keterangannya | BELUM. Perbaikannya sebentuk dengan `attachment too large`: validasi di sisi plugin sebelum memanggil Telegram, dengan pesan yang menyebut tombol dan panjang datanya. **Catatan jujur:** frekuensinya belum diukur — satu kejadian bukan angka, dan W-24 ada persis untuk menghukum taksiran yang tidak diukur |
| **W-24** | **Batas yang ditulis sebagai "diangkat kalau benar-benar menggigit" menggigit di percobaan hidup pertama.** Spec chunking §9 mendaftarkan pagar kode (```) yang terbelah sebagai batas yang diketahui dan sengaja tidak ditangani, dengan alasan butuh parser. Saat jaring pemotong menyala pertama kali di Telegram sungguhan, pagarnya memang terbelah: dibuka di potongan 1, ditutup di potongan 5. Karena tiap potongan dikonversi sendiri, potongan terakhir membaca pagar penutup sebagai **pembuka** lalu menelan pertanyaan dan daftar bernomor di belakangnya — di layar user jadi blok monospace berikut tombol COPY CODE | **Bukan cacat kode; cacat cara menaksir.** Kodenya berperilaku persis seperti yang didokumentasikan | Tertangkap oleh **screenshot user**, bukan oleh test — 227 test hijau saat itu. Perbaikannya (`balanceFences`) juga menunjukkan taksiran biaya awalnya salah: bukan butuh parser, cuma mesin status kecil. **Review menemukan dua lubang lanjutan dengan bentuk yang sama, cuma pindah tempat** — blok ber-indentasi empat spasi dianggap pagar (membungkus prosa yang tidak pernah dipagar), dan pagar empat backtick ditutup dengan tiga. Keduanya lahir dari mendeteksi pagar lewat tebakan kasar alih-alih aturan CommonMark, dan keduanya dibuktikan lewat keluaran nyata karena reviewer diminta **menjalankan** fungsinya dengan input aneh, bukan membacanya | **SELESAI** `1e02af3` (0.6.1), terverifikasi hidup. **Pelajaran yang lebih besar daripada perbaikannya:** deferral yang berbunyi "jarang, diangkat kalau menggigit" tidak pernah diuji frekuensinya sebelum ditulis. Bot ini hampir selalu membalas dengan blok kode, jadi "jarang" seharusnya terbaca "hampir selalu" sejak awal. Sebelum menulis deferral semacam itu lagi, **ukur seberapa sering pemicunya muncul di data yang sudah ada** — sama seperti audit celah yang melahirkan pekerjaan ini |
| **W-23** | **W-18 menjaga sebuah bug yang sudah diperbaiki tetap hidup di keenam bot harian, selama 15+ jam, tanpa satu pun sinyal.** Reply-guard `cc-plugin` **0.3.1** memakai `origin?.kind === "channel"` — tidak diruncingkan ke plugin sendiri — jadi ia menuntut balasan lewat `mcp__plugin_cc-plugin_cc-plugin__reply` untuk percakapan yang **sudah dijawab** lewat plugin `telegram` lama. Sudah diperbaiki di **0.3.3** (diruncingkan lewat `PLUGIN_ID`), dan versi terpasang sekarang **0.5.3**. Tapi keenam sesi bot dibuka **sebelum** perbaikan itu ada, jadi keenamnya masih menjalankan 0.3.1 | **Bukan bug baru — biaya nyata dari W-18.** W-18 selama ini tercatat sebagai kelas masalah tanpa contoh berbiaya | **Terukur 2026-08-02, empat angka yang saling mengunci.** (1) Guard menyala di sesi bot-03 dan memblokir padahal balasan sudah terkirim (id 2090–2092). (2) Logika 0.5.3 **diputar ulang atas transkrip sungguhan** sesi itu: `channelDriven=false`, `WOULD BLOCK: false` — jadi kode terpasang bukan yang berjalan. (3) `installed_plugins.json`: 0.5.3 sejak `2026-08-02T04:20:37Z`. (4) `wrapper.log` keenam bot: seluruh proses `claude` di-spawn **2026-08-01 antara 06:11–06:37Z**, sementara 0.3.2 baru mendarat 13 menit sesudahnya dan 0.3.3 (yang memperbaikinya) baru keesokan harinya. Jadi keenam bot berjalan di 0.3.1 — satu-satunya versi selain 0.3.2 yang punya bug ini. Dokumen `2026-08-02-keadaan-hari-ini.md` sudah menyebut penjaga ini "menghalangi sesi tujuh kali berturut-turut" tadi malam; sekarang penyebabnya punya nama dan angka | BELUM. **Perbaikan kodenya sudah ada dan sudah terpasang** — yang belum ada rumahnya adalah *cara tahu bahwa sesi menjalankan versi basi*. Tindakan langsung: **user me-restart keenam wrapper**; jangan dilakukan bot sendiri (W-18). Yang belum diputuskan: apakah sesi perlu melaporkan versi plugin yang benar-benar ia jalankan (mis. di `SessionStart`), supaya "terpasang" dan "berjalan" berhenti terlihat sama |
| **W-22** | **Path yang sama dieja dua cara, dibandingkan dengan `===`.** Claude Code menyerahkan cwd ke **hook** dengan garis miring depan (`C:/Users/…`), sementara `config.json` menulis `home` dengan backslash (`C:\\Users\\…`). `resolveBotByCwd` membandingkannya sebagai teks mentah, jadi tidak pernah cocok | Kelas "dua ejaan, satu benda" | Hook `SessionStart` **menyala setiap kali** selama dua versi dan tidak pernah menghasilkan apa pun. Terungkap oleh baris log yang dipasang di 0.5.2: `no bot has home=C:/Users/Mirza/workspace/bot-uji`. Sebelum log itu ada, dugaan saya salah arah — mengira dependency zod yang menghalangi import | **SELESAI** `4ce2c67` (0.5.3) — `samePath()` menormalkan pemisah dan garis miring ujung. **Case sengaja TIDAK dinormalkan:** Windows menyebut `C:/BOT` dan `C:/bot` sama, Linux tidak, dan salah-cocok lebih buruk daripada gagal-cocok — gagal cocok terlihat di log. Engine ikut diperbaiki meski di sana belum menggigit (proses MCP kebetulan menerima backslash); "kebetulan" bukan alasan meninggalkan kelas bug yang sama menunggu. **Pelajaran prosesnya lebih besar daripada perbaikannya:** kalau 0.5.2 cuma menulis ulang hook "biar bersih" tanpa memasang log, bug ini masih ada sekarang dan saya akan mengira sudah beres |
| **W-21** | **Konverter MarkdownV2 memakai strategi default `keep`, dan kiriman ditolak Telegram.** Markdown yang Telegram tidak punya sintaksnya — tabel, garis pemisah — diteruskan apa adanya, lalu MarkdownV2 menolak **seluruh pesan** | Cacat konfigurasi, bukan cacat AI | Ditemukan **hidup oleh bot uji sendiri** dalam ~10 menit setelah 0.5.0 terpasang: dua kiriman ditolak sebelum yang ketiga berhasil, dengan `Character '\|' is reserved and must be escaped` lalu `Character '-' …`. Ketiga strategi diukur sebelum memilih: `keep` → 400; `remove` → **string kosong**, tabelnya dihapus total; `escape` → terkirim, isi utuh | **SELESAI** `3646755` (0.5.1) — `escape`. `remove` sengaja **ditolak** meski juga menghentikan 400-nya: ia menghapus isi pesan yang user minta kirim, tanpa error dan tanpa tanda — kelas kegagalan yang proyek ini bayar berulang kali. Satu test menjaga justru properti itu: isi tabel **wajib tetap ada** di keluaran, supaya "perbaikan" yang menghapusnya tidak bisa lolos sebagai hijau. **Pelajaran yang lebih besar:** ini bukan kasus untuk diingatkan ke AI. AI-nya tidak salah — ia menulis tabel markdown yang benar. Menjadikannya pengingat berarti meminta AI menghafal batasan yang seharusnya tidak pernah ia ketahui |
| **W-20** | **`session_id` jadi basi setelah `/clear`.** Proses MCP membaca `CLAUDE_CODE_SESSION_ID` sekali saat dinyalakan, dan `/clear` **tidak** menyalakannya ulang — jadi pesan yang datang sesudahnya tetap distempel id sesi yang secara konsep sudah tidak ada | Ketidaktepatan data, bukan kerusakan jalur | **Terukur dari KEDUA sisi** 2026-08-02, bukan lagi dugaan. Sisi engine: baris 34 (sebelum `/clear`) dan 35 (sesudah) sama-sama `session_id = f850dfd0-…`, PID tetap 58112, berkas kunci tidak bergerak. Sisi Claude Code: layar `Status` sesudah `/clear` menunjukkan **`Session ID: 2ef5b4c5-db87-4655-9d19-cd41193013cb`** — id yang sama sekali berbeda. Jadi Claude Code **memang** menerbitkan sesi baru; yang tidak tahu adalah proses MCP-nya, karena ia tidak ikut dinyalakan ulang. Pasangan angka itulah buktinya, dan ia hanya bisa didapat dengan membandingkan dua sisi — dari satu sisi saja, ini terbaca seperti tidak ada yang terjadi. Sudah **diantisipasi** komentar di `cc-plugin/src/main.ts` (*"a snapshot taken when the MCP connection was made, not a live session tracker"*) dan spec §8 risk 2 — yang baru adalah buktinya | BELUM, **tidak memblokir**. Tidak berpengaruh hari ini: riwayat dan pencarian bercakupan per-bot, bukan per-sesi. Menggigit saat routing sesi sungguhan dibangun (Tahap 4), di mana "pesan ini milik sesi mana" harus dijawab benar. Perbaikannya kemungkinan bukan membaca ulang env var (nilainya memang tidak berubah di proses yang sama) melainkan sinyal dari sisi Claude Code, atau menerima dan mendokumentasikan batasnya |
| **W-19** ⚠️ | **Balasan keluar tidak pernah disimpan.** Seluruh `conversations.db` hanya memuat `source='user'` — 32 dari 32 baris. `handleIncomingMessage` menyimpan tiap pesan masuk; jalur `reply` tidak menyimpan apa pun. Akibatnya `read_history` dan `search_history` menyajikan **transkrip sepihak**: AI bisa membaca ulang apa yang user katakan, tapi tidak apa yang ia sendiri jawab | **Fitur yang hilang dalam penulisan ulang**, bukan bug. Persis kelas yang aturan keempat ada untuk menangkapnya | Ditemukan 2026-08-02 saat verifikasi hidup, **oleh user**, bukan oleh mekanisme apa pun: ia menanyakannya justru karena mengira sudah tersimpan. Diperiksa: `SELECT source, count(*) GROUP BY source` → hanya `user`. Sistem **lama** menyimpan keduanya — `plugins/telegram/messages-store.ts` punya `source: 'assistant' \| 'system'` berikut `OutboundLogInput` khusus untuk itu. Jadi ini **regresi terhadap sistem lama**, bukan fitur yang belum sempat dibangun | BELUM — **user menyatakan ini seharusnya tersimpan**, jadi ini kebutuhan, bukan pertanyaan. Rumahnya **2.5-KELUAR**: itu memang tahap jalur keluar, dan menyimpan balasan adalah bagian termurahnya. Kolom `source` di skema sudah menyediakan tempatnya sejak awal — yang hilang cuma pemanggilnya. Perhatikan saat mengerjakannya: `message_id` balasan baru diketahui **sesudah** Telegram menjawab `sendMessage`, jadi penyimpanan harus terjadi setelah kirim sukses, bukan sebelum |
| **W-18** ⚠️ | **Sesi yang berjalan bisa lebih tua dari perbaikannya, dan tidak ada apa pun yang memberitahu.** Sesi bot-02 memuat `cc-plugin` **0.3.2**, yang mendeteksi channel dengan `origin.kind === "channel"` — jadi ia memblokir tiap turn yang sudah dijawab benar lewat plugin `telegram` **lama**. Itu persis W-14, yang sudah diperbaiki di 0.3.3 (`57aff24`) | **Celah rilis, bukan celah kode.** Kelasnya: "sudah dipasang" ≠ "sudah aktif" | Diamati 2026-08-02 di sesi bot-02: hook memblokir **7 turn berturut-turut** pada percakapan yang seluruhnya lewat plugin lama. Dipastikan bukan 0.3.3: tag masuk `source="plugin:telegram:telegram"` dan `origin.server` = idem — tidak satu pun memuat `cc-plugin`, jadi logika 0.3.3 mustahil menyala. `grep PLUGIN_ID`: 0.3.1 → 0, 0.3.2 → 0, 0.3.3 → 4. **Waktunya yang menjelaskan semuanya:** proses MCP sesi ini mulai **13:11**, sedangkan cache 0.3.3 ditulis **13:25:23** — 14 menit lebih lambat. Jadi 0.3.3 memang terpasang; sesinya saja yang lebih tua | BELUM — **perbaikannya restart sesi, bukan pasang ulang.** Yang belum ada rumahnya: Claude Code mengunci versi plugin saat sesi dibuka, dan tidak ada sinyal apa pun bahwa versi yang berjalan sudah ketinggalan. Sebuah Stop hook karena itu bisa memblokir berjam-jam dengan logika yang sudah dibuang dari repo. **Temuan kedua:** tool MCP `cc-plugin` tidak ada sama sekali di sesi itu sementara hook-nya tetap hidup — bentuk **W-16**: proses mati diam-diam, hook-nya tidak ikut mati. Tidak ada yang menautkan umur hook ke umur prosesnya |
| **W-1** | `existsSync()` bohong untuk socket hidup di Windows (`stat` → EACCES). Menjatuhkan gerbang kesiapan `e2e.test.ts:192-206` → **1 test merah nyata**. Juga membuat pembersihan socket basi di `fleetd/src/socket/server.ts:28` jadi no-op permanen di Windows | Test-only | Probe: `readdir` melihat berkas, `existsSync` `false`, `lstat` EACCES. Restart di atas socket basi **diuji dan tetap berhasil** — jadi no-op itu tidak berbahaya | **SELESAI** `0605ebe` — gerbang diganti `readdir()` |
| **W-2** | `rmSync(home, {recursive, force})` di `afterAll` e2e melempar **EBUSY**: `fleetdProc.kill()` kembali sebelum proses anak melepas handle SQLite/socket. **Sekelas SCAR-022** (retry EPERM/EBUSY), bukan temuan mandiri | Test-only | 3 galat teardown, ketiganya muncul sebagai test `(unnamed)` | **SELESAI** `0605ebe` — tunggu `proc.exited` sebelum `rmSync` |
| **W-3** | Path socket dibatasi **~107 karakter** (`sockaddr_un.sun_path` = 108 byte). Lebih dari itu → `Failed to listen`. Path produksi (`~/.claude/mirza-bots/fleetd.sock`, 44 karakter) aman; `MIRZA_BOTS_HOME` yang dalam **tidak** aman | Batas nyata, belum menggigit | Bisect: 101 char OK, 111 char gagal. macOS lebih ketat lagi (104) | BUTUH KEPUTUSAN (validasi panjang path saat start?) |
| **W-4** | **`fleetd/src/main.ts:308` mencetak `fleetd listening on …` tanpa syarat** — padahal `server.listen()` asinkron, jadi baris itu ikut tercetak saat listen GAGAL. Pesan liveness yang berbohong, dan daemon tetap hidup dalam keadaan tuli | **Cacat kode nyata, lintas-platform** | Teramati langsung: `listening on …` lalu `Failed to listen at …` di proses yang sama. Test regresi tingkat daemon sempat merah persis begitu, berikut proses yang menggantung sampai batas 10 detik | **SELESAI** `b0cc2f5` — `startSocketServer` dapat callback `onListening`/`onListenError` yang di-subscribe **sebelum** `listen()`; `main.ts` mengumumkan dari event, dan pada gagal bind melapor lalu `exit(1)` |
| **W-5** | 2 test cc-plugin meng-assert pemisah path POSIX (`/tmp/…`, `${home}/.claude/…`); `join()` di Windows menghasilkan `\` | Test-only, kosmetik | `main.test.ts:9,21` | **SELESAI** `0605ebe` — ekspektasi dibangun dengan `join()` |
| **W-6** | `await expect(promise).rejects.toThrow()` di `bun test` Windows **tidak pernah settle** bila penyelesaian promise bergantung pada event `close` socket — menggantung tanpa batas (diuji >120 detik). Membuat 1 test cc-plugin merah | Test-only (cacat Bun di Windows) | Kode produksi terbukti BENAR lewat 3 jalur: `bun run` standalone, `bun test` dengan `try/catch`, dan 4 varian buildup — semuanya menolak dengan `connection lost`. Hanya bentuk `expect().rejects` yang gagal | **SELESAI** `0605ebe` — diganti `try/catch` |
| **U-1** | **Aturan `inline-buttons` terlalu sering menyala.** Pemicunya mekanis — "balasan diakhiri tanda tanya → wajib buttons" — sehingga tidak bisa membedakan pertanyaan yang jawabannya satu tap dari pertanyaan terbuka yang jawabannya paragraf | Keluhan UX langsung dari user, 2026-08-01 | User: *"cukup mengganggu juga kalau setiap saat keluar buttons"* | **SELESAI** — `inline-buttons` **0.0.10** (marketplace lama). Pemicunya kini **"jawabannya bisa dipilih dari daftar pendek?"**; konfirmasi & menu 2-4 opsi tetap bertombol, pertanyaan terbuka **tanpa tombol sama sekali**. Aturan lama tetap ditulis di README berikut alasan ia dulu dibuat mekanis — versi yang mengandalkan penilaian terbukti lupa justru di akhir balasan panjang |
| **U-2** | **Keyboard tidak dicopot setelah tombol ditap — hanya di sistem BARU.** `fleetd` memanggil `answerCallbackQuery()` (spinner berhenti) tapi tidak pernah mengedit pesannya, jadi tombol yang sama bisa ditap berulang | Gap nyata di `fleetd` | Sistem **lama** sudah benar: `server.ts` melakukan `editMessageText` tanpa `reply_markup`, keyboard hilang dan teksnya ditambahi `→ <label>`. Sistem baru belum | **SELESAI** `90d9b0a` — perilaku sistem lama diport ke `fleetd`: `editMessageText` **tanpa** `reply_markup` (itulah yang mencopot keyboard), entities asli dikirim ulang agar format tidak terhapus, penanda ditempel di AKHIR agar offset lama tetap sah. Edit dijalankan **setelah** press tersimpan & terkirim. fleetd 128 → 132 test. ⚠️ **Belum pernah menyentuh Telegram sungguhan** — yang terbukti hanya fleetd mengirim payload yang benar |
| **U-3** | **AI tidak boleh pernah meminta `message_id` ke user.** User tidak pernah melihat id itu dan tidak bisa mengaksesnya | Perilaku AI, bukan desain | Desainnya sudah benar: user cukup **quote**, id datang sendiri lewat `meta.reply_to_message_id`. Kalau AI sampai bertanya, itu salah perilaku | **SELESAI** — deskripsi tool `read_history` kini eksplisit: **jangan pernah menanyakan `message_id` ke user**, dan kalau id-nya tidak ada, minta user meng-**quote** pesannya (quote membawa id-nya sendiri) |
| **U-4** | **Waktu disimpan UTC tanpa orientasi lokal.** `ts` benar (`00:37:29Z` = `07:37:29` WIB) tapi AI tidak bisa tahu user sedang begadang atau tidak | Fitur yang hilang, bukan bug | User: *"orientasi waktu itu penting bagi bot agar memahami kondisi user"* | **SELESAI** `c70a9cc` — penyimpanan **tetap UTC**; `config.json` menerima `timezone` opsional (IANA), dan push `meta` mendapat `ts_local` di samping `ts`. Zona salah ketik → `ts_local` sekadar tidak muncul, poller tidak mati. fleetd 116 → 128 test |
| **W-16** ⚠️ | **`cc-plugin` MATI DIAM-DIAM saat `hello` ditolak.** `main()` melakukan `await client.connect(...)` di tingkat atas; `unknown_cwd` membuat promise-nya reject, `main()` melempar, dan prosesnya keluar. **Tidak ada pesan apa pun yang sampai ke user** — plugin sekadar tidak ada | **Celah nyata**, kelas "diam tak bisa dibedakan dari bot rusak" | Menghabiskan ~2 jam pada 2026-08-01: sesi uji tidak pernah mengikat, dan tiap kegagalan tak meninggalkan jejak apa pun. Yang **terbukti**: tidak ada satu pun proses `cc-plugin` untuk bot itu selama rentang tersebut, dan matinya-diam-diam adalah fakta kode (`await client.connect()` di tingkat atas `main()`). Yang **TIDAK terbukti**: kenapa `hello`-nya ditolak — dugaan "salah folder" **dibantah user**, yang yakin sudah menjalankannya dari `bot-uji`. Pulih sendiri setelah restart berikutnya, tanpa perubahan kode. **Akarnya masih belum diketahui** | BELUM — mestinya `unknown_cwd` menghasilkan pesan yang bisa dibaca manusia ("cwd ini tidak terdaftar di config; bot yang terdaftar: …") dan plugin tetap hidup agar Claude Code menampilkannya, bukan hilang tanpa suara. Rumahnya kemungkinan 2.5-GUARD |
| **W-17** | **Probe diagnostik bisa MEMAKAN antrean offline.** Menyapa `fleetd` sebagai sebuah bot memicu `onBind` → `drainQueue`, yang menandai seluruh antrean `delivered = 1` dan mengirimnya ke koneksi penyapa. Koneksi yang langsung ditutup = pesan hilang | Jebakan operasional | Terjadi 2026-08-01: probe koordinator memakan 4 pesan user. Dipulihkan dengan `UPDATE bot_inbox SET delivered = 0` | BUTUH KEPUTUSAN — `drainQueue` menandai terkirim **sebelum** ada bukti pengiriman berhasil. Pertimbangkan ack dari sisi plugin sebelum menandai, atau mode "peek" untuk diagnosa. **Sampai itu ada: jangan pernah menyapa `fleetd` sebagai bot yang punya antrean, kecuali memang berniat mengurasnya** |
| **W-15** ⚠️ | **Dua sesi yang berbagi `home` sebuah bot sama-sama menjadi bot itu, dan menerima SEMUA pesannya.** `fleetd` mengenali bot lewat **cwd** (`resolveBotByCwd`: `bot.home === cwd`), lalu `registry.push()` mengirim ke **setiap** koneksi yang terdaftar untuk bot itu | Tabrakan identitas, bukan bug broadcast | Teramati langsung 2026-08-01: sesi koordinator (cwd `workspace\bot-01`) ikut menerima tiap pesan bot uji, karena `config.json` menyebut `home` bot-01 = folder yang sama. Dikonfirmasi ke `registry.ts:29-34` — fan-out ke seluruh set memang disengaja, supaya plugin yang menyambung ulang tetap dapat pesannya | **DIREDAM 2026-08-01, akarnya masih BUTUH KEPUTUSAN.** Bot uji dipindah ke rumah sendiri (`workspace\bot-uji`) dan entri config-nya diganti nama `bot-01` → `bot-uji` agar nama dan rumahnya cocok; 19 baris riwayat ikut dipindahkan (`UPDATE messages SET bot`), FTS diverifikasi tetap utuh, database di-backup lebih dulu. Itu menghentikan bentroknya, **bukan menyelesaikan akarnya**. Yang belum diputuskan: desainnya mengandaikan **satu sesi per home bot** dan andaian itu tidak pernah ditulis. Pilihan: (a) terima & dokumentasikan, (b) identitas dari sesuatu selain cwd, (c) hanya kirim ke koneksi terbaru. **Jangan pilih (c) tanpa memikirkan antrean offline** — fan-out itulah yang membuat plugin reconnect tetap terlayani |
| **U-5** | **Tombol bernomor dikirim tanpa keterangan angkanya di badan pesan**, sehingga user melihat `1 2 3` tanpa tahu artinya. Bot sampai mengirim pesan KEDUA berisi keterangannya, dan mengaku *"aku lupa tulis lagi — dua kali sekarang"* | Aturan yang hidup sebagai teks, gagal persis seperti dugaan K-5 | Screenshot user 2026-08-01. Aturan narasi-bernomor hanya ada di skill `inline-buttons` (marketplace **lama**); sistem baru tidak punya padanannya sama sekali | **SELESAI** `6b54bf7` — **ditegakkan mesin**, sebaris dengan B-4/B-5: `fleetd` menolak `reply` berlabel angka bila badan pesannya tidak memuat daftar bernomor yang cocok, **sebelum** apa pun terkirim. Pesan errornya menyebutkan **cara** memperbaiki, karena penolakan yang tidak mengajarkan alternatif benar akan dijawab dengan kiriman ulang yang sama. Hanya menyala bila ≥2 label numerik, dan label non-numerik diabaikan sehingga tombol "Explain manually" tidak mungkin menjatuhkannya. fleetd 132 → 145 test |
| **U-6** | **PDF tidak terbaca: `pdftoppm` (poppler-utils) tidak terpasang di mesin ini** | Dependensi lingkungan, **bukan celah kode** | Direproduksi langsung oleh koordinator: `Read` atas PDF di inbox menjawab *"pdftoppm is not installed"*. Sesi bot uji menyiasatinya dengan `pdftotext` dari Git Bash — jalan untuk PDF teks, **gagal untuk PDF hasil scan** | BELUM — pasang `poppler-utils` (`scoop install poppler` / `choco install poppler`). Itu memulihkan jalur PDF bawaan Claude Code, termasuk PDF hasil scan yang siasat `pdftotext` tidak bisa tangani |
| **W-14** | **Stop hook memblokir pesan milik plugin channel LAIN.** Satu sesi bisa memuat `cc-plugin` **dan** plugin `telegram` lama sekaligus; sejak 0.0.37 plugin lama ikut menstempel penanda terse-turn yang sama dan prompt-nya juga datang sebagai channel. Hook menuntut balasan lewat `cc-plugin` untuk percakapan yang sudah dijawab benar lewat plugin lain | Cacat nyata, **ditemukan produksi <1 jam setelah rilis** | Hook-nya memblokir sesi ini sendiri — sesi yang sudah membalas dengan benar. Sinyalnya menjawab "ini dari sebuah channel", bukan "dari channel yang MANA" | **SELESAI** `57aff24` (0.3.3) — kedua sinyal di-scope ke `PLUGIN_ID`. **Keluarga yang sama dengan flag `telegramDriven` sticky** yang justru dihindari desain ini: bukan bocor lintas waktu, tapi lintas channel. Pelajarannya sama — sinyal harus menyebut dirinya sendiri, bukan kategorinya |
| **W-13** | **Menulis ulang `config.json` mengembalikan permission-nya ke warisan.** Kunci `icacls /inheritance:r` hilang begitu berkasnya ditulis ulang oleh alat apa pun; SYSTEM dan Administrators bisa membacanya lagi — padahal isinya token seluruh armada | Regresi keamanan yang senyap | Teramati langsung 2026-08-01 saat menambahkan `timezone`: sesudah menulis, `icacls` menunjukkan tiga ACL warisan `(I)(F)`. Dikunci ulang manual | BUTUH KEPUTUSAN — inilah alasan **SCAR-024 menuntut penegakan oleh KODE**, bukan sekali-kunci-manual. Rumahnya 2.5-GUARD. Sampai itu ada, **setiap kali `config.json` disentuh, `icacls` harus dijalankan lagi** |
| **W-12** | **Flake `e2e.test.ts`: `SQLiteError: no such table: messages_fts`.** Balapan DDL antar-proses — `waitForStoredMessage` membuka `conversations.db` begitu berkasnya ada, mendahului migrasi `CREATE ... IF NOT EXISTS` milik daemon | Flake test, **pre-existing** | Ditemukan subagent saat mengerjakan U-4. Dibuktikan **bukan** akibat perubahan itu: repo disalin, ketiga suntingan sumber dibalik, dan kegagalan yang sama tetap muncul **1 dari 25 run** pada kode yang tidak diubah. Tidak pernah muncul saat `e2e.test.ts` dijalankan sendiri (0/20) — hanya pada run suite penuh | BELUM — **kelas yang sama dengan flake yang ditutup di Task 6**: test menunggu bukti yang salah (berkas ada ≠ skema siap). Perbaikannya kemungkinan menunggu tabelnya ada, bukan berkasnya |
| **W-11** | **Satu BOM di stdin melucuti Stop hook tanpa suara.** `JSON.parse` melempar, `main()` keluar lebih awal, hook tidak menjaga apa pun — sementara `claude plugin list` tetap melaporkannya terpasang & enabled | **Insiden BOM KETIGA** (SCAR-026) | Ditemukan saat verifikasi end-to-end `0.3.1`, **bukan** oleh test: 9 unit test hijau, hook diam saat dipanggil lewat pipe PowerShell. BOM-nya ternyata dari harness PowerShell, bukan Claude Code — dibuktikan dengan spawn proses langsung, dan keempat kasus benar | **SELESAI** `e0cc2da` (0.3.2) — `parseHookInput` mengabaikan BOM & mengembalikan `null` alih-alih melempar. Dikerjakan meski BOM-nya artefak harness: harganya satu baris, taruhannya satu-satunya penjaga terhadap bot bisu |
| **W-10** ⚠️ | **`cc-plugin` tidak punya Stop hook.** Sistem lama punya: kalau percakapan Telegram berakhir tanpa `reply` sejak pesan terakhir masuk, hook memblokir sekali dan memaksa AI menjawab. Di sistem baru tidak ada penjaga apa pun — AI yang lupa `reply` menghasilkan **diam total** | **Celah nyata, diperparah protokol terse-turn** | Ditemukan 2026-08-01 saat user melaporkan pesannya sempat tidak dibalas di bot uji. Dibuktikan **bukan** 409 (satu `fleetd`, token berbeda) dan **bukan** `fleetd` menjatuhkan pesan (`bot_inbox` 0 baris, `incidents` 0, ke-12 pesan tersimpan). Sisa tersangka: sesi AI-nya | **SELESAI** `91d9df7` (cc-plugin 0.3.1) — `hooks/reply-guard.ts` + `hooks/hooks.json`, 9 test. **Penemuan yang menyelamatkannya:** hook sistem lama menolak entri ber-`content` bukan-array, padahal pesan channel masuk membawa content berupa **string**; mem-port-nya apa adanya akan menghasilkan hook yang terpasang tapi tidak menjaga apa pun. Deteksi memakai dua sinyal berdiri sendiri (`origin.kind` + `TERSE_TURN_MARKER`) supaya tidak bisa dilucuti diam-diam oleh satu perubahan format |
| **W-9** | `album_failed_count` / `album_total_count` di `meta` dipancarkan **setiap kali** ada unduhan gagal — termasuk untuk foto tunggal yang bukan bagian album. Namanya jadi berbohong soal konteks | Penamaan, bukan perilaku | Ditemukan saat Task 5 (`1123446`); brief memang menentukannya begitu | BUTUH KEPUTUSAN — **jangan digating ke `isAlbum` begitu saja**: teks pemberitahuannya sudah album-only, jadi menggating counter-nya membuat kegagalan unduh foto tunggal **tidak terlihat sama sekali**. Yang benar kemungkinan mengganti nama jadi `attachment_failed_count` |
| **W-8** | Konek ke socket yang **belum** ada memancarkan error yang test runner `bun` kaitkan ke test yang sedang berjalan, **sekalipun sudah ada listener `error` yang menanganinya** dan `try/catch` melingkupinya. Di `bun run` (bukan `bun test`) handler yang sama bekerja normal | Test-only (cacat Bun di Windows) | Ditemukan saat memperbaiki W-1: gerbang probe-konek justru menjatuhkan test yang seharusnya ia jaga | DIHINDARI `0605ebe` — gerbang menunggu entri `readdir` dulu, jadi tidak pernah konek ke ruang kosong. Akar di Bun belum dilaporkan ke hulu |
| **W-7** | `config.json` ber-BOM UTF-8 membuat `fleetd` mati saat start dengan `JSON Parse error: Unrecognized token '﻿'`. Alat Windows (PowerShell `Set-Content -Encoding utf8`) menghasilkan BOM secara default | **BUKAN temuan baru — ini SCAR-026 (CRLF/BOM)**, sudah terdaftar di spec §3.3 | Teralami langsung saat menyiapkan config uji; jadi konfirmasi lapangan bahwa SCAR-026 memang masih menggigit | BUTUH KEPUTUSAN — sama seperti sebelumnya (strip BOM, atau pesan galat yang menyebut BOM), tapi dikerjakan sebagai bagian SCAR-026, bukan sebagai item terpisah |

**Yang TIDAK terjadi** (hipotesis yang diuji lalu gugur — dicatat supaya tidak
diselidiki ulang):

- `fleetd` **tidak** gagal restart setelah mati tak bersih. Meski pembersihan socket
  basi tak pernah jalan (W-1), `bind()` AF_UNIX Windows menimpa berkas lama. Diuji:
  bunuh `fleetd`, berkas `.sock` bertahan, `fleetd` baru menyala dan `doctor` `"ok": true`.
- Penutupan socket **tetap** merambat ke peer di Windows. `FleetdClient.failAll` bekerja
  sebagaimana dirancang; W-6 murni soal helper assertion.
- Windows **tidak** memakai named pipe untuk ini — tidak ada entri di `\\.\pipe\`.

