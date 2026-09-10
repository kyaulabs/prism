---
description: Prepare or publish a release with native project tooling according to user and project instructions.
---

Release scope: $ARGUMENTS

Inspect the project's actual version sources, changelog, release workflow and
Git conventions. Determine the next version from compatibility and user intent.
Update applicable package versions and useful release notes; no universal
lockstep policy or release-branch naming requirement applies.

Run relevant tests, package/build checks and same-session review. State known
limitations and migration steps. Follow configured Git signing. Commit verified
changes normally. Push, tag, create a release PR or publish only within existing
user/project authorization; do not repeat permission already given.

Use native Git, package managers, GitHub CLI and project workflows. Inspect
ambiguous command outcomes before retrying publication. Never print registry
credentials or upload private files. Report the actual release artifacts and
URLs; preparing a release is not the same as publishing one.
