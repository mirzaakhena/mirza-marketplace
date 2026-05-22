# Bot-to-Bot Communication — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of bot-to-bot communication — a new `agent-bus` plugin that lets one bot send slash-command requests to another bot via the existing filesystem inbox, plus read-only status/list tools.

**Architecture:** New plugin `plugins/agent-bus/` exposes 3 MCP tools (`agent_list`, `agent_status`, `agent_send`). A global registry at `~/.claude/agent-registry.json` (auto-managed by each bot's pty-controller wrapper on boot/heartbeat/shutdown) lets bots discover one another. `agent_send` writes a payload to the target peer's existing `<peer-state>/pty-controller/pending/<uuid>.json` inbox — the schema is extended (backward compatible) with `from`, `kind`, `correlation_id`, `hop_count` fields. The wrapper validates `from`/`hop_count` before dispatching. No network sockets, no HMAC, no allowlist (open trust per spec sec 2). Phase 1 supports `kind: "slash"` only; `prompt` and `reply` ship in Phase 2.

**Tech Stack:** Bun runtime, TypeScript, `@modelcontextprotocol/sdk@^1.0.0`, `zod@^3.23.0` (validation), `bun:test` (unit tests). No new runtime dependencies.

**Spec reference:** `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md` (commit 1ee6f31).

---

## File Structure

**Create (new plugin `plugins/agent-bus/`):**
- `.claude-plugin/plugin.json` — plugin manifest
- `.mcp.json` — MCP server registration
- `package.json` — bun project
- `tsconfig.json` — TS config (mirror pty-controller)
- `registry.ts` — read/write `~/.claude/agent-registry.json` atomically
- `registry.test.ts` — unit tests
- `peer-status.ts` — read peer's `last-status.json` opportunistically
- `peer-status.test.ts` — unit tests
- `inbox-writer.ts` — write `agent_send` payload to peer inbox
- `inbox-writer.test.ts` — unit tests
- `server.ts` — MCP server with 3 tools
- `skills/using-agent-bus/SKILL.md` — behavior guidance for AI
- `README.md`

**Modify (existing pty-controller):**
- `plugins/pty-controller/wrapper/src/wrapper.ts` — add registry register/heartbeat/unregister; extend `consumePending` to validate `from`/`hop_count`
- `plugins/pty-controller/ipc.ts` — extend `PtyCommand` interface (backward compat optional fields)

**Test (integration):**
- `plugins/agent-bus/integration.test.ts` — 2-bot loopback (registry + send → file lands in peer inbox)

---

## Task 1: Plugin scaffold

**Files:**
- Create: `plugins/agent-bus/.claude-plugin/plugin.json`
- Create: `plugins/agent-bus/.mcp.json`
- Create: `plugins/agent-bus/package.json`
- Create: `plugins/agent-bus/tsconfig.json`
- Create: `plugins/agent-bus/README.md`

- [ ] **Step 1: Create plugin manifest**

Write `plugins/agent-bus/.claude-plugin/plugin.json`:

```json
{
  "name": "agent-bus",
  "description": "Lets one Claude Code agent send slash-command requests to another agent on the same machine via a shared filesystem registry and the existing pty-controller inbox. Depends on the companion pty-controller plugin running in both bots — the peer's wrapper reads this plugin's writes and injects the keystroke into the peer's PTY. v0.0.1 supports `kind:\"slash\"` only; prompt + reply land in Phase 2.",
  "version": "0.0.1",
  "author": { "name": "Mirza" },
  "license": "MIT",
  "keywords": ["multi-agent", "inter-agent", "bot-to-bot", "claude-code", "ipc"]
}
```

- [ ] **Step 2: Create MCP registration**

Write `plugins/agent-bus/.mcp.json`:

```json
{
  "mcpServers": {
    "agent-bus": {
      "command": "bun",
      "args": ["run", "--cwd", "${CLAUDE_PLUGIN_ROOT}", "--shell=bun", "--silent", "start"]
    }
  }
}
```

- [ ] **Step 3: Create package.json**

Write `plugins/agent-bus/package.json`:

```json
{
  "name": "agent-bus-server",
  "version": "0.0.1",
  "description": "MCP server backing the agent-bus Claude Code plugin.",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun install --no-summary && bun server.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json**

Write `plugins/agent-bus/tsconfig.json` (mirror of pty-controller wrapper's, with bun module resolution):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["bun-types"]
  }
}
```

- [ ] **Step 5: Create README**

Write `plugins/agent-bus/README.md`:

```markdown
# agent-bus

Plugin for inter-agent (bot-to-bot) communication between Claude Code instances running on the same machine.

## Tools

- `agent_list()` — list registered peers (online + offline)
- `agent_status(name)` — read peer's current session, model, context usage
- `agent_send(target, payload)` — write a slash-command request to the peer's pty-controller inbox

## Requires

- `pty-controller` plugin installed in both sender and receiver bots, running under the `mirza-cc` wrapper.
- Each wrapper auto-registers its bot into `~/.claude/agent-registry.json` on boot.

See design spec at `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md`.
```

- [ ] **Step 6: Install dependencies**

Run:
```
cd plugins/agent-bus && bun install
```
Expected: dependencies installed without error. `bun.lock` created.

- [ ] **Step 7: Commit scaffold**

Run:
```
git add plugins/agent-bus/.claude-plugin/ plugins/agent-bus/.mcp.json plugins/agent-bus/package.json plugins/agent-bus/tsconfig.json plugins/agent-bus/README.md plugins/agent-bus/bun.lock
git commit -m "feat(agent-bus): scaffold plugin manifest and bun project"
```

---

## Task 2: Registry module (write side)

**Files:**
- Create: `plugins/agent-bus/registry.ts`
- Test: `plugins/agent-bus/registry.test.ts`

- [ ] **Step 1: Write failing test for registry path resolution**

Write `plugins/agent-bus/registry.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolveRegistryPath,
  registerAgent,
  updateHeartbeat,
  unregisterAgent,
  readRegistry,
} from './registry'

