# Capability Inventory — Plugin `telegram`

Tanggal: 2026-07-02. Sumber: `plugins/telegram/` versi **0.0.36-mirza.0** (dari `.claude-plugin/plugin.json`). Dokumen ini adalah **acceptance checklist** untuk rewrite harness: sebuah fitur baru dianggap "migrated" hanya jika item perilakunya tercentang dan terverifikasi pada harness baru. Setiap item adalah perilaku yang dapat diuji, diturunkan langsung dari kode (bukan asumsi). Semua path relatif terhadap `plugins/telegram/`.

## 1. Perintah bot native (/start /help /context /version)

- [ ] **TG-001** Perintah native hanya dilayani di chat `private`; di group/supergroup perintah di-drop diam-diam (tanpa balasan apa pun) — `server.ts:408`
- [ ] **TG-002** Gating perintah native: `dmPolicy:"disabled"` → drop; `dmPolicy:"allowlist"` dan sender tidak ada di `allowFrom` → drop; mode `pairing` mengizinkan sender yang belum paired menjalankan perintah — `server.ts:415`
- [ ] **TG-003** Setiap eksekusi command gate juga memangkas pending pairing codes yang kedaluwarsa dan mem-persist hasilnya ke `access.json` — `server.ts:413`
- [ ] **TG-004** `/start` untuk sender yang belum paired membalas instruksi pairing: DM apa pun → dapat kode 6 karakter → jalankan `/telegram:access pair <code>` di Claude Code — `server.ts:1016`
- [ ] **TG-005** `/start` untuk sender paired membalas identitas: `Paired as: @username|id`, `Project: <CLAUDE_PROJECT_DIR|(no project)>`, baris `Session: <name> (<8-hex>)` / `Session: <8-hex>` / `Session: (none active)`, plus ajakan `/help` — `server.ts:1029`
- [ ] **TG-006** `/help` tanpa argumen memilih audience dari status pairing sender: `paired` jika di `allowFrom`, selain itu `default` — daftar perintah konsisten dengan slash-menu per-chat — `server.ts:1050`
- [ ] **TG-007** Render `/help` tanpa argumen: intro bridging + blok `Available commands:` berisi `/name — helpSummary` per perintah (urutan registry) + `Type /help <command> for detail.` + tail troubleshooting — `commands-registry.ts:169`
- [ ] **TG-008** `/help <name>` menampilkan `/<name> — <helpSummary>\n\n<helpDetail>`; argumen toleran leading slash dan case; audience-agnostik (perintah di luar menu audience tetap dijelaskan) — `commands-registry.ts:186`
- [ ] **TG-009** `/help <unknown>` membalas `Unknown command: /<arg>` + petunjuk `/help` — `server.ts:1066`
- [ ] **TG-010** `/context` memicu instalasi context-bridge bila belum terpasang; kegagalan instalasi dibalas `Failed to install bridge:\n<message>` — `server.ts:1074`
- [ ] **TG-011** `/context` pada instalasi baru mengirim ack `⏳ Installing bridge, please wait...`, lalu setelah 5 detik meng-edit pesan tersebut menjadi hasil render; jika edit gagal, fallback kirim reply baru — `server.ts:1093`
- [ ] **TG-012** `/context` ketika bridge terpasang tapi `last-status.json` belum ada membalas "Bridge installed, but no data yet." + instruksi aktif di Claude Code lalu ulangi — `server.ts:1081`
- [ ] **TG-013** `/context` normal me-render `renderContextReply(lastStatus, now, {sessionName})` dengan sessionName di-resolve dari `wrapper.current_session_id` → registry nama — `server.ts:1087`
- [ ] **TG-014** `/version` membalas blok multi-entry: telegram plugin (`Plugin: <name>\nv<version> (<sha>)`), `Plugin: pty-controller` + `Wrapper: mirza-cc` (dari `<project>/.claude/channels/pty-controller/wrapper.version`), `Plugin: agent-bus` (dari `installed_plugins.json`); entry yang sumbernya hilang di-drop diam-diam, entry telegram selalu ada — `server.ts:1161`
- [ ] **TG-015** Resolusi versi plugin sendiri: `.claude-plugin/plugin.json` primer, fallback `package.json`, git sha pendek via `git rev-parse --short HEAD` (timeout 1s, gagal → sha null tanpa error) — `plugin-version.ts:46`
- [ ] **TG-016** Resolusi versi plugin sibling (`readInstalledPluginVersion`): match key `<name>` atau `<name>@<marketplace>`; prioritas `plugin.json` di `installPath`; field `version` registry hanya dipakai jika semver-ish (bukan git sha); tidak resolve → null (baris di-omit) — `plugin-version.ts:105`

## 2. Meta-commands (intersep sebelum relay ke AI)

