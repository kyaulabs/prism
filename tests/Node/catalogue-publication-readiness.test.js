// $KYAULabs: catalogue-publication-readiness.test.js kyau@aura.kyaulabs 2026/08/29 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    cataloguePublicationReadinessCommand,
} = require('../../packages/prism-core/scripts/prism-tool/catalogue-publication-readiness');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const EXPECTED_CHECKS = [
    'prism-workflow',
    'publisher-workflow',
    'prism-main-rules',
    'publisher-main-rules',
    'dispatch-environment',
    'signing-environment',
    'dispatch-secret-presence',
    'signing-secret-presence',
    'dispatch-app-id',
    'publication-app-id',
    'activation',
    'sha-pinning',
    'manual-attestation',
];

function ruleset(id) {
    return {
        id,
        name: 'main',
        enforcement: 'active',
        bypass_actors: [],
        rules: [
            {type: 'deletion'},
            {type: 'non_fast_forward'},
            {type: 'required_signatures'},
            {type: 'pull_request'},
        ],
    };
}

function canonicalResponses() {
    return new Map([
        ['repos/kyaulabs/prism/contents/.github/workflows/release.yml?ref=main',
            {path: '.github/workflows/release.yml', sha: 'a'.repeat(40)}],
        ['repos/kyaulabs/prism-adapters/contents/.github/workflows/catalogue-signing.yml?ref=main',
            {path: '.github/workflows/catalogue-signing.yml', sha: 'b'.repeat(40)}],
        ['repos/kyaulabs/prism/rulesets', [{id: 11, name: 'main', enforcement: 'active'}]],
        ['repos/kyaulabs/prism/rulesets/11', ruleset(11)],
        ['repos/kyaulabs/prism-adapters/rulesets', [{id: 22, name: 'main', enforcement: 'active'}]],
        ['repos/kyaulabs/prism-adapters/rulesets/22', ruleset(22)],
        ['repos/kyaulabs/prism/environments/catalogue-dispatch', {
            name: 'catalogue-dispatch',
            deployment_branch_policy: {protected_branches: false, custom_branch_policies: true},
        }],
        ['repos/kyaulabs/prism/environments/catalogue-dispatch/deployment-branch-policies',
            {branch_policies: [{name: 'main'}]}],
        ['repos/kyaulabs/prism/environments/catalogue-dispatch/secrets', {
            secrets: [{name: 'CATALOGUE_DISPATCH_APP_PRIVATE_KEY'}],
        }],
        ['repos/kyaulabs/prism/environments/catalogue-dispatch/variables', {
            variables: [{name: 'CATALOGUE_DISPATCH_APP_ID', value: '10001'}],
        }],
        ['repos/kyaulabs/prism-adapters/environments/catalogue-signing', {
            name: 'catalogue-signing',
            deployment_branch_policy: {protected_branches: false, custom_branch_policies: true},
        }],
        ['repos/kyaulabs/prism-adapters/environments/catalogue-signing/deployment-branch-policies',
            {branch_policies: [{name: 'main'}]}],
        ['repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets', {
            secrets: [
                {name: 'CATALOGUE_SIGNING_PRIVATE_KEY'},
                {name: 'CATALOGUE_SIGNING_PASSPHRASE'},
                {name: 'CATALOGUE_PUBLICATION_APP_PRIVATE_KEY'},
            ],
        }],
        ['repos/kyaulabs/prism-adapters/environments/catalogue-signing/variables', {
            variables: [{name: 'CATALOGUE_PUBLICATION_APP_ID', value: '10002'}],
        }],
        ['repos/kyaulabs/prism/actions/permissions', {sha_pinning_required: true}],
        ['repos/kyaulabs/prism-adapters/actions/permissions', {sha_pinning_required: true}],
        ['repos/kyaulabs/prism-adapters/actions/variables', {variables: []}],
    ]);
}

function attestation() {
    return {
        schemaVersion: 1,
        checkedAt: '2026-08-29T20:00:00Z',
        dispatchApp: {
            appId: 10001,
            installationId: 20001,
            repository: 'kyaulabs/prism-adapters',
            permissions: {actions: 'write'},
        },
        publicationApp: {
            appId: 10002,
            installationId: 20002,
            repository: 'kyaulabs/prism-adapters',
            permissions: {contents: 'write', pullRequests: 'write'},
        },
        retentionDays: {prism: 7, prismAdapters: 7},
        administratorAccessReviewed: true,
        offlineRecoveryCustodyReviewed: true,
    };
}

function fixture() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-readiness-'));
    const evidenceDir = path.join(projectRoot, '.pi', 'prism-tool');
    fs.mkdirSync(evidenceDir, {recursive: true});
    fs.writeFileSync(
        path.join(evidenceDir, 'catalogue-publication-readiness.json'),
        `${JSON.stringify(attestation())}\n`,
        {mode: 0o600},
    );
    const responses = canonicalResponses();
    const requests = [];
    let output = '';
    return {
        context: {
            projectRoot,
            request(endpoint) {
                requests.push(endpoint);
                if (!responses.has(endpoint)) throw new Error('unexpected endpoint');
                return responses.get(endpoint);
            },
            stdout: {write(value) { output += value; }},
        },
        output: () => output,
        requests,
        responses,
    };
}

