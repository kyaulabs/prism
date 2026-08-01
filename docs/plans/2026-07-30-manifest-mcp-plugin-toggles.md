# Manifest-Driven MCP and Quota Plugin Toggles Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Let `/setup` store per-user opt-ins for two MCP servers and the quota plugin while every tracked default remains off and the repository stays clean.

**Architecture:** Schema-v5 project and user Prism manifests gain optional Boolean `mcp.*` and `plugins.*` preferences. The PHP manifest boundary composes those resolved preferences with any inherited `OPENCODE_CONFIG_CONTENT`, owns only two MCP `enabled` leaves and quota-package membership, and emits deterministic JSON through the existing NUL-delimited `.envrc` transport. The tracked OpenCode config permanently defines disabled MCP servers and no longer statically loads quota.

**Tech Stack:** PHP 8.5, JSONC, Bash, jq, direnv, OpenCode JSON configuration, Pest v4/PHPUnit 12.

## Global constraints

- Issue classification is Feature; use `feat` branches/commits for behavior and `docs`/`test` where appropriate. Reference issue `#279`.
- The approved spec is `docs/specs/2026-07-30-manifest-mcp-plugin-toggles-spec.md`.
- Architect verdict is GO-WITH-CONDITIONS; `ADR-required: 0045`.
- Keep `setup_version` at exactly `5`; missing `mcp`/`plugins` sections are compatible and resolve to all-off behavior.
- Tracked defaults are exactly `mcp.deepseek_websearch=false`, `mcp.searxng=false`, and `plugins.opencode_quota=false`.
- `/setup` writes personal toggle answers only to `~/.config/opencode/prism.jsonc`; it must not materialize unrelated resolved identity/model/variant values during a toggle-only write.
- MCP activation is preference AND non-empty prerequisite; never put a key or URL in `OPENCODE_CONFIG_CONTENT` or diagnostics.
- Preserve unrelated inherited inline config and plugin entries; malformed/incompatible input fails closed.
- Keep `.opencode/plugins/pre-tool-use.ts`, `session-bootstrap.ts`, and `denial-circuit-breaker.ts` outside the toggle surface.
- Keep `@slkiser/opencode-quota` pinned at `4.0.1`; add no dependency and do not regenerate either lockfile.
- Automated tests must not access the network, install packages, or start an MCP process.
- Load `rcs-header` before creating or modifying source/test files. New PHP and shell files require the RCS header and vim modeline.
- Changed PHP files require at least 80% line coverage.
- Plans and specs are development artifacts; retain them during implementation and delete them only when finishing the branch per ADR-0027.

---

### Task 1: Record the architecture boundary

**Files:**
- Create: `adr/0045-manifest-driven-mcp-plugin-toggles.md`
- Modify: `adr/0032-mcp-server-onboarding.md:5-12`
- Modify: `CONTEXT.md:151-199`
- Modify: `tests/Unit/Harness/PrismManifestDocsTest.php`

**Interfaces:**
- Consumes: ADR-0032's MCP onboarding decision and ADR-0043's Prism manifest boundary.
- Produces: accepted ADR-0045 and the `ADR-required: 0045` architectural contract used by every later task.

- [ ] **Step 1: Write the failing ADR contract test**

Add this test to `PrismManifestDocsTest.php`:

```php
it('records the manifest-driven integration boundary in ADR-0045', function (): void {
    $root = dirname(__DIR__, 3);
    $path = $root . '/adr/0045-manifest-driven-mcp-plugin-toggles.md';

    Assert::assertFileExists($path);
    $adr = (string) file_get_contents($path);
    $context = (string) file_get_contents($root . '/CONTEXT.md');

    foreach ([
        '## Status',
        'Accepted',
        'OPENCODE_CONFIG_CONTENT',
        'setup_version',
        'deepseek_websearch',
        'searxng',
        'opencode_quota',
        'ADR-0032',
        'ADR-0043',
        'ADR-0040',
    ] as $required) {
        Assert::assertStringContainsString($required, $adr);
    }

    Assert::assertStringContainsString(
        'adr/0045-manifest-driven-mcp-plugin-toggles.md',
        $context,
    );
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php --filter='ADR-0045'
```

Expected: FAIL because `adr/0045-manifest-driven-mcp-plugin-toggles.md` does not exist.

- [ ] **Step 3: Write ADR-0045 and update ADR-0032 status**

Use `adr/0000-template.md`. Set ADR-0045 to `Accepted` and record these exact decisions:

```markdown
# 0045. Manifest-Driven MCP and Quota Plugin Toggles

Date: 2026-07-30

## Status

Accepted

Supersedes ADR-0032's commented-block enablement mechanism, extends
ADR-0043's schema-v5 Prism manifest boundary, and qualifies ADR-0040's
assumption that quota visibility is enabled by default.

## Context

Optional MCP and quota integration preferences are personal, but enabling an
MCP currently requires a tracked `opencode.jsonc` edit and quota currently
loads for every user. ADR-0043 provides project/user JSONC manifests and a
fail-closed PHP resolution boundary. OpenCode provides
`OPENCODE_CONFIG_CONTENT` as its highest-priority inline configuration source.

## Decision

We add optional Boolean `mcp.deepseek_websearch`, `mcp.searxng`, and
`plugins.opencode_quota` preferences to schema v5. Missing values and shipped
project defaults are false. `/setup` writes answers only to the user Prism
manifest.

The Prism PHP boundary composes an inherited `OPENCODE_CONFIG_CONTENT` object,
preserving unrelated keys and plugin entries while replacing the two owned MCP
`enabled` leaves and adding or removing only `@slkiser/opencode-quota`.
Malformed or incompatible input fails closed. MCP activation additionally
requires its resolved key or URL; secrets remain in environment variables and
never enter inline JSON.

Tracked `opencode.jsonc` permanently defines both MCP servers with
`enabled: false` and omits a static quota plugin entry. Local enforcement
plugins remain convention-loaded and cannot be toggled.

## Consequences

- Personal choices no longer dirty tracked configuration.
- Quota changes from on-by-default to installed-but-not-loaded by default.
- Existing schema-v5 manifests need no migration; absent fields are false.
- Users run `direnv allow` and restart OpenCode after changing preferences.
- The PHP boundary owns composition and must preserve unrelated inline config.
- Tests require isolated resolved-config probes and may not start MCPs or use
  the network.

## Alternatives Considered

- Direct environment substitution into Boolean config fields was rejected
  because OpenCode environment substitution is string-oriented.
- A local quota delegation wrapper was rejected because it could lose the
  package's TUI extension.
- Loading quota permanently and only suppressing events was rejected because
  it does not toggle package loading.
- A schema-v6 migration was rejected because these optional fields do not
  change format, locations, or overlay semantics.
```

Change only ADR-0032's status section to `Superseded`, naming ADR-0043 for the
JSONC/manifest replacement and ADR-0045 for enablement. Do not rewrite its
historical context or decision body. Add ADR-0045's one-line summary to
`CONTEXT.md`'s Architectural Decisions list.

- [ ] **Step 4: Run the focused test and verify green**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the architecture record**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add adr/0032-mcp-server-onboarding.md adr/0045-manifest-driven-mcp-plugin-toggles.md CONTEXT.md tests/Unit/Harness/PrismManifestDocsTest.php docs/specs/2026-07-30-manifest-mcp-plugin-toggles-spec.md docs/plans/2026-07-30-manifest-mcp-plugin-toggles.md && \
git commit -S -m $'docs(adr): record manifest integration toggle boundary\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 2: Add schema-v5 toggle preferences

**Files:**
- Modify: `.github/scripts/PrismManifest.php:26-36,128-179`
- Modify: `prism.jsonc:10-75`
- Modify: `tests/Unit/Harness/PrismManifestTest.php:25-49,79-320`

**Interfaces:**
- Consumes: `PrismManifest::resolve()`, `optionalBooleanSection()`.
- Produces: validated optional paths `mcp.deepseek_websearch`, `mcp.searxng`, and `plugins.opencode_quota`; absent paths remain compatible and are interpreted downstream as false.

- [ ] **Step 1: Write failing validation and overlay tests**

Extend `pm_valid_project()` with:

```php
'mcp' => (object) [
    'deepseek_websearch' => false,
    'searxng' => false,
],
'plugins' => (object) [
    'opencode_quota' => false,
],
```

Add tests covering compatibility, type validation, and user overlay:

```php
it('accepts schema-v5 project manifests that predate optional integration sections', function (): void {
    $manifest = pm_valid_project();
    unset($manifest->mcp, $manifest->plugins);

    expect(fn () => PrismManifest::validateProject($manifest))
        ->not->toThrow(PrismJsoncException::class);
});

it('rejects non-boolean integration preferences', function (string $path): void {
    $manifest = pm_valid_project();
    pm_set_dot($manifest, $path, 'false');

    expect(fn () => PrismManifest::validateProject($manifest))
        ->toThrow(PrismJsoncException::class);
})->with(['mcp.deepseek_websearch', 'mcp.searxng', 'plugins.opencode_quota']);

it('accepts partial user integration overrides', function (): void {
    expect(fn () => PrismManifest::validateUser((object) [
        'setup_version' => 5,
        'mcp' => (object) ['searxng' => true],
        'plugins' => (object) ['opencode_quota' => true],
    ]))->not->toThrow(PrismJsoncException::class);
});

it('overlays integration preferences without erasing sibling defaults', function (): void {
    $resolved = PrismManifest::resolve(
        (object) ['mcp' => (object) ['deepseek_websearch' => false, 'searxng' => false]],
        (object) ['mcp' => (object) ['searxng' => true]],
    );

    expect($resolved->mcp->deepseek_websearch)->toBeFalse()
        ->and($resolved->mcp->searxng)->toBeTrue();
});
```

- [ ] **Step 2: Run the focused tests and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php --filter='integration|schema-v5 project manifests'
```

Expected: FAIL because the validators do not type-check `mcp` or `plugins`.

- [ ] **Step 3: Add optional validation and shipped defaults**

Add constants and validator calls:

```php
/** @var list<string> */
private const array MCP = ['deepseek_websearch', 'searxng'];

