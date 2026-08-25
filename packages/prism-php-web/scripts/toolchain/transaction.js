// $KYAULabs: transaction.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeComposerAudit, normalizeNpmAudit} = require('./audit');
const {resolveTool} = require('./project');
const {
    createWorkspace,
    readOwnedWorkspace,
    recoverWorkspace,
    replaceConsumerFiles,
} = require('./workspace');

const CONSUMER_FILES = ['composer.json', 'composer.lock', 'package.json', 'package-lock.json'];
const COMMAND_OPTIONS = Object.freeze({maxBuffer: 1048576, timeout: 300000});

class InvalidPlanError extends Error {}
class PostApplyError extends Error {
    constructor(retry) {
        super('post-apply operation failed');
        this.retry = retry;
    }
}
class StalePlanError extends Error {}

const DIGEST = /^[a-f0-9]{64}$/;

function hasExactKeys(value, keys) {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function validatePlan(plan, contract, canonicalProject) {
    if (!hasExactKeys(plan, [
        'schemaVersion',
        'adapter',
        'projectRoot',
        'original',
        'candidate',
        'audit',
        'browserTargets',
    ])) throw new InvalidPlanError('candidate plan schema is invalid');
    if (
        plan.schemaVersion !== 1 ||
        plan.adapter !== contract.package ||
        plan.projectRoot !== canonicalProject ||
        !hasExactKeys(plan.original, CONSUMER_FILES) ||
        !hasExactKeys(plan.candidate, CONSUMER_FILES) ||
        !hasExactKeys(plan.audit, ['critical', 'high', 'moderate', 'low']) ||
        !Array.isArray(plan.browserTargets)
    ) {
        throw new InvalidPlanError('candidate plan schema is invalid');
    }
    for (const name of CONSUMER_FILES) {
        if (plan.original[name] !== 'absent' && !DIGEST.test(plan.original[name])) {
            throw new InvalidPlanError('candidate plan digest is invalid');
        }
        if (!DIGEST.test(plan.candidate[name])) {
            throw new InvalidPlanError('candidate plan digest is invalid');
        }
    }
    if (Object.values(plan.audit).some((total) => !Number.isInteger(total) || total !== 0)) {
        throw new InvalidPlanError('candidate plan audit is invalid');
    }
    if (plan.browserTargets.length !== 1 || plan.browserTargets[0] !== 'chromium') {
        throw new InvalidPlanError('candidate browser targets are invalid');
    }
    return plan;
}

function digestFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertConsumerFiles(projectRoot) {
    for (const name of CONSUMER_FILES) {
        const filePath = path.join(projectRoot, name);
        let stat;
        try {
            stat = fs.lstatSync(filePath);
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error('consumer manifest or lock is invalid');
        }
    }
}

function exactPairs(contract, ecosystem, separator) {
    return contract.components
        .filter((component) => component.ecosystem === ecosystem)
        .map((component) => `${component.package}${separator}${component.version}`);
}

function runRequired(run, command, args, cwd) {
    const result = run(command, args, {...COMMAND_OPTIONS, cwd});
    if (result.error || result.status !== 0) throw new Error('candidate command failed');
    return result;
}

function combinedTotals(composer, npm) {
    return Object.fromEntries(
        ['critical', 'high', 'moderate', 'low'].map((severity) => [
            severity,
            composer.totals[severity] + npm.totals[severity],
        ])
    );
}

function extractExactVersion(output) {
    if (typeof output !== 'string' || Buffer.byteLength(output) > 1048576) {
        throw new Error('version output is invalid');
    }
    const matches = output.match(/(?<![0-9A-Za-z.-])v?(\d+\.\d+\.\d+)(?![0-9A-Za-z.-])/g) ?? [];
    const versions = new Set(matches.map((match) => match.replace(/^v/, '')));
    if (versions.size !== 1) throw new Error('version output is invalid');
    return [...versions][0];
}

function readJsonFile(filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16777216) {
        throw new Error('lockfile is invalid');
    }
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('lockfile is invalid');
    }
    return value;
}

