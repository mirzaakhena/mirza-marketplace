# Ekstraksi item pekerjaan — Area 05–14

**Tanggal:** 2026-07-31
**Tujuan:** bahan untuk `BACKLOG.md` induk. Ekstraksi murni dari dokumen audit — **tidak ada kode yang diperiksa**. Item di sini sebagian besar memang belum dibangun karena tahapnya belum mulai; itu wajar, bukan temuan.

## Metode

File yang dibaca **penuh** (bukan grep, bukan sampling):

- `docs/2026-07-26-rebuild-audit/area-05-manajemen-sesi.md` (157 baris)
- `docs/2026-07-26-rebuild-audit/area-06-injeksi-pty.md` (166)
- `docs/2026-07-26-rebuild-audit/area-07-antar-bot.md` (152)
- `docs/2026-07-26-rebuild-audit/area-08-handoff.md` (296)
- `docs/2026-07-26-rebuild-audit/area-09-goal.md` (46)
- `docs/2026-07-26-rebuild-audit/area-10-disiplin-balas.md` (179)
- `docs/2026-07-26-rebuild-audit/area-11-context-version.md` (141)
- `docs/2026-07-26-rebuild-audit/area-12-penyimpanan-doctor.md` (105)
- `docs/2026-07-26-rebuild-audit/area-13-skill-konten.md` (75)
- `docs/2026-07-26-rebuild-audit/area-14-ketahanan-proses.md` (128)

Konteks pendukung yang juga dibaca penuh: `README.md` audit (kosakata verdict, K-1..K-18, B-1..B-10), `2026-07-31-rekonsiliasi-tahap1-2-vs-area-01-04.md` (untuk konsistensi bentuk), dan `docs/superpowers/specs/2026-07-27-fleet-harness-rebuild-design.md` §10 Tahapan + §11 (angka yang sudah ditetapkan) + §13 (di luar lingkup v1).

**Area 01–04 sengaja TIDAK diperiksa** — sudah direkonsiliasi terpisah.

### Satuan hitung (dipakai identik di kesepuluh area)

Satu baris = **satu entri keputusan dokumen audit**: satu baris tabel di dokumen, atau satu verdict setingkat-§ bila seksi itu tidak bertabel. Daftar "yang ikut hilang" / "yang mati bersamanya" **tidak** dipecah jadi baris sendiri — itu konsekuensi, bukan entri keputusan. Klaster yang dokumennya sendiri perlakukan sebagai satu (mis. `PTY-047, 048; SCAR-066`) tetap satu baris.

### Kosakata verdict di kolom **Verdict**

Kolom diisi dengan **kata yang dipakai dokumen aslinya** (KEEP / SIMPLIFY / MERGE / GANTI / FITUR BARU / PANGKAS / SATUKAN / DIPAKSA MESIN / MODIFY / DEFER / ATURAN BARU), dengan padanan terdekat dari tiga kata yang diminta dalam kurung bila membantu. Sengaja tidak dilaundry jadi KEEP — beberapa keputusan (§6.3, §7.1, §7.2, §8.2) adalah **penggantian mekanisme**, dan menyebutnya KEEP akan menyesatkan pelaksana.

### Tahapan (spec §10)

| Tahap | Isi |
|---|---|
| 1 | Fondasi — `fleetd` + dua database + `config.json` + socket + `doctor` |
| 2 | Jalur pesan — poller, gerbang allowlist, media, penyimpanan, MCP proxy `reply` |
| 3 | Penegakan — `PreToolUse` (ack) + `Stop` (jawaban final) + tombol wajib + tombol manual otomatis |
| 4 | Sesi — `bot-cc` + antrean injeksi + `SessionStart` + `/new` `/switch` + `/context` + `UserPromptSubmit` (penamaan mid-sesi, K-18) |
| 5 | Antar-bot — `agent_list` `agent_status` `agent_send` + handoff dijaga mesin |
| 6 | Sisanya — `peek_conversation`, pencarian, penyembunyian sesi remeh, penamaan otomatis, delegasi (B-8) |

`?` = tidak jelas milik tahap mana menurut §10; alasannya selalu ditulis di kolom Catatan. Tidak ada tebakan diam-diam.

---

## Tabel hitungan per area

| Area | Item non-DROP diekstrak | Item DROP dilewati |
|---|---:|---:|
| 05 — Manajemen sesi | 17 | 9 |
| 06 — Injeksi PTY & lifecycle wrapper | 58 | 6 |
| 07 — Komunikasi antar-bot | 30 | 8 |
| 08 — Handoff | 59 | 8 |
| 09 — Goal | 2 | 10 |
| 10 — Disiplin balas | 32 | 4 |
| 11 — `/context`, `/version`, statusline | 21 | 7 |
| 12 — Penyimpanan & observability | 30 | 1 |
| 13 — Skill konten | 3 | 4 |
| 14 — Ketahanan proses | 20 | 9 |
| **TOTAL** | **272** | **66** |

Catatan: SCAR-059 (cache menu slash Telegram) muncul di area-11 §11.4 **dan** area-14 §14.7 — dihitung sekali saja, di area 11.

---

## Akar struktural (item yang sendirian memblokir banyak item lain)

Ditulis terpisah karena inilah kelas temuan yang pass 01–04 buktikan paling mahal bila terlewat.

⚠️ **Baris di tabel ini adalah rujukan silang ke item yang SUDAH dihitung di tabel area di bawah — bukan item tambahan.** Jangan menambahkannya lagi saat menyusun `BACKLOG.md`.

| Akar | Memblokir | Catatan |
|---|---|---|
| **Statusline bridge** (area-11 §11.1) | `/context` (§11.2, 6 item) · field context/window/biaya di `agent_status` (§7.5) · ambang PENGIRIM 50% (§8.B) · ambang PENERIMA <100k (§8.2b) | §11.0 Temuan 1 membuktikan **tidak ada hook mana pun** yang memberi data pemakaian context — statusLine satu-satunya sumber. Tanpa bridge, seluruh gating handoff tahap 5 mustahil. Bridge dipakai tahap 4 tapi konsumen terberatnya tahap 5. |
| **K-7 — lifecycle jadi field data** (area-05 §5.4) | §5.4 sendiri · `agent_status` status kerja (§7.5) · syarat "tidak sedang bekerja" (§8.2b) · self-reset satu langkah (§8.4) · SKILL-003/004 pensiun (§8.7) · pemicu name-session (§10.7/§10.C) · marka SKILL-012 | Satu keputusan yang menjalar ke 4 area. Selama status masih diturunkan dari nama sesi, tak satu pun turunannya bisa benar. |
| **Hook `SessionStart` / K-10** (area-06 §6.3) | deteksi sesi baru · barrier `/clear` jadi event (§6.2) · lifecycle sesi §6.8 · fakta "sedang bekerja" (§8.2b) | Syarat penerimaannya adalah **alarm di `doctor`** bila hook diam — jadi §6.3 tidak bisa dinyatakan selesai sebelum `doctor` (§12.5) ada. |
| **`doctor`** (area-12 §12.5) | syarat terima §6.3 · SCAR-071 ack dua tingkat (§6.7) · karantina payload (§6.7/§14.6) · handoff menggantung (§8.3) · store mati (§12.6) · satu-satunya tempat versi komponen terbaca (§11.3) | Ada di tahap 1 menurut §10, tapi enam alarm yang mengisinya lahir di tahap 4–5. Kerangkanya tahap 1, isinya menyusul. |
| **FTS5 + tool pencarian** (area-12 §12.4) | B-1 `peek_conversation` · B-2 (di luar v1) | Dokumen menyatakan eksplisit: menambahkan indeks belakangan = **mengindeks ulang seluruh riwayat**, "makanya dimasukkan sejak awal" — konflik halus dengan §10 yang menaruh pencarian di tahap 6. |
| **`message_id` pesan masuk tak tersimpan** (temuan pass 01–04) | quote-reply B-10 · `get_message_by_id` · fallback album TG-139 · TG-077 | Bukan dari area 05–14, tapi dicatat ulang di sini karena B-10 (quote-reply) bergantung padanya dan B-10 belum punya rumah tahap. |

---

## Area 05 — Manajemen sesi

**Non-DROP: 17 · DROP dilewati: 9** (`/delete`, `/delete all`, `/delete hard`, `/delete hard all`, `/effort` di §5.1; 4 baris "yang dibuang" di §5.6: paginasi picker, disambiguasi nama duplikat, rekonsiliasi registry pid-file, label relatif waktu)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| B-6 | Penyembunyian otomatis sesi remeh dari picker (giliran < 3 **dan** < 8.000 token **dan** — konflik, lihat catatan) | FITUR BARU | area-05 §5.2 + §5.A | 6 | ⚠️ **Kontradiksi tiga-dokumen:** §5.2 (2026-07-27) **membuang** kriteria "tak pernah dinamai" karena saling meniadakan dengan §10.C; §5.A masih menyebutnya sebagai salah satu "dua kriteria yang sudah pasti"; spec §11 (2026-07-29) **memasukkannya lagi** sebagai bagian dari "2 kriteria pasti". BACKLOG harus memunculkan ini, bukan diam-diam memilih. Prasyarat: penamaan otomatis §10.C harus jalan lebih dulu, kalau tidak sesi kerja nyata bisa hilang dari picker. |
| PTY-068/069/070/076; SCAR-039/079/081 | **Lifecycle bot jadi kolom data, bukan string di nama sesi (K-7)** | KEPUTUSAN STRUKTURAL (MERGE) | area-05 §5.4 | 4 | Akar struktural — lihat tabel akar di atas. Kalau ini tidak dibangun lebih dulu, §7.5, §8.2b, §8.4, §10.C semuanya salah. Konsekuensi yang **wajib diganti**: status tidak lagi terbaca sekilas dari daftar nama sesi — butuh cara lain melihat status fleet (bahan area 07/11). |
| TG-027 | Sesi aktif dikecualikan dari daftar `/switch`; daftar kosong dibalas pesan yang jelas | KEEP | area-05 §5.6 | 4 | Kecil, mudah terlewat karena tersembunyi di dalam seksi yang judulnya soal apa yang dibuang. |
| TG-029 (sisa) | Satu tombol per baris, label dipotong 60 char, baris `❌ Cancel` terakhir | KEEP | area-05 §5.6 | 4 | Sisa dari TG-029 setelah paginasi di-DROP — bagian yang bertahan gampang ikut terbuang bersama paginasinya. |
| TG-032; SCAR-052 | `shortId` 8 hex di `callback_data` | KEEP (wajib) | area-05 §5.6 | 4 | **Wajib teknis**, bukan preferensi: `callback_data` Telegram dibatasi 64 byte, UUID 36 karakter tidak muat setelah prefiks. |
| TG-033 | Tap valid tidak pre-announce hasil; banner datang saat sesi benar-benar berganti | KEEP | area-05 §5.6 | 4 | Bergantung pada banner §5.8 dan pada sinyal sesi benar-benar berganti (hook `SessionStart`, §6.3). |
| TG-178, TG-183 | Enumerasi `*.jsonl` dengan regex UUID ketat + `encodeProjectDir` (`[\\/:]` → `-`) | KEEP | area-05 §5.6 | 4 | Menyaring file nyasar seperti `memory.md`. Catatan §6.3: enumerasi picker **masih** membaca `~/.claude/projects/` — jadi ketergantungan ke layout privat CC belum sepenuhnya hilang meski deteksi sesi baru pindah ke hook. |
| TG-182 | Sort mtime descending pada daftar sesi | KEEP | area-05 §5.6 | 4 | |
| TG-018 | Validasi nama sesi: CR/LF di-collapse ke spasi + trim, kosong → usage berisi contoh, ada spasi → suruh pakai tanda hubung, potong maks 64 char | KEEP (wajib) | area-05 §5.7 | 4 | **Wajib**: `\r\n` merusak sintaks injeksi `/rename <name>\r` (SCAR-038). Setelah K-18 `/rename` tidak lagi disuntik sebagai keystroke — **ragu**: apakah alasan wajibnya masih berlaku, atau validasi tetap perlu untuk alasan lain (`sessionTitle` lewat hook)? Aturannya sendiri tetap dipakai §10.C ("nama hyphenated, tanpa spasi"). |
| TG-019, TG-026 | Guard: state dir harus ter-resolve, dengan pesan yang menjelaskan cara memperbaikinya | KEEP | area-05 §5.7 | 4 | Contoh konkret aturan §6.10 (setiap penolakan mengajari solusinya). |
| TG-020 | Guard heartbeat wrapper segar (< 30 s) → pesan "wrapper not detected" | KEEP | area-05 §5.7 | 4 | Ambang 30 s **wajib satu konstanta bersama** dengan §6.9 dan §7.6 (SCAR-010). Ini salah satu dari tiga pembaca itu. |
| TG-021, TG-024 | Nama sudah dipakai sesi lain → ditolak; self-rename ke nama sendiri = no-op idempoten | KEEP | area-05 §5.7 | 4 | Alasan no-op eksplisit: "common mobile-finger mistake". Keunikan nama di sini yang membuat disambiguasi `(shortId)` bisa di-DROP di §5.6 — jadi kalau ini tidak dibangun, DROP itu jadi tidak sah. |
| TG-022 | `/new` tanpa ack — banner datang kemudian saat sesi benar-benar siap; satu pesan total | KEEP | area-05 §5.7 | 4 | Berinteraksi dengan penegakan ack §10.1 — perlu dipastikan `/new` (perintah mesin, bukan giliran AI) tidak terkena aturan "ack sebelum tool pertama". |
| TG-025 | `/rename` membalas `✏️ Renaming session from "<lama>" to "<baru>"` | KEEP | area-05 §5.7 | 4 | Pesan mesin → bahasa Indonesia menurut K-16 (§14.8); teks contoh di audit masih Inggris. |
| TG-150; LOSS-4 | Banner ganti-sesi `switch to session 📍 <label>` dikirim langsung mesin **+ fix bug pencatatan** | KEEP + FIX | area-05 §5.8, area-12 §12.1 | 4 | Bug **wajib difix, bukan diport**: kode lama memanggil `messagesStore.append(...)` yang tidak ada di interface → banner terkirim tapi tak pernah tercatat. Kelas bug yang dicegah `tsc --noEmit` di CI. |
| SCAR-085 | Banner tidak boleh hardcode satu chat tujuan (`allowFrom[0]`) | KEEP (aturan) | area-05 §5.8 | 4 | Sudah tidak jadi masalah setelah allowlist terpusat, tapi audit eksplisit memperingatkan jangan mengulang asumsi single-user. |
| TG-055; SCAR-051 | Peta `shortId → sesi` in-memory; tap tombol lama pasca-restart → "picker expired — please run /switch again" | KEEP (trade-off diterima) | area-05 §5.9 | 4 | Trade-off sadar, bukan bug. Yang wajib ada: **pesan expired yang jelas**, bukan aksi salah diam-diam. |