/** @var list<string> */
private const array PLUGINS = ['opencode_quota'];
```

In both `validateProject()` and `validateUser()`, after `experimental`:

```php
self::optionalBooleanSection($manifest, 'mcp', self::MCP);
self::optionalBooleanSection($manifest, 'plugins', self::PLUGINS);
```

Add the two commented sections to tracked `prism.jsonc`, before `env`:

```jsonc
// Optional MCP preferences. Effective enablement also requires the matching
// non-empty env value from the resolved user manifest.
"mcp": {
  "deepseek_websearch": false,
  "searxng": false
},

// Optional npm plugin preferences. Packages stay pinned even while disabled.
"plugins": {
  "opencode_quota": false
},
```

Keep `setup_version: 5`.

- [ ] **Step 4: Run validation tests and verify green**

```bash
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/PrismManifestTest.php --coverage
```

Expected: PASS; changed `PrismManifest.php` coverage remains at least 80%.

- [ ] **Step 5: Commit the manifest vocabulary**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add .github/scripts/PrismManifest.php prism.jsonc tests/Unit/Harness/PrismManifestTest.php && \
git commit -S -m $'feat(config): add optional integration preferences\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 3: Compose owned OpenCode runtime overrides

**Files:**
- Create: `.github/scripts/PrismOpenCodeConfig.php`
- Create: `tests/Unit/Harness/PrismOpenCodeConfigTest.php`

**Interfaces:**
- Consumes: a resolved Prism manifest (`stdClass`) and nullable inherited `OPENCODE_CONFIG_CONTENT` string.
- Produces: `PrismOpenCodeConfig::compose(stdClass $resolved, ?string $existing): string` returning compact JSON; throws `PrismJsoncException` with value-free diagnostics.

- [ ] **Step 1: Write the failing composer tests**

Create `PrismOpenCodeConfigTest.php`. Require the production class and cover:

```php
it('emits explicit all-off MCP leaves without a plugin key', function (): void {
    $json = PrismOpenCodeConfig::compose((object) [], null);
    $config = json_decode($json, false, 64, JSON_THROW_ON_ERROR);

    expect($config->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
        ->and($config->mcp->searxng->enabled)->toBeFalse()
        ->and(property_exists($config, 'plugin'))->toBeFalse();
});

it('requires both preference and prerequisite for MCP activation', function (): void {
    $resolved = (object) [
        'mcp' => (object) ['deepseek_websearch' => true, 'searxng' => true],
        'plugins' => (object) ['opencode_quota' => false],
        'env' => (object) ['deepseek_api_key' => '', 'searxng_url' => 'https://search.test'],
    ];
    $config = json_decode(PrismOpenCodeConfig::compose($resolved, null));

    expect($config->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
        ->and($config->mcp->searxng->enabled)->toBeTrue();
});

it('preserves unrelated inline config and toggles only quota membership', function (): void {
    $base = '{"theme":"keep","plugin":["other/plugin","@slkiser/opencode-quota"],"mcp":{"custom":{"enabled":true}}}';
    $off = json_decode(PrismOpenCodeConfig::compose((object) [], $base));
    $on = json_decode(PrismOpenCodeConfig::compose((object) [
        'plugins' => (object) ['opencode_quota' => true],
    ], $base));

    expect($off->theme)->toBe('keep')
        ->and($off->mcp->custom->enabled)->toBeTrue()
        ->and($off->plugin)->toBe(['other/plugin'])
        ->and($on->plugin)->toBe(['other/plugin', '@slkiser/opencode-quota']);
});

it('never copies resolved secrets into inline JSON', function (): void {
    $json = PrismOpenCodeConfig::compose((object) [
        'mcp' => (object) ['deepseek_websearch' => true],
        'env' => (object) ['deepseek_api_key' => 'CANARY-SECRET'],
    ], null);

    expect($json)->not->toContain('CANARY-SECRET');
});

it('fails closed on malformed or incompatible inherited inline config', function (string $base): void {
    expect(fn () => PrismOpenCodeConfig::compose((object) [], $base))
        ->toThrow(PrismJsoncException::class);
})->with([
    'malformed JSON' => ['{'],
    'non-object root' => ['[]'],
    'non-object mcp' => ['{"mcp":false}'],
    'non-object owned server' => ['{"mcp":{"searxng":false}}'],
    'non-array plugin' => ['{"plugin":{}}'],
]);
```

Also assert duplicate quota entries collapse to one when enabled, tuple-form
unrelated plugin entries survive, and identical inputs produce byte-identical
output.

- [ ] **Step 2: Run the new test and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismOpenCodeConfigTest.php
```

Expected: FAIL because `PrismOpenCodeConfig` does not exist.

- [ ] **Step 3: Implement the deep composition module**

Create `PrismOpenCodeConfig.php` with this public shape and behavior:

```php
<?php

declare(strict_types=1);

namespace KYAULabs\Prism;

require_once __DIR__ . '/PrismJsoncException.php';

final class PrismOpenCodeConfig
{
    private const string QUOTA_PLUGIN = '@slkiser/opencode-quota';

    public static function compose(\stdClass $resolved, ?string $existing): string
    {
        $config = self::decodeBase($existing);
        $mcp = self::objectProperty($config, 'mcp', 'mcp');
        $deepseek = self::objectProperty($mcp, 'deepseek-websearch', 'mcp.deepseek-websearch');
        $searxng = self::objectProperty($mcp, 'searxng', 'mcp.searxng');

        $deepseek->enabled = self::booleanPath($resolved, 'mcp.deepseek_websearch')
            && self::nonEmptyStringPath($resolved, 'env.deepseek_api_key');
        $searxng->enabled = self::booleanPath($resolved, 'mcp.searxng')
            && self::nonEmptyStringPath($resolved, 'env.searxng_url');

        self::applyQuota($config, self::booleanPath($resolved, 'plugins.opencode_quota'));

        return json_encode(
            $config,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
        );
    }

    private static function decodeBase(?string $existing): \stdClass
    {
        if ($existing === null || $existing === '') {
            return new \stdClass();
        }

        try {
            $decoded = json_decode($existing, false, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            throw new PrismJsoncException('OPENCODE_CONFIG_CONTENT is not valid JSON', 0, $error);
        }

        if (!($decoded instanceof \stdClass)) {
            throw new PrismJsoncException('OPENCODE_CONFIG_CONTENT must be a JSON object');
        }

        return $decoded;
    }

    private static function objectProperty(\stdClass $parent, string $property, string $path): \stdClass
    {
        if (!property_exists($parent, $property)) {
            $parent->{$property} = new \stdClass();
        }

        if (!($parent->{$property} instanceof \stdClass)) {
            throw new PrismJsoncException('inline config field ' . $path . ' must be an object');
        }

        return $parent->{$property};
    }

    private static function booleanPath(\stdClass $root, string $path): bool
    {
        $value = self::path($root, $path);

        if ($value === null) {
            return false;
        }
        if (!is_bool($value)) {
            throw new PrismJsoncException('manifest field ' . $path . ' must be a boolean');
        }

        return $value;
    }

    private static function nonEmptyStringPath(\stdClass $root, string $path): bool
    {
        $value = self::path($root, $path);

        if ($value === null) {
            return false;
        }
        if (!is_string($value)) {
            throw new PrismJsoncException('manifest field ' . $path . ' must be a string');
        }

        return $value !== '';
    }

    private static function path(\stdClass $root, string $path): mixed
    {
        $value = $root;
        foreach (explode('.', $path) as $segment) {
            if (!($value instanceof \stdClass) || !property_exists($value, $segment)) {
                return null;
            }
            $value = $value->{$segment};
        }

        return $value;
    }

    private static function applyQuota(\stdClass $config, bool $enabled): void
    {
        if (!property_exists($config, 'plugin')) {
            if ($enabled) {
                $config->plugin = [self::QUOTA_PLUGIN];
            }
            return;
        }
        if (!is_array($config->plugin)) {
            throw new PrismJsoncException('inline config field plugin must be an array');
        }

        $plugins = [];
        foreach ($config->plugin as $entry) {
            $id = self::pluginId($entry);
            if ($id !== self::QUOTA_PLUGIN) {
                $plugins[] = $entry;
            }
        }
        if ($enabled) {
            $plugins[] = self::QUOTA_PLUGIN;
        }
        $config->plugin = $plugins;
    }

    private static function pluginId(mixed $entry): string
    {
        if (is_string($entry)) {
            return $entry;
        }
        if (is_array($entry) && isset($entry[0]) && is_string($entry[0])) {
            return $entry[0];
        }

        throw new PrismJsoncException('inline config plugin entries must name a package');
    }
}
```

Apply the required RCS header and PHP vim modeline.

- [ ] **Step 4: Run tests with coverage and verify green**

```bash
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/PrismOpenCodeConfigTest.php --coverage
```

Expected: PASS; `PrismOpenCodeConfig.php` line coverage is at least 80%.

- [ ] **Step 5: Commit the composition module**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add .github/scripts/PrismOpenCodeConfig.php tests/Unit/Harness/PrismOpenCodeConfigTest.php && \
git commit -S -m $'feat(config): compose integration runtime overrides\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 4: Export preferences and inline config through env0

**Files:**
- Modify: `.github/scripts/prism_manifest.php:37-63,184-203,530-547`
- Modify: `.envrc:3-10,46-68`
- Modify: `tests/Unit/Harness/PrismManifestCliTest.php`
- Modify: `tests/Shell/prism_envrc_test.sh`
- Modify: `tests/Shell/prism_manifest_integration_test.sh`

**Interfaces:**
- Consumes: `PrismOpenCodeConfig::compose()` and inherited process `OPENCODE_CONFIG_CONTENT`.
- Produces: nineteen NUL-delimited pairs: fifteen existing values, three requested-preference diagnostics, and composed `OPENCODE_CONFIG_CONTENT`.

- [ ] **Step 1: Write failing CLI and shell transport tests**

Add `mcp`/`plugins` all-off fields to the standard CLI and shell project
fixtures. Add a CLI test that parses names into an associative map and asserts:

```php
expect($pairs['OPENCODE_MCP_DEEPSEEK_WEBSEARCH'])->toBe('false')
    ->and($pairs['OPENCODE_MCP_SEARXNG'])->toBe('false')
    ->and($pairs['OPENCODE_PLUGIN_OPENCODE_QUOTA'])->toBe('false');

$inline = json_decode($pairs['OPENCODE_CONFIG_CONTENT'], false, 64, JSON_THROW_ON_ERROR);
expect($inline->mcp->{'deepseek-websearch'}->enabled)->toBeFalse()
    ->and($inline->mcp->searxng->enabled)->toBeFalse();
```

Add cases for:

- a user preference `true` with a fake non-empty prerequisite producing an
  effective MCP `enabled: true`;
- requested preference diagnostics staying `true` when a missing prerequisite
  keeps effective enablement false;
- inherited `OPENCODE_CONFIG_CONTENT` preserving unrelated keys/plugins;
- malformed inherited inline JSON returning exit 1 with no stdout;
- no secret canary in the inline JSON;
- old schema-v5 fixtures without `mcp`/`plugins` emitting false diagnostics.

Update expected env0 counts from 15 pairs/30 parts to 19 pairs/38 parts.
Extend `prism_envrc_test.sh`'s dump with the four new variable names and assert
that `.envrc` exports them literally.

- [ ] **Step 2: Run focused tests and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestCliTest.php --filter='env0|NUL framing'
bash tests/Shell/prism_envrc_test.sh
```

Expected: FAIL on missing toggle variables and missing inline content.

- [ ] **Step 3: Wire the composer into env0**

Require `PrismOpenCodeConfig.php`. Keep the fifteen-entry `PRISM_ENV_MAP` and
add a separate direct-preference map:

```php
const PRISM_TOGGLE_ENV_MAP = [
    'mcp.deepseek_websearch' => 'OPENCODE_MCP_DEEPSEEK_WEBSEARCH',
    'mcp.searxng' => 'OPENCODE_MCP_SEARXNG',
    'plugins.opencode_quota' => 'OPENCODE_PLUGIN_OPENCODE_QUOTA',
];
```

Change `pm_env_pairs` to accept inherited inline content and append the new
pairs after the existing stable order:

```php
function pm_env_pairs(\stdClass $resolved, ?string $existingInlineConfig = null): array
{
    $pairs = [];

    foreach (PRISM_ENV_MAP as $dotPath => $envName) {
        $pairs[] = $envName;
        $pairs[] = pm_scalar_to_transport(pm_resolve_dot($resolved, $dotPath), $envName);
    }
    foreach (PRISM_TOGGLE_ENV_MAP as $dotPath => $envName) {
        $pairs[] = $envName;
        $pairs[] = pm_scalar_to_transport(pm_boolean_default_false($resolved, $dotPath), $envName);
    }

    $pairs[] = 'OPENCODE_CONFIG_CONTENT';
    $pairs[] = pm_scalar_to_transport(
        PrismOpenCodeConfig::compose($resolved, $existingInlineConfig),
        'OPENCODE_CONFIG_CONTENT',
    );

    return $pairs;
}

function pm_boolean_default_false(\stdClass $root, string $dotPath): bool
{
    $value = pm_resolve_dot($root, $dotPath);
    if ($value === null) {
        return false;
    }
    if (!is_bool($value)) {
        throw new PrismJsoncException('field ' . $dotPath . ' must be a boolean');
    }

    return $value;
}
```

In `cmd_env0()` read the inherited value as data and pass it to the pure helper:

```php
$existing = getenv('OPENCODE_CONFIG_CONTENT');
$inline = is_string($existing) ? $existing : null;

return new PrismCliResult(0, stdout: pm_nul_pairs(pm_env_pairs($resolved, $inline)));
```

Do not add shell JSON composition. `.envrc`'s existing generic NUL loop already
exports every new pair; update only its count/ownership comments.

- [ ] **Step 4: Run unit and shell integration tests and verify green**

```bash
php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Harness/PrismManifestCliTest.php --coverage
bash tests/Shell/prism_envrc_test.sh
bash tests/Shell/prism_manifest_integration_test.sh
```

Expected: all PASS; malformed input emits no partial environment stream.

- [ ] **Step 5: Commit the env0 transport**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add .github/scripts/prism_manifest.php .envrc tests/Unit/Harness/PrismManifestCliTest.php tests/Shell/prism_envrc_test.sh tests/Shell/prism_manifest_integration_test.sh && \
git commit -S -m $'feat(config): export resolved integration overrides\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 5: Make tracked OpenCode config permanently all-off

**Files:**
- Modify: `opencode.jsonc:13,39-65`
- Create: `tests/Shell/setup_toggles_test.sh`
- Modify: `tests/Unit/Harness/PrismManifestDocsTest.php`
- Modify: `tests/Shell/plugin_supply_chain_test.sh`
- Modify: `.github/scripts/validate-harness.sh:1047-1058`

**Interfaces:**
- Consumes: `OPENCODE_CONFIG_CONTENT` exported by Task 4.
- Produces: permanent pinned MCP definitions with static `enabled: false`; quota appears only through composed plugin membership.

- [ ] **Step 1: Write failing structural and resolved-config tests**

Add a test that parses `opencode.jsonc` with `PrismJsoncDocument`:

```php
it('keeps optional integrations statically off in tracked OpenCode config', function (): void {
    $config = PrismJsoncDocument::fromFile(dirname(__DIR__, 3) . '/opencode.jsonc')->root();

    Assert::assertFalse(property_exists($config, 'plugin'));
    Assert::assertFalse($config->mcp->{'deepseek-websearch'}->enabled);
    Assert::assertFalse($config->mcp->searxng->enabled);
    Assert::assertSame(
        ['npx', '-y', '@kyaulabs/deepseek-websearch@1.0.4'],
        $config->mcp->{'deepseek-websearch'}->command,
    );
    Assert::assertSame(
        ['npx', '-y', 'mcp-searxng@1.12.0'],
        $config->mcp->searxng->command,
    );
});
```

Create `setup_toggles_test.sh` using `tests/Shell/lib/test_helpers.sh`. It must:

1. Build isolated project/user manifests with fake prerequisites.
2. Assert all-off output has both MCP leaves false and no quota membership.
3. Assert independent user overrides enable each MCP and add quota exactly once.
4. Assert no tracked file in the fixture changes during off→on→off generation.
5. If `opencode` is installed, create a temporary minimal OpenCode config whose
   MCP commands are `true`, run `opencode debug config` with quota false, and
   assert the resolved MCP booleans. Skip this probe when `opencode` is absent;
   never run `opencode mcp list` in automation because it may spawn `npx`.

Extend `plugin_supply_chain_test.sh` to assert quota remains pinned/locked but
is absent from tracked `opencode.jsonc`'s plugin list.

- [ ] **Step 2: Run the tests and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php --filter='statically off'
bash tests/Shell/setup_toggles_test.sh
bash tests/Shell/plugin_supply_chain_test.sh
```

Expected: FAIL because quota is static and MCP blocks are comments.

- [ ] **Step 3: Activate permanent definitions without enabling them**

Remove the top-level static `plugin` property. Replace the `mcp` body with:

```jsonc
"mcp": {
  // Enablement is composed from the resolved Prism manifest into
  // OPENCODE_CONFIG_CONTENT. Do not edit these tracked false defaults.
  "deepseek-websearch": {
    "type": "local",
    "command": ["npx", "-y", "@kyaulabs/deepseek-websearch@1.0.4"],
    "enabled": false,
    "environment": { "DEEPSEEK_API_KEY": "{env:DEEPSEEK_API_KEY}" }
  },
  "searxng": {
    "type": "local",
    "command": ["npx", "-y", "mcp-searxng@1.12.0"],
    "enabled": false,
    "environment": { "SEARXNG_URL": "{env:SEARXNG_URL}" }
  }
},
```

Update `validate-harness.sh` comments from "commented-out template" to
"permanent disabled definitions"; retain the exact pin and `-y` checks.

- [ ] **Step 4: Run structural, runtime-contract, and supply-chain tests**

Run the Step 2 commands plus:

```bash
bash .github/scripts/validate-harness.sh
```

Expected: PASS; no package installation and no MCP process spawn.

- [ ] **Step 5: Commit the OpenCode boundary**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add opencode.jsonc .github/scripts/validate-harness.sh tests/Unit/Harness/PrismManifestDocsTest.php tests/Shell/setup_toggles_test.sh tests/Shell/plugin_supply_chain_test.sh && \
git commit -S -m $'feat(mcp): apply manifest-driven integration toggles\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 6: Add three user-only setup prompts

**Files:**
- Modify: `.opencode/commands/setup.md:38-56,123-237,380-492`
- Modify: `.github/scripts/setup-write-user-config.sh`
- Modify: `.github/scripts/setup-write-project-config.sh:93-116`
- Modify: `tests/Unit/Harness/SetupCommandPrismManifestTest.php`
- Modify: `tests/Shell/setup_write_user_config_test.sh`
- Modify: `tests/Shell/setup_write_project_config_test.sh`

**Interfaces:**
- Consumes: resolved `get` values and the existing comment-preserving `patch` command.
- Produces: `setup-write-user-config.sh toggles`, requiring exactly three `true|false` variables and patching only the three preference paths.

- [ ] **Step 1: Write failing setup command and writer tests**

Add command-contract assertions for all three prompts, the `toggles` writer
mode, user-only ownership, `direnv allow`, and OpenCode restart guidance.

Extend `setup_write_user_config_test.sh` so its helper can invoke either the
default mode or `toggles`. Add cases proving:

- a toggle-only write creates a mode-0600 user manifest containing only
  `setup_version`, `mcp`, and `plugins`;
- values decode as JSON Booleans, not strings;
- no identity/model/variant fields are materialized;
- comments, env secrets, and unrelated keys survive;
- values other than exact `true`/`false` fail without writing;
- an identical second write is byte-identical.

Extend the project-writer test to assert a newly seeded project manifest has
all three false defaults and never receives personal answers.

- [ ] **Step 2: Run focused tests and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/SetupCommandPrismManifestTest.php --filter='toggle|integration'
bash tests/Shell/setup_write_user_config_test.sh
bash tests/Shell/setup_write_project_config_test.sh
```

Expected: FAIL because the writer has no `toggles` mode and `/setup` has no prompts.

- [ ] **Step 3: Add a narrow toggle-only writer mode**

In `setup-write-user-config.sh`, set `MODE="${1:-all}"`, accept only `all` or
`toggles`, and keep the no-argument behavior unchanged. In `toggles` mode:

```bash
REQUIRED_VARS=(
    OPENCODE_MCP_DEEPSEEK_WEBSEARCH
    OPENCODE_MCP_SEARXNG
    OPENCODE_PLUGIN_OPENCODE_QUOTA
)

for var in "${REQUIRED_VARS[@]}"; do
    case "${!var:-}" in
        true|false) ;;
        *) echo "✗ required env var $var must be true or false; aborting (no write)" >&2; exit 1 ;;
    esac
