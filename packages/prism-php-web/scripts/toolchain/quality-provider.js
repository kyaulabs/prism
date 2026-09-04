// $KYAULabs: quality-provider.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const manifest = require('../../package.json');

const OUTPUT_LIMIT = 1048576;
const ARTIFACT_LIMIT = 262144;
const GATES = [
    'php-web.changed-file-coverage',
    'php-web.composer-audit',
    'php-web.eslint',
    'php-web.node-tests',
    'php-web.npm-audit',
    'php-web.pest-coverage',
    'php-web.php-cs-fixer',
    'php-web.php-syntax',
    'php-web.playwright-list',
    'php-web.shell-tests',
    'php-web.stylelint',
    'php-web.typescript',
];
const EMPTY = Buffer.alloc(0);

function digest(bytes, maximum, label) {
    const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    if (value.length > maximum) throw new Error(`${label} exceeds its evidence limit`);
    return {
        bytes: value.length,
        sha256: crypto.createHash('sha256').update(value).digest('hex'),
    };
}

function relativeFile(file) {
    if (typeof file !== 'string' || file.length === 0 || file.length > 4096 ||
        file.includes('\\') || path.posix.isAbsolute(file) ||
        file.split('/').some((part) => part === '' || part === '.' || part === '..') ||
        /[\x00-\x1f\x7f]/.test(file)) {
        throw new Error('quality-provider tracked path is invalid');
    }
    return file;
}

function toolRecords(tools) {
    if (!Array.isArray(tools) || tools.length > 32) throw new Error('quality-provider tools are invalid');
    return tools.map((tool) => {
        if (tool === null || typeof tool !== 'object' || Array.isArray(tool) ||
            Object.keys(tool).sort().join(',') !== 'id,version' ||
            typeof tool.id !== 'string' || typeof tool.version !== 'string') {
            throw new Error('quality-provider tool record is invalid');
        }
        return {id: tool.id, version: tool.version};
    });
}

function artifactRecords(artifacts) {
    if (!Array.isArray(artifacts) || artifacts.length > 32) {
        throw new Error('quality-provider artifacts are invalid');
    }
    return artifacts.map((artifact) => {
        if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact) ||
            Object.keys(artifact).sort().join(',') !== 'bytes,path') {
            throw new Error('quality-provider artifact is invalid');
        }
        const artifactPath = relativeFile(artifact.path);
        return {path: artifactPath, ...digest(artifact.bytes, ARTIFACT_LIMIT, 'quality artifact')};
    });
}

function normalizeResult(result) {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('quality-provider execution result is invalid');
    }
    return {
        passed: result.status === 0,
        stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ''),
        stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ''),
        tools: toolRecords(result.tools ?? []),
        artifacts: artifactRecords(result.artifacts ?? []),
    };
}

function combine(results) {
    return {
        passed: results.every(({passed}) => passed),
        stdout: Buffer.concat(results.map(({stdout}) => stdout)),
        stderr: Buffer.concat(results.map(({stderr}) => stderr)),
        tools: [...new Map(results.flatMap(({tools}) => tools).map((tool) => [tool.id, tool])).values()],
        artifacts: results.flatMap(({artifacts}) => artifacts),
    };
}

function receipt(id, command, result, status = null) {
    return {
        id,
        status: status ?? (result.passed ? 'PASS' : 'FAIL'),
        command,
        tools: result.tools,
        stdout: digest(result.stdout, OUTPUT_LIMIT, 'quality stdout'),
        stderr: digest(result.stderr, OUTPUT_LIMIT, 'quality stderr'),
        artifacts: result.artifacts,
    };
}

function skipped(id, command) {
    return receipt(id, command, {
        passed: true,
        stdout: EMPTY,
        stderr: EMPTY,
        tools: [],
        artifacts: [],
    }, 'SKIPPED');
}

async function one(id, command, callback, request) {
    try {
        return receipt(id, command, normalizeResult(await callback({...request, id})));
    } catch {
        return receipt(id, command, {
            passed: false,
            stdout: EMPTY,
            stderr: Buffer.from('provider-error:execution'),
            tools: [],
            artifacts: [],
        });
    }
}

async function many(id, command, callback, requests) {
    if (requests.length === 0) return skipped(id, command);
    try {
        const results = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        for (const request of requests) {
            const result = await callback({...request, id});
            const normalized = normalizeResult(result);
            stdoutBytes += normalized.stdout.length;
            stderrBytes += normalized.stderr.length;
            if (stdoutBytes > OUTPUT_LIMIT || stderrBytes > OUTPUT_LIMIT) {
                throw new Error('quality output exceeds its evidence limit');
            }
            results.push(normalized);
        }
        return receipt(id, command, combine(results));
    } catch {
        return receipt(id, command, {
            passed: false,
            stdout: EMPTY,
            stderr: Buffer.from('provider-error:execution'),
            tools: [],
            artifacts: [],
        });
    }
}

