import { test, expect, describe } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildNextState, writeSessionState, type SessionState } from './session-state'

describe('buildNextState', () => {
  test('first state: derives lifecycle from name, seq starts at 1', () => {
    const s = buildNextState(null, { session_id: 'sid-1', session_name: 'idle' }, 1000)
    expect(s).toEqual({
      session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 1000,
    })
  })
  test('patch merges over prev and bumps seq', () => {
    const prev: SessionState = { session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 1000 }
    const s = buildNextState(prev, { session_name: 'task-foo' }, 2000)
    expect(s.session_id).toBe('sid-1')
    expect(s.session_name).toBe('task-foo')
    expect(s.lifecycle).toBe('busy')
    expect(s.seq).toBe(2)
  })
  test('explicit lifecycle override wins over derivation', () => {
    const s = buildNextState(null, { session_name: 'done-x-1', lifecycle: 'resetting' }, 3000)
    expect(s.lifecycle).toBe('resetting')
  })
  test('null session_name → unknown', () => {
    const s = buildNextState(null, { session_id: 'sid', session_name: null }, 1)
    expect(s.lifecycle).toBe('unknown')
  })
})

describe('writeSessionState', () => {
  test('writes atomic JSON readable back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'state-'))
    try {
      const file = join(dir, 'wrapper.state.json')
      const state: SessionState = { session_id: 'sid', session_name: 'idle', lifecycle: 'idle', seq: 1, updated_at_ms: 5 }
      writeSessionState(file, state)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(state)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
