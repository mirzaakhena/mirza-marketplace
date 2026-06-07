/**
 * Best-effort reader for a peer bot's current-session metadata.
 *
 * The richer fields (session_name, context %, window size, model, effort)
 * live in the telegram plugin's `last-status.json`, written each statusLine
 * fire. That file is only as fresh as the last statusline tick, though — a
 * session that was just reset and has never been active still carries the
 * PREVIOUS session's data. The pty-controller wrapper's
 * `wrapper.current_session_id` is authoritative for "which session is live",
 * so when the two disagree the telegram snapshot is stale and we fall back
 * to the wrapper-side facts (`wrapper.current_session_id` +
 * `wrapper.current_session_name`), leaving the per-session fields null —
 * null context/model on a fresh session means "not yet active", not an
 * error.
 *
 * Pure reader. Never writes to peer state.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PeerSessionInfo {
  current_session_id: string | null
  current_session_name: string | null
  lifecycle: string | null
  context_used_percent: number | null
  /** Total context window in tokens (e.g. 200000, 1000000). Null = unknown / session not yet active. */
  context_window_size: number | null
  model: string | null
  effort_level: string | null
}

const EMPTY: PeerSessionInfo = {
  current_session_id: null,
  current_session_name: null,
  lifecycle: null,
  context_used_percent: null,
  context_window_size: null,
  model: null,
  effort_level: null,
}

export function readPeerSessionInfo(projectDir: string): PeerSessionInfo {
  const telegramStatus = readTelegramStatus(projectDir)
  const state = readWrapperState(projectDir)

  // New path: wrapper.state.json is authoritative for identity + lifecycle.
  if (state) {
    const idMatch = !!telegramStatus && telegramStatus.current_session_id === state.session_id
    // Telemetry only trustworthy for genuinely-active sessions; reset/idle
    // states are exactly where last-status.json is known to lag.
    const active = state.lifecycle === 'busy' || state.lifecycle === 'unknown'
    const trust = !!telegramStatus && idMatch && active
    return {
      current_session_id: state.session_id,
      current_session_name: state.session_name,
      lifecycle: state.lifecycle,
      context_used_percent: trust ? telegramStatus!.context_used_percent : null,
      context_window_size: trust ? telegramStatus!.context_window_size : null,
      model: trust ? telegramStatus!.model : null,
      effort_level: trust ? telegramStatus!.effort_level : null,
    }
  }

  // Legacy fallback (peer on an older wrapper without state.json): the 0.0.10
  // id-mismatch staleness check. lifecycle stays null.
  const wrapperSid = readWrapperSessionId(projectDir)
  if (telegramStatus && (!wrapperSid || telegramStatus.current_session_id === wrapperSid)) {
    if (telegramStatus.current_session_name === null) {
      telegramStatus.current_session_name = readWrapperSessionName(projectDir)
    }
    return telegramStatus
  }
  if (wrapperSid) {
    return {
      ...EMPTY,
      current_session_id: wrapperSid,
      current_session_name: readWrapperSessionName(projectDir),
    }
  }
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
        context_window?: {
          used_percentage?: number
          context_window_size?: number
        }
      }
    }
    const p = raw.payload
    if (!p) return null
    return {
      current_session_id: typeof p.session_id === 'string' ? p.session_id : null,
      current_session_name: typeof p.session_name === 'string' ? p.session_name : null,
      lifecycle: null,
      context_used_percent:
        typeof p.context_window?.used_percentage === 'number'
          ? p.context_window.used_percentage
          : null,
      context_window_size:
        typeof p.context_window?.context_window_size === 'number'
          ? p.context_window.context_window_size
          : null,
      model: typeof p.model?.display_name === 'string' ? p.model.display_name : null,
      effort_level: typeof p.effort?.level === 'string' ? p.effort.level : null,
    }
  } catch {
    return null
  }
}

interface WrapperState {
  session_id: string | null
  session_name: string | null
  lifecycle: string | null
}

function readWrapperState(projectDir: string): WrapperState | null {
  const path = join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.state.json')
  if (!existsSync(path)) return null
  try {
    const o = JSON.parse(readFileSync(path, 'utf8')) as Partial<WrapperState>
    return {
      session_id: typeof o.session_id === 'string' ? o.session_id : null,
      session_name: typeof o.session_name === 'string' ? o.session_name : null,
      lifecycle: typeof o.lifecycle === 'string' ? o.lifecycle : null,
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

// Companion file written by the wrapper (pty-controller >= 0.0.25 /
// wrapper 0.0.2) whenever it learns the live session's name. Empty file
// means "current session has no (known) name".
function readWrapperSessionName(projectDir: string): string | null {
  const path = join(
    projectDir,
    '.claude',
    'channels',
    'pty-controller',
    'wrapper.current_session_name',
  )
  if (!existsSync(path)) return null
  try {
    const name = readFileSync(path, 'utf8').trim()
    return name || null
  } catch {
    return null
  }
}
