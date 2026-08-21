// $KYAULabs: commit.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
const USAGE = 'usage: prism-tool commit create --type TYPE [--scope SCOPE] --subject SUBJECT ' +
    '[--body-file PATH] [--fixes NN | --refs NN]\n';
const TYPES = new Set([
    'build', 'chore', 'ci', 'docs', 'feat', 'fix', 'ignore', 'patch', 'perf',
    'refactor', 'style', 'test',
]);
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MODEL_RE = /^[A-Za-z0-9._-]+$/;
const IDENTITY_RE = /^[^<>\r\n]+ <[^<>\s@]+@[^<>\s@]+>$/;

class CommitError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function fail(error) {
    if (error instanceof CommitError) {
        process.stderr.write(`prism-tool: commit ${error.message}\n`);
        return error.code;
    }
    process.stderr.write('prism-tool: commit operation failed\n');
    return EXIT.TOOL;
}

function resultText(result) {
    if (Buffer.isBuffer(result.stdout)) return result.stdout.toString('utf8');
    return result.stdout ?? '';
}

function invoke(context, command, args, options = {}) {
    return (context.run ?? require('./process').runBounded)(command, args, {
        cwd: context.cwd ?? process.cwd(),
        env: context.env ?? process.env,
        maxBuffer: context.maxBuffer,
        timeout: context.timeout,
        ...options,
    });
}

function requireSuccess(result, code, message) {
    if (result.error || result.status !== 0) throw new CommitError(code, message);
    return result;
}

function parseCreate(args) {
    const parsed = {};
    const rank = new Map([
        ['--type', 0], ['--scope', 1], ['--subject', 2], ['--body-file', 3],
        ['--fixes', 4], ['--refs', 4],
    ]);
    let previous = -1;
    for (let index = 0; index < args.length; index += 2) {
        const control = args[index];
        const value = args[index + 1];
        if (!rank.has(control) || value === undefined || value.startsWith('--')) {
            throw new CommitError(EXIT.USAGE, 'create arguments are invalid');
        }
        const key = control.slice(2).replace('-', '');
        const current = rank.get(control);
        if (current < previous || Object.hasOwn(parsed, key)) {
            throw new CommitError(EXIT.USAGE, 'create arguments are invalid');
        }
        if ((control === '--fixes' && Object.hasOwn(parsed, 'refs')) ||
            (control === '--refs' && Object.hasOwn(parsed, 'fixes'))) {
            throw new CommitError(EXIT.USAGE, 'create arguments are invalid');
        }
        parsed[key] = value;
        previous = current;
    }
    if (!Object.hasOwn(parsed, 'type') || !Object.hasOwn(parsed, 'subject')) {
        throw new CommitError(EXIT.USAGE, 'create arguments are invalid');
    }
    return parsed;
}

function hasForbiddenControl(value, allowLayout = false) {
    for (const character of value) {
        const code = character.codePointAt(0);
        if ((code < 32 && (!allowLayout || (code !== 9 && code !== 10))) || code === 127) return true;
    }
    return false;
}

function closeQuietly(descriptor) {
    try { fs.closeSync(descriptor); } catch { return false; }
    return true;
}

function unlinkWith(io, file) {
    try { io.unlinkSync(file); } catch { return false; }
    return true;
}

function rmdirWith(io, directory) {
    try { io.rmdirSync(directory); } catch { return false; }
    return true;
}

function validateStructured(parsed) {
    if (!TYPES.has(parsed.type)) throw new CommitError(EXIT.USAGE, 'type is invalid');
    if (parsed.scope !== undefined &&
        (!/^[a-z0-9][a-z0-9._/-]*$/.test(parsed.scope) ||
        /[._/-]$/.test(parsed.scope) || /[._/-]{2}/.test(parsed.scope))) {
        throw new CommitError(EXIT.USAGE, 'scope is invalid');
    }
    if (parsed.subject === '' || hasForbiddenControl(parsed.subject)) {
        throw new CommitError(EXIT.USAGE, 'subject is invalid');
    }
    const header = `${parsed.type}${parsed.scope === undefined ? '' : `(${parsed.scope})`}: ${parsed.subject}`;
    if (header.length > 100) throw new CommitError(EXIT.USAGE, 'subject exceeds the header limit');
    for (const issue of ['fixes', 'refs']) {
        if (parsed[issue] !== undefined && !/^[1-9][0-9]*$/.test(parsed[issue])) {
            throw new CommitError(EXIT.USAGE, 'issue number is invalid');
        }
    }
    return header;
}

