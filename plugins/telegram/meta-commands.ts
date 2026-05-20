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
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { listProjectSessions, encodeProjectDir } from './sessions-list.ts'
import {
  loadRegistry,
  setName as registrySetName,
  findSessionIdByName,
} from './session-names-registry.ts'
import { resolveStateDir as resolveTelegramStateDir } from './state-path.ts'
import { renderPickerPage } from './paginated-picker.ts'
import { addArchived } from './archive-store.ts'

const HEARTBEAT_FRESH_MS = 30_000
const SHORT_ID_RE = /^[0-9a-f]{8}$/

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const
export type EffortLevel = typeof EFFORT_LEVELS[number]

export type EffortInput =
  | { kind: 'picker' }
  | { kind: 'direct'; level: EffortLevel }
  | { kind: 'invalid'; token: string }

/**
 * Parse a raw "/effort ..." Telegram input. Whitespace is collapsed,
 * embedded CR/LF stripped, the level is lowercased. Returns:
 *   - { kind:'picker' }      → no argument, render the picker
 *   - { kind:'direct', level } → valid effort level, apply directly
 *   - { kind:'invalid', token } → anything else; caller replies with usage
 *
 * Assumes the input already matched the "/effort" prefix in the router.
 */
export function parseEffortInput(text: string): EffortInput {
  const stripped = text.replace(/[\r\n]+/g, ' ')
  const lower = stripped.toLowerCase().trim()
  if (lower === '/effort') return { kind: 'picker' }
  if (!lower.startsWith('/effort ') && !lower.startsWith('/effort\t')) {
    // Defensive — the caller should only hand us "/effort..." strings.
    return { kind: 'invalid', token: lower }
  }
  const rest = stripped.slice('/effort'.length).trim().toLowerCase()
  if (rest.length === 0) return { kind: 'picker' }
  if ((EFFORT_LEVELS as readonly string[]).includes(rest)) {
    return { kind: 'direct', level: rest as EffortLevel }
  }
  return { kind: 'invalid', token: rest }
}

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
  /** Edit the message in place, replacing its keyboard with a new one. */
  editMessageWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
  /** Send a plain-text Telegram reply (used for follow-up prompts). */
  reply: (text: string) => Promise<void>
  /** Send a Telegram reply with an inline keyboard (used for confirm prompts). */
  replyWithButtons: (text: string, rows: MetaCommandButton[][]) => Promise<void>
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
  shortId: string
}
/**
 * The picker map now keeps every session that /switch found (not just the
 * first visible page), so a tap on page 2 still resolves without needing
 * the picker to be re-rendered. Page changes flow through
 * meta:switch_page_<N> which re-renders the keyboard from this same set.
 */
const switchPicker = new Map<string, SwitchPickerEntry>()
let switchPickerSessions: SwitchPickerEntry[] = []

interface DeletePickerEntry {
  sessionId: string
  label: string
  shortId: string
}
const deletePicker = new Map<string, DeletePickerEntry>()
let deletePickerSessions: DeletePickerEntry[] = []

interface ArchivePickerEntry {
  sessionId: string
  label: string
  shortId: string
}
const archivePicker = new Map<string, ArchivePickerEntry>()
let archivePickerSessions: ArchivePickerEntry[] = []

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

/**
 * Read `<telegramStateDir>/last-status.json` and return the current effort
 * level if the payload carries a known value, otherwise null. Tolerant of
 * missing file, malformed JSON, and unknown level strings.
 */
