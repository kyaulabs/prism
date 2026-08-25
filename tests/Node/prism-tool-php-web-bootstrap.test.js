// $KYAULabs: prism-tool-php-web-bootstrap.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');
const {makeTempDir} = require('./helpers');
const {validateProviderReport} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-composer');
const {loadTrustedProviderRegistry} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-providers');
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
    assert.deepEqual(report.effects.map(({id}) => id), [
        'composer-lock-resolution',
        'npm-lock-resolution',
        'composer-install',
        'npm-install',
        'playwright-chromium',
    ]);
    assert.deepEqual(report.verification, [{
        id: 'php-web-scaffold-inventory',
        command: 'setup verify --adapter=@kyaulabs/prism-php-web --network-approved=yes',
    }]);
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

test('renders first-source-ready lint and application-free directory policy', (t) => {
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
    const read = (name) => fs.readFileSync(report.outputs.find(({path: outputPath}) => outputPath === name).candidatePath, 'utf8');
    const paths = report.outputs.map(({path: outputPath}) => outputPath);

    assert.match(read('eslint.config.mjs'), /cdn\/js\/\*\*\/\*\.js/);
    assert.match(read('eslint.config.mjs'), /no-console/);
    assert.deepEqual(JSON.parse(read('.stylelintrc.json')), {
        extends: ['stylelint-config-standard-scss'],
        rules: {'selector-class-pattern': '^[a-z][a-z0-9-]*$', 'max-nesting-depth': 4},
    });
    assert.match(read('.gitignore'), /\/vendor\//);
    assert.equal(paths.some((outputPath) => /(?:\.nginx\.conf|\.sql|cdn\/sass\/[^.]|cdn\/js\/[^.]|cdn\/css\/.*\.min\.css)/.test(outputPath)), false);
});

test('renders one shared local and CI PHP web quality implementation', (t) => {
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
    const read = (name) => fs.readFileSync(report.outputs.find(({path: outputPath}) => outputPath === name).candidatePath, 'utf8');
    const check = read('.github/scripts/check-php.sh');
    const ordered = ['doctor --local-only', 'php -l', 'run php-cs-fixer', 'run stylelint', 'run eslint', 'php -S', 'run pest', 'coverage-gate.php', 'tests/Shell/run-all.sh'];
    let previous = -1;
    for (const marker of ordered) {
        const index = check.indexOf(marker);
        assert.equal(index > previous, true, marker);
        previous = index;
    }
    assert.match(check, /\^\[0-9a-f\]\{40\}\$/);
    assert.match(check, /trap .*cleanup/);
    assert.match(check, /seq 1 50/);
    assert.match(check, /file_get_contents/);
    assert.equal(
        read('.github/scripts/coverage-gate.php'),
        fs.readFileSync(path.join(ADAPTER_ROOT, 'scripts', 'coverage-gate.php'), 'utf8')
    );
    assert.match(read('tests/Shell/run-all.sh'), /\*_test\.sh/);
});

test('renders pinned create-only CI that invokes the shared quality gate', (t) => {
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
    const workflow = fs.readFileSync(report.outputs.find(({path: outputPath}) => outputPath === '.github/workflows/ci.yml').candidatePath, 'utf8');

    assert.equal(yaml.load(workflow).jobs.verify['runs-on'], 'ubuntu-latest');
    assert.match(workflow, /permissions:\n {2}contents: read/);
    assert.match(workflow, /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /setup-php@b604ade2a87db23f8871b7182e69ec5e75effb45/);
    assert.match(workflow, /setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
    assert.match(workflow, /composer install .*--no-scripts/);
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.match(workflow, /pi-coding-agent@0\.84\.1/);
    assert.match(workflow, /prism-core@0\.3\.1/);
    assert.match(workflow, /prism-php-web@0\.3\.1/);
    assert.match(workflow, /semgrep>=1\.173\.0,<2\.0\.0/);
    assert.match(workflow, /open-code-review@>=1\.9\.1 <2\.0\.0/);
    assert.match(workflow, /doctor --local-only/);
    assert.match(workflow, /run playwright -- install --with-deps chromium/);
    assert.match(workflow, /4b825dc642cb6eb9a060e54bf8d69288fbee4904/);
    assert.match(workflow, /check-php\.sh --ci --base=/);
    assert.doesNotMatch(workflow, /npx|vendor\/bin|ocr (?:review|llm test)|persist-credentials: true/);
});

test('stops only its browser fixture server when a quality gate fails', (t) => {
    const candidateRoot = makeTempDir();
    const fakeBin = path.join(candidateRoot, 'fake-bin');
    const pidFile = path.join(candidateRoot, 'server.pid');
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
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(path.join(fakeBin, 'prism-tool'), '#!/usr/bin/env bash\n[[ "$1" != run || "$2" != pest ]]\n', {mode: 0o755});
    fs.writeFileSync(path.join(fakeBin, 'git'), '#!/usr/bin/env bash\nexit 0\n', {mode: 0o755});
    fs.writeFileSync(path.join(fakeBin, 'php'), '#!/usr/bin/env bash\nif [[ "$1" == -S ]]; then echo $$ > "$SERVER_PID_FILE"; while :; do sleep 1; done; fi\nexit 0\n', {mode: 0o755});
    const check = report.outputs.find(({path: outputPath}) => outputPath === '.github/scripts/check-php.sh').candidatePath;

    assert.throws(() => execFileSync('bash', [check, '--local'], {
        cwd: candidateRoot,
        env: {...process.env, PATH: `${fakeBin}:/usr/bin:/bin`, SERVER_PID_FILE: pidFile},
        stdio: 'pipe',
    }));
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0));
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
    for (const output of report.outputs.filter(({path: outputPath}) => outputPath.endsWith('.sh'))) {
        execFileSync('bash', ['-n', output.candidatePath]);
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

test('validates the PHP web report through the generic Core provider contract', (t) => {
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
            metadata: {schemaVersion: 1, displayName: 'Project', summary: 'One sentence.', suggestedDisplayName: 'project'},
            adapter: {id: 'php-web', packageName: CONTRACT.package, packageVersion: '0.3.1', bootstrapProtocol: 1},
        },
    });
    const core = loadTrustedProviderRegistry({coreRoot: path.resolve(__dirname, '../../packages/prism-core')});
    const registry = {
        schemaVersion: 1,
        providers: [...core.providers, {
            ...report.provider,
            displayName: 'PHP/web scaffold',
            outputs: report.outputs.map(({path: outputPath}) => outputPath),
            effects: report.effects,
            checks: report.checks,
            verification: report.verification,
        }],
    };

    assert.equal(validateProviderReport({projectRoot, candidateRoot, registry, report}).length, OUTPUTS.length);
    for (const mutate of [
        (copy) => { copy.provider.packageVersion = '9.9.9'; },
        (copy) => { copy.effects[4].command = 'playwright install firefox'; },
        (copy) => { copy.verification[0].command = 'untrusted'; },
    ]) {
        const copy = JSON.parse(JSON.stringify(report));
        mutate(copy);
        assert.throws(() => validateProviderReport({projectRoot, candidateRoot, registry, report: copy}));
    }
});

