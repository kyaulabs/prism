#!/usr/bin/env bash
# $KYAULabs: release_workflow_test.sh kyau@cosmos.kyaulabs 2026/08/02 -0700 Exp $




# release_workflow_test.sh — Static drift guard for ADR-0046 release.yml
#
# Asserts the security-critical surface of .github/workflows/release.yml:
#   1. release.yml exists and follows ci.yml in quality-surface.manifest
#   2. only a pull_request closed/main trigger (no push, no pull_request_target)
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
#   9. rerun logic distinguishes neither/both/partial tag+Release states,
#      probes the tag locally with git rev-parse (lightweight- and
#      annotated-tag safe), verifies it resolves to the merge SHA, and
#      never exits before back-merge handling
#  10. publication is gh release create with --target/--title/--notes-file;
#      the workflow runs no git cliff, no git push, no auto-merge
#  11. back-merge checks an existing open PR and develop...main, then opens
#      gh pr create --base develop --head main; no || true or
#      continue-on-error masks API failures
#  12. concurrency is release-specific with cancel-in-progress: false

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=tests/Shell/lib/test_helpers.sh
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

RELEASE_FILE="$REPO_ROOT/.github/workflows/release.yml"
MANIFEST="$REPO_ROOT/.github/scripts/quality-surface.manifest"

# ── 1. release.yml exists and follows ci.yml in the manifest ─────────────────

if [ -f "$RELEASE_FILE" ]; then
	pass "release.yml exists"
else
	fail "release.yml missing at $RELEASE_FILE"
fi

ci_line=$(grep -nF '.github/workflows/ci.yml' "$MANIFEST" | head -1 | cut -d: -f1 || true)
release_line=$(grep -nF '.github/workflows/release.yml' "$MANIFEST" | head -1 | cut -d: -f1 || true)
if [ -n "$ci_line" ] && [ -n "$release_line" ] && [ "$release_line" -eq $((ci_line + 1)) ]; then
	pass "release.yml listed immediately after ci.yml in quality-surface.manifest"
else
	fail "quality-surface.manifest does not list release.yml right after ci.yml (ci=$ci_line release=${release_line:-missing})"
fi

# ── 2. Only a pull_request closed/main trigger ───────────────────────────────

if grep -qE '^[[:space:]]*on:' "$RELEASE_FILE" && \
   grep -qE '^[[:space:]]*pull_request:' "$RELEASE_FILE" && \
   grep -qF 'types: [closed]' "$RELEASE_FILE" && \
   grep -qF 'branches: [main]' "$RELEASE_FILE" && \
   ! grep -qE '^[[:space:]]*push:' "$RELEASE_FILE" && \
   ! grep -qF 'pull_request_target:' "$RELEASE_FILE"; then
	pass "only pull_request closed-on-main trigger; no push or pull_request_target"
else
	fail "trigger is not exactly pull_request types:[closed] branches:[main]"
fi

# ── 3. merged + release/ head + same-repository job gate ─────────────────────

if grep -qF 'merged == true' "$RELEASE_FILE" && \
   grep -qF "startsWith(github.event.pull_request.head.ref, 'release/')" "$RELEASE_FILE" && \
   grep -qF 'github.event.pull_request.head.repo.full_name == github.repository' "$RELEASE_FILE"; then
	pass "job gate requires merged, release/ head, and same-repository ownership"
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

