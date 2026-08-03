# Task H4 report — PreToolUse commit-trailer guard, tokenized

**Status:** DONE

## Deliverables

- `packages/cc-stub/hooks/trailer-guard.ts` — tokenized checker + PreToolUse entrypoint.
- `packages/cc-stub/hooks/hooks.json` — `PreToolUse` entry, `matcher: "Bash|PowerShell"`.
- `packages/cc-stub/test/trailer-guard.test.ts` — 28 tests (bypass, false-positive, tokenizer units).

## Design

- Command string first split into top-level segments on `&&`/`||`/`;`/`|`/newline
  (`splitTopLevel`), respecting `'...'`, `"..."`, and a minimal PowerShell
  `@'...'@` here-string, so operators inside quotes never split.
- Each segment tokenized into words (`tokenizeWords`), stripping quote
  delimiters; inside `"..."` only `\" \\ \$ \`` are treated as escapes
  (bash semantics) — so a literal `\n` (backslash+n typed without shell
  interpretation) survives as two literal characters, matching real command
  strings.
- `findCommitArgs` only proceeds when a segment's first token is literally
  `git`, optionally followed by `-C <path>` / `-c k=v` global opts, then the
  `commit` subcommand — a `grep -m 1 "git commit" file` never reaches this
  path (first token is `grep`, not `git`).
- `extractMessage` pulls the actual message content from `-m`, combined
  short flags ending in `m` (`-am`, `-sm`, …), `--message`/`--message=`,
  `-F`/`--file`/`--file=` (reads the file; unreadable → `deny:true` with a
  clear "block konservatif" reason), and `--trailer`/`--trailer=`. No
  message-affecting flag at all (e.g. `--amend --no-edit`, bare `git commit`)
  → allowed, message unchanged by the command.
