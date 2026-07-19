# Extend receiving-code-review for 4-Axis Code Review — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Extend the `receiving-code-review` skill to normalize the 4-axis
`@code-review` report (ocr / standards / spec / sast) into its single
Blocking / Suggested / Informational triage, with an axis-tagged summary.

**Architecture:** Single source-file change —
`.opencode/skills/receiving-code-review/SKILL.md` — plus one new harness
content test, `tests/Unit/Harness/ReceivingCodeReviewSkillTest.php`, that
asserts the normalization matrix and axis-tagged summary exist (Red → Green).
No agent definitions, opencode config, or ADRs are touched. The producer
(`@standards-review`) is intentionally left untouched; the consumer caps its
findings at Suggested (grilling Q1 = option a).

**Tech Stack:** OpenCode harness skill Markdown, Pest v4 harness content tests
(`file_get_contents` + `expect()`), matching `ToSpecSkillTest.php`.

## Global constraints

- **Single-file scope:** modify ONLY `.opencode/skills/receiving-code-review/SKILL.md`. Do NOT touch `.opencode/agents/standards-review.md` (the producer/consumer divergence is a deferred cleanup, noted in the skill, tracked separately).
- **No new ADR** — this is a content/skill change inside an already-accepted design (ADR-0021 multi-axis review). No architectural decision is being made.
- **File conventions:** SKILL.md is Markdown with YAML frontmatter and does NOT take an RCS header (Markdown is outside the `rcs-header` skill's list and existing skills omit it). The new `.php` test file DOES take the `$KYAULabs:` RCS header + vim modeline (match `ToSpecSkillTest.php`).
- **Signed commits:** `git commit -S`. Footer model IDs resolved from `opencode.jsonc` + `.opencode/models.default.env` — Plan-by: `glm-5.2` (PLANNER tier); Acked-by: `deepseek-v4-pro` (build agent inherits top-level PRIMARY model); Signed-off-by: `kyau <git@kyaulabs.com>`.
- **Issue reference:** `Refs: #138` (do NOT auto-close the task — leave open for manual close after `/check` + `@code-review`, matching the #137 pattern).

## Decisions carried in from grilling

| # | Decision | Resolution |
|---|----------|------------|
| Q1 | Reconcile AC #2 ("Fowler smells → never Blocking") with `@standards-review` emitting Blocking for 3 smells | **Cap at the consumer** — normalize EVERY `@standards-review` finding to at most Suggested in this skill. Do NOT touch the agent. Note the divergence as deferred cleanup. |
| Q2 | Summary shape across the 4 axes | **Single merged list, axis-tagged** — keep Fixed/Deferred/Informational buckets; prefix each finding with `[ocr]`/`[standards]`/`[spec]`/`[sast]`. |
| Q3 | semgrep ERROR/WARNING/INFO mapping | **1:1** — ERROR→Blocking, WARNING→Suggested, INFO→Informational. |

## Normalization matrix (the contract this plan implements)

| Axis | Native vocabulary | → Receiving triage |
|---|---|---|
| ocr | Blocking / Suggested / Informational | unchanged — pass through |
| standards (`@standards-review`) | Blocking / Suggested / Informational | cap at Suggested — never Blocking |
| spec (`@spec-review`) | Covered / Omitted / Deliberately-omitted | Omitted → Blocking; Deliberately-omitted → Informational; "no spec found" → Informational |
| sast (`@semgrep`) | ERROR / WARNING / INFO | ERROR → Blocking; WARNING → Suggested; INFO → Informational |

## Files chart

| File | Action | Why |
|---|---|---|
| `tests/Unit/Harness/ReceivingCodeReviewSkillTest.php` | **Create** | Pest content test asserting all 5 ACs against the skill Markdown. Red→Green seam. |
| `.opencode/skills/receiving-code-review/SKILL.md` | **Modify** | Add "Normalizing the 4 axes" section (matrix table + standards-cap rationale + deferred-cleanup note); rewrite "Response format" to axis-tagged Fixed/Deferred/Informational; preserve the "cannot articulate the bug → at most Suggested" rule (AC #4). |

## Acceptance criteria (from issue #138)

- [ ] AC #1: Spec-axis missing/partial requirement → Blocking
- [ ] AC #2: Fowler design smells → Suggested (never Blocking)
- [ ] AC #3: semgrep high-severity → Blocking
- [ ] AC #4: "If you can't name the bug it prevents, at most Suggested" rule preserved
- [ ] AC #5: Summary groups fixes/deferrals/informational across 4 axes

---

## Task 1 — Red: failing harness content test

**Slice:** Write the test that encodes all 5 ACs. It fails because the skill
has no 4-axis content yet.

**Files:**
- Create: `tests/Unit/Harness/ReceivingCodeReviewSkillTest.php`

- [ ] **Step 1: Create the test file**

Create `tests/Unit/Harness/ReceivingCodeReviewSkillTest.php` with this exact
content (RCS header + vim modeline match `ToSpecSkillTest.php`):

```php
<?php

declare(strict_types=1);

# $KYAULabs: ReceivingCodeReviewSkillTest.php kyau@nova 2026/07/16 -0700 Exp $




/**
 * Asserts the receiving-code-review skill (issue #138) extends its triage to
 * consume the 4-axis @code-review report (ocr / standards / spec / sast).
 * The 4 axes use three vocabularies; the skill must normalize them into one
 * Blocking / Suggested / Informational triage and present an axis-tagged
 * Fixed / Deferred / Informational summary.
 */

test('skill documents normalization across the 4 axes', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/4[-\s]?axes/i');
    expect($content)->toContain('standards');
    expect($content)->toContain('spec');
    expect($content)->toContain('sast');
});

test('AC1 spec Omitted requirement maps to Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/Omitted.*Blocking/is');
});

test('AC2 Fowler/standards smells capped at Suggested never Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/standards.*Suggested/is');
    expect($content)->toMatch('/Never Blocking/i');
});

test('AC3 semgrep ERROR maps to Blocking', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/ERROR.*Blocking/is');
});

test('AC4 name-the-bug rule preserved at most Suggested', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/cannot articulate the bug/i');
});

test('AC5 summary is a single axis-tagged Fixed/Deferred/Informational list', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toContain('[axis]');
    expect($content)->toMatch('/\[ocr\]/');
    expect($content)->toMatch('/\[sast\]/');
    expect($content)->toMatch('/\[spec\]/');
    expect($content)->toMatch('/\[standards\]/');
});

test('skill notes the standards producer/consumer divergence as deferred cleanup', function (): void {
    $content = file_get_contents(__DIR__ . '/../../../.opencode/skills/receiving-code-review/SKILL.md');
    expect($content)->toMatch('/deferred cleanup/i');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test — confirm it fails (Red)**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ReceivingCodeReviewSkillTest.php`
Expected: FAIL. The AC #4 test passes (that rule already exists in the skill),
but the other six tests fail — the skill has no 4-axis section, no
normalization matrix, and no axis-tagged summary yet. The suite is Red.

- [ ] **Step 3: Do NOT commit yet** — the test is Red. Green it in Task 2 and commit both together (atomic).

---

## Task 2 — Green: extend the skill (Red → Green → commit)

**Slice:** Add the 4-axis normalization section, the axis-tagged summary, and
the deferred-cleanup note. Preserve AC #4's rule. Commit the test + skill
together as one atomic commit.

**Files:**
- Modify: `.opencode/skills/receiving-code-review/SKILL.md`
- (Stage the test from Task 1 in the same commit.)

- [ ] **Step 1: Insert the "Normalizing the 4 axes" section**

In `.opencode/skills/receiving-code-review/SKILL.md`, insert this block
**immediately after** the existing "Triage matrix" section — i.e. directly
after the sentence "If you cannot articulate the bug or regression a finding
would prevent, it is at most **Suggested** — not Blocking." and before the
"## Process" heading:

````markdown
## Normalizing the 4 axes

`@code-review` now returns a **multi-axis report with 4 axes** — **ocr**,
**standards**, **spec**, **sast**. The axes use three different vocabularies.
Normalize every finding into the single Blocking / Suggested / Informational
triage **before** applying the process below.

| Axis | Native vocabulary | → Receiving triage |
|---|---|---|
| **ocr** | Blocking / Suggested / Informational | unchanged — pass through |
| **standards** (`@standards-review`, Fowler smells) | Blocking / Suggested / Informational | **cap at Suggested — never Blocking.** Structural smells are maintainability, not correctness bugs. |
| **spec** (`@spec-review`) | Covered / Omitted / Deliberately-omitted | **Omitted → Blocking** (a missing requirement ships an incomplete feature); Deliberately-omitted → Informational; "no spec found" → Informational |
| **sast** (`@semgrep`) | ERROR / WARNING / INFO | **ERROR → Blocking**; WARNING → Suggested; INFO → Informational |

> **Why standards is capped at Suggested:** if you cannot articulate the bug or
> regression a finding prevents, it is at most Suggested (rule above). Fowler
> design smells describe maintainability risk, not correctness bugs, so they
> never clear the Blocking bar at consumption time — regardless of what
> `@standards-review` reported.
>
> _Deferred cleanup (out of scope here): `@standards-review` still emits
> Blocking for three smells. Aligning the producer with this consumer rule is
> tracked separately; until then this skill caps them._
````

- [ ] **Step 2: Rewrite the "Response format" section to be axis-tagged**

Replace the entire existing `## Response format` section (from the
`## Response format` heading through its closing ` ``` ` fence) with:

````markdown
## Response format

For the user-facing summary after triage. Every finding carries an `[axis]`
tag — `[ocr]`, `[standards]`, `[spec]`, `[sast]` — so the reviewer can trace
it back to the report section. The fix/defer decision is the same regardless
of which axis surfaced a finding, so the summary is one merged list (not four
separate per-axis lists).

```
## Code Review Response

### Fixed (N)
- [ocr] <finding> — <brief note on the fix>
- [spec] AC#2 omitted — <implemented the missing handler>
- [sast] ERROR <finding> — <moved secret to env var>

### Deferred (N)
- [standards] Long Method (Fowler) — <one-line reason for deferral>

### Informational (N)
- [spec] 1 deliberately-omitted (out of scope) — acknowledged
- [sast] INFO <finding> — acknowledged
```
````

- [ ] **Step 3: Confirm AC #4's rule is intact**

Verify this existing sentence near the top of the skill is unchanged (do not
alter it): "If you cannot articulate the bug or regression a finding would
prevent, it is at most **Suggested** — not Blocking."

- [ ] **Step 4: Run the test — confirm it passes (Green)**

Run: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ReceivingCodeReviewSkillTest.php`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit (test + skill, atomic)**

```bash
git add tests/Unit/Harness/ReceivingCodeReviewSkillTest.php .opencode/skills/receiving-code-review/SKILL.md
git commit -S -m "feat(skills): extend receiving-code-review for 4-axis code review

Normalize the 4 @code-review axes (ocr/standards/spec/sast) into one
Blocking/Suggested/Informational triage. Standards capped at Suggested
(never Blocking); spec Omitted -> Blocking; semgrep ERROR -> Blocking.
Summary becomes a single axis-tagged Fixed/Deferred/Informational list.

Refs: #138
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Final verification (after Task 2)

```bash
# Targeted skill test with coverage
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/ReceivingCodeReviewSkillTest.php --coverage
# Full harness regression
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness
# Harness validator (file <-> table cross-check for skills/agents)
bash .github/scripts/validate-harness.sh
# Full regression suite
php -d pcov.enabled=1 vendor/bin/pest
# Pre-push gate
# /check  (php-cs-fixer + stylelint + eslint + pest --coverage 80%)
# @code-review  (manual multi-axis review before push)
```

Coverage note: the coverage gate (ADR-0009) measures **changed PHP files**.
The only changed PHP file is the new test, which executes fully (≈100% line
coverage). The `.md` skill is non-executable and is not measured.

---

## No issue auto-closure

Leave #138 open for manual close after `/check` + `@code-review`. The commit
footer uses `Refs: #138` (not `Fixes:`).

---

## Commit plan

| Task | Conventional commit |
|------|---------------------|
| 1 + 2 (atomic) | `feat(skills): extend receiving-code-review for 4-axis code review` |
