import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureChannelsGitignore } from './channels-gitignore'

describe('channels-gitignore: ensureChannelsGitignore', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'channels-gi-test-'))
  })

  afterEach(() => {
    try { chmodSync(tmpDir, 0o755) } catch {}
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('creates dir and writes .gitignore when nothing exists', () => {
    const channels = join(tmpDir, 'channels')
    const result = ensureChannelsGitignore(channels)
    expect(result.changed).toBe(true)
    expect(existsSync(join(channels, '.gitignore'))).toBe(true)
    const content = readFileSync(join(channels, '.gitignore'), 'utf8')
    expect(content).toMatch(/^\*$/m)
    expect(content).toMatch(/^!\.gitignore$/m)
  })

  test('is idempotent when correct pattern already exists', () => {
    const channels = join(tmpDir, 'channels')
    ensureChannelsGitignore(channels)
    const before = readFileSync(join(channels, '.gitignore'), 'utf8')
    const result = ensureChannelsGitignore(channels)
    expect(result.changed).toBe(false)
    const after = readFileSync(join(channels, '.gitignore'), 'utf8')
    expect(after).toBe(before)
  })

  test('overwrites when existing content has wrong pattern', () => {
    const channels = join(tmpDir, 'channels')
    mkdirSync(channels, { recursive: true })
    writeFileSync(join(channels, '.gitignore'), 'wrong content\n')
    const result = ensureChannelsGitignore(channels)
    expect(result.changed).toBe(true)
    const content = readFileSync(join(channels, '.gitignore'), 'utf8')
    expect(content).toMatch(/^\*$/m)
    expect(content).toMatch(/^!\.gitignore$/m)
  })

  test('returns changed:false with reason on write-protected dir', () => {
    const channels = join(tmpDir, 'channels')
    mkdirSync(channels, { recursive: true })
    chmodSync(channels, 0o555)
    const result = ensureChannelsGitignore(channels)
    expect(result.changed).toBe(false)
    expect(result.reason).toBeDefined()
  })

  test('returns ok:true on success and ok:false on error', () => {
    const channels = join(tmpDir, 'channels')

    // Created
    const r1 = ensureChannelsGitignore(channels)
    expect(r1.ok).toBe(true)
    expect(r1.changed).toBe(true)

    // Idempotent
    const r2 = ensureChannelsGitignore(channels)
    expect(r2.ok).toBe(true)
    expect(r2.changed).toBe(false)

    // Failure (write-protected dir, no prior .gitignore so a write is attempted)
    const channels2 = join(tmpDir, 'channels2')
    mkdirSync(channels2, { recursive: true })
    chmodSync(channels2, 0o555)
    const r3 = ensureChannelsGitignore(channels2)
    expect(r3.ok).toBe(false)
    expect(r3.changed).toBe(false)
    expect(r3.reason).toBeDefined()
  })
})
