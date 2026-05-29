import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeAgentMessage, validatePayload } from './inbox-writer'

describe('inbox-writer: validatePayload', () => {
  test('accepts slash with command', () => {
    const r = validatePayload({ kind: 'slash', command: '/clear' })
    expect(r.ok).toBe(true)
  })

  test('accepts slash with command + sessionName', () => {
    const r = validatePayload({ kind: 'slash', command: '/clear', sessionName: 'foo' })
    expect(r.ok).toBe(true)
  })

  test('accepts slash with command + args', () => {
    const r = validatePayload({ kind: 'slash', command: '/effort', args: 'high' })
    expect(r.ok).toBe(true)
  })

  test('rejects slash without command', () => {
    const r = validatePayload({ kind: 'slash' } as any)
    expect(r.ok).toBe(false)
  })

  test('rejects command without leading slash', () => {
    const r = validatePayload({ kind: 'slash', command: 'clear' })
    expect(r.ok).toBe(false)
  })

  test('rejects unknown kind (prompts go via prompt-compose, not this writer)', () => {
    const r = validatePayload({ kind: 'prompt', body: 'hi' } as any)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('prompt-compose')
  })
})

describe('inbox-writer: writeAgentMessage', () => {
  let peerStateDir: string
  beforeEach(() => {
    peerStateDir = mkdtempSync(join(tmpdir(), 'peer-state-'))
    mkdirSync(join(peerStateDir, 'pending'), { recursive: true })
  })
  afterEach(() => {
    rmSync(peerStateDir, { recursive: true, force: true })
  })

  test('writes JSON file to <peerState>/pending/<uuid>.json', () => {
    const res = writeAgentMessage(peerStateDir, 'bot-01', {
      kind: 'slash',
      command: '/clear',
    })
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.path).toContain('pending')
    const files = readdirSync(join(peerStateDir, 'pending'))
    expect(files).toHaveLength(1)
    const body = JSON.parse(readFileSync(join(peerStateDir, 'pending', files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('slash')
    expect(body.command).toBe('/clear')
    expect(body.hop_count).toBe(0)
    expect(typeof body.correlation_id).toBe('string')
  })

  test('uses provided correlation_id when supplied', () => {
    const res = writeAgentMessage(
      peerStateDir,
      'bot-01',
      { kind: 'slash', command: '/clear' },
      'corr-fixed',
    )
    expect(res.correlation_id).toBe('corr-fixed')
    const files = readdirSync(join(peerStateDir, 'pending'))
    const body = JSON.parse(readFileSync(join(peerStateDir, 'pending', files[0]!), 'utf8'))
    expect(body.correlation_id).toBe('corr-fixed')
  })

  test('atomic write — no .tmp file lingers after success', () => {
    writeAgentMessage(peerStateDir, 'bot-01', { kind: 'slash', command: '/clear' })
    const files = readdirSync(join(peerStateDir, 'pending'))
    expect(files.every(f => !f.includes('.tmp.'))).toBe(true)
  })

  test('throws on invalid payload', () => {
    expect(() =>
      writeAgentMessage(peerStateDir, 'bot-01', { kind: 'slash' } as any),
    ).toThrow()
  })
})
