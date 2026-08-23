// $KYAULabs: prism-tool-review-chain.test.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    inspectReviewChain,
    recordReviewSegment,
    verifyReviewChain,
} = require('../../packages/prism-core/scripts/prism-tool/review-chain');

function git(root, ...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture(t) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-chain-'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    git(projectRoot, 'init', '-q');
    git(projectRoot, 'config', 'user.name', 'Fixture');
    git(projectRoot, 'config', 'user.email', 'fixture@example.com');
    fs.writeFileSync(path.join(projectRoot, 'file.txt'), 'base\n');
    git(projectRoot, 'add', 'file.txt');
    git(projectRoot, 'commit', '-q', '-m', 'base');
    const baseSha = git(projectRoot, 'rev-parse', 'HEAD');
    git(projectRoot, 'checkout', '-q', '-b', 'fix/tester-abcd-review-chain');
    fs.writeFileSync(path.join(projectRoot, 'file.txt'), 'changed\n');
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

// vim: ft=javascript sts=4 sw=4 ts=4 et :
