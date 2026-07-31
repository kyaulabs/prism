# Protected Branch PR-Only Integration Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make `develop` and `main` PR-only protected branches through aligned
local hooks, an idempotent GitHub ruleset provisioner, a CI provenance
tripwire, and PR-based finishing/release guidance.

**Architecture:** ADR-0044 records the control hierarchy: an explicit GitHub
ruleset is authoritative, local hooks fail early, and CI verifies that a
protected-branch push is the exact merge commit of a merged PR. The repository
owns one ruleset named `pr-only-integration`, preserves unrelated rulesets,
and exposes dry-run/check/apply modes through one shell boundary. The initial
single-root push of a freshly scaffolded repository is the sole direct-write
exception; tags remain allowed.

**Tech Stack:** Bash 5, Git hooks, GitHub CLI/REST API, PHP 8.5 standard
library for strict JSON parsing, GitHub Actions, shell regression tests.

## Global constraints

- Issue: `#277`; classified `CI/CD`, commit/branch prefix `ci`.
- Architect verdict: `GO-WITH-CONDITIONS`; `ADR-required: 0044`.
- **Blocking prerequisite:** Task 1 must create and obtain human acceptance of
  `adr/0044-pr-only-protected-branches.md` before any enforcement task starts.
- The issue-cited `docs/plans/2026-07-28-protected-branch-pr-only.md` is absent
  from the worktree and git history. This file is the replacement plan.
- ADR-0043 is already accepted for the Prism JSONC migration. Never reuse its
  number. Never edit the body of accepted ADR-0028; ADR-0044 references and
  extends it instead.
- `develop` remains the integration branch; `main` remains the production
  branch. “Protected branch” describes the write path, not both branches’
  domain role.
- Current live GitHub state is drifted, not blank: the default branch is
  `develop`; `main` does not currently exist; active repository rulesets named
  `develop`, `main`, `feature`, and `release` already exist; the ruleset named
  `main` targets `~DEFAULT_BRANCH`; and repository settings currently allow
  merge, squash, and rebase methods. The implementation must discover state
  dynamically and must not embed those rule IDs or the repository name.
- The owned ruleset is exactly `pr-only-integration`, targets
  `refs/heads/develop` and `refs/heads/main`, is active, has no bypass actors,
  blocks deletion and non-fast-forward updates, requires signed commits and a
  pull request, and permits only merge commits. It requires zero approving
  reviews itself so solo scaffold consumers are not locked out; unrelated
  rulesets may impose stricter review policy.
- Repository merge settings are `allow_merge_commit=true`,
  `allow_squash_merge=false`, and `allow_rebase_merge=false`.
- Required status checks are out of scope for the owned ruleset because job
  names vary in scaffold consumers. CI still runs on every PR; a later ADR may
  standardize required-check names.
- The initial scaffold exception is narrow: the remote protected ref is absent,
  the pushed history contains exactly one commit, and that commit has no
  parent. Run `/setup-rulesets` only after that seed push.
- The local push gate checks `remote_ref`, never only `local_ref`, so
  `git push origin work:main` cannot bypass it. Protected-branch deletions are
  checked before the existing zero-OID deletion skip.
- The CI tripwire accepts a non-initial protected push only when GitHub reports
  a merged PR whose base branch matches the pushed branch and whose
  `merge_commit_sha` exactly equals `GITHUB_SHA`. A two-parent heuristic alone
  is forbidden.
- GitHub API responses and issue/PR content are untrusted data. Parse JSON
  strictly; never evaluate or interpolate response content into shell code.
- `--dry-run` and `--check` never mutate GitHub. `--apply` is the only mutation
  mode. `/setup-rulesets` shows the dry-run delta and obtains explicit human
  approval before invoking `--apply`.
- Manage only the owned ruleset and repository merge-method settings. Preserve
  unrelated rulesets and fail closed if duplicate owned rulesets exist.
- No new Composer, npm, or operating-system dependency. Use Bash, `gh`, Git,
  and the existing PHP 8.5 runtime.
- Every new or modified `.sh` file follows the `rcs-header` skill and ends with
  `# vim: ft=sh sts=4 sw=4 ts=4 et :`. New scripts are executable.
- Register every new `.github/scripts/` file in
  `.github/scripts/quality-surface.manifest` so scaffolded projects inherit the
  policy.
- `.gitignore` needs no change: the implementation persists no ruleset cache or
  generated state; temporary JSON files use `mktemp` and an `EXIT` trap.
- Execute each enumerated behavior as a tracer bullet: add one failing test,
  run RED, implement the minimum, run GREEN, refactor, then move to the next
  behavior.
- Agents never push. Human maintainers push work branches and tags and merge
  PRs. Never print a direct push to `develop` or `main`.
