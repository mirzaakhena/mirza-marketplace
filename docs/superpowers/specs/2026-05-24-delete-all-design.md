# `/delete all` and `/delete hard all` — bulk session removal

**Date:** 2026-05-24
**Plugin:** `plugins/telegram`
**Status:** Approved (design)

## Problem / Goal

Today the telegram plugin deletes sessions one at a time through a picker
(`/delete` soft / archive, `/delete hard` permanent). When the user wants to
clear out many stale sessions, tapping them one by one is tedious. Add two bulk
commands:

- `/delete all` — soft-delete (archive) every session except the active one.
- `/delete hard all` — permanently delete every session except the active one.

"all" means **every session except the currently active one** (the active
session can never be deleted/archived — existing behavior). For the soft path,
already-archived sessions are invisible to the listing and are therefore
naturally skipped — only the still-visible, non-current sessions get archived.

## Design

### 1. Routing (`tryRouteMetaCommand`)

Add two checks **before** the existing `/delete` and `/delete hard` picker
checks (order matters — the "all" variants are more specific and would
otherwise be swallowed by `/delete hard ` / fall through):

```
/delete hard all   (exact, or "/delete hard all " + args)  → handleDeleteAll
/delete all        (exact, or "/delete all " + args)       → handleArchiveAll
/delete hard       (unchanged)                             → handleDelete  (picker)
/delete            (unchanged)                             → handleArchive (picker)
```

Plain `/delete` and `/delete hard` keep showing the per-session picker exactly
as today.

### 2. Confirmation (chosen model: single button + explicit count)

Each bulk command snapshots the target sessions at command time and stores them
in an in-memory holder (same lifetime/pattern as the existing picker maps), so a
later tap acts on the snapshot. Then it replies with one confirm button and a
cancel:

- **Soft:** headline lists the count; button `✅ Archive N session`, plus
  `❌ Batal`. Callback `meta:archive_all_confirm` / `meta:archive_all_cancel`.
- **Hard:** headline warns it is PERMANEN and cannot be undone; button
  `🗑️ Hapus PERMANEN N session`, plus `❌ Batal`. Callback
  `meta:delete_all_confirm` / `meta:delete_all_cancel`.

The count `N` is embedded in the button label so the user sees the blast radius
before the single tap.

Empty state (no non-current sessions at command time): reply
"Tidak ada session lain untuk diarchive/dihapus." and do not show buttons.

### 3. Execution + reconciliation (reuse the per-session logic from
`2026-05-24-registry-reconcile-on-delete-design.md`)

Extract the per-session side effects into two small shared helpers so the
single-session confirm branches and the new bulk handlers behave identically
(DRY):

- `archiveSessionAndFreeName(telegramStateDir, sessionId)` — `addArchived` +
  rename the registry entry to `<name>__<shortId>` (no-op when no name;
  double-suffix guard). Mirrors the current `archive_confirm_` body.
- `deleteSessionJsonlAndFreeName(projectDir, telegramStateDir, sessionId)` —
  `rmSync` the jsonl + `removeName` from the registry. Mirrors the current
  `delete_confirm_` body.

The existing single-session confirm branches are refactored to call these
helpers (targeted DRY improvement on code we are extending).

Bulk execution on confirm:
- Re-read the current session id at execution time and **skip any snapshot
  entry that is now the active session** (guards the race where the user
  switched into a session between command and tap).
- Loop the snapshot, calling the appropriate helper per session inside a
  `try/catch` so one failure does not abort the rest. Count succeeded vs
  skipped/failed.

### 4. Result reporting & errors

After the loop, edit the confirm message to a summary:
- Soft: `📦 N session diarchive.` (append ` · M dilewati` when M > 0).
- Hard: `🗑️ N session dihapus permanen.` (append ` · M dilewati` when M > 0).

All registry writes stay best-effort (consistent with `setName`/`removeName`):
a registry failure never aborts the disk operation that already happened.
Standard guards apply (CLAUDE_PROJECT_DIR set, wrapper heartbeat fresh) — same
messages as the existing `/delete` handlers.

### 5. Snapshot expiry

If the in-memory snapshot is empty when a confirm callback fires (server
restarted, or a stale tap), ack "expired" and edit the message to ask the user
to run the command again — mirroring the existing picker-expiry behavior.

## Components touched

| File | Change |
|------|--------|
| `meta-commands.ts` | Routing for the two new commands; `handleArchiveAll` / `handleDeleteAll`; in-memory snapshot holders + reset helpers; confirm/cancel callback branches `archive_all_*` / `delete_all_*`; extract `archiveSessionAndFreeName` / `deleteSessionJsonlAndFreeName` and refactor the single-session branches to use them. |
| `meta-commands.test.ts` | Tests (see below). |

No new files: the bulk logic lives alongside the existing meta-command routing
it extends, and reuses the registry/archive helpers already imported.

## Out of scope

- An "unarchive all" / restore-all command.
- Deleting the active session (still forbidden).
- A typed/double confirmation (the single-button + count model was chosen).

## Testing (TDD)

Routing:
- `/delete all` routes to the soft-all path (headline mentions count, soft icon).
- `/delete hard all` routes to the hard-all path (PERMANEN warning) and is **not**
  swallowed by the `/delete hard` picker.
- `/delete` and `/delete hard` (no "all") still show the per-session picker.

Soft all:
- Confirm archives every non-current session and renames each registry entry to
  `<name>__<shortId>`, freeing each original name.
- Sessions without a registry name are archived with no entry created.

Hard all:
- Confirm `rmSync`s every non-current session's jsonl and `removeName`s each
  registry entry.

Shared:
- The active session is excluded from the snapshot and never touched.
- A session that became current between snapshot and confirm is skipped at
  execution; the summary reports it as skipped.
- Empty state (only the current session exists) → no-buttons message.
- Confirm with an empty/expired snapshot → "expired" ack, no disk changes.
- Refactor safety: existing single-session `/delete` and `/delete hard` confirm
  tests still pass against the extracted helpers.
