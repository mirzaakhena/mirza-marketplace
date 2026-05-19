#!/usr/bin/env node
/**
 * mirza-cc wrapper — the parent process that hosts Claude Code inside a
 * node-pty pseudo-terminal and accepts requests from the companion
 * `pty-controller` Claude Code plugin via a filesystem inbox.
 *
 * Responsibilities:
 *   1. Spawn `claude` in a PTY, bidirectional-pipe with the user's terminal.
 *   2. Resolve a per-project state dir and create the inbox layout.
 *   3. Watch <state>/pending/ for command files; consume each one. Payload
 *      shape (tagged union):
 *        { command: "/clear" }                    — inject a slash command
 *        { type: "slash", command: "/clear" }     — explicit form, same thing
 *        { type: "switch", sessionId: "<uuid>" }  — inject `/resume <uuid>`
 *                                                   as keystrokes into the
 *                                                   live PTY
 *   4. Periodically touch <state>/wrapper.heartbeat so the plugin can probe
 *      whether we're alive.
 *   5. After injecting /clear specifically, poll ~/.claude/projects/<encoded>/
 *      for a new session jsonl. When one appears, drop a "session-change"
 *      event into <telegram-state>/system-outbox/ so the telegram plugin
 *      can ping the user about the new session via direct bot.api — no
 *      AI roundtrip required. /switch writes the same event the moment it
 *      injects /resume.
 *
 * The wrapper hosts a single CC process for its entire lifetime. /switch no
 * longer kills and respawns CC with `--resume` — instead it injects the
 * `/resume <sessionId>` slash command into the existing PTY, so the session
 * swap happens inside CC itself rather than at the process boundary. When CC
 * exits, the wrapper exits with it. A SIGINT in the wrapper terminal is
 * forwarded to the PTY so Ctrl+C cancels the AI's current operation rather
 * than killing the wrapper.
 *
 * Run:
 *   npm run wrapper                 # uses tsx (Node)
 *
 * The plugin agrees on the state dir via the PTY_CONTROLLER_STATE_DIR env
 * we set before spawning Claude. The plugin's `resolveStateDir` checks this
 * env first, so the two sides land in the same directory regardless of how
 * the user normally runs Claude.
 */
import { spawn, type IPty } from 'node-pty'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  existsSync,
  renameSync,
  statSync,
  watch,
  type FSWatcher,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import process from 'node:process'

const PROJECT_DIR = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
const STATE_DIR = join(PROJECT_DIR, '.claude', 'channels', 'pty-controller')
const PENDING_DIR = join(STATE_DIR, 'pending')
const HEARTBEAT_FILE = join(STATE_DIR, 'wrapper.heartbeat')
const LOG_FILE = join(STATE_DIR, 'wrapper.log')

// The telegram plugin's state dir lives as a sibling of ours. We write
// "system-outbox" events here for the telegram plugin's server.ts to pick
// up and translate into bot.api Telegram messages without involving an
// AI roundtrip. Coupling between wrapper (pty-controller plugin) and
// telegram plugin is acceptable: both are owned by the same maintainer
// and the contract is small (a typed JSON payload).
const TELEGRAM_STATE_DIR = join(PROJECT_DIR, '.claude', 'channels', 'telegram')
const SYSTEM_OUTBOX_DIR = join(TELEGRAM_STATE_DIR, 'system-outbox')

// Encode the project dir the way CC does for ~/.claude/projects/<encoded>/.
// CC replaces `:`, `/`, and `\` with `-`, so e.g. C:\Users\Mirza\workspace\bot-01
// becomes C--Users-Mirza-workspace-bot-01. We use this to spot the .jsonl
// file CC creates for a freshly-started conversation (post-/clear) so we
// can chain `/notify-user` into that fresh session.
function encodeProjectDir(p: string): string {
  return p.replace(/[\\/:]/g, '-')
}
const CLAUDE_PROJECTS_DIR = join(
  homedir(),
  '.claude',
  'projects',
  encodeProjectDir(PROJECT_DIR),
)

