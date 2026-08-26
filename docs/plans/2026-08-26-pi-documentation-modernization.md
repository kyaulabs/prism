# Pi documentation modernization implementation plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each behavior-changing task follows Red → Green → Refactor inline.

**Goal:** Add a deterministic Core Markdown gate, retire obsolete development
artifacts, and rewrite Prism's maintained documentation around its current Pi
architecture through Distill.

**Architecture:** Prism Core bundles `markdownlint-cli2@0.23.2` and exposes one
changed-file checker through `prism-tool markdown lint`. The checker
materializes staged or `HEAD` Git blobs in an owned temporary workspace and
runs one packaged, non-executable policy. Documentation work then proceeds by
lifecycle and reader journey while immutable history and protected text remain
unchanged.

**Tech stack:** Node.js 22+, CommonJS launcher modules, Git plumbing,
`markdownlint-cli2` 0.23.2 (`markdownlint` 0.41.1), Bash hooks, GitHub Actions,
Markdown, Node test runner, existing shell contract tests.

**Originating issue:** none

## Global constraints

- Follow ADR-0090: exact bundled ownership, changed-file-only scope, packaged
  configuration, no project-local rules or plugins, and fail-closed path
  handling.
- Add `markdownlint-cli2` at exact version `0.23.2`; its Node engine is
  `>=22`. The 2026-08-26 isolated prototype found zero npm advisories across
  the 86-package resolved graph.
- Registry use is limited to the explicitly approved exact npm installation
  and audit. Use `--ignore-scripts`; gates never install or fetch packages.
- Use the canonical command interface:
  `prism-tool markdown lint --cached` or
  `prism-tool markdown lint --changed-from <revision>`.
- The initial path policy includes `adr/`, `docs/`, maintained root docs,
  package READMEs/docs, and extension READMEs. It excludes skills, prompts,
  agent instructions, generated history, legal text, and vendored text.
- Untouched accepted ADRs are immutable and are never bulk-normalized.
- Distill rewrites do not change skills, prompts, agent instructions,
  generated changelog content, legal/vendor prose, source behavior unrelated
  to the Markdown gate, or OpenCodeReview/`ocr` terminology.
- Preserve exact commands, paths, identifiers, versions, state names,
  quotations, citations, links, templates, and phrases protected by existing
  tests.
- Modify documentation rather than weakening existing documentation contract
  tests.
- Every new or modified `.js`/`.sh` source receives the repository-managed RCS
  header and final vim modeline through the pre-commit normalizer.
- Run `npm audit --package-lock-only --json` after the dependency change; any
  advisory at any severity is blocking.

---

### Task 1: Pin the Markdown engine and packaged policy

**Files:**

