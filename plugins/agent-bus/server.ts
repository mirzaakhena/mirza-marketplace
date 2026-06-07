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
import { validatePromptBody, validateHopCount, composePromptText, writePromptToPending } from './prompt-compose'
import { normalizeTargets, isDestructiveSlash } from './send-guards'

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
  { name: 'agent-bus', version: '0.0.4' },
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
        "Read a peer's current-session details: session id, session name, context usage % (context_used_percent), total context window in tokens (context_window_size, e.g. 200000 or 1000000 — use this for threshold math instead of parsing the model string), model display name, and effort level. Sources from the peer's telegram plugin last-status.json when it describes the live session; when that snapshot is stale (its session_id differs from the pty-controller wrapper.current_session_id) or absent, falls back to the wrapper's current_session_id/current_session_name files. NOTE: context_used_percent (and context_window_size/model) = null means the session is fresh / not yet active — treat null as ~0% used, NOT as an error. Safe to call autonomously.",
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
        "Send a one-way message to one or more peer bots. Two kinds:\n" +
        "  • kind=\"prompt\": deliver a natural-language instruction to the peer. It is typed into the peer's Claude session as a normal user turn (via the mirza-cc wrapper) and the peer acts on it. One-way — there is NO reply channel. Newlines in the body are flattened to one line. If you want the peer to report back, say so inside the body (e.g. \"...when done, send a one-line summary back to bot-01\").\n" +
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
              hop_count: {
                type: 'number',
                description:
                  'For kind="prompt": loop-prevention counter. Omit (= 0) for a fresh, user-initiated prompt. When replying because an inbound agent-bus prompt explicitly asked you to report back, pass the hop value named in that message PLUS ONE. Sends with hop_count > 5 are refused.',
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
          context_window_size: sess.context_window_size,
          model: sess.model,
          effort_level: sess.effort_level,
        }
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
      }
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
          const v = validatePromptBody(body)
          if (!v.ok) throw new Error(v.error ?? 'invalid prompt body')
          const hop = validateHopCount(payload.hop_count)
          if (!hop.ok) throw new Error(hop.error ?? 'invalid hop_count')
          const text = composePromptText(self, body as string, hop.value)
          const results = targets.map(name => {
            const entry = reg.agents[name]
            if (!entry) {
              return { target: name, ok: false, error: 'not in registry', online: false }
            }
            try {
              const r = writePromptToPending(entry.state_dir, self, text, hop.value)
              return { target: name, ok: true, path: r.path, online: isOnline(entry.last_heartbeat) }
            } catch (err) {
              return { target: name, ok: false, error: err instanceof Error ? err.message : String(err), online: isOnline(entry.last_heartbeat) }
            }
          })
          return {
            content: [{ type: 'text', text: JSON.stringify({ kind: 'prompt', results }, null, 2) }],
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

