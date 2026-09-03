// $KYAULabs: prism-review-authority.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {AXES, LIMIT} = require('../../packages/prism-core/scripts/prism-review/constants');
const {
    inspectAuthorityReadiness,
    runAuthoritativeReview,
} = require('../../packages/prism-core/scripts/prism-review/authority');

function tempRoot(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-authority-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return root;
}

function packageRoot(root, name, version, marker) {
    fs.mkdirSync(root, {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({name, version})}\n`);
    fs.writeFileSync(path.join(root, 'marker.txt'), marker);
    return root;
}

function authorityFixture(t, outcome = 'PASS') {
    const root = tempRoot(t);
    const repositoryRoot = path.join(root, 'repository');
    const coreRoot = packageRoot(path.join(root, 'installed-core'), '@fixture/core', '1.2.3', 'core');
    const localAdapterRoot = packageRoot(path.join(repositoryRoot, 'adapter'), '@fixture/adapter', '2.3.4', 'local');
    const externalAdapterRoot = packageRoot(path.join(root, 'installed-adapter'), '@fixture/adapter', '2.3.4', 'adapter');
    fs.mkdirSync(path.join(repositoryRoot, '.pi'), {recursive: true});
    const baseSha = '1'.repeat(40);
    const headSha = '2'.repeat(40);
    const snapshot = Object.freeze({
        schemaVersion: 1,
        mode: 'branch',
        repositoryRoot,
        baseCommit: baseSha,
        headCommit: headSha,
        entries: Object.freeze([]),
        manifest: Object.freeze([]),
        diffDigest: '3'.repeat(64),
        manifestDigest: '4'.repeat(64),
    });
    const resource = (id, sha256) => Object.freeze({id, path: `skills/${id}/SKILL.md`, sha256,
        bytes: Buffer.from(id), text: id});
    const core = Object.freeze({
        packageName: '@fixture/core', role: 'core', profileDigest: '5'.repeat(64),
        policyDigest: '6'.repeat(64), resources: Object.freeze([
            resource('session', '7'.repeat(64)), resource('verifier', '8'.repeat(64)),
            ...AXES.map((axis, index) => resource(`skill-${axis}`, String(index + 1).repeat(64))),
        ]),
        profile: Object.freeze({sessionSkill: 'session', verifierSkills: Object.freeze(['verifier'])}),
    });
    const adapter = Object.freeze({
        packageName: '@fixture/adapter', role: 'adapter', profileDigest: '9'.repeat(64),
        policyDigest: 'a'.repeat(64), resources: Object.freeze([]), profile: Object.freeze({}),
    });
    const plan = Object.freeze({
        schemaVersion: 1, policyDigest: 'b'.repeat(64), planDigest: 'c'.repeat(64),
        exemptions: Object.freeze([]),
        axes: Object.freeze(AXES.map((axis) => Object.freeze({
            id: axis,
            lenses: Object.freeze([Object.freeze({
                id: `core.${axis}`, skill: `skill-${axis}`, package: '@fixture/core',
            })]),
        }))),
    });
    const criteria = Object.freeze({
        record: Object.freeze({schemaVersion: 1, kind: 'criteria', branch: 'feat/example',
            disposition: 'NONE_DECLARED', sources: Object.freeze([])}),
        digest: 'd'.repeat(64), blobs: Object.freeze([]),
    });
    const check = Object.freeze({
        schemaVersion: 1, kind: 'check', status: 'PASS', branch: 'feat/example',
        baseRef: 'origin/develop', baseSha, headSha,
        core: Object.freeze({packageName: '@fixture/core', packageVersion: '1.2.3'}),
        adapter: Object.freeze({id: 'fixture-quality', packageName: '@fixture/adapter',
            packageVersion: '2.3.4', protocolVersion: 1, gates: Object.freeze(['fixture.gate']),
            sourceClass: 'INSTALLED_EXTERNAL'}),
        gates: Object.freeze([]), digest: 'e'.repeat(64),
    });
    const model = Object.freeze({provider: 'fixture', id: 'model', reasoningLevel: 'high',
        contextWindow: 200000, authentication: 'UNKNOWN'});
    let chain = null;
    const overrides = {};
    const context = {
        projectRoot: repositoryRoot,
        coreRoot,
        resolveRepositoryIdentity: () => ({branch: 'feat/example', baseRef: 'origin/develop', baseSha, headSha,
            ...(overrides.repository ?? {})}),
        verifyCriteria: () => ({...criteria, digest: overrides.criteriaDigest ?? criteria.digest}),
        verifyCheck: () => ({...check, digest: overrides.checkDigest ?? check.digest,
            baseSha: overrides.checkBase ?? check.baseSha,
            headSha: overrides.checkHead ?? check.headSha}),
        discoverOptionalAdapter: () => ({packageName: '@fixture/adapter', packageRoot: localAdapterRoot,
            reviewPath: path.join(localAdapterRoot, 'review.json')}),
        loadCoreProfile: () => ({...core,
            profileDigest: overrides.coreProfileDigest ?? core.profileDigest,
            policyDigest: overrides.corePolicyDigest ?? core.policyDigest,
            resources: overrides.coreResources ?? core.resources}),
        loadAdapterProfile: () => adapter,
        resolveQualityProvider: () => ({
            identity: check.adapter,
            registration: {packageName: '@fixture/adapter', packageVersion: '2.3.4',
                packageRoot: externalAdapterRoot},
        }),
        createSnapshot: () => ({...snapshot, ...(overrides.snapshot ?? {})}),
        buildReviewPlan: () => ({...plan,
            policyDigest: overrides.planPolicyDigest ?? plan.policyDigest,
            planDigest: overrides.planDigest ?? plan.planDigest}),
        resolveActiveModel: async () => ({metadata: {...model, ...(overrides.model ?? {})}}),
        runReviewAttempt: async () => {
            context.sessionCalls += 1;
            return {
                schemaVersion: 1, command: 'review branch', authoritative: true,
                sourceClass: 'INSTALLED_EXTERNAL', outcome,
                scope: {mode: 'branch', baseCommit: baseSha, headCommit: headSha},
                model, policyDigest: plan.policyDigest, planDigest: plan.planDigest,
                manifestDigest: snapshot.manifestDigest,
                axes: AXES.map((id) => ({id, status: 'COMPLETE', outcome, reason: null})),
                byteExposure: [],
                lenses: plan.axes.flatMap(({id, lenses}) => lenses.map((lens) => ({
                    axis: id, id: lens.id, package: lens.package, status: 'COMPLETE',
                }))),
                exemptions: [], findings: [], verifier: {complete: true, chunks: 0, dispositions: []},
                limits: LIMIT,
                criteriaExposure: {disposition: 'NONE_DECLARED', status: 'NONE_DECLARED', sources: []},
            };
        },
        inspectReviewChainV2: () => chain === null ? {state: 'ABSENT'} : {state: 'VALID', record: chain},
        recordReviewAttempt: (request) => {
            if (request.report.outcome === 'INCONCLUSIVE') {
                return {status: 'INCONCLUSIVE', diagnostic: {reason: 'REVIEW_INCONCLUSIVE'}};
            }
            chain = {
                schemaVersion: 2, kind: 'review-chain', branch: request.branch, baseRef: request.baseRef,
                baseSha: request.baseSha, headSha: request.check.headSha,
                criteriaDigest: request.criteriaDigest,
                segments: [{
                    range: {from: request.fromSha, to: request.check.headSha},
                    snapshot: request.snapshot,
                    criteriaDigest: request.criteriaDigest,
                    check: {digest: request.check.digest, headSha: request.check.headSha},
                    core: request.core, adapter: request.adapter,
                    plan: {planDigest: request.report.planDigest, profileDigest: request.profileDigest,
                        policyDigest: request.report.policyDigest, resourceDigest: request.resourceDigest,
                        skillDigest: request.skillDigest},
                    model: {provider: request.report.model.provider, id: request.report.model.id,
                        reasoningLevel: request.report.model.reasoningLevel,
                        contextWindow: request.report.model.contextWindow},
                }],
                findings: [], openBlocking: request.report.outcome === 'BLOCKING'
                    ? ['f'.repeat(64)]
                    : [],
            };
            return chain;
        },
        sessionCalls: 0,
    };
    return {context, coreRoot, externalAdapterRoot, overrides,
        get chain() { return chain; },
        clearChain() { chain = null; }};
}

test('rejects checkout Core before resolving or calling the active model', async (t) => {
    const repositoryRoot = tempRoot(t);
    let modelCalls = 0;
    const context = {
        projectRoot: repositoryRoot,
        coreRoot: repositoryRoot,
        resolveActiveModel: async () => {
            modelCalls += 1;
            throw new Error('model must not be resolved');
        },
    };

    assert.deepEqual(inspectAuthorityReadiness(context), {
        eligible: false,
        sourceClass: 'REVIEWED_WORKTREE',
        reason: 'CORE_NOT_EXTERNAL',
    });
    await assert.rejects(() => runAuthoritativeReview({
        operation: 'initial', baseRef: 'origin/develop', newInitial: false,
    }, context), /installed Core authority is required/i);
    assert.equal(modelCalls, 0);
});

test('rejects missing authority prerequisites before any review session', async (t) => {
    const cases = [
        ['criteria', (fixture) => { fixture.context.verifyCriteria = () => { throw new Error('criteria missing'); }; }],
        ['check', (fixture) => { fixture.context.verifyCheck = () => { throw new Error('check missing'); }; }],
        ['failed check', (fixture) => {
            const verify = fixture.context.verifyCheck;
            fixture.context.verifyCheck = () => ({...verify(), status: 'FAIL'});
        }],
        ['stale check', (fixture) => {
            const verify = fixture.context.verifyCheck;
            fixture.context.verifyCheck = () => ({...verify(), headSha: '0'.repeat(40)});
        }],
        ['external adapter', (fixture) => { fixture.context.resolveQualityProvider = () => {
            throw new Error('external adapter missing');
        }; }],
        ['clean repository', (fixture) => { fixture.context.resolveRepositoryIdentity = () => {
            throw new Error('authoritative repository is dirty');
        }; }],
        ['protected target', (fixture) => { fixture.context.resolveRepositoryIdentity = () => {
            throw new Error('authoritative target is stale');
        }; }],
    ];
    for (const [name, change] of cases) {
        await t.test(name, async (child) => {
            const fixture = authorityFixture(child);
            change(fixture);
            await assert.rejects(() => runAuthoritativeReview({
                operation: 'initial', baseRef: 'origin/develop', newInitial: false,
            }, fixture.context));
            assert.equal(fixture.context.sessionCalls, 0);
        });
    }
});

test('records one complete initial review and reuses the exact same HEAD', async (t) => {
    const fixture = authorityFixture(t);
    const input = {operation: 'initial', baseRef: 'origin/develop', newInitial: false};

    const first = await runAuthoritativeReview(input, fixture.context);
    assert.equal(first.authoritative, true);
    assert.equal(first.reused, false);
    assert.equal(fixture.context.sessionCalls, 1);
    const second = await runAuthoritativeReview(input, fixture.context);
    assert.equal(second.reused, true);
    assert.equal(second.receipt, fixture.chain);
    assert.equal(fixture.context.sessionCalls, 1);
});

test('records Blocking and Inconclusive outcomes without treating either as reusable PASS', async (t) => {
    const blocking = authorityFixture(t, 'BLOCKING');
    const blocked = await runAuthoritativeReview({
        operation: 'initial', baseRef: 'origin/develop', newInitial: false,
    }, blocking.context);
    assert.equal(blocked.outcome, 'BLOCKING');
    assert.equal(blocked.receipt.openBlocking.length, 1);

    const inconclusive = authorityFixture(t, 'INCONCLUSIVE');
    const incomplete = await runAuthoritativeReview({
        operation: 'initial', baseRef: 'origin/develop', newInitial: false,
    }, inconclusive.context);
    assert.equal(incomplete.outcome, 'INCONCLUSIVE');
    assert.equal(incomplete.receipt.status, 'INCONCLUSIVE');
    assert.equal(inconclusive.chain, null);
});

test('requires explicit replacement for legacy review state', async (t) => {
    const fixture = authorityFixture(t);
    fixture.context.inspectReviewChainV2 = () => ({state: 'LEGACY', record: {schemaVersion: 1}});
    await assert.rejects(() => runAuthoritativeReview({
        operation: 'initial', baseRef: 'origin/develop', newInitial: false,
    }, fixture.context), /review chain is unavailable/i);
    const replaced = await runAuthoritativeReview({
        operation: 'initial', baseRef: 'origin/develop', newInitial: true,
    }, fixture.context);
    assert.equal(replaced.reused, false);
});

test('refuses reuse when any bound authority identity changes', async (t) => {
    const cases = [
        ['check', (fixture) => { fixture.overrides.checkDigest = '0'.repeat(64); }],
        ['criteria', (fixture) => { fixture.overrides.criteriaDigest = '0'.repeat(64); }],
        ['Core bytes', (fixture) => fs.writeFileSync(path.join(fixture.coreRoot, 'marker.txt'), 'changed')],
        ['Core version', (fixture) => fs.writeFileSync(path.join(fixture.coreRoot, 'package.json'),
            `${JSON.stringify({name: '@fixture/core', version: '1.2.4'})}\n`)],
        ['adapter bytes', (fixture) => fs.writeFileSync(path.join(fixture.externalAdapterRoot, 'marker.txt'), 'changed')],
        ['adapter version', (fixture) => fs.writeFileSync(path.join(fixture.externalAdapterRoot, 'package.json'),
            `${JSON.stringify({name: '@fixture/adapter', version: '2.3.5'})}\n`)],
        ['profile', (fixture) => { fixture.overrides.coreProfileDigest = '0'.repeat(64); }],
        ['policy', (fixture) => { fixture.overrides.planPolicyDigest = '0'.repeat(64); }],
        ['skill', (fixture) => { fixture.overrides.coreResources = fixture.context.loadCoreProfile().resources.map(
            (item, index) => index === 0 ? {...item, sha256: '0'.repeat(64)} : item); }],
        ['model', (fixture) => { fixture.overrides.model = {id: 'other-model'}; }],
        ['reasoning', (fixture) => { fixture.overrides.model = {reasoningLevel: 'medium'}; }],
        ['base', (fixture) => {
            fixture.overrides.repository = {baseSha: '0'.repeat(40)};
            fixture.overrides.checkBase = '0'.repeat(40);
            fixture.overrides.snapshot = {baseCommit: '0'.repeat(40)};
        }],
        ['HEAD', (fixture) => {
            fixture.overrides.repository = {headSha: '0'.repeat(40)};
            fixture.overrides.checkHead = '0'.repeat(40);
            fixture.overrides.snapshot = {headCommit: '0'.repeat(40)};
        }],
        ['snapshot', (fixture) => { fixture.overrides.snapshot = {manifestDigest: '0'.repeat(64)}; }],
    ];
    for (const [name, change] of cases) {
        await t.test(name, async (child) => {
            const fixture = authorityFixture(child);
            const input = {operation: 'initial', baseRef: 'origin/develop', newInitial: false};
            await runAuthoritativeReview(input, fixture.context);
            change(fixture);
            await assert.rejects(() => runAuthoritativeReview(input, fixture.context), /stale|mismatch/i);
            assert.equal(fixture.context.sessionCalls, 1);
        });
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