export function extractCurrentEffortLevel(
  env: Record<string, string | undefined>,
): EffortLevel | null {
  const telegramStateDir = resolveTelegramStateDir(env)
  if (!telegramStateDir) return null
  const file = join(telegramStateDir, 'last-status.json')
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  let parsed: { payload?: { effort?: { level?: unknown } } }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const level = parsed?.payload?.effort?.level
  if (typeof level !== 'string') return null
  if ((EFFORT_LEVELS as readonly string[]).includes(level)) {
    return level as EffortLevel
  }
  return null
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
  | { type: 'switch'; sessionId: string; sessionName?: string }

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
 * Slash command name is matched lowercase + whitespace-trimmed; any argument
 * after the command is forwarded preserving case.
 *
 * Recognized today:
 *   /new <name>    — clear the current CC session and rename the fresh one to <name>
 *   /switch        — show a picker of project sessions; tap injects /resume into PTY
 *   /delete        — show a picker of non-current sessions; tap → confirm → rmSync jsonl
 *   /rename <name> — apply CC's /rename <name> to the live session
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
  // /delete bifurcates by trailing arg:
  //   /delete         → soft (hides the session via the archive store; reversible by manual edit)
  //   /delete hard    → permanent (rmSync the jsonl; not reversible)
  // The handler functions are still named handleArchive/handleDelete and the
  // callback prefixes are still meta:archive_/meta:delete_ for historical
  // reasons — this is purely internal and slated for a future rename pass.
  if (lower === '/delete' || lower === '/delete ' || lower.startsWith('/delete  ')) {
    return handleArchive(env, handlers)
  }
  if (lower === '/delete hard' || lower.startsWith('/delete hard ')) {
    return handleDelete(env, handlers)
  }
  // Match `/rename` (exact) or `/rename` followed by whitespace + arg.
  if (lower === '/rename' || lower.startsWith('/rename ') || lower.startsWith('/rename\t')) {
    const rest = trimmed.slice('/rename'.length).trim()
    return handleRename(env, handlers, rest)
  }
  // Match `/effort` (exact) or `/effort` followed by whitespace + arg.
  if (lower === '/effort' || lower.startsWith('/effort ') || lower.startsWith('/effort\t')) {
    const parsed = parseEffortInput(trimmed)
    if (parsed.kind === 'picker') {
      return handleEffortPicker(env, handlers)
    }
    if (parsed.kind === 'invalid') {
      await handlers.reply(
        `⚠️ /effort butuh salah satu: ${EFFORT_LEVELS.join(', ')}`,
      )
      return true
    }
    return handleEffortDirect(env, handlers, parsed.level)
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
  const telegramStateDir = resolveTelegramStateDir(env)
  if (telegramStateDir) {
    const registry = loadRegistry(telegramStateDir)
    const taken = findSessionIdByName(registry, sessionName)
    if (taken) {
      await handlers.reply(
        `⚠️ Nama "${sessionName}" sudah dipakai session lain di project ini. Pilih nama lain atau /switch ke session itu.`,
      )
      return true
    }
  }
  try {
    writeWrapperCommand(stateDir, { command: '/clear', sessionName })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /new gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  // No "Clearing session..." ack here — the wrapper writes a system-outbox
  // event when the fresh session materialises, and the plugin sends the
  // "switch to session: <name>" transition message from there. One message
  // total, arrives when the session is actually ready.
  return true
}

async function handleRename(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
  rawName: string,
): Promise<boolean> {
  // Same sanitisation as /new — CR/LF in the name would corrupt the PTY-injected
  // `/rename <name>\r` keystroke. Collapse to single spaces, trim, cap at 64.
  const sanitised = rawName.replace(/[\r\n]+/g, ' ').trim()
  if (sanitised.length === 0) {
    await handlers.reply(
      '⚠️ /rename butuh nama baru. Contoh: /rename bahas MCP',
    )
    return true
  }
  const newName = sanitised.slice(0, 64)

  const stateDir = resolvePtyStateDir(env)
  if (!stateDir) {
    await handlers.reply(
      '⚠️ /rename tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  if (!wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /rename tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }
  // Uniqueness check: reject if the name is taken by a DIFFERENT session.
  // Self-rename to the session's own existing name is allowed (idempotent —
  // a common mobile-finger mistake; no-op is better UX than an error).
  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  if (telegramStateDir) {
    const registry = loadRegistry(telegramStateDir)
    const taken = findSessionIdByName(registry, newName)
    if (taken && taken !== currentSid) {
      await handlers.reply(
        `⚠️ Nama "${newName}" sudah dipakai session lain. /switch ke session itu atau pilih nama lain.`,
      )
      return true
    }
  }
  try {
    writeWrapperCommand(stateDir, { command: `/rename ${newName}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /rename gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  // Mirror the rename into the plugin-side registry so the new name shows
  // in the next picker render even if CC's pid file gets overwritten by a
  // later /switch before we get a chance to read it. Re-uses `currentSid`
  // and `telegramStateDir` resolved above for the uniqueness check.
  if (currentSid && telegramStateDir) {
    registrySetName(telegramStateDir, currentSid, newName)
  }
  await handlers.reply(`✏️ Renaming session ke "${newName}".`)
  return true
}

async function handleEffortDirect(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
  level: EffortLevel,
): Promise<boolean> {
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir) {
    await handlers.reply(
      '⚠️ /effort tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.',
    )
    return true
  }
  if (!wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply(
      '⚠️ /effort tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.',
    )
    return true
  }
  try {
    writeWrapperCommand(stateDir, { command: `/effort ${level}` })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /effort gagal menulis command ke wrapper: ${msg}`)
    return true
  }
  await handlers.reply(`🎯 Effort: ${level}`)
  return true
}

async function handleEffortPicker(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  // Real implementation lands in Task 4. Stub keeps the wiring compileable
  // and lets Task 3's tests exercise the with-arg path independently.
  await handlers.reply('(picker — implemented in Task 4)')
  return true
}

function switchHeadline(
  currentLabel: string | null,
  page: number,
  totalPages: number,
): string {
  const pageNote = totalPages > 1 ? ` (page ${page}/${totalPages})` : ''
  return currentLabel
    ? `🔀 Pilih session untuk diswitch (sekarang di "${currentLabel}")${pageNote}:`
    : `🔀 Pilih session untuk diswitch${pageNote}:`
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

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const currentEntry = currentSid ? all.find(s => s.sessionId === currentSid) : undefined
  const currentLabel = currentEntry?.label ?? (currentSid ? `session ${currentSid.slice(0, 8)}` : null)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all
  if (sessions.length === 0) {
    await handlers.reply(
      currentLabel
        ? `Hanya ada satu session di project ini ("${currentLabel}"). Tidak ada session lain untuk diswitch.`
        : 'Tidak ada session di project ini.',
    )
    return true
  }

  switchPicker.clear()
  switchPickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of switchPickerSessions) {
    switchPicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: switchPickerSessions,
    page: 1,
    callbackPrefix: 'meta:switch',
    cancelCallback: 'meta:cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:switch_${s.shortId}`,
  })
  await handlers.replyWithButtons(switchHeadline(currentLabel, currentPage, totalPages), rows)
  return true
}

function deleteHeadline(page: number, totalPages: number): string {
  const pageNote = totalPages > 1 ? ` (page ${page}/${totalPages})` : ''
  return `🗑️ Pilih session untuk dihapus${pageNote}:`
}

function archiveHeadline(page: number, totalPages: number): string {
  const pageNote = totalPages > 1 ? ` (page ${page}/${totalPages})` : ''
  return `📦 Pilih session untuk diarchive${pageNote}:`
}

async function handleArchive(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /archive tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /archive tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.')
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all

  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain yang bisa diarchive.')
    return true
  }

  archivePicker.clear()
  archivePickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of archivePickerSessions) {
    archivePicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: archivePickerSessions,
    page: 1,
    callbackPrefix: 'meta:archive',
    cancelCallback: 'meta:archive_cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:archive_${s.shortId}`,
  })
  await handlers.replyWithButtons(archiveHeadline(currentPage, totalPages), rows)
  return true
}

