# Automatic Plan Finalization Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make implementation-plan approval authorize uninterrupted execution through automatic `/pr` preparation, with unlimited `/check` runs and one initially authorized four-axis review.

**Architecture:** `executing-plans` owns the transition from the final completed task into `finishing-a-development-branch`. The finishing skill consumes plan approval as initial finalization authorization, distinguishes unlimited local check execution from single-use review authorization, and invokes `/pr` after successful review-chain and SHA revalidation.

**Tech Stack:** Markdown-based Pi skills and global harness instructions; repository text and harness validators.

## Global constraints

- Preserve TDD, internal per-task review, verification, and atomic commits.
- Preserve standing OCR consent as the sole authority for reviewed-code egress.
- Preserve bounded diff-causal review chains and fail-closed incomplete axes.
- Never push, create a pull request, merge a protected branch, mutate GitHub, or open a browser.
- Keep Prism core language-agnostic.

---

### Task 1: Connect completed plan execution to finalization

**Files:**
- Modify: `packages/prism-core/skills/executing-plans/SKILL.md`
- Test: repository text validation for terminal transition semantics

**Interfaces:**
- Consumes: final checked task and successful per-task verification
- Produces: automatic invocation of `finishing-a-development-branch` under the approved plan's authorization

- [x] **Step 1: Run the failing transition check**

```bash
rg -n "automatically load.*finishing-a-development-branch|plan approval.*finalization" packages/prism-core/skills/executing-plans/SKILL.md
```

Expected: no matches, proving the successful terminal transition is absent.

- [x] **Step 2: Add the automatic terminal transition**

Update the execution summary, post-task behavior, rules, cross-references, and gotchas to establish:

```text
When no unchecked tasks remain, automatically load finishing-a-development-branch. Plan approval remains active for the initial finalization path; do not ask another routine question before entering it.
```

- [x] **Step 3: Verify the transition contract**

Run:

```bash
rg -n "finishing-a-development-branch|plan approval.*finalization|no unchecked tasks" packages/prism-core/skills/executing-plans/SKILL.md
git diff --check
```

Expected: transition semantics are present and the diff is clean.

- [x] **Step 4: Create the commit**

```bash
git add packages/prism-core/skills/executing-plans/SKILL.md docs/plans/2026-08-23-automatic-plan-finalization.md
prism-tool commit create --type fix --scope execution --subject "continue completed plans into finalization"
```

> Run staging and commit creation as separate tool calls. The commit command must be the only tool call in its assistant batch.

---

### Task 2: Implement plan-approved finalization authorization

**Files:**
- Modify: `packages/prism-core/skills/finishing-a-development-branch/SKILL.md`
- Test: repository text validation for check and review authorization semantics

**Interfaces:**
- Consumes: approved-plan authorization from `executing-plans`, matching completed artifacts, work-branch state, and standing OCR consent
- Produces: automatic cleanup, synchronization, attestation, unlimited `/check`, one four-axis review, revalidation, and `/pr`; fresh approval before every additional review attempt

- [x] **Step 1: Run the failing authorization check**

```bash
rg -n "Pause once for finalization acceptance|one acceptance authorizes one attempt|A `/check` failure.*fresh finalization acceptance" packages/prism-core/skills/finishing-a-development-branch/SKILL.md
```

Expected: matches proving the obsolete separate acceptance and single-use check model remain.

- [x] **Step 2: Replace the acceptance model**

Update the skill description, introduction, authorization section, `/check` section, review section, stop conditions, rules, and gotchas so that:

```text
- approved-plan entry needs no separate initial finalization prompt;
- cleanup, cleanup commit, fetch/merge synchronization, attestation, unlimited /check, one review, revalidation, and /pr are authorized;
- plan-scoped /check failures may be repaired and rerun automatically;
- hard halt conditions still stop execution;
- the initial four-axis review consumes the plan's one review authorization;
- every additional chain-selected review requires one fresh explicit approval;
- successful revalidation invokes /pr automatically.
```

