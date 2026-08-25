// $KYAULabs: bootstrap-adapter.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    loadAdapterHandler,
    registrationFor,
    validateBootstrapRegistration,
} = require('./discovery');
const {inspectSetupRoute} = require('./setup-route');
const {loadSupportedAdapterCatalogue} = require('./supported-adapters');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INSTALL_TIMEOUT_MS = 300000;
const MAX_INVENTORY_BYTES = 268435456;
const MAX_INVENTORY_ENTRIES = 20000;
const MAX_RECEIPT_BYTES = 1048576;
const RECEIPT_SCHEMA_VERSION = 1;

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

function checkoutAdapterRoot(coreRoot) {
    const canonicalCore = fs.realpathSync(coreRoot);
    const packagesRoot = path.dirname(canonicalCore);
    if (path.basename(canonicalCore) !== 'prism-core' || path.basename(packagesRoot) !== 'packages') {
        return null;
    }
    return path.join(packagesRoot, 'prism-php-web');
}

function resolveBootstrapAcquisition({coreRoot, adapter}) {
    const localRoot = checkoutAdapterRoot(coreRoot);
    if (localRoot && fs.existsSync(localRoot)) {
        try {
            const registration = registrationFor(localRoot, adapter.packageName);
            if (
                registration.packageVersion !== adapter.packageVersion ||
                registration.bootstrapProtocol !== adapter.bootstrapProtocol
            ) {
                throw new Error('co-shipped adapter registration mismatch');
            }
            return {
                kind: 'LOCAL',
                installSource: fs.realpathSync(localRoot),
                packageRoot: fs.realpathSync(localRoot),
            };
        } catch {
            throw new Error('co-shipped adapter is incompatible');
        }
    }
    return {
        kind: 'NPM',
        installSource: `npm:${adapter.packageName}@${adapter.packageVersion}`,
        packageRoot: null,
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
    const allowedPi = acquisition.kind === 'NPM'
        ? ['npm', 'prism-tool', 'settings.json']
        : ['prism-tool', 'settings.json'];
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

function createAttempt(projectRoot, randomUUID, adapter, acquisition, source) {
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
        lock.packages?.[`node_modules/${adapter.packageName}`]?.version !== adapter.packageVersion
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
    const supported = loadSupportedAdapterCatalogue({
        coreRoot: options.coreRoot,
        catalogue: options.catalogue,
    });
    const adapter = supported.adapters.find(({id}) => id === options.adapterId);
    if (!adapter) throw new Error('bootstrap adapter selection is unsupported');
    const acquisition = resolveBootstrapAcquisition({coreRoot: options.coreRoot, adapter});
    if (typeof options.piExecutable !== 'string' || !path.isAbsolute(options.piExecutable)) {
        throw new Error('authoritative Pi executable is unavailable');
    }
    if (acquisition.kind === 'NPM' && options.networkApproved !== true) {
        throw new Error('network approval is required for npm adapter acquisition');
    }
    const attempt = createAttempt(projectRoot, options.randomUUID, adapter, acquisition, options.source);
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
    const expectedPi = acquisition.kind === 'NPM'
        ? ['npm', 'prism-tool', 'settings.json']
        : ['prism-tool', 'settings.json'];
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
        const npmInventory = acquisition.kind === 'NPM'
            ? assertNpmState(projectRoot, adapter)
            : null;
        if (acquisition.kind === 'LOCAL' && fs.existsSync(path.join(projectRoot, '.pi', 'npm'))) {
            throw new Error('local adapter acquisition created unexpected npm state');
        }
        const packageRoot = acquisition.kind === 'LOCAL'
            ? acquisition.packageRoot
            : path.join(
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

function validateReceipt(receipt, projectRoot, attemptId) {
    const expectedKeys = [
        'schemaVersion', 'attemptId', 'projectRoot', 'phase', 'source', 'adapter',
        'acquisition', 'settings', 'npmInventory', 'registration',
    ].sort();
    const actualKeys = Object.keys(receipt).sort();
    if (
        actualKeys.length !== expectedKeys.length ||
        !actualKeys.every((key, index) => key === expectedKeys[index]) ||
        receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
        receipt.attemptId !== attemptId ||
        receipt.projectRoot !== projectRoot ||
        receipt.phase !== 'PROVISIONED' ||
        !isRecord(receipt.adapter) ||
        !isRecord(receipt.acquisition) ||
        !isRecord(receipt.settings) ||
        !isRecord(receipt.registration)
    ) {
        throw new Error('bootstrap receipt is invalid');
    }
}

function inspectProvisionedBootstrapAdapter({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    packageName,
}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const projectRoot = fs.realpathSync(requestedRoot);
    const paths = attemptPaths(projectRoot, attemptId);
    const receipt = readJson(paths.receiptPath);
    validateReceipt(receipt, projectRoot, attemptId);
    const catalogue = loadSupportedAdapterCatalogue({coreRoot});
    const adapter = catalogue.adapters.find((candidate) => candidate.packageName === packageName);
    if (
        !adapter ||
        receipt.source !== 'BLANK' ||
        !isRecord(receipt.acquisition) ||
        Object.keys(receipt.acquisition).sort().join(',') !== 'installSource,kind' ||
        !['LOCAL', 'NPM'].includes(receipt.acquisition.kind) ||
        typeof receipt.acquisition.installSource !== 'string' ||
        JSON.stringify(receipt.adapter) !== JSON.stringify(adapter)
    ) {
        throw new Error('bootstrap adapter receipt is stale');
    }
    const expectedPi = receipt.acquisition.kind === 'NPM'
        ? ['npm', 'prism-tool', 'settings.json']
        : ['prism-tool', 'settings.json'];
    if (
        !equalsEntries(rootEntries(projectRoot), ['.pi']) ||
        !equalsEntries(piEntries(projectRoot), expectedPi)
    ) {
        throw new Error('bootstrap adapter state is stale');
    }
    const settings = settingsEvidence(projectRoot, receipt.acquisition);
    if (settings.sha256 !== receipt.settings.sha256) {
        throw new Error('bootstrap adapter settings are stale');
    }
    if (receipt.acquisition.kind === 'NPM') {
        const inventory = assertNpmState(projectRoot, adapter);
        if (
            !isRecord(receipt.npmInventory) ||
            inventory.sha256 !== receipt.npmInventory.sha256 ||
            inventory.bytes !== receipt.npmInventory.bytes
        ) {
            throw new Error('bootstrap adapter npm state is stale');
        }
    } else if (
        receipt.npmInventory !== null ||
        fs.existsSync(path.join(projectRoot, '.pi', 'npm'))
    ) {
        throw new Error('bootstrap adapter acquisition state is stale');
    }
    const registration = registrationFor(receipt.registration.packageRoot, adapter.packageName);
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

function cleanupBootstrapAdapter({projectRoot: requestedRoot, attemptId}) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    const projectRoot = fs.realpathSync(requestedRoot);
    const paths = attemptPaths(projectRoot, attemptId);
    let receipt;
    try {
        receipt = readJson(paths.receiptPath);
        validateReceipt(receipt, projectRoot, attemptId);
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
                !isRecord(receipt.npmInventory) ||
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
    inspectProvisionedBootstrapAdapter,
    provisionBootstrapAdapter,
    resolveBootstrapAcquisition,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
