// $KYAULabs: bootstrap-adapter.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    discoverAdapter,
    loadAdapterHandler,
    registrationFor,
    validateBootstrapRegistration,
} = require('./discovery');
const {inspectSetupRoute} = require('./setup-route');
const {loadSupportedAdapterCatalogue} = require('./supported-adapters');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_INVENTORY_ENTRIES = 4096;
const MAX_JSON_BYTES = 1048576;

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

function inventoryTree(root) {
    const entries = [];
    function walk(relativeRoot) {
        const absoluteRoot = relativeRoot === '' ? root : path.join(root, relativeRoot);
        for (const name of fs.readdirSync(absoluteRoot).sort()) {
            const relativePath = relativeRoot === '' ? name : path.join(relativeRoot, name);
            const absolutePath = path.join(root, relativePath);
            const stat = fs.lstatSync(absolutePath);
            let type;
            if (stat.isDirectory()) type = 'directory';
            else if (stat.isFile()) type = 'file';
            else if (stat.isSymbolicLink()) type = 'symlink';
            else throw new Error('bootstrap inventory contains an unsupported file type');
            entries.push({path: relativePath, type});
            if (entries.length > MAX_INVENTORY_ENTRIES) {
                throw new Error('bootstrap inventory is too large');
            }
            if (type === 'directory') walk(relativePath);
        }
    }
    walk('');
    return entries;
}

function createdInventory(projectRoot, baseline) {
    const baselinePaths = new Set(baseline.map((entry) => entry.path));
    return inventoryTree(projectRoot).filter((entry) => !baselinePaths.has(entry.path));
}

function isAttemptOwned(entry, adapter, acquisition) {
    const metadataRoot = path.join('.pi', 'prism-tool');
    const settingsPath = path.join('.pi', 'settings.json');
    if (entry.path === '.pi' || entry.path === settingsPath) return true;
    if (entry.path === metadataRoot || entry.path.startsWith(`${metadataRoot}${path.sep}`)) {
        return true;
    }
    if (acquisition.kind !== 'NPM') return false;
    const npmRoot = path.join('.pi', 'npm');
    const nodeModulesRoot = path.join(npmRoot, 'node_modules');
    const packageRoot = path.join(nodeModulesRoot, ...adapter.packageName.split('/'));
    const exact = new Set([
        npmRoot,
        path.join(npmRoot, '.gitignore'),
        path.join(npmRoot, 'package.json'),
        path.join(npmRoot, 'package-lock.json'),
        nodeModulesRoot,
        path.join(nodeModulesRoot, '.package-lock.json'),
        path.dirname(packageRoot),
        packageRoot,
    ]);
    return exact.has(entry.path) || entry.path.startsWith(`${packageRoot}${path.sep}`);
}

function attemptInventory(projectRoot, baseline, adapter, acquisition) {
    return createdInventory(projectRoot, baseline).filter((entry) =>
        isAttemptOwned(entry, adapter, acquisition)
    );
}

function cleanupCreatedInventory(projectRoot, baseline, adapter, acquisition) {
    const entries = attemptInventory(projectRoot, baseline, adapter, acquisition).sort((left, right) => {
        const depth = (value) => value.path.split(path.sep).length;
        return depth(right) - depth(left) || right.path.localeCompare(left.path);
    });
    for (const entry of entries) {
        const absolutePath = path.join(projectRoot, entry.path);
        if (entry.type === 'directory') {
            try {
                fs.rmdirSync(absolutePath);
            } catch (error) {
                if (error.code !== 'ENOTEMPTY') throw error;
            }
        } else fs.unlinkSync(absolutePath);
    }
}

