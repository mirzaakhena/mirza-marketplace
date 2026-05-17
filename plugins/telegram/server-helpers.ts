/**
 * Tiny helper module for server.ts logic that benefits from unit testing.
 * Lives outside server.ts because server.ts has module-level side effects
 * (env loading, bot init) that prevent direct import in tests.
 */

/**
 * Returns true if the given statusLine command string points to ANY version
 * of our own bridge script (across `.sh`, `.ts`, future extensions, and any
 * OS path separator). Used during install to avoid storing an old version
 * of ourselves as the chained previous-statusLine command.
 */
export function isOurOwnBridge(cmd: string): boolean {
  if (!cmd || !cmd.trim()) return false
  const normalized = cmd.replace(/\\/g, '/').toLowerCase()
  return /\/telegram(\/[^/]+)?\/scripts\/context-bridge\.[a-z0-9]+/.test(normalized)
}
