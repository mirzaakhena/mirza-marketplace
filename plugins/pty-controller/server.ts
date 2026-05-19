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
import { resolveStateDir, writeCommand, wrapperLikelyRunning } from './ipc.ts'

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
      name: 'pty_status',
      description:
        'Check whether the mirza-cc wrapper is currently running and listening for commands. Returns { wrapper_alive: boolean, state_dir: string }. Call this before pty_send_slash if uncertain.',
      inputSchema: {
        type: 'object',
        properties: {},
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
