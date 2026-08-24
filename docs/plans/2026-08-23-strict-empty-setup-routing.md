# Strict-Empty Setup Routing Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Add the public Core-owned setup route that safely distinguishes strict-empty roots from established and conflicting project state, then present Template, Blank, and Cancel only on the strict-empty path.

**Architecture:** Keep filesystem evidence in `setup-entry.js`, closed orchestration and report construction in `setup-route.js`, and argument/rendering mechanics in the existing `prism-tool` CLI. `/setup` consumes only the structured launcher report; established-project prose remains unchanged and strict-empty source selection cannot fall through to adapter discovery.

**Tech Stack:** Node.js 22 CommonJS, built-in `node:fs`/`node:path`, `node:test`, Bash prompt-contract tests, Markdown prompt templates.

## Global constraints

- Prism Core remains language-agnostic; add no PHP/web or adapter-specific behavior.
- Add no dependency, external API, network operation, package acquisition, project mutation, or persistent operational write.
- Strict-empty requires a stable canonical directory with zero entries and no existing or containing `.git` worktree marker.
- Non-empty roots and safe existing/containing repository markers route to established setup.
- Unsafe root kinds, unsafe Git markers, unstable snapshots, and indeterminate filesystem state fail closed to `CONFLICT`.
- The only dispositions are `STRICT_EMPTY`, `ESTABLISHED`, and `CONFLICT`.
- The only source choices are `TEMPLATE`, `BLANK`, `CANCEL`, or `null`; Template is the prompt default.
- Cancel routes to `STOP` without template access, package acquisition, adapter discovery, project mutation, or persistent operational writes.
- Existing established-project setup sections and shell-contract assertions must pass unchanged.
- Every new `.js` file carries the required RCS header and final JavaScript vim modeline.
- ADR-0082, ADR-0083, and ADR-0084 already own the architecture; no new ADR or dependency is required.

## Architect review

**Verdict:** GO-WITH-CONDITIONS

**ADR-required:** none

