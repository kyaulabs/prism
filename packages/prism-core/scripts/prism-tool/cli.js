// $KYAULabs: cli.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {MAX_EXECUTION_TIMEOUT_MS, assertPackageParity, loadContract} = require('./contract');
const {discoverAdapter, loadAdapterHandler} = require('./discovery');
const {inspectSetupRoute} = require('./setup-route');
const {inspectMinimalMetadata, normalizeProjectMetadata} = require('./bootstrap-metadata');
const {renderCoreBaseline} = require('./bootstrap-providers');
const {
    planAdapterProject,
    planCoreOnlyProject,
    validateBootstrapProjectPlan,
} = require('./bootstrap-plan');
const {
    applyBootstrapProject,
    recoverBootstrapProject,
} = require('./bootstrap-transaction');
const {applyBootstrapHooks, inspectBootstrapHooks} = require('./bootstrap-hooks');
const {createBootstrapRepository} = require('./bootstrap-repository');
const {prepareBootstrapSeed} = require('./bootstrap-seed');
const {inspectTemplateSource} = require('./template-source');
const {inspectSupportedAdapters, selectCoreOnlyAdapter} = require('./supported-adapters');
const {
    cleanupBootstrapAdapter,
    provisionBootstrapAdapter,
} = require('./bootstrap-adapter');
const {checkExternalTools, resolveExecutable, testOcrConnectivity} = require('./preflight');
const {DEFAULT_EXECUTION_TIMEOUT_MS, runBounded} = require('./process');
const {prCommand} = require('./pr');
const {commitCommand} = require('./commit');
const {hookCommand} = require('./hook');
const {STATE: CONSENT_STATE, consentCommand, inspectConsent} = require('./consent');
const {codeReviewCommand} = require('./code-review');
const {
    applyReleaseCapability,
    inspectReleaseCapability,
    planReleaseCapability,
    verifyReleaseCapability,
} = require('./package-release');

const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});
const BOOTSTRAP_ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RUN_USAGE = 'usage: prism-tool run TOOL_ID [--timeout-ms=MILLISECONDS] -- ARGUMENTS';

