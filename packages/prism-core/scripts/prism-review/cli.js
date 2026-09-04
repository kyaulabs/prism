// $KYAULabs: cli.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {digestJson} = require('./canonical-json');
const {inspectCheck, runDeterministicCheck, verifyCheck} = require('./check');
const {AUTHORITY_BASE_REFS, CRITERIA_ROLES, EXIT, LIMIT} = require('./constants');
const {criteriaDigest, inspectCriteria, recordCriteria, verifyCriteria} = require('./criteria');
const {validateClosureProposal} = require('./findings');
const {discoverOptionalAdapter} = require('../prism-tool/discovery');
const {createSnapshot} = require('./git-snapshot');
const {runReviewAttempt} = require('./orchestrator');
const {inspectReviewChainV2, verifyReviewChainV2} = require('./review-chain-v2');
const {runAuthoritativeReview} = require('./authority');
const {resolveQualityProvider} = require('./quality-provider');
const {buildReviewPlan, loadAdapterProfile, loadCoreProfile} = require('./profile');
const {safeRelativePath: validateSafeRelativePath} = require('./schema');
const {inspectIsolatedRuntime, resolveActiveModel} = require('./session-runner');
const {classifyTrustRoot} = require('./trust');

const MAX_MANIFEST_BYTES = 65536;
const utf8 = new TextDecoder('utf-8', {fatal: true});
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HELP = `usage: prism-review COMMAND

prism-review --version
prism-review --help
prism-review doctor --json
prism-review criteria record --source ROLE:COMMIT:PATH [--source ROLE:COMMIT:PATH ...] --json
prism-review criteria none --json
prism-review criteria inspect --json
prism-review check --base-ref origin/develop|origin/main --json
prism-review chain inspect --json
prism-review chain verify --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --json
prism-review review authoritative --base-ref origin/develop|origin/main --new-initial --json
prism-review review repair --base-ref origin/develop|origin/main --closures RELATIVE_PATH --json
prism-review review staged --json
prism-review review commit --commit SHA --json
prism-review review branch --base SHA --head SHA --json
prism-review review path --path RELATIVE_TRACKED_PATH --json
`;

function readBoundedDescriptor(descriptor, maximum) {
    const buffer = Buffer.allocUnsafe(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
        const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
        if (count === 0) break;
        offset += count;
    }
    return buffer.subarray(0, offset);
}

function readVersion(coreRoot) {
    const root = fs.realpathSync(coreRoot);
    const manifestPath = path.join(root, 'package.json');
    const identity = fs.lstatSync(manifestPath);
    if (identity.isSymbolicLink() || !identity.isFile() || identity.size > MAX_MANIFEST_BYTES ||
        fs.realpathSync(manifestPath) !== manifestPath) {
        throw new Error('Core package manifest is invalid');
    }
    const descriptor = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = readBoundedDescriptor(descriptor, MAX_MANIFEST_BYTES);
        const current = fs.fstatSync(descriptor);
        if (!held.isFile() || held.dev !== identity.dev || held.ino !== identity.ino ||
            contents.length !== held.size || current.dev !== held.dev || current.ino !== held.ino ||
            current.size !== held.size || contents.length > MAX_MANIFEST_BYTES) {
            throw new Error('Core package manifest changed');
        }
        const value = JSON.parse(contents.toString('utf8'));
        if (value.name !== '@kyaulabs/prism-core' || typeof value.version !== 'string') {
            throw new Error('Core package version is invalid');
        }
        return value.version;
    } finally {
        fs.closeSync(descriptor);
    }
}

function defaultRun(command, args, options) {
    return childProcess.spawnSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf8',
        maxBuffer: 65536,
        timeout: 10000,
    });
}

function repositoryRoot(context) {
    if (context.projectRoot !== undefined) return fs.realpathSync(context.projectRoot);
    const cwd = fs.realpathSync(context.cwd ?? process.cwd());
    const result = (context.run ?? defaultRun)('git', ['rev-parse', '--show-toplevel'], {cwd});
    if (result.error || result.status !== 0) throw new Error('repository is unavailable');
    return fs.realpathSync(String(result.stdout).trim());
}

