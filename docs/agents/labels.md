# Issue labels and fields

Prism uses two required GitHub issue axes: native issue **Type** and native
**Progress**. Optional Wayfinder and meta labels add navigation or context but
do not replace either axis.

## Type

Every issue has exactly one native issue type.

| Type | Color | Meaning | Commit type |
| --- | :---: | --- | --- |
| `Bug` | red | Unexpected or unintended behavior | `fix` |
| `Feature` | blue | New capability or enhancement | `feat` |
| `Patch` | blue | Small incremental correction | `patch` |
| `Documentation` | green | Documentation addition or change | `docs` |
| `Performance` | blue | Speed or efficiency improvement | `perf` |
| `Refactor` | yellow | Structural change without behavior change | `refactor` |
| `Style` | yellow | Formatting or presentation without logic change | `style` |
| `Test` | pink | Test addition or correction | `test` |
| `CI/CD` | pink | Build, CI, or deployment pipeline change | `ci` |
| `Chore` | gray | Maintenance that fits no narrower type | `chore` |
| `Security` | red | Vulnerability or security correction | `fix` |

The values follow Conventional Commit vocabulary except for the
project-specific `Security` type.

## Progress

Every issue has exactly one native Progress value.

| Value | Color | Meaning |
| --- | :---: | --- |
| `Under Construction` | orange | Early definition or preparation |
| `In Progress` | yellow | Active implementation or investigation |
| `Testing` | yellow | Validation, review, or trial work |
| `Complete` | green | Required work is complete |

Progress describes lifecycle state, not issue type or priority.

## Wayfinder labels

Use these labels only for decomposition and decision-map navigation.

| Label | Color | Meaning |
| --- | :---: | --- |
| `epic` | `#5319e7` | Parent issue for several implementation tasks |
| `task` | `#5319e7` | Task linked beneath an epic |
| `wayfinder:map` | `#5319e7` | Canonical Wayfinder decision map |
| `wayfinder:research` | `#5319e7` | Research needed to clear a decision |
| `wayfinder:prototype` | `#5319e7` | Human-in-the-loop prototype ticket |
| `wayfinder:grilling` | `#5319e7` | One-question-at-a-time decision ticket |
| `wayfinder:task` | `#5319e7` | Manual task that unblocks the map |

`epic` and `task` are general decomposition labels. The `wayfinder:*` labels
belong to the Wayfinder workflow.

## Meta labels

Meta labels provide optional context and workflow signals.

| Label | Color | Meaning |
| --- | :---: | --- |
| `brainstorming` | `#db2780` | Needs design exploration |
| `research` | `#db2780` | Needs investigation before implementation |
| `request for comments` | `#db2780` | Requests external review or opinions |
| `help wanted` | `#db2780` | Invites contributor assistance |
| `good first issue` | `#4e3cb2` | Suitable for a new contributor |
| `plan` | `#0ea5e9` | Work follows a `docs/plans/` implementation plan |
| `needs-info` | `#fbca04` | Reporter information is missing |
| `ready-for-agent` | `#0e8a16` | Classified, routed, and ready for work |
| `duplicate` | `#cfd3d7` | Duplicates another issue |
| `invalid` | `#cfd3d7` | Does not describe valid project work |
| `on hold` | `#cfd3d7` | Temporarily paused |
| `won't fix` | `#cfd3d7` | Will not be addressed |

## Additional fields

| Field | Kind | Values or meaning |
| --- | --- | --- |
| `Priority` | Single select | Critical, High, Medium, Low |
| `Effort` | Single select | Small, Medium, Large, Extra Large |
| `Start date` | Date | Planned or actual start |
| `Target date` | Date | Planned or actual target |

Priority and Effort are planning data. They do not change the required Type or
Progress values.

## Invariants

1. Every issue has exactly one Type.
2. Every issue has exactly one Progress value.
3. An issue may have zero or more Wayfinder labels.
4. An issue may have zero or more meta labels.
5. Priority, Effort, and dates remain supplementary fields.
6. Label color and spelling are canonical; workflows must not create synonyms.

## Conventional Commit mapping

The implementation commit should use the commit type in the Type table. A
`Patch` normally uses `patch`; use `fix` only when the repository's commit
contract or release policy requires it. `Security` uses `fix` because
Conventional Commits has no security type.

Issue references and closing behavior are separate from type selection. Follow
the `conventional-commits` skill and the approved plan when choosing `Refs:` or
`Fixes:`.

## History

This vocabulary replaced the former label-only Type, Priority, and Status
scheme. Type and Progress now use native GitHub fields. Priority and Effort
remain supplementary fields, while useful workflow labels remain in the meta
set.
