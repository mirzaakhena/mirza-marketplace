#!/usr/bin/env bun
/**
 * PreToolUse hook (Bash): bot-conduct requires every commit to carry an
 * "Agent: <bot-name>" trailer. Denies a `git commit` carrying an inspectable
 * message (-m or heredoc) that lacks the trailer, so the AI retries with it.
 * Self-contained: only node:fs, no plugin imports.
 */
import { readFileSync } from 'node:fs'

export function checkCommit(command: string): { deny: boolean; reason?: string } {
  if (!/\bgit\s+commit\b/.test(command)) return { deny: false }
  // Only enforce when a message is inspectable in the command (-m or heredoc).
  const hasMessage = /-m\b/.test(command) || /<<-?\s*['"]?\w+/.test(command)
  if (!hasMessage) return { deny: false }
  if (/^\s*Agent:\s*\S+/m.test(command)) return { deny: false }
  return {
    deny: true,
    reason:
      'bot-conduct requires an "Agent: <bot-name>" trailer on every commit. Add a trailer line (e.g. "Agent: bot-06") to the commit message and retry.',
  }
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    return
  }
  let input: any
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  if (input?.tool_name !== 'Bash') return
  const command = input?.tool_input?.command
  if (typeof command !== 'string') return
  const result = checkCommit(command)
  if (!result.deny) return
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason,
      },
    }),
  )
}

if (import.meta.main) main()