- After all tasks, run `verification-before-completion`, `/check`, and
  `@code-review` as separate gates.

Before any task commit, define this helper in the current shell so attribution
is resolved from the active Prism manifest rather than copied from this plan:

```bash
commit_with_attribution() {
    local subject="$1" issue_footer="$2" message
    : "${OPENCODE_MODEL_PLANNER:?run direnv allow before committing}"
    : "${OPENCODE_MODEL_PRIMARY:?run direnv allow before committing}"
    : "${OPENCODE_MODEL_JUDGE:?run direnv allow before committing}"
    local authored_by="${OPENCODE_MODEL_PLANNER##*/}"
    local implemented_by="${OPENCODE_MODEL_PRIMARY##*/}"
    local tested_by="${OPENCODE_MODEL_JUDGE##*/}"
    local signed_off_by
    signed_off_by="$(bash .github/scripts/resolve-identity.sh)" || return 1
    printf -v message '%s\n\n%s\nAuthored-by: %s\nImplemented-by: %s\nTested-by: %s\nSigned-off-by: %s' \
        "$subject" "$issue_footer" "$authored_by" "$implemented_by" \
        "$tested_by" "$signed_off_by"
    git commit -S -m "$message"
}
```

---

## File map

### Create

- `adr/0044-pr-only-protected-branches.md` — accepted control hierarchy,
  exception, ruleset contract, and release flow.
- `.github/scripts/setup-rulesets.sh` — canonical ruleset comparison and
  dry-run/check/apply boundary.
- `.github/scripts/verify-protected-push.sh` — CI PR-merge provenance check.
- `.opencode/commands/setup-rulesets.md` — human-confirmed command wrapper.
- `tests/Shell/setup_rulesets_test.sh` — fake-`gh` contract tests for ruleset
  discovery, comparison, and mutation.
- `tests/Shell/setup_rulesets_command_test.sh` — command confirmation and
  index contract.
- `tests/Shell/protected_push_tripwire_test.sh` — CI tripwire behavior tests.
- `tests/Shell/protected_branch_workflow_docs_test.sh` — active-guidance
  regression guard against direct protected-branch integration.

### Modify

- `CONTEXT.md` — protected-branch glossary entry, GitHub boundary, non-goal,
  and ADR-0044 index entry.
- `.github/scripts/validate-branch-name.sh` — protected-branch exit code `3`.
- `.github/hooks/prepare-commit-msg` — block protected-branch commits except a
  fresh root commit.
- `tests/Shell/validate_branch_name_test.sh` — protected exit-code tests.
- `tests/Shell/prepare_commit_msg_branch_test.sh` — commit-gate behavior.
- `.github/hooks/pre-push` — remote-target protected-ref gate.
- `tests/Shell/pre-push_test.sh` — protected update/deletion/refspec/root tests.
- `tests/Shell/pre_push_parity_test.sh` — static remote-ref/root-exception
  assertions.
- `.github/scripts/quality-surface.manifest` — register both new scripts.
- `.github/workflows/ci.yml` — pull-request read permission and push tripwire.
- `.opencode/skills/finishing-a-development-branch/SKILL.md` — PR-only branch
  completion.
- `.opencode/commands/release.md` — release PR, merged-SHA tag, tag-only push,
  and back-merge PR.
- `AGENTS.md` — protected-branch policy and `/setup-rulesets` index row.
- `CONTRIBUTING.md` — fork and internal PR-only integration instructions.
- `README.md` — hook behavior, GitHub CLI use, and command index.

### Deliberately unchanged

- `.github/scripts/new-branch.sh` — remains the paved branch-creation path.
- `.gitignore` — no persistent generated files are introduced.
- `adr/0028-git-flow-branch-naming-enforcement.md` — accepted ADR body remains
  immutable; ADR-0044 records the extension.

---

### Task 1: Accept ADR-0044 and the domain contract

**Files:**
- Create: `adr/0044-pr-only-protected-branches.md`
- Modify: `CONTEXT.md:17-39,111-145,150-198`

**Interfaces:**
- Consumes: ADR-0025 local/CI parity, ADR-0026 scaffold manifest, ADR-0028
  branch families, and the architect verdict.
- Produces: the binding policy consumed by Tasks 2–8.

- [ ] **Step 1: Draft ADR-0044 as `Proposed`**

Use the Nygard sections from `adr/0000-template.md` and record these exact
decisions:

```markdown
# 0044. Enforce PR-only protected branches

Date: 2026-07-30

## Status

Proposed
```

