### Task E3': centang inventaris PTY-*/BUS-*/SKILL-* + laporan fase

Pola E2 fase 1: verified-live only; DIHAPUS/DIGANTI beralasan (kandidat: PTY-028..038 file-IPC → DIGANTI bus/shim; pty_list_agents → DIGANTI agent_list per CONS-3 — butuh restu #4; LOSS-1 items; rename-sniff items). Update plan + laporan penutup.

---

## Keputusan yang diangkat ke user di gate plan ini

1. **Runtime pty-holder** — node-pty adalah native module; wrapper lama teruji jalan di **Node** (tsx), BUKAN Bun (SCAR-096). Rekomendasi: pty-holder jalan di **Node** (paling aman, kode spawn teruji), sisanya tetap Bun. Alternatif: coba Bun dulu (node-pty support eksperimental), fallback Node bila gagal di P1.
2. **Bot pilot fase 2** — design doc menyarankan bot-02. Pertimbangan: bot-02 = penyusun design doc (sesi penting), bot-03 (aku) sedang mengeksekusi. Rekomendasi: **bot-05 atau bot-06** (paling jarang dipakai — risiko rendah); bot-02 bila mau uji beban nyata.
3. **Konsolidasi skill reply-discipline (CONS-1)** — rekomendasi: mekanisme hook (H2 + pointer 1-baris) di fase 2, merge teks skill immediate-reply+inline-buttons di fase 3 (bareng audit skill §11.4).
4. **`pty_list_agents` DIHAPUS/DIGANTI `agent_list`** (CONS-3) — butuh persetujuan eksplisit (aturan inventaris).

## Keputusan gate (2026-07-05, disetujui user via Telegram)
1. Runtime pty-holder: **Node** (node-pty teruji; sisanya Bun) — FINAL.
2. Bot pilot: **bot-06** — FINAL.
3. reply-discipline: hook fase 2, merge teks skill fase 3 — FINAL.
4. pty_list_agents: **DIGANTI agent_list** (CONS-3) — FINAL.
