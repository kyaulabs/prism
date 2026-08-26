# Spec: Pi documentation modernization and Markdown linting

**Date:** 2026-08-26
**Status:** Approved

## Problem statement

Prism is a Pi coding harness, but its documentation still carries material
from the retired OpenCode runtime. Some maintained guides explain current
behavior through migration comparisons, use stale paths, or repeat
architecture documented elsewhere. Historical plans and specifications also
remain in the working tree after their work has finished, despite the
lifecycle defined by ADR-0027.

A literal repository-wide replacement would damage useful records. Accepted
ADRs preserve decision history. The generated changelog preserves release
history. Legal text, security compatibility rules, regression evidence, and
the separate OpenCodeReview tool also contain terms that must remain exact.
The documentation pass therefore needs a lifecycle-aware boundary rather than
a zero-match search goal.

The maintained documentation is uneven in structure and tone. Several
documents are long, repetitive, or dense enough that readers must reconstruct
the intended workflow across multiple sections. Prism now has the Distill
standard in ADR-0089, so maintained prose should follow one direct,
technically precise style.

Prism also lacks a standing Markdown quality gate. Documentation can pass
semantic contract tests while still accumulating malformed lists, broken
heading structure, inconsistent fences, or other Markdown defects. The
modernization needs an executable lint boundary that applies to every changed
document in this work and to future Prism ADRs and documentation.

## Solution

Modernize Prism's maintained documentation around its current Pi architecture.
Remove stale migration framing from active guidance, retire obsolete
development artifacts, and rewrite maintained prose through Distill. Preserve
historical and technical records according to their lifecycle.

Add `markdownlint-cli2` as an exact, bundled Prism Core tool. A Core-owned
checker will apply a packaged Markdown policy to changed files. Pre-commit
will lint staged blobs, while `/check` and CI will lint the branch change set
through the same checker. This makes the committed content, not an unrelated
working-tree copy, the enforcement boundary.

The work uses five treatments:

1. Fully rewrite maintained public, contributor, package, and reference
   documentation through Distill.
2. Apply targeted factual corrections and status framing to current indexes
   and retained evidence records.
3. Delete completed or obsolete development artifacts instead of polishing
   them.
4. Preserve immutable, generated, legal, third-party, security-compatibility,
   test-evidence, and exact product-name material.
5. Enforce one deterministic Markdown baseline for changed documentation and
   future ADR and documentation changes.

The result should let a reader understand Prism as a Pi harness without
learning the retired runtime first. Historical records remain where they
still explain a decision or constraint, and future documentation changes
receive immediate structural feedback.

## User stories

1. As a new Prism user, I want the main documentation to describe
   installation, setup, and daily use directly in Pi terms, so that I can
   start without interpreting migration history.
2. As a contributor, I want one clear description of the engineering pipeline
   and its gates, so that I do not have to reconcile duplicated or
   inconsistent workflow summaries.
3. As a package consumer, I want the Core and PHP/web package documentation to
   state their boundaries, interfaces, and setup behavior plainly, so that I
   can choose and install the correct package.
4. As a maintainer, I want current documentation to use Prism's canonical
   domain language, so that prose, architecture records, and harness behavior
   use the same terms.
5. As an architecture reader, I want pre-Pi decisions preserved as historical
   records but clearly separated from current guidance, so that I can recover
   context without mistaking retired mechanisms for live behavior.
6. As a maintainer reviewing old development artifacts, I want completed or
   superseded plans, specifications, handoffs, and follow-ups removed from the
   working tree, so that Git history remains the archive and the live tree
   contains only current material.
7. As a security maintainer, I want exact compatibility and
   credential-protection references preserved when they enforce a live safety
   boundary, so that prose cleanup does not weaken protection.
8. As a reviewer, I want protected commands, paths, identifiers, versions,
   state names, links, quotations, and tested phrases to remain accurate, so
   that stylistic changes do not alter technical contracts.
9. As a documentation author, I want a repeatable Distill process for each
   maintained document, so that the repository does not drift back into
   dense, generic, or promotional prose.
