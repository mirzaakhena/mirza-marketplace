# Bot Commands Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Telegram plugin command surface from 9 to 7. Move `/context`'s rich output into `/status` (extended with current session name and a plugin-version line). Introduce a single command registry as source of truth for `/help` and BotFather's slash-menu. Redesign `/start` to show paired identity. Delete `/hello` and `/context`. All bot UI strings touched by this change become English.

**Architecture:** A new pure module `commands-registry.ts` lists each command's `menuHint`, `helpSummary`, and `helpDetail`. Three small consumers read from it: (a) `setMyCommands` at boot, (b) `/help` no-args list, (c) `/help <name>` detail. The existing `renderContextReply` in `context-renderer.ts` is extended (new optional `sessionName` and `pluginVersion` params) and its Indonesian strings translated to English. Two new I/O helpers are added: `plugin-version.ts` reads `package.json` + `git rev-parse --short HEAD` at boot; `current-session-info.ts` resolves the wrapper's current session id and looks up its name in the existing `session-names-registry`. `server.ts` is then refactored: `/help`, `/start` (paired branch), and `/status` rewritten; `/hello` and `/context` handler blocks deleted; setMyCommands array replaced with `registry.toSetMyCommandsPayload()`.

**Tech Stack:** TypeScript, Bun runtime, `bun:test`, grammy (`^1.21.0`), Node `fs`/`child_process`.

**Spec:** `plugins/telegram/docs/2026-05-20-bot-commands-redesign.md` — read before starting.

**Note on paths:** All paths in this plan are relative to `plugins/telegram/` unless otherwise specified.

---

## File structure

**New files:**
- `commands-registry.ts` — `CommandSpec` interface, `COMMANDS` const, pure renderers (`renderHelpList`, `renderHelpDetail`, `toSetMyCommandsPayload`).
- `commands-registry.test.ts`
- `plugin-version.ts` — `readPluginVersion(pluginDir)` reads `package.json` + tries `git rev-parse --short HEAD`; `formatPluginVersionLine(name, version, sha?)` pure formatter.
- `plugin-version.test.ts`
- `current-session-info.ts` — `readCurrentSessionId(env)` (reads `<state>/wrapper.current_session_id`), `resolveCurrentSessionName(sessionId, telegramStateDir)` (consults `session-names-registry`).
- `current-session-info.test.ts`

**Modified files:**
- `context-renderer.ts` — extend `renderContextReply` signature with `sessionName?` and `pluginVersion?` params; translate Indonesian relative-time and placeholder strings to English.
- `context-renderer.test.ts` — update existing assertions to English equivalents; add cases for `sessionName` and `pluginVersion`.
- `server.ts` — refactor `/help`, `/start`, `/status`; delete `/hello`, `/context`; rewrite `setMyCommands` block to read from registry.

**Deleted code (within `server.ts`):**
- `bot.command('hello', ...)` block at `server.ts:915-918`
- `bot.command('context', ...)` block at `server.ts:1016-1051` (the helper `ensureContextBridgeInstalled` and `loadLastStatus` stay — `/status` calls them).

---

## Task 1: Create commands-registry skeleton

**Files:**
- Create: `commands-registry.ts`
- Create: `commands-registry.test.ts`

- [ ] **Step 1.1: Write the failing test**

Write `commands-registry.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { COMMANDS, type CommandSpec } from './commands-registry'

describe('COMMANDS registry', () => {
  test('contains exactly the 7 commands in the spec, in display order', () => {
    expect(COMMANDS.map(c => c.name)).toEqual([
      'start',
      'help',
      'status',
      'new',
      'switch',
      'delete',
      'rename',
    ])
  })

  test('every command has non-empty menuHint, helpSummary, helpDetail', () => {
    for (const c of COMMANDS) {
      expect(c.menuHint.length).toBeGreaterThan(0)
      expect(c.helpSummary.length).toBeGreaterThan(0)
      expect(c.helpDetail.length).toBeGreaterThan(0)
    }
  })

  test('menuHint stays under 50 chars (BotFather soft limit, mobile readability)', () => {
    for (const c of COMMANDS) {
      expect(c.menuHint.length).toBeLessThanOrEqual(50)
    }
  })
})
```

- [ ] **Step 1.2: Run test, expect failure**

Run: `bun test commands-registry.test.ts`
Expected: FAIL — `commands-registry` module not found.

- [ ] **Step 1.3: Create the module**

Write `commands-registry.ts`:

