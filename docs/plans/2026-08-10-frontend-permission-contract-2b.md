# Frontend Permission Contract Shape 2b Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Repair issue #296 by composing four validated, literal application
PHP/HTML permission leaves into `OPENCODE_CONFIG_CONTENT` and restoring the
ADR-0049 `build` → `@tdd` → `@frontend` route.

**Architecture:** ADR-0051 shape 2b makes `PrismOpenCodeConfig::compose()` the
sole owner of the four dynamic `agent.frontend.permission.edit` leaves. The
tracked frontend agent keeps the fail-closed catch-all and every static source,
generated-asset, terminal, task, web, LSP, and skill rule; OpenCode 1.18.16's
proven deep merge appends the composed literal app rules after those static
rules. `PrismManifest` validates the permission-bearing app segment before
either runtime composition or harness validation can consume it.

**Tech Stack:** PHP 8.5, Pest v4/PHPUnit 12, Bash, Node.js, OpenCode JSONC and
agent Markdown frontmatter.

## Supersession and plan lifecycle

This plan supersedes the untracked shape 2a plan
`docs/plans/2026-08-10-frontend-permission-contract.md`. Shape 2a was rejected
by the OpenCode 1.18.16 compatibility spike because `{env:OPENCODE_APP}` did
not expand in Markdown-frontmatter permission keys. The obsolete untracked
file is removed when this replacement plan is created; there is no historical
blob to preserve with `git rm`. Commit this replacement plan with accepted
ADR-0051, then delete this replacement plan at branch completion under
ADR-0027; Git history remains the canonical archive.

## Global constraints

- ADR-0051 is Accepted and already registered in `CONTEXT.md`; implement it,
  do not re-propose or supersede it.
- The accepted compatibility evidence is sufficient: shape 2b passed against
  OpenCode 1.18.16 with isolated HOME/XDG and `OPENCODE_PURE=1`; the control
  proved shape 2a does not work.
- Never read the real user Prism manifest or any credential file. User-overlay
  coverage uses synthetic fixtures only.
- Preserve the unrelated `.opencode/package.json`,
  `.opencode/package-lock.json`, `pnpm-lock.yaml`, and
  `pnpm-workspace.yaml` changes. Never edit or stage them.
- Do not add `OPENCODE_APP` to `PRISM_ENV_MAP`, env0, `.envrc`, or transport
  documentation. Env0 remains exactly 22 NUL-delimited pairs.
- Do not broaden PHP/HTML access outside the validated app segment, weaken the
  four global frontend-skill denies, or change `@frontend`'s static terminal,
  task, web, external-directory, LSP, credential, or skill rules.
- Permission order is security-sensitive: the tracked catch-all deny remains
  first; static source/generated-asset rules remain ordered; the four composed
  app allows are removed and reinserted at the end of the inline edit map.
- Preserve every unrelated inherited inline key and its relative order,
  including unrelated `agent.frontend.permission.edit` entries. Managed/user
  inline configuration may intentionally override Prism and is not sanitized.
- `.opencode/agents/frontend.md`, the Node checker, runtime composer, and their
  regression tests land in the same implementation commit.
- Let the pre-commit hook normalize RCS headers and preserve existing vim
  modelines.
- No new dependencies, Aurora changes, generated assets, external APIs, or
  setup substitution changes.
- Quit and restart OpenCode after implementation; configuration and agent
  definitions are loaded only at startup.

## File map

- Existing decision artifacts: `adr/0051-runtime-agent-permission-composition.md`
  and `CONTEXT.md`.
- Replace plan: delete the obsolete shape 2a file and create this shape 2b
  file.
- Modify `.github/scripts/PrismManifest.php`: centralize safe app-segment
  validation for project and user tiers.
- Modify `.github/scripts/PrismOpenCodeConfig.php`: own exactly four literal
  frontend edit leaves in addition to the existing MCP/quota ownership.
- Modify `.opencode/agents/frontend.md`: remove only four `<app>` rules.
- Modify `opencode.jsonc`: replace build's denied skill-load instruction with
  `@tdd` → `@frontend` routing.
- Modify `.github/scripts/check-frontend-agent-contract.js`: pin the five-rule
  static frontend edit contract, validate the generated literal scope, reject
  permission placeholders, and guard frontend-skill prompt routing.
- Modify `.github/scripts/validate-harness.sh`: resolve the project app through
  `prism_manifest.php get` and pass it to the checker.
- Modify `tests/Unit/Harness/PrismManifestTest.php`: app validation coverage.
- Modify `tests/Unit/Harness/PrismOpenCodeConfigTest.php`: exact leaves,
  ordering, preservation, malformed ancestors, and secret non-copying.
- Modify `tests/Unit/Harness/PrismManifestCliTest.php`: synthetic user-overlay
  composition, fail-closed app validation, and no-`OPENCODE_APP` guard.
- Modify `tests/Unit/Harness/FrontendPermissionContractTest.php`: adapt the
  debug-authored `<app>` regression to the split static/composed contract.
- Modify `tests/Shell/validate-harness_test.sh`: checker fixture wiring and
  mutation coverage.
