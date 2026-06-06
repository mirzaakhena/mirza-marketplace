import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, expect } from 'bun:test'
import {
  formatPluginVersionLine,
  readPluginVersion,
  readInstalledPluginVersion,
} from './plugin-version'

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

describe('readInstalledPluginVersion', () => {
  const registryFixture = {
    version: 2,
    plugins: {
      'agent-bus@mirza-marketplace': [
        { scope: 'user', version: '0.0.3', installPath: '/x/agent-bus/0.0.3' },
      ],
      'telegram@mirza-marketplace': [
        { scope: 'user', version: '0.0.25-mirza.0' },
      ],
    },
  }

  function withRegistry(content: string, fn: (path: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), 'ipv-'))
    const path = join(dir, 'installed_plugins.json')
    try {
      writeFileSync(path, content)
      fn(path)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('resolves version by plugin name, ignoring the @marketplace suffix', () => {
    withRegistry(JSON.stringify(registryFixture), path => {
      expect(readInstalledPluginVersion('agent-bus', path)).toBe('0.0.3')
      expect(readInstalledPluginVersion('telegram', path)).toBe('0.0.25-mirza.0')
    })
  })

  test('does not match a plugin whose name merely starts the same', () => {
    withRegistry(JSON.stringify(registryFixture), path => {
      // "agent" is a prefix of "agent-bus" but not an entry — must be null,
      // and "agent-bus" must not match a hypothetical "agent" lookup.
      expect(readInstalledPluginVersion('agent', path)).toBeNull()
    })
  })

  test('returns null for an unknown plugin', () => {
    withRegistry(JSON.stringify(registryFixture), path => {
      expect(readInstalledPluginVersion('nope', path)).toBeNull()
    })
  })

  test('returns null when the registry file is missing', () => {
    expect(
      readInstalledPluginVersion('agent-bus', join(tmpdir(), 'does-not-exist.json')),
    ).toBeNull()
  })

  test('returns null on malformed JSON', () => {
    withRegistry('not json', path => {
      expect(readInstalledPluginVersion('agent-bus', path)).toBeNull()
    })
  })

  test('tolerates a non-array entry value', () => {
    withRegistry(
      JSON.stringify({ plugins: { 'agent-bus@m': { version: '1.2.3' } } }),
      path => {
        expect(readInstalledPluginVersion('agent-bus', path)).toBe('1.2.3')
      },
    )
  })
})
