# Scope-Owned Toolchain Provisioning Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Provision and verify every Prism-owned tool deterministically from arbitrary trusted consumer projects while preserving explicit network, mutation, OCR-connectivity, and OCR-egress consent boundaries.

**Architecture:** The global core ships versioned toolchain contracts plus a narrow CommonJS `prism-tool` CLI. Core tools resolve relative to the core package; project-local adapters register a validated handler that owns ecosystem-specific resolution and transactions. Hooks, prompts, skills, local checks, and a rewritten Pi-native CI workflow invoke the same CLI and fail closed on mandatory Semgrep/OCR readiness.

**Tech Stack:** Node.js 22.19+ CommonJS and `node:test`, Bash 4+, Pi 0.84.1, npm, Composer, PHP 8.5, Pest 5/PHPUnit 13, Semgrep, OCR, GitHub Actions.

**Revision:** Tasks 1 and 2 record the completed exact-version baseline. ADR-0063 revises Semgrep and OCR compatibility; Task 3 migrates the contract schema and readiness implementation to bounded external requirements before later tasks consume them.

## Global constraints

- Core bundled versions: `commitlint@21.2.2`, `@commitlint/config-conventional@21.2.2`, `git-cliff@2.13.1`.
- Mandatory external requirements: Semgrep `>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0`. Prism runtime/setup verifies but never installs or configures them.
- PHP/web Composer versions: `friendsofphp/php-cs-fixer@3.95.18`, `pestphp/pest@5.1.1`, `pestphp/pest-plugin-browser@5.0.1`.
- PHP/web npm versions: `sass@1.102.0`, `uglify-js@3.19.3`, `eslint@10.8.1`, `@eslint/js@10.0.1`, `stylelint@17.14.1`, `stylelint-config-standard-scss@17.0.0`, `playwright@1.62.1`.
- Remove `@stylelint/language-server`; it has no approved owner in this feature.
- Candidate graphs must have zero advisories at every severity before consumer mutation and after installation.
- Registry access, consumer mutation, OCR connectivity, and OCR code egress are four independent approval gates.
- Only literal `yes` authorizes consumer manifest/lockfile application. No other input is coerced.
- `ocr llm test` runs only during global/core setup, `/setup`, `/doctor`, and immediately before `code-review`; other entry points perform executable/version checks only.
- Automated Composer/npm installation uses `--no-scripts` or `--ignore-scripts`. Playwright Chromium installation is an explicit approved command, not a lifecycle script.
- Never read a credential file or emit raw OCR/provider output. Every subprocess has an argument array, timeout, output cap, and sanitized failure.
- No PHP/Pest/Aurora/SCSS/Composer logic enters the core package. Adapter behavior remains project-local.
- Do not edit `aurora/` or generated minified assets.
- Let the pre-commit normalizer add RCS headers/modelines to new `.js` and `.sh` files; do not hand-author provenance fields.
- `CONTEXT.md` defines the Pi-era `toolchain contract`, scope entities, consent boundaries, and ADR-0063's bounded external compatibility policy; implementation must preserve that vocabulary and requires no further domain-context change unless a new term appears.
- Before any dependency resolution during execution, halt for the required network approval. Lockfile updates occur only after approval.

## Threat model

- **Assets:** consumer manifest integrity, lockfile integrity, credential confidentiality, command-execution integrity, and availability of mandatory gates.
- **Untrusted boundaries:** toolchain JSON, Pi settings paths, CLI arguments, package-manager output, advisory text, OCR output, filesystem symlinks, and interrupted transaction state.
- **Abuse cases:** shell injection, adapter path escape, arbitrary module loading, plan-file substitution, stale-candidate replay, secret leakage, output exhaustion, and partial manifest application.
- **Fail-closed controls:** positive schemas, canonical realpaths, active-package metadata checks, fixed operation allowlists, argument arrays, SHA-256 preconditions, ownership markers, per-file atomic rename with rollback before installation, bounded output, and distinct approval flags.

## Locked file structure and interfaces

### Core files

- `packages/prism-core/toolchain.json` — canonical core component declaration.
- `packages/prism-core/config/commitlint.config.cjs` — core-owned commit policy and conventional config resolution.
- `packages/prism-core/scripts/prism-tool.js` — executable CLI entry point only.
- `packages/prism-core/scripts/prism-tool/contract.js` — schema and package-manifest parity.
- `packages/prism-core/scripts/prism-tool/process.js` — bounded argument-array subprocess runner and semantic-version extraction.
- `packages/prism-core/scripts/prism-tool/discovery.js` — core root and active adapter registration discovery.
- `packages/prism-core/scripts/prism-tool/preflight.js` — mandatory external readiness and OCR cadence.
- `packages/prism-core/scripts/prism-tool/cli.js` — argument parsing, status rendering, exit mapping, and command dispatch.

### Adapter files

- `packages/prism-php-web/toolchain.json` — canonical PHP/web consumer-development declaration.
- `packages/prism-php-web/scripts/prism-tool-adapter.js` — stable adapter handler entry point.
- `packages/prism-php-web/scripts/toolchain/project.js` — project/runtime/manifest inspection and tool resolution.
- `packages/prism-php-web/scripts/toolchain/workspace.js` — ownership marker, hashes, copy, diff, cleanup, and interrupted-run recovery.
- `packages/prism-php-web/scripts/toolchain/audit.js` — Composer/npm structured audit normalization.
- `packages/prism-php-web/scripts/toolchain/transaction.js` — candidate resolution, application, deterministic install, browser install, and final verification.

### Public CLI

```text
prism-tool doctor [--json] [--local-only] [--ocr-test-approved=yes]
prism-tool setup inspect [--json]
prism-tool setup resolve --adapter=PACKAGE [--json] --network-approved=yes
prism-tool setup apply --adapter=PACKAGE --plan=PATH [--json] --approval=yes
prism-tool setup verify --adapter=PACKAGE [--json] --network-approved=yes
prism-tool run TOOL_ID [--code-egress-approved=yes] -- ARGUMENTS
```

Control flags are parsed before `--`; everything after `--` remains an inert argument array. `--approval=yes`, `--network-approved=yes`, `--ocr-test-approved=yes`, and `--code-egress-approved=yes` accept exactly `yes`. Exit codes are stable: `0` success, `2` usage/contract/approval failure, `3` mandatory readiness failure, `4` subprocess/tool failure, and `5` dependency advisory or transaction failure.

JSON mode emits exactly:

```json
{
  "schemaVersion": 1,
  "command": "doctor",
  "status": "GO",
  "checks": [
    {"id": "semgrep", "status": "PASS", "expected": ">=1.173.0 <2.0.0", "actual": "1.173.0", "message": "compatible version"}
  ]
}
```

Human mode prints one tab-separated check per line and a final `GO` or `NO-GO`; it never relays raw subprocess output.

### Adapter handler API

```js
module.exports = {
	resolveTool({ component, projectRoot }),
	inspect({ contract, projectRoot, run }),
	resolve({ contract, projectRoot, workspaceRoot, run }),
	apply({ contract, projectRoot, planPath, run }),
	verify({ contract, projectRoot, run })
};
```

Every method returns `{ status, checks, data }`. `resolveTool` returns an absolute canonical executable path inside `vendor/bin` or `node_modules/.bin`; all other paths fail.

### Candidate plan

```json
{
  "schemaVersion": 1,
  "adapter": "@kyaulabs/prism-php-web",
  "projectRoot": "/canonical/consumer",
  "original": {
    "composer.json": "sha256",
    "composer.lock": "sha256-or-absent",
    "package.json": "sha256",
    "package-lock.json": "sha256-or-absent"
  },
  "candidate": {
    "composer.json": "sha256",
    "composer.lock": "sha256",
    "package.json": "sha256",
    "package-lock.json": "sha256"
  },
  "audit": {"critical": 0, "high": 0, "moderate": 0, "low": 0},
  "browserTargets": ["chromium"]
}
```