function writeJson(stream, value) {
    stream.write(`${JSON.stringify(value)}\n`);
}

function doctorRepositoryIdentity(context, projectRoot) {
    if (context.resolveDoctorIdentity !== undefined) return context.resolveDoctorIdentity();
    const result = (context.run ?? defaultRun)('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        cwd: projectRoot,
    });
    const branch = String(result.stdout ?? '').trim();
    if (result.error || result.status !== 0 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
        throw new Error('doctor repository identity is unavailable');
    }
    const target = branch.startsWith('release/') || branch.startsWith('hotfix/') ? 'main' : 'develop';
    return bridgeRepositoryIdentity(`origin/${target}`, context, projectRoot);
}

function profileReadiness(context, coreRoot, projectRoot) {
    const profilePresent = context.coreProfilePresent ??
        fs.existsSync(path.join(coreRoot, 'config', 'prism-review.json'));
    if (!profilePresent) return null;
    const core = (context.loadCoreProfile ?? loadCoreProfile)({packageRoot: coreRoot});
    const registration = (context.discoverOptionalAdapter ?? discoverOptionalAdapter)({
        projectRoot,
        piDir: context.piDir ?? path.join(projectRoot, '.pi'),
    });
    const profile = {
        core: {profileDigest: core.profileDigest, policyDigest: core.policyDigest},
        adapter: null,
    };
    if (registration?.reviewPath === null || registration?.reviewPath === undefined) {
        return {profile, adapter: null};
    }
    const identity = doctorRepositoryIdentity(context, projectRoot);
    const resolveProvider = context.resolveQualityProvider ?? resolveQualityProvider;
    const provider = resolveProvider({
        repositoryRoot: projectRoot,
        coreRoot,
        protectedBase: identity.baseSha,
        registration,
        resolvePackage: context.resolvePackage,
        run: context.runGit,
        env: context.env,
    });
    const loadAdapter = context.loadAdapterProfile ?? loadAdapterProfile;
    const adapter = loadAdapter({registration, repositoryRoot: projectRoot, protectedBase: identity.baseSha});
    const installed = loadAdapter({registration: provider.registration,
        repositoryRoot: projectRoot, protectedBase: identity.baseSha});
    if (adapter.profileDigest !== installed.profileDigest || adapter.policyDigest !== installed.policyDigest) {
        throw new Error('doctor adapter policy is mismatched');
    }
    profile.adapter = {profileDigest: adapter.profileDigest, policyDigest: adapter.policyDigest};
    return {
        profile,
        adapter: {
            protected: {
                packageName: provider.identity.packageName,
                packageVersion: provider.identity.packageVersion,
                profileDigest: adapter.profileDigest,
                policyDigest: adapter.policyDigest,
            },
            provider: {
                id: provider.identity.id,
                packageName: provider.identity.packageName,
                packageVersion: provider.identity.packageVersion,
                protocolVersion: provider.identity.protocolVersion,
                sourceClass: provider.identity.sourceClass,
            },
        },
    };
}

function safeRelativePath(value) {
    return typeof value === 'string' && value !== '' && !/[\\\x00-\x1f\x7f]/.test(value) &&
        !path.posix.isAbsolute(value) && value !== '.' && value !== '..' &&
        !value.startsWith('../') && path.posix.normalize(value) === value;
}

