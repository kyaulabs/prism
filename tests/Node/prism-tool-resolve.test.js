// $KYAULabs: prism-tool-resolve.test.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {loadContract} = require('../../packages/prism-core/scripts/prism-tool/contract');
const {
    normalizeComposerAudit,
    normalizeNpmAudit,
} = require('../../packages/prism-php-web/scripts/toolchain/audit');
const {
    createWorkspace,
    recoverWorkspace,
} = require('../../packages/prism-php-web/scripts/toolchain/workspace');
const {
    resolveCandidate,
} = require('../../packages/prism-php-web/scripts/toolchain/transaction');
const {makeTempDir, sha256, writeExecutable, writeJson} = require('./helpers');

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

test('declares only the owned candidate workspace as a core cleanup safe zone', () => {
    const safeDirs = JSON.parse(fs.readFileSync(path.resolve(
        __dirname,
        '../../packages/prism-core/safe-dirs.json'
    ), 'utf8')).safe_rm_dirs;

    assert.equal(safeDirs.includes('.pi/prism-tool/work'), true);
    assert.equal(safeDirs.includes('.pi/prism-tool'), false);
});

test('resolves exact candidate graphs in isolation with scripts disabled', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    const sourceFiles = {
        'composer.json': '{"require-dev":{"pestphp/pest":"^4"}}\n',
        'composer.lock': '{"packages-dev":[]}\n',
        'package.json': '{"devDependencies":{"eslint":"^9"}}\n',
        'package-lock.json': '{"lockfileVersion":3,"packages":{}}\n',
    };
    for (const [name, content] of Object.entries(sourceFiles)) {
        fs.writeFileSync(path.join(projectRoot, name), content);
    }
    const invocations = [];
    const run = (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd});
        if (command === 'composer' && args[0] === 'require') {
            writeJson(path.join(options.cwd, 'composer.json'), {
                'require-dev': {
                    'friendsofphp/php-cs-fixer': '3.95.18',
                    'pestphp/pest': '5.1.1',
                    'pestphp/pest-plugin-browser': '5.0.1',
                },
            });
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'composer' && args[0] === 'update') {
            writeJson(path.join(options.cwd, 'composer.lock'), {packages: [], 'packages-dev': []});
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'install') {
            writeJson(path.join(options.cwd, 'package.json'), {devDependencies: {fixture: '1.0.0'}});
            writeJson(path.join(options.cwd, 'package-lock.json'), {lockfileVersion: 3, packages: {}});
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
        if (command === 'git') {
            return {status: 1, stdout: 'diff fixture\n', stderr: '', error: undefined};
        }
        throw new Error(`unexpected command ${command}`);
    };
    const contract = loadContract(path.resolve(
        __dirname,
        '../../packages/prism-php-web/toolchain.json'
    ));

    const result = resolveCandidate({contract, projectRoot, run});

    assert.equal(result.status, 'GO');
    assert.equal(result.data.diff, 'diff fixture\n'.repeat(4));
    const plan = JSON.parse(fs.readFileSync(result.data.planPath, 'utf8'));
    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.adapter, '@kyaulabs/prism-php-web');
    assert.equal(plan.projectRoot, fs.realpathSync(projectRoot));
    assert.deepEqual(plan.audit, {critical: 0, high: 0, moderate: 0, low: 0});
    assert.deepEqual(plan.browserTargets, ['chromium']);
    for (const [name, content] of Object.entries(sourceFiles)) {
        assert.equal(fs.readFileSync(path.join(projectRoot, name), 'utf8'), content);
        assert.equal(plan.original[name], sha256(content));
        const candidatePath = path.join(path.dirname(result.data.planPath), 'candidate', name);
        assert.equal(plan.candidate[name], sha256(fs.readFileSync(candidatePath)));
    }
    assert.deepEqual(invocations.slice(0, 5).map(({command, args}) => ({command, args})), [
        {command: 'composer', args: ['require', '--dev', '--no-update', '--no-scripts', '--no-interaction', 'friendsofphp/php-cs-fixer:3.95.18', 'pestphp/pest:5.1.1', 'pestphp/pest-plugin-browser:5.0.1']},
        {command: 'composer', args: ['update', 'friendsofphp/php-cs-fixer:3.95.18', 'pestphp/pest:5.1.1', 'pestphp/pest-plugin-browser:5.0.1', '--with-all-dependencies', '--no-install', '--no-scripts', '--no-interaction']},
        {command: 'npm', args: ['install', '--package-lock-only', '--ignore-scripts', '--save-dev', '--save-exact', 'sass@1.102.0', 'uglify-js@3.19.3', 'eslint@10.8.1', '@eslint/js@10.0.1', 'stylelint@17.14.1', 'stylelint-config-standard-scss@17.0.0', 'playwright@1.62.1']},
        {command: 'composer', args: ['audit', '--locked', '--format=json']},
        {command: 'npm', args: ['audit', '--package-lock-only', '--json']},
    ]);
    assert.equal(invocations.slice(5).length, 4);
    for (const invocation of invocations.slice(5)) {
        assert.equal(invocation.command, 'git');
        assert.deepEqual(invocation.args.slice(0, 3), ['diff', '--no-index', '--']);
        assert.equal(invocation.args.length, 5);
    }
});

