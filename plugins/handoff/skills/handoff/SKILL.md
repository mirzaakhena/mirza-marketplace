---
name: handoff
description: Direct bot-to-bot work relay. Use when (1) the user invokes /handoff, (2) an inbound agent-bus prompt assigns you a handoff file to continue, (3) you just finished a substantive task — mandatory self context check via agent_status, or (4) an active handoff designation (after-this-task / ping-pong) reaches its trigger.
---

# Handoff — Direct Bot-to-Bot Work Relay

Satu skill, dua peran: **sender** (bot yang menyerahkan estafet) dan
**receiver** (bot yang menerima estafet), plus satu kewajiban proaktif yang
berlaku untuk semua bot setiap saat (cek context, §1).

Identitasmu (**nama bot**) = basename project dir-mu (mis.
`C:\Users\Mirza\workspace\bot-05` → `bot-05`). Bot TIDAK PERNAH bekerja di
workspace-nya sendiri — **repo kerja** selalu repo proyek lain; semua path di
protokol ini absolut.

Tool yang dipakai: `agent_list`/`agent_status`/`agent_send` (agent-bus),
`pty_send_slash` **self-target saja** (pty-controller), `reply` + skill
`inline-buttons` (telegram), CronCreate/CronDelete one-shot (ACK timeout).

## 0. Konvensi nama session (kontrak antar bot)

| Nama session | Arti |
|---|---|
| `idle` | Standby, siap menerima estafet |
| `task-<slug>` | Sedang mengerjakan task `<slug>` |
| `done-<slug>-<yyyymmddhhmm>` | Arsip session yang sudah diserahkan |
| nama lain (manual oleh user) | Status **unknown** — bukan ready, jangan dipilih otomatis |

- **READY** (boleh menerima handoff otomatis) = `current_session_name == "idle"` **DAN** `context_used_percent < 10`.
- `<slug>`: kebab-case, ≤6 kata, alfanumerik+hyphen — **sama** dengan slug di filename handoff, supaya arsip session bisa di-trace ke file-nya.
- Timestamp arsip = format timestamp filename handoff (`yyyymmddhhmm`, waktu lokal).

## 1. Kewajiban proaktif — cek context tiap selesai task

Setiap kamu **menyelesaikan task substansial**, WAJIB cek
`agent_status(<nama-bot-sendiri>)`:

- Field `model` mengandung `"1M"` → threshold **35%**; selain itu → **75%**.
- Threshold boleh terlampaui **selama sebuah task masih berjalan** — pengecekan hanya di batas selesai-task, jangan menginterupsi pekerjaan.

Jika `context_used_percent` ≥ threshold:

- **Ada designation aktif** (§2 mode After this task / Ping pong) → langsung jalankan handoff full-auto (§5), user cukup dinotifikasi.
- **Tidak ada designation** → tawarkan via inline buttons: `[🤝 Handoff] [▶️ Lanjutkan]` (label tawaran ini boleh mengikuti bahasa user). User pilih Handoff → lanjut ke pemilihan bot (§3). User pilih Lanjutkan → JANGAN tawarkan lagi sampai batas selesai-task berikutnya (no spam).

## 2. `/handoff` — Step 1: pilih mode

Tampilkan buttons (label **English, fixed**, jangan diterjemahkan):

```
[🚀 Now] [⏭️ After this task] [🏓 Ping pong] [📄 File only] [❌ Cancel]
```

- **🚀 Now** — handoff sekarang juga: §3 (pilih bot) → §4 (tulis file) → §5 (kirim).
- **⏭️ After this task** — designation **one-shot**: §3 (pilih target), lalu lanjut bekerja; saat trigger §1 tercapai ATAU task selesai → full-auto §4–§5 tanpa bertanya lagi. Habis dipakai sekali.
- **🏓 Ping pong** — designation **pair**: seperti After this task, tapi kontraknya menular — tulis `**Pair:** <bot-A> ⇄ <bot-B>` di header file handoff; receiver mewarisinya (§6 langkah 8).
- **📄 File only** — tulis file handoff (§4) TANPA mengirim ke bot mana pun. Use-case: berhenti kerja, lanjut kapan-kapan; resume dengan menyuruh bot mana pun "lanjutkan handoff `<path>`" via bahasa natural.
- **❌ Cancel** — batal, tidak terjadi apa-apa.

Perintah bahasa natural "nanti handoff ke bot-02" ≡ After this task dengan
target `bot-02` (skip kedua step buttons). "handoff ke bot-02 sekarang" ≡ Now
dengan target `bot-02` (skip step 2).

