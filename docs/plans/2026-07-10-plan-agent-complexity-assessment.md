// $KYAULabs: 2026-07-10-plan-agent-complexity-assessment.md kyau@nova 2026/07/10 -0700 Exp $

# Plan Agent Complexity Assessment Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows Red → Green → Refactor.

**Goal:** Address GitHub issue #110 by elevating the plan agent's variant from `medium` to `high` and adding prompt-based complexity assessment heuristics, since dynamic per-turn variant switching is architecturally infeasible in opencode.

**Architecture:** The plan agent's `variant` in `opencode.json` changes from `medium` to `high`. A "Complexity Assessment Protocol" section is appended to the plan agent's system prompt, instructing the agent to classify task complexity and adjust reasoning depth. Config assertion tests in a new `ConfigArchTest.php` lock in the variant and prompt content. ADR-0011 documents the decision and the infeasibility of dynamic variant switching. CODING_HARNESS.md cross-references the ADR.

**Tech Stack:** PHP 8.5+ / Pest PHP v4 / JSON config / Nygard ADR format

## Global constraints

- PHP 8.5+, Pest v4 on PHPUnit 12
- PSR-12 code style (4-space indent), enforced by php-cs-fixer
- `declare(strict_types=1)` on all PHP files
- RCS-style header + vim modeline on every new source file
- Conventional Commits format with `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>` footers
- Signed commits (`git commit -S`)
- 80% line coverage on changed files (enforced by coverage gate)

---

### Task 1: ADR-0011 + CONTEXT.md Update

**Files:**
- Create: `adr/0011-plan-agent-complexity-assessment.md`
- Modify: `CONTEXT.md` (Architectural Decisions section)

**Interfaces:**
- Produces: ADR-0011 (referenced by Tasks 2, 3, 4 and the issue comment in Task 5)

- [ ] **Step 1: Create ADR-0011**

Create `adr/0011-plan-agent-complexity-assessment.md` with the following content:

```markdown
# 0011. Plan Agent Complexity Assessment via Prompt Heuristics and Elevated Variant

Date: 2026-07-10

## Status

Accepted

## Context

GitHub issue #110 requested dynamic GLM-5.2 variant selection for the `plan`
agent — automatically switching between `high` (cost-efficient) and `max`
(deep reasoning, thinking enabled) based on real-time task complexity
assessment.

Investigation of opencode's config schema, plugin hook system, and SDK
revealed that **dynamic per-turn variant switching is not possible**:

1. **No config key:** `dynamic_variant` does not exist in opencode's config
   schema. The `variant` key on agents is static, loaded once at startup.

2. **No plugin hook for model selection:** The plugin system exposes ~23
   hooks across 10 categories. The closest, `experimental.chat.system.transform`,
   fires *after* model resolution and can only modify the system prompt
   (string array) — it cannot change the model or variant. See ADR-0008.

3. **No SDK intercept:** The SDK's `session.prompt()` accepts a per-call
   `model` override, but only from external programs — not from within
   opencode's own agent processing loop. It also doesn't accept `variant`,
   only `providerID`/`modelID`.

4. **`thinking` is provider-level, not agent-level:** The `thinking` option
   is configured under `provider.<name>.models.<id>.options`, not as an
   agent-level key. It applies to all agents using that model, not per-turn.

The model and variant are resolved statically from config/CLI/agent settings
before any plugin hook fires. True dynamic variant switching would require a
new upstream opencode feature (e.g., an `experimental.chat.model.select` hook
that fires before model resolution).

## Decision

Implement a **prompt-based complexity assessment** as a pragmatic alternative:

1. **Elevate the plan agent's variant** from `medium` to `high` — providing
   better reasoning capacity for all planning tasks without the full token
   cost of `max`.

2. **Add a Complexity Assessment Protocol** to the plan agent's system prompt
   — instructing the agent to classify task complexity and adjust reasoning
   depth accordingly:
   - **Complex** (deeper reasoning, alternatives exploration, @architect
     dispatch): architectural changes, security-sensitive work, database
     schema changes, cross-cutting refactors, complex multi-system bugs,
     performance optimizations, non-trivial new features
   - **Simple** (concise, skip alternatives): documentation, style fixes,
     minor bugs, routine test additions, dependency patches

3. **Document the infeasibility** of dynamic variant switching in
   `CODING_HARNESS.md` to prevent re-investigation.

This leverages GLM-5.2's native turn-level reasoning capability — the model
adjusts its reasoning depth based on prompt guidance, without requiring
config-level variant switching.

## Consequences

**Positive:**
- Better plan quality for complex tasks via explicit complexity classification
- `high` variant provides a cost/quality balance — more capable than `medium`,
  less expensive than `max`
- Prompt heuristics are trivially reversible and adjustable
- Config assertion tests lock in the intended variant and prompt content

**Negative:**
- All planning tasks use `high` variant — simple tasks pay slightly more token
  cost than they would with `medium`
- Prompt-based heuristics rely on the model's compliance — not a hard
  guarantee like a config-level variant switch would be
- Dynamic variant switching remains impossible without upstream opencode
  support

**Fallback:**
- If `high` variant proves too costly, revert to `medium` — the prompt
  heuristics still provide value regardless of variant
- If upstream opencode adds a model selection hook, revisit dynamic variant
  switching and supersede this ADR

## Alternatives Considered

1. **`max` variant for all planning tasks** — rejected. `max` consumes
   significantly more tokens than `high` across all tasks without
   proportionate quality gains for simple tasks. The `build`, `general`,
   and `explore` agents use `max` because they execute code; the plan agent
   only analyzes and writes plans.

2. **Plugin-based prompt injection via `experimental.chat.system.transform`**
   — rejected. Functionally equivalent to editing the agent prompt directly
   (the hook can only push strings into the system prompt). Adds plugin
   complexity without adding capability. See ADR-0008.

3. **Upstream feature request only** — rejected as sole approach. While a
   feature request against `anomalyco/opencode` for a model selection hook
   is worthwhile long-term, it doesn't address the immediate need. The
   prompt-based approach provides value now.

4. **Reject the issue entirely** — rejected. The intent (deeper reasoning for
   complex tasks) is valid and addressable through prompt engineering, even
   though the proposed mechanism (dynamic variant switching) is not.
```