function installLockedGraph({contract, projectRoot, run, resumePhase = null}) {
    const skipComposer = [
        'PROVIDER_EFFECT:npm-install',
        'PROVIDER_EFFECT:playwright-chromium',
    ].includes(resumePhase);
    const skipNpm = resumePhase === 'PROVIDER_EFFECT:playwright-chromium';
    if (!skipComposer) {
        const composer = run('composer', ['install', '--no-scripts', '--no-interaction'], {
            ...COMMAND_OPTIONS,
            cwd: projectRoot,
        });
        if (composer.error || composer.status !== 0) {
            throw new PostApplyError('composer install --no-scripts --no-interaction');
        }
    }
    if (!skipNpm) {
        const npm = run('npm', ['ci', '--ignore-scripts'], {...COMMAND_OPTIONS, cwd: projectRoot});
        if (npm.error || npm.status !== 0) throw new PostApplyError('npm ci --ignore-scripts');
    }
    const playwright = contract.components.find(({id}) => id === 'playwright');
    let executable;
    try {
        executable = resolveTool({component: playwright, projectRoot});
    } catch {
        throw new PostApplyError('npm ci --ignore-scripts');
    }
    const browser = run(executable, ['install', 'chromium'], {...COMMAND_OPTIONS, cwd: projectRoot});
    if (browser.error || browser.status !== 0) {
        throw new PostApplyError('playwright install chromium');
    }
}

function verifyInstalledGraph({contract, projectRoot, run}) {
    const composerLock = readJsonFile(path.join(projectRoot, 'composer.lock'));
    const composerPackages = new Map(
        [...(composerLock.packages ?? []), ...(composerLock['packages-dev'] ?? [])]
            .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.version === 'string')
            .map((entry) => [entry.name, entry.version.replace(/^v/, '')])
    );
    const packageLock = readJsonFile(path.join(projectRoot, 'package-lock.json'));
    if (packageLock.packages === null || typeof packageLock.packages !== 'object') {
        throw new Error('npm lockfile is invalid');
    }
    for (const component of contract.components) {
        const installed = component.ecosystem === 'composer'
            ? composerPackages.get(component.package)
            : packageLock.packages[`node_modules/${component.package}`]?.version;
        if (installed !== component.version) throw new Error('installed lock graph does not match');
    }
    for (const component of contract.components.filter(({kind}) => kind === 'command')) {
        const executable = resolveTool({component, projectRoot});
        const result = run(executable, component.versionArguments, {
            cwd: projectRoot,
            maxBuffer: 1048576,
            timeout: 30000,
        });
        if (result.error || result.status !== 0 || extractExactVersion(result.stdout) !== component.version) {
            throw new Error('installed command version does not match');
        }
    }
}

function auditInstalledGraph({projectRoot, run}) {
    const composer = normalizeComposerAudit(run(
        'composer',
        ['audit', '--locked', '--format=json'],
        {...COMMAND_OPTIONS, cwd: projectRoot}
    ));
    const npm = normalizeNpmAudit(run(
        'npm',
        ['audit', '--package-lock-only', '--json'],
        {...COMMAND_OPTIONS, cwd: projectRoot}
    ));
    const totals = combinedTotals(composer, npm);
    if (Object.values(totals).some((total) => total !== 0)) {
        throw new Error('installed graph has advisories');
    }
    return totals;
}