## 3. Step 2: pilih bot

Panggil `agent_list()`, lalu `agent_status(<peer>)` untuk tiap peer.
Narasikan status di body pesan sebagai bullet **TANPA penomoran**; buttons
hanya nama bot + Cancel:

```
- bot-02 — idle ✅ (ctx 3%)
- bot-03 — task-m2m-benchmark ⛔ sibuk
- bot-04 — eksperimen-x ⚠️ nama manual
- bot-06 — 📴 offline (pesan akan antre di inbox)

[bot-02] [bot-03] [bot-04] [bot-06] [❌ Cancel]
```

Marka: ✅ READY (§0) · ⛔ sibuk (`task-*`) · ⚠️ nama manual (unknown) ·
📴 offline. Bot non-ready/offline TETAP bisa dipilih — user pegang kendali;
marka hanya informasi. Tidak ada peer sama sekali → katakan itu dan tawarkan
hanya `[📄 File only] [❌ Cancel]`.

## 4. Menulis file handoff (sender)

### Pra-syarat — urutan wajib

1. **Clarity check.** Tulis file hanya jika ketiganya terpenuhi: (a) next-step bisa kamu nyatakan satu kalimat tanpa hedging; (b) ada artefak konkret yang bisa dikutip (file/branch/spec/plan); (c) user mengkonfirmasi arah itu di session ini (pilihan eksplisit / spec yang di-approve / instruksi langsung — inferensi AI TIDAK dihitung). Gagal → brainstorm dulu dengan user (satu pertanyaan per pesan, multiple-choice via buttons, sertai rekomendasi).
2. **Mandat README.** Update README yang relevan SEBELUM menulis file handoff: root README repo kerja + README sub-folder yang tersentuh pekerjaan session ini. Handoff yang dikirim dengan README basi = handoff cacat.

### Lokasi & penamaan

- Path: `<repo-kerja>/.handoff/<yyyymmddhhmm>-prompt-<slug>.md`.
- `<slug>`: turunkan dari topik task session ini, bias ke apa yang paling berguna bagi bot berikutnya (mis. `swe-bench-add-deploy`, bukan `session-2026-06-06`); kebab-case ≤6 kata, alfanumerik+hyphen — validasi dulu, lalu pakai slug yang SAMA ini untuk filename, `task-<slug>`, `done-<slug>-…`, dan "ACK handoff <slug>".
- Repo kerja = `git rev-parse --show-toplevel` dari direktori kerja; bukan git repo → fallback `pwd` + beri tahu user sekali.
- Timestamp waktu lokal `YYYYMMDDHHMM`; collision → suffix `-2`, `-3`, … sebelum `.md`. Buat `.handoff/` bila belum ada.

### Template (generate langsung; JANGAN load `template.md` dari disk)

Semua section selalu ada; isi yang kosong ditulis `—`.

