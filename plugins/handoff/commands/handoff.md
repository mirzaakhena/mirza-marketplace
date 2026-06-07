---
description: Direct bot-to-bot handoff — serahkan estafet pekerjaan ke bot lain lewat inline buttons (Now / After this task / Ping pong / File only).
---

You were invoked by the `/handoff` slash command. This command takes NO arguments — if any text follows it, ignore that text entirely (do not treat it as a target bot or as notes).

Invoke the `handoff` skill and follow its **sender flow starting from the mode-selection buttons** (skill section "Step 1 — pilih mode"). The skill contains the full procedure: mode buttons, bot picker, handoff-file template, agent-bus send + ACK protocol, timeout, and self-reset.
