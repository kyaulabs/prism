// $KYAULabs: server-lifecycle.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const {spawn} = require('node:child_process');
const net = require('node:net');
const {runBounded} = require('./process');

function* candidatePorts(preferredPort) {
    yield preferredPort;
    for (let distance = 1; distance <= 65534; distance += 1) {
        const higher = preferredPort + distance;
        const lower = preferredPort - distance;
        if (higher <= 65535) yield higher;
        if (lower >= 1) yield lower;
        if (higher > 65535 && lower < 1) return;
    }
}

function expandServerTemplate(value, host, port) {
    return value.replaceAll('{host}', host).replaceAll('{port}', String(port));
}

class ServerLifecycleError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ServerLifecycleError';
    }
}

function lifecycleError(code, message) {
    return new ServerLifecycleError(code, message);
}

function tcpListening(host, port, timeoutMs = 100) {
    return new Promise((resolve) => {
        const socket = net.createConnection({host, port});
        let settled = false;
        const finish = (listening) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(listening);
        };
        socket.setTimeout(timeoutMs, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });
}

function delay(milliseconds) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function startServer({profile, projectRoot, env, port}) {
    const args = profile.server.arguments.map((value) =>
        expandServerTemplate(value, profile.host, port)
    );
    const child = spawn(profile.server.executable, args, {
        cwd: projectRoot,
        detached: process.platform !== 'win32',
        env: {
            ...env,
            PRISM_SERVER_HOST: profile.host,
            PRISM_SERVER_PORT: String(port),
        },
        shell: false,
        stdio: 'ignore',
    });
    child.port = port;
    child.startError = null;
    child.once('error', (error) => {
        child.startError = error;
    });
    return child;
}

async function waitForReadiness(child, profile, probe) {
    const deadline = Date.now() + profile.startupTimeoutMs;
    while (Date.now() < deadline) {
        if (child.startError !== null) return {status: 'EXITED', startupError: true};
        if (child.exitCode !== null || child.signalCode !== null) return {status: 'EXITED'};
        if (await probe(profile.host, child.port)) return {status: 'READY'};
        await delay(50);
    }
    return {status: 'TIMED_OUT'};
}

function processTargetExists(target) {
    try {
        process.kill(target, 0);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        if (error.code === 'EPERM') return true;
        throw error;
    }
}

async function waitForProcessTargetExit(target, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (processTargetExists(target) && Date.now() < deadline) {
        await delay(25);
    }
    return !processTargetExists(target);
}

async function stopProcessGroup(child) {
    const target = process.platform === 'win32' ? child.pid : -child.pid;
    if (!processTargetExists(target)) return;
    try {
        process.kill(target, 'SIGTERM');
    } catch (error) {
        if (error.code === 'ESRCH') return;
        throw error;
    }
    if (await waitForProcessTargetExit(target, 500)) return;
    try {
        process.kill(target, 'SIGKILL');
    } catch (error) {
        if (error.code === 'ESRCH') return;
        throw error;
    }
    if (!await waitForProcessTargetExit(target, 500)) throw new Error('process group still running');
}

async function cleanupOwned(stop, owned) {
    try {
        await stop(owned);
    } catch {
        throw lifecycleError('CLEANUP_FAILED', 'server cleanup failed');
    }
}

function healthResult(profile, projectRoot, env, port) {
    if (profile.health === undefined) return {status: 0};
    return runBounded(
        profile.health.executable,
        profile.health.arguments.map((value) =>
            expandServerTemplate(value, profile.host, port)
        ),
        {
            cwd: projectRoot,
            env: {
                ...env,
                PRISM_SERVER_HOST: profile.host,
                PRISM_SERVER_PORT: String(port),
            },
            timeout: profile.startupTimeoutMs,
        }
    );
}

async function superviseServer(options) {
    const probe = options.probe ?? tcpListening;
    const start = options.start ?? startServer;
    const awaitReadiness = options.awaitReadiness ?? ((owned) =>
        waitForReadiness(owned, options.profile, probe));
    const runHealth = options.runHealth ?? ((command) =>
        healthResult(options.profile, options.projectRoot, options.env, command.port));
    const stop = options.stop ?? stopProcessGroup;
    const candidates = options.candidates ?? candidatePorts(options.profile.preferredPort);

    for (const port of candidates) {
        if (await probe(options.profile.host, port)) continue;
        const command = {
            env: options.env,
            port,
            profile: options.profile,
            projectRoot: options.projectRoot,
        };
        let owned;
        try {
            owned = await start(command);
        } catch {
            throw lifecycleError('SERVER_STARTUP_FAILED', 'server startup failed');
        }
        owned.port = port;
        const readiness = await awaitReadiness(owned);
        if (readiness.startupError === true) {
            throw lifecycleError('SERVER_STARTUP_FAILED', 'server startup failed');
        }
        if (readiness.status === 'EXITED') {
            await cleanupOwned(stop, owned);
            if (await probe(options.profile.host, port)) continue;
            throw lifecycleError('SERVER_STARTUP_FAILED', 'server startup failed');
        }
        if (readiness.status !== 'READY') {
            await cleanupOwned(stop, owned);
            throw lifecycleError('SERVER_STARTUP_TIMEOUT', 'server startup timed out');
        }
        try {
            const health = options.profile.health === undefined
                ? {status: 0}
                : runHealth(command);
            if (health.error || health.status !== 0) {
                throw lifecycleError('HEALTH_FAILED', 'server health check failed');
            }
            const clientEnvironment = {...options.env};
            for (const [key, value] of Object.entries(options.client.environment)) {
                clientEnvironment[key] = expandServerTemplate(value, options.profile.host, port);
            }
            return await options.runClient(clientEnvironment);
        } finally {
            await cleanupOwned(stop, owned);
        }
    }
    throw lifecycleError('PORT_EXHAUSTED', 'server ports exhausted');
}

module.exports = {
    candidatePorts,
    expandServerTemplate,
    superviseServer,
    tcpListening,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
