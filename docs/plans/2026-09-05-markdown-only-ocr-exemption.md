# Markdown-only OCR Exemption Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Accept truthful, Git-verified OCR non-applicability for Markdown-only version-one review segments without relaxing any other gate.

**Architecture:** A small Core classifier derives applicability from immutable Git metadata. Version-one recording and authoritative verification call it independently; the workflow uses a read-only launcher probe before choosing whether to invoke OCR. Version-two authority and selection remain unchanged.

**Tech Stack:** Node.js built-ins, real local Git fixtures, existing bounded subprocess runner, Core launcher, Markdown instruction contracts; existing PHP/web aggregate gate.

**Originating issue:** none

## Global constraints

- Approved specification: `docs/specs/2026-09-05-markdown-only-ocr-exemption-spec.md`; original design source is commit `f83314a517bc4dd293a2cae6cca55127c7213c80`.
- Architecture verdict: GO-WITH-CONDITIONS. `ADR-required: 0106`.
- Plan approval also ratifies the proposed `adr/0106-verified-markdown-only-ocr-exemption.md`. Complete its acceptance and context changes before runtime implementation.
- Continue the existing work branch `docs/kyau-d002-task-owned-temporary-artifacts`; do not rewrite or discard its existing commits. The temporary-artifact wording in `packages/prism-core/AGENTS.md` is outside the implementation scope and must remain byte-identical.
- Observed planning HEAD: `f83314a517bc4dd293a2cae6cca55127c7213c80`; observed `origin/develop`: `59ba2b99f1f1a002fe7adacffcae8fbeba6807e3`. Recheck current identities before execution and finalization; these observations are not finalization attestations.
- Recognize only `.md` and `.markdown`, case-insensitively. Require a non-empty net diff and qualifying regular Git blobs on every present old/new side.
- Preserve mandatory Semgrep `>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` local readiness. No new dependencies.
- Preserve four axes, mixed-range OCR requirements, consent for external OCR operations, fresh approval for each additional review attempt, exact identities, continuity, Blocking findings, and closure evidence.
- Preserve schema version one and its closed keys; add only tooling outcome `COMPLETE_NO_OCR`. Never relabel it `COMPLETE`. No changes to version-two profiles, byte exposure, authority, or receipt schemas.
- Git metadata, paths, repository prose, process output, and review findings are inert untrusted data. No shell interpolation, external diff drivers, text conversion, credential reads, or extra network operation.
- Keep new Git operations bounded to 1 MiB output and 30 seconds, decode UTF-8 fatally, and fail closed. Disable replacement objects and lazy object fetching for applicability proof.
- Temporary fixtures are task-owned private directories. Do not follow symlinks into unrelated locations or commit operational `.pi` records. Source headers/modelines follow the loaded `rcs-header` skill and existing hook normalization.
- Approval authorizes inline TDD, signed logical commits, matching plan/spec cleanup, target fetch/merge synchronization, unlimited local `/check` runs, one initial four-axis review, revalidation, and automatic preparation-only `/pr`. Standing OCR consent separately controls egress. No push, PR creation/merge, publication, installation, global-file update, or hook activation is authorized.
- This implementation changes JavaScript as well as Markdown. Its own final branch review therefore requires normal OCR; the new exemption cannot approve its own mixed diff.

---

## File responsibilities

| File | Responsibility |
| --- | --- |
| `adr/0106-verified-markdown-only-ocr-exemption.md` | Durable, narrow exception to the active version-one OCR contract |
| `adr/0080-bounded-diff-causal-review-chains.md` | Supersession metadata only; keep accepted body unchanged |
| `CONTEXT.md` | OCR-not-applicable definition, review-chain invariant, accepted ADR link |
| `packages/prism-core/scripts/prism-tool/ocr-applicability.js` (new) | Closed, bounded immutable-range classifier; no review or state writes |
| `packages/prism-core/scripts/prism-tool/review-chain.js` | Tooling-only enum, recording proof, authoritative replay proof |
| `packages/prism-core/scripts/prism-tool/code-review.js` | Read-only applicability grammar and local readiness; preserve existing OCR operation |
| `packages/prism-core/scripts/prism-tool/pr.js` | Disclose verified exempt-segment count without changing version selection |
| `tests/Node/prism-tool-review-chain.test.js` | Real Git applicability, recording, tampering, repair, and PR integration regressions |
| `tests/Node/prism-tool-code-review.test.js` | Probe grammar, local readiness, no-egress behavior; existing normal OCR and v2 dispatch tests |
| `tests/Shell/toolchain_entrypoints_test.sh` | Narrow exemption and retained review/readiness instruction contracts |
| `tests/Shell/pr_command_test.sh` | Truthful disclosure and preparation-only instruction contracts |
| `packages/prism-core/skills/code-review/SKILL.md` | Probe-first version-one review selection and honest axis reporting |
| `packages/prism-core/prompts/pr.md` | Verified exemption disclosure, unchanged recovery and publication limits |
| `packages/prism-core/docs/review-runtime.md` | Separate active v1 exemption from dormant v2 bridge semantics |

Before instruction edits, load `writing-skills` and `pi-docs`, read the installed
skill/prompt-template documentation and required related documents completely,
and preserve existing frontmatter and marked command blocks. This plan adds no
Pi tool registration, SDK integration, or extension.

## Task 1: Prove applicability before recording an exempt segment

**Files:** Create the classifier; modify `review-chain.js` and its Node tests;
accept ADR-0106 and update ADR-0080 metadata plus `CONTEXT.md`.

**Interfaces:**

- Produces `classifyOcrRange({from, to}, context = {})` returning exactly
  `{schemaVersion: 1, from, to, status: 'MARKDOWN_ONLY' | 'REQUIRED'}`.
- `from` and `to` are full lowercase 40- or 64-character commit IDs in the same
  repository. Symbols, tags, empty diffs, absent objects, and malformed metadata
  throw `OcrApplicabilityError` with a fixed diagnostic.
- Uses existing `context.projectRoot`, `context.cwd`, `context.env`, and
  subprocess boundary `context.run`; no classifier injection or configuration.
- Preserves `recordReviewSegment(input, context)` and its stored shape.

