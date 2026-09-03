// $KYAULabs: prism-tool-code-review.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');

function capture(callback) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: callback(), stderr, stdout};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function fixture(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-code-review-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const bin = path.join(root, 'bin');
    const repository = path.join(root, 'repository');
    const consentPath = path.join(root, 'agent', 'prism-consent.json');
    fs.mkdirSync(bin);
    fs.mkdirSync(repository);
    fs.mkdirSync(path.dirname(consentPath), {mode: 0o700});
    for (const executable of ['semgrep', 'ocr']) {
        const target = path.join(bin, executable);
        fs.writeFileSync(target, '#!/bin/sh\nexit 0\n', {mode: 0o755});
        fs.chmodSync(target, 0o755);
    }
    if (overrides.consent !== 'absent') {
        fs.writeFileSync(consentPath, '{"schemaVersion":1,"ocr":true}\n', {
            mode: overrides.consent === 'unsafe' ? 0o644 : 0o600,
        });
        fs.chmodSync(consentPath, overrides.consent === 'unsafe' ? 0o644 : 0o600);
    }
    const calls = [];
    const run = (command, args, options) => {
        const executable = path.basename(command);
        let kind;
        let result;
        if (executable === 'git' && args.join(' ') === 'symbolic-ref --quiet --short HEAD') {
            kind = 'git-branch';
            result = overrides.branch ?? {
                status: 0,
                stdout: 'feat/tester-abcd-code-review\n',
                stderr: '',
                error: undefined,
            };
        } else if (executable === 'git' && args[0] === 'merge-base') {
            kind = 'git-ancestor';
            result = overrides.ancestor ?? {status: 0, stdout: '', stderr: '', error: undefined};
        } else if (executable === 'git' && args[0] === 'rev-parse') {
            kind = 'git-base';
            result = overrides.base ?? {
                status: 0,
                stdout: `${'a'.repeat(40)}\n`,
                stderr: '',
                error: undefined,
            };
        } else if (executable === 'semgrep' && args[0] === '--version') {
            kind = 'semgrep-version';
            result = overrides.semgrepVersion ?? {status: 0, stdout: '1.173.0\n', stderr: '', error: undefined};
        } else if (executable === 'ocr' && args[0] === '--version') {
            kind = 'ocr-version';
            result = overrides.ocrVersion ?? {
                status: 0,
                stdout: 'open-code-review v1.9.1 linux/amd64\n',
                stderr: '',
                error: undefined,
            };
        } else if (executable === 'ocr' && args.join(' ') === 'llm test') {
            kind = 'ocr-connectivity';
            result = overrides.connectivity ?? {status: 0, stdout: 'CANARY-CONNECTIVITY', stderr: '', error: undefined};
        } else if (executable === 'ocr' && ['review', 'scan'].includes(args[0])) {
            kind = 'ocr-review';
            result = overrides.review ?? {
                status: 0,
                stdout: '{"findings":[]}\n',
                stderr: 'CANARY-PROVIDER',
                error: undefined,
            };
        } else {
            throw new Error(`unexpected subprocess: ${command} ${args.join(' ')}`);
        }
        calls.push({args, command, kind, options});
        return result;
    };
    return {
        calls,
        consentPath,
        context: {
            consentPath,
            coreRoot: CORE_ROOT,
            cwd: repository,
            env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`},
            projectRoot: repository,
            run,
        },
        repository,
        root,
    };
}

function reviewArgs() {
    return ['code-review', 'ocr', '--', 'review', '--audience', 'agent', '--format', 'json'];
}

test('chain inspection identifies version two without accepting model-authored input', () => {
    const result = capture(() => main(['code-review', 'chain', 'inspect', '--json'], {
        projectRoot: '/repo',
        inspectReviewChainV2: () => ({state: 'VALID', version: 2}),
    }));

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        state: 'VALID',
        version: 2,
    });
});

test('schema-one record refuses an existing version-two chain before reading input', () => {
    const result = capture(() => main([
        'code-review', 'chain', 'record', '--input', 'missing.json', '--json',
    ], {
        projectRoot: '/repo',
        inspectReviewChainV2: () => ({state: 'VALID', version: 2}),
    }));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /chain record is schema-one-only/);
    assert.doesNotMatch(result.stderr, /missing\.json|\/repo/);
});

test('dedicated review validates versions and connectivity before exact OCR review', (t) => {
    const target = fixture(t);

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '{"findings":[]}\n');
    assert.equal(result.stderr, '');
    assert.deepEqual(target.calls.map(({kind}) => kind), [
        'semgrep-version',
        'ocr-version',
        'git-branch',
        'git-base',
        'ocr-connectivity',
        'ocr-review',
    ]);
    assert.deepEqual(target.calls.at(-1).args, [
        'review',
        '--from',
        'a'.repeat(40),
        '--to',
        'HEAD',
        '--audience',
        'agent',
        '--format',
        'json',
    ]);
    assert.equal(target.calls.at(-1).options.timeout, 600000);
    assert.equal(target.calls.at(-1).options.maxBuffer, 1048576);
    assert.equal(target.calls.at(-1).options.cwd, target.repository);
});

test('dedicated review accepts one explicit validated repair range', (t) => {
    const target = fixture(t);
    const from = 'b'.repeat(40);

    const result = capture(() => main([
        'code-review', 'ocr', '--', 'review', '--from', from, '--to', 'HEAD',
        '--audience', 'agent', '--format', 'json',
    ], target.context));

    assert.equal(result.status, 0);
    assert.deepEqual(target.calls.map(({kind}) => kind), [
        'semgrep-version', 'ocr-version', 'git-ancestor', 'ocr-connectivity', 'ocr-review',
    ]);
    assert.deepEqual(target.calls.at(-1).args, [
        'review', '--from', from, '--to', 'HEAD', '--audience', 'agent', '--format', 'json',
    ]);
});

test('dedicated review targets main for release and hotfix branches', (t) => {
    for (const branch of ['release/1.2.3', 'hotfix/tester-abcd-urgent']) {
        const target = fixture(t, {
            branch: {status: 0, stdout: `${branch}\n`, stderr: '', error: undefined},
        });

        const result = capture(() => main(reviewArgs(), target.context));

        assert.equal(result.status, 0, branch);
        assert.deepEqual(target.calls.at(-1).args, [
            'review',
            '--from',
            'a'.repeat(40),
            '--to',
            'HEAD',
            '--audience',
            'agent',
            '--format',
            'json',
        ], branch);
    }
});

test('dedicated review rejects a missing base before OCR connectivity', (t) => {
    const target = fixture(t, {
        base: {status: 1, stdout: '', stderr: 'CANARY-BASE', error: undefined},
    });

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /review base ref is unavailable/);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.deepEqual(target.calls.map(({kind}) => kind), [
        'semgrep-version',
        'ocr-version',
        'git-branch',
        'git-base',
    ]);
});

test('dedicated scan resolves one contained non-symlinked operand', (t) => {
    const target = fixture(t);
    const source = path.join(target.repository, 'src');
    fs.mkdirSync(source);

    const result = capture(() => main([
        'code-review', 'ocr', '--', 'scan', 'src', '--audience', 'agent', '--format', 'json',
    ], target.context));

    assert.equal(result.status, 0);
    assert.deepEqual(target.calls.at(-1).args, [
        'scan',
        source,
        '--audience',
        'agent',
        '--format',
        'json',
    ]);
});

test('parser rejects reordered, duplicated, extra, missing, escaping, and symlinked operands', (t) => {
    const target = fixture(t);
    const outside = path.join(target.root, 'outside');
    const link = path.join(target.repository, 'linked');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, link);
    const invalid = [
        ['code-review'],
        ['code-review', 'ocr'],
        ['code-review', 'ocr', '--', 'review', '--format', 'json', '--audience', 'agent'],
        ['code-review', 'ocr', '--', 'review', '--audience', 'agent', '--format', 'json', '--format', 'json'],
        ['code-review', 'ocr', '--', 'review', '--audience', 'agent', '--format', 'json', 'extra'],
        ['code-review', 'ocr', '--', 'scan', '--audience', 'agent', '--format', 'json'],
        ['code-review', 'ocr', '--', 'scan', '../outside', '--audience', 'agent', '--format', 'json'],
        ['code-review', 'ocr', '--', 'scan', 'missing', '--audience', 'agent', '--format', 'json'],
        ['code-review', 'ocr', '--', 'scan', 'linked', '--audience', 'agent', '--format', 'json'],
    ];

    for (const args of invalid) {
        const before = target.calls.length;
        const result = capture(() => main(args, target.context));
        assert.equal(result.status, 2, args.join(' '));
        assert.equal(target.calls.length, before, args.join(' '));
    }
});

test('missing and unsafe consent stop before every subprocess', (t) => {
    for (const consent of ['absent', 'unsafe']) {
        const target = fixture(t, {consent});
        const result = capture(() => main(reviewArgs(), target.context));
        assert.equal(result.status, 3, consent);
        assert.match(result.stderr, /standing OCR consent required/, consent);
        assert.deepEqual(target.calls, [], consent);
    }
});

test('version failure stops before connectivity and provider output stays redacted', (t) => {
    const target = fixture(t, {
        semgrepVersion: {status: 1, stdout: '', stderr: 'CANARY-PROVIDER', error: undefined},
    });

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 3);
    assert.deepEqual(target.calls.map(({kind}) => kind), ['semgrep-version', 'ocr-version']);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /CANARY-PROVIDER/);
});

test('connectivity failure stops before review with a fixed diagnostic', (t) => {
    const target = fixture(t, {
        connectivity: {status: 7, stdout: '', stderr: 'CANARY-PROVIDER', error: undefined},
    });

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 3);
    assert.deepEqual(target.calls.map(({kind}) => kind), [
        'semgrep-version',
        'ocr-version',
        'git-branch',
        'git-base',
        'ocr-connectivity',
    ]);
    assert.match(result.stderr, /OCR connectivity failed/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /CANARY-PROVIDER/);
});

test('review non-zero exit relays sanitized stderr', (t) => {
    const target = fixture(t, {
        review: {
            status: 9,
            stdout: '',
            stderr: '\x1b[31mprovider rejected the request\x1b[0m\x07\r\nprism-tool: forged line',
            error: undefined,
        },
    });

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /OCR review failed: provider rejected the request/);
    assert.equal([...result.stderr.trim()].every((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
    }), true);
});

test('review non-zero exit bounds relayed stderr', (t) => {
    const target = fixture(t, {
        review: {
            status: 9,
            stdout: '',
            stderr: `${'x'.repeat(5000)}final provider error`,
            error: undefined,
        },
    });

    const result = capture(() => main(reviewArgs(), target.context));

    assert.equal(result.status, 4);
    assert.match(result.stderr, /final provider error/);
    assert.equal(result.stderr.length <= 'prism-tool: code-review OCR review failed: \n'.length + 2048, true);
});

test('review timeout and output-limit failures are bounded and redacted', (t) => {
    const cases = [
        [{status: null, stdout: '', stderr: 'CANARY-PROVIDER', timedOut: true, error: {code: 'ETIMEDOUT'}}, /timed out/],
        [{status: null, stdout: 'CANARY-PROVIDER', stderr: '', timedOut: false, error: {code: 'ENOBUFS'}}, /output or process failure/],
    ];
    for (const [review, pattern] of cases) {
        const target = fixture(t, {review});
        const result = capture(() => main(reviewArgs(), target.context));
        assert.equal(result.status, 4);
        assert.match(result.stderr, pattern);
        assert.equal(result.stdout, '');
        assert.doesNotMatch(result.stderr, /CANARY-PROVIDER/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
