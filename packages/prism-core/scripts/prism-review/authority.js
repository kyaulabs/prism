// $KYAULabs: authority.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {digestJson} = require('./canonical-json');
const {verifyCheck} = require('./check');
const {verifyCriteria} = require('./criteria');
const {validateClosureProposal} = require('./findings');
const {createSnapshot} = require('./git-snapshot');
const {runAuthoritativeAttempt} = require('./orchestrator');
const {buildReviewPlan, loadAdapterProfile, loadCoreProfile} = require('./profile');
const {resolveQualityProvider} = require('./quality-provider');
const {inspectReviewChainV2, recordReviewAttempt} = require('./review-chain-v2');
const {resolveActiveModel} = require('./session-runner');
const {classifyTrustRoot} = require('./trust');
const {discoverOptionalAdapter} = require('../prism-tool/discovery');

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const MAX_PACKAGE_FILES = 4096;
const MAX_PACKAGE_BYTES = 33554432;

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
        throw new Error(`${label} is invalid`);
    }
}

function roots(context) {
    return {
        coreRoot: fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..')),
        repositoryRoot: fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd()),
    };
}

function inspectAuthorityReadiness(context = {}) {
    const resolved = roots(context);
    const trust = (context.classifyTrustRoot ?? classifyTrustRoot)(
        resolved.coreRoot,
        resolved.repositoryRoot
    );
    return trust.eligibleForAuthority
        ? {eligible: true, sourceClass: trust.sourceClass, reason: null}
        : {eligible: false, sourceClass: trust.sourceClass, reason: 'CORE_NOT_EXTERNAL'};
}

function git(context, repositoryRoot, args) {
    const result = (context.runGit ?? childProcess.spawnSync)('git', args, {
        cwd: repositoryRoot,
        env: context.env ?? process.env,
        encoding: 'utf8',
        maxBuffer: 1048577,
        timeout: 30000,
    });
    if (result.error || result.status !== 0 || Buffer.byteLength(result.stdout ?? '') > 1048576) {
        throw new Error('authoritative Git evidence is unavailable');
    }
    return String(result.stdout ?? '').trim();
}

function targetForBranch(branch) {
    return /^(?:release\/|hotfix\/)/.test(branch) ? 'main' : 'develop';
}

function resolveRepositoryIdentity(input, context, repositoryRoot) {
    const branch = git(context, repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (!BRANCH.test(branch)) throw new Error('authoritative branch is invalid');
    const baseRef = `origin/${targetForBranch(branch)}`;
    if (input.baseRef !== baseRef) throw new Error('authoritative target is stale');
    const baseSha = git(context, repositoryRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const headSha = git(context, repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
    if (!OBJECT_ID.test(baseSha) || !OBJECT_ID.test(headSha)) throw new Error('authoritative object identity is invalid');
    git(context, repositoryRoot, ['merge-base', '--is-ancestor', baseSha, headSha]);
    if (git(context, repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']) !== '') {
        throw new Error('authoritative repository is dirty');
    }
    return {branch, baseRef, baseSha, headSha};
}

function readHeldFile(filePath) {
    const before = fs.lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error('authority package file is invalid');
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const bytes = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor);
        if (!held.isFile() || held.dev !== before.dev || held.ino !== before.ino ||
            held.size !== bytes.length || after.dev !== held.dev || after.ino !== held.ino ||
            after.size !== held.size) throw new Error('authority package file changed');
        return {bytes, mode: held.mode & 0o777};
    } finally {
        fs.closeSync(descriptor);
    }
}

function packageFiles(root, current = root, output = []) {
    for (const name of fs.readdirSync(current).sort()) {
        if (name === 'node_modules') continue;
        const absolute = path.join(current, name);
        const identity = fs.lstatSync(absolute);
        if (identity.isSymbolicLink()) throw new Error('authority package contains a symbolic link');
        if (identity.isDirectory()) packageFiles(root, absolute, output);
        else if (identity.isFile()) output.push({absolute, path: path.relative(root, absolute).split(path.sep).join('/')});
        else throw new Error('authority package contains an unsupported entry');
        if (output.length > MAX_PACKAGE_FILES) throw new Error('authority package exceeds file limit');
    }
    return output;
}

function packageIdentity(packageRoot, sourceClass, adapter = null) {
    const root = fs.realpathSync(packageRoot);
    const requested = fs.lstatSync(packageRoot);
    if (!requested.isDirectory() || requested.isSymbolicLink() || root !== path.resolve(packageRoot)) {
        throw new Error('authority package root is invalid');
    }
    let total = 0;
    let manifestBytes = null;
    const inventory = packageFiles(root).map((entry) => {
        const held = readHeldFile(entry.absolute);
        if (entry.path === 'package.json') manifestBytes = held.bytes;
        total += held.bytes.length;
        if (total > MAX_PACKAGE_BYTES) throw new Error('authority package exceeds byte limit');
        return {path: entry.path, mode: held.mode, bytes: held.bytes.length,
            sha256: crypto.createHash('sha256').update(held.bytes).digest('hex')};
    });
    if (manifestBytes === null) throw new Error('authority package manifest is unavailable');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name ?? '') ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? '')) {
        throw new Error('authority package manifest is invalid');
    }
    const identity = {
        name: manifest.name,
        version: manifest.version,
        digest: digestJson(inventory),
        sourceClass,
    };
    return adapter === null ? identity : {
        ...identity,
        providerId: adapter.id,
        protocolVersion: adapter.protocolVersion,
    };
}

