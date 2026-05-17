// Renderer for Telegram /context reply.
// Pure functions only — no I/O, no bot, no env access. Lives in its own
// module so it can be unit-tested without booting server.ts.

export type StatusLinePayload = {
  session_id?: string
  cwd?: string
  model?: { display_name?: string }
  context_window?: {
    used_percentage?: number
    total_input_tokens?: number
    context_window_size?: number
  }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
    seven_day?: { used_percentage?: number; resets_at?: number }
  }
  cost?: { total_cost_usd?: number }
  thinking?: { enabled?: boolean }
  fast_mode?: boolean
}

export type LastStatus = { captured_at_ms: number; payload: StatusLinePayload }

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  const millions = n / 1_000_000
  return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`
}

export function progressBar(pct: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct * width) / 100)))
  return '●'.repeat(filled) + '○'.repeat(width - filled)
}

export function formatRelativeMs(ageMs: number): string {
  if (ageMs < 0) return 'baru'
  const sec = Math.floor(ageMs / 1000)
  if (sec < 60) return `${sec}s lalu`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m lalu`
  const hr = Math.floor(min / 60)
  const rm = min % 60
  return rm ? `${hr}h ${rm}m lalu` : `${hr}h lalu`
}

// Asia/Jakarta is UTC+7 year-round, no DST — compute directly to avoid Intl.
export function formatJakartaHM(epochMs: number): string {
  const d = new Date(epochMs + 7 * 3600 * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} WIB`
}

export function formatResetRemain(resetsAtSec: number, nowMs: number = Date.now()): string {
  const remainSec = resetsAtSec - Math.floor(nowMs / 1000)
  if (remainSec <= 0) return 'reset baru saja'
  const days = Math.floor(remainSec / 86400)
  const hours = Math.floor((remainSec % 86400) / 3600)
  const minutes = Math.floor((remainSec % 3600) / 60)
  if (days > 0) {
    return hours ? `${days}d ${hours}h` : `${days}d`
  }
  if (hours > 0) {
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

export function shortCwd(path: string): string {
  if (!path) return ''
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const segments = trimmed.split('/').filter(s => s.length > 0)
  if (segments.length < 2) return trimmed
  const tail = segments.slice(-2).join('/')
  return `…/${tail}`
}

export function shortSession(id: string): string {
  return id.slice(0, 8)
}

export function renderContextReply(status: LastStatus, nowMs: number = Date.now()): string {
  const p = status.payload
  const sections: string[] = []

  // --- Context section (always shown; placeholder if missing) ---
  const ctxPct = p.context_window?.used_percentage
  const ctxLines: string[] = ['Context']
  if (typeof ctxPct === 'number') {
    ctxLines.push(`${progressBar(ctxPct)} ${Math.round(ctxPct)}%`)
    const used = p.context_window?.total_input_tokens
    const total = p.context_window?.context_window_size
    if (typeof used === 'number' && typeof total === 'number') {
      ctxLines.push(`${formatTokens(used)} / ${formatTokens(total)} tokens`)
    }
  } else {
    ctxLines.push('(tidak tersedia)')
  }
  sections.push(ctxLines.join('\n'))

  // --- Rate Limit 5h (omit entirely if missing) ---
  const five = p.rate_limits?.five_hour
  if (five && (typeof five.used_percentage === 'number' || typeof five.resets_at === 'number')) {
    const lines = ['Rate Limit 5h']
    if (typeof five.used_percentage === 'number') {
      lines.push(`${progressBar(five.used_percentage)} ${Math.round(five.used_percentage)}%`)
    }
    if (typeof five.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(five.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Rate Limit 7d (omit entirely if missing) ---
  const seven = p.rate_limits?.seven_day
  if (seven && (typeof seven.used_percentage === 'number' || typeof seven.resets_at === 'number')) {
    const lines = ['Rate Limit 7d']
    if (typeof seven.used_percentage === 'number') {
      lines.push(`${progressBar(seven.used_percentage)} ${Math.round(seven.used_percentage)}%`)
    }
    if (typeof seven.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(seven.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Metadata block (skip individual lines if missing) ---
  const meta: string[] = []
  if (p.model?.display_name) meta.push(p.model.display_name)
  if (p.session_id) meta.push(`Session: ${shortSession(p.session_id)}`)
  if (p.cwd) meta.push(`CWD: ${shortCwd(p.cwd)}`)
  if (typeof p.cost?.total_cost_usd === 'number') {
    meta.push(`Cost: $${p.cost.total_cost_usd.toFixed(2)}`)
  }
  if (typeof p.thinking?.enabled === 'boolean') {
    meta.push(`Thinking: ${p.thinking.enabled ? 'on' : 'off'}`)
  }
  if (typeof p.fast_mode === 'boolean') {
    meta.push(`Fast: ${p.fast_mode ? 'on' : 'off'}`)
  }
  if (meta.length > 0) sections.push(meta.join('\n'))

  // --- Last update (always shown) ---
  const age = nowMs - status.captured_at_ms
  sections.push(
    `Last update: ${formatJakartaHM(status.captured_at_ms)}\n(${formatRelativeMs(age)})`
  )

  return sections.join('\n\n')
}