- [ ] **Step 2: Update CONTEXT.md**

In `CONTEXT.md`, under the `## Architectural Decisions` section, add a new bullet after the `0010` entry:

```markdown
- **0011** — Plan agent uses `high` variant + prompt-based complexity heuristics; dynamic variant switching ruled infeasible (opencode architecture limitation)
```

- [ ] **Step 3: Commit**

```bash
git add adr/0011-plan-agent-complexity-assessment.md CONTEXT.md
git commit -S -m "docs(adr): record plan agent complexity assessment decision

Refs: #110

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Config Assertion Tests + Plan Agent Config Change (TDD)

**Files:**
- Create: `tests/Unit/Harness/ConfigArchTest.php`
- Modify: `opencode.json` (plan agent `variant` and `prompt` fields)

**Interfaces:**
- Consumes: ADR-0011 (documents the decision being tested)
- Produces: `ConfigArchTest.php` with two test functions; modified `opencode.json` with `variant: "high"` and complexity heuristics in the plan agent prompt

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Harness/ConfigArchTest.php`:

```php
<?php
declare(strict_types=1);

// $KYAULabs: ConfigArchTest.php kyau@nova 2026/07/10 -0700 Exp $

/**
 * Config assertion tests for opencode.json agent definitions.
 *
 * Unlike ArchTest.php which scans PHP source files via filesystem walkers,
 * these tests assert on the static configuration in opencode.json — ensuring
 * agent variants, prompts, and permissions remain at their intended values.
 */

/**
 * Loads and decodes opencode.json as an associative array.
 *
 * @return array<string, mixed>
 */
function harness_config_load_opencode_json(): array
{
    $configPath = dirname(__DIR__, 3) . '/opencode.json';

    if (! file_exists($configPath)) {
        throw new RuntimeException("opencode.json not found at: {$configPath}");
    }

    $contents = file_get_contents($configPath);

    if ($contents === false) {
        throw new RuntimeException("Failed to read opencode.json: {$configPath}");
    }

    /** @var array<string, mixed> $config */
    $config = json_decode($contents, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Failed to parse opencode.json: ' . json_last_error_msg());
    }

    return $config;
}

test('plan agent uses "high" variant', function (): void {
    $config = harness_config_load_opencode_json();

    expect($config)
        ->toHaveKey('agent')
        ->and($config['agent'])->toBeArray()
        ->and($config['agent'])->toHaveKey('plan');

    /** @var array<string, mixed> $planAgent */
    $planAgent = $config['agent']['plan'];

    expect($planAgent)
        ->toHaveKey('variant')
        ->and($planAgent['variant'])->toBe('high');
});

test('plan agent prompt contains complexity assessment protocol', function (): void {
    $config = harness_config_load_opencode_json();

    /** @var array<string, mixed> $planAgent */
    $planAgent = $config['agent']['plan'];

    expect($planAgent)->toHaveKey('prompt');

    /** @var string $prompt */
    $prompt = $planAgent['prompt'];

    expect($prompt)
        ->toContain('Complexity Assessment Protocol')
        ->and($prompt)->toContain('architectural changes')
        ->and($prompt)->toContain('security-sensitive')
        ->and($prompt)->toContain('database schema')
        ->and($prompt)->toContain('documentation')
        ->and($prompt)->toContain('style fixes');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest --filter ConfigArchTest`
