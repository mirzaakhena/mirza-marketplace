# Area 07 — Komunikasi antar-bot (agent-bus)

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** BUS-001–047; PTY-038; SCAR-038, 043, 044, 069, 070

---

## 7.0 Prinsip induk yang dipertahankan: **neighbor autonomy**

**Item:** BUS-017, BUS-037; SCAR-044; PTY-005

`kind:"slash"` antar-bot **dihapus** (keputusan 2026-06-07) dan `pty_send_slash` jadi self-only. Asimetri fundamentalnya:

> **Prompt punya hakim** — AI penerima membaca dan boleh menolak. **Slash tidak punya hakim** — ia langsung mengubah state, dan guard sebagus apa pun di skill penerima tak bisa menahannya karena slash tak pernah mampir ke AI.

**Aturan untuk build baru:** setiap kanal antar-bot baru wajib lewat uji prinsip ini. Turunannya yang juga tetap: setiap bot bertanggung jawab atas sesinya sendiri; bot macet diselamatkan **user**, bukan bot tetangga (BUS-037).

## 7.1 Transport prompt — **GANTI ke notifikasi channel**

**Item:** BUS-027, BUS-022; SCAR-038; PTY-035 (bagian `type:"prompt"`), PTY-060, PTY-061

**Sekarang:** pengirim menulis file JSON ke folder `pending/` milik peer, lalu **wrapper peer mengetikkan isinya ke TUI sebagai giliran user biasa**.

**Jadi:** prompt antar-bot masuk lewat **jalur notifikasi channel** — pintu yang sama dengan pesan Telegram masuk.

**Yang langsung hilang:**

| Yang hilang | Item |
|---|---|
| Perataan newline jadi satu baris (pesan boleh multi-baris lagi) | BUS-022; SCAR-038 |
| Batas badan pesan 8 KB | BUS-021 |
| Chunking 100 code-point / 30 ms untuk ConPTY | PTY-060, 061; SCAR-007, 019, 020 |
| Penahanan gate injeksi sepanjang jendela pengetikan | PTY-060 |
| Tipe `prompt` di union payload PTY | PTY-035 |

Sejalan dengan **K-10**: keystroke tersisa **hanya** untuk slash lifecycle.

**Yang tetap utuh:** prinsip neighbor autonomy — yang masuk tetap prompt yang dibaca AI penerima dan boleh ditolak. Hanya pintunya yang berbeda.

## 7.2 Marker atribusi — **GANTI jadi metadata terstruktur** (fix SEC-4)

**Item:** BUS-025, BUS-038; SCAR-043

**Sekarang:** prosa Inggris disisipkan ke depan teks: `[Message from agent bot-01 via agent-bus (hop 0). This is an inter-agent instruction… set payload.hop_count = 1.] <isi>`

**Masalahnya (SEC-4):** user sendiri bisa **mengetik string itu** di Telegram dan AI memperlakukannya sebagai perintah dari bot lain. Selain itu dibayar token setiap pesan, dan mencampur *instruksi* dengan *data*.

**Jadi:** `from`, `hop`, `id` dibawa sebagai **metadata di luar badan pesan** — sama seperti pesan Telegram membawa `chat_id`/`user` di meta, bukan di isi. Mustahil dipalsukan dengan mengetik, tidak dibayar token, instruksi tidak bercampur data. Otomatis ikut dari keputusan §7.1.

**Konsekuensi ke skill:** aturan anti-bounce yang sekarang berbunyi "prompt yang diawali marker `[Message from agent …]` = terminal context" (BUS-038) harus ditulis ulang mengacu ke metadata, bukan ke teks marker.

## 7.3 Guard anti-loop dua sisi — **KEEP**

**Item:** BUS-023, BUS-024, BUS-031, BUS-042; PTY-038

`hop_count` naik tiap relay. `> 5` **ditolak di pengirim** (supaya AI dapat error jelas, bukan silent drop) **dan** di-drop **di penerima** (supaya rantai mati walau semua AI misbehave). Omitted/null → 0; wajib non-negative integer.

**Kenapa dua sisi:** guard ganda memastikan relay loop mati setelah 5 hop meski seluruh AI berperilaku salah. Ini pola yang layak dipertahankan apa pun bentuk transportnya.

## 7.4 Otonomi `agent_send` — **DIBUKA untuk alur yang sudah disetujui user**

**Item:** BUS-030, BUS-040, BUS-043; SKILL-030

