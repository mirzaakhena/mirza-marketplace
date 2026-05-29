/**
 * Receiver runtime for the agent-bus prompt inbox.
 *
 * The agent-bus MCP server installs startPromptWatcher() over its own inbox.
 * Each valid prompt file is parsed and handed to the `emit` callback (which
 * the server turns into a notifications/claude/channel message), then deleted.
 * Invalid files are quarantined to .rejected/. A boot-time sweep drains any
 * backlog (prompts that arrived while this agent was offline), capped to
 * avoid a flood; the excess is parked in .overflow/.
 *
 * fs.watch alone is unreliable on Windows (atomic-rename inode swaps), so the
 * watcher is paired with an interval sweep — same defensive shape as the
 * telegram plugin's system-outbox watcher.
 */
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  existsSync,
  watch,
  type FSWatcher,
} from 'node:fs'
import { join } from 'node:path'
import { validateInboundPrompt, type PromptMessage } from './prompt-inbox'

export type EmitFn = (msg: PromptMessage) => void
export type LogFn = (line: string) => void

const DEFAULT_MAX_PER_SWEEP = 50
const WATCH_DEFER_MS = 50
const SWEEP_INTERVAL_MS = 2_000

function quarantine(inboxDir: string, filename: string, subdir: string, reason: string, log: LogFn): void {
  try {
    const dest = join(inboxDir, subdir)
    mkdirSync(dest, { recursive: true })
    renameSync(join(inboxDir, filename), join(dest, filename))
    log(`prompt ${filename} → ${subdir} (${reason})`)
  } catch (err) {
    log(`failed to quarantine ${filename} to ${subdir}: ${err}`)
  }
}

/**
 * Consume one inbox file: read → validate → emit → delete. On any failure
 * the file is moved to .rejected/ so it is never retried in a loop.
 */
export function consumeInboxFile(inboxDir: string, filename: string, emit: EmitFn, log: LogFn): void {
  const full = join(inboxDir, filename)
  if (!existsSync(full)) return
  let raw: string
  try {
    raw = readFileSync(full, 'utf8')
  } catch (err) {
    log(`failed to read ${filename}: ${err}`)
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    quarantine(inboxDir, filename, '.rejected', 'malformed JSON', log)
    return
  }
  const v = validateInboundPrompt(parsed)
  if (!v.ok) {
    quarantine(inboxDir, filename, '.rejected', v.error, log)
    return
  }
  try {
    emit(v.msg)
  } catch (err) {
    log(`emit failed for ${filename}: ${err}`)
    return // leave file; a later sweep retries
  }
  try {
    unlinkSync(full)
  } catch (err) {
    log(`failed to delete ${filename} after emit: ${err}`)
  }
}

/** Consume every .json file in the inbox, capped at `max`; overflow parked. */
export function sweepInbox(inboxDir: string, emit: EmitFn, log: LogFn, opts?: { max?: number }): void {
  const max = opts?.max ?? DEFAULT_MAX_PER_SWEEP
  let names: string[]
  try {
    names = readdirSync(inboxDir).filter(f => f.endsWith('.json') && !f.includes('.tmp'))
  } catch {
    return // inbox missing transiently
  }
  names.sort() // stable order
  const take = names.slice(0, max)
  const overflow = names.slice(max)
  for (const name of take) consumeInboxFile(inboxDir, name, emit, log)
  for (const name of overflow) quarantine(inboxDir, name, '.overflow', 'backlog cap exceeded', log)
}

/**
 * Install the watcher. Returns a stop() that closes the watcher and clears
 * the sweep interval. Runs an immediate boot sweep to drain backlog.
 */
export function startPromptWatcher(opts: {
  inboxDir: string
  emit: EmitFn
  log: LogFn
}): () => void {
  const { inboxDir, emit, log } = opts
  mkdirSync(inboxDir, { recursive: true })

  // Boot sweep: drain anything queued while we were offline.
  sweepInbox(inboxDir, emit, log)

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(inboxDir, (_event, filename) => {
      if (!filename) return
      const name = filename.toString()
      if (!name.endsWith('.json') || name.includes('.tmp')) return
      setTimeout(() => consumeInboxFile(inboxDir, name, emit, log), WATCH_DEFER_MS)
    })
  } catch (err) {
    log(`failed to install inbox watcher: ${err}`)
  }

  const interval = setInterval(() => sweepInbox(inboxDir, emit, log), SWEEP_INTERVAL_MS)

  return () => {
    try { watcher?.close() } catch { /* noop */ }
    try { clearInterval(interval) } catch { /* noop */ }
  }
}
