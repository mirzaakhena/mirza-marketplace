import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import {
  deriveShortId,
  encodeProjectDir,
  formatRelative,
  listProjectSessions,
} from './sessions-list'
import { setName } from './session-names-registry'
import { addArchived } from './archive-store'

/**
 * The helper reads from ~/.claude/projects/ and ~/.claude/sessions/ on the
 * host. We can't easily intercept those paths in this codebase without
 * threading a fs abstraction through, so the tests below focus on the
 * deterministic pure pieces (encodeProjectDir, deriveShortId, sort/label
 * logic via a real but throwaway HOME-relative dir).
 */

function realProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

describe('sessions-list: encodeProjectDir', () => {
  test('replaces slash, backslash, colon with dash', () => {
    expect(encodeProjectDir('/Users/mirza/workspace/bot-01')).toBe(
      '-Users-mirza-workspace-bot-01',
    )
    expect(encodeProjectDir('C:\\Users\\Mirza\\workspace\\bot-01')).toBe(
      'C--Users-Mirza-workspace-bot-01',
    )
  })

  test('leaves already-dashed paths alone', () => {
    expect(encodeProjectDir('my-folder')).toBe('my-folder')
  })
})

describe('sessions-list: deriveShortId', () => {
  test('takes the first 8 hex chars, lowercase, no dashes', () => {
    expect(deriveShortId('1de4b23d-30a0-40cf-8392-053f78815a95')).toBe('1de4b23d')
  })

  test('handles uppercase UUID', () => {
    expect(deriveShortId('1DE4B23D-30A0-40CF-8392-053F78815A95')).toBe('1de4b23d')
  })
})

