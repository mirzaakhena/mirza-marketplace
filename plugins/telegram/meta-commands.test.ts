import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tryRouteMetaCommand, tryHandleMetaCallback, __resetDeletePickerForTests } from './meta-commands'
import { listProjectSessions } from './sessions-list'

// Local alias kept so existing test bodies don't need rewriting.
const tryRouteMetaCommandT = tryRouteMetaCommand

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
  buttons?: ReadonlyArray<ReadonlyArray<{ label: string; callbackData: string }>>
}
function makeHandler(): {
  handler: {
    reply: (text: string) => Promise<void>
    replyWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
  }
  replies: RecordedReply[]
} {
  const replies: RecordedReply[] = []
  return {
    replies,
    handler: {
      reply: async (text: string) => {
        replies.push({ text })
      },
      replyWithButtons: async (text, rows) => {
        replies.push({ text, buttons: rows })
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
    const consumed = await tryRouteMetaCommandT('hello world', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(false)
    expect(replies.length).toBe(0)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('returns false for text that just mentions /new', async () => {
    const { handler } = makeHandler()
    const consumed = await tryRouteMetaCommandT('please /new the session', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(false)
  })

  test('consumes /new but warns when CLAUDE_PROJECT_DIR is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/new bahas MCP', {}, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
  })

  test('consumes /new but warns when wrapper heartbeat is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('consumes /new but warns when heartbeat is stale', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date(Date.now() - 5 * 60_000).toISOString())
    const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('writes /clear command file with sessionName and no intermediate ack when wrapper is fresh', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/new bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    // No ack on the happy path — the transition message arrives later via
    // the system-outbox event the wrapper writes after the fresh session
    // materialises.
    expect(replies.length).toBe(0)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/clear')
    expect(payload.sessionName).toBe('bahas MCP')
    expect(typeof payload.id).toBe('string')
    expect(typeof payload.ts).toBe('string')
  })

  test('uppercase /NEW also matches (case-insensitive); name preserves case', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/NEW Bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(0)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.sessionName).toBe('Bahas MCP')
  })

  test('whitespace around /new <name> is tolerated', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('  /new bahas MCP  ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.sessionName).toBe('bahas MCP')
  })

  test('honors PTY_CONTROLLER_STATE_DIR override over CLAUDE_PROJECT_DIR', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT(
      '/new bahas MCP',
      { PTY_CONTROLLER_STATE_DIR: stateDir, CLAUDE_PROJECT_DIR: '/nowhere/that/exists' },
      handler,
    )
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(1)
  })

  test('consumes /new with no arg and rejects with usage message', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/new', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/nama session/i)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('consumes /new with whitespace-only arg and rejects with usage message', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/new      ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/nama session/i)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('strips newlines from /new name (PTY injection safety)', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/new bahas\nMCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    // Newlines are replaced with single spaces — never embedded in the name.
    expect(payload.sessionName).toBe('bahas MCP')
  })

  test('truncates /new name longer than 64 chars', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const longName = 'a'.repeat(100)
    const consumed = await tryRouteMetaCommandT(`/new ${longName}`, { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.sessionName.length).toBe(64)
    expect(payload.sessionName).toBe('a'.repeat(64))
  })

  test('consumes /rename with no arg and rejects with usage message', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/rename', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/nama baru/i)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('consumes /rename with whitespace-only arg and rejects with usage message', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/rename     ', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/nama baru/i)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('writes /rename <name> command to wrapper when fresh', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/rename bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/Renaming/i)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/rename bahas MCP')
  })

  test('strips newlines from /rename name (PTY injection safety)', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const consumed = await tryRouteMetaCommandT('/rename bahas\nMCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/rename bahas MCP')
  })

  test('truncates /rename name longer than 64 chars', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const longName = 'a'.repeat(100)
    const consumed = await tryRouteMetaCommandT(`/rename ${longName}`, { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe(`/rename ${'a'.repeat(64)}`)
  })

  test('/rename warns when wrapper heartbeat is stale', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date(Date.now() - 5 * 60_000).toISOString())
    const consumed = await tryRouteMetaCommandT('/rename bahas MCP', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
    expect(listPending(stateDir).length).toBe(0)
  })
})

