// $KYAULabs: check.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {digestJson} = require('./canonical-json');
const {CORE_GATE_IDS, createQualityCallbacks, runCoreQuality} = require('./core-quality');
const {packageIdentity} = require('./package-identity');
const {resolveQualityProvider, validateQualityReport} = require('./quality-provider');
const {discoverOptionalAdapter} = require('../prism-tool/discovery');
const {
    REVIEW_STATE,
    inspectAuthorityRecord,
    publishAuthorityRecord,
} = require('./review-state');
const {safeRelativePath} = require('./schema');

const FILE_LIMIT = 131072;
const OUTPUT_LIMIT = 1048576;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const decoder = new TextDecoder('utf-8', {fatal: true});

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
        throw new Error(`${label} is invalid`);
    }
}

function boundedText(value, pattern, label) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256 ||
        !pattern.test(value) || /[\x00-\x1f\x7f]/.test(value)) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function parseQualityIdentity(value) {
    exact(value, ['packageName', 'packageVersion'], 'Core quality identity');
    return {
        packageName: boundedText(value.packageName, PACKAGE_NAME, 'check package name'),
        packageVersion: boundedText(value.packageVersion, VERSION, 'check package version'),
    };
}

function parseCoreIdentity(value) {
    exact(value, ['name', 'version', 'digest', 'sourceClass'], 'check Core identity');
    if (!SHA256.test(value.digest ?? '') || value.sourceClass !== 'INSTALLED_EXTERNAL') {
        throw new Error('check Core identity is invalid');
    }
    return {
        name: boundedText(value.name, PACKAGE_NAME, 'check package name'),
        version: boundedText(value.version, VERSION, 'check package version'),
        digest: value.digest,
        sourceClass: value.sourceClass,
    };
}

function parseIdentity(value) {
    const keys = ['id', 'packageName', 'packageVersion', 'protocolVersion', 'gates', 'sourceClass'];
    exact(value, keys, 'check adapter identity');
    const identity = {
        packageName: boundedText(value.packageName, PACKAGE_NAME, 'check package name'),
        packageVersion: boundedText(value.packageVersion, VERSION, 'check package version'),
    };
    if (!ID.test(value.id ?? '') || value.protocolVersion !== 1 ||
        value.sourceClass !== 'INSTALLED_EXTERNAL' || !Array.isArray(value.gates) ||
        value.gates.length === 0 || value.gates.length > 64 ||
        value.gates.some((id) => !ID.test(id)) ||
        new Set(value.gates).size !== value.gates.length ||
        value.gates.some((id, index) => index > 0 && value.gates[index - 1] > id)) {
        throw new Error('check adapter identity is invalid');
    }
    return {...identity, id: value.id, protocolVersion: 1, gates: [...value.gates], sourceClass: value.sourceClass};
}

function parseDigest(value, label, maximum) {
    exact(value, ['bytes', 'sha256'], label);
    if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > maximum ||
        !SHA256.test(value.sha256)) throw new Error(`${label} is invalid`);
    return {...value};
}

function parseGate(value) {
    exact(value, ['id', 'status', 'command', 'tools', 'stdout', 'stderr', 'artifacts'], 'check gate');
    if (!ID.test(value.id ?? '') || !['PASS', 'FAIL', 'SKIPPED'].includes(value.status) ||
        !Array.isArray(value.command) || value.command.length === 0 || value.command.length > 128 ||
        value.command.some((token) => typeof token !== 'string' || token.length === 0 ||
            Buffer.byteLength(token) > 4096 || /[\x00-\x1f\x7f]/.test(token) || path.isAbsolute(token)) ||
        !Array.isArray(value.tools) || value.tools.length > 32 ||
        !Array.isArray(value.artifacts) || value.artifacts.length > 32) {
        throw new Error('check gate is invalid');
    }
    const tools = value.tools.map((tool) => {
        exact(tool, ['id', 'version'], 'check gate tool');
        if (!ID.test(tool.id ?? '') || !VERSION.test(tool.version ?? '')) {
            throw new Error('check gate tool is invalid');
        }
        return {...tool};
    });
    const artifacts = value.artifacts.map((artifact) => {
        exact(artifact, ['path', 'bytes', 'sha256'], 'check gate artifact');
        safeRelativePath(artifact.path, 'check gate artifact path');
        return {path: artifact.path, ...parseDigest({bytes: artifact.bytes, sha256: artifact.sha256},
            'check gate artifact', 262144)};
    });
    if (new Set(tools.map(({id}) => id)).size !== tools.length ||
        new Set(artifacts.map(({path: artifactPath}) => artifactPath)).size !== artifacts.length) {
        throw new Error('check gate evidence contains duplicates');
    }
    return {
        id: value.id,
        status: value.status,
        command: [...value.command],
        tools,
        stdout: parseDigest(value.stdout, 'check gate stdout', OUTPUT_LIMIT),
        stderr: parseDigest(value.stderr, 'check gate stderr', OUTPUT_LIMIT),
        artifacts,
    };
}