10. As a release maintainer, I want generated release history left to its
    generator, so that a prose pass does not create changelog drift.
11. As a future ADR or documentation author, I want Markdown defects reported
    before commit and during the branch gate, so that malformed prose does not
    enter the repository.
12. As a Core consumer, I want the Markdown tool and policy supplied by Prism,
    so that local hooks and CI use the same version and rules without
    on-demand installation.
13. As a Prism developer, I want the prose rewrite kept separate from skills,
    prompt templates, agent instructions, and unrelated source, so that
    Distill cannot change harness behavior under the guise of editing prose.
14. As a future skill author, I want structured skill files excluded until a
    dedicated profile proves that it preserves front matter and embedded
    syntax, so that a documentation gate cannot corrupt an executable
    instruction format.
15. As a future maintainer, I want the work divided into coherent reader
    journeys, so that each review can check meaning, links, and duplication
    within a manageable surface.

## Implementation decisions

### Lifecycle classification

Every documentation-like artifact receives one lifecycle classification
before editing:

- **Maintained guidance:** active public, contributor, package, and reference
  documentation. Rewrite fully through Distill.
- **Current architecture index:** living context and ADR index material.
  Correct facts and terminology, but preserve canonical domain terms and
  accepted decisions.
- **Immutable history:** accepted ADR bodies. Do not rewrite them.
  Supersession follows the ADR process.
- **Generated history:** generated changelog content. Do not edit it by hand.
- **Development artifact:** a plan, specification, or handoff created for an
  implementation branch. Remove it when the described work is complete or
  superseded. Retain it only when it still represents unfinished current
  work.
- **Evidence record:** a research note, audit, or follow-up. Keep it when
  current decisions or unfinished work still depend on it. Prefer a narrow
  status correction over a voice rewrite.
- **Protected external text:** legal, licensed, vendored, or third-party
  template prose. Preserve it.
- **Runtime instruction surface:** skills, prompt templates, and agent
  instruction files. Exclude them from the Distill rewrite and the initial
  Markdown gate. A later specification may add a dedicated structured-
  Markdown profile without rewriting their meaning or format.

The classification is based on purpose and current use, not directory or
filename alone.

### Retired-runtime terminology

Current guidance must not teach Prism through OpenCode migration comparisons
or present retired mechanisms as live concepts. Rewrite those sections around
Pi's current primitives and Prism's current interfaces.

Literal references may remain only when they belong to one of these
exceptions:

- an immutable historical record;
- generated release history;
- legal or attribution text;
- a retained evidence record whose historical subject requires the name;
- a live security-compatibility or credential-protection rule;
- regression evidence;
- the separate OpenCodeReview product and its `ocr` command.

The acceptance target is zero stale retired-runtime guidance outside those
exceptions. It is not zero literal matches across the repository.

### Artifact disposition

A development artifact is deleted when the described work has merged, the
design was superseded, or the subject belongs to retired OpenCode-only
behavior. Git history remains the archive.

An artifact may remain only when all of the following are true:

- it describes unfinished work that still belongs to current Pi architecture;
- no accepted ADR, merged implementation, or newer artifact supersedes it;
- its status is explicit;
- it identifies the current decision or tracker context that will resume the
  work.

Obsolete follow-up records are removed when their items are complete,
abandoned, or tracked by a newer source of truth. Research and audit records
are retained only when they still provide evidence for a current decision or
open concern.

### Distill rewrite contract

Before rewriting a maintained document, identify its reader, job,
source-of-truth dependencies, and technical text that must remain exact.

Correct meaning before style. Remove stale paths, obsolete mechanisms,
duplicated guidance, unsupported claims, and sections whose only purpose is
to narrate the migration. Then make one Distill pass:

- use direct sentences and plain words;
- name concrete actors, commands, states, and failure conditions;
- use sentence-case headings unless a required format says otherwise;
- keep formatting restrained;
- use lists when they improve scanning;
- remove filler, promotion, vague attribution, excessive hedging, and generic
  conclusions;
