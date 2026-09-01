// $KYAULabs: automation.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    renderCoreAutomationProvider,
    renderCoreReleaseProvider,
} = require('./automation-providers');
const {discoverAutomationAdapter} = require('./discovery');
const {runBounded} = require('./process');

const MAX_OUTPUT_BYTES = 1048576;
const OPERATION_MARKER = '.prism-automation.json';
const OPERATION_MARKER_CONTENT = `${JSON.stringify({
    schemaVersion: 1,
    managedBy: '@kyaulabs/prism-core',
}, null, 2)}\n`;
const KNOWN_CANDIDATE_OUTPUTS = new Set([
    '.github/scripts/check-php.sh',
    '.github/scripts/coverage-gate.php',
    '.github/workflows/back-merge.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/release.yml',
    'CHANGELOG.md',
    'cliff.toml',
]);
const OWNERSHIP = Object.freeze({
    CREATE: 'CREATE',
    CURRENT: 'CURRENT',
    MIGRATE: 'MIGRATE',
    CONFLICT: 'CONFLICT',
});

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function readExistingOutput(projectRoot, relativePath) {
    let current = projectRoot;
    for (const segment of relativePath.split('/').slice(0, -1)) {
        current = path.join(current, segment);
        const parent = fs.lstatSync(current, {throwIfNoEntry: false});
        if (parent === undefined) return null;
        if (parent.isSymbolicLink() || !parent.isDirectory()) {
            throw new Error('automation output parent is invalid');
        }
    }
    const filePath = path.join(projectRoot, ...relativePath.split('/'));
    const initial = fs.lstatSync(filePath, {throwIfNoEntry: false});
    if (initial === undefined) return null;
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        initial.size > MAX_OUTPUT_BYTES ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('automation output is invalid');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const currentFile = fs.lstatSync(filePath);
        if (
            !held.isFile() ||
            !sameFile(initial, held) ||
            !sameFile(held, currentFile) ||
            contents.length !== held.size
        ) {
            throw new Error('automation output changed');
        }
        return Object.freeze({contents, mode: held.mode & 0o777});
    } finally {
        fs.closeSync(descriptor);
    }
}

function managedBy(contents, owner) {
    const lines = contents.toString('utf8').split('\n');
    return lines.includes(`# prism-managed: ${owner}`) && (
        ['0', '1'].some((schema) => lines.includes(`# prism-automation-schema: ${schema}`)) ||
        ['2', '3'].some((schema) => lines.includes(`# prism-release-schema: ${schema}`))
    );
}

function classifyOutput({projectRoot, output, owner}) {
    let existing;
    try {
        existing = readExistingOutput(projectRoot, output.path);
    } catch {
        return Object.freeze({
            path: output.path,
            disposition: OWNERSHIP.CONFLICT,
            owner: null,
        });
    }
    if (existing === null) {
        return Object.freeze({
            path: output.path,
            disposition: OWNERSHIP.CREATE,
            owner,
        });
    }
    const canonical = fs.readFileSync(output.candidatePath);
    if (existing.mode === output.mode && existing.contents.equals(canonical)) {
        return Object.freeze({
            path: output.path,
            disposition: OWNERSHIP.CURRENT,
            owner,
        });
    }
    if (managedBy(existing.contents, owner)) {
        return Object.freeze({
            path: output.path,
            disposition: OWNERSHIP.MIGRATE,
            owner,
        });
    }
    return Object.freeze({
        path: output.path,
        disposition: OWNERSHIP.CONFLICT,
        owner: null,
    });
}

function providerReport(report, projectRoot) {
    const owner = report.provider.packageName;
    return Object.freeze({
        id: report.provider.id,
        packageName: report.provider.packageName,
        packageVersion: report.provider.packageVersion,
        protocolVersion: report.provider.protocolVersion,
        outputs: Object.freeze(report.outputs.map((output) =>
            classifyOutput({projectRoot, output, owner})
        )),
    });
}

function hasOverlap(providers) {
    const paths = providers.flatMap(({outputs}) => outputs.map(({path: outputPath}) => outputPath))
        .sort();
    for (let index = 1; index < paths.length; index += 1) {
        if (
            paths[index] === paths[index - 1] ||
            paths[index].startsWith(`${paths[index - 1]}/`) ||
            paths[index - 1].startsWith(`${paths[index]}/`)
        ) return true;
    }
    return false;
}

