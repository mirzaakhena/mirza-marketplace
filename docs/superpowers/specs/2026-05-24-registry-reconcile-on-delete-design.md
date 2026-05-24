# Reconcile session-names registry on delete/archive

**Date:** 2026-05-24
**Plugin:** `plugins/telegram` (v0.0.21-mirza.0)
**Status:** Approved (design)

## Problem

The telegram plugin keeps a durable `sessionId → name` registry at
`<telegramStateDir>/session-names.json` (`session-names-registry.ts`). It is the
authority for two things at once:

1. **Display** — picker labels for `/switch` and `/delete` (so sessions keep
   readable names across in-place `/resume` switches, where CC's per-process
   pid file gets overwritten).
2. **Uniqueness** — `/new <name>` and `/rename <name>` reject a name that is
   already taken, via `findSessionIdByName`.

The registry is **never pruned**. Its only mutations are `setName` (upsert) and
`refreshFromPidFiles` (upsert). Neither delete path touches it:

- **Hard delete** (`/delete hard`, `delete_confirm_` branch in
  `meta-commands.ts`) only `rmSync`s the `.jsonl`. The name entry survives.
- **Soft delete** (`/delete`, `archive_confirm_` branch) only calls
  `addArchived`. The name entry survives.

Because `findSessionIdByName` reads the registry without checking whether the
session still exists or is hidden, a deleted/archived session keeps **reserving
its name**:

- Hard delete: latent — the name stays locked if it was in the registry,
  blocking `/new <samename>` even though the session is gone (a true ghost).
- Soft delete: reliably reproducible — archiving via the picker tends to sync
  the name into the registry first (`refreshFromPidFiles` at picker render), so
  the archived-but-hidden session blocks reuse. Worse, the blocking session is
  filtered out of every picker (`sessions-list.ts` archived filter), so the
  user has no Telegram-side way to free the name or switch to it. The error
  message ("/switch ke session itu") points at something invisible.

Root cause: **the registry is the name authority but is never reconciled with
reality** (it includes deleted and hidden sessions).

## Design

Keep the registry (the readable labels depend on it) but keep it honest. Make
each delete path reconcile the registry:

### 1. Hard delete → remove the name entry

In the `delete_confirm_` branch of `tryHandleMetaCallback`
(`meta-commands.ts`), after the existing `rmSync(jsonlPath, ...)` succeeds,
resolve `telegramStateDir` and call a new `removeName(telegramStateDir,
entry.sessionId)`. The session is truly gone, so its name must be freed.

### 2. Soft delete → rename the entry with a shortId suffix

In the `archive_confirm_` branch, after the existing
`addArchived(telegramStateDir, entry.sessionId)`, rename the registry entry so
the original name is freed while the archived session stays identifiable if it
is ever unarchived manually:

```
"session-01"  →  "session-01__afc629be"
```

where `afc629be` is `deriveShortId(entry.sessionId)` (the same 8-hex shortId the
pickers already use, derived from the session's own UUID).

Behavior details:

- **No registry entry → no-op.** If the archived session has no name in the
  registry (picker showed a fallback `session <hex>` label), there is no name to
  free and nothing to suffix. Skip silently.
- **Double-suffix guard.** If the current registry name already ends with
  `__<thisShortId>`, do not append it again (idempotent against any repeat).
- The rename writes only to the plugin registry (`session-names.json`). The
  archived session is not the active session, so no PTY/wrapper or CC pid-file
  interaction is needed.
- Uniqueness is fixed as a side effect: `findSessionIdByName(registry,
  "session-01")` now returns `null` because the entry maps to the suffixed name.
  No need to make `findSessionIdByName` archive-aware.
- Clean on unarchive: the suffixed name is globally unique, so no duplicate-name
  collision and no reliance on the picker's disambiguator pass.

### 3. New registry function

Add to `session-names-registry.ts`, mirroring `setName`'s shape (load → mutate
→ atomic tmp+rename save, best-effort, errors swallowed):

```ts
/** Remove a single session's name entry, then persist. No-op if absent. */
export function removeName(stateDir: string, sessionId: string): void
```

The soft-delete rename reuses the existing `setName` after computing the
suffixed value (no second new function needed).

## Out of scope

- Exposing unarchive/restore via Telegram (the "/restore picker" idea). Not
  needed once the name is freed on archive; manual file edit on the laptop
  remains the unarchive path, as today.
- Making `findSessionIdByName` archive-aware. The rename approach makes it
  unnecessary.
- Backfill/cleanup of registry entries already orphaned by past
  deletes/archives before this change. Out of scope; can be a separate
  one-off if it ever matters.

## Components touched

| File | Change |
|------|--------|
| `session-names-registry.ts` | Add `removeName(stateDir, sessionId)`. |
| `meta-commands.ts` | `delete_confirm_`: call `removeName` after `rmSync`. `archive_confirm_`: rename entry to `<name>__<shortId>` after `addArchived` (with no-name + double-suffix guards). Import `removeName`, `deriveShortId`, `resolveTelegramStateDir` as needed. |

## Testing (TDD)

- `session-names-registry.test.ts`:
  - `removeName` deletes an existing entry and persists.
  - `removeName` is a no-op for an absent sessionId (no throw, file unchanged).
- `meta-commands.test.ts`:
  - Hard delete confirm removes the registry name entry for the deleted session.
  - Soft delete confirm renames the entry to `<name>__<shortId>`, freeing the
    original name (`findSessionIdByName(original)` → null afterward).
  - Soft delete confirm on a session with no registry entry is a no-op (no entry
    created).
  - Double-suffix guard: archiving an entry already named `<name>__<shortId>`
    does not double-append.

## Error handling

All registry writes stay best-effort (swallow errors), consistent with the
existing `setName`/`saveRegistry` contract — a registry write failure must not
abort the actual delete/archive, which already happened on disk.
