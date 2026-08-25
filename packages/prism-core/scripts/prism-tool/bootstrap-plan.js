// $KYAULabs: bootstrap-plan.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeProjectMetadata} = require('./bootstrap-metadata');
const {composeProviderReports, validateProviderReport} = require('./bootstrap-composer');
const {
    loadTrustedAdapterProviderDescriptor,
    loadTrustedProviderRegistry,
    renderCoreBaseline,
} = require('./bootstrap-providers');
const {createPreparedBootstrapJournal} = require('./bootstrap-journal');
const {
    cleanupBootstrapAdapter,
    inspectProvisionedBootstrapAdapter,
} = require('./bootstrap-adapter');
const {inspectSetupRoute} = require('./setup-route');
const {
    blankBootstrapSource,
    validateBootstrapSource,
    validateBootstrapSourceState,
} = require('./bootstrap-source');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_OPERATION_BYTES = 1048576;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBuffer(value) {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeExclusive(filePath, value) {
    const contents = Buffer.isBuffer(value) ? value : jsonBuffer(value);
    if (contents.length > MAX_OPERATION_BYTES) throw new Error('bootstrap operation file is too large');
    fs.writeFileSync(filePath, contents, {flag: 'wx', mode: 0o600});
    fs.chmodSync(filePath, 0o600);
    return contents;
}

function createAttempt(projectRoot, randomUUID) {
    const attemptId = randomUUID();
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    fs.mkdirSync(piRoot, {mode: 0o700});
    fs.mkdirSync(prismRoot, {mode: 0o700});
    fs.mkdirSync(bootstrapRoot, {mode: 0o700});
    fs.mkdirSync(attemptRoot, {mode: 0o700});
    const candidateRoot = path.join(attemptRoot, 'candidate');
    const reportsRoot = path.join(attemptRoot, 'reports');
    const planRoot = path.join(attemptRoot, 'plan');
    fs.mkdirSync(candidateRoot, {mode: 0o700});
    fs.mkdirSync(reportsRoot, {mode: 0o700});
    fs.mkdirSync(planRoot, {mode: 0o700});
    return {
        attemptId,
        piRoot,
        prismRoot,
        bootstrapRoot,
        attemptRoot,
        candidateRoot,
        reportsRoot,
        planRoot,
        planPath: path.join(planRoot, 'project.json'),
    };
}

function readInventoryFile(filePath, initial) {
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        throw new Error('safe filesystem flags are unavailable');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (!held.isFile() || !sameFile(initial, held) || held.size !== initial.size) {
            throw new Error('bootstrap attempt file changed');
        }
        const contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        if (!sameFile(held, final) || final.size !== held.size) {
            throw new Error('bootstrap attempt file changed');
        }
        return contents;
    } finally {
        fs.closeSync(descriptor);
    }
}

function inventoryAttempt(attemptRoot) {
    const entries = [];
    function walk(relativeRoot, openRoot) {
        const absoluteRoot = relativeRoot === '' ? attemptRoot : path.join(attemptRoot, relativeRoot);
        const directory = holdAttemptDirectory(attemptRoot, absoluteRoot, openRoot);
        try {
            for (const name of fs.readdirSync(directory.anchor).sort()) {
                const relativePath = relativeRoot === '' ? name : `${relativeRoot}/${name}`;
                if (
                    relativePath === 'plan/project.json' ||
                    relativePath === 'journal.json' ||
                    relativePath === 'apply.lock' ||
                    relativePath === 'seed-attestation.json'
                ) continue;
                const anchoredPath = path.join(directory.anchor, name);
                const stat = fs.lstatSync(anchoredPath);
                if (stat.isSymbolicLink()) throw new Error('bootstrap attempt contains a symlink');
                if (stat.isDirectory()) {
                    entries.push({path: relativePath, kind: 'directory', mode: stat.mode & 0o777, bytes: 0, sha256: null});
                    walk(relativePath, anchoredPath);
                } else if (stat.isFile() && stat.size <= MAX_OPERATION_BYTES) {
                    const contents = readInventoryFile(anchoredPath, stat);
                    entries.push({
                        path: relativePath,
                        kind: 'file',
                        mode: stat.mode & 0o777,
                        bytes: contents.length,
                        sha256: sha256(contents),
                    });
                } else {
                    throw new Error('bootstrap attempt contains an invalid entry');
                }
            }
            directory.assertCurrent();
        } finally {
            directory.close();
        }
    }
    walk('', attemptRoot);
    return sha256(Buffer.from(JSON.stringify(entries), 'utf8'));
}