- [ ] **TG-017** Router meta-command mencocokkan nama command lowercase + trimmed (argumen mempertahankan case); command yang dikenali SELALU dikonsumsi (return true) — termasuk saat error/wrapper mati, dibalas penjelasan, tidak pernah diteruskan ke AI sebagai teks — `meta-commands.ts:305`
- [ ] **TG-018** Validasi nama sesi (`/new`, `/rename`): CR/LF di-collapse ke spasi + trim; kosong → pesan usage `⚠️ ... Example: <cmd> discuss-mcp`; mengandung whitespace → pesan bahasa Indonesia "tidak boleh mengandung spasi, pakai tanda hubung"; hasil dipotong maksimum 64 karakter — `session-name-rules.ts:15`
- [ ] **TG-019** `/new` tanpa `CLAUDE_PROJECT_DIR` (dan tanpa `PTY_CONTROLLER_STATE_DIR`) dibalas error yang menjelaskan cara memperbaikinya — `meta-commands.ts:375`
- [ ] **TG-020** Wrapper-heartbeat check: file `<pty-state>/wrapper.heartbeat` harus ada, berisi timestamp parseable, dan berumur < 30_000 ms; stale/absen → command dibalas "mirza-cc wrapper not detected" — `meta-commands.ts:213`
- [ ] **TG-021** `/new <name>` menolak nama yang sudah dipakai session lain di registry (`⚠️ The name "<name>" is already used ...`) — `meta-commands.ts:390`
- [ ] **TG-022** `/new <name>` sukses menulis payload `{command:"/clear", sessionName}` ke `<pty-state>/pending/<uuid>.json` via tmp+rename atomik dengan field `id` + `ts` ISO; TANPA pesan ack (banner "switch to session" datang kemudian via system-outbox) — `meta-commands.ts:401`, `meta-commands.ts:234`
- [ ] **TG-023** `/rename <name>` menjalankan validasi nama + guard project-dir + guard heartbeat yang sama dengan `/new` — `meta-commands.ts:415`
- [ ] **TG-024** `/rename` menolak nama yang dipakai session LAIN, tapi mengizinkan self-rename ke nama sendiri (idempoten, no-op UX) — `meta-commands.ts:443`
- [ ] **TG-025** `/rename` sukses: menulis `{command:"/rename <name>"}` ke wrapper, me-mirror nama ke registry (`session-names.json`) berdasarkan `wrapper.current_session_id`, dan membalas `✏️ Renaming session from "<old>" to "<new>".` (atau tanpa old jika tidak dikenal) — `meta-commands.ts:455`
- [ ] **TG-026** `/switch` memerlukan `CLAUDE_PROJECT_DIR` dan heartbeat wrapper segar; gagal → pesan error, dikonsumsi — `meta-commands.ts:557`
- [ ] **TG-027** `/switch` mengecualikan session aktif dari daftar; daftar kosong dibalas `Only one session in this project ("<current>")...` atau `No sessions in this project.` — `meta-commands.ts:572`
- [ ] **TG-028** `/switch` me-render picker halaman 1 dengan headline `🔀 Pick a session to switch to (currently on "<label>") (page N/M):` (pageNote hanya bila >1 halaman) dan mengisi map shortId→session untuk SEMUA session (bukan hanya halaman visible) — `meta-commands.ts:587`
- [ ] **TG-029** Layout picker terpaginasi (dipakai /switch, /delete, /delete hard): maks 6 session per halaman, satu tombol per baris, label dipotong 60 char + `…`; baris navigasi `⬅️ Prev` / `📄 N/M` (callback `_page_noop`) / `Next ➡️` hanya saat >1 halaman (Prev hilang di hal 1, Next hilang di hal terakhir); baris `❌ Cancel` selalu terakhir; page di-clamp ke [1, totalPages] — `paginated-picker.ts:54`
- [ ] **TG-030** Callback `meta:cancel` → ack toast "Cancelled" + edit pesan menjadi `(switch cancelled)` — `meta-commands.ts:799`
- [ ] **TG-031** Callback `meta:switch_page_<N>`: `noop` → ack diam; page invalid → ack "Bad page"; picker kosong (restart proses) → ack + edit "(picker expired — please run /switch again)"; valid → re-render keyboard halaman N in place — `meta-commands.ts:805`
- [ ] **TG-032** Callback `meta:switch_<shortId>`: shortId harus match `^[0-9a-f]{8}$`; entry tak dikenal → "Session expired, run /switch again"; wrapper heartbeat stale → edit `⚠️ Wrapper not running — switch aborted` — `meta-commands.ts:843`
- [ ] **TG-033** Tap switch valid menulis `{type:"switch", sessionId, sessionName}` ke wrapper pending, meng-edit pesan picker menjadi `🔀 → <label>` TANPA pre-announce hasil (banner datang via system-outbox), dan menghapus entry dari map — `meta-commands.ts:867`
- [ ] **TG-034** Routing `/delete` bercabang dengan urutan match: `/delete hard all` (bulk hard) → `/delete all` (bulk soft) → `/delete` (picker soft/archive) → `/delete hard` (picker hard); bulk dicek lebih dulu agar tidak tertelan varian picker — `meta-commands.ts:329`
- [ ] **TG-035** `/delete` (soft) me-render picker archive: headline `📦 Pick a session to archive (page N/M):`, mengecualikan session aktif; kosong → `No other sessions available to archive.`; guard project-dir + heartbeat — `meta-commands.ts:619`
- [ ] **TG-036** Tap picker archive (`meta:archive_<shortId>`) meng-edit pesan picker menjadi `📦 Pick a session to archive → <label>` lalu mengirim prompt konfirmasi baru `Archive session "<label>"? (to unarchive, edit the file manually)` dengan tombol `✅ Confirm` / `❌ Cancel` — `meta-commands.ts:1152`
- [ ] **TG-037** `meta:archive_confirm_<shortId>` menjalankan soft-delete: tambahkan sessionId ke `archived-sessions.json` + bebaskan nama di registry dengan me-rename menjadi `<name>__<shortId>` (guard anti double-suffix); sukses → edit `📦 session "<label>" archived.` — `meta-commands.ts:1122`, `meta-commands.ts:255`
- [ ] **TG-038** Callback archive lain: `meta:archive_cancel` → "(archive cancelled)"; `meta:archive_page_<N>` paginasi in-place dengan aturan sama TG-031; picker/prompt expired → pesan "run /archive again" — `meta-commands.ts:1085`
- [ ] **TG-039** `/delete hard` me-render picker delete: headline `🗑️ Pick a session to delete (page N/M):`, mengecualikan session aktif; kosong → `No other sessions available to delete.` — `meta-commands.ts:666`
- [ ] **TG-040** Tap picker delete (`meta:delete_<shortId>`) mengirim prompt konfirmasi `Delete session "<label>"? This is PERMANENT and cannot be undone.` dengan `✅ Confirm` / `❌ Cancel` — `meta-commands.ts:1016`
- [ ] **TG-041** `meta:delete_confirm_<shortId>` menolak jika session yang dipilih ternyata sudah menjadi session aktif (re-check `wrapper.current_session_id` saat confirm): edit `⚠️ Cannot delete — "<label>" is the active session.` — `meta-commands.ts:987`
- [ ] **TG-042** Delete confirm sukses menghapus `~/.claude/projects/<encoded>/<sid>.jsonl` (`rmSync force`) + menghapus nama dari registry, lalu edit `🗑️ session "<label>" deleted.` — `meta-commands.ts:999`, `meta-commands.ts:276`
- [ ] **TG-043** Callback delete lain: `meta:delete_cancel` → "(delete cancelled)"; `meta:delete_page_<N>` paginasi in-place; shortId invalid → "Bad short id"; entry expired → pesan "run /delete again" — `meta-commands.ts:932`
- [ ] **TG-044** `/delete all` (bulk soft) men-snapshot semua session non-aktif dan mengirim konfirmasi `📦 Archive all <N> sessions (except the active one)?` dengan tombol `✅ Archive <N> sessions` / `❌ Cancel` — `meta-commands.ts:713`
- [ ] **TG-045** `meta:archive_all_confirm` mengarsipkan setiap session snapshot (skip yang menjadi session aktif saat eksekusi + skip error individual), lalu edit `📦 <archived> sessions archived. · <skipped> skipped` (note skipped hanya jika >0) — `meta-commands.ts:1054`
- [ ] **TG-046** `/delete hard all` (bulk hard) mengirim konfirmasi `🗑️ PERMANENTLY delete all <N> sessions (except the active one)? This cannot be undone.` dengan tombol `🗑️ PERMANENTLY delete <N> sessions` / `❌ Cancel` — `meta-commands.ts:746`
- [ ] **TG-047** `meta:delete_all_confirm` menghapus jsonl setiap session snapshot (skip current + skip error), edit `🗑️ <deleted> sessions permanently deleted. · <skipped> skipped` — `meta-commands.ts:900`
- [ ] **TG-048** Snapshot bulk yang kosong (proses restart / sudah dipakai) → ack "Expired, run /delete [hard] all again" + edit "(expired — ...)"; `all_cancel` → "(delete/archive all cancelled)" — `meta-commands.ts:895`
- [ ] **TG-049** `parseEffortInput`: whitespace collapse + CR/LF strip + lowercase; `/effort` tanpa arg → picker; arg salah satu dari `low|medium|high|xhigh|max|auto` → direct; selain itu → invalid — `meta-commands.ts:64`
- [ ] **TG-050** `/effort <invalid>` dibalas `⚠️ /effort needs one of: low, medium, high, xhigh, max, auto` — `meta-commands.ts:353`
- [ ] **TG-051** `/effort <level>` direct: guard project-dir + heartbeat; menulis `{command:"/effort <level>", confirmAfterMs:500}` ke wrapper (auto-commit confirm picker CC); balas `🎯 Effort: <level>` — `meta-commands.ts:483`
- [ ] **TG-052** `/effort` picker: 6 level tersusun 3 baris × 2 kolom + baris `❌ Cancel`; level aktif (dibaca dari `last-status.json` → `payload.effort.level`, toleran file/JSON/level invalid) diberi prefix `→ ` — `meta-commands.ts:514`, `meta-commands.ts:187`
- [ ] **TG-053** Callback `meta:effort_<level>`: cancel → edit `❌ Effort unchanged.`; level tak dikenal → ack "Unknown effort level"; valid → guard heartbeat + tulis wrapper command + edit `🎯 Effort: <level> ✅` — `meta-commands.ts:1179`
- [ ] **TG-054** Callback `meta:*` yang tidak dikenali tetap DIKONSUMSI dengan ack "Unknown meta action" (tidak pernah jatuh ke jalur AI) — `meta-commands.ts:1218`
- [ ] **TG-055** Semua state picker/snapshot bersifat in-memory process-lifetime: setelah restart server, tap tombol lama menghasilkan pesan expired yang jelas, bukan aksi salah — `meta-commands.ts:114`

