# PHP/web testing-ready scaffold contract

## Summary

The PHP/web adapter should create one canonical, application-free scaffold that
can pass the same local and CI quality gate immediately after setup. The
scaffold owns native dependency manifests and locks, lint/test configuration,
a shared quality script, a copied coverage helper, empty stack directories,
minimal runtime/browser probes, and convention tests. Core-owned Git
initialization and hooks remain outside this inventory.

The scaffold must not generate a public webroot, production PHP behavior,
database artifacts, nginx configuration, SCSS/JavaScript application sources,
or deploy configuration.

## Decision

### 1. Ownership boundary

The PHP/web adapter owns every item in this document except the canonical Git
hooks, which remain Prism Core-owned. The generated CI workflow is
adapter-owned but its behavioral contract is already fixed by
[the generated CI parity decision](2026-08-20-testing-ready-generated-ci.md).

| Owner | Surface |
| --- | --- |
| Prism Core | Git initialization, initial `develop` branch, canonical hooks, `core.hooksPath` |
| PHP/web adapter | Composer/npm manifests and locks, PHP/web directories, lint/test configs, tests and fixtures, shared quality script, copied coverage helper, generated CI |
| Consumer | Application source, public pages, database schema, nginx/deploy configuration, later project-specific test additions |

The transaction, rollback, compatibility-validation, and create-only mechanics
for these files belong to the separate scaffold-transaction decision. This
document fixes the desired inventory and content contract.

### 2. Canonical directory inventory

Setup creates these directories when absent:

```text
backend/
cdn/css/
cdn/javascript/
cdn/js/
cdn/sass/
tests/Unit/Harness/
tests/Feature/fixtures/
tests/Integration/
tests/Browser/fixtures/
tests/Plugin/
tests/Semgrep/
tests/Shell/
.github/scripts/
.github/workflows/
```

Empty source/test directories receive `.gitkeep` only where no canonical file
already makes the directory trackable. `cdn/css/` and `cdn/javascript/` are
generated-output directories and remain empty; setup may create them on disk
but must not seed generated assets.

No application webroot, `<app>.sql`, or `<app>.nginx.conf` is generated.

### 3. Native dependency manifests and locks

The adapter creates or validates:

- `composer.json`
- `composer.lock`
- `package.json`
- `package-lock.json`

A new `composer.json` contains no guessed vendor, license, description, or
application namespace. Its canonical testing fields are:

- `type: project`;
- `require.php: ^8.5`;
- exact `require-dev` entries from the active adapter toolchain contract for
  `friendsofphp/php-cs-fixer`, `pestphp/pest`, and
  `pestphp/pest-plugin-browser`;
- scripts `test`, `test:coverage`, and `check`, where `check` invokes the shared
  project-owned quality script in local mode;
- `config.sort-packages: true`;
- `config.optimize-autoloader: true`; and
- `config.allow-plugins.pestphp/pest-plugin: true`.

No autoload mapping is required for the procedural baseline. A consumer may
add one with application code later.

A new `package.json` contains:

- `private: true`;
- a normalized project-directory basename as `name`;
- a `check` script invoking the shared quality script in local mode; and
- exact `devDependencies` from the adapter contract for Sass, uglify-js,
  ESLint, `@eslint/js`, Stylelint, the standard SCSS config, and Playwright.

The locks are generated from those exact manifests through the existing
candidate transaction, with lifecycle scripts disabled and all advisories
blocking. Setup does not add packages beyond the current PHP/web toolchain
contract.

### 4. Canonical configuration files

The adapter creates or validates:

| Path | Contract |
| --- | --- |
| `.php-cs-fixer.dist.php` | PSR-12, risky rules enabled, `declare_strict_types`, repository-root finder excluding `vendor`, `node_modules`, `aurora`, and generated asset directories |
| `eslint.config.mjs` | `@eslint/js` recommended baseline; lint `cdn/js/**/*.js`; ignore minified output; enforce tabs; warn on unused variables and console output |
| `.stylelintrc.json` | extend `stylelint-config-standard-scss`; kebab-case class selector pattern; maximum nesting depth 4 |
| `phpunit.xml` | bootstrap `tests/bootstrap.php`; Unit, Feature, Integration, Browser, and Plugin suites; cache under `.phpunit.cache`; HTML, text, and Clover reports under `tests/coverage*` |
| `tests/bootstrap.php` | strict types, `E_ALL`, hidden display errors; no environment-file loading or application bootstrap |
| `tests/Pest.php` | default PHPUnit test case, browser timeout 10 seconds, and one `browser_base_url()` helper using `PEST_BROWSER_BASE_URL` with localhost fallback |
| `.gitignore` | dependency, cache, coverage, browser screenshot, environment, and temporary-prototype entries required by the scaffold |

