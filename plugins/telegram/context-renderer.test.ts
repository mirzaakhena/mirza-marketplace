import { test, expect, describe } from 'bun:test'
import {
  progressBar,
  formatRelativeMs,
  formatJakartaHM,
  renderContextReply,
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

describe('renderContextReply (baseline — current layout)', () => {
  const status: LastStatus = {
    captured_at_ms: Date.UTC(2026, 4, 17, 10, 42, 0),
    payload: {
      context_window: { used_percentage: 5 },
      rate_limits: {
        five_hour: { used_percentage: 40, resets_at: Math.floor(Date.UTC(2026, 4, 17, 12, 39, 0) / 1000) },
      },
    },
  }
  const nowMs = Date.UTC(2026, 4, 17, 10, 45, 0)  // 3 minutes after capture

  test('produces full reply', () => {
    const out = renderContextReply(status, nowMs)
    expect(out).toContain('Context')
    expect(out).toContain('●○○○○○○○○○ 5%')
    expect(out).toContain('Usage')
    expect(out).toContain('●●●●○○○○○○ 40%')
    expect(out).toContain('Reset')
    expect(out).toContain('Last update: 17:42 WIB (3m lalu)')
  })
})