The literal strings `sha256` and `sha256-or-absent` above describe validated lowercase 64-hex digests or the literal `absent`; implementation tests use concrete digests. The plan contains no executable command strings.

---

### Task 1: Versioned contracts and exact package pins

**Files:**
- Create: `packages/prism-core/toolchain.json`
- Create: `packages/prism-php-web/toolchain.json`
- Create: `packages/prism-core/scripts/prism-tool/contract.js`
- Create: `tests/Node/helpers.js`
- Create: `tests/Node/toolchain-contract.test.js`
- Modify: `packages/prism-core/package.json`
- Modify: `packages/prism-php-web/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/prism-core/scripts/validate-harness.sh`
- Modify: `tests/Shell/validate-harness_test.sh`

**Interfaces:**
- Produces: `loadContract(filePath)`, `validateContract(value, filePath)`, `assertPackageParity(contract, packageJson)`.
- Produces: package metadata keys `prism.toolchain`, `prism.adapter`, and `prism.handler`.
- Consumes: no implementation task output.

- [x] **Step 1: Write the failing contract and parity tests**

Create `tests/Node/helpers.js` with `makeTempDir()`, `writeJson()`, `writeExecutable()`, and `sha256()` helpers using only Node core modules. Create `tests/Node/toolchain-contract.test.js` with these complete observable cases:

```js
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { loadContract, validateContract, assertPackageParity } = require('../../packages/prism-core/scripts/prism-tool/contract');

const root = path.resolve(__dirname, '../..');
const coreContract = path.join(root, 'packages/prism-core/toolchain.json');
const adapterContract = path.join(root, 'packages/prism-php-web/toolchain.json');

test('loads both schema-v1 package contracts', () => {
	assert.equal(loadContract(coreContract).role, 'core');
	assert.equal(loadContract(adapterContract).role, 'adapter');
});

test('rejects an unstructured version range and duplicate component id', () => {
	const invalid = {
		schemaVersion: 1,
		package: '@kyaulabs/example',
		role: 'core',
		components: [
			{id: 'same', kind: 'library', ecosystem: 'npm', package: 'one', version: '^1.0.0', provisioning: 'bundled', authentication: 'none'},
			{id: 'same', kind: 'library', ecosystem: 'npm', package: 'two', version: '1.0.0', provisioning: 'bundled', authentication: 'none'}
		]
	};
	assert.throws(() => validateContract(invalid, 'fixture.json'), /exact version|duplicate component/);
});

test('requires bundled npm components to match exact package dependencies', () => {
	const contract = loadContract(coreContract);
	assert.doesNotThrow(() => assertPackageParity(contract, require('../../packages/prism-core/package.json')));
	assert.throws(
		() => assertPackageParity(contract, {name: '@kyaulabs/prism-core', dependencies: {commitlint: '^21'}}),
		/package dependency drift/
	);
});

test('pins every approved root npm tool exactly and drops the unowned language server', () => {
	const rootPackage = require('../../package.json');
	const expected = {
		'@commitlint/config-conventional': '21.2.2',
		'@eslint/js': '10.0.1',
		commitlint: '21.2.2',
		eslint: '10.8.1',
		'git-cliff': '2.13.1',
		playwright: '1.62.1',
		sass: '1.102.0',
		stylelint: '17.14.1',
		'stylelint-config-standard-scss': '17.0.0',
		'uglify-js': '3.19.3'
	};
	for (const [name, version] of Object.entries(expected)) assert.equal(rootPackage.devDependencies[name], version);
	assert.equal(rootPackage.devDependencies['@stylelint/language-server'], undefined);
});
```

Extend `tests/Shell/validate-harness_test.sh` to require a `Validating toolchain contracts` section and to inject a temporary parity mismatch under a copied package fixture, expecting a named failure.

- [x] **Step 2: Run tests to verify Red**

Run:

```bash
node --test tests/Node/toolchain-contract.test.js
bash tests/Shell/validate-harness_test.sh
```

Expected: Node fails because `contract.js` and both contracts are absent; the shell test fails because harness validation has no contract phase.

- [x] **Step 3: Implement contracts, metadata, pins, and validation**

Use this exact contract shape. Core components are:

```json
{
  "schemaVersion": 1,
  "package": "@kyaulabs/prism-core",
  "role": "core",
  "components": [
    {"id": "commitlint", "kind": "command", "ecosystem": "npm", "package": "commitlint", "version": "21.2.2", "provisioning": "bundled", "authentication": "none", "executable": "commitlint", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "commitlint-config-conventional", "kind": "library", "ecosystem": "npm", "package": "@commitlint/config-conventional", "version": "21.2.2", "provisioning": "bundled", "authentication": "none"},
    {"id": "git-cliff", "kind": "command", "ecosystem": "npm", "package": "git-cliff", "version": "2.13.1", "provisioning": "bundled", "authentication": "none", "executable": "git-cliff", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "semgrep", "kind": "command", "ecosystem": "pypi", "package": "semgrep", "versionRequirement": {"mode": "range", "minimum": "1.173.0", "maximumExclusive": "2.0.0"}, "provisioning": "external", "authentication": "optional", "executable": "semgrep", "versionArguments": ["--version"], "argumentPolicy": {"mode": "first-token", "allowed": ["scan", "ci"]}},
    {"id": "ocr", "kind": "command", "ecosystem": "npm", "package": "@alibaba-group/open-code-review", "versionRequirement": {"mode": "range", "minimum": "1.9.1", "maximumExclusive": "2.0.0"}, "provisioning": "external", "authentication": "required", "executable": "ocr", "versionArguments": ["--version"], "argumentPolicy": {"mode": "first-token", "allowed": ["review", "scan"]}}
  ]
}
```

The adapter contract uses the same fields and these components:

```json
{
  "schemaVersion": 1,
  "package": "@kyaulabs/prism-php-web",
  "role": "adapter",
  "components": [
    {"id": "php-cs-fixer", "kind": "command", "ecosystem": "composer", "package": "friendsofphp/php-cs-fixer", "version": "3.95.18", "provisioning": "consumer-dev", "authentication": "none", "executable": "php-cs-fixer", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "pest", "kind": "command", "ecosystem": "composer", "package": "pestphp/pest", "version": "5.1.1", "provisioning": "consumer-dev", "authentication": "none", "executable": "pest", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "pest-browser", "kind": "library", "ecosystem": "composer", "package": "pestphp/pest-plugin-browser", "version": "5.0.1", "provisioning": "consumer-dev", "authentication": "none"},
    {"id": "sass", "kind": "command", "ecosystem": "npm", "package": "sass", "version": "1.102.0", "provisioning": "consumer-dev", "authentication": "none", "executable": "sass", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "uglify-js", "kind": "command", "ecosystem": "npm", "package": "uglify-js", "version": "3.19.3", "provisioning": "consumer-dev", "authentication": "none", "executable": "uglifyjs", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "eslint", "kind": "command", "ecosystem": "npm", "package": "eslint", "version": "10.8.1", "provisioning": "consumer-dev", "authentication": "none", "executable": "eslint", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "eslint-js", "kind": "library", "ecosystem": "npm", "package": "@eslint/js", "version": "10.0.1", "provisioning": "consumer-dev", "authentication": "none"},
    {"id": "stylelint", "kind": "command", "ecosystem": "npm", "package": "stylelint", "version": "17.14.1", "provisioning": "consumer-dev", "authentication": "none", "executable": "stylelint", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}},
    {"id": "stylelint-config-scss", "kind": "library", "ecosystem": "npm", "package": "stylelint-config-standard-scss", "version": "17.0.0", "provisioning": "consumer-dev", "authentication": "none"},
    {"id": "playwright", "kind": "command", "ecosystem": "npm", "package": "playwright", "version": "1.62.1", "provisioning": "consumer-dev", "authentication": "none", "executable": "playwright", "versionArguments": ["--version"], "argumentPolicy": {"mode": "passthrough"}}
  ],
  "browserTargets": ["chromium"]
}
```

