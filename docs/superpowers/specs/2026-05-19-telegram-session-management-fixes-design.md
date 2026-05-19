# Telegram Session Management — Race & Robustness Fixes

**Date:** 2026-05-19
**Affects:** `plugins/telegram/meta-commands.ts`, `plugins/telegram/sessions-list.ts`, `plugins/telegram/session-names-registry.ts`, `plugins/telegram/server.ts`, `plugins/pty-controller/wrapper/src/wrapper.ts`
**Status:** Draft (follow-up to `2026-05-19-session-management-design.md`)
**Builds on:** the approved `/delete` + named-`/new` spec from earlier today. That spec covered the *new commands*; this one fixes *race conditions and data-quality issues* that surfaced once users started exercising those commands.

## Motivation

Mirza's Telegram pickers exposed four concrete bugs (evidenced by two screenshots shared during the previous session):

1. **Duplicate names accumulate in the picker** — three pairs (`omar`×2, `gogogo`×2, `qwerty`×2) all coexist in the registry. Cause: `/new` and `/rename` do not validate against existing names. Whoever runs second silently overwrites the registry entry for *that session id*, but the other session keeps its own entry, so the picker shows two rows with identical labels and no way to tell them apart.
2. **Naked UUID labels** — sessions that lack a registry entry *and* lack a live pid-file name (legacy sessions, or sessions whose `/rename` was lost across a race) render as `session 6ed73411` with no recency hint. The user has nothing to disambiguate by.
3. **Label mismatch on `/switch`** — tapping a picker row labelled `utama` produces the transition message `switch to session: omar`. Cause: the system-outbox event carries only the `sessionId`; the plugin re-resolves the label via the registry at outbox-consume time, and a stale/overwritten registry entry wins the lookup.
4. **`/new` registry write is lazy** — when `/new bahas MCP` runs, the wrapper injects `/rename bahas MCP` and the new name only reaches the telegram registry on the *next* picker render via `refreshFromPidFiles`. If a `/switch` lands between the rename and the next picker render, CC overwrites the pid file with the resumed session's name and the freshly-created name disappears before it is ever recorded.

In addition, two orthogonal items came up while diagnosing the above and were folded into this design because they touch the same files:

5. **Wrapper startup has no session-continuity story.** Each fresh `mirza-cc` launch spawns plain `claude`, so a restart starts a brand-new session even if the user has work-in-progress in an existing session in the same project. After this fix, restarts resume the most recently-modified session; the very first run (empty projects dir) auto-names the new session `main session`.
6. **Inconsistent post-injection delays.** `POST_INJECTION_DELAY_MS = 1500` paces the `/rename` → `/notify-user` chain inside the post-`/clear` poll, but the `/switch` path fires its system-outbox event with zero delay. The plugin sometimes receives the switch event before CC has finished swapping sessions, causing the same race that bug #3 exhibits in a different flow. We unify the delay at **1000 ms** for both paths.

## Out of scope

- Cleaning up legacy duplicate registry entries (the existing `omar`×2 etc.). Policy: leave them, surface a disambiguator in the picker. No migration script.
- "Reserved" treatment for the name `main session`. It is treated like any other name — subject to the same uniqueness rule. A user who has already used the name elsewhere will see the first-run auto-rename gracefully degrade to *not* renaming (see Feature E).
- Reflowing existing CC-side `/rename` to the registry. The plugin already mirrors `/rename` invoked from Telegram; renames typed directly into CC are still picked up best-effort via `refreshFromPidFiles` at picker render. No change.
- Multi-session sort orders, search, or pagination in the picker. Out of scope.

---

## Feature A — Uniqueness validation for names

### Helper (`session-names-registry.ts`)

Add a single lookup helper:

```ts
/**
 * Returns the sessionId currently holding `name`, or null if `name` is free.
 * Comparison is case-sensitive (Mirza picked "tolak", not "auto-canonicalise"),
 * exact match against the registry's `name` field.
 *
 * If the registry contains legacy duplicates (two entries with the same name),
 * the first one encountered is returned. Callers don't rely on which one —
 * both block the new write equally.
 */
export function findSessionIdByName(
  registry: Map<string, RegistryEntry>,
  name: string,
): string | null
```

Pure read; no I/O. The caller decides whether to `loadRegistry` first or pass in an already-loaded one.