done

UPDATES=$(jq -n \
    --argjson deepseek "$OPENCODE_MCP_DEEPSEEK_WEBSEARCH" \
    --argjson searxng "$OPENCODE_MCP_SEARXNG" \
    --argjson quota "$OPENCODE_PLUGIN_OPENCODE_QUOTA" \
    '{
        "mcp.deepseek_websearch": $deepseek,
        "mcp.searxng": $searxng,
        "plugins.opencode_quota": $quota
    }')
```

Keep the existing `all` branch and its required variables/update object
unchanged. Add all-off `mcp`/`plugins` objects to the project writer's seed;
do not add toggle variables to its update payload.

- [ ] **Step 4: Add the interview and report flow**

After model/variant configuration, read each resolved value, normalize empty
to `false`, and ask one question at a time with a default of no:

```text
Enable deepseek-websearch MCP? [y/N]
Enable SearXNG MCP? [y/N]
Enable @slkiser/opencode-quota? [y/N]
```

Store exact shell strings `true`/`false`, then always invoke:

```bash
OPENCODE_MCP_DEEPSEEK_WEBSEARCH="$OPENCODE_MCP_DEEPSEEK_WEBSEARCH" \
OPENCODE_MCP_SEARXNG="$OPENCODE_MCP_SEARXNG" \
OPENCODE_PLUGIN_OPENCODE_QUOTA="$OPENCODE_PLUGIN_OPENCODE_QUOTA" \
bash .github/scripts/setup-write-user-config.sh toggles
```

Report requested versus active MCP state without printing prerequisite values.
State that a requested MCP with a missing prerequisite remains inactive. End
with `direnv allow` and restart instructions. Add toggles to the warning's
user-owned field list, not the project-owned list.

- [ ] **Step 5: Run setup tests and verify green**

Run the Step 2 commands. Expected: PASS, including user-only and Boolean-type assertions.

- [ ] **Step 6: Commit the setup experience**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add .opencode/commands/setup.md .github/scripts/setup-write-user-config.sh .github/scripts/setup-write-project-config.sh tests/Unit/Harness/SetupCommandPrismManifestTest.php tests/Shell/setup_write_user_config_test.sh tests/Shell/setup_write_project_config_test.sh && \
git commit -S -m $'feat(setup): prompt for user integration toggles\n\nRefs: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 7: Update living documentation and domain language

**Files:**
- Modify: `.opencode/docs/mcp.md`
- Modify: `.opencode/docs/model-configuration.md:49-57,160-168`
- Modify: `.opencode/commands/doctor.md:120-128,168-208`
- Modify: `AGENTS.md:243-268`
- Modify: `CONTEXT.md:22-35,79-110,151-199`
- Modify: `CODING_HARNESS.md:27-39,83-108`
- Modify: `README.md:358-373`
- Modify: `prism.jsonc:3-13`
- Modify: `.envrc:3-10`
- Modify: `tests/Unit/Harness/PrismManifestDocsTest.php`

**Interfaces:**
- Consumes: completed behavior from Tasks 2-6.
- Produces: one consistent living description of the project Prism manifest, user Prism manifest, manifest resolution order, MCP activation, quota plugin, and nineteen-value env0 transport.

- [ ] **Step 1: Write failing living-document assertions**

Add tests that require:

- a `quota plugin` glossary row;
- the Prism manifest entity to name `mcp.*` and `plugins.*`;
- the MCP server glossary row to name permanent disabled definitions and
  `OPENCODE_CONFIG_CONTENT`;
- `mcp.md` to name `/setup`, both preference paths, `direnv allow`, restart,
  prerequisite gating, and installed-but-not-loaded quota behavior;
- no living setup/MCP guide to instruct users to uncomment an MCP block;
- `AGENTS.md` and `CODING_HARNESS.md` to name ADR-0045;
- count references to say nineteen rather than fifteen.

- [ ] **Step 2: Run docs tests and verify red**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php
```