describe('registry: resolveRegistryPath', () => {
  test('uses AGENT_REGISTRY_PATH env override when set', () => {
    expect(resolveRegistryPath({ AGENT_REGISTRY_PATH: '/tmp/r.json' })).toBe('/tmp/r.json')
  })

  test('defaults to ~/.claude/agent-registry.json', () => {
    const got = resolveRegistryPath({ HOME: '/home/x', USERPROFILE: '/home/x' })
    expect(got.replace(/\\/g, '/')).toBe('/home/x/.claude/agent-registry.json')
  })
})
```

- [ ] **Step 2: Run test to confirm fail**

Run: `cd plugins/agent-bus && bun test registry.test.ts`
Expected: FAIL — module `./registry` does not exist.

- [ ] **Step 3: Implement resolveRegistryPath**

Create `plugins/agent-bus/registry.ts`:

```typescript
/**
 * Global agent registry shared by all bot-to-bot peers on this machine.
 *
 * Location: ~/.claude/agent-registry.json (override via AGENT_REGISTRY_PATH).
 *
 * Writers are pty-controller wrappers (register/heartbeat/unregister on
 * boot/tick/shutdown). Readers are agent-bus MCP tools (agent_list /
 * agent_status / agent_send). Concurrent writes are serialised with a
 * file lock (`<path>.lock`) using O_EXCL semantics; atomic visibility via
 * tmp + rename.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

export interface AgentEntry {
  project_dir: string
  state_dir: string
  registered_at: string
  last_heartbeat: string
  wrapper_pid: number
}

export interface Registry {
  schema_version: 1
  agents: Record<string, AgentEntry>
}

export function resolveRegistryPath(env: Record<string, string | undefined>): string {
  const explicit = env.AGENT_REGISTRY_PATH?.trim()
  if (explicit) return explicit
  const home = env.HOME?.trim() || env.USERPROFILE?.trim()
  if (!home) throw new Error('cannot resolve home directory (HOME/USERPROFILE unset)')
  return join(home, '.claude', 'agent-registry.json')
}

const LOCK_TIMEOUT_MS = 2_000
const LOCK_RETRY_MS = 25

function acquireLock(path: string): () => void {
  const lockPath = `${path}.lock`
  const start = Date.now()
  while (true) {
    try {
      const fd = openSync(lockPath, 'wx')
      closeSync(fd)
      return () => {
        try {
          unlinkSync(lockPath)
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        throw new Error(`registry lock timeout after ${LOCK_TIMEOUT_MS}ms: ${lockPath}`)
      }
      Bun.sleepSync(LOCK_RETRY_MS)
    }
  }
}

function loadOrInit(path: string): Registry {
  if (!existsSync(path)) return { schema_version: 1, agents: {} }
  try {
    const obj = JSON.parse(readFileSync(path, 'utf8'))
    if (obj && typeof obj === 'object' && obj.schema_version === 1 && obj.agents) {
      return obj as Registry
    }
  } catch {
    /* corrupt → reset */
  }
  return { schema_version: 1, agents: {} }
}

function persist(path: string, reg: Registry): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(reg, null, 2))
  renameSync(tmp, path)
}

export function registerAgent(
  path: string,
  name: string,
  entry: Omit<AgentEntry, 'registered_at' | 'last_heartbeat'>,
): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    const now = new Date().toISOString()
    reg.agents[name] = { ...entry, registered_at: now, last_heartbeat: now }
    persist(path, reg)
  } finally {
    release()
  }
}

export function updateHeartbeat(path: string, name: string): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    const e = reg.agents[name]
    if (!e) return
    e.last_heartbeat = new Date().toISOString()
    persist(path, reg)
  } finally {
    release()
  }
}

export function unregisterAgent(path: string, name: string): void {
  const release = acquireLock(path)
  try {
    const reg = loadOrInit(path)
    if (!reg.agents[name]) return
    delete reg.agents[name]
    persist(path, reg)
  } finally {
    release()
  }
}

export function readRegistry(path: string): Registry {
  return loadOrInit(path)
}
```

- [ ] **Step 4: Run resolveRegistryPath tests**

Run: `cd plugins/agent-bus && bun test registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add tests for register/heartbeat/unregister**

Append to `plugins/agent-bus/registry.test.ts`:

```typescript
describe('registry: lifecycle', () => {
  let dir: string
  let path: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-reg-'))
    path = join(dir, 'agent-registry.json')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('registerAgent creates file and entry', () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1234,
    })
    expect(existsSync(path)).toBe(true)
    const reg = readRegistry(path)
    expect(reg.schema_version).toBe(1)
    expect(reg.agents['bot-01']?.project_dir).toBe('/p/bot-01')
    expect(reg.agents['bot-01']?.wrapper_pid).toBe(1234)
    expect(reg.agents['bot-01']?.registered_at).toBeDefined()
    expect(reg.agents['bot-01']?.last_heartbeat).toBeDefined()
  })

  test('updateHeartbeat refreshes last_heartbeat without touching registered_at', async () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1,
    })
    const before = readRegistry(path).agents['bot-01']!
    await new Promise(r => setTimeout(r, 15))
    updateHeartbeat(path, 'bot-01')
    const after = readRegistry(path).agents['bot-01']!
    expect(after.registered_at).toBe(before.registered_at)
    expect(after.last_heartbeat).not.toBe(before.last_heartbeat)
  })

  test('updateHeartbeat is no-op when agent missing', () => {
    updateHeartbeat(path, 'ghost')
    const reg = readRegistry(path)
    expect(reg.agents['ghost']).toBeUndefined()
  })

  test('unregisterAgent removes the entry', () => {
    registerAgent(path, 'bot-01', {
      project_dir: '/p/bot-01',
      state_dir: '/p/bot-01/state',
      wrapper_pid: 1,
    })
    unregisterAgent(path, 'bot-01')
    expect(readRegistry(path).agents['bot-01']).toBeUndefined()
  })

  test('readRegistry returns empty when file missing', () => {
    const reg = readRegistry(path)
    expect(reg.schema_version).toBe(1)
    expect(reg.agents).toEqual({})
  })

  test('readRegistry recovers from corrupt JSON', () => {
    writeFileSync(path, '{not valid json')
    const reg = readRegistry(path)
    expect(reg.agents).toEqual({})
  })
})
```

Add `import { writeFileSync } from 'node:fs'` to the top imports if not already present (it isn't — add it).

- [ ] **Step 6: Run all registry tests**

Run: `cd plugins/agent-bus && bun test registry.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Commit**

```
git add plugins/agent-bus/registry.ts plugins/agent-bus/registry.test.ts
git commit -m "feat(agent-bus): registry read/write with file lock + atomic persist"
```

---

## Task 3: Peer status reader (opportunistic)

**Files:**
- Create: `plugins/agent-bus/peer-status.ts`
- Test: `plugins/agent-bus/peer-status.test.ts`

- [ ] **Step 1: Write failing test**

Write `plugins/agent-bus/peer-status.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readPeerSessionInfo } from './peer-status'

