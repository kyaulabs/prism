'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const {sensitivePathMatch} = require('../sensitive-path-policy');
const DEFAULT_CONFIG = Object.freeze({searxngUrl: null, browser: 'auto'});

function normalizeSearxngUrl(input) {
    if (typeof input !== 'string' || input.length > 2048) throw new Error();
    const url = new URL(input);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) ||
        !(host === 'localhost' || host === '::1' || (net.isIP(host) === 4 && host.startsWith('127.'))) ||
        url.username || url.password || url.search || url.hash) throw new Error();
    return url.origin + url.pathname.replace(/\/+$/, '');
}

function inspectWebAccessConfig(context = {}) {
    const env = context.env ?? process.env;
    const file = context.webAccessPath ?? path.join(context.piDir ?? env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi/agent'), 'prism-web-access.json');
    let fd;
    try {
        if (sensitivePathMatch(path.resolve(file), {home:os.homedir()})) throw new Error();
        let stat;
        try { stat = fs.lstatSync(file); } catch (error) {
            if (error.code === 'ENOENT') return {state:'ABSENT', config:DEFAULT_CONFIG};
            throw error;
        }
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536 || (stat.mode & 0o022)) throw new Error();
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const opened = fs.fstatSync(fd);
        if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > 65536) throw new Error();
        const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (!data || Array.isArray(data) || data.schemaVersion !== 1 ||
            Object.keys(data).some(key => !['schemaVersion','browser','searxngUrl'].includes(key))) throw new Error();
        const browser = data.browser ?? 'auto';
        if (!['auto','disabled'].includes(browser)) throw new Error();
        return {state:'GRANTED', config:{browser, searxngUrl:data.searxngUrl == null ? null : normalizeSearxngUrl(data.searxngUrl)}};
    } catch { return {state:'UNSAFE', config:DEFAULT_CONFIG}; }
    finally { if (fd !== undefined) fs.closeSync(fd); }
}

module.exports = {inspectWebAccessConfig, normalizeSearxngUrl};