`contract.js` must export the three named functions; reject unknown top-level/component keys, non-object values, unsupported schema/role/kind/ecosystem/provisioning/authentication/policy values, invalid exact semver, absolute handler paths, duplicate IDs, command entries missing executable/version arguments/policy, library entries carrying executable fields, and adapter browser targets other than `chromium`. Exact `version` and structured `versionRequirement` are mutually exclusive. Only the declared external Semgrep and OCR identities may use range mode with stable three-segment `minimum` and `maximumExclusive` values where minimum is lower than the exclusive maximum; bundled and consumer-development entries remain exact. Freeze the returned object recursively.

Set core package metadata and dependencies:

```json
"dependencies": {
  "@commitlint/config-conventional": "21.2.2",
  "commitlint": "21.2.2",
  "git-cliff": "2.13.1"
},
"prism": {"toolchain": "./toolchain.json"}
```

Set adapter metadata:

```json
"prism": {
  "adapter": true,
  "toolchain": "./toolchain.json",
  "handler": "./scripts/prism-tool-adapter.js"
}
```

Add `toolchain.json` to both package files arrays. Update root approved npm pins exactly and remove the language server. After explicit network approval, run `npm install --ignore-scripts` to regenerate `package-lock.json`. Extend `validate-harness.sh` to load every package contract through `contract.js` and run package parity. Task 2 adds the bin/config package entries together with the files they expose, so this task never publishes a dangling path.

- [x] **Step 4: Run tests and audits to verify Green**

Run:

```bash
node --test tests/Node/toolchain-contract.test.js
bash tests/Shell/validate-harness_test.sh
npm audit --audit-level=low
npm pack --dry-run --ignore-scripts ./packages/prism-core
npm pack --dry-run --ignore-scripts ./packages/prism-php-web
```

Expected: all tests pass, audit reports zero advisories, and both dry runs list `toolchain.json`.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json packages/prism-core/package.json packages/prism-core/toolchain.json packages/prism-core/scripts/prism-tool/contract.js packages/prism-php-web/package.json packages/prism-php-web/toolchain.json tests/Node packages/prism-core/scripts/validate-harness.sh tests/Shell/validate-harness_test.sh
git commit -S -m $'feat(toolchain): define package toolchain contracts\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 2: Bundled command execution through `prism-tool`

**Files:**
- Create: `packages/prism-core/scripts/prism-tool.js`
- Create: `packages/prism-core/scripts/prism-tool/process.js`
- Create: `packages/prism-core/scripts/prism-tool/cli.js`
- Create: `packages/prism-core/config/commitlint.config.cjs`
- Create: `tests/Node/prism-tool-run.test.js`
- Modify: `packages/prism-core/package.json`
- Modify: `commitlint.config.js`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `tests/Shell/commit-msg_test.sh`

**Interfaces:**
- Consumes: `loadContract()` from Task 1.
- Produces: `runBounded(command, args, options)`, `extractVersion(output)`, `resolveBundledComponent(coreRoot, component)`, `main(argv, context)`.
- Produces: `prism-tool run commitlint -- --edit FILE` and `prism-tool run git-cliff -- ARGUMENTS`.

- [x] **Step 1: Write failing CLI process tests**

Create process-level tests that invoke `node packages/prism-core/scripts/prism-tool.js` from a temporary unrelated directory. Assert that `run git-cliff -- --version` returns `2.13.1`; a fake component ID returns exit `2`; an OCR `config` first argument is rejected without execution; an argument containing spaces, semicolon, command substitution text, and a newline reaches a fake executable as one unchanged argument; and output over 1 MiB or a process exceeding 30 seconds returns exit `4` with no raw output. Inject a 50 ms timeout through the exported `main()` context rather than a production bypass environment variable.

The injection assertion must use this concrete payload:

```js
const payload = 'value with spaces;$(printf injected)\nsecond-line';
assert.deepEqual(JSON.parse(captured), [payload]);
```

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-run.test.js
```

Expected: FAIL because the entry point, process runner, CLI dispatcher, and package-owned commitlint config do not exist.

- [x] **Step 3: Implement the bounded runner and bundled resolver**

`process.js` uses `spawnSync(command, args, {cwd, env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 1048576, windowsHide: true})`; it never uses `shell`, `exec`, or string concatenation. It returns `{status, stdout, stderr, timedOut}` after replacing control characters in diagnostic summaries. `extractVersion()` returns the first standalone `major.minor.patch` token and rejects absent or multiple conflicting tokens.

Resolve bundled executables by loading the component package's `package.json` with `require.resolve(packageName + '/package.json', {paths: [coreRoot]})`, selecting the declared executable from the package `bin` field, canonicalizing the result, and proving it remains inside that package root. Do not depend on current working directory or `.bin` symlink layout.

Make `scripts/prism-tool.js` mode `0755` with this complete fail-closed entry shape; the pre-commit hook supplies its canonical header/modeline:

```js
#!/usr/bin/env node
'use strict';

const { main } = require('./prism-tool/cli');

Promise.resolve(main(process.argv.slice(2)))
	.then((code) => {
		process.exitCode = code;
	})
	.catch(() => {
		process.stderr.write('prism-tool: internal failure\n');
		process.exitCode = 4;
	});
```

`cli.js` must:

```js
const EXIT = Object.freeze({OK: 0, USAGE: 2, READINESS: 3, TOOL: 4, TRANSACTION: 5});

async function main(argv, context = {}) {
	const parsed = parseArguments(argv);
	if (parsed.command === 'run') return runDeclaredTool(parsed, context);
	if (parsed.command === 'doctor') return doctor(parsed, context);
	if (parsed.command === 'setup') return setup(parsed, context);
	return renderFailure(EXIT.USAGE, 'unknown command', parsed.json);
}
```

Before Task 3 exists, `doctor` and `setup` return exit `2` with `command not implemented`; no command silently succeeds. `run` accepts only contract command components. Apply `first-token` policy before resolving/executing; `passthrough` preserves every argument byte. Read piped stdin only when non-TTY, cap it at 1 MiB, and pass it as `input`.

Add `"bin": {"prism-tool": "scripts/prism-tool.js"}` to the core package, add `config` to its files array, and retain recursive `scripts` packaging. Move the current custom commitlint logic unchanged to `packages/prism-core/config/commitlint.config.cjs`; make root `commitlint.config.js` exactly:

```js
module.exports = require('./packages/prism-core/config/commitlint.config.cjs');
```

The commitlint launcher always appends `--config` with the core config path and rejects caller-supplied `--config`, preventing configuration bypass. Add `"test:node": "node --test tests/Node/*.test.js"` to root scripts and include `tests/Node/**/*.js` in the package-JS ESLint scope.

- [x] **Step 4: Run tests to verify Green**

Run:

```bash
npm run test:node
node packages/prism-core/scripts/prism-tool.js run commitlint -- --version
node packages/prism-core/scripts/prism-tool.js run git-cliff -- --version
bash tests/Shell/commit-msg_test.sh
```

Expected: Node and commit hook regression tests pass; versions are exactly `21.2.2` and `2.13.1`.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/prism-tool.js packages/prism-core/scripts/prism-tool packages/prism-core/config packages/prism-core/package.json commitlint.config.js eslint.config.mjs package.json tests/Node/prism-tool-run.test.js tests/Shell/commit-msg_test.sh
git commit -S -m $'feat(toolchain): run bundled tools through core launcher\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 3: Mandatory external readiness and OCR consent

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/preflight.js`
- Create: `tests/Node/prism-tool-preflight.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/contract.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/toolchain.json`
- Modify: `tests/Node/toolchain-contract.test.js`
- Modify: `tests/Node/prism-tool-run.test.js`

