/**
 * Best-effort reader for a peer bot's current-session metadata.
 *
 * The richer fields (session_name, context %, model, effort) live in the
 * telegram plugin's `last-status.json`, written each statusLine fire. If
 * that plugin isn't installed in the peer, we degrade to the pty-controller
 * `wrapper.current_session_id` file — that gives us at least the session
 * UUID. All other fields return null.
 *
 * Pure reader. Never writes to peer state.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PeerSessionInfo {
  current_session_id: string | null
  current_session_name: string | null
  context_used_percent: number | null
  model: string | null
  effort_level: string | null
}

const EMPTY: PeerSessionInfo = {
  current_session_id: null,
  current_session_name: null,
  context_used_percent: null,
  model: null,
  effort_level: null,
}

export function readPeerSessionInfo(projectDir: string): PeerSessionInfo {
  const telegramStatus = readTelegramStatus(projectDir)
  if (telegramStatus) return telegramStatus
  const sid = readWrapperSessionId(projectDir)
  if (sid) return { ...EMPTY, current_session_id: sid }
  return { ...EMPTY }
}

function readTelegramStatus(projectDir: string): PeerSessionInfo | null {
  const path = join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json')
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      payload?: {
        session_id?: string
        session_name?: string
        model?: { display_name?: string }
        effort?: { level?: string }
        context_window?: { used_percentage?: number }
      }
    }
    const p = raw.payload
    if (!p) return null
    return {
      current_session_id: typeof p.session_id === 'string' ? p.session_id : null,
      current_session_name: typeof p.session_name === 'string' ? p.session_name : null,
      context_used_percent:
        typeof p.context_window?.used_percentage === 'number'
          ? p.context_window.used_percentage
          : null,
      model: typeof p.model?.display_name === 'string' ? p.model.display_name : null,
      effort_level: typeof p.effort?.level === 'string' ? p.effort.level : null,
    }
  } catch {
    return null
  }
}

function readWrapperSessionId(projectDir: string): string | null {
  const path = join(
    projectDir,
    '.claude',
    'channels',
    'pty-controller',
    'wrapper.current_session_id',
  )
  if (!existsSync(path)) return null
  try {
    const sid = readFileSync(path, 'utf8').trim()
    return sid || null
  } catch {
    return null
  }
}