- The change implements ADR-0082's Core-owned pre-discovery strict-empty route and remains within ADR-0058's Core/adapter boundary.
- The launcher-owned closed operation is consistent with ADR-0070 and its prompt commands remain compatible with ADR-0073.
- This slice must not absorb Template acquisition (#382), adapter catalogue/provisional installation (#383), or provider composition (#384).
- The report and prompt must fail closed on unknown schema values and preserve established-project behavior.

## Security boundary

- **Asset:** integrity of the current project root and the guarantee that empty-project bootstrap never activates inside established or ambiguous Git state.
- **Trust boundary:** caller-selected current-directory state, filesystem entry kinds, symlink targets, ancestor `.git` markers, and source-choice controls are untrusted until canonicalized and allowlisted.
- **Abuse case:** a path substitution, unsafe `.git` marker, or changing filesystem snapshot could misroute an established project into bootstrap and expose later tasks to destructive mutation.
- **Fail-closed behavior:** canonicalization, repeated root/Git snapshots, unsafe-kind rejection, exact source allowlists, and closed reports yield `CONFLICT`/`STOP` without network or mutation.

---

### Task 1: Classify canonical setup roots through the public launcher

**Files:**
- Create: `packages/prism-core/scripts/prism-tool/setup-entry.js`
- Create: `packages/prism-core/scripts/prism-tool/setup-route.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js:6-9,271-272`
- Create: `tests/Node/prism-tool-setup-route.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js:106-110`

**Interfaces:**
- Consumes: `context.projectRoot ?? context.cwd ?? process.cwd()` from `prism-tool`.
- Produces: `classifySetupEntry({projectRoot}) -> {projectRoot, disposition, reason}`.
- Produces: `inspectSetupRoute({projectRoot}) -> {schemaVersion, command, status, disposition, source, route, reason, projectRoot, checks}`.
- Produces: public `prism-tool setup route [--json]` with exit `0` for `STRICT_EMPTY`/`ESTABLISHED`, exit `5` for `CONFLICT`, and exit `2` for invalid controls.

- [x] **Step 1: Write the failing public CLI integration tests**

Create `tests/Node/prism-tool-setup-route.test.js`:

```javascript
// $KYAULabs: prism-tool-setup-route.test.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
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

function route(projectRoot, ...controls) {
    return captureWrites(() => main(['setup', 'route', '--json', ...controls], {projectRoot}));
}

test('routes a stable canonical empty root to strict-empty source selection', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = route(projectRoot);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'setup route',
        status: 'GO',
        disposition: 'STRICT_EMPTY',
        source: null,
        route: 'SELECT_SOURCE',
        reason: 'EMPTY_ROOT',
        projectRoot: fs.realpathSync(projectRoot),
        checks: [{
            id: 'setup-entry',
            status: 'PASS',
            message: 'canonical project root is strictly empty',
        }],
    });
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('routes non-empty roots and existing repositories to established setup', (t) => {
    const nonEmptyRoot = makeTempDir();
    const repositoryRoot = makeTempDir();
    t.after(() => fs.rmSync(nonEmptyRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(repositoryRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(nonEmptyRoot, 'README.md'), '# project\n');
    fs.mkdirSync(path.join(repositoryRoot, '.git'));

    const nonEmpty = JSON.parse(route(nonEmptyRoot).stdout);
    const repository = JSON.parse(route(repositoryRoot).stdout);

    assert.equal(nonEmpty.disposition, 'ESTABLISHED');
    assert.equal(nonEmpty.route, 'ESTABLISHED_SETUP');
    assert.equal(nonEmpty.reason, 'NON_EMPTY_ROOT');
    assert.equal(repository.disposition, 'ESTABLISHED');
    assert.equal(repository.route, 'ESTABLISHED_SETUP');
    assert.equal(repository.reason, 'EXISTING_REPOSITORY');
});

test('routes an empty directory inside a containing worktree to established setup', (t) => {
    const repositoryRoot = makeTempDir();
    const projectRoot = path.join(repositoryRoot, 'empty-child');
    t.after(() => fs.rmSync(repositoryRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(repositoryRoot, '.git'));
    fs.mkdirSync(projectRoot);

    const result = route(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ESTABLISHED');
    assert.equal(report.route, 'ESTABLISHED_SETUP');
    assert.equal(report.reason, 'CONTAINING_WORKTREE');
});

test('fails closed for unsafe root and Git path kinds', (t) => {
    const parent = makeTempDir();
    const fileRoot = path.join(parent, 'project-file');
    const symlinkRoot = path.join(parent, 'symlink-project');
    const missingRoot = path.join(parent, 'missing-project');
    const gitTarget = path.join(parent, 'git-target');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    fs.writeFileSync(fileRoot, 'not a directory\n');
    fs.mkdirSync(symlinkRoot);
    fs.mkdirSync(gitTarget);
    fs.symlinkSync(gitTarget, path.join(symlinkRoot, '.git'), 'dir');

    const unsafeRoot = route(fileRoot);
    const unsafeGit = route(symlinkRoot);
    const indeterminate = route(missingRoot);

    assert.equal(unsafeRoot.status, 5);
    assert.equal(JSON.parse(unsafeRoot.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(unsafeRoot.stdout).reason, 'UNSAFE_ROOT');
    assert.equal(unsafeGit.status, 5);
    assert.equal(JSON.parse(unsafeGit.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(unsafeGit.stdout).reason, 'UNSAFE_GIT_STATE');
    assert.equal(indeterminate.status, 5);
    assert.equal(JSON.parse(indeterminate.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(indeterminate.stdout).reason, 'INDETERMINATE');
});

test('rejects unsupported setup route controls', () => {
    const result = captureWrites(() => main(['setup', 'route', '--unknown'], {projectRoot: process.cwd()}));

    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /usage: prism-tool setup route/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

In `tests/Node/toolchain-packaging.test.js`, extend the Core launcher-module inventory assertion to include the two new public modules:

```javascript
    for (const module of [
        'cli', 'code-review', 'commit', 'consent', 'contract', 'discovery',
        'preflight', 'process', 'review-chain', 'setup-entry', 'setup-route',
    ]) {
        assert.equal(packed.files.has(`scripts/prism-tool/${module}.js`), true, module);
    }
```

- [x] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because `prism-tool setup route` and the two packaged setup-routing modules do not exist.

- [x] **Step 3: Implement stable filesystem classification and the initial closed report**

Create `packages/prism-core/scripts/prism-tool/setup-entry.js`:

```javascript
// $KYAULabs: setup-entry.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DISPOSITION = Object.freeze({
    STRICT_EMPTY: 'STRICT_EMPTY',
    ESTABLISHED: 'ESTABLISHED',
    CONFLICT: 'CONFLICT',
});

