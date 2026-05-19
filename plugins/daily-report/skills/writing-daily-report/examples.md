# Reference reports (annotated)

These are **synthetic illustrative examples**, not real reports. Study the density, the verb choices, and the specificity of technical terms. They inform style only — never copy any content from them. Each bullet in your generated report must trace back to the actual context blob from `gather-context.sh` plus the user's free prompt.

All examples below follow the default counts: 5 bullets for `# Yesterday`, 3 bullets for `# Today`.

Every bullet across the examples lands at 10–15 words, one short sentence each. That is the target shape: scannable, compact, no multi-sentence narration. Examples A–C show the canonical voice; Example D applies the same compact shape to a day with more uncertainty (decisions, deferrals) without expanding into paragraphs.

---

## Example A — E-commerce backend

```
Hello, this is my daily report:

# Yesterday
- Implement Redis-backed session store behind the existing auth middleware
- Migrate user profile table from MySQL 5.7 to 8.0 with composite index
- Add idempotency key support to the order creation endpoint
- Debug intermittent 502s in checkout traced to gRPC client timeout
- Review and merge inventory reservation refactor PR

# Today
- Wire idempotency key into payment webhook handler
- Profile checkout endpoint under k6 load and capture p95 latency baseline
- Document new session store rotation procedure for the on-call runbook
```

**What to notice:**
- 5 yesterday, 3 today — matches default counts.
- Specific tokens grounded in (hypothetical) context: `Redis`, `MySQL 5.7 → 8.0`, `(tenant_id, email)` composite index, `gRPC client`, `k6`, `p95`.
- Action verbs: `Implement`, `Migrate`, `Add`, `Debug`, `Review`, `Wire`, `Profile`, `Document`.
- Non-coding work appears as a peer (PR review, runbook doc).
- No `continue`, no filler words, no internal jargon.
- A reader who has never touched the repo still understands what each bullet did.

---

## Example B — Data pipeline

```
Hello, this is my daily report:

# Yesterday
- Add dead-letter queue consumer to the events ingestion pipeline with exponential backoff
- Refactor schema validation step to fail fast on missing tenant_id rather than dropping silently
- Implement Parquet partition compaction job for the warehouse hourly bucket
- Investigate Kafka consumer lag spike on orders topic, traced to slow downstream sink
- Update Airflow DAG retry policy from 1 to 3 with 5-minute exponential backoff

# Today
- Validate compaction job end-to-end against staging warehouse with one day of replayed traffic
- Add OpenTelemetry spans around the schema validation step to expose per-record drop reasons
- Review pipeline observability dashboard with platform team
```

**What to notice:**
- Real file/module names you'd expect to see in this domain: `events ingestion pipeline`, `Parquet partition compaction job`, `orders topic`, `Airflow DAG`.
- Numeric specifics where they appear in context (`from 1 to 3`, `5-minute`, `one day`) — these are only acceptable when grounded in a commit, diff, or free-prompt mention.
- Mix of build / debug / investigate / review verbs.
- The investigation bullet is grounded enough to be useful (`traced to a slow downstream sink`) without inventing root-cause specifics.

---

## Example C — Mobile SDK

```
Hello, this is my daily report:

# Yesterday
- Implement retry-with-jitter wrapper around the SDK's network client for transient 5xx
- Add iOS background task handler so telemetry batches survive app suspension
- Fix cold-start crash when cached config is corrupt by falling back to bundled defaults
- Document public API surface for the new analytics module in the SDK README
- Review external integrator's reproduction repo for the reported memory leak

# Today
- Reproduce the reported memory leak in Instruments and capture allocation trace
- Add unit tests covering the corrupt-config fallback path
- Cut a 3.4.0-rc1 build for the integrator to validate the leak fix candidate
```

**What to notice:**
- Domain-specific specificity: `Instruments` (Apple profiler), `cold start`, `background task handler`, `3.4.0-rc1`.
- The investigation work (`Review external integrator's reproduction repo`) is reported as legitimate — it's not coding but it's grounded.
- `Today` directly continues `Yesterday`'s thread (review → reproduce → fix → ship rc), demonstrating rule 9's continuation pattern.

---

## Example D — ML inference service (compact voice with deferrals)

```
Hello, this is my daily report:

# Yesterday
- Stop model warmup from blocking the readiness probe during deploys
- Add fallback to the previous model version when embeddings return NaN
- Switch feature-store reads to a small async batcher; p95 dropped 40 ms
- Document the on-call runbook for embedding service rollbacks
- Review the inference autoscaler PR and flag cold-start ramp comments

# Today
- Ship the embedding fallback to staging and watch error rate for an hour
- Investigate why the autoscaler cold-start fix misses the largest model
- Decide on the two flaky recommendation tests: fix or skip
```

**What to notice:**
- Every bullet is 10–14 words, one short sentence. No parentheticals, no follow-up clauses.
- Real outcomes named compactly: `40 ms`, `p95`, `NaN`, `readiness probe` — facts, not qualifiers.
- Decisions and deferrals get their own short bullets (`Decide on the two flaky tests: fix or skip`) instead of being narrated inside a longer thought.
- `Today` bullets are forecasts, not narrations — each is a single planned next-step.
- No commit hashes, branch names, MR numbers, internal file paths or function names.

---

## Anti-pattern A — internal process jargon

```
# Yesterday
- Continue option A from yesterday
- Work on the v2 plan
- Some refactoring on the auth thing
- Just a quick fix to the spike branch
- Discussion with team about path 1 vs path 2
```

