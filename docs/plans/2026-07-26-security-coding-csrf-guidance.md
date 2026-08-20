# security-coding CSRF Guidance Fix Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Correct the CSRF guidance in the `security-coding` skill to use a
generate-once token, constant-time validation (`hash_equals`), and full
HTML-attribute escaping — and add a harness regression test that mechanically
enforces all three so the bad pattern cannot silently drift back.

**Architecture:** One markdown edit to the skill's CSRF section (tightened
bullets + a corrected code block) plus one new Pest convention test modeled on
`tests/Unit/Harness/ArchTest.php` that reads the skill file, extracts the CSRF
section, and asserts the three correctness primitives. Single Green commit
(test + fix together).

**Tech Stack:** PHP 8.5, Pest v4 on PHPUnit 12, filesystem-walker convention
test (no autoload — reads the skill markdown directly).

## Global constraints

- Issue #206 — `Documentation` type, CSRF-only scope (the `:107-113` CSP line
  in the issue body has no corresponding complaint; out of scope).
- Commit type is `docs` (mirrors `Documentation` issue type per
  `docs/agents/labels.md`).
- Every new `.php` file needs `declare(strict_types=1)` + an RCS-style
  `$KYAULabs:` header + a vim modeline (see `rcs-header` skill). Exempt
  directories: `vendor/`, `node_modules/`, `aurora/`, generated `cdn/`.
- The changed files (`.opencode/skills/security-coding/SKILL.md` markdown +
  new test file) are **not** under `phpunit.xml`'s `<source>` block, so the
  changed-file coverage gate (ADR-0009) has no source intersection — it passes
  vacuously. The full suite must still be green.
- Signed commits required. Footers: `Fixes: #206` (top of footer) →
  `Authored-by` → `Tested-by` → `Signed-off-by`.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `tests/Unit/Harness/SecurityCodingSkillTest.php` | Create | Convention test: reads the skill markdown, extracts the CSRF section, asserts `hash_equals(`, `ENT_QUOTES \| ENT_HTML5, 'UTF-8'`, and the generate-once guard `empty($_SESSION['csrf'])` are present. |
| `.opencode/skills/security-coding/SKILL.md` | Modify (CSRF section, lines ~41–53) | Tighten the CSRF bullets to mention generate-once + constant-time; replace the code block with a corrected example (generate-once, full escape, `hash_equals` validation). |

The test and the markdown fix are tightly coupled (the test asserts on the
fix), so they ship in one Green commit — no Red commit is left in the tree.

---

### Task 1: CSRF guidance regression test + skill correction

**Files:**
- Create: `tests/Unit/Harness/SecurityCodingSkillTest.php`
- Modify: `.opencode/skills/security-coding/SKILL.md` (the `## CSRF` section)
- Test: `tests/Unit/Harness/SecurityCodingSkillTest.php` (self-contained)

**Interfaces:**
- Consumes: the `security-coding` skill markdown at
  `.opencode/skills/security-coding/SKILL.md` (repo-relative path resolved via
  `dirname(__DIR__, 3)`, same idiom as `ArchTest.php`).
- Produces: three `test(...)` cases that fail on the current prose and pass
  after the fix. Nothing else depends on this file.

**Why these three assertions:** each maps to one clause of the issue's
acceptance criterion ("generate-once + hash_equals + full escape flags").
Splitting them into separate tests yields a precise failure message naming the
missing primitive, matching `ArchTest.php`'s one-concern-per-test style.

- [ ] **Step 1: Create the failing test file**

