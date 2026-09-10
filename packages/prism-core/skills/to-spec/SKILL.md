---
name: to-spec
description: Use to synthesize settled requirements into a concise durable specification without repeating the interview.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# To Spec

Capture the agreed design when a durable specification is useful.

1. Read settled conversation decisions, relevant project context and implementation.
2. Write one document under `docs/specs/` or the project's existing design location.
   Include the goal, scope/non-goals, behavior, constraints, consequential decisions,
   acceptance criteria and test seams. Link related documents instead of copying them.
3. Distinguish unresolved questions from decisions; never invent approval. Ask only
   about material gaps that prevent useful implementation.
4. Check for contradictions, vague criteria and accidental scope expansion.
5. If implementation was requested, continue with a short plan and TDD. If only
   documentation was requested, report the file and stop. Keep useful specs after
   implementation; no mandatory standalone spec commit or deletion lifecycle.

## Gotchas

- Do not re-interview the user about decisions already made.
- A specification is not proof that its behavior has been implemented or tested.
