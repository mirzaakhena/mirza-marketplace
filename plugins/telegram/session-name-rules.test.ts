import { test, expect } from 'bun:test'
import { validateSessionName } from './session-name-rules.ts'

test('accepts a hyphenated name and returns it', () => {
  expect(validateSessionName('discuss-mcp', '/new')).toEqual({ ok: true, name: 'discuss-mcp' })
})

test('rejects an empty name with a command-specific example', () => {
  const r = validateSessionName('   ', '/rename')
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.message).toContain('/rename discuss-mcp')
})

test('rejects a name containing a space', () => {
  const r = validateSessionName('coba ganti', '/new')
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.message).toMatch(/spasi/i)
})

test('rejects a name with a newline (collapses to a space, then rejected)', () => {
  const r = validateSessionName('coba\nganti', '/rename')
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.message).toMatch(/spasi/i)
})

test('caps a long name at 64 chars', () => {
  const r = validateSessionName('a'.repeat(100), '/new')
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.name).toBe('a'.repeat(64))
})
