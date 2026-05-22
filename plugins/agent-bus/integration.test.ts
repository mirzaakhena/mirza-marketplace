import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  registerAgent,
  readRegistry,
  resolveRegistryPath,
  updateHeartbeat,
  unregisterAgent,
} from './registry'
import { writeAgentMessage } from './inbox-writer'
import { readPeerSessionInfo } from './peer-status'

describe('integration: bot-01 ↔ bot-02 loopback', () => {
  let root: string
  let registryPath: string
  let bot01Dir: string
  let bot02Dir: string
  let bot01StateDir: string
  let bot02StateDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agent-bus-integ-'))
    registryPath = join(root, 'agent-registry.json')
    bot01Dir = join(root, 'bot-01')
    bot02Dir = join(root, 'bot-02')
    bot01StateDir = join(bot01Dir, '.claude', 'channels', 'pty-controller')
    bot02StateDir = join(bot02Dir, '.claude', 'channels', 'pty-controller')
    mkdirSync(bot01StateDir, { recursive: true })
    mkdirSync(bot02StateDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('resolveRegistryPath honors AGENT_REGISTRY_PATH for test isolation', () => {
    expect(resolveRegistryPath({ AGENT_REGISTRY_PATH: registryPath })).toBe(registryPath)
  })

  test('full happy path: both bots register, bot-01 sends /clear+rename to bot-02, file lands', () => {
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1000,
    })
    registerAgent(registryPath, 'bot-02', {
      project_dir: bot02Dir,
      state_dir: bot02StateDir,
      wrapper_pid: 2000,
    })

    const reg = readRegistry(registryPath)
    expect(Object.keys(reg.agents).sort()).toEqual(['bot-01', 'bot-02'])

    const target = reg.agents['bot-02']!
    const res = writeAgentMessage(target.state_dir, 'bot-01', {
      kind: 'slash',
      command: '/clear',
      sessionName: 'sprint-2',
    })

    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const pending = join(bot02StateDir, 'pending')
    const files = readdirSync(pending)
    expect(files).toHaveLength(1)
    const body = JSON.parse(readFileSync(join(pending, files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('slash')
    expect(body.command).toBe('/clear')
    expect(body.sessionName).toBe('sprint-2')
    expect(body.hop_count).toBe(0)
    expect(typeof body.correlation_id).toBe('string')
  })

  test('heartbeat refresh + online detection threshold', async () => {
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1,
    })
    const reg1 = readRegistry(registryPath)
    const t1 = Date.parse(reg1.agents['bot-01']!.last_heartbeat)
    await new Promise(r => setTimeout(r, 20))
    updateHeartbeat(registryPath, 'bot-01')
    const reg2 = readRegistry(registryPath)
    const t2 = Date.parse(reg2.agents['bot-01']!.last_heartbeat)
    expect(t2).toBeGreaterThan(t1)
  })

  test('unregister removes agent from registry', () => {
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1,
    })
    unregisterAgent(registryPath, 'bot-01')
    expect(readRegistry(registryPath).agents['bot-01']).toBeUndefined()
  })

  test('peer-status reads bot-02 session info opportunistically', () => {
    mkdirSync(join(bot02Dir, '.claude', 'channels', 'telegram'), { recursive: true })
    writeFileSync(
      join(bot02Dir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({
        payload: {
          session_id: 's1',
          session_name: 'demo',
          model: { display_name: 'Opus 4.7' },
          effort: { level: 'medium' },
          context_window: { used_percentage: 12 },
        },
      }),
    )
    const info = readPeerSessionInfo(bot02Dir)
    expect(info.current_session_name).toBe('demo')
    expect(info.context_used_percent).toBe(12)
    expect(info.model).toBe('Opus 4.7')
    expect(info.effort_level).toBe('medium')
  })
})
