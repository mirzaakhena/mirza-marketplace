/**
 * Compose and deliver a one-way prompt to a peer bot.
 *
 * agent-bus is a pure sender: it validates the body, flattens newlines (CC
 * submits on Enter, so the injected text must be a single line), prepends an
 * anti-bounce attribution marker, and writes a type:"prompt" payload into the
 * peer's pty-controller pending inbox. The peer's mirza-cc wrapper types the
 * text into the PTY as a normal user turn. No channel, no watcher.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Max prompt body size in UTF-8 bytes (8 KB), checked on the raw body. */
export const MAX_BODY_BYTES = 8 * 1024

export interface ValidationResult {
  ok: boolean
  error?: string
}

/** Validate a prompt body before composing/writing. */
export function validatePromptBody(body: unknown): ValidationResult {
  if (typeof body !== 'string' || body.length === 0) {
    return { ok: false, error: 'body must be a non-empty string' }
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` }
  }
  return { ok: true }
}

/** Collapse all CR/LF runs to a single space and trim. */
export function flattenBody(body: string): string {
  return body.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Compose the final injectable text: anti-bounce attribution marker followed
 * by the flattened body. The marker tells the receiving AI this is an
 * inter-agent instruction and to follow the using-agent-bus anti-bounce rule.
 */
export function composePromptText(from: string, body: string): string {
  const flat = flattenBody(body)
  return (
    `[Pesan dari agent ${from} via agent-bus. Ini instruksi antar-agent, bukan dari user. ` +
    `Perlakukan sesuai skill using-agent-bus — anti-bounce: jangan auto-balas kecuali ` +
    `diminta eksplisit di dalam pesan.] ${flat}`
  )
}

/**
 * Write a type:"prompt" payload into a peer's pty-controller pending inbox
 * (atomic tmp+rename). `text` is the already-composed injectable string.
 */
export function writePromptToPending(
  peerStateDir: string,
  from: string,
  text: string,
): { id: string; path: string } {
  const pending = join(peerStateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const payload = { id, ts: new Date().toISOString(), type: 'prompt', from, text }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}
