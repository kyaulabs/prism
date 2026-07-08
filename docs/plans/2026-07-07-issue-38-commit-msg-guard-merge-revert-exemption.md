# Issue #38: Guard `commit-msg` Hook + Exempt Merges/Reverts

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make the `commit-msg` hook resilient when commitlint is absent, and exempt merge/revert commits from trailer enforcement so they pass both the local hook and CI.

**Architecture:** Two surgical changes — (1) a `node_modules/commitlint` existence guard in the bash hook (skip-with-notice, matching the pre-commit shellcheck pattern), and (2) merge/revert detection in the custom `trailers-exist` commitlint plugin (fixes local + CI in one shot). The built-in `signed-off-by` rule is disabled and folded into `trailers-exist` so all three trailers share one exemption path. CONTRIBUTING.md + the `conventional-commits` skill document the policy.

**Tech Stack:** Bash hooks, commitlint v21 (`commitlint.config.js`), shell regression tests (`tests/Shell/`), Markdown docs.

## Global constraints

- Bash hooks: 4-space indent, `set -euo pipefail`, RCS header + vim modeline (`ft=sh sts=4 sw=4 ts=4 et :`).
- commitlint config: tabs (existing file style), RCS header + `ft=javascript sts=4 sw=4 ts=4 noet` modeline.
- Shell tests: follow `tests/Shell/prepare-commit-msg_test.sh` pattern (mktemp dirs, pass/fail counters, trap cleanup).
- Signed commits (`git commit -S`) with `Plan-by:`/`Acked-by:`/`Signed-off-by:` footers on all implementation commits.
- Never edit generated `cdn/css`/`cdn/javascript` files (not applicable here).

## File structure

- **Modify:** `.github/hooks/commit-msg` — add commitlint-availability guard + vim modeline (previously missing).
- **Modify:** `commitlint.config.js` — add merge/revert exemption to `trailers-exist`; fold `Signed-off-by:` into the trailer list; disable built-in `signed-off-by` rule.
- **Create:** `tests/Shell/commit-msg_test.sh` — shell regression tests for guard + merge/revert/regression behavior.
- **Modify:** `CONTRIBUTING.md` — add "Commit Message Policy" section.
- **Modify:** `.opencode/skills/conventional-commits/SKILL.md` — document merge/revert exemption + skip behavior in Enforcement section.

---

### Task 1: Guard `commit-msg` hook against missing commitlint

**Files:**
- Modify: `.github/hooks/commit-msg`
- Create: `tests/Shell/commit-msg_test.sh`

**Interfaces:**
- Produces: a hook that exits 0 with a stderr notice when `node_modules/commitlint` is absent, and otherwise delegates to `npx commitlint --edit "${1}"`.

- [ ] **Step 1: Write the failing test**

Create `tests/Shell/commit-msg_test.sh`:

```bash
#!/usr/bin/env bash
# $KYAULabs: commit-msg_test.sh kyau@nova 2026/07/07 -0700 Exp $

# ── Tests for commit-msg hook ───────────────────────────────────────────────
# Covers:
#   - Guard: skip with a visible notice when commitlint is not installed
#     (fresh clone without `npm install`). CI enforces commitlint on PRs.
#   - Merge/revert exemption + regression tests (added in Task 2).

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }
skip() { echo "  ${YELLOW}SKIP${RESET} $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/commit-msg"

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find commit-msg at $REAL_HOOK"
	exit 1
fi

# Commitlint-dependent tests skip (with notice) when commitlint is absent,
# mirroring the hook's own guard. CI always has node_modules installed.
COMMITLINT_AVAILABLE=false
if [ -d "$REPO_ROOT/node_modules/commitlint" ]; then
	COMMITLINT_AVAILABLE=true
fi

# ── Test 1: Guard skips with notice when commitlint absent ───────────────────
# A stub `npx` is placed first on PATH so the unguarded hook (before the fix)
# fails fast without a network fetch. After the fix, the guard fires before
# npx is ever reached.

echo ""
echo "── Test 1: Guard skips when commitlint not installed ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
	cd "$T1"
	# Stub npx: exits non-zero with a known message. Only reached if the
	# hook lacks a guard (the pre-fix state).
	mkdir -p "$T1/bin"
	cat > "$T1/bin/npx" <<'STUB'
#!/usr/bin/env bash
echo "stub-npx: commitlint not available" >&2
exit 1
STUB
	chmod +x "$T1/bin/npx"

	# Sample valid commit message (content irrelevant — guard fires first)
	printf 'feat: test\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>\n' > msg

	set +e
	output=$(PATH="$T1/bin:$PATH" "$REAL_HOOK" msg 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ] && echo "$output" | grep -qi 'commitlint' && echo "$output" | grep -qi 'skipping'; then
		pass "Guard skips with notice when commitlint absent (exit 0)"
	else
		fail "Guard did not skip (exit=$ret): $output"
	fi
)
rm -rf "$T1"

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ commit-msg tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ commit-msg tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/commit-msg_test.sh`
Expected: FAIL — "Guard did not skip (exit=1): stub-npx: commitlint not available". The unguarded hook reaches the stub `npx`, which exits 1 with no "skipping" notice.

