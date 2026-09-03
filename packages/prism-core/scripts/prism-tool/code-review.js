// $KYAULabs: code-review.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {assertPackageParity, loadContract} = require('./contract');
const {STATE: CONSENT_STATE, inspectConsent} = require('./consent');
const {checkExternalTools, resolveExecutable, testOcrConnectivity} = require('./preflight');
const {inspectReviewChainV2} = require('../prism-review/review-chain-v2');
const {REVIEW_STATE} = require('../prism-review/review-state');
const {runBounded, sanitizeDetail} = require('./process');
const {
    ReviewChainError,
    recordReviewSegment,
    verifyReviewChain,
} = require('./review-chain');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4});
const USAGE = 'usage: prism-tool code-review ocr -- review [--from SHA --to HEAD] --audience agent --format json | ' +
    'prism-tool code-review ocr -- scan PATH --audience agent --format json | ' +
    'prism-tool code-review chain inspect|record|verify [controls]\n';
const REVIEW_ARGS = Object.freeze(['review', '--audience', 'agent', '--format', 'json']);
const EXPLICIT_REVIEW_LENGTH = 9;
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
    if (
        operation.length === EXPLICIT_REVIEW_LENGTH &&
        operation[0] === 'review' && operation[1] === '--from' && SHA_RE.test(operation[2]) &&
        operation[3] === '--to' && operation[4] === 'HEAD' &&
        operation[5] === '--audience' && operation[6] === 'agent' &&
        operation[7] === '--format' && operation[8] === 'json'
    ) {
        return {
            args: [...operation],
            explicitFrom: operation[2],
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
    if (parsed.explicitFrom !== undefined) {
        const ancestor = run('git', ['merge-base', '--is-ancestor', parsed.explicitFrom, 'HEAD'], {
            cwd: parsed.root,
            env,
            maxBuffer: 1048576,
            timeout: 30000,
        });
        if (ancestor.error || ancestor.status !== 0) {
            throw new CodeReviewError(EXIT.TOOL, 'review range is not continuous');
        }
        return parsed.args;
    }
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
    const baseSha = String(baseRef.stdout ?? '').trim();
    if (baseRef.error || baseRef.status !== 0 || !SHA_RE.test(baseSha)) {
        throw new CodeReviewError(EXIT.TOOL, 'review base ref is unavailable');
    }
    return ['review', '--from', baseSha, '--to', 'HEAD', ...REVIEW_ARGS.slice(1)];
}

function readChainInput(operand, context) {
    const resolved = resolveScanPath(operand, context);
    const stat = fs.lstatSync(resolved.path);
    if (!stat.isFile() || stat.size > 131072) throw new CodeReviewError(EXIT.USAGE, 'chain input is invalid');
    try {
        return JSON.parse(fs.readFileSync(resolved.path, 'utf8'));
    } catch {
        throw new CodeReviewError(EXIT.USAGE, 'chain input is invalid');
    }
}

function parseVerifyControls(args) {
    const expected = {};
    for (const key of ['branch', 'base-ref', 'base-sha', 'head-sha']) {
        const matches = args.filter((argument) => argument.startsWith(`--${key}=`));
        if (matches.length !== 1) throw new CodeReviewError(EXIT.USAGE, 'chain verify arguments are invalid');
        expected[key.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = matches[0].slice(key.length + 3);
    }
    if (args.length !== 5 || !args.includes('--json')) {
        throw new CodeReviewError(EXIT.USAGE, 'chain verify arguments are invalid');
    }
    return expected;
}

function reviewChainCommand(args, context) {
    const inspect = context.inspectReviewChainV2 ?? inspectReviewChainV2;
    if (sameArguments(args, ['inspect', '--json'])) {
        const inspected = inspect(context);
        const result = inspected.state === REVIEW_STATE.LEGACY
            ? {schemaVersion: 1, state: REVIEW_STATE.VALID, version: 1, record: inspected.record}
            : {
                schemaVersion: 1,
                state: inspected.state,
                ...(inspected.state === REVIEW_STATE.VALID ? {version: 2} : {}),
            };
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return inspected.state === REVIEW_STATE.UNSAFE ? EXIT.TOOL : EXIT.OK;
    }
    if (args.length === 4 && args[0] === 'record' && args[1] === '--input' && args[3] === '--json') {
        if (inspect(context).state === REVIEW_STATE.VALID) {
            throw new CodeReviewError(EXIT.TOOL, 'chain record is schema-one-only');
        }
        const record = recordReviewSegment(readChainInput(args[2], context), context);
        process.stdout.write(`${JSON.stringify({schemaVersion: 1, status: 'GO', data: record})}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'verify') {
        const verified = verifyReviewChain(parseVerifyControls(args.slice(1)), context);
        process.stdout.write(`${JSON.stringify({schemaVersion: 1, status: 'GO', data: verified})}\n`);
        return EXIT.OK;
    }
    throw new CodeReviewError(EXIT.USAGE, 'chain arguments are invalid');
}

function fail(error) {
    if (error instanceof CodeReviewError || error instanceof ReviewChainError) {
        process.stderr.write(`prism-tool: code-review ${error.message}\n`);
        return error.code ?? EXIT.TOOL;
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
    if (result.status !== 0) {
        const detail = sanitizeDetail(result.stderr);
        throw new CodeReviewError(EXIT.TOOL, detail === '' ? 'OCR review failed' : `OCR review failed: ${detail}`);
    }
    if (result.stdout) process.stdout.write(result.stdout);
    return EXIT.OK;
}

function codeReviewCommand(args, context = {}) {
    try {
        if (args[0] === 'chain') return reviewChainCommand(args.slice(1), context);
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
