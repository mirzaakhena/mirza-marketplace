/**
 * Single source of truth for the Telegram plugin's slash-commands.
 *
 * Consumed by:
 *   - server.ts setMyCommands at boot (BotFather slash-menu)
 *   - /help no-args (lists summaries)
 *   - /help <name> (shows the detail for one command)
 *
 * Adding a command: append a CommandSpec. Removing a command: delete the
 * entry AND the handler in server.ts/meta-commands.ts. Renaming: keep this
 * file aligned with the actual handler name.
 */

export interface CommandSpec {
  /** Command word without the leading slash. Lowercase, no whitespace. */
  name: string
  /** Shown in BotFather's slash-menu next to the command. Keep terse. */
  menuHint: string
  /** One-line summary shown in /help (no-args). */
  helpSummary: string
  /** Full prose shown in /help <name>: what it does, examples, troubleshooting. */
  helpDetail: string
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'start',
    menuHint: 'Welcome and pairing guide',
    helpSummary: 'Onboarding & paired identity',
    helpDetail:
      'Shows the welcome message. If you are not paired yet, you get pairing instructions and a 6-character code. If you are paired, it shows who you are paired as, the project directory, and the current session name.',
  },
  {
    name: 'help',
    menuHint: 'Bot intro and command list',
    helpSummary: 'List commands; /help <name> for detail',
    helpDetail:
      'With no argument, lists every command with a one-line summary. With a command name (for example: /help status), shows the full help for that command, including examples and troubleshooting tips.',
  },
  {
    name: 'status',
    menuHint: 'Context window and session info',
    helpSummary: 'Context, rate limits, session info, plugin version',
    helpDetail:
      'Shows the active Claude Code session\'s context-window usage, 5-hour and 7-day rate-limit usage, model, session id and name, working directory, cost, thinking mode, fast mode, and the plugin version. On the very first call it installs a statusLine bridge into <project>/.claude/settings.json so Claude Code can publish these stats. Troubleshooting: if the "⏳ Installing bridge..." message persists past 15 seconds, make sure Claude Code is running in the project directory.',
  },
  {
    name: 'new',
    menuHint: 'Start a fresh named session',
    helpSummary: 'Start a fresh named Claude session',
    helpDetail:
      'Clears the current session and creates a fresh one with the given name. Usage: /new <name>. Example: /new bahas MCP. The wrapper (mirza-cc) must be running; otherwise the command replies with an error.',
  },
  {
    name: 'switch',
    menuHint: 'Pick different session to talk to',
    helpSummary: 'Switch the active Claude session',
    helpDetail:
      'Shows an inline picker of project sessions. Tapping one resumes that session in Claude Code. Requires the mirza-cc wrapper to be running.',
  },
  {
    name: 'delete',
    menuHint: 'Delete a session',
    helpSummary: 'Delete a Claude session (soft by default; /delete hard = permanent)',
    helpDetail:
      'Shows an inline picker of non-current sessions; tapping one asks for confirmation, then applies the chosen variant. Two modes:\n\n' +
      '/delete (default) — soft delete. Hides the session from the /delete, /switch, and /archive pickers by appending its id to archived-sessions.json. The jsonl on disk is untouched, so `claude --resume` from a terminal can still reach it. To bring a session back into the pickers, edit archived-sessions.json on your laptop.\n\n' +
      '/delete hard — permanent delete. Removes the session\'s jsonl from disk. Not reversible.\n\n' +
      'The currently active session is excluded from the picker in both modes.',
  },
  {
    name: 'rename',
    menuHint: 'Rename the current session',
    helpSummary: 'Rename the active session',
    helpDetail:
      'Renames the currently active session. Usage: /rename <name>. Example: /rename utama. Names must be unique within the project; the command rejects duplicates.',
  },
  {
    name: 'effort',
    menuHint: 'Set effort level (low..max, auto)',
    helpSummary: 'Change Claude\'s effort level for this session',
    helpDetail:
      'Without an argument, shows a picker with the six effort levels: low, medium, high, xhigh, max, auto. The currently-active level (read from the statusLine bridge) is marked with a "→ " prefix. Tap to apply. With an argument (e.g. /effort low), applies directly without the picker. Effort is session-scoped in Claude Code — /new resets to the CC default; this command does not persist the choice across sessions. Requires the mirza-cc wrapper to be running.',
  },
]

/** Maps the registry to grammy's setMyCommands payload shape. */
export function toSetMyCommandsPayload(): { command: string; description: string }[] {
  return COMMANDS.map(c => ({ command: c.name, description: c.menuHint }))
}

const HELP_INTRO =
  'This bot bridges Telegram to a Claude Code session. ' +
  'Text and photos you send here are forwarded to your paired session; ' +
  'replies and reactions come back.'

const HELP_TROUBLESHOOTING_TAIL =
  'Bot not responding? Send any DM to check your pairing status.'

/** Renders the /help (no-args) reply: intro + command list + troubleshooting tail. */
export function renderHelpList(): string {
  const list = COMMANDS.map(c => `/${c.name} — ${c.helpSummary}`).join('\n')
  return [
    HELP_INTRO,
    `Available commands:\n${list}`,
    'Type /help <command> for detail.',
    HELP_TROUBLESHOOTING_TAIL,
  ].join('\n\n')
}

/**
 * Renders /help <name> for one command, or null if no command matches.
 * Tolerates leading slash and any case in the argument.
 */
export function renderHelpDetail(arg: string): string | null {
  const key = arg.trim().toLowerCase().replace(/^\//, '')
  if (!key) return null
  const spec = COMMANDS.find(c => c.name === key)
  if (!spec) return null
  return `/${spec.name} — ${spec.helpSummary}\n\n${spec.helpDetail}`
}