function isInside(root, candidate) {
    const relative = path.relative(fs.realpathSync(root), fs.realpathSync(candidate));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function snapshotOptions(review, projectRoot) {
    const options = {repositoryRoot: projectRoot, mode: review.command.slice('review '.length)};
    if (review.commit !== undefined) options.commit = review.commit;
    if (review.base !== undefined) options.base = review.base;
    if (review.head !== undefined) options.head = review.head;
    if (review.path !== undefined) options.path = review.path;
    return options;
}

function changedPaths(snapshot) {
    return snapshot.entries.map((entry) => ({
        oldPath: entry.oldPath,
        newPath: entry.newPath,
        kind: entry.kind,
        text: entry.kind === 'text',
    }));
}

async function executeReview(review, context, coreRoot, projectRoot, trust) {
    const snapshot = (context.createSnapshot ?? createSnapshot)(snapshotOptions(review, projectRoot));
    const core = (context.loadCoreProfile ?? loadCoreProfile)({packageRoot: coreRoot});
    const registration = (context.discoverOptionalAdapter ?? discoverOptionalAdapter)({
        projectRoot,
        piDir: context.piDir ?? path.join(projectRoot, '.pi'),
    });
    let adapter = null;
    if (registration?.reviewPath !== null && registration?.reviewPath !== undefined) {
        const protectedBase = snapshot.mode === 'path' ? snapshot.headCommit : snapshot.baseCommit;
        if ((protectedBase === null || protectedBase === undefined) &&
            isInside(projectRoot, registration.packageRoot)) {
            throw new Error('protected adapter base is unavailable');
        }
        adapter = (context.loadAdapterProfile ?? loadAdapterProfile)({
            registration,
            repositoryRoot: projectRoot,
            ...(protectedBase === null || protectedBase === undefined ? {} : {protectedBase}),
        });
    }
    const plan = (context.buildReviewPlan ?? buildReviewPlan)({
        core,
        adapter,
        changedPaths: changedPaths(snapshot),
    });
    const active = await (context.resolveActiveModel ?? resolveActiveModel)({
        env: context.env ?? process.env,
        loadSdk: context.loadSdk,
    });
    return (context.runReviewAttempt ?? runReviewAttempt)({
        command: review.command,
        sourceClass: trust.sourceClass,
        snapshot,
        plan,
        resources: [...core.resources, ...(adapter?.resources ?? [])],
        sessionSkill: core.profile.sessionSkill,
        verifierSkills: core.profile.verifierSkills,
        repositoryRoot: projectRoot,
        tempRoot: context.tempRoot,
        env: context.env ?? process.env,
        loadSdk: context.loadSdk,
        runSession: context.runSession,
        assertFresh: context.assertFresh,
        timeoutMs: context.timeoutMs,
        reviewTimeoutMs: context.reviewTimeoutMs,
        active,
    });
}

function parseCriteriaSource(value) {
    if (typeof value !== 'string') return null;
    const first = value.indexOf(':');
    const second = value.indexOf(':', first + 1);
    if (first < 1 || second < first + 2) return null;
    const role = value.slice(0, first);
    const commit = value.slice(first + 1, second);
    const sourcePath = value.slice(second + 1);
    if (!CRITERIA_ROLES.includes(role) || !SHA.test(commit)) return null;
    try {
        validateSafeRelativePath(sourcePath, 'criteria source path');
    } catch {
        return null;
    }
    return {role, commit, path: sourcePath};
}

function parseBridge(argv) {
    if (argv.length === 3 && argv[0] === 'criteria' && argv[1] === 'inspect' && argv[2] === '--json') {
        return {command: 'criteria inspect', operation: 'criteria-inspect'};
    }
    if (argv.length >= 5 && argv.length <= 35 && argv[0] === 'criteria' &&
        argv[1] === 'record' && argv.at(-1) === '--json' && argv.length % 2 === 1) {
        const sources = [];
        for (let index = 2; index < argv.length - 1; index += 2) {
            if (argv[index] !== '--source') return null;
            const source = parseCriteriaSource(argv[index + 1]);
            if (source === null) return null;
            sources.push(source);
        }
        if (new Set(sources.map(({path: sourcePath}) => sourcePath)).size !== sources.length) return null;
        return {command: 'criteria record', operation: 'criteria-record', sources};
    }
    if (argv.length === 3 && argv[0] === 'criteria' && argv[1] === 'none' && argv[2] === '--json') {
        return {command: 'criteria none', operation: 'criteria-none'};
    }
    if (argv.length === 4 && argv[0] === 'check' && argv[1] === '--base-ref' &&
        AUTHORITY_BASE_REFS.includes(argv[2]) && argv[3] === '--json') {
        return {command: 'check', operation: 'check', baseRef: argv[2]};
    }
    if (argv.length === 3 && argv[0] === 'chain' && argv[1] === 'inspect' && argv[2] === '--json') {
        return {command: 'chain inspect', operation: 'chain-inspect'};
    }
    if (argv.length === 5 && argv[0] === 'chain' && argv[1] === 'verify' &&
        argv[2] === '--base-ref' && AUTHORITY_BASE_REFS.includes(argv[3]) && argv[4] === '--json') {
        return {command: 'chain verify', operation: 'chain-verify', baseRef: argv[3]};
    }
    if ((argv.length === 5 || argv.length === 6) && argv[0] === 'review' &&
        argv[1] === 'authoritative' && argv[2] === '--base-ref' &&
        AUTHORITY_BASE_REFS.includes(argv[3]) && argv.at(-1) === '--json' &&
        (argv.length === 5 || argv[4] === '--new-initial')) {
        return {command: 'review authoritative', operation: 'review-initial',
            baseRef: argv[3], newInitial: argv.length === 6};
    }
    if (argv.length === 7 && argv[0] === 'review' && argv[1] === 'repair' &&
        argv[2] === '--base-ref' && AUTHORITY_BASE_REFS.includes(argv[3]) &&
        argv[4] === '--closures' && argv[6] === '--json') {
        try {
            validateSafeRelativePath(argv[5], 'closure path');
        } catch {
            return null;
        }
        return {command: 'review repair', operation: 'review-repair',
            baseRef: argv[3], closuresPath: argv[5]};
    }
    return null;
}

function readRepositoryJson(projectRoot, relativePath) {
    validateSafeRelativePath(relativePath, 'bridge input path');
    if (typeof fs.constants.O_NOFOLLOW !== 'number' || typeof fs.constants.O_DIRECTORY !== 'number') {
        throw new Error('no-follow reads are unavailable');
    }
    const descriptors = [];
    try {
        let descriptor = fs.openSync(projectRoot,
            fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        descriptors.push(descriptor);
        const parts = relativePath.split('/');
        for (const part of parts.slice(0, -1)) {
            descriptor = fs.openSync(`/proc/self/fd/${descriptor}/${part}`,
                fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
            descriptors.push(descriptor);
        }
        const file = fs.openSync(`/proc/self/fd/${descriptor}/${parts.at(-1)}`,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        descriptors.push(file);
        const before = fs.fstatSync(file);
        if (!before.isFile() || before.size < 1 || before.size > LIMIT.INPUT_BYTES) {
            throw new Error('bridge input is invalid');
        }
        const bytes = readBoundedDescriptor(file, LIMIT.INPUT_BYTES);
        const after = fs.fstatSync(file);
        if (bytes.length !== before.size || after.dev !== before.dev || after.ino !== before.ino ||
            after.size !== before.size) throw new Error('bridge input changed');
        return JSON.parse(utf8.decode(bytes));
    } finally {
        for (const descriptor of descriptors.reverse()) fs.closeSync(descriptor);
    }
}

function bridgeRepositoryIdentity(baseRef, context, projectRoot) {
    if (context.resolveBridgeIdentity !== undefined) return context.resolveBridgeIdentity(baseRef);
    const text = (args) => {
        const result = (context.run ?? defaultRun)('git', args, {cwd: projectRoot});
        const value = String(result.stdout ?? '').trim();
        if (result.error || result.status !== 0 || value === '' || /[\x00-\x1f\x7f]/.test(value)) {
            throw new Error('bridge Git evidence is unavailable');
        }
        return value;
    };
    const branch = text(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const baseSha = text(['rev-parse', '--verify', `${baseRef}^{commit}`]);
    const headSha = text(['rev-parse', '--verify', 'HEAD^{commit}']);
    if (!SHA.test(baseSha) || !SHA.test(headSha)) throw new Error('bridge identity is invalid');
    return {branch, baseRef, baseSha, headSha};
}

function requiresAuthority(operation) {
    return ['criteria-record', 'criteria-none', 'check', 'review-initial', 'review-repair'].includes(operation);
}

function bridgeResult(command, trust, overrides = {}) {
    return {
        schemaVersion: 1,
        command,
        status: overrides.status ?? 'PASS',
        outcome: overrides.outcome ?? 'PASS',
        eligibleForAuthority: trust.eligibleForAuthority,
        sourceClass: trust.sourceClass,
        state: overrides.state ?? 'ABSENT',
        version: overrides.version ?? null,
        receiptDigest: overrides.receiptDigest ?? null,
        reason: overrides.reason ?? null,
    };
}

async function executeBridge(bridge, context, projectRoot, trust) {
    if (bridge.operation === 'criteria-inspect') {
        const inspected = (context.inspectCriteria ?? inspectCriteria)({...context, projectRoot});
        const valid = inspected.state === 'VALID';
        return bridgeResult(bridge.command, trust, {
            state: inspected.state,
            version: valid ? 1 : null,
            receiptDigest: valid ? criteriaDigest(inspected.record) : null,
        });
    }
    if (bridge.operation === 'chain-inspect') {
        const inspected = (context.inspectReviewChainV2 ?? inspectReviewChainV2)(
            {...context, projectRoot}
        );
        const valid = inspected.state === 'VALID';
        const legacy = inspected.state === 'LEGACY';
        return bridgeResult(bridge.command, trust, {
            state: inspected.state,
            version: valid ? 2 : legacy ? 1 : null,
            receiptDigest: valid || legacy ? digestJson(inspected.record) : null,
        });
    }
    if (bridge.operation === 'chain-verify') {
        const identity = bridgeRepositoryIdentity(bridge.baseRef, context, projectRoot);
        const criteria = (context.verifyCriteria ?? verifyCriteria)({branch: identity.branch},
            {...context, projectRoot});
        const check = (context.verifyCheck ?? verifyCheck)(identity,
            {...context, projectRoot});
        const verified = (context.verifyReviewChainV2 ?? verifyReviewChainV2)({
            ...identity, criteriaDigest: criteria.digest, checkDigest: check.digest,
        }, {...context, projectRoot});
        return bridgeResult(bridge.command, trust, {
            state: 'VALID', version: 2, receiptDigest: digestJson(verified.record),
        });
    }
    if (!trust.eligibleForAuthority) throw new Error('installed Core authority is required');
    const record = context.recordCriteria ?? recordCriteria;
    if (bridge.operation === 'criteria-record') {
        const receipt = record({disposition: 'DECLARED', sources: bridge.sources},
            {...context, projectRoot});
        if (!/^[0-9a-f]{64}$/.test(receipt?.digest ?? '')) {
            throw new Error('criteria receipt is invalid');
        }
        return bridgeResult(bridge.command, trust, {
            state: 'VALID', version: 1, receiptDigest: receipt.digest,
        });
    }
    if (bridge.operation === 'criteria-none') {
        const receipt = record({disposition: 'NONE_DECLARED', sources: []}, {...context, projectRoot});
        if (!/^[0-9a-f]{64}$/.test(receipt?.digest ?? '')) throw new Error('criteria receipt is invalid');
        return bridgeResult(bridge.command, trust, {
            state: 'VALID', version: 1, receiptDigest: receipt.digest,
        });
    }
    if (bridge.operation === 'check') {
        const registration = (context.discoverOptionalAdapter ?? discoverOptionalAdapter)({
            projectRoot,
            piDir: context.piDir ?? path.join(projectRoot, '.pi'),
        });
        const receipt = await (context.runDeterministicCheck ?? runDeterministicCheck)(
            {baseRef: bridge.baseRef}, {...context, projectRoot, registration, sourceClass: trust.sourceClass}
        );
        if (!/^[0-9a-f]{64}$/.test(receipt?.digest ?? '') || !['PASS', 'FAIL'].includes(receipt.status)) {
            throw new Error('check receipt is invalid');
        }
        return bridgeResult(bridge.command, trust, {
            status: receipt.status,
            outcome: receipt.status === 'PASS' ? 'PASS' : 'INCONCLUSIVE',
            state: 'VALID', version: 1, receiptDigest: receipt.digest,
        });
    }
    if (bridge.operation === 'review-initial' || bridge.operation === 'review-repair') {
        const closures = bridge.operation === 'review-repair'
            ? validateClosureProposal(readRepositoryJson(projectRoot, bridge.closuresPath))
            : undefined;
        const result = await (context.runAuthoritativeReview ?? runAuthoritativeReview)({
            operation: bridge.operation === 'review-repair' ? 'repair' : 'initial',
            baseRef: bridge.baseRef,
            newInitial: bridge.newInitial ?? false,
            ...(closures === undefined ? {} : {closures}),
        }, {...context, projectRoot});
        const receipt = result.receipt;
        const valid = receipt?.schemaVersion === 2;
        const outcome = result.outcome ?? (result.reused ? 'PASS' : 'INCONCLUSIVE');
        return bridgeResult(bridge.command, trust, {
            status: outcome === 'PASS' ? 'PASS' : outcome === 'BLOCKING' ? 'BLOCKING' : 'NO-GO',
            outcome,
            state: valid ? 'VALID' : 'ABSENT',
            version: valid ? 2 : null,
            receiptDigest: valid ? digestJson(receipt) : null,
        });
    }
    throw new Error('bridge command is unavailable');
}

function parseReview(argv) {
    if (argv.length === 3 && argv[0] === 'review' && argv[1] === 'staged' &&
        argv[2] === '--json') {
        return {command: 'review staged'};
    }
    if (argv.length === 5 && argv[0] === 'review' && argv[1] === 'commit' &&
        argv[2] === '--commit' && SHA.test(argv[3]) && argv[4] === '--json') {
        return {command: 'review commit', commit: argv[3]};
    }
    if (argv.length === 7 && argv[0] === 'review' && argv[1] === 'branch' &&
        argv[2] === '--base' && SHA.test(argv[3]) && argv[4] === '--head' &&
        SHA.test(argv[5]) && argv[6] === '--json') {
        return {command: 'review branch', base: argv[3], head: argv[5]};
    }
    if (argv.length === 5 && argv[0] === 'review' && argv[1] === 'path' &&
        argv[2] === '--path' && safeRelativePath(argv[3]) && argv[4] === '--json') {
        return {command: 'review path', path: argv[3]};
    }
    return null;
}

async function main(argv, context = {}) {
    const stdout = context.stdout ?? process.stdout;
    const stderr = context.stderr ?? process.stderr;
    if (argv.length === 1 && argv[0] === '--version') {
        try {
            stdout.write(`${readVersion(context.coreRoot ?? path.resolve(__dirname, '../..'))}\n`);
            return EXIT.OK;
        } catch {
            stderr.write('prism-review: runtime readiness failed\n');
            return EXIT.READINESS;
        }
    }
    if (argv.length === 1 && argv[0] === '--help') {
        stdout.write(HELP);
        return EXIT.OK;
    }
    if (argv.length === 2 && argv[0] === 'doctor' && argv[1] === '--json') {
        try {
            const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
            const projectRoot = repositoryRoot(context);
            const trust = (context.classifyTrustRoot ?? classifyTrustRoot)(coreRoot, projectRoot);
            if (!trust.eligibleForAuthority) throw new Error('authority trust root is unavailable');
            const model = await (context.inspectIsolatedRuntime ?? inspectIsolatedRuntime)({
                repositoryRoot: projectRoot,
                env: context.env ?? process.env,
                loadSdk: context.loadSdk,
                tempRoot: context.tempRoot,
                removeTemp: context.removeTemp,
            });
            const readiness = profileReadiness(context, coreRoot, projectRoot);
            if (readiness === null) throw new Error('Core review profile is unavailable');
            const {profile} = readiness;
            const criteria = (context.inspectCriteria ?? inspectCriteria)({...context, projectRoot});
            const check = (context.inspectCheck ?? inspectCheck)({...context, projectRoot});
            if (!['ABSENT', 'VALID'].includes(criteria.state) ||
                !['ABSENT', 'VALID'].includes(check.state)) {
                throw new Error('authority receipt state is unsafe');
            }
            const authority = {
                core: {
                    packageName: '@kyaulabs/prism-core',
                    packageVersion: readVersion(coreRoot),
                    profileDigest: profile.core.profileDigest,
                    policyDigest: profile.core.policyDigest,
                    sourceClass: trust.sourceClass,
                },
                adapter: readiness.adapter,
                criteriaState: criteria.state,
                checkState: check.state,
            };
            const checks = [
                {id: 'authority-trust-root', status: 'PASS', message: 'installed Core authority validated'},
                {id: 'active-model', status: 'PASS', message: 'active Pi model resolved exactly'},
                {id: 'sdk-isolation', status: 'PASS', message: 'isolated Pi resources validated'},
                {id: 'review-profile', status: 'PASS', message: 'closed review profile validated'},
                {id: 'criteria-state', status: criteria.state, message: 'criteria receipt state inspected'},
                {id: 'check-state', status: check.state, message: 'check receipt state inspected'},
                {id: 'adapter-quality-provider', status: profile.adapter === null ? 'SKIPPED' : 'PASS',
                    message: profile.adapter === null ? 'no active adapter' : 'adapter provider validated'},
            ];
            writeJson(stdout, {
                schemaVersion: 1,
                command: 'doctor',
                status: 'GO',
                sourceClass: trust.sourceClass,
                eligibleForAuthority: trust.eligibleForAuthority,
                model,
                profile,
                authority,
                checks,
            });
            return EXIT.OK;
        } catch {
            writeJson(stdout, {
                schemaVersion: 1,
                command: 'doctor',
                status: 'NO-GO',
                reason: 'RUNTIME_READINESS_FAILED',
            });
            return EXIT.READINESS;
        }
    }
    const bridge = parseBridge(argv);
    if (bridge !== null) {
        let trust = null;
        try {
            const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
            const projectRoot = repositoryRoot(context);
            trust = (context.classifyTrustRoot ?? classifyTrustRoot)(coreRoot, projectRoot);
            const report = await executeBridge(bridge, context, projectRoot, trust);
            writeJson(stdout, report);
            return report.outcome === 'PASS' ? EXIT.OK : EXIT.REVIEW;
        } catch {
            writeJson(stdout, {
                schemaVersion: 1,
                command: bridge.command,
                status: 'NO-GO',
                outcome: 'INCONCLUSIVE',
                eligibleForAuthority: trust?.eligibleForAuthority ?? false,
                sourceClass: trust?.sourceClass ?? 'UNKNOWN',
                state: 'UNSAFE',
                version: null,
                receiptDigest: null,
                reason: trust !== null && !trust.eligibleForAuthority && requiresAuthority(bridge.operation)
                    ? 'AUTHORITY_INELIGIBLE'
                    : 'RUNTIME_READINESS_FAILED',
            });
            return EXIT.READINESS;
        }
    }
    const review = parseReview(argv);
    if (review !== null) {
        try {
            const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
            const projectRoot = repositoryRoot(context);
            const trust = classifyTrustRoot(coreRoot, projectRoot);
            const report = await executeReview(review, context, coreRoot, projectRoot, trust);
            writeJson(stdout, report);
            return report.outcome === 'PASS' ? EXIT.OK : EXIT.REVIEW;
        } catch {
            writeJson(stdout, {
                schemaVersion: 1,
                command: review.command,
                authoritative: false,
                status: 'NO-GO',
                outcome: 'INCONCLUSIVE',
                reason: 'RUNTIME_READINESS_FAILED',
            });
            return EXIT.READINESS;
        }
    }
    stderr.write('prism-review: invalid arguments\n');
    return EXIT.USAGE;
}

module.exports = {main};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