SCSS and JavaScript lint are conditional: the shared gate reports them skipped
until corresponding source files exist. Their configuration still ships so
the first source file enters the gate without another setup step.

### 5. Coverage source and bootstrap probe

`phpunit.xml` includes both:

```text
backend/
tests/Feature/fixtures/
```

The fixture source is required because Pest exits non-zero when `--coverage
--min=80` is run with an empty `<source>` universe. A disposable boundary
experiment confirmed an empty source filter exits 4, while one fully exercised
strict-typed fixture produces a valid Clover report and 100% aggregate
coverage.

The canonical fixture is `tests/Feature/fixtures/coverage_probe.php`. It
exposes one deterministic function with two outcomes. The corresponding
`tests/Feature/CoverageProbeTest.php` exercises both outcomes with independent
literal expectations. This is test-infrastructure behavior, not application
behavior: it proves the PHP runtime, Pest execution, and coverage driver can
produce a non-degenerate report before the project has application code.

The probe remains deliberately tiny so it cannot materially hide uncovered
application code. The primary changed-file gate still evaluates every changed
PHP file in the `<source>` set independently at 80%.

Coverage settings are fixed as:

- Pest aggregate backstop: `--coverage --min=80`;
- Clover: `tests/coverage.xml`;
- text: `tests/coverage.txt`;
- HTML: `tests/coverage/`;
- changed-file threshold: 80% per file;
- changed-file strictness: non-strict, matching local/CI parity; and
- executable PHP outside `<source>`: warning, not failure.

### 6. Minimal canonical tests and fixtures

The scaffold contains only tests that prove its own readiness:

| Path | Observable behavior |
| --- | --- |
| `tests/Feature/RuntimeSmokeTest.php` | running PHP satisfies the adapter's PHP 8.5 floor |
| `tests/Feature/CoverageProbeTest.php` | the strict-typed coverage fixture executes through both outcomes and produces real coverage |
| `tests/Browser/fixtures/smoke.html` | static, application-free browser target with one stable heading/status string |
| `tests/Browser/SmokeTest.php` | Chromium visits the configured fixture URL, sees the stable content, and reports no JavaScript errors or console logs |
| `tests/Unit/Harness/ArchTest.php` | non-vacuous PHP scan, no `var_dump`/`print_r`/`dd`/`dump`, and strict types in the first ten lines |
| `tests/Unit/Harness/RcsHeaderConventionTest.php` | rejects placeholder/foreign RCS values, enforces strict-types/header ordering, and rejects duplicate modelines |

A test proving Pest's own class exists is excluded: successfully executing the
suite already proves Pest is installed, so such an assertion would test an
implementation detail without adding confidence.

`tests/Integration/`, `tests/Plugin/`, and `tests/Semgrep/` start empty.
`tests/Shell/run-all.sh` is the canonical optional shell-test entry point and
runs `tests/Shell/*_test.sh` when such files are later added.

### 7. Shared scripts and CI

The adapter creates or validates these executable/project-owned files:

| Path | Purpose |
| --- | --- |
| `.github/scripts/check-php.sh` | sole local/CI PHP/web quality implementation; accepts `--local` or `--ci --base=<40-hex-object>` |
| `.github/scripts/coverage-gate.php` | byte-identical generated copy of the adapter's canonical changed-file coverage gate |
| `tests/Shell/run-all.sh` | optional shell-regression aggregator |
| `.github/workflows/ci.yml` | one hosted `verify` job invoking `.github/scripts/check-php.sh --ci` |

The shared quality script runs, in order:

1. local-only Prism readiness;
2. PHP syntax checks;
3. php-cs-fixer dry-run;
4. conditional Stylelint;
5. conditional ESLint;
6. browser fixture server start, bounded readiness, and guaranteed cleanup;
7. Pest aggregate coverage at 80%;
8. the copied non-strict changed-file coverage gate at 80%; and
9. optional shell tests when the canonical entry point exists.

