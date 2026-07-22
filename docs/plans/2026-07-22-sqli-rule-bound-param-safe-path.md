# SQLi Rule Bound-Parameter Safe Path Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make `kyaulabs-sqli-interpolated-query` stop false-positiving on the
real Aurora bound-parameter call `$DB->query("...?", [$var])` by focusing the
taint sink on the SQL-string (first) argument, and add `intval()`/`(int)`
integer-cast sanitizers — while keeping all existing unsafe-detection
positives firing.

**Architecture:** Semgrep taint mode already traces request superglobals →
`$DB->query(...)`. The fix narrows the sink with `focus-metavariable: $SQL`
on the first argument of `$DB->query($SQL, ...)`, so tainted data flowing
only into the bound-params array (arg 2) does not reach the focused sink.
Integer casts are added as explicit `pattern-sanitizers`. The rule message
and inline comments are corrected to cite the real Aurora `query()` API (the
prior `$db->execute()` form does not exist on `KYAULabs\SQLHandler`). No
application source changes; only the rule YAML and test fixtures.

**Tech Stack:** Semgrep `1.168.0` (pinned in `.github/workflows/ci.yml`),
Pest PHP v4 / PHPUnit 12, the `RulesPackTest.php` harness at
`tests/Unit/Semgrep/RulesPackTest.php`.

## Global constraints

- **No application/production PHP source changes.** Only `.semgrep/kyaulabs.yml`
  and test fixtures under `tests/Semgrep/` are touched.
- **Rule ID is unchanged:** `kyaulabs-sqli-interpolated-query` (preserves any
  future suppressions; the name remains accurate). Zero `nosemgrep`
  suppressions exist today.
- **Positive count stays 7** in `semgrepRulesProvider()` — all 7 existing
  positives interpolate tainted data into arg 1 (directly or indirectly), so
  the arg-1-focused sink keeps firing on every one. Do not change the
  provider row.
- **CI gate is `--error`:** any finding fails the build. The bound-param safe
  form must produce ZERO findings (it currently false-positives because there
  is no focus + no sanitizer).
- **Semgrep YAML is first-party/controlled** — the sync test in
  `RulesPackTest.php` parses `id:` list-items via regex (see ADR-0002); keep
  the `- id:` line format intact.
- **RCS headers + vim modeline** must be preserved on modified fixture files
  (see `rcs-header` skill). Update the `$KYAULabs:` keyword date on edit.
- **No new ADR.** Scope decision = Minimal; rationale lives in the rewritten
  inline design-note comment. ADR-0002 (referenced at YAML lines 40 & 81)
  governs the whole pack, not per-rule tuning.

## Context for the implementer

- Aurora's `KYAULabs\SQLHandler` (`aurora/sql.inc.php:144`) exposes exactly
  ONE public DB method: `query(string $sql, array $args = []): PDOStatement|bool`.
  It internally calls `pdo->prepare($sql)` + `execute($args)` with bound
  parameters (`aurora/sql.inc.php:148-149`). There is **no** public
  `execute()`, `prepare()`, or `exec()` method, and **no** `mysqli_query` /
  `pg_query` usage anywhere in the repo. The issue's proposed sinks for those
  are therefore unreachable and are intentionally NOT added.
- The harness runs ONE shared semgrep process over `tests/Semgrep/`
  (`semgrepScanAll()`), bypassing `.semgrepignore` via
  `--x-ignore-semgrepignore-files`. The `aurora/` submodule's duplicated
  fixtures are NOT scanned by this repo's harness — out of scope.
- The current rule (`.semgrep/kyaulabs.yml:50-81`) has `pattern-sinks:
  - pattern: $DB->query(...)` and **no sanitizers**. This causes a latent
  false positive on `$DB->query("...?", [$var])` (tainted `$var` reaches the
  sink via arg 2). No production code triggers it today, but it is a landmine.

## Acceptance-criteria mapping (issue #196)

The issue's literal ACs reference Aurora API methods that do not exist, so
they are reframed per the approved scope decision (Option A):

