// $KYAULabs: bootstrap-adapter.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    discoverAdapter,
    loadAdapterHandler,
    registrationFor,
    validateBootstrapRegistration,
} = require('./discovery');
const {inspectCatalogueCache} = require('./adapter-catalogue-cache');
const {
    selectCompatibleAdapters,
    validateCataloguePayload,
    verifyCatalogueEnvelope,
} = require('./adapter-catalogue-validation');
const {inspectSetupRoute} = require('./setup-route');
const {loadSelectedAdapter} = require('./supported-adapters');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTALL_TIMEOUT_MS = 300000;
const MAX_INVENTORY_BYTES = 268435456;
const MAX_INVENTORY_ENTRIES = 20000;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const RECEIPT_SCHEMA_VERSION = 2;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PACKAGE_NAME = /^@kyaulabs\/[a-z0-9](?:[a-z0-9._-]{0,212}[a-z0-9])?$/;
const UTC_TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readRegular(filePath, maximum = MAX_RECEIPT_BYTES) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maximum) {
        throw new Error('bootstrap state file is invalid');
    }
    return fs.readFileSync(filePath);
}

function readJson(filePath, maximum = MAX_RECEIPT_BYTES) {
    const value = JSON.parse(readRegular(filePath, maximum).toString('utf8'));
    if (!isRecord(value)) throw new Error('bootstrap JSON state is invalid');
    return value;
}

function ensureContained(root, candidate) {
    const relative = path.relative(root, candidate);
    if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        return;
    }
    throw new Error('bootstrap inventory path escapes its root');
}

function inventoryDirectory(directory) {
    const canonicalRoot = fs.realpathSync(directory);
    const rootStat = fs.lstatSync(directory);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error('bootstrap inventory root is invalid');
    }
    const entries = [];
    let bytes = 0;
    function walk(relativeRoot) {
        const absoluteRoot = relativeRoot === '' ? canonicalRoot : path.join(canonicalRoot, relativeRoot);
        for (const name of fs.readdirSync(absoluteRoot).sort()) {
            const relativePath = relativeRoot === '' ? name : path.join(relativeRoot, name);
            const absolutePath = path.join(canonicalRoot, relativePath);
            const stat = fs.lstatSync(absolutePath);
            let entry;
            if (stat.isDirectory()) {
                entry = {path: relativePath, type: 'directory', bytes: 0, sha256: null};
            } else if (stat.isFile()) {
                if (stat.size > MAX_INVENTORY_BYTES || bytes + stat.size > MAX_INVENTORY_BYTES) {
                    throw new Error('bootstrap inventory exceeds its bounds');
                }
                const contents = fs.readFileSync(absolutePath);
                bytes += contents.length;
                entry = {
                    path: relativePath,
                    type: 'file',
                    bytes: contents.length,
                    sha256: sha256(contents),
                };
            } else if (stat.isSymbolicLink()) {
                const target = fs.readlinkSync(absolutePath);
                const lexicalTarget = path.resolve(path.dirname(absolutePath), target);
                ensureContained(canonicalRoot, lexicalTarget);
                if (fs.existsSync(lexicalTarget)) ensureContained(canonicalRoot, fs.realpathSync(lexicalTarget));
                const targetBytes = Buffer.from(target, 'utf8');
                bytes += targetBytes.length;
                entry = {
                    path: relativePath,
                    type: 'symlink',
                    bytes: targetBytes.length,
                    sha256: sha256(targetBytes),
                };
            } else {
                throw new Error('bootstrap inventory contains an unsupported file type');
            }
            entries.push(entry);
            if (entries.length > MAX_INVENTORY_ENTRIES || bytes > MAX_INVENTORY_BYTES) {
                throw new Error('bootstrap inventory exceeds its bounds');
            }
            if (entry.type === 'directory') walk(relativePath);
        }
    }
    walk('');
    return {
        entries,
        bytes,
        sha256: sha256(Buffer.from(JSON.stringify(entries), 'utf8')),
    };
}

function writeReceipt(receiptPath, receipt, exclusive = false) {
    const contents = `${JSON.stringify(receipt, null, 2)}\n`;
    if (Buffer.byteLength(contents) > MAX_RECEIPT_BYTES) {
        throw new Error('bootstrap receipt exceeds its bound');
    }
    if (exclusive) {
        fs.writeFileSync(receiptPath, contents, {encoding: 'utf8', flag: 'wx', mode: 0o600});
        return;
    }
    const temporaryPath = `${receiptPath}.tmp`;
    fs.writeFileSync(temporaryPath, contents, {encoding: 'utf8', flag: 'wx', mode: 0o600});
    fs.renameSync(temporaryPath, receiptPath);
    fs.chmodSync(receiptPath, 0o600);
}

function resolveBootstrapAcquisition({adapter}) {
    return {
        kind: 'NPM',
        installSource: `npm:${adapter.packageName}@${adapter.packageVersion}`,
        packageRoot: null,
    };
}

