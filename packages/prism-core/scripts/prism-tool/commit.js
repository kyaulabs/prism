// $KYAULabs: commit.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
const USAGE = 'usage: prism-tool commit prepare --type TYPE [--scope SCOPE] --subject SUBJECT ' +
    '[--body-file PATH] [--fixes NN | --refs NN] | prism-tool commit apply --plan PLAN_ID ' +
    '--approval=yes | prism-tool commit discard --plan PLAN_ID\n';
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

function parsePrepare(args) {
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
            throw new CommitError(EXIT.USAGE, 'prepare arguments are invalid');
        }
        const key = control.slice(2).replace('-', '');
        const current = rank.get(control);
        if (current < previous || Object.hasOwn(parsed, key)) {
            throw new CommitError(EXIT.USAGE, 'prepare arguments are invalid');
        }
        if ((control === '--fixes' && Object.hasOwn(parsed, 'refs')) ||
            (control === '--refs' && Object.hasOwn(parsed, 'fixes'))) {
            throw new CommitError(EXIT.USAGE, 'prepare arguments are invalid');
        }
        parsed[key] = value;
        previous = current;
    }
    if (!Object.hasOwn(parsed, 'type') || !Object.hasOwn(parsed, 'subject')) {
        throw new CommitError(EXIT.USAGE, 'prepare arguments are invalid');
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

function unlinkQuietly(file) {
    try { fs.unlinkSync(file); } catch { return false; }
    return true;
}

function rmdirQuietly(directory) {
    try { fs.rmdirSync(directory); } catch { return false; }
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
    return {branch, head, repository};
}

function indexFingerprint(context) {
    const result = invoke(context, 'git', ['ls-files', '--stage', '-z'], {encoding: null});
    if (result.error || result.status !== 0) throw new CommitError(EXIT.TOOL, 'staged index fingerprint failed');
    const output = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '', 'utf8');
    return crypto.createHash('sha256').update(output).digest('hex');
}

function ensurePrivateDirectory(directory) {
    try {
        if (!fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700});
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) throw new Error();
        if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error();
    } catch {
        throw new CommitError(EXIT.TRANSACTION, 'plan directory is unsafe');
    }
}

function writePrivate(file, content) {
    let descriptor;
    try {
        const noFollow = fs.constants.O_NOFOLLOW ?? 0;
        descriptor = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL |
            fs.constants.O_WRONLY | noFollow, 0o600);
        fs.writeFileSync(descriptor, content);
        fs.fchmodSync(descriptor, 0o600);
        fs.closeSync(descriptor);
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new CommitError(EXIT.TRANSACTION, 'plan could not be written');
    }
}

function createPlan(context, state, message, fingerprint) {
    const gitResult = requireSuccess(
        invoke(context, 'git', ['rev-parse', '--path-format=absolute', '--git-dir']),
        EXIT.TOOL,
        'Git directory is unavailable'
    );
    let gitDir;
    try {
        gitDir = fs.realpathSync(resultText(gitResult).trim());
    } catch {
        throw new CommitError(EXIT.TRANSACTION, 'Git directory is unsafe');
    }
    const prismDir = path.join(gitDir, 'prism-tool');
    const plansDir = path.join(prismDir, 'commit-plans');
    ensurePrivateDirectory(prismDir);
    ensurePrivateDirectory(plansDir);
    const random = context.randomBytes ?? crypto.randomBytes;
    const planId = random(16).toString('hex');
    if (!/^[0-9a-f]{32}$/.test(planId)) throw new CommitError(EXIT.TRANSACTION, 'plan identifier failed');
    const planDir = path.join(plansDir, planId);
    try {
        fs.mkdirSync(planDir, {mode: 0o700});
    } catch {
        throw new CommitError(EXIT.TRANSACTION, 'plan could not be created');
    }
    const plan = {
        schemaVersion: 1,
        repository: state.repository,
        branch: state.branch,
        head: state.head,
        indexFingerprint: fingerprint,
        messageSha256: crypto.createHash('sha256').update(message).digest('hex'),
        createdAt: (context.now ?? (() => new Date().toISOString()))(),
    };
    try {
        writePrivate(path.join(planDir, 'plan.json'), `${JSON.stringify(plan)}\n`);
        writePrivate(path.join(planDir, 'message.txt'), message);
    } catch (error) {
        for (const name of ['plan.json', 'message.txt']) unlinkQuietly(path.join(planDir, name));
        rmdirQuietly(planDir);
        throw error;
    }
    return planId;
}

function parseApply(args) {
    if (args.length !== 3 || args[0] !== '--plan' || args[2] !== '--approval=yes' ||
        !/^[0-9a-f]{32}$/.test(args[1])) {
        throw new CommitError(EXIT.USAGE, 'apply arguments are invalid');
    }
    return args[1];
}

function resolvePlanDirectory(context, planId) {
    const gitResult = requireSuccess(
        invoke(context, 'git', ['rev-parse', '--path-format=absolute', '--git-dir']),
        EXIT.TRANSACTION,
        'plan repository is unavailable'
    );
    let gitDir;
    try {
        gitDir = fs.realpathSync(resultText(gitResult).trim());
    } catch {
        throw new CommitError(EXIT.TRANSACTION, 'plan repository is unsafe');
    }
    const prismDir = path.join(gitDir, 'prism-tool');
    const plansDir = path.join(prismDir, 'commit-plans');
    for (const directory of [prismDir, plansDir]) {
        let stat;
        try { stat = fs.lstatSync(directory); } catch {
            throw new CommitError(EXIT.TRANSACTION, 'plan is unavailable');
        }
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
            (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
            throw new CommitError(EXIT.TRANSACTION, 'plan directory is unsafe');
        }
    }
    return path.join(plansDir, planId);
}