function semanticOutput(output) {
    return Object.freeze({
        path: output.path,
        kind: output.kind,
        mode: output.mode,
        sha256: output.sha256,
        provider: output.provider,
    });
}

function persistedProviderReport(report, candidateRoot) {
    return {
        ...report,
        outputs: report.outputs.map((output) => ({
            ...output,
            candidatePath: path.posix.join(
                'candidate',
                path.relative(candidateRoot, output.candidatePath).split(path.sep).join('/')
            ),
        })),
    };
}

function cleanupAttempt(projectRoot, attempt) {
    try {
        if (fs.readdirSync(projectRoot).join(',') !== '.pi') return false;
        if (fs.readdirSync(attempt.piRoot).join(',') !== 'prism-tool') return false;
        if (fs.readdirSync(attempt.prismRoot).join(',') !== 'bootstrap') return false;
        if (fs.readdirSync(attempt.bootstrapRoot).join(',') !== attempt.attemptId) return false;
        fs.rmSync(attempt.attemptRoot, {recursive: true});
        fs.rmdirSync(attempt.bootstrapRoot);
        fs.rmdirSync(attempt.prismRoot);
        fs.rmdirSync(attempt.piRoot);
        return fs.readdirSync(projectRoot).length === 0;
    } catch {
        return false;
    }
}

function planCoreOnlyProject({
    projectRoot: requestedRoot,
    coreRoot,
    input,
    randomUUID,
    sourceState = blankBootstrapSource(),
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const normalizedSource = validateBootstrapSourceState(sourceState);
    const route = inspectSetupRoute({projectRoot, source: normalizedSource.source.mode});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        throw new Error('project planning requires strict-empty setup');
    }
    const normalized = normalizeProjectMetadata({projectRoot, input});
    const metadata = Object.freeze({
        schemaVersion: normalized.schemaVersion,
        displayName: normalized.displayName,
        summary: normalized.summary,
    });
    let attempt;
    try {
        attempt = createAttempt(projectRoot, randomUUID);
        const providerReport = renderCoreBaseline({
            coreRoot,
            projectRoot,
            candidateRoot: attempt.candidateRoot,
            request: {
                schemaVersion: 1,
                source: normalizedSource.source,
                capabilities: [],
                metadata: normalized,
                adapter: null,
            },
        });
        const registry = loadTrustedProviderRegistry({coreRoot});
        const validated = validateProviderReport({
            projectRoot,
            candidateRoot: attempt.candidateRoot,
            registry,
            report: providerReport,
        });
        const outputs = composeProviderReports({reports: [{
            provider: providerReport.provider,
            outputs: validated,
        }]}).map(semanticOutput);
        const sourceContents = writeExclusive(
            path.join(attempt.reportsRoot, 'source.json'),
            normalizedSource
        );
        const metadataContents = writeExclusive(path.join(attempt.reportsRoot, 'metadata.json'), metadata);
        const persistedProvider = persistedProviderReport(providerReport, attempt.candidateRoot);
        writeExclusive(path.join(attempt.reportsRoot, 'core-baseline.json'), persistedProvider);
        const attemptInventoryDigest = inventoryAttempt(attempt.attemptRoot);
        const plan = Object.freeze({
            schemaVersion: 1,
            source: normalizedSource.source,
            sourceDigest: sha256(sourceContents),
            adapter: null,
            adapterReportDigest: null,
            activation: null,
            capabilities: Object.freeze([]),
            metadata,
            metadataDigest: sha256(metadataContents),
            providers: Object.freeze([providerReport.provider]),
            outputs: Object.freeze(outputs),
            effects: Object.freeze([]),
            checks: providerReport.checks,
            verification: providerReport.verification,
            recovery: Object.freeze({
                beforeDurable: 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY',
                afterDurable: 'RETAIN_PROJECT_AND_RESUME',
            }),
            filesystem: Object.freeze({
                original: 'STRICT_EMPTY',
                allowedRootEntries: Object.freeze(['.pi']),
                attemptInventoryDigest,
            }),
        });
        const planDigest = sha256(Buffer.from(JSON.stringify(plan), 'utf8'));
        writeExclusive(attempt.planPath, {schemaVersion: 1, planDigest, plan});
        createPreparedBootstrapJournal({
            projectRoot,
            attemptId: attempt.attemptId,
            planDigest,
            plan,
        });
        validateBootstrapProjectPlan({
            projectRoot,
            coreRoot,
            attemptId: attempt.attemptId,
            planDigest,
        });
        return Object.freeze({
            ...plan,
            planDigest,
            data: Object.freeze({
                attempt: Object.freeze({id: attempt.attemptId}),
                planPath: fs.realpathSync(attempt.planPath),
            }),
        });
    } catch (error) {
        if (attempt && !cleanupAttempt(projectRoot, attempt)) {
            error.recoveryRequired = true;
            error.recoveryPath = attempt.attemptRoot;
        }
        throw error;
    }
}

