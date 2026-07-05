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
        $prompt = escapeshellarg($case->input);
        $path = escapeshellarg($this->repoRoot);

        return "opencode run --prompt {$prompt} --mode build --path {$path} " .
            '--permissions "bash: allow, edit: allow, task: allow"';
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
     * @param  string $cmd  Shell command to execute.
     * @param  int $timeout  Timeout in seconds.
     * @return array{stdout: string, stderr: string, exitCode: int}
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
}

// vim: ft=php sts=4 sw=4 ts=4 et :