function readPrivate(file, maximum) {
    let descriptor;
    try {
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > maximum ||
            (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw new Error();
        const content = fs.readFileSync(descriptor);
        fs.closeSync(descriptor);
        return new TextDecoder('utf-8', {fatal: true}).decode(content);
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new CommitError(EXIT.TRANSACTION, 'plan is malformed or inaccessible');
    }
}

function loadPlan(planDir) {
    let directoryStat;
    try { directoryStat = fs.lstatSync(planDir); } catch {
        throw new CommitError(EXIT.TRANSACTION, 'plan is unavailable');
    }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
        (directoryStat.mode & 0o777) !== 0o700 ||
        (typeof process.getuid === 'function' && directoryStat.uid !== process.getuid())) {
        throw new CommitError(EXIT.TRANSACTION, 'plan is malformed or inaccessible');
    }
    const rawPlan = readPrivate(path.join(planDir, 'plan.json'), 16384);
    const message = readPrivate(path.join(planDir, 'message.txt'), 131072);
    let plan;
    try { plan = JSON.parse(rawPlan); } catch {
        throw new CommitError(EXIT.TRANSACTION, 'plan is malformed or inaccessible');
    }
    const keys = Object.keys(plan).sort();
    const expected = [
        'branch', 'createdAt', 'head', 'indexFingerprint', 'messageSha256',
        'repository', 'schemaVersion',
    ].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected) || plan.schemaVersion !== 1 ||
        typeof plan.repository !== 'string' || typeof plan.branch !== 'string' ||
        !(plan.head === 'unborn' || SHA_RE.test(plan.head)) ||
        !/^[0-9a-f]{64}$/.test(plan.indexFingerprint) ||
        !/^[0-9a-f]{64}$/.test(plan.messageSha256) || typeof plan.createdAt !== 'string' ||
        crypto.createHash('sha256').update(message).digest('hex') !== plan.messageSha256) {
        throw new CommitError(EXIT.TRANSACTION, 'plan is malformed or inaccessible');
    }
    return {message, plan};
}

function cleanupPlan(planDir) {
    let directoryStat;
    try { directoryStat = fs.lstatSync(planDir); } catch { return; }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() ||
        (directoryStat.mode & 0o777) !== 0o700 ||
        (typeof process.getuid === 'function' && directoryStat.uid !== process.getuid())) return;
    for (const name of ['plan.json', 'message.txt']) {
        const file = path.join(planDir, name);
        try {
            const stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink() ||
                (typeof process.getuid === 'function' && stat.uid !== process.getuid())) continue;
            fs.unlinkSync(file);
        } catch {
            continue;
        }
    }
    rmdirQuietly(planDir);
}

function prepare(args, context) {
    const parsed = parsePrepare(args);
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
    const fingerprint = indexFingerprint(context);
    const planId = createPlan(context, state, message, fingerprint);
    process.stdout.write(`${message}\nPlan: ${planId}\n`);
    return EXIT.OK;
}

function discard(args, context) {
    if (args.length !== 2 || args[0] !== '--plan' || !/^[0-9a-f]{32}$/.test(args[1])) {
        throw new CommitError(EXIT.USAGE, 'discard arguments are invalid');
    }
    const planDir = resolvePlanDirectory(context, args[1]);
    try {
        fs.lstatSync(planDir);
    } catch (error) {
        if (error.code === 'ENOENT') return EXIT.OK;
        throw new CommitError(EXIT.TRANSACTION, 'plan is inaccessible');
    }
    loadPlan(planDir);
    cleanupPlan(planDir);
    return EXIT.OK;
}

function apply(args, context) {
    const planId = parseApply(args);
    const planDir = resolvePlanDirectory(context, planId);
    let loaded;
    try {
        loaded = loadPlan(planDir);
        const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
        const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
        const state = repositoryState(context, coreRoot);
        const fingerprint = indexFingerprint(context);
        if (state.repository !== loaded.plan.repository || state.branch !== loaded.plan.branch ||
            state.head !== loaded.plan.head || fingerprint !== loaded.plan.indexFingerprint) {
            throw new CommitError(EXIT.TRANSACTION, 'plan is stale');
        }
        requireSuccess(
            invoke(context, process.execPath, [launcher, 'doctor', '--local-only']),
            EXIT.READINESS,
            'local readiness failed'
        );
        requireSuccess(
            invoke(context, process.execPath, [launcher, 'run', 'commitlint', '--'], {input: loaded.message}),
            EXIT.TOOL,
            'commitlint rejected the message'
        );
        requireSuccess(
            invoke(context, 'git', ['commit', '-S', '-F', path.join(planDir, 'message.txt')]),
            EXIT.TOOL,
            'signed Git commit failed'
        );
        const newHead = shaValue(
            requireSuccess(
                invoke(context, 'git', ['rev-parse', '--verify', 'HEAD']),
                EXIT.TOOL,
                'committed HEAD is unavailable'
            ),
            'committed HEAD is invalid'
        );
        if (newHead === loaded.plan.head) throw new CommitError(EXIT.TOOL, 'HEAD did not advance');
        process.stdout.write(`Commit: ${newHead}\n`);
        return EXIT.OK;
    } finally {
        cleanupPlan(planDir);
    }
}

function commitCommand(args, context = {}) {
    try {
        if (args[0] === 'prepare') return prepare(args.slice(1), context);
        if (args[0] === 'apply') return apply(args.slice(1), context);
        if (args[0] === 'discard') return discard(args.slice(1), context);
        process.stderr.write(USAGE);
        return EXIT.USAGE;
    } catch (error) {
        return fail(error);
    }
}

module.exports = {commitCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
