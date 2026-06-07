# Handoff Template (v2)

File ini mendokumentasikan struktur file handoff v2 untuk pembaca manusia.
Skill `handoff` men-generate output mengikuti bentuk ini — skill TIDAK
me-load file ini saat runtime.

```markdown
# {Title in Title Case}

**Date:** YYYY-MM-DD HH:MM ({TZ})
**Repo kerja:** {ABSOLUTE path repo proyek}
**Branch:** {git branch} (HEAD: {short SHA})
**Dari → Ke:** {bot-pengirim} → {bot-penerima | —}
**Pair:** {bot-A ⇄ bot-B | —}
**Lanjutan dari:** `.handoff/{file sebelumnya}` | —
**Plan terkait:** `path/to/plan.md` — fase {N}/{total} | —

---

## 1. Tujuan Handoff
Kenapa handoff dibuat (threshold context / task selesai tapi ada lanjutan /
perintah user) + goal estafet satu kalimat.

## 2. Konteks Proyek
2-4 kalimat: domain, stack, isi repo.

## 3. Yang Sudah Selesai (SUDAH)
- Action verb + objek konkret; SHA/path inline; verified vs baru ditulis.

## 4. Yang Sedang Dikerjakan (SEDANG)
- State mid-flight di luar git. (`—` kalau bersih.)

## 5. Blocker
- Hambatan + KENAPA menghambat + apa yang membukanya. (`—` kalau tidak ada.)
- ≠ `—` → receiver wajib tanya user dulu (gate adaptif).

## 6. Yang Akan Dikerjakan (AKAN)
**Goal:** satu kalimat. Langkah konkret + starting point.

## 7. Referensi
| Referensi | Kapan dibaca |
|---|---|
| playbook (WAJIB) | Di awal |
| plan/tasks lintas-session (WAJIB bila ada) | Di awal — posisi fase N/total |
| spec / doc lain | Kondisional ("saat butuh rationale", "HANYA saat error X") |

Jangan tulis ulang isi referensi; setiap baris wajib punya "kapan dibaca".

## 8. Keputusan User Lewat Brainstorming
| Pertanyaan | Pilihan User | Konsekuensi | (`—` bila kosong)

## 9. Anti-Patterns / Lessons (CARRY FORWARD)
- ❌ / ✅ + alasan. (`—` bila kosong.)

## 10. Catatan Lain
Artefak (HEAD SHA, commit range, files), environment, open questions,
deadline, catatan user dari percakapan.
```

Konvensi nama session yang menyertai protokol ini: `idle` →
`task-<slug>` → `done-<slug>-<yyyymmddhhmm>` → `/clear` + `/rename idle`;
READY = session `idle` + context < 10%. Detail penuh di
`skills/handoff/SKILL.md`.
