import { describe, test, expect } from 'bun:test'
import { commonMarkToMarkdownV2 } from './markdown'

describe('markdown: commonMarkToMarkdownV2', () => {
  test('returns empty string for empty input', () => {
    expect(commonMarkToMarkdownV2('')).toBe('')
  })

  test('escapes period in plain text', () => {
    expect(commonMarkToMarkdownV2('Hello world.')).toContain('\\.')
  })

  test('escapes parentheses in plain text', () => {
    expect(commonMarkToMarkdownV2('a (b) c')).toContain('\\(')
    expect(commonMarkToMarkdownV2('a (b) c')).toContain('\\)')
  })

  test('escapes hyphen in plain text', () => {
    expect(commonMarkToMarkdownV2('A - B')).toContain('\\-')
  })

  test('escapes exclamation and bang chars', () => {
    expect(commonMarkToMarkdownV2('hi!')).toContain('\\!')
  })

  test('converts double-asterisk bold to single-asterisk MV2 bold', () => {
    const out = commonMarkToMarkdownV2('**bold**')
    expect(out).toContain('*bold*')
    expect(out).not.toContain('**')
  })

  test('converts single-asterisk italic to underscore MV2 italic', () => {
    const out = commonMarkToMarkdownV2('Some *italic* text')
    expect(out).toContain('_italic_')
  })

  test('preserves inline code with backticks', () => {
    const out = commonMarkToMarkdownV2('Run `npm install`.')
    expect(out).toContain('`npm install`')
  })

  test('preserves fenced code blocks', () => {
    const md = '```\nconst x = 42;\nconsole.log(x);\n```'
    const out = commonMarkToMarkdownV2(md)
    expect(out).toContain('```')
    expect(out).toContain('const x = 42;')
  })

  test('preserves link markup', () => {
    const out = commonMarkToMarkdownV2('see [Google](https://google.com)')
    expect(out).toContain('[Google](https://google.com)')
  })

  test('does not escape chars inside inline code', () => {
    // Inside `...` Telegram treats content as literal until the closing
    // backtick; per the MV2 spec only backslash and backtick need to be
    // escaped inside the entity. Period etc. should NOT be wrapped.
    const out = commonMarkToMarkdownV2('Set `x.y.z` value')
    expect(out).toContain('`x.y.z`')
  })

  test('round-trip-ish: bold + period stays valid MV2', () => {
    // Common failure mode pre-fix: AI writes "**Step 1.**", forgets to escape
    // the period inside MV2, API returns 400. After conversion the period
    // outside the bold span must be escaped.
    const out = commonMarkToMarkdownV2('**Step 1.**')
    // Bold span uses single asterisks in MV2
    expect(out).toMatch(/\*Step 1\\?\.\*/)
  })

  test('handles mixed markup + special chars without crashing', () => {
    const md =
      '# Header\n\n' +
      'Some **bold** with *italic*, `code`, and a [link](https://example.com).\n\n' +
      '- Item one\n- Item two (with parens)\n\n' +
      '```ts\nconst x = "hello";\n```\n'
    const out = commonMarkToMarkdownV2(md)
    // Just verify it produced output, didn't throw, and escaped at least one
    // special character in the plain-text portion.
    expect(out.length).toBeGreaterThan(0)
    expect(out).toContain('\\.')
  })
})
