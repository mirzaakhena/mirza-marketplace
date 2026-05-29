# Agent-Bus One-Way Prompt Delivery — Design Spec

**Date:** 2026-05-29
**Status:** Approved for implementation
**Scope:** Extend agent-bus with one-way natural-language prompt delivery (leader → worker, broadcast). Supersedes the `kind:"prompt"` + `kind:"reply"` half of the 2026-05-22 bot-to-bot design — the `reply` protocol is dropped entirely.

**Supersedes:** the Phase 2 portion of `2026-05-22-bot-to-bot-communication-design.md`. Phase 1 (slash-only, shipped) is unchanged. This spec replaces the two-way prompt/reply plan with a simpler one-way prompt mechanism.

---

## 1. Background & Motivation

Mirza menjalankan beberapa Claude Code instances paralel (bot-01 .. bot-05), masing-masing di workspace folder terpisah, masing-masing terhubung ke Telegram + pty-controller. Phase 1 (shipped 2026-05-22) sudah memungkinkan satu bot mengirim **slash command** satu arah ke peer via inbox file yang dikonsumsi wrapper.

Yang ingin di-unlock sekarang: satu bot ("leader") bisa mengirim **instruksi natural language** ke satu atau banyak peer ("worker") sekaligus, lalu worker mengerjakannya. Use case: koordinasi leader/worker — satu pintu komando, leader fan-out tugas ke worker.

**Keputusan kunci yang membedakan dari rancangan 2026-05-22:** komunikasi tetap **satu arah**. Tidak ada protokol reply / correlation pairing. "Balasan" — bila leader memang menginginkannya — dicapai dengan leader menyelipkan instruksi di dalam prompt ("...lapor balik ke bot-01"), dan worker mengirim satu prompt one-way kembali memakai primitive yang sama. Tidak ada `kind:"reply"`, tidak ada `correlation_id` matching.

Alasan menolak two-way reply protocol:
- Risiko loop tak terbatas (A→B→A→B) bila reply memicu reply.
- Kompleksitas tambahan (correlation pairing, "AI tahu harus balas ke siapa") tanpa manfaat sepadan untuk use-case leader/worker.

Loop dicegah dua lapis tanpa melarang balasan: (1) **disiplin skill** "incoming agent message is terminal context, jangan auto-bounce", (2) **hard cap `hop_count`** sebagai backstop.

## 2. Architecture Overview

```
LEADER (bot-01)                         WORKER (bot-02)
────────────────                        ────────────────
agent_send(                             bot-02/.claude/channels/
  target: ["bot-02","bot-03"],            agent-bus/inbox/<uuid>.json   ← tulis
  payload:{kind:"prompt",body:"..."})         │ fs.watch (+ sweep fallback)
        │ resolve target di registry           ▼
        └─ tulis 1 file per target ──────→ agent-bus MCP server (di dalam CC bot-02)
                                                │ emit notifications/claude/channel
                                                │   { source:"agent", from, body, ts }
                                                │ lalu hapus file inbox
                                                ▼
                                          AI bot-02 lihat:
                                          <channel source="agent" from="bot-01" ...>
                                          → perlakukan seperti pesan user → auto-eksekusi

Slash path (existing, TIDAK berubah):
agent_send(kind:"slash") → peer pty-controller/pending/<uuid>.json → wrapper inject ke PTY
```

**Dua jalur terpisah, dua owner berbeda:**
- **Prompt** → inbox `agent-bus/inbox/` → dikonsumsi **agent-bus MCP server** (di dalam CC).
- **Slash** → inbox `pty-controller/pending/` → dikonsumsi **wrapper** (parent PTY).

Pemisahan ini adalah inti loose-coupling: pty-controller tidak perlu tahu apa-apa tentang prompt; agent-bus memiliki jalur prompt-nya end-to-end.

**Koreksi terhadap rancangan 2026-05-22:** rancangan lama menyatakan "wrapper emit `notifications/claude/channel`". Itu **tidak feasible** — wrapper adalah parent process di luar CC (terhubung via PTY/terminal), bukan MCP server, sehingga tidak bisa mengirim notifikasi MCP. Notifikasi `notifications/claude/channel` hanya bisa di-emit oleh MCP server yang berjalan di dalam CC (lihat `plugins/telegram/server.ts` — `mcp.notification({ method: 'notifications/claude/channel', ... })`). Karena itu pengantaran prompt menjadi tanggung jawab **agent-bus MCP server**, bukan wrapper.

**Trust model:** Open — semua agent terdaftar di registry saling percaya. Single-user single-machine; filesystem ownership = trust boundary. Tanpa HMAC, tanpa allowlist. Prompt masuk di-auto-eksekusi worker seperti pesan user.

## 3. Component Changes

### 3.1 agent-bus MCP server — menjadi proses long-lived dengan background watcher

