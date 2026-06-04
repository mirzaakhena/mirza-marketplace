import { test, expect, describe } from 'bun:test'
import { promptTextFromPayload, chunkPromptText } from './prompt-inject'

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

describe('chunkPromptText', () => {
  test('returns an empty array for an empty string', () => {
    expect(chunkPromptText('', 100)).toEqual([])
  })

  test('returns a single chunk when text is shorter than the chunk size', () => {
    expect(chunkPromptText('hello', 100)).toEqual(['hello'])
  })

  test('splits into multiple chunks of the given size', () => {
    const text = 'abcdefghij' // 10 chars
    expect(chunkPromptText(text, 4)).toEqual(['abcd', 'efgh', 'ij'])
  })

  test('handles an exact multiple of the chunk size with no empty trailing chunk', () => {
    const text = 'abcdefgh' // 8 chars
    const chunks = chunkPromptText(text, 4)
    expect(chunks).toEqual(['abcd', 'efgh'])
    expect(chunks.join('')).toBe(text)
  })

  test('does not split a surrogate pair (emoji) at a chunk boundary', () => {
    // Each 😀 is 2 UTF-16 units but 1 code point. With size 2 and naive
    // String.slice this would split the surrogate pair and corrupt output.
    const text = '😀😀😀'
    const chunks = chunkPromptText(text, 2)
    expect(chunks).toEqual(['😀😀', '😀'])
    expect(chunks.join('')).toBe(text)
    // No chunk contains a lone surrogate (lost/garbled half of an emoji).
    for (const chunk of chunks) {
      expect(chunk).toBe(Array.from(chunk).join(''))
    }
  })

  test('round-trips: joining the chunks reconstructs the original text', () => {
    const text = 'The quick brown 🦊 jumps over the lazy 🐶 — 1234567890'.repeat(20)
    expect(chunkPromptText(text, 100).join('')).toBe(text)
  })

  test('defaults to a chunk size of 100 code points', () => {
    const text = 'x'.repeat(250)
    const chunks = chunkPromptText(text)
    expect(chunks.length).toBe(3)
    expect(chunks[0].length).toBe(100)
    expect(chunks[2].length).toBe(50)
  })
})