- preserve canonical Prism terms even when a generic style rule would replace
  them.

Do not rewrite code fences, commands, identifiers, paths, flags, logs,
quotations, citations, links, versions, schema names, state names,
machine-readable examples, required templates, or exact text protected by a
test or external standard.

### Markdown lint contract

Prism Core will bundle an exact `markdownlint-cli2` version in its toolchain
contract and package lockfiles. Registry access and dependency installation
remain separate approved implementation operations. The gate must never fetch
or install a tool at commit or check time.

A Core-owned checker will hide tool discovery, configuration, path selection,
and temporary-file handling behind one stable interface. Every enforcement
surface calls that checker rather than reproducing lint commands.

The permanent required scope is changed Markdown in these maintained surfaces:

- `adr/`, including every new or modified ADR;
- `docs/`;
- maintained root documentation;
- package READMEs and package `docs/` trees;
- maintained extension documentation.

The modernization branch applies the same policy to every Markdown document
it modifies. Untouched accepted ADRs are not bulk-normalized merely to satisfy
a new style tool.

Structured runtime Markdown, including skills, prompt templates, and agent
instructions, is outside the initial required path set. Its executable front
matter and embedded syntax require a separate profile and test contract. A
later specification may add that profile, but this branch must not rewrite or
silently lint runtime instruction surfaces merely to establish a baseline.

The packaged policy starts from the standard `markdownlint` rules and permits
only narrow, documented exceptions needed for technical prose, exact protected
text, tables, front matter, and sanctioned embedded markup. The packaged
configuration is authoritative. The checker must not discover or execute
project-local Markdown configuration, custom rules, plugins, or JavaScript.
Gates are read-only: they report violations and never auto-fix files.

Markdown content and Git path output remain data. The checker must use
NUL-delimited Git output, canonical contained paths, argument arrays, a
Core-owned temporary workspace, bounded subprocess output, and a finite
timeout. It must fail closed on malformed paths, configuration drift, tool
failure, or ambiguous input without printing document contents.

Pre-commit checks the staged index blobs under ADR-0015. `/check` and CI check
new and modified Markdown in the branch change set. Deleted files are ignored.
The same helper, tool version, configuration, path rules, and exit semantics
apply in every environment under ADR-0025 and ADR-0061.

### Reader-journey slices

The implementation should proceed through six independently reviewable
slices:

1. Write the Markdown lint ADR, add the bundled tool and packaged policy, and
   establish the tested changed-file gate.
2. Retire stale development artifacts and obsolete follow-up records.
3. Rewrite the public and contributor entry points around current Pi
   workflows.
4. Rewrite Prism Core package and safety documentation around current
   interfaces and invariants.
5. Rewrite PHP/web adapter and specialist documentation, including
   package-release and label references.
6. Reconcile living architecture documentation, remove duplication and dead
   links, and run repository-wide validation.

Each documentation slice should establish one clear source of truth and
replace repeated detail elsewhere with a link or concise summary.

### Architecture records

ADR-0090 records the Core Markdown gate before implementation. The decision
is cross-cutting and changes the bundled toolchain, canonical hook behavior,
consumer-project checks, configuration ownership, and CI parity. It defines
the chosen tool, required path scope, structured-Markdown treatment,
changed-file semantics, exception policy, and shared enforcement interface.

Existing records continue to govern the surrounding work:

- ADR-0015 governs staged-index linting.
- ADR-0025 governs local and CI parity.
- ADR-0027 governs development artifacts.
- ADR-0055 and ADR-0059 govern the Pi migration and frozen historical
  boundary.
- ADR-0061 governs the scope-owned toolchain contract.
- ADR-0089 governs Distill and protected technical text.

The living project context and ADR index may be updated to describe the
historical boundary in current Pi terms and to add the new accepted decision.
Accepted ADR bodies remain unchanged.

### Dependencies and behavior

