import { test, expect, describe } from 'bun:test'
import { promptTextFromPayload } from './prompt-inject'

describe('promptTextFromPayload', () => {
  test('returns the text for a valid prompt payload', () => {
    expect(promptTextFromPayload({ type: 'prompt', text: 'hello world' })).toBe('hello world')
  })
  test('returns null for a non-prompt payload', () => {
    expect(promptTextFromPayload({ type: 'slash', command: '/clear' })).toBeNull()
  })
  test('returns null when text is missing or empty', () => {
    expect(promptTextFromPayload({ type: 'prompt' })).toBeNull()
    expect(promptTextFromPayload({ type: 'prompt', text: '' })).toBeNull()
  })
})
