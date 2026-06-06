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

/**
 * Max hop count for inter-agent prompts. The wrapper drops payloads with
 * hop_count > MAX_HOP; the sender refuses upfront so the AI gets a clear
 * error instead of a silent drop on the receiving side.
 */
export const MAX_HOP = 5

/**
 * Validate an optional hop_count argument from the agent_send payload.
 * undefined → 0 (a fresh, user-initiated prompt). Must be a non-negative
 * integer within MAX_HOP.
 */
export function validateHopCount(hop: unknown): { ok: boolean; value: number; error?: string } {
  if (hop === undefined || hop === null) return { ok: true, value: 0 }
  if (typeof hop !== 'number' || !Number.isInteger(hop) || hop < 0) {
    return { ok: false, value: 0, error: 'hop_count must be a non-negative integer' }
  }
  if (hop > MAX_HOP) {
    return {
      ok: false,
      value: hop,
      error: `hop_count ${hop} exceeds limit ${MAX_HOP} — refusing to send (anti-loop guard). Stop relaying; report to your own user instead.`,
    }
  }
  return { ok: true, value: hop }
}

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
 * It also carries the hop count so a receiver that is explicitly told to
 * report back knows what hop_count to pass (hop + 1) — that is what lets the
 * wrapper's mechanical hop guard actually terminate relay chains.
 */
export function composePromptText(from: string, body: string, hop = 0): string {
  const flat = flattenBody(body)
  return (
    `[Pesan dari agent ${from} via agent-bus (hop ${hop}). Ini instruksi antar-agent, bukan dari user. ` +
    `Perlakukan sesuai skill using-agent-bus — anti-bounce: jangan auto-balas kecuali ` +
    `diminta eksplisit di dalam pesan. Kalau diminta lapor balik via agent_send, set payload.hop_count = ${hop + 1}.] ${flat}`
  )
}

/**
 * Write a type:"prompt" payload into a peer's pty-controller pending inbox
 * (atomic tmp+rename). `text` is the already-composed injectable string.
 * `hopCount` rides along so the receiving wrapper's hop guard (drop when
 * hop_count > 5) applies to prompts, not just slash payloads.
 */
export function writePromptToPending(
  peerStateDir: string,
  from: string,
  text: string,
  hopCount = 0,
): { id: string; path: string } {
  const pending = join(peerStateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const payload = { id, ts: new Date().toISOString(), type: 'prompt', from, text, hop_count: hopCount }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}
