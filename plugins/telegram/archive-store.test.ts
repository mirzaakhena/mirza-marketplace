import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadArchived, addArchived } from './archive-store'

describe('archive-store', () => {
  let stateDir: string

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'archive-store-test-'))
  })

  afterEach(() => {
    try {
      rmSync(stateDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  test('loadArchived returns empty set when file missing', () => {
    expect(loadArchived(stateDir)).toEqual(new Set())
  })

  test('loadArchived returns IDs from {"archived":[...]} canonical shape', () => {
    writeFileSync(
      join(stateDir, 'archived-sessions.json'),
      JSON.stringify({ archived: ['a', 'b'] }),
    )
    expect(loadArchived(stateDir)).toEqual(new Set(['a', 'b']))
  })

  test('loadArchived tolerates plain-array legacy shape', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), JSON.stringify(['x', 'y']))
    expect(loadArchived(stateDir)).toEqual(new Set(['x', 'y']))
  })

  test('loadArchived returns empty set on malformed JSON', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), '{not json')
    expect(loadArchived(stateDir)).toEqual(new Set())
  })

  test('loadArchived ignores non-string entries inside the array', () => {
    writeFileSync(
      join(stateDir, 'archived-sessions.json'),
      JSON.stringify({ archived: ['a', 42, null, 'b'] }),
    )
    expect(loadArchived(stateDir)).toEqual(new Set(['a', 'b']))
  })

  test('addArchived creates file with canonical shape', () => {
    addArchived(stateDir, 'sid-1')
    const raw = readFileSync(join(stateDir, 'archived-sessions.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ archived: ['sid-1'] })
  })

  test('addArchived appends without duplicating', () => {
    addArchived(stateDir, 'sid-1')
    addArchived(stateDir, 'sid-2')
    addArchived(stateDir, 'sid-1') // duplicate — should be no-op
    const raw = readFileSync(join(stateDir, 'archived-sessions.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ archived: ['sid-1', 'sid-2'] })
  })

  test('addArchived creates the state dir if missing', () => {
    const nested = join(stateDir, 'does', 'not', 'exist')
    addArchived(nested, 'sid-1')
    expect(loadArchived(nested)).toEqual(new Set(['sid-1']))
  })

  test('addArchived migrates legacy plain-array shape on next write', () => {
    writeFileSync(join(stateDir, 'archived-sessions.json'), JSON.stringify(['legacy-1']))
    addArchived(stateDir, 'new-1')
    const raw = readFileSync(join(stateDir, 'archived-sessions.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ archived: ['legacy-1', 'new-1'] })
  })
})