```markdown
# {Title in Title Case}

**Date:** YYYY-MM-DD HH:MM ({TZ})
**Repo kerja:** {ABSOLUTE path repo proyek, mis. C:\Users\Mirza\workspace\some-project}
**Branch:** {git branch} (HEAD: {short SHA})
**Dari → Ke:** {bot-pengirim} → {bot-penerima | —}
**Pair:** {bot-A ⇄ bot-B | —}
**Lanjutan dari:** `.handoff/{file sebelumnya}` | —
**Plan terkait:** `path/to/plan.md` — fase {N}/{total} | —

---

## 1. Tujuan Handoff
Kenapa handoff ini dibuat (threshold context / task selesai tapi ada
lanjutan / perintah user) + goal estafet dalam satu kalimat.

## 2. Konteks Proyek
2-4 kalimat: domain, stack utama, ada apa di repo — supaya bot baru paham
tanpa baca CLAUDE.md panjang lebar.

## 3. Yang Sudah Selesai (SUDAH)
- Action verb + objek konkret; commit SHA / path inline.
- Tandai: sudah diverifikasi/merged vs baru ditulis.

## 4. Yang Sedang Dikerjakan (SEDANG)
- State mid-flight yang tidak terekam git: file setengah diedit, sampai
  mana, apa yang belum di-commit, hipotesis debug terakhir.
(`—` kalau berhenti di titik bersih.)

## 5. Blocker
- Apa yang menghambat, **kenapa itu menjadi blocker**, dan apa yang
  dibutuhkan untuk membukanya. Internal (butuh keputusan user) vs eksternal
  (nunggu review/credential/API).
(`—` kalau tidak ada. Section ini ≠ `—` → receiver wajib tanya user dulu.)

## 6. Yang Akan Dikerjakan (AKAN)
**Goal:** {satu kalimat}
- Langkah konkret berikutnya.
**Starting point:** branch {X}; baca dulu {path}.

## 7. Referensi
| Referensi | Kapan dibaca |
|---|---|
| `~/.claude/agent-playbook/PLAYBOOK.md` | Di awal, sebelum kerja substantif |
| `{plan/tasks lintas-session}` | Di awal — roadmap source of truth, posisi fase {N}/{total} |
| `{spec}` | Saat butuh rationale keputusan desain |
| `{doc troubleshoot}` | HANYA saat menemui {kondisi/error tertentu} |

Aturan: playbook WAJIB ada; plan/tasks WAJIB bila pekerjaan bagian proses
panjang terencana; JANGAN tulis ulang isi referensi — tunjuk + kondisi baca;
setiap baris wajib punya kolom "Kapan dibaca" (di awal vs kondisional).

## 8. Keputusan User Lewat Brainstorming
| Pertanyaan | Pilihan User | Konsekuensi |
|---|---|---|
(`—` kalau tidak ada.)

## 9. Anti-Patterns / Lessons (CARRY FORWARD)
- ❌ JANGAN … (alasan) / ✅ LAKUKAN … (alasan)
(`—` kalau tidak ada.)

## 10. Catatan Lain
- Artefak: HEAD SHA (anchor), commit range sesi (`base..head`), files
  baru/diubah/dihapus, SHA per-fase kalau plan multi-fase.
- Environment/tooling/credential notes, open questions, deadline.
- Catatan tambahan user (dari percakapan — command tidak menerima argumen).
```

Sifat file: **append-only chain** — jangan pernah edit handoff lama;
`Lanjutan dari` hanya diisi kalau benar-benar kontinuasi (jangan mengarang);
jangan duplikasi checklist plan (plan = source of truth, handoff hanya
mencatat posisi).

