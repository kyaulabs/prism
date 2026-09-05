// $KYAULabs: prism-tool-review-chain.test.js kyau@aura.kyaulabs 2026/09/05 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {classifyOcrRange} = require('../../packages/prism-core/scripts/prism-tool/ocr-applicability');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');
const {
    inspectReviewChain,
    recordReviewSegment,
    validateRecordShape,
    verifyReviewChain,
} = require('../../packages/prism-core/scripts/prism-tool/review-chain');

function git(root, ...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture(t, filename = 'file.txt') {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-chain-'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    git(projectRoot, 'init', '-q');
    git(projectRoot, 'config', 'user.name', 'Fixture');
    git(projectRoot, 'config', 'user.email', 'fixture@example.com');
    fs.appendFileSync(path.join(projectRoot, '.git/info/exclude'), '\n.pi/\n');
    fs.writeFileSync(path.join(projectRoot, filename), 'base\n');
    git(projectRoot, 'add', filename);
    git(projectRoot, 'commit', '-q', '-m', 'base');
    const baseSha = git(projectRoot, 'rev-parse', 'HEAD');
    git(projectRoot, 'checkout', '-q', '-b', 'fix/tester-abcd-review-chain');
    fs.writeFileSync(path.join(projectRoot, filename), 'changed\n');
    git(projectRoot, 'commit', '-qam', 'change');
    const headSha = git(projectRoot, 'rev-parse', 'HEAD');
    return {baseSha, headSha, projectRoot};
}

function capture(callback) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try { return {status: callback(), stderr, stdout}; }
    finally { process.stdout.write = stdoutWrite; process.stderr.write = stderrWrite; }
}

function axes() {
    return {tooling: 'COMPLETE', standards: 'COMPLETE', spec: 'COMPLETE', sast: 'COMPLETE'};
}

test('dispatches chain record, inspect, and verify as JSON', (t) => {
    const target = fixture(t);
    const inputPath = path.join(target.projectRoot, 'segment.json');
    fs.writeFileSync(inputPath, JSON.stringify({
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), findings: [{
            axis: 'standards', path: 'file.txt', line: 1,
            summary: 'follow-up naming cleanup', classification: 'ADVISORY',
        }], closures: [],
    }));
    const recorded = capture(() => main([
        'code-review', 'chain', 'record', '--input', 'segment.json', '--json',
    ], target));
    assert.equal(recorded.status, 0);
    assert.equal(JSON.parse(recorded.stdout).status, 'GO');
    const inspected = capture(() => main(['code-review', 'chain', 'inspect', '--json'], target));
    assert.equal(JSON.parse(inspected.stdout).state, 'VALID');
    const verified = capture(() => main([
        'code-review', 'chain', 'verify', `--branch=fix/tester-abcd-review-chain`,
        '--base-ref=origin/develop', `--base-sha=${target.baseSha}`,
        `--head-sha=${target.headSha}`, '--json',
    ], target));
    assert.equal(verified.status, 0);
    assert.equal(JSON.parse(verified.stdout).data.advisoryFindings.length, 1);
});

test('records and verifies one complete initial review segment', (t) => {
    const target = fixture(t);
    const record = recordReviewSegment({
        schemaVersion: 1,
        kind: 'initial',
        branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        from: target.baseSha,
        to: target.headSha,
        axes: axes(),
        findings: [{
            axis: 'tooling',
            path: 'file.txt',
            line: 1,
            summary: 'changed flow has a deterministic defect',
            classification: 'BLOCKING',
            causality: 'introduced by the reviewed delta',
            impact: 'changed flow cannot complete',
            evidence: 'focused fixture fails deterministically',
        }],
        closures: [],
    }, target);

    assert.equal(record.headSha, target.headSha);
    const storedRecord = structuredClone(record);
    delete storedRecord.path;
    assert.doesNotThrow(() => validateRecordShape(storedRecord));
    assert.equal(record.segments.length, 1);
    assert.equal(record.openBlocking.length, 1);
    assert.equal(fs.statSync(record.path).mode & 0o777, 0o600);
    assert.equal(inspectReviewChain(target).state, 'VALID');
    assert.throws(() => verifyReviewChain({
        branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        headSha: target.headSha,
    }, target), /unresolved Blocking/);
});

