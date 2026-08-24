# Bootstrap Adapter Selection and Provisioning Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add Core's closed supported-adapter catalogue, explicit Core-only selection, and exact provisional project-local adapter installation and cleanup contract for strict-empty setup.

**Architecture:** `supported-adapters.js` owns the closed Core catalogue and exact-version selection data. `bootstrap-adapter.js` owns strict-empty selection, deterministic local-checkout-or-pinned-npm acquisition, bounded Pi invocation, installed registration validation, provisional receipt state, and exact cleanup. Existing `discovery.js` remains the single adapter package/handler containment validator and gains only the bootstrap-protocol checks needed before executable adapter code loads.

**Tech Stack:** Node.js 22.19+ CommonJS, built-in `node:fs`, `node:path`, `node:crypto`, `node:test`, the existing `prism-tool` CLI, Pi 0.84.2 project-local package semantics, and Bash prompt-contract tests.

## Global constraints

- Prism Core remains language-agnostic. Core may name the supported `@kyaulabs/prism-php-web` adapter package but may not contain PHP, Composer, Pest, Aurora, SCSS, nginx, MariaDB, source-layout, dependency, quality-command, or renderer behavior.
- Add no dependency, extension, safe directory, registry-discovery service, arbitrary package source, Git transport, archive parser, or project scaffold behavior.
- The production catalogue has schema version `1`, one stable adapter ID (`php-web`), one display name (`PHP/web`), exact package identity `@kyaulabs/prism-php-web`, the exact current Core package version under ADR-0079 lockstep releases, and bootstrap protocol `1`.
- Catalogue validation rejects unknown fields, duplicate IDs or package identities, malformed display names, unversioned or ranged packages, unsupported protocols, and non-KYAULabs package identities.
- Core-only is represented by adapter ID `core-only`, disposition `CORE_ONLY`, and `adapter: null`. It is not a catalogue adapter and never installs, discovers, loads, or invokes an adapter.
- Strict-empty adapter selection accepts only `core-only`, `php-web`, or Cancel in prompt orchestration. Callers cannot supply package names, versions, URLs, registries, local paths, handler paths, toolchain paths, or protocols.
- A source checkout may activate only the deterministic co-shipped `packages/prism-php-web` sibling after exact identity/version validation. Every other production acquisition uses `npm:@kyaulabs/prism-php-web@<exact-version>`.
- Selecting `php-web` is the one authorization for its exact provisional project-local installation. The prompt asks no redundant adapter-installation question.
- Pi is invoked through a fixed argument array equivalent to `pi install <exact-source> -l --approve`; package lifecycle scripts are disabled through the child environment.
- Before `require()` loads adapter executable code, Core validates installed package identity/version, Prism registration, handler containment, toolchain containment, toolchain package/role, component collision, declared bootstrap protocol, and catalogue compatibility.
- Provisional state lives only beneath the selected project root's `.pi/` surface. A versioned receipt under `.pi/prism-tool/bootstrap/<attempt-id>/adapter.json` binds the canonical root, source mode, adapter record, acquisition source, settings digest, installed registration, and bounded post-install inventory.
- A caught install or validation failure attempts exact ownership-proven cleanup. A successful provisional selection remains until the next strict-empty stage consumes it or explicit cleanup runs.
- Cleanup quarantines only the receipt-owned `.pi/settings.json` and `.pi/npm` paths beneath the attempt workspace, deletes only unchanged recorded state, removes parent directories with non-recursive `rmdir`, and preserves any unexpected or changed third state for manual recovery.
- Established-project discovery and explicit installation approval remain behaviorally unchanged.
- Every new `.js` file carries the required RCS header and final JavaScript vim modeline.
- No lockfile or dependency changes are expected.

## Architect review

**Verdict:** GO-WITH-CONDITIONS

**ADR-required:** none

**CONTEXT.md alignment:**
- Implements the supported-adapter catalogue, explicit Core-only disposition, bootstrap workspace, trusted adapter registration, and setup-attempt boundaries already present in the glossary and invariants.
- Adds no new domain term requiring a glossary update.

