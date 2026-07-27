# Area 09 — Goal

**Tanggal keputusan:** 2026-07-26 · **Item tercakup:** SKILL-033–044; TG-058, TG-070 (entri slash-menu)

---

## 9.1 Seluruh plugin `goal` — **DROP**

> "Belum pernah / hampir tidak — DROP dulu" — user, 2026-07-26

**Yang dibuang:**

| Item | Yang hilang |
|---|---|
| SKILL-033 | Alur `/goal` diteruskan sebagai teks lalu AI menyusun kondisi dan menyuntik `/goal` bawaan Claude Code |
| SKILL-034 | Empat jalur masuk, termasuk **tawaran proaktif** (juga di-DROP secara terpisah, §9.2) |
| SKILL-035, 036 | Pemeriksaan goal aktif + tombol `[⛔ Hentikan] [↩️ Biarkan jalan]` |
| SKILL-037, 038, 039 | Aturan penyusunan kondisi: terverifikasi mekanis, ≤ 240 karakter, klausa stop untuk mencegah loop tak berujung |
| SKILL-040 | Gate konfirmasi wajib dengan tombol `[✅ Ya] [❌ Tidak] [✏️ Jelaskan manual]` |
| SKILL-041, 043 | Urutan set + aturan "jangan tulis state `active` kalau injeksi gagal" |
| SKILL-042 | `goal-state.json` |
| SKILL-044 | `/goal <argumen>` sebagai konteks awal |
| TG-058 | Entri `/goal` di slash-menu Telegram + `/help` |

**Alasan:** mekanisme intinya milik Claude Code; yang ditambahkan plugin ini hanya perumusan kondisi + gate konfirmasi — yang bisa dicapai dengan menyuruh bot *"rumuskan kondisi goal-nya dulu, tanyakan saya, baru set"*. Bisa dibangkitkan bila kebutuhannya muncul nyata.

## 9.2 Tawaran proaktif — **DROP** (keputusan terpisah, tetap berlaku bila `/goal` dibangkitkan)

**Item:** SKILL-034 jalur 2

Bot tidak menawarkan sendiri *"mau saya jadikan goal?"*.

**Alasan:** tawaran yang tidak diminta adalah gangguan yang harganya dibayar setiap kali bot menebak salah. Ini juga sejalan dengan keluhan user soal perilaku proaktif bot yang tidak pas kadarnya (dibahas di area 10).

**Kalau `/goal` suatu saat dibangkitkan:** keputusan ini tetap berlaku — hanya jalur eksplisit (user minta) yang sah.

---

## Yang layak diselamatkan sebagai gagasan

Meski plugin-nya dibuang, dua aturan di dalamnya adalah gagasan bagus yang layak dipakai di tempat lain:

1. **Kondisi "selesai" harus terverifikasi mekanis** (SKILL-037) — bukan subjektif: test lulus, exit code, jumlah file. Ini memaksa user dan bot menyepakati definisi "selesai" yang tidak bisa ditafsir ulang. Relevan untuk **partial handoff** (area 08 §8.C, batas potongan pekerjaan) dan untuk **plan/task** apa pun.
2. **Klausa stop wajib bila ada risiko loop tak berujung** (SKILL-039) — mis. *"…atau berhenti setelah 20 turn"*. Prinsip umum: setiap pekerjaan otonom wajib punya kondisi berhenti, bukan hanya kondisi berhasil.

Kedua gagasan ini dicatat untuk dipertimbangkan di area 08/13, bukan hilang bersama plugin-nya.
