import { describe, test, expect } from 'bun:test'
import {
  COMMANDS,
  commandsFor,
  toSetMyCommandsPayload,
  renderHelpList,
  renderHelpDetail,
  type CommandSpec,
} from './commands-registry'

describe('COMMANDS registry', () => {
  test('contains exactly the 8 commands in the spec, in display order (paired first, then help, then default-only)', () => {
    expect(COMMANDS.map(c => c.name)).toEqual([
      'status',
      'switch',
      'new',
      'rename',
      'delete',
      'effort',
      'help',
      'start',
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

  test('every command declares a valid audience', () => {
    for (const c of COMMANDS) {
      expect(['default', 'paired', 'both']).toContain(c.audience)
    }
  })

  test('start is default-only (hidden from paired chats)', () => {
    const start = COMMANDS.find(c => c.name === 'start')!
    expect(start.audience).toBe('default')
  })

  test('help is shared (both audiences)', () => {
    const help = COMMANDS.find(c => c.name === 'help')!
    expect(help.audience).toBe('both')
  })
})

describe('commandsFor', () => {
  test('paired excludes /start and includes the 7 paired+both commands in registry order', () => {
    expect(commandsFor('paired').map(c => c.name)).toEqual([
      'status',
      'switch',
      'new',
      'rename',
      'delete',
      'effort',
      'help',
    ])
  })

  test('default audience contains /start and /help only', () => {
    expect(commandsFor('default').map(c => c.name)).toEqual(['help', 'start'])
  })
})

describe('toSetMyCommandsPayload', () => {
  test('paired payload maps to {command, description} and excludes /start', () => {
    const payload = toSetMyCommandsPayload('paired')
    expect(payload.map(p => p.command)).toEqual([
      'status',
      'switch',
      'new',
      'rename',
      'delete',
      'effort',
      'help',
    ])
    expect(payload[0]).toEqual({
      command: 'status',
      description: 'Context window and session info',
    })
  })

  test('default payload contains /start + /help', () => {
    const payload = toSetMyCommandsPayload('default')
    expect(payload.map(p => p.command)).toEqual(['help', 'start'])
  })

  test('preserves COMMANDS order within each audience filter', () => {
    const paired = toSetMyCommandsPayload('paired')
    const expected = commandsFor('paired').map(c => c.name)
    expect(paired.map(p => p.command)).toEqual(expected)
  })
})

describe('renderHelpList', () => {
  test('paired list omits /start and contains the 7 paired commands', () => {
    const out = renderHelpList('paired')
    expect(out.startsWith('This bot bridges Telegram')).toBe(true)
    expect(out).not.toContain('/start')
    for (const c of commandsFor('paired')) {
      expect(out).toContain(`/${c.name}`)
      expect(out).toContain(c.helpSummary)
    }
    expect(out).toContain('Bot not responding?')
    expect(out).toContain('/help <command>')
  })

  test('default list contains /start', () => {
    const out = renderHelpList('default')
    expect(out).toContain('/start')
    expect(out).toContain('/help')
    // paired-only commands are not advertised pre-pairing
    expect(out).not.toContain('/status')
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

  test('returns detail for /start even though it is hidden from paired menu', () => {
    // Paired users might still type /help start by hand; surface the doc.
    const out = renderHelpDetail('start')
    expect(out).not.toBeNull()
    expect(out!.startsWith('/start')).toBe(true)
  })

  test('prefixes the body with the command name as a header', () => {
    const out = renderHelpDetail('rename')!
    expect(out.startsWith('/rename')).toBe(true)
  })
})
