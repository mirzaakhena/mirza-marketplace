### Task B2 — delivery hostd→cc-stub — LAPORAN IMPLEMENTASI

**Status:** DONE

**File yang disentuh** (sesuai batas yang diizinkan):
- `packages/hostd/src/server.ts` — tambah `session.register {bot_id}` (Map bot_id→socket, cleanup di `socket close`), `pushEvent(botId, method, params)`, `isRegistered(botId)`. Handler `doctor` & kode error lama (-32600/-32601/-32700) tidak diubah.
- `packages/hostd/src/bus/delivery.ts` (baru) — `deliverOnce(db, deps)`, `startDelivery(db, deps, opts?)`, tipe `DeliveryDeps`/`DeliveryOptions`/`DeliveryStats`. Validasi payload via zod (`content: string`, `meta: Record<string,string>`) SEBELUM push; meta non-string → `fail()` dengan reason mengandung "SCAR-056" (bukan drop senyap).
- `packages/hostd/src/doctor.ts` — `doctorReport(deps?: { db? })`; tanpa deps perilaku identik fase 0; dengan `deps.db`, komponen `bus` = JSON `busStats(db)` dengan `oldest_unacked_s` dijepit ≥ 0 (docstring mendokumentasikan deferred SCAR ts-caller-supplied dari review B1, tanpa menyentuh bus/bus.ts).
- `packages/hostd/src/index.ts` — re-export `./bus/delivery`.
- `packages/hostd/test/delivery.test.ts` (baru), `packages/hostd/test/server.test.ts` (perluasan), `packages/hostd/test/doctor.test.ts` (adaptasi minimal, test lama tetap utuh).

**Desain kunci:**
- `deliverOnce` menemukan target bot lewat `SELECT DISTINCT to_agent` dari baris `bus_queue` yang siap-klaim (bukan lewat enumerasi registry terpisah), lalu drain FIFO per bot pakai `claimNext` sampai `null` (aman dari infinite-loop karena `fail()` menjadwalkan `next_attempt_at` di masa depan).
- `push()` selalu dipanggil; `isRegistered()` hanya dipakai memperjelas reason text saat gagal (offline vs push-error) — tidak mengubah alur ack/fail.
- Karena `bus_queue` tak punya kolom "reason" per-attempt, test SCAR-056 memverifikasi reason lewat `bus_dead` (dorong ke 8 percobaan) — pendekatan pakai API publik saja, tanpa mock module.

**Verifikasi:**
- `bun test packages/hostd packages/shared` → 158 pass, 0 fail (337 expect calls).
- `bunx tsc --noEmit` → exit 0.

**Concerns:**
1. Registry `bot_id→socket` di server.ts bersifat module-scoped (single-process daemon) — cukup untuk fase ini, tapi bila hostd nanti perlu multi-instance/testing paralel, perlu API reset/instance eksplisit.
2. `deliverOnce` tidak memfilter `kind` envelope (memproses apa pun yang ada di `to_agent` yang sama) — aman selama hanya `channel-inbound`/`prompt` yang pernah dirutekan ke bot_id cc-stub di fase ini; bila kelak ada kind lain berbagi `to_agent` yang sama, perlu filter eksplisit agar tak salah gagal-kirim envelope non-channel.
3. Wiring penuh ke `main.ts` (buka db + `startDelivery` production) sengaja TIDAK dilakukan — di luar daftar file yang diizinkan untuk task ini; perlu task lanjutan.
4. Repo kerja punya perubahan uncommitted dari task paralel lain (telegram-adapter, config.ts, access.ts, gate.ts, poller.ts, dll) — tidak disentuh, tidak di-commit, sesuai instruksi.

## Fix pass 1

**Reviewer feedback fixes:**

1. **Bug fix: packages/hostd/src/server.ts `pushEvent()` (line 43-49)**
   - Saat ini: `sock.write(...); return true;` → selalu ack envelope meski write gagal, bertentangan SCAR-056.
   - Fix: `return sock.write(...)` → return nilai write() yang sebenarnya (boolean), docstring diperbaharui untuk menyebut SCAR-056 dan silent-loss risk.

2. **Test: packages/hostd/test/delivery.test.ts**
   - Tambah test case "registered tapi push gagal" di `deliverOnce — stub offline lalu retry` describe block.
   - Setup: fakeDeps dgn `isRegistered()=true, push()=false`.
   - Verifikasi: envelope fail (bukan ack), reason mencatat "push ke cc-stub gagal", attempts di-reschedule.

3. **Docstring: packages/hostd/src/bus/delivery.ts `processOne()`**
   - Tambah section DEVIASI DARI BRIEF: ack saat ini setelah write socket BERHASIL, BELUM menunggu confirm balik dari cc-stub.
   - Catatan: cc-stub belum ada protokol confirm eksplisit; follow-up task assembly D1 akan implementasi confirm balik sebelum ack.

**Test & typecheck results:**
- `bun test packages/hostd packages/shared` → **159 pass, 0 fail** (342 expect calls).
- `bun run typecheck` → **exit 0** (no type errors).

**Files modified (not committed):**
- `packages/hostd/src/server.ts`
- `packages/hostd/src/bus/delivery.ts`
- `packages/hostd/test/delivery.test.ts`