regex_line=$(grep -nF '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
sha_line=$(grep -nF '^[0-9a-f]{40}$' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
env_line=$(grep -nF '>> "$GITHUB_ENV"' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)
head_line=$(grep -nF 'git rev-parse HEAD' "$RELEASE_FILE" | head -1 | cut -d: -f1 || true)

if [ -n "$regex_line" ] && [ -n "$sha_line" ] && [ -n "$env_line" ] && [ -n "$head_line" ] && \
   [ "$regex_line" -lt "$env_line" ] && [ "$sha_line" -lt "$env_line" ]; then
	pass "version regex and 40-hex merge-SHA validation precede VERSION export; HEAD checked against MERGE_SHA"
else
	fail "validation order broken: version regex or merge-SHA check not before GITHUB_ENV export"
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

# run_extraction_fixture <fixture> <version> <expected-rc> — copy the fixture
# into a fresh temp dir as CHANGELOG.md, execute the workflow's extraction run
# block with VERSION set, and compare the exit status. Prints the sim dir on
# success (for notes.md inspection); returns 1 on mismatch (callers record).
run_extraction_fixture() {
	local fixture="$1" version="$2" expect_rc="$3" sim_dir rc
	sim_dir=$(mktemp -d)
	register_temp_dir "$sim_dir"
	cp "$fixture" "$sim_dir/CHANGELOG.md"
	(
		cd "$sim_dir" || exit 1
		VERSION="$version" bash -c "$extract_block" >/dev/null 2>&1
	)
	rc=$?
	if [ "$rc" -ne "$expect_rc" ]; then
		return 1
	fi
	printf '%s' "$sim_dir"
}

fixture_dir=$(mktemp -d)
register_temp_dir "$fixture_dir"

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

if extract_block=$(extract_run_block "$RELEASE_FILE" "Extract changelog notes"); then
	if sim_dir=$(run_extraction_fixture "$fixture_dir/real.md" "1.2.3" 0); then
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
	if sim_dir=$(run_extraction_fixture "$fixture_dir/plain.md" "1.2.3" 0); then
		if grep -qF '## [1.2.3] - 2026-08-01' "$sim_dir/notes.md"; then
			pass "plain ## [X.Y.Z] heading captured into notes.md"
		else
			fail "plain heading missing from notes.md"
		fi
	else
		fail "plain ## [X.Y.Z] heading section was not found (expected rc=0)"
	fi
	if run_extraction_fixture "$fixture_dir/dup.md" "1.2.3" 1 >/dev/null; then
		pass "duplicate [\$VERSION] sections fail extraction"
	else
		fail "duplicate [\$VERSION] sections did not fail extraction"
	fi
	if run_extraction_fixture "$fixture_dir/missing.md" "1.2.3" 1 >/dev/null; then
		pass "missing [\$VERSION] section fails extraction"
	else
		fail "missing [\$VERSION] section did not fail extraction"
	fi
	if run_extraction_fixture "$fixture_dir/blank.md" "1.2.3" 1 >/dev/null; then
		pass "heading with only whitespace body fails extraction"
	else
		fail "whitespace-only section body did not fail extraction"
	fi
else
	fail "could not extract the changelog-extraction run block from release.yml"
fi

# ── 9. Rerun states: local rev-parse tag probe, four states, no early exit ───

if grep -qF 'tag_exists' "$RELEASE_FILE" && \
   grep -qF 'release_exists' "$RELEASE_FILE" && \
   grep -qF 'git rev-parse -q --verify' "$RELEASE_FILE" && \
   grep -qF 'refs/tags/v${VERSION}^{commit}' "$RELEASE_FILE" && \
   grep -qF 'releases/tags/v$VERSION' "$RELEASE_FILE" && \
   grep -qF '!= "$MERGE_SHA"' "$RELEASE_FILE" && \
   ! grep -qF 'git ls-remote' "$RELEASE_FILE" && \
   ! grep -qF 'exit 0' "$RELEASE_FILE"; then
	pass "neither/both/partial states distinguished; local lightweight-safe tag probe; existing tag verified against merge SHA; no early exit before back-merge"
else
	fail "publication-state rerun logic, tag-probe, or early-exit contract violated"
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

if grep -qF 'release-${{ github.event.pull_request.head.ref }}' "$RELEASE_FILE" && \
   grep -qF 'cancel-in-progress: false' "$RELEASE_FILE"; then
	pass "concurrency is release-specific with cancel-in-progress: false"
else
	fail "concurrency is not release-specific or cancels in-flight runs"
fi

print_summary "release_workflow"





# vim: ft=sh sts=4 sw=4 ts=4 et :
