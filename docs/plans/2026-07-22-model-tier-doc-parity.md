# Model / Tier Documentation Parity Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Eliminate model/tier/LSP documentation drift across README,
CODING_HARNESS, and AGENTS.md; implement ADR-0031's deferred variant bump
(planner/design `high` → `max`); grant `@explore` the LSP permission its own
prompt already expects; add doc↔config parity guard tests so the drift cannot
silently recur.

**Architecture:** The shipped config (`setup.json`, `opencode.jsonc`) is the
source of truth for tier models/variants and agent tier membership; ADR-0031
(Accepted) is the source of truth for the *intended* variant values. The docs
currently predate ADR-0031's model swap and variant bump. We honor ADR-0031
(bring config into compliance at `max`, not amend the ADR), grant explore
`lsp: allow`, then regenerate the doc tables to match. New Pest parity tests
anchor the docs to the config so future drift fails CI.

**Tech Stack:** PHP 8.5+, Pest v4 (PHPUnit 12), JSON/JSONC, Markdown. No new
dependencies.

**Issue:** #186 — "Model / Tier Documentation Stale" (Type: Documentation,
Progress: Under Construction).

## Grilling decisions (locked)

1. **Type:** Documentation, **Progress:** Under Construction.
2. **ADR-0031 variant direction:** Honor the ADR → planner/design `high` →
   `max` (behavior delta; full enhancement pipeline, not a chore fast-path).
3. **explore LSP:** Add `lsp: allow` to `explore.md` → final LSP-enabled
   count is **eight** (`build, design, explore, general, chat, tdd, debug,
   docs-writer`).
4. **Delivery scope:** One branch, atomic green commits (each commit pairs a
   test with its implementation so the suite stays green per commit).

## Global constraints

- **Source of truth for tier models/variants:** `.opencode/setup.json`
  (`models` + `variants` sections) and `opencode.jsonc` (`agent.*` model/variant
  bindings). ADR-0031 §2 mandates planner/design variant = `max`.
- **No ADR edit required:** ADR-0031 already says `max`; we bring config +
  test into compliance, we do not amend the ADR.
- **Atomic commits:** each task's commit contains its failing-test-then-fix
  together (Red written, then Green achieved) so every commit leaves `pest`
  green. No squash.
- **Signed commits** (`git commit -S`) with footers `Authored-by: glm-5.2`,
  `Tested-by: deepseek-v4-pro`, `Signed-off-by:` (resolved via
  `bash .github/scripts/resolve-identity.sh`). Use `$'...\n...'` ANSI-C
  quoting (commit-msg hook rejects literal `\n`).
- **Coverage:** changed files must stay ≥ 80% line coverage (`/check` enforces
  it). New tests are PHP; docs are not coverage-counted.
- **Do not edit** `cdn/css/*` or `cdn/javascript/*` (generated).

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `.opencode/setup.json` | Shipped tier model + variant defaults | Modify: planner/design variant `high` → `max` |
| `.opencode/agents/explore.md` | `@explore` subagent frontmatter + prompt | Modify: add `lsp: allow` to `permission:` |
| `tests/Unit/Harness/ModelConfigTest.php` | Config↔invariant guard tests | Modify: flip planner/design variant assertion to `max`; add parity tests |
| `tests/Unit/Harness/ExploreAgentTest.php` | `@explore` permission-contract tests | Modify: add `lsp: allow` assertion |
| `README.md` | Public tier table + install verify comment | Modify: models, agent-per-tier lists, verify comment |
| `CODING_HARNESS.md` | Contributor tier table (model + variant + agents) | Modify: models, variants, agent-per-tier lists |
| `AGENTS.md` | LSP section (count + membership + deny list) | Modify: count → eight, membership, stale deny list |
| `.opencode/docs/lsp.md` | LSP permissions reference (verify-only) | Verify parity; fix if drifted |

**Helpers available (no re-definition needed):**
- `load_opencode_config(): array` — `tests/Pest.php:208`
- `agent_frontmatter(string $name): string` — `tests/Pest.php` (shared)
- `agent_contents(string $name): string` — `tests/Pest.php` (shared)
- `setup_json(): array` — defined in `ModelConfigTest.php:23` (local; keep
  parity tests that need it inside `ModelConfigTest.php`)

---

### Task 1: Bump planner/design variant to `max` (ADR-0031 §2)

