// $KYAULabs: project.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $






'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXECUTABLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isInside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function resolveTool({component, projectRoot}) {
    if (
        component?.kind !== 'command' ||
        component.provisioning !== 'consumer-dev' ||
        !['composer', 'npm'].includes(component.ecosystem) ||
        !EXECUTABLE.test(component.executable)
    ) {
        throw new Error('component is outside the consumer tool scope');
    }
    const canonicalProject = fs.realpathSync(projectRoot);
    const scopeName = component.ecosystem === 'composer' ? 'vendor' : 'node_modules';
    const scopeRoot = path.join(canonicalProject, scopeName);
    const binRoot = path.join(scopeRoot, component.ecosystem === 'composer' ? 'bin' : '.bin');
    const candidate = path.join(binRoot, component.executable);
    const executable = fs.realpathSync(candidate);
    if (!isInside(scopeRoot, executable)) throw new Error('consumer executable escapes project scope');
    if (!fs.statSync(executable).isFile()) throw new Error('consumer executable is not a file');
    fs.accessSync(executable, fs.constants.X_OK);
    return executable;
}

function runtimeCheck(run) {
    const script = "echo json_encode(['version' => PHP_VERSION, 'sockets' => extension_loaded('sockets')], JSON_THROW_ON_ERROR);";
    const result = run('php', ['-r', script], {maxBuffer: 1048576, timeout: 30000});
    if (result.status !== 0 || result.error) return null;
    let runtime;
    try {
        runtime = JSON.parse(result.stdout);
    } catch {
        return null;
    }
    if (
        runtime === null ||
        typeof runtime !== 'object' ||
        typeof runtime.version !== 'string' ||
        typeof runtime.sockets !== 'boolean'
    ) {
        return null;
    }
    return runtime;
}

function inspect({contract, projectRoot, run}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    const runtime = runtimeCheck(run);
    const manifestNames = ['composer.json', 'composer.lock', 'package.json', 'package-lock.json'];
    const manifests = Object.fromEntries(
        manifestNames.map((name) => [name, fs.existsSync(path.join(canonicalProject, name))])
    );
    const components = {};
    const checks = [];
    for (const component of contract.components.filter(({kind}) => kind === 'command')) {
        try {
            components[component.id] = resolveTool({component, projectRoot: canonicalProject});
            checks.push({id: component.id, status: 'PASS', message: 'resolved'});
        } catch {
            components[component.id] = null;
            checks.push({id: component.id, status: 'FAIL', message: 'missing executable'});
        }
    }
    checks.unshift(
        {
            id: 'php',
            status: runtime && /^(?:8\.(?:[5-9]|\d{2,})|(?:9|[1-9]\d+)\.\d+)\.\d+/.test(runtime.version)
                ? 'PASS'
                : 'FAIL',
            actual: runtime?.version,
            message: runtime ? 'runtime detected' : 'runtime probe failed',
        },
        {
            id: 'ext-sockets',
            status: runtime?.sockets ? 'PASS' : 'FAIL',
            message: runtime?.sockets ? 'extension loaded' : 'extension missing',
        },
        ...Object.entries(manifests).map(([id, present]) => ({
            id,
            status: present ? 'PASS' : 'FAIL',
            message: present ? 'present' : 'missing',
        }))
    );
    return {
        status: checks.every(({status}) => status === 'PASS') ? 'GO' : 'NO-GO',
        checks,
        data: {
            phpVersion: runtime?.version ?? null,
            sockets: runtime?.sockets ?? false,
            manifests,
            components,
        },
    };
}

module.exports = {inspect, resolveTool};






// vim: ft=javascript sts=4 sw=4 ts=4 et :
