# Pi-native learning test strategy

## Summary

- Test the learning roadmap through deterministic **contract, state-machine, filesystem, Git, and package seams**. Do not test generated explanations, lesson prose, or model quality. [1][2][3]
- Keep model judgment behind narrow structured boundaries. Tests provide fixed curriculum candidates and fixed transfer-adjudication results, then verify validation, sequencing, remediation, persistence, freshness, and privacy invariants. This preserves the decision that transfer checks require application rather than keyword matching without pretending a deterministic test can grade arbitrary natural language. [4]
- Use Node's existing `node:test` suite for pure logic, shell fixture repositories for Git/worktree and filesystem behavior, `validate-harness.sh` for Pi resource contracts, and existing package-smoke tests for shipped-resource parity. No new test framework, extension, external model, or OpenCode-era eval surface is needed. [5][6][7]
- Prove non-blocking behavior structurally: learning state and executables are reachable only from explicitly invoked learning surfaces; normal pipeline skills/prompts contain no learning dispatch or state access; the package still exposes only the safety extension. A model-generated “normal transcript” is not a deterministic acceptance seam. [8][9]
- Run all tests offline with synthetic repositories, injected clocks, fixture digests, fake command runners, and temporary Git worktrees. Assert semantic records and invariants rather than byte-for-byte Markdown snapshots. [10][11]

## Findings

### 1. Test architecture

Adopt four layers, in this order:

1. **Pure Node contract tests**
   - Root selection, path containment, canonical topic IDs, digests, freshness, curriculum composition, assessment state transitions, progress schema, revision conflicts, dashboard derivation, command planning, and porcelain parsing.
   - Inject filesystem, clock, digest, Git-command, and transfer-adjudication boundaries where nondeterminism or model judgment would otherwise enter.
2. **Shell integration tests with disposable projects**
   - Real Git repositories and linked worktrees, ignore/tracked checks, symlinks, locks, atomic replacement, file modes, dirty/untracked/ignored states, and native worktree commands.
   - Reuse `tests/Shell/lib/fixture_helpers.sh` or `test_helpers.sh`; never touch a developer's real learning state.
3. **Pi resource and package contract tests**
   - Parse skill/prompt frontmatter, validate the agreed resource inventory and ownership, smoke-load prompt templates through Pi with `PI_OFFLINE=1`, and verify `npm pack` includes every required learning resource.
   - A Pi smoke command may load a prompt or skill and exit through `--list-models`; it must not submit a prompt to a provider.
4. **Static non-blocking and architecture tests**
   - Exactly one production extension remains: safety.
   - Normal `tdd`, `debug`, `verification-before-completion`, `code-review`, `/check`, and related entry points do not dispatch learning, read learning state, or add questions/gates.
   - Core mechanics remain language-agnostic; adapter fixtures may contribute evidence and topics but cannot redefine persistence, assessment, or worktree semantics.

Do not add prose snapshots, transcript goldens, provider-specific expectations, or “agent answered correctly” assertions. Pi prompt templates expand Markdown into prompts and skills are progressively disclosed instructions; neither surface makes model output deterministic. [1][2]

### 2. `/teach` modes

Test the explicit interface at two seams.

**Static/Pi resource contract**

- `teach.md` has valid Pi prompt frontmatter and the agreed argument hint.
- The supported mode grammar is exactly `explain`, `why`, and `reflect`, with the documented no-mode fallback.
- Profile and depth modifiers are validated against finite values; unknown modes fail with guidance rather than silently choosing behavior.
- No separate `/why`, `/explain`, or `/reflect` prompt templates exist.
- The prompt is read-only: it contains no state mutation, retry/resume, gate invocation, review fix, OCR/SAST execution, or automatic workflow dispatch.
- Pi accepts the packaged prompt in an offline, no-session, no-extension/no-skill smoke load.

**Deterministic dispatch contract**

Represent parsed invocation and selected teaching lens as structured data. Given fixed arguments and fixed available evidence, test:

- target precedence: explicit target, current conversation, then latest meaningful work only as fallback;
- mode/profile/depth selection;
- one workflow contract loaded for a single-workflow target and a second only for a genuine cross-workflow target;
- evidence verdicts such as `PASS`, `FAIL`, `N/A`, and incomplete remain unchanged;
- the optional application question is formative and cannot write mastery state.

