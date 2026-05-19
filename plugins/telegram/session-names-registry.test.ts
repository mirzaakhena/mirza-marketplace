import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadRegistry,
  saveRegistry,
  setName,
  refreshFromPidFiles,
} from './session-names-registry'

function mkTempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `${label}-`))
}

describe('session-names-registry', () => {
  let stateDir: string
  let homeOverride: string
  let projectDir: string

  beforeEach(() => {
    stateDir = mkTempDir('snr-state')
    homeOverride = mkTempDir('snr-home')
    projectDir = mkTempDir('snr-proj')
    process.env.HOME = homeOverride
    process.env.USERPROFILE = homeOverride
  })

  afterEach(() => {
    try { rmSync(stateDir, { recursive: true, force: true }) } catch {}
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
    try { rmSync(projectDir, { recursive: true, force: true }) } catch {}
  })

  test('loadRegistry returns empty map when file missing', () => {
    const map = loadRegistry(stateDir)
    expect(map.size).toBe(0)
  })

  test('saveRegistry then loadRegistry round-trips', () => {
    const reg = new Map([
      ['sid-a', { name: 'utama', updatedAt: 100 }],
      ['sid-b', { name: 'bahas MCP', updatedAt: 200 }],
    ])
    saveRegistry(stateDir, reg)
    const loaded = loadRegistry(stateDir)
    expect(loaded.size).toBe(2)
    expect(loaded.get('sid-a')).toEqual({ name: 'utama', updatedAt: 100 })
    expect(loaded.get('sid-b')).toEqual({ name: 'bahas MCP', updatedAt: 200 })
  })

  test('setName upserts entry with current timestamp', () => {
    const before = Date.now()
    setName(stateDir, 'sid-a', 'utama')
    const after = Date.now()
    const loaded = loadRegistry(stateDir)
    const entry = loaded.get('sid-a')!
    expect(entry.name).toBe('utama')
    expect(entry.updatedAt).toBeGreaterThanOrEqual(before)
    expect(entry.updatedAt).toBeLessThanOrEqual(after)
  })

  test('setName overwrites existing entry', () => {
    setName(stateDir, 'sid-a', 'first')
    const firstTs = loadRegistry(stateDir).get('sid-a')!.updatedAt
    // Wait briefly to ensure timestamp changes.
    const target = firstTs + 1
    while (Date.now() <= target) { /* spin briefly */ }
    setName(stateDir, 'sid-a', 'second')
    const entry = loadRegistry(stateDir).get('sid-a')!
    expect(entry.name).toBe('second')
    expect(entry.updatedAt).toBeGreaterThan(firstTs)
  })

  test('loadRegistry ignores malformed entries', () => {
    const path = join(stateDir, 'session-names.json')
    writeFileSync(
      path,
      JSON.stringify({
        'sid-good': { name: 'ok', updatedAt: 100 },
        'sid-no-ts': { name: 'missing ts' },
        'sid-no-name': { updatedAt: 200 },
        'sid-not-obj': 'just a string',
      }),
    )
    const loaded = loadRegistry(stateDir)
    expect(loaded.size).toBe(1)
    expect(loaded.has('sid-good')).toBe(true)
  })

  test('refreshFromPidFiles imports name from matching pid file when newer', () => {
    // Set up a pid file in fake ~/.claude/sessions/.
    const sessionsDir = join(homeOverride, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    const sid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const pidPath = join(sessionsDir, '12345.json')
    writeFileSync(
      pidPath,
      JSON.stringify({ pid: 12345, sessionId: sid, cwd: projectDir, name: 'utama' }),
    )

    const registry = new Map<string, { name: string; updatedAt: number }>()
    refreshFromPidFiles(registry, projectDir)
    expect(registry.size).toBe(1)
    expect(registry.get(sid)!.name).toBe('utama')
  })

  test('refreshFromPidFiles skips files with mismatched cwd', () => {
    const sessionsDir = join(homeOverride, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    const sid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    writeFileSync(
      join(sessionsDir, '12345.json'),
      JSON.stringify({ pid: 12345, sessionId: sid, cwd: '/other/project', name: 'utama' }),
    )

    const registry = new Map<string, { name: string; updatedAt: number }>()
    refreshFromPidFiles(registry, projectDir)
    expect(registry.size).toBe(0)
  })

  test('refreshFromPidFiles skips entries without a name', () => {
    const sessionsDir = join(homeOverride, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    const sid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    writeFileSync(
      join(sessionsDir, '12345.json'),
      JSON.stringify({ pid: 12345, sessionId: sid, cwd: projectDir, name: '' }),
    )

    const registry = new Map<string, { name: string; updatedAt: number }>()
    refreshFromPidFiles(registry, projectDir)
    expect(registry.size).toBe(0)
  })

  test('refreshFromPidFiles does NOT overwrite registry entry when pid file is older', () => {
    const sid = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    // Registry has a very-recent entry.
    const registry = new Map<string, { name: string; updatedAt: number }>([
      [sid, { name: 'registry-name', updatedAt: Date.now() + 60_000 }],
    ])

    // Pid file has an older name.
    const sessionsDir = join(homeOverride, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, '12345.json'),
      JSON.stringify({ pid: 12345, sessionId: sid, cwd: projectDir, name: 'pid-name' }),
    )

    refreshFromPidFiles(registry, projectDir)
    // Registry entry preserved.
    expect(registry.get(sid)!.name).toBe('registry-name')
  })

  test('refreshFromPidFiles overwrites registry entry when pid file is newer', () => {
    const sid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    // Registry has a stale entry.
    const registry = new Map<string, { name: string; updatedAt: number }>([
      [sid, { name: 'stale-name', updatedAt: 100 }],
    ])

    // Pid file is newer.
    const sessionsDir = join(homeOverride, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, '12345.json'),
      JSON.stringify({ pid: 12345, sessionId: sid, cwd: projectDir, name: 'fresh-name' }),
    )

    refreshFromPidFiles(registry, projectDir)
    expect(registry.get(sid)!.name).toBe('fresh-name')
  })
})
