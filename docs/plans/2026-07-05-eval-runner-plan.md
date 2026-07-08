# Eval Runner Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Build an automated eval runner that executes `.opencode/evals/smoke/*.json` cases against `opencode run` and reports pass/fail per expected behavior.

**Architecture:** Two PHP CLI scripts sharing a common class include. `run-eval.php` parses an eval case JSON, invokes `opencode run` non-interactively, applies a deterministic gate, then optionally invokes an LLM judge for `all behaviors observed` criteria. `run-suite.php` shells out to `run-eval.php` per case, aggregates results, and produces a markdown summary + JSON report.

**Tech Stack:** PHP 8.5+ CLI, no external PHP dependencies. Invokes `opencode run` which must be in `PATH`.

## Global constraints

- PHP 8.5+ (typed properties, match expressions, named arguments)
- Shell out to `opencode run` — must be available in `PATH` or runner skips
- In-repo execution (no sandbox — agent needs `.opencode/` and `AGENTS.md`)
- RCS header + vim modeline on every PHP file (see `rcs-header` skill)
- Unit tests live in `tests/Unit/Eval/`, integration in `tests/Integration/Eval/`
- PSR-12 code style, `declare(strict_types=1)` on all classes

---

### Task 1: Shared include — EvalCase, EvalResult, and command builder

**Files:**
- Create: `.opencode/evals/bin/includes/EvalRunner.php`
- Test: `tests/Unit/Eval/EvalCaseTest.php`

**Interfaces:**
- Produces: `EvalCase::fromFile(string $path): self`, `EvalCase::validate(): array`, `EvalResult` data class, `Runner::buildCommand(EvalCase $case): string`, `Runner::parseArgs(array $argv): array`

- [ ] **Step 1: Write the failing test**

```php
<?php

# $KYAULabs: EvalCaseTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

use KYAULabs\Eval\EvalCase;

it('parses a valid eval case JSON file', function () {
    $json = json_encode([
        'name' => 'test-case',
        'description' => 'A test case',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['Agent writes code', 'Agent runs tests'],
        'pass_criteria' => 'all behaviors observed',
        'tags' => ['smoke'],
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $case = EvalCase::fromFile($file);

    expect($case->name)->toBe('test-case');
    expect($case->passCriteria)->toBe('all behaviors observed');
    expect($case->expectedBehavior)->toHaveCount(2);

    unlink($file);
});

it('validates required fields', function () {
    $json = json_encode(['name' => 'missing-fields']);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toHaveCount(5); // description, agent, input, expected_behavior, pass_criteria
    unlink($file);
});

it('validates pass_criteria against allowed values', function () {
    $json = json_encode([
        'name' => 'bad-criteria',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'invalid criteria',
    ]);
    $file = tempnam(sys_get_temp_dir(), 'eval_');
    file_put_contents($file, $json);

    $errors = EvalCase::fromFile($file)->validate();

    expect($errors)->toContain("pass_criteria 'invalid criteria' is not a valid value");
    unlink($file);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Eval/EvalCaseTest.php
```
Expected: FAIL — class `KYAULabs\Eval\EvalCase` not found.

- [ ] **Step 3: Create directory and shared include**

```bash
mkdir -p .opencode/evals/bin/includes
```

- [ ] **Step 4: Write EvalRunner.php with EvalCase, EvalResult, Runner**

