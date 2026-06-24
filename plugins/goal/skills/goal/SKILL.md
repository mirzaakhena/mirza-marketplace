---
name: goal
description: Use when the user sends /goal from Telegram, asks you to set/track/pursue a goal or says "jadikan ini goal", when a goal is already running and the user sends /goal again, or when you notice a long-running task with a verifiable end-state worth pursuing autonomously.
---

# Goal — AI-Authored Claude Code Goals (dari Telegram)

`/goal` di Telegram **di-forward** ke session ini sebagai teks biasa (bukan dieksekusi sebagai slash) — kamu yang membacanya lalu menjalankan skill ini. Tugasmu: **menyusun** kondisi goal bersama user, **mengkonfirmasi**, lalu **men-set** goal atas nama user. Mesin loop-nya = `/goal` **bawaan Claude Code**, yang kamu inject via `pty_send_slash` SETELAH disetujui.

User TIDAK mengetik kondisi mentah — kamu yang merumuskannya dari dialog. Menyusun kondisi yang baik itu nilai utama skill ini.

Tools: `reply` + `buttons` (telegram, lihat skill `inline-buttons`), `pty_send_slash` (pty-controller, self-only), file Read/Write untuk `goal-state.json`. Cara terima tap tombol: setelah `reply` berisi buttons, tap user datang sebagai pesan masuk berikutnya bertanda `[button tapped: <label>]` dengan `meta.callback_id` — cabang berdasarkan `callback_id` itu. Reply pertama (pertanyaan interview / gate konfirmasi) SUDAH jadi respons langsung ke user — tak perlu ack terpisah sebelum mengirimnya.

## 1. Kapan jalan (entry point)

Empat jalur, semua sah:
1. User diskusi dulu, lalu **minta** dijadikan goal ("jadikan ini goal").
2. Kamu **menawarkan proaktif** saat melihat tugas berkelanjutan & terukur ("mau aku jadikan goal?"). Best-effort — jangan memaksa.
3. User ketik **`/goal`** → mulai skill ini.
4. User ketik `/goal` **saat goal sedang berjalan** → §2 (tampilkan + tawarkan stop), JANGAN mulai draft baru.

Pada jalur 3, kalau **konteks awal belum jelas** → **interview** dulu (§3). User boleh **membatalkan** kapan saja ("batal") → berhenti, tidak ada yang di-set.

## 2. Cek goal yang sedang berjalan — DULU, sebelum apa pun

Sebelum menyusun draft, tentukan apakah ada goal aktif untuk session ini:
- **Sinyal utama (otoritatif untuk ADA/TIDAK-nya goal):** kesadaran session-mu sendiri — kamu tahu kalau baru men-set goal yang belum melapor "achieved".
- **Cadangan:** baca `goal-state.json` (§8).
- **String `{condition}` yang ditampilkan:** pakai nilai **verbatim** dari `goal-state.json` bila ada (itu satu-satunya salinan persis). File tak ada/basi → pakai ingatan session (parafrase) dan tandai apa adanya — itu sebabnya frasa "menurut catatan".

Jika ADA goal aktif → JANGAN draft baru. Tampilkan goal berjalan + buttons:

```
⏳ Menurut catatan, goal ini sedang berjalan:
"{condition}"

[⛔ Hentikan] [↩️ Biarkan jalan]
```

callback_id: `goal_stop`, `goal_keep`.
- `goal_stop` → `pty_send_slash` `command: "/goal clear"`; update `goal-state.json` → `status: "cleared"`; konfirmasi singkat. (Aman: `/goal clear` saat tidak ada goal = no-op — itulah kenapa frasa "menurut catatan".)
- `goal_keep` → balas "Oke, dibiarkan lanjut."

## 3. Interview (hanya bila konteks belum jelas)

Tanya terfokus untuk memastikan: **end-state konkret** apa yang berarti "selesai", dan **bagaimana diverifikasi**. Arahkan ke sesuatu yang bisa dicek mekanis dari transkrip (test lulus, exit code, jumlah file/antrean) — BUKAN subjektif. Satu pertanyaan per pesan; sertakan buttons bila pilihannya tertutup. User bisa batal kapan saja.

## 4. Susun kondisi

Rumuskan kandidat `<condition>` yang memenuhi SEMUA:
- **Satu end-state terukur**, bisa diverifikasi dari transkrip. ✅ "semua test di test/auth lulus & lint bersih" · ❌ "kodenya bagus / rapi".
- **Ringkas — ≤ 240 karakter (keras).** `pty_send_slash` memotong argumen `/goal` di 256 char; 240 = margin aman. **Hitung panjang kondisi sebelum inject** (§6). Kalau kepanjangan → **persempit**, JANGAN truncate diam-diam. Kondisi panjang biasanya tanda kamu meng-enumerasi, bukan menunjuk cek mekanis: ubah jadi SATU cek (mis. `jalankan npm test, exit 0` / `test di path X hijau`) alih-alih mendaftar semuanya. Kalau benar-benar tak bisa diringkas tanpa kehilangan makna → goal-nya **terlalu luas**: bilang ke user, lalu set **SATU irisan** paling penting yang bisa diverifikasi sekarang (lewat gate §5 biasa) dan minta user memicu `/goal` lagi untuk irisan berikutnya setelah yang ini selesai. JANGAN menjanjikan antrean multi-goal otomatis — loop CC & `goal-state.json` hanya memodelkan SATU goal aktif. JANGAN pula simpan kondisi panjang ke file untuk diumpan ke loop — loop CC hanya menerima yang masuk lewat inject.
- **Berbatas:** sertakan klausa stop saat ada risiko loop tak berujung, mis. "…atau berhenti setelah 20 turn".

