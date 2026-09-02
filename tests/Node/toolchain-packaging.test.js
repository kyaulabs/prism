// $KYAULabs: toolchain-packaging.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {writeExecutable, writeJson} = require('./helpers');

const root = path.resolve(__dirname, '../..');
const CORE_PKG = path.join(root, 'packages/prism-core');
const ADAPTER_PKG = path.join(root, 'packages/prism-php-web');
const FAKE_BIN = path.join(root, 'tests/Shell/fixtures/bin');
const REVIEW_SKILLS = [
    'prism-review-session',
    'prism-review-tooling-style',
    'prism-review-structural-smells',
    'prism-review-requirement-coverage',
    'prism-review-static-security',
    'prism-review-verifier',
    'prism-review-readability',
    'prism-review-duplication',
    'prism-review-error-handling',
    'prism-review-authorization',
    'prism-review-input-validation',
    'prism-review-differential',
    'prism-review-spec-compliance',
    'prism-review-false-positive-check',
];

function packPackage(packagePath) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pack-'));
    const output = execFileSync('npm', [
        'pack', packagePath, '--json', '--ignore-scripts', '--pack-destination', dir,
    ], {encoding: 'utf8'});
    const parsed = JSON.parse(output);
    const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
    const tarball = path.join(dir, entry.filename);
    const files = new Map(entry.files.map((file) => [file.path, file.mode]));
    const listing = execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8'})
        .split('\n').filter(Boolean);
    return {dir, files, listing, tarball};
}

function tarPaths(packagePath, prefix) {
    return packagePath.listing
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => entry.slice(prefix.length));
}

function extractTarball(tarball, destination) {
    fs.mkdirSync(destination, {recursive: true});
    execFileSync('tar', ['-xzf', tarball, '-C', destination, '--strip-components=1']);
    return destination;
}

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function fakeExternalRun(invocations) {
    return (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd});
        const name = path.basename(command);
        if (name === 'semgrep') {
            return {status: 0, stdout: '1.173.0', stderr: '', error: undefined};
        }
        if (name === 'ocr') {
            return {status: 0, stdout: 'open-code-review v1.9.1 linux/amd64', stderr: '', error: undefined};
        }
        if (command === 'php') {
            return {status: 0, stdout: '{"version":"8.5.0","sockets":true}', stderr: '', error: undefined};
        }
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };
}

test('declares the bounded review executable and Pi SDK peer', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(CORE_PKG, 'package.json'), 'utf8'));

    assert.deepEqual(manifest.bin, {
        'prism-review': 'scripts/prism-review.js',
        'prism-tool': 'scripts/prism-tool.js',
    });
    assert.equal(
        manifest.peerDependencies['@earendil-works/pi-coding-agent'],
        '>=0.84.1 <0.85.0'
    );
});

test('keeps review private state ignored with only its work directory recursively removable', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const safeDirs = JSON.parse(fs.readFileSync(path.join(CORE_PKG, 'safe-dirs.json'), 'utf8'));

    assert.match(gitignore, /^\.pi\/prism-review\/$/m);
    assert.equal(safeDirs.safe_rm_dirs.includes('.pi/prism-review/work'), true);
    assert.equal(safeDirs.safe_rm_dirs.includes('.pi/prism-review'), false);
});