function selectedAdapterIdentity(adapter) {
    return Object.freeze({
        id: adapter.id,
        packageName: adapter.packageName,
        packageVersion: adapter.packageVersion,
        bootstrapProtocol: adapter.bootstrapProtocol,
    });
}

function openSelectedAttempt({
    projectRoot,
    coreRoot,
    attemptId,
    packageName,
    prepare = true,
    allowAppliedProject = false,
}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    const inspection = inspectProvisionedBootstrapAdapter({
        projectRoot,
        coreRoot,
        attemptId,
        packageName,
        allowAppliedProject,
    });
    if (prepare && fs.readdirSync(attemptRoot).join(',') !== 'adapter.json') {
        throw new Error('bootstrap adapter attempt state is stale');
    }
    const candidateRoot = path.join(attemptRoot, 'candidate');
    const reportsRoot = path.join(attemptRoot, 'reports');
    const planRoot = path.join(attemptRoot, 'plan');
    if (prepare) {
        fs.mkdirSync(candidateRoot, {mode: 0o700});
        fs.mkdirSync(reportsRoot, {mode: 0o700});
        fs.mkdirSync(planRoot, {mode: 0o700});
    }
    return {
        attemptId,
        piRoot: path.join(projectRoot, '.pi'),
        prismRoot: path.join(projectRoot, '.pi', 'prism-tool'),
        bootstrapRoot: path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap'),
        attemptRoot,
        candidateRoot,
        reportsRoot,
        planRoot,
        planPath: path.join(planRoot, 'project.json'),
        adapter: selectedAdapterIdentity(inspection.adapter),
        registration: inspection.registration,
        handler: inspection.handler,
        receipt: inspection.receipt,
    };
}