// Tracks the CC session currently live in this wrapper's PTY. Written on
// initial spawn, after /clear materialises a fresh session, and after a
// /resume injection. Consumed by the telegram plugin's /delete picker so
// the active session can be excluded from the deletion list.
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

// Pacing between chained PTY injections. 1000ms is the empirical floor at
// which CC's slash-command parser reliably digests the previous command
// before the next write lands. Used by the post-/clear chain (/rename +
// /notify-user) and by the post-/switch outbox event.
const POST_INJECTION_DELAY_MS = 1000

// Delay between writing a slash-command's text and the trailing Enter.
// Empirically, writing `text + \r` as one PTY chunk lets CC's autocomplete
// picker swallow the \r (for namespaced commands like /telegram:foo, the
// picker stays open until the input "settles"). Splitting into two writes
// separated by a brief delay mimics a human pause between typing and
// pressing Enter, so CC treats the trailing \r as a top-level "submit"
// rather than a "select from picker" action.
const SUBMIT_DELAY_MS = 250

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
// Default flags load mirza-marketplace's telegram channel (which isn't on
// Anthropic's allowlist yet — channel plugins are research-preview) and
// silence the per-tool permission prompts. Override with CLAUDE_ARGS env
// var (set to empty string for vanilla claude, or any custom flag string).
const DEFAULT_CLAUDE_ARGS =
  '--dangerously-skip-permissions ' +
  '--dangerously-load-development-channels plugin:telegram@mirza-marketplace'
const BASE_CLAUDE_ARGS = (process.env.CLAUDE_ARGS ?? DEFAULT_CLAUDE_ARGS)
  .trim()
  .split(/\s+/)
  .filter(Boolean)
const isWindows = process.platform === 'win32'

mkdirSync(PENDING_DIR, { recursive: true })

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.error(line)
  try {
    writeFileSync(LOG_FILE, line + '\n', { flag: 'a' })
  } catch {
    /* best-effort */
  }
}

log(`wrapper starting`)
log(`  project dir:        ${PROJECT_DIR}`)
log(`  state dir:          ${STATE_DIR}`)
log(`  claude bin:         ${CLAUDE_BIN}`)
log(`  claude args:        ${BASE_CLAUDE_ARGS.join(' ') || '(none)'}`)
log(`  claude sessions in: ${CLAUDE_PROJECTS_DIR}`)

// Snapshot known session jsonl files. Used by the post-/clear state machine
// to detect when CC has materialised a freshly-started conversation.
function listSessions(): Set<string> {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return new Set()
  try {
    return new Set(
      readdirSync(CLAUDE_PROJECTS_DIR).filter(f => f.endsWith('.jsonl')),
    )
  } catch {
    return new Set()
  }
}

// Resolve the telegram plugin's state dir. Mirrors the plugin's own
// resolveTelegramStateDir logic: prefer the explicit CLAUDE_CHANNELS_DIR
// env if set, else fall back to <CLAUDE_PROJECT_DIR>/.claude/channels/telegram.
function resolveTelegramStateDir(): string | null {
  const explicit = process.env.CLAUDE_CHANNELS_DIR?.trim()
  if (explicit) return join(explicit, 'telegram')
  const proj = process.env.CLAUDE_PROJECT_DIR?.trim()
  if (!proj) return null
  return join(proj, '.claude', 'channels', 'telegram')
}

// Mirror of `setName` from plugins/telegram/session-names-registry.ts.
// Duplicated rather than imported to avoid a cross-package dependency
// (Option β per the design spec). Best-effort: errors are swallowed.
function writeTelegramRegistryName(sessionId: string, name: string): void {
  const dir = resolveTelegramStateDir()
  if (!dir) return
  const path = join(dir, 'session-names.json')
  let obj: Record<string, { name: string; updatedAt: number }> = {}
  try {
    obj = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    /* missing/malformed → start fresh */
  }
  obj[sessionId] = { name, updatedAt: Date.now() }
  try {
    mkdirSync(dir, { recursive: true })
    const tmp = `${path}.tmp.${process.pid}`
    writeFileSync(tmp, JSON.stringify(obj, null, 2))
    renameSync(tmp, path)
  } catch (err) {
    log(`failed to write telegram registry: ${err}`)
  }
}

