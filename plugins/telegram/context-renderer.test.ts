import { test, expect, describe } from 'bun:test'
import {
  progressBar,
  formatRelativeMs,
  formatJakartaHM,
  renderContextReply,
  formatTokens,
  formatResetRemain,
  shortCwd,
  shortSession,
  type LastStatus,
} from './context-renderer'

describe('progressBar', () => {
  test('0% renders all empty', () => {
    expect(progressBar(0)).toBe('○○○○○○○○○○')
  })
  test('100% renders all filled', () => {
    expect(progressBar(100)).toBe('●●●●●●●●●●')
  })
  test('40% renders 4 filled', () => {
    expect(progressBar(40)).toBe('●●●●○○○○○○')
  })
  test('clamps negative to 0', () => {
    expect(progressBar(-10)).toBe('○○○○○○○○○○')
  })
  test('clamps over 100 to 100', () => {
    expect(progressBar(150)).toBe('●●●●●●●●●●')
  })
})

describe('formatRelativeMs', () => {
  test('negative → "baru"', () => {
    expect(formatRelativeMs(-1000)).toBe('baru')
  })
  test('seconds', () => {
    expect(formatRelativeMs(45_000)).toBe('45s lalu')
  })
  test('minutes', () => {
    expect(formatRelativeMs(3 * 60_000)).toBe('3m lalu')
  })
  test('hours with remainder', () => {
    expect(formatRelativeMs(2 * 3600_000 + 15 * 60_000)).toBe('2h 15m lalu')
  })
  test('exact hours', () => {
    expect(formatRelativeMs(3 * 3600_000)).toBe('3h lalu')
  })
})

describe('formatJakartaHM', () => {
  test('UTC midnight → 07:00 WIB', () => {
    expect(formatJakartaHM(Date.UTC(2026, 4, 17, 0, 0, 0))).toBe('07:00 WIB')
  })
  test('UTC 10:42 → 17:42 WIB', () => {
    expect(formatJakartaHM(Date.UTC(2026, 4, 17, 10, 42, 0))).toBe('17:42 WIB')
  })
})

describe('formatTokens', () => {
  test('0 → "0"', () => {
    expect(formatTokens(0)).toBe('0')
  })
  test('under 1000 → raw number', () => {
    expect(formatTokens(42)).toBe('42')
    expect(formatTokens(999)).toBe('999')
  })
  test('thousands with 1 decimal', () => {
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(46747)).toBe('46.7k')
    expect(formatTokens(999_999)).toBe('1000.0k')
  })
  test('exact 1M', () => {
    expect(formatTokens(1_000_000)).toBe('1M')
  })
  test('millions with 1 decimal', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M')
    expect(formatTokens(2_300_000)).toBe('2.3M')
  })
  test('exact integer millions render without decimal', () => {
    expect(formatTokens(3_000_000)).toBe('3M')
  })
})

describe('formatResetRemain', () => {
  // Use nowMs = epoch 1_000_000 (in ms = 1_000_000_000)
  const nowMs = 1_000_000_000
  const nowSec = nowMs / 1000

  test('past or zero → "reset baru saja"', () => {
    expect(formatResetRemain(nowSec, nowMs)).toBe('reset baru saja')
    expect(formatResetRemain(nowSec - 10, nowMs)).toBe('reset baru saja')
  })
  test('minutes only', () => {
    expect(formatResetRemain(nowSec + 5 * 60, nowMs)).toBe('5m')
  })
  test('hours + minutes', () => {
    expect(formatResetRemain(nowSec + 1 * 3600 + 57 * 60, nowMs)).toBe('1h 57m')
  })
  test('exact hours', () => {
    expect(formatResetRemain(nowSec + 3 * 3600, nowMs)).toBe('3h')
  })
  test('days + hours', () => {
    expect(formatResetRemain(nowSec + 6 * 86400 + 10 * 3600, nowMs)).toBe('6d 10h')
  })
  test('exact days', () => {
    expect(formatResetRemain(nowSec + 2 * 86400, nowMs)).toBe('2d')
  })
  test('seconds only (under 1 minute) → 0m', () => {
    expect(formatResetRemain(nowSec + 30, nowMs)).toBe('0m')
  })
})