- [ ] **Step 3: Write minimal implementation**

Replace `.github/hooks/commit-msg` with:

```bash
#!/usr/bin/env bash
# $KYAULabs: commit-msg kyau@nova 2026/07/07 -0700 Exp $

set -euo pipefail

# Guard: skip with a visible notice when commitlint is not installed
# (fresh clone without `npm install`, or a nodeless environment).
# CI enforces commitlint on every PR commit, so skipping locally is safe.
if [ ! -d node_modules/commitlint ]; then
	echo "⚠ commitlint not installed — skipping commit-msg check (run: npm install)" >&2
	exit 0
fi

npx commitlint --edit "${1}"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/commit-msg_test.sh`
Expected: PASS — "Guard skips with notice when commitlint absent (exit 0)". The guard fires before `npx` is reached.

- [ ] **Step 5: Run shellcheck on the modified hook**

Run: `shellcheck .github/hooks/commit-msg tests/Shell/commit-msg_test.sh`
Expected: no findings.

- [ ] **Step 6: Commit**

```bash
git add .github/hooks/commit-msg tests/Shell/commit-msg_test.sh
git commit -S -m $'fix(hooks): guard commit-msg against missing commitlint\n\nAdd a node_modules/commitlint existence check to the commit-msg hook.\nWhen commitlint is absent (fresh clone without npm install, or a nodeless\nenvironment), the hook now skips with a visible notice instead of failing\nall commits with an opaque npx error. CI still enforces commitlint on\nevery PR commit, so skipping locally is safe.\n\nRefs: #38\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 2: Exempt merges/reverts from trailer enforcement in `commitlint.config.js`

**Files:**
- Modify: `commitlint.config.js:5-21` (trailers-exist plugin) and `:49-50` (rules)
- Modify: `tests/Shell/commit-msg_test.sh` (add Tests 2–5 before the Summary section)

**Interfaces:**
- Produces: a `trailers-exist` rule that returns `[true, '']` for merge/revert commits; `Signed-off-by:` enforced via the same rule; built-in `signed-off-by` disabled.

**Design note:** commitlint's `parsed` object exposes `parsed.merges` (array) and `parsed.revert` (object or null). To be robust against parser-version differences, the rule ALSO checks the raw header string (`/^Merge /`, `/^Revert /`). The end-to-end tests (real `git merge --no-ff` / `git revert` through the hook) verify the full path; if any *other* rule (e.g. `type-enum`) also blocks merges, the merge test will surface it and the implementer extends the exemption to that rule.

- [ ] **Step 1: Write the failing tests**

Insert the following four test blocks into `tests/Shell/commit-msg_test.sh` **immediately before the `# ── Summary ──` section**:

