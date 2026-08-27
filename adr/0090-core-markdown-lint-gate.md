# 0090. Core Markdown lint gate

Date: 2026-08-26

## Status

Accepted

Extends ADR-0015, ADR-0025, ADR-0058, ADR-0063, ADR-0070, ADR-0078, and
ADR-0089.

## Context

Prism treats documentation, specifications, plans, and architecture records as
part of the engineering system, but it has no deterministic Markdown quality
gate. Semantic contract tests protect selected instructions and package
boundaries; they do not catch malformed lists, heading defects, inconsistent
fences, or other Markdown structure errors.

The documentation modernization will change many maintained files. A temporary
repository command would help this branch but would not protect future ADRs or
consumer-project documentation. A project-local dependency would also conflict
with Prism's package boundary: Markdown policy is language-agnostic and belongs
to the globally installed Core package, not a stack adapter or each consumer's
development manifest.

The gate must preserve existing architecture. Pre-commit linting must inspect
the staged index under ADR-0015. Local and CI checks must use the same policy
under ADR-0025. Bundled tools must use exact versions and Core-relative
resolution under ADR-0063. Canonical hook wrappers must remain thin under
ADR-0078.

The repository also contains structured Markdown instruction surfaces. Skills,
prompt templates, and agent instructions use executable front matter and
embedded syntax. Applying a general documentation profile to those files
without separate evidence could block valid changes or encourage semantic
rewrites. Accepted historical ADRs present a similar migration risk: a new
linter must not force bulk edits to immutable records.

Markdown files, Git path output, and consumer repository content are data. The
checker must not load project-controlled JavaScript, custom rules, plugins, or
configuration while operating as a Core gate.

## Decision

We adopt a Core-owned, changed-file Markdown lint gate based on
`markdownlint-cli2`.

### Exact bundled ownership

Prism Core declares `markdownlint-cli2` as an exact bundled runtime dependency
in its toolchain contract and package manifests. The source and installation
scope lockfiles capture the resolved graph. Toolchain validation rejects drift.
Routine exact-version updates remain contract and lockfile changes under
ADR-0063 unless ownership, provisioning, or trust boundaries change.

Gate execution never installs, updates, or fetches the tool. Dependency
resolution requires the existing explicit registry authorization, and the
locked graph must pass Prism's dependency audit before acceptance.

### One packaged checker

Core exposes one stable launcher interface:

```text
prism-tool markdown lint --cached
prism-tool markdown lint --changed-from <revision>
```

`--cached` selects new, copied, modified, and renamed Markdown paths from the
Git index and lints their staged blobs. `--changed-from` validates the supplied
Git revision, computes its merge base with `HEAD`, selects the same change
types, and lints the corresponding `HEAD` blobs. The modes are mutually
exclusive. Deleted files and arbitrary caller-supplied path lists are not
linted.

The checker owns Git selection, path classification, blob materialization,
configuration, tool invocation, path translation, bounded output, timeout,
and exit status. Hooks, `/check`, and CI call this interface or its internal
Core module; they do not reproduce linter commands or path rules.

### Required path scope

The initial documentation profile covers changed Markdown in:

- `adr/`;
- `docs/`;
- maintained root documentation;
- package READMEs and package `docs/` trees; and
- maintained extension documentation.

The packaged policy identifies maintained root files and protected exclusions
explicitly. Generated history, legal or licensed text, vendored material, and
unrelated external templates are not silently reformatted.

Skills, prompt templates, agent instructions, and other structured runtime
Markdown are outside the initial profile. Adding them requires a separate
specification and fixtures proving that front matter, embedded syntax, and
instruction semantics remain intact. It does not require a new ADR if the work
retains this tool, Core ownership, packaged configuration, and changed-file
interface.

Only new or modified files are linted. Untouched accepted ADRs and other
historical records are not bulk-normalized to establish a baseline.

### Authoritative packaged policy

Core ships the Markdown configuration used by every gate. It begins with the
standard `markdownlint` rules and records narrow exceptions for technical
prose, exact protected text, tables, and sanctioned maintained-document
markup. Exceptions live in the packaged policy and tests rather than ad hoc
project files.

The checker materializes selected Git blobs in a Core-owned temporary
workspace and runs the linter from that workspace with the packaged
configuration. It does not discover or execute project-local
`.markdownlint*` files, custom rules, plugins, or modules. Gates report
violations and never auto-fix content.

### Data and failure boundary

Git path selection uses NUL-delimited output and argument arrays. Every path is
validated as a contained repository-relative Markdown path before a regular
Git blob is written beneath the owned temporary workspace. Symlinks,
submodules, malformed paths, traversal attempts, unsupported object modes,
ambiguous revisions, configuration drift, tool failures, timeouts, and
unbounded output fail closed.

Diagnostics identify the project-relative path, location, and rule without
printing complete document contents. Temporary files are removed through the
existing owned-workspace cleanup discipline.

### Enforcement surfaces

The canonical Core pre-commit policy runs cached-mode linting so commits are
checked against exact staged content. `/check` and Prism-managed CI run
changed-from mode against their validated branch base. The Prism source
checkout uses the same Core checker rather than retaining an independent
repository-only implementation.

The new gate is a documentation check. It does not move stack-specific quality
behavior from adapters into Core and does not add another extension.

## Consequences

### Positive

- Future ADR and documentation changes receive deterministic structural
  feedback before integration.
- Consumer projects use the same exact tool and policy without adding a
  project-local Markdown dependency.
- Staged, local branch, and CI checks share one implementation and inspect the
  content they claim to validate.
- Changed-file scope protects immutable historical records from bulk style
  churn.
- Packaged configuration prevents project-controlled linter code from
  executing inside a Core gate.

### Negative

- Prism Core gains another runtime dependency, toolchain entry, launcher
  interface, configuration surface, and test matrix.
- Commits that change in-scope Markdown can now fail on structural style
  defects unrelated to semantic contract tests.
- The checker must safely materialize Git blobs and map diagnostics back to
  repository paths.
- Existing consumer documentation receives enforcement only when files change;
  untouched defects remain until edited.

### Neutral

- Distill remains a manual prose-quality process under ADR-0089. Markdown lint
  does not grade tone, accuracy, or architecture.
- Structured runtime Markdown remains eligible for a later dedicated profile.
- Generated, legal, vendored, and immutable content retains its existing
  lifecycle and ownership rules.

## Alternatives Considered

### Repository-only development dependency

Rejected because the policy is language-agnostic, should protect consumer
projects, and would otherwise resolve from each consumer's manifest instead of
the installed Core package.

### Modernization-only lint command

Rejected because it would clean this branch without preventing future drift.

### Lint every Markdown file immediately

Rejected because it would force unrelated edits to accepted historical ADRs,
structured instruction surfaces, generated history, and protected external
text.

### Include skills in the initial profile

Rejected for now because their executable front matter and embedded syntax need
a separate tested contract. The architecture permits a later profile without
changing tool ownership or the public checker interface.

### Load project-local Markdown configuration

Rejected because it permits policy drift and may execute project-controlled
JavaScript, custom rules, or plugins during a Core gate.

### Run through `npx` or another on-demand installer

Rejected because commit and check gates must not require network access or
resolve unpinned code at execution time.

### Use `remark-lint`

Rejected because its plugin-oriented AST ecosystem adds a larger dependency
and executable-configuration surface than Prism needs for deterministic
Markdown structure checks.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
