#!/usr/bin/env bun
/**
 * SessionStart hook: injects the current Telegram session name into the
 * agent's context so behavioral skills (name-session) can detect when the
 * session is still called "idle". Degrades silently when no pty/telegram
 * state exists — emits nothing rather than erroring.
 */
import { readCurrentSessionId, resolveCurrentSessionName } from '../current-session-info.ts'
import { resolveStateDir } from '../state-path.ts'

export function resolveSessionNameForContext(
  env: Record<string, string | undefined>,
): string | null {
  const sid = readCurrentSessionId(env)
  const telegramStateDir = resolveStateDir(env)
  if (!sid || !telegramStateDir) return null
  return resolveCurrentSessionName(sid, telegramStateDir)
}

function main(): void {
  const name = resolveSessionNameForContext(process.env)
  if (!name) return // silent: nothing to inject
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Current Telegram session name: "${name}".`,
      },
    }),
  )
}

if (import.meta.main) main()
