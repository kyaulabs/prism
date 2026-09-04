// $KYAULabs: prism-review-state.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    REVIEW_STATE,
    inspectAuthorityRecord,
    publishAuthorityRecord,
} = require('../../packages/prism-core/scripts/prism-review/review-state');

function fixture(t) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-state-'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return projectRoot;
}

test('rejects symlinks in the authority state path', (t) => {
    const projectRoot = fixture(t);
    const outside = fixture(t);
    fs.symlinkSync(outside, path.join(projectRoot, '.pi'));
    const options = {
        projectRoot,
        filename: 'criteria.json',
        limit: 131072,
        parse: (value) => value,
    };

    assert.equal(inspectAuthorityRecord(options).state, REVIEW_STATE.UNSAFE);
    assert.throws(() => publishAuthorityRecord({
        ...options,
        record: {schemaVersion: 1, disposition: 'NONE_DECLARED'},
    }), /unsafe/);
    assert.deepEqual(fs.readdirSync(outside), []);
});

test('preserves a newer authority record when expected prior state is stale', (t) => {
    const projectRoot = fixture(t);
    const options = {
        projectRoot,
        filename: 'criteria.json',
        limit: 131072,
        parse: (value) => value,
    };
    const current = {schemaVersion: 1, disposition: 'DECLARED'};
    publishAuthorityRecord({...options, record: current});

    assert.throws(() => publishAuthorityRecord({
        ...options,
        expectedRecord: {schemaVersion: 1, disposition: 'NONE_DECLARED'},
        record: {schemaVersion: 1, disposition: 'REPLACEMENT'},
    }), /changed/);
    assert.deepEqual(inspectAuthorityRecord(options).record, current);
});

test('publishes project-private authority records through nested engine directories', (t) => {
    const projectRoot = fixture(t);
    const options = {
        projectRoot,
        filename: 'criteria.json',
        limit: 131072,
        parse: (value) => value,
    };

    assert.equal(inspectAuthorityRecord(options).state, REVIEW_STATE.ABSENT);
    const published = publishAuthorityRecord({
        ...options,
        record: {schemaVersion: 1, disposition: 'NONE_DECLARED'},
    });

    assert.equal(published.state, REVIEW_STATE.VALID);
    assert.deepEqual(published.record, {schemaVersion: 1, disposition: 'NONE_DECLARED'});
    assert.equal(
        fs.statSync(path.join(projectRoot, '.pi', 'prism-tool', 'code-review')).mode & 0o777,
        0o700
    );
    assert.equal(fs.statSync(published.path).mode & 0o777, 0o600);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
