# handoff

**Direct bot-to-bot handoff** untuk Claude Code multi-bot. Bot yang sedang
bekerja menyerahkan estafet ke bot idle secara langsung — file handoff →
prompt agent-bus → ACK dua arah → self-reset — tanpa mediasi user per
langkah. User mendapat laporan Telegram di tiap tahap dan bisa interupsi
kapan pun. Skill-only — tidak ada MCP server, tidak ada hook.

> v2 menggantikan model lama dua command (`/handoff` + `/handoff-resume`).
> `/handoff-resume` DIHAPUS; resume kini terjadi otomatis di bot penerima,
> atau via bahasa natural ("lanjutkan handoff `<path>`") untuk file-only.

## Slash command

| Command | Fungsi |
|---|---|
| `/handoff` | Bare-only (tanpa argumen). Memunculkan inline buttons dua step: pilih mode, lalu pilih bot tujuan. |

**Step 1 — mode:** `[🚀 Now] [⏭️ After this task] [🏓 Ping pong] [📄 File only] [❌ Cancel]`

- **Now** — handoff sekarang juga.
- **After this task** — penunjukan one-shot: lanjut kerja, handoff otomatis (full-auto, notifikasi saja) saat task selesai atau threshold context tercapai.
- **Ping pong** — pasangan tetap dua bot saling estafet; kontrak menular lewat header `Pair` di file handoff.
- **File only** — tulis file handoff tanpa mengirim ke bot mana pun (use-case lama: berhenti, lanjut kapan-kapan).

**Step 2 — bot:** daftar peer + statusnya (✅ idle / ⛔ sibuk / ⚠️ nama manual / 📴 offline), buttons nama bot.

## Trigger proaktif

Setiap selesai task substansial bot mengecek `agent_status` dirinya:
model 1M → threshold **35%**, model 200k → **75%** (boleh terlampaui selama
task masih berjalan). Lewat threshold → bot menawarkan `[🤝 Handoff]
[▶️ Lanjutkan]`, atau langsung jalan bila ada designation aktif.

## Konvensi nama session

`idle` (standby, READY bila ctx <10%) → `task-<slug>` (sedang kerja) →
`done-<slug>-<yyyymmddhhmm>` (arsip) → `/new idle`. Nama manual oleh user =
unknown (tidak pernah dipilih otomatis). Konvensi ini sekaligus menjadi
detektor idle antar bot via `agent_status`.

## Protokol estafet

1. Sender: clarity check → **update README repo kerja** → tulis file `<repo-kerja>/.handoff/<yyyymmddhhmm>-prompt-<slug>.md` → lapor user.
2. Sender → receiver via `agent_send`: path file **eksplisit** (bukan "latest"), repo kerja, instruksi ACK dua arah + gate adaptif.
3. Timeout ACK 10 menit (one-shot cron). ACK masuk → cancel cron → lapor user → self-reset (`/rename done-…` → `/new idle`). Timeout → tawarkan `[Kirim ulang] [Pilih bot lain] [❌ Cancel]`.
4. Receiver: baca file → `/rename task-<slug>` → ACK ke sender + lapor user → eksekusi (kalau section Blocker terisi → tanya user dulu). Sibuk → tolak dengan penjelasan.

`/delete hard all` (bersih-bersih arsip session) tetap manual oleh user.

## File handoff

Header: `Repo kerja` (absolute), `Dari → Ke`, `Pair`, `Lanjutan dari`
(chain append-only), `Plan terkait` (fase N/total). 10 section: Tujuan
Handoff, Konteks Proyek, SUDAH, SEDANG, Blocker (+kenapa), AKAN,
**Referensi** (tabel `path → kapan dibaca`; playbook wajib; tidak menulis
ulang isi referensi), Keputusan Brainstorming, Anti-Patterns, Catatan Lain.
Lihat `skills/handoff/template.md`.

## Dependensi runtime

Plugin lain yang dipakai skill ini saat beraksi: `agent-bus` (≥0.0.6),
`pty-controller` (self-target slash), `telegram` + `inline-buttons`
(buttons), schedule one-shot harness untuk timeout. Tanpa mereka skill
terdegradasi (mis. tanpa timeout otomatis) tapi tidak merusak.

## Spec & rationale

`docs/superpowers/specs/2026-06-06-handoff-v2-direct-handoff-design.md`
(di root repo marketplace ini) — keputusan desain, edge cases, acceptance
criteria.
