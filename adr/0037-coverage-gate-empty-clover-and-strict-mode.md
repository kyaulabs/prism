# 0037. Coverage Gate: Empty-Clover Hard-Fail and Out-of-Source WARN/--strict

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-23

Amends: [ADR-0009](0009-mechanized-changed-file-coverage-gate.md)

## Status

Accepted

## Context

The mechanized coverage gate introduced by ADR-0009 has two silent-pass
weaknesses discovered in issue #189:

1. **Empty/degenerate Clover:** When `phpunit.xml`'s `<source>` block is
   empty or misconfigured, phpunit/Pest generates a Clover XML with no
   `<file>` nodes. `coverage-gate.php`'s `xpath('//file')` returns `false`
   (not an empty array), empty `$files` yields an empty `$coverage` map,
   every changed file falls through to SKIP, and the gate exits 0 — a
   "pacifier" inverting the intent of decision 1.
2. **Out-of-source executable files:** Decision 1 deliberately scoped
   enforcement to files "in the coverage `<source>` set." A changed PHP
   file absent from the Clover is SKIPped with no signal. This makes the
   gate's "no exceptions" guarantee a lie when a developer adds a new PHP
   file outside `<source>` (common: an `<app>/` webroot, a new `backend/`
   subdirectory, or the scripts directory itself). The problem is
   compounding — every silent SKIP makes the next more likely.

Additionally, `.github/scripts/coverage-gate.php` lives outside
`<source>` — the gate exempts itself from measurement.

## Decision

1. **Empty Clover → hard FAIL (exit 2).** After `build_coverage_map()`
   returns an empty `$coverage` array, the gate writes a STDERR message
   naming `phpunit.xml <source>` as the remediation and exits 2. This is
   a *clarification* of ADR-0009's anti-pacifier intent — an empty Clover
   passing is an accidental pacifier.

2. **Out-of-source executable files WARN by default, FAIL under
   `--strict`.** A changed PHP file that exists on disk but is absent
   from the Clover is tokenized via `PhpToken::tokenize()`. If it contains
   unambiguous executable-statement tokens (`T_IF`, `T_RETURN`, `T_ECHO`,
   `T_THROW`, `T_INLINE_HTML`, etc.), it emits a loud WARN to STDERR
   and exits 0. Under the new `--strict` flag, WARNs are promoted to
   failures and exit 1. Pure-declaration files (interfaces,
   constants-only, trait-without-bodies, bare-open-tag config files)
   remain SKIP. This *extends* ADR-0009 decision 1's `<source>`-set
   scoping with a graduated enforcement model.

3. **`--strict` is additive and unwired.** The flag is implemented and
   shell-tested but not passed by CI (`ci.yml:204`) or the local
   `/check` command (`check.md:116`). ADR-0025 parity is preserved:
   WARN-only at both call sites. Adopting `--strict` at either caller
   is a coordinated later decision, out of scope for this ADR.

4. **`.github/scripts` joins `<source>`.** The directory is added to
   `phpunit.xml`'s `<source><include>` so `coverage-gate.php` measures
   itself. No collateral — it is the only `.php` file in that directory.

5. **Executable-line heuristic is a nudge, not a measurement.** The
   token-based `has_executable_code()` heuristic has a documented
   limitation: assignment-only bodies without a control structure are
   not detected. The Clover XML remains authoritative for in-source
   files; the heuristic is an out-of-source discovery aid. If false
   negatives are observed, the heuristic can be tightened later.

## Consequences

- The "80% on changed files" guarantee is sharpened: **enforced** for
  in-source files, **warned** for out-of-source executable files.
- The exit-code contract gains `2 = empty/degenerate Clover` (previously
  only used for usage errors and parse failures).
- CI and `/check` both remain WARN-only; `--strict` is an available opt-in
  for stricter local checks.
- `coverage-gate.php` becomes self-measuring (`.github/scripts/` in
  `<source>`).
- `CONTEXT.md` and `check.md` are updated to reflect the new contract.
- An ADR-0009 decision is amended — the `<source>`-set scoping is no longer
  absolute; out-of-source files receive graduated enforcement.

## Alternatives Considered

**Pure WARN-only (no `--strict` flag).** Rejected: a WARN that never FAILs
is a louder SKIP — developers learn to ignore it. The `--strict` flag gives
teams a lever to incrementally tighten enforcement without breaking CI
immediately.

**Hard FAIL for all out-of-source files (no heuristic).** Rejected:
immediately breaks legitimate standalone scripts (config files, the
coverage-gate itself pre-ADR) and creates noise on every excluded PHP file.
The token heuristic filters pure declarations from executable code, making
the WARN actionable rather than noisy.

**Use pcov/Clover for out-of-source detection instead of tokenizing.**
Rejected: pcov only instruments files in `<source>`. Out-of-source files
are not in the Clover by definition — there is nothing to intersect. The
heuristic is the only available signal without rewriting phpunit config.
