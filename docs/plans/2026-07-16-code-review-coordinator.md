# @code-review Multi-Axis Coordinator Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Turn `@code-review` into a **coordinator** that dispatches 4 parallel
review axes: **ocr** (inline), **@standards-review** (Fowler 12-smell baseline),
**@spec-review** (requirement coverage), and **@semgrep** (SAST). The coordinator
keeps `edit: deny` (reports only) but gains **scoped** `task: allow` for exactly
its 3 read-only sub-agents — a justified carve-out from ADR-0006, recorded in
ADR-0021.

**Architecture:** Three agent definition Markdown files (one modified, two
new), a new ADR, and harness updates (`opencode.jsonc`, `AGENTS.md`, `README.md`,
`CONTEXT.md`). A dedicated harness test
(`tests/Unit/Harness/CodeReviewCoordinatorTest.php`) enforces the frontmatter
contract for all three agents, PRIMARY-tier wiring, dispatch allowlist, and
table presence. The existing `validate-harness.sh` (file↔table cross-check)
and `ModelConfigTest.php` (agent sweep) enforce the rest automatically.

**ADR-required:** `0021-code-review-coordinator-permission-model.md` — records
the scoped `task: allow` carve-out from ADR-0006. ADR-0006 is *not* superseded.

**Tech Stack:** OpenCode harness (Markdown agent + JSONC config), Pest v4
harness tests, Bash `validate-harness.sh`, GitHub `gh`.

---

## Decisions carred in from grilling

| # | Decision | Resolution |
|---|----------|------------|
| A | Tier for `@standards-review` + `@spec-review` | **PRIMARY** — both exercise LLM judgment (smell heuristics, coverage analysis), matching `@code-review`'s tier for uniform review-axis quality. |
| B | Spec-discovery heuristic for `@spec-review` | **Fuzzy-match** — extract `<description>` from branch name, fuzzy-match against `docs/specs/*.md` filenames (strip date prefix + `-spec` suffix). If exactly one match → read acceptance criteria, report Covered / Omitted / Deliberately-omitted. If zero or multiple → informational "no spec found — requirement-coverage skipped" (does not fail). |

---

## Acceptance criteria (from issue #137)

- [ ] AC #1: `@code-review` spawns 4 parallel axes
- [ ] AC #2: Output = 4 separate sections; no cross-axis reranking
- [ ] AC #3: Standards flags planted Duplicated-Code without re-flagging PSR-12 that ocr caught (de-dup)
- [ ] AC #4: Spec finds spec by branch name; reports deliberately-omitted requirements
- [ ] AC #5: Empty diff fails in coordinator, not sub-agents
- [ ] AC #6: Still `edit: deny` — reports only
- [ ] AC #7: ADR-0021 written

---

## Files chart

| File | Action | Why |
| --- | --- | --- |
| `adr/0021-code-review-coordinator-permission-model.md` | **Create** | Nygard-format ADR recording the scoped `task: allow` carve-out from ADR-0006. |
| `CONTEXT.md` | **Modify** | Add ADR-0021 to the "Architectural Decisions" list. |
| `.opencode/agents/standards-review.md` | **Create** | New read-only agent — Fowler 12-smell baseline (Duplicated Code, Long Method, Large Class, Long Parameter List, Divergent Change, Shotgun Surgery, Feature Envy, Data Clumps, Primitive Obsession, Conditional Complexity, Speculative Generality, Temporary Field). `edit: deny` + `task: deny` + read-only bash. |
| `.opencode/agents/spec-review.md` | **Create** | New read-only agent — requirement coverage (finds spec by branch name, reports deliberately-omitted requirements). Same read-only contract. |
| `.opencode/agents/code-review.md` | **Modify** | Rewrite single-axis `ocr` runner → coordinator. Change `task: deny` → scoped `task: { standards-review: allow, spec-review: allow, semgrep: allow }`. Add empty-diff guard, 4-section assembly, de-dup contract. Retain `edit: deny`. |
| `opencode.jsonc` | **Modify** | Register `standards-review` + `spec-review` at PRIMARY tier (`{env:OPENCODE_MODEL_PRIMARY}`). |
| `AGENTS.md` | **Modify** | Add 2 rows to "Agents Available" table (validator-enforced). |
| `README.md` | **Modify** | Add 2 rows to "### Custom agents" table (validator-enforced). |
| `tests/Unit/Harness/CodeReviewCoordinatorTest.php` | **Create** | Frontmatter contract test — Red→Green→Refactor, modelled on `FromIssueAgentTest.php`. |

