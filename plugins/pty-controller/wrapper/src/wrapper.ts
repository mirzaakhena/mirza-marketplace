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
 *      for a new session jsonl. When one appears, the fresh AI session is
 *      live — at that point inject `/notify-user <brief>` so the new session
 *      pings the user on Telegram instead of staying silently fresh.
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
  watch,
  type FSWatcher,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import process from 'node:process'

const PROJECT_DIR = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
const STATE_DIR = join(PROJECT_DIR, '.claude', 'channels', 'pty-controller')
const PENDING_DIR = join(STATE_DIR, 'pending')
const HEARTBEAT_FILE = join(STATE_DIR, 'wrapper.heartbeat')
const LOG_FILE = join(STATE_DIR, 'wrapper.log')

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

// Brief sent as $ARGUMENTS to the /notify-user command in the fresh
// post-/clear session. /notify-user reads the brief, constructs a natural
// message itself, and resolves chat_id from access.json — so we don't need
// to pass any chat-routing data through here.
const POST_CLEAR_NOTIFY_BRIEF =
  'fresh session siap setelah /clear, sapa user singkat dan tanya mau lanjut apa'

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

const userShell = process.env.SHELL || '/bin/sh'
const shell = isWindows ? 'cmd.exe' : userShell

/**
 * Spawn Claude under a fresh PTY and return the IPty handle.
 *
 * Implementation note (Unix): we run through an interactive login shell so
 * `claude` resolves through the user's PATH/rc-files. Skipping the shell
 * triggers posix_spawnp ENOENT for the npm-installed shim.
 */
function spawnClaudePty(): IPty {
  const cols = process.stdout.columns || 100
  const rows = process.stdout.rows || 30
  const claudeCmd = [CLAUDE_BIN, ...BASE_CLAUDE_ARGS].join(' ')
  const args = isWindows ? ['/c', claudeCmd] : ['-l', '-i', '-c', claudeCmd]

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
  return p
}

const currentPty: IPty = spawnClaudePty()
// Post-/clear state machine. Once we inject /clear, we snapshot the existing
// session jsonl files and start polling for a new one to appear — its
// appearance signals that the fresh CC session is live and ready to accept
// `/notify-user`. Null means we're not currently waiting.
let awaitingClearReady: { sessionsBefore: Set<string> } | null = null

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
      log(`fresh session detected: ${sid} — injecting /notify-user`)
      writeCurrentSessionId(sid)
      awaitingClearReady = null
      currentPty.write(`/notify-user ${POST_CLEAR_NOTIFY_BRIEF}\r`)
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
    currentPty.write(`${command}\r`)
    // After /clear, CC will materialise a new session jsonl. Snapshot
    // existing sessions now so the poll loop can spot the new one and
    // chain /notify-user into the fresh AI session. The snapshot is
    // taken eagerly (immediately after writing /clear) because CC won't
    // process the keystroke until the current AI turn ends — the new
    // session file appears strictly after that, so we won't accidentally
    // pick it up as "already there".
    if (command === '/clear') {
      awaitingClearReady = { sessionsBefore: listSessions() }
      log(`awaiting fresh session after /clear`)
    }
    return
  }

  if (type === 'switch') {
    const sid = payload.sessionId
    if (typeof sid !== 'string' || !sid) {
      log(`ignored ${filename}: switch payload missing sessionId`)
      return
    }
    // Inject `/resume <sid>` as keystrokes into the live PTY rather than
    // killing CC and respawning with `--resume`. The slash command lands in
    // CC's input loop on its next tick (after the current AI turn completes,
    // same constraint as /clear) and CC does the session swap in-process —
    // no terminal flicker, no wrapper respawn, no PTY teardown.
    log(`switch requested → injecting "/resume ${sid}" (id: ${payload.id ?? '?'})`)
    writeCurrentSessionId(sid)
    currentPty.write(`/resume ${sid}\r`)
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