describe('sessions-list: listProjectSessions (integration with tmp project)', () => {
  let projectDir: string
  let projectsDir: string
  let createdFiles: string[] = []

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'sess-list-test-'))
    // The helper computes the encoded dir from projectDir and looks under
    // ~/.claude/projects/. To exercise it end-to-end we write the .jsonl
    // files at that exact location and clean up afterwards.
    const encoded = encodeProjectDir(projectDir)
    projectsDir = join(realProjectsRoot(), encoded)
    mkdirSync(projectsDir, { recursive: true })
    createdFiles = []
  })

  afterEach(() => {
    for (const f of createdFiles) {
      try { rmSync(f) } catch { /* ignore */ }
    }
    try { rmSync(projectsDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  function writeSession(sessionId: string): void {
    const p = join(projectsDir, `${sessionId}.jsonl`)
    writeFileSync(p, '{"type":"last-prompt","sessionId":"' + sessionId + '"}\n')
    createdFiles.push(p)
  }

  test('returns empty list for an empty project', () => {
    expect(listProjectSessions(projectDir)).toEqual([])
  })

  test('lists sessions and falls back to "session <prefix>" labels', () => {
    writeSession('1de4b23d-30a0-40cf-8392-053f78815a95')
    writeSession('77e1fb0e-d4fa-4903-b924-8485b6f17d7e')
    const result = listProjectSessions(projectDir)
    expect(result.length).toBe(2)
    // Every entry must have a label; without a /rename source it falls back.
    for (const r of result) {
      expect(r.hasName).toBe(false)
      expect(r.label.startsWith('session ')).toBe(true)
    }
    // shortId is 8 hex chars
    expect(result[0].shortId).toMatch(/^[0-9a-f]{8}$/)
  })

  test('ignores stray non-UUID jsonl files', () => {
    const stray = join(projectsDir, 'not-a-uuid.jsonl')
    writeFileSync(stray, '')
    createdFiles.push(stray)
    writeSession('1de4b23d-30a0-40cf-8392-053f78815a95')
    const result = listProjectSessions(projectDir)
    expect(result.length).toBe(1)
    expect(result[0].sessionId).toBe('1de4b23d-30a0-40cf-8392-053f78815a95')
  })

  test('returns missing project dir as empty list', () => {
    expect(listProjectSessions('/does/not/exist')).toEqual([])
  })

  test('naked UUID fallback label includes a relative timestamp', () => {
    // No registry / no pid file for this session — must fall back to
    // "session <8hex> · <relative>". We just verify the prefix and the
    // " · " separator; the exact relative string depends on mtime/now.
    writeSession('1de4b23d-30a0-40cf-8392-053f78815a95')
    const result = listProjectSessions(projectDir)
    expect(result.length).toBe(1)
    expect(result[0].hasName).toBe(false)
    expect(result[0].label).toMatch(/^session 1de4b23d · /)
  })

  test('duplicate registry names get disambiguator suffix', () => {
    const sidA = 'aaaaaaaa-1111-2222-3333-444444444444'
    const sidB = 'bbbbbbbb-1111-2222-3333-444444444444'
    writeSession(sidA)
    writeSession(sidB)
    const stateDir = mkdtempSync(join(tmpdir(), 'sess-list-state-'))
    try {
      setName(stateDir, sidA, 'omar')
      setName(stateDir, sidB, 'omar')
      const result = listProjectSessions(projectDir, stateDir)
      const labels = result.map((r) => r.label).sort()
      expect(labels).toEqual(['omar (aaaaaaaa)', 'omar (bbbbbbbb)'])
    } finally {
      try { rmSync(stateDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  test('unique names keep their bare label', () => {
    const sid = 'cccccccc-1111-2222-3333-444444444444'
    writeSession(sid)
    const stateDir = mkdtempSync(join(tmpdir(), 'sess-list-state-'))
    try {
      setName(stateDir, sid, 'main')
      const result = listProjectSessions(projectDir, stateDir)
      expect(result.length).toBe(1)
      expect(result[0].label).toBe('main')
    } finally {
      try { rmSync(stateDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  test('archived session IDs are filtered out when stateDir provided', () => {
    const sidKeep = 'dddddddd-1111-2222-3333-444444444444'
    const sidDrop = 'eeeeeeee-1111-2222-3333-444444444444'
    writeSession(sidKeep)
    writeSession(sidDrop)
    const stateDir = mkdtempSync(join(tmpdir(), 'sess-list-state-'))
    try {
      addArchived(stateDir, sidDrop)
      const result = listProjectSessions(projectDir, stateDir)
      expect(result.map(r => r.sessionId)).toEqual([sidKeep])
    } finally {
      try { rmSync(stateDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  test('archived filter is not applied when stateDir is omitted', () => {
    const sidA = 'ffffffff-1111-2222-3333-444444444444'
    const sidB = '11111111-1111-2222-3333-444444444444'
    writeSession(sidA)
    writeSession(sidB)
    // Even if a stateDir-bound archive list would drop sidA, omitting stateDir
    // here means the call has no way to read the archive file and returns
    // the raw on-disk view.
    const result = listProjectSessions(projectDir)
    expect(new Set(result.map(r => r.sessionId))).toEqual(new Set([sidA, sidB]))
  })
})

describe('formatRelative', () => {
  const NOW = 1_700_000_000_000

  test('returns "just now" for under 1 minute', () => {
    expect(formatRelative(NOW - 30_000, NOW)).toBe('just now')
  })

  test('minutes for under 1 hour', () => {
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('5m')
    expect(formatRelative(NOW - 59 * 60_000, NOW)).toBe('59m')
  })

  test('hours for under 1 day', () => {
    expect(formatRelative(NOW - 2 * 3_600_000, NOW)).toBe('2h')
    expect(formatRelative(NOW - 23 * 3_600_000, NOW)).toBe('23h')
  })

  test('days for under 14 days', () => {
    expect(formatRelative(NOW - 3 * 86_400_000, NOW)).toBe('3d')
    expect(formatRelative(NOW - 13 * 86_400_000, NOW)).toBe('13d')
  })

  test('weeks for under 12 weeks', () => {
    expect(formatRelative(NOW - 14 * 86_400_000, NOW)).toBe('2w')
    expect(formatRelative(NOW - 83 * 86_400_000, NOW)).toBe('11w')
  })

  test('absolute dd/mm for older than 12 weeks', () => {
    const ts = Date.UTC(2025, 0, 15, 0, 0, 0)
    const now = Date.UTC(2025, 5, 1, 0, 0, 0)
    expect(formatRelative(ts, now)).toBe('15/01')
  })
})
