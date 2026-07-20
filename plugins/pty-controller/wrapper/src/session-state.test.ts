import { test, expect, describe } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildNextState,
  writeSessionState,
  nameFromLastStatus,
  parseStatuslineSnapshot,
  shouldAdoptStatuslineName,
  resolveResumeName,
  type SessionState,
} from './session-state'

describe('nameFromLastStatus', () => {
  const raw = (payload: unknown) => JSON.stringify({ captured_at_ms: 1, payload })

  test('returns the name when the snapshot describes the given session', () => {
    expect(nameFromLastStatus(raw({ session_id: 'sid-1', session_name: 'idle' }), 'sid-1')).toBe('idle')
  })
  test('returns null on session_id mismatch (snapshot describes another session)', () => {
    expect(nameFromLastStatus(raw({ session_id: 'old-sid', session_name: 'idle' }), 'sid-1')).toBe(null)
  })
  test('returns null when payload or name is missing/empty', () => {
    expect(nameFromLastStatus(raw(null), 'sid-1')).toBe(null)
    expect(nameFromLastStatus(raw({ session_id: 'sid-1' }), 'sid-1')).toBe(null)
    expect(nameFromLastStatus(raw({ session_id: 'sid-1', session_name: '' }), 'sid-1')).toBe(null)
  })
  test('returns null on malformed JSON', () => {
    expect(nameFromLastStatus('{ not json', 'sid-1')).toBe(null)
  })
})

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

describe('parseStatuslineSnapshot', () => {
  const raw = (capturedAt: number, payload: unknown) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload })

  test('parses a valid snapshot', () => {
    expect(parseStatuslineSnapshot(raw(1000, { session_id: 'sid-1', session_name: 'idle' })))
      .toEqual({ captured_at_ms: 1000, session_id: 'sid-1', session_name: 'idle' })
  })
  test('null on malformed JSON', () => {
    expect(parseStatuslineSnapshot('{ not json')).toBe(null)
  })
  test('null when captured_at_ms / payload / fields missing or empty', () => {
    expect(parseStatuslineSnapshot(JSON.stringify({ payload: { session_id: 's', session_name: 'x' } }))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, null))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, { session_id: 's' }))).toBe(null)
    expect(parseStatuslineSnapshot(raw(1, { session_id: 's', session_name: '' }))).toBe(null)
  })
})

describe('shouldAdoptStatuslineName', () => {
  const state = (over: Partial<SessionState> = {}): SessionState => ({
    session_id: 'sid-1', session_name: 'idle', lifecycle: 'idle', seq: 3, updated_at_ms: 5000, ...over,
  })
  const raw = (capturedAt: number, sid: string, name: string) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload: { session_id: sid, session_name: name } })
  const NO_TRANSITION = { inClearTransition: false }

  test('adopts: snapshot fresher + sid match + different name', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe('task-foo')
  })
  test('rejects poisoned/old snapshot (captured_at <= state.updated_at)', () => {
    expect(shouldAdoptStatuslineName(state(), raw(5000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(state(), raw(4000, 'sid-1', 'task-foo'), NO_TRANSITION)).toBe(null)
  })
  test('rejects sid mismatch (snapshot describes another session)', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'old-sid', 'task-foo'), NO_TRANSITION)).toBe(null)
  })
  test('rejects during /clear transition', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'task-foo'), { inClearTransition: true })).toBe(null)
  })
  test('no-op when names equal', () => {
    expect(shouldAdoptStatuslineName(state(), raw(6000, 'sid-1', 'idle'), NO_TRANSITION)).toBe(null)
  })
  test('rejects corrupt raw and null/id-less state, without throwing', () => {
    expect(shouldAdoptStatuslineName(state(), '{ not json', NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(null, raw(6000, 'sid-1', 'x'), NO_TRANSITION)).toBe(null)
    expect(shouldAdoptStatuslineName(state({ session_id: null }), raw(6000, 'sid-1', 'x'), NO_TRANSITION)).toBe(null)
  })
})

describe('resolveResumeName', () => {
  const raw = (capturedAt: number, sid: string, name: string) =>
    JSON.stringify({ captured_at_ms: capturedAt, payload: { session_id: sid, session_name: name } })

  test('picks last-status when fresher', () => {
    expect(resolveResumeName(raw(2000, 'sid-1', 'task-x'), { name: 'idle', updatedAt: 1000 }, 'sid-1'))
      .toEqual({ name: 'task-x', source: 'last-status' })
  })
  test('picks registry when fresher', () => {
    expect(resolveResumeName(raw(1000, 'sid-1', 'rlfv-dashboard-design'), { name: 'idle', updatedAt: 2000 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('tie → registry wins', () => {
    expect(resolveResumeName(raw(1500, 'sid-1', 'task-x'), { name: 'idle', updatedAt: 1500 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('sid-mismatch snapshot is ignored → registry', () => {
    expect(resolveResumeName(raw(9000, 'old-sid', 'task-x'), { name: 'idle', updatedAt: 1000 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
  })
  test('only one source present → that source; none → null/none', () => {
    expect(resolveResumeName(raw(1000, 'sid-1', 'task-x'), null, 'sid-1'))
      .toEqual({ name: 'task-x', source: 'last-status' })
    expect(resolveResumeName(null, { name: 'idle', updatedAt: 1 }, 'sid-1'))
      .toEqual({ name: 'idle', source: 'registry' })
    expect(resolveResumeName(null, null, 'sid-1')).toEqual({ name: null, source: 'none' })
    expect(resolveResumeName('{ not json', null, 'sid-1')).toEqual({ name: null, source: 'none' })
  })
})
