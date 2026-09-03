// $KYAULabs: prism-tool-pr.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

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

function completed(status, stdout = '') {
    return {status, stdout, stderr: '', error: undefined};
}

function makePreflightRun(overrides = new Map()) {
    const responses = new Map([
        ['symbolic-ref --quiet --short HEAD', completed(0, 'fix/tester-abcd-example\n')],
        ['status --porcelain', completed(0)],
        ['rev-parse --verify --quiet origin/develop^{commit}', completed(0, '1111111111111111111111111111111111111111\n')],
        ['rev-parse origin/develop^{commit}', completed(0, '1111111111111111111111111111111111111111\n')],
        ['rev-parse HEAD', completed(0, '2222222222222222222222222222222222222222\n')],
        ['merge-base origin/develop HEAD', completed(0, '1111111111111111111111111111111111111111\n')],
        ['rev-list --count 1111111111111111111111111111111111111111..HEAD', completed(0, '2\n')],
        ['rev-list --count --no-merges 1111111111111111111111111111111111111111..HEAD', completed(0, '2\n')],
        ['diff --quiet 1111111111111111111111111111111111111111..HEAD --', completed(1)],
        ...overrides,
    ]);
    return (command, args) => {
        if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
            return completed(0);
        }
        if (command === 'bash' && path.basename(args[0]) === 'validate-branch-name.sh') {
            assert.equal(args[1], 'fix/tester-abcd-example');
            return completed(0);
        }
        assert.equal(command, 'git');
        const key = args.join(' ');
        assert.equal(responses.has(key), true, key);
        return responses.get(key);
    };
}

test('pr preflight reports the exact branch attestation', () => {
    const run = makePreflightRun();

    const result = captureWrites(() => main(['pr', 'preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run,
        inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
        verifyCriteria: () => assert.fail('legacy chains must not verify criteria'),
        verifyCheck: () => assert.fail('legacy chains must not verify checks'),
        verifyReviewChainV2: () => assert.fail('legacy chains must not use version-two verification'),
        verifyReviewChain: (expected) => {
            assert.deepEqual(expected, {
                branch: 'fix/tester-abcd-example',
                baseRef: 'origin/develop',
                baseSha: '1111111111111111111111111111111111111111',
                headSha: '2222222222222222222222222222222222222222',
            });
            return {advisoryFindings: [{summary: 'follow-up cleanup'}]};
        },
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, [
        'BRANCH\tfix/tester-abcd-example',
        'TARGET_BRANCH\tdevelop',
        'BASE_REF\torigin/develop',
        'BASE_SHA\t1111111111111111111111111111111111111111',
        'HEAD_SHA\t2222222222222222222222222222222222222222',
        'MERGE_BASE\t1111111111111111111111111111111111111111',
        'COMMIT_COUNT\t2',
        'NON_MERGE_COUNT\t2',
        'REVIEW_CHAIN\tVALID',
        'REVIEW_CHAIN_VERSION\t1',
        'ADVISORY_COUNT\t1',
        '',
    ].join('\n'));
});

test('pr preflight selects a complete version-two chain as one unit', () => {
    const v1Calls = [];
    const result = captureWrites(() => main(['pr', 'preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'VALID', version: 2}),
        verifyCriteria: (expected) => {
            assert.deepEqual(expected, {branch: 'fix/tester-abcd-example'});
            return {digest: 'c'.repeat(64)};
        },
        verifyCheck: (expected) => {
            assert.deepEqual(expected, {
                branch: 'fix/tester-abcd-example',
                baseRef: 'origin/develop',
                baseSha: '1'.repeat(40),
                headSha: '2'.repeat(40),
            });
            return {digest: 'd'.repeat(64)};
        },
        verifyReviewChain: () => v1Calls.push('v1'),
        verifyReviewChainV2: (expected) => {
            assert.deepEqual(expected, {
                branch: 'fix/tester-abcd-example',
                baseRef: 'origin/develop',
                baseSha: '1'.repeat(40),
                headSha: '2'.repeat(40),
                criteriaDigest: 'c'.repeat(64),
                checkDigest: 'd'.repeat(64),
            });
            return {advisoryFindings: []};
        },
    }));

    assert.equal(result.status, 0);
    assert.equal(v1Calls.length, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tVALID/);
    assert.match(result.stdout, /REVIEW_CHAIN_VERSION\t2/);
    assert.doesNotMatch(result.stdout, /V2_RECOVERY/);
});

test('pr review-preflight reports an absent review chain', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'ABSENT'}),
        inspectCriteria: () => ({state: 'ABSENT'}),
        inspectCheck: () => ({state: 'ABSENT'}),
        verifyReviewChain: () => assert.fail('absent chain must not be verified'),
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tABSENT/);
    assert.match(result.stdout, /V2_RECOVERY\tUNDECLARED/);
    assert.doesNotMatch(result.stdout, /REVIEW_CHAIN_VERSION|ADVISORY_COUNT/);
});