The Decision section must define: protected refs; the server/local/CI control
hierarchy; the single-root scaffold exception; the owned ruleset name and
exact rule/merge-setting contract; no bypass actors; preservation of unrelated
rulesets; `--dry-run`/`--check`/`--apply`; exact PR merge-SHA provenance; PR-only
feature/hotfix/release/back-merge flows; required signatures; zero approvals
and no required-status-checks in the owned minimum; and the administrative
policy-edit recovery procedure when checks or GitHub are unavailable.

- [ ] **Step 2: Update the living domain context**

Add `protected branch` to the glossary. Update the GitHub delegated boundary
to include repository rulesets. Replace “Humans push, humans merge” in the
non-goal with “Humans push work branches and release tags; humans review and
merge pull requests.” Add the ADR-0044 one-line index entry.

- [ ] **Step 3: Validate the draft**

Run:

```bash
grep -q '^# 0044\. Enforce PR-only protected branches$' adr/0044-pr-only-protected-branches.md
grep -q '^Proposed$' adr/0044-pr-only-protected-branches.md
grep -q 'protected branch' CONTEXT.md
grep -q 'adr/0044-pr-only-protected-branches.md' CONTEXT.md
```

Expected: all commands exit `0`.

- [ ] **Step 4: Obtain explicit human acceptance**

Present the complete ADR. Do not start Task 2 until the human approves it.
After approval, change only the status from `Proposed` to `Accepted` and run:

```bash
grep -A2 '^## Status$' adr/0044-pr-only-protected-branches.md | grep -q '^Accepted$'
```

Expected: exit `0`.

- [ ] **Step 5: Commit the accepted decision**

```bash
git add adr/0044-pr-only-protected-branches.md CONTEXT.md
commit_with_attribution "docs(adr): accept PR-only protected branches" "Refs: #277"
```

---

### Task 2: Block local commits on protected branches

**Files:**
- Modify: `.github/scripts/validate-branch-name.sh:4-43`
- Modify: `.github/hooks/prepare-commit-msg:4-54`
- Modify: `tests/Shell/validate_branch_name_test.sh:14-41,146-169`
- Modify: `tests/Shell/prepare_commit_msg_branch_test.sh:7-13,34-255`

**Interfaces:**
- Consumes: protected refs and root exception from ADR-0044.
- Produces: validator exit codes `0` valid/exempt, `1` invalid format, `2`
  reserved vocabulary error, `3` protected branch; the hook translates `3`
  into a block unless HEAD is unborn and no remote-tracking ref has that name.

- [ ] **Step 1: Change validator expectations to RED**

Replace the old `main`/`develop` exemption assertions with exit-code `3`
assertions, retain detached `HEAD` as exit `0`, and assert the diagnostic names
the protected branch and `new-branch.sh`.

Run:

```bash
bash tests/Shell/validate_branch_name_test.sh
```

Expected: FAIL because `main` and `develop` still exit `0`.

- [ ] **Step 2: Implement validator exit code `3`**

Use separate patterns so protected refs are not described as invalid names:

```bash
PROTECTED_RE='^(main|develop)$'
EXEMPT_RE='^HEAD$'

if [[ "$BRANCH" =~ $PROTECTED_RE ]]; then
    printf "✗ Branch '%s' is protected; commit on a work branch instead.\n" "$BRANCH" >&2
    echo "  Run: bash .github/scripts/new-branch.sh <type> <description>" >&2
    exit 3
fi

if [[ "$BRANCH" =~ $EXEMPT_RE ]]; then
    exit 0
fi
```

Update the exit-code documentation and invalid-name help. Run the validator
test again; expected: PASS.

- [ ] **Step 3: Add hook tests one tracer bullet at a time**

Add and run these behaviors in order:

1. a normal commit attempt on initialized `main` exits non-zero;
2. a normal commit attempt on initialized `develop` exits non-zero;
3. the first commit on an unborn `main` with no remote passes;
4. the first commit on an unborn `develop` with no remote passes;
5. an orphan protected branch with an existing matching remote ref is blocked;
6. a simulated rebase on `main` is blocked;
7. the existing invalid-branch rebase and detached-HEAD behaviors still pass;
8. valid work-branch and amend-pushed regressions remain green.

Run after each addition:

```bash
bash tests/Shell/prepare_commit_msg_branch_test.sh
```

Expected before implementation: the new protected-branch cases FAIL.

- [ ] **Step 4: Implement protected handling before the rebase early exit**

Capture the validator status without `!` so exit `3` is preserved. For status
`3`, derive the symbolic branch and allow only this predicate:

```bash
if ! git rev-parse --verify HEAD >/dev/null 2>&1 \
    && ! git branch -r --list "*/$CURRENT_BRANCH" | grep -q .; then
    INITIAL_PROTECTED_ROOT=true
else
    INITIAL_PROTECTED_ROOT=false
fi
```