const REASON = Object.freeze({
    EMPTY_ROOT: 'EMPTY_ROOT',
    NON_EMPTY_ROOT: 'NON_EMPTY_ROOT',
    EXISTING_REPOSITORY: 'EXISTING_REPOSITORY',
    CONTAINING_WORKTREE: 'CONTAINING_WORKTREE',
    UNSAFE_ROOT: 'UNSAFE_ROOT',
    UNSAFE_GIT_STATE: 'UNSAFE_GIT_STATE',
    INDETERMINATE: 'INDETERMINATE',
    SOURCE_REQUIRES_STRICT_EMPTY: 'SOURCE_REQUIRES_STRICT_EMPTY',
});

function entryKind(entry) {
    if (entry.isFile()) return 'file';
    if (entry.isDirectory()) return 'directory';
    if (entry.isSymbolicLink()) return 'symlink';
    if (entry.isBlockDevice()) return 'block';
    if (entry.isCharacterDevice()) return 'character';
    if (entry.isFIFO()) return 'fifo';
    if (entry.isSocket()) return 'socket';
    return 'unknown';
}

function snapshotEntries(projectRoot) {
    return fs.readdirSync(projectRoot, {withFileTypes: true})
        .map((entry) => `${entry.name}\0${entryKind(entry)}`)
        .sort();
}

function sameEntries(left, right) {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function inspectGitBoundary(projectRoot) {
    let current = projectRoot;
    while (true) {
        const gitPath = path.join(current, '.git');
        let identity;
        try {
            identity = fs.lstatSync(gitPath);
        } catch (error) {
            if (error?.code !== 'ENOENT') return {kind: 'CONFLICT'};
            const parent = path.dirname(current);
            if (parent === current) return {kind: 'ABSENT'};
            current = parent;
            continue;
        }
        if (identity.isSymbolicLink() || (!identity.isDirectory() && !identity.isFile())) {
            return {kind: 'CONFLICT'};
        }
        return {
            kind: current === projectRoot ? 'EXISTING' : 'CONTAINING',
            path: gitPath,
            dev: identity.dev,
            ino: identity.ino,
            mode: identity.mode,
        };
    }
}

function sameGitBoundary(left, right) {
    return left.kind === right.kind &&
        left.path === right.path &&
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.mode === right.mode;
}

function conflict(projectRoot, reason) {
    return {projectRoot, disposition: DISPOSITION.CONFLICT, reason};
}

function classifySetupEntry({projectRoot}) {
    const lexicalRoot = path.resolve(projectRoot);
    let canonicalRoot;
    try {
        canonicalRoot = fs.realpathSync(lexicalRoot);
        const before = fs.lstatSync(canonicalRoot);
        if (!before.isDirectory()) return conflict(canonicalRoot, REASON.UNSAFE_ROOT);
        const firstEntries = snapshotEntries(canonicalRoot);
        const firstGitBoundary = inspectGitBoundary(canonicalRoot);
        const secondGitBoundary = inspectGitBoundary(canonicalRoot);
        const secondEntries = snapshotEntries(canonicalRoot);
        const after = fs.lstatSync(canonicalRoot);
        if (
            !sameIdentity(before, after) ||
            !sameEntries(firstEntries, secondEntries) ||
            !sameGitBoundary(firstGitBoundary, secondGitBoundary)
        ) {
            return conflict(canonicalRoot, REASON.INDETERMINATE);
        }
        if (firstGitBoundary.kind === 'CONFLICT') {
            return conflict(canonicalRoot, REASON.UNSAFE_GIT_STATE);
        }
        if (firstGitBoundary.kind === 'EXISTING') {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.EXISTING_REPOSITORY,
            };
        }
        if (firstGitBoundary.kind === 'CONTAINING') {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.CONTAINING_WORKTREE,
            };
        }
        if (firstEntries.length > 0) {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.NON_EMPTY_ROOT,
            };
        }
        return {
            projectRoot: canonicalRoot,
            disposition: DISPOSITION.STRICT_EMPTY,
            reason: REASON.EMPTY_ROOT,
        };
    } catch {
        return conflict(canonicalRoot ?? lexicalRoot, REASON.INDETERMINATE);
    }
}

