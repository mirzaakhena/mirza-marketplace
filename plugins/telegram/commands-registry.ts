/**
 * Single source of truth for the Telegram plugin's slash-commands.
 *
 * Consumed by:
 *   - server.ts setMyCommands at boot (BotFather slash-menu, per scope)
 *   - server.ts access.json watcher (per-chat scope refresh on pairing/removal)
 *   - /help no-args (lists summaries, audience-aware)
 *   - /help <name> (shows the detail for one command)
 *
 * Adding a command: append a CommandSpec with an audience. Removing a command:
 * delete the entry AND the handler in server.ts/meta-commands.ts. Renaming:
 * keep this file aligned with the actual handler name.
 *
 * Audience semantics (drives both setMyCommands scope and /help filtering):
 *   - 'default' : shown to unpaired chats (all_private_chats scope) only.
 *   - 'paired'  : shown to paired chats (per-chat scope) only.
 *   - 'both'    : shown in both menus.
 *
 * Per-chat scope OVERRIDES the all_private_chats scope in Telegram, so a
 * paired user only sees the 'paired' + 'both' commands — never 'default'-only
 * ones like /start.
 */

export type Audience = 'default' | 'paired'

export interface CommandSpec {
  /** Command word without the leading slash. Lowercase, no whitespace. */
  name: string
  /** Which menu(s) this command appears in. */
  audience: Audience | 'both'
  /** Shown in BotFather's slash-menu next to the command. Keep terse. */
  menuHint: string
  /** One-line summary shown in /help (no-args). */
  helpSummary: string
  /** Full prose shown in /help <name>: what it does, examples, troubleshooting. */
  helpDetail: string
}

export const COMMANDS: CommandSpec[] = [
  {
    name: 'context',
    audience: 'paired',
    menuHint: 'Context window and session info',
    helpSummary: 'Context, rate limits, session info',
    helpDetail:
      'Shows the active Claude Code session\'s context-window usage, 5-hour and 7-day rate-limit usage, model, session id and name, working directory, cost, thinking mode, fast mode, and effort level. On the very first call it installs a statusLine bridge into <project>/.claude/settings.json so Claude Code can publish these stats. Troubleshooting: if the "⏳ Installing bridge..." message persists past 15 seconds, make sure Claude Code is running in the project directory. For plugin versions, use /version.',
  },
  {
    name: 'version',
    audience: 'paired',
    menuHint: 'Plugin and wrapper versions',
    helpSummary: 'Installed plugin & wrapper versions',
    helpDetail:
      'Shows the installed versions of the telegram plugin (from its plugin.json), the pty-controller plugin and mirza-cc wrapper (self-reported by the running wrapper), and the agent-bus plugin (from Claude Code\'s installed-plugins registry). Entries whose source is unavailable are omitted — e.g. pty-controller/mirza-cc lines disappear when the wrapper is not running.',
  },
  {
    name: 'switch',
    audience: 'paired',
    menuHint: 'Pick different session to talk to',
    helpSummary: 'Switch the active Claude session',
    helpDetail:
      'Shows an inline picker of project sessions. Tapping one resumes that session in Claude Code. Requires the mirza-cc wrapper to be running.',
  },
  {
    name: 'new',
    audience: 'paired',
    menuHint: 'Start a fresh named session',
    helpSummary: 'Start a fresh named Claude session',
    helpDetail:
      'Clears the current session and creates a fresh one with the given name. Usage: /new <name>. Example: /new bahas MCP. The wrapper (mirza-cc) must be running; otherwise the command replies with an error.',
  },
  {
    name: 'rename',
    audience: 'paired',
    menuHint: 'Rename the current session',
    helpSummary: 'Rename the active session',
    helpDetail:
      'Renames the currently active session. Usage: /rename <name>. Example: /rename utama. Names must be unique within the project; the command rejects duplicates.',
  },
  {
    name: 'delete',
    audience: 'paired',
    menuHint: 'Delete a session',
    helpSummary: 'Delete Claude sessions (soft default; hard = permanent; add "all" for bulk)',
    helpDetail:
      'Shows an inline picker of non-current sessions; tapping one asks for confirmation, then applies the chosen variant. Modes:\n\n' +
      '/delete (default) — soft delete. Hides the session from the /delete, /switch, and /archive pickers by appending its id to archived-sessions.json. The jsonl on disk is untouched, so `claude --resume` from a terminal can still reach it. To bring a session back into the pickers, edit archived-sessions.json on your laptop.\n\n' +
      '/delete hard — permanent delete. Removes the session\'s jsonl from disk. Not reversible.\n\n' +
      '/delete all — soft-delete every non-active session at once. One confirm button shows the count.\n\n' +
      '/delete hard all — permanently delete every non-active session at once. One confirm button shows the count; not reversible.\n\n' +
      'The currently active session is excluded in every mode.',
  },
  {
    name: 'effort',
    audience: 'paired',
    menuHint: 'Set effort level (low..max, auto)',
    helpSummary: 'Change Claude\'s effort level for this session',
    helpDetail:
      'Without an argument, shows a picker with the six effort levels: low, medium, high, xhigh, max, auto. The currently-active level (read from the statusLine bridge) is marked with a "→ " prefix. Tap to apply. With an argument (e.g. /effort low), applies directly without the picker. Effort is session-scoped in Claude Code — /new resets to the CC default; this command does not persist the choice across sessions. Requires the mirza-cc wrapper to be running.',
  },
  {
    name: 'help',
    audience: 'both',
    menuHint: 'Bot intro and command list',
    helpSummary: 'List commands; /help <name> for detail',
    helpDetail:
      'With no argument, lists every command with a one-line summary. With a command name (for example: /help status), shows the full help for that command, including examples and troubleshooting tips.',
  },
  {
    name: 'start',
    audience: 'default',
    menuHint: 'Welcome and pairing guide',
    helpSummary: 'Onboarding & paired identity',
    helpDetail:
      'Shows the welcome message. If you are not paired yet, you get pairing instructions and a 6-character code. If you are paired, it shows who you are paired as, the project directory, and the current session name. Hidden from the slash-menu once your chat is paired.',
  },
]