- [x] **Step 1: Ratify the architecture before implementation.** Set ADR-0106's
  status to `Accepted`. Add only this paragraph under ADR-0080's Status:

  > Selectively superseded by ADR-0106 for the external OCR requirement on
  > proven Markdown-only version-one ranges. All other review-chain clauses remain.

  Add this glossary entry to `CONTEXT.md`:

  > OCR not applicable: A version-one tooling outcome proving that a segment's
  > exact non-empty immutable Git range affects only qualifying Markdown regular
  > blobs; local tooling/style inspection and the other review axes still complete.

  Add this invariant under Review Chain:

  > Version-one tooling may record OCR not applicable only after exact-range Git
  > proof, repeated during authoritative verification; it never claims OCR ran.

  Add the Architectural Decisions entry:

  > `adr/0106-verified-markdown-only-ocr-exemption.md` — verify Markdown-only OCR
  > non-applicability in version-one chains without changing other review gates.

- [x] **Step 2: Write and run the first failing public regression.** Extend the
  existing test `fixture(t)` to `fixture(t, filename = 'file.txt')`, replacing
  only its three literal `file.txt` path operands with `filename`. Existing
  default callers remain unchanged. Add `.pi/` to the fixture's Git-local exclude
  file so later PR tests do not mistake private state for source changes:

  ```javascript
  fs.appendFileSync(path.join(projectRoot, '.git/info/exclude'), '\n.pi/\n');
  ```

  Add the following helpers and test to `prism-tool-review-chain.test.js`:

  ```javascript
  function segment(target, overrides = {}) {
      return {
          schemaVersion: 1, kind: 'initial', branch: 'fix/tester-abcd-review-chain',
          baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
          to: target.headSha, axes: {...axes(), tooling: 'COMPLETE_NO_OCR'},
          findings: [], closures: [], ...overrides,
      };
  }

  function expectedIdentity(target) {
      return {
          branch: 'fix/tester-abcd-review-chain', baseRef: 'origin/develop',
          baseSha: target.baseSha, headSha: target.headSha,
      };
  }

  test('records explicit OCR non-applicability for a Markdown-only range', (t) => {
      const target = fixture(t, 'review notes.MARKDOWN');
      const record = recordReviewSegment(segment(target), target);
      assert.equal(record.schemaVersion, 1);
      assert.equal(record.segments[0].axes.tooling, 'COMPLETE_NO_OCR');
      assert.equal(fs.statSync(record.path).mode & 0o777, 0o600);
      assert.deepEqual(record.openBlocking, []);
  });
  ```

  Run `node --test tests/Node/prism-tool-review-chain.test.js`.
  Expected RED: the new test fails with `review axis is incomplete`; existing
  tests pass. A fixture failure or unavailable command is not the intended RED.

- [x] **Step 3: Add the bounded proof and recorder integration.** The following
  is the complete target body for `ocr-applicability.js`, with its required RCS
  header/modeline added during execution. Apply it incrementally with Step 4:
  introduce each denial branch only after its public regression is present
  and has demonstrated the intended failure. Do not paste all hardening ahead
  of the tests. The first slice connects the Markdown record to Git proof.

  ```javascript
  'use strict';

  const fs = require('node:fs');
  const {TextDecoder} = require('node:util');
  const {runBounded} = require('./process');

  const LIMIT = 1048576;
  const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  const REGULAR = new Set(['100644', '100755']);
  const MODES = new Set(['000000', '100644', '100755', '120000', '160000']);

  class OcrApplicabilityError extends Error {}

  function reject() {
      throw new OcrApplicabilityError('OCR applicability could not be proven');
  }

  function gitBytes(context, args, input) {
      try {
          const result = (context.run ?? runBounded)('git', ['--no-replace-objects', ...args], {
              cwd: fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd()),
              env: {...(context.env ?? process.env), GIT_NO_LAZY_FETCH: '1'},
              encoding: null, maxBuffer: LIMIT, timeout: 30000, input,
          });
          if (result.error || result.timedOut || result.status !== 0 ||
              !Buffer.isBuffer(result.stdout) || result.stdout.length > LIMIT) reject();
          return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(result.stdout);
      } catch {
          reject();
      }
  }

  function parseEntry(header, name, width) {
      const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([ADMT])$/.exec(header);
      if (!match || !name || name.startsWith('/') ||
          name.split('/').some((part) => ['', '.', '..'].includes(part))) reject();
      const [, oldMode, newMode, oldOid, newOid, status] = match;
      const zero = '0'.repeat(width);
      if (![oldMode, newMode].every((mode) => MODES.has(mode)) ||
          oldOid.length !== width || newOid.length !== width ||
          (oldMode === '000000') !== (oldOid === zero) ||
          (newMode === '000000') !== (newOid === zero)) reject();
      if (status === 'A' && (oldMode !== '000000' || newMode === '000000') ||
          status === 'D' && (newMode !== '000000' || oldMode === '000000') ||
          ['M', 'T'].includes(status) && [oldMode, newMode].includes('000000')) reject();
      if (['M', 'T'].includes(status) &&
          ((status === 'T') !== (oldMode.slice(0, 3) !== newMode.slice(0, 3)) ||
          oldMode === newMode && oldOid === newOid)) reject();
      const sides = [[oldMode, oldOid], [newMode, newOid]].filter(([mode]) => mode !== '000000');
      return {
          eligible: /\.(?:md|markdown)$/i.test(name) && sides.every(([mode]) => REGULAR.has(mode)),
          oids: sides.filter(([mode]) => REGULAR.has(mode)).map(([, oid]) => oid),
      };
  }

  function classifyOcrRange({from, to}, context = {}) {
      if (typeof from !== 'string' || typeof to !== 'string' || !SHA_RE.test(from) ||
          !SHA_RE.test(to) || from.length !== to.length) reject();
      for (const sha of [from, to]) {
          if (gitBytes(context, ['rev-parse', '--verify', '--end-of-options', `${sha}^{commit}`]) !== `${sha}\n`) reject();
      }
      gitBytes(context, ['merge-base', '--is-ancestor', from, to]);
      const raw = gitBytes(context, [
          'diff', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff',
          '--no-textconv', '--no-color', '--ignore-submodules=none', '-z', from, to, '--',
      ]);
      if (!raw || !raw.endsWith('\0')) reject();
      const fields = raw.slice(0, -1).split('\0');
      if (fields.length % 2 !== 0) reject();
      const entries = [];
      const names = new Set();
      for (let index = 0; index < fields.length; index += 2) {
          if (names.has(fields[index + 1])) reject();
          names.add(fields[index + 1]);
          entries.push(parseEntry(fields[index], fields[index + 1], from.length));
      }
      let status = 'REQUIRED';
      if (entries.every(({eligible}) => eligible)) {
          const oids = [...new Set(entries.flatMap((entry) => entry.oids))];
          const input = `${oids.join('\n')}\n`;
          if (Buffer.byteLength(input) > LIMIT) reject();
          const objects = gitBytes(context, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], input);
          if (objects !== `${oids.map((oid) => `${oid} blob`).join('\n')}\n`) reject();
          status = 'MARKDOWN_ONLY';
      }
      return {schemaVersion: 1, from, to, status};
  }

  module.exports = {OcrApplicabilityError, classifyOcrRange};
  ```

  Rename detection is deliberately disabled: a rename becomes deletion plus
  addition, so both names and modes are checked without similarity heuristics.
  `cat-file --batch-check` verifies existence and type without reading blob
  contents, including when the raw diff can be computed from trees alone.

  In `review-chain.js`, import `classifyOcrRange`. Keep `AXIS_STATUS` unchanged
  and replace `validateAxes`' loop body with:

  ```javascript
  const exempt = axis === 'tooling' && value[axis] === 'COMPLETE_NO_OCR';
  if (!AXIS_STATUS.has(value[axis]) && !exempt) {
      throw new ReviewChainError('review axis is incomplete');
  }
  ```

  Add this private function and call it with `segments, context` immediately
  before `publish(record, context)` in `recordReviewSegment`. Checking the whole
  proposed chain also prevents a repair from carrying forged prior exemptions:

  ```javascript
  function assertOcrApplicability(segments, context) {
      for (const segment of segments) {
          if (segment.axes.tooling !== 'COMPLETE_NO_OCR') continue;
          let proof;
          try { proof = classifyOcrRange({from: segment.from, to: segment.to}, context); }
          catch { throw new ReviewChainError('review OCR exemption is unproven'); }
          if (proof.status !== 'MARKDOWN_ONLY') {
              throw new ReviewChainError('review OCR exemption is unproven');
          }
      }
  }
  ```

