import { test, expect, describe } from 'bun:test'
import { resolveStateDir, resolveChannelsDir } from './state-path'

describe('resolveStateDir', () => {
  test('returns null when both env unset', () => {
    expect(resolveStateDir({})).toBe(null)
  })

  test('returns null when both env are empty strings', () => {
    expect(resolveStateDir({ TELEGRAM_STATE_DIR: '', CLAUDE_PROJECT_DIR: '' })).toBe(null)
  })

  test('returns TELEGRAM_STATE_DIR verbatim when set', () => {
    expect(resolveStateDir({ TELEGRAM_STATE_DIR: '/tmp/foo' })).toBe('/tmp/foo')
  })

  test('derives path from CLAUDE_PROJECT_DIR', () => {
    expect(resolveStateDir({ CLAUDE_PROJECT_DIR: '/repo' })).toBe('/repo/.claude/channels/telegram')
  })

  test('TELEGRAM_STATE_DIR wins over CLAUDE_PROJECT_DIR', () => {
    expect(
      resolveStateDir({ TELEGRAM_STATE_DIR: '/tmp/foo', CLAUDE_PROJECT_DIR: '/repo' })
    ).toBe('/tmp/foo')
  })

  test('normalizes trailing slash in CLAUDE_PROJECT_DIR', () => {
    expect(resolveStateDir({ CLAUDE_PROJECT_DIR: '/repo/' })).toBe('/repo/.claude/channels/telegram')
  })

  test('trims whitespace from env values', () => {
    expect(resolveStateDir({ TELEGRAM_STATE_DIR: '  /tmp/foo  ' })).toBe('/tmp/foo')
  })
})

describe('resolveChannelsDir', () => {
  test('returns null when CLAUDE_PROJECT_DIR unset', () => {
    expect(resolveChannelsDir({})).toBe(null)
  })

  test('returns null on empty string', () => {
    expect(resolveChannelsDir({ CLAUDE_PROJECT_DIR: '' })).toBe(null)
  })

  test('derives channels dir from CLAUDE_PROJECT_DIR', () => {
    expect(resolveChannelsDir({ CLAUDE_PROJECT_DIR: '/repo' })).toBe('/repo/.claude/channels')
  })
})
