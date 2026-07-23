# `@general` Permission Hardening Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the permission-model gap on the `general` inline primary agent
(issue #202) by giving it the same git-mutation gate as `build`/`design`,
record the decision in ADR-0006, and extend the harness validator so the
inherited-default drift class cannot recur.

**Architecture:** `general` (`opencode.jsonc:130-137`) ships only
`lsp: allow` and no `bash` key, so it inherits the top-level `permission.bash`
(which denies only `git push*`). The most-invoked default agent can therefore
`git add`/`stage`/`commit` with no gate — and, being a general-purpose agent,
it can also run arbitrary non-git bash (already mitigated harness-wide by the
safety hook of ADR-0023/0036 for the commands that matter: `rm -rf`,
`DROP DATABASE`, `git push --force`, `--no-verify`). The fix mirrors
`build`/`design` exactly: a `bash` object with `"*": "allow"` plus
`git add*/stage*/commit*: ask` and `git push*: deny`. `general` remains a
general-purpose agent (not read-only), so the scoped-edit and catch-all-bash-
deny requirements of ADR-0006 do not apply — only the missing git-mutation
gate. The validator gains an inline-agent check: any agent whose `bash` is not
a full deny must explicitly gate `git commit*` (ask/deny).

**Tech Stack:** JSONC (`opencode.jsonc`), Bash (`validate-harness.sh` +
Shell tests), Node.js (`inline-agent-permissions.js`), PHP/Pest (regression
test using the `load_opencode_config()` helper).

## Global constraints

- **Mirror `build`/`design` exactly.** The `general` `bash` object must be
  byte-identical in *intent* to `build` (`opencode.jsonc:72-80`) and `design`
  (`opencode.jsonc:118-126`): `"*": "allow"`, `"git add*": "ask"`,
  `"git stage*": "ask"`, `"git commit*": "ask"`, `"git push*": "deny"`. Do
  not invent extra restrictions (the safety hook already covers destructive
  non-git commands with finer-grained logic than flat permission rules allow).
- **opencode bash permission objects are NOT gitignore-style.** Keys are
  matched as glob suffixes against the command string. `"git add*"` matches
  `git add`, `git add -A`, `git add .`, etc. `"*"` is the catch-all. Quoting
  is required for every key (`"git commit*": "ask"`), matching the surrounding
  file.
- **RCS headers** required on every new source file (`.php`, `.js`, `.scss`,
  `.sh`, `.ts`) — see `rcs-header` skill. Markdown/config files (`.md`,
  `.jsonc`) do NOT carry RCS headers. Every source file ends with a vim
  modeline.
- **Signed commits** (`git commit -S`), Conventional Commits format, footers
  `Authored-by:`, `Tested-by:`, `Signed-off-by:` (resolved via
  `bash .github/scripts/resolve-identity.sh`). This issue is **Type=Security**
  → commit type `fix`. Non-closing reference: `Refs: #202` (the issue is
  closed on merge, matching the #198 plan's convention).
- **Commit quoting:** use the canonical `$'...\n...'` ANSI-C quoting form
  (the `commit-msg` hook rejects literal `\n` per ADR-0025). Never use
  multiple `-m` flags.
- **TDD mandatory:** Red → Green → Refactor, no exceptions. Minimum 80% line
  coverage on changed files.
- **`inline-agent-permissions.js` TSV contract:** the node helper emits
  tab-separated rows `name\tdesc\tedit\tbash_restricted`. Task 3 adds a 5th
  column `git_commit`; the existing 4-field `read` in `validate-harness.sh`
  MUST be updated to 5 fields to avoid contaminating `bash_restricted` with
  the trailing column.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `adr/0006-readonly-agent-permission-contract.md` | Modify | Append amendment recording the `general` git-gate decision (issue #202) |
| `opencode.jsonc` | Modify | Add `bash` permission object to the `general` inline agent (mirror build/design) |
| `tests/Unit/Harness/GeneralAgentPermissionTest.php` | Create | Pest regression test asserting `general`'s real bash block gates git mutations (Red→Green for Task 2) |
| `.github/scripts/inline-agent-permissions.js` | Modify | Emit 5th TSV column `git_commit` (the `git commit*` verdict, or empty) |
| `.github/scripts/validate-harness.sh` | Modify | Update existing inline `read` to 5 fields; add "inline agent git-commit gating" check (issue #202) |
| `tests/Shell/validate-harness_test.sh` | Modify | Add 3 tests for the new validator check (Red→Green for Task 3) |

**Not in scope:**
- `build`/`design` already carry the gate; `tdd`/`resolve-merge-conflicts`
  (general-purpose write agents) intentionally allow commit and are governed
  by their own disciplined cycles — they are `.md` agents, not inline.
- The `.md`-agent git-commit gate is a separate concern; this plan's validator
  extension covers **inline** (`opencode.jsonc`) agents only, matching the
  issue's scope. An `.md` equivalent can be added later if needed.

---

### Task 1: Amend ADR-0006 with the `general` git-gate decision

**Files:**
- Modify: `adr/0006-readonly-agent-permission-contract.md` (append to the
  `## Amendments` section, after the existing `2026-07-22 (issue #198)`
  entry — currently the last bullet in that section)

**Interfaces:** None (decision record).

- [ ] **Step 1: Append the amendment block**

Append to the end of the `## Amendments` section in
`adr/0006-readonly-agent-permission-contract.md` (after the existing
`2026-07-22 (issue #198)` entry):

```markdown
- **2026-07-22 (issue #202):** The read-only contract (Decision points 1–4)
  guards agents that claim read-only in their *description*, but the inline
  primary agent `general` carries no description at all — so it fell through
  every guard. `general` set only `lsp: allow` and inherited the top-level
  permissive `permission.bash` (only `git push*` denied), leaving the most-
  invoked default agent able to `git add`/`stage`/`commit` with no gate. The
  fix gives `general` the same `bash` block as `build`/`design`
  (`"*": "allow"` + `git add*/stage*/commit*: ask` + `git push*: deny`): it
  remains a general-purpose agent, **not** read-only, so the scoped-edit and
  catch-all-bash-deny requirements do not apply — only the git-mutation gate
  was missing. (Unrestricted non-git bash is already mitigated harness-wide by
  the safety hook of ADR-0023/0036 for the destructive commands that matter:
  `rm -rf`, `DROP DATABASE`, `git push --force`, `--no-verify`.) The
  validate-harness check was extended to flag any inline agent whose `bash` is
  not a full deny but that lacks an explicit `git commit*` gate (ask/deny), so
  the inherited-default drift class cannot recur.
```

- [ ] **Step 2: Verify the amendment renders correctly**

Read the appended block. Confirm: it is a dated bullet under `## Amendments`,
references issue #202, follows the same prose style as the #184/#198
amendments, and does not contradict the Decision text (it explains why the
read-only contract did not already cover `general`). No automated test — this
is a decision record.

- [ ] **Step 3: Commit**

```bash
git add adr/0006-readonly-agent-permission-contract.md
git commit -S -m $'docs(adr): amend ADR-0006 for @general git-mutation gate (#202)\n\nRecords why the read-only contract did not cover the inline primary agent\n@general: it has no description, so it inherited the top-level permissive\npermission.bash (only git push* denied) and could git add/stage/commit with\nno gate. The fix mirrors build/design (git add*/stage*/commit*: ask + git\npush*: deny); general stays general-purpose, not read-only. The validator is\nextended to flag inline agents that can commit without an explicit gate.\n\nRefs: #202\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 2: Add the `bash` gate to `general` + regression test

**Files:**
- Test: `tests/Unit/Harness/GeneralAgentPermissionTest.php` (create)
- Modify: `opencode.jsonc` (the `general` block, currently lines 130-137)

**Interfaces:**
- Produces: a `general` agent whose `permission.bash` gates git mutations —
  consumed by Task 3's validator (must NOT be flagged as ungated).

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/Harness/GeneralAgentPermissionTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: GeneralAgentPermissionTest.php kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $




use PHPUnit\Framework\Assert;

/**
 * Regression guard for issue #202: the inline primary agent `general` must
 * gate git mutations (add/stage/commit: ask, push: deny) rather than inherit
 * the top-level permissive bash default.
 */
it('general agent gates git add/stage/commit and denies push', function () {
    $config = load_opencode_config();

    Assert::assertArrayHasKey('agent', $config);
    Assert::assertArrayHasKey('general', $config['agent']);
    $general = $config['agent']['general'];

    // general must define its OWN bash permission block — not inherit defaults.
    Assert::assertArrayHasKey(
        'permission',
        $general,
        'general must define a permission block (issue #202)',
    );
    Assert::assertArrayHasKey(
        'bash',
        $general['permission'],
        'general must define a bash permission object, not inherit the top-level default (issue #202)',
    );
    Assert::assertIsArray(
        $general['permission']['bash'],
        'general bash permission must be an object',
    );

    $bash = $general['permission']['bash'];

    Assert::assertSame('ask', $bash['git add*'] ?? null, "general 'git add*' must be 'ask'");
    Assert::assertSame('ask', $bash['git stage*'] ?? null, "general 'git stage*' must be 'ask'");
    Assert::assertSame('ask', $bash['git commit*'] ?? null, "general 'git commit*' must be 'ask'");
    Assert::assertSame('deny', $bash['git push*'] ?? null, "general 'git push*' must be 'deny'");
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

> Note: the `$KYAULabs:` header and author/date segment are filled from the
> rcs-header skill + `resolve-identity.sh` at creation time. The blank lines
> after the header match the repo's other harness test files (e.g.
> `ModelConfigTest.php`) which pad the RCS header to a fixed block.

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `php vendor/bin/pest --filter=general_agent_gates_git`
Expected: **FAIL** — `general` currently has no `bash` key, so the
`assertArrayHasKey('bash', ...)` assertion fails with a message referencing
issue #202.

- [ ] **Step 3: Apply the bash gate to `general` in opencode.jsonc**

In `opencode.jsonc`, replace the current `general` block (lines 130-137):

```jsonc
    "general": {
      "model": "{env:OPENCODE_MODEL_PRIMARY}",
      "variant": "{env:OPENCODE_VARIANT_PRIMARY}",
      "temperature": 0.1,
      "permission": {
        "lsp": "allow"
      }
    },
```

with:

```jsonc
    "general": {
      "model": "{env:OPENCODE_MODEL_PRIMARY}",
      "variant": "{env:OPENCODE_VARIANT_PRIMARY}",
      "temperature": 0.1,
      "permission": {
        "bash": {
          "*": "allow",
          "git add*": "ask",
          "git stage*": "ask",
          "git commit*": "ask",
          "git push*": "deny"
        },
        "lsp": "allow"
      }
    },
```

This is byte-identical in intent to the `build` (`opencode.jsonc:72-80`) and
`design` (`opencode.jsonc:118-126`) bash blocks. The explicit
`git push*: deny` is redundant with the top-level deny but is kept for
self-documentation and parity with `build`/`design` (defense-in-depth).

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `php vendor/bin/pest --filter=general_agent_gates_git`
Expected: **PASS** — "general agent gates git add/stage/commit and denies push".

- [ ] **Step 5: Run the full harness test suite to check for regressions**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness`
Expected: all PASS (including the pre-existing
`general stays on PRIMARY tier` test in `ModelConfigTest.php`, which only
reads `model`/`variant` — unaffected by the new `bash` key).

- [ ] **Step 6: Commit**

```bash
git add opencode.jsonc tests/Unit/Harness/GeneralAgentPermissionTest.php
git commit -S -m $'fix(security): gate @general git mutations like build/design (#202)\n\n@general shipped only lsp: allow and inherited the top-level\npermission.bash (only git push* denied), so the most-invoked default agent\ncould git add/stage/commit with no gate. Add the same bash block as\nbuild/design: "*" allow plus git add*/stage*/commit*: ask and git push*:\ndeny. general stays general-purpose (not read-only); the safety hook of\nADR-0023/0036 already covers destructive non-git commands harness-wide.\n\nRefs: #202\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

### Task 3: Extend the validator to flag ungated inline-agent git commit

**Files:**
- Modify: `.github/scripts/inline-agent-permissions.js` (emit 5th TSV column)
- Modify: `.github/scripts/validate-harness.sh` (update existing inline `read`
  to 5 fields; add the git-commit gating check)
- Test: `tests/Shell/validate-harness_test.sh` (add 3 tests)

**Interfaces:**
- Consumes: Task 2's gated `general` (must pass the new check).
- Produces: validator coverage so any future inline agent whose `bash` is not
  a full deny but that lacks a `git commit*` ask/deny gate fails validation.

**The check rule (encode exactly):**

For each inline agent emitted by `inline-agent-permissions.js`: if
`bash_restricted` is **not** `true` (i.e. bash is absent, a non-`deny` string,
or an object whose `"*"` is not `deny`), then the `git commit*` verdict
(`git_commit`) MUST be `ask` or `deny`. Absent or `allow` → error. Agents with
`bash_restricted == true` (`plan`, `chat`, `judge`) are skipped.

- [ ] **Step 1: Write the failing tests (Red)**

Append the following three tests to `tests/Shell/validate-harness_test.sh`,
immediately BEFORE the final `print_summary` invocation (search for
`print_summary` and insert above it). Use `"agent"` **singular** in the
fixtures so the node helper (`cfg.agent`) emits rows.

```bash
# ── Test: inline agent with no bash (inherits default) flagged (issue #202) ────

echo "── Test: inline agent (no bash) flagged for ungated git commit ──"
T_GC1=$(mktemp -d)
register_temp_dir "$T_GC1"
git_init_test_repo "$T_GC1"
(
	cd "$T_GC1"
	mkdir -p .opencode/agents
	setup_validator_env

	# general drift class: only lsp set, bash inherited (no git-commit gate).
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"general": {
			"permission": {
				"lsp": "allow"
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -qF "git commit without a gate"; then
		pass "Caught inline agent with inherited/ungated git commit (issue #202)"
	else
		fail "Did not detect inline agent with ungated git commit"
	fi
)

# ── Test: inline agent with bash allow + git commit ask NOT flagged ────────────

echo "── Test: inline agent (git commit: ask) not flagged ──"
T_GC2=$(mktemp -d)
register_temp_dir "$T_GC2"
git_init_test_repo "$T_GC2"
(
	cd "$T_GC2"
	mkdir -p .opencode/agents
	setup_validator_env

	# build/design posture: "*" allow + git commit gated at ask.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"build": {
			"permission": {
				"bash": {
					"*": "allow",
					"git add*": "ask",
					"git stage*": "ask",
					"git commit*": "ask",
					"git push*": "deny"
				}
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "build" | grep -qF "git commit without a gate"; then
		fail "Gated inline agent (git commit: ask) was falsely flagged"
	else
		pass "Gated inline agent (git commit: ask) not flagged"
	fi
)

# ── Test: inline agent with bash fully denied NOT flagged (skipped) ────────────

echo "── Test: inline agent (bash: deny) not flagged (skipped) ──"
T_GC3=$(mktemp -d)
register_temp_dir "$T_GC3"
git_init_test_repo "$T_GC3"
(
	cd "$T_GC3"
	mkdir -p .opencode/agents
	setup_validator_env

	# judge posture: bash fully denied — no commit possible, skip the check.
	cat > opencode.jsonc <<'EOF'
{
	"agent": {
		"judge": {
			"permission": {
				"bash": "deny"
			}
		}
	}
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || true

	if echo "$output" | grep -F "judge" | grep -qF "git commit without a gate"; then
		fail "Fully-denied inline agent was falsely flagged"
	else
		pass "Fully-denied inline agent (bash: deny) not flagged"
	fi
)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: the first test FAILS ("Did not detect inline agent with ungated git
commit") — the check does not exist yet. The other two PASS trivially (nothing
is flagged either way). The Red signal is the first test.

- [ ] **Step 3: Extend `inline-agent-permissions.js` to emit the git-commit column**

In `.github/scripts/inline-agent-permissions.js`, find the emit block
(currently lines 82-88):

```js
    let bashRestricted = '';
    if (typeof perm.bash === 'string') {
        bashRestricted = perm.bash === 'deny' ? 'true' : 'false';
    } else if (perm.bash && typeof perm.bash === 'object') {
        bashRestricted = perm.bash['*'] === 'deny' ? 'true' : 'false';
    }
    process.stdout.write(`${name}\t${desc}\t${edit}\t${bashRestricted}\n`);
```

Replace with (adds the `gitCommit` column):

```js
    let bashRestricted = '';
    if (typeof perm.bash === 'string') {
        bashRestricted = perm.bash === 'deny' ? 'true' : 'false';
    } else if (perm.bash && typeof perm.bash === 'object') {
        bashRestricted = perm.bash['*'] === 'deny' ? 'true' : 'false';
    }

    // git commit* verdict (allow/ask/deny), or '' if absent. Consumed by the
    // inline git-commit gating check (issue #202): a non-denied agent must
    // gate git commit explicitly rather than inherit the permissive default.
    let gitCommit = '';
    if (perm.bash && typeof perm.bash === 'object') {
        const v = perm.bash['git commit*'];
        if (typeof v === 'string') gitCommit = v;
    }

    process.stdout.write(`${name}\t${desc}\t${edit}\t${bashRestricted}\t${gitCommit}\n`);
```

Also update the header comment (lines 6-12) to document the 5th column. Change
the "Emits one row" block to add:

```
//   git_commit       = the 'git commit*' verdict ('allow', 'ask', 'deny'), or
//                      '' if the key is absent or bash is not an object.
```

- [ ] **Step 4: Update the existing inline `read` in validate-harness.sh to 5 fields**

In `.github/scripts/validate-harness.sh`, the inline read-only loop currently
reads 4 fields (around line 771):

```bash
	while IFS=$'\t' read -r agent_name desc edit_val bash_restricted; do
```

Change it to consume the new 5th column (prevents `bash_restricted` from being
contaminated by the trailing `git_commit` field):

```bash
	while IFS=$'\t' read -r agent_name desc edit_val bash_restricted _git_commit; do
```

(The read-only check does not use `_git_commit`; it is consumed and discarded.
The dedicated loop in Step 5 reads it into a used variable.)

- [ ] **Step 5: Add the git-commit gating check (Green)**

In `.github/scripts/validate-harness.sh`, insert this new block immediately
AFTER the inline read-only-contract block (after the `if [ "$INLINE_RO_CHECKED"
-eq 0 ] ... ok/warn ... fi` that closes the "Checking inline agent permission
contracts" section, currently around line 798) and BEFORE the
`# ── Check git add/git stage verdict parity ──` comment (currently around
line 800):

```bash
# ── Check inline agent git-commit gating (opencode.jsonc) ─────────────────────

echo "── Checking inline agent git-commit gating ──"
INLINE_GC_CHECKED=0
INLINE_GC_VIOLATIONS=0

# Any inline agent whose bash is NOT a full deny (bash: deny OR {"*": deny})
# must explicitly gate "git commit*" with ask or deny. An agent that inherits
# the top-level default (only git push* denied) can commit with no gate — the
# exact drift class of issue #202 (general). bash_restricted == 'true' agents
# (plan, chat, judge) are skipped; build/design/general carry the ask gate.

if [ -f "$INLINE_HELPERS" ] && [ -f "$OPENCODE_JSONC" ]; then
	while IFS=$'\t' read -r agent_name desc edit_val bash_restricted git_commit; do
		[ -z "$agent_name" ] && continue

		# Skip agents whose bash is fully denied (no commit possible anyway).
		[ "$bash_restricted" = "true" ] && continue

		INLINE_GC_CHECKED=$((INLINE_GC_CHECKED + 1))

		case "$git_commit" in
			ask|deny) : ;;  # explicitly gated — OK
			*)
				err "opencode.jsonc: inline agent '${agent_name}' can git commit without a gate (issue #202) — add '\"git commit*\": \"ask\"' (or deny). bash is not fully denied but 'git commit*' is '${git_commit:-<unset>}'"
				INLINE_GC_VIOLATIONS=$((INLINE_GC_VIOLATIONS + 1))
				;;
		esac
	done < <(node "$INLINE_HELPERS" "$OPENCODE_JSONC")
fi

if [ "$INLINE_GC_CHECKED" -eq 0 ]; then
	warn "No non-denied inline agents found — git-commit gate check did not run"
else
	ok "${INLINE_GC_CHECKED} inline agent(s) checked for git-commit gating, ${INLINE_GC_VIOLATIONS} violation(s)"
fi
```

- [ ] **Step 6: Run the validator tests to verify Green**

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: ALL PASS — the first new test now detects "git commit without a
gate"; the second (ask-gated) and third (bash: deny) are not flagged.

- [ ] **Step 7: Run the validator against the REAL repo**

Run: `bash .github/scripts/validate-harness.sh`
Expected: the new "Checking inline agent git-commit gating" section reports
"N inline agent(s) checked for git-commit gating, 0 violation(s)" (N ≥ 3:
`build`, `design`, `general`). If any agent IS flagged, do NOT suppress it —
investigate (it may be a real new gap).

- [ ] **Step 8: Re-run the Task 2 regression test (cross-check)**

Run: `php vendor/bin/pest --filter=general_agent_gates_git`
Expected: PASS (confirms Task 3 did not regress the config assertion).

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/inline-agent-permissions.js .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(security): flag ungated inline-agent git commit in validator (#202)\n\nExtends validate-harness.sh (ADR-0006 Decision #4) with a check that flags\nany inline agent whose bash is not a full deny but that lacks an explicit\ngit commit* gate (ask/deny). inline-agent-permissions.js now emits a fifth\nTSV column (the git commit* verdict) and the existing inline read is widened\nto 5 fields. Prevents recurrence of the @general drift class (issue #202):\nan inline agent that inherits the top-level permissive default and can\ncommit with no gate.\n\nRefs: #202\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Verification (after all tasks)

1. `php vendor/bin/pest --filter=general_agent_gates_git` → PASS
2. `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness` → all PASS
3. `bash tests/Shell/validate-harness_test.sh` → all PASS (incl. the 3 new
   git-commit-gating tests)
4. `bash .github/scripts/validate-harness.sh` → "N inline agent(s) checked for
   git-commit gating, 0 violation(s)"
5. `/check` (php-cs-fixer + stylelint + eslint + pest --coverage) → green,
   ≥80% line coverage on changed files
6. `@code-review` on the branch before push

## Out of scope

- A git-commit gate check for `.md` agents (`.opencode/agents/*.md`). The
  `.md` git-add/stage *parity* check already exists; a commit-gate equivalent
  can be added later if a `.md` write agent ever ships an ungated commit.
  This plan's validator extension covers inline (`opencode.jsonc`) agents only,
  matching issue #202's scope.
- Restricting `general`'s non-git bash beyond the safety hook. The user
  explicitly chose Option A (mirror build/design) over a full deny allowlist.
