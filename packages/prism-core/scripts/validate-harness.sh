#!/usr/bin/env bash
# $KYAULabs: validate-harness.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $






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
		--no-extensions -e "$extension_entry" --list-models deepseek-v4-flash \
		>/dev/null 2>"$tmp_agent_dir/error.log"; then
		err "$relative: pi failed to import extension: $(tr '\n' ' ' < "$tmp_agent_dir/error.log" | head -c 500)"
	fi
	rm -rf "$tmp_agent_dir"
done < <(find "$REPO_ROOT/packages" -type f -path '*/extensions/*/index.ts' -print0 2>/dev/null | sort -z)

[ "$EXTENSION_COUNT" -gt 0 ] || err 'No extension entry points found.'
ok "$EXTENSION_COUNT extension entry point(s) imported"

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

printf '%s\n' '── Checking package path references ──'
legacy_script_prefix="$(printf '%s' 'github-scripts' | tr '-' '/')"
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	err "${file#$REPO_ROOT/}:$line: stale script reference: $text"
done < <(grep -RInE "\\.${legacy_script_prefix}/(new-branch|validate-branch-name|classify-greenfield|install-hooks|frontmatter-parser|glob-match|resolve-identity|validate-harness|jsonc-strip)\\.(sh|js)" "$REPO_ROOT/packages" 2>/dev/null || true)

printf '%s\n' '── Checking retired config references ──'
retired_pattern="$(printf '%s' 'prism-manifest|Prism-Manifest|OPENCODE-CONFIG-CONTENT|OPENCODE-MODEL-|OPENCODE-VARIANT-' | tr '-' '_')"
while IFS=: read -r file line text; do
	[ -n "$file" ] || continue
	case "$file" in
		*/extensions/safety/sensitive-paths.ts) continue ;;
		*/prism-php-web/scripts/check-frontend-agent-contract.js) continue ;;
	esac
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
