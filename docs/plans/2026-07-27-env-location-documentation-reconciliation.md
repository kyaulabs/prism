# Repository-Root `.env` Documentation Reconciliation Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make every active application-bootstrap example identify the repository root as the canonical `.env` location for issue #218.

**Architecture:** ADR-0003 defines an explicit, caller-supplied path; the `aurora-page` template implements that decision with `load_env(__DIR__ . '/../.env')` from a page under `<app>/`. Preserve that runtime contract, add a focused documentation-regression assertion to the existing Aurora skill integration test, and correct only the contradictory prose.

**Tech Stack:** PHP 8.5+, Pest PHP v4, Markdown, `.env` template comments

## Global constraints

- Treat ADR-0003 and the `aurora-page` call `load_env(__DIR__ . '/../.env')` as the source of truth: from `<app>/`, it resolves to `<repo>/.env`.
- Aurora does not load `.env` automatically; `backend/env.php::load_env(string $path)` loads only the path supplied by the page bootstrap.
- Do not change `aurora/aurora.inc.php`, `backend/env.php`, ADR-0003, `AGENTS.md`, or `CONTEXT.md`; their active application-`.env` statements are already consistent or location-neutral.
- Do not update unrelated stale text in the Aurora submodule tests; it is outside issue #218's documentation-location acceptance criterion.
- Add no dependencies and make no generated-asset changes.
- Preserve the existing RCS header and final vim modeline in `tests/Integration/AuroraSkillSignatureTest.php`; Markdown and `.env.example` require neither.
- Run the focused Red → Green cycle before the broader test and coverage checks.

## File map and source-of-truth hierarchy

1. `adr/0003-env-delivery-mechanism.md:44-53` — accepted decision: explicit `load_env()` call with a caller-supplied path.
2. `.opencode/skills/aurora-page/SKILL.md:24-31,105-114` — generated page template and operator guidance; the code path is correct, but the prose should name its resolved location.
3. `backend/env.php:149-212` — runtime loader; accepts any path and performs no automatic location discovery.
4. `.env.example:1-6,21` — user-facing setup guidance; currently and incorrectly says the file is in the webroot.
5. `tests/Integration/AuroraSkillSignatureTest.php` — existing drift-prevention seam for the `aurora-page` skill; extend it with the `.env` location invariant.

---

### Task 1: Lock and reconcile the canonical `.env` location

**Files:**
- Modify: `tests/Integration/AuroraSkillSignatureTest.php:97` (insert before the existing vim modeline)
- Modify: `.env.example:3-6,21`
- Modify: `.opencode/skills/aurora-page/SKILL.md:105-110`
- Reference only: `adr/0003-env-delivery-mechanism.md:44-53`
- Reference only: `backend/env.php:149-212`
- Reference only: `aurora/aurora.inc.php`

**Interfaces:**
- Consumes: ADR-0003's explicit call `load_env(__DIR__ . '/../.env')` and the `<app>/` page layout documented by `AGENTS.md`.
- Produces: consistent user guidance that names `<repo>/.env`, plus a Pest regression test that rejects the stale claim that `.env` is present in the webroot.

- [x] **Step 1: Write the failing documentation-contract test**

Insert this test after the existing test closure and before the vim modeline in `tests/Integration/AuroraSkillSignatureTest.php`:

```php
test('aurora-page documentation uses repository-root env location', function () {
    $canonicalCall = "load_env(__DIR__ . '/../.env')";

    $skillPath = __DIR__ . '/../../.opencode/skills/aurora-page/SKILL.md';
    $skillContent = file_get_contents($skillPath);
    expect($skillContent)->not->toBeFalse("Could not read aurora-page SKILL.md at {$skillPath}");
    expect($skillContent)->toContain($canonicalCall);
    expect($skillContent)->toContain('repository-root `.env`');

    $envExamplePath = __DIR__ . '/../../.env.example';
    $envExampleContent = file_get_contents($envExamplePath);
    expect($envExampleContent)->not->toBeFalse("Could not read .env.example at {$envExamplePath}");
    expect($envExampleContent)->toContain('from the repository-root');
    expect($envExampleContent)->toContain('to .env in the repository root');
    expect($envExampleContent)->not->toContain('present in the webroot');
});
```

- [x] **Step 2: Run the focused test and verify Red**

Run:

```bash
php vendor/bin/pest tests/Integration/AuroraSkillSignatureTest.php --filter='repository-root env location'
```

Expected: FAIL because `.env.example` still says `.env` is “present in the webroot,” and neither documentation file yet contains the new explicit repository-root wording.

- [x] **Step 3: Apply the minimal documentation corrections**

Replace `.env.example:3-6` with:

```dotenv
# Loaded explicitly by load_env() at page bootstrap from the repository-root
# .env file. If the file is absent (as in production), load_env() silently
# no-ops, so debug stays off. Server environment variables (FPM env[] or real
# shell env) always win over file values.
```

Replace `.env.example:21` with these two lines:

```dotenv
# Copy this file to .env in the repository root and fill in values. NEVER
# commit .env — it is gitignored.
```

Replace the `load_env()` gotcha at `.opencode/skills/aurora-page/SKILL.md:105-110` with:

```markdown
- *`load_env()` must be called explicitly* — `.env` is not loaded
  automatically. The page template calls `load_env(__DIR__ . '/../.env')`
  after the `require_once` for `backend/env.php`; from an `<app>/` page, this
  resolves to the repository-root `.env`, one directory above the webroot. If
  debug mode isn't activating, verify that: (a) the repository-root `.env`
  exists and is readable, (b) `load_env()` is called before
  `env_bool('APP_DEBUG')`, and (c) the file format follows KEY=VALUE with no
  shell-style `export` prefix.
```

Do not alter the template call itself; it already matches ADR-0003.

- [x] **Step 4: Run the focused test and textual drift checks to verify Green**

Run:

```bash
php vendor/bin/pest tests/Integration/AuroraSkillSignatureTest.php --filter='repository-root env location'
grep -Fq "load_env(__DIR__ . '/../.env')" .opencode/skills/aurora-page/SKILL.md
grep -Fq 'repository-root `.env`' .opencode/skills/aurora-page/SKILL.md
grep -Fq 'from the repository-root' .env.example
! grep -Fq 'present in the webroot' .env.example
```

Expected: the Pest test passes and every grep command exits `0` without output.

- [x] **Step 5: Run broader verification**

Run:

```bash
php vendor/bin/pest tests/Integration/AuroraSkillSignatureTest.php
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: all tests pass and the changed-file coverage gate remains at or above 80%. After @tdd completes, run `/check` and `@code-review` as separate manual gates before pushing.

- [ ] **Step 6: Commit the completed documentation reconciliation**

Resolve the human identity again with `bash .github/scripts/resolve-identity.sh`, confirm it remains `kyau <git@kyaulabs.com>`, then stage only the issue files and present this signed commit for approval:

```bash
git add .env.example .opencode/skills/aurora-page/SKILL.md tests/Integration/AuroraSkillSignatureTest.php
git commit -S -m $'docs(aurora): reconcile repository-root env guidance\n\nFixes: #218\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

Expected: the pre-commit and commit-msg hooks pass, and one `docs(aurora)` commit closes issue #218 when the human later pushes it.

## Self-review

- Issue #218's acceptance criterion is covered by the paired positive assertions for repository-root wording and the negative assertion for the stale webroot claim.
- The canonical path is tested without changing runtime behavior.
- Every modified file has an exact edit and verification command; no placeholders remain.
- ADR-0003, `backend/env.php`, Aurora, `AGENTS.md`, and `CONTEXT.md` remain reference-only.
