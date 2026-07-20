# $KYAULabs: 2026-07-19-git-flow-identity-config-consolidation.md kyau@nova 2026/07/19 -0700 Exp $

# Git Flow Enforcement + Dynamic Identity + Config Consolidation — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor where tests apply; documentation/refactor tasks use
> Implement → Verify → Commit.

**Goal:** Mechanically enforce Git Flow branch naming, make `Signed-off-by`
identity dynamic, and consolidate three config files into a unified
`setup.json` — all validated by `@architect` (GO-WITH-CONDITIONS,
ADR-required: 0028 + 0029).

**Architecture:** Three intertwined changes in one PR with 15 atomic commits.
Phase A adds a `prepare-commit-msg` hook that rejects commits on non-conforming
branches, plus `validate-branch-name.sh` + `new-branch.sh` helpers. Phase C
adds `resolve-identity.sh` for runtime identity resolution (unblocks Phase A).
Phase B merges `models.default.env` + `experimental.default.env` into
`setup.json` (schema v1→v4), rewriting `.envrc` to use `jq` with graceful
degradation and a v1-schema back-compat shim.

**Tech Stack:** Bash 4+ (scripts/hooks), Shellcheck, `jq` (new — Phase B),
Pest PHP v4 (harness tests), existing `tests/Shell/lib/test_helpers.sh` library.

## Global constraints

