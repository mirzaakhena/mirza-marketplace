import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, expect } from 'bun:test'
import { formatPluginVersionLine, readPluginVersion } from './plugin-version'

describe('formatPluginVersionLine', () => {
  test('with sha → two lines "Plugin: <name>\\nv<version> (<sha>)"', () => {
    expect(formatPluginVersionLine('telegram', '0.0.8-mirza.0', 'abc1234')).toBe(
      'Plugin: telegram\nv0.0.8-mirza.0 (abc1234)',
    )
  })

  test('without sha → two lines "Plugin: <name>\\nv<version>"', () => {
    expect(formatPluginVersionLine('telegram', '0.0.8-mirza.0', null)).toBe(
      'Plugin: telegram\nv0.0.8-mirza.0',
    )
  })

  test('empty sha treated as missing', () => {
    expect(formatPluginVersionLine('telegram', '1.0.0', '')).toBe(
      'Plugin: telegram\nv1.0.0',
    )
  })
})

describe('readPluginVersion', () => {
  test('reads name and version from package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pv-'))
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '9.9.9' }),
      )
      const v = readPluginVersion(dir)
      expect(v.name).toBe('test-pkg')
      expect(v.version).toBe('9.9.9')
      // sha may be null (no git in tmpdir) — but should never throw.
      expect(v.sha === null || typeof v.sha === 'string').toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('falls back to "unknown" name/version on missing package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pv-'))
    try {
      const v = readPluginVersion(dir)
      expect(v.name).toBe('unknown')
      expect(v.version).toBe('unknown')
      expect(v.sha).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('falls back gracefully on malformed package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pv-'))
    try {
      writeFileSync(join(dir, 'package.json'), 'not json')
      const v = readPluginVersion(dir)
      expect(v.name).toBe('unknown')
      expect(v.version).toBe('unknown')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
