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
  writeRestartCommand,
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
        'Send a Claude Code slash command (e.g. "/clear", "/compact", "/notify-user") to the current CC session by writing a request file the parent wrapper consumes. The wrapper injects the keystrokes into the PTY, where CC processes the command on its next input-loop tick. Returns immediately; the actual command may execute after the current AI turn completes. Requires the mirza-cc wrapper process to be running — call `pty_status` first if you are not sure.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'The slash command to inject, including the leading slash. Must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — at most 64-char command name (the `:` is allowed so namespaced plugin commands like `/telegram:notify-user` dispatch correctly), optional 256-char argument. Examples: "/clear", "/compact", "/telegram:notify-user fresh session ready".',
          },
        },
        required: ['command'],
      },
    },
    {
      name: 'pty_restart',
      description:
        'Restart the entire Claude Code process hosted by the mirza-cc wrapper. The wrapper kills the PTY and respawns CC with --resume <latestSessionId>, so the conversation continues seamlessly but all MCP servers and plugin code are reloaded fresh. Use this after editing plugin source files (.ts) so the changes take effect without losing the current chat. Returns immediately; the actual restart happens after this turn ends. The current AI turn will be interrupted — call this as the LAST action in your turn. Requires the mirza-cc wrapper to be running.',
      inputSchema: {
        type: 'object',
        properties: {},
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
        'List all peer Claude Code agents currently registered in the shared agent registry (~/.claude/agent-registry.json, written by every mirza-cc wrapper). Each entry exposes its agent name (basename of its project dir), state directory, last heartbeat, heartbeat age in seconds, and whether it is alive (heartbeat fresher than 30s). Pass `only_alive: true` to filter out stale entries. Use this before calling `pty_send_slash_to` to discover valid targets.',
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
    {
      name: 'pty_send_slash_to',
      description:
        'Same as `pty_send_slash`, but targets a DIFFERENT agent identified by name. Resolves the target agent\'s state directory from the shared registry, validates the target is alive (heartbeat <30s), then writes the command to the target\'s wrapper inbox so that wrapper injects the keystrokes into ITS Claude Code PTY. Use this for cross-agent coordination (e.g. tell bot-03 to run `/telegram:notify-user`). Call `pty_list_agents` first to discover valid agent names.',
      inputSchema: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            description: 'Name of the target agent as registered in the agent registry (e.g. "bot-03"). Must match an entry returned by `pty_list_agents`.',
          },
          command: {
            type: 'string',
            description:
              'The slash command to inject on the target agent, including the leading slash. Same format and limits as `pty_send_slash`: /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/.',
          },
        },
        required: ['agent', 'command'],
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
      case 'pty_restart': {
        if (!wrapperLikelyRunning(STATE_DIR)) {
          throw new Error(
            'wrapper not detected (no fresh heartbeat). Launch CC via `mirza-cc` instead of `claude` directly.',
          )
        }
        const { id, path } = writeRestartCommand(STATE_DIR)
        return {
          content: [
            {
              type: 'text',
              text: `queued restart (id: ${id}) — wrapper will kill PTY and respawn shortly\npath: ${path}`,
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
      case 'pty_send_slash_to': {
        const agent = args.agent
        const command = args.command
        if (typeof agent !== 'string' || agent.length === 0) {
          throw new Error('agent must be a non-empty string')
        }
        if (typeof command !== 'string' || command.length === 0) {
          throw new Error('command must be a non-empty string')
        }
        if (!SLASH_COMMAND_RE.test(command)) {
          throw new Error(
            `command must match /^\\/[a-z][a-z0-9_:-]{0,63}(\\s.{0,256})?$/ — got: ${JSON.stringify(command)}`,
          )
        }
        const regPath = resolveAgentRegistryPath(process.env)
        const reg = readAgentRegistry(regPath)
        const entry = reg.agents[agent]
        if (!entry) {
          const known = Object.keys(reg.agents).join(', ') || '(none)'
          throw new Error(
            `unknown agent "${agent}". Known agents: ${known}. Call pty_list_agents to refresh.`,
          )
        }
        const [info] = describeAgents({ agents: { [agent]: entry } })
        if (!info.alive) {
          throw new Error(
            `target agent "${agent}" is not alive (last heartbeat ${info.last_heartbeat_age_s}s ago, threshold 30s).`,
          )
        }
        const { id, path } = writeCommand(entry.state_dir, command)
        return {
          content: [
            {
              type: 'text',
              text: `queued (id: ${id}) for agent "${agent}" — wrapper at ${entry.state_dir} will inject "${command}" into its PTY shortly\npath: ${path}`,
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
