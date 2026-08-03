### Task C1: modul murni telegram — port utuh + test

**Files:** Create di `packages/telegram-adapter/src/`: `album-buffer.ts`, `buttons.ts`, `markdown.ts`, `paginated-picker.ts`, `chunk.ts`; test masing-masing di `packages/telegram-adapter/test/`.

**Kode acuan (PORT 1:1 + test):** `plugins/telegram/{album-buffer,buttons,markdown,paginated-picker}.ts` + test-nya. `chunk.ts` = EKSTRAK dari `plugins/telegram/server.ts:477-496` + blok chunk-planning ~702-800 jadi modul mandiri (baru — perlu test baru: SCAR-046 hard-cap 4096 + batas paragraf; SCAR-047 chunk RAW dulu margin limit/2 baru convert per-chunk; SCAR-048 fallback plain-text; SCAR-049 markdown vs markdownv2 passthrough).
**Fix saat porting:** FUNC-2 di `markdown.ts` — pre-process tabel Markdown (konversi ke code-block) sebelum `telegramify-markdown` agar tidak gagal senyap; test dgn tabel GFM nyata.
**Item:** TG-091..124 subset album; SCAR-052 (shortId callback 64-byte) ikut `buttons.ts`/picker.

---

