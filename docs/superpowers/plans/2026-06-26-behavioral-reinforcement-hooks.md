# Behavioral Reinforcement Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reinforcement hooks that mechanically keep ambient behavioral obligations (ack-before-tools, buttons-on-questions, mandatory Telegram reply, idle-session naming, commit trailer) in front of the AI, reducing "forgetting."

**Architecture:** Four bun `.ts` hooks. Three in the `telegram` plugin (UserPromptSubmit nudge, Stop block-once, plus a session-name accuracy fix to the existing SessionStart hook) and one PreToolUse blocker in `bot-conduct`. Each hook's pure decision logic is an exported function, unit-tested with `bun:test`; a thin `main()` under `import.meta.main` does stdin/stdout.

**Tech Stack:** TypeScript on **bun**, `bun:test`. Claude Code plugin hooks.

## Global Constraints

- Runtime **bun**; hooks are `.ts` run via `bun run "${CLAUDE_PLUGIN_ROOT}/hooks/<file>.ts"`. Plugin hooks auto-discover from `<plugin>/hooks/hooks.json` (no `plugin.json` key).
- Hooks read stdin via `readFileSync(0, 'utf8')` and degrade silently (any parse/IO failure → emit nothing, exit 0). Never throw.
- **Verified hook I/O contracts (June 2026):**
  - **UserPromptSubmit** stdin: `{prompt, transcript_path, hook_event_name, ...}`. To inject context, exit 0 + stdout `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"<text>"}}`.
  - **Stop** stdin: `{stop_hook_active, transcript_path, ...}`. To force continuation, exit 0 + stdout top-level `{"decision":"block","reason":"<text>"}`. If `stop_hook_active===true`, emit nothing (avoid loop).
  - **PreToolUse** stdin: `{tool_name, tool_input:{command,...}, ...}`. To block, exit 0 + stdout `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<text>"}}`. Matcher `"Bash"` scopes it to the Bash tool.
  - **Transcript JSONL** lines: `{type:"user"|"assistant", message:{content:[...]}}`. User text in a `{type:"text", text}` part; an assistant tool call is a `{type:"tool_use", name, input}` part. The telegram reply tool name is `mcp__plugin_telegram_telegram__reply`.
- Telegram-inbound detection regex (shared idea): `/<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/`.
- Out of scope: handoff §1 (judgment-only, not mechanically enforceable).
- Versions: `telegram` 0.0.35-mirza.0 → **0.0.36-mirza.0**; `bot-conduct` 0.0.6 → **0.0.7**.
- Git: worktree `feat/reinforcement-hooks`. Sign commits with `Agent: bot-06` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do NOT push/merge (controller finalizes).
- Run telegram tests: `cd plugins/telegram && bun test <files>`. Run bot-conduct hook test: `cd plugins/bot-conduct && bun test hooks/<file>`.

---

### Task 1: Component 2 — authoritative session-name read (accuracy fix)

**Files:**
- Modify: `plugins/telegram/current-session-info.ts` (add `readAuthoritativeSessionName`)
- Modify: `plugins/telegram/hooks/session-name-context.ts` (`resolveSessionNameForContext` prefers authoritative)
- Test: `plugins/telegram/current-session-info.test.ts` (create if absent) and `plugins/telegram/hooks/session-name-context.test.ts` (extend)

**Interfaces:**
- Produces: `readAuthoritativeSessionName(env): string | null` — reads `<ptyStateDir>/wrapper.current_session_name`. `resolveSessionNameForContext(env): string | null` now prefers it, falling back to the sid→registry path.

- [ ] **Step 1: Write the failing test**

Add to `plugins/telegram/hooks/session-name-context.test.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setName as registrySetName } from '../session-names-registry.ts'

test('prefers the authoritative wrapper name over a stale registry name', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'authname-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-1'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'idle')
  // Registry says something STALE/different for that sid.
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'test-goal')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('idle') // authoritative wins, not 'test-goal'
  rmSync(projectDir, { recursive: true, force: true })
})

test('falls back to the registry name when the authoritative file is absent', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'authname-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  const sid = 'sid-2'
  writeFileSync(join(ptyDir, 'wrapper.current_session_id'), sid)
  // No wrapper.current_session_name file.
  const tgDir = join(projectDir, '.claude', 'channels', 'telegram')
  mkdirSync(tgDir, { recursive: true })
  registrySetName(tgDir, sid, 'from-registry')
  const name = resolveSessionNameForContext({ CLAUDE_PROJECT_DIR: projectDir })
  expect(name).toBe('from-registry')
  rmSync(projectDir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/telegram && bun test hooks/session-name-context.test.ts`
