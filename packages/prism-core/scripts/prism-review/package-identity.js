// $KYAULabs: package-identity.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {digestJson} = require('./canonical-json');

const MAX_PACKAGE_FILES = 4096;
const MAX_PACKAGE_BYTES = 33554432;

function readHeldFile(filePath, maximum, io) {
    if (typeof io.constants.O_NOFOLLOW !== 'number') {
        throw new Error('authority package no-follow reads are unsupported');
    }
    const before = io.lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink()) {
        throw new Error('authority package file is invalid');
    }
    if (before.size > maximum) throw new Error('authority package exceeds byte limit');
    const descriptor = io.openSync(filePath, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
    try {
        const held = io.fstatSync(descriptor);
        if (!held.isFile() || held.size > maximum) throw new Error('authority package exceeds byte limit');
        const bytes = Buffer.alloc(held.size);
        let offset = 0;
        while (offset < bytes.length) {
            const count = io.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
            if (count === 0) break;
            offset += count;
        }
        const after = io.fstatSync(descriptor);
        if (held.dev !== before.dev || held.ino !== before.ino || offset !== held.size ||
            after.dev !== held.dev || after.ino !== held.ino || after.size !== held.size) {
            throw new Error('authority package file changed');
        }
        return {bytes, mode: held.mode & 0o777};
    } finally {
        io.closeSync(descriptor);
    }
}

function packageFiles(root, current, output, io) {
    for (const name of io.readdirSync(current).sort()) {
        if (name === 'node_modules') continue;
        const absolute = path.join(current, name);
        const identity = io.lstatSync(absolute);
        if (identity.isSymbolicLink()) throw new Error('authority package contains a symbolic link');
        if (identity.isDirectory()) packageFiles(root, absolute, output, io);
        else if (identity.isFile()) output.push({
            absolute,
            path: path.relative(root, absolute).split(path.sep).join('/'),
        });
        else throw new Error('authority package contains an unsupported entry');
        if (output.length > MAX_PACKAGE_FILES) throw new Error('authority package exceeds file limit');
    }
    return output;
}

function packageIdentity(packageRoot, sourceClass, adapter = null, context = {}) {
    const io = context.fs ?? fs;
    const root = io.realpathSync(packageRoot);
    const requested = io.lstatSync(packageRoot);
    if (!requested.isDirectory() || requested.isSymbolicLink() || root !== path.resolve(packageRoot)) {
        throw new Error('authority package root is invalid');
    }
    let total = 0;
    let manifestBytes = null;
    const inventory = packageFiles(root, root, [], io).map((entry) => {
        const held = readHeldFile(entry.absolute, MAX_PACKAGE_BYTES - total, io);
        if (entry.path === 'package.json') manifestBytes = held.bytes;
        total += held.bytes.length;
        return {
            path: entry.path,
            mode: held.mode,
            bytes: held.bytes.length,
            sha256: crypto.createHash('sha256').update(held.bytes).digest('hex'),
        };
    });
    if (manifestBytes === null) throw new Error('authority package manifest is unavailable');
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name ?? '') ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? '')) {
        throw new Error('authority package manifest is invalid');
    }
    const identity = {
        name: manifest.name,
        version: manifest.version,
        digest: digestJson(inventory),
        sourceClass,
    };
    return adapter === null ? identity : {
        ...identity,
        providerId: adapter.id,
        protocolVersion: adapter.protocolVersion,
    };
}

module.exports = {packageIdentity};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
