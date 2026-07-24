# release/merge commit-footer fix Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make `/release` and `@resolve-merge-conflicts` produce commits the
fail-closed `commit-msg` hook accepts, and gate `git tag` behind confirmation
during `/release`.

**Architecture:** Three independent template/config edits plus a single shell
contract test (`tests/Shell/commit_template_footer_test.sh`) that grows across
the three tasks. Each task is a vertical slice: add its test section (Red),
apply the fix (Green), commit. The release commit gets the three required
footers; the merge commit switches to a `Merge `-prefixed subject (which
commitlint exempts); the `build` agent gains a `git tag*: ask` gate.

**Tech Stack:** Harness config only — Markdown command/agent prompts
(`.opencode/commands/release.md`, `.opencode/agents/resolve-merge-conflicts.md`),
`opencode.jsonc` (JSONC), and a POSIX `bash` shell test sourcing
`tests/Shell/lib/test_helpers.sh`. No PHP, no frontend assets.

## Global constraints

- **No PHP source changes** — the 80% changed-file coverage gate
  (`coverage-gate.php`) is N/A; this plan touches only Markdown, JSONC, and a
  shell test. TDD discipline is satisfied via the shell contract test
  (Red → Green per task).
- **Signed commits** — every commit uses `git commit -S` with a single `-m`
  and ANSI-C `$'...\n...'` quoting. Never multiple `-m` flags (they insert
  blank lines that break commitlint trailer detection — see `AGENTS.md`).
- **Required footers** on every non-merge/revert commit, in this order:
  `Authored-by:` (`agent.plan.model` → `glm-5.2`), `Tested-by:`
  (`agent.code-review.model` segment after last `/` → `deepseek-v4-pro`),
  `Signed-off-by:` (resolved at commit time via
  `bash .github/scripts/resolve-identity.sh`). Issue references (`Refs:` /
  `Fixes:`) sit immediately above `Authored-by:`.
- **No new dependencies.**
- **New shell test file requires the RCS header + vim modeline** — load the
  `rcs-header` skill before creating it.

---

## File structure

- **Create:** `tests/Shell/commit_template_footer_test.sh` — static contract
  test (pure `grep`/`sed`, no commitlint dependency, always runs). Three
  sections assert each fix; grows across Tasks 1–3.
- **Modify:** `.opencode/commands/release.md:39-44` — add the three footers to
  the changelog commit example (Task 1).
- **Modify:** `opencode.jsonc:73-79` — add `"git tag*": "ask"` to the `build`
  agent's `bash` permission block (Task 2).
- **Modify:** `.opencode/agents/resolve-merge-conflicts.md:94-100` — switch the
  merge-completion message to a `Merge `-prefixed subject (Task 3).

---

## Task 1: /release changelog commit carries required footers

**Files:**
- Create: `tests/Shell/commit_template_footer_test.sh`
- Modify: `.opencode/commands/release.md:39-44`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `tests/Shell/commit_template_footer_test.sh` with its header,
  setup, section 1, and `print_summary` call (Tasks 2 and 3 insert sections
  before `print_summary`).

- [ ] **Step 1: Create the failing test file (Red)**

Load the `rcs-header` skill, then create `tests/Shell/commit_template_footer_test.sh`
with this exact content:

```bash
#!/usr/bin/env bash
# $KYAULabs: commit_template_footer_test.sh <user>@<host> 2026/07/23 -0700 Exp $


# commit_template_footer_test.sh — contract test that first-party commit
# templates produce messages the fail-closed commit-msg hook accepts
# (ADR-0025). Pure grep/sed: no commitlint dependency, always runs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. /release changelog commit carries required footers ───────────────────
# The release commit is a normal chore(release): commit (not a merge/revert),
# so commitlint's trailers-exist rule requires Authored-by/Tested-by/
# Signed-off-by. The old footerless double-quoted form must be gone.
RELEASE="$REPO_ROOT/.opencode/commands/release.md"
if grep -qF 'git commit -S -m "chore(release): vX.Y.Z"' "$RELEASE"; then
	fail "release.md still uses footerless double-quoted commit form"
else
	if grep -qF "Authored-by:" "$RELEASE" \
		&& grep -qF "Tested-by:" "$RELEASE" \
		&& grep -qF "Signed-off-by:" "$RELEASE"; then
		pass "release.md changelog commit includes required footers"
	else
		fail "release.md changelog commit missing Authored-by/Tested-by/Signed-off-by"
	fi
fi

print_summary "commit_template_footer"

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

> Substitute the RCS header's `<user>@<host>` and timezone with the real values
> resolved by the `rcs-header` skill for the current machine.

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: FAIL — "release.md still uses footerless double-quoted commit form"
(current `release.md:41` is exactly that pattern).

- [ ] **Step 3: Apply the fix (Green)**

Edit `.opencode/commands/release.md` lines 39–44. Replace this block:

```bash
git add CHANGELOG.md
git commit -S -m "chore(release): vX.Y.Z"
```

Signed commit required (see `conventional-commits` skill).

with:

```bash
git add CHANGELOG.md
git commit -S -m $'chore(release): vX.Y.Z\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