Expected: FAIL — first test gets `'test-goal'` (registry), not `'idle'`.

- [ ] **Step 3: Add `readAuthoritativeSessionName` to `current-session-info.ts`**

`current-session-info.ts` already imports `readFileSync, existsSync` and `join`, and has a private `resolvePtyStateDir(env)`. Add this exported function (after `readCurrentSessionId`):

```ts
/**
 * Reads the wrapper's authoritative current session name from
 * <ptyStateDir>/wrapper.current_session_name. This file is maintained by the
 * mirza-cc wrapper and reflects the live name even right after a rename,
 * unlike the sid->registry mapping which can lag. Null if absent/empty.
 */
export function readAuthoritativeSessionName(
  env: Record<string, string | undefined>,
): string | null {
  const dir = resolvePtyStateDir(env)
  if (!dir) return null
  const file = join(dir, 'wrapper.current_session_name')
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw.length > 0 ? raw : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Make `resolveSessionNameForContext` prefer authoritative**

In `plugins/telegram/hooks/session-name-context.ts`, replace the import and function:

```ts
import {
  readCurrentSessionId,
  resolveCurrentSessionName,
  readAuthoritativeSessionName,
} from '../current-session-info.ts'
import { resolveStateDir } from '../state-path.ts'

export function resolveSessionNameForContext(
  env: Record<string, string | undefined>,
): string | null {
  const authoritative = readAuthoritativeSessionName(env)
  if (authoritative) return authoritative
  // Fallback for non-wrapper setups: sid -> telegram name registry.
  const sid = readCurrentSessionId(env)
  const telegramStateDir = resolveStateDir(env)
  if (!sid || !telegramStateDir) return null
  return resolveCurrentSessionName(sid, telegramStateDir)
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd plugins/telegram && bun test hooks/session-name-context.test.ts`
Expected: PASS (existing tests + the two new ones).

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/current-session-info.ts plugins/telegram/hooks/session-name-context.ts plugins/telegram/hooks/session-name-context.test.ts
git commit -m "fix(telegram): resolve session name from authoritative wrapper file"
```

---

### Task 2: Component 1 — per-turn ambient reminder (UserPromptSubmit)

**Files:**
- Create: `plugins/telegram/hooks/telegram-turn-reminder.ts`
- Create: `plugins/telegram/hooks/telegram-turn-reminder.test.ts`
- Modify: `plugins/telegram/hooks/hooks.json` (add UserPromptSubmit entry)

**Interfaces:**
- Consumes: `resolveSessionNameForContext(env)` from Task 1.
- Produces: `isTelegramInbound(prompt): boolean`; `buildTurnReminder(prompt, env): string | null`.

- [ ] **Step 1: Write the failing test**

Create `plugins/telegram/hooks/telegram-turn-reminder.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTelegramInbound, buildTurnReminder } from './telegram-turn-reminder.ts'

const TG = '<channel source="plugin:telegram:telegram" chat_id="1">hi</channel>'

test('isTelegramInbound detects a telegram channel marker', () => {
  expect(isTelegramInbound(TG)).toBe(true)
  expect(isTelegramInbound('just a normal prompt')).toBe(false)
})

test('buildTurnReminder returns null for a non-telegram prompt', () => {
  expect(buildTurnReminder('normal prompt', {})).toBeNull()
})

test('buildTurnReminder includes the ambient obligations for a telegram inbound', () => {
  const r = buildTurnReminder(TG, {}) ?? ''
  expect(r).toMatch(/ack/i)
  expect(r).toMatch(/buttons/i)
  expect(r).toMatch(/MANDATORY/)
})

test('buildTurnReminder appends the idle line only when the session is idle', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'reminder-'))
  const ptyDir = join(projectDir, '.claude', 'channels', 'pty-controller')
  mkdirSync(ptyDir, { recursive: true })
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'idle')
  const withIdle = buildTurnReminder(TG, { CLAUDE_PROJECT_DIR: projectDir }) ?? ''
  expect(withIdle).toMatch(/name-session/)
  writeFileSync(join(ptyDir, 'wrapper.current_session_name'), 'catur')
  const named = buildTurnReminder(TG, { CLAUDE_PROJECT_DIR: projectDir }) ?? ''
  expect(named).not.toMatch(/name-session/)
  rmSync(projectDir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/telegram && bun test hooks/telegram-turn-reminder.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `plugins/telegram/hooks/telegram-turn-reminder.ts`:

```ts
#!/usr/bin/env bun
/**
 * UserPromptSubmit hook: on a Telegram inbound, re-injects the ambient
 * Telegram-channel obligations every turn (not just at SessionStart), so they
 * don't fade under task pressure. Silent on non-telegram prompts.
 */
import { readFileSync } from 'node:fs'
import { resolveSessionNameForContext } from './session-name-context.ts'

export function isTelegramInbound(prompt: string): boolean {
  return /<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/.test(prompt)
}

export function buildTurnReminder(
  prompt: string,
  env: Record<string, string | undefined>,
): string | null {
  if (!isTelegramInbound(prompt)) return null
  const lines = [
    'Telegram-channel obligations for THIS turn (mechanical reminder):',
    '- immediate-reply: if your response will make ANY tool call before the final answer, send a short ack via the reply tool BEFORE that first tool call.',
    '- inline-buttons: if your reply asks a question or offers options, attach buttons (min Yes/No + a manual-fallback).',
    '- channel discipline: the user is on Telegram and does NOT see this transcript. Answering via the reply tool is MANDATORY — send the final answer through reply when the task concludes, not only at the start.',
  ]
  if (resolveSessionNameForContext(env) === 'idle') {
    lines.push(
      '- name-session: this session is still named "idle" — if the topic is now clear, offer a hyphenated name via buttons THIS turn.',
    )
  }
  return lines.join('\n')
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    return
  }
  let prompt = ''
  try {
    prompt = JSON.parse(raw).prompt ?? ''
  } catch {
    return
  }
  const reminder = buildTurnReminder(prompt, process.env)
  if (!reminder) return
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: reminder,
      },
    }),
  )
}