## 3. Perintah yang diteruskan ke AI sebagai teks

- [ ] **TG-056** Teks slash apa pun yang BUKAN meta-command (`/new /switch /delete /rename /effort`) dan bukan bot-command native diteruskan ke session AI sebagai pesan `<channel>` biasa — mis. `/handoff`, `/goal` — `meta-commands.ts:360`, `server.ts:1865`
- [ ] **TG-057** `/handoff` terdaftar di slash-menu paired + `/help` dengan kontrak: BUKAN meta-command; AI menjalankan skill handoff (pilih mode via tombol, pilih bot target, tulis handoff file, relay via agent-bus, self-reset ke "idle") — `commands-registry.ts:101`
- [ ] **TG-058** `/goal` terdaftar di slash-menu paired + `/help` dengan kontrak: BUKAN meta-command; AI menjalankan skill goal (drafting kondisi terverifikasi, approval via tombol, kerja otonom sampai evaluator konfirm; `/goal` ulang = lihat/stop) — `commands-registry.ts:109`

## 4. Commands-registry & sinkronisasi slash-menu (setMyCommands)

- [ ] **TG-059** Registry tunggal `COMMANDS` menjadi sumber untuk slash-menu dan `/help`; audience per command: `default` (unpaired saja: /start), `paired` (context, switch, new, rename, delete, effort, version, handoff, goal), `both` (/help) — `commands-registry.ts:39`
- [ ] **TG-060** Saat polling start, bot memasang menu default (`toSetMyCommandsPayload('default')`) pada scope `all_private_chats` — chat tanpa scope per-chat melihat /start + /help — `server.ts:2157`
- [ ] **TG-061** Chat paired mendapat scope per-chat `{type:'chat', chat_id}` berisi payload audience `paired` (menyembunyikan /start karena scope per-chat meng-override scope global); chat_id non-numerik di-skip dengan log — `server.ts:155`
- [ ] **TG-062** Chat yang keluar dari `allowFrom` di-revert dengan `deleteMyCommands` pada scope per-chat sehingga menu default (dengan /start untuk re-pairing) kembali — `server.ts:171`
- [ ] **TG-063** `reconcileMenuScopes` bekerja delta-only terhadap set `lastPairedScopes` (hanya API call untuk penambahan/penghapusan aktual; touch access.json tanpa perubahan = no-op) — `server.ts:189`
- [ ] **TG-064** Rekonsiliasi scope dipicu di tiga titik: saat `bot.start` onStart, saat watcher `access.json` mendeteksi perubahan (mtime berubah), dan oleh sweep interval 5 detik (fallback fs.watch Windows) — `server.ts:2165`, `server.ts:2092`, `server.ts:2109`

## 5. MCP tools (reply, react, edit_message, download_attachment, get_message_by_id)

