# Ticketing Skill Shell Injection Fix Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red -> Green -> Refactor.

**Goal:** Close the shell injection vulnerability in ticketing/SKILL.md by replacing inline-interpolated user content (--title "<title>" --body "<body>") with safe file/variable-based patterns, fix GraphQL examples to use -F variable bindings for all placeholders, and extend the shell injection test to cover gh issue create (the gap from issue #200).

**Architecture:** The fix touches only markdown skill documentation and a shell test -- no executable application code. The gh issue create command lacks --title-file (confirmed from gh CLI source: pkg/cmd/issue/create/create.go -- only --title/-t and --body-file/-F flags exist). The safe pattern writes the title to a temp file via a single-quoted heredoc (<<'HEREDOC', no expansion), reads it into a shell variable via $(cat), and passes it as --title "$TITLE" -- which is safe because double-quoted variable expansion does NOT re-parse the variable's content for quotes, $(), or backticks. GraphQL examples switch from inline <PLACEHOLDER> to -F variable bindings.

**Tech Stack:** Bash (shell tests), Markdown (skill documentation)

## Global constraints

- Shell test uses tests/Shell/lib/test_helpers.sh API (pass, fail, setup_result_file, register_temp_dir, print_summary).
- gh issue create does NOT support --title-file -- only --title (string) and --body-file (file).
- Double-quoted variable expansion ("$VAR") is safe: the shell does NOT re-parse the variable's content for quotes, $(), or backticks.
- Issue type: Security; commit type: fix(security).
- Shell files use tab indentation (tab-stop 4), per conventions.
- The finishing-a-development-branch/SKILL.md is ALREADY safe (heredoc + --title-file/--body-file) -- no changes needed there.
- Refs: #201 (closing). Related: #200 (prior fix for gh pr create).

---

### Task 1: Fix gh issue create injection + extend static checks + active injection test

**Files:**
- Modify: .opencode/skills/ticketing/SKILL.md:100-101 (the gh issue create command in the gh pattern section)
- Test: tests/Shell/skill_shell_injection_test.sh (add two static checks + one active injection test inside the existing ticketing scan block and after the existing active tests)

**Interfaces:**
- Consumes: existing test_helpers.sh API (pass, fail, register_temp_dir, print_summary), existing $TICKETING variable and if [ -f "$TICKETING" ] block
- Produces: two new static-scan checks and one active-injection block; the ticketing SKILL.md line 101 is rewritten to the safe heredoc + variable + --body-file pattern

- [ ] **Step 1: Add static checks to the ticketing scan block**

In tests/Shell/skill_shell_injection_test.sh, insert the following two checks INSIDE the else branch of the ticketing scan (after Check 2 at line 50, before the closing fi at line 51). Use tab indentation matching the surrounding checks:

```bash

	# Check 5: No gh issue create with inline --title "<literal>" or --body "<literal>"
	# Bug:   --title "<title>" or --body "<body>"   (inline interpolation)
	# Safe:  --title "$TITLE" and --body-file FILE   (variable + file)
	if grep -Pn 'issue create.*--title\s+"[^$]' "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: gh issue create uses inline --title (should use heredoc + variable)"
	else
		pass "ticketing/SKILL.md: gh issue create uses safe title pattern (variable)"
	fi

	# Check 6: gh issue create must use --body-file, not inline --body
	if grep -Pn 'issue create.*--body\s+"' "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: gh issue create uses inline --body (should use --body-file)"
	else
		pass "ticketing/SKILL.md: gh issue create uses --body-file"
	fi
```

- [ ] **Step 2: Add active injection test for issue-create title-via-variable pattern**

In tests/Shell/skill_shell_injection_test.sh, insert the following block AFTER the existing GraphQL active injection test (after line 135, before the Summary at line 137):

```bash

# -- Active injection test: issue-create title via variable --
# Demonstrate that a malicious title written to a file via quoted heredoc,
# read into a variable via $(cat), and passed as --title "$TITLE" does NOT
# execute embedded commands. This is the safe pattern for gh issue create
# (which lacks --title-file).
SENTINEL3="/tmp/issue_pwn_test"
rm -f "$SENTINEL3"

# Write malicious title via quoted-heredoc (no expansion inside the body)
cat > "$TMPDIR/issue-title.txt" <<'HEREDOC'
fix: bug"; rm -rf /tmp/issue_pwn_test; # injected
HEREDOC

# Read into variable -- command substitution reads file content as DATA
ISSUE_TITLE=$(cat "$TMPDIR/issue-title.txt")

# Double-quoted variable expansion does NOT re-parse for rm, $(), or backticks
if [ -f "$SENTINEL3" ]; then
	fail "active injection test: issue-title variable assignment executed rm"
	rm -f "$SENTINEL3"
else
	pass "active injection test: issue-title via variable did NOT execute embedded command"
fi

# Verify the malicious pattern is preserved literally in the variable
case "$ISSUE_TITLE" in
	*rm\ -rf*) pass "active injection test: malicious pattern preserved literally in variable" ;;
	*)         fail "active injection test: malicious pattern missing from variable" ;;
esac
```

- [ ] **Step 3: Run the test to verify the new static checks FAIL (Red)**

Run: `bash tests/Shell/skill_shell_injection_test.sh`

Expected: FAIL on Check 5 and Check 6. The active injection test should PASS (it tests shell semantics, not the skill file). The existing checks 1-4 should still PASS.

- [ ] **Step 4: Fix the gh issue create pattern in ticketing/SKILL.md (Green)**

In .opencode/skills/ticketing/SKILL.md, replace lines 100-101:

**Before (current):**
```bash
# 2. Create the issue -- capture issue number from output URL
gh issue create --repo "$REPO" --title "<title>" --body "<body>"
```

**After (fixed):**
```bash
# 2. Create the issue -- capture issue number from output URL
# Write title and body to temp files via single-quoted heredoc (no expansion).
# gh issue create lacks --title-file, so read the title into a shell variable.
# Double-quoted variable expansion ("$TITLE") does NOT re-parse the value for
# quotes, $(), or backticks -- the content is inert data, not executable code.
cat > /tmp/issue-title.txt <<'HEREDOC'
<title>
HEREDOC
cat > /tmp/issue-body.md <<'HEREDOC'
<body>
HEREDOC
TITLE=$(cat /tmp/issue-title.txt)
gh issue create --repo "$REPO" --title "$TITLE" --body-file /tmp/issue-body.md
```

- [ ] **Step 5: Run the test to verify ALL checks PASS (Green)**

Run: `bash tests/Shell/skill_shell_injection_test.sh`

Expected: PASS -- all checks pass including the new Check 5, Check 6, and the active injection test.

- [ ] **Step 6: Commit**

```bash
git add tests/Shell/skill_shell_injection_test.sh .opencode/skills/ticketing/SKILL.md
git commit -S -m $'fix(security): close shell injection in ticketing skill gh issue create\n\nReplace inline --title "<title>" --body "<body>" interpolation with\nheredoc + shell variable + --body-file pattern. Variable expansion\ninside double quotes ("$TITLE") does not re-parse the value for\nquotes, $(), or backticks. Extend skill_shell_injection_test.sh with\nstatic checks for issue-create inline patterns and an active injection\ntest proving the variable pattern is safe.\n\nRefs: #201\nAuthored-by: glm-5.2\nTested-by: <resolved from agent.code-review.model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Fix GraphQL -F variable consistency + add skill rule

**Files:**
- Modify: .opencode/skills/ticketing/SKILL.md:104 (GraphQL query with inline <N>)
- Modify: .opencode/skills/ticketing/SKILL.md:107 (GraphQL mutation with inline <NODE_ID>, <TYPE_NODE_ID>)
- Modify: .opencode/skills/ticketing/SKILL.md:270-271 (GraphQL queries with inline <TASK_NUM>, <PREREQ_NUM>)
- Modify: .opencode/skills/ticketing/SKILL.md Rules section (~line 303, add one rule)
- Test: tests/Shell/skill_shell_injection_test.sh (add one static check for <PLACEHOLDER> in graphql queries)

**Interfaces:**
- Consumes: existing $TICKETING variable and scan block from Task 1
- Produces: one new static check (Check 7); all GraphQL examples in ticketing SKILL.md use -F variables exclusively

- [ ] **Step 1: Add static check for <PLACEHOLDER> in graphql queries**

In tests/Shell/skill_shell_injection_test.sh, insert the following check INSIDE the ticketing else block, right after Check 6 (added in Task 1), before the closing fi:

```bash

	# Check 7: No <UPPERCASE_PLACEHOLDER> inside single-quoted graphql queries
	# All values must be -F variables, not inline-interpolated placeholders
	if grep -Pn "query='[^']*<[A-Z][A-Z_]*>[^']*'" "$TICKETING" > /dev/null 2>&1; then
		fail "ticketing/SKILL.md: graphql query has inline <PLACEHOLDER> (should use -F variables)"
	else
		pass "ticketing/SKILL.md: graphql queries use -F variables for all placeholders"
	fi
```

- [ ] **Step 2: Run the test to verify Check 7 FAILS (Red)**

Run: `bash tests/Shell/skill_shell_injection_test.sh`

Expected: FAIL on Check 7. Lines 104, 107, 270, and 271 all contain <N>, <NODE_ID>, <TYPE_NODE_ID>, <TASK_NUM>, or <PREREQ_NUM> inside single-quoted query='...' strings. All other checks from Task 1 should still PASS.

- [ ] **Step 3: Fix line 104 -- GraphQL query with <N>**

**Before:**
```bash
gh api graphql -F owner="$OWNER" -F name="$NAME" -f query='query($owner:String!,$name:String!){ repository(owner: $owner, name: $name) { issue(number: <N>) { id } } }'
```

**After:**
```bash
gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<N> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }'
```

- [ ] **Step 4: Fix line 107 -- GraphQL mutation with <NODE_ID> and <TYPE_NODE_ID>**

**Before:**
```bash
gh api graphql -f query='mutation { updateIssue(input: { id: "<NODE_ID>", issueTypeId: "<TYPE_NODE_ID>" }) { issue { number issueType { name } } } }'
```

**After:**
```bash
gh api graphql -F nodeId="<NODE_ID>" -F typeId="<TYPE_NODE_ID>" -f query='mutation($nodeId:ID!,$typeId:ID!) { updateIssue(input: { id: $nodeId, issueTypeId: $typeId }) { issue { number issueType { name } } } }'
```

- [ ] **Step 5: Fix lines 270-271 -- GraphQL blocking-edge queries with <TASK_NUM> and <PREREQ_NUM>**

**Before:**
```bash
TASK_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -f query='query($owner:String!,$name:String!){ repository(owner: $owner, name: $name) { issue(number: <TASK_NUM>) { id } } }' -q '.data.repository.issue.id')
PREREQ_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -f query='query($owner:String!,$name:String!){ repository(owner: $owner, name: $name) { issue(number: <PREREQ_NUM>) { id } } }' -q '.data.repository.issue.id')
```

**After:**
```bash
TASK_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<TASK_NUM> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }' -q '.data.repository.issue.id')
PREREQ_NODE=$(gh api graphql -F owner="$OWNER" -F name="$NAME" -F num=<PREREQ_NUM> -f query='query($owner:String!,$name:String!,$num:Int!){ repository(owner: $owner, name: $name) { issue(number: $num) { id } } }' -q '.data.repository.issue.id')
```

- [ ] **Step 6: Run the test to verify ALL checks PASS (Green)**

Run: `bash tests/Shell/skill_shell_injection_test.sh`

Expected: PASS -- all 7 static checks + all 3 active injection tests pass.

- [ ] **Step 7: Add the skill rule (Refactor)**

In .opencode/skills/ticketing/SKILL.md, add this rule to the ## Rules section (after the existing rule at ~line 318: "All field IDs and type node IDs must be queried dynamically, never hard-coded."):

```markdown
- Never interpolate user content (issue titles, bodies, PR descriptions, label
  names) into shell command strings. Use a single-quoted heredoc
  (<<'HEREDOC') to write payloads to temp files, read them into shell
  variables via $(cat), and pass via --title "$VAR" / --body-file FILE.
  For GraphQL, always use -F variable bindings -- never inline <placeholder>
  text inside a query string.
