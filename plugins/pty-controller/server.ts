#!/usr/bin/env bun
/**
 * MCP server for the pty-controller plugin.
 *
 * Exposes one tool — `pty_send_slash` — that lets the AI write a slash
 * command request to the wrapper's filesystem inbox. The wrapper then
 * injects the corresponding keystrokes into Claude Code's PTY stdin.
 *
 * Safety: only well-formed slash commands are accepted. The tool refuses
 * raw text injection because that would give the AI arbitrary control over
 * its own host process (rm -rf, etc.). A slash command is structurally
 * confined to what CC itself defines.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  describeAgents,
  readAgentRegistry,
  resolveAgentRegistryPath,
  resolveStateDir,
  writeCommand,
  wrapperLikelyRunning,
} from './ipc.ts'

// Accepts either a bare command (`/clear`, `/rename foo`) or a namespaced
// plugin command (`/telegram:notify-user brief`). Plugin commands need
// `<plugin>:` prefix to dispatch in CC — bare names error out as
// "Unknown command". Total name length capped at 63 to fit either form.
const SLASH_COMMAND_RE = /^\/[a-z][a-z0-9_:-]{0,63}(\s[\s\S]{0,256})?$/

const STATE_DIR = (() => {
  const dir = resolveStateDir(process.env)
  if (!dir) {
    process.stderr.write(
      `pty-controller: cannot determine state directory.\n` +
        `  CLAUDE_PROJECT_DIR is not set (Claude Code sets this automatically when you start a session in a project).\n` +
        `  Or set PTY_CONTROLLER_STATE_DIR explicitly.\n`,
    )
    process.exit(1)
  }
  return dir
})()
process.stderr.write(`pty-controller: state dir = ${STATE_DIR}\n`)

const mcp = new Server(
  { name: 'pty-controller', version: '0.0.1' },
  { capabilities: { tools: {} } },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pty_send_slash',
      description:
        'Send a Claude Code slash command to a PTY. WITHOUT `target` — targets the CURRENT (self) CC session; safe to call autonomously. WITH `target` (a single agent name) — targets a peer agent\'s session; this is a CROSS-AGENT side effect and REQUIRES the user to have explicitly asked you to message that peer. WITH `target` as an ARRAY — broadcasts to multiple peers at once; same explicit-user-consent rule applies, and destructive commands (`/clear`, `/delete`) are REJECTED on array targets to prevent accidental fan-out wipes. Peer state is resolved from `~/.claude/agent-registry.json`; call `pty_list_agents` first to discover valid names. Returns immediately; the wrapper(s) inject the keystrokes on the next input-loop tick.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'The slash command to inject, including the leading slash. Must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — at most 64-char command name (the `:` is allowed so namespaced plugin commands like `/telegram:notify-user` dispatch correctly), optional 256-char argument. Examples: "/clear", "/compact", "/telegram:notify-user fresh session ready".',
          },
          target: {
            description:
              'Optional. Omit (or pass null) to target self. Pass a single string (e.g. "bot-03") for one peer, or a string array (e.g. ["bot-02", "bot-03"]) to broadcast. Names must match entries in `pty_list_agents`. Destructive commands like "/clear" and "/delete" are rejected when target is an array.',
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'pty_status',
      description:
        'Check whether the mirza-cc wrapper is currently running and listening for commands. Returns { wrapper_alive: boolean, state_dir: string }. Call this before pty_send_slash if uncertain.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'pty_list_agents',
      description:
        'List all peer Claude Code agents currently registered in the shared agent registry (~/.claude/agent-registry.json, written by every mirza-cc wrapper). Each entry exposes its agent name (basename of its project dir), state directory, last heartbeat, heartbeat age in seconds, and whether it is alive (heartbeat fresher than 30s). Pass `only_alive: true` to filter out stale entries. Use this before passing `target` to `pty_send_slash` to discover valid targets.',
      inputSchema: {
        type: 'object',
        properties: {
          only_alive: {
            type: 'boolean',
            description: 'When true, exclude agents whose last heartbeat is older than 30 seconds. Default: false.',
          },
        },
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>
  try {
    switch (req.params.name) {
      case 'pty_send_slash': {
        const command = args.command
        if (typeof command !== 'string' || command.length === 0) {
          throw new Error('command must be a non-empty string')
        }
        if (!SLASH_COMMAND_RE.test(command)) {
          throw new Error(
            `command must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — got: ${JSON.stringify(command)}`,
          )
        }

        // Normalise the `target` argument into a list of agent names. `null`
        // and undefined both mean self.
        const rawTarget = args.target
        let targets: string[] | null
        if (rawTarget === undefined || rawTarget === null) {
          targets = null
        } else if (typeof rawTarget === 'string') {
          if (rawTarget.length === 0) {
            throw new Error('target must be a non-empty string when set')
          }
          targets = [rawTarget]
        } else if (Array.isArray(rawTarget)) {
          if (rawTarget.length === 0) {
            throw new Error('target array must contain at least one agent name')
          }
          for (const t of rawTarget) {
            if (typeof t !== 'string' || t.length === 0) {
              throw new Error('every entry in target array must be a non-empty string')
            }
          }
          targets = rawTarget as string[]
        } else {
          throw new Error('target must be a string, an array of strings, or omitted')
        }

        // SELF path — preserves the original behaviour of pty_send_slash.
        if (targets === null) {
          if (!wrapperLikelyRunning(STATE_DIR)) {
            throw new Error(
              'wrapper not detected (no fresh heartbeat). Launch CC via `mirza-cc` instead of `claude` directly.',
            )
          }
          const { id, path } = writeCommand(STATE_DIR, command)
          return {
            content: [
              {
                type: 'text',
                text: `queued (id: ${id}) — wrapper will inject "${command}" into PTY shortly\npath: ${path}`,
              },
            ],
          }
        }

        // CROSS-AGENT path (single or broadcast).
        // Blast-radius guard: refuse destructive commands on array targets so
        // a one-tap fan-out cannot wipe multiple peers at once. Single-target
        // destructive calls still go through (user already named one peer).
        const isDestructive = /^\/(clear|delete)(\s|$)/.test(command)
        if (isDestructive && targets.length > 1) {
          throw new Error(
            `destructive command "${command}" rejected for array target (${targets.length} peers). ` +
              `Send to one peer at a time to confirm intent.`,
          )
        }

        const regPath = resolveAgentRegistryPath(process.env)
        const reg = readAgentRegistry(regPath)

        // Resolve + validate all targets up-front. If any name is unknown or
        // any peer is offline, fail before writing any file so the caller
        // gets one clear error instead of partial dispatch.
        const known = Object.keys(reg.agents).join(', ') || '(none)'
        const resolved: { name: string; state_dir: string }[] = []
        for (const name of targets) {
          const entry = reg.agents[name]
          if (!entry) {
            throw new Error(
              `unknown agent "${name}". Known agents: ${known}. Call pty_list_agents to refresh.`,
            )
          }
          const [info] = describeAgents({ agents: { [name]: entry } })
          if (!info.alive) {
            throw new Error(
              `target agent "${name}" is not alive (last heartbeat ${info.last_heartbeat_age_s}s ago, threshold 30s).`,
            )
          }
          resolved.push({ name, state_dir: entry.state_dir })
        }

        // Write to each peer's inbox. Failures partway through are
        // surfaced as a partial-success error message — earlier writes are
        // NOT rolled back (the wrapper protocol has no notion of rollback;
        // a queued message is queued).
        const results: { name: string; id: string; path: string }[] = []
        for (const r of resolved) {
          try {
            const { id, path } = writeCommand(r.state_dir, command)
            results.push({ name: r.name, id, path })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            throw new Error(
              `partial dispatch: wrote ${results.length}/${resolved.length} ` +
                `successfully; failed on "${r.name}": ${msg}. ` +
                `Already-queued targets: ${results.map(r => r.name).join(', ') || '(none)'}.`,
            )
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: results
                .map(
                  r =>
                    `queued (id: ${r.id}) for agent "${r.name}" — wrapper will inject "${command}" into its PTY shortly\npath: ${r.path}`,
                )
                .join('\n---\n'),
            },
          ],
        }
      }
      case 'pty_status': {
        const alive = wrapperLikelyRunning(STATE_DIR)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { wrapper_alive: alive, state_dir: STATE_DIR },
                null,
                2,
              ),
            },
          ],
        }
      }
      case 'pty_list_agents': {
        const onlyAlive = args.only_alive === true
        const regPath = resolveAgentRegistryPath(process.env)
        const reg = readAgentRegistry(regPath)
        const all = describeAgents(reg)
        const out = onlyAlive ? all.filter(a => a.alive) : all
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { registry_path: regPath, agents: out },
                null,
                2,
              ),
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
process.stderr.write(`pty-controller: MCP server connected\n`)
