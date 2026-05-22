# Bot-to-Bot Communication — Design Spec

**Date:** 2026-05-22
**Status:** Approved for v1 implementation
**Scope:** v1 only (Phase 1 + Phase 2). v2/v3 documented as roadmap.

---

## 1. Background & Motivation

Mirza menjalankan beberapa Claude Code instances secara paralel (bot-01 .. bot-05), masing-masing di workspace folder terpisah dan masing-masing terhubung ke Telegram + pty-controller plugin. Saat ini setiap bot beroperasi terisolasi — user harus berpindah-pindah konteks chat untuk berkoordinasi antar bot.

Use case yang ingin di-unlock:
- User di bot-01 bisa minta "buatkan handoff untuk bot-02 lalu minta dia jalankan `/handoff-resume`".
- Satu bot bisa dijadikan "leader" yang menyalurkan komando ke peer (`/new <name>`, `/effort high`, dst).
- User punya satu pintu komando, leader yang fan-out ke peer.

FEATURE_IDEAS.md sec #5 (Keputusan arsitektur lanjutan 2026-05-17) sudah mengantisipasi ini: *"Inbox sebagai unified entry point: sumber bisa Telegram message, callback tap, runtime API trigger, cronjob, future channel lain."* Bot-to-bot adalah perluasan natural dari prinsip tersebut.

## 2. Architecture Overview

```
~/.claude/
  agent-registry.json            # global, auto-managed oleh setiap wrapper

workspace/bot-NN/.claude/channels/
  pty-controller/
    pending/<uuid>.json          # inbox (existing, schema di-extend backward compat)
    wrapper.pid                  # existing
    wrapper.heartbeat            # existing
    wrapper.current_session_id   # existing
  telegram/
    last-status.json             # existing, dipakai agent-bus untuk status info

Plugin baru: agent-bus
  ├── MCP server  → tools: agent_send, agent_list, agent_status
  ├── Registry module → read/write ~/.claude/agent-registry.json (atomic)
  └── Skill using-agent-bus → kapan AI panggil tool, anti-patterns

Wrapper (pty-controller) extended:
  ├── Auto-register di ~/.claude/agent-registry.json saat boot
  ├── Push heartbeat ke entry registry tiap 5s
  ├── Auto-unregister saat graceful shutdown
  └── Inbox consumer extended: branch by `kind`
       ├── kind="slash"  → inject ke PTY (existing flow)
       ├── kind="prompt" → emit notifications/claude/channel  [Phase 2]
       └── kind="reply"  → emit notifications/claude/channel dengan tag [Phase 2]
```

**Trust model:** Open — semua agent yang terdaftar di registry boleh saling kirim. Single-user single-machine asumption; filesystem ownership = trust boundary. Tidak ada HMAC, tidak ada allowlist di v1.

**Protokol komunikasi:** point-to-point via filesystem inbox. Pure file-based, atomic tmp+rename. Tidak ada socket/IPC daemon.

## 3. Registry & Identity

**File:** `~/.claude/agent-registry.json`

```json
{
  "schema_version": 1,
  "agents": {
    "bot-01": {
      "project_dir": "C:/Users/Mirza/workspace/bot-01",
      "state_dir":   "C:/Users/Mirza/workspace/bot-01/.claude/channels/pty-controller",
      "registered_at": "2026-05-22T14:00:00Z",
      "last_heartbeat": "2026-05-22T14:05:12Z",
      "wrapper_pid": 12345
    }
  }
}
```

**Identity rules:**
- Bot name = basename(`CLAUDE_PROJECT_DIR`) — mis. `workspace/bot-01` → `"bot-01"`.
- Konflik nama (dua project beda lokasi, basename sama): wrapper kedua tetap register tapi log warning. v1 menerima konflik secara explicit; resolusi (FQDN-style atau user-set override) ditunda ke v2.
- Atomic write: tmp + rename; file lock `~/.claude/agent-registry.lock` mencegah concurrent corruption. Retry 3x dengan backoff kalau lock contended.