- Create: `packages/prism-core/config/markdownlint-cli2.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/prism-core/package.json`
- Modify: `packages/prism-core/toolchain.json`
- Modify: `tests/Node/toolchain-contract.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: ADR-0063 exact bundled-tool contract and ADR-0090 policy.
- Produces: toolchain component ID `markdownlint-cli2`, exact package version
  `0.23.2`, and packaged config path
  `packages/prism-core/config/markdownlint-cli2.json`.

- [ ] **Step 1: Write the failing contract tests**

Add this test to `tests/Node/toolchain-contract.test.js` and add
`markdownlint-cli2: '0.23.2'` to the existing root exact-tool map:

```javascript
test('declares the exact bundled Markdown engine', () => {
    const contract = loadContract(coreContract);
    const component = contract.components.find(({id}) => id === 'markdownlint-cli2');
    const corePackage = require('../../packages/prism-core/package.json');
    const rootPackage = require('../../package.json');
    const lock = require('../../package-lock.json');

    assert.deepEqual(component, {
        id: 'markdownlint-cli2',
        kind: 'command',
        ecosystem: 'npm',
        package: 'markdownlint-cli2',
        version: '0.23.2',
        provisioning: 'bundled',
        authentication: 'none',
        executable: 'markdownlint-cli2',
        versionArguments: ['--version'],
        argumentPolicy: {mode: 'passthrough'},
    });
    assert.equal(corePackage.dependencies['markdownlint-cli2'], '0.23.2');
    assert.equal(rootPackage.devDependencies['markdownlint-cli2'], '0.23.2');
    assert.equal(lock.packages['node_modules/markdownlint-cli2'].version, '0.23.2');
});
```

Extend `tests/Node/toolchain-packaging.test.js`:

```javascript
assert.equal(
    packed.files.has('config/markdownlint-cli2.json'),
    true,
    'packaged Markdown policy present'
);
```

- [ ] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the component, dependency, lock entry, and config do not
exist.

- [ ] **Step 3: Add the exact dependency, contract, and configuration**

Run the approved registry mutation with lifecycle scripts disabled:

```bash
npm install --save-dev --save-exact --ignore-scripts --no-audit --no-fund markdownlint-cli2@0.23.2
```

Add `"markdownlint-cli2": "0.23.2"` to
`packages/prism-core/package.json` dependencies. Add this component to
`packages/prism-core/toolchain.json`:

```json
{
  "id": "markdownlint-cli2",
  "kind": "command",
  "ecosystem": "npm",
  "package": "markdownlint-cli2",
  "version": "0.23.2",
  "provisioning": "bundled",
  "authentication": "none",
  "executable": "markdownlint-cli2",
  "versionArguments": ["--version"],
  "argumentPolicy": {"mode": "passthrough"}
}
```

Create `packages/prism-core/config/markdownlint-cli2.json` with exactly:

```json
{
  "config": {
    "default": true,
    "MD004": {"style": "dash"},
    "MD013": false,
    "MD024": {"siblings_only": true},
    "MD033": {
      "allowed_elements": [
        "br",
        "details",
        "div",
        "img",
        "kbd",
        "picture",
        "source",
        "sub",
        "summary",
        "sup"
      ]
    }
  },
  "fix": false,
  "gitignore": false,
  "noBanner": true,
  "noInlineConfig": true,
  "noProgress": true,
  "showFound": false
}
```

- [ ] **Step 4: Audit and verify Green**

Run:

```bash
npm audit --package-lock-only --json
```

Expected: zero vulnerabilities at every severity.

Run:

```bash
node --test tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add package.json package-lock.json packages/prism-core/package.json packages/prism-core/toolchain.json packages/prism-core/config/markdownlint-cli2.json tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope markdown --subject "bundle exact markdown lint policy"
```

### Task 2: Implement the changed-file Markdown checker

**Files:**

- Create: `packages/prism-core/scripts/prism-tool/core-toolchain.js`
- Create: `packages/prism-core/scripts/prism-tool/markdown.js`
- Create: `tests/Node/prism-tool-markdown.test.js`
- Modify: `packages/prism-core/scripts/prism-tool/cli.js`
- Modify: `tests/Node/prism-tool-run.test.js`
- Modify: `tests/Node/toolchain-packaging.test.js`

**Interfaces:**

- Consumes: component ID `markdownlint-cli2` and packaged config from Task 1.
- Produces:
  - `markdownCommand(args, context): number|Promise<number>`
  - `prism-tool markdown lint --cached`
  - `prism-tool markdown lint --changed-from <revision>`
  - shared Core helpers `loadCoreContract(coreRoot)` and
    `resolveBundledComponent(coreRoot, component)`.

- [ ] **Step 1: Write the failing public-seam tests**

Create `tests/Node/prism-tool-markdown.test.js`. Use real temporary Git
repositories, the real pinned linter, and the existing fake Semgrep/OCR
executables. Cover these observable cases:

```javascript
// Required cases and assertions:
// 1. --cached lints the staged blob, not a clean unstaged replacement.
// 2. --changed-from lints the HEAD blob, not a clean dirty working tree.
// 3. bad Markdown under docs/, adr/, a maintained root path, package docs,
//    and an extension README is selected.
// 4. bad Markdown under packages/*/skills/, packages/*/prompts/,
//    AGENTS.md, CHANGELOG.md, and CODE_OF_CONDUCT.md is excluded.
// 5. a path containing spaces is materialized and reported project-relative.
// 6. a staged symlink, malformed injected path, traversal path, unsupported
//    object mode, invalid revision, timeout, and oversized output fail closed.
// 7. a project-local .markdownlint-cli2.cjs that writes a marker is never
//    loaded; the marker remains absent.
// 8. --fix, direct paths, duplicate modes, and missing revisions return usage.
// 9. prism-tool run markdownlint-cli2 is rejected in favor of the dedicated
//    command.
// 10. an empty eligible change set returns success without invoking the tool.
```

The test fixture for the staged-versus-working-tree case must perform this
sequence:

```javascript
fs.mkdirSync(path.join(projectRoot, 'docs'), {recursive: true});
fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n### Broken jump\n');
execFileSync('git', ['add', 'docs/guide.md'], {cwd: projectRoot});
fs.writeFileSync(path.join(projectRoot, 'docs', 'guide.md'), '# Guide\n\n## Fixed\n');