/** True when the command should be shown to the given audience. */
function matchesAudience(spec: CommandSpec, audience: Audience): boolean {
  return spec.audience === audience || spec.audience === 'both'
}

/** Filter COMMANDS for one audience, preserving registry order. */
export function commandsFor(audience: Audience): CommandSpec[] {
  return COMMANDS.filter(c => matchesAudience(c, audience))
}

/**
 * Maps the registry to grammy's setMyCommands payload shape, filtered by
 * audience. Default scope (all_private_chats) gets 'default' + 'both';
 * paired per-chat scope gets 'paired' + 'both'.
 */
export function toSetMyCommandsPayload(
  audience: Audience,
): { command: string; description: string }[] {
  return commandsFor(audience).map(c => ({ command: c.name, description: c.menuHint }))
}

const HELP_INTRO =
  'This bot bridges Telegram to a Claude Code session. ' +
  'Text and photos you send here are forwarded to your paired session; ' +
  'replies and reactions come back.'

const HELP_TROUBLESHOOTING_TAIL =
  'Bot not responding? Send any DM to check your pairing status.'

/**
 * Renders the /help (no-args) reply for the given audience: intro +
 * command list + troubleshooting tail. Paired callers only see commands
 * relevant once paired (so /start is hidden, matching their slash-menu).
 */
export function renderHelpList(audience: Audience): string {
  const list = commandsFor(audience).map(c => `/${c.name} — ${c.helpSummary}`).join('\n')
  return [
    HELP_INTRO,
    `Available commands:\n${list}`,
    'Type /help <command> for detail.',
    HELP_TROUBLESHOOTING_TAIL,
  ].join('\n\n')
}

/**
 * Renders /help <name> for one command, or null if no command matches.
 * Tolerates leading slash and any case in the argument. Audience-agnostic:
 * if the user types a valid command name we always show the detail, even
 * when that command isn't in their audience's menu — surfacing help for
 * something they can still type by hand is friendlier than a 404.
 */
export function renderHelpDetail(arg: string): string | null {
  const key = arg.trim().toLowerCase().replace(/^\//, '')
  if (!key) return null
  const spec = COMMANDS.find(c => c.name === key)
  if (!spec) return null
  return `/${spec.name} — ${spec.helpSummary}\n\n${spec.helpDetail}`
}
