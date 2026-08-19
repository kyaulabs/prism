// $KYAULabs: prism-tool-commit.test.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');

function captureWrites(callback) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: callback(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

test('commit command rejects a missing operation with commit-specific usage', () => {
    const result = captureWrites(() => main(['commit']));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /^usage: prism-tool commit prepare/);
});

function completed(status, stdout = '', stderr = '') {
    return {status, stdout, stderr, error: undefined};
}

function makePrepareContext(t, overrides = {}) {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-test-'));
    const gitDir = path.join(repository, '.git');
    fs.mkdirSync(gitDir);
    t.after(() => fs.rmSync(repository, {recursive: true, force: true}));
    const calls = [];
    let currentHead = '1'.repeat(40);
    const run = (command, args, options = {}) => {
        calls.push({command, args, options});
        if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
            return completed(0);
        }
        if (command === process.execPath && args.includes('commitlint')) return completed(0);
        if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
            return completed(0, 'Test User <test@example.com>\n');
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
            return completed(0, 'review-model\n');
        }
        if (command === 'bash' && path.basename(args[0]) === 'validate-branch-name.sh') {
            return completed(overrides.branchStatus ?? 0);
        }
        if (command === 'git' && args[0] === 'commit') {
            if (overrides.commitFailure) return completed(1, '', 'signing failed CANARY');
            currentHead = '3'.repeat(40);
            return completed(0, `[branch ${currentHead.slice(0, 7)}] commit\n`);
        }
        const responses = new Map([
            ['rev-parse --show-toplevel', completed(0, `${repository}\n`)],
            ['symbolic-ref --quiet --short HEAD', completed(0, `${overrides.branch ?? 'fix/tester-abcd-commit-wrapper'}\n`)],
            ['rev-parse --verify HEAD', overrides.unborn ? completed(1) : completed(0, `${currentHead}\n`)],
            ['branch -r --list */develop', completed(0, overrides.remoteBranch ?? '')],
            ['branch -r --list */main', completed(0, overrides.remoteBranch ?? '')],
            ['diff --cached --quiet --', completed(1)],
            ['ls-files --stage -z', overrides.indexFailure
                ? {status: null, stdout: Buffer.alloc(0), stderr: '', error: {code: 'ENOBUFS'}}
                : completed(0, Buffer.from(`100644 ${'2'.repeat(40)} 0\tfile.js\0`))],
            ['rev-parse --path-format=absolute --git-dir', completed(0, `${gitDir}\n`)],
        ]);
        assert.equal(command, 'git');
        const key = args.join(' ');
        assert.equal(responses.has(key), true, key);
        return responses.get(key);
    };
    return {calls, context: {
        coreRoot: CORE_ROOT,
        cwd: repository,
        env: {...process.env, PI_MODEL: 'provider/implementation-model'},
        now: () => '2026-08-18T00:00:00.000Z',
        randomBytes: () => Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        run,
    }, gitDir, repository};
}

test('commit prepare renders the canonical message and creates a private plan', (t) => {
    const {context, gitDir} = makePrepareContext(t);

    const result = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--scope', 'toolchain',
        '--subject', 'add launcher-owned commits',
    ], context));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const planId = '0123456789abcdef0123456789abcdef';
    const message = [
        'fix(toolchain): add launcher-owned commits',
        '',
        'Implemented-by: implementation-model',
        'Tested-by: review-model',
        'Signed-off-by: Test User <test@example.com>',
        '',
    ].join('\n');
    assert.equal(result.stdout, `${message}\nPlan: ${planId}\n`);
    const planDir = path.join(gitDir, 'prism-tool', 'commit-plans', planId);
    assert.equal(fs.readFileSync(path.join(planDir, 'message.txt'), 'utf8'), message);
    assert.equal(fs.statSync(planDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(planDir, 'plan.json')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.join(planDir, 'message.txt')).mode & 0o777, 0o600);
});

