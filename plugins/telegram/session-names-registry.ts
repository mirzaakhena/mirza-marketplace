/**
 * Persistent registry of session-id → name mappings owned by the telegram
 * plugin. Solves a gap that CC's pid-file approach can't:
 *
 * CC stores the current session's name in `~/.claude/sessions/<pid>.json`,
 * one file per running CC process. Each file holds metadata for the ONE
 * session currently active in that process. When the wrapper injects
 * `/resume <sid>` to switch sessions in-place (post-167750d), that file
 * gets overwritten with the new session's id+name, and the previous
 * session's name is no longer reachable from pid-files alone.
 *
 * This registry lives at <telegramStateDir>/session-names.json and is the
 * primary source for the /switch and /delete picker labels. It is updated:
 *   - eagerly when the user invokes `/rename <name>` via Telegram
 *     (handleRename writes directly here, indexed by wrapper.current_session_id)
 *   - opportunistically via refreshFromPidFiles at picker-render time,
 *     which captures names from any /rename done manually inside CC and
 *     not yet seen by the registry (assuming the picker runs while the
 *     pid file still reflects that rename, before the next /switch)
 *
 * Best-effort: a /rename done manually inside CC and then immediately
 * followed by /switch without a picker render in between will be lost.
 * The 95% Telegram-driven flow is covered.
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  renameSync,
  mkdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface RegistryEntry {
  name: string
  /** Unix ms — used so newer wins on merge. */
  updatedAt: number
}

const FILENAME = 'session-names.json'

/** Load the persistent registry. Missing/malformed file → empty map. */
export function loadRegistry(stateDir: string): Map<string, RegistryEntry> {
  const path = join(stateDir, FILENAME)
  if (!existsSync(path)) return new Map()
  try {
    const raw = readFileSync(path, 'utf8')
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out = new Map<string, RegistryEntry>()
    for (const [sid, val] of Object.entries(obj)) {
      if (
        val &&
        typeof val === 'object' &&
        typeof (val as RegistryEntry).name === 'string' &&
        typeof (val as RegistryEntry).updatedAt === 'number'
      ) {
        out.set(sid, val as RegistryEntry)
      }
    }
    return out
  } catch {
    return new Map()
  }
}

/** Persist via atomic tmp+rename. Best-effort: errors are swallowed. */
export function saveRegistry(
  stateDir: string,
  registry: Map<string, RegistryEntry>,
): void {
  const path = join(stateDir, FILENAME)
  const tmp = `${path}.tmp.${process.pid}`
  try {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(registry), null, 2))
    renameSync(tmp, path)
  } catch {
    /* best-effort */
  }
}

/** Upsert a single name with updatedAt = now, then persist. */
export function setName(
  stateDir: string,
  sessionId: string,
  name: string,
): void {
  const registry = loadRegistry(stateDir)
  registry.set(sessionId, { name, updatedAt: Date.now() })
  saveRegistry(stateDir, registry)
}

/**
 * Remove a single session's name entry, then persist. No-op if the entry is
 * absent. Best-effort: errors are swallowed via saveRegistry, consistent with
 * setName — a failed registry write must never abort the caller's delete.
 */
export function removeName(stateDir: string, sessionId: string): void {
  const registry = loadRegistry(stateDir)
  if (!registry.has(sessionId)) return
  registry.delete(sessionId)
  saveRegistry(stateDir, registry)
}

/**
 * Mutates `registry` in place: for each ~/.claude/sessions/<pid>.json whose
 * cwd matches projectDir and which carries a non-empty name, upsert into
 * the registry if the pid file's mtime is newer than the registry entry
 * for that sessionId. Returns the (now-updated) map for chaining; caller
 * persists via saveRegistry.
 */
export function refreshFromPidFiles(
  registry: Map<string, RegistryEntry>,
  projectDir: string,
): Map<string, RegistryEntry> {
  const dir = join(homedir(), '.claude', 'sessions')
  if (!existsSync(dir)) return registry
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return registry
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const path = join(dir, entry)
    let raw: string
    let mtime = 0
    try {
      raw = readFileSync(path, 'utf8')
      mtime = statSync(path).mtimeMs
    } catch {
      continue
    }
    let data: { sessionId?: unknown; cwd?: unknown; name?: unknown }
    try {
      data = JSON.parse(raw)
    } catch {
      continue
    }
    if (typeof data.sessionId !== 'string') continue
    if (typeof data.name !== 'string' || data.name.length === 0) continue
    if (typeof data.cwd !== 'string') continue
    if (data.cwd !== projectDir) continue
    const prev = registry.get(data.sessionId)
    if (!prev || mtime > prev.updatedAt) {
      registry.set(data.sessionId, { name: data.name, updatedAt: mtime })
    }
  }
  return registry
}

/**
 * Returns the sessionId currently holding `name`, or null if `name` is free.
 * Exact (case-sensitive) match against the registry's `name` field. When the
 * registry contains legacy duplicates (multiple entries with the same name),
 * returns the first one iterated; callers treat the result as a boolean
 * "name is taken" — either match blocks the new write equally.
 */
export function findSessionIdByName(
  registry: Map<string, RegistryEntry>,
  name: string,
): string | null {
  for (const [sid, entry] of registry) {
    if (entry.name === name) return sid
  }
  return null
}
