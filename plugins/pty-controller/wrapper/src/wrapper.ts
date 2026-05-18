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
  watch,
  type FSWatcher,
} from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const PROJECT_DIR = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
const STATE_DIR = join(PROJECT_DIR, '.claude', 'channels', 'pty-controller')
const PENDING_DIR = join(STATE_DIR, 'pending')
const HEARTBEAT_FILE = join(STATE_DIR, 'wrapper.heartbeat')
const LOG_FILE = join(STATE_DIR, 'wrapper.log')

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
// Default flags load mirza-marketplace's telegram channel (which isn't on
// Anthropic's allowlist yet — channel plugins are research-preview) and
// silence the per-tool permission prompts. Override with CLAUDE_ARGS env
// var (set to empty string for vanilla claude, or any custom flag string).
const DEFAULT_CLAUDE_ARGS =
  '--dangerously-skip-permissions ' +
  '--dangerously-load-development-channels plugin:telegram@mirza-marketplace'
const CLAUDE_ARGS = (process.env.CLAUDE_ARGS ?? DEFAULT_CLAUDE_ARGS)
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
log(`  claude args:        ${CLAUDE_ARGS.join(' ') || '(none)'}`)

// Spawn Claude under a PTY. Inherit terminal dimensions so the UI looks right.
//
// Important: on Unix, do NOT pass `claude` directly to node-pty. `claude` is
// typically a node-installed shim (npm/pnpm/asdf) whose execution depends on
// shell-resolved PATH and rc-files. Bypassing the shell triggers
// posix_spawnp ENOENT or "exec format error". So we run through an
// interactive login shell that loads the user's normal env (PATH from
// .zprofile/.bashrc/etc.) and then execs claude.
//
// On Windows, cmd.exe `/c claude` is the equivalent dance — cmd resolves the
// `claude.cmd` shim that npm produces.
const cols = process.stdout.columns || 100
const rows = process.stdout.rows || 30
const userShell = process.env.SHELL || '/bin/sh'
const shell = isWindows ? 'cmd.exe' : userShell
// Compose the full `claude <args...>` command line as a single string for
// the shell to parse. Flag values like `plugin:telegram@mirza-marketplace`
// contain `:` and `@` which are safe characters in POSIX shells (no
// quoting required); if you ever need a value with spaces, wrap it
// yourself in CLAUDE_ARGS.
const claudeCmd = [CLAUDE_BIN, ...CLAUDE_ARGS].join(' ')
const args = isWindows ? ['/c', claudeCmd] : ['-l', '-i', '-c', claudeCmd]

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
