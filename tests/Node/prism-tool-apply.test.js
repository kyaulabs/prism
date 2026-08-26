// $KYAULabs: prism-tool-apply.test.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {loadContract} = require('../../packages/prism-core/scripts/prism-tool/contract');
const {
    applyCandidate,
    verifyInstalledGraph,
} = require('../../packages/prism-php-web/scripts/toolchain/transaction');
const {
    createWorkspace,
    recoverWorkspace,
} = require('../../packages/prism-php-web/scripts/toolchain/workspace');
const {makeTempDir, sha256, writeExecutable, writeJson} = require('./helpers');

const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const VISUAL_REVIEW_FILES = [
    'visual_review.example.json',
    'visual_review.mjs',
    'visual_review.spec.mjs',
];
const adapterContract = loadContract(path.join(ADAPTER_ROOT, 'toolchain.json'));

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function configureSourceAdapter(projectRoot) {
    const adapterRoot = path.resolve(__dirname, '../../packages/prism-php-web');
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: [path.join(adapterRoot, 'skills')],
    });
}

function writeConsumerExecutables(projectRoot, executables = [
    'php-cs-fixer',
    'pest',
    'sass',
    'uglifyjs',
    'eslint',
    'stylelint',
    'playwright',
]) {
    for (const executable of executables) {
        const scope = ['php-cs-fixer', 'pest'].includes(executable)
            ? ['vendor', 'bin']
            : ['node_modules', '.bin'];
        const executablePath = path.join(projectRoot, ...scope, executable);
        fs.mkdirSync(path.dirname(executablePath), {recursive: true});
        fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', {mode: 0o755});
        fs.chmodSync(executablePath, 0o755);
    }
}

function makeCandidateFixture() {
    const projectRoot = makeTempDir();
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    const originalFiles = {
        'composer.json': '{"name":"fixture/project"}\n',
        'composer.lock': '{"packages":[],"packages-dev":[]}\n',
        'package.json': '{"name":"fixture-project"}\n',
        'package-lock.json': '{"lockfileVersion":3,"packages":{}}\n',
    };
    for (const [name, content] of Object.entries(originalFiles)) {
        fs.writeFileSync(path.join(projectRoot, name), content);
    }
    const workspace = createWorkspace({projectRoot, adapter: adapterContract.package});
    const candidateRoot = path.join(workspace.root, 'candidate');
    fs.mkdirSync(candidateRoot, {mode: 0o700});
    const candidateFiles = {
        'composer.json': '{"name":"fixture/project","require-dev":{"friendsofphp/php-cs-fixer":"3.95.18","pestphp/pest":"5.1.1","pestphp/pest-plugin-browser":"5.0.1"}}\n',
        'composer.lock': '{"packages":[],"packages-dev":[{"name":"friendsofphp/php-cs-fixer","version":"v3.95.18"},{"name":"pestphp/pest","version":"v5.1.1"},{"name":"pestphp/pest-plugin-browser","version":"v5.0.1"}]}\n',
        'package.json': '{"name":"fixture-project","devDependencies":{"sass":"1.102.0","uglify-js":"3.19.3","eslint":"10.8.1","@eslint/js":"10.0.1","stylelint":"17.14.1","stylelint-config-standard-scss":"17.0.0","playwright":"1.62.1"}}\n',
        'package-lock.json': '{"lockfileVersion":3,"packages":{"node_modules/sass":{"version":"1.102.0"},"node_modules/uglify-js":{"version":"3.19.3"},"node_modules/eslint":{"version":"10.8.1"},"node_modules/@eslint/js":{"version":"10.0.1"},"node_modules/stylelint":{"version":"17.14.1"},"node_modules/stylelint-config-standard-scss":{"version":"17.0.0"},"node_modules/playwright":{"version":"1.62.1"}}}\n',
    };
    for (const [name, content] of Object.entries(candidateFiles)) {
        fs.writeFileSync(path.join(candidateRoot, name), content, {mode: 0o600});
    }
    const visualReviewFiles = Object.fromEntries(VISUAL_REVIEW_FILES.map((name) => {
        const content = fs.readFileSync(path.join(ADAPTER_ROOT, 'config', 'bootstrap', 'visual-review', name));
        fs.writeFileSync(path.join(candidateRoot, name), content, {mode: 0o600});
        return [name, content];
    }));
    const plan = {
        schemaVersion: 1,
        adapter: adapterContract.package,
        projectRoot: fs.realpathSync(projectRoot),
        original: Object.fromEntries(Object.entries(originalFiles).map(([name, content]) => [name, sha256(content)])),
        candidate: Object.fromEntries(Object.entries(candidateFiles).map(([name, content]) => [name, sha256(content)])),
        scaffold: Object.fromEntries(Object.entries(visualReviewFiles).map(([name, content]) => [name, {
            disposition: 'CREATE',
            original: 'absent',
            candidate: sha256(content),
            mode: 0o644,
        }])),
        audit: {critical: 0, high: 0, moderate: 0, low: 0},
        browserTargets: ['chromium'],
    };
    const planPath = path.join(workspace.root, 'candidate-plan.json');
    writeJson(planPath, plan);
    return {candidateFiles, plan, planPath, projectRoot, visualReviewFiles};
}

