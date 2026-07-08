# Fix `checkDeterministic()` Semantics — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix three semantic defects in `Runner::checkDeterministic()` — misuse of `expectedBehavior[0]` as a needle, dishonest `deterministic_checks` metadata, and an unrealistic empty-stderr criterion.

**Architecture:** Add an `expected_string` field to the schema and `EvalCase` (conditionally required). Rewrite `checkDeterministic()` from a `match` expression to a `switch` so each criterion populates only its own honest check metadata (with a `pass` boolean). Replace the stderr-empty test with a documented error-severity regex match.

**Tech Stack:** PHP 8.5+, Pest v4, JSON Schema draft 2020-12.

## Global constraints

- PHP 8.5+, `declare(strict_types=1)` on the modified class file (already present).
- PSR-12 + php-cs-fixer; RCS header + vim modeline on every modified file (already present — preserve).
- TDD: Red → Green → Refactor per task. Minimum 80% line coverage on changed files.
- Scope: template repo only. The `aurora/` submodule parallel copies are out of scope (separate repo/PR + submodule bump — open a follow-up issue).
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <[EMAIL]>`.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `.opencode/evals/schema.json` | Modify | Add `expected_string` property + conditional `if/then` requiring it for the matching pass_criteria |
| `.opencode/evals/bin/includes/EvalRunner.php` | Modify | `EvalCase`: new `expectedString` property, `fromFile` parsing, `validate()` conditional check. `Runner`: rewrite `checkDeterministic()` switch + `ERROR_SEVERITY_PATTERN` constant + `detectErrorSeverity()` helper |
| `tests/Unit/Eval/EvalCaseTest.php` | Modify | Validation + parsing tests for `expected_string` |
| `tests/Unit/Eval/RunnerTest.php` | Modify | Update existing deterministic-gate tests; add expected_string + severity-pattern + honest-metadata tests |
| `.opencode/evals/README.md` | Modify | Add `expected_string` to the field table; document severity-pattern criterion |
| `docs/specs/2026-07-05-eval-runner-spec.md` | Modify | Update flow section (severity pattern, expected_string), result-schema example (per-criterion checks + `pass`), remove the now-resolved `expected_string` non-goal |

---

### Task 1: Add `expected_string` field to schema and `EvalCase`

**Files:**
- Modify: `.opencode/evals/schema.json`
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:12-100` (`EvalCase` class)
- Test: `tests/Unit/Eval/EvalCaseTest.php`
- Modify: `.opencode/evals/README.md:90-102` (field table)

**Interfaces:**
- Consumes: nothing new.
- Produces: `EvalCase::$expectedString` (`?string`, default `null`), parsed from JSON key `expected_string`; `EvalCase::validate()` emits an error when `pass_criteria === 'output contains expected string'` and `expected_string` is null/empty.

- [x] **Step 1: Write failing tests in `EvalCaseTest.php`**

Append before the vim modeline:

```php
it('validates expected_string required when pass_criteria is output contains expected string', function () {
    $json = json_encode([
        'name' => 'needs-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("expected_string is required when pass_criteria is 'output contains expected string'");
    unlink($file);
});

it('accepts expected_string when pass_criteria is output contains expected string', function () {
    $json = json_encode([
        'name' => 'has-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
        'expected_string' => 'function add(a, b)',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->not->toContain("expected_string is required when pass_criteria is 'output contains expected string'");
    unlink($file);
});

it('parses expected_string from JSON', function () {
    $json = json_encode([
        'name' => 'parse-string',
        'description' => 'desc',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['behavior'],
        'pass_criteria' => 'output contains expected string',
        'expected_string' => 'needle value',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $case = EvalCase::fromFile($file);

    expect($case->expectedString)->toBe('needle value');
    unlink($file);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest --filter EvalCaseTest`
Expected: FAIL — `expectedString` property not found / validation error not emitted.

- [x] **Step 3: Add `expectedString` property, `fromFile` parsing, and `validate()` check**

