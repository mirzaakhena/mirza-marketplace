#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: on a Telegram inbound, re-injects the ambient
 * Telegram-channel obligations every turn (not just at SessionStart), so they
 * don't fade under task pressure. Silent on non-telegram prompts.
 */
import { readFileSync } from 'node:fs'
import { resolveSessionNameForContext } from './session-name-context.ts'

export function isTelegramInbound(prompt: string): boolean {
  return /<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/.test(prompt)
}

export function buildTurnReminder(
  prompt: string,
  env: Record<string, string | undefined>,
): string | null {
  if (!isTelegramInbound(prompt)) return null
  const lines = [
    'Telegram-channel obligations for THIS turn (mechanical reminder):',
    '- immediate-reply: if your response will make ANY tool call before the final answer, send a short ack via the reply tool BEFORE that first tool call.',
    '- inline-buttons: if your reply asks a question or offers options, attach buttons (min Yes/No + a manual-fallback).',
    '- channel discipline: the user is on Telegram and does NOT see this transcript. Answering via the reply tool is MANDATORY — send the final answer through reply when the task concludes, not only at the start.',
  ]
  if (resolveSessionNameForContext(env) === 'idle') {
    lines.push(
      '- name-session: this session is still named "idle" — if the topic is now clear, offer a hyphenated name via buttons THIS turn.',
    )
  }
  return lines.join('\n')
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    return
  }
  let prompt = ''
  try {
    prompt = JSON.parse(raw).prompt ?? ''
  } catch {
    return
  }
  const reminder = buildTurnReminder(prompt, process.env)
  if (!reminder) return
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: reminder,
      },
    }),
  )
}

if (import.meta.main) main()
