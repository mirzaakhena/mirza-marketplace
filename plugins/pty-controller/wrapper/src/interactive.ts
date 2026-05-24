/**
 * Spawn `claude` inside a node-pty pseudo-terminal and pipe both ways with
 * the local terminal. Lets you interact with Claude Code exactly as if you
 * had typed `claude` directly — but every keystroke and every byte of
 * output now flows through our process, where we could in principle
 * intercept, log, or inject commands.
 *
 * This script is the baseline proof: if it doesn't feel like a normal
 * `claude` session, nothing built on top of node-pty will.
 *
 * Run:
 *   pnpm interactive          # via tsx (Node)
 *   pnpm interactive:bun      # via Bun
 *
 * Quit: press Ctrl+C inside the Claude UI (or close the terminal).
 */
import { spawn, type IPty } from 'node-pty'
import process from 'node:process'

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude'
const isWindows = process.platform === 'win32'

// On Windows, `claude` is a .cmd shim that needs cmd.exe to resolve.
// Spawning the .cmd directly under PTY usually works because ConPTY hands
// it to the shell automatically, but being explicit is more reliable.
const shell = isWindows ? 'cmd.exe' : CLAUDE_BIN
const args = isWindows ? ['/c', CLAUDE_BIN] : []

console.log(`[pty-controller] spawning ${shell} ${args.join(' ')}`)
console.log(`[pty-controller] platform: ${process.platform}, runtime: ${process.versions.bun ? 'bun ' + process.versions.bun : 'node ' + process.version}`)
console.log(`[pty-controller] (Ctrl+C inside Claude to quit)\n`)

// Inherit current terminal size so Claude renders correctly.
const cols = process.stdout.columns || 100
const rows = process.stdout.rows || 30

const pty: IPty = spawn(shell, args, {
  name: 'xterm-256color',
  cols,
  rows,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
})

// PTY → local terminal: every byte from Claude is shown to the user.
pty.onData(data => {
  process.stdout.write(data)
})

// Local stdin → PTY: keypresses go straight to Claude.
process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', chunk => {
  pty.write(chunk.toString('utf8'))
})

// Forward terminal resizes so Claude re-renders correctly when window grows.
process.stdout.on('resize', () => {
  pty.resize(process.stdout.columns || 100, process.stdout.rows || 30)
})

pty.onExit(({ exitCode, signal }) => {
  process.stdin.setRawMode?.(false)
  process.stdin.pause()
  console.log(`\n[pty-controller] claude exited (code=${exitCode}, signal=${signal ?? 'none'})`)
  process.exit(exitCode ?? 0)
})
