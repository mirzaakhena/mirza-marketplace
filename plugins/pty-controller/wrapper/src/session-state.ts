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
