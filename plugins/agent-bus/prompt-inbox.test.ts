import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolvePromptInboxDir,
  validatePromptPayload,
  writePromptMessage,
  MAX_BODY_BYTES,
  validateInboundPrompt,
} from './prompt-inbox'

describe('resolvePromptInboxDir', () => {
  test('derives <project>/.claude/channels/agent-bus/inbox', () => {
    expect(resolvePromptInboxDir('/repo/bot-02')).toBe(
      join('/repo/bot-02', '.claude', 'channels', 'agent-bus', 'inbox'),
    )
  })
})

describe('validatePromptPayload', () => {
  test('accepts a well-formed prompt', () => {
    expect(validatePromptPayload({ kind: 'prompt', body: 'hi' })).toEqual({ ok: true })
  })
  test('rejects non-prompt kind', () => {
    expect(validatePromptPayload({ kind: 'slash', body: 'x' }).ok).toBe(false)
  })
  test('rejects empty body', () => {
    expect(validatePromptPayload({ kind: 'prompt', body: '' }).ok).toBe(false)
  })
  test('rejects body over the byte cap', () => {
    const big = 'a'.repeat(MAX_BODY_BYTES + 1)
    expect(validatePromptPayload({ kind: 'prompt', body: big }).ok).toBe(false)
  })
})

describe('writePromptMessage', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-inbox-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('writes a prompt file into the peer agent-bus inbox', () => {
    const peerDir = join(root, 'bot-02')
    const res = writePromptMessage(peerDir, 'bot-01', 'tolong review file X')
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const inbox = resolvePromptInboxDir(peerDir)
    const files = readdirSync(inbox).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const body = JSON.parse(readFileSync(join(inbox, files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('prompt')
    expect(body.body).toBe('tolong review file X')
    expect(body.hop_count).toBe(0)
    expect(body.broadcast_group_id).toBeUndefined()
  })

  test('includes broadcast_group_id when provided', () => {
    const peerDir = join(root, 'bot-03')
    writePromptMessage(peerDir, 'bot-01', 'hi', { broadcastGroupId: 'grp-1' })
    const inbox = resolvePromptInboxDir(peerDir)
    const file = readdirSync(inbox).filter(f => f.endsWith('.json'))[0]!
    const body = JSON.parse(readFileSync(join(inbox, file), 'utf8'))
    expect(body.broadcast_group_id).toBe('grp-1')
  })

  test('no .tmp file is left behind', () => {
    const peerDir = join(root, 'bot-04')
    writePromptMessage(peerDir, 'bot-01', 'hi')
    const inbox = resolvePromptInboxDir(peerDir)
    expect(readdirSync(inbox).some(f => f.includes('.tmp'))).toBe(false)
  })
})

describe('validateInboundPrompt', () => {
  const base = { id: 'x', ts: 't', from: 'bot-01', kind: 'prompt', body: 'hi', hop_count: 0 }

  test('accepts a valid inbound prompt and returns the parsed message', () => {
    const r = validateInboundPrompt(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.msg.from).toBe('bot-01')
      expect(r.msg.body).toBe('hi')
    }
  })
  test('rejects missing from', () => {
    expect(validateInboundPrompt({ ...base, from: '' }).ok).toBe(false)
  })
  test('rejects wrong kind', () => {
    expect(validateInboundPrompt({ ...base, kind: 'slash' }).ok).toBe(false)
  })
  test('rejects oversized body', () => {
    expect(validateInboundPrompt({ ...base, body: 'a'.repeat(9000) }).ok).toBe(false)
  })
  test('rejects hop_count over the cap', () => {
    expect(validateInboundPrompt({ ...base, hop_count: 6 }).ok).toBe(false)
  })
  test('defaults hop_count to 0 when absent', () => {
    const r = validateInboundPrompt({ id: 'x', ts: 't', from: 'b', kind: 'prompt', body: 'hi' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.msg.hop_count).toBe(0)
  })
})