- [x] **Step 3: Verify authorization boundaries**

Run:

```bash
if rg -n "Pause once for finalization acceptance|one acceptance authorizes one attempt|A `/check` failure.*fresh finalization acceptance" packages/prism-core/skills/finishing-a-development-branch/SKILL.md; then exit 1; fi
rg -n "unlimited|additional four-axis review|plan approval|automatically.*`/pr`|Standing OCR consent" packages/prism-core/skills/finishing-a-development-branch/SKILL.md
git diff --check
```

Expected: obsolete wording is absent; new authorization boundaries are explicit; diff check passes.

- [x] **Step 4: Create the commit**

```bash
git add packages/prism-core/skills/finishing-a-development-branch/SKILL.md docs/plans/2026-08-23-automatic-plan-finalization.md
prism-tool commit create --type fix --scope finalization --subject "derive initial finalization from plan approval"
```

> Run staging and commit creation as separate tool calls. The commit command must be the only tool call in its assistant batch.

---

### Task 3: Align global pipeline instructions

**Files:**
- Modify: `packages/prism-core/AGENTS.md`
- Test: repository text validation and full harness validation

**Interfaces:**
- Consumes: `executing-plans` and `finishing-a-development-branch` authorization contracts
- Produces: always-loaded global pipeline instructions consistent with ADR-0081

- [x] **Step 1: Run the failing global-contract check**

```bash
rg -n "plan approval.*unlimited.*`/check`|additional.*review.*approval|automatic.*`/pr`" packages/prism-core/AGENTS.md
```

Expected: no matches proving the global instructions do not yet describe ADR-0081.

- [x] **Step 2: Update global instructions**

Update the engineering pipeline, finalization summary, skill descriptions, and any stale acceptance wording to state:

```text
Approved plans continue through cleanup, synchronization, unlimited local /check runs, one four-axis review, revalidation, and preparation-only /pr. Additional review attempts require fresh approval. Publication remains human-owned.
```

- [x] **Step 3: Run full verification**

Run:

```bash
rg -n "unlimited.*`/check`|additional.*review.*approval|preparation-only.*`/pr`" packages/prism-core/AGENTS.md packages/prism-core/skills/executing-plans/SKILL.md packages/prism-core/skills/finishing-a-development-branch/SKILL.md
bash packages/prism-core/scripts/validate-harness.sh
git diff --check
```

Expected: all authorization semantics are present; harness validation and diff check pass.

- [x] **Step 4: Create the commit**

```bash
git add packages/prism-core/AGENTS.md docs/plans/2026-08-23-automatic-plan-finalization.md
prism-tool commit create --type fix --scope pipeline --subject "document plan-approved automatic finalization"
```

> Run staging and commit creation as separate tool calls. The commit command must be the only tool call in its assistant batch.

---

### Task 4: Finalize automatically under ADR-0081

**Files:**
- Delete: matching completed files under `docs/plans/` and `docs/specs/` as selected by `finishing-a-development-branch`
- Test: `/check`, four-axis review, review-chain verification, and `/pr` preparation

**Interfaces:**
- Consumes: completed tasks, clean committed work branch, plan-approved finalization authorization
- Produces: cleanup commit, synchronized and attested branch, green checks, one complete review, and prepared pull-request artifacts

- [ ] **Step 1: Enter automatic finalization**

Load `finishing-a-development-branch` without asking another acceptance question.

- [ ] **Step 2: Clean completed development artifacts**

Delete and atomically commit only the matching completed plan/spec files according to ADR-0027 and the finishing skill.

- [ ] **Step 3: Synchronize and attest**

Fetch `origin`, merge the validated target when required, and retain exact branch/HEAD/base identities.

- [ ] **Step 4: Run gates and prepare `/pr`**

Run `/check` until green, run the one plan-authorized four-axis review, revalidate exact identities and the clean tree, then invoke `/pr` automatically. Stop only for a defined hard halt or because an additional four-axis review needs fresh approval.
