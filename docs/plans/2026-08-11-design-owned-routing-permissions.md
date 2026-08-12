# Design-Owned Routing Permissions Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix issue #300 by keeping classifier-driven brainstorming and design-stage prototyping in the Design tab and failing harness validation when an autonomous documented handoff resolves to a denied permission.

**Architecture:** Record the ownership change in ADR-0054, partially superseding ADR-0030 while extending ADR-0050 and ADR-0051 without editing those accepted records. Correct the four reported routing surfaces plus `/improve-architecture`, enforce Design-only access to `brainstorming` and `prototype`, and add structured handoff declarations checked against effective OpenCode permissions using global-to-agent merge order and last-match-wins matching.

**Tech Stack:** OpenCode Markdown agents/commands/skills, JSONC permissions, Node.js ES6, Bash 4+, Pest 4/PHPUnit 12.

## Global constraints

- Issue #300 is classified `Bug`; use the `fix` branch/commit type and close it with `Fixes: #300` only in the final implementation commit.
- Architect verdict is `GO-WITH-CONDITIONS`; `ADR-required: 0054`.
- Plan approval accepts the complete ADR-0054 text in Task 1. Create and accept ADR-0054 before changing routing or permission behavior.
- Do not edit accepted ADR-0030, ADR-0050, or ADR-0051. ADR-0054 records the partial supersession and extensions.
- Design is the sole owner of classifier-driven brainstorming and design-stage prototyping. Preserve the existing `brainstorming` and `prototype` skill bodies and `.github/scripts/classify-greenfield.sh` unchanged.
- Do not widen Router, Chat, Plan, Consult, From-Issue, or `/improve-architecture` permissions. Human tab recommendations replace impossible autonomous actions.
- `/router` performs no shell operation in any invoking tab. It recommends a compatible entry point and stops.
- Effective handoff `deny` is a validation error, `ask` is a visible warning with exit 0, and `allow` passes. Malformed declarations, unknown actors/targets, and indeterminate permission composition fail closed.
- Permission matching follows vendored `permissions.mdx`: global rules first, agent Markdown then inline agent overrides, and the last matching granular rule wins. Most unspecified permissions default to `allow`.
- Machine-readable handoff declarations distinguish autonomous `skill`, `task`, `bash`, `edit`, and `external_directory` actions from human `recommend-primary` and `recommend-subagent` handoffs.
- No new dependencies, external APIs, generated assets, or application code.
- Load `rcs-header` before creating or modifying `.php`, `.js`, or `.sh` files; preserve RCS headers and vim modelines.
- OpenCode configuration-time changes are not hot-reloaded. Restart OpenCode after implementation before manually exercising the routes.

---

### Task 1: Record the Design-owned handoff decision

**Files:**
- Create: `adr/0054-design-owned-routing-and-handoff-permissions.md`
- Create: `tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php`
- Modify: `CONTEXT.md:31-49,174-232`

**Interfaces:**
- Consumes: ADR-0030's Design cycle and hybrid split, ADR-0050's scope gate, ADR-0051's fail-closed effective-permission checker, and `CONTEXT.md` glossary conventions.
- Produces: accepted ADR-0054, the canonical `design agent` ownership definition, the `documented handoff` term, and the architecture gate `ADR-required: 0054` used by later tasks.

- [x] **Step 1: Write the failing architecture contract test**

Create `tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: DesignOwnedRoutingArchitectureTest.php kyau@nova 2026/08/11 -0700 Exp $

use PHPUnit\Framework\Assert;

it('records Design-owned routing and fail-closed handoff permissions in ADR-0054', function (): void {
    $path = __DIR__ . '/../../../adr/0054-design-owned-routing-and-handoff-permissions.md';
    Assert::assertFileExists($path);
    $adr = (string) file_get_contents($path);

    Assert::assertMatchesRegularExpression('/## Status\s+Accepted/s', $adr);
    Assert::assertStringContainsString('partially supersedes ADR-0030', $adr);
    Assert::assertStringContainsString('extends ADR-0050', $adr);
    Assert::assertStringContainsString('generalizes ADR-0051', $adr);
    Assert::assertStringContainsString('deny', $adr);
    Assert::assertStringContainsString('ask', $adr);
    Assert::assertStringContainsString('Design', $adr);
});

it('publishes the Design ownership and documented-handoff vocabulary', function (): void {
    $context = (string) file_get_contents(__DIR__ . '/../../../CONTEXT.md');

    Assert::assertMatchesRegularExpression('/\| design agent \|.*sole owner.*classifier-driven.*prototyp/is', $context);
    Assert::assertMatchesRegularExpression('/\| documented handoff \|.*permission/is', $context);
    Assert::assertStringContainsString('adr/0054-design-owned-routing-and-handoff-permissions.md', $context);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run the focused test and verify Red**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php
```

