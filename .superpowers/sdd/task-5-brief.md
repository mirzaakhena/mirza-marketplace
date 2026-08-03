### Task 5: CI minimal

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: script `test` + `typecheck` dari root package.json (Task 1).

- [ ] **Step 1: Tulis workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: windows-latest   # named pipe & ConPTY = target produksi; jangan ganti ubuntu
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun test
```

- [ ] **Step 2: Validasi lokal setara CI**

Run: `bun install --frozen-lockfile && bun run typecheck && bun test`
Expected: semua exit 0. (Workflow-nya sendiri baru jalan setelah repo GitHub ada.)

- [ ] **Step 3: Commit**

```bash
git add .github && git commit -m "ci: bun test + tsc --noEmit (windows runner)

Agent: bot-03
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

