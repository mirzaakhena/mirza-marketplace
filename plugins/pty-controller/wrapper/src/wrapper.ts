#!/usr/bin/env node
/**
 * mirza-cc wrapper — the parent process that hosts Claude Code inside a
 * node-pty pseudo-terminal and accepts requests from the companion
 * `pty-controller` Claude Code plugin via a filesystem inbox.
 *
 * Responsibilities:
 *   1. Spawn `claude` in a PTY, bidirectional-pipe with the user's terminal.
 *   2. Resolve a per-project state dir and create the inbox layout.
 *   3. Watch <state>/pending/ for command files; consume each one into a
 *      FIFO queue drained one item at a time behind an injection gate
 *      (min-gap between injections; hard barrier while CC rebuilds a
 *      session post-/clear — see InjectionGate / BUG #3). Payload
 *      shape (tagged union, or an array for a batch):
 *        { command: "/clear" }                    — inject a slash command
 *        { type: "slash", command: "/clear" }     — explicit form, same thing
 *        { type: "switch", sessionId: "<uuid>" }  — inject `/resume <uuid>`
 *                                                   as keystrokes into the
 *                                                   live PTY
 *        [ {command:"/a"}, {command:"/b"} ]       — BATCH: ordered slash
 *                                                   items enqueued contiguously
 *                                                   (atomic — no foreign payload
 *                                                   can interleave); when the
 *                                                   batch contains /clear, the
 *                                                   session-change notification
 *                                                   is deferred to the END of
 *                                                   the batch so it carries the
 *                                                   final session name
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
  openSync,
  closeSync,
  type FSWatcher,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promptTextFromPayload, chunkPromptText } from './prompt-inject'
import { validateBatch } from './batch'
import { renameArgFromCommand, type Lifecycle } from './session-name'
import {
  buildNextState,
  writeSessionState,
  parseStatuslineSnapshot,
  resolveResumeName,
  shouldAdoptStatuslineName,
  type SessionState,
  type RegistryEntry,
} from './session-state'
import { InjectionGate } from './injection-gate'

// Portable equivalent of __dirname under ES modules. `import.meta.dir` only
// exists on Bun; the wrapper actually runs under tsx (Node), where we need
// fileURLToPath + dirname.
const SELF_DIR = dirname(fileURLToPath(import.meta.url))

const PROJECT_DIR = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
const STATE_DIR = join(PROJECT_DIR, '.claude', 'channels', 'pty-controller')
const PENDING_DIR = join(STATE_DIR, 'pending')
const HEARTBEAT_FILE = join(STATE_DIR, 'wrapper.heartbeat')
const PID_FILE = join(STATE_DIR, 'wrapper.pid')
const LOG_FILE = join(STATE_DIR, 'wrapper.log')
// Versions of the pty-controller plugin and this wrapper sub-package, written
// once at boot so peer plugins (e.g. telegram /status) can surface them
// without needing to know where the plugin source lives on disk.
const VERSION_FILE = join(STATE_DIR, 'wrapper.version')

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

// Companion to wrapper.current_session_id: the live session's display name,
// as far as the wrapper knows it. Written at every point where the wrapper
// LEARNS the name — the /clear+sessionName chain (telegram /new), a /rename
// injection, a /switch payload, and the startup resume path. An empty file
// means "current session has no (known) name". Consumed by agent-bus
// peer-status: when telegram's last-status.json is stale (its session_id
// differs from wrapper.current_session_id), this file is the authoritative
// session name — last-status only updates while the statusline bridge fires,
// so a fresh never-active session would otherwise report the OLD name.
const CURRENT_SESSION_NAME_FILE = join(
  STATE_DIR,
  'wrapper.current_session_name',
)

// Single source of truth for identity + lifecycle (see session-state.ts).
// Written alongside the legacy current_session_* files for backward-compat
// with peers running an older agent-bus reader.
const SESSION_STATE_FILE = join(STATE_DIR, 'wrapper.state.json')
let sessionState: SessionState | null = null

// Global agent registry shared by all bot peers on this machine.
// See plugins/agent-bus/registry.ts for the writer-side contract.
const AGENT_REGISTRY_PATH =
  process.env.AGENT_REGISTRY_PATH?.trim() ||
  join(homedir(), '.claude', 'agent-registry.json')
const AGENT_REGISTRY_LOCK = `${AGENT_REGISTRY_PATH}.lock`
// Bot name = basename(project_dir). Conflict (same basename, different paths)
// is logged but not blocked at v1.
const SELF_AGENT_NAME = PROJECT_DIR.split(/[\/\\]/).filter(Boolean).pop() ?? 'unknown'

function writeCurrentSessionId(sid: string): void {
  const tmp = `${CURRENT_SESSION_FILE}.tmp.${process.pid}`
  try {
    writeFileSync(tmp, sid)
    renameSync(tmp, CURRENT_SESSION_FILE)
  } catch (err) {
    log(`failed to write current_session_id: ${err}`)
  }
}

// Null/unknown name is recorded as an empty file (readers treat '' as null).
// Always overwriting — rather than skipping on null — matters: leaving the
// previous session's name behind would recreate the staleness bug this file
// exists to fix.
function writeCurrentSessionName(name: string | null): void {
  const tmp = `${CURRENT_SESSION_NAME_FILE}.tmp.${process.pid}`
  try {
    writeFileSync(tmp, name ?? '')
    renameSync(tmp, CURRENT_SESSION_NAME_FILE)
  } catch (err) {
    log(`failed to write current_session_name: ${err}`)
  }
}

// Canonical updater: patches identity/lifecycle, writes wrapper.state.json
// atomically, AND mirrors to the legacy current_session_* files. Call this
// instead of writeCurrentSessionId/Name directly.
function updateSessionState(patch: {
  session_id?: string | null
  session_name?: string | null
  lifecycle?: Lifecycle
}): void {
  sessionState = buildNextState(sessionState, patch, Date.now())
  try {
    writeSessionState(SESSION_STATE_FILE, sessionState)
  } catch (err) {
    log(`failed to write session state: ${err}`)
  }
  // Mirror to legacy files (readers on older agent-bus). The session_id file
  // has no "cleared" representation (writeCurrentSessionId takes a string), so
  // we only (re)write it when the patch carries a concrete id — a lifecycle-
  // only patch (e.g. the /clear `resetting` marker) leaves it untouched.
  if (patch.session_id !== undefined && sessionState.session_id)
    writeCurrentSessionId(sessionState.session_id)
  if (patch.session_name !== undefined)
    writeCurrentSessionName(sessionState.session_name)
}

// Pacing between chained PTY injections. 1000ms is the empirical floor at
// which CC's slash-command parser reliably digests the previous command
// before the next write lands. Used by the post-/clear chain (/rename +
// /notify-user) and by the post-/switch outbox event.
const POST_INJECTION_DELAY_MS = 1000

// Injection serialization (BUG #3, 2026-06-07). Pending payloads used to be
// dispatched the instant their file was consumed; two back-to-back payloads
// could interleave their keystrokes (each injection writes its text and the
// submitting \r ~250ms apart), and anything injected while CC was rebuilding
// a session post-/clear was silently dropped (a swallowed `/rename idle`
// left bot-02's session unnamed; bot-03's own /clear vanished → idle-creep;
// an agent-bus handoff prompt was eaten mid-/clear). Now a FIFO queue +
// InjectionGate serialize everything:
//   • MIN_INJECTION_GAP_MS  — minimum quiet time after every injection
//     before the next one may start.
//   • CLEAR_SETTLE_MS       — extra hold after the fresh session is
//     detected, so the post-/clear chain (/rename + outbox) lands first.
//   • CLEAR_BARRIER_TIMEOUT_MS — safety valve: if the fresh session never
//     materialises (e.g. the /clear keystroke itself was lost), force-release
//     the barrier instead of deadlocking the queue forever.
//   • QUEUE_POLL_MS         — how often the drainer re-checks the gate.
const MIN_INJECTION_GAP_MS = 1_500
const CLEAR_SETTLE_MS = 1_500
const CLEAR_BARRIER_TIMEOUT_MS = 10 * 60_000
const QUEUE_POLL_MS = 200

// Delay between writing a slash-command's text and the trailing Enter.
// Empirically, writing `text + \r` as one PTY chunk lets CC's autocomplete
// picker swallow the \r (for namespaced commands like /telegram:foo, the
// picker stays open until the input "settles"). Splitting into two writes
// separated by a brief delay mimics a human pause between typing and
// pressing Enter, so CC treats the trailing \r as a top-level "submit"
// rather than a "select from picker" action.
const SUBMIT_DELAY_MS = 250

// Pacing for injectText (agent-bus prompts). A single raw write of one long
// line into CC's TUI input over Windows ConPTY overflows the input buffer and
// the head of the message is silently dropped (only the tail survives). We
// write the body in small code-point slices with a pause between them so the
// TUI drains its buffer between chunks. Empirical — start 100/30ms; if a long
// body still truncates on Windows, lower the size and/or raise the delay.
// A ~3KB body at 100/30ms submits in ~1s.
const CHUNK_SIZE = 100 // code points per write
const CHUNK_DELAY_MS = 30 // pause between chunks so CC's input drains

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

// Registry entry incl. its write timestamp — needed by the boot-resume
// freshness arbitration (spec 2026-07-20 §3.2).
function readTelegramRegistryEntry(sessionId: string): RegistryEntry | null {
  const dir = resolveTelegramStateDir()
  if (!dir) return null
  try {
    const obj = JSON.parse(
      readFileSync(join(dir, 'session-names.json'), 'utf8'),
    ) as Record<string, { name?: unknown; updatedAt?: unknown }>
    const e = obj[sessionId]
    if (!e || typeof e.name !== 'string' || !e.name) return null
    return { name: e.name, updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0 }
  } catch {
    return null
  }
}

// Read-side counterpart: resolve a session's label from the telegram
// registry. Best-effort — missing dir/file/entry all yield null.
function readTelegramRegistryName(sessionId: string): string | null {
  return readTelegramRegistryEntry(sessionId)?.name ?? null
}

// Raw contents of telegram's last-status.json (CC statusline snapshot), or
// null when absent/unreadable. Parsing/validation happens in session-state.ts.
function readLastStatusRaw(): string | null {
  const dir = resolveTelegramStateDir()
  if (!dir) return null
  try {
    return readFileSync(join(dir, 'last-status.json'), 'utf8')
  } catch {
    return null
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

function acquireRegistryLock(): (() => void) | null {
  const start = Date.now()
  while (true) {
    try {
      // openSync with 'wx' = exclusive create — fails with EEXIST if held.
      const fd = openSync(AGENT_REGISTRY_LOCK, 'wx')
      closeSync(fd)
      return () => {
        try {
          rmSync(AGENT_REGISTRY_LOCK)
        } catch {
          /* best-effort */
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return null
      if (Date.now() - start > 2_000) {
        log(`registry lock timeout — skipping update`)
        return null
      }
      // tight busy-wait is fine here: holders only hold for milliseconds.
      const until = Date.now() + 25
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

