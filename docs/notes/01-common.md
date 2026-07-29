
Saya ada beberapa permintaan lagi :

- khusus pada skill daily-report, saya ingin kamu buang referensi soal Kakaotalk. Saya tidak ingin mengkaitkan dengan provider apapun. jadi daily-report ini sifatnya harus agnostic

- saya menemukan bot seringkali lupa menjalankan skill immediate-reply dan interactive-prompts. Pada session sebelumnya, agent bot mengatakan interactive-prompt "tidak dikenali", seperti belum terload atau belum pernah bump version?, padahal skill ini ada. Apakah ini sudah di-fix?

Khusus soal interactice-prompts :
  - saya masih sering menemukan interactive-prompts sering lupa mencantumkan button terakhir yang berbunyi semacam "jelaskan secara manual" sebagai fallback. Saya curiga mungkin karena belum (tidak pernah) bump version?
  - saya juga masih sering menemukan interactive-prompts tidak digunakan secara optimal. Saya ingin setiap kali bot mengakhiri response dengan pertanyaan manual. Yang seharusnya bisa setidaknya ada yes-no
  - skill ini kadang sulit/lupa dipalai oleh bot. Apak karena bot salah paham dengan existing name-nya? atau ada deskripsi yang tidak jelas? mungkin perlu diingatkan untuk mengidentifikasi setiap response, apakah response ini berbentuk pertanyaan atau response dari jawaban saja.
  - perlukah kita ubah namanya dari interactive-prompts menjadi inline-buttons atau yang lain agar lebih mudah dikenali? apa saran kamu?
  
Sebagaimana kamu ketahui, seluruh plugins pada mirza-marketplace adalah perangkat atau framework untuk digunakan oleh agent bot. Saya ingin didalam pekerjaanya selalu 
- pakai git worktree dalam bekerja instead of membuat branch
- saat bot melakukan git commit, dia bisa mencantumkan namanya, misal "bot-01" atau semacamnya. 
- jika memungkinkan, selalu upayakan untuk menggunakan subagent agar bot utama tetap bisa berkomunikasi dengan user
- Dan mungkin ada beberapa rule baru lagi yang mungkin menyusul. Apakah sebaiknya yang seperti ini dibuat dalam skill baru ?
- instruksi untuk membuat file playbook yang berisi best practise yang sudah teruji dengan baik dan menyertakan hasil pembelajaran dan kesalaha yanng pernah dilakukan dan seharusnya jangan dilakukan lagi. serta instruksi untuk mengupdate file playbook ini untuk bisa dipergunakan oleh agent bot lain berikutnya demi kesinambungan.

dan setelah perbaikan semua ini, jangan lupa untuk bump version-nya

Coba kamu urutkan mana yang paling mudah pengerjaanya kita akan tackle satu per-satu






- saya ingin semua konten dalam source code dan README dalam bahasa inggris. ini mungkin pekerjaan yang cukup besar ya? kalau iya mungkin bisa dilakukan difase berikutnya saja.

- saya ingin kamu menuliskan pada root README soal penjelasan terkait dependency plugin yang ada. Misal pty-controller depend on telegram dan wrapper. Begitu juga dengan agent-bus. Lakukan pula pada masing-masing README di plugin terkait (kalau memang belum ada) 