describe('shortCwd', () => {
  test('long path → last 2 segments with ellipsis prefix', () => {
    expect(shortCwd('/Users/mirza/Workspace/mirza-marketplace/sandbox/folder_two'))
      .toBe('…/sandbox/folder_two')
  })
  test('exactly 2 segments → returns with ellipsis prefix', () => {
    expect(shortCwd('/foo/bar')).toBe('…/foo/bar')
  })
  test('single segment → returns as-is', () => {
    expect(shortCwd('/foo')).toBe('/foo')
  })
  test('trailing slash stripped', () => {
    expect(shortCwd('/a/b/c/d/')).toBe('…/c/d')
  })
  test('empty string → empty string', () => {
    expect(shortCwd('')).toBe('')
  })
  test('Windows-style backslash path', () => {
    expect(shortCwd('C:\\Users\\mirza\\workspace\\bot-01'))
      .toBe('…/workspace/bot-01')
  })
  test('Windows-style with trailing backslash', () => {
    expect(shortCwd('C:\\Users\\foo\\bar\\')).toBe('…/foo/bar')
  })
  test('mixed separators', () => {
    expect(shortCwd('/Users\\mirza/Workspace\\sandbox')).toBe('…/Workspace/sandbox')
  })
  test('Windows drive only', () => {
    expect(shortCwd('C:\\')).toBe('C:')
  })
})

describe('shortSession', () => {
  test('takes first 8 chars', () => {
    expect(shortSession('8a16303d-4706-4ee2-a54b-782a3e4000eb')).toBe('8a16303d')
  })
  test('shorter than 8 → returns as-is', () => {
    expect(shortSession('abc123')).toBe('abc123')
  })
  test('empty → empty', () => {
    expect(shortSession('')).toBe('')
  })
})

