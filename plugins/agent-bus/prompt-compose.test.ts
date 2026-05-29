import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  MAX_BODY_BYTES,
  validatePromptBody,
  flattenBody,
  composePromptText,
  writePromptToPending,
} from './prompt-compose'

describe('validatePromptBody', () => {
  test('accepts a normal body', () => {
    expect(validatePromptBody('hi')).toEqual({ ok: true })
  })
  test('rejects empty / non-string', () => {
    expect(validatePromptBody('').ok).toBe(false)
    expect(validatePromptBody(undefined).ok).toBe(false)
  })
  test('rejects body over the byte cap', () => {
    expect(validatePromptBody('a'.repeat(MAX_BODY_BYTES + 1)).ok).toBe(false)
  })
})

describe('flattenBody', () => {
  test('collapses CR/LF runs to a single space and trims', () => {
    expect(flattenBody('  line1\n\nline2\r\nline3  ')).toBe('line1 line2 line3')
  })
})

describe('composePromptText', () => {
  test('prepends the anti-bounce marker naming the sender and ends with the flattened body', () => {
    const out = composePromptText('bot-01', 'review file X')
    expect(out).toContain('agent bot-01 via agent-bus')
    expect(out).toContain('using-agent-bus')
    expect(out).toContain('anti-bounce')
    expect(out.endsWith('review file X')).toBe(true)
  })
  test('flattens newlines in the body', () => {
    const out = composePromptText('bot-01', 'line1\nline2')
    expect(out.endsWith('line1 line2')).toBe(true)
  })
})

describe('writePromptToPending', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-compose-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('writes a type:"prompt" payload into <peerStateDir>/pending', () => {
    const peerStateDir = join(root, 'bot-02', '.claude', 'channels', 'pty-controller')
    const res = writePromptToPending(peerStateDir, 'bot-01', 'composed text here')
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const pending = join(peerStateDir, 'pending')
    const files = readdirSync(pending).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const body = JSON.parse(readFileSync(join(pending, files[0]!), 'utf8'))
    expect(body.type).toBe('prompt')
    expect(body.from).toBe('bot-01')
    expect(body.text).toBe('composed text here')
    expect(typeof body.ts).toBe('string')
  })

  test('leaves no .tmp file behind', () => {
    const peerStateDir = join(root, 'bot-03', '.claude', 'channels', 'pty-controller')
    writePromptToPending(peerStateDir, 'bot-01', 'x')
    const pending = join(peerStateDir, 'pending')
    expect(readdirSync(pending).some(f => f.includes('.tmp'))).toBe(false)
  })
})