**Interfaces:**
- Consumes: core contract and `runBounded()`.
- Produces: mutually exclusive exact/range contract validation, `checkExternalTools({contract, env, run})`, `testOcrConnectivity({approved, run})`, `doctor()`.
- Changes: every `run` performs local Semgrep/OCR version preflight before resolving its target.

- [x] **Step 1: Write failing readiness and sanitization tests**

Use temporary fake `semgrep` and `ocr` executables. For each tool cover lower-bound pass, later-1.x pass, below-minimum failure, and `2.0.0` failure. Cover mutually exclusive/invalid range contracts, Semgrep's exactly one anchored bare `X.Y.Z` line, OCR's exactly one anchored `open-code-review vX.Y.Z` line, advertised-update noise, missing command, malformed/duplicate version evidence, timeout, output cap, Semgrep without login, doctor without OCR-test approval, approved `ocr llm test`, failed live test, and canary-secret output. Assert:

```js
assert.equal(result.status, 3);
assert.doesNotMatch(result.stdout + result.stderr, /CANARY-API-KEY-94f0/);
assert.equal(readCounter('target-runs'), 0);
```

Also assert `doctor --local-only` never invokes `ocr llm test`, while plain `doctor` requires `--ocr-test-approved=yes` and exits `2` when absent. Assert `run ocr --code-egress-approved=yes -- review --audience agent --format json` is allowed only after local preflight; missing egress approval exits `2` before OCR execution.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-preflight.test.js
```

Expected: FAIL because external preflight and doctor behavior are absent.

- [x] **Step 3: Implement fail-closed preflight and cadence**

Resolve external executables from `PATH` without invoking a shell. Run each declared `versionArguments` with fixed bounds. Compare exact managed components as exact strings. For Semgrep, select the installed version from exactly one anchored bare `X.Y.Z` line; for OCR, select it from exactly one anchored `open-code-review vX.Y.Z` product line. Ignore update advertisements and all other version tokens, then compare numeric major/minor/patch tuples against each component's inclusive minimum and exclusive maximum. Reject prereleases and malformed, duplicate, or ambiguous evidence. Return checks with only tool ID, PASS/FAIL, the safe exact/range expectation, actual version when safe, and a fixed message. Never include raw stdout/stderr.

`doctor` always runs local checks. `--local-only` returns after local checks. Without `--local-only`, require exact OCR-test approval and internally invoke `ocr` with `['llm', 'test']`; reduce the result to `PASS` or one of `timeout`, `non-zero`, `malformed`, or `output-limit`. Do not persist connectivity state.

Every `run` calls local preflight first. OCR `review`/`scan` additionally require exact egress approval and use the contract-owned six-minute execution timeout needed for reviews that may take five minutes; version probes and connectivity tests remain bounded at 30 seconds. Contract execution timeouts must be integer milliseconds from one second through ten minutes. The caller cannot use `run` for `ocr config`, `ocr llm test`, Semgrep login, or any first token outside the contract allowlist.

- [x] **Step 4: Run tests to verify Green**

Run:

```bash
npm run test:node
```

Expected: all readiness, cadence, egress, no-later-command, timeout, output-bound, and canary-sanitization cases pass without contacting real providers.

Then run read-only real version checks:

```bash
semgrep --version
ocr --version
```

Expected for later integration: Semgrep satisfying `>=1.173.0 <2.0.0` and OCR satisfying `>=1.9.1 <2.0.0`. If either requirement fails, stop and give the human the declared remediation; do not install either tool.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/prism-tool/preflight.js packages/prism-core/scripts/prism-tool/contract.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/toolchain.json tests/Node/toolchain-contract.test.js tests/Node/prism-tool-preflight.test.js tests/Node/prism-tool-run.test.js
git commit -S -m $'feat(toolchain): enforce mandatory external readiness\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 4: Pi adapter discovery and consumer tool resolution

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/discovery.js`
- Create: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Create: `packages/prism-php-web/scripts/toolchain/project.js`
- Create: `tests/Node/prism-tool-discovery.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`

**Interfaces:**
- Consumes: package metadata and contracts from Task 1.
- Produces: `discoverAdapter({projectRoot, piDir})`, `loadAdapterHandler(registration)`, adapter `resolveTool()` and `inspect()`.
- Extends: `prism-tool run` to command components in one active adapter.

- [x] **Step 1: Write failing discovery fixtures**

Build isolated fixtures for:

1. `.pi/npm/package.json` with a direct adapter dependency under `.pi/npm/node_modules`.
2. `.pi/settings.json` with `skills` and `prompts` paths leading to a local adapter package root.
3. a settings path outside the declared package root through a symlink.
4. two active adapters declaring the same tool ID.
5. package metadata with an absolute handler or handler escaping through `..`.
6. an unrelated working directory with no adapter.

Assert managed and local packages resolve to the same canonical registration, malicious/ambiguous fixtures exit `2`, and no test invokes `pi list`. Add a consumer fixture with fake `vendor/bin/pest` and `node_modules/.bin/eslint`; assert `run pest` and `run eslint` execute those exact canonical files from an unrelated cwd.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-discovery.test.js
```

Expected: FAIL because adapter discovery and handler resolution are absent.

- [x] **Step 3: Implement documented-path discovery and handler boundary**

Discovery checks only:

- direct dependencies declared in the project root's `.pi/npm/package.json`, resolved beneath the same root's `.pi/npm/node_modules`; and
- paths explicitly present in the project root's `.pi/settings.json` resource/package arrays, walking upward at most six parents to the first `package.json` carrying `prism.adapter: true`.

Canonicalize each package, contract, and handler path; require contract/handler paths to remain inside the package root. Validate the contract before loading the handler. Reject duplicate canonical packages, multiple active adapters, ID collisions with core, unsupported package metadata, and symlink escape. Never parse `pi list` output or recursively scan the project.

`project.js` resolves Composer commands only from the canonical project root's `vendor/bin` and npm commands only from its `node_modules/.bin`. It rejects absent, non-executable, symlink-escaped, or wrong-scope paths. `inspect()` reports PHP version, `ext-sockets`, manifest/lock presence, and component resolution without network or mutation.

- [x] **Step 4: Run tests to verify Green**

Run:

```bash
npm run test:node
node packages/prism-core/scripts/prism-tool.js setup inspect --json
```

Expected: tests pass; the source checkout discovers the local PHP/web adapter from `.pi/settings.json` and returns a valid JSON inspection without mutation.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/prism-tool/discovery.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-php-web/scripts tests/Node/prism-tool-discovery.test.js
git commit -S -m $'feat(toolchain): discover project adapters through pi metadata\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 5: Candidate dependency resolution and advisory gate

**Files:**
- Create: `packages/prism-php-web/scripts/toolchain/workspace.js`
- Create: `packages/prism-php-web/scripts/toolchain/audit.js`
- Create: `packages/prism-php-web/scripts/toolchain/transaction.js`
- Create: `tests/Node/prism-tool-resolve.test.js`
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-core/safe-dirs.json`
- Modify: `packages/prism-core/extensions/safety/README.md`

