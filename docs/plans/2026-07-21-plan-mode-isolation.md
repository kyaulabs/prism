# Plan: Plan-Mode Isolation Fix (Issue #184)

**Date:** 2026-07-21
**Issue:** #184 — Plan-Mode Isolation Broken
**Governing ADR:** `adr/0006-readonly-agent-permission-contract.md` (Accepted)
**Architect verdict:** GO-WITH-CONDITIONS (`ADR-required: none` under Option A)
**Branch:** `fix/kyau-66f4-plan-mode-isolation`
**Commit type:** `fix(security)`

## Goal

Resolve issue #184 (security regression of ADR-0006) by restoring Plan-mode
read-only isolation: lock down `@explore` with a true read-only permission
block, remove `@docs-writer` and `@from-issue` from Plan's task allowlist,
extend `validate-harness.sh` to scan inline-defined agents in `opencode.jsonc`
so the regression class cannot recur, and update tests + docs to assert the
corrected contract. Implements ADR-0006 Decision #3 and Decision #4 faithfully.

**Posture decision (Option A — user-confirmed):** `@from-issue` is removed
from Plan's task allowlist; no superseding ADR. Issue on-ramp happens from the
Build tab, matching the design agent's existing redirect at
`opencode.jsonc:130` and ADR-0006 Decision #3's enumeration of Plan's
compliant allowlist as exactly six agents.

## Global constraints

- ADR-0006 is the governing contract; ADR-0022 governs the `model`/`variant`
  split when `@explore` moves to a `.md` file (model/variant/temperature stay
  inline in `opencode.jsonc`; description/mode/permission/prompt move to the
  `.md` file).
- Existing helpers MUST be reused: `load_opencode_config()` and
  `strip_jsonc_comments()` in `tests/Pest.php:130,208`; `agent_frontmatter()`
  and `agent_contents()` in `tests/Pest.php:239,266`; shell helpers in
  `tests/Shell/lib/test_helpers.sh`.
- `validate-harness.sh` already requires `node` (line 24) and `js-yaml`
  (line 39). The new inline-agent check shells out to `node` with a sibling
  helper script — consistent with the existing `frontmatter-parser.js`
  precedent.
- No new dependencies. `node` + `js-yaml` are already required.
- The `@explore` Graphify-first protocol (current `opencode.jsonc:168`)
  requires these bash patterns in the allowlist: `test -f*`, `graphify query*`,
  `graphify path*`, `graphify explain*`. Omitting them breaks the agent's
  primary navigation path.

## Execution mode

`@tdd`-dispatch with two-stage review gate (executing-plans skill). Each task
is a vertical slice: Red (failing test) → Green (minimal implementation) →
Refactor. Parent reviews between tasks. Commit after each task — atomic, no
squash.

## Verification commands (after every task)

```bash
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/    # Pest harness suite
bash tests/Shell/validate-harness_test.sh                    # Shell validator tests
bash .github/scripts/validate-harness.sh                     # The validator itself (must PASS)
```

Final gate:
```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage             # Full suite + 80% coverage
```

---

## Task 1: Lock down `@explore` with a true read-only permission block

**Files:**
- Create: `.opencode/agents/explore.md`
- Modify: `opencode.jsonc:161-168` (strip prompt + add description; keep
  model/variant/temperature only)
- Test: `tests/Unit/Harness/ExploreAgentTest.php` (NEW)

**Interfaces:**
- Produces: `.opencode/agents/explore.md` with frontmatter `description`,
  `mode: subagent`, `temperature: 0.1`, `permission` block (edit: deny,
  bash catch-all deny + read-only allowlist + Graphify carve-out, webfetch:
  deny, task: deny), and the agent prompt body.
- Produces: `opencode.jsonc` `explore` block shrinks to `model`, `variant`,
  `temperature` only (per ADR-0022).
- Consumes (later tasks): Task 5's `ReadOnlyInlineAgentContractTest` asserts
  `explore` carries `edit: deny` and bash catch-all deny. Task 3's
  `validate-harness.sh` extension walks the inline `agent.explore` block.

### Step 1: Write failing test

Create `tests/Unit/Harness/ExploreAgentTest.php`. Mirror
`tests/Unit/Harness/ChatAgentTest.php` and
`tests/Unit/Harness/CodeReviewCoordinatorTest.php` patterns.