- [ ] **TG-065** Server MCP `telegram` meng-list tepat 5 tools (`reply`, `react`, `download_attachment`, `get_message_by_id`, `edit_message`) dengan inputSchema + description lengkap seperti di ListTools handler — `server.ts:569`
- [ ] **TG-066** `reply`: param wajib `chat_id`, `text`; opsional `reply_to`, `files[]`, `format` (`text` default | `markdown` | `markdownv2`), `source` (`assistant` default | `system`), `buttons` — `server.ts:695`
- [ ] **TG-067** Gate outbound `assertAllowedChat` di `reply`/`react`/`edit_message`: chat harus ada di `access.allowFrom` atau menjadi key di `access.groups`; selain itu error `chat <id> is not allowlisted — add via /telegram:access` — `server.ts:315`
- [ ] **TG-068** Validasi `buttons`: array-of-rows 1..8 baris × 1..8 tombol; `label` string non-kosong ≤64 char; `callback_id` match `/^[a-z0-9_]{1,32}$/` dan unik across seluruh spec; pesan error menyebut posisi row/col — `buttons.ts:27`
- [ ] **TG-069** `buttons` + `files` dalam satu call `reply` ditolak dengan error `buttons and files cannot be combined in a single reply call` — `server.ts:716`
- [ ] **TG-070** Guard `assertSendable`: file di dalam STATE_DIR (realpath-resolved, kecuali subdir `inbox/`) ditolak dengan `refusing to send channel state: <path>` — mencegah pengiriman `.env`/`messages.db` — `server.ts:255`
- [ ] **TG-071** Setiap file attachment dibatasi 50MB (`file too large: <path> (<x>MB, max 50MB)`) — `server.ts:724`
- [ ] **TG-072** Chunking teks: limit = clamp(`access.textChunkLimit` ?? 4096, 1..4096); mode = `access.chunkMode` ?? `length` — `server.ts:732`
- [ ] **TG-073** Mode chunk `newline`: potong pada `\n\n` terakhir, lalu `\n`, lalu spasi (boundary harus > limit/2, spasi > 0), fallback hard cut; leading newline sisa chunk dibuang — `server.ts:477`
- [ ] **TG-074** `format:"markdown"`: teks RAW CommonMark di-chunk dulu pada margin limit/2 dengan mode `newline`, tiap chunk dikonversi terpisah ke MarkdownV2 (`telegramify-markdown`); bila hasil konversi > limit, chunk itu dikirim sebagai plain text mentah — `server.ts:747`, `markdown.ts:15`
- [ ] **TG-075** `format:"markdownv2"` = passthrough mentah dengan `parse_mode:'MarkdownV2'` (caller escape sendiri); `format:"text"` = plain tanpa parse_mode — `server.ts:757`
- [ ] **TG-076** Degradasi last-resort `markdown`: jika Telegram menolak chunk dengan error "can't parse entities" (GrammyError), chunk yang sama dikirim ulang sebagai plain text CommonMark mentah, bukan gagal total — `server.ts:784`
- [ ] **TG-077** Threading `reply_to` mengikuti `access.replyToMode` (default `first`): `off` = tak pernah, `first` = hanya chunk pertama, `all` = semua chunk; file attachment ikut di-thread saat mode ≠ off — `server.ts:768`, `server.ts:811`
- [ ] **TG-078** Keyboard `buttons` hanya dilekatkan pada chunk TERAKHIR — `server.ts:774`
- [ ] **TG-079** `files` dikirim sebagai pesan terpisah setelah teks: ekstensi `.jpg/.jpeg/.png/.gif/.webp` via `sendPhoto` (inline preview), lainnya via `sendDocument` — `server.ts:808`, `server.ts:500`
- [ ] **TG-080** Kegagalan kirim di tengah menghasilkan error `reply failed after <n> of <m> chunk(s) sent: <msg>` (partial delivery dilaporkan eksplisit) — `server.ts:799`
- [ ] **TG-081** Logging outbound: satu row per chunk (ts+i, `reply_to` hanya pada chunk yang benar-benar di-thread, `metadata:{format}` bila format ≠ text) + satu row per file (`attachments:[{type:'photo'|'document', path}]`) dengan `source` dari param — `server.ts:825`
- [ ] **TG-082** Hasil `reply`: `sent (id: <id>)` untuk satu pesan atau `sent <n> parts (ids: ...)` untuk multi — `server.ts:859`
- [ ] **TG-083** `react`: gate `assertAllowedChat` lalu `setMessageReaction(chat_id, message_id, [{type:'emoji', emoji}])`; sukses → `reacted`; emoji di luar whitelist Telegram menghasilkan error API yang diteruskan ke caller — `server.ts:865`
- [ ] **TG-084** `download_attachment(file_id)`: `getFile` → tanpa `file_path` error "file may have expired"; unduh dari `api.telegram.org/file/bot<TOKEN>/...`; HTTP non-ok → error; tulis ke `inbox/<ts>-<sanitized_unique_id>.<sanitized_ext>` (ext/uid di-strip ke alfanumerik, fallback `bin`/`dl`); hasil = path lokal — `server.ts:872`
- [ ] **TG-085** `get_message_by_id(chat_id, message_id)`: dua-duanya wajib (error jika kosong); tidak ditemukan → throw `no message <id> in chat <id>`; ditemukan → JSON row lengkap (pretty-printed) — `server.ts:890`
- [ ] **TG-086** `edit_message`: `format:"markdown"` dikonversi ke MarkdownV2 (tanpa chunking); `markdown|markdownv2` → `parse_mode:'MarkdownV2'`; `text` → tanpa parse_mode — `server.ts:904`
- [ ] **TG-087** `edit_message` dengan `buttons` memvalidasi + MENGGANTI inline keyboard; tanpa `buttons` (dan tanpa parse_mode) call 3-arg dipertahankan sehingga keyboard lama TERHAPUS (perilaku default Telegram) — `server.ts:915`
- [ ] **TG-088** `edit_message` sukses dicatat via `logEdit` (row source `assistant`, `metadata.edited_of` = message_id asal, `metadata.format` bila ≠ text); hasil `edited (id: <id>)` — `server.ts:937`
- [ ] **TG-089** Semua error tool dibungkus sebagai result `isError:true` dengan teks `<toolname> failed: <message>` (tidak melempar keluar MCP) — `server.ts:953`
- [ ] **TG-090** Nama tool tak dikenal → result `isError:true` `unknown tool: <name>` — `server.ts:947`

## 6. Pipeline inbound (gate, pairing, media, album, notifikasi)