function selectedAt(now) {
    const value = new Date(now ?? Date.now());
    if (!Number.isFinite(value.getTime())) throw new Error('adapter selection time is invalid');
    return value.toISOString();
}

function loadSignedAdapterSelection(options) {
    const selectionOptions = {
        adapterId: options.adapterId,
        digest: options.catalogueDigest,
        coreRoot: options.coreRoot,
        context: options.catalogueContext,
        catalogueCachePath: options.catalogueCachePath,
        catalogueTrust: options.catalogueTrust,
        now: options.now,
    };
    const adapter = loadSelectedAdapter(selectionOptions);
    const cache = inspectCatalogueCache({
        ...(options.catalogueContext ?? {}),
        coreRoot: options.coreRoot,
        catalogueCachePath: options.catalogueCachePath ??
            options.catalogueContext?.catalogueCachePath,
        catalogueTrust: options.catalogueTrust ?? options.catalogueContext?.catalogueTrust,
        now: options.now ?? options.catalogueContext?.now,
    });
    const verified = cache.verifiedEntries.get(options.catalogueDigest);
    if (cache.state !== 'GRANTED' || verified === undefined) {
        throw new Error('signed adapter selection is unavailable');
    }
    const time = selectedAt(options.now ?? options.catalogueContext?.now);
    if (
        new Date(time).getTime() < new Date(verified.catalogue.issuedAt).getTime() ||
        new Date(time).getTime() >= new Date(verified.catalogue.expiresAt).getTime()
    ) {
        throw new Error('signed adapter selection is outside catalogue validity');
    }
    return {
        adapter,
        catalogueEnvelope: verified.envelopeBytes.toString('base64'),
        catalogueEvidence: {
            catalogueId: verified.catalogue.catalogueId,
            sequence: verified.catalogue.sequence,
            keyId: verified.keyId,
            issuedAt: verified.catalogue.issuedAt,
            expiresAt: verified.catalogue.expiresAt,
            envelopeDigest: verified.envelopeDigest,
            payloadDigest: verified.payloadDigest,
            selectedAt: time,
            integrity: adapter.integrity,
        },
    };
}

function rootEntries(projectRoot) {
    return fs.readdirSync(projectRoot).sort();
}

