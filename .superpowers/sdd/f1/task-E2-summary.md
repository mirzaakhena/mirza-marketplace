# Task E2 Fase 1 — Ringkasan Centang Inventaris (berdasar bukti E1)

**Tanggal:** 2026-07-04 · **Dasar:** `.superpowers/sdd/f1/task-E1-findings.md` bagian "Bukti E1" (uji live bot-07 @mirza_botseven_bot, hostd pid 32008).

## telegram.md (TG-001..189)

- **Verified-live `[x]`: 24 item**
- **DIHAPUS `[x]`: 3 item** — TG-086, TG-087, TG-088 (edit_message, design doc §10.5)
- **DIGANTI `[x]`: 4 item** — TG-065 (jadi 4 tools), TG-137 (logEdit dihapus, kolom metadata dipertahankan), TG-146, TG-147 (keduanya: supervisi hostd, SCAR-050)
- **Total dicentang kali ini: 31 item**
- **Sisa `[ ]`: 158 item**

### Daftar lengkap item yang disentuh di telegram.md (31 item)
- Verified-live (24): TG-066, TG-067, TG-068, TG-082, TG-083, TG-085, TG-092, TG-093, TG-094, TG-109, TG-110, TG-112, TG-113, TG-114, TG-116, TG-118, TG-120, TG-121, TG-126, TG-127, TG-133, TG-135, TG-138, TG-173
- DIHAPUS (3): TG-086, TG-087, TG-088
- DIGANTI (4): TG-065, TG-137, TG-146, TG-147

Sisa 189 − 31 = **158 item tersisa untuk fase 2** (meta-commands TG-017..055, statusline TG-165..170, hooks TG-159..164, session registry TG-175..185, skills TG-186..189, group-flow, quote extraction TG-111, chunking/markdown TG-072..081, dan item lain yang belum ter-exercise live).

## agent-bus.md (BUS-001..047)

- **Verified-live `[x]`: 4 item** — BUS-016, BUS-023, BUS-026, BUS-028
- **DIGANTI `[x]`: 1 item** — BUS-025 (fence token mesin menggantikan marker teks lama, SEC-4 fixed)
- **Total dicentang: 5 item**
- **Sisa `[ ]`: 42 item** — termasuk agent_list/agent_status (BUS-001..015, tidak diuji live terhadap fleet nyata), sebagian besar validasi agent_send (target normalization, body validation/limit, newline flattening, hop>5 refusal, broadcast, error wrapping — hanya happy-path self-send yang teruji), seluruh kontrak registry (BUS-033..036) dan skill using-agent-bus (BUS-037..047, konten skill/perilaku AI, bukan mekanisme yang diuji E1).

## scar-tissue.md (hanya item yang diminta disentuh)

- **SCAR-050**: `[x] DIGANTI` — supervisi hostd proses tunggal per mesin (design doc §4.5).
- **SCAR-055**: `[x]` — masih relevan, ditangani sama (sort ASC), diuji live (bukti #5).
- **SCAR-056**: `[x]` — masih relevan, ditangani sama (serialisasi manual string-only), diuji live (bukti #5).
- **SCAR-057, SCAR-058**: `[x] MOOT` — edit_message dihapus §10.5, kedua scar jadi tidak berlaku lagi (kecuali edit internal append-label TG-128 belum ter-port/ter-uji).
- Item SCAR lain (001-049, 051-054, 059-097) **TIDAK disentuh** sesuai instruksi cakupan.

## Catatan konservatisme yang diterapkan

- Group-flow, quote extraction (TG-111), chunking/markdown outbound (TG-072..081), single-photo non-album handling (TG-105..108), permission-reply flow (TG-129..131), meta-commands (fase 2) — **sengaja dibiarkan `[ ]`** karena tidak ter-exercise di bukti E1 atau eksplisit di luar cakupan fase ini.
- Beberapa item bundel multi-field (mis. TG-109/110/121/135) dicentang `[x]` dengan anotasi eksplisit menyebut sub-field yang BELUM diuji (terutama quote_text/quote_is_manual) — bukan klaim penuh atas seluruh field yang dideskripsikan.
- agent_list/agent_status (BUS-001..015) sengaja TIDAK dicentang — tidak dipanggil sama sekali di E1.
