# Jalur Antar-Bot dan Celah Lapisan Armada

**Tanggal:** 2026-08-04 · **Ditulis:** bot-03
**Lahir dari:** percakapan brainstorming dengan user, sesudah pendataan fitur
(`2026-08-04-daftar-fitur-sistem-baru.md`)
**Status:** temuan **terukur**; desain **disepakati arahnya**, belum punya spec
maupun rencana implementasi

---

## 1. Kenapa berkas ini ada

Pendataan fitur menjawab *"apa yang sudah ada"*. Pertanyaan lanjutan user —
*"apa lagi yang belum ada?"* — membuka sesuatu yang **tidak pernah masuk
hitungan manapun**: seluruh audit celah migrasi selama ini mengukur lapisan
**Telegram** (chunking, typing, lampiran, nama sesi). Lapisan **armada** —
bagaimana bot saling bicara, bagaimana estafet berpindah — tidak pernah diukur
sama sekali.

Akibatnya, hitungan "apa yang kurang sebelum satu bot harian pindah" selama ini
**terlalu kecil**, dan tidak ada yang tahu.

---

## 2. Lima temuan (semua diukur, bukan ditaksir)

### T-1 `agent-bus` mengetuk pintu yang salah — dan akan patah diam-diam

`agent-bus` mengirim pesan antar-bot dengan menulis berkas ke folder `pending/`
milik peer:

```json
{ "id": "<uuid>", "ts": "...", "type": "prompt",
  "from": "bot-02", "text": "...", "hop_count": 0 }
```

`cc-wrapper` menolaknya. Validator `inbox.ts` menuntut field `command` yang
diawali `/`; payload di atas tidak punya `command` sama sekali, jadi jatuh ke
`"payload tidak memuat slash command"`.

**Yang membuat ini layak dicatat:** komentar di berkas yang sama menyatakan
bentuk payload sengaja mengikuti wrapper lama *"supaya penulis yang sudah ada
(plugin telegram, **agent-bus**) tidak perlu diubah"*. Niatnya tertulis, kodenya
tidak sampai ke situ, dan **tidak ada test yang menjaganya** — klaim
kompatibilitas yang tidak pernah diuji.

**Koreksi framing, dan ini yang menentukan tindakannya.** Awalnya ini dibaca
sebagai *bug di `cc-wrapper`*. Sesudah user mengangkat bahwa `cc-wrapper` memang
berbicara ke TUI, framing yang benar: **bukan wrapper yang kurang, melainkan
`agent-bus` yang mengetuk pintu yang salah.** Ada dua hal yang tampak mirip tapi
berbeda tujuan:

| Yang dikirim | Tujuannya | Jalur yang benar |
|---|---|---|
| `/clear` `/rename` `/compact` | perintah ke **aplikasi** Claude Code | **PTY** — mengetik. Tidak ada alternatif; CC tidak menyediakan API untuk ini |
| teks / instruksi | pesan ke **AI**-nya | **MCP push** — sudah ada, dipakai tiap pesan Telegram masuk |

Konsekuensinya menyenangkan: **`cc-wrapper` tidak perlu diubah sama sekali**.
Validator yang menolak non-slash itu **benar**. Yang berpindah hanya alamat
tujuan `agent-bus`. Ini juga menjelaskan kenapa `kind:"slash"` di `agent-bus`
sempat ada lalu dicabut — di sistem lama kedua sifat itu dipaksa lewat satu
lubang.

### T-2 Tabel `handoffs` ada, nol kode memakainya

`fleet.db` sudah punya tabel `handoffs` lengkap: `from_bot`, `to_bot`, `slug`,
`file_path`, `status`, `mode`, `deadline_at`, `paired_with`. **Tidak ada satu
baris pun** kode yang membaca atau menulisnya (`grep` di seluruh `src/`
mengembalikan hanya definisi skemanya). Rumahnya dibangun, penghuninya belum
ada.

### T-3 Tool `pty_*` tidak ada di sistem baru

Sistem lama menyediakan `pty_send_slash`, `pty_status`, `pty_list_agents` lewat
plugin `pty-controller`. `cc-wrapper` menggantikan **mesinnya**, tetapi **tool
MCP-nya belum ada**. Artinya bot sistem baru **tidak bisa me-`/rename` dirinya
sendiri** — sesuatu yang bot harian lakukan rutin (mis. sesudah handoff).

### T-4 `reply-guard` akan memaksa balasan ke Telegram untuk pesan antar-bot

Dibaca langsung di `hooks/reply-guard.ts`. Kriteria "pesan masuk" hanya dua:

```
origin.server memuat "cc-plugin"   ATAU   <channel source="...cc-plugin...">
```

