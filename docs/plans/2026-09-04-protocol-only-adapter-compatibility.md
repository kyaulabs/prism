# Protocol-Only Adapter Compatibility Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Remove Core compatibility ranges from Prism release and catalogue contracts, select adapters by bootstrap protocol, and deploy the canonical separate back-merge workflow.

**Architecture:** Advance the managed release configuration to schema 3 and the signed catalogue payload to schema 2, keeping every schema closed and fail-closed. Core emits and consumes protocol-only evidence; the separately owned downstream publisher must be prepared from the approved spec before v0.5.1 is released.

**Tech Stack:** Node.js 22, CommonJS, GitHub Actions YAML, Bash, jq, Node test runner, SemVer 7

**Originating issue:** none

## Global constraints

- Follow `docs/specs/2026-09-04-protocol-only-adapter-compatibility-spec.md` and ADR-0104.
- Do not prepare or merge release v0.5.1 until the downstream `kyaulabs/prism-adapters` migration is merged to its default branch.
- `bootstrapProtocol` is the sole active compatibility discriminator; active Prism schemas must reject `coreRange` as an extra field.
- Core selects the highest ACTIVE stable release with the exact supported bootstrap protocol and fails when none exists.
- Preserve signature, expiry, sequence, cache, integrity, exact package pinning, no-follow file handling, and human-only publication boundaries.
- Keep `.github/workflows/release.yml` byte-identical to `packages/prism-core/config/release.yml`.
- Keep `.github/workflows/back-merge.yml` byte-identical to `packages/prism-core/config/automation/back-merge.yml`.
- Add no dependency and no test/provider injection control.
- Do not alter historical ADR decision bodies; only accepted-status supersession metadata may change.
- Every JavaScript and shell source file retains its RCS header and vim modeline.
- No PHP source changes are expected; PHP changed-file coverage is therefore N/A.

---

### Task 1: Migrate managed release declarations to protocol-only schema 3

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/package-release.js:10-350,450-475`
- Modify: `tests/Node/prism-tool-package-release-discovery.test.js:20-40,237-358,400-450`
- Modify: `tests/Node/prism-tool-package-release-transaction.test.js:45-230`
- Modify: `.prism/release.json:1-18`

**Interfaces:**

- Consumes: existing `loadReleaseConfiguration({projectRoot, allowLegacy})`, `renderManagedConfiguration(candidates, adapterReleases)`, and package-manifest `prism.bootstrapProtocol` metadata.
- Produces: `RELEASE_SCHEMA_VERSION === 3`; managed declarations with exact keys `bootstrapProtocol,displayName,id,package,status`; one-way schema-2 migration that returns the same protocol-only declaration shape.

- [ ] **Step 1: Write the failing package-release tests**

Replace the managed rendering/loading cases with schema 3 and add explicit schema-2 migration and removed-field rejection cases:

```javascript
test('renders schema three with protocol-only adapter release fields', () => {
    const declaration = {
        package: 'packages/adapter',
        id: 'fixture-adapter',
        displayName: 'Fixture adapter',
        bootstrapProtocol: 1,
        status: 'ACTIVE',
    };

    assert.equal(renderManagedConfiguration([
        {name: '@fixture/adapter', path: 'packages/adapter', version: '1.2.3'},
    ], [declaration]), `${JSON.stringify({
        schemaVersion: 3,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['packages/adapter'],
        adapterReleases: [declaration],
    }, null, 2)}\n`);
});

test('migrates schema two declarations by dropping the Core range', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
        private: true,
        workspaces: ['packages/*'],
    });
    writePackageJson(projectRoot, 'packages/adapter', {
        name: '@fixture/adapter',
        version: '1.2.3',
        prism: {adapter: true, bootstrapProtocol: 1},
    });
    writeJson(path.join(projectRoot, '.prism', 'release.json'), {
        schemaVersion: 2,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['packages/adapter'],
        adapterReleases: [{
            package: 'packages/adapter',
            id: 'fixture-adapter',
            displayName: 'Fixture adapter',
            coreRange: '>=1.2.3 <2.0.0',
            bootstrapProtocol: 1,
            status: 'ACTIVE',
        }],
    });

    assert.deepEqual(loadReleaseConfiguration({projectRoot, allowLegacy: true}), {
        kind: 'LEGACY',
        packages: ['packages/adapter'],
        adapterReleases: [{
            package: 'packages/adapter',
            id: 'fixture-adapter',
            displayName: 'Fixture adapter',
            bootstrapProtocol: 1,
            status: 'ACTIVE',
        }],
    });
    assert.throws(
        () => loadReleaseConfiguration({projectRoot}),
        /release configuration schema is invalid/
    );
});