**Files:**
- Modify: `.opencode/setup.json:22-23`
- Modify: `tests/Unit/Harness/ModelConfigTest.php:262-263`

**Interfaces:**
- Consumes: ADR-0031 §2 ("variants.planner and variants.design are bumped from
  high to max").
- Produces: `setup.json` planner/design = `max`; the existing
  `it('has correct default variant values')` test asserts `max`.

- [ ] **Step 1: Flip the guard test to the intended value (Red)**

In `tests/Unit/Harness/ModelConfigTest.php`, the test at line 259 currently
asserts `high`. Change lines 262-263:

```php
// BEFORE
    expect($setup['variants']['planner'])->toBe('high');
    expect($setup['variants']['design'])->toBe('high');
// AFTER
    expect($setup['variants']['planner'])->toBe('max');
    expect($setup['variants']['design'])->toBe('max');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest --filter 'has correct default variant values'`
Expected: FAIL — `Failed asserting that two strings are identical. Expected 'max', got 'high'`.

- [ ] **Step 3: Bump the shipped defaults (Green)**

In `.opencode/setup.json`, lines 22-23 of the `variants` object:

```json
// BEFORE
    "planner": "high",
    "design": "high",
// AFTER
    "planner": "max",
    "design": "max",
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php vendor/bin/pest --filter 'has correct default variant values'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .opencode/setup.json tests/Unit/Harness/ModelConfigTest.php
git commit -S -m $'chore(config): bump planner/design variant to max per ADR-0031\n\nADR-0031 §2 mandates variants.planner/design = max (abundant GLM quota;\nplanning/design quality feeds downstream coding). The bump was never\napplied to setup.json; the guard test enforced the stale high value.\n\nRefs: #186\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

> `Refs: #186` (non-closing — this is one of several commits). Confirm
> `Signed-off-by` via `bash .github/scripts/resolve-identity.sh` before
> committing; replace the identity line with its output if it differs.

---

### Task 2: Grant `@explore` the `lsp: allow` permission

**Files:**
- Modify: `.opencode/agents/explore.md:25` (add key under `permission:`)
- Modify: `tests/Unit/Harness/ExploreAgentTest.php` (add a test)

**Interfaces:**
- Consumes: explore's prompt body (`explore.md:39`) already says "fall back to
  your normal glob/grep/read + LSP workflow"; AGENTS.md + CONTEXT.md describe
  explore navigating code semantically. The missing permission is the drift.
- Produces: explore joins the eight LSP-enabled agents. No existing
  ExploreAgentTest assertion forbids lsp (verified — they assert specific
  denies: edit/webfetch/task).

- [ ] **Step 1: Write the failing test (Red)**

Append to `tests/Unit/Harness/ExploreAgentTest.php` (before the vim modeline):

```php
it('explore agent allows LSP for semantic code navigation', function (): void {
    $fm = agent_frontmatter('explore');

    Assert::assertStringContainsString(
        'lsp: allow',
        $fm,
        'explore must allow LSP — its prompt expects an LSP workflow and it '
        . 'navigates code semantically (read-only contract per ADR-0006 preserved)',
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest --filter 'explore agent allows LSP'`
Expected: FAIL — frontmatter does not contain `lsp: allow`.

- [ ] **Step 3: Add the permission (Green)**

In `.opencode/agents/explore.md`, under the `permission:` block, add `lsp:
allow` immediately after `task: deny` (keep 2-space indentation matching the
sibling keys):

```yaml
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
  lsp: allow
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php vendor/bin/pest --filter ExploreAgentTest`
Expected: PASS (all explore tests).

- [ ] **Step 5: Commit**

```bash
git add .opencode/agents/explore.md tests/Unit/Harness/ExploreAgentTest.php
git commit -S -m $'fix(explore): grant lsp allow for semantic code navigation\n\nexplore\'s prompt already directs an "LSP workflow" and AGENTS.md/CONTEXT.md\ndescribe it navigating code semantically, yet its frontmatter omitted\nlsp: allow so it inherited the top-level deny. LSP is read-only\n(go-to-definition, find-references), consistent with ADR-0006.\n\nRefs: #186\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Fix AGENTS.md LSP section (count eight + correct membership)

**Files:**
- Modify: `AGENTS.md:232-240` (LSP opt-in paragraph) and `AGENTS.md:252`
- Modify: `tests/Unit/Harness/ModelConfigTest.php` (add parity test)

**Interfaces:**
- Consumes: the canonical LSP-enabled set computed from `opencode.jsonc`
  (`agent.*.permission.lsp == allow`) + `.opencode/agents/*.md` frontmatter
  (`lsp: allow`). After Task 2 this set is exactly eight.
- Produces: a reusable `lsp_enabled_agents()` helper local to
  `ModelConfigTest.php` that future tests can call.

- [ ] **Step 1: Add the helper + failing parity test (Red)**

Add this helper near the top of `tests/Unit/Harness/ModelConfigTest.php`
(after the existing `setup_json()` function, ~line 27):

```php
/**
 * Compute the canonical set of agents granted `lsp: allow`, combining inline
 * primary agents (opencode.jsonc) and subagent frontmatter (.opencode/agents).
 *
 * @return list<string>
 */
function lsp_enabled_agents(): array
{
    $agents = [];

    foreach (load_opencode_config()['agent'] as $name => $def) {
        if (($def['permission']['lsp'] ?? null) === 'allow') {
            $agents[] = $name;
        }
    }

    foreach (glob(__DIR__ . '/../../../.opencode/agents/*.md') as $file) {
        $frontmatter = file_get_contents($file);
        if (preg_match('/^\s*lsp:\s*allow/m', $frontmatter)) {
            $agents[] = basename($file, '.md');
        }
    }

    return array_values(array_unique($agents));
}
```

Then add this test (anywhere in the file):

```php
it('AGENTS.md LSP opt-in count and membership match agents granted lsp allow', function (): void {
    $enabled = lsp_enabled_agents();
    sort($enabled);

    // After granting explore lsp:allow, eight agents carry the tool.
    expect($enabled)->toHaveCount(8);
    expect($enabled)->toBe([
        'build', 'chat', 'debug', 'design', 'docs-writer',
        'explore', 'general', 'tdd',
    ]);

    $agentsMd = file_get_contents(__DIR__ . '/../../../AGENTS.md');

    // Stale counts must be gone.
    Assert::assertStringNotContainsString('six agents', $agentsMd);
    Assert::assertStringNotContainsString('Seven agents', $agentsMd);
    // Current count is stated.
    Assert::assertStringContainsString('Eight agents', $agentsMd);
    // Every enabled agent is named in the LSP sentence.
    foreach (['build', 'design', 'explore', 'general', 'chat', '@tdd', '@debug', '@docs-writer'] as $name) {
        Assert::assertStringContainsString(
            $name,
            $agentsMd,
            "AGENTS.md LSP section must name '{$name}' among the opt-in agents",
        );
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php vendor/bin/pest --filter 'AGENTS.md LSP opt-in count'`
Expected: FAIL — AGENTS.md still says "Seven agents", omits `design`, includes
`explore` (which now correctly has lsp, but the stale deny-list enumeration is
also wrong).

- [ ] **Step 3: Fix AGENTS.md (Green)**

In `AGENTS.md`, replace the LSP opt-in paragraph (lines ~232-240). The eight
agents are: `build, design, explore, general, chat, @tdd, @debug, @docs-writer`.

```markdown
**Experimental LSP tool:** The `lsp` tool (go-to-definition, find-references,
hover, call-hierarchy) is gated by a top-level `permission.lsp: "deny"`
default in `opencode.jsonc`. Eight agents explicitly opt in with `lsp: "allow"`:
`build`, `design`, `explore`, `general`, `chat`, `@tdd`, `@debug`, and
`@docs-writer` — agents that write PHP or navigate code semantically
(Intelephense premium fills the gap left by the absence of `psalm`/`phpstan`
in `composer.json`). All other agents inherit the `deny` default.
```

Also fix the experimental-features table row (line ~252):

```markdown
| `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` | Enables the Intelephense `lsp` tool for eight agents (see above) | Auto-sourced (was manual-export; consolidated per ADR-0024) |
```

> Note: the old "All other agents (…)" enumerated deny-list was stale and
> incomplete. Replace it with the non-enumerated form above — the
> `lsp_enabled_agents()` parity test is now the authoritative membership
> guard, so a hand-maintained deny-list only rots.

- [ ] **Step 4: Run the test to verify it passes**

Run: `php vendor/bin/pest --filter 'AGENTS.md LSP opt-in count'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md tests/Unit/Harness/ModelConfigTest.php
git commit -S -m $'docs(agents): fix LSP opt-in count to eight and correct membership\n\nAGENTS.md said "seven" in one paragraph and "six" in another, listed\nexplore (now correctly lsp-enabled) but omitted design. Replace the\nstale enumerated deny-list with a non-enumerated form; a new\nlsp_enabled_agents() parity test is now the authoritative guard.\n\nRefs: #186\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 4: Fix README + CODING_HARNESS tier tables (models, variants, agents)

**Files:**
- Modify: `README.md:311-317` (tier table), `README.md:344` (verify comment)
- Modify: `CODING_HARNESS.md:89-95` (tier table with variant column)
- Modify: `tests/Unit/Harness/ModelConfigTest.php` (add parity test)

**Interfaces:**
- Consumes: `setup.json` models/variants + `opencode.jsonc` agent tier
  membership (per ADR-0031 §1 + §3 reassignments). The correct per-tier agent
  lists are:
  - Primary: `build, tdd, debug, resolve-merge-conflicts, general`
  - Planner: `plan, from-issue, architect, consult`
  - Design: `design`
  - Judge: `code-review, standards-review, spec-review, test-audit, judge, explore`
  - Utility: `compaction, title, summary, docs-writer, semgrep, chat`

- [ ] **Step 1: Add the failing parity test (Red)**

In `tests/Unit/Harness/ModelConfigTest.php`:

```php
it('README and CODING_HARNESS tier tables match setup.json defaults', function (): void {
    $setup = setup_json();

    foreach (['README.md', 'CODING_HARNESS.md'] as $doc) {
        $text = file_get_contents(__DIR__ . '/../../../' . $doc);

        // Each tier's shipped default model must appear in the table.
        foreach (['primary', 'planner', 'design', 'judge', 'utility'] as $tier) {
            Assert::assertStringContainsString(
                $setup['models'][$tier],
                $text,
                "{$doc} must list the setup.json default model for the '{$tier}' tier",
            );
        }

        // The stale OpenRouter provider prefix must be gone (drifted form was
        // openrouter/z-ai/glm-5.2; shipped default is zai-coding-plan/glm-5.2).
        Assert::assertStringNotContainsString(
            'openrouter/z-ai/glm-5.2',
            $text,
            "{$doc} must not use the stale openrouter/z-ai provider prefix",
        );
    }
});

it('README install verify comment matches the shipped Primary default', function (): void {
    $setup = setup_json();
    $readme = file_get_contents(__DIR__ . '/../../../README.md');

    Assert::assertMatchesRegularExpression(
        '/verify:\s*' . preg_quote($setup['models']['primary'], '/') . '/',
        $readme,
        'README verify comment must echo the actual Primary default',
    );
});

it('CODING_HARNESS variant column reflects the max bump for planner and design', function (): void {
    $harness = file_get_contents(__DIR__ . '/../../../CODING_HARNESS.md');

    // Planner and Design are now `max` (ADR-0031 §2); the old `high` rows for
    // these tiers must not remain. (Judge/Utility legitimately stay medium.)
    Assert::assertStringNotContainsString('`high`', $harness);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `php vendor/bin/pest --filter 'tier tables match setup.json|verify comment|variant column'`
Expected: FAIL — docs still show the swapped/old models, the `openrouter/z-ai`
prefix, the wrong verify value, and `high` variants.

- [ ] **Step 3: Fix README.md (Green)**

Replace the tier table (lines 311-317):

```markdown
| Tier | Env Var | Default | Agents |
| --- | --- | --- | --- |
| Primary | `OPENCODE_MODEL_PRIMARY` | `zai-coding-plan/glm-5.2` | build, tdd, debug, resolve-merge-conflicts, general |
| Planner | `OPENCODE_MODEL_PLANNER` | `zai-coding-plan/glm-5.2` | plan, from-issue, architect, consult |
| Design | `OPENCODE_MODEL_DESIGN` | `zai-coding-plan/glm-5.2` | design |
| Judge | `OPENCODE_MODEL_JUDGE` | `deepseek/deepseek-v4-pro` | code-review, standards-review, spec-review, test-audit, judge, explore |
| Utility | `OPENCODE_MODEL_UTILITY` | `deepseek/deepseek-v4-flash` | compaction, title, summary, docs-writer, semgrep, chat |
```

Fix the verify comment (line 344):

```bash
echo $OPENCODE_MODEL_PRIMARY      # verify: zai-coding-plan/glm-5.2
```

- [ ] **Step 4: Fix CODING_HARNESS.md (Green)**

Replace the tier table (lines 89-95) — note the variant column now shows `max`
for planner/design:

```markdown
| Tier | Env Var | Variant Env Var | Default Model | Default Variant | Agents |
| --- | --- | --- | --- | --- | --- |
| Primary | `OPENCODE_MODEL_PRIMARY` | `OPENCODE_VARIANT_PRIMARY` | `zai-coding-plan/glm-5.2` | `max` | build, tdd, debug, resolve-merge-conflicts, general |
| Planner | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `zai-coding-plan/glm-5.2` | `max` | plan, from-issue, architect, consult |
| Design | `OPENCODE_MODEL_DESIGN` | `OPENCODE_VARIANT_DESIGN` | `zai-coding-plan/glm-5.2` | `max` | design |
| Judge | `OPENCODE_MODEL_JUDGE` | `OPENCODE_VARIANT_JUDGE` | `deepseek/deepseek-v4-pro` | `medium` | code-review, standards-review, spec-review, test-audit, judge, explore |
| Utility | `OPENCODE_MODEL_UTILITY` | `OPENCODE_VARIANT_UTILITY` | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep, chat |
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php vendor/bin/pest --filter 'tier tables match setup.json|verify comment|variant column'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md CODING_HARNESS.md tests/Unit/Harness/ModelConfigTest.php
git commit -S -m $'docs: align tier tables with setup.json and ADR-0031\n\nREADME/CODING_HARNESS showed Primary/Judge models swapped, used the stale\nopenrouter/z-ai provider prefix, and listed pre-ADR-0031 agent assignments.\nRegenerated both tables from setup.json models/variants and opencode.jsonc\ntier membership; fixed the README install verify comment. Added parity\ntests anchoring the docs to setup.json.\n\nRefs: #186\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 5: Final consistency sweep + full suite green

**Files:**
- Verify (fix if drifted): `.opencode/docs/lsp.md`
- Run: full Pest suite + `/check`

- [ ] **Step 1: Verify `.opencode/docs/lsp.md` parity**

Read `.opencode/docs/lsp.md`. If it states an LSP-enabled agent count or a
membership table, ensure it lists the same eight agents
(`build, design, explore, general, chat, tdd, debug, docs-writer`) and no stale
count. `ChatAgentTest:110-113` already indexes chat there; ensure no other
agent is missing. If it drifted, fix it in this commit; if already correct,
skip the file.

- [ ] **Step 2: Run the full suite**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: PASS, all green, changed files ≥ 80% line coverage.

- [ ] **Step 3: Run the pre-push gate**

Run: `/check` (php-cs-fixer + stylelint + eslint + pest --coverage)
Expected: PASS.

- [ ] **Step 4: Final commit (only if Step 1 changed lsp.md)**

```bash
git add .opencode/docs/lsp.md
git commit -S -m $'docs(lsp): align agent table with the eight lsp-enabled agents\n\nRefs: #186\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

If `.opencode/docs/lsp.md` needed no change, this task produces no commit —
the sweep is verification-only.

---

## Acceptance-criteria coverage

| Issue acceptance criterion | Task(s) |
| --- | --- |
| README/CODING_HARNESS tier tables match setup.json/opencode.jsonc | Task 4 (+ parity test) |
| AGENTS.md LSP count and list are internally consistent and match config | Task 3 (+ `lsp_enabled_agents()` parity test) |
| README install verify expected value matches the shipped default | Task 4 (+ parity test) |
| setup.json, ModelConfigTest, and ADR-0031 agree on the planner/design variant | Task 1 (setup.json + test → `max`; ADR-0031 already says `max`) |

## Self-review notes

- **Spec coverage:** all four acceptance criteria map to tasks. ✓
- **No placeholders:** every step shows exact code / target lines. ✓
- **Type consistency:** `lsp_enabled_agents()` returns `list<string>`; the test
  sorts before comparing to a sorted expectation. The variant test flips the
  exact two lines that existed. ✓
- **Each commit is green:** Task 1 pairs the test flip with the config bump;
  Task 2 pairs the explore test with the permission; Tasks 3-4 pair parity
  tests with doc fixes. No commit leaves the suite red. ✓
- **Per-commit TDD:** Red (failing test) is written and confirmed failing
  before the Green change, within each task. ✓
