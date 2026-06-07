/**
 * Pure helpers for batch injection payloads (design decision 2026-06-07,
 * docs/2026-06-07-design-decision-batch-injection-and-neighbor-autonomy.md).
 *
 * A pending file whose JSON root is an ARRAY is a batch: an ordered list of
 * slash-command items enqueued contiguously (atomic enqueue — no foreign
 * payload can interleave between its items). Split from wrapper.ts so it is
 * unit-testable (wrapper.ts spawns CC on import).
 */

export type BatchItem = {
  command: string
  /** Compound form survives inside a batch item too (/clear + rename chain). */
  sessionName?: string
  confirmAfterMs?: number
}

export const MAX_BATCH_ITEMS = 8

export function validateBatch(parsed: unknown):
  | { ok: true; items: BatchItem[] }
  | { ok: false; error: string } {
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'batch payload must be an array' }
  }
  if (parsed.length === 0) {
    return { ok: false, error: 'batch must contain at least one item' }
  }
  if (parsed.length > MAX_BATCH_ITEMS) {
    return {
      ok: false,
      error: `batch too long (${parsed.length} items, max ${MAX_BATCH_ITEMS})`,
    }
  }
  const items: BatchItem[] = []
  for (let i = 0; i < parsed.length; i++) {
    const it = parsed[i]
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      return { ok: false, error: `item ${i} must be an object with a command field` }
    }
    const o = it as Record<string, unknown>
    if (typeof o.command !== 'string' || !o.command.startsWith('/')) {
      return { ok: false, error: `item ${i} missing slash command` }
    }
    const item: BatchItem = { command: o.command }
    if (o.sessionName !== undefined) {
      if (typeof o.sessionName !== 'string') {
        return { ok: false, error: `item ${i} sessionName must be a string` }
      }
      item.sessionName = o.sessionName
    }
    if (o.confirmAfterMs !== undefined) {
      if (typeof o.confirmAfterMs !== 'number' || o.confirmAfterMs < 0) {
        return { ok: false, error: `item ${i} confirmAfterMs must be a non-negative number` }
      }
      item.confirmAfterMs = o.confirmAfterMs
    }
    items.push(item)
  }
  return { ok: true, items }
}