**ADR alignment:**
- ADR-0058 and ADR-0060 keep stack behavior project-local and Core language-agnostic.
- ADR-0070 requires the fixed selection/install/cleanup mechanics behind `prism-tool` rather than prompt shell logic.
- ADR-0073 requires substitution-free prompt commands and literal reuse of validated attempt IDs.
- ADR-0079 permits deriving the initial co-shipped adapter version from the Core package version because release-managed Prism packages version in lockstep.
- ADR-0082 owns the closed catalogue, Core-only semantics, trusted package validation, and provisional state within the outer bootstrap transaction.
- ADR-0083 permits only the exact displayed adapter package/version and removes the redundant installation question.

**Boundary check:**
- Pi package installation is an external runtime boundary. Installed Pi 0.84.2 documentation confirms project installs write `.pi/settings.json`, use `.pi/npm/` for npm packages, and support one-run project trust through `--approve`.
- The launcher supplies only fixed arguments and validates project-local results before loading code.

**Risks:**
- Package installation can leave partial `.pi` state on subprocess failure. The receipt must precede the subprocess and cleanup must preserve ambiguous or changed state.
- A local development source must not accidentally resolve a global package-cache sibling. Local activation is allowed only for the exact `packages/prism-core` / `packages/prism-php-web` checkout shape.
- Catalogue version drift would make strict-empty setup install the wrong adapter. Deriving the initial adapter version from Core's accepted lockstep package version removes a second version literal.

**Required before implementation:**
- none

**Recommended (not blocking):**
- Keep the adapter receipt narrow so Task #385 can embed or extend it rather than introducing a competing outer journal.

## Security boundary

- **Asset:** strict-empty root integrity, least-privilege package authority, trusted adapter code-loading boundary, and exact rollback ownership.
- **Trust boundary:** caller controls CLI arguments and project filesystem state; Pi/npm output and installed package bytes are untrusted until validated; subprocess output is inert diagnostics only.
- **Abuse case:** arbitrary package installation, version drift, handler/toolchain escape, protocol substitution, lifecycle-script execution, package state escaping the project, concurrent human files being deleted, or Core-only silently loading adapter behavior.
- **Fail-closed behavior:** closed adapter IDs, exact package/version materialization, fixed argv, disabled scripts, pre-load containment validation, bounded receipts/inventories, digest revalidation, quarantine-before-delete, non-recursive parent cleanup, sanitized reports, and no fallback to another adapter or Core-only.

---

### Task 1: Expose the closed supported-adapter catalogue and Core-only selection

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/supported-adapters.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Create: `tests/Node/prism-tool-bootstrap-adapter.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Consumes: `coreRoot`, defaulting to the installed `@kyaulabs/prism-core` package root.
- Produces: `loadSupportedAdapterCatalogue({coreRoot, catalogue}) -> SupportedAdapterCatalogue`.
- Produces: `inspectSupportedAdapters({projectRoot, coreRoot, catalogue}) -> AdapterCatalogueReport`.
- Produces: public `prism-tool setup adapter catalogue [--json]`.
- `SupportedAdapterCatalogue` is `{schemaVersion: 1, coreOnly: {id, displayName, adapter}, adapters: AdapterRecord[]}`.
- `AdapterRecord` is `{id, displayName, packageName, packageVersion, bootstrapProtocol}`.

- [ ] **Step 1: Write the failing public catalogue and Core-only tests**

Create `tests/Node/prism-tool-bootstrap-adapter.test.js` with the standard synchronous `captureWrites()` helper used by neighboring launcher tests, then add these tests:

```javascript
// $KYAULabs: prism-tool-bootstrap-adapter.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

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

function writeCorePackage(coreRoot, version = '0.3.1') {
    writeJson(path.join(coreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version,
    });
}

