# `teach-me` — Teaching mode

A skill-only plugin that shifts the AI into **teaching mode** when the user is trying to understand a concept — not when the user already understands it and just wants to execute.

The goal: the AI doesn't dump information like an encyclopedia. Instead, the AI helps the user **build a mental model** step by step, using analogies the user brought themselves, and stops at a reasonable point so the user stays in the driver's seat for the next question.

## When this skill activates

The skill triggers when these signals show up:

- Explicit phrases: `"apa itu X"`, `"jelaskan"`, `"ajari saya"`, `"saya tidak paham"`, `"bisakah kamu menerangkan"`, `"what is X"`, `"explain X"`, `"teach me X"`
- The user asks follow-ups that probe the same concept from a new angle (a sign they're testing their own understanding)
- The user offers their own synthesis (`"ini intinya X, benar?"` — "so the gist is X, right?") — asking for confirmation or sharpening
- The user pushes back on the AI's earlier framing — not to debate, but to seek refinement
- An explicit invocation like `/teach-me` or similar

## When this skill does NOT activate

- The user already understands the concept and just wants a task executed → just do it
- The user wants a factual lookup with a single answer → just answer
- The user is debugging code and needs the bug found → use the debugging skill
- The user wants a status update or report → give the status, don't lecture

Rule of thumb: if the user seems to want to **learn**, activate. If the user seems to want to **get something done**, don't.

## Approach

This skill isn't about **what** gets explained, but **how** it's explained. Ten style elements used as a single package:

1. **Start from fundamentals**, one paragraph that fits in your head — before getting into technical details
2. **Mirror the user's analogy** — use the pattern the user already used, swap in the content
3. **Confirm and sharpen, never correct hard** — find the part that's right before refining
4. **Concrete examples for abstract concepts** — abstractions evaporate, examples stick
5. **Multi-dimensional when a single answer would mislead** — split the answer by dimension
6. **Visual structure** — `##` headings, **bold** for key terms, lists for parallel items (no `|` tables on Telegram)
7. **Increment, don't dump** — answer what was asked, don't get ahead of the next 5 questions
8. **Close with an open question** — `"Mau dalami bagian mana?"` ("Which part do you want to dig into?") — not a recap
9. **Mirror the user's language & register** — if they're casual + English technical terms, follow suit
10. **Resist the pull toward action** until the user gives an explicit signal they're ready to switch to do-mode

Core philosophy: **build understanding, don't dump information.** A short answer that sticks is worth more than ten paragraphs that slide right past.

## Anti-patterns it guards against

This skill also includes a list of failure modes the AI must avoid when explaining, along with how to fix each one:

- **Encyclopedia mode** — dumping everything you know when the user only asked about one thing
- **Premature technicality** — jumping to implementation details before the user has a high-level model
- **Correcting without confirming** — opening an answer with "actually, that's not how it works"
- **Refusing to commit** — answering everything with "it depends..." when there's one best answer for the user's context
- **Trailing summary** — closing with a recap of what the user just read
- **Lecture momentum** — keeping on adding detail after the answer was actually already done

Plus a 9-point self-audit checklist the AI checks before sending a teach-mode answer.

## Install

Make sure the `mirza-marketplace` marketplace has been added (see [root README](../../README.md) step 1). Then:

```
/plugin install teach-me@mirza-marketplace
/reload-plugins
```

The skill activates automatically based on the triggers above. No commands, MCP server, or extra setup — purely a behavioral skill.

## Author

- **Mirza** — [@mirzaakhena](https://github.com/mirzaakhena)