test('rejects coreRange in a schema three declaration', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.2.3',
        private: true,
        workspaces: ['packages/*'],
    });
    writePackageJson(projectRoot, 'packages/adapter', {
        name: '@fixture/adapter',
        version: '1.2.3',
        prism: {adapter: true, bootstrapProtocol: 1},
    });
    writeJson(path.join(projectRoot, '.prism', 'release.json'), {
        schemaVersion: 3,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['packages/adapter'],
        adapterReleases: [{
            package: 'packages/adapter',
            id: 'fixture-adapter',
            displayName: 'Fixture adapter',
            bootstrapProtocol: 1,
            status: 'ACTIVE',
            coreRange: '>=1.2.3 <2.0.0',
        }],
    });

    assert.throws(
        () => loadReleaseConfiguration({projectRoot}),
        /adapter release declarations are invalid/
    );
});
```

Update transaction fixtures to expect schema 3 and verify that a planned migration from schema 2 preserves the adapter declaration while removing only `coreRange`.

- [ ] **Step 2: Run the focused tests to verify Red**

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js`

Expected: FAIL because managed rendering still emits schema 2, schema 3 is unsupported, and schema-2 migration does not preserve declarations.

- [ ] **Step 3: Implement schema 3 and one-way schema-2 migration**

Use these constants and validation functions:

```javascript
const RELEASE_SCHEMA_VERSION = 3;
const LEGACY_RELEASE_SCHEMA_VERSION = 2;

function validateAdapterReleases({projectRoot, records, value, legacy = false}) {
    if (!Array.isArray(value) || value.length > 64) {
        throw new Error('adapter release declarations are invalid');
    }
    const packages = new Map(records.map((record) => [record.path, record]));
    const declaredPackages = new Set();
    const identifiers = new Set();
    const expectedKeys = legacy
        ? 'bootstrapProtocol,coreRange,displayName,id,package,status'
        : 'bootstrapProtocol,displayName,id,package,status';
    return value.map((entry) => {
        if (
            entry === null ||
            typeof entry !== 'object' ||
            Array.isArray(entry) ||
            Object.keys(entry).sort().join(',') !== expectedKeys ||
            !packages.has(entry.package) ||
            declaredPackages.has(entry.package) ||
            typeof entry.id !== 'string' ||
            !ADAPTER_ID.test(entry.id) ||
            identifiers.has(entry.id) ||
            typeof entry.displayName !== 'string' ||
            entry.displayName.length === 0 ||
            entry.displayName.length > 120 ||
            entry.displayName !== entry.displayName.trim() ||
            hasControl(entry.displayName) ||
            (legacy && (
                typeof entry.coreRange !== 'string' ||
                semver.validRange(entry.coreRange) !== entry.coreRange
            )) ||
            !Number.isSafeInteger(entry.bootstrapProtocol) ||
            entry.bootstrapProtocol <= 0 ||
            !['ACTIVE', 'REVOKED'].includes(entry.status)
        ) {
            throw new Error('adapter release declarations are invalid');
        }
        const packageRecordWithAdapter = packageRecord(
            fs.realpathSync(projectRoot),
            entry.package,
            true,
            true
        );
        if (
            packageRecordWithAdapter.adapter === null ||
            packageRecordWithAdapter.adapter.bootstrapProtocol !== entry.bootstrapProtocol
        ) {
            throw new Error('adapter release declarations are invalid');
        }
        declaredPackages.add(entry.package);
        identifiers.add(entry.id);
        return {
            package: entry.package,
            id: entry.id,
            displayName: entry.displayName,
            bootstrapProtocol: entry.bootstrapProtocol,
            status: entry.status,
        };
    });
}
```

Classify the closed root shapes before validation:

```javascript
const managedRoot =
    keys.join(',') === 'adapterReleases,managedBy,packages,schemaVersion,versionPolicy' &&
    value.managedBy === MANAGED_BY &&
    value.versionPolicy === 'lockstep';
let legacyDeclarations = false;
if (managedRoot && value.schemaVersion === RELEASE_SCHEMA_VERSION) {
    kind = 'MANAGED';
} else if (allowLegacy && managedRoot && value.schemaVersion === LEGACY_RELEASE_SCHEMA_VERSION) {
    kind = 'LEGACY';
    legacyDeclarations = true;
} else if (
    allowLegacy &&
    keys.join(',') === 'managedBy,packages,schemaVersion,versionPolicy' &&
    value.schemaVersion === 1 &&
    value.managedBy === MANAGED_BY &&
    value.versionPolicy === 'lockstep'
) {
    kind = 'LEGACY';
} else if (allowLegacy && keys.join(',') === 'packages') {
    kind = 'LEGACY';
} else {
    throw new Error('release configuration schema is invalid');
}
const records = validateConfiguredPackages({projectRoot, packagePaths: value.packages});
if (kind === 'MANAGED' || legacyDeclarations) {
    adapterReleases = validateAdapterReleases({
        projectRoot,
        records,
        value: value.adapterReleases,
        legacy: legacyDeclarations,
    });
}
```

In `inspectReleaseCapability()`, return `configuration.adapterReleases` for `MIGRATE` instead of replacing it with an empty array. Change `.prism/release.json` to schema 3 and remove its `coreRange` member.

- [ ] **Step 4: Run the focused tests to verify Green**

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js`

Expected: PASS; schema 3 is canonical, schema 2 is migration-only, the declaration survives migration without a range, and schema 3 rejects the removed field.

- [ ] **Step 5: Create the commit**

```bash
git add .prism/release.json packages/prism-core/scripts/prism-tool/package-release.js tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js
prism-tool commit create --type fix --scope release --subject "remove Core ranges from adapter declarations" --refs 506
```

---

### Task 2: Emit protocol-only release evidence from the canonical workflow

**Files:**

- Modify: `packages/prism-core/config/release.yml:1-4,185-380`
- Modify: `.github/workflows/release.yml:1-4,185-380`
- Modify: `tests/Shell/release_workflow_test.sh:45-100,700-875,1650-1690`
- Modify: `packages/prism-core/scripts/prism-tool/package-release.js:15-25`
- Modify: `packages/prism-core/prompts/release.md:230-310`

**Interfaces:**

- Consumes: managed schema-3 release configuration and exact lockstep package manifests.
- Produces: workflow schema marker 4 and bounded local adapter-release evidence schema 2 with exact keys `bootstrapProtocol,displayName,id,package,packageName,status,version`.

- [ ] **Step 1: Change executable workflow tests to the no-range contract**

Set `CANONICAL_BACK_MERGE_FILE` only in Task 4; this task changes release assertions as follows:

```bash
if [ -f "$CANONICAL_RELEASE_FILE" ] && \
   cmp -s "$RELEASE_FILE" "$CANONICAL_RELEASE_FILE" && \
   head -5 "$RELEASE_FILE" | grep -qF '# prism-managed: @kyaulabs/prism-core' && \
   head -5 "$RELEASE_FILE" | grep -qF '# prism-release-schema: 4'; then
    pass "installed workflow is ownership-marked and byte-identical to the Core template"
else
    fail "installed workflow is not ownership-marked or differs from the Core template"