**Interfaces:**
- Consumes: adapter handler API and bounded runner.
- Produces: `createWorkspace()`, `recoverWorkspace()`, `normalizeComposerAudit()`, `normalizeNpmAudit()`, `resolveCandidate()`.
- Produces: ownership-marked candidate plan and human-readable manifest/lock diff.

- [x] **Step 1: Write failing transaction tests with fake package managers**

Fixtures must prove no subprocess runs without `--network-approved=yes`; workspace is exactly `.pi/prism-tool/work`; lifecycle scripts are disabled; Composer and npm receive exact approved package/version pairs; valid non-zero audit output with findings is parsed as findings; malformed audit output is a tool failure; critical/high/moderate/low findings each return exit `5`; candidate conflict leaves consumer files byte-identical; symlink manifests and mismatched ownership markers fail; handled success/failure/decline cleans the owned workspace; interrupted state is recovered only when marker project/adapter realpaths match.

Use concrete fake audit documents:

```json
{"advisories":{"package/name":[{"advisoryId":"CVE-2099-0001","severity":"low","title":"fixture"}]}}
```

```json
{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":1,"high":0,"critical":0}},"vulnerabilities":{"fixture":{"severity":"moderate","via":[{"source":1,"title":"fixture"}]}}}
```

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-resolve.test.js
```

Expected: FAIL because workspace, audit, and resolution modules are absent.

- [x] **Step 3: Implement isolated resolution and zero-advisory gate**

After exact network approval:

1. Canonicalize the project and reject symlink manifest/lock targets.
2. Recover only a matching ownership-marked workspace, then create a fresh mode-`0700` workspace and mode-`0600` marker.
3. Copy present manifests/locks and record concrete SHA-256 or `absent` for each consumer path.
4. Add or replace the candidate Composer root requirements with `composer require --dev --no-update --no-scripts --no-interaction friendsofphp/php-cs-fixer:3.95.18 pestphp/pest:5.1.1 pestphp/pest-plugin-browser:5.0.1`; this mutates only the workspace manifest and supports consumers with missing or incompatible prior constraints.
5. Run Composer candidate resolution in the workspace with `composer update friendsofphp/php-cs-fixer:3.95.18 pestphp/pest:5.1.1 pestphp/pest-plugin-browser:5.0.1 --with-all-dependencies --no-install --no-scripts --no-interaction`.
6. Run npm candidate resolution in the workspace with `npm install --package-lock-only --ignore-scripts --save-dev --save-exact` plus the seven exact npm pairs from Global constraints.
7. Run `composer audit --locked --format=json` and `npm audit --package-lock-only --json`; parse valid JSON regardless of process status.
8. Reject every nonzero severity total and malformed/oversized/timeout output.
9. Write the candidate plan with real SHA-256 digests and fixed `browserTargets: ["chromium"]`.
10. Produce diff text with `git diff --no-index --` as data only; never evaluate it.

Add only `.pi/prism-tool/work` to the core safe-directory declaration and safety documentation. Cleanup canonicalizes and verifies the ownership marker before recursive removal.

- [x] **Step 4: Run tests to verify Green**

Run:

```bash
npm run test:node
node packages/prism-core/scripts/prism-tool.js setup resolve --adapter=@kyaulabs/prism-php-web --network-approved=no
```

Expected: tests pass; the real command exits `2` before network or workspace mutation because only exact `yes` is accepted.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-php-web/scripts/toolchain packages/prism-php-web/scripts/prism-tool-adapter.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/safe-dirs.json packages/prism-core/extensions/safety/README.md tests/Node/prism-tool-resolve.test.js
git commit -S -m $'feat(adapter): resolve and audit candidate toolchains\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 6: Approved application, deterministic install, and recovery

**Files:**
- Create: `tests/Node/prism-tool-apply.test.js`
- Modify: `packages/prism-php-web/scripts/toolchain/workspace.js`
- Modify: `packages/prism-php-web/scripts/toolchain/transaction.js`
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`

**Interfaces:**
- Consumes: candidate plan from Task 5.
- Produces: `applyCandidate()`, `installLockedGraph()`, `verifyInstalledGraph()`.
- Enforces: literal approval, stale-plan hashes, atomic files, Chromium-only download, retained desired locks after post-apply failure.

- [x] **Step 1: Write failing apply and recovery tests**

Cover every non-literal approval value (`no`, `y`, `YES`, empty, whitespace) and assert no file changes. Cover stale original hash, candidate hash mismatch, adapter/project mismatch, replaced ownership marker, atomic replacement failure with pre-install rollback, successful four-file application, `composer install --no-scripts --no-interaction`, `npm ci --ignore-scripts`, `node_modules/.bin/playwright install chromium`, rejection of extra browser targets, post-install audit findings, browser failure, and final exact component verification.

