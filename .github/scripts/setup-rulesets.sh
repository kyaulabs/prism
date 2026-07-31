#!/usr/bin/env bash
# $KYAULabs: setup-rulesets.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $










# ── GitHub ruleset drift detection and enforcement ────────────────────────────
# Compares the live pr-only-integration ruleset and repository merge settings
# against a canonical definition. Supports three modes:
#   --dry-run  Report the delta without mutating GitHub (default).
#   --check    Exit 0 when canonical, 1 if drifted, 2 on errors.
#   --apply    Create or update the ruleset and merge settings idempotently.
#
# Exit codes:
#   0  Success (dry-run always, check when canonical, apply when succeeded)
#   1  Drift detected (check mode only)
#   2  Prerequisite failure, API error, or malformed state

set -euo pipefail

# ── Prerequisites ─────────────────────────────────────────────────────────────

if ! command -v gh >/dev/null 2>&1; then
	echo "Error: gh (GitHub CLI) not found on PATH — install and run 'gh auth login'" >&2
	exit 2
fi

if ! command -v php >/dev/null 2>&1; then
	echo "Error: php not found on PATH — required for JSON comparison" >&2
	exit 2
fi

if ! gh auth status >/dev/null 2>&1; then
	echo "Error: gh auth status failed — run 'gh auth login'" >&2
	exit 2
fi

# ── Mode parsing ──────────────────────────────────────────────────────────────

MODE="--dry-run"

