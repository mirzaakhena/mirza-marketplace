import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readCurrentSessionId,
  resolveCurrentSessionName,
} from './current-session-info'

describe('readCurrentSessionId', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'csi-proj-'))
  })

  afterEach(() => {
    try { rmSync(projectDir, { recursive: true, force: true }) } catch {}
  })

  test('returns the session id when wrapper.current_session_id exists', () => {
    const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
    mkdirSync(ptyDir, { recursive: true })
    writeFileSync(join(ptyDir, 'wrapper.current_session_id'), 'abc-123-def\n')
    const sid = readCurrentSessionId({ CLAUDE_PROJECT_DIR: projectDir })
    expect(sid).toBe('abc-123-def')
  })

  test('returns null when the file is missing', () => {
    expect(readCurrentSessionId({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })

  test('returns null when CLAUDE_PROJECT_DIR is unset', () => {
    expect(readCurrentSessionId({})).toBeNull()
  })

  test('honors PTY_CONTROLLER_STATE_DIR override', () => {
    const explicit = mkdtempSync(join(tmpdir(), 'csi-pty-'))
    try {
      writeFileSync(join(explicit, 'wrapper.current_session_id'), 'sid-override')
      const sid = readCurrentSessionId({ PTY_CONTROLLER_STATE_DIR: explicit })
      expect(sid).toBe('sid-override')
    } finally {
      rmSync(explicit, { recursive: true, force: true })
    }
  })
})

describe('resolveCurrentSessionName', () => {
  let stateDir: string

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'csi-state-'))
  })

  afterEach(() => {
    try { rmSync(stateDir, { recursive: true, force: true }) } catch {}
  })

  test('returns null when sessionId is null', () => {
    expect(resolveCurrentSessionName(null, stateDir)).toBeNull()
  })

  test('returns null when session has no registered name', () => {
    expect(resolveCurrentSessionName('unknown-sid', stateDir)).toBeNull()
  })

  test('returns the name when registered', () => {
    writeFileSync(
      join(stateDir, 'session-names.json'),
      JSON.stringify({ 'sid-x': { name: 'main', updatedAt: 100 } }),
    )
    expect(resolveCurrentSessionName('sid-x', stateDir)).toBe('main')
  })
})
