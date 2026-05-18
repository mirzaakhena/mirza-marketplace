/**
 * Meta-command interceptor — recognizes a small set of Telegram-side slash
 * commands (`/new` today, more later) and routes them directly to the
 * pty-controller wrapper instead of relaying them to Claude as a regular
 * inbound message.
 *
 * The companion plugin `pty-controller` and the `mirza-cc` wrapper handle
 * the actual side-effect (injecting `/clear` into the CC PTY, then chaining
 * `/notify-user` once the fresh session shows up). This module is just the
 * decision point: "is this text a meta-command, and is the wrapper around
 * to take it?"
 *
 * Layout we assume (per-project, same shape pty-controller uses):
 *   <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller/
 *     ├─ pending/<uuid>.json   (we write here)
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

const HEARTBEAT_FRESH_MS = 30_000

export interface MetaCommandHandlers {
  /**
   * Send a Telegram reply back to the user. The telegram plugin already
   * does this through its own bot.api — we accept a callback so this
   * module doesn't have to know about grammy.
   */
  reply: (text: string) => Promise<void>
}

/** Resolve the per-project state dir pty-controller agrees on. */
function resolvePtyStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.PTY_CONTROLLER_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) return null
  return join(projectDir, '.claude', 'channels', 'pty-controller')
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

function writeWrapperCommand(stateDir: string, command: string): void {
  const pending = join(stateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const payload = {
    id,
    ts: new Date().toISOString(),
    command,
  }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2))
  renameSync(tmpPath, finalPath)
}

/**
 * Try to handle `text` as a Telegram meta-command. Returns:
 *   - `true`  → consumed (we did something; caller must NOT forward to AI)
 *   - `false` → not a meta-command (caller should continue normal flow)
 *
 * Recognized today (exact match, trimmed, lowercase compared):
 *   /new — request the pty-controller wrapper to /clear the CC session
 *
 * If the wrapper isn't reachable, we still consume `/new` and reply with
 * an explanatory error, rather than silently routing it to the AI (which
 * would just see "/new" as text and not know what to do).
 */
export async function tryRouteMetaCommand(
  text: string,
  env: Record<string, string | undefined>,
  handlers: MetaCommandHandlers,
): Promise<boolean> {
  const trimmed = text.trim().toLowerCase()
  if (trimmed !== '/new') return false

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
    writeWrapperCommand(stateDir, '/clear')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await handlers.reply(`⚠️ /new gagal menulis command ke wrapper: ${msg}`)
    return true
  }

  await handlers.reply('🔄 Clearing session — fresh session sebentar lagi siap.')
  return true
}
