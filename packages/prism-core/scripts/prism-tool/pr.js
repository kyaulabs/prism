// $KYAULabs: pr.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {inspectCheck, verifyCheck} = require('../prism-review/check');
const {inspectCriteria, verifyCriteria} = require('../prism-review/criteria');
const {
    inspectReviewChainV2,
    verifyReviewChainV2,
} = require('../prism-review/review-chain-v2');
const {REVIEW_STATE} = require('../prism-review/review-state');
const {runBounded} = require('./process');
const {verifyReviewChain} = require('./review-chain');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4});
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const COUNT_RE = /^[0-9]+$/;

function failure(message, code = EXIT.TOOL) {
    process.stderr.write(`PR preflight failed: ${message}\n`);
    return code;
}

function closeQuietly(fd) {
    try {
        fs.closeSync(fd);
    } catch {
        return;
    }
}

function unlinkQuietly(file) {
    try {
        fs.unlinkSync(file);
    } catch {
        return;
    }
}

function prCommand(args, context = {}) {
    if (args.length === 1 && args[0] === 'preflight') {
        return preflight(context, {allowAbsentReviewChain: false});
    }
    if (args.length === 1 && args[0] === 'review-preflight') {
        return preflight(context, {allowAbsentReviewChain: true});
    }
    if (args[0] === 'validate-title') return validateTitle(args.slice(1), context);
    process.stderr.write(
        'usage: prism-tool pr preflight | prism-tool pr review-preflight | ' +
        'prism-tool pr validate-title --title-file PATH --validation-file PATH\n'
    );
    return EXIT.USAGE;
}