If false, reject with the protected-branch/new-branch guidance. Only after this
check may the existing rebase early exit run. Exit `1`/`2` retains the existing
invalid-name rejection; exit `0`, detached HEAD, and the root exception pass.

Run:

```bash
bash tests/Shell/validate_branch_name_test.sh
bash tests/Shell/prepare_commit_msg_branch_test.sh
bash tests/Shell/prepare-commit-msg_test.sh
shellcheck .github/scripts/validate-branch-name.sh .github/hooks/prepare-commit-msg
```

Expected: all PASS with no Shellcheck output.

- [ ] **Step 5: Commit the local commit gate**

```bash
git add .github/scripts/validate-branch-name.sh .github/hooks/prepare-commit-msg \
    tests/Shell/validate_branch_name_test.sh tests/Shell/prepare_commit_msg_branch_test.sh
commit_with_attribution "ci(git): block commits on protected branches" "Refs: #277"
```

---

### Task 3: Block local pushes targeting protected refs

**Files:**
- Modify: `.github/hooks/pre-push:14-98`
- Modify: `tests/Shell/pre-push_test.sh:11-318`
- Modify: `tests/Shell/pre_push_parity_test.sh:5-30`

**Interfaces:**
- Consumes: Git pre-push stdin tuples
  `<local-ref> <local-oid> <remote-ref> <remote-oid>`.
- Produces: non-zero for protected updates/deletions/refspec targets; zero for
  work branches, tags, and the exact single-root seed push.

- [ ] **Step 1: Add the protected-target test queue**

Extend `pre-push_test.sh` one case at a time:

1. fast-forward update to `refs/heads/main` is blocked;
2. fast-forward update to `refs/heads/develop` is blocked;
3. deletion of either protected ref is blocked;
4. `refs/heads/work` pushed to remote `refs/heads/main` is blocked;
5. work-branch push remains allowed;
6. `refs/tags/v1.0.0` remains allowed;
7. absent remote + one zero-parent commit to a protected ref is allowed;
8. absent remote + multi-commit history to a protected ref is blocked;
9. SHA-256 zero OIDs retain the same behavior.

Run after each new case:

```bash
bash tests/Shell/pre-push_test.sh
```

Expected initially: protected update/deletion/refspec cases FAIL.

- [ ] **Step 2: Add the initial-root predicate**

Add a function that returns success only when the remote OID is zero, the
local OID is non-zero, `git rev-list --count "$local_oid"` is exactly `1`, and
`git rev-list --parents -n 1 "$local_oid"` contains only the commit itself.
Do not infer “root” from a zero remote OID alone.

- [ ] **Step 3: Gate by `remote_ref` before deletion/tag shortcuts**

Change the read loop to retain `remote_ref`:

```bash
while read -r local_ref local_oid remote_ref remote_oid; do
    case "$remote_ref" in
        refs/heads/main|refs/heads/develop)
            if ! is_initial_protected_push "$local_oid" "$remote_oid"; then
                # print BLOCKED guidance and exit 1
                exit 1
            fi
            ;;
    esac

    case "$remote_ref" in
        refs/tags/*) continue ;;
    esac
```

Keep the existing non-fast-forward, no-squash, and CI-parity gates unchanged
after this block. The protected check must occur before the zero-local-OID
deletion skip.

- [ ] **Step 4: Strengthen parity assertions and verify**

Make `pre_push_parity_test.sh` assert the hook references `remote_ref`, both
protected refs, and the initial-root helper. Run:

```bash
bash tests/Shell/pre-push_test.sh
bash tests/Shell/pre_push_parity_test.sh
shellcheck .github/hooks/pre-push
```

Expected: all PASS with no Shellcheck output.

- [ ] **Step 5: Commit the local push gate**

```bash
git add .github/hooks/pre-push tests/Shell/pre-push_test.sh \
    tests/Shell/pre_push_parity_test.sh
commit_with_attribution "ci(git): block protected branch push targets" "Refs: #277"
```

---

### Task 4: Build ruleset discovery, normalization, dry-run, and check modes

**Files:**
- Create: `.github/scripts/setup-rulesets.sh`
- Create: `tests/Shell/setup_rulesets_test.sh`
- Modify: `.github/scripts/quality-surface.manifest:8-28`

**Interfaces:**
- Consumes: `gh repo view`, repository/ruleset GET responses, and PHP 8.5.
- Produces: `--dry-run` report with exit `0`; `--check` exit `0` when canonical,
  `1` on drift, and `2` on prerequisites/API/malformed-state errors.

- [ ] **Step 1: Create the fake-`gh` harness and prerequisite tests**

Create a PATH-prepended `gh` shim that logs every argument and emits fixture
JSON for `repo view`, repository GET, ruleset list GET, and ruleset detail GET.
Add RED tests for missing `gh`, failed `gh auth status`, malformed JSON, API
failure, and dynamic repository detection. The script must never contain
`kyaulabs/prism`.

