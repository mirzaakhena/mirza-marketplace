# Saran Perbaikan — Work Order untuk Bot Eksekutor

- **Tanggal:** 2026-07-02
- **Untuk:** bot mana pun yang akan mengerjakan perbaikan ini nanti.
- **Sumber:** audit 4 subagent READ-ONLY yang membaca seluruh source tiap plugin + menjalankan `bun test` + probe runtime (termasuk validasi terhadap binary Claude Code v2.1.198 terpasang). Temuan bertanda **✓ terverifikasi** di-spot-check ulang langsung terhadap kode saat audit; sisanya dari auditor dan sebaiknya dikonfirmasi ulang sebelum fix besar. `[UNCERTAIN]` = belum direproduksi live.

---

## Cara pakai dokumen ini (BACA DULU)

1. **Satu item = satu unit kerja.** Kerjakan berurutan per prioritas (P0 → P3), atau ambil satu tema penuh (mis. semua SEC). Jangan campur banyak tema dalam satu commit — biar mudah di-review & di-revert.
2. **Nomor baris bisa sudah bergeser.** Selalu buka file dan cari simbol/konteks yang dikutip, jangan percaya baris mentah.
3. **WAJIB ikuti checklist rilis di `CLAUDE.md`** untuk SETIAP perubahan yang menyentuh `plugins/<name>/`: (1) bump versi di `.claude-plugin/plugin.json` — harus lebih tinggi dari yang ada di `~/.claude/plugins/cache/mirza-marketplace/<name>/`; (2) bump `wrapper/package.json` bila menyentuh wrapper; (3) update README plugin; (4) update README root; (5) cek deskripsi katalog `marketplace.json`. Ini bukan opsional.
4. **Disiplin git repo bersama** (`docs/SOP-git-multi-agent.md` + skill `bot-conduct`): edit/commit HANYA di `C:\Users\Mirza\workspace\mirza-marketplace` (canonical clone), pakai worktree untuk kerja paralel, trailer `Agent: <bot-name>` di tiap commit, push segera setelah commit rilis.
5. **Tulis test dulu bila memungkinkan** (repo pakai Bun + `bun:test`) — banyak temuan di bawah ada justru karena area itu tak ter-cover test.
6. Tandai item selesai dengan mengubah `[ ]` → `[x]` + tulis SHA commit di sampingnya, supaya bot berikutnya tahu progres.
7. **Sebelum mengerjakan item P2/P3, baca bagian "Arah arsitektur target" di akhir dokumen.** Bentuk akhir beberapa fix (terutama INFRA-* dan CONS-1/3, serta IDEA-1/2/3) ditentukan oleh arah itu — kerjakan fix taktis dengan bentuk yang konvergen ke sana, bukan menjauh.

---

## Konteks repo (untuk bot yang belum kenal)

Marketplace plugin Claude Code **pribadi** untuk mengendalikan armada bot CC (bot-01…bot-06) dari HP lewat Telegram. Komponen: `telegram` (jembatan Telegram↔CC, MCP server long-polling, state per-project, logging SQLite), `pty-controller` + wrapper `mirza-cc` (host CC di node-pty, injeksi slash-command ke sesi sendiri), `agent-bus` (pesan bot-ke-bot via inbox + registry `~/.claude/agent-registry.json`), dan skill perilaku (`immediate-reply`, `inline-buttons`, `teach-me`, `bot-conduct`, `knowledge-vault`, `handoff`, `goal`, `daily-report`). Prinsip: plugin = channel-adapter, keputusan AI tetap di sisi CC; otonomi antar-bot; state per-project.

---

# P0 — Keamanan (kerjakan duluan)

Sistem ini menerima input dari Telegram (publik-ish) dan dari bot lain. Tiga lubang di bawah membiarkan pihak tak berwenang memicu efek nyata.

### [ ] SEC-1 — `/context` & `/version` bocor ke pengirim non-paired
- **File:** `plugins/telegram/server.ts:408-418` (`dmCommandGate`) + handler `/context` (~`server.ts:1071-1114`) & `/version` (~`server.ts:1134`).
- **Masalah:** `dmCommandGate` hanya menolak mode `disabled` dan `allowlist`. Pada mode **default `pairing`**, pengirim asing yang menemukan bot lolos gate. `/context` & `/version` tidak mengecek `allowFrom` sama sekali → stranger dapat context-window %, model, session id, **CWD**, cost, versi plugin. Lebih buruk: `/context` memicu `ensureContextBridgeInstalled()` yang **menulis `<project>/.claude/settings.json`** — efek samping tulis-disk dari input tak-terpercaya.
- **Kenapa penting:** Ini kebocoran info + write-primitive yang dipicu siapa saja yang tahu handle bot, pada konfigurasi default (banyak orang tak pernah mengganti dari `pairing`). CWD & session id membocorkan struktur mesin; menulis `settings.json` dari luar adalah pintu penyalahgunaan. Meta-command lewat callback sudah digate `allowFrom` (`server.ts:1276`) — jadi ini inkonsistensi: satu pintu dijaga, pintu lain terbuka.
- **Fix:** Tambahkan syarat `access.allowFrom.includes(senderId)` di handler `/context` dan `/version` (atau param `requirePaired: true` pada `dmCommandGate`). Non-paired → balas pesan pairing seperti `/start`.
- **Verifikasi:** Test: pengirim di luar `allowFrom` pada mode `pairing` tidak menerima payload `/context` dan `settings.json` tidak tersentuh.
- **Rilis:** bump telegram + README (bagian commands).

### [ ] SEC-2 — Anggota grup bisa kendalikan wrapper via meta-command teks
- **File:** `plugins/telegram/server.ts:1865` (`tryRouteMetaCommand` di `handleInbound`), gate grup `server.ts:389-402`, reply-ke-bot dianggap mention `server.ts:434`.
- **Masalah:** Untuk grup terdaftar dengan default (`allowFrom: []` = semua member, `requireMention: true` yang terpenuhi cukup dengan me-*reply* pesan bot), pesan teks `/new x`, `/rename x`, `/effort low` langsung ditulis ke inbox wrapper **tanpa cek `allowFrom` dan tanpa konfirmasi**. `/new` = menghapus konteks sesi CC operator. Intercept `PERMISSION_REPLY_RE` (`server.ts:1843`) juga berlaku di grup — member bisa menebak `yes <5huruf>`.
- **Kenapa penting:** Meta-command adalah kontrol tingkat-mesin (hapus konteks, ganti effort, rename sesi). Membiarkan member grup mana pun memicunya = siapa pun yang kamu undang ke grup bisa merusak sesi kerjamu. Callback `meta:*` sudah dijaga `allowFrom` (`server.ts:1276`) tapi jalur **teks** terlewat — lubang yang sudah setengah ditutup.
- **Fix:** Batasi routing meta-command **dan** permission-reply ke `ctx.chat.type === 'private'` **dan** `allowFrom.includes(senderId)`. Di grup, meta-command dari non-allowlisted diabaikan (atau dibalas "hanya di DM").
- **Verifikasi:** Test: pesan `/new x` dari member grup non-allowlisted tidak menghasilkan file pending wrapper.
- **Rilis:** bump telegram + README.