test('rejects persisted blocking state that disagrees with nested findings', (t) => {
    const target = fixture(t);
    const record = recordReviewSegment({
        schemaVersion: 1,
        kind: 'initial',
        branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        from: target.baseSha,
        to: target.headSha,
        axes: axes(),
        findings: [{
            axis: 'tooling', path: 'file.txt', line: 1,
            summary: 'changed flow has a deterministic defect',
            classification: 'BLOCKING', causality: 'introduced by the delta',
            impact: 'changed flow cannot complete', evidence: 'focused fixture fails',
        }],
        closures: [],
    }, target);
    const tampered = JSON.parse(fs.readFileSync(record.path, 'utf8'));
    tampered.openBlocking = [];
    fs.writeFileSync(record.path, `${JSON.stringify(tampered)}\n`, {mode: 0o600});

    assert.equal(inspectReviewChain(target).state, 'UNSAFE');
});

test('rejects persisted findings that disagree with recorded segments', (t) => {
    const target = fixture(t);
    const record = recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), findings: [{
            axis: 'tooling', path: 'file.txt', line: 1, summary: 'deterministic defect',
            classification: 'BLOCKING', causality: 'introduced by the delta',
            impact: 'changed flow cannot complete', evidence: 'focused fixture fails',
        }], closures: [],
    }, target);
    const tampered = JSON.parse(fs.readFileSync(record.path, 'utf8'));
    tampered.findings = [];
    tampered.openBlocking = [];
    fs.writeFileSync(record.path, `${JSON.stringify(tampered)}\n`, {mode: 0o600});

    assert.equal(inspectReviewChain(target).state, 'UNSAFE');
});

test('appends a continuous repair and preserves Advisory findings', (t) => {
    const target = fixture(t);
    const initial = recordReviewSegment({
        schemaVersion: 1,
        kind: 'initial',
        branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        from: target.baseSha,
        to: target.headSha,
        axes: axes(),
        findings: [{
            axis: 'tooling', path: 'file.txt', line: 1,
            summary: 'changed flow has a deterministic defect',
            classification: 'BLOCKING', causality: 'introduced by the delta',
            impact: 'changed flow cannot complete', evidence: 'focused fixture fails',
        }],
        closures: [],
    }, target);
    fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
    git(target.projectRoot, 'commit', '-qam', 'repair');
    const repairedHead = git(target.projectRoot, 'rev-parse', 'HEAD');

    const repaired = recordReviewSegment({
        schemaVersion: 1,
        kind: 'repair',
        branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        from: target.headSha,
        to: repairedHead,
        axes: axes(),
        findings: [{
            axis: 'standards', path: 'file.txt', line: 1,
            summary: 'the fixture could use a clearer name', classification: 'ADVISORY',
        }],
        closures: [{fingerprint: initial.openBlocking[0], evidence: 'focused fixture now passes'}],
    }, target);

    assert.deepEqual(repaired.openBlocking, []);
    const verified = verifyReviewChain({
        branch: 'fix/tester-abcd-review-chain', baseRef: 'origin/develop',
        baseSha: target.baseSha, headSha: repairedHead,
    }, target);
    assert.equal(verified.advisoryFindings.length, 1);
    assert.equal(verified.record.segments.length, 2);
});

test('rejects duplicate finding fingerprints across repair segments', (t) => {
    const target = fixture(t);
    const finding = {
        axis: 'standards', path: 'file.txt', line: 1,
        summary: 'follow-up naming cleanup', classification: 'ADVISORY',
    };
    recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), findings: [finding], closures: [],
    }, target);
    fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
    git(target.projectRoot, 'commit', '-qam', 'repair');
    const repairedHead = git(target.projectRoot, 'rev-parse', 'HEAD');

    assert.throws(() => recordReviewSegment({
        schemaVersion: 1, kind: 'repair', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.headSha,
        to: repairedHead, axes: axes(), findings: [finding], closures: [],
    }, target), /duplicate fingerprints/);
});

