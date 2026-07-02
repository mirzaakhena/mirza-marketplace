# Capability Inventory — pty-controller (plugin + wrapper mirza-cc)

Tanggal: 2026-07-02. Sumber: `plugins/pty-controller/` — plugin version **0.0.30** (`.claude-plugin/plugin.json`), wrapper version **0.0.7** (`wrapper/package.json`).

Dokumen ini adalah **acceptance checklist** untuk rewrite harness. Setiap item adalah kontrak perilaku yang harus dipertahankan — mekanisme boleh berubah (hooks menggantikan jsonl-polling, daemon menggantikan wrapper standalone), tetapi kapabilitasnya harus tetap dapat diverifikasi. Referensi lokasi (`file:line`) menunjuk ke implementasi SAAT INI sebagai bukti asal kontrak, bukan sebagai spesifikasi mekanisme.

Cakupan: `server.ts` (MCP server), `ipc.ts`, `slash-guards.ts`, `commands/new.md`, `.mcp.json`, dan `wrapper/src/` (`wrapper.ts`, `injection-gate.ts`, `session-state.ts`, `session-name.ts`, `batch.ts`, `prompt-inject.ts`). File PoC non-runtime (`interactive.ts`, `auto-clear.ts`, `probe.ts`) ada di `wrapper/src/` tetapi bukan bagian dari runtime — tidak diinventarisasi.

Catatan bootstrap: MCP server dijalankan via `bun run --cwd ${CLAUDE_PLUGIN_ROOT} start` (`.mcp.json:5`), yang memetakan ke `bun install --no-summary && bun server.ts` (`package.json:8`). Wrapper berjalan via `tsx src/wrapper.ts` di Node (`wrapper/package.json:8`).

## 1. MCP tools (pty_send_slash / pty_status / pty_list_agents)

- [ ] **PTY-001** `pty_send_slash` dengan `command` tunggal menulis satu request ke inbox wrapper dan langsung mengembalikan teks konfirmasi berisi `id` dan path file (`queued (id: …) — wrapper will inject "…"`); injeksi aktual terjadi asinkron oleh wrapper — `server.ts:176-186`
- [ ] **PTY-002** Setiap command divalidasi terhadap regex `/^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$/` (nama command maks 64 char, boleh `:` untuk plugin namespaced, argumen maks 256 char); pelanggaran menghasilkan error yang MENYEBUTKAN regex-nya dan nilai yang ditolak (`got: …`) — `server.ts:42,154-159`
- [ ] **PTY-003** Tepat satu dari `command` / `commands` yang boleh diisi; keduanya sekaligus ditolak dengan error `pass exactly one of \`command\` / \`commands\`, not both` — `server.ts:134-136`
- [ ] **PTY-004** `command` kosong / bukan string ditolak dengan error yang mengajari alternatifnya (`…or pass \`commands\` for a batch`) — `server.ts:149-151`
- [ ] **PTY-005** Tool bersifat SELF-ONLY: parameter `target` (bentuk lama) ditolak keras dengan teaching error yang menyebut keputusan neighbor-autonomy 2026-06-07 dan mengarahkan ke agent-bus `kind:"prompt"` untuk memerintah bot lain — `server.ts:118-130`
- [ ] **PTY-006** Guard telegram-layer diterapkan per-command (baik single maupun setiap item batch) SEBELUM ditulis ke inbox — `server.ts:160-166`
- [ ] **PTY-007** Bila wrapper tidak terdeteksi hidup, pengiriman ditolak dengan error yang mengajari solusinya: `wrapper not detected (no fresh heartbeat). Launch CC via \`mirza-cc\` instead of \`claude\` directly.` — `server.ts:169-173`
- [ ] **PTY-008** Batch di level tool: `commands` wajib array non-kosong, maksimal 8 item; error kelebihan menyebut jumlah aktual (`commands batch too long (N items, max 8)`) — `server.ts:141-146`
- [ ] **PTY-009** Batch di-gate pada versi wrapper yang SEDANG BERJALAN (bukan versi plugin ter-install): butuh `>= 0.0.7` (`BATCH_MIN_WRAPPER_VERSION`) dibaca dari state yang di-publish wrapper; bila lebih tua/tidak diketahui, error mengajari fallback: kirim sekuensial satu-satu dan minta user restart `mirza-cc` — `server.ts:36,188-199`
- [ ] **PTY-010** Batch sukses mengembalikan konfirmasi berisi `id`, jumlah command, dan urutan injeksi (`"…" → "…"` … `in order, atomically`) plus path file — `server.ts:200-210`
- [ ] **PTY-011** Semua kegagalan tool dikembalikan sebagai hasil `isError` dengan teks `error: <pesan>` — tidak pernah crash protokol MCP — `server.ts:252-258`
- [ ] **PTY-012** `pty_status` mengembalikan JSON `{ wrapper_alive: boolean, state_dir: string }` berdasarkan probe liveness wrapper — `server.ts:212-226`
- [ ] **PTY-013** `pty_list_agents` mengembalikan `{ registry_path, agents: [...] }`; tiap agent memuat `name`, `project_dir`, `state_dir`, `last_heartbeat`, `last_heartbeat_age_s`, `alive` (heartbeat lebih segar dari 30s), `wrapper_pid` — `server.ts:227-245`, `ipc.ts:173-193`
- [ ] **PTY-014** `pty_list_agents` dengan `only_alive: true` menyaring agent yang heartbeat-nya basi — `server.ts:228-232`
- [ ] **PTY-015** MCP server MENOLAK boot bila state dir tak bisa di-resolve, dengan pesan stderr yang menyebut kedua opsi konfigurasi (`CLAUDE_PROJECT_DIR` otomatis dari CC, atau `PTY_CONTROLLER_STATE_DIR` eksplisit) lalu exit(1) — `server.ts:44-56`