### [ ] SEC-3 — Regex `pty_send_slash` mengizinkan `\r`/`\n`/ESC/Ctrl di argumen
- **File:** `plugins/pty-controller/server.ts:42` — `const SLASH_COMMAND_RE = /^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$/`.
- **Masalah:** `\s` dan `[\s\S]` mencakup `\r`, `\n`, ESC (`\x1b`), `\x03`. Payload `"/compact \r\rteks bebas apa pun"` lolos validasi; di wrapper `injectSlashCommand` menulisnya verbatim ke PTY → `\r` pertama men-submit `/compact`, sisa teks masuk sebagai user turn mentah, lalu `\r` trailing wrapper men-submit-nya. Byte ESC/Ctrl-C berarti keystroke kontrol PTY arbitrer.
- **Kenapa penting:** Header `server.ts` menyatakan invarian keamanan tunggal plugin ini: "refuses raw text injection … structurally confined." Regex ini **mematahkan invarian itu secara deterministik** — sebuah prompt-injection yang berhasil menyusup ke argumen bisa mengeksekusi teks/keystroke sewenang-wenang di sesi CC. Ini fondasi kepercayaan seluruh pty-controller.
- **Fix:** Larang karakter kontrol: ganti argumen ke `[^\r\n\x00-\x1f]{0,256}`. Tambah test yang memastikan payload ber-`\r`/`\n`/ESC ditolak.
- **Verifikasi:** Test: `"/compact \r evil"` → ditolak sebelum ditulis ke pending.
- **Rilis:** bump pty-controller + README.

### [ ] SEC-4 (LOW) — Marker atribusi agent-bus bisa dipalsukan dari body
- **File:** `plugins/agent-bus/prompt-compose.ts:73-79`.
- **Masalah:** Body prompt tidak di-escape; pengirim bisa menaruh `] [Message from user: …` sehingga penerima (yang anti-bounce-nya "keys on that bracketed marker") bisa dibujuk menganggap teks setelahnya bukan pesan antar-agent.
- **Kenapa penting:** Model trust = satu mesin/satu user, jadi risikonya rendah. Tapi karena seluruh disiplin anti-bounce & atribusi bergantung pada marker itu, memperkuatnya murah dan mencegah kelas confusion.
- **Fix:** Escape/strip `]` di awal body, atau tutup marker dengan token yang tak bisa muncul di body (body sudah dipastikan satu baris oleh `flat`).
- **Rilis:** bump agent-bus.

---

# P0 — Data-loss & kegagalan senyap

Kelas paling berbahaya: sistem tampak jalan, tapi diam-diam kehilangan data / macet. Semua ini gagal tanpa error yang terlihat user.

### [ ] LOSS-1 — `encodeProjectDir` wrapper ≠ encoding folder proyek Claude Code ✓
- **File:** `plugins/pty-controller/wrapper/src/wrapper.ts:115-123` — `return p.replace(/[\\/:]/g, '-')`.
- **Masalah:** CC v2.1.198 meng-encode path proyek dengan `e.replace(/[^a-zA-Z0-9]/g,"-")` **dan** memotong hasil >200 char dengan sufiks hash (fungsi `jE`, `ont=200` di cli.js terpasang). Wrapper hanya mengganti `\ / :`. Untuk path yang mengandung `.`, `_`, spasi, dll (mis. `~/workspace/_tb-scratch`, `my.app`) → `CLAUDE_PROJECTS_DIR` salah → `listSessions()` selalu kosong → (a) startup selalu dianggap first-run (tak pernah `--resume`), (b) deteksi sesi segar pasca-`/clear` tak pernah terpicu → **setiap `/clear` menahan antrean injeksi sampai timeout barrier 10 menit** + notifikasi session-change salah/hilang.
- **Kenapa penting:** Ini bom waktu. Fleet `bot-0X` sekarang selamat **hanya kebetulan** karena path-nya alfanumerik+dash. Begitu ada bot dengan path ber-titik/underscore/spasi (sangat mungkin), auto-resume mati total dan tiap reset menggantung 10 menit — gejalanya membingungkan dan sulit dilacak karena tak ada error. Divalidasi langsung terhadap binary CC terpasang.
- **Fix:** Samakan dengan CC: `p.replace(/[^a-zA-Z0-9]/g, '-')` + implementasi truncation 200-char + hash bila perlu. Lebih tahan lama: deteksi folder proyek dengan probing nyata (cari folder yang ada di `~/.claude/projects/`) alih-alih menebak encoding.
- **Verifikasi:** Test dengan path ber-`.`/`_`/spasi menghasilkan nama folder yang identik dengan yang dibuat CC. Manual: jalankan wrapper dari path ber-titik, pastikan `/clear` tidak menggantung.
- **Rilis:** bump pty-controller + `wrapper/package.json` + README.

### [ ] LOSS-2 — Orphan registry-lock tanpa TTL + busy-wait membekukan seluruh armada
- **File:** `plugins/pty-controller/wrapper/src/wrapper.ts:412-439` (`acquireRegistryLock`, busy-wait `while (Date.now() < until) {}`), pemanggil heartbeat `:522-534`, `persistRegistry` `:475-491`. Kontrak cermin di `plugins/agent-bus/registry.ts:48-66`. (Dilaporkan 2 auditor independen.)
- **Masalah:** File-lock `agent-registry.json.lock` dibuat `openSync(lockPath,'wx')` tanpa TTL/deteksi-basi. Bila sebuah wrapper crash/`kill -9` saat memegang lock, file lock tertinggal **selamanya**. Setiap heartbeat 5-detik di SETIAP wrapper lalu spin sinkron sampai 2 detik penuh (event loop terblokir → passthrough keyboard/render PTY membeku berkala, ~40% duty cycle) dan update registry di-skip diam-diam (`:429` hanya `log`). Dalam 30 detik semua bot tampak offline di `agent_list`/`pty_list_agents` sampai `.lock` dihapus manual.
- **Kenapa penting:** Satu crash di satu bot bisa melumpuhkan **visibilitas & interaktivitas seluruh fleet**, tanpa error, sampai intervensi manual yang tak jelas sumbernya. Busy-wait sinkron juga membekukan pengalaman ketik user secara periodik. Kombinasi "senyap + fleet-wide + butuh fix manual" = prioritas tinggi.
- **Fix:** (1) Deteksi lock basi: simpan `{pid, mtime}` di file lock; rebut bila lebih tua dari N detik atau PID-nya mati. (2) Ganti busy-wait dengan retry ter-jadwal (`await setTimeout`) — jadikan fungsi async, pemanggilnya sudah interval callback. Idealnya ambil ini dari modul bersama (lihat INFRA-1).
- **Verifikasi:** Test: lock dengan PID mati / mtime lama direbut. Manual: buat `.lock` yatim, pastikan heartbeat tetap jalan tanpa freeze.
- **Rilis:** bump pty-controller + `wrapper/package.json` (+ agent-bus bila registry.ts diubah).

### [ ] LOSS-3 — Race `fs.watch` vs sweep bisa double-inject command `[UNCERTAIN]`
- **File:** `plugins/pty-controller/wrapper/src/wrapper.ts:1218-1240` + `consumePending:990-1004`.
- **Masalah:** Handler `fs.watch` (defer 50ms) dan `sweepInterval` (2s) sama-sama memanggil `consumePending(f)` yang `readFileSync` lalu `rmSync`. Tak ada set "in-flight". Bila keduanya men-schedule untuk file sama nyaris bersamaan, keduanya bisa `readFileSync` sukses sebelum salah satu `rmSync` → file di-enqueue 2× → command diinjeksi dua kali. Untuk `/clear` ini merusak (dua barrier).
- **Kenapa penting:** README mengklaim delete-sebelum-dispatch mencegah dobel — tapi itu hanya mencegah dobel *setelah crash*, bukan balapan watch-vs-sweep. `/clear` ganda bisa mengacaukan state sesi. Belum direproduksi live (`[UNCERTAIN]`), tapi dampaknya berat bila terjadi dan guard-nya murah.
- **Fix:** `Set<string>` in-flight — `add` sebelum read, `delete` setelah selesai; skip bila sudah ada.
- **Verifikasi:** Test yang mensimulasikan dua pemicu untuk file sama → hanya satu injeksi.
- **Rilis:** bump pty-controller + `wrapper/package.json`.

