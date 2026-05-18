#!/usr/bin/env node
/**
 * mirza-cc wrapper — the parent process that hosts Claude Code inside a
 * node-pty pseudo-terminal and accepts slash-command requests from the
 * companion `pty-controller` Claude Code plugin via a filesystem inbox.
 *
 * Responsibilities (Phase 1):
 *   1. Spawn `claude` in a PTY, bidirectional-pipe with the user's terminal.
 *   2. Resolve a state dir (per-project) and create the inbox layout.
 *   3. Watch <state>/pending/ for command files; consume each one and write
 *      its slash command into the PTY.
 *   4. Periodically touch <state>/wrapper.heartbeat so the plugin can probe
 *      whether we're alive.
 *   5. After injecting /clear specifically, wait for a new session .jsonl
 *      file to appear in ~/.claude/projects/<encoded-cwd>/ — then inject
 *      /notify-user so the fresh AI session can ping Telegram.
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
  readdirSync,
  rmSync,
  statSync,
  existsSync,
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

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
const isWindows = process.platform === 'win32'

// Encode project dir the same way CC does for ~/.claude/projects/<encoded>/.
// CC replaces `:` and `\` with `-` and prefixes drive letters: C:\Users\Mirza\workspace\bot-01
// becomes C--Users-Mirza-workspace-bot-01. This matches the encoded paths we
// observed in ~/.claude/projects/.
function encodeProjectDir(p: string): string {
  return p.replace(/[\\/:]/g, '-')
}
const CLAUDE_PROJECTS_DIR = join(
  homedir(),
  '.claude',
  'projects',
  encodeProjectDir(PROJECT_DIR),
)

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
log(`  claude sessions in: ${CLAUDE_PROJECTS_DIR}`)

// Snapshot known session jsonl files so we can detect "fresh session was
// created" later (used to decide when to inject /notify-user).
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

// Spawn Claude under a PTY. Inherit terminal dimensions so the UI looks right.
const cols = process.stdout.columns || 100
const rows = process.stdout.rows || 30
const shell = isWindows ? 'cmd.exe' : CLAUDE_BIN
const args = isWindows ? ['/c', CLAUDE_BIN] : []

const pty: IPty = spawn(shell, args, {
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
log(`spawned claude (pid ${pty.pid})`)

// PTY → user terminal (pass-through).
pty.onData(data => {
  process.stdout.write(data)
})

// User terminal → PTY (raw mode so keypresses go straight through).
process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', chunk => {
  pty.write(chunk.toString('utf8'))
})

// Re-propagate terminal resizes to the PTY so CC re-renders correctly.
process.stdout.on('resize', () => {
  pty.resize(process.stdout.columns || 100, process.stdout.rows || 30)
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

// Track pending /clear → expect a new session file → then inject /notify-user.
// Mirrored as a small state machine because the timing is order-sensitive:
// the new .jsonl appears only after CC consumes /clear, which only happens
// after the current turn ends. We poll instead of relying on fs.watch
// because fs.watch on Windows for create events is historically flaky.
let awaitingClearReady: { sessionsBefore: Set<string> } | null = null
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) return
  const current = listSessions()
  for (const f of current) {
    if (!awaitingClearReady.sessionsBefore.has(f)) {
      log(`fresh session detected: ${f} — injecting /notify-user`)
      awaitingClearReady = null
      pty.write('/notify-user\r')
      return
    }
  }
}, 500)

// Consume one pending command file: parse, delete, inject keystrokes.
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

  let payload: { id?: string; command?: string }
  try {
    payload = JSON.parse(raw)
  } catch (err) {
    log(`malformed json in ${filename}: ${err}`)
    return
  }
  const command = payload.command
  if (typeof command !== 'string' || !command.startsWith('/')) {
    log(`ignored ${filename}: missing or non-slash command`)
    return
  }

  log(`injecting "${command}" (id: ${payload.id ?? '?'})`)
  pty.write(`${command}\r`)

  // Special case: /clear → start watching for the next fresh session jsonl
  // so we can chain /notify-user once CC re-initializes.
  if (command === '/clear') {
    awaitingClearReady = { sessionsBefore: listSessions() }
    log(`awaiting fresh session after /clear`)
  }
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
  clearInterval(sessionPollInterval)
  clearInterval(sweepInterval)
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

pty.onExit(({ exitCode, signal }) => {
  log(`claude exited (code=${exitCode}, signal=${signal ?? 'none'})`)
  shutdown(exitCode ?? 0)
})

// Forward SIGINT to PTY so Ctrl+C inside the wrapper terminal still cancels
// whatever the AI is doing inside CC, rather than killing the wrapper outright.
process.on('SIGINT', () => {
  log(`SIGINT received — forwarding to PTY`)
  pty.kill('SIGINT')
})

process.on('SIGTERM', () => {
  log(`SIGTERM received — killing PTY`)
  pty.kill()
})
