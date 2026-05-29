# Agent-Bus One-Way Prompt Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `agent-bus` plugin so one agent can send a one-way natural-language prompt to one or many peers, delivered to each peer's Claude session as an inbound `<channel source="agent">` message.

**Architecture:** `agent_send` gains `kind:"prompt"`. Prompts are written to the peer's own `agent-bus/inbox/` (NOT the pty-controller inbox). The agent-bus MCP server, running inside each peer's Claude Code, runs a background watcher over its own inbox and emits `notifications/claude/channel` (mirroring the telegram plugin) so the peer's AI sees the prompt. The slash path through `pty-controller/pending/` is untouched. There is no reply protocol; loops are prevented by a skill anti-bounce rule plus a `hop_count` cap.

**Tech Stack:** TypeScript on Bun, `@modelcontextprotocol/sdk` Server, `bun:test`, Node `fs` (atomic tmp+rename, `fs.watch` + interval sweep fallback).

**Spec:** `docs/superpowers/specs/2026-05-29-agent-bus-one-way-prompt-design.md`

---

## File Structure

All paths under `plugins/agent-bus/`.

- `send-guards.ts` (NEW) — pure helpers: normalize `target` to an array, detect destructive slash commands. Unit-tested.
- `prompt-inbox.ts` (NEW) — the prompt inbox contract: resolve the inbox dir from a project dir, validate a prompt payload (sender side), write a prompt file atomically, and validate/parse an inbound prompt file (receiver side). Constants `MAX_BODY_BYTES`, `HOP_CAP`. Pure + fs writes; no watcher.
- `prompt-watcher.ts` (NEW) — receiver runtime: `consumeInboxFile` (read→validate→emit→delete, or reject), `sweepInbox` (batch consume with overflow cap), `startPromptWatcher` (wires `fs.watch` + interval sweep, returns a stop fn). Takes an `emit` callback so it is testable without a real MCP server.
- `server.ts` (MODIFY) — route `agent_send` by kind (slash→pty inbox, prompt→agent-bus inbox), accept `target: string | string[]` with broadcast fan-out, blast-radius guard for destructive slash to arrays, and install the prompt watcher on boot wired to `mcp.notification`. Bump server name version.
- `skills/using-agent-bus/SKILL.md` (MODIFY) — anti-bounce rule, leader fan-out + broadcast patterns, prompt usage.
- `.claude-plugin/plugin.json` (MODIFY) — version bump `0.0.1` → `0.0.2`.
- `package.json` (MODIFY) — version bump.
- `send-guards.test.ts`, `prompt-inbox.test.ts`, `prompt-watcher.test.ts` (NEW) — unit tests.
- `integration.test.ts` (MODIFY) — add a prompt loopback test.

---

## Task 1: `send-guards.ts` — target normalization + destructive detection

**Files:**
- Create: `plugins/agent-bus/send-guards.ts`
- Test: `plugins/agent-bus/send-guards.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/agent-bus/send-guards.test.ts`:

```typescript
import { test, expect, describe } from 'bun:test'
import { normalizeTargets, isDestructiveSlash } from './send-guards'

describe('normalizeTargets', () => {
  test('wraps a single string in an array', () => {
    expect(normalizeTargets('bot-02')).toEqual(['bot-02'])
  })
  test('passes an array through, trimming + dropping empties', () => {
    expect(normalizeTargets(['bot-02', ' bot-03 ', ''])).toEqual(['bot-02', 'bot-03'])
  })
  test('dedupes repeated targets', () => {
    expect(normalizeTargets(['bot-02', 'bot-02'])).toEqual(['bot-02'])
  })
  test('throws on empty input', () => {
    expect(() => normalizeTargets([])).toThrow('at least one target')
    expect(() => normalizeTargets('  ')).toThrow('at least one target')
  })
})

describe('isDestructiveSlash', () => {
  test('flags /clear and /delete (with or without args)', () => {
    expect(isDestructiveSlash('/clear')).toBe(true)
    expect(isDestructiveSlash('/delete hard')).toBe(true)
  })
  test('does not flag non-destructive commands', () => {
    expect(isDestructiveSlash('/rename foo')).toBe(false)
    expect(isDestructiveSlash('/effort low')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/agent-bus && bun test send-guards.test.ts`
Expected: FAIL — `Cannot find module './send-guards'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/agent-bus/send-guards.ts`:

```typescript
/**
 * Small pure helpers for agent_send routing decisions.
 */

/** Slash commands that must never fan out to multiple targets at once. */
export const DESTRUCTIVE_COMMANDS = ['/clear', '/delete'] as const

/**
 * Normalize the `target` argument (string or string[]) to a clean, deduped,
 * non-empty array of names. Throws if nothing usable remains.
 */
export function normalizeTargets(target: string | string[]): string[] {
  const raw = Array.isArray(target) ? target : [target]
  const cleaned: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') continue
    const name = t.trim()
    if (name && !cleaned.includes(name)) cleaned.push(name)
  }
  if (cleaned.length === 0) throw new Error('agent_send needs at least one target')
  return cleaned
}

/**
 * True when a slash command's first token is a destructive verb. Used to
 * reject destructive commands sent to an array of targets (blast-radius guard).
 */
export function isDestructiveSlash(command: string): boolean {
  const first = command.trim().split(/\s+/)[0] ?? ''
  return (DESTRUCTIVE_COMMANDS as readonly string[]).includes(first)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/agent-bus && bun test send-guards.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/send-guards.ts plugins/agent-bus/send-guards.test.ts
git commit -m "feat(agent-bus): add send-guards (target normalize + destructive detect)"
```