### [ ] LOSS-4 — `messagesStore.append()` tidak ada → log session-change SELALU gagal ✓
- **File:** `plugins/telegram/server.ts:2038-2052` memanggil `messagesStore.append({...})`; interface `MessagesStore` di `messages-store.ts:71-87` hanya punya `logInbound/logOutbound/logEdit/getMessage/close`.
- **Masalah:** Bun menjalankan TS tanpa typecheck sehingga ini lolos ke runtime. Setiap event session-change (`/new`, `/switch`) melempar `messagesStore.append is not a function`, ditangkap catch → pesan transisi terkirim ke user tapi **tak pernah tercatat** di `messages.db` (jadi `get_message_by_id` tak menemukannya) + noise stderr tiap transisi. `metadata` juga dikirim sebagai string JSON, padahal API store mengharapkan objek.
- **Kenapa penting:** Logging adalah fondasi recall lintas-sesi (tujuan asli fitur T1.11). Lubang ini membuat seluruh kelas event (session-change) hilang dari riwayat secara permanen — persis momen yang berguna untuk "kemarin sesi ini jadi apa". Terverifikasi langsung: metode `append` memang tak ada.
- **Fix:** Ganti ke `messagesStore.logOutbound({ ts, chat_id, message_id: String(sent.message_id), source: 'system', text, metadata: { kind: 'session-change', ... } })` (objek, bukan string).
- **Verifikasi:** Test: event session-change menghasilkan satu baris di store dengan `source:'system'`. Cek `get_message_by_id` bisa menemukannya.
- **Rilis:** bump telegram.

### [ ] LOSS-5 — Token rusak senyap saat `.env` ber-CRLF
- **File:** `plugins/telegram/server.ts:76-79` — `split('\n')` + regex `^(\w+)=(.*)$` (`.` mencocokkan `\r`).
- **Masalah:** `.env` yang ditulis/diedit Notepad atau PowerShell `Out-File` (default CRLF) menghasilkan `TELEGRAM_BOT_TOKEN=123:ABC\r` → token bertrailing-CR → grammy 404 `Not Found` selamanya, dan pesan errornya tidak menunjuk penyebab.
- **Kenapa penting:** Mesin utama Windows. Gejala "bot diam total, 404" tanpa petunjuk CRLF membuang waktu debugging besar (sejalan dengan catatan CRLF-vs-bash yang sudah pernah menggigit). Fix satu baris.
- **Fix:** `split(/\r?\n/)` atau `.trim()` pada nilai. Sekalian selesaikan di seluruh repo lewat INFRA-3 (`.gitattributes`).
- **Verifikasi:** Test: `.env` dengan baris CRLF → token tanpa `\r`.
- **Rilis:** bump telegram.

### [ ] LOSS-6 — Setelah 8× 409 Conflict log "Exiting." tapi proses TIDAK exit
- **File:** `plugins/telegram/server.ts:2179-2185`.
- **Masalah:** `return` hanya keluar dari IIFE retry; proses tetap hidup memegang MCP. Tool outbound (`reply`) masih jalan, tapi inbound mati total. stderr mengklaim "Exiting."
- **Kenapa penting:** Zombie tuli. Operator/AI mengira proses berhenti; sesi tampak normal (tool jalan) tapi bot tak pernah menerima pesan lagi — kegagalan yang menyesatkan dan sulit didiagnosis.
- **Fix:** Panggil `shutdown()` lalu `process.exit(1)`; atau ubah pesan menjadi jujur ("polling stopped, tools still available") dan kirim notifikasi kegagalan.
- **Verifikasi:** Manual: dua poller token sama → yang kalah benar-benar exit (atau melaporkan status jujur).
- **Rilis:** bump telegram.

### [ ] LOSS-7 — Chunk `reply` yang sudah terkirim tak tercatat saat gagal di tengah
- **File:** `plugins/telegram/server.ts:799-857` — loop kirim (rethrow di `:799-804`, loop file `:808-821`) mendahului loop logging (`:825-857`).
- **Masalah:** Throw mana pun (chunk ke-N gagal, atau `sendPhoto/sendDocument` gagal setelah chunk teks sukses) melompat ke catch luar (`:953`) → N pesan yang sudah sampai di Telegram hilang dari store.
- **Kenapa penting:** Justru pada kasus error (yang paling ingin bisa di-audit), riwayat jadi bolong. `get_message_by_id` & recall meleset persis saat dibutuhkan.
- **Fix:** Log tiap pesan segera setelah `sendMessage/sendPhoto` sukses (di dalam loop), bukan ditunda ke akhir.
- **Rilis:** bump telegram.

### [ ] LOSS-8 — Heartbeat registry tidak self-healing
- **File:** `plugins/agent-bus/registry.ts:111-114` (`if (!e) return`) + `loadOrInit:72-83`; cermin `wrapper.ts:527-529`.
- **Masalah:** `loadOrInit` menyamakan "file korup" dengan "gagal baca transien" (mis. EPERM antivirus Windows) → return registry kosong. Jika itu terjadi saat sebuah bot `registerSelfInGlobalRegistry`, ia persist registry berisi dirinya saja → entri semua peer lain terhapus, dan heartbeat peer itu selamanya no-op (`if (!e) return`) → mereka hilang dari `agent_list` sampai wrapper masing-masing restart.
- **Kenapa penting:** Satu glitch baca transien bisa "menghapus" seluruh peer dari peta armada secara permanen sampai restart manual — lagi-lagi kegagalan senyap yang fleet-wide.
- **Fix:** Heartbeat harus **upsert** (re-register bila entri sendiri tak ditemukan), bukan menyerah. Bedakan "file korup" vs "gagal baca" (jangan reset ke kosong pada error baca). Idealnya via INFRA-1.
- **Verifikasi:** Test: heartbeat pada registry yang kehilangan entri sendiri → entri dibuat ulang, peer lain tak tersentuh.
- **Rilis:** bump agent-bus (+ pty-controller bila wrapper diubah).

### [ ] LOSS-9 — Takeover PID berdasar PID mentah (rawan PID-reuse Windows)
- **File:** `plugins/telegram/server.ts:112-120`.
- **Masalah:** `bot.pid` tertinggal setelah crash keras. Boot berikutnya `process.kill(stale,0)` hanya cek "ada proses dengan PID itu" lalu SIGTERM — di Windows PID cepat didaur ulang → bisa membunuh proses tak bersalah. Juga: instance kedua yang sah (dua sesi CC di project sama) selalu membunuh poller sesi pertama yang sehat tanpa notifikasi.
- **Kenapa penting:** Bisa membunuh proses acak (PID reuse) atau mematikan sesi lain secara diam-diam. Kombinasi berbahaya + membingungkan.
- **Fix:** Simpan `{pid, startedAt, argv}` di `bot.pid`; verifikasi identitas proses (umur/argv) sebelum SIGTERM.
- **Rilis:** bump telegram.

---

# P1 — Fungsional & UX rusak

### [ ] FUNC-1 — `/context` crash senyap saat `payload: null`
- **File:** `plugins/telegram/scripts/context-bridge.ts:31-35` (sengaja tulis `payload:null` saat stdin non-JSON, dikunci test) → `server.ts:1179-1186` (parse tanpa validasi) → `context-renderer.ts:97-101` (dereference `p.context_window` langsung).
- **Masalah:** `TypeError: null is not an object` ditelan `bot.catch`/`unhandledRejection` → user kirim `/context`, tak menerima apa pun, berulang sampai statusLine menulis payload valid.
- **Kenapa penting:** `/context` adalah command yang paling sering dipakai user dari HP. Gagal-senyap di dua kontrak modul yang saling bertentangan (writer sengaja tulis null, reader tak antisipasi null).
- **Fix:** Guard `if (!status?.payload) return '(no data yet)'` di `loadLastStatus`/`renderContextReply`.
- **Rilis:** bump telegram.

