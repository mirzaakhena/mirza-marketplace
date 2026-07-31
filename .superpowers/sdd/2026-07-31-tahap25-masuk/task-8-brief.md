### Task 8: Release, then verify it live with the user

The only step that can prove any of this reaches Telegram. Unit tests cannot — this project has a costly precedent: 457 green tests while `answerCallbackQuery` was missing in production.

**This task requires the human partner.** Steps 4 onward cannot be executed alone; write them as instructions to the user and wait for their reports.

**Files:**
- Modify: `cc-plugin/.claude-plugin/plugin.json`, `cc-plugin/package.json`, `fleetd/package.json`
- Modify: `README.md` (repo root)
- Modify: `docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` (in `mirza-marketplace`)

**Interfaces:**
- Consumes: the shipped behaviour from Tasks 2-7.
- Produces: no code-facing interface. Output is an installed, restarted, live-verified fleet plus documentation.

**Test counts are unchanged by this task: fleetd 112, cc-plugin 27.** Run both suites once before Step 3 anyway — releasing on a red suite is the one way this task can do damage.

- [ ] **Step 1: Bump all three versions**

`cc-plugin/.claude-plugin/plugin.json`: `"version": "0.2.1"` → `"0.3.0"`.
`cc-plugin/package.json`: `"version": "0.2.1"` → `"0.3.0"`.
`fleetd/package.json`: `"version": "0.1.0"` → `"0.2.0"`.

The `fleetd` bump is not cosmetic: `doctor` reports it, which makes it the cheapest possible proof in Step 4 that the daemon was actually restarted with the new code rather than still running the old process. (`fleetd/test/doctor.test.ts` passes the version in as an argument and does not read `package.json`, so this breaks no assertion.)

- [ ] **Step 2: Update the README**

In `/Users/mirza/Workspace/mirza-bots/README.md`, replace the `### Jalur pesan (Tahap 2)` heading with `### Jalur pesan masuk (Tahap 2 + 2.5-MASUK)` and add these bullets to the end of that section's list (before the "Yang **belum** ada" paragraph):

```markdown
- **Dokumen** (PDF, zip, `.md`, `.log`, `.txt`) diunduh otomatis sampai **20 MB**
  — batas Telegram sendiri untuk bot, jadi tidak ada aturan tambahan yang perlu
  diingat. Di atas itu berkasnya tidak diambil dan AI diberi tahu (nama +
  ukuran lewat `meta`, plus satu kalimat pemberitahuan di isi pesan) — ditolak,
  bukan didiamkan. Nama berkas kiriman pengirim selalu lewat `safeName()`.
- **Kutipan (quote-reply) arah masuk.** Baik kutip seluruh pesan maupun seleksi
  sebagian: teks kutipannya ikut ke AI lewat `meta` (`quote_text`,
  `quote_is_manual`) dan id pesan yang dikutip lewat `reply_to_message_id`.
- **Album yang dikeraskan:** maksimum 10 item, diurutkan `message_id` menaik
  (bukan urutan tiba), satu foto gagal unduh tidak lagi menjatuhkan seluruh
  pesan, dan caption dari beberapa foto sekaligus diberi label `Photo <n>:`.
- **Dua tool riwayat untuk AI:** `read_history` (ambil pesan di sekitar sebuah
  `message_id` — inilah yang membuat "telusuri beberapa pesan setelah yang saya
  kutip" bisa dijawab) dan `search_history` (cari kata kunci, lewat FTS5).
  Keduanya **default ke bot pemanggil**; melihat percakapan bot lain hanya
  terjadi kalau parameter `bot` disebut sengaja.
- **Belum ditangani, disengaja:** voice note, video, video_note, dan sticker.
  Pesan jenis itu diabaikan diam-diam — kalau suatu hari muncul keluhan "kok
  bot-nya diam?", ini kandidat pertama yang diperiksa, bukan misteri baru.
```

- [ ] **Step 3: Commit and release the plugin**

`claude plugin install` is **not enough** when the plugin is already installed: it answers *"already installed"* and quietly keeps serving the old build. Proven on 2026-07-31 — committed fixes never reached the session until the sequence below was run.

```bash
cd /Users/mirza/Workspace/mirza-bots
git add cc-plugin/.claude-plugin/plugin.json cc-plugin/package.json fleetd/package.json README.md
git commit -m "release: cc-plugin 0.3.0, fleetd 0.2.0 -- Tahap 2.5-MASUK

Incoming path completed: message_id/reply_to/metadata/session_id stored, quote
replies, document handling with safeName() and the 20 MB limit, album hardening,
per-item download tolerance, and two history tools."

claude plugin marketplace update mirza-bots
claude plugin update cc-plugin@mirza-bots
claude plugin list | grep -A 2 "cc-plugin@mirza-bots"
```

Expected: `Version: 0.3.0`, `Status: ✔ enabled`. **If it still says 0.2.1, stop** — every live check below would be testing the old build.

- [ ] **Step 4: Restart `fleetd` and confirm it is the new build**

Ask the human partner to stop the running `fleetd` and start it again (its process holds the old code, and it owns the database migration):

```bash
cd /Users/mirza/Workspace/mirza-bots/fleetd
bun run start   # in its own terminal
bun run doctor
```

Expected: `"ok": true`, `"version": "0.2.0"`, `botCount: 2`, `conversationsReady: true`. The version is the proof the daemon actually restarted.