test('rejects every non-literal mutation approval before files or subprocesses change', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const original = {
        'composer.json': '{"name":"fixture/project"}\n',
        'package.json': '{"name":"fixture-project"}\n',
    };
    for (const [name, content] of Object.entries(original)) {
        fs.writeFileSync(path.join(projectRoot, name), content);
    }

    for (const approval of ['no', 'y', 'YES', '', ' ']) {
        let runCount = 0;
        const result = captureWrites(() => main([
            'setup',
            'apply',
            '--adapter=@kyaulabs/prism-php-web',
            '--plan=/untrusted/candidate-plan.json',
            `--approval=${approval}`,
        ], {
            projectRoot,
            run() {
                runCount += 1;
                throw new Error('subprocess must not run');
            },
        }));

        assert.equal(result.status, 2);
        assert.match(result.stderr, /mutation approval required/);
        assert.equal(runCount, 0);
        for (const [name, content] of Object.entries(original)) {
            assert.equal(fs.readFileSync(path.join(projectRoot, name), 'utf8'), content);
        }
    }
});

test('cleans the owned candidate workspace when mutation approval is declined', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    configureSourceAdapter(fixture.projectRoot);
    let runCount = 0;

    const result = captureWrites(() => main([
        'setup',
        'apply',
        '--adapter=@kyaulabs/prism-php-web',
        `--plan=${fixture.planPath}`,
        '--approval=no',
    ], {
        projectRoot: fixture.projectRoot,
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    }));

    assert.equal(result.status, 2);
    assert.equal(runCount, 0);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('rejects a stale original hash before package installation', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(fixture.projectRoot, 'composer.json'), '{"name":"changed/project"}\n');
    let runCount = 0;

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'stale plan');
    assert.equal(runCount, 0);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('rejects a broken symlink substituted for an absent original file', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const lockPath = path.join(fixture.projectRoot, 'package-lock.json');
    fs.rmSync(lockPath);
    fs.symlinkSync(path.join(fixture.projectRoot, 'missing-target'), lockPath);
    fixture.plan.original['package-lock.json'] = 'absent';
    writeJson(fixture.planPath, fixture.plan);
    let runCount = 0;

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run() {
            runCount += 1;
            return {status: 1, stdout: '', stderr: '', error: undefined};
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'stale plan');
    assert.equal(runCount, 0);
    assert.equal(fs.lstatSync(lockPath).isSymbolicLink(), true);
});