describe('peer-status: readPeerSessionInfo', () => {
  let projectDir: string
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'peer-'))
    mkdirSync(join(projectDir, '.claude', 'channels', 'telegram'), { recursive: true })
    mkdirSync(join(projectDir, '.claude', 'channels', 'pty-controller'), { recursive: true })
  })
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('returns null fields when no status files exist', () => {
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe(null)
    expect(info.current_session_name).toBe(null)
    expect(info.context_used_percent).toBe(null)
    expect(info.model).toBe(null)
    expect(info.effort_level).toBe(null)
  })

  test('reads session_id from wrapper.current_session_id when no telegram status', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'abc-123',
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('abc-123')
    expect(info.current_session_name).toBe(null)
  })

  test('reads full info from telegram last-status.json', () => {
    const payload = {
      captured_at_ms: 1779458539286,
      payload: {
        session_id: 'sess-1',
        session_name: 'demo',
        model: { id: 'claude-opus-4-7', display_name: 'Opus 4.7' },
        effort: { level: 'high' },
        context_window: { used_percentage: 42, remaining_percentage: 58 },
      },
    }
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify(payload),
    )
    const info = readPeerSessionInfo(projectDir)
    expect(info.current_session_id).toBe('sess-1')
    expect(info.current_session_name).toBe('demo')
    expect(info.context_used_percent).toBe(42)
    expect(info.model).toBe('Opus 4.7')
    expect(info.effort_level).toBe('high')
  })

  test('telegram status preferred over wrapper.current_session_id', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'wrapper-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({ payload: { session_id: 'telegram-sid' } }),
    )
    expect(readPeerSessionInfo(projectDir).current_session_id).toBe('telegram-sid')
  })

  test('malformed telegram status falls back to wrapper file', () => {
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'pty-controller', 'wrapper.current_session_id'),
      'wrapper-sid',
    )
    writeFileSync(
      join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json'),
      '{ not json',
    )
    expect(readPeerSessionInfo(projectDir).current_session_id).toBe('wrapper-sid')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd plugins/agent-bus && bun test peer-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement peer-status.ts**

Create `plugins/agent-bus/peer-status.ts`:

```typescript
/**
 * Best-effort reader for a peer bot's current-session metadata.
 *
 * The richer fields (session_name, context %, model, effort) live in the
 * telegram plugin's `last-status.json`, written each statusLine fire. If
 * that plugin isn't installed in the peer, we degrade to the pty-controller
 * `wrapper.current_session_id` file — that gives us at least the session
 * UUID. All other fields return null.
 *
 * Pure reader. Never writes to peer state.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PeerSessionInfo {
  current_session_id: string | null
  current_session_name: string | null
  context_used_percent: number | null
  model: string | null
  effort_level: string | null
}

const EMPTY: PeerSessionInfo = {
  current_session_id: null,
  current_session_name: null,
  context_used_percent: null,
  model: null,
  effort_level: null,
}

export function readPeerSessionInfo(projectDir: string): PeerSessionInfo {
  const telegramStatus = readTelegramStatus(projectDir)
  if (telegramStatus) return telegramStatus
  const sid = readWrapperSessionId(projectDir)
  if (sid) return { ...EMPTY, current_session_id: sid }
  return { ...EMPTY }
}

function readTelegramStatus(projectDir: string): PeerSessionInfo | null {
  const path = join(projectDir, '.claude', 'channels', 'telegram', 'last-status.json')
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      payload?: {
        session_id?: string
        session_name?: string
        model?: { display_name?: string }
        effort?: { level?: string }
        context_window?: { used_percentage?: number }
      }
    }
    const p = raw.payload
    if (!p) return null
    return {
      current_session_id: typeof p.session_id === 'string' ? p.session_id : null,
      current_session_name: typeof p.session_name === 'string' ? p.session_name : null,
      context_used_percent:
        typeof p.context_window?.used_percentage === 'number'
          ? p.context_window.used_percentage
          : null,
      model: typeof p.model?.display_name === 'string' ? p.model.display_name : null,
      effort_level: typeof p.effort?.level === 'string' ? p.effort.level : null,
    }
  } catch {
    return null
  }
}

function readWrapperSessionId(projectDir: string): string | null {
  const path = join(
    projectDir,
    '.claude',
    'channels',
    'pty-controller',
    'wrapper.current_session_id',
  )
  if (!existsSync(path)) return null
  try {
    const sid = readFileSync(path, 'utf8').trim()
    return sid || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd plugins/agent-bus && bun test peer-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```
git add plugins/agent-bus/peer-status.ts plugins/agent-bus/peer-status.test.ts
git commit -m "feat(agent-bus): opportunistic peer-status reader (telegram last-status + wrapper sid fallback)"
```

---

## Task 4: Inbox writer with schema validation

**Files:**
- Create: `plugins/agent-bus/inbox-writer.ts`
- Test: `plugins/agent-bus/inbox-writer.test.ts`

- [ ] **Step 1: Write failing test**

Write `plugins/agent-bus/inbox-writer.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeAgentMessage, validatePayload } from './inbox-writer'

describe('inbox-writer: validatePayload', () => {
  test('accepts slash with command', () => {
    const r = validatePayload({ kind: 'slash', command: '/clear' })
    expect(r.ok).toBe(true)
  })

  test('accepts slash with command + sessionName', () => {
    const r = validatePayload({ kind: 'slash', command: '/clear', sessionName: 'foo' })
    expect(r.ok).toBe(true)
  })

  test('accepts slash with command + args', () => {
    const r = validatePayload({ kind: 'slash', command: '/effort', args: 'high' })
    expect(r.ok).toBe(true)
  })

  test('rejects slash without command', () => {
    const r = validatePayload({ kind: 'slash' } as any)
    expect(r.ok).toBe(false)
  })

  test('rejects command without leading slash', () => {
    const r = validatePayload({ kind: 'slash', command: 'clear' })
    expect(r.ok).toBe(false)
  })

  test('rejects unknown kind (prompt is Phase 2)', () => {
    const r = validatePayload({ kind: 'prompt', body: 'hi' } as any)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Phase 2')
  })
})

