import { describe, test, expect } from 'bun:test'
import { COMMANDS, toSetMyCommandsPayload, renderHelpList, renderHelpDetail, type CommandSpec } from './commands-registry'

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

describe('toSetMyCommandsPayload', () => {
  test('maps each spec to {command, description}', () => {
    const payload = toSetMyCommandsPayload()
    expect(payload).toHaveLength(COMMANDS.length)
    expect(payload[0]).toEqual({
      command: 'start',
      description: 'Welcome and pairing guide',
    })
  })

  test('preserves COMMANDS order', () => {
    const payload = toSetMyCommandsPayload()
    expect(payload.map(p => p.command)).toEqual(COMMANDS.map(c => c.name))
  })
})

describe('renderHelpList', () => {
  const out = renderHelpList()

  test('starts with the intro paragraph', () => {
    expect(out.startsWith('This bot bridges Telegram')).toBe(true)
  })

  test('lists every command with its helpSummary', () => {
    for (const c of COMMANDS) {
      expect(out).toContain(`/${c.name}`)
      expect(out).toContain(c.helpSummary)
    }
  })

  test('ends with the troubleshooting tail', () => {
    expect(out).toContain('Bot not responding?')
  })

  test('mentions the /help <name> hint', () => {
    expect(out).toContain('/help <command>')
  })
})

describe('renderHelpDetail', () => {
  test('returns the helpDetail for an exact match (lowercase)', () => {
    const out = renderHelpDetail('status')
    expect(out).not.toBeNull()
    expect(out).toContain('context-window usage')
  })

  test('accepts a leading slash', () => {
    expect(renderHelpDetail('/status')).toBe(renderHelpDetail('status'))
  })

  test('is case-insensitive', () => {
    expect(renderHelpDetail('STATUS')).toBe(renderHelpDetail('status'))
  })

  test('returns null for an unknown command', () => {
    expect(renderHelpDetail('nope')).toBeNull()
    expect(renderHelpDetail('')).toBeNull()
  })

  test('prefixes the body with the command name as a header', () => {
    const out = renderHelpDetail('rename')!
    expect(out.startsWith('/rename')).toBe(true)
  })
})
