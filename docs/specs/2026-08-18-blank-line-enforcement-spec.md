# Blank-Line Enforcement — Specification

- **Date:** 2026-08-18
- **Status:** Approved
- **Type:** fix

## Problem

First-party text files repeatedly accumulate excessive blank lines, most visibly
after RCS headers and before vim modelines. A current-tree scan found 170 runs
containing more than two blank lines, including a 14-line run after the RCS
header in `packages/prism-core/extensions/safety/pre-tool-use.ts`.

Commit `b1f48ee` previously removed 400 lines of RCS-adjacent padding, but the
padding returned. The pre-commit RCS normalizer is the source of that recurrence:
it removes header and modeline marker lines while preserving their adjacent
blank lines, then inserts another blank line around the rebuilt markers. Each
subsequent commit touching a source file can therefore grow both runs.

Existing tools do not close the gap:

- `.editorconfig` guides supporting editors but is not a lint gate.
- ESLint has no `no-multiple-empty-lines` rule configured and does not cover all
  first-party text formats.
- Stylelint has no equivalent configured rule.
- ShellCheck does not enforce blank-line counts.
- PHP-CS-Fixer runs before RCS normalization, which can introduce new padding
  after PHP linting.
- `git diff --check` detects trailing whitespace in changed lines, not excessive
  blank-line runs throughout the tracked tree.
- Existing RCS tests count marker lines but do not assert spacing idempotency.

## Goals

1. Stop the RCS normalizer from growing blank padding on repeated runs.
2. Enforce one blank-line policy across all first-party tracked text files.
3. Check staged blobs in pre-commit and the whole tracked tree in `/check` and
   CI.
4. Report every violation without automatically rewriting general file content.
5. Clean all existing violations without changing production behavior or test
   fixture semantics.

## Non-goals

- Do not reformat third-party dependencies, Git submodules, binary files,
  symlinks, or generated files.
- Do not replace language-specific formatters or linters.
- Do not remove Markdown hard line breaks represented by trailing spaces on a
  non-blank content line.
- Do not automatically collapse general blank-line violations. Automatic
  correction remains limited to spacing owned by the RCS normalizer.
- Do not introduce a new public service, package dependency, or persistent
  configuration format.

## Canonical whitespace policy

For every non-empty first-party tracked text file:

1. The first physical line is not blank.
2. The file ends with exactly one line-feed terminator and no trailing blank
   lines.
3. A blank physical line contains no spaces, tabs, or other horizontal
   whitespace.
4. A section may contain at most two consecutive blank physical lines.
5. An RCS `$KYAULabs:` header is followed by exactly one blank physical line.
6. A vim `ft=` modeline is preceded by exactly one blank physical line and is
   the final content line when the RCS convention requires it.

A line matching only horizontal whitespace is analyzed as blank and also
reported as a whitespace-bearing blank line. Markdown content lines ending in
two spaces remain valid.

## Architecture

### Shared checker

Add the language-agnostic script:

`packages/prism-core/scripts/check-blank-lines.sh`

It exposes two modes:

- `--cached` checks added, copied, modified, and renamed staged blobs.
- `--tracked` checks every tracked regular working-tree file.

The script owns file collection, filtering, byte/text classification, line
analysis, diagnostic aggregation, and stable exit statuses. Its interface is
smaller than the Git/index and line-state details it hides.

The checker obtains paths and content from Git so staged checks inspect the
index rather than unrelated working-tree content, preserving ADR-0015. It uses
NUL-safe path handling. It skips:

- non-regular Git modes, including symlinks and gitlinks;
- blobs containing binary NUL data;
- files marked `linguist-generated` or `linguist-vendored` through
  `.gitattributes`.

No PHP/web-specific paths are embedded in the Prism core checker. Generated
asset and vendored-content exclusions remain data-driven through
`.gitattributes`, preserving the core/adapter boundary.

### RCS normalizer

Update `.github/hooks/pre-commit` so the existing strip-and-rebuild process also
consumes blank runs immediately adjacent to removed RCS headers and modelines.
It then emits exactly one blank line at each applicable boundary.

Placement rules remain unchanged:

- PHP keeps `<?php`, optional `declare(strict_types=1);`, header, then body.
- Non-PHP shebangs remain line 1, with the header immediately after them.
- HTML-first PHP and PHP ending outside PHP context retain their existing
  safety behavior.
- The partial-staging guard continues to block rewrites that could overwrite
  unstaged hunks.

Repeated normalization of spacing-canonical input must be byte-identical apart
from the header metadata fields already refreshed by policy.

### Gate integration

Pre-commit runs in this order:

```text
staged files
  -> existing language linters
  -> RCS normalization and re-staging
  -> check-blank-lines.sh --cached
  -> pass or aggregated failure
```

The hook resolves the checker from Prism core through the existing
`prism-tool resolve scripts` boundary rather than assuming a consumer-local
package checkout.

`packages/prism-core/scripts/validate-harness.sh` invokes
`check-blank-lines.sh --tracked`. The existing `/check`, pre-push, and CI paths
already invoke harness validation, preserving local/CI parity under ADR-0025.

## Data flow