- Modify `README.md`, `.opencode/docs/model-configuration.md`, and
  `.opencode/docs/mcp.md`: update stale exclusive MCP/quota ownership wording.
- Modify `CONTEXT.md`: retain the ADR-0051 registration and add the concise
  permission-bearing `app` invariant.
- Deliberately unchanged: `.github/scripts/prism_manifest.php` env maps,
  `prism.jsonc`, `.envrc`, `.opencode/commands/doctor.md`,
  `tests/Shell/prism_envrc_test.sh`,
  `tests/Shell/prism_manifest_integration_test.sh`, and
  `tests/Unit/Harness/PrismManifestDocsTest.php`.

---

### Task 1: Commit the accepted decision and replacement plan

**Files:**
- Create: `adr/0051-runtime-agent-permission-composition.md` (already authored
  and Accepted)
- Modify: `CONTEXT.md`
- Create: `docs/plans/2026-08-10-frontend-permission-contract-2b.md`
- Remove from current tree:
  `docs/plans/2026-08-10-frontend-permission-contract.md` (untracked shape 2a)

**Interfaces:**
- Consumes: accepted ADR-0051 and its OpenCode 1.18.16 spike evidence.
- Produces: the committed architectural authority and executable shape 2b
  plan consumed by Tasks 2–3.

- [ ] **Step 1: Verify decision status, registration, and supersession**

Run:

```bash
grep -q '^Accepted$' adr/0051-runtime-agent-permission-composition.md
grep -q 'adr/0051-runtime-agent-permission-composition.md' CONTEXT.md
```

Expected: all commands exit 0. Do not edit ADR-0051's accepted decision or
compatibility evidence during implementation.

- [ ] **Step 2: Add the missing manifest invariant to `CONTEXT.md`**

Under `### Prism manifest` → `Invariants`, add this domain-level invariant
without changing the existing ADR-0051 registration:

```markdown
- `app` is a permission-bearing project-local webroot segment matching
  `^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$`; project and user tiers reject the
  protected roots `adr`, `aurora`, `backend`, `cdn`, `docs`, `node_modules`,
  `tests`, and `vendor` case-insensitively (ADR-0051).
```

- [ ] **Step 3: Commit only decision and planning artifacts**

Run:

```bash
git add \
  adr/0051-runtime-agent-permission-composition.md \
  CONTEXT.md \
  docs/plans/2026-08-10-frontend-permission-contract-2b.md

SIGNED_OFF_BY=$(bash .github/scripts/resolve-identity.sh)
git commit -S -m $'docs(adr): record runtime frontend permission composition\n\nRefs: #296\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNED_OFF_BY"
```

Expected: one signed documentation commit. The unrelated package/pnpm files
remain unstaged. The replacement plan remains in the branch until ADR-0027
cleanup after implementation, `/check`, and review.

---

### Task 2: Write the complete shape 2b regression surface

**Files:**
- Modify: `tests/Unit/Harness/PrismManifestTest.php`
- Modify: `tests/Unit/Harness/PrismOpenCodeConfigTest.php`
- Modify: `tests/Unit/Harness/PrismManifestCliTest.php`
- Modify: `tests/Unit/Harness/FrontendPermissionContractTest.php`
- Modify: `tests/Shell/validate-harness_test.sh`

**Interfaces:**
- Consumes: `PrismManifest::validateProject()`,
  `PrismManifest::validateUser()`, and
  `PrismOpenCodeConfig::compose(stdClass, ?string): string`.
- Produces: failing tests for safe app validation, literal runtime leaves,
  merge-preserving order, no env export, placeholder rejection, denied skill
  prompts, and build routing.

- [ ] **Step 1: Preserve the original debug reproduction**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/FrontendPermissionContractTest.php
```

Expected: Test A fails because build instructs loading denied
`frontend-design`; Test B fails because `<app>` appears in tracked frontend
edit rules.

- [ ] **Step 2: Add project/user app validation tests**

Add to `tests/Unit/Harness/PrismManifestTest.php`:

```php
it('accepts safe project-local app webroot names', function (string $app): void {
    $manifest = pm_valid_project();
    $manifest->app = $app;

    expect(fn () => PrismManifest::validateProject($manifest))
        ->not->toThrow(PrismJsoncException::class);
})->with(['prism', 'shop-2', 'site_v2', 'portal.example']);

it('rejects unsafe or protected project app webroot names', function (string $app): void {
    $manifest = pm_valid_project();
    $manifest->app = $app;

    expect(fn () => PrismManifest::validateProject($manifest))
        ->toThrow(PrismJsoncException::class, 'field app must be a safe project-local webroot name');
})->with([
    '../backend',
    'foo/bar',
    '<app>',
    '{env:HOME}',
    ' backend',
    str_repeat('a', 256),
    'adr',
    'aurora',
    'backend',
    'Backend',
    'cdn',
    'docs',
    'node_modules',
    'tests',
    'vendor',
]);

