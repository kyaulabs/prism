#!/usr/bin/env bash
# $KYAULabs: verify-protected-push.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# ── Verify a protected-branch push came from a merged PR ──────────────────────
# Consumes: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA, GITHUB_EVENT_BEFORE,
#           GITHUB_REPOSITORY, GH_TOKEN
# Exit: 0 — allowed (non-protected event, root commit, or proven PR merge)
#       1 — policy violation (push to protected branch with no matching PR)
#       2 — malformed env, API failure, or malformed JSON

set -euo pipefail

# Only operate on push events
if [ "${GITHUB_EVENT_NAME:-}" != "push" ]; then
	exit 0
fi

GITHUB_REF="${GITHUB_REF:-}"

# Only gate protected branches
case "$GITHUB_REF" in
	refs/heads/main|refs/heads/develop) ;;
	*) exit 0 ;;
esac

# ── Validate environment ──────────────────────────────────────────────────────

REPO="${GITHUB_REPOSITORY:-}"
SHA="${GITHUB_SHA:-}"
BEFORE="${GITHUB_EVENT_BEFORE:-}"
BRANCH="${GITHUB_REF##refs/heads/}"

# Repository must be owner/name with GitHub-safe characters
if ! echo "$REPO" | grep -Eq '^[a-zA-Z0-9][-a-zA-Z0-9._]*/[a-zA-Z0-9][-a-zA-Z0-9._]*$'; then
	exit 2
fi

# SHA and BEFORE must be 40- or 64-char lowercase hex, or all-zero OID
valid_oid() {
	local oid="$1"
	[[ "$oid" =~ ^[0-9a-f]{40}$ ]] && return 0
	[[ "$oid" =~ ^[0-9a-f]{64}$ ]] && return 0
	[[ "$oid" =~ ^0{40}$ ]] && return 0
	[[ "$oid" =~ ^0{64}$ ]] && return 0
	return 1
}

if ! valid_oid "$SHA"; then
	exit 2
fi

if ! valid_oid "$BEFORE"; then
	exit 2
fi

# ── Root commit exception ─────────────────────────────────────────────────────
# Allow an initial push that creates the branch with a single root commit
# (no parent). Requires BOTH the before-SHA to be all-zero AND the commit
# to be a true root commit.

is_root_commit() {
	local sha="$1"
	[ "$(git rev-list --count "$sha")" -eq 1 ] || return 1
	[ "$(git rev-list --parents -n 1 "$sha" | wc -w | tr -d ' ')" -eq 1 ] || return 1
	return 0
}

case "$BEFORE" in
	0000000000000000000000000000000000000000|0000000000000000000000000000000000000000000000000000000000000000)
		if is_root_commit "$SHA"; then
			exit 0
		fi
		echo "::error::Protected branch $BRANCH requires a merged PR, but the push is not a single root commit."
		exit 1
		;;
esac

# ── PR provenance check ───────────────────────────────────────────────────────
# Call the commit-pulls endpoint to verify this push is the merge commit of a
# merged PR whose base branch matches the protected branch.

PULLS_ENDPOINT="repos/$REPO/commits/$SHA/pulls"
MAX_ATTEMPTS=3
DELAY_SECONDS=2

# PHP script that reads JSON from stdin and checks for a matching merged PR.
# Writes "match", "no_match", or "invalid" to stdout.
PHP_MATCH_SCRIPT=$(mktemp)
# shellcheck disable=SC2064
trap "rm -f $PHP_MATCH_SCRIPT" EXIT

cat > "$PHP_MATCH_SCRIPT" <<'PHP_CODE'
<?php
declare(strict_types=1);

$json = file_get_contents('php://stdin');
if ($json === false || $json === '') {
    echo 'invalid';
    exit(0);
}

try {
    $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    echo 'invalid';
    exit(0);
}

if (!is_array($data)) {
    echo 'invalid';
    exit(0);
}

$branch = getenv('VERIFY_BRANCH');
$sha    = getenv('VERIFY_SHA');

foreach ($data as $pr) {
    if (!is_array($pr)) {
        continue;
    }
    $mergedAt = $pr['merged_at'] ?? null;
    if ($mergedAt === null) {
        continue;
    }
    $baseRef = $pr['base']['ref'] ?? '';
    if ($baseRef !== $branch) {
        continue;
    }
    $mergeSha = $pr['merge_commit_sha'] ?? '';
    if ($mergeSha !== $sha) {
        continue;
    }
    echo 'match';
    exit(0);
}

echo 'no_match';
PHP_CODE

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
	response=""
	exit_code=0
	response=$(gh api -H "Accept: application/vnd.github+json" "$PULLS_ENDPOINT" 2>/dev/null) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
			sleep "$DELAY_SECONDS"
			attempt=$((attempt + 1))
			continue
		fi
		echo "::error::API failure after $MAX_ATTEMPTS attempts."
		exit 2
	fi

	result=$(echo "$response" | VERIFY_BRANCH="$BRANCH" VERIFY_SHA="$SHA" php "$PHP_MATCH_SCRIPT")

	case "$result" in
		match)
			exit 0
			;;
		no_match)
			echo "::error::Push to protected branch $BRANCH has no matching merged PR (merge_commit_sha=$SHA)."
			exit 1
			;;
		invalid|*)
			if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
				sleep "$DELAY_SECONDS"
				attempt=$((attempt + 1))
				continue
			fi
			echo "::error::API returned invalid JSON after $MAX_ATTEMPTS attempts."
			exit 2
			;;
	esac
done

# Should be unreachable, but fail closed
exit 2

# vim: ft=sh sts=4 sw=4 ts=4 et :
