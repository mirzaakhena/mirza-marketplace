import { test, expect, describe } from 'bun:test'
import { isOurOwnBridge } from './server-helpers'

describe('isOurOwnBridge', () => {
  test('old .sh path (Unix)', () => {
    expect(isOurOwnBridge('/home/user/plugins/telegram/scripts/context-bridge.sh')).toBe(true)
  })
  test('old .sh path (Windows)', () => {
    expect(isOurOwnBridge('C:\\Users\\Mirza\\.claude\\plugins\\cache\\mirza-marketplace\\telegram\\0.0.7-mirza.1\\scripts\\context-bridge.sh')).toBe(true)
  })
  test('new .ts path wrapped in bun run + quotes', () => {
    expect(isOurOwnBridge('bun run "/Users/x/plugins/telegram/scripts/context-bridge.ts"')).toBe(true)
  })
  test('new .ts path Windows wrapped in bun run', () => {
    expect(isOurOwnBridge('bun run "C:\\Users\\Mirza\\.claude\\plugins\\cache\\mirza-marketplace\\telegram\\0.0.8-mirza.0\\scripts\\context-bridge.ts"')).toBe(true)
  })
  test('unrelated tool (starship)', () => {
    expect(isOurOwnBridge('starship prompt')).toBe(false)
  })
  test('unrelated script with similar name', () => {
    expect(isOurOwnBridge('/usr/local/bin/context-bridge.sh')).toBe(false)
  })
  test('empty string', () => {
    expect(isOurOwnBridge('')).toBe(false)
  })
  test('whitespace-only', () => {
    expect(isOurOwnBridge('   ')).toBe(false)
  })
  test('case-insensitive match (Windows is case-insensitive)', () => {
    expect(isOurOwnBridge('C:\\Path\\Telegram\\Scripts\\Context-Bridge.SH')).toBe(true)
  })
})
