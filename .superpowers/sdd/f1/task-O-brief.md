### Task O (paralel, bersama user): sesi desain Obsidian second-brain

Bukan koding. Susun bersama user (§11.5): kapan bot baca vault sebelum kerja, kapan/format setor pelajaran, kaitan dgn playbook-split. Output: design note di docs/ untuk diimplementasi setelah disepakati. Gaya teach-me + inline buttons.

---

## Keputusan desain yang diangkat ke user di gate plan ini

1. **Titik validasi tunggal** (ambiguitas inventaris #2) — rekomendasi: zod di boundary hostd (IPC+bus+inbound); internal percaya DB.
2. **Penyimpanan token bot** — rekomendasi: `hostd.config.json` di luar git (env `MIRZA_HOSTD_CONFIG`), parser CRLF-safe; bukan `.env` per-bot tersebar.
3. **TG-137 logEdit** — rekomendasi: tidak diport (ikut §10.5), kolom metadata dipertahankan.
4. **pid-file takeover poller** — rekomendasi: `DIGANTI` oleh supervisi hostd (satu proses per mesin).
Sisanya (ACK bus, INFRA-5, marker SEC-4) sudah diputuskan design doc — tinggal eksekusi.