Run:

```bash
bash tests/Shell/setup_rulesets_test.sh
```

Expected: FAIL because the script does not exist.

- [ ] **Step 2: Add mode parsing and safe temporary files**

Implement `--dry-run`, `--check`, and `--apply`, with no argument defaulting to
`--dry-run`. Reject multiple/unknown modes with exit `2`. Require `gh`, `php`,
successful `gh auth status`, and dynamic `REPO=$(gh repo view ...)`. Use
`mktemp -d` and `trap 'rm -rf "$TMP_DIR"' EXIT`.

- [ ] **Step 3: Define the exact canonical payload**

Write this static JSON to a temp file through a single-quoted heredoc:

```json
{
  "name": "pr-only-integration",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/develop", "refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_signatures"},
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    }
  ]
}
```

Add the repository-settings canonical object separately:

```json
{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}
```

- [ ] **Step 4: Compare only owned fields with strict PHP JSON parsing**

Fetch the list, select exact-name matches, fail on more than one, and fetch the
single detail by a digits-only ID. Use `json_decode(..., true, 512,
JSON_THROW_ON_ERROR)` in a PHP standard-library comparator. Project actual and
expected state onto only the owned keys, sort branch include arrays and rules
by `type`, and compare strictly. Ignore server metadata and extra response-only
pull-request fields; do not ignore any owned field.

Add tracer-bullet fixtures for absent, matching, drifted, duplicate, and
unrelated rulesets. Expected reports:

```text
Ruleset pr-only-integration: create|unchanged|update
Repository merge methods: unchanged|update
```

- [ ] **Step 5: Finish non-mutating modes, register, and commit**

`--dry-run` reports the delta and exits `0`; `--check` exits `1` if either
owned surface drifts and `0` only when both match. Assert the fake log contains
no POST, PUT, PATCH, or DELETE for either mode. Register the script in
`quality-surface.manifest`, mark it executable, and run:

```bash
bash tests/Shell/setup_rulesets_test.sh
bash tests/Shell/setup_scaffold_test.sh
shellcheck .github/scripts/setup-rulesets.sh tests/Shell/setup_rulesets_test.sh
bash .github/scripts/check-script-executable-bits.sh
git add .github/scripts/setup-rulesets.sh .github/scripts/quality-surface.manifest \
    tests/Shell/setup_rulesets_test.sh
commit_with_attribution "ci(github): add protected ruleset drift checks" "Refs: #277"
```

Expected: all PASS; no Shellcheck output.

---

### Task 5: Add idempotent ruleset apply behavior

**Files:**
- Modify: `.github/scripts/setup-rulesets.sh`
- Modify: `tests/Shell/setup_rulesets_test.sh`

**Interfaces:**
- Consumes: normalized drift result from Task 4.
- Produces: `--apply` creates or updates only `pr-only-integration`, normalizes
  merge settings, and reports `created`, `updated`, or `unchanged`.

- [ ] **Step 1: Add RED mutation-contract tests**

Add one fake-API behavior at a time:

1. absent owned ruleset causes one ruleset POST;
2. drifted owned ruleset causes one PUT to its digits-only ID;
3. matching owned ruleset causes no ruleset mutation;
4. drifted merge settings cause one repository PATCH;
5. matching merge settings cause no repository PATCH;
6. unrelated rulesets are never updated/deleted;
7. duplicate owned rulesets fail before mutation;
8. a second canonical run is a complete no-op;
9. a 403 names the required repository-administration permission;
10. no code path emits DELETE.

Run after each case:

```bash
bash tests/Shell/setup_rulesets_test.sh
```

Expected initially: mutation cases FAIL.

- [ ] **Step 2: Implement create/update calls with file input**

Use only static payload files:

```bash
gh api "repos/$REPO/rulesets" -X POST --input "$RULESET_PAYLOAD"
gh api "repos/$REPO/rulesets/$RULESET_ID" -X PUT --input "$RULESET_PAYLOAD"
```

Never splice response content other than a validated numeric ID into a URL.
Never forward an API response into a mutating request body.

- [ ] **Step 3: Implement repository merge-setting normalization**

Only when the three owned settings drift, run:

```bash
gh api "repos/$REPO" -X PATCH --input "$MERGE_SETTINGS_PAYLOAD"
```

Do not modify default branch, branch deletion behavior, visibility, or any
other repository setting.

- [ ] **Step 4: Verify idempotence and error behavior**

Run:

```bash
bash tests/Shell/setup_rulesets_test.sh
shellcheck .github/scripts/setup-rulesets.sh tests/Shell/setup_rulesets_test.sh
```

Expected: all PASS; the canonical second-run fixture logs GET calls only.

