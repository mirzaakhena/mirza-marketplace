# Issue note — plugin skills not recognized by the agent in new/running sessions

- **Date:** 2026-06-06
- **Reported by:** Mirza (recurring annoyance, observed across many sessions)
- **Confirmed in:** session `bot-06`, where the `interactive-prompts` skill was installed and in-use (v0.0.3 in the marketplace cache) yet absent from the agent's available-skills list.

## Symptom

The user asks the agent to use a skill by name (e.g. `interactive-prompts`) and the agent replies that the skill "is not registered in this session" — even though the plugin is installed, enabled, and visible under `~/.claude/plugins/cache/mirza-marketplace/<plugin>/<version>/` with an `.in_use` marker.

This happens **every time a session starts before a plugin is enabled/reloaded**, and the user reports it frequently on fresh session openings as well.

## Root cause (as observed)

Claude Code injects the list of available skills into the agent's context **once, at session start**. The list is effectively frozen:

1. Plugins enabled or reloaded (`/plugin`, `/reload-plugins`) **after** the session begins do not retroactively register their skills in the running session's context.
2. The agent therefore genuinely cannot "see" the skill — it is not a recognition/naming failure by the model, and asking the agent again does not help.

## Impact

- The user must re-explain or paste skill content manually, defeating the purpose of packaging behavior as a skill.
- The agent may silently fall back to default behavior, missing mandatory rules the skill encodes (e.g. `interactive-prompts`' required `✏️ Jelaskan manual` escape-hatch button).
- Erodes trust: looks like the agent "forgot" something it was explicitly told to use.

## Workarounds (available today)

1. **Restart the session after enabling/reloading plugins** — e.g. via the `pty-controller` plugin's `/new`, so the fresh session boots with the updated skill list. This is the only way to get the skill formally registered.
2. **Agent-side fallback:** the agent can locate the plugin in the marketplace cache (or workspace) and Read its `skills/<name>/SKILL.md` directly, then follow it as if invoked. This works (used successfully in session `bot-06`) but is manual, unprompted agents won't think to do it, and it bypasses the Skill-tool bookkeeping.

## Suggested improvements

1. **Process rule (cheap, immediate):** after any `/plugin` enable/disable or `/reload-plugins`, restart the session before relying on new/changed skills. Consider documenting this in CLAUDE.md or automating it via pty-controller.
2. **Skill/plugin convention:** for skills that other plugins reference by name (like `interactive-prompts` referenced from task briefs), have dependent prompts/skills mention the fallback path (`read SKILL.md from the plugin source if not registered`) so agents self-recover.
3. **Upstream wish (Claude Code):** session-level skill list should refresh on `/reload-plugins`, or the Skill tool should resolve names dynamically against the current plugin cache instead of the session-start snapshot.

## References

- Session `bot-06`, 2026-06-06 — `interactive-prompts` v0.0.3 present in cache + `.in_use`, absent from session skill list; agent recovered by reading `plugins/interactive-prompts/skills/interactive-prompts/SKILL.md` directly.