test('reports one exact supported adapter and explicit Core-only selection', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot, '0.3.1');

    const result = captureWrites(() => main(
        ['setup', 'adapter', 'catalogue', '--json'],
        {projectRoot, coreRoot}
    ));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup adapter catalogue');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'ADAPTER_SELECTION_REQUIRED');
    assert.deepEqual(report.data.coreOnly, {
        id: 'core-only',
        displayName: 'Core only',
        adapter: null,
    });
    assert.deepEqual(report.data.adapters, [{
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        bootstrapProtocol: 1,
    }]);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('selects Core-only without package, handler, or filesystem effects', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    let invocations = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=core-only', '--source=blank', '--json',
    ], {
        projectRoot,
        coreRoot,
        run: () => {
            invocations += 1;
            throw new Error('Core-only must not invoke a subprocess');
        },
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'CORE_ONLY');
    assert.equal(report.data.adapter, null);
    assert.equal(report.data.acquisition, null);
    assert.equal(report.data.attempt, null);
    assert.equal(invocations, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Add table-driven invalid-catalogue tests by injecting `context.adapterCatalogue`. Cover unknown top-level keys, unsupported schema, missing `coreOnly`, non-null Core-only adapter, empty/duplicate adapter IDs, duplicate package identities, package ranges, unscoped or non-KYAULabs packages, unknown adapter fields, empty display names, and protocol values other than `1`. Every case returns exit `2`, emits no catalogue data, invokes no subprocess, and leaves the root empty.

- [ ] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the adapter catalogue operation and packaged module do not exist.

- [ ] **Step 3: Implement the closed catalogue and read-only report**

Create `packages/prism-core/scripts/prism-tool/supported-adapters.js`:

```javascript
// $KYAULabs: supported-adapters.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {inspectSetupRoute} = require('./setup-route');

const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PACKAGE_NAME = /^@kyaulabs\/[a-z0-9][a-z0-9._-]*$/;
const MAX_JSON_BYTES = 1048576;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function readCoreManifest(coreRoot) {
    const filePath = path.join(fs.realpathSync(coreRoot), 'package.json');
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) {
        throw new Error('core package manifest is invalid');
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        throw new Error('core package manifest is invalid');
    }
    if (
        !isRecord(manifest) ||
        manifest.name !== '@kyaulabs/prism-core' ||
        !EXACT_VERSION.test(manifest.version)
    ) {
        throw new Error('core package manifest is invalid');
    }
    return manifest;
}

function defaultCatalogue(coreRoot) {
    const manifest = readCoreManifest(coreRoot);
    return {
        schemaVersion: 1,
        coreOnly: {id: 'core-only', displayName: 'Core only', adapter: null},
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: manifest.version,
            bootstrapProtocol: 1,
        }],
    };
}

function loadSupportedAdapterCatalogue({coreRoot, catalogue}) {
    const value = catalogue ?? defaultCatalogue(coreRoot);
    if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'coreOnly', 'adapters'])) {
        throw new Error('supported adapter catalogue is invalid');
    }
    if (value.schemaVersion !== 1) throw new Error('supported adapter catalogue is unsupported');
    if (
        !isRecord(value.coreOnly) ||
        !hasExactKeys(value.coreOnly, ['id', 'displayName', 'adapter']) ||
        value.coreOnly.id !== 'core-only' ||
        value.coreOnly.displayName !== 'Core only' ||
        value.coreOnly.adapter !== null
    ) {
        throw new Error('Core-only catalogue entry is invalid');
    }
    if (!Array.isArray(value.adapters) || value.adapters.length === 0 || value.adapters.length > 16) {
        throw new Error('supported adapters are invalid');
    }
    const ids = new Set();
    const packages = new Set();
    const adapters = value.adapters.map((entry) => {
        if (!isRecord(entry) || !hasExactKeys(entry, [
            'id', 'displayName', 'packageName', 'packageVersion', 'bootstrapProtocol',
        ])) {
            throw new Error('supported adapter entry is invalid');
        }
        if (!ADAPTER_ID.test(entry.id) || entry.id === 'core-only' || ids.has(entry.id)) {
            throw new Error('supported adapter ID is invalid');
        }
        if (
            typeof entry.displayName !== 'string' ||
            entry.displayName.length === 0 ||
            entry.displayName.length > 80 ||
            /[\0\r\n]/.test(entry.displayName)
        ) {
            throw new Error('supported adapter display name is invalid');
        }
        if (!PACKAGE_NAME.test(entry.packageName) || packages.has(entry.packageName)) {
            throw new Error('supported adapter package is invalid');
        }
        if (!EXACT_VERSION.test(entry.packageVersion)) {
            throw new Error('supported adapter version is invalid');
        }
        if (entry.bootstrapProtocol !== 1) {
            throw new Error('supported adapter protocol is unsupported');
        }
        ids.add(entry.id);
        packages.add(entry.packageName);
        return Object.freeze({...entry});
    });
    return Object.freeze({
        schemaVersion: 1,
        coreOnly: Object.freeze({...value.coreOnly}),
        adapters: Object.freeze(adapters),
    });
}

function inspectSupportedAdapters({projectRoot, coreRoot, catalogue}) {
    const route = inspectSetupRoute({projectRoot});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        return {
            schemaVersion: 1,
            command: 'setup adapter catalogue',
            status: 'NO-GO',
            disposition: 'STOP',
            reason: route.reason,
            projectRoot: route.projectRoot,
            checks: [{id: 'bootstrap-adapter-catalogue', status: 'FAIL', message: 'adapter selection requires strict-empty setup'}],
            data: null,
        };
    }
    const supported = loadSupportedAdapterCatalogue({coreRoot, catalogue});
    return {
        schemaVersion: 1,
        command: 'setup adapter catalogue',
        status: 'GO',
        disposition: 'ADAPTER_SELECTION_REQUIRED',
        reason: 'CATALOGUE_VALID',
        projectRoot: route.projectRoot,
        checks: [{id: 'bootstrap-adapter-catalogue', status: 'PASS', message: 'supported adapter catalogue is valid'}],
        data: supported,
    };
}

module.exports = {inspectSupportedAdapters, loadSupportedAdapterCatalogue};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Add a `setup adapter catalogue` branch near `setup source` and `setup route` in `cli.js`. It accepts only one optional `--json`, calls `inspectSupportedAdapters`, renders the closed report, and maps GO to exit `0`, STOP to exit `5`, and catalogue validation failure to sanitized exit `2`.

Add `supported-adapters` to the packaged launcher-module assertion in `tests/Node/toolchain-packaging.test.js`.

- [ ] **Step 4: Run the focused tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS; catalogue inspection is read-only and Core-only selection invokes no subprocess or adapter code.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/supported-adapters.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "publish supported bootstrap adapters" --refs 383
```

---

### Task 2: Validate exact bootstrap registration before adapter code loads

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/discovery.js`
- Create: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `packages/prism-php-web/package.json`
- Modify: `packages/prism-php-web/scripts/prism-tool-adapter.js`
- Modify: `tests/Node/prism-tool-discovery.test.js`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**
- Extends adapter registration with `packageVersion` and nullable `bootstrapProtocol`.
- Produces: `validateBootstrapRegistration(registration, expected) -> registration`.
- Produces: `resolveBootstrapAcquisition({coreRoot, adapter}) -> {kind, installSource, packageRoot}`.
- Produces: `selectBootstrapAdapter({projectRoot, coreRoot, source, adapterId, ...}) -> BootstrapAdapterReport`.
- `expected` is the exact catalogue record; no caller package data is accepted.

- [ ] **Step 1: Add failing protocol, identity, and containment tests**

Update the discovery fixture helper so `writeAdapter()` may write `version`, `bootstrapProtocol`, and a handler export. Add tests proving:

```javascript
assert.throws(
    () => validateBootstrapRegistration(registration, {
        id: 'php-web',
        packageName: '@fixture/adapter',
        packageVersion: '1.0.0',
        bootstrapProtocol: 1,
    }),
    /bootstrap protocol/
);
```

Cover:

- exact installed version success;
- version mismatch;
- missing or unsupported `prism.bootstrapProtocol`;
- handler/toolchain escape;
- toolchain package or role mismatch;
- component collision with Core;
- package identity mismatch;
- handler export whose `bootstrapProtocol` differs from the validated manifest;
- deterministic checkout-local acquisition only for an exact `packages/prism-core` sibling `packages/prism-php-web` with matching identity/version;
- npm acquisition for an installed package root, unrelated local layout, absent sibling, or version-mismatched sibling;
- no `require()` call before manifest, registration, contract, and protocol validation succeed.

Use a handler canary file in the fixture that writes a marker when loaded; assert the marker remains absent for every pre-load rejection.

- [ ] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js
```

Expected: FAIL because bootstrap protocol metadata, exact-version registration, and acquisition resolution do not exist.

- [ ] **Step 3: Extend package registration and bootstrap acquisition**

In `packages/prism-php-web/package.json`, extend the existing Prism metadata without changing Pi resources:

```json
"prism": {
  "adapter": true,
  "bootstrapProtocol": 1,
  "toolchain": "./toolchain.json",
  "handler": "./scripts/prism-tool-adapter.js"
}
```

In `packages/prism-php-web/scripts/prism-tool-adapter.js`, export the protocol marker with the existing interface:

```javascript
const bootstrapProtocol = 1;

module.exports = {apply, bootstrapProtocol, inspect, resolve, resolveTool, verify};
```

In `discovery.js`:

1. permit only `adapter`, `bootstrapProtocol`, `handler`, and `toolchain` Prism keys;
2. reject a declared bootstrap protocol unless it is a positive safe integer;
3. return `packageVersion: manifest.version` and `bootstrapProtocol: prism.bootstrapProtocol ?? null`;
4. export `registrationFor` for the narrow bootstrap module;
5. add `validateBootstrapRegistration(registration, expected, coreRoot)` that checks exact package/version/protocol, reuses the loaded Core contract for component-collision validation, and returns only after every path and contract identity is valid;
6. extend `loadAdapterHandler(registration, expectedBootstrapProtocol = null)` so the handler is required only after registration validation, preserves the established `inspect`/`resolveTool` interface, and when a protocol is supplied requires `handler.bootstrapProtocol === expectedBootstrapProtocol`.

Create `bootstrap-adapter.js` with deterministic acquisition resolution:

```javascript
function checkoutAdapterRoot(coreRoot) {
    const canonicalCore = fs.realpathSync(coreRoot);
    const packagesRoot = path.dirname(canonicalCore);
    if (path.basename(canonicalCore) !== 'prism-core' || path.basename(packagesRoot) !== 'packages') {
        return null;
    }
    return path.join(packagesRoot, 'prism-php-web');
}

function resolveBootstrapAcquisition({coreRoot, adapter}) {
    const localRoot = checkoutAdapterRoot(coreRoot);
    if (localRoot && fs.existsSync(localRoot)) {
        try {
            const registration = registrationFor(localRoot, adapter.packageName);
            validateBootstrapRegistration(registration, adapter, coreRoot);
            return {
                kind: 'LOCAL',
                installSource: fs.realpathSync(localRoot),
                packageRoot: fs.realpathSync(localRoot),
            };
        } catch {
            // A present but mismatched co-shipped adapter is a conflict, not an npm fallback.
            throw new Error('co-shipped adapter is incompatible');
        }
    }
    return {
        kind: 'NPM',
        installSource: `npm:${adapter.packageName}@${adapter.packageVersion}`,
        packageRoot: null,
    };
}
```

A mismatched co-shipped adapter fails closed; only an absent non-checkout sibling permits npm acquisition.

Add `bootstrap-adapter` to the package inventory assertion.

- [ ] **Step 4: Run focused discovery and package tests**

Run:

```bash
node --test tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS; established discovery fixtures without a bootstrap protocol remain valid for established setup, while strict-empty bootstrap requires protocol `1`.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/discovery.js packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/cli.js packages/prism-php-web/package.json packages/prism-php-web/scripts/prism-tool-adapter.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope setup --subject "validate bootstrap adapter registrations" --refs 383
```

---

### Task 3: Provision and clean exact project-local adapter state

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/bootstrap-adapter.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js`

**Interfaces:**
- Public select command:
  - `prism-tool setup adapter select --adapter=core-only --source=template|blank [--json]`
  - `prism-tool setup adapter select --adapter=php-web --source=template|blank --network-approved=yes [--json]`
- Public cleanup command:
  - `prism-tool setup adapter cleanup --attempt=<uuid> [--json]`
- Produces: `provisionBootstrapAdapter(options) -> BootstrapAdapterReport`.
- Produces: `cleanupBootstrapAdapter({projectRoot, attemptId}) -> BootstrapAdapterReport`.
- Receipt schema: `{schemaVersion, attemptId, projectRoot, phase, source, adapter, acquisition, settings, npmInventory, registration}`.

- [ ] **Step 1: Add failing public provisional-install and cleanup tests**

Add a fixture helper that simulates Pi's documented project-local npm result only when the exact fixed invocation is received:

```javascript
function installFixture({projectRoot, packageName, packageVersion, bootstrapProtocol = 1}) {
    return (command, args, options) => {
        assert.equal(command, '/fixture/bin/pi');
        assert.deepEqual(args, [
            'install',
            `npm:${packageName}@${packageVersion}`,
            '-l',
            '--approve',
        ]);
        assert.equal(options.cwd, fs.realpathSync(projectRoot));
        assert.equal(options.env.npm_config_ignore_scripts, 'true');
        assert.equal(options.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
        writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
            packages: [`npm:${packageName}@${packageVersion}`],
        });
        writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
            name: 'pi-extensions',
            private: true,
            dependencies: {[packageName]: packageVersion},
        });
        writeJson(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), {
            name: 'pi-extensions',
            lockfileVersion: 3,
            packages: {},
        });
        fs.writeFileSync(path.join(projectRoot, '.pi', 'npm', '.gitignore'), '*\n!.gitignore\n');
        writeBootstrapAdapterPackage(
            path.join(projectRoot, '.pi', 'npm', 'node_modules', ...packageName.split('/')),
            {packageName, packageVersion, bootstrapProtocol}
        );
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };
}
```

Add public tests for:

1. exact npm provisioning returns `ADAPTER_PROVISIONED`, exact adapter data, exact acquisition source, a UUID attempt ID, and a regular mode-`0600` receipt;
2. local checkout activation passes the canonical local path to Pi and writes no `.pi/npm` requirement;
3. Core-only performs zero writes/calls;
4. missing `--network-approved=yes`, duplicate controls, arbitrary adapter IDs, package/version/path controls, and invalid source values return usage failure before writes;
5. Pi process failure after partial `.pi/npm` creation triggers cleanup and restores strict emptiness;
6. installed identity/version/protocol/handler/toolchain mismatch triggers cleanup before adapter load;
7. successful explicit cleanup restores strict emptiness;
8. changed settings, changed npm inventory, unexpected root entry, unexpected `.pi` child, or invalid receipt returns `RECOVERY_REQUIRED` and preserves all evidence;
9. established or containing-worktree roots invoke no Pi subprocess;
10. no lifecycle script marker executes.

- [ ] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-adapter.test.js
```