### Cached mode

1. Enumerate staged ACMR paths from the Git index.
2. Retain regular, non-generated, non-vendored text blobs.
3. Analyze the staged blob for each retained path.
4. Aggregate diagnostics across all files.
5. Return success only when no violations exist.

Unstaged working-tree content must not affect the result.

### Tracked mode

1. Enumerate all tracked index entries.
2. Apply the same regular/generated/vendored/text filters.
3. Analyze each retained working-tree file.
4. Aggregate diagnostics and return one final status.

Both modes use the same analyzer and policy; collection and content source are
explicit: cached mode reads index blobs, while tracked mode reads tracked
working-tree files.

## Diagnostics and failure behavior

A metadata-specific diagnostic takes precedence over the generic run diagnostic
for the same lines, so one defect is not reported twice. Diagnostics use stable,
actionable messages such as:

```text
path/to/file.ts:2: RCS header must be followed by exactly one blank line; found 4
path/to/doc.md:18: excessive blank-line run; found 3, maximum 2
config.json:27: trailing blank line
tests/fixture.sh:44: blank line contains spaces or tabs
```

The checker reports all violations in one invocation.

Exit statuses:

- `0` — every selected file is canonical.
- `1` — one or more policy violations were found.
- `2` — invalid invocation, unavailable Git/index data, or an internal checker
  failure.

The checker never modifies files. If pre-commit fails after the RCS normalizer
has made canonical changes, those changes remain staged so the user only needs
to repair the reported non-RCS violations.

## Existing-tree cleanup

Clean every existing first-party violation as part of the implementation:

- collapse ordinary internal runs to no more than two blank lines;
- remove leading and trailing blank lines;
- remove horizontal whitespace from blank lines;
- restore exactly one final newline;
- restore exactly one blank line at RCS boundaries.

If a multiline test fixture semantically requires a longer newline sequence,
replace visually padded physical lines with an explicit escaped-newline
construction and verify that the resulting fixture bytes or behavior remain
unchanged.

## Testing

### Checker regression suite

Add `tests/Shell/check_blank_lines_test.sh` with coverage for:

1. Zero, one, and two internal blank lines pass.
2. Three or more blank lines fail with the correct path, start line, and count.
3. Leading and trailing blank lines fail.
4. Missing or multiple final line feeds fail as applicable under the canonical
   policy.
5. Spaces and tabs on otherwise blank lines fail.
6. Markdown hard-break spaces on content lines pass.
7. RCS boundaries require exactly one blank line.
8. `--cached` reads staged content rather than unstaged working-tree content.
9. `--tracked` catches violations in non-source text formats.
10. Binary files, generated or vendored files, symlinks, and submodules are
    skipped.
11. Filenames containing spaces or newlines are preserved and escaped clearly
    in diagnostics.
12. Multiple violations are aggregated.
13. Invalid invocation or Git failures return status `2`.

### RCS regression suite

Extend `tests/Shell/rcs_header_autoadd_test.sh` to prove:

1. Repeated commits touching one source file do not increase RCS padding.
2. Existing large RCS-adjacent blank runs collapse to one.
3. PHP with `declare(strict_types=1);`, shebang sources, and ordinary JS/TS
   retain their required placement.
4. A second normalization is spacing-idempotent.
5. Existing partial-stage and PHP-context safety behavior remains green.

### Verification

Run:

1. The focused checker regression test.
2. The focused RCS normalizer regression test.
3. `composer test:shell`.
4. `npm run test:node`.
5. The PHP/Pest suite and changed-file coverage gate.
6. `check-blank-lines.sh --tracked`.
7. `/check`.
8. `code-review` before push.

## Acceptance criteria

- No tracked first-party text file violates the canonical whitespace policy.
- Repeated RCS normalization does not grow blank runs.
- Pre-commit rejects staged violations in every text format.
- `/check` and CI reject whole-tree violations.
- Diagnostics identify every violating path and line in one run.
- General violations are fail-only; only RCS-owned spacing is auto-normalized.
- Generated or vendored files, symlinks, submodules, and binary files are
  untouched.
- Existing application, harness, and fixture behavior remains unchanged.

## Risks and mitigations

- **Fixture data changes:** physical blank lines inside heredocs can be semantic.
  Preserve required byte sequences explicitly and run the owning tests.
- **Index/worktree confusion:** cached checks must read Git blobs, not working
  files. Pin this with a staged-versus-unstaged regression test.
- **Filename handling:** newline- or space-bearing paths can break line-based
  loops and diagnostics. Use NUL-delimited Git plumbing, escape diagnostic
  paths, and test both forms.
- **Core/adapter leakage:** generated PHP/web asset and third-party paths do not
  belong in core. Use generic `linguist-generated` and `linguist-vendored`
  attributes instead.
- **Normalizer regression:** moving or trimming content around PHP/shebang
  boundaries can affect execution. Extend the existing integration-level hook
  tests before changing the normalizer.

## Architecture decision

No ADR is proposed. This is a reversible, routine quality-gate correction using
existing Git hook, validator, and tool-resolution boundaries. The post-spec
`architect` review will make the final ADR-required determination.