const userShell = process.env.SHELL || '/bin/sh'
const shell = isWindows ? 'cmd.exe' : userShell

/**
 * Decide whether to start a fresh `claude` or resume the most-recently-modified
 * session in this project. Returns the args to splice in front of BASE_CLAUDE_ARGS
 * and a flag for the post-spawn first-run logic.
 *
 * "Latest" = jsonl with the highest mtimeMs. Ties (same mtime to the millisecond)
 * are unlikely in practice; if they happen, an arbitrary winner is fine — both
 * are equally recent.
 */
function chooseStartupArgs(): {
  resumeArgs: string[]
  isFirstRun: boolean
  latestSessionId: string | null
} {
  const files = listSessions()
  if (files.size === 0) {
    return { resumeArgs: [], isFirstRun: true, latestSessionId: null }
  }
  let latestId: string | null = null
  let latestMtime = -1
  for (const f of files) {
    const id = f.slice(0, -'.jsonl'.length)
    let mtime = 0
    try {
      mtime = statSync(join(CLAUDE_PROJECTS_DIR, f)).mtimeMs
    } catch {
      continue
    }
    if (mtime > latestMtime) {
      latestMtime = mtime
      latestId = id
    }
  }
  if (!latestId) return { resumeArgs: [], isFirstRun: true, latestSessionId: null }
  return {
    resumeArgs: ['--resume', latestId],
    isFirstRun: false,
    latestSessionId: latestId,
  }
}

/**
 * Spawn Claude under a fresh PTY and return the IPty handle.
 *
 * Implementation note (Unix): we run through an interactive login shell so
 * `claude` resolves through the user's PATH/rc-files. Skipping the shell
 * triggers posix_spawnp ENOENT for the npm-installed shim.
 */
function spawnClaudePty(): { pty: IPty; startup: ReturnType<typeof chooseStartupArgs> } {
  const cols = process.stdout.columns || 100
  const rows = process.stdout.rows || 30
  const startup = chooseStartupArgs()
  const claudeArgs = [...startup.resumeArgs, ...BASE_CLAUDE_ARGS]
  const claudeCmd = [CLAUDE_BIN, ...claudeArgs].join(' ')
  const args = isWindows ? ['/c', claudeCmd] : ['-l', '-i', '-c', claudeCmd]
  log(
    `startup: ${
      startup.isFirstRun
        ? 'first-run (no existing sessions)'
        : `resuming session ${startup.latestSessionId}`
    }`,
  )
  const p = spawn(shell, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: PROJECT_DIR,
    env: {
      ...(process.env as Record<string, string>),
      CLAUDE_PROJECT_DIR: PROJECT_DIR,
      PTY_CONTROLLER_STATE_DIR: STATE_DIR,
    },
  })
  log(`spawned claude (pid ${p.pid})`)
  return { pty: p, startup }
}

const _spawn = spawnClaudePty()
const currentPty: IPty = _spawn.pty
const startupMode = _spawn.startup

/**
 * Inject a slash command into the PTY, separating the command text from
 * the submitting Enter (\r) by SUBMIT_DELAY_MS. See SUBMIT_DELAY_MS for
 * why splitting is necessary — short version: namespaced plugin commands
 * (`/telegram:foo`) keep CC's autocomplete picker open, and a \r arriving
 * in the same chunk gets swallowed by the picker instead of submitting.
 */
function injectSlashCommand(cmd: string): void {
  currentPty.write(cmd)
  setTimeout(() => currentPty.write('\r'), SUBMIT_DELAY_MS)
}

/**
 * Drop a typed JSON event into the telegram plugin's system-outbox dir.
 * The plugin's server.ts watches that directory and translates each
 * event into a Telegram bot.api send — bypassing CC entirely (no AI
 * roundtrip needed to ping the user about a session change).
 *
 * Atomic write via temp+rename so the plugin never reads a half-written
 * file. Best-effort: errors are logged, not thrown.
 */
