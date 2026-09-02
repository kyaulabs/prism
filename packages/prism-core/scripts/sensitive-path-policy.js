// $KYAULabs: sensitive-path-policy.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

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

function normalizeRaw(raw, home) {
    const expanded = raw.startsWith('~/') ? `${home}/${raw.slice(2)}` : raw;
    return path.normalize(expanded).replace(/\/+$/, '');
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
        } catch {
            const parent = path.dirname(current);
            if (parent === current) return path.normalize(value);
            tail.push(path.basename(current));
            current = parent;
        }
    }
    return path.normalize(value);
}

function sensitivePathMatch(absPath, options) {
    const canonical = canonicalizePath(absPath);
    const name = path.basename(canonical);
    if (isEnvBasename(name)) return {className: 'env'};
    if (name === 'auth.json' || name === 'mcp-auth.json') {
        return {className: 'opencode-auth-store'};
    }
    for (const pattern of DEFAULT_PATTERNS) {
        const patternPath = canonicalizePath(normalizeRaw(pattern.raw, options.home));
        if (canonical === patternPath ||
            (pattern.dir && canonical.startsWith(`${patternPath}/`))) {
            return {className: pattern.className};
        }
    }
    for (const raw of options.extraPaths ?? []) {
        const patternPath = canonicalizePath(normalizeRaw(raw, options.home));
        const directory = raw.endsWith('/');
        if (canonical === patternPath || (directory && canonical.startsWith(`${patternPath}/`))) {
            return {className: 'additional'};
        }
    }
    return null;
}

function loadAdditionalSensitivePaths(envValue) {
    if (envValue === undefined || envValue === '') return [];
    const paths = [];
    for (const line of envValue.split('\n')) {
        const entry = line.trim();
        if (entry === '') continue;
        if (!entry.startsWith('~/') && !entry.startsWith('/')) {
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
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