function decodeXmlAttribute(value) {
    const named = {amp: '&', apos: "'", gt: '>', lt: '<', quot: '"'};
    return value.replace(/&(?:#(\d+)|#x([0-9A-Fa-f]+)|(amp|apos|gt|lt|quot));/gu,
        (_entity, decimal, hexadecimal, name) => {
            if (name !== undefined) return named[name];
            const point = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
            return String.fromCodePoint(point);
        });
}

function coverageCounts(xml, projectRoot) {
    const source = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml);
    const counts = new Map();
    const filePattern = /<file\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/file>/gu;
    const linePattern = /<line\s+([^>]*)\/?\s*>/gu;
    for (const fileMatch of source.matchAll(filePattern)) {
        const name = decodeXmlAttribute(fileMatch[1]);
        const relative = path.isAbsolute(name)
            ? path.relative(projectRoot, name).split(path.sep).join('/')
            : name.replace(/^\.\//u, '');
        try {
            relativeFile(relative);
        } catch {
            continue;
        }
        for (const lineMatch of fileMatch[2].matchAll(linePattern)) {
            const type = /(?:^|\s)type="([^"]+)"/u.exec(lineMatch[1]);
            const number = /(?:^|\s)num="(\d+)"/u.exec(lineMatch[1]);
            const count = /(?:^|\s)count="(\d+)"/u.exec(lineMatch[1]);
            if (type?.[1] === 'stmt' && number !== null && count !== null) {
                counts.set(`${relative}:${Number(number[1])}`, Number(count[1]));
            }
        }
    }
    return counts;
}

async function changedCoverage(options) {
    const id = 'php-web.changed-file-coverage';
    const command = ['coverage-gate', 'tests/coverage.xml'];
    try {
        const lines = await options.changedLines({
            baseSha: options.baseSha,
            headSha: options.headSha,
            extensions: ['php'],
        });
        if (!Array.isArray(lines) || lines.length === 0) return skipped(id, command);
        const xml = await options.readArtifact('tests/coverage.xml', ARTIFACT_LIMIT);
        const counts = coverageCounts(xml, options.projectRoot);
        const passed = lines.every(({file, line}) => counts.get(`${relativeFile(file)}:${line}`) > 0);
        return receipt(id, command, {
            passed,
            stdout: EMPTY,
            stderr: EMPTY,
            tools: [],
            artifacts: [{path: 'tests/coverage.xml', ...digest(xml, ARTIFACT_LIMIT, 'coverage artifact')}],
        });
    } catch {
        return receipt(id, command, {
            passed: false,
            stdout: EMPTY,
            stderr: Buffer.from('provider-error:coverage'),
            tools: [],
            artifacts: [],
        });
    }
}

