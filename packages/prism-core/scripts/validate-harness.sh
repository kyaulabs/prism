#!/usr/bin/env bash
# $KYAULabs: validate-harness.sh kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

# Validate the pi package layout: Agent Skills frontmatter, prompt-template
# descriptions, extension imports, executable shell helpers, and stale
# legacy-config references. This replaces the prior harness permission/config
# validator; pi has no bash-permission prefix table to validate.

set -euo pipefail

if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
	printf 'ERROR: Bash 4+ required (found %s).\n' "${BASH_VERSION:-unknown}" >&2
	exit 1
fi
if ! command -v node >/dev/null 2>&1; then
	printf 'ERROR: Node.js is required for frontmatter parsing.\n' >&2
	exit 1
fi
if ! command -v pi >/dev/null 2>&1; then
	printf 'ERROR: pi is required for extension import validation.\n' >&2
	exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$REPO_ROOT" ]; then
	printf 'ERROR: Must run from inside a Git checkout.\n' >&2
	exit 1
fi

PARSER="$REPO_ROOT/packages/prism-core/scripts/frontmatter-parser.js"
ERRORS=0
SKILL_COUNT=0
PROMPT_COUNT=0
EXTENSION_COUNT=0
SCRIPT_COUNT=0

declare -A SKILL_NAMES

err() {
	printf '  ERROR: %s\n' "$*" >&2
	ERRORS=$((ERRORS + 1))
}

ok() {
	printf '  OK:    %s\n' "$*"
}

frontmatter_key() {
	node "$PARSER" "$1" "$2" 2>/dev/null || true
}

has_frontmatter() {
	local file="$1"
	[ "$(head -n 1 "$file" 2>/dev/null || true)" = '---' ] \
		&& [ "$(grep -c '^---$' "$file" 2>/dev/null || true)" -ge 2 ]
}

if [ ! -f "$PARSER" ]; then
	err "frontmatter parser missing: ${PARSER#$REPO_ROOT/}"
fi

printf '%s\n' '── Validating skills ──'
while IFS= read -r -d '' skill_file; do
	SKILL_COUNT=$((SKILL_COUNT + 1))
	relative="${skill_file#$REPO_ROOT/}"
	if ! has_frontmatter "$skill_file"; then
		err "$relative: missing or malformed YAML frontmatter"
		continue
	fi
	name="$(frontmatter_key "$skill_file" name)"
	description="$(frontmatter_key "$skill_file" description)"
	directory="$(basename "$(dirname "$skill_file")")"

	[ -n "$name" ] || err "$relative: missing or empty name"
	[ -n "$description" ] || err "$relative: missing or empty description"
	if [ -n "$name" ]; then
		if ! [[ "$name" =~ ^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$ ]] \
			|| [[ "$name" == *--* ]]; then
			err "$relative: invalid skill name '$name'"
		fi
		[ "$name" = "$directory" ] \
			|| err "$relative: name '$name' does not match directory '$directory'"
		if [ -n "${SKILL_NAMES[$name]:-}" ]; then
			err "$relative: duplicate skill name '$name' (first: ${SKILL_NAMES[$name]})"
		else
			SKILL_NAMES[$name]="$relative"
		fi
	fi
done < <(find "$REPO_ROOT/packages" -type f -path '*/skills/*/SKILL.md' -print0 2>/dev/null | sort -z)

[ "$SKILL_COUNT" -gt 0 ] || err 'No package skills found.'
ok "$SKILL_COUNT skill(s) checked"

printf '%s\n' '── Checking Distill output-style contract ──'
DISTILL_CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-distill-contract.sh"
if [ ! -f "$DISTILL_CHECKER" ]; then
    err "Distill contract checker missing: ${DISTILL_CHECKER#$REPO_ROOT/}"
else
    if distill_output=$(bash "$DISTILL_CHECKER" "$REPO_ROOT" 2>&1); then
        distill_status=0
    else
        distill_status=$?
    fi
    while IFS= read -r diagnostic; do
        [ -n "$diagnostic" ] && err "$diagnostic"
    done <<< "$distill_output"
    if [ "$distill_status" -ne 0 ] && [ -z "$distill_output" ]; then
        err "Distill contract checker failed with status $distill_status"
    fi
fi

printf '%s\n' '── Validating prompt templates ──'
while IFS= read -r -d '' prompt_file; do
	PROMPT_COUNT=$((PROMPT_COUNT + 1))
	relative="${prompt_file#$REPO_ROOT/}"
	if ! has_frontmatter "$prompt_file"; then
		err "$relative: missing or malformed YAML frontmatter"
		continue
	fi
	description="$(frontmatter_key "$prompt_file" description)"
	[ -n "$description" ] || err "$relative: missing or empty description"

	frontmatter="$(awk 'NR == 1 && /^---$/ { in_fm = 1; next } in_fm && /^---$/ { exit } in_fm { print }' "$prompt_file")"
	while IFS= read -r key; do
		[ -z "$key" ] && continue
		case "$key" in
			description|argument-hint) ;;
			*) err "$relative: unsupported pi prompt frontmatter key '$key'" ;;
		esac
	done < <(printf '%s\n' "$frontmatter" | grep -oE '^[A-Za-z_][A-Za-z0-9_-]*:' 2>/dev/null | tr -d ':' || true)