Expected: FAIL because ADR-0054 and its `CONTEXT.md` entries do not exist.

- [x] **Step 3: Write and accept ADR-0054**

Create `adr/0054-design-owned-routing-and-handoff-permissions.md` with this complete content:

```markdown
# 0054. Design-Owned Routing and Handoff Permission Compatibility

Date: 2026-08-11

## Status

Accepted

This decision partially supersedes ADR-0030's hybrid skill split for
`@from-issue` and `@consult`, extends ADR-0050's Design-owned scope gate, and
generalizes ADR-0051's fail-closed effective-permission validation principle.

## Context

ADR-0030 made the Design primary agent the visible owner of brainstorming but
preserved direct `brainstorming` skill consumption by `@from-issue` and
`@consult`. ADR-0050 later made `classify-greenfield.sh` the mandatory first
scope gate for brainstorming. Those decisions combined a shell-requiring
workflow with agents and commands whose effective permissions intentionally
deny that shell operation.

The same ownership drift appears elsewhere. `/router` inherits the invoking
tab's permissions but runs the classifier; `@from-issue` advertises the
`prototype` skill while denying its edit and execution paths;
`/improve-architecture` transfers into classifier-driven brainstorming; and
`to-spec` claims `@consult` as a writer even though Consult denies
`docs/specs/`. These routes fail at their first restricted action without
violating any permission shape, because `validate-harness.sh` validates
permission syntax and containment but not the compatibility of documented
handoffs.

ADR-0051 established that permission-bearing routes must be checked against
their effective, runtime-meaningful rules and fail closed when the documented
route cannot execute. The principle is general even though ADR-0051's concrete
checker is frontend-specific. OpenCode's primary agents also cannot be
dispatched as subagents, so a transition to Design is necessarily an explicit
human tab handoff.

## Decision

We make the Design primary agent the sole owner of classifier-driven
brainstorming and design-stage prototyping. The global skill permission map
denies `brainstorming` and `prototype`; Design re-allows both. We do not widen
the permissions of Router, Chat, Plan, Consult, From-Issue, or architecture
review commands.

Design runs the ADR-0050 scope classifier, grills design decisions, performs
technical-viability prototypes when needed, and captures prototype findings
before final spec approval and commit. Its existing cycle still ends at the
committed spec and feature branch. Design explicitly accepts escalations from
Router, `@from-issue`, `to-spec`, and `/improve-architecture`; an escalated
existing issue is not redirected back to `@from-issue` until the Design-owned
question is settled.

Other entry points retain work that fits their permission boundary.
`@from-issue` performs issue triage, lightweight grilling, codebase analysis,
and planning for already-settled work, but recommends the Design tab and stops
when scope ambiguity or technical viability requires brainstorming or a
prototype. Consult keeps its existing context/ADR-only boundary and hands
build intent to Design. `/router` performs no shell operation: it recommends a
compatible tab or subagent and stops. `/improve-architecture` hands a selected
candidate and report context to Design instead of loading brainstorming.

We add machine-readable declarations beside documented entry-point handoffs.
The harness checker distinguishes autonomous `skill`, `task`, `bash`, `edit`,
and `external_directory` actions from human `recommend-primary` and `recommend-subagent`
transitions. Autonomous actions are resolved against effective OpenCode
permissions using global rules followed by agent Markdown and inline agent
overrides, with last matching rule winning. `allow` passes, `ask` emits a
visible warning without failing validation, and `deny` is a defect that fails
validation. Malformed declarations, unknown actors or targets, and
indeterminate composition fail closed.

This policy extends ADR-0050 by assigning its classifier-driven scope gate to
Design rather than every brainstorming consumer. It generalizes ADR-0051's
fail-closed validation approach from the frontend skill-load surface to
documented handoffs throughout the harness. Accepted ADR-0030, ADR-0050, and
ADR-0051 remain unchanged historical records.

## Consequences

- Restricted entry points no longer fail by attempting Design-owned shell,
  edit, or skill operations.
- Brainstorming and design-stage prototypes have one visible owner and one
  context budget.
- Escalated GitHub issues require a human switch to Design and a return to
  `@from-issue` after the Design-owned uncertainty is settled.
- The handoff declaration format and permission evaluator become load-bearing
  harness interfaces and must evolve with OpenCode permission semantics.
- Ask-gated routes remain valid but visibly depend on human approval.
- Adding an autonomous handoff now requires declaring its actor, action, and
  target so validation can prove compatibility.
- OpenCode must restart before updated skill permissions and prompts take
  effect.

## Alternatives Considered

### Widen every caller's permissions

Rejected because it erases the intentionally narrow Plan, Chat, Consult, and
From-Issue boundaries and duplicates Design's constructive capabilities.

### Keep ADR-0030's hybrid split and exempt the classifier

Rejected because bypassing ADR-0050's mandatory classifier would produce
different scope decisions by entry point and preserve prototype edit failures.

### Infer arbitrary handoffs from prose

Rejected because natural-language extraction is ambiguous, negation-sensitive,
and unable to distinguish an autonomous action from a human recommendation.
Structured declarations keep the checker deterministic while nearby behavior
tests keep declarations and prose aligned.

### Treat ask as either an error or an unconditional pass

Rejected because `ask` is executable only with human approval. A warning
preserves the valid route while exposing its operational dependency.
```