if (import.meta.main) main()
```

- [ ] **Step 4: Run to verify pass**

Run: `cd plugins/telegram && bun test hooks/telegram-turn-reminder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the hook**

In `plugins/telegram/hooks/hooks.json`, add a `UserPromptSubmit` array alongside `SessionStart`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/session-name-context.ts\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/telegram-turn-reminder.ts\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Manual smoke test**

Run (non-telegram prompt → silent):
```bash
cd plugins/telegram && echo '{"prompt":"hello"}' | bun run hooks/telegram-turn-reminder.ts; echo "(exit $?)"
```
Expected: no output, exit 0.
Run (telegram inbound → emits additionalContext JSON):
```bash
echo '{"prompt":"<channel source=\"plugin:telegram:telegram\">hi</channel>"}' | bun run hooks/telegram-turn-reminder.ts
```
Expected: a JSON object containing `"additionalContext"` and the word `MANDATORY`.

- [ ] **Step 7: Commit**

```bash
git add plugins/telegram/hooks/telegram-turn-reminder.ts plugins/telegram/hooks/telegram-turn-reminder.test.ts plugins/telegram/hooks/hooks.json
git commit -m "feat(telegram): per-turn ambient reminder UserPromptSubmit hook"
```

---

### Task 3: Component 3 — mandatory-reply Stop hook

**Files:**
- Create: `plugins/telegram/hooks/telegram-reply-guard.ts`
- Create: `plugins/telegram/hooks/telegram-reply-guard.test.ts`
- Modify: `plugins/telegram/hooks/hooks.json` (add Stop entry)

**Interfaces:**
- Produces: `analyzeTranscript(lines: string[]): {telegramDriven, latestInboundIdx, latestReplyIdx}`; `decideStop(analysis, stopHookActive): {block, reason?}`.

- [ ] **Step 1: Write the failing test**

