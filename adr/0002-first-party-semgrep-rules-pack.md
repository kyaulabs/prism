# 0002. First-Party Semgrep Rules Pack

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-14

## Status

Accepted

## Context

The `@semgrep` agent currently relies entirely on generic registry packs
(`p/php`, `p/secrets`, `p/javascript`) for SAST scanning. These packs are
language-generic — they cannot encode:

- **Aurora-specific footguns**: the constructor's positional `$status` bool
  (a literal `true` leaks stack traces and SQL fragments to visitors).
- **No-framework sinks**: `$db->query("...$var...")` without bound
  parameters, unescaped `echo $_REQUEST[...]`, and `unserialize(` on
  request-reachable data are caught by generic rules only in their most
  obvious forms, if at all.
- **Project conventions**: `ini_set('display_errors', '1')` in application
  code is a violation of Aurora's error-handling contract (the constructor's
  `$status` parameter, wired to `APP_DEBUG` via `env_bool()`, is the single point of control).

The `security-coding` skill (`.opencode/skills/security-coding/SKILL.md`)
documents these defensive patterns in prose, but the detection layer (`@semgrep`)
has no project-specific teeth. The skill and the scanner are decoupled.

Trail of Bits offers a `semgrep-rule-creator` skill in their Codex marketplace,
advocating test-driven rule authoring — write positive/negative fixtures, then
implement the rule, validated by a test harness. This approach maps cleanly to
the repository's TDD conventions (Pest + Red→Green→Refactor).

## Decision

We maintain a first-party Semgrep rules pack at `.semgrep/kyaulabs.yml`, loaded
by `@semgrep` on every invocation alongside the registry packs. Every rule has
positive and negative PHP fixtures in `tests/Semgrep/<RuleId>/` and is
validated by `tests/Unit/Semgrep/RulesPackTest.php` — a Pest test that asserts
each rule fires on its positive fixture and does not fire on its negative
fixture.

**Dual coverage design**: some rules overlap with Pest arch/integration tests
(e.g., `AuroraConstructorStatusTest.php` scans for hardcoded `$status=true` at
the PHP level). The Semgrep rules provide the same detection at a different
pipeline point — during `@semgrep` diff audits (pre-commit review) — while
Pest tests provide the hard gate at `/check` time. Both are intentional:
diff-time early warning + test-time enforcement.

**Rule-authoring convention**: new rules follow TDD:
1. Write positive fixture (code that SHOULD trigger the rule).
2. Write negative fixture (code that SHOULD NOT trigger).
3. Add one row to `semgrepRulesProvider()` in `RulesPackTest.php` — a
   `['dir' => <Dir>, 'rule' => <rule-id>, 'positive' => <expected count>]`
   entry. The positive and negative dataset tests project from this single
   source of truth.
4. Run the test — it fails (Red).
5. Implement the rule in `.semgrep/kyaulabs.yml`.
6. Run the test — it passes (Green).
7. Refactor the rule for precision/performance.

**Suppression policy**: findings may be suppressed inline with
`// nosemgrep: <rule-id> -- <justification>`. Bare `// nosemgrep` is
forbidden. Suppressions are re-reviewed when the named rule is updated.
See the `/security` command's false-positive adjudication protocol.

**Metadata convention (issue #104):** each rule carries a `metadata:`
block with `category: security`, a `cwe:` ID + description, `technology:
[php|generic]`, `confidence:` and `likelihood:` ratings (HIGH/MEDIUM/LOW),
and `references:` pointing to relevant CWE/OWASP pages and ADR-0002. These
blocks are informational — they document the security taxonomy and enable
SARIF consumers to display categorized findings without affecting rule
matching.

## Consequences

- **Easier:** Aurora-specific footguns and no-framework sinks are detected
  automatically at review time; the `security-coding` skill's defensive
  guidance now has machine-enforced backup; the TDD convention keeps rules
  honest (no untested rules).
- **Harder:** new contributors must understand the TDD rule-authoring
  convention; the rules pack adds a maintenance surface (though fixtures make
  regressions immediately visible).
- **Dependency:** requires `semgrep` on the build/review host. Already a
  soft-requirement for `/check` and `@semgrep` — no new tooling.
- **Sync enforcement (issue #94):** a test in `RulesPackTest.php` keeps the
  rules pack, `semgrepRulesProvider()`, and the `tests/Semgrep/<Dir>/`
  fixtures in lock-step. It extracts rule ids from `.semgrep/kyaulabs.yml`,
  asserts set-equality with the provider, verifies each provider directory
  has both `positive.php` and `negative.php`, and rejects orphan fixture
  directories. A rule added to the YAML without a provider row + fixtures
  now fails the test suite — the "no untested rules" invariant is mechanized,
  not aspirational.
- **`--x-ignore-semgrepignore-files` dependency:** the test harness scans
  `tests/Semgrep/` even though `.semgrepignore` excludes it (intentionally
  vulnerable SAST fixtures must not pollute normal scans). It relies on
  semgrep's experimental `--x-ignore-semgrepignore-files` flag to bypass
  that exclusion during validation. Two guards pin it: the scan's exit code
  is asserted `0` (so a failed scan cannot let negatives pass vacuously on
  empty results), and `semgrep scan --help` is checked for the flag name as
  an early-warning canary against rename/removal. If the flag graduates
  (drops the `x-` prefix) or is removed, update `semgrepScanAll()` and the
  canary assertion.
- **CSRF regex expansion (issue #104):** the `pattern-regex` for
  `kyaulabs-missing-csrf-token` was changed from a strict `</form>`
  requirement to `(?:</form>|\z)`, catching forms without closing tags.
  The regex continues to match the full form body so that
  `pattern-not-regex: '(?i)csrf'` (which checks the matched region, not
  the file level) can detect CSRF token hidden inputs and suppress findings.
  The `severity: INFO` and "review manually" message mitigate potential
  false positives from matching inside HTML comments.

## Alternatives Considered

- **Registry-only (status quo)** — no project-specific detection. Rejected:
  the gap between `security-coding` prose and `@semgrep` scans is real and
  growing.
- **Pest-only detection** — writing PHP tests for every pattern duplicates
  what Semgrep does at the AST level. Rejected: complement, don't replace.
  Dual coverage at different pipeline points is the design.
- **External rules repository** — a separate repo for the rules pack adds an
  indirection and a versioning problem. Rejected: keeping rules colocated with
  the code they protect ensures they evolve together.
