# agent-bus

Plugin for inter-agent (bot-to-bot) communication between Claude Code instances running on the same machine.

## Tools

- `agent_list()` — list registered peers (online + offline)
- `agent_status(name)` — read peer's current session, model, context usage
- `agent_send(target, payload)` — write a slash-command request to the peer's pty-controller inbox

## Requires

- `pty-controller` plugin installed in both sender and receiver bots, running under the `mirza-cc` wrapper.
- Each wrapper auto-registers its bot into `~/.claude/agent-registry.json` on boot.

See design spec at `docs/superpowers/specs/2026-05-22-bot-to-bot-communication-design.md`.
