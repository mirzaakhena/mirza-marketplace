/**
 * Enumerate Claude Code sessions for a given project directory.
 *
 * Sources of truth:
 *   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
 *     — persistent record of every session that has run in this project.
 *       File mtime tracks recency reliably.
 *
 *   ~/.claude/sessions/<pid>.json
 *     — per-process metadata for recently-active sessions, includes the
 *       optional `name` field set by Claude's /rename command. These files
 *       rotate; not every session in projects/ has one.
 *
 * We combine both: list .jsonl files for the project, then cross-reference
 * the sessions/ dir for any custom names. Sessions with no name fall back
 * to a "session <prefix>" label so they're still selectable.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  loadRegistry,
  refreshFromPidFiles,
  saveRegistry,
} from './session-names-registry'
import { loadArchived } from './archive-store'

/**
 * Indonesian-short relative time formatter for picker labels. Intentionally
 * compact ("5 mnt", "2 jam") because Telegram button labels are narrow on
 * mobile. Falls back to absolute dd/mm for ages > 12 weeks (the year
 * disambiguator is omitted to save width; the dd/mm is enough hint for the
 * picker user to decide whether to tap).
 *
 * `now` is injectable for tests; production calls use Date.now(). The dd/mm
 * branch reads UTC fields so test expectations stay TZ-independent.
 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - ts)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  if (delta < minute) return 'baru saja'
  if (delta < hour) return `${Math.floor(delta / minute)} mnt`
  if (delta < day) return `${Math.floor(delta / hour)} jam`
  if (delta < 14 * day) return `${Math.floor(delta / day)} hari`
  if (delta < 12 * week) return `${Math.floor(delta / week)} mgg`
  const d = new Date(ts)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

export interface SessionInfo {
  /** Full UUID, used for `claude --resume <id>`. */
  sessionId: string
  /** Short stable id derived from the UUID — fits in a Telegram callback_id. */
  shortId: string
  /** Display label: custom /rename name if available, else "session <prefix>". */
  label: string
  /** mtime of the .jsonl file in ms — for sorting newest-first. */
  mtime: number
  /** True if a custom name was found (vs fallback label). */
  hasName: boolean
}

/**
 * Mirror of how Claude encodes a project path for ~/.claude/projects/.
 * Both `:` and the OS-specific path separator get replaced with `-`. Tested
 * against the encoded directory names we observe in practice.
 */
export function encodeProjectDir(projectDir: string): string {
  return projectDir.replace(/[\\/:]/g, '-')
}

/**
 * Read all session jsonl filenames in the project's claude-projects dir.
 * Returns just the sessionId (UUID without the .jsonl suffix), with mtime.
 */
function listSessionFiles(
  projectDir: string,
): Array<{ sessionId: string; mtime: number }> {
  const encoded = encodeProjectDir(projectDir)
  const dir = join(homedir(), '.claude', 'projects', encoded)
  if (!existsSync(dir)) return []
  const out: Array<{ sessionId: string; mtime: number }> = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const sessionId = entry.slice(0, -'.jsonl'.length)
    // Filter to UUIDs only — guards against stray files (memory.md, etc.).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      continue
    }
    let mtime = 0
    try {
      mtime = statSync(join(dir, entry)).mtimeMs
    } catch {
      /* skip mtime */
    }
    out.push({ sessionId, mtime })
  }
  return out
}

/**
 * Build a map of sessionId -> name from the ~/.claude/sessions/<pid>.json
 * files. Filtered to sessions whose `cwd` matches `projectDir` so we don't
 * accidentally pick up another project's rename.
 *
 * Both files in sessions/ may exist for the same sessionId across multiple
 * pids (e.g. resumed sessions). When that happens, the most recent name
 * wins — picked by file mtime.
 */
function loadNameMap(projectDir: string): Map<string, { name: string; mtime: number }> {
  const map = new Map<string, { name: string; mtime: number }>()
  const dir = join(homedir(), '.claude', 'sessions')
  if (!existsSync(dir)) return map
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return map
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
    const prev = map.get(data.sessionId)
    if (!prev || mtime > prev.mtime) {
      map.set(data.sessionId, { name: data.name, mtime })
    }
  }
  return map
}

/**
 * Derive a Telegram-callback-safe id from a session UUID. Telegram callback
 * data is opaque to us and capped at 64 bytes; our schema reserves 32 chars
 * after the `ai:` prefix. UUIDs are 36 chars — too long. We take the first
 * 8 hex chars, which is unique-enough for a single-user single-project
 * picker. The plugin keeps an in-memory map shortId -> fullSessionId so
 * collisions, if any, can be detected.
 */
export function deriveShortId(sessionId: string): string {
  return sessionId.replace(/-/g, '').slice(0, 8).toLowerCase()
}

/**
 * Return sessions in this project, newest first.
 *
 * Name resolution order:
 *   1. Registry at `<telegramStateDir>/session-names.json` (if `stateDir` provided)
 *   2. Live pid file `~/.claude/sessions/<pid>.json`
 *   3. Fallback `session <8-hex>`
 *
 * When `stateDir` is provided, this call also refreshes the registry from
 * pid files (capturing any names CC wrote since the last picker render) and
 * persists the merged registry — best-effort, errors are swallowed.
 */
export function listProjectSessions(
  projectDir: string,
  stateDir?: string,
): SessionInfo[] {
  let files = listSessionFiles(projectDir)
  if (files.length === 0) return []

  let registry: Map<string, { name: string; updatedAt: number }> | null = null
  if (stateDir) {
    registry = loadRegistry(stateDir)
    refreshFromPidFiles(registry, projectDir)
    saveRegistry(stateDir, registry)
    // Soft-delete filter: drop sessions the user archived via Telegram.
    // The jsonl on disk is left alone, so `claude --resume` from a terminal
    // still works; the filter is purely a picker-visibility concern.
    const archived = loadArchived(stateDir)
    if (archived.size > 0) {
      files = files.filter(f => !archived.has(f.sessionId))
      if (files.length === 0) return []
    }
  }

  const nameMap = loadNameMap(projectDir)
  const sessions: SessionInfo[] = files.map(({ sessionId, mtime }) => {
    const fromRegistry = registry?.get(sessionId)
    const fromPid = nameMap.get(sessionId)
    const resolvedName = fromRegistry?.name ?? fromPid?.name ?? null
    const hasName = resolvedName !== null
    const label = resolvedName ?? `session ${sessionId.slice(0, 8)} · ${formatRelative(mtime)}`
    return {
      sessionId,
      shortId: deriveShortId(sessionId),
      label,
      mtime,
      hasName,
    }
  })
  // Disambiguator pass: when two or more sessions have the same resolved
  // name, suffix each with its shortId so the picker can be tapped without
  // ambiguity. Triggered by legacy duplicate registry entries (the
  // uniqueness rule in handleNew/handleRename prevents new duplicates).
  const nameCounts = new Map<string, number>()
  for (const s of sessions) {
    if (s.hasName) nameCounts.set(s.label, (nameCounts.get(s.label) ?? 0) + 1)
  }
  for (const s of sessions) {
    if (s.hasName && (nameCounts.get(s.label) ?? 0) > 1) {
      s.label = `${s.label} (${s.shortId})`
    }
  }
  sessions.sort((a, b) => b.mtime - a.mtime)
  return sessions
}