function installBootstrapDependencies({contract, projectRoot, run, resumePhase}) {
    if (
        typeof resumePhase === 'string' &&
        resumePhase.startsWith('PROVIDER_VERIFICATION:') &&
        resumePhase !== 'PROVIDER_VERIFICATION:installed-graph'
    ) {
        return {status: 'GO', checks: [], data: {resumePhase}};
    }
    try {
        if (resumePhase !== 'PROVIDER_VERIFICATION:installed-graph') {
            installLockedGraph({contract, projectRoot, run, resumePhase});
        }
    } catch (error) {
        const resumePhase = new Map([
            ['composer install --no-scripts --no-interaction', 'PROVIDER_EFFECT:composer-install'],
            ['npm ci --ignore-scripts', 'PROVIDER_EFFECT:npm-install'],
            ['playwright install chromium', 'PROVIDER_EFFECT:playwright-chromium'],
        ]).get(error.retry) ?? 'PROVIDER_EFFECT:dependency-installation';
        return {
            status: 'NO-GO',
            checks: [{id: 'bootstrap-dependencies', status: 'FAIL', message: 'bootstrap dependency installation failed'}],
            data: {retry: error.retry ?? 'dependency installation', resumePhase},
        };
    }
    const verified = verifyInstalledProject({contract, projectRoot, run});
    if (verified.status !== 'GO') {
        return {
            ...verified,
            data: {
                ...verified.data,
                retry: 'installed dependency verification',
                resumePhase: 'PROVIDER_VERIFICATION:installed-graph',
            },
        };
    }
    return verified;
}

function verifyInstalledProject({contract, projectRoot, run}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    try {
        const audit = auditInstalledGraph({projectRoot: canonicalProject, run});
        verifyInstalledGraph({contract, projectRoot: canonicalProject, run});
        return {
            status: 'GO',
            checks: [
                {id: 'installed-audit', status: 'PASS', message: 'zero advisories'},
                {id: 'installed-graph', status: 'PASS', message: 'exact versions installed'},
            ],
            data: {audit},
        };
    } catch {
        return {
            status: 'NO-GO',
            checks: [{id: 'installed-graph', status: 'FAIL', message: 'installed verification failed'}],
            data: {reason: 'verification failure'},
        };
    }
}

function cleanupOwnedWorkspace(projectRoot, adapter) {
    try {
        return recoverWorkspace({projectRoot, adapter});
    } catch {
        return false;
    }
}