function resourceIdentities(core, adapter) {
    return [...core.resources, ...(adapter?.resources ?? [])].map(({id, path: resourcePath, sha256}) => ({
        id, path: resourcePath, sha256,
    }));
}

function planIdentities(core, adapter, plan) {
    const resources = resourceIdentities(core, adapter);
    const selected = new Set([
        core.profile.sessionSkill,
        ...core.profile.verifierSkills,
        ...plan.axes.flatMap(({lenses}) => lenses.map(({skill}) => skill)),
    ]);
    return {
        profileDigest: digestJson({core: core.profileDigest, adapter: adapter?.profileDigest ?? null}),
        resourceDigest: digestJson(resources),
        skillDigest: digestJson(resources.filter(({id}) => selected.has(id))),
    };
}

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function assertContinuousHistory(context, repositoryRoot, fromSha, toSha) {
    if (context.assertAncestor !== undefined) {
        if (context.assertAncestor(fromSha, toSha) !== true) {
            throw new Error('repair review history is discontinuous');
        }
        return;
    }
    git(context, repositoryRoot, ['merge-base', '--is-ancestor', fromSha, toSha]);
}

function trackedClosureTest(context, repositoryRoot, headSha, testPath) {
    if (context.isTrackedClosureTest !== undefined) {
        return context.isTrackedClosureTest(testPath, headSha) === true;
    }
    return git(context, repositoryRoot,
        ['ls-tree', '-r', '--name-only', '-z', headSha, '--', `:(literal)${testPath}`]) === `${testPath}\0`;
}

function repairContext(input, current, criteria, check, repository, context, repositoryRoot) {
    if (current.state !== 'VALID' || current.record.branch !== repository.branch ||
        current.record.baseRef !== repository.baseRef || current.record.baseSha !== repository.baseSha ||
        current.record.criteriaDigest !== criteria.digest || current.record.headSha === repository.headSha) {
        throw new Error('repair review chain is discontinuous');
    }
    assertContinuousHistory(context, repositoryRoot, current.record.headSha, repository.headSha);
    const proposal = validateClosureProposal(input.closures);
    const open = current.record.findings.filter(({state, classification}) =>
        state === 'OPEN' && classification === 'BLOCKING');
    const openByFingerprint = new Map(open.map((finding) => [finding.fingerprint, finding]));
    const gates = new Map(check.gates.map(({id, status}) => [id, status]));
    for (const closure of proposal.closures) {
        if (!openByFingerprint.has(closure.fingerprint)) {
            throw new Error('repair closure target is invalid');
        }
        for (const test of closure.tests) {
            if (gates.get(test.gateId) !== 'PASS' ||
                !trackedClosureTest(context, repositoryRoot, repository.headSha, test.path)) {
                throw new Error('repair closure test is invalid');
            }
        }
    }
    return {
        priorOpenBlocking: open,
        proposals: proposal.closures,
        check: {
            digest: check.digest,
            headSha: check.headSha,
            gates: check.gates.map(({id, status}) => ({id, status})),
        },
    };
}

