/**
 * Meta-command interceptor — recognizes a small set of Telegram-side slash
 * commands (`/new`, `/switch`) and routes them directly to the
 * pty-controller wrapper instead of relaying them to Claude as regular
 * inbound messages.
 *
 * The companion plugin `pty-controller` and the `mirza-cc` wrapper handle
 * the actual side-effects (injecting /clear, killing and re-spawning CC
 * with `claude --resume <id>`, etc.). This module is just the decision
 * point: "is this text a meta-command, and is the wrapper around to take
 * it?"
 *
 * Layout we assume (per-project, same shape pty-controller uses):
 *   <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/
 *     ├─ pending/<uuid>.json   (we write here — wrapper inbox)
 *     └─ wrapper.heartbeat     (we read here for liveness)
 *
 * Override with PTY_CONTROLLER_STATE_DIR if the user runs an unusual setup.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { listProjectSessions, encodeProjectDir } from './sessions-list.ts'

const HEARTBEAT_FRESH_MS = 30_000
const MAX_SWITCH_BUTTONS = 7 // Telegram allows 8 rows, we reserve 1 for cancel
const SHORT_ID_RE = /^[0-9a-f]{8}$/

export interface MetaCommandButton {
  label: string
  callbackData: string
}

export interface MetaCommandHandlers {
  /**
   * Send a plain-text Telegram reply. The telegram plugin already does this
   * through its own bot.api — we accept a callback so this module doesn't
   * have to know about grammy.
   */
  reply: (text: string) => Promise<void>
  /**
   * Send a Telegram reply with an inline keyboard. Each row is an array of
   * buttons; each button has the label and the literal callback_data the
   * client should fire when the user taps. The caller is responsible for
   * obeying Telegram's 8x8 limit and 64-byte callback_data cap.
   */
  replyWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
}

export interface MetaCallbackHandlers {
  /** Show a transient toast above the chat (returns 200 OK to Telegram). */
  ackCallback: (text?: string) => Promise<void>
  /** Edit the message that contained the buttons (strips keyboard implicitly). */
  editMessage: (text: string) => Promise<void>
}

/**
 * In-memory map shortId -> {sessionId, label}. Populated when /switch
 * renders the picker; consumed when the user taps a button. Survives only
 * within the plugin process lifetime — that's fine because Telegram doesn't
 * persist taps across server restarts anyway, and the worst case is the
 * tap fails with "switch state lost", which we surface clearly.
 */
interface SwitchPickerEntry {
  sessionId: string
  label: string
}
const switchPicker = new Map<string, SwitchPickerEntry>()

const MAX_DELETE_BUTTONS = 7 // same as /switch — reserve 1 row for cancel

interface DeletePickerEntry {
  sessionId: string
  label: string
}
const deletePicker = new Map<string, DeletePickerEntry>()

/** Resolve the per-project state dir pty-controller agrees on. */
function resolvePtyStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.PTY_CONTROLLER_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) return null
  return join(projectDir, '.claude', 'channels', 'pty-controller')
}

/**
 * Read the wrapper's current PTY session id (UUID, no newline) from
 * `<state>/wrapper.current_session_id`. Returns null if the file is absent
 * or unreadable — callers must tolerate that, the wrapper might just not
 * have written it yet.
 */