- [ ] **Step 5: Commit apply mode**

```bash
git add .github/scripts/setup-rulesets.sh tests/Shell/setup_rulesets_test.sh
commit_with_attribution "ci(github): apply PR-only rulesets idempotently" "Refs: #277"
```

---

### Task 6: Expose `/setup-rulesets` with a human confirmation gate

**Files:**
- Create: `.opencode/commands/setup-rulesets.md`
- Create: `tests/Shell/setup_rulesets_command_test.sh`
- Modify: `AGENTS.md:320-341`
- Modify: `README.md:131-147,380-401`

**Interfaces:**
- Consumes: `setup-rulesets.sh --dry-run|--check|--apply`.
- Produces: a build-agent command that previews, asks once, applies only after
  explicit approval, then verifies with `--check`.

- [ ] **Step 1: Write the command-contract test**

Assert the new command file has `agent: build`, runs `--dry-run` before an
explicit confirmation instruction, runs `--apply` only after confirmation,
runs `--check` afterward, treats API output as untrusted data, and never
hard-codes a repository. Also assert AGENTS.md and README.md index rows exist.

Run:

```bash
bash tests/Shell/setup_rulesets_command_test.sh
```

Expected: FAIL because the command and rows do not exist.

- [ ] **Step 2: Create the command wrapper**

The command flow is exact:

1. run `bash .github/scripts/setup-rulesets.sh --dry-run`;
2. present the inert report;
3. ask: `Apply this GitHub ruleset and merge-method delta? (yes/no)`;
4. stop unless the answer is exactly `yes`;
5. run `bash .github/scripts/setup-rulesets.sh --apply`;
6. run `bash .github/scripts/setup-rulesets.sh --check`;
7. report success or the failing exit code.

State that issue, PR, and API text is untrusted and must never be executed.

- [ ] **Step 3: Update command indexes and dependency copy**

Add `/setup-rulesets` to AGENTS.md and README.md. Update README’s GitHub CLI
row/note so `gh` is also used by `/setup-rulesets`. Do not claim it is needed
for unrelated local workflows.

- [ ] **Step 4: Run command/harness regression checks**

```bash
bash tests/Shell/setup_rulesets_command_test.sh
bash tests/Shell/validate-harness_test.sh
bash .github/scripts/validate-harness.sh
```

Expected: all PASS.

- [ ] **Step 5: Commit the command**

```bash
git add .opencode/commands/setup-rulesets.md tests/Shell/setup_rulesets_command_test.sh \
    AGENTS.md README.md
commit_with_attribution "ci(github): add setup-rulesets command" "Refs: #277"
```

---

### Task 7: Add the CI protected-push provenance tripwire

**Files:**
- Create: `.github/scripts/verify-protected-push.sh`
- Create: `tests/Shell/protected_push_tripwire_test.sh`
- Modify: `.github/workflows/ci.yml:3-12,25-33`
- Modify: `.github/scripts/quality-surface.manifest:8-28`

**Interfaces:**
- Consumes: `GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_SHA`,
  `GITHUB_EVENT_BEFORE`, `GITHUB_REPOSITORY`, `GH_TOKEN`, local git history,
  and `GET /repos/{owner}/{repo}/commits/{sha}/pulls`.
- Produces: exit `0` for non-protected events, exact PR merge commits, and the
  single-root seed; exit `1` for policy violation; exit `2` for malformed env,
  API failure, or malformed JSON.

- [ ] **Step 1: Add the tripwire test harness and RED cases**

Use disposable git repositories plus a fake `gh` shim. Add cases one at a
time for:

1. non-push event skips;
2. push to a work ref skips;
3. zero-before + one root commit passes without API access;
4. zero-before + multi-commit history fails;
5. merged PR with matching base and `merge_commit_sha` passes;
6. no associated PR fails;
7. closed-but-unmerged PR fails;
8. merged PR with wrong base fails;
9. merged PR with wrong merge SHA fails;
10. malformed repository/SHA/env fails before API access;
11. malformed JSON and repeated API failure fail closed;
12. transient API failure followed by success passes within three attempts.

Run:

```bash
bash tests/Shell/protected_push_tripwire_test.sh
```

Expected: FAIL because the verifier does not exist.

- [ ] **Step 2: Implement event validation and root detection**

Allow only `refs/heads/main` and `refs/heads/develop`. Validate repository as
`owner/name` with GitHub-safe characters and SHA/before as 40- or 64-character
lowercase hex or all-zero OIDs. The initial exception requires both:

```bash
[ "$(git rev-list --count "$GITHUB_SHA")" -eq 1 ]
[ "$(git rev-list --parents -n 1 "$GITHUB_SHA" | wc -w | tr -d ' ')" -eq 1 ]
```

