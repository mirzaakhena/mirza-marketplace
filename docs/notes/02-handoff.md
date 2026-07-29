
Handoff directly :

saya ingin kamu melakukan analisa terhadap existing handoff skill. Saat ini handoff skill ini memiliki 2 commands yaitu :
- handoff
- handoff-resume [yes]

Dan tadinya kedua command itu secara manual dijalankan oleh user.

Sekarang saya ingin menyederhanakannya menjadi hanya satu saja yaitu "handoff directly" (drop `handoff-resume` dan `handoff-resume yes`), dan akan kita akan sederhanakan namanya menjadi "handoff" saja.

handoff directly (atau selanjutnya akan kita sebut sebagai `handoff` saja) sekarang (yang baru) adalah skill untuk melakukan handoff dari satu bot ke bot lain secara directly, tanpa harus melibatkan user lagi. Karena sebelumnya handoff ini perlu ditrigger manual oleh user dan mediasi / ijin dari user (silakan baca current skill handoff untuk memahaminya). 

Misal kita punya bot-01 (yang sedang bekerja) dan bot-02 (yang sedang idle), Berikut ini adalah skenario handoff (yang baru)
- bot-01 sedang bekerja atau sudah menyelesaikan suatu pekerjaan. 
- bot harus bisa mendeteksi penggunaan context yang sudah digunakannya (apakah ini memungkinkan? jika tidak mungkin bot bisa diberikan tools untuk mengecek penggunaan context-nya) dan menawarkan user untuk handoff ke bot lain jika memang sudah mencapai sekitar 30%-40% dari total context-nya. asumsi user saat ini menggunakan context 1M karena jika user menggunakan context 200k maka mungkin bisa 80% dari total context ya. Atau kamu punya saran yang lebih baik? mungkin kamu perlu riset dulu?
- penawaran untuk handoff dilakukan dengan menampilkan interactive-prompts (inline buttons) dengan pilihan : [handoff] dan [lanjutkan]. sesuaikan dengan bahasa user. jika user memilih handoff maka kamu bisa melakukan pengecekan bot mana yang sedang idle dan menawarkan kembali kepada user bot mana yang akan di handoff (dengan interactive prompts lagi). Atau jika user sudah melakukan penunjukan langsung bot yang mana maka tidak perlu ditanya.

Langkah-langkah handoff :
  - bot-01 harus membuat file handoff, kemudian laporkan ke user via telegram bahwasanya file handoff sudah selesai.
  - bot-01 menghubungi bot-02 dengan agent-bus bahwasanya bot-02 harus melanjutkan estafet pekerjaan. jelaskan secara spesifik file handoff mana yang harus dibaca bot-02. jangan bergantung dengan latest handoff file karena bisa jadi ada file handoff lain yang juga secara paralel sedang dibuat oleh bot lain (misal oleh bot-03)
  - bot-01 kembali melaporka ke user via telegram bahwasanya dia sudah menyampaikan handoff ke bot-02 dengan instruksi untuk melanjutkan estafet pekerjaan dan harus ACK ke dua arah yaitu, ke bot-01 bahwasanya bot-02 sudah menerima handoff dan bot-02 harus melaporkan ke user bahwasanya dia sudah menerima handoff dari bot-01

setelah bot-01 menerima ACK dari bot-02, maka session bot-01 harus di reset/clear dengan cara (ini masih open discussion):
  - bot-01 sendiri yang menghapus sessionnya
  - bot-02 yang menghapus sessionnya.

proses menghapus session yang biasanya manual saya lakukan (as a user) dari sisi telegram adalah (open discussion) :
  - melakukan `/rename` pada session bot-01 menjadi nama lain apapun. biasanya saya rename jadi `/rename x`
  - melakukan `/new bot-01`, atau nama lainnya.
  - melakukan `/delete hard all` untuk menghapus semua session yang ada. Tujuannya adalah untuk mencegah kebingungan dan session name conflict.

Isi/konten dari handoff markdown file seharusnya adalah (kamu bisa lakukan komparasi dengan existing handoff skill)
  - menyertakan tujuan handoff
  - memberitahu apa yang sudah selesai, apa yang masih harus dikerjakan dan apa yang masih menjadi blocker dan kenapa jadi blocker
  - menyertakan referensi file "playbook" sehingga bot yang baru tahu apa yang harus dilakukannya
  - tidak menulis ulang informasi yang sudah dijelaskan oleh referensi yang sudah ada. 
  - pada setiap referensi file, jelaskan pula pada kondisi apa dan kapan referensi itu harus dibaca. karena ada yang bisa dibaca diawal dan ada yang dibaca saat menemukan suatu kondisi tertentu, misal error dan sebagainya.
  - jika suatu tasks/plans dijalankan dalam proses yang cukup panjang dan lintas session yang berbeda yang sudah terencana sebelumnya, maka wajib menyertakan referensi tasks/plans ini.
  - wajib selalu update README file yang ada, baik README didalam sub-folder maupun root README.

Bot yang menerima handoff harus dalam kondisi ready yang didefinisikan seperti :
- tidak dalam kondisi sedang bekerja (idle)
- contextnya kosong (atau masih sedikit, dibawah 10%).

- menghapus existing `/handoff` dan `/handoff-resume [yes]`
- menambahkan slash command `/handoff <to-bot-name>`, misal `/handoff bot-01` untuk "handoff directly" instruction dari user. Ini jika user ingin takeover handoff immediately.

Saya ingin kita brainstorming dan open discussion terkait concern dan pengembangan fitur ini denganmu dulu