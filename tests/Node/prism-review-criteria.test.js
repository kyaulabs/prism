// $KYAULabs: prism-review-criteria.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    inspectCriteria,
    recordCriteria,
    verifyCriteria,
} = require('../../packages/prism-core/scripts/prism-review/criteria');

function git(root, ...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture(t) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-criteria-'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    git(projectRoot, 'init', '-q');
    git(projectRoot, 'config', 'user.name', 'Fixture');
    git(projectRoot, 'config', 'user.email', 'fixture@example.test');
    fs.mkdirSync(path.join(projectRoot, 'docs', 'specs'), {recursive: true});
    fs.mkdirSync(path.join(projectRoot, 'docs', 'plans'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, 'docs', 'specs', 'change-spec.md'), '# Accepted specification\n');
    fs.writeFileSync(path.join(projectRoot, 'docs', 'plans', 'change.md'), '# Accepted plan\n');
    git(projectRoot, 'add', '-A');
    git(projectRoot, 'commit', '-q', '-m', 'docs: approve change');
    git(projectRoot, 'checkout', '-q', '-b', 'feat/tester-abcd-change');
    return {projectRoot, head: git(projectRoot, 'rev-parse', 'HEAD')};
}

test('distinguishes explicit no-criteria authority from missing state', (t) => {
    const target = fixture(t);

    assert.equal(inspectCriteria(target).state, 'ABSENT');
    const recorded = recordCriteria({disposition: 'NONE_DECLARED', sources: []}, target);

    assert.equal(recorded.disposition, 'NONE_DECLARED');
    assert.deepEqual(recorded.sources, []);
    assert.deepEqual(verifyCriteria({branch: 'feat/tester-abcd-change'}, target).blobs, []);
});

test('rejects criteria when the checkout branch drifts from the recorded branch', (t) => {
    const target = fixture(t);
    recordCriteria({disposition: 'NONE_DECLARED', sources: []}, target);
    git(target.projectRoot, 'checkout', '-q', '-b', 'feat/tester-abcd-other');

    assert.throws(() => verifyCriteria({branch: 'feat/tester-abcd-change'}, target), /unavailable/);
});

test('keeps committed criteria authoritative over worktree edits and replacement attempts', (t) => {
    const target = fixture(t);
    const recorded = recordCriteria({
        disposition: 'DECLARED',
        sources: [{role: 'SPEC', commit: target.head, path: 'docs/specs/change-spec.md'}],
    }, target);
    fs.writeFileSync(
        path.join(target.projectRoot, 'docs', 'specs', 'change-spec.md'),
        '# Unapproved worktree replacement\n'
    );

    const verified = verifyCriteria({branch: 'feat/tester-abcd-change'}, target);

    assert.equal(verified.digest, recorded.digest);
    assert.equal(verified.blobs[0].text, '# Accepted specification\n');
    assert.throws(() => recordCriteria({disposition: 'NONE_DECLARED', sources: []}, target), /immutable/);
});

test('rejects duplicate, missing, unsafe, and non-text criteria sources', (t) => {
    const duplicate = fixture(t);
    assert.throws(() => recordCriteria({
        disposition: 'DECLARED',
        sources: [
            {role: 'SPEC', commit: duplicate.head, path: 'docs/specs/change-spec.md'},
            {role: 'CONTEXT', commit: duplicate.head, path: 'docs/specs/change-spec.md'},
        ],
    }, duplicate), /order/);

    const missing = fixture(t);
    assert.throws(() => recordCriteria({
        disposition: 'DECLARED',
        sources: [{role: 'SPEC', commit: missing.head, path: 'docs/specs/missing.md'}],
    }, missing), /unavailable/);
    assert.throws(() => recordCriteria({
        disposition: 'DECLARED',
        sources: [{role: 'SPEC', commit: missing.head, path: '../outside.md'}],
    }, missing), /path/);

    const binary = fixture(t);
    fs.writeFileSync(path.join(binary.projectRoot, 'docs', 'specs', 'binary.md'), Buffer.from([0xff, 0xfe]));
    git(binary.projectRoot, 'add', 'docs/specs/binary.md');
    git(binary.projectRoot, 'commit', '-q', '-m', 'docs: add invalid criteria');
    const binaryHead = git(binary.projectRoot, 'rev-parse', 'HEAD');
    assert.throws(() => recordCriteria({
        disposition: 'DECLARED',
        sources: [{role: 'SPEC', commit: binaryHead, path: 'docs/specs/binary.md'}],
    }, binary), /UTF-8/);
});

test('classifies malformed and public criteria records as unsafe', (t) => {
    const target = fixture(t);
    const stateDirectory = path.join(target.projectRoot, '.pi', 'prism-tool', 'code-review');
    fs.mkdirSync(stateDirectory, {recursive: true, mode: 0o700});
    fs.chmodSync(stateDirectory, 0o700);
    const criteriaPath = path.join(stateDirectory, 'criteria.json');
    fs.writeFileSync(criteriaPath, '{"schemaVersion":1}\n', {mode: 0o600});

    assert.equal(inspectCriteria(target).state, 'UNSAFE');
    fs.chmodSync(criteriaPath, 0o644);
    assert.equal(inspectCriteria(target).state, 'UNSAFE');
});

test('records and verifies exact committed requirement source identities', (t) => {
    const target = fixture(t);

    const recorded = recordCriteria({
        disposition: 'DECLARED',
        sources: [
            {role: 'SPEC', commit: target.head, path: 'docs/specs/change-spec.md'},
            {role: 'PLAN', commit: target.head, path: 'docs/plans/change.md'},
        ],
    }, target);

    assert.equal(recorded.schemaVersion, 1);
    assert.equal(recorded.kind, 'criteria');
    assert.equal(recorded.branch, 'feat/tester-abcd-change');
    assert.equal(recorded.disposition, 'DECLARED');
    assert.deepEqual(recorded.sources.map(({role}) => role), ['PLAN', 'SPEC']);
    assert.deepEqual(Object.keys(recorded.sources[0]), [
        'role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256',
    ]);
    assert.doesNotMatch(JSON.stringify(recorded), /Accepted specification|Accepted plan/);
    assert.equal(inspectCriteria(target).state, 'VALID');
    const verified = verifyCriteria({branch: 'feat/tester-abcd-change'}, target);
    assert.equal(verified.digest, recorded.digest);
    assert.equal(verified.blobs.length, 2);
    assert.equal(verified.blobs[1].text, '# Accepted specification\n');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