function loadRegistry(): {
  schema_version: 1
  agents: Record<
    string,
    {
      project_dir: string
      state_dir: string
      registered_at: string
      last_heartbeat: string
      wrapper_pid: number
    }
  >
} {
  if (!existsSync(AGENT_REGISTRY_PATH)) return { schema_version: 1, agents: {} }
  try {
    const obj = JSON.parse(readFileSync(AGENT_REGISTRY_PATH, 'utf8'))
    if (obj && typeof obj === 'object' && obj.schema_version === 1 && obj.agents) {
      return obj
    }
  } catch {
    /* corrupt — reset */
  }
  return { schema_version: 1, agents: {} }
}

function persistRegistry(reg: ReturnType<typeof loadRegistry>): void {
  mkdirSync(join(AGENT_REGISTRY_PATH, '..'), { recursive: true })
  const tmp = `${AGENT_REGISTRY_PATH}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(reg, null, 2))
  // Retry renameSync on Windows EPERM/EBUSY: antivirus / Search Indexer
  // can briefly hold the destination open during scans, causing rename
  // to fail even though the cross-wrapper lock is held. Race window is
  // <100ms in practice, so progressive backoff (50/100/150/200ms, total
  // <500ms) clears it without inflating heartbeat latency.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      renameSync(tmp, AGENT_REGISTRY_PATH)
      if (attempt > 0) {
        log(`registry rename succeeded on attempt ${attempt + 1}`)
      }
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY') throw err
      if (attempt === 4) throw err
      const until = Date.now() + 50 * (attempt + 1)
      while (Date.now() < until) {
        /* busy-wait — same pattern as acquireRegistryLock */
      }
    }
  }
}

function registerSelfInGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const existing = reg.agents[SELF_AGENT_NAME]
    if (existing && existing.project_dir !== PROJECT_DIR) {
      log(
        `WARNING: agent name "${SELF_AGENT_NAME}" already registered at ` +
          `${existing.project_dir} (different from current ${PROJECT_DIR}). ` +
          `Overwriting — both wrappers will fight over the registry slot.`,
      )
    }
    const now = new Date().toISOString()
    reg.agents[SELF_AGENT_NAME] = {
      project_dir: PROJECT_DIR,
      state_dir: STATE_DIR,
      registered_at: existing?.registered_at ?? now,
      last_heartbeat: now,
      wrapper_pid: process.pid,
    }
    persistRegistry(reg)
    log(`registered "${SELF_AGENT_NAME}" in ${AGENT_REGISTRY_PATH}`)
  } finally {
    release()
  }
}

function heartbeatSelfInGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const e = reg.agents[SELF_AGENT_NAME]
    if (!e || e.wrapper_pid !== process.pid) return
    e.last_heartbeat = new Date().toISOString()
    persistRegistry(reg)
  } finally {
    release()
  }
}

function unregisterSelfFromGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const e = reg.agents[SELF_AGENT_NAME]
    if (!e || e.wrapper_pid !== process.pid) return
    delete reg.agents[SELF_AGENT_NAME]
    persistRegistry(reg)
    log(`unregistered "${SELF_AGENT_NAME}" from global registry`)
  } catch {
    /* swallow */
  } finally {
    release()
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
 * Type arbitrary text into the PTY as a user turn, then submit with Enter.
 * Used for agent-bus prompts. Unlike injectSlashCommand there is no leading
 * "/", so no autocomplete picker to dodge.
 *
 * The body is written in small chunks (CHUNK_SIZE code points, CHUNK_DELAY_MS
 * apart) rather than one shot: a single large write of one long line into CC's
 * TUI input over Windows ConPTY overflows the input buffer and silently drops
 * the head, leaving only the tail. Chunking lets the TUI drain between writes
 * so the full body lands. The submitting \r goes out SUBMIT_DELAY_MS after the
 * last chunk so it lands once the text has settled.
 */
function injectText(text: string): number {
  const chunks = chunkPromptText(text, CHUNK_SIZE)
  let elapsed = 0
  for (const chunk of chunks) {
    setTimeout(() => currentPty.write(chunk), elapsed)
    elapsed += CHUNK_DELAY_MS
  }
  setTimeout(() => currentPty.write('\r'), elapsed + SUBMIT_DELAY_MS)
  // Total time until the submitting \r goes out — the caller uses this to
  // hold the injection gate for the whole typing window.
  return elapsed + SUBMIT_DELAY_MS
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
// `suppressNotify` = the /clear came from a batch with more items after it;
// the session-change outbox event is deferred to the end of the batch (so it
// carries the FINAL session name instead of "(unnamed)").
let awaitingClearReady:
  | { sessionsBefore: Set<string>; sessionName?: string; suppressNotify?: boolean }
  | null = null

// Shared bookkeeping for one batch's items as they flow through the queue.
// `remaining` counts not-yet-dispatched items; `sawClear` records whether any
// item was a /clear (→ the batch finale must emit the deferred notification).
type BatchState = { remaining: number; sawClear: boolean }

// Shape of a pending/<uuid>.json payload (tagged union; `type`/`kind` are
// synonyms, default "slash").
type PendingPayload = {
  id?: string
  type?: string
  /** Phase 1 alternate type field — synonymous with type:"slash" when "slash". */
  kind?: string
  command?: string
  sessionId?: string
  sessionName?: string
  confirmAfterMs?: number
  /** Agent-bus extension: name of sending agent. Required when from agent-bus. */
  from?: string
  /** Agent-bus extension: loop-prevention counter. */
  hop_count?: number
  /** Agent-bus extension: correlation id, opaque to wrapper in Phase 1. */
  correlation_id?: string
  /** Agent-bus prompt: the already-composed text to type into the PTY. */
  text?: string
}

// Injection barrier + FIFO queue (BUG #3). Consumed payloads are queued and
// drained by a single processor that waits out the gate between items, so an
// injection can never start while the previous one is still typing or while
// CC is rebuilding a session post-/clear. See the constants block above for
// the failure modes this prevents.
const injectionGate = new InjectionGate(CLEAR_BARRIER_TIMEOUT_MS)
const injectionQueue: Array<{
  filename: string
  payload: PendingPayload
  batch?: BatchState
}> = []
let drainingQueue = false

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function drainInjectionQueue(): Promise<void> {
  if (drainingQueue) return
  drainingQueue = true
  try {
    while (injectionQueue.length > 0) {
      if (injectionGate.isBlocked(Date.now())) {
        await sleepMs(QUEUE_POLL_MS)
        continue
      }
      // The gate just transitioned to unblocked. If the clear barrier was
      // force-released by its safety timeout, surface that — it means a
      // /clear never produced a fresh session (likely lost upstream).
      if (awaitingClearReady && !injectionGate.clearBarrierActive(Date.now())) {
        log(
          `WARNING: clear barrier timed out after ${CLEAR_BARRIER_TIMEOUT_MS}ms ` +
            `without a fresh session — draining queue anyway`,
        )
        awaitingClearReady = null
      }
      const item = injectionQueue.shift()!
      // Batch bookkeeping: decrement BEFORE dispatch so the dispatcher can
      // tell whether this is the batch's final item (remaining === 0).
      let isLastOfBatch = true
      if (item.batch) {
        item.batch.remaining -= 1
        isLastOfBatch = item.batch.remaining === 0
      }
      try {
        dispatchPayload(item.filename, item.payload, item.batch, isLastOfBatch)
      } catch (err) {
        log(`dispatch failed for ${item.filename}: ${err}`)
      }
    }
  } finally {
    drainingQueue = false
  }
}

// PTY handlers: forward output to our stdout and shut the wrapper down
// when claude exits.
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
// PID file is the second liveness signal: if the wrapper crashed within the
// last heartbeat window the file is stale but the heartbeat looks fresh, so
// the plugin also probes the PID with `kill(pid, 0)` to catch that case.
const heartbeatInterval = setInterval(() => {
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
  } catch (err) {
    log(`heartbeat write failed: ${err}`)
  }
  // Guarded separately so a global-registry update failure (e.g. the
  // Windows EPERM rename race) does not propagate out of the timer
  // callback and kill the wrapper process.
  try {
    heartbeatSelfInGlobalRegistry()
  } catch (err) {
    log(`global registry heartbeat failed: ${err}`)
  }
}, 5_000)
writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
registerSelfInGlobalRegistry()
try {
  writeFileSync(PID_FILE, String(process.pid))
} catch (err) {
  log(`pid file write failed: ${err}`)
}
// Surface our versions for peer plugins to read at /status time.
// Each lookup is best-effort: missing files leave the field as null.
try {
  // The wrapper is shipped inside plugins/pty-controller/wrapper/, so the
  // plugin manifest sits one level up at .claude-plugin/plugin.json. The
  // wrapper's own package.json sits next to the compiled entry point.
  const wrapperDir = join(SELF_DIR, '..')
  const pluginDir = join(wrapperDir, '..')
  const versionInfo: { plugin_version: string | null; wrapper_version: string | null } = {
    plugin_version: null,
    wrapper_version: null,
  }
  try {
    const raw = readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')
    const obj = JSON.parse(raw) as { version?: unknown }
    if (typeof obj.version === 'string') versionInfo.plugin_version = obj.version
  } catch {
    /* ignore — leave null */
  }
  try {
    const raw = readFileSync(join(wrapperDir, 'package.json'), 'utf8')
    const obj = JSON.parse(raw) as { version?: unknown }
    if (typeof obj.version === 'string') versionInfo.wrapper_version = obj.version
  } catch {
    /* ignore — leave null */
  }
  writeFileSync(VERSION_FILE, JSON.stringify(versionInfo, null, 2))
} catch (err) {
  log(`version file write failed: ${err}`)
}

// Self-healing (spec 2026-07-20 §3.1): adopt the live session's name from
// CC's own statusline snapshot whenever it is strictly fresher than our
// state. Heals divergence from ANY path (poisoned boot seed, terminal-typed
// /rename, registry races) within one statusline fire. mtime-gated so the
// steady-state cost is one statSync per 500ms tick.
let lastStatusSeenMtimeMs = 0
function revalidateSessionNameFromStatusline(): void {
  const dir = resolveTelegramStateDir()
  if (!dir) return
  const file = join(dir, 'last-status.json')
  let mtimeMs: number
  try {
    mtimeMs = statSync(file).mtimeMs
  } catch {
    return // file absent — statusline never fired yet
  }
  if (mtimeMs === lastStatusSeenMtimeMs) return
  lastStatusSeenMtimeMs = mtimeMs // set BEFORE parsing so corrupt files aren't re-parsed every tick
  const raw = readLastStatusRaw()
  if (raw === null) return
  const adopt = shouldAdoptStatuslineName(sessionState, raw, {
    inClearTransition:
      awaitingClearReady !== null || injectionGate.clearBarrierActive(Date.now()),
  })
  if (!adopt) return
  const oldName = sessionState?.session_name ?? null
  updateSessionState({ session_name: adopt })
  // Keep the registry converged too (same pattern as the /rename handler).
  // Best-effort: a failed registry write is logged inside the writer and
  // does not undo the (already correct) state adoption.
  const sidNow = sessionState?.session_id
  if (sidNow) writeTelegramRegistryName(sidNow, adopt)
  log(
    `session name revalidated from statusline: ${JSON.stringify(oldName)} → ${JSON.stringify(adopt)}`,
  )
  // Deliberately NO system-outbox event: the rename already happened in CC;
  // we are syncing our copy, not orchestrating a transition (spec §3.1).
}

// Post-/clear poll. Cheap (one readdir every 500ms) and only does work when
// `awaitingClearReady` is set, so the steady-state cost is negligible.
// We poll instead of fs.watch because fs.watch's create-event coverage on
// Windows is historically flaky and this path needs to be reliable.
const sessionPollInterval = setInterval(() => {
  if (!awaitingClearReady) {
    revalidateSessionNameFromStatusline()
    return
  }
  const current = listSessions()
  for (const f of current) {
    if (!awaitingClearReady.sessionsBefore.has(f)) {
      const sid = f.slice(0, -'.jsonl'.length)
      const { sessionName, suppressNotify } = awaitingClearReady
      log(
        `fresh session detected: ${sid} — injecting${
          sessionName ? ` /rename (+${POST_INJECTION_DELAY_MS}ms) + /notify-user` : ` /notify-user`
        }`,
      )
      updateSessionState({ session_id: sid, session_name: sessionName ?? null })
      // Record the fresh session's name immediately (or clear the previous
      // one when this /clear came without a name) so peer-status readers
      // never see the old session's name attached to the new session.
      awaitingClearReady = null
      // Release the injection barrier — but keep the queue held until the
      // post-/clear chain below (/rename, when present) has had time to
      // land, plus a settle margin, so a queued payload can never splice
      // into the fresh session's first keystrokes.
      injectionGate.releaseClearBarrier(
        (sessionName ? POST_INJECTION_DELAY_MS : 0) + CLEAR_SETTLE_MS,
        Date.now(),
      )
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
      // Batch case: when the /clear came from a batch with items still
      // pending (e.g. a trailing /rename), defer — the batch finale in
      // dispatchPayload emits the event with the FINAL name instead.
      if (suppressNotify) {
        log(`session-change notification deferred to end of batch`)
      } else {
        setTimeout(
          () =>
            writeSystemOutbox({
              type: 'session-change',
              sessionId: sid,
              sessionName: sessionName ?? null,
            }),
          delay,
        )
      }
      return
    }
  }
}, 500)

// Resume path: we already know the session id from chooseStartupArgs, so
// we can synchronously write current_session_id and emit the session-change
// outbox event without waiting for a new jsonl to materialise (none will —
// CC reuses the existing file on --resume). The initialSessionPoll below
// still runs in this mode but won't detect anything; that's harmless.
if (!startupMode.isFirstRun && startupMode.latestSessionId) {
  const sid = startupMode.latestSessionId
  // Resolve label by FRESHNESS, not fixed priority (spec 2026-07-20 §3.2):
  // the statusline snapshot can be a poisoned post-/clear render (new sid +
  // old name) and the registry can lag a PTY-injected /rename — whichever
  // was written more recently wins; tie → registry (event-driven writes
  // beat renders). The old `lastStatus ?? registry` priority is what let a
  // poisoned snapshot beat a correct registry (incident bot-03 2026-07-18).
  const lastStatusRaw = readLastStatusRaw()
  const registryEntry = readTelegramRegistryEntry(sid)
  const { name: resolvedName, source } = resolveResumeName(lastStatusRaw, registryEntry, sid)
  const snap = lastStatusRaw ? parseStatuslineSnapshot(lastStatusRaw) : null
  log(
    `resume name resolution: last-status=${
      snap && snap.session_id === sid ? `"${snap.session_name}"@${snap.captured_at_ms}` : 'none'
    } registry=${
      registryEntry ? `"${registryEntry.name}"@${registryEntry.updatedAt}` : 'none'
    } → picked ${source} ${JSON.stringify(resolvedName)}`,
  )
  updateSessionState({ session_id: sid, session_name: resolvedName })
  writeSystemOutbox({
    type: 'session-change',
    sessionId: sid,
    sessionName: resolvedName,
  })
}

// One-shot: after CC starts, poll for the first session jsonl to appear
// and record its id as the current session. Used by the telegram plugin's
// /delete to exclude the active session from the picker. Mirrors the
// post-/clear poll above but clears itself on first detection.
//
// On first-run, this also claims the label "idle" for the brand-new
// session — provided that name isn't already taken in the telegram registry.
// "idle" (not "main session") because the handoff-v2 session-name convention
// treats `idle` as the READY-to-receive state, while any manual-looking name
// counts as unknown — a freshly booted bot should be born READY, not need a
// manual rename after every fleet reset.
// On resume, the loop never fires (no new jsonl appears); the resume block
// above has already handled current_session_id + outbox emission.
const initialSessionsBefore = listSessions()
const initialSessionPoll = setInterval(() => {
  const current = listSessions()
  for (const f of current) {
    if (initialSessionsBefore.has(f)) continue
    const sid = f.slice(0, -'.jsonl'.length)
    log(`initial session detected: ${sid}`)
    updateSessionState({ session_id: sid })
    clearInterval(initialSessionPoll)

    if (startupMode.isFirstRun) {
      // First-run path: try to claim "idle" if free in the registry.
      const stateDir = resolveTelegramStateDir()
      let canRename = true
      if (stateDir) {
        try {
          const path = join(stateDir, 'session-names.json')
          const obj = JSON.parse(readFileSync(path, 'utf8')) as Record<
            string,
            { name: string }
          >
          for (const entry of Object.values(obj)) {
            if (entry.name === 'idle') {
              canRename = false
              break
            }
          }
        } catch {
          /* registry missing → name is free */
        }
      }
      if (canRename) {
        writeTelegramRegistryName(sid, 'idle')
        updateSessionState({ session_name: 'idle' })
        injectSlashCommand(`/rename idle`)
        // Keep queued payloads (if any arrived during boot) out of this
        // injection's keystroke window.
        injectionGate.holdFor(SUBMIT_DELAY_MS + MIN_INJECTION_GAP_MS, Date.now())
        setTimeout(
          () =>
            writeSystemOutbox({
              type: 'session-change',
              sessionId: sid,
              sessionName: 'idle',
            }),
          POST_INJECTION_DELAY_MS,
        )
      } else {
        log(
          `"idle" already taken in registry — leaving new session unnamed`,
        )
        updateSessionState({ session_name: null })
        writeSystemOutbox({
          type: 'session-change',
          sessionId: sid,
          sessionName: null,
        })
      }
    }
    // If !isFirstRun, the resume block above already handled this.
    // initialSessionPoll won't actually detect anything in that case,
    // but defensive-skip here is harmless.
    return
  }
}, 500)

// Consume one pending command file: parse, delete, enqueue. Actual PTY
// dispatch happens in drainInjectionQueue → dispatchPayload, serialized
// behind the injection gate.
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

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    log(`malformed json in ${filename}: ${err}`)
    return
  }

  // BATCH: a JSON array is an ordered list of slash items. All items are
  // pushed in ONE synchronous block — Node's single thread guarantees no
  // other consumePending can splice its payload between them (this is the
  // atomicity that three separate pending files cannot provide; see the
  // 2026-06-07 design decision doc).
  if (Array.isArray(parsed)) {
    const v = validateBatch(parsed)
    if (!v.ok) {
      log(`ignored ${filename}: ${v.error}`)
      return
    }
    const batch: BatchState = { remaining: v.items.length, sawClear: false }
    log(
      `batch ${filename}: ${v.items.length} item(s) — ${v.items
        .map(i => i.command)
        .join('  →  ')}`,
    )
    for (const it of v.items) {
      injectionQueue.push({ filename, payload: it as PendingPayload, batch })
    }
    void drainInjectionQueue()
    return
  }

  const payload = parsed as PendingPayload

  // Agent-bus extension: enforce hop limit on inter-agent messages. Local
  // messages (no `from` field) skip this check — they originate inside this
  // CC session via meta-commands and the AI's own tool calls.
  if (typeof payload.from === 'string') {
    const hops = typeof payload.hop_count === 'number' ? payload.hop_count : 0
    if (hops > 5) {
      log(`dropping ${filename}: hop_count ${hops} > 5 (from "${payload.from}")`)
      return
    }
    log(
      `inter-agent message from "${payload.from}" ` +
        `(kind=${payload.kind ?? payload.type ?? 'slash'}, hop=${hops}, correlation=${payload.correlation_id ?? '?'})`,
    )
  }

  // BUG #3: never dispatch straight from here — enqueue, and let the single
  // drainer inject items one at a time behind the gate.
  injectionQueue.push({ filename, payload })
  void drainInjectionQueue()
}

// Dispatch one queued payload into the PTY. Called exclusively by
// drainInjectionQueue, only when the injection gate is open. Every branch
// holds the gate for its own injection duration + MIN_INJECTION_GAP_MS so
// the next item cannot splice into this one's keystroke window.
function dispatchPayload(
  filename: string,
  payload: PendingPayload,
  batch?: BatchState,
  isLastOfBatch = true,
): void {
  // Phase 1 contract: `type` (legacy) and `kind` (new) are synonyms. Default
  // to "slash" when neither is set (backward compat for the original
  // single-string-command payload shape).
  const type = payload.type ?? payload.kind ?? 'slash'
  if (type === 'slash') {
    const command = payload.command
    if (typeof command !== 'string' || !command.startsWith('/')) {
      log(`ignored ${filename}: missing or non-slash command`)
      return
    }
    log(`injecting "${command}" (id: ${payload.id ?? '?'})`)
    injectSlashCommand(command)
    injectionGate.holdFor(SUBMIT_DELAY_MS + MIN_INJECTION_GAP_MS, Date.now())
    // /rename — the dispatch happened with the gate open (so post-/clear it
    // runs only after the fresh session was detected ready); recording the
    // name here therefore reflects an injection that actually landed.
    const renamedTo = renameArgFromCommand(command)
    if (renamedTo) {
      updateSessionState({ session_name: renamedTo })
      // Keep the telegram registry in sync: a PTY-injected /rename never
      // passes through the telegram handler, so without this the registry
      // (and any restart that seeds from it) goes stale.
      const sidNow = sessionState?.session_id
      if (sidNow) writeTelegramRegistryName(sidNow, renamedTo)
    }
    // Optional confirm-after: some CC slash commands (e.g. /effort) pop up a
    // confirmation picker with the default option pre-selected. A single \r
    // commits it. If no picker appears, the extra \r is a harmless empty
    // submit at the CC prompt. Delay clamped to a sane window so a typo on
    // the caller side can't stall the wrapper.
    if (typeof payload.confirmAfterMs === 'number' && payload.confirmAfterMs > 0) {
      const delay = Math.min(Math.max(payload.confirmAfterMs, 50), 5_000)
      injectionGate.holdFor(delay + MIN_INJECTION_GAP_MS, Date.now())
      setTimeout(() => {
        log(`sending confirm \\r after ${delay}ms (for "${command}")`)
        currentPty.write('\r')
      }, delay)
    }
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
      // A /clear mid-batch defers its session-change notification to the
      // batch finale below (the final name isn't known yet — a trailing
      // /rename is still queued). A /clear that ends its batch notifies
      // from the poll loop exactly like a standalone /clear.
      const suppressNotify = batch !== undefined && !isLastOfBatch
      if (batch) batch.sawClear = true
      awaitingClearReady = { sessionsBefore: listSessions(), sessionName, suppressNotify }
      // Arm the injection barrier: nothing else gets injected until the
      // fresh session jsonl shows up (sessionPollInterval releases it).
      injectionGate.beginClearBarrier(Date.now())
      updateSessionState({ lifecycle: 'resetting' })
      log(
        `awaiting fresh session after /clear${
          sessionName ? ` (will rename to "${sessionName}")` : ''
        }${suppressNotify ? ' (batch: notify at end)' : ''} — injection queue held`,
      )
    }
    // Batch finale: a /clear earlier in this batch suppressed its
    // session-change notification (the name wasn't final yet). Emit it now,
    // after the last item has been injected, with the final state — the user
    // is ALWAYS told which session they landed in; only the timing moved so
    // the event carries the real name instead of "(unnamed)". sessionState
    // is already current: the /rename sniffer above updates it synchronously
    // at dispatch time.
    if (batch && isLastOfBatch && batch.sawClear && command !== '/clear') {
      setTimeout(() => {
        writeSystemOutbox({
          type: 'session-change',
          sessionId: sessionState?.session_id ?? null,
          sessionName: sessionState?.session_name ?? null,
        })
      }, POST_INJECTION_DELAY_MS)
    }
    return
  }

  if (type === 'prompt') {
    const text = promptTextFromPayload(payload)
    if (!text) {
      log(`ignored ${filename}: prompt payload missing text`)
      return
    }
    log(`injecting prompt text (${text.length} chars, id: ${payload.id ?? '?'}, from: ${payload.from ?? '?'})`)
    const typingMs = injectText(text)
    // Hold for the whole chunked typing window — a long prompt keeps the
    // PTY busy far longer than a slash command.
    injectionGate.holdFor(typingMs + MIN_INJECTION_GAP_MS, Date.now())
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
    // Prefer the name carried in the payload; fall back to the telegram
    // registry (the payload's sessionName is informational and may be null).
    updateSessionState({
      session_id: sid,
      session_name: sessionName ?? readTelegramRegistryName(sid),
    })
    injectSlashCommand(`/resume ${sid}`)
    // /resume swaps the session inside CC — hold a little longer than a
    // plain slash so the next payload lands after the swap settles.
    injectionGate.holdFor(
      SUBMIT_DELAY_MS + POST_INJECTION_DELAY_MS + MIN_INJECTION_GAP_MS,
      Date.now(),
    )
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
  unregisterSelfFromGlobalRegistry()
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
  try {
    rmSync(PID_FILE)
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