test('pr review-preflight reports ready only for both exact version-two receipts', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'ABSENT'}),
        inspectCriteria: () => ({state: 'VALID'}),
        inspectCheck: () => ({state: 'VALID'}),
        verifyCriteria: (expected) => {
            assert.deepEqual(expected, {branch: 'fix/tester-abcd-example'});
            return {digest: 'c'.repeat(64)};
        },
        verifyCheck: (expected) => {
            assert.deepEqual(expected, {
                branch: 'fix/tester-abcd-example', baseRef: 'origin/develop',
                baseSha: '1'.repeat(40), headSha: '2'.repeat(40),
            });
            return {digest: 'd'.repeat(64)};
        },
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tABSENT/);
    assert.match(result.stdout, /V2_RECOVERY\tREADY/);
});

test('pr review-preflight rejects partial, stale, and unsafe recovery receipts', () => {
    const cases = [
        ['partial criteria', {state: 'VALID'}, {state: 'ABSENT'}, () => ({digest: 'c'.repeat(64)}),
            () => ({digest: 'd'.repeat(64)})],
        ['partial check', {state: 'ABSENT'}, {state: 'VALID'}, () => ({digest: 'c'.repeat(64)}),
            () => ({digest: 'd'.repeat(64)})],
        ['unsafe criteria', {state: 'UNSAFE'}, {state: 'ABSENT'}, () => ({digest: 'c'.repeat(64)}),
            () => ({digest: 'd'.repeat(64)})],
        ['stale criteria', {state: 'VALID'}, {state: 'VALID'}, () => { throw new Error('CANARY'); },
            () => ({digest: 'd'.repeat(64)})],
        ['stale check', {state: 'VALID'}, {state: 'VALID'}, () => ({digest: 'c'.repeat(64)}),
            () => { throw new Error('CANARY'); }],
    ];
    for (const [label, criteriaState, checkState, verifyCriteriaResult, verifyCheckResult] of cases) {
        const result = captureWrites(() => main(['pr', 'review-preflight'], {
            coreRoot: CORE_ROOT,
            cwd: '/repo',
            env: process.env,
            run: makePreflightRun(),
            inspectReviewChainV2: () => ({state: 'ABSENT'}),
            inspectCriteria: () => criteriaState,
            inspectCheck: () => checkState,
            verifyCriteria: verifyCriteriaResult,
            verifyCheck: verifyCheckResult,
        }));

        assert.equal(result.status, 4, label);
        assert.doesNotMatch(result.stdout, /V2_RECOVERY/, label);
        assert.doesNotMatch(result.stderr, /CANARY/, label);
    }
});

test('pr preflight rejects absent chain state without probing recovery receipts', () => {
    const result = captureWrites(() => main(['pr', 'preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'ABSENT'}),
        inspectCriteria: () => assert.fail('strict preflight must not inspect recovery receipts'),
        inspectCheck: () => assert.fail('strict preflight must not inspect recovery receipts'),
    }));

    assert.equal(result.status, 4);
    assert.equal(result.stdout, '');
});

test('pr preflight rejects stale or Blocking version-two state without falling back', () => {
    const cases = ['missing criteria', 'missing check', 'open Blocking'];
    for (const label of cases) {
        const v1Calls = [];
        const result = captureWrites(() => main(['pr', 'preflight'], {
            coreRoot: CORE_ROOT,
            cwd: '/repo',
            env: process.env,
            run: makePreflightRun(),
            inspectReviewChainV2: () => ({state: 'VALID', version: 2}),
            verifyCriteria: label === 'missing criteria'
                ? () => { throw new Error('CANARY'); }
                : () => ({digest: 'c'.repeat(64)}),
            verifyCheck: label === 'missing check'
                ? () => { throw new Error('CANARY'); }
                : () => ({digest: 'd'.repeat(64)}),
            verifyReviewChain: () => v1Calls.push('fallback'),
            verifyReviewChainV2: () => { throw new Error('CANARY'); },
        }));

        assert.equal(result.status, 4, label);
        assert.equal(v1Calls.length, 0, label);
        assert.equal(result.stdout, '', label);
        assert.doesNotMatch(result.stderr, /CANARY/, label);
    }
});