function writeReceipt(receiptPath, receipt) {
    const temporaryPath = `${receiptPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    fs.renameSync(temporaryPath, receiptPath);
    fs.chmodSync(receiptPath, 0o600);
}

function createAttempt(projectRoot, randomUUID, adapter, acquisition, source) {
    const id = randomUUID();
    if (!ATTEMPT_ID.test(id)) throw new Error('bootstrap attempt ID is invalid');
    const stateRoot = path.join(projectRoot, '.pi', 'prism-tool');
    const bootstrapRoot = path.join(stateRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, id);
    fs.mkdirSync(bootstrapRoot, {recursive: true, mode: 0o700});
    fs.chmodSync(stateRoot, 0o700);
    fs.chmodSync(bootstrapRoot, 0o700);
    fs.mkdirSync(attemptRoot, {mode: 0o700});
    const receiptPath = path.join(attemptRoot, 'adapter.json');
    const receipt = {
        schemaVersion: 1,
        attemptId: id,
        phase: 'STARTED',
        source,
        adapter,
        acquisition: {
            kind: acquisition.kind,
            installSource: acquisition.installSource,
        },
        inventory: [],
    };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
    });
    return {
        id,
        receiptPath,
        receipt,
        cleanupPaths: [attemptRoot, bootstrapRoot, stateRoot, path.join(projectRoot, '.pi')],
    };
}

function removeEmptyDirectories(paths) {
    for (const directory of paths) {
        try {
            fs.rmdirSync(directory);
        } catch (error) {
            if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
        }
    }
}

function cleanupAttempt(attempt) {
    try {
        fs.unlinkSync(attempt.receiptPath);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    removeEmptyDirectories(attempt.cleanupPaths);
}

function readStrictJson(filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) {
        throw new Error('Pi state file is invalid');
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertPiState(projectRoot, adapter, acquisition) {
    const settings = readStrictJson(path.join(projectRoot, '.pi', 'settings.json'));
    if (
        !Array.isArray(settings.packages) ||
        settings.packages.length !== 1 ||
        settings.packages[0] !== acquisition.installSource
    ) {
        throw new Error('Pi settings do not contain the exact adapter package');
    }
    if (acquisition.kind === 'LOCAL') return;
    const npmManifest = readStrictJson(path.join(projectRoot, '.pi', 'npm', 'package.json'));
    if (npmManifest.dependencies?.[adapter.packageName] !== adapter.packageVersion) {
        throw new Error('Pi npm manifest does not pin the exact adapter version');
    }
    const lock = readStrictJson(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'));
    if (
        !Number.isSafeInteger(lock.lockfileVersion) ||
        lock.lockfileVersion < 1 ||
        lock.packages?.['']?.dependencies?.[adapter.packageName] !== adapter.packageVersion ||
        lock.packages?.[`node_modules/${adapter.packageName}`]?.version !== adapter.packageVersion
    ) {
        throw new Error('Pi npm lockfile is invalid');
    }
    const ignore = fs.readFileSync(path.join(projectRoot, '.pi', 'npm', '.gitignore'), 'utf8');
    if (ignore !== '*\n!.gitignore\n') throw new Error('Pi npm ignore file is invalid');
}

function provisionBootstrapAdapter(options) {
    const projectRoot = fs.realpathSync(options.projectRoot);
    const route = inspectSetupRoute({projectRoot, source: options.source});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        throw new Error('bootstrap adapter provisioning requires a strict-empty root');
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
    const baseline = inventoryTree(projectRoot);
    const attempt = createAttempt(
        projectRoot,
        options.randomUUID,
        adapter,
        acquisition,
        options.source
    );
    try {
        const installArgs = ['install', acquisition.installSource, '-l', '--approve'];
        const result = options.run(options.piExecutable, installArgs, {
            cwd: projectRoot,
            env: {
                ...process.env,
                npm_config_ignore_scripts: 'true',
                NPM_CONFIG_IGNORE_SCRIPTS: 'true',
            },
            shell: false,
        });
        if (result.error || result.status !== 0) {
            throw new Error('Pi adapter installation failed');
        }
        attempt.receipt.phase = 'INSTALLED';
        attempt.receipt.inventory = attemptInventory(projectRoot, baseline, adapter, acquisition);
        writeReceipt(attempt.receiptPath, attempt.receipt);
        assertPiState(projectRoot, adapter, acquisition);
        const registration = discoverAdapter({
            projectRoot,
            piDir: path.join(projectRoot, '.pi'),
        });
        validateBootstrapRegistration(registration, adapter, options.coreRoot);
        loadAdapterHandler(registration, adapter.bootstrapProtocol);
        attempt.receipt.phase = 'PROVISIONED';
        writeReceipt(attempt.receiptPath, attempt.receipt);
    } catch (error) {
        try {
            cleanupCreatedInventory(projectRoot, baseline, adapter, acquisition);
        } catch {
            cleanupAttempt(attempt);
        }
        throw error;
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

module.exports = {provisionBootstrapAdapter, resolveBootstrapAcquisition};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