Do not assert the wording of the explanation, rationale, misconception, or application question. [12][13]

### 3. Project curriculum generation and freshness

Use small repository fixtures whose evidence boundaries are explicit: a Git project with and without `CONTEXT.md`, a non-Git project, conflicting docs/source, an active adapter, conflicting adapter signals, and a multi-boundary repository.

Assert the normalized curriculum/source-map model:

- every discovered facet or architectural boundary is covered, excluded with evidence, or unresolved;
- unknowns prevent a false “complete” result;
- stable topic slugs, objectives, prerequisites, evidence paths, profile applicability, and confidence are present;
- evidence paths are repository-relative and exclude absolute paths, remotes, identities, credentials, generated files, vendor trees, and private learning state;
- layperson and technical views derive from one topic graph rather than duplicate independent topics;
- an adapter contributes stack roots, exclusions, terms, and technical topics without owning core structure;
- preview mode performs no writes; approved generation writes only the agreed reusable files;
- missing context yields clearly inferred terms and never mutates `CONTEXT.md` automatically;
- large-repository sampling accounts for every identified boundary without requiring every file to be ingested.

For freshness, inject file contents and digests, then verify:

- unchanged evidence retains IDs and current status;
- one changed evidence item stales only dependent topics;
- removed evidence enters review instead of silently deleting topics;
- new boundaries add topics;
- non-Git projects use content digests without invented commit metadata.

Parse generated artifacts into semantic records before assertions. Do not snapshot Markdown prose or ordering that has no contract meaning. [14]

### 4. Assessment, remediation, and dashboard

Split semantic adjudication from deterministic workflow mechanics.

The scenario check has a fixed objective answer and is directly testable. The transfer check requires application to a new situation and explicitly cannot be reduced to keyword matching. Therefore, model-independent tests should inject a structured transfer adjudication such as required-concept results plus `pass`, `partial`, `ambiguous`, or `fail`; tests validate that this result conforms to the rubric schema but do not claim to judge arbitrary prose themselves. [4]

State-machine cases:

- feedback is withheld until both answers are submitted;
- both checks must pass in the same complete attempt and against the current digest;
- passes from different attempts never combine;
- abandoned, partial, ambiguous, or failed attempts remain in progress;
- failed attempts trigger targeted remediation and at most one fresh same-invocation retry;
- the retry uses a distinct scenario/check identifier;
- a second failure stops without automatic continuation;
- successful performance may shorten later explanation but never skips checks;
- failure deepens only the missed concept and never persists an inferred learner profile;
- stale mastery requires fresh reassessment; failed reassessment removes current learned status while preserving attempt counts.

Dashboard tests derive all aggregates from canonical state and verify totals, percentages, per-topic status, prerequisite readiness, dates, and next eligible topic. They also verify the absence of streaks, rankings, time-spent metrics, confidence scores, and raw answers. [4]

### 5. Portable private learning state

Use pure schema/update tests plus real filesystem/Git integration fixtures.

**Root and containment**

- a nested directory inside a Git worktree resolves to that worktree's root;
- two linked worktrees resolve to different roots even though they share a Git common directory;
- a non-Git invocation uses the canonical startup directory and does not walk upward;
- symlinked state components, containment escapes, ambiguous canonicalization, and use of the Git common directory fail closed.

**Ignore and privacy**

- Git writes halt when `docs/learning/.local/` is tracked or not ignored by the nested project ignore contract;
- non-Git writes report locality without claiming encryption;
- schema validation rejects unsupported versions, oversized/non-regular files, malformed digests, invalid profiles, and forbidden fields;
- serialization never contains raw questions/answers, prompts, transcripts, source excerpts, identities, model/provider data, remotes, or absolute paths.

**Mutation semantics**

- injected clocks make timestamps exact and reproducible;
- each successful mutation increments `revision` once;
- stale revisions and lock contention fail without modifying original bytes;
- unsupported future schemas preserve original bytes;
- same-directory exclusive temporary writes, flush, atomic rename, and private modes are verified through an instrumented filesystem adapter and integration probes;
- reset is scoped and leaves curricula/exports untouched; export is versioned, private by default, path-free, and never accesses the network;
- purge enumerates owned regular files and never uses recursive unbounded deletion.

Fault-injection tests should cover failures before write, during flush, before rename, and after rename to prove the documented atomicity boundary. [15]

