# Telegram Turn Minimization (B-9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Claude Code sessions from writing unread prose into their own transcript when the turn was triggered by an incoming Telegram message — the only thing that reaches the user is the `reply` tool call.

**Architecture:** Two changes, both in `cc-plugin/src/server.ts`. The full protocol lives once in the MCP server's `instructions` (in context for the whole session, zero per-turn cost). Each pushed Telegram notification carries only a short marker prefix. Injecting at `client.onPush()` — the sole entry point for Telegram messages — restricts the rule to Telegram-triggered turns with zero state, so terminal-typed turns are untouched by construction.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk` (`McpServer` wrapper), `bun:test` with `InMemoryTransport`.

**Spec:** `docs/superpowers/specs/2026-07-31-telegram-turn-minimization-design.md` (in `mirza-marketplace`).

## Global Constraints

- **Code repo is `/Users/mirza/Workspace/mirza-bots` — a different repo from the one holding this plan.** All code edits and commits happen there.
- `mirza-bots` has **no git remote**. Commit locally; never attempt `git push` there.
- Language rule (K-16): code, comments, and the `instructions` text are **English**. The AI's `reply` content to the user stays in the user's language — this plan changes nothing about that.
- `instructions` in this SDK version is typed **`string`**, not an array (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:15`). The old `plugins/telegram` passed an array; do not copy that shape.
- `TERSE_TURN_MARKER` must have exactly **one** definition shared by the forwarder and the instructions text (K-15: a contract used by more than one place gets one copy). A drift between the two silently disables the whole protocol with no error.
- SCAR-056 still applies: every value in a notification's `meta` must be a string. Do not touch that logic.
- `fleetd` must be running for any live check: `cd /Users/mirza/Workspace/mirza-bots/fleetd && bun run start`.

## Verifications already done (do NOT redo these)

Spec §6 required two live checks before finalizing. Both were resolved empirically on 2026-07-31 while writing this plan:

| # | Question | Result |
|---|---|---|
| V-1 | Does Claude Code / the API accept a turn as terse as `"."`? | **YES.** `claude -p` probe returned exactly `'.'`, `output_tokens: 3`, `is_error: false`. `"."` is the marker to use. |
| V-2 | Does `instructions` declared on the `McpServer` **wrapper** (not the low-level `Server` the old plugin used) reach the client? | **YES** at the protocol level. An `InMemoryTransport` probe confirmed `client.getInstructions()` returns the declared string. `McpServer` forwards `options` to `Server` (`mcp.js:24`), which reads `options.instructions` (`index.js:50`) and emits it in the initialize result (`index.js:268`). |

**Residual unknown, deliberately deferred to Task 3:** whether Claude Code *surfaces* those instructions into the AI's working context, and whether the AI actually complies over a long session. Neither is knowable from unit tests — that is exactly what Task 3's live check is for.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `cc-plugin/src/server.ts` | MCP surface: tools, push forwarding, and now the protocol contract | Modify — add `TERSE_TURN_MARKER`, `SERVER_INSTRUCTIONS`, wire both in |
| `cc-plugin/test/server.test.ts` | Tests for the MCP surface | Modify — 2 new tests, 1 existing assertion updated |
| `cc-plugin/.claude-plugin/plugin.json` | Plugin manifest the marketplace install resolves | Modify — version bump |
| `cc-plugin/package.json` | Package manifest | Modify — version bump (kept aligned as hygiene) |
| `README.md` (repo root) | User-facing docs | Modify — document the protocol |

---

### Task 1: Declare the protocol as MCP `instructions`

Gives the protocol a single home that is paid for once per session instead of once per turn.

**Files:**
- Modify: `cc-plugin/src/server.ts:1-16`
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `TERSE_TURN_MARKER: string` (exported const, value `"[protocol: terse-turn]"`) and `SERVER_INSTRUCTIONS: string` (exported const), both from `src/server.ts`. Task 2 imports `TERSE_TURN_MARKER`.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe("cc-plugin MCP server", ...)` block in `cc-plugin/test/server.test.ts`:

```ts
  test("the server declares MCP instructions that name the reply tool and the terse-turn marker", async () => {
    const client = fakeFleetdClient();
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    const instructions = mcpClient.getInstructions();

    // The protocol lives here (once per session) instead of being re-sent with
    // every push. If this is ever dropped, the per-turn marker becomes a
    // meaningless string the AI has no definition for.
    expect(instructions).toBeTruthy();
    expect(instructions).toContain(TERSE_TURN_MARKER);
    expect(instructions).toContain("reply");

    await mcpClient.close();
    await server.close();
  });
```

Add `TERSE_TURN_MARKER` to the existing import of `../src/server` at the top of the file, so the line reads:

```ts
import { buildServer, TERSE_TURN_MARKER } from "../src/server";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test test/server.test.ts`

Expected: FAIL — `TERSE_TURN_MARKER` is not exported from `../src/server` (import/resolution error).

- [ ] **Step 3: Write the implementation**

In `cc-plugin/src/server.ts`, insert these two exported consts between the imports and `export function buildServer(...)`:

```ts
// The single copy of this contract (K-15): the marker the push forwarder stamps
// onto Telegram-triggered turns, and the marker SERVER_INSTRUCTIONS teaches the
// AI to recognize. Two literals would drift apart silently -- the AI would keep
// looking for a marker that no longer arrives, and nothing anywhere would error.
export const TERSE_TURN_MARKER = "[protocol: terse-turn]";

// Lives in the MCP server's `instructions`, which Claude Code holds for the
// whole session: paid once, not once per turn. English on purpose (K-16 -- this
// is a machine-to-AI instruction, not a message to the user); the AI's `reply`
// content still follows the user's own language.
export const SERVER_INSTRUCTIONS = [
  "Messages from Telegram arrive in this session as notifications. The person you are talking to reads Telegram, not this transcript: the ONLY thing that reaches them is a `reply` tool call. Your transcript output reaches nobody.",
  "",
  `When an incoming message is prefixed with ${TERSE_TURN_MARKER}, do not write prose in that turn. Say everything you have to say through the \`reply\` tool, then end the turn with a single "." and nothing else. Never restate, summarize, or explain in the transcript what you already sent via \`reply\` -- nobody reads it, and it keeps costing tokens on every later turn of the session.`,
  "",
  "This applies only to turns carrying that prefix. Turns the user types directly into this terminal are ordinary turns -- answer those in full, as usual.",
].join("\n");
```

Then pass it to the constructor. Replace the existing `new McpServer(...)` call with:

```ts
  const server = new McpServer(
    { name: "cc-plugin", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        // Without this, Claude Code silently drops every
        // notifications/claude/channel push below -- the session never even
        // sees an error, the message just never arrives.
        experimental: { "claude/channel": {} },
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test`

Expected: PASS — 17 tests (the 16 existing plus the new one).

- [ ] **Step 5: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -m "feat(cc-plugin): declare the terse-turn protocol as MCP instructions

Paid once per session instead of re-sent with every push. TERSE_TURN_MARKER
is exported as the single shared definition so the forwarder (next commit)
and this text can never drift apart."
```

---

### Task 2: Stamp the marker onto pushed Telegram notifications

Makes each Telegram-triggered turn identifiable to the AI, without a flag or any session state.

**Files:**
- Modify: `cc-plugin/src/server.ts` (the `client.onPush(...)` callback)
- Test: `cc-plugin/test/server.test.ts`

**Interfaces:**
- Consumes: `TERSE_TURN_MARKER` from Task 1.
- Produces: notification `params.content` now equals `` `${TERSE_TURN_MARKER}\n${msg.text}` ``. `params.meta` is unchanged.

- [ ] **Step 1: Update the existing assertion that this change breaks**

`cc-plugin/test/server.test.ts` currently has a test named *"a push_message from fleetd is forwarded as notifications/claude/channel with string-only meta"* containing:

```ts
    expect(received.params.content).toBe("pesan baru dari Telegram");
```

That is now wrong by design. Replace that single line with:

```ts
    expect(received.params.content).toBe(`${TERSE_TURN_MARKER}\npesan baru dari Telegram`);
```

- [ ] **Step 2: Write the new failing test**

Append this test inside the same `describe` block:

```ts
  test("a pushed message is stamped with the terse-turn marker while preserving the original text verbatim", async () => {
    let capturedPushHandler: ((msg: PushMessage) => void) | undefined;
    const client = fakeFleetdClient({ onPush: (handler) => { capturedPushHandler = handler; } });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    let received: any = null;
    mcpClient.fallbackNotificationHandler = async (n) => { received = n; };
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    capturedPushHandler!({
      type: "push_message",
      text: "tolong cek status deployment",
      meta: { chat_id: "1", user_id: "2", kind: "message" },
    });
    await new Promise((r) => setTimeout(r, 50));

    // The marker leads so the AI reads it before the message itself.
    expect(received.params.content.startsWith(TERSE_TURN_MARKER)).toBe(true);
    // The user's own words must survive untouched -- the marker is additive.
    expect(received.params.content).toContain("tolong cek status deployment");
    // Structured fields keep travelling in meta, not in the text (SCAR-056).
    expect(received.params.meta.kind).toBe("message");

    await mcpClient.close();
    await server.close();
  });

  test("a button press (kind: callback) gets the same marker -- no special case", async () => {
    let capturedPushHandler: ((msg: PushMessage) => void) | undefined;
    const client = fakeFleetdClient({ onPush: (handler) => { capturedPushHandler = handler; } });
    const server = buildServer(client);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const mcpClient = new Client({ name: "test-client", version: "0.1.0" });
    let received: any = null;
    mcpClient.fallbackNotificationHandler = async (n) => { received = n; };
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);

    capturedPushHandler!({
      type: "push_message",
      text: "confirm_yes",
      meta: { chat_id: "1", kind: "callback" },
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(received.params.content).toBe(`${TERSE_TURN_MARKER}\nconfirm_yes`);

    await mcpClient.close();
    await server.close();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test test/server.test.ts`

Expected: FAIL — 3 failures. The two new tests fail because `content` has no marker; the updated existing assertion fails for the same reason.

- [ ] **Step 4: Write the implementation**

In `cc-plugin/src/server.ts`, inside the `client.onPush((msg) => {...})` callback, change the `notification` call so `content` carries the marker. The `meta` argument and the surrounding `safeMeta` loop stay exactly as they are:

```ts
    server.server
      .notification({
        method: "notifications/claude/channel",
        // The marker is the ONLY signal that distinguishes a Telegram-driven
        // turn from one the user typed in the terminal -- and it needs no flag
        // or stored state, because this callback is the sole path a Telegram
        // message can take into the session. The old system used a session-wide
        // `telegramDriven` flag for the same job and it went sticky: once a
        // session had ever seen a Telegram message, terminal-typed turns were
        // misclassified too (audit area-10 §10.2).
        params: { content: `${TERSE_TURN_MARKER}\n${msg.text}`, meta: safeMeta },
      })
      .catch((err) => {
        console.error(`cc-plugin: failed to forward push notification: ${err}`);
      });
```

- [ ] **Step 5: Run the full suite to verify it passes**

Run: `cd /Users/mirza/Workspace/mirza-bots/cc-plugin && bun test`

Expected: PASS — 19 tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add cc-plugin/src/server.ts cc-plugin/test/server.test.ts
git commit -m "feat(cc-plugin): stamp Telegram-triggered turns with the terse-turn marker

Injecting at onPush() -- the only path a Telegram message takes into a
session -- scopes the protocol to Telegram-driven turns with no flag and no
state, so it cannot go sticky the way the old telegramDriven flag did."
```

---

### Task 3: Release the change and verify it live

The only step that can prove the feature actually works. Unit tests cannot: they verify what the server *sends*, never whether the AI *complies*. This project has a costly precedent — 457 green tests while `answerCallbackQuery` was missing in production.

**This task requires the human partner.** Steps 4-6 cannot be executed alone.

**Files:**
- Modify: `cc-plugin/.claude-plugin/plugin.json:4`
- Modify: `cc-plugin/package.json:3`
- Modify: `README.md` (repo root)

**Interfaces:**
- Consumes: the shipped behaviour from Tasks 1 and 2.
- Produces: nothing code-facing. Output is a verified installed plugin plus documentation.

- [ ] **Step 1: Bump the version in both manifests**

An installed plugin is resolved from `.claude-plugin/plugin.json`. Leaving the version unchanged risks the install silently keeping the old build — the exact failure mode documented for the older marketplace (`mirza-marketplace/CLAUDE.md`, checklist item 1).

In `cc-plugin/.claude-plugin/plugin.json` change `"version": "0.1.0"` to `"version": "0.2.0"`.

In `cc-plugin/package.json` change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 2: Document the protocol in the README**

In `/Users/mirza/Workspace/mirza-bots/README.md`, add this subsection at the end of the section `## Memasang \`cc-plugin\` di Claude Code`:

```markdown
### Protokol giliran ringkas (terse-turn)

Sesi yang dipicu pesan Telegram menerima pesannya dengan awalan
`[protocol: terse-turn]`. Artinya bagi AI: jawab lewat tool `reply` saja,
lalu tutup giliran dengan satu titik — jangan menulis prosa di transkrip.
Alasannya: user yang memakai Telegram memang sedang jauh dari terminal dan
tidak membaca transkrip itu, sementara isinya tetap dibayar token dan tetap
menumpuk di context window sesi.

Protokol lengkapnya tinggal di field `instructions` MCP milik `cc-plugin`
(dibayar sekali per sesi), bukan diulang di tiap pesan. Aturan ini **hanya**
berlaku untuk giliran yang datang dari Telegram — giliran yang kamu ketik
langsung di terminal dijawab lengkap seperti biasa.

Ini optimasi yang gagal dengan aman: kalau AI mengabaikannya, yang terjadi
cuma kembali ke perilaku lama (prosa panjang di transkrip). Tidak ada jalur
yang putus.
```

- [ ] **Step 3: Commit, then reinstall the plugin**

```bash
cd /Users/mirza/Workspace/mirza-bots
git add cc-plugin/.claude-plugin/plugin.json cc-plugin/package.json README.md
git commit -m "release(cc-plugin): 0.2.0 -- terse-turn protocol for Telegram-driven sessions"
claude plugin install cc-plugin@mirza-bots
```

Expected: `Successfully installed plugin: cc-plugin@mirza-bots`.

Verify the installed version is the new one:

```bash
claude plugin list | grep -A 2 "cc-plugin@mirza-bots"
```

Expected: `Version: 0.2.0`, `Status: ✔ enabled`.

- [ ] **Step 4: Confirm `fleetd` is up, then ask the human partner to open a fresh session**

```bash
cd /Users/mirza/Workspace/mirza-bots/fleetd && bun run doctor
```

Expected: `"ok": true` with `botCount: 2`. If it errors, start it first with `bun run start` (background) and re-check.

Then ask the human partner to **close the existing Telegram-connected session and open a new one** (an already-running session keeps the old plugin build):

```bash
cd /Users/mirza/Workspace/mirza-bots
claude --dangerously-load-development-channels "plugin:cc-plugin@mirza-bots"
```

- [ ] **Step 5: Run the live check**

Ask the human partner to send several ordinary Telegram messages to `bot-01`, then report what the second session's transcript looks like. Confirm in order:

1. The AI still replies on Telegram normally — content unchanged, still in the user's language. **If this broke, stop: the optimisation is not worth a regression in the actual product.**
2. The transcript turns are terse (a bare `.`) instead of prose.
3. **Check again at turn 15-20+.** This is the real test — instruction-fade shows up in long sessions, not the first turn. A compliant first turn proves nothing.
4. Ask the human partner to type a message **directly in that terminal**. Confirm the AI answers it in full, as usual — the protocol must not leak onto terminal-typed turns.

- [ ] **Step 6: Record the outcome honestly**

Append a short result note to the spec (`mirza-marketplace/docs/superpowers/specs/2026-07-31-telegram-turn-minimization-design.md`) stating what was confirmed and what was not, then commit and push it in `mirza-marketplace`.

If prose reappears at turn 15-20+, the documented remedy (spec §8) is to lengthen the pointer toward the full text — the protocol keeps its single home. A second remedy worth trying first, since it costs nothing: move the marker from the start of `content` to the end, so it sits closest to the point of generation. **Do not** reach for a `Stop` hook: it cannot trim text that is already written, only force a regeneration, which spends more tokens than it saves (spec §7).

---

## Notes for the implementer

- Run `bun test` from inside `cc-plugin/`, not the repo root.
- `mirza-bots` has no remote. `git push` there will fail and is never part of this plan.
- Do not touch the `safeMeta` loop in `onPush`. It exists for SCAR-056: a single non-string value in `meta` makes Claude Code drop the entire notification with no error on either side.
- The `version` string inside `new McpServer({ name: "cc-plugin", version: "0.1.0" })` is the MCP protocol identity, separate from the plugin manifest version. Task 3's bump does not require changing it, and no test asserts on it.