In `EvalRunner.php`, update the `EvalCase` constructor (add the new property after `$tags`):

```php
/** @param string[] $expectedBehavior */
public function __construct(
    public readonly string $name,
    public readonly string $description,
    public readonly string $agent,
    public readonly string $input,
    public readonly array $expectedBehavior,
    public readonly string $passCriteria,
    public readonly array $tags = [],
    public readonly ?string $expectedString = null,
) {
}
```

In `fromFile()`, add the named argument to the `new self(...)` call (after `tags:`):

```php
        expectedString: $data['expected_string'] ?? null,
```

In `validate()`, append this block after the `validCriteria`/`in_array` check (before `return $errors;`):

```php
        if ($this->passCriteria === 'output contains expected string'
            && ($this->expectedString === null || $this->expectedString === '')) {
            $errors[] = "expected_string is required when pass_criteria is 'output contains expected string'";
        }
```

- [x] **Step 4: Add `expected_string` to `schema.json`**

Add a new property inside `properties` (after `pass_criteria`):

```json
    "expected_string": {
      "type": "string",
      "description": "Required when pass_criteria is 'output contains expected string'. The substring that must appear in stdout for the case to pass."
    },
```

Add a conditional `if/then` at the root level (after the `properties` block, before the closing `}`):

```json
  "if": {
    "properties": { "pass_criteria": { "const": "output contains expected string" } },
    "required": ["pass_criteria"]
  },
  "then": {
    "required": ["expected_string"]
  }
```

- [x] **Step 5: Update the README field table**

In `.opencode/evals/README.md`, add a row to the field table (after the `pass_criteria` row):

```markdown
| `expected_string` | conditional | Required when `pass_criteria` is `"output contains expected string"`. The substring that must appear in stdout |
```

- [x] **Step 6: Run tests to verify they pass**

Run: `php vendor/bin/pest --filter EvalCaseTest`
Expected: PASS — all tests green.

- [x] **Step 7: Commit**

```bash
git add .opencode/evals/schema.json .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/EvalCaseTest.php .opencode/evals/README.md
git commit -S -m "fix(eval): add expected_string field to schema and EvalCase

Conditionally required when pass_criteria is 'output contains expected
string'. Enforced in both schema.json (if/then) and EvalCase::validate().
Previously checkDeterministic misused expectedBehavior[0] (a prose
description) as the literal needle — the dedicated field is the correct
source. Runner-side needle fix follows in the next commit.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

---

### Task 2: Rewrite `checkDeterministic()` with honest per-criterion checks and the `expected_string` needle

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php:412-442` (`Runner::checkDeterministic`)
- Test: `tests/Unit/Eval/RunnerTest.php`

**Interfaces:**
- Consumes: `EvalCase::$expectedString` from Task 1.
- Produces: `checkDeterministic()` now returns an `EvalResult` whose `deterministicChecks` array contains **only** the check actually performed, each entry including a `pass` boolean. The `'no errors in output'` branch still uses the empty-stderr logic in this task (Task 3 replaces it with the severity pattern).

- [x] **Step 1: Write/adjust failing tests in `RunnerTest.php`**

Update the existing `it('deterministic gate: exit code zero', ...)` test to also assert honest metadata:

```php
it('deterministic gate: exit code zero', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'exit code zero',
    );

    $result = $runner->checkDeterministic($case, 'output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->judgeUsed)->toBeFalse();
    expect($result->deterministicChecks)->toHaveKey('exit_code');
    expect($result->deterministicChecks['exit_code']['pass'])->toBeTrue();
    expect($result->deterministicChecks['exit_code']['actual'])->toBe(0);
});
```

Update the existing `it('deterministic gate: exit code zero fails on non-zero', ...)`:

```php
it('deterministic gate: exit code zero fails on non-zero', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'exit code zero',
    );

    $result = $runner->checkDeterministic($case, 'output', 'error', 1);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('FAIL');
    expect($result->deterministicChecks['exit_code']['pass'])->toBeFalse();
    expect($result->deterministicChecks['exit_code']['actual'])->toBe(1);
});
```

