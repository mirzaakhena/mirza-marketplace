---
description: Load the latest handoff file from <repo>/.handoff/, summarise it, and ask the user to confirm before continuing the work it describes.
argument-hint: "[yes]"
---

You are resuming work from a previous Claude Code session. Invoke the `resuming-from-handoff` skill — it locates the latest handoff file, summarises it, and asks the user to confirm before proceeding. Follow its instructions exactly.

Argument: `$ARGUMENTS`

If the argument is exactly `yes` (case-insensitive), the user has pre-confirmed — skip the confirmation prompt and proceed directly to executing Section 6's plan after showing a brief summary. Any other argument (or empty) means use the default behaviour with the human gate.