Expected: FAIL on stale comments, counts, and glossary text.

- [ ] **Step 3: Rewrite the living configuration guidance**

Apply these exact content rules:

- `mcp.md`: `/setup` or direct user-manifest Boolean edit → set prerequisite
  under user `env` → `direnv allow` → restart; explain requested versus active.
- `model-configuration.md` and README: Prism composes inherited
  `OPENCODE_CONFIG_CONTENT`, preserving unrelated keys while owning two MCP
  leaves and quota membership.
- `doctor.md`, root manifest comments, and `.envrc`: nineteen NUL pairs, with
  the three diagnostics and inline config named.
- `AGENTS.md`: MCP blocks are permanent and statically false; quota is pinned,
  installed, opt-in, and controlled by the user Prism manifest.
- `CONTEXT.md`: add `quota plugin`; update `MCP server` and `Prism manifest`;
  retain ADR-0032 as historical/superseded and add ADR-0045.
- `CODING_HARNESS.md`: correct its stale model-preference path to the user
  Prism manifest and add the optional integration flow.
- Historical ADR/spec/plan bodies remain historical and are not rewritten.

- [ ] **Step 4: Verify no active stale instructions remain**

```bash
php vendor/bin/pest tests/Unit/Harness/PrismManifestDocsTest.php
rg -n 'fifteen|uncomment.*(?:MCP|block)|commented[- ]out.*MCP' AGENTS.md CONTEXT.md CODING_HARNESS.md README.md prism.jsonc .envrc .opencode/docs .opencode/commands
```