### [ ] FUNC-2 — Tabel markdown selalu gagal MarkdownV2
- **File:** `plugins/telegram/markdown.ts` (pemakai telegramify-markdown v1.3.3).
- **Masalah:** telegramify tidak escape `|` dan `-` di baris tabel: `commonMarkToMarkdownV2('| a | b |\n|---|---|')` → tetap `| a | b |` → Telegram tolak 400 "character '|' must be escaped". Di `reply`, tiap pesan bertabel memicu roundtrip-gagal + kirim ulang plain (format hilang senyap); di `edit_message` gagal total (lihat FUNC-10).
- **Kenapa penting:** AI **sering** menulis tabel. Setiap tabel = format hilang atau pesan gagal, tanpa peringatan. Ini juga alasan report audit ini dikirim per-pesan manual (chunking bisa memotong entity).
- **Fix:** Pre-process tabel di `markdown.ts` sebelum telegramify — ubah tabel jadi code block, atau escape `|`/`-` secara manual, atau render tabel jadi label-value list.
- **Verifikasi:** Test: input tabel → output MV2 valid (semua `|`/`-` ter-escape atau tabel dikonversi).
- **Rilis:** bump telegram + README.

### [ ] FUNC-3 — Stop-guard ternetralkan oleh ack
- **File:** `plugins/telegram/hooks/telegram-reply-guard.ts:56` — `if (a.latestReplyIdx > a.latestInboundIdx) return { block: false }`.
- **Masalah:** Reply APA PUN setelah inbound terakhir memuaskan guard — termasuk ack 1-baris yang justru DIWAJIBKAN skill immediate-reply sebelum tool call pertama. Akibatnya pada semua task ber-tool (mayoritas), guard tidak pernah menangkap kasus "ack lalu lupa jawaban final" — persis kasus yang diincar reminder turn.
- **Kenapa penting:** Guard ini dibuat untuk menjamin user AFK selalu dapat jawaban. Dengan pola ack-first (yang juga diwajibkan), guard jadi hampir selalu ter-satisfy oleh ack → efektif mati untuk kasus utamanya.
- **Fix:** Hitung reply yang terjadi **setelah aktivitas tool_use non-reply terakhir**; atau bandingkan timestamp reply terakhir vs assistant-turn terakhir. Ack di awal tidak boleh menghitung sebagai "jawaban final".
- **Verifikasi:** Test: transcript [inbound → ack → tool → stop tanpa reply final] → guard block.
- **Rilis:** bump telegram.

### [ ] FUNC-4 — commit-trailer-guard hanya mengawasi tool `Bash` ✓
- **File:** `plugins/bot-conduct/hooks/hooks.json:5` (`"matcher": "Bash"`) + `hooks/commit-trailer-guard.ts:36` (`if (input?.tool_name !== 'Bash') return`).
- **Masalah:** Armada jalan di Windows dengan **PowerShell sebagai shell primer**. `git commit` lewat tool PowerShell tidak pernah menyentuh hook → enforcement `Agent:` trailer bolong di jalur paling umum.
- **Kenapa penting:** `marketplace.json` mengiklankan hook ini sebagai jaminan mekanis ("cannot be quietly forgotten"). Faktanya jalur paling sering dipakai (PowerShell) melewatinya total — jaminan yang tidak berlaku. Terverifikasi: matcher memang hanya `"Bash"`.
- **Fix:** Matcher `Bash|PowerShell` (atau keduanya terdaftar) dan handle kedua `tool_name` di guard.
- **Verifikasi:** Test: input `tool_name:'PowerShell'` dengan `git commit -m` tanpa trailer → deny.
- **Rilis:** bump bot-conduct + README.

### [ ] FUNC-5 — commit-trailer-guard: banyak bypass + false-positive ✓ (terbukti live)
- **File:** `plugins/bot-conduct/hooks/commit-trailer-guard.ts:11-15`.
- **Masalah (bypass, lolos padahal harusnya dicek):** `git -C /repo commit -m "x"`, `git -c k=v commit -m "x"`, `git commit -am "x"` (`/-m\b/` tak match substring `-am`), `git commit --message="x"`, `-F file`. **Masalah (false-positive, di-deny padahal sah/tak relevan):** `grep -m 1 "git commit" log` di-deny (`-m` milik grep); trailer sah `git commit -m "fix" -m "Agent: bot-04"` dan `git commit --trailer "Agent: bot-04"` di-deny; baris `Agent:` di mana pun dalam command (heredoc file lain, komentar) memuaskan guard walau pesan commit tanpa trailer (M1). Terbukti live: hook produksi men-deny 2 perintah auditor.
- **Kenapa penting:** Guard sekaligus **bocor** (bentuk umum `-am`/`-C` lolos) **dan mengganggu** (memblokir perintah sah). Guard yang salah di dua arah lebih buruk dari tidak ada guard: memberi rasa aman palsu + friksi nyata.
- **Fix:** Tokenize perintah setelah token `commit`: izinkan opsi global (`-C`, `-c`, `--no-pager`) sebelum subcommand; kenali `-m|-am|-sm|--message|--message=|-F|--file|--trailer`; **ekstrak isi pesan commit** (arg `-m`/heredoc/`-F`) dan cek trailer terhadap ISI itu, bukan seluruh command string. Kenali `--trailer "Agent: …"` sebagai valid.
- **Verifikasi:** Test-suite kasus di atas (bypass → deny, false-positive → allow). Ini area yang wajib test dulu.
- **Rilis:** bump bot-conduct + README.

### [ ] FUNC-6 — daily-report gagal total di macOS/Linux
- **File:** `plugins/daily-report/commands/daily-report.md:22-24` (`if [[ -x "$CANDIDATE" ]]`) + `gather-context.sh` ter-commit mode `100644` (tanpa exec-bit).
- **Masalah:** Di checkout Unix, `-x` false untuk SEMUA kandidat walau file ada → "gather-context.sh not found". Ironis karena dijalankan via `bash "$CANDIDATE"` yang tak butuh exec-bit. Hanya jalan di Windows karena MSYS memalsu x-bit dari shebang.
- **Kenapa penting:** Plugin ini diklaim provider-agnostic & cross-platform, tapi mati total di dua dari tiga OS. Kalau fleet pernah pindah ke Linux/mac, `/daily-report` langsung rusak.
- **Fix:** Ganti `-x` → `-f`. Opsional: `git update-index --chmod=+x` pada script.
- **Rilis:** bump daily-report.

### [ ] FUNC-7 — gather-context.sh rapuh (portabilitas & anchor)
- **File:** `plugins/daily-report/skills/writing-daily-report/gather-context.sh:6,19,34,36,81`.
- **Masalah:** (a) `date -r FILE` GNU-only → mati senyap di BSD/macOS (`|| true` menelan → selalu jatuh ke jendela 24 jam). (b) Repo tanpa commit → `git rev-parse --abbrev-ref HEAD` exit 128 + `set -euo pipefail` → blob terpotong (hari pertama proyek = momen wajar untuk laporan pertama). (c) Anchor arsip pakai mtime (`ls -t`) bukan nama file → mengedit laporan lama menggeser rentang commit secara senyap.
- **Kenapa penting:** Sumber data laporan bisa salah/kosong tanpa peringatan → laporan yang salah atau kosong. Nama file sudah `YYYY-MM-DD.md`, jadi anchor by-name deterministik & gratis.
- **Fix:** (a) Baca tanggal dari NAMA file arsip, atau `git log -1 --format=%ci`. (b) `git rev-parse … 2>/dev/null || echo "(no commits yet)"`. (c) Pilih arsip by-name (`ls | sort | tail -1`), bukan mtime.
- **Rilis:** bump daily-report.

