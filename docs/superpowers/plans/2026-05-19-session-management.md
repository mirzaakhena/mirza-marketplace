# Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/new` require a session name (which the wrapper applies via `/rename` in the fresh session) and add a Telegram `/delete <session>` command with a confirm step, gated on a wrapper-written `current_session_id` file.

**Architecture:** Two cooperating plugins. The pty-controller wrapper grows a small state file (`<state>/wrapper.current_session_id`) updated at three moments: initial spawn, post-`/clear` new-session detection, and `/resume` injection. The wrapper also extends its post-`/clear` poll loop to inject `/rename <name>` before `/notify-user`. The telegram plugin's meta-command router gets a new `/delete` handler with a picker-then-confirm flow and updates `/new` to require an argument it forwards to the wrapper as `sessionName`. No new dependencies, no schema migrations.

**Tech Stack:** TypeScript (Bun runtime), Node.js APIs (`fs`, `path`), grammy (Telegram bot already wired). Tests via `bun test`.

**Spec:** `docs/superpowers/specs/2026-05-19-session-management-design.md`

---

## File Structure

**Modified:**

- `plugins/pty-controller/wrapper/src/wrapper.ts` — current-session-id tracker (3 call sites), `/rename` injection chain, extended `awaitingClearReady` state
- `plugins/telegram/meta-commands.ts` — `/new` argument parsing, `/delete` handler + callbacks, shared helpers (project-dir encode, current-session-id reader)
- `plugins/telegram/meta-commands.test.ts` — update existing `/new` cases for new contract, add `/delete` cases
- `plugins/pty-controller/.claude-plugin/plugin.json` — version bump
- `plugins/telegram/.claude-plugin/plugin.json` — version bump

No new files. All changes are extensions to existing modules; no need to split anything out (the affected files are already focused).

---

## Task 1: Wrapper tracks current session id

**Goal:** the wrapper writes the current PTY's session id to `<state>/wrapper.current_session_id` at three moments — initial spawn, post-`/clear` new-session detection, post-`/resume` injection — so the telegram plugin can exclude that session from the `/delete` picker.

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

No automated tests — the wrapper has no test harness in this codebase. Verify via `wrapper.log` and `cat`-ing the state file.

- [ ] **Step 1: Add module-level constant and helper near the existing CLAUDE_PROJECTS_DIR block**

In `plugins/pty-controller/wrapper/src/wrapper.ts`, just below the `CLAUDE_PROJECTS_DIR` constant declaration (around line 70):

```ts
const CURRENT_SESSION_FILE = join(STATE_DIR, 'wrapper.current_session_id')

function writeCurrentSessionId(sid: string): void {
  const tmp = `${CURRENT_SESSION_FILE}.tmp.${process.pid}`
  try {
    writeFileSync(tmp, sid)
    renameSync(tmp, CURRENT_SESSION_FILE)
  } catch (err) {
    log(`failed to write current_session_id: ${err}`)
  }
}
```

This uses the same atomic temp-then-rename pattern the wrapper already uses for pending commands. The catch swallows errors after logging because a missing/unwritable state file is a degraded mode, not a fatal one — the wrapper should still serve commands.

The `renameSync` import is not yet present; add it to the `node:fs` import block at the top of the file:

```ts
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  existsSync,
  renameSync,
  watch,
  type FSWatcher,
} from 'node:fs'
```

- [ ] **Step 2: Detect the initial session id after spawn**

Add a one-shot initial-detection routine. Place it right after `attachPty(currentPty)` (around the current line where `currentPty.onExit` is wired):

```ts
// One-shot: after CC starts, poll for the first session jsonl to appear
// and record its id as the current session. Used by the telegram plugin's
// /delete to exclude the active session from the picker.
const initialSessionsBefore = listSessions()
const initialSessionPoll = setInterval(() => {
  const current = listSessions()
  for (const f of current) {
    if (!initialSessionsBefore.has(f)) {
      const sid = f.slice(0, -'.jsonl'.length)
      log(`initial session detected: ${sid}`)
      writeCurrentSessionId(sid)
      clearInterval(initialSessionPoll)
      return
    }
  }
}, 500)
```

This mirrors the existing post-`/clear` poll exactly, just with a single-shot lifetime. The interval clears itself the moment it finds the new file; if CC never creates one (crash on startup), the interval keeps spinning at low cost until the wrapper exits.

Also register it for cleanup in `shutdown`:

```ts
function shutdown(code: number): void {
  clearInterval(heartbeatInterval)
  clearInterval(sweepInterval)
  clearInterval(sessionPollInterval)
  clearInterval(initialSessionPoll)
  pendingWatcher.close()
  // … rest unchanged
}
```

- [ ] **Step 3: Write the file in the existing post-/clear poll**

In the `sessionPollInterval` callback (currently around the line that injects `/notify-user`), write the new session id **before** the injection:

```ts
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) return
  const current = listSessions()
  for (const f of current) {
    if (!awaitingClearReady.sessionsBefore.has(f)) {
      const sid = f.slice(0, -'.jsonl'.length)
      log(`fresh session detected: ${sid} — injecting /notify-user`)
      writeCurrentSessionId(sid)
      awaitingClearReady = null
      currentPty.write(`/notify-user ${POST_CLEAR_NOTIFY_BRIEF}\r`)
      return
    }
  }
}, 500)
```