test('packs the core package with every owned resource and executable modes', () => {
    const packed = packPackage(CORE_PKG);
    assert.equal(packed.files.has('toolchain.json'), true);
    assert.equal(packed.files.has('config/commitlint.config.cjs'), true);
    assert.equal(
        packed.files.has('config/markdownlint-cli2.json'),
        true,
        'packaged Markdown policy present'
    );
    assert.equal(packed.files.has('config/release.yml'), true, 'canonical release workflow packaged');
    assert.equal(
        packed.files.has('config/automation/back-merge.yml'),
        true,
        'canonical back-merge workflow packaged'
    );
    assert.equal(
        packed.files.has('config/adapter-catalogue-trust.json'),
        true,
        'adapter catalogue trust root packaged'
    );
    assert.equal(packed.files.has('config/bootstrap/licenses/AGPL-3.0-only.txt'), true);
    assert.equal(packed.files.has('config/bootstrap/licenses/MIT.txt'), true);
    assert.equal(packed.files.has('config/bootstrap/community/contributor-covenant-2.1.md'), true);
    assert.equal(
        packed.files.has('config/bootstrap/release/cliff.toml'),
        true,
        'release-management cliff template packaged'
    );
    for (const hook of ['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg']) {
        const hookPath = `config/bootstrap/hooks/${hook}`;
        assert.equal(packed.files.has(hookPath), true, `${hook} bootstrap hook packaged`);
        assert.notEqual(packed.files.get(hookPath) & 0o111, 0, `${hook} bootstrap hook is executable`);
    }
    assert.equal(
        packed.files.has('scripts/prism-tool/package-release.js'),
        true,
        'package-release launcher module packaged'
    );
    const releaseWorkflow = execFileSync('tar', ['-xOzf', packed.tarball, 'package/config/release.yml'], {
        encoding: 'utf8',
    });
    assert.match(releaseWorkflow, /^# prism-managed: @kyaulabs\/prism-core$/m);
    assert.match(releaseWorkflow, /^# prism-release-schema: 3$/m);
    assert.doesNotMatch(releaseWorkflow, /back-merge|--base develop --head main/);
    assert.equal(
        releaseWorkflow,
        fs.readFileSync(path.join(CORE_PKG, 'config', 'release.yml'), 'utf8'),
        'packaged canonical workflow bytes remain exact'
    );
    assert.equal(packed.files.has('safe-dirs.json'), true);
    assert.equal(packed.files.has('AGENTS.md'), true);
    assert.equal(packed.files.has('APPEND_SYSTEM.md'), true);
    assert.equal(packed.files.has('skills/distill/SKILL.md'), true, 'Distill skill packaged');
    assert.equal(
        packed.files.has('skills/distill/references/patterns.md'),
        true,
        'Distill pattern reference packaged'
    );
    assert.equal(packed.files.has('config/prism-review.json'), true, 'Core review profile packaged');
    for (const skill of REVIEW_SKILLS) {
        assert.equal(packed.files.has(`skills/${skill}/SKILL.md`), true, `${skill} packaged`);
    }
    for (const [license, opening, minimumBytes] of [
        ['CC0-1.0.txt', 'CC0 1.0 Universal', 6000],
        ['CC-BY-SA-4.0.txt', 'Attribution-ShareAlike 4.0 International', 18000],
    ]) {
        const archivePath = `package/config/licenses/${license}`;
        assert.equal(packed.files.has(`config/licenses/${license}`), true, `${license} packaged`);
        const text = execFileSync('tar', ['-xOzf', packed.tarball, archivePath], {encoding: 'utf8'});
        assert.match(text, new RegExp(opening));
        assert.equal(Buffer.byteLength(text) >= minimumBytes, true, `${license} is complete`);
        assert.equal(text, fs.readFileSync(path.join(CORE_PKG, 'config', 'licenses', license), 'utf8'));
    }
    assert.equal(packed.files.has('NOTICE'), true, 'core NOTICE packaged');
    assert.equal(
        packed.files.has('docs/adapter-catalogue.md'),
        true,
        'adapter catalogue publisher contract packaged'
    );
    assert.equal(
        packed.files.has('docs/catalogue-publication-provisioning.md'),
        true,
        'catalogue publication provisioning runbook packaged'
    );
    const coreNotice = execFileSync('tar', ['-xOzf', packed.tarball, 'package/NOTICE'], {
        encoding: 'utf8',
    });
    assert.match(coreNotice, /https:\/\/github\.com\/cursor\/plugins\/tree\/main\/pstack/);
    assert.match(coreNotice, /Copyright \(c\) 2026 Lauren Tan/);
    assert.match(coreNotice, /License: MIT/);
    assert.match(coreNotice, /packages\/prism-core\/skills\/distill\/SKILL\.md/);
    assert.match(coreNotice, /JeremyMorgan\/code-review-skills/);
    assert.match(coreNotice, /trailofbits\/skills/);
    assert.match(coreNotice, /dcb6f83d241ea45c2bd55ebb0e6adffa685a2cdfc714375956a65d90a98fe724/);
    assert.match(coreNotice, /129223b79b8cb1e7c289c90cbe4ba288d9b210e318a0d1464f319e30329481b3/);
    for (const skill of REVIEW_SKILLS.slice(6)) {
        assert.match(coreNotice, new RegExp(`skills/${skill}/SKILL\\.md`));
    }
    assert.notEqual(packed.files.get('scripts/prism-review.js') & 0o111, 0, 'review bin is executable');
    assert.notEqual(packed.files.get('scripts/prism-tool.js') & 0o111, 0, 'tool bin is executable');
    assert.notEqual(packed.files.get('scripts/install-global.sh') & 0o111, 0, 'installer is executable');
    assert.notEqual(packed.files.get('scripts/install-hooks.sh') & 0o111, 0, 'hook installer is executable');
    assert.equal(packed.files.get('toolchain.json') & 0o111, 0, 'contract is not executable');
    assert.equal(packed.files.get('safe-dirs.json') & 0o111, 0, 'safe data is not executable');
    for (const module of [
        'adapter-catalogue-cache', 'adapter-catalogue-http', 'adapter-catalogue-validation',
        'automation', 'automation-providers', 'bootstrap-adapter', 'bootstrap-capabilities', 'bootstrap-composer', 'bootstrap-hooks',
        'bootstrap-journal', 'bootstrap-metadata', 'bootstrap-plan',
        'bootstrap-profile-providers', 'bootstrap-providers', 'bootstrap-release-provider',
        'bootstrap-source',
        'bootstrap-repository', 'bootstrap-seed', 'bootstrap-transaction',
        'catalogue-publication-readiness', 'cli', 'code-review', 'commit', 'core-toolchain', 'hook',
        'consent', 'contract', 'discovery', 'managed-record', 'markdown',
        'preflight', 'process', 'review-chain', 'setup-entry', 'setup-route',
        'web-access-browser', 'web-access-config',
        'supported-adapters', 'template-source', 'template-source-http',
        'template-source-validation',
    ]) {
        assert.equal(packed.files.has(`scripts/prism-tool/${module}.js`), true, module);
    }
    for (const module of ['commit-create-guard.ts', 'fatal-commit-latch.ts']) {
        assert.equal(packed.files.has(`extensions/safety/${module}`), true, module);
    }
    for (const resource of [
        'README.md', 'authorization.ts', 'browser.ts', 'cdp.ts', 'config.ts',
        'duckduckgo.ts', 'errors.ts', 'extract.ts', 'fetch.ts', 'http.ts', 'index.ts',
        'network.ts', 'router.ts', 'search-filters.ts', 'search-types.ts', 'searxng.ts',
    ]) {
        assert.equal(
            packed.files.has(`extensions/web-access/${resource}`),
            true,
            `web-access ${resource}`
        );
    }
    assert.equal(tarPaths(packed, 'package/prompts/').length >= 15, true, 'prompts present');
    assert.equal(tarPaths(packed, 'package/skills/').filter((p) => p.endsWith('SKILL.md')).length >= 35, true, 'skills present');
    for (const removed of [
        'package/skills/websearch/SKILL.md',
        'package/skills/websearch/search.sh',
        'package/skills/searxng/SKILL.md',
        'package/skills/searxng/search.sh',
        'package/skills/lib/search_common.sh',
    ]) {
        assert.equal(packed.listing.includes(removed), false, `${removed} removed`);
    }
    assert.equal(tarPaths(packed, 'package/extensions/safety/').length >= 6, true, 'safety extension data present');
    assert.equal(packed.files.has('scripts/check-commit-workflows.js'), true, 'commit drift checker packaged');
    assert.equal(tarPaths(packed, 'package/scripts/prism-tool/').length >= 6, true, 'tool CLI modules packaged');
    assert.equal(
        packed.files.has('scripts/sensitive-path-policy.js'),
        true,
        'shared sensitive-path policy packaged'
    );
    for (const module of [
        'canonical-json', 'cli', 'constants', 'errors', 'findings', 'git-snapshot',
        'orchestrator', 'profile', 'schema', 'session-runner', 'snapshot-tools', 'trust',
    ]) {
        assert.equal(
            packed.files.has(`scripts/prism-review/${module}.js`),
            true,
            `review ${module} module packaged`
        );
    }
});

test('documents reviewed adapter release authority and publisher ownership', () => {
    const catalogueDocs = fs.readFileSync(
        path.join(CORE_PKG, 'docs', 'adapter-catalogue.md'),
        'utf8'
    );

    assert.match(catalogueDocs, /adapter release declaration.*compatibility authority/is);
    assert.match(catalogueDocs, /package name.*version.*derived.*manifest/is);
    assert.match(catalogueDocs, /publisher.*independently revalidates/is);
    assert.match(catalogueDocs, /protected.*Actions.*signing/is);
    assert.match(catalogueDocs, /human-merged.*pull request/is);
    assert.doesNotMatch(catalogueDocs, /production private signing key.*human-owned/is);
});

test('documents human-only bot-owned catalogue publication provisioning', () => {
    const runbook = fs.readFileSync(
        path.join(CORE_PKG, 'docs', 'catalogue-publication-provisioning.md'),
        'utf8'
    );
    const catalogueDocs = fs.readFileSync(
        path.join(CORE_PKG, 'docs', 'adapter-catalogue.md'),
        'utf8'
    );

    assert.match(catalogueDocs, /catalogue-publication-provisioning[.]md/);
    assert.match(runbook, /kyaulabs-bot/);
    assert.match(runbook, /fine-grained personal access token/i);
    assert.match(runbook, /CATALOGUE_DISPATCH_TOKEN/);
    assert.match(runbook, /CATALOGUE_PUBLICATION_TOKEN/);
    assert.match(runbook, /CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY/);
    assert.match(runbook, /CATALOGUE_COMMIT_SIGNING_PASSPHRASE/);
    assert.match(runbook, /"schemaVersion": 3/);
    assert.match(runbook, /"type": "OPENPGP"/);
    assert.match(runbook, /kyaulabs-bot <actions@kyaulabs[.]com>/);
    assert.match(runbook, /privateMaterialOutsideRepositoriesReviewed/);
    assert.match(runbook, /offlineRecoveryCustodyReviewed/);
    assert.match(runbook, /separatedFromCatalogueSigningReviewed/);
    assert.match(runbook, /separatedFromPublicationCredentialReviewed/);
    assert.match(runbook, /publication commit-signing custody is attested/);
    assert.match(runbook, /commit-signing.*suspected exposure/is);
    assert.match(runbook, /commit-signing.*succession/is);
    assert.match(runbook, /Actions: write/);
    assert.match(runbook, /Contents: write/);
    assert.match(runbook, /Pull requests: write/);
    assert.match(runbook, /catalogue-dispatch/);
    assert.match(runbook, /catalogue-signing/);
    assert.match(runbook, /NONE_ACCEPTED/);
    assert.match(runbook, /non-expiring/i);
    assert.match(runbook, /no planned rotation/i);
    assert.match(runbook, /CATALOGUE_SIGNING_ENABLED/);
    assert.match(runbook, /pre-activation/);
    assert.match(runbook, /--phase=active/);
    assert.match(runbook, /suspected exposure/i);
    assert.match(runbook, /succession/i);
    assert.match(runbook, /issue #469/i);
    assert.doesNotMatch(
        runbook,
        /github_pat_[A-Za-z0-9_]+|gh secret set|echo .*TOKEN|BEGIN (?:RSA |ENCRYPTED )?PRIVATE KEY|[.]env/,
    );
});

test('documents Blank Core-only application and recovery boundaries', () => {
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');

    assert.match(coreReadme, /PLAN_READY.*PREPARED/s);
    assert.match(coreReadme, /APPLYING.*PROJECT_DURABLE/s);
    assert.match(coreReadme, /ROOT_RESTORED|RECOVERY_REQUIRED/);
    assert.match(coreReadme, /REPOSITORY_BOOTSTRAP/);
    assert.match(coreReadme, /does not initialize Git/i);
    assert.match(coreReadme, /does not.*network/is);
});

test('documents provider-composed Blank and Template PHP web bootstrap boundaries', () => {
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');
    const adapterReadme = fs.readFileSync(path.join(ADAPTER_PKG, 'README.md'), 'utf8');

    assert.match(coreReadme, /Provider-composed Blank and Template projects/i);
    assert.match(coreReadme, /strict-empty setup.*select.*PHP\/web/is);
    assert.match(coreReadme, /immutable, untrusted catalogue evidence/i);
    assert.match(coreReadme, /durable project\s+bytes.*trusted installed Core and adapter providers/is);
    assert.match(coreReadme, /digest-bound.*plan.*journal.*project manifest.*root-seed attestation/is);
    assert.match(coreReadme, /generic\s+provider reports/i);
    assert.match(coreReadme, /stack-agnostic/i);
    assert.match(coreReadme, /before.*durable.*strict\s+emptiness/is);
    assert.match(coreReadme, /after.*durable.*resume\s+evidence/is);
    assert.match(coreReadme, /apply\.recovery\.lock.*confirming no setup process.*remove only/is);
    assert.match(coreReadme, /no remote.*publication.*push/is);
    assert.match(adapterReadme, /Blank and Template project bootstrap/i);
    assert.match(adapterReadme, /same generic.*preparation.*provider report.*quality contracts/is);
    assert.match(adapterReadme, /byte-identical trusted scaffold content/is);
    assert.match(adapterReadme, /application-free.*testing-ready scaffold/is);
    assert.match(adapterReadme, /lifecycle scripts.*disabled/is);
    assert.match(adapterReadme, /every advisory blocks/i);
    assert.match(adapterReadme, /only.*Chromium/is);
    assert.match(adapterReadme, /adapter activation.*report digest/is);
    assert.match(adapterReadme, /inspect.*resolve.*apply.*verify/is);
});

test('documents every optional project capability and its owned outputs', () => {
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');

    assert.match(coreReadme, /Optional project capabilities/i);
    for (const capability of [
        'licensing', 'community-governance', 'github-collaboration',
        'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
        'release-management',
    ]) {
        assert.equal(coreReadme.includes(`\`${capability}\``), true, capability);
    }
    for (const output of [
        'LICENSE', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        '.github/ISSUE_TEMPLATE/feature_request.yml',
        '.github/pull_request_template.md',
        'SECURITY.md', '.github/CODEOWNERS',
        '.github/ISSUE_TEMPLATE/config.yml', '.github/FUNDING.yml',
        'CHANGELOG.md', 'cliff.toml', '.github/workflows/release.yml',
        '.prism/release.json',
    ]) {
        assert.equal(coreReadme.includes(`\`${output}\``), true, output);
    }
    assert.match(coreReadme, /independent and disabled by default/i);
    assert.match(coreReadme, /current-development.*latest-release.*latest-major-line.*custom/is);
    assert.match(coreReadme, /acknowledgement.*1.*8760/is);
    assert.match(coreReadme, /CODEOWNERS.*default.*\*/is);
    assert.match(coreReadme, /Support.*Get help with this project/is);
    assert.match(coreReadme, /blank_issues_enabled.*false.*github-collaboration/is);
    assert.match(coreReadme, /funding.*15.*github.*custom.*four.*other.*one/is);
    assert.match(coreReadme, /identity preview.*required fields.*publication targets/is);
    assert.match(coreReadme, /Template manifests may\s+advertise.*never select/is);
    assert.match(coreReadme, /Blank performs no Template\s+lookup/i);
    assert.match(coreReadme, /owner\/repository.*live GitHub lookup.*no\s+initial version/is);
    assert.match(coreReadme, /publishable root.*declared-workspace npm\s+package/is);
    assert.match(coreReadme, /Core-only.*no npm package.*PHP\/web.*private-only/is);
    assert.match(coreReadme, /creates no repository.*remote.*tag.*GitHub Release.*push.*npm\s+publication/is);
    assert.doesNotMatch(coreReadme, /deferred to task 12/i);
});

test('publishes the complete strict-empty setup orchestration contract', () => {
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');
    const adapterReadme = fs.readFileSync(path.join(ADAPTER_PKG, 'README.md'), 'utf8');
    const publicReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const harnessDocs = fs.readFileSync(path.join(root, 'CODING_HARNESS.md'), 'utf8');
    const combined = [coreReadme, adapterReadme, publicReadme, harnessDocs].join('\n');

    assert.match(coreReadme, /Template.*Blank.*Cancel/is);
    assert.match(coreReadme, /Core-only.*PHP\/web/is);
    assert.match(coreReadme, /capabilit(?:y|ies).*disabled by default/is);
    assert.match(coreReadme, /identity preview.*complete project plan/is);
    assert.match(coreReadme, /pre-durable.*strict emptiness.*post-durable.*retained/is);
    assert.match(coreReadme, /separate hook approval.*signed root seed/is);
    assert.match(coreReadme, /established projects.*existing.*setup/is);
    assert.match(adapterReadme, /selection.*installation authorization/is);
    assert.match(adapterReadme, /separate hook approval.*signed root seed/is);
    assert.match(publicReadme, /strict-empty.*\/setup.*Template.*Blank.*Cancel/is);
    assert.match(harnessDocs, /strict-empty.*\/setup.*established-project/is);
    assert.match(combined, /hosted repository.*remote.*push `develop`.*rulesets/is);
    assert.doesNotMatch(combined, /deferred to task 12/i);
});

test('documents human npm publication for managed lockstep package releases', () => {
    const npmDocs = fs.readFileSync(path.join(root, 'NPM.md'), 'utf8');
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');

    assert.match(npmDocs, /lockstep/i);
    assert.match(npmDocs, /GitHub Release first/);
    assert.match(npmDocs, /one human-run publication command per configured/);
    assert.doesNotMatch(npmDocs, /NPM_AUTOMATION_TOKEN/);
    assert.doesNotMatch(npmDocs, /packages? versions? independently|each package versions independently/i);
    assert.match(coreReadme, /Managed lockstep npm releases/);
    assert.match(coreReadme, /displays the exact package list/);
    assert.match(coreReadme, /explicit enablement and displayed-diff mutation approval/);
});

test('documents bounded diff-causal review chains', () => {
    const coreReadme = fs.readFileSync(path.join(CORE_PKG, 'README.md'), 'utf8');
    const publicReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const harnessDocs = fs.readFileSync(path.join(root, 'CODING_HARNESS.md'), 'utf8');
    const agents = fs.readFileSync(path.join(CORE_PKG, 'AGENTS.md'), 'utf8');
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

    assert.match(coreReadme, /review chain/i);
    assert.match(coreReadme, /repair delta/i);
    assert.match(coreReadme, /Advisory findings do not block/i);
    assert.match(coreReadme, /all four axes/i);
    assert.match(coreReadme, /base or history changes/i);
    assert.doesNotMatch(coreReadme, /--force-review|automatic waiver/i);
    for (const document of [coreReadme, publicReadme, harnessDocs, agents]) {
        assert.match(document, /standalone `?\/pr`?.*one complete initial review.*absent/is);
        assert.match(document, /invalid.*review chain.*fail closed/is);
        assert.match(document, /second review.*fresh explicit approval/is);
    }
    assert.match(gitignore, /^\.pi\/prism-tool\/$/m);
});

test('declares one compatible empty-project bootstrap protocol in the adapter package', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ADAPTER_PKG, 'package.json'), 'utf8'));
    const handler = require(path.join(ADAPTER_PKG, 'scripts', 'prism-tool-adapter.js'));

    assert.equal(manifest.prism.bootstrapProtocol, 1);
    assert.equal(handler.bootstrapProtocol, manifest.prism.bootstrapProtocol);
});