```php
<?php

declare(strict_types=1);

# $KYAULabs: ExploreAgentTest.php kyau@nova 2026/07/21 -0700 Exp $

use PHPUnit\Framework\Assert;

/**
 * Harness tests for the @explore subagent (issue #184).
 *
 * Asserts @explore carries a true read-only permission contract per ADR-0006:
 * edit: deny, bash catch-all deny with a scoped read-only allowlist (incl.
 * Graphify navigation carve-out), webfetch: deny, task: deny. After issue
 * #184, @explore lives in .opencode/agents/explore.md (moved out of inline
 * opencode.jsonc per the 12-subagent precedent) — model/variant/temperature
 * stay inline in opencode.jsonc per ADR-0022.
 */

it('explore agent definition file exists (moved out of opencode.jsonc inline)', function (): void {
    Assert::assertFileExists(__DIR__ . '/../../../.opencode/agents/explore.md');
});

it('explore agent has mode subagent and a literal temperature', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertMatchesRegularExpression(
        '/^mode:\s*subagent/m',
        $fm,
        'explore.md must declare mode: subagent',
    );
    Assert::assertMatchesRegularExpression(
        '/^temperature:\s*[\d.]+/m',
        $fm,
        'explore.md must set an explicit numeric temperature',
    );
});

it('explore agent is read-only: edit, webfetch, and task are denied', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString('edit: deny', $fm, 'explore must deny edit (read-only contract, ADR-0006)');
    Assert::assertStringContainsString('webfetch: deny', $fm, 'explore must deny webfetch');
    Assert::assertStringContainsString('task: deny', $fm, 'explore must deny task (no subagent dispatch)');
});

it('explore agent has bash catch-all deny plus read-only allowlist', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString('"*": deny', $fm, 'explore must have bash catch-all deny');

    foreach (['ls*', 'cat*', 'grep*', 'find*', 'git log*', 'git show*'] as $pattern) {
        Assert::assertStringContainsString(
            "\"{$pattern}\": allow",
            $fm,
            "explore must allow read-only bash pattern '{$pattern}'",
        );
    }
});

it('explore agent preserves Graphify-first navigation carve-out', function (): void {
    $fm = agent_frontmatter('explore');

    foreach (['test -f*', 'graphify query*', 'graphify path*', 'graphify explain*'] as $pattern) {
        Assert::assertStringContainsString(
            "\"{$pattern}\": allow",
            $fm,
            "explore must allow Graphify navigation pattern '{$pattern}' (primary navigation path)",
        );
    }
});

it('explore agent description claims read-only (validator keyword trigger)', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertMatchesRegularExpression(
        '/^description:\s*.+(read-only|does not modify)/im',
        $fm,
        'explore description must contain a read-only keyword so validate-harness.sh enforces the contract',
    );
});

it('explore agent preserves the Graphify-first protocol in its prompt body', function (): void {
    $body = agent_contents('explore');

    Assert::assertStringContainsString('graphify-out/graph.json', $body);
    Assert::assertStringContainsString('graphify query', $body);
});

it('explore is registered in opencode.jsonc at the JUDGE tier (model/variant/temperature only)', function (): void {
    $cfg = load_opencode_config();

    Assert::assertArrayHasKey('explore', $cfg['agent']);
    $explore = $cfg['agent']['explore'];

    Assert::assertSame('{env:OPENCODE_MODEL_JUDGE}', $explore['model']);
    Assert::assertSame('{env:OPENCODE_VARIANT_JUDGE}', $explore['variant']);
    Assert::assertIsFloat($explore['temperature']);

    // After issue #184, prompt + permission live in the .md file — NOT inline.
    Assert::assertArrayNotHasKey(
        'prompt',
        $explore,
        'explore prompt must live in .opencode/agents/explore.md (not inline in opencode.jsonc)',
    );
    Assert::assertArrayNotHasKey(
        'permission',
        $explore,
        'explore permission block must live in .opencode/agents/explore.md (not inline in opencode.jsonc)',
    );
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

### Step 2: Run test to verify it fails

Run: `php vendor/bin/pest tests/Unit/Harness/ExploreAgentTest.php`
Expected: FAIL — `.opencode/agents/explore.md` does not exist; `agent_frontmatter('explore')` throws RuntimeException.

### Step 3: Create `.opencode/agents/explore.md`

```markdown
---
description: Focused codebase exploration — read-only. Answers the caller's question with the minimum scoped context needed; does not modify files, dispatch subagents, or run shell commands outside a read-only allowlist plus Graphify navigation.
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash:
    "*": deny
    "ls*": allow
    "cat*": allow
    "tail*": allow
    "head*": allow
    "grep*": allow
    "find*": allow
    "git log*": allow
    "git show*": allow
    "git status*": allow
    "git diff*": allow
    "git branch*": allow
    "test -f*": allow
    "graphify query*": allow
    "graphify path*": allow
    "graphify explain*": allow
  webfetch: deny
  task: deny
---

You are the @explore agent for a KYAULabs PHP project. Your job is focused
codebase exploration — answer the caller's question with the minimum scoped
context needed. You are read-only: you cannot edit files, dispatch subagents,
or run shell commands outside the read-only allowlist above.

## Graphify-first protocol

Before falling back to glob/grep/read:

1. Check whether `graphify-out/graph.json` exists (one `bash` call: `test -f graphify-out/graph.json`).
2. If it exists AND the caller's question is a structural/relational query (callers, definitions, data flow, "what uses X", "where is Y"), run `graphify query "<rephrased question>"` via `bash` and treat the scoped subgraph as your primary source.
3. If the query returns nothing relevant, OR `graphify-out/graph.json` is absent, OR graphify is not installed, fall back to your normal glob/grep/read + LSP workflow.

Do NOT rebuild the graph yourself — that is the user's job via `/graph build`. If the graph is stale, note it in your answer and proceed with what exists; the user can rebuild if needed.

`AGENTS.md` is loaded every session — do not restate its rules.