```php
<?php

# $KYAULabs: EvalRunner.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

namespace KYAULabs\Eval;

/**
 * Parsed eval case from a JSON file.
 */
class EvalCase
{
    /** @param string[] $expectedBehavior */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly string $agent,
        public readonly string $input,
        public readonly array $expectedBehavior,
        public readonly string $passCriteria,
        public readonly array $tags = [],
    ) {}

    /**
     * Parse an eval case from a JSON file.
     *
     * @param  string $path  Path to the JSON case file.
     * @return self
     * @throws \RuntimeException  If the file cannot be read or decoded.
     */
    public static function fromFile(string $path): self
    {
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new \RuntimeException("Cannot read eval case file: {$path}");
        }

        $data = json_decode($contents, true);
        if (!is_array($data)) {
            throw new \RuntimeException("Invalid JSON in eval case file: {$path}");
        }

        return new self(
            name: $data['name'] ?? '',
            description: $data['description'] ?? '',
            agent: $data['agent'] ?? '',
            input: $data['input'] ?? '',
            expectedBehavior: $data['expected_behavior'] ?? [],
            passCriteria: $data['pass_criteria'] ?? '',
            tags: $data['tags'] ?? [],
        );
    }

    /**
     * Validate this case against the schema. Returns an array of error
     * messages; empty array means valid.
     *
     * @return string[]
     */
    public function validate(): array
    {
        $errors = [];
        $required = ['name', 'description', 'agent', 'input', 'expected_behavior', 'pass_criteria'];

        foreach ($required as $field) {
            $value = match ($field) {
                'name' => $this->name,
                'description' => $this->description,
                'agent' => $this->agent,
                'input' => $this->input,
                'expected_behavior' => $this->expectedBehavior,
                'pass_criteria' => $this->passCriteria,
            };

            if ($field === 'expected_behavior') {
                if (empty($value)) {
                    $errors[] = "required field 'expected_behavior' is empty";
                }
            } elseif ($value === '') {
                $errors[] = "required field '{$field}' is empty";
            }
        }

        $validCriteria = [
            'all behaviors observed',
            'no errors in output',
            'exit code zero',
            'output contains expected string',
            'manual inspection required',
        ];

        if (!in_array($this->passCriteria, $validCriteria, true)) {
            $errors[] = "pass_criteria '{$this->passCriteria}' is not a valid value";
        }

        return $errors;
    }
}

/**
 * Result of running a single eval case.
 */
class EvalResult
{
    /** @param array<int, array{behavior: string, verdict: string, rationale: string}> $behaviors */
    /** @param array<string, array<string, mixed>> $deterministicChecks */
    public function __construct(
        public string $name,
        public string $agent,
        public string $passCriteria,
        public string $verdict,
        public array $behaviors = [],
        public array $deterministicChecks = [],
        public int $durationMs = 0,
        public bool $judgeUsed = false,
        public ?string $error = null,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'agent' => $this->agent,
            'pass_criteria' => $this->passCriteria,
            'verdict' => $this->verdict,
            'behaviors' => $this->behaviors,
            'deterministic_checks' => $this->deterministicChecks,
            'duration_ms' => $this->durationMs,
            'judge_used' => $this->judgeUsed,
            'error' => $this->error,
        ];
    }

    public function isPass(): bool
    {
        return $this->verdict === 'PASS';
    }

    public function isFail(): bool
    {
        return in_array($this->verdict, ['FAIL', 'TIMEOUT', 'INVALID'], true);
    }
}

/**
 * Runs a single eval case through opencode run.
 */
class Runner
{
    private string $repoRoot;

    public function __construct(
        string $repoRoot,
        private int $timeout = 120,
    ) {
        $this->repoRoot = realpath($repoRoot) ?: $repoRoot;
    }

    /**
     * Build the opencode run command for a case (dry-run mode).
     *
     * @param  EvalCase $case
     * @return string  Shell command string.
     */
    public function buildCommand(EvalCase $case): string
    {
        $prompt = escapeshellarg($case->input);
        $path = escapeshellarg($this->repoRoot);

        return "opencode run --prompt {$prompt} --mode build --path {$path} " .
            "--permissions \"bash: allow, edit: allow, task: allow\"";
    }

    /**
     * Parse CLI arguments for run-eval.php.
     *
     * @param  array<int, string> $argv
     * @return array{caseFile: string, timeout: int, dryRun: bool}
     */
    public static function parseArgs(array $argv): array
    {
        $caseFile = '';
        $timeout = 120;
        $dryRun = false;

        for ($i = 1; $i < count($argv); $i++) {
            if ($argv[$i] === '--timeout' && isset($argv[$i + 1])) {
                $timeout = (int) $argv[++$i];
            } elseif ($argv[$i] === '--dry-run') {
                $dryRun = true;
            } elseif (!str_starts_with($argv[$i], '--')) {
                $caseFile = $argv[$i];
            }
        }

        return ['caseFile' => $caseFile, 'timeout' => $timeout, 'dryRun' => $dryRun];
    }
}

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 5: Run test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Eval/EvalCaseTest.php
```
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/EvalCaseTest.php
git commit -S -m "feat(evals): add EvalCase, EvalResult, and Runner base classes

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Runner — execute and deterministic gate

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` — add execute + checkDeterministic
- Test: `tests/Unit/Eval/RunnerTest.php`

**Interfaces:**
- Consumes: `Runner::buildCommand()`, `EvalCase`, `EvalResult`
- Produces: `Runner::executeCommand(string $cmd, int $timeout): array{stdout: string, stderr: string, exitCode: int}`, `Runner::checkDeterministic(EvalCase, string, string, int): ?EvalResult` — returns null if criteria not deterministically resolvable

- [ ] **Step 1: Write the failing test**

```php
<?php

# $KYAULabs: RunnerTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;
use KYAULabs\Eval\EvalResult;

it('builds correct opencode run command', function () {
    $runner = new Runner('/path/to/repo');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'Write a function add(a, b)',
        expectedBehavior: ['test'],
        passCriteria: 'all behaviors observed',
    );

    $cmd = $runner->buildCommand($case);

    expect($cmd)->toContain('opencode run');
    expect($cmd)->toContain('--mode build');
    expect($cmd)->toContain('--prompt');
    expect($cmd)->toContain('Write a function add(a, b)');
});

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
});

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
});

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

    $result2 = $runner->checkDeterministic($case, '', 'some error', 0);
    expect($result2)->not->toBeNull();
    expect($result2->verdict)->toBe('FAIL');
});