Then confirm the migration ran against the real database:

```bash
sqlite3 ~/.claude/mirza-bots/conversations.db "PRAGMA table_info(messages);" | grep session_id
```

Expected: one row naming `session_id`. If `sqlite3` is unavailable, `bun -e 'console.log(new (require("bun:sqlite").Database)(process.env.HOME + "/.claude/mirza-bots/conversations.db").query("PRAGMA table_info(messages)").all())'` does the same.

Then confirm the FTS index survived the ALTER on the real history — this is what Task 7's search tool runs on, and a detached index would report zero matches rather than an error:

```bash
sqlite3 ~/.claude/mirza-bots/conversations.db \
  "SELECT COUNT(*) FROM messages_fts f JOIN messages m ON m.id = f.rowid WHERE messages_fts MATCH 'halo';"
```

Expected: a non-zero count (assuming any stored message contains that word — substitute any word you know is in the history).

- [ ] **Step 5: Have the partner open a fresh session**

An already-running session keeps the old plugin build; `update` itself says *"Restart to apply changes"*.

```bash
cd /Users/mirza/Workspace/mirza-bots
claude --dangerously-load-development-channels "plugin:cc-plugin@mirza-bots"
```

- [ ] **Step 6: Run the live check — spec §9's five criteria, in order**

Ask the human partner to do each of these on Telegram and report what the AI saw. **Report honestly, including partial results.**

1. **Quote-reply, whole message.** Reply to an earlier message and send something. → The AI's notification must carry `quote_text` and `reply_to_message_id`.
2. **Quote-reply, partial selection.** Drag-select part of an earlier message and reply. → `quote_text` must be the selected fragment and `quote_is_manual` must be `"true"`.
3. **Quote one of the bot's own messages.** → The quoted text must still arrive. The `reply_to_message_id` will **not** resolve to a history row yet — bot replies are not stored until 2.5-KELUAR (spec §8 risk 3). That is expected, not a defect.
4. **History navigation — the criterion that matters most (spec §9.2).** Quote an earlier message and ask, in the user's own words, *"telusuri beberapa pesan setelah pesan yang saya kutip."* → The AI must call `read_history` and answer from what came back. This is the proof `message_id` is useful rather than merely stored.
5. **Keyword search, own bot.** Ask the AI to find something by keyword. → `search_history` returns only this bot's messages.
6. **Keyword search, across bots.** Ask explicitly for another bot's conversation. → Only now may another bot's rows appear. **If step 5 already returned another bot's messages, stop and fix it** — that is a privacy defect, not a cosmetic one.
7. **Send a PDF and a `.md`.** → Both download into `inbox/<bot>/`, and the AI can read them from the path in `meta.attachments`.
8. **Send a document over 20 MB.** → The AI receives the notice sentence in the message content plus `document_names` / `document_size_bytes` / `document_status: "too_large"` in meta. Not silence.
9. **Send an album of 3 photos.** → **One** message, photos in the order they were sent, all three attachment paths present.
10. **Send an album of more than 10 photos.** → Expect **two** messages, not one: the cap flushes at 10 and the overflow becomes a second album. This is deliberate (Telegram itself caps media groups at 10 and splits client-side) — it is the correct outcome, not a defect. What would be a defect is a dropped photo.

- [ ] **Step 7: Record the outcome honestly in the spec**

Append a `## 11. Hasil uji live` section to `/Users/mirza/Workspace/mirza-marketplace/docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md` with one line per numbered check above, marked confirmed / failed / not tested — **including anything that was not tested**, which is the part that gets quietly dropped. Then commit and push it (this repo has a remote):

```bash
cd /Users/mirza/Workspace/mirza-marketplace
git add docs/superpowers/specs/2026-07-31-tahap25-masuk-design.md
git commit -m "docs(spec): record the Tahap 2.5-MASUK live check results"
git push
```

---

## Notes for the implementer

- Run `bun test` from **inside** `fleetd/` or `cc-plugin/`, never from the repo root.
- `mirza-bots` has no remote. `git push` there will fail and is never part of this plan. `mirza-marketplace` does have one, and Tasks 1 and 8 push there deliberately.
- Do not touch the `safeMeta` loop in `cc-plugin/src/server.ts`. It exists for SCAR-056: a single non-string value in `meta` makes Claude Code drop the entire notification with no error on either side. The corollary this plan enforces everywhere upstream: **never add a meta key whose value is undefined** — `String(undefined)` is the string `"undefined"`, which the AI then reads as content.
- The `version` string inside `new McpServer({ name: "cc-plugin", version: "0.1.0" })` is the MCP protocol identity, separate from the plugin manifest version. Task 8's bump does not change it, and no test asserts on it.
- `NormalizedMessage` grows across Tasks 2, 3, 5 and 6. Its final shape is: `bot`, `chatId`, `userId`, `userName?`, `messageId?`, `text?`, `photoUrls?`, `documents?`, `oversizedDocument?`, `callbackData?`, `replyTo?`, `quoteText?`, `quoteIsManual?`, `isAlbum?`, `messageIds?`, `ts`. If your task's field is missing from the type, an earlier task did not land — check before adding it a second time under a different name.
- Voice, video, video_note and sticker stay unhandled on purpose. If a live check turns up "the bot went silent", that is the first thing to check and the answer is documented, not a new mystery (spec §8 risk 1).
