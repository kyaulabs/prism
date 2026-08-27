// $KYAULabs: managed-record.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const STATE = Object.freeze({GRANTED: 'GRANTED', ABSENT: 'ABSENT', UNSAFE: 'UNSAFE'});

function resolveManagedPath(filename, context = {}) {
    if (context.managedPath !== undefined) return path.resolve(context.managedPath);
    const env = context.env ?? process.env;
    const piDir = context.piDir ?? env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
    return path.join(path.resolve(piDir), filename);
}

function currentUid(context) {
    if (context.uid !== undefined) return context.uid;
    return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function isOwned(stat, context) {
    const uid = currentUid(context);
    return uid === undefined || stat.uid === uid;
}

function matchesManagedRecord(stat, expected, context) {
    return expected !== undefined && stat.isFile() && !stat.isSymbolicLink() &&
        isOwned(stat, context) && (stat.mode & 0o777) === 0o600 &&
        stat.dev === expected.dev && stat.ino === expected.ino;
}

function isTrustedAncestor(stat, context) {
    const uid = currentUid(context);
    const trustedOwner = uid === undefined || stat.uid === uid || stat.uid === 0;
    const writable = (stat.mode & 0o022) !== 0;
    const sticky = (stat.mode & 0o1000) !== 0;
    return trustedOwner && (!writable || sticky);
}

function closeQuietly(io, descriptor) {
    try { io.closeSync(descriptor); } catch { return false; }
    return true;
}

function unlinkQuietly(io, file) {
    try { io.unlinkSync(file); } catch { return false; }
    return true;
}

function pathComponents(absolutePath) {
    const parsed = path.parse(absolutePath);
    const relative = absolutePath.slice(parsed.root.length).split(path.sep).filter(Boolean);
    const components = [parsed.root];
    let current = parsed.root;
    for (const segment of relative) {
        current = path.join(current, segment);
        components.push(current);
    }
    return components;
}

function inspectParent(context, managedPath) {
    const io = context.fs ?? fs;
    const parent = path.dirname(managedPath);
    const components = pathComponents(parent);
    for (let index = 0; index < components.length; index += 1) {
        const component = components[index];
        let stat;
        try {
            stat = io.lstatSync(component);
        } catch (error) {
            if (error?.code === 'ENOENT' && index === components.length - 1) {
                return {parent, state: STATE.ABSENT};
            }
            return {parent, state: STATE.UNSAFE};
        }
        if (!stat.isDirectory() || stat.isSymbolicLink()) return {parent, state: STATE.UNSAFE};
        if (index < components.length - 1 && !isTrustedAncestor(stat, context)) {
            return {parent, state: STATE.UNSAFE};
        }
        if (index === components.length - 1 &&
            (!isOwned(stat, context) || (stat.mode & 0o022) !== 0)) {
            return {parent, state: STATE.UNSAFE};
        }
    }
    return {parent, state: STATE.GRANTED};
}

function readRecord({context, managedPath, limit, parse}) {
    const io = context.fs ?? fs;
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        const pathStat = io.lstatSync(managedPath);
        if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new Error();
        descriptor = io.openSync(managedPath, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
        const stat = io.fstatSync(descriptor);
        if (!stat.isFile() || !isOwned(stat, context) || (stat.mode & 0o777) !== 0o600 ||
            stat.size > limit || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
            throw new Error();
        }
        const raw = Buffer.alloc(limit + 1);
        let length = 0;
        while (length < raw.length) {
            const count = io.readSync(descriptor, raw, length, raw.length - length, null);
            if (count === 0) break;
            length += count;
        }
        if (length > limit) throw new Error();
        io.closeSync(descriptor);
        descriptor = undefined;
        const current = io.lstatSync(managedPath);
        if (!current.isFile() || current.isSymbolicLink() ||
            current.dev !== stat.dev || current.ino !== stat.ino) {
            throw new Error();
        }
        const decoded = new TextDecoder('utf-8', {fatal: true}).decode(raw.subarray(0, length));
        return {record: parse(JSON.parse(decoded)), stat};
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new Error('managed record is unsafe');
    }
}

function inspectManagedRecord({context = {}, filename, limit = 4096, parse}) {
    let managedPath;
    try {
        managedPath = resolveManagedPath(filename, context);
    } catch {
        return {path: '', state: STATE.UNSAFE};
    }
    const parent = inspectParent(context, managedPath);
    if (parent.state === STATE.UNSAFE) return {path: managedPath, state: STATE.UNSAFE};
    if (parent.state === STATE.ABSENT) {
        return {parent: parent.parent, path: managedPath, state: STATE.ABSENT};
    }
    const io = context.fs ?? fs;
    try {
        io.lstatSync(managedPath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {parent: parent.parent, path: managedPath, state: STATE.ABSENT};
        }
        return {path: managedPath, state: STATE.UNSAFE};
    }
    try {
        const loaded = readRecord({context, managedPath, limit, parse});
        return {
            parent: parent.parent,
            path: managedPath,
            record: loaded.record,
            stat: loaded.stat,
            state: STATE.GRANTED,
        };
    } catch {
        return {path: managedPath, state: STATE.UNSAFE};
    }
}

function ensureParent(context, managedPath) {
    const io = context.fs ?? fs;
    let parent = inspectParent(context, managedPath);
    if (parent.state === STATE.UNSAFE) throw new Error('managed record path is unsafe');
    if (parent.state === STATE.ABSENT) {
        try {
            io.mkdirSync(parent.parent, {mode: 0o700});
            if (typeof io.constants.O_NOFOLLOW !== 'number' ||
                typeof io.constants.O_DIRECTORY !== 'number') {
                throw new Error();
            }
            const descriptor = io.openSync(
                parent.parent,
                io.constants.O_RDONLY | io.constants.O_DIRECTORY | io.constants.O_NOFOLLOW
            );
            try {
                io.fchmodSync(descriptor, 0o700);
                io.fsyncSync(descriptor);
            } finally {
                closeQuietly(io, descriptor);
            }
        } catch {
            throw new Error('managed record path could not be created');
        }
        parent = inspectParent(context, managedPath);
        if (parent.state !== STATE.GRANTED) throw new Error('managed record path is unsafe');
    }
    return parent.parent;
}

function fsyncDirectory(context, directory) {
    const io = context.fs ?? fs;
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
        if (!stat.isDirectory() || !isOwned(stat, context) || (stat.mode & 0o022) !== 0) throw new Error();
        io.fsyncSync(descriptor);
        io.closeSync(descriptor);
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new Error('managed record directory sync failed');
    }
}