---

## Task 2: `prompt-inbox.ts` — sender side (resolve dir, validate, write)

**Files:**
- Create: `plugins/agent-bus/prompt-inbox.ts`
- Test: `plugins/agent-bus/prompt-inbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/agent-bus/prompt-inbox.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolvePromptInboxDir,
  validatePromptPayload,
  writePromptMessage,
  MAX_BODY_BYTES,
} from './prompt-inbox'

describe('resolvePromptInboxDir', () => {
  test('derives <project>/.claude/channels/agent-bus/inbox', () => {
    expect(resolvePromptInboxDir('/repo/bot-02')).toBe(
      join('/repo/bot-02', '.claude', 'channels', 'agent-bus', 'inbox'),
    )
  })
})

describe('validatePromptPayload', () => {
  test('accepts a well-formed prompt', () => {
    expect(validatePromptPayload({ kind: 'prompt', body: 'hi' })).toEqual({ ok: true })
  })
  test('rejects non-prompt kind', () => {
    expect(validatePromptPayload({ kind: 'slash', body: 'x' }).ok).toBe(false)
  })
  test('rejects empty body', () => {
    expect(validatePromptPayload({ kind: 'prompt', body: '' }).ok).toBe(false)
  })
  test('rejects body over the byte cap', () => {
    const big = 'a'.repeat(MAX_BODY_BYTES + 1)
    expect(validatePromptPayload({ kind: 'prompt', body: big }).ok).toBe(false)
  })
})

describe('writePromptMessage', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-inbox-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('writes a prompt file into the peer agent-bus inbox', () => {
    const peerDir = join(root, 'bot-02')
    const res = writePromptMessage(peerDir, 'bot-01', 'tolong review file X')
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const inbox = resolvePromptInboxDir(peerDir)
    const files = readdirSync(inbox).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const body = JSON.parse(readFileSync(join(inbox, files[0]!), 'utf8'))
    expect(body.from).toBe('bot-01')
    expect(body.kind).toBe('prompt')
    expect(body.body).toBe('tolong review file X')
    expect(body.hop_count).toBe(0)
    expect(body.broadcast_group_id).toBeUndefined()
  })

  test('includes broadcast_group_id when provided', () => {
    const peerDir = join(root, 'bot-03')
    writePromptMessage(peerDir, 'bot-01', 'hi', { broadcastGroupId: 'grp-1' })
    const inbox = resolvePromptInboxDir(peerDir)
    const file = readdirSync(inbox).filter(f => f.endsWith('.json'))[0]!
    const body = JSON.parse(readFileSync(join(inbox, file), 'utf8'))
    expect(body.broadcast_group_id).toBe('grp-1')
  })

  test('no .tmp file is left behind', () => {
    const peerDir = join(root, 'bot-04')
    writePromptMessage(peerDir, 'bot-01', 'hi')
    const inbox = resolvePromptInboxDir(peerDir)
    expect(readdirSync(inbox).some(f => f.includes('.tmp'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/agent-bus && bun test prompt-inbox.test.ts`
Expected: FAIL — `Cannot find module './prompt-inbox'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/agent-bus/prompt-inbox.ts`:

```typescript
/**
 * The agent-bus prompt inbox contract.
 *
 * A prompt is a one-way natural-language message. The sender writes a JSON
 * file into the PEER's own agent-bus inbox:
 *   <peer-project>/.claude/channels/agent-bus/inbox/<uuid>.json
 * The peer's agent-bus MCP server consumes it and emits it to its AI as a
 * <channel source="agent"> inbound message. There is no reply channel.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Max prompt body size in UTF-8 bytes (8 KB). */
export const MAX_BODY_BYTES = 8 * 1024
/** Max forwards before a message is dropped (loop backstop). */
export const HOP_CAP = 5

export type PromptPayload = {
  kind: 'prompt'
  body: string
}

export type PromptMessage = {
  id: string
  ts: string
  from: string
  kind: 'prompt'
  body: string
  hop_count: number
  broadcast_group_id?: string
}

export interface ValidationResult {
  ok: boolean
  error?: string
}

/** Resolve a project dir to its agent-bus inbox directory. */
export function resolvePromptInboxDir(projectDir: string): string {
  return join(projectDir, '.claude', 'channels', 'agent-bus', 'inbox')
}

/** Validate a prompt payload at the SENDER, before writing. */
export function validatePromptPayload(p: unknown): ValidationResult {
  if (!p || typeof p !== 'object') return { ok: false, error: 'payload must be an object' }
  const o = p as Record<string, unknown>
  if (o.kind !== 'prompt') return { ok: false, error: `kind must be "prompt" (got ${JSON.stringify(o.kind)})` }
  if (typeof o.body !== 'string' || o.body.length === 0) {
    return { ok: false, error: 'body must be a non-empty string' }
  }
  if (Buffer.byteLength(o.body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` }
  }
  return { ok: true }
}