test('packs the adapter with contract, handler, modules, prompts, skills, and safe data', () => {
    const packed = packPackage(ADAPTER_PKG);
    const manifest = JSON.parse(fs.readFileSync(path.join(ADAPTER_PKG, 'package.json'), 'utf8'));
    assert.equal(manifest.prism.review, './config/prism-review.json');
    assert.equal(packed.files.has('toolchain.json'), true);
    assert.equal(packed.files.has('config/prism-review.json'), true, 'adapter review profile packaged');
    assert.equal(packed.files.has('safe-dirs.json'), true);
    assert.notEqual(packed.files.get('scripts/prism-tool-adapter.js') & 0o111, 0, 'handler is executable');
    for (const module of [
        'audit', 'automation-provider', 'bootstrap-scaffold', 'project', 'transaction',
        'visual-review-files', 'workspace',
    ]) {
        assert.equal(packed.files.has(`scripts/toolchain/${module}.js`), true, module);
    }
    assert.equal(packed.files.has('config/bootstrap/scaffold.json'), true, 'bootstrap scaffold manifest packaged');
    for (const visualReviewResource of [
        'config/bootstrap/visual-review/visual_review.mjs',
        'config/bootstrap/visual-review/visual_review.spec.mjs',
        'config/bootstrap/visual-review/visual_review.example.json',
        'skills/visual-review/SKILL.md',
        'docs/visual-review.md',
    ]) {
        assert.equal(
            packed.files.has(visualReviewResource),
            true,
            `${visualReviewResource} packaged`
        );
    }
    assert.equal(tarPaths(packed, 'package/prompts/').length >= 3, true, 'prompts present');
    assert.equal(tarPaths(packed, 'package/skills/').filter((p) => p.endsWith('SKILL.md')).length >= 10, true, 'skills present');
    assert.equal(
        tarPaths(packed, 'package/skills/').some((entry) => entry.startsWith('prism-review-php-web-')),
        false,
        'adapter does not duplicate review skills'
    );
    assert.equal(tarPaths(packed, 'package/docs/').length >= 4, true, 'docs present');
});