Expected: FAIL —
- `plan agent uses "high" variant` fails because variant is currently `"medium"`
- `plan agent prompt contains complexity assessment protocol` fails because the prompt doesn't contain the heuristics yet

- [ ] **Step 3: Change plan agent variant and add complexity heuristics**

In `opencode.json`, in the `agent.plan` definition:

**Change line with `"variant": "medium"` to:**
```json
"variant": "high",
```

**Append the following to the end of the plan agent's `prompt` string** (after the final sentence `...Do not restate those rules to the user — just enforce them.`):

```
\n\n## Complexity Assessment Protocol\n\nBefore planning, classify the task:\n- **Complex** — engage deeper reasoning, explore alternatives, dispatch @architect for validation: architectural changes, security-sensitive work, database schema changes, cross-cutting refactors, complex multi-system bugs, performance optimizations, non-trivial new features\n- **Simple** — be concise, skip alternative exploration: documentation, style fixes, minor bugs, routine test additions, dependency patches
```

The prompt string in `opencode.json` should end with:

```json
...Do not restate those rules to the user — just enforce them.\n\n## Complexity Assessment Protocol\n\nBefore planning, classify the task:\n- **Complex** — engage deeper reasoning, explore alternatives, dispatch @architect for validation: architectural changes, security-sensitive work, database schema changes, cross-cutting refactors, complex multi-system bugs, performance optimizations, non-trivial new features\n- **Simple** — be concise, skip alternative exploration: documentation, style fixes, minor bugs, routine test additions, dependency patches"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest --filter ConfigArchTest`
Expected: PASS — both tests green

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: All tests pass, coverage ≥80% on changed files

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/Harness/ConfigArchTest.php opencode.json
git commit -S -m "feat(harness): elevate plan agent variant to high with complexity heuristics

Refs: #110

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: CODING_HARNESS.md Documentation

**Files:**
- Modify: `CODING_HARNESS.md` (Primary agents → Plan section)

**Interfaces:**
- Consumes: ADR-0011, ADR-0005, ADR-0008

- [ ] **Step 1: Add complexity assessment documentation**

In `CODING_HARNESS.md`, after the existing paragraph describing the Plan agent's delegation-only restrictions, add a new subsection:

```markdown
### Plan Agent Complexity Assessment

The plan agent uses the `high` variant (not `max`) as a cost/quality balance —
more capable than `medium` for reasoning, but without the full token cost of
`max`. A **Complexity Assessment Protocol** in the agent's system prompt
instructs it to classify task complexity and adjust reasoning depth:

- **Complex tasks** (architecture, security, DB schema, cross-cutting refactors,
  complex bugs): deeper reasoning, alternatives exploration, `@architect`
  dispatch for validation.
- **Simple tasks** (docs, style fixes, minor bugs, routine tests): concise,
  skip alternative exploration.

Dynamic per-turn variant switching (e.g., automatically escalating to `max`
for complex tasks) is **not feasible** with opencode's current architecture —
the model and variant are resolved statically at startup, before any plugin
hook fires. See ADR-0011 for the full investigation. The closest plugin
mechanism, `experimental.chat.system.transform` (ADR-0008), can only modify
the system prompt, not the model variant.
```

- [ ] **Step 2: Commit**

