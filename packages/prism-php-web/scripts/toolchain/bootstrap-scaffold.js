// $KYAULabs: bootstrap-scaffold.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeComposerAudit, normalizeNpmAudit} = require('./audit');

const EFFECTS = Object.freeze([
    Object.freeze({id: 'composer-lock-resolution', kind: 'network', command: 'composer update --no-install --no-scripts --no-interaction'}),
    Object.freeze({id: 'npm-lock-resolution', kind: 'network', command: 'npm install --package-lock-only --ignore-scripts'}),
    Object.freeze({id: 'composer-install', kind: 'network', command: 'composer install --no-scripts --no-interaction'}),
    Object.freeze({id: 'npm-install', kind: 'network', command: 'npm ci --ignore-scripts'}),
    Object.freeze({id: 'playwright-chromium', kind: 'browser', command: 'playwright install chromium'}),
]);
const CHECKS = Object.freeze([Object.freeze({
    id: 'php-web-scaffold-render',
    status: 'PASS',
    message: 'PHP/web scaffold candidate files were rendered',
})]);
const VERIFICATION = Object.freeze([Object.freeze({
    id: 'php-web-scaffold-inventory',
    command: 'setup verify --adapter=@kyaulabs/prism-php-web --network-approved=yes',
})]);

function packageVersion(packageRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    if (manifest?.name !== '@kyaulabs/prism-php-web' || typeof manifest.version !== 'string') {
        throw new Error('PHP/web adapter package identity is invalid');
    }
    return manifest.version;
}

function hasExactKeys(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function validateRequest(request, contract) {
    if (
        !hasExactKeys(request, ['schemaVersion', 'source', 'capabilities', 'metadata', 'adapter']) ||
        request.schemaVersion !== 1 ||
        !hasExactKeys(request.source, ['mode', 'evidence']) ||
        request.source.mode !== 'BLANK' ||
        request.source.evidence !== null ||
        !Array.isArray(request.capabilities) ||
        request.capabilities.length !== 0 ||
        !hasExactKeys(request.metadata, ['schemaVersion', 'displayName', 'summary', 'suggestedDisplayName']) ||
        request.metadata.schemaVersion !== 1 ||
        !hasExactKeys(request.adapter, ['id', 'packageName', 'packageVersion', 'bootstrapProtocol']) ||
        request.adapter.id !== 'php-web' ||
        request.adapter.packageName !== contract.package ||
        !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(request.adapter.packageVersion) ||
        request.adapter.bootstrapProtocol !== 1
    ) {
        throw new Error('PHP/web bootstrap provider request is invalid');
    }
}

function validateOutputPath(outputPath) {
    if (
        typeof outputPath !== 'string' ||
        outputPath.length === 0 ||
        outputPath.includes('\\') ||
        path.posix.isAbsolute(outputPath) ||
        path.posix.normalize(outputPath) !== outputPath ||
        outputPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
        throw new Error('PHP/web bootstrap scaffold path is invalid');
    }
    return outputPath;
}

function overlaps(left, right) {
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function loadManifest(packageRoot) {
    const manifestPath = path.join(packageRoot, 'config', 'bootstrap', 'scaffold.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
        manifest === null ||
        typeof manifest !== 'object' ||
        Array.isArray(manifest) ||
        Object.keys(manifest).sort().join(',') !== 'outputs,providerId,schemaVersion' ||
        manifest.schemaVersion !== 1 ||
        manifest.providerId !== 'php-web-scaffold' ||
        !Array.isArray(manifest.outputs) ||
        new Set(manifest.outputs).size !== manifest.outputs.length
    ) {
        throw new Error('PHP/web bootstrap scaffold manifest is invalid');
    }
    const outputs = manifest.outputs.map(validateOutputPath).sort();
    for (let index = 1; index < outputs.length; index += 1) {
        if (overlaps(outputs[index - 1], outputs[index])) {
            throw new Error('PHP/web bootstrap scaffold paths overlap');
        }
    }
    return {...manifest, outputs};
}

function ensureCandidateParent(candidateRoot, outputPath) {
    let current = candidateRoot;
    for (const segment of outputPath.split('/').slice(0, -1)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, {throwIfNoEntry: false});
        if (stat === undefined) fs.mkdirSync(current, {mode: 0o700});
        const actual = fs.lstatSync(current);
        const relation = path.relative(candidateRoot, fs.realpathSync(current));
        if (
            actual.isSymbolicLink() ||
            !actual.isDirectory() ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('PHP/web bootstrap candidate parent is invalid');
        }
    }
}

function npmProjectName(request) {
    const normalized = request.metadata.suggestedDisplayName
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '');
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)) {
        throw new Error('PHP/web bootstrap npm project name is invalid');
    }
    return normalized;
}

