import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setName as registrySetName } from '../session-names-registry.ts'
import { resolveSessionNameForContext } from './session-name-context.ts'

test('resolves the registered name for the current session id', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'hook-test-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-xyz'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'idle')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('idle')
  rmSync(projectDir, { recursive: true, force: true })
})

test('returns null when no pty/telegram state exists', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'hook-test-'))
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBeNull()
  rmSync(projectDir, { recursive: true, force: true })
})

test('prefers the authoritative wrapper name over a stale registry name', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'authname-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-1'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'idle')
  // Registry says something STALE/different for that sid.
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'test-goal')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('idle') // authoritative wins, not 'test-goal'
  rmSync(projectDir, { recursive: true, force: true })
})

test('falls back to the registry name when the authoritative file is absent', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'authname-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-2'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  // No wrapper.current_session_name file.
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'from-registry')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('from-registry')
  rmSync(projectDir, { recursive: true, force: true })
})
