import { test, expect } from 'bun:test'
import { checkCommit } from './commit-trailer-guard.ts'

const withTrailer = `git commit -m "$(cat <<'EOF'
feat: do a thing

Agent: bot-06
EOF
)"`

const withoutTrailer = `git commit -m "feat: do a thing"`

test('allows a commit that carries an Agent: trailer', () => {
  expect(checkCommit(withTrailer).deny).toBe(false)
})

test('denies a commit message with no Agent: trailer', () => {
  const r = checkCommit(withoutTrailer)
  expect(r.deny).toBe(true)
  expect(r.reason).toMatch(/Agent:/)
})

test('ignores non-commit git commands', () => {
  expect(checkCommit('git status').deny).toBe(false)
  expect(checkCommit('git add -A').deny).toBe(false)
})

test('ignores commits with no inspectable message (e.g. --amend opening an editor)', () => {
  expect(checkCommit('git commit --amend').deny).toBe(false)
})

test('ignores entirely unrelated bash', () => {
  expect(checkCommit('ls -la && echo hi').deny).toBe(false)
})
