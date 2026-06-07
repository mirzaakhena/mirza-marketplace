# Design Decision — Batch Injection & Neighbor Autonomy

**Tanggal:** 2026-06-07
**Status:** DIPUTUSKAN, belum diimplementasikan. Kedua keputusan diimplementasikan BERSAMAAN dalam satu gelombang rilis.
**Diputuskan oleh:** Mirza (via diskusi Telegram dengan bot-06)
**Cakupan:** pty-controller (wrapper + MCP server), agent-bus, handoff, telegram

---

## Latar belakang

Investigasi komparasi tiga alur session-switching (TSC `/new`, self-reset sender
handoff, rename receiver handoff) menunjukkan ketiganya adalah komposisi dua
primitif CSC yang sama (`/clear`, `/rename`), tapi dieksekusi lewat mekanisme
yang tidak konsisten:

- TSC `/new` → SATU payload compound `{command:"/clear", sessionName}` —
  atomik, wrapper merantai `/rename` setelah session fresh terdeteksi.
- Self-reset sender handoff → TIGA payload `pty_send_slash` terpisah
  (`/rename done-…` → `/clear` → `/rename idle`) — TIDAK atomik; payload asing
  bisa menyelip di antaranya (insiden bot-03, lihat playbook 2026-06-07).
- Receiver handoff → satu payload `/rename task-<slug>` — tidak bermasalah.

Akar ketidak-konsistenan: `pty_send_slash` adalah pintu tersempit (satu command
per panggilan, tanpa `sessionName`), sehingga bot tidak punya akses ke
atomisitas yang dimiliki handler telegram.

Temuan pendukung kunci: wrapper SUDAH mem-parsing arg dari setiap injeksi
`/rename` (`renameArgFromCommand`, wrapper.ts ±1023) dan menulis registry
telegram sendiri — sehingga field `sessionName` pada payload compound TIDAK
membawa informasi yang tak tergantikan.

---

## Keputusan 1 — Batch injection payload (sequence)

Wrapper menerima payload **array berurutan** sebagai satu file pending:

```json
[
  { "command": "/rename done-<slug>-<ts>" },
  { "command": "/clear" },
  { "command": "/rename idle" }
]
```

Aturan desain:

1. **Atomic enqueue** — seluruh batch masuk antrean injeksi sebagai blok
   kontigu; payload lain tidak bisa interleave di antara item-itemnya.
   Ini mematikan kelas bug "handoff menyelip di tengah self-reset" secara
   mekanis.
2. **Barrier-aware** — item setelah `/clear` otomatis menunggu clear barrier
   (session fresh terdeteksi) lewat mekanisme queue + gate yang sudah ada.
3. **Notifikasi session-change pindah ke AKHIR BATCH** — bukan saat session
   fresh terdeteksi. User tetap SELALU dinotifikasi dia masuk session apa
   (itu non-negotiable); yang berubah hanya timing-nya, supaya notifikasi
   membawa nama final, bukan "(unnamed)".
4. **Registry telegram diisi oleh sniffer `/rename`** yang sudah ada — tidak
   perlu field nama khusus di payload.
5. **Compound `{command:"/clear", sessionName}` di-deprecate** dengan masa
   transisi: wrapper tetap menerimanya sampai semua penulis (telegram
   meta-commands, agent-bus) bermigrasi ke bentuk batch. Terminologi
   "command /clear yang sebenarnya berperilaku /new" dinilai rancu dan
   menyesatkan (butuh kalimat "effectively becoming /new" di README untuk
   menjelaskannya = bukti namanya salah).
6. **`pty_send_slash` diperluas** menerima batch (self-target) — di sinilah
   bot akhirnya mendapat atomisitas yang selama ini hanya dimiliki telegram.
7. Pembagian peran final: **AI memutuskan** (kapan handoff, slug apa, target
   siapa), **mesin mengeksekusi urutan** (batch di wrapper).

Pemetaan ketiga alur setelah implementasi:

- TSC `/new <nama>` → batch `[{/clear},{/rename <nama>}]`
- Self-reset sender → batch `[{/rename done-…},{/clear},{/rename idle}]`
  dikirim sebagai SATU panggilan `pty_send_slash`
- Receiver → tetap satu command (batch berisi satu item, atau bentuk lama)

