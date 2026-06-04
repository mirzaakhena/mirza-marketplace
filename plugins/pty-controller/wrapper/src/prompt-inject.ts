/**
 * Pure helper for the wrapper's type:"prompt" payload branch.
 *
 * Kept in its own side-effect-free module so it is unit-testable — wrapper.ts
 * spawns Claude Code on import and cannot be loaded inside a test.
 *
 * The text is already composed by the sender (agent-bus): it includes the
 * anti-bounce marker and the flattened, single-line body. The wrapper types
 * it verbatim and stays oblivious to attribution.
 */
export function promptTextFromPayload(payload: { type?: string; text?: unknown }): string | null {
  if (payload.type !== 'prompt') return null
  if (typeof payload.text !== 'string' || payload.text.length === 0) return null
  return payload.text
}

/**
 * Split a prompt body into small slices for paced injection into the PTY.
 *
 * A single large raw write of one long line into Claude Code's TUI input over
 * Windows ConPTY overflows the input buffer: the stream evicts the oldest
 * characters (the head) and keeps the newest (the tail), so a long agent-bus
 * prompt arrives truncated to just its tail. Writing in small chunks with a
 * pause between them lets the TUI drain its buffer and keeps the body intact.
 *
 * Splits on code points (Array.from), not UTF-16 units, so a chunk boundary
 * never bisects a surrogate pair — our messages contain emoji and a split
 * surrogate would corrupt the stream. join('') always reconstructs the input.
 */
export function chunkPromptText(text: string, size = 100): string[] {
  const cps = Array.from(text)
  const out: string[] = []
  for (let i = 0; i < cps.length; i += size) out.push(cps.slice(i, i + size).join(''))
  return out
}
