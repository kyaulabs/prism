// $KYAULabs: catalogue-publication-readiness.js kyau@aura.kyaulabs 2026/08/30 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {runBounded} = require('./process');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3});
const REPOSITORY = 'kyaulabs/prism-adapters';
const ATTESTATION_PATH = path.join('.pi', 'prism-tool', 'catalogue-publication-readiness.json');
const STATIC_ENDPOINTS = new Set([
    'repos/kyaulabs/prism/contents/.github/workflows/release.yml?ref=main',
    'repos/kyaulabs/prism-adapters/contents/.github/workflows/catalogue-signing.yml?ref=main',
    'repos/kyaulabs/prism/rulesets',
    'repos/kyaulabs/prism-adapters/rulesets',
    'repos/kyaulabs/prism/environments/catalogue-dispatch',
    'repos/kyaulabs/prism/environments/catalogue-dispatch/deployment-branch-policies',
    'repos/kyaulabs/prism/environments/catalogue-dispatch/secrets',
    'repos/kyaulabs/prism-adapters/environments/catalogue-signing',
    'repos/kyaulabs/prism-adapters/environments/catalogue-signing/deployment-branch-policies',
    'repos/kyaulabs/prism-adapters/environments/catalogue-signing/secrets',
    'repos/kyaulabs/prism/actions/permissions',
    'repos/kyaulabs/prism-adapters/actions/permissions',
    'repos/kyaulabs/prism-adapters/actions/variables',
]);
const RULESET_ENDPOINT = /^repos\/kyaulabs\/(?:prism|prism-adapters)\/rulesets\/[1-9][0-9]*$/;

function exactKeys(value, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length &&
        actual.every((key, index) => key === expected[index]);
}

function positiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
}

function validCredential(value, {label, permissions}) {
    return exactKeys(value, [
        'type', 'label', 'credentialOwner', 'resourceOwner', 'repositories',
        'permissions', 'expiresAt', 'rotationPolicy',
    ]) && value.type === 'FINE_GRAINED_PAT' && value.label === label &&
        value.credentialOwner === 'kyaulabs-bot' && value.resourceOwner === 'kyaulabs' &&
        Array.isArray(value.repositories) && value.repositories.length === 1 &&
        value.repositories[0] === REPOSITORY &&
        exactKeys(value.permissions, Object.keys(permissions)) &&
        Object.entries(permissions).every(([name, access]) => value.permissions[name] === access) &&
        value.expiresAt === null && value.rotationPolicy === 'NONE_ACCEPTED';
}

function validateAttestation(value) {
    if (!exactKeys(value, [
        'schemaVersion', 'checkedAt', 'dispatchCredential', 'publicationCredential',
        'credentialSeparationReviewed', 'retentionDays',
        'administratorAccessReviewed', 'offlineRecoveryCustodyReviewed',
    ]) || value.schemaVersion !== 2 ||
        typeof value.checkedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.checkedAt) ||
        Number.isNaN(Date.parse(value.checkedAt)) ||
        new Date(Date.parse(value.checkedAt)).toISOString().replace('.000Z', 'Z') !== value.checkedAt ||
        !validCredential(value.dispatchCredential, {
            label: 'prism-catalogue-dispatch',
            permissions: {actions: 'write'},
        }) ||
        !validCredential(value.publicationCredential, {
            label: 'prism-adapters-catalogue-publication',
            permissions: {contents: 'write', pullRequests: 'write'},
        }) ||
        value.dispatchCredential.label === value.publicationCredential.label ||
        value.credentialSeparationReviewed !== true ||
        !exactKeys(value.retentionDays, ['prism', 'prismAdapters']) ||
        value.retentionDays.prism !== 7 || value.retentionDays.prismAdapters !== 7 ||
        value.administratorAccessReviewed !== true ||
        value.offlineRecoveryCustodyReviewed !== true) {
        throw new Error('catalogue publication attestation is invalid');
    }
    return value;
}