## 2. slash-guards (perintah telegram-layer ditolak dengan teaching error)

- [ ] **PTY-016** `/new` ditolak; error menjelaskan bahwa itu telegram-layer dan mengajari penggantinya: satu batch atomik `pty_send_slash commands:["/clear", "/rename <name>"]` — `slash-guards.ts:13-14`
- [ ] **PTY-017** `/switch` ditolak; error mengajari alternatif: inject `/resume <sessionId>` (persis yang wrapper lakukan untuk /switch) atau minta user menjalankan /switch dari Telegram — `slash-guards.ts:15-16`
- [ ] **PTY-018** `/delete` ditolak; error menjelaskan CC tidak punya padanan dan menyuruh minta user menjalankan /delete dari Telegram — `slash-guards.ts:17-18`
- [ ] **PTY-019** `/effort` ditolak; error menjelaskan confirm-picker-nya tidak bisa di-auto-confirm sehingga injeksi wedge, dan menyuruh minta user menjalankannya dari Telegram — `slash-guards.ts:19-20`
- [ ] **PTY-020** Pencocokan hanya pada kata perintah pertama (di-lowercase, argumen diabaikan); prefix yang mirip TIDAK cocok (mis. `/newer` bukan `/new`) — `slash-guards.ts:28-31`
- [ ] **PTY-021** Yang sengaja TIDAK diblok dan harus tetap bisa diinjeksi: `/clear`, `/rename`, `/compact`, `/resume`, dan plugin command (mis. `/handoff`, `/telegram:notify-user`) — `slash-guards.ts:7-10`

## 3. Kontrak playbook /new (commands/new.md)

- [ ] **PTY-022** /new memeriksa `pty_status` LEBIH DULU; bila `wrapper_alive` false, abort dan jelaskan ke user bahwa CC harus diluncurkan via `mirza-cc`, bukan `claude` polos — `commands/new.md:15`
- [ ] **PTY-023** Bila wrapper hidup, /new mengirim `pty_send_slash command:"/clear"`; efek /clear baru terjadi setelah turn AI selesai (CC mengonsumsi stdin di antara turn) — dan itu disengaja — `commands/new.md:17`
- [ ] **PTY-024** Bila permintaan berasal dari Telegram, konfirmasi singkat dikirim via reply tool SEBELUM /clear berefek, agar user punya acknowledgement — `commands/new.md:19`
- [ ] **PTY-025** Setelah mengirim /clear, respons diakhiri — tidak ada pekerjaan lanjutan; hal berikutnya yang diproses CC adalah /clear itu sendiri — `commands/new.md:21`
- [ ] **PTY-026** Error dari `pty_send_slash` disampaikan apa adanya ke user, TANPA retry — `commands/new.md:25`
- [ ] **PTY-027** Notifikasi "fresh session is ready" adalah tanggung jawab wrapper (via `/telegram:notify-user` di sesi BARU), bukan AI di sesi lama; nama plugin command wajib fully-qualified (`/telegram:notify-user`, bukan `/notify-user`) — `commands/new.md:26`

