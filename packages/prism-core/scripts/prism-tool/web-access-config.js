// $KYAULabs: web-access-config.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {
    STATE,
    inspectManagedRecord,
    publishManagedRecord,
    removeManagedRecord,
} = require('./managed-record');
const {resolveWebAccessBrowser} = require('./web-access-browser');

const EXIT = Object.freeze({OK: 0, USAGE: 2, TRANSACTION: 5});
const WEB_ACCESS_FILE = 'prism-web-access.json';
const DEFAULT_CONFIG = Object.freeze({searxngUrl: null, browser: 'auto'});
const BROWSER_VALUES = new Set(['auto', 'disabled']);

function resolveWebAccessPath(context = {}) {
    if (context.webAccessPath !== undefined) return path.resolve(context.webAccessPath);
    const env = context.env ?? process.env;
    const piDir = context.piDir ?? env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
    return path.join(path.resolve(piDir), WEB_ACCESS_FILE);
}

function managedContext(context = {}) {
    return {...context, managedPath: resolveWebAccessPath(context)};
}

function isLoopbackHostname(hostname) {
    const bare = hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;
    if (bare.toLowerCase() === 'localhost') return true;
    const family = net.isIP(bare);
    if (family === 4) return bare.split('.')[0] === '127';
    return family === 6 && bare.toLowerCase() === '::1';
}

function normalizeSearxngUrl(input) {
    if (typeof input !== 'string' || input.length === 0 || input.length > 2048) throw new Error();
    let url;
    try { url = new URL(input); } catch { throw new Error(); }
    if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHostname(url.hostname) ||
        url.username !== '' || url.password !== '' || url.hash !== '' || url.search !== '') {
        throw new Error();
    }
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}`;
}

function parseWebAccessRecord(record) {
    if (record === null || Array.isArray(record) || typeof record !== 'object') throw new Error();
    const allowed = new Set(['schemaVersion', 'searxngUrl', 'browser']);
    const keys = Object.keys(record);
    if (keys.some((key) => !allowed.has(key)) || record.schemaVersion !== 1) throw new Error();
    const searxngUrl = record.searxngUrl === undefined || record.searxngUrl === null
        ? null
        : normalizeSearxngUrl(record.searxngUrl);
    const browser = record.browser ?? 'auto';
    if (!BROWSER_VALUES.has(browser)) throw new Error();
    return {schemaVersion: 1, searxngUrl, browser};
}

function publicConfig(record) {
    if (!record) return DEFAULT_CONFIG;
    return {searxngUrl: record.searxngUrl, browser: record.browser};
}

function inspectWebAccessDetail(context = {}) {
    return inspectManagedRecord({
        context: managedContext(context),
        filename: WEB_ACCESS_FILE,
        parse: parseWebAccessRecord,
    });
}

function inspectWebAccessConfig(context = {}) {
    const detail = inspectWebAccessDetail(context);
    return {
        state: detail.state,
        path: detail.path,
        config: publicConfig(detail.record),
    };
}

function render(report) {
    process.stdout.write(`${JSON.stringify({schemaVersion: 1, ...report})}\n`);
}

function parseConfigure(args) {
    const controls = new Map();
    for (const argument of args) {
        if (argument === '--json') {
            if (controls.has('json')) throw new Error();
            controls.set('json', true);
            continue;
        }
        const match = /^--([a-z-]+)=(.*)$/.exec(argument);
        if (!match || controls.has(match[1])) throw new Error();
        controls.set(match[1], match[2]);
    }
    if (controls.size < 2 || controls.get('approval') !== 'yes' || controls.get('json') !== true ||
        [...controls.keys()].some((key) => !['approval', 'json', 'searxng-url', 'browser'].includes(key))) {
        throw new Error();
    }
    const browser = controls.get('browser') ?? 'auto';
    if (!BROWSER_VALUES.has(browser)) throw new Error();
    const searxngUrl = controls.has('searxng-url')
        ? normalizeSearxngUrl(controls.get('searxng-url'))
        : null;
    return {searxngUrl, browser};
}

function webAccessCommand(args, context = {}) {
    try {
        if (args.length === 2 && args[0] === 'status' && args[1] === '--json') {
            const inspected = inspectWebAccessConfig(context);
            const browser = inspected.state === STATE.UNSAFE
                ? {status: 'UNAVAILABLE'}
                : resolveWebAccessBrowser({...context, config: inspected.config});
            const publicBrowser = browser.status === 'AVAILABLE'
                ? {status: browser.status, family: browser.family}
                : browser;
            render({
                command: 'web-access status',
                status: inspected.state,
                config: inspected.config,
                browser: publicBrowser,
            });
            return EXIT.OK;
        }
        if (args[0] === 'configure') {
            const config = parseConfigure(args.slice(1));
            const detail = inspectWebAccessDetail(context);
            if (detail.state === STATE.UNSAFE) throw new Error('unsafe');
            publishManagedRecord({
                context: managedContext(context),
                detail,
                filename: WEB_ACCESS_FILE,
                record: {schemaVersion: 1, ...config},
                parse: parseWebAccessRecord,
            });
            render({command: 'web-access configure', status: 'CONFIGURED', config});
            return EXIT.OK;
        }
        if (args.length === 3 && args[0] === 'remove' &&
            args[1] === '--approval=yes' && args[2] === '--json') {
            const detail = inspectWebAccessDetail(context);
            if (detail.state === STATE.UNSAFE) throw new Error('unsafe');
            if (detail.state === STATE.GRANTED) {
                removeManagedRecord({context: managedContext(context), detail});
            }
            render({command: 'web-access remove', status: STATE.ABSENT, config: DEFAULT_CONFIG});
            return EXIT.OK;
        }
        process.stderr.write('usage: prism-tool web-access status --json | web-access configure [--searxng-url=URL] [--browser=auto|disabled] --approval=yes --json | web-access remove --approval=yes --json\n');
        return EXIT.USAGE;
    } catch (error) {
        if (error?.message === 'unsafe') {
            process.stderr.write('prism-tool: web-access configuration requires human remediation\n');
            return EXIT.TRANSACTION;
        }
        if (args[0] === 'configure' && !(error?.message?.startsWith('managed record'))) {
            process.stderr.write('usage: prism-tool web-access configure [--searxng-url=URL] [--browser=auto|disabled] --approval=yes --json\n');
            return EXIT.USAGE;
        }
        process.stderr.write('prism-tool: web-access configuration operation failed\n');
        return EXIT.TRANSACTION;
    }
}

module.exports = {
    BROWSER_VALUES,
    DEFAULT_CONFIG,
    inspectWebAccessConfig,
    normalizeSearxngUrl,
    resolveWebAccessPath,
    webAccessCommand,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