function validateTitle(args, context) {
    if (args.length !== 4 || args[0] !== '--title-file' || args[2] !== '--validation-file') {
        process.stderr.write('PR title validation failed: invalid arguments\n');
        return EXIT.USAGE;
    }
    const titleFile = args[1];
    const validationFile = args[3];
    const run = context.run ?? runBounded;
    const cwd = context.cwd ?? process.cwd();
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    const env = context.env ?? process.env;
    const invoke = (command, commandArgs) => run(command, commandArgs, {
        cwd,
        env,
        maxBuffer: context.maxBuffer,
        timeout: context.timeout,
    });
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    const readiness = invoke(process.execPath, [launcher, 'doctor', '--local-only']);
    if (readiness.error || readiness.status !== 0) {
        process.stderr.write('PR title validation failed: toolchain local readiness failed\n');
        return EXIT.READINESS;
    }
    const model = env.PI_MODEL;
    const modelId = typeof model === 'string' ? model.slice(model.lastIndexOf('/') + 1) : '';
    if (typeof model !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(model)
        || !/^[A-Za-z0-9._-]+$/.test(modelId)) {
        process.stderr.write('PR title validation failed: current pi model is required\n');
        return EXIT.USAGE;
    }
    let rawTitle;
    let titleFd;
    try {
        if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error('unsupported no-follow open');
        titleFd = fs.openSync(titleFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(titleFd);
        if (!stat.isFile() || stat.size > 4096) throw new Error('invalid title file');
        rawTitle = fs.readFileSync(titleFd, 'utf8');
        fs.closeSync(titleFd);
        titleFd = undefined;
    } catch {
        if (titleFd !== undefined) closeQuietly(titleFd);
        process.stderr.write('PR title validation failed: title file is unavailable\n');
        return EXIT.USAGE;
    }
    const title = rawTitle.replace(/\r?\n$/, '');
    if (title === '' || /[\r\n]/.test(title)) {
        process.stderr.write('PR title validation failed: title must be one non-empty line\n');
        return EXIT.USAGE;
    }
    const identity = invoke('bash', [path.join(coreRoot, 'scripts', 'resolve-identity.sh')]);
    const identityValue = identity.stdout.trim();
    if (identity.error || identity.status !== 0
        || !/^[^<>\r\n]+ <[^<>\s@]+@[^<>\s@]+>$/.test(identityValue)) {
        process.stderr.write('PR title validation failed: identity could not be resolved\n');
        return EXIT.USAGE;
    }
    const ocrModel = invoke('bash', [path.join(coreRoot, 'scripts', 'resolve-ocr-model.sh')]);
    const ocrModelValue = ocrModel.stdout.trim();
    if (ocrModel.error || ocrModel.status !== 0 || !/^[A-Za-z0-9._-]+$/.test(ocrModelValue)) {
        process.stderr.write('PR title validation failed: OCR model could not be resolved\n');
        return EXIT.USAGE;
    }
    const content = `${title}\n\nImplemented-by: ${modelId}\n` +
        `Tested-by: ${ocrModelValue}\nSigned-off-by: ${identityValue}\n`;
    let validationFd;
    let validationCreated = false;
    const removeValidationFile = () => {
        if (validationCreated) unlinkQuietly(validationFile);
    };
    try {
        if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error('unsupported no-follow open');
        const flags = fs.constants.O_CREAT | fs.constants.O_EXCL |
            fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW;
        validationFd = fs.openSync(validationFile, flags, 0o600);
        validationCreated = true;
        fs.writeFileSync(validationFd, content, 'utf8');
        fs.fchmodSync(validationFd, 0o600);
        fs.closeSync(validationFd);
        validationFd = undefined;
    } catch {
        if (validationFd !== undefined) closeQuietly(validationFd);
        removeValidationFile();
        process.stderr.write('PR title validation failed: validation file could not be written\n');
        return EXIT.TOOL;
    }
    const lint = invoke(process.execPath, [
        launcher,
        'run',
        'commitlint',
        '--',
        '--edit',
        validationFile,
    ]);
    if (lint.error || lint.status !== 0) {
        removeValidationFile();
        process.stderr.write('PR title validation failed: commitlint rejected title\n');
        return EXIT.TOOL;
    }
    return EXIT.OK;
}

function preflight(context, options = {}) {
    const allowAbsentReviewChain = options.allowAbsentReviewChain === true;
    const run = context.run ?? runBounded;
    const cwd = context.cwd ?? process.cwd();
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    const env = context.env ?? process.env;
    const invoke = (command, args) => run(command, args, {
        cwd,
        env,
        maxBuffer: context.maxBuffer,
        timeout: context.timeout,
    });
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    const readiness = invoke(process.execPath, [launcher, 'doctor', '--local-only']);
    if (readiness.error || readiness.status !== 0) {
        return failure('toolchain local readiness failed', EXIT.READINESS);
    }

    const branchResult = invoke('git', ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (branchResult.error || branchResult.status !== 0) {
        return failure('detached HEAD; switch to a work branch');
    }
    const branch = branchResult.stdout.trim();
    const branchValidation = invoke('bash', [path.join(coreRoot, 'scripts', 'validate-branch-name.sh'), branch]);
    if (branchValidation.error || branchValidation.status !== 0) {
        return failure('branch is protected or does not satisfy ADR-0028');
    }

    const status = invoke('git', ['status', '--porcelain']);
    if (status.error || status.status !== 0) return failure('cannot inspect working tree');
    if (status.stdout !== '') return failure('working tree is not clean');

    const targetBranch = branch.startsWith('hotfix/') || branch.startsWith('release/') ? 'main' : 'develop';
    const baseRef = `origin/${targetBranch}`;
    const verifyBase = invoke('git', ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]);
    if (verifyBase.error || verifyBase.status !== 0) {
        return failure(`missing synchronized remote-tracking ref ${baseRef}`);
    }

    const readValue = (args, pattern) => {
        const result = invoke('git', args);
        if (result.error || result.status !== 0) return null;
        const value = result.stdout.trim();
        return pattern.test(value) ? value : null;
    };
    const baseSha = readValue(['rev-parse', `${baseRef}^{commit}`], SHA_RE);
    const headSha = readValue(['rev-parse', 'HEAD'], SHA_RE);
    const mergeBase = readValue(['merge-base', baseRef, 'HEAD'], SHA_RE);
    if (baseSha === null || headSha === null || mergeBase === null) {
        return failure(`cannot compute merge-base against ${baseRef}`);
    }
    const commitCount = readValue(['rev-list', '--count', `${mergeBase}..HEAD`], COUNT_RE);
    const nonMergeCount = readValue(['rev-list', '--count', '--no-merges', `${mergeBase}..HEAD`], COUNT_RE);
    if (commitCount === null || nonMergeCount === null) return failure('cannot inspect branch commit range');
    if (Number(commitCount) === 0) return failure(`no commits ahead of ${baseRef}`);
    if (Number(nonMergeCount) === 0) return failure('branch range contains no non-merge commit');

    const diff = invoke('git', ['diff', '--quiet', `${mergeBase}..HEAD`, '--']);
    if (diff.error || (diff.status !== 0 && diff.status !== 1)) return failure('cannot inspect branch net diff');
    if (diff.status === 0) return failure('branch has no net diff against its merge-base');

    const expected = {branch, baseRef, baseSha, headSha};
    const inspect = context.inspectReviewChainV2 ?? inspectReviewChainV2;
    let inspected;
    try {
        inspected = inspect({...context, projectRoot: cwd});
    } catch {
        return failure('review chain is unsafe or invalid');
    }
    let reviewChainState;
    let reviewChainVersion;
    let advisoryCount;
    let v2Recovery;

    try {
        if (inspected.state === REVIEW_STATE.VALID && inspected.version === 2) {
            const criteria = (context.verifyCriteria ?? verifyCriteria)(
                {branch}, {...context, projectRoot: cwd}
            );
            const check = (context.verifyCheck ?? verifyCheck)(expected, {...context, projectRoot: cwd});
            const review = (context.verifyReviewChainV2 ?? verifyReviewChainV2)({
                ...expected,
                criteriaDigest: criteria.digest,
                checkDigest: check.digest,
            }, {...context, projectRoot: cwd});
            reviewChainState = REVIEW_STATE.VALID;
            reviewChainVersion = 2;
            advisoryCount = String(review.advisoryFindings.length);
        } else if (inspected.state === REVIEW_STATE.LEGACY && inspected.version === 1) {
            const review = (context.verifyReviewChain ?? verifyReviewChain)(
                expected, {...context, projectRoot: cwd}
            );
            reviewChainState = REVIEW_STATE.VALID;
            reviewChainVersion = 1;
            advisoryCount = String(review.advisoryFindings.length);
        } else if (inspected.state === REVIEW_STATE.ABSENT && allowAbsentReviewChain) {
            const criteriaState = (context.inspectCriteria ?? inspectCriteria)(
                {...context, projectRoot: cwd}
            );
            const checkState = (context.inspectCheck ?? inspectCheck)(
                {...context, projectRoot: cwd}
            );
            if (criteriaState.state === REVIEW_STATE.ABSENT && checkState.state === REVIEW_STATE.ABSENT) {
                v2Recovery = 'UNDECLARED';
            } else if (criteriaState.state === REVIEW_STATE.VALID && checkState.state === REVIEW_STATE.VALID) {
                (context.verifyCriteria ?? verifyCriteria)({branch}, {...context, projectRoot: cwd});
                (context.verifyCheck ?? verifyCheck)(expected, {...context, projectRoot: cwd});
                v2Recovery = 'READY';
            } else {
                return failure('version-two recovery evidence is partial, stale, or unsafe');
            }
            reviewChainState = REVIEW_STATE.ABSENT;
        } else if (inspected.state === REVIEW_STATE.ABSENT) {
            return failure('review chain is incomplete, stale, or has unresolved Blocking findings');
        } else {
            return failure('review chain is unsafe or invalid');
        }
    } catch {
        return failure('review chain is incomplete, stale, or has unresolved Blocking findings');
    }

    const fields = [
        ['BRANCH', branch],
        ['TARGET_BRANCH', targetBranch],
        ['BASE_REF', baseRef],
        ['BASE_SHA', baseSha],
        ['HEAD_SHA', headSha],
        ['MERGE_BASE', mergeBase],
        ['COMMIT_COUNT', commitCount],
        ['NON_MERGE_COUNT', nonMergeCount],
        ['REVIEW_CHAIN', reviewChainState],
    ];
    if (reviewChainVersion !== undefined) fields.push(['REVIEW_CHAIN_VERSION', String(reviewChainVersion)]);
    if (v2Recovery !== undefined) fields.push(['V2_RECOVERY', v2Recovery]);
    if (advisoryCount !== undefined) fields.push(['ADVISORY_COUNT', advisoryCount]);
    for (const [key, value] of fields) process.stdout.write(`${key}\t${value}\n`);
    return EXIT.OK;
}

module.exports = {prCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
