---
description: Investigate an existing issue, or implement it when authorized.
argument-hint: "<issue identifier> [instructions]"
---

Load `tracker-operator` for $ARGUMENTS. Read the issue and relevant discussion,
then verify its claims against current code and tests. Distinguish investigation
from implementation scope. If implementation is authorized, resolve consequential
ambiguity and proceed through `tdd`; otherwise report findings and a useful next
step without source or tracker mutations.
