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
        context_window: { used_percentage: 42, remaining_percentage: 58 },
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
    expect(info.model).toBe('Opus 4.7')
    expect(info.effort_level).toBe('high')
  })

  test('telegram status preferred over wrapper.current_session_id', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'wrapper-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'telegram-sid' } }),
    )
    expect(readPeerSessionInfo(projectDir).current_session_id).toBe('telegram-sid')
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