Signed commit required (see `conventional-commits` skill). The release commit is
a normal `chore(release):` commit (not a merge/revert), so it carries the three
required footers: `Authored-by`/`Tested-by` from the configured model tiers and
`Signed-off-by` resolved via `bash .github/scripts/resolve-identity.sh`. Use a
single `-m` with `$'...\n...'` quoting (never multiple `-m` flags).

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: PASS — "release.md changelog commit includes required footers" and the
summary line `✓ commit_template_footer: 1 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/commit_template_footer_test.sh .opencode/commands/release.md
git commit -S -m $'fix(release): add required commit footers to changelog commit\n\nThe /release command emitted `git commit -S -m "chore(release): vX.Y.Z"`\nwith no trailers. The commit-msg fail-closed hook rejects any non-merge/\nrevert commit lacking Authored-by/Tested-by/Signed-off-by (commitlint\ntrailers-exist). Add the three footers using the single -m $\'...\\n...\' form;\nSigned-off-by resolves via resolve-identity.sh at release time.\n\nRefs: #190\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

> @tdd resolves the `Signed-off-by:` value by running
> `bash .github/scripts/resolve-identity.sh` and substituting its stdout
> (e.g. `kyau <git@kyaulabs.com>`) before executing the commit.

---

## Task 2: build agent gates git tag behind confirmation

**Files:**
- Modify: `tests/Shell/commit_template_footer_test.sh` (insert section 2 before
  `print_summary`)
- Modify: `opencode.jsonc:73-79` (the `build` agent `permission.bash` block)

**Interfaces:**
- Consumes: the test file from Task 1.
- Produces: section 2 of the contract test + the gated `git tag*` rule.

- [ ] **Step 1: Add the failing test section (Red)**

In `tests/Shell/commit_template_footer_test.sh`, insert this block immediately
**before** the `print_summary "commit_template_footer"` line:

```bash
# ── 2. build agent gates git tag* behind confirmation ───────────────────────
# /release runs as the build agent and creates a signed tag via `git tag -s`.
# build's bash has "*": "allow", so without an explicit "git tag*": "ask" the
# tag is created with no confirmation — unlike git add/commit which are "ask".
build_block=$(sed -n '/"build": {/,/"plan": {/p' "$REPO_ROOT/opencode.jsonc")
if echo "$build_block" | grep -qF '"git tag*": "ask"'; then
	pass "build agent gates git tag* at ask"
else
	fail "build agent does not gate git tag* (release tag ungated)"
fi

```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: FAIL on section 2 — "build agent does not gate git tag* …" (the
`build` block currently has no `git tag*` rule). Section 1 still passes.

- [ ] **Step 3: Apply the fix (Green)**

Edit `opencode.jsonc` lines 73–79. Change the `build` agent's `permission.bash`
block from:

```jsonc
        "bash": {
          "*": "allow",
          "git add*": "ask",
          "git stage*": "ask",
          "git commit*": "ask",
          "git push*": "deny"
        },
```

to:

```jsonc
        "bash": {
          "*": "allow",
          "git add*": "ask",
          "git stage*": "ask",
          "git commit*": "ask",
          "git tag*": "ask",
          "git push*": "deny"
        },
```

> Only the `build` agent is changed (the confirmed scope). `design`/`plan` are
> left untouched; subagents (`tdd`, `resolve-merge-conflicts`, `from-issue`)
> already `deny` `git tag*`.

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: PASS on both sections — `✓ commit_template_footer: 2 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add tests/Shell/commit_template_footer_test.sh opencode.jsonc
git commit -S -m $'fix(build): gate git tag behind confirmation\n\nThe build agent (which runs /release) has bash "*": "allow", so `git tag -s`\nfell through to allow with no confirmation — unlike git add/commit which are\n"ask". Add "git tag*": "ask" so a release tag requires the same confirmation\nas a release commit. Scoped to build only.\n\nRefs: #190\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 3: merge completion uses a Merge-prefixed subject

**Files:**
- Modify: `tests/Shell/commit_template_footer_test.sh` (insert section 3 before
  `print_summary`)
- Modify: `.opencode/agents/resolve-merge-conflicts.md:94-100`

**Interfaces:**
- Consumes: the test file from Task 2.
- Produces: section 3 of the contract test; the completed (green) test file.

- [ ] **Step 1: Add the failing test section (Red)**