module.exports = {DISPOSITION, REASON, classifySetupEntry};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Create `packages/prism-core/scripts/prism-tool/setup-route.js`:

```javascript
// $KYAULabs: setup-route.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const {DISPOSITION, classifySetupEntry} = require('./setup-entry');

const ROUTE = Object.freeze({
    SELECT_SOURCE: 'SELECT_SOURCE',
    ESTABLISHED_SETUP: 'ESTABLISHED_SETUP',
    STOP: 'STOP',
});

const MESSAGES = Object.freeze({
    EMPTY_ROOT: 'canonical project root is strictly empty',
    NON_EMPTY_ROOT: 'canonical project root contains established project entries',
    EXISTING_REPOSITORY: 'canonical project root contains existing repository state',
    CONTAINING_WORKTREE: 'canonical project root belongs to a containing worktree',
    UNSAFE_ROOT: 'project root path kind is unsafe',
    UNSAFE_GIT_STATE: 'Git state path kind is unsafe',
    INDETERMINATE: 'project root state is indeterminate',
});

function inspectSetupRoute({projectRoot}) {
    const entry = classifySetupEntry({projectRoot});
    const conflict = entry.disposition === DISPOSITION.CONFLICT;
    const route = entry.disposition === DISPOSITION.STRICT_EMPTY
        ? ROUTE.SELECT_SOURCE
        : entry.disposition === DISPOSITION.ESTABLISHED
            ? ROUTE.ESTABLISHED_SETUP
            : ROUTE.STOP;
    return {
        schemaVersion: 1,
        command: 'setup route',
        status: conflict ? 'NO-GO' : 'GO',
        disposition: entry.disposition,
        source: null,
        route,
        reason: entry.reason,
        projectRoot: entry.projectRoot,
        checks: [{
            id: 'setup-entry',
            status: conflict ? 'FAIL' : 'PASS',
            message: MESSAGES[entry.reason],
        }],
    };
}

module.exports = {ROUTE, inspectSetupRoute};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

In `packages/prism-core/scripts/prism-tool/cli.js`, add the import beside the existing discovery import:

```javascript
const {discoverAdapter, loadAdapterHandler} = require('./discovery');
const {inspectSetupRoute} = require('./setup-route');
```

Add this as the first branch in `setup(args, context)`:

```javascript
function setup(args, context) {
    if (args[0] === 'route') {
        const controls = args.slice(1);
        const jsonCount = controls.filter((argument) => argument === '--json').length;
        if (jsonCount > 1 || controls.some((argument) => argument !== '--json')) {
            process.stderr.write('usage: prism-tool setup route [--json]\n');
            return EXIT.USAGE;
        }
        const report = inspectSetupRoute({
            projectRoot: context.projectRoot ?? context.cwd ?? process.cwd(),
        });
        if (jsonCount === 1) process.stdout.write(`${JSON.stringify(report)}\n`);
        else {
            for (const check of report.checks) {
                process.stdout.write(`${check.id}\t${check.status}\t${check.message}\n`);
            }
            process.stdout.write(`disposition\t${report.disposition}\n`);
            process.stdout.write(`route\t${report.route}\n`);
            process.stdout.write(`${report.status}\n`);
        }
        return report.status === 'GO' ? EXIT.OK : EXIT.TRANSACTION;
    }
```

Keep every existing `verify`, `apply`, `resolve`, and `inspect` branch below this insertion unchanged.

- [x] **Step 4: Run focused and neighboring Node tests**

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-resolve.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS; established setup inspect/resolve behavior remains green and both setup-routing modules are packaged.

- [x] **Step 5: Commit the classifier slice**

Stage only:

```bash
git add packages/prism-core/scripts/prism-tool/setup-entry.js packages/prism-core/scripts/prism-tool/setup-route.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-setup-route.test.js tests/Node/toolchain-packaging.test.js
```

Then load `conventional-commits` and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type feat --scope setup --subject "classify setup entry roots" --refs 381
```

---

### Task 2: Validate strict-empty source selection and make Cancel terminal

**Files:**
- Modify: `packages/prism-core/scripts/prism-tool/setup-route.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js:272-300`
- Modify: `tests/Node/prism-tool-setup-route.test.js`

**Interfaces:**
- Consumes: Task 1 `classifySetupEntry({projectRoot})` and its closed dispositions/reasons.
- Produces: `SOURCE = {TEMPLATE, BLANK, CANCEL}` and routes `BOOTSTRAP_TEMPLATE`, `BOOTSTRAP_BLANK`, `STOP`.
- Produces: public `prism-tool setup route --source=template|blank|cancel [--json]`.
- Preserves: the same schema keys for classification-only and source-selected reports.

- [ ] **Step 1: Add failing route-selection and Cancel tests**

Append before the modeline in `tests/Node/prism-tool-setup-route.test.js`:

```javascript
test('returns closed Template and Blank bootstrap routes only for strict-empty roots', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const template = route(projectRoot, '--source=template');
    const blank = route(projectRoot, '--source=blank');

    assert.equal(template.status, 0);
    assert.equal(JSON.parse(template.stdout).disposition, 'STRICT_EMPTY');
    assert.equal(JSON.parse(template.stdout).source, 'TEMPLATE');
    assert.equal(JSON.parse(template.stdout).route, 'BOOTSTRAP_TEMPLATE');
    assert.equal(blank.status, 0);
    assert.equal(JSON.parse(blank.stdout).source, 'BLANK');
    assert.equal(JSON.parse(blank.stdout).route, 'BOOTSTRAP_BLANK');
});

test('Cancel is terminal and leaves the strict-empty root untouched', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    let externalEffects = 0;

    const result = captureWrites(() => main(
        ['setup', 'route', '--source=cancel', '--json'],
        {projectRoot, run: () => { externalEffects += 1; }}
    ));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'STRICT_EMPTY');
    assert.equal(report.source, 'CANCEL');
    assert.equal(report.route, 'STOP');
    assert.equal(externalEffects, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('fails closed when a source is supplied for an established root', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# project\n');

    const result = route(projectRoot, '--source=template');
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'CONFLICT');
    assert.equal(report.source, null);
    assert.equal(report.route, 'STOP');
    assert.equal(report.reason, 'SOURCE_REQUIRES_STRICT_EMPTY');
});

test('rejects unknown or duplicate source controls', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    for (const controls of [
        ['--source=unknown'],
        ['--source=template', '--source=blank'],
    ]) {
        const result = route(projectRoot, ...controls);
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /--source=template\|blank\|cancel/);
    }
});
```

- [ ] **Step 2: Run the focused test to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js
```

Expected: FAIL because source controls are rejected and the bootstrap routes do not exist.

- [ ] **Step 3: Implement closed source routing**

Replace `packages/prism-core/scripts/prism-tool/setup-route.js` with:

```javascript
// $KYAULabs: setup-route.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const {DISPOSITION, REASON, classifySetupEntry} = require('./setup-entry');

const SOURCE = Object.freeze({
    TEMPLATE: 'TEMPLATE',
    BLANK: 'BLANK',
    CANCEL: 'CANCEL',
});

const ROUTE = Object.freeze({
    SELECT_SOURCE: 'SELECT_SOURCE',
    BOOTSTRAP_TEMPLATE: 'BOOTSTRAP_TEMPLATE',
    BOOTSTRAP_BLANK: 'BOOTSTRAP_BLANK',
    ESTABLISHED_SETUP: 'ESTABLISHED_SETUP',
    STOP: 'STOP',
});

const MESSAGES = Object.freeze({
    EMPTY_ROOT: 'canonical project root is strictly empty',
    NON_EMPTY_ROOT: 'canonical project root contains established project entries',
    EXISTING_REPOSITORY: 'canonical project root contains existing repository state',
    CONTAINING_WORKTREE: 'canonical project root belongs to a containing worktree',
    UNSAFE_ROOT: 'project root path kind is unsafe',
    UNSAFE_GIT_STATE: 'Git state path kind is unsafe',
    INDETERMINATE: 'project root state is indeterminate',
    SOURCE_REQUIRES_STRICT_EMPTY: 'empty-project source selection requires a strict-empty root',
});

function routeFor(source) {
    if (source === null) return ROUTE.SELECT_SOURCE;
    if (source === SOURCE.TEMPLATE) return ROUTE.BOOTSTRAP_TEMPLATE;
    if (source === SOURCE.BLANK) return ROUTE.BOOTSTRAP_BLANK;
    return ROUTE.STOP;
}

function report(entry, source, route) {
    const conflict = entry.disposition === DISPOSITION.CONFLICT;
    return {
        schemaVersion: 1,
        command: 'setup route',
        status: conflict ? 'NO-GO' : 'GO',
        disposition: entry.disposition,
        source,
        route,
        reason: entry.reason,
        projectRoot: entry.projectRoot,
        checks: [{
            id: 'setup-entry',
            status: conflict ? 'FAIL' : 'PASS',
            message: MESSAGES[entry.reason],
        }],
    };
}

function inspectSetupRoute({projectRoot, source = null}) {
    if (source !== null && !Object.values(SOURCE).includes(source)) {
        throw new Error('setup source is invalid');
    }
    const entry = classifySetupEntry({projectRoot});
    if (entry.disposition === DISPOSITION.CONFLICT) return report(entry, null, ROUTE.STOP);
    if (entry.disposition === DISPOSITION.ESTABLISHED) {
        if (source === null) return report(entry, null, ROUTE.ESTABLISHED_SETUP);
        return report({
            ...entry,
            disposition: DISPOSITION.CONFLICT,
            reason: REASON.SOURCE_REQUIRES_STRICT_EMPTY,
        }, null, ROUTE.STOP);
    }
    return report(entry, source, routeFor(source));
}

module.exports = {ROUTE, SOURCE, inspectSetupRoute};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
```

Replace the Task 1 `if (args[0] === 'route')` block in `packages/prism-core/scripts/prism-tool/cli.js` with:

```javascript
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
```

- [ ] **Step 4: Run the complete route regression set**

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-resolve.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS; Cancel causes zero injected process calls and zero filesystem changes.

- [ ] **Step 5: Commit source-selection routing**

Stage only:

```bash
git add packages/prism-core/scripts/prism-tool/setup-entry.js packages/prism-core/scripts/prism-tool/setup-route.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-setup-route.test.js
```

Then load `conventional-commits` and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type feat --scope setup --subject "route strict-empty source choices" --refs 381
```

---

### Task 3: Put launcher-owned routing ahead of the established `/setup` flow

**Files:**
- Modify: `packages/prism-core/prompts/setup.md:5-17`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh:44-56`

**Interfaces:**
- Consumes: Task 2's exact schema, dispositions, source values, and routes.
- Produces: Template as the recommended default, Blank, and Cancel only after a `STRICT_EMPTY`/`SELECT_SOURCE` report.
- Preserves: the existing `## 1. Pre-flight` through `## 11. Validate and report` established-project text and command order.

- [ ] **Step 1: Add failing prompt-contract assertions**

Insert these assertions after the existing `/setup standing consent and apply/verify sequence` assertions in `tests/Shell/toolchain_entrypoints_test.sh`:

```bash
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --json' 'setup classifies the canonical root before established setup'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Template.*recommended default|recommended default.*Template' 'strict-empty setup recommends Template by default'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Blank' 'strict-empty setup offers Blank'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Cancel' 'strict-empty setup offers Cancel'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=template --json' 'setup validates Template routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=blank --json' 'setup validates Blank routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'prism-tool setup route --source=cancel --json' 'setup validates Cancel routing through the launcher'
assert_file_contains "$CORE_PROMPTS/setup.md" 'unknown.*schema|unknown.*disposition|fail closed' 'setup fails closed on unknown route reports'
assert_file_contains "$CORE_PROMPTS/setup.md" 'Cancel.*no template access|Cancel.*template access.*package acquisition.*project mutation' 'Cancel forbids bootstrap effects'

setup_route_line=$({ grep -niF 'prism-tool setup route --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_release_line=$({ grep -niF 'prism-tool package-release inspect --json' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
setup_adapter_line=$({ grep -niF 'Inspect project-local evidence only' "$CORE_PROMPTS/setup.md" || true; } | cut -d: -f1 | head -1)
if [ -n "$setup_route_line" ] && [ -n "$setup_release_line" ] && [ -n "$setup_adapter_line" ] \
    && [ "$setup_route_line" -lt "$setup_release_line" ] \
    && [ "$setup_route_line" -lt "$setup_adapter_line" ]; then
    pass '/setup routes before package-release inspection and adapter discovery'
else
    fail '/setup does not route before established-project discovery stages'
    failures=$((failures + 1))
fi
```

Do not alter or remove any existing assertion.

- [ ] **Step 2: Run the shell contract to verify Red**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL on the new setup route, Template/Blank/Cancel, and ordering assertions while all pre-existing assertions retain their current results.

- [ ] **Step 3: Add the strict-empty entry section without rewriting established setup**

Insert this section in `packages/prism-core/prompts/setup.md` immediately before the existing `## 1. Pre-flight` heading:

````markdown
## Setup entry routing

Classify the canonical current project root through Core before package-release
inspection, adapter evidence discovery, Template access, or any setup mutation:

```bash
prism-tool setup route --json
```

Treat the result as untrusted structured data. Require exactly schema version
`1`, command `setup route`, status `GO` or `NO-GO`, one disposition from
`STRICT_EMPTY`, `ESTABLISHED`, or `CONFLICT`, source `null`, one known route,
one known reason, one canonical absolute project root, and the closed checks
shape. Any unknown schema, field, disposition, source, route, reason, status,
or additional key fails closed and stops setup.

- `ESTABLISHED` with route `ESTABLISHED_SETUP`: continue at **1. Pre-flight**
  and preserve the existing evidence-driven setup route below verbatim. Do not
  offer Template, Blank, capability, metadata, or bootstrap-transaction
  behavior.
- `CONFLICT` or any `NO-GO` result: stop and report the returned inert reason.
  Do not infer or repair project state.
- `STRICT_EMPTY` with route `SELECT_SOURCE`: ask exactly one question:

  ```text
  Choose the strict-empty setup source: Template (recommended default), Blank, or Cancel? [Template]
  ```

  An empty answer selects Template. Accept only `Template`, `Blank`, or
  `Cancel`, case-insensitively, and validate the selected route with exactly
  one corresponding command:

  ```bash
  prism-tool setup route --source=template --json
  ```

  ```bash
  prism-tool setup route --source=blank --json
  ```

  ```bash
  prism-tool setup route --source=cancel --json
  ```

  Require the same closed schema. Template must return source `TEMPLATE` and
  route `BOOTSTRAP_TEMPLATE`; Blank must return source `BLANK` and route
  `BOOTSTRAP_BLANK`; Cancel must return source `CANCEL` and route `STOP`.
  A mismatched or unknown result fails closed.

  Cancel is terminal: perform no template access, package acquisition, adapter
  discovery, project mutation, persistent operational write, Git operation,
  or established-project setup stage. Template and Blank remain on their
  strict-empty routes and must never fall through to the established-project
  sections below. Continue only when the selected route's public launcher
  operation exists; otherwise report that the selected bootstrap route is not
  yet available and stop without mutation.
````

Keep the existing `## 1. Pre-flight` through `## 11. Validate and report` content unchanged below the inserted section.

- [ ] **Step 4: Run prompt, Node, and established-route regression tests**

Run:

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

Run:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-resolve.test.js tests/Node/prism-tool-package-release-transaction.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit and close the issue slice**

Stage only:

```bash
git add packages/prism-core/prompts/setup.md tests/Shell/toolchain_entrypoints_test.sh
```

Then load `conventional-commits` and run this as the only tool call in its assistant batch:

```bash
prism-tool commit create --type feat --scope setup --subject "present strict-empty setup routes" --fixes 381
```

---

## Plan verification

After all three tasks, run the focused issue gate:

```bash
node --test tests/Node/prism-tool-setup-route.test.js tests/Node/prism-tool-discovery.test.js tests/Node/prism-tool-resolve.test.js tests/Node/toolchain-packaging.test.js tests/Node/prism-tool-package-release-transaction.test.js
```

```bash
bash tests/Shell/toolchain_entrypoints_test.sh
```

Then load `verification-before-completion`, confirm no debug artifacts or unexpected project-root writes remain, and proceed into the approved finishing workflow. The complete project `/check` remains mandatory before declaring the branch ready.