- [x] **Step 4: Extend through one RED→GREEN case at a time.** Import the public
  classifier and `runBounded` into the chain test file. Add these complete
  real-Git and process-boundary cases. Do not implement speculative hardening
  before its case fails for the intended reason; keep already-green cases as
  regression coverage.

  ```javascript
  const {classifyOcrRange} = require('../../packages/prism-core/scripts/prism-tool/ocr-applicability');
  const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');

  function advanceRange(target, change) {
      const from = target.headSha;
      change(target.projectRoot);
      git(target.projectRoot, 'commit', '-q', '-m', 'fixture delta');
      return {from, to: git(target.projectRoot, 'rev-parse', 'HEAD')};
  }

  const rangeCases = [
      ['addition', 'MARKDOWN_ONLY', (root) => {
          fs.writeFileSync(path.join(root, 'new notes.md'), 'notes\n');
          git(root, 'add', '--', 'new notes.md');
      }],
      ['deletion', 'MARKDOWN_ONLY', (root) => git(root, 'rm', '--', 'notes.md')],
      ['Markdown rename', 'MARKDOWN_ONLY', (root) => git(root, 'mv', 'notes.md', 'NOTES.MARKDOWN')],
      ['Markdown to code', 'REQUIRED', (root) => git(root, 'mv', 'notes.md', 'notes.js')],
      ['code to Markdown', 'REQUIRED', (root) => git(root, 'mv', 'notes.js', 'notes.md')],
      ['mixed addition', 'REQUIRED', (root) => {
          fs.writeFileSync(path.join(root, 'code.js'), 'export {};\n');
          fs.writeFileSync(path.join(root, 'notes.md'), 'new notes\n');
          git(root, 'add', '--', 'code.js', 'notes.md');
      }],
      ['regular mode change', 'MARKDOWN_ONLY', (root) => git(root, 'update-index', '--chmod=+x', 'notes.md')],
      ['symlink', 'REQUIRED', (root) => {
          fs.symlinkSync('notes.md', path.join(root, 'link.md'));
          git(root, 'add', '--', 'link.md');
      }],
      ['Gitlink despite ignore configuration', 'REQUIRED', (root) => {
          git(root, 'config', 'diff.ignoreSubmodules', 'all');
          git(root, 'update-index', '--add', '--cacheinfo', `160000,${git(root, 'rev-parse', 'HEAD')},module.md`);
      }],
  ];

  for (const [label, status, change] of rangeCases) {
      test(`classifies ${label} from immutable Git metadata`, (t) => {
          const target = fixture(t, label === 'code to Markdown' ? 'notes.js' : 'notes.md');
          const range = advanceRange(target, change);
          assert.deepEqual(classifyOcrRange(range, target), {schemaVersion: 1, ...range, status});
      });
  }

  for (const name of ['notes.md', 'NOTES.MD', 'review notes.MarkDown']) {
      test(`classifies modification of ${name}`, (t) => {
          const target = fixture(t, name);
          assert.equal(classifyOcrRange({from: target.baseSha, to: target.headSha}, target).status, 'MARKDOWN_ONLY');
      });
  }

  for (const axis of ['standards', 'spec', 'sast']) {
      test(`rejects OCR exemption on ${axis}`, (t) => {
          const target = fixture(t, 'notes.md');
          assert.throws(() => recordReviewSegment(segment(target, {
              axes: {...axes(), [axis]: 'COMPLETE_NO_OCR'},
          }), target), /review axis is incomplete/);
          assert.equal(inspectReviewChain(target).state, 'ABSENT');
      });
  }

  test('rejects non-Markdown recording without publishing state', (t) => {
      const target = fixture(t);
      assert.throws(() => recordReviewSegment(segment(target), target), /review OCR exemption is unproven/);
      assert.equal(inspectReviewChain(target).state, 'ABSENT');
  });

  test('rejects empty and missing-object ranges', (t) => {
      const target = fixture(t, 'notes.md');
      for (const range of [
          {from: target.headSha, to: target.headSha},
          {from: '0'.repeat(40), to: target.headSha},
          {from: target.baseSha, to: 'HEAD'},
      ]) assert.throws(() => classifyOcrRange(range, target), /OCR applicability could not be proven/);
  });

  const invalidDiffs = [
      ['command failure', {status: 1, stdout: Buffer.alloc(0), stderr: 'CANARY'}],
      ['timeout', {status: 0, timedOut: true, stdout: Buffer.alloc(0)}],
      ['overflow', {status: 0, stdout: Buffer.alloc(1048577)}],
      ['invalid UTF-8', {status: 0, stdout: Buffer.from([0xff, 0])}],
      ['truncation', {status: 0, stdout: Buffer.from('partial')}],
      ['malformed record', {status: 0, stdout: Buffer.from('wrong\0notes.md\0')}],
      ['unsupported mode', {status: 0, stdout: Buffer.from(`:100664 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0notes.md\0`)}],
      ['unchanged entry', {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'a'.repeat(40)} M\0notes.md\0`)}],
      ['false type change', {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} T\0notes.md\0`)}],
      ['duplicate path', {status: 0, stdout: Buffer.from(`:100644 100644 ${'a'.repeat(40)} ${'b'.repeat(40)} M\0notes.md\0`.repeat(2))}],
  ];

  for (const [label, response] of invalidDiffs) {
      test(`fails closed on ${label}`, (t) => {
          const target = fixture(t, 'notes.md');
          const calls = [];
          const context = {...target, run: (command, args, options) => {
              calls.push({command, args, options});
              if (args[1] === 'diff') return response;
              return runBounded(command, args, options);
          }};
          assert.throws(() => recordReviewSegment(segment(target), {
              ...target,
              run: (command, args, options) => args[0] === '--no-replace-objects'
                  ? context.run(command, args, options) : runBounded(command, args, options),
          }), /review OCR exemption is unproven/);
          assert.equal(inspectReviewChain(target).state, 'ABSENT');
          const diffCall = calls.find(({args}) => args[1] === 'diff');
          assert.ok(diffCall, 'the intended failing boundary must be reached');
          assert.deepEqual(diffCall.args, [
              '--no-replace-objects', 'diff', '--raw', '--no-abbrev', '--no-renames',
              '--no-ext-diff', '--no-textconv', '--no-color', '--ignore-submodules=none',
              '-z', target.baseSha, target.headSha, '--',
          ]);
          for (const {command, args, options} of calls) {
              assert.equal(command, 'git');
              assert.equal(args[0], '--no-replace-objects');
              assert.equal(options.encoding, null);
              assert.equal(options.maxBuffer, 1048576);
              assert.equal(options.timeout, 30000);
              assert.equal(options.env.GIT_NO_LAZY_FETCH, '1');
          }
      });
  }

  test('rejects missing blobs even when raw tree metadata is available', (t) => {
      const target = fixture(t, 'notes.md');
      assert.throws(() => classifyOcrRange({from: target.baseSha, to: target.headSha}, {
          ...target, run: (command, args, options) => args[1] === 'cat-file'
              ? {status: 0, stdout: Buffer.from('missing\n')}
              : runBounded(command, args, options),
      }), /OCR applicability could not be proven/);
  });
  ```

  Run `node --test tests/Node/prism-tool-review-chain.test.js` after each slice.
  Expected GREEN: valid Markdown records retain the explicit outcome; every
  negative case yields its intended fixed failure or `REQUIRED`, never a waiver.
  Refactor only after green; do not change ordinary completion semantics.

- [x] **Step 5: Verify and commit this logical change.** Run the focused suite,
  `git diff --check`, and staged Markdown lint. Stage only the six Task 1 files.
  In a later exclusive tool call:

  ```bash
  prism-tool commit create --type fix --scope review --subject "prove markdown-only ocr exemptions before recording"
  ```

Task 1 evidence: first public regression failed with `review axis is incomplete`
then passed. Immutable-commit, malformed-metadata, valid-output timeout/overflow,
and missing-blob regressions demonstrated RED before their corresponding
checks were added. Boundary assertions run outside production catch blocks;
malformed-result tests also exercise the public classifier directly. Final
focused suite: 19 passing tests, including data-driven file-kind cases. Full
Node suite: 1,363 passed. Pest: 85 tests / 128 assertions, 100% PHP coverage;
changed-PHP gate: zero files, zero failures. Scoped ESLint, Markdown, pre-commit,
and whitespace checks passed. No dependency or version-two changes.

## Task 2: Reprove every stored exemption and preserve repair gates

**Files:** `review-chain.js`, `prism-tool-review-chain.test.js`.

**Interfaces:** Consumes Task 1's classifier through `assertOcrApplicability`;
keeps `verifyReviewChain(expected, context)`'s return shape and failure contract.
Structural `validateRecordShape` continues to parse version-one records without
acting as applicability authority.

- [x] **Step 1: Add the forged-record regression and run RED.** A structurally
  valid record can contain a false outcome; only authoritative Git proof can
  reject that claim:

  ```javascript
  test('authoritative verification rejects a structurally valid forged exemption', (t) => {
      const target = fixture(t);
      const record = recordReviewSegment(segment(target, {axes: axes()}), target);
      const forged = JSON.parse(fs.readFileSync(record.path, 'utf8'));
      forged.segments[0].axes.tooling = 'COMPLETE_NO_OCR';
      fs.writeFileSync(record.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
      assert.doesNotThrow(() => validateRecordShape(forged));
      assert.equal(inspectReviewChain(target).state, 'VALID');
      assert.throws(() => verifyReviewChain(expectedIdentity(target), target), /review OCR exemption is unproven/);
  });
  ```

  Run `node --test tests/Node/prism-tool-review-chain.test.js`.
  Expected RED: `Missing expected exception`, not a shape or fixture failure.

- [x] **Step 2: Add authoritative proof.** In `verifyReviewChain`, after expected
  branch/base/HEAD comparison and before the existing ancestry loop, insert:

  ```javascript
  assertOcrApplicability(record.segments, context);
  ```

  Do not change ancestry, continuity, Blocking checks, state deserialization,
  the version-two reader's `LEGACY` classification, or PR version dispatch.

- [x] **Step 3: Add round-trip and continuous-repair evidence; run GREEN.** Use
  the Task 1 helpers and add:

  ```javascript
  test('round-trips an exempt initial segment and rejects stale identity', (t) => {
      const target = fixture(t, 'notes.md');
      recordReviewSegment(segment(target), target);
      const verified = verifyReviewChain(expectedIdentity(target), target);
      assert.equal(verified.record.segments[0].axes.tooling, 'COMPLETE_NO_OCR');
      for (const replacement of [
          {branch: 'fix/tester-abcd-different'}, {baseRef: 'origin/main'},
          {baseSha: '0'.repeat(40)}, {headSha: target.baseSha},
      ]) assert.throws(() => verifyReviewChain({...expectedIdentity(target), ...replacement}, target), /identity is stale/);
  });

  for (const close of [false, true]) {
      test(`exempt repair preserves Blocking closure requirement: ${close}`, (t) => {
          const target = fixture(t);
          const initial = recordReviewSegment(segment(target, {
              axes: axes(), findings: [{
                  axis: 'standards', path: 'file.txt', line: 1,
                  summary: 'changed requirement is undocumented', classification: 'BLOCKING',
                  causality: 'introduced by this change', impact: 'required workflow is unusable',
                  evidence: 'fixture confirms missing instructions',
              }],
          }), target);
          const range = advanceRange(target, (root) => {
              fs.writeFileSync(path.join(root, 'notes.md'), 'required instructions\n');
              git(root, 'add', '--', 'notes.md');
          });
          const repaired = recordReviewSegment(segment(target, {
              kind: 'repair', ...range,
              closures: close ? [{fingerprint: initial.openBlocking[0], evidence: 'instructions now cover the failed workflow'}] : [],
          }), target);
          assert.equal(repaired.segments[1].axes.tooling, 'COMPLETE_NO_OCR');
          assert.equal(repaired.openBlocking.length, close ? 0 : 1);
          const expected = {...expectedIdentity(target), headSha: range.to};
          if (close) assert.equal(verifyReviewChain(expected, target).record.segments.length, 2);
          else assert.throws(() => verifyReviewChain(expected, target), /unresolved Blocking/);
      });
  }

  test('cannot carry a forged initial exemption through a valid Markdown repair', (t) => {
      const target = fixture(t);
      const initial = recordReviewSegment(segment(target, {axes: axes()}), target);
      const forged = JSON.parse(fs.readFileSync(initial.path, 'utf8'));
      forged.segments[0].axes.tooling = 'COMPLETE_NO_OCR';
      fs.writeFileSync(initial.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
      const before = fs.readFileSync(initial.path);
      const range = advanceRange(target, (root) => {
          fs.writeFileSync(path.join(root, 'notes.md'), 'notes\n');
          git(root, 'add', '--', 'notes.md');
      });
      assert.throws(() => recordReviewSegment(segment(target, {kind: 'repair', ...range}), target), /review OCR exemption is unproven/);
      assert.deepEqual(fs.readFileSync(initial.path), before);
  });
  ```

  Add these stored-repair and continuity regressions as well:

  ```javascript
  test('rechecks exempt repair ranges rather than only the initial range', (t) => {
      const target = fixture(t, 'notes.md');
      recordReviewSegment(segment(target), target);
      const range = advanceRange(target, (root) => {
          fs.writeFileSync(path.join(root, 'code.js'), 'export {};\n');
          git(root, 'add', '--', 'code.js');
      });
      const repaired = recordReviewSegment(segment(target, {
          kind: 'repair', ...range, axes: axes(),
      }), target);
      const forged = JSON.parse(fs.readFileSync(repaired.path, 'utf8'));
      forged.segments[1].axes.tooling = 'COMPLETE_NO_OCR';
      fs.writeFileSync(repaired.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
      assert.doesNotThrow(() => validateRecordShape(forged));
      assert.throws(() => verifyReviewChain({
          ...expectedIdentity(target), headSha: range.to,
      }, target), /review OCR exemption is unproven/);
  });

  test('an exemption does not make discontinuous stored history valid', (t) => {
      const target = fixture(t, 'notes.md');
      const record = recordReviewSegment(segment(target), target);
      const forged = JSON.parse(fs.readFileSync(record.path, 'utf8'));
      forged.segments[0].from = target.headSha;
      fs.writeFileSync(record.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
      assert.equal(inspectReviewChain(target).state, 'UNSAFE');
      assert.throws(() => verifyReviewChain(expectedIdentity(target), target), /review chain is unavailable/);
  });
  ```

  Run `node --test tests/Node/prism-tool-review-chain.test.js tests/Node/prism-review-chain-v2.test.js tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-pr.test.js`.
  Expected GREEN includes unchanged ordinary v1 records, missing/wrong-axis
  rejection, closure replay, and coherent v2 dispatch.

- [x] **Step 4: Verify and commit.** Inspect the exact diff for state-shape or
  version-two changes; none are authorized. Stage only the two Task 2 files.
  In a later exclusive tool call:

  ```bash
  prism-tool commit create --type fix --scope review --subject "reverify stored markdown-only ocr exemptions"
  ```

Task 2 evidence: a structurally valid forged exemption first failed with
`Missing expected exception`; authoritative re-verification then rejected it.
Round-trip, stale identity, exempt repair closure, forged prior/repair outcomes,
and discontinuity cases pass. The four focused compatibility suites report
83 passing tests; the full Node suite reports 1,369 passing tests. Scoped
ESLint and whitespace checks pass. Runtime delta is one verifier call; record
shape, ancestry, continuity, findings, and version-two code remain unchanged.

## Task 3: Select and disclose non-applicability without external review

**Files:** `code-review.js`, `pr.js`, the two Node test files, two Shell contract
files, `code-review/SKILL.md`, `pr.md`, and `review-runtime.md` listed above.

**Interfaces:**

- Adds exactly `prism-tool code-review applicability --from SHA --to SHA --json`.
  Both operands are full immutable commit IDs; no symbolic `HEAD`, path list,
  policy override, skipped report input, or applicability injection.
- Exit 0 carries Task 1's closed classifier result (`MARKDOWN_ONLY` or
  `REQUIRED`); grammar errors use exit 2, local readiness failure exit 3, proof
  failure exit 4. The probe writes no state and invokes no connectivity/review.
