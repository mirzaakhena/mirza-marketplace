/**
 * Small pure helpers for agent_send routing decisions.
 *
 * (isDestructiveSlash / DESTRUCTIVE_COMMANDS were removed together with
 * kind:"slash" — neighbor-autonomy design decision 2026-06-07. Prompts are
 * the only inter-bot channel, so there is no slash blast-radius to guard.)
 */

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
