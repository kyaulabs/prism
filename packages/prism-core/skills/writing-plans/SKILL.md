---
name: writing-plans
description: Use to break a multi-step change into coherent, testable implementation slices. Produce a short executable checklist rather than a second specification.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Writing Plans

Make the next steps clear enough to execute without prescribing every line of code.

1. Read the requested outcome and relevant implementation. Reuse settled decisions;
   ask only about missing requirements that materially affect the approach.
2. List coherent vertical slices in dependency order. For each, identify behavior,
   likely files/interfaces, a failing-test seam, and verification commands found
   in the project or applicable module.
3. Include integration, migration and deletion work where required. State risks
   and unresolved assumptions plainly. Do not create speculative abstractions.
4. Use a conversation checklist for ordinary tasks or one durable plan for work
   that benefits from resumption. Link an existing spec rather than duplicating it.
5. If implementation is authorized, continue with `executing-plans`. A request
   for a plan alone stops at the plan. No extra approval just to move between skills.

## Rules

Use TDD for development. Do not prewrite complete production code in the plan,
require exact future test names, or bind execution to receipts and commit hashes.
Keep useful plans after completion. Track an originating issue when there is one;
close it only when its requested outcome is actually delivered.

## Gotchas

- A plan is a working guide, not a frozen program. Adjust implementation details
  as evidence improves; discuss changes to the user's goal or material trade-offs.
- Oversized work needs smaller slices, not necessarily more documents or tickets.