Create `plugins/telegram/hooks/telegram-reply-guard.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { analyzeTranscript, decideStop } from './telegram-reply-guard.ts'

const inbound = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'text', text: '<channel source="plugin:telegram:telegram">q</channel>' }] },
})
const replyCall = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'mcp__plugin_telegram_telegram__reply', input: {} }] },
})
const plainAssistant = JSON.stringify({
  type: 'assistant',
  message: { content: [{ type: 'text', text: 'thinking' }] },
})
const nonTgUser = JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'text', text: 'plain prompt' }] },
})

test('analyzeTranscript finds telegram inbound and reply indices', () => {
  const a = analyzeTranscript([inbound, replyCall])
  expect(a.telegramDriven).toBe(true)
  expect(a.latestInboundIdx).toBe(0)
  expect(a.latestReplyIdx).toBe(1)
})

test('decideStop blocks when telegram inbound has no reply after it', () => {
  const a = analyzeTranscript([inbound, plainAssistant])
  expect(decideStop(a, false).block).toBe(true)
})

test('decideStop allows when a reply followed the latest inbound', () => {
  const a = analyzeTranscript([inbound, replyCall])
  expect(decideStop(a, false).block).toBe(false)
})

test('decideStop allows a non-telegram conversation', () => {
  const a = analyzeTranscript([nonTgUser, plainAssistant])
  expect(decideStop(a, false).block).toBe(false)
})

test('decideStop never blocks when stop_hook_active is already set', () => {
  const a = analyzeTranscript([inbound, plainAssistant])
  expect(decideStop(a, true).block).toBe(false)
})

test('decideStop blocks when a new inbound arrives after an earlier reply', () => {
  const a = analyzeTranscript([inbound, replyCall, inbound])
  expect(a.latestInboundIdx).toBe(2)
  expect(a.latestReplyIdx).toBe(1)
  expect(decideStop(a, false).block).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/telegram && bun test hooks/telegram-reply-guard.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `plugins/telegram/hooks/telegram-reply-guard.ts`:

```ts
#!/usr/bin/env bun
/**
 * Stop hook: when a Telegram-driven conversation reaches a concluding stop with
 * no reply sent since the latest Telegram inbound, block once to remind the AI
 * to answer the AFK user. Loop-guarded via stop_hook_active.
 */
import { readFileSync } from 'node:fs'

const REPLY_TOOL = 'mcp__plugin_telegram_telegram__reply'
const TG_RE = /<channel\b[^>]*\bsource="[^"]*telegram[^"]*"/

export interface TranscriptAnalysis {
  telegramDriven: boolean
  latestInboundIdx: number
  latestReplyIdx: number
}

export function analyzeTranscript(lines: string[]): TranscriptAnalysis {
  let telegramDriven = false
  let latestInboundIdx = -1
  let latestReplyIdx = -1
  lines.forEach((line, idx) => {
    if (!line.trim()) return
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }
    const content = obj?.message?.content
    if (!Array.isArray(content)) return
    if (obj.type === 'user') {
      for (const part of content) {
        if (part?.type === 'text' && typeof part.text === 'string' && TG_RE.test(part.text)) {
          telegramDriven = true
          latestInboundIdx = idx
        }
      }
    } else if (obj.type === 'assistant') {
      for (const part of content) {
        if (part?.type === 'tool_use' && part.name === REPLY_TOOL) {
          latestReplyIdx = idx
        }
      }
    }
  })
  return { telegramDriven, latestInboundIdx, latestReplyIdx }
}

export function decideStop(
  a: TranscriptAnalysis,
  stopHookActive: boolean,
): { block: boolean; reason?: string } {
  if (stopHookActive) return { block: false }
  if (!a.telegramDriven || a.latestInboundIdx === -1) return { block: false }
  if (a.latestReplyIdx > a.latestInboundIdx) return { block: false }
  return {
    block: true,
    reason:
      'This conversation is from Telegram and the user is AFK (they do not see this transcript). You have not sent a reply since their last message — send your answer now via the reply tool (mcp__plugin_telegram_telegram__reply).',
  }
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    return
  }
  let input: any
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  if (input?.stop_hook_active === true) return
  const path = input?.transcript_path
  if (typeof path !== 'string') return
  let lines: string[] = []
  try {
    lines = readFileSync(path, 'utf8').split('\n')
  } catch {
    return
  }
  const decision = decideStop(analyzeTranscript(lines), false)
  if (!decision.block) return
  process.stdout.write(JSON.stringify({ decision: 'block', reason: decision.reason }))
}

