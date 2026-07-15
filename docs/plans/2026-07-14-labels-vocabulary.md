# Issue Label Vocabulary Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor — adapted for documentation and operational work
> (verification checkpoints replace Pest tests).

**Goal:** Establish a standardized issue-label vocabulary that uses GitHub's
native issue-type and Progress fields as the primary axes, supplemented by
wayfinder (`epic`, `task`) and meta labels.

**Architecture:** One new markdown doc (`docs/agents/labels.md`) documents the
full vocabulary; AGENTS.md gains a pointer section; two new flat labels are
created on GitHub via `gh label create`. No `type:` or `status:` labels are
created — those axes are tracked by GitHub's native issue-type field (11
values) and Progress field (4 values).

**Tech Stack:** Markdown, GitHub issue fields, `gh` CLI.

## Global constraints

- Markdown files are exempt from RCS headers and vim modelines (per rcs-header
  skill).
- No Pest tests apply — verification is content review + validate-harness.sh
  regression check.
- Commit messages use Conventional Commits format with Plan-by / Acked-by /
  Signed-off-by footers (see conventional-commits skill).
- `validate-harness.sh` cross-checks command/skill/agent index tables — adding
  a `## Labels` section to AGENTS.md does not touch those tables, so no
  validator update is needed.

---

### Task 1: Create `docs/agents/labels.md`

**Files:**
- Create: `docs/agents/labels.md` (directory `docs/agents/` must be created)

**Interfaces:**
- Produces: the canonical label vocabulary referenced by AGENTS.md

- [ ] **Step 1: Verify the file does not exist (Red)**

Run: `ls docs/agents/labels.md 2>&1`
Expected: "No such file or directory"

- [ ] **Step 2: Create the file (Green)**

Create `docs/agents/labels.md` with this exact content:

```markdown
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
```

- [ ] **Step 3: Verify (Refactor)**

Run: `ls docs/agents/labels.md`
Expected: file exists. Review tables are present.

- [ ] **Step 4: Commit**

```bash
git add docs/agents/labels.md
git commit -S -m $'docs(labels): add issue-label vocabulary doc\n\nCreate docs/agents/labels.md as the single source of truth. Documents\nGitHub native issue-type field (11 values) and Progress field (4 values)\nas the primary axes, plus wayfinder (epic, task) and meta labels.\nEstablishes exactly-one-type + exactly-one-progress invariant.\n\nRefs: #128\nPlan-by: glm-5.2\nAcked-by: glm-5.2\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` — insert new `## Labels` section after `## Project
  Context` (line 33), before `## Directory Structure` (line 34)

**Interfaces:**
- Consumes: `docs/agents/labels.md` from Task 1
- Produces: AGENTS.md pointer to the label vocabulary

- [ ] **Step 1: Verify no `## Labels` section exists (Red)**

Run: `grep -c "^## Labels" AGENTS.md`
Expected: `0`

- [ ] **Step 2: Insert the section (Green)**

In `AGENTS.md`, after the `## Project Context` section, insert before
`## Directory Structure`:

```markdown
## Labels

Issue labels use a two-axis vocabulary — **type** (GitHub issue-type field)
and **progress** (GitHub Progress field) — with optional **wayfinder** and
**meta** labels. The full vocabulary is documented in
`docs/agents/labels.md`.
```

- [ ] **Step 3: Verify (Refactor)**

Run:
```bash
grep -n "^## Labels" AGENTS.md
grep -n "^## Project Context" AGENTS.md
grep -n "^## Directory Structure" AGENTS.md
```
Expected: `## Labels` appears between `## Project Context` and
`## Directory Structure`.

- [ ] **Step 4: Regression check**

Run: `bash .github/scripts/validate-harness.sh`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -S -m $'docs(labels): add Labels section to AGENTS.md\n\nPoint AGENTS.md to docs/agents/labels.md as the single source of\ntruth for the issue-label vocabulary.\n\nRefs: #128\nPlan-by: glm-5.2\nAcked-by: glm-5.2\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Create wayfinder labels (operational)

**Files:**
- No repository files modified — creates GitHub labels via `gh` CLI

**Interfaces:**
- Consumes: the full vocabulary from Task 1
- Produces: 2 new labels on GitHub (`epic`, `task`)

> This is an operational task. It does not produce a commit.

- [ ] **Step 1: Create `epic` label**

```bash
gh label create "epic" --color 5319e7 --description "Parent epic tracking multiple sub-issues" || true
```

- [ ] **Step 2: Create `task` label**

```bash
gh label create "task" --color 5319e7 --description "Sub-issue linked to an epic" || true
```

- [ ] **Step 3: Verify both labels exist**

```bash
gh label list --limit 50 | grep -cE "^(epic|task)"
```
Expected: `2`

> The `|| true` prevents failure if a label already exists (idempotent).
> The 10 existing meta labels need no changes.

---

### Task 4: Manual verification (user-performed)

This task is **not** executed by @tdd — it's a smoke test performed by the
user.

- [ ] **Step 1: Create a test issue**

On GitHub, create a new issue. Verify the issue-type field and Progress field
are available as native fields (not labels).

- [ ] **Step 2: Apply wayfinder labels**

Apply the `epic` and `task` labels. Verify they appear alongside the existing
meta labels.

- [ ] **Step 3: Cross-reference check**

Confirm `AGENTS.md ## Labels` → `docs/agents/labels.md` → actual GitHub labels
and fields are all consistent.

---

### Follow-up recommendation (out of scope for #128)

`README.md` lines 387–439 still document the old TPS label-based vocabulary.
Now that `docs/agents/labels.md` is the single source of truth, README's
`## Issue Labels` section should be replaced with a brief pointer. File as a
separate issue to respect #128's stated scope.
