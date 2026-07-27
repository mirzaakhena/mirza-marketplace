# Area 03 — Pesan keluar & formatting

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** TG-065–090, 124, 139; SCAR-046–049, 053, 060, 062

---

## 3.1 Permukaan tool: **5 → 2**

| Tool | Verdict | Alasan |
|---|---|---|
| `reply` | **KEEP** (disederhanakan, §3.2) | inti — satu-satunya jalan AI mencapai user |
| `get_message_by_id` | **KEEP** | Bot API Telegram tidak punya riwayat/pencarian sama sekali (SCAR-060); tanpa ini AI buta terhadap apa pun di luar pesan terakhir. Termasuk fallback album TG-139 (item ke-2..N hanya tersimpan di `metadata.message_ids` baris pertama → lookup `LIKE` + verifikasi parse anti-false-positive) |
| `download_attachment` | **DROP** | area 02 §2.2 — semua lampiran diunduh otomatis |
| `edit_message` | **DROP** | §3.4 |
| `react` | **DROP** | §3.5 |

Ini menyederhanakan `instructions` MCP secara otomatis: seluruh paragraf tentang `download_attachment` dan `edit_message` mati bersama tool-nya (bahan untuk area 10).

## 3.2 Parameter `format` — **DROP, satu mode saja**

**Item:** TG-066, TG-074, TG-075, SCAR-049

Parameter `format` dibuang. **Semua** balasan diperlakukan sebagai CommonMark dan dikonversi ke MarkdownV2 oleh server.

| Yang hilang | Alasan |
|---|---|
| mode `markdownv2` (passthrough mentah, AI escape sendiri) | sisa legacy dari sebelum konverter ada; tak ada pemakaian di kode mana pun selain jalur kompatibilitas |
| mode `text` (plain) | jadi tidak perlu setelah default = markdown |
| parameter `format` itu sendiri | AI tak bisa lagi salah pilih mode |

**Bug yang ikut mati:** default sekarang adalah `text`, jadi AI yang lupa menyetel `format` mengirim `**bold**` mentah ke chat user. Setelah perubahan ini, mustahil.

**Risiko yang diterima:** teks yang harus apa adanya (mis. potongan kode berisi underscore) sepenuhnya bergantung pada kebenaran konverter — dijaga oleh tiga lapis kemunduran di §3.3.

## 3.3 Mesin chunking tiga lapis — **KEEP**

**Item:** TG-072, 073, 074, 076, 080; SCAR-046, SCAR-047, SCAR-048

Telegram membatasi **4096 karakter** per pesan. Yang membuat pemotongan sulit: memotong teks MarkdownV2 bisa membelah entity.