**Sekarang:** deskripsi tool berbunyi *"DO NOT call autonomously"* — hanya boleh saat user minta eksplisit atau saat prompt masuk meminta laporan balik. Ini bertabrakan dengan keinginan user bahwa handoff berjalan *"tanpa harus melibatkan user lagi"* (`docs/notes/02-handoff.md`).

**Jadi:** `agent_send` boleh otonom **hanya di dalam alur yang izinnya sudah diberikan user** — handoff yang disetujui lewat tombol, atau penunjukan bot tujuan yang sudah user sebut. Bedanya dengan sekarang: **izin boleh berlaku untuk beberapa langkah ke depan**, tidak harus per-panggilan.

**Yang TETAP terlarang:** second opinion otonom, delegasi brainstorm atas inisiatif sendiri, auto-reply hanya untuk sekadar acknowledge (BUS-039).

**Yang TETAP wajib konfirmasi ulang meski user sudah bilang "kerjakan":** prompt yang meminta peer mereset/menghapus sesinya (wipe-state) — dengan restatement konkret lewat tombol (BUS-043). Aksi non-destruktif tidak perlu konfirmasi ekstra.

**Ditolak:** membuka sepenuhnya (bot bebas saling menghubungi kapan pun). Alasan: percakapan antar-bot yang tak terlihat user bisa berputar membakar token, dan user kehilangan gambaran siapa menyuruh siapa. Guard hop membatasi *rantai*, bukan *jumlah percakapan*.

## 7.5 `agent_status` — **SIMPLIFY jadi query store**

**Item:** BUS-006–015; SCAR-073

**Yang hilang:** seluruh logika kepercayaan berlapis — perbandingan `session_id` antara `wrapper.state.json` dan `last-status.json`, syarat "lifecycle harus busy/unknown", dan satu cabang legacy penuh untuk peer dengan wrapper lama. Setelah K-1/K-3/K-7 ini jadi **satu query biasa**; tidak ada lagi dua sumber yang bisa berselisih (INFRA-5).

**Field yang dipertahankan (semua dipilih user):**

| Field | Kegunaan |
|---|---|
| Status kerja (idle/sibuk) | Inti kegunaan tool — apakah peer bisa menerima pekerjaan. Setelah K-7 jadi field data akurat, bukan tebakan dari nama sesi |
| Pemakaian context (% + ukuran window dalam token) | Dipakai handoff memutuskan "peer masih segar atau sudah penuh". Ukuran window disediakan supaya perhitungan ambang tidak menebak dari nama model (BUS-014) |
| Nama & id sesi aktif | Untuk melaporkan ke user dengan jelas, dan memastikan pesan mendarat di sesi yang benar |
| Model, effort level, **biaya** | Biaya sekarang ada di snapshot statusline tapi **tidak diekspos** — jadi ini penambahan kecil |

**Kontrak semantik yang WAJIB ikut (BUS-014):** `context_used_percent` = null berarti **sesi fresh / belum aktif** — diperlakukan ~0% used, **BUKAN error**. Ini yang membuat sesi paling segar justru lolos sebagai kandidat handoff terbaik.

## 7.6 `agent_list` — **KEEP, disederhanakan**

**Item:** BUS-001–005; SCAR-011, SCAR-069

- Sumbernya pindah dari `~/.claude/agent-registry.json` ke config + store terpusat (K-1/K-2)
- **Ambang online 30 s** tetap, dan **wajib satu konstanta bersama** dengan pembaca lain (SCAR-010, area 06 §6.9)
- **Ambang stale 24 jam** (menyaring bangkai registry) jadi tidak relevan: setelah fleet declarative (K-2), daftar bot berasal dari config — bot yang tidak ada di config memang tidak ada. **DROP**
- **SCAR-069 hilang:** tabrakan nama (dua project dengan basename sama saling berebut slot, hanya di-WARNING lalu ditimpa) mati karena nama bot jadi eksplisit di config
- **BUS-005 KEEP:** kontrak "safe to call autonomously at any time" — melihat siapa yang ada tidak pernah berbahaya

## 7.7 Semantik antre-untuk-offline — **KEEP, tapi harus terlihat**

**Item:** BUS-028, BUS-045; SCAR-070

Target offline **tetap** menerima pesan (file/baris antre, dikonsumsi saat peer boot) dan hasilnya jujur melaporkan `online: false`. Target tak terdaftar → gagal dengan alasan jelas. Error tulis per-target tidak menggagalkan target lain.

