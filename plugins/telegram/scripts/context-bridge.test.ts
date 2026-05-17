import { test, expect, describe } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SCRIPT = join(import.meta.dir, 'context-bridge.ts')

function runBridge(env: Record<string, string>, stdin: string) {
  return spawnSync('bun', ['run', SCRIPT], {
    env: { ...process.env, ...env },
    input: stdin,
    encoding: 'utf-8',
  })
}

describe('context-bridge.ts', () => {
  test('writes last-status.json with captured payload', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const payload = { context_window: { used_percentage: 42 } }
      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, JSON.stringify(payload))
      expect(r.status).toBe(0)
      const out = JSON.parse(
        readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8')
      )
      expect(out.payload).toEqual(payload)
      expect(typeof out.captured_at_ms).toBe('number')
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })

  test('exits 0 silently when CLAUDE_PROJECT_DIR is unset', () => {
    const r = runBridge({ CLAUDE_PROJECT_DIR: '' }, '{}')
    expect(r.status).toBe(0)
  })

  test('survives invalid JSON stdin (writes null payload)', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, 'not json{{{')
      expect(r.status).toBe(0)
      const out = JSON.parse(
        readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8')
      )
      expect(out.payload).toBeNull()
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })

  test('chains to previous statusline command via shell', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const stateDir = join(proj, '.claude/channels/telegram')
      const sentinelOut = join(proj, 'sentinel.out')
      // Cross-platform: a shell command that echoes the bridge's stdin to a file.
      const chainCmd = process.platform === 'win32'
        ? `more > "${sentinelOut}"`
        : `cat > "${sentinelOut}"`
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, 'chained-statusline'), chainCmd)

      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, '{"a":1}')
      expect(r.status).toBe(0)
      expect(existsSync(sentinelOut)).toBe(true)
      const sentContent = readFileSync(sentinelOut, 'utf8').trim()
      expect(sentContent).toBe('{"a":1}')
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })
})