Expected: FAIL because selection does not provision, receipt, validate, or clean project-local package state.

- [ ] **Step 3: Implement bounded receipts, inventory, installation, and cleanup**

Implement these constants and positive validators in `bootstrap-adapter.js`:

```javascript
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECEIPT_SCHEMA_VERSION = 1;
const MAX_RECEIPT_BYTES = 1048576;
const MAX_INVENTORY_ENTRIES = 20000;
const MAX_INVENTORY_BYTES = 268435456;
const INSTALL_TIMEOUT_MS = 300000;
```

Use SHA-256 for regular-file bytes and symlink target text. Inventory accepts directories, regular files, and symlinks whose lexical and resolved targets remain within `.pi/npm`; it rejects special files, escapes, count overflow, and aggregate regular-file bytes above the bound. Sort inventory by relative path before hashing.

Before invoking Pi:

1. revalidate the strict-empty route;
2. load the exact catalogue record;
3. resolve deterministic acquisition;
4. create `.pi/prism-tool/bootstrap/<uuid>/` mode `0700`;
5. write a mode-`0600` receipt with phase `INSTALLING`, canonical root, source, adapter record, acquisition, and null post-install fields;
6. verify root entries are exactly `.pi` and `.pi` entries are exactly `prism-tool` before subprocess execution.