test('reports GO for canonical pre-activation metadata and attestation', (t) => {
    const state = fixture();
    t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));

    const status = cataloguePublicationReadinessCommand(
        ['readiness', '--phase=pre-activation', '--json'],
        state.context,
    );
    const report = JSON.parse(state.output());

    assert.equal(status, 0);
    assert.equal(report.status, 'GO');
    assert.deepEqual(report.checks.map(({id}) => id), EXPECTED_CHECKS);
    assert.equal(report.checks.every(({status: checkStatus}) => checkStatus === 'PASS'), true);
});

test('requires exact enabled activation only in active phase', (t) => {
    const state = fixture();
    t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));
    state.responses.set('repos/kyaulabs/prism-adapters/actions/variables', {
        variables: [{name: 'CATALOGUE_SIGNING_ENABLED', value: 'true'}],
    });

    const status = cataloguePublicationReadinessCommand(
        ['readiness', '--phase=active', '--json'],
        state.context,
    );

    assert.equal(status, 0);
    assert.equal(JSON.parse(state.output()).status, 'GO');
});

const driftCases = [
    ['missing workflow', (state) => {
        state.responses.delete('repos/kyaulabs/prism/contents/.github/workflows/release.yml?ref=main');
    }],
    ['duplicate main rules', (state) => {
        state.responses.set('repos/kyaulabs/prism/rulesets', [
            {id: 11, name: 'main', enforcement: 'active'},
            {id: 12, name: 'main', enforcement: 'active'},
        ]);
    }],
    ['ruleset bypass actor', (state) => {
        state.responses.get('repos/kyaulabs/prism/rulesets/11').bypass_actors = [{actor_id: 1}];
    }],
    ['missing main environment policy', (state) => {
        state.responses.set(
            'repos/kyaulabs/prism/environments/catalogue-dispatch/deployment-branch-policies',
            {branch_policies: []},
        );
    }],
    ['missing signing secret name', (state) => {
        state.responses.set(
            'repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets',
            {secrets: []},
        );
    }],
    ['secret value exposure', (state) => {
        state.responses.set('repos/kyaulabs/prism/environments/catalogue-dispatch/secrets', {
            secrets: [{name: 'CATALOGUE_DISPATCH_APP_PRIVATE_KEY', value: 'credential-canary'}],
        });
    }],
    ['App ID mismatch', (state) => {
        state.responses.set('repos/kyaulabs/prism/environments/catalogue-dispatch/variables', {
            variables: [{name: 'CATALOGUE_DISPATCH_APP_ID', value: '99999'}],
        });
    }],
    ['SHA pinning disabled', (state) => {
        state.responses.set('repos/kyaulabs/prism/actions/permissions', {sha_pinning_required: false});
    }],
];

for (const [name, mutate] of driftCases) {
    test(`fails closed for ${name}`, (t) => {
        const state = fixture();
        t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));
        mutate(state);

        const status = cataloguePublicationReadinessCommand(
            ['readiness', '--phase=pre-activation', '--json'],
            state.context,
        );
        const output = state.output();

        assert.equal(status, 3);
        assert.equal(JSON.parse(output).status, 'NO-GO');
        assert.doesNotMatch(output, /credential-canary/);
    });
}

test('reports absent human attestation as unresolved MANUAL work', (t) => {
    const state = fixture();
    t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));
    fs.rmSync(path.join(
        state.context.projectRoot,
        '.pi',
        'prism-tool',
        'catalogue-publication-readiness.json',
    ));

    const status = cataloguePublicationReadinessCommand(
        ['readiness', '--phase=pre-activation', '--json'],
        state.context,
    );

    assert.equal(status, 3);
    assert.deepEqual(JSON.parse(state.output()).checks, [{
        id: 'manual-attestation',
        status: 'MANUAL',
        message: 'manual attestation is required',
    }]);
});

test('rejects malformed manual attestation before GitHub access', (t) => {
    const state = fixture();
    t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));
    const file = path.join(
        state.context.projectRoot,
        '.pi',
        'prism-tool',
        'catalogue-publication-readiness.json',
    );
    fs.writeFileSync(file, '{"schemaVersion":1,"unexpected":true}\n');

    const status = cataloguePublicationReadinessCommand(
        ['readiness', '--phase=pre-activation', '--json'],
        state.context,
    );

    assert.equal(status, 3);
    assert.deepEqual(state.requests, []);
    assert.deepEqual(JSON.parse(state.output()).checks, [{
        id: 'manual-attestation',
        status: 'FAIL',
        message: 'manual attestation is invalid',
    }]);
});

test('rejects unknown arguments before filesystem or GitHub access', () => {
    let stderr = '';
    let requests = 0;
    const status = cataloguePublicationReadinessCommand(['readiness', '--apply'], {
        request() { requests += 1; },
        stderr: {write(value) { stderr += value; }},
    });

    assert.equal(status, 2);
    assert.equal(requests, 0);
    assert.match(stderr, /^usage: prism-tool catalogue-publication readiness/);
});

test('exposes readiness through the public prism-tool command', (t) => {
    const state = fixture();
    t.after(() => fs.rmSync(state.context.projectRoot, {recursive: true, force: true}));

    const status = main([
        'catalogue-publication',
        'readiness',
        '--phase=pre-activation',
        '--json',
    ], state.context);

    assert.equal(status, 0);
    assert.equal(JSON.parse(state.output()).command, 'catalogue-publication readiness');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