### 6. Prism contributor overlay

Use one Prism-shaped fixture and one non-Prism fixture. Assert:

- non-Prism targets are refused;
- the overlay references the generic technical graph and does not duplicate generic IDs;
- contributor IDs live under `prism-contributor/*`;
- no `layperson.md` is produced;
- the required shared spine and contribution branches exist as semantic modules;
- PHP/web evidence stays in an adapter branch rather than the generic spine;
- changes to one evidence family stale only dependent contributor topics;
- lessons, attempts, remediation, and persistence use the same generic contracts rather than a contributor-specific engine;
- optional practice never requires repository mutation for mastery.

Tests should assert module IDs, prerequisites, evidence families, and ownership—not authored lesson prose. [16]

### 7. Native worktree guidance and isolation

Use both parser fixtures and real Git integration tests.

**Porcelain parser**

- parse `git worktree list --porcelain -z`, including spaces, newlines, detached heads, locks, prunable/missing entries, and inert hostile-looking path/branch text;
- never parse human-formatted output or evaluate returned text as shell source.

**Command planning and approvals**

Given a fixed repository state, assert exact argv arrays and disclosed effects for list/add/use/remove/prune/repair. Reject implicit branches, `-B`, `--force`, detached normal-development worktrees, duplicate branch checkout, nested/non-empty/symlinked destinations, the main/current worktree, and any plan using `rm -rf` or `git clean`.

**Real worktree fixtures**

- create a main checkout plus two linked worktrees and verify shared refs/objects but independent `HEAD`, index, ignored files, Pi project resources, and `docs/learning/.local/progress.json`;
- prove state root selection never uses `--git-common-dir`;
- verify listing distinguishes tracked, untracked, ignored, locked, detached, and prunable states;
- verify removal blocks dirty/untracked targets and requires an explicit preserve/export/discard decision when private learning state exists;
- verify native removal retains the branch;
- verify prune dry-run precedes mutation and prune removes metadata only;
- simulate checkout hooks/submodules through fixture scripts and assert their effects are disclosed, not silently executed by a test helper.

Run these integration cases on Linux and macOS because path canonicalization and filesystem behavior differ. Windows should be added only with an explicit supported-platform contract. [17]

### 8. Non-blocking, offline, and model-agnostic guarantees

Add negative contract tests that fail if:

- normal development skills/prompts reference a learning dispatcher or `docs/learning/.local/`;
- a production extension other than safety is packaged;
- a learning command is invoked from hooks, `/check`, CI gates, TDD, debugging, verification, or review;
- tests invoke Pi print/JSON/RPC prompt execution, OCR, web search, or a provider;
- living learning resources name or prescribe a model;
- OpenCode eval directories, eval agents, transcript scorers, or model-tier fixtures return.

All Pi smoke tests use an isolated temporary `PI_CODING_AGENT_DIR`, `PI_OFFLINE=1`, `--no-session`, and explicit resource flags. Test commands must not depend on user settings or authentication. [1][6][8][9]

### 9. Proposed suite placement

The final specifications may rename modules, but should preserve these ownership seams:

```text
tests/Node/
├── learning-curriculum.test.js
├── learning-assessment.test.js
├── learning-state.test.js
├── learning-contributor-overlay.test.js
├── teach-contract.test.js
└── worktree-contract.test.js

tests/Shell/
├── learning_state_test.sh
├── learning_non_blocking_test.sh
├── pi_learning_resource_test.sh
└── worktree_learning_isolation_test.sh
```

Extend existing files where they already own the invariant:

- `packages/prism-core/scripts/validate-harness.sh` and `tests/Shell/validate-harness_test.sh` — Pi resource schema, agreed resource inventory, sole-extension and ownership checks;
- `tests/Node/toolchain-packaging.test.js` — package archive inclusion and unrelated-consumer smoke;
- `tests/Shell/model_agnostic_test.sh` — living learning surfaces remain model-agnostic;
- `tests/Shell/pi_ci_contract_test.sh` — new suites run in CI and no OpenCode eval surface returns.

No new dependency is required. [5][6][7][8]

## Acceptance matrix