Invoke only:

```javascript
const result = run(piExecutable, ['install', acquisition.installSource, '-l', '--approve'], {
    cwd: canonicalProject,
    env: {
        ...env,
        npm_config_ignore_scripts: 'true',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    },
    maxBuffer: 1048576,
    timeout: INSTALL_TIMEOUT_MS,
});
```

Never use subprocess stdout/stderr as control data. On non-zero, timeout, or process error, run ownership cleanup and return sanitized `INSTALL_FAILED` or `RECOVERY_REQUIRED`.

After success:

1. require root entries to remain exactly `.pi`;
2. require `.pi` entries to be a subset of `settings.json`, `npm`, and `prism-tool`;
3. parse bounded regular `.pi/settings.json` and require exactly one package entry matching Pi's normalized selected source identity;
4. derive the installed package root from acquisition kind, never from settings text;
5. call `registrationFor`, `validateBootstrapRegistration`, then `loadAdapterHandler(registration, 1)`;
6. record settings SHA-256, bounded npm inventory/digest or null for local acquisition, and normalized registration evidence;
7. atomically replace the receipt with phase `PROVISIONED`;
8. return no raw installed manifest, lockfile, subprocess output, or handler object.

Implement cleanup as follows:

1. validate the attempt ID and derive the receipt path beneath the canonical project root;
2. read and validate the receipt as a bounded regular non-symlink file;
3. require the receipt's canonical root and attempt ID to match;
4. require root and `.pi` child allowlists;
5. for `PROVISIONED`, revalidate settings and npm inventory digests before any rename;
6. create `.pi/prism-tool/bootstrap/<attempt>/cleanup/`;
7. atomically rename existing receipt-owned `.pi/settings.json` and `.pi/npm` into the cleanup directory;
8. recheck that `.pi` contains only `prism-tool`; if unexpected state appeared, stop and preserve the quarantined evidence with `RECOVERY_REQUIRED`;
9. recursively remove only the cleanup directory and attempt workspace beneath `.pi/prism-tool`;
10. remove empty `bootstrap`, `prism-tool`, and `.pi` directories using non-recursive `fs.rmdirSync` calls;
11. require the canonical root to be empty before returning `CLEANED`.