## 4. Kontrak IPC filesystem (pending/*.json)

- [ ] **PTY-028** Resolusi state dir: `PTY_CONTROLLER_STATE_DIR` (bila diset, dipakai apa adanya) > `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller`; tanpa keduanya → null (server menolak boot) — `ipc.ts:34-40`
- [ ] **PTY-029** Payload command tunggal berbentuk `{ id: <uuid>, ts: <ISO>, command: "/..." }` ditulis ke `<state>/pending/<uuid>.json` — `ipc.ts:47-64`
- [ ] **PTY-030** Payload batch berbentuk JSON array di root — `[ {command:"/a"}, {command:"/b"}, … ]` — dalam SATU file pending (satu unit atomik) — `ipc.ts:73-86`
- [ ] **PTY-031** Semua tulisan IPC atomik: tulis ke `<final>.tmp.<pid>` lalu `renameSync` ke path final, sehingga pembaca tidak pernah melihat file setengah jadi — `ipc.ts:60-63,82-85`
- [ ] **PTY-032** Versi wrapper yang berjalan dapat dibaca dari state (`wrapper.version`, JSON `{ wrapper_version }`); file hilang/rusak → null (dianggap wrapper terlalu tua) — `ipc.ts:93-102`
- [ ] **PTY-033** Perbandingan versi `versionAtLeast` gaya semver 3 segmen numerik; segmen NaN → false — `ipc.ts:105-116`
- [ ] **PTY-034** Semantik consume di wrapper: baca file → HAPUS SEGERA (mencegah double-processing bila crash di tengah) → enqueue ke antrean injeksi; dispatch PTY tidak pernah langsung dari consumer — `wrapper/src/wrapper.ts:990-1004,1055-1058`
- [ ] **PTY-035** Bentuk payload adalah tagged union: `type` (legacy) dan `kind` (baru) adalah sinonim, default `"slash"` bila keduanya absen; tipe yang dikenal: `slash`, `prompt`, `switch`, plus array=batch; tipe tak dikenal di-log dan diabaikan (tidak crash) — `wrapper/src/wrapper.ts:672-689,1074,1212`
- [ ] **PTY-036** Deteksi file pending punya dua jalur redundan: notifikasi filesystem (dengan defer 50ms + cek eksistensi, mengakomodasi rename Windows) DAN sweep berkala 2s yang melewati file `.tmp.` yang sedang ditulis — `wrapper/src/wrapper.ts:1218-1240`
- [ ] **PTY-037** JSON pending yang malformed di-log dan di-drop tanpa mengganggu antrean — `wrapper/src/wrapper.ts:1006-1012`
- [ ] **PTY-038** Ekstensi agent-bus pada payload: bila `from` ada, `hop_count > 5` menyebabkan payload di-DROP (loop prevention) dengan log; `correlation_id` di-log opaque; payload lokal (tanpa `from`) melewati cek ini — `wrapper/src/wrapper.ts:1043-1053`

## 5. Model proses wrapper (spawn, piping, signal, exit)