Do not change ADR-0030, ADR-0050, or ADR-0051.

- [x] **Step 4: Update the living context and verify Green**

Update `CONTEXT.md` as follows:

```markdown
| design agent | Primary OpenCode agent (TUI tab) and sole owner of classifier-driven brainstorming and design-stage prototyping: scope gate → grilling → exploration/prototype → design → spec → commit → feature-branch creation. It accepts escalations from restricted entry points and hands settled work to planning. Runs on the DESIGN model tier. Defined inline in `opencode.jsonc`. See ADR-0030, ADR-0050, ADR-0054. |
| documented handoff | A machine-declared transition in an agent, command, or skill. Autonomous skill/task/bash/edit handoffs must resolve against the actor's effective permissions; deny fails harness validation, ask warns, and human primary/subagent recommendations validate target existence and mode. See ADR-0054. |
```

Add this Architectural Decisions row after ADR-0053:

```markdown
- `adr/0054-design-owned-routing-and-handoff-permissions.md` — Partially supersede ADR-0030's hybrid split: Design solely owns classifier-driven brainstorming/prototyping, while effective deny fails documented-handoff validation and ask warns.
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php
```

Expected: PASS.

- [x] **Step 5: Commit the architectural decision**

```bash
IDENTITY=$(bash .github/scripts/resolve-identity.sh)
git add adr/0054-design-owned-routing-and-handoff-permissions.md CONTEXT.md tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php docs/plans/2026-08-11-design-owned-routing-permissions.md
git commit -S -m $'fix(architecture): record design-owned handoff policy\n\nRefs: #300\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$IDENTITY"
```

---

### Task 2: Route restricted design work to the Design tab

**Files:**
- Modify: `tests/Unit/Harness/RouterCommandTest.php:156-167`
- Create: `tests/Unit/Harness/ImproveArchitectureCommandTest.php`
- Modify: `tests/Unit/Harness/FromIssueAgentTest.php:178-220`
- Modify: `tests/Unit/Harness/ToSpecSkillTest.php:36-72`
- Modify: `.opencode/commands/router.md:5-38`
- Modify: `.opencode/commands/improve-architecture.md:134-159`
- Modify: `.opencode/agents/from-issue.md:165-209,294-321`
- Modify: `.opencode/skills/to-spec/SKILL.md:1-27,120-143`
- Modify: `opencode.jsonc:152` (Design prompt only)

**Interfaces:**
- Consumes: Design's primary-tab workflow, From-Issue's existing `@explore`/`@architect`/`@tdd` task allowlist, and Consult's existing Design handoff.
- Produces: shell-free Router recommendations, Design escalation/resume language, inline From-Issue fast-path taxonomy, and no Consult-to-spec writer claim.

- [x] **Step 1: Write failing route-contract tests**

Replace Router's ADR-0050 assertion with:

```php
it('router performs no shell work and sends scope classification to Design (ADR-0054)', function (): void {
    $router = (string) file_get_contents(__DIR__ . '/../../../.opencode/commands/router.md');

    Assert::assertStringContainsString('HUGE', $router);
    Assert::assertStringContainsString('design', $router);
    Assert::assertStringContainsString('wayfinder', $router);
    Assert::assertStringNotContainsString('bash ', $router, '/router must perform no shell operation');
    Assert::assertStringNotContainsString('classify-greenfield.sh', $router, 'Design owns the classifier');
    Assert::assertMatchesRegularExpression('/strict greenfield.*design/is', $router);
});
```