describe('inbox-writer: writeAgentMessage', () => {
  let peerStateDir: string
  beforeEach(() => {
    peerStateDir = mkdtempSync(join(tmpdir(), 'peer-state-'))
    mkdirSync(join(peerStateDir, 'pending'), { recursive: true })
  })
  afterEach(() => {
    rmSync(peerStateDir, { recursive: true, force: true })
  })

  test('writes JSON file to <peerState>/pending/<uuid>.json', () => {
    const res = writeAgentMessage(peerStateDir, 'bot-01', {
      kind: 'slash',
      command: '/clear',
    })
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.path).toContain('pending')
    const files = readdirSync(join(peerStateDir, 'pending'))
    expect(files).toHaveLength(1)
    const body = JSON.parse(readFileSync(join(peerStateDir, 'pending', files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('slash')
    expect(body.command).toBe('/clear')
    expect(body.hop_count).toBe(0)
    expect(typeof body.correlation_id).toBe('string')
  })

  test('uses provided correlation_id when supplied', () => {
    const res = writeAgentMessage(
      peerStateDir,
      'bot-01',
      { kind: 'slash', command: '/clear' },
      'corr-fixed',
    )
    expect(res.correlation_id).toBe('corr-fixed')
    const files = readdirSync(join(peerStateDir, 'pending'))
    const body = JSON.parse(readFileSync(join(peerStateDir, 'pending', files[0]!), 'utf8'))
    expect(body.correlation_id).toBe('corr-fixed')
  })

  test('atomic write — no .tmp file lingers after success', () => {
    writeAgentMessage(peerStateDir, 'bot-01', { kind: 'slash', command: '/clear' })
    const files = readdirSync(join(peerStateDir, 'pending'))
    expect(files.every(f => !f.includes('.tmp.'))).toBe(true)
  })

  test('throws on invalid payload', () => {
    expect(() =>
      writeAgentMessage(peerStateDir, 'bot-01', { kind: 'slash' } as any),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd plugins/agent-bus && bun test inbox-writer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement inbox-writer.ts**

Create `plugins/agent-bus/inbox-writer.ts`:

```typescript
/**
 * Serialise an agent_send payload and atomically write it to the peer
 * bot's pty-controller inbox. The peer's wrapper consumes the file and
 * injects the corresponding slash command into its PTY.
 *
 * Phase 1: only `kind: "slash"` is accepted. The `prompt` and `reply`
 * variants land in Phase 2 — we reject them here with a clear error so
 * the AI gets accurate feedback instead of a silent no-op.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type AgentPayload = {
  kind: 'slash'
  command: string
  sessionName?: string
  args?: string
  /** Optional confirm-after pacing (re-used from existing wrapper protocol). */
  confirmAfterMs?: number
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

export function validatePayload(p: unknown): ValidationResult {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' }
  const o = p as Record<string, unknown>
  if (o.kind === 'prompt' || o.kind === 'reply') {
    return { ok: false, error: `kind "${o.kind}" is not supported in Phase 1 (Phase 2 feature)` }
  }
  if (o.kind !== 'slash') {
    return { ok: false, error: `kind must be "slash" (got ${JSON.stringify(o.kind)})` }
  }
  if (typeof o.command !== 'string' || o.command.length === 0) {
    return { ok: false, error: 'command must be a non-empty string' }
  }
  if (!o.command.startsWith('/')) {
    return { ok: false, error: 'command must start with "/"' }
  }
  if (o.sessionName !== undefined && typeof o.sessionName !== 'string') {
    return { ok: false, error: 'sessionName must be a string when provided' }
  }
  if (o.args !== undefined && typeof o.args !== 'string') {
    return { ok: false, error: 'args must be a string when provided' }
  }
  if (
    o.confirmAfterMs !== undefined &&
    (typeof o.confirmAfterMs !== 'number' || o.confirmAfterMs < 0)
  ) {
    return { ok: false, error: 'confirmAfterMs must be a non-negative number when provided' }
  }
  return { ok: true }
}

export function writeAgentMessage(
  peerStateDir: string,
  from: string,
  payload: AgentPayload,
  correlationId?: string,
): { id: string; correlation_id: string; path: string } {
  const v = validatePayload(payload)
  if (!v.ok) throw new Error(v.error ?? 'invalid payload')

  const pending = join(peerStateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const correlation_id = correlationId ?? randomUUID()
  // Compose `command` with args if both present, so wrapper sees a single
  // injectable string (matches existing meta-commands.ts pattern). sessionName
  // stays a top-level field — wrapper reads it directly for /clear chains.
  const fullCommand = payload.args
    ? `${payload.command} ${payload.args}`
    : payload.command
  const body: Record<string, unknown> = {
    id,
    ts: new Date().toISOString(),
    from,
    kind: 'slash',
    command: fullCommand,
    correlation_id,
    hop_count: 0,
  }
  if (payload.sessionName !== undefined) body.sessionName = payload.sessionName
  if (payload.confirmAfterMs !== undefined) body.confirmAfterMs = payload.confirmAfterMs

  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(body, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, correlation_id, path: finalPath }
}
```

- [ ] **Step 4: Run tests**

Run: `cd plugins/agent-bus && bun test inbox-writer.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```
git add plugins/agent-bus/inbox-writer.ts plugins/agent-bus/inbox-writer.test.ts
git commit -m "feat(agent-bus): inbox-writer with Phase 1 schema validation (slash only)"
```

---

## Task 5: MCP server with 3 tools

**Files:**
- Create: `plugins/agent-bus/server.ts`

- [ ] **Step 1: Write server.ts**

Create `plugins/agent-bus/server.ts`:

```typescript
#!/usr/bin/env bun
/**
 * MCP server for the agent-bus plugin. Exposes three tools:
 *
 *   • agent_list     — list peers in the global registry
 *   • agent_status   — peer's current session + context/model/effort
 *   • agent_send     — write a slash-command request to a peer's inbox
 *
 * agent_list and agent_status are read-only. agent_send is mutating —
 * the tool description tells the AI to call it ONLY when the user has
 * explicitly asked to message another agent.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readRegistry, resolveRegistryPath } from './registry'
import { readPeerSessionInfo } from './peer-status'
import { writeAgentMessage, type AgentPayload } from './inbox-writer'

const REGISTRY_PATH = resolveRegistryPath(process.env)
process.stderr.write(`agent-bus: registry path = ${REGISTRY_PATH}\n`)

const ONLINE_THRESHOLD_MS = 30_000
const STALE_LIST_THRESHOLD_MS = 24 * 60 * 60 * 1000

function isOnline(lastHeartbeatIso: string): boolean {
  const t = Date.parse(lastHeartbeatIso)
  if (Number.isNaN(t)) return false
  return Date.now() - t < ONLINE_THRESHOLD_MS
}

function isStaleForList(lastHeartbeatIso: string): boolean {
  const t = Date.parse(lastHeartbeatIso)
  if (Number.isNaN(t)) return true
  return Date.now() - t > STALE_LIST_THRESHOLD_MS
}

const mcp = new Server(
  { name: 'agent-bus', version: '0.0.1' },
  { capabilities: { tools: {} } },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'agent_list',
      description:
        'List all bot-to-bot peers registered in ~/.claude/agent-registry.json. Returns each peer\'s name, online status, last heartbeat, and project_dir. Safe to call autonomously at any time. Entries with no heartbeat in the past 24h are filtered out.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'agent_status',
      description:
        "Read a peer's current-session details: session id, session name, context usage %, model display name, and effort level. Sources from the peer's telegram plugin last-status.json when present, otherwise falls back to the pty-controller wrapper.current_session_id file. Safe to call autonomously.",
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Peer agent name (e.g. "bot-02")' },
        },
        required: ['name'],
      },
    },
    {
      name: 'agent_send',
      description:
        "Send a slash-command request to a peer bot's pty-controller inbox. The peer's wrapper will inject the command into its PTY on the next turn boundary. DO NOT call autonomously — only when the user has explicitly asked you to message another agent. Destructive commands (/clear, /delete) require explicit user confirmation. Phase 1 supports kind=\"slash\" only; kind=\"prompt\" and kind=\"reply\" will return an error until Phase 2 ships.",
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target agent name (must be registered)' },
          payload: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['slash'] },
              command: {
                type: 'string',
                description: 'Slash command including leading "/" (e.g. "/clear", "/rename", "/effort")',
              },
              sessionName: {
                type: 'string',
                description: 'When command="/clear", chain a /rename to this session name (mirrors meta-commands /new behavior).',
              },
              args: {
                type: 'string',
                description: 'Optional argument string; appended to command with a space.',
              },
              confirmAfterMs: {
                type: 'number',
                description: 'Optional auto-confirm pacing for commands that pop a picker (e.g. /effort).',
              },
            },
            required: ['kind', 'command'],
          },
          correlation_id: {
            type: 'string',
            description: 'Optional UUID. Auto-generated if omitted. Used in Phase 2 for reply pairing.',
          },
        },
        required: ['target', 'payload'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  try {
    switch (req.params.name) {
      case 'agent_list': {
        const reg = readRegistry(REGISTRY_PATH)
        const list = Object.entries(reg.agents)
          .filter(([_, e]) => !isStaleForList(e.last_heartbeat))
          .map(([name, e]) => ({
            name,
            online: isOnline(e.last_heartbeat),
            last_heartbeat: e.last_heartbeat,
            project_dir: e.project_dir,
          }))
        return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] }
      }
      case 'agent_status': {
        const name = args.name
        if (typeof name !== 'string' || !name) {
          throw new Error('name (string) is required')
        }
        const reg = readRegistry(REGISTRY_PATH)
        const entry = reg.agents[name]
        if (!entry) {
          const known = Object.keys(reg.agents).join(', ') || '(none)'
          throw new Error(`agent "${name}" not in registry. Known: ${known}`)
        }
        const sess = readPeerSessionInfo(entry.project_dir)
        const status = {
          name,
          online: isOnline(entry.last_heartbeat),
          last_heartbeat: entry.last_heartbeat,
          wrapper_pid: entry.wrapper_pid,
          current_session_id: sess.current_session_id,
          current_session_name: sess.current_session_name,
          context_used_percent: sess.context_used_percent,
          model: sess.model,
          effort_level: sess.effort_level,
        }
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
      }
      case 'agent_send': {
        const target = args.target
        const payload = args.payload as AgentPayload | undefined
        const correlation = typeof args.correlation_id === 'string' ? args.correlation_id : undefined
        if (typeof target !== 'string' || !target) throw new Error('target (string) is required')
        if (!payload) throw new Error('payload is required')

        const reg = readRegistry(REGISTRY_PATH)
        const entry = reg.agents[target]
        if (!entry) {
          const known = Object.keys(reg.agents).join(', ') || '(none)'
          throw new Error(`target "${target}" not in registry. Known: ${known}`)
        }

        // SELF — derive from CLAUDE_PROJECT_DIR basename. Matches the convention
        // wrapper.ts uses when registering itself (see Task 6).
        const selfDir = (process.env.CLAUDE_PROJECT_DIR ?? '').replace(/[\\/]+$/, '')
        const self = selfDir.split(/[\\/]/).filter(Boolean).pop() ?? 'unknown'

        const res = writeAgentMessage(entry.state_dir, self, payload, correlation)
        const online = isOnline(entry.last_heartbeat)
        const warn = online ? '' : ' WARNING: target is offline; file will be consumed on next boot.'
        return {
          content: [
            {
              type: 'text',
              text:
                `queued for ${target} (id: ${res.id}, correlation: ${res.correlation_id})\n` +
                `wrote to: ${res.path}${warn}`,
            },
          ],
        }
      }
      default:
        return {
          content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }],
          isError: true,
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      content: [{ type: 'text', text: `error: ${msg}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await mcp.connect(transport)
process.stderr.write(`agent-bus: MCP server connected\n`)
```

- [ ] **Step 2: Boot-test the server**

Run: `cd plugins/agent-bus && bun server.ts < /dev/null 2>&1 | head -5`
Note: server expects MCP stdio handshake; we just check it doesn't crash on startup. Expected: log line "agent-bus: registry path = ...". Process may hang waiting for stdin — Ctrl+C / kill after seeing the log line.

On Windows in PowerShell, use:
```
echo $null | bun server.ts 2>&1 | Select-Object -First 5
```

- [ ] **Step 3: Commit**

```
git add plugins/agent-bus/server.ts
git commit -m "feat(agent-bus): MCP server with agent_list, agent_status, agent_send"
```

---

## Task 6: Wrapper extension — register/heartbeat/unregister

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Read current wrapper.ts boot section**

Open `plugins/pty-controller/wrapper/src/wrapper.ts` and locate the heartbeat block (around line 355). We'll insert the global-registry hooks right next to it.

- [ ] **Step 2: Add registry imports and constants**

The wrapper already imports from `node:fs` and `node:os`. Extend the existing `node:fs` import to add `openSync` and `closeSync`:

```typescript
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  existsSync,
  renameSync,
  statSync,
  watch,
  openSync,
  closeSync,
  type FSWatcher,
} from 'node:fs'
```

(`homedir` is already imported from `node:os` — reuse it.)

Add constants below the existing `CURRENT_SESSION_FILE` definition:

```typescript
// Global agent registry shared by all bot peers on this machine.
// See plugins/agent-bus/registry.ts for the writer-side contract.
const AGENT_REGISTRY_PATH =
  process.env.AGENT_REGISTRY_PATH?.trim() ||
  join(homedir(), '.claude', 'agent-registry.json')
const AGENT_REGISTRY_LOCK = `${AGENT_REGISTRY_PATH}.lock`
// Bot name = basename(project_dir). Conflict (same basename, different paths)
// is logged but not blocked at v1.
const SELF_AGENT_NAME = PROJECT_DIR.split(/[\\/]/).filter(Boolean).pop() ?? 'unknown'
```

- [ ] **Step 3: Add registry helper functions**

Add this block before the `spawnClaudePty()` definition:

```typescript
function acquireRegistryLock(): (() => void) | null {
  const start = Date.now()
  while (true) {
    try {
      // openSync with 'wx' = exclusive create — fails with EEXIST if held.
      const fd = openSync(AGENT_REGISTRY_LOCK, 'wx')
      closeSync(fd)
      return () => {
        try {
          rmSync(AGENT_REGISTRY_LOCK)
        } catch {
          /* best-effort */
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return null
      if (Date.now() - start > 2_000) {
        log(`registry lock timeout — skipping update`)
        return null
      }
      // tight busy-wait is fine here: holders only hold for milliseconds.
      const until = Date.now() + 25
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

function loadRegistry(): {
  schema_version: 1
  agents: Record<
    string,
    {
      project_dir: string
      state_dir: string
      registered_at: string
      last_heartbeat: string
      wrapper_pid: number
    }
  >
} {
  if (!existsSync(AGENT_REGISTRY_PATH)) return { schema_version: 1, agents: {} }
  try {
    const obj = JSON.parse(readFileSync(AGENT_REGISTRY_PATH, 'utf8'))
    if (obj && typeof obj === 'object' && obj.schema_version === 1 && obj.agents) {
      return obj
    }
  } catch {
    /* corrupt — reset */
  }
  return { schema_version: 1, agents: {} }
}

function persistRegistry(reg: ReturnType<typeof loadRegistry>): void {
  mkdirSync(join(AGENT_REGISTRY_PATH, '..'), { recursive: true })
  const tmp = `${AGENT_REGISTRY_PATH}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(reg, null, 2))
  renameSync(tmp, AGENT_REGISTRY_PATH)
}

function registerSelfInGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const existing = reg.agents[SELF_AGENT_NAME]
    if (existing && existing.project_dir !== PROJECT_DIR) {
      log(
        `WARNING: agent name "${SELF_AGENT_NAME}" already registered at ` +
          `${existing.project_dir} (different from current ${PROJECT_DIR}). ` +
          `Overwriting — both wrappers will fight over the registry slot.`,
      )
    }
    const now = new Date().toISOString()
    reg.agents[SELF_AGENT_NAME] = {
      project_dir: PROJECT_DIR,
      state_dir: STATE_DIR,
      registered_at: existing?.registered_at ?? now,
      last_heartbeat: now,
      wrapper_pid: process.pid,
    }
    persistRegistry(reg)
    log(`registered "${SELF_AGENT_NAME}" in ${AGENT_REGISTRY_PATH}`)
  } finally {
    release()
  }
}

function heartbeatSelfInGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const e = reg.agents[SELF_AGENT_NAME]
    if (!e || e.wrapper_pid !== process.pid) return
    e.last_heartbeat = new Date().toISOString()
    persistRegistry(reg)
  } finally {
    release()
  }
}

function unregisterSelfFromGlobalRegistry(): void {
  const release = acquireRegistryLock()
  if (!release) return
  try {
    const reg = loadRegistry()
    const e = reg.agents[SELF_AGENT_NAME]
    if (!e || e.wrapper_pid !== process.pid) return
    delete reg.agents[SELF_AGENT_NAME]
    persistRegistry(reg)
    log(`unregistered "${SELF_AGENT_NAME}" from global registry`)
  } catch {
    /* swallow */
  } finally {
    release()
  }
}
```

- [ ] **Step 4: Wire up register on boot, heartbeat tick, unregister on shutdown**

Just after the existing line:
```typescript
writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
```
(local heartbeat init, currently around line 362)

Add:
```typescript
registerSelfInGlobalRegistry()
```

In the existing `heartbeatInterval` callback (around line 355), add a second call:
```typescript
const heartbeatInterval = setInterval(() => {
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
  } catch (err) {
    log(`heartbeat write failed: ${err}`)
  }
  heartbeatSelfInGlobalRegistry()
}, 5_000)
```

In the `shutdown` function (around line 651), add as the first statement inside the function body:
```typescript
function shutdown(code: number): void {
  unregisterSelfFromGlobalRegistry()
  clearInterval(heartbeatInterval)
  // ... rest unchanged
```

- [ ] **Step 5: Verify wrapper still compiles**

Run from repo root:
```
cd plugins/pty-controller/wrapper && bun install && bun -e "import('./src/wrapper.ts').catch(e => { console.error('import error:', e.message); process.exit(1) })"
```
Expected: no error logged from the import attempt (the wrapper will try to spawn claude and may exit — that's fine; we only want to confirm the module loads).

If the script appears to hang (it spawned claude), kill it after a few seconds. We're only verifying that the file parses + executes the top-level synchronous code.

- [ ] **Step 6: Commit**

```
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(pty-controller): wrapper auto-registers in global agent-registry on boot/tick/shutdown"
```

---

## Task 7: Wrapper extension — validate `from` and `hop_count`

**Files:**
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Locate `consumePending` (around line 517)**

We extend the existing payload-parsing block to also handle the new `from` and `hop_count` fields. Existing fields (`type`, `command`, `sessionId`, `sessionName`, `confirmAfterMs`) keep working unchanged — that's the backward-compat contract.

- [ ] **Step 2: Extend payload type and add validation**

Replace the existing `payload:` declaration block in `consumePending` (currently:
```typescript
  let payload: {
    id?: string
    type?: string
    command?: string
    sessionId?: string
    sessionName?: string
    confirmAfterMs?: number
  }
```

with:

```typescript
  let payload: {
    id?: string
    type?: string
    /** Phase 1 alternate type field — synonymous with type:"slash" when "slash". */
    kind?: string
    command?: string
    sessionId?: string
    sessionName?: string
    confirmAfterMs?: number
    /** Agent-bus extension: name of sending agent. Required when from agent-bus. */
    from?: string
    /** Agent-bus extension: loop-prevention counter. */
    hop_count?: number
    /** Agent-bus extension: correlation id, opaque to wrapper in Phase 1. */
    correlation_id?: string
  }
```

- [ ] **Step 3: Add hop-count enforcement just after the JSON parse**

After:
```typescript
  try {
    payload = JSON.parse(raw)
  } catch (err) {
    log(`malformed json in ${filename}: ${err}`)
    return
  }
```

Insert:
```typescript
  // Agent-bus extension: enforce hop limit on inter-agent messages. Local
  // messages (no `from` field) skip this check — they originate inside this
  // CC session via meta-commands and the AI's own tool calls.
  if (typeof payload.from === 'string') {
    const hops = typeof payload.hop_count === 'number' ? payload.hop_count : 0
    if (hops > 5) {
      log(`dropping ${filename}: hop_count ${hops} > 5 (from "${payload.from}")`)
      return
    }
    log(
      `inter-agent message from "${payload.from}" ` +
        `(kind=${payload.kind ?? payload.type ?? 'slash'}, hop=${hops}, correlation=${payload.correlation_id ?? '?'})`,
    )
  }
```

- [ ] **Step 4: Accept `kind: "slash"` as a synonym for `type: "slash"`**

Replace:
```typescript
  const type = payload.type ?? 'slash'
```

with:

```typescript
  // Phase 1 contract: `type` (legacy) and `kind` (new) are synonyms. Default
  // to "slash" when neither is set (backward compat for the original
  // single-string-command payload shape).
  const type = payload.type ?? payload.kind ?? 'slash'
```

- [ ] **Step 5: Verify wrapper still parses**

Run: `cd plugins/pty-controller/wrapper && bun -e "import('./src/wrapper.ts').catch(e => { console.error(e.message); process.exit(1) })"`

(Same caveat as Task 6 Step 5 — kill after a few seconds if it doesn't exit.)
Expected: no error logged from parse/import phase.

- [ ] **Step 6: Commit**

```
git add plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(pty-controller): wrapper validates from + hop_count for inter-agent messages"
```

---

## Task 8: Skill `using-agent-bus`

**Files:**
- Create: `plugins/agent-bus/skills/using-agent-bus/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `plugins/agent-bus/skills/using-agent-bus/SKILL.md`:

```markdown
---
name: using-agent-bus
description: Use whenever the user asks you to coordinate with, message, or relay a command to another bot agent on the same machine (e.g. "tell bot-02 to run /handoff-resume", "reset bot-03 and rename its session to sprint-2", "list which bots are online"). Provides the rules for calling the `agent_list` / `agent_status` / `agent_send` MCP tools safely.
---

# Using agent-bus

This skill is loaded whenever the user is coordinating multiple bot peers via the `agent-bus` plugin.

## Tools at your disposal

- **`agent_list()`** — list peers, with online/offline flag. **Safe to call autonomously** any time it would help.
- **`agent_status(name)`** — peer's current session, context %, model, effort level. **Safe to call autonomously**.
- **`agent_send(target, payload)`** — write a slash-command request to peer's inbox. **DO NOT call autonomously.** Only when the user explicitly asked you to message another agent.

## When to use `agent_send`

You may call `agent_send` only when the user has explicitly said something like:
- *"tell bot-02 to run /handoff-resume"*
- *"reset bot-03 with session name X"*
- *"buatkan handoff untuk bot-04 lalu minta dia jalankan /handoff-resume"*
- *"switch bot-05 ke session Y"*

You may NOT call it because:
- You think the user would benefit from coordinating with another bot.
- You want to "ask another bot for a second opinion" autonomously.
- You're brainstorming and want to delegate.

If unsure, ask the user first.

## Destructive commands

These commands are destructive — they destroy or replace peer state:
- `/clear` (resets the peer's conversation)
- `/clear` with `sessionName` (= `/new <name>` — wipes + renames)
- `/delete` (removes a session)

For destructive commands you MUST confirm with the user immediately before sending, even if they already said "do it". Restate the action concretely: *"about to send `/clear` to bot-02, which will erase its current conversation — confirm?"*. Use the `interactive-prompts` skill (yes/no buttons) so the confirmation lands fast on Telegram.

Non-destructive commands (`/rename`, `/effort`, `/switch`) do not require this extra confirmation step beyond the user's original request.

## Pattern: leader fan-out

User wants one command broadcast to many peers:

```
1. agent_list()                            # see who's online
2. for each peer in [bot-02, bot-03, ...]:
     agent_send(target=peer, payload={ kind:"slash", command:"/clear", sessionName:"sprint-2" })
3. report back to user with summary (which succeeded, which were offline)
```

## Pattern: targeted relay

User wants a single peer to run a specific command:

```
1. agent_status("bot-02")                  # confirm it's the right peer + check context state
2. agent_send(target="bot-02", payload={ kind:"slash", command:"/handoff-resume" })
3. report message id + correlation id back to user; explain that the peer will execute on its next turn boundary
```

## Anti-patterns

- **Sending to an offline peer without warning the user.** Inbox file will queue, but the user should know it won't be consumed until the peer boots.
- **Sending payload >8 KB.** Schema rejects this; don't try.
- **Calling `agent_send` with `kind: "prompt"` or `kind: "reply"`.** Those are Phase 2 features. The tool will return an error.
- **Including secrets in the command string.** The inbox file lives in the peer's filesystem; treat it as not confidential.
- **Inferring peer names.** Always read from `agent_list` rather than guessing. Names = basename of peer's project dir.

## Error responses you may see

- `target "<name>" not in registry. Known: <list>` — typo or peer never booted.
- `kind "prompt" is not supported in Phase 1` — Phase 2 not shipped yet.
- `command must start with "/"` — you forgot the leading slash.
- `WARNING: target is offline; file will be consumed on next boot.` — the write succeeded, but tell the user the peer is offline.
```

- [ ] **Step 2: Verify skill SKILL.md loads (syntactic check only)**

Run: `cd plugins/agent-bus && head -5 skills/using-agent-bus/SKILL.md`
Expected: see frontmatter starting with `---` and the `name:` line.

- [ ] **Step 3: Commit**

```
git add plugins/agent-bus/skills/using-agent-bus/SKILL.md
git commit -m "feat(agent-bus): skill using-agent-bus guides when AI may call agent_send"
```

---

## Task 9: Integration test — 2-bot loopback

**Files:**
- Create: `plugins/agent-bus/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `plugins/agent-bus/integration.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  registerAgent,
  readRegistry,
  resolveRegistryPath,
  updateHeartbeat,
  unregisterAgent,
} from './registry'
import { writeAgentMessage } from './inbox-writer'
import { readPeerSessionInfo } from './peer-status'

describe('integration: bot-01 ↔ bot-02 loopback', () => {
  let root: string
  let registryPath: string
  let bot01Dir: string
  let bot02Dir: string
  let bot01StateDir: string
  let bot02StateDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'agent-bus-integ-'))
    registryPath = join(root, 'agent-registry.json')
    bot01Dir = join(root, 'bot-01')
    bot02Dir = join(root, 'bot-02')
    bot01StateDir = join(bot01Dir, '.claude', 'channels', 'pty-controller')
    bot02StateDir = join(bot02Dir, '.claude', 'channels', 'pty-controller')
    mkdirSync(bot01StateDir, { recursive: true })
    mkdirSync(bot02StateDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('resolveRegistryPath honors AGENT_REGISTRY_PATH for test isolation', () => {
    expect(resolveRegistryPath({ AGENT_REGISTRY_PATH: registryPath })).toBe(registryPath)
  })

  test('full happy path: both bots register, bot-01 sends /clear+rename to bot-02, file lands', () => {
    // Both wrappers register themselves on boot.
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1000,
    })
    registerAgent(registryPath, 'bot-02', {
      project_dir: bot02Dir,
      state_dir: bot02StateDir,
      wrapper_pid: 2000,
    })

    const reg = readRegistry(registryPath)
    expect(Object.keys(reg.agents).sort()).toEqual(['bot-01', 'bot-02'])

    // bot-01 looks up bot-02 and sends /clear with sessionName "sprint-2".
    const target = reg.agents['bot-02']!
    const res = writeAgentMessage(target.state_dir, 'bot-01', {
      kind: 'slash',
      command: '/clear',
      sessionName: 'sprint-2',
    })

    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    // The file should now be sitting in bot-02's pending dir.
    const pending = join(bot02StateDir, 'pending')
    const files = readdirSync(pending)
    expect(files).toHaveLength(1)
    const body = JSON.parse(readFileSync(join(pending, files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('slash')
    expect(body.command).toBe('/clear')
    expect(body.sessionName).toBe('sprint-2')
    expect(body.hop_count).toBe(0)
    expect(typeof body.correlation_id).toBe('string')
  })

  test('heartbeat refresh + online detection threshold', async () => {
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1,
    })
    const reg1 = readRegistry(registryPath)
    const t1 = Date.parse(reg1.agents['bot-01']!.last_heartbeat)
    await new Promise(r => setTimeout(r, 20))
    updateHeartbeat(registryPath, 'bot-01')
    const reg2 = readRegistry(registryPath)
    const t2 = Date.parse(reg2.agents['bot-01']!.last_heartbeat)
    expect(t2).toBeGreaterThan(t1)
  })

  test('unregister removes agent from registry', () => {
    registerAgent(registryPath, 'bot-01', {
      project_dir: bot01Dir,
      state_dir: bot01StateDir,
      wrapper_pid: 1,
    })
    unregisterAgent(registryPath, 'bot-01')
    expect(readRegistry(registryPath).agents['bot-01']).toBeUndefined()
  })

  test('peer-status reads bot-02 session info opportunistically', () => {
    mkdirSync(join(bot02Dir, '.claude', 'channels', 'telegram'), { recursive: true })
    writeFileSync(
      join(bot02Dir, '.claude', 'channels', 'telegram', 'last-status.json'),
      JSON.stringify({
        payload: {
          session_id: 's1',
          session_name: 'demo',
          model: { display_name: 'Opus 4.7' },
          effort: { level: 'medium' },
          context_window: { used_percentage: 12 },
        },
      }),
    )
    const info = readPeerSessionInfo(bot02Dir)
    expect(info.current_session_name).toBe('demo')
    expect(info.context_used_percent).toBe(12)
    expect(info.model).toBe('Opus 4.7')
    expect(info.effort_level).toBe('medium')
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `cd plugins/agent-bus && bun test integration.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Run full plugin test suite**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS (all of: registry 8, peer-status 5, inbox-writer 10, integration 5 = 28 tests).

- [ ] **Step 4: Commit**

```
git add plugins/agent-bus/integration.test.ts
git commit -m "test(agent-bus): integration test for 2-bot loopback"
```

---

## Task 10: Manual smoke test + release tag

**Files:**
- None (operational task).

- [ ] **Step 1: Reinstall the plugin into both bots**

If `bot-01` and `bot-02` are configured to load `plugin:agent-bus@mirza-marketplace`, restart their wrappers (`mirza-cc`) so the new plugin code is picked up and they both auto-register.

If the plugin isn't loaded yet, add `plugin:agent-bus@mirza-marketplace` to `DEFAULT_CLAUDE_ARGS` in `plugins/pty-controller/wrapper/src/wrapper.ts` (the `--dangerously-load-development-channels` line), then restart.

- [ ] **Step 2: Verify both bots appear in the registry**

```
type %USERPROFILE%\.claude\agent-registry.json
```

Expected: both `bot-01` and `bot-02` present with recent `last_heartbeat`.

- [ ] **Step 3: Try the canonical demo**

In bot-01 (via Telegram or terminal), ask the AI:

> *"reset bot-02 dengan session name 'sprint-2'"*

Expected sequence:
1. AI calls `agent_list()` (autonomous OK).
2. AI confirms with you (destructive command → interactive-prompts buttons).
3. After confirmation, AI calls `agent_send(target="bot-02", payload={ kind:"slash", command:"/clear", sessionName:"sprint-2" })`.
4. bot-02's wrapper consumes the file, injects `/clear` then `/rename sprint-2`.
5. bot-02's Telegram gets a session-change notification.
6. bot-01 reports completion in its Telegram thread.

If anything diverges, capture the log lines and continue from Step 4.

- [ ] **Step 4: Bump version + tag release**

Run:
```
cd plugins/agent-bus
# bump plugin.json version 0.0.1 → 0.0.1 (no bump needed yet, it's the initial release)
cd ../..
git tag agent-bus-0.0.1
```

(Do NOT push without user confirmation — tags are visible to upstream.)

- [ ] **Step 5: Update FEATURE_IDEAS.md log row**

Append to `workspace/bot-01/FEATURE_IDEAS.md` Implementation Log table:

```
| 2026-05-22 | Bot-to-bot Phase 1 (slash-only) | ✅ Shipped | New plugin `agent-bus` (v0.0.1) + pty-controller wrapper extension. Global registry at `~/.claude/agent-registry.json`, MCP tools `agent_list`/`agent_status`/`agent_send` (kind=slash only). Phase 2 (prompt + reply) follows. Design: `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md`. |
```

- [ ] **Step 6: Final commit**

```
git add workspace/bot-01/FEATURE_IDEAS.md   # if the table edit lives there
git commit -m "docs: log bot-to-bot Phase 1 ship in FEATURE_IDEAS"
```

---

## Verification checklist

- [ ] All 28 unit + integration tests pass (`cd plugins/agent-bus && bun test`).
- [ ] Wrapper changes don't regress pty-controller's existing `/clear`, `/rename`, `/switch`, `/effort` behavior (smoke-test one of each manually).
- [ ] `~/.claude/agent-registry.json` is created with proper structure after both bots boot.
- [ ] Stale heartbeat (kill bot-02 wrapper without graceful shutdown) → `agent_list` shows it `online: false` within 30 seconds.
- [ ] Schema rejection: hand-craft a malformed file in `<peer>/pending/` (e.g., `kind: "prompt"`) and confirm wrapper logs the rejection without crashing.
- [ ] Re-read this plan against the design spec — every spec requirement for Phase 1 is implemented (Phase 2 deliberately deferred).

## Out of scope (Phase 2 — separate plan)

- `kind: "prompt"` and `kind: "reply"` payloads
- Wrapper-side `notifications/claude/channel` emission for prompt/reply
- Correlation tracking across reply pairs (Phase 1 generates correlation_id but doesn't use it for routing)
- Telegram audit mirror
- Token budget enforcement
- Multi-agent deliberation (v3)