### `/new` validation (`meta-commands.ts handleNew`)

Before `writeWrapperCommand`, after the existing sanitisation + 64-char cap:

1. Resolve `telegramStateDir` (same pattern as `handleRename`). If it's missing, skip validation — the registry is unavailable so we can't enforce uniqueness anyway; degrade to current behavior.
2. `loadRegistry(telegramStateDir)`, run `findSessionIdByName(registry, sessionName)`.
3. If a match is found:

   > `⚠️ Nama "<sessionName>" sudah dipakai session lain di project ini. Pilih nama lain atau /switch ke session itu.`

   Return without writing to the wrapper. The fresh CC session is NOT spawned.

### `/rename` validation (`meta-commands.ts handleRename`)

Same pattern. Before the `writeWrapperCommand` + `registrySetName` block:

1. Load registry. Run `findSessionIdByName(registry, newName)`.
2. If a match is found AND `match !== currentSid` (allow renaming to the same name idempotently — it's a no-op the user might mistakenly type):

   > `⚠️ Nama "<newName>" sudah dipakai session lain. /switch ke session itu atau pilih nama lain.`

   Return without writing to the wrapper.

**Why include the `match !== currentSid` carve-out?** Mirza tapping `/rename omar` on a session already named `omar` should not raise an error — it's the kind of double-tap that happens on mobile. The carve-out costs nothing and avoids one source of false-positive friction.

**Why case-sensitive?** Mirza's existing duplicates (`omar` × 2) are exact-match. Treating `Omar` vs `omar` as distinct lets us avoid debating canonicalisation rules. If this proves wrong in use we can tighten later.

### Tests

In `meta-commands.test.ts`:

- `/new` with a name that exists in the registry → reply with rejection, no `writeWrapperCommand` call.
- `/new` with a free name → existing happy-path test continues to pass.
- `/rename` with a name belonging to a *different* session → reply with rejection, no write.
- `/rename` to the *same* session's existing name → succeeds (idempotent no-op).
- `/rename` when registry empty / `telegramStateDir` absent → skips validation, writes payload (degraded mode).

---

## Feature B — Eager registry write inside the wrapper after `/new`

The wrapper currently injects `/rename <name>` and relies on the plugin's next `refreshFromPidFiles` call (at picker render time) to capture the new name into the registry. That is a race: any `/switch` between `/rename` and the next picker render overwrites the pid file and erases the name we just set.

**Change** (`wrapper.ts`, inside the `sessionPollInterval` "fresh session detected" branch around line 281):

After detecting the new session id, *before* injecting `/rename`, write the new name into the telegram plugin's registry directly:

```ts
if (sessionName) {
  setNameInTelegramRegistry(sid, sessionName)  // eager write
  setTimeout(() => injectSlashCommand(`/rename ${sessionName}`), delay)
  delay += POST_INJECTION_DELAY_MS
}
```

`setNameInTelegramRegistry` is a thin helper in `wrapper.ts` that:

1. Resolves the telegram state dir via the same env-var lookup the plugin uses (`CLAUDE_CHANNELS_DIR` or `<CLAUDE_PROJECT_DIR>/.claude/channels/telegram` — match the resolver in `meta-commands.ts resolveTelegramStateDir`).
2. Calls into the existing `session-names-registry.ts setName`. Either:
   - **Option α:** the wrapper imports `setName` from the plugin's source. Today the wrapper is a separate package — this would require either a relative path import or extracting `session-names-registry.ts` to a shared module.
   - **Option β:** the wrapper duplicates the 30-line `setName` implementation locally. Simpler at the cost of two-source-of-truth.

  **Pick β.** The registry on-disk format is JSON; duplication is trivial and removes a cross-package dependency. If the format evolves we update both sites. The risk is small — this file has been stable.

The `/rename` injection still runs (it tells CC about the name so CC's own pid-file is updated), and we still leave `refreshFromPidFiles` in place at picker render as a belt-and-suspenders mechanism. The eager write closes the race window for the typical case.

### Tests

Wrapper has no unit tests today (per repo inspection). Add a focused integration test, or — pragmatically — verify manually:

- Run `/new test1`, immediately run `/new test2` without picker render in between, then `/switch` and observe the picker. Both names should appear. (Pre-fix: `test1` is missing.)

---

## Feature C — Carry the label through `/switch` to kill the outbox race

The current flow:

```
picker tap → meta-commands.ts callback → writeWrapperCommand({type:"switch", sessionId})
           → wrapper consumePending → writeSystemOutbox({type:"session-change", sessionId, sessionName: null})
           → server.ts handleSessionChangeEvent → re-resolve label from registry → send "switch to session: <label>"
```

The re-resolve step is the race source. Fix by passing the label all the way through.

**Change 1** — `meta-commands.ts tryHandleMetaCallback`, in the `switch_` branch (around line 459):

```ts
writeWrapperCommand(stateDir, {
  type: 'switch',
  sessionId: entry.sessionId,
  sessionName: entry.label,  // ← new: carries the picker-render-time label
})
```

(`entry.label` already holds the resolved-at-picker-render-time name, so it's exactly the right value.)

**Change 2** — `wrapper.ts consumePending`, switch branch (line 403–425):

```ts
const sessionName =
  typeof payload.sessionName === 'string' ? payload.sessionName : null
// existing /resume injection, with delay
setTimeout(() => {
  writeSystemOutbox({
    type: 'session-change',
    sessionId: sid,
    sessionName,  // ← propagate
  })
}, POST_INJECTION_DELAY_MS)
```

Two things changed: `sessionName` is now propagated (not hard-coded `null`), and the outbox event is **delayed by POST_INJECTION_DELAY_MS** to match the post-`/clear` path. See Feature F for the delay unification rationale.

**Change 3** — `server.ts handleSessionChangeEvent`:

When `event.sessionName` is non-null, **use it directly** without registry re-resolve. When null (older wrapper, or programmatic call), fall back to the current re-resolve behavior. This keeps backward compatibility while killing the race in the normal path.

### Tests

- `tryHandleMetaCallback` test: a `switch_<shortId>` tap writes a payload containing `sessionName` equal to the picker entry's label.
- Wrapper integration / manual: tap a picker row labelled X, transition message must read `switch to session: X` even if the registry has a different name for that session id.
- `handleSessionChangeEvent` unit (if testable): given `sessionName: "X"`, emits a message with X; given `sessionName: null`, falls back to registry lookup.

---

## Feature D — Better labels for sessions without a name

Two improvements in `sessions-list.ts listProjectSessions`:

### D1. Timestamp suffix for naked-UUID fallback

When `resolvedName === null`, current code returns `session ${sessionId.slice(0, 8)}`. Change to include a recency hint:

```ts
label: `session ${sessionId.slice(0, 8)} · ${formatRelative(mtime)}`
```

`formatRelative(ms)` produces short Indonesian-friendly strings: `5 mnt`, `2 jam`, `3 hari`, `2 mgg`. For older-than-3-months, fall back to `dd/mm` absolute. Implementation can be a 20-line pure function — no dependency.

**Why relative not absolute?** Mirza's screenshot showed sessions ranging from minutes to weeks old. Relative is denser on the button label (Telegram caps width). Absolute dates lose meaning quickly without the year, and adding the year bloats the label.

### D2. Disambiguator suffix when two entries share a name

After building the `sessions: SessionInfo[]` array, before sorting:

```ts
const nameCounts = new Map<string, number>()
for (const s of sessions) if (s.hasName) nameCounts.set(s.label, (nameCounts.get(s.label) ?? 0) + 1)
for (const s of sessions) {
  if (s.hasName && (nameCounts.get(s.label) ?? 0) > 1) {
    s.label = `${s.label} (${s.shortId})`
  }
}
```

Only triggers when ≥2 entries have the same resolved name. The shortId is already in `SessionInfo` so no extra computation. After Feature A lands, new duplicates cannot appear; this is purely for legacy data.

### Tests

- `listProjectSessions` with two sessions both named "omar" → labels become `omar (abcd1234)` and `omar (5678efab)`.
- `listProjectSessions` with one unnamed session → label is `session abcd1234 · <relative>`.
- Existing tests (single named session) → labels unchanged.

---

## Feature E — Wrapper startup: resume-by-mtime, first-run "main session"

`wrapper.ts` currently calls `spawnClaudePty()` unconditionally with no `--resume` flag. Replace that single call with a small startup decision:

```ts
function chooseStartupArgs(): { args: string[]; isFirstRun: boolean } {
  const files = listSessions()
  if (files.size === 0) return { args: BASE_CLAUDE_ARGS, isFirstRun: true }
  // Find the latest jsonl by mtime.
  let latest: { id: string; mtime: number } | null = null
  for (const f of files) {
    const id = f.slice(0, -'.jsonl'.length)
    let mtime = 0
    try { mtime = statSync(join(CLAUDE_PROJECTS_DIR, f)).mtimeMs } catch {}
    if (!latest || mtime > latest.mtime) latest = { id, mtime }
  }
  return { args: ['--resume', latest!.id, ...BASE_CLAUDE_ARGS], isFirstRun: false }
}
```

`spawnClaudePty` then uses the chosen args.

### First-run rename (`main session`)

When `isFirstRun === true`, after `claude` is spawned, the wrapper enters the same `awaitingClearReady`-style state but seeded for the *initial* session creation (no `/clear` has happened — CC's first session jsonl is the *first* one to appear).

The existing `initialSessionPoll` (line 327) already detects the first jsonl. Extend that branch to:

1. Look up `main session` in the registry via `findSessionIdByName`.
2. **If free:** inject `/rename main session`, write to the telegram registry eagerly (same as Feature B), and write a system-outbox event so the user sees "session: main session" in Telegram.
3. **If taken** (i.e. a previous run already used the name): skip the rename. The session remains nameless; it shows up as `session <8hex> · <relative>` per Feature D until the user renames it manually.

The user explicitly chose **"treated normal"** — `main session` is not reserved, so step 3 is the right degrade path.

### Resume system-outbox event

When `isFirstRun === false` and the wrapper resumes session X, emit a system-outbox event so Telegram shows the user which session they came back into:

```ts
writeSystemOutbox({ type: 'session-change', sessionId: latest.id, sessionName: <resolved> })
```

`<resolved>` comes from the telegram registry at startup; if absent, pass `null` and let the plugin fall back to the standard label.

### Failure modes

- Projects dir exists but no `.jsonl` files (e.g. `/delete` removed all of them): treat as `isFirstRun = true`.
- `--resume <id>` fails inside CC (file present but corrupt, etc.): CC will fall back to its own UI. Wrapper doesn't intercept.
- Two `mirza-cc` processes start at the same time in the same project (Mirza likely runs only one, but be defensive): both will pick the same `latest` jsonl. CC handles `--resume` collision its own way. We don't add coordination.

### Tests

- New manual / integration: empty projects dir → spawn → wait for jsonl → expect `/rename main session` to be injected and registry entry written.
- Manual: projects dir with three jsonls of varying mtimes → wrapper spawns with `--resume <latest>`.
- Manual: registry already contains `main session` → wrapper does NOT inject `/rename` on first-run; session is left nameless.

---

## Feature F — Unify post-injection delays at 1000ms

`POST_INJECTION_DELAY_MS = 1500` becomes `POST_INJECTION_DELAY_MS = 1000` (single constant, single place).

- Post-`/clear`: already uses the constant. Re-tune to 1000.
- Post-`/switch`: today fires `writeSystemOutbox` with zero delay (see line 419–423). Wrap in `setTimeout(..., POST_INJECTION_DELAY_MS)` (already planned in Feature C, Change 2).
- First-run "main session" (Feature E): use the same constant between `/rename` injection and the system-outbox event.

Why 1000 and not 1500? Mirza tested with 1500 and found it noticeable; 1000 is the empirical floor at which CC's slash-command parser reliably digests the previous command before the next write lands. If we observe a regression we widen back to 1200 — single knob, single tune.

### Tests

Visual / latency, not unit. Verify three flows manually:

- `/new x` → Telegram transition message lands ~1s after CC's session swap.
- Tap a `/switch` row → same.
- First-run startup → "main session" name appears in Telegram within ~1s of CC being ready.

---

## Feature G — Reserved? No. (One sentence, for the record.)

`main session` is **not reserved**. It is subject to the same uniqueness check as any other name. Consequence:

- After Feature A lands, `/new main session` succeeds only if no other live session in this project holds that name.
- `/rename anything → main session` succeeds under the same rule.
- A user can `/rename main session → foo`, freeing the name. The next first-run wrapper start would then re-use `main session` (the slot is open).

Nothing else changes. This decision is recorded only because the previous brainstorm explicitly left it open.

---

## Data flow summary (after fixes)

```
/new bahas MCP (Telegram)
    ↓
meta-commands.ts handleNew
    ↓ (NEW) load registry, check name not taken → reject if taken
    ↓ writes {type:"slash", command:"/clear", sessionName:"bahas MCP"}
wrapper consumePending
    ↓ injects /clear, sets awaitingClearReady = { …, sessionName }
CC processes /clear → new session jsonl appears
    ↓
wrapper sessionPollInterval detects new jsonl
    ↓ writes new sessionId to wrapper.current_session_id
    ↓ (NEW) writes "bahas MCP" → sid into telegram registry (eager)
    ↓ injects /rename bahas MCP\r       (t=0)
    ↓ writes session-change outbox       (t=1000ms)
plugin handleSessionChangeEvent
    ↓ uses sessionName from event (no re-resolve)
Telegram: "🔀 session: bahas MCP" appears
```

```
tap "utama" row (Telegram /switch picker)
    ↓
meta-commands.ts tryHandleMetaCallback
    ↓ (NEW) payload now carries sessionName: entry.label ("utama")
wrapper consumePending (switch branch)
    ↓ writes new sessionId to wrapper.current_session_id
    ↓ injects /resume <sid>             (t=0)
    ↓ writes session-change outbox      (t=1000ms, NEW: was 0ms)
       with sessionName: "utama"
plugin handleSessionChangeEvent
    ↓ (NEW) uses sessionName from event — no race
Telegram: "🔀 session: utama" appears
```

```
mirza-cc starts in project with existing jsonl files
    ↓ wrapper picks latest by mtime
    ↓ spawn `claude --resume <latest>`
    ↓ existing initialSessionPoll detects jsonl (already present)
    ↓ writes wrapper.current_session_id
    ↓ writes session-change outbox with sessionName resolved from registry
Telegram: "🔀 session: <name>" appears

mirza-cc starts in empty projects dir
    ↓ spawn plain `claude`
    ↓ initialSessionPoll detects first jsonl
    ↓ if "main session" free → eager registry write + /rename + outbox
    ↓ if taken → no rename; user sees session <hex> · <relative>
```

## Files touched

| File | Change |
| --- | --- |
| `plugins/telegram/session-names-registry.ts` | Add `findSessionIdByName` helper |
| `plugins/telegram/sessions-list.ts` | Timestamp suffix for unnamed; disambiguator suffix for duplicate names; add `formatRelative` (~20 lines) |
| `plugins/telegram/meta-commands.ts` | Uniqueness check in `handleNew` and `handleRename`; pass `entry.label` as `sessionName` in switch callback payload |
| `plugins/telegram/server.ts` | `handleSessionChangeEvent` prefers payload-supplied `sessionName` over registry lookup |
| `plugins/pty-controller/wrapper/src/wrapper.ts` | `POST_INJECTION_DELAY_MS = 1000`; eager telegram-registry write before `/rename` injection; switch system-outbox delayed by the same constant; propagate `sessionName` in switch outbox; startup chooses `--resume <latest>` or first-run with `main session` auto-rename |
| `plugins/telegram/meta-commands.test.ts` | New cases per "Tests" sections in Features A, C |
| `plugins/telegram/sessions-list.test.ts` | New cases for D1 (timestamp) and D2 (disambiguator) |

No schema changes to `session-names.json` (still `Record<sessionId, {name, updatedAt}>`). No new dependencies.

## Version bumps

- `plugins/telegram`: patch bump (bug fixes + label polish, no contract change).
- `plugins/pty-controller`: minor bump (wrapper startup behavior change: now resumes by default; this is a meaningful behavior change even though no API changes).

## Open items / known limitations

- **Case sensitivity of name matching.** Spec uses exact-match. If two users converge on `omar` vs `Omar` it will permit both. Re-evaluate after observation.
- **Legacy duplicates persist.** No migration script. Disambiguator (D2) makes them usable; user can `/rename` one of them out of the collision and the disambiguator naturally disappears.
- **`formatRelative` localisation.** Hard-coded Indonesian short forms (`mnt`, `jam`, `hari`, `mgg`). Acceptable today — Mirza is the only user. If/when more users arrive, extract to a locale module.
- **Concurrent wrappers in the same project.** Two `mirza-cc` processes can both pick the same `--resume <latest>` and race CC's session-lock. We don't coordinate; CC's own lock arbitrates. This is an existing condition not made worse here.
