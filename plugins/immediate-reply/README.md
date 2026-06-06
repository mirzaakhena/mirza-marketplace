# `immediate-reply` — Bikin Claude terasa cepat di Telegram

Plugin **skill-only** yang menyuruh Claude mengirim acknowledgement pendek ke user Telegram dalam ~1 detik sebelum tool call pertama dijalankan. Tidak ada MCP server, tidak ada command — cuma satu skill perilaku yang diaudit setiap kali pesan Telegram masuk.

## Kenapa ada plugin ini

User Telegram baca dari HP. Delay 5 detik tanpa tanda-tanda kehidupan kerasa seperti bot ghosting. Acknowledgement instan ("bentar cek dulu...") sebelum kerjaan dimulai bikin user yakin pesannya sampai dan Claude lagi kerja, walau jawaban final-nya baru muncul 30 detik kemudian.

## Aturan inti — pre-flight check mekanis

Sebelum menyusun respons untuk pesan Telegram apapun, AI menjawab **4 pertanyaan hitung-tool** (bukan menilai "ini berat atau nggak"):

1. Akan ada tool call selain `reply` sebelum jawaban final?
2. Akan `Read` file?
3. Akan menjalankan perintah Bash/shell (termasuk `git`, `ls`, `grep`)?
4. Akan dispatch Agent / background process / Monitor?

**Satu saja "ya" → ack WAJIB dikirim SEBELUM tool pertama jalan.** Semua "tidak" (respons murni teks tanpa tool) → ack tidak perlu, langsung jawab.

Check ini sengaja mekanis, bukan judgement-based — versi lama ("kerjaan non-trivial", "lebih dari beberapa detik") terbukti drift di praktik: AI menaksir "cuma 3 detik" padahal 12 detik, atau lupa ack saat sedang in flow.

## Dua tanggung jawab

1. **Instant ack** — tanda kehidupan dalam ~1 detik dari pesan masuk.
2. **Progress berkelanjutan** — untuk task > 15 detik, narasikan transisi antar tahap. Diam setelah ack hampir sama buruknya dengan tidak ack.

Skill lengkap ada di [`skills/immediate-reply/SKILL.md`](skills/immediate-reply/SKILL.md). Itu source of truth — di sana ada diagram alur, contoh phrasing ack per situasi (riset/baca file/mikir/nulis), dan anti-pattern list.

## Strategi update

Setelah ack terkirim, pilih SATU strategi per task (jangan ganti di tengah jalan):

- **A — Edit-to-final.** Cocok untuk task 5–15 detik. Ack → kerja → `edit_message` jadi jawaban final. Satu pesan bersih di chat.
- **B — Multi-edit progress + final reply baru.** Cocok untuk task 15–60 detik dengan stage jelas. Ack di-edit beberapa kali sebagai progress ("✅ research done, lagi nyusun..."), jawaban final dikirim sebagai **reply baru** biar push notification HP bunyi.
- **C — Progressive new messages.** Cocok untuk feel "thinking out loud". Ack pendek, lalu narasi proses dikirim sebagai pesan-pesan baru berturut-turut.
- **D — Mix.** Mulai dengan edit, switch ke pesan baru kalau ternyata lebih lama dari perkiraan. Boleh, asal jawaban final selalu jadi pesan baru kalau total > ~15 detik.

## Constraint Telegram yang wajib dipatuhi

1. **Edit tidak memicu push notification.** Kalau task > ~15 detik, output final WAJIB pesan baru, bukan cuma edit — kalau tidak, HP user nggak bunyi dan dia kira Claude menghilang.
2. **Jangan edit lebih cepat dari 1x per detik per chat.** Itu wilayah rate limit Telegram.
3. **Edit tidak bisa ganti tipe pesan.** Ack teks tidak bisa di-edit jadi gambar — gambar harus pesan baru.
4. **Satu ack per pesan user.** Kalau user kirim 3 pesan dalam 5 detik, ack pesan terakhirnya — jangan kirim 3 ack.
5. **Skip ack hanya untuk respons murni teks tanpa tool.** Jalur "semua tidak" di pre-flight check — sapaan, fakta singkat dari ingatan — langsung jawab. Begitu ada satu Read/Bash/tool lain, ack wajib.

## Pasangan plugin

Plugin ini cuma masuk akal kalau channel Telegram aktif. Install bareng:

- **[`telegram`](../telegram/)** — wajib. Tanpa channel Telegram, skill ini tidak akan pernah ke-trigger.
- **[`interactive-prompts`](../interactive-prompts/)** — pelengkap bagus. Saat akhirnya butuh tanya konfirmasi ke user, render pilihan sebagai tombol inline keyboard supaya user bisa jawab satu-tap.

## Instalasi

Marketplace setup sudah dibahas di [root README](../../README.md). Setelah marketplace `mirza-marketplace` ter-add, install dengan:

```
/plugin install immediate-reply@mirza-marketplace
/reload-plugins
```

Skill akan otomatis terload — tidak ada konfigurasi tambahan.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
