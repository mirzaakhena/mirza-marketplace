# Celah Migrasi — Apa yang Masih Menghalangi Satu Bot Harian Pindah

**Tanggal:** 2026-08-02 · **Penyusun:** bot-03 (estafet dari bot-02)
**Pertanyaan yang dijawab:** *bukan* "tahap berapa", melainkan **"apa yang
dipakai user setiap hari dari bot lama yang belum bisa dilakukan sistem baru?"*

**Ini dokumen ukuran, bukan rencana.** Tidak ada satu baris kode pun diubah, dan
urutan pengerjaan sengaja tidak diputuskan di sini — itu hak user.

---

## 1. Cara mengukurnya

Frekuensi di bawah **diukur dari mesin ini**, bukan ditebak. Jendela ukur:
**30 hari terakhir** (± 2026-07-03 … 2026-08-02), **enam bot harian sekaligus**
(`bot-01` … `bot-06`), bukan cuma satu — satu bot terlalu sedikit datanya untuk
membedakan "sering" dari "kebetulan".

| Meteran | Apa yang terbaca | Volume 30 hari |
|---|---|---|
| `messages.db` tiap bot (dibuka **readonly**) | pesan masuk/keluar, lampiran, kutipan, edit | 4.633 baris |
| `pty-controller/wrapper.log` tiap bot | injeksi slash, spawn/resume sesi, antar-bot, system-outbox | ±1.100 event |
| `session-names.json` tiap bot | sesi dinamai/di-rename | 82 sesi |

Angka `/hari` selalu berarti **seluruh armada enam bot**, bukan per bot.

### Satu blind spot yang ditemukan saat mengukur — dan kenapa ini penting

Meteran pertama yang saya pakai (`messages.db`) **berbohong dengan meyakinkan**.
Hasilnya: `/handoff` 27×, `/goal` 5×, `/new` 1×, `/switch` **0×**.

Bacaan itu salah. `server.ts:1882` memanggil `tryRouteMetaCommand()` **sebelum**
`logInbound()` di baris 1924 — jadi `/new`, `/switch`, `/delete`, `/effort`,
`/context`, `/version`, `/help`, `/start` **dikonsumsi sebelum sempat dicatat**.
Nol di tabel itu bukan "tidak dipakai", melainkan "tidak pernah lewat sini".

Meteran pengganti (`wrapper.log`) memberi angka sebenarnya: `/switch` **139×
sepanjang hidup**, `/rename` **148× dalam 30 hari terakhir saja**.

Ini persis bentuk yang diperingatkan handoff bot-02: **sesuatu yang tampak jalan
padahal tidak.** Kalau audit ini berhenti di meteran pertama, `/switch` akan
masuk kolom "tidak dipakai" dan dicoret dari daftar bangun.

**Yang tetap tidak terukur** (jujur, bukan nol): `/context`, `/delete`,
`/effort`, `/version`, `/help` — tidak lewat `messages.db` **maupun**
`wrapper.log`. Dan **tap tombol inline** tidak tercatat di mana pun di sistem
lama. Barisnya di tabel ditandai `—`.

---

## 2. TABEL UTAMA — yang BELUM ada di sistem baru, urut frekuensi pakai

