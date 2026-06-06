/**
 * Resolves the currently-active Claude Code session for the /context footer.
 *
 * Two layers:
 *   - readCurrentSessionId: reads <pty-state>/wrapper.current_session_id,
 *     the same file meta-commands.ts uses to drive /rename and /switch.
 *   - resolveCurrentSessionName: looks the sessionId up in the persistent
 *     session-names-registry to get the human-readable name.
 *
 * Both layers return null on absence rather than throwing — /context renders
 * a fallback when either is missing.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadRegistry } from './session-names-registry.ts'

/**
 * Resolve the pty-controller state directory the wrapper writes to.
 * Mirrors meta-commands.ts's resolvePtyStateDir: explicit env override
 * wins, else <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller.
 */
function resolvePtyStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.PTY_CONTROLLER_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) return null
  return join(projectDir, '.claude', 'channels', 'pty-controller')
}

/**
 * Returns the wrapper's current full session id, or null if the file is
 * missing/unreadable/empty.
 */
export function readCurrentSessionId(
  env: Record<string, string | undefined>,
): string | null {
  const dir = resolvePtyStateDir(env)
  if (!dir) return null
  const file = join(dir, 'wrapper.current_session_id')
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * Looks up `sessionId` in the persistent name registry under `telegramStateDir`.
 * Returns the registered name, or null if none.
 */
export function resolveCurrentSessionName(
  sessionId: string | null,
  telegramStateDir: string,
): string | null {
  if (!sessionId) return null
  const entry = loadRegistry(telegramStateDir).get(sessionId)
  return entry?.name ?? null
}
