# 0009. Mechanized Changed-File Coverage Gate

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-09

## Status

Accepted

## Context

The harness documents an 80% line coverage guarantee "on changed files …
measured, not approximated" in session-bootstrap.md, check.md, and AGENTS.md.
However, CI (ci.yml) only machine-enforces aggregate coverage via
`pest --coverage --min=80`. The per-changed-file gate in check.md section 4
was LLM-assembled — the agent read pest output and git diff results and
hand-constructed a coverage table. This is exactly the "approximated, not
measured" approach the documentation forbids.

Additionally, phpunit.xml's `<source>` denominator was ~89% harness code
(EvalRunner.php + backend/), the `<app>/` webroot was never in the
denominator for seeded repos, and README.md's Configuration Files table
never mentioned phpunit.xml. A self-described "coverage pacifier"
(backend/smoke.php) existed solely to inflate the aggregate gate.

## Decision

1. **Mechanize the changed-file coverage gate.** Introduce
   `.github/scripts/coverage-gate.php`, a PHP CLI script that parses
   PHPUnit/Pest Clover XML, intersects it with changed PHP file paths
   (piped via stdin), and enforces ≥80% line coverage per changed file
   that appears in the coverage `<source>` set.

2. **Single script, two callers.** Both CI (ci.yml) and the local
   `/check` command (check.md) invoke the same script, so the
   machine-enforced gate and the local pre-push gate are identical.

3. **Separation of concerns.** The script accepts a pre-computed file
   list via stdin; callers own the diff-base selection (PR base ref vs
   push before SHA). This keeps the script testable with arbitrary
   file lists.

4. **Keep aggregate `--min=80` as a backstop.** The per-file gate is
   primary; the aggregate gate catches misconfigured diff bases or files
   in `<source>` that escape the changed-file list.

5. **Configure Clover output in phpunit.xml** so coverage XML is always
   generated when `pest --coverage` runs.

6. **Remove `backend/smoke.php`** and its dedicated tests. The pacifier
   is obsolete under per-file gating.

7. **Document `phpunit.xml` in README.md's Configuration Files table**
   so seeded repos know to add `<app>/` and new source directories to
   `<source>`.

## Consequences

- The documented guarantee and the machine-enforced gate are now the same
  statement.
- CI adds one script invocation after the pest coverage step.
- `/check` replaces the LLM-assembled table with a mechanical script call.
- `.github/scripts/coverage-gate.php` is scanned by ArchTest.php (the
  directory is not excluded) and must satisfy strict-types, no-debug, and
  RCS-header conventions.
- New repos seeded from this template must add their `<app>/` directory to
  phpunit.xml's `<source>` block (documented in README).
- Clover XML is now generated on every `pest --coverage` run alongside HTML
  and text reports.

## Alternatives Considered

**Soften the documentation to "aggregate 80%" instead of mechanizing.**
Rejected: the harness deliberately chose "changed files" because aggregate
gates can be gamed (a large, well-tested file dilutes a poorly-tested
changed file). The changed-file guarantee is the better engineering
practice; mechanizing it preserves that intent.

**Compute the diff-base inside the script rather than piping via stdin.**
Rejected: the diff-base selection logic differs for PRs vs pushes (different
GitHub Actions event contexts). Separation of concerns — the caller owns the
git-diff decision, the script owns the coverage-intersection gate.