test('blocks every advisory severity and cleans the owned workspace', (t) => {
    const roots = [];
    t.after(() => {
        for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
    });
    const contract = loadContract(path.resolve(
        __dirname,
        '../../packages/prism-php-web/toolchain.json'
    ));
    for (const severity of ['critical', 'high', 'moderate', 'low']) {
        const projectRoot = makeTempDir();
        roots.push(projectRoot);
        fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
        const sourceFiles = {
            'composer.json': '{}\n',
            'composer.lock': '{}\n',
            'package.json': '{}\n',
            'package-lock.json': '{}\n',
        };
        for (const [name, content] of Object.entries(sourceFiles)) {
            fs.writeFileSync(path.join(projectRoot, name), content);
        }
        const run = (command, args, options) => {
            if (command === 'composer' && args[0] === 'update') {
                writeJson(path.join(options.cwd, 'composer.lock'), {packages: []});
            }
            if (command === 'npm' && args[0] === 'install') {
                writeJson(path.join(options.cwd, 'package-lock.json'), {lockfileVersion: 3});
            }
            if (command === 'composer' && args[0] === 'audit') {
                return {
                    status: 1,
                    stdout: JSON.stringify({
                        advisories: {fixture: [{advisoryId: 'CVE-2099-0001', severity}]},
                    }),
                    stderr: '',
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
            return {status: 0, stdout: '', stderr: '', error: undefined};
        };

        const result = resolveCandidate({contract, projectRoot, run});

        assert.equal(result.status, 'NO-GO');
        assert.equal(result.data.reason, 'advisory');
        assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool', 'work')), false);
        for (const [name, content] of Object.entries(sourceFiles)) {
            assert.equal(fs.readFileSync(path.join(projectRoot, name), 'utf8'), content);
        }
    }
});

test('cleans failed candidates and preserves consumer files byte-for-byte', (t) => {
    const roots = [];
    t.after(() => {
        for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
    });
    const contract = loadContract(path.resolve(
        __dirname,
        '../../packages/prism-php-web/toolchain.json'
    ));
    for (const failure of ['conflict', 'malformed-audit']) {
        const projectRoot = makeTempDir();
        roots.push(projectRoot);
        fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
        const sourceFiles = {
            'composer.json': '{"name":"fixture/project"}\n',
            'composer.lock': '{}\n',
            'package.json': '{"name":"fixture-project"}\n',
            'package-lock.json': '{}\n',
        };
        for (const [name, content] of Object.entries(sourceFiles)) {
            fs.writeFileSync(path.join(projectRoot, name), content);
        }
        const run = (command, args, options) => {
            if (failure === 'conflict' && command === 'composer' && args[0] === 'update') {
                return {status: 2, stdout: 'CANARY-TOOL-SECRET', stderr: '', error: undefined};
            }
            if (command === 'composer' && args[0] === 'update') {
                writeJson(path.join(options.cwd, 'composer.lock'), {packages: []});
            }
            if (command === 'npm' && args[0] === 'install') {
                writeJson(path.join(options.cwd, 'package-lock.json'), {lockfileVersion: 3});
            }
            if (command === 'composer' && args[0] === 'audit') {
                const stdout = failure === 'malformed-audit'
                    ? 'CANARY-AUDIT-SECRET-{'
                    : '{"advisories":{}}';
                return {status: failure === 'malformed-audit' ? 1 : 0, stdout, stderr: '', error: undefined};
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
        };

        const result = resolveCandidate({contract, projectRoot, run});

        assert.equal(result.status, 'NO-GO');
        assert.equal(result.data.reason, 'tool failure');
        assert.doesNotMatch(JSON.stringify(result), /CANARY-/);
        assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool', 'work')), false);
        for (const [name, content] of Object.entries(sourceFiles)) {
            assert.equal(fs.readFileSync(path.join(projectRoot, name), 'utf8'), content);
        }
    }
});

test('rejects symlinked consumer manifests before creating a workspace', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    const target = path.join(outside, 'composer.json');
    fs.writeFileSync(target, '{}\n');
    fs.symlinkSync(target, path.join(projectRoot, 'composer.json'));
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}\n');
    let runCount = 0;
    const contract = loadContract(path.resolve(
        __dirname,
        '../../packages/prism-php-web/toolchain.json'
    ));

    const result = resolveCandidate({
        contract,
        projectRoot,
        run() {
            runCount += 1;
            throw new Error('subprocess must not run');
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(runCount, 0);
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool')), false);
    assert.equal(fs.readFileSync(target, 'utf8'), '{}\n');
});

test('rejects a workspace root outside the exact project-owned path', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'composer.json'), '{}\n');
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}\n');
    let runCount = 0;
    const contract = loadContract(path.resolve(
        __dirname,
        '../../packages/prism-php-web/toolchain.json'
    ));

    const result = resolveCandidate({
        contract,
        projectRoot,
        workspaceRoot: path.join(projectRoot, 'other-work'),
        run() {
            runCount += 1;
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(runCount, 0);
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool')), false);
});

test('approved setup resolve dispatches to the selected adapter and emits JSON', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    configureSourceAdapter(projectRoot);
    for (const name of ['composer.json', 'composer.lock', 'package.json', 'package-lock.json']) {
        fs.writeFileSync(path.join(projectRoot, name), '{}\n');
    }
    const externalBin = path.join(projectRoot, 'bin');
    writeExecutable(path.join(externalBin, 'semgrep'), 'exit 0');
    writeExecutable(path.join(externalBin, 'ocr'), 'exit 0');
    let advisory = false;
    const run = (command, args, options) => {
        const executable = path.basename(command);
        if (executable === 'semgrep') {
            return {status: 0, stdout: '1.173.0', stderr: '', error: undefined};
        }
        if (executable === 'ocr') {
            return {status: 0, stdout: 'open-code-review v1.9.1 linux/amd64', stderr: '', error: undefined};
        }
        if (command === 'composer' && args[0] === 'update') {
            writeJson(path.join(options.cwd, 'composer.lock'), {packages: []});
        }
        if (command === 'npm' && args[0] === 'install') {
            writeJson(path.join(options.cwd, 'package-lock.json'), {lockfileVersion: 3});
        }
        if (command === 'composer' && args[0] === 'audit') {
            const stdout = advisory
                ? '{"advisories":{"fixture":[{"advisoryId":"CVE-2099-0001","severity":"low"}]}}'
                : '{"advisories":{}}';
            return {status: advisory ? 1 : 0, stdout, stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        if (command === 'git') {
            return {status: 1, stdout: 'diff fixture\n', stderr: '', error: undefined};
        }
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };

    const argv = [
        'setup',
        'resolve',
        '--adapter=@kyaulabs/prism-php-web',
        '--json',
        '--network-approved=yes',
    ];
    const context = {projectRoot, env: {PATH: externalBin}, run};
    const result = captureWrites(() => main(argv, context));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, 'setup resolve');
    assert.equal(report.adapter, '@kyaulabs/prism-php-web');
    assert.equal(report.status, 'GO');
    assert.match(report.data.planPath, /candidate-plan\.json$/);

    advisory = true;
    const blocked = captureWrites(() => main(argv, context));
    assert.equal(blocked.status, 5);
    assert.equal(JSON.parse(blocked.stdout).status, 'NO-GO');
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool', 'work')), false);
});

test('creates the exact ownership-marked project workspace with restrictive modes', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});

    const workspace = createWorkspace({
        projectRoot,
        adapter: '@kyaulabs/prism-php-web',
    });

    assert.equal(workspace.root, fs.realpathSync(path.join(projectRoot, '.pi', 'prism-tool', 'work')));
    assert.equal(fs.statSync(workspace.root).mode & 0o777, 0o700);
    assert.equal(fs.statSync(workspace.markerPath).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(workspace.markerPath, 'utf8')), {
        schemaVersion: 1,
        projectRoot: fs.realpathSync(projectRoot),
        adapter: '@kyaulabs/prism-php-web',
    });
});