test('commit prepare rejects malformed structured controls before subprocesses', () => {
    const cases = [
        ['--type', 'revert', '--subject', 'not ordinary'],
        ['--type', 'fix', '--scope', 'bad..scope', '--subject', 'invalid scope'],
        ['--subject', 'out of order', '--type', 'fix'],
        ['--type', 'fix', '--type', 'feat', '--subject', 'duplicate'],
        ['--type', 'fix', '--subject', 'bad issue', '--refs', '0'],
        ['--type', 'fix', '--subject', 'conflict', '--fixes', '1', '--refs', '2'],
        ['--type', 'fix', '--subject', 'unknown', '--other', 'value'],
    ];

    for (const args of cases) {
        const result = captureWrites(() => main(['commit', 'prepare', ...args], {
            run() { throw new Error('subprocess must not run'); },
        }));
        assert.equal(result.status, 2, args.join(' '));
    }
});

test('commit prepare preserves a safe normalized body and issue reference', (t) => {
    const {context, repository} = makePrepareContext(t);
    const bodyFile = path.join(repository, 'commit-body.txt');
    fs.writeFileSync(bodyFile, 'Explain inert $(payload).\r\n\r\nSecond line.\r\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'preserve inert body',
        '--body-file', bodyFile, '--fixes', '336',
    ], context));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /fix: preserve inert body\n\nExplain inert \$\(payload\)\.\n\nSecond line\.\n\nFixes: #336\n/);
    const lint = context.run;
    assert.equal(typeof lint, 'function');
});

test('commit apply uses the frozen message and removes the approved plan', (t) => {
    const {calls, context, gitDir} = makePrepareContext(t);
    const planId = '0123456789abcdef0123456789abcdef';
    const prepared = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'apply frozen message',
    ], context));
    assert.equal(prepared.status, 0);

    const result = captureWrites(() => main([
        'commit', 'apply', '--plan', planId, '--approval=yes',
    ], context));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `Commit: ${'3'.repeat(40)}\n`);
    const commitCall = calls.find(({command, args}) => command === 'git' && args[0] === 'commit');
    assert.deepEqual(commitCall.args.slice(0, 3), ['commit', '-S', '-F']);
    assert.equal(path.basename(commitCall.args[3]), 'apply-message.txt');
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool', 'commit-plans', planId)), false);
});

test('commit prepare permits only the protected-branch unborn root exception', (t) => {
    const allowed = makePrepareContext(t, {branch: 'develop', branchStatus: 3, unborn: true});
    const result = captureWrites(() => main([
        'commit', 'prepare', '--type', 'docs', '--subject', 'seed repository',
    ], allowed.context));

    assert.equal(result.status, 0);

    const blocked = makePrepareContext(t, {
        branch: 'develop', branchStatus: 3, unborn: true, remoteBranch: 'origin/develop\n',
    });
    const rejected = captureWrites(() => main([
        'commit', 'prepare', '--type', 'docs', '--subject', 'seed repository',
    ], blocked.context));

    assert.equal(rejected.status, 4);
    assert.match(rejected.stderr, /protected branch/);
});

test('commit apply rejects stale state and invalidates the plan', (t) => {
    const {context, gitDir} = makePrepareContext(t);
    const planId = '0123456789abcdef0123456789abcdef';
    assert.equal(captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'bind approved state',
    ], context)).status, 0);
    const planFile = path.join(gitDir, 'prism-tool', 'commit-plans', planId, 'plan.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.branch = 'fix/tester-abcd-other-work';
    fs.writeFileSync(planFile, `${JSON.stringify(plan)}\n`, {mode: 0o600});

    const result = captureWrites(() => main([
        'commit', 'apply', '--plan', planId, '--approval=yes',
    ], context));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /plan is stale/);
    assert.equal(fs.existsSync(path.dirname(planFile)), false);
});

test('commit apply sanitizes Git failure and removes the plan', (t) => {
    const {context, gitDir} = makePrepareContext(t, {commitFailure: true});
    const planId = '0123456789abcdef0123456789abcdef';
    assert.equal(captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'fail signing safely',
    ], context)).status, 0);

    const result = captureWrites(() => main([
        'commit', 'apply', '--plan', planId, '--approval=yes',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /signed Git commit failed/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool', 'commit-plans', planId)), false);
});

test('commit prepare fails closed when the staged index exceeds its process bound', (t) => {
    const {context, gitDir} = makePrepareContext(t, {indexFailure: true});

    const result = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'bound index output',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /staged index fingerprint failed/);
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool')), false);
});