(Task 2 will further extend this block to also inject `/rename` when a session name was provided.)

- [ ] **Step 4: Write the file in the switch handler**

In `consumePending`, the `type === 'switch'` branch (currently injects `/resume ${sid}\r`), update the file *first*, then inject:

```ts
if (type === 'switch') {
  const sid = payload.sessionId
  if (typeof sid !== 'string' || !sid) {
    log(`ignored ${filename}: switch payload missing sessionId`)
    return
  }
  log(`switch requested → injecting "/resume ${sid}" (id: ${payload.id ?? '?'})`)
  writeCurrentSessionId(sid)
  currentPty.write(`/resume ${sid}\r`)
  return
}
```

- [ ] **Step 5: Manual verify**

Start the wrapper fresh:

```
set CLAUDE_PROJECT_DIR=C:\Users\Mirza\workspace\bot-01
npm --prefix C:\Users\Mirza\workspace\mirza-marketplace\plugins\pty-controller\wrapper run wrapper
```

After CC's first prompt appears, in another shell:

```
type C:\Users\Mirza\workspace\bot-01\.claude\channels\pty-controller\wrapper.current_session_id
```

Expected: a UUID like `cb3b67fd-a6c0-4129-9e82-23d263237c0d`.

Then exercise `/switch` from Telegram, pick a different session, and re-check the file — it should now contain the chosen session id. Tail `wrapper.log`:

Expected log lines, in order:
- `initial session detected: <sid_a>`
- `switch requested → injecting "/resume <sid_b>"`

- [ ] **Step 6: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "pty-controller: track current session id in wrapper.current_session_id"
```

---

## Task 2: Wrapper injects `/rename <name>` before `/notify-user`

**Goal:** when a `/clear` payload carries `sessionName`, the wrapper applies it via `/rename` immediately after the fresh session materialises, before pinging the user.

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Extend the `awaitingClearReady` type with optional `sessionName`**

Locate the `let awaitingClearReady` declaration (near line 189 in the current file). Change:

```ts
let awaitingClearReady: { sessionsBefore: Set<string> } | null = null
```

to:

```ts
let awaitingClearReady:
  | { sessionsBefore: Set<string>; sessionName?: string }
  | null = null
```

- [ ] **Step 2: Capture `sessionName` from the payload in `consumePending`**

In `consumePending`, where the `/clear` case currently sets `awaitingClearReady = { sessionsBefore: listSessions() }`:

```ts
if (command === '/clear') {
  const sessionName =
    typeof (payload as { sessionName?: unknown }).sessionName === 'string'
      ? ((payload as { sessionName: string }).sessionName as string)
      : undefined
  awaitingClearReady = { sessionsBefore: listSessions(), sessionName }
  log(
    `awaiting fresh session after /clear${
      sessionName ? ` (will rename to "${sessionName}")` : ''
    }`,
  )
}
```

Also extend the `payload` type at the top of `consumePending` to allow the new field:

```ts
let payload: {
  id?: string
  type?: string
  command?: string
  sessionId?: string
  sessionName?: string
}
```

- [ ] **Step 3: Inject `/rename` before `/notify-user` in the poll loop**

In `sessionPollInterval` (already touched by Task 1), insert the `/rename` injection between writing the state file and writing `/notify-user`:

```ts
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) return
  const current = listSessions()
  for (const f of current) {
    if (!awaitingClearReady.sessionsBefore.has(f)) {
      const sid = f.slice(0, -'.jsonl'.length)
      const { sessionName } = awaitingClearReady
      log(
        `fresh session detected: ${sid} — injecting${
          sessionName ? ` /rename + /notify-user` : ` /notify-user`
        }`,
      )
      writeCurrentSessionId(sid)
      awaitingClearReady = null
      if (sessionName) {
        currentPty.write(`/rename ${sessionName}\r`)
      }
      currentPty.write(`/notify-user ${POST_CLEAR_NOTIFY_BRIEF}\r`)
      return
    }
  }
}, 500)
```

CC processes its stdin serially, so writing `/rename` and `/notify-user` back-to-back is safe — the second won't be consumed until the first has been parsed and executed.

- [ ] **Step 4: Manual verify**

From the running wrapper, simulate a named-`/new` payload by hand (the Telegram side that produces it lands in Task 4; this step is just to prove the wrapper end). In a separate shell:

```bash
echo '{"id":"manual-test","ts":"2026-05-19T00:00:00Z","type":"slash","command":"/clear","sessionName":"manual test name"}' > C:/Users/Mirza/workspace/bot-01/.claude/channels/pty-controller/pending/manual-test.json
```

Tail `wrapper.log`. Expected lines:
- `injecting "/clear"`
- `awaiting fresh session after /clear (will rename to "manual test name")`
- (after CC creates the new session) `fresh session detected: <sid> — injecting /rename + /notify-user`

Inside the new CC session: title bar / session list should now show "manual test name". The user should also receive a Telegram ping from the fresh session.

- [ ] **Step 5: Commit**

```bash
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "pty-controller: inject /rename before /notify-user when /clear carries sessionName"
```

---

## Task 3: Plugin helpers — `encodeProjectDir` + `readCurrentSessionId`

**Goal:** add the small utilities `/delete` needs into `meta-commands.ts`. They are local to this file (small, single-use) rather than extracted to a new module.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`