Create `tests/Unit/Harness/ImproveArchitectureCommandTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: ImproveArchitectureCommandTest.php kyau@nova 2026/08/11 -0700 Exp $

use PHPUnit\Framework\Assert;

it('hands selected architecture candidates to Design instead of loading brainstorming', function (): void {
    $path = __DIR__ . '/../../../.opencode/commands/improve-architecture.md';
    Assert::assertFileExists($path);
    $command = (string) file_get_contents($path);

    Assert::assertMatchesRegularExpression('/^agent:\s*build$/m', $command);
    Assert::assertStringContainsString('switch to the **design** tab', $command);
    Assert::assertMatchesRegularExpression('/selected candidate.*report/is', $command);
    Assert::assertStringNotContainsString('load the `brainstorming` skill', $command);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

Add to `FromIssueAgentTest.php`:

```php
it('redirects Design-owned ambiguity and viability instead of loading restricted skills', function (): void {
    $body = from_issue_agent_contents();

    Assert::assertStringNotContainsString('load the `brainstorming` skill', $body);
    Assert::assertStringNotContainsString('load the `prototype` skill', $body);
    Assert::assertMatchesRegularExpression('/Ambiguous \/ multiple approaches.*design tab/is', $body);
    Assert::assertMatchesRegularExpression('/Technical viability uncertain.*design tab/is', $body);
    Assert::assertStringContainsString('typo, RCS header, docs, style-only, patch-deps, or test-only', $body);
});
```

Add to `ToSpecSkillTest.php`:

```php
test('to-spec excludes Consult as a writer and redirects ambiguity to Design', function (): void {
    $content = (string) file_get_contents(__DIR__ . '/../../../.opencode/skills/to-spec/SKILL.md');

    expect($content)->not->toMatch('/consumer.*@consult|@consult.*consumer/i')
        ->and($content)->not->toMatch('/conversation \(@consult/i')
        ->and($content)->toContain('operating as `@consult`')
        ->and($content)->toContain('design tab');
});
```

- [x] **Step 2: Run the focused tests and verify Red**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/RouterCommandTest.php tests/Unit/Harness/ImproveArchitectureCommandTest.php tests/Unit/Harness/FromIssueAgentTest.php tests/Unit/Harness/ToSpecSkillTest.php
```

Expected: FAIL on Router's classifier command, `/improve-architecture` loading brainstorming, From-Issue loading restricted skills, and `to-spec` claiming Consult.

- [x] **Step 3: Make Router and `/improve-architecture` recommendation-only**

Revise Router's permission note and routing rows to state:

```markdown
> **Permissions:** `/router` is a plain command and works from every tab by
> performing no shell, edit, skill-load, or subagent-dispatch operation. It
> only recommends the compatible tab or user-invoked subagent and stops.

| Build something HUGE or potentially oversized | switch to the **design** tab — Design runs the ADR-0050 scope gate and routes established/indeterminate work to wayfinder |
| Start from a fresh or possibly greenfield scaffold | switch to the **design** tab — Design determines strict greenfield and applies the walking-skeleton exception |
| Make a trivial zero-behavior-delta change | switch to the **build** tab for the fast-path, then verification-before-completion + `/check` |
```

Change all `@consult`, `@from-issue`, and `@debug` rows to say the user invokes them from a compatible Build/General context. Remove every `bash ` and `classify-greenfield.sh` token. The greenfield heuristic becomes:

```markdown
- fresh scaffold / no commits / "greenfield" → **design** tab; Design owns classification and the walking-skeleton/wayfinder decision
```

Replace `/improve-architecture` lines 137-154 with:

```markdown
## 4. Design handoff (optional)

Once the user picks a candidate, stop the command workflow and ask them to
switch to the **design** tab. Carry forward the selected candidate, its concise
problem statement, and the generated report path. Design owns the ADR-0050
scope classifier, brainstorming, and any technical-viability prototype; this
Build-bound command does not load those workflows itself.

If the user rejects the candidate with a load-bearing reason, offer an ADR
before stopping, using the existing `CONTEXT.md`/ADR rules below.
```

- [x] **Step 4: Correct From-Issue, to-spec, and Design resume behavior**

In From-Issue, inline the chore taxonomy:

```markdown
- **Chore path:** fast-path only when the change has zero behavior delta:
  typo, RCS header, docs, style-only, patch-deps, or test-only. Recommend the
  user proceed directly in Build, then STOP. Otherwise reclassify and use the
  matching bug/enhancement route.
```

Replace the analysis insertions with:

```markdown
| Ambiguous / multiple approaches | STOP and recommend the **design** tab; its classifier and brainstorming workflow are outside this agent's bash/skill boundary |
| Technical viability uncertain | STOP and recommend the **design** tab; prototype edits and commands are outside this agent's edit/bash boundary |
```