if [ $# -gt 0 ]; then
	case "$1" in
		--dry-run|--check|--apply)
			MODE="$1"
			;;
		*)
			echo "Error: unknown mode '$1' (expected --dry-run, --check, or --apply)" >&2
			exit 2
			;;
	esac
	shift

	if [ $# -gt 0 ]; then
		echo "Error: unexpected extra argument '$1'" >&2
		exit 2
	fi
fi

echo "[setup-rulesets] mode=$MODE"

# ── Repository detection ──────────────────────────────────────────────────────

REPO=$(gh repo view --json nameWithOwner 2>/dev/null | php -r 'echo json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR)["nameWithOwner"];' 2>/dev/null) || {
	echo "Error: cannot determine repository — run inside a GitHub repository" >&2
	exit 2
}

echo "[setup-rulesets] repo=$REPO"

# ── Temporary directory ───────────────────────────────────────────────────────

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Canonical payloads ────────────────────────────────────────────────────────

RULESET_PAYLOAD="$TMP_DIR/canonical-ruleset.json"

cat > "$RULESET_PAYLOAD" <<'CANONICAL_RULESET'
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
CANONICAL_RULESET

MERGE_SETTINGS_PAYLOAD="$TMP_DIR/canonical-merge-settings.json"

cat > "$MERGE_SETTINGS_PAYLOAD" <<'CANONICAL_MERGE'
{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}
CANONICAL_MERGE

# ── Ruleset discovery ─────────────────────────────────────────────────────────

ACTUAL_RULESETS="$TMP_DIR/actual-rulesets.json"
ACTUAL_RULESET="$TMP_DIR/actual-ruleset.json"
ACTUAL_MERGE="$TMP_DIR/actual-merge-settings.json"

# Fetch the ruleset list
if ! gh api "repos/$REPO/rulesets" > "$ACTUAL_RULESETS" 2>/dev/null; then
	echo "Error: failed to fetch rulesets from GitHub API" >&2
	exit 2
fi

# Fetch repository settings
if ! gh api "repos/$REPO" > "$ACTUAL_MERGE" 2>/dev/null; then
	echo "Error: failed to fetch repository settings from GitHub API" >&2
	exit 2
fi

# ── Owned ruleset identification ──────────────────────────────────────────────
# Select rulesets whose name exactly matches pr-only-integration

MATCHED_IDS=$(php -r '
$list = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
if (!is_array($list)) { echo ""; exit(0); }
$ids = [];
foreach ($list as $rs) {
    if (isset($rs["name"]) && $rs["name"] === "pr-only-integration" && isset($rs["id"]) && ctype_digit((string)$rs["id"])) {
        $ids[] = (int)$rs["id"];
    }
}
echo implode("\n", $ids);
' "$ACTUAL_RULESETS")

MATCH_COUNT=0
if [ -n "$MATCHED_IDS" ]; then
	MATCH_COUNT=$(echo "$MATCHED_IDS" | grep -c . 2>/dev/null || echo 0)
fi
if [ "$MATCH_COUNT" -gt 1 ]; then
	echo "Error: multiple rulesets named pr-only-integration exist — resolve duplicates manually" >&2
	exit 2
fi

# ── PHP comparison helper ─────────────────────────────────────────────────────
# Compares two JSON files after projecting onto owned keys, sorting branches and
# rules. Outputs "unchanged" or "update".

compare_owned() {
	local actual_file="$1" expected_file="$2"
	php -r '
$actual = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$expected = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);

// Project onto owned keys
$owned = ["name", "target", "enforcement", "bypass_actors", "conditions", "rules"];
$a = array_intersect_key($actual, array_flip($owned));
$b = array_intersect_key($expected, array_flip($owned));

// Sort branch include arrays
if (isset($a["conditions"]["ref_name"]["include"])) {
    sort($a["conditions"]["ref_name"]["include"]);
}
if (isset($b["conditions"]["ref_name"]["include"])) {
    sort($b["conditions"]["ref_name"]["include"]);
}

// Sort rules by type
if (isset($a["rules"])) {
    usort($a["rules"], function($x, $y) { return strcmp($x["type"], $y["type"]); });
}
if (isset($b["rules"])) {
    usort($b["rules"], function($x, $y) { return strcmp($x["type"], $y["type"]); });
}

echo ($a === $b) ? "unchanged" : "update";
' "$actual_file" "$expected_file"
}

# ── Compare merge settings (only the three owned keys) ────────────────────────

compare_merge() {
	local actual_file="$1" expected_file="$2"
	php -r '
$actual = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$expected = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
$keys = ["allow_merge_commit", "allow_squash_merge", "allow_rebase_merge"];
foreach ($keys as $k) {
    if (!isset($actual[$k]) || $actual[$k] !== $expected[$k]) {
        echo "update";
        exit(0);
    }
}
echo "unchanged";
' "$actual_file" "$expected_file"
}

# ── Determine ruleset status ──────────────────────────────────────────────────

if [ -z "$MATCHED_IDS" ]; then
	RULESET_STATUS="create"
else
	RULESET_ID="$MATCHED_IDS"

	# Fetch the full detail for the matched ruleset
	if ! gh api "repos/$REPO/rulesets/$RULESET_ID" > "$ACTUAL_RULESET" 2>/dev/null; then
		echo "Error: failed to fetch ruleset detail for ID $RULESET_ID" >&2
		exit 2
	fi

	RULESET_STATUS=$(compare_owned "$ACTUAL_RULESET" "$RULESET_PAYLOAD")
fi

MERGE_STATUS=$(compare_merge "$ACTUAL_MERGE" "$MERGE_SETTINGS_PAYLOAD")

# ── Mode dispatch ─────────────────────────────────────────────────────────────

case "$MODE" in
	--dry-run)
		echo "Ruleset pr-only-integration: $RULESET_STATUS"
		echo "Repository merge methods: $MERGE_STATUS"
		exit 0
		;;
	--check)
		if [ "$RULESET_STATUS" = "unchanged" ] && [ "$MERGE_STATUS" = "unchanged" ]; then
			exit 0
		fi
		echo "Ruleset pr-only-integration: $RULESET_STATUS"
		echo "Repository merge methods: $MERGE_STATUS"
		exit 1
		;;
	--apply)
		API_ERR="$TMP_DIR/api-err"

		if [ "$RULESET_STATUS" = "create" ]; then
			if ! gh api "repos/$REPO/rulesets" -X POST --input "$RULESET_PAYLOAD" >/dev/null 2>"$API_ERR"; then
				if grep -qi "403" "$API_ERR"; then
					echo "Error: 403 Forbidden — the token requires repository administration permission to create rulesets" >&2
				else
					echo "Error: API call failed: $(cat "$API_ERR")" >&2
				fi
				exit 2
			fi
			echo "Ruleset pr-only-integration: created"
		elif [ "$RULESET_STATUS" = "update" ]; then
			if ! gh api "repos/$REPO/rulesets/$RULESET_ID" -X PUT --input "$RULESET_PAYLOAD" >/dev/null 2>"$API_ERR"; then
				if grep -qi "403" "$API_ERR"; then
					echo "Error: 403 Forbidden — the token requires repository administration permission to update rulesets" >&2
				else
					echo "Error: API call failed: $(cat "$API_ERR")" >&2
				fi
				exit 2
			fi
			echo "Ruleset pr-only-integration: updated"
		else
			echo "Ruleset pr-only-integration: unchanged"
		fi

		if [ "$MERGE_STATUS" = "update" ]; then
			if ! gh api "repos/$REPO" -X PATCH --input "$MERGE_SETTINGS_PAYLOAD" >/dev/null 2>"$API_ERR"; then
				if grep -qi "403" "$API_ERR"; then
					echo "Error: 403 Forbidden — the token requires repository administration permission to update merge settings" >&2
				else
					echo "Error: API call failed: $(cat "$API_ERR")" >&2
				fi
				exit 2
			fi
			echo "Repository merge methods: updated"
		else
			echo "Repository merge methods: unchanged"
		fi
		;;
esac










# vim: ft=sh sts=4 sw=4 ts=4 et :
