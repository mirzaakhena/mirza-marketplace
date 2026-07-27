# Area 06 — Injeksi PTY & lifecycle wrapper

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** PTY-001–114; SCAR-001–009, 016, 019–023, 025, 027, 029–039, 044, 045, 066–068, 071, 072, 074, 075, 086, 096

---

## 6.0 Konstrain induk — **TETAP BERLAKU**

**TANPA Claude Agent SDK / `claude -p`. Seluruh pemakaian lewat TUI interaktif.** Alasan: billing (langganan Claude Code menagih pemakaian interaktif; SDK/API berarti bayar token terpisah). Ditetapkan 2026-07-02, dikonfirmasi ulang user 2026-07-26.

**Konsekuensi yang harus diterima sebagai fakta, bukan pilihan desain:** seluruh mesin PTY, antrean, gate, dan barrier di area ini **wajib ada**. Mereka bukan over-engineering — mereka harga dari konstrain ini.

## 6.1 Model proses wrapper — **KEEP**

**Item:** PTY-039–051; SCAR-025, SCAR-066, SCAR-096

| Item | Perilaku | Kenapa wajib |
|---|---|---|
| PTY-039; SCAR-025 | Spawn CC lewat shell: Windows `cmd.exe /c`, Unix **login shell interaktif** `$SHELL -l -i -c` | `claude` adalah shim npm yang hanya ter-resolve lewat PATH/rc-file user; melewati shell → `posix_spawnp ENOENT` |
| PTY-040, 041 | `CLAUDE_BIN` / `CLAUDE_ARGS` bisa dioverride | Jalan keluar saat default rusak; `CLAUDE_ARGS=""` = vanilla claude |
| PTY-042 | Env anak selalu membawa lokasi state | Plugin di dalam CC menyetujui state dir yang sama dengan wrapper |
| PTY-043, 044, 045 | Ukuran PTY dari terminal user (fallback 100×30), `xterm-256color`, piping dua arah raw, propagasi resize | Wrapper harus tak terasa saat dipakai manual dari terminal |
| PTY-046 | CC exit → wrapper exit dengan exit code CC | |
| PTY-047, 048; SCAR-066 | **SIGINT diteruskan ke PTY** (Ctrl+C membatalkan operasi AI, **tidak** membunuh wrapper); SIGTERM baru kill PTY | Kalau SIGINT membunuh wrapper, Ctrl+C sekali = kehilangan seluruh sesi |
| PTY-049 | Shutdown bersih: hentikan timer/watcher, hapus heartbeat & pid, kembalikan terminal dari raw mode | Terminal yang tertinggal di raw mode = shell user rusak |
| PTY-050 | Log ISO ke stderr **dan** append ke `wrapper.log` | Satu-satunya jejak saat injeksi gagal |
| PTY-051 | Satu proses CC seumur hidup wrapper; ganti sesi lewat injeksi `/resume`, bukan kill+respawn | |
| SCAR-096 | `import.meta.dir` hanya ada di Bun; wrapper jalan di Node → butuh `fileURLToPath + dirname` | Jangan asumsikan satu runtime |

## 6.2 Konstanta pacing — **KEEP sebagai kontrak, WAJIB dikalibrasi ulang**

**Item:** PTY-052–058, 060–063, 107, 108; SCAR-001–007, 009, 019, 020, 029, 030, 031

Setiap angka di sini adalah kegagalan nyata yang sudah dibayar:

| Konstanta | Nilai | Kegagalan yang melahirkannya |
|---|---|---|
| `SUBMIT_DELAY_MS` | 250 | Autocomplete picker CC **menelan `\r`** bila teks+Enter ditulis satu chunk (khusus command bernamespace `/telegram:foo` — picker tetap terbuka sampai input "settle") |
| `MIN_INJECTION_GAP_MS` | 1500 | **BUG #3 (2026-06-07)**: dua payload berurutan saling menyisipkan keystroke |
| `POST_INJECTION_DELAY_MS` | 1000 | "Empirical floor" — di bawah 1000 ms parser slash CC belum selesai mencerna command sebelumnya |
| `CLEAR_SETTLE_MS` | 1500 | Payload antre menyusup ke keystroke pertama sesi baru |
| `CLEAR_BARRIER_TIMEOUT_MS` | 600000 | Safety valve: `/clear` yang keystroke-nya hilang tak boleh membekukan antrean selamanya. 10 menit karena CC baru memproses `/clear` **setelah turn AI selesai** |
| `QUEUE_POLL_MS` | 200 | Frekuensi drainer mengecek gate — kandidat diganti event-driven |
| `CHUNK_SIZE` / `CHUNK_DELAY_MS` | 100 / 30 | **ConPTY head-drop Windows**: satu write panjang meluapkan buffer input; stream membuang karakter **TERTUA** — prompt panjang tiba terpotong tinggal ekornya. Failure mode paling senyap di seluruh sistem |