- [ ] **Step 3: Implement exact PR provenance with bounded retry**

Call the commit-pulls endpoint up to three times with a two-second delay.
Strictly parse the response with PHP. Succeed only if at least one object has:

```text
merged_at != null
base.ref == <protected branch without refs/heads/>
merge_commit_sha == GITHUB_SHA
```

Do not inspect or execute PR title/body content. If all API attempts fail or
JSON is invalid, exit `2`; if valid JSON has no exact match, print a GitHub
Actions `::error::` and exit `1`.

- [ ] **Step 4: Wire CI permissions and the early step**

Add `pull-requests: read` beside `contents: read`. Immediately after checkout,
add:

```yaml
      - name: Verify protected push came from a merged PR
        if: github.event_name == 'push'
        env:
          GH_TOKEN: ${{ github.token }}
          GITHUB_EVENT_NAME: ${{ github.event_name }}
          GITHUB_EVENT_BEFORE: ${{ github.event.before }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GITHUB_REF: ${{ github.ref }}
          GITHUB_SHA: ${{ github.sha }}
        run: bash .github/scripts/verify-protected-push.sh
```

Register the verifier in `quality-surface.manifest` and mark it executable.

- [ ] **Step 5: Verify and commit the CI tripwire**

```bash
bash tests/Shell/protected_push_tripwire_test.sh
bash tests/Shell/setup_scaffold_test.sh
shellcheck .github/scripts/verify-protected-push.sh tests/Shell/protected_push_tripwire_test.sh
bash .github/scripts/check-script-executable-bits.sh
git add .github/scripts/verify-protected-push.sh .github/workflows/ci.yml \
    .github/scripts/quality-surface.manifest tests/Shell/protected_push_tripwire_test.sh
commit_with_attribution "ci(github): verify protected push PR provenance" "Refs: #277"
```

Expected: all PASS; no Shellcheck output.

---

### Task 8: Replace direct integration and release guidance with PR flows

**Files:**
- Create: `tests/Shell/protected_branch_workflow_docs_test.sh`
- Modify: `.opencode/skills/finishing-a-development-branch/SKILL.md:16-171`
- Modify: `.opencode/commands/release.md:6-82`
- Modify: `AGENTS.md:150-191,320-341`
- Modify: `CONTRIBUTING.md:11-35`
- Modify: `README.md:149-187,380-401`

**Interfaces:**
- Consumes: branch families from ADR-0028 and protected policy from ADR-0044.
- Produces: work/release/tag/back-merge commands with no direct protected push.

- [ ] **Step 1: Add active-guidance regression tests**

Assert:

- no active `.opencode/` or living-doc file contains
  `git push origin develop` or `git push origin main`;
- the finishing skill offers PR/keep/discard only and uses
  `gh pr create --base "$TARGET_BRANCH"`;
- normal branches target `develop`; `hotfix/*` and `release/*` target `main`;
- the finishing skill merges `origin/$TARGET_BRANCH` into an already-published
  work branch instead of rebasing it and requiring a force-push;
- release prep starts with `new-branch.sh release`;
- release integration uses a PR to `main`;
- the signed tag names the verified merged-main SHA;
- publication pushes only `vX.Y.Z`;
- back-merge uses a PR with base `develop` and head `main`;
- direct-push text in historical ADRs is excluded from the active-doc scan.

Run:

```bash
bash tests/Shell/protected_branch_workflow_docs_test.sh
```

Expected: FAIL on the current finishing and release instructions.

- [ ] **Step 2: Rewrite branch completion around one PR path**

Derive `TARGET_BRANCH=main` for `hotfix/*` and `release/*`; otherwise use
`develop`. Replace the direct merge option with:

1. verify `/check`, review, signatures, and clean tree;
2. fetch the target;
3. if synchronization is needed, merge `origin/$TARGET_BRANCH` into the work
   branch with a merge commit, rerun gates, and let the human push the resulting
   fast-forward update;
4. prepare title/body via single-quoted heredocs;
5. prepare `gh pr create --base "$TARGET_BRANCH" --head "$BRANCH_NAME"`;
6. retain keep/discard options and post-merge local cleanup;
7. never auto-merge, auto-push, or bypass a PR.

- [ ] **Step 3: Rewrite `/release` as prepare/finalize PR phases**

Preparation: determine version, create `release/X.Y.Z` through
`new-branch.sh`, generate and commit the changelog, then print the allowed
work-branch push and PR-to-main commands.

Finalization after human merge: fetch `origin/main`; query the selected PR;
require `state=CLOSED`, non-null `mergedAt`, `baseRefName=main`, and a
`mergeCommit.oid` equal to `origin/main`; create `git tag -s vX.Y.Z "$MERGE_SHA"`;
print `git push origin vX.Y.Z`; print `gh release create`; and print a
back-merge PR command with `--base develop --head main`. Never reuse the
release branch after merge and never push `main` or `develop` directly.