function packageRootFor(packageName, coreRoot) {
    let current = fs.realpathSync(coreRoot);
    while (true) {
        const candidate = path.join(current, 'node_modules', packageName);
        const manifestPath = path.join(candidate, 'package.json');
        if (fs.existsSync(manifestPath)) {
            const root = fs.realpathSync(candidate);
            const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
            if (manifest.name === packageName) return {manifest, root};
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    throw new Error(`package root not found for ${packageName}`);
}

function resolveBundledComponent(coreRoot, component) {
    const resolved = packageRootFor(component.package, coreRoot);
    if (resolved.manifest.version !== component.version) {
        throw new Error(`package version drift for ${component.id}`);
    }
    const bin = resolved.manifest.bin;
    const relative = typeof bin === 'string' ? bin : bin?.[component.executable];
    if (typeof relative !== 'string') throw new Error(`package bin missing for ${component.id}`);
    const executable = fs.realpathSync(path.resolve(resolved.root, relative));
    const relation = path.relative(resolved.root, executable);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error(`package bin escapes root for ${component.id}`);
    }
    return executable;
}

function parseRun(args) {
    const toolId = args[0];
    const separator = args.indexOf('--');
    if (!toolId || separator < 1) {
        throw new Error(RUN_USAGE);
    }
    let timeoutMs;
    for (const control of args.slice(1, separator)) {
        if (control.startsWith('--timeout-ms=') && timeoutMs === undefined) {
            const value = control.slice('--timeout-ms='.length);
            if (!/^[1-9][0-9]*$/.test(value)) throw new Error(RUN_USAGE);
            timeoutMs = Number(value);
            if (!Number.isSafeInteger(timeoutMs)) throw new Error(RUN_USAGE);
            continue;
        }
        throw new Error(RUN_USAGE);
    }
    return {timeoutMs, toolId, toolArgs: args.slice(separator + 1)};
}

function argumentsAllowed(component, args) {
    if (component.argumentPolicy.mode === 'passthrough') return true;
    return args.length > 0 && component.argumentPolicy.allowed.includes(args[0]);
}

function readBoundedStdin(context) {
    const limit = context.inputLimit ?? 1048576;
    if (Object.prototype.hasOwnProperty.call(context, 'input')) {
        const input = context.input ?? '';
        if (Buffer.byteLength(input) > limit) throw new Error('stdin exceeds limit');
        return input;
    }
    if (process.stdin.isTTY) return undefined;

    const chunks = [];
    let total = 0;
    const buffer = Buffer.alloc(16384);
    let count;
    while ((count = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
        total += count;
        if (total > limit) throw new Error('stdin exceeds limit');
        chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks);
}

function loadCoreContract(coreRoot) {
    const contract = loadContract(path.join(coreRoot, 'toolchain.json'));
    const packageJson = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    assertPackageParity(contract, packageJson);
    return contract;
}

function parseDoctor(args) {
    const parsed = {json: false, localOnly: false};
    for (const argument of args) {
        if (argument === '--json') parsed.json = true;
        else if (argument === '--local-only') parsed.localOnly = true;
        else throw new Error('usage: prism-tool doctor [--json] [--local-only]');
    }
    return parsed;
}

function renderDoctor(checks, json) {
    const status = checks.every((check) => check.status === 'PASS') ? 'GO' : 'NO-GO';
    if (json) {
        process.stdout.write(`${JSON.stringify({schemaVersion: 1, command: 'doctor', status, checks})}\n`);
        return;
    }
    for (const check of checks) {
        const fields = [check.id, check.status];
        if (check.expected) fields.push(`expected=${check.expected}`);
        if (check.actual) fields.push(`actual=${check.actual}`);
        fields.push(check.message);
        process.stdout.write(`${fields.join('\t')}\n`);
    }
    process.stdout.write(`${status}\n`);
}

function doctor(args, context) {
    let parsed;
    try {
        parsed = parseDoctor(args);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        return EXIT.USAGE;
    }
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let contract;
    try {
        contract = loadCoreContract(coreRoot);
    } catch {
        process.stderr.write('prism-tool: invalid core toolchain contract\n');
        return EXIT.USAGE;
    }
    const checks = checkExternalTools({
        contract,
        env: context.env ?? process.env,
        run: context.run ?? runBounded,
    });
    if (checks.some((check) => check.status !== 'PASS')) {
        renderDoctor(checks, parsed.json);
        return EXIT.READINESS;
    }
    if (parsed.localOnly) {
        renderDoctor(checks, parsed.json);
        return EXIT.OK;
    }
    const consent = inspectConsent(context);
    if (consent.state !== CONSENT_STATE.GRANTED) {
        checks.push({
            id: 'ocr-consent',
            status: 'FAIL',
            message: 'run /setup to grant standing OCR consent',
        });
        renderDoctor(checks, parsed.json);
        return EXIT.READINESS;
    }
    const env = context.env ?? process.env;
    const executable = resolveExecutable('ocr', env);
    const run = executable
        ? (_command, liveArgs, options) => (context.run ?? runBounded)(executable, liveArgs, {...options, env})
        : () => ({status: null, error: {code: 'ENOENT'}});
    checks.push(testOcrConnectivity({run}));
    renderDoctor(checks, parsed.json);
    return checks.every((check) => check.status === 'PASS') ? EXIT.OK : EXIT.READINESS;
}

class SetupOperationError extends Error {
    constructor(exitCode, message) {
        super(message);
        this.exitCode = exitCode;
    }
}

function renderSetupOperationError(error) {
    if (error instanceof SetupOperationError) {
        process.stderr.write(`${error.message}\n`);
        return error.exitCode;
    }
    process.stderr.write('prism-tool: setup operation failed\n');
    return EXIT.TOOL;
}

function prepareSetupAdapter(adapterName, context) {
    const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let coreContract;
    try {
        coreContract = loadCoreContract(coreRoot);
    } catch {
        throw new SetupOperationError(EXIT.USAGE, 'prism-tool: invalid core toolchain contract');
    }
    const readiness = checkExternalTools({
        contract: coreContract,
        env: context.env ?? process.env,
        run: context.run ?? runBounded,
    });
    if (readiness.some(({status}) => status !== 'PASS')) {
        throw new SetupOperationError(EXIT.READINESS, 'prism-tool: mandatory external readiness failed');
    }
    let registration;
    let handler;
    try {
        registration = discoverAdapter({
            projectRoot,
            piDir: context.piDir ?? path.join(projectRoot, '.pi'),
        });
        handler = loadAdapterHandler(registration);
    } catch {
        throw new SetupOperationError(EXIT.USAGE, 'prism-tool: active adapter discovery failed');
    }
    if (registration.packageName !== adapterName) {
        throw new SetupOperationError(EXIT.USAGE, 'prism-tool: requested adapter is not active');
    }
    return {handler, projectRoot, readiness, registration};
}

const RESOLVE_KINDS = new Set(['scripts', 'skills']);

function resolveKindDir(args, context) {
    const kind = args[0];
    if (args.length !== 1 || !RESOLVE_KINDS.has(kind)) {
        process.stderr.write('usage: prism-tool resolve scripts|skills\n');
        return EXIT.USAGE;
    }
    const isDir = (candidate) => {
        try {
            return fs.statSync(candidate).isDirectory();
        } catch {
            return false;
        }
    };
    let current = fs.realpathSync(context.cwd ?? process.cwd());
    while (true) {
        const candidate = path.join(current, 'packages', 'prism-core', kind);
        if (isDir(candidate)) {
            process.stdout.write(`${candidate}\n`);
            return EXIT.OK;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    const own = path.resolve(__dirname, '../..', kind);
    if (!isDir(own)) {
        process.stderr.write(`prism-tool: installed ${kind} directory is missing\n`);
        return EXIT.USAGE;
    }
    process.stdout.write(`${own}\n`);
    return EXIT.OK;
}

function renderSetupSourceReport(report, json) {
    if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else {
        for (const check of report.checks) {
            process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
        }
        process.stdout.write(`disposition\t${report.disposition}\n`);
        process.stdout.write(`source\t${report.source}\n`);
        process.stdout.write(`${report.status}\n`);
    }
    return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
}

function reportProjectRoot(projectRoot) {
    try {
        return fs.realpathSync(projectRoot);
    } catch {
        return path.resolve(projectRoot);
    }
}

function setup(args, context) {
    if (args[0] === 'seed' && args[1] === 'prepare') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup seed prepare --attempt=UUID --digest=SHA256 [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let result;
        try {
            result = prepareBootstrapSeed({
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
                runGit: context.bootstrapGitRun ?? runBounded,
                runTool: context.bootstrapSeedToolRun ?? runBounded,
                env: context.env ?? process.env,
                fault: context.bootstrapSeedFault,
            });
        } catch {
            const report = {
                schemaVersion: 1,
                command: 'setup seed prepare',
                status: 'NO-GO',
                disposition: 'SEED_CONFLICT',
                projectRoot: reportProjectRoot(projectRoot),
                checks: [{
                    id: 'bootstrap-seed',
                    status: 'FAIL',
                    message: 'the Core-only root seed could not be attested safely',
                }],
                data: {
                    attempt: {id: attempts[0].slice('--attempt='.length)},
                    resumePhase: 'MANUAL_RECOVERY',
                    nextAction: 'Inspect the retained index and bootstrap attempt evidence.',
                },
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup seed prepare',
            projectRoot: reportProjectRoot(projectRoot),
            ...result,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'hooks' && ['inspect', 'apply'].includes(args[1])) {
        const operation = args[1];
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const approvals = controls.filter((argument) => argument.startsWith('--approval='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            (operation === 'inspect' && approvals.length !== 0) ||
            (operation === 'apply' && (approvals.length !== 1 || approvals[0] !== '--approval=yes')) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=') &&
                !argument.startsWith('--approval=')
            )
        ) {
            process.stderr.write(
                `usage: prism-tool setup hooks ${operation} --attempt=UUID --digest=SHA256` +
                `${operation === 'apply' ? ' --approval=yes' : ''} [--json]\n`
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let result;
        try {
            const input = {
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
                runGit: context.bootstrapGitRun ?? runBounded,
                env: context.env ?? process.env,
            };
            result = operation === 'inspect' ? inspectBootstrapHooks(input) : applyBootstrapHooks({
                ...input,
                approval: 'yes',
                fault: context.bootstrapHooksFault,
            });
        } catch {
            const report = {
                schemaVersion: 1,
                command: `setup hooks ${operation}`,
                status: 'NO-GO',
                disposition: 'HOOKS_CONFLICT',
                projectRoot: reportProjectRoot(projectRoot),
                checks: [{
                    id: 'bootstrap-hooks',
                    status: 'FAIL',
                    message: 'canonical bootstrap hooks could not be activated safely',
                }],
                data: {
                    attempt: {id: attempts[0].slice('--attempt='.length)},
                    resumePhase: 'MANUAL_RECOVERY',
                    nextAction: 'Inspect the retained hook and repository configuration state.',
                },
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: `setup hooks ${operation}`,
            projectRoot: reportProjectRoot(projectRoot),
            ...result,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'repository' && args[1] === 'create') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup repository create --attempt=UUID ' +
                '--digest=SHA256 [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let created;
        try {
            created = createBootstrapRepository({
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
                runGit: context.bootstrapGitRun ?? runBounded,
                env: context.env ?? process.env,
                fault: context.bootstrapRepositoryFault,
            });
        } catch {
            const report = {
                schemaVersion: 1,
                command: 'setup repository create',
                status: 'NO-GO',
                disposition: 'REPOSITORY_CONFLICT',
                projectRoot: reportProjectRoot(projectRoot),
                checks: [{
                    id: 'bootstrap-repository',
                    status: 'FAIL',
                    message: 'durable project repository could not be created safely',
                }],
                data: {
                    attempt: {id: attempts[0].slice('--attempt='.length)},
                    resumePhase: 'MANUAL_RECOVERY',
                    nextAction: 'Inspect the retained project and repository state before retrying setup.',
                },
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup repository create',
            projectRoot: reportProjectRoot(projectRoot),
            ...created,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'project' && args[1] === 'apply') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const approvals = controls.filter((argument) => argument.startsWith('--approval='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            approvals.length !== 1 ||
            approvals[0] !== '--approval=yes' ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=') &&
                !argument.startsWith('--approval=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup project apply --attempt=UUID ' +
                '--digest=SHA256 --approval=yes [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let applied;
        try {
            applied = applyBootstrapProject({
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
                approval: 'yes',
                fault: context.bootstrapApplyFault,
                run: context.run ?? runBounded,
            });
        } catch {
            const report = {
                schemaVersion: 1,
                command: 'setup project apply',
                status: 'NO-GO',
                disposition: 'RECOVERY_REQUIRED',
                projectRoot: reportProjectRoot(projectRoot),
                checks: [{
                    id: 'bootstrap-project-application',
                    status: 'FAIL',
                    message: 'bootstrap project application failed',
                }],
                data: {
                    attempt: {id: attempts[0].slice('--attempt='.length)},
                    resumePhase: 'MANUAL_RECOVERY',
                    nextAction: 'Inspect the retained project and attempt state before retrying setup.',
                },
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup project apply',
            projectRoot: fs.realpathSync(projectRoot),
            ...applied,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'project' && args[1] === 'recover') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup project recover --attempt=UUID ' +
                '--digest=SHA256 [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let recovered;
        try {
            recovered = recoverBootstrapProject({
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
            });
        } catch (error) {
            const attemptId = attempts[0].slice('--attempt='.length);
            const retainedRecovery = error?.cause?.bootstrapApplyRecovery === true;
            const report = {
                schemaVersion: 1,
                command: 'setup project recover',
                status: 'NO-GO',
                disposition: 'RECOVERY_REQUIRED',
                projectRoot: reportProjectRoot(projectRoot),
                checks: [{
                    id: 'bootstrap-project-recovery',
                    status: 'FAIL',
                    message: 'bootstrap project state could not be restored safely',
                }],
                data: {
                    attempt: {id: attemptId},
                    resumePhase: 'MANUAL_RECOVERY',
                    ...(retainedRecovery ? {
                        recoveryPath: path.posix.join(
                            '.pi', 'prism-tool', 'bootstrap', attemptId,
                            'apply.recovery.lock'
                        ),
                        nextAction: 'After confirming no setup process is running, remove only the recovery path and rerun setup project apply.',
                    } : {
                        nextAction: 'Inspect the retained project and attempt state before retrying setup.',
                    }),
                },
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup project recover',
            projectRoot: fs.realpathSync(projectRoot),
            ...recovered,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'project' && args[1] === 'validate') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const digests = controls.filter((argument) => argument.startsWith('--digest='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            digests.length !== 1 ||
            !/^[0-9a-f]{64}$/.test(digests[0].slice('--digest='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--attempt=') &&
                !argument.startsWith('--digest=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup project validate --attempt=UUID ' +
                '--digest=SHA256 [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let validated;
        try {
            validated = validateBootstrapProjectPlan({
                projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                attemptId: attempts[0].slice('--attempt='.length),
                planDigest: digests[0].slice('--digest='.length),
            });
        } catch (error) {
            const reason = /plan is invalid/u.test(error.message) ? 'INVALID_PLAN' : 'STALE_PROJECT_STATE';
            const report = {
                schemaVersion: 1,
                command: 'setup project validate',
                status: 'NO-GO',
                disposition: reason,
                reason,
                projectRoot: fs.realpathSync(projectRoot),
                checks: [{
                    id: 'bootstrap-project-plan',
                    status: 'FAIL',
                    message: 'bootstrap project plan validation failed',
                }],
                data: {attempt: {id: attempts[0].slice('--attempt='.length)}},
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup project validate',
            status: 'GO',
            disposition: 'PLAN_VALID',
            projectRoot: fs.realpathSync(projectRoot),
            ...validated,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'project' && args[1] === 'plan') {
        const controls = args.slice(2);
        const sources = controls.filter((argument) => argument.startsWith('--source='));
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        const adapterPackage = adapters.length === 1
            ? adapters[0].slice('--adapter='.length)
            : '';
        const coreOnly = adapterPackage === 'core-only';
        if (
            sources.length !== 1 ||
            sources[0] !== '--source=blank' ||
            adapters.length !== 1 ||
            adapterPackage.length === 0 ||
            (!coreOnly && !/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(adapterPackage)) ||
            (coreOnly && attempts.length !== 0) ||
            (!coreOnly && (attempts.length !== 1 || attempts[0].length === '--attempt='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--source=') &&
                !argument.startsWith('--adapter=') &&
                !argument.startsWith('--attempt=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup project plan --source=blank ' +
                '--adapter=core-only|PACKAGE [--attempt=UUID] [--json]\n'
            );
            return EXIT.USAGE;
        }
        const requestedRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        let route;
        try {
            route = coreOnly
                ? inspectSetupRoute({projectRoot: requestedRoot, source: 'BLANK'})
                : {projectRoot: fs.realpathSync(requestedRoot), status: 'GO', disposition: 'PROVISIONED'};
        } catch {
            process.stderr.write('prism-tool: project planning requires valid setup state\n');
            return EXIT.TRANSACTION;
        }
        if (coreOnly && (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY')) {
            process.stderr.write('prism-tool: project planning requires strict-empty setup\n');
            return EXIT.TRANSACTION;
        }
        let metadata;
        try {
            metadata = normalizeProjectMetadata({
                projectRoot: route.projectRoot,
                input: readBoundedStdin({...context, inputLimit: 16384}),
            });
        } catch {
            process.stderr.write('prism-tool: project metadata is invalid\n');
            return EXIT.TRANSACTION;
        }
        if (context.bootstrapPlanStage === 'provider' && coreOnly) {
            let provider;
            try {
                provider = renderCoreBaseline({
                    coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                    projectRoot: route.projectRoot,
                    candidateRoot: context.bootstrapCandidateRoot,
                    request: {
                        schemaVersion: 1,
                        source: {mode: 'BLANK', evidence: null},
                        capabilities: [],
                        metadata,
                        adapter: null,
                    },
                });
            } catch {
                process.stderr.write('prism-tool: Core baseline provider failed\n');
                return EXIT.TRANSACTION;
            }
            const report = {
                schemaVersion: 1,
                command: 'setup project plan',
                status: 'GO',
                disposition: 'PROVIDER_READY',
                projectRoot: route.projectRoot,
                source: 'BLANK',
                adapter: null,
                checks: provider.checks,
                data: provider,
            };
            if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
            else process.stdout.write(`${report.status}\n`);
            return EXIT.OK;
        }
        let planned;
        try {
            const planOptions = {
                projectRoot: route.projectRoot,
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                input: JSON.stringify({
                    schemaVersion: metadata.schemaVersion,
                    displayName: metadata.displayName,
                    summary: metadata.summary,
                }),
            };
            planned = coreOnly
                ? planCoreOnlyProject({
                    ...planOptions,
                    randomUUID: context.randomUUID ?? crypto.randomUUID,
                })
                : planAdapterProject({
                    ...planOptions,
                    attemptId: attempts[0].slice('--attempt='.length),
                    packageName: adapterPackage,
                    run: context.run ?? runBounded,
                });
        } catch (error) {
            if (error.recoveryRequired) {
                const report = {
                    schemaVersion: 1,
                    command: 'setup project plan',
                    status: 'NO-GO',
                    disposition: 'RECOVERY_REQUIRED',
                    reason: 'AMBIGUOUS_ATTEMPT_STATE',
                    projectRoot: route.projectRoot,
                    source: {mode: 'BLANK', evidence: null},
                    adapter: null,
                    capabilities: [],
                    checks: [{
                        id: 'bootstrap-project-plan',
                        status: 'FAIL',
                        message: 'bootstrap attempt state changed unexpectedly and was preserved',
                    }],
                    data: {
                        recoveryPath: error.recoveryPath,
                        nextAction: 'Inspect the retained attempt state manually before retrying setup.',
                    },
                };
                if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
                else process.stdout.write(`${report.status}\n`);
                return EXIT.TRANSACTION;
            }
            process.stderr.write('prism-tool: project planning failed\n');
            return EXIT.TRANSACTION;
        }
        const report = {
            schemaVersion: 1,
            command: 'setup project plan',
            status: 'GO',
            disposition: 'PLAN_READY',
            projectRoot: route.projectRoot,
            ...planned,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else process.stdout.write(`${report.status}\n`);
        return EXIT.OK;
    }
    if (args[0] === 'project' && args[1] === 'metadata') {
        const controls = args.slice(2);
        const sources = controls.filter((argument) => argument.startsWith('--source='));
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            sources.length !== 1 ||
            sources[0] !== '--source=blank' ||
            adapters.length !== 1 ||
            adapters[0] !== '--adapter=core-only' ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--source=') &&
                !argument.startsWith('--adapter=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup project metadata --source=blank ' +
                '--adapter=core-only [--json]\n'
            );
            return EXIT.USAGE;
        }
        const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
        const route = inspectSetupRoute({projectRoot, source: 'BLANK'});
        if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
            process.stderr.write('prism-tool: project metadata requires strict-empty setup\n');
            return EXIT.TRANSACTION;
        }
        const metadata = inspectMinimalMetadata({projectRoot: route.projectRoot});
        const report = {
            schemaVersion: 1,
            command: 'setup project metadata',
            status: 'GO',
            disposition: 'METADATA_REQUIRED',
            projectRoot: route.projectRoot,
            source: 'BLANK',
            adapter: null,
            checks: [{
                id: 'bootstrap-project-metadata',
                status: 'PASS',
                message: 'minimal project metadata fields are available',
            }],
            data: metadata,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const field of report.data.fields) {
                const suggestion = field.suggestedValue ?? '';
                process.stdout.write(`${field.id}\t${suggestion}\n`);
            }
            process.stdout.write(`${report.status}\n`);
        }
        return EXIT.OK;
    }
    if (args[0] === 'adapter' && args[1] === 'catalogue') {
        const controls = args.slice(2);
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (jsonCount > 1 || controls.some((argument) => argument !== '--json')) {
            process.stderr.write('usage: prism-tool setup adapter catalogue [--json]\n');
            return EXIT.USAGE;
        }
        let report;
        try {
            report = inspectSupportedAdapters({
                projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
                coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                catalogue: context.adapterCatalogue,
            });
        } catch {
            process.stderr.write('prism-tool: supported adapter catalogue is invalid\n');
            return EXIT.TRANSACTION;
        }
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`disposition\t${report.disposition}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'adapter' && args[1] === 'cleanup') {
        const controls = args.slice(2);
        const attempts = controls.filter((argument) => argument.startsWith('--attempt='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            attempts.length !== 1 ||
            !BOOTSTRAP_ATTEMPT_ID.test(attempts[0].slice('--attempt='.length)) ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' && !argument.startsWith('--attempt=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup adapter cleanup --attempt=UUID [--json]\n'
            );
            return EXIT.USAGE;
        }
        let report;
        try {
            report = cleanupBootstrapAdapter({
                projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
                attemptId: attempts[0].slice('--attempt='.length),
            });
        } catch {
            process.stderr.write('prism-tool: bootstrap adapter cleanup failed\n');
            return EXIT.TRANSACTION;
        }
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`disposition\t${report.disposition}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'adapter' && args[1] === 'select') {
        const controls = args.slice(2);
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const sources = controls.filter((argument) => argument.startsWith('--source='));
        const networks = controls.filter((argument) => argument.startsWith('--network-approved='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            adapters.length !== 1 ||
            adapters[0].length === '--adapter='.length ||
            sources.length !== 1 ||
            !['--source=template', '--source=blank'].includes(sources[0]) ||
            networks.length > 1 ||
            (networks.length === 1 && networks[0] !== '--network-approved=yes') ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--adapter=') &&
                !argument.startsWith('--source=') &&
                !argument.startsWith('--network-approved=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup adapter select --adapter=ID --source=template|blank ' +
                '[--network-approved=yes] [--json]\n'
            );
            return EXIT.USAGE;
        }
        const adapterId = adapters[0].slice('--adapter='.length);
        if (
            !['core-only', 'php-web'].includes(adapterId) ||
            (adapterId === 'core-only' && networks.length !== 0) ||
            (adapterId === 'php-web' && networks.length !== 1)
        ) {
            process.stderr.write(
                'usage: prism-tool setup adapter select --adapter=ID --source=template|blank ' +
                '[--network-approved=yes] [--json]\n'
            );
            return EXIT.USAGE;
        }
        const source = sources[0] === '--source=template' ? 'TEMPLATE' : 'BLANK';
        let report;
        try {
            if (adapterId === 'core-only') {
                report = selectCoreOnlyAdapter({
                    projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
                    coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                    catalogue: context.adapterCatalogue,
                    source,
                });
            } else {
                report = provisionBootstrapAdapter({
                    projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
                    coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
                    catalogue: context.adapterCatalogue,
                    adapterId,
                    source,
                    networkApproved: networks[0] === '--network-approved=yes',
                    piExecutable: context.piExecutable ?? resolveExecutable(
                        'pi',
                        context.env ?? process.env
                    ),
                    randomUUID: context.randomUUID ?? crypto.randomUUID,
                    run: context.run ?? runBounded,
                });
            }
        } catch {
            process.stderr.write('prism-tool: bootstrap adapter selection failed\n');
            return EXIT.TRANSACTION;
        }
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`disposition\t${report.disposition}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'source') {
        const controls = args.slice(1);
        const sources = controls.filter((argument) => argument.startsWith('--source='));
        const networks = controls.filter((argument) => argument.startsWith('--network-approved='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        const sourceName = sources.length === 1 ? sources[0].slice('--source='.length) : null;
        const validSource = sourceName === 'template' || sourceName === 'blank';
        const validNetwork = sourceName === 'template'
            ? networks.length === 1 && networks[0] === '--network-approved=yes'
            : networks.length === 0;
        if (
            sources.length !== 1 ||
            !validSource ||
            !validNetwork ||
            jsonCount > 1 ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--source=') &&
                !argument.startsWith('--network-approved=')
            )
        ) {
            process.stderr.write(
                'usage: prism-tool setup source --source=template|blank [--json] [--network-approved=yes]\n'
            );
            return EXIT.USAGE;
        }
        return inspectTemplateSource({
            projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
            source: sourceName.toUpperCase(),
            fetchImpl: context.fetch,
        }).then((report) => renderSetupSourceReport(report, jsonCount === 1));
    }
    if (args[0] === 'route') {
        const controls = args.slice(1);
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        const sources = controls.filter((argument) => argument.startsWith('--source='));
        const sourceValues = Object.freeze({
            template: 'TEMPLATE',
            blank: 'BLANK',
            cancel: 'CANCEL',
        });
        if (
            jsonCount > 1 ||
            sources.length > 1 ||
            controls.some((argument) => argument !== '--json' && !argument.startsWith('--source='))
        ) {
            process.stderr.write('usage: prism-tool setup route [--source=template|blank|cancel] [--json]\n');
            return EXIT.USAGE;
        }
        const sourceName = sources.length === 1 ? sources[0].slice('--source='.length) : null;
        if (sourceName !== null && !Object.prototype.hasOwnProperty.call(sourceValues, sourceName)) {
            process.stderr.write('usage: prism-tool setup route [--source=template|blank|cancel] [--json]\n');
            return EXIT.USAGE;
        }
        const report = inspectSetupRoute({
            projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
            source: sourceName === null ? null : sourceValues[sourceName],
        });
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`disposition\t${report.disposition}\n`);
            if (report.source !== null) process.stdout.write(`source\t${report.source}\n`);
            process.stdout.write(`route\t${report.route}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'verify') {
        const controls = args.slice(1);
        const networkApprovals = controls.filter((argument) => argument.startsWith('--network-approved='));
        if (networkApprovals.length !== 1 || networkApprovals[0] !== '--network-approved=yes') {
            process.stderr.write('prism-tool: network approval required\n');
            return EXIT.USAGE;
        }
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            adapters.length !== 1 ||
            adapters[0].length === '--adapter='.length ||
            jsonCount > 1 ||
            controls.some((argument) =>
                !argument.startsWith('--network-approved=') &&
                !argument.startsWith('--adapter=') &&
                argument !== '--json'
            )
        ) {
            process.stderr.write('usage: prism-tool setup verify --adapter=PACKAGE [--json] --network-approved=yes\n');
            return EXIT.USAGE;
        }
        let prepared;
        try {
            prepared = prepareSetupAdapter(adapters[0].slice('--adapter='.length), context);
        } catch (error) {
            return renderSetupOperationError(error);
        }
        const {handler, projectRoot, readiness, registration} = prepared;
        if (typeof handler.verify !== 'function') {
            process.stderr.write('prism-tool: adapter verify operation is unavailable\n');
            return EXIT.USAGE;
        }
        const result = handler.verify({
            contract: registration.contract,
            projectRoot,
            run: context.run ?? runBounded,
        });
        const report = {
            schemaVersion: 1,
            command: 'setup verify',
            adapter: registration.packageName,
            status: result.status,
            checks: [...readiness, ...result.checks],
            data: result.data,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`${report.status}\n`);
        }
        return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'apply') {
        const controls = args.slice(1);
        const approvals = controls.filter((argument) => argument.startsWith('--approval='));
        if (approvals.length !== 1 || approvals[0] !== '--approval=yes') {
            const declinedAdapters = controls.filter((argument) => argument.startsWith('--adapter='));
            if (declinedAdapters.length === 1 && declinedAdapters[0].length > '--adapter='.length) {
                const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
                try {
                    const registration = discoverAdapter({
                        projectRoot,
                        piDir: context.piDir ?? path.join(projectRoot, '.pi'),
                    });
                    if (registration.packageName === declinedAdapters[0].slice('--adapter='.length)) {
                        const handler = loadAdapterHandler(registration);
                        if (typeof handler.apply === 'function') {
                            handler.apply({
                                approved: false,
                                contract: registration.contract,
                                projectRoot,
                            });
                        }
                    }
                } catch {
                    process.stderr.write('prism-tool: candidate workspace cleanup failed\n');
                }
            }
            process.stderr.write('prism-tool: mutation approval required\n');
            return EXIT.USAGE;
        }
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const plans = controls.filter((argument) => argument.startsWith('--plan='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            adapters.length !== 1 ||
            adapters[0].length === '--adapter='.length ||
            plans.length !== 1 ||
            plans[0].length === '--plan='.length ||
            jsonCount > 1 ||
            controls.some((argument) =>
                !argument.startsWith('--approval=') &&
                !argument.startsWith('--adapter=') &&
                !argument.startsWith('--plan=') &&
                argument !== '--json'
            )
        ) {
            process.stderr.write('usage: prism-tool setup apply --adapter=PACKAGE --plan=PATH [--json] --approval=yes\n');
            return EXIT.USAGE;
        }
        let prepared;
        try {
            prepared = prepareSetupAdapter(adapters[0].slice('--adapter='.length), context);
        } catch (error) {
            return renderSetupOperationError(error);
        }
        const {handler, projectRoot, readiness, registration} = prepared;
        if (typeof handler.apply !== 'function') {
            process.stderr.write('prism-tool: adapter apply operation is unavailable\n');
            return EXIT.USAGE;
        }
        const result = handler.apply({
            approved: true,
            contract: registration.contract,
            projectRoot,
            planPath: plans[0].slice('--plan='.length),
            run: context.run ?? runBounded,
        });
        const report = {
            schemaVersion: 1,
            command: 'setup apply',
            adapter: registration.packageName,
            status: result.status,
            checks: [...readiness, ...result.checks],
            data: result.data,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            if (result.data?.retry) process.stdout.write(`retry\t${result.data.retry}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args[0] === 'resolve') {
        const controls = args.slice(1);
        const networkApprovals = controls.filter((argument) => argument.startsWith('--network-approved='));
        if (networkApprovals.length !== 1 || networkApprovals[0] !== '--network-approved=yes') {
            process.stderr.write('prism-tool: network approval required\n');
            return EXIT.USAGE;
        }
        const adapters = controls.filter((argument) => argument.startsWith('--adapter='));
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (
            adapters.length !== 1 ||
            adapters[0].length === '--adapter='.length ||
            jsonCount > 1 ||
            controls.some((argument) =>
                !argument.startsWith('--network-approved=') &&
                !argument.startsWith('--adapter=') &&
                argument !== '--json'
            )
        ) {
            process.stderr.write('usage: prism-tool setup resolve --adapter=PACKAGE [--json] --network-approved=yes\n');
            return EXIT.USAGE;
        }
        let prepared;
        try {
            prepared = prepareSetupAdapter(adapters[0].slice('--adapter='.length), context);
        } catch (error) {
            return renderSetupOperationError(error);
        }
        const {handler, projectRoot, readiness, registration} = prepared;
        if (typeof handler.resolve !== 'function') {
            process.stderr.write('prism-tool: adapter resolve operation is unavailable\n');
            return EXIT.USAGE;
        }
        const result = handler.resolve({
            contract: registration.contract,
            projectRoot,
            workspaceRoot: path.join(projectRoot, '.pi', 'prism-tool', 'work'),
            run: context.run ?? runBounded,
        });
        const report = {
            schemaVersion: 1,
            command: 'setup resolve',
            adapter: registration.packageName,
            status: result.status,
            checks: [...readiness, ...result.checks],
            data: result.data,
        };
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`${report.status}\n`);
        }
        return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (args.length < 1 || args[0] !== 'inspect' || args.slice(1).some((argument) => argument !== '--json')) {
        process.stderr.write('usage: prism-tool setup inspect [--json]\n');
        return EXIT.USAGE;
    }
    if (args.slice(1).filter((argument) => argument === '--json').length > 1) {
        process.stderr.write('usage: prism-tool setup inspect [--json]\n');
        return EXIT.USAGE;
    }
    const json = args.includes('--json');
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let coreContract;
    try {
        coreContract = loadCoreContract(coreRoot);
    } catch {
        process.stderr.write('prism-tool: invalid core toolchain contract\n');
        return EXIT.USAGE;
    }
    const readiness = checkExternalTools({
        contract: coreContract,
        env: context.env ?? process.env,
        run: context.run ?? runBounded,
    });
    if (readiness.some(({status}) => status !== 'PASS')) {
        process.stderr.write('prism-tool: mandatory external readiness failed\n');
        return EXIT.READINESS;
    }
    const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
    let registration;
    let handler;
    try {
        registration = discoverAdapter({
            projectRoot,
            piDir: context.piDir ?? path.join(projectRoot, '.pi'),
        });
        handler = loadAdapterHandler(registration);
    } catch {
        process.stderr.write('prism-tool: active adapter discovery failed\n');
        return EXIT.USAGE;
    }
    const result = handler.inspect({
        contract: registration.contract,
        projectRoot,
        run: context.run ?? runBounded,
    });
    const report = {
        schemaVersion: 1,
        command: 'setup inspect',
        adapter: registration.packageName,
        status: result.status,
        checks: [...readiness, ...result.checks],
        data: result.data,
    };
    if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else {
        for (const check of report.checks) {
            process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
        }
        process.stdout.write(`${report.status}\n`);
    }
    return result.status === 'GO' ? EXIT.OK : EXIT.TOOL;
}

function runDeclaredTool(args, context) {
    let parsed;
    try {
        parsed = parseRun(args);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        return EXIT.USAGE;
    }
    const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
    let contract;
    try {
        contract = loadCoreContract(coreRoot);
    } catch {
        process.stderr.write('prism-tool: invalid core toolchain contract\n');
        return EXIT.USAGE;
    }
    let component = contract.components.find(({id}) => id === parsed.toolId);
    let adapterHandler;
    const projectRoot = context.projectRoot ?? context.cwd ?? process.cwd();
    if (!component) {
        try {
            const registration = discoverAdapter({
                projectRoot,
                piDir: context.piDir ?? path.join(projectRoot, '.pi'),
            });
            component = registration.contract.components.find(({id}) => id === parsed.toolId);
            adapterHandler = loadAdapterHandler(registration);
        } catch {
            process.stderr.write('prism-tool: active adapter discovery failed\n');
            return EXIT.USAGE;
        }
    }
    if (!component || component.kind !== 'command') {
        process.stderr.write('prism-tool: unknown tool id\n');
        return EXIT.USAGE;
    }
    if (component.id === 'ocr') {
        process.stderr.write('prism-tool: OCR requires the dedicated code-review operation\n');
        return EXIT.USAGE;
    }
    const defaultTimeoutMs = component.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    if (
        parsed.timeoutMs !== undefined &&
        (parsed.timeoutMs < defaultTimeoutMs || parsed.timeoutMs > MAX_EXECUTION_TIMEOUT_MS)
    ) {
        process.stderr.write(`${RUN_USAGE}\n`);
        return EXIT.USAGE;
    }
    if (!argumentsAllowed(component, parsed.toolArgs)) {
        process.stderr.write('prism-tool: arguments rejected by contract\n');
        return EXIT.USAGE;
    }
    let toolArgs = parsed.toolArgs;
    if (component.id === 'commitlint') {
        if (toolArgs.some((argument) =>
            argument === '--config' ||
            argument.startsWith('--config=') ||
            argument === '-g' ||
            argument.startsWith('-g=')
        )) {
            process.stderr.write('prism-tool: commitlint config override is not allowed\n');
            return EXIT.USAGE;
        }
        toolArgs = [...toolArgs, '--config', path.join(coreRoot, 'config', 'commitlint.config.cjs')];
    }
    const env = context.env ?? process.env;
    const readiness = checkExternalTools({contract, env, run: context.run ?? runBounded});
    if (readiness.some((check) => check.status !== 'PASS')) {
        process.stderr.write('prism-tool: mandatory external readiness failed\n');
        return EXIT.READINESS;
    }
    let executable;
    if (component.provisioning === 'external') {
        executable = resolveExecutable(component.executable, env);
        if (!executable) {
            process.stderr.write('prism-tool: mandatory external readiness failed\n');
            return EXIT.READINESS;
        }
    } else if (component.provisioning === 'bundled') {
        try {
            executable = resolveBundledComponent(coreRoot, component);
        } catch {
            process.stderr.write('prism-tool: bundled tool is unavailable\n');
            return EXIT.TOOL;
        }
    } else {
        try {
            executable = adapterHandler.resolveTool({component, projectRoot});
        } catch {
            process.stderr.write('prism-tool: adapter tool is unavailable\n');
            return EXIT.TOOL;
        }
    }
    // argvPrefix prepends interpreter/flag tokens (e.g. php -d key=value) so
    // argv[0] is the interpreter when a prefix is declared, the executable
    // otherwise. The interpreter itself must exist or the failure is opaque;
    // check it before consuming stdin.
    const argv = [...(component.argvPrefix ?? []), executable, ...toolArgs];
    if (!context.run && component.argvPrefix?.length && !resolveExecutable(argv[0], env)) {
        process.stderr.write(`prism-tool: command ${argv[0]} required for tool ${component.id} is unavailable\n`);
        return EXIT.READINESS;
    }
    let input;
    try {
        input = readBoundedStdin(context);
    } catch {
        process.stderr.write('prism-tool: stdin exceeds limit\n');
        return EXIT.USAGE;
    }
    const result = (context.run ?? runBounded)(argv[0], argv.slice(1), {
        cwd: component.provisioning === 'consumer-dev'
            ? fs.realpathSync(projectRoot)
            : context.cwd ?? process.cwd(),
        env,
        input,
        maxBuffer: context.maxBuffer,
        timeout: context.timeout ?? parsed.timeoutMs ?? defaultTimeoutMs,
    });
    if (result.error) {
        const reason = result.timedOut ? 'timeout' : 'output or process failure';
        process.stderr.write(`prism-tool: tool ${reason}\n`);
        return EXIT.TOOL;
    }
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.status === 0 ? EXIT.OK : EXIT.TOOL;
}

function renderPackageReleaseReport(report, json) {
    if (json) {
        process.stdout.write(`${JSON.stringify(report)}\n`);
        return;
    }
    for (const check of report.checks ?? []) {
        process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
    }
    if (report.disposition) process.stdout.write(`disposition\t${report.disposition}\n`);
    process.stdout.write(`${report.status}\n`);
}

function renderPackageReleaseFailure(operation, json) {
    if (json) {
        renderPackageReleaseReport({
            schemaVersion: 1,
            command: `package-release ${operation}`,
            status: 'NO-GO',
            checks: [{
                id: 'package-release-operation',
                status: 'FAIL',
                message: 'package-release operation failed',
            }],
            data: {reason: 'operation failure'},
        }, true);
    } else {
        process.stderr.write('prism-tool: package-release operation failed\n');
    }
    return EXIT.TOOL;
}

function packageReleaseRoots(context) {
    return {
        projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
        coreRoot: context.coreRoot ?? path.resolve(__dirname, '../..'),
    };
}

function parseJsonControl(controls) {
    const jsonCount = controls.filter((argument) => argument === '--json').length;
    if (jsonCount > 1) throw new Error('invalid JSON control');
    return jsonCount === 1;
}

function packageReleaseCommand(args, context) {
    const [operation, ...controls] = args;
    let json;
    try {
        json = parseJsonControl(controls);
    } catch {
        process.stderr.write('usage: prism-tool package-release inspect|plan|apply|verify [controls]\n');
        return EXIT.USAGE;
    }
    const roots = packageReleaseRoots(context);
    if (operation === 'inspect' || operation === 'plan' || operation === 'verify') {
        if (controls.some((argument) => argument !== '--json')) {
            process.stderr.write(`usage: prism-tool package-release ${operation} [--json]\n`);
            return EXIT.USAGE;
        }
        let result;
        try {
            if (operation === 'inspect') result = inspectReleaseCapability(roots);
            else if (operation === 'plan') result = planReleaseCapability(roots);
            else result = verifyReleaseCapability(roots);
        } catch {
            return renderPackageReleaseFailure(operation, json);
        }
        const report = {
            schemaVersion: 1,
            command: `package-release ${operation}`,
            ...result,
        };
        renderPackageReleaseReport(report, json);
        return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    if (operation === 'apply') {
        const approvals = controls.filter((argument) => argument.startsWith('--approval='));
        if (approvals.length !== 1 || approvals[0] !== '--approval=yes') {
            process.stderr.write('prism-tool: mutation approval required\n');
            return EXIT.USAGE;
        }
        const plans = controls.filter((argument) => argument.startsWith('--plan='));
        if (
            plans.length !== 1 ||
            plans[0].length === '--plan='.length ||
            controls.some((argument) =>
                argument !== '--json' &&
                !argument.startsWith('--approval=') &&
                !argument.startsWith('--plan=')
            )
        ) {
            process.stderr.write('usage: prism-tool package-release apply --plan=PATH [--json] --approval=yes\n');
            return EXIT.USAGE;
        }
        let result;
        try {
            result = applyReleaseCapability({
                ...roots,
                planPath: plans[0].slice('--plan='.length),
            });
        } catch {
            return renderPackageReleaseFailure('apply', json);
        }
        const report = {schemaVersion: 1, command: 'package-release apply', ...result};
        renderPackageReleaseReport(report, json);
        return result.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
    process.stderr.write('usage: prism-tool package-release inspect|plan|apply|verify [controls]\n');
    return EXIT.USAGE;
}

function main(argv, context = {}) {
    const [command, ...args] = argv;
    if (command === 'run') return runDeclaredTool(args, context);
    if (command === 'doctor') return doctor(args, context);
    if (command === 'setup') return setup(args, context);
    if (command === 'resolve') return resolveKindDir(args, context);
    if (command === 'pr') return prCommand(args, context);
    if (command === 'commit') return commitCommand(args, context);
    if (command === 'hook') return hookCommand(args, context);
    if (command === 'consent') return consentCommand(args, context);
    if (command === 'code-review') return codeReviewCommand(args, context);
    if (command === 'package-release') return packageReleaseCommand(args, context);
    process.stderr.write('prism-tool: unknown command\n');
    return EXIT.USAGE;
}

module.exports = {EXIT, doctor, main, resolveBundledComponent};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