it('rejects unsafe or protected user app overrides', function (string $app): void {
    $user = (object) ['setup_version' => 6, 'app' => $app];

    expect(fn () => PrismManifest::validateUser($user))
        ->toThrow(PrismJsoncException::class, 'field app must be a safe project-local webroot name');
})->with(['../backend', 'backend', 'Backend', 'cdn', 'tests', 'vendor']);
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php
```

Expected: new malformed/protected app cases fail.

- [ ] **Step 3: Update every composer fixture with a validated app**

In `tests/Unit/Harness/PrismOpenCodeConfigTest.php`, add
`'app' => 'prism'` to every synthetic resolved manifest passed to
`compose()`. Replace each `(object) []` input with:

```php
(object) ['app' => 'prism']
```

Keep every existing MCP, quota, malformed-inline, determinism, and secret
assertion. This reflects the public contract: `compose()` receives a complete,
validated resolved manifest.

- [ ] **Step 4: Add exact runtime-composition tests**

Add these tests to `tests/Unit/Harness/PrismOpenCodeConfigTest.php`:

```php
it('composes exactly four literal app-scoped frontend edit leaves', function (): void {
    $config = json_decode(
        PrismOpenCodeConfig::compose((object) ['app' => 'customer-portal'], null),
        false,
        64,
        JSON_THROW_ON_ERROR,
    );

    expect(get_object_vars($config->agent->frontend->permission->edit))->toBe([
        'customer-portal/*.php' => 'allow',
        'customer-portal/**/*.php' => 'allow',
        'customer-portal/*.html' => 'allow',
        'customer-portal/**/*.html' => 'allow',
    ]);
});