test('pr review-preflight verifies a present chain', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
        verifyReviewChain: () => ({
            advisoryFindings: [{summary: 'follow-up cleanup'}],
        }),
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /REVIEW_CHAIN\tVALID/);
    assert.match(result.stdout, /ADVISORY_COUNT\t1/);
});

test('pr review-preflight rejects unsafe review-chain state', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'UNSAFE'}),
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review chain is unsafe or invalid/);
});

test('pr review-preflight rejects unusable present review-chain evidence', () => {
    const result = captureWrites(() => main(['pr', 'review-preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
        verifyReviewChain: () => { throw new Error('CANARY'); },
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review chain is incomplete, stale, or has unresolved Blocking findings/);
    assert.doesNotMatch(result.stderr, /CANARY/);
});

test('pr preflight accepts SHA-256 object ids', () => {
    const base = '1'.repeat(64);
    const head = '2'.repeat(64);
    const run = makePreflightRun(new Map([
        ['rev-parse --verify --quiet origin/develop^{commit}', completed(0, `${base}\n`)],
        ['rev-parse origin/develop^{commit}', completed(0, `${base}\n`)],
        ['rev-parse HEAD', completed(0, `${head}\n`)],
        ['merge-base origin/develop HEAD', completed(0, `${base}\n`)],
        [`rev-list --count ${base}..HEAD`, completed(0, '2\n')],
        [`rev-list --count --no-merges ${base}..HEAD`, completed(0, '2\n')],
        [`diff --quiet ${base}..HEAD --`, completed(1)],
    ]));

    const result = captureWrites(() => main(['pr', 'preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run,
        inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
        verifyReviewChain: () => ({advisoryFindings: []}),
    }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(`BASE_SHA\\t${base}`));
    assert.match(result.stdout, new RegExp(`HEAD_SHA\\t${head}`));
});

test('pr preflight fails closed with stable diagnostics', () => {
    const cases = [
        ['symbolic-ref --quiet --short HEAD', completed(1, 'CANARY'), 'detached HEAD; switch to a work branch'],
        ['status --porcelain', completed(0, ' M file\n'), 'working tree is not clean'],
        ['rev-parse --verify --quiet origin/develop^{commit}', completed(1, 'CANARY'), 'missing synchronized remote-tracking ref origin/develop'],
        ['rev-list --count 1111111111111111111111111111111111111111..HEAD', completed(0, '0\n'), 'no commits ahead of origin/develop'],
        ['rev-list --count --no-merges 1111111111111111111111111111111111111111..HEAD', completed(0, '0\n'), 'branch range contains no non-merge commit'],
        ['diff --quiet 1111111111111111111111111111111111111111..HEAD --', completed(0), 'branch has no net diff against its merge-base'],
        ['diff --quiet 1111111111111111111111111111111111111111..HEAD --', completed(2, 'CANARY'), 'cannot inspect branch net diff'],
    ];

    for (const [key, response, diagnostic] of cases) {
        const result = captureWrites(() => main(['pr', 'preflight'], {
            coreRoot: CORE_ROOT,
            cwd: '/repo',
            env: process.env,
            run: makePreflightRun(new Map([[key, response]])),
            inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
            verifyReviewChain: () => ({advisoryFindings: []}),
        }));

        assert.notEqual(result.status, 0, key);
        assert.match(result.stderr, new RegExp(diagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), key);
        assert.doesNotMatch(result.stderr, /CANARY/, key);
    }
});

test('pr preflight rejects invalid review-chain evidence', () => {
    const result = captureWrites(() => main(['pr', 'preflight'], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: process.env,
        run: makePreflightRun(),
        inspectReviewChainV2: () => ({state: 'LEGACY', version: 1}),
        verifyReviewChain: () => { throw new Error('CANARY'); },
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review chain is incomplete, stale, or has unresolved Blocking findings/);
    assert.doesNotMatch(result.stderr, /CANARY/);
});

test('pr title validation preserves title data and writes synthetic trailers', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): preserve inert $(payload) text\r\n', {mode: 0o600});

    const run = (command, args) => {
        if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
            return completed(0);
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
            return completed(0, 'Test User <test@example.com>\n');
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
            return completed(0, 'review-model\n');
        }
        assert.equal(command, process.execPath);
        assert.deepEqual(args, [
            path.join(CORE_ROOT, 'scripts', 'prism-tool.js'),
            'run',
            'commitlint',
            '--',
            '--edit',
            validationFile,
        ]);
        return completed(0);
    };

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/implementation-model'},
        run,
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(validationFile, 'utf8'), [
        'feat(core): preserve inert $(payload) text',
        '',
        'Implemented-by: implementation-model',
        'Tested-by: review-model',
        'Signed-off-by: Test User <test@example.com>',
        '',
    ].join('\n'));
    assert.equal(fs.statSync(validationFile).mode & 0o777, 0o600);
});

