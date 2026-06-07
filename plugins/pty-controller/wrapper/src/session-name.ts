/**
 * Pure helper for tracking the current session's display name. Split from
 * wrapper.ts so it is unit-testable (wrapper.ts spawns CC on import).
 */

/**
 * Extract the new name from a `/rename <name>` slash command string.
 * Returns null when the command is not a /rename or carries no argument.
 */
export function renameArgFromCommand(command: string): string | null {
  const m = /^\/rename\s+([\s\S]+)$/.exec(command)
  if (!m) return null
  const name = m[1].trim()
  return name.length > 0 ? name : null
}

export type Lifecycle = 'idle' | 'busy' | 'resetting' | 'transitioning' | 'unknown'

/**
 * Map a session display name to its lifecycle. `resetting` is never derived
 * from a name — it is an explicit in-progress marker set by the wrapper at
 * `/clear` begin. Manual / non-convention names map to `unknown`.
 */
export function deriveLifecycle(name: string | null): Lifecycle {
  if (!name) return 'unknown'
  if (name === 'idle') return 'idle'
  if (name.startsWith('task-')) return 'busy'
  if (name.startsWith('done-')) return 'transitioning'
  return 'unknown'
}
