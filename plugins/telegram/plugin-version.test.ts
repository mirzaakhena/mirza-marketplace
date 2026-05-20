import { describe, test, expect } from 'bun:test'
import { formatPluginVersionLine } from './plugin-version'

describe('formatPluginVersionLine', () => {
  test('with sha → "Plugin: <name> v<version> (<sha>)"', () => {
    expect(formatPluginVersionLine('telegram', '0.0.8-mirza.0', 'abc1234')).toBe(
      'Plugin: telegram v0.0.8-mirza.0 (abc1234)',
    )
  })

  test('without sha → "Plugin: <name> v<version>"', () => {
    expect(formatPluginVersionLine('telegram', '0.0.8-mirza.0', null)).toBe(
      'Plugin: telegram v0.0.8-mirza.0',
    )
  })

  test('empty sha treated as missing', () => {
    expect(formatPluginVersionLine('telegram', '1.0.0', '')).toBe(
      'Plugin: telegram v1.0.0',
    )
  })
})
