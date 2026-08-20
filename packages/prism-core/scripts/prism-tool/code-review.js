// $KYAULabs: code-review.js kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {assertPackageParity, loadContract} = require('./contract');
const {STATE: CONSENT_STATE, inspectConsent} = require('./consent');
const {checkExternalTools, resolveExecutable, testOcrConnectivity} = require('./preflight');
const {runBounded} = require('./process');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4});
const USAGE = 'usage: prism-tool code-review ocr -- review --audience agent --format json | ' +
    'prism-tool code-review ocr -- scan PATH --audience agent --format json\n';
const REVIEW_ARGS = Object.freeze(['review', '--audience', 'agent', '--format', 'json']);
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

class CodeReviewError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function sameArguments(actual, expected) {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function resolveRoot(context) {
    try {
        return fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd());
    } catch {
        throw new CodeReviewError(EXIT.USAGE, 'review root is invalid');
    }
}

function resolveScanPath(operand, context) {
    try {
        const root = resolveRoot(context);
        const requested = path.resolve(root, operand);
        const resolved = fs.realpathSync(requested);
        const relation = path.relative(root, resolved);
        if (requested !== resolved || relation.startsWith('..') || path.isAbsolute(relation)) throw new Error();
        const stat = fs.lstatSync(requested);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error();
        return {path: resolved, root};
    } catch {
        throw new CodeReviewError(EXIT.USAGE, 'scan path is invalid');
    }
}

function parseCodeReview(args, context) {
    if (args[0] !== 'ocr' || args[1] !== '--') throw new CodeReviewError(EXIT.USAGE, 'arguments are invalid');
    const operation = args.slice(2);
    if (sameArguments(operation, REVIEW_ARGS)) {
        return {
            args: [...REVIEW_ARGS],
            mode: 'review',
            root: resolveRoot(context),
        };
    }
    if (operation.length === 6 && operation[0] === 'scan' &&
        operation[2] === '--audience' && operation[3] === 'agent' &&
        operation[4] === '--format' && operation[5] === 'json') {
        const scan = resolveScanPath(operation[1], context);
        return {
            args: ['scan', scan.path, '--audience', 'agent', '--format', 'json'],
            mode: 'scan',
            path: scan.path,
            root: scan.root,
        };
    }
    throw new CodeReviewError(EXIT.USAGE, 'arguments are invalid');
}

function loadCoreContract(coreRoot) {
    const contract = loadContract(path.join(coreRoot, 'toolchain.json'));
    const manifest = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    assertPackageParity(contract, manifest);
    return contract;
}

function resolveReviewArguments(parsed, context, run, env) {
    if (parsed.mode !== 'review') return parsed.args;
    const branch = run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        cwd: parsed.root,
        env,
        maxBuffer: 1048576,
        timeout: 30000,
    });
    if (branch.error || branch.status !== 0) {
        throw new CodeReviewError(EXIT.TOOL, 'review branch is unavailable');
    }
    const name = String(branch.stdout ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) {
        throw new CodeReviewError(EXIT.TOOL, 'review branch is unavailable');
    }
    const target = name.startsWith('hotfix/') || name.startsWith('release/') ? 'main' : 'develop';
    const base = `origin/${target}`;
    const baseRef = run('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], {
        cwd: parsed.root,
        env,
        maxBuffer: 1048576,
        timeout: 30000,
    });
    if (baseRef.error || baseRef.status !== 0 || !SHA_RE.test(String(baseRef.stdout ?? '').trim())) {
        throw new CodeReviewError(EXIT.TOOL, 'review base ref is unavailable');
    }
    return ['review', '--from', base, '--to', 'HEAD', ...REVIEW_ARGS.slice(1)];
}

function fail(error) {
    if (error instanceof CodeReviewError) {
        process.stderr.write(`prism-tool: code-review ${error.message}\n`);
        return error.code;
    }
    process.stderr.write('prism-tool: code-review operation failed\n');
    return EXIT.TOOL;
}

function execute(args, context) {
    const parsed = parseCodeReview(args, context);
    if (inspectConsent(context).state !== CONSENT_STATE.GRANTED) {
        throw new CodeReviewError(EXIT.READINESS, 'standing OCR consent required; run /setup');
    }
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let contract;
    try {
        contract = loadCoreContract(coreRoot);
    } catch {
        throw new CodeReviewError(EXIT.USAGE, 'invalid core toolchain contract');
    }
    const env = context.env ?? process.env;
    const run = context.run ?? runBounded;
    const readiness = checkExternalTools({contract, env, run});
    if (readiness.some(({status}) => status !== 'PASS')) {
        throw new CodeReviewError(EXIT.READINESS, 'external readiness failed');
    }
    const component = contract.components.find(({id}) => id === 'ocr');
    if (!component || !Number.isInteger(component.executionTimeoutMs)) {
        throw new CodeReviewError(EXIT.USAGE, 'invalid core toolchain contract');
    }
    const executable = resolveExecutable(component.executable, env);
    if (!executable) throw new CodeReviewError(EXIT.READINESS, 'external readiness failed');
    const operationArgs = resolveReviewArguments(parsed, context, run, env);
    const connectivity = testOcrConnectivity({
        run: (_command, liveArgs, options) => run(executable, liveArgs, {...options, env}),
    });
    if (connectivity.status !== 'PASS') {
        throw new CodeReviewError(EXIT.READINESS, `OCR connectivity failed: ${connectivity.message}`);
    }
    const result = run(executable, operationArgs, {
        cwd: parsed.root,
        env,
        maxBuffer: 1048576,
        timeout: component.executionTimeoutMs,
    });
    if (result.error) {
        const message = result.timedOut ? 'OCR review timed out' : 'OCR review output or process failure';
        throw new CodeReviewError(EXIT.TOOL, message);
    }
    if (result.status !== 0) throw new CodeReviewError(EXIT.TOOL, 'OCR review failed');
    if (result.stdout) process.stdout.write(result.stdout);
    return EXIT.OK;
}

function codeReviewCommand(args, context = {}) {
    try {
        return execute(args, context);
    } catch (error) {
        if (error instanceof CodeReviewError && error.code === EXIT.USAGE) {
            process.stderr.write(USAGE);
            return error.code;
        }
        return fail(error);
    }
}

module.exports = {codeReviewCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