- [ ] **TG-091** `gate()`: `dmPolicy:"disabled"` men-drop SEMUA inbound (termasuk group) sebelum cek tipe chat — `server.ts:352`
- [ ] **TG-092** DM: sender di `allowFrom` → deliver; `dmPolicy:"allowlist"` + tidak terdaftar → drop diam-diam — `server.ts:360`
- [ ] **TG-093** Pairing baru: kode = 6 hex char (`randomBytes(3)`), entry pending `{senderId, chatId, createdAt, expiresAt: now+1h, replies:1}` dipersist ke access.json — `server.ts:376`
- [ ] **TG-094** Balasan pairing: `Pairing required — run in Claude Code:\n\n/telegram:access pair <code>`; resend memakai lead `Still pending` dengan kode yang sama — `server.ts:1826`
- [ ] **TG-095** Sender dengan pending aktif dibalas maksimal 2× (initial + 1 reminder, counter `replies`); setelah itu drop diam-diam — `server.ts:364`
- [ ] **TG-096** Cap pending 3 entri: percobaan pairing ke-4+ dari sender baru di-drop diam-diam tanpa kode — `server.ts:374`
- [ ] **TG-097** Pending yang `expiresAt < now` dipangkas pada setiap gate dan perubahan dipersist — `server.ts:330`
- [ ] **TG-098** Group/supergroup: hanya group yang punya entry `access.groups[groupId]` yang dilayani; `policy.allowFrom` non-kosong membatasi sender; `requireMention` (default true) mensyaratkan mention — `server.ts:389`
- [ ] **TG-099** `isMentioned`: entity `mention` `@botusername` (case-insensitive) pada text/caption, `text_mention` bot, reply ke pesan bot dihitung mention implisit, plus `access.mentionPatterns` sebagai regex case-insensitive (pattern invalid di-skip) — `server.ts:420`
- [ ] **TG-100** Tipe chat selain private/group/supergroup (mis. channel) di-drop — `server.ts:404`
- [ ] **TG-101** Intersep permission-reply: teks match `/^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i` dari sender ter-gate TIDAK direlay ke AI; memancarkan `notifications/claude/channel/permission` `{request_id lowercase, behavior allow|deny}` dan mereaksi pesan dengan ✅/❌ — `server.ts:1843`, `server.ts:135`
- [ ] **TG-102** Intersep permission-reply sengaja TIDAK dijalankan pada jalur album (caption album tak pernah membawa sintaks itu; menutup forge surface) — `server.ts:1666`
- [ ] **TG-103** Setiap inbound yang lolos gate memicu `sendChatAction('typing')` fire-and-forget — `server.ts:1891`
- [ ] **TG-104** Bila `access.ackReaction` terkonfigurasi, pesan inbound diberi reaksi emoji tersebut (fire-and-forget; emoji non-whitelist ditelan tanpa error) — `server.ts:1896`
- [ ] **TG-105** Foto tunggal: resolusi terbesar diunduh ke `inbox/<ts>-<file_unique_id>.<ext>`; gagal unduh → `image_path` di-omit (bukan error ke user) — `server.ts:1605`
- [ ] **TG-106** Konten default per tipe: foto tanpa caption → `(photo)`; document → `(document: <name|file>)`; voice → `(voice message)`; audio → `(audio: <title|name|audio>)`; video → `(video)`; video_note → `(video note)`; sticker → `(sticker <emoji>)` — `server.ts:1477`
- [ ] **TG-107** Non-foto (document/voice/audio/video/video_note/sticker) TIDAK diunduh otomatis; meta attachment `{kind, file_id, size?, mime?, name?}` disertakan agar AI memakai `download_attachment` — `server.ts:1497`
- [ ] **TG-108** `safeName`: nama file/judul dari uploader di-sanitize (karakter `<>[]\r\n;` diganti `_`) sebelum masuk konten/meta — anti tag-breakout — `server.ts:1601`
- [ ] **TG-109** Inbound tunggal dicatat via `logInbound` sebelum notifikasi: ts, chat_id, message_id, user_id, user_name (username|first_name|id), text, attachments (photo path + meta), reply_to, quote_text/quote_is_manual — `server.ts:1907`
- [ ] **TG-110** Notifikasi `notifications/claude/channel` inbound tunggal: `content`=teks; `meta` = chat_id, message_id, user (username|id), user_id, ts ISO (dari `message.date`), `image_path?`, `quote_text?`+`quote_is_manual?` ("true"/"false"), `attachment_kind/file_id/size/mime/name?` — semua nilai string — `server.ts:1924`
- [ ] **TG-111** Ekstraksi quote (`extractQuoteText`) presedensi: `message.quote.text` (manual bila `is_manual:true`) → `reply_to_message.text` → `reply_to_message.caption` → undefined; `external_reply` tidak didukung — `server-helpers.ts:45`
- [ ] **TG-112** Album buffer: key `<chat_id>:<media_group_id>`, debounce 400 ms (reset per item), hard-cap 3000 ms, flush paksa saat mencapai 10 item — `server.ts:1455`, `album-buffer.ts:41`
- [ ] **TG-113** Item album di-sort ascending `message_id` saat flush sehingga urutan `image_paths` dan label `Photo N` sama dengan tampilan Telegram — `server.ts:1459`
- [ ] **TG-114** Album melewati `gate()` pada ctx item pertama; hasil `pair` tetap dibalas instruksi pairing; `drop` diam-diam — `server.ts:1651`
- [ ] **TG-115** Ack album: typing + ackReaction hanya pada item pertama — `server.ts:1671`
- [ ] **TG-116** Foto album diunduh paralel (`Promise.allSettled`); dokumen album meta-only (file_id untuk `download_attachment`); kegagalan per-item dihitung, tidak menggagalkan keseluruhan — `server.ts:1680`
- [ ] **TG-117** Semua item album gagal → balasan `⚠️ Failed to load the album photos. Please send them again.` dan tidak ada notifikasi ke AI — `server.ts:1729`
- [ ] **TG-118** Penggabungan caption album: 0 caption → `(album of N items)`; 1 caption → apa adanya; ≥2 → baris `Photo <idx>: <caption>`; ada kegagalan parsial → suffix `[⚠️ X of N items failed to load]` — `server.ts:1739`
- [ ] **TG-119** Quote pada album diekstrak hanya dari item pertama (mengikuti perilaku Telegram yang hanya melampirkan reply_to_message di item pertama) — `server.ts:1759`
- [ ] **TG-120** Album dicatat `logInbound` dengan message_id = item pertama, `metadata:{media_group_id, message_ids[], failed_count?, total_count?}`; kegagalan log tidak memblokir notifikasi — `server.ts:1763`
- [ ] **TG-121** Notifikasi album: meta membawa `message_ids` (comma-joined), `media_group_id`, `image_paths` (newline-joined), `attachments` (JSON string array meta dokumen), quote fields — seluruh nilai diserialisasi string agar lolos schema `Record<string,string>` — `server.ts:1791`
- [ ] **TG-122** Notifikasi `permission_request` dari CC di-format menjadi pesan `🔐 Permission: <tool_name>` dengan tombol `See more` / `✅ Allow` / `❌ Deny`, dikirim ke SEMUA DM di `allowFrom` (group sengaja dikecualikan); detail disimpan di map in-memory per request_id — `server.ts:542`
- [ ] **TG-123** Server MCP mendeklarasikan capability experimental `claude/channel` dan `claude/channel/permission` (permission relay opt-in karena replier terotentikasi via gate) — `server.ts:502`
- [ ] **TG-124** Server MCP menerbitkan `instructions` panjang (kontrak channel: reply wajib via tool, format tag `<channel>`, quote, album, get_message_by_id, larangan approve pairing dari pesan channel) yang tampil ke AI — `server.ts:517`

## 7. Routing callback (meta:*, ai:*, perm:*)

