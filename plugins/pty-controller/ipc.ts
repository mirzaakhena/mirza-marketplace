/**
 * Filesystem IPC between this plugin (inside CC) and the mirza-cc wrapper
 * (parent process that hosts CC under node-pty).
 *
 * The plugin writes a command JSON to <stateDir>/pending/<uuid>.json. The
 * wrapper watches that directory and consumes files: read → ack → delete →
 * inject keystrokes into the PTY.
 *
 * Atomic write via .tmp + rename so the wrapper never sees a partially
 * written file. Same pattern the telegram plugin uses for its state files.
 */
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export interface PtyCommand {
  /** Stable id for tracing. Wrapper echoes this back in its ack file (future). */
  id: string
  /** ISO timestamp. */
  ts: string
  /** Slash command including the leading slash. e.g. "/clear", "/notify-user". */
  command: string
}

/**
 * Resolve the IPC state dir.
 *
 * Default: <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller. Keeps state
 * per-project (consistent with telegram plugin's filosofi). Escape hatch:
 * PTY_CONTROLLER_STATE_DIR env var lets a custom wrapper point elsewhere
 * (e.g., a global location if a user runs one wrapper for all projects).
 */
export function resolveStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.PTY_CONTROLLER_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) return null
  return join(projectDir, '.claude', 'channels', 'pty-controller')
}

/**
 * Write a command to the wrapper's inbox. Returns the file path for tracing.
 * Throws if state dir cannot be resolved (no CLAUDE_PROJECT_DIR and no
 * PTY_CONTROLLER_STATE_DIR set).
 */
export function writeCommand(
  stateDir: string,
  command: string,
): { id: string; path: string } {
  const pending = join(stateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const payload: PtyCommand = {
    id,
    ts: new Date().toISOString(),
    command,
  }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}

/**
 * Resolve the path to the shared agent registry file. The wrapper writes
 * this; we only read it. Override via AGENT_REGISTRY_PATH env var (kept in
 * sync with the writer in wrapper/src/wrapper.ts).
 */
export function resolveAgentRegistryPath(env: Record<string, string | undefined>): string {
  return env.AGENT_REGISTRY_PATH?.trim() || join(homedir(), '.claude', 'agent-registry.json')
}

export interface AgentRegistryEntry {
  project_dir: string
  state_dir: string
  registered_at?: string
  last_heartbeat: string
  wrapper_pid: number
}

export interface AgentRegistry {
  schema_version?: number
  agents: Record<string, AgentRegistryEntry>
}

export interface AgentInfo {
  name: string
  project_dir: string
  state_dir: string
  last_heartbeat: string
  last_heartbeat_age_s: number
  alive: boolean
  wrapper_pid: number
}

/**
 * Read the shared agent registry. Returns an empty agents map if the file
 * does not exist or is malformed — callers treat that as "no peers".
 */
export function readAgentRegistry(path: string): AgentRegistry {
  if (!existsSync(path)) return { agents: {} }
  try {
    const raw = readFileSync(path, 'utf8')
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && obj.agents && typeof obj.agents === 'object') {
      return obj as AgentRegistry
    }
    return { agents: {} }
  } catch {
    return { agents: {} }
  }
}

/**
 * Project a registry entry into the AgentInfo shape exposed to the AI.
 * `alive` = heartbeat newer than `freshMs` (default 30s, same threshold as
 * `wrapperLikelyRunning`).
 */
export function describeAgents(
  reg: AgentRegistry,
  freshMs = 30_000,
  now = Date.now(),
): AgentInfo[] {
  const out: AgentInfo[] = []
  for (const [name, e] of Object.entries(reg.agents)) {
    const wroteAt = Date.parse(e.last_heartbeat)
    const ageMs = Number.isNaN(wroteAt) ? Number.POSITIVE_INFINITY : now - wroteAt
    out.push({
      name,
      project_dir: e.project_dir,
      state_dir: e.state_dir,
      last_heartbeat: e.last_heartbeat,
      last_heartbeat_age_s: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : -1,
      alive: ageMs < freshMs,
      wrapper_pid: e.wrapper_pid,
    })
  }
  return out
}

/**
 * Probe whether a wrapper is likely running.
 *
 * Two-signal check:
 *   1. Heartbeat file freshness (wrapper touches it every 5s; we require
 *      it within `freshMs`, default 30s — accommodates GC pauses, brief
 *      filesystem stalls, system suspend/resume).
 *   2. PID file + `process.kill(pid, 0)` liveness — catches the "wrapper
 *      crashed within the last 30s" case where the heartbeat looks fresh
 *      but the OS process is gone.
 *
 * The PID check is best-effort: if the wrapper is on a different host
 * (rare, but PTY_CONTROLLER_STATE_DIR could in principle point at a shared
 * mount), `kill` will throw and we fall back to the heartbeat-only verdict.
 */
export function wrapperLikelyRunning(stateDir: string, freshMs = 30_000): boolean {
  const beat = join(stateDir, 'wrapper.heartbeat')
  if (!existsSync(beat)) return false
  let heartbeatFresh = false
  try {
    const content = readFileSync(beat, 'utf8').trim()
    const wroteAt = Date.parse(content)
    if (Number.isNaN(wroteAt)) return false
    heartbeatFresh = Date.now() - wroteAt < freshMs
  } catch {
    return false
  }
  if (!heartbeatFresh) return false

  // Second signal: PID liveness. Wrapper writes wrapper.pid on startup and
  // unlinks it on clean shutdown. If the PID file exists but the process is
  // gone, the wrapper crashed — return false so the caller fails fast
  // instead of queuing files that rot in pending/.
  const pidPath = join(stateDir, 'wrapper.pid')
  if (!existsSync(pidPath)) {
    // Old wrapper builds didn't write this; heartbeat alone has to suffice.
    return true
  }
  try {
    const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10)
    if (!Number.isFinite(pid) || pid <= 0) return true // malformed — don't penalize
    try {
      process.kill(pid, 0)
      return true // process exists
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ESRCH') return false // process is gone
      if (code === 'EPERM') return true // exists but owned by another user — still alive
      // Other errors (e.g. cross-host pid we can't probe): trust the heartbeat.
      return true
    }
  } catch {
    return true // can't read PID file — don't penalize
  }
}
