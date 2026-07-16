---
description: Decompose a plan or spec into a GitHub epic with vertical-slice task issues and native blocking edges. Alias of /tickets. For single-issue creation, use /issue or /ticket.
---

Load the `ticketing` skill and execute its **From-spec decomposition
workflow**: create an epic with vertical-slice task issues, set issue
types and custom fields, apply labels, and wire native blocking edges via
`gh issue edit --add-blocked-by`.

If `$ARGUMENTS` specifies a `docs/plans/` or `docs/specs/` file path, use
it. If empty, prompt for a plan/spec file or auto-pick the most recent in
`docs/plans/`.

Arguments: $ARGUMENTS