If any ownership or continuity check fails before quarantine, delete nothing. If a failure occurs after quarantine, retain the quarantine path in bounded recovery data and delete nothing further.

In `cli.js`, parse only the documented controls. `php-web` requires exactly one `--network-approved=yes`; Core-only forbids network controls. `cleanup` accepts exactly one valid attempt ID. Render closed reports and map GO to exit `0`, operational NO-GO to exit `5`, and malformed controls to exit `2`.

- [ ] **Step 4: Run focused and neighboring regressions**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS; exact install state is validated, failure cleanup restores emptiness, ambiguous state is preserved, and established setup behavior remains green.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-bootstrap-adapter.test.js
prism-tool commit create --type feat --scope setup --subject "provision exact bootstrap adapters" --refs 383
```

---

### Task 4: Add strict-empty adapter selection to `/setup` without a second install question

**Files:**
- Modify: `packages/prism-core/prompts/setup.md`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`

**Interfaces:**
- Consumes: the validated `setup source` report and Task 1 catalogue report.
- Produces: one question selecting Core only, a displayed supported adapter, or Cancel.
- Produces: one exact `setup adapter select` call and no separate strict-empty adapter-installation approval.
- Produces: exact cleanup on decline or unavailable next-stage orchestration.
- Preserves: established-project section 6's existing evidence-driven install question verbatim.

