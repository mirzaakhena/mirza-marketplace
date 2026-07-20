/**
 * Single source of truth for a session's identity + lifecycle, written
 * atomically by the wrapper. Split from wrapper.ts so the merge/derive logic
 * is unit-testable (wrapper.ts spawns CC on import).
 */
import { writeFileSync, renameSync } from 'node:fs'
import process from 'node:process'
import { deriveLifecycle, type Lifecycle } from './session-name'

export interface SessionState {
  session_id: string | null
  session_name: string | null
  lifecycle: Lifecycle
  seq: number
  updated_at_ms: number
}

export interface SessionStatePatch {
  session_id?: string | null
  session_name?: string | null
  /** Explicit override (e.g. 'resetting'); else derived from resulting name. */
  lifecycle?: Lifecycle
}

export function buildNextState(
  prev: SessionState | null,
  patch: SessionStatePatch,
  nowMs: number,
): SessionState {
  const session_id =
    patch.session_id !== undefined ? patch.session_id : prev?.session_id ?? null
  const session_name =
    patch.session_name !== undefined ? patch.session_name : prev?.session_name ?? null
  const lifecycle = patch.lifecycle ?? deriveLifecycle(session_name)
  return {
    session_id,
    session_name,
    lifecycle,
    seq: (prev?.seq ?? 0) + 1,
    updated_at_ms: nowMs,
  }
}

export function writeSessionState(stateFile: string, state: SessionState): void {
  const tmp = `${stateFile}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(state))
  renameSync(tmp, stateFile)
}

/** Fields of a telegram last-status.json snapshot that name-resolution needs. */
export interface StatuslineSnapshot {
  captured_at_ms: number
  session_id: string
  session_name: string
}

/** Parse raw last-status.json contents. Null on corrupt/missing/empty fields. */
export function parseStatuslineSnapshot(raw: string): StatuslineSnapshot | null {
  try {
    const o = JSON.parse(raw) as {
      captured_at_ms?: unknown
      payload?: { session_id?: unknown; session_name?: unknown } | null
    }
    const p = o.payload
    if (
      typeof o.captured_at_ms !== 'number' ||
      !p ||
      typeof p.session_id !== 'string' || !p.session_id ||
      typeof p.session_name !== 'string' || !p.session_name
    )
      return null
    return {
      captured_at_ms: o.captured_at_ms,
      session_id: p.session_id,
      session_name: p.session_name,
    }
  } catch {
    return null
  }
}

/** A name write the wrapper itself initiated, awaiting statusline confirmation. */
export interface PendingNameExpectation {
  name: string
  since_ms: number
}

/**
 * True when a pending expectation should be cleared: the snapshot confirms it
 * (sid matches and carries the expected name) or it has timed out (so genuine
 * divergence still heals).
 */
export function expectationResolved(
  expectation: PendingNameExpectation,
  raw: string,
  sessionId: string | null,
  nowMs: number,
  timeoutMs: number,
): boolean {
  if (nowMs - expectation.since_ms > timeoutMs) return true
  const snap = parseStatuslineSnapshot(raw)
  return !!snap && sessionId !== null && snap.session_id === sessionId && snap.session_name === expectation.name
}

/**
 * Self-healing decision (spec 2026-07-20 §3.1): should the wrapper adopt the
 * statusline snapshot's session name? Returns the name to adopt, or null.
 * Guards: no adoption during a /clear transition; snapshot must describe the
 * live session; when a wrapper-initiated rename is pending confirmation, a
 * snapshot carrying a different name is refused (its captured_at_ms is
 * capture time, not content time — it can be a same-turn statusline fire
 * that predates CC processing our own injected command); must be strictly
 * fresher than the wrapper's own state (this rejects the poisoned post-/clear
 * snapshot that pairs a new sid with the old name); and must actually differ
 * from the current name.
 */
export function shouldAdoptStatuslineName(
  state: SessionState | null,
  raw: string,
  opts: { inClearTransition: boolean; expectation?: PendingNameExpectation | null },
): string | null {
  if (opts.inClearTransition) return null
  if (!state?.session_id) return null
  const snap = parseStatuslineSnapshot(raw)
  if (!snap) return null
  if (snap.session_id !== state.session_id) return null
  if (opts.expectation && snap.session_name !== opts.expectation.name) return null
  if (snap.captured_at_ms <= state.updated_at_ms) return null
  if (snap.session_name === state.session_name) return null
  return snap.session_name
}

/** A session-names.json registry entry, with its write timestamp. */
export interface RegistryEntry {
  name: string
  updatedAt: number
}

/**
 * Boot-resume arbitration (spec 2026-07-20 §3.2): pick the FRESHER of the
 * statusline snapshot (only when it describes `sessionId`) vs the telegram
 * registry entry. Tie → registry (event-driven writes beat renders).
 */
export function resolveResumeName(
  lastStatusRaw: string | null,
  registry: RegistryEntry | null,
  sessionId: string,
): { name: string | null; source: 'last-status' | 'registry' | 'none' } {
  const snap = lastStatusRaw ? parseStatuslineSnapshot(lastStatusRaw) : null
  const valid = snap && snap.session_id === sessionId ? snap : null
  if (valid && registry) {
    return valid.captured_at_ms > registry.updatedAt
      ? { name: valid.session_name, source: 'last-status' }
      : { name: registry.name, source: 'registry' }
  }
  if (valid) return { name: valid.session_name, source: 'last-status' }
  if (registry) return { name: registry.name, source: 'registry' }
  return { name: null, source: 'none' }
}

/**
 * Parse a telegram statusline snapshot (last-status.json contents) and return
 * the session name it carries — but ONLY when it describes the given session.
 * CC's statusline is the freshest source of a session's own name (e.g. after
 * a PTY-injected /rename that bypassed the telegram registry), so the wrapper
 * prefers it when seeding state on startup-resume.
 */
export function nameFromLastStatus(raw: string, sessionId: string): string | null {
  const snap = parseStatuslineSnapshot(raw)
  return snap && snap.session_id === sessionId ? snap.session_name : null
}