test('preserves exact canonical visual review files without rewriting them', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const identities = new Map();
    for (const [name, content] of Object.entries(fixture.visualReviewFiles)) {
        const target = path.join(fixture.projectRoot, name);
        fs.writeFileSync(target, content, {mode: 0o644});
        fs.chmodSync(target, 0o644);
        fixture.plan.scaffold[name] = {
            disposition: 'PRESERVE',
            original: sha256(content),
            candidate: sha256(content),
            mode: 0o644,
        };
        const stat = fs.statSync(target, {bigint: true});
        identities.set(name, {ino: stat.ino, mtimeNs: stat.mtimeNs});
    }
    writeJson(fixture.planPath, fixture.plan);

    const result = applyCandidate({
        contract: adapterContract,
        packageRoot: ADAPTER_ROOT,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run(command, args) {
            if (command === 'composer' && args[0] === 'install') {
                return {status: 1, stdout: '', stderr: '', error: undefined};
            }
            throw new Error('unexpected command');
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'post-apply failure');
    for (const name of VISUAL_REVIEW_FILES) {
        const stat = fs.statSync(path.join(fixture.projectRoot, name), {bigint: true});
        assert.deepEqual({ino: stat.ino, mtimeNs: stat.mtimeNs}, identities.get(name), name);
    }
});

test('rejects a stale create target before package installation', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const target = path.join(fixture.projectRoot, VISUAL_REVIEW_FILES[0]);
    fs.writeFileSync(target, 'appeared after approval\n', {mode: 0o644});
    let runCount = 0;

    const result = applyCandidate({
        contract: adapterContract,
        packageRoot: ADAPTER_ROOT,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'stale plan');
    assert.equal(runCount, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), 'appeared after approval\n');
});