```bash
# ── Test 2: Merge commit passes the hook (commitlint required) ───────────────

echo ""
echo "── Test 2: Merge commit (--no-ff) passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 2 (merge) — commitlint not installed"
else
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
	cd "$T2"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	# Expose commitlint + config to the hook (which checks ./node_modules/commitlint)
	ln -s "$REPO_ROOT/node_modules" "$T2/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T2/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: base commit\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	git checkout -q -b feature
	echo b > b; git add b; git commit -q -m "$VALID"
	git checkout -q main 2>/dev/null || git checkout -q master

	set +e
	output=$(git merge --no-ff feature -m "Merge branch 'feature'" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Merge commit (--no-ff) passes the hook"
	else
		fail "Merge commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T2"
fi

# ── Test 3: Revert commit passes the hook (commitlint required) ───────────────

echo "── Test 3: Revert commit passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 3 (revert) — commitlint not installed"
else
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
	cd "$T3"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T3/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T3/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: original\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	TARGET=$(git rev-parse HEAD)

	set +e
	output=$(git revert --no-edit "$TARGET" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Revert commit passes the hook"
	else
		fail "Revert commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T3"
fi

# ── Test 4: Regression — missing trailers still fails (commitlint required) ──

echo "── Test 4: Missing trailers still fails ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 4 (missing-trailers regression) — commitlint not installed"
else
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
	cd "$T4"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T4/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T4/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	echo a > a; git add a
	set +e
	output=$(git commit -q -m "feat: no trailers here" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "Missing trailers rejected (exit=$ret)"
	else
		fail "Missing trailers allowed — enforcement broken"
	fi
)
rm -rf "$T4"
fi

# ── Test 5: Regression — valid commit with all trailers passes ───────────────

echo "── Test 5: Valid commit with trailers passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 5 (valid-commit regression) — commitlint not installed"
else
T5=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T5"
(
	cd "$T5"
	git init --quiet
	git config user.email "test@example.com"
	git config user.name "Test User"
	ln -s "$REPO_ROOT/node_modules" "$T5/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T5/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: valid commit\n\nPlan-by: x\nAcked-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a
	set +e
	output=$(git commit -q -m "$VALID" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Valid commit with trailers passes"
	else
		fail "Valid commit blocked (exit=$ret): $output"
	fi
)
rm -rf "$T5"
fi
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/commit-msg_test.sh`
Expected: Test 1 PASS; Tests 2 & 3 FAIL (merge/revert blocked by `trailers-exist` + `signed-off-by`); Tests 4 & 5 PASS (enforcement still works). This confirms the Red state for the exemption.

- [ ] **Step 3: Write minimal implementation**

Replace `commitlint.config.js` with:

```js
// $KYAULabs: commitlint.config.js kyau@nova 2026/07/07 -0700 Exp $

const { spawnSync } = require('child_process');

const trailersExist = (parsed, when, trailers) => {
	// Exempt merge commits and reverts from trailer enforcement.
	// `git merge --no-ff` and `git revert` produce auto-generated messages
	// that cannot carry Plan-by/Acked-by/Signed-off-by trailers. CI applies
	// the same exemption via this config, so merges/reverts pass everywhere.
	const isMerge =
		(parsed.merges && parsed.merges.length > 0) ||
		(parsed.header && /^Merge /.test(parsed.header));
	const isRevert =
		parsed.revert || (parsed.header && /^Revert /.test(parsed.header));
	if (isMerge || isRevert) {
		return [true, ''];
	}

	const output = spawnSync('git', ['interpret-trailers', '--parse'], {
		input: parsed.raw || '',
	}).stdout.toString();
	const lines = output.split('\n');
	const negated = when === 'never';
	const missing = trailers.filter(
		(t) => !lines.some((ln) => ln.startsWith(t))
	);
	const allPresent = missing.length === 0;
	return [
		negated ? !allPresent : allPresent,
		'message must have ' +
			trailers.map((t) => '`' + t + '`').join(', ') +
			' trailer' + (trailers.length > 1 ? 's' : ''),
	];
};

module.exports = {
	extends: ['@commitlint/config-conventional'],
	plugins: [
		{
			rules: {
				'trailers-exist': trailersExist,
			},
		},
	],
	rules: {
		'header-max-length': [2, 'always', 100],
		'type-enum': [2, 'always', [
			'build',
			'chore',
			'ci',
			'docs',
			'feat',
			'fix',
			'patch',
			'perf',
			'refactor',
			'revert',
			'style',
			'test',
			'ignore',
		]],
		'trailers-exist': [2, 'always', ['Plan-by:', 'Acked-by:', 'Signed-off-by:']],
		'signed-off-by': [0],
	},
};

// vim: ft=javascript sts=4 sw=4 ts=4 noet :
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash tests/Shell/commit-msg_test.sh`
Expected: all tests PASS (Tests 2 & 3 now pass — merges/reverts exempt; Tests 4 & 5 still pass — enforcement intact).

- [ ] **Step 5: Commit**