- [ ] **Step 4: Align living policy docs**

In AGENTS.md, state that all integration to `develop`/`main` is by merged PR,
work branches originate through `new-branch.sh`, and humans alone push work
branches/tags and merge PRs. In CONTRIBUTING.md, distinguish fork PRs from
same-repository work-branch PRs while keeping the same protected targets. In
README.md, update `prepare-commit-msg` and `pre-push` hook descriptions and the
`/release` summary.

- [ ] **Step 5: Verify and commit the workflow/docs slice**

```bash
bash tests/Shell/protected_branch_workflow_docs_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/skill_shell_injection_test.sh
bash .github/scripts/validate-harness.sh
git add tests/Shell/protected_branch_workflow_docs_test.sh \
    .opencode/skills/finishing-a-development-branch/SKILL.md \
    .opencode/commands/release.md AGENTS.md CONTRIBUTING.md README.md
commit_with_attribution "ci(git): document PR-only integration flows" "Fixes: #277"
```

Expected: all PASS.

---

### Task 9: Run full verification without mutating live rulesets

**Files:**
- Verify only; no source changes expected.

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: evidence for the manual `/check` and `@code-review` gates.

- [ ] **Step 1: Run focused shell regressions**

```bash
bash tests/Shell/validate_branch_name_test.sh
bash tests/Shell/prepare_commit_msg_branch_test.sh
bash tests/Shell/prepare-commit-msg_test.sh
bash tests/Shell/pre-push_test.sh
bash tests/Shell/pre_push_parity_test.sh
bash tests/Shell/setup_rulesets_test.sh
bash tests/Shell/setup_rulesets_command_test.sh
bash tests/Shell/protected_push_tripwire_test.sh
bash tests/Shell/protected_branch_workflow_docs_test.sh
bash tests/Shell/setup_scaffold_test.sh
bash tests/Shell/validate-harness_test.sh
bash tests/Shell/commit_template_footer_test.sh
bash tests/Shell/skill_shell_injection_test.sh
```

Expected: every suite PASS.

- [ ] **Step 2: Run static and scaffold gates**

```bash
shellcheck .github/hooks/prepare-commit-msg .github/hooks/pre-push \
    .github/scripts/validate-branch-name.sh .github/scripts/setup-rulesets.sh \
    .github/scripts/verify-protected-push.sh
bash .github/scripts/check-script-executable-bits.sh
bash .github/scripts/validate-harness.sh
```

Expected: all exit `0`, no Shellcheck findings.

- [ ] **Step 3: Inspect the non-mutating live delta**

With explicit human permission for GitHub reads, run:

```bash
bash .github/scripts/setup-rulesets.sh --dry-run
```

Expected on the current repository: report whether
`pr-only-integration` would be created and whether squash/rebase merge methods
would be disabled; perform no POST/PUT/PATCH/DELETE. Do **not** run `--apply`
as part of implementation. The human invokes `/setup-rulesets` separately.

- [ ] **Step 4: Run project-wide verification**

Run `verification-before-completion`, then `/check`.

Expected: formatting, lint, SAST prerequisites, Pest, shell suites, and changed
file coverage all pass; changed PHP coverage remains at least 80% (no PHP
source change is expected).

- [ ] **Step 5: Review and hand off**

Run `@code-review`. Resolve all non-informational findings through
`receiving-code-review`, rerun affected checks, and stop. The human pushes the
`ci/*` branch, opens the PR to `develop`, reviews, and merges it. The human then
invokes `/setup-rulesets`; agents never push or mutate live rulesets without
that separate confirmation.

---

## Self-review

- **Issue coverage:** local commit block, local remote-target push block,
  root/tag exceptions, idempotent explicit ruleset provisioning, merge-method
  normalization, CI exact-PR provenance, scaffold propagation, finishing flow,
  release/tag/back-merge flow, and living docs each map to a task.
- **Architect conditions:** ADR-0044 and glossary are first; signed commits,
  no bypass, duplicate detection, unrelated-rule preservation, exact remote ref,
  root predicate, exact PR merge SHA, and operational lockout are explicit.
- **Known repository drift:** existing live rulesets, `develop` default, absent
  `main`, and all merge methods enabled are recorded without hard-coded IDs.
- **Intentional issue deviation:** accepted ADR-0028 is not edited because the
  `adr` skill forbids body edits to accepted ADRs. ADR-0044 references and
  extends it instead.
- **Placeholder scan:** no `TBD`, `TODO`, or undefined implementation contract.
- **Dependency scan:** no new dependency and no `.gitignore` change.