---

## Task 1 — ADR-0021 + CONTEXT.md entry

**Slice:** The decision that governs everything else. Write the ADR first so
subsequent tasks can reference it.

### Red

Add to `tests/Unit/Harness/CodeReviewCoordinatorTest.php` (new file):

```php
it('ADR-0021 exists and records the coordinator permission-model carve-out', function (): void {
    $adr = __DIR__ . '/../../../adr/0021-code-review-coordinator-permission-model.md';
    Assert::assertFileExists($adr);
    $body = file_get_contents($adr);
    Assert::assertStringContainsString('code-review', $body);
    Assert::assertStringContainsString('0006', $body);          // references ADR-0006
    Assert::assertStringContainsString('task:', $body);          // the carve-out subject
    Assert::assertMatchesRegularExpression('/coordinator/i', $body);
});
```

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php --filter ADR-0021` → **fails** (ADR file absent).

### Green

1. **Create `adr/0021-code-review-coordinator-permission-model.md`** (Nygard format, matching `adr/0020`):
   - **Status:** Accepted
   - **Context:** ADR-0006 locked `@code-review` to `edit: deny` + `bash: "*": deny` + `task: deny`. Issue #137 requires `@code-review` to dispatch read-only review sub-agents as a coordinator.
   - **Decision:** Relax `@code-review`'s frontmatter: `task: deny` → scoped `task: { "*": deny, standards-review: allow, spec-review: allow, semgrep: allow }`. The coordinator retains `edit: deny` — it cannot write, only delegate to other read-only sub-agents. The mutation-prevention intent of ADR-0006 is preserved; only the isolation intent (no nested dispatch) is relaxed, and only to read-only targets.
   - **Consequences:** The harness validator (`validate-harness.sh`) is unaffected — it enforces `edit: deny` and bash catch-all deny, but does NOT check `task:`. `@code-review`'s description must retain a read-only keyword ("does not auto-fix" / "reports only") so the validator keeps checking its `edit: deny` + bash deny. Two new sub-agents (`@standards-review`, `@spec-review`) must carry `task: deny` to prevent unbounded nesting.
   - **Alternatives considered:** Full `task: allow` → rejected (unscoped, violates ADR-0006 intent). Keep single-axis → rejected (issue #137 mandates multi-axis).

2. **Modify `CONTEXT.md`** — add ADR-0021 to the "Architectural Decisions" list with a one-line summary.

### Verify

- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php --filter ADR-0021` → green
- `bash .github/scripts/validate-harness.sh` → passes
- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php` → green (agent sweep)

---

## Task 2 — `@standards-review` agent

**Slice:** New read-only agent applying Fowler's 12 code smells as a review baseline.

### Red

Add to `tests/Unit/Harness/CodeReviewCoordinatorTest.php`:

```php
it('standards-review agent exists with read-only frontmatter', function (): void {
    $fm = agent_frontmatter('standards-review');
    Assert::assertMatchesRegularExpression('/^mode:\s*subagent/m', $fm);
    Assert::assertStringContainsString('edit: deny', $fm);
    Assert::assertStringContainsString('task: deny', $fm);
    Assert::assertStringContainsString('"*": deny', $fm);          // bash catch-all
});

it('standards-review is registered in opencode.jsonc at PRIMARY tier', function (): void {
    $cfg = load_opencode_config();
    Assert::assertSame('{env:OPENCODE_MODEL_PRIMARY}', $cfg['agent']['standards-review']['model']);
});

it('AGENTS.md and README.md index @standards-review', function (): void {
    Assert::assertStringContainsString(
        '| `@standards-review`',
        file_get_contents(__DIR__ . '/../../../AGENTS.md')
    );
    Assert::assertStringContainsString(
        '| `@standards-review`',
        file_get_contents(__DIR__ . '/../../../README.md')
    );
});

