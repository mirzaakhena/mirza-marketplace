/**
 * Resolves plugin identities for the /version reply.
 *
 * Three resolvers, none hardcoded:
 *   - formatPluginVersionLine — pure, easy to test.
 *   - readPluginVersion — I/O: reads plugin.json/package.json and tries
 *     git rev-parse. Falls back gracefully when git isn't available or the
 *     plugin isn't in a git checkout (marketplace install path).
 *   - readInstalledPluginVersion — I/O: reads Claude Code's
 *     ~/.claude/plugins/installed_plugins.json to resolve the installed
 *     version of a *sibling* plugin (e.g. agent-bus) that doesn't publish
 *     a runtime version file of its own.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** Looks like a semver-ish version ("0.0.5", "1.2.3-mirza.0"), not a git sha. */
const SEMVERISH_RE = /^\d+\.\d+/

/**
 * Resolve the installed version of a sibling plugin from Claude Code's
 * registry at <registryPath> (defaults to ~/.claude/plugins/installed_plugins.json).
 *
 * `pluginName` is matched against registry keys of the form
 * "<name>@<marketplace>" — the marketplace part is ignored so callers don't
 * need to know where the plugin was installed from.
 *
 * The registry's own `version` field is NOT trusted blindly: after some
 * marketplace updates Claude Code records the git commit sha there (e.g.
 * "25345b784860") instead of a semver. So per entry we resolve in order:
 *   1. `<installPath>/.claude-plugin/plugin.json` → `version` (authoritative)
 *   2. the entry's `version` field, only if it looks semver-ish
 *
 * Returns null when nothing resolves — callers omit the line, never crash.
 */
export function readInstalledPluginVersion(
  pluginName: string,
  registryPath: string = join(homedir(), '.claude', 'plugins', 'installed_plugins.json'),
): string | null {
  let parsed: { plugins?: Record<string, unknown> }
  try {
    parsed = JSON.parse(readFileSync(registryPath, 'utf8'))
  } catch {
    return null
  }
  const plugins = parsed?.plugins
  if (!plugins || typeof plugins !== 'object') return null
  for (const [key, value] of Object.entries(plugins)) {
    if (key !== pluginName && !key.startsWith(`${pluginName}@`)) continue
    const entries = Array.isArray(value) ? value : [value]
    for (const entry of entries) {
      const e = entry as { version?: unknown; installPath?: unknown } | null
      // 1. Authoritative: plugin.json inside the install path.
      if (typeof e?.installPath === 'string' && e.installPath.length > 0) {
        try {
          const raw = readFileSync(join(e.installPath, '.claude-plugin', 'plugin.json'), 'utf8')
          const manifest = JSON.parse(raw) as { version?: unknown }
          if (typeof manifest.version === 'string' && manifest.version.length > 0) {
            return manifest.version
          }
        } catch {
          /* fall through to the registry field */
        }
      }
      // 2. Registry field, but only when it isn't a git sha.
      if (typeof e?.version === 'string' && SEMVERISH_RE.test(e.version)) {
        return e.version
      }
    }
  }
  return null
}
