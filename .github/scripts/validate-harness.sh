#!/usr/bin/env bash
# $KYAULabs: validate-harness.sh kyau@nova 2026/07/14 -0700 Exp $









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

# ── Prerequisite: js-yaml must be resolvable for frontmatter parsing ─────────

if ! (cd "$REPO_ROOT" && node -e "require('js-yaml')") 2>&1; then
	echo "ERROR: Node.js module 'js-yaml' is not resolvable from ${REPO_ROOT}." >&2
	echo "       Install dependencies: npm install" >&2
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
	open=$(head -n 1 "$file")
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

# ── Doc-accuracy: command file path references ────────────────────────────────

echo "── Checking command file path references ──"
PATH_WARN_BEFORE=$WARNINGS

# Check that a file referenced in a command exists in the repo root.
# Skips variables, placeholders, globs, and paths with directory separators.
# Usage: check_command_path <cmd_file> <cmd_type> <filename>
check_command_path() {
	local cmd_file="$1" cmd_type="$2" filename="$3"
	[ -z "$filename" ] && return
	# Skip variables, placeholders, globs, paths, quotes
	case "$filename" in
		*'$'*|*'<'*|'>'*|'*'*|'?'*|*'/'*|*"'"*|*'"'*) return ;;
	esac
	# Must look like a bare filename (word chars + dot + word chars)
	echo "$filename" | grep -qE '^[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+$' || return
	# Check existence in repo root
	if [ ! -f "${REPO_ROOT}/${filename}" ]; then
		warn "${cmd_file}: ${cmd_type} targets '${filename}' which does not exist in repo root"
	fi
}

