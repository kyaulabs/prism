#!/usr/bin/env bash
# $KYAULabs: validate-harness.sh kyau@nova 2026/07/04 -0700 Exp $

set -euo pipefail

# ── Prerequisite: bash 4+ required for associative arrays ──────────────────────

if [ "${BASH_VERSINFO[0]:-0}" -lt 4 ]; then
	echo "ERROR: Bash 4+ required (found ${BASH_VERSION:-unknown})" >&2
	exit 1
fi

# ── Prerequisite: Node.js required for YAML frontmatter parsing ─────────────────

if ! command -v node >/dev/null 2>&1; then
	echo "ERROR: Node.js required for YAML frontmatter parsing" >&2
	exit 1
fi

# ── Configuration ────────────────────────────────────────────────────────────

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -z "$REPO_ROOT" ]; then
	echo "ERROR: Not in a git repository. Must be run from within a git checkout." >&2
	exit 1
fi

HARNESS_DIR="${REPO_ROOT}/.opencode"
SKILLS_DIR="${HARNESS_DIR}/skills"
AGENTS_DIR="${HARNESS_DIR}/agents"
COMMANDS_DIR="${HARNESS_DIR}/commands"

ERRORS=0
WARNINGS=0
declare -A NAME_REGISTRY  # key=name, value="file:category"

# ── Helpers ──────────────────────────────────────────────────────────────────

err() { echo "  ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  WARN:  $*" >&2; WARNINGS=$((WARNINGS + 1)); }
ok() { echo "  OK:    $*"; }

# Extract a YAML frontmatter key's value from a file.
# Usage: frontmatter_key <file> <key>
# Returns the value or empty string if not found.
# Delegates to Node.js + js-yaml for proper YAML parsing (handles quoted
# values, folded scalars, block scalars, comments, and CRLF).
frontmatter_key() {
	local file="$1" key="$2"
	node "${REPO_ROOT}/.github/scripts/frontmatter-parser.js" "$file" "$key" 2>/dev/null || true
}