- `hasTrailer` normalizes literal `\n` to a real newline, then requires a
  line matching `Agent: <exact resolveBotId() result>` — a trailer for a
  *different* bot does not satisfy this bot's own guard. `botId` comes from
  `resolveBotId` (`src/tools.ts`, same `MIRZA_BOT_ID` / `basename(cwd)`
  resolution cc-stub's MCP tools use), passed explicitly into `checkCommit`
  for testability and resolved via `resolveBotId()` in `main()`.
- `main()` dispatches on `tool_name === "Bash" | "PowerShell"`, reads
  `tool_input.command` (same field for both tools), and on deny emits
  `{hookSpecificOutput: {hookEventName:"PreToolUse", permissionDecision:"deny",
  permissionDecisionReason}}` — matching the current Claude Code hook
  contract already in use by the reference
  `plugins/bot-conduct/hooks/commit-trailer-guard.ts` (not the older
  `decision:'block'` shape).

## Test summary

`bun test packages/cc-stub` → **56 pass, 0 fail** (28 in
`trailer-guard.test.ts`, rest pre-existing). Covers, both directions:

- Old bypasses now caught: `-am "msg"`, `--message="msg"`, `--message msg`,
  `-sm "msg"` — all block without a trailer.
- Old false positives now allowed: `grep -m 1 "git commit" file` (not a git
  invocation) allowed; trailer written to a file via `echo ... && git commit
  -m "msg"` still blocks (trailer outside the message doesn't count);
  trailer in a second `-m` allows; `git -C /path commit -m "x\n\nAgent:
  bot-03"` (literal `\n`) allows; `git -c user.name=x commit -m
  "msg\n\nAgent: bot-03"` allows (global `-c` before subcommand).
- `-F`/`--file`: file with trailer → allow; file without trailer → block;
  missing file → block conservatively, reason matches `/tidak dapat dibaca/`.
- `--trailer "Agent: bot-03"` counts as valid; `--trailer` for a different
  bot id does not satisfy this bot's own guard.
- `git status` / `git add -A` / `git commit --amend --no-edit` / bare
  `git commit` / unrelated bash → all allowed.
- Tokenizer unit tests for `splitTopLevel`, `tokenizeWords` (incl. mid-word
  quoting and the `@'...'@` here-string), `findCommitArgs`, `hasTrailer`.

`bun run typecheck` (repo-wide `tsc --noEmit`): 0 errors in
`packages/cc-stub/**`. Pre-existing errors remain only in
`packages/pty-holder/**` (parallel task, untouched — confirmed via
`git status` these files are already modified/untracked by that other
task, not by this change).

## Concerns

- Tokenizer is a pragmatic bash/PowerShell subset (per brief: "hormati
  quoting shell dasar ... minimal") — it does not model command
  substitution (`$(...)`), ANSI-C quoting (`$'...'`), or PowerShell
  double-quoted expandable here-strings (`@"..."@`). Not required by the
  brief's test list; flagging in case a future bypass shows up through one
  of those.
- `hooks.json`'s `matcher` value `"Bash|PowerShell"` assumes Claude Code
  treats it as regex alternation over `tool_name` (consistent with how the
  existing `bot-conduct` hook's single-tool matcher works) — not verified
  against a live Claude Code hook dispatch in this task, only unit-tested
  the pure `checkCommit`/`main()` logic.

## Fix pass 1

Reviewer found a real bypass (Major) + 2 minor items in the concerns above.
All three addressed in `packages/cc-stub/hooks/trailer-guard.ts` (and its
test file); `packages/pty-holder/**` and `packages/hostd/src/shim/**` not
touched.

- **Major — `$'...'` desync bypass, fixed.** The old tokenizer treated
  `$'...'` (bash ANSI-C quoting) exactly like `'...'`: no escape awareness, so
  a `\'` inside it looked like the closing quote to the scanner. Reviewer PoC
  `echo $'a\'b' && git commit -m "no trailer"` desynced the quote tracking —
  with no other `'` left in the string, the scanner swallowed the rest of the
  command (including `&& git commit -m "no trailer"`) into one opaque token,
  so `findCommitArgs` never saw the `git commit` invocation at all → wrongly
  allowed.
  - Layer (a): added `scanDollarQuote` (shared by `splitTopLevel`'s internal
    `scanTopLevel` and `tokenizeWords`) that scans `$'...'` with its own
    escape rules — `\'` = literal quote (does not close the construct), `\\`
    = literal backslash, anything else backslash-prefixed left as two literal
    characters (same fallback already used for `"..."`, and consistent with
    `hasTrailer`'s later `\n`-literal normalization). With this, the PoC's
    `$'a\'b'` now closes correctly at the real trailing `'`, `&&` splits as a
    proper top-level separator, and the `git commit -m "no trailer"` segment
    is evaluated normally → **denied** (no trailer), fixing the bypass without
    even needing the safety net below.
  - Layer (b) safety net: `scanTopLevel` now also tracks whether any quote/
    here-string/`$'...'` construct hit end-of-string unterminated
    (`hasUnbalancedQuote`, new export). `checkCommit` now checks, after its
    normal per-segment scan finds nothing to deny: if the command has an
    unbalanced quote AND contains both `"git"` and `"commit"` as substrings
    anywhere, deny conservatively with reason `"quote tak seimbang — tidak
    bisa memverifikasi trailer"`. A command with no trace of `git`/`commit` is
    still allowed regardless of quote balance (fail-closed only for genuinely
    ambiguous cases, per brief).
  - Tests added (all pass): reviewer's exact PoC → deny; `;`-separated
    variant → deny; well-formed `$'...'` with no `git commit` anywhere →
    allow; `$'it\'s ...'` used as the commit message itself with a trailer →
    allow (escape recognized, message extracted correctly); same without a
    trailer → deny; a genuinely unterminated quote with `git`+`commit`
    present textually → deny via the safety net; a genuinely unterminated
    quote with neither → allow.

- **Minor — compound double-commit tests added.**
  `git commit -m "x" && git commit -m "y\n\nAgent: bot-03"` → deny (first
  commit has no trailer); the reverse order → deny; both commits carrying the
  trailer → allow. (`checkCommit`'s existing "first offending segment wins"
  logic already handled this correctly — no code change needed, just explicit
  coverage.)

- **Minor — `main()` hardened to fail-closed on internal errors.**
  `resolveBotId()`/`checkCommit()` now run inside a `try/catch` in `main()`.
  On a thrown error, the hook now emits a `deny` decision with reason
  `` `trailer-guard internal error: <msg>` `` instead of letting the
  exception propagate (which would previously either crash the hook process
  or, depending on how Claude Code treats a crashed PreToolUse hook, could be
  treated as fail-open). A code comment explains this is a deliberate
  fail-CLOSED choice for the guard's own internal errors, in contrast to the
  two `try/catch`es above it in `main()` (unreadable stdin, unparseable JSON),
  which intentionally stay fail-OPEN since those failures mean "this isn't a
  hook payload we understand," not "the guard itself is broken."

### Verification

- `bun test packages/cc-stub` → **66 pass, 0 fail** (112 `expect()` calls;
  was 56 pass before this pass — added 10 tests: 7 for the `$'...'` bypass +
  safety net, 3 for the compound double-commit cases).
- Typecheck: `tsc --noEmit` scoped to
  `packages/cc-stub/hooks/trailer-guard.ts` +
  `packages/cc-stub/test/trailer-guard.test.ts` with the repo's
  `tsconfig.json` compiler options (`strict`, `ESNext`, `bundler` resolution,
  `types: ["bun"]`) — 0 errors. Full repo-wide `tsc --noEmit` (root
  `bun run typecheck`) also 0 errors.
- Confirmed via `git status --porcelain` that only
  `packages/cc-stub/hooks/trailer-guard.ts` and
  `packages/cc-stub/test/trailer-guard.test.ts` were modified in this pass;
  `packages/pty-holder/**` and `packages/hostd/src/shim/**` entries in
  working-tree status are pre-existing (untouched by this fix).
- No `git add`/`commit`/`push` performed, per instructions.

## Fix pass 2 (line-continuation)

Reviewer found a new Major regression vs. the old guard: `scanTopLevel` split
segments on bare `\n` with no awareness of bash's `\` + newline line-
continuation. `git commit \<LF>  -m "no trailer"` is a SINGLE
`git commit -m "no trailer"` invocation once bash splices the backslash-
newline away, but the old (pre-Fase-2) regex guard blocked it while this
tokenized guard split it into two segments: `git commit \` (no `-m`, read as a
bare `git commit` opening an editor → allowed) and `-m "no trailer"` (first
token isn't `git` → never inspected). Net effect: silently allowed, a real
regression.

- **Fix.** An unquoted (or double-quoted) `\` immediately followed by `\r?\n`
  is now collapsed to a single space *before* it can act as a segment/word
  separator or as literal content, in two mirrored spots in
  `packages/cc-stub/hooks/trailer-guard.ts`:
  - `scanTopLevel`'s top-level dispatch loop (handles the segment-splitting
    case above — the pair is consumed and replaced with `" "` in `cur`
    instead of falling through to the `ch === "\n"` separator branch or the
    plain-character fallback).
  - `tokenizeWords`'s `"..."` inner loop (handles continuation *inside* a
    double-quoted `-m` value, e.g. a message that spans lines with a
    trailing `\`) — checked before the existing `DOUBLE_QUOTE_ESCAPES`
    branch, since that branch only recognizes `\" \\ \$ \`` and would
    otherwise leave the backslash in place.
  - Deliberately **not** touched: `'...'` (backslash has no escape meaning
    in single quotes — bash keeps it and the newline literally) and `$'...'`
    (already has its own escape rules in `scanDollarQuote`, unrelated to
    this fix, per the brief).
  - A bare `\` not followed by a newline (Windows path `C:\Users`, or an
    escaped `\\`) is untouched — the new branches only match `\` + `\r?\n`
    specifically, everything else falls through to existing behavior.

- **Tests added** (`packages/cc-stub/test/trailer-guard.test.ts`, new
  `describe("checkCommit — bash line-continuation (\\<newline>) regression
  (pass 2)")`):
  - `git commit \<LF>  -m "no trailer"` → deny.
  - Same with `\<CRLF>` → deny.
  - `git commit \<LF>  -m "msg" \<LF>  -m "Agent: bot-03"` → allow (trailer
    lands in the continued second `-m`).
  - Continuation in the middle of a `-m` value, followed later by a real
    (unescaped) blank line and the trailer on its own line → allow — proves
    the continuation-collapse doesn't merge into or otherwise corrupt a
    genuine trailer line that comes after it.
  - No-regression checks: Windows path backslash (`C:\Users\foo`, not
    followed by a newline) stays literal in `tokenizeWords` and the command
    still gets denied on its own (unrelated) merits; `\\` inside double
    quotes still unescapes to one literal backslash; a literal `\` + newline
    written inside `'...'` (single quotes) is NOT collapsed — single quotes
    have no escape processing at all, confirmed unchanged.

### Verification

- `bun test packages/cc-stub` → **73 pass, 0 fail** (122 `expect()` calls;
  was 66 pass before this pass — added 7 tests for the line-continuation
  regression + no-regression checks).
- Typecheck: repo-root `bunx tsc --noEmit -p .` — 0 errors.
- Only `packages/cc-stub/hooks/trailer-guard.ts` and
  `packages/cc-stub/test/trailer-guard.test.ts` touched, per instructions.
  No `git add`/`commit`/`push` performed.

## Fix pass 3 (PowerShell backtick continuation)

Reviewer found a twin of the pass-2 bug: this fleet's PRIMARY shell is
PowerShell (FUNC-4's whole reason for existing), and in PowerShell an
unquoted backtick (`` ` ``) immediately followed by a newline is the
line-continuation token (PowerShell's equivalent of bash's `\` + newline) —
`scanTopLevel` had no awareness of it, so `git commit `` ` ``<LF>  -m "no
trailer"` split into a bare `git commit` (allowed, first segment has no `-m`)
and a stray `-m "no trailer"` segment (first token isn't `git`, never
inspected) → wrongly allowed, a real regression against the guard PowerShell
support was added for.

- **Fix.** Added a symmetric collapse for an unquoted (or double-quoted)
  backtick immediately followed by `\r?\n` → single space, mirroring the
  bash `\`+newline fix from pass 2 exactly, in the same two spots in
  `packages/cc-stub/hooks/trailer-guard.ts`:
  - `scanTopLevel`'s top-level dispatch loop — checked right after the
    existing `\`+`\r?\n` / `\`+`\n` branches, before the `&&`/`||`/`;`/`\n`/`|`
    separator checks, so a standalone backtick+newline is consumed and
    replaced with `" "` instead of falling through to the `\n`-as-separator
    branch.
  - `tokenizeWords`'s `"..."` inner loop — checked before the
    `DOUBLE_QUOTE_ESCAPES` branch (which already treats `` \` `` as an escape
    for a *backslash-prefixed* backtick — an unrelated, pre-existing case;
    the new branch only fires on a *bare* backtick immediately followed by a
    newline).
  - Deliberately **not** touched: `'...'` (no escape/continuation meaning
    inside single quotes — a literal backtick+newline stays literal) and
    `$'...'` (bash ANSI-C quoting has its own escape rules in
    `scanDollarQuote`; PowerShell continuation semantics don't apply there
    since `$'...'` isn't PowerShell syntax at all).
  - Noted in a code comment: in bash a backtick is command-substitution
    syntax (`` `cmd` ``), not a continuation token — but this tokenizer
    already documents that it doesn't model `$(...)`/backtick command
    substitution at all (accepted limitation from the original design), so
    collapsing a standalone backtick+newline doesn't regress any bash
    behavior this guard relies on; it only fixes the PowerShell case FUNC-4
    exists for.
  - A backtick NOT immediately followed by a newline (mid-text, e.g. inside
    a message body) is untouched — falls through to the existing
    plain-character handling exactly as before.

- **Tests added** (`packages/cc-stub/test/trailer-guard.test.ts`, new
  `describe("checkCommit — PowerShell backtick-continuation (\`<newline>)
  regression (pass 3)")`):
  - `` git commit `<LF>  -m "no trailer" `` → deny.
  - Same with `` `<CRLF> `` → deny.
  - `` git commit `<LF>  -m "msg" `<LF>  -m "Agent: bot-03" `` → allow
    (trailer lands in the continued second `-m`).
  - No-regression checks: a backtick not followed by a newline (mid-text)
    stays literal in `tokenizeWords`, command still denied on its own
    (unrelated) merits; a literal backtick+newline written inside `'...'`
    (single quotes) is NOT collapsed; same for `$'...'` (its own escape
    rules, unrelated to PowerShell continuation, confirmed unchanged).
  - Regression sweep: all pre-existing tests (bash continuation, `$'...'`,
    unbalanced quotes, Windows path, `@'...'@` here-string) re-run and still
    pass, confirming the new backtick branches don't interfere with any of
    the earlier fixes.

### Verification

- `bun test packages/cc-stub` → **79 pass, 0 fail** (131 `expect()` calls;
  was 73 pass before this pass — added 6 tests for the PowerShell backtick
  continuation regression + no-regression checks).
- Typecheck: repo-root `bun run typecheck` (`tsc --noEmit`) — clean, no
  output, 0 errors.
- `git status --porcelain` confirms only `packages/cc-stub/hooks/hooks.json`
  (untouched, pre-existing from earlier passes), `packages/cc-stub/hooks/
  trailer-guard.ts`, and `packages/cc-stub/test/trailer-guard.test.ts` show
  as changed in the working tree — no other files touched. No `git add`/
  `commit`/`push` performed.