**Tidak ada penyaring siapa pengirimnya, dan `hop_count` tidak disebut sama
sekali.** Jadi pesan antar-bot yang lewat jalur push yang sama akan membuat guard
menuntut `reply` ke Telegram — chat user disemprot balasan yang bukan untuknya,
setiap kali dua bot berbicara. Guard menyala sejak pesan **pertama** (hop 1),
jauh di bawah `MAX_HOP`, jadi hop guard tidak menolong sedikit pun.

**Ini pengulangan bug yang sudah pernah terjadi (W-14):** versi pertama guard ini
memblokir dalam waktu sejam sesudah rilis karena satu sesi bisa memuat dua plugin
channel sekaligus. Perbaikannya **menyempitkan ke plugin sendiri** — dan
penyempitan itu **tidak menolong** untuk sumber baru **di dalam plugin yang
sama**.

### T-5 `hop_count` tidak ada di sistem baru

`grep -i hop` atas `cc-plugin/src` **dan** `cc-wrapper/src`: **nol hasil**. Anti-
loop guard (`MAX_HOP = 5`, penolakan di sisi pengirim dengan pesan error yang
menyuruh berhenti me-relay) hidup di `agent-bus`, sistem lama. Memindahkan jalur
antar-bot tanpa sengaja membawanya = kehilangan satu-satunya rem loop.

### Temuan sampingan: "timeout handoff" sistem lama bukan mekanis

Plugin `handoff` **tidak punya kode timeout sama sekali**. Yang ada prosedur di
`SKILL.md`: AI pengirim memasang **one-shot cron 10 menit** (`CronCreate`)
berlabel "ACK handoff `<slug>`", lalu membatalkannya (`CronDelete`) saat ACK
datang. Tiga kerapuhannya nyata dan tercatat di skill itu sendiri: AI harus ingat
memasang · AI harus ingat membatalkan (kalau tidak, cron menembak sesi baru yang
kosong — *"akan membingungkan"*) · bila tool schedule tidak tersedia, skill
menyuruh *"lanjut tanpa timeout otomatis"* — **gagal diam-diam**.

---

## 3. Desain yang disepakati

Usulan datang dari user: **jalur khusus antar-bot**, bukan menumpang alur
"balasan ke user".

### Tiga lapisan yang sempat tertukar

Kata "jalur" sempat dipakai untuk tiga hal sekaligus, dan itu menimbulkan
kekhawatiran bahwa pesan antar-bot akan muncul di chat user. Pemisahannya:

| Lapisan | Pertanyaannya | Untuk bot ↔ bot |
|---|---|---|
| **Transport** | bagaimana pesan sampai ke AI | **sama** dengan Telegram (MCP push) |
| **Tujuan** | balasan dikirim ke mana | **ke bot lain — tidak menyentuh Telegram sama sekali** |
| **Penyimpanan** | dicatat di mana | belum diputuskan |

Pesan antar-bot **tidak pernah** memanggil API Telegram. Yang membuat sesuatu
muncul di HP user hanyalah tool `reply` yang menembak `chat_id` user.

**Kenapa menumpang transport, bukan membangun jalur kedua:** yang akan dibangun
sudah punya empat hal yang mahal dibangun ulang — antrean offline (`bot_inbox`),
allowlist, hop guard, dan pencatatan. Jalur kedua berarti membangun ulang
keempatnya lalu merawat dua-duanya agar perilakunya tidak menyimpang. Itu bukan
"jalur khusus", itu **sistem kedua**.

### Alur yang disepakati (sederhana, atas penegasan user)

1. Pengirim memanggil MCP tool → pesan sampai ke bot lain, membawa penanda
   `expects_reply`
2. Kalau `expects_reply` → **AI pengirim menyalakan schedule** (cron one-shot,
   di sesi pengirim)
3. Balasan datang → batalkan schedule
4. Timeout tercapai → **lapor ke user**
5. Bot penerima/pengirim mati → **ya sudah**, tidak ada pemulihan

**Keunggulan asli menaruh cron di sesi pengirim** (bukan sekadar kompromi): saat
alarm menyala, yang bangun adalah AI yang **mengirim** — ia tahu kenapa
mengirim, ke siapa, dan apa pilihannya. Timer di dalam engine hanya bisa
mendorong notifikasi tanpa konteks, lalu AI harus merakit ulang ceritanya dari
database.

### Dua hal yang dipertahankan — syarat, bukan fitur

**(a) Penanda sumber pada pesan.** Tanpa ini, T-4 menggigit: chat user disemprot
tiap dua bot berbicara. Satu field, dan guard membaca field itu.