- [ ] **PTY-039** CC di-spawn di dalam pseudo-terminal melalui shell: Windows `cmd.exe /c <cmd>`, Unix `$SHELL -l -i -c <cmd>` (login+interactive agar shim npm `claude` ter-resolve lewat PATH/rc-files) — `wrapper/src/wrapper.ts:368-369,560-587`
- [ ] **PTY-040** Binary CC dapat dioverride via `CLAUDE_BIN` (default `claude`) — `wrapper/src/wrapper.ts:255`
- [ ] **PTY-041** Argumen CC dapat dioverride via `CLAUDE_ARGS` (string kosong = vanilla claude); default: `--dangerously-skip-permissions --dangerously-load-development-channels plugin:telegram@mirza-marketplace` — `wrapper/src/wrapper.ts:256-266`
- [ ] **PTY-042** Env anak CC selalu membawa `CLAUDE_PROJECT_DIR=<project>` dan `PTY_CONTROLLER_STATE_DIR=<state>`, sehingga plugin di dalam CC menyetujui state dir yang sama dengan wrapper apa pun cara user biasa menjalankan Claude — `wrapper/src/wrapper.ts:574-584`
- [ ] **PTY-043** Ukuran PTY diambil dari terminal user (fallback 100×30), terminal type `xterm-256color`, cwd = project dir — `wrapper/src/wrapper.ts:561-578`
- [ ] **PTY-044** Piping dua arah: stdin user (raw mode, keypress langsung tembus) → PTY; output PTY → stdout user — `wrapper/src/wrapper.ts:748-761`
- [ ] **PTY-045** Resize terminal user dipropagasikan ke PTY — `wrapper/src/wrapper.ts:764-766`
- [ ] **PTY-046** Saat CC exit, wrapper ikut shutdown dan mempropagasikan exit code CC (fallback 0) — `wrapper/src/wrapper.ts:751-754`
- [ ] **PTY-047** SIGINT di wrapper DITERUSKAN ke PTY (Ctrl+C membatalkan operasi AI di dalam CC), TIDAK membunuh wrapper — `wrapper/src/wrapper.ts:1267-1270`
- [ ] **PTY-048** SIGTERM membunuh PTY (yang kemudian memicu jalur shutdown via onExit) — `wrapper/src/wrapper.ts:1272-1275`
- [ ] **PTY-049** Shutdown bersih: unregister dari registry global, hentikan semua timer/watcher, hapus file heartbeat dan pid, kembalikan terminal dari raw mode, exit dengan code yang benar — `wrapper/src/wrapper.ts:1242-1263`
- [ ] **PTY-050** Semua aktivitas wrapper di-log dengan timestamp ISO ke stderr DAN append ke `<state>/wrapper.log` (best-effort) — `wrapper/src/wrapper.ts:271-279`
- [ ] **PTY-051** Wrapper meng-host SATU proses CC untuk seumur hidupnya; pergantian sesi terjadi DI DALAM CC (injeksi `/resume`), bukan kill+respawn proses — `wrapper/src/wrapper.ts:39-44,1171-1210`

## 6. Perilaku injeksi (pacing, queue, gate, barrier)

- [ ] **PTY-052** Injeksi slash command memisahkan teks dan Enter: tulis teks dulu, `\r` menyusul setelah `SUBMIT_DELAY_MS` (250ms) — agar `\r` tidak ditelan autocomplete picker CC (kritis untuk command namespaced seperti `/telegram:foo`) — `wrapper/src/wrapper.ts:236-243,600-603`
- [ ] **PTY-053** Semua payload melewati antrean FIFO dengan SATU drainer; drainer menunggu gate terbuka dengan polling `QUEUE_POLL_MS` (200ms) sebelum men-dispatch item berikutnya — `wrapper/src/wrapper.ts:696-744`
- [ ] **PTY-054** Setiap injeksi slash menahan gate selama `SUBMIT_DELAY_MS + MIN_INJECTION_GAP_MS` (250+1500ms) sehingga dua payload tidak pernah menyisipkan keystroke satu sama lain — `wrapper/src/wrapper.ts:231,1083`
- [ ] **PTY-055** Hold window gate bersifat monotonic: `holdFor` hanya bisa MEMPERPANJANG deadline (max), tidak pernah memendekkannya — `wrapper/src/injection-gate.ts:33-35`
- [ ] **PTY-056** Injeksi `/clear` MENGUNCI barrier: tidak ada injeksi lain sampai sesi baru terdeteksi hidup (CC bisa baru memproses /clear setelah turn AI selesai — barrier boleh bertahan bermenit-menit) — `wrapper/src/wrapper.ts:1128-1131`, `wrapper/src/injection-gate.ts:38-40`
- [ ] **PTY-057** Saat sesi baru terdeteksi, barrier dilepas TETAPI antrean masih ditahan `CLEAR_SETTLE_MS` (1500ms) + `POST_INJECTION_DELAY_MS` (1000ms) bila ada /rename yang harus mendarat dulu — payload antre tak pernah menyusup ke keystroke pertama sesi baru — `wrapper/src/wrapper.ts:846-853`, `wrapper/src/injection-gate.ts:47-50`
- [ ] **PTY-058** Safety valve barrier: bila sesi baru tidak pernah muncul dalam `CLEAR_BARRIER_TIMEOUT_MS` (10 menit), barrier dilepas paksa, `WARNING` di-log, state penantian dibersihkan, dan antrean tetap didrain (tidak deadlock selamanya) — `wrapper/src/wrapper.ts:233,718-726`, `wrapper/src/injection-gate.ts:53-62`
- [ ] **PTY-059** Payload slash dengan `confirmAfterMs` mengirim `\r` ekstra setelah delay yang di-clamp ke [50, 5000]ms (auto-confirm picker seperti /effort; tanpa picker, `\r` ekstra = submit kosong yang harmless), dan gate diperpanjang selama window itu — `wrapper/src/wrapper.ts:1097-1108`
- [ ] **PTY-060** Injeksi prompt (`type:"prompt"`) mengetik body secara ter-chunk: `CHUNK_SIZE` 100 code point per tulisan, jeda `CHUNK_DELAY_MS` 30ms antar chunk, `\r` menyusul `SUBMIT_DELAY_MS` setelah chunk terakhir — mencegah head-truncation buffer input ConPTY Windows; gate ditahan sepanjang seluruh window pengetikan + gap — `wrapper/src/wrapper.ts:246-253,617-628,1157-1168`
- [ ] **PTY-061** Chunking aman code-point (split via `Array.from`): batas chunk tidak pernah membelah surrogate pair (emoji), dan gabungan chunk selalu merekonstruksi teks asli — `wrapper/src/prompt-inject.ts:30-35`
- [ ] **PTY-062** Injeksi `/resume` (switch) menahan gate lebih lama: `SUBMIT_DELAY_MS + POST_INJECTION_DELAY_MS + MIN_INJECTION_GAP_MS`, karena swap sesi butuh waktu settle — `wrapper/src/wrapper.ts:1193-1198`
- [ ] **PTY-063** Kegagalan dispatch satu item ditangkap dan di-log; antrean lanjut memproses item berikutnya — `wrapper/src/wrapper.ts:735-739`