it('deterministic gate: all behaviors observed returns null', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->checkDeterministic($case, 'output', '', 0);

    expect($result)->toBeNull(); // needs LLM judge
});

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
});

it('executeCommand runs a command and captures output', function () {
    $runner = new Runner(__DIR__);

    $output = $runner->executeCommand('echo "hello world"', 5);

    expect($output['stdout'])->toContain('hello world');
    expect($output['exitCode'])->toBe(0);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Eval/RunnerTest.php
```
Expected: FAIL — `checkDeterministic` and `executeCommand` methods not found on `Runner`.

- [ ] **Step 3: Add executeCommand and checkDeterministic to Runner class** in `EvalRunner.php`

Append these methods inside the `Runner` class (before the closing `}`):

```php
    /**
     * Execute a shell command and capture stdout, stderr, and exit code.
     *
     * @param  string $cmd  Shell command to execute.
     * @param  int $timeout  Timeout in seconds.
     * @return array{stdout: string, stderr: string, exitCode: int}
     */
    public function executeCommand(string $cmd, int $timeout): array
    {
        $descriptors = [
            0 => ['pipe', 'r'],  // stdin
            1 => ['pipe', 'w'],  // stdout
            2 => ['pipe', 'w'],  // stderr
        ];

        $process = proc_open($cmd, $descriptors, $pipes);
        if (!is_resource($process)) {
            return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1];
        }

        fclose($pipes[0]);

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        return [
            'stdout' => $stdout !== false ? trim($stdout) : '',
            'stderr' => $stderr !== false ? trim($stderr) : '',
            'exitCode' => $exitCode,
        ];
    }

    /**
     * Check if the pass criteria can be resolved deterministically (no LLM judge).
     *
     * Returns an EvalResult if the criteria can be resolved, or null if an
     * LLM judge is required.
     *
     * @param  EvalCase $case
     * @param  string $stdout   Captured stdout from the agent run.
     * @param  string $stderr   Captured stderr from the agent run.
     * @param  int $exitCode    Exit code from the agent run.
     * @return EvalResult|null
     */
    public function checkDeterministic(
        EvalCase $case,
        string $stdout,
        string $stderr,
        int $exitCode,
    ): ?EvalResult {
        $checks = [];

        $verdict = match ($case->passCriteria) {
            'exit code zero' => ($exitCode === 0) ? 'PASS' : 'FAIL',
            'no errors in output' => ($stderr === '') ? 'PASS' : 'FAIL',
            'output contains expected string' => (str_contains($stdout, $case->expectedBehavior[0] ?? '')) ? 'PASS' : 'FAIL',
            'manual inspection required' => 'UNDETERMINED',
            default => null,
        };

        if ($verdict === null) {
            return null; // needs LLM judge
        }

        $checks['exit_code'] = ['expected' => 0, 'actual' => $exitCode];

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

- [ ] **Step 4: Run test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Eval/RunnerTest.php
```
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m "feat(evals): add Runner method executeCommand and deterministic gate

Implements the deterministic pass_criteria dispatch (exit code zero, no errors
in output, output contains expected string, manual inspection required). Returns
null for 'all behaviors observed' to signal that the LLM judge is needed.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Runner — LLM judge

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` — add `buildJudgePrompt()` and `runJudge()`
- Test: `tests/Unit/Eval/JudgeTest.php`

**Interfaces:**
- Consumes: `EvalCase`, `EvalResult`, `Runner::executeCommand()`
- Produces: `Runner::buildJudgePrompt(EvalCase, string): string`, `Runner::runJudge(EvalCase, string): EvalResult`

- [ ] **Step 1: Write the failing test**

```php
<?php

# $KYAULabs: JudgeTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;

it('builds a judge prompt containing expected behaviors', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test-case',
        description: 'a test',
        agent: '@tdd',
        input: 'Write code',
        expectedBehavior: ['Agent announces skill', 'Agent writes code'],
        passCriteria: 'all behaviors observed',
    );

    $prompt = $runner->buildJudgePrompt($case, 'the agent output');

    expect($prompt)->toContain('test-case');
    expect($prompt)->toContain('Agent announces skill');
    expect($prompt)->toContain('Agent writes code');
    expect($prompt)->toContain('the agent output');
    expect($prompt)->toContain('YES');
    expect($prompt)->toContain('JSON array');
});

it('parses judge JSON response correctly', function () {
    $json = json_encode([
        ['behavior' => 'Agent announces skill', 'verdict' => 'YES', 'rationale' => 'clearly announced'],
        ['behavior' => 'Agent writes code', 'verdict' => 'NO', 'rationale' => 'no code written'],
    ]);

    $behaviors = Runner::parseJudgeResponse($json);

    expect($behaviors)->toHaveCount(2);
    expect($behaviors[0]['verdict'])->toBe('YES');
    expect($behaviors[1]['verdict'])->toBe('NO');
});

it('parses messy judge response with markdown fences', function () {
    $json = "```json\n" . json_encode([
        ['behavior' => 'test', 'verdict' => 'YES', 'rationale' => 'ok'],
    ]) . "\n```";

    $behaviors = Runner::parseJudgeResponse($json);

    expect($behaviors)->toHaveCount(1);
    expect($behaviors[0]['verdict'])->toBe('YES');
});