```ts
/**
 * Single source of truth for the Telegram plugin's slash-commands.
 *
 * Consumed by:
 *   - server.ts setMyCommands at boot (BotFather slash-menu)
 *   - /help no-args (lists summaries)
 *   - /help <name> (shows the detail for one command)
 *
 * Adding a command: append a CommandSpec. Removing a command: delete the
 * entry AND the handler in server.ts/meta-commands.ts. Renaming: keep this
 * file aligned with the actual handler name.
 */

export interface CommandSpec {
  /** Command word without the leading slash. Lowercase, no whitespace. */
  name: string
  /** Shown in BotFather's slash-menu next to the command. Keep terse. */
  menuHint: string
  /** One-line summary shown in /help (no-args). */
  helpSummary: string
  /** Full prose shown in /help <name>: what it does, examples, troubleshooting. */
  helpDetail: string
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'start',
    menuHint: 'Welcome and pairing guide',
    helpSummary: 'Onboarding & paired identity',
    helpDetail:
      'Shows the welcome message. If you are not paired yet, you get pairing instructions and a 6-character code. If you are paired, it shows who you are paired as, the project directory, and the current session name.',
  },
  {
    name: 'help',
    menuHint: 'Bot intro and command list',
    helpSummary: 'List commands; /help <name> for detail',
    helpDetail:
      'With no argument, lists every command with a one-line summary. With a command name (for example: /help status), shows the full help for that command, including examples and troubleshooting tips.',
  },
  {
    name: 'status',
    menuHint: 'Context window and session info',
    helpSummary: 'Context, rate limits, session info, plugin version',
    helpDetail:
      'Shows the active Claude Code session\'s context-window usage, 5-hour and 7-day rate-limit usage, model, session id and name, working directory, cost, thinking mode, fast mode, and the plugin version. On the very first call it installs a statusLine bridge into <project>/.claude/settings.json so Claude Code can publish these stats. Troubleshooting: if the "⏳ Installing bridge..." message persists past 15 seconds, make sure Claude Code is running in the project directory.',
  },
  {
    name: 'new',
    menuHint: 'Start a fresh named session',
    helpSummary: 'Start a fresh named Claude session',
    helpDetail:
      'Clears the current session and creates a fresh one with the given name. Usage: /new <name>. Example: /new discuss MCP. The wrapper (mirza-cc) must be running; otherwise the command replies with an error.',
  },
  {
    name: 'switch',
    menuHint: 'Pick different session to talk to',
    helpSummary: 'Switch the active Claude session',
    helpDetail:
      'Shows an inline picker of project sessions. Tapping one resumes that session in Claude Code. Requires the mirza-cc wrapper to be running.',
  },
  {
    name: 'delete',
    menuHint: 'Delete a session',
    helpSummary: 'Delete a Claude session',
    helpDetail:
      'Shows an inline picker of non-current sessions; tapping one asks for confirmation, then deletes that session\'s jsonl file. The currently active session is excluded from the picker.',
  },
  {
    name: 'rename',
    menuHint: 'Rename the current session',
    helpSummary: 'Rename the active session',
    helpDetail:
      'Renames the currently active session. Usage: /rename <name>. Example: /rename main. Names must be unique within the project; the command rejects duplicates.',
  },
]
```

- [ ] **Step 1.4: Run test, expect pass**

Run: `bun test commands-registry.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 1.5: Commit**

```bash
git add plugins/telegram/commands-registry.ts plugins/telegram/commands-registry.test.ts
git commit -m "feat(telegram): add commands-registry as source of truth for slash menu"
```

---

## Task 2: Add toSetMyCommandsPayload helper

**Files:**
- Modify: `commands-registry.ts`
- Modify: `commands-registry.test.ts`

- [ ] **Step 2.1: Write the failing test**

Append to `commands-registry.test.ts`:

```ts
import { toSetMyCommandsPayload } from './commands-registry'

describe('toSetMyCommandsPayload', () => {
  test('maps each spec to {command, description}', () => {
    const payload = toSetMyCommandsPayload()
    expect(payload).toHaveLength(COMMANDS.length)
    expect(payload[0]).toEqual({
      command: 'start',
      description: 'Welcome and pairing guide',
    })
  })

  test('preserves COMMANDS order', () => {
    const payload = toSetMyCommandsPayload()
    expect(payload.map(p => p.command)).toEqual(COMMANDS.map(c => c.name))
  })
})
```

- [ ] **Step 2.2: Run test, expect failure**

Run: `bun test commands-registry.test.ts`
Expected: FAIL — `toSetMyCommandsPayload` not exported.

- [ ] **Step 2.3: Add the function**

Append to `commands-registry.ts`:

```ts
/** Maps the registry to grammy's setMyCommands payload shape. */
export function toSetMyCommandsPayload(): { command: string; description: string }[] {
  return COMMANDS.map(c => ({ command: c.name, description: c.menuHint }))
}
```

- [ ] **Step 2.4: Run test, expect pass**

Run: `bun test commands-registry.test.ts`
Expected: PASS — 5 tests total.

- [ ] **Step 2.5: Commit**

```bash
git add plugins/telegram/commands-registry.ts plugins/telegram/commands-registry.test.ts
git commit -m "feat(telegram): add toSetMyCommandsPayload helper"
```

---

## Task 3: Add renderHelpList helper

**Files:**
- Modify: `commands-registry.ts`
- Modify: `commands-registry.test.ts`

- [ ] **Step 3.1: Write the failing test**

Append to `commands-registry.test.ts`:

```ts
import { renderHelpList } from './commands-registry'

describe('renderHelpList', () => {
  const out = renderHelpList()

  test('starts with the intro paragraph', () => {
    expect(out.startsWith('This bot bridges Telegram')).toBe(true)
  })

  test('lists every command with its helpSummary', () => {
    for (const c of COMMANDS) {
      expect(out).toContain(`/${c.name}`)
      expect(out).toContain(c.helpSummary)
    }
  })

  test('ends with the troubleshooting tail', () => {
    expect(out).toContain('Bot not responding?')
  })

  test('mentions the /help <name> hint', () => {
    expect(out).toContain('/help <command>')
  })
})
```

- [ ] **Step 3.2: Run test, expect failure**

Run: `bun test commands-registry.test.ts`
Expected: FAIL — `renderHelpList` not exported.

- [ ] **Step 3.3: Add the function**

Append to `commands-registry.ts`:

```ts
const HELP_INTRO =
  'This bot bridges Telegram to a Claude Code session. ' +
  'Text and photos you send here are forwarded to your paired session; ' +
  'replies and reactions come back.'

const HELP_TROUBLESHOOTING_TAIL =
  'Bot not responding? Send any DM to check your pairing status.'

