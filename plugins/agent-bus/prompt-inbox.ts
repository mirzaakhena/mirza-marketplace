/**
 * The agent-bus prompt inbox contract.
 *
 * A prompt is a one-way natural-language message. The sender writes a JSON
 * file into the PEER's own agent-bus inbox:
 *   <peer-project>/.claude/channels/agent-bus/inbox/<uuid>.json
 * The peer's agent-bus MCP server consumes it and emits it to its AI as a
 * <channel source="agent"> inbound message. There is no reply channel.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Max prompt body size in UTF-8 bytes (8 KB). */
export const MAX_BODY_BYTES = 8 * 1024
/** Max forwards before a message is dropped (loop backstop). */
export const HOP_CAP = 5

export type PromptPayload = {
  kind: 'prompt'
  body: string
}

export type PromptMessage = {
  id: string
  ts: string
  from: string
  kind: 'prompt'
  body: string
  hop_count: number
  broadcast_group_id?: string
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

/** Resolve a project dir to its agent-bus inbox directory. */
export function resolvePromptInboxDir(projectDir: string): string {
  return join(projectDir, '.claude', 'channels', 'agent-bus', 'inbox')
}

/** Validate a prompt payload at the SENDER, before writing. */
export function validatePromptPayload(p: unknown): ValidationResult {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' }
  const o = p as Record<string, unknown>
  if (o.kind !== 'prompt') return { ok: false, error: `kind must be "prompt" (got ${JSON.stringify(o.kind)})` }
  if (typeof o.body !== 'string' || o.body.length === 0) {
    return { ok: false, error: 'body must be a non-empty string' }
  }
  if (Buffer.byteLength(o.body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` }
  }
  return { ok: true }
}

/** Write a prompt file into the peer's agent-bus inbox (atomic tmp+rename). */
export function writePromptMessage(
  peerProjectDir: string,
  from: string,
  body: string,
  opts?: { broadcastGroupId?: string },
): { id: string; path: string } {
  const v = validatePromptPayload({ kind: 'prompt', body })
  if (!v.ok) throw new Error(v.error ?? 'invalid prompt payload')

  const inbox = resolvePromptInboxDir(peerProjectDir)
  mkdirSync(inbox, { recursive: true })
  const id = randomUUID()
  const msg: PromptMessage = {
    id,
    ts: new Date().toISOString(),
    from,
    kind: 'prompt',
    body,
    hop_count: 0,
  }
  if (opts?.broadcastGroupId) msg.broadcast_group_id = opts.broadcastGroupId

  const finalPath = join(inbox, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(msg, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}