it('preserves unrelated frontend edit keys and reinserts owned leaves last', function (): void {
    $base = json_encode([
        'agent' => [
            'frontend' => [
                'description' => 'keep',
                'permission' => [
                    'edit' => [
                        'prism/*.php' => 'deny',
                        '*' => 'deny',
                        'custom/canary/**' => 'ask',
                        'prism/**/*.php' => 'deny',
                        'prism/*.html' => 'deny',
                        'prism/**/*.html' => 'deny',
                    ],
                ],
            ],
            'review' => ['temperature' => 0.1],
        ],
    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

    $config = json_decode(
        PrismOpenCodeConfig::compose((object) ['app' => 'prism'], $base),
        false,
        64,
        JSON_THROW_ON_ERROR,
    );

    expect($config->agent->frontend->description)->toBe('keep')
        ->and($config->agent->review->temperature)->toBe(0.1)
        ->and(get_object_vars($config->agent->frontend->permission->edit))->toBe([
            '*' => 'deny',
            'custom/canary/**' => 'ask',
            'prism/*.php' => 'allow',
            'prism/**/*.php' => 'allow',
            'prism/*.html' => 'allow',
            'prism/**/*.html' => 'allow',
        ]);
});

it('fails closed when app is absent or an inline permission ancestor is incompatible', function (\stdClass $resolved, ?string $base): void {
    expect(fn () => PrismOpenCodeConfig::compose($resolved, $base))
        ->toThrow(PrismJsoncException::class);
})->with([
    'missing app' => [(object) [], null],
    'non-object agent' => [(object) ['app' => 'prism'], '{"agent":false}'],
    'non-object frontend' => [(object) ['app' => 'prism'], '{"agent":{"frontend":[]}}'],
    'non-object permission' => [(object) ['app' => 'prism'], '{"agent":{"frontend":{"permission":false}}}'],
    'non-object edit' => [(object) ['app' => 'prism'], '{"agent":{"frontend":{"permission":{"edit":false}}}}'],
]);

it('does not copy resolved secret canaries into composed frontend permissions', function (): void {
    $json = PrismOpenCodeConfig::compose((object) [
        'app' => 'prism',
        'env' => (object) ['deepseek_api_key' => 'CANARY-SECRET'],
    ], null);

    expect($json)->not->toContain('CANARY-SECRET');
});
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismOpenCodeConfigTest.php
```

Expected: exact-leaf, ordering, and missing-app cases fail because runtime
frontend composition does not exist yet.

- [ ] **Step 5: Add resolved user-overlay and no-env-export tests**

Add to `tests/Unit/Harness/PrismManifestCliTest.php`:

```php
it('composes frontend edit leaves from the validated resolved user app without exporting OPENCODE_APP', function (): void {
    $project = pm_fixture(pm_valid_project_jsonc());
    $user = pm_fixture('{ "setup_version": 6, "app": "customer-portal" }');

    try {
        [$code, $stdout, $stderr] = pm_dispatch(['env0', $project, $user]);
        $parts = pm_parse_nul_pairs($stdout);
        $pairs = [];
        for ($i = 0; $i < count($parts); $i += 2) {
            $pairs[$parts[$i]] = $parts[$i + 1];
        }

        $inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);

        expect($code)->toBe(0)
            ->and($stderr)->toBe('')
            ->and($pairs)->toHaveCount(22)
            ->and($pairs)->not->toHaveKey('OPENCODE_APP')
            ->and(get_object_vars($inline->agent->frontend->permission->edit))->toBe([
                'customer-portal/*.php' => 'allow',
                'customer-portal/**/*.php' => 'allow',
                'customer-portal/*.html' => 'allow',
                'customer-portal/**/*.html' => 'allow',
            ]);
    } finally {
        pm_clean($project);
        pm_clean($user);
    }
});

it('get fails closed before returning an unsafe project or user app', function (string $projectJson, string $userJson): void {
    $project = pm_fixture($projectJson);
    $user = $userJson === '-' ? null : pm_fixture($userJson);

    try {
        [$code, $stdout] = pm_dispatch(['get', $project, $user ?? '-', 'app']);

        expect($code)->toBe(1)
            ->and($stdout)->toBe('');
    } finally {
        pm_clean($project);
        if ($user !== null) {
            pm_clean($user);
        }
    }
})->with([
    'unsafe project app' => [
        str_replace('"app": "prism"', '"app": "../backend"', pm_valid_project_jsonc()),
        '-',
    ],
    'protected user app' => [
        pm_valid_project_jsonc(),
        '{ "setup_version": 6, "app": "backend" }',
    ],
]);
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestCliTest.php
```

Expected: user-overlay composition fails; unsafe `get` cases fail until
manifest validation is tightened. Existing 22-pair assertions stay unchanged.

- [ ] **Step 6: Adapt the debug-authored split-contract test**

In `tests/Unit/Harness/FrontendPermissionContractTest.php`, require
`PrismManifest.php` and `PrismOpenCodeConfig.php`, import
`PrismManifest`/`PrismOpenCodeConfig`, and add this helper:

```php
/**
 * Resolve a last-match-wins permission verdict for one path.
 *
 * @param  array<string, string> $rules
 * @param  string                $path
 * @return string|null
 */
function frontend_edit_verdict(array $rules, string $path): ?string
{
    $verdict = null;
    foreach ($rules as $pattern => $action) {
        if (fnmatch($pattern, $path)) {
            $verdict = $action;
        }
    }

    return $verdict;
}
```

Replace Test B with:

```php
it('frontend edit permissions split static containment from composed app scope', function () {
    $sourcePairs = frontmatter_edit_rules(agent_frontmatter('frontend'));
    $source = [];
    foreach ($sourcePairs as [$pattern, $verdict]) {
        $source[$pattern] = $verdict;
    }

    Assert::assertSame([
        '*' => 'deny',
        'cdn/sass/**' => 'allow',
        'cdn/js/**' => 'allow',
        'cdn/css/**' => 'deny',
        'cdn/javascript/**' => 'deny',
    ], $source);

    foreach (array_keys($source) as $pattern) {
        Assert::assertDoesNotMatchRegularExpression('/<[^>]+>|\{(?:env|file):[^}]+\}/', $pattern);
    }

    $root = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/prism.jsonc')->root();
    PrismManifest::validateProject($root);
    $inline = json_decode(
        PrismOpenCodeConfig::compose($root, null),
        true,
        64,
        JSON_THROW_ON_ERROR,
    );
    $composed = $inline['agent']['frontend']['permission']['edit'];

    Assert::assertSame([
        'prism/*.php' => 'allow',
        'prism/**/*.php' => 'allow',
        'prism/*.html' => 'allow',
        'prism/**/*.html' => 'allow',
    ], $composed);

    $effective = array_merge($source, $composed);
    Assert::assertSame([
        '*',
        'cdn/sass/**',
        'cdn/js/**',
        'cdn/css/**',
        'cdn/javascript/**',
        'prism/*.php',
        'prism/**/*.php',
        'prism/*.html',
        'prism/**/*.html',
    ], array_keys($effective));

    foreach (['prism/index.php', 'prism/pages/home.php', 'prism/index.html', 'prism/pages/home.html'] as $path) {
        Assert::assertSame('allow', frontend_edit_verdict($effective, $path), "expected frontend edit allow for {$path}");
    }
    foreach (['backend/index.php', 'tests/Feature/HomeTest.php', 'aurora/index.php', 'vendor/index.php'] as $path) {
        Assert::assertSame('deny', frontend_edit_verdict($effective, $path), "expected frontend edit deny for {$path}");
    }
});
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/FrontendPermissionContractTest.php
```

Expected: both tests remain red until build routing, static-rule removal, and
runtime composition land together.

- [ ] **Step 7: Specify the checker mutations before implementation**

In `tests/Shell/validate-harness_test.sh`, update `setup_validator_env()` to
copy these production dependencies into fixture `.github/scripts/`:

```bash
cp "$REPO_ROOT/.github/scripts/prism_manifest.php" .github/scripts/
cp "$REPO_ROOT/.github/scripts/PrismManifest.php" .github/scripts/
cp "$REPO_ROOT/.github/scripts/PrismJsoncDocument.php" .github/scripts/
cp "$REPO_ROOT/.github/scripts/PrismJsoncException.php" .github/scripts/
cp "$REPO_ROOT/.github/scripts/PrismOpenCodeConfig.php" .github/scripts/
```

Add `prism` as the final argument to both direct checker calls. Add four
non-vacuous mutation cases using the suite's existing temp-repo pattern:

1. Insert `"<app>/*.php": allow` after the frontend catch-all and require
   `frontend-contract: permission patterns must not contain unresolved template tokens`.
2. Replace the build route with `load the frontend-design skill first` and
   require `frontend-contract: agent prompts must not instruct loading frontend skills denied by effective permissions`.
3. Remove `@frontend` from the build handoff and require
   `frontend-contract: build prompt must route frontend work through @tdd → @frontend`.
4. Invoke the checker directly with protected app argument `backend` and
   require `frontend-contract: configured app must be a safe project-local webroot name`.

Each case must assert its mutation was applied before invoking the checker or
validator, then require nonzero exit plus the exact diagnostic.

Run:

```bash
bash tests/Shell/validate-harness_test.sh
```

Expected: the newly added cases fail because the checker has no app argument,
template scan, prompt guard, or route guard yet.

---

### Task 3: Implement shape 2b and return the full suite to green

**Files:**
- Modify: `.github/scripts/PrismManifest.php`
- Modify: `.github/scripts/PrismOpenCodeConfig.php`
- Modify: `.opencode/agents/frontend.md`
- Modify: `opencode.jsonc`
- Modify: `.github/scripts/check-frontend-agent-contract.js`
- Modify: `.github/scripts/validate-harness.sh`
- Modify: `tests/Unit/Harness/PrismManifestTest.php`
- Modify: `tests/Unit/Harness/PrismOpenCodeConfigTest.php`
- Modify: `tests/Unit/Harness/PrismManifestCliTest.php`
- Modify: `tests/Unit/Harness/FrontendPermissionContractTest.php`
- Modify: `tests/Shell/validate-harness_test.sh`
- Modify: `README.md`
- Modify: `.opencode/docs/model-configuration.md`
- Modify: `.opencode/docs/mcp.md`

**Interfaces:**
- Consumes: accepted ADR-0051 and a validated resolved `app` string.
- Produces: deterministic composed JSON containing exactly four literal
  `agent.frontend.permission.edit` leaves and a fail-closed static/runtime
  contract checker.

- [ ] **Step 1: Centralize permission-bearing app validation**

Add beside the existing `PrismManifest` allowlist constants:

```php
/** @var list<string> */
private const array PROTECTED_APP_ROOTS = [
    'adr',
    'aurora',
    'backend',
    'cdn',
    'docs',
    'node_modules',
    'tests',
    'vendor',
];
```

In `validateProject()`, validate `app` separately, then leave the remaining
required strings in their current loop:

```php
self::requireAppName($manifest);

foreach (['domain', 'repo', 'signed_off_by_name', 'signed_off_by_email'] as $field) {
    self::requireNonEmptyString($manifest, $field);
}
```

In `validateUser()`, use the optional counterpart:

```php
self::optionalAppName($manifest);

foreach (['domain', 'repo', 'signed_off_by_name', 'signed_off_by_email'] as $field) {
    self::optionalNonEmptyString($manifest, $field);
}
```

Add these helpers with full PHPDoc beside the required/optional field helpers:

```php
/**
 * Require app to be a safe, non-protected project-local webroot segment.
 *
 * @param  \stdClass $manifest
 * @return void
 * @throws PrismJsoncException
 */
private static function requireAppName(\stdClass $manifest): void
{
    if (!property_exists($manifest, 'app')) {
        throw new PrismJsoncException('missing required field: app');
    }

    self::guardAppName($manifest->app);
}

/**
 * Validate a present app webroot segment; no-op when absent.
 *
 * @param  \stdClass $manifest
 * @return void
 * @throws PrismJsoncException
 */
private static function optionalAppName(\stdClass $manifest): void
{
    if (property_exists($manifest, 'app')) {
        self::guardAppName($manifest->app);
    }
}

/**
 * Guard the permission-bearing application webroot name.
 *
 * @param  mixed $value
 * @return void
 * @throws PrismJsoncException
 */
private static function guardAppName(mixed $value): void
{
    if (
        !is_string($value)
        || preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,254}\z/', $value) !== 1
        || in_array(strtolower($value), self::PROTECTED_APP_ROOTS, true)
    ) {
        throw new PrismJsoncException('field app must be a safe project-local webroot name');
    }
}
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php
```

Expected: PASS for project and user safe/malformed/protected datasets.

- [ ] **Step 2: Compose exactly four literal frontend edit leaves**

Update `PrismOpenCodeConfig`'s class docblock to state ownership of the two MCP
`enabled` leaves, quota plugin membership, and exactly four literal
`agent.frontend.permission.edit` leaves while preserving every unrelated key.

Add this constant:

```php
/** @var list<string> */
private const array FRONTEND_EDIT_SUFFIXES = [
    '/*.php',
    '/**/*.php',
    '/*.html',
    '/**/*.html',
];
```

In `compose()`, after setting MCP leaves and before quota handling, add:

```php
self::applyFrontendEditRules(
    $config,
    self::requiredNonEmptyStringPath($resolved, 'app'),
);
```

Add these methods before `applyQuota()`:

```php
/**
 * Resolve a required non-empty manifest string.
 *
 * @param  \stdClass $root
 * @param  string    $path
 * @return string
 * @throws PrismJsoncException
 */