/** Renders the /help (no-args) reply: intro + command list + troubleshooting tail. */
export function renderHelpList(): string {
  const list = COMMANDS.map(c => `/${c.name} — ${c.helpSummary}`).join('\n')
  return [
    HELP_INTRO,
    `Available commands:\n${list}`,
    'Type /help <command> for detail.',
    HELP_TROUBLESHOOTING_TAIL,
  ].join('\n\n')
}
```

- [ ] **Step 3.4: Run test, expect pass**

Run: `bun test commands-registry.test.ts`
Expected: PASS — 9 tests total.

- [ ] **Step 3.5: Commit**

```bash
git add plugins/telegram/commands-registry.ts plugins/telegram/commands-registry.test.ts
git commit -m "feat(telegram): add renderHelpList for /help no-args output"
```

---

## Task 4: Add renderHelpDetail helper

**Files:**
- Modify: `commands-registry.ts`
- Modify: `commands-registry.test.ts`

- [ ] **Step 4.1: Write the failing test**

Append to `commands-registry.test.ts`:

```ts
import { renderHelpDetail } from './commands-registry'

describe('renderHelpDetail', () => {
  test('returns the helpDetail for an exact match (lowercase)', () => {
    const out = renderHelpDetail('status')
    expect(out).not.toBeNull()
    expect(out).toContain('context-window usage')
  })

  test('accepts a leading slash', () => {
    expect(renderHelpDetail('/status')).toBe(renderHelpDetail('status'))
  })

  test('is case-insensitive', () => {
    expect(renderHelpDetail('STATUS')).toBe(renderHelpDetail('status'))
  })

  test('returns null for an unknown command', () => {
    expect(renderHelpDetail('nope')).toBeNull()
    expect(renderHelpDetail('')).toBeNull()
  })

  test('prefixes the body with the command name as a header', () => {
    const out = renderHelpDetail('rename')!
    expect(out.startsWith('/rename')).toBe(true)
  })
})
```

- [ ] **Step 4.2: Run test, expect failure**

Run: `bun test commands-registry.test.ts`
Expected: FAIL — `renderHelpDetail` not exported.

- [ ] **Step 4.3: Add the function**

Append to `commands-registry.ts`:

```ts
/**
 * Renders /help <name> for one command, or null if no command matches.
 * Tolerates leading slash and any case in the argument.
 */