function resolveAttribution(context, coreRoot) {
    const env = context.env ?? process.env;
    const model = env.PI_MODEL;
    const modelId = typeof model === 'string' ? model.slice(model.lastIndexOf('/') + 1) : '';
    if (typeof model !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(model) || !MODEL_RE.test(modelId)) {
        throw new CommitError(EXIT.READINESS, 'current pi model is unavailable');
    }
    const identityResult = requireSuccess(
        invoke(context, 'bash', [path.join(coreRoot, 'scripts', 'resolve-identity.sh')]),
        EXIT.READINESS,
        'identity resolution failed'
    );
    const identity = resultText(identityResult).trim();
    if (!IDENTITY_RE.test(identity)) throw new CommitError(EXIT.READINESS, 'identity resolution failed');
    const ocrResult = requireSuccess(
        invoke(context, 'bash', [path.join(coreRoot, 'scripts', 'resolve-ocr-model.sh')]),
        EXIT.READINESS,
        'OCR model resolution failed'
    );
    const ocrModel = resultText(ocrResult).trim();
    if (!MODEL_RE.test(ocrModel)) throw new CommitError(EXIT.READINESS, 'OCR model resolution failed');
    return {identity, modelId, ocrModel};
}

function readBodyFile(file, repository) {
    let descriptor;
    try {
        if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error();
        const requested = path.resolve(repository, file);
        const resolved = fs.realpathSync(requested);
        const relation = path.relative(repository, resolved);
        if (relation.startsWith('..') || path.isAbsolute(relation)) throw new Error();
        descriptor = fs.openSync(requested, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.size > 65536) throw new Error();
        const buffer = fs.readFileSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        let body = new TextDecoder('utf-8', {fatal: true}).decode(buffer);
        body = body.replace(/\r\n?/g, '\n').replace(/\n$/, '');
        if (hasForbiddenControl(body, true)) throw new Error();
        return body;
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new CommitError(EXIT.USAGE, 'body file is invalid');
    }
}

function buildMessage(header, parsed, attribution, body = '') {
    const sections = [header];
    if (body !== '') sections.push(body);
    const footers = [];
    if (parsed.fixes !== undefined) footers.push(`Fixes: #${parsed.fixes}`);
    if (parsed.refs !== undefined) footers.push(`Refs: #${parsed.refs}`);
    footers.push(
        `Implemented-by: ${attribution.modelId}`,
        `Tested-by: ${attribution.ocrModel}`,
        `Signed-off-by: ${attribution.identity}`
    );
    sections.push(footers.join('\n'));
    return `${sections.join('\n\n')}\n`;
}

function shaValue(result, message) {
    const value = resultText(result).trim();
    if (!SHA_RE.test(value)) throw new CommitError(EXIT.TOOL, message);
    return value;
}

function repositoryState(context, coreRoot) {
    const rootResult = requireSuccess(
        invoke(context, 'git', ['rev-parse', '--show-toplevel']), EXIT.TOOL, 'repository is unavailable'
    );
    let repository;
    try {
        repository = fs.realpathSync(resultText(rootResult).trim());
    } catch {
        throw new CommitError(EXIT.TOOL, 'repository is unavailable');
    }
    const branchResult = requireSuccess(
        invoke(context, 'git', ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        EXIT.TOOL,
        'detached HEAD is not supported'
    );
    const branch = resultText(branchResult).trim();
    const branchCheck = invoke(context, 'bash', [path.join(coreRoot, 'scripts', 'validate-branch-name.sh'), branch]);
    const headResult = invoke(context, 'git', ['rev-parse', '--verify', 'HEAD']);
    const unborn = headResult.status !== 0 && !headResult.error;
    if (branchCheck.error || (branchCheck.status !== 0 && branchCheck.status !== 3)) {
        throw new CommitError(EXIT.TOOL, 'branch is invalid');
    }
    if (branchCheck.status === 3) {
        const remote = invoke(context, 'git', ['branch', '-r', '--list', `*/${branch}`]);
        if (!unborn || remote.error || remote.status !== 0 || resultText(remote).trim() !== '') {
            throw new CommitError(EXIT.TOOL, 'protected branch is not writable');
        }
    }
    const head = unborn ? 'unborn' : shaValue(headResult, 'HEAD is invalid');
    const staged = invoke(context, 'git', ['diff', '--cached', '--quiet', '--']);
    if (staged.error || (staged.status !== 0 && staged.status !== 1)) {
        throw new CommitError(EXIT.TOOL, 'staged state is unavailable');
    }
    if (staged.status === 0) throw new CommitError(EXIT.TOOL, 'staged changes are required');
    const tree = shaValue(
        requireSuccess(invoke(context, 'git', ['write-tree']), EXIT.TOOL, 'staged state is unavailable'),
        'staged state is invalid'
    );
    return {branch, head, repository, tree};
}

function ensurePrivateDirectory(io, directory) {
    try {
        if (!io.existsSync(directory)) io.mkdirSync(directory, {mode: 0o700});
        const stat = io.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) throw new Error();
        if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error();
    } catch {
        throw new CommitError(EXIT.TRANSACTION, 'private directory is unsafe');
    }
}

