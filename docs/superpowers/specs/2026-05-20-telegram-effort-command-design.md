# Telegram `/effort` Command

**Date:** 2026-05-20
**Affects:** `plugins/telegram/meta-commands.ts`, `plugins/telegram/meta-commands.test.ts`, `plugins/telegram/commands-registry.ts`, `plugins/telegram/context-renderer.ts`, `plugins/telegram/server.ts` (callback dispatch)
**Status:** Approved for implementation

## Motivation

Claude Code's effort level (`low | medium | high | xhigh | max | auto`) controls how aggressively the model reasons before responding. The user adjusts it daily — quick on-phone interactions want `low` (fast, cheap), deep architectural problems want `max`. Today the only way to change it is to type `/effort <level>` directly in the Claude Code terminal — impossible from a phone.

The fix is to mirror the `/rename` / `/model` pattern: Telegram intercepts `/effort`, writes a `/effort <level>` slash command to the wrapper inbox, and the wrapper injects it into the live PTY. CC processes the slash natively. This avoids inventing wrapper-side state or restarting sessions.

Because the value set is small and fixed (six levels), the no-arg form should render the choices as inline-keyboard buttons — same UX pattern as `/switch`. The user taps once instead of typing.

## Out of scope

- Persistence across `/new`. A fresh session resets to CC's default effort. Re-applying the previous effort would require wrapper-side state and creates a hidden gotcha ("why is my fresh session not at default?"). Each `/new` is a clean slate.
- Per-project default effort. Same rationale: every fresh session takes CC's own default.
- A way to *read* the current effort from inside the agent's tool surface. The agent can observe it via `last-status.json` (extended in this spec) but no MCP tool is added.
- Modifying CC's underlying behavior. This spec only adds a Telegram → CC routing path; CC's effort semantics are untouched.

---

## Behavior

### `/effort` (no argument) — show picker

When the inbound text is exactly `/effort` (lowercased, trimmed):

1. Read `last-status.json` from the state dir. If readable and `payload.effort.level` is one of the known values, that level is the **current** effort.
2. Reply with an inline keyboard listing the six levels. The current level (if known) is prefixed with `→ ` so the user sees what is active. Cancel button at the bottom; per `interactive-prompts` skill the cancel button doubles as the manual-fallback (closed value set — there is no free-form option to support).

   Message body: `🎯 Pilih effort level untuk session ini` (or similar — wording is not load-bearing).

3. Callback IDs follow the existing `meta:*` convention: `meta:effort_low`, `meta:effort_medium`, `meta:effort_high`, `meta:effort_xhigh`, `meta:effort_max`, `meta:effort_auto`, plus `meta:effort_cancel`.

### `/effort <level>` (with argument) — direct apply

When the text matches `/effort <token>` (single whitespace-separated arg, lowercased, trimmed):

1. If `<token>` is one of the six valid levels → write the slash command to the wrapper inbox and reply with a confirmation. No picker is shown.
2. If `<token>` is unknown → reply with a usage message listing the valid values. Do **not** write to the wrapper inbox.

   > `⚠️ /effort butuh salah satu: low, medium, high, xhigh, max, auto`

Rationale: power users on the keyboard can skip the picker; phone users get buttons. Same dual-path as `/rename`.

### Callback handling (button tapped)

The existing callback dispatcher in `server.ts` already routes `meta:*` to `tryHandleMetaCallback`. Add a branch that recognises `meta:effort_<level>`:

1. `meta:effort_cancel` → edit the picker message to `❌ Effort tidak diubah.`, clear the keyboard, done.
2. `meta:effort_<level>` (any of the six) → write `/effort <level>` to the wrapper inbox, then edit the picker message to a confirmation showing the new level (and the old level if known, e.g. `🎯 Effort: high → low ✅`). Clear the keyboard.

