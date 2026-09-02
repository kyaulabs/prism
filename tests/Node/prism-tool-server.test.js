// $KYAULabs: prism-tool-server.test.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeExecutable, writeJson} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const coreRoot = path.resolve(__dirname, '../../packages/prism-core');

async function captureWrites(action) {
    const stdout = [];
    const stderr = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout.push(String(chunk));
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr.push(String(chunk));
        return true;
    };
    try {
        return {status: await action(), stderr: stderr.join(''), stdout: stdout.join('')};
    } finally {
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;
    }
}

function writeServerAdapter(t, options = {}) {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const packageRoot = path.join(projectRoot, 'adapter');
    const bin = path.join(projectRoot, 'bin');
    const clientCalls = [];
    const processCalls = [];
    const supervisorCalls = [];

    writeJson(path.join(packageRoot, 'package.json'), {
        name: '@fixture/adapter',
        version: '1.0.0',
        prism: {
            adapter: true,
            toolchain: './toolchain.json',
            handler: './scripts/prism-tool-adapter.js',
        },
    });
    const components = ['client', 'other-client'].map((id) => ({
        id,
        kind: 'command',
        ecosystem: 'npm',
        package: `fixture-${id}`,
        version: '1.0.0',
        provisioning: 'consumer-dev',
        authentication: 'none',
        executable: id,
        versionArguments: ['--version'],
        argumentPolicy: {mode: 'passthrough'},
    }));
    writeJson(path.join(packageRoot, 'toolchain.json'), {
        schemaVersion: 1,
        package: '@fixture/adapter',
        role: 'adapter',
        components,
        serverProfiles: [{
            id: 'fixture',
            host: '127.0.0.1',
            preferredPort: 8080,
            startupTimeoutMs: 1000,
            server: {executable: 'fixture-server', arguments: ['{host}', '{port}']},
            health: {executable: 'fixture-health', arguments: ['{host}', '{port}']},
            clients: [{
                toolId: 'client',
                environment: {ENDPOINT: 'tcp://{host}:{port}'},
            }],
        }],
    });
    fs.mkdirSync(path.join(packageRoot, 'scripts'), {recursive: true});
    fs.mkdirSync(path.join(packageRoot, 'skills'), {recursive: true});
    fs.writeFileSync(
        path.join(packageRoot, 'scripts/prism-tool-adapter.js'),
        "'use strict';\nmodule.exports = {inspect() {}, resolveTool() {}};\n"
    );
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: ['../adapter/skills'],
    });
    for (const executable of ['fixture-server', 'fixture-health', 'semgrep', 'ocr']) {
        if (!options.omitExecutables?.includes(executable)) {
            writeExecutable(path.join(bin, executable), 'exit 0');
        }
    }

    const context = {
        coreRoot,
        projectRoot,
        env: {PATH: bin},
        input: '',
        run: (command, args, runOptions) => {
            processCalls.push({args, command, options: runOptions});
            const name = path.basename(command);
            if (name === 'semgrep') {
                return {status: 0, stdout: '1.173.0\n', stderr: '', error: undefined};
            }
            if (name === 'ocr') {
                return {
                    status: 0,
                    stdout: 'open-code-review v1.9.1 linux/amd64\n',
                    stderr: '',
                    error: undefined,
                };
            }
            throw new Error('unexpected process call');
        },
        runDeclaredTool: (args, clientContext) => {
            clientCalls.push({args, endpoint: clientContext.env.ENDPOINT});
            return options.runToolStatus ?? 0;
        },
        serverSupervisor: async (supervisorOptions) => {
            supervisorCalls.push(supervisorOptions);
            const implementation = options.serverSupervisor ?? (async (current) =>
                current.runClient({...current.env, ENDPOINT: 'tcp://127.0.0.1:8081'}));
            return implementation(supervisorOptions);
        },
    };

    return {clientCalls, context, processCalls, supervisorCalls};
}

test('rejects malformed server invocations before discovery', async () => {
    let clientCalls = 0;
    let processCalls = 0;
    let supervisorCalls = 0;
    for (const args of [
        ['server'],
        ['server', 'run'],
        ['server', 'run', '@fixture/adapter:fixture'],
        ['server', 'run', '@fixture/adapter:fixture', '--tool', 'client'],
        ['server', 'run', '@fixture/adapter:fixture', '--tool', 'client', 'payload'],
    ]) {
        const result = await captureWrites(() => main(args, {
            run: () => {
                processCalls += 1;
                return {status: 0};
            },
            runDeclaredTool: () => {
                clientCalls += 1;
                return 0;
            },
            serverSupervisor: async () => {
                supervisorCalls += 1;
                return 0;
            },
        }));
        assert.equal(result.status, 2);
        assert.match(result.stderr, /usage: prism-tool server run/);
    }
    assert.equal(clientCalls, 0);
    assert.equal(processCalls, 0);
    assert.equal(supervisorCalls, 0);
});

