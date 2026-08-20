# Exclusive Global Prism Core Source Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Make `install-global.sh` leave exactly one selected
`@kyaulabs/prism-core` source active in Pi global settings.

**Architecture:** Add a focused Node reconciler that treats Pi settings and
package metadata as untrusted structured data, identifies npm/local Prism Core
registrations, and atomically publishes a settings document containing only
the selected registration. Wire it after successful `pi install` and before
context/launcher deployment.

**Tech Stack:** Node.js 22 CommonJS, Bash, Node test runner, existing shell test
harness, Pi package settings documented by pi 0.84.2.

## Global constraints

- Preserve ADR-0064's three-footer commit contract.
- Use `prism-tool commit create` as the sole ordinary commit path.
- Do not access credential paths or modify the real global Pi settings during
  tests.
- Add no dependency.
- Preserve unrelated settings keys and package entries in order.
- Installation must succeed before reconciliation runs.
- Reconciliation failure must leave the prior settings file byte-identical and
  stop before context or launcher deployment.
- Never delete inactive package caches.
- Apply the required RCS header and vim modeline to every new or modified
  source file.

---

### Task 1: Atomic settings reconciler

**Files:**
- Create: `packages/prism-core/scripts/reconcile-core-source.js`
- Create: `tests/Node/reconcile-core-source.test.js`

**Interfaces:**
- Consumes: `settingsPath: string`, `selectedSource: string`.
- Produces: `reconcileCoreSource(settingsPath, selectedSource, context = {})`
  returning `{removed: number, retained: string}` or throwing a
  `ReconcileError` with a generic diagnostic.
- CLI: `node reconcile-core-source.js SETTINGS_PATH SELECTED_SOURCE`; exit `0`
  on success and `1` with `✗ Prism Core settings reconciliation failed.` on
  any failure.

- [ ] **Step 1: Write failing npm/local classification tests**

Create fixtures with a private temporary Pi directory, package roots named
`@kyaulabs/prism-core`, and settings containing string/object npm and local
entries. Assert npm→local and local→npm retain exactly one selected entry,
remove competing core entries, collapse selected duplicates, and preserve
unrelated entries and top-level properties.

Use public-seam assertions:

```javascript
const result = reconcileCoreSource(settingsPath, selectedRoot);
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
assert.equal(result.removed, 3);
assert.deepEqual(settings.packages, [selectedRoot, 'npm:unrelated']);
assert.equal(settings.theme, 'dark');
```

- [ ] **Step 2: Run focused tests to prove Red**

Run: `node --test tests/Node/reconcile-core-source.test.js`

Expected: FAIL because `reconcile-core-source.js` does not exist.

- [ ] **Step 3: Implement parsing and source classification**

Implement these focused helpers in `reconcile-core-source.js`:

```javascript
const CORE_NAME = '@kyaulabs/prism-core';
const MAX_SETTINGS_BYTES = 1024 * 1024;

function entrySource(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && !Array.isArray(entry) &&
        typeof entry.source === 'string') return entry.source;
    return null;
}

function npmCoreSource(source) {
    return /^npm:@kyaulabs\/prism-core(?:@[^\s@]+)?$/.test(source);
}
```

For local entries, resolve relative paths against `dirname(settingsPath)`,
canonicalize the package root, open `package.json` with `O_NOFOLLOW`, require a
regular file no larger than 64 KiB, parse JSON, and classify only exact
`name === CORE_NAME`. Canonicalize the selected local source before comparing.
Require the selected source to be present after Pi installation.

- [ ] **Step 4: Add atomic-write failure tests**

Cover malformed/oversized settings, symlinked settings, invalid selected local
metadata, absent selected registration, and injected rename failure. Capture
original bytes before each failure and assert they remain unchanged.

- [ ] **Step 5: Implement atomic publication**

Open and validate the existing settings file with `O_NOFOLLOW`; preserve its
object key order and package entry objects; serialize with two-space JSON plus
one final newline. Create a same-directory unpredictable temporary file with
`O_CREAT | O_EXCL | O_NOFOLLOW`, mode `0600`; write, `fchmod`, `fsync`, close,
rename over the validated settings path, and fsync the parent directory.
Always remove an owned unpublished temporary file in `finally`.

Expose filesystem and random-byte seams through `context` only where required
to deterministically test publication failures.

- [ ] **Step 6: Run focused tests to Green and refactor**

Run: `node --test tests/Node/reconcile-core-source.test.js`

Expected: all reconciler tests PASS.

Run: `npx eslint packages/prism-core/scripts/reconcile-core-source.js tests/Node/reconcile-core-source.test.js`

Expected: PASS with no findings.

- [ ] **Step 7: Commit Task 1 atomically**

Stage only the helper and Node test, then run as the only tool call in its
assistant batch:

```bash
prism-tool commit create --type fix --scope installer --subject "reconcile global core package sources"
```

---

### Task 2: Installer sequencing and integration coverage

**Files:**
- Modify: `packages/prism-core/scripts/install-global.sh`
- Modify: `tests/Shell/install_global_toolchain_test.sh`

