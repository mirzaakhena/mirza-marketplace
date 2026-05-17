# Telegram `/context` Bridge Windows Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bash bridge script (`context-bridge.sh`) with cross-platform Bun TypeScript script so `/context` works on Windows without bash. Also fix `shortCwd` to handle Windows path separators.

**Architecture:** Rewrite the bridge as `context-bridge.ts` invoked via `bun run`. Update `CONTEXT_BRIDGE_PATH` in `server.ts` to embed the bun-run invocation as a single shell command string. Add `isOurOwnBridge` helper (exported to its own file for testability) so existing `.sh` installs migrate cleanly without self-chaining. Patch `shortCwd` to split on `[/\\]`.

**Tech Stack:** Bun runtime, TypeScript, `bun:test`, `child_process.spawnSync` for shell-chained statusLine. Spec: `docs/superpowers/specs/2026-05-17-telegram-context-bridge-windows-design.md`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `plugins/telegram/scripts/context-bridge.sh` | **Delete** | Replaced |
| `plugins/telegram/scripts/context-bridge.ts` | **Create** | Cross-platform bridge: read stdin, write `last-status.json`, chain previous statusLine |
| `plugins/telegram/scripts/context-bridge.test.ts` | **Create** | Spawn-the-script integration tests (4 cases) |
| `plugins/telegram/server-helpers.ts` | **Create** | Tiny module exporting `isOurOwnBridge` (separated for unit testability without booting server.ts) |
| `plugins/telegram/server-helpers.test.ts` | **Create** | Unit tests for `isOurOwnBridge` |
| `plugins/telegram/server.ts` | **Modify** | Update `CONTEXT_BRIDGE_PATH`, use `isOurOwnBridge` when storing `previousCommand` |
| `plugins/telegram/context-renderer.ts` | **Modify** | `shortCwd` splits on both `/` and `\` |
| `plugins/telegram/context-renderer.test.ts` | **Modify** | Add Windows-path test cases |
| `plugins/telegram/package.json` | **Modify** | Bump version `0.0.7-mirza.1` → `0.0.8-mirza.0` |

---

## Task 1: `shortCwd` cross-platform path handling

**Goal:** Make `shortCwd` correctly truncate Windows backslash paths. Forward-slash behavior preserved.

**Files:**
- Modify: `plugins/telegram/context-renderer.ts`
- Modify: `plugins/telegram/context-renderer.test.ts`

- [ ] **Step 1: Add failing tests**

In `plugins/telegram/context-renderer.test.ts`, find the existing `describe('shortCwd', ...)` block and append these tests inside it:

```typescript
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

- [ ] **Step 2: Run tests, watch the new ones fail**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: 4 new failures (existing tests still pass).

- [ ] **Step 3: Update `shortCwd` implementation**

In `plugins/telegram/context-renderer.ts`, replace the entire `shortCwd` body:

```typescript
export function shortCwd(path: string): string {
  if (!path) return ''
  const trimmed = path.replace(/[/\\]+$/, '')
  const segments = trimmed.split(/[/\\]/).filter(s => s.length > 0)
  if (segments.length < 2) return trimmed
  const tail = segments.slice(-2).join('/')
  return `…/${tail}`
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Run: `cd plugins/telegram && bun test context-renderer.test.ts`

Expected: all PASS (including the 4 new Windows-path tests AND all existing tests — old tests use forward slashes which the regex handles identically).

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "$(cat <<'EOF'
telegram: shortCwd handles Windows backslash paths

Splits on both / and \\ so Windows paths like C:\\Users\\foo\\bar are
truncated to …/foo/bar. Output always canonicalized to forward slash.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `isOurOwnBridge` helper (TDD, standalone module)

**Goal:** Detect whether a `statusLine.command` string points to any version of our own bridge script — used to avoid self-referential chaining when upgrading.

**Files:**
- Create: `plugins/telegram/server-helpers.ts`
- Create: `plugins/telegram/server-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `plugins/telegram/server-helpers.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests, confirm they fail (module doesn't exist)**

Run: `cd plugins/telegram && bun test server-helpers.test.ts`

Expected: import error / module not found.

- [ ] **Step 3: Implement `server-helpers.ts`**

Create `plugins/telegram/server-helpers.ts`:

```typescript
/**
 * Tiny helper module for server.ts logic that benefits from unit testing.
 * Lives outside server.ts because server.ts has module-level side effects
 * (env loading, bot init) that prevent direct import in tests.
 */

