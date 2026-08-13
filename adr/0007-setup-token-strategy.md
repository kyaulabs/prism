# 0007. Setup Command Token Strategy

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-09

## Status

Accepted (partially superseded by ADR-0029 — model delivery mechanism only; token-substitution strategy survives)

## Context

The `/setup` command (`.opencode/commands/setup.md`) replaces template identity
and placeholder tokens with user-provided values during project initialization.
The original design used placeholder tokens (`[EMAIL]`, `kyau <[EMAIL]>`) as
find strings in `sed` substitution commands.

However, the template repository was seeded with the **literal default
identity** (`kyau <git@kyaulabs.com>`, `git@kyaulabs.com`,
`git+abuse@kyaulabs.com`) in all sweep target files — not placeholders. The
`[EMAIL]` placeholder existed only in `setup.md`'s own documentation and in
historical plan documents, never in the files the sweep actually touches.

This mismatch caused first-run `/setup` to report success while replacing zero
identity occurrences. Additionally, the `sed` command for token #1
(`s|kyau <[EMAIL]>|...|g`) had an unescaped bracket expression — `[EMAIL]` in
BRE matches any single character from {E, M, A, I, L}, not the literal string
`[EMAIL]`.

A third issue: `CONTRIBUTING.md` (which contains the literal default identity)
was missing from the 19-file sweep list. All other files carrying the literal
identity were in the sweep, but not this one.

Two design approaches were on the table:

1. **Revert to placeholders** — change every file in the sweep to use
   `[EMAIL]` / `kyau <[EMAIL]>` placeholders, keeping the existing sed find
   strings (with fixed regex escaping).
2. **Find the literals** — change the sed find strings to match the literal
   defaults that already exist in the sweep target files.

The forces at play: the template repository is actively developed and shipped
with the literal defaults (not placeholders), reverting to placeholders would
touch many files and break existing patterns, and the literal defaults serve as
valid usable values until `/setup` is run.

## Decision

We find the literal template defaults, not abstract placeholders.

1. **Token map uses literal defaults.** The find strings are now the actual
   strings present in the template repository:
   `kyau <git@kyaulabs.com>`, `git+abuse@kyaulabs.com`, `git@kyaulabs.com`,
   `kyaulabs/template`, `<app>`, `<domain>`, `<username>`.

2. **Substitution logic is extracted into a testable shell script**
   (`.github/scripts/setup-substitute.sh`) as the single source of truth. The
   `setup.md` command references this script instead of duplicating inline
   `sed` commands. Shell regression tests live at
   `tests/Shell/setup_substitution_test.sh`.

3. **Longest-match-first ordering** in the script — the composite identity
   fires before the bare email, and the abuse contact fires before the bare
   email — prevents partial replacement corruption.

4. **Post-run verification grep** confirms zero remaining old-identity
   occurrences outside LICENSE and NOTICE (which are legal/attribution and
   deliberately excluded from the sweep).

5. **`CONTRIBUTING.md` is added to the sweep** (19 → 20 files).

6. **The abuse contact** (`git+abuse@kyaulabs.com`) maps to
   `abuse@{domain}` — semantically the abuse contact is domain-scoped, not
   person-scoped.

## Consequences

### Positive

- First-run `/setup` now correctly replaces all 7 token types in all 20 sweep
  target files, verified by shell regression tests.
- The substitution script is independently testable; changes to token
  find/replace strings are tested in CI.
- Post-run verification grep catches incomplete sweeps before the user
  assumes the setup is clean.
- `setup.md` is simpler — it references the script rather than carrying inline
  `sed` commands.

### Negative

- **Re-run mode is a known limitation.** After first-run, the literal defaults
  are gone. Re-running `/setup` to change values requires either reverting to
  template defaults first or extending the script to accept find values from
  the `.opencode/setup.json` manifest. A follow-up issue should address
  re-run support.
- **LICENSE and NOTICE retain the original copyright** (`kyau
  <git@kyaulabs.com>`). Users who want their own copyright in these files must
  edit them manually. This is intentional — copyright attribution is a legal
  decision, not a configuration step.

### Neutral

- The substitution script accepts 7 positional arguments. If the token set
  expands, the script signature changes and callers must be updated.
- The `sed` delimiter (`|`) was chosen over `/` to avoid escaping in file
  paths and email addresses. If a user value contains `|`, the substitution
  would break — this is considered vanishingly unlikely.

## Alternatives Considered

- **Revert to `[EMAIL]` placeholders across the template** — rejected: the
  template already ships with literal defaults committed; reverting to
  placeholders would touch every target file and require re-auditing all
  template documentation to ensure placeholder consistency. The literal
  defaults also serve as valid, usable values for users who skip `/setup`.
- **Keep inline seds in setup.md** — rejected: duplicates the substitution
  logic between the command documentation and any shell tests, making drift
  inevitable. Extracting into a tested script is the DRY choice.
- **Leave LICENSE and NOTICE in the sweep** — rejected: legal/attribution
  files should not have their copyright statements rewritten by an automated
  configurator. Copyright assignment is a conscious decision.