---

## Area 06 — Injeksi PTY & lifecycle wrapper

**Non-DROP: 58 · DROP dilewati: 6** (§6.4: mirror legacy `wrapper.current_session_*`, gating versi wrapper self-reported, sinonim `type`/`kind`, payload compound `{command:"/clear", sessionName}`; §6.5: registry `agent-registry.json` + lockfile, tool `pty_list_agents`)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| K-9 | Konstrain induk: **tanpa Claude Agent SDK / `claude -p`**, semua lewat TUI interaktif | KEEP (konstrain) | area-06 §6.0 | ? | **Ragu apakah ini item pekerjaan** — ia konstrain, bukan fitur. Dimasukkan karena ia yang membuat seluruh mesin PTY/antrean/gate/barrier **wajib ada**; kalau dilupakan, pelaksana bisa "menyederhanakan" dengan SDK dan merusak alasan billing. Lintas tahap. |
| PTY-039; SCAR-025 | Spawn CC lewat shell: Windows `cmd.exe /c`, Unix login shell interaktif `$SHELL -l -i -c` | KEEP | area-06 §6.1 | 4 | `claude` adalah shim npm yang hanya ter-resolve lewat PATH/rc-file user; melewati shell → `posix_spawnp ENOENT`. |
| PTY-040, 041 | `CLAUDE_BIN` / `CLAUDE_ARGS` bisa dioverride | KEEP | area-06 §6.1 | 4 | Jalan keluar saat default rusak; `CLAUDE_ARGS=""` = vanilla claude. |
| PTY-042 | Env anak selalu membawa lokasi state | KEEP | area-06 §6.1 | 4 | Supaya plugin di dalam CC menyetujui state dir yang sama dengan wrapper. Setelah K-1 (state terpusat) bentuknya berubah tapi kewajibannya tetap. |
| PTY-043, 044, 045 | Ukuran PTY dari terminal user (fallback 100×30), `xterm-256color`, piping dua arah raw, propagasi resize | KEEP | area-06 §6.1 | 4 | Wrapper harus tak terasa saat dipakai manual dari terminal. |
| PTY-046 | CC exit → wrapper exit dengan exit code CC | KEEP | area-06 §6.1 | 4 | |
| PTY-047, 048; SCAR-066 | **SIGINT diteruskan ke PTY** (Ctrl+C membatalkan operasi AI, tidak membunuh wrapper); SIGTERM baru kill PTY | KEEP | area-06 §6.1 | 4 | Kalau SIGINT membunuh wrapper, satu Ctrl+C = kehilangan seluruh sesi. |
| PTY-049 | Shutdown bersih: hentikan timer/watcher, hapus heartbeat & pid, kembalikan terminal dari raw mode | KEEP | area-06 §6.1 | 4 | Terminal yang tertinggal di raw mode = shell user rusak. |
| PTY-050 | Log ISO ke stderr **dan** append ke `wrapper.log` | KEEP | area-06 §6.1 | 4 | Satu-satunya jejak saat injeksi gagal. Rotasi log-nya diputuskan di §12.8. |
| PTY-051 | Satu proses CC seumur hidup wrapper; ganti sesi lewat injeksi `/resume`, bukan kill+respawn | KEEP | area-06 §6.1 | 4 | |
| SCAR-096 | Jangan pakai `import.meta.dir` (Bun-only) — wrapper jalan di Node, butuh `fileURLToPath + dirname` | KEEP | area-06 §6.1 | 4 | Pelajaran umum: jangan asumsikan satu runtime. `fleetd` Bun, `bot-cc` mungkin Node. |
| — | `SUBMIT_DELAY_MS` = 250 (pisahkan teks dari `\r`) | KEEP kontrak, **WAJIB kalibrasi ulang** | area-06 §6.2 | 4 | Autocomplete picker CC **menelan `\r`** bila teks+Enter satu chunk — khusus command bernamespace `/telegram:foo`. Diperkuat §6.6: karena plugin command diizinkan, aturan ini justru makin wajib. |
| — | `MIN_INJECTION_GAP_MS` = 1500 | KEEP kontrak, kalibrasi ulang | area-06 §6.2 | 4 | Lahir dari BUG #3 (2026-06-07): dua payload berurutan saling menyisipkan keystroke. |
| — | `POST_INJECTION_DELAY_MS` = 1000 | KEEP kontrak, kalibrasi ulang | area-06 §6.2 | 4 | "Empirical floor" — di bawah 1000 ms parser slash CC belum selesai mencerna command sebelumnya. |
| — | `CLEAR_SETTLE_MS` = 1500 | KEEP kontrak, kalibrasi ulang | area-06 §6.2 | 4 | Payload antre menyusup ke keystroke pertama sesi baru. |
| — | `CLEAR_BARRIER_TIMEOUT_MS` = 600000 | KEEP kontrak, kalibrasi ulang | area-06 §6.2 | 4 | Safety valve: `/clear` yang keystroke-nya hilang tak boleh membekukan antrean selamanya. 10 menit karena CC memproses `/clear` **setelah** turn AI selesai. Spec §11 mengonfirmasi 10 menit. |
| — | `QUEUE_POLL_MS` = 200 | KEEP kontrak (kandidat jadi event-driven) | area-06 §6.2 | 4 | Dokumen sendiri menandainya kandidat diganti event-driven setelah §6.3. |
| — | `CHUNK_SIZE` / `CHUNK_DELAY_MS` = 100 / 30 | KEEP kontrak, kalibrasi ulang | area-06 §6.2 | 4 | **ConPTY head-drop Windows** — stream membuang karakter TERTUA; "failure mode paling senyap di seluruh sistem". ⚠️ **Ragu / tampak berkonflik:** area-07 §7.1 mendaftarkan chunking (PTY-060/061) sebagai "yang langsung hilang" karena prompt antar-bot tidak lagi diketik ke TUI. Perlu diputuskan: apakah chunking masih dibutuhkan untuk argumen slash yang panjang, atau benar-benar mati. |
| — | Antrean FIFO tunggal + satu drainer + gate | KEEP (mekanisme wajib) | area-06 §6.2 | 4 | Lahir dari insiden tiga-kepala 2026-06-07: `/rename idle` bot-02 hilang, `/clear` bot-03 lenyap (idle-creep), prompt handoff dimakan di tengah. |
| — | Gate dua mekanisme: jendela tunda **monotonik** (`holdFor` hanya memperpanjang) + **barrier `/clear`** sampai sesi baru terdeteksi | KEEP | area-06 §6.2 | 4 | Barrier `/clear` berubah dari polling jadi event setelah §6.3 — prasyarat hook `SessionStart`. |
| SCAR-031 | Snapshot eager daftar sesi saat keystroke `/clear` ditulis | KEEP | area-06 §6.2 | 4 | Aman karena file jsonl baru pasti muncul strictly after. Mungkin jadi tidak perlu setelah hook `SessionStart` — **verifikasi, jangan asumsikan**. |
| SCAR-020 | Chunking aman code-point: split via `Array.from`, jangan membelah surrogate pair; `join('')` wajib merekonstruksi input | KEEP | area-06 §6.2 | 4 | Berlaku selama chunking masih ada (lihat baris `CHUNK_SIZE` di atas). |
| SCAR-029 | Enter TUI = `\r`, bukan `\n` | KEEP | area-06 §6.2 | 4 | `\n` "sometimes ignored by readline-style TUIs". |
| PTY-063 | Kegagalan dispatch satu item tidak menghentikan antrean | KEEP | area-06 §6.2 | 4 | |
| — | **Aturan: semua konstanta pacing wajib punya test + diverifikasi ulang di live** | KEEP (aturan proses) | area-06 §6.2 | 4 | Ditulis sebagai ⚠️ eksplisit: angka-angka ini TIDAK boleh diasumsikan portabel ke mekanisme/versi CC baru. Juga tercatat sebagai tugas wajib #5 di README audit. |
| PTY-067/071/072; SCAR-032/033 | **Deteksi sesi baru GANTI ke hook `SessionStart`** | GANTI (MERGE) | area-06 §6.3 | 4 | Akar struktural. Membunuh polling 500 ms, ketergantungan layout privat CC, duplikasi `encodeProjectDir`, dan perlakuan khusus jalur resume. |
| — | Timeout fallback deteksi sesi yang **berbunyi sebagai alarm di `doctor`** | Syarat penerimaan (FITUR BARU) | area-06 §6.3 | 4 | **Prasyarat: `doctor` (§12.5) harus ada.** Risikonya eksplisit: kalau hook tidak terpasang benar, deteksi mati **total** — lebih buruk dari polling yang selalu bekerja. Prinsip: "setiap kegagalan harus terlihat". |
| — | Catatan: enumerasi sesi untuk picker `/switch` **masih** membaca `~/.claude/projects/` | KEEP (ketergantungan sisa) | area-06 §6.3 | 4 | Bukan pekerjaan baru, tapi wajib disadari: kopling ke internal CC belum hilang total, hanya deteksi *sesi baru* yang pindah. |
| K-12 | Migrasi serentak "matikan semua, ganti semua" — tidak ada periode fleet campuran | Syarat yang diterima user | area-06 §6.4 | ? | **Lintas tahap / operasional**, bukan milik satu tahap. Ia yang menghalalkan DROP seluruh shim kompatibilitas — kalau syarat ini dilanggar (mis. rilis bertahap), empat DROP di §6.4 jadi tidak sah. |
| SCAR-022 | Retry rename EPERM/EBUSY 50/100/150/200 ms (antivirus/Search Indexer Windows) → **pindahkan jadi util umum** | MERGE | area-06 §6.5 | 1 | Audit eksplisit: "jangan hilang bersama registry" — masih relevan untuk **semua** tulisan atomik di Windows. Rawan terlupa persis karena ia mati bersama fitur yang di-DROP. |
| PTY-093 | Reset registry korup → mulai dengan default, jadi **pola deteksi-korup umum** di store baru | MERGE | area-06 §6.5 | 1 | Bandingkan TG-156 (area 01) dan §14.6 — tiga tempat menyebut pola yang sama; K-15 menuntut satu salinan. |
| PTY-001–012, 015–021, 037 | **Permukaan kendali-diri AI jadi DAFTAR PUTIH** (`/clear`, `/compact`, `/rename`, `/resume`, + command bernamespace plugin) | GANTI prinsip (MODIFY) | area-06 §6.6 | 4 | Gagal ke arah aman: command CC baru yang tak dikenal otomatis ditolak. ⚠️ Berinteraksi dengan **K-18**: `/rename` dihapus dari injeksi keystroke dan pindah ke hook `UserPromptSubmit` — perlu diputuskan apakah `/rename` tetap di daftar putih atau ikut keluar. |
| SCAR-086 | **Teks bebas ditolak by design** pada `pty_send_slash` | KEEP (wajib) | area-06 §6.6 | 4 | Slash command "structurally confined" ke apa yang CC definisikan; teks bebas = kendali arbitrer AI atas host-nya sendiri (`rm -rf`). |
| PTY-002; SCAR-037 | Validasi regex mengizinkan `:` (command bernamespace); nama maks 64 char, argumen maks 256 | KEEP | area-06 §6.6 | 4 | Nama bare → "Unknown command" di CC. |
| PTY-005; SCAR-044 | **Self-only** — parameter `target` ditolak dengan teaching error | KEEP (wajib) | area-06 §6.6 | 4 | Asimetri fundamental: prompt punya hakim (AI penerima), slash tidak. Prinsip yang sama menjaga §7.0 (neighbor autonomy). |
| PTY-007 | Wrapper tak terdeteksi hidup → tolak dengan error yang **mengajari solusinya** | KEEP | area-06 §6.6 | 4 | Contoh: "Launch CC via `mirza-cc` instead of `claude` directly". Kebijakan sengaja **berbeda** dari `agent_send` yang mengantre — lihat §7.7/SCAR-070. |
| PTY-011 | Semua kegagalan tool jadi hasil `isError`, tidak pernah merusak protokol MCP | KEEP | area-06 §6.6 | 4 | Pola seragam dengan BUS-032 (§7.10). |
| PTY-002, 007, 016–019 | **Setiap error harus mengajari alternatif yang benar** supaya AI bisa self-correct | KEEP | area-06 §6.6 | 4 | Diangkat jadi aturan wajib di §6.10. |
| SCAR-001 | Konsekuensi izin plugin command: aturan pemisahan teks + `\r` 250 ms **wajib** dipertahankan | KEEP (wajib) | area-06 §6.6 | 4 | Justru command bernamespace inilah yang membuat autocomplete picker menelan Enter. |
| PTY-031; SCAR-027 | Tulisan atomik `tmp.<pid>` + rename, **dan setiap konsumen sweep men-skip file mengandung `.tmp.`** | KEEP (dua sisi kontrak) | area-06 §6.7 | 4 | Audit menekankan: **dua sisi kontrak ini harus pindah BERSAMA**. Diulang di §14.3 — kandidat K-15 (satu salinan). |
| PTY-034; SCAR-068 | **Hapus-sebelum-proses** vs rename ke `processing/` | KEEP kontrak, **bentuk diputuskan di tahap arsitektur** | area-06 §6.7 | 4 | Tugas wajib #4 di README audit. Trade-off sadar: command hilang tanpa jejak bila crash setelah hapus. |
| PTY-036; SCAR-021 | Deteksi dua jalur redundan: notifikasi filesystem (defer 50 ms) **dan** sweep berkala | KEEP | area-06 §6.7 | 4 | `fs.watch` Windows melewatkan event create pada rapid create+delete dan drop saat atomic-rename. Sama dengan §14.3 — satu salinan. |
| PTY-037 | JSON malformed → **karantina `.rejected-<ts>`** + peringatan terlihat di `doctor`, bukan drop diam-diam | KEEP + perbaikan | area-06 §6.7 | 4 | Perbaikan atas perilaku lama (drop senyap). Prasyarat `doctor`. Sama dengan §14.6. |
| PTY-038 | `hop_count > 5` pada payload ber-`from` → DROP (loop prevention) | KEEP | area-06 §6.7 | 5 | Detail di area 07 §7.3 (guard dua sisi). |
| PTY-109–114; SCAR-045 | **Batch = SATU unit atomik** (array payload, enqueue kontigu, maks 8 item, batch gagal validasi diabaikan utuh) | KEEP kapabilitas | area-06 §6.7 | 4 | ⚠️ **Kandidat DROP menurut §8.4**: setelah self-reset handoff jadi satu langkah, handoff bukan lagi pemakainya — "kalau tak ada pemakai lain, batch itu sendiri jadi kandidat DROP di tahap arsitektur". Keputusan belum diambil. |
| — | **Turunkan ulang jaminan atomisitas batch secara eksplisit** (sekarang bergantung single-thread Node) | Tugas wajib arsitektur | area-06 §6.7 | 4 | Ambiguitas #1 inventaris + tugas wajib #2 README. Arsitektur dengan consumer konkuren **tidak boleh mewarisi jaminan ini diam-diam**. |
| SCAR-071 | **Ack dua tingkat untuk injeksi**: `injected` (keystroke tertulis) ≠ selesai semantik (`SessionStart` untuk `/clear`, perubahan nama untuk `/rename`); `{queued:true}` = *accepted*, bukan *done* | KEEP + utang dibayar | area-06 §6.7 | 4 | Utang lama: `pty_send_slash` fire-and-forget, kegagalan hilang di log. Spec §5.4 sudah menetapkan batas waktu per kelas injeksi (`/clear` 10m, `/resume` 5m, `/compact` 10m, plugin command 30s). Prasyarat `doctor` untuk alarmnya. |
| PTY-064, 065; SCAR-034 | First-run → mulai segar; non-first-run → resume sesi dengan mtime jsonl terbaru | KEEP | area-06 §6.8 | 4 | |
| PTY-066; SCAR-041/080 | Pada resume identitas di-seed sinkron; nama dari snapshot statusline **hanya dipercaya bila `session_id`-nya persis sesi yang ditanya** | KEEP (guard wajib) | area-06 §6.8 | 4 | Tanpa guard ini sesi baru mewarisi nama sesi lama dari snapshot basi. Prasyarat: statusline bridge (§11.1). |
| PTY-073; SCAR-081 | Pasca-`/clear`, nama diminta payload ditulis lalu diterapkan ke sesi baru | KEEP, **wajib diverifikasi ulang** | area-06 §6.8 | 4 | Urutannya (tulis id → rename → jeda → event) melahirkan bug "(unnamed)". Audit: dengan K-7 + hook `SessionStart` kerapuhan ini **seharusnya** hilang — "wajib diverifikasi, jangan diasumsikan". K-18 menghapus injeksi `/rename` sama sekali untuk kasus ini. |
| PTY-074 | `switch` → injeksi `/resume <sessionId>`; gate ditahan lebih lama karena swap sesi butuh settle | KEEP | area-06 §6.8 | 4 | Batas waktu `/resume` 5 menit (spec §5.5). |
| PTY-077, 078 | Event `session-change`; `/clear` di tengah batch menunda notifikasinya sampai akhir batch supaya membawa nama FINAL | KEEP | area-06 §6.8 | 4 | Bergantung pada nasib batch (lihat baris PTY-109–114). |
| PTY-083, 084, 085 | Heartbeat ditulis tiap 5 s, dianggap segar bila < 30 s | KEEP | area-06 §6.9 | 1 | Ambang mengakomodasi GC pause, FS stall, suspend/resume. |
| SCAR-067 | **Dua sinyal, bukan satu**: heartbeat segar + cek pid via `kill(pid, 0)` (`ESRCH` mati, `EPERM` hidup, error lain → percayai heartbeat) | KEEP | area-06 §6.9 | 1 | Wrapper yang crash dalam window 30 s masih tampak segar kalau hanya heartbeat yang dipakai. |
| SCAR-010 | **Ambang 30 s wajib SATU konstanta bersama** untuk tiga pembaca (pty ipc, telegram meta-commands, agent-bus) | SATUKAN | area-06 §6.9, §7.6, §14.4 | 1 | Tugas wajib #6 di README audit; §14.4 menyebutnya "kandidat pertama untuk disatukan". Menyentuh tahap 1, 4, dan 5 — karena itu wajib ditetapkan di tahap 1. |
| SCAR-028 | **PID reuse — celah terbuka**, perlu keputusan sadar: sertakan start-time proses, atau terima risikonya dengan catatan | Keputusan belum diambil | area-06 §6.9 | ? | **Tidak jelas tahapnya**: liveness ada di tahap 1, tapi celah ini baru berbahaya setelah `bot-cc` (tahap 4). §14.1 menyebut K-14 menghapus sebagian besar konteks pid, tapi §6.9 tetap mencatatnya terbuka. Belum ada keputusan sama sekali — bukan cuma belum dikode. |
| PTY-002–004, 007, 008, 010, 016–027 | **Aturan wajib: setiap penolakan menyebutkan alternatif yang benar** | KEEP → naik jadi aturan wajib | area-06 §6.10 | ? | **Lintas tahap** — berlaku untuk setiap error di setiap komponen. Tidak punya rumah di §10. Ini yang membuat AI bisa memperbaiki diri tanpa bertanya ke user. |
| PTY-022–027 (sisa) | **Nama plugin command wajib fully-qualified** (`/telegram:notify-user`, bukan `/notify-user`) | KEEP (satu aturan yang selamat) | area-06 §6.10 | 4 | Sisa satu-satunya dari kontrak playbook `/new` yang mati bersama meta-command lama — rawan ikut terbuang. |