function reusable(record, identity) {
    if (record.branch !== identity.branch || record.baseRef !== identity.baseRef ||
        record.baseSha !== identity.baseSha || record.headSha !== identity.headSha ||
        record.criteriaDigest !== identity.criteriaDigest) return false;
    const segment = record.segments.at(-1);
    return segment.range.to === identity.headSha &&
        segment.check.digest === identity.check.digest &&
        same(segment.snapshot, identity.snapshot) && same(segment.core, identity.core) &&
        same(segment.adapter, identity.adapter) && same(segment.plan, identity.plan) &&
        same(segment.model, identity.model);
}

async function runAuthoritativeReview(input, context = {}) {
    const operation = input?.operation;
    exact(input, operation === 'repair'
        ? ['operation', 'baseRef', 'newInitial', 'closures']
        : ['operation', 'baseRef', 'newInitial'], 'authoritative review request');
    if (!['initial', 'repair'].includes(operation) || typeof input.newInitial !== 'boolean' ||
        (operation === 'repair' && input.newInitial)) {
        throw new Error('authoritative review request is invalid');
    }
    const resolved = roots(context);
    const readiness = inspectAuthorityReadiness(context);
    if (!readiness.eligible) throw new Error('installed Core authority is required');
    const repository = (context.resolveRepositoryIdentity ?? resolveRepositoryIdentity)(
        input, context, resolved.repositoryRoot
    );
    const criteria = (context.verifyCriteria ?? verifyCriteria)({branch: repository.branch}, {
        ...context, projectRoot: resolved.repositoryRoot,
    });
    if (criteria?.record?.branch !== repository.branch || !/^[0-9a-f]{64}$/.test(criteria?.digest ?? '')) {
        throw new Error('criteria receipt is unavailable');
    }
    const check = (context.verifyCheck ?? verifyCheck)(repository, {
        ...context, projectRoot: resolved.repositoryRoot, coreRoot: resolved.coreRoot,
    });
    if (check?.status !== 'PASS' || !/^[0-9a-f]{64}$/.test(check?.digest ?? '') ||
        !['branch', 'baseRef', 'baseSha', 'headSha'].every((key) => check[key] === repository[key])) {
        throw new Error('check receipt is unavailable');
    }
    const inspectChain = context.inspectReviewChainV2 ?? inspectReviewChainV2;
    const current = inspectChain({...context, projectRoot: resolved.repositoryRoot});
    const repair = operation === 'repair'
        ? repairContext(input, current, criteria, check, repository, context, resolved.repositoryRoot)
        : null;
    const snapshotBase = repair === null ? repository.baseSha : current.record.headSha;
    const loadCore = context.loadCoreProfile ?? loadCoreProfile;
    const coreProfile = loadCore({packageRoot: resolved.coreRoot});
    const discover = context.discoverOptionalAdapter ?? discoverOptionalAdapter;
    const registration = discover({projectRoot: resolved.repositoryRoot,
        piDir: context.piDir ?? path.join(resolved.repositoryRoot, '.pi')});
    let adapterProfile = null;
    let adapterPackage = null;
    if (registration !== null) {
        const resolveProvider = context.resolveQualityProvider ?? resolveQualityProvider;
        const provider = await resolveProvider({
            repositoryRoot: resolved.repositoryRoot,
            coreRoot: resolved.coreRoot,
            protectedBase: repository.baseSha,
            registration,
            resolvePackage: context.resolvePackage,
            run: context.runGit,
            env: context.env,
        });
        const loadAdapter = context.loadAdapterProfile ?? loadAdapterProfile;
        adapterProfile = loadAdapter({registration, repositoryRoot: resolved.repositoryRoot,
            protectedBase: repository.baseSha});
        const installedProfile = loadAdapter({registration: provider.registration,
            repositoryRoot: resolved.repositoryRoot, protectedBase: repository.baseSha});
        if (adapterProfile.profileDigest !== installedProfile.profileDigest ||
            adapterProfile.policyDigest !== installedProfile.policyDigest) {
            throw new Error('installed adapter review policy mismatch');
        }
        const externalRoot = provider.registration.packageRoot;
        adapterPackage = (context.packageIdentity ?? packageIdentity)(
            externalRoot, readiness.sourceClass, provider.identity
        );
        if (check.adapter.packageName !== adapterPackage.name ||
            check.adapter.packageVersion !== adapterPackage.version ||
            check.adapter.id !== adapterPackage.providerId ||
            check.adapter.protocolVersion !== adapterPackage.protocolVersion ||
            check.adapter.sourceClass !== readiness.sourceClass ||
            !same(check.adapter.gates, provider.identity.gates)) {
            throw new Error('check adapter identity mismatch');
        }
    } else if (check.adapter !== null && check.adapter !== undefined) {
        throw new Error('active adapter is unavailable');
    }
    const corePackage = (context.packageIdentity ?? packageIdentity)(resolved.coreRoot, readiness.sourceClass);
    if (check.core.packageName !== corePackage.name || check.core.packageVersion !== corePackage.version) {
        throw new Error('check Core identity mismatch');
    }
    const snapshot = (context.createSnapshot ?? createSnapshot)({
        mode: 'branch', repositoryRoot: resolved.repositoryRoot,
        base: snapshotBase, head: repository.headSha,
        run: context.runGit, env: context.env, home: context.home,
        sensitivePaths: context.sensitivePaths,
    });
    if (snapshot.baseCommit !== snapshotBase || snapshot.headCommit !== repository.headSha) {
        throw new Error('authoritative snapshot is stale');
    }
    const plan = (context.buildReviewPlan ?? buildReviewPlan)({
        core: coreProfile,
        adapter: adapterProfile,
        changedPaths: snapshot.entries.map((entry) => ({oldPath: entry.oldPath,
            newPath: entry.newPath, kind: entry.kind, text: entry.kind === 'text'})),
    });
    const identities = planIdentities(coreProfile, adapterProfile, plan);
    const active = await (context.resolveActiveModel ?? resolveActiveModel)({
        env: context.env ?? process.env, loadSdk: context.loadSdk,
    });
    const model = active.metadata;
    const bound = {
        ...repository,
        criteriaDigest: criteria.digest,
        check,
        snapshot: {manifestDigest: snapshot.manifestDigest, diffDigest: snapshot.diffDigest},
        core: corePackage,
        adapter: adapterPackage,
        plan: {planDigest: plan.planDigest, profileDigest: identities.profileDigest,
            policyDigest: plan.policyDigest, resourceDigest: identities.resourceDigest,
            skillDigest: identities.skillDigest},
        model: {provider: model.provider, id: model.id, reasoningLevel: model.reasoningLevel,
            contextWindow: model.contextWindow},
    };
    if (operation === 'initial' && current.state === 'VALID') {
        if (reusable(current.record, bound)) {
            return {authoritative: true, reused: true, receipt: current.record};
        }
        throw new Error('review chain identity is stale');
    }
    if (operation === 'initial' && (current.state === 'LEGACY' ? !input.newInitial : current.state !== 'ABSENT')) {
        throw new Error('review chain is unavailable');
    }
    const execution = await (context.runReviewAttempt ?? runAuthoritativeAttempt)({
        command: repair === null ? 'review branch' : 'review repair',
        sourceClass: readiness.sourceClass, authoritative: true,
        criteria, snapshot, plan,
        resources: [...coreProfile.resources, ...(adapterProfile?.resources ?? [])],
        sessionSkill: coreProfile.profile.sessionSkill,
        verifierSkills: coreProfile.profile.verifierSkills,
        repositoryRoot: resolved.repositoryRoot, tempRoot: context.tempRoot,
        env: context.env ?? process.env, loadSdk: context.loadSdk,
        runSession: context.runSession, assertFresh: context.assertFresh,
        timeoutMs: context.timeoutMs, reviewTimeoutMs: context.reviewTimeoutMs, active,
        ...(repair === null ? {} : {repair}),
    });
    const report = repair === null ? execution : (execution.report ?? execution);
    const closures = repair === null ? [] : (execution.closures ?? []);
    const receipt = (context.recordReviewAttempt ?? recordReviewAttempt)({
        operation, branch: repository.branch, baseRef: repository.baseRef,
        baseSha: repository.baseSha, fromSha: snapshotBase,
        criteriaDigest: criteria.digest,
        check: {digest: check.digest, headSha: check.headSha},
        core: corePackage, adapter: adapterPackage,
        profileDigest: identities.profileDigest,
        resourceDigest: identities.resourceDigest,
        skillDigest: identities.skillDigest,
        snapshot: bound.snapshot, report, closures, newInitial: input.newInitial,
    }, {...context, projectRoot: resolved.repositoryRoot});
    const outcome = receipt?.openBlocking?.length > 0 ? 'BLOCKING' : report.outcome;
    return {authoritative: true, reused: false, outcome, receipt};
}

module.exports = {inspectAuthorityReadiness, runAuthoritativeReview};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
