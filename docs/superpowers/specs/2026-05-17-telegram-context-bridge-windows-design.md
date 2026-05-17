# Telegram `/context` Bridge — Windows Compatibility

**Date:** 2026-05-17
**Component:** `plugins/telegram/scripts/context-bridge.sh` + `plugins/telegram/server.ts` + `plugins/telegram/context-renderer.ts`

## Problem

Bridge script untuk `/context` adalah bash (`context-bridge.sh`). User di Windows tanpa Git Bash / WSL tidak bisa menjalankan script ini. Setelah `/context` di-trigger:

1. `settings.json` ter-patch dengan command `"...context-bridge.sh"` ✅
2. Claude Code Windows coba eksekusi `.sh` → silent fail ❌
3. `last-status.json` tidak pernah ditulis
4. `/context` berikutnya selalu return fallback "belum ada data"

Confirmed terkonfirmasi di environment user (Windows 10, bot v0.0.7-mirza.1, tanpa bash di PATH).

## Goal

Bridge harus berjalan cross-platform tanpa dependency tambahan di luar yang sudah dibutuhkan plugin (bun runtime — sudah jadi requirement karena `server.ts` di-shebang `#!/usr/bin/env bun`).

## Approach

Rewrite bridge sebagai TypeScript script yang dijalankan via `bun run`. Hapus `.sh` lama. Path di `statusLine.command` jadi `bun run "<absolute path to context-bridge.ts>"`.

## File Changes