**Mekanisme yang wajib ikut (bentuk boleh berubah, masalahnya tidak hilang):**

1. **Insiden tiga-kepala (2026-06-07)** — keystroke yang mendarat saat CC membangun ulang sesi pasca-`/clear` ditelan diam-diam: `/rename idle` bot-02 hilang, `/clear` bot-03 lenyap (idle-creep), prompt handoff dimakan di tengah. Melahirkan: **satu antrean FIFO + satu drainer + gate**.
2. **Gate dua mekanisme** — jendela tunda **monotonik** (`holdFor` hanya bisa memperpanjang, tak pernah memendekkan) + **barrier `/clear`** yang ditahan sampai sesi baru terdeteksi.
3. **Snapshot eager saat `/clear`** (SCAR-031) — daftar sesi di-snapshot saat keystroke ditulis, aman karena file jsonl baru pasti muncul strictly after.
4. **Chunking aman code-point** (SCAR-020) — split via `Array.from`, batas chunk tidak boleh membelah surrogate pair (emoji); `join('')` harus selalu merekonstruksi input.
5. **Enter TUI = `\r`**, bukan `\n` (SCAR-029) — `\n` "sometimes ignored by readline-style TUIs".
6. **Kegagalan dispatch satu item tidak menghentikan antrean** (PTY-063).

⚠️ **Angka-angka ini TIDAK boleh diasumsikan portabel** ke mekanisme baru atau versi CC baru. Setiap satu wajib punya test dan wajib diverifikasi ulang di live.

## 6.3 Deteksi sesi baru — **GANTI dengan hook `SessionStart`**

**Item:** PTY-067, 071, 072; SCAR-032, SCAR-033, SCAR-021 (sebagian)

**Sekarang:** poll `~/.claude/projects/<encoded-cwd>/` setiap 500 ms menunggu file `.jsonl` baru muncul. Encoding path (`[\\/:]` → `-`) diduplikasi di dua tempat yang harus tetap sinkron.

**Jadi:** Claude Code melaporkan sendiri lewat hook `SessionStart`.

**Yang mati:** polling 500 ms · ketergantungan pada layout privat CC (SCAR-032) · duplikasi `encodeProjectDir` · perlakuan khusus jalur resume yang tak memunculkan file baru (SCAR-033) · barrier `/clear` sebagai *polling* (jadi *event* nyata).

**Risiko yang WAJIB dijawab:** kalau hook tidak terpasang benar, deteksi mati **total** — lebih buruk daripada polling yang selalu bekerja. Syarat penerimaan: timeout fallback yang **berbunyi sebagai alarm di `doctor`**, bukan diam. Prinsip design lama yang tetap berlaku: *"setiap kegagalan harus terlihat"*.

**Catatan:** enumerasi sesi untuk picker `/switch` masih membaca `~/.claude/projects/` (area 05 §5.6) — ketergantungan itu belum sepenuhnya hilang, hanya deteksi *sesi baru* yang pindah ke hook.

## 6.4 Seam kompatibilitas — **DROP semua**

**Item:** PTY-009, 081, 082, 086 (gating), 035 (sinonim); SCAR-072, 074, 075

**Yang dibuang:**
- mirror legacy `wrapper.current_session_id` / `wrapper.current_session_name` beserta aturan "nama null ditulis sebagai FILE KOSONG dan SELALU dioverwrite"
- gating fitur pada versi wrapper **self-reported** (`wrapper.version`, batch butuh ≥ 0.0.7)
- sinonim `type` / `kind` di payload
- payload compound `{command:"/clear", sessionName}` yang di-deprecate tapi tetap diterima

**Syarat yang diterima user:** migrasi "matikan semua, ganti semua" — **tidak ada periode fleet campuran**. Realistis karena 6 bot di satu mesin.

## 6.5 Registry fleet global — **DROP** (diganti K-1/K-2)

**Item:** PTY-013, 014, 087–094; SCAR-016, SCAR-022, SCAR-069

`~/.claude/agent-registry.json` + protokol lockfile pensiun, digantikan config + store terpusat.