function piEntries(projectRoot) {
    const piRoot = path.join(projectRoot, '.pi');
    if (!fs.existsSync(piRoot)) return [];
    const stat = fs.lstatSync(piRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Pi state root is unsafe');
    return fs.readdirSync(piRoot).sort();
}

function equalsEntries(actual, expected) {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function hasOnlyEntries(actual, allowed) {
    return actual.every((value) => allowed.includes(value));
}

function pathIdentity(filePath) {
    const stat = fs.lstatSync(filePath);
    const type = stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    return {device: stat.dev, inode: stat.ino, mode: stat.mode, type};
}

function sameIdentity(left, right) {
    return (
        left.device === right.device &&
        left.inode === right.inode &&
        left.mode === right.mode &&
        left.type === right.type
    );
}

function removeEmpty(directory) {
    try {
        fs.rmdirSync(directory);
    } catch (error) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
    }
}

function removeAttemptWorkspace(projectRoot, attemptId) {
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    fs.rmSync(attemptRoot, {recursive: true, force: true});
    removeEmpty(bootstrapRoot);
    removeEmpty(prismRoot);
    removeEmpty(piRoot);
}

function cleanupFailedProvision(projectRoot, attemptId, acquisition) {
    let roots;
    let pi;
    try {
        roots = rootEntries(projectRoot);
        pi = piEntries(projectRoot);
    } catch {
        return false;
    }
    const allowedPi = ['npm', 'prism-tool', 'settings.json'];
    if (!equalsEntries(roots, ['.pi']) || !hasOnlyEntries(pi, allowedPi)) {
        return false;
    }
    const paths = attemptPaths(projectRoot, attemptId);
    const cleanupRoot = path.join(paths.attemptRoot, 'cleanup-failed');
    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
    const npmRoot = path.join(projectRoot, '.pi', 'npm');
    try {
        fs.mkdirSync(cleanupRoot, {mode: 0o700});
        if (fs.existsSync(settingsPath)) {
            const identity = pathIdentity(settingsPath);
            if (identity.type !== 'file') return false;
            const quarantinedSettings = path.join(cleanupRoot, 'settings.json');
            fs.renameSync(settingsPath, quarantinedSettings);
            if (!sameIdentity(identity, pathIdentity(quarantinedSettings))) return false;
        }
        if (fs.existsSync(npmRoot)) {
            const identity = pathIdentity(npmRoot);
            if (identity.type !== 'directory') return false;
            const quarantinedNpm = path.join(cleanupRoot, 'npm');
            fs.renameSync(npmRoot, quarantinedNpm);
            if (!sameIdentity(identity, pathIdentity(quarantinedNpm))) return false;
        }
        if (!equalsEntries(piEntries(projectRoot), ['prism-tool'])) return false;
        fs.rmSync(cleanupRoot, {recursive: true, force: true});
        removeAttemptWorkspace(projectRoot, attemptId);
        return rootEntries(projectRoot).length === 0;
    } catch {
        return false;
    }
}

function attemptPaths(projectRoot, attemptId) {
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    return {
        piRoot,
        prismRoot,
        bootstrapRoot,
        attemptRoot,
        receiptPath: path.join(attemptRoot, 'adapter.json'),
    };
}

function createAttempt(
    projectRoot,
    randomUUID,
    adapter,
    acquisition,
    source,
    catalogueEnvelope,
    catalogueEvidence
) {
    const id = randomUUID();
    if (!ATTEMPT_ID.test(id)) throw new Error('bootstrap attempt ID is invalid');
    const paths = attemptPaths(projectRoot, id);
    fs.mkdirSync(paths.bootstrapRoot, {recursive: true, mode: 0o700});
    fs.chmodSync(paths.prismRoot, 0o700);
    fs.chmodSync(paths.bootstrapRoot, 0o700);
    fs.mkdirSync(paths.attemptRoot, {mode: 0o700});
    const receipt = {
        schemaVersion: RECEIPT_SCHEMA_VERSION,
        attemptId: id,
        projectRoot,
        phase: 'INSTALLING',
        source,
        adapter,
        acquisition: {
            kind: acquisition.kind,
            installSource: acquisition.installSource,
        },
        catalogueEnvelope,
        catalogueEvidence,
        settings: null,
        npmInventory: null,
        registration: null,
    };
    writeReceipt(paths.receiptPath, receipt, true);
    return {...paths, id, receipt};
}

function settingsFileEvidence(settingsPath, acquisition) {
    const contents = readRegular(settingsPath);
    const settings = JSON.parse(contents.toString('utf8'));
    if (
        !isRecord(settings) ||
        !Array.isArray(settings.packages) ||
        settings.packages.length !== 1 ||
        settings.packages[0] !== acquisition.installSource
    ) {
        throw new Error('Pi settings do not contain the exact adapter package');
    }
    return {sha256: sha256(contents), packageSource: acquisition.installSource};
}

function settingsEvidence(projectRoot, acquisition) {
    return settingsFileEvidence(path.join(projectRoot, '.pi', 'settings.json'), acquisition);
}

function assertNpmState(projectRoot, adapter) {
    const npmRoot = path.join(projectRoot, '.pi', 'npm');
    const manifest = readJson(path.join(npmRoot, 'package.json'));
    const dependencies = manifest.dependencies;
    if (
        !isRecord(dependencies) ||
        Object.keys(dependencies).length !== 1 ||
        dependencies[adapter.packageName] !== adapter.packageVersion
    ) {
        throw new Error('Pi npm manifest does not pin only the exact adapter version');
    }
    const lock = readJson(path.join(npmRoot, 'package-lock.json'));
    if (
        !Number.isSafeInteger(lock.lockfileVersion) ||
        lock.lockfileVersion < 1 ||
        lock.packages?.['']?.dependencies?.[adapter.packageName] !== adapter.packageVersion ||
        lock.packages?.[`node_modules/${adapter.packageName}`]?.version !== adapter.packageVersion ||
        lock.packages?.[`node_modules/${adapter.packageName}`]?.integrity !== adapter.integrity
    ) {
        throw new Error('Pi npm lockfile is invalid');
    }
    const ignore = readRegular(path.join(npmRoot, '.gitignore')).toString('utf8');
    if (ignore !== '*\n!.gitignore\n') throw new Error('Pi npm ignore file is invalid');
    return inventoryDirectory(npmRoot);
}

function reportFailure(projectRoot, source, attempt, reason, cleaned) {
    if (cleaned) {
        return {
            schemaVersion: 1,
            command: 'setup adapter select',
            status: 'NO-GO',
            disposition: 'INSTALL_FAILED',
            reason,
            projectRoot,
            source,
            checks: [{
                id: 'bootstrap-adapter-provisioning',
                status: 'FAIL',
                message: 'bootstrap adapter provisioning failed and owned state was cleaned',
            }],
            data: {attempt: {id: attempt.id, receiptPath: null}},
        };
    }
    return {
        schemaVersion: 1,
        command: 'setup adapter select',
        status: 'NO-GO',
        disposition: 'RECOVERY_REQUIRED',
        reason: 'AMBIGUOUS_ATTEMPT_STATE',
        projectRoot,
        source,
        checks: [{
            id: 'bootstrap-adapter-provisioning',
            status: 'FAIL',
            message: 'bootstrap state changed unexpectedly and was preserved',
        }],
        data: {
            attempt: {
                id: attempt.id,
                receiptPath: attempt.receiptPath,
            },
            recoveryPath: attempt.attemptRoot,
            nextAction: 'Inspect the retained attempt state manually before retrying setup.',
        },
    };
}

function provisionBootstrapAdapter(options) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const route = inspectSetupRoute({projectRoot, source: options.source});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        return {
            schemaVersion: 1,
            command: 'setup adapter select',
            status: 'NO-GO',
            disposition: 'STOP',
            reason: route.reason,
            projectRoot: route.projectRoot,
            source: options.source,
            checks: [{
                id: 'bootstrap-adapter-precondition',
                status: 'FAIL',
                message: 'bootstrap adapter selection requires a strict-empty root',
            }],
            data: null,
        };
    }
    const selection = loadSignedAdapterSelection(options);
    const adapter = selection.adapter;
    const acquisition = resolveBootstrapAcquisition({adapter});
    if (typeof options.piExecutable !== 'string' || !path.isAbsolute(options.piExecutable)) {
        throw new Error('authoritative Pi executable is unavailable');
    }
    if (options.networkApproved !== true) {
        throw new Error('network approval is required for npm adapter acquisition');
    }
    const attempt = createAttempt(
        projectRoot,
        options.randomUUID,
        adapter,
        acquisition,
        options.source,
        selection.catalogueEnvelope,
        selection.catalogueEvidence
    );
    if (!equalsEntries(rootEntries(projectRoot), ['.pi']) || !equalsEntries(piEntries(projectRoot), ['prism-tool'])) {
        return reportFailure(projectRoot, options.source, attempt, 'PREINSTALL_STATE_CHANGED', false);
    }
    let result;
    try {
        result = options.run(
            options.piExecutable,
            ['install', acquisition.installSource, '-l', '--approve'],
            {
                cwd: projectRoot,
                env: {
                    ...process.env,
                    ...options.env,
                    npm_config_ignore_scripts: 'true',
                    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
                    npm_config_save_exact: 'true',
                    NPM_CONFIG_SAVE_EXACT: 'true',
                },
                maxBuffer: 1048576,
                timeout: INSTALL_TIMEOUT_MS,
            }
        );
    } catch {
        return reportFailure(
            projectRoot,
            options.source,
            attempt,
            'PI_INSTALL_FAILED',
            cleanupFailedProvision(projectRoot, attempt.id, acquisition)
        );
    }
    if (result.error || result.status !== 0) {
        return reportFailure(
            projectRoot,
            options.source,
            attempt,
            'PI_INSTALL_FAILED',
            cleanupFailedProvision(projectRoot, attempt.id, acquisition)
        );
    }
    const expectedPi = ['npm', 'prism-tool', 'settings.json'];
    try {
        if (
            !equalsEntries(rootEntries(projectRoot), ['.pi']) ||
            !hasOnlyEntries(piEntries(projectRoot), expectedPi)
        ) {
            return reportFailure(projectRoot, options.source, attempt, 'POSTINSTALL_STATE_CHANGED', false);
        }
    } catch {
        return reportFailure(projectRoot, options.source, attempt, 'POSTINSTALL_STATE_UNSAFE', false);
    }
    try {
        const settings = settingsEvidence(projectRoot, acquisition);
        const npmInventory = assertNpmState(projectRoot, adapter);
        const packageRoot = path.join(
            projectRoot,
            '.pi',
            'npm',
            'node_modules',
            ...adapter.packageName.split('/')
        );
        const registration = registrationFor(packageRoot, adapter.packageName);
        validateBootstrapRegistration(registration, adapter, options.coreRoot);
        loadAdapterHandler(registration, adapter.bootstrapProtocol);
        attempt.receipt.phase = 'PROVISIONED';
        attempt.receipt.settings = settings;
        attempt.receipt.npmInventory = npmInventory;
        attempt.receipt.registration = {
            packageName: registration.packageName,
            packageVersion: registration.packageVersion,
            bootstrapProtocol: registration.bootstrapProtocol,
            packageRoot: registration.packageRoot,
            contractPath: registration.contractPath,
            handlerPath: registration.handlerPath,
        };
        writeReceipt(attempt.receiptPath, attempt.receipt);
    } catch {
        return reportFailure(
            projectRoot,
            options.source,
            attempt,
            'POSTINSTALL_VALIDATION_FAILED',
            cleanupFailedProvision(projectRoot, attempt.id, acquisition)
        );
    }
    return {
        schemaVersion: 1,
        command: 'setup adapter select',
        status: 'GO',
        disposition: 'ADAPTER_PROVISIONED',
        reason: 'ADAPTER_PROVISIONED',
        projectRoot,
        source: options.source,
        checks: [{
            id: 'bootstrap-adapter-provisioning',
            status: 'PASS',
            message: 'bootstrap adapter was provisioned and validated',
        }],
        data: {
            adapter,
            acquisition: {
                kind: acquisition.kind,
                installSource: acquisition.installSource,
            },
            attempt: {
                id: attempt.id,
                receiptPath: fs.realpathSync(attempt.receiptPath),
            },
        },
    };
}