**Insiden asalnya** (review #22): konversi ke MarkdownV2 dilakukan *sebelum* memotong → `*bold` terbuka di chunk 1, tertutup di chunk 2 → Telegram menolak `can't parse entities` → **balasan gagal total**.

Tiga lapis yang wajib ikut pindah:

1. Potong **CommonMark mentah** dulu, dengan margin **setengah limit** (escape menggembungkan panjang), dipaksa memotong di batas paragraf (`\n\n` → `\n` → spasi, hanya bila titik potong > limit/2)
2. Konversi tiap chunk **terpisah** + verifikasi hasil ≤ limit; escape meledak → chunk itu dikirim mentah
3. Telegram masih menolak entities (celah konverter — tabel markdown tak punya padanan MarkdownV2, SCAR-048) → chunk yang sama dikirim ulang sebagai plain text

Prinsip: *readable beats a failed reply.*

**Catatan implementasi:** knob `chunkMode` di-hardcode ke `length` (area 01 §1.3), **tapi algoritma `newline` tetap harus hidup** karena jalur markdown memaksanya. Yang hilang knob-nya, bukan kodenya.

**Pelaporan kegagalan parsial (TG-080) KEEP:** `reply failed after <n> of <m> chunk(s) sent: <msg>` — pengiriman separuh jalan dilaporkan eksplisit, tidak disembunyikan.

## 3.4 `edit_message` — **DROP** (konfirmasi ulang keputusan 2026-07-04)

**Item:** TG-086, TG-087, TG-088; SCAR-057, SCAR-058

Alasan utamanya masih berlaku: **edit tidak memicu push notification**, jadi progress yang di-edit tidak berbunyi di HP — padahal itu inti kegunaan bot ini. Ditambah: panduannya kontradiktif (skill `immediate-reply` melarang, instruksi MCP menganjurkan) sehingga model menerima dua perintah berlawanan.

**Konsekuensi:** setiap pembaruan = pesan baru.

**Yang TIDAK terpengaruh:** edit internal yang bukan tool — menempelkan label pilihan setelah user tap tombol (TG-128) dan mengganti pesan picker dengan hasilnya. Keduanya tetap ada.

⚠️ **Aturan yang harus ikut pindah kalau edit internal dipakai:** mengedit pesan tanpa menyertakan `entities` akan **menghapus formatting lama**. Solusi yang sudah terbukti: teks hasil pilihan di-*append* di akhir (offset entity lama tetap valid) dan entities asli dipertahankan (SCAR-058).

## 3.5 `react` — **DROP**

**Item:** TG-083, SCAR-053

> "untuk versi baru ini kita drop saja dulu react ini karena sangat jarang terpakai" — user

Ikut hilang: penanganan whitelist emoji tetap Telegram (emoji di luar whitelist ditolak API dan ditelan diam-diam).

**Catatan:** ini menghapus **tool** `react` yang dipanggil AI. Pemakaian `setMessageReaction` internal masih ada di dua tempat, dan dua-duanya sedang menuju hilang: ack reaction otomatis sudah dimatikan (area 01 §1.3) dan reaksi ✅/❌ pada balasan permission lewat teks sedang ditunda (area 04). Kalau dua-duanya jadi hilang, seluruh pemakaian `setMessageReaction` bisa dibuang dari kode.

## 3.6 KEEP tanpa perubahan

| Item | Fitur |
|---|---|
| TG-067 | Gate outbound `assertAllowedChat` pada `reply` |
| TG-070, SCAR-087 | `assertSendable` — menolak mengirim file dari dalam state dir |
| TG-071 | Batas 50 MB per attachment |
| TG-079 | `.jpg/.jpeg/.png/.gif/.webp` → `sendPhoto` (preview inline); sisanya → `sendDocument`; file dikirim sebagai pesan terpisah setelah teks (Telegram tidak bisa mencampur teks + file dalam satu panggilan) |
| TG-081 | Logging outbound: satu row per chunk + satu row per file |
| TG-082 | Hasil `sent (id: N)` / `sent N parts (ids: ...)` |
| TG-089, TG-090 | Semua error tool dibungkus `isError:true` dengan teks `<tool> failed: <msg>` — tidak pernah merusak protokol MCP; tool tak dikenal → `unknown tool: <name>` |

## 3.7 Yang menyusut dari keputusan area 01

- **TG-072** `textChunkLimit` → konstanta 4096
- **TG-077** `replyToMode` → konstanta `first` (hanya chunk pertama mengutip pesan user)

## 3.8 Diputuskan di area lain

- **`buttons`** (TG-068, 069, 078) → area 04
- **`source: assistant|system`** (TG-066) → dipakai membedakan notifikasi yang diinisiasi wrapper (`/telegram:notify-user`) dari jawaban AI. Keputusannya menyatu dengan area 05 (lifecycle sesi) karena di situ pemakaiannya
- **Blok `instructions` MCP** (TG-124) → **area 10**. User memilih membahasnya sebagai bagian dari masalah yang lebih besar: "bot lupa menjalankan kewajibannya" (hook vs skill vs instructions sebagai satu sistem penegakan), bukan diputuskan sepotong di sini