For post-apply install/browser failure assert candidate manifests/locks remain, exit is `5`, output names the fixed retry operation, and no backup file remains. For a replacement failure before package installation assert all four original states, including absent files, are restored byte-for-byte.

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-apply.test.js
```

Expected: FAIL because apply/install/verify behavior is absent.

- [x] **Step 3: Implement approval-bound application and final verification**

Core parses `--approval=yes` before dispatch and passes boolean `true`; the adapter never accepts raw approval text. Validate plan schema, canonical project/adapter, ownership marker, all original current hashes, all candidate workspace hashes, and zero audit totals.

For each consumer file, write a mode-preserving sibling temp file, `fsync` it, and rename it. Keep mode-`0600` backups inside the owned workspace until all four renames succeed. On a rename failure, restore every already-applied path and remove paths originally absent. After all renames succeed, delete backups and run locked installs. Never roll back manifests/locks after install begins.

Use only fixed argument arrays listed in Task 5 and this task. Browser install must resolve the installed Playwright executable through `resolveTool()` and pass `['install', 'chromium']`. Re-run both structured audits, parse consumer locks to confirm every exact package version, invoke every command component's version check, and clean the owned workspace on handled completion.

- [x] **Step 4: Run tests to verify Green**

Run:

```bash
npm run test:node
```

Expected: all approval, stale-plan, atomicity, retry, Chromium-only, post-audit, and exact-version tests pass.

- [x] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/prism-tool/cli.js packages/prism-php-web/scripts tests/Node/prism-tool-apply.test.js
git commit -S -m $'feat(adapter): apply audited toolchains transactionally\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 7: Managed global launcher and core installation readiness

**Files:**
- Create: `tests/Shell/install_global_toolchain_test.sh`
- Modify: `packages/prism-core/scripts/install-global.sh`
- Modify: `packages/prism-core/package.json`
- Modify: `packages/prism-core/README.md`

**Interfaces:**
- Consumes: executable CLI and local/live doctor modes.
- Produces: managed launcher at `${PRISM_BIN_DIR:-$HOME/.local/bin}/prism-tool`.
- Extends: installer flags `--network-approved=yes` and `--ocr-test-approved=yes` without shell prompting.

- [ ] **Step 1: Write failing isolated installer tests**

Run the real installer with temporary `HOME`, `PI_CODING_AGENT_DIR`, `PRISM_BIN_DIR`, and fake `pi`, Semgrep, OCR, and Node package roots. Assert local-source install requires no registry approval, npm source requires exact network approval, OCR live test requires exact approval, the launcher is mode `0755`, invokes the installed core CLI, refreshes idempotently, does not edit shell startup files, rejects an unrelated existing executable, replaces only a launcher containing both Prism ownership sentinels, and removes only a managed launcher under `--uninstall-launcher`.

Also assert failed mandatory readiness leaves installed package/context resources in place but returns nonzero and never reports toolchain GO.

- [ ] **Step 2: Run the focused test to verify Red**

Run:

```bash
bash tests/Shell/install_global_toolchain_test.sh
```

Expected: FAIL because launcher deployment and approval flags do not exist.

- [ ] **Step 3: Implement narrow launcher ownership**

Keep existing merge-safe context deployment unchanged. Parse only the three documented options; reject unknown flags. For npm package installation require exact network approval and run Pi with `npm_config_ignore_scripts=true`. Local source installation remains local.

Write the launcher atomically with these sentinels and an absolute managed package CLI path resolved after Pi installation:

```bash
#!/usr/bin/env bash
# prism-core:managed-launcher begin
exec node '/canonical/pi/npm/node_modules/@kyaulabs/prism-core/scripts/prism-tool.js' "$@"
# prism-core:managed-launcher end
```

Single-quote the already canonical trusted path by rejecting newline, carriage return, NUL, and single quote; do not interpolate an unvalidated path. Refuse unrelated files/symlinks. Never edit `PATH`; report when the bin directory is absent from it. After deployment run local doctor, then live doctor only with exact OCR approval. Runtime setup does not install Semgrep/OCR.

- [ ] **Step 4: Run tests to verify Green**

Run:

```bash
bash tests/Shell/install_global_toolchain_test.sh
npm pack --dry-run --ignore-scripts ./packages/prism-core
```

Expected: installer tests pass and package dry-run marks `scripts/prism-tool.js` as a bin entry.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/scripts/install-global.sh packages/prism-core/package.json packages/prism-core/README.md tests/Shell/install_global_toolchain_test.sh
git commit -S -m $'feat(core): deploy managed prism-tool launcher\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 8: Git hooks use the stable toolchain boundary

**Files:**
- Create: `tests/Shell/toolchain_hooks_test.sh`
- Modify: `.github/hooks/commit-msg`
- Modify: `.github/hooks/pre-commit`
- Modify: `.github/hooks/pre-push`
- Modify: `packages/prism-core/scripts/install-hooks.sh`
- Modify: `tests/Shell/commit-msg_test.sh`
- Modify: `tests/Shell/check_resolution_test.sh`
- Modify: `tests/Shell/pre_commit_index_lint_test.sh`
- Modify: `tests/Shell/pre_push_parity_test.sh`
- Delete: `tests/Shell/ci_local_parity_test.sh`
- Modify: `tests/Shell/commit_msg_parity_test.sh`

**Interfaces:**
- Consumes: `prism-tool doctor --local-only` and `prism-tool run`.
- Produces: hook-local `resolve_prism_tool()` that accepts an executable `PRISM_TOOL` override for isolated tests, otherwise requires `command -v prism-tool`.
- Preserves: staged-blob linting and RCS normalization.

- [ ] **Step 1: Write failing hook-boundary tests**

Create a fake `prism-tool` that logs NUL-delimited argv and delegates success/failure by tool ID. Assert each hook performs mandatory local doctor before its main operation; commit-msg invokes `run commitlint -- --edit MESSAGE`; pre-commit invokes adapter IDs only when matching staged files exist and never directly calls `npx` or `vendor/bin`; pre-push invokes local doctor before harness checks; a missing launcher fails closed with `/setup` remediation; a failed doctor prevents every later tool; and filenames/payloads with spaces remain one argument.

Update existing hook fixtures to set `PRISM_TOOL` to the fake or real source CLI and provide fake in-range Semgrep and OCR executables. Replace assertions about local `node_modules/commitlint` and `npm install` remediation with launcher assertions, including the focused `commit_msg_parity_test.sh` contract.

- [ ] **Step 2: Run focused hook tests to verify Red**

Run:

```bash
bash tests/Shell/toolchain_hooks_test.sh
bash tests/Shell/commit-msg_test.sh
bash tests/Shell/pre_commit_index_lint_test.sh
```

Expected: new tests fail on direct local tool assumptions while existing behavior tests document the staged-index behavior that must remain.

- [ ] **Step 3: Migrate hooks without changing index semantics**

At each hook start, resolve the launcher and run local doctor. Replace only tool invocations:

```text
npx commitlint                         -> prism-tool run commitlint
vendor/bin/php-cs-fixer or PATH fallback -> prism-tool run php-cs-fixer
npx stylelint                          -> prism-tool run stylelint
npx eslint                             -> prism-tool run eslint
```

Retain PHP syntax, shellcheck, gitleaks, script-mode checks, conflict protection, branch protection, staged-temp checkout, and RCS normalization. Required declared tools no longer have skip branches. `install-hooks.sh` reports `prism-tool doctor --local-only` as prerequisite instead of `npm install`. Delete `ci_local_parity_test.sh`; its OpenCode-era textual assertions are replaced by the hook behavior tests here and the Pi-native CI contract in Task 11.

- [ ] **Step 4: Run hook suites to verify Green**

Run:

```bash
bash tests/Shell/toolchain_hooks_test.sh
bash tests/Shell/commit-msg_test.sh
bash tests/Shell/check_resolution_test.sh
bash tests/Shell/pre_commit_index_lint_test.sh
bash tests/Shell/pre_push_parity_test.sh
bash tests/Shell/commit_msg_parity_test.sh
```

Expected: all pass; staged-blob behavior remains intact and declared tool skips/direct invocations are absent.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks packages/prism-core/scripts/install-hooks.sh tests/Shell/toolchain_hooks_test.sh tests/Shell/commit-msg_test.sh tests/Shell/check_resolution_test.sh tests/Shell/pre_commit_index_lint_test.sh tests/Shell/pre_push_parity_test.sh tests/Shell/ci_local_parity_test.sh tests/Shell/commit_msg_parity_test.sh
git commit -S -m $'refactor(hooks): route declared tools through prism-tool\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 9: Prompts and skills enforce the same consent/readiness contract

**Files:**
- Create: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `packages/prism-core/prompts/doctor.md`
- Modify: `packages/prism-core/prompts/check.md`
- Modify: `packages/prism-core/prompts/security.md`
- Modify: `packages/prism-core/prompts/release.md`
- Modify: `packages/prism-core/prompts/pr.md`
- Modify: `packages/prism-core/skills/code-review/SKILL.md`
- Modify: `packages/prism-core/skills/audit-deps/SKILL.md`
- Modify: `packages/prism-php-web/prompts/check-php.md`
- Modify: `packages/prism-php-web/prompts/build-assets.md`
- Modify: `packages/prism-php-web/skills/tdd-php/SKILL.md`
- Modify: `packages/prism-php-web/skills/pest-browser/SKILL.md`
- Modify: `packages/prism-php-web/skills/scss-mobile-first/SKILL.md`
- Modify: `packages/prism-php-web/docs/tests.md`
- Modify: `tests/Shell/release_workflow_test.sh`
- Modify: `tests/Shell/pr_command_test.sh`

**Interfaces:**
- Consumes: complete public CLI.
- Produces: conversation-owned one-question approval sequence and no direct declared-tool invocation in active resources.

- [ ] **Step 1: Write failing resource contract tests**

`toolchain_entrypoints_test.sh` must assert:

- `/setup` asks network approval, runs resolve, displays candidate diff, asks literal `yes`, then runs apply/verify; approvals are separate and one question per turn.
- `/doctor` asks OCR-connectivity permission before invoking live doctor.
- `/check`, `/pr`, hooks, and release perform local-only readiness.
- `code-review` performs an approved live OCR test before separately asking code-egress permission.
- `/security` runs `prism-tool run semgrep` and adapter-owned audit.
- release/PR use bundled `git-cliff`/commitlint through the launcher.
- adapter checks/build commands use declared IDs.
- no active resource contains direct `npx` for declared tools, `vendor/bin/pest`, `vendor/bin/php-cs-fixer`, `git cliff`, `command -v ocr`, or optional/SKIPPED OCR wording.

Exclude frozen ADRs, specs/plans, `aurora/`, and test fixtures from the stale-reference scan.

- [ ] **Step 2: Run resource tests to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/pr_command_test.sh
```