Saat ini agent-bus adalah MCP server stateless (3 tool: `agent_list`, `agent_status`, `agent_send`). Perubahan:

**a. `agent_send` menerima `kind:"prompt"`** (selain `kind:"slash"` yang sudah ada):
- `payload: { kind:"prompt", body: string }`
- `target: string | string[]` (broadcast first-class)
- Untuk prompt → tulis file ke **inbox milik agent-bus** di peer: `<peer>/.claude/channels/agent-bus/inbox/<uuid>.json` (atomic tmp+rename).
- Untuk slash → tetap tulis ke `<peer>/.claude/channels/pty-controller/pending/` (existing, tak berubah).

**b. Background inbox watcher (BARU)** — mirror pola telegram (`fs.watch` + sweep interval fallback):
- Watch `<self>/.claude/channels/agent-bus/inbox/`.
- Pada file prompt baru: validasi → emit `notifications/claude/channel` dengan `source="agent"` → hapus file.
- `fs.watch` dengan defer ~50ms (Windows tmp-rename commit), plus sweep interval 2s sebagai fallback (Windows fs.watch quirk).
- **Startup sweep:** saat boot, scan inbox dulu untuk consume backlog (prompt yang tiba saat worker offline), max 50 file; sisanya pindah ke `inbox/.overflow/`.

**c. Self state dir:** agent-bus resolve state dir-nya sendiri dari `CLAUDE_PROJECT_DIR` (`<project>/.claude/channels/agent-bus/`), konsisten dengan plugin lain.

### 3.2 pty-controller / wrapper — TIDAK disentuh

Jalur slash tetap apa adanya. Wrapper tidak perlu tahu tentang `kind:"prompt"`. Ini menyederhanakan implementasi dan mempertahankan loose-coupling.

### 3.3 Skill `using-agent-bus` — diperluas (lihat §6)

### 3.4 Registry global (`~/.claude/agent-registry.json`) — TIDAK berubah

Sudah ada dari Phase 1. agent-bus membaca untuk resolve target & status; wrapper menulis (register/heartbeat/unregister).

## 4. Inbox Schema (agent-bus/inbox)

```typescript
type AgentInboxMessage = {
  id: string                    // UUID
  ts: string                    // ISO timestamp
  from: string                  // sender agent name (harus terdaftar di registry)
  kind: "prompt"                // hanya "prompt" di inbox ini; slash pakai inbox pty-controller
  body: string                  // natural-language payload, max 8 KB
  hop_count: number             // default 0, increment tiap forward; cap 5
  broadcast_group_id?: string   // penanda opsional; di-set bila berasal dari satu call broadcast
}
```

**Validasi (saat tulis oleh sender, dan saat consume oleh receiver):**
- `kind` harus `"prompt"`. (Inbox agent-bus hanya untuk prompt. `kind:"reply"` tidak ada.)
- `body` string non-kosong, ≤ 8 KB. Lebih → tolak (sender) / reject ke `.rejected/` (receiver).
- `from` harus terdaftar di registry.
- `hop_count` ≤ 5; lebih → drop + log.

**Channel tag yang dilihat AI worker** (mirror pola telegram, schema `notifications/claude/channel` mensyaratkan `meta: Record<string,string>`):

```xml
<channel source="agent" from="bot-01" ts="2026-05-29T04:00:00Z">
tolong review file X dan lapor ke aku
</channel>
```

`content` = `body`. `meta` membawa `from`, `ts`, `kind`, `broadcast_group_id` (semua string).

## 5. Tool Surface — `agent_send` (final)

```
agent_send(
  target: string | string[],
  payload:
      { kind:"prompt", body: string }
    | { kind:"slash", command: string, args?: string,
        sessionName?: string, confirmAfterMs?: number }
)
```

**Routing berdasarkan kind:**
- `kind:"prompt"` → tulis ke tiap target `agent-bus/inbox/`.
- `kind:"slash"` → tulis ke tiap target `pty-controller/pending/` (existing path, unchanged).

**Broadcast (first-class):**
- `target` array → tulis satu file ke inbox masing-masing target, semua berbagi `broadcast_group_id` yang sama.
- Resolve tiap target di registry. **Fail-soft per target:** offline → tetap tulis (antri di inbox; dikonsumsi saat boot) + tandai warning; tak terdaftar → skip + laporkan.
- Return: `{ broadcast_group_id?, results: [{ target, ok, path?|error?, online }] }`.

**Blast-radius guard (dipertahankan dari Phase 1):** slash destruktif (`/clear`, `/delete`) ke `target` array tetap **ditolak**. Prompt ke banyak target diizinkan (tidak destruktif).

**`agent_send` user-triggered only.** `agent_list` / `agent_status` boleh dipanggil autonomous (read-only).

## 6. Skill `using-agent-bus` (Extended)