The work adds one exact Prism Core runtime dependency: `markdownlint-cli2`.
The Core toolchain manifest and package lockfiles must remain synchronized.
No on-demand package execution is permitted. The selected dependency graph
must pass the existing locked-dependency audit before the gate is accepted.

The documentation rewrite changes no production application behavior. The
Markdown gate changes contributor and consumer-project behavior by adding a
new fail-closed documentation check to the established local and CI quality
surfaces. Only the source, configuration, hook or validator wiring, CI wiring,
lockfiles, documentation, and tests required for that gate are permitted
outside the prose rewrite.

## Testing decisions

The Markdown gate follows Red-Green-Refactor. Tests must fail first for the
new behavior and cover at least:

- required path selection for ADRs, `docs/`, maintained root documents,
  package documentation, and extension documentation;
- exclusion of deleted files and unrelated paths;
- staged-blob linting rather than unstaged working-tree content;
- branch changed-file selection for `/check` and CI;
- packaged configuration resolution through Prism Core;
- exclusion of skills, prompt templates, agent instructions, and other
  structured runtime Markdown from the initial path policy;
- propagation of linter failures and success status;
- safe handling of spaces, unusual Git path characters, symlinks, and paths
  that attempt to escape the repository or temporary workspace;
- refusal to load project-local configuration, custom rules, plugins, or
  executable modules;
- bounded output and timeout behavior without document-content disclosure;
- no network or installation attempt during a gate.

Fixtures should model special Markdown formats. Production skill files must
not be rewritten to make the tests pass.

The highest documentation verification seam remains the public contract
already exercised by the Node package tests. Those tests check required setup
states, package boundaries, release behavior, review-chain language, and
adapter guarantees across the main and package documentation.

Each slice must also pass these checks:

- changed paths belong to the approved lifecycle or Markdown-gate categories;
- prose-rewrite paths exclude skills, prompt templates, agent instructions,
  generated content, legal text, and unrelated source;
- every modified Markdown document in scope passes the packaged lint policy;
- the diff has no whitespace errors;
- current guidance contains no retired-runtime term outside the approved
  exception set;
- protected commands, paths, identifiers, versions, links, and state names
  remain valid;
- relative links and headings resolve within the updated documentation set;
- focused Markdown-gate and documentation contract tests pass;
- the full repository check passes.

Manual review remains necessary because linting cannot judge Distill quality.
Review each documentation slice from the target reader's perspective and
confirm that:

- every paragraph supplies a fact, instruction, constraint, or useful
  transition;
- duplicated explanations have one clear owner;
- historical evidence is not rewritten as present-tense guidance;
- no claim became broader or less precise during editing;
- OpenCodeReview remains clearly distinguished from the retired coding
  runtime.

No browser or database test is required. Production unit tests unrelated to
the Markdown gate remain out of scope.

## Out of scope

- Rewriting skills or skill files as part of the Distill pass.
- Adding the structured-Markdown lint profile for skills, prompt templates, or
  agent instruction files.
- Editing prompt templates or agent instruction files for prose modernization.
- Rewriting accepted ADR bodies.
- Bulk-normalizing untouched historical Markdown solely to satisfy the new
  linter.
- Hand-editing generated changelog content.
- Rewriting legal, licensed, vendored, or third-party template text.
- Removing live security-compatibility references to legacy credential paths.
- Renaming or removing OpenCodeReview or the `ocr` command.
- Reconstructing the deferred OpenCode evaluation framework.
- Adding a link-checking dependency, prose grader, or model-based
  documentation evaluation system.
- Changing package boundaries, consent rules, safety policy, or unrelated
  engineering-pipeline behavior.

## Further notes

The active Wayfinder map is
[wayfinder(docs): modernize Prism documentation for Pi](https://github.com/kyaulabs/prism/issues/419).

Relevant decisions are ADR-0015, ADR-0025, ADR-0027, ADR-0055, ADR-0059,
ADR-0061, ADR-0089, and ADR-0090.

The artifact-retirement slice must inspect Git and current tracker evidence
before deleting retained work. Age or the presence of an OpenCode reference
alone is not sufficient evidence for deletion.