test('rejects closure evidence on an initial review segment', (t) => {
    const target = fixture(t);

    assert.throws(() => recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), findings: [], closures: [{
            fingerprint: '0'.repeat(64), evidence: 'not applicable to an initial review',
        }],
    }, target), /closure/);
    assert.equal(inspectReviewChain(target).state, 'ABSENT');
});

test('rejects repair closures that do not identify one open finding', (t) => {
    const target = fixture(t);
    recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), findings: [], closures: [],
    }, target);
    fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
    git(target.projectRoot, 'commit', '-qam', 'repair');
    const repairedHead = git(target.projectRoot, 'rev-parse', 'HEAD');

    assert.throws(() => recordReviewSegment({
        schemaVersion: 1, kind: 'repair', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.headSha,
        to: repairedHead, axes: axes(), findings: [], closures: [{
            fingerprint: '0'.repeat(64), evidence: 'unknown finding',
        }],
    }, target), /closure/);
    assert.equal(inspectReviewChain(target).record.headSha, target.headSha);
});

test('rejects malformed Blocking evidence and symlinked chain state', (t) => {
    const target = fixture(t);
    const input = {
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: axes(), closures: [], findings: [{
            axis: 'tooling', path: 'file.txt', line: 1, summary: 'defect',
            classification: 'BLOCKING', causality: '', impact: 'failure', evidence: 'repro',
        }],
    };
    assert.throws(() => recordReviewSegment(input, target), /causality/);

    const external = path.join(target.projectRoot, 'external.json');
    fs.writeFileSync(external, '{}');
    const chainPath = path.join(target.projectRoot, '.pi', 'prism-tool', 'code-review', 'review-chain.json');
    fs.mkdirSync(path.dirname(chainPath), {recursive: true});
    fs.symlinkSync(external, chainPath);
    assert.equal(inspectReviewChain(target).state, 'UNSAFE');
});

function segment(target, overrides = {}) {
    return {
        schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha, axes: {...axes(), tooling: 'COMPLETE_NO_OCR'},
        findings: [], closures: [], ...overrides,
    };
}

function expectedIdentity(target) {
    return {
        branch: 'fix/tester-abcd-review-chain', baseRef: 'origin/develop',
        baseSha: target.baseSha, headSha: target.headSha,
    };
}

test('records explicit OCR non-applicability for a Markdown-only range', (t) => {
    const target = fixture(t, 'review notes.MARKDOWN');
    const record = recordReviewSegment(segment(target), target);
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.segments[0].axes.tooling, 'COMPLETE_NO_OCR');
    assert.deepEqual({
        branch: record.branch, baseRef: record.baseRef,
        baseSha: record.baseSha, headSha: record.headSha,
    }, expectedIdentity(target));
    assert.equal(fs.statSync(record.path).mode & 0o777, 0o600);
    assert.deepEqual(record.openBlocking, []);
});

test('rejects empty and missing-object ranges', (t) => {
    const target = fixture(t, 'notes.md');
    for (const range of [
        {from: target.headSha, to: target.headSha},
        {from: '0'.repeat(40), to: target.headSha},
        {from: target.baseSha, to: 'HEAD'},
    ]) assert.throws(() => classifyOcrRange(range, target), /OCR applicability could not be proven/);
});

test('requires an ancestor-to-descendant range of commit objects', (t) => {
    const target = fixture(t, 'notes.md');
    for (const range of [
        {from: git(target.projectRoot, 'rev-parse', `${target.baseSha}^{tree}`), to: target.headSha},
        {from: target.headSha, to: target.baseSha},
    ]) assert.throws(() => classifyOcrRange(range, target), /OCR applicability could not be proven/);
});