export function renderHelpDetail(arg: string): string | null {
  const key = arg.trim().toLowerCase().replace(/^\//, '')
  if (!key) return null
  const spec = COMMANDS.find(c => c.name === key)
  if (!spec) return null
  return `/${spec.name} — ${spec.helpSummary}\n\n${spec.helpDetail}`
}
```

- [ ] **Step 4.4: Run test, expect pass**

Run: `bun test commands-registry.test.ts`
Expected: PASS — 14 tests total.

- [ ] **Step 4.5: Commit**

```bash
git add plugins/telegram/commands-registry.ts plugins/telegram/commands-registry.test.ts
git commit -m "feat(telegram): add renderHelpDetail for /help <name>"
```

---

## Task 5: Create plugin-version module (pure formatter)

**Files:**
- Create: `plugin-version.ts`
- Create: `plugin-version.test.ts`

- [ ] **Step 5.1: Write the failing test**

Write `plugin-version.test.ts`:

```ts
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
```

- [ ] **Step 5.2: Run test, expect failure**

Run: `bun test plugin-version.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Create the module with the pure formatter**

Write `plugin-version.ts`:

```ts
/**
 * Resolves the telegram plugin's identity for the /status footer.
 *
 * Two-layer split:
 *   - formatPluginVersionLine — pure, easy to test.
 *   - readPluginVersion — I/O: reads package.json and tries git rev-parse.
 *     Falls back gracefully when git isn't available or the plugin isn't
 *     in a git checkout (marketplace install path).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

export interface PluginVersion {
  name: string
  version: string
  /** Short git sha, or null if unresolvable. */
  sha: string | null
}

export function formatPluginVersionLine(
  name: string,
  version: string,
  sha: string | null,
): string {
  const tail = sha && sha.length > 0 ? ` (${sha})` : ''
  return `Plugin: ${name} v${version}${tail}`
}
```

- [ ] **Step 5.4: Run test, expect pass**

Run: `bun test plugin-version.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5.5: Commit**

```bash
git add plugins/telegram/plugin-version.ts plugins/telegram/plugin-version.test.ts
git commit -m "feat(telegram): add formatPluginVersionLine pure formatter"
```

---

## Task 6: Add readPluginVersion I/O loader

**Files:**
- Modify: `plugin-version.ts`
- Modify: `plugin-version.test.ts`

- [ ] **Step 6.1: Write the failing test**

Append to `plugin-version.test.ts`:

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPluginVersion } from './plugin-version'

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
```

- [ ] **Step 6.2: Run test, expect failure**

Run: `bun test plugin-version.test.ts`
Expected: FAIL — `readPluginVersion` not exported.

- [ ] **Step 6.3: Add the function**

Append to `plugin-version.ts`:

```ts
/**
 * Reads the plugin's name+version from <pluginDir>/package.json and tries
 * to capture a short git sha by running `git rev-parse --short HEAD` in
 * pluginDir. Every failure mode falls back silently to "unknown" / null —
 * this runs at boot in user environments where git may not exist.
 */
export function readPluginVersion(pluginDir: string): PluginVersion {
  let name = 'unknown'
  let version = 'unknown'
  try {
    const raw = readFileSync(join(pluginDir, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown }
    if (typeof parsed.name === 'string') name = parsed.name
    if (typeof parsed.version === 'string') version = parsed.version
  } catch {
    /* fall through with defaults */
  }

  let sha: string | null = null
  try {
    const out = execSync('git rev-parse --short HEAD', {
      cwd: pluginDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 1000,
    }).trim()
    if (/^[0-9a-f]{4,40}$/.test(out)) sha = out
  } catch {
    /* not a repo, no git, or other — sha stays null */
  }

  return { name, version, sha }
}
```

- [ ] **Step 6.4: Run test, expect pass**

Run: `bun test plugin-version.test.ts`
Expected: PASS — 6 tests total.

- [ ] **Step 6.5: Commit**

```bash
git add plugins/telegram/plugin-version.ts plugins/telegram/plugin-version.test.ts
git commit -m "feat(telegram): add readPluginVersion I/O loader"
```

---

## Task 7: Create current-session-info module

**Files:**
- Create: `current-session-info.ts`
- Create: `current-session-info.test.ts`

- [ ] **Step 7.1: Write the failing test**

Write `current-session-info.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readCurrentSessionId,
  resolveCurrentSessionName,
} from './current-session-info'

describe('readCurrentSessionId', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'csi-proj-'))
  })

  afterEach(() => {
    try { rmSync(projectDir, { recursive: true, force: true }) } catch {}
  })

  test('returns the session id when wrapper.current_session_id exists', () => {
    const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
    mkdirSync(ptyDir, { recursive: true })
    writeFileSync(join(ptyDir, 'wrapper.current_session_id'), 'abc-123-def\n')
    const sid = readCurrentSessionId({ CLAUDE_PROJECT_DIR: projectDir })
    expect(sid).toBe('abc-123-def')
  })

  test('returns null when the file is missing', () => {
    expect(readCurrentSessionId({ CLAUDE_PROJECT_DIR: projectDir })).toBeNull()
  })

  test('returns null when CLAUDE_PROJECT_DIR is unset', () => {
    expect(readCurrentSessionId({})).toBeNull()
  })

  test('honors PTY_CONTROLLER_STATE_DIR override', () => {
    const explicit = mkdtempSync(join(tmpdir(), 'csi-pty-'))
    try {
      writeFileSync(join(explicit, 'wrapper.current_session_id'), 'sid-override')
      const sid = readCurrentSessionId({ PTY_CONTROLLER_STATE_DIR: explicit })
      expect(sid).toBe('sid-override')
    } finally {
      rmSync(explicit, { recursive: true, force: true })
    }
  })
})

describe('resolveCurrentSessionName', () => {
  let stateDir: string

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), 'csi-state-'))
  })

  afterEach(() => {
    try { rmSync(stateDir, { recursive: true, force: true }) } catch {}
  })

  test('returns null when sessionId is null', () => {
    expect(resolveCurrentSessionName(null, stateDir)).toBeNull()
  })

  test('returns null when session has no registered name', () => {
    expect(resolveCurrentSessionName('unknown-sid', stateDir)).toBeNull()
  })

  test('returns the name when registered', () => {
    writeFileSync(
      join(stateDir, 'session-names.json'),
      JSON.stringify({ 'sid-x': { name: 'main', updatedAt: 100 } }),
    )
    expect(resolveCurrentSessionName('sid-x', stateDir)).toBe('main')
  })
})
```

- [ ] **Step 7.2: Run test, expect failure**

Run: `bun test current-session-info.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Create the module**

Write `current-session-info.ts`:

```ts
/**
 * Resolves the currently-active Claude Code session for the /status footer.
 *
 * Two layers:
 *   - readCurrentSessionId: reads <pty-state>/wrapper.current_session_id,
 *     the same file meta-commands.ts uses to drive /rename and /switch.
 *   - resolveCurrentSessionName: looks the sessionId up in the persistent
 *     session-names-registry to get the human-readable name.
 *
 * Both layers return null on absence rather than throwing — /status renders
 * a fallback when either is missing.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadRegistry } from './session-names-registry.ts'

/**
 * Resolve the pty-controller state directory the wrapper writes to.
 * Mirrors meta-commands.ts's resolvePtyStateDir: explicit env override
 * wins, else <CLAUDE_PROJECT_DIR>/.claude/channels/pty-controller.
 */
function resolvePtyStateDir(env: Record<string, string | undefined>): string | null {
  const explicit = env.PTY_CONTROLLER_STATE_DIR?.trim()
  if (explicit) return explicit
  const projectDir = env.CLAUDE_PROJECT_DIR?.trim()
  if (!projectDir) return null
  return join(projectDir, '.claude', 'channels', 'pty-controller')
}

/**
 * Returns the wrapper's current full session id, or null if the file is
 * missing/unreadable/empty.
 */
export function readCurrentSessionId(
  env: Record<string, string | undefined>,
): string | null {
  const dir = resolvePtyStateDir(env)
  if (!dir) return null
  const file = join(dir, 'wrapper.current_session_id')
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * Looks up `sessionId` in the persistent name registry under `telegramStateDir`.
 * Returns the registered name, or null if none.
 */
export function resolveCurrentSessionName(
  sessionId: string | null,
  telegramStateDir: string,
): string | null {
  if (!sessionId) return null
  const entry = loadRegistry(telegramStateDir).get(sessionId)
  return entry?.name ?? null
}
```

- [ ] **Step 7.4: Run test, expect pass**

Run: `bun test current-session-info.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 7.5: Commit**

```bash
git add plugins/telegram/current-session-info.ts plugins/telegram/current-session-info.test.ts
git commit -m "feat(telegram): add current-session-info resolver"
```

---

## Task 8: Extend context-renderer with sessionName and pluginVersion

**Files:**
- Modify: `context-renderer.ts`
- Modify: `context-renderer.test.ts`

- [ ] **Step 8.1: Write the failing tests**

Append to `context-renderer.test.ts`:

```ts
describe('renderContextReply — session name and plugin version', () => {
  const baseStatus: LastStatus = {
    captured_at_ms: Date.UTC(2026, 4, 17, 10, 0, 0),
    payload: {
      session_id: '76b5c187abcdef12',
      model: { display_name: 'Opus 4.7' },
    },
  }

  test('shows "Session: <name> (<shortId>)" when sessionName is provided', () => {
    const out = renderContextReply(baseStatus, Date.UTC(2026, 4, 17, 10, 0, 0), {
      sessionName: 'main',
    })
    expect(out).toContain('Session: main (76b5c187)')
  })

  test('falls back to "Session: <shortId>" when no sessionName', () => {
    const out = renderContextReply(baseStatus, Date.UTC(2026, 4, 17, 10, 0, 0))
    expect(out).toContain('Session: 76b5c187')
    expect(out).not.toContain('Session: main')
  })

  test('appends plugin version line as its own section when provided', () => {
    const out = renderContextReply(baseStatus, Date.UTC(2026, 4, 17, 10, 0, 0), {
      pluginVersion: 'Plugin: telegram v1.0.0 (abc1234)',
    })
    expect(out).toContain('Plugin: telegram v1.0.0 (abc1234)')
  })

  test('omits plugin version line when not provided', () => {
    const out = renderContextReply(baseStatus, Date.UTC(2026, 4, 17, 10, 0, 0))
    expect(out).not.toContain('Plugin:')
  })
})
```

- [ ] **Step 8.2: Run test, expect failure**

Run: `bun test context-renderer.test.ts`
Expected: FAIL — `renderContextReply` doesn't accept a third argument.

- [ ] **Step 8.3: Extend the function signature**

In `context-renderer.ts`, replace the `renderContextReply` signature and the metadata-block + last-update + Plugin section. Replace lines 84-152 (the entire `renderContextReply` body) with:

```ts
export interface RenderOptions {
  /** When set, displays "Session: <name> (<shortId>)" instead of just shortId. */
  sessionName?: string | null
  /** Pre-formatted plugin version line (or null/empty to omit). */
  pluginVersion?: string | null
}

export function renderContextReply(
  status: LastStatus,
  nowMs: number = Date.now(),
  opts: RenderOptions = {},
): string {
  const p = status.payload
  const sections: string[] = []

  // --- Context section (always shown; placeholder if missing) ---
  const ctxPct = p.context_window?.used_percentage
  const ctxLines: string[] = ['Context']
  if (typeof ctxPct === 'number') {
    ctxLines.push(`${progressBar(ctxPct)} ${Math.round(ctxPct)}%`)
    const used = p.context_window?.total_input_tokens
    const total = p.context_window?.context_window_size
    if (typeof used === 'number' && typeof total === 'number') {
      ctxLines.push(`${formatTokens(used)} / ${formatTokens(total)} tokens`)
    }
  } else {
    ctxLines.push('(unavailable)')
  }
  sections.push(ctxLines.join('\n'))

  // --- Rate Limit 5h (omit entirely if missing) ---
  const five = p.rate_limits?.five_hour
  if (five && (typeof five.used_percentage === 'number' || typeof five.resets_at === 'number')) {
    const lines = ['Rate Limit 5h']
    if (typeof five.used_percentage === 'number') {
      lines.push(`${progressBar(five.used_percentage)} ${Math.round(five.used_percentage)}%`)
    }
    if (typeof five.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(five.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Rate Limit 7d (omit entirely if missing) ---
  const seven = p.rate_limits?.seven_day
  if (seven && (typeof seven.used_percentage === 'number' || typeof seven.resets_at === 'number')) {
    const lines = ['Rate Limit 7d']
    if (typeof seven.used_percentage === 'number') {
      lines.push(`${progressBar(seven.used_percentage)} ${Math.round(seven.used_percentage)}%`)
    }
    if (typeof seven.resets_at === 'number') {
      lines.push(`reset ${formatResetRemain(seven.resets_at, nowMs)}`)
    }
    sections.push(lines.join('\n'))
  }

  // --- Metadata block (skip individual lines if missing) ---
  const meta: string[] = []
  if (p.model?.display_name) meta.push(p.model.display_name)
  if (p.session_id) {
    const short = shortSession(p.session_id)
    meta.push(opts.sessionName ? `Session: ${opts.sessionName} (${short})` : `Session: ${short}`)
  }
  if (p.cwd) meta.push(`CWD: ${shortCwd(p.cwd)}`)
  if (typeof p.cost?.total_cost_usd === 'number') {
    meta.push(`Cost: $${p.cost.total_cost_usd.toFixed(2)}`)
  }
  if (typeof p.thinking?.enabled === 'boolean') {
    meta.push(`Thinking: ${p.thinking.enabled ? 'on' : 'off'}`)
  }
  if (typeof p.fast_mode === 'boolean') {
    meta.push(`Fast: ${p.fast_mode ? 'on' : 'off'}`)
  }
  if (meta.length > 0) sections.push(meta.join('\n'))

  // --- Plugin version (only if caller provided one) ---
  if (opts.pluginVersion && opts.pluginVersion.length > 0) {
    sections.push(opts.pluginVersion)
  }

  // --- Last update (always shown) ---
  const age = nowMs - status.captured_at_ms
  sections.push(
    `Last update: ${formatJakartaHM(status.captured_at_ms)}\n(${formatRelativeMs(age)})`
  )

  return sections.join('\n\n')
}
```

- [ ] **Step 8.4: Run test, expect pass**

Run: `bun test context-renderer.test.ts`
Expected: New tests PASS. Existing tests still PASS (signature is backwards-compatible — third arg is optional).

- [ ] **Step 8.5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "feat(telegram): extend renderContextReply with sessionName and pluginVersion"
```

---

## Task 9: Translate touched Indonesian strings in context-renderer

**Files:**
- Modify: `context-renderer.ts`
- Modify: `context-renderer.test.ts`

Per spec lock §8, touched UI strings move to English. The relative-time strings become: `'just now'`, `'Xs ago'`, `'Xm ago'`, `'Xh ago'`, `'Xh Ym ago'`, the unavailable placeholder becomes `'unavailable'`, and the reset-now branch becomes `'reset just now'`.

- [ ] **Step 9.1: Update existing tests to expect English**

In `context-renderer.test.ts`, replace the existing `formatRelativeMs` describe block (lines around 32-48) with:

```ts
describe('formatRelativeMs', () => {
  test('negative → "just now"', () => {
    expect(formatRelativeMs(-1000)).toBe('just now')
  })
  test('seconds', () => {
    expect(formatRelativeMs(45_000)).toBe('45s ago')
  })
  test('minutes', () => {
    expect(formatRelativeMs(3 * 60_000)).toBe('3m ago')
  })
  test('hours with remainder', () => {
    expect(formatRelativeMs(2 * 3600_000 + 15 * 60_000)).toBe('2h 15m ago')
  })
  test('exact hours', () => {
    expect(formatRelativeMs(3 * 3600_000)).toBe('3h ago')
  })
})
```

Also, in the `renderContextReply` tests further down (search for the old unavailable placeholder and reset-now strings in the file), update any assertions to the English equivalents — `'(unavailable)'` and `'reset just now'`. Use Grep on the test file before editing to find exact lines.

- [ ] **Step 9.2: Run tests, expect failures on the touched assertions**

Run: `bun test context-renderer.test.ts`
Expected: The 5 `formatRelativeMs` tests and any unavailable-placeholder / reset-now assertions FAIL.

- [ ] **Step 9.3: Translate the renderer strings**

In `context-renderer.ts`:

Replace `formatRelativeMs` (lines 37-46) with:

```ts
export function formatRelativeMs(ageMs: number): string {
  if (ageMs < 0) return 'just now'
  const sec = Math.floor(ageMs / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  const rm = min % 60
  return rm ? `${hr}h ${rm}m ago` : `${hr}h ago`
}
```

Replace the `formatResetRemain` reset-now branch (around line 58) with:

```ts
  if (remainSec <= 0) return 'reset just now'
```

The old unavailable placeholder (already replaced in Task 8.3 with `'(unavailable)'`). If still present, change it now.

- [ ] **Step 9.4: Run tests, expect pass**

Run: `bun test context-renderer.test.ts`
Expected: All tests PASS.

- [ ] **Step 9.5: Commit**

```bash
git add plugins/telegram/context-renderer.ts plugins/telegram/context-renderer.test.ts
git commit -m "refactor(telegram): translate touched UI strings in context-renderer to English"
```

---

## Task 10: Wire setMyCommands from the registry

**Files:**
- Modify: `server.ts`

- [ ] **Step 10.1: Add the registry import**

In `server.ts`, add to the imports block (near other local imports around lines 25-34):

```ts
import { toSetMyCommandsPayload } from './commands-registry.ts'
```

- [ ] **Step 10.2: Replace the literal setMyCommands array**

In `server.ts`, locate the `setMyCommands` block at lines 1849-1862. Replace:

```ts
          void bot.api.setMyCommands(
            [
              { command: 'start', description: 'Welcome and setup guide' },
              { command: 'help', description: 'What this bot can do' },
              { command: 'status', description: 'Check your pairing status' },
              { command: 'hello', description: 'Say hello to Mirza' },
              { command: 'context', description: 'Show context & 5h usage' },
              { command: 'new', description: 'Start a fresh named session' },
              { command: 'switch', description: 'Switch Claude session' },
              { command: 'delete', description: 'Delete a session' },
              { command: 'rename', description: 'Rename current session' },
            ],
            { scope: { type: 'all_private_chats' } },
          ).catch(() => {})
```

with:

```ts
          void bot.api.setMyCommands(
            toSetMyCommandsPayload(),
            { scope: { type: 'all_private_chats' } },
          ).catch(() => {})
```

- [ ] **Step 10.3: Type-check by running bun on the file**

Run: `bun run --no-install --print server.ts < /dev/null`

(On Windows PowerShell, use `bun run --no-install --print server.ts < $null` or just `bun build server.ts --target=bun --outdir=/tmp/check` then delete.)

Easier: just rely on the test suite below.

- [ ] **Step 10.4: Run full test suite to catch regressions**

Run: `bun test`
Expected: All existing tests PASS (no logic moved into server.ts; only the literal was replaced).

- [ ] **Step 10.5: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "refactor(telegram): drive setMyCommands from commands-registry"
```

---

## Task 11: Delete /hello handler

**Files:**
- Modify: `server.ts`

- [ ] **Step 11.1: Delete the handler block**

In `server.ts`, delete lines 915-918 (the entire `/hello` handler):

```ts
bot.command('hello', async ctx => {
  if (!dmCommandGate(ctx)) return
  await ctx.reply(`Hello, Mirza!`)
})
```

- [ ] **Step 11.2: Confirm /hello no longer appears in setMyCommands**

Already true after Task 10: the registry has no `hello` entry. No further change.

- [ ] **Step 11.3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 11.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "feat(telegram): remove /hello command (was test scaffolding)"
```

---

## Task 12: Refactor /help to use the registry

**Files:**
- Modify: `server.ts`

- [ ] **Step 12.1: Add the renderer imports**

In `server.ts`, append to the registry import added in Task 10.1:

```ts
import { toSetMyCommandsPayload, renderHelpList, renderHelpDetail } from './commands-registry.ts'
```

- [ ] **Step 12.2: Replace the /help handler**

In `server.ts`, locate the `bot.command('help', ...)` block at lines 882-890. Replace the body with:

```ts
bot.command('help', async ctx => {
  if (!dmCommandGate(ctx)) return
  // grammy gives us the argument string in ctx.match for command handlers.
  const arg = (ctx.match ?? '').toString().trim()
  if (!arg) {
    await ctx.reply(renderHelpList())
    return
  }
  const detail = renderHelpDetail(arg)
  if (detail) {
    await ctx.reply(detail)
    return
  }
  await ctx.reply(
    `Unknown command: /${arg.replace(/^\//, '')}\n\nType /help to see all commands.`,
  )
})
```

- [ ] **Step 12.3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 12.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "feat(telegram): /help reads from commands-registry, supports /help <name>"
```

---

## Task 13: Refactor /start to show paired identity

**Files:**
- Modify: `server.ts`

- [ ] **Step 13.1: Add the new imports**

In `server.ts`, add to the imports block:

```ts
import { readCurrentSessionId, resolveCurrentSessionName } from './current-session-info.ts'
```

- [ ] **Step 13.2: Replace the /start handler**

In `server.ts`, locate the `bot.command('start', ...)` block at lines 871-880. Replace with:

```ts
bot.command('start', async ctx => {
  const gated = dmCommandGate(ctx)
  if (!gated) return
  const { access, senderId } = gated

  if (!access.allowFrom.includes(senderId)) {
    // Same unpaired guidance as before — pairing handshake is unchanged.
    await ctx.reply(
      `This bot bridges Telegram to a Claude Code session.\n\n` +
      `To pair:\n` +
      `1. DM me anything — you'll get a 6-char code\n` +
      `2. In Claude Code: /telegram:access pair <code>\n\n` +
      `After that, DMs here reach that session.`,
    )
    return
  }

  // Paired branch — show identity.
  const userLabel = ctx.from!.username ? `@${ctx.from!.username}` : senderId
  const projectDir = PROJECT_DIR ?? '(no project)'
  const sessionId = readCurrentSessionId(process.env as Record<string, string | undefined>)
  const sessionName = resolveCurrentSessionName(sessionId, STATE_DIR)
  const sessionLine = sessionId
    ? (sessionName ? `Session: ${sessionName} (${sessionId.slice(0, 8)})` : `Session: ${sessionId.slice(0, 8)}`)
    : 'Session: (none active)'

  await ctx.reply(
    `Welcome back. You are paired and ready.\n\n` +
    `Paired as: ${userLabel}\n` +
    `Project: ${projectDir}\n` +
    sessionLine + `\n\n` +
    `Type /help for the command list, or just send a message to talk to Claude.`,
  )
})
```

- [ ] **Step 13.3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 13.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "feat(telegram): /start paired branch shows identity"
```