function applyCandidate({contract, projectRoot, planPath, rename, run}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    let workspace;
    try {
        workspace = readOwnedWorkspace({projectRoot: canonicalProject, adapter: contract.package});
        if (!workspace) throw new InvalidPlanError('candidate workspace is missing');
        const expectedPlan = path.join(workspace.root, 'candidate-plan.json');
        if (typeof planPath !== 'string' || path.resolve(planPath) !== expectedPlan) {
            throw new InvalidPlanError('candidate plan path is invalid');
        }
        const planStat = fs.lstatSync(expectedPlan);
        if (planStat.isSymbolicLink() || !planStat.isFile() || planStat.size > 1048576) {
            throw new InvalidPlanError('candidate plan is invalid');
        }
        let parsedPlan;
        try {
            parsedPlan = JSON.parse(fs.readFileSync(expectedPlan, 'utf8'));
        } catch {
            throw new InvalidPlanError('candidate plan is invalid');
        }
        const plan = validatePlan(parsedPlan, contract, canonicalProject);
        const candidateRoot = path.join(workspace.root, 'candidate');
        const candidateStat = fs.lstatSync(candidateRoot);
        if (candidateStat.isSymbolicLink() || !candidateStat.isDirectory()) {
            throw new InvalidPlanError('candidate directory is invalid');
        }
        for (const name of CONSUMER_FILES) {
            const currentPath = path.join(canonicalProject, name);
            let currentStat;
            try {
                currentStat = fs.lstatSync(currentPath);
            } catch (error) {
                if (error.code !== 'ENOENT') throw new StalePlanError('consumer file is invalid');
            }
            let actual = 'absent';
            if (currentStat) {
                if (currentStat.isSymbolicLink() || !currentStat.isFile()) {
                    throw new StalePlanError('consumer file is invalid');
                }
                actual = digestFile(currentPath);
            }
            if (plan.original[name] !== actual) throw new StalePlanError('candidate plan is stale');
            const candidatePath = path.join(candidateRoot, name);
            const candidateFileStat = fs.lstatSync(candidatePath);
            if (candidateFileStat.isSymbolicLink() || !candidateFileStat.isFile()) {
                throw new InvalidPlanError('candidate file is invalid');
            }
            if (digestFile(candidatePath) !== plan.candidate[name]) {
                throw new InvalidPlanError('candidate file digest does not match');
            }
        }
        replaceConsumerFiles({
            projectRoot: canonicalProject,
            workspaceRoot: workspace.root,
            names: CONSUMER_FILES,
            rename,
        });
        installLockedGraph({contract, projectRoot: canonicalProject, run});
        try {
            auditInstalledGraph({projectRoot: canonicalProject, run});
            verifyInstalledGraph({contract, projectRoot: canonicalProject, run});
        } catch {
            throw new PostApplyError(
                `prism-tool setup verify --adapter=${contract.package} --network-approved=yes`
            );
        }
        if (!cleanupOwnedWorkspace(canonicalProject, contract.package)) {
            throw new Error('candidate workspace cleanup failed');
        }
        workspace = null;
        return {
            status: 'GO',
            checks: [
                {id: 'candidate-application', status: 'PASS', message: 'candidate files applied'},
                {id: 'installed-audit', status: 'PASS', message: 'zero advisories'},
                {id: 'installed-graph', status: 'PASS', message: 'exact versions installed'},
            ],
            data: {audit: {...plan.audit}},
        };
    } catch (error) {
        if (workspace) cleanupOwnedWorkspace(canonicalProject, contract.package);
        let reason = 'transaction failure';
        if (error instanceof StalePlanError) reason = 'stale plan';
        else if (error instanceof InvalidPlanError) reason = 'invalid plan';
        else if (error instanceof PostApplyError) reason = 'post-apply failure';
        else if (/workspace ownership marker/.test(error.message)) reason = 'ownership mismatch';
        const data = {reason};
        if (error instanceof PostApplyError) data.retry = error.retry;
        return {
            status: 'NO-GO',
            checks: [{id: 'candidate-application', status: 'FAIL', message: 'candidate application failed'}],
            data,
        };
    }
}