function overallDisposition(providers) {
    const values = providers.flatMap(({outputs}) => outputs.map(({disposition}) => disposition));
    for (const disposition of [
        OWNERSHIP.CONFLICT,
        OWNERSHIP.MIGRATE,
        OWNERSHIP.CREATE,
        OWNERSHIP.CURRENT,
    ]) {
        if (values.includes(disposition)) return disposition;
    }
    return OWNERSHIP.CONFLICT;
}

function renderCanonicalProviders({projectRoot, coreRoot, candidateRoot, releaseRepository = null}) {
    const core = renderCoreAutomationProvider({coreRoot, candidateRoot});
    const adapter = discoverAutomationAdapter({projectRoot});
    const quality = adapter.handler.prepareAutomation({
        candidateRoot,
        contract: adapter.registration.contract,
    });
    if (quality?.status !== 'GO') throw new Error('adapter automation provider failed');
    const reports = [core, quality];
    if (releaseRepository !== null) {
        reports.push(renderCoreReleaseProvider({
            coreRoot,
            candidateRoot,
            repository: releaseRepository,
        }));
    }
    return Object.freeze(reports);
}

function renderProviders({projectRoot, coreRoot, releaseRepository = null}) {
    const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-automation-inspect-'));
    fs.chmodSync(candidateRoot, 0o700);
    try {
        return Object.freeze(renderCanonicalProviders({
            projectRoot,
            coreRoot,
            candidateRoot,
            releaseRepository,
        }).map((report) => providerReport(report, projectRoot)));
    } finally {
        fs.rmSync(candidateRoot, {recursive: true, force: true});
    }
}

function inspectAutomation({projectRoot: requestedRoot, coreRoot, releaseRepository = null}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const providers = renderProviders({
        projectRoot,
        coreRoot: fs.realpathSync(coreRoot),
        releaseRepository,
    });
    const overlap = hasOverlap(providers);
    const disposition = overlap ? OWNERSHIP.CONFLICT : overallDisposition(providers);
    const status = disposition === OWNERSHIP.CONFLICT ? 'NO-GO' : 'GO';
    return Object.freeze({
        status,
        disposition,
        providers,
        checks: Object.freeze([Object.freeze({
            id: 'automation-ownership',
            status: status === 'GO' ? 'PASS' : 'FAIL',
            message: status === 'GO'
                ? 'automation output ownership is compatible'
                : 'automation output ownership conflicts',
        })]),
    });
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function gitSnapshot(projectRoot, run = runBounded) {
    const invoke = (args) => {
        const result = run('git', args, {cwd: projectRoot});
        if (result?.error || result?.status !== 0) {
            throw new Error('automation Git precondition is unavailable');
        }
        return String(result.stdout).trim();
    };
    return Object.freeze({
        head: invoke(['rev-parse', '--verify', 'HEAD']),
        indexTree: invoke(['write-tree']),
        worktree: invoke(['status', '--porcelain=v2', '--untracked-files=all']),
    });
}

function ensureDirectory(directory, mode = 0o700) {
    const existing = fs.lstatSync(directory, {throwIfNoEntry: false});
    if (existing === undefined) fs.mkdirSync(directory, {mode});
    const current = fs.lstatSync(directory);
    if (current.isSymbolicLink() || !current.isDirectory()) {
        throw new Error('automation operation directory is invalid');
    }
}

function operationPaths(projectRoot) {
    const prismRoot = path.join(projectRoot, '.pi', 'prism-tool');
    const operationRoot = path.join(prismRoot, 'automation');
    return Object.freeze({
        prismRoot,
        operationRoot,
        candidateRoot: path.join(operationRoot, 'candidate'),
        lockPath: path.join(projectRoot, '.pi', 'prism-tool', 'automation.lock'),
    });
}

function validateOwnedOperation(paths) {
    const markerPath = path.join(paths.operationRoot, OPERATION_MARKER);
    const marker = fs.lstatSync(markerPath, {throwIfNoEntry: false});
    if (
        marker === undefined ||
        marker.isSymbolicLink() ||
        !marker.isFile() ||
        (marker.mode & 0o777) !== 0o600 ||
        fs.readFileSync(markerPath, 'utf8') !== OPERATION_MARKER_CONTENT
    ) {
        throw new Error('automation operation state is unowned');
    }
    function walk(current, relative = '') {
        for (const name of fs.readdirSync(current)) {
            const absolute = path.join(current, name);
            const child = relative === '' ? name : `${relative}/${name}`;
            const stat = fs.lstatSync(absolute);
            if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
                throw new Error('automation operation state is invalid');
            }
            if (stat.isDirectory()) {
                if (child !== 'candidate' && ![...KNOWN_CANDIDATE_OUTPUTS].some((output) =>
                    output.startsWith(`${child.slice('candidate/'.length)}/`) ||
                    child === `candidate/${output.split('/')[0]}`
                )) {
                    throw new Error('automation operation state is invalid');
                }
                walk(absolute, child);
                continue;
            }
            if (child === OPERATION_MARKER) continue;
            if (/^plan-[0-9a-f]{64}[.]json$/.test(child)) continue;
            if (
                child.startsWith('candidate/') &&
                KNOWN_CANDIDATE_OUTPUTS.has(child.slice('candidate/'.length))
            ) continue;
            throw new Error('automation operation state is invalid');
        }
    }
    walk(paths.operationRoot);
    const planFiles = fs.readdirSync(paths.operationRoot).filter((name) =>
        /^plan-[0-9a-f]{64}[.]json$/.test(name)
    );
    if (planFiles.length !== 1) throw new Error('automation operation state is invalid');
}

