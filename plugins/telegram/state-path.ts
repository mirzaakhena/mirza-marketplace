import { join } from 'path'

export function resolveStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.TELEGRAM_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (projectDir) return join(projectDir, '.claude', 'channels', 'telegram')
  return null
}

export function resolveChannelsDir(env: Record<string, string | undefined>): string | null {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (projectDir) return join(projectDir, '.claude', 'channels')
  return null
}
