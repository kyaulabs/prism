// $KYAULabs: core-quality.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {loadCoreContract} = require('../prism-tool/core-toolchain');
const {loadAdapterHandler} = require('../prism-tool/discovery');
const {checkExternalTools, resolveExecutable} = require('../prism-tool/preflight');
const {runBounded} = require('../prism-tool/process');
const {runValidatedServer} = require('../prism-tool/server');
const {
    loadAdditionalSensitivePaths,
    sensitivePathMatch,
} = require('../sensitive-path-policy');
const {safeRelativePath} = require('./schema');

const OUTPUT_LIMIT = 1048576;
const CORE_GATE_IDS = Object.freeze([
    'core.repository-clean',
    'core.diff-check',
    'core.markdown',
    'core.conflict-markers',
    'core.harness',
    'core.semgrep',
]);
const EMPTY = Buffer.alloc(0);

function digest(value, maximum, label) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? '');
    if (bytes.length > maximum) throw new Error(`${label} exceeds limit`);
    return {
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}

function tools(value) {
    if (!Array.isArray(value) || value.length > 16) throw new Error('Core quality tools are invalid');
    return value.map((tool) => {
        if (tool === null || typeof tool !== 'object' || Array.isArray(tool) ||
            Object.keys(tool).sort().join(',') !== 'id,version' ||
            !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(tool.id ?? '') ||
            !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tool.version ?? '')) {
            throw new Error('Core quality tool is invalid');
        }
        return {...tool};
    });
}

function artifacts(value) {
    if (!Array.isArray(value) || value.length > 16) throw new Error('Core quality artifacts are invalid');
    return value.map((artifact) => {
        if (artifact === null || typeof artifact !== 'object' || Array.isArray(artifact) ||
            Object.keys(artifact).sort().join(',') !== 'bytes,path' ||
            typeof artifact.path !== 'string') {
            throw new Error('Core quality artifact is invalid');
        }
        safeRelativePath(artifact.path, 'Core quality artifact path');
        return {path: artifact.path, ...digest(artifact.bytes, 262144, 'Core quality artifact')};
    });
}

function receipt(request, result, status = null) {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Core quality result is invalid');
    }
    const acceptedStatus = request.id === 'core.conflict-markers'
        ? result.status === 1
        : result.status === 0;
    const clean = request.id !== 'core.repository-clean' ||
        (Buffer.isBuffer(result.stdout) ? result.stdout.length === 0 : String(result.stdout ?? '') === '');
    return {
        id: request.id,
        status: status ?? (acceptedStatus && clean && result.error === undefined && result.timedOut !== true
            ? 'PASS'
            : 'FAIL'),
        command: request.command,
        tools: tools(result.tools ?? []),
        stdout: digest(result.stdout ?? EMPTY, OUTPUT_LIMIT, 'Core quality stdout'),
        stderr: digest(result.stderr ?? EMPTY, OUTPUT_LIMIT, 'Core quality stderr'),
        artifacts: artifacts(result.artifacts ?? []),
    };
}

function failedReceipt(request) {
    return receipt(request, {
        status: 1,
        error: true,
        stdout: EMPTY,
        stderr: Buffer.from('core-quality:execution-failed'),
        tools: [],
        artifacts: [],
    });
}

function skippedReceipt(request) {
    return receipt(request, {
        status: 0,
        stdout: EMPTY,
        stderr: EMPTY,
        tools: [],
        artifacts: [],
    }, 'SKIPPED');
}

function executable(command, env) {
    const resolved = resolveExecutable(command, env);
    if (resolved === null) throw new Error('Core quality executable is unavailable');
    return resolved;
}

