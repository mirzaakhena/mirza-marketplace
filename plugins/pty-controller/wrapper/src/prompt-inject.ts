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
