import { test, expect, describe } from 'bun:test'
import { renameArgFromCommand } from './session-name'

describe('renameArgFromCommand', () => {
  test('extracts a single-word name', () => {
    expect(renameArgFromCommand('/rename idle')).toBe('idle')
  })

  test('extracts a multi-word name', () => {
    expect(renameArgFromCommand('/rename discuss MCP')).toBe('discuss MCP')
  })

  test('trims surrounding whitespace from the name', () => {
    expect(renameArgFromCommand('/rename   padded name  ')).toBe('padded name')
  })

  test('returns null for /rename without an argument', () => {
    expect(renameArgFromCommand('/rename')).toBe(null)
  })

  test('returns null for /rename with only whitespace', () => {
    expect(renameArgFromCommand('/rename    ')).toBe(null)
  })

  test('returns null for non-rename commands', () => {
    expect(renameArgFromCommand('/clear')).toBe(null)
    expect(renameArgFromCommand('/resume abc-123')).toBe(null)
  })

  test('returns null for commands that merely start with "rename"', () => {
    expect(renameArgFromCommand('/renamed foo')).toBe(null)
  })
})