### [ ] FUNC-8 — `edit_message` tak punya fallback parse-entities & cek panjang
- **File:** `plugins/telegram/server.ts:902-935` vs `reply` `:784-796`.
- **Masalah:** `edit_message` mengonversi `format:'markdown'` lalu langsung `editMessageText` — tanpa fallback plain-text (yang dimiliki `reply`) dan tanpa cek 4096. Konten yang menghasilkan MV2 invalid (mis. tabel FUNC-2) membuat `edit_message` **gagal keras** dengan error tool, sementara `reply` untuk teks sama terdegradasi mulus.
- **Kenapa penting:** Inkonsistensi perilaku antara dua tool serupa; `edit_message` jadi jebakan. (Lihat juga CONS-2 — mungkin `edit_message` malah perlu di-resolve nasibnya.)
- **Fix:** Ekstrak fallback parse-entities `reply` jadi helper, pakai di kedua jalur.
- **Rilis:** bump telegram.

### [ ] FUNC-9 — Copy user-facing menyebut perintah `/archive` yang tak ada
- **File:** `plugins/telegram/meta-commands.ts:625,630,1097-1098,1131,1161`; help `/delete` di `commands-registry.ts:79`.
- **Masalah:** Router tidak punya cabang `/archive` (penamaan historis; sekarang soft-delete = `/delete`). User yang menurut mengetik `/archive` malah mengirim teks itu ke AI sebagai chat biasa.
- **Kenapa penting:** Menyesatkan user ke command yang tak ada. Kecil tapi bikin bingung.
- **Fix:** Ganti semua copy user-facing ke `/delete` (varian soft). Sekalian eksekusi rename internal `handleArchive` yang sudah ditandai "future rename pass".
- **Rilis:** bump telegram.

### [ ] FUNC-10 (LOW) — Kumpulan bug kecil telegram
Kerjakan sebagai satu commit "polish" atau pisah:
- `meta-commands.ts:823-827` — headline paginasi `/switch` kehilangan nama sesi aktif (selalu fallback `session ab12cd34`) karena mencari di list yang sudah menyaring sesi aktif keluar.
- `meta-commands.ts:281-284` — `/delete hard` bisa lapor "deleted" walau jsonl tak pernah ada (`rmSync force` menelan ENOENT).
- `paginated-picker.ts:51` — `trimLabel` bisa membelah surrogate pair (emoji) → string UTF-16 ill-formed → request Telegram bisa ditolak. Fix: `Array.from(s).slice(0,59).join('')`.
- `context-renderer.ts:28-30` — `formatTokens(999_999)` → `"1000.0k"`. Fix: cek hasil pembagian.
- `server.ts:428-430` — cabang `text_mention` di `isMentioned` efektif mati (syarat `username` untuk tipe yang justru tanpa username).
- `sessions-list.ts:161-167` vs `meta-commands.ts:593-595` — klaim deteksi kolisi shortId 8-hex tak diimplementasikan (`.set` menimpa senyap) → tap picker bisa mengarah ke sesi salah (pada delete = hapus salah sesi). Guard-nya satu baris.
- `server.ts:450-472` — `checkApprovals` tanpa guard in-flight → "Paired!" bisa terkirim ganda; entri direktori bikin `rmSync` loop error tiap 5s.
- `server.ts:1473-1580` — jenis pesan tak tertangani (location/contact/poll/dice) di-drop tanpa ack; album video tak di-buffer (tiap item notifikasi terpisah, tak konsisten dg foto/dokumen).
- `server.ts:747-756` — chunk-lalu-konversi bisa membelah fenced code block → sisa teks ter-render sebagai kode (salah render senyap pada pesan >~2KB berisi code block).
- **Rilis:** bump telegram + README bila perlu.

---

# P2 — Konsistensi versi

### [ ] VER-1 — Versi MCP server hardcoded di 3 plugin + wrapper beku ✓
- **File:** `plugins/telegram/server.ts:503` (`version:'1.0.0'`, plugin 0.0.36), `plugins/pty-controller/server.ts:59` (`'0.0.1'`, plugin 0.0.30), `plugins/agent-bus/server.ts:49` (`'0.0.4'`, plugin 0.0.13 — salah 9 rilis), `plugins/pty-controller/wrapper/package.json:3` (beku `0.0.7` vs plugin 0.0.30).
- **Masalah:** Versi yang dilaporkan ke klien MCP salah; kontras dengan klaim README "nothing hardcoded". Wrapper beku 0.0.7 mengaburkan apakah wrapper benar-benar diperbarui (gating batch `>= 0.0.7` lolos pas-pasan; fix wrapper mendatang yang lupa bump tak terdeteksi).
- **Kenapa penting:** Versi adalah satu-satunya sinyal "kode mana yang jalan" di sistem yang punya masalah cache-stale terkenal (lihat CLAUDE.md). Versi bohong = diagnosa salah.
- **Fix:** Baca versi dari `.claude-plugin/plugin.json` saat boot (pola `readPluginVersion(import.meta.dir)` sudah ada di telegram — tiru ke pty-controller & agent-bus). Naikkan `wrapper/package.json` seiring perubahan wrapper.
- **Rilis:** bump ketiga plugin.

### [ ] VER-2 — Tidak ada test yang mengunci `package.json` ↔ `plugin.json`
- **Masalah:** Drift versi baru lolos senyap (`plugin-version.test.ts` hanya fixture). Sudah terjadi (telegram package vs plugin pernah beda di masa lalu).
- **Kenapa penting:** CLAUDE.md menegaskan `plugin.json` adalah sumber versi yang menentukan cache; drift diam = bot menjalankan kode stale.
- **Fix:** Test lintas-plugin: untuk tiap plugin, `plugin.json.version === package.json.version` (bila package.json ada).
- **Rilis:** tanpa bump (test saja).

---

# P2 — Konsolidasi plugin (permintaan eksplisit user)

### [ ] CONS-1 — Merge `immediate-reply` + `inline-buttons` → satu plugin `reply-discipline`
- **File:** `plugins/immediate-reply/`, `plugins/inline-buttons/`, `plugins/telegram/hooks/telegram-turn-reminder.ts:21-27`.
- **Masalah:** Keduanya "disiplin balasan Telegram", saling mereferensikan (bahkan punya bagian "Pairs With…"), DAN sejak telegram 0.0.36 intisari keduanya disuntik ulang tiap turn oleh hook. Jadi ada **3 sumber tumpang-tindih** untuk perilaku sama: 2 SKILL description (selalu di system prompt) + hook per-turn. Auditor mengukur: hook menambah **541 byte (~135-170 token) per turn Telegram**, kumulatif **5-7k token per 40 inbound**, verbatim-redundan dengan SKILL.
- **Kenapa penting:** Konteks yang terbuang tiap turn + tiga tempat untuk memelihara satu aturan = biaya token nyata & risiko drift. Menyatukan menyederhanakan mental-model AI (satu skill "cara membalas di Telegram") dan memangkas redundansi.
- **Fix (usulan):** Buat plugin `reply-discipline` dengan satu SKILL.md bergabung (pre-flight ack + self-audit buttons, urutan eksekusi jelas). Pangkas `telegram-turn-reminder` jadi **1-baris pointer** (~90 byte): "obligations: ack-before-tools, buttons-on-question, reply-mandatory — lihat skill reply-discipline". Deprecate dua plugin lama (atau jadikan alias). Perbarui `marketplace.json`, README root, dependency note di plugin lain.
- **Catatan:** Ini perubahan struktur — konfirmasi arah dengan user sebelum eksekusi (nama plugin, apakah hapus vs alias plugin lama). Skill `superpowers:brainstorming` cocok untuk mematangkan desainnya.
- **Rilis:** plugin baru + deprecate lama + README root + marketplace.json.