---

## Task 14: Replace /status — adopt /context body + session name + plugin version

**Files:**
- Modify: `server.ts`

- [ ] **Step 14.1: Add the plugin-version import and resolve at boot**

In `server.ts`, add to imports:

```ts
import { readPluginVersion, formatPluginVersionLine } from './plugin-version.ts'
```

Then, after the `const PROJECT_DIR = ...` declaration (around line 931), add a boot-time constant:

```ts
// Resolved once at boot for the /status footer.
const PLUGIN_VERSION_LINE = (() => {
  const v = readPluginVersion(import.meta.dir)
  return formatPluginVersionLine(v.name, v.version, v.sha)
})()
```

- [ ] **Step 14.2: Replace the /status handler**

In `server.ts`, locate `bot.command('status', ...)` at lines 892-913. Replace the entire handler (including its body) with the rewritten one that mirrors today's `/context`:

```ts
bot.command('status', async ctx => {
  if (!dmCommandGate(ctx)) return

  const install = ensureContextBridgeInstalled()
  if (install.kind === 'error') {
    await ctx.reply(`Failed to install bridge:\n${install.message}`)
    return
  }

  const renderNow = () => {
    const status = loadLastStatus()
    if (!status) {
      return (
        `Bridge installed, but no data yet.\n\n` +
        `Claude Code's statusLine has not triggered. Be active in Claude Code for a moment, then send /status again.`
      )
    }
    const sessionId = readCurrentSessionId(process.env as Record<string, string | undefined>)
    const sessionName = resolveCurrentSessionName(sessionId, STATE_DIR)
    return renderContextReply(status, Date.now(), {
      sessionName,
      pluginVersion: PLUGIN_VERSION_LINE,
    })
  }

  if (install.kind === 'installed') {
    const ack = await ctx.reply('⏳ Installing bridge, please wait...')
    setTimeout(async () => {
      const text = renderNow()
      try {
        await ctx.api.editMessageText(ack.chat.id, ack.message_id, text)
      } catch {
        // Edit can fail if message was deleted or too old; fall back to a new reply.
        await ctx.reply(text)
      }
    }, 5000)
    return
  }

  // already-installed
  await ctx.reply(renderNow())
})
```

- [ ] **Step 14.3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 14.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "feat(telegram): /status takes over /context body, adds session name + plugin version"
```