async function runQualityProvider(options) {
    if (options === null || typeof options !== 'object' ||
        typeof options.runCommand !== 'function' || typeof options.runTool !== 'function' ||
        typeof options.runServer !== 'function' || typeof options.changedLines !== 'function' ||
        typeof options.readArtifact !== 'function' || typeof options.verifySnapshot !== 'function' ||
        !Array.isArray(options.trackedPaths) || !Array.isArray(options.packageScripts)) {
        throw new Error('quality-provider options are invalid');
    }
    const files = [...new Set(options.trackedPaths.map(relativeFile))].sort();
    const php = files.filter((file) => file.endsWith('.php'));
    const script = files.filter((file) => /^(?:tests\/Node\/.*\.(?:js|ts)|.*\.(?:js|mjs|cjs|ts))$/u.test(file));
    const shell = files.filter((file) => /^tests\/Shell\/.+_test\.sh$/u.test(file));
    const style = files.filter((file) => file.endsWith('.scss') || file.endsWith('.css'));
    const has = (file) => files.includes(file);
    const tasks = new Map();
    tasks.set('php-web.composer-audit', () => has('composer.lock')
        ? one('php-web.composer-audit', ['composer', 'audit', '--locked', '--no-interaction'], options.runCommand,
            {command: 'composer', args: ['audit', '--locked', '--no-interaction']})
        : skipped('php-web.composer-audit', ['composer', 'audit', '--locked', '--no-interaction']));
    tasks.set('php-web.eslint', () => script.length
        ? one('php-web.eslint', ['eslint', 'TRACKED_SCRIPT_FILES'], options.runTool,
            {toolId: 'eslint', args: script})
        : skipped('php-web.eslint', ['eslint', 'TRACKED_SCRIPT_FILES']));
    tasks.set('php-web.node-tests', () => options.packageScripts.some(
        (name) => ['test:node', 'test:plugin'].includes(name)
    ) && files.some((file) => /^tests\/Node\/.*\.test\.(?:js|ts)$/u.test(file))
        ? one('php-web.node-tests', ['node', '--test', 'tests/Node'], options.runCommand,
            {command: 'node', args: ['--test', 'tests/Node']})
        : skipped('php-web.node-tests', ['node', '--test', 'tests/Node']));
    tasks.set('php-web.npm-audit', () => has('package-lock.json')
        ? one('php-web.npm-audit', ['npm', 'audit', '--audit-level=low'], options.runCommand,
            {command: 'npm', args: ['audit', '--audit-level=low']})
        : skipped('php-web.npm-audit', ['npm', 'audit', '--audit-level=low']));
    tasks.set('php-web.php-cs-fixer', () => php.length
        ? one('php-web.php-cs-fixer', ['php-cs-fixer', 'fix', '--dry-run', '--diff', 'TRACKED_PHP_FILES'],
            options.runTool, {toolId: 'php-cs-fixer', args: ['fix', '--dry-run', '--diff', ...php]})
        : skipped('php-web.php-cs-fixer', ['php-cs-fixer', 'fix', '--dry-run', '--diff', 'TRACKED_PHP_FILES']));
    tasks.set('php-web.php-syntax', () => many(
        'php-web.php-syntax', ['php', '-l', 'TRACKED_PHP_FILES'], options.runCommand,
        php.map((file) => ({command: 'php', args: ['-l', file]}))
    ));
    tasks.set('php-web.playwright-list', () => files.some((file) => file.startsWith('tests/Browser/'))
        ? one('php-web.playwright-list', ['playwright', 'test', '--list'], options.runTool,
            {toolId: 'playwright', args: ['test', '--list']})
        : skipped('php-web.playwright-list', ['playwright', 'test', '--list']));
    const pestCommand = [
        'prism-tool', 'server', 'run', '@kyaulabs/prism-php-web:browser-fixture',
        '--tool', 'pest', '--', '--coverage', '--min=80', '--coverage-clover=tests/coverage.xml',
    ];
    tasks.set('php-web.pest-coverage', () => php.length
        ? one('php-web.pest-coverage', pestCommand, options.runServer,
            {profileId: 'browser-fixture', toolId: 'pest',
                args: ['--coverage', '--min=80', '--coverage-clover=tests/coverage.xml']})
        : skipped('php-web.pest-coverage', pestCommand));
    tasks.set('php-web.changed-file-coverage', (byId) =>
        byId.get('php-web.pest-coverage').status === 'PASS'
            ? changedCoverage(options)
            : skipped('php-web.changed-file-coverage', ['coverage-gate', 'tests/coverage.xml']));
    tasks.set('php-web.shell-tests', () => many(
        'php-web.shell-tests', ['bash', 'TRACKED_SHELL_TESTS'], options.runCommand,
        shell.map((file) => ({command: 'bash', args: [file]}))
    ));
    tasks.set('php-web.stylelint', () => style.length
        ? one('php-web.stylelint', ['stylelint', 'TRACKED_STYLE_FILES'], options.runTool,
            {toolId: 'stylelint', args: style})
        : skipped('php-web.stylelint', ['stylelint', 'TRACKED_STYLE_FILES']));
    tasks.set('php-web.typescript', () => has('tsconfig.json')
        ? one('php-web.typescript', ['typescript', '--noEmit'], options.runTool,
            {toolId: 'typescript', args: ['--noEmit']})
        : skipped('php-web.typescript', ['typescript', '--noEmit']));
    const executionOrder = GATES.filter((id) => id !== 'php-web.changed-file-coverage');
    executionOrder.splice(executionOrder.indexOf('php-web.pest-coverage') + 1, 0,
        'php-web.changed-file-coverage');
    const byId = new Map();
    for (const id of executionOrder) byId.set(id, await tasks.get(id)(byId));
    const gates = GATES.map((id) => byId.get(id));
    let snapshotValid = false;
    try {
        snapshotValid = await options.verifySnapshot({
            baseSha: options.baseSha,
            headSha: options.headSha,
        }) === true;
    } catch { }
    if (!snapshotValid) {
        const gate = gates.find(({id}) => id === 'php-web.changed-file-coverage');
        gate.status = 'FAIL';
    }
    return {
        schemaVersion: 1,
        provider: {
            id: 'php-web-quality',
            packageName: manifest.name,
            packageVersion: manifest.version,
            protocolVersion: 1,
        },
        status: gates.every(({status}) => status !== 'FAIL') ? 'PASS' : 'FAIL',
        gates,
    };
}

module.exports = {runQualityProvider};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