it('standards-review body documents Fowler 12 smells and de-dup contract', function (): void {
    $body = agent_contents('standards-review');
    Assert::assertMatchesRegularExpression('/Duplicated Code/i', $body);
    Assert::assertMatchesRegularExpression('/Long Method/i', $body);
    Assert::assertMatchesRegularExpression('/de-?dup/i', $body);
    Assert::assertStringContainsString('PSR-12', $body);
    Assert::assertStringContainsString('does not auto-fix', $body);
});
```

Run → **fails** (agent absent, not registered, not indexed).

### Green

1. **Create `.opencode/agents/standards-review.md`** — frontmatter:
   - `mode: subagent`
   - `model: {env:OPENCODE_MODEL_PRIMARY}`
   - `temperature: 0.1`
   - `edit: deny`
   - `bash: { "*": deny, ls*: allow, cat*: allow, tail*: allow, head*: allow, grep*: allow, find*: allow, "git log*": allow, "git show*": allow, "git status*": allow, "git diff*": allow }`
   - `webfetch: deny`
   - `task: deny`
   - Body: Fowler's 12 code smells applied to the diff only. De-dup contract: do NOT re-report PSR-12/style/lint findings that `ocr` or `/check` cover. Report by severity; no auto-fix.
2. **Register in `opencode.jsonc`** under `agent.standards-review` (PRIMARY tier, same shape as `code-review`).
3. **Add row to `AGENTS.md`** "Agents Available" table.
4. **Add row to `README.md`** "### Custom agents" table.

### Verify

- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php --filter standards-review` → green
- `bash .github/scripts/validate-harness.sh` → passes
- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php` → green

---

## Task 3 — `@spec-review` agent

**Slice:** New read-only agent that checks diff coverage against the relevant spec.

### Red

Add to `tests/Unit/Harness/CodeReviewCoordinatorTest.php`:

```php
it('spec-review agent exists with read-only frontmatter', function (): void {
    $fm = agent_frontmatter('spec-review');
    Assert::assertMatchesRegularExpression('/^mode:\s*subagent/m', $fm);
    Assert::assertStringContainsString('edit: deny', $fm);
    Assert::assertStringContainsString('task: deny', $fm);
    Assert::assertStringContainsString('"*": deny', $fm);
});

it('spec-review is registered in opencode.jsonc at PRIMARY tier', function (): void {
    $cfg = load_opencode_config();
    Assert::assertSame('{env:OPENCODE_MODEL_PRIMARY}', $cfg['agent']['spec-review']['model']);
});

it('AGENTS.md and README.md index @spec-review', function (): void {
    Assert::assertStringContainsString(
        '| `@spec-review`',
        file_get_contents(__DIR__ . '/../../../AGENTS.md')
    );
    Assert::assertStringContainsString(
        '| `@spec-review`',
        file_get_contents(__DIR__ . '/../../../README.md')
    );
});