If the wrapper write fails, edit the picker to an error message including the underlying cause; the keyboard is cleared either way (the user shouldn't be left tapping a stale picker).

### Wrapper integration

No wrapper-side changes are required. The wrapper's `consumePending` loop already accepts any `{type:"slash", command:"<text>"}` payload and pastes it into the PTY followed by `\r`. `/effort <level>` is a normal slash from CC's perspective.

### Validation

- Levels: literal whitelist `low | medium | high | xhigh | max | auto`. Anything else is rejected.
- Whitespace handling: collapse runs of whitespace; trim ends. Newline/CR in arg is invalid (would corrupt the PTY-injected `/effort <level>\r` keystroke). For the no-arg form, ignore any trailing whitespace after `/effort`.

### Persistence

None. The state of "what effort the user last picked" is not stored anywhere by the plugin. CC owns effort state for the live session; `/new` discards it.

---

## Picker UX details

```
🎯 Pilih effort level untuk session ini

[ low      ] [ medium    ]
[ → high   ] [ xhigh     ]
[ max      ] [ auto      ]
[ ❌ Batal               ]
```

- Layout: 3 rows × 2 buttons + 1 cancel row spanning full width.
- Current-level marker: `→ ` prefix on the button label. If `last-status.json` is unreadable or the level is unknown, no marker is rendered (all buttons appear plain).
- Picker is sent as plain text to match the surrounding `/switch` picker style. No markdown formatting in the body.

---

## Files to touch

| File | Change |
|------|--------|
| `meta-commands.ts` | Add `/effort` branch in `tryRouteMetaCommand`: dispatch to either `handleEffortPicker` (no arg) or `handleEffortDirect` (with arg). Add the picker/direct handlers. Reuse `writeWrapperCommand` for the inbox write. |
| `meta-commands.ts` | Add `meta:effort_*` branch in `tryHandleMetaCallback`. |
| `meta-commands.test.ts` | New tests: no-arg → picker shape + callback IDs, valid arg → wrapper write, invalid arg → error reply (no wrapper write), whitespace/newline normalisation. |
| `commands-registry.ts` | Append a `CommandSpec` entry for `effort`. `/help` and `setMyCommands` pick it up automatically. |
| `context-renderer.ts` | Extend the `StatusLinePayload` type with `effort?: { level?: string }`. The field is already present in the real payload (verified: `last-status.json` shows `effort.level = "high"`); the type just lags. Also append `Effort: <level>` to the `/status` rendering meta lines, alongside the existing `Thinking: on/off`. |
| `server.ts` | If `tryHandleMetaCallback` is invoked through a central dispatcher that already routes `meta:*`, no change is needed here — only the dispatcher's branch list needs to include the new prefix. Verify during implementation. |

---

## Testing plan

- **meta-commands.test.ts** (extending the existing file, no wrapper coupling):
  - `/effort` exact → returns picker payload with six effort buttons + cancel; current-level marker present when status payload provides it; absent when status file missing.
  - `/effort high` → wrapper inbox write called with `{command:"/effort high"}`; reply text confirms the change.
  - `/effort  HIGH  ` → trimmed + lowercased → same as `/effort high`.
  - `/effort sometimes` → no wrapper write; reply lists valid values.
  - `/effort` followed by newline-bearing arg → newline stripped, rest validated.
  - Callback `meta:effort_low` → wrapper write with `/effort low`; picker edit replaces text with confirmation.
  - Callback `meta:effort_cancel` → no wrapper write; picker edited to "tidak diubah".
- **No wrapper changes** → no wrapper test changes.
- **commands-registry.test.ts** (already exists): if it asserts on the COMMANDS list shape, add an expectation for the new entry; otherwise no change.

---

## Risks & mitigations

- **CC changes the effort whitelist**. If CC adds/removes levels later, the plugin's whitelist drifts. Mitigation: keep the list in one constant (`EFFORT_LEVELS`) at the top of `meta-commands.ts` so future updates are a one-line change.
- **Wrapper not running**. Already handled by `writeWrapperCommand`'s existing detection (returns error → caller replies "wrapper not detected"). No new code needed.
- **Picker race**. User taps an effort button on a picker that's already been answered (stale message). The existing `meta:*` callback handler already deals with stale taps by editing the message to a "this picker is closed" placeholder; the same behaviour applies here for free.

---

## Open questions

None remaining. All UX decisions locked during brainstorm:

1. Slash command, not CLI flag → wrapper-inject `/effort <level>`.
2. Picker for no-arg form, direct apply for argument form.
3. No persistence across `/new`.
4. Current effort marked on picker via `last-status.json` (typed in this spec).
5. `/help` registration through `commands-registry.ts`.