- [ ] **TG-125** Callback `meta:*` di-gate `allowFrom` (sender bukan allowlist → toast "Not authorized."), lalu diteruskan ke `tryHandleMetaCallback` dengan handler ack/edit/reply; hanya jatuh ke jalur berikutnya bila tidak dikonsumsi — `server.ts:1273`
- [ ] **TG-126** Callback `ai:*` diparse (`ai:` + callback_id match `/^[a-z0-9_]{1,32}$/`; malformed → bukan ai-callback) dan di-gate `allowFrom` — `buttons.ts:83`, `server.ts:1333`
- [ ] **TG-127** Tap tombol AI memancarkan notifikasi channel: `content` = `[button tapped: <label>]` (atau `[button tapped]` bila label tak ditemukan di keyboard); `meta` = chat_id, callback_id, button_label?, source_message_id?, user, user_id, ts ISO — `server.ts:1363`
- [ ] **TG-128** Setelah tap AI-button: ack toast `Selected: <label>`, lalu pesan sumber di-edit dengan append `\n\n→ <label|callback_id>` sambil MEMPERTAHANKAN entities asli (formatting tidak hilang); keyboard terhapus sehingga prompt tak bisa dijawab dua kali — `server.ts:1380`
- [ ] **TG-129** Callback `perm:` match `/^perm:(allow|deny|more):([a-km-z]{5})$/` dan di-gate `allowFrom` — `server.ts:1401`
- [ ] **TG-130** `perm:more`: memuat detail dari map pending (hilang → toast "Details no longer available."), meng-edit pesan menjadi blok tool_name/description/input_preview (JSON di-pretty-print bila valid) dengan keyboard Allow/Deny tersisa — `server.ts:1414`
- [ ] **TG-131** `perm:allow|deny`: memancarkan `notifications/claude/channel/permission` `{request_id, behavior}`, menghapus entry pending, toast + edit pesan dengan `✅ Allowed`/`❌ Denied` (anti jawab ganda) — `server.ts:1440`
- [ ] **TG-132** Callback data yang tidak match namespace mana pun di-ack diam-diam (spinner hilang, tanpa aksi) — `server.ts:1402`

## 8. Messages store (messages.db)

- [ ] **TG-133** Store SQLite di `<state>/messages.db`: tabel `messages(id, ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)` + 3 indeks (chat_ts, chat+message_id, source_ts); `journal_mode=WAL`, `synchronous=NORMAL` — `messages-store.ts:89`
- [ ] **TG-134** `messages.db` di-chmod 0600 setelah init pada platform POSIX (Windows: warning sekali di startup) — `server.ts:109`
- [ ] **TG-135** `logInbound` menulis row `source:'user'`; `quote_text`/`quote_is_manual` di-merge ke kolom `metadata` (tanpa migrasi schema) — `messages-store.ts:165`
- [ ] **TG-136** `logOutbound` menulis row dengan `source` terbatas `'assistant' | 'system'` beserta text/attachments/reply_to/metadata — `messages-store.ts:193`
- [ ] **TG-137** `logEdit` menulis row baru `source:'assistant'` dengan `metadata.edited_of` (tidak ada source 'edit'; edit tetap authored assistant) — `messages-store.ts:215`
- [ ] **TG-138** `getMessage`: direct hit `(chat_id, message_id)` mengambil row TERBARU (`ORDER BY ts DESC LIMIT 1`); hasil mengembalikan attachments/metadata sudah di-JSON-parse (parse gagal → null field) — `messages-store.ts:235`
- [ ] **TG-139** Fallback album `getMessage`: bila direct miss, scan `metadata LIKE '%"<id>"%'` per chat lalu verifikasi `metadata.message_ids` benar-benar memuat id (anti false-positive) — item album 2..N resolve ke row item pertama — `messages-store.ts:254`
- [ ] **TG-140** Mode degradasi: `TELEGRAM_DISABLE_MESSAGES_STORE=1` atau kegagalan init menonaktifkan store; semua log/read menjadi no-op dengan warning stderr, pipeline pesan tetap berjalan penuh — `messages-store.ts:146`

## 9. Lifecycle server: watcher, poller, takeover, retry

- [ ] **TG-141** State dir wajib ter-resolve (`TELEGRAM_STATE_DIR` > `CLAUDE_PROJECT_DIR/.claude/channels/telegram`); gagal → pesan stderr menjelaskan dua opsi + `process.exit(1)` — `server.ts:39`, `state-path.ts:3`
- [ ] **TG-142** `<state>/.env` dimuat ke `process.env` dengan aturan "real env wins" (baris `KEY=value`); file di-chmod 0600 (POSIX) — `server.ts:71`
- [ ] **TG-143** Tanpa `TELEGRAM_BOT_TOKEN` server exit(1) dengan pesan berisi state dir, path .env, dan format token — `server.ts:85`
- [ ] **TG-144** Di Windows dicetak satu warning startup bahwa chmod POSIX no-op dan `.env`/`messages.db` hanya dilindungi ACL — `server.ts:62`
- [ ] **TG-145** Mode statis (`TELEGRAM_ACCESS_MODE=static`): access di-snapshot saat boot dan tak pernah dibaca/ditulis ulang; `dmPolicy:"pairing"` di-downgrade ke `allowlist` dengan warning; pending dikosongkan; `saveAccess` no-op; approvals poller & access watcher dinonaktifkan — `server.ts:295`, `server.ts:472`, `server.ts:2089`
- [ ] **TG-146** Single-consumer takeover `bot.pid`: pid stale yang masih hidup (bukan diri sendiri) dikirim SIGTERM sebelum polling dimulai, lalu pid sendiri ditulis — mencegah 409 permanen dari orphan lama — `server.ts:112`
- [ ] **TG-147** Saat shutdown, `bot.pid` hanya dihapus bila isinya masih pid proses ini (tidak mencabut pid pengganti) — `server.ts:977`
- [ ] **TG-148** Approvals poller (interval 5 s, non-static): setiap file di `<state>/approved/<senderId>` memicu pesan `Paired! Say hi to Claude.` ke sender lalu file dihapus (dihapus juga saat kirim gagal, anti-loop) — `server.ts:450`
- [ ] **TG-149** System-outbox watcher: `fs.watch` dir + sweep 2 s fallback; hanya file `*.json` non-`.tmp.`; defer 50 ms untuk tmp-rename Windows; file DIHAPUS lebih dulu sebelum diproses (anti double-process); JSON malformed / `type` tak dikenal dicatat stderr — `server.ts:2117`, `server.ts:1970`
- [ ] **TG-150** Event `{type:"session-change", sessionId?, sessionName?}` mengirim banner ke `access.allowFrom[0]` (tak ada → drop dengan log): teks `━━━…\nswitch to session\n📍 *<label>*\n━━━…` sebagai MarkdownV2; label resolve `payload.sessionName` → `listProjectSessions` (hasName) → `session <8-hex>` → `(unknown)`; upaya log ke store memanggil `messagesStore.append(...)` yang TIDAK ada di interface store sehingga selalu gagal-tertangkap (banner terkirim tapi tidak tercatat) — `server.ts:1999`
- [ ] **TG-151** Watcher `access.json`: watch di parent dir (filter basename), defer 50 ms, dedupe via mtime, plus sweep 5 s; perubahan memicu rekonsiliasi menu scope dari disk — `server.ts:2087`
- [ ] **TG-152** Shutdown (stdin end/close, SIGTERM/SIGINT/SIGHUP): tutup watcher & interval & store, hapus pid (bila milik sendiri), drain album buffer, `bot.stop()`, force `process.exit(0)` setelah 2 s — `server.ts:967`
- [ ] **TG-153** Orphan watchdog interval 5 s: reparenting (POSIX, `process.ppid` berubah) atau stdin destroyed/readableEnded → self-shutdown (tidak menjadi zombie pemegang token) — `server.ts:997`
- [ ] **TG-154** Retry polling: SEMUA error di-retry dengan backoff `min(1000×attempt, 15000)`; khusus 409 Conflict menyerah setelah 8 percobaan dengan pesan diagnostik; attempt di-reset saat polling sukses; `Aborted delay` (bot.stop mid-setup) dianggap exit bersih — `server.ts:2147`
- [ ] **TG-155** `bot.catch` menahan error handler pesan sehingga polling terus berjalan (tanpa ini grammy stop permanen) — `server.ts:1955`
- [ ] **TG-156** `access.json` korup (bukan ENOENT) dipindahkan ke `access.json.corrupt-<ts>` dan server lanjut dengan default (`dmPolicy:"pairing"`, list kosong) — `server.ts:285`
- [ ] **TG-157** `unhandledRejection`/`uncaughtException` dicatat stderr dan proses tetap melayani tools (tidak mati diam-diam) — `server.ts:124`
- [ ] **TG-158** Server diluncurkan sebagai MCP stdio server oleh Claude Code via `.mcp.json`: `bun run --cwd ${CLAUDE_PLUGIN_ROOT} --shell=bun --silent start` — `.mcp.json:3`