function defaultExecute(request, context) {
    const env = context.env ?? process.env;
    const coreRoot = fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..'));
    const projectRoot = fs.realpathSync(context.projectRoot);
    const contract = loadCoreContract(coreRoot);
    const executionCommand = request.executionCommand ?? request.command;
    let command;
    let args;
    let commandTools = [];
    if (executionCommand[0] === 'prism-tool') {
        command = process.execPath;
        args = [path.join(coreRoot, 'scripts', 'prism-tool.js'), ...executionCommand.slice(1)];
        const markdown = contract.components.find(({id}) => id === 'markdownlint-cli2');
        commandTools = [{id: markdown.id, version: markdown.version}];
    } else if (executionCommand[0] === 'semgrep') {
        const component = contract.components.find(({id}) => id === 'semgrep');
        const readiness = checkExternalTools({contract: {...contract, components: [component]}, env,
            run: context.run ?? runBounded});
        if (readiness.length !== 1 || readiness[0].status !== 'PASS') {
            throw new Error('Semgrep readiness failed');
        }
        command = executable('semgrep', env);
        args = executionCommand.slice(1);
        commandTools = [{id: 'semgrep', version: readiness[0].actual}];
    } else {
        command = executable(executionCommand[0], env);
        args = executionCommand.slice(1);
    }
    const result = (context.run ?? runBounded)(command, args, {
        cwd: projectRoot,
        env,
        encoding: null,
        maxBuffer: OUTPUT_LIMIT + 1,
        timeout: context.timeout ?? 300000,
    });
    return {...result, tools: commandTools, artifacts: []};
}

function harnessPresent(projectRoot) {
    const candidate = path.join(projectRoot, 'packages', 'prism-core', 'scripts', 'validate-harness.sh');
    try {
        const identity = fs.lstatSync(candidate);
        fs.accessSync(candidate, fs.constants.X_OK);
        return identity.isFile() && !identity.isSymbolicLink();
    } catch {
        return false;
    }
}

function requests(identity, trackedPaths = null) {
    const semgrepCommand = [
        'semgrep', 'scan', '--config', '.semgrep/kyaulabs.yml', '--config', 'p/php', '--config',
        'p/secrets', '--config', 'p/javascript', '--error', '--metrics', 'off', '--disable-version-check',
    ];
    return [
        {id: 'core.repository-clean', command: ['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all']},
        {id: 'core.diff-check', command: ['git', 'diff', '--check', `${identity.baseSha}..${identity.headSha}`]},
        {id: 'core.markdown', command: ['prism-tool', 'markdown', 'lint', '--changed-from', identity.baseSha]},
        {id: 'core.conflict-markers', command: [
            'git', 'grep', '-nE', '^(<<<<<<< |=======|>>>>>>> )', identity.headSha,
            '--', '.', ':!adr/**', ':!docs/plans/**',
        ]},
        {id: 'core.harness', command: ['bash', 'packages/prism-core/scripts/validate-harness.sh']},
        {id: 'core.semgrep', command: semgrepCommand,
            executionCommand: trackedPaths === null ? semgrepCommand : [...semgrepCommand, '--', ...trackedPaths],
            skip: trackedPaths?.length === 0},
    ];
}

function coreIdentity(context) {
    const coreRoot = fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..'));
    const manifest = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    return {packageName: manifest.name, packageVersion: manifest.version};
}

function gitBytes(context, args, maximum = OUTPUT_LIMIT) {
    const result = (context.runGit ?? runBounded)('git', args, {
        cwd: fs.realpathSync(context.projectRoot),
        env: context.env ?? process.env,
        encoding: null,
        maxBuffer: maximum + 1,
        timeout: 30000,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    if (result.error || result.status !== 0 || stdout.length > maximum) {
        throw new Error('quality Git evidence is unavailable');
    }
    return stdout;
}

function decode(bytes, label) {
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch (error) {
        throw new Error(`${label} is invalid`, {cause: error});
    }
}

function nulPaths(bytes) {
    if (bytes.length === 0) return [];
    if (bytes.at(-1) !== 0) throw new Error('tracked paths are invalid');
    const paths = decode(bytes, 'tracked paths').split('\0');
    paths.pop();
    for (const trackedPath of paths) safeRelativePath(trackedPath, 'tracked path');
    if (paths.length > 4096 || new Set(paths).size !== paths.length) {
        throw new Error('tracked paths are invalid');
    }
    return paths.sort();
}

function assertSafeTrackedPaths(context, trackedPaths) {
    const projectRoot = fs.realpathSync(context.projectRoot);
    const policy = {
        projectDir: projectRoot,
        home: context.home ?? os.homedir(),
        extraPaths: loadAdditionalSensitivePaths(
            context.sensitivePaths ?? (context.env ?? process.env).PRISM_SENSITIVE_PATHS
        ),
    };
    if (trackedPaths.some((trackedPath) =>
        sensitivePathMatch(path.join(projectRoot, trackedPath), policy) !== null)) {
        throw new Error('quality scope contains a sensitive path');
    }
}

function packageScripts(context, headSha, trackedPaths) {
    if (!trackedPaths.includes('package.json')) return [];
    const bytes = gitBytes(context, ['show', `${headSha}:package.json`], 262145);
    if (bytes.length > 262144) throw new Error('package manifest exceeds limit');
    let manifest;
    try {
        manifest = JSON.parse(decode(bytes, 'package manifest'));
    } catch (error) {
        throw new Error('package manifest is invalid', {cause: error});
    }
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest) ||
        (manifest.scripts !== undefined && (manifest.scripts === null ||
            typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts)))) {
        throw new Error('package scripts are invalid');
    }
    const names = Object.keys(manifest.scripts ?? {});
    if (names.length > 128 || names.some((name) => name.length === 0 || name.length > 128 ||
        /[\x00-\x1f\x7f]/.test(name))) throw new Error('package scripts are invalid');
    return names.sort();
}