Setelah file tertulis → **lapor user (laporan #1):** "file handoff selesai:
`<absolute path>`".

## 5. Protokol kirim (sender)

0. **Designation full-auto?** Guard dulu: cek READY target via `agent_status`. Tidak ready → designation BATAL, beri tahu user, fallback ke §3.
1. `agent_send(target=<R>, payload={kind:"prompt", body:<template di bawah>})`. Target offline → tetap terkirim (antre di inbox); sebutkan itu di laporan #2.
2. Pasang **one-shot timeout 10 menit** (CronCreate) berlabel "ACK handoff `<slug>`". Tool schedule tak tersedia → lanjut tanpa timeout otomatis, beri tahu user agar menyusulkan manual.
3. **Lapor user (laporan #2):** "handoff `<slug>` terkirim ke `<R>`, menunggu ACK".
4. **ACK diterima** → urutan WAJIB, jangan dibalik:
   1. Cancel cron timeout (CronDelete) — kalau tidak, cron akan fire ke session baru yang kosong dan membingungkan;
   2. **Lapor user (laporan #3):** "ACK diterima dari `<R>`, estafet resmi berpindah — saya reset";
   3. Self-reset via `pty_send_slash` TANPA target — TIGA injeksi berurutan:
      `/rename done-<slug>-<yyyymmddhhmm>` → `/clear` → `/rename idle`.
      PERINGATAN: JANGAN pakai `/new` — itu meta-command lapisan telegram
      (handler-nya menulis payload wrapper `/clear`+sessionName), TIDAK
      dikenal Claude Code; injeksi PTY `/new idle` gagal sebagai command
      invalid.
5. **Timeout fire tanpa ACK** → lapor user + buttons `[Kirim ulang] [Pilih bot lain] [❌ Cancel]`. JANGAN self-reset — estafet belum berpindah.
6. **R menolak (sibuk)** → lapor user penjelasan R + kembali ke §3.
7. **ACK datang terlambat** (setelah timeout): belum ada keputusan user → lanjutkan langkah 4 normal. User sudah memindahkan estafet ke bot lain → laporkan konflik ke user, JANGAN kirim apa pun ke R.

### Template body `agent_send` (isi placeholder `<...>`)

Substitusi SEMUA placeholder `<...>` dengan nilai literal SEBELUM mengirim —
termasuk `<slug>` di langkah 3-4: receiver tidak bisa merekonstruksinya
sendiri.

```
[HANDOFF] dari <S> — lanjutkan estafet pekerjaan.

1. Baca file handoff: <ABSOLUTE-PATH-FILE> — file INI persis; JANGAN cari
   "latest" di .handoff/ (bisa ada handoff paralel dari bot lain).
2. Repo kerja: <ABSOLUTE-PATH-REPO>. Kerjakan semuanya terhadap path ini.
3. Rename session-mu: pty_send_slash "/rename task-<slug>" (self, tanpa target).
4. ACK dua arah, WAJIB: (a) agent_send balik ke <S>, hop_count=<N+1>, body
   "ACK handoff <slug>"; (b) lapor ke user via telegram bahwa kamu menerima
   handoff <slug> dari <S> + ringkasan next-step yang akan kamu kerjakan.
5. Baca referensi bertanda "di awal" (playbook + plan terkait). Referensi
   kondisional dibaca hanya saat kondisinya terjadi.
6. Gate adaptif: section Blocker ≠ "—" → TANYA user dulu (inline buttons)
   sebelum eksekusi; selain itu langsung eksekusi section AKAN.
7. Kamu sedang TIDAK idle / sedang mengerjakan sesuatu → JANGAN terima:
   balas ke <S> via agent_send (hop_count=<N+1>) dengan penjelasan singkat,
   lalu lanjutkan pekerjaanmu sendiri.
8. Header Pair ≠ "—" → kamu mewarisi designation ping-pong: saat trigger-mu
   sendiri tercapai (task selesai / threshold context, lihat skill handoff
   §1), handoff balik ke partner secara full-auto.
```

### Legalitas terhadap aturan agent-bus (patuhi, jangan tafsirkan ulang)

- `agent_send` oleh S sah karena pilihan user di buttons / designation yang user setujui di muka ADALAH permintaan eksplisit user.
- ACK dari R sah terhadap anti-bounce rule: prompt S eksplisit meminta report-back (pengecualian #2), dan memakai `hop_count` naik.
- Self-reset memakai `pty_send_slash` self-target — kategori safe/autonomous; JANGAN pernah mengirim `/clear`/`/delete` ke peer dari skill ini.

## 6. Sisi receiver

Kamu menerima prompt `[HANDOFF] dari <S>` via agent-bus → jalankan
langkah-langkah di prompt itu persis. Ringkasan kewajiban:

baca file yang DITUNJUK (bukan latest) → `/rename task-<slug>` →
ACK dua arah (balik ke S + lapor user) → baca referensi "di awal" →
gate adaptif (Blocker ≠ `—` → tanya user dulu) → eksekusi AKAN →
warisi Pair bila ada. Sibuk → tolak dengan penjelasan (prompt langkah 7).

Larangan receiver: jangan edit/hapus file handoff atau plan; jangan walk
seluruh chain `Lanjutan dari` (satu hop, hanya bila konteks kurang); jangan
balas apa pun ke S selain ACK/penolakan yang diminta.

## Edge cases

- **Dua bot membuat handoff paralel di repo yang sama** — aman: path file eksplisit di prompt; collision filename ditangani suffix.
- **Bot yang di-designate keburu dipakai user** — guard §5.0 membatalkan designation, fallback pilihan manual.
- **Plan terkait hilang / branch berbeda / SHA yatim** — jangan gagal; catat di laporan/summary dan lanjutkan dari file handoff.
- **`/handoff` diketik dengan argumen** — abaikan argumennya, jalankan flow buttons normal.
- **Threshold tercapai berulang & user selalu Lanjutkan** — tawarkan lagi hanya di batas selesai-task berikutnya.
- **Bukan git repo** — fallback `pwd` + beri tahu user sekali (file `.handoff/` tetap dibuat di situ).

## Anti-patterns

- ❌ Self-reset SEBELUM ACK diterima, atau tanpa cancel cron lebih dulu.
- ❌ Menyuruh receiver membaca "latest handoff" alih-alih path eksplisit.
- ❌ Mengedit handoff lama / menduplikasi checklist plan ke dalam file.
- ❌ Melewatkan mandat README atau clarity check sebelum menulis file.
- ❌ Menawarkan handoff berkali-kali di tengah task yang sama (spam).
- ❌ `agent_send` tanpa basis permintaan/persetujuan user yang bisa ditunjuk.
- ❌ Receiver auto-bounce: membalas agent-bus di luar ACK/penolakan yang diminta prompt.
- ❌ Mengirim `/clear`/`/delete` ke peer; reset hanya self-target.
