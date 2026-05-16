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
})