function buildAdapterProjectPlan({
    projectRoot: requestedRoot,
    coreRoot,
    input,
    attemptId,
    packageName,
    run,
    sourceState = blankBootstrapSource(),
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const normalizedSource = validateBootstrapSourceState(sourceState);
    const normalized = normalizeProjectMetadata({projectRoot, input});
    const metadata = Object.freeze({
        schemaVersion: normalized.schemaVersion,
        displayName: normalized.displayName,
        summary: normalized.summary,
    });
    const attempt = openSelectedAttempt({projectRoot, coreRoot, attemptId, packageName});
    const request = {
        schemaVersion: 1,
        source: normalizedSource.source,
        capabilities: [],
        metadata: normalized,
        adapter: attempt.adapter,
    };
    const coreReport = renderCoreBaseline({
        coreRoot,
        projectRoot,
        candidateRoot: attempt.candidateRoot,
        request,
    });
    const adapterCandidateRoot = path.join(attempt.candidateRoot, 'adapter');
    fs.mkdirSync(adapterCandidateRoot, {mode: 0o700});
    const adapterReport = attempt.handler.prepareBootstrapProject({
        candidateRoot: adapterCandidateRoot,
        contract: attempt.registration.contract,
        request,
        run,
    });
    const coreRegistry = loadTrustedProviderRegistry({coreRoot});
    const adapterDescriptor = loadTrustedAdapterProviderDescriptor({
        registration: attempt.registration,
    });
    const registry = {
        schemaVersion: 1,
        providers: [...coreRegistry.providers, adapterDescriptor],
    };
    const coreOutputs = validateProviderReport({
        projectRoot,
        candidateRoot: attempt.candidateRoot,
        registry,
        report: coreReport,
    });
    const adapterOutputs = validateProviderReport({
        projectRoot,
        candidateRoot: adapterCandidateRoot,
        registry,
        report: adapterReport,
    });
    const outputs = composeProviderReports({reports: [
        {provider: coreReport.provider, outputs: coreOutputs},
        {provider: adapterReport.provider, outputs: adapterOutputs},
    ]}).map(semanticOutput);
    const sourceContents = writeExclusive(
        path.join(attempt.reportsRoot, 'source.json'),
        normalizedSource
    );
    const metadataContents = writeExclusive(path.join(attempt.reportsRoot, 'metadata.json'), metadata);
    writeExclusive(
        path.join(attempt.reportsRoot, 'core-baseline.json'),
        persistedProviderReport(coreReport, attempt.candidateRoot)
    );
    const adapterReportContents = writeExclusive(
        path.join(attempt.reportsRoot, 'adapter-provider.json'),
        persistedProviderReport(adapterReport, attempt.candidateRoot)
    );
    const attemptInventoryDigest = inventoryAttempt(attempt.attemptRoot);
    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
    const settingsStat = fs.lstatSync(settingsPath);
    if (settingsStat.isSymbolicLink() || !settingsStat.isFile()) {
        throw new Error('bootstrap adapter activation is invalid');
    }
    const activation = Object.freeze({
        path: '.pi/settings.json',
        kind: 'file',
        mode: settingsStat.mode & 0o777,
        sha256: attempt.receipt.settings.sha256,
    });
    const plan = Object.freeze({
        schemaVersion: 1,
        source: normalizedSource.source,
        sourceDigest: sha256(sourceContents),
        adapter: attempt.adapter,
        adapterReportDigest: sha256(adapterReportContents),
        activation,
        capabilities: Object.freeze([]),
        metadata,
        metadataDigest: sha256(metadataContents),
        providers: Object.freeze([coreReport.provider, adapterReport.provider]),
        outputs: Object.freeze(outputs),
        effects: Object.freeze([...coreReport.effects, ...adapterReport.effects]),
        checks: Object.freeze([...coreReport.checks, ...adapterReport.checks]),
        verification: Object.freeze([
            ...coreReport.verification,
            ...adapterReport.verification,
        ]),
        recovery: Object.freeze({
            beforeDurable: 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY',
            afterDurable: 'RETAIN_PROJECT_AND_RESUME',
        }),
        filesystem: Object.freeze({
            original: 'STRICT_EMPTY',
            allowedRootEntries: Object.freeze(['.pi']),
            attemptInventoryDigest,
        }),
    });
    const planDigest = sha256(Buffer.from(JSON.stringify(plan), 'utf8'));
    writeExclusive(attempt.planPath, {schemaVersion: 1, planDigest, plan});
    createPreparedBootstrapJournal({
        projectRoot,
        attemptId: attempt.attemptId,
        planDigest,
        plan,
    });
    validateBootstrapProjectPlan({
        projectRoot,
        coreRoot,
        attemptId: attempt.attemptId,
        planDigest,
    });
    return Object.freeze({
        ...plan,
        planDigest,
        data: Object.freeze({
            attempt: Object.freeze({id: attempt.attemptId}),
            planPath: fs.realpathSync(attempt.planPath),
        }),
    });
}

function cleanupSelectedPlanningAttempt(projectRoot, attemptId) {
    if (!ATTEMPT_ID.test(attemptId)) return false;
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    try {
        const allowed = new Set([
            'adapter.json', 'candidate', 'reports', 'plan', 'journal.json',
        ]);
        if (fs.readdirSync(attemptRoot).some((entry) => !allowed.has(entry))) return false;
        for (const entry of ['candidate', 'reports', 'plan']) {
            const entryPath = path.join(attemptRoot, entry);
            const stat = fs.lstatSync(entryPath, {throwIfNoEntry: false});
            if (stat === undefined) continue;
            if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
            fs.rmSync(entryPath, {recursive: true});
        }
        const journalPath = path.join(attemptRoot, 'journal.json');
        const journal = fs.lstatSync(journalPath, {throwIfNoEntry: false});
        if (journal !== undefined) {
            if (journal.isSymbolicLink() || !journal.isFile()) return false;
            fs.unlinkSync(journalPath);
        }
        const report = cleanupBootstrapAdapter({projectRoot, attemptId});
        return report.status === 'GO' && fs.readdirSync(projectRoot).length === 0;
    } catch {
        return false;
    }
}

function planAdapterProject(options) {
    try {
        return buildAdapterProjectPlan(options);
    } catch (error) {
        let projectRoot;
        try {
            projectRoot = fs.realpathSync(options.projectRoot);
        } catch {
            throw error;
        }
        if (!cleanupSelectedPlanningAttempt(projectRoot, options.attemptId)) {
            error.recoveryRequired = true;
            error.recoveryPath = path.join(
                projectRoot,
                '.pi',
                'prism-tool',
                'bootstrap',
                options.attemptId
            );
        }
        throw error;
    }
}

function readJsonFile(filePath, expectedMode = 0o600) {
    const initial = fs.lstatSync(filePath);
    if (initial.isSymbolicLink() || !initial.isFile() || initial.size > MAX_OPERATION_BYTES) {
        throw new Error('bootstrap operation file is invalid');
    }
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        throw new Error('safe filesystem flags are unavailable');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (
            !held.isFile() ||
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            held.size !== initial.size ||
            (held.mode & 0o777) !== expectedMode
        ) {
            throw new Error('bootstrap operation file changed');
        }
        const contents = fs.readFileSync(descriptor);
        const value = JSON.parse(contents.toString('utf8'));
        if (!isRecord(value)) throw new Error('bootstrap operation JSON is invalid');
        return {contents, value};
    } finally {
        fs.closeSync(descriptor);
    }
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function holdAttemptDirectory(attemptRoot, directoryPath, openPath = directoryPath) {
    if (
        typeof fs.constants.O_DIRECTORY !== 'number' ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('safe filesystem flags are unavailable');
    }
    const initial = fs.lstatSync(openPath);
    if (
        initial.isSymbolicLink() ||
        !initial.isDirectory() ||
        (initial.mode & 0o777) !== 0o700
    ) {
        throw new Error('bootstrap attempt directory is invalid');
    }
    const descriptor = fs.openSync(
        openPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
    );
    try {
        const held = fs.fstatSync(descriptor);
        const current = fs.lstatSync(directoryPath);
        const relation = path.relative(attemptRoot, fs.realpathSync(directoryPath));
        if (
            !sameFile(initial, held) ||
            !sameFile(current, held) ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('bootstrap attempt directory changed');
        }
        let anchor;
        for (const candidate of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
            try {
                if (sameFile(fs.statSync(candidate), held)) {
                    anchor = candidate;
                    break;
                }
            } catch {
                continue;
            }
        }
        if (anchor === undefined) throw new Error('bootstrap attempt directory cannot be held safely');
        return {
            anchor,
            assertCurrent() {
                const latest = fs.lstatSync(directoryPath);
                if (
                    latest.isSymbolicLink() ||
                    !latest.isDirectory() ||
                    !sameFile(latest, held) ||
                    !sameFile(fs.statSync(anchor), held)
                ) {
                    throw new Error('bootstrap attempt directory changed');
                }
            },
            close() {
                fs.closeSync(descriptor);
            },
        };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function assertAttemptDirectories(projectRoot, attemptId, allowAppliedProject = false) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const rootEntries = fs.readdirSync(projectRoot);
    if (
        (!allowAppliedProject && rootEntries.join(',') !== '.pi') ||
        (allowAppliedProject && !rootEntries.includes('.pi'))
    ) throw new Error('project root state is stale');
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    for (const directory of [piRoot, prismRoot, bootstrapRoot, attemptRoot]) {
        const stat = fs.lstatSync(directory);
        if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
            throw new Error('bootstrap attempt directory is invalid');
        }
    }
    const adapterReceiptPath = path.join(attemptRoot, 'adapter.json');
    const piEntries = fs.readdirSync(piRoot).sort();
    const allowedPiEntries = fs.existsSync(adapterReceiptPath)
        ? ['npm', 'prism-tool', 'settings.json']
        : ['prism-tool'];
    if (
        piEntries.some((entry) => !allowedPiEntries.includes(entry)) ||
        !piEntries.includes('prism-tool') ||
        (!fs.existsSync(adapterReceiptPath) && piEntries.length !== 1) ||
        fs.readdirSync(prismRoot).join(',') !== 'bootstrap' ||
        fs.readdirSync(bootstrapRoot).join(',') !== attemptId
    ) {
        throw new Error('bootstrap attempt state is stale');
    }
    const candidateRoot = path.join(attemptRoot, 'candidate');
    const reportsRoot = path.join(attemptRoot, 'reports');
    const planRoot = path.join(attemptRoot, 'plan');
    const held = [];
    try {
        const candidate = holdAttemptDirectory(attemptRoot, candidateRoot);
        held.push(candidate);
        const reports = holdAttemptDirectory(attemptRoot, reportsRoot);
        held.push(reports);
        const plan = holdAttemptDirectory(attemptRoot, planRoot);
        held.push(plan);
        return {
            attemptRoot,
            candidateRoot,
            candidateAnchor: candidate.anchor,
            reportsRoot,
            reportsAnchor: reports.anchor,
            planPath: path.join(planRoot, 'project.json'),
            planAnchor: path.join(plan.anchor, 'project.json'),
            assertCurrent() {
                for (const directory of held) directory.assertCurrent();
            },
            close() {
                for (const directory of [...held].reverse()) directory.close();
            },
        };
    } catch (error) {
        for (const directory of held.reverse()) directory.close();
        throw error;
    }
}

function validAdapterIdentity(value) {
    return value === null || (
        isRecord(value) &&
        hasExactKeys(value, ['id', 'packageName', 'packageVersion', 'bootstrapProtocol']) &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        typeof value.packageName === 'string' &&
        value.packageName.length > 0 &&
        typeof value.packageVersion === 'string' &&
        value.packageVersion.length > 0 &&
        Number.isSafeInteger(value.bootstrapProtocol) &&
        value.bootstrapProtocol > 0
    );
}

function validProviderIdentity(value) {
    return isRecord(value) &&
        hasExactKeys(value, ['id', 'packageName', 'packageVersion', 'protocolVersion']) &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        typeof value.packageName === 'string' &&
        value.packageName.length > 0 &&
        typeof value.packageVersion === 'string' &&
        value.packageVersion.length > 0 &&
        Number.isSafeInteger(value.protocolVersion) &&
        value.protocolVersion > 0;
}

function validatePlanShape(plan) {
    if (!isRecord(plan) || !hasExactKeys(plan, [
        'schemaVersion', 'source', 'sourceDigest', 'adapter', 'adapterReportDigest', 'activation', 'capabilities',
        'metadata', 'metadataDigest',
        'providers', 'outputs', 'effects', 'checks', 'verification', 'recovery', 'filesystem',
    ])) {
        throw new Error('bootstrap project plan is invalid');
    }
    const providerCount = plan.adapter === null ? 1 : 2;
    try {
        validateBootstrapSource(plan.source);
    } catch {
        throw new Error('bootstrap project plan is invalid');
    }
    if (
        plan.schemaVersion !== 1 ||
        typeof plan.sourceDigest !== 'string' ||
        !/^[0-9a-f]{64}$/.test(plan.sourceDigest) ||
        !validAdapterIdentity(plan.adapter) ||
        (
            plan.adapter === null
                ? plan.adapterReportDigest !== null
                : typeof plan.adapterReportDigest !== 'string' ||
                    !/^[0-9a-f]{64}$/.test(plan.adapterReportDigest)
        ) ||
        (
            plan.adapter === null
                ? plan.activation !== null
                : !isRecord(plan.activation) ||
                    !hasExactKeys(plan.activation, ['path', 'kind', 'mode', 'sha256']) ||
                    plan.activation.path !== '.pi/settings.json' ||
                    plan.activation.kind !== 'file' ||
                    ![0o600, 0o644].includes(plan.activation.mode) ||
                    typeof plan.activation.sha256 !== 'string' ||
                    !/^[0-9a-f]{64}$/.test(plan.activation.sha256)
        ) ||
        !Array.isArray(plan.capabilities) ||
        plan.capabilities.length !== 0 ||
        !isRecord(plan.metadata) ||
        !hasExactKeys(plan.metadata, ['schemaVersion', 'displayName', 'summary']) ||
        typeof plan.metadataDigest !== 'string' ||
        !/^[0-9a-f]{64}$/.test(plan.metadataDigest) ||
        !Array.isArray(plan.providers) ||
        plan.providers.length !== providerCount ||
        plan.providers.some((provider) => !validProviderIdentity(provider)) ||
        !Array.isArray(plan.outputs) ||
        plan.outputs.length < 1 ||
        plan.outputs.length > 1024 ||
        plan.outputs.some((output) =>
            !isRecord(output) ||
            !hasExactKeys(output, ['path', 'kind', 'mode', 'sha256', 'provider'])
        ) ||
        !Array.isArray(plan.effects) ||
        plan.effects.some((effect) =>
            !isRecord(effect) ||
            !hasExactKeys(effect, ['id', 'kind', 'command']) ||
            typeof effect.id !== 'string' ||
            typeof effect.kind !== 'string' ||
            typeof effect.command !== 'string'
        ) ||
        !Array.isArray(plan.checks) ||
        plan.checks.length !== providerCount ||
        plan.checks.some((check) =>
            !isRecord(check) ||
            !hasExactKeys(check, ['id', 'status', 'message']) ||
            typeof check.id !== 'string' ||
            check.status !== 'PASS' ||
            typeof check.message !== 'string'
        ) ||
        !Array.isArray(plan.verification) ||
        plan.verification.length !== providerCount ||
        plan.verification.some((verification) =>
            !isRecord(verification) ||
            !hasExactKeys(verification, ['id', 'command']) ||
            typeof verification.id !== 'string' ||
            typeof verification.command !== 'string'
        ) ||
        !isRecord(plan.recovery) ||
        !hasExactKeys(plan.recovery, ['beforeDurable', 'afterDurable']) ||
        plan.recovery.beforeDurable !== 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY' ||
        plan.recovery.afterDurable !== 'RETAIN_PROJECT_AND_RESUME' ||
        !isRecord(plan.filesystem) ||
        !hasExactKeys(plan.filesystem, ['original', 'allowedRootEntries', 'attemptInventoryDigest']) ||
        plan.filesystem.original !== 'STRICT_EMPTY' ||
        !Array.isArray(plan.filesystem.allowedRootEntries) ||
        plan.filesystem.allowedRootEntries.length !== 1 ||
        plan.filesystem.allowedRootEntries[0] !== '.pi' ||
        typeof plan.filesystem.attemptInventoryDigest !== 'string' ||
        !/^[0-9a-f]{64}$/.test(plan.filesystem.attemptInventoryDigest)
    ) {
        throw new Error('bootstrap project plan is invalid');
    }
}

function restoreProviderReport(fileName, paths, expectedDigest = null) {
    const persistedFile = readJsonFile(path.join(paths.reportsAnchor, fileName));
    if (expectedDigest !== null && sha256(persistedFile.contents) !== expectedDigest) {
        throw new Error('bootstrap provider report is stale');
    }
    const persisted = persistedFile.value;
    if (!Array.isArray(persisted.outputs)) {
        throw new Error('bootstrap provider report is invalid');
    }
    return {
        ...persisted,
        outputs: persisted.outputs.map((output) => {
            if (
                !isRecord(output) ||
                typeof output.candidatePath !== 'string' ||
                !output.candidatePath.startsWith('candidate/') ||
                path.posix.normalize(output.candidatePath) !== output.candidatePath
            ) {
                throw new Error('bootstrap provider report is invalid');
            }
            return {
                ...output,
                candidatePath: path.join(
                    paths.attemptRoot,
                    ...output.candidatePath.split('/')
                ),
            };
        }),
    };
}

function validateHeldProjectPlan({
    projectRoot,
    coreRoot,
    attemptId,
    planDigest,
    paths,
    allowAppliedProject,
}) {
    paths.assertCurrent();
    const envelope = readJsonFile(paths.planAnchor).value;
    if (!hasExactKeys(envelope, ['schemaVersion', 'planDigest', 'plan']) || envelope.schemaVersion !== 1) {
        throw new Error('bootstrap project plan is invalid');
    }
    validatePlanShape(envelope.plan);
    const actualPlanDigest = sha256(Buffer.from(JSON.stringify(envelope.plan), 'utf8'));
    if (envelope.planDigest !== planDigest || actualPlanDigest !== planDigest) {
        throw new Error('bootstrap project plan is stale');
    }
    const sourceFile = readJsonFile(path.join(paths.reportsAnchor, 'source.json'));
    const sourceState = validateBootstrapSourceState(sourceFile.value);
    if (
        sha256(sourceFile.contents) !== envelope.plan.sourceDigest ||
        JSON.stringify(sourceState.source) !== JSON.stringify(envelope.plan.source)
    ) {
        throw new Error('bootstrap project source is stale');
    }
    const metadataFile = readJsonFile(path.join(paths.reportsAnchor, 'metadata.json'));
    if (
        sha256(metadataFile.contents) !== envelope.plan.metadataDigest ||
        JSON.stringify(metadataFile.value) !== JSON.stringify(envelope.plan.metadata)
    ) {
        throw new Error('bootstrap project metadata is stale');
    }
    const coreReport = restoreProviderReport('core-baseline.json', paths);
    const coreRegistry = loadTrustedProviderRegistry({coreRoot});
    const reports = [];
    const coreOutputs = validateProviderReport({
        projectRoot,
        candidateRoot: paths.candidateRoot,
        registry: coreRegistry,
        report: coreReport,
    });
    reports.push({provider: coreReport.provider, outputs: coreOutputs});
    let adapterReport = null;
    let adapterState = null;
    if (envelope.plan.adapter !== null) {
        const state = openSelectedAttempt({
            projectRoot,
            coreRoot,
            attemptId,
            packageName: envelope.plan.adapter.packageName,
            prepare: false,
            allowAppliedProject,
        });
        if (
            JSON.stringify(state.adapter) !== JSON.stringify(envelope.plan.adapter) ||
            envelope.plan.activation.sha256 !== state.receipt.settings.sha256
        ) {
            throw new Error('bootstrap adapter selection is stale');
        }
        const activationPath = path.join(projectRoot, ...envelope.plan.activation.path.split('/'));
        const activationStat = fs.lstatSync(activationPath);
        if (
            activationStat.isSymbolicLink() ||
            !activationStat.isFile() ||
            (activationStat.mode & 0o777) !== envelope.plan.activation.mode
        ) {
            throw new Error('bootstrap adapter activation is stale');
        }
        adapterState = state;
        adapterReport = restoreProviderReport(
            'adapter-provider.json',
            paths,
            envelope.plan.adapterReportDigest
        );
        const adapterDescriptor = loadTrustedAdapterProviderDescriptor({
            registration: state.registration,
        });
        const registry = {
            schemaVersion: 1,
            providers: [...coreRegistry.providers, adapterDescriptor],
        };
        const adapterOutputs = validateProviderReport({
            projectRoot,
            candidateRoot: path.join(paths.candidateRoot, 'adapter'),
            registry,
            report: adapterReport,
        });
        reports.push({provider: adapterReport.provider, outputs: adapterOutputs});
    }
    const outputs = composeProviderReports({reports}).map(semanticOutput);
    paths.assertCurrent();
    const manifestRoot = path.join(paths.candidateRoot, '.prism');
    const manifestParent = holdAttemptDirectory(
        paths.attemptRoot,
        manifestRoot,
        path.join(paths.candidateAnchor, '.prism')
    );
    let projectManifest;
    try {
        projectManifest = readJsonFile(
            path.join(manifestParent.anchor, 'project.json'),
            0o644
        ).value;
        manifestParent.assertCurrent();
    } finally {
        manifestParent.close();
    }
    if (
        !hasExactKeys(projectManifest, [
            'schemaVersion', 'source', 'capabilities', 'project', 'adapter', 'compatibility',
        ]) ||
        projectManifest.schemaVersion !== 1 ||
        JSON.stringify(projectManifest.source) !== JSON.stringify(envelope.plan.source) ||
        JSON.stringify(projectManifest.capabilities) !== JSON.stringify(envelope.plan.capabilities) ||
        JSON.stringify(projectManifest.project) !== JSON.stringify({
            displayName: envelope.plan.metadata.displayName,
            summary: envelope.plan.metadata.summary,
        }) ||
        JSON.stringify(projectManifest.adapter) !== JSON.stringify(envelope.plan.adapter)
    ) {
        throw new Error('bootstrap project metadata manifest is stale');
    }
    if (
        JSON.stringify(outputs) !== JSON.stringify(envelope.plan.outputs) ||
        JSON.stringify(reports.map(({provider}) => provider)) !== JSON.stringify(envelope.plan.providers) ||
        JSON.stringify([
            ...coreReport.effects,
            ...(adapterReport?.effects ?? []),
        ]) !== JSON.stringify(envelope.plan.effects) ||
        JSON.stringify([
            ...coreReport.checks,
            ...(adapterReport?.checks ?? []),
        ]) !== JSON.stringify(envelope.plan.checks) ||
        JSON.stringify([
            ...coreReport.verification,
            ...(adapterReport?.verification ?? []),
        ]) !== JSON.stringify(envelope.plan.verification) ||
        inventoryAttempt(paths.attemptRoot) !== envelope.plan.filesystem.attemptInventoryDigest
    ) {
        throw new Error('bootstrap project state is stale');
    }
    const providerReports = [coreReport, ...(adapterReport === null ? [] : [adapterReport])];
    const candidates = outputs.map((output) => {
        const report = providerReports.find(({provider}) =>
            JSON.stringify(provider) === JSON.stringify(output.provider)
        );
        const source = report?.outputs.find(({path: outputPath}) => outputPath === output.path);
        if (source === undefined) throw new Error('bootstrap candidate inventory is stale');
        const candidatePath = path.relative(paths.attemptRoot, source.candidatePath)
            .split(path.sep).join('/');
        if (!candidatePath.startsWith('candidate/') || path.posix.normalize(candidatePath) !== candidatePath) {
            throw new Error('bootstrap candidate inventory is invalid');
        }
        return Object.freeze({path: output.path, provider: output.provider, candidatePath});
    });
    paths.assertCurrent();
    return Object.freeze({
        ...envelope.plan,
        planDigest,
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            planPath: fs.realpathSync(paths.planPath),
            candidates: Object.freeze(candidates),
            adapter: adapterState === null ? null : Object.freeze({
                contract: adapterState.registration.contract,
                handler: adapterState.handler,
                report: adapterReport,
            }),
        }),
    });
}

function validateBootstrapProjectPlan({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    allowAppliedProject = false,
}) {
    if (typeof planDigest !== 'string' || !/^[0-9a-f]{64}$/.test(planDigest)) {
        throw new Error('bootstrap project plan digest is invalid');
    }
    const projectRoot = fs.realpathSync(requestedRoot);
    const paths = assertAttemptDirectories(projectRoot, attemptId, allowAppliedProject);
    try {
        return validateHeldProjectPlan({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            paths,
            allowAppliedProject,
        });
    } finally {
        paths.close();
    }
}

module.exports = {planAdapterProject, planCoreOnlyProject, validateBootstrapProjectPlan};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