Expected: FAIL on current direct invocations and optional OCR semantics.

- [ ] **Step 3: Rewrite active resources around the CLI**

`/setup` performs local preflight, asks OCR-test permission, performs live preflight, detects the adapter, asks registry permission, runs `setup resolve`, shows exact diff/status, asks literal `yes`, then runs apply and approved browser/network verification. It never asks for keys or runs OCR config; it prints human-run configuration commands when readiness fails.

`/doctor` remains read-only and asks exactly one OCR-connectivity question before passing approval. `/check`, `/pr`, and release call local-only doctor. `/security` invokes Semgrep with fixed scan arguments and delegates audits to the adapter handler. `code-review` changes OCR from optional to mandatory, runs the live test after connectivity approval, then asks separately before `run ocr --code-egress-approved=yes`.

Replace adapter commands with:

```text
prism-tool run php-cs-fixer -- fix --dry-run --diff
prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input
prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
prism-tool run pest -- --coverage
prism-tool run sass -- --style=compressed cdn/sass/main.scss cdn/css/main.min.css
prism-tool run uglify-js -- cdn/js/main.js -o cdn/javascript/main.min.js -c -m
prism-tool run playwright -- install chromium
```

Retain each prompt/skill's current behavioral constraints, frontmatter, and one-question gates. Do not duplicate version tables outside contracts; link to the contract and ADR-0063.

- [ ] **Step 4: Run resource tests to verify Green**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/release_workflow_test.sh
bash tests/Shell/pr_command_test.sh
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: all pass and stale direct invocation scan is empty outside approved exclusions.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/prompts packages/prism-core/skills/code-review packages/prism-core/skills/audit-deps packages/prism-php-web/prompts packages/prism-php-web/skills packages/prism-php-web/docs/tests.md tests/Shell/toolchain_entrypoints_test.sh tests/Shell/release_workflow_test.sh tests/Shell/pr_command_test.sh
git commit -S -m $'docs(toolchain): route harness entrypoints through launcher\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 10: Dogfood the exact PHP/web and frontend dependency baseline

**Files:**
- Create: `tests/Node/source-toolchain-parity.test.js`
- Modify: `composer.json`
- Modify: `composer.lock`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/prism-php-web/skills/php-web-stack/SKILL.md`
- Modify: `packages/prism-php-web/skills/tdd-php/SKILL.md`
- Modify: `packages/prism-php-web/skills/pest-browser/SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: both contracts.
- Produces: source checkout whose direct manifest/locks equal the contracts and whose Pest 5/PHPUnit 13 suite passes on PHP 8.5.

- [ ] **Step 1: Write failing source parity and baseline tests**

Test that root `require-dev` exactly contains the three Composer contract versions; root npm approved dependencies match adapter/core contracts; locks resolve those exact direct versions; PHPUnit lock major is `13`; PHP is at least `8.5`; `ext-sockets` is loaded; and the language server is absent from package and lock.

Use JSON parsing, not grep. The Composer lock assertions read `packages-dev`; npm assertions read `packages['node_modules/' + packageName].version`.

- [ ] **Step 2: Run tests to verify Red and record baseline**

Run:

```bash
node --test tests/Node/source-toolchain-parity.test.js
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: parity test fails on ranges, Pest 4/browser 4, PHPUnit 12, and older lock versions. Record the existing Pest suite result as characterization evidence before changing dependencies; if it is not green, halt and debug before upgrade.

- [ ] **Step 3: Resolve and install exact source dependencies after approval**

After explicit registry/network approval, run candidate-style updates with scripts disabled:

```bash
composer require --dev --no-scripts --no-interaction --with-all-dependencies friendsofphp/php-cs-fixer:3.95.18 pestphp/pest:5.1.1 pestphp/pest-plugin-browser:5.0.1
npm install --save-dev --save-exact --ignore-scripts @commitlint/config-conventional@21.2.2 commitlint@21.2.2 git-cliff@2.13.1 sass@1.102.0 uglify-js@3.19.3 eslint@10.8.1 @eslint/js@10.0.1 stylelint@17.14.1 stylelint-config-standard-scss@17.0.0 playwright@1.62.1
npm uninstall --save-dev --ignore-scripts @stylelint/language-server
composer install --no-scripts --no-interaction
npm ci --ignore-scripts
```

Run structured Composer/npm audits and stop on any advisory. Update PHP adapter compatibility prose from Pest 4/PHPUnit 12 to Pest 5/PHPUnit 13 and use contract-owned setup commands. Do not add compatibility branches for Pest 4.

- [ ] **Step 4: Run parity and full adapter suite to verify Green**

Run:

```bash
node --test tests/Node/source-toolchain-parity.test.js
composer validate --strict --no-check-publish
composer audit --locked --format=json
npm audit --audit-level=low
prism-tool run php-cs-fixer -- fix --dry-run --diff
prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input
prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
prism-tool run pest -- --coverage
```

Expected: exact parity and all adapter checks pass; coverage remains at least 80% for changed PHP files.

- [ ] **Step 5: Commit**

```bash
git add composer.json composer.lock package.json package-lock.json packages/prism-php-web/skills/php-web-stack/SKILL.md packages/prism-php-web/skills/tdd-php/SKILL.md packages/prism-php-web/skills/pest-browser/SKILL.md README.md tests/Node/source-toolchain-parity.test.js
git commit -S -m $'build(adapter): adopt exact pest 5 toolchain baseline\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 11: Replace OpenCode-era CI with Pi-native contract verification

**Files:**
- Create: `tests/Shell/pi_ci_contract_test.sh`
- Rewrite: `.github/workflows/ci.yml`
- Delete: `tests/Shell/ci_download_integrity_test.sh`
- Delete: `tests/Shell/ci_no_composer_scripts_test.sh`
- Delete: `tests/Shell/ci_no_sudo_test.sh`
- Delete: `tests/Shell/ci_npm_test.sh`
- Delete: `tests/Shell/ci_persist_credentials_test.sh`
- Delete: `tests/Shell/ci_runner_hosted_test.sh`
- Delete: `tests/Shell/ci_runner_isolation_adr_test.sh`
- Delete: `tests/Shell/semgrep_ci_test.sh`
- Modify: `tests/Shell/pre_push_parity_test.sh`

**Interfaces:**
- Consumes: source CLI, exact locks, package tests, and existing protected-push script.
- Produces: one Pi-native `verify` job plus one package-smoke matrix, without legacy eval or OpenCode parity assumptions.
- Clarifies: compatible-range Semgrep/OCR installation in ephemeral CI is environment provisioning; Prism runtime/setup remains verification-only.

- [ ] **Step 1: Write the failing Pi CI contract test**

The consolidated shell test parses `.github/workflows/ci.yml` and asserts:

- checkout remains credential-nonpersistent and protected-push verification remains on push events;
- PHP is `8.5`, Node satisfies the core engine, and Pi is pinned `0.84.1`;
- CI environment provisioning names Semgrep `>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` without selecting patch releases;
- OCR uses npm `--ignore-scripts` and CI never runs `ocr llm test` or OCR review;
- Composer/npm project installation disables lifecycle scripts and uses committed locks;
- local CLI doctor runs before declared tools;
- Node tests, shell tests, harness validation, package smoke, Composer/npm audits, adapter lint, Pest coverage, Semgrep scan, and commitlint all run;
- every declared tool invocation after bootstrap uses `prism-tool` rather than `npx`, `vendor/bin`, or `git cliff`;
- package smoke checks both packed archives and an unrelated consumer cwd;
- no `.opencode`, eval-agent, model-tier, or retired manifest job remains.