function contents(outputPath, request, contract, packageRoot) {
    if (outputPath === '.github/scripts/check-php.sh') return `#!/usr/bin/env bash
set -euo pipefail
MODE="\${1:---local}"
BASE=""
if [[ "$MODE" == --ci ]]; then
    BASE="\${2#--base=}"
    [[ "$BASE" =~ ^[0-9a-f]{40}$ ]] || exit 2
    git cat-file -e "$BASE^{commit}"
fi
SERVER_PID=""
cleanup() { [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT
prism-tool doctor --local-only
find backend tests -type f -name '*.php' -print0 | xargs -0 -r -n1 php -l
prism-tool run php-cs-fixer -- fix --dry-run --diff
find cdn/sass -type f -name '*.scss' -print -quit | grep -q . && prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input || true
find cdn/js -type f -name '*.js' -print -quit | grep -q . && prism-tool run eslint -- "cdn/js/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern || true
php -S 127.0.0.1:8080 -t tests/Browser/fixtures >/dev/null 2>&1 &
SERVER_PID=$!
READY=no
for attempt in $(seq 1 50); do
    if php -r "exit(@file_get_contents('http://127.0.0.1:8080/smoke.html') === false ? 1 : 0);"; then READY=yes; break; fi
    sleep 0.1
done
[[ "$READY" == yes ]] || exit 1
export PEST_BROWSER_BASE_URL=http://127.0.0.1:8080
prism-tool run pest -- --coverage --min=80
if [[ "$MODE" == --ci ]]; then git diff --name-only "$BASE" HEAD -- '*.php'; else git diff --cached --name-only --diff-filter=AM -- '*.php'; fi | php .github/scripts/coverage-gate.php tests/coverage.xml
[[ ! -x tests/Shell/run-all.sh ]] || tests/Shell/run-all.sh
`;
    if (outputPath === '.github/scripts/coverage-gate.php') {
        return fs.readFileSync(path.join(packageRoot, 'scripts', 'coverage-gate.php'), 'utf8');
    }
    if (outputPath === '.github/workflows/ci.yml') return `name: Verify

permissions:
  contents: read

on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: shivammathur/setup-php@b604ade2a87db23f8871b7182e69ec5e75effb45
        with:
          php-version: '8.5'
          coverage: pcov
      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38
        with:
          node-version: '24'
      - run: composer install --no-progress --no-interaction --no-scripts
      - run: npm ci --ignore-scripts
      - run: python3 -m venv /tmp/semgrep && /tmp/semgrep/bin/pip install 'semgrep>=1.173.0,<2.0.0'
      - run: npm install -g --ignore-scripts '@alibaba-group/open-code-review@>=1.9.1 <2.0.0'
      - run: npm install -g --ignore-scripts '@earendil-works/pi-coding-agent@0.84.1'
      - run: pi install npm:@kyaulabs/prism-core@0.3.1
      - run: pi install -l npm:@kyaulabs/prism-php-web@0.3.1
      - run: prism-tool doctor --local-only
      - run: prism-tool run playwright -- install --with-deps chromium
      - id: base
        env:
          EVENT_NAME: \${{ github.event_name }}
          EVENT_BEFORE: \${{ github.event.before }}
          PR_BASE: \${{ github.event.pull_request.base.sha }}
        run: |
          if [[ "$EVENT_NAME" == pull_request ]]; then
            comparison="$(git merge-base HEAD "$PR_BASE")"
          elif [[ "$EVENT_BEFORE" == 0000000000000000000000000000000000000000 ]]; then
            comparison=4b825dc642cb6eb9a060e54bf8d69288fbee4904
          else
            comparison="$EVENT_BEFORE"
          fi
          [[ "$comparison" =~ ^[0-9a-f]{40}$ ]]
          echo "comparison=$comparison" >> "$GITHUB_OUTPUT"
      - run: .github/scripts/check-php.sh --ci --base=\${{ steps.base.outputs.comparison }}
`;
    if (outputPath === 'tests/Shell/run-all.sh') return `#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob
for test_file in tests/Shell/*_test.sh; do bash "$test_file"; done
`;
    if (outputPath === 'composer.json') {
        const dependencies = Object.fromEntries(contract.components
            .filter(({ecosystem}) => ecosystem === 'composer')
            .map(({package: packageName, version}) => [packageName, version]));
        return `${JSON.stringify({
            type: 'project',
            require: {php: '^8.5'},
            'require-dev': dependencies,
            scripts: {test: 'pest', 'test:coverage': 'pest --coverage --min=80', check: '.github/scripts/check-php.sh --local'},
            config: {'sort-packages': true, 'optimize-autoloader': true, 'allow-plugins': {'pestphp/pest-plugin': true}},
        }, null, 2)}\n`;
    }
    if (outputPath === 'package.json') {
        const dependencies = Object.fromEntries(contract.components
            .filter(({ecosystem}) => ecosystem === 'npm')
            .map(({package: packageName, version}) => [packageName, version]));
        return `${JSON.stringify({name: npmProjectName(request), private: true, scripts: {check: '.github/scripts/check-php.sh --local'}, devDependencies: dependencies}, null, 2)}\n`;
    }
    if (outputPath === 'composer.lock') return '{"packages":[],"packages-dev":[]}\n';
    if (outputPath === 'package-lock.json') return '{"lockfileVersion":3,"packages":{}}\n';
    if (outputPath === '.php-cs-fixer.dist.php') return `<?php
declare(strict_types=1);
use PhpCsFixer\\Config;
use PhpCsFixer\\Finder;
$finder = Finder::create()->in(__DIR__)->exclude(['vendor', 'node_modules', 'aurora', 'cdn/css', 'cdn/javascript']);
return (new Config())->setRiskyAllowed(true)->setRules(['@PSR12' => true, 'declare_strict_types' => true])->setFinder($finder);
`;
    if (outputPath === 'phpunit.xml') return `<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="tests/bootstrap.php" cacheDirectory=".phpunit.cache">
  <testsuites>
    <testsuite name="Unit"><directory>tests/Unit</directory></testsuite>
    <testsuite name="Feature"><directory>tests/Feature</directory></testsuite>
    <testsuite name="Integration"><directory>tests/Integration</directory></testsuite>
    <testsuite name="Browser"><directory>tests/Browser</directory></testsuite>
    <testsuite name="Plugin"><directory>tests/Plugin</directory></testsuite>
  </testsuites>
  <source><include><directory>backend</directory><directory>tests/Feature/fixtures</directory></include></source>
  <coverage><report><clover outputFile="tests/coverage.xml"/><text outputFile="tests/coverage.txt"/><html outputDirectory="tests/coverage"/></report></coverage>
</phpunit>
`;
    if (outputPath === 'tests/bootstrap.php') return `<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
`;
    if (outputPath === 'tests/Pest.php') return `<?php
declare(strict_types=1);
use PHPUnit\\Framework\\TestCase;
pest()->extend(TestCase::class)->in('Unit', 'Feature', 'Integration', 'Browser', 'Plugin');
function browser_base_url(): string
{
    return getenv('PEST_BROWSER_BASE_URL') ?: 'http://localhost:8080';
}
`;
    if (outputPath === 'tests/Feature/fixtures/coverage_probe.php') return `<?php
declare(strict_types=1);
/** @return string Readiness state. */
function coverage_probe(bool $ready): string
{
    return $ready ? 'ready' : 'not-ready';
}
`;
    if (outputPath === 'tests/Feature/CoverageProbeTest.php') return `<?php
declare(strict_types=1);
require_once __DIR__ . '/fixtures/coverage_probe.php';
it('exercises both readiness outcomes', function (): void {
    expect(coverage_probe(true))->toBe('ready')->and(coverage_probe(false))->toBe('not-ready');
});
`;
    if (outputPath === 'tests/Feature/RuntimeSmokeTest.php') return `<?php
declare(strict_types=1);
it('runs on PHP 8.5 or newer', function (): void { expect(PHP_VERSION_ID)->toBeGreaterThanOrEqual(80500); });
`;
    if (outputPath === 'tests/Browser/SmokeTest.php') return `<?php
declare(strict_types=1);
it('loads the application-free browser fixture', function (): void { visit(browser_base_url() . '/smoke.html')->assertSee('Prism ready')->assertNoJavascriptErrors()->assertNoConsoleLogs(); });
`;
    if (outputPath === 'tests/Unit/Harness/ArchTest.php') return `<?php
declare(strict_types=1);
/** @return list<string> PHP source paths. */
function architecture_php_files(): array
{
    $root = dirname(__DIR__, 3);
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        $path = $file->getPathname();
        if ($file->isFile() && $file->getExtension() === 'php' && !preg_match('~/(?:vendor|node_modules|aurora|cdn/css|cdn/javascript|tests/Semgrep)/~', $path)) {
            $files[] = $path;
        }
    }
    return $files;
}
it('finds PHP source files', function (): void { expect(architecture_php_files())->not->toBeEmpty(); });
it('contains no debug function calls', function (): void {
    foreach (architecture_php_files() as $file) expect(file_get_contents($file))->not->toMatch('/\\b(?:var_dump|print_r|dd|dump)\\s*\\(/');
});
it('declares strict types near the start', function (): void {
    foreach (architecture_php_files() as $file) expect(implode('', array_slice(file($file), 0, 10)))->toContain('declare(strict_types=1);');
});
`;
    if (outputPath === 'tests/Unit/Harness/RcsHeaderConventionTest.php') return `<?php
declare(strict_types=1);
/** @return list<string> Harness source paths. */
function convention_source_files(): array
{
    $root = dirname(__DIR__, 3);
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if ($file->isFile() && in_array($file->getExtension(), ['php', 'js', 'scss', 'sh', 'ts'], true)) $files[] = $file->getPathname();
    }
    return $files;
}
it('uses one non-placeholder RCS header', function (): void {
    foreach (convention_source_files() as $file) {
        $contents = file_get_contents($file);
        expect(substr_count($contents, '$KYAULabs:'))->toBe(1)->and($contents)->not->toContain('creator@host')->not->toContain('YYYY/MM/DD');
    }
});
it('uses one final vim modeline', function (): void {
    foreach (convention_source_files() as $file) {
        $contents = rtrim(file_get_contents($file));
        expect(substr_count($contents, 'vim: ft='))->toBe(1)->and($contents)->toMatch('/(?:\\/\\/|#) vim: ft=[^\\n]+ :$/');
    }
});
`;
    if (outputPath === 'tests/Browser/fixtures/smoke.html') return '<!doctype html><title>Prism ready</title><h1>Prism ready</h1>\n';
    if (outputPath === '.gitignore') return "/vendor/\n/node_modules/\n/tests/coverage/\n/tests/coverage.xml\n.env\n.env.*\n!.env.example\n";
    if (outputPath.endsWith('.gitkeep')) return '';
    if (outputPath.endsWith('.sh')) return '#!/usr/bin/env bash\nset -euo pipefail\n# vim: ft=sh sts=4 sw=4 ts=4 et :\n';
    if (outputPath.endsWith('.php')) return '<?php\ndeclare(strict_types=1);\n\n// vim: ft=php sts=4 sw=4 ts=4 et :\n';
    if (outputPath === 'eslint.config.mjs') return `// $KYAULabs: eslint.config.mjs setup@prism 2026/08/24 +0000 Exp $
import js from '@eslint/js';
export default [
    {ignores: ['cdn/javascript/**/*.min.js']},
    js.configs.recommended,
    {files: ['cdn/js/**/*.js'], rules: {indent: ['error', 'tab'], 'no-unused-vars': 'warn', 'no-console': 'warn'}},
];
`;
    if (outputPath === '.stylelintrc.json') return `${JSON.stringify({
        extends: ['stylelint-config-standard-scss'],
        rules: {'selector-class-pattern': '^[a-z][a-z0-9-]*$', 'max-nesting-depth': 4},
    }, null, 2)}\n`;
    if (outputPath.endsWith('.json')) return '{}\n';
    if (outputPath.endsWith('.yml')) return 'name: Verify\n';
    return `${request.metadata.displayName}\n`;
}

