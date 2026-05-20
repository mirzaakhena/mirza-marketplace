/**
 * Resolves the telegram plugin's identity for the /status footer.
 *
 * Two-layer split:
 *   - formatPluginVersionLine — pure, easy to test.
 *   - readPluginVersion — I/O: reads package.json and tries git rev-parse.
 *     Falls back gracefully when git isn't available or the plugin isn't
 *     in a git checkout (marketplace install path).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

export interface PluginVersion {
  name: string
  version: string
  /** Short git sha, or null if unresolvable. */
  sha: string | null
}

export function formatPluginVersionLine(
  name: string,
  version: string,
  sha: string | null,
): string {
  const tail = sha && sha.length > 0 ? ` (${sha})` : ''
  return `Plugin: ${name} v${version}${tail}`
}
