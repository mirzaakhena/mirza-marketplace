/**
 * Per-project "soft delete" list. Session IDs in this file are filtered out
 * from the /switch, /delete, and /archive pickers in sessions-list.ts.
 *
 * The session's jsonl on disk is NOT touched — `claude --resume <sid>` from
 * a terminal still works. Unarchiving is intentionally not exposed via
 * Telegram; user opens the laptop and edits this file by hand.
 *
 * File location: <telegram-state-dir>/archived-sessions.json
 * Canonical shape: {"archived":["<sid>","<sid>",…]}
 * Legacy tolerated on read: plain array ["<sid>",…]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const FILENAME = 'archived-sessions.json'

/** Load the archived-IDs set. Missing/malformed → empty set. */
export function loadArchived(stateDir: string): Set<string> {
  const path = join(stateDir, FILENAME)
  if (!existsSync(path)) return new Set()
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return new Set()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Set()
  }
  if (Array.isArray(parsed)) {
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { archived?: unknown }).archived)
  ) {
    return new Set(
      (parsed as { archived: unknown[] }).archived.filter(
        (x): x is string => typeof x === 'string',
      ),
    )
  }
  return new Set()
}

/** Append a sessionId to the archive (idempotent). Atomic tmp+rename write. */
export function addArchived(stateDir: string, sessionId: string): void {
  const existing = loadArchived(stateDir)
  if (existing.has(sessionId)) return
  existing.add(sessionId)
  mkdirSync(stateDir, { recursive: true })
  const path = join(stateDir, FILENAME)
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify({ archived: Array.from(existing) }, null, 2))
  renameSync(tmp, path)
}
