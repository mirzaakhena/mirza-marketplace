import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tryRouteMetaCommand } from './meta-commands'

function mkProject(): { projectDir: string; stateDir: string; cleanup: () => void } {
  const projectDir = mkdtempSync(join(tmpdir(), 'meta-cmd-test-'))
  const stateDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(stateDir, { recursive: true })
  return {
    projectDir,
    stateDir,
    cleanup: () => {
      try {
        rmSync(projectDir, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    },
  }
}

function setHeartbeat(stateDir: string, isoTs: string): void {
  writeFileSync(join(stateDir, 'wrapper.heartbeat'), isoTs)
}

function listPending(stateDir: string): string[] {
  const dir = join(stateDir, 'pending')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(f => f.endsWith('.json'))
}

interface RecordedReply {
  text: string
}
function makeHandler(): { handler: { reply: (text: string) => Promise<void> }; replies: RecordedReply[] } {
  const replies: RecordedReply[] = []
  return {
    replies,
    handler: {
      reply: async (text: string) => {
        replies.push({ text })
      },
    },
  }
}

describe('meta-commands: tryRouteMetaCommand', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
  })

  afterEach(() => cleanup())

  test('returns false for non-meta-command text', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommand('hello world', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(false)
    expect(replies.length).toBe(0)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('returns false for text that just mentions /new', async () => {
    const { handler } = makeHandler()
    const consumed = await tryRouteMetaCommand('please /new the session', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(false)
  })

  test('returns false for /new with arguments — must be exact', async () => {
    // /new must be a standalone command. Anything else is regular text and
    // goes to the AI as normal — let the AI interpret it.
    const { handler } = makeHandler()
    const consumed = await tryRouteMetaCommand('/new please', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(false)
  })

  test('consumes /new but warns when CLAUDE_PROJECT_DIR is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommand('/new', {}, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
  })

  test('consumes /new but warns when wrapper heartbeat is missing', async () => {
    const { handler, replies } = makeHandler()
    // No heartbeat file written.
    const consumed = await tryRouteMetaCommand('/new', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('consumes /new but warns when heartbeat is stale', async () => {
    const { handler, replies } = makeHandler()
    // Heartbeat from 5 minutes ago = stale (fresh window is 30s).
    setHeartbeat(stateDir, new Date(Date.now() - 5 * 60_000).toISOString())
    const consumed = await tryRouteMetaCommand('/new', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('writes /clear command file and confirms when wrapper is fresh', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommand('/new', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/Clearing session/)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/clear')
    expect(typeof payload.id).toBe('string')
    expect(typeof payload.ts).toBe('string')
  })

  test('uppercase /NEW also matches (case-insensitive)', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommand('/NEW', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(listPending(stateDir).length).toBe(1)
  })

  test('whitespace around /new is tolerated', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommand('  /new  ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(1)
  })

  test('honors PTY_CONTROLLER_STATE_DIR override over CLAUDE_PROJECT_DIR', async () => {
    const { handler } = makeHandler()
    // Set heartbeat in our explicit state dir, leave CLAUDE_PROJECT_DIR's
    // implicit dir empty. The override should win.
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommand(
      '/new',
      { PTY_CONTROLLER_STATE_DIR: stateDir, CLAUDE_PROJECT_DIR: '/nowhere/that/exists' },
      handler,
    )
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(1)
  })
})
