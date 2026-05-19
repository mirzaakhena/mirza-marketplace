# pty-controller — Claude Code plugin

Plugin orisinal (bukan fork) yang memungkinkan **Claude Code mengirim slash command ke sesinya sendiri** dengan cara melewatkan request lewat parent process bernama `mirza-cc`. Wrapper itu menjalankan `claude` di dalam `node-pty` pseudo-terminal, lalu menulis keystrokes ke stdin CC — jadi command seperti `/clear`, `/compact`, `/resume <id>` benar-benar dieksekusi di level PTY, bukan di-fake oleh AI state.

Kenapa perlu? AI di dalam CC tidak bisa "memerintahkan dirinya sendiri" untuk clear context — itu state internal CC, dan satu-satunya cara legit untuk men-trigger-nya adalah keystroke dari TTY. Dengan plugin + wrapper ini, AI tinggal panggil satu MCP tool dan wrapper yang melakukan injeksinya.

## Arsitektur singkat

```
[ user terminal ]
        │  (raw stdin)
        ▼
[ mirza-cc wrapper (node-pty, src/wrapper.ts) ]
        │  bidirectional pipe (PTY stdin/stdout)
        ▼
[ claude CLI ]   ←─ MCP stdio ──→   [ pty-controller MCP server (server.ts) ]
        ▲                                       │
        │  inject keystrokes                    │  write JSON request
        │                                       ▼
        └─────────── reads pending/<uuid>.json ◄─ <project>/.claude/channels/pty-controller/pending/
                                  ▲
                                  │  heartbeat every 5s
                       <state>/wrapper.heartbeat
```

Plugin alone tidak berguna — dia cuma menulis file JSON ke direktori inbox. Wrapper-lah yang baca file itu dan inject keystrokes ke PTY. Kalau wrapper tidak jalan, MCP tool `pty_send_slash` return error eksplisit ("wrapper not detected") dan slash command jadi no-op.

## Instalasi plugin