function verifyBootstrapScaffold({packageRoot, projectRoot, report, contract}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    try {
        if (
            !hasExactKeys(report, ['schemaVersion', 'provider', 'status', 'outputs', 'effects', 'checks', 'verification']) ||
            report.schemaVersion !== 1 ||
            report.status !== 'GO' ||
            !hasExactKeys(report.provider, ['id', 'packageName', 'packageVersion', 'protocolVersion']) ||
            report.provider.id !== 'php-web-scaffold' ||
            report.provider.packageName !== contract.package ||
            report.provider.packageVersion !== packageVersion(packageRoot) ||
            report.provider.protocolVersion !== 1 ||
            !Array.isArray(report.outputs) ||
            JSON.stringify(report.effects) !== JSON.stringify(EFFECTS) ||
            JSON.stringify(report.checks) !== JSON.stringify(CHECKS) ||
            JSON.stringify(report.verification) !== JSON.stringify(VERIFICATION)
        ) {
            throw new Error('PHP/web bootstrap provider report is invalid');
        }
        for (const output of report.outputs) {
            const outputPath = validateOutputPath(output.path);
            const filePath = path.join(canonicalProject, ...outputPath.split('/'));
            const stat = fs.lstatSync(filePath);
            if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== output.mode) {
                throw new Error('PHP/web bootstrap output is invalid');
            }
            const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
            if (digest !== output.sha256) throw new Error('PHP/web bootstrap output changed');
        }
        return {
            status: 'GO',
            checks: [{id: 'php-web-scaffold-inventory', status: 'PASS', message: 'PHP/web scaffold inventory verified'}],
            data: {outputs: report.outputs.length},
        };
    } catch {
        return {
            status: 'NO-GO',
            checks: [{id: 'php-web-scaffold-inventory', status: 'FAIL', message: 'PHP/web scaffold inventory verification failed'}],
            data: {reason: 'verification failure'},
        };
    }
}

