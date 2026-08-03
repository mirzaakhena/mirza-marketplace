# Task A3 report — access-store (Fase 1, mirza-harness)

**Status: DONE**

## Files

- `packages/hostd/src/state/access-store.ts` (new)
- `packages/hostd/test/access-store.test.ts` (new)

No other files touched. No git add/commit/push. No `bun install` (zod already present in `packages/hostd/node_modules`).

## What was built

Ported `Access` type + pairing mutation logic from
`plugins/telegram/server.ts:209-420` (mirza-marketplace) onto the
`channel_access(channel, bot_id, policy JSON)` table from state-core (HEAD
6f567f7).

- **Schema**: `PendingEntrySchema`, `GroupPolicySchema`, `AccessSchema` — all
  `.strict()`. `AccessSchema` gives `dmPolicy`/`allowFrom`/`groups`/`pending`
  zod `.default(...)` so `AccessSchema.parse({})` (and any legacy JSON
  missing those keys) yields exactly
  `{dmPolicy:'pairing', allowFrom:[], groups:{}, pending:{}}`. Optional
  fields (`mentionPatterns`, `ackReaction`, `replyToMode`, `textChunkLimit`,
  `chunkMode`) match the reference type verbatim.
- **API** (all take `channel: string = 'telegram'` as optional trailing
  param):
  - `getAccess(db, botId, channel?)` — row absent → `defaultAccess()`.
  - `setAccess(db, botId, access, channel?)` — zod-validates (throws
    `ZodError` on invalid input, state left untouched), upserts via
    `INSERT ... ON CONFLICT(channel, bot_id) DO UPDATE`.
  - `approvePairing(db, botId, userId, channel?)` — adds `userId` to
    `allowFrom` (dedup) and deletes any pending entries whose `senderId`
    matches. Idempotent by construction: a second call finds nothing left
    to do and no-ops without throwing. Design choice: it does not require a
    pre-existing pending entry — calling it for a userId with no pending
    code still lands them in `allowFrom` (this is a superset of the old
    `pair <code>` skill flow, which the brief's "pending→allowFrom,
    idempotent" wording didn't explicitly forbid; flagged below as a
    decision worth a sanity check).
  - `addPending(db, botId, userId, code, channel?)` — cap at `PENDING_CAP =
    3` (ported from the reference comment "Cap pending at 3"). Over-cap
    returns `{ok:false, reason}` (not a silent drop like the original,
    since this is a lower-level store API and the caller should decide).
    Rewriting an existing `code` key doesn't count against the cap.
  - `importLegacyAccessJson(db, botId, filePath, channel?)` — reads the
    file; any failure (ENOENT, JSON syntax error, or schema validation
    failure) returns `{ok:false, reason}` and never throws, never touches
    the filesystem beyond a read. Per SCAR-078 semantics in the brief, the
    `.corrupt-<ts>` rename is explicitly left to the caller.

## Test summary

`bun test packages/hostd/test/access-store.test.ts` → **22 pass, 0 fail, 50
expect() calls**.

Covers: schema defaults/`.strict()` rejection, `getAccess` default +
channel/botId isolation, `setAccess` upsert + invalid-input throw without
mutating state, `approvePairing` (moves pending→allowFrom, idempotent
double-call, approve-without-pending-entry, only removes the matching
user's pending code), `addPending` (basic add, cap enforcement at
`PENDING_CAP`, rewrite of an existing code not counted twice), and
`importLegacyAccessJson` (valid full file, valid-but-partial legacy file
gets schema defaults, a real corrupt-JSON file on disk → `{ok:false}`
without throwing and without the file being touched, valid-JSON-but-wrong-
types → `{ok:false}`, missing file → `{ok:false}`).

Full-suite check: `bun test packages/hostd packages/shared` → **85 pass, 0
fail, 173 expect() calls, across 8 files** (no regressions). `bunx tsc
--noEmit` at repo root → clean, no errors.

## Concerns / things worth a second look

1. `approvePairing` on a userId with no pending entry still succeeds and
   adds them to `allowFrom` (see design note above). If Fase 1 wants this
   to be a hard error/no-op instead (mirroring the old skill's `pair
   <code>` gate more strictly), that's a one-line change — happy to adjust
   once confirmed.
2. `channel_access` has no `updated_at`/versioning column, so
   `importLegacyAccessJson` silently overwrites any existing row for that
   (channel, botId) — fine for a one-shot migration path but worth noting
   if it's ever called more than once against live data.
3. Repo had other unrelated in-flight changes (untracked
   `packages/hostd/src/bus/`, `messages-store.ts`, `bus.test.ts`, and
   modified `telegram-adapter`/`shared` files) from what looks like
   parallel Fase 1 work by other tasks — untouched by me, noted here only
   so it isn't mistaken for my diff.
