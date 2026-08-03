### Task X2: shim consumer pending/*.json (paralel wave 1)

**Files:** `packages/hostd/src/shim/pending-consumer.ts` + test.
**Kode acuan:** wrapper.ts 987-1240 (consumePending, fs.watch+sweep) + `plugins/pty-controller/ipc.ts` & `plugins/agent-bus/prompt-compose.ts` (format payload: `{id,ts,command}` | array batch | `{id,ts,type:"prompt",from,text,hop_count}`).
**Perilaku:** watch+sweep dir pending per bot pilot (SCAR-021 defer 50ms + sweep interval; SCAR-022 retry rename) → validasi zod (titik tunggal; payload rusak → log + karantina `.rejected-<ts>`, terlihat doctor) → prompt → bus `kind:'prompt'`; command/batch → antrean injeksi supervisor (S1; sebelum S1 ada: enqueue bus kind baru `inject-request` yang S1 konsumsi). Idempotency by id (LOSS-3).