In `tests/Shell/commit_template_footer_test.sh`, insert this block immediately
**before** the `print_summary "commit_template_footer"` line:

```bash
# ── 3. @resolve-merge-conflicts merge subject is Merge-prefixed (exempt) ─────
# commitlint inspects only the message text (not git parents). A `chore: merge`
# subject matches neither the Merge-/Revert- exemption nor carries trailers, so
# the hook rejects it. Use a `Merge `-prefixed subject to trigger the exemption.
RMC="$REPO_ROOT/.opencode/agents/resolve-merge-conflicts.md"
if grep -qF 'Merge branch' "$RMC" && ! grep -qF 'chore: merge' "$RMC"; then
	pass "resolve-merge-conflicts uses Merge-prefixed merge subject"
else
	fail "resolve-merge-conflicts merge subject not Merge-prefixed (hook-rejected)"
fi

```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: FAIL on section 3 — "resolve-merge-conflicts merge subject not
Merge-prefixed …". Sections 1–2 still pass.

- [ ] **Step 3: Apply the fix (Green)**

Edit `.opencode/agents/resolve-merge-conflicts.md` lines 94–100. Replace this
block:

```
### If merging
Run `git commit -S` (signed commit required). Use a Conventional Commits merge message:
```
chore: merge <branch-name> into <target-branch>

<list conflicts resolved and trade-offs made>
```
```

with:

```
### If merging
Run `git commit -S` (signed commit required) to complete the merge. Use a
`Merge `-prefixed subject so commitlint's merge/revert exemption applies
(merge commits are exempt from the Authored-by/Tested-by/Signed-off-by rule —
see `commitlint.config.js`). Do NOT add the three footers to a merge commit:

```
Merge branch '<from-branch>' into <target-branch>

<list conflicts resolved and trade-offs made>
```
```

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: PASS on all three sections — `✓ commit_template_footer: 3 passed, 0 failed`.

- [ ] **Step 5: Commit (closing)**

```bash
git add tests/Shell/commit_template_footer_test.sh .opencode/agents/resolve-merge-conflicts.md
git commit -S -m $'fix(merge): use Merge-prefixed subject for merge completion\n\n@resolve-merge-conflicts completed merges with a `chore: merge ...` subject.\ncommitlint checks only message text (not git parents), so that subject matched\nneither the Merge-/Revert- exemption nor carried trailers — the fail-closed\nhook rejected it. Switch to the native `Merge branch ... into ...` form, which\nthe exemption accepts. This completes the #190 fix.\n\nFixes: #190\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 4: Full verification (no commit)

**Files:** none.

- [ ] **Step 1: Run the full new contract test**

Run: `bash tests/Shell/commit_template_footer_test.sh`
Expected: `✓ commit_template_footer: 3 passed, 0 failed`.

- [ ] **Step 2: Run the related commit-msg shell tests (no regression)**

Run: `bash tests/Shell/commit_msg_parity_test.sh && bash tests/Shell/commit-msg_test.sh`
Expected: both report all PASS (skip-notices for commitlint-absent cases are fine).

- [ ] **Step 3: Confirm the harness validator still passes**

Run: `bash .github/scripts/validate-harness.sh`
Expected: exit 0. (Adding `"git tag*": "ask"` is additive; the validator's
"git commit without a gate" check is unaffected.)

- [ ] **Step 4: Load `verification-before-completion`**

Confirm: no debug artifacts, the three changed files match the plan, the
original bug (footerless release commit + `chore: merge` + ungated tag) no
longer reproduces against the contract test.

- [ ] **Step 5: Hand to manual gates**

`/check` (php-cs-fixer + stylelint + eslint + pest --coverage) and
`@code-review` are the human-run pre-push gates. No PHP/assets changed, so the
lint/coverage surfaces are expected clean; `@code-review` reviews the staged
diff.

---

## Self-review

- **Spec/issue coverage:** Issue #190 acceptance criteria —
  (1) "templates pass commitlint locally and in CI" → covered by the contract
  test (static) + the existing commit-msg hook exercises the same rules in CI;
  (2) "release commit includes all three required footers" → Task 1;
  (3) "git tag -s during /release requires the same confirmation as git commit"
  → Task 2 (`ask`, matching `git commit*`).
- **Placeholder scan:** No TBD/TODO. Commit messages carry full footers; the
  `Signed-off-by:` value is resolved at commit time per repo convention.
- **Type consistency:** The `build` agent block string `"git tag*": "ask"` is
  identical in the plan body, the test grep, and the `opencode.jsonc` edit. The
  merge subject `Merge branch '<from-branch>' into <target-branch>` is
  consistent between the edit and the `grep -qF 'Merge branch'` assertion.
- **Coverage gate:** N/A — no PHP source files changed (the gate measures
  changed PHP files within `<source>`).