| Issue AC | Status under this plan |
|---|---|
| AC#1 `$db->prepare("…")->execute()` fires | **N/A** — `prepare()` is not a public method on `SQLHandler`. Reframed to the inverse that matters: the real safe bound-param form `$DB->query("…?", [$id])` correctly does **NOT** fire. |
| AC#2 `$db->execute("…".$_GET)` fires | **N/A** — `execute()` is not a public method. Removed from fixtures. |
| AC#3 negative using `(int)`/`intval()` does not fire | **SATISFIED** — `intval()` and `(int)` added as `pattern-sanitizers`; both exercised in `negative.php`. |
| AC#4 `RulesPackTest.php` covers new fixtures and passes locally | **SATISFIED** — the harness's positive/negative/sync datasets cover the rewritten fixtures. |

---

## Task 1: Arg-1-focused sink + integer-cast sanitizers (Red → Green → Refactor)

**Files:**
- Modify: `.semgrep/kyaulabs.yml:42-81` (design-note comment, rule message,
  sanitizer comment, add `pattern-sanitizers`, rewrite `pattern-sinks`)
- Modify: `tests/Semgrep/SqliInterpolatedQuery/negative.php` (rewrite — drop
  fake `execute()`, add real bound-param form + `intval` + `(int)` negatives)
- Read-only reference: `tests/Semgrep/SqliInterpolatedQuery/positive.php`
  (unchanged — all 7 cases interpolate into arg 1 and must keep firing)
- Test (the harness): `tests/Unit/Semgrep/RulesPackTest.php` (unchanged —
  provider row stays `positive => 7`)

**Interfaces:**
- Consumes: the existing `RulesPackTest.php` harness — `semgrepRulesProvider()`
  row `['dir' => 'SqliInterpolatedQuery', 'rule' => 'kyaulabs-sqli-interpolated-query', 'positive' => 7]`,
  the positive/negative datasets, and the sync test.
- Produces: a corrected rule + fixtures such that (a) all 7 positives still
  fire, (b) ZERO findings on the rewritten `negative.php`.

- [ ] **Step 1: Add the failing negative fixtures (Red)**

Replace the entire contents of `tests/Semgrep/SqliInterpolatedQuery/negative.php`:

```php
<?php

declare(strict_types=1);

# $KYAULabs: negative.php kyau@nova 2026/07/22 -0700 Exp $




# This file uses safe query patterns — no request-reachable data
# reaches the SQL string (first) argument of query(). The
# kyaulabs-sqli-interpolated-query rule must NOT fire.

$id = $_GET['id'];

# 1. Bound parameters via the real Aurora API — the tainted value
#    travels in query()'s bound-params array (arg 2), not the SQL
#    string (arg 1). The arg-1-focused sink must not fire.
$result = $db->query("SELECT * FROM users WHERE id = ?", [$id]);

# 2. Hardcoded placeholder string passed to query() — not tainted.
$sql = "SELECT * FROM users WHERE id = ?";
$result = $db->query($sql);

# 3. intval() integer cast neutralizes taint for an integer context.
$safe = intval($_GET['id']);
$result = $db->query("SELECT * FROM users WHERE id = " . $safe);

# 4. (int) cast neutralizes taint for an integer context.
$safe = (int) $_GET['id'];
$result = $db->query("SELECT * FROM users WHERE id = " . $safe);

# 5. Commented-out injection — AST-based taint mode cannot produce
#    findings from comments.
# $db->query("SELECT * FROM users WHERE id = $id");




// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the harness to confirm the Red failure**

Run: `php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php`
Expected: **FAIL** — the negative dataset reports ≥1 finding for
`kyaulabs-sqli-interpolated-query` on `negative.php`, because case #1
(`$db->query("…?", [$id])`) currently false-positives (tainted `$id` reaches
the unfocused `query(...)` sink via arg 2). This proves the latent bug is
real. (Cases #3/#4 may also fail if the current rule has no `intval`/`(int)`
sanitizers — expected.)

- [ ] **Step 3: Rewrite the rule (Green) — message, comments, sink, sanitizers**

Replace the block at `.semgrep/kyaulabs.yml:42-81` (from the design-note
comment through the end of the rule's `metadata:`) with:

```yaml
  # --- SQL injection: request-reachable data in the SQL string of
  # query() (taint mode) ---
  # Mirrors kyaulabs-xss-echo-request-sink and
  # kyaulabs-unserialize-request-data: sources are request superglobals,
  # sink is the SQL-string (first) argument of $DB->query($SQL, ...),
  # narrowed via focus-metavariable so tainted data in the bound-params
  # array (arg 2) does NOT fire. Taint propagates through assignment,
  # concatenation, sprintf, and heredoc interpolation, so indirect flows
  # like $id = $_GET[...]; $sql = "..." . $id; $db->query($sql); are
  # caught. Safe paths: bound parameters via $DB->query("...?", [$var]),
  # and intval()/(int) integer casts.
  - id: kyaulabs-sqli-interpolated-query
    message: >-
      Request-reachable data flows into the SQL string argument of a
      query() call. Use bound parameters:
      $DB->query("SELECT ... WHERE x = ?", [$var]).
    severity: ERROR
    languages: [php]
    mode: taint
    pattern-sources:
      - pattern: $_GET
      - pattern: $_POST
      - pattern: $_REQUEST
      - pattern: $_COOKIE
      - pattern: $_FILES
      - pattern: $_SERVER
    # Sanitizers: intval() and (int) integer casts neutralize taint for
    # integer contexts. The primary safe path — bound parameters passed
    # as query()'s second array argument — is already excluded by the
    # arg-1-focused sink. Suppress genuine exceptions via
    # // nosemgrep: kyaulabs-sqli-interpolated-query -- <justification>.
    pattern-sanitizers:
      - pattern-either:
          - pattern: intval($X)
          - pattern: (int) $X
    pattern-sinks:
      - patterns:
          - pattern-either:
              - pattern: $DB->query($SQL)
              - pattern: $DB->query($SQL, ...)
          - focus-metavariable: $SQL
    metadata:
      category: security
      cwe:
        - "CWE-89: Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')"
      technology:
        - php
      confidence: HIGH
      likelihood: HIGH
      references:
        - https://cwe.mitre.org/data/definitions/89.html
        - https://owasp.org/www-community/attacks/SQL_Injection
        - adr/0002-first-party-semgrep-rules-pack.md