- Strict and pre-review PR probes append `OCR_EXEMPT_SEGMENTS=N` only when
  authoritative version-one verification returns one or more exempt segments.
  No extra field for ordinary v1, v2, or absent state; existing outputs remain
  compatible. The count is disclosure, not authority.

- [x] **Step 1: Write public probe and PR regressions; run RED.** Add this to
  `prism-tool-code-review.test.js`, importing `spawnSync` from `node:child_process`:

  ```javascript
  function initializeRange(target, filename = 'notes.md') {
      const git = (...args) => {
          const result = spawnSync('git', args, {cwd: target.repository, encoding: 'utf8'});
          assert.equal(result.status, 0, result.stderr);
          return result.stdout.trim();
      };
      git('init', '-q');
      git('config', 'user.name', 'Fixture');
      git('config', 'user.email', 'fixture@example.com');
      fs.writeFileSync(path.join(target.repository, filename), 'base\n');
      git('add', '--', filename);
      git('commit', '-qm', 'base');
      const from = git('rev-parse', 'HEAD');
      fs.writeFileSync(path.join(target.repository, filename), 'changed\n');
      git('commit', '-qam', 'change');
      const to = git('rev-parse', 'HEAD');
      const externalRun = target.context.run;
      target.context.run = (command, args, options) => path.basename(command) === 'git'
          ? spawnSync(command, args, options) : externalRun(command, args, options);
      return {from, to};
  }

  for (const [filename, status] of [['notes.md', 'MARKDOWN_ONLY'], ['code.js', 'REQUIRED']]) {
      test(`local applicability reports ${status} without consent or egress`, (t) => {
          const target = fixture(t, {consent: 'absent'});
          const range = initializeRange(target, filename);
          const result = capture(() => main([
              'code-review', 'applicability', '--from', range.from, '--to', range.to, '--json',
          ], target.context));
          assert.equal(result.status, 0, result.stderr);
          assert.deepEqual(JSON.parse(result.stdout), {schemaVersion: 1, ...range, status});
          assert.deepEqual(target.calls.map(({kind}) => kind), ['semgrep-version', 'ocr-version']);
          assert.equal(fs.existsSync(path.join(target.repository, '.pi')), false);
      });
  }

  test('applicability retains mandatory local readiness', (t) => {
      const target = fixture(t, {ocrVersion: {status: 0, stdout: 'open-code-review v2.0.0\n'}});
      const range = initializeRange(target);
      const result = capture(() => main([
          'code-review', 'applicability', '--from', range.from, '--to', range.to, '--json',
      ], target.context));
      assert.equal(result.status, 3);
      assert.match(result.stderr, /external readiness failed/);
      assert.equal(result.stdout, '');
      assert.equal(target.calls.some(({kind}) => kind === 'ocr-connectivity' || kind === 'ocr-review'), false);
  });

  test('applicability rejects symbolic operands and extra controls before external calls', (t) => {
      const target = fixture(t);
      const range = initializeRange(target);
      for (const args of [
          ['--from', range.from, '--to', 'HEAD', '--json'],
          ['--from', range.from, '--to', range.to, '--json', '--skip'],
          ['--from', range.from, '--to', range.to],
      ]) {
          const result = capture(() => main(['code-review', 'applicability', ...args], target.context));
          assert.equal(result.status, 2);
          assert.equal(result.stdout, '');
      }
      assert.deepEqual(target.calls, []);
  });
  ```

  In `prism-tool-review-chain.test.js`, use real Git, the real chain readers and
  verifier, and mock only the local doctor subprocess (the branch-validation
  Bash script remains real):

  ```javascript
  function prContext(target) {
      git(target.projectRoot, 'update-ref', 'refs/remotes/origin/develop', target.baseSha);
      return {...target, cwd: target.projectRoot, run: (command, args, options) => {
          if (command === process.execPath && args.slice(-2).join(' ') === 'doctor --local-only') {
              return {status: 0, stdout: '', stderr: ''};
          }
          return runBounded(command, args, options);
      }};
  }

  test('PR preflight discloses only authoritatively verified exempt segments', (t) => {
      const target = fixture(t, 'notes.md');
      recordReviewSegment(segment(target), target);
      const result = capture(() => main(['pr', 'preflight'], prContext(target)));
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /REVIEW_CHAIN_VERSION\t1\n/);
      assert.match(result.stdout, /OCR_EXEMPT_SEGMENTS\t1\n/);
  });

  test('PR preflight rejects a forged Markdown exemption', (t) => {
      const target = fixture(t);
      const initial = recordReviewSegment(segment(target, {axes: axes()}), target);
      const forged = JSON.parse(fs.readFileSync(initial.path, 'utf8'));
      forged.segments[0].axes.tooling = 'COMPLETE_NO_OCR';
      fs.writeFileSync(initial.path, `${JSON.stringify(forged)}\n`, {mode: 0o600});
      const result = capture(() => main(['pr', 'preflight'], prContext(target)));
      assert.equal(result.status, 4);
      assert.match(result.stderr, /review chain is incomplete, stale, or has unresolved Blocking findings/);
      assert.equal(result.stdout, '');
  });
  ```

  In Task 2's repair test, after computing `expected`, also run
  `capture(() => main(['pr', 'preflight'], prContext(target)))`; assert status
  `close ? 0 : 4`, and assert `OCR_EXEMPT_SEGMENTS\t1` is present only for the
  closed case. This proves a prior code blocker still controls PR readiness.

  Run `node --test tests/Node/prism-tool-code-review.test.js tests/Node/prism-tool-review-chain.test.js tests/Node/prism-tool-pr.test.js`.
  Expected RED: probe grammar is unsupported and the successful PR disclosure
  is absent. Existing negative tests stay green.