/** Write a prompt file into the peer's agent-bus inbox (atomic tmp+rename). */
export function writePromptMessage(
  peerProjectDir: string,
  from: string,
  body: string,
  opts?: { broadcastGroupId?: string },
): { id: string; path: string } {
  const v = validatePromptPayload({ kind: 'prompt', body })
  if (!v.ok) throw new Error(v.error ?? 'invalid prompt payload')

  const inbox = resolvePromptInboxDir(peerProjectDir)
  mkdirSync(inbox, { recursive: true })
  const id = randomUUID()
  const msg: PromptMessage = {
    id,
    ts: new Date().toISOString(),
    from,
    kind: 'prompt',
    body,
    hop_count: 0,
  }
  if (opts?.broadcastGroupId) msg.broadcast_group_id = opts.broadcastGroupId

  const finalPath = join(inbox, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(msg, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/agent-bus && bun test prompt-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/prompt-inbox.ts plugins/agent-bus/prompt-inbox.test.ts
git commit -m "feat(agent-bus): add prompt-inbox sender (resolve/validate/write)"
```

---

## Task 3: `prompt-inbox.ts` — receiver side (`validateInboundPrompt`)

**Files:**
- Modify: `plugins/agent-bus/prompt-inbox.ts`
- Test: `plugins/agent-bus/prompt-inbox.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `plugins/agent-bus/prompt-inbox.test.ts`:

```typescript
import { validateInboundPrompt } from './prompt-inbox'

describe('validateInboundPrompt', () => {
  const base = { id: 'x', ts: 't', from: 'bot-01', kind: 'prompt', body: 'hi', hop_count: 0 }

  test('accepts a valid inbound prompt and returns the parsed message', () => {
    const r = validateInboundPrompt(base)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.msg.from).toBe('bot-01')
      expect(r.msg.body).toBe('hi')
    }
  })
  test('rejects missing from', () => {
    expect(validateInboundPrompt({ ...base, from: '' }).ok).toBe(false)
  })
  test('rejects wrong kind', () => {
    expect(validateInboundPrompt({ ...base, kind: 'slash' }).ok).toBe(false)
  })
  test('rejects oversized body', () => {
    expect(validateInboundPrompt({ ...base, body: 'a'.repeat(9000) }).ok).toBe(false)
  })
  test('rejects hop_count over the cap', () => {
    expect(validateInboundPrompt({ ...base, hop_count: 6 }).ok).toBe(false)
  })
  test('defaults hop_count to 0 when absent', () => {
    const r = validateInboundPrompt({ id: 'x', ts: 't', from: 'b', kind: 'prompt', body: 'hi' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.msg.hop_count).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/agent-bus && bun test prompt-inbox.test.ts`
Expected: FAIL — `validateInboundPrompt is not a function` / not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `plugins/agent-bus/prompt-inbox.ts`:

```typescript
export type InboundValidation =
  | { ok: true; msg: PromptMessage }
  | { ok: false; error: string }

/**
 * Validate + parse a prompt file at the RECEIVER. Tolerates a missing
 * hop_count (defaults to 0). Enforces from, kind, body size, and hop cap.
 */
export function validateInboundPrompt(obj: unknown): InboundValidation {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not an object' }
  const o = obj as Record<string, unknown>
  if (o.kind !== 'prompt') return { ok: false, error: `kind must be "prompt" (got ${JSON.stringify(o.kind)})` }
  if (typeof o.from !== 'string' || o.from.length === 0) return { ok: false, error: 'from must be a non-empty string' }
  if (typeof o.body !== 'string' || o.body.length === 0) return { ok: false, error: 'body must be a non-empty string' }
  if (Buffer.byteLength(o.body, 'utf8') > MAX_BODY_BYTES) return { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` }
  const hop = typeof o.hop_count === 'number' ? o.hop_count : 0
  if (hop > HOP_CAP) return { ok: false, error: `hop_count ${hop} exceeds cap ${HOP_CAP}` }

  const msg: PromptMessage = {
    id: typeof o.id === 'string' ? o.id : 'unknown',
    ts: typeof o.ts === 'string' ? o.ts : new Date().toISOString(),
    from: o.from,
    kind: 'prompt',
    body: o.body,
    hop_count: hop,
  }
  if (typeof o.broadcast_group_id === 'string') msg.broadcast_group_id = o.broadcast_group_id
  return { ok: true, msg }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/agent-bus && bun test prompt-inbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/prompt-inbox.ts plugins/agent-bus/prompt-inbox.test.ts
git commit -m "feat(agent-bus): add inbound prompt validation (receiver side)"
```

---

## Task 4: `prompt-watcher.ts` — consume + sweep + watcher

**Files:**
- Create: `plugins/agent-bus/prompt-watcher.ts`
- Test: `plugins/agent-bus/prompt-watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/agent-bus/prompt-watcher.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { consumeInboxFile, sweepInbox } from './prompt-watcher'
import type { PromptMessage } from './prompt-inbox'

function writeFile(inbox: string, name: string, obj: unknown) {
  mkdirSync(inbox, { recursive: true })
  writeFileSync(join(inbox, name), JSON.stringify(obj))
}

const noop = (_: string) => {}

describe('consumeInboxFile', () => {
  let inbox: string
  beforeEach(() => {
    inbox = mkdtempSync(join(tmpdir(), 'pw-'))
  })
  afterEach(() => {
    rmSync(inbox, { recursive: true, force: true })
  })

  test('valid file → emit called, file deleted', () => {
    const got: PromptMessage[] = []
    writeFile(inbox, 'a.json', { id: 'a', ts: 't', from: 'bot-01', kind: 'prompt', body: 'hi', hop_count: 0 })
    consumeInboxFile(inbox, 'a.json', m => got.push(m), noop)
    expect(got).toHaveLength(1)
    expect(got[0]!.body).toBe('hi')
    expect(existsSync(join(inbox, 'a.json'))).toBe(false)
  })

  test('malformed JSON → moved to .rejected, emit not called', () => {
    const got: PromptMessage[] = []
    mkdirSync(inbox, { recursive: true })
    writeFileSync(join(inbox, 'bad.json'), '{ not json')
    consumeInboxFile(inbox, 'bad.json', m => got.push(m), noop)
    expect(got).toHaveLength(0)
    expect(existsSync(join(inbox, 'bad.json'))).toBe(false)
    expect(existsSync(join(inbox, '.rejected', 'bad.json'))).toBe(true)
  })

  test('schema-invalid (oversized body) → moved to .rejected', () => {
    const got: PromptMessage[] = []
    writeFile(inbox, 'big.json', { id: 'b', ts: 't', from: 'bot-01', kind: 'prompt', body: 'a'.repeat(9000), hop_count: 0 })
    consumeInboxFile(inbox, 'big.json', m => got.push(m), noop)
    expect(got).toHaveLength(0)
    expect(existsSync(join(inbox, '.rejected', 'big.json'))).toBe(true)
  })
})

describe('sweepInbox', () => {
  let inbox: string
  beforeEach(() => {
    inbox = mkdtempSync(join(tmpdir(), 'pw-sweep-'))
  })
  afterEach(() => {
    rmSync(inbox, { recursive: true, force: true })
  })

  test('consumes all valid files, ignores .tmp', () => {
    const got: PromptMessage[] = []
    for (let i = 0; i < 3; i++) {
      writeFile(inbox, `m${i}.json`, { id: `m${i}`, ts: 't', from: 'b', kind: 'prompt', body: `b${i}`, hop_count: 0 })
    }
    writeFileSync(join(inbox, 'x.json.tmp.1'), 'partial')
    sweepInbox(inbox, m => got.push(m), noop)
    expect(got).toHaveLength(3)
    expect(existsSync(join(inbox, 'x.json.tmp.1'))).toBe(true) // .tmp left untouched
  })

  test('overflow: beyond max → excess moved to .overflow', () => {
    const got: PromptMessage[] = []
    for (let i = 0; i < 5; i++) {
      writeFile(inbox, `m${i}.json`, { id: `m${i}`, ts: 't', from: 'b', kind: 'prompt', body: `b${i}`, hop_count: 0 })
    }
    sweepInbox(inbox, m => got.push(m), noop, { max: 2 })
    expect(got).toHaveLength(2)
    expect(readdirSync(join(inbox, '.overflow'))).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/agent-bus && bun test prompt-watcher.test.ts`
Expected: FAIL — `Cannot find module './prompt-watcher'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/agent-bus/prompt-watcher.ts`:

```typescript
/**
 * Receiver runtime for the agent-bus prompt inbox.
 *
 * The agent-bus MCP server installs startPromptWatcher() over its own inbox.
 * Each valid prompt file is parsed and handed to the `emit` callback (which
 * the server turns into a notifications/claude/channel message), then deleted.
 * Invalid files are quarantined to .rejected/. A boot-time sweep drains any
 * backlog (prompts that arrived while this agent was offline), capped to
 * avoid a flood; the excess is parked in .overflow/.
 *
 * fs.watch alone is unreliable on Windows (atomic-rename inode swaps), so the
 * watcher is paired with an interval sweep — same defensive shape as the
 * telegram plugin's system-outbox watcher.
 */
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  existsSync,
  watch,
  type FSWatcher,
} from 'node:fs'
import { join } from 'node:path'
import { validateInboundPrompt, type PromptMessage } from './prompt-inbox'

export type EmitFn = (msg: PromptMessage) => void
export type LogFn = (line: string) => void

const DEFAULT_MAX_PER_SWEEP = 50
const WATCH_DEFER_MS = 50
const SWEEP_INTERVAL_MS = 2_000

function quarantine(inboxDir: string, filename: string, subdir: string, reason: string, log: LogFn): void {
  try {
    const dest = join(inboxDir, subdir)
    mkdirSync(dest, { recursive: true })
    renameSync(join(inboxDir, filename), join(dest, filename))
    log(`prompt ${filename} → ${subdir} (${reason})`)
  } catch (err) {
    log(`failed to quarantine ${filename} to ${subdir}: ${err}`)
  }
}

/**
 * Consume one inbox file: read → validate → emit → delete. On any failure
 * the file is moved to .rejected/ so it is never retried in a loop.
 */
export function consumeInboxFile(inboxDir: string, filename: string, emit: EmitFn, log: LogFn): void {
  const full = join(inboxDir, filename)
  if (!existsSync(full)) return
  let raw: string
  try {
    raw = readFileSync(full, 'utf8')
  } catch (err) {
    log(`failed to read ${filename}: ${err}`)
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    quarantine(inboxDir, filename, '.rejected', 'malformed JSON', log)
    return
  }
  const v = validateInboundPrompt(parsed)
  if (!v.ok) {
    quarantine(inboxDir, filename, '.rejected', v.error, log)
    return
  }
  try {
    emit(v.msg)
  } catch (err) {
    log(`emit failed for ${filename}: ${err}`)
    return // leave file; a later sweep retries
  }
  try {
    unlinkSync(full)
  } catch (err) {
    log(`failed to delete ${filename} after emit: ${err}`)
  }
}

/** Consume every .json file in the inbox, capped at `max`; overflow parked. */
export function sweepInbox(inboxDir: string, emit: EmitFn, log: LogFn, opts?: { max?: number }): void {
  const max = opts?.max ?? DEFAULT_MAX_PER_SWEEP
  let names: string[]
  try {
    names = readdirSync(inboxDir).filter(f => f.endsWith('.json') && !f.includes('.tmp'))
  } catch {
    return // inbox missing transiently
  }
  names.sort() // stable order
  const take = names.slice(0, max)
  const overflow = names.slice(max)
  for (const name of take) consumeInboxFile(inboxDir, name, emit, log)
  for (const name of overflow) quarantine(inboxDir, name, '.overflow', 'backlog cap exceeded', log)
}

/**
 * Install the watcher. Returns a stop() that closes the watcher and clears
 * the sweep interval. Runs an immediate boot sweep to drain backlog.
 */
export function startPromptWatcher(opts: {
  inboxDir: string
  emit: EmitFn
  log: LogFn
}): () => void {
  const { inboxDir, emit, log } = opts
  mkdirSync(inboxDir, { recursive: true })

  // Boot sweep: drain anything queued while we were offline.
  sweepInbox(inboxDir, emit, log)

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(inboxDir, (_event, filename) => {
      if (!filename) return
      const name = filename.toString()
      if (!name.endsWith('.json') || name.includes('.tmp')) return
      setTimeout(() => consumeInboxFile(inboxDir, name, emit, log), WATCH_DEFER_MS)
    })
  } catch (err) {
    log(`failed to install inbox watcher: ${err}`)
  }

  const interval = setInterval(() => sweepInbox(inboxDir, emit, log), SWEEP_INTERVAL_MS)

  return () => {
    try { watcher?.close() } catch { /* noop */ }
    try { clearInterval(interval) } catch { /* noop */ }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/agent-bus && bun test prompt-watcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/prompt-watcher.ts plugins/agent-bus/prompt-watcher.test.ts
git commit -m "feat(agent-bus): add prompt-watcher (consume/sweep/watch)"
```

---

## Task 5: `server.ts` — `agent_send` routing + broadcast + guard

**Files:**
- Modify: `plugins/agent-bus/server.ts:149-181` (the `agent_send` case)
- Modify: `plugins/agent-bus/integration.test.ts` (append a prompt loopback test)

- [ ] **Step 1: Write the failing test**

Append to `plugins/agent-bus/integration.test.ts` (add imports at top of file alongside the existing ones):

```typescript
import { resolvePromptInboxDir, validateInboundPrompt } from './prompt-inbox'
import { writePromptMessage } from './prompt-inbox'
```

Then append inside the existing `describe('integration: bot-01 ↔ bot-02 loopback', ...)` block:

```typescript
  test('prompt loopback: bot-01 writes a prompt into bot-02 agent-bus inbox; receiver validates it', () => {
    // sender side
    const res = writePromptMessage(bot02Dir, 'bot-01', 'tolong review PR #5')
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    // file landed in the AGENT-BUS inbox, not the pty-controller pending dir
    const inbox = resolvePromptInboxDir(bot02Dir)
    const files = readdirSync(inbox).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    // receiver side parses it cleanly
    const obj = JSON.parse(readFileSync(join(inbox, files[0]!), 'utf8'))
    const v = validateInboundPrompt(obj)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.msg.from).toBe('bot-01')
      expect(v.msg.body).toBe('tolong review PR #5')
    }

    // and the pty-controller pending dir stays empty (separate channel)
    const pending = join(bot02StateDir, 'pending')
    const pendingFiles = existsSync(pending) ? readdirSync(pending) : []
    expect(pendingFiles).toHaveLength(0)
  })
```

Add `existsSync` to the `node:fs` import line at the top of `integration.test.ts`:

```typescript
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
```

- [ ] **Step 2: Run test to verify it fails (or passes for the module path)**

Run: `cd plugins/agent-bus && bun test integration.test.ts`
Expected: This test PASSES already (it exercises `writePromptMessage` + `validateInboundPrompt` from Tasks 2-3, which exist). It is the regression anchor proving the prompt channel is separate from the pty pending dir. If it fails, fix the imports before proceeding.

- [ ] **Step 3: Rewrite the `agent_send` case in `server.ts`**

Replace the entire `case 'agent_send': { ... }` block (currently `server.ts:149-181`) with:

```typescript
      case 'agent_send': {
        const target = args.target
        const payload = args.payload as Record<string, unknown> | undefined
        const correlation = typeof args.correlation_id === 'string' ? args.correlation_id : undefined
        if (target === undefined) throw new Error('target (string or string[]) is required')
        if (!payload || typeof payload !== 'object') throw new Error('payload is required')

        const targets = normalizeTargets(target as string | string[])
        const kind = payload.kind

        // SELF — derive from CLAUDE_PROJECT_DIR basename (matches wrapper.ts).
        const selfDir = (process.env.CLAUDE_PROJECT_DIR ?? '').replace(/[\/\\]+$/, '')
        const self = selfDir.split(/[\/\\]/).filter(Boolean).pop() ?? 'unknown'

        const reg = readRegistry(REGISTRY_PATH)

        if (kind === 'prompt') {
          const body = payload.body
          if (typeof body !== 'string' || body.length === 0) throw new Error('prompt payload needs a non-empty body')
          // One broadcast_group_id shared across all targets of this call.
          const groupId = targets.length > 1 ? randomUUID() : undefined
          const results = targets.map(name => {
            const entry = reg.agents[name]
            if (!entry) {
              return { target: name, ok: false, error: 'not in registry', online: false }
            }
            try {
              const r = writePromptMessage(entry.project_dir, self, body, { broadcastGroupId: groupId })
              return { target: name, ok: true, path: r.path, online: isOnline(entry.last_heartbeat) }
            } catch (err) {
              return { target: name, ok: false, error: err instanceof Error ? err.message : String(err), online: isOnline(entry.last_heartbeat) }
            }
          })
          return {
            content: [{ type: 'text', text: JSON.stringify({ kind: 'prompt', broadcast_group_id: groupId, results }, null, 2) }],
          }
        }

        if (kind === 'slash') {
          const command = payload.command
          if (typeof command !== 'string' || !command) throw new Error('slash payload needs a command')
          // Blast-radius guard: never fan out a destructive command.
          if (targets.length > 1 && isDestructiveSlash(command)) {
            throw new Error(`refusing to broadcast destructive command "${command}" to ${targets.length} targets`)
          }
          const results = targets.map(name => {
            const entry = reg.agents[name]
            if (!entry) {
              return { target: name, ok: false, error: 'not in registry', online: false }
            }
            try {
              const r = writeAgentMessage(entry.state_dir, self, payload as unknown as AgentPayload, correlation)
              return { target: name, ok: true, path: r.path, online: isOnline(entry.last_heartbeat) }
            } catch (err) {
              return { target: name, ok: false, error: err instanceof Error ? err.message : String(err), online: isOnline(entry.last_heartbeat) }
            }
          })
          return {
            content: [{ type: 'text', text: JSON.stringify({ kind: 'slash', results }, null, 2) }],
          }
        }

        throw new Error(`unsupported payload kind: ${JSON.stringify(kind)} (expected "prompt" or "slash")`)
      }
```

- [ ] **Step 4: Add the new imports at the top of `server.ts`**

After the existing `import { writeAgentMessage, type AgentPayload } from './inbox-writer'` line (server.ts:21), add:

```typescript
import { writePromptMessage } from './prompt-inbox'
import { normalizeTargets, isDestructiveSlash } from './send-guards'
import { randomUUID } from 'node:crypto'
```

- [ ] **Step 5: Run the full suite to verify nothing broke**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS (all prior tests + the new prompt loopback test).

- [ ] **Step 6: Commit**

```bash
git add plugins/agent-bus/server.ts plugins/agent-bus/integration.test.ts
git commit -m "feat(agent-bus): route agent_send by kind + broadcast fan-out + blast-radius guard"
```

---

## Task 6: `server.ts` — install the prompt watcher on boot

**Files:**
- Modify: `plugins/agent-bus/server.ts` (near the bottom, after `await mcp.connect(transport)`)

- [ ] **Step 1: Add the boot-time watcher wiring**

After the line `process.stderr.write(\`agent-bus: MCP server connected\n\`)` (currently the last line, `server.ts:199`), append:

```typescript

// --- Prompt inbox watcher --------------------------------------------------
// Run a background watcher over THIS agent's own prompt inbox. Each prompt
// becomes a notifications/claude/channel inbound message so the local AI
// sees it as <channel source="agent" from="...">. Mirrors the telegram
// plugin's notification pattern. Requires CLAUDE_PROJECT_DIR; without it we
// can't resolve our own inbox, so we log and skip (agent_send still works).
const SELF_PROJECT_DIR = (process.env.CLAUDE_PROJECT_DIR ?? '').trim()
if (SELF_PROJECT_DIR) {
  const inboxDir = resolvePromptInboxDir(SELF_PROJECT_DIR)
  process.stderr.write(`agent-bus: watching prompt inbox ${inboxDir}\n`)
  const stopWatcher = startPromptWatcher({
    inboxDir,
    log: line => process.stderr.write(`agent-bus: ${line}\n`),
    emit: msg => {
      const meta: Record<string, string> = {
        from: msg.from,
        ts: msg.ts,
        kind: 'prompt',
      }
      if (msg.broadcast_group_id) meta.broadcast_group_id = msg.broadcast_group_id
      void mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: msg.body,
          meta,
        },
      })
    },
  })

  const shutdown = () => {
    try { stopWatcher() } catch { /* noop */ }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)
} else {
  process.stderr.write('agent-bus: CLAUDE_PROJECT_DIR unset — prompt inbox watcher disabled\n')
}
```

- [ ] **Step 2: Add the imports for the watcher at the top of `server.ts`**

Extend the prompt-inbox import added in Task 5 so it reads:

```typescript
import { writePromptMessage, resolvePromptInboxDir } from './prompt-inbox'
import { startPromptWatcher } from './prompt-watcher'
```

- [ ] **Step 3: Verify the server starts and emits on a dropped file (manual smoke harness)**

Create a throwaway check (do NOT commit this file). Create `plugins/agent-bus/_smoke.ts`:

```typescript
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startPromptWatcher } from './prompt-watcher'
import { resolvePromptInboxDir } from './prompt-inbox'

const proj = mkdtempSync(join(tmpdir(), 'agent-bus-smoke-'))
const inbox = resolvePromptInboxDir(proj)
mkdirSync(inbox, { recursive: true })
let emitted = 0
const stop = startPromptWatcher({ inboxDir: inbox, log: () => {}, emit: () => { emitted++ } })
writeFileSync(join(inbox, 'a.json'), JSON.stringify({ id: 'a', ts: 't', from: 'bot-01', kind: 'prompt', body: 'hi', hop_count: 0 }))
await new Promise(r => setTimeout(r, 300))
stop()
console.log('emitted =', emitted, '(expected 1)', 'file gone =', !existsSync(join(inbox, 'a.json')))
```

Run: `cd plugins/agent-bus && bun _smoke.ts`
Expected: `emitted = 1 (expected 1) file gone = true`

Then delete the smoke file: `rm plugins/agent-bus/_smoke.ts`

- [ ] **Step 4: Run the full suite**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS (no new test file; this task is wiring verified by the smoke harness).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/server.ts
git commit -m "feat(agent-bus): emit inbound prompts via notifications/claude/channel on boot"
```

---

## Task 7: `server.ts` — update tool schema + descriptions

**Files:**
- Modify: `plugins/agent-bus/server.ts:41-44` (server version) and `server.ts:66-104` (the `agent_send` tool definition)

- [ ] **Step 1: Bump the server version string**

Change `server.ts:42` from:

```typescript
  { name: 'agent-bus', version: '0.0.1' },
```

to:

```typescript
  { name: 'agent-bus', version: '0.0.2' },
```

- [ ] **Step 2: Replace the `agent_send` tool definition**

Replace the `agent_send` entry inside the `tools` array (currently `server.ts:66-104`) with:

```typescript
    {
      name: 'agent_send',
      description:
        "Send a one-way message to one or more peer bots. Two kinds:\n" +
        "  • kind=\"prompt\": deliver a natural-language instruction to the peer's Claude session (it arrives as an inbound message and the peer acts on it). One-way — there is NO reply channel. If you want the peer to report back, say so inside the body (e.g. \"...when done, send a one-line summary back to bot-01\").\n" +
        "  • kind=\"slash\": inject a slash command into the peer's PTY via pty-controller (e.g. /clear, /rename, /effort).\n" +
        "`target` may be a single name or an array (broadcast/fan-out). DO NOT call autonomously — only when the user explicitly asks you to message another agent, OR when an inbound agent prompt explicitly told you to report back. Never auto-reply to an incoming agent message otherwise. Destructive slash commands (/clear, /delete) cannot be broadcast to an array.",
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            description: 'Target agent name, or an array of names for broadcast. Each must be registered.',
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          payload: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['prompt', 'slash'] },
              body: {
                type: 'string',
                description: 'For kind="prompt": the natural-language instruction (max 8 KB).',
              },
              command: {
                type: 'string',
                description: 'For kind="slash": slash command including leading "/" (e.g. "/clear", "/rename").',
              },
              sessionName: {
                type: 'string',
                description: 'For kind="slash" with command="/clear": chain a /rename to this session name.',
              },
              args: {
                type: 'string',
                description: 'For kind="slash": optional argument string appended to command with a space.',
              },
              confirmAfterMs: {
                type: 'number',
                description: 'For kind="slash": optional auto-confirm pacing for picker commands (e.g. /effort).',
              },
            },
            required: ['kind'],
          },
          correlation_id: {
            type: 'string',
            description: 'Optional UUID for slash sends; auto-generated if omitted.',
          },
        },
        required: ['target', 'payload'],
      },
    },