function recoveryReport(projectRoot, attemptId, receiptPath, reason, recoveryPath = null) {
    return {
        schemaVersion: 1,
        command: 'setup adapter cleanup',
        status: 'NO-GO',
        disposition: 'RECOVERY_REQUIRED',
        reason,
        projectRoot,
        source: null,
        checks: [{
            id: 'bootstrap-adapter-cleanup',
            status: 'FAIL',
            message: 'bootstrap adapter state could not be proven safe to remove',
        }],
        data: {
            attempt: {id: attemptId, receiptPath},
            recoveryPath,
            nextAction: 'Inspect the retained attempt state manually before retrying setup.',
        },
    };
}

function exactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function parseTimestamp(value) {
    if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) {
        throw new Error('bootstrap receipt timestamp is invalid');
    }
    const parsed = new Date(value);
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
        throw new Error('bootstrap receipt timestamp is invalid');
    }
    return parsed;
}

function readCoreVersion(coreRoot) {
    const manifest = readJson(path.join(fs.realpathSync(coreRoot), 'package.json'));
    if (manifest.name !== '@kyaulabs/prism-core' || typeof manifest.version !== 'string') {
        throw new Error('core package manifest is invalid');
    }
    return manifest.version;
}

function validateReceiptEvidence(receipt, coreRoot) {
    const evidence = receipt.catalogueEvidence;
    if (!exactKeys(evidence, [
        'catalogueId', 'sequence', 'keyId', 'issuedAt', 'expiresAt',
        'envelopeDigest', 'payloadDigest', 'selectedAt', 'integrity',
    ]) || typeof receipt.catalogueEnvelope !== 'string' ||
        !BASE64.test(receipt.catalogueEnvelope) || !SHA256.test(evidence.envelopeDigest) ||
        !SHA256.test(evidence.payloadDigest) || !Number.isSafeInteger(evidence.sequence) ||
        evidence.sequence <= 0 || typeof evidence.integrity !== 'string' ||
        evidence.integrity.length === 0) {
        throw new Error('bootstrap receipt catalogue evidence is invalid');
    }
    const envelopeBytes = Buffer.from(receipt.catalogueEnvelope, 'base64');
    if (envelopeBytes.toString('base64') !== receipt.catalogueEnvelope) {
        throw new Error('bootstrap receipt catalogue evidence is invalid');
    }
    const selectionTime = parseTimestamp(evidence.selectedAt);
    const verified = verifyCatalogueEnvelope({
        bytes: envelopeBytes,
        coreRoot,
        now: selectionTime,
    });
    const catalogue = validateCataloguePayload({
        catalogue: verified.catalogue,
        now: selectionTime,
    });
    const issuedAt = parseTimestamp(catalogue.issuedAt);
    const expiresAt = parseTimestamp(catalogue.expiresAt);
    if (selectionTime.getTime() < issuedAt.getTime() || selectionTime.getTime() >= expiresAt.getTime()) {
        throw new Error('bootstrap receipt selection time is invalid');
    }
    if (
        evidence.catalogueId !== catalogue.catalogueId ||
        evidence.sequence !== catalogue.sequence ||
        evidence.keyId !== verified.keyId ||
        evidence.issuedAt !== catalogue.issuedAt ||
        evidence.expiresAt !== catalogue.expiresAt ||
        evidence.envelopeDigest !== verified.envelopeDigest ||
        evidence.payloadDigest !== verified.payloadDigest
    ) {
        throw new Error('bootstrap receipt catalogue evidence is stale');
    }
    const adapter = selectCompatibleAdapters({
        catalogue,
        coreVersion: readCoreVersion(coreRoot),
        bootstrapProtocol: 1,
    }).find((candidate) => candidate.id === receipt.adapter.id);
    if (
        adapter === undefined ||
        JSON.stringify(adapter) !== JSON.stringify(receipt.adapter) ||
        evidence.integrity !== adapter.integrity
    ) {
        throw new Error('bootstrap receipt adapter evidence is stale');
    }
    return adapter;
}

