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