Local mode chooses staged PHP files first and working-tree files second. CI
mode validates and diffs its supplied 40-hex comparison object against `HEAD`.
No lint, test, browser, or coverage rule differs between modes.

The generated workflow remains exactly the surface decided by the CI-parity
research: full-history credential-free checkout, PHP 8.5 with PCOV, Node 24,
locked installs with scripts disabled, exact Pi/Core/adapter versions, bounded
ephemeral Semgrep/OCR readiness, Chromium only, first-push-safe comparison,
and one shared-gate invocation.

### 8. Exclusions

The testing-ready scaffold does not create:

- PHP application functions, classes, pages, or an Aurora entry point;
- database schemas, migrations, fixtures, or credentials;
- nginx or production deployment configuration;
- SCSS, JavaScript, compiled CSS, or minified JavaScript application assets;
- Node/TypeScript tests specific to Prism package development;
- Semgrep rule fixtures or security scans;
- release, package-smoke, commitlint, OCR-review, or dependency-audit CI jobs;
- a custom PHPUnit `TestCase`; or
- additional Composer/npm dependencies beyond the adapter contract.

## Acceptance criteria

The canonical scaffold is complete only when tests prove:

1. every listed directory and file is created when absent;
2. no application/deploy/database artifact is generated;
3. manifest dependency versions equal the active adapter contract and both
   lockfiles represent the same graph;
4. Composer/npm installation uses lockfiles with lifecycle scripts disabled;
5. PHP, SCSS, and JavaScript lint configuration matches the rules above;
6. the empty-application scaffold runs Pest with aggregate coverage and emits
   a non-empty `tests/coverage.xml`;
7. the coverage probe is fully covered and every changed in-source PHP file is
   independently gated at 80%;
8. Chromium can load the static smoke fixture without JavaScript errors or
   console logs;
9. the architecture and RCS convention tests execute from `tests/Unit/Harness`;
10. the shared local and CI modes execute the same ordered quality gates;
11. browser-server cleanup occurs on success and failure;
12. no declared adapter tool is invoked through `vendor/bin`, `npx`, or an
    ambient global executable;
13. empty SCSS/JavaScript/application directories do not make the first check
    fail; and
14. the generated CI workflow satisfies the previously recorded CI-parity
    acceptance criteria.

## Consequences

- **Positive:** a new PHP/web project can pass local and CI checks before
  application work begins.
- **Positive:** every future PHP, SCSS, and JavaScript source enters an already
  configured quality surface.
- **Positive:** the coverage probe avoids a special first-run coverage bypass
  and proves that the coverage driver is functional.
- **Positive:** core Git/hook policy remains separated from adapter-specific
  testing practice.
- **Negative:** the permanent coverage probe contributes a very small amount
  of covered fixture code to aggregate coverage; per-file coverage remains the
  primary gate and prevents it from masking changed-file failures.
- **Negative:** projects with customized existing manifests or quality files
  may block automatic setup until the scaffold transaction's compatibility
  rules are satisfied.

## Sources

1. `CONTEXT.md` — Prism Core/stack-adapter ownership boundary and toolchain
   contract invariants.
2. `packages/prism-php-web/toolchain.json` — exact consumer-development tools
   and Chromium-only browser target.
3. `packages/prism-php-web/docs/tests.md` and `docs/conventions.md` — Pest
   bootstrap, seven test areas, filesystem-walker convention tests, and test
   quality rules.
4. `packages/prism-php-web/skills/tdd-php/SKILL.md` and
   `skills/pest-browser/SKILL.md` — coverage, browser, naming, and execution
   contracts.
5. `packages/prism-php-web/prompts/check-php.md` — current ordered local PHP/web
   gate and non-strict changed-file coverage behavior.
6. `packages/prism-php-web/scripts/coverage-gate.php` — canonical 80% per-file
   Clover implementation.
7. `adr/0004-filesystem-walker-arch-tests.md` — non-vacuous procedural PHP
   architecture-test mechanism.
8. `adr/0009-mechanized-changed-file-coverage-gate.md` and
   `adr/0025-ci-local-parity-principle.md` — one gate, two callers, aggregate
   backstop, and local/CI equivalence.
9. `docs/research/2026-08-20-testing-ready-generated-ci.md` — generated CI and
   shared-check contract.
10. Local disposable Pest/PCOV experiment — an empty source filter exited 4;
    a two-outcome strict-typed fixture produced a valid 100% Clover run.