function writeSystemOutbox(payload: Record<string, unknown>): void {
  try {
    mkdirSync(SYSTEM_OUTBOX_DIR, { recursive: true })
    const id = randomUUID()
    const final = join(SYSTEM_OUTBOX_DIR, `${id}.json`)
    const tmp = `${final}.tmp.${process.pid}`
    const full = { id, ts: new Date().toISOString(), ...payload }
    writeFileSync(tmp, JSON.stringify(full, null, 2))
    renameSync(tmp, final)
    log(`wrote system-outbox: ${id} ${JSON.stringify(payload)}`)
  } catch (err) {
    log(`failed to write system-outbox: ${err}`)
  }
}

// Post-/clear state machine. Once we inject /clear, we snapshot the existing
// session jsonl files and start polling for a new one to appear — its
// appearance signals that the fresh CC session is live and ready to accept
// `/notify-user`. Null means we're not currently waiting.
let awaitingClearReady:
  | { sessionsBefore: Set<string>; sessionName?: string }
  | null = null

currentPty.onData(data => {
  process.stdout.write(data)
})
currentPty.onExit(({ exitCode, signal }) => {
  log(`claude exited (code=${exitCode}, signal=${signal ?? 'none'})`)
  shutdown(exitCode ?? 0)
})

// User terminal → PTY (raw mode so keypresses go straight through).
process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', chunk => {
  currentPty.write(chunk.toString('utf8'))
})

// Re-propagate terminal resizes to the PTY.
process.stdout.on('resize', () => {
  currentPty.resize(process.stdout.columns || 100, process.stdout.rows || 30)
})

// Heartbeat — plugin probes freshness of this file to confirm wrapper is alive.
const heartbeatInterval = setInterval(() => {
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
  } catch (err) {
    log(`heartbeat write failed: ${err}`)
  }
}, 5_000)
writeFileSync(HEARTBEAT_FILE, new Date().toISOString())

// Post-/clear poll. Cheap (one readdir every 500ms) and only does work when
// `awaitingClearReady` is set, so the steady-state cost is negligible.
// We poll instead of fs.watch because fs.watch's create-event coverage on
// Windows is historically flaky and this path needs to be reliable.
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) return
  const current = listSessions()
  for (const f of current) {
    if (!awaitingClearReady.sessionsBefore.has(f)) {
      const sid = f.slice(0, -'.jsonl'.length)
      const { sessionName } = awaitingClearReady
      log(
        `fresh session detected: ${sid} — injecting${
          sessionName ? ` /rename (+${POST_INJECTION_DELAY_MS}ms) + /notify-user` : ` /notify-user`
        }`,
      )
      writeCurrentSessionId(sid)
      awaitingClearReady = null
      // Pace /rename so CC has time to process it before the system-outbox
      // event fires — the event triggers a Telegram-side "switch to session"
      // message, and we want it to land AFTER /rename has settled so the
      // session-names registry (used to resolve the new session's label) is
      // already up to date.
      let delay = 0
      if (sessionName) {
        writeTelegramRegistryName(sid, sessionName)
        const localName = sessionName
        setTimeout(() => injectSlashCommand(`/rename ${localName}`), delay)
        delay += POST_INJECTION_DELAY_MS
      }
      // Notify the user via direct bot.api send (no AI roundtrip). The
      // payload carries `sessionName` if we just renamed, so the plugin
      // doesn't have to race the registry refresh to find the label.
      setTimeout(
        () =>
          writeSystemOutbox({
            type: 'session-change',
            sessionId: sid,
            sessionName: sessionName ?? null,
          }),
        delay,
      )
      return
    }
  }
}, 500)

// One-shot: after CC starts, poll for the first session jsonl to appear
// and record its id as the current session. Used by the telegram plugin's
// /delete to exclude the active session from the picker. Mirrors the
// post-/clear poll above but clears itself on first detection.
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