- [x] **Step 2: Implement the probe and verified disclosure.** In
  `code-review.js`, import `classifyOcrRange` and `OcrApplicabilityError`. Include
  the latter in `fail()`'s known-error check. Add the exact grammar to `USAGE`
  and dispatch `args[0] === 'applicability'` before existing OCR execution.
  The new handler is:

  ```javascript
  function applicabilityCommand(args, context) {
      if (args.length !== 6 || args[0] !== 'applicability' || args[1] !== '--from' ||
          !SHA_RE.test(args[2]) || args[3] !== '--to' || !SHA_RE.test(args[4]) || args[5] !== '--json') {
          throw new CodeReviewError(EXIT.USAGE, 'applicability arguments are invalid');
      }
      const coreRoot = context.coreRoot ?? path.resolve(__dirname, '../..');
      let contract;
      try { contract = loadCoreContract(coreRoot); }
      catch { throw new CodeReviewError(EXIT.USAGE, 'invalid core toolchain contract'); }
      const readiness = checkExternalTools({
          contract, env: context.env ?? process.env, run: context.run ?? runBounded,
      });
      if (readiness.some(({status}) => status !== 'PASS')) {
          throw new CodeReviewError(EXIT.READINESS, 'external readiness failed');
      }
      const result = classifyOcrRange({from: args[2], to: args[4]}, context);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return EXIT.OK;
  }
  ```

  Do not alter `execute()` or OCR's existing grammar, connectivity, consent, or
  selection behavior. No process result can stand in for local proof.

  In `pr.js`'s preflight, declare `let ocrExemptSegments;` with the other output
  variables. Only inside the successfully verified version-one branch set:

  ```javascript
  ocrExemptSegments = review.record?.segments.filter(
      (segment) => segment.axes.tooling === 'COMPLETE_NO_OCR'
  ).length ?? 0;
  ```

  The optional record accommodates existing boundary-only verifier stubs;
  production verification always supplies the complete validated record. Append
  the disclosure field after `ADVISORY_COUNT` only for a positive count:

  ```javascript
  if (ocrExemptSegments > 0) fields.push(['OCR_EXEMPT_SEGMENTS', String(ocrExemptSegments)]);
  ```

  No input flag, alternate verifier, or direct inspection may manufacture this
  count. Rerun Step 1's focused command and require GREEN.