```

- [ ] **Step 3: Update the `agent_list` / `agent_status` descriptions are unchanged — verify no other edits needed**

Run: `cd plugins/agent-bus && bun build server.ts --target=bun --outdir=/tmp/ab-check`
Expected: `Bundled N modules` with no type/parse errors.

- [ ] **Step 4: Run the full suite**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/server.ts
git commit -m "feat(agent-bus): expose kind=prompt + array target in agent_send tool schema"
```

---

## Task 8: Skill `using-agent-bus` — anti-bounce + fan-out + broadcast

**Files:**
- Modify: `plugins/agent-bus/skills/using-agent-bus/SKILL.md`

- [ ] **Step 1: Read the current skill to match its voice and structure**

Run: `cat plugins/agent-bus/skills/using-agent-bus/SKILL.md`
Note its existing sections so the additions slot in without duplicating headings.

- [ ] **Step 2: Add/replace the prompt + anti-bounce guidance**

Ensure the skill body contains these sections (add them; merge with existing tool-usage rules rather than duplicating). Use this exact content for the new parts:

````markdown
## Sending prompts (kind="prompt")

`agent_send` with `kind:"prompt"` delivers a natural-language instruction to a
peer. The peer's AI receives it as an inbound `<channel source="agent" from="...">`
message and acts on it automatically — treat it like the peer's user typed it.