private static function requiredNonEmptyStringPath(\stdClass $root, string $path): string
{
    $value = self::path($root, $path);

    if (!is_string($value) || $value === '') {
        throw new PrismJsoncException('manifest field ' . $path . ' must be a non-empty string');
    }

    return $value;
}

/**
 * Append the four owned literal app edit leaves after inherited edit rules.
 *
 * Existing copies of the owned leaves are removed first so catch-all or other
 * inherited rules cannot remain after them. Every unrelated key keeps its
 * value and relative order.
 *
 * @param  \stdClass $config
 * @param  string    $app
 * @return void
 * @throws PrismJsoncException
 */
private static function applyFrontendEditRules(\stdClass $config, string $app): void
{
    $agent = self::objectProperty($config, 'agent', 'agent');
    $frontend = self::objectProperty($agent, 'frontend', 'agent.frontend');
    $permission = self::objectProperty($frontend, 'permission', 'agent.frontend.permission');
    $edit = self::objectProperty($permission, 'edit', 'agent.frontend.permission.edit');

    foreach (self::FRONTEND_EDIT_SUFFIXES as $suffix) {
        unset($edit->{$app . $suffix});
    }
    foreach (self::FRONTEND_EDIT_SUFFIXES as $suffix) {
        $edit->{$app . $suffix} = 'allow';
    }
}
```

Do not change `PRISM_ENV_MAP` or any env0 cardinality/comment. The validated
resolved manifest already reaches `compose()` through `pm_env_pairs()`.

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismOpenCodeConfigTest.php tests/Unit/Harness/PrismManifestCliTest.php
```