Update the existing `it('deterministic gate: no errors in output', ...)` — keep the empty-stderr semantics for now (Task 3 changes the logic), but assert honest metadata:

```php
it('deterministic gate: no errors in output', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'no errors in output',
    );

    $result = $runner->checkDeterministic($case, '', '', 0);
    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->deterministicChecks)->toHaveKey('stderr_empty');
    expect($result->deterministicChecks['stderr_empty']['pass'])->toBeTrue();

    $result2 = $runner->checkDeterministic($case, '', 'some error', 0);
    expect($result2)->not->toBeNull();
    expect($result2->verdict)->toBe('FAIL');
    expect($result2->deterministicChecks['stderr_empty']['pass'])->toBeFalse();
});
```

Update the existing `it('deterministic gate: manual inspection returns undetermined', ...)` to assert empty checks:

```php
it('deterministic gate: manual inspection returns undetermined', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'manual inspection required',
    );

    $result = $runner->checkDeterministic($case, '', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('UNDETERMINED');
    expect($result->deterministicChecks)->toBe([]);
});
```

Add two new tests for the `expected_string` needle (before the vim modeline):

```php
it('deterministic gate: output contains expected string passes when needle found', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['behavior'],
        passCriteria: 'output contains expected string',
        expectedString: 'function add(a, b)',
    );

    $result = $runner->checkDeterministic($case, 'here is function add(a, b) in output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->deterministicChecks)->toHaveKey('expected_string');
    expect($result->deterministicChecks['expected_string']['pass'])->toBeTrue();
    expect($result->deterministicChecks['expected_string']['found'])->toBeTrue();
});

it('deterministic gate: output contains expected string fails when needle absent', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['behavior'],
        passCriteria: 'output contains expected string',
        expectedString: 'function add(a, b)',
    );

    $result = $runner->checkDeterministic($case, 'totally unrelated output', '', 0);

    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('FAIL');
    expect($result->deterministicChecks['expected_string']['pass'])->toBeFalse();
    expect($result->deterministicChecks['expected_string']['found'])->toBeFalse();
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest --filter RunnerTest`
Expected: FAIL — `deterministicChecks` keys missing / `pass` field absent / `expected_string` check not present.

- [x] **Step 3: Rewrite `checkDeterministic()` as a switch with per-criterion honest checks**

Replace the entire `checkDeterministic()` method body (`EvalRunner.php:412-442`) with:

```php
    public function checkDeterministic(
        EvalCase $case,
        string $stdout,
        string $stderr,
        int $exitCode,
    ): ?EvalResult {
        $checks = [];

        switch ($case->passCriteria) {
            case 'exit code zero':
                $pass = $exitCode === 0;
                $checks['exit_code'] = ['expected' => 0, 'actual' => $exitCode, 'pass' => $pass];
                $verdict = $pass ? 'PASS' : 'FAIL';
                break;

            case 'no errors in output':
                $pass = $stderr === '';
                $checks['stderr_empty'] = ['pass' => $pass, 'stderr_length' => strlen($stderr)];
                $verdict = $pass ? 'PASS' : 'FAIL';
                break;

            case 'output contains expected string':
                $found = $case->expectedString !== null && str_contains($stdout, $case->expectedString);
                $checks['expected_string'] = [
                    'needle' => $case->expectedString ?? '',
                    'found' => $found,
                    'pass' => $found,
                ];
                $verdict = $found ? 'PASS' : 'FAIL';
                break;

            case 'manual inspection required':
                $verdict = 'UNDETERMINED';
                break;

            default:
                return null;
        }

        return new EvalResult(
            name: $case->name,
            agent: $case->agent,
            passCriteria: $case->passCriteria,
            verdict: $verdict,
            deterministicChecks: $checks,
            judgeUsed: false,
        );
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest --filter RunnerTest`
Expected: PASS — all deterministic-gate tests green.

