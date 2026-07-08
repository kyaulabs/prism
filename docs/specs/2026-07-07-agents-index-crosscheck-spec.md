# Spec: AGENTS.md Index Cross-Check in validate-harness

**Issue:** [#42](https://github.com/kyaulabs/template/issues/42)
**Date:** 2026-07-07
**Status:** accepted

## Summary

`/doctor` exists in `.opencode/commands/` but is missing from AGENTS.md's
Commands table — the index agents actually load in every session — so it is
undiscoverable. This is the generic drift class (docs vs. filesystem) the
harness elsewhere solves with contract tests. Fix: add the missing row, then
extend `validate-harness.sh` to cross-check all three AGENTS.md index tables
(Skills, Agents, Commands) against their corresponding `.opencode/`
directories so the drift cannot reappear.

## Problem

| Category  | Filesystem entries | AGENTS.md table rows | Drift |
|-----------|-------------------|---------------------|-------|
| Commands  | 13                | 12                  | `/doctor` missing |
| Agents    | 8                 | 8                   | In sync |
| Skills    | 24                | 24                  | In sync |

`validate-harness.sh` already validates frontmatter and skill cross-references
but never reads AGENTS.md. Without a contract test, table-vs-filesystem drift
is undetected in CI and pre-commit hooks.

## Approach

**Extend `validate-harness.sh`** with a new "AGENTS.md index cross-check"
section placed after the existing cross-references block (line ~294) and before
the vacuous-pass guard. This is the canonical home for harness-integrity checks
— it already validates frontmatter delimiters, required fields, name-vs-directory
consistency, and cross-reference validity. Adding index-table validation here
keeps all harness contracts in one file, one CI step, one TDD harness.

### Table extraction

- `extract_table <heading_regex>`: awk helper that collects `|`-prefixed
  rows under a `## <heading>` line until the next `## ` heading or EOF.
  Heading-driven, not line-number-driven — survives table reordering and
  column changes.
- `extract_first_column_names`: reads table rows from stdin, splits on `|`,
  takes field 2, strips whitespace, strips leading `` ` `` / `@` / `/` and
  trailing `` ` ``, skips separator rows (`---`). Outputs one bare name per line.

### Forward check (errors — CI fails)

For each category, iterate the filesystem entries and assert every one is
present in the extracted table name set:

| Category | Filesystem glob | Table token format | Table heading |
|----------|----------------|-------------------|---------------|
| Commands | `.opencode/commands/*.md` | `/name` | `## Commands` |
| Agents   | `.opencode/agents/*.md`   | `@name` | `## Agents Available` |
| Skills   | `.opencode/skills/*/`     | `` `name` `` | `## Skills Available` |

Membership check uses `grep -qxF` against the bare-name set (exact-line
match, no regex, no substring false-positives from names appearing in another
row's description column). Missing entries are reported as **errors**
(`err()`), incrementing the global `ERRORS` counter.

### Reverse check (warnings — informational)

For each name in a table's extracted first column, warn if no corresponding
file or directory exists in `.opencode/`. Catches stale index rows pointing
to deleted skills, agents, or commands. Reported as **warnings** (`warn()`),
incrementing `WARNINGS` without failing CI.

The built-in `customize-opencode` skill is not in `.opencode/skills/` nor in
the AGENTS.md Skills table — it does not produce false positives in either
direction.

### AGENTS.md row addition

Insert into the Commands table:

```
| `/doctor` | Toolchain health check — verifies dev tools are installed at version floors; reports PASS/FAIL/SKIPPED table + go/no-go summary |
```

Placed near `/setup` (tooling-adjacent grouping).

## Acceptance Criteria

1. AGENTS.md Commands table lists all 13 commands (the `/doctor` row is present).
2. Deleting a row from any AGENTS.md table makes `validate-harness.sh` exit
   non-zero (forward check catches the drift).
3. Adding a file to `.opencode/{commands,agents,skills}` without a
   corresponding AGENTS.md table row makes the validator fail.
4. Adding a table row without a corresponding file produces a warning.
5. The real repository passes `bash .github/scripts/validate-harness.sh` with
   exit code 0 after both changes are applied.

## Non-Goals

- The `aurora/` git submodule has its own `AGENTS.md` and
  `validate-harness.sh` — not touched by this change.
- No change to `.github/workflows/ci.yml` (it already runs
  `validate-harness.sh` and the shell regression tests).
- No CONTEXT.md update (harness tooling is not domain-coupled).
- No change to the frontmatter or cross-reference validation sections of
  `validate-harness.sh`.

## Test Plan

TDD via `tests/Shell/validate-harness_test.sh`, following the existing
temp-git-repo repro pattern:

| Test | Category | Direction | What | Assertion |
|------|----------|-----------|------|-----------|
| 5 | Forward | Red→Green | Command file exists, AGENTS.md row missing | Validator exits non-zero; error mentions missing `/name` |
| 6 | Forward | Red→Green | Complete AGENTS.md, then delete one row | Validator exits non-zero (acceptance criterion 2) |
| 7 | Reverse | Red→Green | Table row exists, file/dir missing | Warning emitted (does not fail exit) |

All tests run in CI via the "Shell regression tests" step in
`.github/workflows/ci.yml`.
