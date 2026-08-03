# Task A2 report — messages-store port

**Status:** DONE

## Files touched (only these two, as scoped)
- `packages/hostd/src/state/messages-store.ts` (new)
- `packages/hostd/test/messages-store.test.ts` (new)

No other files touched. No `git add`/commit. No `bun install`.

## What was ported vs. changed

Ported from `plugins/telegram/messages-store.ts` (mirza-marketplace, 301 lines):
`logInbound`, `logOutbound`, `getMessage` (incl. album fallback via metadata
LIKE-scan), the JSON parse helpers, and the stderr-warn-don't-throw resilience
pattern. Test cases ported/adapted 1:1 where the underlying behavior is
unchanged (attachments JSON shape, album logging, quote_text merge, cross-chat
isolation, LIKE false-positive guard, multi-row-latest-wins).

Adaptations required by the final A1 schema
(`packages/shared/src/schema.ts`):

1. **Constructor** — `createMessagesStore({ db, botId, channel, enabled? })`.
   Takes an already-open `Database` from `openDb` (schema + pragmas already
   applied); the store never opens/migrates a file itself. There is no
   `init()` — nothing left for it to do.
2. **`text` → `body`** — and `body` is `NOT NULL` in the final schema (unlike
   the old nullable `text`), so omitted body is stored as `''`, never `null`.
   Covered by a new test (`body omitted -> stored as ''`).
3. **`bot_id` + `channel` scoping** — bound once at construction, applied to
   every INSERT/SELECT (including the FTS join and the album-fallback LIKE
   scan). Added cross-bot/cross-channel isolation tests that didn't exist
   upstream (the old single-tenant plugin had no such column to leak across).
4. **`reply_to` no longer a column** — final schema dropped it. Folded into
   `metadata.reply_to`, the same treatment the source already gave
   `quote_text`/`quote_is_manual`. Verified via metadata round-trip tests.
5. **`direction` column** — `'in'` for `logInbound`, `'out'` for
   `logOutbound`; `source` keeps its old `'user'|'assistant'|'system'`
   meaning, orthogonal to direction.
6. **`logEdit` NOT ported** (design doc §10.5 — edit_message removed). No
   `edited_of` metadata handling exists in the new file.
7. **LOSS-4 fix** — interface has no `append` method (asserted by a runtime
   test: `(store as any).append` is `undefined`). Added an explicit test
   proving the substitute path works: a session-change/system event logged
   via `logOutbound({ source: 'system', ... })` round-trips through both the
   raw row and `getMessage`.
8. **SCAR-097 degradation** — `enabled: false` makes every method (`logInbound`,
   `logOutbound`, `getMessage`, `searchFts`) a silent no-op that never
   throws and never writes; `enabled` defaults to `true` when omitted. This
   replaces the old env-var-based disable + failed-init fallback (moot now
   since schema setup lives in A1's `openDb`).
9. **`searchFts(query, limit = 20)` added** (IDEA-3 foundation) — queries
   `messages_fts` joined back to `messages`, scoped to this store's
   `bot_id`/`channel`, ordered by `ts DESC`. Tests: basic match, ordering,
   `limit`, no-match empty array, and bot/channel scoping.

## Test results

```
bun test packages/hostd/test/messages-store.test.ts
  30 pass, 0 fail, 60 expect() calls

bun test packages/hostd packages/shared
  115 pass, 0 fail, 233 expect() calls   (includes the 30 above)
```

`bun run typecheck` (repo-wide `tsc --noEmit`) shows zero errors in the new
files. One pre-existing, unrelated error remains
(`packages/hostd/test/marker.test.ts` → missing `../src/bus/marker` module) —
predates this task, not touched by it.

## Concerns / open questions for reviewer

- `reply_to` handling is an interpretive call: the brief didn't explicitly
  say where it should live once the column disappeared from the schema. I
  folded it into `metadata.reply_to` by analogy with how `quote_text` was
  already metadata-only in the source. Flag if a different convention
  (e.g. a required key name, or keeping it out of metadata entirely) is
  expected elsewhere in the harness.
- `close()` from the source was deliberately **not** ported: the store no
  longer owns the `Database` (it's caller-supplied via `openDb`), so closing
  it here would be closing a handle it doesn't own. Callers close via
  whatever holds the `openDb` result.
- `searchFts` limit default is 20 (not specified in the brief) — easy to
  change if a different default is wanted.
- TG-133..140 inventory item mapping not independently re-verified against
  the marketplace inventory doc (out of scope for the two-file diff); the
  brief's TG-137 replacement note (`logEdit` removed, `metadata` kept) is
  reflected in code comments.
