// $KYAULabs: cli.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {EXIT} = require('./constants');
const {discoverOptionalAdapter} = require('../prism-tool/discovery');
const {loadAdapterProfile, loadCoreProfile} = require('./profile');
const {inspectIsolatedRuntime} = require('./session-runner');
const {classifyTrustRoot} = require('./trust');

const MAX_MANIFEST_BYTES = 65536;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const HELP = `usage: prism-review COMMAND

prism-review --version
prism-review --help
prism-review doctor --json
prism-review review staged --json
prism-review review commit --commit SHA --json
prism-review review branch --base SHA --head SHA --json
prism-review review path --path RELATIVE_TRACKED_PATH --json
`;

function readVersion(coreRoot) {
    const root = fs.realpathSync(coreRoot);
    const manifestPath = path.join(root, 'package.json');
    const identity = fs.lstatSync(manifestPath);
    if (identity.isSymbolicLink() || !identity.isFile() || identity.size > MAX_MANIFEST_BYTES ||
        fs.realpathSync(manifestPath) !== manifestPath) {
        throw new Error('Core package manifest is invalid');
    }
    const descriptor = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const current = fs.fstatSync(descriptor);
        if (!held.isFile() || held.dev !== identity.dev || held.ino !== identity.ino ||
            contents.length !== held.size || current.dev !== held.dev || current.ino !== held.ino ||
            current.size !== held.size || contents.length > MAX_MANIFEST_BYTES) {
            throw new Error('Core package manifest changed');
        }
        const value = JSON.parse(contents.toString('utf8'));
        if (value.name !== '@kyaulabs/prism-core' || typeof value.version !== 'string') {
            throw new Error('Core package version is invalid');
        }
        return value.version;
    } finally {
        fs.closeSync(descriptor);
    }
}

function defaultRun(command, args, options) {
    return childProcess.spawnSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf8',
        maxBuffer: 65536,
        timeout: 10000,
    });
}

function repositoryRoot(context) {
    if (context.projectRoot !== undefined) return fs.realpathSync(context.projectRoot);
    const cwd = fs.realpathSync(context.cwd ?? process.cwd());
    const result = (context.run ?? defaultRun)('git', ['rev-parse', '--show-toplevel'], {cwd});
    if (result.error || result.status !== 0) throw new Error('repository is unavailable');
    return fs.realpathSync(String(result.stdout).trim());
}

function writeJson(stream, value) {
    stream.write(`${JSON.stringify(value)}\n`);
}

function profileReadiness(context, coreRoot, projectRoot) {
    const profilePresent = context.coreProfilePresent ??
        fs.existsSync(path.join(coreRoot, 'config', 'prism-review.json'));
    if (!profilePresent) return null;
    const core = (context.loadCoreProfile ?? loadCoreProfile)({packageRoot: coreRoot});
    const registration = (context.discoverOptionalAdapter ?? discoverOptionalAdapter)({
        projectRoot,
        piDir: context.piDir ?? path.join(projectRoot, '.pi'),
    });
    let adapter = null;
    if (registration?.reviewPath !== null && registration?.reviewPath !== undefined) {
        adapter = (context.loadAdapterProfile ?? loadAdapterProfile)({
            registration,
            repositoryRoot: projectRoot,
        });
    }
    return {
        core: {profileDigest: core.profileDigest, policyDigest: core.policyDigest},
        adapter: adapter === null
            ? null
            : {profileDigest: adapter.profileDigest, policyDigest: adapter.policyDigest},
    };
}

function safeRelativePath(value) {
    return typeof value === 'string' && value !== '' && !/[\\\x00-\x1f\x7f]/.test(value) &&
        !path.posix.isAbsolute(value) && value !== '.' && value !== '..' &&
        !value.startsWith('../') && path.posix.normalize(value) === value;
}

