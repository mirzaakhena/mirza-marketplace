# Task X1 report — shim writer legacy files (Fase 2)

STATUS: DONE

## Ringkasan test

- `bun test packages/hostd packages/shared` → **398 pass, 0 fail** (875 expect calls, 25 file), termasuk file baru:
  - `packages/hostd/test/legacy-writer.test.ts` — 23 pass (54 expect).
  - `packages/shared/test/atomic-write.test.ts` — 7 pass (13 expect).
- `bun run typecheck` (`tsc --noEmit`) → **exit 0**.
- Golden-key coverage (recon-hooks.md §D / recon-wrapper.md §F, key EXACT):
  - `wrapper.state.json` → `{session_id, session_name, lifecycle, seq, updated_at_ms}` (compact JSON, no pretty-print — matches kode acuan `writeSessionState`).
  - `wrapper.current_session_id` — overwrite HANYA saat id konkret (diverifikasi: patch id:null tidak menimpa).
  - `wrapper.current_session_name` — SELALU overwrite, `null` → file kosong `""`.
  - `system-outbox/<uuid>.json` → `{id, ts, type:"session-change", sessionId, sessionName}` — camelCase, sengaja BEDA casing dari wrapper.state.json (diverifikasi persis, bukan salah ketik).
  - `wrapper.heartbeat` — ISO string plain text.
  - `wrapper.pid` — plain text angka (bukan JSON), dihapus saat `onShutdown`.
  - `wrapper.version` → `{plugin_version, wrapper_version}` (key persis, bukan camelCase).
  - `~/.claude/agent-registry.json` → `{schema_version:1, agents:{<name>:{project_dir, state_dir, registered_at, last_heartbeat, wrapper_pid}}}`.
- Atomic tmp+rename + retry SCAR-022 (EPERM/EBUSY, backoff 50/100/150/200ms, 5 attempt) diverifikasi lewat fsOps injeksi (rename gagal 1-2x lalu sukses → transparan; exhaust 5x → propagate; error non-retryable seperti ENOENT → tidak diretry).
- Lock O_EXCL `agent-registry.json.lock`: dua `onBoot` konkuren untuk bot berbeda → registry akhir punya 2 entry (tidak korup); writer kedua yang lock-nya sudah dipegang (disimulasikan via file `.lock` pre-existing) → menunggu/retry lalu berhasil setelah lock dilepas; timeout lock (tanpa pernah dilepas) → melempar error, bukan hang.
- `seq` increment: dites naik 1→2→3 pada bot sama; dan dites RESUME dari `wrapper.state.json` yang sudah ada di disk (seq 41 → 42), bukan reset ke 1 setiap proses restart hostd.
- Registry name parity: entry key = `basename(bot.workspace)` (kode acuan `SELF_AGENT_NAME`), BUKAN `bot.id` verbatim — dites eksplisit dengan id ≠ basename workspace.

## Desain API (interpretasi brief)

`createLegacyWriter({stateDirFor, homeDir, botConfig})` — semua method (`onSessionChange`, `onHeartbeat`, `onBoot`, `onShutdown`, `updateRegistryHeartbeat`) menerima `botId: string` (bukan objek `BotConfig` penuh) sebagai argumen pertama, konsisten dengan konvensi hostd lain (`sessions-store.ts`'s `setLatestSessionLifecycle(db, botId, ...)`). Tiga opsi factory:
- `stateDirFor: (botId) => string` — path dir pty-controller, test-injectable langsung ke tmp dir (production: `<bot.workspace>/.claude/channels/pty-controller`). Telegram state dir DITURUNKAN dari hasil `stateDirFor` (sibling `telegram/`), bukan resolver terpisah — jadi test override tetap dapat path telegram yang koheren tanpa perlu `bot.workspace` asli.
- `homeDir: string` — utk `agent-registry.json`, injectable ke tmp (tidak pernah menyentuh `~/.claude` asli).
- `botConfig: (botId) => BotConfig` — HANYA dipakai utk entry agent-registry (`project_dir`, dan nama key registry via `basename(workspace)`).

Semua tulisan file lewat util baru `@mirza-harness/shared`'s `atomicWriteFile` (tmp+rename + retry SCAR-022, non-blocking `setTimeout` sleep — BUKAN busy-wait/`Bun.sleepSync` kode acuan, demi tidak memblokir event loop hostd; prinsip sama dgn `pending-consumer.ts`'s `withRetry`). Lock O_EXCL registry di-port dari `plugins/agent-bus/registry.ts` dengan perubahan sama: retry non-blocking, bukan busy-wait.