| File | Action | Notes |
|---|---|---|
| `plugins/telegram/scripts/context-bridge.sh` | **Delete** | Replaced by `.ts` version |
| `plugins/telegram/scripts/context-bridge.ts` | **Create** | Cross-platform replacement |
| `plugins/telegram/scripts/context-bridge.test.ts` | **Create** | Integration tests (spawn the script) |
| `plugins/telegram/server.ts` | **Modify** | Update `CONTEXT_BRIDGE_PATH`; add `isOurOwnBridge` helper |
| `plugins/telegram/context-renderer.ts` | **Modify** | `shortCwd` split on both `/` and `\` |
| `plugins/telegram/context-renderer.test.ts` | **Modify** | Add Windows-path test cases for `shortCwd` |
| `plugins/telegram/package.json` | **Modify** | Bump version (`0.0.7-mirza.1` → `0.0.8-mirza.0`) |

## context-bridge.ts (new)

```ts
#!/usr/bin/env bun
/**
 * Telegram /context bridge — cross-platform replacement for context-bridge.sh.
 * Captures Claude Code's statusLine stdin, writes <state>/last-status.json
 * atomically, then chains to the user's previous statusLine if any.
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

// Write captured payload atomically.
const payload = (() => {
  try { return JSON.parse(input) } catch { return null }
})()
const out = { captured_at_ms: Date.now(), payload }
const tmp = `${stateFile}.tmp.${process.pid}`
writeFileSync(tmp, JSON.stringify(out))
renameSync(tmp, stateFile)

// Chain to previous statusLine command if user had one.
// shell:true uses cmd.exe on Windows, /bin/sh on Unix — portable.
if (existsSync(chainFile)) {
  const chain = readFileSync(chainFile, 'utf8').trim()
  if (chain) {
    spawnSync(chain, { input, stdio: ['pipe', 'inherit', 'inherit'], shell: true })
  }
}
```

**Notes:**
- `payload` falls back to `null` if stdin isn't valid JSON — script never crashes, last-status.json always written.
- `Bun.stdin.stream()` is bun-specific; the script runs under `bun run`, so this is fine.
- Atomicity via temp file + rename, same as old bash version.
- Chain failure (broken old command, non-zero exit) does not affect captured payload — already written.

## server.ts changes

### CONTEXT_BRIDGE_PATH

```ts
// Before:
const CONTEXT_BRIDGE_PATH = join(import.meta.dir, 'scripts', 'context-bridge.sh')

// After:
const CONTEXT_BRIDGE_SCRIPT = join(import.meta.dir, 'scripts', 'context-bridge.ts')
const CONTEXT_BRIDGE_PATH = `bun run "${CONTEXT_BRIDGE_SCRIPT}"`
```

The double-quoted path handles spaces in absolute paths on all platforms.

### isOurOwnBridge helper

When `ensureContextBridgeInstalled()` detects an existing `statusLine.command` that isn't the current `CONTEXT_BRIDGE_PATH`, it stores it as `previousCommand` so the new bridge can chain to it. But if the previous command is an OLD version of OUR bridge (e.g., `.sh` from a prior install, or a different bun-run invocation of the same `.ts`), chaining would be self-referential.

Add helper:

```ts
function isOurOwnBridge(cmd: string): boolean {
  // Match any path ending in /scripts/context-bridge.{sh,ts,js,bat,ps1}
  // or `bun run "...context-bridge.ts"` shape, regardless of OS separator.
  const normalized = cmd.replace(/\\/g, '/').toLowerCase()
  return /[/]telegram[/]scripts[/]context-bridge\.[a-z0-9]+/.test(normalized)
}
```

Use it in `ensureContextBridgeInstalled`:

```ts
const previousCommand = typeof current.command === 'string' && !isOurOwnBridge(current.command)
  ? current.command
  : null
```

This way, users upgrading from `.sh` to `.ts` (or future bridge versions) won't get the old bridge written into `chained-statusline`.

## context-renderer.ts changes

### shortCwd — handle Windows paths

```ts
// Before:
export function shortCwd(path: string): string {
  if (!path) return ''
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const segments = trimmed.split('/').filter(s => s.length > 0)
  if (segments.length < 2) return trimmed
  const tail = segments.slice(-2).join('/')
  return `…/${tail}`
}

// After:
export function shortCwd(path: string): string {
  if (!path) return ''
  const trimmed = path.replace(/[/\\]+$/, '')
  const segments = trimmed.split(/[/\\]/).filter(s => s.length > 0)
  if (segments.length < 2) return trimmed
  const tail = segments.slice(-2).join('/')  // canonicalize to forward slash in output
  return `…/${tail}`
}
```

Existing tests still pass because they use forward-slash inputs. New tests cover `\`-style Windows paths.

## Tests

### Update `context-renderer.test.ts`

Add to `describe('shortCwd', ...)`:

```ts
test('Windows-style backslash path', () => {
  expect(shortCwd('C:\\Users\\mirza\\workspace\\bot-01'))
    .toBe('…/workspace/bot-01')
})
test('Windows-style with trailing backslash', () => {
  expect(shortCwd('C:\\Users\\foo\\bar\\')).toBe('…/foo/bar')
})
test('mixed separators', () => {
  expect(shortCwd('/Users\\mirza/Workspace\\sandbox')).toBe('…/Workspace/sandbox')
})
test('Windows drive only', () => {
  expect(shortCwd('C:\\')).toBe('C:')
})
```

Note the "Windows drive only" case: `C:\` → after strip trailing → `C:` → split → `['C:']` (length 1) → return as-is. Acceptable; very rare in practice.

### New `context-bridge.test.ts`

Integration test: spawn the bridge script with stdin JSON, verify the file is written.

```ts
import { test, expect, describe } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SCRIPT = join(import.meta.dir, 'context-bridge.ts')

function runBridge(env: Record<string, string>, stdin: string) {
  return spawnSync('bun', ['run', SCRIPT], {
    env: { ...process.env, ...env },
    input: stdin,
    encoding: 'utf-8',
  })
}

describe('context-bridge', () => {
  test('writes last-status.json with captured payload', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const payload = { context_window: { used_percentage: 42 } }
      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, JSON.stringify(payload))
      expect(r.status).toBe(0)
      const out = JSON.parse(readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8'))
      expect(out.payload).toEqual(payload)
      expect(typeof out.captured_at_ms).toBe('number')
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })

  test('exits 0 silently when CLAUDE_PROJECT_DIR is unset', () => {
    const r = runBridge({ CLAUDE_PROJECT_DIR: '' }, '{}')
    expect(r.status).toBe(0)
  })

  test('survives invalid JSON stdin (writes null payload)', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, 'not json{{{')
      expect(r.status).toBe(0)
      const out = JSON.parse(readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8'))
      expect(out.payload).toBeNull()
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })

  test('chains to previous statusline command', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const stateDir = join(proj, '.claude/channels/telegram')
      const sentinelOut = join(proj, 'sentinel.out')
      // Cross-platform sentinel: echo stdin to a file via shell
      const chainCmd = process.platform === 'win32'
        ? `more > "${sentinelOut.replace(/\\/g, '\\\\')}"`
        : `cat > "${sentinelOut}"`
      // Pre-create state dir and chain file (the bridge would normally create the dir)
      require('fs').mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, 'chained-statusline'), chainCmd)

      runBridge({ CLAUDE_PROJECT_DIR: proj }, '{"a":1}')

      expect(existsSync(sentinelOut)).toBe(true)
      // Sentinel content should be the stdin we passed (chained via shell)
      const sentContent = readFileSync(sentinelOut, 'utf8').trim()
      expect(sentContent).toBe('{"a":1}')
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })
})
```

### `server.ts` change verification

Existing `server-boot.test.ts` covers compile/import correctness — sufficient. No new test needed for the path change.

### `isOurOwnBridge` unit tests

Add in a new file `plugins/telegram/server-helpers.test.ts` ONLY IF the helper is exported standalone. Since the helper is small and tightly coupled to server.ts, two options:
- **A:** Keep it inline in server.ts (not exported, not unit-tested). The behavior is covered indirectly when end-to-end install path is tested.
- **B:** Export it, write 4-5 quick test cases.

Decision: **B**. The pattern matching has edge cases (case sensitivity, mixed separators, paths with `bun run` prefix) worth pinning.

Add to `plugins/telegram/server-helpers.ts` (new file) with just this helper, import it in `server.ts`. Test file `plugins/telegram/server-helpers.test.ts` covers:
- old `.sh` path → true
- new `bun run "...ts"` path → true
- unrelated command (e.g., `starship prompt`) → false
- empty string → false
- mixed separators / Windows backslash → true

## Migration story

When existing user (with `.sh` installed) upgrades to new plugin version and sends `/context`:

1. `current.command` = old `.sh` path
2. `current.command !== CONTEXT_BRIDGE_PATH` → reinstall triggers
3. `isOurOwnBridge(current.command)` returns `true` → `previousCommand = null` → no chain
4. Settings re-patched to `bun run "...context-bridge.ts"`
5. Backup file written (timestamp-suffixed)
6. User sees the new ack + auto-retry flow shipped in earlier work

For users **without** a prior statusLine: clean install, no chain.

For users **with** a non-telegram statusLine (e.g., `starship`): preserved into `chained-statusline` and called via `shell: true` (works on Windows + Unix).

## Version bump

`plugins/telegram/package.json`:
```json
"version": "0.0.8-mirza.0"
```

(Convention: bump patch when only fixing existing functionality; bump minor if it were adding new features. This is a fix → patch level. The `-mirza.0` suffix matches the fork convention.)

## Non-Goals

- Tidak menambah PowerShell fallback (`.ps1`).
- Tidak menambah cmd.exe wrapper (`.bat`).
- Tidak migrate file format `last-status.json` (schema sama).
- Tidak menyentuh fungsi rendering yang lain (renderer rewrite sudah selesai di spec sebelumnya).

## Risks

- **Bun not in PATH:** If user has bun installed but only via a shim that isn't in their shell's PATH when Claude Code spawns the statusLine command, `bun run ...` will fail. Mitigation: Claude Code Windows users that already have the MCP bot working must have bun in PATH — same dependency.
- **`Bun.stdin` API stability:** Bun's stdin handling has changed in past versions; if a user is on an old bun, `Bun.stdin.stream()` may behave differently. Mitigation: bun runtime is a plugin requirement — same constraint as the rest of the plugin.
- **Old `.sh` cached in user's `.claude/plugins/cache/`:** After version bump, plugin cache should pull the new version (verify mechanism — out of scope here, but worth surfacing).
