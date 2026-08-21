// $KYAULabs: prism-tool-commit.test.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

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

function completed(status, stdout = '', stderr = '') {
    return {status, stdout, stderr, error: undefined};
}

function makeCommitContext(t, overrides = {}) {
    const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-test-'));
    const gitDir = path.join(repository, '.git');
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(gitDir, 'index'), 'validated index');
    t.after(() => fs.rmSync(repository, {recursive: true, force: true}));
    const calls = [];
    const observed = {};
    let currentHead = '1'.repeat(40);
    let treeReads = 0;
    const run = (command, args, options = {}) => {
        calls.push({command, args, options});
        if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
            return completed(overrides.doctorFailure ? 1 : 0);
        }
        if (command === process.execPath && args.includes('commitlint')) {
            return completed(overrides.commitlintFailure ? 1 : 0);
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
            return completed(0, overrides.identity ?? 'Test User <test@example.com>\n');
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
            return completed(0, overrides.ocrModel ?? 'review-model\n');
        }
        if (command === 'bash' && path.basename(args[0]) === 'validate-branch-name.sh') {
            return completed(overrides.branchStatus ?? 0);
        }
        if (command === 'git' && args[0] === 'commit') {
            observed.messageFile = args[3];
            observed.messageMode = fs.statSync(args[3]).mode & 0o777;
            observed.message = fs.readFileSync(args[3], 'utf8');
            if (overrides.commitFailure) {
                return completed(1, '', overrides.commitFailureStderr ?? 'error: gpg failed to sign the data CANARY');
            }
            currentHead = '3'.repeat(40);
            return completed(0, `[branch ${currentHead.slice(0, 7)}] commit\n`);
        }
        if (command === 'git' && args.join(' ') === 'rev-parse --verify HEAD' &&
            currentHead === '3'.repeat(40) && overrides.postCommitHeadFailure) {
            return completed(1, '', 'CANARY-POST-COMMIT');
        }
        if (command === 'git' && args.join(' ') === 'write-tree') {
            if (!options.env?.GIT_INDEX_FILE && fs.existsSync(path.join(gitDir, 'index.lock'))) {
                return completed(1);
            }
            treeReads += 1;
            const tree = overrides.indexDrift && treeReads > 1 ? '4'.repeat(40) : '2'.repeat(40);
            return completed(0, `${tree}\n`);
        }
        const responses = new Map([
            ['rev-parse --show-toplevel', completed(0, `${repository}\n`)],
            ['symbolic-ref --quiet --short HEAD', overrides.detached
                ? completed(1)
                : completed(0, `${overrides.branch ?? 'fix/tester-abcd-commit-wrapper'}\n`)],
            ['rev-parse --verify HEAD', overrides.unborn && currentHead === '1'.repeat(40)
                ? completed(1)
                : completed(0, `${currentHead}\n`)],
            ['branch -r --list */develop', completed(0, overrides.remoteBranch ?? '')],
            ['branch -r --list */main', completed(0, overrides.remoteBranch ?? '')],
            ['diff --cached --quiet --', completed(overrides.emptyStage ? 0 : 1)],
            ['rev-parse --path-format=absolute --git-dir', completed(0, `${gitDir}\n`)],
            ['rev-parse --path-format=absolute --git-path index', completed(0, `${path.join(gitDir, 'index')}\n`)],
        ]);
        assert.equal(command, 'git');
        const key = args.join(' ');
        assert.equal(responses.has(key), true, key);
        return responses.get(key);
    };
    return {
        calls,
        context: {
            coreRoot: CORE_ROOT,
            cwd: repository,
            env: {...process.env, PI_MODEL: 'provider/implementation-model'},
            fs: new Proxy(fs, {
                get(target, property) {
                    if (property === 'unlinkSync' && overrides.cleanupFailure) {
                        return (file) => {
                            if (path.basename(file) === 'message.txt') throw new Error('cleanup CANARY');
                            return target.unlinkSync(file);
                        };
                    }
                    if (property === 'renameSync' && overrides.indexPublishFailure) {
                        return () => { throw new Error('publish CANARY'); };
                    }
                    return target[property];
                },
            }),
            randomBytes: () => Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
            run,
        },
        gitDir,
        observed,
        repository,
    };
}