### [ ] CONS-2 — Putuskan nasib tool `edit_message`
- **File:** `plugins/telegram/server.ts:656,902`; larangan di `immediate-reply/SKILL.md`; pemakaian masih disebut di `inline-buttons/SKILL.md`.
- **Masalah:** immediate-reply melarang total ("never edit_message"), tapi tool masih tereskpos, masih direkomendasikan instruksi MCP server, dan inline-buttons masih menyebut "reply atau edit_message". Setengah-dilarang setengah-didokumentasikan = kontradiksi yang membingungkan AI.
- **Kenapa penting:** Instruksi yang saling bertentangan membuat perilaku tak terprediksi. Perlu satu keputusan tegas.
- **Fix (pilih satu):** (a) **Eliminate** dari permukaan MCP bila memang tak dipakai (hapus tool + bersihkan semua referensi skill/README); atau (b) **Pertahankan** dengan use-case sempit terdokumentasi (mis. progress-update panjang) dan singkirkan larangan mutlak di immediate-reply + tambah fallback FUNC-8.
- **Catatan:** Keputusan produk — konfirmasi dengan user.
- **Rilis:** bump telegram + immediate-reply + inline-buttons (mana pun yang tersentuh).

### [ ] CONS-3 — Overlap `pty_list_agents` vs `agent_list`
- **File:** `plugins/pty-controller/ipc.ts:124` & `server.ts:98,227` vs `plugins/agent-bus/registry.ts:42`. ✓ keduanya baca `~/.claude/agent-registry.json`.
- **Masalah:** Dua tool MCP menjawab pertanyaan yang sama ("peer mana online"). Redundansi permukaan.
- **Kenapa penting:** Dua tool untuk satu fungsi = kebingungan "pakai yang mana" + dua tempat pemeliharaan. agent-bus sudah punya `agent_status` yang lebih kaya.
- **Fix (usulan):** Jadikan agent-bus satu-satunya permukaan peer-discovery untuk AI; `pty_list_agents` disederhanakan jadi debug-only wrapper atau dihapus. Minimal: samakan semantik & dokumentasikan pembagian peran di kedua README.
- **Catatan:** Cek dulu apakah ada skill/dokumen yang menyuruh pakai `pty_list_agents` sebelum menghapus.
- **Rilis:** bump pty-controller (+ agent-bus bila berubah) + README.

### [ ] CONS-4 — `agent-bus/registry.ts` writer functions adalah dead code
- **File:** `plugins/agent-bus/registry.ts:92-131` (`registerAgent/updateHeartbeat/unregisterAgent`) vs penulis nyata `plugins/pty-controller/wrapper/src/wrapper.ts:412-550`.
- **Masalah:** Fungsi writer di registry.ts hanya diimpor test-nya sendiri; penulis produksi adalah salinan independen di wrapper.ts yang **sudah drift** (wrapper punya retry EPERM Windows + cek `wrapper_pid`; registry.ts throw saat lock-timeout, wrapper skip). Perbaikan bug di registry.ts (mis. LOSS-2/LOSS-8) **tidak berefek ke produksi**.
- **Kenapa penting:** Jebakan pemeliharaan: bot berikutnya bisa "memperbaiki" registry.ts dan mengira produksi ikut terbaik, padahal tidak. Ini akar dari beberapa temuan.
- **Fix:** Jadikan wrapper **mengimpor** registry.ts (via INFRA-1), ATAU tandai registry.ts eksplisit sebagai spec/test-double (docstring + nama file) dan sinkronkan.
- **Rilis:** bump agent-bus + pty-controller.

### [ ] CONS-5 — Hapus shell script mati ✓
- **File:** `plugins/telegram/scripts/resolve-state-dir.sh` + `.test.sh`, `plugins/telegram/scripts/gitignore-handler.sh` + `.test.sh`.
- **Masalah:** ✓ Tak ada konsumen produksi (grep repo: hanya test yang men-source). Pola resolusi state-dir ada 4 salinan (state-path.ts, kedua .sh, blok inline di SKILL access/configure); pola gitignore 3 salinan.
- **Kenapa penting:** Kode mati = sumber drift & kebingungan pembaca baru ("mana yang dipakai?").
- **Fix:** Hapus kedua `.sh` + test-nya, ATAU sambungkan (SKILL.md memanggil script alih-alih blok inline). Konsolidasikan pola gitignore ke satu sumber (`channels-gitignore.ts`).
- **Rilis:** bump telegram.

### [ ] CONS-6 — Deskripsi frontmatter bot-conduct tak menyebut Rule 6 + hook
- **File:** `plugins/bot-conduct/skills/bot-conduct/SKILL.md:3` (description); `README.md:3` klaim "no hook".
- **Masalah:** Description (sinyal trigger skill) hanya merangkum Rule 1-4; **Rule 6 (three-copy git doctrine — paling kritis operasional) tak disebut** → sesi yang akan commit di `~/.claude/plugins/` belum tentu memuat skill ini. README menyangkal keberadaan hook padahal plugin mengirim PreToolUse hook aktif yang men-deny.
- **Kenapa penting:** Rule 6 mencegah insiden kehilangan 25 commit (2026-06-07). Kalau trigger-nya tak mencakup skenario commit-di-tempat-salah, proteksinya tak ter-load saat paling dibutuhkan. README yang menyangkal hook menyulitkan debugging "kenapa git-ku di-deny".
- **Fix:** Tambah frasa "git discipline / three-copy doctrine" & "PreToolUse commit-trailer hook" ke description. Sebut hook di README + plugin.json. Tambah kalimat di SKILL.md bahwa Rule 2 di-enforce hook.
- **Rilis:** bump bot-conduct + README.

---

# P2 — Infrastruktur bersama (introduce)

### [ ] INFRA-1 — Modul internal `@mirza/agent-registry`
- **Masalah:** Logika load/persist/lock/heartbeat registry ada 3 salinan (agent-bus/registry.ts [dead], wrapper.ts [produksi], + pembaca telegram) yang sudah divergen.
- **Kenapa penting:** Menyelesaikan **LOSS-2 (stale-lock), LOSS-8 (self-heal), CONS-4 (dead code)** sekaligus di satu tempat, dan menghentikan drift 3-salinan permanen. Ini fix berdampak tertinggi per-usaha.
- **Fix:** Satu modul di-vendor ke wrapper + agent-bus: `acquireLock` dengan stale-breaking (PID+mtime), `persist` tanpa busy-wait (async setTimeout), `heartbeat` upsert. Pembaca telegram ikut memakainya bila relevan. Tambah test kontrak lintas-plugin.
- **Catatan:** Perubahan besar — kerjakan dengan plan (spec di `docs/superpowers/`). Konfirmasi dengan user.
- **Rilis:** bump pty-controller + agent-bus + wrapper.

### [ ] INFRA-2 — Util `atomicWrite(path, data, {retries})`
- **File:** pola tmp+rename tersebar di `ipc.ts:60,81`, `wrapper.ts:162,176,320,639`, `session-state.ts:44`, `telegram/*`.
- **Masalah:** ≥6 salinan dengan penanganan error berbeda; hanya `persistRegistry` retry EPERM/EBUSY Windows, sisanya (`writeSystemOutbox`, `writeSessionState`, dll) tidak — padahal sama rawan antivirus Windows.
- **Kenapa penting:** Ketahanan tulis-file tidak seragam → sebagian jalur bisa gagal senyap di Windows. Satu util = ketahanan konsisten.
- **Fix:** Satu helper dengan retry, dipakai semua penulis state.
- **Rilis:** bump plugin yang tersentuh.

### [ ] INFRA-3 — `.gitattributes` `* text=auto eol=lf` ✓ (belum ada)
- **File:** root repo (`.gitattributes` tidak ada — terverifikasi).
- **Masalah:** Setiap commit dari Windows memicu warning CRLF; `.env` & shell script bisa ter-checkout CRLF → LOSS-5 (token rusak) & FUNC-6/7 (bash mati di CRLF).
- **Kenapa penting:** Satu file menyelesaikan kelas bug CRLF senyap lintas repo (sejalan catatan CRLF-vs-bash). Murah, berdampak luas.
- **Fix:** Tambah `.gitattributes`: `* text=auto eol=lf` + pin eksplisit `*.sh text eol=lf`, `*.ts text eol=lf`, `*.md text eol=lf`. Renormalisasi (`git add --renormalize .`).
- **Rilis:** tanpa bump plugin (root-level).

