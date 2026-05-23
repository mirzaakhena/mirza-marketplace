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
  return `Plugin: ${name}\nv${version}${tail}`
}

/**
 * Reads the plugin's name+version from <pluginDir>/.claude-plugin/plugin.json
 * (the authoritative source per CLAUDE.md — the marketplace cache resolves
 * the version from this file, not from package.json). Falls back to
 * package.json when plugin.json is missing or one of its fields is absent
 * (older plugin layouts).
 *
 * Also tries to capture a short git sha via `git rev-parse --short HEAD`
 * in pluginDir. Every failure mode falls back silently to "unknown" / null
 * — this runs at boot in user environments where git may not exist.
 */
export function readPluginVersion(pluginDir: string): PluginVersion {
  let name = 'unknown'
  let version = 'unknown'
  // Primary source: <pluginDir>/.claude-plugin/plugin.json.
  try {
    const raw = readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown }
    if (typeof parsed.name === 'string') name = parsed.name
    if (typeof parsed.version === 'string') version = parsed.version
  } catch {
    /* fall through to package.json */
  }
  // Fallback: package.json. Fills any field still at default.
  if (name === 'unknown' || version === 'unknown') {
    try {
      const raw = readFileSync(join(pluginDir, 'package.json'), 'utf8')
      const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown }
      if (name === 'unknown' && typeof parsed.name === 'string') name = parsed.name
      if (version === 'unknown' && typeof parsed.version === 'string') version = parsed.version
    } catch {
      /* leave defaults */
    }
  }

  let sha: string | null = null
  try {
    const out = execSync('git rev-parse --short HEAD', {
      cwd: pluginDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1000,
    }).trim()
    if (/^[0-9a-f]{4,40}$/.test(out)) sha = out
  } catch {
    /* not a repo, no git, or other — sha stays null */
  }

  return { name, version, sha }
}