function advanceRange(target, change) {
    const from = target.headSha;
    change(target.projectRoot);
    git(target.projectRoot, 'commit', '-q', '-m', 'fixture delta');
    return {from, to: git(target.projectRoot, 'rev-parse', 'HEAD')};
}

test('classifies file transitions from immutable Git metadata', (t) => {
    const cases = [
        ['addition', 'MARKDOWN_ONLY', (root) => {
            fs.writeFileSync(path.join(root, 'new notes.md'), 'notes\n');
            git(root, 'add', '--', 'new notes.md');
        }],
        ['deletion', 'MARKDOWN_ONLY', (root) => git(root, 'rm', '--', 'notes.md')],
        ['Markdown rename', 'MARKDOWN_ONLY', (root) => git(root, 'mv', 'notes.md', 'NOTES.MARKDOWN')],
        ['Markdown to code', 'REQUIRED', (root) => git(root, 'mv', 'notes.md', 'notes.js')],
        ['code to Markdown', 'REQUIRED', (root) => git(root, 'mv', 'notes.js', 'notes.md')],
        ['mixed addition', 'REQUIRED', (root) => {
            fs.writeFileSync(path.join(root, 'code.js'), 'export {};\n');
            fs.writeFileSync(path.join(root, 'notes.md'), 'new notes\n');
            git(root, 'add', '--', 'code.js', 'notes.md');
        }],
        ['regular mode change', 'MARKDOWN_ONLY', (root) => git(root, 'update-index', '--chmod=+x', 'notes.md')],
        ['symlink', 'REQUIRED', (root) => {
            fs.symlinkSync('notes.md', path.join(root, 'link.md'));
            git(root, 'add', '--', 'link.md');
        }],
        ['Gitlink despite ignore configuration', 'REQUIRED', (root) => {
            git(root, 'config', 'diff.ignoreSubmodules', 'all');
            git(root, 'update-index', '--add', '--cacheinfo', `160000,${git(root, 'rev-parse', 'HEAD')},module.md`);
        }],
    ];
    for (const [label, status, change] of cases) {
        const target = fixture(t, label === 'code to Markdown' ? 'notes.js' : 'notes.md');
        const range = advanceRange(target, change);
        assert.deepEqual(classifyOcrRange(range, target), {schemaVersion: 1, ...range, status}, label);
    }
});

test('classifies case-insensitive Markdown modifications', (t) => {
    for (const name of ['notes.md', 'NOTES.MD', 'review notes.MarkDown']) {
        const target = fixture(t, name);
        assert.equal(classifyOcrRange({from: target.baseSha, to: target.headSha}, target).status, 'MARKDOWN_ONLY', name);
    }
});

test('rejects OCR exemption on every non-tooling axis', (t) => {
    for (const axis of ['standards', 'spec', 'sast']) {
        const target = fixture(t, 'notes.md');
        assert.throws(() => recordReviewSegment(segment(target, {
            axes: {...axes(), [axis]: 'COMPLETE_NO_OCR'},
        }), target), /review axis is incomplete/, axis);
        assert.equal(inspectReviewChain(target).state, 'ABSENT');
    }
});

test('rejects non-Markdown recording without publishing state', (t) => {
    const target = fixture(t);
    assert.throws(() => recordReviewSegment(segment(target), target), /review OCR exemption is unproven/);
    assert.equal(inspectReviewChain(target).state, 'ABSENT');
});