**Lifecycle:**
- **On boot:** wrapper baca registry, tambah/update entry dirinya, tulis kembali atomic.
- **Heartbeat:** tiap 5s wrapper update field `last_heartbeat` (sama interval dengan local `wrapper.heartbeat`).
- **On shutdown:** wrapper hapus entry dirinya. Crash → entry tetap, `last_heartbeat` jadi stale.
- **Online detection:** peer online kalau `last_heartbeat < 30s ago`.
- **Stale GC:** `agent_list()` filter out entry yang heartbeat > 24h. Tidak ada auto-delete (preserve history untuk inspect).

## 4. Inbox Schema (Extended)

Existing schema di `plugins/pty-controller/ipc.ts`:

```typescript
PtyCommand = { id: string, ts: string, command: string }
```

**Extended schema (backward compatible — old wrapper ignore unknown fields):**

```typescript
type PtyCommand = {
  id: string,                // UUID, existing
  ts: string,                // ISO timestamp, existing
  command?: string,          // legacy string form; jika hadir tanpa `kind`, treated as kind:"slash"
  sessionName?: string,      // existing, dipakai meta-command /new (untuk /clear+/rename chain)

  // NEW fields (semua optional)
  kind?: "slash" | "prompt" | "reply",
  from?: string,             // sender agent name; wajib kalau `kind` ada
  body?: string,             // payload untuk kind:"prompt" / "reply" (natural language)
  correlation_id?: string,   // UUID; sama untuk request + reply pair
  hop_count?: number,        // default 0, increment tiap forward; cap v1 = 5
  topic_id?: string          // reserved untuk v3 multi-agent deliberation, v1 tidak digunakan
}
```

**Wrapper routing logic (extended):**

```
file consumed →
  validate schema → reject ke pending/.rejected/ kalau gagal
  validate from exists in registry → reject kalau gagal
  validate hop_count <= 5 → drop + log warning kalau lebih
  branch by kind:
    "slash" (or kind undefined):
      inject `command` ke PTY (existing); jika `sessionName` ada, chain /rename setelahnya
    "prompt":
      emit notifications/claude/channel { source: "agent", from, body, ts }
    "reply":
      emit notifications/claude/channel { source: "agent", from, body, correlation_id, ts }
```

**Inbound channel tag** yang AI receiver akan lihat (mirror pola Telegram `<channel source="telegram" ...>`):

```xml
<channel source="agent" from="bot-01" correlation_id="abc-123" kind="prompt" ts="2026-05-22T14:10:00Z">
Tolong jalankan handoff-resume di sesi ini.
</channel>
```

**Validasi lain:**
- `body` max 8 KB untuk cegah payload raksasa.
- `kind="reply"` wajib punya `correlation_id`.
- `from` harus terdaftar di registry.

## 5. Tool Surface — Plugin `agent-bus`

### MCP Tools

**`agent_list()`** — read-only, autonomous OK

```
Output: [
  { name, online, last_heartbeat, project_dir },
  ...
]
```

**`agent_status(name)`** — read-only, autonomous OK

```
Input:  { name: "bot-02" }
Output: {
  name,
  online,
  last_heartbeat,
  wrapper_pid,
  current_session_id,
  current_session_name,
  context_used_percent,
  model,
  effort_level
}
```

Implementasi: baca registry untuk basic info + `<peer-state>/telegram/last-status.json` untuk session detail (opportunistic — kalau peer tidak install plugin telegram, return subset minimal). agent-bus pure reader untuk status info.

Field yang sengaja **tidak** di-expose:
- `context_remaining_percent` — derivable dari `100 - used_percent`.
- `rate_limit_5h_used_percent` — shared account, tidak relevan per-agent.
- `cost_usd_total` — sudah tersedia di statusline CC, bukan info inter-agent.

