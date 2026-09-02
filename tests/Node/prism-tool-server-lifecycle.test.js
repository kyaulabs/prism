// $KYAULabs: prism-tool-server-lifecycle.test.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const net = require('node:net');
const test = require('node:test');
const {URL} = require('node:url');
const {
    candidatePorts,
    expandServerTemplate,
    superviseServer,
    tcpListening,
} = require('../../packages/prism-core/scripts/prism-tool/server-lifecycle');

function profile(preferredPort = 8080) {
    return {
        id: 'fixture',
        host: '127.0.0.1',
        preferredPort,
        startupTimeoutMs: 1000,
        server: {executable: 'server', arguments: ['--listen={host}:{port}']},
        health: {executable: 'health', arguments: ['{host}', '{port}']},
        clients: [{toolId: 'client', environment: {ENDPOINT: 'tcp://{host}:{port}'}}],
    };
}

function child(pid = 101) {
    const owned = new EventEmitter();
    owned.pid = pid;
    owned.exitCode = null;
    owned.signalCode = null;
    return owned;
}

function listen(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen({host: '127.0.0.1', port, exclusive: true}, () => {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

async function freeThreePortRange() {
    const first = 30001 + (process.pid % 19999);
    for (let offset = 0; offset < 19999; offset += 1) {
        const middle = 30001 + ((first - 30001 + offset) % 19999);
        const listeners = [];
        try {
            for (const port of [middle - 1, middle, middle + 1]) {
                listeners.push(await listen(port));
            }
            return {listeners, middle};
        } catch (error) {
            await Promise.all(listeners.map((server) => close(server)));
            if (error.code !== 'EADDRINUSE') throw error;
        }
    }
    throw new Error('no free three-port loopback range');
}

test('orders arbitrary preferred ports by distance with higher ties first', () => {
    assert.deepEqual([...candidatePorts(8080)].slice(0, 7), [8080, 8081, 8079, 8082, 8078, 8083, 8077]);
    assert.deepEqual([...candidatePorts(1)].slice(0, 4), [1, 2, 3, 4]);
    assert.deepEqual([...candidatePorts(65535)].slice(0, 4), [65535, 65534, 65533, 65532]);
});

test('expands validated host and port tokens as inert values', () => {
    assert.equal(
        expandServerTemplate('tcp://{host}:{port}', '127.0.0.1', 8081),
        'tcp://127.0.0.1:8081'
    );
});

test('skips occupied ports without starting or stopping their processes', async () => {
    const started = [];
    const stopped = [];
    const selectedProfile = profile();
    const status = await superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async (_host, port) => port === 8080,
        start: async (command) => {
            started.push(command);
            return child();
        },
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 0}),
        runClient: (env) => env.ENDPOINT.endsWith(':8081') ? 0 : 97,
        stop: async (owned) => stopped.push(owned.pid),
    });

    assert.equal(status, 0);
    assert.deepEqual(started.map(({port}) => port), [8081]);
    assert.deepEqual(stopped, [101]);
});

test('retries a bind race but stops on a real startup failure', async () => {
    const probes = new Map([[8080, [false, true]], [8081, [false]]]);
    const stopped = [];
    const selectedProfile = profile();
    const status = await superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async (_host, port) => probes.get(port).shift() ?? false,
        start: async ({port}) => child(port),
        awaitReadiness: async (owned) => owned.pid === 8080
            ? {status: 'EXITED'}
            : {status: 'READY'},
        runHealth: () => ({status: 0}),
        runClient: () => 0,
        stop: async (owned) => stopped.push(owned.pid),
    });
    assert.equal(status, 0);
    assert.deepEqual(stopped, [8080, 8081]);

    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'EXITED'}),
        runHealth: () => ({status: 0}),
        runClient: () => 0,
        stop: async () => {},
    }), (error) => {
        assert.equal(error.code, 'SERVER_STARTUP_FAILED');
        assert.match(error.message, /server startup failed/);
        return true;
    });
});

test('classifies process spawn errors as startup failures', async () => {
    const selectedProfile = {
        ...profile(),
        startupTimeoutMs: 1,
        server: {executable: 'prism-server-executable-that-does-not-exist', arguments: []},
        health: undefined,
    };

    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: process.cwd(),
        env: {},
        candidates: [selectedProfile.preferredPort],
        probe: async () => false,
        runClient: () => 0,
    }), (error) => {
        assert.equal(error.code, 'SERVER_STARTUP_FAILED');
        return true;
    });
});

