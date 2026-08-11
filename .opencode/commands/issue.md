---
description: "Create a single issue, or decompose a plan/spec into an epic with vertical-slice tasks. Auto-detects mode from the argument. Aliases: /ticket (singular), /issues, /tickets (plural = from-spec only)."
agent: tracker-operator
---

Load the `ticketing` skill and execute its unified ticketing workflow.

**Mode auto-detection:** If `$ARGUMENTS` is empty or free text, run the
**Single-issue workflow** (describe, generate title/body, set
type/fields/labels, create). If `$ARGUMENTS` is a `docs/plans/` or
`docs/specs/` file path, auto-detect and run the **From-spec decomposition
workflow** (parse, epic + vertical-slice tasks + blocking edges, create).

Arguments: $ARGUMENTS
