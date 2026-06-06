# Technical review — saran perbaikan per plugin

- **Tanggal:** 2026-06-06
- **Konteks:** hasil sampingan dari pekerjaan sinkronisasi README (sesi `bot-06`). Seluruh source code tiap plugin dibaca penuh; catatan ini merangkum temuan teknis yang konstruktif — bug kecil, inkonsistensi, dan peluang perbaikan. Bukan daftar wajib; prioritas ditandai.

Legenda prioritas: 🔴 bug nyata / berdampak user · 🟡 inkonsistensi / utang teknis · 🟢 nice-to-have.

---

## Lintas-repo

1. 🟡 **Tidak ada `.gitattributes`** — setiap commit dari Windows memunculkan warning `LF will be replaced by CRLF`. Tambahkan `* text=auto eol=lf` (atau setidaknya pin `*.ts`, `*.md`, `*.sh` ke LF) supaya checkout konsisten lintas mesin dan diff bersih.
2. 🟡 **Duplikasi logika registry** — `agent-bus/registry.ts` dan `pty-controller/wrapper/src/wrapper.ts` masing-masing punya implementasi load/persist/lock `agent-registry.json` sendiri (disengaja, "Option β"), dan `wrapper.ts` juga menduplikasi `setName` dari telegram. Tiga salinan kontrak yang sama = tiga tempat yang bisa menyimpang. Pertimbangkan paket internal kecil `@mirza/agent-registry` yang di-vendor ke kedua plugin, atau minimal test kontrak lintas-plugin.
3. 🟡 **`marketplace.json` drift** — deskripsi `handoff` masih menyebut "8-section markdown" (sekarang 10 section). Sesuai aturan CLAUDE.md sendiri, deskripsi katalog ikut diupdate saat perilaku berubah.
4. 🟢 **Konsistensi smoke test** — hanya plugin ber-MCP yang punya test. Untuk skill-only plugin, satu script lint kecil (validasi frontmatter SKILL.md: `name` cocok dengan folder, `description` non-kosong) akan menangkap typo murah.

---

## teach-me (v0.0.1)

5. 🟢 Tidak ada temuan teknis berarti — plugin prose murni dan koheren. Satu-satunya risiko adalah duplikasi narasi antara `plugin.json description`, frontmatter SKILL.md, dan README; sudah ditangani lewat aturan README-sync di CLAUDE.md.

## immediate-reply (v0.0.3)

6. 🟢 **Overlap dengan interactive-prompts** — keduanya mendefinisikan "pre-flight check" yang berdampingan (ack-sebelum-tool vs buttons-saat-bertanya) dan saling mereferensikan secara prosa. Pertimbangkan satu paragraf eksplisit "urutan eksekusi kedua check" di salah satu skill (ack dulu → kerja → reply final diaudit buttons), supaya AI tidak bingung mana yang dicek duluan.

## interactive-prompts (v0.0.3)

7. 🟡 **Dependency versi dinyatakan hanya di prosa** — "Requires telegram >= 0.0.9-mirza.0" hidup di `plugin.json description` saja. Claude Code belum punya mekanisme dependency antar plugin, tapi minimal skill bisa diberi instruksi fallback ("kalau tool reply tidak punya parameter buttons, kirim opsi sebagai teks bernomor") supaya degrade anggun di telegram versi lama.

## handoff (v0.0.4)

8. 🔴 **Salah rujuk section di command files** — `commands/handoff.md` bilang argumen user masuk "Section 7" padahal template menaruhnya di **Section 9** (Catatan User); `commands/handoff-resume.md` bilang "executing Section 6's plan" padahal next-step ada di **Section 5** (Akan). Keduanya melanggar kontrak yang SKILL.md sendiri tandai "do not edit without lockstep". Perbaikan satu baris masing-masing + bump versi.
9. 🟡 **Kontrak section hanya dijaga konvensi** — dua SKILL.md saling bergantung pada penomoran 10-section tanpa pengecekan. Script test kecil yang mem-parse `template.md` dan mencocokkan heading `## N.` dengan daftar yang direferensikan handoff-resume akan membuat drift seperti temuan #8 gagal di CI, bukan ditemukan manual.

## daily-report (v0.0.1)

10. 🔴 **`pbcopy` macOS-only** — langkah persist memipakan report ke `pbcopy`, padahal mesin utama saat ini Windows (`clip.exe`) dan Linux (`xclip`/`wl-copy`). Di Windows, step ini error setiap kali. Saran: deteksi platform di command/skill ("pbcopy || clip.exe || xclip") atau jadikan clipboard best-effort dengan pesan jelas.
11. 🟡 **Rujukan silang ke handoff salah section** — `writing-daily-report` SKILL.md rule 9 & step 4 menyebut "handoff Section 6 (Apa yang Akan Dikerjakan…)"; di template handoff yang sekarang itu **Section 5**. Sumber drift yang sama dengan temuan #8.
12. 🟡 **Pemilihan commit tier-1 bergantung mtime arsip** — `gather-context.sh` memakai mtime file terakhir di `.daily-reports/` sebagai batas "sejak kapan". Sentuhan tak sengaja (sync tool, checkout) menggeser batas dan diam-diam memotong/menggandakan commit. Lebih kokoh: simpan timestamp run terakhir di dalam file arsip (header) dan parse itu.

## agent-bus (v0.0.3)

