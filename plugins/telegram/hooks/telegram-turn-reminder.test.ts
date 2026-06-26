import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTelegramInbound, buildTurnReminder } from './telegram-turn-reminder.ts'

const TG = '<channel source="plugin:telegram:telegram" chat_id="1">hi</channel>'

test('isTelegramInbound detects a telegram channel marker', () => {
  expect(isTelegramInbound(TG)).toBe(true)
  expect(isTelegramInbound('just a normal prompt')).toBe(false)
})

test('buildTurnReminder returns null for a non-telegram prompt', () => {
  expect(buildTurnReminder('normal prompt', {})).toBeNull()
})

test('buildTurnReminder includes the ambient obligations for a telegram inbound', () => {
  const r = buildTurnReminder(TG, {}) ?? ''
  expect(r).toMatch(/ack/i)
  expect(r).toMatch(/buttons/i)
  expect(r).toMatch(/MANDATORY/)
})

test('buildTurnReminder appends the idle line only when the session is idle', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'reminder-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'idle')
  const withIdle = buildTurnReminder(TG, { CLAUDE_PROJECT_DIR: projectDir }) ?? ''
  expect(withIdle).toMatch(/name-session/)
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'catur')
  const named = buildTurnReminder(TG, { CLAUDE_PROJECT_DIR: projectDir }) ?? ''
  expect(named).not.toMatch(/name-session/)
  rmSync(projectDir, { recursive: true, force: true })
})
