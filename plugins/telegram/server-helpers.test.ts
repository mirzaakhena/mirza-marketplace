import { test, expect, describe } from 'bun:test'
import { isOurOwnBridge, extractQuoteText } from './server-helpers'

describe('isOurOwnBridge', () => {
  test('old .sh path (Unix)', () => {
    expect(isOurOwnBridge('/home/user/plugins/telegram/scripts/context-bridge.sh')).toBe(true)
  })
  test('old .sh path (Windows)', () => {
    expect(isOurOwnBridge('C:\\Users\\Mirza\\.claude\\plugins\\cache\\mirza-marketplace\\telegram\\0.0.7-mirza.1\\scripts\\context-bridge.sh')).toBe(true)
  })
  test('new .ts path wrapped in bun run + quotes', () => {
    expect(isOurOwnBridge('bun run "/Users/x/plugins/telegram/scripts/context-bridge.ts"')).toBe(true)
  })
  test('new .ts path Windows wrapped in bun run', () => {
    expect(isOurOwnBridge('bun run "C:\\Users\\Mirza\\.claude\\plugins\\cache\\mirza-marketplace\\telegram\\0.0.8-mirza.0\\scripts\\context-bridge.ts"')).toBe(true)
  })
  test('unrelated tool (starship)', () => {
    expect(isOurOwnBridge('starship prompt')).toBe(false)
  })
  test('unrelated script with similar name', () => {
    expect(isOurOwnBridge('/usr/local/bin/context-bridge.sh')).toBe(false)
  })
  test('empty string', () => {
    expect(isOurOwnBridge('')).toBe(false)
  })
  test('whitespace-only', () => {
    expect(isOurOwnBridge('   ')).toBe(false)
  })
  test('case-insensitive match (Windows is case-insensitive)', () => {
    expect(isOurOwnBridge('C:\\Path\\Telegram\\Scripts\\Context-Bridge.SH')).toBe(true)
  })
})

describe('extractQuoteText', () => {
  test('returns undefined when no reply_to_message and no quote', () => {
    expect(extractQuoteText({})).toBeUndefined()
    expect(extractQuoteText(undefined)).toBeUndefined()
  })

  test('quote.text wins over reply_to_message.text (most specific)', () => {
    const result = extractQuoteText({
      quote: { text: 'this is the selected part', is_manual: true },
      reply_to_message: { message_id: 1, text: 'the full longer message' },
    })
    expect(result).toEqual({ text: 'this is the selected part', isManual: true })
  })

  test('quote.text without is_manual flag → isManual false (only manual quotes set the flag)', () => {
    const result = extractQuoteText({
      quote: { text: 'partial text' },
      reply_to_message: { message_id: 1, text: 'full text' },
    })
    expect(result).toEqual({ text: 'partial text', isManual: false })
  })

  test('falls back to reply_to_message.text when no quote', () => {
    const result = extractQuoteText({
      reply_to_message: { message_id: 99, text: 'original message' },
    })
    expect(result).toEqual({ text: 'original message', isManual: false })
  })

  test('falls back to reply_to_message.caption when text absent (media reply)', () => {
    const result = extractQuoteText({
      reply_to_message: { message_id: 99, caption: 'caption foto', photo: [{}] },
    })
    expect(result).toEqual({ text: 'caption foto', isManual: false })
  })

  test('text takes precedence over caption on the same reply_to_message', () => {
    const result = extractQuoteText({
      reply_to_message: { message_id: 99, text: 'text', caption: 'caption' },
    })
    expect(result?.text).toBe('text')
  })

  test('reply to bare media without text or caption → undefined (open question #3: stay silent)', () => {
    const result = extractQuoteText({
      reply_to_message: { message_id: 99, photo: [{}] },
    })
    expect(result).toBeUndefined()
  })

  test('reply to bot\'s own message produces quote_text (open question #2)', () => {
    // Same code path — if the reply has text, we extract it regardless of author
    const result = extractQuoteText({
      reply_to_message: { message_id: 50, text: 'message from bot', from: { is_bot: true, id: 123 } },
    })
    expect(result).toEqual({ text: 'message from bot', isManual: false })
  })

  test('empty string text is treated as absent (falls through to caption then undefined)', () => {
    const result = extractQuoteText({
      reply_to_message: { message_id: 1, text: '', caption: 'fallback' },
    })
    expect(result?.text).toBe('fallback')
  })

  test('external_reply ignored — only same-chat quote/reply considered (v1 non-goal)', () => {
    const result = extractQuoteText({
      external_reply: { message_id: 1, text: 'from another chat' },
    } as any)
    expect(result).toBeUndefined()
  })
})
