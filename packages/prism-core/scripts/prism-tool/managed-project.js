// $KYAULabs: managed-project.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {verifyAutomation} = require('./automation');
const {discoverOptionalAdapter} = require('./discovery');
const {ManagedFileError} = require('./managed-file');
const {hasEffectiveManagedHooks, verifyManagedHooks} = require('./managed-hooks');
const {readProjectManifest} = require('./project-manifest');

function validateProjectComposition({projectRoot, project}) {
    const registration = discoverOptionalAdapter({projectRoot});
    if (project.value.adapter === null) {
        if (registration !== null) throw new Error('project adapter identity is invalid');
        return null;
    }
    if (
        registration === null ||
        (project.value.source.mode === 'ESTABLISHED' &&
            project.value.adapter.id !== registration.packageName) ||
        registration.packageName !== project.value.adapter.packageName ||
        registration.packageVersion !== project.value.adapter.packageVersion ||
        registration.bootstrapProtocol !== project.value.adapter.bootstrapProtocol
    ) throw new Error('project adapter identity is invalid');
    return registration;
}

function conflict(checks, id, message, error) {
    return {status: 'NO-GO', disposition: 'CONFLICT', checks: [...checks, {
        id, status: 'FAIL', message: error instanceof ManagedFileError ? error.message : message,
    }]};
}

function verifyManagedProject({projectRoot, coreRoot}) {
    const checks = [];
    let project;
    try {
        projectRoot = fs.realpathSync(projectRoot);
        const directory = path.join(projectRoot, '.prism');
        const parent = fs.lstatSync(directory, {throwIfNoEntry: false});
        if (parent !== undefined && (parent.isSymbolicLink() || !parent.isDirectory())) {
            throw new Error('project manifest directory is invalid');
        }
        const manifest = fs.lstatSync(path.join(directory, 'project.json'), {throwIfNoEntry: false});
        if (manifest === undefined) {
            let claimed;
            try {
                claimed = hasEffectiveManagedHooks({projectRoot, coreRoot});
            } catch (error) {
                return conflict(checks, 'managed-hooks', 'effective hook state is unsafe or unavailable', error);
            }
            if (claimed) return conflict(checks, 'project-manifest', 'project manifest is missing: .prism/project.json');
            return {status: 'GO', disposition: 'NOT_CONFIGURED', checks: [
                'project-manifest', 'project-adapter', 'project-automation', 'managed-hooks',
            ].map((id) => ({id, status: 'SKIPPED', message: 'managed project is not configured'}))};
        }
        project = readProjectManifest({projectRoot, coreRoot});
        checks.push({id: 'project-manifest', status: 'PASS', message: 'project manifest is current'});
    } catch (error) {
        return conflict(checks, 'project-manifest', 'project manifest is invalid: .prism/project.json', error);
    }
    try {
        validateProjectComposition({projectRoot, project});
        checks.push({id: 'project-adapter', status: 'PASS', message: 'project adapter identity is current'});
    } catch {
        return conflict(checks, 'project-adapter', 'project adapter identity is invalid');
    }
    try {
        const releaseRepository = project.value.capabilities.includes('release-management')
            ? project.value.capabilityMetadata['release-management'].repository : null;
        const automation = verifyAutomation({projectRoot, coreRoot, releaseRepository});
        const drift = automation.providers.flatMap(({outputs}) => outputs)
            .find(({disposition}) => disposition !== 'CURRENT');
        checks.push({id: 'project-automation', status: automation.status === 'GO' ? 'PASS' : 'FAIL',
            message: drift ? `managed automation file is ${drift.disposition === 'CREATE' ? 'missing' : 'not current'}: ${drift.path}`
                : automation.status === 'GO' ? 'project automation is current' : 'project automation is not current'});
    } catch (error) {
        return conflict(checks, 'project-automation', 'project automation is invalid', error);
    }
    const hooks = verifyManagedHooks({projectRoot, coreRoot});
    const drift = hooks.hooks.find(({disposition}) => disposition !== 'CURRENT');
    checks.push({...hooks.checks[0], ...(drift ? {
        message: `managed hook file is ${drift.disposition === 'CREATE' ? 'missing' : 'not current'}: ${drift.path}`,
    } : {})});
    const current = checks.every(({status}) => status === 'PASS');
    return {status: current ? 'GO' : 'NO-GO', disposition: current ? 'CURRENT' : 'CONFLICT', checks};
}

module.exports = {validateProjectComposition, verifyManagedProject};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