- [x] **Step 5: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m "fix(eval): honest per-criterion deterministic_checks metadata

checkDeterministic previously reported an exit_code check for every
criterion, including ones that never examined the exit code, and omitted
the 'pass' boolean from the result schema. Rewrite as a switch so each
criterion populates only the check it actually performs, each with a
'pass' field. The 'output contains expected string' branch now uses the
dedicated expectedString field as the needle instead of expectedBehavior[0].

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

---

### Task 3: Replace empty-stderr criterion with a documented error-severity pattern match + update spec docs

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (`Runner` class — add constant + helper, update `'no errors in output'` branch)
- Test: `tests/Unit/Eval/RunnerTest.php`
- Modify: `docs/specs/2026-07-05-eval-runner-spec.md:50-55,93-95,149`
- Modify: `.opencode/evals/README.md` (document the severity criterion)

**Interfaces:**
- Consumes: the `switch` structure from Task 2.
- Produces: `Runner::ERROR_SEVERITY_PATTERN` (class constant), `Runner::detectErrorSeverity(string $stderr): bool` (private helper). The `'no errors in output'` branch now PASSes unless stderr contains a line matching a documented error-severity prefix.

- [x] **Step 1: Write failing tests for the severity behavior**

In `RunnerTest.php`, replace the body of `it('deterministic gate: no errors in output', ...)` (the version from Task 2) with severity-aware assertions:

```php
it('deterministic gate: no errors in output', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: [],
        passCriteria: 'no errors in output',
    );

    // Benign stderr (warnings, progress, deprecation notices) → PASS
    $result = $runner->checkDeterministic($case, '', 'Warning: deprecated, progress 50%', 0);
    expect($result)->not->toBeNull();
    expect($result->verdict)->toBe('PASS');
    expect($result->deterministicChecks)->toHaveKey('stderr_severity');
    expect($result->deterministicChecks['stderr_severity']['pass'])->toBeTrue();
    expect($result->deterministicChecks['stderr_severity']['matched'])->toBeFalse();

    // Error-severity stderr → FAIL
    $result2 = $runner->checkDeterministic($case, '', "Fatal error: uncaught thing\n", 0);
    expect($result2)->not->toBeNull();
    expect($result2->verdict)->toBe('FAIL');
    expect($result2->deterministicChecks['stderr_severity']['pass'])->toBeFalse();
    expect($result2->deterministicChecks['stderr_severity']['matched'])->toBeTrue();
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `php vendor/bin/pest --filter RunnerTest`
Expected: FAIL — `stderr_severity` key not found; benign stderr still produces FAIL under the old empty-stderr logic.

- [x] **Step 3: Add the severity pattern constant and helper, and update the branch**

In `EvalRunner.php`, add a class constant inside the `Runner` class (after `private string $repoRoot;`):

```php
    /**
     * Error-severity prefixes that the 'no errors in output' criterion treats
     * as a genuine fault. Matches at the start of any stderr line
     * (case-insensitive, multiline). Benign chatter — warnings, progress,
     * deprecation notices — does not match and does not fail the criterion.
     */
    private const ERROR_SEVERITY_PATTERN =
        '/^(?:'
        . 'Fatal error|Parse error|Compile error|Core error|'
        . 'Uncaught|'
        . 'Error:|TypeError:|ArgumentCountError:|ArithmeticError:|DivisionByZeroError:|'
        . 'ReferenceError:|SyntaxError:|RangeError:|EvalError:|URIError:|'
        . 'Unhandled (?:promise rejection|exception)|'
        . 'UnhandledPromiseRejection|'
        . 'Segmentation fault|core dumped'
        . ')/im';
```

Add a private helper method (place it just above `checkDeterministic`):

```php
    /**
     * Return true if $stderr contains any error-severity line.
     *
     * @param  string $stderr
     * @return bool
     */
    private function detectErrorSeverity(string $stderr): bool
    {
        return (bool) preg_match(self::ERROR_SEVERITY_PATTERN, $stderr);
    }