**Why this fails:**
- `Continue option A` — internal process shorthand; no external reader knows what `option A` is.
- `the v2 plan` — assumes shared standup context.
- `the auth thing`, `a quick fix`, `some refactoring` — vague, generic, filler-laden.
- `spike branch` — internal codename for a process step; replace with what the spike was actually exploring (e.g., `Prototype OAuth device-flow login in the auth service`).
- `path 1 vs path 2` — pure internal jargon. Either drop the bullet or describe the substantive activity (`Compare cost of in-process vs sidecar telemetry collection`).
- Multiple bullets start with `Continue` or filler verbs.

A bullet should still make sense to a reader pulled in cold. If it doesn't, rewrite it as the concrete activity.

---

## Anti-pattern B — AI-uniform voice

```
# Yesterday
- Implement Redis-backed caching layer for session lookups
- Refactor authentication middleware to support OAuth flows
- Add comprehensive test coverage for the payment processing module
- Migrate database schema from version 5 to version 8
- Document API endpoints for the new analytics dashboard

# Today
- Continue work on Redis caching layer integration
- Begin OAuth flow testing across all environments
- Schedule code review for the database migration
```

**Why this fails the voice check** — even though word counts and technical specificity look fine:

- `Today` opens two of three bullets with `Continue` and `Begin` — both AI tells; the actual activity is hidden behind a vague verb.
- No surfacing of what didn't go well, no decisions deferred, no honest deferrals. A real day has at least one of these.
- Every bullet closes on a similar beat (technical noun phrase). Reads like a feature-list press release.

The fix is not to drop technical specificity or expand the bullets. It's to use specific verbs (replace `Continue` / `Begin` with what's actually happening), and to surface at least one item that's deferred, blocked, or uncertain. See Example D for compact bullets that still admit deferral.

---

## Anti-pattern C — internal navigation leaking into bullets

```
# Yesterday
- Land commit 6591a0c fixing _resolve_env in agents/free-code/swe_bench_main.py
- Open MR #142 on feat/refactor-billing branch with 8 commits
- Update app/services/swe_bench_agent.py:152 to use absolute host path
```

**Why this fails:** the reader is your boss, not someone navigating your repo. Strip:
- `commit 6591a0c` → just describe the fix
- `MR #142 on feat/refactor-billing` → "open the billing-refactor merge request"
- `app/services/swe_bench_agent.py:152`, `_resolve_env` → name the activity, not the line

Rewritten:

```
- Fix the model-name override being silently ignored by the free-code wrapper
- Open the billing-refactor merge request for review
- Switch the agent workspace path resolution to an absolute host path so disk-backed mounts can replace the in-memory tmpfs
```

The internal token belongs in the commit message and the merge request description. The daily report is a different document for a different reader.

---

## Anti-pattern D — verbose bullets that bury the point

```
# Yesterday
- Built crash detection in the SWE-bench session runner so a hung or self-aborting agent container fails fast instead of burning the full per-benchmark timeout. Verified end-to-end with a forced docker kill mid-WAIT and four real failures from broken agents — across yesterday's test runs this saved roughly thirteen minutes of wasted polling.
- Surfaced the actual cause of the free-code agent failure by adding stdout capture to the wrapper. It isn't a model adapter issue at all — the binary aborts with "Not logged in · Please run /login" and ignores the API key env var. Same behaviour on Gemma 26B, Gemma 31B, and Sonnet from prior runs. Fix is now scoped: bake login state into the image or find a bypass flag.
```

**Why this fails:**
- Each bullet is 45–60+ words, far past the 15-word cap. The reader can't scan the column — every bullet demands a full read.
- Bullet 1 packs three distinct activities (build, verify, measure savings) into one paragraph. That's three bullets.
- Bullet 2 mixes the diagnostic finding, the root cause, the cross-model evidence, AND the proposed fix — each is its own thought, each its own bullet.
- Multi-sentence narration with `—`, `;`, and follow-up sentences is forbidden under rule 1.

Rewritten — same content, split into compact 10–15 word bullets:

```
# Yesterday
- Add crash detection to the SWE-bench session runner for hung agents
- Verify it end-to-end with a forced docker kill plus four broken-agent runs
- Capture wrapper stdout to surface free-code's real failure: "Not logged in"
- Confirm the auth gate hits Gemma 26B, Gemma 31B, and Sonnet
- Scope the fix as image-level: bake auth in or find a bypass flag
```

The information is identical. The shape is now scannable, and the cross-model evidence and the planned fix get their own bullets.

---

## Common patterns across the examples

- Every bullet is one short sentence, 10–15 words, no multi-sentence narration.
- Technical names and version numbers are surfaced — but only when they appear in the actual context blob.
- Action verbs are explicit and varied: `Implement`, `Migrate`, `Add`, `Debug`, `Refactor`, `Investigate`, `Profile`, `Document`, `Validate`, `Review`, `Wire`, `Fix`, `Cut`, `Decide`, `Scope`. Avoid `Continue`, `Begin`, and other vague openers.
- Non-coding work (reviews, investigations, docs, runbooks, meetings) is reported alongside coding work.
- Each bullet reads independently of any team-internal context — stripped of internal navigation tokens (commit hashes, branch names, MR numbers, function names, file paths).
- `Today` flows from `Yesterday` plus free-prompt hints, not invented from scratch. Honest deferrals and uncertainties belong here as much as confirmed plans — but each gets its own short bullet, not a paragraph.