Expected: Pest PASS; `rg` reports no active stale MCP/count guidance.

- [ ] **Step 5: Commit documentation and close the issue in history**

```bash
SIGNOFF="$(bash .github/scripts/resolve-identity.sh)" && \
git add .opencode/docs/mcp.md .opencode/docs/model-configuration.md .opencode/commands/doctor.md AGENTS.md CONTEXT.md CODING_HARNESS.md README.md prism.jsonc .envrc tests/Unit/Harness/PrismManifestDocsTest.php && \
git commit -S -m $'docs(mcp): document manifest-driven integration toggles\n\nFixes: #279\nAuthored-by: gpt-5.6-sol\nImplemented-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: '"$SIGNOFF"
```

---

### Task 8: Run completion gates

**Files:**
- Verify only; modify implementation files only if a gate exposes a defect, then return to the owning task's Red-Green-Refactor cycle.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: evidence that issue #279 satisfies its spec with no debug artifacts, network-dependent tests, generated-file edits, or coverage regressions.

- [ ] **Step 1: Run focused feature suites**

```bash
php -d pcov.enabled=1 vendor/bin/pest \
  tests/Unit/Harness/PrismManifestTest.php \
  tests/Unit/Harness/PrismOpenCodeConfigTest.php \
  tests/Unit/Harness/PrismManifestCliTest.php \
  tests/Unit/Harness/SetupCommandPrismManifestTest.php \
  tests/Unit/Harness/PrismManifestDocsTest.php \
  --coverage
bash tests/Shell/setup_write_user_config_test.sh
bash tests/Shell/setup_write_project_config_test.sh
bash tests/Shell/prism_envrc_test.sh
bash tests/Shell/prism_manifest_integration_test.sh
bash tests/Shell/setup_toggles_test.sh
bash tests/Shell/plugin_supply_chain_test.sh
```

