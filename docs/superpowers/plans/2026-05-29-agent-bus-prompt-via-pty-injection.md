# Agent-Bus Prompt via PTY Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement agent-bus `kind:"prompt"` so the peer's `mirza-cc` wrapper types the prompt into the peer's PTY as a normal user turn, instead of the (non-working) channel-notification path.

**Architecture:** agent-bus becomes a pure sender: it flattens the body, prepends an anti-bounce marker, and writes a `type:"prompt"` payload into the peer's existing `pty-controller/pending/` inbox. The peer's wrapper (already watching that inbox) types the text + Enter into the PTY. The agent-bus channel watcher/notification code is torn down.

**Tech Stack:** TypeScript on Bun (agent-bus, `bun:test`); the wrapper runs on tsx/node but a pure helper is unit-tested with `bun:test`. Atomic tmp+rename file writes.

**Spec:** `docs/superpowers/specs/2026-05-29-agent-bus-prompt-via-pty-injection-design.md`

---

## File Structure

- `plugins/agent-bus/prompt-compose.ts` (NEW) — pure compose/validate + the writer that drops a `type:"prompt"` payload into a peer's `pty-controller/pending/`. One responsibility: turn a (from, body) into an injectable payload on disk.
- `plugins/agent-bus/server.ts` (MODIFY) — route `kind:"prompt"` through `prompt-compose`; remove the boot watcher + `notifications/claude/channel` emit + obsolete imports; update the `agent_send` tool description; bump server version.
- `plugins/agent-bus/prompt-inbox.ts`, `prompt-inbox.test.ts`, `prompt-watcher.ts`, `prompt-watcher.test.ts` (DELETE) — channel-era code.
- `plugins/agent-bus/integration.test.ts` (MODIFY) — replace the agent-bus-inbox loopback test with a `pending/`-targeted one.
- `plugins/pty-controller/wrapper/src/prompt-inject.ts` (NEW) — pure helper `promptTextFromPayload`. No side effects, so it is unit-testable (wrapper.ts itself spawns CC on import and cannot be imported in a test).
- `plugins/pty-controller/wrapper/src/prompt-inject.test.ts` (NEW) — `bun:test` for the helper.
- `plugins/pty-controller/wrapper/src/wrapper.ts` (MODIFY) — add `injectText`, a `type:"prompt"` branch in `consumePending`, and `text?` to the payload type.
- Version bumps: `agent-bus` 0.0.2→0.0.3 (plugin.json + package.json + Server() string), `pty-controller` 0.0.21→0.0.22 (plugin.json + package.json).

**Reused unchanged:** `send-guards.ts`, `registry.ts`, `peer-status.ts`, `inbox-writer.ts` (slash path).

**Branch:** do all work on `feat/agent-bus-pty-prompt`.

---

## Task 1: `prompt-compose.ts` — flatten, validate, compose, write

**Files:**
- Create: `plugins/agent-bus/prompt-compose.ts`
- Test: `plugins/agent-bus/prompt-compose.test.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/agent-bus/prompt-compose.test.ts`:

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  MAX_BODY_BYTES,
  validatePromptBody,
  flattenBody,
  composePromptText,
  writePromptToPending,
} from './prompt-compose'

describe('validatePromptBody', () => {
  test('accepts a normal body', () => {
    expect(validatePromptBody('hi')).toEqual({ ok: true })
  })
  test('rejects empty / non-string', () => {
    expect(validatePromptBody('').ok).toBe(false)
    expect(validatePromptBody(undefined).ok).toBe(false)
  })
  test('rejects body over the byte cap', () => {
    expect(validatePromptBody('a'.repeat(MAX_BODY_BYTES + 1)).ok).toBe(false)
  })
})

describe('flattenBody', () => {
  test('collapses CR/LF runs to a single space and trims', () => {
    expect(flattenBody('  line1\n\nline2\r\nline3  ')).toBe('line1 line2 line3')
  })
})