if (import.meta.main) main()
```

- [ ] **Step 4: Run to verify pass**

Run: `cd plugins/telegram && bun test hooks/telegram-reply-guard.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire the Stop hook**

In `plugins/telegram/hooks/hooks.json`, add a `Stop` array (alongside `SessionStart` and `UserPromptSubmit`):

```json
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/telegram-reply-guard.ts\""
          }
        ]
      }
    ]
```

(Place it as a sibling key inside the top-level `"hooks"` object; ensure valid JSON with commas.)

- [ ] **Step 6: Commit**

```bash
git add plugins/telegram/hooks/telegram-reply-guard.ts plugins/telegram/hooks/telegram-reply-guard.test.ts plugins/telegram/hooks/hooks.json
git commit -m "feat(telegram): mandatory-reply Stop hook (AFK channel discipline)"
```

---

### Task 4: Component 4 — commit-trailer PreToolUse hook (bot-conduct)

**Files:**
- Create: `plugins/bot-conduct/hooks/commit-trailer-guard.ts`
- Create: `plugins/bot-conduct/hooks/commit-trailer-guard.test.ts`
- Create: `plugins/bot-conduct/hooks/hooks.json`

**Interfaces:**
- Produces: `checkCommit(command: string): {deny: boolean, reason?: string}`.

- [ ] **Step 1: Write the failing test**

Create `plugins/bot-conduct/hooks/commit-trailer-guard.test.ts`:

```ts
import { test, expect } from 'bun:test'
import { checkCommit } from './commit-trailer-guard.ts'

const withTrailer = `git commit -m "$(cat <<'EOF'
feat: do a thing

Agent: bot-06
EOF
)"`

const withoutTrailer = `git commit -m "feat: do a thing"`

test('allows a commit that carries an Agent: trailer', () => {
  expect(checkCommit(withTrailer).deny).toBe(false)
})

test('denies a commit message with no Agent: trailer', () => {
  const r = checkCommit(withoutTrailer)
  expect(r.deny).toBe(true)
  expect(r.reason).toMatch(/Agent:/)
})

test('ignores non-commit git commands', () => {
  expect(checkCommit('git status').deny).toBe(false)
  expect(checkCommit('git add -A').deny).toBe(false)
})

test('ignores commits with no inspectable message (e.g. --amend opening an editor)', () => {
  expect(checkCommit('git commit --amend').deny).toBe(false)
})