### [ ] INFRA-4 — `readPluginVersion()` seragam (lihat VER-1)
Konsolidasi pembacaan versi ke satu util; hentikan semua hardcode. (Digabung dengan VER-1.)

### [ ] INFRA-5 — Reader `wrapper.state.json` bersama
- **File:** `plugins/telegram/current-session-info.ts:34-68` (masih baca file legacy `wrapper.current_session_id/_name`) vs `plugins/agent-bus/peer-status.ts:46-61` (sudah `wrapper.state.json` otoritatif + staleness).
- **Masalah:** Dua implementasi untuk pertanyaan sama ("sesi live apa, namanya apa") → bisa beri jawaban berbeda untuk bot sama; tiap fix dua kali (sudah drift).
- **Kenapa penting:** Sumber kebenaran ganda → `/context` (telegram) & `agent_status` (agent-bus) bisa tak sepakat tentang sesi bot yang sama.
- **Fix:** Ekstrak reader `wrapper.state.json` bersama (mis. di modul `pty-state`), pakai di kedua sisi.
- **Rilis:** bump telegram (+ agent-bus bila berubah).

### [ ] INFRA-6 — Retensi/pruning file yang tumbuh tanpa batas
- **File:** `messages.db` (tanpa retensi), `plugins/telegram` `inbox/` (unduhan tak dibersihkan, `server.ts:885`), wrapper `pending/` + `.tmp.<pid>` yatim (`prompt-compose.ts:99`).
- **Masalah:** Semua tumbuh permanen. `.tmp.` yatim (crash pengirim antara write & rename) tak pernah di-GC. Pending basi di-burst-inject saat wrapper restart.
- **Kenapa penting:** Pada bot personal jangka panjang, disk & performa DB pelan-pelan memburuk; pending basi bisa menyebabkan injeksi tak-diinginkan pasca-restart.
- **Fix:** Kebijakan retensi saat boot: `messages.db` `DELETE WHERE ts < now-180d` (atau VACUUM bulanan); sweep `inbox/` by umur/ukuran; `consumePending` skip/hapus file `ts` > 60s; sweep wrapper hapus `.tmp.` > beberapa menit.
- **Rilis:** bump telegram + pty-controller.

---

# P3 — Ide fitur baru (butuh brainstorming sebelum eksekusi)

Ini bukan bug — ini arah pengembangan. **Jangan langsung implementasi**; matangkan dengan user + skill `superpowers:brainstorming` dulu. Diurut dari yang paling sinergis dengan temuan di atas.

### [ ] IDEA-1 — `/doctor` self-diagnostic (nilai tertinggi)
- **Motivasi:** Sistem ini penuh mode-gagal-senyap (LOSS-1..9, VER-1). Sebuah command/tool `/doctor` yang mengecek dalam satu tempat: poller alive? wrapper heartbeat fresh (<30s)? registry `.lock` stale? token valid (`getMe`)? `messages.db` writable? `encodeProjectDir` cocok dengan folder CC nyata? versi cache vs workspace? → langsung menangkap kelas bug yang baru ditemukan, dan bernilai selamanya sebagai first-line triage.
- **Kenapa ini dulu:** ROI tertinggi — mengubah kegagalan senyap jadi diagnosa satu-perintah.

### [ ] IDEA-2 — ACK loop untuk `pty_send_slash` / `agent_send`
- **Motivasi:** Saat ini fire-and-forget; AI tak pernah tahu command benar-benar diinjeksi (komentar `ipc.ts:18` menyebut "ack file (future)" yang tak pernah ada). File ack per-id (echo dari wrapper) membuat injeksi bisa di-poll & error muncul ke user, bukan hilang di log wrapper. Menutup banyak kegagalan senyap sekaligus.

### [ ] IDEA-3 — `search_messages` MCP tool
- **Motivasi:** Recall lintas-sesi ("kemarin kita bahas X, lanjutkan"). Fondasi SQLite sudah ada (T1.11), tinggal FTS5. Ini tujuan asli logging yang di-defer.

### [ ] IDEA-4 — Voice inbound
- **Motivasi:** Interface HP-first; voice note → Claude transcribe sendiri (Option B backlog, tanpa API key tambahan). Saat ini `message:voice` di-drop senyap.

### [ ] IDEA-5 — Per-channel lightweight state (T2.1)
- **Motivasi:** timezone/nickname/bahasa hint di-inject ke `<channel>` tag → personalisasi tanpa AI bertanya tiap kali. Bounded (hint kontekstual, bukan memory store).

### [ ] IDEA-6 — Document/PDF inbound (T1.2)
- **Motivasi:** Pola handler foto (`image_path`) sudah jadi template, tinggal duplikat untuk `message:document`. Perluas modalitas murah.

### [ ] IDEA-7 — Reaction inbound (T1.9)
- **Motivasi:** Forward reaksi user ke bot sebagai sinyal feedback non-verbal (konfirmasi tanpa mengetik).

---

## Ringkasan prioritas

- **P0 keamanan:** SEC-1, SEC-2, SEC-3 (SEC-4 low).
- **P0 data-loss:** LOSS-1, LOSS-2, LOSS-4 (verified), LOSS-3; lalu LOSS-5..9.
- **P1 fungsional:** FUNC-1, FUNC-2, FUNC-4, FUNC-5, FUNC-6 (semua berdampak user/enforcement); lalu FUNC-3,7,8,9,10.
- **P2:** VER-1/2, konsolidasi CONS-1..6, infra INFRA-1..6.
- **P3:** ide IDEA-1..7 (brainstorm dulu).

**Rekomendasi urutan pragmatis:** INFRA-3 (`.gitattributes`, 5 menit, lintas-bug) → LOSS-4 & FUNC-1 (verified, satu baris, high-impact) → SEC-1/2/3 → FUNC-4/5 (guard) → INFRA-1 (menyelesaikan LOSS-2/8 + CONS-4) → sisanya. Konsolidasi (CONS-1..3) & ide (P3) tahan sampai user konfirmasi arah.

## Sumber & catatan integritas

Temuan ✓ di-spot-check langsung terhadap kode saat audit ini: LOSS-1 (encodeProjectDir vs binary CC v2.1.198), LOSS-4 (append tak ada), VER-1 (versi hardcoded), FUNC-4 (matcher Bash), FUNC-5 (bypass/false-positive live), CONS-3 (overlap registry), CONS-5 (dead scripts), INFRA-3 (no .gitattributes), CONS-2 (edit_message masih tereskpos). Sisanya dari 4 subagent auditor yang membaca source penuh + menjalankan test; konfirmasi ulang sebelum fix besar, terutama `[UNCERTAIN]` (LOSS-3).

---

# Arah arsitektur target — keputusan diskusi 2026-07-02 (Mirza × Fable 5, sesi `harness-redesign` @ bot-02)

> Bagian ini ditambahkan setelah backlog di atas ditulis, dari diskusi arsitektur menyeluruh (4 subagent membedah seluruh source + docs). **Backlog di atas TETAP BERLAKU** sebagai perbaikan taktis pada sistem yang berjalan. Bagian ini menetapkan ARAH jangka panjang supaya setiap fix dikerjakan dengan bentuk akhir yang sama. Bila ragu bentuk sebuah fix, rujuk ke sini.

## Konstrain yang mengikat (keputusan user — JANGAN dilanggar)