Lihat [README marketplace](../../README.md#instalasi-di-claude-code) untuk langkah `/plugin install`. Pilih scope **user** saat ditanya, sama seperti plugin lain.

Plugin sendiri tidak butuh konfigurasi — manifest di `.claude-plugin/plugin.json` mendeklarasikan MCP server `pty-controller` dengan command `bun server.ts` (lewat script `start` di `package.json`).

## Instalasi wrapper (`mirza-cc`)

Source wrapper ada di [`wrapper/`](./wrapper) di folder plugin yang sama. Wrapper bukan sesuatu yang di-install ke Claude Code — dia adalah binary terpisah yang Anda jalankan dari terminal, dan dia yang akan men-spawn `claude` untuk Anda.

```bash
cd plugins/pty-controller/wrapper
npm install
```

`npm install` akan menarik prebuilt native binary `node-pty` untuk platform Anda. Untuk platform tidak umum (Alpine, ARM Windows) mungkin compile from source — install build tools dulu.

Prereq:

- Node.js 20+ (dibutuhkan oleh prebuild `node-pty`).
- `claude` ada di `PATH`. Verifikasi: `claude --version`.
- Windows: ConPTY sudah bundled di Windows 10 1809+, tidak perlu install apa-apa.

Tidak ada step "install ke `PATH`". Anda jalankan langsung dari folder wrapper via `npm run wrapper`.

## Menjalankan CC lewat wrapper

```bash
cd plugins/pty-controller/wrapper
npm run wrapper
```

Yang berbeda vs. `claude` polos:

1. **Wrapper menentukan dirinya yang menjalankan `claude`**, bukan Anda. Default args yang di-pass:
   ```
   --dangerously-skip-permissions
   --dangerously-load-development-channels plugin:telegram@mirza-marketplace
   ```
   Override dengan env `CLAUDE_ARGS` (kosongkan untuk vanilla, atau pass string custom). Binary CC bisa di-override dengan `CLAUDE_BIN`.

2. **Auto-resume**. Saat start, wrapper memeriksa `~/.claude/projects/<encoded-cwd>/` dan kalau ada session `.jsonl` di sana, dia spawn `claude --resume <latest-session-id>` (mtime terbaru menang). Kalau folder kosong → spawn fresh.

3. **Per-project state**. Wrapper bikin `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/` (atau `cwd` kalau env tidak ada) berisi:
   - `pending/` — inbox yang plugin tulis.
   - `wrapper.heartbeat` — di-touch tiap 5 detik, dipakai plugin untuk cek "alive".
   - `wrapper.log` — best-effort log file.
   - `wrapper.current_session_id` — id session yang lagi live di PTY (dipakai plugin telegram untuk exclude session aktif dari picker `/delete`).

4. **Raw mode stdin**. Wrapper menaruh terminal host di raw mode supaya keypress langsung diteruskan. Kalau wrapper crash mid-run, terminal Anda bisa stuck di raw mode — recover dengan `reset` (Unix) atau tutup-buka window.

5. **Signal handling**. `SIGINT` (Ctrl+C) di terminal wrapper di-forward ke PTY supaya membatalkan operasi AI yang sedang jalan, bukan kill wrapper. `SIGTERM` kill PTY.

6. **Side effects untuk plugin `telegram`**. Wrapper menulis ke `<project>/.claude/channels/telegram/system-outbox/` event `session-change` setiap kali session berganti (initial spawn, post-`/clear`, post-`/resume`). Juga menulis label "main session" ke `<telegram-state>/session-names.json` saat first-run, kalau label itu belum dipakai. Coupling ini sengaja — wrapper dan plugin telegram dimaintain oleh maintainer yang sama.

Quit dengan `/exit` di dalam Claude atau Ctrl+C di terminal wrapper.

## MCP tools

Server di [`server.ts`](./server.ts) expose dua tool. Dipanggil via stdio MCP transport.

### `pty_send_slash(command: string)`

Queue sebuah slash command supaya wrapper inject ke PTY.

- **Input**: `command` — string mulai dengan `/`. Harus match regex `/^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$/`. Mendukung command bare (`/clear`) dan namespaced plugin command (`/telegram:notify-user brief`). Tool **menolak raw text injection** by design — kalau bukan slash command structurally valid, error.
- **Behavior**: validasi format → cek heartbeat wrapper (kalau stale/missing → error `"wrapper not detected"`) → tulis `<state>/pending/<uuid>.json` atomically (tmp + rename). Return immediately; keystroke baru fire setelah turn AI selesai (CC consume stdin antar-turn).
- **Return**: text `"queued (id: <uuid>) — wrapper will inject \"<cmd>\" into PTY shortly\npath: <file>"`.

### `pty_status()`

Probe apakah wrapper lagi running.

- **Input**: none.
- **Behavior**: cek `<state>/wrapper.heartbeat`. Kalau ada DAN timestamp di dalamnya < 30 detik dari sekarang → `wrapper_alive: true`. Selain itu → false.
- **Return**: JSON `{ wrapper_alive: boolean, state_dir: string }`.

> Catatan validasi: description di `pty_send_slash` menyebut batas nama 32 char (`{0,31}`), tapi regex aktual di kode adalah `{0,63}` dengan tambahan karakter `:`. Description-nya lebih ketat dari kenyataan. Tidak fatal — semua valid command tetap lewat — tapi pesan errornya bisa misleading.

## Slash command

Cuma satu, ada di `commands/`:

### `/new`

Clear sesi CC sekarang dan start fresh. Flow yang dieksekusi AI:

1. Panggil `pty_status`. Kalau `wrapper_alive: false` → abort dan kasih tahu user untuk launch via `mirza-cc`.
2. Panggil `pty_send_slash` dengan `command: "/clear"`.
3. Kalau request originate dari Telegram (terlihat dari `<channel source="telegram">` block di input), kirim acknowledgement Telegram dulu supaya user tahu clear sedang diproses.
4. Stop response. Jangan lanjut kerja apa-apa — next thing CC process adalah `/clear` yang baru saja di-queue.

Notifikasi "fresh session ready" **bukan tanggung jawab AI** — wrapper yang nge-trigger setelah session baru materialize (lihat post-`/clear` chain di bawah).

## Payload yang wrapper terima

`server.ts` cuma tahu cara nulis `{ type: "slash", command }`, tapi wrapper ([`src/wrapper.ts`](./wrapper/src/wrapper.ts)) sebenarnya menerima dua bentuk payload (tagged union):

| `type`    | Field tambahan                       | Aksi wrapper                                                                                |
|-----------|--------------------------------------|---------------------------------------------------------------------------------------------|
| `slash` (default kalau `type` tidak ada) | `command: string`             | Tulis `command` lalu `\r` (dipisah 250ms) ke PTY stdin.                                     |
| `switch`  | `sessionId: string`, optional `sessionName` | Inject `/resume <sessionId>` ke PTY, tulis `current_session_id`, dan emit event `session-change` ke telegram system-outbox setelah 1 detik. |

Plugin `pty-controller` sendiri tidak punya jalur untuk emit payload `switch` — itu di-emit oleh client lain (plugin telegram menulis langsung ke `pending/` saat user pilih session di picker). Slash command apa pun yang valid menurut regex bisa diinject lewat `pty_send_slash`. Contoh yang sudah terverifikasi jalan: `/clear`, `/compact`, `/resume <id>`, `/rename <name>`, `/notify-user <msg>` (namespaced: `/telegram:notify-user`), `/exit`. Yang lainnya tergantung apakah CC mengenal slash command tersebut di sesi yang lagi jalan.

### Post-`/clear` chain

Kalau command yang baru di-inject adalah `/clear` exactly, wrapper masuk state machine khusus:

1. Snapshot list session `.jsonl` di `~/.claude/projects/<encoded-cwd>/` saat ini.
2. Poll tiap 500ms sampai ada file baru muncul (= fresh session sudah live).
3. Begitu ketemu: tulis `wrapper.current_session_id`, optional inject `/rename <sessionName>` kalau payload bawa nama, lalu emit event `session-change` ke telegram system-outbox (pesan Telegram dikirim oleh plugin telegram, tanpa AI roundtrip).

Pacing antar injeksi: konstanta `POST_INJECTION_DELAY_MS = 1000` dan `SUBMIT_DELAY_MS = 250`. Yang kedua memisahkan write teks dari trailing `\r` — perlu karena untuk command namespaced (`/telegram:foo`), kalau `\r` masuk dalam chunk yang sama, autocomplete picker CC menelannya alih-alih submit.

## Mekanisme IPC

State directory diresolve oleh [`ipc.ts`](./ipc.ts) dengan urutan:

1. Env `PTY_CONTROLLER_STATE_DIR` (escape hatch, set oleh wrapper saat spawn CC).
2. `<CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/`.

Kalau dua-duanya tidak ada, MCP server exit dengan error eksplisit di stderr.

Layout state per-project:

```
<project>/.claude/channels/pty-controller/
├── pending/                       # plugin nulis di sini
│   └── <uuid>.json
├── wrapper.heartbeat              # wrapper update tiap 5 detik
├── wrapper.current_session_id     # session id CC yang lagi live
└── wrapper.log                    # log wrapper (best-effort)
```

Format file `pending/<uuid>.json`:

```json
{
  "id": "<uuid>",
  "ts": "2026-05-19T00:00:00.000Z",
  "command": "/clear"
}
```

Atomic write dipakai semua-side: tulis ke `<final>.tmp.<pid>`, lalu `rename` ke nama final. Wrapper skip file yang masih `.tmp.*` di sweep fallback-nya. Wrapper baca file (via `fs.watch` + interval sweep 2 detik sebagai belt-and-suspenders), delete file segera (sebelum dispatch) supaya tidak double-process kalau crash mid-handle.

`wrapperLikelyRunning()` cuma cek heartbeat file: kalau timestamp di dalamnya kurang dari 30 detik dari sekarang → "alive". Tidak ada PID check, jadi false-positive teoretis kalau wrapper crash tepat dalam 30 detik terakhir. Plugin pakai metrik ini untuk gate `pty_send_slash` dan untuk jawaban `pty_status`.

## Limitations / caveats

- **Tanpa wrapper, plugin no-op.** Plugin load fine ke CC tapi `pty_send_slash` akan selalu error sampai wrapper jalan. `pty_status` adalah cara teraman untuk cek.
- **Single CC per project.** Wrapper asumsikan satu sesi Claude per project pada satu waktu. Jalankan dua wrapper terhadap project sama → file inbox bisa di-double-process dan downstream channel (Telegram bot) konflik.
- **Windows quirks.** `fs.watch` di Windows historis flaky untuk create+delete cepat, makanya wrapper punya interval sweep 2 detik sebagai cadangan. `node-pty` di-spawn lewat `cmd.exe /c` di Windows vs. `$SHELL -l -i -c` di Unix.
- **First-run timing tidak relevan untuk production wrapper.** Diagnostic `auto-clear` punya env `READY_DELAY_MS`; wrapper produksi tidak butuh karena request baru datang kalau CC sudah idle.
- **Heartbeat tidak proof of liveness sesungguhnya.** 30 detik window berarti wrapper baru-saja-crash bisa lolos cek selama satu cycle.
- **Coupling ke plugin telegram.** Wrapper menulis ke `<project>/.claude/channels/telegram/system-outbox/` dan `<telegram-state>/session-names.json`. Kalau plugin telegram tidak terpasang, file-file itu mendarat di direktori yang bisa-bikin atau tidak — wrapper tetap jalan, tapi event-event itu jadi yatim.
- **Description mismatch.** Description tool `pty_send_slash` di `server.ts` menyebut regex `^\/[a-z][a-z0-9_-]{0,31}(\s.{0,256})?$/` (max 32 char, tanpa `:`), padahal regex aktual mengizinkan 64 char dan karakter `:` untuk namespaced command. Cuma kosmetik untuk model, tidak mempengaruhi runtime.

## Diagnostic scripts (jarang dibutuhkan)

Di folder `wrapper/`:

```bash
npm run interactive     # spawn claude di PTY, bidirectional pipe, no plugin loop
npm run auto-clear      # spawn claude, programmatically inject /clear, capture, exit
```

`auto-clear` nge-dump capture PTY ke `last-capture.ansi` (raw) dan `last-capture.txt` (ANSI-stripped) saat exit. Jangan jalankan diagnostic ini bersamaan dengan wrapper produksi — keduanya akan rebutan PTY CC.

## Author / license

- **Author**: Mirza ([@mirzaakhena](https://github.com/mirzaakhena))
- **License**: tidak ada `LICENSE` file di folder ini. Plugin ini orisinal (bukan fork) — perlakukan sebagai "all rights reserved" sampai maintainer menambahkan lisensi eksplisit.
