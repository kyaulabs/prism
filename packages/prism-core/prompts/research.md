---
description: Research with citations, or prepare a manual brief for a human-started second session.
argument-hint: "[--background] <question>"
---

Load `research` for $ARGUMENTS; let that skill resolve bundled source/citation
references. Research is synchronous and read-only by default.

With `--background`, prepare a concise brief containing the exact question,
relevant local paths, constraints, desired output and source-trust/citation rules.
Present it for the user to paste into a separate human-started Pi session in the
trusted project. Do not launch another agent process or claim work was dispatched.
If the user chooses this session instead, research synchronously.
