/**
 * Guard for pty_send_slash: commands that exist only in the telegram/wrapper
 * layer must not be injected into Claude Code's PTY. CC doesn't know them, so
 * the injection wedges as an invalid command in the TUI (real incident:
 * `/new idle`, 2026-06-07). Each entry maps to an error message that names
 * the correct alternative, so the calling AI can self-correct.
 *
 * Deliberately NOT blocked: `/clear`, `/rename`, `/compact`, `/resume`, and
 * plugin commands (e.g. `/handoff`, `/telegram:notify-user`) — those are all
 * CC-native or CC-dispatched and inject fine.
 */
const TELEGRAM_LAYER_COMMANDS: Record<string, string> = {
  '/new':
    '/new is a telegram-layer command, not a Claude Code command. To reset+rename a session, send ONE atomic batch: pty_send_slash commands:["/clear", "/rename <name>"].',
  '/switch':
    '/switch is a telegram-layer picker, not a Claude Code command. To switch sessions: inject "/resume <sessionId>" instead (that is exactly what the wrapper does for /switch), or ask the user to run /switch from Telegram.',
  '/delete':
    '/delete is a telegram-layer picker that removes session files; Claude Code has no equivalent slash command. Ask the user to run /delete from Telegram.',
  '/effort':
    '/effort pops a confirm picker that pty_send_slash cannot auto-confirm, so the injection wedges. Ask the user to run /effort from Telegram.',
}

/**
 * Return the rejection message when `command` is a telegram-layer command,
 * or null when it is fine to inject. Matches on the command word only —
 * arguments are ignored, and `/newer` etc. do NOT match `/new`.
 */
export function telegramLayerCommandError(command: string): string | null {
  const word = command.split(/\s/, 1)[0].toLowerCase()
  return TELEGRAM_LAYER_COMMANDS[word] ?? null
}