test('tracks executable modes in the git index for the CLI, handler, and installers', () => {
    const entries = [
        'packages/prism-core/scripts/prism-review.js',
        'packages/prism-core/scripts/prism-tool.js',
        'packages/prism-core/scripts/install-global.sh',
        'packages/prism-core/scripts/install-hooks.sh',
        'packages/prism-php-web/scripts/prism-tool-adapter.js',
    ];
    const listing = execFileSync('git', ['ls-files', '-s', ...entries], {cwd: root, encoding: 'utf8'});
    const modes = new Map(listing.split('\n').filter(Boolean).map((line) => {
        const parts = line.split(/\s+/);
        return [parts[3], parts[0]];
    }));
    for (const entry of entries) {
        assert.equal(modes.get(entry), '100755', `${entry} is 100755 in the git index`);
    }
});

test('resolves a bundled core tool from an unrelated working directory', (t) => {
    const packed = packPackage(CORE_PKG);
    t.after(() => fs.rmSync(packed.dir, {recursive: true, force: true}));
    const coreRoot = extractTarball(packed.tarball, path.join(packed.dir, 'core'));
    const fakePackage = path.join(coreRoot, 'node_modules', 'git-cliff');
    writeJson(path.join(fakePackage, 'package.json'), {
        name: 'git-cliff',
        version: '2.13.1',
        bin: {'git-cliff': 'bin/git-cliff.js'},
    });
    writeExecutable(path.join(fakePackage, 'bin', 'git-cliff.js'), '#!/usr/bin/env node\nprocess.exit(0);');

    const invocations = [];
    const unrelated = path.join(packed.dir, 'unrelated-cwd');
    fs.mkdirSync(unrelated, {recursive: true});
    const result = captureWrites(() => main(['run', 'git-cliff', '--', '--version'], {
        coreRoot,
        cwd: unrelated,
        env: {PATH: FAKE_BIN},
        input: '',
        run: fakeExternalRun(invocations),
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const cliffRun = invocations.find(({command}) => command.endsWith('git-cliff.js'));
    assert.ok(cliffRun, 'git-cliff was invoked through the bundled resolver');
    assert.equal(cliffRun.command, fs.realpathSync(path.join(fakePackage, 'bin', 'git-cliff.js')));
    assert.deepEqual(cliffRun.args, ['--version']);
    assert.notEqual(cliffRun.cwd, coreRoot);
});

test('discovers the managed adapter from an unrelated project and inspects it', (t) => {
    const corePacked = packPackage(CORE_PKG);
    const adapterPacked = packPackage(ADAPTER_PKG);
    t.after(() => fs.rmSync(corePacked.dir, {recursive: true, force: true}));
    t.after(() => fs.rmSync(adapterPacked.dir, {recursive: true, force: true}));
    const coreRoot = extractTarball(corePacked.tarball, path.join(corePacked.dir, 'core'));
    const adapterRoot = extractTarball(adapterPacked.tarball, path.join(adapterPacked.dir, 'adapter'));

    const projectRoot = path.join(adapterPacked.dir, 'consumer-project');
    fs.mkdirSync(path.join(projectRoot, '.pi', 'npm', 'node_modules', '@kyaulabs'), {recursive: true});
    writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
        dependencies: {'@kyaulabs/prism-php-web': '0.1.0'},
    });
    fs.cpSync(adapterRoot, path.join(projectRoot, '.pi', 'npm', 'node_modules', '@kyaulabs', 'prism-php-web'), {recursive: true});

    const invocations = [];
    const result = captureWrites(() => main(['setup', 'inspect', '--json'], {
        projectRoot,
        coreRoot,
        env: {PATH: FAKE_BIN},
        input: '',
        run: fakeExternalRun(invocations),
    }));

    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, 'setup inspect');
    assert.equal(report.adapter, '@kyaulabs/prism-php-web');
    assert.equal(report.data.phpVersion, '8.5.0');
    assert.equal(report.data.sockets, true);
});