function writePrivate(io, file, content) {
    let descriptor;
    try {
        if (typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = io.openSync(file, io.constants.O_CREAT | io.constants.O_EXCL |
            io.constants.O_WRONLY | io.constants.O_NOFOLLOW, 0o600);
        io.writeFileSync(descriptor, content);
        io.fchmodSync(descriptor, 0o600);
        io.closeSync(descriptor);
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new CommitError(EXIT.TRANSACTION, 'private file could not be written');
    }
}

function lockIndex(context, repository) {
    const io = context.fs ?? fs;
    const result = requireSuccess(
        invoke(context, 'git', ['rev-parse', '--path-format=absolute', '--git-path', 'index'], {cwd: repository}),
        EXIT.TOOL,
        'Git index is unavailable'
    );
    const indexFile = resultText(result).trim();
    const lockFile = `${indexFile}.lock`;
    let source;
    let target;
    let lockCreated = false;
    try {
        if (!path.isAbsolute(indexFile) || typeof io.constants.O_NOFOLLOW !== 'number') throw new Error();
        const pathStat = io.lstatSync(indexFile);
        if (!pathStat.isFile() || pathStat.isSymbolicLink()) throw new Error();
        source = io.openSync(indexFile, io.constants.O_RDONLY | io.constants.O_NOFOLLOW);
        const sourceStat = io.fstatSync(source);
        if (!sourceStat.isFile() || sourceStat.dev !== pathStat.dev || sourceStat.ino !== pathStat.ino) {
            throw new Error();
        }
        target = io.openSync(
            lockFile,
            io.constants.O_CREAT | io.constants.O_EXCL | io.constants.O_WRONLY | io.constants.O_NOFOLLOW,
            0o600
        );
        lockCreated = true;
        const buffer = Buffer.alloc(65536);
        let position = 0;
        while (true) {
            const count = io.readSync(source, buffer, 0, buffer.length, position);
            if (count === 0) break;
            let written = 0;
            while (written < count) {
                const next = io.writeSync(target, buffer, written, count - written, position + written);
                if (next <= 0) throw new Error();
                written += next;
            }
            position += count;
        }
        io.fchmodSync(target, 0o600);
        io.fsyncSync(target);
        io.closeSync(target);
        target = undefined;
        io.closeSync(source);
        source = undefined;
        const current = io.lstatSync(indexFile);
        if (!current.isFile() || current.isSymbolicLink() ||
            current.dev !== sourceStat.dev || current.ino !== sourceStat.ino) {
            throw new Error();
        }
    } catch {
        if (target !== undefined) closeQuietly(target);
        if (source !== undefined) closeQuietly(source);
        if (lockCreated) unlinkWith(io, lockFile);
        throw new CommitError(EXIT.TRANSACTION, 'Git index could not be locked safely');
    }
    return {
        file: lockFile,
        publish() {
            try {
                io.renameSync(lockFile, indexFile);
            } catch {
                throw new CommitError(EXIT.TRANSACTION, 'locked index publication failed');
            }
        },
        discard() {
            try {
                io.unlinkSync(lockFile);
                return true;
            } catch {
                return false;
            }
        },
    };
}

function createPrivateMessage(context, repository, message) {
    const io = context.fs ?? fs;
    const gitResult = requireSuccess(
        invoke(context, 'git', ['rev-parse', '--path-format=absolute', '--git-dir'], {cwd: repository}),
        EXIT.TOOL,
        'Git directory is unavailable'
    );
    let gitDir;
    try {
        gitDir = fs.realpathSync(resultText(gitResult).trim());
    } catch {
        throw new CommitError(EXIT.TOOL, 'Git directory is unsafe');
    }
    const prismDir = path.join(gitDir, 'prism-tool');
    ensurePrivateDirectory(io, prismDir);
    const random = context.randomBytes ?? crypto.randomBytes;
    const operationId = random(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(operationId)) {
        throw new CommitError(EXIT.TOOL, 'message identifier failed');
    }
    const operationDir = path.join(prismDir, `commit-create-${operationId}`);
    let operationCreated = false;
    try {
        io.mkdirSync(operationDir, {mode: 0o700});
        operationCreated = true;
        ensurePrivateDirectory(io, operationDir);
    } catch {
        if (operationCreated) rmdirWith(io, operationDir);
        throw new CommitError(EXIT.TOOL, 'message directory could not be created');
    }
    const messageFile = path.join(operationDir, 'message.txt');
    try {
        writePrivate(io, messageFile, message);
    } catch (error) {
        unlinkWith(io, messageFile);
        rmdirWith(io, operationDir);
        throw error;
    }
    return {
        file: messageFile,
        cleanup() {
            const unlinked = unlinkWith(io, messageFile);
            const removed = rmdirWith(io, operationDir);
            return unlinked && removed;
        },
    };
}

function create(args, context) {
    const parsed = parseCreate(args);
    const header = validateStructured(parsed);
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    requireSuccess(
        invoke(context, process.execPath, [launcher, 'doctor', '--local-only']),
        EXIT.READINESS,
        'local readiness failed'
    );
    const state = repositoryState(context, coreRoot);
    const body = parsed.bodyfile === undefined ? '' : readBodyFile(parsed.bodyfile, state.repository);
    const attribution = resolveAttribution(context, coreRoot);
    const message = buildMessage(header, parsed, attribution, body);
    requireSuccess(
        invoke(context, process.execPath, [launcher, 'run', 'commitlint', '--'], {input: message}),
        EXIT.TOOL,
        'commitlint rejected the message'
    );
    const owned = createPrivateMessage(context, state.repository, message);
    let locked;
    let committed = false;
    let newHead;
    let operationError;
    try {
        const latest = repositoryState(context, coreRoot);
        if (latest.repository !== state.repository || latest.branch !== state.branch ||
            latest.head !== state.head || latest.tree !== state.tree) {
            throw new CommitError(EXIT.TRANSACTION, 'repository state changed');
        }
        locked = lockIndex(context, state.repository);
        const commitEnv = {...(context.env ?? process.env), GIT_INDEX_FILE: locked.file};
        const lockedTree = shaValue(
            requireSuccess(
                invoke(context, 'git', ['write-tree'], {cwd: state.repository, env: commitEnv}),
                EXIT.TRANSACTION,
                'locked index is unavailable'
            ),
            'locked index is invalid'
        );
        if (lockedTree !== state.tree) throw new CommitError(EXIT.TRANSACTION, 'repository state changed');
        const commitResult = invoke(context, 'git', ['commit', '-S', '-F', owned.file], {env: commitEnv});
        if (commitResult.error || commitResult.status !== 0) {
            const detail = `${resultText(commitResult)}\n${commitResult.stderr ?? ''}`;
            const signing = commitResult.error || /gpg|signing/i.test(detail);
            throw new CommitError(
                EXIT.TOOL,
                signing
                    ? 'signed Git commit failed'
                    : 'a repository hook rejected the commit; run the repository hooks locally for diagnostics'
            );
        }
        locked.publish();
        committed = true;
        newHead = shaValue(
            requireSuccess(
                invoke(context, 'git', ['rev-parse', '--verify', 'HEAD']),
                EXIT.TOOL,
                'committed HEAD is unavailable'
            ),
            'committed HEAD is invalid'
        );
        if (newHead === state.head) throw new CommitError(EXIT.TOOL, 'HEAD did not advance');
    } catch (error) {
        operationError = error;
    }
    let cleanupError;
    if (locked !== undefined && !committed && !locked.discard()) {
        cleanupError = new CommitError(EXIT.TRANSACTION, 'Git index lock cleanup failed');
    }
    if (!owned.cleanup()) {
        cleanupError = new CommitError(EXIT.TRANSACTION, 'private message cleanup failed');
    }
    if (cleanupError) throw cleanupError;
    if (operationError) throw operationError;
    process.stdout.write(`${message}\nCommit: ${newHead}\n`);
    return EXIT.OK;
}

function commitCommand(args, context = {}) {
    try {
        if (args[0] === 'create') return create(args.slice(1), context);
        process.stderr.write(USAGE);
        return EXIT.USAGE;
    } catch (error) {
        return fail(error);
    }
}

module.exports = {commitCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