// Shared helpers used by /delete tests across Tasks 5–8.
function writeProjectJsonl(homeDirOverride: string, projectDir: string, sessionId: string): void {
  const encoded = projectDir.replace(/[\\/:]/g, '-')
  const dir = join(homeDirOverride, '.claude', 'projects', encoded)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${sessionId}.jsonl`), '')
}

function writeCurrentSessionId(stateDir: string, sid: string): void {
  writeFileSync(join(stateDir, 'wrapper.current_session_id'), sid)
}

/**
 * Set up a /delete picker state: write `sessionIds` as jsonls under the
 * fake home dir, mark `currentSid` (if provided) as the active session,
 * set a fresh heartbeat, then invoke /delete to populate `deletePicker`.
 * Returns the shortIds of the sessions that ended up in the picker.
 */
async function setupAndPopulatePicker(
  homeOverride: string,
  projectDir: string,
  stateDir: string,
  sessionIds: string[],
  currentSid?: string,
): Promise<string[]> {
  for (const sid of sessionIds) writeProjectJsonl(homeOverride, projectDir, sid)
  if (currentSid) writeCurrentSessionId(stateDir, currentSid)
  setHeartbeat(stateDir, new Date().toISOString())
  const { handler } = makeHandler()
  await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
  return sessionIds
    .filter(sid => sid !== currentSid)
    .map(sid => sid.replace(/-/g, '').slice(0, 8).toLowerCase())
}

describe('meta-commands: /delete picker', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void
  let homeOverride: string

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    homeOverride = mkdtempSync(join(tmpdir(), 'meta-cmd-home-'))
    process.env.USERPROFILE = homeOverride
    process.env.HOME = homeOverride
  })

  afterEach(() => {
    cleanup()
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
  })

  test('/delete replies with no-other-sessions message when current is the only one', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    writeProjectJsonl(homeOverride, projectDir, sid)
    writeCurrentSessionId(stateDir, sid)

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/Tidak ada session lain/)
    expect(replies[0].buttons).toBeUndefined()
  })

  test('/delete shows picker excluding the current session', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const sidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    writeProjectJsonl(homeOverride, projectDir, sidA)
    writeProjectJsonl(homeOverride, projectDir, sidB)
    writeCurrentSessionId(stateDir, sidA)

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].buttons).toBeDefined()
    const flatLabels = replies[0].buttons!.flat().map(b => b.label)
    expect(flatLabels.some(l => l.includes('bbbbbbbb'))).toBe(true)
    expect(flatLabels.some(l => l.includes('aaaaaaaa'))).toBe(false)
  })

  test('/delete warns when CLAUDE_PROJECT_DIR is missing', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/delete', {}, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/CLAUDE_PROJECT_DIR/)
  })

  test('/delete warns when wrapper heartbeat is stale', async () => {
    const { handler, replies } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].text).toMatch(/wrapper tidak terdeteksi/)
  })

  test('/delete proceeds without current-session exclusion when state file is missing', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    const sidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    writeProjectJsonl(homeOverride, projectDir, sidA)
    // No writeCurrentSessionId — file absent.

    const consumed = await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)
    expect(replies[0].buttons).toBeDefined()
    const flatLabels = replies[0].buttons!.flat().map(b => b.label)
    expect(flatLabels.some(l => l.includes('aaaaaaaa'))).toBe(true)
  })
})

function makeCallbackHandler(): {
  handler: {
    ackCallback: (text?: string) => Promise<void>
    editMessage: (text: string) => Promise<void>
    reply: (text: string) => Promise<void>
    replyWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
  }
  acks: string[]
  edits: string[]
  replies: RecordedReply[]
} {
  const acks: string[] = []
  const edits: string[] = []
  const replies: RecordedReply[] = []
  return {
    acks, edits, replies,
    handler: {
      ackCallback: async (text?: string) => { acks.push(text ?? '') },
      editMessage: async (text: string) => { edits.push(text) },
      reply: async (text: string) => { replies.push({ text }) },
      replyWithButtons: async (text, rows) => { replies.push({ text, buttons: rows }) },
    },
  }
}

describe('meta-commands: tryHandleMetaCallback for delete', () => {
  let projectDir: string
  let stateDir: string
  let cleanup: () => void
  let homeOverride: string

  beforeEach(() => {
    const ctx = mkProject()
    projectDir = ctx.projectDir
    stateDir = ctx.stateDir
    cleanup = ctx.cleanup
    homeOverride = mkdtempSync(join(tmpdir(), 'meta-cmd-home-'))
    process.env.USERPROFILE = homeOverride
    process.env.HOME = homeOverride
    __resetDeletePickerForTests()
  })
  afterEach(() => {
    cleanup()
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
  })

  test('delete picker tap emits confirmation prompt with Confirm/Cancel buttons', async () => {
    const sid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      `meta:delete_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.acks.length).toBe(1)
    expect(cb.edits.length).toBe(1)
    expect(cb.replies.length).toBe(1)
    expect(cb.replies[0].text).toMatch(/Hapus session/i)
    expect(cb.replies[0].text).toMatch(/PERMANEN/i)
    const buttons = cb.replies[0].buttons!.flat()
    expect(buttons.some(b => b.callbackData === `meta:delete_confirm_${shortId}`)).toBe(true)
    expect(buttons.some(b => b.callbackData === 'meta:delete_cancel')).toBe(true)
  })

  test('delete picker tap for unknown shortId reports picker expired', async () => {
    __resetDeletePickerForTests()
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      'meta:delete_deadbeef',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.acks[0]).toMatch(/expired/i)
    expect(cb.replies.length).toBe(0)
  })

  test('delete confirm rmSync the project jsonl and edits message', async () => {
    const sid = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    const encoded = projectDir.replace(/[\\/:]/g, '-')
    const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
    expect(existsSync(jsonlPath)).toBe(true)

    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      `meta:delete_confirm_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(existsSync(jsonlPath)).toBe(false)
    expect(cb.edits[0]).toMatch(/dihapus/)
  })

  test('delete confirm aborts if target became the current session', async () => {
    const sid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    // Simulate the user switching to that session between picker tap and confirm tap.
    writeCurrentSessionId(stateDir, sid)

    const encoded = projectDir.replace(/[\\/:]/g, '-')
    const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
    expect(existsSync(jsonlPath)).toBe(true)

    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      `meta:delete_confirm_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    // File NOT deleted.
    expect(existsSync(jsonlPath)).toBe(true)
    expect(cb.acks[0]).toMatch(/aktif/i)
  })

  test('delete confirm tolerates already-deleted jsonl', async () => {
    const sid = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const [shortId] = await setupAndPopulatePicker(homeOverride, projectDir, stateDir, [sid])

    // Delete the jsonl out-of-band before tapping confirm.
    const encoded = projectDir.replace(/[\\/:]/g, '-')
    const jsonlPath = join(homeOverride, '.claude', 'projects', encoded, `${sid}.jsonl`)
    rmSync(jsonlPath)
    expect(existsSync(jsonlPath)).toBe(false)

    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      `meta:delete_confirm_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    // Treated as success — the desired outcome is "session gone".
    expect(cb.edits[0]).toMatch(/dihapus/)
  })

  test('delete cancel edits message to delete-cancelled', async () => {
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      'meta:delete_cancel',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.acks[0]).toMatch(/cancelled/i)
    expect(cb.edits[0]).toMatch(/delete cancelled/i)
  })
})
