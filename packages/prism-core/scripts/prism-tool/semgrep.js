// $KYAULabs: semgrep.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const {spawn} = require('node:child_process');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {setTimeout, clearTimeout} = require('node:timers');
const {makeSemgrepWorkspace} = require('./semgrep-workspace');

const REGISTRY_PRESETS = new Set(['p/php', 'p/secrets', 'p/javascript']);

const CHILD = `
process.umask(0o077);
const child = require('node:child_process').spawn(process.argv[1], process.argv.slice(2), {stdio: 'inherit'});
child.on('error', () => process.send('spawn-failed', () => process.exit(127)));
child.on('exit', code => process.exit(code ?? 1));
`;

function relativeArgument(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 4096 ||
        !/^[\p{L}\p{M}\p{N}._ /-]+$/u.test(value) || value.startsWith('/') || value.split('/').includes('..')) {
        throw new Error('semgrep path argument is unsupported');
    }
    const normalized = path.posix.normalize(value).replace(/\/$/, '');
    if (normalized === '-') throw new Error('semgrep stdin selectors are unsupported');
    return normalized;
}

function scanArguments(args, env) {
    if (!Array.isArray(args) || args.length > 100000 || args[0] !== 'scan') throw new Error('semgrep requires a read-only scan');
    if (args.length === 2 && args[1] === '--help') {
        return {probe: true, baseline: null, otherBaseline: null, configs: [], targets: [], scanArgs: [...args]};
    }
    let baseline;
    const configs = [];
    const targets = [];
    const scanArgs = ['scan'];
    for (let index = 1; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--') { targets.push(...args.slice(index + 1)); break; }
        if (typeof argument === 'string' && !argument.startsWith('-')) { targets.push(argument); continue; }
        if (['--json', '--error', '--disable-version-check', '--x-ignore-semgrepignore-files'].includes(argument)) {
            scanArgs.push(argument);
            continue;
        }
        if (argument === '--metrics' && args[index + 1] === 'off') {
            scanArgs.push('--metrics', 'off');
            index += 1;
            continue;
        }
        if (argument === '--baseline-commit' && baseline === undefined) {
            baseline = args[++index];
            if (typeof baseline !== 'string' || baseline === '') throw new Error('semgrep baseline is missing');
            continue;
        }
        if (argument === '--config') {
            const config = relativeArgument(args[++index]);
            if (config === 'auto') throw new Error('semgrep configuration is unsupported');
            configs.push(config);
            scanArgs.push('--config', REGISTRY_PRESETS.has(config) ? config : `./${config}`);
            continue;
        }
        throw new Error('semgrep arguments are unsupported');
    }
    const otherBaseline = baseline === undefined ? null : env.SEMGREP_BASELINE_COMMIT || null;
    baseline ??= env.SEMGREP_BASELINE_COMMIT || null;
    if (configs.length === 0 || [baseline, otherBaseline].some((revision) => revision !== null &&
        (typeof revision !== 'string' || revision.length > 4096 || !/^[A-Za-z0-9][A-Za-z0-9._/~^-]*$/.test(revision)))) {
        throw new Error('semgrep requires tracked configuration and valid baseline selectors');
    }
    return {baseline, otherBaseline, configs: configs.filter((config) => !REGISTRY_PRESETS.has(config)),
        targets: targets.map(relativeArgument), scanArgs};
}

async function runIsolatedSemgrep({projectRoot, executable, args, env = process.env, timeoutMs = 600000, maxBuffer = 1048576}) {
    let workspace;
    let result = {status: null, stdout: '', stderr: '', timedOut: false, error: undefined};
    const totalMs = Math.min(timeoutMs, 600000);
    const deadline = performance.now() + totalMs;
    const workDeadline = deadline - Math.min(5000, Math.floor(totalMs / 4));
    let interrupted = false;
    let interruptOwned;
    const cancellation = new globalThis.AbortController();
    const onInterrupt = () => { interrupted = true; cancellation.abort(); interruptOwned?.(); };
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onInterrupt);
    try {
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxBuffer) || maxBuffer < 1) {
            throw new Error('semgrep caller bounds are invalid');
        }
        const request = scanArguments(args, env);
        workspace = await makeSemgrepWorkspace({projectRoot, ...request, env, signal: cancellation.signal, deadline, workDeadline});
        if (interrupted) throw new Error('semgrep interrupted');
        if (performance.now() >= workDeadline) throw new Error('semgrep preparation timed out');
        const scanArgs = [...request.scanArgs];
        if (workspace.baseline !== null) scanArgs.push('--baseline-commit', workspace.baseline);
        if (request.targets.length > 0) scanArgs.push('--', ...request.targets);
        result = await new Promise((resolve) => {
            const child = spawn(process.execPath, ['-e', CHILD, '--', executable, ...scanArgs], {
                cwd: workspace.directory, env: workspace.env, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            });
            const chunks = {stdout: [], stderr: []};
            const sizes = {stdout: 0, stderr: 0};
            let failure;
            let timedOut = false;
            const kill = () => {
                if (child.pid) {
                    try { process.kill(-child.pid, 'SIGKILL'); }
                    catch (error) { if (error.code !== 'ESRCH') failure = new Error('semgrep process cleanup failed'); }
                }
            };
            interruptOwned = () => { failure = new Error('semgrep interrupted'); kill(); };
            const timer = setTimeout(() => {
                timedOut = true;
                failure = new Error('semgrep execution timed out');
                kill();
            }, Math.max(1, workDeadline - performance.now()));
            for (const stream of ['stdout', 'stderr']) {
                child[stream].on('data', (bytes) => {
                    sizes[stream] += bytes.length;
                    if (sizes[stream] > Math.min(maxBuffer, 1048576)) {
                        failure = new Error('semgrep output exceeds limit');
                        kill();
                    } else chunks[stream].push(bytes);
                });
            }
            child.on('message', (message) => {
                if (message === 'spawn-failed') failure = new Error('semgrep execution failed');
            });
            child.on('error', () => { failure = new Error('semgrep execution failed'); });
            child.on('exit', kill);
            child.on('close', (status) => {
                interruptOwned = undefined;
                clearTimeout(timer);
                resolve({status, stdout: Buffer.concat(chunks.stdout).toString('utf8'),
                    stderr: Buffer.concat(chunks.stderr).toString('utf8'), timedOut, error: failure});
            });
        });
    } catch (error) {
        result.timedOut = error?.timedOut === true || performance.now() >= workDeadline;
        result.error = new Error(interrupted ? 'semgrep interrupted'
            : result.timedOut ? 'semgrep preparation timed out' : 'semgrep isolation failed');
    } finally {
        if (workspace) {
            try { await workspace.verify(true); }
            catch {
                result.error = Object.assign(new Error('semgrep consumer preservation failed'), {code: 'SEMGREP_PRESERVATION'});
            }
            try { workspace.cleanup(); }
            catch { result.error = new Error('semgrep workspace cleanup failed'); }
            if (performance.now() >= deadline) {
                result.timedOut = true;
                result.error = new Error('semgrep cleanup deadline exceeded');
            }
        }
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onInterrupt);
    }
    return result;
}

module.exports = {runIsolatedSemgrep};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
