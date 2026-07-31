### Task 1: Verify where `session_id` actually comes from

**This task writes no production code.** Its output is an answer and a written decision, committed to the spec. It is first because the shape of Task 2's `resolveSessionId()` body depends on the result.

**This task requires the human partner.** It needs fresh Claude Code sessions opened by hand and `/status` read off the screen. An agent that tries to do this alone will fail at V-1(a) and be tempted to reach for V-3, which K-10 forbids.

Test the three candidates **in order, stopping at the first that succeeds**. Do not skip ahead: V-3 carries recorded scar tissue (SCAR-040: a pid file only ever holds the *active* session, so after a `/switch` becomes an in-place `/resume` the previous session is unreachable; SCAR-041: a statusline snapshot is only valid when its own `session_id` matches, and a freshly created session still carries the OLD session's data).

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` — **in `/Users/mirza/Workspace/mirza-marketplace`**, not in the code repo.
- Temporary (created and removed within this task): `/Users/mirza/Workspace/mirza-bots/.claude/settings.local.json` — only if V-2 is reached.

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a decision recorded as spec §10, naming exactly one of `V-1-full`, `V-1-partial`, `V-2`, `V-3-debt`, or `none`. Task 2 reads that verdict to pick which `resolveSessionId()` body to keep.

- [ ] **Step 1: Split V-1 into its two separable questions**

`CLAUDE_CODE_SESSION_ID` is already known to exist. Two different things could be true about it, and they need different verdicts:

- **(a) Is it a stable per-session discriminator?** — same value throughout one session, different value in a second fresh session.
- **(b) Is it the resume id?** — does the value appear as `"sessionId":"<value>"` inside a transcript in `~/.claude/projects/-Users-mirza-Workspace-mirza-bots/`?

- [ ] **Step 2: Run the V-1(a) probe — stability and distinctness**

Ask the human partner to open a fresh Claude Code session in `/Users/mirza/Workspace/mirza-bots` with the plugin channel loaded:

```bash
cd /Users/mirza/Workspace/mirza-bots
claude --dangerously-load-development-channels "plugin:cc-plugin@mirza-bots"
```

Then, from any shell, read the env of the running `cc-plugin` MCP process (macOS shows a process's environment with `ps -E`):

```bash
pgrep -f "cc-plugin/src/main.ts" | while read -r pid; do
  echo "pid=$pid"
  ps -Eww -o command= -p "$pid" | tr ' ' '\n' | grep '^CLAUDE_CODE_SESSION_ID='
done
```

Record the value. Read it **twice, at least two minutes apart within the same session** — same value both times means stable. Then ask the partner to close that session and open a second fresh one, and read it again. A different value in session 2 means distinct.

**(a) passes iff:** stable within a session AND different between the two sessions.

- [ ] **Step 3: Run the V-1(b) probe — resume-id equality**

With the value from session 1 in hand:

```bash
SID='<paste the value>'
grep -l "\"sessionId\":\"$SID\"" ~/.claude/projects/-Users-mirza-Workspace-mirza-bots/*.jsonl
ls -1 ~/.claude/projects/-Users-mirza-Workspace-mirza-bots/ | grep "$SID"
```

**(b) passes iff** either command produces a hit — the env value is the id Claude Code itself records for the session.

- [ ] **Step 4: Apply the three-way verdict rule**

Do not treat V-1 as pass/fail. The observed evidence (exists, but did not match a transcript) is neither.

| (a) | (b) | Verdict | What it means |
|---|---|---|---|
| yes | yes | **`V-1-full`** | Best case. `resolveSessionId()` reads the env var; nothing further owed. |
| yes | no | **`V-1-partial` — ACCEPT for 2.5, record as debt** | The column's stated purpose (spec §4) is "the Claude Code session the conversation took place in", and spec §8 risk 2 already accepts a connection-time snapshot with Tahap 4 owning authoritative session truth. A stable per-session discriminator satisfies that. Resume-id equality is required by **nothing in this scope** — do not fall through to V-2 for it. Record the gap so Tahap 4 knows the id is not resumable. |
| no | — | go to Step 5 | The value is not even a session discriminator; V-1 is genuinely out. |

- [ ] **Step 5: Only if V-1(a) failed — run the V-2 probe (`SessionStart` hook)**

This is the path K-10 explicitly blesses: *"session truth is reported by Claude Code through a hook, not scraped from its private filesystem."*

Add a temporary hook in `/Users/mirza/Workspace/mirza-bots/.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "mkdir -p \"$HOME/.claude/mirza-bots/session\" && cat > \"$HOME/.claude/mirza-bots/session/probe.json\""
          }
        ]
      }
    ]
  }
}
```

Ask the partner to open a fresh session, then inspect the captured payload:

```bash
cat ~/.claude/mirza-bots/session/probe.json
```

**V-2 passes iff** the JSON contains a `session_id` field with a plausible uuid, AND opening a second session overwrites it with a different one. Remove the temporary hook file afterwards either way.

- [ ] **Step 6: Only if V-1 and V-2 both failed — record V-3 as debt, do not silently adopt it**

V-3 (scraping the newest `.jsonl` by mtime, or the statusline snapshot) is forbidden by K-10 as a default. If it is the only remaining option, the verdict is `V-3-debt` and the spec note **must name SCAR-040 and SCAR-041 explicitly** as the failure modes being knowingly re-entered. If even V-3 is unworkable, the verdict is `none`: the column ships empty and Tahap 4 fills it (spec §6 already sanctions this — "the column is added regardless of the outcome").

- [ ] **Step 7: Write the decision into the spec and commit it**

Append to `/Users/mirza/Workspace/mirza-marketplace/docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md`:

```markdown
## 10. Hasil verifikasi Task 1 — sumber `session_id`

- **Tanggal:** <YYYY-MM-DD>
- **Verdict:** `<V-1-full | V-1-partial | V-2 | V-3-debt | none>`

| Probe | Hasil | Bukti |
|---|---|---|
| V-1(a) stabil dalam satu sesi, berbeda antar sesi | <ya/tidak> | sesi 1 = `<uuid>`, sesi 2 = `<uuid>` |
| V-1(b) sama dengan id resume (ada di transkrip) | <ya/tidak> | `<perintah grep + keluarannya>` |
| V-2 hook `SessionStart` | <tidak diuji / ya / tidak> | `<isi probe.json atau "tidak sampai ke sini">` |
| V-3 scrape `.jsonl` | <tidak diuji / dipakai sebagai utang> | `<SCAR-040 + SCAR-041 kalau dipakai>` |

**Utang yang dicatat:** <"tidak ada" atau kalimat yang menyebut apa yang belum
terbukti — mis. id-nya bukan id resume, jadi Tahap 4 tidak boleh memakainya
untuk `claude --resume`.>
```

Then commit and push — this repo **does** have a remote:

```bash
cd /Users/mirza/Workspace/mirza-marketplace
git add docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md
git commit -m "docs(spec): record the Task 1 verdict on where session_id comes from

Three candidates tested in order per spec §6. Verdict and the evidence behind
it are written down so Task 2 picks its resolveSessionId() body from a fact
rather than a guess, and so Tahap 4 inherits the known gap instead of
rediscovering it."
git push
```

- [ ] **Step 8: Confirm the baseline is untouched**

This task changed no code in `mirza-bots`. Prove it:

```bash
cd /Users/mirza/Workspace/mirza-bots && git status --short
cd /Users/mirza/Workspace/mirza-bots/fleetd && bun test
cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test
```

Expected: clean status; **fleetd 59 pass, cc-plugin 19 pass.**

---