---

## Task 15: Delete /context handler

**Files:**
- Modify: `server.ts`

- [ ] **Step 15.1: Translate Indonesian error strings still used by helpers**

`ensureContextBridgeInstalled` is now called from `/status`. Translate the Indonesian error strings it produces (per spec lock §8: "Existing Indonesian strings touched by this change get translated"):

In `server.ts`, in `ensureContextBridgeInstalled` (around lines 947-1014):

- Replace `'CLAUDE_PROJECT_DIR is not set; /context needs a project context. Run Claude Code from your project root.'` with `'CLAUDE_PROJECT_DIR is not set; /status needs a project context. Run Claude Code from your project root.'`
- Replace the old "invalid JSON" error with `\`${settingsPath} is not valid JSON (comments?). Fix manually and try again. (${(err as Error).message})\``
- Replace the old "prepare channels dir failed" error with `\`failed to prepare channels dir: ${giResult.reason ?? 'unknown error'}\``
- Replace the old "write STATE_DIR failed" error with `\`failed to write ${STATE_DIR}: ${(err as Error).message}\``
- Replace the old "write settingsPath failed" error with `\`failed to write ${settingsPath}: ${(err as Error).message}\``

- [ ] **Step 15.2: Delete the /context handler block**

In `server.ts`, delete the entire `bot.command('context', ...)` block (now around lines 1016-1051 — the line numbers may have shifted slightly after prior edits; grep to confirm).