function validateLegacyReceipt(receipt, projectRoot, attemptId) {
    if (!exactKeys(receipt, [
        'schemaVersion', 'attemptId', 'projectRoot', 'phase', 'source', 'adapter',
        'acquisition', 'settings', 'npmInventory', 'registration',
    ]) || receipt.schemaVersion !== 1 || receipt.attemptId !== attemptId ||
        receipt.projectRoot !== projectRoot || receipt.phase !== 'PROVISIONED' ||
        !['BLANK', 'TEMPLATE'].includes(receipt.source) || !isRecord(receipt.adapter) ||
        !exactKeys(receipt.adapter, [
            'id', 'displayName', 'packageName', 'packageVersion', 'bootstrapProtocol',
        ]) || !ADAPTER_ID.test(receipt.adapter.id) ||
        typeof receipt.adapter.displayName !== 'string' ||
        receipt.adapter.displayName.length === 0 || receipt.adapter.displayName.length > 80 ||
        !PACKAGE_NAME.test(receipt.adapter.packageName) ||
        !EXACT_VERSION.test(receipt.adapter.packageVersion) ||
        !Number.isSafeInteger(receipt.adapter.bootstrapProtocol) ||
        receipt.adapter.bootstrapProtocol <= 0 || !isRecord(receipt.acquisition) ||
        !exactKeys(receipt.acquisition, ['kind', 'installSource']) ||
        !['LOCAL', 'NPM'].includes(receipt.acquisition.kind) ||
        typeof receipt.acquisition.installSource !== 'string' ||
        receipt.acquisition.installSource.length === 0 || !isRecord(receipt.settings) ||
        !exactKeys(receipt.settings, ['sha256', 'packageSource']) ||
        !SHA256.test(receipt.settings.sha256) ||
        receipt.settings.packageSource !== receipt.acquisition.installSource ||
        !isRecord(receipt.registration) || !exactKeys(receipt.registration, [
            'packageName', 'packageVersion', 'bootstrapProtocol', 'packageRoot',
            'contractPath', 'handlerPath',
        ]) || receipt.registration.packageName !== receipt.adapter.packageName ||
        receipt.registration.packageVersion !== receipt.adapter.packageVersion ||
        receipt.registration.bootstrapProtocol !== receipt.adapter.bootstrapProtocol ||
        !['packageRoot', 'contractPath', 'handlerPath'].every((key) =>
            typeof receipt.registration[key] === 'string' &&
            path.isAbsolute(receipt.registration[key])
        )) {
        throw new Error('legacy bootstrap receipt is invalid');
    }
    if (receipt.acquisition.kind === 'NPM') {
        if (!isRecord(receipt.npmInventory) ||
            !exactKeys(receipt.npmInventory, ['entries', 'bytes', 'sha256']) ||
            !Array.isArray(receipt.npmInventory.entries) ||
            !Number.isSafeInteger(receipt.npmInventory.bytes) ||
            receipt.npmInventory.bytes < 0 || !SHA256.test(receipt.npmInventory.sha256)) {
            throw new Error('legacy bootstrap receipt is invalid');
        }
    } else if (receipt.npmInventory !== null) {
        throw new Error('legacy bootstrap receipt is invalid');
    }
    return receipt.adapter;
}