13. 🔴 **Hop-limit tidak berlaku untuk prompt** — `writePromptToPending` menulis payload `{type:"prompt", from, text}` **tanpa `hop_count`**, sehingga guard `hop_count > 5` di wrapper selalu melihat 0. Pencegahan loop prompt antar bot saat ini 100% bergantung pada kepatuhan skill anti-bounce (LLM-enforced, bukan kode). Saran: sertakan dan inkremen `hop_count` di prompt payload juga — murah dan menutup loop nyata.
14. 🟡 **Semantik offline tidak konsisten dengan pty-controller** — `agent_send` (agent-bus) tetap menulis ke inbox peer offline (queued, `online:false` di hasil), sedangkan `pty_send_slash` dengan target peer **menolak** peer offline. Dua tool dengan mental model berbeda untuk kasus yang sama; pilih satu (saran: queued + warning, seperti agent-bus) dan samakan.
15. 🟡 **Versi server hardcoded** — `new Server({version:'0.0.3'})` di server.ts harus diingat manual tiap bump. Baca dari `.claude-plugin/plugin.json` saat boot (pty-controller punya pola `readPluginVersion` di telegram yang bisa ditiru).
16. 🟢 **`validatePayload` di inbox-writer vs schema MCP** — validasi ganda (schema tool + writer) bagus, tapi pesan error writer ("prompts are sent via prompt-compose") membocorkan detail internal ke model. Tidak berbahaya, hanya noise.

## pty-controller (v0.0.23)

17. 🟡 **Busy-wait spin di wrapper memblokir event loop** — `acquireRegistryLock` dan retry `persistRegistry` memakai `while (Date.now() < until) {}`. Selama spin (hingga ~2 detik di lock timeout), pipa PTY ↔ stdout dan keystroke user ikut beku. Ganti dengan `await setTimeout()` (fungsi-fungsi ini bisa dibuat async — pemanggilnya interval callback).
18. 🟡 **Fire-and-forget tanpa ack** — komentar di `ipc.ts` menyebut "wrapper echoes this back in its ack file (future)". Saat ini AI tidak pernah tahu apakah slash command benar-benar diinjeksi (hanya "queued"). File ack per-id (atau folder `done/`) akan membuat `pty_send_slash` bisa di-poll dan error muncul ke user, bukan hilang di log wrapper.
19. 🟡 **Konsumsi inbox delete-before-process** — `consumePending` menghapus file sebelum dispatch; crash di tengah berarti command hilang tanpa jejak. Trade-off sadar (anti double-process), tapi pola `rename ke processing/` memberi dua-duanya: tidak double, tidak hilang.
20. 🟢 **Versi MCP server hardcoded `0.0.1`** — sama dengan temuan #15; plugin.json sudah 0.0.23.
21. 🟢 **Konstanta pacing empiris** (`CHUNK_SIZE`, `CHUNK_DELAY_MS`, `SUBMIT_DELAY_MS`, `POST_INJECTION_DELAY_MS`) tersebar sebagai magic numbers yang sudah terdokumentasi baik — pertimbangkan mengangkatnya ke env override supaya tuning di mesin lambat tidak perlu rebuild.

## telegram (v0.0.25-mirza.0)

22. 🔴 **Chunking bisa merusak MarkdownV2** — di handler `reply`, konversi CommonMark→MV2 dilakukan **sebelum** `chunk()`. Pesan berformat yang melebihi `textChunkLimit` bisa terbelah di tengah entity (`*bold` terbuka di chunk 1, tertutup di chunk 2) → Telegram menolak chunk dengan "can't parse entities" dan reply gagal sebagian. Saran: chunk dulu di level CommonMark per paragraf, konversi per chunk; atau minimal fallback kirim plain-text saat parse error per chunk.
23. 🟡 **`server.ts` 2.146 baris** — inbound handlers, callback router (3 namespace), system-outbox, access watcher, polling loop, dan 5 tool handler dalam satu file. Modul-modul lain sudah dipisah rapi; lanjutkan: `inbound.ts`, `callbacks.ts`, `tools.ts`, `polling.ts`. Akan menurunkan biaya tiap perubahan berikutnya (file ini yang paling sering diedit).
24. 🟡 **State picker in-memory** — `switchPicker`/`deletePicker`/`archivePicker` dan snapshot bulk hilang saat server restart; tap setelah restart jadi "picker expired". Sudah disadari di komentar. Kalau mau lebih halus: persist ringan ke state dir, atau embed `sessionId` penuh di callback_data (muat dalam 64 byte untuk UUID).
25. 🟡 **`/status` menunggu 5 detik flat** setelah install bridge, lalu render apapun kondisinya. Polling `last-status.json` tiap 500ms dengan timeout (mis. 15s) memberi jawaban secepat data tersedia dan pesan gagal yang jujur saat tidak.
26. 🟡 **`messages.db` tumbuh tanpa batas** — tidak ada retensi/pruning. Untuk bot personal mungkin tahunan baru terasa, tapi satu kebijakan sederhana (mis. `DELETE WHERE ts < now-180d` saat boot, atau VACUUM bulanan) murah ditambahkan sekarang.
27. 🟢 **`session-change` hanya ke `allowFrom[0]`** — by design single-user; cukup dicatat di README (sudah) dan dipertimbangkan ulang kalau group support dipakai serius.
28. 🟢 **Penamaan internal `/delete` vs handler `handleArchive`** — sudah ditandai "slated for a future rename pass" di komentar; layak dieksekusi sekalian saat refactor #23 supaya callback prefix (`meta:archive_*` untuk soft delete) tidak menyesatkan pembaca baru.

---

## Ringkasan prioritas

| Prioritas | Temuan |
|---|---|
| 🔴 Kerjakan duluan | #8 (handoff salah section), #10 (pbcopy di Windows), #13 (hop-limit prompt), #22 (chunk vs MarkdownV2) |
| 🟡 Utang teknis bernilai | #1, #2, #3, #9, #11, #12, #14, #15, #17, #18, #19, #23, #24, #25, #26 |
| 🟢 Opsional | #4, #5, #6, #7, #16, #20, #21, #27, #28 |