done < <(find "$REPO_ROOT/packages" -type f -path '*/prompts/*.md' -print0 2>/dev/null | sort -z)

[ "$PROMPT_COUNT" -gt 0 ] || err 'No package prompt templates found.'
ok "$PROMPT_COUNT prompt template(s) checked"

printf '%s\n' '── Validating extension imports ──'
while IFS= read -r -d '' extension_entry; do
	EXTENSION_COUNT=$((EXTENSION_COUNT + 1))
	relative="${extension_entry#$REPO_ROOT/}"
	tmp_agent_dir="$(mktemp -d)"
	if ! PI_CODING_AGENT_DIR="$tmp_agent_dir" PI_OFFLINE=1 \
		pi --no-session --no-context-files --no-skills --no-prompt-templates \
		--no-extensions -e "$extension_entry" --list-models \
		>/dev/null 2>"$tmp_agent_dir/error.log"; then
		err "$relative: pi failed to import extension: $(tr '\n' ' ' < "$tmp_agent_dir/error.log" | head -c 500)"
	fi
	rm -rf "$tmp_agent_dir"
done < <(find "$REPO_ROOT/packages" -type f -path '*/extensions/*/index.ts' -print0 2>/dev/null | sort -z)

[ "$EXTENSION_COUNT" -gt 0 ] || err 'No extension entry points found.'
ok "$EXTENSION_COUNT extension entry point(s) imported"

printf '%s\n' '── Validating pi core peerDependencies ──'
PEER_CHECK="$REPO_ROOT/packages/prism-core/scripts/check-peer-deps.js"
if [ ! -f "$PEER_CHECK" ]; then
	err "peer-dep checker missing: ${PEER_CHECK#$REPO_ROOT/}"
else
	MANIFEST_COUNT=0
	while IFS= read -r -d '' pkg_json; do
		MANIFEST_COUNT=$((MANIFEST_COUNT + 1))
		while IFS= read -r line; do
			[ -n "$line" ] && err "$line"
		done < <(node "$PEER_CHECK" "$pkg_json" 2>/dev/null)
	done < <(find "$REPO_ROOT/packages" -maxdepth 2 -name package.json \
		-not -path '*/node_modules/*' -print0 2>/dev/null | sort -z)
	ok "$MANIFEST_COUNT package manifest(s) checked for pi core peerDependencies"
fi

printf '%s\n' '── Validating toolchain contracts ──'
CONTRACT_LOADER="$REPO_ROOT/packages/prism-core/scripts/prism-tool/contract.js"
if [ ! -f "$CONTRACT_LOADER" ]; then
	err "toolchain contract loader missing: ${CONTRACT_LOADER#$REPO_ROOT/}"
else
	TOOLCHAIN_COUNT=0
	while IFS= read -r -d '' pkg_json; do
		if ! toolchain_output=$(node - "$CONTRACT_LOADER" "$pkg_json" 2>&1 <<'NODE'
const path = require('node:path');
const {assertPackageParity, loadContract} = require(process.argv[2]);
const packagePath = path.resolve(process.argv[3]);
const packageJson = require(packagePath);

if (!packageJson.prism?.toolchain) process.exit(0);
const packageRoot = path.dirname(packagePath);
const contractPath = path.resolve(packageRoot, packageJson.prism.toolchain);
const relative = path.relative(packageRoot, contractPath);
if (relative.startsWith('..') || path.isAbsolute(relative)) {
	throw new Error(`${packagePath}: prism.toolchain escapes package root`);
}
const contract = loadContract(contractPath);
assertPackageParity(contract, packageJson);
process.stdout.write(`${contract.package}\n`);
NODE
		); then
			err "${pkg_json#$REPO_ROOT/}: $toolchain_output"
		elif [ -n "$toolchain_output" ]; then
			TOOLCHAIN_COUNT=$((TOOLCHAIN_COUNT + 1))
			ok "$toolchain_output"
		fi
	done < <(find "$REPO_ROOT/packages" -maxdepth 2 -name package.json \
		-not -path '*/node_modules/*' -print0 2>/dev/null | sort -z)
	ok "$TOOLCHAIN_COUNT toolchain contract(s) checked"
fi

