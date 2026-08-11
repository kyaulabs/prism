---
description: Alias of /issue — create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument.
agent: tracker-operator
---

Load the `ticketing` skill and execute its unified ticketing workflow.

**Mode auto-detection:** If `$ARGUMENTS` is empty or free text, run the
**Single-issue workflow**. If `$ARGUMENTS` is a `docs/plans/` or
`docs/specs/` file path, auto-detect and run the **From-spec decomposition
workflow**.

Arguments: $ARGUMENTS
