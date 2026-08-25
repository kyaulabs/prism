// $KYAULabs: prism-tool-php-web-bootstrap.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const handler = require('../../packages/prism-php-web/scripts/prism-tool-adapter');
const {renderBootstrapScaffold} = require(
    '../../packages/prism-php-web/scripts/toolchain/bootstrap-scaffold'
);

const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ADAPTER_ROOT, 'toolchain.json'), 'utf8'));

const OUTPUTS = [
    '.github/scripts/check-php.sh',
    '.github/scripts/coverage-gate.php',
    '.github/workflows/ci.yml',
    '.gitignore',
    '.php-cs-fixer.dist.php',
    '.stylelintrc.json',
    'backend/.gitkeep',
    'cdn/css/.gitkeep',
    'cdn/javascript/.gitkeep',
    'cdn/js/.gitkeep',
    'cdn/sass/.gitkeep',
    'composer.json',
    'composer.lock',
    'eslint.config.mjs',
    'package-lock.json',
    'package.json',
    'phpunit.xml',
    'tests/Browser/SmokeTest.php',
    'tests/Browser/fixtures/smoke.html',
    'tests/Feature/CoverageProbeTest.php',
    'tests/Feature/RuntimeSmokeTest.php',
    'tests/Feature/fixtures/coverage_probe.php',
    'tests/Integration/.gitkeep',
    'tests/Pest.php',
    'tests/Plugin/.gitkeep',
    'tests/Semgrep/.gitkeep',
    'tests/Shell/run-all.sh',
    'tests/Unit/Harness/ArchTest.php',
    'tests/Unit/Harness/RcsHeaderConventionTest.php',
    'tests/bootstrap.php',
];

test('renders the complete blank PHP/web scaffold through the adapter provider', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

    const report = handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {
                schemaVersion: 1,
                displayName: 'Blank PHP Project',
                summary: 'An application-free PHP web scaffold.',
                suggestedDisplayName: 'project',
            },
            adapter: {
                id: 'php-web',
                packageName: '@kyaulabs/prism-php-web',
                packageVersion: '0.3.1',
                bootstrapProtocol: 1,
            },
        },
        run() {
            throw new Error('renderer must not populate dependencies');
        },
    });

    assert.equal(report.status, 'GO');
    assert.deepEqual(report.outputs.map(({path: outputPath}) => outputPath).sort(), OUTPUTS);
    assert.equal(report.outputs.every(({kind}) => kind === 'file'), true);
    assert.equal(report.outputs.every(({sha256}) => /^[0-9a-f]{64}$/.test(sha256)), true);
    assert.equal(report.outputs.every(({candidatePath}) => path.isAbsolute(candidatePath)), true);
    assert.deepEqual(report.provider, {
        id: 'php-web-scaffold',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        protocolVersion: 1,
    });
});

test('rejects scaffold manifest paths that escape the candidate root', (t) => {
    const packageRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(packageRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const escapedName = `escaped-${path.basename(packageRoot)}`;
    const escapedPath = path.join(path.dirname(candidateRoot), escapedName);
    t.after(() => fs.rmSync(escapedPath, {force: true}));
    fs.mkdirSync(path.join(packageRoot, 'config', 'bootstrap'), {recursive: true});
    fs.writeFileSync(path.join(packageRoot, 'config', 'bootstrap', 'scaffold.json'), JSON.stringify({
        schemaVersion: 1,
        providerId: 'php-web-scaffold',
        outputs: [`../${escapedName}`],
    }));

    assert.throws(() => renderBootstrapScaffold({
        packageRoot,
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    }), /manifest|path/);
    assert.equal(fs.existsSync(escapedPath), false);
});

test('rejects unknown scaffold manifest fields', (t) => {
    const packageRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(packageRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(packageRoot, 'config', 'bootstrap'), {recursive: true});
    fs.writeFileSync(path.join(packageRoot, 'config', 'bootstrap', 'scaffold.json'), JSON.stringify({
        schemaVersion: 1,
        providerId: 'php-web-scaffold',
        outputs: ['README.md'],
        command: 'untrusted',
    }));

    assert.throws(() => renderBootstrapScaffold({
        packageRoot,
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    }), /manifest/);
});

test('does not render through a symlinked candidate parent', (t) => {
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.symlinkSync(outside, path.join(candidateRoot, '.github'));

    assert.throws(() => handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    }), /candidate|parent/);
    assert.deepEqual(fs.readdirSync(outside), []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