Rewrite the oversized paragraph so From-Issue recognizes the condition from
issue/codebase evidence and recommends a fresh Design session; it must not say
that From-Issue loads brainstorming. Update Cross-refs to describe
`brainstorming` and `prototype` as Design-owned escalation targets, never as
skills loaded by From-Issue.

In `to-spec`, remove `@consult` from frontmatter, When-to-use, and Cross-refs.
Add these Do-not-use bullets:

```markdown
- You are operating as `@consult` — Consult cannot write `docs/specs/`; retain
  its existing handoff to the **design** tab.
- The design is still ambiguous — switch to the **design** tab, which owns
  classifier-driven brainstorming and prototyping.
```

Extend Design's inline prompt in `opencode.jsonc`:

```text
## Escalated Design work

Accept explicit escalations from /router, @from-issue, to-spec, and
/improve-architecture even when the context mentions an existing GitHub issue.
Run the scope gate, brainstorming, and any needed prototype before final spec
approval. When an issue escalation is settled, direct the user back to
@from-issue for planning; do not bounce the unresolved escalation back on
entry.
```

- [x] **Step 5: Verify Green and commit the routing fix**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/RouterCommandTest.php tests/Unit/Harness/ImproveArchitectureCommandTest.php tests/Unit/Harness/FromIssueAgentTest.php tests/Unit/Harness/ToSpecSkillTest.php
bash .github/scripts/validate-harness.sh
```

Expected: both commands exit 0.

```bash
IDENTITY=$(bash .github/scripts/resolve-identity.sh)
git add .opencode/commands/router.md .opencode/commands/improve-architecture.md .opencode/agents/from-issue.md .opencode/skills/to-spec/SKILL.md opencode.jsonc tests/Unit/Harness/RouterCommandTest.php tests/Unit/Harness/ImproveArchitectureCommandTest.php tests/Unit/Harness/FromIssueAgentTest.php tests/Unit/Harness/ToSpecSkillTest.php
git commit -S -m $'fix(routing): route restricted design work to Design\n\nRefs: #300\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$IDENTITY"
```

---

### Task 3: Enforce Design-only brainstorming and prototype access

**Files:**
- Create: `tests/Unit/Harness/DesignOwnedSkillPermissionTest.php`
- Modify: `opencode.jsonc:17-23,137-152,101`
- Modify: `.github/scripts/check-frontend-agent-contract.js:8-21,229-245,296-310`
- Modify: `tests/Shell/validate-harness_test.sh:3001-3137,3295-3450`
- Modify: `.opencode/skills/executing-plans/SKILL.md:96-104,137-145`
- Modify: `.opencode/skills/finding-duplicate-functions/SKILL.md:100-108`
- Modify: `AGENTS.md:114-160,303-319`
- Modify: `CODING_HARNESS.md:7-24`
- Modify: `README.md:251-275`

**Interfaces:**
- Consumes: OpenCode skill permission merge semantics and the ADR-0049/0051 frontend contract checker.
- Produces: global denies for `brainstorming`/`prototype`, Design-local allows, preserved frontend skill containment, and canonical docs with no non-Design direct-load instruction.

- [ ] **Step 1: Write the failing effective-ownership tests**

Create `tests/Unit/Harness/DesignOwnedSkillPermissionTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: DesignOwnedSkillPermissionTest.php kyau@nova 2026/08/11 -0700 Exp $

use PHPUnit\Framework\Assert;

it('globally denies Design-owned skills and re-allows them only for Design', function (): void {
    $config = load_opencode_config();
    $global = $config['permission']['skill'] ?? [];
    $design = $config['agent']['design']['permission']['skill'] ?? [];

    Assert::assertSame('allow', $global['*'] ?? null);
    Assert::assertSame('deny', $global['brainstorming'] ?? null);
    Assert::assertSame('deny', $global['prototype'] ?? null);
    Assert::assertSame(['brainstorming' => 'allow', 'prototype' => 'allow'], $design);

    foreach (['build', 'plan', 'chat', 'general', 'consult', 'from-issue', 'tdd'] as $agent) {
        $inline = $config['agent'][$agent]['permission']['skill'] ?? [];
        Assert::assertArrayNotHasKey('brainstorming', $inline, "{$agent} must not re-allow brainstorming");
        Assert::assertArrayNotHasKey('prototype', $inline, "{$agent} must not re-allow prototype");
        $frontmatter = agent_frontmatter($agent);
        Assert::assertDoesNotMatchRegularExpression('/brainstorming.*allow|prototype.*allow/is', $frontmatter);
    }
});

