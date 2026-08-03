# Indikator Typing — Desain

**Tanggal:** 2026-08-03 · **Repo kode:** `mirza-bots` · **Repo dokumen:** `mirza-marketplace`
**Asal:** celah #2 dari `docs/2026-07-26-rebuild-audit/2026-08-02-celah-migrasi-bot-harian.md`
**Status:** disetujui user lewat inline button, 2026-08-03

---

## 1. Masalah

Sistem lama memanggil `bot.api.sendChatAction(chat_id, 'typing')` sekali, tepat
sebelum pesan diserahkan ke AI (`plugins/telegram/server.ts:1908`). Sistem baru
tidak punya apa pun — `grep sendChatAction` di seluruh `cc-plugin/src` nol hit.

Frekuensinya paling tinggi di seluruh daftar celah: **36,7 pesan masuk per hari**
di enam bot harian, artinya indikator ini menyangkut **setiap giliran**.

## 2. Pengukuran yang mengubah bentuk desainnya

Indikator typing Telegram padam sendiri **±5 detik** setelah `sendChatAction`
terakhir. Jadi pertanyaan sebenarnya bukan "bagaimana memasangnya", melainkan
**"berapa lama giliran ini sebenarnya berlangsung?"**

Diukur dari 1.044 giliran nyata (30 hari, enam bot, jarak dari pesan user ke
balasan pertama sesudahnya):

| | |
|---|---|
| p10 | 10 detik |
| p25 | 18 detik |
| **p50** | **33 detik** |
| p75 | 56 detik |
| p90 | 87 detik |
| p99 | 288 detik |

| Ambang | Giliran yang melewatinya |
|---|---|
| 5 detik | **97,6%** |
| 30 detik | 53,8% |
| 60 detik | 21,6% |

**Kesimpulannya menentukan:** port apa adanya dari sistem lama akan menampilkan
"typing…" selama lima detik lalu senyap sepanjang sisa 28 detik giliran
median. Itu tidak memperbaiki keluhan aslinya — itu **keluhan aslinya**, dengan
baju baru: *diam yang tidak bisa dibedakan dari rusak.*

Catatan jujur soal angka ini: ia diukur dari **sistem lama**, karena di situlah
data 30 hari ada. Sistem baru belum punya riwayat sepanjang itu. Asumsinya waktu
berpikir AI tidak berubah karena transportnya berganti — masuk akal, tapi belum
diverifikasi.

## 3. Keputusan user

| Pertanyaan | Pilihan | Konsekuensi |
|---|---|---|
| Satu tembakan, diulang, atau tidak dibangun? | **Diulang** | Indikator hidup sepanjang penantian, bukan lima detik pertama |
| Kapan berhenti? | **Di `reply` pertama** | Tidak pernah berbohong "masih kerja" setelah bot diam |

### Kenapa berhenti di balasan pertama, bukan menyala lagi sesudahnya

Menyala ulang setiap habis `reply` terdengar lebih lengkap, dan ditolak dengan
alasan tertulis: **tidak ada yang memberi tahu mesin kalau giliran sudah
selesai.** Proses MCP hanya melihat panggilan tool; akhir giliran cuma terlihat
oleh Stop hook, yang proses terpisah dan tidak bisa menyentuh timer di memori.

Jadi pilihannya bukan antara benar dan kurang lengkap, melainkan antara dua
kebohongan:

- berhenti di balasan pertama → kadang berkata **"sudah selesai" padahal belum**;
- menyala ulang → kadang berkata **"masih kerja" padahal sudah diam.**

Yang kedua lebih mahal: ia membuat user menunggu sesuatu yang tidak akan datang.
Yang pertama gagal ke arah yang sudah punya penawar — kebiasaan mengirim ack
pendek (skill `immediate-reply`), yang justru lebih informatif daripada
titik-titik.

## 4. Rancangan

Modul baru **`src/engine/typing.ts`**, tanpa grammy, tanpa I/O langsung — semua
ketergantungan disuntik supaya bisa diuji tanpa timer sungguhan maupun jaringan.

```ts
export const TYPING_PING_INTERVAL_MS = 4_000;
export const TYPING_MAX_MS = 300_000;

export interface TypingKeepalive {
  start(chatId: string): void;
  stop(chatId: string): void;
  stopAll(): void;
}

export function createTypingKeepalive(deps: {
  send: (chatId: string) => void | Promise<void>;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  now?: () => number;
}): TypingKeepalive;
```

**Perilaku:**

- `start(chatId)` mengirim satu ping **segera** — indikator harus muncul di detik
  pertama, bukan setelah interval pertama lewat — lalu menjadwalkan ping tiap
  `TYPING_PING_INTERVAL_MS`.
- `start` pada chat yang sudah berjalan **memperpanjang, bukan menumpuk**: satu
  timer per chat, dan batas waktunya dihitung ulang dari nol.