// vim: ft=markdown sts=4 sw=4 ts=4 et :
```

### Step 4: Strip prompt from `opencode.jsonc` `explore` block

In `opencode.jsonc` lines 161-168, replace the inline prompt + permission block with model/variant/temperature only (matching the `tdd`, `architect`, etc. pattern at lines 170+):

```jsonc
"explore": {
  "model": "{env:OPENCODE_MODEL_JUDGE}",
  "variant": "{env:OPENCODE_VARIANT_JUDGE}",
  "temperature": 0.1
},
```

### Step 5: Run test to verify it passes

Run: `php vendor/bin/pest tests/Unit/Harness/ExploreAgentTest.php`
Expected: PASS — all 8 cases green.

### Step 6: Run validator to ensure no regression

Run: `bash .github/scripts/validate-harness.sh`
Expected: PASS — `explore` is now scanned as a `.md` file (read-only contract check passes).

### Step 7: Commit

```bash
git add .opencode/agents/explore.md opencode.jsonc tests/Unit/Harness/ExploreAgentTest.php
git commit -S -m $'fix(security): lock down @explore with read-only permission contract\n\nMove @explore from inline opencode.jsonc block to .opencode/agents/explore.md\nwith a true read-only permission block (edit: deny, bash catch-all deny +\nscoped read-only allowlist incl. Graphify navigation carve-out, webfetch:\ndeny, task: deny). Model/variant/temperature stay inline per ADR-0022.\nAdds ExploreAgentTest.php mirroring ChatAgentTest.php.\n\nFixes: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 2: Remove `docs-writer` from Plan's task allowlist

**Files:**
- Modify: `opencode.jsonc:102-112` (Plan task allowlist)
- Test: `tests/Unit/Harness/PlanModeAllowlistTest.php` (NEW)

**Interfaces:**
- Produces: Plan's `task` allowlist equals exactly `{ test-audit, code-review,
  semgrep, architect, explore, scout }` (6 entries — ADR-0006 Decision #3).
- Consumes (Task 4): same file is extended to also assert `from-issue` is
  absent.

### Step 1: Write failing test

Create `tests/Unit/Harness/PlanModeAllowlistTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: PlanModeAllowlistTest.php kyau@nova 2026/07/21 -0700 Exp $

use PHPUnit\Framework\Assert;

/**
 * Harness tests for the plan primary agent's task allowlist (issue #184).
 *
 * Asserts Plan mode's task allowlist is exactly the six read-only agents
 * enumerated in ADR-0006 Decision #3: test-audit, code-review, semgrep,
 * architect, explore, scout. Plan mode is read-only — write-capable agents
 * (docs-writer, from-issue, tdd, debug, resolve-merge-conflicts) are excluded.
 */

it('plan agent task allowlist defaults to deny', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    Assert::assertSame('*', array_key_first($task), "plan task allowlist's first key must be '*'");
    Assert::assertSame('deny', $task['*'] ?? null, 'plan task allowlist must default to deny');
});

it('plan agent task allowlist contains exactly the 6 read-only agents (ADR-0006 Decision #3)', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    $expected = [
        '*'            => 'deny',
        'test-audit'   => 'allow',
        'code-review'  => 'allow',
        'semgrep'      => 'allow',
        'architect'    => 'allow',
        'explore'      => 'allow',
        'scout'        => 'allow',
    ];

    // Exact match — no extra agents, no missing agents.
    Assert::assertSame($expected, $task, 'plan task allowlist must be exactly the 6 read-only agents per ADR-0006');
});

