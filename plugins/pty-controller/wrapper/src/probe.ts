import { spawn } from 'node-pty'

console.log('process.platform:', process.platform)
console.log('node version:', process.version)

// Trivial PTY session to verify the native binding loads end-to-end on this
// machine before we try to host Claude Code in it.
const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
const args =
  process.platform === 'win32'
    ? ['/c', 'echo PTY OK && exit']
    : ['-c', 'echo PTY OK; exit']

const pty = spawn(shell, args, {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
})

let out = ''
pty.onData(d => {
  out += d
  process.stdout.write(d)
})
pty.onExit(({ exitCode }) => {
  console.log(`\n[exit ${exitCode}]`)
  console.log('captured bytes:', out.length)
})
