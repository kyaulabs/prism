# Refactoring checks

Refactor after Green, using passing behavior tests as the safety net. Do not
change behavior and structure in the same unverified step.

## Evidence-based triggers

Refactor when the current slice reveals a concrete cost:

- duplicated policy or transformations;
- a long function with several reasons to change;
- a shallow module that exposes more complexity than it hides;
- logic located away from the data or invariant it governs;
- repeated primitive values that need validation or identity;
- names that no longer describe responsibility;
- branching or nesting that makes the next behavior hard to add;
- dead paths, unused abstractions, or compatibility code with no caller.

Do not refactor for novelty, pattern compliance, or speculative reuse.

## Deletion first

Before extracting a new abstraction, ask what can be deleted. Remove dead code,
unused parameters, duplicate wrappers, obsolete branches, and comments that
repeat the implementation. A smaller system often needs less design than a new
layer would introduce.

## Duplication and depth

Extract shared code only when the duplicated behavior has the same meaning and
change pressure. Similar syntax with different policy should remain separate.
Use `finding-duplicate-functions` when semantic duplication is unclear.

Prefer deep modules: a small interface that hides validation, state, or
integration complexity. Avoid pass-through wrappers and classes whose public
surface merely repeats their dependencies.

## Complexity and naming

Split a long function around responsibilities or invariants, not arbitrary line
counts. Keep tests on the public interface; do not create private-method tests.
Move behavior toward the data it protects, and introduce a value object only
when it owns validation, comparison, formatting, or identity.

Rename after responsibility is clear. Names should describe domain purpose,
not the implementation technique used today.

## Verification

For each refactor step:

1. start from a green focused test;
2. make one structural change;
3. rerun the focused test;
4. run the full applicable suite;
5. run the adapter quality gate and changed-file coverage;
6. confirm no debug calls, dead compatibility paths, or generated-asset edits
   remain.

If the test must change despite unchanged behavior, inspect it for
implementation coupling before proceeding.