function resolveCandidate({contract, projectRoot, workspaceRoot, run}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    const expectedWorkspace = path.join(canonicalProject, '.pi', 'prism-tool', 'work');
    if (workspaceRoot !== undefined && path.resolve(workspaceRoot) !== expectedWorkspace) {
        return {
            status: 'NO-GO',
            checks: [{id: 'candidate-resolution', status: 'FAIL', message: 'candidate resolution failed'}],
            data: {reason: 'tool failure', stage: 'workspace-validation'},
        };
    }
    let stage = 'consumer-validation';
    let workspace;
    try {
        assertConsumerFiles(canonicalProject);
        stage = 'workspace-recovery';
        recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
        stage = 'workspace-creation';
        workspace = createWorkspace({projectRoot: canonicalProject, adapter: contract.package});
        stage = 'candidate-preparation';
        const originalRoot = path.join(workspace.root, 'original');
        const candidateRoot = path.join(workspace.root, 'candidate');
        fs.mkdirSync(originalRoot, {mode: 0o700});
        fs.mkdirSync(candidateRoot, {mode: 0o700});
        const original = {};
        for (const name of CONSUMER_FILES) {
            const sourcePath = path.join(canonicalProject, name);
            if (!fs.existsSync(sourcePath)) {
                original[name] = 'absent';
                continue;
            }
            original[name] = digestFile(sourcePath);
            fs.copyFileSync(sourcePath, path.join(originalRoot, name));
            fs.copyFileSync(sourcePath, path.join(candidateRoot, name));
        }

        if (original['composer.json'] === 'absent') {
            fs.writeFileSync(path.join(candidateRoot, 'composer.json'), '{}\n', {flag: 'wx', mode: 0o600});
        }
        if (original['package.json'] === 'absent') {
            fs.writeFileSync(path.join(candidateRoot, 'package.json'), '{}\n', {flag: 'wx', mode: 0o600});
        }

        const composerPairs = exactPairs(contract, 'composer', ':');
        const npmPairs = exactPairs(contract, 'npm', '@');
        stage = 'composer-manifest-resolution';
        runRequired(run, 'composer', [
            'require',
            '--dev',
            '--no-update',
            '--no-scripts',
            '--no-interaction',
            ...composerPairs,
        ], candidateRoot);
        const composerUpdatePairs = original['composer.json'] === 'absent' ||
            original['composer.lock'] === 'absent'
            ? []
            : composerPairs;
        stage = 'composer-lock-resolution';
        runRequired(run, 'composer', [
            'update',
            ...composerUpdatePairs,
            '--with-all-dependencies',
            '--no-install',
            '--no-scripts',
            '--no-interaction',
        ], candidateRoot);
        stage = 'npm-lock-resolution';
        runRequired(run, 'npm', [
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--save-dev',
            '--save-exact',
            ...npmPairs,
        ], candidateRoot);

        stage = 'dependency-audit';
        const composerAudit = normalizeComposerAudit(run(
            'composer',
            ['audit', '--locked', '--format=json'],
            {...COMMAND_OPTIONS, cwd: candidateRoot}
        ));
        const npmAudit = normalizeNpmAudit(run(
            'npm',
            ['audit', '--package-lock-only', '--json'],
            {...COMMAND_OPTIONS, cwd: candidateRoot}
        ));
        const audit = combinedTotals(composerAudit, npmAudit);
        if (Object.values(audit).some((total) => total !== 0)) {
            recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
            workspace = null;
            return {
                status: 'NO-GO',
                checks: [{id: 'candidate-audit', status: 'FAIL', message: 'advisories found'}],
                data: {reason: 'advisory'},
            };
        }

        const candidate = {};
        let diff = '';
        stage = 'candidate-validation';
        for (const name of CONSUMER_FILES) {
            const candidatePath = path.join(candidateRoot, name);
            if (!fs.existsSync(candidatePath) || fs.lstatSync(candidatePath).isSymbolicLink()) {
                throw new Error('candidate manifest or lock is missing');
            }
            candidate[name] = digestFile(candidatePath);
            const originalPath = original[name] === 'absent'
                ? '/dev/null'
                : path.join(originalRoot, name);
            stage = 'candidate-diff';
            const diffResult = run('git', ['diff', '--no-index', '--', originalPath, candidatePath], {
                ...COMMAND_OPTIONS,
                cwd: workspace.root,
            });
            if (diffResult.error || ![0, 1].includes(diffResult.status)) {
                throw new Error('candidate diff failed');
            }
            diff += diffResult.stdout;
            stage = 'candidate-validation';
        }
        const plan = {
            schemaVersion: 1,
            adapter: contract.package,
            projectRoot: canonicalProject,
            original,
            candidate,
            audit,
            browserTargets: [...contract.browserTargets],
        };
        const planPath = path.join(workspace.root, 'candidate-plan.json');
        stage = 'plan-write';
        fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, {flag: 'wx', mode: 0o600});
        fs.chmodSync(planPath, 0o600);
        return {
            status: 'GO',
            checks: [{id: 'candidate-audit', status: 'PASS', message: 'zero advisories'}],
            data: {planPath, diff},
        };
    } catch {
        if (workspace) {
            recoverWorkspace({projectRoot: canonicalProject, adapter: contract.package});
        }
        return {
            status: 'NO-GO',
            checks: [{id: 'candidate-resolution', status: 'FAIL', message: 'candidate resolution failed'}],
            data: {reason: 'tool failure', stage},
        };
    }
}

module.exports = {
    applyCandidate,
    installBootstrapDependencies,
    installLockedGraph,
    resolveCandidate,
    verifyInstalledGraph,
    verifyInstalledProject,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
