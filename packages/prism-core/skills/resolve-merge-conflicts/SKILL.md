---
name: resolve-merge-conflicts
description: Use to resolve Git conflicts by preserving intended behavior and verifying the integrated result.
---

# Resolve Merge Conflicts

Inspect repository status and understand the operation in progress. Preserve
unrelated work; do not abort another person's operation or rewrite published
history without authority. Follow project/user merge or rebase instructions.

Read both sides and relevant surrounding code. Resolve intent, not just conflict
markers. Preserve useful tests from both branches. Ask about genuinely
incompatible requirements; ordinary authorized conflict resolution needs no
additional approval ceremony.

Run relevant tests and lint on the integrated result. For behavior changes or
regressions, add failing tests and follow TDD. Inspect staged paths before content,
scan for secrets, and check for remaining conflict markers only in safe files.
Continue the authorized Git operation with configured signing. Verify HEAD and
status after ambiguous failures. Report what was resolved and what remains.
