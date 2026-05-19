---
description: Generate a handoff markdown file capturing the current session so the next session can resume cleanly. Brainstorms first if next-step direction is unclear.
argument-hint: "[optional free-form notes]"
---

You are producing a session handoff for the user. Invoke the `writing-handoff` skill — it contains the full procedure: clarity-check rules, content structure, filename format, and write logic. Follow its instructions exactly.

The user's argument string (everything after `/handoff`, or empty) is captured below as `$ARGUMENTS`. Pass it through to the skill as the "extra notes from user" input — it goes verbatim into Section 7 of the handoff file.

If `$ARGUMENTS` is empty, that is fine. The skill still runs the clarity check and produces the file. The argument is purely supplementary context.

$ARGUMENTS
