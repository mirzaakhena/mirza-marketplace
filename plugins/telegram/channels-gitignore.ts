import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const GITIGNORE_CONTENT = `# Auto-managed by Claude Code channel plugins.
# Channel state is per-project: tokens, db, pairing data, etc.
# This .gitignore protects all subdirs (telegram/, whatsapp/, ...) from being committed.
*
!.gitignore
`

const STAR_LINE = /^\*$/m
const BANG_LINE = /^!\.gitignore$/m

export type EnsureResult = { changed: boolean; ok: boolean; reason?: string }

export function ensureChannelsGitignore(channelsDir: string): EnsureResult {
  try {
    mkdirSync(channelsDir, { recursive: true })
  } catch (err) {
    return { changed: false, ok: false, reason: `mkdir failed: ${(err as Error).message}` }
  }

  const gitignorePath = join(channelsDir, '.gitignore')
  if (existsSync(gitignorePath)) {
    try {
      const existing = readFileSync(gitignorePath, 'utf8')
      if (STAR_LINE.test(existing) && BANG_LINE.test(existing)) {
        return { changed: false, ok: true, reason: 'already has correct pattern' }
      }
    } catch {
      // fall through to write
    }
  }

  try {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT)
    return { changed: true, ok: true }
  } catch (err) {
    return { changed: false, ok: false, reason: `write failed: ${(err as Error).message}` }
  }
}