const result = spawnSync(process.execPath, [cli, 'markdown', 'lint', '--cached'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: readyExternalEnvironment(projectRoot),
});
assert.equal(result.status, 4);
assert.match(result.stdout + result.stderr, /docs\/guide\.md:3.*MD001/);
```

Extend `tests/Node/prism-tool-run.test.js` with a direct-run rejection:

```javascript
const result = spawnSync(
    process.execPath,
    [cli, 'run', 'markdownlint-cli2', '--', 'README.md'],
    {encoding: 'utf8', env: readyExternalEnvironment(directory)}
);
assert.equal(result.status, 2);
assert.match(result.stderr, /dedicated Markdown operation/);
```

Add `core-toolchain` and `markdown` to the packaged module list in
`tests/Node/toolchain-packaging.test.js`.

- [ ] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-markdown.test.js tests/Node/prism-tool-run.test.js tests/Node/toolchain-packaging.test.js
```

Expected: FAIL because the command and modules do not exist and generic run is
not blocked.

- [ ] **Step 3: Implement the checker and CLI dispatch**

Move `packageRootFor`, `resolveBundledComponent`, and `loadCoreContract` from
`cli.js` into `core-toolchain.js`; re-export `resolveBundledComponent` from
`cli.js` to preserve the tested API.

Implement `markdown.js` with these exact rules:

```text
parse:
  lint --cached
  lint --changed-from <safe revision>
  reject every other shape

safe revision:
  1..256 ASCII characters
  starts with alphanumeric
  contains only alphanumeric, dot, underscore, slash, or hyphen
  rejects '..', '@{', '//', trailing slash, trailing dot, and '.lock'

Git selection:
  --cached:
    git diff --cached --name-only -z --diff-filter=ACMR -- '*.md'
    read mode/SHA through git ls-files --stage -z -- <path>
  --changed-from:
    git rev-parse --verify --end-of-options <revision>^{commit}
    git merge-base <resolved revision> HEAD
    git diff --name-only -z --diff-filter=ACMR <merge-base> HEAD -- '*.md'
    read mode/SHA through git ls-tree -z HEAD -- <path>

path validation:
  valid UTF-8 and NFC
  no control characters or backslashes
  not absolute
  no empty, '.', or '..' segment
  at most 4096 UTF-8 bytes
  Git mode must be 100644 and object type must be blob

eligible paths:
  adr/**/*.md
  docs/**/*.md
  README.md
  CODING_HARNESS.md
  CONTRIBUTING.md
  NPM.md
  SECURITY.md
  CONTEXT.md
  packages/*/README.md
  packages/*/docs/**/*.md
  packages/*/extensions/**/README.md

materialization:
  mkdtemp under os.tmpdir() with prefix prism-markdown-
  create directories mode 0700 and files mode 0600
  read blobs with git cat-file blob <sha> using Buffer output
  preserve project-relative paths below the temporary root
  remove the owned root with fs.rmSync(..., {recursive:true, force:true})

linter invocation:
  cwd = temporary root
  argv = [
    '--config', <absolute packaged config>,
    '--no-globs',
    ...eligible project-relative paths
  ]
  timeout = 30000 ms
  maxBuffer = 1048576 bytes
  relay bounded linter stdout/stderr only
  return 0 on success, 4 on lint/tool failure, 3 on readiness failure,
  and 2 on invalid command input
```

Before selection, load and validate the Core contract, run mandatory local
external-tool readiness, find the exact `markdownlint-cli2` component, and
resolve its executable relative to Core. Add this dispatch to `cli.js`:

```javascript
if (command === 'markdown') return markdownCommand(args, context);
```

Reject generic execution before argument handling:

```javascript
if (component.id === 'markdownlint-cli2') {
    process.stderr.write('prism-tool: Markdown lint requires the dedicated Markdown operation\n');
    return EXIT.USAGE;
}
```

