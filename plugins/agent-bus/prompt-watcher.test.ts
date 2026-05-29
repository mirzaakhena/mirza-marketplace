import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { consumeInboxFile, sweepInbox } from './prompt-watcher'
import type { PromptMessage } from './prompt-inbox'

function writeFile(inbox: string, name: string, obj: unknown) {
  mkdirSync(inbox, { recursive: true })
  writeFileSync(join(inbox, name), JSON.stringify(obj))
}

const noop = (_: string) => {}

describe('consumeInboxFile', () => {
  let inbox: string
  beforeEach(() => {
    inbox = mkdtempSync(join(tmpdir(), 'pw-'))
  })
  afterEach(() => {
    rmSync(inbox, { recursive: true, force: true })
  })

  test('valid file → emit called, file deleted', () => {
    const got: PromptMessage[] = []
    writeFile(inbox, 'a.json', { id: 'a', ts: 't', from: 'bot-01', kind: 'prompt', body: 'hi', hop_count: 0 })
    consumeInboxFile(inbox, 'a.json', m => got.push(m), noop)
    expect(got).toHaveLength(1)
    expect(got[0]!.body).toBe('hi')
    expect(existsSync(join(inbox, 'a.json'))).toBe(false)
  })

  test('malformed JSON → moved to .rejected, emit not called', () => {
    const got: PromptMessage[] = []
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, 'bad.json'), '{ not json')
    consumeInboxFile(inbox, 'bad.json', m => got.push(m), noop)
    expect(got).toHaveLength(0)
    expect(existsSync(join(inbox, 'bad.json'))).toBe(false)
    expect(existsSync(join(inbox, '.rejected', 'bad.json'))).toBe(true)
  })

  test('schema-invalid (oversized body) → moved to .rejected', () => {
    const got: PromptMessage[] = []
    writeFile(inbox, 'big.json', { id: 'b', ts: 't', from: 'bot-01', kind: 'prompt', body: 'a'.repeat(9000), hop_count: 0 })
    consumeInboxFile(inbox, 'big.json', m => got.push(m), noop)
    expect(got).toHaveLength(0)
    expect(existsSync(join(inbox, '.rejected', 'big.json'))).toBe(true)
  })
})

describe('sweepInbox', () => {
  let inbox: string
  beforeEach(() => {
    inbox = mkdtempSync(join(tmpdir(), 'pw-sweep-'))
  })
  afterEach(() => {
    rmSync(inbox, { recursive: true, force: true })
  })

  test('consumes all valid files, ignores .tmp', () => {
    const got: PromptMessage[] = []
    for (let i = 0; i < 3; i++) {
      writeFile(inbox, `m${i}.json`, { id: `m${i}`, ts: 't', from: 'b', kind: 'prompt', body: `b${i}`, hop_count: 0 })
    }
    writeFileSync(join(inbox, 'x.json.tmp.1'), 'partial')
    sweepInbox(inbox, m => got.push(m), noop)
    expect(got).toHaveLength(3)
    expect(existsSync(join(inbox, 'x.json.tmp.1'))).toBe(true) // .tmp left untouched
  })

  test('overflow: beyond max → excess moved to .overflow', () => {
    const got: PromptMessage[] = []
    for (let i = 0; i < 5; i++) {
      writeFile(inbox, `m${i}.json`, { id: `m${i}`, ts: 't', from: 'b', kind: 'prompt', body: `b${i}`, hop_count: 0 })
    }
    sweepInbox(inbox, m => got.push(m), noop, { max: 2 })
    expect(got).toHaveLength(2)
    expect(readdirSync(join(inbox, '.overflow'))).toHaveLength(3)
  })
})