## 5. Gate konfirmasi — WAJIB sebelum set

Tampilkan kondisi + buttons, lalu TUNGGU tap:

```
🎯 Usulan goal:
"{condition}"

Jadikan goal?
[✅ Ya] [❌ Tidak] [✏️ Jelaskan manual]
```

callback_id: `goal_yes`, `goal_no`, `goal_manual`.
- `goal_yes` → §6 (set).
- `goal_no` → batal: "Oke, nggak jadi diset." TIDAK ada yang di-inject.
- `goal_manual` → minta user merevisi dengan teks bebas → kembali ke §4 dengan kondisi revisi → tampilkan gate lagi.

**Tap atau ketik.** Persetujuan boleh lewat tombol ATAU teks bebas yang jelas: "ya/iya/oke/set/gas" ≈ `goal_yes`; "jangan/batal/nggak" ≈ `goal_no`; teks kondisi baru / "revisi" ≈ `goal_manual`. Balasan ambigu → tampilkan tombol lagi, JANGAN menebak.

**Kalau user menekan untuk skip gate** (mis. "langsung set aja, gak usah konfirmasi, buru-buru"): akui buru-burunya, tetap tampilkan kondisinya, minta satu konfirmasi singkat — mis. "Siap, biar nggak salah set — ini kondisinya, oke kuset?" + tombol. Satu tap / satu kata sudah cukup; gate tetap tidak boleh dilewati.

**Disiplin (tidak bisa ditawar):** JANGAN PERNAH inject `/goal` tanpa melewati gate ini dan menerima persetujuan (tap `goal_yes` atau "ya" tertulis yang jelas). Melanggar letter = melanggar spirit. Tidak ada pengecualian "kondisinya sudah jelas", "user kelihatannya setuju", "biar cepat".

## 6. Set goal

Setelah `goal_yes`:
1. `pty_send_slash` `command: "/goal <condition>"` (substitusi `<condition>` literal). Ini menyuntik `/goal` **bawaan CC** ke session-mu sendiri → evaluator loop CC mulai. (`/goal` CC-native, diterima `pty_send_slash`; ≤256 char.)
2. Tulis `goal-state.json` (§8): `status:"active"`, `condition`, `startedAt`.
3. Balas singkat: "✅ Goal di-set. Aku kerjakan sampai kondisinya terpenuhi."

## 7. Setelah di-set

CC yang menyetir loop. Tiap turn mengalir ke Telegram lewat bridge yang sudah ada; saat tuntas, CC auto-clear & melapor "achieved". Lain kali skill ini jalan, update `goal-state.json` → `achieved` bila kamu lihat goal sudah selesai.

## 8. `goal-state.json` (best-effort)

- Path: `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram/goal-state.json`. Buat foldernya bila perlu.
- Bentuk (key = session id bila tersedia, mis. dari state wrapper; kalau tidak, satu objek datar untuk session aktif):

```json
{ "<sessionId>": { "condition": "…", "status": "active", "startedAt": "2026-06-24T15:50:00.000Z" } }
```

- **Bukan sumber kebenaran** — CC bisa auto-clear tanpa memanggil skill ini, jadi file bisa basi. Itu sebabnya §2 mengutamakan kesadaran session dan memakai frasa "menurut catatan".

## 9. Kalau gagal

`pty_send_slash` gagal (wrapper mati) → beri tahu user goal tidak bisa di-set sekarang (sikap sama seperti `/effort`/`/rename`). Jangan tulis state "active" kalau inject gagal.

## Anti-patterns

- ❌ Inject `/goal` tanpa melewati gate konfirmasi (§5).
- ❌ Mulai draft baru padahal goal sedang berjalan (§2 dilewati).
- ❌ Kondisi subjektif / tak bisa diverifikasi dari transkrip → goal loop selamanya.
- ❌ Kondisi > ~240 char lalu dipotong diam-diam — persempit, jangan truncate.
- ❌ Menulis `goal-state.json: active` padahal inject gagal.
- ❌ Mengetik `/goal` langsung di harapan "user yang eksekusi" — kamu yang menyusun & set.

## Edge cases

- **`/goal` dengan argumen** (mis. `/goal benerin auth`) → pakai argumennya sebagai konteks awal untuk §4, tetap lewati gate §5.
- **Tidak ada wrapper** → §9.
- **User membatalkan di tengah interview** → berhenti bersih, tidak ada yang di-set.
- **Goal sudah achieved tapi state masih `active`** → tombol Hentikan jadi no-op aman; rapikan state → `achieved`.