| # | Yang hilang | Frekuensi (30 hari) | Kalau tidak ada, apa yang terjadi | Bukti |
|---|---|---|---|---|
| 1 | **Indikator "typing…"** | **36,7/hari** (tiap pesan masuk) | Kosmetik. Kamu tidak tahu bot sudah menerima sampai balasannya jadi | 1.101 pesan user; `sendChatAction` 0 hit di kode baru |
| 2 | **Nama sesi sisi Telegram + `/rename`** | **4,9/hari** injeksi `/rename`; 15,1/hari tulis registry | Sesi kehilangan nama di Telegram. Hook `SessionStart` baru hanya menulis **id**, tidak nama — jadi konteks "Current Telegram session name" hilang, dan picker `/switch` tak punya label | `wrapper.log` 148× `/rename`; `session-start.ts:142` cuma tulis `${bot}.id` |
| 3 | **Chunking balasan panjang** | **10,6/hari** (10,0% dari 3.183 panggilan `reply`) | **Blocking.** Telegram menolak >4096 char; konverter markdown butuh margin setengah-limit. Maksimum terukur: **7 potong dalam satu balasan** | Kode baru: `4096` hanya muncul di komentar `engine.ts:414` sebagai kasus gagal |
| 4 | **system-outbox → Telegram** (push tanpa pesan masuk) ⚠️ **baris ini DIKOREKSI — baca §8** | **7,2/hari** | Notifikasi "sesi berganti", pengumuman handoff, reminder terjadwal — semua hilang. Wrapper masih menulis berkasnya; **tidak ada lagi yang membacanya** | 215 event `wrote system-outbox`; 107 baris `source='system'` di db |
| 5 | **Pengantaran antar-bot lewat PTY** (agent-bus) | **5,0/hari** | **Blocking untuk handoff.** `agent_send` menulis ke folder `pending/` wrapper. Tanpa wrapper, pesan antar-bot tidak sampai | 150 event `inter-agent message` = 150 `injecting prompt` |
| 6 | **Wrapper PTY: spawn + `--resume`** | 4,6/hari spawn · **1,8/hari resume** | **Naik jadi kritis sejak penyatuan engine:** umur sesi = umur bot. Sesi mati → bot bisu, dan tidak ada yang menyalakan ulang | `grep -E "pty\|wrapper\|resume"` di `mirza-bots`: **0 hit sejati** (12 hit semuanya kata "empty") |
| 7 | **Kirim lampiran keluar** (`files`) | **2,7/hari** (48 dokumen, 32 foto) | Bot tidak bisa mengirim screenshot, PDF, atau laporan | `engine.ts:47` — `reply(text, buttons?, replyTo?)`, tidak ada parameter berkas |
| 8 | **`/new` + `/clear` dari Telegram** | **2,4/hari** sesi baru | Ganti topik harus dari terminal, bukan dari HP | 72 event `fresh session detected`; 73 injeksi `/clear` |
| 9 | **Skema tombol berbeda** (`{label, callback_id}` → `{text, data}`) | ~15,2/hari (proksi: balasan berakhir "?") | Bukan kapabilitas hilang — **adaptasi**. Skill `inline-buttons` mengajarkan bentuk lama di 20+ tempat; skill `goal` juga | 455 balasan bertanya; `grep callback_id` di SKILL.md: 21 hit |
| 10 | **`edit_message`** | **0,5/hari** | Progres panjang jadi banjir pesan baru, bukan satu pesan yang diperbarui | 15 baris ber-`metadata.edited_of` |
| 11 | **`/handoff` utuh ujung-ke-ujung** | **0,36/hari** (27× sepanjang hidup, **dipakai keenam bot**) | Skill-nya jalan; **prasyaratnya** (#5, #6, #2) yang tidak ada | 27 baris `/handoff` di db; 29 dari 82 nama sesi berawalan `done-` |
| 12 | **`/switch`** (pindah/pulihkan sesi dari Telegram) | **0,2/hari** (139× sepanjang hidup) | Jalan keluar saat sesi nyangkut. Jarang — tapi dipakai justru **saat keadaan sudah buruk** | 139 event `switch requested` |
| 13 | **`/goal`** | 5× sepanjang hidup | Fitur khusus, jarang | 5 baris di db |
| 14 | **`/context`** (jembatan statusline: context window, rate limit, biaya, model) | **—** tak terukur; **terpasang di 6/6 bot** | Tidak ada cara melihat sisa context/rate-limit dari HP | `last-status.json` keenam bot diperbarui hari ini |
| 15 | **`/delete` + arsip sesi** | **—** tak terukur | Daftar sesi tumbuh tanpa batas (44 sesi di `bot-01`) | blind spot §1 |
| 16 | **`/effort`** | **—** tak terukur | Level effort hanya bisa diubah dari terminal | blind spot §1 |
| 17 | **`/version`, `/help`, `/start` + alur pairing** | **—** tak terukur | Diagnostik & onboarding. Kamu satu-satunya pengguna dan sudah paired | blind spot §1 |
| 18 | **`get_message_by_id`** | **—** tak terukur | Ada di sistem lama (`server.ts:660`), tidak ada di baru. Sudah terjadwal di 2.5-GUARD | — |
| 19 | **`react`** (reaksi ack otomatis) | **0/hari** | Tidak ada bot yang mengaktifkannya | `ackReaction` absen di keenam `access.json` |
| 20 | **Kebijakan akses per-bot: grup, `dmPolicy`, pairing** | **0/hari** | Sistem baru punya `allowFrom` armada-wide saja | Keenam `access.json`: `groups: {}`, `pending: {}`, satu id yang sama |

---

## 3. Yang SUDAH ada di sistem baru (tidak perlu dibangun lagi)

Diperiksa langsung ke kode `mirza-bots/cc-plugin`, bukan disalin dari dokumen:

| Kapabilitas | Frekuensi harian | Di mana |
|---|---|---|
| Terima teks, allowlist, simpan ke db terpusat | 36,7/hari | `telegram/poller.ts`, `allowlist.ts` |
| Konversi markdown otomatis (tanpa flag) | ~15,2/hari (12,9% balasan) | `markdown.ts` |
| Quote-reply **masuk** (`quote_text`, `quote_is_manual`) | 6,3/hari | `telegram/quote.ts` |
| Balasan keluar tersimpan + `reply_to` (quote **keluar**) | 105/hari | `messages.ts`, terbukti live |
| Tombol inline + keyboard dicopot setelah ditap | — | `engine.ts:365` |
| Terima foto/dokumen, unduh otomatis, album | 2,3/hari (album 0,4/hari) | `telegram/media.ts`, `album-buffer.ts` |
| Riwayat + pencarian FTS5 lintas bot | — | `read_history`, `search_history` |
| Zona waktu / orientasi waktu lokal | tiap pesan | `time.ts` |
| Id sesi per-push lewat hook `SessionStart` | tiap `/clear` | `hooks/session-start.ts` |
| Stop reply-guard | tiap giliran | `hooks/reply-guard.ts` |
| `doctor` | sesuai kebutuhan | `bin/doctor.ts` |
| Konfigurasi banyak bot | — | `config.ts` — `bots` sudah `Record<string, BotConfig>`; **hanya `bot-uji` terdaftar** |

**Satu tempat sistem baru lebih unggul:** tap tombol **tersimpan satu baris** di
sistem baru; di sistem lama tap tidak tercatat sama sekali (itu sebabnya baris #9
di tabel utama tidak punya angka).

## 4. Yang TIDAK RELEVAN lagi

| Hal | Alasan |
|---|---|
| Daemon `fleetd`, socket, antrean offline | Dibubarkan 2026-08-02 (merge `f4f0f77`) |
| Grup Telegram, `dmPolicy`, alur pairing 6-karakter | Nol pemakaian di keenam bot selama hidupnya |
| `react` / reaksi ack | Tidak diaktifkan di satu bot pun |
| Salinan setelan per-folder-bot | Justru masalah pokok yang membuat sistem baru dibangun |

---

## 5. Hipotesis bot-02 vs hasil ukur

Handoff menulis dugaannya dan meminta diperlakukan sebagai hipotesis. Hasilnya:

| Dugaan bot-02 | Hasil ukur | Nilai |
|---|---|---|
| Manajemen sesi (`/new`, `/switch`, `/rename`) | #2, #8, #12 — `/rename` **4,9/hari** | ✅ **Benar, dan diremehkan.** `/rename` jauh lebih sering dari dugaan |
| Wrapper PTY + resume | #6 — 4,6 spawn + 1,8 resume/hari | ✅ Benar |
| Handoff antar-bot | #5 + #11 — 5,0/hari pengantaran | ✅ Benar |
| Goal | #13 — 5× sepanjang hidup | ⚠️ **Terlalu tinggi.** Paling jarang di seluruh daftar |
| Daily-report | Tidak muncul sama sekali di 4.633 baris | ❌ **Salah.** Tidak dipakai lewat Telegram |
| *(tidak disebut)* | **Chunking 10,6/hari** | ❌ **Terlewat** — dan ini yang paling sering **memblokir**, bukan sekadar merepotkan |
| *(tidak disebut)* | **system-outbox 7,2/hari** | ❌ Terlewat |
| *(tidak disebut)* | **Kirim lampiran keluar 2,7/hari** | ❌ Terlewat |

Empat dari delapan baris teratas tidak ada dalam dugaan. Itu argumen paling
konkret untuk aturan yang dibawa handoff ini: **ukur dulu sebelum membangun.**

---

## 6. Urutan yang dipilih user (2026-08-02, lewat inline button)

**Pilihan: "yang termurah dulu" — tiga celah yang seluruhnya hidup di dalam
engine, tanpa menyentuh wrapper PTY sama sekali.**

| Urutan | Celah | Nomor di tabel | Frekuensi |
|---|---|---|---|
| 1 | Chunking balasan panjang | #3 | 10,6/hari — **satu-satunya yang memblokir** di paket ini |
| 2 | Indikator typing | #1 | 36,7/hari — paling sering, paling murah |
| 3 | Kirim lampiran keluar (`files`) | #7 | 2,7/hari |

**Kenapa pilihan ini koheren, bukan sekadar "yang gampang":** ketiganya berada di
dalam `cc-plugin/src/engine/` dan tidak bergantung pada satu pun dari rantai
#5 → #6 → #11 (agent-bus → wrapper PTY → handoff), yang merupakan potongan
terbesar dan paling berisiko dari seluruh daftar. Artinya paket ini bisa
selesai, diuji live, dan dirilis **tanpa** memutuskan apa pun soal masa depan
wrapper — keputusan itu tetap terbuka dan tidak jadi lebih mahal karena ditunda.

**Yang secara sadar TIDAK dipilih sekarang:** #2 (nama sesi), #4 (system-outbox),
#5, #6, #8, #12 — semuanya membutuhkan wrapper PTY atau state sisi Telegram.

## 7. Catatan untuk yang membaca sesudah ini

- **Frekuensi ≠ urutan bangun.** Baris #1 (typing) paling sering tapi kosmetik;
  #3, #5, #6 lebih jarang tapi **memblokir**. Kolom "kalau tidak ada" ada supaya
  urutan bisa dipilih dari dampak, bukan dari angka saja.
- **#5, #6, #11 satu rantai.** Handoff butuh agent-bus, agent-bus butuh wrapper.
  Membangun satu tanpa dua lainnya tidak menghasilkan apa pun yang bisa dipakai.
- **#2 lebih besar dari kelihatannya.** 29 dari 82 nama sesi (35%) berawalan
  `done-` — itu self-reset otomatis dari alur handoff, bukan ketikan manual.
- **Semua angka bisa dihitung ulang.** Skripnya ada di scratchpad sesi ini;
  sumbernya (`messages.db`, `wrapper.log`, `session-names.json`) tidak diubah —
  db dibuka `readonly: true` sesuai aturan "jangan menyapa bot produksi".

---

## 8. KOREKSI baris #4 — diukur ulang 2026-08-03 oleh bot-02

**Ditambahkan, bukan menimpa.** Teks asli baris #4 dibiarkan utuh di tabel
supaya alasan koreksinya bisa ditelusuri; yang berubah cuma penanda ⚠️ yang
menunjuk ke sini.

Sesi ini ditugasi **mengukur apakah #4 menggantung pada #6 sebelum menulis
kode**. Hasilnya: menggantung — tapi bukan seluruhnya, dan bukan dengan alasan
yang tertulis di baris aslinya.

### 8.1 Apa yang keliru

Baris #4 menyandingkan dua angka di kolom bukti: *"215 event `wrote
system-outbox`; 107 baris `source='system'` di db"*. Diletakkan berdampingan,
keduanya terbaca seolah yang satu menghasilkan yang lain — wrapper menulis
berkas, plugin membacanya, barisnya mendarat di db.

**Terukur: keduanya sama sekali tidak berhubungan.**

| Yang diukur | Angka | Sumber |
|---|---|---|
| Event `wrote system-outbox` bertipe `session-change` | **692 dari 692** (seumur hidup, keenam bot) | `wrapper.log` ×6 |
| Idem, jendela 30 hari | **172** (audit menulis 215; jendela sesi ini bergeser sehari) | `wrapper.log` ×6 |
| Baris `source='system'` di db yang berasal dari system-outbox | **0 dari 317** | `messages.db` ×6, readonly |
| Baris di seluruh armada yang punya `metadata.kind` | **0 dari 10.822** | `messages.db` ×6, readonly |

Tiga bukti yang saling menopang, bukan satu:

1. **Penulisnya tunggal dan seragam.** Enam call site `writeSystemOutbox()` di
   `wrapper.ts` (baris 945, 983, 1043, 1055, 1230, 1291), **semuanya**
   `type: 'session-change'`. Pembacanya (`server.ts:2006`) hanya mengenal tipe
   itu; apa pun yang lain jatuh ke `unknown system-outbox type`. **system-outbox
   bukan kanal serbaguna — ia kabel satu-tujuan antara wrapper dan plugin.**
2. **Query yang menyangkal.** `handleSessionChangeEvent` (`server.ts:2055`)
   **selalu** menulis `metadata.kind = 'session-change'`. Tidak ada satu pun
   baris ber-`metadata.kind` di seluruh 10.822 baris armada. Kalau kabel itu
   pernah mendarat di db, jejaknya wajib ada.
3. **Jebakan yang nyaris lolos.** Delapan baris memuat frasa `"switch to
   session"`. Semuanya `source` **user/assistant**, tertanggal 2026-05-19 —
   itu percakapan user dan bot **merancang** bentuk pesannya, bukan pesannya.
   Mencocokkan teks saja akan menghasilkan kesimpulan terbalik.

Jadi **7,2/hari di baris #4 adalah angka wrapper murni**, 100% `session-change`.
Angka "107 baris `source='system'`" mengukur hal lain sama sekali.

### 8.2 Siapa yang sebenarnya menulis baris `source='system'`

**AI di dalam sesi Claude Code memanggil `reply` sendiri** dengan
`source: 'system'` — skill `telegram:notify-user`, laporan handoff antar-bot,
pengumuman batch selesai. **317 baris seumur hidup, 69 dalam 30 hari = 2,3/hari.**

Jalur ini **tidak menyentuh wrapper sama sekali.** Perlu ditegaskan karena
`wrapper.log` memuat 277 baris berbunyi `injecting /rename + /notify-user` yang
mudah dibaca sebagai bukti sebaliknya: **teks log itu basi.** Kode di
`wrapper.ts:902-952` hanya me-rename lalu menulis system-outbox — injeksi
`/notify-user` sudah tidak ada. Log yang menyebut nama sebuah fitur bukan bukti
fitur itu berjalan.

### 8.3 Akibatnya: #4 pecah dua

| | Isi | Frekuensi | Bergantung #6? |
|---|---|---|---|
| **4a** | `session-change` → Telegram (kabel wrapper→plugin) | 5,7/hari | **Ya, penuh.** Penulisnya wrapper; wrapper belum ada di sistem baru |
| **4b** | Kiriman proaktif dari dalam sesi (`reply` tanpa pesan masuk) | 2,3/hari | **Tidak sama sekali** |

**4b berdiri sendiri, dan celahnya nyata** — bukan sekadar soal penandaan
`source`. `cc-plugin/src/engine/engine.ts:564` mengambil tujuan dari
`lastChatByBot`, dan bila bot belum menerima pesan **dalam sesi itu** ia
melempar `no_known_chat: this bot has not received a message yet, so there is
nobody to reply to`. Itu persis definisi celah #4: *push tanpa pesan masuk.*
Sistem lama menyelesaikannya dengan jatuh ke `access.allowFrom[0]`
(`server.ts:2021`). Sisi kedua: `storeOutgoing` (`engine.ts:130`) menetapkan
`source: "assistant"` mati — sistem baru belum punya konsep `source: 'system'`.

**Yang BELUM diukur, dan dinyatakan begitu:** apa saja selain `reply` yang
bergantung pada `lastChatByBot`. Tanpa angka itu, biaya 4b belum bisa disebut
"kecil" — yang bisa dikatakan hanya *"dua titik perubahan sudah teridentifikasi,
cakupan penuhnya belum dihitung."*

### 8.4 Kenapa koreksi ini ditulis, bukan sekadar dipakai

Audit ini sendiri (§1) menemukan bahwa meteran pertamanya *"berbohong dengan
meyakinkan"* dan menyelamatkan `/switch` dari kolom "tidak dipakai". Baris #4
adalah kejadian yang sama, satu lapis lebih dalam: **dua meteran yang
masing-masing benar, disandingkan sehingga melahirkan sebab-akibat yang tidak
ada.** Ketidakhadiran di satu meteran bukan bukti — dan kehadiran di dua meteran
bukan bukti keduanya bicara soal yang sama.
