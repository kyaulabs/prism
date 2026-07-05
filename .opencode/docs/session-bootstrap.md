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

## Pipeline reminder

```
brainstorming → prototype (if needed) → writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

For non-trivial or cross-cutting changes, insert `@architect` before `writing-plans`.
For bugs, prepend `@debug` before `@tdd` on the fix.