Expected: PASS for exact literal leaves, user overlay, inherited-key order,
malformed ancestors, secret non-copying, and unchanged 22-pair transport.

- [ ] **Step 3: Remove dead static placeholders and fix build routing**

Replace `.opencode/agents/frontend.md`'s edit block with exactly:

```yaml
  edit:
    "*": deny
    "cdn/sass/**": allow
    "cdn/js/**": allow
    "cdn/css/**": deny
    "cdn/javascript/**": deny
```

Do not alter any line outside the four removed `<app>` entries.

In `opencode.jsonc`, replace only the stale frontend bullet with:

```text
- Frontend visual work → route through @tdd → @frontend; @frontend solely owns frontend-design, frontend-architecture, scss-mobile-first, and accessibility, so build must never load those skills directly.
```

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/FrontendPermissionContractTest.php
```

Expected: PASS. Test A sees no denied skill-load instruction; Test B sees the
five static containment rules followed by the four composed literal app rules.

- [ ] **Step 4: Harden the Node checker for the split contract**

Change `editRules` to the five static Markdown rules:

```javascript
const editRules = [
	['*', 'deny'],
	['cdn/sass/**', 'allow'],
	['cdn/js/**', 'allow'],
	['cdn/css/**', 'deny'],
	['cdn/javascript/**', 'deny'],
];
```

Add a sixth CLI argument `app` and update both usage strings to:

```text
node check-frontend-agent-contract.js <opencode.jsonc> <frontend.md> <tdd.md> <skills-root> <app>
```

Add these constants/helpers before argument parsing:

```javascript
const protectedAppRoots = new Set([
	'adr', 'aurora', 'backend', 'cdn', 'docs', 'node_modules', 'tests', 'vendor',
]);

function isSafeAppName(value) {
	return typeof value === 'string'
		&& /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(value)
		&& !protectedAppRoots.has(value.toLowerCase());
}

function appEditRules(app) {
	return [
		[`${app}/*.php`, 'allow'],
		[`${app}/**/*.php`, 'allow'],
		[`${app}/*.html`, 'allow'],
		[`${app}/**/*.html`, 'allow'],
	];
}