printf '%s\n' '── Validating toolchain entry points ──'
ENTRY_POINTS=(
	"$REPO_ROOT/packages/prism-core/scripts/prism-review.js"
	"$REPO_ROOT/packages/prism-core/scripts/prism-tool.js"
	"$REPO_ROOT/packages/prism-core/scripts/install-global.sh"
	"$REPO_ROOT/packages/prism-core/scripts/install-hooks.sh"
	"$REPO_ROOT/packages/prism-php-web/scripts/prism-tool-adapter.js"
)
ENTRY_COUNT=0
for entry in "${ENTRY_POINTS[@]}"; do
	if [ ! -f "$entry" ]; then
		err "toolchain entry point missing: ${entry#$REPO_ROOT/}"
		continue
	fi
	ENTRY_COUNT=$((ENTRY_COUNT + 1))
	mode="$(git ls-files -s -- "$entry" | awk '{print $1}')"
	if [ "$mode" != "100755" ]; then
		err "${entry#$REPO_ROOT/}: git index mode $mode (expected 100755)"
	fi
done
ok "$ENTRY_COUNT toolchain entry point(s) executable"

printf '%s\n' '── Validating review runtime foundation ──'
if ! review_output=$(node - "$REPO_ROOT" 2>&1 <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const coreRoot = path.join(root, 'packages/prism-core');
const adapterRoot = path.join(root, 'packages/prism-php-web');
const coreManifest = require(path.join(coreRoot, 'package.json'));
const adapterManifest = require(path.join(adapterRoot, 'package.json'));
if (coreManifest.bin?.['prism-tool'] !== 'scripts/prism-tool.js' ||
    coreManifest.bin?.['prism-review'] !== 'scripts/prism-review.js') {
    throw new Error('Core package bins are incomplete');
}
if (adapterManifest.prism?.review !== './config/prism-review.json') {
    throw new Error('adapter review profile registration is incomplete');
}
const profiles = [
    [coreRoot, require(path.join(coreRoot, 'config/prism-review.json')), 14, 'core'],
    [adapterRoot, require(path.join(adapterRoot, 'config/prism-review.json')), 10, 'adapter'],
];
for (const [packageRoot, profile, expectedResources, role] of profiles) {
    if (profile.schemaVersion !== 1 || profile.role !== role ||
        profile.resources.length !== expectedResources) {
        throw new Error(`${role} review profile is incomplete`);
    }
    for (const resource of profile.resources) {
        if (!fs.statSync(path.join(packageRoot, resource.path)).isFile()) {
            throw new Error(`${role} review resource is missing`);
        }
    }
}
for (const license of ['CC0-1.0.txt', 'CC-BY-SA-4.0.txt']) {
    if (!fs.statSync(path.join(coreRoot, 'config/licenses', license)).isFile()) {
        throw new Error(`review source license ${license} is missing`);
    }
}
NODE
); then
    err "review runtime foundation: $review_output"
else
    ok 'review runtime package surface checked'
fi