function changedLines(context, expected, request) {
    if (request === null || typeof request !== 'object' || Array.isArray(request) ||
        Object.keys(request).sort().join(',') !== 'baseSha,extensions,headSha' ||
        request.baseSha !== expected.baseSha || request.headSha !== expected.headSha ||
        !Array.isArray(request.extensions) || request.extensions.length === 0 ||
        request.extensions.length > 16 ||
        request.extensions.some((extension) => !/^[a-z0-9]{1,16}$/.test(extension))) {
        throw new Error('changed-line request is invalid');
    }
    const patterns = request.extensions.map((extension) => `*.${extension}`);
    const paths = nulPaths(gitBytes(context, [
        'diff', '--name-only', '-z', '--diff-filter=ACMR', expected.baseSha, expected.headSha,
        '--', ...patterns,
    ]));
    const lines = [];
    let patchBytes = 0;
    for (const changedPath of paths) {
        const remaining = OUTPUT_LIMIT - patchBytes;
        if (remaining < 1) throw new Error('changed-line patches exceed limit');
        const loaded = gitBytes(context, [
            'diff', '--unified=0', '--no-color', '--no-ext-diff', expected.baseSha, expected.headSha,
            '--', changedPath,
        ], remaining);
        patchBytes += loaded.length;
        const patch = decode(loaded, 'changed-line patch');
        for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu)) {
            const start = Number(match[1]);
            const count = match[2] === undefined ? 1 : Number(match[2]);
            for (let line = start; line < start + count; line += 1) {
                lines.push({file: changedPath, line});
            }
        }
    }
    if (lines.length > 65536) throw new Error('changed lines exceed limit');
    return lines;
}

function readArtifact(context, artifactPath, maximum) {
    safeRelativePath(artifactPath, 'quality artifact path');
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 262144) {
        throw new Error('quality artifact limit is invalid');
    }
    const root = fs.realpathSync(context.projectRoot);
    let current = root;
    const parts = artifactPath.split('/');
    for (const part of parts.slice(0, -1)) {
        current = path.join(current, part);
        const identity = fs.lstatSync(current);
        if (!identity.isDirectory() || identity.isSymbolicLink() || fs.realpathSync(current) !== current) {
            throw new Error('quality artifact path is unsafe');
        }
    }
    const target = path.join(current, parts.at(-1));
    const identity = fs.lstatSync(target);
    if (!identity.isFile() || identity.isSymbolicLink() || identity.size > maximum) {
        throw new Error('quality artifact is invalid');
    }
    const descriptor = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = fs.fstatSync(descriptor);
        if (!opened.isFile() || opened.dev !== identity.dev || opened.ino !== identity.ino ||
            opened.size !== identity.size) throw new Error('quality artifact identity changed');
        const bytes = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor);
        const current = fs.lstatSync(target);
        if (bytes.length > maximum || after.dev !== opened.dev || after.ino !== opened.ino ||
            after.size !== opened.size || current.isSymbolicLink() || current.dev !== opened.dev ||
            current.ino !== opened.ino || current.size !== opened.size) {
            throw new Error('quality artifact identity changed');
        }
        return bytes;
    } finally {
        fs.closeSync(descriptor);
    }
}

