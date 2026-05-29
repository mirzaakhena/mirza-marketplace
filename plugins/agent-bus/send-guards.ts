/**
 * Small pure helpers for agent_send routing decisions.
 */

/** Slash commands that must never fan out to multiple targets at once. */
export const DESTRUCTIVE_COMMANDS = ['/clear', '/delete'] as const

/**
 * Normalize the `target` argument (string or string[]) to a clean, deduped,
 * non-empty array of names. Throws if nothing usable remains.
 */
export function normalizeTargets(target: string | string[]): string[] {
  const raw = Array.isArray(target) ? target : [target]
  const cleaned: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const name = t.trim()
    if (name && !cleaned.includes(name)) cleaned.push(name)
  }
  if (cleaned.length === 0) throw new Error('agent_send needs at least one target')
  return cleaned
}

/**
 * True when a slash command's first token is a destructive verb. Used to
 * reject destructive commands sent to an array of targets (blast-radius guard).
 */
export function isDestructiveSlash(command: string): boolean {
  const first = command.trim().split(/\s+/)[0] ?? ''
  return (DESTRUCTIVE_COMMANDS as readonly string[]).includes(first)
}
