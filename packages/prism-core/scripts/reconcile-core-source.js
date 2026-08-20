// $KYAULabs: reconcile-core-source.js kyau@aura.kyaulabs 2026/08/20 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CORE_NAME = '@kyaulabs/prism-core';
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SETTINGS_BYTES = 1024 * 1024;

class ReconcileError extends Error {}

function closeQuietly(io, descriptor) {
    try { io.closeSync(descriptor); } catch { return false; }
    return true;
}

function validateDirectory(io, directory, context = {}, sync = false) {
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number' ||
            typeof io.constants.O_DIRECTORY !== 'number') {
            throw new Error();
        }
        descriptor = io.openSync(
            directory,
            io.constants.O_RDONLY | io.constants.O_DIRECTORY | io.constants.O_NOFOLLOW
        );
        const stat = io.fstatSync(descriptor);
        const current = io.lstatSync(directory);
        const uid = context.uid ?? (typeof process.getuid === 'function' ? process.getuid() : undefined);
        if (!stat.isDirectory() || !current.isDirectory() || current.isSymbolicLink() ||
            stat.dev !== current.dev || stat.ino !== current.ino || (stat.mode & 0o022) !== 0 ||
            (uid !== undefined && stat.uid !== uid)) {
            throw new Error();
        }
        if (sync) io.fsyncSync(descriptor);
        io.closeSync(descriptor);
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new ReconcileError('settings reconciliation failed');
    }
}

function unlinkQuietly(io, file) {
    try { io.unlinkSync(file); } catch { return false; }
    return true;
}

function entrySource(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && !Array.isArray(entry) &&
        typeof entry.source === 'string') return entry.source;
    return null;
}

function npmCoreSource(source) {
    return /^npm:@kyaulabs\/prism-core(?:@[^\s@]+)?$/.test(source);
}

function readRegularFile(io, file, limit) {
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = io.openSync(file, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
        const stat = io.fstatSync(descriptor);
        const current = io.lstatSync(file);
        if (!stat.isFile() || !current.isFile() || current.isSymbolicLink() ||
            stat.dev !== current.dev || stat.ino !== current.ino || stat.size > limit) {
            throw new Error();
        }
        const content = io.readFileSync(descriptor, 'utf8');
        io.closeSync(descriptor);
        return content;
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new ReconcileError('settings reconciliation failed');
    }
}

function localCoreSource(io, settingsDirectory, source) {
    if (source.startsWith('npm:')) return null;
    try {
        const root = io.realpathSync(path.resolve(settingsDirectory, source));
        const manifest = JSON.parse(readRegularFile(io, path.join(root, 'package.json'), MAX_MANIFEST_BYTES));
        return manifest && manifest.name === CORE_NAME ? root : null;
    } catch (error) {
        if (error instanceof ReconcileError) return null;
        return null;
    }
}

function publishSettings(io, settingsPath, settings, context = {}) {
    const directory = path.dirname(settingsPath);
    const randomBytes = context.randomBytes ?? crypto.randomBytes;
    const nonce = randomBytes(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(nonce)) throw new ReconcileError('settings reconciliation failed');
    const temporary = path.join(directory, `.${path.basename(settingsPath)}.${nonce}.tmp`);
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = io.openSync(
            temporary,
            io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_WRONLY | io.constants.O_NOFOLLOW,
            0o600
        );
        io.writeFileSync(descriptor, `${JSON.stringify(settings, null, 2)}\n`);
        io.fchmodSync(descriptor, 0o600);
        io.fsyncSync(descriptor);
        io.closeSync(descriptor);
        descriptor = undefined;
        io.renameSync(temporary, settingsPath);
        validateDirectory(io, directory, context, true);
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        unlinkQuietly(io, temporary);
        throw new ReconcileError('settings reconciliation failed');
    }
}

function reconcileCoreSource(settingsPath, selectedSource, context = {}) {
    const io = context.fs ?? fs;
    validateDirectory(io, path.dirname(settingsPath), context);
    let settings;
    try {
        settings = JSON.parse(readRegularFile(io, settingsPath, MAX_SETTINGS_BYTES));
    } catch {
        throw new ReconcileError('settings reconciliation failed');
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
        !Array.isArray(settings.packages)) {
        throw new ReconcileError('settings reconciliation failed');
    }

    const settingsDirectory = path.dirname(settingsPath);
    const selectedNpm = npmCoreSource(selectedSource);
    const selectedLocal = selectedNpm ? null : localCoreSource(io, settingsDirectory, selectedSource);
    if (!selectedNpm && selectedLocal === null) throw new ReconcileError('settings reconciliation failed');

    let retained = false;
    let removed = 0;
    const packages = [];
    for (const entry of settings.packages) {
        const source = entrySource(entry);
        if (source === null) {
            packages.push(entry);
            continue;
        }
        const npmCore = npmCoreSource(source);
        const localCore = npmCore ? null : localCoreSource(io, settingsDirectory, source);
        const selected = selectedNpm ? source === selectedSource : localCore === selectedLocal;
        if ((npmCore || localCore !== null) && selected) {
            if (!retained) {
                packages.push(entry);
                retained = true;
            } else {
                removed += 1;
            }
        } else if (npmCore || localCore !== null) {
            removed += 1;
        } else {
            packages.push(entry);
        }
    }
    if (!retained) throw new ReconcileError('settings reconciliation failed');

    publishSettings(io, settingsPath, {...settings, packages}, context);
    return {removed, retained: selectedNpm ? selectedSource : selectedLocal};
}

function main(args) {
    if (args.length !== 2) return 1;
    try {
        reconcileCoreSource(args[0], args[1]);
        return 0;
    } catch {
        process.stderr.write('✗ Prism Core settings reconciliation failed.\n');
        return 1;
    }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {ReconcileError, reconcileCoreSource};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