This is **one-way**. There is no reply channel. If the leader needs a result
back, the leader must say so *inside the prompt body*:

> "Audit the test suite in this repo. When done, send a one-line summary back
>  to bot-01 via agent_send."

The worker then issues ONE one-way prompt back. That is the only way a "reply"
happens — there is no automatic pairing.

## Anti-bounce rule (prevents infinite loops)

An incoming `<channel source="agent">` message is **terminal context**, not a
trigger to send more agent messages. You MUST NOT call `agent_send` in response
to an agent message UNLESS:

1. the user explicitly asks you to, OR
2. the incoming prompt body explicitly tells you to report back to a named bot.

Default behavior on receiving an agent prompt: do the work, report to your own
Telegram, and STOP. Do not bounce a message back just to acknowledge.

## Leader / worker fan-out

When the user asks one bot to coordinate others:

1. `agent_list` to see who is online.
2. `agent_send` with a `target` array to broadcast the prompt to the chosen
   workers (one call, fan-out). Warn the user about any offline targets — their
   prompt queues and is delivered when they next boot.
3. Report to the user: "sent to N workers (bot-03 was offline, queued)".
4. Workers do the work and report to their own Telegram. If you asked them to
   report back, summarize the replies to the user when they arrive, then STOP.

## Anti-patterns