test('rejects substituted candidate plans and ownership markers before mutation', (t) => {
    const fixtures = [];
    t.after(() => {
        for (const fixture of fixtures) {
            fs.rmSync(fixture.projectRoot, {recursive: true, force: true});
        }
    });
    const scenarios = [
        {
            name: 'candidate hash',
            mutate(fixture) {
                fs.appendFileSync(path.join(
                    fixture.projectRoot,
                    '.pi',
                    'prism-tool',
                    'work',
                    'candidate',
                    'package.json'
                ), 'substituted\n');
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'adapter identity',
            mutate(fixture) {
                fixture.plan.adapter = '@fixture/other-adapter';
                writeJson(fixture.planPath, fixture.plan);
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'project identity',
            mutate(fixture) {
                fixture.plan.projectRoot = path.dirname(fixture.projectRoot);
                writeJson(fixture.planPath, fixture.plan);
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'browser targets',
            mutate(fixture) {
                fixture.plan.browserTargets = ['chromium', 'firefox'];
                writeJson(fixture.planPath, fixture.plan);
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'managed file disposition',
            mutate(fixture) {
                fixture.plan.scaffold[VISUAL_REVIEW_FILES[0]].disposition = 'REPLACE';
                writeJson(fixture.planPath, fixture.plan);
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'managed candidate hash',
            mutate(fixture) {
                fs.appendFileSync(path.join(
                    fixture.projectRoot,
                    '.pi',
                    'prism-tool',
                    'work',
                    'candidate',
                    VISUAL_REVIEW_FILES[0]
                ), 'substituted\n');
            },
            workspaceRemains: false,
            reason: 'invalid plan',
        },
        {
            name: 'ownership marker',
            mutate(fixture) {
                writeJson(path.join(
                    fixture.projectRoot,
                    '.pi',
                    'prism-tool',
                    'work',
                    '.prism-workspace.json'
                ), {
                    schemaVersion: 1,
                    projectRoot: fs.realpathSync(fixture.projectRoot),
                    adapter: '@fixture/other-adapter',
                });
            },
            workspaceRemains: true,
            reason: 'ownership mismatch',
        },
    ];

    for (const scenario of scenarios) {
        const fixture = makeCandidateFixture();
        fixtures.push(fixture);
        scenario.mutate(fixture);
        let runCount = 0;

        const result = applyCandidate({
            contract: adapterContract,
            projectRoot: fixture.projectRoot,
            planPath: fixture.planPath,
            run() {
                runCount += 1;
                throw new Error('subprocess must not run');
            },
        });

        assert.equal(result.status, 'NO-GO', scenario.name);
        assert.equal(result.data.reason, scenario.reason, scenario.name);
        assert.equal(runCount, 0, scenario.name);
        assert.equal(
            fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')),
            scenario.workspaceRemains,
            scenario.name
        );
        for (const [name, content] of Object.entries({
            'composer.json': '{"name":"fixture/project"}\n',
            'composer.lock': '{"packages":[],"packages-dev":[]}\n',
            'package.json': '{"name":"fixture-project"}\n',
            'package-lock.json': '{"lockfileVersion":3,"packages":{}}\n',
        })) {
            assert.equal(fs.readFileSync(path.join(fixture.projectRoot, name), 'utf8'), content, scenario.name);
        }
    }
});

test('rolls back every original state when atomic replacement fails before installation', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    for (const name of ['composer.lock', 'package-lock.json']) {
        fs.rmSync(path.join(fixture.projectRoot, name));
        fixture.plan.original[name] = 'absent';
    }
    writeJson(fixture.planPath, fixture.plan);
    const original = Object.fromEntries([
        ['composer.json', fs.readFileSync(path.join(fixture.projectRoot, 'composer.json'))],
        ['composer.lock', null],
        ['package.json', fs.readFileSync(path.join(fixture.projectRoot, 'package.json'))],
        ['package-lock.json', null],
    ]);
    let renameCount = 0;
    let runCount = 0;

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        rename(source, destination) {
            renameCount += 1;
            if (renameCount === 6) throw new Error('fixture rename failure');
            fs.renameSync(source, destination);
        },
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'transaction failure');
    assert.equal(renameCount >= 3, true);
    assert.equal(runCount, 0);
    for (const [name, content] of Object.entries(original)) {
        const filePath = path.join(fixture.projectRoot, name);
        if (content === null) assert.equal(fs.existsSync(filePath), false, name);
        else assert.deepEqual(fs.readFileSync(filePath), content, name);
    }
    for (const name of VISUAL_REVIEW_FILES) {
        assert.equal(fs.existsSync(path.join(fixture.projectRoot, name)), false, name);
    }
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('applies dependency and canonical visual review files with Chromium only', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const originalModes = {
        'composer.json': 0o640,
        'composer.lock': 0o600,
        'package.json': 0o644,
        'package-lock.json': 0o660,
    };
    for (const [name, mode] of Object.entries(originalModes)) {
        fs.chmodSync(path.join(fixture.projectRoot, name), mode);
    }
    const invocations = [];
    const executableVersions = new Map(
        adapterContract.components
            .filter(({kind}) => kind === 'command')
            .map((component) => [component.executable, component.version])
    );
    const run = (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd});
        if (command === 'composer' && args[0] === 'install') {
            for (const executable of ['php-cs-fixer', 'pest']) {
                const executablePath = path.join(fixture.projectRoot, 'vendor', 'bin', executable);
                fs.mkdirSync(path.dirname(executablePath), {recursive: true});
                fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', {mode: 0o755});
                fs.chmodSync(executablePath, 0o755);
            }
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'ci') {
            for (const executable of ['sass', 'uglifyjs', 'eslint', 'stylelint', 'playwright']) {
                const executablePath = path.join(fixture.projectRoot, 'node_modules', '.bin', executable);
                fs.mkdirSync(path.dirname(executablePath), {recursive: true});
                fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', {mode: 0o755});
                fs.chmodSync(executablePath, 0o755);
            }
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":{}}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        const executable = path.basename(command);
        if (args[0] === 'install' && executable === 'playwright') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (executableVersions.has(executable)) {
            return {
                status: 0,
                stdout: `${executable} ${executableVersions.get(executable)}\n`,
                stderr: '',
                error: undefined,
            };
        }
        throw new Error(`unexpected command ${command}`);
    };

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run,
    });

    assert.equal(result.status, 'GO');
    assert.deepEqual(invocations.slice(0, 3).map(({command, args}) => ({
        command: path.basename(command),
        args,
    })), [
        {command: 'composer', args: ['install', '--no-scripts', '--no-interaction']},
        {command: 'npm', args: ['ci', '--ignore-scripts']},
        {command: 'playwright', args: ['install', 'chromium']},
    ]);
    for (const [name, content] of Object.entries(fixture.candidateFiles)) {
        const filePath = path.join(fixture.projectRoot, name);
        assert.equal(fs.readFileSync(filePath, 'utf8'), content, name);
        assert.equal(fs.statSync(filePath).mode & 0o777, originalModes[name], name);
    }
    for (const [name, content] of Object.entries(fixture.visualReviewFiles)) {
        const filePath = path.join(fixture.projectRoot, name);
        assert.deepEqual(fs.readFileSync(filePath), content, name);
        assert.equal(fs.statSync(filePath).mode & 0o777, 0o644, name);
    }
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('retains desired files and reports the fixed retry when Chromium installation fails', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const run = (command, args) => {
        if (command === 'composer' && args[0] === 'install') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'ci') {
            const executablePath = path.join(
                fixture.projectRoot,
                'node_modules',
                '.bin',
                'playwright'
            );
            fs.mkdirSync(path.dirname(executablePath), {recursive: true});
            fs.writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', {mode: 0o755});
            fs.chmodSync(executablePath, 0o755);
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (path.basename(command) === 'playwright' && args[0] === 'install') {
            return {status: 1, stdout: 'CANARY-BROWSER-OUTPUT', stderr: '', error: undefined};
        }
        throw new Error(`unexpected command ${command}`);
    };

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run,
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'post-apply failure');
    assert.equal(result.data.retry, 'playwright install chromium');
    assert.doesNotMatch(JSON.stringify(result), /CANARY-/);
    for (const [name, content] of Object.entries(fixture.candidateFiles)) {
        assert.equal(fs.readFileSync(path.join(fixture.projectRoot, name), 'utf8'), content, name);
    }
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('retains desired files when a post-install audit reports an advisory', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    const run = (command, args) => {
        if (command === 'composer' && args[0] === 'install') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'ci') {
            writeConsumerExecutables(fixture.projectRoot);
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (path.basename(command) === 'playwright' && args[0] === 'install') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {
                status: 1,
                stdout: '{"advisories":{"fixture/package":[{"advisoryId":"CVE-2099-0001","severity":"low"}]} }',
                stderr: 'CANARY-AUDIT-OUTPUT',
                error: undefined,
            };
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        throw new Error(`unexpected command ${command}`);
    };

    const result = applyCandidate({
        contract: adapterContract,
        projectRoot: fixture.projectRoot,
        planPath: fixture.planPath,
        run,
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.data.reason, 'post-apply failure');
    assert.equal(
        result.data.retry,
        'prism-tool setup verify --adapter=@kyaulabs/prism-php-web --network-approved=yes'
    );
    assert.doesNotMatch(JSON.stringify(result), /CANARY-/);
    for (const [name, content] of Object.entries(fixture.candidateFiles)) {
        assert.equal(fs.readFileSync(path.join(fixture.projectRoot, name), 'utf8'), content, name);
    }
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('dispatches literal approval as an approved adapter application', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    configureSourceAdapter(fixture.projectRoot);
    const externalBin = path.join(fixture.projectRoot, 'external-bin');
    writeExecutable(path.join(externalBin, 'semgrep'), 'exit 0');
    writeExecutable(path.join(externalBin, 'ocr'), 'exit 0');
    const run = (command, args) => {
        const executable = path.basename(command);
        if (executable === 'semgrep') {
            return {status: 0, stdout: '1.173.0\n', stderr: '', error: undefined};
        }
        if (executable === 'ocr') {
            return {
                status: 0,
                stdout: 'open-code-review v1.9.1 linux/amd64\n',
                stderr: '',
                error: undefined,
            };
        }
        if (command === 'composer' && args[0] === 'install') {
            return {status: 1, stdout: 'CANARY-INSTALL-OUTPUT', stderr: '', error: undefined};
        }
        throw new Error(`unexpected command ${command}`);
    };

    const result = captureWrites(() => main([
        'setup',
        'apply',
        '--adapter=@kyaulabs/prism-php-web',
        `--plan=${fixture.planPath}`,
        '--json',
        '--approval=yes',
    ], {
        projectRoot: fixture.projectRoot,
        env: {PATH: externalBin},
        run,
    }));

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /CANARY-/);
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, 'setup apply');
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.data.retry, 'composer install --no-scripts --no-interaction');
});

test('rejects lockfile and executable version drift during final verification', (t) => {
    const fixtures = [];
    t.after(() => {
        for (const fixture of fixtures) {
            fs.rmSync(fixture.projectRoot, {recursive: true, force: true});
        }
    });

    const lockFixture = makeCandidateFixture();
    fixtures.push(lockFixture);
    for (const [name, content] of Object.entries(lockFixture.candidateFiles)) {
        fs.writeFileSync(path.join(lockFixture.projectRoot, name), content);
    }
    const npmLock = JSON.parse(fs.readFileSync(path.join(lockFixture.projectRoot, 'package-lock.json'), 'utf8'));
    npmLock.packages['node_modules/stylelint'].version = '17.14.2';
    writeJson(path.join(lockFixture.projectRoot, 'package-lock.json'), npmLock);
    assert.throws(
        () => verifyInstalledGraph({
            contract: adapterContract,
            projectRoot: lockFixture.projectRoot,
            run() {
                throw new Error('version subprocess must not run');
            },
        }),
        /installed lock graph does not match/
    );

    const commandFixture = makeCandidateFixture();
    fixtures.push(commandFixture);
    for (const [name, content] of Object.entries(commandFixture.candidateFiles)) {
        fs.writeFileSync(path.join(commandFixture.projectRoot, name), content);
    }
    writeConsumerExecutables(commandFixture.projectRoot);
    const versions = new Map(
        adapterContract.components
            .filter(({kind}) => kind === 'command')
            .map((component) => [component.executable, component.version])
    );
    versions.set('pest', '5.1.2');
    assert.throws(
        () => verifyInstalledGraph({
            contract: adapterContract,
            projectRoot: commandFixture.projectRoot,
            run(command) {
                return {
                    status: 0,
                    stdout: `${path.basename(command)} ${versions.get(path.basename(command))}\n`,
                    stderr: '',
                    error: undefined,
                };
            },
        }),
        /installed command version does not match/
    );
});

test('rejects verify without literal network approval before subprocess execution', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    configureSourceAdapter(projectRoot);
    let runCount = 0;

    const result = captureWrites(() => main([
        'setup',
        'verify',
        '--adapter=@kyaulabs/prism-php-web',
        '--network-approved=no',
    ], {
        projectRoot,
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /network approval required/);
    assert.equal(runCount, 0);
});

test('verifies the installed lock graph, audits, and command versions after approval', (t) => {
    const fixture = makeCandidateFixture();
    t.after(() => fs.rmSync(fixture.projectRoot, {recursive: true, force: true}));
    for (const [name, content] of Object.entries(fixture.candidateFiles)) {
        fs.writeFileSync(path.join(fixture.projectRoot, name), content);
    }
    recoverWorkspace({projectRoot: fixture.projectRoot, adapter: adapterContract.package});
    configureSourceAdapter(fixture.projectRoot);
    writeConsumerExecutables(fixture.projectRoot);
    const externalBin = path.join(fixture.projectRoot, 'external-bin');
    writeExecutable(path.join(externalBin, 'semgrep'), 'exit 0');
    writeExecutable(path.join(externalBin, 'ocr'), 'exit 0');
    const executableVersions = new Map(
        adapterContract.components
            .filter(({kind}) => kind === 'command')
            .map((component) => [component.executable, component.version])
    );
    const run = (command, args) => {
        const executable = path.basename(command);
        if (executable === 'semgrep') {
            return {status: 0, stdout: '1.173.0\n', stderr: '', error: undefined};
        }
        if (executable === 'ocr') {
            return {
                status: 0,
                stdout: 'open-code-review v1.9.1 linux/amd64\n',
                stderr: '',
                error: undefined,
            };
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":{}}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        if (executableVersions.has(executable)) {
            return {
                status: 0,
                stdout: `${executable} ${executableVersions.get(executable)}\n`,
                stderr: '',
                error: undefined,
            };
        }
        throw new Error(`unexpected command ${command}`);
    };

    const result = captureWrites(() => main([
        'setup',
        'verify',
        '--adapter=@kyaulabs/prism-php-web',
        '--json',
        '--network-approved=yes',
    ], {
        projectRoot: fixture.projectRoot,
        env: {PATH: externalBin},
        run,
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, 'setup verify');
    assert.equal(report.status, 'GO');
    assert.deepEqual(report.data.audit, {critical: 0, high: 0, moderate: 0, low: 0});
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