printf '%s\n' '── Validating package archive inclusions ──'
INCLUDE_COUNT=0
while IFS= read -r -d '' pkg_json; do
	if ! inclusion_output=$(node - "$pkg_json" 2>&1 <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const pkg = require(process.argv[2]);
const files = Array.isArray(pkg.files) ? pkg.files : [];
const isCovered = (file) => {
	const clean = file.replace(/^\.\//, '');
	return files.some((entry) => {
		const candidate = entry.replace(/^\.\//, '');
		return candidate === clean || clean.startsWith(candidate + '/');
	});
};
const required = [];
if (pkg.prism?.toolchain) required.push('toolchain.json');
if (pkg.name === '@kyaulabs/prism-core') {
	required.push('safe-dirs.json', 'scripts/prism-review.js', 'scripts/prism-tool.js', 'config/commitlint.config.cjs');
}
if (pkg.name === '@kyaulabs/prism-php-web') {
	required.push('safe-dirs.json', 'scripts/prism-tool-adapter.js');
}
const missing = required.filter((file) => !isCovered(file));
if (missing.length) {
	throw new Error(`files array omits ${missing.join(', ')}`);
}
NODE
	); then
		err "${pkg_json#$REPO_ROOT/}: $inclusion_output"
	else
		INCLUDE_COUNT=$((INCLUDE_COUNT + 1))
	fi
done < <(find "$REPO_ROOT/packages" -maxdepth 2 -name package.json \
	-not -path '*/node_modules/*' -print0 2>/dev/null | sort -z)
ok "$INCLUDE_COUNT package manifest(s) include owned archive paths"

printf '%s\n' '── Validating shell helpers ──'
while IFS= read -r -d '' script; do
	SCRIPT_COUNT=$((SCRIPT_COUNT + 1))
	relative="${script#$REPO_ROOT/}"
	[ -x "$script" ] || err "$relative: shell helper is not executable"
	if command -v shellcheck >/dev/null 2>&1; then
		if ! shellcheck_output="$(shellcheck --severity=warning "$script" 2>&1)"; then
			err "$relative: shellcheck failed: $(printf '%s' "$shellcheck_output" | tr '\n' ' ' | head -c 500)"
		elif [ -n "$shellcheck_output" ]; then
			err "$relative: shellcheck emitted diagnostics: $(printf '%s' "$shellcheck_output" | tr '\n' ' ' | head -c 500)"
		fi
	fi
done < <(find "$REPO_ROOT/packages" -type f -name '*.sh' -print0 2>/dev/null | sort -z)
ok "$SCRIPT_COUNT shell helper(s) checked"

printf '%s\n' '── Checking blank-line policy ──'
BLANK_LINE_CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-blank-lines.sh"
if [ ! -f "$BLANK_LINE_CHECKER" ]; then
	err "blank-line checker missing: ${BLANK_LINE_CHECKER#$REPO_ROOT/}"
else
	if blank_line_output=$(bash "$BLANK_LINE_CHECKER" --tracked 2>&1); then
		blank_line_status=0
	else
		blank_line_status=$?
	fi
	if [ "$blank_line_status" -ne 0 ]; then
		while IFS= read -r diagnostic; do
			[ -n "$diagnostic" ] && err "$diagnostic"
		done <<< "$blank_line_output"
		[ -n "$blank_line_output" ] \
			|| err "blank-line checker failed with status $blank_line_status"
	fi
fi

printf '%s\n' '── Checking package path references ──'
legacy_script_prefix="$(printf '%s' 'github-scripts' | tr '-' '/')"
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	err "${file#$REPO_ROOT/}:$line: stale script reference: $text"
done < <(grep -RInE "\\.${legacy_script_prefix}/(new-branch|validate-branch-name|classify-greenfield|install-hooks|frontmatter-parser|glob-match|resolve-identity|validate-harness|jsonc-strip)\\.(sh|js)" "$REPO_ROOT/packages" 2>/dev/null || true)

printf '%s\n' '── Checking instruction-layer script references ──'
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	err "${file#$REPO_ROOT/}:$line: checkout-relative script reference: $text"
done < <(grep -RInE 'bash packages/prism-core/(scripts|skills)/' \
	"$REPO_ROOT/AGENTS.md" \
	"$REPO_ROOT/packages/prism-core/AGENTS.md" \
	"$REPO_ROOT/packages/prism-core/skills" \
	"$REPO_ROOT/packages/prism-core/prompts" \
	"$REPO_ROOT/packages/prism-php-web/skills" \
	"$REPO_ROOT/packages/prism-php-web/prompts" \
	"$REPO_ROOT/.github/hooks" \
	2>/dev/null || true)

printf '%s\n' '── Checking commit workflow ownership ──'
COMMIT_WORKFLOW_CHECKER="$REPO_ROOT/packages/prism-core/scripts/check-commit-workflows.js"
if [ ! -f "$COMMIT_WORKFLOW_CHECKER" ]; then
	err "commit workflow checker missing: ${COMMIT_WORKFLOW_CHECKER#$REPO_ROOT/}"
else
	if commit_workflow_output=$(node "$COMMIT_WORKFLOW_CHECKER" "$REPO_ROOT" 2>&1); then
		commit_workflow_status=0
	else
		commit_workflow_status=$?
	fi
	while IFS= read -r diagnostic; do
		[ -n "$diagnostic" ] && err "$diagnostic"
	done <<< "$commit_workflow_output"
	if [ "$commit_workflow_status" -ne 0 ] && [ -z "$commit_workflow_output" ]; then
		err "commit workflow checker failed with status $commit_workflow_status"
	fi
fi

printf '%s\n' '── Checking retired config references ──'
retired_pattern="$(printf '%s' 'prism-manifest|Prism-Manifest|OPENCODE-CONFIG-CONTENT|OPENCODE-MODEL-|OPENCODE-VARIANT-' | tr '-' '_')"
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	err "${file#$REPO_ROOT/}:$line: retired config reference: $text"
done < <(grep -RInE "$retired_pattern" "$REPO_ROOT/packages" "$REPO_ROOT/.github" 2>/dev/null || true)

printf '\n%s\n' '═══════════════════════════════════════════════════════════════'
if [ "$ERRORS" -eq 0 ]; then
	printf '✓ Harness validation PASSED — %d errors\n' "$ERRORS"
	printf '%s\n' '═══════════════════════════════════════════════════════════════'
	exit 0
fi
printf '✗ Harness validation FAILED — %d error(s)\n' "$ERRORS" >&2
printf '%s\n' '═══════════════════════════════════════════════════════════════' >&2
exit 1

# vim: ft=sh sts=4 sw=4 ts=4 et :
