---
description: Prepare an authorized project release without granting registry publication authority.
argument-hint: "[version or scope]"
---

Release scope: $ARGUMENTS.

Inspect actual version sources, changelog, package/peer coordination and native
release conventions. Determine compatibility impact separately from the Pi host
version. Prepare only authorized version changes, migration notes and artifacts;
follow project signing and delivery roles. Reuse current verification and review
under Core, adding relevant package/build checks.

A release PR follows `/pr`: supplied template, post-creation current-head Test Plan,
recorded results and required CI/review before approval or merge. Inspect ambiguous
Git/release outcomes before retrying.

Distinguish local preparation, tags/GitHub release and registry publication. Existing
release authority is not a new grant to publish packages; preserve explicit manual
publication boundaries. Never expose credentials or change signing configuration.
Report only artifacts and URLs actually created, with skipped checks and blockers.