function removeManagedRecord({context = {}, detail}) {
    const io = context.fs ?? fs;
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = io.openSync(detail.path, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
        const stat = io.fstatSync(descriptor);
        const current = io.lstatSync(detail.path);
        if (!stat.isFile() || !current.isFile() || current.isSymbolicLink() ||
            !isOwned(stat, context) || (stat.mode & 0o777) !== 0o600 ||
            stat.dev !== current.dev || stat.ino !== current.ino ||
            (detail.stat && (stat.dev !== detail.stat.dev || stat.ino !== detail.stat.ino))) {
            throw new Error();
        }
        io.closeSync(descriptor);
        descriptor = undefined;
        io.unlinkSync(detail.path);
        fsyncDirectory(context, detail.parent);
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new Error('managed record could not be removed safely');
    }
}

function publishManagedRecord({context = {}, detail, filename, record, parse, limit = 4096}) {
    const managedPath = detail.path || resolveManagedPath(filename, context);
    const parent = ensureParent(context, managedPath);
    const io = context.fs ?? fs;
    const random = context.randomBytes ?? crypto.randomBytes;
    const nonce = random(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(nonce)) throw new Error('managed record temporary name failed');
    const temporary = path.join(parent, `.prism-managed-${nonce}.tmp`);
    const backup = path.join(parent, `.prism-managed-${nonce}.bak`);
    const serialized = `${JSON.stringify(record)}\n`;
    let backupDescriptor;
    let backupStat;
    let descriptor;
    let priorRemoved = false;
    let temporaryStat;
    try {
        if (Buffer.byteLength(serialized, 'utf8') > limit ||
            typeof io.constants.O_NOFOLLOW !== 'number') {
            throw new Error();
        }
        descriptor = io.openSync(
            temporary,
            io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_WRONLY | io.constants.O_NOFOLLOW,
            0o600
        );
        io.writeFileSync(descriptor, serialized);
        io.fchmodSync(descriptor, 0o600);
        io.fsyncSync(descriptor);
        temporaryStat = io.fstatSync(descriptor);
        io.closeSync(descriptor);
        descriptor = undefined;
        if (detail.record) {
            io.linkSync(managedPath, backup);
            backupDescriptor = io.openSync(backup, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
            backupStat = io.fstatSync(backupDescriptor);
            const backupPathStat = io.lstatSync(backup);
            if (!matchesManagedRecord(backupStat, detail.stat, context) ||
                !matchesManagedRecord(backupPathStat, backupStat, context)) {
                throw new Error();
            }
            priorRemoved = true;
            removeManagedRecord({context, detail});
        }
        io.linkSync(temporary, managedPath);
        fsyncDirectory(context, parent);
        const published = inspectManagedRecord({context, filename, limit, parse});
        if (published.state !== STATE.GRANTED ||
            JSON.stringify(published.record) !== JSON.stringify(record)) {
            throw new Error();
        }
    } catch {
        if (priorRemoved) {
            try {
                const current = io.lstatSync(managedPath);
                if (temporaryStat && current.isFile() && !current.isSymbolicLink() &&
                    current.dev === temporaryStat.dev && current.ino === temporaryStat.ino) {
                    io.unlinkSync(managedPath);
                }
            } catch { }
            try {
                io.lstatSync(managedPath);
            } catch (error) {
                if (error?.code === 'ENOENT') {
                    try {
                        const pinnedBackup = io.fstatSync(backupDescriptor);
                        const currentBackup = io.lstatSync(backup);
                        if (!matchesManagedRecord(pinnedBackup, backupStat, context) ||
                            !matchesManagedRecord(currentBackup, pinnedBackup, context)) {
                            throw new Error();
                        }
                        io.linkSync(backup, managedPath);
                        const restored = io.lstatSync(managedPath);
                        const backupAfter = io.lstatSync(backup);
                        if (!matchesManagedRecord(restored, pinnedBackup, context) ||
                            !matchesManagedRecord(backupAfter, pinnedBackup, context)) {
                            if (restored.isFile() && !restored.isSymbolicLink() &&
                                restored.dev === backupAfter.dev && restored.ino === backupAfter.ino) {
                                io.unlinkSync(managedPath);
                            }
                            throw new Error();
                        }
                        fsyncDirectory(context, parent);
                    } catch { }
                }
            }
        }
        throw new Error('managed record publication failed');
    } finally {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        if (backupDescriptor !== undefined) closeQuietly(io, backupDescriptor);
        unlinkQuietly(io, temporary);
        unlinkQuietly(io, backup);
    }
}

module.exports = {
    STATE,
    inspectManagedRecord,
    publishManagedRecord,
    removeManagedRecord,
    resolveManagedPath,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