## 7. Kapabilitas lifecycle sesi

- [ ] **PTY-064** Deteksi first-run: bila belum ada sesi tersimpan untuk project ini, CC dimulai segar (tanpa resume) — `wrapper/src/wrapper.ts:380-388`
- [ ] **PTY-065** Startup non-first-run: wrapper me-RESUME sesi TERBARU (berdasarkan waktu modifikasi) via argumen `--resume <sessionId>` yang disisipkan sebelum argumen dasar — `wrapper/src/wrapper.ts:389-410,563-564`
- [ ] **PTY-066** Pada jalur resume, state identitas di-seed sinkron: nama sesi diambil dari snapshot statusline CC (`last-status.json`, hanya bila session_id cocok) dengan fallback ke registry nama telegram, lalu event `session-change` langsung diterbitkan — `wrapper/src/wrapper.ts:893-906`
- [ ] **PTY-067** Setelah CC start, wrapper mendeteksi sesi pertama yang materialize dan mencatat `session_id`-nya (one-shot; pada resume tidak ada sesi baru sehingga tidak memicu apa-apa — harmless) — `wrapper/src/wrapper.ts:920-929`
- [ ] **PTY-068** Pada first-run, sesi baru otomatis meng-klaim nama `idle` BILA nama itu belum dipakai di registry nama telegram: tulis registry, update state, inject `/rename idle`, tahan gate selama window injeksinya — konvensi handoff-v2: bot yang baru boot lahir READY — `wrapper/src/wrapper.ts:931-958`
- [ ] **PTY-069** Klaim `idle` yang sukses diikuti event `session-change` (sessionName `idle`) setelah pacing `POST_INJECTION_DELAY_MS` — `wrapper/src/wrapper.ts:959-967`
- [ ] **PTY-070** Bila `idle` sudah dipakai, sesi baru dibiarkan tanpa nama (state name null) dan event `session-change` tetap terbit dengan `sessionName: null` — `wrapper/src/wrapper.ts:968-978`
- [ ] **PTY-071** Saat men-dispatch `/clear`, wrapper men-snapshot himpunan sesi yang ada SECARA EAGER (aman karena CC baru memproses keystroke setelah turn berjalan selesai) dan menandai lifecycle `resetting` — `wrapper/src/wrapper.ts:1109-1136`
- [ ] **PTY-072** Setelah /clear, sistem mendeteksi sesi segar yang baru materialize dan mencatat `session_id` baru + `session_name` yang diminta (bila payload membawa `sessionName`) — `wrapper/src/wrapper.ts:829-845`
- [ ] **PTY-073** Bila /clear membawa `sessionName`, setelah sesi segar terdeteksi sistem menulis nama ke registry telegram lalu meng-inject `/rename <name>` ke sesi baru, dengan pacing agar event notifikasi mendarat SETELAH rename settle — `wrapper/src/wrapper.ts:855-884`
- [ ] **PTY-074** Payload `type:"switch"` menghasilkan injeksi `/resume <sessionId>` ke PTY hidup; state diperbarui dengan nama dari payload atau fallback registry telegram; event `session-change` terbit setelah `POST_INJECTION_DELAY_MS` — `wrapper/src/wrapper.ts:1171-1209`
- [ ] **PTY-075** Rename-arg sniffing: SETIAP slash yang diinjeksi diperiksa; bila berbentuk `/rename <name>`, state name diperbarui dan registry telegram disinkronkan (rename via PTY tidak lewat handler telegram, jadi tanpa ini registry basi) — `wrapper/src/wrapper.ts:1085-1095`, `wrapper/src/session-name.ts:10-15`
- [ ] **PTY-076** Derivasi lifecycle dari nama sesi: null→`unknown`, `idle`→`idle`, prefix `task-`→`busy`, prefix `done-`→`transitioning`, lainnya→`unknown`; `resetting` TIDAK pernah diderivasi dari nama — hanya diset eksplisit saat /clear dimulai — `wrapper/src/session-name.ts:17-30`, `wrapper/src/session-state.ts:34`
- [ ] **PTY-077** Event session-change ke system-outbox memuat `{ type: "session-change", sessionId, sessionName }` plus `id` (uuid) dan `ts` (ISO) yang ditambahkan otomatis — `wrapper/src/wrapper.ts:639-652,874-884`
- [ ] **PTY-078** /clear DI TENGAH batch menunda (suppress) notifikasi session-change-nya; finale batch (item terakhir) menerbitkan event dengan nama FINAL (setelah trailing /rename ter-sniff) — user selalu diberi tahu sesi mana yang ia darati, hanya timing-nya bergeser agar tidak melapor "(unnamed)"; /clear sebagai item TERAKHIR batch bernotifikasi normal seperti /clear standalone — `wrapper/src/wrapper.ts:660-664,1120-1127,1143-1153`

