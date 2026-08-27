// $KYAULabs: web-access-browser.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {resolveExecutable} = require('./preflight');

const BROWSERS = Object.freeze([
    ['chromium', 'chromium'],
    ['chromium-browser', 'chromium'],
    ['brave', 'brave'],
    ['brave-browser', 'brave'],
    ['brave-browser-stable', 'brave'],
    ['google-chrome', 'chrome'],
    ['google-chrome-stable', 'chrome'],
    ['chrome-headless-shell', 'chrome-headless-shell'],
]);

function validExecutable(candidate, context) {
    if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return null;
    const io = context.fs ?? fs;
    try {
        const executable = io.realpathSync(candidate);
        if (!path.isAbsolute(executable) || !io.statSync(executable).isFile()) return null;
        io.accessSync(executable, io.constants.X_OK);
        return executable;
    } catch {
        return null;
    }
}

function resolveWebAccessBrowser(context = {}) {
    if ((context.platform ?? process.platform) !== 'linux') return {status: 'UNAVAILABLE'};
    let config = context.config;
    if (!config) {
        const inspected = require('./web-access-config').inspectWebAccessConfig(context);
        if (inspected.state === 'UNSAFE') return {status: 'UNAVAILABLE'};
        config = inspected.config;
    }
    if (config.browser === 'disabled') return {status: 'UNAVAILABLE'};
    const resolver = context.resolveExecutable ?? resolveExecutable;
    for (const [name, family] of BROWSERS) {
        const executable = validExecutable(resolver(name, context.env ?? process.env), context);
        if (executable) return {status: 'AVAILABLE', family, executable};
    }
    return {status: 'UNAVAILABLE'};
}

module.exports = {BROWSERS, resolveWebAccessBrowser};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