- `stop(chatId)` menghentikan timer. Tidak ada "batalkan indikator" di API
  Telegram; indikatornya padam sendiri ≤5 detik setelah ping terakhir. Itu
  memadai, dan tidak perlu dikompensasi.
- Setelah `TYPING_MAX_MS` sejak `start` terakhir, keepalive berhenti sendiri.
  Ini penjaga untuk giliran yang mati tanpa pernah membalas — p99 giliran nyata
  288 detik, jadi 300 detik berada di atas hampir semua kasus asli tanpa
  membiarkan indikator nyangkut menit-menitan.
- **Kegagalan `send` ditelan diam-diam.** Ini hiasan; ia tidak boleh menjadi
  alasan sebuah giliran gagal. Konsekuensi yang diterima sadar: ping yang gagal
  tidak meninggalkan jejak.

### Titik sambungnya

| Kapan | Di mana | Apa |
|---|---|---|
| Pesan masuk **dan diterima allowlist** | `engine.ts` pembungkus `deliver` | `typing.start(chatId)` |
| `reply` dipanggil | awal `engine.reply()`, **sebelum** memotong dan mengirim | `typing.stop(chatId)` |
| Engine berhenti | jalur shutdown | `typing.stopAll()` |

**`deliverIncoming` berubah dari `Promise<void>` jadi `Promise<boolean>`**,
mengembalikan flag `accepted` yang sudah dihitungnya sendiri
(`messages.ts:235`). Tanpa itu, engine harus menebak lewat `lastChatByBot` —
dan peta itu **menyimpan chat sebelumnya** ketika sebuah pesan ditolak, jadi
pengirim non-allowlist akan membuat bot menampilkan "typing…" ke user yang sah.
Nilai balik itu murah dan menutup celahnya di sumbernya.

`stop` dipanggil di **awal** `reply`, bukan di akhir. Selama pengiriman
berpotongan, pesan-pesannya sudah mendarat satu per satu — indikator tidak
menambah apa pun di sana, dan mematikannya lebih awal menghindari "typing…"
yang menggantung di antara potongan.

## 5. Yang sengaja TIDAK dibangun

| Hal | Alasan |
|---|---|
| Menyala ulang setelah tiap balasan | Ditolak user, alasan di §3 |
| Reaksi ack (emoji) sebagai pengganti | Sistem lama punya `ackReaction`; **nol dari enam bot mengaktifkannya**. Fitur yang tidak dipakai siapa pun |
| Knob konfigurasi interval/batas | Dua konstanta bernama. Penyaring proyek: *"lebih optimal dan sederhana"* |
| Indikator untuk aksi selain mengetik (`upload_photo`, dll.) | Balasan keluar belum bisa membawa berkas (celah #7). Tidak ada yang bisa ditandai |

## 6. Testing

Seluruhnya unit test dengan timer dan `send` yang disuntik — tidak ada
`setTimeout` sungguhan, jadi test tetap cepat dan deterministik:

- `start` mengirim ping **segera**, bukan setelah interval pertama
- ping berulang tiap 4 detik selama keepalive hidup
- `stop` menghentikan ping; tidak ada ping lagi sesudahnya
- `start` dua kali pada chat yang sama tidak membuat dua timer (hitung ping per
  satuan waktu, bukan hanya keberadaan timer)
- dua chat berbeda berjalan sendiri-sendiri; `stop` pada satu tidak mematikan
  yang lain
- setelah `TYPING_MAX_MS` keepalive berhenti sendiri
- `send` yang melempar tidak menghentikan keepalive dan tidak merambat keluar
- `deliverIncoming` mengembalikan `true` saat pesan diterima dan `false` saat
  ditolak allowlist
- pesan yang **ditolak** tidak menyalakan typing — ini yang menjaga bahwa orang
  asing tidak bisa membuat bot tampak sedang mengetik ke user yang sah

## 7. Berkas yang disentuh

| Berkas | Perubahan |
|---|---|
| `src/engine/typing.ts` | **Baru** |
| `src/engine/messages.ts` | `deliverIncoming` mengembalikan `boolean` |
| `src/engine/engine.ts` | Buat keepalive, `start` di `deliver`, `stop` di awal `reply`, `stopAll` saat shutdown |
| `test/engine/typing.test.ts` | **Baru** |
| `test/engine/messages.test.ts` | Nilai balik `deliverIncoming` |

## 8. Risiko terbuka

- **Angka latensinya dari sistem lama.** Kalau waktu berpikir di sistem baru
  ternyata jauh lebih pendek, interval 4 detik jadi lebih sering daripada perlu.
  Bisa diperiksa ulang dari `conversations.db` sistem baru setelah beberapa
  minggu pemakaian nyata.
- **Batas 300 detik belum pernah tersentuh dalam pengukuran** — p99 ada di 288
  detik, cukup dekat sehingga giliran yang sangat panjang akan kehilangan
  indikatornya sebelum selesai. Diterima: yang dijaga batas ini adalah indikator
  nyangkut, bukan kenyamanan giliran ekstrem.
