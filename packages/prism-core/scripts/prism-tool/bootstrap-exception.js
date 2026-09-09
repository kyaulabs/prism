// $KYAULabs: bootstrap-exception.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

function parseBootstrapApproval(args) {
    const flags = ['--branch', '--head-sha', '--base-sha', '--criteria-commit', '--criteria-path'];
    if (args.length !== 11 || args[0] !== '--approval=yes' ||
        flags.some((flag, index) => args[index * 2 + 1] !== flag)) return null;
    const [, , branch, , headSha, , baseSha, , criteriaCommit, , criteriaPath] = args;
    if (!/^(?:feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)\/[A-Za-z0-9._-]+$/.test(branch) ||
        [headSha, baseSha, criteriaCommit].some(sha => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) ||
        !/^docs\/specs\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.md$/.test(criteriaPath)) return null;
    return {branch, headSha, baseSha, criteriaCommit, criteriaPath};
}

function validLocalProof(proof, approval, context) {
    const {CORE_GATE_IDS} = require('../prism-review/core-quality');
    const {discoverOptionalAdapter} = require('./discovery');
    const expected = {branch: approval.branch, baseRef: 'origin/develop', baseSha: approval.baseSha, headSha: approval.headSha};
    if (!proof || proof.schemaVersion !== 1 || proof.kind !== 'LOCAL_BOOTSTRAP_CHECKS' ||
        JSON.stringify(proof.identity) !== JSON.stringify(expected)) return false;
    const passes = (report, ids) => report?.status === 'PASS' && Array.isArray(report.gates) &&
        report.gates.length === ids.length && report.gates.every((gate, index) =>
            gate.id === ids[index] && ['PASS', 'SKIPPED'].includes(gate.status));
    if (!passes(proof.core, CORE_GATE_IDS)) return false;
    const registration = discoverOptionalAdapter({projectRoot: context.projectRoot});
    return registration === null ? proof.adapter === null :
        passes(proof.adapter, registration.contract.qualityProvider.gates);
}

async function bootstrapChecks(args, context) {
    const approval = parseBootstrapApproval(args);
    if (approval === null) return 2;
    const {runBounded} = require('./process');
    const {runCoreQuality, createQualityCallbacks} = require('../prism-review/core-quality');
    const {discoverOptionalAdapter, loadQualityProviderHandler} = require('./discovery');
    const {validateQualityReport} = require('../prism-review/quality-provider');
    const projectRoot = context.cwd ?? process.cwd();
    const identity = {branch: approval.branch, baseRef: 'origin/develop', baseSha: approval.baseSha, headSha: approval.headSha};
    const git = argv => {
        const result = (context.run ?? runBounded)('git', argv, {cwd: projectRoot,
            env: context.env ?? process.env, maxBuffer: 1048576, timeout: 30000});
        if (result.error || result.status !== 0) throw new Error('snapshot unavailable');
        return String(result.stdout);
    };
    const verifySnapshot = () => git(['symbolic-ref', '--quiet', '--short', 'HEAD']).trim() === identity.branch &&
        git(['rev-parse', 'HEAD']).trim() === identity.headSha &&
        git(['rev-parse', 'origin/develop^{commit}']).trim() === identity.baseSha &&
        git(['status', '--porcelain=v1', '-z', '--untracked-files=all']) === '' &&
        git(['merge-base', '--is-ancestor', identity.baseSha, identity.headSha]) === '';
    try {
        if (!verifySnapshot()) throw new Error('snapshot changed');
        const execution = {...context, projectRoot, verifySnapshot};
        const core = await runCoreQuality(identity, execution);
        const registration = discoverOptionalAdapter({projectRoot});
        let adapter = null;
        if (registration !== null) {
            const handler = loadQualityProviderHandler(registration);
            adapter = validateQualityReport(await handler.runQualityProvider({
                projectRoot, baseSha: identity.baseSha, headSha: identity.headSha,
                ...createQualityCallbacks(identity, {...execution, registration}),
            }), {...registration.contract.qualityProvider,
                packageName: registration.packageName, packageVersion: registration.packageVersion});
        }
        const proof = {schemaVersion: 1, kind: 'LOCAL_BOOTSTRAP_CHECKS', identity, core, adapter};
        if (!verifySnapshot() || !validLocalProof(proof, approval, {projectRoot})) {
            process.stderr.write('Bootstrap local checks failed; no exception accepted.\n');
            return 4;
        }
        process.stdout.write(`${JSON.stringify(proof)}\n`);
        return 0;
    } catch {
        process.stderr.write('Bootstrap local checks failed or revision changed; no exception accepted.\n');
        return 4;
    }
}

module.exports = {parseBootstrapApproval, validLocalProof, bootstrapChecks};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