# Check that a file has paired --- frontmatter delimiters.
# Returns 0 if valid, 1 if not.
check_frontmatter_delimiters() {
	local file="$1"
	local open count
	count=$(grep -c '^---$' "$file" 2>/dev/null) || count=0
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
# Uses associative array for O(1) exact-match lookup (no regex injection).
register_name() {
	local name="$1" category="$2" file="$3"
	if [ -z "$name" ]; then
		return
	fi
	local existing="${NAME_REGISTRY[$name]:-}"
	if [ -n "$existing" ]; then
		local existing_file="${existing%%:*}"
		local existing_cat="${existing##*:}"
		err "${file}: name '${name}' already registered as ${existing_cat} in ${existing_file}"
	else
		NAME_REGISTRY[$name]="${file}:${category}"
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
declare -A SKILL_NAMES

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
			if [ -n "${SKILL_NAMES[$name]:-}" ]; then
				err "${skill_file}: duplicate skill name '${name}'"
			else
				SKILL_NAMES[$name]=1
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
declare -A KNOWN_NAMES
for name in "${!NAME_REGISTRY[@]}"; do
	KNOWN_NAMES[$name]=1
done

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
		# shellcheck disable=SC2016  # backticks are a literal grep pattern, not expansion
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

			# Check against known names (associative array O(1) lookup)
			if [ -n "${KNOWN_NAMES[$ref_clean]:-}" ]; then
				CROSSREF_COUNT=$((CROSSREF_COUNT + 1))
			else
				warn "${file}: cross-refs unknown name '${ref}'"
			fi
		done <<< "$refs"
	done < "$file"
done < <(find "${HARNESS_DIR}" -name 'SKILL.md' -not -path '*/node_modules/*' 2>/dev/null)

ok "${CROSSREF_COUNT} cross-reference(s) verified"

# ── AGENTS.md index cross-check ──────────────────────────────────────────────

echo "── Checking AGENTS.md index tables ──"
AGENTS_MD="${REPO_ROOT}/AGENTS.md"

if [ ! -f "$AGENTS_MD" ]; then
	err "AGENTS.md not found at $AGENTS_MD — cannot validate index tables"
else
	INDEX_ERRORS_BEFORE=$ERRORS

	# Extract markdown table rows under a given ## heading.
	# Matches the heading line exactly ($0 == "## " h), then collects all
	# | -prefixed rows until the next ## heading or EOF.
	# Non-| lines (description paragraphs between heading and table) are
	# silently skipped.
	extract_table() {
		local heading="$1"
		awk -v h="$heading" '
			$0 == "## " h { in_section = 1; next }
			in_section && /^## / { exit }
			in_section && /^\|/ { print }
		' "$AGENTS_MD"
	}

	# Extract first-column names from a pipe-delimited markdown table (stdin).
	# Splits on |, takes field 2, trims whitespace, strips backtick/@//
	# decoration. Skips the first two rows (header + separator) so table
	# header labels like "Skill" or "Command" are not treated as names.
	extract_first_column_names() {
		awk -F'|' '
			/^\|/ {
				line_num++
				if (line_num <= 2) next
				cell = $2
				gsub(/^[ \t]+|[ \t]+$/, "", cell)
				gsub(/^`|`$/, "", cell)
				gsub(/^@/, "", cell)
				gsub(/^\//, "", cell)
				if (cell != "") print cell
			}
		'
	}

	# ── Forward check: every filesystem entry must have a table row ──────────

	# Commands table
	CMD_TABLE_NAMES=$(extract_table "Commands" | extract_first_column_names)
	for cmd_file in "${COMMANDS_DIR}"/*.md; do
		[ -f "$cmd_file" ] || continue
		cmd_name=$(basename "$cmd_file" .md)
		if ! echo "$CMD_TABLE_NAMES" | grep -qxF "$cmd_name"; then
			err "AGENTS.md Commands table missing entry for '/${cmd_name}' (file: .opencode/commands/${cmd_name}.md)"
		fi
	done

	# Agents Available table
	AGENT_TABLE_NAMES=$(extract_table "Agents Available" | extract_first_column_names)
	for agent_file in "${AGENTS_DIR}"/*.md; do
		[ -f "$agent_file" ] || continue
		agent_name=$(basename "$agent_file" .md)
		if ! echo "$AGENT_TABLE_NAMES" | grep -qxF "$agent_name"; then
			err "AGENTS.md Agents Available table missing entry for '@${agent_name}' (file: .opencode/agents/${agent_name}.md)"
		fi
	done

	# Skills Available table
	shopt -s nullglob
	SKILL_TABLE_NAMES=$(extract_table "Skills Available" | extract_first_column_names)
	for skill_dir in "${SKILLS_DIR}"/*/; do
		[ -d "$skill_dir" ] || continue
		skill_name=$(basename "$skill_dir")
		if ! echo "$SKILL_TABLE_NAMES" | grep -qxF "$skill_name"; then
			err "AGENTS.md Skills Available table missing entry for '\`${skill_name}\`' (dir: .opencode/skills/${skill_name}/)"
		fi
	done
	shopt -u nullglob

	# ── Reverse check: every table row must have a filesystem counterpart ────

	for name in $CMD_TABLE_NAMES; do
		if [ ! -f "${COMMANDS_DIR}/${name}.md" ]; then
			warn "AGENTS.md Commands table has entry '/${name}' but no file at .opencode/commands/${name}.md"
		fi
	done

	for name in $AGENT_TABLE_NAMES; do
		if [ ! -f "${AGENTS_DIR}/${name}.md" ]; then
			warn "AGENTS.md Agents Available table has entry '@${name}' but no file at .opencode/agents/${name}.md"
		fi
	done

	for name in $SKILL_TABLE_NAMES; do
		if [ ! -d "${SKILLS_DIR}/${name}" ]; then
			warn "AGENTS.md Skills Available table has entry '\`${name}\`' but no directory at .opencode/skills/${name}/"
		fi
	done
fi

if [ -n "${INDEX_ERRORS_BEFORE:-}" ] && [ "${ERRORS:-0}" -eq "${INDEX_ERRORS_BEFORE}" ]; then
	ok "AGENTS.md index tables cross-checked"
fi

# ── Guard: fail on vacuous pass (all three categories empty) ──────────────────

if [ "$SKILL_COUNT" -eq 0 ] && [ "$AGENT_COUNT" -eq 0 ] && [ "$CMD_COUNT" -eq 0 ]; then
	err "No skills, agents, or commands found — harness directory may be missing or empty"
fi

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
