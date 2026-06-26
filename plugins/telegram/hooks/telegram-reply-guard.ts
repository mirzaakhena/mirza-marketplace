#!/usr/bin/env bun
/**
 * Stop hook: when a Telegram-driven conversation reaches a concluding stop with
 * no reply sent since the latest Telegram inbound, block once to remind the AI
 * to answer the AFK user. Loop-guarded via stop_hook_active.
 */
import { readFileSync } from 'node:fs'

const REPLY_TOOL = 'mcp__plugin_telegram_telegram__reply'
const TG_RE = /<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/

export interface TranscriptAnalysis {
  telegramDriven: boolean
  latestInboundIdx: number
  latestReplyIdx: number
}

export function analyzeTranscript(lines: string[]): TranscriptAnalysis {
  let telegramDriven = false
  let latestInboundIdx = -1
  let latestReplyIdx = -1
  lines.forEach((line, idx) => {
    if (!line.trim()) return
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }
    const content = obj?.message?.content
    if (!Array.isArray(content)) return
    if (obj.type === 'user') {
      for (const part of content) {
        if (part?.type === 'text' && typeof part.text === 'string' && TG_RE.test(part.text)) {
          telegramDriven = true
          latestInboundIdx = idx
        }
      }
    } else if (obj.type === 'assistant') {
      for (const part of content) {
        if (part?.type === 'tool_use' && part.name === REPLY_TOOL) {
          latestReplyIdx = idx
        }
      }
    }
  })
  return { telegramDriven, latestInboundIdx, latestReplyIdx }
}

export function decideStop(
  a: TranscriptAnalysis,
  stopHookActive: boolean,
): { block: boolean; reason?: string } {
  if (stopHookActive) return { block: false }
  if (!a.telegramDriven || a.latestInboundIdx === -1) return { block: false }
  if (a.latestReplyIdx > a.latestInboundIdx) return { block: false }
  return {
    block: true,
    reason:
      'This conversation is from Telegram and the user is AFK (they do not see this transcript). You have not sent a reply since their last message — send your answer now via the reply tool (mcp__plugin_telegram_telegram__reply).',
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
  if (input?.stop_hook_active === true) return
  const path = input?.transcript_path
  if (typeof path !== 'string') return
  let lines: string[] = []
  try {
    lines = readFileSync(path, 'utf8').split('\n')
  } catch {
    return
  }
  const decision = decideStop(analyzeTranscript(lines), false)
  if (!decision.block) return
  process.stdout.write(JSON.stringify({ decision: 'block', reason: decision.reason }))
}

if (import.meta.main) main()