- [x] **Step 3: Add instruction contracts before changing workflow prose.** Use
  the existing Shell test helpers, adding these assertions before each file's
  final summary:

  ```bash
  assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'prism-tool code-review applicability --from FROM_SHA --to TO_SHA --json' 'review probes the exact immutable range'
  assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'COMPLETE_NO_OCR' 'tooling exposes a distinct OCR outcome'
  assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'all four axes remain required' 'Markdown exemption retains every review axis'
  assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'Mixed ranges retain normal OCR requirements' 'mixed ranges cannot take the Markdown exemption'
  assert_file_contains "$CORE_SKILLS/code-review/SKILL.md" 'A skipped response is not proof' 'empty selection cannot authorize an exemption'
  assert_file_not_contains "$CORE_SKILLS/code-review/SKILL.md" 'human may explicitly waive an' 'prose waivers cannot complete chain evidence'
  ```

  Keep the existing mandatory-tool, no-generic-OCR, local readiness, and
  consent assertions. In `pr_command_test.sh` add:

  ```bash
  assert_contains "$COMMAND_FILE" 'OCR_EXEMPT_SEGMENTS' 'pr consumes verified exemption disclosure'
  assert_contains "$COMMAND_FILE" 'OCR not applicable: verified Markdown-only range' 'pr discloses non-applicability explicitly'
  assert_contains "$COMMAND_FILE" 'Never describe an exempt segment as a completed external OCR review' 'pr never fabricates OCR completion'
  ```

  Run `bash tests/Shell/toolchain_entrypoints_test.sh` and
  `bash tests/Shell/pr_command_test.sh` separately. Require the intended new
  assertion failures before prose changes. No external review or GitHub call
  is authorized by running these offline fixtures.

