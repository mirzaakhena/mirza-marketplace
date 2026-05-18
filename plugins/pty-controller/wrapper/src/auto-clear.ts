/**
 * Spawn `claude` inside a node-pty PTY, wait for the UI to settle, then
 * programmatically inject `/clear` and Enter. Capture stdout the whole
 * time so we can verify the slash command was processed.
 *
 * This is the PoC's actual proof point: a parent process can drive Claude
 * Code via slash commands without the user touching the keyboard.
 *
 * Run:
 *   pnpm auto-clear           # via tsx (Node)
 *   pnpm auto-clear:bun       # via Bun
 *
 * Tweak knobs via env vars:
 *   READY_DELAY_MS   — wait this long after spawn before sending /clear (default 5000)
 *   POST_DELAY_MS    — wait this long after /clear before quitting (default 4000)
 *   CLAUDE_BIN       — override path/name of the claude binary
 */
import { spawn, type IPty } from 'node-pty'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
const READY_DELAY_MS = Number(process.env.READY_DELAY_MS ?? 5000)
const POST_DELAY_MS = Number(process.env.POST_DELAY_MS ?? 4000)
const isWindows = process.platform === 'win32'

const shell = isWindows ? 'cmd.exe' : CLAUDE_BIN
const args = isWindows ? ['/c', CLAUDE_BIN] : []

console.log(`[auto-clear] spawning ${shell} ${args.join(' ')}`)
console.log(`[auto-clear] will send "/clear" after ${READY_DELAY_MS}ms, exit after another ${POST_DELAY_MS}ms`)

const pty: IPty = spawn(shell, args, {
  name: 'xterm-256color',
  cols: process.stdout.columns || 100,
  rows: process.stdout.rows || 30,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
})

// Capture every byte so we can inspect what Claude rendered after the
// command was injected. Also mirror to our terminal so the demo is visible.
let captured = ''
pty.onData(data => {
  captured += data
  process.stdout.write(data)
})

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function main(): Promise<void> {
  // Give Claude time to boot, render its banner, and reach an idle input
  // prompt. Too short and the keystrokes land mid-init.
  await sleep(READY_DELAY_MS)

  console.log('\n[auto-clear] >>> injecting "/clear\\r" now')
  // \r is the carriage return — what Enter sends in a terminal. \n alone
  // is sometimes ignored by readline-style TUIs.
  pty.write('/clear\r')

  await sleep(POST_DELAY_MS)

  console.log('\n[auto-clear] >>> demo done, sending /exit\\r')
  pty.write('/exit\r')

  // If /exit doesn't tear down within a few seconds, force-kill so the
  // script doesn't hang in CI / parent shells.
  await sleep(3000)
  console.log('\n[auto-clear] >>> force-killing PTY')
  pty.kill()
}

pty.onExit(({ exitCode, signal }) => {
  console.log(`\n[auto-clear] claude exited (code=${exitCode}, signal=${signal ?? 'none'})`)
  console.log(`[auto-clear] captured ${captured.length} bytes total`)
  // Heuristic check: did "/clear" appear anywhere in the captured output?
  // (If yes, at minimum our keystrokes reached the PTY.)
  const echoed = captured.includes('/clear')
  console.log(`[auto-clear] "/clear" echoed in output: ${echoed ? 'YES' : 'NO'}`)

  // Save the full captured stream so it can be replayed or inspected.
  // The .ansi file keeps escape codes intact — `type` (Windows cmd.exe) or
  // `cat` (Unix) on a real terminal will render it back the way Claude
  // showed it live. The .txt file strips escapes for plain reading.
  const ansiPath = join(process.cwd(), 'last-capture.ansi')
  const txtPath = join(process.cwd(), 'last-capture.txt')
  writeFileSync(ansiPath, captured, 'utf8')
  // Conservative strip — drop CSI/OSC escapes and bracketed-paste sequences
  // so the .txt is roughly human-readable.
  const stripped = captured
    .replace(/\x1B\][^\x07]*\x07/g, '') // OSC ... BEL
    .replace(/\x1B\[[?>!]?[0-9;]*[A-Za-z]/g, '') // CSI sequences
    .replace(/\x1B[=>NOM]/g, '') // single-char escapes
  writeFileSync(txtPath, stripped, 'utf8')
  console.log(`[auto-clear] capture saved:`)
  console.log(`  ${ansiPath}  (raw, replay-able)`)
  console.log(`  ${txtPath}   (stripped, human-readable)`)
  process.exit(exitCode ?? 0)
})

main().catch(err => {
  console.error('[auto-clear] error:', err)
  pty.kill()
  process.exit(1)
})