function assertUnprovenDiff(t, response) {
    const target = fixture(t, 'notes.md');
    const calls = [];
    const context = {...target, run: (command, args, options) => {
        if (args[0] !== '--no-replace-objects') return runBounded(command, args, options);
        calls.push({command, args, options});
        const result = runBounded(command, args, options);
        return args[1] === 'diff' ? response(result) : result;
    }};
    assert.throws(() => classifyOcrRange({from: target.baseSha, to: target.headSha}, context), /OCR applicability could not be proven/);
    assert.throws(() => recordReviewSegment(segment(target), context), /review OCR exemption is unproven/);
    assert.equal(inspectReviewChain(target).state, 'ABSENT');
    const diffCall = calls.find(({args}) => args[1] === 'diff');
    assert.ok(diffCall, 'the intended failing boundary must be reached');
    assert.deepEqual(diffCall.args, [
        '--no-replace-objects', 'diff', '--raw', '--no-abbrev', '--no-renames',
        '--no-ext-diff', '--no-textconv', '--no-color', '--ignore-submodules=none',
        '-z', target.baseSha, target.headSha, '--',
    ]);
    for (const {command, args, options} of calls) {
        assert.equal(command, 'git');
        assert.equal(args[0], '--no-replace-objects');
        assert.equal(options.encoding, null);
        assert.equal(options.maxBuffer, 1048576);
        assert.equal(options.timeout, 30000);
        assert.equal(options.env.GIT_NO_LAZY_FETCH, '1');
    }
}

test('rejects malformed or failed Git metadata without publishing an exemption', (t) => {
    const invalid = [
        {status: 1, stdout: Buffer.alloc(0), stderr: 'CANARY'},
        {status: 0, stdout: Buffer.from([0xff, 0])},
        {status: 0, stdout: Buffer.from('partial')},
        {status: 0, stdout: Buffer.from('wrong\0notes.md\0')},
        {status: 0, stdout: Buffer.from(`:100664 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0notes.md\0`)},
        {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'a'.repeat(40)} M\0notes.md\0`)},
        {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} T\0notes.md\0`)},
        {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0notes.md\0`.repeat(2))},
    ];
    for (const header of [
        `:100644 100644 ${'a'.repeat(39)} ${'b'.repeat(40)} M`,
        `:000000 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} A`,
        `:100644 000000 ${'a'.repeat(40)} ${'b'.repeat(40)} D`,
        `:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} A`,
        `:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} D`,
        `:000000 100644 ${'0'.repeat(40)} ${'b'.repeat(40)} M`,
    ]) invalid.push({status: 0, stdout: Buffer.from(`${header}\0notes.md\0`)});
    for (const name of ['../notes.md', '/notes.md', 'notes//file.md']) {
        invalid.push({status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0${name}\0`)});
    }
    for (const result of invalid) assertUnprovenDiff(t, () => result);
});

test('rejects timed-out and oversized otherwise-valid Git output', (t) => {
    assertUnprovenDiff(t, (result) => ({...result, timedOut: true}));
    assertUnprovenDiff(t, (result) => ({
        ...result,
        stdout: Buffer.from(result.stdout.toString('utf8').replace('notes.md', `${'x'.repeat(1048576)}.md`)),
    }));
});

test('rejects missing blobs even when raw tree metadata is available', (t) => {
    const target = fixture(t, 'notes.md');
    let objectChecks = 0;
    assert.throws(() => classifyOcrRange({from: target.baseSha, to: target.headSha}, {
        ...target, run: (command, args, options) => {
            if (args[1] === 'cat-file') {
                objectChecks += 1;
                return {status: 0, stdout: Buffer.from('missing\n')};
            }
            return runBounded(command, args, options);
        },
    }), /OCR applicability could not be proven/);
    assert.equal(objectChecks, 1);
});