- [ ] **Step 4: Run focused and regression tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-markdown.test.js tests/Node/prism-tool-run.test.js tests/Node/toolchain-contract.test.js tests/Node/toolchain-packaging.test.js
```

Expected: PASS.

Run:

```bash
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS with the new packaged modules and contract.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/core-toolchain.js packages/prism-core/scripts/prism-tool/markdown.js packages/prism-core/scripts/prism-tool/cli.js tests/Node/prism-tool-markdown.test.js tests/Node/prism-tool-run.test.js tests/Node/toolchain-packaging.test.js
prism-tool commit create --type feat --scope markdown --subject "lint changed markdown through core"
```

### Task 3: Wire hooks, `/check`, and CI to the shared checker

**Files:**

- Modify: `packages/prism-core/scripts/prism-tool/hook.js`
- Modify: `.github/hooks/pre-commit`
- Modify: `packages/prism-core/prompts/check.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js`
- Modify: `tests/Node/prism-tool-bootstrap-seed.test.js`
- Modify: `tests/Node/prism-tool-php-web-bootstrap.test.js`
- Modify: `tests/Shell/pre_commit_index_lint_test.sh`
- Modify: `tests/Shell/toolchain_entrypoints_test.sh`
- Modify: `tests/Shell/fixtures/fake-prism-tool.sh`

**Interfaces:**

- Consumes: dedicated checker from Task 2.
- Produces: staged Markdown enforcement in canonical and repository hooks;
  changed-from enforcement in `/check`, repository CI, and generated PHP/web
  CI quality scripts.

- [ ] **Step 1: Write failing integration assertions**

Add these expectations:

```javascript
// hook dispatch test
assert.deepEqual(markdownInvocation.args.slice(-3), ['markdown', 'lint', '--cached']);

// generated PHP quality script
assert.match(check, /markdown lint --cached/);
assert.match(check, /markdown lint --changed-from "\$BASE"/);
assert.equal(check.indexOf('markdown lint') > check.indexOf('doctor --local-only'), true);
assert.equal(check.indexOf('markdown lint') < check.indexOf('php -l'), true);

// generated CI continues to call only the shared check-php entry point.
assert.match(workflow, /check-php\.sh --ci --base=/);
```

Extend `tests/Shell/pre_commit_index_lint_test.sh` with one Markdown case: stage
`docs/guide.md` containing an MD001 heading jump, replace the working tree with
a clean heading, run the hook, and require the staged `MD001` failure.

Extend `tests/Shell/toolchain_entrypoints_test.sh` to require
`packages/prism-core/prompts/check.md` to contain
`prism-tool markdown lint --changed-from` and the separate-base-resolution
instruction.

- [ ] **Step 2: Run the focused tests to verify Red**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js
bash tests/Shell/pre_commit_index_lint_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: FAIL because no enforcement surface calls the checker.

- [ ] **Step 3: Add shared enforcement wiring**

In Core `hook.js`, call the installed launcher with
`markdown lint --cached` after local readiness and before adapter quality.
Keep bootstrap hook wrappers unchanged.

Extend `tests/Shell/fixtures/fake-prism-tool.sh` so the `markdown` command
delegates to the source-checkout launcher, while an optional
`PRISM_MARKDOWN_STATUS` override can force a fixture failure. This keeps hook
tests on the real Markdown boundary instead of silently succeeding.

In `.github/hooks/pre-commit`, add this block immediately after mandatory
readiness:

```bash
# ── Markdown (staged blobs, Core-owned policy) ───────────────────────────────
echo "→ Markdown lint"
"$PRISM_TOOL_PATH" markdown lint --cached
```

In `packages/prism-core/prompts/check.md`, add a Markdown gate after repository
state. The prompt must instruct the agent to resolve the target merge base in one
tool call, retain the literal SHA, then pass that retained SHA as the final
argument to `prism-tool markdown lint --changed-from` in a later call.

In repository CI, add a post-readiness step that chooses
`${{ github.event.pull_request.base.sha }}` for pull requests and
`${{ github.event.before }}` for protected-branch pushes, then runs:

```bash
node packages/prism-core/scripts/prism-tool.js markdown lint --changed-from "$BASE_SHA"
```

In the generated `.github/scripts/check-php.sh` template, add:

```bash
if [[ "$MODE" == --ci ]]; then
    prism-tool markdown lint --changed-from "$BASE"
else
    prism-tool markdown lint --cached