**Kewajiban yang menyertainya:** AI **wajib** memberi tahu user bahwa pesan baru dikonsumsi saat peer boot (BUS-045) — bukan diam-diam menganggap terkirim.

**Inkonsistensi yang tercatat (SCAR-070, review #14):** `agent_send` mengantre untuk offline, sementara `pty_send_slash` justru menolak bila wrapper tidak segar. Dua kebijakan berbeda untuk situasi yang mirip. **Keputusan build baru:** biarkan berbeda **tapi eksplisit dengan alasan** — prompt boleh menunggu karena penerimanya adalah AI yang belum lahir; slash tidak boleh menunggu karena ia mengubah state sesi yang mungkin sudah berbeda saat akhirnya mendarat.

## 7.8 Broadcast / fan-out — **KEEP**

**Item:** BUS-019, BUS-029, BUS-044

`target` menerima string atau array (dinormalisasi: buang non-string, trim, dedup; hasil kosong → error). Satu panggilan menghasilkan envelope berisi hasil per-target. Pola leader fan-out: `agent_list()` dulu → `agent_send` array → peringatkan user soal target offline → bila diminta laporan balik, ringkas lalu STOP.

## 7.9 KEEP: aturan skill yang tetap berlaku

**Item:** BUS-041, BUS-046, BUS-047

| Item | Aturan |
|---|---|
| BUS-041 | **Kanal satu arah** — tidak ada reply channel. Leader yang butuh hasil harus memintanya **di dalam badan pesan** ("when done, send a one-line summary back to bot-01"). Tidak ada pairing otomatis |
| BUS-046 | Nama peer **tidak boleh ditebak** — selalu dari `agent_list`. Setelah K-2, nama berasal dari config (bukan lagi basename folder) |
| BUS-047 | **Jangan menaruh secret di badan prompt** — pesan mendarat di filesystem/store peer, diperlakukan non-confidential |

## 7.10 Dibuang / dibersihkan

| Item | Verdict |
|---|---|
| BUS-016, 018 | Validasi `kind` enum `['prompt']` — tetap ada tapi jadi sepele setelah hanya satu kind |
| BUS-026 | Identitas pengirim = basename `CLAUDE_PROJECT_DIR` → **DROP**, diganti nama dari config (K-2) |
| BUS-033–036 | Kontrak registry `agent-registry.json` + protokol lockfile → **DROP** (K-1/K-2). Termasuk **BUS-036**: fungsi writer di `registry.ts` yang ternyata **dead code** (production writer-nya adalah wrapper) — kelas duplikasi yang tidak boleh terulang |
| BUS-002 | Ambang stale 24 jam → **DROP** (§7.6) |
| BUS-032 | Error handler jadi `isError: true` — **KEEP**, pola seragam |
| SKILL teks basi | Skill `using-agent-bus` menyebut error yang sudah tidak ada (ambiguitas #5 inventaris). Ditulis ulang dari kode, bukan dari teks lama |

---

## Fitur baru dicatat

### B-7 — Riwayat sesi per bot yang bisa "dikunjungi sementara"

> "saya terpikirkan masing-masing bot juga bisa menyimpan history sesi yang pernah dijalani sebelumnya, sehingga user bisa switch ke status sebelumnya sementara waktu untuk menggali informasi sebelumnya. Tapi ini adalah ide dan fitur baru. catat saja" — user, 2026-07-26

**Status:** dicatat, belum didesain.

**Hubungannya dengan yang sudah ada:**
- `/switch` (area 05 §5.6) sudah bisa berpindah ke sesi lama — tapi itu perpindahan **permanen** sampai di-switch lagi, bukan kunjungan sementara yang otomatis kembali.
- **B-2** (bot membaca transkrip sesi lama) menyelesaikan masalah serupa **tanpa berpindah sesi** — bot menggali info dari transkrip lama sambil tetap di sesi sekarang.
- **K-8** (tidak ada transkrip yang dihapus) memastikan bahan untuk keduanya selalu ada.

**Yang perlu diputuskan nanti:** apakah kebutuhan sebenarnya "berkunjung ke sesi lain" (butuh mekanisme kembali otomatis + penanda sedang berkunjung) atau cukup "menggali isi sesi lain dari sesi sekarang" (B-2, jauh lebih sederhana). Kandidat kuat: B-2 sudah cukup, dan B-7 sebenarnya gejala dari B-2 yang belum ada.
