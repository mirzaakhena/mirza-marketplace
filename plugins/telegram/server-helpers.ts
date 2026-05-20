/**
 * Tiny helper module for server.ts logic that benefits from unit testing.
 * Lives outside server.ts because server.ts has module-level side effects
 * (env loading, bot init) that prevent direct import in tests.
 */

/**
 * Returns true if the given statusLine command string points to ANY version
 * of our own bridge script (across `.sh`, `.ts`, future extensions, and any
 * OS path separator). Used during install to avoid storing an old version
 * of ourselves as the chained previous-statusLine command.
 */
export function isOurOwnBridge(cmd: string): boolean {
  if (!cmd || !cmd.trim()) return false
  const normalized = cmd.replace(/\\/g, '/').toLowerCase()
  return /\/telegram(\/[^/]+)?\/scripts\/context-bridge\.[a-z0-9]+/.test(normalized)
}

/**
 * Minimal Telegram Message shape needed by `extractQuoteText`. We intentionally
 * accept a loose structural subset of grammy's `Message` type so the helper is
 * unit-testable without constructing full grammy contexts.
 */
export interface QuoteSourceMessage {
  quote?: { text?: string; is_manual?: boolean }
  reply_to_message?: { text?: string; caption?: string }
}

/**
 * Resolves the "quoted content" of an inbound Telegram message according to
 * the precedence rules from docs/2026-05-20-quoted-message-support.md:
 *
 *   1. message.quote.text          — user manually highlighted a portion
 *   2. message.reply_to_message.text     — full-message text reply
 *   3. message.reply_to_message.caption  — reply to media with caption
 *   4. else → undefined
 *
 * Returns `{ text, isManual }` when any of 1–3 produces a non-empty string,
 * otherwise `undefined`. `isManual` is true only when the text came from a
 * partial-selection quote with `is_manual: true`.
 *
 * `external_reply` (cross-chat references) is intentionally not supported in
 * v1 — see the doc's non-goals.
 */
export function extractQuoteText(
  message: QuoteSourceMessage | undefined,
): { text: string; isManual: boolean } | undefined {
  if (!message) return undefined

  const quoteText = message.quote?.text
  if (quoteText && quoteText.length > 0) {
    return { text: quoteText, isManual: message.quote?.is_manual === true }
  }

  const replied = message.reply_to_message
  if (replied) {
    if (replied.text && replied.text.length > 0) {
      return { text: replied.text, isManual: false }
    }
    if (replied.caption && replied.caption.length > 0) {
      return { text: replied.caption, isManual: false }
    }
  }

  return undefined
}