function resetOperation(paths) {
    ensureDirectory(path.dirname(paths.prismRoot));
    ensureDirectory(paths.prismRoot);
    const existing = fs.lstatSync(paths.operationRoot, {throwIfNoEntry: false});
    if (existing !== undefined) {
        if (existing.isSymbolicLink() || !existing.isDirectory()) {
            throw new Error('automation operation state is invalid');
        }
        if (fs.lstatSync(paths.lockPath, {throwIfNoEntry: false}) !== undefined) {
            throw new Error('automation operation is locked');
        }
        validateOwnedOperation(paths);
        fs.rmSync(paths.operationRoot, {recursive: true});
    }
    fs.mkdirSync(paths.operationRoot, {mode: 0o700});
    fs.writeFileSync(
        path.join(paths.operationRoot, OPERATION_MARKER),
        OPERATION_MARKER_CONTENT,
        {flag: 'wx', mode: 0o600}
    );
    fs.mkdirSync(paths.candidateRoot, {mode: 0o700});
}

function semanticProviders(reports) {
    return Object.freeze(reports.map((report) => Object.freeze({
        id: report.provider.id,
        packageName: report.provider.packageName,
        packageVersion: report.provider.packageVersion,
        protocolVersion: report.provider.protocolVersion,
        digest: sha256(Buffer.from(JSON.stringify({
            provider: report.provider,
            outputs: report.outputs.map(({path: outputPath, mode, sha256: digest}) => ({
                path: outputPath,
                mode,
                sha256: digest,
            })),
        }))),
    })));
}

