---
name: brainstorming
description: Use before any creative work — creating features, building components, adding functionality, or modifying behavior. Refines rough ideas into a validated design through one-question-at-a-time grilling, then writes a spec. Hard-gate: no implementation until the design is approved and a spec is written.
---

# Brainstorming Ideas Into Designs

Turn ideas into fully formed designs through natural collaborative dialogue.
Start by understanding the current project context, then ask questions one at a
time to refine the idea. Once you understand what you're building, present the
design and get user approval before any implementation.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project,
or take any implementation action until you have presented a design and the
user has approved it. This applies to EVERY change regardless of perceived
simplicity.
</HARD-GATE>

## Anti-pattern: "This is too simple to need a design"

Every change goes through this process. "Simple" changes are where unexamined
assumptions cause the most wasted work. The design can be short (a few
sentences for truly simple changes), but you MUST present it and get approval.

## Checklist

Complete these in order:

1. **Explore project context** — check files, docs, recent commits, `CONTEXT.md`.
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/
   success criteria.
3. **Propose 2–3 approaches** — with trade-offs and your recommendation.
4. **Present design** — in sections scaled to their complexity, get user
   approval after each section.
5. **Write spec** — save to `docs/specs/YYYY-MM-DD-<topic>-spec.md` and commit.
6. **Spec self-review** — quick inline check for placeholders, contradictions,
   ambiguity, scope.
7. **User reviews written spec** — ask the user to review before proceeding.
8. **Transition to implementation** — invoke the `writing-plans` skill to create
   an implementation plan.

## The process

**Understanding the idea:**

- Check the current project state first (files, docs, recent commits).
- Before asking detailed questions, assess scope: if the request describes
  multiple independent subsystems, flag it immediately. Don't spend questions
  refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into
  sub-projects: what are the independent pieces, how do they relate, what
  order should they be built? Then brainstorm the first sub-project through
  the normal design flow. Each sub-project gets its own spec → plan →
  implementation cycle.
- For appropriately-scoped changes, ask questions **one at a time**. Prefer
  multiple choice when possible; open-ended is fine too. Only one question
  per message — if a topic needs more exploration, break it into multiple
  questions.
- Focus on understanding: purpose, constraints, success criteria.

**Exploring approaches:**

- Propose 2–3 different approaches with trade-offs.
- Present options conversationally with your recommendation and reasoning.
- Lead with your recommended option and explain why.

**Presenting the design:**

- Once you believe you understand what you're building, present the design.
- Scale each section to its complexity: a few sentences if straightforward,
  up to 200–300 words if nuanced.
- Ask after each section whether it looks right so far.
- Cover: architecture, components, data flow, error handling, testing.
- Be ready to go back and clarify if something doesn't make sense.

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose,
  communicate through well-defined interfaces, and can be understood and
  tested independently.
- For each unit, answer: what does it do, how do you use it, and what does
  it depend on?
- Apply the deep-modules heuristic (see `systems-design` skill): the interface
  should be materially smaller than the implementation.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing
  patterns.
- Where existing code has problems that affect the work (a file that's grown
  too large, unclear boundaries, tangled responsibilities), include targeted
  improvements as part of the design — the way a good developer improves code
  they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the
  current goal.

## Domain language

If `CONTEXT.md` exists, use its domain glossary verbatim in the design. If
the design introduces a new domain term, note it — it should be added to
`CONTEXT.md` before or during implementation (see `domain-context` skill).
If a decision is hard to reverse, note it as an ADR candidate.

## After the design

**Write the spec:**

- Save the validated design to `docs/specs/YYYY-MM-DD-<topic>-spec.md`.
- Commit the design document to git.
- If `docs/specs/` doesn't exist, create it.

**Spec self-review** — look at it with fresh eyes:

1. **Placeholder scan:** any "TBD", "TODO", incomplete sections, or vague
   requirements? Fix them.
2. **Internal consistency:** do any sections contradict each other?
3. **Scope check:** is this focused enough for a single implementation plan,
   or does it need decomposition?
4. **Ambiguity check:** could any requirement be interpreted two different
   ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

**User review gate:**

After the spec review passes, ask the user to review the written spec:

> "Spec written and committed to `<path>`. Please review it and let me know
> if you want to make any changes before we start writing out the
> implementation plan."

Wait for the user's response. If they request changes, make them and re-run
the spec review. Only proceed once the user approves.

**Implementation:**

- Invoke the `writing-plans` skill to create a detailed implementation plan.
- Do NOT invoke any other skill. `writing-plans` is the next step.

## Key principles

- **One question at a time** — don't overwhelm with multiple questions.
- **Multiple choice preferred** — easier to answer than open-ended when
  possible.
- **YAGNI ruthlessly** — remove unnecessary features from all designs.
- **Explore alternatives** — always propose 2–3 approaches before settling.
- **Incremental validation** — present design, get approval before moving on.
- **Be flexible** — go back and clarify when something doesn't make sense.

## Cross-refs

- `writing-plans` skill — the next step after design approval.
- `domain-context` skill — read `CONTEXT.md` before designing; update it with
  new terms.
- `systems-design` skill — ADR vs RFC decision, deep-modules heuristic,
  interface-design checklist.
- `@architect` agent — for non-trivial or cross-cutting changes, suggest an
  architect review before implementation.
