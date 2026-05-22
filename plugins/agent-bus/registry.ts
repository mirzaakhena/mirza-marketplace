/**
 * Global agent registry shared by all bot-to-bot peers on this machine.
 *
 * Location: ~/.claude/agent-registry.json (override via AGENT_REGISTRY_PATH).
 *
 * Writers are pty-controller wrappers (register/heartbeat/unregister on
 * boot/tick/shutdown). Readers are agent-bus MCP tools (agent_list /
 * agent_status / agent_send). Concurrent writes are serialised with a
 * file lock (`<path>.lock`) using O_EXCL semantics; atomic visibility via
 * tmp + rename.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

export interface AgentEntry {
  project_dir: string
  state_dir: string
  registered_at: string
  last_heartbeat: string
  wrapper_pid: number
}

export interface Registry {
  schema_version: 1
  agents: Record<string, AgentEntry>
}

export function resolveRegistryPath(env: Record<string, string | undefined>): string {
  const explicit = env.AGENT_REGISTRY_PATH?.trim()
  if (explicit) return explicit
  const home = env.HOME?.trim() || env.USERPROFILE?.trim()
  if (!home) throw new Error('cannot resolve home directory (HOME/USERPROFILE unset)')
  return join(home, '.claude', 'agent-registry.json')
}

const LOCK_TIMEOUT_MS = 2_000
const LOCK_RETRY_MS = 25

function acquireLock(path: string): () => void {
  const lockPath = `${path}.lock`
  const start = Date.now()
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx')
      closeSync(fd)
      return () => {
        try {
          unlinkSync(lockPath)
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error(`registry lock timeout after ${LOCK_TIMEOUT_MS}ms: ${lockPath}`)
      }
      Bun.sleepSync(LOCK_RETRY_MS)
    }
  }
}

function loadOrInit(path: string): Registry {
  if (!existsSync(path)) return { schema_version: 1, agents: {} }
  try {
    const obj = JSON.parse(readFileSync(path, 'utf8'))
    if (obj && typeof obj === 'object' && obj.schema_version === 1 && obj.agents) {
      return obj as Registry
    }
  } catch {
    /* corrupt → reset */
  }
  return { schema_version: 1, agents: {} }
}

function persist(path: string, reg: Registry): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(reg, null, 2))
  renameSync(tmp, path)
}

export function registerAgent(
  path: string,
  name: string,
  entry: Omit<AgentEntry, 'registered_at' | 'last_heartbeat'>,
): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    const now = new Date().toISOString()
    reg.agents[name] = { ...entry, registered_at: now, last_heartbeat: now }
    persist(path, reg)
  } finally {
    release()
  }
}

export function updateHeartbeat(path: string, name: string): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    const e = reg.agents[name]
    if (!e) return
    e.last_heartbeat = new Date().toISOString()
    persist(path, reg)
  } finally {
    release()
  }
}

export function unregisterAgent(path: string, name: string): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    if (!reg.agents[name]) return
    delete reg.agents[name]
    persist(path, reg)
  } finally {
    release()
  }
}

export function readRegistry(path: string): Registry {
  return loadOrInit(path)
}
