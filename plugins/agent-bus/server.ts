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
        const selfDir = (process.env.CLAUDE_PROJECT_DIR ?? '').replace(/[\/\\]+$/, '')
        const self = selfDir.split(/[\/\\]/).filter(Boolean).pop() ?? 'unknown'

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
