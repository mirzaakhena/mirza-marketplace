# knowledge-vault

A behavioral skill that routes every bot to the team's shared Obsidian knowledge
vault (`mirza-vault`) and its conventions — so durable knowledge is captured
reusably and interlinked instead of being lost in per-session logs.

## What it does

The vault is a **central team knowledge base**: it captures every **lesson,
decision, concept, pattern, reference, and open question** as reusable, densely
linked atomic notes. A note sitting in the vault, however, does not make bots read
it — this plugin is the **trigger + pointer** that makes every bot aware of the
vault and its rules.

The skill activates when a bot:

- just learned something reusable (a mistake→rule, a decision + why, a technique,
  an environment fact);
- finished substantive work with a lesson/decision worth keeping;
- is about to write up findings, or is told to "record this to the vault"
  (in any language);
- wants to check whether the team already solved a problem.

It then directs the bot to read `mirza-vault/_meta/Conventions.md` (the single
source of truth) and `Home.md`, and summarizes the essentials so the bot can act:
durable-vs-disposable split, a flat `Knowledge/` pool, the 6 atomic note types, the
capture→distillation pipeline, naming, templates, and deprecate-don't-delete.

## Design

- **Single source of truth stays in the vault.** The skill is a pointer; it does
  not duplicate the spec. Update `Conventions.md` in the vault, not this skill,
  when the rules change.
- **Low lock-in.** The vault is plain markdown + wikilinks; no plugin is
  load-bearing.
- **Boundaries.** Complements, does not duplicate, `daily-report` (external,
  ephemeral) and Plane (transactional work tracking).

## Contents

- `skills/knowledge-vault/SKILL.md` — the behavioral skill.

## Author

Mirza.
