### Task H4: PreToolUse commit-trailer guard tokenized (paralel wave 1)

**Files:** `packages/cc-stub/hooks/trailer-guard.ts` + `hooks/hooks.json` + test.
**Fix FUNC-4/5** (recon-hooks §A): matcher `Bash|PowerShell`; tokenisasi command → temukan `git ... commit` (izinkan global opts `-C/-c` sebelum subcommand), ekstrak ISI pesan (`-m/-am/-sm/--message[=]/-F/--trailer`), cek trailer `Agent: <bot>` pada ISI itu saja. Test: bypass lama (`-am`, `--message=`), false-positive lama (`grep -m 1 "git commit"`, trailer di heredoc lain) — semua harus benar.

