// $KYAULabs: sensitive-path-policy.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATTERNS = Object.freeze([
    Object.freeze({raw: '~/.local/share/opencode/', className: 'opencode-auth-store', dir: true}),
    Object.freeze({raw: '~/.opencodereview/', className: 'review-config', dir: true}),
    Object.freeze({raw: '~/intelephense/license.txt', className: 'intelephense-license', dir: false}),
    Object.freeze({raw: '~/intelephense/licence.txt', className: 'intelephense-license', dir: false}),
    Object.freeze({raw: '~/.config/opencode/', className: 'prism-user-manifest', dir: true}),
    Object.freeze({raw: '~/.ssh/', className: 'ssh', dir: true}),
    Object.freeze({raw: '~/.aws/', className: 'cloud-credentials', dir: true}),
    Object.freeze({raw: '~/.netrc', className: 'netrc', dir: false}),
    Object.freeze({raw: '~/.git-credentials', className: 'git-credentials', dir: false}),
    Object.freeze({raw: '/etc/ssl/private/', className: 'ssl-private', dir: true}),
]);

const MAX_CANONICALIZE_STEPS = 64;

function windowsPath(value) {
    return /^[a-z]:[\\/]|^\\\\/i.test(value);
}

function pathApi(value, options) {
    return windowsPath(value) || windowsPath(options.home) || windowsPath(options.projectDir) ? path.win32 : path;
}

function normalizeRaw(raw, home, api = path) {
    const expanded = /^~[\\/]/.test(raw) ? `${home}/${raw.slice(2)}` : raw;
    return api.normalize(expanded).replace(/[\\/]+$/, '');
}

function isEnvBasename(name) {
    if (name === '.env.example') return false;
    return name === '.env' || name.startsWith('.env.');
}

function canonicalizePath(value) {
    let current = path.normalize(value);
    const tail = [];
    for (let index = 0; index < MAX_CANONICALIZE_STEPS; index += 1) {
        try {
            const real = fs.realpathSync(current);
            if (tail.length === 0) return path.normalize(real);
            return path.normalize(`${real}/${tail.reverse().join('/')}`);
        } catch (error) {
            if (!['ENOENT', 'ENOTDIR'].includes(error.code)) {
                // eslint-disable-next-line preserve-caught-error -- Filesystem causes can disclose credential paths.
                throw new Error('sensitive path cannot be canonicalized');
            }
            try {
                if (fs.lstatSync(current).isSymbolicLink()) {
                    current = path.resolve(path.dirname(current), fs.readlinkSync(current));
                    continue;
                }
            } catch (linkError) {
                if (!['ENOENT', 'ENOTDIR'].includes(linkError.code)) throw linkError;
            }
            const parent = path.dirname(current);
            // eslint-disable-next-line preserve-caught-error -- Filesystem causes can disclose credential paths.
            if (parent === current) throw new Error('sensitive path cannot be canonicalized');
            tail.push(path.basename(current));
            current = parent;
        }
    }
    throw new Error('sensitive path cannot be canonicalized');
}

function matchNormalized(candidate, options, canonicalPatterns) {
    const api = pathApi(candidate, options);
    const windows = api === path.win32;
    const normalize = value => windows ? value.toLowerCase() : value;
    candidate = normalize(candidate);
    const name = api.basename(candidate);
    if (candidate.split(api.sep).some(isEnvBasename)) return {className: 'env'};
    if (name === 'auth.json' || name === 'mcp-auth.json') {
        return {className: 'opencode-auth-store'};
    }
    for (const pattern of DEFAULT_PATTERNS) {
        const normalized = normalizeRaw(pattern.raw, options.home, api);
        const patternPath = normalize(canonicalPatterns ? canonicalizePath(normalized) : normalized);
        if (candidate === patternPath ||
            (pattern.dir && candidate.startsWith(`${patternPath}${api.sep}`))) {
            return {className: pattern.className};
        }
    }
    for (const raw of options.extraPaths ?? []) {
        const normalized = normalizeRaw(raw, options.home, api);
        const patternPath = normalize(canonicalPatterns ? canonicalizePath(normalized) : normalized);
        const directory = /[\\/]$/.test(raw);
        if (candidate === patternPath || (directory && candidate.startsWith(`${patternPath}${api.sep}`))) {
            return {className: 'additional'};
        }
    }
    return null;
}

function sensitivePathMatch(absPath, options) {
    const api = pathApi(absPath, options);
    const lexical = api.normalize(absPath);
    const direct = matchNormalized(lexical, options, false);
    if (direct !== null) return direct;
    // Synthetic Windows fixtures on POSIX have no Windows filesystem to resolve.
    // Native Windows still performs the ordinary realpath/symlink inspection.
    if (api === path.win32 && process.platform !== 'win32') return null;
    return matchNormalized(canonicalizePath(absPath), options, true);
}

function loadAdditionalSensitivePaths(envValue) {
    if (envValue === undefined || envValue === '') return [];
    const paths = [];
    for (const line of envValue.split('\n')) {
        const entry = line.trim();
        if (entry === '') continue;
        if (!/^~[\\/]/.test(entry) && !entry.startsWith('/') && !windowsPath(entry)) {
            throw new Error('sensitive-paths: manifest entry must be absolute or ~/-prefixed — fail closed (ADR-0047)');
        }
        if (/[\u0000-\u001f\u007f]/.test(entry)) {
            throw new Error('sensitive-paths: manifest entry contains control characters — fail closed (ADR-0047)');
        }
        paths.push(entry);
    }
    return paths;
}

module.exports = {
    DEFAULT_PATTERNS,
    canonicalizePath,
    loadAdditionalSensitivePaths,
    sensitivePathMatch,
    pathApi,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
