import { test, expect, describe } from 'bun:test'
import { normalizeTargets, isDestructiveSlash } from './send-guards'

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

describe('isDestructiveSlash', () => {
  test('flags /clear and /delete (with or without args)', () => {
    expect(isDestructiveSlash('/clear')).toBe(true)
    expect(isDestructiveSlash('/delete hard')).toBe(true)
  })
  test('does not flag non-destructive commands', () => {
    expect(isDestructiveSlash('/rename foo')).toBe(false)
    expect(isDestructiveSlash('/effort low')).toBe(false)
  })
})