- [ ] **Step 1: Add failing prompt-contract assertions**

Add assertions after the existing strict-empty source assertions:

```bash
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter catalogue --json' 'strict-empty setup loads the closed adapter catalogue'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Core only' 'strict-empty setup offers explicit Core-only selection'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter select --adapter=core-only' 'strict-empty setup selects Core-only through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter select --adapter=php-web' 'strict-empty setup provisions the supported PHP/web adapter by stable ID'
assert_file_contains "$CORE_PROMPTS/setup.md" 'exact displayed package.*version|displayed.*exact package.*version' 'strict-empty setup displays the exact package and version'
assert_file_contains "$CORE_PROMPTS/setup.md" 'No second adapter-installation question|no redundant.*install' 'strict-empty adapter selection is the installation authorization'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup adapter cleanup --attempt=' 'strict-empty setup cleans provisional adapter state on stop'
assert_file_not_contains "$CORE_PROMPTS/setup.md" 'setup adapter select.*--package=|setup adapter select.*--version=|setup adapter select.*--url=' 'strict-empty setup accepts no caller package authority'
```

Add ordering checks proving the source operation precedes adapter catalogue inspection and the strict-empty adapter branch does not fall through to established-project evidence detection.

- [ ] **Step 2: Run the shell contract to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL only on the new strict-empty adapter assertions.

- [ ] **Step 3: Extend the strict-empty prompt branch**

After a validated Template or Blank source report, add this launcher-owned sequence before the current stop guard:

```markdown
Inspect the exact Core-owned choices:

```bash
prism-tool setup adapter catalogue --json
```

Require the closed schema and display Core only plus every exact adapter package
identity, version, and bootstrap protocol. Ask exactly one question:

```text
Select the strict-empty project adapter: Core only, PHP/web, or Cancel?
```

Accept only the stable displayed choice. Cancel is terminal and performs no
package operation. For Core only, run the matching source-mode command:

```bash
prism-tool setup adapter select --adapter=core-only --source=template --json
```

For PHP/web, disclose that selection authorizes provisional project-local
installation of the exact displayed package/version through the bounded setup
network attempt, then run the matching source-mode command:

```bash
prism-tool setup adapter select --adapter=php-web --source=template --network-approved=yes --json
```

Use `--source=blank` when Blank was selected. No second adapter-installation
question is permitted on the strict-empty route. Established projects retain
their existing explicit installation question below.
```

Require exact report keys, dispositions `CORE_ONLY`, `ADAPTER_PROVISIONED`, `STOP`, or `RECOVERY_REQUIRED`, nullable adapter semantics, and a valid attempt UUID only for provisioned adapter state.

Until the next strict-empty project-plan operation exists, immediately clean a provisioned adapter attempt and stop safely. Retain the validated attempt ID as inert context and render it literally:

```bash
prism-tool setup adapter cleanup --attempt=validated-literal-uuid --json
```

Require `CLEANED` and a strict-empty root. If cleanup returns recovery-required state, stop and report its bounded retained path and one manual next action. Later Epic tasks replace this temporary stop with direct handoff to provider composition while retaining the same cleanup contract.

Do not alter established-project sections 1–11 except for heading renumbering if required by Markdown structure.

- [ ] **Step 4: Run prompt and Node regression tests**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-template-source.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

Run:

```bash
npm run test:node
```

Expected: PASS with established setup, package release, commit, review, consent, and toolchain behavior unchanged.

Run:

```bash
npm exec eslint -- packages/prism-core/scripts/prism-tool/cli.js packages/prism-core/scripts/prism-tool/discovery.js packages/prism-core/scripts/prism-tool/supported-adapters.js packages/prism-core/scripts/prism-tool/bootstrap-adapter.js packages/prism-php-web/scripts/prism-tool-adapter.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-discovery.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

- [ ] **Step 5: Self-review the issue acceptance criteria**

Confirm mechanically:

- catalogue schema, IDs, display names, exact package identity/version, and protocol are closed and packaged;
- Core-only returns null adapter identity and invokes no adapter behavior;
- only stable adapter IDs reach selection controls;
- exact local or pinned npm acquisition is deterministic and displayed;
- selected adapter installation has no redundant question;
- lifecycle scripts are disabled;
- installed identity/version/registration/handler/toolchain/protocol are validated before load;
- failure cleanup restores strict emptiness when ownership is proven;
- changed or unexpected state is preserved for manual recovery;
- established-project discovery/install semantics remain unchanged;
- no dependency or lockfile changed.

- [ ] **Step 6: Create the final issue-closing commit**

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/toolchain_entrypoints_test.sh
prism-tool commit create --type feat --scope setup --subject "select strict-empty project adapters" --fixes 383
```

---

## Plan self-review

- **Spec coverage:** Task 1 covers the closed catalogue and explicit Core-only result; Task 2 covers package identity, registration, containment, and protocol compatibility; Task 3 covers exact selection authorization, provisional Pi state, failure cleanup, and manual-recovery preservation; Task 4 covers one-question prompt orchestration and established-project regression behavior.
- **Placeholder scan:** no unresolved placeholder or unnamed implementation step remains. The one temporary safe stop is explicit incremental Epic behavior and is replaced by the next vertical slice.
- **Type consistency:** `AdapterRecord`, `SupportedAdapterCatalogue`, `BootstrapAdapterReport`, attempt IDs, dispositions, and function names remain stable across all tasks.
- **Boundary check:** Core names and validates the adapter package but owns no PHP/web implementation behavior. Pi installation remains a fixed subprocess boundary documented by installed Pi 0.84.2 `docs/packages.md`, `docs/settings.md`, and `docs/usage.md`.
- **Scope boundary:** this plan does not compose providers (#384), apply project files (#385), initialize Git (#386), prepare the PHP/web scaffold (#387), interpret Template capabilities (#388), render optional capabilities (#389–#391), or complete final setup orchestration (#392).

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
