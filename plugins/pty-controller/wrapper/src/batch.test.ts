import { test, expect, describe } from 'bun:test'
import { validateBatch, MAX_BATCH_ITEMS } from './batch'

describe('validateBatch', () => {
  test('accepts the canonical handoff self-reset sequence', () => {
    const r = validateBatch([
      { command: '/rename done-foo-202606071200' },
      { command: '/clear' },
      { command: '/rename idle' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.items.map(i => i.command)).toEqual([
        '/rename done-foo-202606071200',
        '/clear',
        '/rename idle',
      ])
    }
  })

  test('accepts a single-item batch', () => {
    const r = validateBatch([{ command: '/rename task-x' }])
    expect(r.ok).toBe(true)
  })

  test('accepts a compound item inside a batch', () => {
    const r = validateBatch([
      { command: '/rename done-x-202601010101' },
      { command: '/clear', sessionName: 'idle' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[1]!.sessionName).toBe('idle')
  })

  test('accepts confirmAfterMs on an item', () => {
    const r = validateBatch([{ command: '/effort', confirmAfterMs: 500 }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items[0]!.confirmAfterMs).toBe(500)
  })

  test('rejects non-array root', () => {
    expect(validateBatch({ command: '/clear' }).ok).toBe(false)
    expect(validateBatch('/clear').ok).toBe(false)
    expect(validateBatch(null).ok).toBe(false)
  })

  test('rejects empty batch', () => {
    const r = validateBatch([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('at least one')
  })

  test('rejects oversized batch', () => {
    const items = Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => ({ command: '/compact' }))
    const r = validateBatch(items)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('too long')
  })

  test('rejects item without a slash command', () => {
    expect(validateBatch([{ command: 'clear' }]).ok).toBe(false)
    expect(validateBatch([{ text: 'hi' }]).ok).toBe(false)
    expect(validateBatch(['/clear']).ok).toBe(false)
    expect(validateBatch([null]).ok).toBe(false)
  })

  test('rejects bad sessionName / confirmAfterMs types', () => {
    expect(validateBatch([{ command: '/clear', sessionName: 7 }]).ok).toBe(false)
    expect(validateBatch([{ command: '/x', confirmAfterMs: -1 }]).ok).toBe(false)
    expect(validateBatch([{ command: '/x', confirmAfterMs: 'soon' }]).ok).toBe(false)
  })
})