describe('composePromptText', () => {
  test('prepends the anti-bounce marker naming the sender and ends with the flattened body', () => {
    const out = composePromptText('bot-01', 'review file X')
    expect(out).toContain('agent bot-01 via agent-bus')
    expect(out).toContain('using-agent-bus')
    expect(out).toContain('anti-bounce')
    expect(out.endsWith('review file X')).toBe(true)
  })
  test('flattens newlines in the body', () => {
    const out = composePromptText('bot-01', 'line1\nline2')
    expect(out.endsWith('line1 line2')).toBe(true)
  })
})

describe('writePromptToPending', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-compose-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('writes a type:"prompt" payload into <peerStateDir>/pending', () => {
    const peerStateDir = join(root, 'bot-02', '.claude', 'channels', 'pty-controller')
    const res = writePromptToPending(peerStateDir, 'bot-01', 'composed text here')
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const pending = join(peerStateDir, 'pending')
    const files = readdirSync(pending).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const body = JSON.parse(readFileSync(join(pending, files[0]!), 'utf8'))
    expect(body.type).toBe('prompt')
    expect(body.from).toBe('bot-01')
    expect(body.text).toBe('composed text here')
    expect(typeof body.ts).toBe('string')
  })

  test('leaves no .tmp file behind', () => {
    const peerStateDir = join(root, 'bot-03', '.claude', 'channels', 'pty-controller')
    writePromptToPending(peerStateDir, 'bot-01', 'x')
    const pending = join(peerStateDir, 'pending')
    expect(readdirSync(pending).some(f => f.includes('.tmp'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/agent-bus && bun test prompt-compose.test.ts`
Expected: FAIL — `Cannot find module './prompt-compose'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/agent-bus/prompt-compose.ts`:

```typescript
/**
 * Compose and deliver a one-way prompt to a peer bot.
 *
 * agent-bus is a pure sender: it validates the body, flattens newlines (CC
 * submits on Enter, so the injected text must be a single line), prepends an
 * anti-bounce attribution marker, and writes a type:"prompt" payload into the
 * peer's pty-controller pending inbox. The peer's mirza-cc wrapper types the
 * text into the PTY as a normal user turn. No channel, no watcher.
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Max prompt body size in UTF-8 bytes (8 KB), checked on the raw body. */
export const MAX_BODY_BYTES = 8 * 1024

export interface ValidationResult {
  ok: boolean
  error?: string
}

/** Validate a prompt body before composing/writing. */
export function validatePromptBody(body: unknown): ValidationResult {
  if (typeof body !== 'string' || body.length === 0) {
    return { ok: false, error: 'body must be a non-empty string' }
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` }
  }
  return { ok: true }
}

/** Collapse all CR/LF runs to a single space and trim. */
export function flattenBody(body: string): string {
  return body.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Compose the final injectable text: anti-bounce attribution marker followed
 * by the flattened body. The marker tells the receiving AI this is an
 * inter-agent instruction and to follow the using-agent-bus anti-bounce rule.
 */
export function composePromptText(from: string, body: string): string {
  const flat = flattenBody(body)
  return (
    `[Pesan dari agent ${from} via agent-bus. Ini instruksi antar-agent, bukan dari user. ` +
    `Perlakukan sesuai skill using-agent-bus — anti-bounce: jangan auto-balas kecuali ` +
    `diminta eksplisit di dalam pesan.] ${flat}`
  )
}

/**
 * Write a type:"prompt" payload into a peer's pty-controller pending inbox
 * (atomic tmp+rename). `text` is the already-composed injectable string.
 */
export function writePromptToPending(
  peerStateDir: string,
  from: string,
  text: string,
): { id: string; path: string } {
  const pending = join(peerStateDir, 'pending')
  mkdirSync(pending, { recursive: true })
  const id = randomUUID()
  const payload = { id, ts: new Date().toISOString(), type: 'prompt', from, text }
  const finalPath = join(pending, `${id}.json`)
  const tmpPath = `${finalPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2))
  renameSync(tmpPath, finalPath)
  return { id, path: finalPath }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/agent-bus && bun test prompt-compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-bus/prompt-compose.ts plugins/agent-bus/prompt-compose.test.ts
git commit -m "feat(agent-bus): add prompt-compose (flatten/marker/write to pending)"
```

---

## Task 2: Rewire `server.ts` prompt routing + remove channel code

**Files:**
- Modify: `plugins/agent-bus/server.ts`
- Modify: `plugins/agent-bus/integration.test.ts`

- [ ] **Step 1: Read the current `server.ts`**

Read `plugins/agent-bus/server.ts` fully. Note: it currently imports from `./prompt-inbox` and `./prompt-watcher`, routes `kind:"prompt"` via `writePromptMessage(entry.project_dir, ...)`, and has a "Prompt inbox watcher" block at the bottom (after `agent-bus: MCP server connected`) that calls `startPromptWatcher` and registers shutdown handlers.

- [ ] **Step 2: Update imports**

Remove these two import lines:
```typescript
import { writePromptMessage, resolvePromptInboxDir } from './prompt-inbox'
import { startPromptWatcher } from './prompt-watcher'
```
Add:
```typescript
import { validatePromptBody, composePromptText, writePromptToPending } from './prompt-compose'
```
Leave `import { normalizeTargets, isDestructiveSlash } from './send-guards'` as is. If `import { randomUUID } from 'node:crypto'` exists and is no longer referenced after Step 3, remove it (the prompt branch no longer generates a broadcast group id; `randomUUID` now lives in `prompt-compose.ts`). Verify with a search before removing.

- [ ] **Step 3: Replace the `kind === 'prompt'` block inside the `agent_send` case**

Find the `if (kind === 'prompt') { ... }` block and replace it entirely with:

```typescript
        if (kind === 'prompt') {
          const body = payload.body
          const v = validatePromptBody(body)
          if (!v.ok) throw new Error(v.error ?? 'invalid prompt body')
          const text = composePromptText(self, body as string)
          const results = targets.map(name => {
            const entry = reg.agents[name]
            if (!entry) {
              return { target: name, ok: false, error: 'not in registry', online: false }
            }
            try {
              const r = writePromptToPending(entry.state_dir, self, text)
              return { target: name, ok: true, path: r.path, online: isOnline(entry.last_heartbeat) }
            } catch (err) {
              return { target: name, ok: false, error: err instanceof Error ? err.message : String(err), online: isOnline(entry.last_heartbeat) }
            }
          })
          return {
            content: [{ type: 'text', text: JSON.stringify({ kind: 'prompt', results }, null, 2) }],
          }
        }
```

The `kind === 'slash'` block and the unknown-kind throw stay exactly as they are.

- [ ] **Step 4: Remove the boot watcher block**

Delete the entire block at the bottom of the file that begins with the comment `// --- Prompt inbox watcher ---...` and the `const SELF_PROJECT_DIR = ...` line through its closing `else { ... }` (the block that calls `resolvePromptInboxDir`, `startPromptWatcher`, and registers `SIGTERM`/`SIGINT`/`stdin` shutdown handlers). The file should end at `process.stderr.write(\`agent-bus: MCP server connected\n\`)` (plus whatever original trailing lines preceded the watcher block).

- [ ] **Step 5: Update `integration.test.ts`**

In `plugins/agent-bus/integration.test.ts`:
- Remove the import line `import { resolvePromptInboxDir, validateInboundPrompt, writePromptMessage } from './prompt-inbox'` (and any duplicate `writePromptMessage` import).
- Add: `import { composePromptText, writePromptToPending } from './prompt-compose'`.
- Remove the existing test titled `'prompt loopback: bot-01 writes a prompt into bot-02 agent-bus inbox; receiver validates it'`.
- Inside the same `describe('integration: bot-01 ↔ bot-02 loopback', ...)` block, add:

```typescript
  test('prompt delivery: writes a type:"prompt" payload into bot-02 pty-controller pending', () => {
    const text = composePromptText('bot-01', 'review PR #5')
    const res = writePromptToPending(bot02StateDir, 'bot-01', text)
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/)

    const pending = join(bot02StateDir, 'pending')
    const files = readdirSync(pending).filter(f => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const body = JSON.parse(readFileSync(join(pending, files[0]!), 'utf8'))
    expect(body.type).toBe('prompt')
    expect(body.from).toBe('bot-01')
    expect(body.text).toContain('agent bot-01 via agent-bus')
    expect(body.text.endsWith('review PR #5')).toBe(true)
  })
```

(`bot02StateDir` already points at `.../bot-02/.claude/channels/pty-controller` in the existing `beforeEach`.) If the `node:fs` import in this file no longer needs `existsSync` after removing the old test, leave it — an unused import here is harmless and removing it is optional.

- [ ] **Step 6: Verify it compiles and tests pass**

Run: `cd plugins/agent-bus && bun build server.ts --target=bun --outdir=/tmp/ab-t2`
Expected: bundles with no errors (server no longer references prompt-inbox/prompt-watcher).
Run: `cd plugins/agent-bus && bun test`
Expected: PASS. (prompt-inbox/prompt-watcher tests still exist and still pass at this point — they are deleted in Task 3.)

- [ ] **Step 7: Commit**

```bash
git add plugins/agent-bus/server.ts plugins/agent-bus/integration.test.ts
git commit -m "feat(agent-bus): route prompt to peer pty-controller pending; remove channel watcher"
```

---

## Task 3: Delete obsolete channel-era files

**Files:**
- Delete: `plugins/agent-bus/prompt-inbox.ts`, `plugins/agent-bus/prompt-inbox.test.ts`, `plugins/agent-bus/prompt-watcher.ts`, `plugins/agent-bus/prompt-watcher.test.ts`

- [ ] **Step 1: Confirm nothing imports them**

Run: `cd plugins/agent-bus && grep -rn "prompt-inbox\|prompt-watcher" . --include="*.ts" | grep -v "\.test\.ts:" || echo "no non-test references"`
Expected: no references in non-test source (server.ts was updated in Task 2). The only matches, if any, are the files about to be deleted.

- [ ] **Step 2: Delete the files**

```bash
cd plugins/agent-bus && rm prompt-inbox.ts prompt-inbox.test.ts prompt-watcher.ts prompt-watcher.test.ts
```

- [ ] **Step 3: Verify the suite is green without them**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS — remaining suites (registry, inbox-writer, peer-status, send-guards, prompt-compose, integration) all green; no missing-module errors.
Run: `cd plugins/agent-bus && bun build server.ts --target=bun --outdir=/tmp/ab-t3`
Expected: bundles cleanly.

- [ ] **Step 4: Commit**

```bash
git add -A plugins/agent-bus
git commit -m "chore(agent-bus): delete channel-era prompt-inbox + prompt-watcher"
```

---

## Task 4: Wrapper — `prompt` payload injection

**Files:**
- Create: `plugins/pty-controller/wrapper/src/prompt-inject.ts`
- Test: `plugins/pty-controller/wrapper/src/prompt-inject.test.ts`
- Modify: `plugins/pty-controller/wrapper/src/wrapper.ts`

- [ ] **Step 1: Write the failing test**

Create `plugins/pty-controller/wrapper/src/prompt-inject.test.ts`:

```typescript
import { test, expect, describe } from 'bun:test'
import { promptTextFromPayload } from './prompt-inject'

describe('promptTextFromPayload', () => {
  test('returns the text for a valid prompt payload', () => {
    expect(promptTextFromPayload({ type: 'prompt', text: 'hello world' })).toBe('hello world')
  })
  test('returns null for a non-prompt payload', () => {
    expect(promptTextFromPayload({ type: 'slash', command: '/clear' })).toBeNull()
  })
  test('returns null when text is missing or empty', () => {
    expect(promptTextFromPayload({ type: 'prompt' })).toBeNull()
    expect(promptTextFromPayload({ type: 'prompt', text: '' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/pty-controller/wrapper && bun test prompt-inject.test.ts`
Expected: FAIL — `Cannot find module './prompt-inject'`.

- [ ] **Step 3: Write the helper**

Create `plugins/pty-controller/wrapper/src/prompt-inject.ts`:

```typescript
/**
 * Pure helper for the wrapper's type:"prompt" payload branch.
 *
 * Kept in its own side-effect-free module so it is unit-testable — wrapper.ts
 * spawns Claude Code on import and cannot be loaded inside a test.
 *
 * The text is already composed by the sender (agent-bus): it includes the
 * anti-bounce marker and the flattened, single-line body. The wrapper types
 * it verbatim and stays oblivious to attribution.
 */
export function promptTextFromPayload(payload: { type?: string; text?: unknown }): string | null {
  if (payload.type !== 'prompt') return null
  if (typeof payload.text !== 'string' || payload.text.length === 0) return null
  return payload.text
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/pty-controller/wrapper && bun test prompt-inject.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the helper into `wrapper.ts`**

Read `plugins/pty-controller/wrapper/src/wrapper.ts`. Make three edits:

(a) Add the import near the top (with the other local imports):
```typescript
import { promptTextFromPayload } from './prompt-inject'
```

(b) Add `text?: string` to the `payload` type union inside `consumePending` (the object type that already lists `id?`, `type?`, `kind?`, `command?`, `sessionId?`, `sessionName?`, `confirmAfterMs?`, `from?`, `hop_count?`, `correlation_id?`). Add:
```typescript
    /** Agent-bus prompt: the already-composed text to type into the PTY. */
    text?: string
```

(c) Add an `injectText` function next to `injectSlashCommand` (after line ~460):
```typescript
/**
 * Type arbitrary text into the PTY as a user turn, then submit with Enter.
 * Used for agent-bus prompts. Unlike injectSlashCommand there is no leading
 * "/", so no autocomplete picker to dodge — but we keep the same submit
 * pacing so the \r lands after the text is fully written.
 */
function injectText(text: string): void {
  currentPty.write(text)
  setTimeout(() => currentPty.write('\r'), SUBMIT_DELAY_MS)
}
```

(d) In `consumePending`, after the `if (type === 'slash') { ... }` block (and before or after the `if (type === 'switch')` block — order does not matter), add a `prompt` branch:
```typescript
  if (type === 'prompt') {
    const text = promptTextFromPayload(payload)
    if (!text) {
      log(`ignored ${filename}: prompt payload missing text`)
      return
    }
    log(`injecting prompt text (${text.length} chars, id: ${payload.id ?? '?'}, from: ${payload.from ?? '?'})`)
    injectText(text)
    return
  }
```

- [ ] **Step 6: Verify the helper test still passes and the branch is wired**

Run: `cd plugins/pty-controller/wrapper && bun test`
Expected: PASS.
Then read `wrapper.ts` and confirm: the import is present, `injectText` is defined, the `type === 'prompt'` branch calls `promptTextFromPayload` then `injectText`, and `text?` is in the payload type. (wrapper.ts cannot be bundled/run in isolation because it spawns CC on load; verification here is the helper test plus a read-through. End-to-end is covered by the manual two-bot smoke in Task 6.)

- [ ] **Step 7: Commit**

```bash
git add plugins/pty-controller/wrapper/src/prompt-inject.ts plugins/pty-controller/wrapper/src/prompt-inject.test.ts plugins/pty-controller/wrapper/src/wrapper.ts
git commit -m "feat(pty-controller): wrapper types agent-bus prompt payloads into the PTY"
```

---

## Task 5: Tool description, version bumps, verify, release

**Files:**
- Modify: `plugins/agent-bus/server.ts` (tool description + Server version)
- Modify: `plugins/agent-bus/.claude-plugin/plugin.json`, `plugins/agent-bus/package.json`
- Modify: `plugins/pty-controller/.claude-plugin/plugin.json`, `plugins/pty-controller/package.json`

- [ ] **Step 1: Update the `agent_send` tool description (drop channel wording)**

In `plugins/agent-bus/server.ts`, in the `agent_send` tool definition's `description`, replace the `kind="prompt"` sentence so it no longer mentions channels/inbound notifications. Use this for the prompt bullet:
```
"  • kind=\"prompt\": deliver a natural-language instruction to the peer. It is typed into the peer's Claude session as a normal user turn (via the mirza-cc wrapper) and the peer acts on it. One-way — there is NO reply channel. Newlines in the body are flattened to one line. If you want the peer to report back, say so inside the body (e.g. \"...when done, send a one-line summary back to bot-01\").\n"
```
Leave the `kind="slash"` bullet, the `target`/broadcast sentence, and the autonomy/destructive warnings unchanged.

- [ ] **Step 2: Bump the agent-bus Server version string**

In `plugins/agent-bus/server.ts`, change `new Server({ name: 'agent-bus', version: '0.0.2' }, ...)` to `version: '0.0.3'`.

- [ ] **Step 3: Bump agent-bus manifest + package versions**

- `plugins/agent-bus/.claude-plugin/plugin.json`: `"version": "0.0.2"` → `"0.0.3"`.
- `plugins/agent-bus/package.json`: `"version": "0.0.2"` → `"0.0.3"`.

- [ ] **Step 4: Bump pty-controller manifest + package versions**

- `plugins/pty-controller/.claude-plugin/plugin.json`: `"version": "0.0.21"` → `"0.0.22"`.
- `plugins/pty-controller/package.json`: bump its `"version"` to `"0.0.22"` (match the plugin manifest; read the file first to confirm the current value).

- [ ] **Step 5: Full verification**

Run: `cd plugins/agent-bus && bun test`
Expected: PASS — registry, inbox-writer, peer-status, send-guards, prompt-compose, integration all green; no prompt-inbox/prompt-watcher suites remain.
Run: `cd plugins/agent-bus && bun build server.ts --target=bun --outdir=/tmp/ab-t5`
Expected: bundles cleanly.
Run: `cd plugins/pty-controller/wrapper && bun test`
Expected: PASS (prompt-inject).

- [ ] **Step 6: Release commit**

```bash
git add plugins/agent-bus/server.ts plugins/agent-bus/.claude-plugin/plugin.json plugins/agent-bus/package.json plugins/pty-controller/.claude-plugin/plugin.json plugins/pty-controller/package.json
git commit -m "release: agent-bus 0.0.3 (prompt via PTY) + pty-controller 0.0.22 (prompt payload)"
```

- [ ] **Step 7: Manual two-bot smoke (human-run, after install/reload)**

This step is run by Mirza, not the implementer. After installing/reloading the updated plugins in two bots: from bot-A, `agent_send(target="bot-B", payload={kind:"prompt", body:"konfirmasi kamu menerima pesan ini"})`. Expected: the marker+body appears as a user turn in bot-B's session and bot-B acts on it. Confirms the end-to-end path the unit/integration tests cannot exercise (real PTY injection).

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** §3.1 send path (Task 2), §3.2 file removals (Task 3), §3.3 prompt-compose (Task 1), §3.5 wrapper prompt branch (Task 4), §4 marker verbatim (Task 1 composePromptText), §5 payload schema + 8 KB validation + no hop_count/broadcast_group_id (Task 1), §6 tool surface + description (Tasks 2 & 5), §8 error handling (Task 2 per-target results), §9 testing (Tasks 1/2/4 + Task 5 Step 7 smoke), §10 teardown (Tasks 2 & 3), §11 versioning (Task 5).
- **Type consistency:** `composePromptText(from, body)`, `writePromptToPending(peerStateDir, from, text)`, `validatePromptBody(body)`, `promptTextFromPayload(payload)` — names identical across the tasks that define and call them. The payload written by `writePromptToPending` (`{id, ts, type:"prompt", from, text}`) matches what the wrapper's `consumePending` + `promptTextFromPayload` read (`type`, `text`, `from`).
- **Compile order:** Task 2 updates server.ts to stop importing the channel modules BEFORE Task 3 deletes them, so every commit compiles.
- **Wrapper coupling:** agent-bus writes prompt to the peer's `state_dir` (pty-controller dir) from the registry — the same dir it already writes slash payloads to. No new coupling.
- **`from` + hop_count:** the prompt payload carries `from` (for wrapper logging). It carries no `hop_count`; the wrapper treats a missing `hop_count` as 0, so its existing `from`-gated hop check passes harmlessly. No wrapper change needed for that.