## 10. Hooks (SessionStart, UserPromptSubmit, Stop)

- [ ] **TG-159** `hooks/hooks.json` mendaftarkan tiga hook command `bun run`: SessionStart → `session-name-context.ts`, UserPromptSubmit → `telegram-turn-reminder.ts`, Stop → `telegram-reply-guard.ts` — `hooks/hooks.json:1`
- [ ] **TG-160** SessionStart menyuntik `additionalContext` persis `Current Telegram session name: "<name>".`; resolusi nama: `wrapper.current_session_name` (otoritatif) → registry per `wrapper.current_session_id`; tanpa nama → hook diam total (tanpa output/error) — `hooks/session-name-context.ts:15`
- [ ] **TG-161** UserPromptSubmit mendeteksi inbound Telegram via regex `/<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/` pada prompt; prompt non-telegram → tanpa output — `hooks/telegram-turn-reminder.ts:10`
- [ ] **TG-162** Reminder yang disuntik per-turn berisi 3 kewajiban (immediate-reply ack sebelum tool call pertama; inline-buttons untuk pertanyaan; channel discipline "jawaban final wajib via reply tool"), plus baris ke-4 name-session bila nama sesi saat ini `idle` — `hooks/telegram-turn-reminder.ts:14`
- [ ] **TG-163** Stop hook memblokir (`decision:"block"` + reason menyuruh kirim jawaban via `mcp__plugin_telegram_telegram__reply`) ketika transcript memuat inbound `<channel source=telegram>` dan tidak ada `tool_use` reply SETELAH inbound terakhir (indeks reply > indeks inbound = lolos) — `hooks/telegram-reply-guard.ts:50`
- [ ] **TG-164** Stop hook loop-guarded: `stop_hook_active:true` → tidak pernah blokir kedua kali; transcript path hilang/unreadable → lolos diam-diam — `hooks/telegram-reply-guard.ts:77`

## 11. Integrasi statusLine (/context bridge)

- [ ] **TG-165** Instalasi bridge: menulis `settings.json.statusLine = {type:'command', command:'bun run "<plugin>/scripts/context-bridge.ts"'}`; settings lama di-backup ke `settings.json.backup-<ts>`; command statusLine sebelumnya disimpan ke `<state>/chained-statusline`; memastikan `channels/.gitignore`; error-case: `CLAUDE_PROJECT_DIR` tak ada, settings.json bukan JSON valid, gagal tulis — masing-masing menghasilkan pesan error spesifik — `server.ts:1193`
- [ ] **TG-166** `isOurOwnBridge` mencegah menyimpan versi lama bridge sendiri sebagai chained command (match path `/telegram(/…)?/scripts/context-bridge.<ext>` lintas separator/case) — `server-helpers.ts:13`
- [ ] **TG-167** `context-bridge.ts` (statusLine command): membaca stdin statusLine CC dan menulis `<state>/last-status.json` = `{captured_at_ms, payload}` via tmp+rename atomik; input bukan JSON → `payload:null` (tidak crash); tanpa `CLAUDE_PROJECT_DIR` → skip exit 0 — `scripts/context-bridge.ts:16`
- [ ] **TG-168** Setelah capture, bridge men-chain ke command statusLine sebelumnya (isi `chained-statusline`) via shell dengan stdin yang sama, stdout/stderr inherit — statusLine lama user tetap jalan — `scripts/context-bridge.ts:43`
- [ ] **TG-169** `renderContextReply` menghasilkan seksi: `Context` (progress bar 10 sel ●○ + % + `used/total tokens`; `(unavailable)` bila absen), `Rate Limit 5h` dan `Rate Limit 7d` (bar + `reset <sisa>`; seksi di-omit bila absen), blok metadata (model display_name, `Session: <name> (<8-hex>)`, `CWD: …/dua-segmen-terakhir`, `Cost: $x.xx`, `Thinking: on/off`, `Effort: <level>`, `Fast: on/off` — baris absen di-skip), dan `Last update: HH:MM WIB\n(<relative> ago)` — `context-renderer.ts:92`
- [ ] **TG-170** Helper format: token `1.5k`/`2M`; sisa reset `2d 3h`/`4h 5m`/`30m`/`just now`; jam Asia/Jakarta dihitung UTC+7 fixed tanpa Intl; relative `Xs/Xm/Xh Ym ago` — `context-renderer.ts:26`

## 12. State files, env vars, dan konfigurasi access.json

- [ ] **TG-171** Inventori file state di `<state>/`: `access.json` (kontrol akses), `.env` (`TELEGRAM_BOT_TOKEN=`), `messages.db` (+WAL), `inbox/` (unduhan media), `system-outbox/` (event JSON dari plugin sibling), `approved/<senderId>` (sinyal pairing dari skill), `bot.pid`, `last-status.json`, `chained-statusline`, `session-names.json`, `archived-sessions.json` — semuanya dibuat/dikonsumsi sesuai item terkait — `server.ts:52`, `server.ts:94`
- [ ] **TG-172** Env vars yang dihormati: `TELEGRAM_STATE_DIR` (override state dir), `CLAUDE_PROJECT_DIR` (default state dir + enumerasi sesi), `TELEGRAM_BOT_TOKEN` (wajib; real env menang atas .env), `TELEGRAM_ACCESS_MODE=static`, `TELEGRAM_DISABLE_MESSAGES_STORE=1`, `PTY_CONTROLLER_STATE_DIR` (override state pty wrapper) — `state-path.ts:3`, `server.ts:82`, `messages-store.ts:148`, `meta-commands.ts:158`
- [ ] **TG-173** Kunci konfigurasi `access.json` beserta default runtime: `dmPolicy` ("pairing"), `allowFrom` ([]), `groups` ({}; per-group `requireMention` default true, `allowFrom` default []), `pending` ({}), `mentionPatterns` (unset), `ackReaction` (unset = tanpa reaksi; "" menonaktifkan), `replyToMode` ("first"), `textChunkLimit` (4096, di-clamp maks 4096), `chunkMode` ("length"); file dibaca ulang per pesan (perubahan efektif tanpa restart), tulis via tmp+rename mode 0600 — `server.ts:222`, `server.ts:267`, `server.ts:322`
- [ ] **TG-174** `ensureChannelsGitignore` memastikan `<project>/.claude/channels/.gitignore` berisi pola `*` + `!.gitignore` (idempoten: file sudah benar → tidak ditulis ulang; mkdir/write gagal → hasil `{ok:false, reason}`); tersedia paralel dalam bentuk bash untuk skill — `channels-gitignore.ts:16`, `scripts/gitignore-handler.sh:7`

