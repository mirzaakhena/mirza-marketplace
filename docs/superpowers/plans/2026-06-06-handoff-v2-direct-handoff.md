# Handoff v2 — Direct Bot-to-Bot Handoff — Implementation Plan (arsip restorasi)

> **Catatan restorasi 2026-06-07:** plan asli (commit `a94c5b1`, ~640 baris,
> berisi konten verbatim seluruh file plugin) hilang bersama histori git pada
> insiden reclone marketplace (lihat playbook entry 2026-06-07). Plan tersebut
> SUDAH DIEKSEKUSI PENUH sebelum hilang — rilis `release(handoff): bump to
> 0.0.9` (commit asli `949ebd2`, juga hilang) — sehingga konten verbatimnya
> kini hidup langsung di file-file plugin. Dokumen ini adalah ringkasan
> arsip, bukan rekonstruksi penuh.

**Spec:** `docs/superpowers/specs/2026-06-06-handoff-v2-direct-handoff-design.md`

## Struktur plan asli (7 task, dieksekusi subagent-driven)

1. **Hapus handoff-resume** — `git rm commands/handoff-resume.md` + `skills/handoff-resume/`
2. **Rewrite `commands/handoff.md`** — bare-only, abaikan argumen, delegasi ke skill
3. **Rewrite `skills/handoff/SKILL.md`** — inti v2: §0 konvensi session, §1 kewajiban proaktif cek context, §2 mode buttons, §3 pilih bot, §4 file handoff (clarity check + mandat README + template + derivasi slug), §5 protokol kirim + template body agent_send + legalitas, §6 sisi receiver, edge cases, anti-patterns. Guard: frontmatter description <400 char
4. **Rewrite `skills/handoff/template.md`** — referensi manusia, sinkron §4
5. **Rewrite `plugins/handoff/README.md`** — dokumentasi v2
6. **Bump versi + catalog + root README** — checklist rilis 5-poin CLAUDE.md
7. **Verifikasi rilis + satu release commit atomik** — grep sisa referensi, validasi JSON, commit dengan trailer `Agent: bot-05`

## Riwayat eksekusi

- Implementer subagent: Task 1-6 verbatim ✅; spec-compliance reviewer: byte-exact ✅;
  quality reviewer: NEEDS_FIXES ringan → 3 fix (derivasi slug §4, substitusi
  placeholder eksplisit, threshold di catalog) ✅; release commit ✅.
- Follow-up: agent-bus refresh contoh (`0.0.7` asli), telegram `/handoff` di
  slash menu (`0.0.30-mirza.0` asli), inline-buttons aturan no-repeat
  (`0.0.7` asli).
- Restorasi 2026-06-07 dari cache plugin: handoff `0.0.11`, telegram
  `0.0.32-mirza.0`, inline-buttons `0.0.9`, agent-bus `0.0.9` — di atas tree
  anglicize `19f4ee7`.