function validArguments(args) {
    return Array.isArray(args) && args.length <= 256 && args.every((argument) =>
        typeof argument === 'string' && argument.length <= 4096 &&
        !/[\x00-\x1f\x7f]/.test(argument) && !path.isAbsolute(argument));
}

function versionOutput(result) {
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? '');
    if (stdout.length + stderr.length > OUTPUT_LIMIT) {
        throw new Error('quality version output exceeds limit');
    }
    return `${stdout.toString('utf8')}\n${stderr.toString('utf8')}`;
}

function commandVersion(id, executablePath, context, env) {
    const argumentsById = {
        bash: ['--version'],
        composer: ['--version'],
        node: ['--version'],
        npm: ['--version'],
        php: ['--version'],
    };
    const patterns = {
        bash: /GNU bash, version (\d+\.\d+\.\d+)/u,
        composer: /Composer version (\d+\.\d+\.\d+)/u,
        node: /^v(\d+\.\d+\.\d+)/mu,
        npm: /^(\d+\.\d+\.\d+)/mu,
        php: /^PHP (\d+\.\d+\.\d+)/mu,
    };
    const result = (context.run ?? runBounded)(executablePath, argumentsById[id], {
        cwd: fs.realpathSync(context.projectRoot),
        env,
        encoding: 'utf8',
        maxBuffer: OUTPUT_LIMIT + 1,
        timeout: 30000,
    });
    const output = versionOutput(result);
    const version = result.error ? null : patterns[id].exec(output)?.[1] ?? null;
    if (result.status !== 0 || version === null) throw new Error('quality command version is invalid');
    return version;
}

function toolVersion(component, executablePath, context, env) {
    const result = (context.run ?? runBounded)(executablePath, component.versionArguments, {
        cwd: fs.realpathSync(context.projectRoot),
        env,
        encoding: 'utf8',
        maxBuffer: OUTPUT_LIMIT + 1,
        timeout: 30000,
    });
    const output = versionOutput(result);
    const versions = [...output.matchAll(/(?:^|[^0-9])(\d+\.\d+\.\d+)(?=$|[^0-9])/gu)]
        .map((match) => match[1]);
    const version = result.error || !versions.includes(component.version) ? null : component.version;
    if (result.status !== 0 || version === null) {
        throw new Error('quality tool version is invalid');
    }
    return version;
}

function snapshotMatches(identity, context) {
    try {
        const branch = decode(gitBytes(context, [
            'symbolic-ref', '--quiet', '--short', 'HEAD',
        ]), 'quality branch').trim();
        const baseSha = decode(gitBytes(context, [
            'rev-parse', '--verify', `${identity.baseRef}^{commit}`,
        ]), 'quality base').trim();
        const headSha = decode(gitBytes(context, [
            'rev-parse', '--verify', 'HEAD^{commit}',
        ]), 'quality HEAD').trim();
        const status = gitBytes(context, [
            'status', '--porcelain=v1', '-z', '--untracked-files=all',
        ]);
        return branch === identity.branch && baseSha === identity.baseSha &&
            headSha === identity.headSha && status.length === 0;
    } catch {
        return false;
    }
}