fi
```

Use this exact managed declaration in the repository and executable fixtures:

```json
{
  "schemaVersion": 3,
  "managedBy": "@kyaulabs/prism-core",
  "versionPolicy": "lockstep",
  "packages": ["packages/example"],
  "adapterReleases": [{
    "package": "packages/example",
    "id": "fixture-adapter",
    "displayName": "Fixture adapter",
    "bootstrapProtocol": 1,
    "status": "ACTIVE"
  }]
}
```

Assert the generated evidence exactly:

```javascript
{
    schemaVersion: 2,
    releaseVersion: '1.2.3',
    adapterReleases: [{
        package: 'packages/example',
        id: 'fixture-adapter',
        displayName: 'Fixture adapter',
        packageName: '@fixture/example',
        version: '1.2.3',
        bootstrapProtocol: 1,
        status: 'ACTIVE',
    }],
}
```

Replace the malformed-range rejection with a removed-field rejection:

```bash
reject_adapter_declaration "removed-core-range" '.adapterReleases[0].coreRange = ">=1.2.3 <2.0.0"'
```

The release-command documentation contract must require schema 3 and the five declaration fields, and must prohibit `coreRange` rather than instructing the agent to author it.

- [ ] **Step 2: Run the release workflow test to verify Red**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL because both workflow copies still advertise marker 3, accept schema 2, require `coreRange`, and emit evidence schema 1.

- [ ] **Step 3: Implement no-range workflow validation and evidence**

In both byte-identical workflow files:

```yaml
# prism-managed: @kyaulabs/prism-core
# prism-release-schema: 4
```

Remove the `Install release validation dependencies` step. Change the jq managed predicate to require `.schemaVersion == 3`. Use this complete evidence validator shape:

```javascript
const ENTRY_KEYS = [
  'bootstrapProtocol',
  'displayName',
  'id',
  'package',
  'status',
];
const ROOT_KEYS = [
  'adapterReleases',
  'managedBy',
  'packages',
  'schemaVersion',
  'versionPolicy',
];
const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const releaseVersion = process.env.VERSION;
let declarations = [];
let packagePaths = [];

if (fs.existsSync(CONFIG_PATH)) {
  const configuration = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const rootKeys = Object.keys(configuration).sort();
  const managed =
    JSON.stringify(rootKeys) === JSON.stringify(ROOT_KEYS) &&
    configuration.schemaVersion === 3 &&
    configuration.managedBy === '@kyaulabs/prism-core' &&
    configuration.versionPolicy === 'lockstep';
  const legacy =
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    JSON.stringify(rootKeys) === JSON.stringify(['packages']);
  if (!managed && !legacy) throw new Error('release configuration is invalid');
  packagePaths = configuration.packages;
  declarations = managed ? configuration.adapterReleases : [];
}

const packages = new Set(packagePaths);
const declaredPackages = new Set();
const identifiers = new Set();
const adapterReleases = declarations.map((declaration) => {
  if (
    declaration === null ||
    typeof declaration !== 'object' ||
    Array.isArray(declaration) ||
    JSON.stringify(Object.keys(declaration).sort()) !== JSON.stringify(ENTRY_KEYS) ||
    !packages.has(declaration.package) ||
    declaredPackages.has(declaration.package) ||
    typeof declaration.id !== 'string' ||
    !ID.test(declaration.id) ||
    identifiers.has(declaration.id) ||
    typeof declaration.displayName !== 'string' ||
    declaration.displayName.length === 0 ||
    declaration.displayName.length > 120 ||
    declaration.displayName !== declaration.displayName.trim() ||
    /[\u0000-\u001f\u007f]/u.test(declaration.displayName) ||
    !Number.isSafeInteger(declaration.bootstrapProtocol) ||
    declaration.bootstrapProtocol <= 0 ||
    !['ACTIVE', 'REVOKED'].includes(declaration.status)
  ) {
    throw new Error('adapter release declaration is invalid');
  }
  const manifest = JSON.parse(fs.readFileSync(`${declaration.package}/package.json`, 'utf8'));
  if (
    manifest.prism?.adapter === true &&
    manifest.prism.bootstrapProtocol === declaration.bootstrapProtocol &&
    typeof manifest.name === 'string' &&
    typeof manifest.version === 'string' &&
    manifest.version === releaseVersion
  ) {
    declaredPackages.add(declaration.package);
    identifiers.add(declaration.id);
    return {
      package: declaration.package,
      id: declaration.id,
      displayName: declaration.displayName,
      packageName: manifest.name,
      version: manifest.version,
      bootstrapProtocol: declaration.bootstrapProtocol,
      status: declaration.status,
    };
  }
  throw new Error('adapter package evidence is invalid');
});

const evidence = {schemaVersion: 2, releaseVersion, adapterReleases};
```

Set `WORKFLOW_SCHEMA_MARKER` in the package-release module to `# prism-release-schema: 4`. Update the release prompt's managed JSON, exact-field list, schema number, and publisher handoff text. State that downstream independently checks first-or-newer version admission; do not add network access to local release authoring.

- [ ] **Step 4: Run focused release checks to verify Green**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS with schema-3 configuration, schema-2 no-range evidence, canonical workflow parity, and no embedded back-merge behavior.

