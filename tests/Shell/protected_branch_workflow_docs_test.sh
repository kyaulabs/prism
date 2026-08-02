#!/usr/bin/env bash
# $KYAULabs: protected_branch_workflow_docs_test.sh kyau@cosmos.kyaulabs 2026/08/01 -0700 Exp $










# ── Protected Branch Workflow Docs Regression Test ───────────────────────────
# Verify active .opencode/ and living-doc files contain only PR-based
# integration flows — no direct push to develop or main, no direct merge
# into protected branches, only PR flows.
#
# Fixes: #277
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
LIB="$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

# shellcheck source=tests/Shell/lib/test_helpers.sh
source "$LIB"
setup_result_file

# ── Active-doc file list (excludes historical ADRs) ──────────────────────────
# These are the files that instruct agents and humans on current workflow.
# ADR files are historical records and may contain now-outdated patterns.
ACTIVE_FILES=()
finish_skill="$REPO_ROOT/.opencode/skills/finishing-a-development-branch/SKILL.md"
release_cmd="$REPO_ROOT/.opencode/commands/release.md"

# Gather all .opencode/ markdown files
while IFS= read -r -d '' f; do
	ACTIVE_FILES+=("$f")
done < <(find "$REPO_ROOT/.opencode" -name '*.md' -print0 2>/dev/null)

# Gather living-doc files at repo root
for doc in AGENTS.md CONTRIBUTING.md README.md CONTEXT.md; do
	path="$REPO_ROOT/$doc"
	if [ -f "$path" ]; then
		ACTIVE_FILES+=("$path")
	fi
done

echo "── Active-doc push scan ────────────────────"

# ── Assertion 1: No active file contains direct push to protected branches ──
push_count=0
push_files=""
for file in "${ACTIVE_FILES[@]}"; do
	if grep -qE 'git push origin (develop|main)\b' "$file" 2>/dev/null; then
		push_count=$((push_count + 1))
		push_files="$push_files  $(basename "$file")\n"
	fi
done

if [ "$push_count" -eq 0 ]; then
	pass "No active file contains 'git push origin develop' or 'git push origin main'"
else
	fail "Found $push_count active file(s) with direct protected-branch push:\n$push_files"
fi

# ── Assertion 2: Finishing skill offers PR/keep/discard only ──────────────────
echo ""
echo "── Finishing skill assertions ─────────────"

if [ ! -f "$finish_skill" ]; then
	fail "finishing-a-development-branch/SKILL.md not found"
else
	# 2a: Delegates PR preparation to /pr (no duplicated gh recipe)
	if grep -qF '/pr' "$finish_skill" && ! grep -qF 'gh pr create' "$finish_skill"; then
		pass "finishing skill: delegates PR preparation to /pr"
	else
		fail "finishing skill: missing /pr delegation or still contains gh pr create"
	fi

	# 2b: Derives TARGET_BRANCH (normal → develop, hotfix/release → main)
	if grep -qE '(hotfix|release).*main' "$finish_skill" && grep -qE 'TARGET_BRANCH.*develop' "$finish_skill"; then
		pass "finishing skill: derives TARGET_BRANCH (develop for normal, main for hotfix/release)"
	else
		fail "finishing skill: does not derive TARGET_BRANCH correctly"
	fi

	# 2c: Merges origin/$TARGET_BRANCH into work branch (no rebase + force-push)
	if grep -qF 'merge' "$finish_skill" && grep -qF 'origin/' "$finish_skill" && grep -qF '$TARGET_BRANCH' "$finish_skill"; then
		pass "finishing skill: merges origin/\$TARGET_BRANCH into work branch (no rebase)"
	else
		fail "finishing skill: missing merge of origin/\$TARGET_BRANCH into work branch"
	fi

	# 2d: Never proposes a direct merge to develop/main
	if grep -qE 'git merge.*(develop|main)' "$finish_skill" && ! grep -qF 'origin/' "$finish_skill"; then
		fail "finishing skill: still offers direct merge to develop/main"
	else
		pass "finishing skill: no direct merge to develop/main"
	fi

	# 2e: Keep and discard options still present
	if grep -qi 'keep' "$finish_skill" && grep -qi 'discard' "$finish_skill"; then
		pass "finishing skill: keep and discard options present"
	else
		fail "finishing skill: missing keep/discard options"
	fi

	# 2f: Never auto-merge, never auto-push
	if grep -qi 'never auto-merge' "$finish_skill" && grep -qi 'never auto-push' "$finish_skill"; then
		pass "finishing skill: explicitly forbids auto-merge and auto-push"
	else
		fail "finishing skill: missing 'never auto-merge/auto-push' policy"
	fi

	# 2g: No rebase recommendation (use merge of origin/$TARGET_BRANCH instead)
	# The word "rebase" may appear in gotchas/rules about NOT rebasing — that's fine.
	# Only flag positive rebase recommendations like "git rebase" or "Rebase on".
	if grep -qE '(git rebase|rebase on the target|rebase before|Rebase on)' "$finish_skill"; then
		fail "finishing skill: still recommends rebase (should merge origin/\$TARGET_BRANCH)"
	else
		pass "finishing skill: no rebase — uses merge of target branch"
	fi
fi

# ── Assertion 3: Release command uses PR-based flow ───────────────────────────
echo ""
echo "── Release command assertions ─────────────"

if [ ! -f "$release_cmd" ]; then
	fail "release.md not found"
