/**
 * Serialise an agent_send payload and atomically write it to the peer
 * bot's pty-controller inbox. The peer's wrapper consumes the file and
 * injects the corresponding slash command into its PTY.
 *
 * Phase 1: only `kind: "slash"` is accepted. The `prompt` and `reply`
 * variants land in Phase 2 — we reject them here with a clear error so
 * the AI gets accurate feedback instead of a silent no-op.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type AgentPayload = {
  kind: 'slash'
  command: string
  sessionName?: string
  args?: string
  /** Optional confirm-after pacing (re-used from existing wrapper protocol). */
  confirmAfterMs?: number
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

export function validatePayload(p: unknown): ValidationResult {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' }
  const o = p as Record<string, unknown>
  if (o.kind === 'prompt' || o.kind === 'reply') {
    return { ok: false, error: `kind "${o.kind}" is not supported in Phase 1 (Phase 2 feature)` }
  }
  if (o.kind !== 'slash') {
    return { ok: false, error: `kind must be "slash" (got ${JSON.stringify(o.kind)})` }
  }
  if (typeof o.command !== 'string' || o.command.length === 0) {
    return { ok: false, error: 'command must be a non-empty string' }
  }
  if (!o.command.startsWith('/')) {
    return { ok: false, error: 'command must start with "/"' }
  }
  if (o.sessionName !== undefined && typeof o.sessionName !== 'string') {
    return { ok: false, error: 'sessionName must be a string when provided' }
  }
  if (o.args !== undefined && typeof o.args !== 'string') {
    return { ok: false, error: 'args must be a string when provided' }
  }
  if (
    o.confirmAfterMs !== undefined &&
    (typeof o.confirmAfterMs !== 'number' || o.confirmAfterMs < 0)
  ) {
    return { ok: false, error: 'confirmAfterMs must be a non-negative number when provided' }
  }
  return { ok: true }
}

export function writeAgentMessage(
  peerStateDir: string,
  from: string,
  payload: AgentPayload,
  correlationId?: string,
): { id: string; correlation_id: string; path: string } {
  const v = validatePayload(payload)
  if (!v.ok) throw new Error(v.error ?? 'invalid payload')

  const pending = join(peerStateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const correlation_id = correlationId ?? randomUUID()
  // Compose `command` with args if both present, so wrapper sees a single
  // injectable string (matches existing meta-commands.ts pattern). sessionName
  // stays a top-level field — wrapper reads it directly for /clear chains.
  const fullCommand = payload.args
    ? `${payload.command} ${payload.args}`
    : payload.command
  const body: Record<string, unknown> = {
    id,
    ts: new Date().toISOString(),
    from,
    kind: 'slash',
    command: fullCommand,
    correlation_id,
    hop_count: 0,
  }
  if (payload.sessionName !== undefined) body.sessionName = payload.sessionName
  if (payload.confirmAfterMs !== undefined) body.confirmAfterMs = payload.confirmAfterMs

  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(body, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, correlation_id, path: finalPath }
}