- [x] **Step 4: Update the instruction surfaces and documentation.** Add this
  block to `code-review/SKILL.md` after local readiness and before OCR selection:

  > For version-one finalization, retain the literal immutable segment endpoints
  > as FROM_SHA and TO_SHA and run the applicability probe below after local
  > readiness. These names are documentation markers, not shell variables;
  > replace them with the validated full commit IDs in a separate tool call.
  > The probe is read-only and grants neither review nor publication authority.

  ```bash
  prism-tool code-review applicability --from FROM_SHA --to TO_SHA --json
  ```

  > A `MARKDOWN_ONLY` result permits `COMPLETE_NO_OCR` for tooling only after
  > local tooling/style inspection completes; all four axes remain required.
  > OCR did not run and need not be invoked for an empty selection. The recorder
  > and authoritative verifier independently reprove the exact range.
  > Mixed ranges retain normal OCR requirements.
  > A `REQUIRED` result uses the existing OCR path.
  > A skipped response is not proof, and a failed or malformed probe
  > cannot establish an exemption. Stop chain completion on that failure.
  > Staged and full-path audits without immutable segment endpoints retain their
  > existing behavior. This exception does not apply to version-two review.

  Extend the report's enumerated statuses to include tooling-only
  `COMPLETE_NO_OCR` and existing spec-only workflow result `COMPLETE_NO_SPEC`,
  without changing legacy runtime acceptance of ordinary outcomes. Replace the
  existing sentence permitting human waiver of an incomplete axis with:

  > Report partial evidence honestly. A prose waiver cannot complete a review
  > chain. `COMPLETE_NO_OCR` requires Git proof and completed local tooling/style
  > inspection; generic `SKIPPED` and `FAILED` remain incomplete.

  Add after `pr.md`'s version-one recovery paragraph:

  > A verified tooling `COMPLETE_NO_OCR` satisfies only the external OCR portion
  > for that Markdown-only segment. It does not waive local readiness, local
  > tooling/style inspection, or another axis. Use the `code-review` skill's
  > exact-range applicability probe; do not rerun OCR merely for an empty
  > selection. Keep version-two recovery unchanged.

  Add to `pr.md`'s preflight field handling and Verification section:

  > `OCR_EXEMPT_SEGMENTS` is an optional positive count on a valid version-one
  > chain only. Match it to the exempt ranges in that same verified chain.
  > Disclose each as "OCR not applicable: verified Markdown-only range" with
  > its exact `from` and `to` commit IDs, separately from the completed local
  > axes and any earlier external OCR review.
  > Never describe an exempt segment as a completed external OCR review.
  > Preflight failure still stops artifact generation, and a valid exemption
  > grants no additional review attempt.

  Add this separate section to `review-runtime.md` before Commands and exits;
  do not alter the later v2 byte-exposure or exemption sections:

  ````markdown
  ## Version-one Markdown-only OCR applicability

  For an attested version-one segment, run the local probe with its full
  immutable commit IDs:

  ```text
  prism-tool code-review applicability --from SHA --to SHA --json
  ```

  The JSON fields are `schemaVersion: 1`, `from`, `to`, and `status`.
  `MARKDOWN_ONLY` proves a non-empty range affecting only `.md` or `.markdown`
  regular Git blobs, matched case-insensitively. Additions, modifications,
  deletions, Markdown-to-Markdown renames, and regular-file mode changes can
  qualify. Both old and new sides count. Mixed paths, code/Markdown renames,
  symlinks, and Gitlinks yield `REQUIRED`; non-Markdown changes retain normal
  OCR requirements.

  Exit 0 reports classification, not review completion. Exit 2 rejects the
  grammar, exit 3 rejects local readiness, and exit 4 reports an unproven range.
  Empty diffs, missing objects, malformed or invalid-encoding metadata, output
  over 1 MiB, and Git failure or a 30-second timeout cannot establish an
  exemption. The probe performs no connectivity test, review, or state write.

  Tooling may record `COMPLETE_NO_OCR` only after local tooling/style inspection
  completes and exact-range proof succeeds. Recording and authoritative chain
  verification independently repeat that proof. Structural inspection alone
  grants nothing. Other axes, mandatory local Semgrep/OCR readiness, applicable
  external-operation consent, review-attempt approvals, exact identities,
  continuous repairs, and Blocking closure requirements remain unchanged.

  PR verification discloses exempt segments as "OCR not applicable: verified
  Markdown-only range" with their exact endpoints. A skipped external response
  remains skipped and is never proof of completion or applicability. Older
  readers fail closed on the new tooling outcome rather than rewriting it as
  ordinary completion.

  This policy applies only to the active version-one path. It changes no
  version-two profile, byte-exposure requirement, receipt, authority, or
  publication boundary (ADR-0106).
  ````

  Rerun the focused Node suites and the two Shell suites; require GREEN.
  Run staged Markdown lint and `git diff --check`. Refactor only duplication
  introduced by this task and only after all its public behaviors are green.