```

Update the `'no errors in output'` case in the `checkDeterministic` switch (replace the Task 2 version of that case):

```php
            case 'no errors in output':
                $matched = $this->detectErrorSeverity($stderr);
                $checks['stderr_severity'] = ['pass' => !$matched, 'matched' => $matched];
                $verdict = $matched ? 'FAIL' : 'PASS';
                break;
```

- [x] **Step 4: Run tests to verify they pass**

Run: `php vendor/bin/pest --filter RunnerTest`
Expected: PASS.

- [x] **Step 5: Update the spec doc**

In `docs/specs/2026-07-05-eval-runner-spec.md`, update the `no errors in output` bullet (line 52):

```
   - `no errors in output`: PASS unless stderr contains a line matching an error-severity prefix (Fatal error, Parse error, Uncaught, Error:, TypeError:, ReferenceError:, SyntaxError:, Unhandled promise rejection, Segmentation fault, etc.). Benign chatter (warnings, progress, deprecation notices) does not fail the criterion. See `Runner::ERROR_SEVERITY_PATTERN`.
```

Update the result-schema example to show per-criterion checks with the `pass` field.

Remove the now-resolved non-goal (line 149):
```
- Schema evolution for the `expected_string` field on `output contains expected string` criteria. Add it when the first eval case needs it.
```

- [x] **Step 6: Document the severity criterion in the README**

In `.opencode/evals/README.md`, append a short subsection after the "Eval case format" field table:

```markdown
### Pass criteria

| `pass_criteria` value | How pass/fail is decided |
|---|---|
| `all behaviors observed` | LLM judge — all expected behaviors rated YES |
| `exit code zero` | Deterministic — agent exit code is 0 |
| `output contains expected string` | Deterministic — `expected_string` substring found in stdout |
| `no errors in output` | Deterministic — stderr contains no error-severity line (warnings/progress are OK; see `Runner::ERROR_SEVERITY_PATTERN`) |
| `manual inspection required` | Returns UNDETERMINED — a human must review |
```

- [x] **Step 7: Run the full suite + coverage**

Run: `php -d pcov.enabled=1 vendor/bin/pest --coverage`
Expected: PASS, ≥80% line coverage on `.opencode/evals/bin/includes/EvalRunner.php`.

- [x] **Step 8: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php docs/specs/2026-07-05-eval-runner-spec.md .opencode/evals/README.md
git commit -S -m "fix(eval): replace empty-stderr criterion with error-severity pattern match

The 'no errors in output' criterion previously failed on any stderr byte,
but real tooling always emits stderr (warnings, progress, deprecation
notices). Replace the empty-stderr test with a documented error-severity
regex (Fatal error, Parse error, Uncaught, Error:, TypeError:, etc.) so
only genuine faults fail the criterion. Update the spec and README to
document the new semantics.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <[EMAIL]>"
```

## Post-implementation gates

1. **`/check`** — php-cs-fixer + stylelint + eslint + pest --coverage (80%).
2. **`@code-review`** — review the three staged commits before push.
3. **Follow-up issue** — open a GitHub issue for the `aurora/` submodule parallel copies (same three defects in `aurora/.opencode/evals/bin/includes/EvalRunner.php` + `aurora/tests/Unit/Eval/RunnerTest.php` + `aurora/.opencode/evals/schema.json`), to be fixed in the aurora repo with a submodule bump here.

## Acceptance-criteria traceability (issue #33)

| Acceptance criterion | Task |
|---|---|
| Schema + `validate()` reject `'output contains expected string'` cases lacking `expected_string` | Task 1 (schema `if/then` + `EvalCase::validate()`) |
| Result JSON's `deterministic_checks` names only the evaluated criterion | Task 2 (per-criterion switch) |
| Unit tests updated for all three behaviors | Tasks 1–3 (`EvalCaseTest` + `RunnerTest`) |
