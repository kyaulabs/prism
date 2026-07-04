#!/usr/bin/env bash
# $KYAULabs: validate-harness.sh,v 1.0.0 2026/07/04 12:00:00 -0700 kyau Exp $

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

HARNESS_DIR=".opencode"
SKILLS_DIR="${HARNESS_DIR}/skills"
AGENTS_DIR="${HARNESS_DIR}/agents"
COMMANDS_DIR="${HARNESS_DIR}/commands"

ERRORS=0
WARNINGS=0
NAME_REGISTRY=""  # Track all names across categories to detect collisions

# ── Helpers ──────────────────────────────────────────────────────────────────

err() { echo "  ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  WARN:  $*" >&2; WARNINGS=$((WARNINGS + 1)); }
ok() { echo "  OK:    $*"; }

# Extract a YAML frontmatter key's value from a file.
# Usage: frontmatter_key <file> <key>
# Returns the value (whitespace trimmed) or empty string if not found.
frontmatter_key() {
	local file="$1" key="$2"
	# Only search between the first pair of --- delimiters
	awk -v key="$2" '
		/^---$/ { in_fm=!in_fm; next }
		in_fm && $1 == key ":" {
			sub(/^[^:]+:[[:space:]]*/, "")
			print
			exit
		}
	' "$file" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# Check that a file has paired --- frontmatter delimiters.
# Returns 0 if valid, 1 if not.
check_frontmatter_delimiters() {
	local file="$1"
	local open count
	count=$(grep -c '^---$' "$file" 2>/dev/null || echo 0)
	if [ "$count" -eq 0 ]; then
		return 1
	fi
	# First line must be ---
	open=$(head -1 "$file")
	if [ "$open" != "---" ]; then
		return 1
	fi
	# Must have a closing --- after the first one
	if [ "$count" -lt 2 ]; then
		return 1
	fi
	return 0
}

# Register a name in the global registry and check for collisions.
register_name() {
	local name="$1" category="$2" file="$3"
	if [ -z "$name" ]; then
		return
	fi
	# Check if this name is already registered (any category)
	local existing
	existing=$(echo "$NAME_REGISTRY" | grep "^${name} " || true)
	if [ -n "$existing" ]; then
		local existing_file existing_cat
		existing_file=$(echo "$existing" | awk '{print $2}')
		existing_cat=$(echo "$existing" | awk '{print $3}')
		err "${file}: name '${name}' already registered as ${existing_cat} in ${existing_file}"
	else
		NAME_REGISTRY="${NAME_REGISTRY}${name} ${file} ${category}"$'\n'
	fi
}

# Check that a non-empty string value exists for a field.
check_required_field() {
	local file="$1" label="$2" value="$3"
	if [ -z "$value" ]; then
		err "${file}: missing or empty '${label}' field in frontmatter"
		return 1
	fi
	return 0
}

# ── Validate skills ──────────────────────────────────────────────────────────

echo "── Validating skills ──"
SKILL_COUNT=0
SKILL_NAMES=""

shopt -s nullglob
SKILL_FILES=( "${SKILLS_DIR}"/*/SKILL.md )
shopt -u nullglob

if [ ${#SKILL_FILES[@]} -eq 0 ]; then
	warn "No skill files found in ${SKILLS_DIR}/"
else
	for skill_file in "${SKILL_FILES[@]}"; do
		SKILL_COUNT=$((SKILL_COUNT + 1))

		# Frontmatter delimiters
		if ! check_frontmatter_delimiters "$skill_file"; then
			err "${skill_file}: missing or malformed YAML frontmatter (--- delimiters)"
			continue
		fi

		# Required fields
		name=$(frontmatter_key "$skill_file" "name")
		desc=$(frontmatter_key "$skill_file" "description")
		check_required_field "$skill_file" "name" "$name" || true
		check_required_field "$skill_file" "description" "$desc" || true

		# Name must match directory name
		dirname=$(basename "$(dirname "$skill_file")")
		if [ -n "$name" ] && [ "$name" != "$dirname" ]; then
			err "${skill_file}: name '${name}' does not match directory '${dirname}'"
		fi

		# Check for duplicate names within skills
		if [ -n "$name" ]; then
			if echo "$SKILL_NAMES" | grep -qx "$name"; then
				err "${skill_file}: duplicate skill name '${name}'"
			else
				SKILL_NAMES="${SKILL_NAMES}${name}"$'\n'
			fi
			register_name "$name" "skill" "$skill_file"
		fi
	done
fi

ok "${SKILL_COUNT} skill(s) checked"

# ── Validate agents ──────────────────────────────────────────────────────────

echo "── Validating agents ──"
AGENT_COUNT=0

shopt -s nullglob
AGENT_FILES=( "${AGENTS_DIR}"/*.md )
shopt -u nullglob

if [ ${#AGENT_FILES[@]} -eq 0 ]; then
	warn "No agent files found in ${AGENTS_DIR}/"
else
	for agent_file in "${AGENT_FILES[@]}"; do
		AGENT_COUNT=$((AGENT_COUNT + 1))

		# Frontmatter delimiters
		if ! check_frontmatter_delimiters "$agent_file"; then
			err "${agent_file}: missing or malformed YAML frontmatter (--- delimiters)"
			continue
		fi

		# Required fields
		desc=$(frontmatter_key "$agent_file" "description")
		mode=$(frontmatter_key "$agent_file" "mode")
		check_required_field "$agent_file" "description" "$desc" || true
		check_required_field "$agent_file" "mode" "$mode" || true

		# Mode must be 'subagent' (the only valid value in this harness)
		if [ -n "$mode" ] && [ "$mode" != "subagent" ]; then
			err "${agent_file}: mode '${mode}' — expected 'subagent'"
		fi

		# Register the agent name (filename without .md)
		agent_name=$(basename "$agent_file" .md)
		register_name "$agent_name" "agent" "$agent_file"
	done
fi

ok "${AGENT_COUNT} agent(s) checked"

# ── Validate commands ────────────────────────────────────────────────────────

echo "── Validating commands ──"
CMD_COUNT=0

shopt -s nullglob
CMD_FILES=( "${COMMANDS_DIR}"/*.md )
shopt -u nullglob

if [ ${#CMD_FILES[@]} -eq 0 ]; then
	warn "No command files found in ${COMMANDS_DIR}/"
else
	for cmd_file in "${CMD_FILES[@]}"; do
		CMD_COUNT=$((CMD_COUNT + 1))

		# Frontmatter delimiters
		if ! check_frontmatter_delimiters "$cmd_file"; then
			err "${cmd_file}: missing or malformed YAML frontmatter (--- delimiters)"
			continue
		fi

		# Required fields
		desc=$(frontmatter_key "$cmd_file" "description")
		check_required_field "$cmd_file" "description" "$desc" || true

		# Register the command name (filename without .md)
		cmd_name=$(basename "$cmd_file" .md)
		register_name "$cmd_name" "command" "$cmd_file"
	done
fi

ok "${CMD_COUNT} command(s) checked"

# ── Cross-reference validation (soft: warnings only) ─────────────────────────

echo "── Checking cross-references ──"
CROSSREF_COUNT=0

# Build a set of all known names from the registry
KNOWN_NAMES=""
while IFS= read -r line; do
	[ -z "$line" ] && continue
	name=$(echo "$line" | awk '{print $1}')
	KNOWN_NAMES="${KNOWN_NAMES}${name}"$'\n'
done <<< "$NAME_REGISTRY"

# Scan explicit "Cross-refs" sections in skill files only.
# These sections list related skills/agents/commands by name — the structured
# dependencies that matter. Body-text backtick references (CSS properties,
# PHP functions, etc.) are not cross-references.
while IFS= read -r file; do
	[ -z "$file" ] && continue
	if ! grep -q '## Cross-refs' "$file" 2>/dev/null; then
		continue
	fi

	# Extract lines after "## Cross-refs" heading until next heading or end
	# and pull backtick-wrapped names from them
	in_crossref=0
	while IFS= read -r line; do
		# Toggle: enter the cross-refs section
		if echo "$line" | grep -q '^## Cross-refs'; then
			in_crossref=1
			continue
		fi
		# Exit on next ## heading (or opening --- frontmatter marker)
		if [ "$in_crossref" -eq 1 ] && echo "$line" | grep -q '^## '; then
			in_crossref=0
			continue
		fi
		[ "$in_crossref" -eq 0 ] && continue

		# Extract backtick-wrapped names from this line
		# Use basic grep -o (no -P for portability)
		refs=$(echo "$line" | grep -o '`[^`]*`' 2>/dev/null || true)
		if [ -z "$refs" ]; then
			continue
		fi

		while IFS= read -r ref; do
			[ -z "$ref" ] && continue
			ref_clean="${ref//\`/}"
			# Strip known prefixes: @agent, /command, - (list items)
			ref_clean="${ref_clean#@}"
			ref_clean="${ref_clean#/}"
			ref_clean="${ref_clean#- }"

			# Skip non-reference tokens (URLs, file paths, single-char, inline code)
			case "$ref_clean" in
				http://*|https://*) continue ;;
				*/*) continue ;;   # file paths like .opencode/docs/tests.md
				[A-Z]*) continue ;; # CONFIG_KEYS, class names (PascalCase)
				\$*|\`*) continue ;; # shell variables, nested backticks
				"") continue ;;
			esac

			# Check against known names
			if echo "$KNOWN_NAMES" | grep -qx "$ref_clean"; then
				CROSSREF_COUNT=$((CROSSREF_COUNT + 1))
			else
				warn "${file}: cross-refs unknown name '${ref}'"
			fi
		done <<< "$refs"
	done < "$file"
done < <(find "${HARNESS_DIR}" -name 'SKILL.md' -not -path '*/node_modules/*' 2>/dev/null)

ok "${CROSSREF_COUNT} cross-reference(s) verified"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
	echo "✓ Harness validation PASSED — 0 errors, 0 warnings"
	echo "═══════════════════════════════════════════════════════════════"
	exit 0
elif [ "$ERRORS" -eq 0 ]; then
	echo "✓ Harness validation PASSED with ${WARNINGS} warning(s)"
	echo "═══════════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ Harness validation FAILED — ${ERRORS} error(s), ${WARNINGS} warning(s)"
	echo "═══════════════════════════════════════════════════════════════"
	exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