**`agent_send(target, payload)`** — mutating, **user-triggered only**

```
Input:
  target: string             # nama peer
  payload: object            # struktur match wrapper inbox

  Contoh payload:
    { kind: "slash", command: "/clear", sessionName: "sprint-2" }    # = efek /new
    { kind: "slash", command: "/rename", args: "new-name" }
    { kind: "slash", command: "/switch", sessionId: "abc-..." }
    { kind: "slash", command: "/effort", args: "high" }
    { kind: "prompt", body: "tolong review PR #5" }                  # Phase 2
    { kind: "reply",  correlation_id: "...", body: "menurut saya..." } # Phase 2

  correlation_id: optional, auto-generated kalau kosong

Output: { id, correlation_id, written_to_path }
```

Tool description-nya **eksplisit menyatakan**: "Do not call unless the user explicitly asks to message another agent. Read-only `agent_list` / `agent_status` may be called autonomously."

### Skill `using-agent-bus`

Mengajari AI:
- Kapan pakai `agent_list` / `agent_status` (kapan saja, autonomous).
- Kapan pakai `agent_send` (hanya kalau user eksplisit minta).
- Action destructive (`/clear`, `/delete`) hanya kalau user eksplisit confirm.
- Pattern "leader fan-out": user minta leader → leader loop `agent_list` → `agent_send` per peer → report hasil ke user.
- Anti-patterns: jangan kirim ke peer offline tanpa peringatan ke user; jangan inisiatif autonomous untuk topic baru; jangan kirim payload >8 KB.

## 6. Phasing

### Phase 1 — Slash-only (estimated ~4–6 jam)

- Plugin scaffold `plugins/agent-bus/` di mirza-marketplace.
- Registry module (read/write `~/.claude/agent-registry.json` atomic + lock file).
- MCP tools: `agent_list`, `agent_status`, `agent_send` (kind="slash" only).
- pty-controller wrapper extension:
  - Register/unregister + heartbeat push ke global registry.
  - Inbox consumer validasi `from` + `kind` (slash branch existing tetap, prompt/reply belum di-implement).
- Skill `using-agent-bus` v1.
- Tests: unit (registry, schema validation), integration (2-bot loopback dengan slash command).

**Demo target Phase 1:**
1. User di bot-01: *"reset bot-02 dengan nama session 'sprint-2'"*.
2. Bot-01 panggil `agent_send(target="bot-02", payload={ kind:"slash", command:"/clear", sessionName:"sprint-2" })`.
3. File muncul di `workspace/bot-02/.claude/channels/pty-controller/pending/<uuid>.json`.
4. Wrapper bot-02 consume, inject `/clear\r` ke PTY-nya, chain `/rename sprint-2\r` setelah session restart.
5. Bot-01 confirm ke user di Telegram.

### Phase 2 — Prompt + Reply (estimated ~4–6 jam)

- `agent_send` accept `kind: "prompt"` & `kind: "reply"`.
- Wrapper-side: route prompt/reply → `notifications/claude/channel` dengan `source="agent"`.
- Hop limit enforcement (max 5) + rejection path.
- Skill update: tambah pattern "request + wait inbound reply".

**Demo target Phase 2:**
1. User di bot-01: *"tanya bot-02 apa pendapatnya soal X"*.
2. Bot-01 panggil `agent_send(target="bot-02", payload={ kind:"prompt", body:"apa pendapatmu soal X?" })`.
3. Bot-02 receive sebagai inbound message, AI baca, reply via `agent_send(target="bot-01", payload={ kind:"reply", correlation_id:"...", body:"menurut saya ..." })`.
4. Bot-01 receive reply sebagai inbound, lanjut ke user.

## 7. Error Handling

