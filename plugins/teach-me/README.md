# `teach-me` — Mode mengajar

Plugin skill-only yang menggeser AI ke **mode mengajar** ketika user sedang berusaha memahami sebuah konsep — bukan ketika user sudah paham dan tinggal mau eksekusi.

Tujuannya: AI tidak nge-dump informasi seperti ensiklopedia. Sebaliknya, AI bantu user **membangun mental model** selangkah demi selangkah, dengan analogi yang user pakai sendiri, dan berhenti di titik yang wajar supaya user yang pegang kemudi pertanyaan berikutnya.

## Kapan skill ini aktif

Skill ke-trigger kalau muncul sinyal-sinyal ini:

- Frasa eksplisit: `"apa itu X"`, `"jelaskan"`, `"ajari saya"`, `"saya tidak paham"`, `"bisakah kamu menerangkan"`, `"what is X"`, `"explain X"`, `"teach me X"`
- User nanya follow-up yang mengulik konsep yang sama dari sudut baru (tanda lagi nguji pemahamannya sendiri)
- User nawarin sintesis sendiri (`"ini intinya X, benar?"`) — minta dikonfirmasi atau dipertajam
- User push back ke framing AI sebelumnya — bukan debat, tapi nyari refinement
- Invocation eksplisit `/teach-me` atau sejenisnya

## Kapan skill ini TIDAK aktif

- User sudah paham konsepnya dan tinggal minta task dieksekusi → langsung kerjain
- User minta lookup faktual dengan satu jawaban → langsung jawab
- User lagi debug code dan butuh bug ketemu → pakai skill debugging
- User minta status update atau report → kasih status, jangan ceramah

Rule of thumb: kalau user kayaknya mau **belajar**, aktif. Kalau user kayaknya mau **ngerjain**, jangan.

## Pendekatan

Skill ini bukan soal **apa** yang dijelaskan, tapi **gimana** menjelaskannya. Sepuluh elemen gaya yang dipakai sebagai satu paket:

1. **Mulai dari fundamental**, satu paragraf yang muat di kepala — sebelum masuk detail teknis
2. **Mirror analogi user** — pakai pola yang user sudah pakai, ganti kontennya
3. **Confirm and sharpen, never correct hard** — temukan bagian yang benar dulu sebelum refine
4. **Contoh konkret untuk konsep abstrak** — abstraksi nguap, contoh nempel
5. **Multi-dimensional kalau satu jawaban menyesatkan** — pisahkan jawaban per dimensi
6. **Struktur visual** — `##` heading, **bold** untuk istilah kunci, list untuk item paralel (no `|` tables di Telegram)
7. **Increment, jangan dump** — jawab yang ditanya, jangan dahului 5 pertanyaan berikutnya
8. **Tutup dengan pertanyaan terbuka** — `"Mau dalami bagian mana?"` — bukan rekap
9. **Mirror bahasa & register user** — kalau dia casual + istilah teknis English, ikutin
10. **Tahan dorongan ke aksi** sampai user kasih sinyal eksplisit siap pindah ke do-mode

Filosofi inti: **bangun pemahaman, jangan dump informasi.** Jawaban pendek yang nempel lebih berharga daripada sepuluh paragraf yang lewat begitu saja.

## Install

Pastikan marketplace `mirza-marketplace` sudah ditambahkan (lihat [root README](../../README.md) langkah 1). Lalu:

```
/plugin install teach-me@mirza-marketplace
/reload-plugins
```

Skill aktif otomatis berdasarkan trigger di atas. Tidak ada command, MCP server, atau setup tambahan — murni behavioral skill.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
