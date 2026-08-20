// $KYAULabs: consent.js kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
const SCHEMA = Object.freeze({schemaVersion: 1, ocr: true});
const STATE = Object.freeze({GRANTED: 'GRANTED', ABSENT: 'ABSENT', UNSAFE: 'UNSAFE'});
const FILE_LIMIT = 4096;

class ConsentError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function resolveConsentPath(context = {}) {
    if (context.consentPath !== undefined) return path.resolve(context.consentPath);
    const env = context.env ?? process.env;
    const piDir = context.piDir ?? env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
    return path.join(path.resolve(piDir), 'prism-consent.json');
}

function currentUid(context) {
    if (context.uid !== undefined) return context.uid;
    return typeof process.getuid === 'function' ? process.getuid() : undefined;
}

function isOwned(stat, context) {
    const uid = currentUid(context);
    return uid === undefined || stat.uid === uid;
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

function inspectParent(context, consentPath) {
    const io = context.fs ?? fs;
    const parent = path.dirname(consentPath);
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

function readRecord(context, consentPath) {
    const io = context.fs ?? fs;
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        const pathStat = io.lstatSync(consentPath);
        if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new Error();
        descriptor = io.openSync(consentPath, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
        const stat = io.fstatSync(descriptor);
        if (!stat.isFile() || !isOwned(stat, context) || (stat.mode & 0o777) !== 0o600 ||
            stat.size > FILE_LIMIT || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
            throw new Error();
        }
        const raw = Buffer.alloc(FILE_LIMIT + 1);
        let length = 0;
        while (length < raw.length) {
            const count = io.readSync(descriptor, raw, length, raw.length - length, null);
            if (count === 0) break;
            length += count;
        }
        if (length > FILE_LIMIT) throw new Error();
        io.closeSync(descriptor);
        descriptor = undefined;
        const current = io.lstatSync(consentPath);
        if (!current.isFile() || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) {
            throw new Error();
        }
        const record = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw.subarray(0, length)));
        if (record === null || Array.isArray(record) || typeof record !== 'object' ||
            JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(['ocr', 'schemaVersion']) ||
            record.schemaVersion !== 1 || typeof record.ocr !== 'boolean') {
            throw new Error();
        }
        return {record, stat};
    } catch {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent record is unsafe');
    }
}

function inspectConsentDetail(context = {}) {
    let consentPath;
    try {
        consentPath = resolveConsentPath(context);
    } catch {
        return {path: '', state: STATE.UNSAFE};
    }
    const parent = inspectParent(context, consentPath);
    if (parent.state === STATE.UNSAFE) return {path: consentPath, state: STATE.UNSAFE};
    if (parent.state === STATE.ABSENT) return {parent: parent.parent, path: consentPath, state: STATE.ABSENT};
    const io = context.fs ?? fs;
    try {
        io.lstatSync(consentPath);
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {parent: parent.parent, path: consentPath, state: STATE.ABSENT};
        }
        return {path: consentPath, state: STATE.UNSAFE};
    }
    try {
        const loaded = readRecord(context, consentPath);
        return {
            parent: parent.parent,
            path: consentPath,
            record: loaded.record,
            stat: loaded.stat,
            state: loaded.record.ocr ? STATE.GRANTED : STATE.ABSENT,
        };
    } catch {
        return {path: consentPath, state: STATE.UNSAFE};
    }
}

function inspectConsent(context = {}) {
    const detail = inspectConsentDetail(context);
    return {state: detail.state, path: detail.path};
}

function requireOcrConsent(context = {}) {
    const consent = inspectConsent(context);
    if (consent.state !== STATE.GRANTED) {
        throw new ConsentError(EXIT.READINESS, 'standing OCR consent is required');
    }
    return consent;
}

