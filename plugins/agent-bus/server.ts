#!/usr/bin/env bun
/**
 * MCP server for the agent-bus plugin. Exposes three tools:
 *
 *   • agent_list     — list peers in the global registry
 *   • agent_status   — peer's current session + context/model/effort
 *   • agent_send     — deliver a natural-language prompt to a peer
 *
 * agent_list and agent_status are read-only. agent_send is mutating —
 * the tool description tells the AI to call it ONLY when the user has
 * explicitly asked to message another agent.
 *
 * kind:"slash" was REMOVED (neighbor-autonomy design decision 2026-06-07,
 * docs/2026-06-07-design-decision-batch-injection-and-neighbor-autonomy.md):
 * a slash injection bypasses the peer's AI entirely — no guard on the
 * receiving side can refuse it. Prompts are the only inter-bot channel;
 * the peer's own AI decides whether and how to act.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { readRegistry, resolveRegistryPath } from './registry'
import { readPeerSessionInfo } from './peer-status'
import { validatePromptBody, validateHopCount, composePromptText, writePromptToPending } from './prompt-compose'
import { normalizeTargets } from './send-guards'

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
        "Send a one-way natural-language prompt (kind=\"prompt\") to one or more peer bots. The body is typed into the peer's Claude session as a normal user turn (via the mirza-cc wrapper) and the peer's OWN AI decides how to act — including whether to refuse. One-way — there is NO reply channel. Newlines in the body are flattened to one line. If you want the peer to report back, say so inside the body (e.g. \"...when done, send a one-line summary back to bot-01\").\n" +
        "kind=\"slash\" was REMOVED (neighbor-autonomy decision 2026-06-07): bots never inject commands into peers. To have a peer run a command (/clear, /rename, /daily-report, …), describe it in a prompt — its AI executes the command itself via its own self-only pty_send_slash.\n" +
        "`target` may be a single name or an array (broadcast/fan-out). DO NOT call autonomously — only when the user explicitly asks you to message another agent, OR when an inbound agent prompt explicitly told you to report back. Never auto-reply to an incoming agent message otherwise.",
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
              kind: { type: 'string', enum: ['prompt'] },
              body: {
                type: 'string',
                description: 'The natural-language instruction (max 8 KB).',
              },
              hop_count: {
                type: 'number',
                description:
                  'Loop-prevention counter. Omit (= 0) for a fresh, user-initiated prompt. When replying because an inbound agent-bus prompt explicitly asked you to report back, pass the hop value named in that message PLUS ONE. Sends with hop_count > 5 are refused.',
              },
            },
            required: ['kind'],
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
          lifecycle: sess.lifecycle,
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
          throw new Error(
            'kind:"slash" was removed (neighbor-autonomy design decision 2026-06-07): ' +
              'bots may not inject commands into a peer\'s session — that bypasses the ' +
              'peer\'s AI and no receiving-side guard can refuse it. Send kind:"prompt" ' +
              'describing what the peer should do; its own AI executes the command itself.',
          )
        }

        throw new Error(`unsupported payload kind: ${JSON.stringify(kind)} (expected "prompt")`)
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

