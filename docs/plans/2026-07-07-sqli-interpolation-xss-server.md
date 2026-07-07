# SQLi Interpolation + XSS `print $_SERVER` Sink

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix two semgrep rule gaps: `kyaulabs-sqli-interpolated-query` does not
catch double-quote string interpolation (`"...$id"`), and
`kyaulabs-xss-echo-request-sink` omits `print $_SERVER[$KEY]`. Lock both via
exact-count assertion in `RulesPackTest`.

**Architecture:** This is a security-rules-only change. The SQLi rule gains a
`metavariable-pattern`+`metavariable-regex` branch that inspects the source text
of a string-literal argument to `query()` for `$var` interpolation — restricted
so bare-variable calls like `$db->query($sql)` are not flagged. The XSS rule
adds one line to its existing `pattern-either`. `RulesPackTest` switches from
`->not->toBeEmpty()` to exact expected-finding-counts, encoding the sink-line
count per positive fixture so that removing a branch becomes a test failure.

**Tech Stack:** Semgrep (PHP + generic), Pest v4, PHP 8.5+

## Global constraints

- No new files — modify `.semgrep/kyaulabs.yml`, fixture `.php` files, and `RulesPackTest.php` only.
- Use existing `semgrepScanDir()` + `filterFindings()` test helpers — do not restructure.
- RCS header + vim modeline on every file (see `rcs-header` skill; headers already present on fixture files).
- Sign commits with `git commit -S`. Conventional commits with scope `semgrep`.

---

### Task 1: SQLi interpolation branch + exact-count test enforcement

**Files:**
- Modify: `.semgrep/kyaulabs.yml:38-44`
- Modify: `tests/Semgrep/SqliInterpolatedQuery/positive.php:12-15`
- Modify: `tests/Semgrep/SqliInterpolatedQuery/negative.php:11-14`
- Modify: `tests/Unit/Semgrep/RulesPackTest.php:140-154` (positive test), `140-154` (negative test — no change needed)

**Interfaces:**
- Consumes: `semgrepScanDir()` (returns `['results' => array, 'exitCode' => int]`), `filterFindings(array $results, string $ruleId, string $fixtureFile): array` (unchanged)
- Produces: The positive test closure signature changes from `function (string $dir, string $ruleId): array` to `function (string $dir, string $ruleId, int $expectedCount): bool`. The negative test is unchanged.

- [x] **Step 1: Write failing positive fixture (Red)**

    Append interpolation line to `tests/Semgrep/SqliInterpolatedQuery/positive.php` so there are two sink lines:

    ```php
    # This file intentionally contains a SQL injection pattern: string
    # concatenation in a query() call. The kyaulabs-sqli-interpolated-query
    # rule must fire.

    $id = $_GET['id'];
    $result = $db->query("SELECT * FROM users WHERE id = " . $id);
    $result = $db->query("SELECT * FROM users WHERE id = $id");
    ```

- [x] **Step 2: Write negative fixture addition**

    Append a bare-variable query line to `tests/Semgrep/SqliInterpolatedQuery/negative.php` to lock that only string-literal interpolation is caught, not bare variable passthrough:

    ```php
    # This file uses a parameterized query with bound parameters — the safe
    # pattern. The kyaulabs-sqli-interpolated-query rule must NOT fire.

    $id = $_GET['id'];
    $result = $db->execute("SELECT * FROM users WHERE id = ?", [$id]);

    $sql = "SELECT * FROM users WHERE id = ?";
    $result = $db->query($sql);
    ```

- [x] **Step 3: Enhance RulesPackTest to assert exact counts**

    In `tests/Unit/Semgrep/RulesPackTest.php`, replace the positive test (lines 140–154):

    ```php
    test('Semgrep rules: each positive fixture fires its rule the expected number of times')
        ->with([
            ['AuroraStatusTrue',        'kyaulabs-aurora-status-true-literal', 1],
            ['SqliInterpolatedQuery',    'kyaulabs-sqli-interpolated-query',    2],
            ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink',      1],
            ['UnserializeRequestData',   'kyaulabs-unserialize-request-data',   1],
            ['MissingCsrfToken',        'kyaulabs-missing-csrf-token',         1],
            ['HardcodedDisplayErrors',  'kyaulabs-hardcoded-display-errors-on', 1],
        ])
        ->skip(!semgrepAvailable(), 'semgrep not installed')
        ->expect(function (string $dir, string $ruleId, int $expectedCount): bool {
            $scan = semgrepScanDir($dir);
            $findings = filterFindings($scan['results'], $ruleId, 'positive.php');

            return count($findings) === $expectedCount;
        })->toBeTrue();
    ```

    The old `->not->toBeEmpty()` line is removed. The old dataset rows (2-arity) become 3-arity with the expected count. `SqliInterpolatedQuery` expects 2 (concat + interpolation — the two distinct lines yield one finding each because the concat branch matches line 13 but not the interpolation line, and the interpolation branch matches line 14 but not the concat line — metavariable-pattern restricts to string literals, so the concat expression is excluded).