## 8. State yang dipublikasikan wrapper

- [ ] **PTY-079** `wrapper.state.json` adalah single source of truth identitas+lifecycle: `{ session_id, session_name, lifecycle, seq, updated_at_ms }`, ditulis atomik (tmp+rename) — `wrapper/src/session-state.ts:10-48`, `wrapper/src/wrapper.ts:145-149`
- [ ] **PTY-080** `seq` naik monoton +1 pada setiap update state (pembaca bisa mendeteksi urutan/perubahan) — `wrapper/src/session-state.ts:39`
- [ ] **PTY-081** Mirror legacy `wrapper.current_session_id` hanya di-(re)tulis saat patch membawa id konkret — patch lifecycle-only (mis. marker `resetting`) membiarkannya utuh — `wrapper/src/wrapper.ts:198-206`
- [ ] **PTY-082** Mirror legacy `wrapper.current_session_name` SELALU dioverwrite saat nama berubah; file kosong berarti "tak bernama" (mencegah bug staleness nama sesi lama menempel di sesi baru) — `wrapper/src/wrapper.ts:171-183,205-206`
- [ ] **PTY-083** `wrapper.heartbeat` berisi timestamp ISO, ditulis segera saat boot lalu disegarkan tiap 5 detik; kegagalan tulis tidak mematikan wrapper — `wrapper/src/wrapper.ts:768-787`
- [ ] **PTY-084** Aturan kesegaran heartbeat di sisi pembaca: hidup = heartbeat lebih muda dari 30 detik (mengakomodasi GC pause / suspend-resume) — `ipc.ts:196-222`
- [ ] **PTY-085** `wrapper.pid` ditulis saat boot dan dihapus saat shutdown bersih; probe liveness memeriksa PID dengan sinyal-0: proses hilang (ESRCH) → dianggap mati MESKI heartbeat masih segar (deteksi crash <30s); EPERM → tetap hidup; file pid absen (build lama) → verdict heartbeat saja — `wrapper/src/wrapper.ts:789-793,1254-1258`, `ipc.ts:224-249`
- [ ] **PTY-086** `wrapper.version` ditulis sekali saat boot: `{ plugin_version, wrapper_version }`, masing-masing dibaca best-effort dari manifest plugin dan package.json wrapper (gagal → null) — konsumen: gating batch (PTY-009) dan /status telegram — `wrapper/src/wrapper.ts:96-99,794-823`