| Capability | Deterministic evidence | Deliberately not tested |
|---|---|---|
| `/teach` modes | resource grammar, dispatch record, evidence selection, read-only boundaries, offline Pi load | explanation quality or exact prose |
| curriculum generation | semantic topic graph, coverage accounting, paths, ownership, preview/write set | authored lesson wording |
| freshness | fixture digests and dependency-scoped stale transitions | model interpretation of changed meaning |
| assessment | objective scenario result, structured adjudication boundary, state machine, retry cap | arbitrary natural-language transfer grading |
| private state | schema, privacy deny fields, locks, revisions, atomic writes, reset/export | confidentiality beyond filesystem locality |
| contributor overlay | target detection, IDs, modules, ownership, staleness, inherited engine | pedagogical quality of contributor prose |
| worktrees | porcelain parsing, argv plans, real linked-worktree isolation/removal/prune | spawning or supervising Pi sessions |
| non-blocking behavior | absence of hooks/imports/state reads on normal paths; sole extension | generated normal-development transcripts |

## Confidence

**High.** The strategy follows the already resolved capability contracts, Pi 0.84.2's documented prompt/skill/package model, and Prism's existing Node, shell-fixture, validator, package-smoke, model-agnostic, and CI test seams. The only intentionally unverified semantic area is arbitrary natural-language transfer grading; the strategy isolates it instead of disguising a model judgment as deterministic logic.

## Open questions

- The final specification-boundary ticket must choose the exact command/skill/module topology and therefore the final resource-inventory assertions.
- If transfer adjudication later gains a non-model deterministic implementation, it needs a new decision because keyword matching would conflict with the accepted assessment contract.
- Cross-platform support beyond the repository's current Linux/macOS CI posture needs an explicit platform contract before adding mandatory worktree cases.

## Sources

[1] Pi 0.84.2, `docs/prompt-templates.md` — installed local upstream documentation (accessed 2026-08-19).
[2] Pi 0.84.2, `docs/skills.md` — installed local upstream documentation (accessed 2026-08-19).
[3] Pi 0.84.2, `docs/packages.md` — installed local upstream documentation (accessed 2026-08-19).
[4] [feat(learning): define lesson assessment and progress experience](https://github.com/kyaulabs/prism/issues/339#issuecomment-5345244029) — accepted wayfinder resolution (accessed 2026-08-19).
[5] `package.json` — existing Node test entry point and dependency contract (accessed 2026-08-19).
[6] `packages/prism-core/scripts/validate-harness.sh` and `tests/Shell/validate-harness_test.sh` — Pi resource validation seam (accessed 2026-08-19).
[7] `tests/Node/toolchain-packaging.test.js` — package/archive and unrelated-consumer smoke precedent (accessed 2026-08-19).
[8] `tests/Shell/model_agnostic_test.sh` — model-agnostic living-surface contract (accessed 2026-08-19).
[9] `tests/Shell/pi_ci_contract_test.sh` — CI and retired-eval negative contract (accessed 2026-08-19).
[10] `tests/Shell/lib/fixture_helpers.sh` and `tests/Shell/lib/test_helpers.sh` — disposable Git/filesystem fixture conventions (accessed 2026-08-19).
[11] Pi 0.84.2, `docs/usage.md` and `docs/sessions.md` — cwd-scoped resources, offline/no-session CLI behavior, and worktree-relevant session separation (accessed 2026-08-19).
[12] [feat(learning): scope optional reflection exercises](https://github.com/kyaulabs/prism/issues/342#issuecomment-5345544439) — accepted `/teach` modes (accessed 2026-08-19).
[13] [feat(learning): compose non-blocking pipeline teaching](https://github.com/kyaulabs/prism/issues/338#issuecomment-5346011134) — accepted pipeline teaching composition (accessed 2026-08-19).
[14] [feat(learning): define project curriculum generation](https://github.com/kyaulabs/prism/issues/341#issuecomment-5344555567) — accepted generation and freshness contract (accessed 2026-08-19).
[15] [feat(learning): define portable learning-state contract](https://github.com/kyaulabs/prism/issues/343#issuecomment-5338738445) — accepted state, privacy, and mutation contract (accessed 2026-08-19).
[16] [feat(learning): define prism contributor curriculum](https://github.com/kyaulabs/prism/issues/345#issuecomment-5345833213) — accepted contributor overlay contract (accessed 2026-08-19).
[17] [feat(worktree): define native worktree guidance](https://github.com/kyaulabs/prism/issues/344#issuecomment-5345754608) — accepted worktree contract (accessed 2026-08-19).