async function handleDelete(
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) {
    await handlers.reply('⚠️ /delete tidak bisa dijalankan: CLAUDE_PROJECT_DIR tidak terset.')
    return true
  }
  const stateDir = resolvePtyStateDir(env)
  if (!stateDir || !wrapperHeartbeatFresh(stateDir)) {
    await handlers.reply('⚠️ /delete tidak bisa dijalankan: mirza-cc wrapper tidak terdeteksi.')
    return true
  }

  const currentSid = readCurrentSessionId(stateDir)
  const telegramStateDir = resolveTelegramStateDir(env)
  const all = listProjectSessions(projectDir, telegramStateDir ?? undefined)
  const sessions = currentSid ? all.filter(s => s.sessionId !== currentSid) : all

  if (sessions.length === 0) {
    await handlers.reply('Tidak ada session lain yang bisa dihapus.')
    return true
  }

  deletePicker.clear()
  deletePickerSessions = sessions.map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    shortId: s.shortId,
  }))
  for (const s of deletePickerSessions) {
    deletePicker.set(s.shortId, s)
  }

  const { rows, currentPage, totalPages } = renderPickerPage({
    sessions: deletePickerSessions,
    page: 1,
    callbackPrefix: 'meta:delete',
    cancelCallback: 'meta:delete_cancel',
    labelOf: s => s.label,
    sessionCallbackOf: s => `meta:delete_${s.shortId}`,
  })
  await handlers.replyWithButtons(deleteHeadline(currentPage, totalPages), rows)
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

  if (rest.startsWith('switch_page_')) {
    const arg = rest.slice('switch_page_'.length)
    if (arg === 'noop') {
      await handlers.ackCallback()
      return true
    }
    const page = Number.parseInt(arg, 10)
    if (!Number.isFinite(page) || page < 1) {
      await handlers.ackCallback('Bad page')
      return true
    }
    if (switchPickerSessions.length === 0) {
      await handlers.ackCallback('Picker expired, /switch lagi')
      await handlers.editMessage('(picker expired — please run /switch again)').catch(() => {})
      return true
    }
    const stateDir = resolvePtyStateDir(env)
    const currentSid = stateDir ? readCurrentSessionId(stateDir) : null
    const currentLabel = (() => {
      if (!currentSid) return null
      const e = switchPickerSessions.find(s => s.sessionId === currentSid)
      return e?.label ?? `session ${currentSid.slice(0, 8)}`
    })()
    const { rows, currentPage, totalPages } = renderPickerPage({
      sessions: switchPickerSessions,
      page,
      callbackPrefix: 'meta:switch',
      cancelCallback: 'meta:cancel',
      labelOf: s => s.label,
      sessionCallbackOf: s => `meta:switch_${s.shortId}`,
    })
    await handlers.ackCallback()
    await handlers
      .editMessageWithButtons(switchHeadline(currentLabel, currentPage, totalPages), rows)
      .catch(() => {})
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
      writeWrapperCommand(stateDir, {
        type: 'switch',
        sessionId: entry.sessionId,
        sessionName: entry.label,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await handlers.ackCallback(`Write failed: ${msg}`)
      return true
    }

    // Strip the picker keyboard but don't pre-announce the destination — the
    // wrapper writes a system-outbox event the moment it injects /resume, and
    // the plugin sends a "switch to session: <name>" transition message from
    // there. One unified message for both /new and /switch paths.
    await handlers.ackCallback()
    await handlers.editMessage(`🔀 → ${entry.label}`).catch(() => {})
    switchPicker.delete(shortId)
    return true
  }

  if (rest.startsWith('delete_')) {
    // Branches: `delete_<shortId>` (picker tap), `delete_confirm_<shortId>`,
    // `delete_cancel`, `delete_page_<N>` (pagination).
    const remainder = rest.slice('delete_'.length)

    if (remainder.startsWith('page_')) {
      const arg = remainder.slice('page_'.length)
      if (arg === 'noop') {
        await handlers.ackCallback()
        return true
      }
      const page = Number.parseInt(arg, 10)
      if (!Number.isFinite(page) || page < 1) {
        await handlers.ackCallback('Bad page')
        return true
      }
      if (deletePickerSessions.length === 0) {
        await handlers.ackCallback('Picker expired, /delete lagi')
        await handlers.editMessage('(picker expired — please run /delete again)').catch(() => {})
        return true
      }
      const { rows, currentPage, totalPages } = renderPickerPage({
        sessions: deletePickerSessions,
        page,
        callbackPrefix: 'meta:delete',
        cancelCallback: 'meta:delete_cancel',
        labelOf: s => s.label,
        sessionCallbackOf: s => `meta:delete_${s.shortId}`,
      })
      await handlers.ackCallback()
      await handlers
        .editMessageWithButtons(deleteHeadline(currentPage, totalPages), rows)
        .catch(() => {})
      return true
    }

    if (remainder === 'cancel') {
      await handlers.ackCallback('Cancelled')
      await handlers.editMessage('(delete cancelled)').catch(() => {})
      return true
    }

    if (remainder.startsWith('confirm_')) {
      const shortId = remainder.slice('confirm_'.length)
      if (!SHORT_ID_RE.test(shortId)) {
        await handlers.ackCallback('Bad short id')
        return true
      }
      const entry = deletePicker.get(shortId)
      if (!entry) {
        await handlers.ackCallback('Prompt expired')
        await handlers.editMessage('(prompt expired — /delete lagi)').catch(() => {})
        return true
      }

      const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
      if (!projectDir) {
        await handlers.ackCallback('CLAUDE_PROJECT_DIR not set')
        return true
      }
      const stateDir = resolvePtyStateDir(env)
      if (stateDir) {
        const currentSid = readCurrentSessionId(stateDir)
        if (currentSid === entry.sessionId) {
          await handlers.ackCallback('Session aktif tidak bisa dihapus')
          await handlers
            .editMessage(`⚠️ Tidak bisa hapus — "${entry.label}" sekarang session aktif.`)
            .catch(() => {})
          return true
        }
      }

      const encoded = encodeProjectDir(projectDir)
      const jsonlPath = join(homedir(), '.claude', 'projects', encoded, `${entry.sessionId}.jsonl`)
      try {
        rmSync(jsonlPath, { force: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal hapus: ${msg}`)
        return true
      }

      await handlers.ackCallback(`session dihapus`)
      await handlers
        .editMessage(`🗑️ session "${entry.label}" dihapus.`)
        .catch(() => {})
      deletePicker.delete(shortId)
      return true
    }

    // Plain picker tap: `delete_<shortId>`
    const shortId = remainder
    if (!SHORT_ID_RE.test(shortId)) {
      await handlers.ackCallback('Bad short id')
      return true
    }
    const entry = deletePicker.get(shortId)
    if (!entry) {
      await handlers.ackCallback('Picker expired')
      await handlers.editMessage('(picker expired — /delete lagi)').catch(() => {})
      return true
    }

    await handlers.ackCallback('Konfirmasi diperlukan')
    await handlers
      .editMessage(`🗑️ Pilih session untuk dihapus → ${entry.label}`)
      .catch(() => {})
    await handlers.replyWithButtons(
      `Hapus session "${entry.label}"? Ini PERMANEN, tidak bisa di-undo.`,
      [[
        { label: '✅ Confirm', callbackData: `meta:delete_confirm_${shortId}` },
        { label: '❌ Cancel', callbackData: 'meta:delete_cancel' },
      ]],
    )
    return true
  }

  if (rest.startsWith('archive_')) {
    // Branches: `archive_<shortId>` (picker tap), `archive_confirm_<shortId>`,
    // `archive_cancel`, `archive_page_<N>` (pagination).
    const remainder = rest.slice('archive_'.length)

    if (remainder.startsWith('page_')) {
      const arg = remainder.slice('page_'.length)
      if (arg === 'noop') {
        await handlers.ackCallback()
        return true
      }
      const page = Number.parseInt(arg, 10)
      if (!Number.isFinite(page) || page < 1) {
        await handlers.ackCallback('Bad page')
        return true
      }
      if (archivePickerSessions.length === 0) {
        await handlers.ackCallback('Picker expired, /archive lagi')
        await handlers.editMessage('(picker expired — please run /archive again)').catch(() => {})
        return true
      }
      const { rows, currentPage, totalPages } = renderPickerPage({
        sessions: archivePickerSessions,
        page,
        callbackPrefix: 'meta:archive',
        cancelCallback: 'meta:archive_cancel',
        labelOf: s => s.label,
        sessionCallbackOf: s => `meta:archive_${s.shortId}`,
      })
      await handlers.ackCallback()
      await handlers
        .editMessageWithButtons(archiveHeadline(currentPage, totalPages), rows)
        .catch(() => {})
      return true
    }

    if (remainder === 'cancel') {
      await handlers.ackCallback('Cancelled')
      await handlers.editMessage('(archive cancelled)').catch(() => {})
      return true
    }

    if (remainder.startsWith('confirm_')) {
      const shortId = remainder.slice('confirm_'.length)
      if (!SHORT_ID_RE.test(shortId)) {
        await handlers.ackCallback('Bad short id')
        return true
      }
      const entry = archivePicker.get(shortId)
      if (!entry) {
        await handlers.ackCallback('Prompt expired')
        await handlers.editMessage('(prompt expired — /archive lagi)').catch(() => {})
        return true
      }
      const telegramStateDir = resolveTelegramStateDir(env)
      if (!telegramStateDir) {
        await handlers.ackCallback('TELEGRAM_STATE_DIR not set')
        return true
      }
      try {
        addArchived(telegramStateDir, entry.sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await handlers.ackCallback(`Gagal archive: ${msg}`)
        return true
      }
      await handlers.ackCallback('session diarchive')
      await handlers.editMessage(`📦 session "${entry.label}" diarchive.`).catch(() => {})
      archivePicker.delete(shortId)
      return true
    }

    // Plain picker tap: `archive_<shortId>` → confirmation prompt
    const shortId = remainder
    if (!SHORT_ID_RE.test(shortId)) {
      await handlers.ackCallback('Bad short id')
      return true
    }
    const entry = archivePicker.get(shortId)
    if (!entry) {
      await handlers.ackCallback('Picker expired')
      await handlers.editMessage('(picker expired — /archive lagi)').catch(() => {})
      return true
    }

    await handlers.ackCallback('Konfirmasi diperlukan')
    await handlers
      .editMessage(`📦 Pilih session untuk diarchive → ${entry.label}`)
      .catch(() => {})
    await handlers.replyWithButtons(
      `Archive session "${entry.label}"? (untuk unarchive, edit file manual)`,
      [[
        { label: '✅ Confirm', callbackData: `meta:archive_confirm_${shortId}` },
        { label: '❌ Cancel', callbackData: 'meta:archive_cancel' },
      ]],
    )
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
  switchPickerSessions = []
}

// Export for test resets — parallel to __resetSwitchPickerForTests
export function __resetDeletePickerForTests(): void {
  deletePicker.clear()
  deletePickerSessions = []
}

export function __resetArchivePickerForTests(): void {
  archivePicker.clear()
  archivePickerSessions = []
}