it('canonical non-Design workflows contain no direct load instruction for Design-owned skills', function (): void {
    $paths = [
        __DIR__ . '/../../../AGENTS.md',
        __DIR__ . '/../../../CODING_HARNESS.md',
        __DIR__ . '/../../../README.md',
        __DIR__ . '/../../../.opencode/skills/executing-plans/SKILL.md',
        __DIR__ . '/../../../.opencode/skills/finding-duplicate-functions/SKILL.md',
    ];

    foreach ($paths as $path) {
        $content = (string) file_get_contents($path);
        Assert::assertDoesNotMatchRegularExpression('/\bload(?:s|ing)?(?: the)? `?(?:brainstorming|prototype)`? skill/i', $content, $path);
    }
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the ownership test and verify Red**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/DesignOwnedSkillPermissionTest.php
```

Expected: FAIL because both skills are globally allowed and Design has no
local re-allows.

- [ ] **Step 3: Apply the least-privilege skill rules and update the existing checker**

Change `opencode.jsonc` global skill rules to this exact order:

```jsonc
"skill": {
  "*": "allow",
  "brainstorming": "deny",
  "prototype": "deny",
  "frontend-design": "deny",
  "frontend-architecture": "deny",
  "scss-mobile-first": "deny",
  "accessibility": "deny"
}
```

Add to `agent.design.permission`:

```jsonc
"skill": {
  "brainstorming": "allow",
  "prototype": "allow"
}
```

Change Build's pipeline sentence to route the design phase through the Design
tab rather than implying Build loads the two skills.

In `check-frontend-agent-contract.js`, define and enforce:

```javascript
const designOwnedSkills = ['brainstorming', 'prototype'];
const globalSkillRules = frontendSkills === null
	? []
	: [
		['*', 'allow'],
		...designOwnedSkills.map((name) => [name, 'deny']),
		...frontendSkills.map((name) => [name, 'deny']),
	];
const designSkillRules = designOwnedSkills.map((name) => [name, 'allow']);
const designSkill = cfg && cfg.agent && cfg.agent.design
	&& cfg.agent.design.permission && cfg.agent.design.permission.skill;
```

Add a clause requiring `matchesOrderedEntries(designSkill,
designSkillRules)`. Update the existing global-rule diagnostic to say the
global rules deny exactly the two Design-owned and four frontend skills.

- [ ] **Step 4: Update shell mutations and canonical workflow wording**

In `validate-harness_test.sh`, update exact frontend-contract diagnostic
expectations and add two vacuity-guarded mutations:

```bash
# Global Design-owned skill accidentally widened: must fail.
sed -i.bak 's/"brainstorming": "deny"/"brainstorming": "allow"/' opencode.jsonc

# Design's local prototype allow removed: must fail.
sed -i.bak 's/"prototype": "allow"/"prototype": "deny"/' opencode.jsonc
```

Each fixture must assert nonzero status and the corresponding stable
`frontend-contract:` diagnostic, following the existing T_CTR mutation pattern.

Update `executing-plans` requirement-change handling and
`finding-duplicate-functions` large-candidate guidance to halt and recommend
the Design tab rather than loading brainstorming. Update `AGENTS.md`,
`CODING_HARNESS.md`, and `README.md` so the canonical pipeline says the Design
tab owns brainstorming/prototype and restricted callers hand off instead of
loading them. Keep skill index rows; no skill is removed.

- [ ] **Step 5: Verify ownership and commit**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/DesignOwnedSkillPermissionTest.php
node .github/scripts/check-frontend-agent-contract.js opencode.jsonc .opencode/agents/frontend.md .opencode/agents/tdd.md .opencode/skills prism
bash tests/Shell/validate-harness_test.sh
bash .github/scripts/validate-harness.sh
```

Expected: all commands exit 0; the direct checker emits no output.

```bash
IDENTITY=$(bash .github/scripts/resolve-identity.sh)
git add opencode.jsonc .github/scripts/check-frontend-agent-contract.js tests/Shell/validate-harness_test.sh tests/Unit/Harness/DesignOwnedSkillPermissionTest.php .opencode/skills/executing-plans/SKILL.md .opencode/skills/finding-duplicate-functions/SKILL.md AGENTS.md CODING_HARNESS.md README.md
git commit -S -m $'fix(permissions): reserve design-stage skills for Design\n\nRefs: #300\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$IDENTITY"
```

---

### Task 4: Fail closed on permission-incompatible documented handoffs

**Files:**
- Create: `.github/scripts/check-handoff-permissions.js`
- Modify: `.github/scripts/validate-harness.sh:67-75,1373-1377`
- Modify: `tests/Shell/validate-harness_test.sh:62-96,3676-3681`
- Modify: `.opencode/commands/router.md`
- Modify: `.opencode/commands/improve-architecture.md`
- Modify: `.opencode/agents/from-issue.md`
- Modify: `.opencode/skills/to-spec/SKILL.md`

**Interfaces:**
- Consumes: `stripJsoncComments(string): string`, `parseFrontmatter(string): object|null`, OpenCode global/agent permission records, and one-line `prism-handoff` JSON declarations.
- Produces: CLI `node .github/scripts/check-handoff-permissions.js <opencode.jsonc> <.opencode-root>`, stable `handoff-contract: ERROR:`/`WARN:` diagnostics, exit 1 for denied or malformed contracts, and exit 0 for allow/recommendation/ask-only contracts.

- [ ] **Step 1: Add failing shell fixtures for allow, deny, ask, and malformed contracts**

Extend `setup_validator_env` to copy
`.github/scripts/check-handoff-permissions.js` once it exists. Add a
`setup_handoff_contract_env` helper that copies real `opencode.jsonc`, agent
files, and the four declared surfaces.

Add these fixture cases before `print_summary`:

```bash
# Positive: real declarations and config produce no handoff-contract diagnostic.
node .github/scripts/check-handoff-permissions.js opencode.jsonc .opencode

# Deny: inject this declaration and expect exit 1 + ERROR.
<!-- prism-handoff {"actor":"from-issue","action":"skill","target":"prototype"} -->

# Ask: inject this declaration and expect exit 0 + WARN.
<!-- prism-handoff {"actor":"from-issue","action":"bash","target":"gh issue comment 300"} -->

# Malformed: inject invalid JSON and expect exit 1 + ERROR.
<!-- prism-handoff {not-json} -->

# Unknown actor: expect exit 1 + ERROR.
<!-- prism-handoff {"actor":"missing-agent","action":"task","target":"explore"} -->
```

Every mutation test must prove its mutation exists before invoking the checker
and match the exact stable diagnostic prefix. Also test that a missing checker
fails loud when at least one declaration exists.

- [ ] **Step 2: Run the shell suite and verify Red**

Run:

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: FAIL because the handoff checker and validator integration do not
exist.

- [ ] **Step 3: Implement the generic handoff permission checker**

Create `.github/scripts/check-handoff-permissions.js` with these required
elements:

```javascript
// $KYAULabs: check-handoff-permissions.js kyau@nova 2026/08/11 -0700 Exp $

'use strict';

const fs = require('fs');
const path = require('path');
const { stripJsoncComments } = require('./jsonc-strip');
const { parseFrontmatter } = require('./frontmatter-parser');

const autonomousActions = new Set(['skill', 'task', 'bash', 'edit', 'external_directory']);
const recommendationActions = new Map([
	['recommend-primary', 'primary'],
	['recommend-subagent', 'subagent'],
]);
const errors = [];
const warnings = [];

function globMatches(pattern, value) {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`).test(value);
}