- [x] **Step 4: Verify Red — test fails because rule doesn't catch interpolation yet**

    ```bash
    semgrep --validate --config .semgrep/kyaulabs.yml
    ```
    Should pass (rule validates). Then run the test (if semgrep is installed):
    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'positive.*SqliInterpolatedQuery'
    ```
    Expected: FAIL. The rule currently returns 1 finding from `positive.php` (concat only), but the test expects 2. The interpolation line is not caught.

    If semgrep is not installed locally, the test skips — write the rule changes on faith and verify on Linux /check.

- [x] **Step 5: Add interpolation branch to the SQLi rule (Green)**

    In `.semgrep/kyaulabs.yml`, add a 4th branch to the `pattern-either` block (between the closing of the 3rd concat pattern and the `pattern-not-regex` line):

    Current YAML (lines 38–44):
    ```yaml
    patterns:
      - pattern-either:
          - pattern: $DB->query("..." . $VAR);
          - pattern: $DB->query("..." . $VAR . "...");
          - pattern: $DB->query($VAR . "...");
          - pattern: $DB->query("..." . $VAR,);
      - pattern-not-regex: '\b(?:execute|prepare)\b'
    ```

    Add the new branch between the last concat pattern and `pattern-not-regex`:
    ```yaml
    patterns:
      - pattern-either:
          - pattern: $DB->query("..." . $VAR);
          - pattern: $DB->query("..." . $VAR . "...");
          - pattern: $DB->query($VAR . "...");
          - pattern: $DB->query("..." . $VAR,);
          - patterns:
              - pattern: $DB->query($QUERY);
              - metavariable-pattern:
                  metavariable: $QUERY
                  language: php
                  pattern: '"..."'
              - metavariable-regex:
                  metavariable: $QUERY
                  regex: '(?<!\\)\$[A-Za-z_{]'
      - pattern-not-regex: '\b(?:execute|prepare)\b'
    ```

    Explanation of the new branch:
    - `$DB->query($QUERY)` — binds the argument to `$QUERY` (must use `$QUERY` not `$DB` to avoid collision with outer patterns).
    - `metavariable-pattern` with `'"..."'` restricts `$QUERY` to a double-quoted string literal (excludes bare variables like `$sql`, concat expressions like `"..." . $id`, and numeric/boolean args).
    - `metavariable-regex` `(?<!\\)\$[A-Za-z_{]` checks the source text of the string for an unescaped `$` followed by a letter or `{`. Catches `$id`, `${var}`, `{$var}`, `$obj->prop`, `$arr[0]`. Excludes `\$literal` (escaped dollar). The negative lookbehind `(?<!\\)` prevents false positives on escaped `\$`.
    - The outer `pattern-not-regex: '\b(?:execute|prepare)\b'` is inherited — no need to duplicate it in the nested `patterns`.

- [x] **Step 6: Validate the rule**

    ```bash
    semgrep --validate --config .semgrep/kyaulabs.yml
    ```
    Expected: Configuration is valid (exit code 0).

- [x] **Step 7: Run test to verify Green**

    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'positive.*SqliInterpolatedQuery'
    ```
    Expected: PASS (2 findings — one from concat branch on line 13, one from interpolation branch on line 14).

    Also verify negative stays clean:
    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'negative.*SqliInterpolatedQuery'
    ```
    Expected: PASS (0 findings — `execute()` and bare `query($sql)` are not flagged).

    Run full suite:
    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php
    ```
    Expected: All tests pass.

- [x] **Step 8: Commit**

    ```bash
    git add .semgrep/kyaulabs.yml tests/Semgrep/SqliInterpolatedQuery/positive.php tests/Semgrep/SqliInterpolatedQuery/negative.php tests/Unit/Semgrep/RulesPackTest.php
    git commit -S -m "fix(semgrep): detect SQLi interpolation in query() calls

    Add metavariable-pattern + metavariable-regex branch to
    kyaulabs-sqli-interpolated-query that catches double-quote string
    interpolation (\$var, \${var}, {\$var}) in query() arguments.
    Restricted to string literals only — bare \$db->query(\$sql) is not
    flagged. Fixtures extended with interpolation positive and bare-variable
    negative. RulesPackTest upgraded from not->toBeEmpty() to exact
    finding-count assertion.

    Fixes #34 (SQLi part)

    Plan-by: glm-5.2
    Acked-by: deepseek-v4-pro
    Signed-off-by: kyau <git@kyaulabs.com>"
    ```

---

### Task 2: XSS `print $_SERVER` sink

**Files:**
- Modify: `.semgrep/kyaulabs.yml:62-63` (add after line 62: `- pattern: print $_COOKIE[$KEY];`)
- Modify: `tests/Semgrep/XssEchoRequestSink/positive.php:12-15`
- Modify: `tests/Unit/Semgrep/RulesPackTest.php:140-154` (bump XssEchoRequestSink count from 1 to 2)

**Interfaces:**
- Consumes: The exact-count test from Task 1 (3-arity dataset, `->toBeTrue()` assertion).
- Produces: XssEchoRequestSink expected count changes from 1 → 2.

- [x] **Step 1: Write failing fixture addition (Red)**

    Append `print $_SERVER` line to `tests/Semgrep/XssEchoRequestSink/positive.php`:

    ```php
    # This file intentionally contains an unescaped request superglobal echo —
    # an XSS sink. The kyaulabs-xss-echo-request-sink rule must fire.

    $username = $_GET['username'];
    echo $username;
    echo $_GET['search'];
    print $_SERVER['HTTP_HOST'];
    ```

    Note: The existing `echo $_GET['search']` (line 13) already fires 1 finding. The new `print $_SERVER['HTTP_HOST']` should fire a 2nd — but the rule doesn't have `print $_SERVER` yet, so the count stays at 1. The test from Task 1 expects 1 for XssEchoRequestSink → still passes. This step is the "Red" setup.

- [x] **Step 2: Update RulesPackTest count to expect 2**

    In `tests/Unit/Semgrep/RulesPackTest.php`, change the XssEchoRequestSink row:

    ```php
    ['XssEchoRequestSink',      'kyaulabs-xss-echo-request-sink',      2],
    ```

    The test now expects 2 findings but the rule only catches 1 (`echo $_GET`) — this is the Red phase.

- [x] **Step 3: Verify Red — test fails**

    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'positive.*XssEchoRequestSink'
    ```
    Expected: FAIL. Count returns 1, expected 2.

- [x] **Step 4: Add `print $_SERVER[$KEY]` to the XSS rule (Green)**

    In `.semgrep/kyaulabs.yml`, add after the existing `print` lines (after line 62 `- pattern: print $_COOKIE[$KEY];`):

    ```yaml
      - pattern: print $_SERVER[$KEY];
    ```

    The full `pattern-either` block for the XSS rule (lines 53–63) becomes:

    ```yaml
    pattern-either:
      - pattern: echo $_GET[$KEY];
      - pattern: echo $_POST[$KEY];
      - pattern: echo $_REQUEST[$KEY];
      - pattern: echo $_COOKIE[$KEY];
      - pattern: echo $_SERVER[$KEY];
      - pattern: print $_GET[$KEY];
      - pattern: print $_POST[$KEY];
      - pattern: print $_REQUEST[$KEY];
      - pattern: print $_COOKIE[$KEY];
      - pattern: print $_SERVER[$KEY];
    ```

- [x] **Step 5: Validate the rule**

    ```bash
    semgrep --validate --config .semgrep/kyaulabs.yml
    ```
    Expected: Configuration is valid (exit code 0).

- [x] **Step 6: Run test to verify Green**

    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'positive.*XssEchoRequestSink'
    ```
    Expected: PASS (2 findings — one for `echo $_GET['search']`, one for `print $_SERVER['HTTP_HOST']`).

    Verify negative stays clean:
    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php --filter 'negative.*XssEchoRequestSink'
    ```
    Expected: PASS (0 findings — htmlspecialchars call is not a direct superglobal sink).

    Run full suite:
    ```bash
    php vendor/bin/pest tests/Unit/Semgrep/RulesPackTest.php
    ```
    Expected: All tests pass.

- [x] **Step 7: Commit**

    ```bash
    git add .semgrep/kyaulabs.yml tests/Semgrep/XssEchoRequestSink/positive.php tests/Unit/Semgrep/RulesPackTest.php
    git commit -S -m "fix(semgrep): add print \$_SERVER to XSS sink rule

    kyaulabs-xss-echo-request-sink listed echo \$_SERVER[\$KEY] but
    omitted print \$_SERVER[\$KEY] — the other four superglobals had
    both variants. Added the missing pattern and extended the positive
    fixture with print \$_SERVER['HTTP_HOST'].

    Fixes #34 (XSS part)

    Plan-by: glm-5.2
    Acked-by: deepseek-v4-pro
    Signed-off-by: kyau <git@kyaulabs.com>"
    ```

---

### Post-implementation verification

- [x] Run full test suite: `php -d pcov.enabled=1 vendor/bin/pest tests/Unit/Semgrep/`
- [x] Run `/check` (php-cs-fixer + stylelint + eslint + pest --coverage 80%)
- [x] Load `verification-before-completion` skill — confirm no debug artifacts, semgrep validates, both tests green
- [x] `@code-review` on the two-commit branch before push (user pushes)

## Cross-refs
- Issue: #34
- `rcs-header` skill — headers are already present on fixture files; no new files created
- `security-coding` skill — defensive coding guidance (the rule itself is the security check)
- `conventional-commits` skill — commit message format verified in each task