function parseCheck(value) {
    exact(value, [
        'schemaVersion', 'kind', 'attemptId', 'status', 'branch', 'baseRef', 'baseSha', 'headSha',
        'core', 'adapter', 'gates',
    ], 'check record');
    if (value.schemaVersion !== 1 || value.kind !== 'check' ||
        !/^[0-9a-f]{32}$/.test(value.attemptId ?? '') ||
        !['RUNNING', 'PASS', 'FAIL'].includes(value.status) ||
        !OBJECT_ID.test(value.baseSha ?? '') || !OBJECT_ID.test(value.headSha ?? '') ||
        !Array.isArray(value.gates) || value.gates.length > 128) {
        throw new Error('check record is invalid');
    }
    const branch = boundedText(value.branch, BRANCH, 'check branch');
    const baseRef = boundedText(value.baseRef, BRANCH, 'check base reference');
    const core = parseCoreIdentity(value.core);
    const adapter = value.adapter === null ? null : parseIdentity(value.adapter, true);
    const gates = value.gates.map(parseGate);
    const ids = gates.map(({id}) => id);
    const expectedGates = [...CORE_GATE_IDS, ...(adapter?.gates ?? [])];
    if (new Set(ids).size !== ids.length || (value.status === 'RUNNING' && gates.length !== 0) ||
        (value.status === 'PASS' && (gates.some(({status}) => status === 'FAIL') ||
            gates.length !== expectedGates.length ||
            expectedGates.some((id, index) => ids[index] !== id)))) {
        throw new Error('check gate state is invalid');
    }
    return {
        schemaVersion: 1,
        kind: 'check',
        attemptId: value.attemptId,
        status: value.status,
        branch,
        baseRef,
        baseSha: value.baseSha,
        headSha: value.headSha,
        core,
        adapter,
        gates,
    };
}

function checkDigest(record) {
    return digestJson(parseCheck(record));
}

function projectRoot(context) {
    const requested = path.resolve(context.projectRoot ?? context.cwd ?? process.cwd());
    const identity = fs.lstatSync(requested);
    if (!identity.isDirectory() || identity.isSymbolicLink() || fs.realpathSync(requested) !== requested) {
        throw new Error('check repository is invalid');
    }
    return requested;
}

