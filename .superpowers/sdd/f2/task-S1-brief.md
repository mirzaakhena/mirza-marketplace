### Task S1: bot-supervisor core — spawn holder + injection queue ACK + barrier

**Files:** `packages/hostd/src/supervisor/{supervisor.ts,injection.ts}` + test; modif `main.ts` (wiring per bot), `doctor.ts` (komponen supervisors real).
**Kode acuan:** wrapper.ts 654-745 (InjectionGate/queue/drain; konstanta 209-253) + 825-985 (lifecycle) — logika diangkut, jsonl-polling DIBUANG.
**Perilaku:** spawn/restart pty-holder per bot (backoff eksponensial; status utk doctor); antrean injeksi ber-id: item {id, kind:'slash'|'text'|'batch[]', payload, state} — batch kontigu atomik (ambiguitas #1); gate: MIN_INJECTION_GAP, POST_INJECTION_DELAY, hold saat lifecycle 'resetting' (clear-barrier) — DILEPAS oleh event `session.started` dari hook (H1), timeout 10-menit turun jadi ALARM doctor (SCAR-002..006, SCAR-030/031); `/clear` → set sessions.lifecycle='resetting' + kirim inject-slash; ack per item: sukses = sinyal balik semantik (SessionStart utk /clear; sessions.name berubah utk /rename) — gagal → retry/dead-letter terlihat (IDEA-2). Slash-guards: validasi regex + blokir telegram-layer + `/effort` dari jalur AI (SEC-3 fix: argumen `[^\x00-\x1f]{0,256}`; SCAR-036/037).
**Doctor:** `supervisors: {<bot>: {holder:'running'|'dead', queue:N, awaiting_barrier:bool, last_ack_s}}`.

