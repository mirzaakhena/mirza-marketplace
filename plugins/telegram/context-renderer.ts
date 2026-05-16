// Renderer for Telegram /context reply.
// Pure functions only — no I/O, no bot, no env access. Lives in its own
// module so it can be unit-tested without booting server.ts.

export type StatusLinePayload = {
  context_window?: { used_percentage?: number }
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number }
  }
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

export function renderContextReply(status: LastStatus, nowMs: number = Date.now()): string {
  const ctx = status.payload.context_window?.used_percentage
  const five = status.payload.rate_limits?.five_hour
  const fivePct = five?.used_percentage
  const resetsAt = five?.resets_at

  const ctxLine = typeof ctx === 'number'
    ? `${progressBar(ctx)} ${Math.round(ctx)}%`
    : '(tidak tersedia)'
  const usageLine = typeof fivePct === 'number'
    ? `${progressBar(fivePct)} ${Math.round(fivePct)}%`
    : '(tidak tersedia — butuh Pro/Max & 1 request dulu)'

  let resetLine = '(tidak tersedia)'
  if (typeof resetsAt === 'number') {
    const remain = resetsAt - Math.floor(nowMs / 1000)
    if (remain > 0) {
      const h = Math.floor(remain / 3600)
      const m = Math.floor((remain % 3600) / 60)
      resetLine = `(${h}h ${m}m / 5h)`
    } else {
      resetLine = '(reset baru saja)'
    }
  }

  const age = nowMs - status.captured_at_ms
  const lastLine = `Last update: ${formatJakartaHM(status.captured_at_ms)} (${formatRelativeMs(age)})`

  return [
    `Context`,
    ctxLine,
    ``,
    `Usage`,
    usageLine,
    ``,
    `Reset`,
    resetLine,
    ``,
    lastLine,
  ].join('\n')
}
