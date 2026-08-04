# Session Bootstrap: Anti-Drift Rationalization Red-Flags

Before taking any action, check whether you are about to skip a pipeline step
or shortcut a gate. The model's first instinct under cognitive load is to
rationalize shortcuts — the table below maps common rationalizations to their
corrections.

## Red-flags table

| Rationalization | Correction |
|---|---|
| "This is just a simple question" | Questions are tasks. Identify the skill you need and load it before answering. |
| "I'll just do this one thing first" | Check BEFORE doing anything. Are you skipping brainstorming, TDD, or a pipeline gate? |
| "This is too simple to need a design" | Behavior-delta changes need brainstorming. The fast-path is ONLY for zero-behavior-delta changes (typos, docs, RCS headers, style-only, patch deps, test-only fixes). |
| "I'll just edit the source directly" | Behavior changes go through the pipeline: brainstorming → plan → @tdd. No exceptions. |
| "The tests are probably fine" | Run them. `verification-before-completion` means actually running, not assuming. |
| "I don't need to load that skill" | Load it. Skills exist because the model degrades without them. |
| "I can skip /check this time" | No. `/check` is the pre-push gate. Always run it before declaring done. |
| "This is just a refactor, no tests needed" | Refactors can break behavior. Run the suite before and after. |
| "The coverage gate can slide" | 80% line coverage on changed files. No exceptions — changed-file coverage is measured, not approximated. |

## Skill-loading discipline

Before exploring code, gathering context, or even asking clarifying questions,
check whether a relevant skill exists — and load it. The skill tells you HOW
to do the task; skipping it means you are guessing.

| Rationalization | Correction |
|---|---|
| "I need more context first" | Skill check comes BEFORE exploring or gathering context. Load the skill, then let it tell you what context to gather. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check for a relevant skill before any exploration. |
| "Let me gather information first" | Skills tell you HOW to gather information. Check first. |
| "I remember this skill — I don't need to load it" | Skills evolve. Load the current version even if you've used it before. |
| "The skill is overkill for this" | Simple things become complex. If a skill exists for this type of work, use it. |
| "This doesn't count as a task" | Every action is a task. Check for applicable skills before acting. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this — check first. |
| "I know what that means" | Knowing the concept is not the same as following the skill's workflow. Invoke it. |

## Pipeline reminder

```
brainstorming → prototype (if needed) → writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

Pre-spec work that is oversized (multiple independent subsystems, or unknowns
that cannot be expressed as sharp questions) branches to `wayfinder` before
detailed grilling — brainstorming does not decompose it here.
The sole exception is the strict greenfield bootstrap (scaffold plus one thin
vertical slice): it precedes wayfinding in the design tab (see ADR-0050).

For non-trivial or cross-cutting changes, run `@architect` after the spec and before ticketing/planning — it returns a go/no-go plus a parseable `ADR-required:` line. The ticketing skill (`/issue`) checks this line before slicing a spec into tasks.
For bugs, prepend `@debug` before `@tdd` on the fix.