function validateReceipt(receipt, projectRoot, attemptId, coreRoot) {
    if (!exactKeys(receipt, [
        'schemaVersion', 'attemptId', 'projectRoot', 'phase', 'source', 'adapter',
        'acquisition', 'catalogueEnvelope', 'catalogueEvidence', 'settings',
        'npmInventory', 'registration',
    ]) || receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
        receipt.attemptId !== attemptId || receipt.projectRoot !== projectRoot ||
        receipt.phase !== 'PROVISIONED' || !['BLANK', 'TEMPLATE'].includes(receipt.source) ||
        !isRecord(receipt.adapter) || !exactKeys(receipt.acquisition, ['kind', 'installSource']) ||
        receipt.acquisition.kind !== 'NPM' || !isRecord(receipt.settings) ||
        !isRecord(receipt.npmInventory) || !isRecord(receipt.registration)) {
        throw new Error('bootstrap receipt is invalid');
    }
    const adapter = validateReceiptEvidence(receipt, coreRoot);
    if (receipt.acquisition.installSource !==
        `npm:${adapter.packageName}@${adapter.packageVersion}`) {
        throw new Error('bootstrap receipt acquisition is stale');
    }
    return adapter;
}

function inspectProvisionedBootstrapAdapter({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    packageName,
    expectedSource,
    allowAppliedProject = false,
}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    if (!['BLANK', 'TEMPLATE'].includes(expectedSource)) {
        throw new Error('bootstrap adapter source is invalid');
    }
    const projectRoot = fs.realpathSync(requestedRoot);
    const paths = attemptPaths(projectRoot, attemptId);
    const receipt = readJson(paths.receiptPath);
    const adapter = validateReceipt(receipt, projectRoot, attemptId, coreRoot);
    if (receipt.source !== expectedSource || adapter.packageName !== packageName) {
        throw new Error('bootstrap adapter receipt is stale');
    }
    if (
        (
            allowAppliedProject
                ? !rootEntries(projectRoot).includes('.pi')
                : !equalsEntries(rootEntries(projectRoot), ['.pi'])
        ) ||
        !equalsEntries(piEntries(projectRoot), ['npm', 'prism-tool', 'settings.json'])
    ) {
        throw new Error('bootstrap adapter state is stale');
    }
    const settings = settingsEvidence(projectRoot, receipt.acquisition);
    if (settings.sha256 !== receipt.settings.sha256) {
        throw new Error('bootstrap adapter settings are stale');
    }
    const inventory = assertNpmState(projectRoot, adapter);
    if (
        inventory.sha256 !== receipt.npmInventory.sha256 ||
        inventory.bytes !== receipt.npmInventory.bytes
    ) {
        throw new Error('bootstrap adapter npm state is stale');
    }
    const expectedPackageRoot = fs.realpathSync(path.join(
        projectRoot,
        '.pi',
        'npm',
        'node_modules',
        ...adapter.packageName.split('/')
    ));
    if (receipt.registration.packageRoot !== expectedPackageRoot) {
        throw new Error('bootstrap adapter registration is stale');
    }
    const registration = registrationFor(expectedPackageRoot, adapter.packageName);
    validateBootstrapRegistration(registration, adapter, coreRoot);
    const registrationReceipt = {
        packageName: registration.packageName,
        packageVersion: registration.packageVersion,
        bootstrapProtocol: registration.bootstrapProtocol,
        packageRoot: registration.packageRoot,
        contractPath: registration.contractPath,
        handlerPath: registration.handlerPath,
    };
    if (JSON.stringify(receipt.registration) !== JSON.stringify(registrationReceipt)) {
        throw new Error('bootstrap adapter registration is stale');
    }
    return Object.freeze({
        adapter: Object.freeze({...adapter}),
        handler: loadAdapterHandler(registration, adapter.bootstrapProtocol),
        receipt: Object.freeze(receipt),
        registration: Object.freeze(registration),
    });
}

