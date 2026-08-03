# Task H2 Fase 2 — hook Stop reply-guard v2 (fix FUNC-3)

## STATUS: SELESAI

## Deliverables
- `packages/cc-stub/hooks/reply-guard.ts` — Stop hook. Exports pure functions
  `isReplyToolName`, `analyzeTranscript`, `decideStop` + thin stdin/stdout
  entrypoint (`main`), mirroring `trailer-guard.ts`'s pattern exactly.
- `packages/cc-stub/hooks/hooks.json` — added a `Stop` entry
  (`bun run ".../hooks/reply-guard.ts"`). Existing `PreToolUse` (trailer-guard)
  and `SessionStart` (session-start.ts, added meanwhile by a parallel task)
  entries left untouched.
- `packages/cc-stub/test/reply-guard.test.ts` — 18 tests (28 expects): the 5
  brief-mandated FUNC-3 scenarios + `isReplyToolName`/`analyzeTranscript` unit
  coverage + edge cases (malformed lines, tool_result-only, no-reply-at-all,
  react-doesn't-count, multiple tools before final reply).

## Jalur dipilih: LOKAL (bukan hostd RPC)

Dihitung sepenuhnya di dalam hook, tanpa panggilan `stop.check` ke hostd.
Alasan: stdin Stop hook sudah membawa `transcript_path`, sebuah JSONL yang
memuat DUA hal yang dibutuhkan sekaligus — tag inbound telegram
(`<channel source="telegram" ...>`, literal di teks user turn) dan seluruh
`tool_use` turn ini termasuk reply tool — semuanya sudah berurutan waktu di
disk. Jalur hostd akan (a) menambah IPC round-trip persis saat Stop, momen
yang mungkin bertepatan dengan clear-barrier/teardown hostd; (b) tetap
mengharuskan hook mem-parse transcript untuk menemukan chat_id/message_id yang
mau dikirim ke hostd (messages-store dikunci per bot_id+channel+chat_id+
message_id, bukan per transcript session) — jadi parsing tidak benar-benar
dihindari, cuma dipindah; (c) membuat logika inti butuh fixture Database
untuk diuji, dibanding fungsi murni atas fixture JSONL sintetis. Lokal lebih
sederhana dan lebih test-able pada ketiga sumbu itu — dipilih.

Konsekuensi: saya TIDAK menyentuh `packages/hostd/src/rpc-handlers.ts`,
`server.ts`, atau `stop.check`. (Catatan koordinasi: kedua file itu memang
sudah berstatus modified di working tree saat saya mulai — tampaknya sedang
disentuh task paralel lain; saya tidak menyentuhnya sama sekali dan tidak
menjalankan test di sana selain lewat `bun test packages/hostd` yang sudah
lulus bersama.)

## Algoritma (FUNC-3 fix)

`decideStop`: allow jika `stop_hook_active` true (anti-loop dipertahankan)
atau transcript bukan telegram-driven. Jika keduanya lolos: block iff
`latestReplyPos <= latestNonReplyToolPos` (posisi tool_use terakhir yang
BUKAN reply-tool vs posisi reply-tool terakhir, keduanya default -1 bila tak
pernah terjadi, urutan kronologis transkrip). Satu perbandingan ini otomatis
menutupi kelima skenario wajib tanpa perlu penanganan khusus kasus
"tanpa tool sama sekali" (reply selalu "setelah" -1).

`isReplyToolName`: regex `/(^|[_.])reply$/i` — cocok dengan nama mentah
cc-stub (`"reply"`) maupun bentuk ber-prefix MCP apa pun
(`mcp__cc-stub__reply`, `mcp__plugin_telegram_telegram__reply`), TIDAK cocok
dengan `react`/`download_attachment`/`get_message_by_id` — hanya "reply"
sungguhan yang dianggap jawaban substantif.

## Ringkasan test
- `bun test packages/cc-stub packages/hostd` → **375 pass, 0 fail** (827
  expect calls, 21 file), termasuk 18 test baru reply-guard.
- `bunx tsc --noEmit` (root, mencakup semua package via tsconfig project) →
  **exit 0**.
- 5 skenario wajib dari brief semua PASS sebagai test terpisah:
  1. inbound→ack→tool→STOP tanpa reply lagi → **BLOCK** (kasus yang di guard
     lama LOLOS salah — diverifikasi eksplisit).
  2. inbound→ack→tool→reply final→STOP → allow.
  3. bukan telegram-driven → allow.
  4. `stop_hook_active` true → allow (anti-loop).
  5. inbound→langsung reply final tanpa tool → allow.

## Concerns
- Skema transcript JSONL Claude Code bersifat internal dan bisa berubah antar
  versi (dikonfirmasi via dokumentasi resmi lewat agent claude-code-guide).
  `analyzeTranscript` sengaja defensif: skip baris/blok yang tidak dikenali
  alih-alih throw, dan hanya membaca subset field kecil (`type`,
  `message.content`, lalu di dalam blok konten `type`/`text`/`name`). Jika
  skema field-level ini berubah drastis (mis. tool_use pindah dari
  `message.content[]` ke struktur lain), guard akan diam-diam berhenti
  mendeteksi telegram-driven/tool-use (fail-open by construction) — bukan
  crash, tapi juga bukan lagi efektif; perlu re-verifikasi saat upgrade CC
  besar.
- Kegagalan internal di `main()` (bug tak terduga) sengaja fail-OPEN (allow
  stop), kebalikan dari `trailer-guard.ts` yang fail-closed — didokumentasikan
  di kode: Stop yang salah-block bisa menjebak agent dalam loop tanpa jalan
  keluar mekanis, sedangkan Stop yang salah-allow cuma kembali ke perilaku
  sebelum hook ini ada.
- `hooks.json` disentuh HANYA menambah entry `Stop` (additive); entry
  `SessionStart` sudah ada di file saat saya mulai (ditambahkan task paralel
  lain, bukan saya) dan `PreToolUse` tidak diubah sama sekali.

## Fix pass 1

Reviewer menemukan 1 regresi (M) + 2 gap test (I) pada
`packages/cc-stub/hooks/reply-guard.ts` / `test/reply-guard.test.ts`. Semua
tiga item diperbaiki; hanya dua file itu yang disentuh.

1. **(M, regresi) `telegramDriven` sticky session-wide.** Sebelumnya
   `telegramDriven` di-set sekali (`if (e.type === "user" && !telegramDriven)`)
   dan tak pernah direvisi — begitu SATU inbound telegram pernah muncul di
   transcript, setiap turn LOKAL berikutnya (tanpa tag telegram) ikut dianggap
   telegram-driven selamanya, dan `latestReplyPos`/`latestNonReplyToolPos`
   ikut terakumulasi lintas turn, sehingga tool lokal pasca-siklus-telegram-
   selesai bisa salah ter-BLOCK.
   Fix: `analyzeTranscript` sekarang me-OVERWRITE `telegramDriven` dari hasil
   match turn user TERBARU saja (bukan OR akumulatif), dan me-RESET
   `latestReplyPos`/`latestNonReplyToolPos` ke -1 di setiap awal turn user
   genuine (baris user yang punya `.text`, bukan echo tool_result kosong).
   Field baru `latestInboundPos` (line index inbound-telegram terakhir, mirror
   `latestInboundIdx` di `telegram-reply-guard.ts` lama) ditambah ke
   `TranscriptAnalysis` untuk paritas/observability — keputusan block sendiri
   tidak lagi perlu membandingkannya secara eksplisit karena (1)+(2) di atas
   sudah membuat telegramDriven & posisi reply/tool konsisten "current-turn-
   only" (didokumentasikan detail di komentar `analyzeTranscript`).
   Catatan: literal AND-gate "`latestNonReplyToolPos > latestInboundPos`" yang
   disebut di brief review TIDAK dipakai apa adanya — saya verifikasi itu
   meregresi test existing "inbound, no reply, no tool at all -> block"
   (-1 tidak pernah > posisi manapun). Reset-per-turn di atas mencapai maksud
   yang sama tanpa regresi tsb.
   Test baru: `decideStop — telegramDriven must reflect the LATEST inbound,
   not any-ever (fix-pass item 1)` — termasuk PoC reviewer persis (inbound
   telegram selesai lengkap → turn lokal baru tanpa tag → tool lokal → STOP →
   ALLOW).

2. **(I) Same-message array-order (skenario c).** Ditambah 2 test eksplisit
   dua-arah: `[reply, Bash]` dan `[Bash, reply]` dalam SATU content array
   (satu message assistant). Kebijakan yang didokumentasikan & diassert:
   untuk tool_use paralel sejati dalam satu message, urutan array dipakai
   sebagai proxy urutan kronologis (elemen pertama = lebih awal) — deliberate
   choice, bukan kebetulan implementasi. `[reply, Bash]` → BLOCK (reply
   dianggap sebelum tool), `[Bash, reply]` → ALLOW (tool dianggap sebelum
   reply).

3. **(I) `TELEGRAM_MARKER_RE` terlalu ketat.** Regex lama
   `/<channel\s+source="telegram"/i` mensyaratkan `source` jadi atribut
   pertama. Dilonggarkan ke pola acuan `telegram-reply-guard.ts` lama:
   `/<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/i` (case-insensitive
   ditambahkan) — toleran urutan atribut, tetap fail-safe (masih perlu literal
   `<channel` + `source="..telegram.."`). Test baru menyertakan tag dengan
   `chat_id`/`message_id` sebelum `source`, memverifikasi baik
   `analyzeTranscript` maupun `decideStop` end-to-end.

Verifikasi: `bun test packages/cc-stub` → 119 pass, 0 fail (185 expect calls).
`bun run typecheck` (tsc --noEmit) → exit 0. Lima skenario wajib FUNC-3 asli
(a-block, b-allow, non-telegram allow, stop_hook_active allow, langsung-reply
allow) tetap lulus tanpa perubahan assertion. Tidak ada git add/commit/push
yang dilakukan.