test('authoritative verification rejects a structurally valid forged exemption', (t) => {
    const target = fixture(t);
    const record = recordReviewSegment(segment(target, {axes: axes()}), target);
    const forged = JSON.parse(fs.readFileSync(record.path, 'utf8'));
    forged.segments[0].axes.tooling = 'COMPLETE_NO_OCR';
    fs.writeFileSync(record.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
    assert.doesNotThrow(() => validateRecordShape(forged));
    assert.equal(inspectReviewChain(target).state, 'VALID');
    assert.throws(() => verifyReviewChain(expectedIdentity(target), target), /review OCR exemption is unproven/);
});

test('round-trips an exempt initial segment and rejects stale identity', (t) => {
    const target = fixture(t, 'notes.md');
    recordReviewSegment(segment(target), target);
    const verified = verifyReviewChain(expectedIdentity(target), target);
    assert.equal(verified.record.segments[0].axes.tooling, 'COMPLETE_NO_OCR');
    for (const replacement of [
        {branch: 'fix/tester-abcd-different'}, {baseRef: 'origin/main'},
        {baseSha: '0'.repeat(40)}, {headSha: target.baseSha},
    ]) assert.throws(() => verifyReviewChain({...expectedIdentity(target), ...replacement}, target), /identity is stale/);
});

test('exempt repairs preserve prior Blocking closure requirements', (t) => {
    for (const close of [false, true]) {
        const target = fixture(t);
        const initial = recordReviewSegment(segment(target, {
            axes: axes(), findings: [{
                axis: 'standards', path: 'file.txt', line: 1,
                summary: 'changed requirement is undocumented', classification: 'BLOCKING',
                causality: 'introduced by this change', impact: 'required workflow is unusable',
                evidence: 'fixture confirms missing instructions',
            }],
        }), target);
        const range = advanceRange(target, (root) => {
            fs.writeFileSync(path.join(root, 'notes.md'), 'required instructions\n');
            git(root, 'add', '--', 'notes.md');
        });
        const repaired = recordReviewSegment(segment(target, {
            kind: 'repair', ...range,
            closures: close ? [{fingerprint: initial.openBlocking[0], evidence: 'instructions now cover the failed workflow'}] : [],
        }), target);
        assert.equal(repaired.segments[1].axes.tooling, 'COMPLETE_NO_OCR');
        assert.equal(repaired.openBlocking.length, close ? 0 : 1);
        const expected = {...expectedIdentity(target), headSha: range.to};
        if (close) assert.equal(verifyReviewChain(expected, target).record.segments.length, 2);
        else assert.throws(() => verifyReviewChain(expected, target), /unresolved Blocking/);
    }
});

test('cannot carry a forged initial exemption through a valid Markdown repair', (t) => {
    const target = fixture(t);
    const initial = recordReviewSegment(segment(target, {axes: axes()}), target);
    const forged = JSON.parse(fs.readFileSync(initial.path, 'utf8'));
    forged.segments[0].axes.tooling = 'COMPLETE_NO_OCR';
    fs.writeFileSync(initial.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
    const before = fs.readFileSync(initial.path);
    const range = advanceRange(target, (root) => {
        fs.writeFileSync(path.join(root, 'notes.md'), 'notes\n');
        git(root, 'add', '--', 'notes.md');
    });
    assert.throws(() => recordReviewSegment(segment(target, {kind: 'repair', ...range}), target), /review OCR exemption is unproven/);
    assert.deepEqual(fs.readFileSync(initial.path), before);
});

test('rechecks exempt repair ranges rather than only the initial range', (t) => {
    const target = fixture(t, 'notes.md');
    recordReviewSegment(segment(target), target);
    const range = advanceRange(target, (root) => {
        fs.writeFileSync(path.join(root, 'code.js'), 'export {};\n');
        git(root, 'add', '--', 'code.js');
    });
    const repaired = recordReviewSegment(segment(target, {
        kind: 'repair', ...range, axes: axes(),
    }), target);
    const forged = JSON.parse(fs.readFileSync(repaired.path, 'utf8'));
    forged.segments[1].axes.tooling = 'COMPLETE_NO_OCR';
    fs.writeFileSync(repaired.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
    assert.doesNotThrow(() => validateRecordShape(forged));
    assert.throws(() => verifyReviewChain({
        ...expectedIdentity(target), headSha: range.to,
    }, target), /review OCR exemption is unproven/);
});

test('an exemption does not make discontinuous stored history valid', (t) => {
    const target = fixture(t, 'notes.md');
    const record = recordReviewSegment(segment(target), target);
    const forged = JSON.parse(fs.readFileSync(record.path, 'utf8'));
    forged.segments[0].from = target.headSha;
    fs.writeFileSync(record.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
    assert.equal(inspectReviewChain(target).state, 'UNSAFE');
    assert.throws(() => verifyReviewChain(expectedIdentity(target), target), /review chain is unavailable/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