fi
```

Place it after `doctor --local-only` and before PHP syntax checks. Do not copy
Markdown path or rule policy into the adapter.

- [ ] **Step 4: Run integration and parity tests to verify Green**

Run:

```bash
node --test tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Node/prism-tool-markdown.test.js
bash tests/Shell/pre_commit_index_lint_test.sh
bash tests/Shell/toolchain_entrypoints_test.sh
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/scripts/prism-tool/hook.js .github/hooks/pre-commit packages/prism-core/prompts/check.md .github/workflows/ci.yml packages/prism-php-web/scripts/toolchain/bootstrap-scaffold.js tests/Node/prism-tool-bootstrap-seed.test.js tests/Node/prism-tool-php-web-bootstrap.test.js tests/Shell/pre_commit_index_lint_test.sh tests/Shell/toolchain_entrypoints_test.sh tests/Shell/fixtures/fake-prism-tool.sh
prism-tool commit create --type ci --scope markdown --subject "enforce shared markdown gate"
```

### Task 4: Retire completed development artifacts

**Files:**

- Delete: all 56 pre-existing files under `docs/plans/` while retaining this
  plan.
- Delete: all 23 pre-existing specs under `docs/specs/` while retaining
  `docs/specs/2026-08-26-pi-documentation-modernization-spec.md`.
- Delete: `docs/handoffs/2026-08-21-setup-managed-lockstep-package-releases-handoff.md`
- Delete: `docs/follow-ups/2026-08-12-pi-conversion-deferred-work.md`
- Retain unchanged: every file under `docs/research/`.
- Retain for targeted reconciliation:
  `docs/follow-ups/2026-08-18-learning-pipeline-interventions.md`.

**Interfaces:**

- Consumes: ADR-0027 lifecycle and the approved disposition in the spec.
- Produces: a live artifact tree containing only the current plan/spec and
  retained current evidence.

This is a zero-behavior-delta artifact-lifecycle fast path; no new test is
required.

- [ ] **Step 1: Reconfirm the disposition against branch evidence**

Run:

```bash
git ls-files docs/plans docs/specs docs/handoffs docs/follow-ups docs/research
```

Expected before deletion: 56 old plans plus this plan, 23 old specs plus the
current spec, one handoff, two follow-ups, and ten research notes. Confirm that
the old plans/specs describe merged, superseded, or retired work and that the
retained learning intervention record still defines a current non-goal.

- [ ] **Step 2: Delete only obsolete artifacts**

Run:

```bash
git rm docs/plans/2026-07-*.md docs/plans/2026-08-02-*.md docs/plans/2026-08-03-*.md docs/plans/2026-08-10-*.md docs/plans/2026-08-11-*.md docs/plans/2026-08-12-*.md docs/plans/2026-08-13-*.md docs/plans/2026-08-15-*.md docs/plans/2026-08-16-*.md docs/plans/2026-08-17-*.md docs/plans/2026-08-18-*.md
```

```bash
git rm docs/specs/2026-07-*.md docs/specs/2026-08-03-*.md docs/specs/2026-08-13-*.md docs/specs/2026-08-15-*.md docs/specs/2026-08-16-*.md docs/specs/2026-08-17-*.md docs/specs/2026-08-18-*.md docs/specs/2026-08-19-*.md
```

```bash
git rm docs/handoffs/2026-08-21-setup-managed-lockstep-package-releases-handoff.md docs/follow-ups/2026-08-12-pi-conversion-deferred-work.md
```

- [ ] **Step 3: Find living references to deleted paths**

Run:

```bash
rg -n 'docs/(plans|specs|handoffs)/|2026-08-12-pi-conversion-deferred-work' README.md CODING_HARNESS.md CONTRIBUTING.md NPM.md SECURITY.md CONTEXT.md adr/README.md docs packages/prism-core packages/prism-php-web --glob '*.md' --glob '!skills/**' --glob '!prompts/**'
```

Record every living hit for the owning documentation task. Historical ADR and
generated changelog hits remain untouched.

- [ ] **Step 4: Verify the retained tree and Markdown gate**

Run:

```bash
find docs/plans docs/specs docs/handoffs docs/follow-ups docs/research -maxdepth 1 -type f -name '*.md' -print | sort
```

Expected: this plan, the current spec, the retained learning follow-up, and all
research notes; no handoff or old development artifact.

Run the changed-from Markdown gate against
`c4bce74c0bac7886683e55d82055961d3613faae`. Expected: PASS for
retained/changed Markdown; deleted files are ignored.

- [ ] **Step 5: Create the commit**

```bash
git add -u docs
prism-tool commit create --type chore --scope docs --subject "retire completed development artifacts"
```

### Task 5: Rewrite public and contributor documentation

**Files:**

- Modify: `README.md`
- Modify: `CODING_HARNESS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `NPM.md`
- Modify: `SECURITY.md`

**Interfaces:**

- Consumes: `CONTEXT.md`, accepted Pi-era ADRs, current commands, package
  contracts, and protected phrases in existing Node/shell tests.
