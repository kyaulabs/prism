# Release Pipeline Hardening + Per-Package Versions Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Harden `release.yml` (body cap, auto-recovery, dispatch) and make `/release` bump per-package npm versions from a configurable declaration, printing — never running — the npm publish commands.

**Architecture:** The authoring half (`/release` prompt) computes per-package versions via git-cliff `--include-path`/`--tag-pattern`, bumps `package.json`, and prints npm commands; the publishing half (`release.yml`) caps the release body, auto-recovers partial tag state, tags packages via the git refs API, and opens the back-merge PR. The `.prism/release.json` file is the single source of truth between halves. ADR-0066 records the decision; ADR-0046 stays untouched (frozen).

**Tech Stack:** GitHub Actions (bash, `gh`, `jq`), git-cliff 2.13, npm, shell drift-guard tests (`tests/Shell/`).

## Global constraints

- Body budget: **120,000 bytes** (`wc -c`; bytes ≥ chars for UTF-8, conservative proxy for GitHub's **125,000-character** release-body limit).
- Version grammar: `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$` (no leading `v`).
- Merge SHA: exactly 40 lowercase hex.
- Package tag prefix: `package.json` `name` with scope stripped (`@kyaulabs/prism-core` → `prism-core`); tag shape `prefix@ver`.
- `.prism/release.json` schema: `{ "packages": ["relative/dir", …] }`; absent/empty → no per-package logic; malformed → fail closed. Discovery is **never** a hardcoded glob.
- Pipeline never runs `npm publish`, never `git push`es, never auto-merges.
- Drift guard `tests/Shell/release_workflow_test.sh` stays all-PASS after every task.
- Signed commits (`git commit -S`) with three footers (`Implemented-by`, `Tested-by`, `Signed-off-by`), `Signed-off-by` via `resolve-identity.sh`; current model `deepseek-v4-flash`.
- RCS headers / vim modelines: keep existing ones as-is on `.sh` files; no header on `.json`/`.yml`/`.md` files.

---

### Task 1: Decision record + docs (ADR-0066, CONTEXT.md, NPM.md)

**Files:**
- Create: `adr/0066-per-package-release-versions.md`
- Modify: `CONTEXT.md` (glossary entry)
- Modify: `NPM.md` (manual-publish section)

**Interfaces:**
- Produces: ADR-0066 (supersedes ADR-0046's publication-state clause), glossary term "package release", NPM.md flow describing pipeline-owned bumps/tags.

- [x] **Step 1: Write ADR-0066** following `adr/0000-template.md` (Nygard, Status Accepted, pi-era):

```markdown
# 0066. Per-Package Release Versions

Date: 2026-08-15

## Status

Accepted

Supersedes the publication-state clause of ADR-0046 for package tagging and
extends the automated release pipeline (ADR-0046) with per-package npm
versions, a workflow_dispatch recovery trigger, a release-body cap with full
changelog asset, and auto-recovery of the tag-without-Release state.
ADR-0046 remains a frozen opencode-era record; this record carries the
superseding language.

## Context

The first post-conversion release failed because the `[0.1.0]` changelog
section (143 KB) exceeded GitHub's 125,000-character release-body limit;
`gh release create` returned HTTP 422 and the workflow died. Recovery left a
tag-without-Release state that ADR-0046's four-state machine treats as a hard
error, so an idempotent rerun cannot complete the release.

Separately, npm publishing is a fully manual ceremony (NPM.md) decoupled from
the repo release: the pipeline neither bumps `packages/*/package.json` nor
creates the `prism-core@X.Y.Z`-style tags that git-cliff needs for the next
bump. Prism core and the stack adapter version in lockstep today, but the
packages are independent and should version independently.

Forces:

- GitHub rejects release bodies over 125,000 characters; oversized changelog
  sections are a first-release-after-conversion artifact and can recur.
- Partial publication state (tag exists, no Release) must self-heal on rerun;
  wrong-target tags must still fail loudly (ADR-0046).
- PR-close events are consumed once; a recovery path is needed when the event
  is gone.
- The pipeline must never push a branch, run `npm publish`, or hold registry
  credentials (2FA stays with the human) (ADR-0046, CONTEXT.md non-goals).
- Package discovery must be configurable: prism's `packages/` layout is
  prism-specific; consumers declare their own paths.
- Per-package versions must derive from each package's own history so
  unchanged packages are untouched.

## Decision

- **Configurable package declaration.** Release-managed packages are declared
  in `.prism/release.json` at the repo root: `{ "packages": ["path", …] }`.
  Absent or empty → no per-package behavior. Malformed → fail closed.
  Discovery is never a hardcoded glob. Tag prefixes derive from each
  package's `package.json` `name` with the scope stripped.
- **Per-package versions at authoring time.** `/release` computes each
  declared package's bump with
  `git-cliff --bumped-version --include-path '<pkg>/*' --tag-pattern '<prefix>@.*'`;
  a package whose computed version equals its current `package.json` version
  is skipped. Bumps land on the release branch via
  `npm version <ver> --no-git-tag-version` (the workflow never pushes).
- **Human-run npm publish.** `/release` prints `npm publish` commands for
  bumped packages (run after merge); the pipeline never executes them.
- **Package tags at merge.** `release.yml` creates `prefix@ver` tags at the
  merge SHA via the git refs API for every declared package whose version is
  untagged there, then appends a `### 📦 Packages` block to the release body.
- **Body cap + asset.** The release body is capped at 120,000 bytes (cut at a
  line boundary, footer notice) and the full changelog section is attached as
  `full-changelog-<version>.md` when truncated.
- **Auto-recovery.** Tag-exists-at-merge-SHA with no Release now creates the
  Release bound to the existing tag instead of failing.
- **Dispatch recovery.** `workflow_dispatch` inputs `version` and `merge_sha`
  (same grammar validation) let the same pipeline complete a release whose
  PR event is consumed.

## Consequences

- Releases publish regardless of changelog size; full fidelity is preserved
  as an asset.
- Package versions can diverge from each other and from the repo `vX.Y.Z`;
  consumers pin package tags, not the repo release tag.
- `npm publish` stays manual and OTP/2FA-bound; the registry flow is
  unchanged.
- The next `/release` bump never double-counts released commits because the
  pipeline creates the tags it bumps from.
- ADR-0046's no-push/no-auto-merge/no-npm invariants remain in force.

## Alternatives Considered

- **Hardcoded `packages/*` discovery** — rejected: prism's layout is
  prism-specific; consumers need a declaration.
- **CI-time bump** — rejected: the workflow never pushes; bumped versions
  must live in the reviewed merge commit.
- **Automated `npm publish` in CI** — rejected: requires registry auth/2FA
  handling, violating the human-boundary non-goal.
- **Per-package GitHub Releases** — rejected: one repo Release per event,
  listing package versions, is sufficient.
```

- [x] **Step 2: Add the glossary entry to `CONTEXT.md`**

In the Domain Glossary table (after the `wayfinder map` row), add:

```markdown
| package release | A release event that publishes the repo's GitHub Release and bumps the declared release-managed npm packages (`.prism/release.json`) to independently computed versions, tagging each; `npm publish` remains a human-run step. |
```

- [x] **Step 3: Rewrite the NPM.md manual-publish section**

Replace the "Publishing a release (manual)" section (NPM.md lines ~149–180: the lockstep bash block, the tag-shape note, and the SemVer note) with:

```markdown
## Publishing a release (manual, post-merge)

The `/release` pipeline owns version bumps and tags; humans own `npm publish`.
After the release PR merges, `release.yml` has already tagged every bumped
package (`prism-core@0.2.0`-style) at the merge SHA.

```bash
# For each bumped package printed by /release (run after the merge):
cd packages/prism-core   && npm publish --access public   # OTP prompt if 2FA on writes
cd packages/prism-php-web && npm publish --access public
```

> **Tag shape.** Package tags are `prism-core@<ver>` / `prism-php-web@<ver>` —
> never bare `v*` (that is the repo release tag from `release.yml`). The
> pipeline creates them; do not tag manually.

**Versioning while pre-1.0:** each package versions independently. Breaking
changes bump the minor (`0.2.0 → 0.3.0`); fixes/additions bump the patch
(`0.2.0 → 0.2.1`). Bumps are computed automatically per package from its own
commit history; a package with no changes is not republished.
```

- [x] **Step 4: Commit**

```bash
git add adr/0066-per-package-release-versions.md CONTEXT.md NPM.md
git commit -S -m $'docs(adr): adopt per-package release versions (ADR-0066)\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: `workflow_dispatch` trigger + unified checkout/concurrency/validation

**Files:**
- Modify: `.github/workflows/release.yml:3-34` (trigger, concurrency, job gate, env, checkout) and `:50-61` (version derivation)
- Test: `tests/Shell/release_workflow_test.sh` (assertions 2, 3, 12)

**Interfaces:**
- Produces: `inputs.merge_sha || github.event.pull_request.merge_commit_sha` (concurrency group, env `MERGE_SHA`, checkout `ref`); `workflow_dispatch` inputs `version`/`merge_sha`; `GITHUB_EVENT_NAME`-branched version derivation.

- [ ] **Step 1: Update the drift guard (Red)**

Replace guard section 2's condition with (keep its pass/fail messages updated):

```bash
# ── 2. pull_request closed/main + workflow_dispatch trigger ──────────────────

if grep -qE '^[[:space:]]*on:' "$RELEASE_FILE" && \
   grep -qE '^[[:space:]]*pull_request:' "$RELEASE_FILE" && \
   grep -qF 'types: [closed]' "$RELEASE_FILE" && \
   grep -qF 'branches: [main]' "$RELEASE_FILE" && \
   grep -qF 'workflow_dispatch:' "$RELEASE_FILE" && \
   grep -qF 'merge_sha' "$RELEASE_FILE" && \
   ! grep -qE '^[[:space:]]*push:' "$RELEASE_FILE" && \
   ! grep -qF 'pull_request_target:' "$RELEASE_FILE"; then
	pass "pull_request closed-on-main plus workflow_dispatch trigger; no push or pull_request_target"
else
	fail "trigger is not pull_request types:[closed] branches:[main] plus workflow_dispatch"
fi
```

In section 3's condition, prepend the dispatch gate:

```bash
if grep -qF "github.event_name == 'workflow_dispatch'" "$RELEASE_FILE" && \
   grep -qF 'merged == true' "$RELEASE_FILE" && \
```

Replace section 12's condition's first grep with:

```bash
if grep -qF 'release-${{ inputs.merge_sha || github.event.pull_request.merge_commit_sha }}' "$RELEASE_FILE" && \
```

- [ ] **Step 2: Run the guard — expect FAIL**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: FAIL on the updated assertions (no `workflow_dispatch:` yet, no unified concurrency key).

- [ ] **Step 3: Implement the workflow changes**

```yaml
on:
  pull_request:
    branches: [main]
    types: [closed]
  workflow_dispatch:
    inputs:
      version:
        description: Release version (X.Y.Z, optional prerelease, no leading v)
        required: true
        type: string
      merge_sha:
        description: 40-hex merge commit SHA to publish at
        required: true
        type: string

concurrency:
  group: release-${{ inputs.merge_sha || github.event.pull_request.merge_commit_sha }}
  cancel-in-progress: false
```

Job gate (line 20-23):

```yaml
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.pull_request.merged == true &&
       startsWith(github.event.pull_request.head.ref, 'release/') &&
       github.event.pull_request.head.repo.full_name == github.repository)
```

Env (line 27):

```yaml
      MERGE_SHA: ${{ inputs.merge_sha || github.event.pull_request.merge_commit_sha }}
```

Checkout ref (line 32):

```yaml
          ref: ${{ inputs.merge_sha || github.event.pull_request.merge_commit_sha }}
```

Version derivation (replace lines 50-57):

```bash
          # The version is a validated dispatch input, or branch-derived on
          # PR close: strip only the leading release/ prefix.
          if [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]; then
            version="${{ inputs.version }}"
          else
            version="${HEAD_REF#release/}"
            if [ "$version" = "$HEAD_REF" ]; then
              echo "Error: head ref is not a release branch: $HEAD_REF" >&2
              exit 1
            fi
          fi
```

- [ ] **Step 4: Run the guard — expect PASS**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: all PASS (assertions 2, 3, 12 updated; 6 and 7 still satisfied — the unified expressions contain `github.event.pull_request.merge_commit_sha` and the validation lines precede the `GITHUB_ENV` export).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml tests/Shell/release_workflow_test.sh
git commit -S -m $'ci(release): add workflow_dispatch recovery trigger\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 3: Release-body cap + full-changelog asset

**Files:**
- Modify: `.github/workflows/release.yml:114-117` (extract step tail) and `:154` (publish call)
- Test: `tests/Shell/release_workflow_test.sh` (section 8b new oversized fixture + new static pin)

**Interfaces:**
- Consumes: `VERSION` env, `body.md`/`notes.md` from extraction.
- Produces: `RELEASE_BODY_TRUNCATED` env (`yes`/`no`); `body.md` capped with footer; `notes.md` full.

- [ ] **Step 1: Add the guard sim fixture + static pin (Red)**

In section 8b, after the `blank.md` fixture, add:

```bash
# Oversized section — body must be capped with a footer; notes.md full.
cat > "$fixture_dir/oversized.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-01)
EOF
awk 'BEGIN { for (i = 1; i <= 3000; i++) print "- [Feat] filler line " i " with enough padding text to inflate the section far beyond the 120000-byte body budget" }' >> "$fixture_dir/oversized.md"
```

After the existing `blank.md` fixture run, add:

```bash
	if sim_dir=$(run_extraction_fixture "$fixture_dir/oversized.md" "1.2.3" 0); then
		if grep -qF 'truncated at GitHub' "$sim_dir/body.md"; then
			pass "oversized body is capped with the truncation footer"
		else
			fail "oversized body missing the truncation footer"
		fi
		if grep -qF 'filler line 3000' "$sim_dir/notes.md"; then
			pass "full section is preserved in notes.md for the asset"
		else
			fail "notes.md lost the tail of the full section"
		fi
		if grep -qF 'filler line 3000' "$sim_dir/body.md"; then
			fail "capped body still contains the tail beyond the budget"
		else
			pass "capped body stops at the budget boundary"
		fi
	else
		fail "oversized section extraction failed (expected rc=0)"
	fi
```

Add a static pin after section 8:

```bash
# ── 8c. Body cap + conditional asset contract ────────────────────────────────

if grep -qF 'TRUNCATE_BUDGET' "$RELEASE_FILE" && \
   grep -qF 'RELEASE_BODY_TRUNCATED' "$RELEASE_FILE" && \
   grep -qF -- '--attach' "$RELEASE_FILE" && \
   grep -qF 'full-changelog-v${VERSION}.md' "$RELEASE_FILE"; then
	pass "body cap (TRUNCATE_BUDGET), truncation flag, and conditional full-changelog asset present"
else
	fail "body-cap or asset contract violated"
fi
```

- [ ] **Step 2: Run the guard — expect FAIL**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: FAIL on the oversized fixture (extract block has no cap yet → body.md contains filler line 3000) and on the 8c static pin.

- [ ] **Step 3: Implement the cap in the extract step**

After the existing non-blank body check (line 117), append:

```bash

          # Cap the release body at GitHub's 125,000-character limit: wc -c
          # bytes >= characters for UTF-8, so a 120,000-byte budget is a
          # conservative proxy. When over budget, cut at the last line
          # boundary that fits and append a footer; notes.md keeps the full
          # section for the attached asset.
          TRUNCATE_BUDGET=120000
          if [ "$(wc -c < body.md)" -gt "$TRUNCATE_BUDGET" ]; then
            footer="

...truncated at GitHub's 125,000-character release-body limit. Full changelog attached as full-changelog-v${VERSION}.md, and in CHANGELOG.md."
            footer_bytes=$(printf '%s' "$footer" | wc -c)
            keep_budget=$((TRUNCATE_BUDGET - footer_bytes))
            : > body_capped.md
            size=0
            while IFS= read -r line; do
              line_bytes=$(printf '%s\n' "$line" | wc -c)
              if [ $((size + line_bytes)) -le "$keep_budget" ]; then
                printf '%s\n' "$line" >> body_capped.md
                size=$((size + line_bytes))
              else
                break
              fi
            done < body.md
            printf '%s\n' "$footer" >> body_capped.md
            mv body_capped.md body.md
            echo "RELEASE_BODY_TRUNCATED=yes" >> "$GITHUB_ENV"
          else
            echo "RELEASE_BODY_TRUNCATED=no" >> "$GITHUB_ENV"
          fi
```

- [ ] **Step 4: Update the publish step to use body.md + conditional asset**

In the "Publish release" step, before the state machine, add:

```bash

          attach_args=()
          if [ "${RELEASE_BODY_TRUNCATED:-no}" = "yes" ]; then
            attach_args=(--attach "notes.md#full-changelog-v${VERSION}.md")
          fi
```

Change the `gh release create` call (line 154) to:

```bash
            gh release create "v$VERSION" --target "$MERGE_SHA" --title "v$VERSION" --notes-file body.md "${attach_args[@]}"
```

- [ ] **Step 5: Run the guard — expect PASS**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: all PASS, including the oversized fixture (body capped, footer present, notes.md full) and the 8c pin.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml tests/Shell/release_workflow_test.sh
git commit -S -m $'ci(release): cap release body and attach full changelog\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 4: Auto-recovery of tag-without-Release state

**Files:**
- Modify: `.github/workflows/release.yml:151-168` (publication state machine)
- Test: `tests/Shell/release_workflow_test.sh` (section 9)

**Interfaces:**
- Consumes: `tag_exists`/`tag_commit`/`release_exists` probes.
- Produces: recovery branch — tag exists at merge SHA with no Release → `gh release create` without `--target`.

- [ ] **Step 1: Update the guard (Red)**

In section 9's condition, append the recovery-branch pins:

```bash
if grep -qF 'tag_exists' "$RELEASE_FILE" && \
   grep -qF 'release_exists' "$RELEASE_FILE" && \
   grep -qF 'git rev-parse -q --verify' "$RELEASE_FILE" && \
   grep -qF 'refs/tags/v${VERSION}^{commit}' "$RELEASE_FILE" && \
   grep -qF 'releases/tags/v$VERSION' "$RELEASE_FILE" && \
   grep -qF 'HTTP 404' "$RELEASE_FILE" && \
   grep -qF '!= "$MERGE_SHA"' "$RELEASE_FILE" && \
   grep -qF 'release_exists" = "no" ] && [ "$tag_commit" = "$MERGE_SHA"' "$RELEASE_FILE" && \
   grep -qF 'recovering' "$RELEASE_FILE" && \
   ! grep -qF 'git ls-remote' "$RELEASE_FILE" && \
   ! grep -qF 'exit 0' "$RELEASE_FILE"; then
	pass "neither/both/tag-only/bad-tag states distinguished; tag-only auto-recovers; 404 counts as absent; local lightweight-safe tag probe; no early exit before back-merge"
else
	fail "publication-state rerun logic, tag-only recovery, 404 classification, tag-probe, or early-exit contract violated"
fi
```

- [ ] **Step 2: Run the guard — expect FAIL**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: FAIL on the two new pins (`release_exists" = "no" ] && [ "$tag_commit" = "$MERGE_SHA"` and `recovering` absent).

- [ ] **Step 3: Implement the recovery branch**

Replace the state machine (lines 151-168) with:

```bash
          # Explicit publication states; the tag-only state auto-recovers
          # when the tag resolves to the merge SHA.
          if [ "$tag_exists" = "no" ] && [ "$release_exists" = "no" ]; then
            # Neither tag nor Release exists: publish at the merge SHA.
            gh release create "v$VERSION" --target "$MERGE_SHA" --title "v$VERSION" --notes-file body.md "${attach_args[@]}"
          elif [ "$tag_exists" = "yes" ] && [ "$release_exists" = "no" ] && [ "$tag_commit" = "$MERGE_SHA" ]; then
            # Tag exists at the merge SHA but no Release: recover by binding
            # the Release to the existing tag (no --target needed).
            echo "recovering: tag v$VERSION exists at the merge SHA; creating the Release"
            gh release create "v$VERSION" --title "v$VERSION" --notes-file body.md "${attach_args[@]}"
          elif [ "$tag_exists" = "yes" ] && [ "$release_exists" = "yes" ]; then
            # Both exist: an idempotent rerun is valid only when the tag
            # resolves to the recorded merge SHA.
            if [ "$tag_commit" != "$MERGE_SHA" ]; then
              echo "Error: tag v$VERSION resolves to $tag_commit, expected merge SHA $MERGE_SHA" >&2
              exit 1
            fi
            echo "release v$VERSION already exists at the merge SHA; skipping publication"
          else
            # Residual partial states (wrong-target tag, Release-only)
            # require manual recovery.
            echo "::error::partial release state for v$VERSION: tag_exists=$tag_exists release_exists=$release_exists" >&2
            echo "::error::delete or repair the stray tag/Release manually, then rerun the workflow" >&2
            exit 1
          fi
```

- [ ] **Step 4: Run the guard — expect PASS**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml tests/Shell/release_workflow_test.sh
git commit -S -m $'ci(release): auto-recover tag-without-release state\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 5: Package tags via the git refs API + Packages block + config file

**Files:**
- Create: `.prism/release.json`
- Modify: `.github/workflows/release.yml` (new "Tag release packages" step between "Extract changelog notes" and "Publish release")
- Test: `tests/Shell/release_workflow_test.sh` (new section 9c + config existence check)

**Interfaces:**
- Consumes: `.prism/release.json` from the merge-commit checkout; `MERGE_SHA`; `body.md` (post-truncation); `VERSION`.
- Produces: `prefix@ver` tags at the merge SHA; `### 📦 Packages` block appended to `body.md`.

- [ ] **Step 1: Create the config + update the guard (Red)**

Create `.prism/release.json`:

```json
{
  "packages": ["packages/prism-core", "packages/prism-php-web"]
}
```

In the guard, before section 9c, add the config existence check:

```bash
# ── 9b2. Release-package config exists and declares the two packages ─────────

PKG_CONFIG="$REPO_ROOT/.prism/release.json"
if [ -f "$PKG_CONFIG" ] && \
   grep -qF '"packages"' "$PKG_CONFIG" && \
   grep -qF 'packages/prism-core' "$PKG_CONFIG" && \
   grep -qF 'packages/prism-php-web' "$PKG_CONFIG"; then
	pass ".prism/release.json declares the release packages"
else
	fail ".prism/release.json missing or does not declare both packages"
fi
```

Add section 9c after section 9's existing checks:

```bash
# ── 9c. Package tags via the git refs API; no npm publish or git push ────────

if grep -qF '.prism/release.json' "$RELEASE_FILE" && \
   grep -qF 'git/refs' "$RELEASE_FILE" && \
   grep -qF 'gh api -X POST' "$RELEASE_FILE" && \
   grep -qF '### 📦 Packages' "$RELEASE_FILE" && \
   ! grep -qF 'npm publish' "$RELEASE_FILE" && \
   ! grep -qF 'git push' "$RELEASE_FILE"; then
	pass "package tags created via git refs API from .prism/release.json; Packages block present; no npm publish or git push"
else
	fail "package-tag or Packages-block contract violated"
fi
```

- [ ] **Step 2: Run the guard — expect FAIL**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: FAIL on 9b2/9c (config file exists → 9b2 passes; 9c fails — no `.prism/release.json` in the workflow yet).

- [ ] **Step 3: Add the "Tag release packages" step**

Insert a new step between "Extract changelog notes" and "Publish release":

```yaml
      - name: Tag release packages
        run: |
          set -euo pipefail

          # Packages are release-managed only when declared in
          # .prism/release.json at the repo root (read from the merge
          # commit): {"packages": ["relative/dir", ...]}. Malformed
          # declarations fail the release.
          config_file=".prism/release.json"
          tagged=""
          if [ -f "$config_file" ]; then
            if ! jq -e '.packages | type == "array"' "$config_file" >/dev/null 2>&1; then
              echo "::error::$config_file must contain a packages array" >&2
              exit 1
            fi
            while IFS= read -r pkg; do
              [ -n "$pkg" ] || continue
              case "$pkg" in
                /*|*..*|*" "*) echo "::error::invalid package path '$pkg' in $config_file" >&2; exit 1 ;;
              esac
              if [ ! -f "$pkg/package.json" ]; then
                echo "::error::package path '$pkg' has no package.json" >&2
                exit 1
              fi
              name=$(jq -r '.name' "$pkg/package.json")
              ver=$(jq -r '.version' "$pkg/package.json")
              case "$name" in
                ""|*" "*) echo "::error::package '$pkg' has no usable name" >&2; exit 1 ;;
              esac
              # Tag prefix: package.json name with the scope stripped.
              prefix=${name#*/}
              if git rev-parse -q --verify "refs/tags/${prefix}@${ver}^{commit}" >/dev/null 2>&1; then
                existing=$(git rev-parse "refs/tags/${prefix}@${ver}^{commit}")
                if [ "$existing" = "$MERGE_SHA" ]; then
                  echo "tag ${prefix}@${ver} already at the merge SHA; skipping"
                  continue
                fi
                echo "::error::tag ${prefix}@${ver} exists at $existing, expected merge SHA $MERGE_SHA" >&2
                exit 1
              fi
              gh api -X POST "repos/$GITHUB_REPOSITORY/git/refs" \
                -f "ref=refs/tags/${prefix}@${ver}" -f "sha=$MERGE_SHA" >/dev/null
              echo "tagged ${prefix}@${ver} at $MERGE_SHA"
              tagged="$tagged ${prefix}@${ver}"
            done <<< "$(jq -r '.packages[]' "$config_file")"
          else
            echo "no $config_file; no package tags"
          fi

          # Append the Packages block when any package was tagged. Runs
          # after the body cap, so the block always survives truncation.
          if [ -n "$tagged" ]; then
            printf '\n### 📦 Packages\n\n%s\n' "$tagged" >> body.md
          fi
```

- [ ] **Step 4: Run the guard — expect PASS**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add .prism/release.json .github/workflows/release.yml tests/Shell/release_workflow_test.sh
git commit -S -m $'ci(release): tag release packages from prism config\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 6: `/release` per-package flow + body pre-flight

**Files:**
- Modify: `packages/prism-core/prompts/release.md` (new sections + commit block + handoff)
- Test: `tests/Shell/release_workflow_test.sh` (new P23–P25 assertions)

**Interfaces:**
- Consumes: `.prism/release.json`; `CHANGELOG.md` section; package `package.json` files.
- Produces: per-package bumps on the release branch; npm publish lines in the inert handoff; oversized-section question.

- [ ] **Step 1: Update the guard (Red)**

Append after P22:

```bash
# ── P23. Config-driven per-package versions; no hardcoded glob discovery ─────

if grep -qF '.prism/release.json' "$RELEASE_CMD" && \
   grep -qF -- '--include-path' "$RELEASE_CMD" && \
   grep -qF 'npm version' "$RELEASE_CMD" && \
   grep -qF -- '--no-git-tag-version' "$RELEASE_CMD" && \
   ! grep -qE 'packages/\*' "$RELEASE_CMD"; then
	pass "P23: /release discovers packages via .prism/release.json only and bumps with npm version --no-git-tag-version"
else
	fail "P23: /release package discovery is hardcoded or the bump command is missing"
fi

# ── P24. Pipeline never runs npm publish; commands are inert text only ───────

if grep -qF 'npm publish' "$RELEASE_CMD" && \
   ! bash_block_contains "$RELEASE_CMD" 'npm publish'; then
	pass "P24: /release prints npm publish commands as inert text only, never in a bash block"
else
	fail "P24: /release npm publish command is executable or absent"
fi

# ── P25. Release-body pre-flight flags the 125,000-character limit ───────────

if grep -qE '125,?000' "$RELEASE_CMD" && \
   grep -qE '120,?000' "$RELEASE_CMD" && \
   grep -qiF 'truncat' "$RELEASE_CMD"; then
	pass "P25: /release pre-flights the changelog section against the release-body limit"
else
	fail "P25: /release body pre-flight missing"
fi
```

- [ ] **Step 2: Run the guard — expect FAIL**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: FAIL on P23–P25 (prompt unchanged so far).

- [ ] **Step 3: Add the body pre-flight to release.md**

After the "Generate the changelog" section's template-link replacement, add:

```markdown
## Pre-flight the release-body size

Measure the generated `v$VERSION` section (bytes >= characters for UTF-8, so
120,000 bytes is a conservative proxy for GitHub's 125,000-character
release-body limit). When the block below reports `oversized`, ask the human
exactly one question — proceed (on merge `release.yml` caps the body and
attaches the full changelog as `full-changelog-vX.Y.Z.md`) or abort and trim
the changelog at the source — and STOP for an explicit `yes` before
continuing.

```bash
section_bytes=$(awk -v v="[$VERSION]" '
    /^## / { if (in_sec) exit; if (index($0, v)) in_sec = 1; next }
    in_sec { print }
' CHANGELOG.md | wc -c)
if [ "$section_bytes" -gt 120000 ]; then
    echo "oversized: ${section_bytes} bytes"
fi
```
```

- [ ] **Step 4: Add the per-package version section to release.md**

Before the "Commit the changelog" section, add:

```markdown
## Compute and bump per-package versions

Release-managed packages are declared in `.prism/release.json` at the repo
root — `{ "packages": ["relative/dir", ...] }`. When the file is absent or its
`packages` array empty, skip this entire section: no per-package behavior.
When present but malformed (absolute path, `..`, whitespace, missing
`package.json`, unparseable JSON), stop the release.

For each declared package, compute its bump from commits touching that path
since its last `<prefix>@*` tag. The prefix is the package's `package.json`
`name` with the scope stripped (`@kyaulabs/prism-core` → `prism-core`). A
computed version equal to the current `package.json` version means the
package has nothing to bump — skip it entirely (no bump, no tag, no npm
command). Otherwise bump it and remember it for the commit and handoff:

```bash
# For each declared package path PKG:
PKG_NAME=$(node -e 'process.stdout.write(require(process.argv[1]).name)' "$PKG/package.json")
PKG_PREFIX=${PKG_NAME#*/}
PKG_CUR=$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$PKG/package.json")
PKG_NEXT=$(prism-tool run git-cliff -- --bumped-version --include-path "$PKG/*" --tag-pattern "${PKG_PREFIX}@.*" 2>/dev/null | sed "s/^${PKG_PREFIX}@//")
if [ "$PKG_NEXT" != "$PKG_CUR" ]; then
    (cd "$PKG" && npm version "$PKG_NEXT" --no-git-tag-version)
    BUMPED_PKGS="$BUMPED_PKGS $PKG"
fi
```

The `chore(release): vX.Y.Z` commit carries the bumped `package.json` files,
so the versions land in the merge commit.
```

- [ ] **Step 5: Update the commit block to add bumped package.json files**

In the "Commit the changelog" section, change the `git add CHANGELOG.md` line to:

```bash
git add CHANGELOG.md
for pkg in ${BUMPED_PKGS:-}; do
    git add "$pkg/package.json"
done
```

- [ ] **Step 6: Add the npm publish lines to the handoff**

In the handoff text block (after the `gh pr create` line), add the
render-per-bumped-package lines, and extend the closing statement:

```text
# After the release PR merges, publish each bumped package (release.yml
# already tagged them; npm prompts for OTP if 2FA is enabled):
#   cd <pkg> && npm publish --access public
#   (one line per bumped package; none when no package bumped)
```

- [ ] **Step 7: Run the guard — expect PASS**

Run: `bash tests/Shell/release_workflow_test.sh`
Expected: all PASS, including P13–P22 (no `read ` command added, no `git push`/`gh pr create` in bash blocks, `chore(release): v` + three-footers preserved) and P23–P25.

- [ ] **Step 8: Commit**

```bash
git add packages/prism-core/prompts/release.md tests/Shell/release_workflow_test.sh
git commit -S -m $'feat(prompts): release per-package versions with npm handoff\n\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

## Verification (end of plan)

Run: `bash tests/Shell/release_workflow_test.sh` — all PASS.
Run: `bash tests/Shell/*_test.sh` (full shell suite) — all PASS.
Run: `/check` (php-cs-fixer, stylelint, eslint, Pest ≥ 80% coverage) — green.
Run: `code-review` on the branch before push.

Then the human merges; recovery of the current 0.1.0 (dispatch with version
`0.1.0`, merge SHA `0ad9930`) is attempted after the workflow lands on `main`,
or forgoed per spec — the existing tags remain harmless.