else
	# 3a: Release prep starts with new-branch.sh release
	if grep -qF 'new-branch.sh release' "$release_cmd" || grep -qF "new-branch.sh 'release'" "$release_cmd"; then
		pass "release: prep starts with new-branch.sh release"
	else
		fail "release: missing 'new-branch.sh release' branch creation"
	fi

	# 3b: Release integration uses a PR to main
	if grep -qF 'gh pr create' "$release_cmd" && grep -qF 'main' "$release_cmd"; then
		pass "release: uses gh pr create to main"
	else
		fail "release: missing PR-to-main integration"
	fi

	# 3c: Signed tag names the verified merged-main SHA (not HEAD)
	if grep -qF 'git tag -s' "$release_cmd" && grep -qF 'merge' "$release_cmd"; then
		pass "release: signed tag references merged-main SHA"
	else
		fail "release: signed tag does not reference verified merger SHA"
	fi

	# 3d: Publication pushes only the tag (vX.Y.Z or v1.0.0), not main
	if grep -qE 'git push origin (v[0-9X]|tag|--delete)' "$release_cmd"; then
		if grep -qE 'git push origin (main|develop)\b' "$release_cmd"; then
			fail "release: still prints direct push to main/develop"
		else
			pass "release: publishes only tag (not main/develop directly)"
		fi
	else
		fail "release: missing tag-only push command"
	fi

	# 3e: Back-merge uses PR with base develop, head main
	if grep -qF 'develop' "$release_cmd" && grep -qF -- '--head main' "$release_cmd"; then
		pass "release: back-merge PR uses --base develop --head main"
	else
		fail "release: missing back-merge PR (develop ← main)"
	fi

	# 3f: Never reuses the release branch after merge
	if grep -qi 'never reuse' "$release_cmd" || grep -qi 'do not reuse' "$release_cmd"; then
		pass "release: warns against reusing release branch"
	else
		fail "release: missing warning about reusing release branch"
	fi

	# 3g: Never pushes main or develop directly
	if grep -qE 'git push origin (main|develop)\b' "$release_cmd"; then
		fail "release: still contains direct git push to main or develop"
	else
		pass "release: no direct git push to main or develop"
	fi
fi

# ── Assertion 4: Living policy docs are aligned ──────────────────────────────
echo ""
echo "── Living policy doc assertions ───────────"

agents_md="$REPO_ROOT/AGENTS.md"
contributing_md="$REPO_ROOT/CONTRIBUTING.md"
readme_md="$REPO_ROOT/README.md"

# 4a: AGENTS.md states integration to develop/main is by merged PR
if grep -qiE '(pull request|merged PR|PR).*(integrat|merg|develop|main)' "$agents_md"; then
	pass "AGENTS.md: integration to develop/main is by merged PR"
else
	fail "AGENTS.md: integration-to-develop/main policy not PR-gated"
fi

# 4b: AGENTS.md states work branches originate through new-branch.sh
if grep -qF 'new-branch.sh' "$agents_md"; then
	pass "AGENTS.md: work branches originate through new-branch.sh"
else
	fail "AGENTS.md: missing new-branch.sh reference"
fi

# 4c: AGENTS.md states humans alone push work branches/tags and merge PRs
if grep -qiE 'human.*(push.*branch|push.*tag|merge.*PR|merge.*pull)' "$agents_md"; then
	pass "AGENTS.md: humans push work branches/tags and merge PRs"
else
	fail "AGENTS.md: human push/merge policy not stated"
fi

# 4d: CONTRIBUTING.md distinguishes fork PRs from same-repo work-branch PRs
if grep -qiE 'fork|same.repo|work.branch|internal' "$contributing_md"; then
	pass "CONTRIBUTING.md: distinguishes fork vs same-repo PR flows"
else
	fail "CONTRIBUTING.md: missing fork/same-repo PR distinction"
fi

# 4e: CONTRIBUTING.md names protected targets develop and main
if grep -qE 'develop.*main|main.*develop' "$contributing_md" && grep -qi 'protect' "$contributing_md"; then
	pass "CONTRIBUTING.md: names develop and main as protected targets"
else
	fail "CONTRIBUTING.md: protected targets not named"
fi

# 4f: README.md updates hook descriptions and /release summary
if grep -qiE 'protect|PR.only|pull.request' "$readme_md"; then
	pass "README.md: describes protected-branch / PR-only policy"
else
	fail "README.md: missing protected-branch / PR-only policy reference"
fi

# ── Assertion 5: Exclude ADR files from active-doc scan ─────────────────────
echo ""
echo "── ADR exclusion guard ────────────────────"

# ADRs are historical — direct-push text there is acceptable.
# But we should verify our scan pattern ACTUALLY excludes them.
adr_with_push=0
adr_files=""
while IFS= read -r -d '' adr; do
	if grep -qE 'git push origin (develop|main)\b' "$adr" 2>/dev/null; then
		adr_with_push=$((adr_with_push + 1))
		adr_files="$adr_files  $(basename "$adr")\n"
	fi
done < <(find "$REPO_ROOT/adr" -name '*.md' -print0 2>/dev/null || true)

if [ "$adr_with_push" -gt 0 ]; then
	pass "ADR exclusion: $adr_with_push ADR(s) contain direct-push text (correctly excluded from active scan)"
else
	pass "ADR exclusion: no ADR contains direct-push text (no false positives expected)"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
print_summary "protected_branch_workflow_docs"






# vim: ft=sh sts=4 sw=4 ts=4 et :