function globMatches(pattern, value) {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`).test(value);
}

function permissionVerdict(rules, value) {
	let verdict = null;
	if (!rules || typeof rules !== 'object') return verdict;
	for (const [pattern, action] of Object.entries(rules)) {
		if (globMatches(pattern, value)) verdict = action;
	}
	return verdict;
}

function entryVerdict(entries, value) {
	let verdict = null;
	for (const [pattern, action] of entries) {
		if (globMatches(pattern, value)) verdict = action;
	}
	return verdict;
}

function effectiveSkillPermission(config, agentName, skillName) {
	const globalVerdict = permissionVerdict(config.permission && config.permission.skill, skillName);
	const agent = config.agent && config.agent[agentName];
	const agentVerdict = permissionVerdict(agent && agent.permission && agent.permission.skill, skillName);
	return agentVerdict === null ? globalVerdict : agentVerdict;
}

function collectTemplateViolations(permission, owner, output) {
	if (!permission || typeof permission !== 'object') return;
	for (const [tool, rules] of Object.entries(permission)) {
		if (!rules || typeof rules !== 'object' || Array.isArray(rules)) continue;
		for (const pattern of Object.keys(rules)) {
			if (/<[^>]+>|\{(?:env|file):[^}]+\}/.test(pattern)) {
				output.push(`${owner}.${tool}:${pattern}`);
			}
		}
	}
}

function deniedFrontendPromptLoads(config, frontendSkills) {
	const found = [];
	for (const [agentName, agent] of Object.entries(config.agent || {})) {
		const prompt = typeof agent.prompt === 'string' ? agent.prompt : '';
		const pattern = /\bload(?:\s+the)?\s+([a-z0-9-]+)\s+skill\b/gi;
		for (const match of prompt.matchAll(pattern)) {
			const skillName = match[1].toLowerCase();
			if (frontendSkills.includes(skillName)
				&& effectiveSkillPermission(config, agentName, skillName) !== 'allow') {
				found.push(`${agentName}:${skillName}`);
			}
		}
	}
	return found;
}
```

After parsing inputs, collect placeholders from global config, every inline
agent permission, `tdd.md`, and `frontend.md`; generate the effective edit
rules and scope checks:

```javascript
const templateViolations = [];
collectTemplateViolations(cfg && cfg.permission, 'global', templateViolations);
for (const [name, agent] of Object.entries((cfg && cfg.agent) || {})) {
	collectTemplateViolations(agent.permission, `agent.${name}`, templateViolations);
}
collectTemplateViolations(tdd && tdd.permission, 'agent.tdd', templateViolations);
collectTemplateViolations(frontend && frontend.permission, 'agent.frontend', templateViolations);

const promptLoads = cfg !== null && frontendSkills !== null
	? deniedFrontendPromptLoads(cfg, frontendSkills)
	: [];
const buildPrompt = cfg && cfg.agent && cfg.agent.build && cfg.agent.build.prompt;
const effectiveEditRules = isSafeAppName(app)
	? [...editRules, ...appEditRules(app)]
	: [];
const appScopeHolds = isSafeAppName(app)
	&& [
		`${app}/index.php`,
		`${app}/pages/home.php`,
		`${app}/index.html`,
		`${app}/pages/home.html`,
	].every((candidate) => entryVerdict(effectiveEditRules, candidate) === 'allow')
	&& [
		'backend/index.php',
		'tests/Feature/HomeTest.php',
		'aurora/index.php',
		'vendor/index.php',
	].every((candidate) => entryVerdict(effectiveEditRules, candidate) === 'deny');
```

Add these stable clauses while retaining the existing `@tdd` frontend-only
task-route and all nine original containment clauses:

```javascript
{ enabled: true, ok: isSafeAppName(app), message: 'configured app must be a safe project-local webroot name' },
{ enabled: true, ok: templateViolations.length === 0, message: 'permission patterns must not contain unresolved template tokens' },
{ enabled: frontend !== null && isSafeAppName(app), ok: appScopeHolds, message: '@frontend composed edit rules must resolve to the configured app scope' },
{ enabled: cfg !== null && frontendSkills !== null, ok: promptLoads.length === 0, message: 'agent prompts must not instruct loading frontend skills denied by effective permissions' },
{ enabled: typeof buildPrompt === 'string', ok: /@tdd\s*(?:→|->)\s*@frontend/.test(buildPrompt), message: 'build prompt must route frontend work through @tdd → @frontend' },
```

The raw ordered edit clause continues to require exact equality with the five
tracked `.md` rules. Do not add static `agent.frontend.permission` to
`opencode.jsonc`; its exact-record checker clause must continue rejecting that
drift because runtime composition is the sole dynamic channel.

- [ ] **Step 5: Resolve the checker app through the PHP manifest boundary**

In `.github/scripts/validate-harness.sh`, add:

```bash
PRISM_MANIFEST_CLI="${REPO_ROOT}/.github/scripts/prism_manifest.php"
```

beside `PRISM_MANIFEST`, then replace the checker invocation block with:

```bash
if [ -f "$PRISM_MANIFEST" ] && grep -q '"frontend"' "$PRISM_MANIFEST"; then
	if [ -f "$FRONTEND_CONTRACT" ] && [ -f "$OPENCODE_JSONC" ] \
		&& [ -f "$FRONTEND_AGENT" ] && [ -f "$TDD_AGENT" ] \
		&& [ -f "$PRISM_MANIFEST_CLI" ]; then
		if ! FRONTEND_APP=$(php "$PRISM_MANIFEST_CLI" get "$PRISM_MANIFEST" - app 2>/dev/null); then
			err "frontend-contract: cannot resolve a validated app from prism.jsonc"
		else
			contract_output=''
			if ! contract_output=$(node "$FRONTEND_CONTRACT" "$OPENCODE_JSONC" "$FRONTEND_AGENT" "$TDD_AGENT" "$FRONTEND_SKILLS" "$FRONTEND_APP" 2>&1); then
				while IFS= read -r line; do
					[ -n "$line" ] && err "$line"
				done <<< "$contract_output"
			fi
		fi
	else
		err "frontend-contract: checker and agent inputs must all exist"
	fi
fi
```

This repository checker intentionally resolves only the project manifest with
`-`; synthetic CLI tests cover validated user overlay without reading the real
user manifest.

Run:

```bash
node .github/scripts/check-frontend-agent-contract.js opencode.jsonc .opencode/agents/frontend.md .opencode/agents/tdd.md .opencode/skills prism
bash tests/Shell/validate-harness_test.sh
bash .github/scripts/validate-harness.sh
```

Expected: the direct checker and real validator exit 0; all mutation tests
pass by observing the exact fail-closed diagnostics.

- [ ] **Step 6: Correct living composition-ownership documentation**

Apply these exact semantic changes without modifying historical ADR-0045 or
the accepted ADR-0051:

- `README.md:393-396`: Prism preserves unrelated inline config while owning
  two MCP `enabled` leaves, quota membership, and four literal
  `agent.frontend.permission.edit` leaves; cite ADR-0045 and ADR-0051.
- `.opencode/docs/model-configuration.md:67-70` and `:177-180`: make the same
  ownership statement and retain the unrelated-key preservation guarantee.
- `.opencode/docs/mcp.md:120-128`: qualify the statement as the MCP/plugin
  portion of the composed config, while noting that ADR-0051 separately owns
  four frontend edit leaves. Do not change env0 counts or key-flow behavior.
- `PrismOpenCodeConfig.php:14-23`: update the class docblock consistently.

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php
```

Expected: PASS; active documentation still describes exactly 22 env0 pairs
and contains no shape 2a `OPENCODE_APP` export.

- [ ] **Step 7: Run focused and full verification**

Run in order:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php
php vendor/bin/pest tests/Unit/Harness/PrismOpenCodeConfigTest.php
php vendor/bin/pest tests/Unit/Harness/PrismManifestCliTest.php
php vendor/bin/pest tests/Unit/Harness/FrontendPermissionContractTest.php
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php tests/Unit/Harness/ModelConfigTest.php
bash tests/Shell/validate-harness_test.sh
bash .github/scripts/validate-harness.sh
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: every command exits 0 and the changed PHP files satisfy the 80%
changed-file line-coverage gate. Then run the separate human `/check` gate and
`@code-review`; focused tests alone are not completion evidence.

Confirm shape 2a did not re-enter the implementation:

```bash
grep -R "OPENCODE_APP" .github/scripts prism.jsonc .envrc .opencode/agents/frontend.md || true
grep -R '"<app>/.*\.\(php\|html\)' .opencode/agents/frontend.md || true
```

Expected: no output. ADR-0051 and this plan may name rejected `OPENCODE_APP`
for historical/design context; production/runtime paths must not.

Confirm unrelated files are unstaged:

```bash
git diff --cached --name-only -- .opencode/package.json .opencode/package-lock.json pnpm-lock.yaml pnpm-workspace.yaml
git status --short -- .opencode/package.json .opencode/package-lock.json pnpm-lock.yaml pnpm-workspace.yaml
```

Expected: the first command emits nothing; the second still reflects only the
pre-existing unrelated state.

- [ ] **Step 8: Stage only shape 2b implementation files and commit atomically**

Run:

```bash
git add \
  .github/scripts/PrismManifest.php \
  .github/scripts/PrismOpenCodeConfig.php \
  .opencode/agents/frontend.md \
  opencode.jsonc \
  .github/scripts/check-frontend-agent-contract.js \
  .github/scripts/validate-harness.sh \
  tests/Unit/Harness/PrismManifestTest.php \
  tests/Unit/Harness/PrismOpenCodeConfigTest.php \
  tests/Unit/Harness/PrismManifestCliTest.php \
  tests/Unit/Harness/FrontendPermissionContractTest.php \
  tests/Shell/validate-harness_test.sh \
  README.md \
  .opencode/docs/model-configuration.md \
  .opencode/docs/mcp.md

SIGNED_OFF_BY=$(bash .github/scripts/resolve-identity.sh)
git commit -S -m $'fix(frontend): compose app-scoped agent permissions\n\nFixes: #296\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNED_OFF_BY"
```

Expected: one signed implementation commit containing the runtime composer,
manifest guard, static agent change, checker, tests, and living docs. The
frontend agent and Node checker are inseparable in this commit. Never amend a
failed commit attempt; fix the hook failure and retry `git commit`.

## Branch-completion cleanup

After Task 3 is green, `/check` passes, and `@code-review` is clean, follow
ADR-0027 through `finishing-a-development-branch`:

```bash
git rm docs/plans/2026-08-10-frontend-permission-contract-2b.md
```

Commit that lifecycle cleanup before preparing the PR. Do not delete accepted
ADR-0051 or its `CONTEXT.md` registration/invariant.

## Architecture decision outcome

- ADR-0051 already authorizes shape 2b and records the OpenCode 1.18.16 merge
  evidence; no additional ADR or prototype is required.
- `CONTEXT.md` needs only the concise `app` invariant; no glossary term or new
  entity is introduced.
- `ADR-required: none`.

## Self-review

- The plan covers both issue regressions, the checker blind spot, runtime
  composition, project/user validation, user overlay, no-env-export, inherited
  config preservation, malformed ancestors, exact ordering, secret canaries,
  living ownership docs, and restart behavior.
- Shape 2a production paths and env0 changes are explicitly excluded.
- All production functions, helper names, test inputs, diagnostics, commands,
  file paths, and commit footers are defined consistently.
- Unrelated package/pnpm changes are excluded from every staging command.