- PHP 8.5+, PSR-12, `declare(strict_types=1)` on all PHP classes
- Bash 4+, `set -euo pipefail`, Shellcheck-clean, tab indentation (tab-stop 4)
- Signed commits (`git commit -S`), Conventional Commits format
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`,
  `Signed-off-by: kyau <git@kyaulabs.com>` (until Phase C makes this dynamic —
  the plan's own commits still use the current literal)
- 80% line coverage on changed PHP files (changed-file gate)
- TDD: Red → Green → Refactor for all scripts/tests
- No squash merges; each commit is atomic
- `jq` is a new toolchain dependency (Phase B); must be added to `/doctor`
  checks and documented in README prerequisites
- ADRs follow Nygard format; status transitions documented per `adr` skill

## File structure

**New files (9):**

| Path | Responsibility |
|---|---|
| `adr/0028-git-flow-branch-naming-enforcement.md` | Branch naming ADR |
| `adr/0029-unified-setup-json-config.md` | Config consolidation ADR |
| `.github/scripts/validate-branch-name.sh` | Single source of truth: is branch name valid? Exit 0/1/2 |
| `.github/scripts/new-branch.sh` | Generate name + create branch off correct base |
| `.github/scripts/resolve-identity.sh` | Resolve `Name <email>` from 3-tier fallback |
| `.github/scripts/migrate-setup.sh` | One-way v1→v4 setup.json schema migration |
| `tests/Shell/validate_branch_name_test.sh` | Validator test suite |
| `tests/Shell/new_branch_test.sh` | Helper script test suite |
| `tests/Shell/resolve_identity_test.sh` | Identity resolver test suite |

**Modified files (~20):** `.opencode/setup.json`, `.envrc`,
`.github/hooks/prepare-commit-msg`, `.opencode/agents/from-issue.md`,
`.opencode/agents/tdd.md`, `.opencode/agents/resolve-merge-conflicts.md`,
`.opencode/commands/setup.md`, `.opencode/commands/feature.md`,
`.opencode/commands/doctor.md`, `.github/scripts/setup-substitute.sh`,
`.github/scripts/quality-surface.manifest`,
`.opencode/skills/conventional-commits/SKILL.md`,
`.opencode/skills/finishing-a-development-branch/SKILL.md`,
`.opencode/skills/writing-plans/SKILL.md`,
`.opencode/docs/model-configuration.md`, `AGENTS.md`, `CONTRIBUTING.md`,
`README.md`, `CODING_HARNESS.md`, `tests/Unit/Harness/ModelConfigTest.php`,
`tests/Shell/research_background_scout_test.sh`,
`adr/0007-setup-token-strategy.md`, `adr/0012-configurable-model-variables.md`,
`adr/0013-configurable-variant-via-env-var.md`,
`adr/0024-experimental-subagent-dependencies.md`, `CONTEXT.md`.

**Deleted files (2):** `.opencode/models.default.env`,
`.opencode/experimental.default.env`.

## Task interface map

```
Task 1 (ADR-0028 + ADR-0029)         → foundation (no deps)
Task 2 (resolve-identity.sh + tests) → produces: resolve-identity.sh interface
Task 3 (validate-branch-name.sh)     → no deps
Task 4 (new-branch.sh)               → consumes: resolve-identity.sh (Task 2)
Task 5 (prepare-commit-msg hook)     → consumes: validate-branch-name.sh (Task 3)
Task 6 (from-issue.md + feature.md)  → consumes: new-branch.sh (Task 4)
Task 7 (setup.json schema bump)      → no deps (additive)
Task 8 (.envrc rewrite + jq)         → consumes: setup.json v4 (Task 7)
Task 9 (migrate-setup.sh + /setup)   → consumes: setup.json v4 (Task 7)
Task 10 (agents/skills dynamic identity) → consumes: resolve-identity.sh (Task 2)
Task 11 (delete env files)           → consumes: .envrc rewrite (Task 8)
Task 12 (rewrite ModelConfigTest)    → consumes: setup.json v4 (Task 7)
Task 13 (skill naming sweep)         → no deps
Task 14 (documentation sweep)        → consumes: all prior
Task 15 (manifest update)            → consumes: Tasks 2-4 scripts exist
```

## Architect validation

**Verdict:** GO-WITH-CONDITIONS
**ADR-required:** 0028, 0029

The 7 conditions surfaced by `@architect` are integrated into the tasks below:

1. `jq` dependency flagged + graceful degradation in `.envrc` (Task 8) + `/doctor` check (Task 8)
2. v1→v4 schema migration via `migrate-setup.sh` (Task 8), auto-run by `.envrc`
3. SemVer regex excludes build metadata (`+` illegal in git branches) (Task 3)
4. `ModelConfigTest.php` rewrite scoped as Task 12
5. Cross-phase dependency: Task 2 (resolve-identity.sh) before Task 4 (new-branch.sh)
6. Username sanitization rules explicit in Task 4 (lowercase, whitespace→-, strip non-`[a-z0-9._-]`)
7. commitlint `trailers-exist` rule unaffected (requires presence, not value)

---

## Task 1: ADR-0028 + ADR-0029 (foundation)

**Files:**
- Create: `adr/0028-git-flow-branch-naming-enforcement.md`
- Create: `adr/0029-unified-setup-json-config.md`
- Modify: `adr/0007-setup-token-strategy.md` (status line)
- Modify: `adr/0012-configurable-model-variables.md` (superseded-by)
- Modify: `adr/0013-configurable-variant-via-env-var.md` (superseded-by)
- Modify: `adr/0024-experimental-subagent-dependencies.md` (superseded-by)

**Interfaces:**
- Produces: ADR-0028 records the exact branch-name regex (consumed by Task 3's
  validator), the allowed type vocabulary, the exemption list, and the
  enforcement-hook choice rationale.
- Produces: ADR-0029 records the setup.json v4 schema, the `jq` dependency
  justification, the v1→v4 migration path, and the back-compat shim
  requirements (consumed by Tasks 7-9).

- [ ] **Step 1: Draft ADR-0028**

Use the `adr` skill. Nygard format. Status: `Accepted`. Include:
- **Context:** Today the `feat/<username>-<hash>-<description>` convention is
  documentary only — no hook validates branch names. `@from-issue` (line 196)
  is the only documented branch creator. Classic Git Flow has been extended to
  cover `release/<semver>` and `hotfix/<user>-<hash>-<desc>`.
- **Decision:** Enforce three prefix families via `prepare-commit-msg` hook
  calling `validate-branch-name.sh`. Exempt `main`, `develop`, detached HEAD.
  Helper `new-branch.sh` generates valid names and creates branches off the
  correct base (`develop` for commit-types and release; `main` for hotfix).
- **Alternatives considered:** `post-checkout` (too late — branch already
  exists), `pre-push` (too late — commits pile up), plugin-only interception
  (doesn't catch human-created branches), soft skill-only (relies on memory).
- **Regex (consume in Task 3):**
  - Feature: `^(feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$`
  - Hotfix: `^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$`
  - Release: `^release/[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$`
- **SemVer build metadata exclusion:** `+` is illegal in git branch names;
  `release/` regex accepts core SemVer + prerelease only.
- **Consequences:** Positive (mechanical enforcement, consistent attribution),
  Negative (one-time rename of pre-existing non-conforming branches), Neutral
  (exemption list is conservative).

- [ ] **Step 2: Draft ADR-0029**

Use the `adr` skill. Nygard format. Status: `Accepted`. Include:
- **Context:** ADR-0012/0013 chose shell-sourced `.env` files for
  zero-dependency simplicity. Three config files now exist:
  `models.default.env`, `experimental.default.env`, `setup.json` (v1,
  identity/scaffolding only). The split makes identity configuration
  inconsistent with model configuration.
- **Decision:** Consolidate all three into `setup.json` (schema v4). `.envrc`
  reads via `jq`. User-level overrides move from `~/.config/opencode/models.env`
  to `~/.config/opencode/setup.json`.
- **`jq` justification:** (a) `jq` is universally available on Linux/macOS,
  (b) the complexity of multi-source JSON parsing exceeds what pure shell can
  cleanly handle, (c) `setup-scaffold.sh` already requires Bash 4+ so the
  toolchain floor is not pristine, (d) graceful degradation path defined below.
- **Graceful degradation:** `.envrc` checks `command -v jq`; if absent, prints
  a clear error and exits non-zero so direnv surfaces the failure. Does NOT
  silently fall back.
- **v1→v4 migration path:** `migrate-setup.sh` detects `setup_version` field;
  if absent or `<4`, adds `models`/`variants`/`experimental` keys with default
  values from the deleted `models.default.env`/`experimental.default.env`.
  Idempotent. Auto-run by `.envrc`.
- **Back-compat for clones with v1 setup.json:** `.envrc` calls
  `migrate-setup.sh` automatically if `setup_version < 4`. Also: if
  `~/.config/opencode/models.env` exists and `~/.config/opencode/setup.json`
  does not, source the legacy file with deprecation warning.
- **Reversibility cost:** Schema bump is one-way. Rolling back requires manual
  schema editing. Documented as accepted cost.
- **Supersedes:** ADR-0007 (model delivery clause only — token substitution
  strategy survives). Amends sourcing clauses of ADR-0012, ADR-0013, ADR-0024.

- [ ] **Step 3: Update existing ADRs**

- `adr/0007-setup-token-strategy.md`: change Status line to
  `Accepted (partially superseded by ADR-0029 — model delivery mechanism only;
  token-substitution strategy survives)`.
- `adr/0012-configurable-model-variables.md`: append to existing superseded-by
  note: `Sourcing clauses superseded by ADR-0029 (delivery mechanism changed
  from shell-sourced .env files to jq-parsed setup.json). {env:VAR} substitution
  pattern and tier model preserved.`
- `adr/0013-configurable-variant-via-env-var.md`: same amendment as 0012.
- `adr/0024-experimental-subagent-dependencies.md`: append: `Sourcing clause
  superseded by ADR-0029 (experimental flags moved from
  .opencode/experimental.default.env to setup.json experimental key).`

- [ ] **Step 4: Commit**

```
docs(adr): add branch naming + setup.json consolidation ADRs

ADR-0028: mechanically enforce Git Flow branch naming via prepare-commit-msg
  hook + validate-branch-name.sh + new-branch.sh helpers. Three prefix
  families: <commit-type>/<user>-<hash>-<desc>, release/<semver>,
  hotfix/<user>-<hash>-<desc>.

ADR-0029: consolidate models.default.env + experimental.default.env into
  setup.json (schema v4). Introduces jq dependency with graceful degradation.
  Supersedes ADR-0007 (model delivery only); amends sourcing clauses of
  ADR-0012, ADR-0013, ADR-0024.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 2: resolve-identity.sh + tests (Phase C.1 — unblocks Task 4)

**Files:**
- Create: `.github/scripts/resolve-identity.sh`
- Test: `tests/Shell/resolve_identity_test.sh`

**Interfaces:**
- Produces: `resolve-identity.sh` — no args. Prints `Name <email>` on stdout.
  Exit 0 on success; exit 3 if all sources empty. Consumed by Task 4
  (`new-branch.sh` extracts name component) and Task 10 (agents emit dynamic
  Signed-off-by).

**Resolution order:**
1. `~/.config/opencode/setup.json` → `signed_off_by_name` + `signed_off_by_email`
2. `.opencode/setup.json` → `signed_off_by_name` + `signed_off_by_email`
3. `git config user.name` + `git config user.email`

- [ ] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
# tests/Shell/resolve_identity_test.sh
# Tests for .github/scripts/resolve-identity.sh

source "$(dirname "$0")/lib/test_helpers.sh"

SCRIPT="$(git rev-parse --show-toplevel)/.github/scripts/resolve-identity.sh"

setup() {
    TEST_REPO=$(create_test_repo)
    cd "$TEST_REPO"
    git config user.name "Test User"
    git config user.email "test@example.com"
}

test_git_config_fallback() {
    setup
    OUTPUT=$(bash "$SCRIPT")
    assert_equals "Test User <test@example.com>" "$OUTPUT" \
        "git config fallback should produce Name <email>"
}

test_project_setup_json_overrides_git_config() {
    setup
    mkdir -p .opencode
    cat > .opencode/setup.json <<EOF
{"setup_version": 4, "signed_off_by_name": "Project", "signed_off_by_email": "project@example.com"}
EOF
    OUTPUT=$(bash "$SCRIPT")
    assert_equals "Project <project@example.com>" "$OUTPUT" \
        "project setup.json wins over git config"
}

test_user_setup_json_overrides_project() {
    setup
    mkdir -p .opencode
    cat > .opencode/setup.json <<EOF
{"setup_version": 4, "signed_off_by_name": "Project", "signed_off_by_email": "project@example.com"}
EOF
    mkdir -p ~/.config/opencode
    cat > ~/.config/opencode/setup.json <<EOF
{"signed_off_by_name": "User", "signed_off_by_email": "user@example.com"}
EOF
    OUTPUT=$(bash "$SCRIPT")
    assert_equals "User <user@example.com>" "$OUTPUT" \
        "user setup.json wins over project"
    rm -f ~/.config/opencode/setup.json
}

test_all_empty_exits_3() {
    setup
    git config --unset user.name
    git config --unset user.email
    mkdir -p .opencode
    echo '{"setup_version": 4}' > .opencode/setup.json
    OUTPUT=$(bash "$SCRIPT" 2>/dev/null || true)
    EXIT_CODE=$?
    assert_equals "3" "$EXIT_CODE" "all sources empty should exit 3"
}

test_output_format() {
    setup
    OUTPUT=$(bash "$SCRIPT")
    assert_matches '^[^<]+ <[^@]+@[^>]+>$' "$OUTPUT" \
        "output must match 'Name <email>'"
}

run_tests "$@"
```

- [ ] **Step 2: Run test to verify failure**

Run: `bash tests/Shell/resolve_identity_test.sh`
Expected: FAIL — `resolve-identity.sh` does not exist.

- [ ] **Step 3: Implement resolve-identity.sh**

```bash
#!/usr/bin/env bash
# $KYAULabs: resolve-identity.sh kyau@nova 2026/07/19 -0700 Exp $
# resolve-identity.sh — Resolve Signed-off-by identity from 3-tier fallback.
#
# Resolution order:
#   1. ~/.config/opencode/setup.json (user override)
#   2. .opencode/setup.json (project default)
#   3. git config user.name <git config user.email>
#
# Output: "Name <email>" on stdout
# Exit: 0 success, 3 if all sources empty

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
USER_SETUP="$HOME/.config/opencode/setup.json"
PROJECT_SETUP="$REPO_ROOT/.opencode/setup.json"

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq is required to parse setup.json" >&2
    exit 3
fi

read_json_field() {
    local file="$1" field="$2"
    [ -f "$file" ] || return 1
    local val
    val=$(jq -r ".\"$field\" // empty" "$file" 2>/dev/null) || return 1
    [ -n "$val" ] && echo "$val" || return 1
}

resolve_pair_from_json() {
    local file="$1"
    local name email
    name=$(read_json_field "$file" "signed_off_by_name") || return 1
    email=$(read_json_field "$file" "signed_off_by_email") || return 1
    echo "$name <$email>"
}

# Tier 1: user setup.json
if pair=$(resolve_pair_from_json "$USER_SETUP"); then
    echo "$pair"
    exit 0
fi

# Tier 2: project setup.json
if pair=$(resolve_pair_from_json "$PROJECT_SETUP"); then
    echo "$pair"
    exit 0
fi

# Tier 3: git config
NAME=$(git config user.name 2>/dev/null || true)
EMAIL=$(git config user.email 2>/dev/null || true)
if [ -n "$NAME" ] && [ -n "$EMAIL" ]; then
    echo "$NAME <$EMAIL>"
    exit 0
fi

echo "✗ Could not resolve identity from any source." >&2
echo "  Set git config user.name/user.email, or run /setup." >&2
exit 3

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test to verify pass**

Run: `bash tests/Shell/resolve_identity_test.sh`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Lint + commit**

```bash
shellcheck .github/scripts/resolve-identity.sh tests/Shell/resolve_identity_test.sh
chmod +x .github/scripts/resolve-identity.sh
git add .github/scripts/resolve-identity.sh tests/Shell/resolve_identity_test.sh
git commit -S -m $'feat(identity): add resolve-identity.sh for dynamic Signed-off-by\n\nThree-tier fallback: user setup.json → project setup.json → git config.\nOutput: "Name <email>" on stdout. Exit 3 if all sources empty.\n\nUnblocks Phase A (new-branch.sh consumes this for username component) and\nPhase C (agents emit dynamic Signed-off-by).\n\nRefs: ADR-0029\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Task 3: validate-branch-name.sh + tests (Phase A.1)

**Files:**
- Create: `.github/scripts/validate-branch-name.sh`
- Test: `tests/Shell/validate_branch_name_test.sh`

**Interfaces:**
- Produces: `validate-branch-name.sh [<branch-name>]` — defaults to
  `git rev-parse --abbrev-ref HEAD`. Exit 0 valid/exempt; 1 invalid format;
  2 bad type. Silent on success; helpful stderr on failure. Consumed by Task 5
  (hook) and Task 4 (self-check).

**Validation regex (from ADR-0028):**

```bash
FEATURE_RE='^(feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
HOTFIX_RE='^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
RELEASE_RE='^release/[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
EXEMPT_RE='^(main|develop|HEAD)$'
```

- [ ] **Step 1: Write failing test (14 cases)**

```bash
#!/usr/bin/env bash
# tests/Shell/validate_branch_name_test.sh
source "$(dirname "$0")/lib/test_helpers.sh"

SCRIPT="$(git rev-parse --show-toplevel)/.github/scripts/validate-branch-name.sh"

run_case() {
    local branch="$1" expected_exit="$2"
    bash "$SCRIPT" "$branch" >/dev/null 2>&1
    local actual=$?
    assert_equals "$expected_exit" "$actual" \
        "branch '$branch' should exit $expected_exit"
}

test_exempt_main()         { run_case "main" 0; }
test_exempt_develop()      { run_case "develop" 0; }
test_exempt_head()         { run_case "HEAD" 0; }
test_valid_feat()          { run_case "feat/kyau-c6a2-add-foo" 0; }
test_valid_fix_multiword() { run_case "fix/jane-doe-deadbeef-fix-bug" 0; }
test_valid_release()       { run_case "release/1.2.0" 0; }
test_valid_release_pre()   { run_case "release/v2.0.0-rc.1" 0; }
test_valid_hotfix()        { run_case "hotfix/kyau-abcd-fix-critical" 0; }
test_invalid_feature()     { run_case "feature/kyau-c6a2-add-foo" 1; }
test_invalid_no_hash()     { run_case "feat/kyau-add-foo" 1; }
test_invalid_5hex()        { run_case "feat/kyau-c6a2a-add-foo" 1; }
test_invalid_uppercase()   { run_case "Feat/kyau-c6a2-add-foo" 1; }
test_invalid_buildmeta()   { run_case "release/1.2.0+build.42" 1; }
test_invalid_ignore()      { run_case "ignore/kyau-c6a2-x" 1; }

run_tests "$@"
```

- [ ] **Step 2: Run test → FAIL (script missing)**

- [ ] **Step 3: Implement validate-branch-name.sh**

```bash
#!/usr/bin/env bash
# $KYAULabs: validate-branch-name.sh kyau@nova 2026/07/19 -0700 Exp $
# validate-branch-name.sh — Validate current (or passed) branch against Git Flow convention.
# See ADR-0028 for the regex specification and rationale.
#
# Usage: validate-branch-name.sh [<branch-name>]
# Default: derives current branch from git rev-parse --abbrev-ref HEAD
#
# Exit codes:
#   0 — valid OR exempt (main, develop, detached HEAD)
#   1 — invalid format (does not match any prefix family)
#   2 — bad type (unused; reserved for vocab-only violations)

set -euo pipefail

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)}"