function ensureParent(context, consentPath) {
    const io = context.fs ?? fs;
    let parent = inspectParent(context, consentPath);
    if (parent.state === STATE.UNSAFE) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent path is unsafe');
    }
    if (parent.state === STATE.ABSENT) {
        try {
            io.mkdirSync(parent.parent, {mode: 0o700});
            if (typeof io.constants.O_NOFOLLOW !== 'number' || typeof io.constants.O_DIRECTORY !== 'number') {
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
            throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent path could not be created');
        }
        parent = inspectParent(context, consentPath);
        if (parent.state !== STATE.GRANTED) {
            throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent path is unsafe');
        }
    }
    return parent.parent;
}

function fsyncDirectory(context, directory) {
    const io = context.fs ?? fs;
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number' || typeof io.constants.O_DIRECTORY !== 'number') {
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
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent directory sync failed');
    }
}

function removeOwnedRecord(context, detail) {
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
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent record could not be removed safely');
    }
}

function grant(context) {
    const initial = inspectConsentDetail(context);
    if (initial.state === STATE.GRANTED) return EXIT.OK;
    if (initial.state === STATE.UNSAFE) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent requires human remediation');
    }
    const consentPath = initial.path || resolveConsentPath(context);
    const parent = ensureParent(context, consentPath);
    if (initial.record?.ocr === false) removeOwnedRecord(context, initial);
    const io = context.fs ?? fs;
    const random = context.randomBytes ?? crypto.randomBytes;
    const nonce = random(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent temporary name failed');
    }
    const temporary = path.join(parent, `.prism-consent-${nonce}.tmp`);
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = io.openSync(
            temporary,
            io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_WRONLY | io.constants.O_NOFOLLOW,
            0o600
        );
        io.writeFileSync(descriptor, `${JSON.stringify(SCHEMA)}\n`);
        io.fchmodSync(descriptor, 0o600);
        io.fsyncSync(descriptor);
        io.closeSync(descriptor);
        descriptor = undefined;
        io.linkSync(temporary, consentPath);
        fsyncDirectory(context, parent);
        const published = inspectConsent(context);
        if (published.state !== STATE.GRANTED) {
            throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent publication failed');
        }
        return EXIT.OK;
    } catch (error) {
        if (error instanceof ConsentError) throw error;
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent publication failed');
    } finally {
        if (descriptor !== undefined) closeQuietly(io, descriptor);
        unlinkQuietly(io, temporary);
    }
}

function revoke(context) {
    const detail = inspectConsentDetail(context);
    if (detail.state === STATE.UNSAFE) {
        throw new ConsentError(EXIT.TRANSACTION, 'standing OCR consent requires human remediation');
    }
    if (!detail.record) return EXIT.OK;
    removeOwnedRecord(context, detail);
    return EXIT.OK;
}

function fail(error) {
    if (error instanceof ConsentError) {
        process.stderr.write(`prism-tool: consent ${error.message}\n`);
        return error.code;
    }
    process.stderr.write('prism-tool: consent operation failed\n');
    return EXIT.TOOL;
}

function consentCommand(args, context = {}) {
    try {
        if (args.length === 2 && args[0] === 'status' && args[1] === '--json') {
            const consent = inspectConsent(context);
            process.stdout.write(`${JSON.stringify({
                schemaVersion: 1,
                command: 'consent status',
                status: consent.state,
                ocr: consent.state === STATE.GRANTED,
            })}\n`);
            return EXIT.OK;
        }
        if (args.length === 2 && args[0] === 'grant-ocr' && args[1] === '--approval=yes') {
            return grant(context);
        }
        if (args.length === 1 && args[0] === 'revoke-ocr') return revoke(context);
        process.stderr.write('usage: prism-tool consent status --json | consent grant-ocr --approval=yes | consent revoke-ocr\n');
        return EXIT.USAGE;
    } catch (error) {
        return fail(error);
    }
}

module.exports = {
    STATE,
    consentCommand,
    inspectConsent,
    requireOcrConsent,
    resolveConsentPath,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