test('commit command exposes only create', () => {
    for (const args of [
        ['commit'],
        ['commit', 'prepare', '--type', 'fix', '--subject', 'retired'],
        ['commit', 'apply', '--plan', '0'.repeat(32), '--approval=yes'],
        ['commit', 'discard', '--plan', '0'.repeat(32)],
    ]) {
        let calls = 0;
        const result = captureWrites(() => main(args, {run() { calls += 1; }}));
        assert.equal(result.status, 2, args.join(' '));
        assert.equal(calls, 0, args.join(' '));
        assert.match(result.stderr, /^usage: prism-tool commit create/);
    }
});

test('commit create renders the canonical message and creates one signed commit', (t) => {
    const {calls, context, gitDir, observed} = makeCommitContext(t);
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--scope', 'toolchain',
        '--subject', 'create signed commits atomically',
    ], context));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const message = [
        'fix(toolchain): create signed commits atomically',
        '',
        'Implemented-by: implementation-model',
        'Tested-by: review-model',
        'Signed-off-by: Test User <test@example.com>',
        '',
    ].join('\n');
    assert.equal(result.stdout, `${message}\nCommit: ${'3'.repeat(40)}\n`);
    const commitCall = calls.find(({command, args}) => command === 'git' && args[0] === 'commit');
    assert.deepEqual(commitCall.args.slice(0, 3), ['commit', '-S', '-F']);
    assert.equal(commitCall.options.env.GIT_INDEX_FILE, path.join(gitDir, 'index.lock'));
    assert.equal(observed.message, message);
    assert.equal(observed.messageMode, 0o600);
    assert.equal(fs.existsSync(observed.messageFile), false);
    assert.equal(fs.existsSync(path.join(gitDir, 'index.lock')), false);
    assert.equal(fs.existsSync(path.join(gitDir, 'prism-tool', 'commit-plans')), false);
});

test('commit create preserves a normalized body and issue reference', (t) => {
    const {context, repository} = makeCommitContext(t);
    const bodyFile = path.join(repository, 'commit-body.txt');
    fs.writeFileSync(bodyFile, 'Explain inert $(payload).\r\n\r\nSecond line.\r\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'preserve inert body',
        '--body-file', bodyFile, '--fixes', '336',
    ], context));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /fix: preserve inert body\n\nExplain inert \$\(payload\)\.\n\nSecond line\.\n\nFixes: #336\n/);
});

test('commit create rejects malformed structured controls before subprocesses', () => {
    const cases = [
        ['--type', 'revert', '--subject', 'not ordinary'],
        ['--type', 'fix', '--scope', 'bad..scope', '--subject', 'invalid scope'],
        ['--subject', 'out of order', '--type', 'fix'],
        ['--type', 'fix', '--type', 'feat', '--subject', 'duplicate'],
        ['--type', 'fix', '--subject', 'bad issue', '--refs', '0'],
        ['--type', 'fix', '--subject', 'conflict', '--fixes', '1', '--refs', '2'],
        ['--type', 'fix', '--subject', 'approval', '--approval=yes'],
    ];

    for (const args of cases) {
        let calls = 0;
        const result = captureWrites(() => main(['commit', 'create', ...args], {
            run() { calls += 1; },
        }));
        assert.equal(result.status, 2, args.join(' '));
        assert.equal(calls, 0, args.join(' '));
    }
});

test('commit create preserves only the protected-branch unborn root exception', (t) => {
    const allowed = makeCommitContext(t, {branch: 'develop', branchStatus: 3, unborn: true});
    assert.equal(captureWrites(() => main([
        'commit', 'create', '--type', 'docs', '--subject', 'seed repository',
    ], allowed.context)).status, 0);

    const blocked = makeCommitContext(t, {
        branch: 'develop', branchStatus: 3, unborn: true, remoteBranch: 'origin/develop\n',
    });
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'docs', '--subject', 'seed repository',
    ], blocked.context));
    assert.equal(result.status, 4);
    assert.match(result.stderr, /protected branch/);
});

test('commit create fails closed at readiness, repository, staged, and commitlint boundaries', (t) => {
    for (const [overrides, pattern, expected] of [
        [{doctorFailure: true}, /local readiness failed/, 3],
        [{detached: true}, /detached HEAD/, 4],
        [{emptyStage: true}, /staged changes are required/, 4],
        [{commitlintFailure: true}, /commitlint rejected/, 4],
    ]) {
        const fixture = makeCommitContext(t, overrides);
        const result = captureWrites(() => main([
            'commit', 'create', '--type', 'fix', '--subject', 'fail closed safely',
        ], fixture.context));
        assert.equal(result.status, expected);
        assert.match(result.stderr, pattern);
        assert.equal(fs.existsSync(path.join(fixture.gitDir, 'prism-tool')), false);
    }
});

