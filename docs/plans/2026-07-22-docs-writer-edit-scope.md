# docs-writer Edit Scope Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the unconstrained-edit security gap on `@docs-writer` by
scoping its `edit` permission to the file classes it actually writes, add the
missing `webfetch`/`task` denials, record the decision in ADR-0006, and extend
the harness validator so the drift class cannot recur.

**Architecture:** `@docs-writer` ships only `bash: deny` + `lsp: allow` and no
`edit` key, so `edit` inherits opencode's permissive default — the agent can
rewrite any file despite its "documentation only" mandate (issue #198). The fix
replaces the absent `edit` with a scoped object (catch-all `deny` + explicit
allows) and adds `webfetch: deny` / `task: deny`. ADR-0006 previously rejected
a *flat* `edit: deny` for docs-writer (it would break the agent's core
function); this plan supersedes that with a *scoped allow* — the agent keeps
write capability but only to the five source extensions (`.php`, `.js`,
`.scss`, `.sh`, `.ts`) and `docs/**`. The harness validator gains a new check
that flags any non-allowlisted, non-read-only agent shipping an unscoped
`edit` (absent, flat `allow`, or an object lacking a `"*"` catch-all).

**Tech Stack:** Bash (validate-harness.sh + Shell tests), YAML frontmatter,
opencode permission model.

## Global constraints

- **opencode wildcard semantics are NOT gitignore-style.** Per
  `.opencode/skills/opencode-docs/docs/permissions.mdx:93-99`: `*` matches
  zero or more of **any** character (including `/`); `/` is literal. Therefore
  `*.php` matches any-depth PHP files, and `**/*.php` is WRONG (it demands a
  literal `/` and would miss root-level files like `index.php`). Use single-`*`
  extension patterns: `*.php`, `*.js`, `*.scss`, `*.sh`, `*.ts`. Directory
  prefix uses `docs/**` (matches `debug.md`'s `tests/**` precedent).
- **RCS headers** required on every new source file (`.php`, `.js`, `.scss`,
  `.sh`, `.ts`) — see `rcs-header` skill. Markdown/config files do NOT carry
  RCS headers. Every file ends with a vim modeline.
- **Signed commits** (`git commit -S`), Conventional Commits format, footers
  `Authored-by:`, `Tested-by:`, `Signed-off-by:` (resolved via
  `bash .github/scripts/resolve-identity.sh`). This issue is Type=Security →
  commit type `fix`. Non-closing reference: `Refs: #198`.
- **Commit quoting:** use the canonical `$'...\n...'` ANSI-C quoting form
  (commit-msg hook rejects literal `\n` per ADR-0025).
- **TDD mandatory:** Red → Green → Refactor, no exceptions.

---

## ⚠️ Deviation from the approved literal (READ BEFORE TASK 2)

The approved scope used `**/*.php` / `**/*.js` / etc. That is **incorrect for
opencode** (see Global constraints). This plan uses the corrected `*.php` form.
If the reviewer prefers the literal `**/*.php` despite the documented gap,
say so at the approval gate — otherwise Task 2 proceeds with `*.php`.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `adr/0006-readonly-agent-permission-contract.md` | Modify | Append amendment recording the scoped-allow decision + write-agent allowlist |
| `.opencode/agents/docs-writer.md` | Modify | Add scoped `edit` object + `webfetch`/`task` deny |
| `.github/scripts/validate-harness.sh` | Modify | New check: unscoped write-capable `edit` (with general-write allowlist) |
| `tests/Shell/docs_writer_edit_scope_test.sh` | Create | Asserts the real docs-writer.md frontmatter is scoped (Red→Green for Task 2) |
| `tests/Shell/validate-harness_test.sh` | Modify | Add Test 36/37/38 for the new validator check (Red→Green for Task 3) |

**Write-agent allowlist (general-purpose, legitimately broad):** `tdd`,
`resolve-merge-conflicts`. Both currently ship no `edit` key because their job
is to edit arbitrary files. They are excluded from the new check by name.
`docs-writer` is NOT allowlisted — it gets scoped (Task 2) so it passes on its
own merits.

---

### Task 1: Amend ADR-0006 with the scoped-allow decision

**Files:**
- Modify: `adr/0006-readonly-agent-permission-contract.md` (append to
  `## Amendments` section, after the 2026-07-21 #184 amendment)

**Interfaces:** None (decision record).

- [ ] **Step 1: Append the amendment block**

Append to the end of the `## Amendments` section in
`adr/0006-readonly-agent-permission-contract.md` (after the existing
`2026-07-21 (issue #184)` entry):

```markdown
- **2026-07-22 (issue #198):** The Decision's rejected alternative "Lock down
  docs-writer itself (add `edit: deny`)" is partially superseded. docs-writer
  remains write-capable, but its `edit` permission is now a **scoped object** —
  a catch-all `"*": deny` plus explicit allows for the five source extensions
  the rcs-header skill governs (`.php`, `.js`, `.scss`, `.sh`, `.ts`) and
  `docs/**`. This closes the unconstrained-edit gap (the agent previously
  inherited the permissive default and could rewrite any file) without breaking
  its PHPDoc/RCS-header function. The blanket `edit: deny` rejection still
  holds for any agent whose job is to edit source broadly; the general-purpose
  write agents `@tdd` and `@resolve-merge-conflicts` remain intentionally
  unscoped (allowlisted) because they must edit arbitrary files. The
  validate-harness check was extended (Decision point 4) to flag any
  non-allowlisted, non-read-only agent that ships an unscoped `edit` (absent,
  flat `allow`, or an object lacking a `"*": deny`/`"*": ask` catch-all) so
  this drift class cannot recur.
```

- [ ] **Step 2: Verify the ADR renders and follows format**

Read the appended block. Confirm: it is a dated bullet under `## Amendments`,
references issue #198, and does not contradict the existing rejected
alternative (it supersedes *narrowly*, as explained). No automated test — this
is a decision record.

- [ ] **Step 3: Commit**

```bash
git add adr/0006-readonly-agent-permission-contract.md
git commit -S -m $'docs(adr): amend ADR-0006 for docs-writer scoped edit (#198)\n\nRecords the scoped-allow decision for @docs-writer: edit is now a scoped\nobject (catch-all deny + allows for the five rcs-header source extensions\nand docs/**) rather than flat deny. The blanket edit: deny rejection still\nholds for general-purpose write agents (@tdd, @resolve-merge-conflicts),\nwhich are now allowlisted. The validate-harness check is extended to flag\nnon-allowlisted, non-read-only agents with unscoped edit so the drift\nclass cannot recur.\n\nRefs: #198\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Scope `@docs-writer` edit + add webfetch/task deny

**Files:**
- Modify: `.opencode/agents/docs-writer.md` (frontmatter, lines 5-7)
- Test: `tests/Shell/docs_writer_edit_scope_test.sh` (create)

**Interfaces:**
- Produces: a docs-writer whose `edit` is a scoped object — later consumed by
  Task 3's validator (must NOT be flagged as unscoped).

- [ ] **Step 1: Write the failing test**

Create `tests/Shell/docs_writer_edit_scope_test.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: docs_writer_edit_scope_test.sh kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $

# Asserts the REAL @docs-writer agent frontmatter carries a scoped edit
# (catch-all deny + source-extension allows) and webfetch/task denials.
# Regression guard for issue #198 (unconstrained edit scope).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

AGENT="$REPO_ROOT/.opencode/agents/docs-writer.md"

if [ ! -f "$AGENT" ]; then
	fail "Cannot find docs-writer.md at $AGENT"
	exit 1
fi

echo ""
echo "── docs-writer edit scope (issue #198) ──"

failures=0

# Catch-all deny must be present (scoped edit marker).
if ! grep -qE '^[[:space:]]*"\*":[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing scoped-edit catch-all ('\"*\": deny')"
	failures=$((failures + 1))
fi

# Each source extension the rcs-header skill governs must be allowed.
for ext in php js scss sh ts; do
	if ! grep -qE "^[[:space:]]*\"[*]\.${ext}\":[[:space:]]*allow[[:space:]]*\$" "$AGENT"; then
		fail "docs-writer.md: missing allow for '*.${ext}'"
		failures=$((failures + 1))
	fi
done

# docs/** must be allowed (docs-writer writes project documentation).
if ! grep -qE '^[[:space:]]*"docs/\*\*":[[:space:]]*allow[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing allow for 'docs/**'"
	failures=$((failures + 1))
fi

# webfetch and task must be denied.
if ! grep -qE '^[[:space:]]*webfetch:[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing 'webfetch: deny'"
	failures=$((failures + 1))
fi
if ! grep -qE '^[[:space:]]*task:[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing 'task: deny'"
	failures=$((failures + 1))
fi

if [ "$failures" -eq 0 ]; then
	pass "docs-writer edit is scoped + webfetch/task denied"
fi

print_summary "docs-writer-edit-scope"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash tests/Shell/docs_writer_edit_scope_test.sh`
Expected: FAIL — multiple "missing" lines, because docs-writer.md currently
has no `edit` block, no `webfetch`, no `task`.

- [ ] **Step 3: Apply the scoped edit to docs-writer.md**

Replace the frontmatter permission block in `.opencode/agents/docs-writer.md`.
The OLD block (lines 5-7):

```yaml
permission:
  bash: deny
  lsp: allow
```

becomes:

```yaml
permission:
  edit:
    "*": deny
    "*.php": allow
    "*.js": allow
    "*.scss": allow
    "*.sh": allow
    "*.ts": allow
    "docs/**": allow
  bash: deny
  webfetch: deny
  task: deny
  lsp: allow
```

Leave the body (everything after the closing `---`) unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash tests/Shell/docs_writer_edit_scope_test.sh`
Expected: PASS — "docs-writer edit is scoped + webfetch/task denied".

- [ ] **Step 5: Commit**

```bash
git add .opencode/agents/docs-writer.md tests/Shell/docs_writer_edit_scope_test.sh
git commit -S -m $'fix(security): scope @docs-writer edit + deny webfetch/task (#198)\n\n@docs-writer shipped only bash: deny + lsp: allow with no edit key, so\nedit inherited the permissive default and could rewrite any file despite\nits documentation-only mandate. Scope edit to a catch-all deny plus allows\nfor the five rcs-header source extensions (.php/.js/.scss/.sh/.ts) and\ndocs/**, matching the file classes the agent legitimately writes. Add\nwebfetch: deny and task: deny per the read-only/audit contract posture.\n\nNote: opencode wildcards are not gitignore-style (* matches any char\nincluding /), so extension patterns use *.ext, not **/*.ext.\n\nRefs: #198\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Extend validate-harness.sh to flag unscoped write-capable edits

**Files:**
- Modify: `.github/scripts/validate-harness.sh` (insert new check after the
  `.md` read-only-contract summary, currently line 713, before line 715)
- Test: `tests/Shell/validate-harness_test.sh` (add Test 36/37/38 before the
  `# ── Summary ──` block, currently line 1498)

**Interfaces:**
- Consumes: Task 2's scoped docs-writer.md (must pass the new check).
- Produces: validator coverage so any future non-allowlisted, non-read-only
  agent with an absent/flat-allow/no-catchall `edit` fails validation.

**The check rule (encode exactly):**

An agent's `edit` is **controlled** if ANY of:
- flat `edit: deny`
- flat `edit: ask`
- an object containing a `"*": deny`, `"*": "deny"`, `"*": ask`, or
  `"*": "ask"` catch-all

Otherwise it is **unscoped** (absent, flat `allow`, or object without
catch-all). Flag unscoped agents that are NOT in the write allowlist
(`tdd`, `resolve-merge-conflicts`).

- [ ] **Step 1: Write the failing tests (Red)**

Insert the following three tests into `tests/Shell/validate-harness_test.sh`
immediately BEFORE the `# ── Summary ──` line:

```bash
# ── Test 36: Write-capable agent with absent edit is flagged ─────────────────

echo ""
echo "── Test 36: Write-capable agent (absent edit) flagged as unscoped ──"
T36=$(mktemp -d)
register_temp_dir "$T36"
git_init_test_repo "$T36"
(
	cd "$T36"
	mkdir -p .opencode/agents
	setup_validator_env

	# Non-read-only agent with a permission block but NO edit key
	# (the docs-writer drift class). Must be flagged.
	cat > .opencode/agents/doc-bot.md <<'EOF'
---
description: Generates documentation and headers for source files.
mode: subagent
permission:
  bash: deny
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "unscoped edit"; then
		pass "Caught write-capable agent with absent edit (unscoped)"
	elif echo "$output" | grep -qF "unscoped edit"; then
		fail "Detected unscoped edit but exited 0"
	else
		fail "Did not detect write-capable agent with absent edit"
	fi
)

# ── Test 37: Write-capable agent with scoped edit (catch-all deny) passes ────

echo "── Test 37: Write-capable agent with scoped edit not flagged ──"
T37=$(mktemp -d)
register_temp_dir "$T37"
git_init_test_repo "$T37"
(
	cd "$T37"
	mkdir -p .opencode/agents
	setup_validator_env

	# Same agent but with a properly scoped edit (catch-all deny + allows).
	cat > .opencode/agents/doc-bot.md <<'EOF'
---
description: Generates documentation and headers for source files.
mode: subagent
permission:
  edit:
    "*": deny
    "*.php": allow
    "docs/**": allow
  bash: deny
  webfetch: deny
  task: deny
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "doc-bot" | grep -qF "unscoped edit"; then
		fail "Scoped write-capable agent was falsely flagged as unscoped"
	else
		pass "Scoped write-capable agent not flagged"
	fi
)

# ── Test 38: Allowlisted general-write agent (tdd) with absent edit passes ───

echo "── Test 38: Allowlisted general-write agent (tdd) not flagged ──"
T38=$(mktemp -d)
register_temp_dir "$T38"
git_init_test_repo "$T38"
(
	cd "$T38"
	mkdir -p .opencode/agents
	setup_validator_env

	# tdd is a general-purpose write agent — intentionally unscoped (allowlisted).
	cat > .opencode/agents/tdd.md <<'EOF'
---
description: Write tests first, then implement. Edits arbitrary source files.
mode: subagent
permission:
  bash:
    "git add*": "allow"
    "git commit*": "allow"
  lsp: allow
---
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "tdd.md" | grep -qF "unscoped edit"; then
		fail "Allowlisted general-write agent (tdd) was falsely flagged"
	else
		pass "Allowlisted general-write agent (tdd) not flagged"
	fi
)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Test 36 FAILS (no "unscoped edit" detection — check does not exist
yet), Test 37 PASSES trivially (nothing is flagged either way), Test 38 PASSES
trivially. The Red signal is Test 36.

- [ ] **Step 3: Implement the check (Green)**

In `.github/scripts/validate-harness.sh`, insert this new block immediately
AFTER the `.md` read-only-contract summary (after the line
`ok "${RO_CHECKED} read-only agent(s) checked, ${RO_VIOLATIONS} violation(s)"`
inside that if/else, i.e. after current line 713) and BEFORE the
`# ── Check inline read-only agent permission contract` comment (current line
715):

```bash
# ── Check write-capable agent edit scoping ───────────────────────────────────

echo "── Checking write-capable agent edit scoping ──"
WEDIT_CHECKED=0
WEDIT_VIOLATIONS=0

# General-purpose write agents that must edit arbitrary files (allowlisted).
# Not subject to the scoped-edit requirement.
WRITE_ALLOWLIST='tdd|resolve-merge-conflicts'

for agent_file in "${AGENT_MD_FILES[@]}"; do
	agent_name=$(basename "$agent_file" .md)

	# Skip allowlisted general-purpose write agents.
	if printf '%s' "$agent_name" | grep -qE "^($WRITE_ALLOWLIST)$"; then
		continue
	fi

	# Extract frontmatter text (between first two --- delimiters).
	fm=$(awk 'NR==1 && /^---$/ { fm=1; next } fm && /^---$/ { exit } fm { print }' "$agent_file")

	# Controlled = flat deny, flat ask, or an object with a "*" catch-all
	# (deny or ask). Everything else is unscoped (absent / flat allow /
	# object without catch-all).
	controlled=0
	if printf '%s\n' "$fm" | grep -qE '^[[:space:]]*edit:[[:space:]]*"?(deny|ask)"?[[:space:]]*$'; then
		controlled=1
	fi
	if printf '%s\n' "$fm" | grep -qE '"\*"[[:space:]]*:[[:space:]]*"?(deny|ask)"?'; then
		controlled=1
	fi

	# Only write-capable agents (NOT controlled) are in scope for this check.
	[ "$controlled" -eq 1 ] && continue

	WEDIT_CHECKED=$((WEDIT_CHECKED + 1))
	err "${agent_file}: agent '${agent_name}' is write-capable but has an unscoped edit permission — add a scoped object with a '\"*\": deny' catch-all (or 'edit: deny')"
	WEDIT_VIOLATIONS=$((WEDIT_VIOLATIONS + 1))
done

if [ "$WEDIT_CHECKED" -eq 0 ]; then
	ok "No unscoped write-capable agents found"
else
	ok "${WEDIT_CHECKED} unscoped write-capable agent(s) found, ${WEDIT_VIOLATIONS} flagged"
fi
```

- [ ] **Step 4: Run the validator tests to verify Green**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: ALL PASS — Test 36 now catches "unscoped edit", Test 37 not flagged
(scoped), Test 38 not flagged (allowlisted).

- [ ] **Step 5: Run the validator against the REAL repo**

Run: `bash .github/scripts/validate-harness.sh`
Expected: the new "Checking write-capable agent edit scoping" section reports
"No unscoped write-capable agents found" (0 flagged). docs-writer is now scoped
(Task 2); tdd and resolve-merge-conflicts are allowlisted. If any agent IS
flagged, do NOT suppress it — investigate (it may be a real new gap).

- [ ] **Step 6: Run the docs-writer regression test once more (cross-check)**

Run: `bash tests/Shell/docs_writer_edit_scope_test.sh`
Expected: PASS (unchanged from Task 2; confirms Task 3 didn't regress it).

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(security): flag unscoped write-capable agent edits in validator\n\nExtends validate-harness.sh (ADR-0006 Decision #4) with a check that flags\nany non-allowlisted, non-read-only agent whose edit permission is unscoped\n(absent, flat allow, or an object lacking a \"*\": deny/ask catch-all). The\ngeneral-purpose write agents @tdd and @resolve-merge-conflicts are\nallowlisted because they must edit arbitrary files. Prevents recurrence of\nthe docs-writer drift class (issue #198).\n\nRefs: #198\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Verification (after all tasks)

1. `bash tests/Shell/docs_writer_edit_scope_test.sh` → PASS
2. `bash tests/Shell/validate-harness_test.sh` → all PASS (incl. Test 36/37/38)
3. `bash .github/scripts/validate-harness.sh` → "No unscoped write-capable
   agents found"
4. `/check` (php-cs-fixer + stylelint + eslint + pest --coverage) → green
5. `@code-review` on the branch before push

## Out of scope

- Scoping `@tdd` / `@resolve-merge-conflicts` (they are intentionally broad;
  allowlisted).
- Any change to the inline (opencode.jsonc) agent contract — the new check
  covers `.md` agents only, matching issue #198's scope. An inline-agent
  equivalent can be added later if an inline write-capable agent ever ships an
  unscoped edit.