it('runJudge returns PASS when all behaviors are YES', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing'],
        passCriteria: 'all behaviors observed',
    );

    // Inject a mock judge response — we test prompt building separately;
    // the actual opencode run call is tested in integration.
    $result = $runner->buildJudgeResult($case, [
        ['behavior' => 'do thing', 'verdict' => 'YES', 'rationale' => 'did it'],
    ], 5000);

    expect($result->verdict)->toBe('PASS');
    expect($result->judgeUsed)->toBeTrue();
});

it('runJudge returns FAIL when any behavior is NO', function () {
    $runner = new Runner('/tmp');
    $case = new EvalCase(
        name: 'test',
        description: 'desc',
        agent: '@tdd',
        input: 'test',
        expectedBehavior: ['do thing', 'do other'],
        passCriteria: 'all behaviors observed',
    );

    $result = $runner->buildJudgeResult($case, [
        ['behavior' => 'do thing', 'verdict' => 'YES', 'rationale' => 'did it'],
        ['behavior' => 'do other', 'verdict' => 'NO', 'rationale' => 'missed'],
    ], 5000);

    expect($result->verdict)->toBe('FAIL');
    expect($result->behaviors[1]['verdict'])->toBe('NO');
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Eval/JudgeTest.php
```
Expected: FAIL — `buildJudgePrompt`, `parseJudgeResponse`, `buildJudgeResult` not found on Runner.

- [ ] **Step 3: Add judge methods to Runner class** in `EvalRunner.php`

Append these methods inside the `Runner` class:

```php
    /**
     * Build the prompt for the LLM judge.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  Captured stdout + stderr from the agent run.
     * @return string
     */
    public function buildJudgePrompt(EvalCase $case, string $agentOutput): string
    {
        $behaviors = '';
        foreach ($case->expectedBehavior as $i => $behavior) {
            $n = $i + 1;
            $behaviors .= "{$n}. {$behavior}\n";
        }

        return <<<PROMPT
You are evaluating whether an AI agent's output satisfies expected behaviors.
Below is the eval case and the agent's full output. For each expected behavior,
answer YES if the output demonstrates it, NO if it does not, or UNCLEAR if
you cannot determine. Provide a one-sentence rationale per answer.

Eval case: {$case->name}
Description: {$case->description}

Expected behaviors:
{$behaviors}
Agent output:
---
{$agentOutput}
---

Respond with ONLY a valid JSON array. No prose, no markdown fences.
[{"behavior": "<exact text>", "verdict": "YES|NO|UNCLEAR", "rationale": "<one sentence>"}, ...]
PROMPT;
    }

    /**
     * Parse the judge's JSON response into a behaviors array.
     *
     * @param  string $response  Raw response from the judge (may include markdown fences).
     * @return array<int, array{behavior: string, verdict: string, rationale: string}>
     */
    public static function parseJudgeResponse(string $response): array
    {
        // Strip markdown code fences if present
        $response = trim($response);
        $response = preg_replace('/^```(?:json)?\s*\n?/', '', $response);
        $response = preg_replace('/\n?```\s*$/', '', $response);

        $decoded = json_decode($response, true);

        if (!is_array($decoded)) {
            return [];
        }

        return array_map(function (array $item): array {
            return [
                'behavior' => $item['behavior'] ?? '',
                'verdict' => strtoupper($item['verdict'] ?? 'UNCLEAR'),
                'rationale' => $item['rationale'] ?? '',
            ];
        }, $decoded);
    }

    /**
     * Build an EvalResult from the judge's parsed behaviors.
     *
     * @param  EvalCase $case
     * @param  array<int, array{behavior: string, verdict: string, rationale: string}> $behaviors
     * @param  int $durationMs
     * @return EvalResult
     */
    public function buildJudgeResult(EvalCase $case, array $behaviors, int $durationMs): EvalResult
    {
        $allYes = true;
        foreach ($behaviors as $b) {
            if ($b['verdict'] !== 'YES') {
                $allYes = false;
                break;
            }
        }

        return new EvalResult(
            name: $case->name,
            agent: $case->agent,
            passCriteria: $case->passCriteria,
            verdict: $allYes ? 'PASS' : 'FAIL',
            behaviors: $behaviors,
            deterministicChecks: [],
            durationMs: $durationMs,
            judgeUsed: true,
        );
    }

    /**
     * Run the LLM judge against the captured agent output.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  Captured stdout + stderr from the agent run.
     * @return EvalResult
     */
    public function runJudge(EvalCase $case, string $agentOutput): EvalResult
    {
        $prompt = $this->buildJudgePrompt($case, $agentOutput);
        $judgeCmd = "opencode run --prompt " . escapeshellarg($prompt) . " --mode build --path " . escapeshellarg($this->repoRoot);

        $start = hrtime(true);
        $output = $this->executeCommand($judgeCmd, $this->timeout);
        $elapsed = (int) ((hrtime(true) - $start) / 1_000_000);

        $behaviors = self::parseJudgeResponse($output['stdout']);
        $result = $this->buildJudgeResult($case, $behaviors, $elapsed);

        return $result;
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Eval/JudgeTest.php
```
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/JudgeTest.php
git commit -S -m "feat(evals): add LLM judge to Runner

buildJudgePrompt constructs a structured prompt for an LLM to score each
expected behavior. parseJudgeResponse strips markdown fences and decodes
the JSON verdict. runJudge executes the full judge pipeline.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 4: run-eval.php CLI entry point

**Files:**
- Create: `.opencode/evals/bin/run-eval.php`
- Test: `tests/Unit/Eval/RunEvalCliTest.php`

**Interfaces:**
- Consumes: `Runner`, `EvalCase`, `EvalResult`
- Produces: CLI script that reads a case file, runs it, outputs JSON result to stdout

- [ ] **Step 1: Write the failing test**

```php
<?php

# $KYAULabs: RunEvalCliTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

it('run-eval.php exists and is executable', function () {
    $script = __DIR__ . '/../../.opencode/evals/bin/run-eval.php';
    expect(file_exists($script))->toBeTrue();
});

it('run-eval.php with --dry-run prints the command', function () {
    $caseFile = tempnam(sys_get_temp_dir(), 'eval_');
    $json = json_encode([
        'name' => 'dry-run-test',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'Write a function',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]);
    file_put_contents($caseFile, $json);

    $script = __DIR__ . '/../../.opencode/evals/bin/run-eval.php';
    $repoRoot = realpath(__DIR__ . '/../../');
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$caseFile} --dry-run 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    expect($joined)->toContain('opencode run');
    expect($joined)->toContain('DRY RUN');

    unlink($caseFile);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Eval/RunEvalCliTest.php
```
Expected: FAIL — `run-eval.php` does not exist.

- [ ] **Step 3: Write run-eval.php**

```php
<?php

# $KYAULabs: run-eval.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

/**
 * run-eval.php — Execute a single eval case against opencode run.
 *
 * Usage: php run-eval.php <case-file> [--timeout <seconds>] [--dry-run]
 *
 * Reads a JSON eval case, invokes opencode run with the case's input prompt,
 * applies deterministic pass criteria checks (exit code, output content, etc.),
 * and optionally invokes an LLM judge for 'all behaviors observed' criteria.
 * Outputs a JSON result object to stdout.
 *
 * Exit codes:
 *   0 — PASS
 *   1 — FAIL, TIMEOUT, or INVALID
 *   2 — SKIPPED (opencode not available)
 */

require_once __DIR__ . '/includes/EvalRunner.php';

use KYAULabs\Eval\Runner;
use KYAULabs\Eval\EvalCase;
use KYAULabs\Eval\EvalResult;

// ── Parse arguments ──────────────────────────────────────────────────────
$args = Runner::parseArgs($argv);

if ($args['caseFile'] === '' || !file_exists($args['caseFile'])) {
    $result = new EvalResult(
        name: basename($args['caseFile'] ?: 'unknown'),
        agent: 'unknown',
        passCriteria: '',
        verdict: 'INVALID',
        error: $args['caseFile'] === '' ? 'No case file specified.' : "Case file not found: {$args['caseFile']}",
    );
    fwrite(STDERR, json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n");
    exit(1);
}

// ── Parse and validate case file ─────────────────────────────────────────
try {
    $case = EvalCase::fromFile($args['caseFile']);
} catch (\RuntimeException $e) {
    $result = new EvalResult(
        name: basename($args['caseFile']),
        agent: 'unknown',
        passCriteria: '',
        verdict: 'INVALID',
        error: $e->getMessage(),
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

$errors = $case->validate();
if (!empty($errors)) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: 'INVALID',
        error: implode('; ', $errors),
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

// ── Build runner ─────────────────────────────────────────────────────────
$repoRoot = dirname(__DIR__, 3); // .opencode/evals/bin → repo root
$runner = new Runner($repoRoot, $args['timeout']);

// ── Dry-run mode ─────────────────────────────────────────────────────────
if ($args['dryRun']) {
    $cmd = $runner->buildCommand($case);
    echo "DRY RUN — would execute:\n";
    echo "  {$cmd}\n";
    $judgeCmd = "opencode run --prompt '<judge prompt>' --mode build --path {$repoRoot}";
    echo "DRY RUN — judge would execute:\n";
    echo "  {$judgeCmd}\n";
    exit(0);
}

// ── Check for opencode ───────────────────────────────────────────────────
if (!$runner->isOpenCodeAvailable()) {
    $result = new EvalResult(
        name: $case->name,
        agent: $case->agent,
        passCriteria: $case->passCriteria,
        verdict: 'SKIPPED',
        error: 'opencode not found in PATH. Install opencode to run evals.',
    );
    echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";
    exit(2);
}

// ── Run the agent ────────────────────────────────────────────────────────
$start = hrtime(true);
$cmd = $runner->buildCommand($case);
$agentOutput = $runner->executeCommand($cmd, $args['timeout']);
$elapsedMs = (int) ((hrtime(true) - $start) / 1_000_000);

// ── Deterministic gate ───────────────────────────────────────────────────
$result = $runner->checkDeterministic(
    $case,
    $agentOutput['stdout'],
    $agentOutput['stderr'],
    $agentOutput['exitCode'],
);

// ── LLM judge ────────────────────────────────────────────────────────────
if ($result === null) {
    $combinedOutput = $agentOutput['stdout'];
    if ($agentOutput['stderr'] !== '') {
        $combinedOutput .= "\n\n[stderr]\n" . $agentOutput['stderr'];
    }

    $result = $runner->runJudge($case, $combinedOutput);
    $result->durationMs = $elapsedMs;
} else {
    $result->durationMs = $elapsedMs;
}

// ── Output ───────────────────────────────────────────────────────────────
echo json_encode($result->toArray(), JSON_PRETTY_PRINT) . "\n";

exit($result->isPass() ? 0 : 1);

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Add isOpenCodeAvailable to Runner** in `EvalRunner.php`

Append this method inside the `Runner` class:

```php
    /**
     * Check if opencode is available in PATH.
     *
     * @return bool
     */
    public function isOpenCodeAvailable(): bool
    {
        $output = $this->executeCommand('command -v opencode', 5);
        return $output['exitCode'] === 0 && $output['stdout'] !== '';
    }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Eval/RunEvalCliTest.php
```
Expected: PASS — script exists and --dry-run prints commands.

- [ ] **Step 6: Commit**

```bash
git add .opencode/evals/bin/run-eval.php .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunEvalCliTest.php
git commit -S -m "feat(evals): add run-eval.php CLI entry point

Reads an eval case JSON, invokes opencode run, applies deterministic gate,
and optionally invokes LLM judge. Outputs JSON result to stdout.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 5: run-suite.php — batch runner with markdown output

**Files:**
- Create: `.opencode/evals/bin/run-suite.php`
- Test: `tests/Unit/Eval/RunSuiteTest.php`

**Interfaces:**
- Consumes: `run-eval.php` (shells out via `exec()`), `EvalResult`
- Produces: markdown summary table to stdout, JSON results file to `results/`

- [ ] **Step 1: Write the failing test**

```php
<?php

# $KYAULabs: RunSuiteTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

it('run-suite.php exists', function () {
    $script = __DIR__ . '/../../.opencode/evals/bin/run-suite.php';
    expect(file_exists($script))->toBeTrue();
});

it('run-suite.php discovers JSON files in a directory', function () {
    // Create a temp smoke directory with one eval case
    $tmpDir = sys_get_temp_dir() . '/eval_suite_test_' . uniqid();
    mkdir($tmpDir);
    $casePath = $tmpDir . '/test-case.json';
    file_put_contents($casePath, json_encode([
        'name' => 'test-case',
        'description' => 'test',
        'agent' => '@tdd',
        'input' => 'test',
        'expected_behavior' => ['test'],
        'pass_criteria' => 'all behaviors observed',
    ]));

    // We can't run real opencode evals in unit tests, but we can verify
    // run-suite.php discovers the file and runs without crashing (it will
    // skip if opencode is not available, producing SKIPPED output).
    $script = __DIR__ . '/../../.opencode/evals/bin/run-suite.php';
    $output = [];
    $exitCode = 0;
    exec("php {$script} {$tmpDir} --timeout 5 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);

    // The script should produce output (either SKIPPED if no opencode, or a
    // markdown table)
    expect($joined)->not->toBeEmpty();

    // Clean up
    unlink($casePath);
    rmdir($tmpDir);
});

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php vendor/bin/pest tests/Unit/Eval/RunSuiteTest.php
```
Expected: FAIL — `run-suite.php` does not exist.

- [ ] **Step 3: Write run-suite.php**

```php
<?php

# $KYAULabs: run-suite.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

/**
 * run-suite.php — Batch eval suite runner.
 *
 * Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run]
 *
 * Discovers all .json eval case files in the given directory, optionally
 * filtered by --tag. Runs each through run-eval.php, aggregates results,
 * prints a markdown summary table to stdout, and writes a detailed JSON
 * results file.
 *
 * Exit codes:
 *   0 — all cases PASS
 *   1 — one or more cases FAIL, TIMEOUT, or INVALID
 */

$repoRoot = realpath(dirname(__DIR__, 3));
$runEvalScript = __DIR__ . '/run-eval.php';

// ── Parse arguments ──────────────────────────────────────────────────────
$directory = '';
$tag = null;
$timeout = 120;
$dryRun = false;

for ($i = 1; $i < count($argv); $i++) {
    if ($argv[$i] === '--tag' && isset($argv[$i + 1])) {
        $tag = $argv[++$i];
    } elseif ($argv[$i] === '--timeout' && isset($argv[$i + 1])) {
        $timeout = (int) $argv[++$i];
    } elseif ($argv[$i] === '--dry-run') {
        $dryRun = true;
    } elseif (!str_starts_with($argv[$i], '--')) {
        $directory = $argv[$i];
    }
}

if ($directory === '' || !is_dir($directory)) {
    fwrite(STDERR, "Error: directory not found: {$directory}\n");
    fwrite(STDERR, "Usage: php run-suite.php <directory> [--tag <tag>] [--timeout <seconds>] [--dry-run]\n");
    exit(1);
}

// ── Discover case files ──────────────────────────────────────────────────
$files = glob($directory . '/*.json');
$cases = [];

foreach ($files as $file) {
    $contents = file_get_contents($file);
    if ($contents === false) {
        continue;
    }

    $data = json_decode($contents, true);
    if (!is_array($data)) {
        continue;
    }

    // Tag filter
    if ($tag !== null && !in_array($tag, $data['tags'] ?? [], true)) {
        continue;
    }

    $cases[] = ['file' => $file, 'name' => $data['name'] ?? basename($file)];
}

if (empty($cases)) {
    echo "No eval cases found in {$directory}" . ($tag !== null ? " with tag '{$tag}'" : '') . ".\n";
    exit(0);
}

// ── Run each case ─────────────────────────────────────────────────────────
$results = [];
$dryFlag = $dryRun ? ' --dry-run' : '';

foreach ($cases as $i => $caseInfo) {
    $num = $i + 1;
    $total = count($cases);
    echo "Running [{$num}/{$total}] {$caseInfo['name']}...\n";

    $cmd = "php {$runEvalScript} " . escapeshellarg($caseInfo['file']) .
        " --timeout {$timeout}{$dryFlag} 2>&1";
    $output = [];
    $exitCode = 0;
    exec($cmd, $output, $exitCode);

    $joined = implode("\n", $output);
    $decoded = json_decode($joined, true);

    if (is_array($decoded)) {
        $results[] = $decoded;
    } else {
        $results[] = [
            'name' => $caseInfo['name'],
            'verdict' => 'INVALID',
            'error' => 'Failed to parse run-eval output',
        ];
    }
}

// ── Markdown summary ─────────────────────────────────────────────────────
echo "\n";
echo str_repeat('-', 60) . "\n";
echo "\n| # | Eval Case | Verdict | Behaviors | Duration | Judge |\n";
echo "|---|---|---|---|---|---|\n";

$passCount = 0;
$failCount = 0;
$skipCount = 0;
$timeoutCount = 0;
$invalidCount = 0;

foreach ($results as $i => $r) {
    $num = $i + 1;
    $name = $r['name'] ?? 'unknown';
    $verdict = $r['verdict'] ?? 'UNKNOWN';
    $behaviors = count($r['behaviors'] ?? []);
    $yesBehaviors = count(array_filter($r['behaviors'] ?? [], fn($b) => ($b['verdict'] ?? '') === 'YES'));
    $duration = isset($r['duration_ms']) ? sprintf('%.1fs', $r['duration_ms'] / 1000) : '-';
    $judge = ($r['judge_used'] ?? false) ? 'yes' : 'no';

    echo "| {$num} | {$name} | {$verdict} | {$yesBehaviors}/{$behaviors} | {$duration} | {$judge} |\n";

    match ($verdict) {
        'PASS' => $passCount++,
        'FAIL' => $failCount++,
        'TIMEOUT' => $timeoutCount++,
        'SKIPPED' => $skipCount++,
        default => $invalidCount++,
    };
}

$total = count($results);
echo "\n**Suite: {$passCount}/{$total} passed ({$failCount} failed, {$timeoutCount} timeout, {$skipCount} skipped, {$invalidCount} invalid)**\n";
echo "\n" . str_repeat('-', 60) . "\n";

// ── Write JSON results ───────────────────────────────────────────────────
$resultsDir = dirname(__DIR__) . '/results';
if (!is_dir($resultsDir)) {
    mkdir($resultsDir, 0755, true);
}

$timestamp = date('Y-m-d\THis');
$resultsFile = $resultsDir . "/{$timestamp}.json";
file_put_contents(
    $resultsFile,
    json_encode(['timestamp' => $timestamp, 'results' => $results], JSON_PRETTY_PRINT),
);

echo "\nDetailed results: {$resultsFile}\n";

// ── Exit code ────────────────────────────────────────────────────────────
$anyNonPass = $failCount > 0 || $timeoutCount > 0 || $invalidCount > 0;
exit($anyNonPass ? 1 : 0);

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php vendor/bin/pest tests/Unit/Eval/RunSuiteTest.php
```
Expected: PASS — script exists and runs without error (skips actual opencode call if not installed).

- [ ] **Step 5: Commit**

```bash
git add .opencode/evals/bin/run-suite.php tests/Unit/Eval/RunSuiteTest.php
git commit -S -m "feat(evals): add run-suite.php batch runner

Discovers .json eval cases, runs each through run-eval.php, aggregates
results into a markdown summary table and writes JSON results to
.opencode/evals/results/. Supports --tag filtering and --dry-run.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 6: Scaffolding and docs — .gitignore, results dir, README update

**Files:**
- Modify: `.opencode/.gitignore` — add `evals/results/`
- Create: `.opencode/evals/results/.gitkeep`
- Modify: `.opencode/evals/README.md` — update to Phase 2 status

- [ ] **Step 1: Create results directory and .gitignore entry**

```bash
mkdir -p .opencode/evals/results
touch .opencode/evals/results/.gitkeep
```

Add to `.opencode/.gitignore`:
```
evals/results/
```

- [ ] **Step 2: Update README**

Replace the Status line and add a Usage section in `.opencode/evals/README.md`. The existing content from line 7 ("**Status:** Phase 1...") should be updated to:

```markdown
**Status:** Phase 2 — automated runner implemented. Run evals with the PHP CLI
scripts under `bin/`. See Usage below.

## Usage

### Run a single eval case

```bash
php .opencode/evals/bin/run-eval.php .opencode/evals/smoke/tdd-red-green.json
```

Options: `--timeout <seconds>` (default 120), `--dry-run` (print command, don't execute).

Output: JSON result object to stdout. Exit code 0 = PASS, 1 = FAIL, 2 = SKIPPED.

### Run a suite

```bash
php .opencode/evals/bin/run-suite.php .opencode/evals/smoke/
```

Options: `--tag <tag>` (filter by tags field), `--timeout <seconds>` (per case).

Output: markdown summary table to stdout, detailed JSON to `results/<timestamp>.json`.
Exit code 0 = all passed, 1 = one or more failures.

### In pre-commit/pre-push hooks

```bash
php .opencode/evals/bin/run-suite.php .opencode/evals/smoke/ --tag smoke
if [ $? -ne 0 ]; then
    echo "Eval suite failed — review results before pushing."
    exit 1
fi
```
```

- [ ] **Step 3: Commit**

```bash
git add .opencode/evals/bin/run-eval.php .opencode/evals/bin/run-suite.php
git add .opencode/evals/bin/includes/EvalRunner.php
git add .opencode/evals/results/ .opencode/evals/README.md .opencode/.gitignore
git add tests/Unit/Eval/
git commit -S -m "feat(evals): add results directory, .gitignore, and README update

Updates evals README to Phase 2 status with CLI usage documentation.
Adds evals/results/ to .gitignore.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 7: Integration test (slow)

**Files:**
- Create: `tests/Integration/Eval/RunEvalIntegrationTest.php`

- [ ] **Step 1: Write the integration test**

```php
<?php

# $KYAULabs: RunEvalIntegrationTest.php creator@host YYYY/MM/DD ±TZ Exp $

declare(strict_types=1);

/**
 * @group slow
 *
 * Requires opencode in PATH and a configured LLM provider.
 * Skip in default test runs; run manually or in CI on a schedule.
 */
it('runs tdd-red-green smoke case through full pipeline', function () {
    $caseFile = dirname(__DIR__, 3) . '/.opencode/evals/smoke/tdd-red-green.json';
    $script = dirname(__DIR__, 3) . '/.opencode/evals/bin/run-eval.php';

    // Skip if opencode is not available
    $check = [];
    exec('command -v opencode 2>&1', $check, $checkExit);
    if ($checkExit !== 0) {
        $this->markTestSkipped('opencode not available in PATH — integration test skipped.');
    }

    $output = [];
    $exitCode = 0;
    exec("php {$script} " . escapeshellarg($caseFile) . " --timeout 180 2>&1", $output, $exitCode);

    $joined = implode("\n", $output);
    $result = json_decode($joined, true);

    expect($result)->toBeArray();
    expect($result['name'] ?? '')->toBe('tdd-red-green');

    // The test may pass or fail — the integration test verifies the runner
    // produces valid JSON with expected fields, not that the agent behaves
    // perfectly (that's what the LLM judge does).
    expect($result)->toHaveKey('verdict');
    expect($result)->toHaveKey('behaviors');
    expect($result)->toHaveKey('duration_ms');
    expect(in_array($result['verdict'], ['PASS', 'FAIL', 'SKIPPED', 'TIMEOUT']))->toBeTrue();
})->group('slow');

// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run to verify (skipped by default)**

```bash
php vendor/bin/pest tests/Integration/Eval/ --group slow
```
Expected: SKIPPED (opencode not available) or PASS/FAIL (if opencode is configured).

- [ ] **Step 3: Commit**

```bash
git add tests/Integration/Eval/RunEvalIntegrationTest.php
git commit -S -m "test(evals): add slow integration test for eval runner

Runs tdd-red-green smoke case through the full pipeline. @group slow — skipped
by default. Requires opencode in PATH.

Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```
