### Task M1: meta-commands port → supervisor (wave 4)

**Files:** `packages/telegram-adapter/src/meta-commands.ts` + test (port dari 1249 baris + test portable dari 1667 baris).
**Kode acuan:** recon-meta §A/§D/§E — routing `tryRouteMetaCommand` + picker paginasi (MAX 6/hal, shortId 8-hex, state in-memory SCAR-051 dipertahankan + pesan expired) + konfirmasi archive/delete/bulk; filesystem ops DIGANTI panggilan session-ops (S2) via deps injectable. Wiring inbound pipeline: intercept meta-command SEBELUM deliver (ganti stub 'meta-command-unhandled-fase1' C4; gate SEC-2 sudah ada). Test portable diangkut (assert panggilan API, bukan file).