function planAutomation({
    projectRoot: requestedRoot,
    coreRoot,
    releaseRepository = null,
    run = runBounded,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const canonicalCore = fs.realpathSync(coreRoot);
    const paths = operationPaths(projectRoot);
    resetOperation(paths);
    try {
        const reports = renderCanonicalProviders({
            projectRoot,
            coreRoot: canonicalCore,
            candidateRoot: paths.candidateRoot,
            releaseRepository,
        });
        const classified = reports.map((report) => providerReport(report, projectRoot));
        if (hasOverlap(classified) || overallDisposition(classified) === OWNERSHIP.CONFLICT) {
            throw new Error('automation ownership conflicts');
        }
        const providers = semanticProviders(reports);
        const providerById = new Map(providers.map((provider) => [provider.id, provider]));
        const outputs = reports.flatMap((report) => report.outputs.map((output) => {
            const provider = providerById.get(report.provider.id);
            const ownership = classified.find(({id}) => id === report.provider.id)
                .outputs.find(({path: outputPath}) => outputPath === output.path);
            return Object.freeze({
                path: output.path,
                mode: output.mode,
                sha256: output.sha256,
                provider: provider.id,
                owner: provider.packageName,
                disposition: ownership.disposition,
                candidatePath: path.posix.join('candidate', output.path),
            });
        })).sort((left, right) => left.path.localeCompare(right.path));
        const plan = Object.freeze({
            schemaVersion: 1,
            projectRoot,
            configuration: Object.freeze({releaseRepository}),
            providers,
            outputs: Object.freeze(outputs),
            preconditions: gitSnapshot(projectRoot, run),
        });
        const planDigest = sha256(Buffer.from(JSON.stringify(plan)));
        const planPath = path.join(paths.operationRoot, `plan-${planDigest}.json`);
        fs.writeFileSync(planPath, `${JSON.stringify({
            schemaVersion: 1,
            planDigest,
            plan,
        }, null, 2)}\n`, {flag: 'wx', mode: 0o600});
        fs.chmodSync(planPath, 0o600);
        return Object.freeze({
            status: 'GO',
            disposition: 'PLAN_READY',
            planPath,
            planDigest,
            providers: classified,
            checks: Object.freeze([Object.freeze({
                id: 'automation-plan',
                status: 'PASS',
                message: 'automation plan is ready',
            })]),
        });
    } catch (error) {
        fs.rmSync(paths.operationRoot, {recursive: true, force: true});
        throw error;
    }
}

function hasExactKeys(value, expected) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validOutputPath(value) {
    return typeof value === 'string' &&
        value.length > 0 &&
        !value.includes('\\') &&
        !path.posix.isAbsolute(value) &&
        path.posix.normalize(value) === value &&
        !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') &&
        value !== '.git' &&
        !value.startsWith('.git/') &&
        value !== '.pi' &&
        !value.startsWith('.pi/');
}

function validateRetainedPlan(plan) {
    if (
        !hasExactKeys(plan, [
            'schemaVersion', 'projectRoot', 'configuration', 'providers', 'outputs',
            'preconditions',
        ]) ||
        plan.schemaVersion !== 1 ||
        !hasExactKeys(plan.configuration, ['releaseRepository']) ||
        (plan.configuration.releaseRepository !== null &&
            (typeof plan.configuration.releaseRepository !== 'string' ||
             !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/.test(
                 plan.configuration.releaseRepository
             ) ||
             plan.configuration.releaseRepository.endsWith('.git'))) ||
        !Array.isArray(plan.providers) ||
        plan.providers.length < 1 ||
        plan.providers.some((provider) =>
            !hasExactKeys(provider, [
                'id', 'packageName', 'packageVersion', 'protocolVersion', 'digest',
            ]) ||
            !['id', 'packageName', 'packageVersion'].every((key) =>
                typeof provider[key] === 'string' && provider[key].length > 0
            ) ||
            !Number.isSafeInteger(provider.protocolVersion) ||
            provider.protocolVersion < 1 ||
            !/^[0-9a-f]{64}$/.test(provider.digest)
        ) ||
        !Array.isArray(plan.outputs) ||
        plan.outputs.length < 1 ||
        plan.outputs.some((output) =>
            !hasExactKeys(output, [
                'path', 'mode', 'sha256', 'provider', 'owner', 'disposition',
                'candidatePath',
            ]) ||
            !validOutputPath(output.path) ||
            ![0o644, 0o755].includes(output.mode) ||
            typeof output.sha256 !== 'string' ||
            !/^[0-9a-f]{64}$/.test(output.sha256) ||
            typeof output.provider !== 'string' ||
            typeof output.owner !== 'string' ||
            ![OWNERSHIP.CREATE, OWNERSHIP.CURRENT, OWNERSHIP.MIGRATE]
                .includes(output.disposition) ||
            output.candidatePath !== `candidate/${output.path}`
        ) ||
        new Set(plan.outputs.map(({path: outputPath}) => outputPath)).size !==
            plan.outputs.length ||
        !hasExactKeys(plan.preconditions, ['head', 'indexTree', 'worktree']) ||
        !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(plan.preconditions.head) ||
        !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(plan.preconditions.indexTree) ||
        typeof plan.preconditions.worktree !== 'string'
    ) {
        throw new Error('automation plan is invalid');
    }
    const providers = new Map(plan.providers.map((provider) => [provider.id, provider]));
    if (
        providers.size !== plan.providers.length ||
        plan.outputs.some((output) =>
            providers.get(output.provider)?.packageName !== output.owner
        )
    ) {
        throw new Error('automation plan is invalid');
    }
}

function readPlan(projectRoot, planPath) {
    const paths = operationPaths(projectRoot);
    const lexicalPlan = path.resolve(planPath);
    const stat = fs.lstatSync(lexicalPlan);
    if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) {
        throw new Error('automation plan is invalid');
    }
    const canonicalPlan = fs.realpathSync(lexicalPlan);
    if (
        canonicalPlan !== lexicalPlan ||
        path.dirname(canonicalPlan) !== paths.operationRoot ||
        !/^plan-[0-9a-f]{64}[.]json$/.test(path.basename(canonicalPlan))
    ) {
        throw new Error('automation plan path is invalid');
    }
    const envelope = JSON.parse(fs.readFileSync(canonicalPlan, 'utf8'));
    const digest = sha256(Buffer.from(JSON.stringify(envelope.plan)));
    if (
        !hasExactKeys(envelope, ['schemaVersion', 'planDigest', 'plan']) ||
        envelope.schemaVersion !== 1 ||
        envelope.planDigest !== digest ||
        path.basename(canonicalPlan) !== `plan-${digest}.json` ||
        envelope.plan?.projectRoot !== projectRoot
    ) {
        throw new Error('automation plan is stale');
    }
    validateRetainedPlan(envelope.plan);
    return Object.freeze({paths, planPath: canonicalPlan, envelope});
}

