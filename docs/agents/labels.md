# Issue Label Vocabulary

The single source of truth for issue labels and fields across KYAULabs
repositories. The vocabulary uses GitHub's native **issue-type** and
**Progress** fields as the primary axes, supplemented by **wayfinder** and
**meta** labels.

## Axes

Every issue carries **exactly one** issue type and **exactly one** Progress
value. Optional wayfinder and meta labels may be added at your discretion.

### Type — What the issue is

Tracked via GitHub's native **issue-type** field (not labels).

| Type | Color | Description |
| :--- | :---: | --- |
| `Bug` | red | An unexpected problem or unintended behavior (conventional: `fix`) |
| `Feature` | blue | A new feature, capability, or enhancement (conventional: `feat`) |
| `Patch` | blue | A small, incremental fix or update (conventional: `patch`) |
| `Documentation` | green | Additions or changes to documentation (conventional: `docs`) |
| `Performance` | blue | A change that improves speed or efficiency (conventional: `perf`) |
| `Refactor` | yellow | Code restructuring with no change in behavior (conventional: `refactor`) |
| `Style` | yellow | Formatting or styling changes with no logic impact (conventional: `style`) |
| `Test` | pink | Adding or updating tests (conventional: `test`) |
| `CI/CD` | pink | Changes to build, CI, or deployment pipelines (conventional: `ci`) |
| `Chore` | gray | Miscellaneous maintenance and upkeep (conventional: `chore`) |
| `Security` | red | A security vulnerability or related fix |

> Type values mirror [Conventional Commits](https://www.conventionalcommits.org/)
> types. `Security` is a project-specific addition.

### Progress — Where the issue is in its lifecycle

Tracked via GitHub's native **Progress** issue field (not labels).

| Value | Color | Description |
| :--- | :---: | --- |
| `Under Construction` | orange | Beginning stages |
| `In Progress` | yellow | Actively being worked on |
| `Testing` | yellow | Testing ideas or methods |
| `Complete` | green | Complete |

### Wayfinder — Optional navigation labels

Flat labels with no prefix. Used for epic/task relationship tracking.

| Label | Color | Description |
| :--- | :---: | --- |
| `epic` | `#5319e7` | Parent epic tracking multiple sub-issues |
| `task` | `#5319e7` | Sub-issue linked to an epic |

### Meta — Optional context labels

Flat labels with no prefix. Provide context, workflow signals, and issue
lifecycle flags.

| Label | Color | Description |
| :--- | :---: | --- |
| `brainstorming` | `#db2780` | Coming up with a new approach |
| `research` | `#db2780` | Needs investigation before implementation |
| `request for comments` | `#db2780` | External opinions requested |
| `help wanted` | `#db2780` | Assistance requested from contributors |
| `good first issue` | `#4e3cb2` | Suitable for new contributors |
| `plan` | `#0ea5e9` | Work from a `docs/plans/` implementation plan |
| `needs-info` | `#fbca04` | Triage: issue lacks detail to proceed (awaiting reporter) |
| `ready-for-agent` | `#0e8a16` | Triage: classified and routed, ready for an agent to pick up |
| `duplicate` | `#cfd3d7` | Duplicate of another issue |
| `invalid` | `#cfd3d7` | Not a valid issue |
| `on hold` | `#cfd3d7` | Temporarily paused |
| `won't fix` | `#cfd3d7` | Will not be addressed |

### Additional Fields

These issue fields are tracked natively by GitHub but are supplementary to the
type/progress axes.

| Field | Type | Description |
| :--- | :---: | --- |
| `Priority` | single_select | Critical, High, Medium, Low |
| `Effort` | single_select | Small, Medium, Large, Extra Large |
| `Start date` | date | Planned or actual start date |
| `Target date` | date | Planned or actual target date |

## Invariants

1. **Exactly one issue type** — every issue has exactly one type (enforced by
   GitHub).
2. **Exactly one Progress value** — every issue has exactly one progress value
   (enforced by GitHub).
3. **Zero or more wayfinder labels** — optional, for epic/task tracking.
4. **Zero or more meta labels** — optional, for context and workflow signals.

## Relationship to Conventional Commits

Issue type values correspond directly to Conventional Commit types. When an
issue is resolved by a commit, the commit type should match the issue's type:

| Issue type | Commit type |
| :--- | :--- |
| Bug | `fix` |
| Feature | `feat` |
| Patch | `patch` / `fix` |
| Documentation | `docs` |
| Performance | `perf` |
| Refactor | `refactor` |
| Style | `style` |
| Test | `test` |
| CI/CD | `ci` |
| Chore | `chore` |
| Security | `fix` |

## History

This vocabulary succeeds the earlier TPS (Type, Priority, Status) label-based
system documented in `README.md`. The type and progress axes are now tracked
via GitHub's native issue-type and Progress fields, replacing the old flat
label groups. Priority and Effort remain as native single-select fields. The
former optional labels are retained as meta labels.