function applyPermission(value, target, state) {
	if (typeof value === 'string') return { verdict: value, determinate: true };
	if (value === undefined) return state;
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return { verdict: 'deny', determinate: false };
	}
	let verdict = state.verdict;
	for (const [pattern, action] of Object.entries(value)) {
		if (!['allow', 'ask', 'deny'].includes(action)) return { verdict: 'deny', determinate: false };
		if (globMatches(pattern, target)) verdict = action;
	}
	return { verdict, determinate: state.determinate };
}

function effectivePermission(config, agents, actor, action, target) {
	let state = { verdict: 'allow', determinate: true };
	state = applyPermission(config.permission && config.permission[action], target, state);
	state = applyPermission(agents[actor] && agents[actor].permission && agents[actor].permission[action], target, state);
	state = applyPermission(config.agent && config.agent[actor]
		&& config.agent[actor].permission && config.agent[actor].permission[action], target, state);
	return state;
}
```

Complete the file with functions that:

1. Parse JSONC with `stripJsoncComments`; parse every `.opencode/agents/*.md`
   frontmatter with `parseFrontmatter`.
2. Recursively scan `.opencode/{agents,commands,skills}` Markdown files for
   one-line `<!-- prism-handoff {...} -->` declarations and retain file/line.
3. Require exactly `action` and `target` for recommendations, and exactly
   `actor`, `action`, and `target` for autonomous actions; reject unknown keys.
4. Verify recommendation targets exist and have the declared primary/subagent
   mode after Markdown/inline composition.
5. Verify autonomous actors and targets exist where applicable, resolve their
   permission, emit ERROR for deny/indeterminate and WARN for ask.
6. Emit every stable diagnostic, then exit 1 when `errors.length > 0`, else 0.
7. End with `// vim: ft=javascript sts=4 sw=4 ts=4 noet :`.

Do not import the frontend checker. Keep the generic evaluator independent;
the existing checker remains the stricter ADR-0049/0051 shape contract.

- [ ] **Step 4: Declare the real handoffs and wire validation**

Place one-line declarations immediately before the matching prose/table row.
Use these declarations across the four surfaces:

```markdown
<!-- prism-handoff {"action":"recommend-subagent","target":"consult"} -->
<!-- prism-handoff {"action":"recommend-primary","target":"design"} -->
<!-- prism-handoff {"action":"recommend-subagent","target":"from-issue"} -->
<!-- prism-handoff {"action":"recommend-subagent","target":"debug"} -->
<!-- prism-handoff {"action":"recommend-primary","target":"build"} -->
<!-- prism-handoff {"actor":"from-issue","action":"task","target":"explore"} -->
<!-- prism-handoff {"actor":"from-issue","action":"task","target":"architect"} -->
<!-- prism-handoff {"actor":"from-issue","action":"task","target":"tdd"} -->
<!-- prism-handoff {"actor":"from-issue","action":"skill","target":"grilling"} -->
<!-- prism-handoff {"actor":"from-issue","action":"skill","target":"writing-plans"} -->
<!-- prism-handoff {"actor":"from-issue","action":"skill","target":"to-spec"} -->
<!-- prism-handoff {"actor":"from-issue","action":"skill","target":"executing-plans"} -->
```

Router, `/improve-architecture`, and ambiguous `to-spec` use human
recommendations. From-Issue uses autonomous declarations only for actions it
actually performs and recommendation declarations for Design/Debug stops.
Do not declare `brainstorming` or `prototype` as From-Issue actions.

Add `HANDOFF_CHECKER` near validator configuration. Before Summary, run it
when declarations are present. Convert each `handoff-contract: ERROR:` line to
`err`, each `WARN:` line to `warn`, fail loud on checker crash/no structured
diagnostic, and report an `ok` line when no error is added.

- [ ] **Step 5: Run complete verification and commit the closed contract**

Run:

```bash
node .github/scripts/check-handoff-permissions.js opencode.jsonc .opencode
bash tests/Shell/validate-harness_test.sh
shellcheck --severity=warning .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
php vendor/bin/pest tests/Unit/Harness/DesignOwnedRoutingArchitectureTest.php tests/Unit/Harness/RouterCommandTest.php tests/Unit/Harness/ImproveArchitectureCommandTest.php tests/Unit/Harness/FromIssueAgentTest.php tests/Unit/Harness/ToSpecSkillTest.php tests/Unit/Harness/DesignOwnedSkillPermissionTest.php tests/Unit/Harness/TicketingDelegationTest.php
bash .github/scripts/validate-harness.sh
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: every command exits 0; the handoff checker emits no output on the
real repository; coverage meets the changed-file 80% gate.

Restart OpenCode, then manually verify from Chat and Plan that `/router` only
recommends a tab/subagent and makes no permission request. Verify an escalated
issue in Design is accepted instead of immediately bounced back.

```bash
IDENTITY=$(bash .github/scripts/resolve-identity.sh)
git add .github/scripts/check-handoff-permissions.js .github/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh .opencode/commands/router.md .opencode/commands/improve-architecture.md .opencode/agents/from-issue.md .opencode/skills/to-spec/SKILL.md
git commit -S -m $'fix(harness): reject denied documented handoffs\n\nFixes: #300\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$IDENTITY"
```

After all tasks are green, run `/check` and `@code-review` as separate manual
gates. Only the human pushes the branch.

---

## Self-review

- **Acceptance coverage:** Task 2 makes Router shell-free, redirects From-Issue and `/improve-architecture` Design work, and removes Consult's to-spec claim. Task 3 enforces sole skill ownership. Task 4 validates declared handoffs and implements deny/error plus ask/warning policy.
- **Architecture coverage:** Task 1 creates required ADR-0054 and updates living context; accepted ADR-0030/0050/0051 remain untouched.
- **Permission coverage:** No caller is widened. Global skill containment is narrower, with only Design re-allowed.
- **Test coverage:** Focused Pest route tests, existing frontend contract mutations, generic shell fixtures, validator execution, coverage, and manual restart checks cover both prose and effective permissions.
- **Scope:** No classifier, brainstorming workflow body, prototype workflow body, dependency, generated asset, or application file changes are planned.
