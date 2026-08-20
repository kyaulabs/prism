# Testing-ready generated CI contract

## Summary

Generate one create-only `.github/workflows/ci.yml` with one hosted Ubuntu
`verify` job. Keep the workflow responsible only for immutable bootstrap and
event context; put the actual PHP/web quality gate in one generated,
project-owned check script that both `/check-php` and CI invoke. This is the
smallest design that preserves behavioral parity without duplicating lint,
browser-server, test, and coverage logic in YAML.

The generated workflow must:

1. check out full history without persisted credentials;
2. configure PHP 8.5 with PCOV and Node 24;
3. install the committed Composer and npm graphs with lifecycle scripts
   disabled;
4. provision the generation-time pinned Pi, Prism Core, and PHP/web adapter,
   plus compatible Semgrep and OCR 1.x prerequisites in the ephemeral runner;
5. run `prism-tool doctor --local-only` and never run OCR connectivity or code
   review;
6. install only Playwright Chromium through `prism-tool`;
7. select and validate the comparison base for pull requests, ordinary pushes,
   and the repository's first push; and
8. invoke the shared PHP/web check script once in CI mode.

Do not copy Prism's own repository CI wholesale. Consumer CI does not need
harness validation, package-smoke matrices, release checks, Prism's Node/shell
regression suites, Semgrep scans, gitleaks scans, OCR, commitlint, or package
publishing. Any CI-only failure gate would violate the local/CI parity
principle unless it also becomes part of `/check`.

## Decision

### 1. One job, one shared quality gate

Use one job:

```text
verify (ubuntu-latest)
├── checkout
├── PHP 8.5 + PCOV
├── Node 24
├── locked dependency installation
├── ephemeral Prism readiness bootstrap
├── Playwright Chromium installation
├── comparison-base selection
└── shared PHP/web check script --ci
```

The workflow is orchestration, not a second implementation of `/check-php`.
The testing scaffold must provide a canonical executable check surface (final
path/name belongs to the scaffold-inventory decision) with two context modes:

```text
<shared-check> --local
<shared-check> --ci --base=<validated-40-hex-object>
```

`/check-php` invokes `--local`; the generated workflow invokes `--ci`. Both
modes run the same ordered failure gates:

1. `prism-tool doctor --local-only`;
2. PHP syntax validation;
3. `prism-tool run php-cs-fixer -- fix --dry-run --diff`;
4. Stylelint when SCSS source exists;
5. ESLint when JavaScript source exists;
6. browser-server start, bounded readiness wait, and guaranteed cleanup when
   browser tests exist;
7. `prism-tool run pest -- --coverage --min=80`;
8. the same `coverage-gate.php` with the same non-strict 80% changed-file
   threshold; and
9. optional project shell/Node tests only when their canonical scaffolded
   entry points exist.

Mode differences are limited to discovering the changed-file set and reporting
context. Local mode uses staged PHP files first and working-tree files second.
CI mode diffs the validated event comparison object against `HEAD`. No lint,
test, browser, or coverage rule may differ by mode.

This shared executable is required. Repeating the commands directly in YAML
would recreate the drift ADR-0009 and ADR-0025 prohibit.

### 2. Event and repository contract

The canonical workflow has:

- `push` and `pull_request` triggers for `develop` and `main`;
- no `pull_request_target` trigger;
- `permissions: contents: read` and no write permission;
- concurrency cancellation by workflow/ref;
- one `ubuntu-latest` job with a bounded timeout;
- `actions/checkout` pinned by full commit SHA, `fetch-depth: 0`, and
  `persist-credentials: false`;
- every other action pinned by full commit SHA; and
- no self-hosted runner, service credential, repository secret, or generated
  token persistence.

Full history is load-bearing because the changed-file coverage gate needs a
real comparison base.

### 3. Comparison-base selection

The workflow passes only inert event facts to the shared check surface. The
check surface validates every supplied object as exactly 40 lowercase
hexadecimal characters and confirms Git can resolve it before diffing.