- Produces: direct Pi-first user, contributor, package-publication, and security
  journeys. `CODING_HARNESS.md` owns the detailed engineering pipeline;
  `README.md` links to it instead of duplicating it.

This is a documentation fast path with existing semantic contract tests before
and after the rewrite.

- [ ] **Step 1: Capture the existing public contract baseline**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
bash tests/Shell/model_agnostic_test.sh
bash tests/Shell/instruction_shell_safety_test.sh
bash tests/Shell/pr_command_test.sh
bash tests/Shell/check_distill_contract_test.sh
```

Expected: PASS before prose changes.

- [ ] **Step 2: Rewrite each file through one Distill pass**

Use these exact ownership outlines:

```text
README.md
  What Prism is
  Install Core and the PHP/web adapter
  Run /setup in established and strict-empty projects
  Daily workflow summary with link to CODING_HARNESS.md
  Commands and on-demand skills
  Toolchain readiness and Markdown gate
  Git, review, release, labels, security, license

CODING_HARNESS.md
  Pi-native architecture: one agent, skills on demand
  On-ramps and fast path
  Brainstorm/spec/architect/plan cycle
  TDD execution and per-task verification
  Finalization, /check, four-axis review, /pr
  Human-only push and merge
  Model strategy and current command catalogue
  Research/tool integrations without MCP migration framing

CONTRIBUTING.md
  Prerequisites and setup
  Issues, work branches, and Git Flow
  TDD, verification, /check, and review
  Atomic prism-tool commits
  Human push/PR/release responsibilities
  Bug/feature reporting and licensing

NPM.md
  Published packages and ownership
  Current publication-readiness checks
  Human account preparation
  /release and post-merge npm publication
  Consumer update commands
  Deprecation, recovery, and first-publication checklist

SECURITY.md
  Supported versions
  Exact private reporting destination
  Disclosure process
  Credential and public-issue warning
```

Remove migration narration, stale paths, promotional filler, duplicate pipeline
explanations, and outdated “missing package metadata” instructions. Preserve
current strict-empty setup states, review-chain semantics, human-only
publication, exact commands, support contacts, and OpenCodeReview/`ocr` where
current.

- [ ] **Step 3: Run the Markdown gate and fix structural violations**

Run:

```bash
prism-tool markdown lint --changed-from c4bce74c0bac7886683e55d82055961d3613faae
```

Expected: PASS. Fix document structure, not the packaged policy.

- [ ] **Step 4: Re-run public contract tests**

Run the six commands from Step 1 again.

Expected: PASS without modifying tests. Manually verify each paragraph states a
fact, instruction, constraint, or useful transition.

- [ ] **Step 5: Create the commit**

```bash
git add README.md CODING_HARNESS.md CONTRIBUTING.md NPM.md SECURITY.md
prism-tool commit create --type docs --scope public --subject "rewrite pi user and contributor guidance"
```

### Task 6: Rewrite Prism Core documentation

**Files:**

- Modify: `packages/prism-core/README.md`
- Modify: `packages/prism-core/docs/context-management.md`
- Modify: `packages/prism-core/docs/design.md`
- Modify: `packages/prism-core/docs/research.md`
- Modify: `packages/prism-core/extensions/safety/README.md`

**Interfaces:**

- Consumes: Core package contract, ADR-0058, ADR-0063, ADR-0074,
  ADR-0077–0087, ADR-0089, and ADR-0090.
- Produces: one current Core package reference, three focused practice guides,
  and a current safety-extension threat model. The safety README alone retains
  narrow pre-Pi provenance where it explains live compatibility behavior.

- [ ] **Step 1: Capture the Core documentation baseline**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
bash packages/prism-core/scripts/validate-harness.sh
```

Expected: PASS.

- [ ] **Step 2: Rewrite by Core reader job**

Use these outlines:

```text
packages/prism-core/README.md
  Core responsibility and package contents
  Global install and project-local adapter handoff
  Toolchain/readiness, including Markdown lint
  Established and strict-empty setup
  Repository creation, hooks, root seed, recovery
  Approval/consent boundaries
  Human publication boundary and license

context-management.md
  When context degrades
  Observable thresholds
  Rewind, compact, persist, handoff, and new-session choices
  Short decision table and rules

design.md
  ADR versus RFC decision
  RFC requirement and template
  C4-lite diagram conventions
  Approval and lifecycle rules

research.md
  Source trust and untrusted-content boundary
  Local docs versus cited web research
  Citation/output contract
  Approval and mutation limits

extensions/safety/README.md
  Extension files and responsibilities
  Sensitive paths, destructive commands, commit latch, denial breaker
  Adapter safe-dir data contract
  Structured redacted diagnostics and known limits
  Current smoke tests
  Narrow port provenance only where it explains a live compatibility rule
```