function renderBootstrapScaffold({packageRoot, candidateRoot, request, contract, run}) {
    const canonicalCandidate = fs.realpathSync(candidateRoot);
    const manifest = loadManifest(packageRoot);
    validateRequest(request, contract);
    if (request.adapter.packageVersion !== packageVersion(packageRoot)) {
        throw new Error('PHP/web bootstrap provider request is invalid');
    }
    const outputs = manifest.outputs.map((outputPath) => {
        const candidatePath = path.join(canonicalCandidate, ...outputPath.split('/'));
        ensureCandidateParent(canonicalCandidate, outputPath);
        const value = Buffer.from(contents(outputPath, request, contract, packageRoot), 'utf8');
        const mode = outputPath.endsWith('.sh') ? 0o755 : 0o644;
        fs.writeFileSync(candidatePath, value, {flag: 'wx', mode});
        fs.chmodSync(candidatePath, mode);
        return {path: outputPath, kind: 'file', mode, candidatePath};
    });
    if (typeof run === 'function') {
        for (const [command, args] of [
            ['composer', ['update', '--no-install', '--no-scripts', '--no-interaction']],
            ['npm', ['install', '--package-lock-only', '--ignore-scripts']],
        ]) {
            const result = run(command, args, {cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000});
            if (result?.error || result?.status !== 0) {
                throw new Error('PHP/web bootstrap dependency resolution failed');
            }
        }
        const audits = [
            normalizeComposerAudit(run('composer', ['audit', '--locked', '--format=json'], {
                cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000,
            })),
            normalizeNpmAudit(run('npm', ['audit', '--package-lock-only', '--json'], {
                cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000,
            })),
        ];
        if (audits.some(({totals}) => Object.values(totals).some((total) => total !== 0))) {
            throw new Error('PHP/web bootstrap dependency graph has advisories');
        }
    }
    const finalOutputs = outputs.map((output) => {
        const value = fs.readFileSync(output.candidatePath);
        return Object.freeze({
            ...output,
            sha256: crypto.createHash('sha256').update(value).digest('hex'),
        });
    });
    return Object.freeze({
        schemaVersion: 1,
        provider: Object.freeze({id: manifest.providerId, packageName: contract.package, packageVersion: request.adapter.packageVersion, protocolVersion: 1}),
        status: 'GO',
        outputs: Object.freeze(finalOutputs),
        effects: EFFECTS,
        checks: CHECKS,
        verification: VERIFICATION,
    });
}

module.exports = {renderBootstrapScaffold, verifyBootstrapScaffold};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