Run: `node --test tests/Node/prism-tool-package-release-discovery.test.js tests/Node/prism-tool-package-release-transaction.test.js`

Expected: PASS with workflow schema marker 4 and current canonical bytes.

- [ ] **Step 5: Create the commit**

```bash
git add .github/workflows/release.yml packages/prism-core/config/release.yml packages/prism-core/prompts/release.md packages/prism-core/scripts/prism-tool/package-release.js tests/Shell/release_workflow_test.sh
prism-tool commit create --type fix --scope release --subject "emit protocol-only adapter evidence" --refs 506
```

---

### Task 3: Select signed catalogue releases by bootstrap protocol

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js:1-230`
- Modify: `packages/prism-core/scripts/prism-tool/supported-adapters.js:190-275`
- Modify: `packages/prism-core/docs/adapter-catalogue.md:65-180`
- Modify: `tests/Node/prism-tool-adapter-catalogue.test.js:75-470`
- Modify: `tests/Node/helpers.js:65-105`
- Modify: `tests/Node/prism-tool-bootstrap-adapter.test.js:75-240`
- Modify: `tests/Node/prism-tool-bootstrap-orchestration.test.js:55-90`
- Modify: `tests/Node/prism-tool-bootstrap-plan.test.js:95-130`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js:65-100`

**Interfaces:**

- Consumes: verified signed catalogue payload schema 2 and exact positive `bootstrapProtocol`.
- Produces: `validateCataloguePayload({catalogue, verified, now})` returning closed schema 2; `selectCompatibleAdapters({catalogue, bootstrapProtocol})` returning the highest ACTIVE stable release for that protocol.

- [ ] **Step 1: Write failing protocol-only catalogue tests**

Change `validCatalogue()` to this protocol-only schema:

```javascript
function validCatalogue() {
    return {
        schemaVersion: 2,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            releases: [
                {version: '2.0.0', bootstrapProtocol: 2, integrity: VALID_INTEGRITY, publishedAt: '2026-08-27T00:00:00Z', status: 'ACTIVE'},
                {version: '1.8.2', bootstrapProtocol: 1, integrity: VALID_INTEGRITY, publishedAt: '2026-08-26T00:00:00Z', status: 'ACTIVE'},
                {version: '1.9.0-beta.1', bootstrapProtocol: 1, integrity: VALID_INTEGRITY, publishedAt: '2026-08-27T00:00:00Z', status: 'ACTIVE'},
                {version: '1.8.3', bootstrapProtocol: 1, integrity: VALID_INTEGRITY, publishedAt: '2026-08-27T00:00:00Z', status: 'REVOKED'},
            ],
        }],
    };
}
```

Replace the selection test and add the cutoff/absence cases:

```javascript
test('selects the highest stable active release for the bootstrap protocol', () => {
    const catalogue = validateCataloguePayload({
        catalogue: validCatalogue(),
        now: new Date('2026-08-27T12:00:00Z'),
    });

    assert.deepEqual(selectCompatibleAdapters({
        catalogue,
        bootstrapProtocol: 1,
    }), [{
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '1.8.2',
        bootstrapProtocol: 1,
        integrity: VALID_INTEGRITY,
    }]);
    assert.deepEqual(selectCompatibleAdapters({
        catalogue,
        bootstrapProtocol: 3,
    }), []);
});

test('rejects the range-based catalogue schema after the cutoff', () => {
    const catalogue = validCatalogue();
    catalogue.schemaVersion = 1;
    catalogue.adapters[0].releases[0].coreRange = '>=0.4.1 <10.0.0';

    assert.throws(
        () => validateCataloguePayload({
            catalogue,
            now: new Date('2026-08-27T12:00:00Z'),
        }),
        CatalogueError
    );
});
```

In the malformed-payload table, replace the malformed-range record with a release carrying removed `coreRange` and add a non-positive protocol case. Update every signed catalogue fixture in the listed bootstrap tests and shared helper to payload schema 2 without `coreRange`.

- [ ] **Step 2: Run focused catalogue and bootstrap tests to verify Red**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: FAIL because Core accepts only payload schema 1, requires `coreRange`, and still receives a Core version during selection.

- [ ] **Step 3: Implement protocol-only validation and selection**

Use this release validator:

```javascript
function validateRelease(release, versions) {
    if (!exactKeys(release, [
        'version', 'bootstrapProtocol', 'integrity', 'publishedAt', 'status',
    ]) || !boundedString(release.version, 64) || semver.valid(release.version) !== release.version ||
        versions.has(release.version) ||
        !Number.isSafeInteger(release.bootstrapProtocol) || release.bootstrapProtocol <= 0 ||
        !validIntegrity(release.integrity) || !['ACTIVE', 'REVOKED'].includes(release.status)) {
        throw new CatalogueError('PAYLOAD_INVALID');
    }
    parseUtcTimestamp(release.publishedAt);
    versions.add(release.version);
    return Object.freeze({...release});
}
```

Require `value.schemaVersion === 2` and return `schemaVersion: 2` from payload validation. Replace selection with:

```javascript
function selectableRelease(release, bootstrapProtocol) {
    return release.status === 'ACTIVE' &&
        semver.valid(release.version) === release.version &&
        semver.prerelease(release.version) === null &&
        release.bootstrapProtocol === bootstrapProtocol;
}

function selectCompatibleAdapters({catalogue, bootstrapProtocol}) {
    if (!Number.isSafeInteger(bootstrapProtocol) || bootstrapProtocol <= 0) {
        throw new CatalogueError('BOOTSTRAP_PROTOCOL_INVALID');
    }
    return catalogue.adapters.flatMap((adapter) => {
        const releases = adapter.releases
            .filter((release) => selectableRelease(release, bootstrapProtocol))
            .sort((left, right) => semver.rcompare(left.version, right.version));
        if (releases.length === 0) return [];
        const selected = releases[0];
        return [Object.freeze({
            id: adapter.id,
            displayName: adapter.displayName,
            packageName: adapter.packageName,
            packageVersion: selected.version,
            bootstrapProtocol: selected.bootstrapProtocol,
            integrity: selected.integrity,
        })];
    }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
```

In both `inspectSupportedAdapters()` and `loadSelectedAdapter()`, retain `readCoreManifest(options.coreRoot)` as package-identity validation but stop passing `manifest.version` to selection:

```javascript
readCoreManifest(options.coreRoot);
const adapters = selectCompatibleAdapters({
    catalogue: verified.catalogue,
    bootstrapProtocol: BOOTSTRAP_PROTOCOL,
});
```

Update the package documentation to show payload schema 2, omit `coreRange`, explain exact protocol selection, and state the Core v0.5.0 cutoff and upgrade requirement. Preserve exact package pinning, integrity, cache, consent, and failure documentation.

- [ ] **Step 4: Run the focused and full Node suites to verify Green**

Run: `node --test tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js`

Expected: PASS with protocol-only payloads and no matching-protocol fallback.

Run: `npm run test:node`

Expected: PASS; all catalogue fixtures and downstream bootstrap consumers use schema 2 without a range.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/adapter-catalogue-validation.js packages/prism-core/scripts/prism-tool/supported-adapters.js packages/prism-core/docs/adapter-catalogue.md tests/Node/helpers.js tests/Node/prism-tool-adapter-catalogue.test.js tests/Node/prism-tool-bootstrap-adapter.test.js tests/Node/prism-tool-bootstrap-orchestration.test.js tests/Node/prism-tool-bootstrap-plan.test.js tests/Node/prism-tool-bootstrap-seed.test.js
prism-tool commit create --type feat --scope catalogue --subject "select adapters by bootstrap protocol" --refs 506
```

---

### Task 4: Deploy canonical back-merge automation

**Files:**

- Create: `.github/workflows/back-merge.yml`
- Modify: `tests/Shell/release_workflow_test.sh:45-110,770-790`

**Interfaces:**

- Consumes: `packages/prism-core/config/automation/back-merge.yml` canonical bytes from ADR-0100.
- Produces: deployed `.github/workflows/back-merge.yml` with exact managed ownership, merged-PR trigger, serialized idempotent PR lookup, and human-only merge.

- [ ] **Step 1: Add the failing repository deployment contract**

Add the canonical path and exact checks:

```bash
BACK_MERGE_FILE="$REPO_ROOT/.github/workflows/back-merge.yml"
CANONICAL_BACK_MERGE_FILE="$REPO_ROOT/packages/prism-core/config/automation/back-merge.yml"