function inspectProvisionedBootstrapAttempt({projectRoot, coreRoot, attemptId}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const canonicalRoot = fs.realpathSync(projectRoot);
    const receipt = readJson(attemptPaths(canonicalRoot, attemptId).receiptPath);
    const adapter = validateReceipt(receipt, canonicalRoot, attemptId, coreRoot);
    return inspectProvisionedBootstrapAdapter({
        projectRoot: canonicalRoot,
        coreRoot,
        attemptId,
        packageName: adapter.packageName,
        expectedSource: receipt.source,
    });
}

function inspectBootstrapAdapterReceipt({
    projectRoot,
    coreRoot,
    attemptId,
    allowAppliedProject = false,
}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const canonicalRoot = fs.realpathSync(projectRoot);
    const receipt = readJson(attemptPaths(canonicalRoot, attemptId).receiptPath);
    if (receipt.schemaVersion === RECEIPT_SCHEMA_VERSION) {
        const adapter = validateReceipt(receipt, canonicalRoot, attemptId, coreRoot);
        const selected = inspectProvisionedBootstrapAdapter({
            projectRoot: canonicalRoot,
            coreRoot,
            attemptId,
            packageName: adapter.packageName,
            expectedSource: receipt.source,
            allowAppliedProject,
        });
        return Object.freeze({
            kind: 'SIGNED',
            adapter: Object.freeze({
                id: selected.adapter.id,
                packageName: selected.adapter.packageName,
                packageVersion: selected.adapter.packageVersion,
                bootstrapProtocol: selected.adapter.bootstrapProtocol,
            }),
            adapterEvidence: Object.freeze({...selected.receipt.catalogueEvidence}),
            receipt: selected.receipt,
        });
    }
    if (receipt.schemaVersion === 1) {
        const adapter = validateLegacyReceipt(receipt, canonicalRoot, attemptId);
        return Object.freeze({
            kind: 'LEGACY_UNSIGNED',
            adapter: Object.freeze({
                id: adapter.id,
                packageName: adapter.packageName,
                packageVersion: adapter.packageVersion,
                bootstrapProtocol: adapter.bootstrapProtocol,
            }),
            adapterEvidence: null,
            receipt: Object.freeze(receipt),
        });
    }
    throw new Error('bootstrap receipt is unsupported');
}

function loadActiveBootstrapAdapter({projectRoot, identity}) {
    const registration = discoverAdapter({projectRoot});
    if (
        !exactKeys(identity, ['id', 'packageName', 'packageVersion', 'bootstrapProtocol']) ||
        registration.packageName !== identity.packageName ||
        registration.packageVersion !== identity.packageVersion ||
        registration.bootstrapProtocol !== identity.bootstrapProtocol
    ) {
        throw new Error('active adapter does not match bootstrap evidence');
    }
    return Object.freeze({
        handler: loadAdapterHandler(registration, identity.bootstrapProtocol),
        registration,
    });
}