`PENSIUN_DATE = 2026-09-01T00:00:00.000Z` (konstanta + `isExpired(now?)` — standalone function DAN method di writer instance, keduanya dites).

## File

- `packages/hostd/src/shim/legacy-writer.ts` (baru)
- `packages/hostd/test/legacy-writer.test.ts` (baru)
- `packages/shared/src/atomic-write.ts` (baru — belum ada dari fase 1, dicek dulu via grep sebelum dibuat)
- `packages/shared/test/atomic-write.test.ts` (baru)
- `packages/shared/src/index.ts` (+1 baris export)

Tidak menyentuh `pending-consumer.ts`, `session-ops.ts`, atau `supervisor.ts`/`supervisor.test.ts` — perubahan pada file-file itu terlihat di `git status` tapi berasal dari task S2 paralel, bukan dari task ini (diverifikasi tidak ada Edit/Write dari sesi ini ke file-file tsb). Tidak ada `git add`/`commit`/`push`/`bun install` dijalankan.

## Concerns

1. **Interpretasi "bot" argumen** adalah keputusan desain saya (botId string, bukan BotConfig penuh) karena brief tidak eksplisit — konsisten dgn pola hostd lain, tapi kalau caller nanti (hostd's event dispatcher) sudah punya `BotConfig` penuh di tangan, wiring cukup pass `bot.id`.
2. **Registry key = `basename(workspace)`, bukan `bot.id`** — demi paritas persis dgn kode acuan `SELF_AGENT_NAME` (peer lama baca registry via basename). Jika convention hostd's fleet menjamin `bot.id === basename(workspace)` selalu, ini tidak masalah; kalau tidak, perlu dikonfirmasi apakah peer lama benar2 masih relevan sebagai reader di titik integrasi X1 dipasang.
3. **`seq` di-seed dari file on-disk hanya sekali per proses** (in-memory cache setelahnya) — mirror pola `sessionState` module-scoped kode acuan; race lintas-proses (dua hostd instance menulis bot yang sama) tidak dijaga (di luar scope — kode acuan juga single-writer per wrapper).
4. Belum ada wiring nyata ke `doctor.ts` untuk memakai `isExpired` (brief hanya minta konstanta+method tersedia, wiring warning eksplisit didokumentasikan sbg target Fase 3) — tidak menyentuh `doctor.ts`.

## Fix pass 1 (atomic-write tmp cleanup)

**SCAR-022 hygiene**: `atomicWriteFile` sekarang melakukan best-effort `fs.unlink(tmpPath)` di jalur throw (baik non-retryable error maupun retry exhausted) sebelum rethrow original error. Tmp file tidak lagi menumpuk di daemon hostd yang jalan lama.

- **Code change**: `packages/shared/src/atomic-write.ts` — wrap `fs.unlink(tmp)` dalam try/catch di condition `if (!isRetryableFsError(err) || attempt >= SCAR_022_RETRY_BACKOFF_MS.length)` sebelum `throw err`.
- **Tests added**: 2 baru di `packages/shared/test/atomic-write.test.ts`:
  1. `non-retryable error cleans up tmp file` — throw EPERM, verifikasi tmp bersih.
  2. `retry exhausted cleans up tmp file` — exhaust 5x EBUSY, verifikasi tmp bersih.
- **Result**: `bun test packages/shared` → **90 pass, 0 fail** (143 expect calls, tmp cleanup diverifikasi).
