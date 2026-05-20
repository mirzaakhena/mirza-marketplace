import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tryRouteMetaCommand, tryHandleMetaCallback, __resetDeletePickerForTests, __resetSwitchPickerForTests, __resetArchivePickerForTests } from './meta-commands'
import { loadArchived } from './archive-store'
import { listProjectSessions } from './sessions-list'
import { setName as registrySetName } from './session-names-registry'

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

  test('/new rejects when name already taken in registry', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    // Seed the telegram registry — same resolution rule as production:
    // <CLAUDE_PROJECT_DIR>/.claude/channels/telegram
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    registrySetName(telegramStateDir, 'existing-session-id', 'bahas MCP')

    const consumed = await tryRouteMetaCommandT(
      '/new bahas MCP',
      { CLAUDE_PROJECT_DIR: projectDir },
      handler,
    )
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/sudah dipakai/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('/rename rejects when name already taken by ANOTHER session', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    // Current session is some sid; another session in the registry owns "omar".
    writeFileSync(join(stateDir, 'wrapper.current_session_id'), 'current-session-id')
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    registrySetName(telegramStateDir, 'other-session-id', 'omar')

    const consumed = await tryRouteMetaCommandT(
      '/rename omar',
      { CLAUDE_PROJECT_DIR: projectDir },
      handler,
    )
    expect(consumed).toBe(true)
    expect(replies.length).toBe(1)
    expect(replies[0].text).toMatch(/sudah dipakai/)
    expect(listPending(stateDir).length).toBe(0)
  })

  test('/rename to own existing name is idempotent (one payload written)', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    writeFileSync(join(stateDir, 'wrapper.current_session_id'), 'current-session-id')
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    // Current session already named "omar" in the registry.
    registrySetName(telegramStateDir, 'current-session-id', 'omar')

    const consumed = await tryRouteMetaCommandT(
      '/rename omar',
      { CLAUDE_PROJECT_DIR: projectDir },
      handler,
    )
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/rename omar')
  })

  test('/rename succeeds when name is free (one payload, /rename <name>)', async () => {
    const { handler } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    writeFileSync(join(stateDir, 'wrapper.current_session_id'), 'current-session-id')
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    // Registry exists but does NOT contain the requested name.
    registrySetName(telegramStateDir, 'other-session-id', 'some other name')

    const consumed = await tryRouteMetaCommandT(
      '/rename omar',
      { CLAUDE_PROJECT_DIR: projectDir },
      handler,
    )
    expect(consumed).toBe(true)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/rename omar')
  })

  test('/new succeeds when name is free', async () => {
    const { handler, replies } = makeHandler()
    setHeartbeat(stateDir, new Date().toISOString())
    // Registry exists but does NOT contain the requested name.
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    registrySetName(telegramStateDir, 'other-session', 'some other name')

    const consumed = await tryRouteMetaCommandT(
      '/new bahas MCP',
      { CLAUDE_PROJECT_DIR: projectDir },
      handler,
    )
    expect(consumed).toBe(true)
    expect(replies.length).toBe(0)
    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.command).toBe('/clear')
    expect(payload.sessionName).toBe('bahas MCP')
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
    editMessageWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
    reply: (text: string) => Promise<void>
    replyWithButtons: (
      text: string,
      rows: { label: string; callbackData: string }[][],
    ) => Promise<void>
  }
  acks: string[]
  edits: string[]
  editsWithButtons: RecordedReply[]
  replies: RecordedReply[]
} {
  const acks: string[] = []
  const edits: string[] = []
  const editsWithButtons: RecordedReply[] = []
  const replies: RecordedReply[] = []
  return {
    acks, edits, editsWithButtons, replies,
    handler: {
      ackCallback: async (text?: string) => { acks.push(text ?? '') },
      editMessage: async (text: string) => { edits.push(text) },
      editMessageWithButtons: async (text, rows) => {
        editsWithButtons.push({ text, buttons: rows })
      },
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

describe('meta-commands: tryHandleMetaCallback for switch', () => {
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
    __resetSwitchPickerForTests()
  })
  afterEach(() => {
    cleanup()
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
  })

  test('switch callback writes payload with sessionName = picker label', async () => {
    // Seed two sessions; mark sidA as current so sidB shows up in /switch.
    const sidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const sidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    writeProjectJsonl(homeOverride, projectDir, sidA)
    writeProjectJsonl(homeOverride, projectDir, sidB)
    writeCurrentSessionId(stateDir, sidA)

    // Give sidB a deterministic label via the telegram registry — same path
    // resolution as production (<CLAUDE_PROJECT_DIR>/.claude/channels/telegram).
    const telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    registrySetName(telegramStateDir, sidB, 'utama')

    setHeartbeat(stateDir, new Date().toISOString())

    // Populate switchPicker by invoking /switch — matches the production code
    // path. (Same pattern setupAndPopulatePicker uses for /delete.)
    const { handler } = makeHandler()
    const consumed = await tryRouteMetaCommandT('/switch', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(consumed).toBe(true)

    const shortId = sidB.replace(/-/g, '').slice(0, 8).toLowerCase()

    // Now tap the picker row for sidB.
    const cb = makeCallbackHandler()
    const tapConsumed = await tryHandleMetaCallback(
      `meta:switch_${shortId}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(tapConsumed).toBe(true)

    const pending = listPending(stateDir)
    expect(pending.length).toBe(1)
    const payload = JSON.parse(readFileSync(join(stateDir, 'pending', pending[0]), 'utf8'))
    expect(payload.type).toBe('switch')
    expect(payload.sessionId).toBe(sidB)
    expect(payload.sessionName).toBe('utama')
  })
})

/**
 * Pagination tests for the /switch and /delete pickers. Both pickers share
 * the same paginated-picker helper; these tests exercise the new
 * meta:<cmd>_page_<N> callbacks and verify all sessions remain tappable on
 * later pages.
 */
describe('meta-commands: /switch pagination', () => {
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
    setHeartbeat(stateDir, new Date().toISOString())
    __resetSwitchPickerForTests()
  })

  afterEach(() => {
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
    cleanup()
  })

  function seedNSessions(n: number): string[] {
    const sids: string[] = []
    for (let i = 0; i < n; i++) {
      const sid = `${'a'.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      sids.push(sid)
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    return sids
  }

  test('9 sessions → page 1 shows 6 sessions + nav row + cancel', async () => {
    seedNSessions(9)
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommandT('/switch', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const buttons = replies[0]!.buttons!
    expect(buttons.length).toBe(8) // 6 sessions + nav + cancel
    const navRow = buttons[6]!
    expect(navRow.map(b => b.callbackData)).toEqual([
      'meta:switch_page_noop',
      'meta:switch_page_2',
    ])
    expect(buttons[7]).toEqual([{ label: '❌ Cancel', callbackData: 'meta:cancel' }])
  })

  test('meta:switch_page_2 re-renders page 2 via editMessageWithButtons', async () => {
    seedNSessions(9)
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/switch', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      'meta:switch_page_2',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(cb.editsWithButtons.length).toBe(1)
    const rows = cb.editsWithButtons[0]!.buttons!
    // 3 sessions on page 2 + nav row + cancel = 5 rows
    expect(rows.length).toBe(5)
    expect(rows[3]!.map(b => b.callbackData)).toEqual([
      'meta:switch_page_1',
      'meta:switch_page_noop',
    ])
  })

  test('meta:switch_page_noop just acks, no edit', async () => {
    seedNSessions(9)
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/switch', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      'meta:switch_page_noop',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(cb.acks.length).toBe(1)
    expect(cb.editsWithButtons.length).toBe(0)
    expect(cb.edits.length).toBe(0)
  })

  test('tap on page-2 session still resolves (picker holds all sessions)', async () => {
    const sids = seedNSessions(9)
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/switch', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    // 9th session — would land on page 2 (index 6 onwards).
    const lastSid = sids[sids.length - 1]!
    const lastShort = lastSid.replace(/-/g, '').slice(0, 8).toLowerCase()
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback(
      `meta:switch_${lastShort}`,
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(consumed).toBe(true)
    expect(listPending(stateDir).length).toBe(1)
  })

  test('expired picker returns helpful message on page callback', async () => {
    __resetSwitchPickerForTests() // simulate stale state
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      'meta:switch_page_2',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(cb.acks[0]).toContain('expired')
  })
})

describe('meta-commands: /delete pagination', () => {
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
    setHeartbeat(stateDir, new Date().toISOString())
    __resetDeletePickerForTests()
  })

  afterEach(() => {
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
    cleanup()
  })

  test('9 sessions → page 1 shows nav row with Next', async () => {
    const sids: string[] = []
    for (let i = 0; i < 9; i++) {
      const sid = `${'b'.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      sids.push(sid)
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const buttons = replies[0]!.buttons!
    expect(buttons.length).toBe(8)
    expect(buttons[6]!.map(b => b.callbackData)).toEqual([
      'meta:delete_page_noop',
      'meta:delete_page_2',
    ])
    expect(buttons[7]).toEqual([{ label: '❌ Cancel', callbackData: 'meta:delete_cancel' }])
  })

  test('meta:delete_page_2 re-renders via editMessageWithButtons', async () => {
    for (let i = 0; i < 9; i++) {
      const sid = `${'c'.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      'meta:delete_page_2',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(cb.editsWithButtons.length).toBe(1)
    const rows = cb.editsWithButtons[0]!.buttons!
    expect(rows.length).toBe(5)
    expect(rows[3]!.map(b => b.callbackData)).toEqual([
      'meta:delete_page_1',
      'meta:delete_page_noop',
    ])
  })

  test('meta:delete_page_noop just acks', async () => {
    for (let i = 0; i < 9; i++) {
      const sid = `${'d'.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    const { handler } = makeHandler()
    await tryRouteMetaCommandT('/delete', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(
      'meta:delete_page_noop',
      { CLAUDE_PROJECT_DIR: projectDir },
      cb.handler,
    )
    expect(cb.acks.length).toBe(1)
    expect(cb.editsWithButtons.length).toBe(0)
  })
})

describe('meta-commands: /archive', () => {
  let projectDir: string
  let stateDir: string
  let telegramStateDir: string
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
    telegramStateDir = join(projectDir, '.claude', 'channels', 'telegram')
    mkdirSync(telegramStateDir, { recursive: true })
    setHeartbeat(stateDir, new Date().toISOString())
    __resetArchivePickerForTests()
    __resetSwitchPickerForTests()
  })

  afterEach(() => {
    try { rmSync(homeOverride, { recursive: true, force: true }) } catch {}
    cleanup()
  })

  function seedNSessions(n: number, marker = 'e'): string[] {
    // marker MUST be a single hex char so the resulting shortId passes the
    // SHORT_ID_RE check (/^[0-9a-f]{8}$/) in the meta callback handler.
    const sids: string[] = []
    for (let i = 0; i < n; i++) {
      const sid = `${marker.repeat(7)}${i.toString(16)}-1111-2222-3333-444444444444`
      sids.push(sid)
      writeProjectJsonl(homeOverride, projectDir, sid)
    }
    return sids
  }

  test('/archive replies with picker excluding current session', async () => {
    const sids = seedNSessions(3, 'e')
    writeCurrentSessionId(stateDir, sids[0]!)
    const { handler, replies } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const consumed = await tryRouteMetaCommand('/archive', env, handler)
    expect(consumed).toBe(true)
    expect(replies).toHaveLength(1)
    const labels = replies[0]!.buttons!.flat().map(b => b.label)
    expect(labels.some(l => l === '❌ Cancel')).toBe(true)
    // current session must not be in the picker
    const currentShort = sids[0]!.replace(/-/g, '').slice(0, 8).toLowerCase()
    const callbacks = replies[0]!.buttons!.flatMap(r => r.map(b => b.callbackData))
    expect(callbacks).not.toContain(`meta:archive_${currentShort}`)
  })

  test('replies with empty-state message when there are no archivable sessions', async () => {
    const sids = seedNSessions(1, 'f')
    writeCurrentSessionId(stateDir, sids[0]!)
    const { handler, replies } = makeHandler()
    await tryRouteMetaCommand('/archive', { CLAUDE_PROJECT_DIR: projectDir }, handler)
    expect(replies).toHaveLength(1)
    expect(replies[0]!.text).toContain('Tidak ada session lain')
  })

  test('tap session → confirmation prompt with archive-specific copy', async () => {
    const sids = seedNSessions(2, 'a')
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    await tryRouteMetaCommand('/archive', env, handler)
    const targetShort = sids[1]!.replace(/-/g, '').slice(0, 8).toLowerCase()
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    expect(cb.replies.length).toBe(1)
    expect(cb.replies[0]!.text).toContain('Archive')
    expect(cb.replies[0]!.text).toContain('untuk unarchive, edit file manual')
    expect(cb.replies[0]!.buttons![0]!.map(b => b.callbackData)).toEqual([
      `meta:archive_confirm_${targetShort}`,
      'meta:archive_cancel',
    ])
  })

  test('confirm writes session ID to archived-sessions.json', async () => {
    const sids = seedNSessions(2, 'b')
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    await tryRouteMetaCommand('/archive', env, handler)
    const target = sids[1]!
    const targetShort = target.replace(/-/g, '').slice(0, 8).toLowerCase()
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cb.handler)

    expect(loadArchived(telegramStateDir)).toEqual(new Set([target]))
  })

  test('after archive, next /switch picker filters out that session', async () => {
    const sids = seedNSessions(3, 'c')
    writeCurrentSessionId(stateDir, sids[0]!)
    const env = { CLAUDE_PROJECT_DIR: projectDir }

    // Archive sids[2] via the /archive flow.
    const { handler: h1 } = makeHandler()
    await tryRouteMetaCommand('/archive', env, h1)
    const targetShort = sids[2]!.replace(/-/g, '').slice(0, 8).toLowerCase()
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback(`meta:archive_${targetShort}`, env, cb.handler)
    await tryHandleMetaCallback(`meta:archive_confirm_${targetShort}`, env, cb.handler)

    // Now /switch — sids[2] must not appear in the keyboard.
    __resetSwitchPickerForTests()
    const { handler: h2, replies } = makeHandler()
    await tryRouteMetaCommand('/switch', env, h2)
    const callbacks = replies[0]!.buttons!.flatMap(r => r.map(b => b.callbackData))
    expect(callbacks).not.toContain(`meta:switch_${targetShort}`)
  })

  test('archive_cancel branch closes picker cleanly', async () => {
    seedNSessions(2, 'd')
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    const cb = makeCallbackHandler()
    const consumed = await tryHandleMetaCallback('meta:archive_cancel', env, cb.handler)
    expect(consumed).toBe(true)
    expect(cb.edits[0]).toBe('(archive cancelled)')
  })

  test('archive page navigation re-renders via editMessageWithButtons', async () => {
    seedNSessions(9, 'e')
    const { handler } = makeHandler()
    const env = { CLAUDE_PROJECT_DIR: projectDir }
    await tryRouteMetaCommand('/archive', env, handler)
    const cb = makeCallbackHandler()
    await tryHandleMetaCallback('meta:archive_page_2', env, cb.handler)
    expect(cb.editsWithButtons.length).toBe(1)
    const rows = cb.editsWithButtons[0]!.buttons!
    expect(rows[3]!.map(b => b.callbackData)).toEqual([
      'meta:archive_page_1',
      'meta:archive_page_noop',
    ])
  })
})