## 9. Registry agent global (~/.claude/agent-registry.json)

- [ ] **PTY-087** Saat boot, wrapper mendaftarkan dirinya di registry global dengan nama = basename dari project dir, memuat `project_dir`, `state_dir`, `registered_at`, `last_heartbeat`, `wrapper_pid` — `wrapper/src/wrapper.ts:157-159,494-520`
- [ ] **PTY-088** Tabrakan nama (nama sama, project_dir beda) di-log sebagai WARNING lalu tetap dioverwrite (kedua wrapper akan berebut slot — perilaku v1 yang diketahui) — `wrapper/src/wrapper.ts:499-506`
- [ ] **PTY-089** Heartbeat registry tiap 5 detik hanya memperbarui entri MILIK SENDIRI (pid cocok); entri hilang/direbut → no-op — kegagalan di-guard agar tidak mematikan wrapper — `wrapper/src/wrapper.ts:522-534,779-785`
- [ ] **PTY-090** Saat shutdown, wrapper menghapus entrinya dari registry HANYA bila pid masih miliknya (tidak menghapus entri yang sudah direbut wrapper lain) — `wrapper/src/wrapper.ts:536-551`
- [ ] **PTY-091** Akses registry diserialisasi lintas-proses via lockfile `<registry>.lock` (exclusive create); menunggu maksimal 2 detik (spin 25ms) lalu MENYERAH dan skip update (tidak pernah blokir wrapper selamanya) — `wrapper/src/wrapper.ts:156,412-439`
- [ ] **PTY-092** Persist registry me-retry rename atomik yang gagal dengan EPERM/EBUSY (antivirus/indexer Windows memegang file sebentar): 5 percobaan backoff progresif 50/100/150/200ms; error lain langsung dilempar — `wrapper/src/wrapper.ts:466-492`
- [ ] **PTY-093** Format registry `{ schema_version: 1, agents: {...} }`; file korup/schema asing → di-reset ke registry kosong (pembaca plugin memperlakukan sama: korup = tanpa peer) — `wrapper/src/wrapper.ts:441-464`, `ipc.ts:154-166`
- [ ] **PTY-094** Re-register mempertahankan `registered_at` entri lama (bila ada) sambil menyegarkan heartbeat dan pid — `wrapper/src/wrapper.ts:507-515`

## 10. Tulisan ke direktori telegram

- [ ] **PTY-095** Event sistem (session-change) ditulis atomik ke `<telegram-state>/system-outbox/<uuid>.json` dengan `{ id, ts, ...payload }`; plugin telegram menerjemahkannya jadi pesan bot.api TANPA roundtrip AI; kegagalan hanya di-log (best-effort) — `wrapper/src/wrapper.ts:101-108,639-652`
- [ ] **PTY-096** Resolusi telegram state dir meniru logika plugin telegram: `CLAUDE_CHANNELS_DIR/telegram` bila diset, else `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram` — `wrapper/src/wrapper.ts:301-310`
- [ ] **PTY-097** Wrapper menduplikasi `setName` registry nama telegram (keputusan Option β — tanpa dependensi lintas-paket): merge entri `{ name, updatedAt }` ke `session-names.json`, tulis atomik, error di-swallow — `wrapper/src/wrapper.ts:312-334`
- [ ] **PTY-098** Wrapper juga MEMBACA `session-names.json` untuk me-resolve label sesi (fallback pada resume dan switch); dir/file/entri hilang → null — `wrapper/src/wrapper.ts:336-349`
- [ ] **PTY-099** Nama dari snapshot statusline (`last-status.json`) hanya dipercaya bila `payload.session_id`-nya PERSIS sesi yang ditanya — mencegah sesi baru mewarisi nama sesi lama dari snapshot basi — `wrapper/src/wrapper.ts:351-366`, `wrapper/src/session-state.ts:50-68`

## 11. Env vars & knob konfigurasi

