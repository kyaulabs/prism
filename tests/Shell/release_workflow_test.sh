#!/usr/bin/env bash
# $KYAULabs: release_workflow_test.sh kyau@aura.kyaulabs 2026/08/22 -0700 Exp $

# release_workflow_test.sh — Static drift guard for ADR-0046 release.yml
#
# Asserts the security-critical surface of .github/workflows/release.yml:
#   1. release.yml exists and the retired scaffold manifest is absent
#   2. only a pull_request closed/main trigger plus workflow_dispatch (no
#      push, no pull_request_target)
#   3. merged + release/ head + same-repository job gate
#   4. ubuntu-latest, no sudo, timeout present
#   5. job permissions exactly contents: write + pull-requests: write
#   6. every uses: is a pinned 40-hex SHA with version comment; checkout
#      pins v7, the event merge SHA, fetch-depth 0, persist-credentials false
#   7. branch-derived version regex and 40-hex merge-SHA validation happen
#      before VERSION reaches GITHUB_ENV; checked-out HEAD equals MERGE_SHA
#   8. notes extraction recognizes the real cliff.toml heading (the exact
#      markdown label [$VERSION] anywhere in a "## " line), captures the
#      heading plus body up to the next "## ", requires exactly one section,
#      and fails when the body has no non-whitespace line
#   9. rerun logic distinguishes neither/both/tag-only/bad-tag states, auto-
#      recovers tag-without-Release at the merge SHA, probes the tag locally
#      with git rev-parse (lightweight- and annotated-tag safe), verifies it
#      resolves to the merge SHA, and never exits before back-merge handling
#  10. publication is gh release create with --target/--title/--notes-file;
#      the workflow runs no git cliff, no git push, no auto-merge
#  11. back-merge checks an existing open PR and develop...main, then opens
#      gh pr create --base develop --head main; no || true or
#      continue-on-error masks API failures
#  12. concurrency is release-specific with cancel-in-progress: false
#
# Plus the P13–P22 /release authoring contract (ADR-0046): the local command
# authors the release PR from clean synchronized develop with git-cliff 2.0+,
# and contains no local tag/Release/back-merge operation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=tests/Shell/lib/test_helpers.sh
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

if ! command -v jq >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1 || \
   ! node -e "require('js-yaml')" 2>/dev/null; then
	fail "node + js-yaml + jq are required for release workflow validation"
	exit 1
fi

RELEASE_FILE="$REPO_ROOT/.github/workflows/release.yml"
CANONICAL_RELEASE_FILE="$REPO_ROOT/packages/prism-core/config/release.yml"
MANIFEST="$REPO_ROOT/.github/scripts/quality-surface.manifest"

# ── 1. release.yml exists and retired scaffold manifest is absent ────────────

if [ -f "$RELEASE_FILE" ]; then
	pass "release.yml exists"
else
	fail "release.yml missing at $RELEASE_FILE"
fi

if [ ! -e "$MANIFEST" ]; then
	pass "retired quality-surface.manifest is absent"
else
	fail "quality-surface.manifest should be retired"
fi

# ── 1b. Workflow is syntactically valid YAML ────────────────────────────────

if node -e '
	const fs = require("node:fs");
	const yaml = require("js-yaml");
	yaml.load(fs.readFileSync(process.argv[1], "utf8"));
' "$RELEASE_FILE" >/dev/null 2>&1; then
	pass "release.yml is syntactically valid YAML"
else
	fail "release.yml is not syntactically valid YAML"
fi

if [ -f "$CANONICAL_RELEASE_FILE" ] && \
   cmp -s "$RELEASE_FILE" "$CANONICAL_RELEASE_FILE" && \
   head -5 "$RELEASE_FILE" | grep -qF '# prism-managed: @kyaulabs/prism-core' && \
   head -5 "$RELEASE_FILE" | grep -qF '# prism-release-schema: 1'; then
	pass "installed workflow is ownership-marked and byte-identical to the Core template"
else
	fail "installed workflow is not ownership-marked or differs from the Core template"
fi

# ── 2. pull_request closed/main + workflow_dispatch trigger ──────────────────

if grep -qE '^[[:space:]]*on:' "$RELEASE_FILE" && \
   grep -qE '^[[:space:]]*pull_request:' "$RELEASE_FILE" && \
   grep -qF 'types: [closed]' "$RELEASE_FILE" && \
   grep -qF 'branches: [main]' "$RELEASE_FILE" && \
   grep -qF 'workflow_dispatch:' "$RELEASE_FILE" && \
   grep -qE 'merge_sha:' "$RELEASE_FILE" && \
   ! grep -qE '^[[:space:]]*push:' "$RELEASE_FILE" && \
   ! grep -qF 'pull_request_target:' "$RELEASE_FILE"; then
	pass "pull_request closed-on-main plus workflow_dispatch trigger; no push or pull_request_target"
else
	fail "trigger is not pull_request types:[closed] branches:[main] plus workflow_dispatch"
fi

# ── 3. merged + release/ head + same-repository job gate ─────────────────────

if grep -qF "github.event_name == 'workflow_dispatch'" "$RELEASE_FILE" && \
   grep -qF 'merged == true' "$RELEASE_FILE" && \
   grep -qF "startsWith(github.event.pull_request.head.ref, 'release/')" "$RELEASE_FILE" && \
   grep -qF 'github.event.pull_request.head.repo.full_name == github.repository' "$RELEASE_FILE"; then
	pass "job gate requires dispatch, merged release/ head, and same-repository ownership"
else
	fail "job gate missing merged == true, startsWith release/, or same-repo check"
fi

# ── 4. ubuntu-latest, no sudo, timeout ───────────────────────────────────────

if grep -qF 'runs-on: ubuntu-latest' "$RELEASE_FILE" && \
   grep -qE '^[[:space:]]*timeout-minutes:' "$RELEASE_FILE"; then
	pass "runs on ubuntu-latest with a timeout"
else
	fail "runs-on is not ubuntu-latest or timeout-minutes missing"
fi

sudo_matches=$(grep -nE '\bsudo\b' "$RELEASE_FILE" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*#' || true)
if [ -z "$sudo_matches" ]; then
	pass "no sudo invocation on non-comment lines"
else
	echo "$sudo_matches" >&2
	fail "workflow-source sudo found"
fi

# ── 5. Job permissions exactly contents: write + pull-requests: write ────────

perm_blocks=$(grep -cE '^[[:space:]]*permissions:' "$RELEASE_FILE" 2>/dev/null || true)
perm_entries=$(grep -oE '^[[:space:]]+(actions|attestations|checks|contents|deployments|discussions|id-token|issues|metadata|models|packages|pages|pull-requests|security-events|statuses): (write|read|none)' "$RELEASE_FILE" 2>/dev/null || true)
perm_count=$(printf '%s\n' "$perm_entries" | grep -c . || true)
if [ "${perm_blocks:-0}" -eq 1 ] && [ "${perm_count:-0}" -eq 2 ] && \
   printf '%s\n' "$perm_entries" | grep -qF 'contents: write' && \
   printf '%s\n' "$perm_entries" | grep -qF 'pull-requests: write'; then
	pass "job permissions are exactly contents: write and pull-requests: write"
else
	fail "permissions are not exactly contents: write + pull-requests: write (blocks=$perm_blocks entries=$perm_count)"
fi

# ── 6. Pinned actions; checkout pins v7 at the merge SHA with full history ───

bad_uses=0
if [ -f "$RELEASE_FILE" ]; then
	while IFS= read -r line; do
		case "$line" in
			*uses:*)
				if ! printf '%s\n' "$line" | grep -qE 'uses: [A-Za-z0-9/._-]+@[0-9a-f]{40} # v[0-9]+'; then
					bad_uses=1
					echo "      unpinned uses line: $line" >&2
				fi
				;;
		esac
	done < "$RELEASE_FILE"