```

- [ ] **Step 8: Run the full test suite to confirm nothing broke**

Run: `bash tests/Shell/skill_shell_injection_test.sh`

Expected: PASS -- all checks green, summary shows 0 failures.

- [ ] **Step 9: Commit**

```bash
git add tests/Shell/skill_shell_injection_test.sh .opencode/skills/ticketing/SKILL.md
git commit -S -m $'fix(security): use -F variables in all ticketing GraphQL examples\n\nReplace inline <N>, <NODE_ID>, <TYPE_NODE_ID>, <TASK_NUM>, <PREREQ_NUM>\nplaceholders inside graphql query strings with -F variable bindings.\nAdd static check for <UPPERCASE> placeholders in graphql queries. Add\nskill rule prohibiting user-content interpolation into shell commands.\n\nRefs: #201\nAuthored-by: glm-5.2\nTested-by: <resolved from agent.code-review.model>\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Acceptance criteria mapping

| Criterion (from issue #201) | Covered by |
|---|---|
| Both skills contain no --body "<...>"/--title "<...>" inline-interpolation examples | Task 1 Step 4 (fixes ticketing:101); finishing skill already safe |
| GraphQL examples use -F variables | Task 2 Steps 3-5 (fixes lines 104, 107, 270-271) |
| A tests/Shell/ case shows a title containing "; rm -rf /tmp/x; # does not execute | Task 1 Step 2 (active injection test with sentinel) |

## Self-review

1. Spec coverage: All three acceptance criteria are mapped to specific steps above.
2. Placeholder scan: No TBD, TODO, or "similar to Task N" -- all code is complete.
3. Type consistency: $TICKETING, $TMPDIR, pass/fail all match the existing test file's usage. The heredoc pattern matches finishing-a-development-branch/SKILL.md:89-98.
4. Grep pattern safety: Check 5 uses [^$] to avoid false-positive on --title "$TITLE". Check 6 uses --body\s+" which does not match --body-file. Check 7 uses <[A-Z][A-Z_]*> to match only uppercase placeholders, not GraphQL $variables.