Create `tests/Unit/Harness/SecurityCodingSkillTest.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: SecurityCodingSkillTest.php kyau@nova 2026/07/26 -0700 Exp $


/**
 * Absolute path to the security-coding skill markdown file.
 *
 * @return non-empty-string
 */
function security_coding_skill_path(): string
{
    $repoRoot = dirname(__DIR__, 3);

    return $repoRoot . DIRECTORY_SEPARATOR
        . '.opencode' . DIRECTORY_SEPARATOR
        . 'skills' . DIRECTORY_SEPARATOR
        . 'security-coding' . DIRECTORY_SEPARATOR
        . 'SKILL.md';
}

/**
 * Extracts the CSRF section body from the security-coding skill.
 *
 * Captures from the "## CSRF" heading up to (not including) the next "## "
 * heading, or end of file. Returns the empty string when the section is
 * absent so callers can assert non-emptiness with a clear message.
 */
function security_coding_csrf_section(string $content): string
{
    if (preg_match('/^## CSRF\b.*?(?=^## |\z)/ms', $content, $matches) !== 1) {
        return '';
    }

    return $matches[0];
}

test('security-coding skill file exists', function (): void {
    expect(security_coding_skill_path())->toBeFile();
});

test('security-coding CSRF guidance validates with hash_equals', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('hash_equals(');
});

test('security-coding CSRF guidance escapes with full htmlspecialchars flags', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('ENT_QUOTES | ENT_HTML5, \'UTF-8\'');
});

test('security-coding CSRF guidance generates the token once per session', function (): void {
    $content = (string) file_get_contents(security_coding_skill_path());
    $section = security_coding_csrf_section($content);

    expect($section)
        ->not->toBeEmpty('CSRF section not found in security-coding skill')
        ->and($section)->toContain('empty($_SESSION[\'csrf\'])');
});


// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test to verify it fails (Red)**

Run: `php vendor/bin/pest tests/Unit/Harness/SecurityCodingSkillTest.php`

Expected: **3 failures** — the `file exists` test passes, but the three CSRF
assertion tests fail:
- `validates with hash_equals` → expected to contain `hash_equals(` (absent).
- `escapes with full htmlspecialchars flags` → expected to contain
  `ENT_QUOTES | ENT_HTML5, 'UTF-8'` (the CSRF code block uses bare
  `htmlspecialchars($token)`).
- `generates the token once per session` → expected to contain
  `empty($_SESSION['csrf'])` (the block unconditionally assigns
  `$_SESSION['csrf'] = $token`).

This confirms the test is genuinely Red on the current, unfixed prose.

- [ ] **Step 3: Fix the skill markdown (Green)**

In `.opencode/skills/security-coding/SKILL.md`, replace the **entire** `## CSRF`
section (heading + four bullets + the `php` code fence) with:

````markdown
## CSRF — tokens on every state-changing request

- Every POST/PUT/DELETE form includes a CSRF token rendered as a hidden input.
- Token is session-scoped, generated **once per session** with `random_bytes()`
  (regenerating on every load breaks multi-tab forms — both tabs must share one
  token, or tab A's token is invalidated when tab B loads).
- Validate with `hash_equals()` (constant-time) on the server before any state
  change; never compare secrets with `==` or `===`.
- On mismatch, reject with 419 and do not reveal whether the session exists.
- Same-origin via `SameSite` cookies is a complement, not a replacement.

```php
// Generate once per session — reuse across requests so multiple tabs share
// one token (regenerating every load invalidates tab A after tab B loads).
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

// Render into the form, escaped for the HTML attribute context:
// <input type="hidden" name="csrf" value="<?= htmlspecialchars($_SESSION['csrf'], ENT_QUOTES | ENT_HTML5, 'UTF-8') ?>">

// Validate on POST with constant-time comparison:
if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
    http_response_code(419);
    exit;
}
```
````

Notes for the implementer:
- Do **not** touch any other section of the skill (the XSS section at line ~33
  already uses `ENT_QUOTES | ENT_HTML5, 'UTF-8'` — it is the *correct* reference
  the CSRF block is being made consistent with).
- The escape now matches the project's own Semgrep fixture at
  `tests/Semgrep/MissingCsrfToken/negative.php:23`.

- [ ] **Step 4: Run the test to verify it passes (Green)**

Run: `php vendor/bin/pest tests/Unit/Harness/SecurityCodingSkillTest.php`

Expected: **4 passed**, 0 failed. All three CSRF primitives are now present in
the extracted section.

- [ ] **Step 5: Run the full harness suite to confirm no collateral**

Run: `php vendor/bin/pest tests/Unit/Harness`

Expected: all green. (The new test only *reads* the skill markdown; it cannot
affect other tests. This step guards against an accidental broader edit to the
skill file that could trip, e.g., a skill-structure assertion elsewhere.)

- [ ] **Step 6: Refactor pass**

Re-read the two changed files with fresh eyes:
- Is the test regex `/^## CSRF\b.*?(?=^## |\z)/ms` robust? (Yes — `\b` after
  CSRF avoids matching a hypothetical `## CSRF-token` heading; the lookahead
  stops at the next `## ` heading or EOF.)
- Is the corrected CSRF code block internally consistent with the bullets
  above it? (generate-once bullet ↔ `empty($_SESSION['csrf'])` guard;
  `hash_equals()` bullet ↔ validation block; escape ↔ form comment.)
- No dead code, no stray debug calls (the `no debug functions` ArchTest would
  catch them anyway).

No changes expected; if any are made, re-run Step 4 before committing.

- [ ] **Step 7: Commit (test + fix, Green)**

Stage exactly the two files (the markdown fix and the new test):

```bash
git add tests/Unit/Harness/SecurityCodingSkillTest.php .opencode/skills/security-coding/SKILL.md
git commit -S -m $'docs(security-coding): fix CSRF guidance with generate-once token and hash_equals\n\nThe CSRF example overwrote $_SESSION[\'csrf\'] on every page load (breaking\nmulti-tab forms), omitted hash_equals for constant-time comparison, and\nused bare htmlspecialchars without ENT_QUOTES | ENT_HTML5, \'UTF-8\'. This\nwas internally inconsistent with the skill\'s own XSS section and the\nkyaulabs-missing-csrf-token Semgrep fixture. Correct the bullets and code\nblock, and add a harness convention test (SecurityCodingSkillTest) that\nmechanically enforces the three correctness primitives.\n\nFixes: #206\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

> *Use the canonical `$'...\n...'` ANSI-C quoting form — see the
> `conventional-commits` skill. The `commit-msg` hook rejects literal `\n`
> sequences (ADR-0025). The `Fixes:` keyword and three footers are validated by
> `commitlint` + the `commit-msg` hook.*

---

## Verification (post-implementation gates, separate from the @tdd task)

After Task 1 is green and committed:

1. **`/check`** — pre-push gate (php-cs-fixer + stylelint + eslint + pest
   `--coverage`). The changed files are outside `<source>`, so the 80%
   changed-file coverage gate has no source intersection; the suite itself must
   be green and cs-fixer clean on the new `.php` file.
2. **`@code-review`** — review the staged diff before push (manual gate; not
   dispatched by this plan).
3. **Skill-structure sanity** — confirm the skill still renders / is still
   loadable by the harness (no frontmatter change was made, so this is a
   no-op check).

## Self-review

- **Spec coverage:** The issue's single acceptance criterion ("The CSRF skill
  uses generate-once + hash_equals + full escape flags") maps to Task 1's
  three assertions + the markdown fix. No gap.
- **Placeholder scan:** None — every step has complete code and exact
  commands.
- **Type consistency:** `security_coding_skill_path()` /
  `security_coding_csrf_section()` are defined and used with identical
  spelling across all three tests. The `hash_equals(`, `ENT_QUOTES |
  ENT_HTML5, 'UTF-8'`, and `empty($_SESSION['csrf'])` literals are identical
  between the test assertions and the corrected code block.
