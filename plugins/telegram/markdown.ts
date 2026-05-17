import telegramifyMarkdown from 'telegramify-markdown'

/**
 * Convert a CommonMark-style string into Telegram MarkdownV2.
 *
 * The point is to free the AI from remembering MarkdownV2's escape rules
 * (every `. - ( ) ! +` etc. outside markup must be backslash-escaped or the
 * Telegram API rejects the message with HTTP 400). The AI writes normal
 * markdown — **bold**, *italic*, `inline code`, fenced code blocks, links —
 * and this function produces a string the server can hand to `sendMessage`
 * with `parse_mode: 'MarkdownV2'`.
 *
 * Backed by the `telegramify-markdown` package (remark-based).
 */
export function commonMarkToMarkdownV2(input: string): string {
  // Library throws on empty/null in some versions — short-circuit defensively
  // so the reply tool doesn't surface a confusing error for an empty message.
  if (!input) return ''
  return telegramifyMarkdown(input)
}