test('recovers an interrupted workspace only for its canonical project and adapter', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    const workspace = createWorkspace({projectRoot, adapter: '@kyaulabs/prism-php-web'});
    fs.writeFileSync(path.join(workspace.root, 'interrupted'), 'stale\n');

    const recovered = recoverWorkspace({projectRoot, adapter: '@kyaulabs/prism-php-web'});

    assert.equal(recovered, true);
    assert.equal(fs.existsSync(workspace.root), false);
});

test('preserves a workspace whose ownership marker does not match', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    const workspace = createWorkspace({projectRoot, adapter: '@kyaulabs/prism-php-web'});
    writeJson(workspace.markerPath, {
        schemaVersion: 1,
        projectRoot: fs.realpathSync(projectRoot),
        adapter: '@fixture/other-adapter',
    });

    assert.throws(
        () => recoverWorkspace({projectRoot, adapter: '@kyaulabs/prism-php-web'}),
        /ownership marker does not match/
    );
    assert.equal(fs.existsSync(workspace.root), true);
});

test('normalizes valid Composer advisory JSON even when the audit exits non-zero', () => {
    const result = normalizeComposerAudit({
        status: 1,
        stdout: JSON.stringify({
            advisories: {
                'package/name': [{
                    advisoryId: 'CVE-2099-0001',
                    severity: 'low',
                    title: 'fixture',
                }],
            },
        }),
        stderr: '',
        error: undefined,
    });

    assert.deepEqual(result, {
        totals: {critical: 0, high: 0, moderate: 0, low: 1},
        findings: [{
            ecosystem: 'composer',
            package: 'package/name',
            id: 'CVE-2099-0001',
            severity: 'low',
        }],
    });
});