FEATURE_RE='^(feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
HOTFIX_RE='^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
RELEASE_RE='^release/[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
EXEMPT_RE='^(main|develop|HEAD)$'

if [[ "$BRANCH" =~ $EXEMPT_RE ]]; then
    exit 0
fi

if [[ "$BRANCH" =~ $FEATURE_RE ]]; then exit 0; fi
if [[ "$BRANCH" =~ $HOTFIX_RE ]];   then exit 0; fi
if [[ "$BRANCH" =~ $RELEASE_RE ]];  then exit 0; fi

cat >&2 <<EOF
✗ Branch '$BRANCH' does not match the Git Flow convention (ADR-0028).
  Expected one of:
    <type>/<username>-<hash>-<description>   (type ∈ feat, fix, patch, docs, style,
                                              refactor, perf, test, build, ci,
                                              chore, revert; hash = 4 hex chars)
    hotfix/<username>-<hash>-<description>
    release/<major>.<minor>.<patch>[-<prerelease>]
  Exempt: main, develop, detached HEAD.
  Run: bash .github/scripts/new-branch.sh <type> <description>
EOF
exit 1

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Lint + commit**

```
feat(git-flow): add validate-branch-name.sh validator

Three prefix families per ADR-0028: <commit-type>/<user>-<hash>-<desc>,
hotfix/<user>-<hash>-<desc>, release/<semver-no-buildmeta>. Exempts main,
develop, detached HEAD. Silent on success; helpful stderr on failure.

Refs: ADR-0028

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 4: new-branch.sh + tests (Phase A.2)

**Files:**
- Create: `.github/scripts/new-branch.sh`
- Test: `tests/Shell/new_branch_test.sh`

**Interfaces:**
- Consumes: `resolve-identity.sh` (Task 2) — for username component
- Produces: `new-branch.sh <type> <description>` — for commit-types: base=develop;
  for hotfix: base=main; for release: `new-branch.sh release <semver>`,
  base=develop. Prints branch name to stdout on success.

- [ ] **Step 1: Write failing test (9 cases)**

Cases: creates feature off develop, creates hotfix off main, creates release,
invalid type fails, missing user.name fails, dirty tree rejected, hash is 4 hex,
existing collision rejected, username sanitization.

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Implement new-branch.sh**

```bash
#!/usr/bin/env bash
# $KYAULabs: new-branch.sh kyau@nova 2026/07/19 -0700 Exp $
# new-branch.sh — Generate a Git Flow branch name and create the branch.
# See ADR-0028 for naming convention.
#
# Usage:
#   new-branch.sh <type> <description>     # commit-types: base=develop
#   new-branch.sh hotfix <description>     # base=main
#   new-branch.sh release <semver>         # base=develop
#
# <type> ∈ {feat, fix, patch, docs, style, refactor, perf, test, build, ci,
#           chore, revert, hotfix, release}