- [x] **Step 5: Verify and commit the completed integration.** Stage only the
  Task 3 files in the responsibility table. In a later exclusive tool call:

  ```bash
  prism-tool commit create --type fix --scope review --subject "select and disclose verified ocr non-applicability"
  ```

Task 3 evidence: unsupported probe grammar, unproven-range diagnostics, and
missing PR disclosure each demonstrated RED before implementation. The local
probe classifies without consent/egress and retains local version checks;
real-chain PR tests retain forged-claim and prior-Blocking rejection. The full
Node suite reports 1,375 passing tests. Instruction contracts demonstrated six
review-policy failures and three PR-disclosure failures before prose changes;
final runs report 210 and 90 passing assertions respectively. Scoped ESLint
and harness validation pass. Pi 0.85.0 skills and prompt-template docs were read
completely before instruction edits. All runtime/contract tasks are complete;
finalization remains pending at the final cleaned and synchronized HEAD.

## Completion and finalization

- [ ] Run `node --test tests/Node/*.test.js tests/Node/*.test.ts`, then the
  complete active `/check` workflow, including the adapter gate from
  `packages/prism-php-web/prompts/check-php.md`. Do not substitute a Node-only
  run for the PHP/web gate. No changed PHP is expected; measure that fact and
  retain the per-changed-file 80% coverage policy unchanged.
- [ ] The adapter coverage command remains exactly
  `prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage`.
  Read and execute the remaining adapter lint, syntax, coverage-list, and Shell
  commands directly from its prompt. Report the absent `test:plugin` script
  separately; run this repository's observed `test:node` suite above.
- [ ] Resolve Core scripts with `prism-tool resolve scripts`, retain the returned
  directory, and invoke its literal `validate-harness.sh` path in a later call.
  Run Markdown through `prism-tool markdown lint --cached` before commits and
  `prism-tool markdown lint --changed-from` with a freshly retained literal
  merge-base SHA during finalization. Do not invoke generic markdownlint.
- [ ] Load `verification-before-completion`, then
  `finishing-a-development-branch`. Remove only this completed plan and its
  matching exemption spec under ADR-0027; preserve the separate authority
  cutover spec. Commit cleanup through the exclusive launcher.
- [ ] Synchronize the validated target, attest current branch/base/HEAD, and run
  full `/check` again at final HEAD. Earlier checks at `a5fc2f8f` or planning
  HEAD are not current evidence. Halt on conflicts or other hard boundaries.
- [ ] Consume the plan's one authorized initial four-axis review only after
  checks pass. The final diff contains classifier/runtime/test JavaScript,
  therefore OCR is applicable. A skipped OCR response is still incomplete.
  No existing skipped documentation report can supply this review.
- [ ] Require a complete truthful chain, no unresolved Blocking findings, clean
  tree, and exact identity revalidation, then invoke preparation-only `/pr`.
  Additional reviews require fresh approval. Do not push, create the displayed
  PR, install this checkout globally, or activate ADR-0103 cutover.

## Plan self-review

- Acceptance criteria 1–6: Task 1's real Git classifier cases, bounded failure
  tests, wrong-axis rejection, and recorder proof; Task 3's no-egress probe.
- Criteria 7–8: Task 2's authoritative forged-record rejection, identity checks,
  initial/repair round trips, preserved blockers, and existing continuity tests.
- Criterion 9: Task 3's real-chain PR preflight and repair-blocker integration;
  existing dirty/base/identity and version-two preflight regressions remain.
- Criterion 10: Task 3's instruction contracts, exact-range disclosure, and
  optional verified count; the count does not substitute for verification.
- Criteria 11–12: No record-key or version-two change; existing ordinary and
  dual-read tests run with every integration gate. No new dependency or external
  operation. All external OCR calls remain behind the existing consent boundary.
- All task interfaces use the same `from`/`to`, `status`, and enum names. Git
  proof rechecks old and new sides via rename-disabled raw records and verifies
  blob existence without reading contents.
- No originating issue; no issue-closing trailer is prescribed. Each logical
  task has one exclusive structured commit command.
- The approved temporary-artifact wording and unrelated authority-cutover spec
  remain untouched. ADR-0106 acceptance precedes runtime code; ADR-0080's body
  remains immutable.
- The user approved this plan with `go`, including ADR-0106 ratification and
  the disclosed initial finalization effects. Additional reviews remain
  separately approval-gated.
