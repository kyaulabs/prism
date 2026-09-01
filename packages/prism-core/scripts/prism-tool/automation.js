// $KYAULabs: automation.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {renderCoreAutomationProvider} = require('./automation-providers');
const {discoverAutomationAdapter} = require('./discovery');

const MAX_OUTPUT_BYTES = 1048576;
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
    const text = contents.toString('utf8');
    return text.split('\n').includes(`# prism-managed: ${owner}`) &&
        ['0', '1'].some((schema) =>
            text.split('\n').includes(`# prism-automation-schema: ${schema}`)
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

function renderProviders({projectRoot, coreRoot}) {
    const candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-automation-inspect-'));
    fs.chmodSync(candidateRoot, 0o700);
    try {
        const core = renderCoreAutomationProvider({coreRoot, candidateRoot});
        const adapter = discoverAutomationAdapter({projectRoot});
        const quality = adapter.handler.prepareAutomation({
            candidateRoot,
            contract: adapter.registration.contract,
        });
        if (quality?.status !== 'GO') throw new Error('adapter automation provider failed');
        return Object.freeze([
            providerReport(core, projectRoot),
            providerReport(quality, projectRoot),
        ]);
    } finally {
        fs.rmSync(candidateRoot, {recursive: true, force: true});
    }
}

function inspectAutomation({projectRoot: requestedRoot, coreRoot}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const providers = renderProviders({projectRoot, coreRoot: fs.realpathSync(coreRoot)});
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

module.exports = {OWNERSHIP, inspectAutomation};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
