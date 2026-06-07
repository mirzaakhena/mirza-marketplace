import { test, expect, describe } from 'bun:test'
import { normalizeTargets } from './send-guards'

// (isDestructiveSlash tests were removed together with kind:"slash" —
// neighbor-autonomy design decision 2026-06-07.)

describe('normalizeTargets', () => {
  test('wraps a single string in an array', () => {
    expect(normalizeTargets('bot-02')).toEqual(['bot-02'])
  })
  test('passes an array through, trimming + dropping empties', () => {
    expect(normalizeTargets(['bot-02', ' bot-03 ', ''])).toEqual(['bot-02', 'bot-03'])
  })
  test('dedupes repeated targets', () => {
    expect(normalizeTargets(['bot-02', 'bot-02'])).toEqual(['bot-02'])
  })
  test('throws on empty input', () => {
    expect(() => normalizeTargets([])).toThrow('at least one target')
    expect(() => normalizeTargets('  ')).toThrow('at least one target')
  })
})