**(b) Balasan tidak boleh menuntut balasan** — `expects_reply: true` hanya sah
bila pesannya bukan balasan. Satu baris validasi di sisi pengirim, dan **loop
sopan A↔B menjadi tidak mungkin, bukan sekadar dibatasi**. Dengan ini `hop_count`
kembali ke perannya yang benar: jaring pengaman untuk kasus tak terbayang, bukan
rem yang diinjak tiap hari.

### Transport konkretnya — disepakati kemudian di percakapan yang sama

Sesudah user memutuskan **state per-folder bot** (berkas terpisah:
`2026-08-04-state-per-folder-bot.md`), bentuk transportnya ikut mengeras dan
**tidak lagi butuh state bersama sama sekali**:

- **Alamat** = folder tetangga. `../<nama-bot>/inbox/`. Tidak ada
  `agent-registry.json`, tidak ada berkas daftar peer — daftar botnya adalah isi
  folder induk, dibaca langsung.
- **Kirim** = tulis `<uuid>.json` ke `inbox/` milik tujuan, lewat tmp+rename.
- **Terima** = engine memindai `inbox/` miliknya sendiri — pola yang sudah
  berjalan di `cc-wrapper` untuk `pending/`.
- **Antrean offline** ikut gratis: bot yang mati tidak memindai, pesannya
  menunggu di folder, dan `ls inbox/` memperlihatkannya tanpa query apa pun.

Ini juga membalik sebagian T-1 di atas menjadi tidak relevan: masalahnya bukan
lagi "agent-bus menulis ke `pending/` wrapper yang menolaknya", melainkan
"agent-bus menulis ke `inbox/` engine" — pintu yang memang untuk itu.

### Prinsip yang lahir dari percakapan ini

> **Urusan antar-bot diam di jalurnya sendiri. Naik ke Telegram hanya kalau
> butuh keputusan manusia.**

Timeout persis kasus itu — bot pengirim tidak bisa memutuskan sendiri antara
kirim ulang, ganti bot, atau batal. Sistem lama pun sudah begitu:
`[Kirim ulang] [Pilih bot lain] [❌ Cancel]`.

---

## 4. Yang SENGAJA tidak dibangun

*(Bagian ini yang biasanya hilang, dan yang membuat sesi berikutnya mengusulkan
ulang hal yang sudah ditolak.)*

| Ditolak | Alasan user |
|---|---|
| **`deadline_at` disimpan di db sebagai cadangan** | Over-engineering. Cron di sesi pengirim sudah cukup |
| **Cek malas / sapu bersih saat engine boot** | Sama — kalau botnya mati, ya sudah |
| **Timer di dalam proses engine** | Sama |
| **Status "menunggu" yang dilacak sistem** | Tidak perlu; timeout langsung mengadu ke user |
| **Tipe pesan `ack-required` / `ack-response`** | Diganti satu boolean `expects_reply`. Alasannya: **tipe beranak** (`notify`, `broadcast`, `fyi`…) dan tiap tipe baru memaksa guard diperbarui; boolean tidak beranak. Kalau tetap ingin tipe, `ask`/`answer` lebih jujur daripada `ack-*` — di dunia protokol, *ack* berarti "aku sudah menerima", dikirim mesin dan tanpa isi, sedangkan yang dimaksud adalah jawaban berisi |
| **`request-id` sebagai aturan yang harus ditulis AI** | Beban ingatan. Preseden: aturan "tombol bernomor wajib berketerangan" bocor **3× dalam 2 hari** selama ia hanya hidup sebagai teks yang meminta AI mengingat |

**Catatan user yang membingkai semuanya:** *"Aku enggak mau over engineer… kalau
bot penerima/pengirim mati ya sudah. kalau timeout tercapai, ngadu aja ke user
simple."*

---

## 5. Langkah berikutnya bila dikerjakan

Belum punya spec maupun rencana. Urutan yang masuk akal:

1. **Ukur dulu** berapa sering bot benar-benar saling kirim — data 30 hari ada di
   `messages.db` bot lama. Kalau ternyata 0,3×/hari, bentuknya harus jauh lebih
   sederhana daripada kalau 12×/hari. Preseden: audit celah migrasi dibangun
   persis begitu, dan **empat celah teratasnya tidak ada satu pun dalam dugaan
   awal**.
2. Brainstorming → spec → rencana TDD.
3. Bawa serta `hop_count` (T-5) — ia tidak ikut pindah dengan sendirinya.
4. T-3 (tool `pty_*`) bisa berdiri sendiri dan lebih murah; ia memblokir hal
   sehari-hari (bot me-`/rename` dirinya).
