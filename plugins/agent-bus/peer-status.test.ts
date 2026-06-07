import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readPeerSessionInfo } from './peer-status'

describe('peer-status: readPeerSessionInfo', () => {
  let projectDir: string
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'peer-'))
    mkdirSync(join(projectDir, '.claude', 'channels', 'telegram'), { recursive: true })
    mkdirSync(join(projectDir, '.claude', 'channels', 'pty-controller'), { recursive: true })
  })
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('returns null fields when no status files exist', () => {
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe(null)
    expect(info.current_session_name).toBe(null)
    expect(info.context_used_percent).toBe(null)
    expect(info.model).toBe(null)
    expect(info.effort_level).toBe(null)
  })

  test('reads session_id from wrapper.current_session_id when no telegram status', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'abc-123',
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('abc-123')
    expect(info.current_session_name).toBe(null)
  })

  test('reads full info from telegram last-status.json', () => {
    const payload = {
      captured_at_ms: 1779458539286,
      payload: {
        session_id: 'sess-1',
        session_name: 'demo',
        model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' },
        effort: { level: 'high' },
        context_window: {
          used_percentage: 42,
          remaining_percentage: 58,
          context_window_size: 1000000,
        },
      },
    }
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify(payload),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('sess-1')
    expect(info.current_session_name).toBe('demo')
    expect(info.context_used_percent).toBe(42)
    expect(info.context_window_size).toBe(1000000)
    expect(info.model).toBe('Opus 4.7')
    expect(info.effort_level).toBe('high')
  })

  test('context_window_size is null when last-status.json omits it', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'sess-1', context_window: { used_percentage: 42 } } }),
    )
    expect(readPeerSessionInfo(projectDir).context_window_size).toBe(null)
  })

  test('telegram status used when its session_id matches the wrapper file', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'sess-1',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({
        payload: { session_id: 'sess-1', session_name: 'demo', context_window: { used_percentage: 42 } },
      }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('sess-1')
    expect(info.current_session_name).toBe('demo')
    expect(info.context_used_percent).toBe(42)
  })

  test('stale telegram status (session_id mismatch) falls back to wrapper files', () => {
    // last-status.json still describes the PREVIOUS session — the wrapper
    // has since moved on to a fresh one that never fired the statusline.
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'fresh-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_name'),
      'idle',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({
        payload: { session_id: 'old-sid', session_name: 'old work', context_window: { used_percentage: 88 } },
      }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('fresh-sid')
    expect(info.current_session_name).toBe('idle')
    // Stale per-session facts must NOT leak through: null = fresh session.
    expect(info.context_used_percent).toBe(null)
    expect(info.context_window_size).toBe(null)
    expect(info.model).toBe(null)
  })

  test('wrapper session name backfills a matching telegram status without one', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'sess-1',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_name'),
      'renamed-later',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'sess-1' } }),
    )
    expect(readPeerSessionInfo(projectDir).current_session_name).toBe('renamed-later')
  })

  test('empty wrapper.current_session_name reads as null (unnamed session)', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'fresh-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_name'),
      '',
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('fresh-sid')
    expect(info.current_session_name).toBe(null)
  })

  test('malformed telegram status falls back to wrapper file', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'wrapper-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      '{ not json',
    )
    expect(readPeerSessionInfo(projectDir).current_session_id).toBe('wrapper-sid')
  })
})

function writeState(projectDir: string, state: object) {
  writeFileSync(
    join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.state.json'),
    JSON.stringify(state),
  )
}

describe('peer-status: wrapper.state.json precedence', () => {
  let projectDir: string
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'peer-state-'))
    mkdirSync(join(projectDir, '.claude', 'channels', 'telegram'), { recursive: true })
    mkdirSync(join(projectDir, '.claude', 'channels', 'pty-controller'), { recursive: true })
  })
  afterEach(() => rmSync(projectDir, { recursive: true, force: true }))

  test('THE BUG: same session_id, stale last-status name, state says idle → returns idle + null ctx', () => {
    writeState(projectDir, { session_id: 'e23f460f', session_name: 'idle', lifecycle: 'idle', seq: 5, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'e23f460f', session_name: 'done-todolist-pingpong-202606071256', context_window: { used_percentage: 88 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_name).toBe('idle')
    expect(info.lifecycle).toBe('idle')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle busy + id match → telemetry trusted', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'task-x', lifecycle: 'busy', seq: 2, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 42, context_window_size: 1000000 }, model: { display_name: 'Opus 4.8' } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('busy')
    expect(info.context_used_percent).toBe(42)
    expect(info.context_window_size).toBe(1000000)
    expect(info.model).toBe('Opus 4.8')
  })

  test('lifecycle resetting → telemetry nulled even if id matches', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'done-x-1', lifecycle: 'resetting', seq: 3, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 70 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('resetting')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle unknown + id MISMATCH → telemetry nulled', () => {
    writeState(projectDir, { session_id: 'fresh', session_name: 'foo', lifecycle: 'unknown', seq: 1, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'old', context_window: { used_percentage: 99 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('fresh')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle transitioning + id match → telemetry nulled', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'done-x-1', lifecycle: 'transitioning', seq: 4, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 55 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('transitioning')
    expect(info.context_used_percent).toBe(null)
  })

  test('lifecycle unknown + id match → telemetry trusted', () => {
    writeState(projectDir, { session_id: 's1', session_name: 'manual name', lifecycle: 'unknown', seq: 2, updated_at_ms: 1 })
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 's1', context_window: { used_percentage: 33 } } }),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.lifecycle).toBe('unknown')
    expect(info.context_used_percent).toBe(33)
  })

  test('no state.json → legacy behavior (lifecycle null)', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'abc-123',
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('abc-123')
    expect(info.lifecycle).toBe(null)
  })
})