- [ ] **Step 2: Run the CI contract test to verify Red**

Run:

```bash
bash tests/Shell/pi_ci_contract_test.sh
```

Expected: FAIL against the pre-Pi workflow structure and versions.

- [ ] **Step 3: Rewrite CI around the active contracts**

Create an Ubuntu `verify` job that checks out with submodules and no persisted credentials; configures PHP 8.5/PCOV and Node 24; installs locked dependencies with scripts disabled; installs pinned Pi; provisions a Semgrep release satisfying `>=1.173.0 <2.0.0` in an isolated venv and an OCR release satisfying `>=1.9.1 <2.0.0` globally with npm scripts disabled; runs `node packages/prism-core/scripts/prism-tool.js doctor --local-only`; then runs Node, shell, harness, type, executable-bit, PHP syntax, adapter lint, Pest/browser coverage, Semgrep, gitleaks, audits, and PR-range commitlint through the source CLI.

Keep Semgrep telemetry disabled and the first-party plus PHP/secrets/JavaScript rule packs. Keep the browser server and stop it under `if: always()`. Install only Playwright Chromium. A separate `package-smoke` matrix on `ubuntu-latest` and `macos-latest` packs both packages with scripts disabled, inspects required files/bin modes, installs the core into a temporary Pi root, and invokes the CLI from an unrelated temporary project.

Do not carry forward old eval jobs or tests whose only purpose was to pin OpenCode-era runner/parity interpretations. Preserve current generic security controls when they remain useful, but the new consolidated test is authoritative.

- [ ] **Step 4: Run local CI contract and suites to verify Green**

Run:

```bash
bash tests/Shell/pi_ci_contract_test.sh
bash tests/Shell/pre_push_parity_test.sh
npm run test:node
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: all pass and no deleted legacy CI test remains referenced.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/Shell
git commit -S -m $'ci(toolchain): replace legacy workflow with pi verification\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

### Task 12: Packaging, documentation, and complete contract verification

**Files:**
- Create: `tests/Node/toolchain-packaging.test.js`
- Modify: `packages/prism-core/AGENTS.md`
- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-php-web/README.md`
- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `packages/prism-core/scripts/validate-harness.sh`
- Modify: `tests/Shell/script_executable_bits_test.sh`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: packed-package inclusion/mode guarantees and one documented install/setup/recovery path.

- [ ] **Step 1: Write failing package smoke tests**

Use `npm pack --json --ignore-scripts` into a temporary directory for each package. Inspect tar entries and assert core contains `toolchain.json`, config, all CLI modules, executable bin source, global installer, prompts, skills, and safety data; adapter contains contract, handler/modules, prompts, skills, docs, and safe data. Extract archives, create fake Pi global/project layouts, and assert core bundled resolution plus local and managed adapter discovery from an unrelated cwd. Assert an unrelated existing launcher remains unchanged.

- [ ] **Step 2: Run package smoke test to verify Red**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
```

Expected: FAIL on any missing package file, mode, or installed-layout behavior not completed by earlier tasks.

- [ ] **Step 3: Close packaging and documentation gaps**

Update package files arrays only when the smoke test identifies an omitted owned path. Extend harness validation to verify executable mode for the CLI/bin/adapter handler and package archive inclusion. Update documentation to distinguish:

- bundled core tools;
- mandatory externally managed Semgrep/OCR;
- consumer-development adapter tools;
- four separate approval gates;
- OCR live-test cadence;
- exact human-run remediation;
- managed launcher collision/removal behavior;
- candidate workspace interruption recovery;
- Pest 5-only baseline; and
- CI environment provisioning versus runtime verification-only policy.

Remove stale instructions that require root `node_modules`, direct `git cliff`, optional OCR, Pest 4, OpenCode, or package-source execution from consumer projects. Keep global `AGENTS.md` concise and point to ADR-0063/contracts rather than duplicating version tables.

- [ ] **Step 4: Run package and full repository verification**

Run:

```bash
npm run test:node
node --test tests/Node/toolchain-packaging.test.js
bash packages/prism-core/scripts/validate-harness.sh
bash tests/Shell/script_executable_bits_test.sh
git diff --check
```

Expected: all pass; packed resources are complete and docs contain no stale active-runtime instructions.

- [ ] **Step 5: Commit**

```bash
git add packages/prism-core/AGENTS.md packages/prism-core/README.md packages/prism-php-web/README.md README.md CODING_HARNESS.md packages/prism-core/scripts/validate-harness.sh tests/Node/toolchain-packaging.test.js tests/Shell/script_executable_bits_test.sh
git commit -S -m $'docs(toolchain): document deterministic provisioning\n\nAuthored-by: gpt-5.6-sol\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

## Final verification and review

- [ ] Confirm real mandatory prerequisites without reading credentials:

```bash
semgrep --version
ocr --version
```

Expected: Semgrep satisfying `>=1.173.0 <2.0.0` and OCR satisfying `>=1.9.1 <2.0.0`.

- [ ] Ask separately for OCR connectivity approval, then run:

```bash
prism-tool doctor --ocr-test-approved=yes
```

Expected: GO with sanitized PASS evidence.

- [ ] Run locked dependency audits:

```bash
composer audit --locked --format=json
npm audit --audit-level=low
```

Expected: zero advisories.

- [ ] Run all automated suites:

```bash
npm run test:node
for test_file in tests/Shell/*_test.sh; do bash "$test_file"; done
bash packages/prism-core/scripts/validate-harness.sh
prism-tool run php-cs-fixer -- fix --dry-run --diff
prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input
prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
prism-tool run pest -- --coverage
```

Expected: every suite passes and changed PHP files meet the 80% line-coverage floor.

- [ ] Load `verification-before-completion`, attest the exact branch/HEAD/base evidence, and run `/check`.

- [ ] Run `spec-review`; every acceptance criterion in `docs/specs/2026-08-13-toolchain-provisioning-spec.md` must be covered.

- [ ] Run four-axis `code-review`. Before OCR, obtain live-test approval and then separate code-egress approval. Resolve every Blocking finding and re-run affected verification.

- [ ] Do not push. Hand the verified branch to `finishing-a-development-branch` and `/pr` for human publication.

## Plan self-review

- **Contract and version coverage:** Tasks 1, 3, and 10 cover every exact core, external, Composer, npm, Pest 5, and Chromium requirement.
- **Distribution coverage:** Tasks 2, 4, 7, and 12 cover bundled resolution, local/managed adapter discovery, global launcher ownership, unrelated consumer cwd, and packed archives.
- **Consent and security coverage:** Tasks 3, 5, 6, and 9 cover independent registry, mutation, OCR-connectivity, and OCR-egress gates; argument arrays, output bounds, symlinks, hashes, credentials, and cleanup are tested.
- **Entry-point coverage:** Tasks 8, 9, and 11 cover hooks, prompts, skills, local checks, release/PR, security/review, and Pi-native CI without declared-tool skips.
- **Transactional coverage:** Tasks 5 and 6 cover pre-apply byte identity, advisory blocking, per-file atomic replacement with rollback, post-apply desired-lock retention, deterministic retry, and final audits.
- **Documentation/context coverage:** ADR-0063 supersedes ADR-0062 and `CONTEXT.md` records bounded external compatibility; Tasks 9, 10, and 12 align active package resources and user documentation.
- **Type consistency:** `resolveTool`, `inspect`, `resolve`, `apply`, and `verify` use the same handler signatures throughout Tasks 4–6; approval flags and exit codes match the locked public CLI.
- **Gaps:** none found.
