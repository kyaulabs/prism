<?php

# $KYAULabs: EvalRunner.php SEANBR~1@KYAU-DEV 2025/07/05 -0500 Exp $

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
    ) {
    }

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
    ) {
    }

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

    /**
     * Return true if this result represents a pass.
     *
     * @return bool
     */
    public function isPass(): bool
    {
        return $this->verdict === 'PASS';
    }

    /**
     * Return true if this result represents a failure (FAIL, TIMEOUT, or INVALID).
     *
     * @return bool
     */
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
        $agent = ltrim($case->agent, '@');
        $message = escapeshellarg($case->input);
        $dir = escapeshellarg($this->repoRoot);

        return "opencode run --agent {$agent} --dir {$dir} {$message}";
    }

    /**
     * Build the opencode run command for the LLM judge pass.
     *
     * @param  EvalCase $case
     * @param  string $agentOutput  The agent's captured stdout+stderr.
     * @return string  Shell command string.
     */
    public function buildJudgeCommand(EvalCase $case, string $agentOutput): string
    {
        $prompt = $this->buildJudgePrompt($case, $agentOutput);
        $message = escapeshellarg($prompt);
        $dir = escapeshellarg($this->repoRoot);

        return "opencode run --dir {$dir} {$message}";
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
    /**
     * Execute a shell command and capture stdout, stderr, and exit code.
     *
     * Uses non-blocking pipes to interleave reads on stdout and stderr,
     * avoiding pipe-buffer deadlocks, and enforces the wall-clock
     * $timeout via proc_terminate. A cross-platform polling loop with
     * stream_select is used to wait for pipe data.
     *
     * @param  string $cmd  Shell command to execute.
     * @param  int $timeout  Timeout in seconds.
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool}
     */
    public function executeCommand(string $cmd, int $timeout): array
    {
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($cmd, $descriptors, $pipes);
        if (!is_resource($process)) {
            return ['stdout' => '', 'stderr' => "Failed to start process: {$cmd}", 'exitCode' => -1, 'timed_out' => false];
        }

        fclose($pipes[0]);

        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $status = proc_get_status($process);
        $pid = $status['pid'];

        return $this->readPipes($process, $pipes, $timeout, $pid);
    }

    /**
     * Read stdout and stderr pipes until both EOF or timeout expires.
     *
     * Uses stream_select to wait for pipe data without blocking,
     * interleaving reads on stdout and stderr to avoid pipe-buffer
     * deadlock. Enforces a wall-clock timeout via proc_terminate
     * and taskkill (Windows) to kill the process tree.
     *
     * @param  resource $process
     * @param  array{0: resource, 1: resource, 2: resource} $pipes
     * @param  int $timeout  Timeout in seconds.
     * @param  int $pid  Process ID for tree-kill on Windows.
     * @return array{stdout: string, stderr: string, exitCode: int, timed_out: bool}
     */
    private function readPipes($process, array $pipes, int $timeout, int $pid): array
    {
        $stdout = '';
        $stderr = '';
        $timedOut = false;
        $startNs = hrtime(true);
        $timeoutNs = $timeout * 1_000_000_000;

        while (true) {
            $read = [];
            $write = [];
            $except = [];
            if (!feof($pipes[1])) {
                $read[] = $pipes[1];
            }
            if (!feof($pipes[2])) {
                $read[] = $pipes[2];
            }

            if (empty($read)) {
                break;
            }

            $elapsedNs = hrtime(true) - $startNs;
            $remainingNs = $timeoutNs - $elapsedNs;

            if ($remainingNs <= 0) {
                $timedOut = true;
                break;
            }

            $remainingSec = (int) ($remainingNs / 1_000_000_000);
            $remainingUsec = (int) (($remainingNs % 1_000_000_000) / 1000);

            $ready = @stream_select($read, $write, $except, $remainingSec, $remainingUsec);

            if ($ready === false) {
                $timedOut = true;
                break;
            }

            if ($ready === 0) {
                $timedOut = true;
                break;
            }

            foreach ($read as $pipe) {
                $chunk = fread($pipe, 8192);
                if ($chunk === false || $chunk === '') {
                    continue;
                }
                if ($pipe === $pipes[1]) {
                    $stdout .= $chunk;
                } elseif ($pipe === $pipes[2]) {
                    $stderr .= $chunk;
                }
            }
        }

        if ($timedOut) {
            $this->killProcessTree($process, $pid);
            $stdout .= (string) stream_get_contents($pipes[1]);
            $stderr .= (string) stream_get_contents($pipes[2]);
        }

        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        return [
            'stdout' => trim($stdout),
            'stderr' => trim($stderr),
            'exitCode' => $exitCode,
            'timed_out' => $timedOut,
        ];
    }

    /**
     * Kill a process and its entire child tree.
     *
     * On Windows, proc_terminate only kills the shell wrapper (cmd.exe)
     * but not child processes. taskkill /t ensures the full tree is
     * terminated so stream_get_contents does not block.
     *
     * @param resource $process
     * @param int $pid
     */
    private function killProcessTree($process, int $pid): void
    {
        if (DIRECTORY_SEPARATOR === '\\') {
            exec("taskkill /f /t /pid {$pid} 2>NUL");
        }
        proc_terminate($process, 9);
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
            return null;
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
        if (count($behaviors) === 0) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                durationMs: $durationMs,
                judgeUsed: true,
                error: 'Judge returned no behaviors',
            );
        }

        if (count($behaviors) !== count($case->expectedBehavior)) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                behaviors: $behaviors,
                durationMs: $durationMs,
                judgeUsed: true,
                error: sprintf(
                    'Judge assessed %d of %d expected behaviors',
                    count($behaviors),
                    count($case->expectedBehavior),
                ),
            );
        }

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
        $judgeCmd = $this->buildJudgeCommand($case, $agentOutput);

        $start = hrtime(true);
        $output = $this->executeCommand($judgeCmd, $this->timeout);
        $elapsed = (int) ((hrtime(true) - $start) / 1_000_000);

        if ($output['timed_out']) {
            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'TIMEOUT',
                durationMs: $elapsed,
                judgeUsed: true,
                error: "Judge timed out after {$this->timeout} seconds",
            );
        }

        $behaviors = self::parseJudgeResponse($output['stdout']);

        if ($behaviors === [] && $output['stdout'] !== '') {
            $preview = mb_substr($output['stdout'], 0, 200);

            return new EvalResult(
                name: $case->name,
                agent: $case->agent,
                passCriteria: $case->passCriteria,
                verdict: 'INVALID',
                durationMs: $elapsed,
                judgeUsed: true,
                error: "Judge output is unparseable (not valid JSON): {$preview}",
            );
        }

        return $this->buildJudgeResult($case, $behaviors, $elapsed);
    }

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
}

// vim: ft=php sts=4 sw=4 ts=4 et :