test('commit create rejects unsafe body and attribution inputs', (t) => {
    const bodyFixture = makeCommitContext(t);
    const target = path.join(bodyFixture.repository, 'body-target.txt');
    const link = path.join(bodyFixture.repository, 'body-link.txt');
    fs.writeFileSync(target, 'body\n');
    fs.symlinkSync(target, link);
    assert.equal(captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'reject body link', '--body-file', link,
    ], bodyFixture.context)).status, 2);

    const modelFixture = makeCommitContext(t);
    modelFixture.context.env.PI_MODEL = 'provider/model\nInjected-by: attacker';
    assert.equal(captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'reject model injection',
    ], modelFixture.context)).status, 3);

    const identityFixture = makeCommitContext(t, {identity: 'bad identity\n'});
    assert.equal(captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'reject identity injection',
    ], identityFixture.context)).status, 3);
});

test('commit create rejects staged-index drift before invoking Git commit', (t) => {
    const {calls, context, gitDir} = makeCommitContext(t, {indexDrift: true});
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'detect index drift',
    ], context));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /repository state changed/);
    assert.equal(calls.some(({command, args}) => command === 'git' && args[0] === 'commit'), false);
    assert.equal(fs.existsSync(path.join(gitDir, 'index.lock')), false);
});

test('commit create sanitizes Git failure and cleans its private message', (t) => {
    const {context, observed} = makeCommitContext(t, {commitFailure: true});
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'fail signing safely',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /signed Git commit failed/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.equal(fs.existsSync(observed.messageFile), false);
});

test('commit create classifies hook rejection without relaying hook output', (t) => {
    const {context, observed} = makeCommitContext(t, {
        commitFailure: true,
        commitFailureStderr: 'CHANGELOG.md:1398: trailing blank line CANARY-HOOK',
    });
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'fail hook safely',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /repository hook rejected the commit/);
    assert.doesNotMatch(result.stderr, /signing/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.equal(fs.existsSync(observed.messageFile), false);
});

test('commit create classifies hook rejection that mentions signing policy', (t) => {
    const {context} = makeCommitContext(t, {
        commitFailure: true,
        commitFailureStderr: 'commit message is missing its signing-off trailer CANARY-HOOK',
    });
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'fail signing-policy hook',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /repository hook rejected the commit/);
    assert.doesNotMatch(result.stderr, /CANARY/);
});

test('commit create classifies git identity failure separately', (t) => {
    const {context} = makeCommitContext(t, {
        commitFailure: true,
        commitFailureStderr: 'Author identity unknown\n*** Please tell me who you are. CANARY-GIT',
    });
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'fail identity safely',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /Git commit identity is not configured/);
    assert.doesNotMatch(result.stderr, /CANARY/);
});

test('commit create cleans the index lock after publication failure', (t) => {
    const {context, gitDir} = makeCommitContext(t, {indexPublishFailure: true});
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'publish locked index',
    ], context));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /locked index publication failed/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.doesNotMatch(result.stdout, /Commit:/);
    assert.equal(fs.existsSync(path.join(gitDir, 'index.lock')), false);
});

test('commit create reports private message cleanup failure after signing', (t) => {
    const {context, observed} = makeCommitContext(t, {cleanupFailure: true});
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'report cleanup failure',
    ], context));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /private message cleanup failed/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.doesNotMatch(result.stdout, /Commit:/);
    assert.equal(fs.existsSync(observed.messageFile), true);
});

test('commit create treats post-commit verification failure as non-success', (t) => {
    const {context, observed} = makeCommitContext(t, {postCommitHeadFailure: true});
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'verify committed head',
    ], context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /committed HEAD is unavailable/);
    assert.doesNotMatch(result.stdout, /Commit:/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.equal(fs.existsSync(observed.messageFile), false);
});

test('commit create keeps message and attribution content out of subprocess argv', (t) => {
    const {calls, context} = makeCommitContext(t);
    const result = captureWrites(() => main([
        'commit', 'create', '--type', 'fix', '--subject', 'inert payload boundary',
    ], context));

    assert.equal(result.status, 0);
    for (const call of calls) {
        if (call.command === 'git' && call.args[0] === 'commit') continue;
        const argv = call.args.join(' ');
        assert.doesNotMatch(argv, /inert payload boundary/);
        assert.doesNotMatch(argv, /Test User|implementation-model|review-model/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