function candidateContents(paths, output) {
    const candidatePath = path.join(paths.operationRoot, ...output.candidatePath.split('/'));
    const relation = path.relative(paths.candidateRoot, candidatePath);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error('automation candidate path is invalid');
    }
    const stat = fs.lstatSync(candidatePath);
    if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        (stat.mode & 0o777) !== output.mode ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('automation candidate changed');
    }
    const descriptor = fs.openSync(
        candidatePath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    );
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const current = fs.lstatSync(candidatePath);
        if (
            !held.isFile() ||
            !sameFile(stat, held) ||
            !sameFile(held, current) ||
            (held.mode & 0o777) !== output.mode ||
            sha256(contents) !== output.sha256
        ) {
            throw new Error('automation candidate changed');
        }
        return contents;
    } finally {
        fs.closeSync(descriptor);
    }
}

function revalidateProviderEvidence(projectRoot, coreRoot, expected, configuration) {
    const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-automation-revalidate-'));
    fs.chmodSync(candidateRoot, 0o700);
    try {
        const current = semanticProviders(renderCanonicalProviders({
            projectRoot,
            coreRoot,
            candidateRoot,
            releaseRepository: configuration.releaseRepository,
        }));
        if (JSON.stringify(current) !== JSON.stringify(expected)) {
            throw new Error('automation provider identity changed');
        }
    } finally {
        fs.rmSync(candidateRoot, {recursive: true, force: true});
    }
}

function revalidatePlan(projectRoot, coreRoot, retained, run) {
    revalidateProviderEvidence(
        projectRoot,
        coreRoot,
        retained.envelope.plan.providers,
        retained.envelope.plan.configuration
    );
    if (JSON.stringify(gitSnapshot(projectRoot, run)) !==
        JSON.stringify(retained.envelope.plan.preconditions)) {
        throw new Error('automation Git precondition changed');
    }
    for (const output of retained.envelope.plan.outputs) {
        candidateContents(retained.paths, output);
        const current = classifyOutput({projectRoot, output: {
            path: output.path,
            mode: output.mode,
            candidatePath: path.join(
                retained.paths.operationRoot,
                ...output.candidatePath.split('/')
            ),
        }, owner: output.owner});
        if (current.disposition !== output.disposition) {
            throw new Error('automation ownership changed');
        }
    }
}

function ensureDestinationParent(projectRoot, relativePath, createdDirectories) {
    let current = projectRoot;
    for (const segment of relativePath.split('/').slice(0, -1)) {
        current = path.join(current, segment);
        const existing = fs.lstatSync(current, {throwIfNoEntry: false});
        if (existing === undefined) {
            fs.mkdirSync(current, {mode: 0o755});
            createdDirectories.push(current);
        }
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error('automation destination parent is invalid');
        }
    }
}