function createQualityCallbacks(identity, context = {}) {
    const projectRoot = fs.realpathSync(context.projectRoot);
    const registration = context.registration;
    const handler = context.handler ?? loadAdapterHandler(registration);
    const trackedPaths = nulPaths(gitBytes(context, [
        'ls-tree', '-r', '--name-only', '-z', identity.headSha,
    ]));
    assertSafeTrackedPaths(context, trackedPaths);
    const scripts = packageScripts(context, identity.headSha, trackedPaths);
    const commandVersions = new Map();
    const verify = async (expected = identity) => {
        if (expected.baseSha !== identity.baseSha || expected.headSha !== identity.headSha ||
            !snapshotMatches(identity, context) ||
            (context.verifySnapshot !== undefined && await context.verifySnapshot(expected) !== true)) {
            throw new Error('quality snapshot changed');
        }
        return true;
    };
    const executeTool = (component, args, env) => {
        if (!validArguments(args)) throw new Error('quality tool arguments are invalid');
        const executablePath = handler.resolveTool({component, projectRoot});
        const version = toolVersion(component, executablePath, context, env);
        const argv = [...(component.argvPrefix ?? []), executablePath, ...args];
        const result = (context.run ?? runBounded)(argv[0], argv.slice(1), {
            cwd: projectRoot,
            env,
            encoding: null,
            maxBuffer: OUTPUT_LIMIT + 1,
            timeout: component.executionTimeoutMs ?? 300000,
        });
        return {...result, tools: [{id: component.id, version}], artifacts: []};
    };
    const runTool = async (request) => {
        if (!validArguments(request?.args)) throw new Error('quality tool request is invalid');
        const component = registration.contract.components.find(({id}) => id === request.toolId);
        if (!component || component.kind !== 'command' || component.provisioning !== 'consumer-dev' ||
            (component.argumentPolicy.mode !== 'passthrough' &&
                !component.argumentPolicy.allowed.includes(request.args[0]))) {
            throw new Error('quality tool is unavailable');
        }
        const result = executeTool(component, request.args, context.env ?? process.env);
        await verify();
        return result;
    };
    return {
        trackedPaths,
        packageScripts: scripts,
        async runCommand(request) {
            if (!['bash', 'composer', 'node', 'npm', 'php'].includes(request?.command) ||
                !validArguments(request.args)) throw new Error('quality command is invalid');
            const command = resolveExecutable(request.command, context.env ?? process.env);
            if (command === null) throw new Error('quality command is unavailable');
            if (!commandVersions.has(request.command)) {
                commandVersions.set(request.command, commandVersion(
                    request.command,
                    command,
                    context,
                    context.env ?? process.env
                ));
            }
            const result = (context.run ?? runBounded)(command, request.args, {
                cwd: projectRoot,
                env: context.env ?? process.env,
                encoding: null,
                maxBuffer: OUTPUT_LIMIT + 1,
                timeout: 300000,
            });
            await verify();
            return {...result, tools: [{id: request.command, version: commandVersions.get(request.command)}],
                artifacts: []};
        },
        runTool,
        async runServer(request) {
            const result = await runValidatedServer({
                registration,
                handler,
                profileId: request.profileId,
                toolId: request.toolId,
                toolArgs: request.args,
                projectRoot,
            }, {
                env: context.env ?? process.env,
                run: context.run ?? runBounded,
                runClient: ({component, args, env}) => executeTool(component, args, env),
                serverSupervisor: context.serverSupervisor,
            });
            await verify();
            return result;
        },
        async changedLines(request) {
            const result = changedLines(context, identity, request);
            await verify();
            return result;
        },
        async readArtifact(artifactPath, maximum) {
            const result = readArtifact(context, artifactPath, maximum);
            await verify();
            return result;
        },
        verifySnapshot: verify,
    };
}

async function runCoreQuality(identity, context = {}) {
    const execute = context.execute ?? ((request) => defaultExecute(request, context));
    let trackedPaths = null;
    if (context.execute === undefined) {
        trackedPaths = nulPaths(gitBytes(context, [
            'ls-tree', '-r', '--name-only', '-z', identity.headSha,
        ]));
        assertSafeTrackedPaths(context, trackedPaths);
    }
    const gates = [];
    for (const request of requests(identity, trackedPaths)) {
        if (request.skip === true || (request.id === 'core.harness' &&
            !(context.hasHarness ?? harnessPresent(fs.realpathSync(context.projectRoot))))) {
            gates.push(skippedReceipt(request));
        } else {
            try {
                gates.push(receipt(request, await execute(request)));
            } catch {
                gates.push(failedReceipt(request));
            }
        }
        if (await context.verifySnapshot(identity) !== true) {
            throw new Error('Core quality snapshot changed');
        }
    }
    return {
        schemaVersion: 1,
        core: coreIdentity(context),
        status: gates.every(({status}) => status !== 'FAIL') ? 'PASS' : 'FAIL',
        gates,
    };
}

module.exports = {
    CORE_GATE_IDS,
    createQualityCallbacks,
    runCoreQuality,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
