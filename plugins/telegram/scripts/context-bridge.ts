#!/usr/bin/env bun
/**
 * Telegram /context bridge — cross-platform replacement for context-bridge.sh.
 *
 * Captures Claude Code's statusLine stdin and writes
 * <project>/.claude/channels/telegram/last-status.json atomically, then
 * chains to the user's previous statusLine command if any (via the
 * platform's default shell — cmd.exe on Windows, /bin/sh on Unix).
 *
 * Runs under `bun run` so it works on any OS where bun runs.
 */
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectDir = process.env.CLAUDE_PROJECT_DIR?.trim()
if (!projectDir) {
  process.stderr.write('context-bridge: CLAUDE_PROJECT_DIR not set; skipping capture\n')
  process.exit(0)
}

const stateDir = join(projectDir, '.claude', 'channels', 'telegram')
const stateFile = join(stateDir, 'last-status.json')
const chainFile = join(stateDir, 'chained-statusline')

mkdirSync(stateDir, { recursive: true })

// Read all of stdin.
const input = await new Response(Bun.stdin.stream()).text()

// Parse payload defensively — write null payload on bad input rather than crashing.
const payload = (() => {
  try { return JSON.parse(input) } catch { return null }
})()
const out = { captured_at_ms: Date.now(), payload }

// Atomic write via temp + rename.
const tmp = `${stateFile}.tmp.${process.pid}`
writeFileSync(tmp, JSON.stringify(out))
renameSync(tmp, stateFile)

// Chain to previous statusLine command if present.
if (existsSync(chainFile)) {
  const chain = readFileSync(chainFile, 'utf8').trim()
  if (chain) {
    spawnSync(chain, { input, stdio: ['pipe', 'inherit', 'inherit'], shell: true })
  }
}
