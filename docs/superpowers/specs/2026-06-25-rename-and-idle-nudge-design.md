# Rename UX + Idle-Session Naming Nudge — Design

**Date:** 2026-06-25
**Status:** Approved
**Author:** bot-06 (Mirza)
**Scope:** Two independent features in the `telegram` plugin. Namespace consolidation
(`mirza:*`) is explicitly **out of scope** for this spec (deferred — large blast radius).

---

## Feature A — `/rename` output + space validation

### Current behavior
`plugins/telegram/meta-commands.ts` (`handleRenameDirect`, around line 420–476):

- Sanitises the raw name by collapsing CR/LF to single spaces, trimming, capping at 64 chars.
- Spaces inside the name are currently **allowed** (the empty-name usage hint even
  suggests `/rename discuss MCP`).
- On success it replies: `✏️ Renaming session to "<newName>".`

### Required changes

1. **Output format → `from … to …`**
   Replace the success message with:
   ```
   ✏️ Renaming session from "<oldName>" to "<newName>".
   ```
   - `oldName` is resolved via `resolveCurrentSessionName(currentSid, telegramStateDir)`
     (from `current-session-info.ts`). Both `currentSid` and `telegramStateDir` are
     already resolved earlier in the handler for the uniqueness check — reuse them.
   - **Fallback:** if `oldName` is `null` (session was never named / not in registry),
     fall back to the existing single-form message `✏️ Renaming session to "<newName>".`
     Rationale: never invent or display a fake/placeholder old name.

2. **Reject names containing spaces**
   After sanitising and before the length cap, if the name contains any space
   (`/\s/` — covers the spaces that CR/LF were collapsed into), reject:
   ```
   ⚠️ Nama session tidak boleh mengandung spasi. Pakai tanda hubung, mis. /rename discuss-mcp.
   ```
   Return `true` (command consumed), do not write the wrapper command, do not touch
   the registry.
   - This is a hard reject, **not** auto-hyphenation (per user: "tidak diijinkan
     mengandung spasi").
   - Update the existing empty-name hint (currently `/rename discuss MCP`) to a
     space-free example: `/rename discuss-mcp`.

3. **Tests** (`plugins/telegram/meta-commands.test.ts`)
   - `from "<old>" to "<new>"` is produced when an old name is registered.
   - Fallback to `to "<new>"` form when no old name is registered.
   - A name containing a space is rejected with the no-space error and the wrapper
     command is **not** written.

### Files touched (A)
- `plugins/telegram/meta-commands.ts` — handler logic + messages.
- `plugins/telegram/meta-commands.test.ts` — new assertions.
- `plugins/telegram/commands-registry.ts` — update `/rename` help text if it documents
  the old space-permitting example (verify during implementation).

---

## Feature B — Idle-session naming nudge

A behavioral skill (plus a SessionStart hook for reliable detection) that lives **inside
the `telegram` plugin** — session naming is already telegram's domain, and this avoids
adding another standalone plugin.

### Behavior (from brainstorming answers)

- **Detection (decision i-a):** a **SessionStart hook** injects the current session name
  into the agent's context as `additionalContext`. This is deterministic and fires once
  at session start — a natural fit for "remind once."
- **Remind once (B1):** when the injected session name is `idle`, the skill makes the
  agent append a single one-line nudge to its first reply of the conversation, e.g.:
  > _FYI session ini masih bernama `idle`. Nanti setelah arah obrolan jelas aku usulkan
  > nama, atau kamu bisa `/rename <nama>` kapan saja._

  After that single nudge, the agent stays quiet about naming until it has a concrete
  recommendation.
- **Offer a name (B3 — AI judgment):** as soon as the conversation's direction is clear
  (the agent's own judgment — could be after one message or several), and the session is
  **still** named `idle`, the agent proposes a name with inline buttons:
  ```
  [Pakai "<nama>"]  [Nama lain]  [Nanti saja]
  ```
- **Apply (B2):** on `[Pakai "<nama>"]`, the agent renames the session itself via
  `pty_send_slash` with `/rename <nama>`. (`/rename` is **not** in pty-controller's
  telegram-layer reject list, so self-injection is allowed.)
  - `[Nama lain]` → the agent proposes an alternative or asks the user.
  - `[Nanti saja]` → drop it for now; do not re-offer unprompted.
- **Generated names are always space-free** (hyphenated), consistent with Feature A's
  validation — otherwise the self-injected `/rename` would be rejected by A.
- **Within-conversation tracking:** once the session has been renamed (by the user or by
  the agent), the agent stops nudging/offering for the rest of the conversation.

### SessionStart hook

- Resolves the current session id from the pty wrapper state
  (`wrapper.current_session_id`) and maps it through the telegram name registry
  (`resolveCurrentSessionName`) to get the human name.
- Emits `additionalContext` stating the current session name (e.g.
  `Current Telegram session name: "idle"`). The skill keys off this.
- Must degrade silently: if the wrapper/registry state is missing (no wrapper, fresh
  machine), emit nothing rather than erroring.

### New skill

- New skill directory under `plugins/telegram/skills/` (name e.g. `name-session`).
- Description triggers on: handling a Telegram inbound while the current session is named
  `idle`. Encodes the once-remind / judgment-offer / button-apply flow above.
- Registered in `plugins/telegram/.claude-plugin/plugin.json` (skill) and the hook wired
  via the plugin's hooks configuration.

### Files touched (B)
- `plugins/telegram/.claude-plugin/plugin.json` — register the SessionStart hook.
- `plugins/telegram/hooks/…` — new SessionStart hook script (resolve + inject name).
- `plugins/telegram/skills/name-session/SKILL.md` — new behavioral skill.
- Possibly a small reused helper for "resolve current session name" (already exists as
  `resolveCurrentSessionName` + `readCurrentSessionId`).

---

## Out of scope

- Namespace consolidation into a single `mirza` plugin (`mirza:*`). Deferred due to large
  blast radius (agent-bus MCP server tool names, daily-report command, cross-bot
  references).

## Testing strategy

- **A:** unit tests in `meta-commands.test.ts` (TDD — write failing tests first).
- **B:** the hook's name-resolution logic gets a unit test (resolve from state files,
  silent degrade when absent). The skill is behavioral (prose) and verified by reading;
  the button/apply path reuses the already-tested `pty_send_slash` mechanism.

## Versioning / release

- Bump `plugins/telegram` version; update its marketplace.json description if the
  `/rename` behavior or the new skill warrants a mention. Follow the repo's
  three-copy git discipline (commit in the canonical workspace clone; push the release
  commit).