- **Target not in registry** → `agent_send` raise error dengan daftar agent yang available.
- **Target offline (stale heartbeat > 30s)** → tetap allow write (akan di-consume saat peer boot kembali), tapi return warning ke caller. Wrapper saat boot consume backlog max 50 file; lebih dari itu diarchive ke `pending/.overflow/`.
- **Schema validation fail** (missing `from`, invalid `kind`, dll) → file di-move ke `pending/.rejected/<uuid>.json` + sidecar `.reason.txt`.
- **Hop count > 5** → drop file + log warning. Optional notify sender via `kind: "system_error"` (decided di Phase 2).
- **Concurrent registry write** → file lock `registry.lock` + retry 3x dengan backoff. Kalau tetap gagal → error to caller.

## 8. Testing Strategy

- **Unit tests** — registry CRUD, schema validation, hop counter, name conflict resolution, atomic write.
- **Integration tests** — 2-bot loopback di temp dir; full send → consume → reply cycle (Phase 2).
- **Manual smoke (Phase 1)** — Mirza menjalankan 2 bot real (bot-01 + bot-02), kirim `/clear+rename` antar mereka, verifikasi end-to-end.

## 9. Roadmap (v2 & v3 — Documented Only)

### v2 — Structured Protocol Preparation

- Field `intent` enum: `request | inform | propose | accept | reject | decide | ack`.
- Telegram audit mirror: setiap inter-agent message di-summarize (1 baris) dan diforward ke Telegram user sebagai source="agent-bus", non-interruptive. User jadi observer-of-record.
- Token budget tracking per `correlation_id`.
- Name conflict resolution (FQDN-style atau user-set override).

### v3 — Multi-Agent Deliberation

- `topic_id` aktif. Registry `~/.claude/agent-topics/<topic-id>.json` menyimpan deklarasi:
  ```json
  { "topic_id": "...", "leader": "bot-01",
    "participants": ["bot-02","bot-03"],
    "budget_tokens": 50000, "max_rounds": 3, "deadline": "..." }
  ```
- Leader declaration sebelum dialog: out-of-topic message ditolak.
- Vote/decide semantics, automatic chain termination saat leader emit `intent:decide`.
- Hard token budget per topic, hard stop saat exhausted.
- Speak-only-when-addressed default (cegah broadcast spam).

v2 & v3 **tidak di-implement** sampai v1 (Phase 1 + Phase 2) stabil di pemakaian real ≥1 minggu.

## 10. Open Questions

1. **Konflik nama bot** — Phase 1 cuma warning. Resolusi full di v2.
2. **Persistensi inbox file** — Phase 1: delete setelah consumed. Re-evaluasi kalau debugging perlu artifact retention.
3. **Cross-machine support** — Out of scope. Registry filesystem-based hanya jalan di single machine.
4. **Backlog limit per peer** — Phase 1 cap 50 file di `pending/`. Belum jelas threshold optimal di pemakaian nyata.
5. **Skill placement** — `using-agent-bus` di-host di plugin `agent-bus/` sendiri, atau di skills bundle terpisah? Keputusan saat scaffold.

## 11. Non-Goals (Explicit)

- Multi-agent autonomous deliberation (v3 territory, bukan v1).
- Cross-machine bot mesh.
- HMAC / cryptographic message authentication (tidak diperlukan single-user single-machine).
- Real-time low-latency messaging (filesystem polling adequate untuk human-timescale interaction).
- UI dashboard untuk inter-agent traffic (Telegram audit mirror di v2 sudah cukup).

## 12. Dependencies

- Existing `pty-controller` plugin (di mirza-marketplace).
- Existing `telegram` plugin (untuk `last-status.json` consumption oleh `agent_status` — optional, graceful degrade).

---

**Sign-off:** spec approved oleh Mirza pada 2026-05-22 setelah 9 clarifying questions + 5 design sections (1 dengan revision tweak untuk `agent_status` field trimming, 1 dengan revision tweak untuk `agent_send` structured payload).

Next step: writing-plans skill untuk decompose Phase 1 jadi implementation tasks.