test('commit apply never follows a substituted plan-directory symlink during cleanup', (t) => {
    const {context, gitDir, repository} = makePrepareContext(t);
    const planId = '0123456789abcdef0123456789abcdef';
    assert.equal(captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'reject plan symlink',
    ], context)).status, 0);
    const planDir = path.join(gitDir, 'prism-tool', 'commit-plans', planId);
    const targetDir = path.join(repository, 'foreign-plan');
    fs.renameSync(planDir, targetDir);
    fs.symlinkSync(targetDir, planDir);

    const result = captureWrites(() => main([
        'commit', 'apply', '--plan', planId, '--approval=yes',
    ], context));

    assert.equal(result.status, 5);
    assert.equal(fs.readFileSync(path.join(targetDir, 'message.txt'), 'utf8').includes('reject plan symlink'), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'plan.json')), true);
});

test('commit prepare rejects unsafe body and attribution inputs without a plan', (t) => {
    const symlinkCase = makePrepareContext(t);
    const target = path.join(symlinkCase.repository, 'body-target.txt');
    const bodyLink = path.join(symlinkCase.repository, 'body-link.txt');
    fs.writeFileSync(target, 'body\n');
    fs.symlinkSync(target, bodyLink);
    const unsafeBody = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'reject body link',
        '--body-file', bodyLink,
    ], symlinkCase.context));
    assert.equal(unsafeBody.status, 2);
    assert.equal(fs.existsSync(path.join(symlinkCase.gitDir, 'prism-tool')), false);

    const attributionCase = makePrepareContext(t);
    attributionCase.context.env.PI_MODEL = 'provider/model\nInjected-by: attacker';
    const unsafeModel = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'reject model injection',
    ], attributionCase.context));
    assert.equal(unsafeModel.status, 3);
    assert.equal(fs.existsSync(path.join(attributionCase.gitDir, 'prism-tool')), false);
});

test('commit apply and discard reject approval, traversal, and unsafe plan modes', (t) => {
    const noApproval = captureWrites(() => main([
        'commit', 'apply', '--plan', '0'.repeat(32), '--approval=no',
    ], {run() { throw new Error('subprocess must not run'); }}));
    const traversal = captureWrites(() => main([
        'commit', 'discard', '--plan', '../../foreign',
    ], {run() { throw new Error('subprocess must not run'); }}));
    assert.equal(noApproval.status, 2);
    assert.equal(traversal.status, 2);

    const {context, gitDir} = makePrepareContext(t);
    const planId = '0123456789abcdef0123456789abcdef';
    assert.equal(captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'reject plan mode',
    ], context)).status, 0);
    const planDir = path.join(gitDir, 'prism-tool', 'commit-plans', planId);
    fs.chmodSync(path.join(planDir, 'message.txt'), 0o644);
    const unsafeMode = captureWrites(() => main([
        'commit', 'apply', '--plan', planId, '--approval=yes',
    ], context));
    assert.equal(unsafeMode.status, 5);
    assert.match(unsafeMode.stderr, /malformed or inaccessible/);
});

test('commit prepare keeps message and attribution content out of subprocess argv', (t) => {
    const {calls, context} = makePrepareContext(t);

    const result = captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'inert payload boundary',
    ], context));

    assert.equal(result.status, 0);
    for (const call of calls) {
        const argv = call.args.join(' ');
        assert.doesNotMatch(argv, /inert payload boundary/);
        assert.doesNotMatch(argv, /Test User|implementation-model|review-model/);
    }
});

test('commit discard removes an owned plan and is idempotent', (t) => {
    const {context, gitDir} = makePrepareContext(t);
    const planId = '0123456789abcdef0123456789abcdef';
    assert.equal(captureWrites(() => main([
        'commit', 'prepare', '--type', 'fix', '--subject', 'discard plan',
    ], context)).status, 0);

    const first = captureWrites(() => main(['commit', 'discard', '--plan', planId], context));
    const second = captureWrites(() => main(['commit', 'discard', '--plan', planId], context));

    assert.equal(first.status, 0);
    assert.equal(second.status, 0);
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool', 'commit-plans', planId)), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