function publishFile(destination, contents, mode, rename) {
    const temporary = path.join(
        path.dirname(destination),
        `.${path.basename(destination)}.prism-${crypto.randomBytes(8).toString('hex')}`
    );
    try {
        fs.writeFileSync(temporary, contents, {flag: 'wx', mode});
        fs.chmodSync(temporary, mode);
        rename(temporary, destination);
    } finally {
        fs.rmSync(temporary, {force: true});
    }
}

function releaseHeldLock(lockPath, descriptor) {
    const held = fs.fstatSync(descriptor);
    const current = fs.lstatSync(lockPath, {throwIfNoEntry: false});
    const owned = current !== undefined &&
        !current.isSymbolicLink() &&
        current.isFile() &&
        sameFile(held, current);
    fs.closeSync(descriptor);
    if (owned) fs.unlinkSync(lockPath);
    return owned;
}

function applyAutomation({
    projectRoot: requestedRoot,
    coreRoot,
    planPath,
    run = runBounded,
    rename = fs.renameSync,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    fs.realpathSync(coreRoot);
    const retained = readPlan(projectRoot, planPath);
    ensureDirectory(path.dirname(retained.paths.lockPath));
    const lock = fs.openSync(retained.paths.lockPath, 'wx', 0o600);
    let lockOpen = true;
    const published = [];
    const createdDirectories = [];
    try {
        revalidatePlan(projectRoot, fs.realpathSync(coreRoot), retained, run);
        for (const output of retained.envelope.plan.outputs) {
            if (output.disposition === OWNERSHIP.CURRENT) continue;
            const destination = path.join(projectRoot, ...output.path.split('/'));
            const previous = readExistingOutput(projectRoot, output.path);
            const contents = candidateContents(retained.paths, output);
            ensureDestinationParent(projectRoot, output.path, createdDirectories);
            publishFile(destination, contents, output.mode, rename);
            published.push({destination, output, previous});
        }
        for (const output of retained.envelope.plan.outputs) {
            const current = readExistingOutput(projectRoot, output.path);
            if (
                current === null ||
                current.mode !== output.mode ||
                sha256(current.contents) !== output.sha256
            ) {
                throw new Error('automation application verification failed');
            }
        }
        validateOwnedOperation(retained.paths);
        const removedLock = releaseHeldLock(retained.paths.lockPath, lock);
        lockOpen = false;
        if (!removedLock) throw new Error('automation lock changed');
        fs.rmSync(retained.paths.operationRoot, {recursive: true});
        return Object.freeze({
            status: 'GO',
            disposition: 'APPLIED',
            checks: Object.freeze([Object.freeze({
                id: 'automation-application',
                status: 'PASS',
                message: 'automation outputs applied',
            })]),
        });
    } catch (error) {
        for (const record of published.reverse()) {
            const current = readExistingOutput(projectRoot, record.output.path);
            if (
                current === null ||
                current.mode !== record.output.mode ||
                sha256(current.contents) !== record.output.sha256
            ) continue;
            if (record.previous === null) fs.unlinkSync(record.destination);
            else publishFile(
                record.destination,
                record.previous.contents,
                record.previous.mode,
                fs.renameSync
            );
        }
        for (const directory of createdDirectories.reverse()) {
            if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
                fs.rmdirSync(directory);
            }
        }
        if (lockOpen) {
            releaseHeldLock(retained.paths.lockPath, lock);
            lockOpen = false;
        }
        throw error;
    }
}

function verifyAutomation({projectRoot, coreRoot, releaseRepository = null}) {
    const inspected = inspectAutomation({projectRoot, coreRoot, releaseRepository});
    const current = inspected.status === 'GO' && inspected.providers.every(({outputs}) =>
        outputs.every(({disposition}) => disposition === OWNERSHIP.CURRENT)
    );
    return Object.freeze({
        status: current ? 'GO' : 'NO-GO',
        disposition: current ? 'CURRENT' : inspected.disposition,
        providers: inspected.providers,
        checks: Object.freeze([Object.freeze({
            id: 'automation-verification',
            status: current ? 'PASS' : 'FAIL',
            message: current
                ? 'automation outputs are current'
                : 'automation outputs are not current',
        })]),
    });
}

module.exports = {
    OWNERSHIP,
    applyAutomation,
    inspectAutomation,
    planAutomation,
    verifyAutomation,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