test('normalizes valid npm advisory JSON even when the audit exits non-zero', () => {
    const result = normalizeNpmAudit({
        status: 1,
        stdout: JSON.stringify({
            metadata: {
                vulnerabilities: {info: 0, low: 0, moderate: 1, high: 0, critical: 0},
            },
            vulnerabilities: {
                fixture: {
                    severity: 'moderate',
                    via: [{source: 1, title: 'fixture'}],
                },
            },
        }),
        stderr: '',
        error: undefined,
    });

    assert.deepEqual(result, {
        totals: {critical: 0, high: 0, moderate: 1, low: 0},
        findings: [{ecosystem: 'npm', package: 'fixture', id: '1', severity: 'moderate'}],
    });
});

test('rejects malformed, oversized, and failed audit output without relaying canaries', () => {
    for (const normalize of [normalizeComposerAudit, normalizeNpmAudit]) {
        for (const fixture of [
            {status: 1, stdout: 'CANARY-AUDIT-SECRET-{', stderr: 'CANARY-AUDIT-SECRET', error: undefined},
            {status: null, stdout: 'CANARY-AUDIT-SECRET', stderr: '', error: {code: 'ETIMEDOUT'}},
            {status: 1, stdout: `CANARY-AUDIT-SECRET${'x'.repeat(1048576)}`, stderr: '', error: undefined},
        ]) {
            assert.throws(
                () => normalize(fixture),
                (error) => {
                    assert.doesNotMatch(error.message, /CANARY-AUDIT-SECRET/);
                    return /audit (?:execution failed|output (?:is malformed|limit))/.test(error.message);
                }
            );
        }
    }
});

test('resolve rejects non-literal network approval before subprocesses or workspace mutation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    configureSourceAdapter(projectRoot);
    let runCount = 0;

    const result = captureWrites(() => main([
        'setup',
        'resolve',
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
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool')), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