- [ ] **Step 1: Add the helpers**

Add these near the existing `resolvePtyStateDir` function (around line 78):

```ts
/**
 * Encode a project dir the way CC encodes it for `~/.claude/projects/<encoded>/`.
 * Duplicated from the wrapper's matching helper; small enough that a shared
 * module isn't worth it.
 */
function encodeProjectDir(p: string): string {
  return p.replace(/[\\/:]/g, '-')
}

/**
 * Read the wrapper's current PTY session id (UUID, no newline) from
 * `<state>/wrapper.current_session_id`. Returns null if the file is absent
 * or unreadable — callers must tolerate that, the wrapper might just not
 * have written it yet.
 */
function readCurrentSessionId(stateDir: string): string | null {
  const file = join(stateDir, 'wrapper.current_session_id')
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}
```

The `readFileSync` import is already present near the top of `meta-commands.ts` — no import changes.

- [ ] **Step 2: Commit (helpers stand alone, no callers yet — that's fine)**

```bash
git add plugins/telegram/meta-commands.ts
git commit -m "telegram: add encodeProjectDir + readCurrentSessionId helpers for /delete"
```

---

## Task 4: `/new` requires `sessionName` argument

**Goal:** `/new` without an argument is rejected with a usage message. `/new <name>` writes a `/clear` payload extended with `sessionName: <name>`.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Modify: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Delete the obsolete test case and rewrite the matching ones**

Open `plugins/telegram/meta-commands.test.ts`. Make these edits:

1. **Delete** the test `'returns false for /new with arguments — must be exact'` entirely (lines 93–99). The new contract says `/new <arg>` IS consumed.

2. **Update** the test `'consumes /new but warns when CLAUDE_PROJECT_DIR is missing'` to use a valid arg so it reaches that validation step:

```ts
test('consumes /new but warns when CLAUDE_PROJECT_DIR is missing', async () => {
  const { handler, replies } = makeHandler()
  const consumed = await tryRouteMetaCommandT('/new bahas MCP', {}, handler)
  expect(consumed).toBe(true)
  expect(replies.length).toBe(1)
  expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
})
```

3. **Update** the test `'consumes /new but warns when wrapper heartbeat is missing'` similarly:

```ts
test('consumes /new but warns when wrapper heartbeat is missing', async () => {
  const { handler, replies } = makeHandler()
  const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies.length).toBe(1)
  expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
  expect(listPending(stateDir).length).toBe(0)
})
```

4. **Update** `'consumes /new but warns when heartbeat is stale'` similarly:

```ts
test('consumes /new but warns when heartbeat is stale', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date(Date.now() - 5 * 60_000).toISOString())
  const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
  expect(listPending(stateDir).length).toBe(0)
})
```

5. **Update** `'writes /clear command file and confirms when wrapper is fresh'` to assert `sessionName` is forwarded:

```ts
test('writes /clear command file with sessionName and confirms when wrapper is fresh', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies.length).toBe(1)
  expect(replies[0].text).toMatch(/Clearing session/)
  const pending = listPending(stateDir)
  expect(pending.length).toBe(1)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  expect(payload.command).toBe('/clear')
  expect(payload.sessionName).toBe('bahas MCP')
  expect(typeof payload.id).toBe('string')
  expect(typeof payload.ts).toBe('string')
})
```

6. **Update** `'uppercase /NEW also matches (case-insensitive)'` to use an arg (and lock that the SLASH stays lowercase-matched while the NAME preserves case):

```ts
test('uppercase /NEW also matches (case-insensitive); name preserves case', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/NEW Bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies.length).toBe(1)
  const pending = listPending(stateDir)
  expect(pending.length).toBe(1)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  expect(payload.sessionName).toBe('Bahas MCP')
})
```

7. **Update** `'whitespace around /new is tolerated'` to use an arg:

```ts
test('whitespace around /new <name> is tolerated', async () => {
  const { handler } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('  /new bahas MCP  ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  const pending = listPending(stateDir)
  expect(pending.length).toBe(1)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  expect(payload.sessionName).toBe('bahas MCP')
})
```

8. **Update** `'honors PTY_CONTROLLER_STATE_DIR override over CLAUDE_PROJECT_DIR'` to use an arg:

```ts
test('honors PTY_CONTROLLER_STATE_DIR override over CLAUDE_PROJECT_DIR', async () => {
  const { handler } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT(
    '/new bahas MCP',
    { PTY_CONTROLLER_STATE_DIR: stateDir, CLAUDE_PROJECT_DIR: '/nowhere/that/exists' },
    handler,
  )
  expect(consumed).toBe(true)
  expect(listPending(stateDir).length).toBe(1)
})
```

9. **Add** four new tests for the new contract:

```ts
test('consumes /new with no arg and rejects with usage message', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/new', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies.length).toBe(1)
  expect(replies[0].text).toMatch(/nama session/i)
  expect(listPending(stateDir).length).toBe(0)
})

test('consumes /new with whitespace-only arg and rejects with usage message', async () => {
  const { handler, replies } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/new      ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  expect(replies[0].text).toMatch(/nama session/i)
  expect(listPending(stateDir).length).toBe(0)
})

test('strips newlines from /new name (PTY injection safety)', async () => {
  const { handler } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const consumed = await tryRouteMetaCommandT('/new bahas\nMCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  const pending = listPending(stateDir)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  // Newlines are replaced with single spaces — never embedded in the name.
  expect(payload.sessionName).toBe('bahas MCP')
})

test('truncates /new name longer than 64 chars', async () => {
  const { handler } = makeHandler()
  setHeartbeat(stateDir, new Date().toISOString())
  const longName = 'a'.repeat(100)
  const consumed = await tryRouteMetaCommandT(`/new ${longName}`, { CLAUDE_PROJECT_DIR: projectDir }, handler)
  expect(consumed).toBe(true)
  const pending = listPending(stateDir)
  const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
  expect(payload.sessionName.length).toBe(64)
  expect(payload.sessionName).toBe('a'.repeat(64))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/Users/Mirza/workspace/mirza-marketplace/plugins/telegram
bun test meta-commands.test.ts
```

Expected: multiple failures — old test that asserted `/new please` returns false is gone, new tests reference `payload.sessionName` which the implementation does not yet produce, usage-message tests reference text the code doesn't yet send.

- [ ] **Step 3: Implement: parse arg, validate, forward**

In `plugins/telegram/meta-commands.ts`, change the `tryRouteMetaCommand` routing to extract the rest-of-text rather than matching exact:

```ts
export async function tryRouteMetaCommand(
  text: string,
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // Match `/new[\s+<rest>]?` — exact `/new` or `/new` followed by whitespace + arg.
  if (lower === '/new' || lower.startsWith('/new ') || lower.startsWith('/new\t')) {
    const rest = trimmed.slice('/new'.length).trim()
    return handleNew(env, handlers, rest)
  }
  if (lower === '/switch') {
    return handleSwitch(env, handlers)
  }
  return false
}
```

And update `handleNew` to accept and validate the name:

```ts
async function handleNew(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
  rawName: string,
): Promise<boolean> {
  // Strip newlines/CRs that would corrupt the PTY-injected `/rename <name>\r`.
  const sanitised = rawName.replace(/[\r\n]+/g, ' ').trim()
  if (sanitised.length === 0) {
    await handlers.reply(
      '⚠️ /new butuh nama session. Contoh: /new bahas MCP',
    )
    return true
  }
  const sessionName = sanitised.slice(0, 64)

  const stateDir = resolvePtyStateDir(env)
  if (!stateDir) {
    await handlers.reply(
      '⚠️ /new tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset. ' +
        'Pastikan Claude Code dijalankan dari folder project, atau set PTY_CONTROLLER_STATE_DIR.',
    )
    return true
  }
  if (!wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /new tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi (heartbeat stale). ' +
        'Pastikan CC dijalankan via `mirza-cc` wrapper, bukan `claude` langsung.',
    )
    return true
  }
  try {
    writeWrapperCommand(stateDir, { command: '/clear', sessionName })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /new gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  await handlers.reply(`🔄 Clearing session — fresh session "${sessionName}" sebentar lagi siap.`)
  return true
}
```

Extend the `WrapperPayload` type at the top of the file to allow the new field:

```ts
type WrapperPayload =
  | { type?: 'slash'; command: string; sessionName?: string }
  | { type: 'switch'; sessionId: string }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test meta-commands.test.ts
```

Expected: all tests pass (including the ones updated/added in Step 1).

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "telegram: /new requires session name; forwarded to wrapper as sessionName"
```

---

## Task 5: `/delete` picker — list other sessions, exclude current

**Goal:** typing `/delete` in Telegram lists all sessions in this project EXCEPT the one the wrapper says is current, as an inline-keyboard picker.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Modify: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `plugins/telegram/meta-commands.test.ts`. These helpers are defined ONCE here in Task 5 and reused by Tasks 6–8 (the test file is shared; later tasks reference these helpers by name):

```ts
import { listProjectSessions } from './sessions-list'

// Shared helpers used by /delete tests across Tasks 5–8.
function writeProjectJsonl(homeDirOverride: string, projectDir: string, sessionId: string): void {
  const encoded = projectDir.replace(/[\\/:]/g, '-')
  const dir = join(homeDirOverride, '.claude', 'projects', encoded)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.jsonl`), '')
}

function writeCurrentSessionId(stateDir: string, sid: string): void {
  writeFileSync(join(stateDir, 'wrapper.current_session_id'), sid)
}

/**
 * Set up a /delete picker state: write `sessionIds` as jsonls under the
 * fake home dir, mark `currentSid` (if provided) as the active session,
 * set a fresh heartbeat, then invoke /delete to populate `deletePicker`.
 * Returns the shortIds of the sessions that ended up in the picker.
 */
async function setupAndPopulatePicker(
  homeOverride: string,
  projectDir: string,
  stateDir: string,
  sessionIds: string[],
  currentSid?: string,
): Promise<string[]> {
  for (const sid of sessionIds) writeProjectJsonl(homeOverride, projectDir, sid)
  if (currentSid) writeCurrentSessionId(stateDir, currentSid)
  setHeartbeat(stateDir, new Date().toISOString())
  const { handler } = makeHandler()
  await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  return sessionIds
    .filter(sid => sid !== currentSid)
    .map(sid => sid.replace(/-/g, '').slice(0, 8).toLowerCase())
}

describe('meta-commands: /delete picker', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void
  let homeOverride: string

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    homeOverride = mkdtempSync(join(tmpdir(), 'meta-cmd-home-'))
    process.env.USERPROFILE = homeOverride
    process.env.HOME = homeOverride
  })

  afterEach(() => {
    cleanup()
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
  })

  test('/delete replies with no-other-sessions message when current is the only one', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    writeProjectJsonl(homeOverride, projectDir, sid)
    writeCurrentSessionId(stateDir, sid)

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/Tidak ada session lain/)
    expect(replies[0].buttons).toBeUndefined()
  })

  test('/delete shows picker excluding the current session', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const sidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    writeProjectJsonl(homeOverride, projectDir, sidA)
    writeProjectJsonl(homeOverride, projectDir, sidB)
    writeCurrentSessionId(stateDir, sidA)

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].buttons).toBeDefined()
    const flatLabels = replies[0].buttons!.flat().map(b => b.label)
    // Should mention session B (8-hex prefix), should NOT mention session A.
    expect(flatLabels.some(l => l.includes('bbbbbbbb'))).toBe(true)
    expect(flatLabels.some(l => l.includes('aaaaaaaa'))).toBe(false)
  })

  test('/delete warns when CLAUDE_PROJECT_DIR is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/delete', {}, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
  })

  test('/delete warns when wrapper heartbeat is stale', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
  })

  test('/delete proceeds without current-session exclusion when state file is missing', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    writeProjectJsonl(homeOverride, projectDir, sidA)
    // No writeCurrentSessionId — file absent.

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].buttons).toBeDefined()
    // Without exclusion the only session is in the picker.
    const flatLabels = replies[0].buttons!.flat().map(b => b.label)
    expect(flatLabels.some(l => l.includes('aaaaaaaa'))).toBe(true)
  })
})
```

The use of `process.env.HOME`/`USERPROFILE` to redirect `~/.claude/projects/` is **only valid if `sessions-list.ts` reads `homedir()` lazily per call**. Open `plugins/telegram/sessions-list.ts` and verify the `homedir()` call sits inside the exported function (not as a module-level constant). If it's hoisted, refactor it inline in this task — that's a small change required for the tests to be hermetic.

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test meta-commands.test.ts
```

Expected: new tests fail (no `/delete` routing yet). Old tests still pass.

- [ ] **Step 3: Implement `/delete` route + handler**

Update `tryRouteMetaCommand`:

```ts
if (lower === '/delete') {
  return handleDelete(env, handlers)
}
```

Add the handler:

```ts
const MAX_DELETE_BUTTONS = 7 // same as /switch — reserve 1 row for cancel

interface DeletePickerEntry {
  sessionId: string
  label: string
}
const deletePicker = new Map<string, DeletePickerEntry>()

async function handleDelete(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply(
      '⚠️ /delete tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /delete tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const all = listProjectSessions(projectDir)
  const sessions = currentSid
    ? all.filter(s => s.sessionId !== currentSid)
    : all

  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain yang bisa dihapus.')
    return true
  }

  deletePicker.clear()
  for (const s of sessions.slice(0, MAX_DELETE_BUTTONS)) {
    deletePicker.set(s.shortId, { sessionId: s.sessionId, label: s.label })
  }

  const rows: MetaCommandButton[][] = []
  for (const s of sessions.slice(0, MAX_DELETE_BUTTONS)) {
    const label = s.label.length > 60 ? s.label.slice(0, 59) + '…' : s.label
    rows.push([{ label, callbackData: `meta:delete_${s.shortId}` }])
  }
  rows.push([{ label: '❌ Cancel', callbackData: 'meta:delete_cancel' }])

  const moreNote =
    sessions.length > MAX_DELETE_BUTTONS
      ? ` (showing ${MAX_DELETE_BUTTONS} terbaru dari ${sessions.length})`
      : ''
  await handlers.replyWithButtons(
    `🗑️ Pilih session untuk dihapus${moreNote}:`,
    rows,
  )
  return true
}

// Export for test resets.
export function __resetDeletePickerForTests(): void {
  deletePicker.clear()
}
```

The `listProjectSessions` import needs to be added near the existing imports:

```ts
import { listProjectSessions } from './sessions-list.ts'
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test meta-commands.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts plugins/telegram/sessions-list.ts
git commit -m "telegram: /delete picker — lists other sessions, excludes current via wrapper state file"
```

(Include `sessions-list.ts` in the commit only if Step 1 required a refactor there.)

---

## Task 6: Delete picker tap → confirmation prompt

**Goal:** when the user taps a session label in the `/delete` picker, the bot acks the callback, edits the picker message to remove the keyboard, and sends a separate confirmation message with `✅ Confirm` and `❌ Cancel` buttons.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Modify: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `meta-commands.test.ts`:

```ts
import { tryHandleMetaCallback } from './meta-commands'

function makeCallbackHandler(): {
  handler: {
    ackCallback: (text?: string) => Promise<void>
    editMessage: (text: string) => Promise<void>
    reply: (text: string) => Promise<void>
    replyWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
  }
  acks: string[]
  edits: string[]
  replies: RecordedReply[]
} {
  const acks: string[] = []
  const edits: string[] = []
  const replies: RecordedReply[] = []
  return {
    acks, edits, replies,
    handler: {
      ackCallback: async (text?: string) => { acks.push(text ?? '') },
      editMessage: async (text: string) => { edits.push(text) },
      reply: async (text: string) => { replies.push({ text }) },
      replyWithButtons: async (text, rows) => { replies.push({ text, buttons: rows }) },
    },
  }
}

describe('meta-commands: tryHandleMetaCallback for delete', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void
  let homeOverride: string

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    homeOverride = mkdtempSync(join(tmpdir(), 'meta-cmd-home-'))
    process.env.USERPROFILE = homeOverride
    process.env.HOME = homeOverride
    __resetDeletePickerForTests()
  })
  afterEach(() => {
    cleanup()
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
  })

  test('delete picker tap emits confirmation prompt with Confirm/Cancel buttons', async () => {
    const sid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      `meta:delete_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.acks.length).toBe(1)
    expect(cb.edits.length).toBe(1)
    expect(cb.replies.length).toBe(1)
    expect(cb.replies[0].text).toMatch(/Hapus session/i)
    expect(cb.replies[0].text).toMatch(/PERMANEN/i)
    const buttons = cb.replies[0].buttons!.flat()
    expect(buttons.some(b => b.callbackData === `meta:delete_confirm_${shortId}`)).toBe(true)
    expect(buttons.some(b => b.callbackData === 'meta:delete_cancel')).toBe(true)
  })

  test('delete picker tap for unknown shortId reports picker expired', async () => {
    __resetDeletePickerForTests()
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      'meta:delete_deadbeef',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.acks[0]).toMatch(/expired/i)
    expect(cb.replies.length).toBe(0)
  })
})
```

> **Note on test setup:** the test body for "delete picker tap emits confirmation prompt" needs the same per-test setup as the picker tests in Task 5 (write a jsonl in `~/.claude/projects/<encoded>/`, set heartbeat, redirect HOME/USERPROFILE). Extract a small helper `setupDeletePicker(...)` in the test file to keep these test bodies short rather than duplicating it inline.

The current callback handler interface (`MetaCallbackHandlers`) only has `ackCallback` and `editMessage`. The confirmation prompt also needs to send a NEW reply, so we need to extend the interface. Add `reply` and `replyWithButtons` to `MetaCallbackHandlers`:

```ts
export interface MetaCallbackHandlers {
  ackCallback: (text?: string) => Promise<void>
  editMessage: (text: string) => Promise<void>
  reply: (text: string) => Promise<void>
  replyWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
}
```

The caller in `server.ts` already has `reply` / `replyWithButtons` wired (it uses them for `/new` and `/switch`); plumbing them into the callback handler is a small addition there — Task 6 includes this server-side change.

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test meta-commands.test.ts
```

Expected: the new tests fail (no `meta:delete_<sid>` callback handling yet).

- [ ] **Step 3: Extend `tryHandleMetaCallback` with the delete picker tap branch**

In `meta-commands.ts`, inside `tryHandleMetaCallback`:

```ts
if (rest.startsWith('delete_')) {
  // Branches: `delete_<shortId>` (picker tap), `delete_confirm_<shortId>`, `delete_cancel`
  const remainder = rest.slice('delete_'.length)

  if (remainder === 'cancel') {
    // Handled in Task 8 — placeholder here for routing completeness.
    return false
  }

  if (remainder.startsWith('confirm_')) {
    // Handled in Task 7.
    return false
  }

  // Plain picker tap: `delete_<shortId>`
  const shortId = remainder
  if (!SHORT_ID_RE.test(shortId)) {
    await handlers.ackCallback('Bad short id')
    return true
  }
  const entry = deletePicker.get(shortId)
  if (!entry) {
    await handlers.ackCallback('Picker expired')
    await handlers.editMessage('(picker expired — /delete lagi)').catch(() => {})
    return true
  }

  await handlers.ackCallback('Konfirmasi diperlukan')
  await handlers
    .editMessage(`🗑️ Pilih session untuk dihapus → ${entry.label}`)
    .catch(() => {})
  await handlers.replyWithButtons(
    `Hapus session "${entry.label}"? Ini PERMANEN, tidak bisa di-undo.`,
    [[
      { label: '✅ Confirm', callbackData: `meta:delete_confirm_${shortId}` },
      { label: '❌ Cancel', callbackData: 'meta:delete_cancel' },
    ]],
  )
  return true
}
```

- [ ] **Step 4: Update `server.ts` to plumb `reply`/`replyWithButtons` into the callback handler invocation**

In `plugins/telegram/server.ts`, locate where `tryHandleMetaCallback` is called. Pass the additional fields:

```ts
await tryHandleMetaCallback(
  data,
  process.env,
  {
    ackCallback: async (text?: string) => { await ctx.answerCallbackQuery(text) },
    editMessage: async (text: string) => { await ctx.editMessageText(text) },
    reply: async (text: string) => { await ctx.reply(text) },
    replyWithButtons: async (text, rows) => {
      const kb = new InlineKeyboard()
      rows.forEach((row, idx) => {
        if (idx > 0) kb.row()
        row.forEach(btn => kb.text(btn.label, btn.callbackData))
      })
      await ctx.reply(text, { reply_markup: kb })
    },
  },
)
```

(Mirror the exact wiring the existing `/switch` picker uses for `replyWithButtons` from `tryRouteMetaCommand` calls — copy that adapter to keep behaviour consistent.)

- [ ] **Step 5: Run tests**

```bash
bun test meta-commands.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts plugins/telegram/server.ts
git commit -m "telegram: /delete picker tap emits confirmation prompt"
```

---

## Task 7: Delete confirm callback → re-check + delete

**Goal:** the user taps `✅ Confirm`. The handler re-reads the wrapper's current session id; if the target is now current, abort with a warning. Otherwise `rmSync` the jsonl and edit the message to `🗑️ session "X" dihapus.`

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Modify: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('meta-commands: tryHandleMetaCallback for delete', …)` block from Task 6 (re-uses `setupAndPopulatePicker` defined in Task 5):

```ts
test('delete confirm rmSync the project jsonl and edits message', async () => {
  const sid = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

  const encoded = projectDir.replace(/[\\/:]/g, '-')
  const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
  expect(existsSync(jsonlPath)).toBe(true)

  const cb = makeCallbackHandler()
  const consumed = await tryHandleMetaCallback(
    `meta:delete_confirm_${shortId}`,
    { CLAUDE_PROJECT_DIR: projectDir },
    cb.handler,
  )
  expect(consumed).toBe(true)
  expect(existsSync(jsonlPath)).toBe(false)
  expect(cb.edits[0]).toMatch(/dihapus/)
})

test('delete confirm aborts if target became the current session', async () => {
  const sid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

  // Simulate the user switching to that session between picker tap and confirm tap.
  writeCurrentSessionId(stateDir, sid)

  const encoded = projectDir.replace(/[\\/:]/g, '-')
  const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
  expect(existsSync(jsonlPath)).toBe(true)

  const cb = makeCallbackHandler()
  await tryHandleMetaCallback(
    `meta:delete_confirm_${shortId}`,
    { CLAUDE_PROJECT_DIR: projectDir },
    cb.handler,
  )
  // File NOT deleted.
  expect(existsSync(jsonlPath)).toBe(true)
  expect(cb.acks[0]).toMatch(/aktif/i)
})

test('delete confirm tolerates already-deleted jsonl', async () => {
  const sid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

  // Delete the jsonl out-of-band before tapping confirm.
  const encoded = projectDir.replace(/[\\/:]/g, '-')
  const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
  rmSync(jsonlPath)
  expect(existsSync(jsonlPath)).toBe(false)

  const cb = makeCallbackHandler()
  await tryHandleMetaCallback(
    `meta:delete_confirm_${shortId}`,
    { CLAUDE_PROJECT_DIR: projectDir },
    cb.handler,
  )
  // Treated as success — the desired outcome is "session gone".
  expect(cb.edits[0]).toMatch(/dihapus/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test meta-commands.test.ts
```

Expected: new tests fail — confirm branch not yet implemented.

- [ ] **Step 3: Implement the confirm branch**

In `tryHandleMetaCallback`, replace the Task 6 placeholder for `remainder.startsWith('confirm_')`:

```ts
if (remainder.startsWith('confirm_')) {
  const shortId = remainder.slice('confirm_'.length)
  if (!SHORT_ID_RE.test(shortId)) {
    await handlers.ackCallback('Bad short id')
    return true
  }
  const entry = deletePicker.get(shortId)
  if (!entry) {
    await handlers.ackCallback('Prompt expired')
    await handlers.editMessage('(prompt expired — /delete lagi)').catch(() => {})
    return true
  }

  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.ackCallback('CLAUDE_PROJECT_DIR not set')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (stateDir) {
    const currentSid = readCurrentSessionId(stateDir)
    if (currentSid === entry.sessionId) {
      await handlers.ackCallback('Session aktif tidak bisa dihapus')
      await handlers
        .editMessage(`⚠️ Tidak bisa hapus — "${entry.label}" sekarang session aktif.`)
        .catch(() => {})
      return true
    }
  }

  const encoded = encodeProjectDir(projectDir)
  const jsonlPath = join(homedir(), '.claude', 'projects', encoded, `${entry.sessionId}.jsonl`)
  try {
    rmSync(jsonlPath, { force: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.ackCallback(`Gagal hapus: ${msg}`)
    return true
  }

  await handlers.ackCallback(`session dihapus`)
  await handlers
    .editMessage(`🗑️ session "${entry.label}" dihapus.`)
    .catch(() => {})
  deletePicker.delete(shortId)
  return true
}
```

Imports needed (verify present):

```ts
import { rmSync } from 'node:fs'
import { homedir } from 'node:os'
```

- [ ] **Step 4: Run tests**

```bash
bun test meta-commands.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "telegram: /delete confirm performs rmSync with active-session re-check"
```

---

## Task 8: Delete cancel callback

**Goal:** `meta:delete_cancel` edits the message to `(delete cancelled)`. Distinct from `/switch`'s `meta:cancel` so the message wording is accurate.

**Files:**
- Modify: `plugins/telegram/meta-commands.ts`
- Modify: `plugins/telegram/meta-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `meta-commands.test.ts`:

```ts
test('delete cancel edits message to delete-cancelled', async () => {
  const cb = makeCallbackHandler()
  const consumed = await tryHandleMetaCallback(
    'meta:delete_cancel',
    { CLAUDE_PROJECT_DIR: projectDir },
    cb.handler,
  )
  expect(consumed).toBe(true)
  expect(cb.acks[0]).toMatch(/cancelled/i)
  expect(cb.edits[0]).toMatch(/delete cancelled/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test meta-commands.test.ts
```

Expected: fail — `meta:delete_cancel` currently returns false (placeholder from Task 6).

- [ ] **Step 3: Implement the cancel branch**

Replace the Task 6 placeholder for `remainder === 'cancel'`:

```ts
if (remainder === 'cancel') {
  await handlers.ackCallback('Cancelled')
  await handlers.editMessage('(delete cancelled)').catch(() => {})
  return true
}
```

- [ ] **Step 4: Run tests**

```bash
bun test meta-commands.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/meta-commands.ts plugins/telegram/meta-commands.test.ts
git commit -m "telegram: /delete cancel edits message to (delete cancelled)"
```

---

## Task 9: Version bumps and smoke test

**Goal:** bump both plugin manifests, run the full test suite, and walk through an end-to-end smoke test.

**Files:**
- Modify: `plugins/telegram/.claude-plugin/plugin.json`
- Modify: `plugins/pty-controller/.claude-plugin/plugin.json`

- [ ] **Step 1: Bump telegram manifest**

In `plugins/telegram/.claude-plugin/plugin.json`, change `"version": "0.0.11-mirza.5"` to `"version": "0.0.11-mirza.6"`.

- [ ] **Step 2: Bump pty-controller manifest**

In `plugins/pty-controller/.claude-plugin/plugin.json`, change `"version": "0.0.7"` to `"version": "0.0.8"`.

- [ ] **Step 3: Run full plugin test suite**

```bash
cd C:/Users/Mirza/workspace/mirza-marketplace/plugins/telegram
bun test
```

Expected: all tests pass (existing + new).

```bash
cd C:/Users/Mirza/workspace/mirza-marketplace/plugins/pty-controller/wrapper
npx tsc --noEmit -p tsconfig.json
```

Expected: clean (no output).

- [ ] **Step 4: Manual end-to-end smoke test**

Exit the current CC session (its parent wrapper will shut down, the chat session ends).

Relaunch via the updated `run_claude.txt` recipe:

```
set CLAUDE_PROJECT_DIR=C:\Users\Mirza\workspace\bot-01
npm --prefix C:\Users\Mirza\workspace\mirza-marketplace\plugins\pty-controller\wrapper run wrapper
```

Once CC's prompt is back:

1. **Verify `wrapper.current_session_id` exists.** From another shell:

   ```
   type C:\Users\Mirza\workspace\bot-01\.claude\channels\pty-controller\wrapper.current_session_id
   ```

   Expected: a UUID string.

2. **Test `/new` with no arg.** In Telegram, send `/new`. Expected reply: `⚠️ /new butuh nama session. Contoh: /new bahas MCP`. No new session created.

3. **Test `/new bahas MCP`.** Expected: `🔄 Clearing session — fresh session "bahas MCP" sebentar lagi siap.` Within a few seconds, the fresh session pings Telegram with a sapaan. Inside CC, `/sessions` (or whatever picker shows session names) lists this session as "bahas MCP". `wrapper.current_session_id` now points to the new session.

4. **Test `/switch`.** Pick a different session. Expected: PTY does not flicker; CC swaps in-place; `wrapper.current_session_id` updates to the chosen sid.

5. **Test `/delete` happy path.** Send `/delete`. Picker excludes the current session. Tap a non-current session. Get the confirmation prompt. Tap `✅ Confirm`. The picker message edits to `🗑️ session "X" dihapus.` Verify the jsonl is gone:

   ```
   dir C:\Users\Mirza\.claude\projects\C--Users-Mirza-workspace-bot-01\
   ```

6. **Test `/delete` with empty list.** If only the current session remains, `/delete` replies `Tidak ada session lain yang bisa dihapus.`

7. **Test `/delete` cancel.** Send `/delete`, tap a session, tap `❌ Cancel`. Message edits to `(delete cancelled)`. The jsonl is still there.

- [ ] **Step 5: Commit version bumps**

```bash
git add plugins/telegram/.claude-plugin/plugin.json plugins/pty-controller/.claude-plugin/plugin.json
git commit -m "telegram+pty-controller: version bump for session management features"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```