## Keputusan 2 — Neighbor autonomy (otonomi antar-bot)

**Prinsip: setiap bot bertanggung jawab atas dirinya sendiri. Tidak ada bot
yang boleh mengendalikan sesi bot lain secara mekanis.**

> Mekanis untuk diri sendiri, persuasif untuk tetangga, prerogatif user
> untuk darurat.

Konsekuensi konkret (mencakup DUA pintu — menutup satu saja berarti
prinsipnya bocor):

1. **`agent_send kind:"slash"` DI-DROP.** Satu-satunya kanal antar-bot adalah
   `kind:"prompt"` — permintaan yang dimediasi AI penerima, yang bisa
   menimbang, menolak, atau menunda dengan guard-nya sendiri (anti-bounce
   rule + hop_count cap tetap berlaku).
2. **`pty_send_slash` menjadi self-only** — parameter `target` (peer/array)
   dihapus.
3. **Use-case relay yang sah tetap hidup via prompt** — "suruh bot-02
   jalankan /daily-report" menjadi prompt; AI bot-02 yang mengeksekusi
   command-nya sendiri.
4. **Remote rescue bukan lagi urusan tetangga** — bot macet diselamatkan
   langsung oleh user via chat Telegram bot itu sendiri (TSC `/new`).
   Penyelamatan = hak prerogatif user.

### Rationale

- Asimetri fundamental: prompt punya hakim (AI penerima), slash tidak.
  Guard sebagus apa pun di skill receiver tidak bisa memproteksi dari slash
  karena slash tidak pernah mampir ke AI.
- Ekosistem sudah setengah mengakui bahayanya — tiga pagar darurat terpisah
  untuk satu bahaya yang sama: larangan `/clear`/`/delete` ke peer di skill
  handoff, penolakan `/clear` broadcast di `pty_send_slash`, kewajiban
  re-konfirmasi user di README agent-bus. Keputusan ini menyelesaikan
  kalimat yang sudah setengah diucapkan.
- Prompt injection tetap risiko, tapi risiko yang punya pertahanan berlapis
  lebih baik daripada risiko tanpa pertahanan di sisi penerima.

### Alternatif yang ditolak

- **Mempertahankan compound `sessionName`** — informasinya redundan (sniffer
  `/rename` sudah ada); terminologinya rancu.
- **Whitelist slash non-destruktif antar-bot** (mis. hanya `/rename`) —
  tetap melanggar prinsip otonomi; kompleksitas pagar bertambah, bukan
  berkurang.
- **Sequence murni TANPA pemindahan notifikasi** — user akan dapat ping
  "switched to (unnamed)"; ditolak karena kejelasan notifikasi itu penting.

---

## Peta dampak implementasi (untuk eksekutor nanti)

- `plugins/pty-controller/wrapper/src/wrapper.ts` — terima payload array;
  atomic enqueue; notifikasi session-change di akhir batch; pertahankan
  compound selama transisi.
- `plugins/pty-controller/server.ts` — schema `pty_send_slash`: terima
  batch; HAPUS parameter `target`.
- `plugins/agent-bus/` (server, inbox-writer, skill, README) — drop
  `kind:"slash"`; dokumentasikan prompt sebagai satu-satunya kanal.
- `plugins/handoff/skills/handoff/SKILL.md` — self-reset jadi satu panggilan
  batch; hapus catatan "TIGA injeksi berurutan".
- `plugins/telegram/meta-commands.ts` — `/new` bermigrasi ke batch (boleh
  belakangan, compound masih diterima selama transisi).
- Wrapper version bump + restart mirza-cc di semua bot (wrapper berjalan
  tetap memakai kode lama sampai restart).
- Playbook entry 2026-06-07 tentang `pty_send_slash` self-relay perlu
  direvisi setelah implementasi (self-relay via `agent_send` ke diri sendiri
  tetap sah — itu prompt, bukan slash).

## Risiko & trade-off yang diterima sadar

- Relay antar-bot via prompt lebih mahal (token + latensi) dan bisa gagal
  bila AI penerima salah tafsir — diterima, karena penerima yang bisa
  menolak lebih penting daripada eksekusi yang murah.
- Bot yang AI-nya macet tidak bisa di-rescue bot lain — diterima, mitigasi:
  user punya akses Telegram langsung ke setiap bot.