---

## Area 07 — Komunikasi antar-bot

**Non-DROP: 30 · DROP dilewati: 8** (§7.1: perataan newline, batas 8 KB, chunking ConPTY untuk prompt, penahanan gate sepanjang pengetikan, tipe `prompt` di union payload; §7.10: BUS-026 identitas dari basename, BUS-033–036 registry+lockfile, BUS-002 ambang stale 24 jam)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| BUS-017, 037; SCAR-044; PTY-005 | **Prinsip induk neighbor autonomy** — prompt punya hakim, slash tidak; `kind:"slash"` antar-bot tetap dihapus | KEEP (prinsip) | area-07 §7.0 | 5 | **Aturan uji**: setiap kanal antar-bot BARU wajib lewat uji prinsip ini. Dipakai lagi di §8.2b (penerima yang memutuskan) dan §8.C (bot penerima delegasi yang memutuskan kapan menanggapi). |
| BUS-037 | Setiap bot bertanggung jawab atas sesinya sendiri; **bot macet diselamatkan user**, bukan bot tetangga | KEEP | area-07 §7.0 | 5 | |
| BUS-027, 022; SCAR-038 | **Transport prompt antar-bot GANTI ke jalur notifikasi channel** (pintu yang sama dengan pesan Telegram masuk) | GANTI (MERGE) | area-07 §7.1 | 5 | Sejalan K-10: keystroke tersisa **hanya** untuk slash lifecycle. Yang tetap utuh: yang masuk tetap prompt yang dibaca AI penerima dan boleh ditolak. Prasyarat: jalur pesan tahap 2 + `bot_inbox`. |
| BUS-025, 038; SCAR-043 | **Marker atribusi GANTI jadi metadata terstruktur** (`from`, `hop`, `id` di luar badan pesan) — fix SEC-4 | GANTI | area-07 §7.2 | 5 | SEC-4: user bisa **mengetik** string marker di Telegram dan AI memperlakukannya sebagai perintah dari bot lain. Juga hemat token dan tidak mencampur instruksi dengan data. |
| BUS-038 | Aturan anti-bounce **ditulis ulang** mengacu ke metadata, bukan ke teks marker | MODIFY (konsekuensi §7.2) | area-07 §7.2 | 5 | Rawan terlupa: aturan skill lama berbunyi "prompt yang diawali marker `[Message from agent …]` = terminal context" — kalau tidak ditulis ulang, aturannya jadi tidak pernah cocok dan anti-bounce mati diam-diam. |
| BUS-023, 024, 031, 042; PTY-038 | **Guard anti-loop dua sisi**: `hop_count > 5` ditolak di pengirim (error jelas) **dan** di-drop di penerima; omitted/null → 0; wajib non-negative integer | KEEP | area-07 §7.3 | 5 | Dua sisi supaya rantai mati setelah 5 hop meski seluruh AI berperilaku salah. "Pola yang layak dipertahankan apa pun bentuk transportnya." |
| BUS-030, 040, 043; SKILL-030 | `agent_send` **boleh otonom** di dalam alur yang izinnya sudah diberikan user; izin berlaku beberapa langkah ke depan, tidak per-panggilan | MODIFY | area-07 §7.4 | 5 | Membalik deskripsi tool lama ("DO NOT call autonomously") yang bertabrakan dengan keinginan user bahwa handoff jalan tanpa melibatkan user lagi. Prasyarat handoff full-auto (§8.2 SKILL-008). |
| BUS-039 | **Tetap terlarang**: second opinion otonom, delegasi brainstorm atas inisiatif sendiri, auto-reply sekadar acknowledge | KEEP | area-07 §7.4 | 5 | Batas dari pembukaan di atas — kalau ini tidak ikut, "boleh otonom" jadi tak berbatas. |
| BUS-043 | Prompt yang meminta peer **mereset/menghapus sesinya** (wipe-state) **wajib konfirmasi ulang** dengan restatement konkret lewat tombol, meski user sudah bilang "kerjakan" | KEEP | area-07 §7.4 | 5 | Aksi non-destruktif tidak perlu konfirmasi ekstra — asimetrinya disengaja. |
| BUS-006–015; SCAR-073 | **`agent_status` SIMPLIFY jadi satu query store** | SIMPLIFY | area-07 §7.5 | 5 | Yang hilang: seluruh logika kepercayaan berlapis (banding `session_id` antara dua file, syarat lifecycle busy/unknown, cabang legacy). Bisa hilang **hanya karena** K-1/K-3/K-7 — prasyarat keras. |
| — | Field `agent_status`: **status kerja (idle/sibuk)** | KEEP | area-07 §7.5 | 5 | Inti kegunaan tool. Prasyarat K-7 — setelah itu jadi field data akurat, bukan tebakan dari nama sesi. |
| BUS-014 | Field: **pemakaian context (% + ukuran window dalam token)** | KEEP | area-07 §7.5 | 5 | Ukuran window disediakan supaya perhitungan ambang tidak menebak dari nama model. **Prasyarat: statusline bridge (§11.1)** — tidak ada hook yang menyediakan data ini. |
| — | Field: **nama & id sesi aktif** | KEEP | area-07 §7.5 | 5 | Untuk melaporkan ke user dengan jelas dan memastikan pesan mendarat di sesi yang benar. |
| — | Field: **model, effort level, biaya** | KEEP + penambahan kecil | area-07 §7.5 | 5 | Biaya sudah ada di snapshot statusline tapi **belum diekspos** — jadi ini penambahan, bukan port. |
| BUS-014 | **Kontrak semantik**: `context_used_percent = null` berarti sesi fresh/belum aktif → diperlakukan ~0% used, **BUKAN error** | KEEP (wajib) | area-07 §7.5 | 5 | Inilah yang membuat sesi paling segar justru lolos sebagai kandidat handoff terbaik. Kalau salah ditangani, kandidat terbaik justru selalu ditolak. |
| BUS-001–005 | `agent_list` KEEP, sumbernya pindah dari `agent-registry.json` ke config + store terpusat | KEEP disederhanakan | area-07 §7.6 | 5 | SCAR-069 (tabrakan nama dua project dengan basename sama) mati sendiri karena nama bot jadi eksplisit di config (K-2). |
| SCAR-010/011 | Ambang online 30 s pada `agent_list` — **wajib satu konstanta bersama** | SATUKAN | area-07 §7.6 | 1 | Pembaca ketiga dari SCAR-010. Karena tersebar di tiga tahap, konstantanya harus lahir di tahap 1. |
| BUS-005 | Kontrak "**safe to call autonomously at any time**" untuk `agent_list` | KEEP | area-07 §7.6 | 5 | Melihat siapa yang ada tidak pernah berbahaya — pembeda eksplisit dari `agent_send`. |
| BUS-028, 045 | **Antre-untuk-offline**: target offline tetap menerima pesan (dikonsumsi saat peer boot), hasil jujur melaporkan `online:false`; target tak terdaftar → gagal dengan alasan jelas; error tulis per-target tidak menggagalkan target lain | KEEP | area-07 §7.7 | 5 | Sudah ada padanannya di sistem baru (`bot_inbox`), tapi tiga sub-perilaku (laporan `online:false`, target tak terdaftar, isolasi error per-target) belum tentu ikut. |
| BUS-045 | **Kewajiban AI memberi tahu user** bahwa pesan baru dikonsumsi saat peer boot | KEEP | area-07 §7.7 | 5 | "Bukan diam-diam menganggap terkirim." Diulang sebagai kewajiban di §8.7 (SKILL-021). |
| SCAR-070 | Asimetri `agent_send` (mengantre) vs `pty_send_slash` (menolak) **dibiarkan berbeda tapi eksplisit dengan alasan tertulis** | Keputusan (KEEP) | area-07 §7.7 | 5 | Alasannya: prompt boleh menunggu karena penerimanya AI yang belum lahir; slash tidak boleh menunggu karena ia mengubah state sesi yang mungkin sudah berbeda saat mendarat. Kalau alasan ini tidak ditulis di kode/dok, inkonsistensinya akan "diperbaiki" salah arah oleh orang berikutnya. |
| BUS-019, 029, 044 | **Broadcast/fan-out**: `target` menerima string atau array (buang non-string, trim, dedup; hasil kosong → error); satu panggilan → envelope hasil per-target | KEEP | area-07 §7.8 | 5 | |
| — | **Pola leader fan-out**: `agent_list()` → `agent_send` array → peringatkan user soal target offline → bila diminta laporan balik, ringkas lalu STOP | KEEP (aturan skill) | area-07 §7.8 | 5 | Aturan perilaku, rumahnya kemungkinan skill `telegram-conduct` (§10.D) — belum ditetapkan. |
| BUS-041 | **Kanal satu arah** — tidak ada reply channel; leader yang butuh hasil memintanya **di dalam badan pesan** | KEEP | area-07 §7.9 | 5 | Ini yang membuat delegasi (§8.C) tidak butuh kanal balasan sama sekali — konsisten. |
| BUS-046 | Nama peer **tidak boleh ditebak** — selalu dari `agent_list` (setelah K-2, dari config) | KEEP | area-07 §7.9 | 5 | |
| BUS-047 | **Jangan menaruh secret di badan prompt** — pesan mendarat di filesystem/store peer, diperlakukan non-confidential | KEEP | area-07 §7.9 | 5 | |
| BUS-016, 018 | Validasi `kind` enum `['prompt']` — tetap ada tapi jadi sepele | KEEP | area-07 §7.10 | 5 | |
| BUS-032 | Error handler jadi `isError: true` | KEEP | area-07 §7.10 | 5 | Pola seragam dengan PTY-011. |
| — | Skill `using-agent-bus` **ditulis ulang dari kode**, bukan dari teks lama | MODIFY | area-07 §7.10 | 5 | Ambiguitas #5 inventaris: skill lama menyebut error yang sudah tidak ada. Kelas masalah yang sama dengan `template.md` handoff (§8.5 SKILL-017). |
| B-7 | Riwayat sesi per bot yang bisa "**dikunjungi sementara**" | DEFER (belum didesain) | area-07 §B-7 | ? | Spec §13 menaruhnya **di luar lingkup v1** — jadi bukan tahap 1–6. Bukan DROP, jadi tetap dicatat. Kandidat kuat: B-2 sudah cukup dan B-7 sebenarnya gejala dari B-2 yang belum ada. |

