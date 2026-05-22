import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolveRegistryPath,
  registerAgent,
  updateHeartbeat,
  unregisterAgent,
  readRegistry,
} from './registry'

describe('registry: resolveRegistryPath', () => {
  test('uses AGENT_REGISTRY_PATH env override when set', () => {
    expect(resolveRegistryPath({ AGENT_REGISTRY_PATH: '/tmp/r.json' })).toBe('/tmp/r.json')
  })

  test('defaults to ~/.claude/agent-registry.json', () => {
    const got = resolveRegistryPath({ HOME: '/home/x', USERPROFILE: '/home/x' })
    expect(got.replace(/\\/g, '/')).toBe('/home/x/.claude/agent-registry.json')
  })
})

describe('registry: lifecycle', () => {
  let dir: string
  let path: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-reg-'))
    path = join(dir, 'agent-registry.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('registerAgent creates file and entry', () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1234,
    })
    expect(existsSync(path)).toBe(true)
    const reg = readRegistry(path)
    expect(reg.schema_version).toBe(1)
    expect(reg.agents['bot-01']?.project_dir).toBe('/p/bot-01')
    expect(reg.agents['bot-01']?.wrapper_pid).toBe(1234)
    expect(reg.agents['bot-01']?.registered_at).toBeDefined()
    expect(reg.agents['bot-01']?.last_heartbeat).toBeDefined()
  })

  test('updateHeartbeat refreshes last_heartbeat without touching registered_at', async () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1,
    })
    const before = readRegistry(path).agents['bot-01']!
    await new Promise(r => setTimeout(r, 15))
    updateHeartbeat(path, 'bot-01')
    const after = readRegistry(path).agents['bot-01']!
    expect(after.registered_at).toBe(before.registered_at)
    expect(after.last_heartbeat).not.toBe(before.last_heartbeat)
  })

  test('updateHeartbeat is no-op when agent missing', () => {
    updateHeartbeat(path, 'ghost')
    const reg = readRegistry(path)
    expect(reg.agents['ghost']).toBeUndefined()
  })

  test('unregisterAgent removes the entry', () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1,
    })
    unregisterAgent(path, 'bot-01')
    expect(readRegistry(path).agents['bot-01']).toBeUndefined()
  })

  test('readRegistry returns empty when file missing', () => {
    const reg = readRegistry(path)
    expect(reg.schema_version).toBe(1)
    expect(reg.agents).toEqual({})
  })

  test('readRegistry recovers from corrupt JSON', () => {
    writeFileSync(path, '{not valid json')
    const reg = readRegistry(path)
    expect(reg.agents).toEqual({})
  })
})