- Do not send to offline peers without telling the user.
- Do not initiate prompts autonomously — only on explicit user request.
- Do not send a body larger than 8 KB.
- Do not auto-reply to an incoming agent prompt (see anti-bounce rule).
- Do not broadcast destructive slash commands (/clear, /delete) — the tool
  rejects it anyway.
````

- [ ] **Step 3: Verify the skill still parses (frontmatter intact)**

Run: `head -5 plugins/agent-bus/skills/using-agent-bus/SKILL.md`
Expected: YAML frontmatter (`---`, `name:`, `description:`, `---`) unchanged at the top.

- [ ] **Step 4: Commit**

```bash
git add plugins/agent-bus/skills/using-agent-bus/SKILL.md
git commit -m "docs(agent-bus): skill guidance for prompts, anti-bounce, fan-out"
```

---

## Task 9: Version bump + full verification + release commit

**Files:**
- Modify: `plugins/agent-bus/.claude-plugin/plugin.json`
- Modify: `plugins/agent-bus/package.json:3`

- [ ] **Step 1: Bump plugin.json version**

In `plugins/agent-bus/.claude-plugin/plugin.json`, change `"version": "0.0.1"` to `"version": "0.0.2"`.

- [ ] **Step 2: Bump package.json version**

In `plugins/agent-bus/package.json`, change `"version": "0.0.1"` to `"version": "0.0.2"`.

