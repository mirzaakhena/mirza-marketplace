import { test, expect, describe } from 'bun:test'
import { telegramLayerCommandError } from './slash-guards'

describe('telegramLayerCommandError', () => {
  test('rejects /new and names the /clear + /rename alternative', () => {
    const err = telegramLayerCommandError('/new idle')
    expect(err).not.toBe(null)
    expect(err).toContain('/clear')
    expect(err).toContain('/rename')
    expect(err).toContain('sessionName')
  })

  test('rejects bare /new (no argument)', () => {
    expect(telegramLayerCommandError('/new')).not.toBe(null)
  })

  test('rejects /switch and points at /resume', () => {
    const err = telegramLayerCommandError('/switch')
    expect(err).not.toBe(null)
    expect(err).toContain('/resume')
  })

  test('rejects /delete', () => {
    expect(telegramLayerCommandError('/delete')).not.toBe(null)
  })

  test('rejects /effort and points at agent_send confirmAfterMs', () => {
    const err = telegramLayerCommandError('/effort high')
    expect(err).not.toBe(null)
    expect(err).toContain('confirmAfterMs')
  })

  test('allows CC-native and plugin commands through', () => {
    for (const cmd of [
      '/clear',
      '/rename idle',
      '/compact',
      '/resume abc-123',
      '/handoff',
      '/telegram:notify-user fresh session ready',
    ]) {
      expect(telegramLayerCommandError(cmd)).toBe(null)
    }
  })

  test('matches the command word only — /newer is not /new', () => {
    expect(telegramLayerCommandError('/newer thing')).toBe(null)
    expect(telegramLayerCommandError('/switcher')).toBe(null)
    expect(telegramLayerCommandError('/effortless')).toBe(null)
  })
})