- **Tidak memakai Claude Agent SDK / `claude -p` sama sekali.** Alasan: ketidakpastian billing — email Anthropic 14 Mei 2026 mengumumkan usage Agent SDK/`claude -p` (termasuk aplikasi pihak ketiga di atas SDK) akan pindah ke kredit bulanan $100 terpisah efektif 15 Juni; email 16 Juni 2026 menangguhkan rencana itu ("we're not making this change today… we'll share it with advance notice"). Satu-satunya permukaan yang PASTI tetap dihitung sebagai penggunaan subscription = **penggunaan interaktif Claude Code (TUI)**. PTY wrapper (`mirza-cc`) dengan demikian adalah keputusan billing yang rasional dan **DIPERTAHANKAN** — jangan usulkan lagi migrasi ke SDK selama kebijakan belum final.
- **Prinsip lama yang dipertahankan:** AI decides, machine executes; neighbor autonomy (prompt-only antar bot, keputusan 2026-06-07); state per-project; handoff via file markdown chain.

## Prinsip pengganti

**"PTY untuk input; hooks untuk output."** Keystroke injection hanya untuk kontrol masuk (slash lifecycle). Kebenaran tentang sesi TIDAK PERNAH lagi di-scrape/ditebak dari luar (polling jsonl, meniru encoding internal CC, timing empiris) — ia dilaporkan dari DALAM Claude Code lewat hooks: SessionStart/SessionEnd/Stop berjalan penuh di mode interaktif dan tahu `session_id` resmi. Jangan pernah menebak apa yang bisa dilaporkan CC sendiri dari dalam.

## Tujuh poin arsitektur target

1. **PTY tetap; scraping mati.** SessionStart hook menulis state sesi (id/nama/lifecycle) ke tempat otoritatif → wrapper berhenti polling folder jsonl dan berhenti meniru `encodeProjectDir` (menghapus AKAR LOSS-1). Clear-barrier 10-menit diganti event deterministik: `/clear` diinjeksi → SessionStart sesi baru mengumumkan dirinya. Injeksi jadi ber-ACK: keystroke → konfirmasi dari dalam CC → baru dianggap terkirim (IDEA-2 terpenuhi struktural).
2. **Satu daemon supervisor per mesin** menampung & mengawasi 6 wrapper PTY sebagai child process: restart otomatis, health nyata, registry in-memory milik daemon (menggantikan `agent-registry.json` + lockfile → akar LOSS-2/LOSS-8 hilang). Wrapper menyusut jadi pemegang PTY tipis yang dikendalikan daemon.
3. **Message bus ber-ACK** (in-process di daemon; antar proses via named pipe/socket lokal): idempotency key, antrean offline yang terlihat, dead-letter. Prompt antar-bot masuk ke sesi CC lewat **MCP channel notification** (jalur yang sudah terbukti dipakai pesan Telegram → `<channel>` turn) — BUKAN diketik ke PTY; chunking 100-char & masalah ConPTY input-buffer hilang. Keystroke tersisa hanya untuk slash lifecycle.
4. **Satu SQLite (WAL) untuk semua state:** sesi/nama/lifecycle, registry, message log, goal, handoff — menggantikan ~10 file JSON tersebar + ≥6 varian tmp+rename hand-rolled. Transaksi menggantikan lockfile; `/context` (telegram) vs `agent_status` (agent-bus) tak bisa lagi beda pendapat tentang bot yang sama.
5. **Channel = adapter hexagonal.** Telegram adapter hanya menerjemahkan update ↔ bus. `server.ts` 2195-baris pecah natural jadi gateway (grammy) / router / state; menambah channel baru (WhatsApp/Discord/web) = menulis adapter baru saja. Kode grammy handling, chunking, access-control yang sudah well-tested DIANGKUT, bukan ditulis ulang.
6. **Invarian protokol pindah dari teks skill ke kode.** Saat ini hanya 1 dari 9 plugin behavioral yang punya hook mekanis; sisanya "dimohon" via SKILL.md dan lapse model = protokol bocor senyap. Target: reply-guard yang benar-benar memverifikasi jawaban substantif (memperbaiki FUNC-3 secara struktural), state machine handoff/goal dijalankan mesin (ACK-before-reset, confirmation gate), AI hanya mengisi konten. Hooks CC adalah mekanisme enforcement yang tersedia penuh di mode interaktif.
7. **Monorepo packages** (`@harness/bus`, `/state`, `/registry`, `/telegram`): satu implementasi per konsep, skema Zod di tiap boundary — mengakhiri konvensi yang tertriplikasi (state machine nama sesi di 3 tempat; registry writer yang drift dari dead code-nya, CONS-4). Permukaan plugin CC dikecilkan jadi **satu stub tipis yang stabil** (MCP bridge + hooks, jarang berubah); semua logika hidup di daemon yang deploy-nya `git pull` + restart → frekuensi terkena checklist rilis 5-poin & masalah 3-copy turun drastis (tidak hilang total — stub tetap plugin).

## Dampak ke item backlog di atas

- **Tetap berlaku tanpa perubahan:** semua SEC, LOSS-3/5/6/7/9, semua FUNC kecuali catatan FUNC-3 di bawah, VER-1/2, CONS-2/5/6, INFRA-3.
- **Tetap dikerjakan, dengan bentuk akhir baru:**
  - **LOSS-1:** fix taktis (samakan encoding + truncation) sah untuk sistem berjalan, tapi fix durable = poin 1 — SessionStart hook melaporkan `session_id`, wrapper tak perlu tahu encoding CC sama sekali. Jangan investasi berlebihan di penebak encoding.
  - **LOSS-2 / LOSS-8 / CONS-4 / INFRA-1:** INFRA-1 (paket registry bersama) tetap langkah pertama yang benar DAN sekaligus fase 1 strangler; end-state-nya registry pindah ke daemon (poin 2) / SQLite (poin 4).
  - **INFRA-2 / INFRA-5 / INFRA-6:** kerjakan versi murahnya sekarang; menjadi obsolet saat poin 4 selesai — jangan bangun berlebihan.
  - **FUNC-3 + CONS-1:** desain merger `reply-discipline` harus mengikuti poin 6 — hook yang meng-enforce (verifikasi reply substantif setelah tool-use terakhir), skill menipis jadi konten/gaya. Dua item ini satu paket desain.
  - **CONS-3:** end-state = daemon/bus jadi satu-satunya permukaan peer-discovery.
  - **IDEA-1 (`/doctor`):** makin penting — jadikan alat verifikasi kesehatan SELAMA migrasi (cek per fase: hook menulis state? ACK jalan? shim kompatibel?).
  - **IDEA-2:** terpenuhi struktural oleh poin 1+3; bila dikerjakan taktis duluan, buat seminimal mungkin (ack-file per id) karena akan diganti.
  - **IDEA-3 (`search_messages`):** gabungkan dengan poin 4 — FTS5 di atas SQLite terkonsolidasi, bukan fitur tempelan di `messages.db` lama.

## Jalur migrasi (strangler — BUKAN big-bang)

1. **Fase 1 — shared packages + konsolidasi state:** INFRA-3, INFRA-1/2, mulai poin 4 & 7. Membunuh separuh kelas bug LOSS tanpa menyentuh arsitektur proses.
2. **Fase 2 — satu bot pilot** pindah ke daemon + hook-inversion (poin 1/2/3/6) dengan **shim kompatibilitas** ke format file lama, supaya fleet campuran (pilot + 5 bot lama) tetap saling melihat.
3. **Fase 3 — migrasi fleet penuh:** pensiunkan polling jsonl, lockfile, file JSON tersebar; hapus shim.

**Status:** arah disetujui user 2026-07-02. Design doc terperinci (diagram, skema modul, kontrak shim) menyusul SEBELUM eksekusi fase mana pun; fase 2/3 wajib spec + plan (superpowers) dan konfirmasi user per fase.