**Yang paling penting ikut mati: lockfile busy-wait sinkron** yang **membekukan pipa PTY dan keystroke user** selama spin (timeout 2 s, retry 25 ms — SCAR-016, utang tercatat di review #17).

**Yang juga ikut:** retry rename EPERM/EBUSY 50/100/150/200 ms untuk antivirus/Search Indexer Windows (SCAR-022) — masih relevan untuk **semua** tulisan atomik di Windows, jadi **pindahkan sebagai util umum**, jangan hilang bersama registry. Reset registry korup → registry kosong (PTY-093) jadi pola deteksi-korup di store baru (bandingkan TG-156).

**Tool `pty_list_agents` (PTY-013, 014) DROP** — digantikan `agent_list` (keputusan CONS-3 yang sudah disetujui user sebelumnya; dikonfirmasi lagi oleh K-2).

## 6.6 Permukaan kendali-diri AI — **daftar putih**, termasuk plugin command

**Item:** PTY-001–012, 015, 016–021, 037; SCAR-036, SCAR-037, SCAR-086

**Perubahan prinsip:** dari **daftar hitam** (blokir `/new`, `/switch`, `/delete`, `/effort`) jadi **daftar putih**.

**Yang diizinkan:** `/clear`, `/compact`, `/rename`, `/resume`, **dan command bernamespace plugin** (mis. `/telegram:notify-user`).

**Kenapa daftar putih:** gagal ke arah aman — command CC baru yang tak dikenal otomatis ditolak. Daftar hitam gagal ke arah bahaya — command baru otomatis lolos. Insiden nyata yang melahirkan daftar hitam: menyuntik `/new idle` me-wedge TUI di "invalid command" (2026-06-07).

**Yang WAJIB tetap:**

| Item | Perilaku |
|---|---|
| SCAR-086 | **Teks bebas ditolak by design.** Slash command "structurally confined" ke apa yang CC definisikan; teks bebas = kendali arbitrer AI atas host-nya sendiri (`rm -rf`) |
| PTY-002; SCAR-037 | Validasi regex mengizinkan `:` supaya command bernamespace bisa dispatch (nama bare → "Unknown command" di CC); nama maks 64 char, argumen maks 256 |
| PTY-005; SCAR-044 | **Self-only.** Parameter `target` ditolak dengan teaching error. Asimetri fundamentalnya: prompt punya hakim (AI penerima), slash tidak — guard sebagus apa pun di skill receiver tak bisa menahan slash karena slash tak pernah mampir ke AI |
| PTY-007 | Wrapper tak terdeteksi hidup → tolak dengan error yang **mengajari solusinya** ("Launch CC via `mirza-cc` instead of `claude` directly") |
| PTY-011 | Semua kegagalan tool jadi hasil `isError`, tidak pernah merusak protokol MCP |
| PTY-002, 007, 016–019 | **Setiap error harus mengajari alternatif yang benar** supaya AI bisa self-correct — bukan sekadar menolak |

⚠️ **Konsekuensi dari mengizinkan plugin command:** aturan pemisahan teks + `\r` 250 ms **wajib** dipertahankan — justru command bernamespace inilah yang membuat autocomplete picker menelan Enter (SCAR-001).

## 6.7 IPC & batch — **KEEP kontraknya, bentuknya menyatu dengan arsitektur**

**Item:** PTY-028–038, 109–114; SCAR-027, SCAR-045, SCAR-068, SCAR-071

Bentuk transport (file `pending/*.json` vs tabel vs in-process) diputuskan di tahap arsitektur. Yang **wajib** ada apa pun bentuknya:

| Item | Kontrak |
|---|---|
| PTY-031; SCAR-027 | Tulisan atomik `tmp.<pid>` + rename, dan **setiap konsumen sweep men-skip file mengandung `.tmp.`**. Dua sisi kontrak ini harus pindah **bersama** |
| PTY-034; SCAR-068 | **Hapus-sebelum-proses** (anti double-process saat crash mid-handle). Trade-off sadar: command hilang tanpa jejak bila crash setelah hapus. Alternatif tercatat: rename ke `processing/` — **diputuskan di tahap arsitektur** |
| PTY-036; SCAR-021 | Deteksi dua jalur redundan: notifikasi filesystem (defer 50 ms untuk rename Windows) **dan** sweep berkala. `fs.watch` di Windows melewatkan event create pada rapid create+delete dan drop saat atomic-rename |
| PTY-037 | JSON malformed di-log dan di-drop **tanpa mengganggu antrean**. Pola yang lebih baik dari design lama: **karantina** `.rejected-<ts>` + peringatan terlihat di doctor, bukan drop diam-diam |
| PTY-038 | `hop_count > 5` pada payload ber-`from` → DROP (loop prevention). Detail di area 07 |
| PTY-109–114; SCAR-045 | **Batch = SATU unit atomik.** Array payload dalam satu file, di-enqueue kontigu dalam satu blok sinkron — atomisitas yang tiga file terpisah **tidak bisa** berikan. Lahir dari insiden bot-03: handoff menyelip di tengah self-reset 3-payload. Maks 8 item; batch gagal validasi diabaikan **utuh** dengan alasan di log |

⚠️ **Ambiguitas yang WAJIB dijawab eksplisit** (ambiguitas #1 inventaris): atomisitas batch sekarang bergantung pada **single-thread Node** (enqueue sinkron). Arsitektur baru dengan consumer konkuren **wajib menurunkan ulang jaminan ini secara eksplisit**, bukan mewarisinya diam-diam.

**SCAR-071 — utang yang harus dijawab:** `pty_send_slash` fire-and-forget; AI hanya tahu "queued", tak pernah tahu injeksi benar-benar mendarat. Kegagalan hilang di log wrapper. Pola dari design lama yang layak dipakai: **ack dua tingkat** — `injected` (keystroke tertulis) ≠ selesai semantik (`SessionStart` untuk `/clear`, perubahan nama untuk `/rename`). `{queued:true}` berarti *accepted*, **bukan** *done*.

## 6.8 Lifecycle sesi yang tetap

**Item:** PTY-064, 065, 066, 073, 074, 077, 078; SCAR-034, SCAR-080, SCAR-081 (sebagian)

| Item | Perilaku | Catatan |
|---|---|---|
| PTY-064, 065; SCAR-034 | First-run → mulai segar; non-first-run → **resume sesi dengan mtime jsonl terbaru** | |
| PTY-066; SCAR-041, SCAR-080 | Pada resume, identitas di-seed sinkron; nama dari snapshot statusline **hanya dipercaya bila `session_id`-nya persis sesi yang ditanya** | Tanpa guard ini sesi baru mewarisi nama sesi lama dari snapshot basi |
| PTY-073 | Pasca-`/clear`, nama diminta payload ditulis lalu `/rename` disuntik ke sesi baru | Urutannya (tulis id → rename → jeda → event) melahirkan bug "(unnamed)" bila diubah (SCAR-081) — **tapi** dengan lifecycle-jadi-data (K-7) dan hook SessionStart, kerapuhan urutan ini seharusnya hilang. **Wajib diverifikasi, jangan diasumsikan** |
| PTY-074 | `switch` → injeksi `/resume <sessionId>`; gate ditahan lebih lama karena swap sesi butuh settle | |
| PTY-077, 078 | Event `session-change`; `/clear` **di tengah** batch menunda notifikasinya sampai akhir batch supaya membawa nama FINAL, bukan "(unnamed)" | |

## 6.9 Liveness — **KEEP, satukan ambangnya**

**Item:** PTY-083, 084, 085; SCAR-010, SCAR-028, SCAR-067

- Heartbeat ditulis tiap **5 s**, dianggap segar bila **< 30 s** (mengakomodasi GC pause, FS stall, suspend/resume)
- **Dua sinyal, bukan satu**: heartbeat segar saja tidak cukup — wrapper yang crash dalam window 30 s masih tampak segar. Cek kedua via pid + `kill(pid, 0)`: `ESRCH` = mati meski heartbeat segar; `EPERM` = hidup; error lain (cross-host mount) = percayai heartbeat

⚠️ **Ambang 30 s dipakai 3 pembaca berbeda** (pty ipc, telegram meta-commands, agent-bus). Di build baru **wajib satu konstanta bersama** — jangan sampai menyimpang (SCAR-010).

⚠️ **Celah terbuka yang belum pernah ditangani: PID reuse** (SCAR-028) — pid file basi yang ke-reuse proses lain memberi false-alive. Perlu keputusan sadar: sertakan start-time proses, atau terima risikonya dengan catatan.

## 6.10 KEEP: kualitas pesan error

**Item:** PTY-002, 003, 004, 007, 008, 010, 016–021, 022–027

Pola yang konsisten di seluruh plugin ini dan layak jadi **aturan wajib** di build baru: **setiap penolakan menyebutkan alternatif yang benar**, bukan hanya "invalid". Contoh: `/new` ditolak → error menjelaskan itu telegram-layer dan mengajari penggantinya. Ini yang membuat AI bisa memperbaiki diri tanpa bertanya ke user.

Kontrak playbook `/new` (PTY-022–027) mati bersama meta-command lama, tapi satu aturannya layak dipertahankan: **nama plugin command wajib fully-qualified** (`/telegram:notify-user`, bukan `/notify-user`).