**Interfaces:**
- Consumes: Task 1 CLI and the installer-selected source.
- Produces: successful installer runs whose `$PI_CODING_AGENT_DIR/settings.json`
  contains one selected Prism Core source before context and launcher
  deployment begins.

- [ ] **Step 1: Extend the fake Pi fixture and write failing integration tests**

Make the fake `pi install SOURCE` update the fixture
`$PI_CODING_AGENT_DIR/settings.json` by appending `SOURCE` while preserving its
other fields. Add fixture cases for:

1. existing npm plus selected checkout path;
2. existing checkout path plus selected npm;
3. competing alternate checkout path;
4. malformed settings;
5. fake Pi installation failure.

Assert successful switches leave one selected core source and preserve an
unrelated package. Assert malformed settings remain byte-identical and no
`AGENTS.md`, `APPEND_SYSTEM.md`, or launcher is deployed. Assert installation
failure does not invoke reconciliation and leaves prior settings unchanged.

- [ ] **Step 2: Run the focused shell test to prove Red**

Run: `bash tests/Shell/install_global_toolchain_test.sh`

Expected: new exclusivity assertions FAIL because the installer does not invoke
the reconciler.

- [ ] **Step 3: Wire source selection and reconciliation**

In `install-global.sh`, retain the selected source as inert script state:

```bash
SELECTED_CORE_SOURCE=""
```

- npm mode: selected source is the validated npm literal.
- explicit/default local mode: canonicalize the package root and use its
  absolute path.
- package-already-under-Pi mode: still reconcile against the canonical package
  root even though `pi install` is skipped.

After successful installation/skip and before context deployment, invoke:

```bash
if ! node "$PKG_ROOT/scripts/reconcile-core-source.js" \
    "$PI_DIR/settings.json" "$SELECTED_CORE_SOURCE"; then
    echo "✗ Prism Core settings reconciliation failed." >&2
    exit 1
fi
```

Keep registry approval, lifecycle-script suppression, context deployment,
launcher ownership, and local readiness unchanged.

- [ ] **Step 4: Run focused tests to Green and refactor**

Run: `bash tests/Shell/install_global_toolchain_test.sh`

Expected: all installer tests PASS.

Run: `node --test tests/Node/reconcile-core-source.test.js`

Expected: all reconciler tests PASS.

Run: `bash -n packages/prism-core/scripts/install-global.sh tests/Shell/install_global_toolchain_test.sh`

Expected: PASS.

Run: `npx eslint packages/prism-core/scripts/reconcile-core-source.js tests/Node/reconcile-core-source.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Task 2 atomically**

Stage only the installer and shell integration test, then run as the only tool
call in its assistant batch:

```bash
prism-tool commit create --type fix --scope installer --subject "make selected core source exclusive"
```

---

### Task 3: Verify, clean development artifacts, and finish v0.2.0

**Files:**
- Delete after review: `docs/specs/2026-08-20-exclusive-global-core-source-spec.md`
- Delete after review: `docs/plans/2026-08-20-exclusive-global-core-source.md`
- Regenerate: `CHANGELOG.md`
- Modify when computed by `/release`: release-managed package manifests from
  `.prism/release.json`

**Interfaces:**
- Consumes: green Task 1 and Task 2 commits.
- Produces: verified release branch with the installer correction included in
  the v0.2.0 changelog and a standard atomic release commit.

- [ ] **Step 1: Run verification and project gates**

Run the focused Node and shell tests again, then `/check`. Run `code-review`
against the branch diff. Resolve every Blocking finding and every unwaived
Suggested finding through TDD.

- [ ] **Step 2: Remove development artifacts per ADR-0027**

Delete the plan and spec only after implementation, verification, and review
are complete. Stage the two deletions and commit atomically:

```bash
prism-tool commit create --type chore --scope docs --subject "remove completed installer artifacts"
```

- [ ] **Step 3: Regenerate release outputs**

Regenerate `CHANGELOG.md` with validated literal version `v0.2.0` so the
installer fix commits appear. Follow the current
`packages/prism-core/prompts/release.md` per-package version computation and
stage `CHANGELOG.md` plus each exact bumped package manifest separately.

- [ ] **Step 4: Create the standard release commit**

Run as the only tool call in its assistant batch:

```bash
prism-tool commit create --type chore --scope release --subject v0.2.0
```

- [ ] **Step 5: Print human-only handoff**

Print, but do not execute, the push and PR commands from the current release
prompt. Never tag, publish, push, create a GitHub Release, or open the
back-merge PR locally.

## Plan self-review

- Spec coverage: source classification, atomic replacement, sequencing,
  failure preservation, npm/local switching, no cache deletion, release-branch
  handling, and verification are assigned to Tasks 1–3.
- Placeholder scan: no placeholder markers, deferred implementation
  instruction, or undefined interface remains.
- Interface consistency: Task 2 invokes the exact CLI produced by Task 1;
  Task 3 consumes the two independently green implementation commits.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