function cleanupBootstrapAdapter({projectRoot: requestedRoot, coreRoot, attemptId}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const projectRoot = fs.realpathSync(requestedRoot);
    const paths = attemptPaths(projectRoot, attemptId);
    let receipt;
    try {
        receipt = readJson(paths.receiptPath);
        if (receipt.schemaVersion === RECEIPT_SCHEMA_VERSION) {
            validateReceipt(receipt, projectRoot, attemptId, coreRoot);
        } else if (receipt.schemaVersion === 1) {
            validateLegacyReceipt(receipt, projectRoot, attemptId);
        } else {
            throw new Error('bootstrap receipt is unsupported');
        }
        if (fs.readdirSync(paths.attemptRoot).join(',') !== 'adapter.json') {
            return recoveryReport(
                projectRoot,
                attemptId,
                paths.receiptPath,
                receipt.schemaVersion === 1
                    ? 'DURABLE_OR_AMBIGUOUS_LEGACY_STATE'
                    : 'STATE_CHANGED'
            );
        }
    } catch {
        return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'INVALID_RECEIPT');
    }
    const expectedPi = receipt.acquisition.kind === 'NPM'
        ? ['npm', 'prism-tool', 'settings.json']
        : ['prism-tool', 'settings.json'];
    try {
        if (
            !equalsEntries(rootEntries(projectRoot), ['.pi']) ||
            !hasOnlyEntries(piEntries(projectRoot), expectedPi)
        ) {
            return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'STATE_CHANGED');
        }
    } catch {
        return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'STATE_UNSAFE');
    }
    let settingsIdentity;
    let npmIdentity = null;
    try {
        const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
        settingsIdentity = pathIdentity(settingsPath);
        const settings = settingsEvidence(projectRoot, receipt.acquisition);
        if (settings.sha256 !== receipt.settings.sha256) throw new Error('settings changed');
        if (receipt.acquisition.kind === 'NPM') {
            const npmRoot = path.join(projectRoot, '.pi', 'npm');
            npmIdentity = pathIdentity(npmRoot);
            const inventory = inventoryDirectory(npmRoot);
            if (
                inventory.sha256 !== receipt.npmInventory.sha256 ||
                inventory.bytes !== receipt.npmInventory.bytes
            ) {
                throw new Error('npm inventory changed');
            }
        } else if (receipt.npmInventory !== null || fs.existsSync(path.join(projectRoot, '.pi', 'npm'))) {
            throw new Error('local acquisition state changed');
        }
    } catch {
        return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'STATE_CHANGED');
    }
    const cleanupRoot = path.join(paths.attemptRoot, 'cleanup');
    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
    const npmRoot = path.join(projectRoot, '.pi', 'npm');
    try {
        fs.mkdirSync(cleanupRoot, {mode: 0o700});
        const quarantinedSettings = path.join(cleanupRoot, 'settings.json');
        fs.renameSync(settingsPath, quarantinedSettings);
        if (
            !sameIdentity(settingsIdentity, pathIdentity(quarantinedSettings)) ||
            settingsFileEvidence(quarantinedSettings, receipt.acquisition).sha256 !==
                receipt.settings.sha256
        ) {
            return recoveryReport(
                projectRoot,
                attemptId,
                paths.receiptPath,
                'STATE_CHANGED_AFTER_QUARANTINE',
                cleanupRoot
            );
        }
        if (receipt.acquisition.kind === 'NPM') {
            const quarantinedNpm = path.join(cleanupRoot, 'npm');
            fs.renameSync(npmRoot, quarantinedNpm);
            const inventory = inventoryDirectory(quarantinedNpm);
            if (
                !sameIdentity(npmIdentity, pathIdentity(quarantinedNpm)) ||
                inventory.sha256 !== receipt.npmInventory.sha256 ||
                inventory.bytes !== receipt.npmInventory.bytes
            ) {
                return recoveryReport(
                    projectRoot,
                    attemptId,
                    paths.receiptPath,
                    'STATE_CHANGED_AFTER_QUARANTINE',
                    cleanupRoot
                );
            }
        }
        if (!equalsEntries(piEntries(projectRoot), ['prism-tool'])) {
            return recoveryReport(
                projectRoot,
                attemptId,
                paths.receiptPath,
                'STATE_CHANGED_AFTER_QUARANTINE',
                cleanupRoot
            );
        }
        fs.rmSync(cleanupRoot, {recursive: true, force: true});
        fs.unlinkSync(paths.receiptPath);
        removeEmpty(paths.attemptRoot);
        removeEmpty(paths.bootstrapRoot);
        removeEmpty(paths.prismRoot);
        removeEmpty(paths.piRoot);
    } catch {
        return recoveryReport(
            projectRoot,
            attemptId,
            paths.receiptPath,
            'CLEANUP_INTERRUPTED',
            fs.existsSync(cleanupRoot) ? cleanupRoot : null
        );
    }
    try {
        if (rootEntries(projectRoot).length !== 0) {
            return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'ROOT_NOT_EMPTY');
        }
    } catch {
        return recoveryReport(projectRoot, attemptId, paths.receiptPath, 'ROOT_STATE_UNSAFE');
    }
    return {
        schemaVersion: 1,
        command: 'setup adapter cleanup',
        status: 'GO',
        disposition: 'CLEANED',
        reason: 'ATTEMPT_CLEANED',
        projectRoot,
        source: null,
        checks: [{
            id: 'bootstrap-adapter-cleanup',
            status: 'PASS',
            message: 'provisional bootstrap adapter state was removed',
        }],
        data: {attempt: {id: attemptId, receiptPath: null}},
    };
}

module.exports = {
    cleanupBootstrapAdapter,
    inspectBootstrapAdapterReceipt,
    inspectProvisionedBootstrapAdapter,
    inspectProvisionedBootstrapAttempt,
    loadActiveBootstrapAdapter,
    provisionBootstrapAdapter,
    resolveBootstrapAcquisition,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