if [ -f "$BACK_MERGE_FILE" ] && \
   [ -f "$CANONICAL_BACK_MERGE_FILE" ] && \
   cmp -s "$BACK_MERGE_FILE" "$CANONICAL_BACK_MERGE_FILE" && \
   head -5 "$BACK_MERGE_FILE" | grep -qF '# prism-managed: @kyaulabs/prism-core' && \
   head -5 "$BACK_MERGE_FILE" | grep -qF '# prism-automation-schema: 1'; then
    pass "back-merge workflow is deployed from the canonical Core provider"
else
    fail "back-merge workflow is missing or differs from the canonical Core provider"
fi

if node -e '
    const fs = require("node:fs");
    const yaml = require("js-yaml");
    yaml.load(fs.readFileSync(process.argv[1], "utf8"));
' "$BACK_MERGE_FILE" >/dev/null 2>&1; then
    pass "back-merge workflow is syntactically valid YAML"
else
    fail "back-merge workflow is not syntactically valid YAML"
fi
```

Keep the existing assertion that `release.yml` contains no back-merge command or pull-request behavior.

- [ ] **Step 2: Run the shell test to verify Red**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: FAIL with `back-merge workflow is missing or differs from the canonical Core provider`.

- [ ] **Step 3: Deploy the exact canonical workflow**

Create `.github/workflows/back-merge.yml` with these exact bytes:

```yaml
# prism-managed: @kyaulabs/prism-core
# prism-automation-schema: 1
name: Back-merge main to develop

on:
  pull_request:
    branches: [main]
    types: [closed]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: back-merge-main-to-develop
  cancel-in-progress: false

jobs:
  back-merge:
    if: github.event.pull_request.merged == true && github.event.pull_request.base.ref == 'main'
    runs-on: ubuntu-latest
    steps:
      - name: Open or reuse back-merge pull request
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          existing="$(gh pr list --state open --base develop --head main --json number --jq '.[0].number // empty')"
          if [ -n "$existing" ]; then
            echo "Back-merge pull request #$existing already exists."
            exit 0
          fi
          gh pr create --base develop --head main --title "chore: back-merge main into develop" --body "Automated back-merge after a successful merge into main."
```

Do not alter the packaged canonical file or add behavior to the release workflow.

- [ ] **Step 4: Run automation and shell checks to verify Green**

Run: `bash tests/Shell/release_workflow_test.sh`

Expected: PASS with byte-identical release and back-merge workflows.

Run: `node --test tests/Node/prism-tool-automation.test.js`

Expected: PASS; provider planning, application, migration, ownership, and verification remain unchanged.

Run: `git diff --no-index -- packages/prism-core/config/automation/back-merge.yml .github/workflows/back-merge.yml`

Expected: exit 0 with no diff.

- [ ] **Step 5: Create the commit**

```bash
git add .github/workflows/back-merge.yml tests/Shell/release_workflow_test.sh
prism-tool commit create --type ci --scope release --subject "deploy canonical back-merge workflow" --refs 506
```

---

## Final verification and handoff

After all tasks are committed:

1. Run `rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' 'coreRange' .` and verify matches remain only in ADR/spec migration history and the dedicated schema-2 migration/rejection tests. No active configuration, workflow, prompt, package documentation, or runtime source contract may contain the field.
2. Run `npm run test:node` and require every Node test to pass.
3. Run `bash tests/Shell/run-all.sh` and require zero shell-test failures.
4. Run `prism-tool markdown lint --changed-from origin/develop` and require exit 0.
5. Run `bash packages/prism-core/scripts/validate-harness.sh` and require zero errors.
6. Run `prism-tool run eslint -- "packages/**/*.js" "tests/Node/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern` and require exit 0.
7. Confirm no PHP file changed and mark PHP coverage N/A.
8. Invoke `/check` and require the complete Core and active-adapter aggregate gate to pass before finalization; do not substitute an invented direct Semgrep command.
9. Confirm `git status --short` contains no `.pi/tmp` tracker envelopes or generated release evidence.
10. Do not invoke `/release`. Hand the immutable approved spec/ADR commit to a separate `kyaulabs/prism-adapters` session for its superseding ADR and TDD plan. Only after that downstream implementation reaches `main` may a human-approved v0.5.1 release begin.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