---

## Area 08 — Handoff

**Non-DROP: 59 · DROP dilewati: 8** (mode File only §8.1/§8.A; Konteks Proyek dan Catatan Lain di template §8.5; SKILL-003 state machine nama sesi, SKILL-004 READY dari nama, SKILL-006 fallback tebak window dari string model di §8.7; `Lanjutan dari` dan `Pair` di file delegasi §8.C)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| SKILL-009 | Mode 🚀 **Now** — pilih bot → tulis file → kirim | KEEP | area-08 §8.1 | 5 | |
| SKILL-010 | Mode ⏭️ **After this task** — designation one-shot | KEEP | area-08 §8.1 | 5 | "Inti dari handoff tanpa mengganggu user". Prasyarat: designation jadi **data** (§8.3), kalau tidak ia lenyap saat compaction. |
| SKILL-011 (mode) | Mode 🏓 **Ping pong** — designation menular via header `Pair:` | KEEP | area-08 §8.1 | 5 | Kalau ping-pong kelak dibuang, header `Pair` di template (§8.5) ikut. |
| SKILL-011 | **Ekuivalensi bahasa natural**: "nanti handoff ke bot-02" ≡ After-this-task bertarget (lewati dua step tombol); "handoff ke bot-02 sekarang" ≡ Now bertarget (lewati step pilih bot) | KEEP | area-08 §8.1 | 5 | Yang membuat alur cepat tidak terhalang tombol. Mudah terlewat karena bukan tombol, melainkan pemahaman bahasa. |
| SKILL-006, 007 | Dasar ambang pemicu **GANTI** dari persen per-ukuran-window jadi angka tunggal | GANTI | area-08 §8.2 | 5 | ⚠️ **Sebagian dibalik oleh §8.B**: ambang PENGIRIM akhirnya **50% dari total context** (persen), bukan sisa token. Pembalikan dinyatakan dapat diterima dengan alasan tertulis. BACKLOG harus memakai §8.B, bukan §8.2. |
| SKILL-007 | Ambang hanya diperiksa **di batas selesai-task**; boleh terlampaui selama task berjalan | KEEP | area-08 §8.2 | 5 | "Jangan menginterupsi pekerjaan." Butuh sinyal "task selesai" — §11.0 mencatat hook `TaskCompleted` sebagai kandidat yang selama ini ditebak. |
| SKILL-008 | Ada designation → full-auto (user cukup dinotifikasi); tanpa designation → tombol `[🤝 Handoff] [▶️ Lanjutkan]`; pilih Lanjutkan → **jangan tawarkan lagi sampai batas selesai-task berikutnya** (anti-spam) | KEEP | area-08 §8.2 | 5 | Anti-spam-nya bagian yang paling mudah terlupa saat implementasi. |
| — | Syarat penerima #1: **context terpakai < 100.000 token** — mutlak, tidak ikut ukuran window, disetel di config | ATURAN BARU | area-08 §8.2b | 5 | Sumber datanya snapshot statusLine → **prasyarat statusline bridge (§11.1)**. Menggantikan SKILL-004 seluruhnya. |
| — | Syarat penerima #2: **tidak sedang bekerja** (tidak ada giliran berjalan) — fakta dari hook, bukan tebakan nama | ATURAN BARU | area-08 §8.2b | 5 | Menutup lubang yang ditinggalkan nama `idle`: bot 20k tapi sedang mengerjakan permintaan user tidak boleh menerima estafet. **Prasyarat: K-7 + hook lifecycle.** Tanpa ini, membuang nama `idle` = kehilangan informasi tanpa pengganti. |
| — | **Pengirim menyaring** lewat `agent_status` sebelum menulis file | ATURAN BARU | area-08 §8.2b | 5 | |
| — | **Penerima memutuskan** — keputusannya yang mengikat | ATURAN BARU | area-08 §8.2b | 5 | Menjaga neighbor autonomy (§7.0); kondisi bisa berubah di antara dua momen. |
| — | Cabang **OK**: batas waktu dimatikan → user diberi tahu → `/clear` diantre ke pengirim | ATURAN BARU | area-08 §8.2b | 5 | |
| — | Cabang **NOT-OK**: batas waktu dimatikan → kembali ke user dengan alasan penolakan + pilihan bot lain | ATURAN BARU | area-08 §8.2b | 5 | |
| — | Cabang **timeout**: kembali ke user dengan `[Kirim ulang] [Pilih bot lain] [Batal]`; pengirim **TIDAK** direset | ATURAN BARU | area-08 §8.2b | 5 | Konsisten dengan SKILL-026. |
| — | **Pelaksana ketiga cabang itu adalah `fleetd`, bukan AI pengirim** | ATURAN BARU (⚠️ mengikat) | area-08 §8.2b | 5 | Alasan: ingatan "saya sedang menunggu ACK" hidup di context, dan handoff dipicu **justru saat context hampir penuh** — kondisi paling rawan compaction. Ini penerapan K-5 yang paling mahal kalau salah. |
| — | Bila **tidak ada bot yang memenuhi syarat**: laporkan kondisi tiap peer konkret, lalu tombol `[Tulis file saja] [Pilih paksa salah satu] [Batal]` | ATURAN BARU | area-08 §8.2b | 5 | ⚠️ **Remnant dari DROP**: `[Tulis file saja]` menghidupkan kembali fungsi mode "File only" yang di-DROP §8.1 — tapi sebagai jalan keluar saat buntu, bukan mode yang dipilih di awal. Rawan ikut terbuang bersama DROP-nya. |
| SKILL-020–029, 032 (sebagian) | **State handoff jadi DATA + timeout jadi alarm mesin** (siapa→siapa, slug, sudah di-ACK, designation aktif, pasangan ping-pong) | KEPUTUSAN STRUKTURAL (MERGE) | area-08 §8.3 | 5 | Menggantikan state machine berbasis teks skill + cron one-shot 10 menit yang dipasang AI dan harus diingat untuk dibatalkan. Untung: handoff menggantung **terlihat** di `doctor`; urutan SKILL-024 tak bisa terbalik; designation tidak hilang saat compaction. |
| SKILL-020 | Designation full-auto + target tidak READY → **designation BATAL**, beri tahu user, jatuh ke pemilihan manual | KEEP (perilaku) | area-08 §8.3 | 5 | Guard READY jadi pemeriksaan data, bukan interpretasi nama sesi. |
| SKILL-026 | Timeout tanpa ACK → lapor + `[Kirim ulang] [Pilih bot lain] [Cancel]`; **JANGAN self-reset** | KEEP | area-08 §8.3 | 5 | Estafet belum berpindah — self-reset di sini = pekerjaan hilang di dua sisi. |
| SKILL-027 | R menolak (sibuk) → lapor + kembali ke pemilihan bot. **ACK datang terlambat**: belum ada keputusan user → lanjutkan langkah ACK normal; estafet sudah dipindah → laporkan konflik, **jangan kirim apa pun** ke R | KEEP | area-08 §8.3 | 5 | Cabang "ACK terlambat" adalah edge case yang paling mudah terlewat dari ketiganya. |
| SKILL-019, 023 | Dua laporan wajib ke user: "file handoff selesai: `<path absolut>`" lalu "handoff `<slug>` terkirim ke `<R>`, menunggu ACK" | KEEP | area-08 §8.3 | 5 | |
| SKILL-028 (langkah 5) | **ACK dua arah**: ke pengirim (lewat agent-bus) **dan** ke user lewat Telegram dengan ringkasan next-step | KEEP | area-08 §8.3 | 5 | |
| SKILL-013 | Bot non-ready/offline **tetap bisa dipilih** user; pilihan sadar membawa **penanda eksplisit** supaya guard penerima tidak menolaknya | KEEP | area-08 §8.3, §8.2b | 5 | Penanda "ini pilihan sadar user" adalah bagian yang paling mudah hilang — tanpa itu, tombol "Pilih paksa" jadi tidak berfungsi karena penerima menolaknya. |
| SKILL-025; PTY-078; SCAR-045 | **Self-reset SIMPLIFY jadi satu langkah**: `/clear` + satu penulisan status ke store | SIMPLIFY | area-08 §8.4 | 5 | Dua dari tiga rename kehilangan alasannya setelah K-7. Konsekuensi: kebutuhan batch atomik untuk handoff hilang → batch (§6.7) jadi kandidat DROP. |
| SKILL-005 (sebagian) | **Pengganti wajib**: kaitan sesi ↔ file handoff tersimpan sebagai **data**, bukan tercermin di nama sesi `done-<slug>-<ts>` | ATURAN BARU (wajib) | area-08 §8.4 | 5 | Audit menulis eksplisit "penggantinya wajib ada". Rawan hilang karena ia muncul sebagai catatan di dalam seksi tentang apa yang **dibuang**. |
| SKILL-017/018 | Template handoff: bagian **Tujuan handoff** | KEEP | area-08 §8.5 | 5 | |
| SKILL-017/018 | Template: **SUDAH / SEDANG** (posisi pekerjaan) | KEEP | area-08 §8.5 | 5 | |
| SKILL-017/018 | Template: **Blocker + kenapa jadi blocker** | KEEP (wajib) | area-08 §8.5 | 5 | Alasannya wajib, bukan hanya daftarnya. Dipakai SKILL-028 sebagai gate adaptif (Blocker ≠ `—` → tanya user dulu). |
| SKILL-017/018 | Template: **AKAN** (goal + langkah + starting point) | KEEP | area-08 §8.5 | 5 | |
| SKILL-017/018 | Template: **Referensi dengan kolom "Kapan dibaca"** | KEEP (wajib) | area-08 §8.5 | 5 | Mencegah bot penerima membaca semuanya atau tak membaca apa pun. Ikut dipakai template delegasi (§8.C). |
| SKILL-017/018 | Template: **Referensi playbook** | KEEP → **jadi KONDISIONAL** | area-08 §8.5 + area-13 §13.4 | 5 | ⚠️ Area 13 mengubah ini: playbook keluar dari lingkup v1, jadi baris ini berubah dari "wajib" jadi "**bila ada**"; ketiadaan playbook bukan cacat handoff. Kalau §8.5 dibaca sendirian tanpa §13.4, implementasi akan salah mewajibkannya. |
| SKILL-017/018 | Template: **Referensi tasks/plans bila lintas sesi** | KEEP | area-08 §8.5 | 5 | Wajib bila pekerjaan panjang sudah terencana sebelumnya. |
| SKILL-017/018 | Template: **Anti-Patterns / Lessons (CARRY FORWARD)** | KEEP (wajib, dipertegas §13.4) | area-08 §8.5, area-13 §13.4 | 5 | Tetap wajib **justru karena** playbook belum ada — ini satu-satunya jalur pelajaran berpindah bersama estafet di v1. |
| SKILL-017/018 | Template: **Header** — Date, Repo kerja, Branch (HEAD SHA), Dari → Ke, Lanjutan dari | KEEP | area-08 §8.5 | 5 | |
| — | Bagian "Keputusan User Lewat Brainstorming" **DIGABUNG** ke Tujuan atau Referensi | MERGE | area-08 §8.5 | 5 | Bukan DROP — isinya tetap ada, rumahnya pindah. |
| — | Header **`Pair`** | KEEP | area-08 §8.5 | 5 | Terikat nasib ping-pong (§8.1). |
| SKILL-018 | Sifat file: **append-only chain**, jangan pernah mengedit handoff lama; `Lanjutan dari` hanya bila benar-benar kontinuasi; **jangan menduplikasi checklist plan** (plan = source of truth) | KEEP | area-08 §8.5 | 5 | Aturan terakhir persis permintaan user: "tidak menulis ulang informasi yang sudah dijelaskan referensi yang sudah ada". |
| SKILL-017 | Template **di-generate langsung**, jangan load `template.md` dari disk | KEEP (wajib) | area-08 §8.5 | 5 | Sudah pernah menyimpang: template membawa READY-heuristic lama yang sudah digantikan SKILL.md (ambiguitas #5). Penerapan K-15 pada handoff. |
| SKILL-002 | **Bot tidak pernah bekerja di workspace-nya sendiri**; semua path di protokol **absolut** | KEEP | area-08 §8.6 | 5 | |
| SKILL-005 | Slug kebab-case ≤ 6 kata; slug **sama** dipakai untuk nama file dan pelacakan handoff | KEEP | area-08 §8.6 | 5 | Setelah §8.4, "pelacakan" berarti baris data, bukan nama sesi. |
| SKILL-014 | **Clarity check pra-file** (ketiganya wajib): next-step satu kalimat tanpa hedging · artefak konkret yang bisa dikutip · arah **terkonfirmasi user** atau terdokumentasi — **inferensi AI murni tidak dihitung**; gagal → brainstorm dulu | KEEP | area-08 §8.6 | 5 | Audit menyebutnya "guard paling penting terhadap handoff yang isinya tebakan". |
| SKILL-015 | **Mandat README**: update README root + README sub-folder yang tersentuh **SEBELUM** menulis file handoff | KEEP | area-08 §8.6 | 5 | "Handoff dengan README basi = handoff cacat." Ia juga yang menghalalkan DROP bagian "Konteks Proyek" di template — kalau mandat ini tidak ada, DROP itu jadi tidak sah. |
| SKILL-016 | Lokasi `<repo-kerja>/.handoff/<yyyymmddhhmm>-prompt-<slug>.md`; repo dari `git rev-parse --show-toplevel` (bukan repo git → fallback `pwd` + beri tahu user sekali); collision → suffix `-2`, `-3` | KEEP | area-08 §8.6 | 5 | `.handoff/` adalah pengecualian eksplisit K-1 (artefak pekerjaan, bukan artefak bot). |
| SKILL-012 | Step pilih bot: status dinarasikan sebagai bullet **tanpa penomoran** di body; tombol hanya nama bot + Cancel; marka ✅ idle · ⛔ sibuk · 🔄 transisi · 📴 offline | KEEP | area-08 §8.6 | 5 | Marka "⚠️ nama manual" **hilang** — konsekuensi K-7. Aturan "body tidak mengulang deretan tombol" datang dari SKILL-052 (§10.4). |
| SKILL-031 | Larangan receiver: jangan edit/hapus file handoff atau plan; jangan telusuri seluruh rantai `Lanjutan dari` (maks satu hop, hanya bila konteks kurang); jangan membalas apa pun ke pengirim selain ACK/penolakan | KEEP | area-08 §8.6 | 5 | |
| SKILL-032 | Edge case: dua handoff paralel di repo sama aman · bot designated keburu dipakai → designation batal · plan hilang / branch beda / SHA yatim → **jangan gagal, catat + lanjut** · `/handoff <argumen>` → argumen diabaikan total | KEEP | area-08 §8.6 | 5 | Empat edge case dalam satu baris karena dokumen memperlakukannya satu entri. |
| SKILL-028 | Template body `agent_send`: semua placeholder `<...>` **disubstitusi literal SEBELUM kirim** (termasuk `<slug>`) · guard sibuk paling dulu · baca file handoff **persis yang ditunjuk, JANGAN cari "latest"** · gate adaptif Blocker ≠ `—` → tanya user dulu | KEEP | area-08 §8.6 | 5 | "Jangan cari latest" adalah peringatan langsung user: bisa ada handoff lain yang dibuat paralel oleh bot lain. |
| SKILL-021 | `agent_send` ke target offline tetap terkirim (antre) dan **wajib** disebut di laporan | KEEP | area-08 §8.7 | 5 | Sama dengan BUS-045 (§7.7) — dua area menyebut kewajiban yang sama; K-15 menuntut satu rumah. |
| SKILL-030 | Legalitas `agent_send` terhadap aturan agent-bus **ditulis ulang** sesuai §7.4 | MODIFY | area-08 §8.7 | 5 | Kalau tidak ditulis ulang, teks skill lama ("DO NOT call autonomously") akan melumpuhkan handoff full-auto yang justru jadi tujuan §7.4. |
| 8.B | **Ambang PENGIRIM = 50% dari total context**, disetel di config | DITETAPKAN | area-08 §8.B | 5 | Prasyarat statusline bridge. Dua ambang, dua satuan, **sengaja berbeda**: pengirim 50% relatif, penerima < 100k mutlak. |
| B-8 | **Delegasi** — primitif baru, berbeda dari handoff (dua pemilik paralel, tak ada yang mereset) | FITUR BARU | area-08 §8.C | 6 | Selesai didesain 4/4 (2026-07-30), siap masuk rencana implementasi tahap 6. Memakai ulang mesin handoff + mesin prompt-antar-bot — **prasyarat: tahap 5 selesai**. |
| B-8 | Delegasi: **tidak ada kewajiban lapor balik** ke bot utama | Keputusan | area-08 §8.C | 6 | Ini yang menggugurkan seluruh pertanyaan "bagaimana hasilnya kembali" — tidak perlu kanal balasan sama sekali. |
| B-8 | Delegasi: **isolasi repo ikut Rule 1 umum (tawaran, bukan wajib)** | KOREKSI 2026-07-30 | area-08 §8.C, area-10 §10.A | 6 | ⚠️ Membalik keputusan sebelumnya ("wajib worktree untuk delegasi"). Alasan cabut: delegasi bisa murni diskusi/analisis tanpa menyentuh file. Dokumen area-10 §10.A juga sudah dikoreksi — dua tempat konsisten. |
| B-8 | Delegasi: **tidak ada self-reset pengirim** | Keputusan | area-08 §8.C | 6 | Inti perbedaannya dengan handoff. |
| B-8 | Delegasi: **ACK numpang `reply` + hook `Stop`**; `fleetd` mencatat transisi `terkirim → dibalas` sebagai observability pasif, **tanpa** timeout dan tanpa status NOT-OK | DITETAPKAN 2026-07-29 | area-08 §8.C | 6 | Prasyarat: hook `Stop` (tahap 3) + tabel `handoffs` (tahap 5). Tidak ada mekanisme baru — itu poin utamanya. |
| B-8 | Delegasi: **"bot tujuan sibuk" bukan konsep yang ditangani mesin** — pesan selalu terkirim, mengantre di `bot_inbox`; bot penerima yang memutuskan | DITETAPKAN 2026-07-29 | area-08 §8.C | 6 | Melempar keputusan itu ke `fleetd` melanggar neighbor autonomy. Courtesy opsional: pengirim boleh cek `agent_status` dulu. |
| B-8 | Delegasi: file di `.handoff/` dengan prefix nama `delegasi-<slug>` | DITETAPKAN 2026-07-30 | area-08 §8.C | 6 | Bukan folder baru — supaya tetap satu tempat, tapi sekilas terlihat beda dari estafet asli. |
| B-8 | Delegasi: field **`Batas potongan`** (wajib, dua sisi eksplisit — *Milik penerima* vs *TETAP milik pengirim*, sebut file/folder spesifik bila ada risiko tumpang tindih) | FITUR BARU (field baru) | area-08 §8.C | 6 | Disebut "satu field baru, paling penting". Jangan diasumsikan cukup dari nama worktree saja. |
| B-8 | Delegasi: bagian yang **diganti maknanya** — `Repo & worktree`, `Konteks yang sudah diketahui`, `Definisi selesai`, `Kendala` | MODIFY | area-08 §8.C | 6 | Nama/section mirip template handoff tapi isinya beda karena dua pemilik paralel — rawan diimplementasi sebagai copy template handoff. `Definisi selesai` idealnya terverifikasi mekanis (gagasan SKILL-037 dari area 09). |

---

## Area 09 — Goal

**Non-DROP: 2 · DROP dilewati: 10** (SKILL-033, SKILL-034, SKILL-035/036, SKILL-037/038/039 sebagai aturan plugin, SKILL-040, SKILL-041/043, SKILL-042, SKILL-044, TG-058 entri slash-menu, §9.2 tawaran proaktif)

Seluruh plugin `goal` di-DROP. Dua **gagasan** di dalamnya secara eksplisit "dicatat untuk dipertimbangkan di area 08/13, bukan hilang bersama plugin-nya" — jadi keduanya tetap item pekerjaan, hanya rumahnya pindah.

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| SKILL-037 (gagasan) | **Kondisi "selesai" harus terverifikasi mekanis** (test lulus, exit code, jumlah file) — bukan subjektif | MERGE (dipindah ke area 08/13) | area-09 "Yang layak diselamatkan" | 6 | Dipakai langsung oleh **delegasi §8.C** (bagian `Definisi selesai`) — area 08 sendiri merujuk "SKILL-037 area 09". Juga relevan untuk plan/task apa pun. Kalau area 09 dianggap "semua DROP", pemakainya di §8.C kehilangan sumber aturannya. |
| SKILL-039 (gagasan) | **Klausa stop wajib bila ada risiko loop tak berujung** (mis. "…atau berhenti setelah 20 turn") | MERGE (prinsip umum) | area-09 "Yang layak diselamatkan" | ? | Prinsip umum: setiap pekerjaan otonom wajib punya kondisi berhenti, bukan hanya kondisi berhasil. **Tidak jelas tahapnya** — kandidat rumah: skill perilaku (§10.D) atau delegasi (tahap 6). Belum ditugaskan ke mana pun secara eksplisit. |

---

## Area 10 — Disiplin balas & penegakan kewajiban

**Non-DROP: 32 · DROP dilewati: 4** (pre-flight 4 pertanyaan SKILL-045; kondisi skip SKILL-046; hook pengingat per-turn TG-161/162; mekanisme name-session lama — "ingatkan sekali lalu berhenti" + tombol `[Pakai "<nama>"] [Nama lain] [Nanti saja]` + larangan auto-rename)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| SKILL-045, 046 | **Ack dipaksa mesin**: giliran dari Telegram → pemanggilan tool non-`reply` **pertama DITOLAK** bila belum ada reply sejak pesan user, dengan pesan yang mengajari | DIPAKSA MESIN (MERGE ke hook) | area-10 §10.1 | 3 | Menggantikan seluruh "pre-flight 4 pertanyaan". Efek gratis: respons murni teks tanpa tool call tidak pernah memicu penolakan — kondisi skip jadi otomatis benar. **Ditolak eksplisit**: opsi "mesin yang mengirim ack" (nilai ack ada pada isinya). |
| SKILL-049 | Satu ack per pesan masuk; user kirim 3 pesan dalam 5 detik → ack yang terbaru saja | KEEP (aturan skill) | area-10 §10.1 | 3 | Murni gaya, tak bisa dijamin mesin — rumahnya skill `telegram-conduct`. |
| — | Ack satu baris, maks satu emoji, < 50 karakter, wording bervariasi, **mengikuti bahasa & register user** | KEEP (aturan skill) | area-10 §10.1 | 3 | Konsisten dengan K-16 (pesan AI ikut bahasa user). |
| TG-163, 164; SCAR-093 | **Penjaga jawaban final — FIX bug FUNC-3**: blokir bila tidak ada reply **SETELAH pemanggilan tool non-reply yang TERAKHIR** | FIX (MODIFY) | area-10 §10.2 | 3 | Bug lama: ack juga memakai tool `reply`, jadi "semakin patuh bot menjalankan immediate-reply, semakin mudah ia lolos dari penjaga jawaban final" — dua kewajiban saling melumpuhkan. |
| — | Bot yang menutup dengan satu reply lalu tidak melakukan apa pun **tetap lolos** | KEEP (syarat implementasi) | area-10 §10.2 | 3 | Kriteria negatif — mudah rusak saat memperketat aturan di atas. |
| TG-164 | **Loop-guard tetap**: `stop_hook_active` → tak pernah memblokir dua kali; transcript hilang/tak terbaca → lolos diam-diam | KEEP | area-10 §10.2 | 3 | |
| — | **Fix bug "sticky" `telegramDriven`** — lacak **posisi terakhir**, bukan flag seumur sesi | FIX | area-10 §10.2 | 3 | Sekarang giliran yang dijalankan user dari terminal bisa salah-diblokir begitu sesi itu pernah menerima pesan Telegram. B-9 (2026-07-31) menunjukkan masalah sejenis sudah ditangani untuk stempel protokol; penjaga `Stop` belum tentu ikut. |
| SKILL-048 | **Narasi progres tetap kewajiban AI**: reply baru di setiap **perubahan tahap yang nyata**, bukan timer/heartbeat/pengisi; ambang kasar task > 15 detik wall clock | KEEP | area-10 §10.3 | 3 | User menolak "tanda hidup generik dari mesin" — progres dari AI memberi tahu **sedang apa**, bukan sekadar **masih hidup**. |
| SKILL-052 | Cara menyusun tombol: label pendek (> ~15 karakter → ganti pola), menu bernomor dinarasikan di body, **body tidak pernah mengulang deretan tombol sebagai teks**, dua label panjang tidak sebaris | KEEP (aturan skill) | area-10 §10.4 | 3 | Berpasangan dengan validasi tombol mekanis di area 04 §4.1 — mesin menjaga batas, skill menjaga gaya. |
| SKILL-055 | **Jangan ajukan pertanyaan "obvious yes"** — aturannya *jangan tanya*, bukan *tanya tanpa tombol* | KEEP (aturan skill) | area-10 §10.4 | 3 | Penting justru karena server akan **menolak** pertanyaan tanpa tombol (area 04 §4.5) — tanpa aturan ini, bot akan menambah tombol pada pertanyaan yang seharusnya tidak ada. |
| SKILL-055 | Operasi destruktif **dieja lengkap di body**, bukan hanya di label tombol | KEEP (aturan skill) | area-10 §10.4 | 3 | Sejalan dengan BUS-043 (restatement konkret untuk wipe-state). |
| TG-124 | **`instructions` MCP dipangkas ke fakta mekanis saja** — bentuk tag `<channel>` + arti tiap atribut, plus satu kalimat "transkrip Anda tidak dibaca user" | PANGKAS (SIMPLIFY) | area-10 §10.4 | 3 | Menghapus kontradiksi lama (instructions menganjurkan `edit_message`, skill melarangnya). B-9 (SELESAI 2026-07-31) sudah menaruh protokol minimisasi giliran di field `instructions` — perlu dicek agar pemangkasan ini tidak menghapusnya. |
| — | **Aturan induk: satu perilaku hidup di SATU rumah** — tidak boleh ada dua sumber yang bisa berselisih | KEEP (aturan) | area-10 §10.4 | ? | **Lintas tahap.** Kembaran K-15 (§14.4) di ranah perilaku, dan K-5 di ranah penegakan. |
| SKILL-057 | **Rule 1 — isolasi via git worktree** tetap jadi perilaku | KEEP → jadi tawaran (§10.A) | area-10 §10.5 | ? | Lihat baris §10.A di bawah. |
| SKILL-058, 059, 060 | **Rule 2 — trailer `Agent: <bot-name>`** sebelum `Co-Authored-By:`; jangan ubah `git config user.name` | KEEP + fix | area-10 §10.5 | ? | Salah satu dari **dua penegak yang benar-benar bekerja** menurut diagnosis §10.0. Detail fix di §10.6. |
| SKILL-061 | **Rule 3 — subagent-first** untuk pekerjaan berat, supaya bot utama tetap bisa mengobrol | KEEP sebagai teks | area-10 §10.5 | ? | Eksplisit "tak bisa dijamin mesin". Rumahnya skill `telegram-conduct`; tahapnya belum ditetapkan. |
| SKILL-062 | **Rule 4 — sisa channel discipline**: pertanyaan dari terminal dijawab di transkrip, jangan mem-ping Telegram; cross-over hanya atas permintaan eksplisit | KEEP sebagai teks | area-10 §10.5 | ? | Bagian mekanisnya sudah masuk §10.2; sisanya teks. Berkaitan dengan fix "sticky `telegramDriven`". |
| SKILL-063 | **Rule 5 — rules-live-here, diperbarui**: aturan kerja baru masuk ke **satu skill** (§10.4), bukan disebar ke CLAUDE.md per-repo | KEEP diperbarui | area-10 §10.5 | ? | Butuh klausa pengecualian dari §10.B, kalau tidak ia bertabrakan dengan Rule 6. |
| SKILL-064, 065 | **Rule 6 — three-copy doctrine**: tinjau lokasinya | Pindah (MERGE) → §10.B | area-10 §10.5 | ? | |
| SCAR-092 | Kontrak hook trailer commit: baca JSON dari stdin · bukan Bash / input invalid / tidak deny → keluar diam-diam · deny → tulis keputusan + alasan yang menyuruh AI menambah trailer lalu coba lagi · self-contained (hanya `node:fs`) | KEEP | area-10 §10.6 | ? | Hook `PreToolUse`, tapi §10 tahap 3 hanya menyebut `PreToolUse` **untuk ack** — trailer commit tidak disebut di tahap mana pun. |
| FUNC-4/5 | **Matcher wajib mencakup semua shell yang dipakai** — sekarang hanya Bash, **PowerShell lolos** | FIX (wajib) | area-10 §10.6 | ? | "Wajib difix, bukan diport". Sama seperti di atas: tidak punya tahap. |
| — | **Empat kelas bypass** yang ditemukan reviewer adversarial fase 2 rewrite lama — jangan diport tanpa memeriksanya | FIX (wajib) | area-10 §10.6 | ? | Dokumen tidak merinci keempatnya di sini — **butuh penggalian sumber lain** sebelum implementasi. Ini utang informasi, bukan cuma utang kode. |
| SCAR-092 | Batas yang diterima sadar: commit lewat editor (tanpa `-m`/heredoc) tak bisa diperiksa pre-tool; command-substitution `$(...)` juga di luar jangkauan | KEEP (batas sadar) | area-10 §10.6 | ? | Perlu ditulis sebagai batasan yang diketahui, bukan dianggap bug nanti. |
| TG-188, 160 | **`name-session` perlu dirancang ulang** — pemicunya hilang (tidak ada lagi nama `idle`), taruhannya naik (B-6 menyembunyikan sesi tak bernama), nudge lama datar | MODIFY | area-10 §10.7 | 6 | Bentuknya di §10.C. Penamaan berubah dari kosmetik jadi penting. |
| SKILL-057 | **Rule 1 jadi TAWARAN di awal**: saat bot mulai bekerja di sebuah repo, ia menawarkan worktree lewat tombol — bukan diam-diam membuatnya, bukan menunggu terlanjur pindah branch | MODIFY (KEEP perilaku) | area-10 §10.A | ? | **Bukan** penolakan mekanis — alasannya ditulis eksplisit (tidak semua pekerjaan butuh worktree; ack & tombol tidak punya kasus sah untuk dilewati, worktree punya). Tidak punya tahap di §10; kandidat rumah: skill `telegram-conduct`. §11.0 mencatat hook `WorktreeCreate`/`WorktreeRemove` sebagai jalur resmi yang relevan. |
| SKILL-057 | Urutan alat worktree: native dulu (`EnterWorktree` / subagent `isolation:"worktree"`), fallback `git worktree add`; cleanup `git worktree remove` setelah merge | KEEP | area-10 §10.A | ? | |
| SKILL-064, 065 | **Three-copy doctrine pindah ke `CLAUDE.md` repo marketplace** | MERGE (pindah rumah) | area-10 §10.B | ? | Aturan khusus repo, bukan aturan umum semua bot. **Ragu apakah ini item pekerjaan rebuild** — ia menyentuh repo lama (`mirza-marketplace`), sementara K-17 melarang menyentuh yang lama. Perlu diperjelas repo mana yang dimaksud. |
| SKILL-063 | **Klausa pengecualian eksplisit pada Rule 5**: aturan yang genuinely repo-specific tinggal di `CLAUDE.md` repo bersangkutan; yang lintas repo tinggal di skill perilaku | ATURAN BARU | area-10 §10.B | ? | Tanpa klausa ini, Rule 5 dan Rule 6 saling bertabrakan. |
| SKILL-064, 065 | Isi doktrin yang **tetap harus terbawa**: workspace clone satu-satunya tempat edit+commit · `marketplaces/**` read-only (`git pull --ff-only`) · `cache/**` jangan pernah diedit · cek `git rev-parse --show-toplevel` sebelum commit · push segera setelah tiap commit rilis · tanpa force-push/history-rewrite di repo multi-agent tanpa konfirmasi + koordinasi · worktree dibuat dari workspace clone | KEEP | area-10 §10.B | ? | Insidennya nyata: ~25 commit hilang saat updater me-reclone (2026-06-07). |
| TG-188, 160 | **`name-session` bentuk baru: mesin menjamin ada nama, AI yang mengarang** — setelah N=3 giliran, bila sesi masih tanpa nama, mesin meminta nama ke AI, menerapkannya, lalu memberi tahu user ("sesi ini saya namai `<nama>` — mau ganti?") | ATURAN BARU | area-10 §10.C | 6 | N sudah **ditetapkan 3 giliran** (spec §11). Jalur apply-nya lewat hook `UserPromptSubmit` → `sessionTitle` (K-18, V-1 terverifikasi) — bukan injeksi `/rename`. **Prasyarat B-6**: tanpa ini, B-6 menyembunyikan sesi kerja nyata yang lupa dinamai. |
| — | Nama tetap **hyphenated, tanpa spasi** (aturan validasi §5.7) | KEEP | area-10 §10.C | 6 | Satu-satunya bagian aturan TG-018 yang pasti masih berlaku setelah K-18. |
| — | **Satu skill perilaku (`telegram-conduct`) dimuat OTOMATIS** saat sesi punya channel Telegram aktif — tidak perlu dipanggil AI | ATURAN BARU (MERGE 4 plugin) | area-10 §10.D | ? | Meleburkan `immediate-reply` · `inline-buttons` · `bot-conduct` (bagian lintas-repo) · `name-session`. **Tidak punya tahap di §10** meski jadi rumah belasan aturan di atas — ini kandidat kuat "terlupa karena tidak ada tahap yang memilikinya". ⚠️ **Konsekuensi ke baris lain:** tujuh aturan gaya yang rumahnya skill ini tetapi saya beri tahap konkret — SKILL-049, gaya ack, SKILL-052, SKILL-055 (obvious-yes), SKILL-055 (operasi destruktif), SKILL-048 (§10.1/§10.3/§10.4, semua tahap 3) dan pola leader fan-out (§7.8, tahap 5) — **mewarisi ketidakpastian tahap ini**; angka 3/5 di baris-baris itu menunjuk kapan penegak mekanisnya dibangun, bukan kapan skill-nya dibangun. Pelajaran yang dicatat: nama skill lama menggambarkan *mekanisme*, bukan *situasi*. |

---

## Area 11 — `/context`, `/version`, statusline bridge

**Non-DROP: 21 · DROP dilewati: 7** (TG-010/011 instalasi bridge dipicu `/context`; `/version` TG-014/015/016 + SCAR-076; `/start` TG-001–009; mekanisme dua-audience TG-006/059; scope per-chat `setMyCommands` TG-060–063; tiga pemicu rekonsiliasi TG-064; gate perintah native TG-002/003)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| — | **Tugas wajib: petakan 30 hook Claude Code ke tiap kewajiban mekanis** | Tugas arsitektur | area-11 §11.0, README "Tugas wajib" #1 | ? | Ditetapkan user sebagai **tugas wajib, bukan catatan opsional**. Kandidat konkret: `PreCompact`/`PostCompact` untuk menyelamatkan designation handoff · `PostToolUse`/`PostToolBatch` untuk penjaga jawaban final · `SessionEnd`/`SubagentStart/Stop` · `WorktreeCreate/Remove` · `PermissionRequest` · `TaskCreated/TaskCompleted` (pemicu handoff!) · `effort.level` di semua hook. **Harus dikerjakan sebelum tahap 3 dan 4**, tapi §10 tidak menaruhnya di tahap mana pun. |
| TG-165–168 | **Statusline bridge merantai**: dipasang di `settings.json`, tangkap data ke snapshot, teruskan stdin yang sama ke perintah statusLine user dengan stdout diwariskan | KEEP | area-11 §11.1 | 4 | **Akar struktural** — satu-satunya sumber data pemakaian context (§11.0 Temuan 1). Memblokir `/context`, `agent_status`, dan kedua ambang handoff. |
| SCAR-084 | Guard **`isOurOwnBridge`** — mencegah bridge menyimpan dirinya sendiri versi lama sebagai chained command (loop); deteksi lintas ekstensi/separator/case | KEEP (wajib) | area-11 §11.1 | 4 | |
| — | **Alarm bila capture tidak berbunyi dalam N menit** | FITUR BARU | area-11 §11.1 | 4 | Kasus nyata: user mengubah `statusLine` belakangan → menimpa bridge → capture mati **diam-diam** dan `/context` membeku di data lama. Prasyarat `doctor` (§12.5 alarm #1). |
| — | Backup `settings.json` **tidak menumpuk tanpa batas** | Perbaikan | area-11 §11.1 | 4 | Sekarang tiap instalasi menulis `settings.json.backup-<ts>` baru. |
| SCAR-017 | `/context` **menunggu data ada**, bukan tidur 5 detik flat | Perbaikan (utang tercatat) | area-11 §11.1, §11.2 | 4 | Utang review #25. |
| — | Bila tidak ada statusLine sebelumnya, **bridge merender tampilan sendiri** | FITUR BARU | area-11 §11.1 | 4 | Menutup kasus "area statusline jadi kosong" di project yang belum punya statusLine. |
| — | Perilaku tetap: input bukan JSON → simpan `payload: null` (jangan crash) · tanpa `CLAUDE_PROJECT_DIR` → skip, exit 0 · tulis atomik tmp+rename | KEEP | area-11 §11.1 | 4 | |
| K-1 | Lokasi snapshot pindah ke store terpusat | MERGE | area-11 §11.1 | 4 | |
| SCAR-041 | Snapshot **hanya sah untuk sesi yang `session_id`-nya cocok** — sesi fresh yang belum aktif masih membawa data sesi LAMA | KEEP (guard wajib) | area-11 §11.1 | 4 | Sama dengan PTY-066 (§6.8) — dua area menyebut guard yang sama. |
| TG-010–013 | `/context`: **pemakaian context** — bar 10 sel + persen + `used/total tokens`; `(unavailable)` bila absen | KEEP | area-11 §11.2 | 4 | ⚠️ Nuansa §11.0 yang wajib ditangani: `used_percentage` dihitung dari **input token saja** (`input + cache_creation + cache_read`), tidak termasuk output — perhitungan manual wajib memakai rumus sama. `current_usage` = `null` sebelum panggilan API pertama **dan lagi setelah `/compact`**. |
| TG-010–013 | `/context`: **rate limit 5 jam & 7 hari** — bar + `reset <sisa>`; seksi di-omit bila absen | KEEP | area-11 §11.2 | 4 | Absen itu **wajar** (hanya untuk pelanggan Pro/Max), tiap window bisa absen sendiri-sendiri — jangan diperlakukan error. |
| TG-010–013 | `/context`: **model, effort, thinking, fast** | KEEP | area-11 §11.2 | 4 | ⚠️ **Remnant dari DROP**: `/effort` sudah dibuang sebagai **perintah** (area-05 §5.5) tapi effort tetap **ditampilkan** di sini. Rawan ikut terbuang bersama perintahnya. §11.0 mencatat `effort.level` tersedia di **semua** hook — bisa dibaca tanpa statusLine. |
| TG-010–013 | `/context`: **biaya, CWD (dua segmen terakhir), nama + id sesi** | KEEP | area-11 §11.2 | 4 | `cost.total_cost_usd` **reset ke $0** saat `/clear` memulai sesi baru — nuansa §11.0. |
| TG-169 | `/context`: `Last update: HH:MM WIB (<relatif> ago)` — Asia/Jakarta dihitung UTC+7 tetap tanpa `Intl` | KEEP | area-11 §11.2 | 4 | |
| TG-170 | Helper format: token `1.5k`/`2M` · sisa reset `2d 3h`/`4h 5m`/`30m`/`just now` · relatif `Xs/Xm/Xh Ym ago`; **baris yang datanya absen di-skip**, bukan ditulis kosong | KEEP | area-11 §11.2 | 4 | |
| — | Mitigasi hilangnya `/version`: **versi komponen yang sedang berjalan hanya terbaca di `/doctor`** | Keputusan (dikonfirmasi 2026-07-27) | area-11 §11.3, area-12 §12.5 | 1 | Risiko yang diterima sadar: setelah `/reload-plugins`, user tidak bisa memastikan dari HP apakah versi terbaru sudah jalan (insiden 2026-05-20 memakan waktu nyata). Versi **tidak** muncul di `/context` maupun di mana pun di Telegram. |
| TG-059 | **`/help` dirender dari SATU registry perintah** yang juga jadi sumber menu slash Telegram — supaya menu dan `/help` tidak bisa berselisih | KEEP | area-11 §11.4 | ? | Bentuk: intro + `/name — ringkasan` per perintah + `/help <nama>` untuk detail; argumen toleran leading slash & case; perintah tak dikenal → pesan jelas. **Tidak punya tahap di §10** — `/help` tidak disebut di tahap mana pun meski ia satu dari enam perintah yang bertahan. Penerapan K-15 di ranah perintah. |
| — | Daftar perintah tersisa: `/new` · `/rename` · `/switch` · `/context` · `/handoff` · `/help` | KEEP (kontrak) | area-11 §11.4 | ? | Tersebar di tahap 4 (`/new`,`/rename`,`/switch`,`/context`), 5 (`/handoff`), dan ? (`/help`). |
| — | Menu slash jadi **satu set tetap yang dipasang sekali saat boot** | SIMPLIFY | area-11 §11.4 | ? | Menggantikan seluruh mesin dua-audience + scope per-chat + tiga pemicu rekonsiliasi. Kandidat tahap 2 (boot poller) tapi tidak disebut di §10. |
| SCAR-059 | Catatan operasional: aplikasi Telegram **meng-cache menu slash** — perubahan sering baru terlihat setelah force-close + buka ulang | KEEP (catatan wajib) | area-11 §11.4, area-14 §14.7 | ? | **Ragu apakah item pekerjaan** — ia kenyataan operasional, bukan kode. Dimasukkan karena §14.7 mewajibkannya "disebut di dokumentasi rilis, bukan jadi kejutan" — itu deliverable. |

---

## Area 12 — Penyimpanan & observability

**Non-DROP: 30 · DROP dilewati: 1** (`logEdit` TG-137, mati bersama `edit_message`)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| TG-133 | Skema `messages(id, ts, chat_id, message_id, source, user_id, user_name, text, attachments, reply_to, metadata)` + 3 indeks (chat+ts, chat+message_id, source+ts), `journal_mode=WAL`, `synchronous=NORMAL` | KEEP | area-12 §12.1 | 1 | Pass 01–04 menemukan kolom `message_id`, `metadata`, dan `reply_to` **ada di skema tapi selalu NULL** — skemanya ada, pengisiannya tidak. |
| K-3 | **Satu database untuk seluruh fleet + kolom `bot`**; default baca = percakapan sendiri, mengintip bot lain lewat tool eksplisit | MODIFY | area-12 §12.1 | 1 | Prasyarat B-1 `peek_conversation`. |
| TG-135 | `quote_text` / `quote_is_manual` di-merge ke kolom `metadata` — tanpa migrasi skema | KEEP | area-12 §12.1 | 2 | Terkait **B-10 (quote-reply)** yang belum punya tahap — B-10 dicatat "belum didesain". Pass 01–04 mengonfirmasi tidak ada penanganan `reply_to_message` sama sekali di sistem baru. |
| TG-138 | `getMessage` mengambil row **terbaru** untuk pasangan `(chat_id, message_id)`; `attachments`/`metadata` dikembalikan sudah ter-parse (gagal parse → field null, bukan error) | KEEP | area-12 §12.1 | 2 | |
| TG-139 | Fallback album: item ke-2..N hanya tersimpan di `metadata.message_ids` baris pertama → lookup `LIKE` + **verifikasi parse** untuk menghindari false positive substring | KEEP | area-12 §12.1 | 2 | Terhalang gap struktural `message_id` (pass 01–04). |
| TG-136 | `source` terbatas `assistant` / `system` untuk pesan keluar | KEEP | area-12 §12.1 | 2 | |
| TG-150; LOSS-4 | **Fix `messagesStore.append(...)` yang tidak ada di interface** — banner ganti-sesi terkirim tapi tak pernah tercatat | FIX (wajib) | area-12 §12.1, area-05 §5.8 | 4 | Disebut dua kali di dua area — kelas bug yang dicegah `tsc --noEmit` di CI. Pencegahnya (CI type-check) sendiri adalah item pekerjaan implisit. |
| SCAR-097 | Retensi `messages.db`: **simpan selamanya**, tidak ada penghapusan otomatis | KEEP (kebijakan) | area-12 §12.2 | 1 | Konsisten K-8 + nilai B-1/B-2. Dasar: teks percakapan sangat kecil dibanding media. |
| — | Perintah **pemadatan manual (`VACUUM`)** | FITUR BARU | area-12 §12.2 | ? | Tidak disebut di tahap mana pun. Kandidat: bagian dari `doctor` (tahap 1) atau utilitas CLI terpisah. |
| — | **Pelaporan ukuran database di `doctor`** | FITUR BARU | area-12 §12.2, §12.5 | 1 | Supaya user tahu kapan perlu memadatkan. |
| — | Retensi `inbox/`: file lebih tua dari **90 hari** dihapus, **kecuali** yang masih dirujuk baris pesan yang ada | FITUR BARU (kebijakan baru) | area-12 §12.3 | ? | N sudah **ditetapkan 90 hari** (spec §11). Diperlukan karena area 02 §2.2 membuat **semua** lampiran diunduh otomatis. **Tidak punya tahap** — media ada di tahap 2, tapi retensi lebih mirip pekerjaan tahap 6/housekeeping. |
| — | **Baris pesannya tetap ada** — user tetap tahu "ada foto di sini", hanya filenya yang hilang | KEEP (aturan) | area-12 §12.3 | ? | Ikut baris di atas. |
| — | Bila bot menemukan rujukan ke file yang sudah dihapus, ia **mengatakannya apa adanya** ("ada lampiran di sini tapi filenya sudah kedaluwarsa"), bukan diam atau error | ATURAN BARU | area-12 §12.3 | ? | Interaksi dengan B-2 yang di luar lingkup v1 — tapi aturannya berlaku juga untuk `peek_conversation` (B-1, tahap 6). |
| SCAR-060 | **Indeks pencarian teks penuh (FTS5)** di `messages.db` | FITUR BARU (prasyarat) | area-12 §12.4 | 6 (⚠️ lihat catatan) | **Akar struktural**: tanpa ini B-1 dan B-2 tidak punya cara menemukan apa pun. ⚠️ **Konflik tahap**: §10 menaruh "pencarian" di tahap 6, tapi §12.4 menulis "menambahkan indeks belakangan berarti mengindeks ulang seluruh riwayat — makanya dimasukkan sejak awal". Skema tahap 1 sebaiknya sudah membawa FTS meski tool-nya tahap 6. |
| — | **Tool pencarian** yang diekspos ke AI | FITUR BARU | area-12 §12.4 | 6 | Konteks: Bot API Telegram **tidak punya riwayat atau pencarian sama sekali** — `messages.db` adalah satu-satunya ingatan. |
| — | **`doctor` — perintah pemeriksaan kapan pun** | FITUR BARU | area-12 §12.5 | 1 | Belum ada sama sekali di sistem lama. Disebut di tahap 1 §10 ("`doctor` menjawab"), tapi isinya diisi tahap 4–5. |
| — | **Sistem memberi tahu user SENDIRI di Telegram** saat sesuatu berhenti bekerja (bukan hanya `/doctor` on-demand) | FITUR BARU (⚠️ penting) | area-12 §12.5 | 1 | Alasan: user AFK dan tidak melihat transkrip — "**alarm yang hanya tercatat di log adalah alarm yang tidak pernah terdengar**". §14.1 menambahkan: alarmnya **tidak boleh bergantung pada program yang sama** (`fleetd`) yang mungkin mati. |
| — | Alarm #1: **capture statusline mati** | FITUR BARU | area-12 §12.5, §11.1 | 4 | |
| — | Alarm #2: **hook `SessionStart` tidak berbunyi** → deteksi sesi baru mati total | FITUR BARU | area-12 §12.5, §6.3 | 4 | Ini **syarat penerimaan** §6.3, bukan tambahan. |
| — | Alarm #3: **injeksi tak pernah mendarat** (`{queued:true}` ≠ selesai) | FITUR BARU | area-12 §12.5, §6.7 | 4 | Bergantung ack dua tingkat SCAR-071 + batas waktu per kelas injeksi (spec §5.5). |
| — | Alarm #4: **handoff menggantung tanpa ACK melewati batas waktu** | FITUR BARU | area-12 §12.5, §8.3 | 5 | |
| — | Alarm #5: **payload rusak dikarantina** | FITUR BARU | area-12 §12.5, §6.7, §14.6 | 4 | |
| — | Alarm #6: **bot diam / tidak bisa dihubungi** | FITUR BARU | area-12 §12.5, §6.9 | 1 | Satu-satunya alarm yang bisa dibangun di tahap 1 (liveness sudah ada di sana). Diperberat oleh K-14: kalau program pemegang token mati, **semua bot bisu sekaligus**. |
| — | Field ringkasan `doctor.ok` **wajib benar-benar dihitung dari komponennya** | ATURAN (anti-pattern) | area-12 §12.5 | 1 | Pelajaran dari desain lama: `doctor.ok` **hardcoded `true`** — laporan kesehatan yang selalu berkata sehat. |
| — | `doctor` juga melaporkan **versi komponen yang sedang berjalan** | FITUR BARU | area-12 §12.5, §11.3 | 1 | Satu-satunya tempat versi terbaca dari Telegram setelah `/version` di-DROP. |
| TG-140 | Mode degradasi: store mati → semua pencatatan/pembacaan jadi no-op dengan warning, **pipeline pesan tetap berjalan penuh** | KEEP prinsip | area-12 §12.6 | 2 | "Log best-effort tidak boleh membunuh pengiriman. Bot yang tidak bisa mencatat harus tetap bisa membalas." Env var `TELEGRAM_DISABLE_MESSAGES_STORE` jadi konfigurasi biasa (K-1). |
| — | Kondisi "store mati" **wajib terlihat di `doctor` dan diberitahukan**, bukan hanya warning di stderr | MODIFY | area-12 §12.6 | 2 | Alarm ketujuh di luar enam yang ditabelkan §12.5 — mudah terlewat karena letaknya di seksi lain. |
| TG-134, 142, 144; SCAR-024 | `messages.db` dan file token **di-chmod 0600** di POSIX; di Windows `chmodSync` no-op senyap → pancarkan **satu warning saat boot** alih-alih pura-pura berhasil | KEEP | area-12 §12.7 | 1 | Pass 01–04 menemukan tidak ada `chmod` sama sekali di `config.ts`/`paths.ts` — dan `config.json` sekarang menyimpan token **seluruh fleet**, bukan satu bot. |
| SCAR-024 | **Keputusan terbuka: strategi perlindungan file di Windows (ACL)** | Belum diputuskan | area-12 §12.7 | ? | Diperingan K-1 (file keluar dari repo kerja, tidak bisa ter-commit) tapi **tidak menggantikan izin file**. Keputusan sadar yang diminta audit belum diambil — bukan cuma belum dikode. |
| PTY-050 | **Rotasi `wrapper.log` berbasis ukuran** (mis. simpan 2 file terakhir) | Keputusan pelaksana | area-12 §12.8 | ? | Dokumen sendiri menulis "**silakan dibantah**" — jadi ini keputusan yang belum final. Log diagnostik, bukan aset; beda perlakuan dengan percakapan. |

---

## Area 13 — Skill konten (teach-me, daily-report, knowledge-vault, playbook)

**Non-DROP: 3 · DROP dilewati: 4** (`teach-me` SKILL-066–068; `daily-report` SKILL-069–077 + SCAR-094; `knowledge-vault` SKILL-078–082; playbook)

Seluruh isi area ini DROP dari v1 (K-13). Yang tersisa adalah **klarifikasi yang mengikat seluruh dokumen** dan **konsekuensi ke area 08**.

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| K-17 / K-13 | **Klarifikasi arti "DROP" untuk SELURUH dokumen audit**: DROP = tidak diikutsertakan di sistem baru; BUKAN dihapus, BUKAN diubah, BUKAN dimigrasi. `mirza-marketplace` + 11 plugin-nya tetap berjalan apa adanya | Keputusan mengikat | area-13 §13.0 | ? | **Lintas tahap / aturan proses.** Dimasukkan meski bukan fitur, karena salah membacanya akan menghasilkan pekerjaan destruktif di repo lama. Bertegangan dengan §10.B yang menyuruh memindahkan three-copy doctrine ke `CLAUDE.md` repo marketplace — perlu diperjelas. |
| — | Baris **"Referensi playbook"** di template handoff §8.5 berubah dari **wajib** jadi **kondisional** ("bila ada"); ketiadaan playbook bukan cacat handoff | MODIFY (konsekuensi wajib) | area-13 §13.4 | 5 | Audit menandainya "⚠️ Konsekuensi ke area 08 yang WAJIB disesuaikan". Kalau §8.5 dibaca sendirian, implementasi akan salah mewajibkan referensi ke file yang tidak akan pernah ada di v1. |
| SKILL-017 | Seksi **Anti-Patterns / Lessons CARRY FORWARD tetap wajib** di template handoff | KEEP (dipertegas) | area-13 §13.4 | 5 | Tetap wajib **justru karena** playbook belum ada — satu-satunya jalur pelajaran berpindah bersama estafet di v1. |

---

## Area 14 — Ketahanan proses & sisa scar tissue

**Non-DROP: 20 · DROP dilewati: 9** (enam tambalan zombie/409 di §14.1: `bot.pid` + takeover, hapus pid hanya bila milik sendiri, orphan watchdog 5 detik, force-exit 2 detik, retry 409 batas 8 percobaan, dan penanganan PID-reuse versi lama; poll approval pairing 5 s + watcher `access.json` §14.3; aturan prompt-injection pairing §14.5; toleransi format legacy §14.6)

| ID | Fitur | Verdict | Sumber | Tahap | Catatan |
|---|---|---|---|---|---|
| K-14 | **Satu program terpisah, terus hidup**, memegang 6 penanya untuk 6 token, **di luar** Claude Code | KEPUTUSAN STRUKTURAL | area-14 §14.1 | 1 | Menghapus enam tambalan zombie/409 **secara struktural**, bukan menambalnya. Bonus: bot tetap menerima pesan meski sesi CC restart. Jumlah token tidak berubah (6 bot = 6 token = 6 penanya). |
| — | **Pengawas yang menyalakan ulang** program itu bila mati | FITUR BARU (harga K-14) | area-14 §14.1 | 1 | Audit menyebutnya "komponen yang sekarang tidak ada" — hari ini plugin terpasang → semuanya jalan sendiri. Rawan terlupa karena ia harga, bukan fitur yang diminta. |
| — | **Alarm `doctor` tidak boleh bergantung pada program yang sama** (`fleetd`) | ATURAN (wajib) | area-14 §14.1, §12.5 | 1 | Konsekuensi: kalau `fleetd` mati, **semua bot bisu sekaligus** — dan alarmnya juga mati kalau ia hidup di dalam `fleetd`. Ini kontradiksi desain yang belum dipecahkan di dokumen mana pun. |
| SCAR-015; TG-154 | **SEMUA error polling di-retry** dengan backoff `min(1000×attempt, 15000)`; attempt di-reset saat polling sukses | KEEP (wajib) | area-14 §14.2 | 2 | ⚠️ **Remnant dari DROP**: retry 409 dengan batas 8 percobaan jadi tidak relevan setelah K-14, **tapi retry untuk error lain tetap wajib** — audit menulis eksplisit "jangan buang keduanya sekaligus". Sejarahnya: dulu hanya 409 yang di-retry → satu `ETIMEDOUT` membuat bot **tuli permanen** sementara prosesnya tetap hidup. |
| SCAR-061; TG-155 | **`bot.catch` wajib dipasang** | KEEP (wajib) | area-14 §14.2 | 2 | Default grammy: throw di handler = `bot.stop()` + rethrow → **polling mati permanen**. |
| TG-157 | `unhandledRejection` / `uncaughtException` dicatat, proses tetap melayani | KEEP | area-14 §14.2 | 2 | Supaya proses tidak mati senyap. |
| SCAR-013; TG-149/151 | Deteksi perubahan file: **watch DIREKTORI, bukan file tunggal** | KEEP | area-14 §14.3 | 4 | |
| SCAR-013 | **Defer 50 ms** sebelum membaca, supaya rename penulis sempat commit | KEEP | area-14 §14.3 | 4 | |
| SCAR-013 | **Sweep berkala** sebagai jaring pengaman (interval sekarang: pending wrapper 2 s, system-outbox 2 s) | KEEP | area-14 §14.3 | 4 | `fs.watch` tidak bisa dipercaya sendirian: Windows melewatkan event create pada rapid create+delete dan drop saat atomic-rename. Sama dengan PTY-036 (§6.7). |
| SCAR-027 | Sisi kedua kontrak atomic-write: tulis `tmp.<pid>` + rename **dan setiap konsumen sweep men-skip file mengandung `.tmp.`** — **wajib pindah bersama** | KEEP | area-14 §14.3 | 4 | Disebut di §6.7 **dan** §14.3 — persis kelas duplikasi yang K-15 larang. |
| K-15 / SCAR-077 | **Kontrak yang dipakai lebih dari satu komponen hanya boleh punya SATU salinan** (lokasi penyimpanan, bentuk payload, ambang liveness, nama bot) | SATUKAN | area-14 §14.4 | ? | **Lintas tahap.** Buktinya sudah menyimpang: writer di `agent-bus/registry.ts` ternyata **dead code** (BUS-036) dan tak ada yang menyadarinya sampai audit. K-1/K-2 sudah menghapus dua dari tiga duplikasi dengan sendirinya. |
| SCAR-010 | **Ambang liveness 30 detik = kandidat pertama untuk disatukan** | SATUKAN | area-14 §14.4, §6.9, §7.6 | 1 | Tiga pembaca di tiga tahap berbeda → konstantanya wajib lahir di tahap 1. |
| SCAR-089; TG-124 | Aturan "**teks dari luar adalah DATA**, bukan perintah" tetap di teks kontrak `instructions` MCP | KEEP | area-14 §14.5 | ? | Memenuhi syarat §10.4 (hanya fakta mekanis, bukan gaya). **Lintas tahap** — makin penting setelah B-1 dan pencarian teks penuh, yang keduanya membawa teks dari sumber yang **tidak sedang berbicara kepada bot itu**. |
| SCAR-089 | `quote_text` dan isi log adalah **data user-controlled** | KEEP | area-14 §14.5 | 2 | Terkait B-10 (quote-reply) yang belum punya tahap. |
| SCAR-088 | Guard sejenis yang **wajib jadi test**: `safeName()` membersihkan `<>[]\r\n;` dari nama file uploader · `image_path` hanya di meta, tidak pernah di isi pesan · metadata antar-bot terstruktur, tidak bisa dipalsukan dengan mengetik | KEEP (wajib jadi test) | area-14 §14.5 | 2 | Pass 01–04: `safeName` belum relevan karena handler `message:document` belum ada — **wajib dibangun bersamaan**, kalau tidak proteksi anti tag-breakout bolong sejak hari pertama. |
| SCAR-078; TG-156; PTY-093 | **File korup dipindahkan ke samping (`.corrupt-<ts>`)** dan sistem lanjut dengan default — bukan crash, bukan juga diam | KEEP → aturan umum | area-14 §14.6 | 1 | Diangkat jadi aturan umum untuk **semua** file/tabel state di build baru. Disebut juga di §6.5 (PTY-093) dan area-01 (TG-156). |
| PTY-037 | **Payload rusak dikarantina (`.rejected-<ts>`)** dengan peringatan yang terlihat di `doctor` | KEEP → aturan umum | area-14 §14.6 | 4 | Perbaikan atas drop-diam-diam. Prasyarat `doctor`. |
| SCAR-042 | Kenyataan: `/reload-plugins` **memutus semua koneksi MCP** di sesi berjalan (perlu `/mcp` reconnect per bot); skill baru tidak ter-load ke sesi berjalan | KEEP (catat) | area-14 §14.7 | ? | **Ragu apakah item pekerjaan** — ia kenyataan, bukan kode. Deliverable-nya: disebut di dokumentasi rilis. Diperingan §14.1 + K-6: penanya token tidak lagi terpengaruh sama sekali. |
| SCAR-018 | **Boot-settle 5 detik** setelah spawn sebelum keystroke pertama aman — **verifikasi, jangan asumsikan** apakah masih perlu | KEEP bersyarat | area-14 §14.7 | 4 | Setelah K-7 (tidak ada lagi klaim nama `idle` lewat keystroke) kemungkinan **tidak ada lagi injeksi saat startup** — tapi audit menolak mengasumsikannya. Item verifikasi, bukan item kode. |
| K-16 | **Kebijakan bahasa**: source/komentar/README/error teknis = Inggris · pesan **AI** ke user = ikut bahasa user · pesan **MESIN** ke user (validasi nama sesi, alarm `doctor`, banner ganti-sesi) = **Indonesia** | KEPUTUSAN BARU | area-14 §14.8 | ? | **Lintas tahap** — menyentuh setiap string di setiap komponen. Kondisi sekarang: campur tanpa aturan. Beberapa contoh teks di dokumen audit sendiri masih Inggris (mis. TG-025, TG-020) — perlu diterjemahkan saat implementasi, bukan disalin apa adanya. |

---

## Catatan penutup

1. **Angka yang dulu "belum ditetapkan" sudah ditetapkan semuanya** (spec §11, 2026-07-29): ambang sesi remeh 8.000 token · ambang pengirim handoff 50% · N giliran penamaan 3 · retensi `inbox/` 90 hari · batas waktu injeksi (`/clear` 10m, `/resume` 5m, `/compact` 10m, plugin command 30s). README audit §"Angka yang belum ditetapkan" **sudah usang** — jangan dipakai sebagai daftar pekerjaan.
2. **B-9 SELESAI** (2026-07-31, terverifikasi hidup) — tidak diekstrak sebagai item pekerjaan. **B-10 (quote-reply) belum didesain dan belum punya tahap** — ia menyentuh area 02/03 (di luar cakupan file ini) tapi bergantung pada gap `message_id` yang ditemukan pass 01–04.
3. **Item DEFER bukan DROP** — B-2, B-3, B-7 tetap tercatat (B-7 punya baris di area 07). Spec §13 menaruhnya di luar lingkup v1, jadi tidak punya tahap 1–6.