test('discovers the local adapter through Pi settings from an unrelated project', (t) => {
    const corePacked = packPackage(CORE_PKG);
    const adapterPacked = packPackage(ADAPTER_PKG);
    t.after(() => fs.rmSync(corePacked.dir, {recursive: true, force: true}));
    t.after(() => fs.rmSync(adapterPacked.dir, {recursive: true, force: true}));
    const coreRoot = extractTarball(corePacked.tarball, path.join(corePacked.dir, 'core'));
    const adapterRoot = extractTarball(adapterPacked.tarball, path.join(adapterPacked.dir, 'adapter'));

    const projectRoot = path.join(adapterPacked.dir, 'local-project');
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: [path.join(adapterRoot, 'skills')],
    });

    const invocations = [];
    const result = captureWrites(() => main(['setup', 'inspect', '--json'], {
        projectRoot,
        coreRoot,
        env: {PATH: FAKE_BIN},
        input: '',
        run: fakeExternalRun(invocations),
    }));

    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.adapter, '@kyaulabs/prism-php-web');
    assert.equal(report.data.phpVersion, '8.5.0');
});

test('ships the launcher ownership guard so unrelated executables are never replaced', () => {
    const packed = packPackage(CORE_PKG);
    const coreRoot = extractTarball(packed.tarball, path.join(packed.dir, 'core'));
    const installer = fs.readFileSync(path.join(coreRoot, 'scripts', 'install-global.sh'), 'utf8');
    assert.match(installer, /prism-core:managed-launcher begin/);
    assert.match(installer, /launcher_is_managed/);
    assert.match(installer, /refusing to replace an unmanaged launcher/);
    assert.match(installer, /refusing to remove an unmanaged launcher/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
