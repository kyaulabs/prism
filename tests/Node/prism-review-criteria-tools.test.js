// $KYAULabs: prism-review-criteria-tools.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createCriteriaTools} = require('../../packages/prism-core/scripts/prism-review/criteria-tools');

const source = Object.freeze({
    role: 'SPEC',
    commit: 'a'.repeat(40),
    path: 'docs/specs/example.md',
    blobOid: 'b'.repeat(40),
    byteCount: 11,
    sha256: '7e846cb2d6e3ee6bcb3b803b53d49b134b23e974d280d9a164c2f6919db0a7df',
});

function criteria(text = 'one € two') {
    return Object.freeze({
        record: Object.freeze({
            schemaVersion: 1,
            kind: 'criteria',
            branch: 'feat/example',
            disposition: 'DECLARED',
            sources: Object.freeze([source]),
        }),
        digest: 'd'.repeat(64),
        blobs: Object.freeze([Object.freeze({...source, text})]),
    });
}

test('delivers immutable criteria by UTF-8 byte interval until the source is exposed', async () => {
    const set = createCriteriaTools(criteria());
    const tool = set.tools.read_criteria;

    const first = await tool.execute('first', {
        sourceDigest: source.sha256,
        offset: 0,
        limit: 4,
    });
    const second = await tool.execute('second', {
        sourceDigest: source.sha256,
        offset: first.nextOffset,
        limit: 7,
    });

    assert.equal(first.nextOffset, 4);
    assert.equal(second.nextOffset, 11);
    assert.match(first.content, /UNTRUSTED REVIEW CRITERIA/);
    assert.equal(set.ledger.isComplete(), true);
    assert.deepEqual(set.ledger.rows(), [{...source, status: 'EXPOSED'}]);
});

test('rejects duplicate source digests before exposing criteria', () => {
    const duplicate = {
        ...source,
        role: 'PLAN',
        path: 'docs/plans/example.md',
        blobOid: 'c'.repeat(40),
    };
    const verified = {
        ...criteria(),
        record: {...criteria().record, sources: [source, duplicate]},
        blobs: [
            {...source, text: 'one € two'},
            {...duplicate, text: 'one € two'},
        ],
    };

    assert.throws(() => createCriteriaTools(verified), /digests are duplicate/);
});

test('needs no source delivery for an explicit NONE_DECLARED receipt', () => {
    const set = createCriteriaTools(Object.freeze({
        record: Object.freeze({
            schemaVersion: 1,
            kind: 'criteria',
            branch: 'feat/example',
            disposition: 'NONE_DECLARED',
            sources: Object.freeze([]),
        }),
        digest: 'd'.repeat(64),
        blobs: Object.freeze([]),
    }));

    assert.equal(set.ledger.isComplete(), true);
    assert.deepEqual(set.ledger.rows(), []);
});

test('merges delivered intervals and fails closed for unknown sources and ranges', async () => {
    const set = createCriteriaTools(criteria());
    const tool = set.tools.read_criteria;

    await tool.execute('tail', {sourceDigest: source.sha256, offset: 7, limit: 4});
    await tool.execute('middle', {sourceDigest: source.sha256, offset: 4, limit: 4});
    assert.equal(set.ledger.isComplete(), false);
    await tool.execute('head', {sourceDigest: source.sha256, offset: 0, limit: 4});
    assert.equal(set.ledger.isComplete(), true);

    for (const args of [
        {sourceDigest: 'f'.repeat(64), offset: 0, limit: 1},
        {sourceDigest: source.sha256, offset: 5, limit: 1},
        {sourceDigest: source.sha256, offset: 11, limit: 1},
        {sourceDigest: source.sha256, offset: 0, limit: 32769},
    ]) {
        const invalid = createCriteriaTools(criteria());
        await assert.rejects(() => invalid.tools.read_criteria.execute('invalid', args));
        assert.equal(invalid.ledger.isComplete(), false);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
