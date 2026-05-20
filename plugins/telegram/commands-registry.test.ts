import { describe, test, expect } from 'bun:test'
import { COMMANDS, type CommandSpec } from './commands-registry'

describe('COMMANDS registry', () => {
  test('contains exactly the 7 commands in the spec, in display order', () => {
    expect(COMMANDS.map(c => c.name)).toEqual([
      'start',
      'help',
      'status',
      'new',
      'switch',
      'delete',
      'rename',
    ])
  })

  test('every command has non-empty menuHint, helpSummary, helpDetail', () => {
    for (const c of COMMANDS) {
      expect(c.menuHint.length).toBeGreaterThan(0)
      expect(c.helpSummary.length).toBeGreaterThan(0)
      expect(c.helpDetail.length).toBeGreaterThan(0)
    }
  })

  test('menuHint stays under 50 chars (BotFather soft limit, mobile readability)', () => {
    for (const c of COMMANDS) {
      expect(c.menuHint.length).toBeLessThanOrEqual(50)
    }
  })
})