it('spec-review body documents branch-name spec discovery and coverage reporting', function (): void {
    $body = agent_contents('spec-review');
    Assert::assertStringContainsString('branch', $body);
    Assert::assertStringContainsString('docs/specs', $body);
    Assert::assertMatchesRegularExpression('/Covered|Omitted|Deliberately-?omitted/i', $body);
    Assert::assertStringContainsString('no spec found', $body);
    Assert::assertStringContainsString('does not auto-fix', $body);
});
```

Run → **fails** (agent absent).

### Green

1. **Create `.opencode/agents/spec-review.md`** — same read-only frontmatter as `standards-review` (PRIMARY tier, `edit: deny`, `task: deny`, read-only bash). Body:
   - Resolve current branch name.
   - Extract `<description>` segment from `feat/<username>-<hash>-<description>`.
   - Fuzzy-match against `docs/specs/*.md` filenames (strip `YYYY-MM-DD-` date prefix and `-spec` suffix).
   - If exactly one match → read its acceptance criteria. Report each criterion as `Covered` / `Omitted` / `Deliberately-omitted` against the diff.
   - If zero or multiple matches → emit informational message: "No spec found — requirement-coverage skipped."
   - No auto-fix.
2. **Register in `opencode.jsonc`** under `agent.spec-review` (PRIMARY tier).
3. **Add row to `AGENTS.md`** "Agents Available" table.
4. **Add row to `README.md`** "### Custom agents" table.

### Verify

- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php --filter spec-review` → green
- `bash .github/scripts/validate-harness.sh` → passes
- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ModelConfigTest.php` → green

---

## Task 4 — `@code-review` coordinator rewrite

**Slice:** The core change — rewrite the existing `@code-review` agent from a
single-axis `ocr` runner into a 4-axis coordinator with scoped dispatch.

### Red

Add to `tests/Unit/Harness/CodeReviewCoordinatorTest.php`:

```php
it('code-review coordinator has scoped task allowlist for its 3 axes', function (): void {
    $fm = agent_frontmatter('code-review');
    Assert::assertStringContainsString('task:', $fm);
    Assert::assertStringContainsString('"standards-review": allow', $fm);
    Assert::assertStringContainsString('"spec-review": allow', $fm);
    Assert::assertStringContainsString('"semgrep": allow', $fm);
});

it('code-review coordinator retains edit: deny and read-only bash', function (): void {
    $fm = agent_frontmatter('code-review');
    Assert::assertStringContainsString('edit: deny', $fm);
    Assert::assertStringContainsString('"*": deny', $fm);
    Assert::assertStringContainsString('ocr', $fm);   // still runs ocr inline
});

it('code-review body documents empty-diff guard, 4 axes, de-dup, and read-only posture', function (): void {
    $body = agent_contents('code-review');
    Assert::assertStringContainsString('standards-review', $body);
    Assert::assertStringContainsString('spec-review', $body);
    Assert::assertStringContainsString('semgrep', $body);
    Assert::assertMatchesRegularExpression('/empty.*diff/i', $body);
    Assert::assertMatchesRegularExpression('/4.*(section|axis)/i', $body);
    Assert::assertMatchesRegularExpression('/de-?dup/i', $body);
    Assert::assertStringContainsString('does not auto-fix', $body);
});
```

Run → **fails** (current `code-review.md` has `task: deny`).

### Green

**Modify `.opencode/agents/code-review.md`:**

1. **Frontmatter:** Change `task: deny` → `task: { "*": deny, "standards-review": allow, "spec-review": allow, "semgrep": allow }`. Keep `mode: subagent`, `temperature: 0.1`, `edit: deny`, `bash: { "*": deny, …ocr allowlist… }`, `webfetch: deny`.

2. **Body — coordinator workflow:**
   1. **Empty-diff guard:** Determine diff scope first. If the diff is empty, FAIL in the coordinator with a clear message — do NOT dispatch any sub-agents. (AC #5)
   2. **Dispatch 4 axes in parallel:**
      - Axis 1 — **ocr** (run `ocr review` / `ocr scan` inline in the coordinator process)
      - Axis 2 — **@standards-review** (dispatch via task tool — Fowler 12-smell baseline)
      - Axis 3 — **@spec-review** (dispatch via task tool — requirement coverage)
      - Axis 4 — **@semgrep** (dispatch via task tool — SAST scan)
      Issue all 3 task calls in one message turn for maximum parallelism. (AC #1)
   3. **Assemble output:** 4 separate sections (OCR / Standards / Spec / SAST), each with its own severity grouping. No cross-axis reranking — present each axis's findings independently. (AC #2)
   4. **De-dup contract:** State explicitly in the body — `@standards-review` must not re-flag PSR-12/style/lint findings that ocr or `/check` already caught. Each axis covers distinct territory. (AC #3)
   5. **Read-only posture:** Retain the phrasing "reports only / does not auto-fix" in the description so the harness validator's read-only keyword check stays active. (AC #6)

### Verify

- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php` → **full suite green**
- `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/CodeReviewCoordinatorTest.php --coverage` → ≥80% line coverage
- `bash .github/scripts/validate-harness.sh` → passes
- `bash tests/Shell/validate-harness_test.sh` → green
- `php -d pcov.enabled=1 vendor/bin/pest` → full regression suite green

---

## Final verification (after all 4 tasks)

```bash
# Full harness test suite
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness --coverage
# Harness validator
bash .github/scripts/validate-harness.sh
# Harness validator self-tests
bash tests/Shell/validate-harness_test.sh
# Full regression suite
php -d pcov.enabled=1 vendor/bin/pest
# Pre-push gate
# /check  (php-cs-fixer + stylelint + eslint + pest --coverage)
# @code-review  (manual review before push)
```

---

## No issue auto-closure

Leave #137 open for manual close after `/check` + `@code-review`. Commit footer: `Refs: #137`.

---

## Commit plan

Each task produces its own atomic commit:

| Task | Conventional commit |
|------|---------------------|
| 1 | `docs(adr): add ADR-0021 code-review coordinator permission-model carve-out` |
| 2 | `feat(agents): add @standards-review agent (Fowler 12-smell baseline)` |
| 3 | `feat(agents): add @spec-review agent (requirement-coverage review)` |
| 4 | `feat(agents): rewrite @code-review as multi-axis coordinator with scoped dispatch` |