Use these cases:

| Event | Comparison object |
| --- | --- |
| Pull request | merge base of `HEAD` and the event's pull-request base SHA |
| Ordinary push | `github.event.before` |
| First push (`before` is forty zeroes) | Git's empty-tree object `4b825dc642cb6eb9a060e54bf8d69288fbee4904` |

Diff the comparison object directly against `HEAD`; the empty-tree case must
not use `HEAD~1`, which does not exist for a single-root bootstrap commit.
The changed-file list is piped into the canonical adapter coverage gate rather
than interpreted by the workflow.

### 4. Immutable bootstrap and readiness

All generation-time package versions are rendered as exact literals in the
workflow. No `latest`, wildcard, branch, floating action tag, or unbounded npm
specifier is permitted.

The ephemeral runner bootstrap is:

1. install project Composer dependencies with
   `composer install --no-scripts --no-interaction --no-progress`;
2. install project npm dependencies with `npm ci --ignore-scripts`;
3. provision a stable Semgrep release satisfying `>=1.173.0 <2.0.0` in an
   isolated virtual environment;
4. provision a stable OCR release satisfying `>=1.9.1 <2.0.0` with npm
   lifecycle scripts disabled;
5. install the exact Pi version captured by the scaffold generator;
6. install the exact Prism Core version through its supported global installer
   into runner-owned Pi/bin directories;
7. reconcile the exact project-local PHP/web adapter package from the committed
   Pi package source; and
8. run `prism-tool doctor --local-only` before any declared tool.

CI may provision Semgrep and OCR because the runner is ephemeral, but it must
not run `ocr llm test`, `ocr review`, `ocr scan`, or inspect standing consent.
Local-only readiness is the complete CI OCR boundary.

Declared tools are invoked only through `prism-tool`. Direct `vendor/bin`,
`npx`, or global adapter-tool invocation is incompatible.

### 5. Browser-test contract

Install only Chromium:

```text
prism-tool run playwright -- install --with-deps chromium
```

The shared quality surface owns the browser server. When browser tests exist,
it:

- serves the canonical testing fixture root on `localhost:8080`;
- waits with a bounded health poll;
- exports `PEST_BROWSER_BASE_URL=http://localhost:8080` only for the Pest run;
- records whether it started the process; and
- stops only that process on every success/failure exit.

No production page, database, or application service is required. Browser
smoke coverage exercises the scaffold fixture only.

### 6. Coverage contract

CI and local checks enforce both layers already established by ADR-0009:

- aggregate backstop: Pest `--coverage --min=80`;
- primary gate: at least 80% line coverage for each changed PHP file in the
  PHPUnit `<source>` set, measured by the same `coverage-gate.php` and Clover
  report.

Both callers use the gate without `--strict`. The scaffold's `phpunit.xml`
must always emit `tests/coverage.xml`; the exact source directories and copied
coverage-gate path belong to the testing-scaffold inventory decision.

### 7. Create-only behavior

`.github/workflows/ci.yml` is create-only:

- absent: create the canonical workflow atomically;
- present and byte-identical to the canonical generation for the selected
  versions: preserve and report PASS;
- present and different: preserve it byte-for-byte and fail closed with a
  report naming the missing or unverifiable CI contract; never patch, merge,
  rename, or replace it.

Initially, exact canonical equality is the only safe automatic compatibility
proof. Accepting arbitrary custom workflow shapes would require a separate,
semantic GitHub Actions validator; grep-based acceptance is too weak and a new
YAML-parser dependency is not justified by this bootstrap.

The same create-only rule applies to the shared quality script and coverage
helper through the scaffold transaction decision. A differing existing file is
human-owned and blocks automatic claims of parity.

## Minimal generated workflow surface

The canonical YAML should contain only these named concerns:

| Concern | Required | Excluded |
| --- | --- | --- |
| Checkout | full history, no credentials, pinned SHA | shallow clone |
| Runtime | PHP 8.5 + PCOV, Node 24 | platform matrix |
| Dependencies | Composer/npm lockfiles, scripts disabled | update/resolution |
| Harness | exact Pi/Core/adapter, local-only doctor | global user config |
| External readiness | bounded Semgrep/OCR provisioning | OCR connectivity/review |
| Browser | launcher-installed Chromium | Firefox/WebKit |
| Quality | one shared local/CI check invocation | duplicated YAML gates |
| Coverage | aggregate + changed-file 80% | CI-only threshold |
| Security | read-only token, hosted runner | self-hosted/write token |
| Repository-specific checks | none | Prism package smoke/release/harness suites |

Caches are optional optimization, not part of correctness, and should be
omitted from the first canonical workflow. They can be added later without
changing the gate contract if they remain lockfile-keyed and do not weaken
isolation.

## Acceptance criteria

A generated or accepted canonical workflow is valid only if tests prove:

1. the first push does not reference `HEAD~1` and includes every initial PHP
   file in the coverage candidate set;
2. pull requests use the merge base and ordinary pushes use the before SHA;
3. checkout and every action are SHA-pinned and credentials are not persisted;
4. only `ubuntu-latest` is used;
5. dependency installation is lockfile-based and lifecycle-script-free;
6. exact Pi/Core/adapter versions and bounded Semgrep/OCR ranges are present;
7. local-only doctor runs before declared tools;
8. no OCR network or reviewed-code operation exists;
9. only Chromium is installed through `prism-tool`;
10. CI invokes the same shared quality script as `/check-php`;
11. Pest runs aggregate coverage and the shared changed-file gate at 80%;
12. browser server cleanup occurs on failure as well as success;
13. no direct `npx` or `vendor/bin` declared-tool call appears; and
14. rerunning setup preserves an existing canonical workflow byte-for-byte,
    while a differing workflow remains untouched and makes setup NO-GO.

No new dependency is required for this contract.

## Consequences

- **Positive:** one executable owns local/CI quality semantics, so generated CI
  cannot silently drift from `/check-php`.
- **Positive:** the workflow stays small and suitable for consumer projects
  instead of inheriting Prism's package-development CI.
- **Positive:** first-push coverage works for the single-root greenfield seed.
- **Positive:** existing CI is never overwritten or weakly declared
  compatible.
- **Negative:** a customized existing workflow blocks automatic setup until a
  human reconciles it with the canonical contract.
- **Negative:** mandatory external readiness adds Semgrep/OCR provisioning time
  even though generated CI performs neither scan nor review.
- **Neutral:** caches and additional security jobs remain possible later, but
  any new failing gate must gain an equivalent local `/check` gate first.

## Sources

1. `.github/workflows/ci.yml` — current Pi-native repository CI and browser /
   changed-file coverage mechanics.
2. `packages/prism-core/prompts/check.md` and
   `packages/prism-php-web/prompts/check-php.md` — current local check contract.
3. `packages/prism-core/toolchain.json` and
   `packages/prism-php-web/toolchain.json` — tool ownership, versions, external
   ranges, and Chromium-only browser target.
4. `packages/prism-php-web/scripts/coverage-gate.php` — canonical changed-file
   coverage implementation.
5. `adr/0009-mechanized-changed-file-coverage-gate.md` — one script, two callers,
   aggregate backstop, and per-file 80% gate.
6. `adr/0025-ci-local-parity-principle.md` — every CI failure gate needs a local
   pre-remote equivalent.
7. `adr/0035-ci-runner-fork-isolation.md` — hosted ephemeral runner and
   non-persisted credentials.
8. `adr/0063-bounded-external-tool-compatibility.md` — Semgrep/OCR ranges and
   CI-only ephemeral provisioning permission.
9. `adr/0074-approval-free-harness-operations.md` — standing OCR consent does
   not transfer to CI; local-only readiness remains offline.
10. Pi 0.84.2 `docs/packages.md` and `docs/usage.md` — pinned npm package
    sources, project-local package scope, non-interactive trust, and package
    installation locations.