function runGit(context, args, maximum = OUTPUT_LIMIT) {
    const result = (context.runGit ?? childProcess.spawnSync)('git', args, {
        cwd: projectRoot(context),
        env: context.env ?? process.env,
        encoding: null,
        maxBuffer: maximum + 1,
        timeout: 30000,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    if (result.error || result.status !== 0 || stdout.length > maximum) {
        throw new Error('check Git evidence is unavailable');
    }
    return stdout;
}

function gitText(context, args, label) {
    let value;
    try {
        value = decoder.decode(runGit(context, args)).trim();
    } catch (error) {
        throw new Error(`${label} is unavailable`, {cause: error});
    }
    if (value === '' || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${label} is invalid`);
    return value;
}

function snapshot(input, context) {
    exact(input, ['baseRef'], 'check request');
    const baseRef = boundedText(input.baseRef, BRANCH, 'check base reference');
    const branch = gitText(context, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'check branch');
    boundedText(branch, BRANCH, 'check branch');
    const baseSha = gitText(context, ['rev-parse', '--verify', `${baseRef}^{commit}`], 'check base');
    const headSha = gitText(context, ['rev-parse', '--verify', 'HEAD^{commit}'], 'check HEAD');
    if (!OBJECT_ID.test(baseSha) || !OBJECT_ID.test(headSha)) throw new Error('check object identity is invalid');
    runGit(context, ['merge-base', '--is-ancestor', baseSha, headSha]);
    const status = runGit(context, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    if (status.length !== 0) throw new Error('check repository is dirty');
    return {branch, baseRef, baseSha, headSha};
}

function sameSnapshot(expected, context) {
    try {
        const actual = snapshot({baseRef: expected.baseRef}, context);
        return ['branch', 'baseRef', 'baseSha', 'headSha'].every((key) => actual[key] === expected[key]);
    } catch {
        return false;
    }
}

function coreIdentity(context) {
    const identify = context.packageIdentity ?? packageIdentity;
    return parseCoreIdentity(identify(
        fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..')),
        context.sourceClass ?? 'INSTALLED_EXTERNAL'
    ));
}

function inspectCheck(context = {}) {
    return inspectAuthorityRecord({
        projectRoot: projectRoot(context),
        filename: 'check.json',
        limit: FILE_LIMIT,
        parse: parseCheck,
    }, context);
}

function publish(record, context) {
    return publishAuthorityRecord({
        projectRoot: projectRoot(context),
        filename: 'check.json',
        limit: FILE_LIMIT,
        record: parseCheck(record),
        parse: parseCheck,
    }, context).record;
}

async function runDeterministicCheck(input, context = {}) {
    const identity = snapshot(input, context);
    const core = coreIdentity(context);
    const attemptId = (context.randomBytes ?? crypto.randomBytes)(16).toString('hex');
    const prior = inspectCheck(context);
    if (![REVIEW_STATE.ABSENT, REVIEW_STATE.VALID].includes(prior.state)) {
        throw new Error('check receipt is unsafe');
    }
    let running = parseCheck({
        schemaVersion: 1,
        kind: 'check',
        attemptId,
        status: 'RUNNING',
        ...identity,
        core,
        adapter: prior.state === REVIEW_STATE.VALID ? prior.record.adapter : null,
        gates: [],
    });
    publish(running, context);
    let gates = [];
    try {
        let provider = null;
        let adapter = null;
        if (context.registration !== null && context.registration !== undefined) {
            const resolveProvider = context.resolveQualityProvider ?? resolveQualityProvider;
            provider = await resolveProvider({
                repositoryRoot: projectRoot(context),
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                protectedBase: identity.baseSha,
                registration: context.registration,
                resolvePackage: context.resolvePackage,
                run: context.runGit,
                env: context.env,
            });
            adapter = parseIdentity(provider.identity);
        }
        running = parseCheck({
            schemaVersion: 1,
            kind: 'check',
            attemptId,
            status: 'RUNNING',
            ...identity,
            core,
            adapter,
            gates: [],
        });
        publish(running, context);
        const runCore = context.runCoreQuality ?? runCoreQuality;
        const coreReport = await runCore({...identity}, {
            ...context,
            verifySnapshot: () => sameSnapshot(identity, context),
        });
        exact(coreReport, ['schemaVersion', 'core', 'status', 'gates'], 'Core quality report');
        if (coreReport.schemaVersion !== 1 ||
            JSON.stringify(parseQualityIdentity(coreReport.core)) !== JSON.stringify({
                packageName: core.name,
                packageVersion: core.version,
            }) || !Array.isArray(coreReport.gates) || coreReport.gates.length !== CORE_GATE_IDS.length) {
            throw new Error('Core quality report is invalid');
        }
        gates = coreReport.gates.map(parseGate);
        if (coreReport.status !== 'PASS' || gates.some(({id}, index) => id !== CORE_GATE_IDS[index]) ||
            gates.some(({status}) => status === 'FAIL') || !sameSnapshot(identity, context)) {
            throw new Error('Core quality report failed');
        }
        if (provider !== null) {
            const providerOptions = context.providerOptions ?? (provider.registration
                ? createQualityCallbacks(identity, {
                    ...context,
                    registration: provider.registration,
                    verifySnapshot: () => sameSnapshot(identity, context),
                })
                : {});
            const providerReport = validateQualityReport(await provider.run({
                projectRoot: projectRoot(context),
                baseSha: identity.baseSha,
                headSha: identity.headSha,
                ...providerOptions,
            }), adapter);
            gates.push(...providerReport.gates.map(parseGate));
            if (providerReport.status !== 'PASS' || !sameSnapshot(identity, context)) {
                throw new Error('adapter quality report failed');
            }
        }
        const passed = publish({...running, status: 'PASS', gates}, context);
        if (!sameSnapshot(identity, context)) throw new Error('check snapshot changed');
        return {...passed, path: inspectCheck(context).path, digest: checkDigest(passed)};
    } catch {
        const failed = publish({...running, status: 'FAIL', gates}, context);
        return {...failed, path: inspectCheck(context).path, digest: checkDigest(failed)};
    }
}

function currentAdapterMatches(record, context) {
    try {
        const registration = Object.hasOwn(context, 'registration')
            ? context.registration
            : (context.discoverOptionalAdapter ?? discoverOptionalAdapter)({
                projectRoot: projectRoot(context),
                piDir: context.piDir ?? path.join(projectRoot(context), '.pi'),
            });
        if (record.adapter === null) return registration === null;
        if (registration === null) return false;
        const provider = (context.resolveQualityProvider ?? resolveQualityProvider)({
            repositoryRoot: projectRoot(context),
            coreRoot: fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..')),
            protectedBase: record.baseSha,
            registration,
            resolvePackage: context.resolvePackage,
            run: context.runGit,
            env: context.env,
        });
        if (provider === null || typeof provider !== 'object' || typeof provider.then === 'function') return false;
        return JSON.stringify(record.adapter) === JSON.stringify(parseIdentity(provider.identity));
    } catch {
        return false;
    }
}

function verifyCheck(expected, context = {}) {
    exact(expected, ['branch', 'baseRef', 'baseSha', 'headSha'], 'check expectation');
    const inspected = inspectCheck(context);
    let currentCore;
    try {
        currentCore = coreIdentity(context);
    } catch {
        throw new Error('check receipt is unavailable');
    }
    if (inspected.state !== REVIEW_STATE.VALID || inspected.record.status !== 'PASS' ||
        JSON.stringify(inspected.record.core) !== JSON.stringify(currentCore) ||
        !currentAdapterMatches(inspected.record, context) ||
        !['branch', 'baseRef', 'baseSha', 'headSha'].every((key) => inspected.record[key] === expected[key]) ||
        !sameSnapshot(expected, context)) {
        throw new Error('check receipt is unavailable');
    }
    return {...inspected.record, path: inspected.path, digest: checkDigest(inspected.record)};
}

module.exports = {
    checkDigest,
    inspectCheck,
    runDeterministicCheck,
    verifyCheck,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