function readAttestation(projectRoot) {
    const file = path.join(projectRoot, ATTESTATION_PATH);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) {
        throw new Error('catalogue publication attestation is invalid');
    }
    return validateAttestation(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function defaultRequest(context) {
    return (endpoint) => {
        if (!STATIC_ENDPOINTS.has(endpoint) && !RULESET_ENDPOINT.test(endpoint)) {
            throw new Error('catalogue publication endpoint is invalid');
        }
        const result = (context.run ?? runBounded)('gh', ['api', endpoint], {
            env: context.env ?? process.env,
            timeout: 30000,
            maxBuffer: 1048576,
        });
        if (result.status !== 0 || result.timedOut || Buffer.byteLength(result.stdout) > 1048576) {
            throw new Error('catalogue publication metadata is unavailable');
        }
        return JSON.parse(result.stdout);
    };
}

function pass(id, message) {
    return {id, status: 'PASS', message};
}

function fail(id, message) {
    return {id, status: 'FAIL', message};
}

function manual(id, message) {
    return {id, status: 'MANUAL', message};
}

function advisory(id, message) {
    return {id, status: 'ADVISORY', message};
}

function evaluate(id, message, operation) {
    try {
        return operation() ? pass(id, message) : fail(id, message);
    } catch {
        return fail(id, message);
    }
}

function workflowReady(value, expectedPath) {
    return value?.path === expectedPath && /^[0-9a-f]{40}$/.test(value?.sha ?? '');
}

function rulesReady(request, repository) {
    const list = request(`repos/${repository}/rulesets`);
    if (!Array.isArray(list)) return false;
    const matches = list.filter((item) => item?.name === 'main' && item?.enforcement === 'active');
    if (matches.length !== 1 || !positiveInteger(matches[0].id)) return false;
    const detail = request(`repos/${repository}/rulesets/${matches[0].id}`);
    if (detail?.name !== 'main' || detail?.enforcement !== 'active' ||
        !Array.isArray(detail.bypass_actors) || detail.bypass_actors.length !== 0 ||
        !Array.isArray(detail.rules)) return false;
    const types = new Set(detail.rules.map(({type}) => type));
    return ['deletion', 'non_fast_forward', 'required_signatures', 'pull_request']
        .every((type) => types.has(type));
}

function environmentReady(request, repository, environment) {
    const prefix = `repos/${repository}/environments/${environment}`;
    const value = request(prefix);
    const policy = value?.deployment_branch_policy;
    if (value?.name !== environment || policy?.protected_branches !== false ||
        policy?.custom_branch_policies !== true) return false;
    const policies = request(`${prefix}/deployment-branch-policies`)?.branch_policies;
    return Array.isArray(policies) && policies.length === 1 && policies[0]?.name === 'main';
}

function namesReady(value, key, expected) {
    const entries = value?.[key];
    if (!Array.isArray(entries) || entries.some((entry) => Object.hasOwn(entry, 'value') && key === 'secrets')) {
        return false;
    }
    const names = entries.map(({name}) => name).sort();
    return JSON.stringify(names) === JSON.stringify([...expected].sort());
}

function variableValue(value, name) {
    const matches = (value?.variables ?? []).filter((entry) => entry?.name === name);
    return matches.length === 1 ? matches[0].value : undefined;
}

function inspectCataloguePublicationReadiness({phase, attestation, request}) {
    const dispatchPrefix = 'repos/kyaulabs/prism/environments/catalogue-dispatch';
    const signingPrefix = 'repos/kyaulabs/prism-adapters/environments/catalogue-signing';
    const checks = [
        evaluate('prism-workflow', 'trusted Prism release workflow is present', () =>
            workflowReady(request('repos/kyaulabs/prism/contents/.github/workflows/release.yml?ref=main'),
                '.github/workflows/release.yml')),
        evaluate('publisher-workflow', 'trusted publisher workflow is present', () =>
            workflowReady(request('repos/kyaulabs/prism-adapters/contents/.github/workflows/catalogue-signing.yml?ref=main'),
                '.github/workflows/catalogue-signing.yml')),
        evaluate('prism-main-rules', 'Prism main rules are active without bypass', () =>
            rulesReady(request, 'kyaulabs/prism')),
        evaluate('publisher-main-rules', 'publisher main rules are active without bypass', () =>
            rulesReady(request, 'kyaulabs/prism-adapters')),
        evaluate('dispatch-environment', 'dispatch environment is restricted to main', () =>
            environmentReady(request, 'kyaulabs/prism', 'catalogue-dispatch')),
        evaluate('signing-environment', 'signing environment is restricted to main', () =>
            environmentReady(request, 'kyaulabs/prism-adapters', 'catalogue-signing')),
        evaluate('dispatch-secret-presence', 'dispatch credential name is present', () =>
            namesReady(request(`${dispatchPrefix}/secrets`), 'secrets',
                ['CATALOGUE_DISPATCH_TOKEN'])),
        evaluate('signing-secret-presence', 'signing credential names are present', () =>
            namesReady(request(`${signingPrefix}/secrets`), 'secrets', [
                'CATALOGUE_SIGNING_PRIVATE_KEY',
                'CATALOGUE_SIGNING_PASSPHRASE',
                'CATALOGUE_PUBLICATION_TOKEN',
            ])),
        evaluate('activation', 'activation matches requested phase', () => {
            const actual = variableValue(
                request('repos/kyaulabs/prism-adapters/actions/variables'),
                'CATALOGUE_SIGNING_ENABLED',
            );
            return phase === 'active' ? actual === 'true' : actual !== 'true';
        }),
        evaluate('sha-pinning', 'full action SHA pinning is required', () =>
            request('repos/kyaulabs/prism/actions/permissions')?.sha_pinning_required === true &&
            request('repos/kyaulabs/prism-adapters/actions/permissions')?.sha_pinning_required === true),
        pass('dispatch-credential-scope', 'dispatch credential scope is attested'),
        pass('publication-credential-scope', 'publication credential scope is attested'),
        pass('credential-separation', 'separate credential authority is attested'),
        advisory('credential-lifecycle', 'non-expiring credentials have no planned rotation'),
        pass('manual-attestation', 'manual custody and retention controls are attested'),
    ];
    return checks;
}

function cataloguePublicationReadinessCommand(args, context = {}) {
    const phaseArgument = args.find((argument) => argument.startsWith('--phase='));
    const phase = phaseArgument?.slice('--phase='.length);
    if (args[0] !== 'readiness' || !['pre-activation', 'active'].includes(phase) ||
        args.some((argument) => !['readiness', '--json', `--phase=${phase}`].includes(argument))) {
        (context.stderr ?? process.stderr).write(
            'usage: prism-tool catalogue-publication readiness --phase=pre-activation|active [--json]\n',
        );
        return EXIT.USAGE;
    }
    let attestation;
    try {
        attestation = readAttestation(context.projectRoot ?? process.cwd());
    } catch (error) {
        const check = error?.code === 'ENOENT'
            ? manual('manual-attestation', 'manual attestation is required')
            : fail('manual-attestation', 'manual attestation is invalid');
        const report = {
            schemaVersion: 1,
            command: 'catalogue-publication readiness',
            phase,
            status: 'NO-GO',
            checks: [check],
        };
        (context.stdout ?? process.stdout).write(`${JSON.stringify(report)}\n`);
        return EXIT.READINESS;
    }
    const checks = inspectCataloguePublicationReadiness({
        phase,
        attestation,
        request: context.request ?? defaultRequest(context),
    });
    const status = checks.every(({status: checkStatus}) =>
        checkStatus === 'PASS' || checkStatus === 'ADVISORY') ? 'GO' : 'NO-GO';
    const report = {schemaVersion: 1, command: 'catalogue-publication readiness', phase, status, checks};
    (context.stdout ?? process.stdout).write(`${JSON.stringify(report)}\n`);
    return status === 'GO' ? EXIT.OK : EXIT.READINESS;
}

module.exports = {
    cataloguePublicationReadinessCommand,
    inspectCataloguePublicationReadiness,
    validateAttestation,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