The block to remove:

```ts
bot.command('context', async ctx => {
  if (!dmCommandGate(ctx)) return

  const install = ensureContextBridgeInstalled()
  // ... ~35 lines ...
  await ctx.reply(renderContextReply(status))
})
```

Also delete or downgrade the comment header at lines 920-926 (the "`/context — surface Claude Code's context window...`" block) since it's stale. Replace with a one-liner above `loadLastStatus`:

```ts
// /status helper: load the most recent statusLine payload (written by
// scripts/context-bridge.ts). Returns null if Claude Code hasn't run yet.
```

- [ ] **Step 15.3: Run full test suite**

Run: `bun test`
Expected: All tests PASS.

- [ ] **Step 15.4: Commit**

```bash
git add plugins/telegram/server.ts
git commit -m "feat(telegram): remove /context (replaced by /status)"
```

---

## Task 16: Manual smoke test

This is an end-to-end check. The plugin runs as part of a live Claude Code session that has the Telegram bot paired to a Telegram chat.

- [ ] **Step 16.1: Restart the plugin host**

From Claude Code, exit and re-enter so the MCP server starts a fresh `server.ts` with the new code.

- [ ] **Step 16.2: Verify BotFather slash-menu**

Open the bot in Telegram, type `/`. Confirm the menu shows exactly 7 commands, in order:

