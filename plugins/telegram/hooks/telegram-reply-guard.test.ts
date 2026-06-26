import { test, expect } from 'bun:test'
import { analyzeTranscript, decideStop } from './telegram-reply-guard.ts'

const inbound = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'text', text: '<channel source="plugin:telegram:telegram">q</channel>' }] },
})
const replyCall = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'mcp__plugin_telegram_telegram__reply', input: {} }] },
})
const plainAssistant = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'thinking' }] },
})
const nonTgUser = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'text', text: 'plain prompt' }] },
})

test('analyzeTranscript finds telegram inbound and reply indices', () => {
  const a = analyzeTranscript([inbound, replyCall])
  expect(a.telegramDriven).toBe(true)
  expect(a.latestInboundIdx).toBe(0)
  expect(a.latestReplyIdx).toBe(1)
})

test('decideStop blocks when telegram inbound has no reply after it', () => {
  const a = analyzeTranscript([inbound, plainAssistant])
  expect(decideStop(a, false).block).toBe(true)
})

test('decideStop allows when a reply followed the latest inbound', () => {
  const a = analyzeTranscript([inbound, replyCall])
  expect(decideStop(a, false).block).toBe(false)
})

test('decideStop allows a non-telegram conversation', () => {
  const a = analyzeTranscript([nonTgUser, plainAssistant])
  expect(decideStop(a, false).block).toBe(false)
})

test('decideStop never blocks when stop_hook_active is already set', () => {
  const a = analyzeTranscript([inbound, plainAssistant])
  expect(decideStop(a, true).block).toBe(false)
})

test('decideStop blocks when a new inbound arrives after an earlier reply', () => {
  const a = analyzeTranscript([inbound, replyCall, inbound])
  expect(a.latestInboundIdx).toBe(2)
  expect(a.latestReplyIdx).toBe(1)
  expect(decideStop(a, false).block).toBe(true)
})
