---
description: Generate a daily work report from recent git activity and free-form context
argument-hint: "[optional free-form prompt]"
---

You are producing the user's daily work report, to be pasted into KakaoTalk.

## Step 1 — Invoke the skill

Invoke the `daily-report` skill. It contains the locked template, style rules, anti-fabrication guard, and generation procedure. Follow its instructions exactly.

## Step 2 — Gather context

Run this exact Bash snippet. It finds the `gather-context.sh` script at the correct path for whichever install scope is active, and runs it. **Do not construct any other path** — the installer always co-locates the script directly in the skill directory (there is NO `scripts/` subfolder at the install target).

```bash
for CANDIDATE in \
  "${CLAUDE_PLUGIN_ROOT}/skills/daily-report/gather-context.sh" \
  "./scripts/gather-context.sh" \
  "./.claude/skills/daily-report/gather-context.sh" \
  "$HOME/.claude/skills/daily-report/gather-context.sh"; do
  if [[ -x "$CANDIDATE" ]]; then
    bash "$CANDIDATE" "$@"
    exit 0
  fi
done
echo "gather-context.sh not found in any known location" >&2
exit 1
```

When installed as a plugin, the first candidate (`$CLAUDE_PLUGIN_ROOT/skills/daily-report/gather-context.sh`) is where the script lives. The remaining candidates exist for legacy installs.

Replace `"$@"` with any file paths the user mentioned in `$ARGUMENTS` (pass them as positional args to the script so their content lands in the `===EXTRA_FILES===` section). If the user did not mention any file paths, call it with no args.

### Troubleshooting

If the first path fails, try the next **as listed** — never invent intermediate directories. In particular:
- ✅ `~/.claude/skills/daily-report/gather-context.sh`
- ❌ `~/.claude/skills/daily-report/scripts/gather-context.sh`  (wrong — no `scripts/` subfolder at install target)
- ❌ `~/.claude/skills/scripts/gather-context.sh`  (wrong)

## Step 3 — Parse the free prompt

The user's free-form prompt is in `$ARGUMENTS`. It may be empty. Extract:

- Commit hashes (pass them as `--grep`-style filters into context if relevant, or simply mention them in the reasoning).
- File paths (include them when invoking `gather-context.sh`).
- `Today` hints.
- Any project-name override (e.g., `project=<name>`).
- Any explicit count override (e.g., "buat 7 yesterday, 4 today" / "make it 6 and 4") — overrides the skill's default of 5 yesterday, 3 today.

## Step 4 — Generate the report

Apply the generation procedure from the skill. Produce the final report in the locked template shape.

## Step 5 — Persist and emit

Using the `DATE` value from the context blob:

1. Use the Write tool to save the report to `.daily-reports/<DATE>.md` relative to the repo root. Overwrite if it exists.
2. Pipe the report to `pbcopy` via the Bash tool:

   ```bash
   cat .daily-reports/<DATE>.md | pbcopy
   ```

3. Print the full report to the conversation so the user sees a preview.

## Step 6 — Report back

End with a short, literal confirmation — no bulleted summary:

> Report saved to `.daily-reports/<DATE>.md` and copied to clipboard.

If context was thin (fewer than 2 commits, no TODO, no free prompt, no prev archive), also add:

> Context was thin — consider passing hints via the free prompt next time.

## Arguments

`$ARGUMENTS` contains the user's free prompt. It may be empty.
