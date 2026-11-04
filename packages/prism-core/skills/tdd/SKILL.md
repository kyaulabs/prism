---
name: tdd
description: Use for development. Mandatory Red-Green-Refactor, one observable behavior at a time. Test public interfaces and mock only necessary system boundaries.
derived-from: obra/superpowers (MIT, © Jesse Vincent); glebis/claude-skills (MIT, © Gleb)
---

# Test-Driven Development

TDD is mandatory for development. Implement one observable behavior per cycle.
Only Core's expressly requested isolated disposable prototype exception may use
recorded experiment evidence; production promotion requires normal TDD.

## Prepare

Read relevant code/tests; follow project/module conventions. Without a module,
use native tests—never require adapters. Clarify behavioral decisions, not
discoverable facts. Define acceptance criteria and the highest practical public
test seam; reproduce bugs first. Prefer real lightweight collaborators; mock
system boundaries only when necessary.

## Red → Green → Refactor

1. **Red:** Write/run one test; show its expected behavioral failure, not
   setup/syntax errors.
2. **Green:** Implement the minimum; run/report focused and relevant existing
   tests.
3. **Refactor:** Simplify code/tests while green; rerun affected tests after
   meaningful changes. Avoid speculative abstractions.

Repeat based on the previous slice. Never batch tests before implementation,
weaken correct tests, or manufacture Red for prose edits. For behavior-preserving
refactors, run characterization tests before/after; add missing coverage first.

## Test Quality

Test public behavior, not internals/source wording. Use independent expectations,
clear arrange/act/assert, and diagnostic failures. Never mock internal collaborators
for convenience; mock only necessary system boundaries (services, time, filesystem,
processes). When removing features, test retained callers/boundaries; remove
obsolete policy tests and dead code.

## Finish

Run relevant tests, lint, and module/project coverage checks; broaden for
cross-cutting changes. Use native commands/test-server tooling, not mandatory
launchers/global gates. Clean only owned processes/temp files; report unavailable
checks.

Follow Core for evidence, review timing and authorized Git operations.
Never claim unrun commands; coverage metrics cannot replace meaningful tests.