```
/start    Welcome and pairing guide
/help     Bot intro and command list
/status   Context window and session info
/new      Start a fresh named session
/switch   Pick different session to talk to
/delete   Delete a session
/rename   Rename the current session
```

If you still see `/hello` or `/context`, Telegram is showing a cached menu. Quit and reopen the Telegram client; the menu is fetched fresh on each chat-open.

- [ ] **Step 16.3: /help no-args**

Send `/help` in the bot DM. Confirm:

- Intro paragraph ("This bot bridges...").
- All 7 commands listed with their `helpSummary`.
- "Type /help <command> for detail." line.
- Troubleshooting tail: "Bot not responding?..."

- [ ] **Step 16.4: /help <name>**

Send `/help status`. Confirm a multi-paragraph reply with the long detail. Send `/help /status` (with leading slash) and confirm the same output. Send `/help nope` and confirm the "Unknown command" fallback.

- [ ] **Step 16.5: /start when paired**

Send `/start`. Confirm: "Welcome back. You are paired and ready." with `Paired as:`, `Project:`, and `Session:` lines.

- [ ] **Step 16.6: /status**

Send `/status`. Confirm:

- Context bar, rate-limit bars, model line.
- `Session: <name> (<shortId>)` if the active session has a registered name; `Session: <shortId>` otherwise.
- `Plugin: telegram v<version> (<sha?>)` line.
- `Last update:` with English relative time (e.g. `(3m ago)`).

If this is the first `/status` since the new build, the "⏳ Installing bridge..." ack should appear briefly, then edit into the data.

- [ ] **Step 16.7: /hello and /context return unknown-command**

Send `/hello`. Telegram should silently do nothing (grammy doesn't auto-reply to unknown commands). Same for `/context`. This is the intended clean-break behavior per spec lock §8.

- [ ] **Step 16.8: Meta-commands still work**

Send `/new test-run`, then `/switch`, then `/rename smoke`, then `/delete`. Confirm each behaves as before — this plan does not change meta-command behavior, only their `/help` coverage.

- [ ] **Step 16.9: If anything is wrong**

Roll back the offending commit, file an issue noting the failing step.

---

## Self-review

After the last commit, do a single pass to verify:

1. **Spec coverage.** Spec §3.1 `/hello` removed (Task 11). §3.2 `/help` registry-driven (Tasks 1-4, 12). §3.3 `/status` adopts /context body + sessionName + version (Task 14). §3.4 `/context` removed (Task 15). §3.5 `/start` shows identity when paired (Task 13). §3.6 meta-commands unchanged (verified at Task 16.8). §4 bridge install fires on /status first call (Task 14). §5 `/version` folded into /status (Task 14). §6 menu hints match the table (Task 1 + Task 10). §6.1 /help structure matches (Tasks 3, 4, 12). §8 lock items all satisfied.
2. **No placeholders.** Search the implementation files for `TODO`, `TBD`, `FIXME`. Expected: none.
3. **Type consistency.** `renderContextReply` is called from `/status` with `{ sessionName, pluginVersion }` — matches the `RenderOptions` interface from Task 8.3. `toSetMyCommandsPayload()` returns `{command, description}[]` — matches grammy's `setMyCommands` signature.
4. **String-language scan.** Run `bun test` once more and grep new + modified files for remaining Indonesian:

   Run a Grep over `plugins/telegram/{server,context-renderer,commands-registry,plugin-version,current-session-info}.ts` for common Indonesian stop-words (e.g. negation, "failed", relative-time markers).

   Expected: no matches in lines this plan modified. Pre-existing Indonesian strings in *untouched* code (e.g. `meta-commands.ts` user-facing replies) stay per spec lock §8 — out of scope this round.
