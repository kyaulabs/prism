---
name: prototype
description: Use when you need to answer a technical viability question with throwaway code before committing to an implementation plan. Builds a disposable logic, UI, or boundary-integration prototype to learn fast and then delete.
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Prototype

A prototype is **throwaway code that answers a question**. The question
decides the shape. This is not production code — it exists to de-risk a
design decision before `writing-plans` commits to a detailed TDD plan.

## When to use

After `brainstorming` has produced a design but before `writing-plans` writes
the task breakdown. Use when you are uncertain about:

- Whether a state model or logic flow feels right.
- What a UI should look like or how it should behave.
- Whether a library, API, database, or other system boundary actually behaves
  as expected.

If you can write the plan with confidence, skip prototyping — go straight to
`writing-plans`.

## Pick a branch

Identify which question is being answered — from the user's prompt, the
surrounding code, or by asking:

- **"Does this logic / state model feel right?"** → [Logic branch](#logic-branch)
- **"What should this look like?"** → [UI branch](#ui-branch)
- **"Does this work at the boundary?"** → [Integration branch](#integration-branch)

The three branches produce very different artifacts — getting this wrong
wastes the whole prototype. If the question is genuinely ambiguous and the
user is not reachable, default to whichever branch better matches the
surrounding code and state the assumption at the top.

## Rules that apply to all branches

1. **Throwaway from day one, and clearly marked as such.** Locate the
   prototype close to where it will actually be used so context is obvious,
   but name it so a casual reader can see it is a prototype, not production.
   Use a `prototype_` prefix or a `prototypes/` directory.
2. **One command to run.** Use the active adapter's runtime and make startup a
   single copy-paste command.
3. **No persistence by default.** State lives in memory. Persistence is the
   thing the prototype is *checking*, not something it should casually depend
   on. If persistence is the question, use an isolated scratch resource with
   a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no production-grade error handling, no
   abstractions, and no adapter production-file ceremony. The point is to
   learn something fast and then delete it.
5. **Surface the state.** After every action, print or render the full relevant
   state so the user can see what changed.
6. **Delete or absorb when done.** When the prototype has answered its
   question, either delete it or fold the validated decision into the real
   implementation — do not leave it rotting in the repository.

## Logic branch

Build the smallest interactive script that pushes the state machine or logic
through cases that are hard to reason about on paper. Use the active adapter's
simplest executable language.

```text
# prototype_<concern> — THROWAWAY: answers "<question>"
# Run: <runtime> prototype_<concern>

state = "idle"
actions = ["start", "pause", "resume", "complete", "cancel"]

for action in actions:
    next = transition(state, action)
    print(state, action, next)
    state = next
```

- Print every transition so the user can see the flow.
- Include edge cases that are hard to reason about: empty input, concurrent
  actions, invalid transitions.
- If the logic involves a unit from the real codebase, import it directly —
  do not copy-paste it.

## UI branch

Generate several radically different UI variations in one disposable page or
screen, switchable through a query parameter, command-line option, or visible
selector.

```html
<!-- prototype_<screen>.html — THROWAWAY: answers "what should this look like?" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Prototype variants</title>
  <style>/* Keep disposable variant styles inline. */</style>
</head>
<body>
  <main id="variant"><!-- representative sample content --></main>
  <nav><!-- links or controls for radically different variants --></nav>
</body>
</html>
```

- Make variants **radically different** — not minor tweaks. The point is to
  see which direction feels right.
- Keep disposable styles and behavior inline; do not create production asset
  files.
- Do not wire up real data — use hardcoded sample data that represents the
  shape.

## Integration branch

Build a one-file throwaway that exercises the real database driver, API client,
filesystem, queue, or external-service boundary. The point is to verify the
actual boundary rather than a mock of it.

```text
# prototype_<boundary> — THROWAWAY: answers "does <pattern> work?"
# Run: <runtime> prototype_<boundary>

client = create_real_boundary_client(isolated_configuration)
result = client.perform(the_single_operation_under_test)
print_raw(result)
```

- Use the real adapter or protocol at the boundary.
- If testing an HTTP API, use the smallest available HTTP client rather than
  building a production client abstraction.
- Print the raw result so the user can see exactly what comes back.
- If the prototype touches persistence, isolate it and clean it up when done.
- Keep credentials in the environment and never print them.

## When done

The *answer* is the only thing worth keeping from a prototype. Capture it
somewhere durable (commit message, ADR, `CONTEXT.md` note, or a `NOTES.md` next
to the prototype) along with the question it was answering:

```markdown
# Prototype notes: <question>

**Question:** <what we were trying to answer>
**Answer:** <what we learned>
**Decision:** <what we will do as a result>
**Prototype file:** <path> (delete after capturing the answer)
```

If the user is around, that capture is a quick conversation; if not, retain
the unanswered decision clearly and do not present the prototype as validated.

## Cross-refs

- `brainstorming` skill — the step before this one (produces the design).
- `writing-plans` skill — the step after (produces the TDD plan, informed by
  the prototype's answer).
- `architect` skill — for non-trivial prototypes that touch system
  boundaries, load it to review the approach.
- The active adapter's stack skill — concrete runtime, database, and UI
  commands.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Prototype code accidentally committed to production* — always use a
  `prototype_` prefix or `prototypes/` directory, and delete it after
  capturing the answer.
- *Prototype assets leak into production sources* — keep disposable styles and
  behavior inline; never create production build inputs for throwaway work.
- *Prototype uses a fake boundary* — a boundary prototype must exercise the
  actual protocol or adapter; otherwise it answers the wrong question.