test('verifies the applied scaffold inventory and rejects changed bytes', (t) => {
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

    assert.equal(handler.verifyBootstrapProject({projectRoot: candidateRoot, report, contract: CONTRACT}).status, 'GO');
    for (const mutate of [
        (copy) => { copy.unknown = true; },
        (copy) => { copy.provider.packageVersion = '9.9.9'; },
        (copy) => { copy.effects[4].command = 'playwright install firefox'; },
        (copy) => { copy.checks[0].id = 'unknown'; },
    ]) {
        const copy = JSON.parse(JSON.stringify(report));
        mutate(copy);
        assert.equal(handler.verifyBootstrapProject({projectRoot: candidateRoot, report: copy, contract: CONTRACT}).status, 'NO-GO');
    }
    fs.appendFileSync(path.join(candidateRoot, 'package.json'), 'changed');
    assert.equal(handler.verifyBootstrapProject({projectRoot: candidateRoot, report, contract: CONTRACT}).status, 'NO-GO');
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

test('rejects unknown bootstrap provider request fields', (t) => {
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
            command: 'untrusted',
        },
    }), /request/);
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

test('runs the generated shared quality gate through the adapter handler', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const scriptPath = path.join(projectRoot, '.github', 'scripts', 'check-php.sh');
    fs.mkdirSync(path.dirname(scriptPath), {recursive: true});
    fs.writeFileSync(scriptPath, '#!/usr/bin/env bash\nexit 0\n', {mode: 0o755});
    fs.chmodSync(scriptPath, 0o755);
    const invocations = [];

    const result = handler.runBootstrapQuality({
        projectRoot,
        contract: CONTRACT,
        run(command, args, options) {
            invocations.push({command, args, cwd: options.cwd});
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    });

    assert.equal(result.status, 'GO');
    assert.deepEqual(invocations, [{
        command: scriptPath,
        args: ['--local'],
        cwd: projectRoot,
    }]);
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