Do not weaken credential-path names, redacted diagnostic categories,
OpenCodeReview compatibility, or exact setup/seed state strings protected by
tests.

- [ ] **Step 3: Lint the changed Core docs**

Run:

```bash
prism-tool markdown lint --changed-from c4bce74c0bac7886683e55d82055961d3613faae
```

Expected: PASS.

- [ ] **Step 4: Re-run Core contracts**

Run the three commands from Step 1 again. Expected: PASS without changing
semantic assertions.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-core/README.md packages/prism-core/docs/context-management.md packages/prism-core/docs/design.md packages/prism-core/docs/research.md packages/prism-core/extensions/safety/README.md
prism-tool commit create --type docs --scope core --subject "distill core package documentation"
```

### Task 7: Rewrite adapter and specialist documentation

**Files:**

- Modify: `packages/prism-php-web/README.md`
- Modify: `packages/prism-php-web/docs/conventions.md`
- Modify: `packages/prism-php-web/docs/mocking.md`
- Modify: `packages/prism-php-web/docs/refactoring.md`
- Modify: `packages/prism-php-web/docs/tests.md`
- Modify: `packages/prism-php-web/docs/visual-review.md`
- Modify: `docs/agents/labels.md`

**Interfaces:**

- Consumes: PHP/web stack conventions, no-MVC boundary, adapter toolchain,
  bootstrap provider, visual-review contract, and label vocabulary.
- Produces: one adapter entry point, focused technical references, and one
  canonical issue-label guide.

- [ ] **Step 1: Capture adapter and specialist baselines**

Run:

```bash
node --test tests/Node/toolchain-packaging.test.js tests/Node/visual-review.test.js
bash tests/Shell/toolchain_entrypoints_test.sh
```

Expected: PASS.

- [ ] **Step 2: Rewrite by adapter reader job**

Use these outlines:

```text
packages/prism-php-web/README.md
  Adapter responsibility and prerequisites
  Project-local install
  Established and strict-empty bootstrap
  Exact consumer toolchain and shared quality gate
  Visual review and Core handoff
  License

conventions.md
  File naming and indentation
  PHP 8.5/no-MVC/Aurora rules
  Required headers and docs references
  JavaScript progressive enhancement
  Mobile-first SCSS and generated-asset boundary

mocking.md
  Mock only system boundaries
  Prefer dependency injection and narrow SDK-style interfaces
  Pest/Mockery examples and prohibited implementation coupling

refactoring.md
  Evidence-based refactor triggers
  Deletion, duplication, complexity, naming, and verification checks

tests.md
  Behavior-first public seams
  Good tests, bad tests, fixtures, mocks, browser-test limit
  Coverage and shared quality gate

visual-review.md
  Files and declarative configuration
  Allowed actions and capture command
  Inspection/retention contract
  Origin, navigation, filesystem, and evidence trust boundaries
  Recovery

docs/agents/labels.md
  Type and Progress axes
  Optional Wayfinder/meta labels
  Custom fields and invariants
  Conventional Commit mapping
  Brief historical note only