test('fails readiness before adapter discovery when a core prerequisite is missing', async (t) => {
    const fixture = writeServerAdapter(t, {omitExecutables: ['semgrep']});
    const result = await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
    ], fixture.context));

    assert.equal(result.status, 3);
    assert.match(result.stderr, /mandatory external readiness failed/);
    assert.equal(fixture.supervisorCalls.length, 0);
    assert.equal(fixture.clientCalls.length, 0);
});

test('rejects a package other than the active adapter', async (t) => {
    const fixture = writeServerAdapter(t);
    const result = await captureWrites(() => main([
        'server', 'run', '@other/adapter:fixture', '--tool', 'client', '--', '--coverage',
    ], fixture.context));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /requested server profile is not active/);
    assert.equal(fixture.supervisorCalls.length, 0);
});

test('rejects unknown profiles and clients not permitted by the profile', async (t) => {
    const fixture = writeServerAdapter(t);
    for (const [reference, tool] of [
        ['@fixture/adapter:missing', 'client'],
        ['@fixture/adapter:fixture', 'other-client'],
    ]) {
        const result = await captureWrites(() => main([
            'server', 'run', reference, '--tool', tool, '--',
        ], fixture.context));
        assert.equal(result.status, 2);
    }
    assert.equal(fixture.supervisorCalls.length, 0);
});

test('fails readiness when a declared server executable is unavailable', async (t) => {
    for (const executable of ['fixture-server', 'fixture-health']) {
        const fixture = writeServerAdapter(t, {omitExecutables: [executable]});
        const result = await captureWrites(() => main([
            'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
        ], fixture.context));

        assert.equal(result.status, 3, executable);
        assert.match(result.stderr, /server profile executable is unavailable/);
        assert.equal(fixture.supervisorCalls.length, 0);
        assert.equal(fixture.clientCalls.length, 0);
    }
});

test('passes the validated profile and selected environment to the declared client', async (t) => {
    const fixture = writeServerAdapter(t, {
        serverSupervisor: async (options) => options.runClient({
            ...options.env,
            ENDPOINT: 'tcp://127.0.0.1:8081',
        }),
    });
    const result = await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--', '--coverage',
    ], fixture.context));

    assert.equal(result.status, 0);
    assert.equal(fixture.supervisorCalls.length, 1);
    assert.equal(fixture.supervisorCalls[0].profile.id, 'fixture');
    assert.equal(fixture.supervisorCalls[0].projectRoot, fs.realpathSync(fixture.context.projectRoot));
    assert.deepEqual(fixture.clientCalls, [{
        args: ['client', '--', '--coverage'],
        endpoint: 'tcp://127.0.0.1:8081',
    }]);
});

test('maps client failure and lifecycle failure to stable tool status', async (t) => {
    const clientFailure = writeServerAdapter(t, {runToolStatus: 4});
    assert.equal((await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
    ], clientFailure.context))).status, 4);

    const lifecycleFailure = writeServerAdapter(t, {
        serverSupervisor: async () => {
            throw Object.assign(new Error('failed'), {code: 'HEALTH_FAILED'});
        },
    });
    const failed = await captureWrites(() => main([
        'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
    ], lifecycleFailure.context));
    assert.equal(failed.status, 4);
    assert.match(failed.stderr, /server health check failed/);
});

test('renders fixed lifecycle diagnostics without relaying error text', async (t) => {
    const cases = [
        ['PORT_EXHAUSTED', 'server ports exhausted'],
        ['SERVER_STARTUP_FAILED', 'server startup failed'],
        ['SERVER_STARTUP_TIMEOUT', 'server startup timed out'],
        ['CLEANUP_FAILED', 'server cleanup failed'],
        ['UNKNOWN', 'supervised server operation failed'],
    ];
    for (const [code, diagnostic] of cases) {
        const fixture = writeServerAdapter(t, {
            serverSupervisor: async () => {
                throw Object.assign(new Error('untrusted child detail'), {code});
            },
        });
        const result = await captureWrites(() => main([
            'server', 'run', '@fixture/adapter:fixture', '--tool', 'client', '--',
        ], fixture.context));

        assert.equal(result.status, 4, code);
        assert.match(result.stderr, new RegExp(diagnostic));
        assert.doesNotMatch(result.stderr, /untrusted child detail/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