describe('renderContextReply (new layout)', () => {
  const capturedAtMs = Date.UTC(2026, 4, 17, 10, 42, 0)
  const nowMs = Date.UTC(2026, 4, 17, 10, 45, 0)  // 3 min later
  const fiveHourReset = Math.floor(Date.UTC(2026, 4, 17, 12, 42, 0) / 1000)  // +1h57m
  const sevenDayReset = Math.floor(Date.UTC(2026, 4, 23, 21, 0, 0) / 1000)   // +6d10h roughly

  const fullStatus: LastStatus = {
    captured_at_ms: capturedAtMs,
    payload: {
      session_id: '8a16303d-4706-4ee2-a54b-782a3e4000eb',
      cwd: '/Users/mirza/Workspace/mirza-marketplace/sandbox/folder_two',
      model: { display_name: 'Opus 4.7 (1M context)' },
      context_window: {
        used_percentage: 5,
        total_input_tokens: 46747,
        context_window_size: 1_000_000,
      },
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: fiveHourReset },
        seven_day: { used_percentage: 9, resets_at: sevenDayReset },
      },
      cost: { total_cost_usd: 0.8023515 },
      thinking: { enabled: true },
      fast_mode: false,
    },
  }

  test('full payload produces all sections in order', () => {
    const out = renderContextReply(fullStatus, nowMs)
    const expected = [
      'Context',
      '●○○○○○○○○○ 5%',
      '46.7k / 1M tokens',
      '',
      'Rate Limit 5h',
      '●●●●○○○○○○ 40%',
      'reset 1h 57m',
      '',
      'Rate Limit 7d',
      '●○○○○○○○○○ 9%',
      'reset 6d 10h',
      '',
      'Opus 4.7 (1M context)',
      'Session: 8a16303d',
      'CWD: …/sandbox/folder_two',
      'Cost: $0.80',
      'Thinking: on',
      'Fast: off',
      '',
      'Last update: 17:42 WIB',
      '(3m lalu)',
    ].join('\n')
    expect(out).toBe(expected)
  })

  test('thinking disabled renders "off"', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, thinking: { enabled: false } },
    }
    expect(renderContextReply(s, nowMs)).toContain('Thinking: off')
  })

  test('fast_mode true renders "on"', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, fast_mode: true },
    }
    expect(renderContextReply(s, nowMs)).toContain('Fast: on')
  })

  test('missing seven_day omits the Rate Limit 7d block', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: {
        ...fullStatus.payload,
        rate_limits: { five_hour: fullStatus.payload.rate_limits!.five_hour },
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Rate Limit 7d')
    expect(out).toContain('Rate Limit 5h')
  })

  test('missing cost / thinking / fast_mode omits those lines', () => {
    const s: LastStatus = {
      captured_at_ms: capturedAtMs,
      payload: {
        session_id: fullStatus.payload.session_id,
        cwd: fullStatus.payload.cwd,
        model: fullStatus.payload.model,
        context_window: fullStatus.payload.context_window,
        rate_limits: fullStatus.payload.rate_limits,
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Cost:')
    expect(out).not.toContain('Thinking:')
    expect(out).not.toContain('Fast:')
  })

  test('missing model omits the model line but keeps Session/CWD', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, model: undefined },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).not.toContain('Opus 4.7')
    expect(out).toContain('Session: 8a16303d')
    expect(out).toContain('CWD: …/sandbox/folder_two')
  })

  test('missing context_window still shows Context section with placeholder', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: { ...fullStatus.payload, context_window: undefined },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).toContain('Context')
    expect(out).toContain('(tidak tersedia)')
  })

  test('context_window without token counts omits the tokens line', () => {
    const s: LastStatus = {
      ...fullStatus,
      payload: {
        ...fullStatus.payload,
        context_window: { used_percentage: 5 },
      },
    }
    const out = renderContextReply(s, nowMs)
    expect(out).toContain('●○○○○○○○○○ 5%')
    expect(out).not.toContain('tokens')
  })
})

describe('renderContextReply (real fixture)', () => {
  // Inline copy of sandbox/folder_two/.claude/channels/telegram/last-status.json
  // captured at 1778972545000 (2026-05-16 17:42 UTC+7, i.e. 10:42 UTC).
  // Self-contained — does not depend on files outside plugins/telegram.
  const fixture: LastStatus = {
    captured_at_ms: 1778972545000,
    payload: {
      session_id: '8a16303d-4706-4ee2-a54b-782a3e4000eb',
      cwd: '/Users/mirza/Workspace/mirza-marketplace/sandbox/folder_two',
      model: {
        display_name: 'Opus 4.7 (1M context)',
      },
      context_window: {
        used_percentage: 5,
        total_input_tokens: 46747,
        context_window_size: 1_000_000,
      },
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: 1778979600 },
        seven_day: { used_percentage: 9, resets_at: 1779530400 },
      },
      cost: { total_cost_usd: 0.8023515 },
      thinking: { enabled: true },
      fast_mode: false,
    },
  }

  test('matches spec mockup against captured payload', () => {
    // Pin "now" to 3 minutes after capture for deterministic relative time.
    const nowMs = fixture.captured_at_ms + 3 * 60_000
    const out = renderContextReply(fixture, nowMs)
    // Sanity-check key lines from the spec mockup.
    expect(out).toContain('Context')
    expect(out).toContain('46.7k / 1M tokens')
    expect(out).toContain('Rate Limit 5h')
    expect(out).toContain('Rate Limit 7d')
    expect(out).toContain('Opus 4.7 (1M context)')
    expect(out).toContain('Session: 8a16303d')
    expect(out).toContain('CWD: …/sandbox/folder_two')
    expect(out).toContain('Cost: $0.80')
    expect(out).toContain('Thinking: on')
    expect(out).toContain('Fast: off')
    expect(out).toContain('(3m lalu)')
  })
})