test('pr title validation rejects malformed model attribution', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): safe title\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model\nInjected-by: attacker'},
        run(command, args) {
            assert.equal(command, process.execPath);
            assert.equal(args.slice(-2).join(' '), 'doctor --local-only');
            return completed(0);
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /current pi model is required/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation rejects an empty model id segment', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): safe title\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/'},
        run(command, args) {
            if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
                return completed(0);
            }
            if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
                return completed(0, 'Test User <test@example.com>\n');
            }
            if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
                return completed(0, 'review-model\n');
            }
            return completed(0);
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /current pi model is required/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation rejects malformed identity output', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): safe title\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model'},
        run(command, args) {
            if (command === process.execPath) return completed(0);
            assert.equal(path.basename(args[0]), 'resolve-identity.sh');
            return completed(0, 'Test User <test@example.com>\nInjected-by: attacker\n');
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /identity could not be resolved/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation rejects malformed OCR model output', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): safe title\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model'},
        run(command, args) {
            if (command === process.execPath) return completed(0);
            if (path.basename(args[0]) === 'resolve-identity.sh') {
                return completed(0, 'Test User <test@example.com>\n');
            }
            assert.equal(path.basename(args[0]), 'resolve-ocr-model.sh');
            return completed(0, 'review-model\nInjected-by: attacker\n');
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /OCR model could not be resolved/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation refuses a symlink title input', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const targetFile = path.join(workDir, 'target.txt');
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(targetFile, 'feat(core): concealed title\n', {mode: 0o600});
    fs.symlinkSync(targetFile, titleFile);

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model'},
        run(command, args) {
            if (command === process.execPath) return completed(0);
            if (path.basename(args[0]) === 'resolve-identity.sh') {
                return completed(0, 'Test User <test@example.com>\n');
            }
            return completed(0, 'review-model\n');
        },
    }));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /title file is unavailable/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation removes its output when commitlint rejects the title', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'invalid title\n', {mode: 0o600});

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model'},
        run(command, args) {
            if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
                return completed(0);
            }
            if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
                return completed(0, 'Test User <test@example.com>\n');
            }
            if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
                return completed(0, 'review-model\n');
            }
            return completed(1);
        },
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /commitlint rejected title/);
    assert.equal(fs.existsSync(validationFile), false);
});

test('pr title validation refuses a symlink output without changing its target', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pr-test-'));
    t.after(() => fs.rmSync(workDir, {recursive: true, force: true}));
    const titleFile = path.join(workDir, 'title.txt');
    const targetFile = path.join(workDir, 'target.txt');
    const validationFile = path.join(workDir, 'validation.txt');
    fs.writeFileSync(titleFile, 'feat(core): safe title\n', {mode: 0o600});
    fs.writeFileSync(targetFile, 'preserve me\n', {mode: 0o600});
    fs.symlinkSync(targetFile, validationFile);

    const result = captureWrites(() => main([
        'pr',
        'validate-title',
        '--title-file',
        titleFile,
        '--validation-file',
        validationFile,
    ], {
        coreRoot: CORE_ROOT,
        cwd: '/repo',
        env: {...process.env, PI_MODEL: 'provider/model'},
        run(command, args) {
            if (command === process.execPath) return completed(0);
            if (path.basename(args[0]) === 'resolve-identity.sh') {
                return completed(0, 'Test User <test@example.com>\n');
            }
            return completed(0, 'review-model\n');
        },
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /validation file could not be written/);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'preserve me\n');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