it('plan agent task allowlist excludes write-capable agents (issue #184)', function (): void {
    $cfg = load_opencode_config();
    $task = $cfg['agent']['plan']['permission']['task'] ?? [];

    foreach (['docs-writer', 'from-issue', 'tdd', 'debug', 'resolve-merge-conflicts'] as $agent) {
        Assert::assertArrayNotHasKey(
            $agent,
            $task,
            "plan task allowlist must NOT include '{$agent}' (Plan is read-only per ADR-0006)",
        );
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

### Step 2: Run test to verify it fails

Run: `php vendor/bin/pest tests/Unit/Harness/PlanModeAllowlistTest.php`
Expected: FAIL — `docs-writer` and `from-issue` are still present, so the
exact-match assertion fails.

### Step 3: Remove `docs-writer` from Plan's allowlist (and `from-issue` since the test asserts both)

In `opencode.jsonc:102-112`, change to:

```jsonc
"task": {
  "*": "deny",
  "test-audit": "allow",
  "code-review": "allow",
  "semgrep": "allow",
  "architect": "allow",
  "explore": "allow",
  "scout": "allow"
}
```

(Removes both `docs-writer` and `from-issue`. Task 4's test change is therefore
folded into this commit's test file. See Task 4 for the FromIssueAgentTest.php
flip — that test belongs in its own commit because it asserts a different
file's contract.)

**Note:** To preserve TDD discipline (one failing test → one fix), this single
config edit satisfies both Task 2's `PlanModeAllowlistTest` AND removes the
`from-issue` entry that Task 4 will then assert via `FromIssueAgentTest`. The
two tasks share the same `opencode.jsonc` edit; they are split into separate
commits because each commit's *test* file is independent and each carries its
own acceptance criterion.

### Step 4: Run test to verify it passes

Run: `php vendor/bin/pest tests/Unit/Harness/PlanModeAllowlistTest.php`
Expected: PASS — exact-match assertion holds.

### Step 5: Run full Pest harness suite to confirm no other test breaks

Run: `php vendor/bin/pest tests/Unit/Harness/`
Expected: `FromIssueAgentTest.php:138-147` FAILS — it asserts `from-issue` IS
in the allowlist. **This is the expected Red for Task 4.** All other harness
tests pass.

### Step 6: Commit (Task 2 only — `PlanModeAllowlistTest`)

```bash
git add opencode.jsonc tests/Unit/Harness/PlanModeAllowlistTest.php
git commit -S -m $'fix(security): remove docs-writer and from-issue from Plan task allowlist\n\nPlan mode is read-only per ADR-0006 Decision #3 — its task allowlist must\nbe exactly the 6 read-only agents: test-audit, code-review, semgrep,\narchitect, explore, scout. Removes docs-writer (write-capable, edits source\nfor PHPDoc/RCS) and from-issue (branches, commits, dispatches @tdd — full\nwrite pipeline). Issue on-ramp happens from Build tab per the design agent\'s\nexisting redirect at opencode.jsonc:130.\n\nAdds PlanModeAllowlistTest.php asserting the exact 6-entry contract.\nFromIssueAgentTest.php:138-147 is flipped in the next commit.\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 3: Extend `validate-harness.sh` to scan inline-defined agents

**Files:**
- Create: `.github/scripts/inline-agent-permissions.js` (node helper)
- Modify: `.github/scripts/validate-harness.sh` (new section after the existing
  `.md`-scanning loop, around line 686)
- Modify: `tests/Shell/validate-harness_test.sh:39-44` (`setup_validator_env`
  must also copy the new node helper)
- Test: Add Tests 28, 29, 30 to `tests/Shell/validate-harness_test.sh`

**Interfaces:**
- Produces: `.github/scripts/inline-agent-permissions.js` — CLI: reads
  `opencode.jsonc`, emits TSV rows of `name \t description \t edit \t bash_deny`
  for every key under `agent.*`.
- Produces: validator section that consumes the TSV and applies the same
  `RO_KEYWORDS`-based read-only contract as the existing `.md` check.
- Consumes: existing `node` + `js-yaml` prerequisite checks (lines 24, 39).

### Step 1: Write failing shell tests

Append to `tests/Shell/validate-harness_test.sh` (before the Summary section
around line 1194), numbering as Tests 28, 29, 30:

```bash
# ── Test 28: Inline agent claiming read-only without edit: deny is caught ────

echo "── Test 28: Inline read-only contract — agent in opencode.jsonc lacks edit: deny ──"
T28=$(mktemp -d)
register_temp_dir "$T28"
git_init_test_repo "$T28"
(
	cd "$T28"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	# opencode.jsonc with an inline agent whose description claims read-only
	# but whose permission block omits edit: deny entirely.
	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "rogue-inline": {
      "description": "Audit tests and produce a report only; makes no code changes.",
      "mode": "primary",
      "permission": {
        "bash": { "*": "deny" }
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "rogue-inline"; then
		pass "Caught inline read-only agent missing edit: deny"
	elif echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "rogue-inline"; then
		fail "Detected inline read-only violation but exited 0"
	else
		fail "Did not detect inline read-only agent missing edit: deny"
	fi
)

# ── Test 29: Inline agent with edit: deny but no bash restriction is caught ──

echo "── Test 29: Inline read-only contract — agent has edit: deny but no bash restriction ──"
T29=$(mktemp -d)
register_temp_dir "$T29"
git_init_test_repo "$T29"
(
	cd "$T29"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "leaky-inline": {
      "description": "Review code; does not auto-fix anything.",
      "mode": "primary",
      "permission": {
        "edit": "deny"
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if [ "${exit_code:-0}" -ne 0 ] && echo "$output" | grep -qF "leaky-inline"; then
		pass "Caught inline read-only agent missing bash restriction"
	elif echo "$output" | grep -qF "claims read-only" && echo "$output" | grep -qF "leaky-inline"; then
		pass "Caught inline read-only agent missing bash restriction (no ERROR prefix)"
	else
		fail "Did not detect inline read-only agent missing bash restriction"
	fi
)

# ── Test 30: Properly locked-down inline agent passes ─────────────────────────

echo "── Test 30: Inline read-only contract — properly locked-down inline agent passes ──"
T30=$(mktemp -d)
register_temp_dir "$T30"
git_init_test_repo "$T30"
(
	cd "$T30"

	mkdir -p .opencode/agents .github/scripts
	setup_validator_env

	cat > opencode.jsonc <<'EOF'
{
  "agent": {
    "safe-inline": {
      "description": "Read-only evaluation; does not modify files.",
      "mode": "primary",
      "permission": {
        "edit": "deny",
        "bash": { "*": "deny", "ls*": "allow" },
        "webfetch": "deny",
        "task": "deny"
      }
    }
  }
}
EOF

	output=$(bash .github/scripts/validate-harness.sh 2>&1) || exit_code=$?

	if echo "$output" | grep -F "safe-inline" | grep -qF "claims read-only"; then
		fail "Properly locked-down inline agent was flagged as read-only violation"
	else
		pass "Properly locked-down inline agent not flagged"
	fi
)
```

Also update `setup_validator_env` at `tests/Shell/validate-harness_test.sh:39-44` to copy the new node helper:

```bash
setup_validator_env() {
	mkdir -p .github/scripts
	cp "$REAL_VALIDATOR" .github/scripts/validate-harness.sh
	cp "$REPO_ROOT/.github/scripts/frontmatter-parser.js" .github/scripts/
	cp "$REPO_ROOT/.github/scripts/inline-agent-permissions.js" .github/scripts/
	ln -s "$REPO_ROOT/node_modules" node_modules
}
```

### Step 2: Run shell tests to verify they fail

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 28, 29, 30 FAIL — the validator has no inline-agent check, so
the rogue/leaky agents are not caught, and the "safe" test passes trivially
but for the wrong reason (the `cp` of a non-existent `inline-agent-permissions.js`
fails silently or the validator never calls it). Either way, the test
assertion is the failure.

### Step 3: Create the node helper `.github/scripts/inline-agent-permissions.js`

```javascript
// $KYAULabs: inline-agent-permissions.js kyau@nova 2026/07/21 -0700 Exp $

// Walk agent.* in opencode.jsonc and emit TSV rows for each inline agent.
// Usage: node inline-agent-permissions.js <opencode.jsonc-path>
// Emits one row per agent (tab-separated):
//   name \t description \t edit \t bash_restricted
// Where:
//   edit            = the permission.edit value ('deny', 'allow', 'ask', or '')
//   bash_restricted = 'true' if bash is fully denied OR has a catch-all deny
//                     entry; 'false' otherwise; '' if bash key is absent.
// Exits 0 on success, 1 on parse error.

'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
    console.error('Usage: node inline-agent-permissions.js <opencode.jsonc-path>');
    process.exit(2);
}

let content;
try {
    content = fs.readFileSync(file, 'utf8');
} catch (e) {
    console.error(`Error reading ${file}: ${e.message}`);
    process.exit(1);
}

// Strip JSONC comments (// line comments and /* */ block comments) while
// preserving string content. Mirrors tests/Pest.php strip_jsonc_comments().
content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

let stripped = '';
let i = 0;
let inString = false;
while (i < content.length) {
    const ch = content[i];
    if (inString) {
        if (ch === '\\' && i + 1 < content.length) {
            stripped += ch + content[i + 1];
            i += 2;
            continue;
        }
        if (ch === '"') inString = false;
        stripped += ch;
        i++;
        continue;
    }
    if (ch === '"') { inString = true; stripped += ch; i++; continue; }
    if (ch === '/' && content[i + 1] === '/') {
        i += 2;
        while (i < content.length && content[i] !== '\n') i++;
        continue;
    }
    if (ch === '/' && content[i + 1] === '*') {
        i += 2;
        while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
        i += 2;
        continue;
    }
    stripped += ch;
    i++;
}

let cfg;
try {
    cfg = JSON.parse(stripped);
} catch (e) {
    console.error(`JSON parse error in ${file}: ${e.message}`);
    process.exit(1);
}

const agents = cfg.agent || {};
for (const name of Object.keys(agents)) {
    const a = agents[name] || {};
    const desc = typeof a.description === 'string' ? a.description : '';
    const perm = a.permission || {};
    const edit = typeof perm.edit === 'string' ? perm.edit : '';
    let bashRestricted = '';
    if (typeof perm.bash === 'string') {
        bashRestricted = perm.bash === 'deny' ? 'true' : 'false';
    } else if (perm.bash && typeof perm.bash === 'object') {
        bashRestricted = perm.bash['*'] === 'deny' ? 'true' : 'false';
    }
    process.stdout.write(`${name}\t${desc}\t${edit}\t${bashRestricted}\n`);
}

process.exit(0);

// vim: ft=javascript sts=4 sw=4 ts=4 noet :
```

### Step 4: Extend `validate-harness.sh`

Insert a new section immediately after the existing `.md` read-only check
(after line 686, before the `git add/git stage parity` section at line 688):

```bash
# ── Check inline read-only agent permission contract (opencode.jsonc) ─────────

echo "── Checking inline agent permission contracts (opencode.jsonc) ──"
INLINE_RO_CHECKED=0
INLINE_RO_VIOLATIONS=0

INLINE_HELPERS="${REPO_ROOT}/.github/scripts/inline-agent-permissions.js"
OPENCODE_JSONC="${REPO_ROOT}/opencode.jsonc"

if [ -f "$INLINE_HELPERS" ] && [ -f "$OPENCODE_JSONC" ]; then
	while IFS=$'\t' read -r agent_name desc edit_val bash_restricted; do
		[ -z "$agent_name" ] && continue

		# Skip if description doesn't claim read-only
		if [ -z "$desc" ] || ! echo "$desc" | grep -qiE "$RO_KEYWORDS"; then
			continue
		fi

		INLINE_RO_CHECKED=$((INLINE_RO_CHECKED + 1))

		if [ "$edit_val" != "deny" ]; then
			err "opencode.jsonc: inline agent '${agent_name}' claims read-only but edit is '${edit_val:-<unset>}' (must be deny)"
			INLINE_RO_VIOLATIONS=$((INLINE_RO_VIOLATIONS + 1))
			continue
		fi

		if [ "$bash_restricted" != "true" ]; then
			err "opencode.jsonc: inline agent '${agent_name}' claims read-only but bash is not restricted (needs '\"*\": deny' catch-all or 'bash: deny')"
			INLINE_RO_VIOLATIONS=$((INLINE_RO_VIOLATIONS + 1))
		fi
	done < <(node "$INLINE_HELPERS" "$OPENCODE_JSONC")
fi

if [ "$INLINE_RO_CHECKED" -eq 0 ]; then
	warn "No inline read-only agents found in opencode.jsonc — keyword detection may need updating"
else
	ok "${INLINE_RO_CHECKED} inline read-only agent(s) checked, ${INLINE_RO_VIOLATIONS} violation(s)"
fi
```

### Step 5: Run shell tests to verify they pass

Run: `bash tests/Shell/validate-harness_test.sh`
Expected: Tests 28, 29, 30 PASS — rogue/leaky agents caught; safe agent passes.

### Step 6: Run validator on the real repo

Run: `bash .github/scripts/validate-harness.sh`
Expected: PASS — `chat`, `judge`, `explore` (post-Task-1) are all compliant.
If `explore` hasn't moved to `.md` yet (out-of-order execution), this section
flags it — that's correct behavior, not a regression.

### Step 7: Commit

```bash
git add .github/scripts/inline-agent-permissions.js .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'fix(security): extend validate-harness to scan inline agents\n\nThe read-only contract check scanned .md files only, leaving inline-defined\nagents (chat, judge, explore) invisible to the validator — the structural\ngap that let @explore drift (issue #184). Adds inline-agent-permissions.js\nnode helper that walks agent.* in opencode.jsonc, emits TSV of (name,\ndescription, edit, bash_restricted), and a validator section that applies\nthe same RO_KEYWORDS-based contract as the .md check.\n\nAdds Tests 28-30 to validate-harness_test.sh mirroring Tests 9-11 for the\ninline path.\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 4: Flip `FromIssueAgentTest.php` to assert absence (Option A)

**Files:**
- Modify: `tests/Unit/Harness/FromIssueAgentTest.php:23-35, 138-147`

**Interfaces:**
- Produces: `FromIssueAgentTest.php` asserts `from-issue` is NOT in Plan's task
  allowlist, with a docblock explaining the Option A posture (Build-tab
  dispatch, Plan read-only per ADR-0006).
- Consumes: the `opencode.jsonc` edit from Task 2 (already committed).

### Step 1: Edit the test

In `tests/Unit/Harness/FromIssueAgentTest.php`:

**At lines 23-35** — update the class docblock. Change "is invocable from Plan
mode" to reflect Option A:

```php
/**
 * Harness tests for the @from-issue on-ramp subagent (issue #134).
 *
 * Asserts the agent definition exists with the correct frontmatter contract,
 * is registered in opencode.jsonc at the PLANNER tier (same model as @plan),
 * dispatches @explore/@architect/@tdd, is invocable from the Build tab (NOT
 * Plan — Plan mode is read-only per ADR-0006 and issue #184 removed
 * @from-issue from its allowlist), is indexed in the canonical doc tables,
 * and that its triage-state meta labels are documented. The broad compliance
 * sweep (every agent has a literal temperature, no bare model IDs) is already
 * covered by ModelConfigTest.php; these tests assert the @from-issue-specific
 * contract.
 */
```

**At lines 138-147** — replace the `'allow'` assertion:

```php
it('from-issue is NOT invocable from Plan mode (issue #184, ADR-0006)', function (): void {
    $config = load_opencode_config();

    $taskAllow = $config['agent']['plan']['permission']['task'] ?? [];

    Assert::assertArrayNotHasKey(
        'from-issue',
        $taskAllow,
        'plan agent task allowlist must NOT include from-issue — Plan is read-only per ADR-0006 (issue #184 Option A)',
    );
    Assert::assertSame('deny', $taskAllow['*'] ?? null, 'plan agent task allowlist must default to deny');
});
```

### Step 2: Run test to verify it passes (Green immediately — config edit landed in Task 2)

Run: `php vendor/bin/pest tests/Unit/Harness/FromIssueAgentTest.php`
Expected: PASS — Task 2 already removed `from-issue` from the allowlist.

### Step 3: Run full Pest harness suite

Run: `php vendor/bin/pest tests/Unit/Harness/`
Expected: All tests green (PlanModeAllowlistTest from Task 2, ExploreAgentTest
from Task 1, FromIssueAgentTest from this task).

### Step 4: Commit

```bash
git add tests/Unit/Harness/FromIssueAgentTest.php
git commit -S -m $'test(harness): flip FromIssueAgentTest to assert Plan-mode exclusion\n\nUpdate FromIssueAgentTest.php:138-147 to assert from-issue is NOT in\nPlan\'s task allowlist (issue #184 Option A — Plan is read-only per\nADR-0006). Update class docblock to reflect Build-tab dispatch. The\nconfig edit landed in the Task 2 commit; this commit flips the test\nthat previously baked in the regression.\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 5: Pest regression — inline read-only contract for `chat`, `judge`, `explore`

**Files:**
- Test: `tests/Unit/Harness/ReadOnlyInlineAgentContractTest.php` (NEW)

**Interfaces:**
- Produces: a Pest-level guard that walks every `agent.*` in `opencode.jsonc`
  whose `description` matches `RO_KEYWORDS` and asserts `edit === 'deny'` and
  bash catch-all deny. Belt-and-suspenders parallel to Task 3's shell
  validator.
- Consumes: `load_opencode_config()` from `tests/Pest.php:208`.

### Step 1: Write the test (Red against current state — `explore` is post-Task-1 compliant, but write it as a regression guard)

Create `tests/Unit/Harness/ReadOnlyInlineAgentContractTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: ReadOnlyInlineAgentContractTest.php kyau@nova 2026/07/21 -0700 Exp $

use PHPUnit\Framework\Assert;

/**
 * Pest-level regression guard for the inline read-only contract (issue #184).
 *
 * Complements validate-harness.sh's inline-agent check (Tests 28-30) with a
 * PHP-side assertion: every agent defined inline in opencode.jsonc whose
 * description contains a read-only keyword MUST carry edit: deny and a bash
 * catch-all deny. Catches drift on `php vendor/bin/pest` without requiring
 * the shell validator to run.
 *
 * ADR-0006 is the governing contract.
 */

/**
 * Read-only keyword set — mirrors validate-harness.sh RO_KEYWORDS exactly.
 * Keep in sync if the shell-side set changes.
 */
function readonly_inline_keywords(): string
{
    return 'read-only|report only|does not modify|makes no code changes|does not auto-fix|does not automatically fix';
}

/**
 * Yield [name, description, permission] for every inline agent whose
 * description matches a read-only keyword.
 *
 * @return array<int, array{0:string, 1:string, 2:array<string, mixed>}>
 */
function readonly_inline_agents(): array
{
    $cfg = load_opencode_config();
    $agents = $cfg['agent'] ?? [];
    $pattern = '/' . readonly_inline_keywords() . '/i';

    $out = [];
    foreach ($agents as $name => $def) {
        if (!is_array($def)) {
            continue;
        }
        $desc = $def['description'] ?? '';
        if (!is_string($desc) || !preg_match($pattern, $desc)) {
            continue;
        }
        /** @var array<string, mixed> $perm */
        $perm = $def['permission'] ?? [];
        $out[] = [$name, $desc, $perm];
    }

    // Vacuity guard — fail loudly if the keyword set stops matching anything.
    if ($out === []) {
        Assert::fail('No inline read-only agents found — keyword detection may need updating (mirrors validate-harness.sh)');
    }

    return $out;
}

it('every inline read-only agent denies edit', function (): void {
    foreach (readonly_inline_agents() as [$name, $_desc, $perm]) {
        Assert::assertSame(
            'deny',
            $perm['edit'] ?? null,
            "inline agent '{$name}' claims read-only but edit is '" . ($perm['edit'] ?? '<unset>') . "' (must be deny, ADR-0006)",
        );
    }
});

it('every inline read-only agent has bash catch-all deny', function (): void {
    foreach (readonly_inline_agents() as [$name, $_desc, $perm]) {
        $bash = $perm['bash'] ?? null;

        if ($bash === 'deny') {
            continue; // full deny is acceptable
        }

        Assert::assertIsArray(
            $bash,
            "inline agent '{$name}' claims read-only but bash is not an array and not 'deny'",
        );
        Assert::assertArrayHasKey(
            '*',
            $bash,
            "inline agent '{$name}' claims read-only but bash lacks catch-all '*' key",
        );
        Assert::assertSame(
            'deny',
            $bash['*'],
            "inline agent '{$name}' claims read-only but bash['*'] is '" . $bash['*'] . "' (must be deny)",
        );
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

### Step 2: Run test to verify it passes

Run: `php vendor/bin/pest tests/Unit/Harness/ReadOnlyInlineAgentContractTest.php`
Expected: PASS — `chat` and `judge` are already compliant; `explore` was made
compliant in Task 1. This test exists as a regression guard going forward.

### Step 3: Commit

```bash
git add tests/Unit/Harness/ReadOnlyInlineAgentContractTest.php
git commit -S -m $'test(harness): add Pest-level inline read-only contract guard\n\nReadOnlyInlineAgentContractTest.php walks every agent.* in opencode.jsonc\nwhose description matches a read-only keyword and asserts edit === deny\nand bash catch-all deny. Pest-side parallel to validate-harness.sh Tests\n28-30 (issue #184) — catches drift on php vendor/bin/pest without\nrequiring the shell validator.\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 6: CODING_HARNESS.md doc clarity

**Files:**
- Modify: `CODING_HARNESS.md:50-57`

### Step 1: Add one sentence clarifying `@from-issue` posture

After the existing paragraph at line 50-57, append a clarifying sentence:

> Issue on-ramp via `@from-issue #NN` happens from the Build tab, not Plan —
> `@from-issue` can branch, commit, and dispatch `@tdd`, which is incompatible
> with Plan's read-only contract (issue #184, ADR-0006 Decision #3).

The existing paragraph at lines 50-57 is already correct (lists exactly the 6
read-only agents). This addition closes the apparent gap between "Plan is
read-only" and the user-facing availability of `@from-issue`.

### Step 2: Commit

```bash
git add CODING_HARNESS.md
git commit -S -m $'docs(harness): clarify @from-issue runs from Build, not Plan\n\nAdd one sentence to CODING_HARNESS.md noting that @from-issue #NN is\ninvoked from the Build tab (not Plan) because it can branch, commit, and\ndispatch @tdd — incompatible with Plan\'s read-only contract. Closes the\napparent gap between the Plan-allowlist enumeration and the agent\'s\navailability (issue #184).\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 7: CONTEXT.md glossary + ADR-0006 amendment note

**Files:**
- Modify: `CONTEXT.md` (Domain Glossary table — add `explore agent` row)
- Modify: `adr/0006-readonly-agent-permission-contract.md` (add amendment note)

### Step 1: Add `explore agent` to CONTEXT.md glossary

In `CONTEXT.md`, after the `design agent` row at line 29, add:

```markdown
| explore agent | Subagent for focused codebase exploration on the JUDGE model tier. Read-only posture: denies edit/webfetch/task, bash catch-all deny with a scoped read-only allowlist including the Graphify navigation carve-out (`test -f*`, `graphify query/path/explain*`). Lives in `.opencode/agents/explore.md` (model/variant/temperature inline in `opencode.jsonc` per ADR-0022). See ADR-0006. |
```

(Precedent: the `chat agent` row at line 28 — same shape, same fields.)

### Step 2: Add amendment note to ADR-0006

At the end of `adr/0006-readonly-agent-permission-contract.md` (after the
Alternatives Considered section), add:

```markdown
## Amendments

- **2026-07-21 (issue #184):** `@explore` was belatedly brought under this
  contract. Originally shipped as an inline-only agent in `opencode.jsonc`
  with only `lsp: allow`, it inherited the permissive top-level defaults and
  could edit files and run shell commands despite its "focused exploration"
  mandate. The fix moves `@explore` to `.opencode/agents/explore.md` with the
  full read-only permission block. The validator was also extended to scan
  inline-defined agents so this drift class cannot recur. No change to the
  Decision text above — `@explore` always *should* have been compliant; this
  amendment records that the contract is now actually enforced.
```

(Precedent: ADR-0021 amends ADR-0029, ADR-0032 amends ADR-0029, ADR-0031
amends ADR-0010 — all use the "## Amendments" section pattern.)

### Step 3: Commit

```bash
git add CONTEXT.md adr/0006-readonly-agent-permission-contract.md
git commit -S -m $'docs(context): add explore agent to glossary; amend ADR-0006\n\nAdd explore agent to CONTEXT.md Domain Glossary (precedent: chat agent).\nAdd Amendments section to ADR-0006 recording that @explore was belatedly\nbrought under the read-only contract in issue #184 (precedent: ADR-0021,\nADR-0032 amendment pattern). No change to ADR-0006 Decision text — the\ncontract is now actually enforced.\n\nRefs: #184\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

---

## Task 8: Final verification + `/check`

**Files:** none (verification task).

### Step 1: Run full Pest suite with coverage

Run:
```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```
Expected: All tests green; coverage ≥80% on every changed PHP file
(`ExploreAgentTest.php`, `PlanModeAllowlistTest.php`,
`ReadOnlyInlineAgentContractTest.php`, `FromIssueAgentTest.php`).

### Step 2: Run shell validator + its tests

Run:
```bash
bash tests/Shell/validate-harness_test.sh
bash .github/scripts/validate-harness.sh
```
Expected: All 30 shell tests pass; validator exits 0 on the real repo.

### Step 3: Run `/check` gate

Run the `/check` command (php-cs-fixer + stylelint + eslint + pest --coverage).

### Step 4: Definition of done (issue #184 acceptance criteria)

- [ ] `@explore` cannot edit files or run non-allowlisted shell commands —
      verified by `ExploreAgentTest.php` (Task 1) and
      `ReadOnlyInlineAgentContractTest.php` (Task 5).
- [ ] Plan mode cannot reach `@docs-writer` — verified by
      `PlanModeAllowlistTest.php` (Task 2). N/A: no superseding ADR under
      Option A.
- [ ] `from-issue` posture documented consistently across config, ADR, tests,
      CODING_HARNESS.md — verified by `FromIssueAgentTest.php` (Task 4) and
      `CODING_HARNESS.md` (Task 6).
- [ ] `validate-harness.sh` checks that read-only agents carry `edit: deny` +
      bash restriction, for both `.md` files AND inline `opencode.jsonc`
      agents — verified by Tests 9-11 (.md path, existing) and Tests 28-30
      (inline path, Task 3).

### Step 5: Code review

Dispatch `@code-review` (4-axis: ocr + standards-review + spec-review + semgrep)
before push.

---

## Commit sequence summary

1. `docs(plan): add plan-mode-isolation implementation plan` (this file)
2. `fix(security): lock down @explore with read-only permission contract` (Task 1)
3. `fix(security): remove docs-writer and from-issue from Plan task allowlist` (Task 2)
4. `fix(security): extend validate-harness to scan inline agents` (Task 3)
5. `test(harness): flip FromIssueAgentTest to assert Plan-mode exclusion` (Task 4)
6. `test(harness): add Pest-level inline read-only contract guard` (Task 5)
7. `docs(harness): clarify @from-issue runs from Build, not Plan` (Task 6)
8. `docs(context): add explore agent to glossary; amend ADR-0006` (Task 7)

Each commit carries `Refs: #184` (Tasks 1, 3, 5, 6, 7) or `Fixes: #184` (Task 2
— the load-bearing fix). The final `/check` + `@code-review` happens at the
end of Task 8.

## Self-review

1. **Spec coverage:** Issue #184 has four acceptance criteria — each is mapped
   to a task and verified in Task 8's checklist.
2. **Placeholder scan:** No TBD/TODO/"similar to" — every step has actual code.
3. **Type consistency:** Test helpers (`load_opencode_config`,
   `agent_frontmatter`, `agent_contents`) are reused from `tests/Pest.php`. No
   new helpers added with conflicting signatures.
4. **Cross-task dependencies:** Task 2's `opencode.jsonc` edit removes both
   `docs-writer` AND `from-issue` in one shot (preserves the exact-match
   assertion). Task 4's test flip is a separate commit because the test file
   is independent. Task 5 depends on Task 1 (explore must be compliant).
   Task 3 is independent of Task 1 (validator would flag pre-Task-1 explore
   as a violation — which is correct behavior).