function parseReview(argv) {
    if (argv.length === 3 && argv[0] === 'review' && argv[1] === 'staged' &&
        argv[2] === '--json') {
        return {command: 'review staged'};
    }
    if (argv.length === 5 && argv[0] === 'review' && argv[1] === 'commit' &&
        argv[2] === '--commit' && SHA.test(argv[3]) && argv[4] === '--json') {
        return {command: 'review commit', commit: argv[3]};
    }
    if (argv.length === 7 && argv[0] === 'review' && argv[1] === 'branch' &&
        argv[2] === '--base' && SHA.test(argv[3]) && argv[4] === '--head' &&
        SHA.test(argv[5]) && argv[6] === '--json') {
        return {command: 'review branch', base: argv[3], head: argv[5]};
    }
    if (argv.length === 5 && argv[0] === 'review' && argv[1] === 'path' &&
        argv[2] === '--path' && safeRelativePath(argv[3]) && argv[4] === '--json') {
        return {command: 'review path', path: argv[3]};
    }
    return null;
}

async function main(argv, context = {}) {
    const stdout = context.stdout ?? process.stdout;
    const stderr = context.stderr ?? process.stderr;
    if (argv.length === 1 && argv[0] === '--version') {
        try {
            stdout.write(`${readVersion(context.coreRoot ?? path.resolve(__dirname, '../..'))}\n`);
            return EXIT.OK;
        } catch {
            stderr.write('prism-review: runtime readiness failed\n');
            return EXIT.READINESS;
        }
    }
    if (argv.length === 1 && argv[0] === '--help') {
        stdout.write(HELP);
        return EXIT.OK;
    }
    if (argv.length === 2 && argv[0] === 'doctor' && argv[1] === '--json') {
        try {
            const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
            const projectRoot = repositoryRoot(context);
            const trust = classifyTrustRoot(coreRoot, projectRoot);
            const model = await (context.inspectIsolatedRuntime ?? inspectIsolatedRuntime)({
                repositoryRoot: projectRoot,
                env: context.env ?? process.env,
                loadSdk: context.loadSdk,
                tempRoot: context.tempRoot,
                removeTemp: context.removeTemp,
            });
            const profile = profileReadiness(context, coreRoot, projectRoot);
            const checks = [
                {id: 'trust-root', status: 'PASS', message: 'review trust root classified'},
                {id: 'active-model', status: 'PASS', message: 'active Pi model resolved exactly'},
                {id: 'sdk-isolation', status: 'PASS', message: 'isolated Pi resources validated'},
            ];
            if (profile !== null) {
                checks.push({
                    id: 'review-profile',
                    status: 'PASS',
                    message: 'closed review profile validated',
                });
            }
            writeJson(stdout, {
                schemaVersion: 1,
                command: 'doctor',
                status: 'GO',
                sourceClass: trust.sourceClass,
                eligibleForAuthority: trust.eligibleForAuthority,
                model,
                ...(profile === null ? {} : {profile}),
                checks,
            });
            return EXIT.OK;
        } catch {
            writeJson(stdout, {
                schemaVersion: 1,
                command: 'doctor',
                status: 'NO-GO',
                reason: 'RUNTIME_READINESS_FAILED',
            });
            return EXIT.READINESS;
        }
    }
    const review = parseReview(argv);
    if (review !== null) {
        try {
            const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
            const trust = classifyTrustRoot(coreRoot, repositoryRoot(context));
            writeJson(stdout, {
                schemaVersion: 1,
                command: review.command,
                authoritative: false,
                status: 'NO-GO',
                outcome: 'INCONCLUSIVE',
                sourceClass: trust.sourceClass,
                reason: 'RUNTIME_INCOMPLETE',
            });
            return EXIT.READINESS;
        } catch {
            writeJson(stdout, {
                schemaVersion: 1,
                command: review.command,
                authoritative: false,
                status: 'NO-GO',
                outcome: 'INCONCLUSIVE',
                reason: 'RUNTIME_READINESS_FAILED',
            });
            return EXIT.READINESS;
        }
    }
    stderr.write('prism-review: invalid arguments\n');
    return EXIT.USAGE;
}

module.exports = {main};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