Expected: all PASS; changed PHP files meet 80% line coverage.

- [ ] **Step 2: Verify default and independent toggle payloads manually without network**

```bash
php .github/scripts/prism_manifest.php env0 prism.jsonc > /tmp/prism-279-env0.bin
php -r '
$p = explode("\0", file_get_contents("/tmp/prism-279-env0.bin"));
for ($i = 0; $i + 1 < count($p); $i += 2) {
    if ($p[$i] === "OPENCODE_CONFIG_CONTENT") {
        json_decode($p[$i + 1], true, 64, JSON_THROW_ON_ERROR);
        echo $p[$i + 1], PHP_EOL;
    }
}
'
rm -f /tmp/prism-279-env0.bin
```

Expected: valid JSON with both MCP leaves false and no quota plugin entry.

- [ ] **Step 3: Run the full verification-before-completion checks**

Confirm no prototype files, debug output, fake secrets, or generated assets
remain. Then run:

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
for test_file in tests/Shell/*_test.sh; do bash "$test_file"; done
```

Expected: all PASS.

- [ ] **Step 4: Run the manual `/check` gate**

Invoke `/check` and require GO. It runs php-cs-fixer dry-run, stylelint, ESLint,
Pest coverage, PHP syntax, plugin tests, and every shell regression test.

- [ ] **Step 5: Stop for separate review gates**

Do not push. Ask the human to run `@code-review`; resolve findings through the
`receiving-code-review` skill. The human pushes only after `/check` and review
are clean.