```

Notes on the sink pattern: `pattern-either` explicitly covers both the
single-argument form `$DB->query($SQL)` (existing positive #1, #2) and the
multi-argument form `$DB->query($SQL, ...)` (existing positive #6). If either
form stopped matching, a positive would drop and the count test would catch
it (Step 4).

- [ ] **Step 4: Run the harness to confirm Green**

Run: `php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php`
Expected: **PASS** — all 7 tests green:
  - positive dataset: `SqliInterpolatedQuery` fires exactly **7** (all
    existing positives still fire — tainted data reaches arg 1 in every case);
  - negative dataset: **0** findings on `negative.php` (bound-param form
    excluded by arg-1 focus; `intval`/`(int)` sanitized);
  - sync test: YAML ↔ provider ↔ fixtures still in lock-step (rule ID and
    fixture dir unchanged).

- [ ] **Step 5: (int)-cast fallback decision point**

If Step 4 shows the negative dataset STILL fails specifically on case #4
(`$safe = (int) $_GET['id']`) — meaning Semgrep's PHP parser did not match
`(int) $X` as a sanitizer — then:
  1. Try the alternate cast pattern syntax `pattern: (integer) $X` (PHP alias)
     and/or `pattern: (int)$X` (no space) in `pattern-sanitizers`.
  2. If no cast pattern variant matches, **drop the `(int)` sanitizer**,
     delete case #4 from `negative.php`, keep `intval()` only, and record the
     limitation in the design-note comment ("`(int)` casts are not statically
     distinguishable; use `intval()`"). This narrows AC#3 to `intval()` only
     and must be noted for the issue-closure comment (Task 2).

If Step 4 is fully green with `(int)` matching, skip this step.

- [ ] **Step 6: Commit**

```bash
git add .semgrep/kyaulabs.yml tests/Semgrep/SqliInterpolatedQuery/negative.php
git commit -S -m $'fix(semgrep): honor bound-param safe path in sqli rule\n\nNarrow the kyaulabs-sqli-interpolated-query sink to the SQL-string\n(first) argument via focus-metavariable so the real Aurora bound-\nparameter form $DB->query(\"...?\", [$var]) no longer false-positives.\nAdd intval()/(int) integer-cast sanitizers. Correct the rule message\nand inline comments to cite the real $DB->query() API (the prior\n$db->execute() form does not exist on SQLHandler). Rewrite\nnegative.php to exercise the real safe paths.\n\nRefs: #196\n\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via resolve-identity.sh>'
```

> *Use the canonical `$'...\n...'` ANSI-C quoting form — see the
> `conventional-commits` skill. The `commit-msg` hook rejects literal `\n`
> sequences (ADR-0025). Footer values: `Authored-by` = model segment after
> last `/` of `agent.plan.model` in `opencode.jsonc`; `Tested-by` = model
> segment after last `/` of `agent.code-review.model`; `Signed-off-by`
> resolved via `bash .github/scripts/resolve-identity.sh`. `Refs:` used
> (non-closing) — change to `Fixes:` only if the issue is being closed.*

---

## Task 2: Full-suite verification + acceptance-criteria documentation

**Files:**
- Read-only verification: `tests/Unit/Semgrep/RulesPackTest.php`,
  `tests/Semgrep/SqliInterpolatedQuery/{positive,negative}.php`,
  `.semgrep/kyaulabs.yml`
- No further edits unless Step 1 surfaces a problem.

- [ ] **Step 1: Run the full Pest suite (verification-before-completion)**

Run: `php vendor/bin/pest`
Expected: **PASS** — entire suite green, including the Semgrep harness and the
`tests/Unit/Harness/ArchTest.php` strict-types/debug guards (the YAML and
fixtures already declare `strict_types=1`).

- [ ] **Step 2: Confirm the rule's positive count and message by direct scan (optional, if semgrep is on PATH)**

Run: `~/.local/bin/semgrep scan --config .semgrep/kyaulabs.yml tests/Semgrep/SqliInterpolatedQuery/ --json --quiet | head`
Expected: exactly 7 findings, all in `positive.php`, none in `negative.php`,
each carrying the corrected message citing `$DB->query("...?", [$var])`.
Skip if `semgrep` is not installed locally — the harness already proves this.

- [ ] **Step 3: Coverage-gate sanity check**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: **PASS**. No production/`backend/` source files changed in this
plan — only the YAML rule and test fixtures. The 80%-on-changed-files gate is
satisfied vacuously (there are no changed application source files to
measure). If the gate flags a fixture file, that is a false alarm for test
data and should be reported back rather than padded.

- [ ] **Step 4: Confirm acceptance-criteria mapping for issue closure**

Verify against the mapping table above. If Task 1 Step 5 activated the
`(int)`-cast fallback, update the issue-closure note to read "AC#3 satisfied
for `intval()`; `(int)` cast documented as a known Semgrep limitation."

- [ ] **Step 5: No commit unless Step 1–3 required edits**

If Steps 1–3 required no edits, this task produces no commit (verification
only). If an edit was needed, commit it with `fix(semgrep): ...` and the same
footer format as Task 1 Step 6.

---

## Self-review (completed by planner)

- **Spec/scope coverage:** Option A (arg-1 focus) → Task 1 Step 3 sink.
  Sanitizer policy A1 (`intval`/`(int)`) → Task 1 Step 3 `pattern-sanitizers`.
  Documentation scope Minimal (message + design-note + sanitizer comment) →
  Task 1 Step 3. `negative.php` rewrite → Task 1 Step 1. Harness coverage →
  Task 1 Step 4 + Task 2. AC mapping → table above + Task 2 Step 4. ✓
- **Placeholder scan:** none. All YAML and fixture code is complete and
  copy-pasteable. The only conditional is the explicit `(int)` fallback
  (Task 1 Step 5), which has a concrete decision and resolution.
- **Type/name consistency:** rule ID, fixture dir, and provider row are
  unchanged throughout; `positive => 7` referenced consistently.
- **Positive-count invariant check:** re-verified each of the 7 positives in
  `positive.php` interpolates tainted data into arg 1 (direct concat, string
  interp, assign-then-query, sprintf, heredoc, two-arg concat, execute-table
  concat) → all still reach the focused `$SQL` sink → 7 holds. ✓

## Out of scope (explicitly)

- Adding `mysqli_query` / `pg_query` / raw-PDO `prepare`/`execute` sinks
  (unreachable in this repo — zero matches).
- The `aurora/` submodule's duplicated fixtures
  (`aurora/tests/Semgrep/SqliInterpolatedQuery/*`) — not scanned by this
  repo's harness; a separate submodule concern.
- A new ADR (scope decision = Minimal).
- Changing the rule ID (accurate as-is; no suppressions to preserve).
