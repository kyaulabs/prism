---
name: brainstorming
description: "Use before any creative work — creating features, building components, adding functionality, or modifying behavior. Refines rough ideas into a validated design through one-question-at-a-time grilling, then writes a spec. Hard-gate: no implementation until the design is approved and a spec is written (fast-path for zero-behavior-delta changes)."
derived-from: mattpocock/skills (MIT, © Matt Pocock)
---

# Brainstorming Ideas Into Designs

Turn ideas into fully formed designs through natural collaborative dialogue.
Start by understanding the current project context, then ask questions one at a
time to refine the idea. Once you understand what you're building, present the
design and get user approval before any implementation.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project,
or take any implementation action until you have presented a design and the
user has approved it. This applies to every change that has a behavior delta
or introduces new functionality.

**Fast-path exception — skip brainstorming for changes with zero behavior delta:**
- Typo fixes (comments, strings, docs, log messages)
- Documentation-only changes (README, comments, PHPDoc blocks)
- RCS header / vim modeline additions or corrections
- Style/formatting-only changes with no logic impact (php-cs-fixer, lint fixes)
- Patch-level dependency bumps (no API breakage, no new features pulled in)
- Test-only changes (fixing flaky assertions, adding tests for existing
  behavior — no production code touched)

The fast-path skip means: classify the change (e.g. "typo fix → fast-path"),
announce it, implement directly, then run verification-before-completion and
/check. If any doubt about triviality, default to the full brainstorming flow.
</HARD-GATE>

## Anti-pattern: "This is too simple to need a design"

Behavior-changing work goes through this process, even when it seems simple.
"Simple" changes are where unexamined assumptions cause the most wasted work.
The design can be short (a few sentences for truly simple changes), but you
MUST present it and get approval. For zero-behavior-delta changes (typos,
docs, RCS headers, style-only, patch deps, test-only fixes), use the fast-path
exception defined in the HARD-GATE above.

## Checklist

Complete these in order:

1. **Explore project context** — check files, docs, recent commits, `CONTEXT.md`.
2. **Gather requirements via grilling** — load the `grilling` skill and
   interview the user one question at a time. Focus on purpose, constraints,
   and success criteria. Grilling governs *how* to ask (one-at-a-time,
   facts-vs-decisions, reassess, recommend, confirm); this skill governs
   *what* to ask about.
3. **Propose 2–3 approaches** — with trade-offs and your recommendation.
   Present these following grilling's Recommended answer behavior (lead with
   your recommendation, explain the trade-off you're making and what
   alternative you're rejecting).
4. **Present design** — in sections scaled to their complexity. Use grilling's
   Confirmation gate: present each section, ask "Does this look right so far?",
   and wait for explicit approval before moving to the next section.
5. **Write spec** — save to `docs/specs/YYYY-MM-DD-<topic>-spec.md` and commit.
6. **Spec self-review** — quick inline check for placeholders, contradictions,
   ambiguity, scope.
7. **User reviews written spec** — ask the user to review before proceeding.
8. **Create feature branch** — `bash .github/scripts/new-branch.sh <type> <desc>`
   off `develop` (or `main` for hotfixes). See ADR-0028.
9. **Transition** — direct the user to the `plan` tab for implementation
   planning. Do NOT invoke `writing-plans` or dispatch `@tdd` from the design
   tab (per ADR-0030).

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
- For appropriately-scoped changes, load the `grilling` skill for the
  interview. Grilling handles the mechanics — one question at a time,
  facts-vs-decisions checking, reassessment after each answer, recommendations
  when presenting options, and confirmation gating. This skill defines the
  domain: focus questions on purpose, constraints, and success criteria.

**Exploring approaches:**

- Propose 2–3 different approaches with trade-offs.
- Present them following grilling's Recommended answer behavior: lead with
  your recommended option, explain the trade-off you're making, and what
  alternative you're rejecting.

**Presenting the design:**

- Once you believe you understand what you're building, present the design.
- Scale each section to its complexity: a few sentences if straightforward,
  up to 200–300 words if nuanced.
- Use grilling's Confirmation gate after each section: "Does this look right
  so far?" Wait for explicit approval before moving to the next.
- Cover: architecture, components, data flow, error handling, testing.
- Be ready to go back and clarify if something doesn't make sense (grilling's
  reassess loop handles this).

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
> if you want to make any changes before we create the feature branch."

Wait for the user's response. If they request changes, make them and re-run
the spec review. Only proceed once the user approves.

**Create feature branch:**

After the user approves the spec, create the feature branch off `develop`
(or `main` for hotfixes):

```bash
bash .github/scripts/new-branch.sh <type> <description>
```

Where `<type>` reflects the work type (`feat` for new features, `fix` for
bugs, `docs` for documentation, etc. — full vocabulary per ADR-0028) and
`<description>` is a short kebab-case summary. The helper script handles base
branch selection, identity resolution, hash generation, and the checkout.
See ADR-0028.

**Transition:**

The design cycle is complete. Direct the user to the `plan` tab for
implementation planning. Do NOT invoke the `writing-plans` skill or dispatch
`@tdd` from the design tab — those belong to the plan agent and the
execution phase respectively.

## Key principles

- **Interview via grilling** — load the `grilling` skill for all user
  interviews. Grilling provides the mechanics (one-at-a-time, facts-vs-decisions,
  reassess, recommend, confirm); this skill provides the domain.
- **YAGNI ruthlessly** — remove unnecessary features from all designs.
- **Explore alternatives** — always propose 2–3 approaches before settling.
- **Incremental validation** — present design, gate on confirmation before
  moving on.
- **Be flexible** — go back and clarify when something doesn't make sense.

## Cross-refs

- `grilling` skill — the interview primitive consumed during requirements
  gathering. Governs *how* to ask; brainstorming governs *what* to ask about.
- `writing-plans` skill — the implementation-planning phase that follows
  design; loaded by the `plan` agent. The `design` tab directs the user to
  the plan tab rather than invoking `writing-plans` directly (per ADR-0030).
- `domain-context` skill — read `CONTEXT.md` before designing; update it with
  new terms.
- `systems-design` skill — ADR vs RFC decision, deep-modules heuristic,
  interface-design checklist.
- `@architect` agent — for non-trivial or cross-cutting changes, suggest an
  architect review after the spec is written and before the plan tab loads
  `writing-plans` (per AGENTS.md).

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Skipping brainstorming for behavior-delta changes* — simple-looking behavior
  changes are where unexamined assumptions cause the most wasted work. The
  design can be short, but it must be presented and approved. Trivial
  zero-behavior-delta work (typos, docs, headers, style, patch deps, test-only
  fixes) follows the fast-path — that's the explicit exception, not a loophole.
- *Conducting interviews without loading grilling* — brainstorming delegates
  interview mechanics to the `grilling` skill. Load it before asking questions,
  or the one-at-a-time, facts-vs-decisions, and confirmation-gate behaviors
  will be missing. Grilling is the authoritative source for interview protocol.
- *Jumping to implementation before spec is written* — the hard-gate exists
  for a reason. No code until the design is approved and the spec is saved.