test('does not run the client when semantic health fails', async () => {
    let clientRuns = 0;
    const selectedProfile = profile();
    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 1}),
        runClient: () => { clientRuns += 1; return 0; },
        stop: async () => {},
    }), (error) => {
        assert.equal(error.code, 'HEALTH_FAILED');
        assert.match(error.message, /health check failed/);
        return true;
    });
    assert.equal(clientRuns, 0);
});

test('classifies semantic health timeouts without running the client', async () => {
    let clientRuns = 0;
    const selectedProfile = profile();
    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: null, timedOut: true}),
        runClient: () => { clientRuns += 1; return 0; },
        stop: async () => {},
    }), (error) => {
        assert.equal(error.code, 'HEALTH_FAILED');
        return true;
    });
    assert.equal(clientRuns, 0);
});

test('always cleans up its owned server after client failure', async () => {
    const stopped = [];
    const selectedProfile = {...profile(), health: undefined};
    const status = await superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(909),
        awaitReadiness: async () => ({status: 'READY'}),
        runHealth: () => ({status: 0}),
        runClient: () => 4,
        stop: async (owned) => stopped.push(owned.pid),
    });
    assert.equal(status, 4);
    assert.deepEqual(stopped, [909]);
});

test('fails closed on startup timeout and bounded port exhaustion', async () => {
    const selectedProfile = profile();
    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        candidates: [8080],
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'TIMED_OUT'}),
        runClient: () => 0,
        stop: async () => {},
    }), (error) => {
        assert.equal(error.code, 'SERVER_STARTUP_TIMEOUT');
        assert.match(error.message, /server startup timed out/);
        return true;
    });

    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        candidates: [8080, 8081],
        probe: async () => true,
        start: async () => { throw new Error('must not start'); },
        runClient: () => 0,
    }), (error) => {
        assert.equal(error.code, 'PORT_EXHAUSTED');
        assert.match(error.message, /server ports exhausted/);
        return true;
    });
});

test('reports cleanup failure instead of successful client completion', async () => {
    const selectedProfile = {...profile(), health: undefined};
    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'READY'}),
        runClient: () => 0,
        stop: async () => { throw new Error('cleanup failed'); },
    }), (error) => {
        assert.equal(error.code, 'CLEANUP_FAILED');
        assert.match(error.message, /server cleanup failed/);
        return true;
    });
});

test('reports cleanup failure instead of a client failure', async () => {
    const selectedProfile = {...profile(), health: undefined};
    await assert.rejects(() => superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: '/fixture',
        env: {},
        probe: async () => false,
        start: async () => child(),
        awaitReadiness: async () => ({status: 'READY'}),
        runClient: () => 4,
        stop: async () => { throw new Error('cleanup failed'); },
    }), (error) => {
        assert.equal(error.code, 'CLEANUP_FAILED');
        return true;
    });
});

test('preserves an occupied preferred port and cleans up its selected server', async (t) => {
    const {listeners, middle} = await freeThreePortRange();
    const [lower, preferred, higher] = listeners;
    t.after(async () => {
        if (preferred.listening) await close(preferred);
    });
    await Promise.all([close(lower), close(higher)]);

    const childSource = [
        "const net = require('node:net');",
        "process.on('SIGTERM', () => {});",
        "net.createServer().listen(Number(process.argv[1]), '127.0.0.1');",
    ].join('');
    const serverSource = [
        "const {spawn} = require('node:child_process');",
        "process.on('SIGTERM', () => {});",
        `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}, process.argv[1]], {stdio: 'ignore'});`,
        "child.once('exit', (code) => process.exit(code ?? 1));",
        "setInterval(() => {}, 1000);",
    ].join('');
    const selectedProfile = {
        ...profile(middle),
        server: {executable: process.execPath, arguments: ['-e', serverSource, '{port}']},
        health: undefined,
    };
    let selectedPort;

    const status = await superviseServer({
        profile: selectedProfile,
        client: selectedProfile.clients[0],
        projectRoot: process.cwd(),
        env: {},
        runClient: (env) => {
            selectedPort = Number(new URL(env.ENDPOINT).port);
            return 0;
        },
    });

    assert.equal(status, 0);
    assert.equal(selectedPort, middle + 1);
    assert.equal(await tcpListening('127.0.0.1', middle), true);
    assert.equal(await tcpListening('127.0.0.1', selectedPort), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