/**
 * Returns true if the given statusLine command string points to ANY version
 * of our own bridge script (across `.sh`, `.ts`, future extensions, and any
 * OS path separator). Used during install to avoid storing an old version
 * of ourselves as the chained previous-statusLine command.
 */
export function isOurOwnBridge(cmd: string): boolean {
  if (!cmd || !cmd.trim()) return false
  const normalized = cmd.replace(/\\/g, '/').toLowerCase()
  return /\/telegram\/scripts\/context-bridge\.[a-z0-9]+/.test(normalized)
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Run: `cd plugins/telegram && bun test server-helpers.test.ts`

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/server-helpers.ts plugins/telegram/server-helpers.test.ts
git commit -m "$(cat <<'EOF'
telegram: add isOurOwnBridge helper for safe statusLine migration

Detects whether a statusLine command points to any version of our own
bridge (sh/ts/etc., any OS separator) so install logic avoids chaining
the previous bridge into itself.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `context-bridge.ts` cross-platform bridge

**Goal:** The new TypeScript bridge script that replaces `context-bridge.sh`. Runs under `bun run`.

**Files:**
- Create: `plugins/telegram/scripts/context-bridge.ts`

- [ ] **Step 1: Create the script**

Create `plugins/telegram/scripts/context-bridge.ts`:

```typescript
#!/usr/bin/env bun
/**
 * Telegram /context bridge — cross-platform replacement for context-bridge.sh.
 *
 * Captures Claude Code's statusLine stdin and writes
 * <project>/.claude/channels/telegram/last-status.json atomically, then
 * chains to the user's previous statusLine command if any (via the
 * platform's default shell — cmd.exe on Windows, /bin/sh on Unix).
 *
 * Runs under `bun run` so it works on any OS where bun runs.
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

// Parse payload defensively — write null payload on bad input rather than crashing.
const payload = (() => {
  try { return JSON.parse(input) } catch { return null }
})()
const out = { captured_at_ms: Date.now(), payload }

// Atomic write via temp + rename.
const tmp = `${stateFile}.tmp.${process.pid}`
writeFileSync(tmp, JSON.stringify(out))
renameSync(tmp, stateFile)

// Chain to previous statusLine command if present.
if (existsSync(chainFile)) {
  const chain = readFileSync(chainFile, 'utf8').trim()
  if (chain) {
    spawnSync(chain, { input, stdio: ['pipe', 'inherit', 'inherit'], shell: true })
  }
}
```

- [ ] **Step 2: Manual sanity-run**

Run a quick smoke test from the terminal:

```bash
cd plugins/telegram
TMPDIR_PROJ=$(mktemp -d)
echo '{"context_window":{"used_percentage":42}}' | CLAUDE_PROJECT_DIR="$TMPDIR_PROJ" bun run scripts/context-bridge.ts
cat "$TMPDIR_PROJ/.claude/channels/telegram/last-status.json"
rm -rf "$TMPDIR_PROJ"
```

Expected: prints JSON with `captured_at_ms` and `payload.context_window.used_percentage = 42`.

- [ ] **Step 3: Commit (no automated test yet — added in Task 4)**

```bash
git add plugins/telegram/scripts/context-bridge.ts
git commit -m "$(cat <<'EOF'
telegram: add cross-platform context-bridge.ts (bun run)

Replaces context-bridge.sh with a TypeScript script invoked via bun run,
so /context works on Windows without bash. Behavior parity: read stdin,
write last-status.json atomically, chain to previous statusLine via the
platform's default shell.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Integration tests for `context-bridge.ts`

**Goal:** Lock the bridge behavior with spawn-the-script tests covering happy path, missing env, invalid JSON, and chaining.

**Files:**
- Create: `plugins/telegram/scripts/context-bridge.test.ts`

- [ ] **Step 1: Write the tests**

Create `plugins/telegram/scripts/context-bridge.test.ts`:

```typescript
import { test, expect, describe } from 'bun:test'
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs'
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

describe('context-bridge.ts', () => {
  test('writes last-status.json with captured payload', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const payload = { context_window: { used_percentage: 42 } }
      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, JSON.stringify(payload))
      expect(r.status).toBe(0)
      const out = JSON.parse(
        readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8')
      )
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
      const out = JSON.parse(
        readFileSync(join(proj, '.claude/channels/telegram/last-status.json'), 'utf8')
      )
      expect(out.payload).toBeNull()
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })

  test('chains to previous statusline command via shell', () => {
    const proj = mkdtempSync(join(tmpdir(), 'ctx-bridge-'))
    try {
      const stateDir = join(proj, '.claude/channels/telegram')
      const sentinelOut = join(proj, 'sentinel.out')
      // Cross-platform: a shell command that echoes the bridge's stdin to a file.
      // On Unix `cat > file`. On Windows cmd: `more > file` (or `findstr "^" > file`).
      const chainCmd = process.platform === 'win32'
        ? `more > "${sentinelOut}"`
        : `cat > "${sentinelOut}"`
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, 'chained-statusline'), chainCmd)

      const r = runBridge({ CLAUDE_PROJECT_DIR: proj }, '{"a":1}')
      expect(r.status).toBe(0)
      expect(existsSync(sentinelOut)).toBe(true)
      const sentContent = readFileSync(sentinelOut, 'utf8').trim()
      expect(sentContent).toBe('{"a":1}')
    } finally {
      rmSync(proj, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run tests, confirm all pass**

Run: `cd plugins/telegram && bun test scripts/context-bridge.test.ts`

Expected: 4 PASS.

If the chaining test fails on macOS due to `more` vs `cat` shell quirks, the implementation should still be correct — the test selects `cat` for Unix.

- [ ] **Step 3: Commit**

```bash
git add plugins/telegram/scripts/context-bridge.test.ts
git commit -m "$(cat <<'EOF'
telegram: integration tests for context-bridge.ts

Spawn-the-script tests covering happy path, missing CLAUDE_PROJECT_DIR,
invalid JSON, and chaining to previous statusLine via shell.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `server.ts` to use new bridge + helper

**Goal:** Swap `CONTEXT_BRIDGE_PATH` to the bun-run invocation; use `isOurOwnBridge` to avoid self-chaining during install.

**Files:**
- Modify: `plugins/telegram/server.ts`

- [ ] **Step 1: Update imports and `CONTEXT_BRIDGE_PATH`**

In `plugins/telegram/server.ts`, find this line (around 821 after recent changes):

```typescript
const CONTEXT_BRIDGE_PATH = join(import.meta.dir, 'scripts', 'context-bridge.sh')
```

Replace with:

```typescript
const CONTEXT_BRIDGE_SCRIPT = join(import.meta.dir, 'scripts', 'context-bridge.ts')
const CONTEXT_BRIDGE_PATH = `bun run "${CONTEXT_BRIDGE_SCRIPT}"`
```

Also add this import near the other local imports (around line 28-29 area, next to `import { renderContextReply, ... } from './context-renderer.ts'`):

```typescript
import { isOurOwnBridge } from './server-helpers.ts'
```

- [ ] **Step 2: Update `ensureContextBridgeInstalled` previous-command capture**

Find this line (inside `ensureContextBridgeInstalled`, after the early-return for `already-installed`):

```typescript
const previousCommand = typeof current.command === 'string' ? current.command : null
```

Replace with:

```typescript
const previousCommand =
  typeof current.command === 'string' && !isOurOwnBridge(current.command)
    ? current.command
    : null
```

- [ ] **Step 3: Run plugin test suite**

Run: `cd plugins/telegram && bun test`

Expected: all tests PASS. The existing `server-boot.test.ts` will verify the server still compiles and boots.

- [ ] **Step 4: Type-check build**

Run: `cd plugins/telegram && bun build server.ts --outdir /tmp/task5-bridge-check --target bun`

Expected: build succeeds. Delete `/tmp/task5-bridge-check` after.

- [ ] **Step 5: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "$(cat <<'EOF'
telegram: point CONTEXT_BRIDGE_PATH to bun run context-bridge.ts

Replaces the .sh path with a bun-run invocation. Uses isOurOwnBridge to
detect existing installs of the old .sh (or any future bridge version)
and skip them when capturing previousCommand for chaining.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Remove obsolete `context-bridge.sh`

**Goal:** Delete the now-unused bash script.

**Files:**
- Delete: `plugins/telegram/scripts/context-bridge.sh`

- [ ] **Step 1: Verify no remaining references**

Run:

```bash
grep -rn "context-bridge\.sh" plugins/telegram/ --include="*.ts" --include="*.js" --include="*.md"
```

Expected: zero matches (the only reference would be in `context-bridge.test.sh` if any — there should be none since we never had one).

Run:

```bash
grep -rn "context-bridge\.sh" docs/superpowers/specs/2026-05-17-telegram-context-bridge-windows-design.md
```

Expected: matches only in the spec doc itself (acceptable — that's the spec describing the change).

- [ ] **Step 2: Delete the file**

```bash
git rm plugins/telegram/scripts/context-bridge.sh
```

- [ ] **Step 3: Run full plugin test suite**

Run: `cd plugins/telegram && bun test`

Expected: all PASS (no test depended on the .sh file existing).

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
telegram: remove obsolete context-bridge.sh

Replaced by context-bridge.ts (cross-platform). No code path references
the old script anymore.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Bump plugin version

**Goal:** Bump version so users can pull the fix via plugin update.

**Files:**
- Modify: `plugins/telegram/package.json`

- [ ] **Step 1: Read current version**

```bash
grep '"version"' plugins/telegram/package.json
```

Expected output: `"version": "0.0.7-mirza.1"` (or whatever the current value is — confirm before editing).

- [ ] **Step 2: Update version**

Edit `plugins/telegram/package.json` — change the `"version"` line from `"0.0.7-mirza.1"` to `"0.0.8-mirza.0"`. Keep all surrounding fields untouched.

- [ ] **Step 3: Run tests to ensure nothing references the old version literal**

Run: `cd plugins/telegram && bun test`

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/telegram/package.json
git commit -m "$(cat <<'EOF'
telegram: bump version to 0.0.8-mirza.0

Includes Windows compatibility fix for /context bridge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification

**Goal:** End-to-end check that everything compiles, all tests pass, and the new bridge produces the expected `last-status.json` shape.

- [ ] **Step 1: Run all plugin tests**

Run: `cd plugins/telegram && bun test`

Expected: all suites PASS. Test count should be: 88 (previous total) + 4 new bridge tests + 4 new shortCwd tests + 9 new helper tests = 105 total. Confirm.

- [ ] **Step 2: Build server**

Run: `cd plugins/telegram && bun build server.ts --outdir /tmp/final-bridge-check --target bun && rm -rf /tmp/final-bridge-check`

Expected: build succeeds.

- [ ] **Step 3: Smoke test the bridge end-to-end**

```bash
cd plugins/telegram
TMPDIR_PROJ=$(mktemp -d)
echo '{"session_id":"abc12345","cwd":"/x/y/z","context_window":{"used_percentage":12,"total_input_tokens":5000,"context_window_size":200000},"rate_limits":{"five_hour":{"used_percentage":3,"resets_at":'$(($(date +%s) + 7200))'}}}' \
  | CLAUDE_PROJECT_DIR="$TMPDIR_PROJ" bun run scripts/context-bridge.ts
cat "$TMPDIR_PROJ/.claude/channels/telegram/last-status.json" | head -1
rm -rf "$TMPDIR_PROJ"
```

Expected: prints JSON containing `"captured_at_ms"` and the payload fields, no errors.

- [ ] **Step 4: No commit needed — verification only**

---

## Cross-Task Notes

- **TDD discipline:** Tasks 1, 2, 4 follow strict TDD (red → green). Task 3 (script creation) writes the bridge first, then Task 4 adds tests for it — done in that order because writing the integration test framework requires the script to exist. Acceptable deviation.
- **No README update:** Spec is silent on README; user can address if desired in follow-up. The plugin's own behavior is documented in code comments and the spec.