- [ ] **Step 3: Run the full agent-bus test suite**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS — all unit + integration tests green (registry, inbox-writer, send-guards, prompt-inbox, prompt-watcher, integration including prompt loopback).

- [ ] **Step 4: Confirm the server bundles cleanly**

Run: `cd plugins/agent-bus && bun build server.ts --target=bun --outdir=/tmp/ab-final`
Expected: `Bundled N modules` with no errors.

- [ ] **Step 5: Commit the release**

```bash
git add plugins/agent-bus/.claude-plugin/plugin.json plugins/agent-bus/package.json
git commit -m "release(agent-bus): bump to 0.0.2 — one-way prompt delivery + broadcast"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** §3.1 prompt write + watcher (Tasks 2,4,6), §3.1 startup sweep + overflow (Task 4), §4 schema + 8 KB + hop cap (Tasks 2,3), §5 routing + broadcast + blast-radius guard (Task 5), channel tag emit (Task 6), §5 tool schema (Task 7), §6 skill (Task 8), §11 version bump (Task 9). §3.2 wrapper untouched — no task modifies pty-controller (correct).
- **Manual smoke (spec §8):** end-to-end with two real bots is a human step Mirza runs after merge; not automatable here.
- **Type consistency:** `PromptMessage` shape is identical in `prompt-inbox.ts`, `prompt-watcher.ts` (imported), and the `emit` callback in `server.ts`. `normalizeTargets`/`isDestructiveSlash` signatures match their call sites in Task 5.
- **Slash path unchanged:** `writeAgentMessage` + `inbox-writer.ts` are reused as-is for `kind:"slash"`; the only change is server.ts now loops over normalized targets.
- **Note on `inbox-writer.ts`:** its `validatePayload` still hard-rejects `kind:"prompt"`. That is now dead defense (server routes prompt away from it) but is harmless and left as a guard. No task touches it.