```bash
git add commitlint.config.js tests/Shell/commit-msg_test.sh
git commit -S -m $'fix(commitlint): exempt merges/reverts from trailer enforcement\n\nThe custom trailers-exist rule rejected merge commits (git merge --no-ff)\nand revert commits (git revert) because their auto-generated messages\ncannot carry Plan-by/Acked-by/Signed-off-by trailers. CI enforced the same\nrule retroactively across every PR commit, blocking merges and reverts\nentirely.\n\nThe rule now returns pass when the commit is a merge (parsed.merges or a\nMerge header) or a revert (parsed.revert or a Revert header). The\nbuilt-in signed-off-by rule is disabled and Signed-off-by: folded into\ntrailers-exist so all three trailers share one exemption path. Normal\ncommits without trailers are still rejected (regression-tested).\n\nRefs: #38\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Document the commit-message policy

**Files:**
- Modify: `CONTRIBUTING.md` (insert a new section between "We Use Git Flow" and "Reporting Bugs / Feature Requests")
- Modify: `.opencode/skills/conventional-commits/SKILL.md:120-126` (Enforcement section)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the Commit Message Policy section to CONTRIBUTING.md**

Insert the following block after the "We Use [Git Flow]" section (after line 30, before the "## Reporting Bugs / Feature Requests" heading):

```markdown
## Commit Message Policy

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
format, enforced by [commitlint](https://commitlint.js.org/) via the
`.github/hooks/commit-msg` hook and in CI on every pull request.

**Required trailers** (every non-merge, non-revert commit):

- `Plan-by:` — the planning model (from `agent.plan.model` in `opencode.json`)
- `Acked-by:` — the build model (from `agent.build.model`, falling back to `model`)
- `Signed-off-by:` — the human approver (default `kyau <git@kyaulabs.com>`)

**Exemptions:**

- **Merge commits** (`git merge --no-ff`) and **revert commits** (`git revert`)
  are exempt from trailer enforcement — their messages are auto-generated and
  cannot carry trailers.
- **GitHub web-UI commits** (editing files on github.com) cannot add trailers or
  sign commits, and are therefore out-of-policy. Use a local clone with signed
  commits for all contributions.

**Local hook behavior:** if `commitlint` is not installed (fresh clone without
`npm install`), the `commit-msg` hook skips with a visible notice rather than
blocking the commit. CI enforces the policy on every PR commit, so skipping
locally is safe — malformed commits are caught upstream.
```

- [ ] **Step 2: Update the Enforcement section of the conventional-commits skill**

In `.opencode/skills/conventional-commits/SKILL.md`, append the following paragraph to the `## Enforcement` section (after the existing "Config: `commitlint.config.js` extends ..." sentence, before the `## Passing the Message to Git` heading):

```markdown
Merge commits (`git merge --no-ff`) and revert commits (`git revert`) are
exempt from trailer enforcement — their auto-generated messages cannot carry
`Plan-by:`/`Acked-by:`/`Signed-off-by:` trailers. If `commitlint` is not
installed (fresh clone without `npm install`), the hook skips with a visible
notice; CI enforces the policy on every PR commit.
```

- [ ] **Step 3: Verify docs render and contain no broken references**

Run: `grep -n "Commit Message Policy" CONTRIBUTING.md` and `grep -n "exempt from trailer enforcement" .opencode/skills/conventional-commits/SKILL.md`
Expected: both return a matching line.

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md .opencode/skills/conventional-commits/SKILL.md
git commit -S -m $'docs: document commit-message policy and merge/revert exemption\n\nAdd a Commit Message Policy section to CONTRIBUTING.md covering required\ntrailers, the merge/revert exemption, the out-of-policy status of web-UI\ncommits, and the local skip-vs-CI-enforce behavior. Mirror the exemption\nand skip behavior in the conventional-commits skill Enforcement section.\n\nCloses: #38\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Acceptance-criteria traceability (issue #38)

| Issue criterion | Task(s) |
| --- | --- |
| Fresh clone without `npm install`: commit succeeds with a visible skip notice | Task 1 (guard + Test 1) |
| `git merge --no-ff` commits pass the hook | Task 2 (exemption + Test 2) |
| `git revert` commits pass the hook | Task 2 (exemption + Test 3) |
| CI commitlint behavior documented in CONTRIBUTING.md | Task 3 |

## Verification (post-implementation)

1. `bash tests/Shell/commit-msg_test.sh` — all assertions pass.
2. `shellcheck .github/hooks/commit-msg tests/Shell/commit-msg_test.sh` — clean.
3. `/check` — full pre-push gate (php-cs-fixer + stylelint + eslint + pest --coverage). Note: this change touches no PHP/SCSS/JS, so those gates are no-ops; the shell regression tests are the substantive gate and run in CI via `ci.yml:66-78`.
4. `@code-review` on the staged changes before push.

## Notes / out of scope

- The `aurora/` submodule has a parallel `commitlint.config.js` — it is a separate repo and out of scope (separate issue/PR + submodule bump), consistent with prior issues' scope discipline.
- The pre-existing policy-vs-config mismatch noted in the `conventional-commits` skill (lines 117-118: "`chore` and `docs` commits that are purely mechanical may omit footers") is not addressed here — the config still enforces trailers on `chore`/`docs`. That's a separate reconciliation, not part of issue #38.
