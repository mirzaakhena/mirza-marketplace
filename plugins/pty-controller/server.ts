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
  readWrapperVersion,
  versionAtLeast,
  writeBatch,
  writeCommand,
  wrapperLikelyRunning,
} from './ipc.ts'
import { telegramLayerCommandError } from './slash-guards.ts'

// Batch injection (array payloads) landed in wrapper 0.0.7. Older RUNNING
// wrappers ignore an array pending file as "unknown payload type", so the
// tool refuses batch sends until the user restarts mirza-cc.
const BATCH_MIN_WRAPPER_VERSION = '0.0.7'

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
        'Send one Claude Code slash command — or an atomic BATCH of them — to the CURRENT (self) CC session\'s PTY. SELF-ONLY by design (neighbor-autonomy decision 2026-06-07): bots never inject commands into peers; to ask another bot to do something, send it an agent-bus kind:"prompt" and let its own AI act. Only CC-native (or CC plugin) commands work — telegram-layer commands (`/new`, `/switch`, `/delete`, `/effort`) are REJECTED with an error naming the correct alternative. Pass `command` (single) OR `commands` (ordered array, max 8): a batch is written as ONE pending file, enqueued contiguously so no other payload can interleave between its items — use it for sequences like a handoff self-reset ["/rename done-…", "/clear", "/rename idle"]. When the batch contains /clear, the wrapper defers the session-change notification to the end of the batch so it carries the final session name. Batch needs a RUNNING wrapper >= 0.0.7; on older wrappers the tool errors — fall back to sequential single-command calls and tell the user to restart mirza-cc. Returns immediately; the wrapper injects the keystrokes on the next input-loop tick. Safe to call autonomously.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'A single slash command to inject, including the leading slash. Must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — at most 64-char command name (the `:` is allowed so namespaced plugin commands like `/telegram:notify-user` dispatch correctly), optional 256-char argument. Examples: "/clear", "/compact", "/telegram:notify-user fresh session ready". Exactly one of `command` / `commands` must be set.',
          },
          commands: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 8,
            description:
              'An ordered batch of slash commands (each validated like `command`), written as ONE atomic pending file. Example: ["/rename done-task-202606071500", "/clear", "/rename idle"]. Exactly one of `command` / `commands` must be set.',
          },
        },
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
        'List all peer Claude Code agents currently registered in the shared agent registry (~/.claude/agent-registry.json, written by every mirza-cc wrapper). Each entry exposes its agent name (basename of its project dir), state directory, last heartbeat, heartbeat age in seconds, and whether it is alive (heartbeat fresher than 30s). Pass `only_alive: true` to filter out stale entries. Read-only discovery — to interact with a peer, use the agent-bus tools (kind:"prompt").',
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
        // SELF-ONLY (neighbor-autonomy decision 2026-06-07): the `target`
        // parameter was removed — bots never inject commands into peers.
        // Reject it loudly so an out-of-date caller gets a teaching error
        // instead of a silently-ignored argument.
        if (args.target !== undefined && args.target !== null) {
          throw new Error(
            'pty_send_slash is self-only: the `target` parameter was removed ' +
              '(neighbor-autonomy design decision 2026-06-07). To ask another ' +
              'bot to run a command, send it an agent-bus kind:"prompt" and ' +
              'let its own AI execute the command itself.',
          )
        }

        const rawCommand = args.command
        const rawCommands = args.commands
        if (rawCommand !== undefined && rawCommands !== undefined) {
          throw new Error('pass exactly one of `command` / `commands`, not both')
        }

        // Normalise to a list; validate every entry identically.
        let commands: string[]
        if (rawCommands !== undefined) {
          if (!Array.isArray(rawCommands) || rawCommands.length === 0) {
            throw new Error('commands must be a non-empty array of slash commands')
          }
          if (rawCommands.length > 8) {
            throw new Error(`commands batch too long (${rawCommands.length} items, max 8)`)
          }
          commands = rawCommands as string[]
        } else {
          if (typeof rawCommand !== 'string' || rawCommand.length === 0) {
            throw new Error('command must be a non-empty string (or pass `commands` for a batch)')
          }
          commands = [rawCommand]
        }
        for (const c of commands) {
          if (typeof c !== 'string' || !SLASH_COMMAND_RE.test(c)) {
            throw new Error(
              `every command must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — got: ${JSON.stringify(c)}`,
            )
          }
          // Telegram-layer commands don't exist inside Claude Code — injecting
          // them wedges the TUI on an invalid command. Reject with a message
          // that names the correct alternative.
          const layerError = telegramLayerCommandError(c)
          if (layerError) {
            throw new Error(layerError)
          }
        }

        if (!wrapperLikelyRunning(STATE_DIR)) {
          throw new Error(
            'wrapper not detected (no fresh heartbeat). Launch CC via `mirza-cc` instead of `claude` directly.',
          )
        }

        // Single command — original pending-file shape, works on any wrapper.
        if (rawCommands === undefined) {
          const { id, path } = writeCommand(STATE_DIR, commands[0]!)
          return {
            content: [
              {
                type: 'text',
                text: `queued (id: ${id}) — wrapper will inject "${commands[0]}" into PTY shortly\npath: ${path}`,
              },
            ],
          }
        }

        // Batch — needs a RUNNING wrapper that understands array payloads.
        // The wrapper process keeps running old code until mirza-cc restarts,
        // so gate on its self-reported version, not the installed plugin's.
        const wrapperVersion = readWrapperVersion(STATE_DIR)
        if (!wrapperVersion || !versionAtLeast(wrapperVersion, BATCH_MIN_WRAPPER_VERSION)) {
          throw new Error(
            `running wrapper ${wrapperVersion ?? '(version unknown)'} does not support batch ` +
              `injection (needs >= ${BATCH_MIN_WRAPPER_VERSION}). Fall back to sequential ` +
              `single-command pty_send_slash calls, and tell the user to restart mirza-cc ` +
              `to activate the new wrapper.`,
          )
        }
        const { id, path } = writeBatch(STATE_DIR, commands)
        return {
          content: [
            {
              type: 'text',
              text:
                `queued batch (id: ${id}, ${commands.length} commands) — wrapper will inject ` +
                `${commands.map(c => `"${c}"`).join(' → ')} in order, atomically\npath: ${path}`,
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
