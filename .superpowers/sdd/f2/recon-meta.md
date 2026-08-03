# Recon Fase 2 — meta-commands (hasil subagent, 2026-07-04)

Sumber: meta-commands.ts (1249) + test (1668, ~140 test) + sessions-list/paginated-picker/archive-store/current-session-info/session-name-rules/session-names-registry/context-renderer.

## A. Alur per command (tryRouteMetaCommand :305 — command dikenal SELALU consumed, tak pernah jatuh ke AI)

- /new <name> (:363): validasi nama (no-space ≤64 CRLF→space) → guard CLAUDE_PROJECT_DIR + heartbeat fresh <30s → nama unik di session-names.json → tulis pending {command:"/clear", sessionName}. Tanpa ack; banner via system-outbox. Edge: nama dipakai → tolak; >64 truncate diam; case-insensitive match.
- /switch (:553): guard → baca current_session_id → listProjectSessions (exclude current) → picker (meta:switch_<shortId>, _page_<N>, cancel); map in-memory SEMUA sesi. Tap → pending {type:"switch", sessionId, sessionName} → edit pesan 🔀. Edge: 0/1 sesi → info; picker expired → pesan jelas.
- /rename <name> (:415): validasi + unik kecuali milik sendiri → pending {command:"/rename <name>"} → MIRROR registry langsung by current_session_id → balas ✏️ from-to.
- /delete (soft=archive :619) & /delete hard (:666): picker exclude current, prefix meta:archive_* / meta:delete_*; tap → confirm prompt; confirm archive → addArchived + rename registry <name>__<shortId>; confirm hard → re-check current (race tap↔confirm) → rmSync jsonl + removeName. Routing order: `/delete hard all` > `/delete all` > `/delete` > `/delete hard` (:329).
- /delete all & /delete hard all (:713,:746): snapshot modul-level → satu confirm+cancel ber-count → loop (skip current/error individual) → laporan N archived/deleted · M skipped.
- /effort (:483,:514): lihat C.
- Callback meta:* tak dikenal → consumed, ack "Unknown meta action" (:1218).

## B. Pemetaan filesystem → supervisor API

| Command | Baca | Tulis | API usulan |
|---|---|---|---|
| /new | heartbeat, session-names.json | pending {command:"/clear",sessionName} | supervisor.clearSession(bot,{sessionName}) |
| /switch picker | current_session_id, jsonl ~/.claude/projects/<enc>/, sessions/<pid>.json, session-names, archived | — | supervisor.listSessions(bot) |
| /switch tap | map in-memory | pending {type:"switch",sessionId,sessionName} | supervisor.resume(bot,sessionId) |
| /rename | current_session_id, session-names | pending {command:"/rename"}, session-names mirror | supervisor.rename(bot,name) |
| /delete soft | enumerasi + current | archived-sessions.json, session-names suffix | supervisor.archiveSession — TANPA pty |
| /delete hard | + jsonl | rmSync jsonl, removeName | supervisor.hardDeleteSession |
| bulk | loop | loop | supervisor.bulkArchive/bulkDelete(exceptCurrent) |
| /effort | last-status.json (marker level) | pending {command:"/effort <lvl>", confirmAfterMs:500} | supervisor.setEffort — WAJIB bawa confirmAfterMs |

Catatan: /switch dkk BUKAN slash CC asli (SCAR-036). API in-process menggantikan file-drop, TAPI liveness gate (heartbeat) & current-session source of truth perlu equivalent: supervisor.isAlive(bot), supervisor.currentSessionId(bot).

## C. /effort dual-policy persis

- Telegram: pending {command, confirmAfterMs:500}; wrapper kirim \r submit → tunggu confirmAfterMs (clamp [50,5000] SCAR-008) → \r kedua commit confirm-picker CC (PTY-059).
- AI (pty_send_slash): DIBLOKIR TOTAL di slash-guards — struktural: tool tak punya param confirmAfterMs, inject langsung = TUI wedge.
- Fase 2: API in-process tanpa PTY → racing tak perlu; kalau tetap via PTY, pertahankan 500ms persis (battle-tested).

## D. Picker & shortId (kontrak dipertahankan)

- MAX_SESSIONS_PER_PAGE=6, label 60 char+…, nav ⬅️/📄 N/M(noop)/➡️ (skip kondisional), ❌ Cancel; page clamp [1,totalPages].
- State in-memory (SCAR-051): 5 struktur modul-level (switch/delete/archive picker+sessions, archiveAll, deleteAll); process-lifetime; restart → "expired" eksplisit.
- shortId (SCAR-052): sessionId.replace(/-/g,'').slice(0,8).toLowerCase(); SHORT_ID_RE /^[0-9a-f]{8}$/; map = sumber kebenaran (shortId bisa tabrakan teoretis).

## E. Test: portable vs terikat FS

Portable murni: parseEffortInput (6), extractCurrentEffortLevel (parse-tolerant), renderPickerPage, semua assert shape payload/button/label/nav.
Terikat FS lama (refactor ke spy supervisor API): test mkProject+setHeartbeat+listPending; /delete hard dgn fake homedir jsonl; heartbeat stale/fresh (behavior "stale >30s → tolak dgn pesan jelas" = acceptance, mekanisme berubah).
Tetap valid: registry session-names.json & archived-sessions.json (state plugin-side, kemungkinan bertahan).

## F. TG-017..055 & TG-175..185: portable vs butuh pty hidup

Portable (mock disk saja): TG-017, 018, 028-031, 034, 036, 038, 040, 043, 048-050, 052-055, TG-175..184.
Butuh pty/supervisor hidup (acceptance fase 2): TG-019/020/026/035/039 (liveness gating), TG-021/022 (efek /clear nyata), TG-025/032/033 (rename/resume nyata), TG-041/042/046/047 (delete + race current live), TG-051/053 (confirmAfterMs nyata), TG-185 (refresh dari pid-files CC nyata).
Garis pemisah: "lulus dengan FS palsu tanpa proses CC hidup?" ya=portable, tidak=fase-2 core.