function readCurrentSessionId(stateDir: string): string | null {
  const file = join(stateDir, 'wrapper.current_session_id')
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

function wrapperHeartbeatFresh(stateDir: string): boolean {
  const beat = join(stateDir, 'wrapper.heartbeat')
  if (!existsSync(beat)) return false
  try {
    const wroteAt = Date.parse(readFileSync(beat, 'utf8').trim())
    if (Number.isNaN(wroteAt)) return false
    return Date.now() - wroteAt < HEARTBEAT_FRESH_MS
  } catch {
    return false
  }
}

/**
 * Wrapper inbox payload. The wrapper accepts a tagged union — slash command
 * injection (default, used by /new) or process-level operations like
 * switching to a different CC session.
 */
type WrapperPayload =
  | { type?: 'slash'; command: string; sessionName?: string }
  | { type: 'switch'; sessionId: string }

function writeWrapperCommand(stateDir: string, payload: WrapperPayload): void {
  const pending = join(stateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const fullPayload = {
    id,
    ts: new Date().toISOString(),
    ...payload,
  }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(fullPayload, null, 2))
  renameSync(tmpPath, finalPath)
}

/**
 * Try to handle `text` as a Telegram meta-command. Returns:
 *   - `true`  → consumed (we did something; caller must NOT forward to AI)
 *   - `false` → not a meta-command (caller should continue normal flow)
 *
 * Recognized today (exact match, trimmed, lowercase compared):
 *   /new    — ask the wrapper to /clear the current CC session
 *   /switch — show a button picker of sessions in this project; tap
 *             rebuilds the wrapper with `claude --resume <id>`
 *
 * If the wrapper isn't reachable, we still consume the command and reply
 * with an explanatory error rather than silently routing it to the AI
 * (which would just see "/new" as text and not know what to do).
 */
export async function tryRouteMetaCommand(
  text: string,
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // Match `/new` (exact) or `/new` followed by whitespace + arg.
  if (lower === '/new' || lower.startsWith('/new ') || lower.startsWith('/new\t')) {
    const rest = trimmed.slice('/new'.length).trim()
    return handleNew(env, handlers, rest)
  }
  if (lower === '/switch') {
    return handleSwitch(env, handlers)
  }
  if (lower === '/delete') {
    return handleDelete(env, handlers)
  }
  return false
}

async function handleNew(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
  rawName: string,
): Promise<boolean> {
  // Strip newlines/CRs that would corrupt the PTY-injected `/rename <name>\r`.
  const sanitised = rawName.replace(/[\r\n]+/g, ' ').trim()
  if (sanitised.length === 0) {
    await handlers.reply(
      '⚠️ /new butuh nama session. Contoh: /new bahas MCP',
    )
    return true
  }
  const sessionName = sanitised.slice(0, 64)

  const stateDir = resolvePtyStateDir(env)
  if (!stateDir) {
    await handlers.reply(
      '⚠️ /new tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset. ' +
        'Pastikan Claude Code dijalankan dari folder project, atau set PTY_CONTROLLER_STATE_DIR.',
    )
    return true
  }
  if (!wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /new tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi (heartbeat stale). ' +
        'Pastikan CC dijalankan via `mirza-cc` wrapper, bukan `claude` langsung.',
    )
    return true
  }
  try {
    writeWrapperCommand(stateDir, { command: '/clear', sessionName })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /new gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  await handlers.reply(`🔄 Clearing session — fresh session "${sessionName}" sebentar lagi siap.`)
  return true
}

async function handleSwitch(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply(
      '⚠️ /switch tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /switch tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }

  const sessions = listProjectSessions(projectDir)
  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session di project ini.')
    return true
  }

  // Repopulate the picker map. Older entries are dropped — only the latest
  // /switch call's sessions are tappable, which avoids stale taps after the
  // user issues a new /switch.
  switchPicker.clear()
  for (const s of sessions.slice(0, MAX_SWITCH_BUTTONS)) {
    switchPicker.set(s.shortId, { sessionId: s.sessionId, label: s.label })
  }

  const rows: MetaCommandButton[][] = []
  for (const s of sessions.slice(0, MAX_SWITCH_BUTTONS)) {
    // Trim label to ~60 chars so it fits Telegram's button width on mobile.
    const label = s.label.length > 60 ? s.label.slice(0, 59) + '…' : s.label
    rows.push([{ label, callbackData: `meta:switch_${s.shortId}` }])
  }
  rows.push([{ label: '❌ Cancel', callbackData: 'meta:cancel' }])

  const moreNote =
    sessions.length > MAX_SWITCH_BUTTONS
      ? ` (showing ${MAX_SWITCH_BUTTONS} terbaru dari ${sessions.length})`
      : ''
  await handlers.replyWithButtons(
    `🔀 Pilih session untuk diswitch${moreNote}:`,
    rows,
  )
  return true
}

async function handleDelete(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply(
      '⚠️ /delete tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /delete tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const all = listProjectSessions(projectDir)
  const sessions = currentSid
    ? all.filter(s => s.sessionId !== currentSid)
    : all

  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain yang bisa dihapus.')
    return true
  }

  deletePicker.clear()
  for (const s of sessions.slice(0, MAX_DELETE_BUTTONS)) {
    deletePicker.set(s.shortId, { sessionId: s.sessionId, label: s.label })
  }

  const rows: MetaCommandButton[][] = []
  for (const s of sessions.slice(0, MAX_DELETE_BUTTONS)) {
    const label = s.label.length > 60 ? s.label.slice(0, 59) + '…' : s.label
    rows.push([{ label, callbackData: `meta:delete_${s.shortId}` }])
  }
  rows.push([{ label: '❌ Cancel', callbackData: 'meta:delete_cancel' }])

  const moreNote =
    sessions.length > MAX_DELETE_BUTTONS
      ? ` (showing ${MAX_DELETE_BUTTONS} terbaru dari ${sessions.length})`
      : ''
  await handlers.replyWithButtons(
    `🗑️ Pilih session untuk dihapus${moreNote}:`,
    rows,
  )
  return true
}

/**
 * Try to handle a `callback_query.data` string as a meta-route. Returns:
 *   - `true`  → consumed (the bot's own callback handler must NOT forward to AI)
 *   - `false` → not a meta callback
 *
 * Recognized today:
 *   meta:cancel               — close the picker, edit msg to "(cancelled)"
 *   meta:switch_<shortId>     — write a {type:"switch"} payload to wrapper
 *
 * `editMessage` is best-effort: if Telegram refuses (message too old, etc.)
 * we swallow and still consider the callback consumed.
 */
export async function tryHandleMetaCallback(
  callbackData: string,
  env: Record<string, string | undefined>,
  handlers: MetaCallbackHandlers,
): Promise<boolean> {
  if (!callbackData.startsWith('meta:')) return false
  const rest = callbackData.slice('meta:'.length)

  if (rest === 'cancel') {
    await handlers.ackCallback('Cancelled')
    await handlers.editMessage('(switch cancelled)').catch(() => {})
    return true
  }

  if (rest.startsWith('switch_')) {
    const shortId = rest.slice('switch_'.length)
    if (!SHORT_ID_RE.test(shortId)) {
      await handlers.ackCallback('Bad short id')
      return true
    }
    const entry = switchPicker.get(shortId)
    if (!entry) {
      await handlers.ackCallback('Session sudah expired, /switch lagi')
      await handlers.editMessage('(picker expired — please run /switch again)').catch(() => {})
      return true
    }

    const stateDir = resolvePtyStateDir(env)
    if (!stateDir) {
      await handlers.ackCallback('CLAUDE_PROJECT_DIR not set')
      return true
    }
    if (!wrapperHeartbeatFresh(stateDir)) {
      await handlers.ackCallback('Wrapper tidak detected')
      await handlers.editMessage('⚠️ Wrapper not running — switch aborted').catch(() => {})
      return true
    }

    try {
      writeWrapperCommand(stateDir, { type: 'switch', sessionId: entry.sessionId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await handlers.ackCallback(`Write failed: ${msg}`)
      return true
    }

    await handlers.ackCallback(`Switching to ${entry.label}`)
    await handlers
      .editMessage(`🔀 Switching to: ${entry.label}\nWrapper akan respawn CC dengan --resume.`)
      .catch(() => {})
    // Pop the entry so the same button can't be re-tapped to repeat a
    // possibly-expensive respawn.
    switchPicker.delete(shortId)
    return true
  }

  // Unknown meta:... — consume so it doesn't fall through to AI, but signal
  // gracefully.
  await handlers.ackCallback('Unknown meta action')
  return true
}

/**
 * Test helper — clear in-memory state between tests so cross-test leakage
 * doesn't happen. Not exported for production code paths.
 */
export function __resetSwitchPickerForTests(): void {
  switchPicker.clear()
}

// Export for test resets — parallel to __resetSwitchPickerForTests
export function __resetDeletePickerForTests(): void {
  deletePicker.clear()
}