test('ignores entirely unrelated bash', () => {
  expect(checkCommit('ls -la && echo hi').deny).toBe(false)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/bot-conduct && bun test hooks/commit-trailer-guard.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `plugins/bot-conduct/hooks/commit-trailer-guard.ts`:

```ts
#!/usr/bin/env bun
/**
 * PreToolUse hook (Bash): bot-conduct requires every commit to carry an
 * "Agent: <bot-name>" trailer. Denies a `git commit` carrying an inspectable
 * message (-m or heredoc) that lacks the trailer, so the AI retries with it.
 * Self-contained: only node:fs, no plugin imports.
 */
import { readFileSync } from 'node:fs'

export function checkCommit(command: string): { deny: boolean; reason?: string } {
  if (!/\bgit\s+commit\b/.test(command)) return { deny: false }
  // Only enforce when a message is inspectable in the command (-m or heredoc).
  const hasMessage = /-m\b/.test(command) || /<<-?\s*['"]?\w+/.test(command)
  if (!hasMessage) return { deny: false }
  if (/^\s*Agent:\s*\S+/m.test(command)) return { deny: false }
  return {
    deny: true,
    reason:
      'bot-conduct requires an "Agent: <bot-name>" trailer on every commit. Add a trailer line (e.g. "Agent: bot-06") to the commit message and retry.',
  }
}

function main(): void {
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    return
  }
  let input: any
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  if (input?.tool_name !== 'Bash') return
  const command = input?.tool_input?.command
  if (typeof command !== 'string') return
  const result = checkCommit(command)
  if (!result.deny) return
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.reason,
      },
    }),
  )
}

if (import.meta.main) main()
```

- [ ] **Step 4: Run to verify pass**

Run: `cd plugins/bot-conduct && bun test hooks/commit-trailer-guard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the hook**

Create `plugins/bot-conduct/hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bun run \"${CLAUDE_PLUGIN_ROOT}/hooks/commit-trailer-guard.ts\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Manual smoke test**

```bash
cd plugins/bot-conduct && echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"x\""}}' | bun run hooks/commit-trailer-guard.ts
```
Expected: JSON with `"permissionDecision":"deny"`.
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' | bun run hooks/commit-trailer-guard.ts; echo "(exit $?)"
```
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/bot-conduct/hooks
git commit -m "feat(bot-conduct): PreToolUse hook enforcing Agent: commit trailer"
```

---

### Task 5: Version bumps, marketplace + README, full test run

**Files:**
- Modify: `plugins/telegram/.claude-plugin/plugin.json`, `plugins/telegram/package.json` (→ 0.0.36-mirza.0)
- Modify: `plugins/bot-conduct/.claude-plugin/plugin.json` (→ 0.0.7)
- Modify: `.claude-plugin/marketplace.json` (telegram + bot-conduct descriptions)
- Modify: `README.md` (telegram + bot-conduct rows; optionally the "how it fits" map)

**Interfaces:** Consumes Tasks 1–4.

- [ ] **Step 1: Bump versions**

`plugins/telegram/.claude-plugin/plugin.json` and `plugins/telegram/package.json`: `0.0.35-mirza.0` → `0.0.36-mirza.0`.
`plugins/bot-conduct/.claude-plugin/plugin.json`: `0.0.6` → `0.0.7`.

- [ ] **Step 2: Update marketplace + README**

In `.claude-plugin/marketplace.json`:
- telegram description: append a clause noting per-turn ambient-reminder (UserPromptSubmit) and mandatory-reply (Stop) hooks, plus the session-name accuracy fix.
- bot-conduct description: append a clause noting the PreToolUse hook that enforces the `Agent:` commit trailer.

In `README.md`: bump the telegram row to `0.0.36-mirza.0` and bot-conduct row to `0.0.7`, each with a short note of the new hook(s). If straightforward, add one line to the "how it all fits together" map noting the reinforcement hooks.

- [ ] **Step 3: Full test run**

Run: `cd plugins/telegram && bun test session-name-context.test.ts hooks/telegram-turn-reminder.test.ts hooks/telegram-reply-guard.test.ts meta-commands.test.ts` and `cd plugins/bot-conduct && bun test hooks/commit-trailer-guard.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/telegram/.claude-plugin/plugin.json plugins/telegram/package.json plugins/bot-conduct/.claude-plugin/plugin.json .claude-plugin/marketplace.json README.md
git commit -m "release: telegram 0.0.36-mirza.0 + bot-conduct 0.0.7 — reinforcement hooks"
```

---

## Self-Review

**Spec coverage:**
- Component 1 (per-turn reminder + AFK rule + idle line) → Task 2. ✓
- Component 2 (authoritative name, accuracy fix) → Task 1. ✓
- Component 3 (mandatory-reply Stop, concluding-stop, block-once, loop-guard) → Task 3. ✓
- Component 4 (commit-trailer PreToolUse, blocking) → Task 4. ✓
- Testing strategy (pure-function unit tests + manual main smoke) → each task. ✓
- Versioning + docs → Task 5. ✓
- Out-of-scope handoff §1 → not implemented (correct). ✓

**Placeholder scan:** No TBD/TODO. Hook I/O shapes are pinned in Global Constraints (verified via claude-code-guide). Marketplace/README copy is described with exact version targets; wording is the implementer's to write within the stated content — not a code placeholder.

**Type consistency:** `resolveSessionNameForContext(env)` (Task 1) consumed by Task 2. `readAuthoritativeSessionName(env)` defined Task 1. `analyzeTranscript`/`decideStop` defined+consumed in Task 3. `checkCommit` defined+consumed Task 4. Reply tool name `mcp__plugin_telegram_telegram__reply` consistent across Task 3 code, tests, and reason text. Hook output shapes match the verified contracts.