shopt -s nullglob
CMD_PATH_FILES=( "${COMMANDS_DIR}"/*.md )
shopt -u nullglob

for cmd_file in "${CMD_PATH_FILES[@]}"; do
	[ -f "$cmd_file" ] || continue

	# Extract bash code blocks and check for sed -i / git add targeting
	# nonexistent bare filenames.
	bash_lines=$(awk '
		/^```bash/ { in_block = 1; next }
		/^```/ && in_block { in_block = 0; next }
		in_block { print }
	' "$cmd_file")

	while IFS= read -r line; do
		[ -z "$line" ] && continue

		# Check sed -i targets: the filename is the last whitespace-delimited
		# token on the line (after the quoted sed expression).
		if echo "$line" | grep -q 'sed -i'; then
			filename=$(echo "$line" | awk '{print $NF}')
			check_command_path "$cmd_file" "sed -i" "$filename"
		fi

		# Check git add targets: extract all non-flag tokens after "git add"
		if echo "$line" | grep -q 'git add'; then
			stripped=$(echo "$line" | sed 's/.*git add//' | sed 's/ -[a-zA-Z]*//g')
			for token in $stripped; do
				check_command_path "$cmd_file" "git add" "$token"
			done
		fi
	done <<< "$bash_lines"
done

if [ "${WARNINGS:-0}" -eq "${PATH_WARN_BEFORE:-0}" ]; then
	ok "Command file path references valid"
fi

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
done < <(find "${HARNESS_DIR}" -name 'SKILL.md' ! -path '*/node_modules/*' 2>/dev/null)

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
				gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
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

# ── README.md index cross-check ───────────────────────────────────────────────

echo "── Checking README.md index tables ──"
README_MD="${REPO_ROOT}/README.md"

if [ ! -f "$README_MD" ]; then
	warn "README.md not found at $README_MD — cannot validate index tables"
else
	README_INDEX_ERRORS_BEFORE=$ERRORS

	# Extract markdown table rows under a given ### heading (README uses H3).
	# Matches the heading line exactly, then collects all | -prefixed rows
	# until the next ## or ### heading or EOF.
	extract_table_h3() {
		local heading="$1"
		awk -v h="$heading" '
			$0 == "### " h { in_section = 1; next }
			in_section && /^### / { exit }
			in_section && /^## / { exit }
			in_section && /^\|/ { print }
		' "$README_MD"
	}

	# Extract first-column names from a pipe-delimited markdown table (stdin).
	# Splits on |, takes field 2, trims whitespace, strips backtick/@//
	# decoration. Skips the first two rows (header + separator).
	extract_first_col_names() {
		awk -F'|' '
			/^\|/ {
				line_num++
				if (line_num <= 2) next
				cell = $2
				gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
				gsub(/^`|`$/, "", cell)
				gsub(/^@/, "", cell)
				gsub(/^\//, "", cell)
				if (cell != "") print cell
			}
		'
	}

	# Extract ALL backtick-wrapped names from ALL columns of a markdown
	# table (stdin). Used for the README skills table which uses a
	# category format (multiple skills per row in column 2+).
	extract_all_backtick_names() {
		awk -F'|' '
			/^\|/ {
				line_num++
				if (line_num <= 2) next
				for (i = 2; i <= NF; i++) {
					cell = $i
					while (match(cell, /`[^`]+`/)) {
						name = substr(cell, RSTART + 1, RLENGTH - 2)
						print name
						cell = substr(cell, RSTART + RLENGTH)
					}
				}
			}
		'
	}

	# ── Forward check: every filesystem entry must have a README table row ──

	# Slash commands table (### Slash commands)
	README_CMD_NAMES=$(extract_table_h3 "Slash commands" | extract_first_col_names)
	for cmd_file in "${COMMANDS_DIR}"/*.md; do
		[ -f "$cmd_file" ] || continue
		cmd_name=$(basename "$cmd_file" .md)
		if ! echo "$README_CMD_NAMES" | grep -qxF "$cmd_name"; then
			err "README.md Slash commands table missing entry for '/${cmd_name}' (file: .opencode/commands/${cmd_name}.md)"
		fi
	done

	# Custom agents table (### Custom agents)
	README_AGENT_NAMES=$(extract_table_h3 "Custom agents" | extract_first_col_names)
	for agent_file in "${AGENTS_DIR}"/*.md; do
		[ -f "$agent_file" ] || continue
		agent_name=$(basename "$agent_file" .md)
		if ! echo "$README_AGENT_NAMES" | grep -qxF "$agent_name"; then
			err "README.md Custom agents table missing entry for '@${agent_name}' (file: .opencode/agents/${agent_name}.md)"
		fi
	done

	# Skills table (### Skills (on-demand)) — category format, all columns
	shopt -s nullglob
	README_SKILL_NAMES=$(extract_table_h3 "Skills (on-demand)" | extract_all_backtick_names)
	for skill_dir in "${SKILLS_DIR}"/*/; do
		[ -d "$skill_dir" ] || continue
		skill_name=$(basename "$skill_dir")
		if ! echo "$README_SKILL_NAMES" | grep -qxF "$skill_name"; then
			err "README.md Skills table missing entry for '\`${skill_name}\`' (dir: .opencode/skills/${skill_name}/)"
		fi
	done
	shopt -u nullglob

	# ── Reverse check: every README table row must have a filesystem counterpart ──

	for name in $README_CMD_NAMES; do
		if [ ! -f "${COMMANDS_DIR}/${name}.md" ]; then
			warn "README.md Slash commands table has entry '/${name}' but no file at .opencode/commands/${name}.md"
		fi
	done

	for name in $README_AGENT_NAMES; do
		if [ ! -f "${AGENTS_DIR}/${name}.md" ]; then
			warn "README.md Custom agents table has entry '@${name}' but no file at .opencode/agents/${name}.md"
		fi
	done

	for name in $README_SKILL_NAMES; do
		if [ ! -d "${SKILLS_DIR}/${name}" ]; then
			warn "README.md Skills table has entry '\`${name}\`' but no directory at .opencode/skills/${name}/"
		fi
	done

	if [ "${ERRORS:-0}" -eq "${README_INDEX_ERRORS_BEFORE}" ]; then
		ok "README.md index tables cross-checked"
	fi
fi

# ── Guard: fail on vacuous pass (all three categories empty) ──────────────────

if [ "$SKILL_COUNT" -eq 0 ] && [ "$AGENT_COUNT" -eq 0 ] && [ "$CMD_COUNT" -eq 0 ]; then
	err "No skills, agents, or commands found — harness directory may be missing or empty"
fi

# ── Check bash permission patterns ────────────────────────────────────────────

echo "── Checking bash permission patterns ──"

# Check opencode.json for bash permission keys ending in " *"
JSON_BAD=$(grep -noE '"[^"]* \*"[[:space:]]*:' "${REPO_ROOT}/opencode.json" 2>/dev/null) || true
if [ -n "$JSON_BAD" ]; then
	while IFS= read -r line; do
		err "opencode.json:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): ${line#*:}"
	done <<< "$JSON_BAD"
fi

# Check agent .md file frontmatter for bash permission keys ending in " *"
AGENTS_DIR_LOCAL="${HARNESS_DIR}/agents"
shopt -s nullglob
AGENT_MD_FILES=( "${AGENTS_DIR_LOCAL}"/*.md )
shopt -u nullglob

if [ ${#AGENT_MD_FILES[@]} -eq 0 ]; then
	warn "No agent files found in ${AGENTS_DIR_LOCAL}/"
else
	for agent_file in "${AGENT_MD_FILES[@]}"; do
		# Extract frontmatter only (lines between first and second ---)
		fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
		bad=$(echo "$fm" | grep -noE '"[^"]* \*"' 2>/dev/null) || true
		if [ -n "$bad" ]; then
			while IFS= read -r line; do
				err "${agent_file}:${line%%:*}: bash permission pattern ends in ' *' (cannot match bare command): ${line#*:}"
			done <<< "$bad"
		fi
	done
fi

# ── Check read-only agent permission contract ────────────────────────────────

echo "── Checking read-only agent permission contracts ──"
RO_CHECKED=0
RO_VIOLATIONS=0

# Read-only keyword set — agents whose description contains any of these
# (case-insensitive) must carry edit: deny AND a bash catch-all deny.
RO_KEYWORDS='read-only|report only|does not modify|makes no code changes|does not auto-fix|does not automatically fix'

for agent_file in "${AGENT_MD_FILES[@]}"; do
	desc=$(frontmatter_key "$agent_file" "description")

	# Skip if description doesn't claim read-only
	if [ -z "$desc" ] || ! echo "$desc" | grep -qiE "$RO_KEYWORDS"; then
		continue
	fi

	RO_CHECKED=$((RO_CHECKED + 1))
	agent_name=$(basename "$agent_file" .md)

	# Extract frontmatter text (between first two --- delimiters)
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")

	# Check 1: edit: deny must be present
	if ! echo "$fm" | grep -qE '^[[:space:]]*edit:[[:space:]]*"?deny"?[[:space:]]*$'; then
		err "${agent_file}: agent '${agent_name}' claims read-only in description but lacks 'edit: deny' in permission block"
		RO_VIOLATIONS=$((RO_VIOLATIONS + 1))
		continue
	fi

	# Check 2: bash must be restricted — either "bash: deny" (full deny)
	# or a catch-all deny entry ("*": deny or "*": "deny")
	bash_restricted=0
	if echo "$fm" | grep -qE '^[[:space:]]*bash:[[:space:]]*"?deny"?[[:space:]]*$'; then
		bash_restricted=1
	fi
	if echo "$fm" | grep -qE '"\*"[[:space:]]*:[[:space:]]*"?deny"?'; then
		bash_restricted=1
	fi
	if [ "$bash_restricted" -eq 0 ]; then
		err "${agent_file}: agent '${agent_name}' claims read-only in description but bash is not restricted (needs '\"*\": deny' catch-all or 'bash: deny')"
		RO_VIOLATIONS=$((RO_VIOLATIONS + 1))
	fi
done

if [ "$RO_CHECKED" -eq 0 ]; then
	warn "No read-only agents found — keyword detection may need updating"
else
	ok "${RO_CHECKED} read-only agent(s) checked, ${RO_VIOLATIONS} violation(s)"
fi

# ── Check git add/git stage verdict parity ────────────────────────────────────

echo "── Checking git add/git stage verdict parity ──"

# git add and git stage are synonyms. Where both patterns coexist, their
# verdicts must match — a mismatch is a latent bypass or false-deny.

# opencode.json (inline agent permission blocks)
add_v=$(grep -oE '"git add\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "${REPO_ROOT}/opencode.json" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
stage_v=$(grep -oE '"git stage\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' "${REPO_ROOT}/opencode.json" 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
if [ -n "$add_v" ] && [ -n "$stage_v" ] && [ "$add_v" != "$stage_v" ]; then
	err "opencode.json: 'git add*' ($add_v) and 'git stage*' ($stage_v) are git synonyms with different verdicts"
fi

# Agent .md frontmatter
for agent_file in "${AGENT_MD_FILES[@]}"; do
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
	a_v=$(echo "$fm" | grep -oE '"git add\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
	s_v=$(echo "$fm" | grep -oE '"git stage\*"[[:space:]]*:[[:space:]]*"?[a-z]+"?' 2>/dev/null | grep -oE '(allow|ask|deny)' | head -1) || true
	if [ -n "$a_v" ] && [ -n "$s_v" ] && [ "$a_v" != "$s_v" ]; then
		err "${agent_file}: 'git add*' ($a_v) and 'git stage*' ($s_v) are git synonyms with different verdicts"
	fi
done

# ── Check for bare "git status" without wildcard ──────────────────────────────

echo "── Checking for bare 'git status' permission patterns ──"

# "git status" (no wildcard) matches only the exact command, silently blocking
# read-only variants like "git status --porcelain". Use "git status*" instead.
for agent_file in "${AGENT_MD_FILES[@]}"; do
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
	# Key "git status" with closing quote immediately before the colon excludes
	# the wildcard form "git status*" (which has * before the closing quote).
	if echo "$fm" | grep -qE '"git status"[[:space:]]*:'; then
		err "${agent_file}: bare 'git status' permission cannot match 'git status --porcelain'; use 'git status*' wildcard"
	fi
done

# ── Check throwaway-dir edit-allow has matching rm permission ─────────────────

echo "── Checking throwaway-dir edit/rm permission consistency ──"

# An agent with edit allow on throwaway scaffolding dirs (prototypes/**,
# tests/**) must also have a scoped rm bash permission, else mandatory
# cleanup phases (e.g. @debug Phase 6) stall with no permitted delete path.
for agent_file in "${AGENT_MD_FILES[@]}"; do
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")
	if echo "$fm" | grep -qE '"prototypes/\*\*"[[:space:]]*:[[:space:]]*"?allow"?'; then
		if ! echo "$fm" | grep -qE '"rm prototypes/\*"'; then
			err "${agent_file}: grants edit allow on 'prototypes/**' but lacks 'rm prototypes/*' bash permission (cleanup blocked)"
		fi
	fi
	if echo "$fm" | grep -qE '"tests/\*\*"[[:space:]]*:[[:space:]]*"?allow"?'; then
		if ! echo "$fm" | grep -qE '"rm tests/\*"'; then
			err "${agent_file}: grants edit allow on 'tests/**' but lacks 'rm tests/*' bash permission (cleanup blocked)"
		fi
	fi
done

# ── Checking for stale plan files ─────────────────────────────────────────────

STALE_PLANS=0
if [[ -d "$REPO_ROOT/docs/plans" ]]; then
	while IFS= read -r -d '' plan_file; do
		if grep -q '\- \[ \]' "$plan_file" 2>/dev/null; then
			warn "Stale plan: $(basename "$plan_file") has unchecked tasks and is older than 7 days — delete or archive it after finishing-a-development-branch."
			STALE_PLANS=$((STALE_PLANS + 1))
		fi
	done < <(find "$REPO_ROOT/docs/plans" -maxdepth 1 -name '*.md' -mtime +7 -print0 2>/dev/null)

	if [[ $STALE_PLANS -eq 0 ]]; then
		ok "No stale plan files in docs/plans/"
	fi
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