```

Preserve PHP 8.5+, Pest 5/PHPUnit 13, MariaDB/nginx/SCSS/vanilla-JS boundaries,
visual-review exact paths/actions, and the Type/Progress vocabulary.

- [ ] **Step 3: Lint adapter and specialist docs**

Run:

```bash
prism-tool markdown lint --changed-from c4bce74c0bac7886683e55d82055961d3613faae
```

Expected: PASS.

- [ ] **Step 4: Re-run adapter contracts**

Run the three commands from Step 1 again. Expected: PASS.

- [ ] **Step 5: Create the commit**

```bash
git add packages/prism-php-web/README.md packages/prism-php-web/docs/conventions.md packages/prism-php-web/docs/mocking.md packages/prism-php-web/docs/refactoring.md packages/prism-php-web/docs/tests.md packages/prism-php-web/docs/visual-review.md docs/agents/labels.md
prism-tool commit create --type docs --scope php-web --subject "distill adapter and specialist docs"
```

### Task 8: Reconcile living architecture and validate the documentation set

**Files:**

- Modify: `CONTEXT.md`
- Modify: `adr/README.md`
- Modify: `docs/follow-ups/2026-08-18-learning-pipeline-interventions.md`
- Create temporarily, then delete:
  `.pi/tmp/check-documentation-links.mjs`

**Interfaces:**

- Consumes: all prior documentation slices and ADR-0027/0055/0059/0089/0090.
- Produces: current architecture framing, a Pi-native ADR index, explicit
  retained-evidence status, resolved relative links, and final semantic
  acceptance evidence.

- [ ] **Step 1: Reconcile living architecture and retained evidence**

Update `CONTEXT.md` without rewriting glossary definitions unless facts
changed. Replace retired-runtime framing with concise pre-Pi history, retain the
frozen ADR boundary, and make Core Markdown ownership visible in the Core and
toolchain invariants.

Rewrite `adr/README.md` around Pi-era ADR practice. Replace the stale
`.opencode/skills/adr/SKILL.md` path with the on-demand `adr` skill name. Keep
accepted ADR immutability and the 0001–0054 frozen-history boundary exact.

Give the retained learning follow-up a concise current status explaining that
ADR-0071 and the explicit learning surfaces own implemented behavior while the
listed automatic interventions remain rejected/deferred evidence. Remove stale
runtime details that do not support that boundary.

- [ ] **Step 2: Check relative Markdown links and headings**

Write `.pi/tmp/check-documentation-links.mjs` as a dependency-free checker that:

```text
1. reads new/modified Markdown paths from
   `git diff --name-only -z --diff-filter=ACMR c4bce74c0bac7886683e55d82055961d3613faae HEAD -- '*.md'`
2. ignores fenced code blocks and external/mailto links
3. resolves every relative file target from the source file directory
4. builds GitHub-style lowercase heading slugs, including duplicate suffixes
5. verifies local fragments against the target heading set
6. prints source path, line, and unresolved target; exits 1 on any failure
```

Run:

```bash
node .pi/tmp/check-documentation-links.mjs c4bce74c0bac7886683e55d82055961d3613faae
```

Expected: PASS. Delete the temporary checker after the result is recorded.

- [ ] **Step 3: Run semantic retired-runtime scans**

Run:

```bash
rg -n -i 'opencode|open code' README.md CODING_HARNESS.md CONTRIBUTING.md NPM.md SECURITY.md CONTEXT.md adr/README.md docs/agents/labels.md docs/follow-ups/2026-08-18-learning-pipeline-interventions.md packages/prism-core/README.md packages/prism-core/docs packages/prism-core/extensions/safety/README.md packages/prism-php-web/README.md packages/prism-php-web/docs
```

Expected matches are limited to:

- frozen-history framing in `CONTEXT.md` and `adr/README.md`;
- retained evidence in the learning follow-up;
- narrow safety-extension provenance or compatibility evidence; and
- OpenCodeReview/`ocr` product references.

Run a second stale-guidance scan:

```bash
rg -n -i '\.opencode|opencode\.jsonc|plan mode|sub-?agent|MCP server|model tier' README.md CODING_HARNESS.md CONTRIBUTING.md NPM.md SECURITY.md packages/prism-core/README.md packages/prism-core/docs packages/prism-php-web/README.md packages/prism-php-web/docs docs/agents/labels.md
```

Expected: no stale runtime guidance. Any retained literal must be justified by
an approved exception and reviewed in context.

- [ ] **Step 4: Run full documentation and repository verification**

Run:

```bash
prism-tool markdown lint --changed-from c4bce74c0bac7886683e55d82055961d3613faae
git diff --check
npm run test:node
composer test:shell
bash packages/prism-core/scripts/validate-harness.sh
```

Then run `/check`. Expected: every gate PASS, with no debug artifacts,
untracked prototype files, stale links, or unexplained retired-runtime hits.

- [ ] **Step 5: Create the terminal implementation commit**

```bash
git add CONTEXT.md adr/README.md docs/follow-ups/2026-08-18-learning-pipeline-interventions.md README.md CODING_HARNESS.md CONTRIBUTING.md NPM.md SECURITY.md docs/agents/labels.md packages/prism-core/README.md packages/prism-core/docs packages/prism-core/extensions/safety/README.md packages/prism-php-web/README.md packages/prism-php-web/docs
git add -u
prism-tool commit create --type docs --scope architecture --subject "reconcile pi documentation sources"
```

After this commit, load `verification-before-completion` and
`finishing-a-development-branch`. Finalization removes this plan and the
matching spec under ADR-0027, synchronizes the branch, reruns `/check`, performs
one four-axis review, and prepares the human-run pull request without pushing.
