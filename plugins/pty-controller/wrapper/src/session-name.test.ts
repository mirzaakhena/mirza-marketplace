import { test, expect, describe } from 'bun:test'
import { renameArgFromCommand, deriveLifecycle } from './session-name'

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

describe('deriveLifecycle', () => {
  test('null/empty name → unknown', () => {
    expect(deriveLifecycle(null)).toBe('unknown')
    expect(deriveLifecycle('')).toBe('unknown')
  })

  test('"idle" → idle', () => {
    expect(deriveLifecycle('idle')).toBe('idle')
  })

  test('task-* → busy', () => {
    expect(deriveLifecycle('task-todolist-pingpong')).toBe('busy')
  })

  test('done-* → transitioning', () => {
    expect(deriveLifecycle('done-foo-202606071200')).toBe('transitioning')
  })

  test('manual non-convention name → unknown', () => {
    expect(deriveLifecycle('refactoring besar')).toBe('unknown')
  })
})