// Consume one pending command file: parse, delete, dispatch.
async function consumePending(filename: string): Promise<void> {
  const path = join(PENDING_DIR, filename)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    log(`failed to read ${filename}: ${err}`)
    return
  }
  // Delete eagerly to avoid double-processing if we crash mid-handle.
  try {
    rmSync(path)
  } catch {
    /* swallow — already gone is fine */
  }

  let payload: {
    id?: string
    type?: string
    command?: string
    sessionId?: string
    sessionName?: string
  }
  try {
    payload = JSON.parse(raw)
  } catch (err) {
    log(`malformed json in ${filename}: ${err}`)
    return
  }

  const type = payload.type ?? 'slash'
  if (type === 'slash') {
    const command = payload.command
    if (typeof command !== 'string' || !command.startsWith('/')) {
      log(`ignored ${filename}: missing or non-slash command`)
      return
    }
    log(`injecting "${command}" (id: ${payload.id ?? '?'})`)
    injectSlashCommand(command)
    // After /clear, CC will materialise a new session jsonl. Snapshot
    // existing sessions now so the poll loop can spot the new one and
    // chain /notify-user into the fresh AI session. The snapshot is
    // taken eagerly (immediately after writing /clear) because CC won't
    // process the keystroke until the current AI turn ends — the new
    // session file appears strictly after that, so we won't accidentally
    // pick it up as "already there".
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
    return
  }

  if (type === 'switch') {
    const sid = payload.sessionId
    if (typeof sid !== 'string' || !sid) {
      log(`ignored ${filename}: switch payload missing sessionId`)
      return
    }
    const sessionName =
      typeof (payload as { sessionName?: unknown }).sessionName === 'string'
        ? ((payload as { sessionName: string }).sessionName as string)
        : null
    log(
      `switch requested → injecting "/resume ${sid}"` +
        (sessionName ? ` (label: "${sessionName}")` : '') +
        ` (id: ${payload.id ?? '?'})`,
    )
    writeCurrentSessionId(sid)
    injectSlashCommand(`/resume ${sid}`)
    // Delay matches the post-/clear path so the plugin's session-change
    // handler sees a consistent rhythm and CC has time to fully swap before
    // the user-facing transition message lands.
    setTimeout(() => {
      writeSystemOutbox({
        type: 'session-change',
        sessionId: sid,
        sessionName,
      })
    }, POST_INJECTION_DELAY_MS)
    return
  }

  log(`ignored ${filename}: unknown payload type "${type}"`)
}

// Watch pending dir. fs.watch covers the happy path; the interval is a
// belt-and-suspenders fallback for the case where fs.watch silently misses
// an event on Windows (it happens, especially with rapid create+delete).
const pendingWatcher: FSWatcher = watch(PENDING_DIR, (_eventType, filename) => {
  if (!filename) return
  if (!filename.toString().endsWith('.json')) return
  const filenameStr = filename.toString()
  // Defer briefly so the writer's rename has time to commit on Windows.
  setTimeout(() => {
    const full = join(PENDING_DIR, filenameStr)
    if (!existsSync(full)) return
    void consumePending(filenameStr)
  }, 50)
})
const sweepInterval = setInterval(() => {
  try {
    for (const f of readdirSync(PENDING_DIR)) {
      if (!f.endsWith('.json')) continue
      // Skip .tmp.<pid> files — those are mid-write.
      if (f.includes('.tmp.')) continue
      void consumePending(f)
    }
  } catch {
    /* ignore — dir might be missing transiently */
  }
}, 2_000)

function shutdown(code: number): void {
  clearInterval(heartbeatInterval)
  clearInterval(sweepInterval)
  clearInterval(sessionPollInterval)
  clearInterval(initialSessionPoll)
  pendingWatcher.close()
  try {
    rmSync(HEARTBEAT_FILE)
  } catch {
    /* ignore */
  }
  process.stdin.setRawMode?.(false)
  process.stdin.pause()
  log(`wrapper shutting down (code=${code})`)
  process.exit(code)
}

// Forward SIGINT to PTY so Ctrl+C inside the wrapper terminal still cancels
// whatever the AI is doing inside CC, rather than killing the wrapper outright.
process.on('SIGINT', () => {
  log(`SIGINT received — forwarding to PTY`)
  currentPty.kill('SIGINT')
})

process.on('SIGTERM', () => {
  log(`SIGTERM received — killing PTY`)
  currentPty.kill()
})