**Aturan anti-bounce (KUNCI cegah loop):**
> Pesan masuk `<channel source="agent">` adalah **terminal context**, bukan trigger otomatis. AI **TIDAK BOLEH** memanggil `agent_send` sebagai respons terhadap pesan agent, KECUALI:
> (a) user secara eksplisit memintanya, ATAU
> (b) body prompt yang masuk secara eksplisit menyuruh ("...lapor balik ke bot-01").
> Default: kerjakan tugasnya, lapor ke Telegram sendiri, lalu BERHENTI.

**Pattern leader fan-out:**
1. User minta leader mengkoordinir.
2. Leader `agent_list` (cek siapa online).
3. Leader `agent_send` broadcast prompt ke worker terpilih.
4. Leader lapor ke user: "terkirim ke N worker (sebutkan yang offline)".
5. Worker mengerjakan → lapor ke Telegram masing-masing.
6. (Opsional) Bila leader ingin hasil terkumpul: selipkan "lapor balik ke bot-01" di body. Worker kirim SATU prompt balik → leader rangkum ke user → STOP (tidak bounce lagi).

**Anti-patterns:**
- Jangan kirim ke peer offline tanpa memberi tahu user.
- Jangan inisiatif autonomous mengirim prompt tanpa permintaan user.
- Jangan kirim `body` > 8 KB.
- Jangan auto-balas pesan agent (lihat aturan anti-bounce).

## 7. Error Handling

| Kasus | Aksi |
|---|---|
| Target tidak terdaftar di registry | `agent_send` error + daftar agent available |
| Target offline (heartbeat > 30s) | tetap tulis (akan dikonsumsi saat boot) + warning ke caller |
| `body` > 8 KB | tolak di sisi sender; bila lolos, receiver reject |
| `hop_count` > 5 | drop file + log warning |
| File malformed / skema invalid | pindah ke `agent-bus/inbox/.rejected/<uuid>.json` (+ sidecar `.reason.txt` opsional) |
| Backlog menumpuk saat boot | consume max 50; sisanya pindah `agent-bus/inbox/.overflow/` |
| Concurrent registry read | registry read-only di agent-bus; tak ada write race dari sisi ini |

## 8. Testing Strategy

- **Unit:** validasi payload prompt (kind, body non-empty, batas 8 KB), hop cap, fan-out menulis N file, `broadcast_group_id` konsisten lintas target, routing prompt→agent-bus-inbox vs slash→pty-pending.
- **Integration:** 2-bot loopback di temp dir — kirim prompt → watcher consume → verifikasi `notifications/claude/channel` ter-emit (mock notification sink), file inbox terhapus.
- **Manual smoke:** Mirza jalankan bot-01 + bot-02 real, broadcast prompt, verifikasi muncul sebagai inbound di CC worker dan AI mengerjakannya.

## 9. Non-Goals (Explicit)

- ❌ Protokol reply / `correlation_id` pairing (dibuang — diganti prompt one-way + disiplin anti-bounce).
- ❌ Multi-agent autonomous deliberation (v3 territory pada doc 2026-05-22).
- ❌ Cross-machine bot mesh.
- ❌ HMAC / cryptographic message authentication.
- ❌ Perubahan apa pun pada wrapper / pty-controller untuk jalur prompt.

## 10. Open Questions

1. **Persistensi proses agent-bus MCP server** — agent-bus harus tetap hidup selama sesi CC agar watcher jalan dan notifikasi bisa di-emit. CC menjaga MCP server (stdio) tetap hidup selama sesi (terbukti di telegram). Konfirmasi saat implementasi bahwa background watcher di MCP server tidak diganggu lifecycle CC.
2. **Pengantaran saat worker mid-turn** — bila AI worker sedang sibuk, notifikasi antri (perilaku sama seperti telegram). Tidak perlu penanganan khusus.
3. **Backlog threshold** — cap 50 file saat boot; threshold optimal di pemakaian nyata akan dievaluasi.
4. **Skill placement** — `using-agent-bus` tetap di plugin `agent-bus/` sendiri.

## 11. Versioning

- `agent-bus` `0.0.1` → `0.0.2` (minor: tambah `kind:"prompt"` + background inbox watcher + notification emitter).

## 12. Dependencies

- Existing `pty-controller` (registry + slash path, tidak dimodifikasi).
- Existing `telegram` (untuk `last-status.json` consumption oleh `agent_status` — opsional, graceful degrade).
- Pola notifikasi MCP mengikuti `plugins/telegram/server.ts`.

---

**Sign-off:** spec disetujui oleh Mirza pada 2026-05-29 setelah 4 clarifying questions + 1 keputusan arsitektur (Approach A: agent-bus MCP server sebagai consumer & emitter prompt) + 3 design sections (semua approved tanpa revisi).

Next step: writing-plans skill untuk decompose menjadi implementation tasks.