- [ ] **PTY-100** `PTY_CONTROLLER_STATE_DIR` — override state dir di sisi plugin (prioritas tertinggi); wrapper MENYETELNYA untuk proses CC anak — `ipc.ts:35-36`, `wrapper/src/wrapper.ts:582`
- [ ] **PTY-101** `CLAUDE_PROJECT_DIR` — basis default state dir di kedua sisi; wrapper fallback ke `process.cwd()` bila absen — `wrapper/src/wrapper.ts:90`, `ipc.ts:37-39`
- [ ] **PTY-102** `CLAUDE_BIN` — binary CC yang di-spawn; default `claude` — `wrapper/src/wrapper.ts:255`
- [ ] **PTY-103** `CLAUDE_ARGS` — override argumen CC; default `--dangerously-skip-permissions --dangerously-load-development-channels plugin:telegram@mirza-marketplace`; string kosong = vanilla — `wrapper/src/wrapper.ts:256-266`
- [ ] **PTY-104** `AGENT_REGISTRY_PATH` — override lokasi registry agent global; default `~/.claude/agent-registry.json` (sinkron antara penulis wrapper dan pembaca plugin) — `wrapper/src/wrapper.ts:153-155`, `ipc.ts:123-125`
- [ ] **PTY-105** `CLAUDE_CHANNELS_DIR` — override basis dir channel telegram untuk penulisan outbox/registry nama — `wrapper/src/wrapper.ts:304-306`
- [ ] **PTY-106** `SHELL` — shell Unix yang membungkus spawn CC (default `/bin/sh`); Windows selalu `cmd.exe` — `wrapper/src/wrapper.ts:368-369`
- [ ] **PTY-107** Konstanta pacing injeksi (nilai saat ini = floor empiris yang harus dipertahankan atau dibuktikan aman diubah): `SUBMIT_DELAY_MS`=250, `MIN_INJECTION_GAP_MS`=1500, `CLEAR_SETTLE_MS`=1500, `CLEAR_BARRIER_TIMEOUT_MS`=600000, `QUEUE_POLL_MS`=200, `POST_INJECTION_DELAY_MS`=1000, `CHUNK_SIZE`=100, `CHUNK_DELAY_MS`=30 — `wrapper/src/wrapper.ts:209-253`
- [ ] **PTY-108** Kadens deteksi & liveness: heartbeat tiap 5s (`wrapper/src/wrapper.ts:786`), kesegaran 30s (`ipc.ts:210`), poll sesi (post-/clear & initial) 500ms (`wrapper/src/wrapper.ts:888,985`), sweep pending 2s (`wrapper/src/wrapper.ts:1240`), defer watch 50ms (`wrapper/src/wrapper.ts:1227`), `BATCH_MIN_WRAPPER_VERSION`='0.0.7' (`server.ts:36`)

## 12. Aturan validasi batch (sisi wrapper)

- [ ] **PTY-109** Payload batch harus JSON array non-kosong; array kosong ditolak dengan pesan spesifik — `wrapper/src/batch.ts:23-28`
- [ ] **PTY-110** Maksimal 8 item (`MAX_BATCH_ITEMS`); pesan error menyebut jumlah aktual dan batasnya — `wrapper/src/batch.ts:18,29-34`
- [ ] **PTY-111** Setiap item harus objek (bukan array/null) dengan field `command` string yang diawali `/` — `wrapper/src/batch.ts:36-44`
- [ ] **PTY-112** Item boleh membawa `sessionName` (harus string) — bentuk compound /clear+rename tetap hidup di dalam batch — `wrapper/src/batch.ts:46-51`
- [ ] **PTY-113** Item boleh membawa `confirmAfterMs` (harus angka non-negatif) — `wrapper/src/batch.ts:52-57`
- [ ] **PTY-114** Batch yang gagal validasi diabaikan UTUH (seluruh file) dengan alasan di log; batch valid di-enqueue kontigu dalam satu blok sinkron sehingga tidak ada payload asing bisa menyela antar itemnya (atomisitas yang tidak bisa diberikan tiga file pending terpisah) — `wrapper/src/wrapper.ts:1014-1036`

## Statistik

| Seksi | Item |
|---|---|
| 1. MCP tools | 15 |
| 2. slash-guards | 6 |
| 3. Playbook /new | 6 |
| 4. IPC filesystem | 11 |
| 5. Model proses wrapper | 13 |
| 6. Perilaku injeksi | 12 |
| 7. Lifecycle sesi | 15 |
| 8. State yang dipublikasikan | 8 |
| 9. Registry agent global | 8 |
| 10. Tulisan telegram-dir | 5 |
| 11. Env & knob | 9 |
| 12. Validasi batch | 6 |
| **Total** | **114** |