fi

if [ "$bad_uses" -eq 0 ] && \
   grep -qF 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7' "$RELEASE_FILE" && \
   grep -qF 'github.event.pull_request.merge_commit_sha' "$RELEASE_FILE" && \
   grep -qF 'fetch-depth: 0' "$RELEASE_FILE" && \
   grep -qF 'persist-credentials: false' "$RELEASE_FILE"; then
	pass "actions pinned; checkout v7 at the event merge SHA with full history and no persisted credentials"
else
	fail "uses pinning or checkout contract violated"
fi

# ── 7. Version and merge-SHA validation precede GITHUB_ENV export ────────────

regex_line=$(grep -nF 'const semver = /^(?:0|[1-9][0-9]*)' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
sha_line=$(grep -nF '^[0-9a-f]{40}$' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
env_line=$(grep -nF '>> "$GITHUB_ENV"' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
head_line=$(grep -nF 'git rev-parse HEAD' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)

if [ -n "$regex_line" ] && [ -n "$sha_line" ] && [ -n "$env_line" ] && [ -n "$head_line" ] && \
   [ "$regex_line" -lt "$env_line" ] && [ "$sha_line" -lt "$env_line" ] && [ "$head_line" -lt "$env_line" ]; then
	pass "version regex and 40-hex merge-SHA validation and HEAD==MERGE_SHA check precede VERSION export"
else
	fail "validation order broken: version regex, merge-SHA check, or HEAD check not before GITHUB_ENV export"
fi

# ── 8. Notes extraction: real cliff.toml heading label, exact-one, non-blank body ──

notes_writes=$(grep -cF -- '>> notes.md' "$RELEASE_FILE" 2>/dev/null || true)
if grep -qF 'CHANGELOG.md' "$RELEASE_FILE" && \
   grep -qF -- '"## "*)' "$RELEASE_FILE" && \
   grep -qF -- 'grep -qF "[$VERSION]"' "$RELEASE_FILE" && \
   grep -qF 'match_count=$((match_count + 1))' "$RELEASE_FILE" && \
   grep -qF -- '-ne 1' "$RELEASE_FILE" && \
   grep -qF -- "grep -q '[^[:space:]]' body.md" "$RELEASE_FILE" && \
   [ "${notes_writes:-0}" -ge 2 ]; then
	pass "extraction scans every ## heading for the [\$VERSION] label, captures heading plus body into notes.md, requires exactly one section and a non-whitespace body"
else
	fail "notes extraction contract violated (label scan, heading capture, count check, or body check)"
fi

# ── 8b. Executable simulation: extraction against the real cliff.toml shape ───
# Runs the actual "Extract changelog notes" run block from release.yml against
# fixture changelogs whose headings use the cliff.toml template
# "## [💾](.../releases/tag/vX) [X](.../compare/...) - (date)".

# extract_run_block <workflow> <step-name> — print the literal contents of the
# named step's `run: |` key; exit non-zero if the step or run block is absent.
extract_run_block() {
	local workflow="$1" step_name="$2" found
	found=$(awk -v want="$step_name" '
		/^      - name: / {
			step = $0
			sub(/^      - name: /, "", step)
			if (step == want) { in_target = 1; next }
			if (in_target) { exit }
			next
		}
		in_target && /^        run: \|/ { capture = 1; next }
		capture { print }
	' "$workflow") || return 1
	[ -n "$found" ] || return 1
	printf '%s\n' "$found"
}

extract_step_if() {
	local workflow="$1" step_name="$2"
	node -e '
		const fs = require("node:fs");
		const yaml = require("js-yaml");
		const workflow = yaml.load(fs.readFileSync(process.argv[1], "utf8"));
		const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
		const step = steps.find(({name}) => name === process.argv[2]);
		if (!step || typeof step.if !== "string") process.exit(1);
		process.stdout.write(step.if);
	' "$workflow" "$step_name"
}

validate_workflow_graph() {
	local workflow="$1"
	node -e '
		const fs = require("node:fs");
		const yaml = require("js-yaml");
		const workflow = yaml.load(fs.readFileSync(process.argv[1], "utf8"));
		const jobs = Object.values(workflow.jobs);
		if (jobs.length !== 1) process.exit(1);
		const job = jobs[0];
		if (job.needs !== undefined || job["continue-on-error"] !== undefined) process.exit(1);
		const names = job.steps.map(({name}) => name).filter(Boolean);
		const ordered = [
			"Validate merge SHA and release version",
			"Prepare package release metadata",
			"Publish release",
			"Reconcile package tags",
			"Open back-merge PR",
		];
		let prior = -1;
		for (const name of ordered) {
			const index = names.indexOf(name);
			if (index <= prior) process.exit(1);
			prior = index;
		}
		if (job.steps.some((step) => step["continue-on-error"] !== undefined)) process.exit(1);
		const validate = job.steps.find(({name}) => name === "Validate merge SHA and release version");
		const publish = job.steps.find(({name}) => name === "Publish release");
		const reconcile = job.steps.find(({name}) => name === "Reconcile package tags");
		if (validate.id !== "validate" || publish.if !== undefined || reconcile.if !== undefined) process.exit(1);
		const backmerge = job.steps.find(({name}) => name === "Open back-merge PR");
		const quote = String.fromCharCode(39);
		const expected = "${{ always() && steps.validate.outcome == " + quote + "success" + quote + " }}";
		if (backmerge.if !== expected) process.exit(1);
	' "$workflow"
}

# run_extraction_fixture <varname> <fixture> <version> <expected-rc> — copy
# the fixture into a fresh registered temp dir as CHANGELOG.md, execute the
# workflow's extraction run block with VERSION set, and compare the exit
# status. Sets <varname> in the CALLER's shell to the sim dir path (for
# notes.md inspection); returns 1 on mismatch. Must be called directly, never
# via command substitution (a subshell's register_temp_dir() is lost — issue
# #322 class). The caller variable must not be named 'path'.
run_extraction_fixture() {
	local var="$1" fixture="$2" version="$3" expect_rc="$4" path rc
	path=$(mktemp -d)
	register_temp_dir "$path"
	cp "$fixture" "$path/CHANGELOG.md"
	(
		cd "$path" || exit 1
		VERSION="$version" bash -c "$extract_block" >/dev/null 2>&1
	)
	rc=$?
	if [ "$rc" -ne "$expect_rc" ]; then
		return 1
	fi
	printf -v "$var" '%s' "$path"
}

fixture_dir=$(mktemp -d)
register_temp_dir "$fixture_dir"
sim_dir=""  # assigned by run_extraction_fixture via printf -v

# Real cliff.toml heading shape (v1.2.3 matching, v1.1.0 following).
cat > "$fixture_dir/real.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-01)

### Features

- [Feat] add release automation ([abc1234](https://github.com/kyaulabs/template/commit/abc1234))

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.1.0) [1.1.0](https://github.com/kyaulabs/template/compare/v1.0.0...v1.1.0) - (2026-07-01)

### Fixes

- [Fix] repair back-merge ([deadbeef](https://github.com/kyaulabs/template/commit/deadbeef))
EOF

# Plain "## [X.Y.Z] - date" heading (previous release-era shape).
cat > "$fixture_dir/plain.md" <<'EOF'
# Changelog

## [1.2.3] - 2026-08-01

### Features

- [Feat] add release automation ([abc1234](https://github.com/kyaulabs/template/commit/abc1234))

## [1.1.0] - 2026-07-01

### Fixes

- [Fix] repair back-merge ([deadbeef](https://github.com/kyaulabs/template/commit/deadbeef))
EOF

# Two [1.2.3] sections — must fail.
cat > "$fixture_dir/dup.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-01)

### Features

- [Feat] first ([abc1234](https://github.com/kyaulabs/template/commit/abc1234))

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-02)

### Fixes

- [Fix] second ([def4567](https://github.com/kyaulabs/template/commit/def4567))
EOF

# No [1.2.3] section — must fail.
cat > "$fixture_dir/missing.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.1.0) [1.1.0](https://github.com/kyaulabs/template/compare/v1.0.0...v1.1.0) - (2026-07-01)

### Fixes

- [Fix] repair back-merge ([deadbeef](https://github.com/kyaulabs/template/commit/deadbeef))
EOF

# Matching heading followed only by blank lines — must fail on body check.
cat > "$fixture_dir/blank.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-01)

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.1.0) [1.1.0](https://github.com/kyaulabs/template/compare/v1.0.0...v1.1.0) - (2026-07-01)

### Fixes

- [Fix] repair back-merge ([deadbeef](https://github.com/kyaulabs/template/commit/deadbeef))
EOF

# Oversized section — body must be capped with a footer; notes.md full.
cat > "$fixture_dir/oversized.md" <<'EOF'
# Changelog

## [💾](https://github.com/kyaulabs/template/releases/tag/v1.2.3) [1.2.3](https://github.com/kyaulabs/template/compare/v1.1.0...v1.2.3) - (2026-08-01)
EOF
awk 'BEGIN { for (i = 1; i <= 3000; i++) print "- [Feat] filler line " i " with enough padding text to inflate the section far beyond the 120000-byte body budget" }' >> "$fixture_dir/oversized.md"

if extract_block=$(extract_run_block "$RELEASE_FILE" "Extract changelog notes"); then
	if run_extraction_fixture sim_dir "$fixture_dir/real.md" "1.2.3" 0; then
		pass "real cliff.toml heading section is found by the extraction run block"
		if grep -qF '## [💾]' "$sim_dir/notes.md"; then
			pass "real cliff.toml heading captured into notes.md"
		else
			fail "real cliff.toml heading missing from notes.md"
		fi
		if grep -qF '[Feat] add release automation' "$sim_dir/notes.md"; then
			pass "heading body captured after the heading"
		else
			fail "heading body missing from notes.md"
		fi
		if grep -qF 'releases/tag/v1.1.0' "$sim_dir/notes.md"; then
			fail "capture leaked the next section into notes.md"
		else
			pass "capture stops at the next ## heading"
		fi
	else
		fail "real cliff.toml heading section was not found (expected rc=0)"
	fi
	if run_extraction_fixture sim_dir "$fixture_dir/plain.md" "1.2.3" 0; then
		if grep -qF '## [1.2.3] - 2026-08-01' "$sim_dir/notes.md"; then
			pass "plain ## [X.Y.Z] heading captured into notes.md"
		else
			fail "plain heading missing from notes.md"
		fi
	else
		fail "plain ## [X.Y.Z] heading section was not found (expected rc=0)"
	fi
	if run_extraction_fixture sim_dir "$fixture_dir/dup.md" "1.2.3" 1; then
		pass "duplicate [\$VERSION] sections fail extraction"
	else
		fail "duplicate [\$VERSION] sections did not fail extraction"
	fi
	if run_extraction_fixture sim_dir "$fixture_dir/missing.md" "1.2.3" 1; then
		pass "missing [\$VERSION] section fails extraction"
	else
		fail "missing [\$VERSION] section did not fail extraction"
	fi
	if run_extraction_fixture sim_dir "$fixture_dir/blank.md" "1.2.3" 1; then
		pass "heading with only whitespace body fails extraction"
	else
		fail "whitespace-only section body did not fail extraction"
	fi
	if run_extraction_fixture sim_dir "$fixture_dir/oversized.md" "1.2.3" 0; then
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
else
	fail "could not extract the changelog-extraction run block from release.yml"
fi

# ── 8c. Body cap + conditional asset contract ────────────────────────────────

if grep -qF 'TRUNCATE_BUDGET' "$RELEASE_FILE" && \
   grep -qF 'RELEASE_BODY_TRUNCATED' "$RELEASE_FILE" && \
   grep -qF -- '--attach' "$RELEASE_FILE" && \
   grep -qF 'full-changelog-v${VERSION}.md' "$RELEASE_FILE"; then
	pass "body cap (TRUNCATE_BUDGET), truncation flag, and conditional full-changelog asset present"
else
	fail "body-cap or asset contract violated"
fi

if grep -qF "printf '%s' \"\$footer\" >> body_capped.md" "$RELEASE_FILE"; then
	pass "truncation footer stays inside the exact release-body byte budget"
else
	fail "truncation footer appends an unbudgeted byte"
fi

# ── 9. Rerun states: local rev-parse tag probe, four states, no early exit ───

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

# ── 9b. Executable simulation: local tag probe handles lightweight and annotated ──
# gh release create produces a lightweight tag, which git ls-remote's "^{}"
# peeled-ref probe cannot see. git rev-parse on "refs/tags/vX^{commit}" resolves
# both tag kinds from the full-depth checkout with no remote access.

tag_repo=$(mktemp -d)
register_temp_dir "$tag_repo"
git_init_test_repo "$tag_repo"
(
	cd "$tag_repo" || exit 1
	echo "content" > file.txt
	git add file.txt
	git commit --quiet -m "fixture commit"
	git tag v1.2.3
	git tag --annotate v2.0.0 --message "annotated tag"
	printf '%s' "$(git rev-parse HEAD)"
) > "$fixture_dir/commit_sha" 2>&1

tag_commit_sha=$(cat "$fixture_dir/commit_sha")

if [ "$(git -C "$tag_repo" rev-parse -q --verify "refs/tags/v1.2.3^{commit}")" = "$tag_commit_sha" ]; then
	pass "lightweight tag resolves to its commit via local rev-parse"
else
	fail "lightweight tag did not resolve via local rev-parse"
fi

if [ "$(git -C "$tag_repo" rev-parse -q --verify "refs/tags/v2.0.0^{commit}")" = "$tag_commit_sha" ]; then
	pass "annotated tag resolves to its commit via local rev-parse"
else
	fail "annotated tag did not resolve via local rev-parse"
fi

if git -C "$tag_repo" rev-parse -q --verify "refs/tags/v9.9.9^{commit}" >/dev/null 2>&1; then
	fail "missing tag unexpectedly resolved via local rev-parse"
else
	pass "missing tag fails the local rev-parse probe (partial-state path reachable)"
fi

# The two resolve checks above prove tag_commit equals the recorded merge SHA
# for both tag kinds, which is the precondition of the workflow's both-exist
# idempotent state; the wrong-target guard '!= "$MERGE_SHA"' stays pinned.

# ── 9c. Package tags via the git refs API; no npm publish or git push ────────

PKG_CONFIG="$REPO_ROOT/.prism/release.json"
if [ -f "$PKG_CONFIG" ] && \
   jq -e '.schemaVersion == 1 and .managedBy == "@kyaulabs/prism-core" and .versionPolicy == "lockstep" and .packages == ["packages/prism-core", "packages/prism-php-web"]' "$PKG_CONFIG" >/dev/null && \
   [ "$(jq -r 'keys | sort | join(",")' "$PKG_CONFIG")" = "managedBy,packages,schemaVersion,versionPolicy" ]; then
	pass "9c: .prism/release.json is the exact owned lockstep configuration"
else
	fail "9c: .prism/release.json is not the exact owned lockstep configuration"
fi

prepare_line=$(grep -nF -- '- name: Prepare package release metadata' "$RELEASE_FILE" | cut -d: -f1)
publish_line=$(grep -nF -- '- name: Publish release' "$RELEASE_FILE" | cut -d: -f1)
reconcile_line=$(grep -nF -- '- name: Reconcile package tags' "$RELEASE_FILE" | cut -d: -f1)
prepare_contract_block=$(extract_run_block "$RELEASE_FILE" "Prepare package release metadata")
reconcile_contract_block=$(extract_run_block "$RELEASE_FILE" "Reconcile package tags")
if grep -qF '.prism/release.json' <<< "$prepare_contract_block" && \
   grep -qF 'git/refs' <<< "$reconcile_contract_block" && \
   grep -qF 'gh api -X POST' <<< "$reconcile_contract_block" && \
   grep -qF '### 📦 Packages' <<< "$prepare_contract_block" && \
   [ "$prepare_line" -lt "$publish_line" ] && \
   [ "$publish_line" -lt "$reconcile_line" ] && \
   ! grep -qF 'npm publish' "$RELEASE_FILE" && \
   ! grep -qF 'git push' "$RELEASE_FILE"; then
	pass "package metadata precedes repository publication, which precedes package tags; no npm publish or git push"
else
	fail "package preparation/publication/tag ordering contract violated"
fi

backmerge_guard=$(extract_step_if "$RELEASE_FILE" "Open back-merge PR")
if [ "$backmerge_guard" = "\${{ always() && steps.validate.outcome == 'success' }}" ] && \
   grep -qF 'id: validate' "$RELEASE_FILE" && validate_workflow_graph "$RELEASE_FILE"; then
	pass "back-merge remains reachable after publication or package-tag failure once merge validation succeeds"
else
	fail "back-merge is not guarded by always() and successful merge validation"
fi
if [[ "$backmerge_guard" == *"steps.validate.outcome == 'success'"* ]]; then
	pass "back-merge is not scheduled when merge validation fails"
else
	fail "back-merge lacks an explicit successful-validation outcome guard"
fi
workflow_schedules_backmerge() {
	[ "$backmerge_guard" = "\${{ always() && steps.validate.outcome == 'success' }}" ] && [ "$1" = "success" ]
}

# ── 9d. Executable package metadata validation ──────────────────────────────

package_sim=$(mktemp -d)
register_temp_dir "$package_sim"
mkdir -p "$package_sim/.prism" "$package_sim/packages/example"
printf 'reviewed notes\n' > "$package_sim/body.md"
printf '%s\n' '{"schemaVersion":1,"managedBy":"@kyaulabs/prism-core","versionPolicy":"lockstep","packages":["packages/example"]}' > "$package_sim/.prism/release.json"
printf '%s\n' '{"name":"@fixture/example","version":"1.2.3"}' > "$package_sim/packages/example/package.json"

if package_prepare_block=$(extract_run_block "$RELEASE_FILE" "Prepare package release metadata"); then
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	) && grep -qF $'example\t@fixture/example\tpackages/example\t1.2.3' "$package_sim/.prism-package-tags.tsv" && \
	   grep -qF -- '- example@1.2.3' "$package_sim/body.md"; then
		pass "schema-v1 package metadata validates and prepares inert tags and notes"
	else
		fail "schema-v1 package metadata preparation failed"
	fi

	printf 'reviewed notes\n' > "$package_sim/body.md"
	printf '%s\n' '{"name":"-fixture","version":"1.2.3"}' > "$package_sim/packages/example/package.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "invalid package name reached tag preparation"
	else
		pass "package metadata rejects invalid npm package names"
	fi
	printf '%s\n' '{"name":123,"version":"1.2.3"}' > "$package_sim/packages/example/package.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "non-string package name reached tag preparation"
	else
		pass "package metadata rejects non-string names"
	fi
	printf '%s\n' '{"name":"@fixture/example","version":"1.2.3"}' > "$package_sim/packages/example/package.json"

	traversal_sim=$(mktemp -d)
	register_temp_dir "$traversal_sim"
	mkdir -p "$traversal_sim/project/.prism"
	printf 'reviewed notes\n' > "$traversal_sim/project/body.md"
	printf '%s\n' '{"name":"@fixture/outside","version":"1.2.3"}' > "$traversal_sim/package.json"
	printf '%s\n' '{"schemaVersion":1,"managedBy":"@kyaulabs/prism-core","versionPolicy":"lockstep","packages":[".."]}' > "$traversal_sim/project/.prism/release.json"
	if (
		cd "$traversal_sim/project" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "exact parent traversal package path was accepted"
	else
		pass "exact parent traversal package path is rejected"
	fi

	node -e 'process.stdout.write("x".repeat(119980) + "\n")' > "$package_sim/body.md"
	{
		printf '## [1.2.3]\n'
		cat "$package_sim/body.md"
	} > "$package_sim/notes.md"
	: > "$package_sim/github-env"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request GITHUB_ENV="$package_sim/github-env" bash -c "$package_prepare_block" >/dev/null 2>&1
	) && [ "$(wc -c < "$package_sim/body.md")" -le 120000 ] && \
	   grep -qF '### 📦 Packages' "$package_sim/body.md" && \
	   grep -qF 'Full changelog attached' "$package_sim/body.md"; then
		pass "package metadata remains inside the capped release body"
	else
		fail "package metadata can push the release body beyond its cap"
	fi

	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 RELEASE_BODY_TRUNCATED=yes GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	) && [ "$(grep -cF "...truncated at GitHub's 125,000-character release-body limit." "$package_sim/body.md")" -eq 1 ]; then
		pass "package-note recapping emits one truncation footer"
	else
		fail "package-note recapping duplicated the truncation footer"
	fi

	node -e 'process.stdout.write("first actual changelog line\n" + "x".repeat(119960) + "\n")' > "$package_sim/body.md"
	cp "$package_sim/body.md" "$package_sim/notes.md"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request GITHUB_ENV="$package_sim/github-env" bash -c "$package_prepare_block" >/dev/null 2>&1
	) && grep -qF 'first actual changelog line' "$package_sim/body.md"; then
		pass "package-note truncation preserves a body without a release heading"
	else
		fail "package-note truncation dropped the first body line"
	fi

	printf 'reviewed notes\n' > "$package_sim/body.md"
	printf '%s\n' '{"name":"@fixture/example","version":"1.2.2"}' > "$package_sim/packages/example/package.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "package/repository version mismatch did not fail"
	else
		pass "package/repository version mismatch fails before publication"
	fi

	printf '%s\n' '{"name":"@fixture/example","version":"1.2.3"}' > "$package_sim/packages/example/package.json"
	printf '%s\n' '{"packages":["packages/example"]}' > "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		pass "dispatch accepts the exact legacy packages-only recovery shape"
	else
		fail "dispatch rejected the exact legacy packages-only recovery shape"
	fi
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=pull_request bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "pull-request publication accepted legacy package configuration"
	else
		pass "pull-request publication rejects legacy package configuration"
	fi

	printf '%s\n' '{"schemaVersion":1,"managedBy":"other","versionPolicy":"lockstep","packages":["packages/example"]}' > "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "unowned package configuration was accepted"
	else
		pass "malformed or unowned package configuration is rejected"
	fi

	mkdir -p "$package_sim/1"
	printf '%s\n' '{"name":"@fixture/numeric","version":"1.2.3"}' > "$package_sim/1/package.json"
	printf '%s\n' '{"schemaVersion":1,"managedBy":"@kyaulabs/prism-core","versionPolicy":"lockstep","packages":[1]}' > "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "non-string package configuration entry was accepted"
	else
		pass "non-string package configuration entries are rejected by schema validation"
	fi

	tab_package=$'packages/tab\tpkg'
	mkdir -p "$package_sim/$tab_package"
	printf '%s\n' '{"name":"@fixture/tabbed","version":"1.2.3"}' > "$package_sim/$tab_package/package.json"
	node -e 'const fs=require("node:fs");fs.writeFileSync(process.argv[1],JSON.stringify({schemaVersion:1,managedBy:"@kyaulabs/prism-core",versionPolicy:"lockstep",packages:["packages/tab\tpkg"]})+"\n")' "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "control character in package path was accepted"
	else
		pass "control characters in package paths are rejected before TSV serialization"
	fi

	printf '%s\n' '{"name":"@fixture/bad..tag","version":"1.2.3"}' > "$package_sim/packages/example/package.json"
	printf '%s\n' '{"schemaVersion":1,"managedBy":"@kyaulabs/prism-core","versionPolicy":"lockstep","packages":["packages/example"]}' > "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "invalid Git package tag prefix was accepted"
	else
		pass "invalid Git package tag prefixes are rejected before publication"
	fi

	rm "$package_sim/.prism/release.json"
	printf 'reviewed notes\n' > "$package_sim/body.md"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	) && [ ! -s "$package_sim/.prism-package-tags.tsv" ] && \
	   ! grep -qF '### 📦 Packages' "$package_sim/body.md"; then
		pass "absent configuration remains repository-only for historical recovery"
	else
		fail "absent configuration did not remain repository-only"
	fi

	ln -s missing-release.json "$package_sim/.prism/release.json"
	if (
		cd "$package_sim" || exit 1
		VERSION=1.2.3 GITHUB_EVENT_NAME=workflow_dispatch bash -c "$package_prepare_block" >/dev/null 2>&1
	); then
		fail "dangling release configuration symlink was treated as absent"
	else
		pass "dangling release configuration symlink is rejected"
	fi
	rm "$package_sim/.prism/release.json"
else
	fail "could not extract package metadata preparation block"
fi

# ── 9e. Executable package-tag reconciliation states ────────────────────────

tag_sim=$(mktemp -d)
register_temp_dir "$tag_sim"
git_init_test_repo "$tag_sim"
printf 'first\n' > "$tag_sim/file.txt"
git -C "$tag_sim" add file.txt
git -C "$tag_sim" commit --quiet -m first
first_sha=$(git -C "$tag_sim" rev-parse HEAD)
printf 'second\n' >> "$tag_sim/file.txt"
git -C "$tag_sim" add file.txt
git -C "$tag_sim" commit --quiet -m second
merge_sha=$(git -C "$tag_sim" rev-parse HEAD)
printf '%s\n' $'example\t@fixture/example\tpackages/example\t1.2.3' > "$tag_sim/.prism-package-tags.tsv"
mkdir -p "$tag_sim/bin"
cat > "$tag_sim/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
case "${GH_MODE:-normal}:$*" in
  race:api*-X\ POST*git/refs*|wrongrace:api*-X\ POST*git/refs*) : > "$GH_STATE"; exit 1 ;;
  race:api*git/ref/tags/example@1.2.3*|wrongrace:api*git/ref/tags/example@1.2.3*)
    if [ -f "$GH_STATE" ]; then printf '%s\n' '{"object":{"sha":"concurrent"}}'; else printf '%s\n' 'HTTP/2 404 Not Found' >&2; exit 1; fi
    ;;
  race:api*commits/example@1.2.3*) printf '%s\n' "$MERGE_SHA" ;;
  wrongrace:api*commits/example@1.2.3*) printf '%s\n' "$WRONG_SHA" ;;
  normal:api*git/ref/tags/example@1.2.3*) printf '%s\n' 'HTTP/2 404 Not Found' >&2; exit 1 ;;
  normal:api*-X\ POST*git/refs*) exit 0 ;;
  *) exit 127 ;;
esac
EOF
chmod +x "$tag_sim/bin/gh"
: > "$tag_sim/gh.log"

if package_reconcile_block=$(extract_run_block "$RELEASE_FILE" "Reconcile package tags"); then
	if (
		cd "$tag_sim" || exit 1
		PATH="$tag_sim/bin:$PATH" GH_LOG="$tag_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	) && grep -qF "api -X POST repos/fixture/repo/git/refs -f ref=refs/tags/example@1.2.3 -f sha=$merge_sha" "$tag_sim/gh.log"; then
		pass "absent package tag is created at the merge SHA"
	else
		fail "absent package tag was not created"
	fi

	: > "$tag_sim/gh.log"
	if (
		cd "$tag_sim" || exit 1
		PATH="$tag_sim/bin:$PATH" GH_MODE=race GH_STATE="$tag_sim/race-created" GH_LOG="$tag_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	) && grep -qF 'api -X POST repos/fixture/repo/git/refs' "$tag_sim/gh.log" && \
	   grep -qF 'api --include repos/fixture/repo/git/ref/tags/example@1.2.3' "$tag_sim/gh.log"; then
		pass "concurrent same-target package tag creation is reconciled"
	else
		fail "concurrent same-target package tag creation was not reconciled"
	fi

	rm -f "$tag_sim/race-created"
	if (
		cd "$tag_sim" || exit 1
		PATH="$tag_sim/bin:$PATH" GH_MODE=wrongrace GH_STATE="$tag_sim/race-created" WRONG_SHA="$first_sha" GH_LOG="$tag_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	); then
		fail "concurrent wrong-target package tag creation was accepted"
	else
		pass "concurrent wrong-target package tag creation is rejected"
	fi

	git -C "$tag_sim" tag example@1.2.3 "$merge_sha"
	: > "$tag_sim/gh.log"
	if (
		cd "$tag_sim" || exit 1
		PATH="$tag_sim/bin:$PATH" GH_LOG="$tag_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	) && [ ! -s "$tag_sim/gh.log" ]; then
		pass "package tag already at the merge SHA is idempotently skipped"
	else
		fail "same-target package tag was not idempotently skipped"
	fi

	git -C "$tag_sim" tag -d example@1.2.3 >/dev/null
	git -C "$tag_sim" tag example@1.2.3 "$first_sha"
	if (
		cd "$tag_sim" || exit 1
		PATH="$tag_sim/bin:$PATH" GH_LOG="$tag_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	); then
		fail "wrong-target package tag did not fail"
	else
		pass "wrong-target package tag fails without moving or deleting it"
	fi
else
	fail "could not extract package-tag reconciliation block"
fi

# The executable sequence must publish the repository Release before it
# creates any package ref.
order_sim=$(mktemp -d)
register_temp_dir "$order_sim"
git_init_test_repo "$order_sim"
printf 'release\n' > "$order_sim/file.txt"
git -C "$order_sim" add file.txt
git -C "$order_sim" commit --quiet -m release
order_sha=$(git -C "$order_sim" rev-parse HEAD)
printf 'notes\n' > "$order_sim/body.md"
printf 'notes\n' > "$order_sim/notes.md"
printf '%s\n' $'example\t@fixture/example\tpackages/example\t1.2.3' > "$order_sim/.prism-package-tags.tsv"
mkdir -p "$order_sim/bin"
cat > "$order_sim/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
case "$*" in
  api*releases/tags*) printf '%s\n' 'HTTP 404' >&2; exit 1 ;;
  api*git/ref/tags*) printf '%s\n' 'HTTP/2 404 Not Found' >&2; exit 1 ;;
  release\ create*) exit 0 ;;
  api*-X\ POST*git/refs*) exit 0 ;;
  *) exit 127 ;;
esac
EOF
chmod +x "$order_sim/bin/gh"
: > "$order_sim/gh.log"
if publish_order_block=$(extract_run_block "$RELEASE_FILE" "Publish release") && \
   reconcile_order_block=$(extract_run_block "$RELEASE_FILE" "Reconcile package tags") && (
	cd "$order_sim" || exit 1
	PATH="$order_sim/bin:$PATH" GH_LOG="$order_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$order_sha" VERSION=1.2.3 RELEASE_BODY_TRUNCATED=no bash -c "$publish_order_block"
	PATH="$order_sim/bin:$PATH" GH_LOG="$order_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$order_sha" bash -c "$reconcile_order_block"
) >/dev/null 2>&1; then
	release_log_line=$(grep -nF 'release create v1.2.3' "$order_sim/gh.log" | cut -d: -f1)
	package_log_line=$(grep -nF 'git/refs' "$order_sim/gh.log" | cut -d: -f1)
	if [ -n "$release_log_line" ] && [ -n "$package_log_line" ] && [ "$release_log_line" -lt "$package_log_line" ]; then
		pass "fake-gh execution publishes the repository Release before package refs"
	else
		fail "fake-gh log did not record repository-first publication"
	fi
else
	fail "repository-first fake-gh execution failed"
fi

# A failed publication or package-tag reconciliation must still execute the
# back-merge block selected by the workflow's always() guard.
failure_sim=$(mktemp -d)
register_temp_dir "$failure_sim"
git_init_test_repo "$failure_sim"
printf 'release\n' > "$failure_sim/file.txt"
git -C "$failure_sim" add file.txt
git -C "$failure_sim" commit --quiet -m release
failure_sha=$(git -C "$failure_sim" rev-parse HEAD)
printf 'notes\n' > "$failure_sim/body.md"
printf 'notes\n' > "$failure_sim/notes.md"
mkdir -p "$failure_sim/bin"
cat > "$failure_sim/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\t%s\n' "$GH_MODE" "$*" >> "$GH_LOG"
case "$GH_MODE:$*" in
  publish:api*releases/tags*) printf '%s\n' 'HTTP 500' >&2; exit 1 ;;
  tag:api*git/ref/tags*) printf '%s\n' 'HTTP/2 404 Not Found' >&2; exit 1 ;;
  tag:api*-X\ POST*git/refs*) printf '%s\n' 'HTTP 500' >&2; exit 1 ;;
  backmerge:api*compare*) printf '%s\n' '1' ;;
  backmerge:pr\ list*) exit 0 ;;
  backmerge:pr\ create*) printf '%s\n' 'https://example.invalid/pr/1' ;;
  *) exit 127 ;;
esac
EOF
chmod +x "$failure_sim/bin/gh"
: > "$failure_sim/gh.log"

if failure_publish_block=$(extract_run_block "$RELEASE_FILE" "Publish release") && \
   failure_backmerge_block=$(extract_run_block "$RELEASE_FILE" "Open back-merge PR"); then
	if (
		cd "$failure_sim" || exit 1
		PATH="$failure_sim/bin:$PATH" GH_MODE=publish GH_LOG="$failure_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$failure_sha" VERSION=1.2.3 RELEASE_BODY_TRUNCATED=no bash -c "$failure_publish_block" >/dev/null 2>&1
	); then
		fail "forced repository publication failure unexpectedly succeeded"
	elif workflow_schedules_backmerge success && (
		cd "$failure_sim" || exit 1
		PATH="$failure_sim/bin:$PATH" GH_MODE=backmerge GH_LOG="$failure_sim/gh.log" GITHUB_REPOSITORY=fixture/repo VERSION=1.2.3 bash -c "$failure_backmerge_block" >/dev/null 2>&1
	) && grep -qF $'backmerge\tapi repos/fixture/repo/compare/develop...main' "$failure_sim/gh.log" && \
	   grep -qF $'backmerge\tpr create' "$failure_sim/gh.log"; then
		pass "back-merge executes after a forced repository publication failure"
	else
		fail "back-merge did not execute after repository publication failure"
	fi

	: > "$failure_sim/gh.log"
	git -C "$tag_sim" tag -d example@1.2.3 >/dev/null
	if (
		cd "$tag_sim" || exit 1
		PATH="$failure_sim/bin:$PATH" GH_MODE=tag GH_LOG="$failure_sim/gh.log" GITHUB_REPOSITORY=fixture/repo MERGE_SHA="$merge_sha" bash -c "$package_reconcile_block" >/dev/null 2>&1
	); then
		fail "forced package-tag failure unexpectedly succeeded"
	elif workflow_schedules_backmerge success && (
		cd "$tag_sim" || exit 1
		PATH="$failure_sim/bin:$PATH" GH_MODE=backmerge GH_LOG="$failure_sim/gh.log" GITHUB_REPOSITORY=fixture/repo VERSION=1.2.3 bash -c "$failure_backmerge_block" >/dev/null 2>&1
	) && grep -qF $'backmerge\tapi repos/fixture/repo/compare/develop...main' "$failure_sim/gh.log" && \
	   grep -qF $'backmerge\tpr create' "$failure_sim/gh.log"; then
		pass "back-merge executes after a forced package-tag failure"
	else
		fail "back-merge did not execute after package-tag failure"
	fi
else
	fail "could not extract publication and back-merge failure simulation blocks"
fi

# ── 10. gh release create with target/title/notes-file; no cliff/push/auto-merge ──

if grep -qF 'gh release create' "$RELEASE_FILE" && \
   grep -qF -- '--target' "$RELEASE_FILE" && \
   grep -qF -- '--title' "$RELEASE_FILE" && \
   grep -qF -- '--notes-file' "$RELEASE_FILE" && \
   ! grep -qF 'git cliff' "$RELEASE_FILE" && \
   ! grep -qF 'git push' "$RELEASE_FILE" && \
   ! grep -qF 'gh pr merge' "$RELEASE_FILE" && \
   ! grep -qF -- '--auto-merge' "$RELEASE_FILE"; then
	pass "publication is gh release create with --target/--title/--notes-file; no git cliff, git push, or auto-merge"
else
	fail "publication command or forbidden-tool contract violated"
fi

# ── 11. Back-merge: existing-PR check, develop...main compare, no masking ────

if grep -qF 'gh pr list' "$RELEASE_FILE" && \
   grep -qF 'develop...main' "$RELEASE_FILE" && \
   grep -qF 'gh pr create' "$RELEASE_FILE" && \
   grep -qF -- '--base develop --head main' "$RELEASE_FILE" && \
   ! grep -qF '|| true' "$RELEASE_FILE" && \
   ! grep -qF 'continue-on-error' "$RELEASE_FILE"; then
	pass "back-merge checks existing PR and develop...main, opens base-develop/head-main PR, no failure masking"
else
	fail "back-merge handling or failure-masking contract violated"
fi

# ── 12. Release-specific concurrency, no cancellation ────────────────────────

if grep -qF 'release-${{ inputs.merge_sha || github.event.pull_request.merge_commit_sha }}' "$RELEASE_FILE" && \
   grep -qF 'cancel-in-progress: false' "$RELEASE_FILE"; then
	pass "concurrency is release-specific (unified merge-SHA key) with cancel-in-progress: false"
else
	fail "concurrency is not release-specific or cancels in-flight runs"
fi

# ── P13–P22. /release authoring contract (ADR-0046) ──────────────────────────
# The local command authors the release PR; release.yml publishes. These
# assertions pin the pi release prompt to the authoring half.

RELEASE_CMD="$REPO_ROOT/packages/prism-core/prompts/release.md"
SETUP_CMD="$REPO_ROOT/packages/prism-core/prompts/setup.md"

# ── P12a. /setup manages package releases before adapter detection ──────────

inspect_line=$(grep -nF 'prism-tool package-release inspect --json' "$SETUP_CMD" | cut -d: -f1 || true)
adapter_line=$(grep -nF '## 6. Detect and offer the project adapter' "$SETUP_CMD" | cut -d: -f1 || true)
package_release_section=$(awk '/^## 5[.] Managed npm package releases$/{capture=1} /^## 6[.] Detect and offer the project adapter$/{capture=0} capture' "$SETUP_CMD")
if [ -n "$inspect_line" ] && [ -n "$adapter_line" ] && [ "$inspect_line" -lt "$adapter_line" ] && \
   grep -qF 'prism-tool package-release plan --json' <<< "$package_release_section" && \
   grep -qF 'prism-tool package-release apply --plan=/validated/project-local/plan.json --approval=yes --json' <<< "$package_release_section" && \
   grep -qF 'prism-tool package-release verify --json' <<< "$package_release_section" && \
   grep -qF 'Enable lockstep npm package releases for these packages? (yes/no)' <<< "$package_release_section" && \
   grep -qF 'CREATE' <<< "$package_release_section" && \
   grep -qF 'UNCHANGED' <<< "$package_release_section" && \
   grep -qF 'UPDATE' <<< "$package_release_section" && \
   grep -qF 'MIGRATE' <<< "$package_release_section" && \
   grep -qF 'CONFLICT' <<< "$package_release_section" && \
   grep -qF 'display every exact `name`, `path`, and `version`' <<< "$package_release_section" && \
   grep -qF 'display the complete returned diff' <<< "$package_release_section" && \
   grep -qF 'A decline runs no plan or apply operation' <<< "$package_release_section" && \
   grep -qF 'never removes an installed' <<< "$package_release_section" && \
   grep -qF 'package releases      project' "$SETUP_CMD" && \
   grep -qF '.prism/release.json' <<< "$package_release_section" && \
   grep -qF '.github/workflows/release.yml' <<< "$package_release_section" && \
   ! grep -qiF 'php-web' <<< "$package_release_section" && \
   ! grep -qiF 'adapter' <<< "$package_release_section"; then
	pass "P12a: /setup manages lockstep package releases independently before adapter detection"
else
	fail "P12a: /setup package-release orchestration is missing, ordered incorrectly, or adapter-coupled"
fi

# ── P13. Pre-flight stops on a dirty tree ────────────────────────────────────

if grep -qF 'git status --porcelain' "$RELEASE_CMD" && grep -qF 'Commit or stash' "$RELEASE_CMD"; then
	pass "P13: /release stops on a dirty working tree"
else
	fail "P13: /release does not stop on a dirty working tree"
fi

# ── P14. Pre-flight requires synchronized develop containing latest main ────

if grep -qF 'git branch --show-current' "$RELEASE_CMD" && \
   grep -qF 'git fetch origin develop main --tags' "$RELEASE_CMD" && \
   grep -qF 'git rev-parse origin/develop' "$RELEASE_CMD" && \
   grep -qF 'git merge-base --is-ancestor origin/main HEAD' "$RELEASE_CMD" && \
   grep -qF 'main' "$RELEASE_CMD" && \
   grep -qF 'back-merge PR' "$RELEASE_CMD"; then
	pass "P14: /release requires synchronized develop containing the latest main"
else
	fail "P14: /release missing develop synchronization or stale-main pre-flight checks"
fi

# ── P15. git-cliff 2.0+ required; missing tool points to /doctor ─────────────

if grep -qF 'prism-tool run git-cliff -- --version' "$RELEASE_CMD" && \
   grep -F -A1 'Parse the returned version as inert data. Validate that its major component is' "$RELEASE_CMD" \
       | grep -qF 'an integer at least 2. If the major component is below 2, stop' && \
   grep -qF '/doctor' "$RELEASE_CMD"; then
	pass "P15: /release requires git-cliff 2.0+ and points to /doctor"
else
	fail "P15: /release does not require git-cliff 2.0+ or lacks the /doctor pointer"
fi

# ── P16. No manual changelog fallback ────────────────────────────────────────

if ! grep -qiF 'fall back' "$RELEASE_CMD"; then
	pass "P16: /release offers no manual changelog fallback"
else
	fail "P16: /release still offers a manual fallback that cannot produce CHANGELOG.md"
fi

# ── P17. Tagged/tagless proposal paths; no shell read prompt ─────────────────

if grep -qF 'prism-tool run git-cliff -- --bumped-version' "$RELEASE_CMD" && \
   grep -qF 'no prior release tag' "$RELEASE_CMD" && \
   grep -qF 'initial version' "$RELEASE_CMD" && \
   grep -qF 'prism-tool resolve scripts' "$RELEASE_CMD" && \
   grep -qF 'bash /absolute/resolved/scripts/new-branch.sh release X.Y.Z' "$RELEASE_CMD" && \
   ! grep -qF 'new-branch.sh release vX.Y.Z' "$RELEASE_CMD" && \
   ! grep -qE '(^|[^[:alpha:]])read[[:space:]]+' "$RELEASE_CMD"; then
	pass "P17: /release proposes via prism-tool run git-cliff --bumped-version on tagged repos, requests the initial version when tagless, and uses no shell read prompt"
else
	fail "P17: /release proposal-path, tagless-initial-version, no-shell-read, or no-v branch contract violated"
fi

# ── P17b. Agent-level one-question-at-a-time gates and halt semantics ────────

if grep -qiF 'exactly one question' "$RELEASE_CMD" && \
   grep -qiF 'stop and wait' "$RELEASE_CMD" && \
   grep -qiF 'stop until the user' "$RELEASE_CMD"; then
	pass "P17b: /release asks one question per turn at the conversation level and halts for the reply and for final approval"
else
	fail "P17b: /release missing agent-level one-question or halt semantics"
fi

# ── P18. Changelog generation ────────────────────────────────────────────────

if grep -qF 'prism-tool run git-cliff -- --tag "v' "$RELEASE_CMD" && grep -qF -- '--output CHANGELOG.md' "$RELEASE_CMD"; then
	pass "P18: /release generates CHANGELOG.md with prism-tool run git-cliff --tag \"vX.Y.Z\" --output CHANGELOG.md"
else
	fail "P18: /release missing prism-tool run git-cliff --tag vX.Y.Z --output CHANGELOG.md"
fi

# ── P19. Repo identity and portable template-link replacement ────────────────

if grep -qF 'gh repo view --json nameWithOwner -q .nameWithOwner' "$RELEASE_CMD" && \
   grep -qF 'kyaulabs/template' "$RELEASE_CMD" && \
   grep -qF 'mkdir -p .pi/tmp' "$RELEASE_CMD" && \
   grep -qF 'set -C' "$RELEASE_CMD" && \
   grep -qF '.pi/tmp/release-changelog.tmp &&' "$RELEASE_CMD" && \
   grep -qF 'mv .pi/tmp/release-changelog.tmp CHANGELOG.md' "$RELEASE_CMD" && \
   ! grep -qF 'sed -i' "$RELEASE_CMD"; then
	pass "P19: /release resolves the repo via gh repo view and replaces kyaulabs/template links with stable temp file + sed + mv (no sed -i)"
else
	fail "P19: /release repo-identity or portable link-replacement contract violated"
fi

# bash_block_contains <file> <regex> — exit 0 when any ```bash code block in
# <file> contains a line matching the ERE <regex>; exit 1 otherwise.
bash_block_contains() {
	awk -v re="$2" '
		/^```bash/ { in_block = 1; next }
		/^```/ && in_block { in_block = 0; next }
		in_block && $0 ~ re { found = 1; exit }
		END { exit found ? 0 : 1 }
	' "$1"
}

# bash_block_count <file> <regex> — count matching lines inside ```bash blocks.
bash_block_count() {
	awk -v re="$2" '
		/^```bash/ { in_block = 1; next }
		/^```/ && in_block { in_block = 0; next }
		in_block && $0 ~ re { count += 1 }
		END { print count + 0 }
	' "$1"
}

# bash_block_is_single_command <file> <regex> — exit 0 when one ```bash block
# contains exactly one nonblank line and that line matches the ERE <regex>.
bash_block_is_single_command() {
	awk -v re="$2" '
		/^```bash/ { in_block = 1; count = 0; matched = 0; next }
		/^```/ && in_block {
			if (count == 1 && matched == 1) found = 1
			in_block = 0
			next
		}
		in_block && $0 !~ /^[[:space:]]*$/ {
			count += 1
			if ($0 ~ re) matched += 1
		}
		END { exit found ? 0 : 1 }
	' "$1"
}

# ── P20. Launcher-owned signed chore(release) commit ───────────────────────

if [ "$(bash_block_count "$RELEASE_CMD" '^[[:space:]]*prism-tool commit create')" -eq 1 ] && \
   bash_block_is_single_command "$RELEASE_CMD" \
   '^[[:space:]]*prism-tool commit create --type chore --scope release --subject vX[.]Y[.]Z[[:space:]]*$' && \
   ! grep -qF 'prism-tool commit prepare' "$RELEASE_CMD" && \
   ! grep -qF 'prism-tool commit apply' "$RELEASE_CMD" && \
   ! grep -qF 'prism-tool commit discard' "$RELEASE_CMD" && \
   ! grep -qF -- '--plan' "$RELEASE_CMD" && \
   ! grep -qiF 'exact commit message' "$RELEASE_CMD" && \
   ! grep -qiF 'commit approval' "$RELEASE_CMD" && \
   ! grep -qE '^[[:space:]]*git commit([[:space:]]|$)' "$RELEASE_CMD" && \
   ! grep -qF 'resolve-identity.sh' "$RELEASE_CMD" && \
   ! grep -qF 'resolve-ocr-model.sh' "$RELEASE_CMD"; then
	pass "P20: /release creates one approval-free signed chore(release) commit through prism-tool"
else
	fail "P20: /release atomic launcher-owned commit contract violated"
fi

# ── P20b. Tracking-issue argument contract ($ARGUMENTS, validated) ───────────

if grep -qF '$ARGUMENTS' "$RELEASE_CMD" && \
   grep -qF '^#?[1-9][0-9]*$' "$RELEASE_CMD" && \
   grep -qF 'Refs: #NN' "$RELEASE_CMD" && \
   ! grep -qF '$1' "$RELEASE_CMD" && \
   ! grep -qF '#281' "$RELEASE_CMD" && \
   ! grep -qE 'Refs: [0-9]' "$RELEASE_CMD" && \
   ! bash_block_contains "$RELEASE_CMD" '\$ARGUMENTS'; then
	pass "P20b: /release consumes the issue via \$ARGUMENTS with ^#?[1-9][0-9]*\$ validation, emits exactly Refs: #NN, and keeps raw \$ARGUMENTS out of shell blocks"
else
	fail "P20b: /release tracking-issue argument contract violated"
fi

# ── P20c. Validated issue digits become inert launcher argv ─────────────────

if grep -qF 'RELEASE_ISSUE_DIGITS' "$RELEASE_CMD" && \
   grep -qF -- '--refs NN' "$RELEASE_CMD" && \
   grep -qF 'render the validated digits as a literal' "$RELEASE_CMD" && \
   ! bash_block_contains "$RELEASE_CMD" '\$RELEASE_ISSUE_DIGITS'; then
	pass "P20c: validated issue digits are rendered as literal --refs argv without shell expansion"
else
	fail "P20c: release issue reference is not carried as validated literal launcher argv"
fi

# ── P21. Handoff renders inert text — never a runnable bash block ────────────

if grep -qF '```text' "$RELEASE_CMD" && \
   grep -qF 'git push -u origin release/X.Y.Z' "$RELEASE_CMD" && \
   grep -qF 'gh pr create --base main --head release/X.Y.Z' "$RELEASE_CMD" && \
   grep -qiF 'do not execute' "$RELEASE_CMD" && \
   ! bash_block_contains "$RELEASE_CMD" 'git push|gh pr create'; then
	pass "P21: /release renders the handoff as an inert text template (release/X.Y.Z) with no runnable bash block containing the push or PR commands"
else
	fail "P21: /release handoff is a runnable bash block or missing the inert text template"
fi

# ── P22. No local tag, Release, direct protected push, or back-merge PR ──────

if ! grep -qF 'git tag -s' "$RELEASE_CMD" && \
   ! grep -qF 'gh release create' "$RELEASE_CMD" && \
   ! grep -qE 'git push origin (main|develop)' "$RELEASE_CMD" && \
   ! grep -qF -- '--base develop --head main' "$RELEASE_CMD"; then
	pass "P22: /release contains no local tag, Release, direct protected push, or back-merge creation"
else
	fail "P22: /release still contains local tag/publication/back-merge operations"
fi

# ── P23. Configured package versions are authored in repository lockstep ─────

if grep -qF '.prism/release.json' "$RELEASE_CMD" && \
   grep -qF '"managedBy": "@kyaulabs/prism-core"' "$RELEASE_CMD" && \
   grep -qF '"versionPolicy": "lockstep"' "$RELEASE_CMD" && \
   grep -qF 'npm --prefix PACKAGE_DIRECTORY version X.Y.Z --no-git-tag-version' "$RELEASE_CMD" && \
   grep -qF 'git add PACKAGE_DIRECTORY/package.json' "$RELEASE_CMD" && \
   grep -qiF 'repository-only' "$RELEASE_CMD" && \
   ! grep -qF -- '--include-path' "$RELEASE_CMD" && \
   ! grep -qF -- '--tag-pattern' "$RELEASE_CMD" && \
   ! grep -qF 'PACKAGE_PREFIX@.*' "$RELEASE_CMD" && \
   ! grep -qF 'NEXT_VERSION' "$RELEASE_CMD" && \
   ! grep -qF 'BUMPED_PKGS' "$RELEASE_CMD" && \
   ! grep -qiF 'bumped packages' "$RELEASE_CMD" && \
   ! grep -qE 'packages/\*' "$RELEASE_CMD"; then
	pass "P23: /release authors every configured package at the repository version"
else
	fail "P23: /release retains independent package versions or lacks lockstep authoring"
fi

# ── P24. Every configured package gets one inert human publish command ───────

if grep -qF 'cd PACKAGE_DIRECTORY && npm publish --access public' "$RELEASE_CMD" && \
   grep -qF 'one literal line per configured package' "$RELEASE_CMD" && \
   grep -qF 'For a repository-only release, print no npm command.' "$RELEASE_CMD" && \
   grep -qF 'tags every configured' "$RELEASE_CMD" && \
   ! bash_block_contains "$RELEASE_CMD" 'npm publish'; then
	pass "P24: /release prints one inert publish command per configured package"
else
	fail "P24: /release package publication handoff is incomplete or executable"
fi

# ── P25. Release-body pre-flight flags the 125,000-character limit ───────────

if grep -qE '125,?000' "$RELEASE_CMD" && \
   grep -qE '120,?000' "$RELEASE_CMD" && \
   grep -qiF 'truncat' "$RELEASE_CMD"; then
	pass "P25: /release pre-flights the changelog section against the release-body limit"
else
	fail "P25: /release body pre-flight missing"
fi

print_summary "release_workflow"

# vim: ft=sh sts=4 sw=4 ts=4 et :