set -euo pipefail

TYPE="${1:-}"
DESC="${2:-}"

if [ -z "$TYPE" ] || [ -z "$DESC" ]; then
    echo "Usage: new-branch.sh <type> <description>" >&2
    echo "  type ∈ {feat, fix, patch, docs, style, refactor, perf, test, build," >&2
    echo "          ci, chore, revert, hotfix, release}" >&2
    exit 1
fi

# Validate type and pick base branch
case "$TYPE" in
    feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)
        BASE="develop"
        ;;
    hotfix)
        BASE="main"
        ;;
    release)
        BASE="develop"
        if ! [[ "$DESC" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
            echo "✗ Invalid semver: '$DESC'" >&2
            echo "  Expected: <major>.<minor>.<patch>[-<prerelease>] (no build metadata)" >&2
            exit 1
        fi
        BRANCH="release/${DESC#v}"
        ;;
    *)
        echo "✗ Invalid type: '$TYPE'" >&2
        echo "  Allowed: feat, fix, patch, docs, style, refactor, perf, test, build," >&2
        echo "           ci, chore, revert, hotfix, release" >&2
        exit 1
        ;;
esac

# Pre-flight: working tree clean
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "✗ Working tree has uncommitted changes. Commit or stash first." >&2
    exit 1
fi

# Ensure base branch exists locally or remotely
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
    if ! git rev-parse --verify "origin/$BASE" >/dev/null 2>&1; then
        echo "✗ Base branch '$BASE' not found locally or remotely." >&2
        exit 1
    fi
    git fetch origin "$BASE"
fi

git checkout "$BASE" || { echo "✗ Failed to checkout $BASE" >&2; exit 1; }
git pull --ff-only 2>/dev/null || true

# For non-release types: resolve identity, sanitize, generate hash
if [ "$TYPE" != "release" ]; then
    REPO_ROOT=$(git rev-parse --show-toplevel)
    IDENTITY=$(bash "$REPO_ROOT/.github/scripts/resolve-identity.sh") || {
        echo "✗ Could not resolve identity (needed for username)." >&2
        exit 1
    }
    # Extract name from "Name <email>"
    NAME="${IDENTITY%% <*}"

    # Sanitize: lowercase, whitespace→-, strip non-[a-z0-9._-], collapse, trim
    USERNAME=$(echo "$NAME" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[[:space:]]+/-/g; s/[^a-z0-9._-]//g; s/-+/-/g; s/^-//; s/-$//')
    if [ -z "$USERNAME" ]; then
        USERNAME="unknown"
    fi

    HASH=$(openssl rand -hex 2)

    # Sanitize description
    DESC_CLEAN=$(echo "$DESC" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-//; s/-$//')
    if [ -z "$DESC_CLEAN" ]; then
        echo "✗ Description sanitizes to empty." >&2
        exit 1
    fi

    BRANCH="${TYPE}/${USERNAME}-${HASH}-${DESC_CLEAN}"
fi

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "✗ Branch '$BRANCH' already exists." >&2
    exit 1
fi

git checkout -b "$BRANCH" || { echo "✗ Failed to create branch '$BRANCH'" >&2; exit 1; }
echo "$BRANCH"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Lint + commit**

```
feat(git-flow): add new-branch.sh branch creator

Generates Git Flow branch names per ADR-0028: commit-types → off develop,
hotfix → off main, release → off develop. Username from resolve-identity.sh
(3-tier fallback). Hash via openssl rand -hex 2.

Refs: ADR-0028

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 5: prepare-commit-msg hook extension (Phase A.3)

**Files:**
- Modify: `.github/hooks/prepare-commit-msg` (insert branch validation block
  before final `exit 0`)
- Test: `tests/Shell/prepare_commit_msg_branch_test.sh`

**Interfaces:**
- Consumes: `validate-branch-name.sh` (Task 3)

- [ ] **Step 1: Write failing test (7 cases)**

Cases: valid branch passes, exempt main passes, exempt develop passes, invalid
branch blocked, detached head passes, amend-pushed regression, rebase skip
regression.

- [ ] **Step 2: Run test → FAIL**

- [ ] **Step 3: Modify prepare-commit-msg hook**

Insert AFTER the amend-pushed `fi` block, BEFORE the final `exit 0`:

```bash

# Validate current branch name on every commit (ADR-0028).
# Skipped for: rebase (handled above), detached HEAD, exempt branches.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")
VALIDATOR="$REPO_ROOT/.github/scripts/validate-branch-name.sh"

if [ -x "$VALIDATOR" ]; then
    if ! "$VALIDATOR"; then
        cat >&2 <<EOF
✗ Commit rejected: branch name does not match Git Flow convention.
  See ADR-0028 and run: bash .github/scripts/new-branch.sh <type> <description>
EOF
        exit 1
    fi
fi
```

- [ ] **Step 4: Run test → PASS**

- [ ] **Step 5: Run existing prepare-commit-msg regression tests**

Run: `bash tests/Shell/prepare-commit-msg_test.sh`
Expected: PASS (existing amend tests still green)

- [ ] **Step 6: Lint + commit**

```
feat(git-flow): enforce branch naming in prepare-commit-msg hook

Rejects commits on branches not matching ADR-0028 convention. Exempts main,
develop, detached HEAD. Rebase early-exit and amend-pushed logic preserved.

Refs: ADR-0028

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 6: from-issue.md + feature.md updates (Phase A.4)

**Files:**
- Modify: `.opencode/agents/from-issue.md` (line 196 + frontmatter permissions)
- Modify: `.opencode/commands/feature.md` (add branch step)

**Interfaces:**
- Consumes: `new-branch.sh` (Task 4)

- [ ] **Step 1: Update from-issue.md frontmatter permissions**

Add to bash permission block (after `"git checkout*": allow`):
```yaml
    "bash .github/scripts/new-branch.sh*": allow
    "bash .github/scripts/resolve-identity.sh*": allow
    "bash .github/scripts/validate-branch-name.sh*": allow
```

- [ ] **Step 2: Update from-issue.md line 196**

Replace:
```
1. Create the feature branch: `git checkout -b feat/<username>-<hash>-<description>`.
```
With:
```
1. Create the feature branch using the issue's classified commit type as the
   `<type>` prefix:
   `bash .github/scripts/new-branch.sh <type> <description>`
   The helper resolves the username via `resolve-identity.sh`, generates the
   hash via `openssl rand -hex 2`, and creates the branch off `develop` (or
   `main` for hotfix-type issues). See ADR-0028.
```

- [ ] **Step 3: Update feature.md**

Read current content via `@explore`, then add a branch-creation step after
brainstorming approval, before `executing-plans`. Use the new-branch.sh helper.

- [ ] **Step 4: Verify with harness validation**

Run: `bash .github/scripts/validate-harness.sh`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(harness): wire new-branch.sh into from-issue and feature

from-issue.md Step 10 now invokes new-branch.sh with the issue's classified
commit type. feature.md gains an explicit branch-creation step. Both agents
have bash permissions for the new scripts.

Refs: ADR-0028

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 7: setup.json schema bump (Phase B.1)

**Files:**
- Modify: `.opencode/setup.json` (additive: add keys, bump version)

- [ ] **Step 1: Write the new setup.json**

```json
{
  "setup_version": 4,
  "configured": true,
  "timestamp": "2026-07-06T23:44:00Z",
  "app": "template",
  "domain": "kyaulabs",
  "repo": "kyaulabs/template",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": {
    "primary": "deepseek/deepseek-v4-pro",
    "planner": "openrouter/z-ai/glm-5.2",
    "judge": "openrouter/z-ai/glm-5.2",
    "utility": "deepseek/deepseek-v4-flash"
  },
  "variants": {
    "primary": "max",
    "planner": "high",
    "judge": "medium",
    "utility": "medium"
  },
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  }
}
```

- [ ] **Step 2: Verify JSON validity**

Run: `jq . .opencode/setup.json >/dev/null && echo "valid"`

- [ ] **Step 3: Commit**

```
chore(setup): bump setup.json schema v1 → v4

Adds models, variants, experimental, accent, scaffold_mode, project_folder
keys with current defaults (absorbed from models.default.env and
experimental.default.env). Additive change — no consumer depends on new keys
yet (Phase B.2 .envrc rewrite lands next).

Refs: ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 8: .envrc rewrite + migrate-setup.sh + jq graceful degradation (Phase B.2)

**Files:**
- Modify: `.envrc` (rewrite to read setup.json via jq)
- Create: `.github/scripts/migrate-setup.sh` (v1→v4 idempotent migration)
- Modify: `.opencode/commands/doctor.md` (add jq check)

**Interfaces:**
- Produces: `.envrc` exports `OPENCODE_MODEL_*`, `OPENCODE_VARIANT_*`,
  `OPENCODE_EXPERIMENTAL_*` from setup.json. Back-compat: sources
  `~/.config/opencode/models.env` (with warning) if
  `~/.config/opencode/setup.json` absent.

- [ ] **Step 1: Write migrate-setup.sh**

```bash
#!/usr/bin/env bash
# $KYAULabs: migrate-setup.sh kyau@nova 2026/07/19 -0700 Exp $
# migrate-setup.sh — One-way v1→v4 setup.json schema migration (ADR-0029).
# Idempotent: safe to run on already-v4 files.

set -euo pipefail

SETUP="${1:-.opencode/setup.json}"

if [ ! -f "$SETUP" ]; then
    echo "✗ setup.json not found at $SETUP" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq required for migration" >&2
    exit 1
fi

CURRENT_VERSION=$(jq -r '.setup_version // 0' "$SETUP")

if [ "$CURRENT_VERSION" -ge 4 ] 2>/dev/null; then
    exit 0  # already migrated
fi

TMP=$(mktemp)
jq '
    .setup_version = 4
    | .accent = (.accent // "sky-blue")
    | .scaffold_mode = (.scaffold_mode // "skip")
    | .project_folder = (.project_folder // null)
    | .models = (.models // {
        "primary": "deepseek/deepseek-v4-pro",
        "planner": "openrouter/z-ai/glm-5.2",
        "judge": "openrouter/z-ai/glm-5.2",
        "utility": "deepseek/deepseek-v4-flash"
      })
    | .variants = (.variants // {
        "primary": "max",
        "planner": "high",
        "judge": "medium",
        "utility": "medium"
      })
    | .experimental = (.experimental // {
        "lsp_tool": true,
        "scout": true,
        "background_subagents": false
      })
' "$SETUP" > "$TMP"
mv "$TMP" "$SETUP"
echo "✓ Migrated $SETUP to setup_version 4" >&2

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Rewrite .envrc**

```bash
# $KYAULabs: .envrc kyau@nova 2026/07/19 -0700 Exp $

# .envrc — direnv entry hook for the KYAULabs harness.
#
# Sources all configuration from .opencode/setup.json (unified config per
# ADR-0029) and ~/.config/opencode/setup.json (user-level override).
#
# Prerequisites:
#   1. jq installed (apt install jq / brew install jq)
#   2. direnv shell hook (see README)
#   3. cd into project and run: direnv allow
#
# Users without direnv: add 'source /path/to/repo/.envrc' to your shell profile.

# Require jq
if ! command -v jq >/dev/null 2>&1; then
    echo "✗ jq is required by .envrc. Install via your package manager." >&2
    echo "  apt install jq  /  brew install jq  /  dnf install jq" >&2
    return 1 2>/dev/null || exit 1
fi

DIR="$(dirname "${BASH_SOURCE[0]:-$0}")"
PROJECT_SETUP="$DIR/.opencode/setup.json"
USER_SETUP="$HOME/.config/opencode/setup.json"
LEGACY_USER_ENV="$HOME/.config/opencode/models.env"

# Migrate v1 schema if needed (idempotent — no-op if already v4)
if [ -f "$PROJECT_SETUP" ]; then
    bash "$DIR/.github/scripts/migrate-setup.sh" "$PROJECT_SETUP" 2>/dev/null || true
fi

# Helper: read a top-level key with user-override precedence
setup_value() {
    local key="$1"
    local val
    val=$(jq -r ".\"$key\" // empty" "$USER_SETUP" 2>/dev/null) || val=""
    if [ -z "$val" ]; then
        val=$(jq -r ".\"$key\" // empty" "$PROJECT_SETUP" 2>/dev/null) || val=""
    fi
    echo "$val"
}

# Helper: read a nested key (parent.child) with user-override precedence
setup_nested() {
    local parent="$1" child="$2"
    local val
    val=$(jq -r ".${parent}.\"${child}\" // empty" "$USER_SETUP" 2>/dev/null) || val=""
    if [ -z "$val" ]; then
        val=$(jq -r ".${parent}.\"${child}\" // empty" "$PROJECT_SETUP" 2>/dev/null) || val=""
    fi
    echo "$val"
}

# Export model + variant env vars (consumed by opencode.jsonc {env:VAR} substitution)
export OPENCODE_MODEL_PRIMARY="$(setup_nested models primary)"
export OPENCODE_MODEL_PLANNER="$(setup_nested models planner)"
export OPENCODE_MODEL_JUDGE="$(setup_nested models judge)"
export OPENCODE_MODEL_UTILITY="$(setup_nested models utility)"

export OPENCODE_VARIANT_PRIMARY="$(setup_nested variants primary)"
export OPENCODE_VARIANT_PLANNER="$(setup_nested variants planner)"
export OPENCODE_VARIANT_JUDGE="$(setup_nested variants judge)"
export OPENCODE_VARIANT_UTILITY="$(setup_nested variants utility)"

# Export experimental flags
OPENCODE_EXPERIMENTAL_LSP_TOOL="$(setup_nested experimental lsp_tool)"
export OPENCODE_EXPERIMENTAL_LSP_TOOL
OPENCODE_EXPERIMENTAL_SCOUT="$(setup_nested experimental scout)"
export OPENCODE_EXPERIMENTAL_SCOUT
OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS="$(setup_nested experimental background_subagents)"
export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS

# Back-compat shim: legacy ~/.config/opencode/models.env (pre-ADR-0029)
if [ ! -f "$USER_SETUP" ] && [ -f "$LEGACY_USER_ENV" ]; then
    echo "⚠ Deprecated: ~/.config/opencode/models.env found. Migrate by running /setup." >&2
    echo "  Will be removed in a future release (ADR-0029)." >&2
    source "$LEGACY_USER_ENV"
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 3: Update doctor.md to check jq**

Add `jq` to the toolchain check list:
```
| jq | `jq --version` | ≥ 1.6 | JSON parsing for .envrc config sourcing (ADR-0029) |
```

- [ ] **Step 4: Manual verification**

```bash
source .envrc
echo "MODEL_PRIMARY=$OPENCODE_MODEL_PRIMARY"
echo "VARIANT_PRIMARY=$OPENCODE_VARIANT_PRIMARY"
echo "LSP_TOOL=$OPENCODE_EXPERIMENTAL_LSP_TOOL"
```
Expected: all populated with values from setup.json

- [ ] **Step 5: Lint + commit**

```
feat(config): rewrite .envrc to source from setup.json via jq

Replaces source-based .env loading with jq-parsed setup.json reads (ADR-0029).
Graceful degradation: clear error if jq absent. Auto-migrates v1 schema via
migrate-setup.sh. Back-compat shim sources legacy ~/.config/opencode/models.env
with deprecation warning.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 9: /setup + setup-substitute.sh refactor (Phase B.3-4)

**Files:**
- Modify: `.opencode/commands/setup.md` (§1, §3, §8 rewrite)
- Modify: `.github/scripts/setup-substitute.sh` (drop identity tokens #1, #3)

- [ ] **Step 1: Refactor setup.md §1 (Check for existing manifest)**

Update to detect `setup_version < 4` and call `migrate-setup.sh` before reading
values. Update reference from `models.default.env` to `setup.json` models section.

- [ ] **Step 2: Refactor setup.md §3 (Model and variant configuration)**

Replace `source .opencode/models.default.env` with `jq` reads from
`.opencode/setup.json`:
```bash
OPENCODE_MODEL_PRIMARY=$(jq -r '.models.primary' .opencode/setup.json)
# ... etc for all 8 values
```

Change write target from `~/.config/opencode/models.env` to
`~/.config/opencode/setup.json`:
```bash
mkdir -p ~/.config/opencode
jq -n \
  --arg p "$PRIMARY_MODEL" --arg pl "$PLANNER_MODEL" \
  --arg j "$JUDGE_MODEL" --arg u "$UTILITY_MODEL" \
  --arg pv "$PRIMARY_VARIANT" --arg plv "$PLANNER_VARIANT" \
  --arg jv "$JUDGE_VARIANT" --arg uv "$UTILITY_VARIANT" \
  --arg name "$NAME" --arg email "$EMAIL" \
  '{
    signed_off_by_name: $name,
    signed_off_by_email: $email,
    models: {primary: $p, planner: $pl, judge: $j, utility: $u},
    variants: {primary: $pv, planner: $plv, judge: $jv, utility: $uv}
  }' > ~/.config/opencode/setup.json
```

- [ ] **Step 3: Refactor setup.md §8 (Save manifest)**

Update the JSON template to include `models`, `variants`, `experimental` blocks
per the v4 schema from Task 7.

- [ ] **Step 4: Trim setup-substitute.sh**

Remove the identity substitution lines (token #1: `kyau <git@kyaulabs.com>`
and token #3: `git@kyaulabs.com`). Keep scaffolding tokens: `<app>`, `<domain>`,
`<username>`, `kyaulabs/template`, `git+abuse@kyaulabs.com → abuse@<domain>`.
Update token numbering.

- [ ] **Step 5: Verify harness**

Run: `bash .github/scripts/validate-harness.sh`

- [ ] **Step 6: Commit**

```
refactor(setup): write config to setup.json, trim identity tokens

/setup now writes model/variant/experimental/identity config to .opencode/setup.json
(and user-scoped fields to ~/.config/opencode/setup.json) instead of rewriting
literals across harness files. setup-substitute.sh keeps only scaffolding tokens
(<app>, <domain>, <username>, org/repo, abuse email) — drops identity tokens
(now resolved at runtime by resolve-identity.sh).

Refs: ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 10: Refactor agents + skills for dynamic identity (Phase C remainder)

**Files:**
- Modify: `.opencode/agents/tdd.md` (line 147 — Signed-off-by literal)
- Modify: `.opencode/agents/from-issue.md` (any Signed-off-by references in prose)
- Modify: `.opencode/skills/conventional-commits/SKILL.md` (3 hard-coded examples)
- Modify: `.opencode/skills/writing-plans/SKILL.md` (example commit message)

**Interfaces:**
- Consumes: `resolve-identity.sh` (Task 2)

- [ ] **Step 1: Update tdd.md**

Replace hard-coded `- Footer: Signed-off-by: kyau <git@kyaulabs.com>` (line 147)
with:
```
- Footer: Signed-off-by: <resolved via bash .github/scripts/resolve-identity.sh>
  The resolver reads setup.json (user-level then project-level), falling back
  to git config user.name/user.email. See ADR-0029.
```
Add `"bash .github/scripts/resolve-identity.sh*": allow` to the @tdd bash
permission block.

- [ ] **Step 2: Update from-issue.md prose**

Update any remaining Signed-off-by literal references to point to the resolver.

- [ ] **Step 3: Update conventional-commits/SKILL.md**

In `## Required Footers` section, replace the hard-coded default
`kyau <git@kyaulabs.com>` with:
```
**Signed-off-by** — the human user approving the change, formatted as
`Name <email>`. **Resolved dynamically** via
`bash .github/scripts/resolve-identity.sh` (3-tier fallback: user setup.json →
project setup.json → git config user.name/user.email). See ADR-0029.
```
Update all 3 example commit messages to show:
```
Signed-off-by: <resolved via resolve-identity.sh>
```

- [ ] **Step 4: Update writing-plans/SKILL.md example**

Update the example commit message footer to use the resolver pattern.

- [ ] **Step 5: Verify harness**

Run: `bash .github/scripts/validate-harness.sh`

- [ ] **Step 6: Commit**

```
refactor(identity): wire dynamic Signed-off-by across harness

Replaces hard-coded "kyau <git@kyaulabs.com>" literals in tdd.md, from-issue.md,
conventional-commits/SKILL.md, and writing-plans/SKILL.md with references to
resolve-identity.sh (3-tier fallback per ADR-0029). Agents gain bash permission
for the resolver.

Refs: ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 11: Delete legacy env files (Phase B.5)

**Files:**
- Delete: `.opencode/models.default.env`
- Delete: `.opencode/experimental.default.env`

- [ ] **Step 1: Verify no remaining references**

```bash
grep -rn "models.default.env\|experimental.default.env" \
    --include="*.md" --include="*.sh" --include="*.php" --include="*.jsonc" \
    .github/ .opencode/ tests/ AGENTS.md CONTRIBUTING.md README.md CODING_HARNESS.md \
    | grep -v "^.*adr/" | grep -v "0029"
```
Expected: only ADR-0029 (which references them historically) and other ADRs
amended in Task 1.

- [ ] **Step 2: Delete the files**

```bash
git rm .opencode/models.default.env .opencode/experimental.default.env
```

- [ ] **Step 3: Commit**

```
chore(config): remove models.default.env and experimental.default.env

Content migrated to .opencode/setup.json (models/variants/experimental keys)
in earlier tasks. .envrc now reads setup.json via jq with a back-compat shim
for legacy ~/.config/opencode/models.env. See ADR-0029.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 12: Rewrite ModelConfigTest.php + scout test (Phase B.6)

**Files:**
- Modify: `tests/Unit/Harness/ModelConfigTest.php` (rewrite 17 assertions)
- Modify: `tests/Shell/research_background_scout_test.sh` (update to assert setup.json)

- [ ] **Step 1: Rewrite ModelConfigTest.php**

For each of the 17 tests, change the data source from `models.default.env` to
`.opencode/setup.json`'s `models`/`variants` keys. Preserve test intent.

- [ ] **Step 2: Rewrite research_background_scout_test.sh**

Replace assertions that check `experimental.default.env` with assertions that
check `.opencode/setup.json` `.experimental` section.

- [ ] **Step 3: Run tests**

```bash
php vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php
bash tests/Shell/research_background_scout_test.sh
```
Expected: PASS

- [ ] **Step 4: Commit**

```
test(config): rewrite harness tests for setup.json consolidation

ModelConfigTest.php: 17 assertions now read from .opencode/setup.json
models/variants keys instead of models.default.env. Preserves test intent
(no hard-coded model IDs, all {env:VAR}, consistent naming).

research_background_scout_test.sh: asserts setup.json experimental section
instead of experimental.default.env.

Refs: ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 13: Skill naming-consistency sweep (Phase A.5)

**Files:**
- Modify: `.opencode/skills/finishing-a-development-branch/SKILL.md` (line 132)
- Modify: `.opencode/skills/writing-plans/SKILL.md` (any branch references)
- Modify: `.opencode/agents/resolve-merge-conflicts.md` (line 28)
- Modify: `.opencode/skills/conventional-commits/SKILL.md` (add Branch Naming section)

- [ ] **Step 1: Update finishing-a-development-branch/SKILL.md**

Replace `feat/<username>-<hash>-<description>` (line 132) with:
```
<type>/<username>-<hash>-<description> per ADR-0028
(type ∈ feat, fix, patch, docs, style, refactor, perf, test, build, ci,
chore, revert; plus release/<semver> and hotfix/<user>-<hash>-<desc>)
```

- [ ] **Step 2: Update resolve-merge-conflicts.md**

Replace `feat/<username>-<hash>-<description>` (line 28) with the generalized
pattern + ADR-0028 reference.

- [ ] **Step 3: Add Branch Naming section to conventional-commits/SKILL.md**

Add a new section between `## Scope` and `## Issue References`:
```
## Branch Naming

Branch names follow Conventional Commit type prefixes per ADR-0028. See
`.github/scripts/new-branch.sh` for the canonical creator and
`.github/scripts/validate-branch-name.sh` for the regex.

- `<type>/<username>-<hash>-<description>` — feature/standard work
- `hotfix/<username>-<hash>-<description>` — emergency fixes off main
- `release/<major>.<minor>.<patch>[-<prerelease>]` — release prep
```

- [ ] **Step 4: Verify harness**

Run: `bash .github/scripts/validate-harness.sh`

- [ ] **Step 5: Commit**

```
docs(git-flow): generalize branch naming across skills

Replaces feat/-only examples with <type>/-generalized pattern per ADR-0028.
Adds Branch Naming section to conventional-commits skill. Updates
finishing-a-development-branch and resolve-merge-conflicts agents.

Refs: ADR-0028

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 14: Documentation sweep (Phase D)

**Files:**
- Modify: `AGENTS.md` (§ Git Workflow, § Model Selection, § commit footers)
- Modify: `CONTRIBUTING.md` (§ We Use Git Flow)
- Modify: `.opencode/docs/model-configuration.md` (§ 1 sourcing chain, § 7 changing defaults)
- Modify: `README.md` (prereqs + model config section)
- Modify: `CODING_HARNESS.md` (model config section)
- Modify: `CONTEXT.md` (glossary entries)

- [ ] **Step 1: Update AGENTS.md § Git Workflow**

Replace:
```
- Branches: `main` (production), `develop` (integration)
- Features: `feat/<username>-<hash>-<description>`
```
With:
```
- Branches: `main` (production), `develop` (integration)
- Feature/work branches: `<type>/<username>-<hash>-<description>` per ADR-0028,
  created via `bash .github/scripts/new-branch.sh <type> <desc>`. Allowed types
  mirror commitlint vocabulary (minus `ignore`): feat, fix, patch, docs, style,
  refactor, perf, test, build, ci, chore, revert. Plus `release/<semver>` and
  `hotfix/<username>-<hash>-<description>`. Enforced by `prepare-commit-msg` hook.
```

- [ ] **Step 2: Update AGENTS.md commit footer rules**

Replace hard-coded `Signed-off-by: kyau <git@kyaulabs.com>` references with
dynamic resolver reference per ADR-0029.

- [ ] **Step 3: Update AGENTS.md Model Selection section**

Replace references to `models.default.env` with `.opencode/setup.json`'s
`models`/`variants` sections.

- [ ] **Step 4: Update CONTRIBUTING.md § We Use Git Flow**

Replace the numbered list to reference `new-branch.sh`.

- [ ] **Step 5: Update model-configuration.md**

Rewrite § 1 (sourcing chain) and § 7 (changing defaults).

- [ ] **Step 6: Update README.md**

Add `jq` to prerequisites; update model config section.

- [ ] **Step 7: Update CODING_HARNESS.md model config section**

Replace models.default.env references with setup.json.

- [ ] **Step 8: Update CONTEXT.md glossary**

Add two entries:
```
| setup.json | Canonical project configuration manifest at .opencode/setup.json. Schema versioned (setup_version field). Stores identity, scaffolding, model, variant, and experimental flag configuration. Sourced by .envrc via jq for environment variable export. |
| identity resolution order | The three-tier fallback chain for Signed-off-by identity: user-level ~/.config/opencode/setup.json → project-level .opencode/setup.json → git config user.name/user.email. Implemented by .github/scripts/resolve-identity.sh. |
```

- [ ] **Step 9: Verify harness**

Run: `bash .github/scripts/validate-harness.sh`

- [ ] **Step 10: Commit**

```
docs: update for Git Flow enforcement + setup.json consolidation

AGENTS.md: generalized branch naming, dynamic Signed-off-by, setup.json model
sourcing. CONTRIBUTING.md: new-branch.sh workflow. model-configuration.md:
rewritten sourcing chain + defaults-editing instructions. README.md: jq prereq.
CONTEXT.md: glossary entries for setup.json + identity resolution order.

Refs: ADR-0028, ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Task 15: quality-surface.manifest update

**Files:**
- Modify: `.github/scripts/quality-surface.manifest`

- [ ] **Step 1: Add the 4 new scripts to the manifest**

Add (alphabetical position within `.github/scripts/`):
```
.github/scripts/migrate-setup.sh
.github/scripts/new-branch.sh
.github/scripts/resolve-identity.sh
.github/scripts/validate-branch-name.sh
```

- [ ] **Step 2: Verify scripts have executable bit**

Run: `bash .github/scripts/check-script-executable-bits.sh`
Expected: PASS

- [ ] **Step 3: Commit**

```
chore(scaffold): ship new branch/identity/migrate scripts to quality surface

Adds migrate-setup.sh, new-branch.sh, resolve-identity.sh, validate-branch-name.sh
to quality-surface.manifest so scaffolded projects inherit Git Flow enforcement
and the setup.json config model (ADR-0026).

Refs: ADR-0026, ADR-0028, ADR-0029

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```

---

## Final verification

After all 15 tasks complete:

1. Run `/check` — php-cs-fixer + stylelint + eslint + pest --coverage (80%)
2. Run `@code-review` — multi-axis review of the full diff
3. Run `@semgrep` — SAST scan for any new vulnerabilities
4. Verify the plan's own commits used `kyau <git@kyaulabs.com>` (correct for
   the literal-default era; the dynamic resolver is for FUTURE commits, not
   this plan's own commits)

## Self-review (run before saving)

**Spec coverage:**
- ✅ Branch naming enforcement (Phase A) → Tasks 1, 3, 4, 5, 6, 13
- ✅ `release/<semver>` + `hotfix/<user>-<hash>-<desc>` prefix families → Task 3 regex, Task 4 logic
- ✅ `Signed-off-by` dynamic resolution (Phase C) → Tasks 2, 10
- ✅ setup.json consolidation (Phase B) → Tasks 7, 8, 9, 11, 12
- ✅ jq graceful degradation → Task 8
- ✅ v1→v4 schema migration → Task 8
- ✅ Back-compat for legacy `~/.config/opencode/models.env` → Task 8
- ✅ SemVer build metadata exclusion → Task 3 regex
- ✅ Username sanitization rules → Task 4
- ✅ ADR-0028 + ADR-0029 + amended ADRs → Task 1
- ✅ Glossary entries → Task 14
- ✅ /doctor jq check → Task 8

**Architect conditions addressed:** All 7 (see top of plan).

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
