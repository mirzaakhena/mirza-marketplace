import { test, expect, describe } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SERVER_PATH = join(import.meta.dir, 'server.ts')

function runServer(env: Record<string, string | undefined>, timeoutMs = 2000) {
  // Build env explicitly — pass undefined to unset.
  const baseEnv = { ...process.env }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete baseEnv[k]
    else baseEnv[k] = v
  }
  const result = spawnSync('bun', ['run', SERVER_PATH], {
    env: baseEnv,
    timeout: timeoutMs,
    encoding: 'utf-8',
  })
  return {
    code: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  }
}

describe('server boot resolution', () => {
  test('exits 1 with diagnostic when neither env set', () => {
    const r = runServer({ CLAUDE_PROJECT_DIR: undefined, TELEGRAM_STATE_DIR: undefined })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain('cannot determine state directory')
    expect(r.stderr).toContain('CLAUDE_PROJECT_DIR')
    expect(r.stderr).toContain('TELEGRAM_STATE_DIR')
  })

  test('exits 1 with diagnostic when state dir set but .env missing', () => {
    const td = mkdtempSync(join(tmpdir(), 'boot-test-noenv-'))
    try {
      const r = runServer({ CLAUDE_PROJECT_DIR: td, TELEGRAM_STATE_DIR: undefined })
      expect(r.code).toBe(1)
      expect(r.stderr).toContain('TELEGRAM_BOT_TOKEN required')
      expect(r.stderr).toContain(join(td, '.claude', 'channels', 'telegram'))
    } finally {
      rmSync(td, { recursive: true, force: true })
    }
  })

  test('logs state dir at boot when env + .env present', () => {
    const td = mkdtempSync(join(tmpdir(), 'boot-test-ok-'))
    try {
      const stateDir = join(td, '.claude', 'channels', 'telegram')
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, '.env'), 'TELEGRAM_BOT_TOKEN=fake_token_for_boot_test\n')
      const r = runServer({ CLAUDE_PROJECT_DIR: td, TELEGRAM_STATE_DIR: undefined }, 3000)
      // Server runs grammy polling with fake token (will error) but we only
      // care that the boot-time state dir log appeared before that.
      expect(r.stderr).toContain(`state dir = ${stateDir}`)
    } finally {
      rmSync(td, { recursive: true, force: true })
    }
  })

  test('TELEGRAM_STATE_DIR override wins over CLAUDE_PROJECT_DIR', () => {
    const td = mkdtempSync(join(tmpdir(), 'boot-test-override-'))
    try {
      mkdirSync(td, { recursive: true })
      writeFileSync(join(td, '.env'), 'TELEGRAM_BOT_TOKEN=fake\n')
      const r = runServer(
        { CLAUDE_PROJECT_DIR: '/nonexistent/project', TELEGRAM_STATE_DIR: td },
        3000,
      )
      expect(r.stderr).toContain(`state dir = ${td}`)
    } finally {
      rmSync(td, { recursive: true, force: true })
    }
  })
})
