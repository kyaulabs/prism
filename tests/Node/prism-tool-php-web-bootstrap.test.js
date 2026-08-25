// $KYAULabs: prism-tool-php-web-bootstrap.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
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

function successfulResult(command, args) {
    if (command === 'composer' && args[0] === 'audit') {
        return {status: 0, stdout: '{"advisories":[]}', stderr: '', error: undefined};
    }
    if (command === 'npm' && args[0] === 'audit') {
        return {
            status: 0,
            stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
            stderr: '',
            error: undefined,
        };
    }
    return {status: 0, stdout: '', stderr: '', error: undefined};
}

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
        run: successfulResult,
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

test('renders canonical dependency manifests from the adapter contract', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const report = handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'example-project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    });
    const output = (name) => report.outputs.find(({path: outputPath}) => outputPath === name).candidatePath;
    const composer = JSON.parse(fs.readFileSync(output('composer.json'), 'utf8'));
    const npm = JSON.parse(fs.readFileSync(output('package.json'), 'utf8'));

    assert.equal(composer.require.php, '^8.5');
    assert.equal(composer['require-dev']['pestphp/pest'], '5.1.1');
    assert.equal(composer.scripts.check, '.github/scripts/check-php.sh --local');
    assert.equal(npm.name, 'example-project');
    assert.equal(npm.private, true);
    assert.equal(npm.devDependencies.playwright, '1.62.1');
});

test('renders an application-free PHP and Pest readiness surface', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const report = handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    });
    const read = (name) => fs.readFileSync(
        report.outputs.find(({path: outputPath}) => outputPath === name).candidatePath,
        'utf8'
    );

    assert.match(read('.php-cs-fixer.dist.php'), /PhpCsFixer\\Config/);
    assert.match(read('.php-cs-fixer.dist.php'), /declare_strict_types/);
    assert.match(read('phpunit.xml'), /bootstrap="tests\/bootstrap\.php"/);
    assert.match(read('phpunit.xml'), /<directory>backend<\/directory>/);
    assert.match(read('phpunit.xml'), /tests\/Feature\/fixtures/);
    assert.match(read('phpunit.xml'), /tests\/coverage\.xml/);
    assert.match(read('tests/bootstrap.php'), /E_ALL/);
    assert.match(read('tests/Feature/fixtures/coverage_probe.php'), /function coverage_probe\(bool \$ready\): string/);
    assert.match(read('tests/Feature/CoverageProbeTest.php'), /toBe\('ready'\).*toBe\('not-ready'\)/s);
    assert.match(read('tests/Feature/RuntimeSmokeTest.php'), /PHP_VERSION_ID.*80500/);
    assert.match(read('tests/Browser/SmokeTest.php'), /Prism ready/);
    assert.match(read('tests/Unit/Harness/ArchTest.php'), /RecursiveDirectoryIterator/);
    assert.match(read('tests/Unit/Harness/RcsHeaderConventionTest.php'), /\$KYAULabs:/);
});

test('renders syntactically valid PHP readiness files', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const report = handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    });
    for (const output of report.outputs.filter(({path: outputPath}) => outputPath.endsWith('.php'))) {
        assert.match(execFileSync('php', ['-l', output.candidatePath], {encoding: 'utf8'}), /No syntax errors detected/);
    }
});

test('resolves candidate locks with lifecycle scripts disabled', (t) => {
    const candidateRoot = makeTempDir();
    const invocations = [];
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

    handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
        run(command, args, options) {
            invocations.push({command, args, cwd: options.cwd});
            return successfulResult(command, args);
        },
    });

    assert.deepEqual(invocations, [
        {command: 'composer', args: ['update', '--no-install', '--no-scripts', '--no-interaction'], cwd: fs.realpathSync(candidateRoot)},
        {command: 'npm', args: ['install', '--package-lock-only', '--ignore-scripts'], cwd: fs.realpathSync(candidateRoot)},
        {command: 'composer', args: ['audit', '--locked', '--format=json'], cwd: fs.realpathSync(candidateRoot)},
        {command: 'npm', args: ['audit', '--package-lock-only', '--json'], cwd: fs.realpathSync(candidateRoot)},
    ]);
});

test('binds provider digests to package-manager lock output', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const report = handler.prepareBootstrapProject({
        candidateRoot,
        contract: CONTRACT,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: [],
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
        run(command, args, options) {
            if (command === 'composer') fs.writeFileSync(path.join(options.cwd, 'composer.lock'), '{"packages":[],"packages-dev":[]}\n');
            if (command === 'npm') fs.writeFileSync(path.join(options.cwd, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"":{"name":"project"}}}\n');
            return successfulResult(command, args);
        },
    });
    for (const name of ['composer.lock', 'package-lock.json']) {
        const output = report.outputs.find(({path: outputPath}) => outputPath === name);
        const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(output.candidatePath)).digest('hex');
        assert.equal(output.sha256, actual);
    }
});

test('rejects a candidate dependency graph with any advisory', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

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
        run(command, args) {
            if (command === 'composer' && args[0] === 'audit') {
                return {
                    status: 1,
                    stdout: '{"advisories":{"pestphp/pest":[{"advisoryId":"CVE-1","severity":"high"}]}}',
                    stderr: '',
                    error: undefined,
                };
            }
            return successfulResult(command, args);
        },
    }), /advis/);
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