## 13. Session registry & enumerasi sesi

- [ ] **TG-175** Registry nama di `<state>/session-names.json` berbentuk `{<sessionId>: {name, updatedAt}}`; entry malformed di-skip saat load; save via tmp+rename best-effort — `session-names-registry.ts:46`
- [ ] **TG-176** `refreshFromPidFiles` me-merge nama dari `~/.claude/sessions/<pid>.json` (hanya yang `cwd` == projectDir dan `name` non-kosong) dengan aturan "mtime pid-file lebih baru dari `updatedAt` registry menang" — `session-names-registry.ts:115`
- [ ] **TG-177** `findSessionIdByName` match exact case-sensitive; dipakai sebagai cek keunikan nama untuk `/new` dan `/rename` — `session-names-registry.ts:163`
- [ ] **TG-178** `listProjectSessions` mengenumerasi `~/.claude/projects/<encoded-cwd>/*.jsonl`, hanya nama file berpola UUID (file nyasar seperti memory.md diabaikan), dengan mtime sebagai recency — `sessions-list.ts:81`
- [ ] **TG-179** Session yang ada di `archived-sessions.json` disaring dari hasil enumerasi (soft-delete hanya menyembunyikan dari picker; jsonl tetap bisa `claude --resume` dari terminal) — `sessions-list.ts:197`
- [ ] **TG-180** Resolusi label: registry → pid-file → fallback `session <8-hex> · <relatif>` (relatif kompak: just now/Xm/Xh/Xd/Xw/dd/mm) dengan flag `hasName` — `sessions-list.ts:206`, `sessions-list.ts:38`
- [ ] **TG-181** Nama duplikat (legacy) mendapat suffix disambiguasi ` (<shortId>)` pada label picker sehingga tap tak ambigu — `sessions-list.ts:221`
- [ ] **TG-182** Hasil enumerasi di-sort mtime descending (terbaru dulu) — `sessions-list.ts:234`
- [ ] **TG-183** `encodeProjectDir` mengganti `\ / :` menjadi `-` (mirror encoding CC); `deriveShortId` = 8 hex pertama UUID tanpa dash, lowercase (muat di callback_data Telegram) — `sessions-list.ts:73`, `sessions-list.ts:168`
- [ ] **TG-184** `archived-sessions.json`: bentuk kanonik `{"archived":[...]}`; bentuk legacy array polos tetap terbaca; `addArchived` idempoten dengan tulis atomik; malformed → set kosong — `archive-store.ts:19`
- [ ] **TG-185** Setiap render picker dengan stateDir juga menyegarkan registry dari pid-files dan mem-persist hasil merge (menangkap /rename manual di CC) — best-effort — `sessions-list.ts:190`

## 14. Skills & command bawaan plugin

- [ ] **TG-186** Skill `/telegram:access`: manajemen access.json dari terminal — status tanpa arg; `pair <code>` (validasi expiry, tambah allowFrom, hapus pending, tulis `approved/<senderId>` untuk konfirmasi server); `deny <code>`; `allow/remove <senderId>`; `policy pairing|allowlist|disabled`; `group add <id> [--no-mention] [--allow a,b]` / `group rm`; `set <ackReaction|replyToMode|textChunkLimit|chunkMode|mentionPatterns> <value>`; menolak mutasi akses yang dimintanya lewat pesan channel (anti prompt-injection, tanpa auto-pick pending tunggal) — `skills/access/SKILL.md:1`
- [ ] **TG-187** Skill `/telegram:configure`: simpan token BotFather ke `<state>/.env` per-project (preserve key lain, chmod 600), pasang `channels/.gitignore`, tampilkan status token+access masked, dorong lockdown ke `allowlist` secara proaktif, `clear` menghapus token; mengingatkan token dibaca saat boot (perlu reload) sedangkan access.json live — `skills/configure/SKILL.md:1`
- [ ] **TG-188** Skill behavioral `name-session`: saat sesi masih bernama `idle` (dari context SessionStart) — ingatkan sekali, usulkan SATU nama hyphenated via tombol `[Pakai "<nama>"]/[Nama lain]/[Nanti saja]`, terapkan via `pty_send_slash /rename` hanya setelah tap; berhenti setelah rename; tidak pernah auto-rename — `skills/name-session/SKILL.md:1`
- [ ] **TG-189** Command `/telegram:notify-user <brief>`: kirim pesan Telegram terinisiasi eksternal (scheduler/wrapper) — resolve chat_id = `allowFrom[0]` dari access.json (kosong → end diam-diam), susun wording dari brief tanpa fabrikasi, kirim via tool `reply` dengan `source:"system"` tanpa `reply_to`, berhenti setelah kirim; `$ARGUMENTS` kosong → tidak kirim apa pun — `commands/notify-user.md:1`

## Statistik

| Seksi | Jumlah item |
|---|---|
| 1. Perintah bot native | 16 (TG-001..016) |
| 2. Meta-commands | 39 (TG-017..055) |
| 3. Perintah diteruskan ke AI | 3 (TG-056..058) |
| 4. Commands-registry & slash-menu | 6 (TG-059..064) |
| 5. MCP tools | 26 (TG-065..090) |
| 6. Pipeline inbound | 34 (TG-091..124) |
| 7. Routing callback | 8 (TG-125..132) |
| 8. Messages store | 8 (TG-133..140) |
| 9. Lifecycle server | 18 (TG-141..158) |
| 10. Hooks | 6 (TG-159..164) |
| 11. Integrasi statusLine | 6 (TG-165..170) |
| 12. State files, env, konfigurasi | 4 (TG-171..174) |
| 13. Session registry & enumerasi | 11 (TG-175..185) |
| 14. Skills & command | 4 (TG-186..189) |
| **Total** | **189** |