```bash
git add CODING_HARNESS.md
git commit -S -m "docs(harness): document plan agent complexity assessment

Refs: #110

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: Refresh Vendored OpenCode Docs

**Files:**
- Potentially modified: `.opencode/skills/opencode-docs/docs/*.mdx`

**Interfaces:**
- None — standalone chore

- [ ] **Step 1: Run fetch.sh**

Run: `bash .opencode/skills/opencode-docs/fetch.sh`
Expected: Output showing doc files fetched from `anomalyco/opencode` dev branch

- [ ] **Step 2: Check for changes**

Run: `git diff --stat .opencode/skills/opencode-docs/docs/`
Expected: Either no changes (docs already current from today's refresh) or a list of changed `.mdx` files

- [ ] **Step 3: Commit if there are changes (skip if no diff)**

```bash
git add .opencode/skills/opencode-docs/docs/
git commit -S -m "chore(opencode): refresh vendored opencode docs

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

If no changes, skip this step.

---

### Task 5: Comment on Issue #110

**Files:**
- None (external GitHub action)

**Interfaces:**
- None

- [ ] **Step 1: Post issue comment**

Run:

```bash
gh issue comment 110 --repo kyaulabs/template --body "$(cat <<'EOF'
## Resolution

After thorough investigation of opencode's config schema, plugin hook system, and SDK, the core proposal — a `dynamic_variant` config block with automatic per-turn variant switching — is **not feasible** with opencode's current architecture:

1. **No config key:** `dynamic_variant` does not exist in opencode's config schema. The `variant` key on agents is static, loaded once at startup.
2. **No plugin hook for model selection:** The closest hook, `experimental.chat.system.transform`, fires *after* model resolution and can only modify the system prompt — it cannot change the model or variant.
3. **No SDK intercept:** The SDK's `session.prompt()` accepts per-call model overrides, but only from external programs — not from within opencode's agent processing loop.

### What was implemented instead

A **prompt-based complexity assessment** as a pragmatic alternative (ADR-0011):

- **Plan agent variant elevated** from `medium` to `high` — better reasoning capacity without the full token cost of `max`.
- **Complexity Assessment Protocol** added to the plan agent's system prompt — instructs the agent to classify task complexity and adjust reasoning depth (complex tasks get deeper reasoning + `@architect` dispatch; simple tasks are concise).
- **Config assertion tests** lock in the variant and prompt content.
- **CODING_HARNESS.md** documents the behavior and the infeasibility of dynamic variant switching.

This leverages GLM-5.2's native turn-level reasoning capability — the model adjusts reasoning depth based on prompt guidance, without requiring config-level variant switching.

True dynamic variant switching would require a new upstream opencode feature (e.g., an `experimental.chat.model.select` hook that fires before model resolution).
EOF
)"
```

Expected: Comment posted successfully to issue #110

- [ ] **Step 2: Close the issue (if desired)**

Run: `gh issue close 110 --repo kyaulabs/template --reason completed`
Expected: Issue #110 closed

---

## Self-Review

**Spec coverage (issue #110 acceptance criteria):**

| # | Criterion | Addressed? | How |
|---|---|---|---|
| 1 | `dynamic_variant` block in opencode.json | ❌ Not feasible | ADR-0011 documents infeasibility; `dynamic_variant` is not a valid opencode config key |
| 2 | Plan agent defaults to `high` variant | ✅ | Task 2 changes variant from `medium` to `high` |
| 3 | Switch to `max` for complex tasks | ❌ Not feasible | Prompt heuristics instruct deeper reasoning instead; dynamic switching is architecturally impossible |
| 4 | `thinking` enabled when `max` activated | ❌ Not feasible | `thinking` is a provider-level option, not agent-level; no dynamic activation mechanism |
| 5 | System prompt includes complexity heuristics | ✅ | Task 2 adds Complexity Assessment Protocol to prompt |
| 6 | CODING_HARNESS.md updated | ✅ | Task 3 documents the behavior |
| 7 | Tests added and pass | ✅ | Task 2 adds ConfigArchTest.php with 2 tests |
| 8 | Token usage comparison | ⚠️ Partial | `high` is cheaper than `max`; no formal benchmark included |
| 9 | No regression | ✅ | Task 2 Step 5 runs full test suite |
| 10 | Fallback to `high` on failure | ✅ | `high` IS the default; ADR-0011 documents fallback to `medium` if too costly |

**Placeholder scan:** No TBD, TODO, or placeholder content. All code blocks contain complete, executable content.

**Type consistency:** `harness_config_load_opencode_json()` is defined and used consistently in both test functions. The prompt keywords in the test (`architectural changes`, `security-sensitive`, `database schema`, `documentation`, `style fixes`) match the prompt text added in Step 3.
<!-- vim: ft=markdown tw=80 : -->
